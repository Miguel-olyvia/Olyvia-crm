-- organization_smtp_settings.smtp_password and user_smtp_settings.smtp_password
-- were plaintext `text` columns, readable by anything with SELECT access
-- (confirmed live: any active org member could read the org's SMTP password
-- via the API, not just admins — see 20261110740000). Even after tightening
-- that RLS policy, the password remained plaintext at rest, readable by
-- anyone with direct DB access (service role, backups, DB admin) — a real
-- exposure independent of RLS.
--
-- This migration moves both columns to Supabase Vault (pgsodium-backed,
-- confirmed available: supabase_vault 0.3.1), storing only a
-- smtp_password_secret_id reference in each table. vault.decrypted_secrets
-- is only readable by `service_role` (confirmed live via
-- information_schema.role_table_grants — `authenticated`/`anon` have no
-- grant there at all), so only trusted Edge Functions running with the
-- service-role key can ever decrypt a stored SMTP password again; regular
-- API/PostgREST access can no longer read it in any form.
--
-- Existing real rows (confirmed live: 1 organization_smtp_settings row, 19
-- user_smtp_settings rows) are backfilled into vault secrets before the
-- plaintext column is dropped, so no working SMTP configuration is lost.

ALTER TABLE public.organization_smtp_settings ADD COLUMN smtp_password_secret_id uuid;
ALTER TABLE public.user_smtp_settings ADD COLUMN smtp_password_secret_id uuid;

DO $$
DECLARE
  r record;
  v_secret_id uuid;
BEGIN
  FOR r IN SELECT id, smtp_password FROM public.organization_smtp_settings WHERE smtp_password_secret_id IS NULL LOOP
    v_secret_id := vault.create_secret(r.smtp_password, 'org_smtp:' || r.id::text);
    UPDATE public.organization_smtp_settings SET smtp_password_secret_id = v_secret_id WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, smtp_password FROM public.user_smtp_settings WHERE smtp_password_secret_id IS NULL LOOP
    v_secret_id := vault.create_secret(r.smtp_password, 'user_smtp:' || r.id::text);
    UPDATE public.user_smtp_settings SET smtp_password_secret_id = v_secret_id WHERE id = r.id;
  END LOOP;
END $$;

DO $$
DECLARE v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing FROM public.organization_smtp_settings WHERE smtp_password_secret_id IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'organization_smtp_settings backfill incomplete: % rows missing a vault secret', v_missing;
  END IF;

  SELECT count(*) INTO v_missing FROM public.user_smtp_settings WHERE smtp_password_secret_id IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'user_smtp_settings backfill incomplete: % rows missing a vault secret', v_missing;
  END IF;
END $$;

ALTER TABLE public.organization_smtp_settings ALTER COLUMN smtp_password_secret_id SET NOT NULL;
ALTER TABLE public.user_smtp_settings ALTER COLUMN smtp_password_secret_id SET NOT NULL;

ALTER TABLE public.organization_smtp_settings DROP COLUMN smtp_password;
ALTER TABLE public.user_smtp_settings DROP COLUMN smtp_password;

-- ── Write RPCs: the only way to set/change a vaulted SMTP password ──────────
-- Neither RPC ever returns the plaintext password back to the caller.

CREATE OR REPLACE FUNCTION public.rpc_upsert_org_smtp_settings(
  p_id uuid,
  p_organization_id uuid,
  p_name text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_secure boolean,
  p_encryption text,
  p_from_email text,
  p_from_name text,
  p_daily_limit integer,
  p_is_default boolean
) RETURNS public.organization_smtp_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_row public.organization_smtp_settings;
  v_secret_id uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
     OR NOT public.has_anew_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Sem permissão para gerir SMTP desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_id IS NULL THEN
    IF p_smtp_password IS NULL OR p_smtp_password = '' THEN
      RAISE EXCEPTION 'Password é obrigatória para criar uma configuração SMTP' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_secret_id := vault.create_secret(p_smtp_password, 'org_smtp:new:' || gen_random_uuid()::text);

    INSERT INTO public.organization_smtp_settings
      (organization_id, name, smtp_host, smtp_port, smtp_username, smtp_password_secret_id,
       smtp_secure, encryption, from_email, from_name, daily_limit, is_default, created_by)
    VALUES
      (p_organization_id, p_name, p_smtp_host, p_smtp_port, p_smtp_username, v_secret_id,
       p_smtp_secure, p_encryption, p_from_email, p_from_name, p_daily_limit, p_is_default, v_actor)
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row
    FROM public.organization_smtp_settings
    WHERE id = p_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Configuração SMTP não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_smtp_password IS NOT NULL AND p_smtp_password <> '' THEN
      PERFORM vault.update_secret(v_row.smtp_password_secret_id, p_smtp_password);
    END IF;

    UPDATE public.organization_smtp_settings SET
      name = p_name,
      smtp_host = p_smtp_host,
      smtp_port = p_smtp_port,
      smtp_username = p_smtp_username,
      smtp_secure = p_smtp_secure,
      encryption = p_encryption,
      from_email = p_from_email,
      from_name = p_from_name,
      daily_limit = p_daily_limit,
      is_default = p_is_default,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  IF p_is_default THEN
    UPDATE public.organization_smtp_settings
    SET is_default = false
    WHERE organization_id = p_organization_id AND id <> v_row.id;
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_user_smtp_settings(
  p_id uuid,
  p_organization_id uuid,
  p_name text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_secure boolean,
  p_encryption text,
  p_from_email text,
  p_from_name text,
  p_reply_to text,
  p_daily_limit integer,
  p_is_default boolean
) RETURNS public.user_smtp_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.user_smtp_settings;
  v_secret_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_id IS NULL THEN
    IF p_smtp_password IS NULL OR p_smtp_password = '' THEN
      RAISE EXCEPTION 'Password é obrigatória para criar uma configuração SMTP' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_secret_id := vault.create_secret(p_smtp_password, 'user_smtp:new:' || gen_random_uuid()::text);

    INSERT INTO public.user_smtp_settings
      (user_id, organization_id, name, smtp_host, smtp_port, smtp_username, smtp_password_secret_id,
       smtp_secure, encryption, from_email, from_name, reply_to, daily_limit, is_default, is_active)
    VALUES
      (auth.uid(), p_organization_id, p_name, p_smtp_host, p_smtp_port, p_smtp_username, v_secret_id,
       p_smtp_secure, p_encryption, p_from_email, p_from_name, p_reply_to, p_daily_limit, p_is_default, true)
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row
    FROM public.user_smtp_settings
    WHERE id = p_id AND user_id = auth.uid();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Configuração SMTP não encontrada' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_smtp_password IS NOT NULL AND p_smtp_password <> '' THEN
      PERFORM vault.update_secret(v_row.smtp_password_secret_id, p_smtp_password);
    END IF;

    UPDATE public.user_smtp_settings SET
      name = p_name,
      smtp_host = p_smtp_host,
      smtp_port = p_smtp_port,
      smtp_username = p_smtp_username,
      smtp_secure = p_smtp_secure,
      encryption = p_encryption,
      from_email = p_from_email,
      from_name = p_from_name,
      reply_to = p_reply_to,
      daily_limit = p_daily_limit,
      is_default = p_is_default,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  IF p_is_default THEN
    UPDATE public.user_smtp_settings
    SET is_default = false
    WHERE user_id = auth.uid() AND id <> v_row.id;
  END IF;

  RETURN v_row;
END;
$function$;
