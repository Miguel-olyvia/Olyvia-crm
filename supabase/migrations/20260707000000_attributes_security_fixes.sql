-- Attributes Security Fixes — Wave 0
-- 2026-07-07 | Module: Fase 6 · Attributes | Wave: 0 (RLS hardening)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include products.view (already present)
--      and add 'product_attributes.view' so attribute managers can read the audit trail.
--   2. product_attributes — replace all four RLS policies
--              (SELECT auth.uid()) correlated subquery fix throughout,
--              is_system_admin_user bypass on all ops,
--              has_anew_permission gate on writes,
--              WITH CHECK on UPDATE to prevent cross-org reassignment (ATTR-004/ATTR-005),
--              global attributes (org IS NULL) remain SELECT-visible (mirrors baseline intent).
--   3. attribute_option_groups — replace all four RLS policies
--              SELECT: org-scoped (ATTR-002 — was USING(true), world-readable),
--              INSERT/UPDATE/DELETE: org-scoped + products.manage (ATTR-001/ATTR-003),
--              (SELECT auth.uid()) pattern throughout (ATTR-005),
--              WITH CHECK on UPDATE (ATTR-007).
--   4. attribute_option_group_values — replace all four RLS policies
--              No organization_id column: org resolved via group_id → attribute_option_groups.
--              SELECT: EXISTS join through parent group.
--              INSERT/UPDATE/DELETE: products.manage + EXISTS join through parent group.
--   5. GRANT/REVOKE — revoke anon DML from all three tables (ATTR-006/ATTR-003)
--
-- Gaps addressed:
--   ATTR-001 (CRITICAL) — no RLS org-scope on attribute_option_groups write ops
--   ATTR-002 (CRITICAL) — attribute_option_groups SELECT was USING(true) — cross-org leak
--   ATTR-003 (CRITICAL) — GRANT ALL to anon on both tables
--   ATTR-004 (HIGH)     — product_attributes UPDATE missing WITH CHECK
--   ATTR-005 (HIGH)     — attribute_option_groups policies use bare auth.uid() per-row
--   ATTR-006 (HIGH)     — GRANT ALL to anon on product_attributes
--   ATTR-007 (MEDIUM)   — attribute_option_groups UPDATE missing WITH CHECK
--
-- Permission codes used:
--   'products.view'    — read attributes (mirrors products module)
--   'products.manage'  — write attributes, groups, values (module-level write)
--
-- Global attributes decision (organization_id IS NULL on product_attributes):
--   NULL org_id means a global/shared attribute not scoped to a specific org.
--   SELECT policy retains the IS NULL arm so that shared attribute definitions are
--   visible to users who can see at least one org (mirrors baseline intent).
--   INSERT enforces IS NOT NULL so that org-scoped users cannot create global attrs.
--   System admins bypass all restrictions via is_system_admin_user().
--
-- Global option groups decision (organization_id IS NULL on attribute_option_groups):
--   Same as attributes: SELECT retains IS NULL arm; INSERT enforces IS NOT NULL.
--
-- Convention: (SELECT auth.uid()) correlated subquery pattern used throughout, matching
-- 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260625010000_entity_audit_log.sql
--   20260706110000_service_subcategories_rls_gaps.sql (latest entity_audit_log_select)


-- ============================================================
-- 1. entity_audit_log SELECT policy — add product_attributes.view
-- ============================================================
-- The last policy (Wave 11) accepts:
--   quotes.manage | proposals.manage | services.view | products.view | products.manage
--   | brands.view | brands.edit | product_categories.view | product_subcategories.view
--   | service_subcategories.view
-- Attribute managers holding products.view are already covered; adding
-- 'product_attributes.view' for explicit future use and to close the sentinel arm.

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;

CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    -- Org-scoped rows: user must be in the org and hold a qualifying permission.
    (
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
        OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_attributes.view')
      )
    )
    OR
    -- Sentinel rows (global attributes/categories/brands under sentinel UUID):
    (
      organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (
        public.has_anew_permission((SELECT auth.uid()), 'products.manage')
        OR public.has_anew_permission((SELECT auth.uid()), 'products.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_attributes.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      )
    )
  );


-- ============================================================
-- 2. product_attributes — replace all four RLS policies
-- ============================================================
-- Baseline problems (confirmed at lines 26910–26931):
--   a) All four policies call auth.uid() bare → per-row re-evaluation.
--   b) UPDATE (product_attributes_update) has USING but no WITH CHECK (ATTR-004).
--      An actor can UPDATE organization_id to a foreign org on the post-update row.
--   c) SELECT arm includes IS NULL (global attrs) — intentionally retained.
--   d) No has_anew_permission gate on any write operation (only org-scope check).
--
-- Fix:
--   • (SELECT auth.uid()) throughout.
--   • is_system_admin_user bypass on all policies.
--   • SELECT: retains global (IS NULL) arm — global attributes visible to authenticated users.
--   • INSERT: products.manage + org IS NOT NULL + org in visible orgs.
--   • UPDATE: products.manage + USING on pre-update row + WITH CHECK on post-update row.
--   • DELETE: products.manage + org in visible orgs.

DROP POLICY IF EXISTS product_attributes_select ON public.product_attributes;
DROP POLICY IF EXISTS product_attributes_insert ON public.product_attributes;
DROP POLICY IF EXISTS product_attributes_update ON public.product_attributes;
DROP POLICY IF EXISTS product_attributes_delete ON public.product_attributes;

-- SELECT: org-scoped + global (IS NULL) + admin bypass.
CREATE POLICY product_attributes_select
  ON public.product_attributes
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IS NULL
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT: products.manage required; org must be non-null and in visible orgs.
CREATE POLICY product_attributes_insert
  ON public.product_attributes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: products.manage + USING on pre-update row + WITH CHECK on post-update row.
-- WITH CHECK prevents cross-org reassignment (ATTR-004).
CREATE POLICY product_attributes_update
  ON public.product_attributes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: products.manage + org in visible orgs.
CREATE POLICY product_attributes_delete
  ON public.product_attributes
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 3. attribute_option_groups — replace all four RLS policies
-- ============================================================
-- Baseline problems (confirmed at lines 21203–22360):
--   a) SELECT: USING(true) — world-readable to every authenticated user (ATTR-002, cross-org leak).
--   b) INSERT: WITH CHECK (auth.uid() IS NOT NULL) — no org scope, no permission (ATTR-001).
--   c) UPDATE: USING (auth.uid() IS NOT NULL) — no org scope, no WITH CHECK (ATTR-001, ATTR-007).
--   d) DELETE: USING (auth.uid() IS NOT NULL) — no org scope, no permission (ATTR-001).
--   e) All four bare auth.uid() calls (per-row evaluation) (ATTR-005).
--
-- attribute_option_groups.organization_id is nullable.
--   NULL means a global/shared group (e.g. a platform-wide palette).
--   SELECT retains IS NULL arm.
--   INSERT enforces IS NOT NULL (org-scoped users cannot create global groups).
--   System admins bypass via is_system_admin_user().
--
-- Fix: (SELECT auth.uid()) throughout, org-scoped predicates, products.manage gate,
--      WITH CHECK on both INSERT and UPDATE.

DROP POLICY IF EXISTS "Authenticated users can delete attribute option groups" ON public.attribute_option_groups;
DROP POLICY IF EXISTS "Authenticated users can insert attribute option groups"  ON public.attribute_option_groups;
DROP POLICY IF EXISTS "Authenticated users can update attribute option groups"  ON public.attribute_option_groups;
DROP POLICY IF EXISTS "Users can view attribute option groups"                  ON public.attribute_option_groups;

-- SELECT: org-scoped + global (IS NULL) + admin bypass.
CREATE POLICY attribute_option_groups_select
  ON public.attribute_option_groups
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IS NULL
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT: products.manage + org IS NOT NULL + org in visible orgs.
CREATE POLICY attribute_option_groups_insert
  ON public.attribute_option_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: products.manage + USING + WITH CHECK (prevents cross-org reassignment, ATTR-007).
CREATE POLICY attribute_option_groups_update
  ON public.attribute_option_groups
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: products.manage + org in visible orgs.
CREATE POLICY attribute_option_groups_delete
  ON public.attribute_option_groups
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 4. attribute_option_group_values — replace all four RLS policies
-- ============================================================
-- attribute_option_group_values has NO organization_id column.
-- Org scope must be resolved via: group_id → attribute_option_groups.organization_id.
--
-- Baseline problems (confirmed at lines 21196–22353):
--   a) SELECT: USING(true) — world-readable (cross-org leak via parent group).
--   b) INSERT: WITH CHECK (auth.uid() IS NOT NULL) — no org scope, no permission gate.
--   c) UPDATE: USING (auth.uid() IS NOT NULL) — no org scope, no WITH CHECK.
--   d) DELETE: USING (auth.uid() IS NOT NULL) — no org scope.
--   e) All bare auth.uid() calls.
--
-- Fix: EXISTS subquery joining attribute_option_groups on group_id.
-- Global groups (organization_id IS NULL) are included in SELECT (values inherit
-- the global visibility of their parent group).
-- INSERT/UPDATE/DELETE require the parent group to be org-scoped and in visible orgs.

DROP POLICY IF EXISTS "Authenticated users can delete attribute option group values" ON public.attribute_option_group_values;
DROP POLICY IF EXISTS "Authenticated users can insert attribute option group values" ON public.attribute_option_group_values;
DROP POLICY IF EXISTS "Authenticated users can update attribute option group values" ON public.attribute_option_group_values;
DROP POLICY IF EXISTS "Users can view attribute option group values"                 ON public.attribute_option_group_values;

-- SELECT: visible if parent group is visible (global or in user's org).
CREATE POLICY attribute_option_group_values_select
  ON public.attribute_option_group_values
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.attribute_option_groups aog
      WHERE  aog.id = attribute_option_group_values.group_id
        AND (
          aog.organization_id IS NULL
          OR aog.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
        )
    )
  );

-- INSERT: products.manage + parent group must be in user's visible org (not NULL).
CREATE POLICY attribute_option_group_values_insert
  ON public.attribute_option_group_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.attribute_option_groups aog
        WHERE  aog.id = attribute_option_group_values.group_id
          AND  aog.organization_id IS NOT NULL
          AND  aog.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );

-- UPDATE: products.manage + parent group in visible org (USING + WITH CHECK).
CREATE POLICY attribute_option_group_values_update
  ON public.attribute_option_group_values
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.attribute_option_groups aog
        WHERE  aog.id = attribute_option_group_values.group_id
          AND  aog.organization_id IS NOT NULL
          AND  aog.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.attribute_option_groups aog
        WHERE  aog.id = attribute_option_group_values.group_id
          AND  aog.organization_id IS NOT NULL
          AND  aog.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );

-- DELETE: products.manage + parent group in visible org.
CREATE POLICY attribute_option_group_values_delete
  ON public.attribute_option_group_values
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.attribute_option_groups aog
        WHERE  aog.id = attribute_option_group_values.group_id
          AND  aog.organization_id IS NOT NULL
          AND  aog.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );


-- ============================================================
-- 5. GRANT/REVOKE — revoke anon DML; tighten authenticated grants
-- ============================================================
-- Baseline grants GRANT ALL to anon on all three tables (lines 29677, 29686, 30658).
-- Even with RLS active, granting DML to anon is least-privilege violation (ATTR-006/ATTR-003).
-- Revoke all from anon; grant only SELECT/INSERT/UPDATE/DELETE to authenticated.

-- product_attributes
REVOKE ALL ON TABLE public.product_attributes                FROM anon;
REVOKE ALL ON TABLE public.product_attributes                FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_attributes TO authenticated;

-- attribute_option_groups
REVOKE ALL ON TABLE public.attribute_option_groups           FROM anon;
REVOKE ALL ON TABLE public.attribute_option_groups           FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attribute_option_groups TO authenticated;

-- attribute_option_group_values
REVOKE ALL ON TABLE public.attribute_option_group_values     FROM anon;
REVOKE ALL ON TABLE public.attribute_option_group_values     FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attribute_option_group_values TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm product_attributes policies replaced with four org-scoped policies:
--
--   SELECT policyname, cmd, qual::text, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'product_attributes'
--   ORDER BY cmd;
--
-- Expected: four policies, all referencing is_system_admin_user and (SELECT auth.uid()).
--   UPDATE policy must show a non-null with_check (ATTR-004 fix confirmed).
--
-- 2. Confirm attribute_option_groups SELECT is no longer USING(true):
--
--   SELECT policyname, cmd, qual::text FROM pg_policies
--   WHERE tablename = 'attribute_option_groups'
--   ORDER BY cmd;
--
-- Expected: four policies, SELECT USING does NOT contain 'true'.
--   All write policies reference get_user_visible_org_ids and products.manage.
--
-- 3. Confirm attribute_option_group_values policies use EXISTS join:
--
--   SELECT policyname, cmd, qual::text FROM pg_policies
--   WHERE tablename = 'attribute_option_group_values'
--   ORDER BY cmd;
--
-- Expected: four policies with EXISTS subquery joining attribute_option_groups.
--
-- 4. Confirm anon has no DML on any of the three tables:
--
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name IN (
--     'product_attributes', 'attribute_option_groups', 'attribute_option_group_values'
--   )
--     AND grantee = 'anon'
--   ORDER BY table_name, privilege_type;
--
-- Expected: no rows (anon has no grants).
