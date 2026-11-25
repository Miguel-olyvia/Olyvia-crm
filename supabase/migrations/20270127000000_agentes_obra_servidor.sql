-- 25/11/2026 (plano «Obra Viva», etapa 3b): os agentes da Olyvia vigiam as obras no servidor, com a Olyvia fechada.
--
--   pg_cron (15 em 15 min) → fn_agentes_agendado() → Edge Function agentes-obra → conta robô «Olyvia (agentes)» → as mesmas funções da base
--
-- A Edge Function entra com a conta robô (o papel das Operações) e corre a mesma volta dos agentes da página dos Negócios: marca as
-- propostas vistas, aplica as que chegaram ao prazo e grava só as obras que mudaram (obra_guardar_negocio). Não cria tabelas.
--
--   1. fn_agentes_segredo_confere(token): a Edge Function confere o token do pg_cron com o do Vault (o token nunca sai da base).
--   2. fn_agentes_agendado(): o que o pg_cron corre. Usa o endereço das funções que já está no Vault ('erp_funcoes_url', o mesmo da
--      verificação no Eticadata; ver supabase/functions/agentes-obra/README.md se não existir).
--   3. O segredo 'agentes_segredo' no Vault (gerado aqui, se faltar) e o agendamento de 15 em 15 minutos.

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ 1. o token do pg_cron
CREATE OR REPLACE FUNCTION public.fn_agentes_segredo_confere(p_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'vault' AS $$
  SELECT coalesce(length(p_token) >= 32 AND p_token = (
    SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'agentes_segredo' LIMIT 1), false)
$$;
COMMENT ON FUNCTION public.fn_agentes_segredo_confere(text) IS 'Obra Viva (agentes no servidor): confere o token com que o pg_cron chama a Edge Function agentes-obra. Só o service_role. 20270127000000.';
REVOKE ALL ON FUNCTION public.fn_agentes_segredo_confere(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agentes_segredo_confere(text) TO service_role;

-- ------------------------------------------------------------------ 2. o que o pg_cron corre
CREATE OR REPLACE FUNCTION public.fn_agentes_agendado()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'vault' AS $$
DECLARE
  v_url text; v_chave text;
BEGIN
  SELECT s.decrypted_secret INTO v_url FROM vault.decrypted_secrets s WHERE s.name = 'erp_funcoes_url' LIMIT 1;
  SELECT s.decrypted_secret INTO v_chave FROM vault.decrypted_secrets s WHERE s.name = 'agentes_segredo' LIMIT 1;
  IF v_url IS NULL OR v_chave IS NULL THEN
    RAISE WARNING 'fn_agentes_agendado: falta % no Vault; os agentes não correram.', CASE WHEN v_url IS NULL THEN 'erp_funcoes_url' ELSE 'agentes_segredo' END;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/agentes-obra',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_chave, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
END $$;
COMMENT ON FUNCTION public.fn_agentes_agendado() IS 'Obra Viva (agentes no servidor): chama a Edge Function agentes-obra com o token do Vault. Corre no pg_cron de 15 em 15 minutos. 20270127000000.';
REVOKE ALL ON FUNCTION public.fn_agentes_agendado() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ 3. o segredo e o agendamento (de 15 em 15 minutos)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'agentes_segredo') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'agentes_segredo',
      'O token com que o pg_cron chama a Edge Function agentes-obra (20270127000000).');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Não foi possível criar o segredo agentes_segredo no Vault: %', SQLERRM;
END $do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('agentes-obra') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agentes-obra');
    PERFORM cron.schedule('agentes-obra', '*/15 * * * *', $cron$SELECT public.fn_agentes_agendado()$cron$);
  ELSE
    RAISE WARNING 'Sem pg_cron ou pg_net: os agentes não ficaram agendados (ligar as extensões e correr este passo outra vez).';
  END IF;
END $do$;

-- Para confirmar:
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'agentes-obra';
--   SELECT status, return_message, start_time FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'agentes-obra') ORDER BY start_time DESC LIMIT 5;
-- Para parar os agentes no servidor:
--   SELECT cron.unschedule('agentes-obra');
