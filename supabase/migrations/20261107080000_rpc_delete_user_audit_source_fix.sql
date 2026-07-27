-- Users — fix NULL audit `source` on delete by consolidating into a single RPC
-- 2026-11-07 | Module: Utilizadores (Users)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- src/pages/UsersNew.tsx::handleDelete wraps the anew_users DELETE in
-- withAuditContext(), which issues TWO independent PostgREST calls, each its
-- own Postgres transaction:
--   1. supabase.rpc('set_audit_context', { p_user_id, p_source: 'web_app' })
--   2. supabase.from('anew_users').delete().eq('id', deleteUserId)
--
-- set_audit_context() uses set_config(..., true) — SET LOCAL — so the GUCs
-- (app.audit_user_id / app.audit_source) it sets are scoped to call #1's own
-- transaction and are gone by the time call #2 opens its own, separate
-- transaction. fn_audit_anew_users() (20260709010000 / 20260720010000) then
-- fires on the DELETE with both GUCs unset:
--   · changed_by still resolves correctly via its COALESCE(v_user_id,
--     current_business_user_id()) fallback — current_business_user_id() reads
--     auth.uid() from the caller's own JWT-authenticated session, which IS
--     present on call #2 regardless of the GUC.
--   · source has NO equivalent fallback — v_source := current_setting(
--     'app.audit_source', true) simply resolves to NULL, and every "delete
--     user" audit row is written with source = NULL, unlike create/update
--     (which both go through single-transaction RPCs: create-user's
--     rpc_finalize_user_profile_full and rpc_update_user, each of which pass
--     the literal 'web_app' straight into fn_manual_audit_log(...) inside the
--     SAME function invocation/transaction that performs the writes).
--
-- Solution
-- --------
-- Add rpc_delete_user(p_user_id), mirroring the established pattern already
-- used for rpc_update_user / rpc_delete_role: SECURITY DEFINER, single
-- transaction, app.audit_bypass = 'on' so fn_audit_anew_users() (which already
-- has the bypass guard since 20260720010000) writes nothing, and an explicit
-- fn_manual_audit_log(..., 'web_app') call performs the ONE consolidated write.
-- UsersNew.tsx::handleDelete now calls this RPC instead of
-- withAuditContext + a separate .from('anew_users').delete() call.
--
-- The delete-user Edge Function (auth.admin.deleteUser, service-role, GoTrue
-- Admin API) is unchanged: it only ever removes the auth.users identity and
-- never touches public.anew_users, so it has no bearing on this audit row
-- (see the NOTE comment already in supabase/functions/delete-user/index.ts).
--
-- Authorization / RLS parity
-- --------------------------
-- rpc_delete_user is SECURITY DEFINER, so RLS on anew_users does NOT
-- self-enforce inside it. It re-checks the SAME predicate anew_users_delete
-- enforces today (baseline 20260615130000, ~line 23748):
--   USING (has_anew_permission(auth.uid(), 'users.delete'))
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql        — entity_audit_log
--   20260709010000_users_audit_triggers.sql    — fn_audit_anew_users() + trigger
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass GUC + fn_manual_audit_log()
--   20260720010000_users_audit_bypass_and_rpcs.sql — audit-bypass guard on fn_audit_anew_users()
--   20260615130000_baseline_new_database.sql   — has_anew_permission(), current_business_user_id()


-- ============================================================
-- rpc_delete_user(p_user_id)
-- ============================================================
-- Mirrors the DELETE branch of handleDelete in src/pages/UsersNew.tsx:
--   · DELETE FROM anew_users WHERE id = p_user_id
-- Runs entirely inside one transaction with app.audit_bypass = 'on' and emits
-- exactly ONE consolidated entity_audit_log row (table_name='anew_users',
-- operation='DELETE', source='web_app'). Returns void.

CREATE OR REPLACE FUNCTION public.rpc_delete_user(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_before     public.anew_users;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  -- Consolidate this action into a single audit row (fn_audit_anew_users
  -- short-circuits while this GUC is 'on' — 20260720010000).
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_users_delete RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'users.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Resolve org for the audit row exactly as fn_audit_anew_users would ───
  -- (most relevant membership: active first, then most recently created).
  -- Captured BEFORE the DELETE in case memberships are removed alongside it.
  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  DELETE FROM public.anew_users WHERE id = p_user_id;

  -- ── Full-record-style diff (all meaningful columns old -> NULL) ──────────
  -- Same convention as rpc_delete_role's combined diff for a removed row.
  v_diff := jsonb_build_object(
    'name',              jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
    'email',             jsonb_build_object('old', to_jsonb(v_before.email), 'new', NULL),
    'phone',             jsonb_build_object('old', to_jsonb(v_before.phone), 'new', NULL),
    'status',            jsonb_build_object('old', to_jsonb(v_before.status), 'new', NULL),
    'description',       jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
    'position',          jsonb_build_object('old', to_jsonb(v_before.position), 'new', NULL),
    'location',          jsonb_build_object('old', to_jsonb(v_before.location), 'new', NULL),
    'template_id',       jsonb_build_object('old', to_jsonb(v_before.template_id), 'new', NULL),
    'custom_attributes', jsonb_build_object('old', v_before.custom_attributes, 'new', NULL),
    'auth_user_id',      jsonb_build_object('old', to_jsonb(v_before.auth_user_id), 'new', NULL)
  );

  -- Skip silently when the user has no membership yet (fn_audit_anew_users
  -- does the same — an org-less user cannot be attributed to any org's log).
  IF v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'DELETE', v_diff, 'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_user(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Deleting a test user produces exactly ONE entity_audit_log row with
--    source = 'web_app' (not NULL) and changed_by = the deleting operator's
--    anew_users.id:
--
--   SELECT source, changed_by, operation, table_name, created_at
--   FROM public.entity_audit_log
--   WHERE table_name = 'anew_users' AND operation = 'DELETE'
--   ORDER BY created_at DESC
--   LIMIT 1;
--
-- 2. A caller without users.delete raises insufficient_privilege:
--
--   SELECT public.rpc_delete_user('<some-user-id>');
--   -- Expected (as a non-privileged authenticated role): insufficient_privilege
