-- ============================================================
-- rpc_finalize_user_profile(...)
-- ============================================================
-- Purpose: fix a duplicate-audit-row bug in user CREATION.
--
-- Before this migration, supabase/functions/create-user/index.ts did a
-- PARTIAL INSERT (or UPDATE, when re-inviting an existing auth user) into
-- anew_users via the raw PostgREST client — outside any audit_bypass —
-- so fn_audit_anew_users() fired immediately for that statement (audit
-- row #1). Then, src/pages/UsersNew.tsx's handleSave CREATE path made a
-- SECOND, separate .from("anew_users").update(...) call, causing the
-- trigger to fire again (audit row #2). One user action ("create user")
-- produced two entity_audit_log rows.
--
-- A first attempt fixed the frontend's follow-up update but kept the Edge
-- Function's own raw insert/update of anew_users BEFORE calling this RPC
-- — that raw insert/update still fires fn_audit_anew_users() unguarded
-- (audit row #1), and this RPC's UPDATE + fn_manual_audit_log() still
-- produced a second row (audit row #2). Same bug, same two rows.
--
-- Real fix: this RPC now performs the ENTIRE identity resolution AND
-- profile write itself, as a single INSERT ... ON CONFLICT (auth_user_id)
-- DO UPDATE, under app.audit_bypass='on'. The Edge Function no longer
-- touches anew_users directly at all before calling this RPC — it only
-- resolves/creates the auth.users row (which requires the service-role
-- Admin API and cannot run inside a plain SQL transaction), then calls
-- this RPC exactly once with the full field set. That makes this RPC the
-- ONLY writer of the anew_users row for the "create user" action, so
-- exactly one fn_manual_audit_log() call happens — INSERT semantics when
-- the row is fresh, UPDATE-diff semantics when reusing an existing row for
-- a re-invited auth user.
--
-- Why a new RPC instead of reusing rpc_update_user: rpc_update_user is
-- SECURITY DEFINER but expects an authenticated caller (uses auth.uid()
-- internally in places) and a pre-existing anew_users row with entity_id
-- already resolved; it also does far more (emails, phones, memberships,
-- fiscal, addresses) that create-user's Edge Function already handles
-- directly with the service-role client across auxiliary tables. Only the
-- anew_users row itself needs consolidating here — the actor is passed
-- explicitly (p_actor_id) because the Edge Function calls this RPC with
-- its service-role client, where auth.uid() is NULL.
--
-- Authorization: unlike rpc_create_role/rpc_update_role/rpc_delete_role,
-- this RPC cannot derive the actor via current_business_user_id()/auth.uid()
-- because it is invoked from a service-role connection with no user JWT.
-- Instead, authorization is enforced two ways: (1) the GRANT below is
-- service_role ONLY — `authenticated` is deliberately not granted, so no
-- browser client can invoke this directly, which is what actually stops
-- privilege escalation; (2) as defense-in-depth against a loosened grant or
-- an Edge Function bug, the function still verifies p_actor_id names a real
-- anew_users row that currently holds the 'users.create' permission before
-- doing anything else — the same permission anew_users_insert's own RLS
-- check requires. p_actor_id is NOT validated to equal "the session that
-- called the Edge Function" (there is no session at this layer); the Edge
-- Function itself (isAdmin(caller.roleCodes) in create-user/index.ts) is
-- what ties the real HTTP caller identity to admin status before it ever
-- reaches this RPC.
--
-- Called by: supabase/functions/create-user/index.ts, immediately after
-- the auth.users row is resolved (created or found existing), passing
-- p_auth_user_id so this RPC can upsert by that unique key itself. This
-- replaces the Edge Function's own raw insert/update of anew_users AND
-- the frontend's follow-up .from("anew_users").update(...) call in
-- UsersNew.tsx (already removed by the earlier frontend change).
--
-- p_status: the Edge Function always passes 'active' today (both for a
-- fresh user and for a re-invited existing auth user), so on the
-- reused-row path this intentionally mirrors the pre-existing behavior
-- of resetting status to 'active' on re-invite. This is a pre-existing
-- product decision (not introduced by this migration) — flagged here so
-- a future change can make it conditional (e.g. COALESCE against a
-- p_preserve_status flag) if that behavior is ever considered wrong.
--
-- Idempotent: safe to call repeatedly for the same auth_user_id — the
-- ON CONFLICT DO UPDATE branch reproduces the same end state.

CREATE OR REPLACE FUNCTION public.rpc_finalize_user_profile(
  p_auth_user_id      uuid,
  p_actor_id          uuid,
  p_name              text,
  p_email             text,
  p_phone             text,
  p_status            text,
  p_description       text,
  p_position          text,
  p_location          text,
  p_template_id       uuid,
  p_custom_attributes jsonb
)
RETURNS public.anew_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old        public.anew_users;
  v_new        public.anew_users;
  v_org_id     uuid;
  v_diff       jsonb := '{}'::jsonb;
  v_is_insert  boolean;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Defense-in-depth: this RPC is SECURITY DEFINER and therefore bypasses
  -- RLS entirely. It is only meant to be called by the create-user Edge
  -- Function's service-role client (see GRANT below — no `authenticated`
  -- grant exists), but if that grant is ever loosened, or the Edge
  -- Function ever mis-resolves the caller, this guards against a forged
  -- p_actor_id being written into created_by / the audit trail's actor
  -- (app.audit_user_id) by requiring it to reference a real anew_users row
  -- that actually holds 'users.create' — the same permission the plain
  -- anew_users_insert RLS policy requires for a direct client-side insert.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.anew_users au
    WHERE  au.id = p_actor_id
    AND    public.has_anew_permission(au.auth_user_id, 'users.create')
  ) THEN
    RAISE EXCEPTION 'Actor não tem permissão para criar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Consolidate this action's ENTIRE anew_users write (identity + profile
  -- fields) into a single audit row. Must be set before the INSERT below,
  -- since that statement is what would otherwise fire fn_audit_anew_users().
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- Snapshot pre-existing row (if any) for diffing. Row may not exist yet
  -- (fresh user) — that's fine, v_old stays NULL and the diff step below
  -- is skipped in favor of full-record INSERT semantics.
  SELECT * INTO v_old
  FROM public.anew_users
  WHERE auth_user_id = p_auth_user_id
  FOR UPDATE;
  v_is_insert := NOT FOUND;

  INSERT INTO public.anew_users AS u (
    auth_user_id, name, email, phone, status,
    description, position, location, template_id, custom_attributes,
    created_by
  )
  VALUES (
    p_auth_user_id, p_name, p_email, p_phone, COALESCE(p_status, 'active'),
    p_description, p_position, p_location, p_template_id, p_custom_attributes,
    p_actor_id
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    name              = EXCLUDED.name,
    email             = EXCLUDED.email,
    phone             = EXCLUDED.phone,
    status            = COALESCE(EXCLUDED.status, u.status),
    description       = EXCLUDED.description,
    position          = EXCLUDED.position,
    location          = EXCLUDED.location,
    template_id       = EXCLUDED.template_id,
    custom_attributes = EXCLUDED.custom_attributes
  RETURNING u.* INTO v_new;

  IF v_is_insert THEN
    -- Fresh row — log as a single INSERT with the full record, matching
    -- what fn_audit_anew_users() would have written for a plain INSERT.
    SELECT m.organization_id
    INTO   v_org_id
    FROM   public.anew_memberships m
    WHERE  m.user_id = v_new.id
    ORDER BY (m.status = 'active') DESC, m.created_at DESC
    LIMIT  1;

    IF v_org_id IS NOT NULL THEN
      PERFORM set_config('app.audit_user_id', p_actor_id::text, true);
      PERFORM public.fn_manual_audit_log(
        'anew_users', v_new.id, v_org_id, 'INSERT', to_jsonb(v_new), 'web_app'
      );
    END IF;

    RETURN v_new;
  END IF;

  -- ── Reused row (re-invited existing auth user): build diff of actually
  -- changed columns only ───────────────────────────────────────────────
  IF v_old.name IS DISTINCT FROM v_new.name THEN
    v_diff := v_diff || jsonb_build_object('name', jsonb_build_object('old', to_jsonb(v_old.name), 'new', to_jsonb(v_new.name)));
  END IF;
  IF v_old.email IS DISTINCT FROM v_new.email THEN
    v_diff := v_diff || jsonb_build_object('email', jsonb_build_object('old', to_jsonb(v_old.email), 'new', to_jsonb(v_new.email)));
  END IF;
  IF v_old.phone IS DISTINCT FROM v_new.phone THEN
    v_diff := v_diff || jsonb_build_object('phone', jsonb_build_object('old', to_jsonb(v_old.phone), 'new', to_jsonb(v_new.phone)));
  END IF;
  IF v_old.status IS DISTINCT FROM v_new.status THEN
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('old', to_jsonb(v_old.status), 'new', to_jsonb(v_new.status)));
  END IF;
  IF v_old.description IS DISTINCT FROM v_new.description THEN
    v_diff := v_diff || jsonb_build_object('description', jsonb_build_object('old', to_jsonb(v_old.description), 'new', to_jsonb(v_new.description)));
  END IF;
  IF v_old.position IS DISTINCT FROM v_new.position THEN
    v_diff := v_diff || jsonb_build_object('position', jsonb_build_object('old', to_jsonb(v_old.position), 'new', to_jsonb(v_new.position)));
  END IF;
  IF v_old.location IS DISTINCT FROM v_new.location THEN
    v_diff := v_diff || jsonb_build_object('location', jsonb_build_object('old', to_jsonb(v_old.location), 'new', to_jsonb(v_new.location)));
  END IF;
  IF v_old.template_id IS DISTINCT FROM v_new.template_id THEN
    v_diff := v_diff || jsonb_build_object('template_id', jsonb_build_object('old', to_jsonb(v_old.template_id), 'new', to_jsonb(v_new.template_id)));
  END IF;
  IF v_old.custom_attributes IS DISTINCT FROM v_new.custom_attributes THEN
    v_diff := v_diff || jsonb_build_object('custom_attributes', jsonb_build_object('old', v_old.custom_attributes, 'new', v_new.custom_attributes));
  END IF;

  -- Resolve org via the user's membership, same rule as fn_audit_anew_users().
  SELECT m.organization_id
  INTO   v_org_id
  FROM   public.anew_memberships m
  WHERE  m.user_id = v_new.id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  IF v_diff <> '{}'::jsonb AND v_org_id IS NOT NULL THEN
    PERFORM set_config('app.audit_user_id', p_actor_id::text, true);
    PERFORM public.fn_manual_audit_log(
      'anew_users', v_new.id, v_org_id, 'UPDATE', jsonb_build_object('anew_users', v_diff), 'web_app'
    );
  END IF;

  RETURN v_new;
END;
$$;

-- Grant to service_role ONLY. This RPC is SECURITY DEFINER with no
-- auth.uid()-based scoping of the RLS-equivalent kind (it validates
-- p_actor_id has 'users.create' as a defense-in-depth check, but that is
-- not a substitute for a real ownership/session check — p_actor_id is
-- still a plain parameter, not derived from the invoking session's
-- auth.uid()). The only legitimate caller is the create-user Edge
-- Function's service-role client, immediately after resolving/creating
-- the auth.users row via the arg's service-role-only Admin API. Do NOT
-- grant to `authenticated`: a browser-side authenticated client calling
-- this directly could otherwise pass an arbitrary p_auth_user_id and an
-- arbitrary (but permission-holding) p_actor_id to overwrite another
-- user's anew_users profile row.
REVOKE ALL ON FUNCTION public.rpc_finalize_user_profile(uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_user_profile(uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb)
  TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm the function exists with the audit_bypass pattern:
--
--   SELECT proname, prosecdef
--   FROM pg_proc
--   WHERE proname = 'rpc_finalize_user_profile';
--
-- 2. After deploying the paired create-user Edge Function change, creating
--    one new user should produce exactly one entity_audit_log row for
--    anew_users (verify no lingering trigger-fired INSERT row from a raw
--    .insert() plus a second manual UPDATE row from this RPC):
--
--   SELECT table_name, operation, count(*)
--   FROM entity_audit_log
--   WHERE entity_id = '<new-user-id>' AND table_name = 'anew_users'
--   GROUP BY table_name, operation;
--
--   Expected: exactly one row total for that entity_id/table_name pair.
