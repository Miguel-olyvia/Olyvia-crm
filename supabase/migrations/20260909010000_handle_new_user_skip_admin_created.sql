-- ============================================================
-- Fix: admin-created users (via create-user Edge Function ->
-- rpc_finalize_user_profile_full) get a wrong/incomplete audit row.
--
-- Root cause: on_auth_user_created (AFTER INSERT ON auth.users) ->
-- handle_new_user() unconditionally pre-creates anew_users +
-- anew_entities + anew_entity_emails for EVERY new auth.users row,
-- including ones created by auth.admin.createUser() from the admin
-- create-user Edge Function. That INSERT runs in a separate,
-- unaudited transaction (no org resolvable yet, so
-- fn_audit_anew_users skips it silently). By the time
-- rpc_finalize_user_profile_full runs moments later inside the same
-- Edge Function call, it finds the anew_users row already exists,
-- takes its UPDATE-diff branch instead of INSERT, and produces a
-- wrong audit row: operation='UPDATE', missing the actual
-- name/email/creation diff, full_record=NULL.
--
-- Fix: create-user/index.ts now passes user_metadata.admin_created=true
-- to auth.admin.createUser(). handle_new_user() now bails out
-- immediately when that flag is set, leaving
-- rpc_finalize_user_profile_full as the sole writer for admin-created
-- users (correct INSERT diff, single consolidated audit row). Self-
-- registration (no such flag) is unaffected.
--
-- NOTE: the flag must be read from raw_user_meta_data, NOT
-- raw_app_meta_data. GoTrue's admin.createUser() persists app_metadata
-- via a separate follow-up UPDATE issued ~20ms after the initial
-- INSERT, so an AFTER INSERT trigger never observes it there — this
-- was caught by live E2E verification after an earlier version of
-- this migration (checking raw_app_meta_data) shipped and still
-- failed. user_metadata is present synchronously at INSERT time, as
-- proven by this same trigger's existing
-- `NEW.raw_user_meta_data->>'full_name'` read below.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anew_user_id uuid;
  v_entity_id uuid;
  v_full_name text;
BEGIN
  -- Admin-created users (create-user Edge Function) are fully handled by
  -- rpc_finalize_user_profile_full in one atomic, audited transaction.
  -- Skip this trigger's own writes so that RPC sees no pre-existing row
  -- and correctly takes its INSERT branch.
  IF NEW.raw_user_meta_data ->> 'admin_created' = 'true' THEN
    RETURN NEW;
  END IF;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');

  -- Create anew_users entry (idempotent — skip if already exists from edge function)
  INSERT INTO public.anew_users (auth_user_id, name, email, status, registration_origin)
  VALUES (
    NEW.id,
    v_full_name,
    COALESCE(NEW.email, ''),
    'active',
    'self_registration'
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Get the anew_users id
  SELECT id INTO v_anew_user_id
  FROM public.anew_users
  WHERE auth_user_id = NEW.id;

  -- Only create entity if anew_user doesn't already have one
  IF v_anew_user_id IS NOT NULL THEN
    SELECT entity_id INTO v_entity_id
    FROM public.anew_users
    WHERE id = v_anew_user_id;

    IF v_entity_id IS NULL THEN
      -- Create anew_entity
      INSERT INTO public.anew_entities (type, display_name, first_name, status, created_by)
      VALUES ('person', v_full_name, v_full_name, 'active', v_anew_user_id)
      RETURNING id INTO v_entity_id;

      -- Create primary email for the entity
      INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, is_verified)
      VALUES (v_entity_id, COALESCE(NEW.email, ''), 'personal', true, true);

      -- Link entity to anew_users
      UPDATE public.anew_users SET entity_id = v_entity_id WHERE id = v_anew_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
