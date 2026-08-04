-- attachDecryptedPassword() (supabase/functions/_shared/smtp.ts) reads SMTP
-- passwords via `supabase.schema("vault").from("decrypted_secrets")`, which
-- goes through PostgREST. The `vault` schema is not in this project's
-- PostgREST exposed-schemas list (only `public`/`graphql_public` are, and no
-- override is configured in config.toml), so that read fails — and the
-- caller silently swallows the error (`if (error || !data) return row;`),
-- returning the row without a password. sendEmailViaSMTP then authenticates
-- with an undefined password, which Gmail (and presumably any other SMTP
-- host) rejects as an auth failure — confirmed live: a freshly-saved,
-- verified-correct app password still failed real sends with "Autenticação
-- SMTP falhou", while the Test-connection path (which sends the password
-- straight from the form, never touching vault) succeeded with the same
-- value.
--
-- This RPC lets edge functions decrypt a vault secret via a normal
-- service-role RPC call (always reachable regardless of PostgREST's exposed
-- schema list, since `public` is always exposed) instead of a direct
-- PostgREST read against the `vault` schema.
CREATE OR REPLACE FUNCTION public.rpc_decrypt_vault_secret(p_secret_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p_secret_id;
$function$;

REVOKE ALL ON FUNCTION public.rpc_decrypt_vault_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_decrypt_vault_secret(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.rpc_decrypt_vault_secret(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_decrypt_vault_secret(uuid) TO service_role;
