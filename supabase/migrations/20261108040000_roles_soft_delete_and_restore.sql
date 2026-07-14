-- Roles — replace hard DELETE with a recoverable soft-deactivation
-- 2026-11-08 | Module: Roles (Permissões / Configurações)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- rpc_delete_role currently runs
--   DELETE FROM anew_role_permissions WHERE role_id = p_id;
--   DELETE FROM anew_roles WHERE id = p_id;
-- This is an irreversible hard delete: the exact permission configuration a
-- role had is gone, and any historical record of "who had this role" becomes
-- unrecoverable once the role row itself disappears (anew_memberships.role_id
-- is left pointing at a role id that no longer resolves to anything).
--
-- Decision (same recoverability principle as Leads/Contacts/Clients/Deals/
-- Propostas/Orçamentos/Contratos/Organizações/Users): "Delete role" becomes a
-- soft-deactivation, fully reversible via a paired restore RPC.
-- anew_role_permissions rows are NEVER deleted by this flow anymore — the
-- permission configuration is preserved exactly as it was, so restoring
-- brings the role back with the identical permission set it had before.
--
-- Design
-- ------
-- 1. anew_roles gains two columns:
--      status     text NOT NULL DEFAULT 'active'  (mirrors the
--                 active/inactive convention already used across
--                 anew_contacts/anew_clients/anew_entity_roles/anew_users)
--      deleted_at timestamptz                     (NULL = active; reversible)
--    anew_roles previously had no status/soft-delete concept at all (it is
--    the only one of the audited tables in this group without one), so both
--    columns are new here.
-- 2. rpc_delete_role(p_id) now does
--      UPDATE anew_roles SET status='inactive', deleted_at=now(), updated_at=now()
--    instead of the two DELETEs. anew_role_permissions is left completely
--    untouched — no snapshot/restore dance needed for it since it was never
--    written to begin with.
-- 3. rpc_restore_role(p_id) is the inverse: status='active', deleted_at=NULL.
--    Same authorization (`roles.delete`, mirroring the rpc_restore_user
--    reasoning: restoring is the direct inverse of the same
--    destructive-adjacent action, reachable only from the same admin surface
--    already gated behind roles.delete).
-- 4. Both keep the existing single-transaction/single-audit-row pattern
--    (fn_manual_audit_log, 'web_app' source, audit-bypass GUC so the
--    anew_roles trigger doesn't ALSO fire its own row), but the recorded
--    operation changes from 'DELETE' to 'UPDATE' (the row is not removed).
-- 5. System roles remain fully protected: the existing is_system guard (both
--    in rpc_delete_role and the BEFORE protect_system_roles trigger) is kept
--    verbatim — is_system roles can never be deleted OR restored through
--    this path (they can never reach deleted_at <> NULL in the first place).
-- 6. UI: Roles.tsx's role list query already does `.order("name")` with no
--    status filter, so a soft-deactivated role would otherwise keep showing
--    exactly as before. This migration is paired with a Roles.tsx change
--    (frontend-only, no separate migration) that filters
--    `deleted_at IS NULL` by default with a "Mostrar eliminadas" toggle that
--    surfaces a Restore action instead of Edit/Delete for deactivated roles.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql        — anew_roles, anew_role_permissions
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — rpc_create/update/delete_role (current body)
--   20261107090000_rpc_delete_user_soft_delete_and_restore.sql — reference pattern this migration follows


-- ============================================================
-- Schema: anew_roles.status / anew_roles.deleted_at
-- ============================================================

ALTER TABLE public.anew_roles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.anew_roles
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

COMMENT ON COLUMN public.anew_roles.status IS
  'active | inactive. Set to inactive by rpc_delete_role; reverted to active by rpc_restore_role.';
COMMENT ON COLUMN public.anew_roles.deleted_at IS
  'Set when the role is soft-deleted via rpc_delete_role; NULL means active. '
  'Reversible via rpc_restore_role. anew_role_permissions is never touched by this flow.';

CREATE INDEX IF NOT EXISTS idx_anew_roles_deleted_at
  ON public.anew_roles (deleted_at)
  WHERE deleted_at IS NOT NULL;


-- ============================================================
-- rpc_delete_role(p_id) — soft-deactivate (was: hard DELETE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_role(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.anew_roles;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── System-role guard (mirrors canDeleteRole !is_system + BEFORE trigger) ─
  IF v_before.is_system = true THEN
    RAISE EXCEPTION 'Roles de sistema não podem ser eliminadas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization parity with anew_roles_delete RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency guard: nothing to do (and nothing new to audit) if the role
  -- is already deactivated.
  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Role já está inativa' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Soft-deactivate: anew_role_permissions is left completely untouched,
  --    so the exact permission set survives for a future restore. ───────────
  UPDATE public.anew_roles
  SET status = 'inactive', deleted_at = now(), updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('inactive'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_role(uuid) TO authenticated;


-- ============================================================
-- rpc_restore_role(p_id) — reverse a soft-deactivation
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_role(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.anew_roles;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Reuses `roles.delete`: restoring is the direct inverse of deactivating,
  -- reachable only from the same admin surface — see migration header note.
  IF NOT public.has_anew_permission(auth.uid(), 'roles.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Role já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.anew_roles
  SET status = 'active', deleted_at = NULL, updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('active'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_role(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Deactivating a test role produces exactly ONE entity_audit_log row,
--    operation='UPDATE', source='web_app', and the anew_roles row still
--    exists with status='inactive'/deleted_at set, and every
--    anew_role_permissions row for that role_id is completely untouched:
--
--   SELECT status, deleted_at FROM public.anew_roles WHERE id = '<id>';
--   SELECT count(*) FROM public.anew_role_permissions WHERE role_id = '<id>';
--   SELECT source, changed_by, operation, table_name, diff, created_at
--   FROM public.entity_audit_log
--   WHERE table_name = 'anew_roles' AND entity_id = '<id>'
--   ORDER BY created_at DESC LIMIT 2;
--
-- 2. Restoring reverses status/deleted_at and appends a second audit row,
--    with the exact same permission set as before deletion (no re-grant
--    needed — anew_role_permissions was never modified).
--
-- 3. Attempting rpc_delete_role/rpc_restore_role on a system role, or on a
--    role outside the caller's visible orgs, raises insufficient_privilege,
--    same as before this migration.
--
-- 4. A caller without roles.delete raises insufficient_privilege on both
--    rpc_delete_role and rpc_restore_role.
