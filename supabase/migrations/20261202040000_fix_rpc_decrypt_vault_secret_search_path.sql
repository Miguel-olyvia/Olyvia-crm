-- rpc_decrypt_vault_secret (20260804125832) devolvia SEMPRE NULL, mesmo para
-- um segredo confirmado como valido (password SMTP testada com sucesso pelo
-- formulario, guardada de novo, ainda assim rejeitada como "password ausente"
-- no envio real) -- confirmado ao vivo com um diagnostico temporario em
-- supabase/functions/send-email/index.ts.
--
-- CAUSA: a funcao tem `SET search_path TO 'public', 'pg_temp'` -- falta
-- 'vault' (e 'extensions', onde vive o pgsodium que a view usa para
-- desencriptar). Uma funcao SECURITY DEFINER com search_path restrito
-- propaga esse search_path para a avaliacao da view `vault.decrypted_secrets`
-- e para as funcoes internas do pgsodium que ela chama -- sem 'vault'/
-- 'extensions' na lista, essas chamadas internas nao se resolvem e a view
-- devolve NULL em silencio em vez de um erro.
--
-- PRECEDENTE JA EXISTENTE NO REPOSITORIO (nao e teoria nova): a migracao
-- 20261115180000 (hr_gatilho_orcamento_chama_o_motor) le
-- vault.decrypted_secrets com sucesso e tem exactamente
-- `SET search_path = public, extensions, vault` na sua funcao. A
-- rpc_decrypt_vault_secret nunca teve essa terceira entrada -- e essa e a
-- unica diferenca entre os dois casos.
--
-- Efeito directo: TODO o envio de email por SMTP de organizacao ou pessoal
-- (convites de admissao, credenciais de acesso, alertas, etc.) falhava com
-- "Autenticacao SMTP falhou", mesmo com a password certa guardada -- porque
-- sendEmailViaSMTP autenticava sempre com uma password vazia.

DO $guardas$
BEGIN
  IF to_regprocedure('public.rpc_decrypt_vault_secret(uuid)') IS NULL THEN
    RAISE EXCEPTION 'rpc_decrypt_vault_secret nao existe -- confirmar 20260804125832 antes de aplicar.';
  END IF;
END;
$guardas$;

CREATE OR REPLACE FUNCTION public.rpc_decrypt_vault_secret(p_secret_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p_secret_id;
$function$;

REVOKE ALL ON FUNCTION public.rpc_decrypt_vault_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_decrypt_vault_secret(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.rpc_decrypt_vault_secret(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_decrypt_vault_secret(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_decrypt_vault_secret(uuid) IS
'Desencripta um segredo do Vault por id, so service_role. search_path inclui
vault e extensions -- sem isso a view vault.decrypted_secrets devolve NULL em
silencio (ja aconteceu, confirmado ao vivo em Setembro/2026 com uma password
SMTP correcta a falhar autenticacao porque chegava vazia). Ver 20261115180000
para o mesmo padrao ja em produção.';

DO $conferir$
DECLARE
  v_search_path text;
BEGIN
  SELECT (regexp_match(pg_get_functiondef('public.rpc_decrypt_vault_secret(uuid)'::regprocedure), 'SET search_path TO (.*)'))[1]
    INTO v_search_path;

  IF v_search_path IS NULL OR v_search_path NOT ILIKE '%vault%' THEN
    RAISE EXCEPTION 'rpc_decrypt_vault_secret ainda sem "vault" no search_path: %', v_search_path;
  END IF;
  IF v_search_path NOT ILIKE '%extensions%' THEN
    RAISE EXCEPTION 'rpc_decrypt_vault_secret ainda sem "extensions" no search_path: %', v_search_path;
  END IF;

  IF has_function_privilege('authenticated', 'public.rpc_decrypt_vault_secret(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_decrypt_vault_secret nao devia estar executavel por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_decrypt_vault_secret(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_decrypt_vault_secret nao devia estar executavel por anon.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rpc_decrypt_vault_secret(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_decrypt_vault_secret devia continuar executavel por service_role.';
  END IF;

  RAISE NOTICE 'Conferido: rpc_decrypt_vault_secret com vault e extensions no search_path, so service_role.';
END;
$conferir$;
