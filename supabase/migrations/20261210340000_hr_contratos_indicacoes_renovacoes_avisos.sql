-- ==============================================================================
-- Fim de contrato (3/6): as tres tabelas do ciclo (indicacoes, renovacoes, avisos).
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (o cartao do ciclo e o ecra "contratos a terminar" leem
-- estas tabelas). Depende de 20261210330000. Sozinha so cria tabelas novas e
-- fechadas a escrita: nada do que corre hoje muda.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- Tres tabelas, todas com SELECT para quem tem hr.pessoas.vinculos.view na
-- organizacao e ESCRITA FECHADA a authenticated (so as RPCs e a rotina diaria,
-- que correm como service_role/definer, escrevem):
--
-- 1. hr_contrato_indicacoes: o que o RESPONSAVEL DIRECTO indicou sobre o fim de um
--    ciclo. Uma linha por indicacao (append-only; vale a mais recente do ciclo):
--      resposta  pretendo_continuar | nao_pretendo_continuar | ainda_por_decidir
--      ciclo_fim a data de fim do contrato NO MOMENTO da indicacao (identifica o
--                ciclo: quando o contrato e renovado a data muda e o ciclo novo
--                comeca sem indicacao)
--      indicada_por_pessoa_id / indicada_por_user_id / indicada_em: quem e quando.
--    O responsavel NAO renova nada: so indica. Quem decide e o RH.
--
-- 2. hr_contrato_renovacoes: cada vez que um contrato foi prolongado (automatica
--    ou manual) ou convertido em sem termo ao atingir o limite:
--      numero, tipo (automatica | manual | conversao_sem_termo),
--      data_fim_anterior, data_fim_nova (NULL na conversao), feita_em, feita_por
--      (NULL = o sistema), motivo.
--
-- 3. hr_contrato_avisos: o livro dos avisos enviados, para nao duplicar:
--      ciclo_fim, marco (antecedencia | sete_dias | dia_fim | pos_fim |
--      pos_fim_diario), referencia (a data a que o aviso se refere: o fim do ciclo
--      nos tres primeiros e no pos_fim; o proprio dia no pos_fim_diario),
--      destino (responsavel | rh), destinatario_user_id (uid de login),
--      notification_id, estado (enviado | sem_destinatario | falhou), erro.
--    Indice unico (vinculo, ciclo, marco, referencia, destino, destinatario)
--    SEM os registos falhados: um aviso que falhou volta a tentar-se na noite
--    seguinte.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) As chaves estrangeiras compostas (vinculo_id, pessoa_id, organization_id)
--    impedem apontar para um contrato de outra pessoa ou organizacao.
-- b) ON DELETE CASCADE no contrato: os contratos nao se apagam (soft delete), mas
--    se se apagarem por servico o rasto vai com eles.
-- c) Esta migration so se aplica ao branch de RH.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta. A mao: DROP TABLE das tres tabelas.
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos (UNIQUE (id, pessoa_id, organization_id))
--   20261120030000  pessoas (UNIQUE (id, organization_id))
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL OR to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'pessoas e pessoas_vinculos tem de existir.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'renovacoes_realizadas'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.renovacoes_realizadas nao existe. Aplicar 20261210330000 primeiro.';
  END IF;

  IF to_regclass('public.hr_contrato_indicacoes') IS NOT NULL
     OR to_regclass('public.hr_contrato_renovacoes') IS NOT NULL
     OR to_regclass('public.hr_contrato_avisos') IS NOT NULL THEN
    RAISE EXCEPTION 'Alguma das tabelas hr_contrato_indicacoes, hr_contrato_renovacoes ou hr_contrato_avisos ja existe -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Indicacoes do responsavel directo
-- ==============================================================================
CREATE TABLE public.hr_contrato_indicacoes (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL,
  pessoa_id               uuid NOT NULL,
  vinculo_id              uuid NOT NULL,
  ciclo_fim               date NOT NULL,
  resposta                text NOT NULL,
  indicada_por_pessoa_id  uuid NOT NULL,
  indicada_por_user_id    uuid,
  indicada_em             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_contrato_indicacoes_pkey PRIMARY KEY (id),
  CONSTRAINT hr_contrato_indicacoes_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id) ON DELETE CASCADE,
  CONSTRAINT hr_contrato_indicacoes_responsavel_fkey
    FOREIGN KEY (indicada_por_pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id),
  CONSTRAINT hr_contrato_indicacoes_user_fkey
    FOREIGN KEY (indicada_por_user_id) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_contrato_indicacoes_resposta_valida CHECK (
    resposta IN ('pretendo_continuar', 'nao_pretendo_continuar', 'ainda_por_decidir')
  )
);

COMMENT ON TABLE public.hr_contrato_indicacoes IS
'O que o RESPONSAVEL DIRECTO (pessoas.reporta_a_pessoa_id) indicou sobre o fim de um ciclo de contrato: pretendo_continuar, nao_pretendo_continuar ou ainda_por_decidir. Append-only: vale a linha mais recente do mesmo (vinculo_id, ciclo_fim). O responsavel so indica; nao renova nem termina nada: quem decide e o RH. Escrita so pela RPC rpc_hr_contrato_indicar. Leitura: hr.pessoas.vinculos.view (o responsavel le o minimo pela RPC rpc_hr_contratos_do_responsavel, nao por aqui). Desde 20261210340000.';
COMMENT ON COLUMN public.hr_contrato_indicacoes.ciclo_fim IS
'A data de fim do contrato no momento da indicacao: identifica o ciclo. Quando o contrato e renovado a data de fim muda e o ciclo novo comeca sem indicacao.';

CREATE INDEX idx_hr_contrato_indicacoes_ciclo
  ON public.hr_contrato_indicacoes (vinculo_id, ciclo_fim, indicada_em DESC);
CREATE INDEX idx_hr_contrato_indicacoes_organization
  ON public.hr_contrato_indicacoes (organization_id);

-- ==============================================================================
-- 2. Renovacoes
-- ==============================================================================
CREATE TABLE public.hr_contrato_renovacoes (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  pessoa_id          uuid NOT NULL,
  vinculo_id         uuid NOT NULL,
  numero             integer NOT NULL,
  tipo               text NOT NULL,
  data_fim_anterior  date NOT NULL,
  data_fim_nova      date,
  feita_em           timestamptz NOT NULL DEFAULT now(),
  feita_por          uuid,
  motivo             text,

  CONSTRAINT hr_contrato_renovacoes_pkey PRIMARY KEY (id),
  CONSTRAINT hr_contrato_renovacoes_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id) ON DELETE CASCADE,
  CONSTRAINT hr_contrato_renovacoes_user_fkey
    FOREIGN KEY (feita_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_contrato_renovacoes_numero_positivo CHECK (numero >= 0),
  CONSTRAINT hr_contrato_renovacoes_tipo_valido CHECK (tipo IN ('automatica', 'manual', 'conversao_sem_termo')),
  CONSTRAINT hr_contrato_renovacoes_data_coerente CHECK (
    (tipo = 'conversao_sem_termo' AND data_fim_nova IS NULL)
    OR (tipo <> 'conversao_sem_termo' AND data_fim_nova IS NOT NULL AND data_fim_nova > data_fim_anterior)
  )
);

COMMENT ON TABLE public.hr_contrato_renovacoes IS
'Cada vez que um contrato com prazo foi prolongado (tipo automatica, pela rotina diaria; ou manual, pelo RH) ou convertido em sem termo ao atingir o limite de renovacoes (conversao_sem_termo). Renovar PROLONGA O MESMO CONTRATO (a data de fim avanca), nao cria um contrato novo. numero = renovacoes_realizadas depois da operacao (na conversao, o valor no momento); data_fim_anterior e data_fim_nova (NULL na conversao) sao o de/para; feita_por e o anew_users.id de quem renovou (NULL = o sistema). Escrita so pelo motor (RPCs e rotina). Desde 20261210340000.';

CREATE INDEX idx_hr_contrato_renovacoes_vinculo
  ON public.hr_contrato_renovacoes (vinculo_id, feita_em DESC);
CREATE INDEX idx_hr_contrato_renovacoes_organization
  ON public.hr_contrato_renovacoes (organization_id);

-- ==============================================================================
-- 3. O livro dos avisos
-- ==============================================================================
CREATE TABLE public.hr_contrato_avisos (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL,
  pessoa_id              uuid NOT NULL,
  vinculo_id             uuid NOT NULL,
  ciclo_fim              date NOT NULL,
  marco                  text NOT NULL,
  referencia             date NOT NULL,
  destino                text NOT NULL,
  destinatario_user_id   uuid,
  notification_id        uuid,
  estado                 text NOT NULL,
  erro                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_contrato_avisos_pkey PRIMARY KEY (id),
  CONSTRAINT hr_contrato_avisos_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id) ON DELETE CASCADE,
  CONSTRAINT hr_contrato_avisos_marco_valido CHECK (
    marco IN ('antecedencia', 'sete_dias', 'dia_fim', 'pos_fim', 'pos_fim_diario')
  ),
  CONSTRAINT hr_contrato_avisos_destino_valido CHECK (destino IN ('responsavel', 'rh')),
  CONSTRAINT hr_contrato_avisos_estado_valido CHECK (estado IN ('enviado', 'sem_destinatario', 'falhou')),
  CONSTRAINT hr_contrato_avisos_enviado_tem_destinatario CHECK (
    estado <> 'enviado' OR (destinatario_user_id IS NOT NULL AND notification_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.hr_contrato_avisos IS
'O livro dos avisos de fim de contrato enviados (notificacoes da app, type hr_contrato_fim), por ciclo: evita duplicar e mostra o que foi avisado. marco: antecedencia (X dias antes do fim), sete_dias, dia_fim, pos_fim (o dia a seguir ao fim, uma vez, ao RH) e pos_fim_diario (todos os dias, ao RH, quando o limite de renovacoes foi atingido e a decisao e manual). estado: enviado, sem_destinatario (nem responsavel nem RH com conta) ou falhou (o erro fica em erro; os falhados voltam a tentar-se na noite seguinte). Escrita so pela rotina diaria. Desde 20261210340000.';
COMMENT ON COLUMN public.hr_contrato_avisos.referencia IS
'A data a que o aviso se refere: o fim do ciclo (antecedencia, sete_dias, dia_fim, pos_fim) ou o proprio dia (pos_fim_diario, que repete todos os dias).';
COMMENT ON COLUMN public.hr_contrato_avisos.destinatario_user_id IS
'O uid de login (auth) do destinatario, o mesmo de notifications.user_id. NULL em sem_destinatario.';

CREATE UNIQUE INDEX hr_contrato_avisos_unico
  ON public.hr_contrato_avisos (
    vinculo_id, ciclo_fim, marco, referencia, destino,
    (coalesce(destinatario_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  WHERE estado <> 'falhou';

CREATE INDEX idx_hr_contrato_avisos_vinculo
  ON public.hr_contrato_avisos (vinculo_id, created_at DESC);
CREATE INDEX idx_hr_contrato_avisos_organization
  ON public.hr_contrato_avisos (organization_id);

-- ==============================================================================
-- 4. RLS e privilegios das tres: SELECT para vinculos.view, escrita fechada
-- ==============================================================================
DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_contrato_indicacoes', 'hr_contrato_renovacoes', 'hr_contrato_avisos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), %L, organization_id)))',
      t || '_select', t, 'hr.pessoas.vinculos.view');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_block_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)',
      t || '_block_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_block_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false)',
      t || '_block_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_block_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)',
      t || '_block_delete', t);
  END LOOP;
END;
$rls$;

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  t      text;
  v_n    integer;
  v_priv text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_contrato_indicacoes', 'hr_contrato_renovacoes', 'hr_contrato_avisos'] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.' || t)) THEN
      RAISE EXCEPTION 'RLS nao esta activa em %.', t;
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF v_n <> 4 THEN
      RAISE EXCEPTION '% ficou com % politicas, esperavam-se 4.', t, v_n;
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT'
       AND qual LIKE '%hr.pessoas.vinculos.view%';
    IF v_n <> 1 THEN
      RAISE EXCEPTION '% devia ter UMA politica de SELECT com hr.pessoas.vinculos.view; tem %.', t, v_n;
    END IF;

    SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type) INTO v_priv
      FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public' AND g.table_name = t AND g.grantee = 'authenticated';
    IF v_priv IS DISTINCT FROM 'SELECT' THEN
      RAISE EXCEPTION '%: authenticated tem "%", esperava-se exactamente SELECT.', t, coalesce(v_priv, '(nenhum)');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = t AND g.grantee = 'anon'
    ) THEN
      RAISE EXCEPTION '% ficou com grant a anon.', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'hr_contrato_avisos_unico'
       AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%falhou%'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial hr_contrato_avisos_unico nao ficou como esperado.';
  END IF;

  RAISE NOTICE 'OK: hr_contrato_indicacoes, hr_contrato_renovacoes e hr_contrato_avisos com RLS, 4 politicas, so SELECT para authenticated e o indice unico do livro.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_pessoa    uuid;
  v_chefe     uuid;
  v_vinculo   uuid;
  v_cons      text;
  v_sqlstate  text;
  v_dest      uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo das tabelas do ciclo foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210340000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210340000 chefe -- apagar', v_cargo, current_date)
    RETURNING id INTO v_chefe;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao, reporta_a_pessoa_id)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210340000 -- apagar', v_cargo, current_date, v_chefe)
    RETURNING id INTO v_pessoa;

    INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado)
    VALUES (v_pessoa, v_org_nike, 'termo_certo', current_date, current_date + 60, 'activo')
    RETURNING id INTO v_vinculo;

    -- 1. Uma indicacao valida e aceite; uma resposta fora do dominio e recusada.
    INSERT INTO public.hr_contrato_indicacoes
      (organization_id, pessoa_id, vinculo_id, ciclo_fim, resposta, indicada_por_pessoa_id)
    VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'pretendo_continuar', v_chefe);

    v_cons := NULL;
    BEGIN
      INSERT INTO public.hr_contrato_indicacoes
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, resposta, indicada_por_pessoa_id)
      VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'talvez', v_chefe);
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_contrato_indicacoes_resposta_valida' THEN
      RAISE EXCEPTION 'Uma resposta invalida devia ser recusada por hr_contrato_indicacoes_resposta_valida; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR966';
    END IF;

    -- 2. Uma renovacao valida; a conversao com data nova e recusada.
    INSERT INTO public.hr_contrato_renovacoes
      (organization_id, pessoa_id, vinculo_id, numero, tipo, data_fim_anterior, data_fim_nova)
    VALUES (v_org_nike, v_pessoa, v_vinculo, 1, 'automatica', current_date + 60, current_date + 150);

    v_cons := NULL;
    BEGIN
      INSERT INTO public.hr_contrato_renovacoes
        (organization_id, pessoa_id, vinculo_id, numero, tipo, data_fim_anterior, data_fim_nova)
      VALUES (v_org_nike, v_pessoa, v_vinculo, 2, 'conversao_sem_termo', current_date + 150, current_date + 200);
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_contrato_renovacoes_data_coerente' THEN
      RAISE EXCEPTION 'Uma conversao com data nova devia ser recusada por hr_contrato_renovacoes_data_coerente; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR966';
    END IF;

    -- 3. O livro: o mesmo aviso nao se grava duas vezes; um falhado nao bloqueia.
    INSERT INTO public.hr_contrato_avisos
      (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, destinatario_user_id, notification_id, estado)
    VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'antecedencia', current_date + 60, 'rh', v_dest, gen_random_uuid(), 'enviado');

    v_sqlstate := NULL;
    BEGIN
      INSERT INTO public.hr_contrato_avisos
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, destinatario_user_id, notification_id, estado)
      VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'antecedencia', current_date + 60, 'rh', v_dest, gen_random_uuid(), 'enviado');
    EXCEPTION WHEN unique_violation THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM '23505' THEN
      RAISE EXCEPTION 'O mesmo aviso duas vezes devia dar unique_violation; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR966';
    END IF;

    INSERT INTO public.hr_contrato_avisos
      (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, destinatario_user_id, estado, erro)
    VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'antecedencia', current_date + 60, 'rh', v_dest, 'falhou', 'erro de teste');

    -- 4. sem_destinatario repetido (destinatario NULL) tambem e recusado pelo coalesce do indice.
    INSERT INTO public.hr_contrato_avisos
      (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, estado)
    VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'sete_dias', current_date + 60, 'rh', 'sem_destinatario');

    v_sqlstate := NULL;
    BEGIN
      INSERT INTO public.hr_contrato_avisos
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, estado)
      VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'sete_dias', current_date + 60, 'rh', 'sem_destinatario');
    EXCEPTION WHEN unique_violation THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM '23505' THEN
      RAISE EXCEPTION 'Dois sem_destinatario iguais deviam dar unique_violation; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR966';
    END IF;

    -- 5. Um enviado sem destinatario e recusado.
    v_cons := NULL;
    BEGIN
      INSERT INTO public.hr_contrato_avisos
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, estado)
      VALUES (v_org_nike, v_pessoa, v_vinculo, current_date + 60, 'dia_fim', current_date + 60, 'rh', 'enviado');
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_contrato_avisos_enviado_tem_destinatario' THEN
      RAISE EXCEPTION 'Um enviado sem destinatario devia ser recusado por hr_contrato_avisos_enviado_tem_destinatario; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR966';
    END IF;

    RAISE EXCEPTION 'teste_hr_contratos_tabelas_ciclo_20261210340000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo das tabelas do ciclo falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): indicacao valida aceite e invalida recusada; renovacao e conversao coerentes; livro sem duplicados (com e sem destinatario), falhados nao bloqueiam. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; entra no mesmo commit que os ecras.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked). Nunca migration repair.
-- 3. Correr os testes ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- ==============================================================================
