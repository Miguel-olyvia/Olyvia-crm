-- ==============================================================================
-- hr_obras_horas -- horas suplementares de "obra", registadas a mao pelo
-- responsavel de area. Conceito NOVO, separado da picagem normal.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Em BMGEST e BMCLEAN ha hoje um circuito manual em papel/Excel chamado
-- "obras": o responsavel de area regista horas suplementares feitas pelos
-- colaboradores fora da picagem normal. Isto nao existe no Olyvia. Nao e o
-- mesmo caso de `rpc_hr_picar` com origem 'manual_rh' (20261121160000): essa
-- RPC lanca uma PICAGEM -- um par entrada/saida que participa na consolidacao
-- do dia e na deteccao de desvios. Uma obra nao pica nada: e uma quantidade de
-- horas com uma referencia em texto livre (o nome/numero da obra), e entra e
-- sai do relatorio mensal sem tocar em `pessoas_picagens` nem em
-- `pessoas_horario_realizado`.
--
--
-- -- PORQUE E UMA PERMISSAO NOVA E NAO hr.assiduidade.picar.outros ------------
--
-- Registar uma obra e uma autoridade operacional distinta de picar por outra
-- pessoa: nao ha par entrada/saida, nao ha local, e o registo pode ser feito
-- muito depois do dia em causa (o responsavel de area preenche ao fim da
-- semana). is_dangerous=false porque nao e dado sensivel -- e uma quantidade
-- de horas e uma referencia de obra, nao um motivo de saude nem um IBAN.
--
--
-- -- PORQUE A ESCRITA E SO POR RPC, MESMO SEM DADO SENSIVEL --------------------
--
-- Duas RPCs e nao INSERT/UPDATE directo: registar tem de resolver a
-- organizacao a partir da pessoa (nunca confiar num organization_id que o
-- cliente envie) e validar horas>0 e descricao nao vazia ANTES de escrever;
-- anular tem de recusar uma segunda anulacao e nunca apaga a linha -- fica
-- visivel no relatorio, marcada como anulada, para auditoria. Uma politica de
-- INSERT/UPDATE genérica nao expressa as duas em conjunto.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Ligacao a uma tabela de "obras" com catalogo proprio (nome, cliente,
--   centro de custo): esta ronda so tem `descricao` em texto livre, como o
--   utilizador descreveu o circuito actual (papel/Excel). Fica para quando
--   houver decisao de produto sobre um catalogo de obras.
-- - Qualquer ligacao a retribuicao ou a pagamento de horas extra: esta tabela
--   so regista a HORA, nao calcula nem paga nada.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_obra_horas_anular(uuid, text);
--   DROP FUNCTION IF EXISTS public.rpc_hr_obra_horas_registar(uuid, date, numeric, text);
--   DROP TABLE IF EXISTS public.hr_obras_horas;
--   DELETE FROM public.anew_permissions WHERE code = 'hr.assiduidade.obras.registar';
-- Isto apaga as horas de obra registadas. Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120040000  hr_satelite_ancora_imutavel() (trigger partilhado por
--                   todos os satelites de RH -- hr_obras_horas usa-o tambem)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261121140000  catalogo hr.assiduidade.* (hr.assiduidade.view como parent)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.view') THEN
    RAISE EXCEPTION 'hr.assiduidade.view nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.view.own') THEN
    RAISE EXCEPTION 'hr.assiduidade.view.own nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.obras.registar') THEN
    RAISE EXCEPTION 'hr.assiduidade.obras.registar ja esta no catalogo. Esta migracao ja foi aplicada.';
  END IF;
END;
$guardas$;

-- ---- Catalogo: uma permissao nova ------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.assiduidade.obras.registar', 'Registar horas de obra',
   'Registar e anular horas suplementares de "obra" feitas por um colaborador fora da picagem normal -- o circuito manual de BMGEST/BMCLEAN. Nao e o mesmo que hr.assiduidade.picar.outros: nao ha picagem nenhuma aqui, so uma quantidade de horas e uma referencia de obra em texto livre. NAO e permissao perigosa: nao e dado sensivel.',
   'hr', 'hr.assiduidade.view', 620, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- hr_obras_horas
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hr_obras_horas (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id         uuid NOT NULL,
  organization_id   uuid NOT NULL,

  data              date NOT NULL,
  horas             numeric(5,2) NOT NULL,
  descricao         text NOT NULL,

  registado_por     uuid,
  anulado_em        timestamptz,
  anulado_por       uuid,
  anulado_motivo    text,

  deleted_at        timestamptz,
  deleted_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,

  CONSTRAINT hr_obras_horas_pkey PRIMARY KEY (id),
  CONSTRAINT hr_obras_horas_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT hr_obras_horas_registado_por_fkey
    FOREIGN KEY (registado_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_obras_horas_anulado_por_fkey
    FOREIGN KEY (anulado_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_obras_horas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_obras_horas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_obras_horas_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_obras_horas_horas_positivas CHECK (horas > 0),
  CONSTRAINT hr_obras_horas_descricao_nao_vazia CHECK (btrim(descricao) <> ''),
  CONSTRAINT hr_obras_horas_anulado_consistente
    CHECK ((anulado_em IS NULL) = (anulado_por IS NULL))
);

COMMENT ON TABLE public.hr_obras_horas IS
'Horas de "obra": trabalho suplementar registado a mao pelo responsavel de area, fora da picagem normal (pessoas_picagens/pessoas_horario_realizado). NAO participa na consolidacao do dia nem na deteccao de desvios -- e uma linha independente que o relatorio mensal mostra numa seccao propria. Uma linha anulada NUNCA se apaga: fica visivel, marcada por anulado_em/anulado_por/anulado_motivo, para auditoria. INSERT/UPDATE/DELETE directos estao bloqueados a authenticated: a unica escrita e por rpc_hr_obra_horas_registar e rpc_hr_obra_horas_anular (SECURITY DEFINER).';
COMMENT ON COLUMN public.hr_obras_horas.descricao IS
'Referencia/nome da obra, texto livre -- esta ronda nao tem catalogo de obras. Fica para quando houver decisao de produto sobre isso.';

CREATE INDEX IF NOT EXISTS idx_hr_obras_horas_pessoa_data
  ON public.hr_obras_horas (pessoa_id, data);
CREATE INDEX IF NOT EXISTS idx_hr_obras_horas_organization_id
  ON public.hr_obras_horas (organization_id);

DROP TRIGGER IF EXISTS trg_hr_obras_horas_updated_at ON public.hr_obras_horas;
CREATE TRIGGER trg_hr_obras_horas_updated_at
  BEFORE UPDATE ON public.hr_obras_horas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hr_obras_horas_ancora ON public.hr_obras_horas;
CREATE TRIGGER trg_hr_obras_horas_ancora
  BEFORE UPDATE ON public.hr_obras_horas
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants: escrita so por RPC ---------------------------------------------
REVOKE ALL ON TABLE public.hr_obras_horas FROM anon;
REVOKE ALL ON TABLE public.hr_obras_horas FROM authenticated;

GRANT SELECT ON TABLE public.hr_obras_horas TO authenticated;
GRANT ALL ON TABLE public.hr_obras_horas TO service_role;

ALTER TABLE public.hr_obras_horas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_obras_horas_select ON public.hr_obras_horas;
CREATE POLICY hr_obras_horas_select ON public.hr_obras_horas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
        AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
      )
    )
  );

COMMENT ON POLICY hr_obras_horas_select ON public.hr_obras_horas IS
'Ve quem tem hr.assiduidade.view NAQUELA organizacao, OU quem tem hr.assiduidade.view.own E e a propria pessoa (hr_pessoa_do_utilizador, resolvido por pessoas_contas). Uma linha anulada continua visivel a quem podia ve-la -- so o soft delete (deleted_at) a esconde.';

DROP POLICY IF EXISTS hr_obras_horas_block_insert ON public.hr_obras_horas;
CREATE POLICY hr_obras_horas_block_insert ON public.hr_obras_horas
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS hr_obras_horas_block_update ON public.hr_obras_horas;
CREATE POLICY hr_obras_horas_block_update ON public.hr_obras_horas
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hr_obras_horas_block_delete ON public.hr_obras_horas;
CREATE POLICY hr_obras_horas_block_delete ON public.hr_obras_horas
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_obras_horas_block_insert ON public.hr_obras_horas IS
'INSERT bloqueado por completo a authenticated, mesmo com hr.assiduidade.obras.registar: a unica forma de criar uma linha e rpc_hr_obra_horas_registar, que resolve a organizacao a partir da pessoa (nunca de um organization_id enviado pelo cliente) e valida horas>0 e descricao nao vazia.';
COMMENT ON POLICY hr_obras_horas_block_update ON public.hr_obras_horas IS
'UPDATE bloqueado por completo a authenticated. Anular nao e um UPDATE do cliente: e rpc_hr_obra_horas_anular, que recusa uma segunda anulacao e exige motivo.';

-- ==============================================================================
-- RPC 1: registar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_obra_horas_registar(
  p_pessoa_id uuid,
  p_data date,
  p_horas numeric,
  p_descricao text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_org_id    uuid;
  v_autor_id  uuid;
  v_novo_id   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_obra_horas_registar exige um utilizador autenticado.';
  END IF;

  IF p_pessoa_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'p_pessoa_id e p_data sao obrigatorios.';
  END IF;

  IF p_horas IS NULL OR p_horas <= 0 THEN
    RAISE EXCEPTION 'p_horas tem de ser maior que zero.';
  END IF;

  IF p_descricao IS NULL OR btrim(p_descricao) = '' THEN
    RAISE EXCEPTION 'p_descricao (a referencia da obra) nao pode ser vazia.';
  END IF;

  -- A organizacao resolve-se SEMPRE a partir da pessoa, nunca de um parametro
  -- que o cliente envie -- e o mesmo motivo de pessoas_documentos_emitir.
  -- deleted_at IS NULL: mesma disciplina de rpc_hr_ligar_conta
  -- (20261120090000) -- uma pessoa com soft delete nao resolve organizacao
  -- nenhuma, para nao permitir registar horas de obra numa ficha apagada.
  SELECT p.organization_id INTO v_org_id
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id
     AND p.deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pessoa % nao encontrada.', p_pessoa_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.obras.registar', v_org_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.assiduidade.obras.registar na organizacao desta pessoa.';
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  INSERT INTO public.hr_obras_horas (
    pessoa_id, organization_id, data, horas, descricao,
    registado_por, created_by, updated_by
  ) VALUES (
    p_pessoa_id, v_org_id, p_data, p_horas, btrim(p_descricao),
    v_autor_id, v_autor_id, v_autor_id
  )
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_obra_horas_registar(uuid, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_obra_horas_registar(uuid, date, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_obra_horas_registar(uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_obra_horas_registar(uuid, date, numeric, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_obra_horas_registar(uuid, date, numeric, text) IS
'Regista horas de obra de uma pessoa. Exige hr.assiduidade.obras.registar na organizacao DA PESSOA (resolvida pela propria funcao, nunca enviada pelo cliente). Valida p_horas > 0 e p_descricao nao vazia. SECURITY DEFINER: escreve em hr_obras_horas apesar de INSERT estar bloqueado a authenticated por politica.';

-- ==============================================================================
-- RPC 2: anular -- nunca apaga a linha
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_obra_horas_anular(
  p_obra_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth  uuid := auth.uid();
  v_obra  public.hr_obras_horas%ROWTYPE;
  v_autor_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_obra_horas_anular exige um utilizador autenticado.';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'p_motivo e obrigatorio para anular uma obra.';
  END IF;

  SELECT * INTO v_obra
    FROM public.hr_obras_horas
   WHERE id = p_obra_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_obra.id IS NULL THEN
    RAISE EXCEPTION 'Obra % nao encontrada ou apagada.', p_obra_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.obras.registar', v_obra.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.assiduidade.obras.registar na organizacao desta obra.';
  END IF;

  IF v_obra.anulado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Obra % ja esta anulada.', p_obra_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  UPDATE public.hr_obras_horas
     SET anulado_em = now(),
         anulado_por = v_autor_id,
         anulado_motivo = btrim(p_motivo),
         updated_by = v_autor_id
   WHERE id = p_obra_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_obra_horas_anular(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_obra_horas_anular(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_obra_horas_anular(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_obra_horas_anular(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_obra_horas_anular(uuid, text) IS
'Anula uma obra JA REGISTADA, sem apagar a linha -- fica visivel no relatorio mensal, marcada como anulada, para auditoria. Recusa uma segunda anulacao. Exige hr.assiduidade.obras.registar na organizacao da obra e motivo nao vazio.';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
  v_perm      record;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_obras_horas';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'hr_obras_horas ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_obras_horas'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activo em hr_obras_horas.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = 'hr_obras_horas'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem INSERT, UPDATE ou DELETE em hr_obras_horas -- devia ter zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.hr_obras_horas'::regclass
       AND t.tgname = 'trg_hr_obras_horas_ancora'
  ) THEN
    RAISE EXCEPTION 'trg_hr_obras_horas_ancora nao existe em hr_obras_horas.';
  END IF;

  SELECT * INTO v_perm FROM public.anew_permissions WHERE code = 'hr.assiduidade.obras.registar';
  IF v_perm.code IS NULL THEN
    RAISE EXCEPTION 'hr.assiduidade.obras.registar nao ficou no catalogo.';
  END IF;
  IF v_perm.is_dangerous <> false OR v_perm.category <> 'hr' OR v_perm.parent_code <> 'hr.assiduidade.view'
     OR v_perm.scope <> 'organization' THEN
    RAISE EXCEPTION 'hr.assiduidade.obras.registar nao ficou com os atributos esperados (category=hr, parent=hr.assiduidade.view, scope=organization, is_dangerous=false).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions WHERE permission_code = 'hr.assiduidade.obras.registar'
  ) THEN
    RAISE EXCEPTION 'hr.assiduidade.obras.registar ja esta atribuida a um papel. Esta migracao nao atribui permissoes.';
  END IF;

  -- 4) Teste ao vivo, contra a organizacao nike. hr.assiduidade.obras.registar
  -- e uma permissao NOVA e, por desenho (verificado acima: "nao atribuida a
  -- um papel"), esta migracao nao a atribui a ninguem -- por isso NENHUM
  -- utilizador real a tem neste preciso momento, e a tecnica de 20261201070000
  -- (procurar um uid real que ja tenha a permissao) daria sempre zero aqui.
  -- Para exercitar as RPCs a serio, e nao so a existencia delas, este bloco
  -- atribui a permissao TEMPORARIAMENTE ao papel super_admin -- o mesmo papel
  -- que 20261121270000 ja atribuiu a TODAS as hr.assiduidade.* por LIKE; esta
  -- permissao so ficou de fora porque nasceu depois dessa migracao correr.
  -- A atribuicao e desfeita, com tudo o resto, pela mesma subtransaccao
  -- implicita do BEGIN/EXCEPTION abaixo (sentinela HR900, o mesmo convencionado
  -- em 20261130180000/20261130200000/20261201030000/20261201040000/20261201070000)
  -- -- nunca fica na base depois desta migracao.
  DECLARE
    v_org_nike       uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
    v_role_id        uuid;
    v_uid_real       uuid;
    v_pessoa_teste   uuid;
    v_obra_id        uuid;
    v_row            public.hr_obras_horas%ROWTYPE;
    v_falhou_horas   boolean := false;
    v_falhou_desc    boolean := false;
    v_falhou_repetir boolean := false;
  BEGIN
    -- Um utilizador real com membership ACTIVO na nike -- qualquer papel,
    -- porque a permissao vai ser atribuida a super_admin dentro deste bloco.
    SELECT au.auth_user_id, am.role_id
      INTO v_uid_real, v_role_id
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
      JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
     WHERE am.organization_id = v_org_nike
       AND am.status = 'active'
     LIMIT 1;

    IF v_uid_real IS NULL THEN
      RAISE NOTICE 'PASSO 4 SALTADO: nenhum utilizador com membership activo e papel super_admin na nike foi encontrado -- rpc_hr_obra_horas_registar/anular nao foram exercitadas ao vivo nesta migracao (so as verificacoes estruturais acima correram).';
    ELSE
      -- Atribuicao temporaria: so dentro desta subtransaccao. anew_role_permissions
      -- tem um trigger de protecao (trg_protect_system_role_perms, 20260622114000)
      -- que so se desactiva/reactiva com ALTER TABLE -- dentro de um bloco
      -- PL/pgSQL isso exige EXECUTE, mesmo padrao usado pelas migrations que ja
      -- escrevem nesta tabela (20260622114000, 20260622181000).
      EXECUTE 'ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms';

      INSERT INTO public.anew_role_permissions (role_id, permission_code)
      VALUES (v_role_id, 'hr.assiduidade.obras.registar')
      ON CONFLICT (role_id, permission_code) DO NOTHING;

      EXECUTE 'ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms';

      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
      VALUES (v_org_nike, 'Teste Migracao', 'ObrasHoras 20261201100000')
      RETURNING id INTO v_pessoa_teste;

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      -- 4.a: registo valido -- confirma a linha criada com os valores certos.
      SELECT public.rpc_hr_obra_horas_registar(
        v_pessoa_teste, current_date, 3.5, 'Obra Teste 20261201100000'
      ) INTO v_obra_id;

      SELECT * INTO v_row FROM public.hr_obras_horas WHERE id = v_obra_id;

      IF v_row.id IS NULL
         OR v_row.pessoa_id IS DISTINCT FROM v_pessoa_teste
         OR v_row.organization_id IS DISTINCT FROM v_org_nike
         OR v_row.horas <> 3.5
         OR v_row.descricao <> 'Obra Teste 20261201100000'
         OR v_row.anulado_em IS NOT NULL THEN
        RAISE EXCEPTION 'rpc_hr_obra_horas_registar nao criou a linha como esperado (pessoa_id=%, organization_id=%, horas=%, descricao=%, anulado_em=%).',
          v_row.pessoa_id, v_row.organization_id, v_row.horas, v_row.descricao, v_row.anulado_em
          USING ERRCODE = 'HR920';
      END IF;

      -- 4.b: horas <= 0 tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_obra_horas_registar(v_pessoa_teste, current_date, 0, 'Obra invalida horas');
      EXCEPTION WHEN OTHERS THEN
        IF position('p_horas tem de ser maior que zero' IN SQLERRM) > 0 THEN
          v_falhou_horas := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_horas THEN
        RAISE EXCEPTION 'rpc_hr_obra_horas_registar nao rejeitou p_horas <= 0.' USING ERRCODE = 'HR921';
      END IF;

      -- 4.c: descricao vazia tem de ser recusada.
      BEGIN
        PERFORM public.rpc_hr_obra_horas_registar(v_pessoa_teste, current_date, 1, '   ');
      EXCEPTION WHEN OTHERS THEN
        IF position('p_descricao' IN SQLERRM) > 0 THEN
          v_falhou_desc := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_desc THEN
        RAISE EXCEPTION 'rpc_hr_obra_horas_registar nao rejeitou p_descricao vazia.' USING ERRCODE = 'HR922';
      END IF;

      -- 4.d: anular com sucesso -- a linha continua a existir, agora marcada.
      PERFORM public.rpc_hr_obra_horas_anular(v_obra_id, 'Motivo de teste 20261201100000');

      SELECT * INTO v_row FROM public.hr_obras_horas WHERE id = v_obra_id;

      IF v_row.id IS NULL
         OR v_row.anulado_em IS NULL
         OR v_row.anulado_por IS NULL
         OR v_row.anulado_motivo IS DISTINCT FROM 'Motivo de teste 20261201100000' THEN
        RAISE EXCEPTION 'rpc_hr_obra_horas_anular nao deixou a linha marcada como esperado (existe=%, anulado_em=%, anulado_por=%, anulado_motivo=%).',
          (v_row.id IS NOT NULL), v_row.anulado_em, v_row.anulado_por, v_row.anulado_motivo
          USING ERRCODE = 'HR923';
      END IF;

      -- 4.e: uma segunda anulacao da MESMA obra tem de falhar.
      BEGIN
        PERFORM public.rpc_hr_obra_horas_anular(v_obra_id, 'Segunda tentativa de anular');
      EXCEPTION WHEN OTHERS THEN
        IF position('ja esta anulada' IN SQLERRM) > 0 THEN
          v_falhou_repetir := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_repetir THEN
        RAISE EXCEPTION 'rpc_hr_obra_horas_anular aceitou anular uma obra ja anulada.' USING ERRCODE = 'HR924';
      END IF;

      RAISE NOTICE 'PASSO 4: rpc_hr_obra_horas_registar e rpc_hr_obra_horas_anular exercitadas ao vivo contra a nike (uid=%) -- sucesso, horas<=0 recusado, descricao vazia recusada, anulacao com sucesso e segunda anulacao recusada, tudo confirmado.', v_uid_real;
    END IF;

    -- Rejeicao cross-org: nao exercitada ao vivo nesta migracao. Simular um
    -- segundo auth.uid() com permissao NOUTRA organizacao exigiria fabricar
    -- membership/role_permissions dessa outra organizacao so para o teste, o
    -- que arrisca tocar em dados de organizacoes que sao so-leitura para nos
    -- (regra do workspace). A funcao resolve v_org_id a partir da PROPRIA
    -- pessoa (nunca de um organization_id enviado pelo cliente) e so depois
    -- chama has_anew_permission_in_org(v_auth, ..., v_org_id) -- a mesma
    -- forma ja usada e testada estruturalmente por toda a familia
    -- has_anew_permission_in_org (20261120010000) -- por isso este caso fica
    -- verificado so por leitura de codigo, nao ao vivo aqui.

    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'teste_hr_obras_horas_20261201100000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados/atribuicao de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes desta migracao (hr_obras_horas) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'Conferido: hr_obras_horas com RLS, 4 politicas, zero INSERT/UPDATE/DELETE directo, trigger de ancora presente, catalogo com 1 permissao nova nao atribuida, RPCs exercitadas ao vivo contra a nike quando havia super_admin disponivel.';
END;
$conferir$;
