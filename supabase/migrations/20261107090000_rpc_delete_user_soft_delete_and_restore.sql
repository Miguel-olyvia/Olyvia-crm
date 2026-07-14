-- Users — replace hard DELETE with a recoverable soft-deactivation
-- 2026-11-07 | Module: Utilizadores (Users)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- rpc_delete_user (20261107080000) still runs `DELETE FROM public.anew_users`.
-- That is an irreversible hard delete: if an operator removes the wrong user,
-- or a client later asks to recover one, there is no way back — the profile
-- row is gone and every FK column that still points at it (created_by,
-- entity ownership on leads/deals/quotes/proposals, audit rows, etc.) is left
-- dangling with an id that no longer resolves to anything.
--
-- Decision (confirmed by the user, following the real HubSpot pattern):
-- "Delete user" becomes "Deactivate user" — it revokes login access but keeps
-- the profile row and everything the user created/owns exactly as-is,
-- flagged as belonging to a deactivated user. Nothing is deleted. This is
-- fully recoverable via the new rpc_restore_user below.
--
-- Design
-- ------
-- 1. anew_users gains a `deleted_at timestamptz` column (NULL = active).
--    anew_users.status already exists (`text`, default 'active', NOT NULL,
--    no CHECK constraint) and 'inactive' is already an established
--    active/inactive convention reused across anew_contacts, anew_clients and
--    anew_entity_roles (see 20260619100000, 20260922010000, etc.) — reused
--    here rather than inventing a new status vocabulary. UsersNew.tsx already
--    reads user.status === 'inactive' for its badge and status filter (it was
--    simply never set for anew_users before this migration, since the only
--    write path was the hard DELETE).
-- 2. rpc_delete_user(p_user_id) now does
--      UPDATE anew_users SET status='inactive', deleted_at=now() ...
--    instead of DELETE, inside the SAME single-transaction/audit-bypass
--    pattern already established (fn_manual_audit_log(..., 'web_app')), but
--    the audit operation changes from 'DELETE' to 'UPDATE' (the row is not
--    removed) with a diff scoped to the two columns that actually changed.
--    Ownership columns (created_by, entity_id, auth_user_id, memberships,
--    everything the user created) are left completely untouched — there is
--    no DELETE anymore, so no FK/cascade behavior is triggered at all.
-- 3. rpc_restore_user(p_user_id) is the inverse: status='active',
--    deleted_at=NULL, single UPDATE + one audit row. Same authorization
--    (`users.delete` — see "permission choice" note below).
-- 4. Login is blocked/restored via the paired Edge Functions
--    (supabase/functions/delete-user, supabase/functions/restore-user), NOT
--    from inside this SQL migration: 20260720010000 already established that
--    a SECURITY DEFINER RPC cannot perform auth.users admin operations in
--    this project (GoTrue Admin API only, via service-role Edge Functions).
--    delete-user now calls `auth.admin.updateUserById(userId, { ban_duration })`
--    with a very long duration (~100 years — Supabase Auth has no literal
--    "forever" value, so an extremely long ban_duration is the documented
--    convention for "until manually unbanned") instead of
--    `auth.admin.deleteUser()`, and also calls `auth.admin.signOut(userId,
--    'global')` to invalidate any already-issued refresh tokens immediately.
--    restore-user reverses the ban with `ban_duration: 'none'`.
--
-- Permission choice
-- -----------------
-- rpc_restore_user reuses `users.delete` rather than introducing a new
-- `users.restore` permission code. Restoring is the direct inverse of the
-- same destructive-adjacent action (deactivating a user) and is only ever
-- reachable from the same admin surface (UsersNew.tsx) already gated behind
-- `users.delete` + the same ownership/hierarchy guards (canDeleteUser). Adding
-- a second permission code would only fragment role configuration for zero
-- practical benefit (YAGNI) — anyone trusted to deactivate a user is already
-- trusted to undo that action.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql    — anew_users, has_anew_permission()
--   20260709010000_users_audit_triggers.sql      — fn_audit_anew_users() + trigger
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass GUC + fn_manual_audit_log()
--   20260720010000_users_audit_bypass_and_rpcs.sql — audit-bypass guard, auth.users admin-op constraint
--   20261107080000_rpc_delete_user_audit_source_fix.sql — rpc_delete_user (single-tx audit source fix)


-- ============================================================
-- Schema: anew_users.deleted_at
-- ============================================================

ALTER TABLE public.anew_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

COMMENT ON COLUMN public.anew_users.deleted_at IS
  'Set when the user is deactivated via rpc_delete_user; NULL means active. '
  'Reversible via rpc_restore_user. The row itself is never removed.';


-- ============================================================
-- rpc_delete_user(p_user_id) — soft-deactivate (was: hard DELETE)
-- ============================================================

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

  -- Idempotency guard: nothing to do (and nothing new to audit) if the user
  -- is already deactivated.
  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Utilizador já está inativo' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve org for the audit row exactly as fn_audit_anew_users would ───
  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  -- ── Soft-deactivate: no DELETE, ownership/created_by of every record this
  --    user created remains completely untouched. ───────────────────────────
  UPDATE public.anew_users
  SET    status     = 'inactive',
         deleted_at = now(),
         updated_at = now()
  WHERE  id = p_user_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('inactive'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
  );

  -- Skip silently when the user has no membership yet (fn_audit_anew_users
  -- does the same — an org-less user cannot be attributed to any org's log).
  IF v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_user(uuid) TO authenticated;


-- ============================================================
-- rpc_restore_user(p_user_id) — reverse a soft-deactivation
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_user(
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
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Reuses `users.delete`: restoring is the direct inverse of deactivating,
  -- reachable only from the same admin surface — see migration header note.
  IF NOT public.has_anew_permission(auth.uid(), 'users.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Utilizador já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  UPDATE public.anew_users
  SET    status     = 'active',
         deleted_at = NULL,
         updated_at = now()
  WHERE  id = p_user_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('active'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
  );

  IF v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_user(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Deactivating a test user produces exactly ONE entity_audit_log row,
--    operation='UPDATE', source='web_app', and the anew_users row still
--    exists with status='inactive' and deleted_at set:
--
--   SELECT status, deleted_at FROM public.anew_users WHERE id = '<id>';
--   SELECT source, changed_by, operation, table_name, diff, created_at
--   FROM public.entity_audit_log
--   WHERE table_name = 'anew_users' AND entity_id = '<id>'
--   ORDER BY created_at DESC LIMIT 2;
--
-- 2. Restoring reverses status/deleted_at and appends a second audit row —
--    it never touches any other table (leads/deals/quotes/proposals created
--    by this user keep their created_by unchanged the whole time).
--
-- 3. A caller without users.delete raises insufficient_privilege on both
--    rpc_delete_user and rpc_restore_user.
