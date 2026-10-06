-- ==============================================================================
-- Anexos da admissao (4/4): agendar a limpeza diaria dos ficheiros.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. O job que esta migration agenda chama a Edge Function
-- convite-admissao-limpeza, que ainda nao existe no remoto ate ser publicada, e
-- que precisa de verify_jwt = false em supabase/config.toml (o segredo do cron
-- nao e um JWT; precedente: generate-notifications). Publicar a Edge ANTES, ou
-- no mesmo momento do push; com o job agendado e a Edge por publicar, o job
-- falha todas as noites (404) sem apagar nada, e nada mais se parte.
--
--
-- -- O QUE FAZ ------------------------------------------------------------------
--
-- Agenda, por pg_cron, o job hr-convite-anexos-limpar todos os dias as 03:50
-- (dez minutos depois do job dos rascunhos, hr-convites-admissao-limpar, que NAO
-- se mexe). O job faz um POST assincrono (pg_net) a convite-admissao-limpeza, que
-- chama hr_convite_anexos_limpar, apaga os objectos pela API do Storage e chama
-- hr_convite_anexos_objecto_removido.
--
-- Os segredos nunca vao para o texto do job: o comando agendado le-os do Vault no
-- momento de correr. Usa os dois que o projecto JA tem:
--   project_functions_url     o URL base das Edge Functions, ate /functions/v1/
--   cron_service_role_key     o NOME engana: o valor e o CRON_SHARED_SECRET, nao a
--                             chave de servico (ver 20261115220000); a Edge de
--                             limpeza autentica-se com requireServiceRoleOrCronSecret.
--
-- SO SE AGENDA se existirem pg_cron, pg_net e os DOIS segredos no Vault do
-- ambiente onde a migration corre. Faltando algum, a migration avisa com
-- RAISE WARNING (PENDENCIA, mais visivel que um NOTICE no log do push) e NAO
-- agenda, sem falhar o push: os ficheiros expirados ficam por apagar ate se
-- criarem os segredos e se voltar a correr o bloco de agendar. NAO falha de
-- proposito: a existencia destes segredos no Vault do ramo de desenvolvimento
-- NAO foi confirmada, e falhar aqui travaria as quatro migrations dos anexos
-- (e o BIC, que e anterior) por causa de infraestrutura. O que torna a falta
-- VISIVEL e a funcao hr_convite_anexos_limpeza_estado() (20261210070000), que
-- devolve job_agendado e quantos ficheiros esperam apagamento: a Edge de
-- limpeza e quem a le. Esta migration, por si so, nao prova que o job existe.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- A mao: cron.unschedule('hr-convite-anexos-limpar').
--
-- Prerequisitos:
--   20261210070000  hr_convite_anexos_limpar, hr_convite_anexos_objecto_removido e
--                   hr_convite_anexos_limpeza_estado
--
-- O QUE MUDOU NESTA REVISAO (antes de aplicada): NOTICE passou a WARNING nas
-- pendencias, e o cabecalho explica porque nao falha a migration.
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regprocedure('public.hr_convite_anexos_limpar(integer, integer)') IS NULL
     OR to_regprocedure('public.hr_convite_anexos_objecto_removido(uuid[])') IS NULL
     OR to_regprocedure('public.hr_convite_anexos_limpeza_estado()') IS NULL THEN
    RAISE EXCEPTION 'hr_convite_anexos_limpar, hr_convite_anexos_objecto_removido e hr_convite_anexos_limpeza_estado nao existem. Aplicar 20261210070000 primeiro.';
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
    RAISE WARNING 'PENDENCIA: pg_cron nao esta instalado; o job hr-convite-anexos-limpar NAO foi agendado. Os ficheiros de convites expirados ficam por apagar ate la.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'PENDENCIA: pg_net nao esta instalado; o job hr-convite-anexos-limpar NAO foi agendado.';
    RETURN;
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_functions_url') INTO v_url;
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key') INTO v_chave;
  END IF;

  IF NOT (v_url AND v_chave) THEN
    RAISE WARNING 'PENDENCIA: faltam segredos no Vault (project_functions_url: %, cron_service_role_key: %); o job hr-convite-anexos-limpar NAO foi agendado.', v_url, v_chave;
    RETURN;
  END IF;

  PERFORM cron.unschedule('hr-convite-anexos-limpar')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-convite-anexos-limpar');

  PERFORM cron.schedule(
    'hr-convite-anexos-limpar',
    '50 3 * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_functions_url' LIMIT 1) || 'convite-admissao-limpeza',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key' LIMIT 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  -- Nao se engole em silencio: o NOTICE explica, e o conferir FALHA a migration
  -- se tudo o que e preciso existe e o job nao ficou agendado.
  RAISE WARNING 'PENDENCIA: nao foi possivel agendar hr-convite-anexos-limpar (%).', SQLERRM;
END;
$agendar$;

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_url   boolean := false;
  v_chave boolean := false;
  v_job   boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'PENDENCIA: sem pg_cron o job hr-convite-anexos-limpar nao existe; registar em POR FAZER e agendar quando houver pg_cron.';
    RETURN;
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_functions_url') INTO v_url;
    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key') INTO v_chave;
  END IF;

  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-convite-anexos-limpar') INTO v_job;

  IF v_url AND v_chave AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    IF NOT v_job THEN
      RAISE EXCEPTION 'Existem pg_cron, pg_net e os dois segredos, mas o job hr-convite-anexos-limpar nao ficou agendado: os ficheiros expirados nunca seriam apagados (RGPD).';
    END IF;
    -- O comando agendado nao leva segredos em claro.
    IF EXISTS (
      SELECT 1 FROM cron.job
       WHERE jobname = 'hr-convite-anexos-limpar'
         AND (command NOT LIKE '%vault.decrypted_secrets%' OR command LIKE '%eyJ%')
    ) THEN
      RAISE EXCEPTION 'O comando do job hr-convite-anexos-limpar devia ler os segredos do Vault e nao os levar em claro.';
    END IF;
    -- O job dos rascunhos continua como estava.
    RAISE NOTICE 'OK: job hr-convite-anexos-limpar agendado as 03:50, a ler os segredos do Vault.';
  ELSE
    RAISE WARNING 'PENDENCIA: o job hr-convite-anexos-limpar NAO foi agendado (segredos do Vault: project_functions_url=%, cron_service_role_key=%; job existe=%). Criar os segredos e voltar a correr o bloco de agendar; ate la os ficheiros de convites expirados nao se apagam.', v_url, v_chave, v_job;
  END IF;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: publicar a Edge Function convite-admissao-limpeza (com
--    verify_jwt = false em supabase/config.toml) antes ou no mesmo momento.
--
-- 2. Ler, antes do push, se pg_cron, pg_net e os dois segredos do Vault existem no
--    ambiente de destino (so leitura): sem eles a migration so avisa (WARNING),
--    e o job NAO existe. Se faltarem, registar em POR FAZER do relatorio do dia
--    e depois do push confirmar com hr_convite_anexos_limpeza_estado()
--    (job_agendado). Confirmar tambem que CRON_SHARED_SECRET esta definido na
--    Edge convite-admissao-limpeza e e igual ao valor do segredo
--    cron_service_role_key (se diferirem a Edge responde 401 todas as noites e
--    nada se apaga: o resultado do pg_net nao e verificado pela base).
--
-- 3. Listar o pendente imediatamente antes do push (supabase migration list
--    --linked): o push aplica TUDO o que estiver na pasta, por ordem.
-- ==============================================================================
