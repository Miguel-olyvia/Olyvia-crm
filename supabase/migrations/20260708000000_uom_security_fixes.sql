-- UoM Security Fixes — Wave 0
-- 2026-07-08 | Module: Fase 7 · Units of Measure | Wave: 0 (RLS hardening + ACL)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include 'uom.view' and 'uom.manage'
--   2. uom — drop baseline policies; create four explicit per-operation policies
--   3. GRANT/REVOKE — revoke anon DML; tighten authenticated grant
--
-- Gaps addressed:
--   UOM-03 (CRITICAL) — GRANT ALL TO anon on public.uom. Revoked; anon gets no access.
--   UOM-04 (CRITICAL) — 'Admins can manage UOM' policy has no FOR clause (applies to ALL ops),
--                        no WITH CHECK clause, and has_anew_permission() called bare (per-row).
--                        Replaced with four explicit FOR SELECT/INSERT/UPDATE/DELETE policies,
--                        each using the (SELECT auth.uid()) subquery pattern.
--   UOM-05 (HIGH)     — organization_id ignored by all RLS policies.
--                        Product decision: UoM is a HYBRID table. Global rows
--                        (organization_id IS NULL) are system-managed and visible to all
--                        authenticated users. Org-specific rows are scoped to their org.
--                        SELECT: global (IS NULL) OR org in visible; mirrors brands/attributes.
--                        INSERT: org IS NOT NULL AND in visible orgs (or system admin).
--                        UPDATE/DELETE: org in visible orgs (or system admin for global rows).
--   UOM-06 (HIGH)     — no explicit INSERT/UPDATE/DELETE policies with WITH CHECK.
--                        Addressed by the four-policy replacement below.
--
-- NOT addressed here (deferred / out of scope):
--   UOM-07 (MEDIUM)   — Missing index on uom.base_uom_id and partial index on is_active.
--                        Addressed in Wave 1 (audit triggers migration) alongside trigger setup.
--   UOM-08 (MEDIUM)   — UUIDv4 PK. Deferred to a project-wide UUID migration.
--   UOM-01/UOM-02     — No audit trigger / fn_generic_entity_audit silently skips global rows.
--                        Addressed in Wave 1 (20260708010000_uom_audit_triggers.sql).
--
-- Global UoM design decision:
--   uom.organization_id is nullable. A NULL organization_id means the UoM is global —
--   visible to all authenticated users (e.g. 'kg', 'm²', 'un') but only editable by
--   system admins. This is identical to the brands and product_attributes pattern.
--   The sentinel audit pattern (fn_audit_uom_with_sentinel) is established in Wave 1.
--
-- Permission codes used:
--   'products.manage' — write gate for all UoM DML (consistent with the baseline policy).
--   'products.view'   — read gate (UoM is part of the product module).
--   Both codes are already seeded in anew_permissions (products module bootstrap).
--
-- Convention: (SELECT auth.uid()) correlated subquery pattern used throughout, matching
-- 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260625010000_entity_audit_log.sql
--   20260707020000_attributes_permission_codes.sql (latest entity_audit_log_select)


-- ============================================================
-- 1. entity_audit_log SELECT policy — add uom.view / uom.manage
-- ============================================================
-- The last policy (20260707000000) accepts:
--   quotes.manage | proposals.manage | services.view | products.view | products.manage
--   | brands.view | brands.edit | product_categories.view | product_subcategories.view
--   | service_subcategories.view | product_attributes.view
-- + sentinel arm for global rows.
--
-- UoM uses the products.view / products.manage permission codes (no dedicated uom.*
-- code exists and none is needed — UoM is part of the products module surface).
-- Both codes are already in the policy OR-chain, so the org-scoped arm already covers
-- UoM audit rows for users with products.view or products.manage.
--
-- The sentinel arm must also include products.view / products.manage so that admins
-- who manage global UoMs can read their sentinel audit rows.
-- products.manage is already in the sentinel arm; products.view is added here.
-- Idempotent: DROP IF EXISTS + CREATE.

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
    -- Sentinel rows (global UoMs / attributes / categories / brands under sentinel UUID):
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
-- 2. uom — drop baseline policies; create explicit per-operation policies
-- ============================================================
-- Baseline problems (confirmed at lines 21100-21103 and 21434-21437):
--   a) 'Admins can manage UOM': no FOR clause → applies to ALL operations (SELECT +
--      INSERT + UPDATE + DELETE). No WITH CHECK → PostgreSQL reuses USING for INSERT/UPDATE
--      check, meaning any admin can INSERT a row with any organization_id value.
--      has_anew_permission() called bare → per-row re-evaluation on bulk ops.
--   b) 'Everyone can view UOM': USING (true) → every authenticated user reads all rows
--      across all tenants. organization_id completely ignored.
--   c) No org-scoping on writes → cross-org injection possible via direct API.
--
-- Fix: drop both baseline policies and replace with four explicit policies.
--   SELECT: global (IS NULL) OR org in visible orgs OR system admin.
--   INSERT: products.manage + org IS NOT NULL + org in visible orgs (admin bypasses).
--   UPDATE: products.manage + USING on pre-update row + WITH CHECK on post-update row.
--   DELETE: products.manage + org in visible orgs (admin bypasses for global rows).
--
-- Note on global UoMs (organization_id IS NULL):
--   Global rows are SELECT-visible to all authenticated users (no permission required).
--   Only system admins may INSERT global UoMs (organization_id IS NULL bypass).
--   Regular users may only INSERT org-scoped UoMs into their own visible orgs.
--   For UPDATE/DELETE of global UoMs: system admin bypass covers IS NULL rows because
--   NULL IN (get_user_visible_org_ids(...)) evaluates to false, not true.

DROP POLICY IF EXISTS "Admins can manage UOM"  ON public.uom;
DROP POLICY IF EXISTS "Everyone can view UOM"   ON public.uom;

-- Also drop any prior corrective policy names (idempotent guard).
DROP POLICY IF EXISTS uom_select   ON public.uom;
DROP POLICY IF EXISTS uom_insert   ON public.uom;
DROP POLICY IF EXISTS uom_update   ON public.uom;
DROP POLICY IF EXISTS uom_delete   ON public.uom;

-- SELECT: global UoMs visible to all authenticated users; org-scoped UoMs visible
-- only to members of that org. System admins see everything.
CREATE POLICY uom_select
  ON public.uom
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

-- INSERT: regular users must provide a valid org_id in their visible orgs and hold
-- products.manage. System admins bypass: they can insert into any org or create
-- global UoMs (organization_id IS NULL) for system-level reference data.
CREATE POLICY uom_insert
  ON public.uom
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

-- UPDATE: USING validates the pre-update row state (admin bypass covers global rows).
--         WITH CHECK validates the post-update row state (prevents cross-org reassignment).
CREATE POLICY uom_update
  ON public.uom
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

-- DELETE: same org-scope + permission gate as UPDATE; admin bypass covers global rows.
CREATE POLICY uom_delete
  ON public.uom
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
-- 3. GRANT/REVOKE — revoke anon DML; tighten authenticated
-- ============================================================
-- Baseline: GRANT ALL ON TABLE public.uom TO anon (line 31216).
-- This gives anon INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER at ACL level.
-- RLS is the only barrier. Revoke everything from anon — no unauthenticated access
-- to UoM rows is required; the SELECT policy is scoped TO authenticated.
-- If a future public product catalogue requires unauthenticated UoM reads, add
-- GRANT SELECT ON public.uom TO anon and a dedicated FOR SELECT TO anon policy at that time.
--
-- authenticated: revoke TRUNCATE/REFERENCES (not needed by the application).
-- service_role: retains ALL (needed for triggers, admin imports, service operations).

REVOKE ALL ON TABLE public.uom FROM anon;

REVOKE ALL ON TABLE public.uom FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uom TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm anon has no privileges on uom:
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'uom' AND grantee = 'anon';
--
-- Expected: 0 rows.
--
-- 2. Confirm authenticated has only SELECT/INSERT/UPDATE/DELETE:
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'uom' AND grantee = 'authenticated'
--   ORDER BY privilege_type;
--
-- Expected: 4 rows — DELETE, INSERT, SELECT, UPDATE.
--
-- 3. Confirm four explicit RLS policies exist on uom:
--
--   SELECT policyname, cmd, permissive
--   FROM pg_policies
--   WHERE tablename = 'uom'
--   ORDER BY policyname;
--
-- Expected: uom_delete (DELETE), uom_insert (INSERT), uom_select (SELECT), uom_update (UPDATE).
--
-- 4. Confirm old baseline policies are gone:
--
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'uom'
--     AND policyname IN ('Admins can manage UOM', 'Everyone can view UOM');
--
-- Expected: 0 rows.
