-- ==============================================================================
-- Anexos das justificacoes (E4): agendar a limpeza diaria dos ficheiros.
--
-- POR APLICAR. Depende de 20270111610000 (hr_justificacao_anexos_limpar e
-- rpc_hr_justificacao_anexo_objecto_removido).
--
-- PRECISA DE CODIGO NOVO. O job que esta migration agenda chama a Edge Function
-- hr-justificacao-anexo (accao "limpar"), que ainda nao existe no remoto ate ser
-- publicada, e que precisa de verify_jwt = false em supabase/config.toml (o
-- segredo do cron nao e um JWT; a funcao valida o JWT por si nas accoes
-- humanas). Publicar a Edge ANTES, ou no mesmo momento do push; com o job
-- agendado e a Edge por publicar, o job falha todas as noites (404) sem apagar
-- nada, e nada mais se parte. A limpeza NAO pode correr so em SQL:
-- hr_justificacao_anexos_limpar da HR911 sem claims de service_role, e os
-- ficheiros so se apagam pela API do Storage.
--
-- O envio de anexos (ecra) so deve abrir DEPOIS de este job existir.
--
--
-- -- O QUE FAZ ------------------------------------------------------------------
--
-- Agenda, por pg_cron, o job hr-justificacao-anexos-limpar todos os dias as
-- 04:10 (depois dos jobs de convites, 03:40 e 03:50, que NAO se mexem). O job faz
-- um POST assincrono (pg_net) a hr-justificacao-anexo com o corpo
-- {"accao":"limpar"}; a Edge chama hr_justificacao_anexos_limpar (quarentenas
-- com mais de 3 h passam a recusadas; devolve os objectos por apagar), apaga-os
-- pela API do Storage e chama rpc_hr_justificacao_anexo_objecto_removido.
--
-- Os segredos nunca vao para o texto do job: o comando agendado le-os do Vault no
-- momento de correr. Usa os dois que o projecto JA tem:
--   project_functions_url     o URL base das Edge Functions, ate /functions/v1/
--   cron_service_role_key     o NOME engana: o valor e o CRON_SHARED_SECRET, nao a
--                             chave de servico (ver 20261115220000); a Edge
--                             autentica a accao "limpar" com
--                             requireServiceRoleOrCronSecret.
--
-- SO SE AGENDA se existirem pg_cron, pg_net e os DOIS segredos no Vault do
-- ambiente onde a migration corre. Faltando algum, avisa com RAISE WARNING
-- (PENDENCIA) e NAO agenda, sem falhar o push (mesmo criterio de
-- 20261210080000: a existencia dos segredos no Vault do ambiente nao e provavel
-- daqui). Esta migration, por si so, nao prova que o job existe: ver o conferir
-- e confirmar depois do push com SELECT jobname FROM cron.job.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- A mao: cron.unschedule('hr-justificacao-anexos-limpar').
-- ==============================================================================

BEGIN;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regprocedure('public.hr_justificacao_anexos_limpar(integer)') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_anexo_objecto_removido(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'hr_justificacao_anexos_limpar e rpc_hr_justificacao_anexo_objecto_removido nao existem. Aplicar 20270111610000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Agendar
-- ==============================================================================
DO $agendar$
DECLARE
  v_url   boolean := false;
  v_chave boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'PENDENCIA: pg_cron nao esta instalado; o job hr-justificacao-anexos-limpar NAO foi agendado. Os anexos de justificacoes abandonados ou removidos ficam por apagar ate la.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'PENDENCIA: pg_net nao esta instalado; o job hr-justificacao-anexos-limpar NAO foi agendado.';
    RETURN;
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_functions_url') INTO v_url;
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key') INTO v_chave;
  END IF;

  IF NOT (v_url AND v_chave) THEN
    RAISE WARNING 'PENDENCIA: faltam segredos no Vault (project_functions_url: %, cron_service_role_key: %); o job hr-justificacao-anexos-limpar NAO foi agendado.', v_url, v_chave;
    RETURN;
  END IF;

  PERFORM cron.unschedule('hr-justificacao-anexos-limpar')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-justificacao-anexos-limpar');

  PERFORM cron.schedule(
    'hr-justificacao-anexos-limpar',
    '10 4 * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_functions_url' LIMIT 1) || 'hr-justificacao-anexo',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key' LIMIT 1),
        'Content-Type', 'application/json'
      ),
      body := '{"accao":"limpar"}'::jsonb
    )
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  -- Nao se engole em silencio: o WARNING explica, e o conferir FALHA a migration
  -- se tudo o que e preciso existe e o job nao ficou agendado.
  RAISE WARNING 'PENDENCIA: nao foi possivel agendar hr-justificacao-anexos-limpar (%).', SQLERRM;
END;
$agendar$;

-- ==============================================================================
-- Conferir (sem mudar de papel: no db push o papel de sessao e cli_login_postgres)
-- ==============================================================================
DO $conferir$
DECLARE
  v_url   boolean := false;
  v_chave boolean := false;
  v_job   boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'PENDENCIA: sem pg_cron o job hr-justificacao-anexos-limpar nao existe; registar em POR FAZER e agendar quando houver pg_cron.';
    RETURN;
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_functions_url') INTO v_url;
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key') INTO v_chave;
  END IF;

  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-justificacao-anexos-limpar') INTO v_job;

  IF v_url AND v_chave AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    IF NOT v_job THEN
      RAISE EXCEPTION 'Existem pg_cron, pg_net e os dois segredos, mas o job hr-justificacao-anexos-limpar nao ficou agendado: os anexos removidos ou abandonados nunca seriam apagados do Storage.';
    END IF;
    -- O comando agendado le os segredos do Vault, nao os leva em claro, e chama a Edge certa.
    IF EXISTS (
      SELECT 1 FROM cron.job
       WHERE jobname = 'hr-justificacao-anexos-limpar'
         AND (command NOT LIKE '%vault.decrypted_secrets%'
              OR command LIKE '%eyJ%'
              OR command NOT LIKE '%hr-justificacao-anexo%'
              OR command NOT LIKE '%"accao":"limpar"%')
    ) THEN
      RAISE EXCEPTION 'O comando do job hr-justificacao-anexos-limpar devia ler os segredos do Vault, nao os levar em claro, e chamar hr-justificacao-anexo com accao limpar.';
    END IF;
    RAISE NOTICE 'OK: job hr-justificacao-anexos-limpar agendado as 04:10, a ler os segredos do Vault.';
  ELSE
    RAISE WARNING 'PENDENCIA: o job hr-justificacao-anexos-limpar NAO foi agendado (segredos do Vault: project_functions_url=%, cron_service_role_key=%; job existe=%). Criar os segredos e voltar a correr o bloco de agendar; ate la os anexos de justificacoes por apagar ficam no Storage.', v_url, v_chave, v_job;
  END IF;
END;
$conferir$;

COMMIT;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: publicar a Edge Function hr-justificacao-anexo (com
--    verify_jwt = false em supabase/config.toml) antes ou no mesmo momento.
--
-- 2. Ler, antes do push, se pg_cron, pg_net e os dois segredos do Vault existem na
--    base RH (so leitura): sem eles a migration so avisa (WARNING) e o job NAO
--    existe. Confirmar tambem que CRON_SHARED_SECRET esta definido na Edge e e
--    igual ao valor do segredo cron_service_role_key (se diferirem a Edge
--    responde 401 todas as noites e nada se apaga: o resultado do pg_net nao e
--    verificado pela base).
--
-- 3. Listar o pendente imediatamente antes do push (supabase migration list
--    --linked, a partir do worktree rh-pessoas): o push aplica TUDO o que
--    estiver na pasta, por ordem.
-- ==============================================================================
