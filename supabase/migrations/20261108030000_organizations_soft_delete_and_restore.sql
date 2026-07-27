-- Organizations — replace hard-delete cascade with a recoverable soft-delete
-- 2026-11-08 | Module: Organizações (Organizations / Org Chart)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- rpc_delete_organization -> delete_organization_subtree(root) currently runs
--   DELETE FROM anew_hierarchy ... ; DELETE FROM anew_organizations ...
-- for the ENTIRE hierarchical subtree (root + every descendant department/
-- sub-company). This is an irreversible hard delete: deleting the wrong
-- holding/empresa wipes every department under it, with no way back, and
-- every FK column still pointing at those org ids (created_by-adjacent
-- references, historical audit rows, memberships, roles scoped to that org,
-- etc.) is left dangling.
--
-- Decision (same recoverability principle already applied to Leads/Contacts/
-- Clients/Deals/Propostas/Orçamentos/Contratos/Users): "Delete organization"
-- becomes "soft-delete the whole subtree", fully reversible via a paired
-- restore RPC. Nothing is removed — anew_hierarchy links and anew_organizations
-- rows for the whole subtree stay intact, just flagged.
--
-- Design
-- ------
-- 1. anew_organizations gains `deleted_at timestamptz` (NULL = active). The
--    existing `status` column (default 'active', already used by the FE for
--    a *business* lifecycle: active/draft/inactive, freely editable by the
--    user on the org form) is intentionally left untouched by delete/restore
--    — conflating "user marked this org inactive" with "this org's subtree
--    was deleted" would make status revert unpredictable on restore. This
--    mirrors the dedicated deleted_at convention already used by
--    anew_clients/anew_contacts/anew_leads/deals/quotes/proposals/
--    client_contracts (see src/pages/Trash.tsx) rather than the status-reuse
--    approach taken for anew_users (which had no competing business-status
--    use of its own 'inactive' value).
-- 2. delete_organization_subtree(root) — same recursive subtree resolution
--    (via anew_hierarchy) it already had, but the two DELETEs are replaced by
--    a single UPDATE ... SET deleted_at = now() over the whole subtree.
--    Authorization, signature and return shape (uuid[] of affected subtree
--    ids) are unchanged, so rpc_delete_organization (and anything else that
--    calls it) needs no signature changes.
-- 3. restore_organization_subtree(root) — the mirror: UPDATE ... SET
--    deleted_at = NULL over the same recursively-resolved subtree. Same
--    authorization as delete (organizations.delete + visible-org check),
--    matching the "restoring is the inverse of the same destructive-adjacent
--    action" reasoning already used for rpc_restore_user.
-- 4. rpc_delete_organization / rpc_restore_organization: the outer audit
--    wrappers keep their existing single-transaction/single-audit-row shape
--    (fn_manual_audit_log, 'web_app' source) but the recorded operation
--    changes from 'DELETE' to 'UPDATE' (rows are not removed anymore) with a
--    diff scoped to deleted_at + a snapshot of the affected subtree ids.
--    Both gain an idempotency guard (root already deleted / already active).
-- 5. get_user_work_orgs() — the company-switcher source of truth — gains an
--    explicit `deleted_at IS NULL` predicate in both branches (sysadmin and
--    regular). Without this, a soft-deleted work-org would still resolve as
--    active (it keeps status='active' and is_work_org=true) and keep showing
--    in the switcher despite being "deleted" from the Organizations UI.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql          — anew_organizations, anew_hierarchy
--   20260722010000_organizations_audit_bypass_and_rpcs.sql — rpc_create/update/delete_organization
--   20260818010000_fix_anon_exposed_destructive_functions_record.sql — delete_organization_subtree (current body)
--   20260925010000_work_org_rpcs_phase2.sql            — get_user_work_orgs()
--   20261107090000_rpc_delete_user_soft_delete_and_restore.sql — reference pattern this migration follows


-- ============================================================
-- Schema: anew_organizations.deleted_at
-- ============================================================

ALTER TABLE public.anew_organizations
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

COMMENT ON COLUMN public.anew_organizations.deleted_at IS
  'Set when this organization''s subtree is soft-deleted via rpc_delete_organization; '
  'NULL means active. Reversible via rpc_restore_organization. Rows and anew_hierarchy '
  'links are never removed. Independent of the business-lifecycle `status` column.';

CREATE INDEX IF NOT EXISTS idx_anew_organizations_deleted_at
  ON public.anew_organizations (deleted_at)
  WHERE deleted_at IS NOT NULL;


-- ============================================================
-- delete_organization_subtree(root) — soft-delete cascade (was: hard DELETE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_organization_subtree(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_root_org_id IS NULL THEN
    RAISE EXCEPTION 'root_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_root_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT (p_root_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT array_agg(org_id) INTO v_ids FROM subtree;

  -- Soft-delete: mark the whole subtree instead of removing rows/links, so
  -- the operation is fully reversible via restore_organization_subtree().
  UPDATE public.anew_organizations
  SET deleted_at = now(), updated_at = now()
  WHERE id = ANY(v_ids)
    AND deleted_at IS NULL;

  RETURN v_ids;
END;
$function$;


-- ============================================================
-- restore_organization_subtree(root) — reverse a soft-delete cascade
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_organization_subtree(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_root_org_id IS NULL THEN
    RAISE EXCEPTION 'root_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_root_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT (p_root_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reuses organizations.delete: restoring is the direct inverse of the same
  -- destructive-adjacent action, reachable only from the same admin surface.
  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT array_agg(org_id) INTO v_ids FROM subtree;

  UPDATE public.anew_organizations
  SET deleted_at = NULL, updated_at = now()
  WHERE id = ANY(v_ids)
    AND deleted_at IS NOT NULL;

  RETURN v_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_organization_subtree(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_organization_subtree(uuid) TO authenticated, service_role;


-- ============================================================
-- rpc_delete_organization(...) — audit wrapper, now records an UPDATE
-- ============================================================
-- Mirrors handleConfirmDelete in src/pages/Organizations.tsx. Same
-- authorization parity with authenticated_delete_anew_organizations RLS
-- (org visible AND organizations.manage), checked on the ROOT; the cascade
-- soft-deletes the whole subtree via delete_organization_subtree (which
-- separately re-checks organizations.delete + visibility on the root, same
-- as before this migration).

CREATE OR REPLACE FUNCTION public.rpc_delete_organization(
  p_root_org_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_deleted     uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_delete_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency guard: nothing to do (and nothing new to audit) if the root
  -- is already soft-deleted.
  IF v_root.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Organização já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Snapshot the subtree (root + descendants) BEFORE marking, for the diff ─
  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  -- ── Soft-delete cascade — reuse the existing atomic RPC verbatim ─────────
  v_deleted := public.delete_organization_subtree(p_root_org_id);

  -- ── Combined diff: deleted_at flip + full snapshot of the affected subtree ─
  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_root.deleted_at), 'new', to_jsonb(now()))
    ),
    'subtree', jsonb_build_object('old', v_subtree, 'new', NULL)
  );

  -- Self-org: organization_id = entity_id = the root org's own id.
  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'UPDATE', v_diff, 'web_app'
  );

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_organization(uuid) TO authenticated;


-- ============================================================
-- rpc_restore_organization(...) — reverse a soft-deleted subtree
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_organization(
  p_root_org_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_restored    uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'organizations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_root.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Organização já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  v_restored := public.restore_organization_subtree(p_root_org_id);

  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_root.deleted_at), 'new', NULL)
    ),
    'subtree', jsonb_build_object('old', NULL, 'new', v_subtree)
  );

  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'UPDATE', v_diff, 'web_app'
  );

  RETURN v_restored;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_organization(uuid) TO authenticated;


-- ============================================================
-- get_user_work_orgs() — exclude soft-deleted orgs from the company switcher
-- ============================================================
-- Same body as 20260925010000_work_org_rpcs_phase2.sql, with an added
-- `AND o.deleted_at IS NULL` / `AND wo.deleted_at IS NULL` predicate in both
-- branches so a soft-deleted work_org (which otherwise still has
-- status='active' and is_work_org=true) stops appearing as a switchable
-- company the moment it is soft-deleted.

CREATE OR REPLACE FUNCTION public.get_user_work_orgs()
RETURNS TABLE (
  id uuid,
  name text,
  membership_type text,
  via_org_id uuid,
  via_org_name text,
  roles text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid       uuid := auth.uid();
  v_anew_user_id   uuid;
  v_is_sysadmin    boolean;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT au.id INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
    AND au.status = 'active';

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT public.is_system_admin(v_auth_uid) INTO v_is_sysadmin;

  IF v_is_sysadmin THEN
    RETURN QUERY
    SELECT
      o.id,
      o.name,
      'system_admin'::text AS membership_type,
      NULL::uuid AS via_org_id,
      NULL::text AS via_org_name,
      COALESCE(ARRAY(
        SELECT DISTINCT ar.code
        FROM public.anew_memberships am
        JOIN public.anew_roles ar ON ar.id = am.role_id
        WHERE am.user_id = v_anew_user_id
          AND am.status = 'active'
          AND am.organization_id = o.id
      ), ARRAY[]::text[]) AS roles
    FROM public.anew_organizations o
    WHERE o.is_work_org = true
      AND o.status = 'active'
      AND o.deleted_at IS NULL
    ORDER BY o.name;
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE membership_orgs AS (
    SELECT DISTINCT am.organization_id AS start_org_id
    FROM public.anew_memberships am
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
  ),
  ancestor_walk AS (
    SELECT mo.start_org_id, mo.start_org_id AS current_org_id, 0 AS depth, ARRAY[mo.start_org_id] AS path
    FROM membership_orgs mo
    UNION ALL
    SELECT aw.start_org_id, h.parent_org_id, aw.depth + 1, aw.path || h.parent_org_id
    FROM ancestor_walk aw
    JOIN public.anew_hierarchy h ON h.child_org_id = aw.current_org_id
    WHERE lower(h.relationship_type) IN ('parent_of', 'parent_child')
      AND aw.depth < 20
      AND NOT (h.parent_org_id = ANY(aw.path))
  ),
  resolved AS (
    SELECT DISTINCT ON (aw.start_org_id)
      aw.start_org_id, aw.current_org_id AS work_org_id, aw.depth
    FROM ancestor_walk aw
    JOIN public.anew_organizations wo ON wo.id = aw.current_org_id
    WHERE wo.is_work_org = true AND wo.status = 'active' AND wo.deleted_at IS NULL
    ORDER BY aw.start_org_id, aw.depth ASC
  ),
  member_roles AS (
    SELECT am.organization_id AS start_org_id, ar.code AS role_code
    FROM public.anew_memberships am
    JOIN public.anew_roles ar ON ar.id = am.role_id
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
  ),
  via_pick AS (
    SELECT DISTINCT ON (r.work_org_id)
      r.work_org_id, r.start_org_id AS via_org_id
    FROM resolved r
    WHERE r.depth > 0
    ORDER BY r.work_org_id, r.depth ASC, r.start_org_id ASC
  )
  SELECT
    wo.id,
    wo.name,
    CASE WHEN bool_or(r.depth = 0) THEN 'direct' ELSE 'via_department' END AS membership_type,
    CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vp.via_org_id END AS via_org_id,
    CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vo.name END AS via_org_name,
    COALESCE(ARRAY(
      SELECT DISTINCT mr.role_code
      FROM resolved r2
      JOIN member_roles mr ON mr.start_org_id = r2.start_org_id
      WHERE r2.work_org_id = wo.id
    ), ARRAY[]::text[]) AS roles
  FROM resolved r
  JOIN public.anew_organizations wo ON wo.id = r.work_org_id
  LEFT JOIN via_pick vp ON vp.work_org_id = r.work_org_id
  LEFT JOIN public.anew_organizations vo ON vo.id = vp.via_org_id
  GROUP BY wo.id, wo.name, vp.via_org_id, vo.name
  ORDER BY wo.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_work_orgs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_work_orgs() TO authenticated, service_role;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Deleting a 3-org subtree (root + 2 departments) leaves all 3 rows in
--    anew_organizations and all their anew_hierarchy links intact, only
--    deleted_at set on all 3:
--   SELECT id, name, deleted_at FROM public.anew_organizations WHERE id = ANY('{...}');
--
-- 2. Exactly ONE entity_audit_log row per action, operation='UPDATE',
--    source='web_app':
--   SELECT operation, source, diff FROM public.entity_audit_log
--   WHERE table_name = 'anew_organizations' AND entity_id = '<root-id>'
--   ORDER BY created_at DESC LIMIT 2;
--
-- 3. Restoring reverses deleted_at on the whole subtree and appends a second
--    audit row; the org and its children reappear once the FE filters on
--    deleted_at IS NULL.
--
-- 4. A soft-deleted work_org no longer appears in get_user_work_orgs() for
--    any of its former members, even though status stays 'active'.
--
-- 5. Calling rpc_delete_organization on an already-deleted root, or
--    rpc_restore_organization on an already-active root, raises
--    no_data_found. Calling either without organizations.manage, or on an
--    org outside the caller's visible orgs, raises insufficient_privilege.
