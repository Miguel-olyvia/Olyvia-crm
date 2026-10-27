-- =============================================================================
-- teste-revogar-update-nif.sql — prova da parte C da migration
-- 20261231600000_nif_e_dono_da_pessoa: authenticated deixa de poder fazer
-- UPDATE directo a anew_entities.nif_hash, nif_encrypted e nif_last3.
-- ESCRITO, NAO CORRIDO.
--
-- So base RH (uetjghdkwbywbftedtth). Nunca a principal, nunca a Mudelar.
-- NAO ESCREVE NADA: os UPDATE apontam para um id que nao existe (0 linhas) e
-- o que se prova e a recusa de PRIVILEGIO, que o Postgres verifica antes de
-- procurar linhas (e antes da RLS). Mesmo assim o bloco acaba SEMPRE com
-- RAISE EXCEPTION (TESTE_OK ou FALHOU) e corre dentro de BEGIN ... ROLLBACK.
--
-- Ordem (regra do projecto):
--   1. ANTES do db push, contra a RH ainda por corrigir: e o vermelho.
--      Esperado: FALHOU C1 (authenticated ainda actualiza as tres colunas) e
--      FALHOU C4 (o UPDATE directo a nif_hash passa, com 0 linhas).
--   2. db push da 20261231600000.
--   3. de novo, contra a RH ja corrigida: TESTE_OK.
--   Nunca se volta a dar o UPDATE a authenticated para repetir o vermelho.
--   Tambem se pode correr antes do push numa so ligacao, como o
--   teste-nif-e-dono: BEGIN; <migration 600000>; <este ficheiro>; ROLLBACK;
--
-- Contrato novo (opcao (a), decisao do utilizador 26/10): a RPC passa a ser
-- neg_guardar_nif_pessoa(p_actor_auth_uid, p_organization_id, p_entity_id,
-- p_nif, p_nif_hash, p_nif_encrypted) e SO service_role a executa. Este
-- ficheiro prova tambem esse lado (C5 catalogo, C6 comportamento): o
-- utilizador autenticado nao tem nenhum caminho directo para escrever o NIF,
-- nem por UPDATE nem pela RPC. No vermelho (antes do push) o bloco para em
-- C1; se C1 a C4 passassem, C5 falharia por a funcao ainda nao existir.
--
-- A escrita do NIF pela funcao DEFINER neg_guardar_nif_pessoa, chamada como
-- service_role com o actor por parametro, prova-se em
-- TESTE-teste-nif-e-dono.sql (casos A), que se corre na mesma ligacao a
-- seguir a migration.
--
-- NAO VERIFICADO (so se sabe a correr): que billing_nif_encrypted e
-- billing_nif_last3 existem e sao hoje actualizaveis por authenticated (o
-- cabecalho da 600000 diz que ficam de fora por decisao de ambito; C3 so
-- confirma que a migration nao lhes tocou, e salta-as se a coluna nao
-- existir).
-- =============================================================================
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $teste$
DECLARE
  k_org      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  k_inexist  constant uuid := '00000000-0000-4000-8000-0000000000fe';
  k_assin    constant text := 'public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text)';
  v_auth     uuid;
  v_n        bigint;
  v_col      text;
  v_erro     text;
BEGIN
  -- ---------------------------------------------------------------------------
  -- C1. Catalogo: nem authenticated nem anon actualizam as tres colunas
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_n
  FROM unnest(ARRAY['nif_hash', 'nif_encrypted', 'nif_last3']) AS k(col)
  WHERE has_column_privilege('authenticated', 'public.anew_entities'::text, k.col, 'UPDATE')
     OR has_column_privilege('anon', 'public.anew_entities'::text, k.col, 'UPDATE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU C1: authenticated ou anon ainda actualiza % das colunas nif_*.', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- C2. Sem UPDATE ao nivel da tabela (que anularia o REVOKE por coluna), e as
  --     leituras como estavam: nif_last3 legivel (neg_ficha_pessoa e INVOKER),
  --     nif_hash e nif_encrypted nao legiveis
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) a
  WHERE c.oid = 'public.anew_entities'::regclass
    AND a.privilege_type::text = 'UPDATE'
    AND (a.grantee = 0 OR a.grantee IN ('authenticated'::regrole::oid, 'anon'::regrole::oid));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU C2: ha UPDATE de tabela em anew_entities para PUBLIC, anon ou authenticated (% entradas).', v_n;
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.anew_entities'::text, 'nif_last3'::text, 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU C2: authenticated deixou de ler nif_last3.';
  END IF;
  IF has_column_privilege('authenticated', 'public.anew_entities'::text, 'nif_hash'::text, 'SELECT')
     OR has_column_privilege('authenticated', 'public.anew_entities'::text, 'nif_encrypted'::text, 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU C2: authenticated le nif_hash ou nif_encrypted.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- C3. A revogacao nao levou outras colunas: display_name continua
  --     actualizavel, e billing_nif_* (fora de ambito) tambem, se existirem
  -- ---------------------------------------------------------------------------
  IF NOT has_column_privilege('authenticated', 'public.anew_entities'::text, 'display_name'::text, 'UPDATE') THEN
    RAISE EXCEPTION 'FALHOU C3: authenticated perdeu o UPDATE de display_name.';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['billing_nif_encrypted', 'billing_nif_last3'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = 'public.anew_entities'::regclass
                 AND a.attname::text = v_col AND a.attnum > 0 AND NOT a.attisdropped)
       AND NOT has_column_privilege('authenticated', 'public.anew_entities'::text, v_col, 'UPDATE') THEN
      RAISE EXCEPTION 'FALHOU C3: authenticated perdeu o UPDATE de % (fora do ambito desta migration).', v_col;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- C4. Comportamento: como authenticated, com o JWT de um membro activo da
  --     nike (sub = anew_users.auth_user_id), o UPDATE directo a cada coluna
  --     nif_* e recusado por privilegio; o de display_name nao (controlo: a
  --     recusa vem da coluna e nao da tabela ou da RLS). 0 linhas em todos.
  -- ---------------------------------------------------------------------------
  SELECT au.auth_user_id INTO v_auth
  FROM public.anew_memberships m
  JOIN public.anew_users au ON au.id = m.user_id
  WHERE m.organization_id = k_org
    AND m.status = 'active'
    AND m.role_is_client IS NOT TRUE
    AND au.auth_user_id IS NOT NULL
  ORDER BY m.user_id
  LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'FALHOU 0: nenhum membro activo da nike com auth_user_id.';
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  FOREACH v_col IN ARRAY ARRAY['nif_hash', 'nif_encrypted', 'nif_last3'] LOOP
    v_erro := NULL;
    BEGIN
      EXECUTE format('UPDATE public.anew_entities SET %I = NULL WHERE id = $1 AND organization_id = $2', v_col)
        USING k_inexist, k_org;
    EXCEPTION WHEN insufficient_privilege THEN v_erro := 'ok';
    END;
    IF v_erro IS NULL THEN
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'FALHOU C4: authenticated pode fazer UPDATE directo a anew_entities.%.', v_col;
    END IF;
  END LOOP;

  v_erro := NULL;
  BEGIN
    UPDATE public.anew_entities e SET display_name = e.display_name
    WHERE e.id = k_inexist AND e.organization_id = k_org;
  EXCEPTION WHEN insufficient_privilege THEN v_erro := 'recusado';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU C4 (controlo): o UPDATE de display_name tambem foi recusado; a recusa nao prova nada sobre as colunas nif_*.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- C5. Catalogo: a RPC existe so com a assinatura nova; authenticated e anon
  --     SEM EXECUTE, service_role COM; ACL explicita so com service_role e o
  --     dono (nada para PUBLIC)
  -- ---------------------------------------------------------------------------
  IF to_regprocedure(k_assin) IS NULL THEN
    RAISE EXCEPTION 'FALHOU C5: a RPC % nao existe.', k_assin;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU C5: neg_guardar_nif_pessoa tem % assinaturas (esperava 1).', v_n;
  END IF;
  IF has_function_privilege('authenticated', k_assin, 'EXECUTE')
     OR has_function_privilege('anon', k_assin, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU C5: authenticated ou anon executa a RPC do NIF.';
  END IF;
  IF NOT has_function_privilege('service_role', k_assin, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU C5: service_role nao executa a RPC do NIF (o proxy deixava de gravar).';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.oid = to_regprocedure(k_assin)
    AND a.privilege_type::text = 'EXECUTE'
    AND a.grantee <> 'service_role'::regrole::oid
    AND a.grantee <> p.proowner;
  IF v_n <> 0 OR (SELECT p.proacl IS NULL FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(k_assin)) THEN
    RAISE EXCEPTION 'FALHOU C5: a RPC do NIF e executavel por mais alguem alem de service_role e do dono (% entradas, ou ACL por omissao).', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- C6. Comportamento (regressao do GRANT): como authenticated, com o JWT de
  --     um membro activo da nike e passando-se a si proprio como actor, a
  --     chamada directa a RPC e recusada pela base ANTES de a funcao correr
  --     ("permission denied for function"); o mesmo para anon. A pessoa e um
  --     id inexistente: mesmo que a recusa falhasse, nada se escrevia.
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_erro := NULL;
  BEGIN
    PERFORM public.neg_guardar_nif_pessoa(v_auth, k_org, k_inexist, NULL::text, NULL::text, NULL::text);
  EXCEPTION WHEN insufficient_privilege THEN v_erro := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF v_erro IS NULL OR v_erro NOT LIKE 'permission denied for function%' THEN
    RAISE EXCEPTION 'FALHOU C6: authenticated chamou a RPC do NIF directamente (%).', COALESCE(v_erro, 'sem erro');
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_erro := NULL;
  BEGIN
    PERFORM public.neg_guardar_nif_pessoa(v_auth, k_org, k_inexist, NULL::text, NULL::text, NULL::text);
  EXCEPTION WHEN insufficient_privilege THEN v_erro := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_erro IS NULL OR v_erro NOT LIKE 'permission denied for function%' THEN
    RAISE EXCEPTION 'FALHOU C6: anon chamou a RPC do NIF directamente (%).', COALESCE(v_erro, 'sem erro');
  END IF;

  RAISE EXCEPTION 'TESTE_OK: revogacao do UPDATE por coluna em nif_hash, nif_encrypted e nif_last3, e RPC do NIF so para service_role.';
END
$teste$;

ROLLBACK;
