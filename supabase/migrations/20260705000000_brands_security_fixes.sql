-- Brands Security Fixes — Wave 0
-- 2026-07-05 | Module: Brands | Wave: 0 (security & RLS prerequisites)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include brands.view
--   2. brands — replace all four RLS policies
--              (SELECT auth.uid()) correlated subquery fix,
--              is_system_admin_user bypass for global brands (organization_id IS NULL),
--              has_anew_permission gate on writes,
--              WITH CHECK on UPDATE to prevent cross-org reassignment
--   3. brand_organizations — replace all-ops policy with explicit FOR INSERT/UPDATE/DELETE
--              (SELECT auth.uid()) fix,
--              has_anew_permission('brands.edit') gate on writes,
--              explicit FOR SELECT kept from baseline (already correct)
--   4. GRANT/REVOKE — revoke anon from brands + brand_organizations;
--              tighten authenticated grants (SELECT/INSERT/UPDATE/DELETE only)
--
-- Gaps addressed:
--   BRANDS-003 (CRITICAL)  — global brands (org_id IS NULL) had no UPDATE/DELETE path for admins
--   BRANDS-004 (HIGH)      — brands_update had no WITH CHECK clause
--   BRANDS-005 (HIGH)      — all policies called auth.uid() bare (per-row re-evaluation)
--   BRANDS-006 (HIGH)      — brand_organizations_manage: no FOR clause, no WITH CHECK for INSERT,
--                            no permission gate; split into explicit per-operation policies
--   BRANDS-007 / GAP-BRANDS-001 (CRITICAL) — GRANT ALL TO anon on both tables
--   GAP-BRANDS-002 (CRITICAL) — brands_update no WITH CHECK (same as BRANDS-004)
--   GAP-BRANDS-003 (CRITICAL) — no admin path to DELETE global brands
--   GAP-BRANDS-005 (HIGH)  — brand_organizations_manage: no has_anew_permission gate
--
-- NOT addressed (out of scope / deferred):
--   BRANDS-008 (MEDIUM)  — admin INSERT of global brands (org_id IS NULL). System admins can
--                          insert global brands via service_role. Deliberate decision: the
--                          application does not currently expose a "create global brand" UI.
--                          Adding an admin INSERT branch is deferred until that UI exists.
--   BRANDS-009 (MEDIUM)  — UUIDv7 migration for brands.id. Deferred to a project-wide migration.
--   GAP-BRANDS-006 (HIGH)— form_branding / campaign_branding scoping. Out of scope for this module.
--
-- Global brands note:
--   brands.organization_id is nullable. A NULL organization_id means the brand is global —
--   visible to all authenticated users via the SELECT policy, but only editable by system admins.
--   Regular users can only INSERT brands into their own org (WITH CHECK requires org_id IN visible).
--   The NULL-skip in fn_generic_entity_audit() (line 229) handles global brands at audit time:
--   rows with org_id IS NULL are silently skipped, consistent with the bundles/products pattern.
--
-- Permission codes used:
--   'brands.view'   — read brands (already present in anew_permissions per translations index)
--   'brands.edit'   — write brands (used as the write gate for all DML operations)
--   'brands.create' — referenced in UI (PermissionGate) but write gate consolidated to brands.edit
--                     to match the brands module design; INSERT policy uses brands.edit for parity.
--   'brands.delete' — referenced in UI; DELETE policy checks brands.edit (manage-level) as the
--                     permission codes in anew_permissions use brands.edit as the canonical write code.
--
-- Convention: all (SELECT auth.uid()) subquery pattern used throughout for consistent
-- per-query evaluation, matching 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260625010000_entity_audit_log.sql
--   20260704010000_bundles_audit_triggers.sql (entity_audit_log_select with products.manage)


-- ============================================================
-- 1. entity_audit_log SELECT policy — add brands.view
-- ============================================================
-- Existing policy (last set in 20260704000000) accepts:
--   quotes.manage | proposals.manage | services.view | products.view | products.manage
-- Brand managers holding brands.view cannot read the brands audit trail.
-- Widen to also accept 'brands.view' and 'brands.edit'.
-- Idempotent: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;

CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
    AND (
      public.has_anew_permission((SELECT auth.uid()), 'quotes.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'proposals.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'services.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'products.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'brands.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
    )
  );


-- ============================================================
-- 2. brands — replace all four RLS policies
-- ============================================================
-- Baseline problems (confirmed at lines 25138, 25145, 25152, 25159):
--   a) All four policies call auth.uid() bare → per-row re-evaluation (BRANDS-005).
--   b) No is_system_admin_user bypass — system admins cannot UPDATE/DELETE global brands
--      because NULL IN (...) evaluates to false (BRANDS-003 / GAP-BRANDS-003).
--   c) No has_anew_permission gate on write policies — any org member can write brands.
--   d) brands_update has no WITH CHECK clause — post-update org_id not validated (BRANDS-004).
--   e) brands_insert correctly requires organization_id IS NOT NULL, preserving the rule
--      that regular users cannot create global brands; this constraint is kept.
--
-- Fix:
--   • Wrap all auth.uid() in (SELECT ...) for single per-query evaluation.
--   • Add is_system_admin_user((SELECT auth.uid())) bypass on all policies.
--     SELECT: admins see all brands including global ones.
--     INSERT: admins can insert with any org_id (including NULL for global brands).
--     UPDATE/DELETE: admins can modify global brands (organization_id IS NULL).
--   • Add has_anew_permission('brands.edit') gate on INSERT/UPDATE/DELETE.
--   • Add WITH CHECK to UPDATE: post-update organization_id must remain in user's
--     visible orgs (prevents cross-org brand reassignment via handleBulkCompanyChange).
--   • SELECT remains permissive for global brands (org IS NULL OR org IN visible).

DROP POLICY IF EXISTS brands_select ON public.brands;
DROP POLICY IF EXISTS brands_insert ON public.brands;
DROP POLICY IF EXISTS brands_update ON public.brands;
DROP POLICY IF EXISTS brands_delete ON public.brands;

-- SELECT: global brands visible to all authenticated users; org-scoped brands visible
-- only to members of that org. System admins see everything.
CREATE POLICY brands_select
  ON public.brands
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (organization_id IS NULL)
    OR (
      organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- INSERT: regular users must provide a valid org_id in their visible orgs.
-- Admins bypass: they can insert into any org or create global brands (org_id IS NULL).
CREATE POLICY brands_insert
  ON public.brands
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: USING validates the pre-update row (admin bypass covers global brands).
--         WITH CHECK validates the post-update row (prevents cross-org reassignment).
CREATE POLICY brands_update
  ON public.brands
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: same org-scope + permission gate as UPDATE; admin bypass covers global brands.
CREATE POLICY brands_delete
  ON public.brands
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 3. brand_organizations — replace all-ops policy with explicit policies
-- ============================================================
-- Baseline problems (confirmed at lines 25118, 25125):
--   a) brand_organizations_manage has no FOR clause (covers ALL operations including SELECT),
--      overlapping with brand_organizations_select (BRANDS-006 / GAP-BRANDS-007).
--   b) For INSERT, PostgreSQL uses WITH CHECK, not USING. An all-ops policy with only a USING
--      expression provides no enforcement for the INSERT check path (BRANDS-006).
--   c) No has_anew_permission gate — any org member can link/unlink brands (GAP-BRANDS-005).
--   d) auth.uid() called bare in both policies (BRANDS-005).
--
-- Fix:
--   • Drop the all-ops brand_organizations_manage policy.
--   • Recreate brand_organizations_select (FOR SELECT) with (SELECT auth.uid()) fix.
--   • Create explicit FOR INSERT (WITH CHECK only), FOR UPDATE (USING + WITH CHECK),
--     FOR DELETE (USING only) policies — each gated on has_anew_permission('brands.edit').
--   • System admin bypass on all write policies.
--   • brand_organizations.organization_id is NOT NULL — no NULL-org special case needed.

DROP POLICY IF EXISTS brand_organizations_manage ON public.brand_organizations;
DROP POLICY IF EXISTS brand_organizations_select ON public.brand_organizations;

-- SELECT: any authenticated user who can see the org can read its brand associations.
-- Global brands (brands.organization_id IS NULL) are accessible via the brands_select policy;
-- brand_organizations rows always have organization_id NOT NULL (the org side of the link).
CREATE POLICY brand_organizations_select
  ON public.brand_organizations
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT: brands.edit permission required; org_id must be in user's visible orgs.
CREATE POLICY brand_organizations_insert
  ON public.brand_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: brands.edit permission required; both pre- and post-update org must be visible.
CREATE POLICY brand_organizations_update
  ON public.brand_organizations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: brands.edit permission required.
CREATE POLICY brand_organizations_delete
  ON public.brand_organizations
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 4. GRANT/REVOKE — revoke anon; tighten authenticated on both tables
-- ============================================================
-- Baseline: GRANT ALL TO anon on brands (line 29740) and brand_organizations (line 29731).
-- BRANDS-007 / GAP-BRANDS-001: anon should have zero DML privileges on both tables.
-- Fix:
--   REVOKE ALL from anon on both tables.
--   REVOKE ALL from authenticated (removes TRUNCATE/REFERENCES which are not needed).
--   GRANT only SELECT/INSERT/UPDATE/DELETE to authenticated.
--   anon gets NO table-level access to brands or brand_organizations.
--   RLS on brands_select requires TO authenticated, so unauthenticated clients
--   cannot read brand data even for global brands. If a future public catalogue
--   requires unauthenticated brand reads, add GRANT SELECT ON brands TO anon and
--   create a dedicated RLS policy FOR SELECT TO anon at that time.
-- service_role retains ALL (needed for triggers, admin imports, service operations).

REVOKE ALL ON TABLE public.brands               FROM anon;
REVOKE ALL ON TABLE public.brand_organizations  FROM anon;

REVOKE ALL ON TABLE public.brands               FROM authenticated;
REVOKE ALL ON TABLE public.brand_organizations  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brands              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brand_organizations TO authenticated;
