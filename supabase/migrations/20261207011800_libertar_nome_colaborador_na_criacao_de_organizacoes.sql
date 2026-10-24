-- ============================================================
-- Libertar o nome "Colaborador" na criacao de organizacoes novas
-- ============================================================
--
-- PORQUE
--
-- O nome "Colaborador" vai passar a designar o pessoal que so marca o ponto.
-- Hoje esse nome esta ocupado: sempre que se cria uma organizacao, a funcao
-- bootstrap_org_creator() insere um papel worker chamado "Colaborador".
-- Esta migracao tira esse papel da criacao de organizacoes NOVAS. Nao apaga
-- nenhum papel worker ja existente -- isto e sobre o futuro, nao sobre o
-- passado -- e NAO cria o papel novo do pessoal so-ponto (outra ronda).
--
--
-- O CAMINHO QUE ESTA VIVO
--
-- bootstrap_org_creator() NAO e codigo morto. E chamada por todas as RPCs de
-- criacao de organizacao que a aplicacao usa hoje:
--
--   . rpc_create_organization                 (versao mais recente:
--     20261026010000_nif_enc_rpc_create_organization.sql, linha 277)
--     chamada de src/pages/Organizations.tsx via callNifWriteProxy
--   . rpc_create_organization_with_hierarchy  (versao mais recente:
--     20261027010000_nif_enc_rpc_create_organization_with_hierarchy.sql,
--     linha 284) chamada do organograma e do detalhe de organizacao
--   . create_initial_organization             (versao mais recente:
--     20261111060000_anchor_trial_to_account_creation.sql, linha 116)
--     chamada no arranque de conta, quando ainda nao ha organizacoes
--
-- Confirmado tambem nos dados: a organizacao nike tem um papel de codigo
-- 'viewer' e nome 'Visualizador' -- nome que so existe dentro de
-- bootstrap_org_creator -- com created_at exactamente igual ao created_at da
-- propria organizacao, ou seja criado na mesma transaccao.
--
-- Existe um segundo caminho, em TypeScript (src/utils/organizationCreation.ts),
-- usado apenas quando se cria a partir de um template. Esse cria org_admin /
-- org_editor / org_viewer e ja nao usa o nome "Colaborador". Nao e tocado aqui.
--
--
-- O QUE ACONTECE AO PAPEL POR OMISSAO
--
-- No caminho SQL o worker era o unico papel com is_default = TRUE. Passa a
-- ser o 'viewer' ('Visualizador'), que e a mesma escolha ja feita no caminho
-- TypeScript (org_viewer, organizationCreation.ts linha 57). Assim uma
-- organizacao nova continua a sair com exactamente um papel por omissao.
--
-- Verificado que nada LE anew_roles.is_default para decidir o papel de quem
-- entra numa organizacao: nao ha leitor em src/, nem nas Edge Functions, nem
-- em nenhuma funcao SQL; os ecras de membros escolhem o papel pelo CODIGO
-- ('org_viewer'), nunca pela flag. Nao ha tampouco indice unico nem trigger a
-- garantir um so default em anew_roles. O acesso do criador tambem nao depende
-- disto: a propria funcao da-lhe membership de org_admin (ou do super_admin
-- global, no auto-registo).
--
--
-- METODO
--
-- Igual ao de 20261017010000: buscar a definicao VIVA por pg_get_functiondef
-- e reaplica-la com duas alteracoes cirurgicas, em vez de retranscrever o
-- corpo a mao. A assinatura nao muda (2 argumentos, confirmado por pronargs),
-- por isso o CREATE OR REPLACE substitui a funcao e nao cria uma segunda ao
-- lado.
-- ============================================================

DO $mig$
DECLARE
  v_oid oid;
  v_n int;
  v_nargs int;
  v_src text;
  v_sem_worker text;
  v_final text;
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bootstrap_org_creator';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 bootstrap_org_creator, encontrei %', v_n;
  END IF;

  SELECT p.oid, p.pronargs INTO v_oid, v_nargs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bootstrap_org_creator';

  IF v_nargs <> 2 THEN
    RAISE EXCEPTION 'bootstrap_org_creator com numero de argumentos inesperado: %', v_nargs;
  END IF;

  v_src := pg_get_functiondef(v_oid);

  -- ---- 1. tirar o INSERT do papel worker -------------------------------
  IF position('''worker''' in v_src) = 0 THEN
    RAISE NOTICE 'bootstrap_org_creator ja nao insere o papel worker -- nada a tirar';
  ELSE
    v_sem_worker := regexp_replace(
      v_src,
      'INSERT INTO public\.anew_roles[^;]*VALUES \(''worker''[^;]*;',
      '',
      'g'
    );

    IF position('''worker''' in v_sem_worker) <> 0 THEN
      RAISE EXCEPTION 'O INSERT do papel worker nao casou com o padrao esperado -- abortado sem alterar nada';
    END IF;

    v_src := v_sem_worker;
  END IF;

  -- ---- 2. passar o papel por omissao para o viewer ----------------------
  IF v_src !~ 'VALUES \(''viewer'', ''Visualizador''' THEN
    RAISE EXCEPTION 'Nao encontrei o INSERT do papel viewer -- abortado sem alterar nada';
  END IF;

  v_final := regexp_replace(
    v_src,
    '(VALUES \(''viewer'', ''Visualizador''[^;]*p_organization_id, false), false(, false, v_anew_user_id\))',
    '\1, true\2',
    'g'
  );

  IF v_final = v_src THEN
    -- Ou ja estava a true, ou o formato mudou. Distinguir os dois casos.
    IF v_src ~ 'VALUES \(''viewer'', ''Visualizador''[^;]*p_organization_id, false, true' THEN
      RAISE NOTICE 'O papel viewer ja era o papel por omissao';
    ELSE
      RAISE EXCEPTION 'Nao consegui marcar o viewer como papel por omissao -- abortado sem alterar nada';
    END IF;
  END IF;

  -- ---- 3. guardas antes de aplicar --------------------------------------
  IF position('org_admin' in v_final) = 0
     OR position('anew_memberships' in v_final) = 0
     OR position('anew_role_permissions' in v_final) = 0 THEN
    RAISE EXCEPTION 'A definicao reescrita perdeu partes essenciais -- abortado';
  END IF;

  EXECUTE v_final;
  RAISE NOTICE 'bootstrap_org_creator actualizada: sem papel worker, viewer passa a papel por omissao';
END;
$mig$;

-- ============================================================
-- CONFERIR
-- ============================================================

DO $conf$
DECLARE
  v_src text;
  v_workers_existentes int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bootstrap_org_creator';

  IF position('''worker''' in v_src) <> 0 THEN
    RAISE EXCEPTION 'CONFERIR falhou: bootstrap_org_creator ainda insere o papel worker';
  END IF;

  IF v_src !~ 'VALUES \(''viewer'', ''Visualizador''[^;]*p_organization_id, false, true' THEN
    RAISE EXCEPTION 'CONFERIR falhou: o papel viewer nao ficou marcado como papel por omissao';
  END IF;

  IF v_src !~ 'VALUES \(''org_admin''' THEN
    RAISE EXCEPTION 'CONFERIR falhou: o papel org_admin desapareceu da funcao';
  END IF;

  -- Papeis worker que ja existem NAO sao apagados. So se conta e se reporta.
  -- Este bloco corre como dono, por isso ve todas as linhas, sem RLS pelo meio.
  SELECT count(*) INTO v_workers_existentes
  FROM public.anew_roles
  WHERE code = 'worker' AND organization_id IS NOT NULL;

  RAISE NOTICE 'Papeis worker ja existentes, mantidos intactos: %', v_workers_existentes;
END;
$conf$;
