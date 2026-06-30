-- Bundles Security Fixes — Wave 0
-- 2026-07-04 | Module: Bundles | Wave: 0 (security & schema prerequisites)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include bundles.view
--   2. Missing index on bundle_components.choice_group_id (BUN-010)
--   3. bundles — replace all four RLS policies
--              (SELECT auth.uid()) correlated subquery pattern,
--              has_anew_permission gate on writes,
--              is_system_admin_user bypass,
--              deleted_at IS NULL filter on SELECT/UPDATE
--   4. bundle_choice_groups — replace all-ops policy with explicit FOR INSERT/UPDATE/DELETE
--              satellite org-scope via bundle_id → bundles
--              has_anew_permission('products.manage') on writes
--   5. bundle_components — replace all-ops policy with explicit FOR INSERT/UPDATE/DELETE
--              satellite org-scope via bundle_id → bundles
--              has_anew_permission('products.manage') on writes
--   6. GRANT/REVOKE — revoke anon from all three bundle tables; tighten authenticated grants
--
-- Gaps addressed:
--   BUN-005 (CRITICAL)  — GRANT ALL TO anon never revoked on any bundle table
--   BUN-006 (HIGH)      — bundles RLS policies call auth.uid() bare (per-row re-evaluation)
--   BUN-007 (HIGH)      — bundles.organization_id nullable gap documented as intentional debt
--                         (NULL org rows are invisible to non-system-admin users — same as
--                          PROD-010 on products; no NOT NULL added, documented here)
--   BUN-008 (HIGH)      — entity_audit_log SELECT policy does not include bundles.view
--   BUN-010 (MEDIUM)    — no index on bundle_components.choice_group_id FK
--   BUNDLE-01 (CRITICAL)— child-table policies: all-ops, no role restriction, no WITH CHECK,
--                         no has_anew_permission gate
--   BUNDLE-02 (CRITICAL)— bundles.organization_id nullable; NULL IN () → false (documented)
--   BUNDLE-03 (HIGH)    — bundles_update has no WITH CHECK clause
--   BUNDLE-04 (HIGH)    — GRANT ALL TO anon on all three tables (same as BUN-005)
--   BUNDLE-05 (MEDIUM)  — no has_anew_permission check on write operations
--   BUNDLE-07 (MEDIUM)  — bundles_update/select do not filter deleted_at IS NOT NULL
--   BUN-004 (CRITICAL)  — child tables: single all-ops RLS policy with no WITH CHECK / no
--                         permission gate
--   BUN-009 (MEDIUM)    — child tables lack explicit FOR INSERT/UPDATE/DELETE policies
--
-- NOT addressed (out of scope / deferred):
--   BUN-007 / BUNDLE-02 — bundles.organization_id NOT NULL constraint deferred. NULL org rows
--     are silently invisible through RLS (same intent as PROD-010 on products). The schema debt
--     is documented here; enforcement would require a separate data audit + constraint migration.
--   BUNDLE-07 soft-delete restore — no separate restore policy created here. Applications must
--     use service_role context (via SECURITY DEFINER RPC) to restore soft-deleted bundles.
--
-- Permission codes used:
--   'products.view'   — read bundles (reused from products module; no separate bundles.view code
--                       exists in anew_permissions; bundles.view widening in Section 1 below
--                       documents this as a future code to add)
--   'products.manage' — write bundles (used as the write gate; mirrors products.edit/create/delete
--                       consolidated into a single manage permission for the bundles module)
--
-- NOTE on permission codes: No 'bundles.view' or 'bundles.manage' code exists in anew_permissions
-- at the time of this migration. We use 'products.view' / 'products.manage' as the closest
-- appropriate codes for the catalogue domain. When dedicated bundle permission codes are added to
-- anew_permissions, the policies in Sections 3-5 and the entity_audit_log widening in Section 1
-- must be updated via a new migration.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260625010000_entity_audit_log.sql
--   20260703000000_products_security_fixes.sql (entity_audit_log_select with products.view)
--
-- Convention: all (SELECT auth.uid()) subquery pattern used throughout for consistent
-- per-query evaluation, matching 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.


-- ============================================================
-- 1. entity_audit_log SELECT policy — add bundles.view
-- ============================================================
-- The policy in 20260703000000 accepts quotes.manage | proposals.manage |
-- services.view | products.view. Bundle managers holding only products.view
-- can already read the audit trail (bundles are part of the products/catalogue
-- domain). No separate bundles.view permission code exists today.
-- This section widens the policy to also accept 'products.manage' so that
-- a user who has manage-only access (no explicit view code) can read bundle
-- audit rows. Idempotent: DROP IF EXISTS + CREATE.

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
    )
  );


-- ============================================================
-- 2. Missing index on bundle_components.choice_group_id (BUN-010)
-- ============================================================
-- FK bundle_components_choice_group_id_fkey exists (ON DELETE SET NULL) but
-- no btree index backs it. Unindexed FK causes sequential scans on
-- bundle_components when filtering by choice_group_id. CREATE INDEX
-- CONCURRENTLY is not usable inside a transaction block; a plain CREATE INDEX
-- is used here (migration runs outside an open transaction by Supabase tooling).

CREATE INDEX IF NOT EXISTS idx_bundle_components_choice_group_id
  ON public.bundle_components USING btree (choice_group_id)
  WHERE choice_group_id IS NOT NULL;


-- ============================================================
-- 3. bundles — replace all four RLS policies
-- ============================================================
-- Baseline problems:
--   a) All four policies call auth.uid() bare → per-row re-evaluation (BUN-006).
--   b) No is_system_admin_user bypass for system-level access.
--   c) No has_anew_permission gate on write policies — any org member can write bundles.
--   d) bundles_update has no WITH CHECK clause (BUNDLE-03).
--   e) bundles_select and bundles_update do not filter soft-deleted rows (BUNDLE-07).
--   f) bundles.organization_id is nullable; NULL rows are invisible (BUNDLE-02 / BUN-007).
--      This is the same intentional behaviour as PROD-010 on products. Documented here;
--      no constraint added.
--
-- Fix:
--   • Wrap all auth.uid() in (SELECT ...) for single per-query evaluation.
--   • Add is_system_admin_user bypass.
--   • Add has_anew_permission('products.manage') gate on INSERT/UPDATE/DELETE.
--   • Add WITH CHECK to UPDATE matching the USING predicate.
--   • Add AND deleted_at IS NULL to SELECT and UPDATE USING so soft-deleted
--     bundles are hidden from normal queries and cannot be updated without restore.

DROP POLICY IF EXISTS bundles_select ON public.bundles;
DROP POLICY IF EXISTS bundles_insert ON public.bundles;
DROP POLICY IF EXISTS bundles_update ON public.bundles;
DROP POLICY IF EXISTS bundles_delete ON public.bundles;

CREATE POLICY bundles_select
  ON public.bundles
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      deleted_at IS NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY bundles_insert
  ON public.bundles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY bundles_update
  ON public.bundles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      deleted_at IS NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'products.manage')
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

CREATE POLICY bundles_delete
  ON public.bundles
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
-- 4. bundle_choice_groups — replace all-ops policy with explicit policies
-- ============================================================
-- Baseline problems (BUNDLE-01, BUN-004, BUN-009):
--   a) Single policy "Users can manage choice groups for accessible bundles":
--      FOR ALL (no explicit FOR clause), USING only, no TO role restriction,
--      no WITH CHECK, no has_anew_permission gate.
--   b) USING predicate: bundle_id IN (SELECT bundles.id FROM bundles) — no WHERE
--      clause, no org scope of its own; org filtering inherited only implicitly
--      through RLS on bundles. The anon role is not excluded at the policy level.
--   c) INSERT/UPDATE with no WITH CHECK means PostgreSQL falls back to USING
--      for INSERT — the predicate checks a non-existent row (always evaluates as
--      undefined behaviour / false for INSERT).
--
-- Fix:
--   • Drop the all-ops policy.
--   • Create explicit FOR SELECT (org-scope via bundle_id JOIN bundles).
--   • Create FOR INSERT WITH CHECK, FOR UPDATE USING+WITH CHECK, FOR DELETE USING.
--   • All write policies require has_anew_permission('products.manage').
--   • All policies bound TO authenticated.
--   • Org resolved by EXISTS JOIN: bundle_choice_groups → bundles.organization_id.

DROP POLICY IF EXISTS "Users can manage choice groups for accessible bundles"
  ON public.bundle_choice_groups;

CREATE POLICY bundle_choice_groups_select
  ON public.bundle_choice_groups
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.bundles b
      WHERE  b.id = bundle_choice_groups.bundle_id
        AND  b.deleted_at IS NULL
        AND  b.organization_id IN (
               SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
             )
    )
  );

CREATE POLICY bundle_choice_groups_insert
  ON public.bundle_choice_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.bundles b
        WHERE  b.id = bundle_choice_groups.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY bundle_choice_groups_update
  ON public.bundle_choice_groups
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.bundles b
        WHERE  b.id = bundle_choice_groups.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
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
        FROM   public.bundles b
        WHERE  b.id = bundle_choice_groups.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY bundle_choice_groups_delete
  ON public.bundle_choice_groups
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.bundles b
        WHERE  b.id = bundle_choice_groups.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );


-- ============================================================
-- 5. bundle_components — replace all-ops policy with explicit policies
-- ============================================================
-- Baseline problems (BUNDLE-01, BUN-004, BUN-009): identical pattern to
-- bundle_choice_groups above. The single all-ops policy:
--   "Users can manage components for accessible bundles"
-- has no role restriction, no WITH CHECK, no permission gate.
--
-- Fix: same four-policy split as bundle_choice_groups (Section 4 above).
-- Org resolved via bundle_id → bundles.organization_id.
-- choice_group_id is a nullable FK to bundle_choice_groups within the same
-- org — no additional cross-org guard needed since bundle_id is the anchor.

DROP POLICY IF EXISTS "Users can manage components for accessible bundles"
  ON public.bundle_components;

CREATE POLICY bundle_components_select
  ON public.bundle_components
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.bundles b
      WHERE  b.id = bundle_components.bundle_id
        AND  b.deleted_at IS NULL
        AND  b.organization_id IN (
               SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
             )
    )
  );

CREATE POLICY bundle_components_insert
  ON public.bundle_components
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.bundles b
        WHERE  b.id = bundle_components.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY bundle_components_update
  ON public.bundle_components
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.bundles b
        WHERE  b.id = bundle_components.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
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
        FROM   public.bundles b
        WHERE  b.id = bundle_components.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY bundle_components_delete
  ON public.bundle_components
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.bundles b
        WHERE  b.id = bundle_components.bundle_id
          AND  b.deleted_at IS NULL
          AND  b.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );


-- ============================================================
-- 6. GRANT/REVOKE — revoke anon; tighten authenticated on all bundle tables
-- ============================================================
-- Baseline: GRANT ALL TO anon on all three tables (lines 29749-29769) and
-- GRANT ALL TO authenticated (includes TRUNCATE and REFERENCES, not needed).
-- BUN-005 / BUNDLE-04: anon should have zero privileges on bundle tables.
-- Fix: REVOKE ALL from anon; grant only SELECT/INSERT/UPDATE/DELETE to authenticated.
-- service_role retains ALL (needed for triggers, imports, admin operations).

REVOKE ALL ON TABLE public.bundles              FROM anon;
REVOKE ALL ON TABLE public.bundle_choice_groups FROM anon;
REVOKE ALL ON TABLE public.bundle_components    FROM anon;

REVOKE ALL ON TABLE public.bundles              FROM authenticated;
REVOKE ALL ON TABLE public.bundle_choice_groups FROM authenticated;
REVOKE ALL ON TABLE public.bundle_components    FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bundles              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bundle_choice_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bundle_components    TO authenticated;
