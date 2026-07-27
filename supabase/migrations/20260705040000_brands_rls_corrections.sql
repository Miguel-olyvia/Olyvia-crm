-- Brands RLS Corrections — Wave 4
-- 2026-07-05 | Module: Brands | Wave: 4 (branding table RLS gaps)
-- Forward-only migration. Do not fold into the baseline.
--
-- Gaps addressed:
--   BRANDS-RLS-CB-001 (MEDIUM) — campaign_branding_update has no WITH CHECK clause.
--                                USING validates the pre-update row; WITH CHECK must
--                                validate the post-update row to prevent a user from
--                                pivoting a branding record to a campaign_id in a
--                                different org they have access to via a separate path.
--
--   BRANDS-RLS-FB-001 (HIGH)   — form_branding RLS policies are org-unscoped.
--                                All four baseline policies use auth.uid() IS NOT NULL
--                                or USING (true) — any authenticated user can read,
--                                write, update, or delete any org's form branding.
--                                form_branding has no direct organization_id column;
--                                org scope is reached via the parent forms table
--                                (forms.organization_id). The pattern matches how
--                                campaign_branding scopes through campaigns.organization_id.
--
-- NOT addressed:
--   BRANDS-DB-006 (MEDIUM)     — entity_audit_log_select OR-chain growth. Deferred to
--                                a project-wide refactor per Wave 3 decision.
--   BRANDS-RLS-009 (MEDIUM)    — handleBulkCompanyChange client-side org validation.
--                                Frontend concern, not an RLS gap; DB WITH CHECK already
--                                enforces this at the database layer.
--
-- Prerequisites:
--   20260705030000_brands_audit_coverage.sql (Wave 3)
--
-- Auth pattern:
--   All policies use (SELECT auth.uid()) per 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.
--   has_anew_permission() is used for write gates, consistent with Wave 0 brands policies.
--   forms.organization_id is nullable (system/global forms); the scoping sub-select
--   filters by organization_id IN visible orgs, so global forms (org IS NULL) fall
--   through — this matches the existing pattern for proposals and other nullable-org
--   tables. A separate public read policy covers public form access.


-- ============================================================
-- 1. campaign_branding_update — add WITH CHECK (BRANDS-RLS-CB-001)
-- ============================================================
-- Baseline (line 25254): FOR UPDATE TO authenticated USING (EXISTS (...campaign_id match
-- + org_id IN visible)). No WITH CHECK, so post-update campaign_id is not validated.
--
-- A user could update a campaign_branding row's campaign_id to point at a campaign
-- in a different org (if the USING check passed on the pre-update row and the
-- constraint only prevents the initial row match). WITH CHECK on the same expression
-- closes this pivot.
--
-- Fix: DROP and recreate with identical USING + matching WITH CHECK.

DROP POLICY IF EXISTS "campaign_branding_update" ON public.campaign_branding;

CREATE POLICY "campaign_branding_update"
  ON public.campaign_branding
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_branding.campaign_id
        AND c.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_branding.campaign_id
        AND c.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  );


-- ============================================================
-- 2. form_branding — replace all four RLS policies (BRANDS-RLS-FB-001)
-- ============================================================
-- Baseline policies (lines 21824, 21972, 22142, 22430):
--   DELETE: auth.uid() IS NOT NULL    — any authenticated user, no org scope
--   INSERT: auth.uid() IS NOT NULL    — any authenticated user, no org scope
--   UPDATE: auth.uid() IS NOT NULL    — any authenticated user, no org scope
--   SELECT: USING (true)              — everyone including anon (anon grant revoked
--                                       in Wave 3, but the policy body is still open)
--
-- form_branding has no direct organization_id column.
-- Org scope is reached via: form_branding.form_id → forms.id → forms.organization_id
-- This mirrors how campaign_branding scopes via campaign_id → campaigns.organization_id.
--
-- forms.organization_id IS nullable. Rows where the parent form has org IS NULL
-- (system/global forms) are not matched by the IN (...visible orgs) sub-select
-- because NULL IN (...) = false. System admins are explicitly bypassed via
-- is_system_admin_user() to retain their ability to manage global form branding.
--
-- Public SELECT: form_branding for active, public-facing forms should be readable
-- without authentication (same rationale as campaign_branding_public_select).
-- The existing forms.is_active flag is the gate; no org check on the public policy.
-- Table-level anon grant was revoked in Wave 3; this SELECT policy has no TO clause
-- so it covers anon + authenticated — but without the table grant, anon access
-- requires a separate GRANT SELECT on form_branding to anon, which is added below.
--
-- Write operations (INSERT/UPDATE/DELETE) require:
--   • The parent form's org_id must be in the user's visible orgs, OR
--   • System admin bypass.
-- No has_anew_permission gate is added here because form_branding management is
-- covered by the same forms-editing permission (forms are managed via settings/forms
-- UI; no dedicated forms.edit permission code exists in the baseline permission set).
-- If a dedicated permission is added later, this policy can be tightened.

DROP POLICY IF EXISTS "Users can delete form branding"  ON public.form_branding;
DROP POLICY IF EXISTS "Users can insert form branding"  ON public.form_branding;
DROP POLICY IF EXISTS "Users can update form branding"  ON public.form_branding;
DROP POLICY IF EXISTS "Users can view form branding"    ON public.form_branding;

-- SELECT: public read for active forms (no auth required); org members can read
-- their own form branding; system admins see everything.
-- Two separate policies are cleaner than one OR-chained policy that mixes
-- unauthenticated and authenticated paths.

-- Public read: active forms only (replaces the unrestricted USING (true)).
CREATE POLICY "form_branding_public_select"
  ON public.form_branding
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_branding.form_id
        AND f.is_active = true
    )
  );

-- Authenticated org-scoped read + system admin.
CREATE POLICY "form_branding_select"
  ON public.form_branding
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_branding.form_id
        AND f.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  );

-- INSERT: parent form must be in user's visible orgs (or system admin).
-- WITH CHECK only — no USING on INSERT.
CREATE POLICY "form_branding_insert"
  ON public.form_branding
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_branding.form_id
        AND f.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  );

-- UPDATE: USING validates pre-update row; WITH CHECK validates post-update form_id.
-- Prevents pivoting a branding record to a form in a different org.
CREATE POLICY "form_branding_update"
  ON public.form_branding
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_branding.form_id
        AND f.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_branding.form_id
        AND f.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  );

-- DELETE: org scope + system admin bypass.
CREATE POLICY "form_branding_delete"
  ON public.form_branding
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_branding.form_id
        AND f.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
  );


-- ============================================================
-- 3. GRANT SELECT on form_branding to anon (public form reads)
-- ============================================================
-- Wave 3 issued REVOKE ALL ON form_branding FROM anon.
-- The form_branding_public_select policy above has no TO clause (applies to all roles),
-- but without a table-level privilege anon cannot pass RLS evaluation.
-- Restore SELECT-only for anon so the public form rendering path works.
-- All write operations are TO authenticated in their policies, so DML from anon
-- is blocked at the policy level even with this grant in place.

GRANT SELECT ON TABLE public.form_branding TO anon;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. campaign_branding_update now has WITH CHECK:
--
--   SELECT polname, polcmd, polwithcheck IS NOT NULL AS has_with_check
--   FROM pg_policy
--   WHERE polrelid = 'public.campaign_branding'::regclass
--     AND polname = 'campaign_branding_update';
--
-- Expected: has_with_check = true
--
-- 2. form_branding policies replaced (5 policies total):
--
--   SELECT polname, polcmd, polroles::regrole[]
--   FROM pg_policy
--   WHERE polrelid = 'public.form_branding'::regclass
--   ORDER BY polname;
--
-- Expected rows:
--   form_branding_delete         | r (DELETE) | {authenticated}
--   form_branding_insert         | a (INSERT) | {authenticated}
--   form_branding_public_select  | r (SELECT) | {}  (all roles)
--   form_branding_select         | r (SELECT) | {authenticated}
--   form_branding_update         | w (UPDATE) | {authenticated}
--
-- Old policies "Users can ..." must be absent.
--
-- 3. anon can SELECT form_branding (for active forms):
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'form_branding' AND grantee = 'anon';
--
-- Expected: one row — SELECT
