-- ==============================================================================
-- hr_codigos_processamento -- fim da nocao de codigo TRANSVERSAL.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261201190000 criou hr_codigos_processamento com dois codigos
-- TRANSVERSAIS (organization_id NULL, "100" e "200"), partilhados por todo o
-- grupo, e organization_id NULLABLE para os suportar. Decisao de produto:
-- acabar com isso -- cada organizacao passa a ter o seu proprio catalogo,
-- sem excepcao nenhuma. organization_id deixa de ser nullable.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- Para cada um dos dois codigos transversais existentes, decide-se ao APLICAR
-- esta migracao (nao ao escreve-la), contando quantas organizacoes distintas
-- tem lancamentos (hr_processamento_lancamentos, 20261201230000, incluindo
-- anulados) a apontar para ele:
--
--   0 organizacoes  -> o codigo transversal e APAGADO (nunca foi usado).
--   1 organizacao   -> o codigo e ADOPTADO por essa organizacao (o seu
--                      organization_id passa a ser o dela). Falha antes se
--                      essa organizacao ja tiver um codigo proprio com o
--                      mesmo texto (colidiria com a UNIQUE nova).
--   >1 organizacoes -> RAISE EXCEPTION a listar as organizacoes. Nao ha
--                      decisao automatica possivel -- fica para investigar
--                      e decidir a mao antes de reaplicar.
--
-- Verificado contra o remoto (ramo lqrtnxrhoojcddjfeqcb) em 2026-09-17, como
-- utilizador autenticado real (chave publicavel, select apenas): 0
-- lancamentos a apontar para "100" ou para "200", em qualquer organizacao
-- visivel a esse utilizador (a unica organizacao com membership real nesse
-- ramo e a nike -- hr_processamento_lancamentos e uma tabela nova, sem seed
-- nenhum a referenciar estes codigos). A decisao esperada ao aplicar e por
-- isso DELETE para os dois -- mas a migracao decide sempre pela contagem
-- real no momento do push, nunca por este numero escrito aqui.
--
-- organization_id passa a NOT NULL, com UNIQUE(organization_id, codigo) a
-- substituir os dois indices parciais de 20261201190000 (que existiam
-- precisamente para tratar NULL como transversal).
--
--
-- -- O QUE FICA DE FORA, DE PROPOSITO -------------------------------------------
--
-- - rpc_hr_processamento_lancamento_criar (20261201230000) NAO se toca. O seu
--   ramo `(c.organization_id IS NULL OR c.organization_id = v_periodo.organization_id)`
--   fica CODIGO MORTO de proposito -- com organization_id NOT NULL o lado
--   esquerdo nunca e verdade, mas o lado direito continua a fazer exactamente
--   o que sempre fez. Reescrever a RPC so para remover um ramo morto nao
--   muda comportamento nenhum e arrisca mais do que ganha.
-- - Nenhum calculo novo, nenhuma ligacao a assiduidade.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO SE NENHUM
-- codigo tiver sido adoptado/apagado de forma irreversivel na pratica (a
-- adopcao e reversivel; o DELETE de um codigo transversal sem uso nao e,
-- mas por definicao nao tinha uso nenhum):
--   ALTER TABLE public.hr_codigos_processamento ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE public.hr_codigos_processamento DROP CONSTRAINT hr_codigos_processamento_org_codigo_unico;
--   CREATE UNIQUE INDEX hr_codigos_processamento_transversal_codigo_key ON public.hr_codigos_processamento (codigo) WHERE organization_id IS NULL;
--   CREATE UNIQUE INDEX hr_codigos_processamento_org_codigo_key ON public.hr_codigos_processamento (organization_id, codigo) WHERE organization_id IS NOT NULL;
-- Recriar as politicas de 20261201190000 a mao, e devolver organization_id a
-- NULL nos codigos adoptados (perdido quem foi adoptado por quem, a nao ser
-- que se tenha guardado nota disso a parte).
--
--
-- Prerequisitos:
--   20261201190000  hr_codigos_processamento, os dois indices parciais
--   20261120010000  has_anew_permission_in_org(uuid,text,uuid)
--   20261201230000  hr_processamento_lancamentos (opcional -- ver guardas)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_nullable text;
BEGIN
  IF to_regclass('public.hr_codigos_processamento') IS NULL THEN
    RAISE EXCEPTION 'public.hr_codigos_processamento nao existe. Aplicar 20261201190000 primeiro.';
  END IF;

  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento'
     AND column_name = 'organization_id';

  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'hr_codigos_processamento.organization_id nao foi encontrada -- investigar antes de aplicar.';
  ELSIF v_nullable = 'NO' THEN
    RAISE EXCEPTION 'hr_codigos_processamento.organization_id ja e NOT NULL -- esta migracao ja foi aplicada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento'
     AND indexname = 'hr_codigos_processamento_transversal_codigo_key'
  ) THEN
    RAISE EXCEPTION 'Falta o indice hr_codigos_processamento_transversal_codigo_key (20261201190000) -- investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento'
     AND indexname = 'hr_codigos_processamento_org_codigo_key'
  ) THEN
    RAISE EXCEPTION 'Falta o indice hr_codigos_processamento_org_codigo_key (20261201190000) -- investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  RAISE NOTICE 'Guardas passadas: hr_codigos_processamento existe, organization_id ainda nullable, indices parciais antigos presentes, has_anew_permission_in_org existe.';
END;
$guardas$;

-- ==============================================================================
-- 1. Adoptar ou apagar cada codigo transversal, conforme quem o usa AGORA.
-- ==============================================================================
DO $adopcao$
DECLARE
  v_codigo          RECORD;
  v_orgs_distintas  integer;
  v_org_unica       uuid;
  v_lista_orgs      text;
BEGIN
  FOR v_codigo IN
    SELECT id, codigo FROM public.hr_codigos_processamento WHERE organization_id IS NULL
  LOOP
    IF to_regclass('public.hr_processamento_lancamentos') IS NULL THEN
      v_orgs_distintas := 0;
    ELSE
      SELECT count(DISTINCT l.organization_id) INTO v_orgs_distintas
        FROM public.hr_processamento_lancamentos l
       WHERE l.codigo_processamento_id = v_codigo.id;
    END IF;

    IF v_orgs_distintas = 0 THEN
      DELETE FROM public.hr_codigos_processamento WHERE id = v_codigo.id;
      RAISE NOTICE 'Codigo transversal "%" (id=%) APAGADO -- nenhum lancamento em hr_processamento_lancamentos o usa.',
        v_codigo.codigo, v_codigo.id;

    ELSIF v_orgs_distintas = 1 THEN
      SELECT DISTINCT l.organization_id INTO v_org_unica
        FROM public.hr_processamento_lancamentos l
       WHERE l.codigo_processamento_id = v_codigo.id;

      IF EXISTS (
        SELECT 1 FROM public.hr_codigos_processamento c2
         WHERE c2.organization_id = v_org_unica AND c2.codigo = v_codigo.codigo AND c2.id <> v_codigo.id
      ) THEN
        RAISE EXCEPTION
          'A organizacao % ja tem um codigo proprio com o texto "%" -- nao se pode adoptar o codigo transversal % (id=%) sem colidir. Resolver a mao (renomear um dos dois) antes de reaplicar.',
          v_org_unica, v_codigo.codigo, v_codigo.codigo, v_codigo.id;
      END IF;

      UPDATE public.hr_codigos_processamento SET organization_id = v_org_unica WHERE id = v_codigo.id;
      RAISE NOTICE 'Codigo transversal "%" (id=%) ADOPTADO pela organizacao % -- unica organizacao com lancamentos nesse codigo.',
        v_codigo.codigo, v_codigo.id, v_org_unica;

    ELSE
      SELECT string_agg(DISTINCT l.organization_id::text, ', ') INTO v_lista_orgs
        FROM public.hr_processamento_lancamentos l
       WHERE l.codigo_processamento_id = v_codigo.id;

      RAISE EXCEPTION
        'O codigo transversal "%" (id=%) tem lancamentos em % organizacoes distintas (%) -- nao se pode adoptar automaticamente. Investigar e decidir a mao antes de reaplicar esta migracao.',
        v_codigo.codigo, v_codigo.id, v_orgs_distintas, v_lista_orgs;
    END IF;
  END LOOP;
END;
$adopcao$;

-- ==============================================================================
-- 2. Apertar o modelo: organization_id obrigatorio, UNIQUE em vez dos dois
--    indices parciais.
-- ==============================================================================
ALTER TABLE public.hr_codigos_processamento
  ALTER COLUMN organization_id SET NOT NULL;

DROP INDEX IF EXISTS public.hr_codigos_processamento_transversal_codigo_key;
DROP INDEX IF EXISTS public.hr_codigos_processamento_org_codigo_key;

ALTER TABLE public.hr_codigos_processamento
  ADD CONSTRAINT hr_codigos_processamento_org_codigo_unico UNIQUE (organization_id, codigo);

-- ==============================================================================
-- 3. Politicas: SELECT/INSERT/UPDATE so com has_anew_permission_in_org --
--    o ramo de organization_id IS NULL (has_anew_permission sem organizacao)
--    deixa de fazer sentido nenhum. DELETE (RESTRICTIVE) fica exactamente
--    como estava.
-- ==============================================================================
DROP POLICY IF EXISTS hr_codigos_processamento_select ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_select ON public.hr_codigos_processamento
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.view', organization_id))
  );

DROP POLICY IF EXISTS hr_codigos_processamento_insert ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_insert ON public.hr_codigos_processamento
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.gerir', organization_id))
  );

DROP POLICY IF EXISTS hr_codigos_processamento_update ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_update ON public.hr_codigos_processamento
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.gerir', organization_id))
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.gerir', organization_id))
  );

-- hr_codigos_processamento_block_delete (RESTRICTIVE, USING (false)) nao se
-- toca -- continua exactamente a de 20261201190000.

-- ==============================================================================
-- 4. Comentarios: ja nao ha nocao de transversal.
-- ==============================================================================
COMMENT ON TABLE public.hr_codigos_processamento IS
'Catalogo de codigos de processamento salarial, PROPRIO de cada organizacao (organization_id obrigatorio, UNIQUE por organizacao+codigo desde 20261201250000). Ate essa migracao existiam codigos TRANSVERSAIS partilhados por todo o grupo (organization_id NULL) -- essa nocao acabou por decisao de produto: os que estavam em uso foram adoptados pela organizacao que os usava, os que nao estavam foram apagados. SO CATALOGO: sem calculo nenhum ligado a assiduidade nesta versao.';

COMMENT ON COLUMN public.hr_codigos_processamento.organization_id IS
'Organizacao proprietaria do codigo. Obrigatorio desde 20261201250000 -- ja nao existe a nocao de codigo transversal (organization_id NULL).';

-- ---- Conferir: estrutural ----------------------------------------------------
DO $conferir_estrutura$
DECLARE
  v_n           integer;
  v_privilegios text;
  v_notnull     boolean;
BEGIN
  SELECT attnotnull INTO v_notnull
    FROM pg_attribute
   WHERE attrelid = 'public.hr_codigos_processamento'::regclass
     AND attname = 'organization_id';
  IF NOT coalesce(v_notnull, false) THEN
    RAISE EXCEPTION 'hr_codigos_processamento.organization_id continua nullable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento'
     AND indexname IN ('hr_codigos_processamento_transversal_codigo_key', 'hr_codigos_processamento_org_codigo_key')
  ) THEN
    RAISE EXCEPTION 'Os indices parciais antigos de hr_codigos_processamento ainda existem -- deviam ter sido largados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_codigos_processamento_org_codigo_unico'
       AND conrelid = 'public.hr_codigos_processamento'::regclass
       AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'Falta a constraint UNIQUE hr_codigos_processamento_org_codigo_unico.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'hr_codigos_processamento ficou com % politicas, esperavam-se 4.', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento'
       AND (coalesce(qual, '') LIKE '%has_anew_permission(%' OR coalesce(with_check, '') LIKE '%has_anew_permission(%')
  ) THEN
    RAISE EXCEPTION 'Uma politica de hr_codigos_processamento ainda chama has_anew_permission( de 2 argumentos -- devia usar so has_anew_permission_in_org.';
  END IF;

  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento' AND grantee = 'authenticated';
  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'hr_codigos_processamento: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento' AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'hr_codigos_processamento ficou com grant a anon.';
  END IF;

  RAISE NOTICE 'Verificacoes estruturais passadas: organization_id NOT NULL, indices antigos ausentes, constraint UNIQUE presente, 4 politicas sem has_anew_permission(2 args), grants exactos.';
END;
$conferir_estrutura$;

-- ---- Conferir: RLS ao vivo, contra a organizacao nike ------------------------
DO $conferir_rls$
DECLARE
  v_org_nike        uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_uid_real        uuid;
  v_org_outra       uuid;
  v_codigo_outra_id uuid;
  v_codigo_nike_id  uuid;
  v_n               integer;
  v_row_count       integer;
  v_falhou_cross_org boolean := false;
  v_falhou_delete    boolean := false;
  v_falhou_unique    boolean := false;
BEGIN
  SELECT au.auth_user_id
    INTO v_uid_real
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
    JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
   WHERE am.organization_id = v_org_nike
     AND am.status = 'active'
   LIMIT 1;

  IF v_uid_real IS NULL THEN
    RAISE NOTICE 'CONFERIR RLS SALTADO: nenhum utilizador com membership activo e papel super_admin na nike foi encontrado -- as politicas novas de hr_codigos_processamento nao foram exercitadas ao vivo nesta migracao (so as verificacoes estruturais acima correram).';
    RETURN;
  END IF;

  BEGIN
    -- Fixtures, ainda como dono da tabela (bypassa RLS) -- uma organizacao
    -- descartavel com um codigo proprio dela, so para provar que a nike NAO
    -- os ve nem os pode escrever.
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261201250000__')
    RETURNING id INTO v_org_outra;

    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome)
    VALUES (v_org_outra, 'ZZZ_OUTRA_20261201250000', 'Codigo de outra organizacao (fixture de teste)')
    RETURNING id INTO v_codigo_outra_id;

    -- A partir daqui corre como `authenticated`, autenticado como o
    -- super_admin real da nike -- e assim que a RLS e mesmo exercitada. Sem
    -- mudar de role, este bloco continuava a correr como dono da tabela e
    -- nao passava por RLS nenhuma (nao estamos a testar uma RPC
    -- SECURITY DEFINER, estamos a testar as politicas directamente).
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

    -- 1) SELECT: a nike nunca ve o codigo de outra organizacao.
    SELECT count(*) INTO v_n
      FROM public.hr_codigos_processamento
     WHERE id = v_codigo_outra_id;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'SELECT como authenticated/nike viu um codigo de outra organizacao -- a politica de SELECT nao esta a filtrar.' USING ERRCODE = 'HR951';
    END IF;

    -- 2) INSERT: um codigo proprio da nike tem de ser aceite.
    INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome)
    VALUES (v_org_nike, 'ZZZ_NIKE_20261201250000', 'Codigo de teste da nike')
    RETURNING id INTO v_codigo_nike_id;

    IF v_codigo_nike_id IS NULL THEN
      RAISE EXCEPTION 'INSERT de um codigo proprio da nike nao foi aceite.' USING ERRCODE = 'HR952';
    END IF;

    -- 3) INSERT cross-org: organization_id de OUTRA organizacao tem de ser
    -- recusado pela RLS (WITH CHECK).
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome)
      VALUES (v_org_outra, 'ZZZ_CROSS_20261201250000', 'Tentativa cross-org');
      v_falhou_cross_org := false;
    EXCEPTION WHEN OTHERS THEN
      v_falhou_cross_org := true;
    END;
    IF NOT v_falhou_cross_org THEN
      RAISE EXCEPTION 'INSERT com organization_id de outra organizacao foi aceite -- a politica de INSERT nao esta a bloquear.' USING ERRCODE = 'HR953';
    END IF;

    -- 4) UPDATE: a nike consegue actualizar o seu proprio codigo.
    UPDATE public.hr_codigos_processamento
       SET nome = 'Codigo de teste da nike (actualizado)'
     WHERE id = v_codigo_nike_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'UPDATE do proprio codigo da nike nao afectou 1 linha (afectou %).', v_row_count USING ERRCODE = 'HR954';
    END IF;

    -- 5) DELETE: bloqueado em DOIS niveis -- authenticated nunca teve GRANT
    -- DELETE nesta tabela (so INSERT,SELECT,UPDATE, ver 20261201190000), por
    -- isso o esperado e "permission denied for table" (42501) ANTES de a
    -- politica RESTRICTIVE entrar em jogo. Aceita tambem 0 linhas afectadas
    -- sem erro, para o caso de o GRANT alguma vez vir a mudar -- a garantia
    -- que importa e nao haver DELETE nenhum a passar, seja qual for a
    -- camada que o bloqueia.
    BEGIN
      DELETE FROM public.hr_codigos_processamento WHERE id = v_codigo_nike_id;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_falhou_delete := (v_row_count = 0);
    EXCEPTION WHEN insufficient_privilege THEN
      v_falhou_delete := true;
    END;
    IF NOT v_falhou_delete THEN
      RAISE EXCEPTION 'DELETE nao foi bloqueado -- nem pelo GRANT nem pela politica RESTRICTIVE.' USING ERRCODE = 'HR955';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.hr_codigos_processamento WHERE id = v_codigo_nike_id) THEN
      RAISE EXCEPTION 'O codigo de teste da nike desapareceu apos o DELETE bloqueado -- nao devia.' USING ERRCODE = 'HR956';
    END IF;

    -- 6) UNIQUE: um segundo codigo com o MESMO texto na MESMA organizacao
    -- tem de ser recusado pela constraint nova (nao pela RLS).
    BEGIN
      INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome)
      VALUES (v_org_nike, 'ZZZ_NIKE_20261201250000', 'Codigo repetido');
      v_falhou_unique := false;
    EXCEPTION WHEN unique_violation THEN
      v_falhou_unique := true;
    END;
    IF NOT v_falhou_unique THEN
      RAISE EXCEPTION 'Um segundo codigo com o mesmo texto na mesma organizacao foi aceite -- a constraint UNIQUE nova nao esta a bloquear.' USING ERRCODE = 'HR957';
    END IF;

    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', NULL, true);

    RAISE NOTICE 'CONFERIR RLS: SELECT so devolve linhas da nike, INSERT proprio aceite, INSERT cross-org recusado, UPDATE aceite, DELETE recusado pela RESTRICTIVE, segundo INSERT com o mesmo codigo recusado pela UNIQUE nova. Tudo desfeito a seguir (org e codigos de teste, uid=%).', v_uid_real;

    RAISE EXCEPTION 'teste_hr_codigos_processamento_sem_transversais_20261201250000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, tudo desfeito pela subtransaccao implicita (role incluido).
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes de RLS desta migracao (hr_codigos_processamento) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;
END;
$conferir_rls$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr `supabase migration list --linked` e confirmar a ordem de
--    aplicacao real contra o remoto imediatamente antes de empurrar.
-- 2. Correr os testes de vitest tocados (ConfiguracaoVencimento,
--    useCodigosProcessamento) ANTES deste push -- e aqui, contra o estado
--    ANTIGO, que o vermelho legitimo aparece.
-- 3. O ecra (React), o hook e os testes entram no MESMO commit, fora do SQL.
-- ==============================================================================
