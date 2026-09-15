-- ==============================================================================
-- Resumo de segredos orfaos no Vault, para os dados bancarios de RH.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um defeito, ja corrigido ha varios dias no remoto, deixou segredos orfaos no
-- cofre do Supabase (vault.secrets): segredos criados por
-- rpc_hr_definir_iban / rpc_hr_definir_conta para guardar contas bancarias de
-- RH (pessoas_dados_bancarios.conta_secret_id), cuja linha nunca chegou a ser
-- gravada, ou foi apagada depois. O segredo continua no cofre, sem dono.
--
-- O cofre e PARTILHADO com outra funcionalidade -- as palavras-passe de SMTP,
-- desde 20261110750000 (org_smtp:*, user_smtp:*). Uma consulta a vault.secrets
-- que nao filtre pelo prefixo do nome contaria, ou marcaria como orfao, um
-- segredo que nao tem nada a ver com RH.
--
-- Os segredos de RH tem nome com prefixo 'hr_conta:' (formato actual, desde
-- 20261120220000) ou 'hr_iban:' (formato antigo, anterior ao rename, criado
-- por 20261120070000). Ambos podem ter linhas: 'hr_iban:' e legado e nao se
-- reescreve.
--
--
-- -- O QUE ESTA FUNCAO FAZ, E O QUE NAO FAZ -------------------------------------
--
-- hr_contas_bancarias_cofre_resumo() devolve SO uma contagem por prefixo --
-- nunca o nome completo do segredo (que leva o pessoa_id), nunca o conteudo
-- (a conta em claro nao sai daqui nem em nenhum outro sitio, por decisao de
-- 20261120070000). E uma ferramenta de diagnostico para o system_admin
-- perceber a dimensao do defeito ja corrigido, nao um caminho de leitura do
-- Vault.
--
-- Restrita a system_admin, no mesmo molde de get_system_admin_dashboard_stats
-- (20260622114000 / 20260622160000): exige auth.uid() nao nulo E
-- is_system_admin(auth.uid()), com RAISE EXCEPTION se faltar. GRANT EXECUTE a
-- authenticated (para que o PostgREST aceite a chamada) e a guarda interna e
-- que decide quem recebe resposta -- authenticated sem is_system_admin recebe
-- excepcao, nao um resultado vazio.
--
--
-- -- A CONTAGEM DE ORFAOS --------------------------------------------------------
--
-- "Orfao" = um segredo com prefixo hr_conta:/hr_iban: para o qual NAO existe
-- nenhuma linha em pessoas_dados_bancarios com conta_secret_id igual ao id do
-- segredo. Usa-se NOT EXISTS, nao NOT IN, para nao ter surpresas com NULLs (um
-- conta_secret_id NULL nunca deveria aparecer -- a tabela tem o CHECK
-- ..._segredo_e_mascara_juntos -- mas NOT EXISTS e a forma correcta de o
-- verificar de qualquer maneira).
--
-- NAO se filtra por pessoas_dados_bancarios.deleted_at: a tabela nem tem essa
-- coluna (nao e soft-delete, e ancorada a pessoa por FK ON DELETE CASCADE), e
-- mesmo que tivesse, um segredo referenciado por uma linha soft-deleted
-- continua a ter "dono" para efeitos desta contagem -- decisao de retencao
-- separada, fora do ambito desta ronda.
--
--
-- -- ESTRUTURA CONFIRMADA --------------------------------------------------------
--
-- vault.secrets: id uuid, name text, description text, secret text, key_id
-- uuid, nonce bytea, created_at timestamptz, updated_at timestamptz -- a
-- estrutura standard do Supabase Vault (pgsodium-backed), ja usada sem
-- alteracoes pelas migrations que la escrevem (20261110750000,
-- 20261120070000, 20261120220000: vault.create_secret(secret, name[,
-- description]), vault.update_secret(id, secret)). So service_role a le
-- directamente -- e porque isso, e porque esta funcao e SECURITY DEFINER
-- (correndo com os privilegios do dono, tipicamente postgres/service_role),
-- que authenticated consegue mesmo assim obter a contagem sem ganhar leitura
-- directa do schema vault.
--
-- pessoas_dados_bancarios.conta_secret_id: confirmado em 20261120220000 (o
-- rename de iban_secret_id para conta_secret_id), coluna uuid sem FK -- e
-- outro schema.
--
--
-- -- O QUE FICA DE FORA ----------------------------------------------------------
--
-- - Nao existe RPC para APAGAR os segredos orfaos encontrados. Antes de
--   qualquer vault.delete_secret, e preciso decidir se ficam retidos por
--   alguma janela de auditoria -- decisao de produto separada.
-- - Nao ha aqui lista dos ids orfaos, so a contagem. Se um dia for preciso
--   agir sobre eles um a um, isso pede outra RPC (ou um script de
--   service_role fora da aplicacao), com o mesmo cuidado de nao expor nome
--   nem conteudo.
--
--
-- -- COMO SE REVERTE ---------------------------------------------------------
--
-- DROP FUNCTION IF EXISTS public.hr_contas_bancarias_cofre_resumo();
-- Sem ficheiro de reversao guardado nesta pasta, de proposito -- ver a regra
-- ja escrita em 20261120070000.
--
-- Prerequisitos:
--   20260622114000  is_system_admin(uuid)
--   20261120070000 / 20261120220000  pessoas_dados_bancarios.conta_secret_id
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_system_admin' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'public.is_system_admin(uuid) nao existe. Aplicar 20260622114000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
      AND column_name = 'conta_secret_id'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas_dados_bancarios.conta_secret_id nao existe. Aplicar 20261120070000 e 20261120220000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION
      'O schema vault nao existe. Esta funcao existe precisamente para diagnosticar segredos orfaos la dentro; sem o schema nao ha nada para diagnosticar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'vault' AND table_name = 'secrets' AND column_name = 'name'
  ) THEN
    RAISE EXCEPTION 'vault.secrets nao tem a coluna name esperada. Confirmar a extensao supabase_vault no remoto.';
  END IF;
END;
$guardas$;

-- ---- Funcao -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_contas_bancarias_cofre_resumo()
RETURNS TABLE (prefixo text, total bigint, orfaos bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_system_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: system_admin required';
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT
      s.id,
      CASE
        WHEN s.name LIKE 'hr_conta:%' THEN 'hr_conta'
        WHEN s.name LIKE 'hr_iban:%'  THEN 'hr_iban'
      END AS prefixo
    FROM vault.secrets s
    WHERE s.name LIKE 'hr_conta:%' OR s.name LIKE 'hr_iban:%'
  )
  SELECT
    a.prefixo,
    count(*) AS total,
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM public.pessoas_dados_bancarios b
        WHERE b.conta_secret_id = a.id
      )
    ) AS orfaos
  FROM alvo a
  GROUP BY a.prefixo
  ORDER BY a.prefixo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_contas_bancarias_cofre_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_contas_bancarias_cofre_resumo() TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_contas_bancarias_cofre_resumo() IS
'Diagnostico do defeito ja corrigido que deixou segredos orfaos no Vault para contas bancarias de RH. Devolve SO uma contagem por prefixo (hr_conta / hr_iban): total de segredos com esse prefixo e quantos NAO tem nenhuma linha em pessoas_dados_bancarios a apontar para eles (NOT EXISTS contra conta_secret_id, sem filtrar por soft-delete -- a tabela nao tem essa coluna). Nunca devolve o nome completo do segredo (leva o pessoa_id) nem o conteudo. Restrita a system_admin, no molde de get_system_admin_dashboard_stats: authenticated pode chamar, mas so quem tem is_system_admin(auth.uid()) recebe resposta -- os restantes recebem excepcao.';

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_existe        boolean;
  v_retorna_table boolean;
  v_seguranca     boolean;
  v_tem_public    boolean;
  v_tem_anon      boolean;
  v_tem_auth      boolean;
  v_tem_service   boolean;
  v_uid_falso     uuid := '00000000-0000-0000-0000-000000000000';
  v_recusou       boolean := false;
BEGIN
  -- A funcao existe com a assinatura certa (sem argumentos, devolve um set).
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_contas_bancarias_cofre_resumo'
      AND p.pronargs = 0
  ) INTO v_existe;

  IF NOT v_existe THEN
    RAISE EXCEPTION 'public.hr_contas_bancarias_cofre_resumo() nao existe apos a migracao.';
  END IF;

  SELECT p.proretset, p.prosecdef INTO v_retorna_table, v_seguranca
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'hr_contas_bancarias_cofre_resumo' AND p.pronargs = 0;

  IF v_retorna_table IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_contas_bancarias_cofre_resumo() nao devolve um conjunto (RETURNS TABLE esperado).';
  END IF;

  IF v_seguranca IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_contas_bancarias_cofre_resumo() nao ficou SECURITY DEFINER.';
  END IF;

  -- REVOKE/GRANT como esperado.
  SELECT has_function_privilege('public', 'public.hr_contas_bancarias_cofre_resumo()', 'EXECUTE') INTO v_tem_public;
  SELECT has_function_privilege('anon', 'public.hr_contas_bancarias_cofre_resumo()', 'EXECUTE') INTO v_tem_anon;
  SELECT has_function_privilege('authenticated', 'public.hr_contas_bancarias_cofre_resumo()', 'EXECUTE') INTO v_tem_auth;
  SELECT has_function_privilege('service_role', 'public.hr_contas_bancarias_cofre_resumo()', 'EXECUTE') INTO v_tem_service;

  IF v_tem_public OR v_tem_anon THEN
    RAISE EXCEPTION
      'PUBLIC ou anon conseguem executar hr_contas_bancarias_cofre_resumo(). Devia estar revogado a ambos.';
  END IF;

  IF NOT v_tem_auth OR NOT v_tem_service THEN
    RAISE EXCEPTION
      'authenticated ou service_role nao tem EXECUTE em hr_contas_bancarias_cofre_resumo(). A guarda interna de is_system_admin e que restringe, nao o GRANT.';
  END IF;

  -- Teste ao vivo: um auth.uid() sem is_system_admin tem de ser recusado.
  -- Simula-se via request.jwt.claims (o mesmo GUC de que auth.uid() le),
  -- limitado a esta transaccao (is_local = true) e reposto no fim. Nao toca
  -- em nenhum segredo real do Vault -- so chama a funcao e espera a excepcao.
  IF NOT public.is_system_admin(v_uid_falso) THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid_falso::text, 'role', 'authenticated')::text, true);

    BEGIN
      PERFORM * FROM public.hr_contas_bancarias_cofre_resumo();
      v_recusou := false;
    EXCEPTION WHEN OTHERS THEN
      v_recusou := true;
    END;

    -- Repor de imediato, para nao deixar esta transaccao a falar em nome de
    -- outro uid pelo resto da migracao (mesmo nao havendo mais nada depois).
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_recusou THEN
      RAISE EXCEPTION
        'hr_contas_bancarias_cofre_resumo() NAO recusou um uid sem is_system_admin. A guarda interna falhou -- nao aplicar neste estado.';
    END IF;

    RAISE NOTICE 'Teste ao vivo: um uid sem is_system_admin foi recusado, como esperado.';
  ELSE
    RAISE NOTICE
      'Teste ao vivo omitido: o uid falso 00000000-0000-0000-0000-000000000000 e, neste remoto, is_system_admin. Verificacao so estrutural.';
  END IF;

  RAISE NOTICE
    'OK: hr_contas_bancarias_cofre_resumo() criada, SECURITY DEFINER, PUBLIC/anon revogados, authenticated/service_role com EXECUTE, guarda de system_admin confirmada ao vivo.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. So cria um objecto novo (uma funcao). Nao altera tabela, coluna nem
--    politica existente -- nao ha janela em que a base fique defeituosa.
--
-- 2. Esta funcao NAO apaga nada no Vault. E so diagnostico. Uma eventual
--    limpeza dos segredos orfaos encontrados e uma ronda propria, com decisao
--    de retencao tomada antes.
--
-- 3. Confirmar por leitura directa (fora desta migracao, com service_role,
--    nunca aqui) se ha de facto segredos hr_conta:/hr_iban: sem linha
--    correspondente antes de decidir se vale a pena agir sobre eles.
-- ==============================================================================
