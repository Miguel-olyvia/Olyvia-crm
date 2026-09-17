-- ==============================================================================
-- hr_periodos_processamento -- o ciclo de vida do periodo mensal de
-- "Processamento Salarial" (nome de apresentacao; dominio interno continua
-- "vencimento"): um periodo por organizacao por mes, aberto -> fechado.
--
-- POR APLICAR. NAO CORRER `supabase db push` -- fica para revisao de base de
-- dados e de seguranca antes de ser aplicado.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- FASE 1 do dominio de processamento: abrir o mes, ver o resumo por pessoa
-- (reaproveitando `useRelatorioAssiduidadeMensal`, sem recalcular nada) e
-- fechar o mes -- a partir daí nada muda sem deixar rasto. O RECIBO em si e a
-- EXPORTACAO ficam para a FASE 2, fora de ambito aqui.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha por (organization_id, ano, mes) -- UNIQUE. `estado` comeca
-- 'aberto' e so pode passar a 'fechado' pela RPC
-- `rpc_hr_processamento_periodo_fechar`. Uma vez 'fechado', um UPDATE directo
-- que tente devolver a 'aberto' e recusado por TRIGGER, nao so por RLS: e o
-- mesmo raciocinio de "ancora imutavel" ja usado nos outros satelites de RH
-- (`hr_satelite_ancora_imutavel`, 20261120040000), mas aqui e uma trigger
-- PROPRIA porque a coluna protegida (`estado`) e a condicao ("so nesta
-- direccao") sao especificas deste dominio.
--
-- REABERTURA COM AUDITORIA: por decisao explicita desta ronda, NAO se
-- constroi uma accao de "reabrir" auditada. Fica documentado como PENDENTE de
-- decisao de produto (ver `vault\registo-trabalho.md`) -- nao e uma omissao
-- silenciosa. Hoje, uma vez fechado, um periodo so volta a abrir-se por
-- intervencao directa na base (fora da aplicacao), o que e deliberadamente
-- desconfortavel.
--
--
-- -- ESCRITA: RPC PARA ABRIR/FECHAR, NAO POLITICA DE INSERT/UPDATE ------------
--
-- `hr_periodos_processamento` bloqueia INSERT/UPDATE/DELETE directos a
-- `authenticated` (RESTRICTIVE false, mesmo padrao de `hr_obras_horas`,
-- 20261201100000). As duas RPCs (`rpc_hr_processamento_periodo_abrir`,
-- `rpc_hr_processamento_periodo_fechar`) sao SECURITY DEFINER e verificam a
-- permissao explicitamente antes de escrever -- uma politica generica de
-- INSERT/UPDATE nao conseguiria expressar "so pode fechar quem esta aberto" e
-- "nunca reabrir" ao mesmo tempo que valida ano/mes.
--
--
-- -- PERMISSOES ------------------------------------------------------------
--
--   hr.processamento.periodo.view    ver o(s) periodo(s) e o seu estado
--   hr.processamento.periodo.gerir   abrir e fechar periodos (is_dangerous)
--
-- Parent hr.pessoas.retribuicao.view -- mesma arvore de "o que uma pessoa
-- ganha" que hr.vencimento.* ja usa (20261201180000). NENHUMA atribuicao a
-- papel aqui, de proposito -- mesmo padrao de hr.vencimento.*; uma migracao
-- SEPARADA atribui as tres permissoes novas deste dominio (periodo + lançamentos)
-- ao super_admin (20261201240000).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O recibo (documento/PDF entregue a pessoa) e a exportacao: FASE 2.
-- - Reabertura auditada de um periodo fechado: decisao de produto pendente,
--   ver acima.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- 20261201230000 (hr_processamento_lancamentos, que referencia esta tabela)
-- estar revertida:
--   DROP FUNCTION IF EXISTS public.rpc_hr_processamento_periodo_fechar(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint);
--   DROP FUNCTION IF EXISTS public.hr_processamento_periodo_imutavel_fechado();
--   DROP TABLE IF EXISTS public.hr_periodos_processamento;
--   DELETE FROM public.anew_permissions WHERE code LIKE 'hr.processamento.periodo.%';
-- Isto apaga o historico de periodos abertos/fechados. Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120020000  catalogo hr.* (parent_code 'hr.pessoas.retribuicao.view')
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao esta no catalogo -- parent_code invalido. Aplicar 20261120020000 primeiro.';
  END IF;

  IF to_regclass('public.hr_periodos_processamento') IS NOT NULL THEN
    RAISE EXCEPTION 'public.hr_periodos_processamento ja existe. Esta migracao ja foi aplicada.';
  END IF;
END;
$guardas$;

-- ---- Catalogo: duas permissoes novas ----------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.processamento.periodo.view', 'Ver periodos de processamento salarial',
   'Ver o(s) periodo(s) mensais de processamento salarial da organizacao e o seu estado (aberto/fechado), incluindo o resumo por pessoa e os lancamentos pontuais desse periodo.',
   'hr', 'hr.pessoas.retribuicao.view', 740, false, 'organization', false),

  ('hr.processamento.periodo.gerir', 'Abrir e fechar periodos de processamento salarial',
   'PERIGOSA. Abrir um periodo mensal novo e fecha-lo -- a partir de fechado, nada muda sem deixar rasto (fase 1: sem reabertura auditada ainda). Afecta o processamento de TODA a organizacao nesse mes, nao a ficha de uma pessoa so.',
   'hr', 'hr.processamento.periodo.view', 750, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- hr_periodos_processamento
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hr_periodos_processamento (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  -- ON DELETE RESTRICT, nao CASCADE: hr_processamento_lancamentos
  -- (20261201230000) referencia este periodo com ON DELETE RESTRICT tambem
  -- -- um DELETE de organizacao com lancamentos existentes tem de parar aqui,
  -- de forma explicita, em vez de rebentar a meio da cascata quando chega a
  -- lancamentos. Dados financeiros nao devem desaparecer em silencio por
  -- apagar a organizacao.
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,

  ano               smallint NOT NULL,
  mes               smallint NOT NULL,
  estado            text NOT NULL DEFAULT 'aberto',

  fechado_em        timestamptz,
  fechado_por       uuid REFERENCES public.anew_users (id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_periodos_processamento_pkey PRIMARY KEY (id),
  -- Unique composta (id, organization_id): permite que hr_processamento_lancamentos
  -- (20261201230000) tenha uma FK composta contra este periodo, obrigando
  -- lancamento e periodo a partilharem organizacao -- mesmo desenho de
  -- pessoas_vinculos_horas / pessoas_vinculos (id, pessoa_id, organization_id).
  CONSTRAINT hr_periodos_processamento_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT hr_periodos_processamento_org_ano_mes_key UNIQUE (organization_id, ano, mes),
  CONSTRAINT hr_periodos_processamento_mes_valido CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT hr_periodos_processamento_ano_razoavel CHECK (ano BETWEEN 2000 AND 2100),
  CONSTRAINT hr_periodos_processamento_estado_valido CHECK (estado IN ('aberto', 'fechado')),
  -- Depende SO de fechado_em, nao de fechado_por: fechado_por e FK
  -- ON DELETE SET NULL (auditoria best-effort). Se dependesse de fechado_por,
  -- apagar o utilizador que fechou o periodo violava este CHECK e o DELETE
  -- em anew_users falhava em bruto.
  CONSTRAINT hr_periodos_processamento_fechado_consistente
    CHECK ((estado = 'fechado') = (fechado_em IS NOT NULL))
);

COMMENT ON TABLE public.hr_periodos_processamento IS
'O ciclo de vida do periodo mensal de processamento salarial: um periodo por (organization_id, ano, mes). Comeca "aberto"; so a RPC rpc_hr_processamento_periodo_fechar o passa a "fechado", e nunca volta a "aberto" por UPDATE directo (trigger trg_hr_periodos_processamento_imutavel). INSERT/UPDATE/DELETE directos estao bloqueados a authenticated -- a unica escrita e por rpc_hr_processamento_periodo_abrir e rpc_hr_processamento_periodo_fechar (SECURITY DEFINER).';

-- Sem indice proprio para organization_id: o unique
-- hr_periodos_processamento_org_ano_mes_key (organization_id, ano, mes) ja
-- lidera por organization_id e serve as mesmas consultas.

CREATE INDEX IF NOT EXISTS idx_hr_periodos_processamento_fechado_por
  ON public.hr_periodos_processamento (fechado_por);
CREATE INDEX IF NOT EXISTS idx_hr_periodos_processamento_created_by
  ON public.hr_periodos_processamento (created_by);

-- ---- Trigger: nunca reabrir por UPDATE directo ------------------------------
CREATE OR REPLACE FUNCTION public.hr_processamento_periodo_imutavel_fechado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.estado = 'fechado' THEN
    IF NEW.estado = 'aberto' THEN
      RAISE EXCEPTION 'Um periodo fechado nunca volta a "aberto" por UPDATE directo -- reabertura auditada fica por construir (decisao de produto pendente).'
        USING ERRCODE = '22000';
    END IF;

    IF NEW.fechado_em IS DISTINCT FROM OLD.fechado_em
       OR NEW.ano IS DISTINCT FROM OLD.ano
       OR NEW.mes IS DISTINCT FROM OLD.mes
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Um periodo fechado e imutavel: nem estado, fechado_em, ano, mes ou organization_id podem mudar por UPDATE directo.'
        USING ERRCODE = '22000';
    END IF;

    -- fechado_por: protegido, EXCEPTO a transicao OLD IS NOT NULL -> NEW IS
    -- NULL. fechado_por e FK ON DELETE SET NULL para anew_users -- se esse
    -- utilizador for apagado, o Postgres tenta por fechado_por = NULL nesta
    -- linha, e essa e a UNICA forma legitima de mudar depois de fechado
    -- (vinda da cascata da FK, nao de uma edicao arbitraria). Qualquer outra
    -- mudanca a fechado_por (reintroduzir um valor, ou trocar por outro
    -- utilizador) continua recusada.
    IF NEW.fechado_por IS DISTINCT FROM OLD.fechado_por
       AND NOT (OLD.fechado_por IS NOT NULL AND NEW.fechado_por IS NULL) THEN
      RAISE EXCEPTION 'Um periodo fechado e imutavel: fechado_por so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de anew_users.'
        USING ERRCODE = '22000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_processamento_periodo_imutavel_fechado() IS
'Guarda de imutabilidade: uma vez hr_periodos_processamento.estado = "fechado", recusa qualquer UPDATE que tente devolve-lo a "aberto" e recusa qualquer alteracao a fechado_em, ano, mes ou organization_id dessa linha. fechado_por e um caso especial: e FK ON DELETE SET NULL para anew_users, por isso a UNICA transicao permitida depois de fechado e de preenchido para NULL (a cascata que corre quando esse utilizador e apagado) -- qualquer outra mudanca a fechado_por continua recusada. SECURITY INVOKER: so le OLD/NEW, nao precisa de privilegios elevados. Nao substitui uma accao de reabertura auditada -- essa fica por construir, decisao de produto pendente.';

DROP TRIGGER IF EXISTS trg_hr_periodos_processamento_imutavel ON public.hr_periodos_processamento;
CREATE TRIGGER trg_hr_periodos_processamento_imutavel
  BEFORE UPDATE ON public.hr_periodos_processamento
  FOR EACH ROW EXECUTE FUNCTION public.hr_processamento_periodo_imutavel_fechado();

-- ---- Grants: escrita so por RPC ---------------------------------------------
REVOKE ALL ON TABLE public.hr_periodos_processamento FROM anon;
REVOKE ALL ON TABLE public.hr_periodos_processamento FROM authenticated;

GRANT SELECT ON TABLE public.hr_periodos_processamento TO authenticated;
GRANT ALL ON TABLE public.hr_periodos_processamento TO service_role;

ALTER TABLE public.hr_periodos_processamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_periodos_processamento_select ON public.hr_periodos_processamento;
CREATE POLICY hr_periodos_processamento_select ON public.hr_periodos_processamento
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.processamento.periodo.view', organization_id))
  );

COMMENT ON POLICY hr_periodos_processamento_select ON public.hr_periodos_processamento IS
'Ve quem tem hr.processamento.periodo.view NAQUELA organizacao.';

DROP POLICY IF EXISTS hr_periodos_processamento_block_insert ON public.hr_periodos_processamento;
CREATE POLICY hr_periodos_processamento_block_insert ON public.hr_periodos_processamento
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS hr_periodos_processamento_block_update ON public.hr_periodos_processamento;
CREATE POLICY hr_periodos_processamento_block_update ON public.hr_periodos_processamento
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hr_periodos_processamento_block_delete ON public.hr_periodos_processamento;
CREATE POLICY hr_periodos_processamento_block_delete ON public.hr_periodos_processamento
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_periodos_processamento_block_insert ON public.hr_periodos_processamento IS
'INSERT bloqueado por completo a authenticated: a unica forma de abrir um periodo e rpc_hr_processamento_periodo_abrir.';
COMMENT ON POLICY hr_periodos_processamento_block_update ON public.hr_periodos_processamento IS
'UPDATE bloqueado por completo a authenticated: a unica forma de fechar um periodo e rpc_hr_processamento_periodo_fechar. Mesmo bloqueado, a trigger trg_hr_periodos_processamento_imutavel fica como segunda camada contra reabertura, incluindo por service_role.';

-- ==============================================================================
-- RPC 1: abrir
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_processamento_periodo_abrir(
  p_organization_id uuid,
  p_ano smallint,
  p_mes smallint
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_autor_id  uuid;
  v_novo_id   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_periodo_abrir exige um utilizador autenticado.';
  END IF;

  IF p_organization_id IS NULL OR p_ano IS NULL OR p_mes IS NULL THEN
    RAISE EXCEPTION 'p_organization_id, p_ano e p_mes sao obrigatorios.';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'p_mes tem de estar entre 1 e 12.';
  END IF;

  IF p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'p_ano tem de estar entre 2000 e 2100.';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.gerir', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.periodo.gerir nesta organizacao.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hr_periodos_processamento
     WHERE organization_id = p_organization_id AND ano = p_ano AND mes = p_mes
  ) THEN
    RAISE EXCEPTION 'Ja existe um periodo de processamento para %/% nesta organizacao.', p_mes, p_ano;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, created_by)
  VALUES (p_organization_id, p_ano, p_mes, 'aberto', v_autor_id)
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) IS
'Abre o periodo mensal de processamento salarial de uma organizacao. Exige hr.processamento.periodo.gerir em p_organization_id. Recusa um segundo periodo para o mesmo (organizacao, ano, mes).';

-- ==============================================================================
-- RPC 2: fechar -- irreversivel nesta fase (ver cabecalho: sem reabertura auditada)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_processamento_periodo_fechar(
  p_periodo_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth     uuid := auth.uid();
  v_periodo  public.hr_periodos_processamento%ROWTYPE;
  v_autor_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_periodo_fechar exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento
   WHERE id = p_periodo_id
   FOR UPDATE;

  -- A verificacao de permissao corre logo depois do FOR UPDATE, ANTES de
  -- qualquer RAISE EXCEPTION que revele se a linha existe ou o seu estado --
  -- assim quem nao tem hr.processamento.periodo.gerir nesta organizacao nao
  -- distingue "periodo inexistente" de "periodo ja fechado" por enumeracao.
  -- Quando o periodo nao existe, v_periodo.organization_id fica NULL e
  -- has_anew_permission_in_org devolve false com organizacao NULL (o "="
  -- interno nunca casa com NULL) -- por isso cai sempre no mesmo erro de
  -- permissao, nunca no "nao encontrado", para quem nao tem a permissao.
  IF NOT public.has_anew_permission_in_org(
    v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id
  ) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.periodo.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado.', p_periodo_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  UPDATE public.hr_periodos_processamento
     SET estado = 'fechado',
         fechado_em = now(),
         fechado_por = v_autor_id
   WHERE id = p_periodo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid) IS
'Fecha um periodo de processamento salarial JA ABERTO. Exige hr.processamento.periodo.gerir na organizacao do periodo. Recusa fechar um periodo ja fechado. Irreversivel nesta fase: sem reabertura auditada (ver COMMENT da trigger trg_hr_periodos_processamento_imutavel).';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_periodos_processamento';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'hr_periodos_processamento ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_periodos_processamento'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activo em hr_periodos_processamento.';
  END IF;

  IF has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'DELETE')
     OR has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated tem INSERT, UPDATE, DELETE ou TRUNCATE em hr_periodos_processamento -- devia ter zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.hr_periodos_processamento'::regclass
       AND t.tgname = 'trg_hr_periodos_processamento_imutavel'
  ) THEN
    RAISE EXCEPTION 'trg_hr_periodos_processamento_imutavel nao existe em hr_periodos_processamento.';
  END IF;

  IF (SELECT count(*) FROM public.anew_permissions WHERE code LIKE 'hr.processamento.periodo.%') <> 2 THEN
    RAISE EXCEPTION 'Esperavam-se 2 codigos hr.processamento.periodo.%%.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions WHERE permission_code LIKE 'hr.processamento.periodo.%'
  ) THEN
    RAISE EXCEPTION 'Um codigo hr.processamento.periodo.%% ja esta atribuido a um papel -- esta migracao so cria catalogo/tabela/RPCs.';
  END IF;

  -- 4) Teste ao vivo, contra a organizacao nike. hr.processamento.periodo.gerir
  -- e uma permissao NOVA e, por desenho (verificado acima: "nao atribuida a
  -- um papel"), esta migracao nao a atribui a ninguem -- por isso NENHUM
  -- utilizador real a tem neste preciso momento. Para exercitar as RPCs a
  -- serio, este bloco atribui a permissao TEMPORARIAMENTE ao papel
  -- super_admin, mesmo padrao de 20261201100000 (hr_obras_horas). A
  -- atribuicao e desfeita, com tudo o resto, pela mesma subtransaccao
  -- implicita do BEGIN/EXCEPTION abaixo (sentinela HR900) -- nunca fica na
  -- base depois desta migracao. Usa-se ano=2099 para nao colidir com
  -- periodos reais.
  DECLARE
    v_org_nike       uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
    v_role_id        uuid;
    v_uid_real       uuid;
    v_periodo_id     uuid;
    v_row            public.hr_periodos_processamento%ROWTYPE;
    v_falhou_repetir_abrir  boolean := false;
    v_falhou_repetir_fechar boolean := false;
  BEGIN
    SELECT au.auth_user_id, am.role_id
      INTO v_uid_real, v_role_id
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
      JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
     WHERE am.organization_id = v_org_nike
       AND am.status = 'active'
     LIMIT 1;

    IF v_uid_real IS NULL THEN
      RAISE NOTICE 'PASSO 4 SALTADO: nenhum utilizador com membership activo e papel super_admin na nike foi encontrado -- rpc_hr_processamento_periodo_abrir/fechar nao foram exercitadas ao vivo nesta migracao (so as verificacoes estruturais acima correram).';
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_protect_system_role_perms'
           AND tgrelid = to_regclass('public.anew_role_permissions')
      ) THEN
        RAISE EXCEPTION
          'O trigger trg_protect_system_role_perms nao existe. Este bloco desactiva-o e reactiva-o; sem ele o estado nao e o esperado.';
      END IF;

      EXECUTE 'ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms';

      INSERT INTO public.anew_role_permissions (role_id, permission_code)
      VALUES (v_role_id, 'hr.processamento.periodo.gerir')
      ON CONFLICT (role_id, permission_code) DO NOTHING;

      EXECUTE 'ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms';

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      -- 4.a: abrir com sucesso -- confirma a linha criada 'aberto'.
      -- 2099::smallint, 1::smallint: a assinatura da RPC e (uuid, smallint,
      -- smallint) e int4->int2 e so "assignment", nao "implicit" -- sem o
      -- cast explicito o PostgreSQL nao resolve a chamada com literais
      -- integer e falha com "function does not exist".
      SELECT public.rpc_hr_processamento_periodo_abrir(v_org_nike, 2099::smallint, 1::smallint) INTO v_periodo_id;

      SELECT * INTO v_row FROM public.hr_periodos_processamento WHERE id = v_periodo_id;

      IF v_row.id IS NULL
         OR v_row.organization_id IS DISTINCT FROM v_org_nike
         OR v_row.ano <> 2099
         OR v_row.mes <> 1
         OR v_row.estado <> 'aberto' THEN
        RAISE EXCEPTION 'rpc_hr_processamento_periodo_abrir nao criou o periodo como esperado (organization_id=%, ano=%, mes=%, estado=%).',
          v_row.organization_id, v_row.ano, v_row.mes, v_row.estado
          USING ERRCODE = 'HR930';
      END IF;

      -- 4.b: abrir uma segunda vez o mesmo (organizacao, ano, mes) tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_abrir(v_org_nike, 2099::smallint, 1::smallint);
      EXCEPTION WHEN OTHERS THEN
        IF position('Ja existe um periodo de processamento' IN SQLERRM) > 0 THEN
          v_falhou_repetir_abrir := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_repetir_abrir THEN
        RAISE EXCEPTION 'rpc_hr_processamento_periodo_abrir aceitou abrir um segundo periodo para o mesmo (organizacao, ano, mes).' USING ERRCODE = 'HR931';
      END IF;

      -- 4.c: fechar com sucesso -- confirma estado, fechado_em e fechado_por.
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_periodo_id);

      SELECT * INTO v_row FROM public.hr_periodos_processamento WHERE id = v_periodo_id;

      IF v_row.id IS NULL
         OR v_row.estado <> 'fechado'
         OR v_row.fechado_em IS NULL THEN
        RAISE EXCEPTION 'rpc_hr_processamento_periodo_fechar nao deixou o periodo fechado como esperado (estado=%, fechado_em=%).',
          v_row.estado, v_row.fechado_em
          USING ERRCODE = 'HR932';
      END IF;

      -- 4.d: fechar uma segunda vez o mesmo periodo tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_periodo_id);
      EXCEPTION WHEN OTHERS THEN
        IF position('ja esta fechado' IN SQLERRM) > 0 THEN
          v_falhou_repetir_fechar := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_repetir_fechar THEN
        RAISE EXCEPTION 'rpc_hr_processamento_periodo_fechar aceitou fechar um periodo ja fechado.' USING ERRCODE = 'HR933';
      END IF;

      RAISE NOTICE 'PASSO 4: rpc_hr_processamento_periodo_abrir e rpc_hr_processamento_periodo_fechar exercitadas ao vivo contra a nike (uid=%) -- abrir com sucesso, segunda abertura recusada, fechar com sucesso, segundo fecho recusado, tudo confirmado.', v_uid_real;
    END IF;

    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'teste_hr_periodos_processamento_20261201220000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados/atribuicao de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes desta migracao (hr_periodos_processamento) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: hr_periodos_processamento com 4 politicas, RLS activo, zero grants de escrita a authenticated, trigger de imutabilidade, catalogo com 2 codigos sem atribuicao a papel, RPCs exercitadas ao vivo contra a nike quando havia super_admin disponivel.';
END;
$conferir$;
