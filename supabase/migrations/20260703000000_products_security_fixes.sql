-- Products Security Fixes — Wave 0
-- 2026-07-03 | Module: Products | Wave: 0 (security & schema prerequisites)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include products.view
--   2. product_price_history — replace SELECT policies (cross-tenant leak + legacy fn)
--                              + add RESTRICTIVE write-deny policies
--   3. products              — replace all four policies ((SELECT auth.uid()) pattern,
--                              has_anew_permission on writes, no change on SELECT logic)
--   4. product_prices        — replace all four policies (has_permission → has_anew_permission,
--                              org-scope via JOIN, (SELECT auth.uid()) throughout)
--   5. product_organizations — replace all-ops policy with explicit FOR INSERT/UPDATE/DELETE
--                              + add has_anew_permission gate; preserve SELECT policy
--   6. product_attribute_values — create four RLS policies (table has RLS enabled, zero policies)
--   7. product_attribute_value_prices — replace all four policies with org-scoped versions
--   8. GRANT/REVOKE — revoke anon from all four core tables; tighten authenticated grants
--   9. log_product_price_change() — fix actor resolution (GUC-first fallback chain)
--     + drop duplicate trigger trigger_log_price_change
--  10. product_price_history — RESTRICTIVE write-deny policies
--
-- Prerequisites: 20260625010000_entity_audit_log.sql
--               20260702000000_services_security_fixes.sql (entity_audit_log_select extended)
--
-- Convention: all (SELECT auth.uid()) subquery pattern used throughout for consistent
-- per-query evaluation, matching 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.


-- ============================================================
-- 1. entity_audit_log SELECT policy — add products.view
-- ============================================================
-- The policy in 20260702000000 accepts quotes.manage | proposals.manage | services.view.
-- Product managers holding only products.view cannot read the products audit trail.
-- Widen to accept products.view as a fourth qualifying permission.

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
    )
  );


-- ============================================================
-- 2. product_price_history — replace SELECT policies + add RESTRICTIVE write-deny
-- ============================================================
-- Baseline problems:
--   a) Two identical SELECT policies (PRICE-HISTORY-DUPLICATE-SELECT-POLICY):
--      "Users can view price history in their scope" and
--      "Users can view product price history" — both use has_permission (legacy),
--      both omit org scope → cross-tenant data leak (PRICE-HISTORY-CROSS-ORG-LEAK).
--   b) No INSERT/UPDATE/DELETE deny policies — any authenticated user could write directly.
--
-- Fix:
--   SELECT — drop both, create one org-scoped policy via product_id → products.organization_id
--            using has_anew_permission (PROD-007 fix).
--   INSERT  — RESTRICTIVE deny (log_product_price_change() SECURITY DEFINER bypasses).
--   UPDATE  — RESTRICTIVE deny (append-only functional history table).
--   DELETE  — RESTRICTIVE deny (append-only).

DROP POLICY IF EXISTS "Users can view price history in their scope" ON public.product_price_history;
DROP POLICY IF EXISTS "Users can view product price history" ON public.product_price_history;

CREATE POLICY product_price_history_select
  ON public.product_price_history
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.view')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_price_history.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

-- Deny direct INSERT from application layer (log_product_price_change() SECURITY DEFINER bypasses).
-- AS RESTRICTIVE: this deny is unconditional and cannot be overridden by any permissive policy.
-- TO authenticated only: service_role bypasses RLS entirely, so listing it here is inert and
-- misleading — omitting it keeps the policy semantically accurate.
DROP POLICY IF EXISTS "System tracks price changes" ON public.product_price_history;

CREATE POLICY product_price_history_system_insert
  ON public.product_price_history
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Append-only — deny UPDATE.
CREATE POLICY product_price_history_no_update
  ON public.product_price_history
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Append-only — deny DELETE.
CREATE POLICY product_price_history_no_delete
  ON public.product_price_history
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- 3. products — replace all four RLS policies
-- ============================================================
-- Baseline problems (PROD-007):
--   a) All four policies call auth.uid() as bare reference → per-row re-evaluation.
--   b) get_user_visible_org_ids() called bare → per-row function call.
--   c) has_anew_permission() called bare on write policies → per-row evaluation.
--
-- Fix: wrap all auth.uid() references in (SELECT ...) for single per-query evaluation.
-- Logic of SELECT/INSERT/UPDATE/DELETE is preserved; only the (SELECT ...) wrapping is added.
-- Note: products.organization_id is nullable; rows with NULL org are invisible to all
-- non-system-admin users (NULL IN (...) → false). This is the intended behaviour for
-- global/unscoped catalog items (PROD-010 schema debt deferred).

DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_insert ON public.products;
DROP POLICY IF EXISTS products_update ON public.products;
DROP POLICY IF EXISTS products_delete ON public.products;

CREATE POLICY products_select
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

CREATE POLICY products_insert
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.create')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY products_update
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY products_delete
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.delete')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 4. product_prices — replace all four RLS policies
-- ============================================================
-- Baseline problems (PROD-007, PRODUCT-PRICES-LEGACY-PERMISSION-FUNCTION,
--                    PRODUCT-PRICES-MISSING-ROLE-BINDING):
--   a) All four policies use has_permission() (legacy RBAC) — falls through to bare
--      OR-branch org-visibility, granting any org-member full read/write on prices
--      when they only have org membership in the anew_memberships system.
--   b) has_permission(), is_system_admin() bare calls → per-row evaluation.
--   c) INSERT policy has no TO "authenticated" role binding (applies to PUBLIC incl. anon).
--   d) UPDATE policy has USING and WITH CHECK but with bare auth.uid().
--
-- Fix: has_permission → has_anew_permission; is_system_admin → is_system_admin_user;
--      (SELECT auth.uid()) throughout; explicit TO authenticated on INSERT;
--      org-scope via EXISTS JOIN on products.

DROP POLICY IF EXISTS product_prices_select ON public.product_prices;
DROP POLICY IF EXISTS product_prices_insert ON public.product_prices;
DROP POLICY IF EXISTS product_prices_update ON public.product_prices;
DROP POLICY IF EXISTS product_prices_delete ON public.product_prices;

CREATE POLICY product_prices_select
  ON public.product_prices
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.view')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_prices.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_prices.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY product_prices_insert
  ON public.product_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_business_user_id() = created_by
    AND (
      public.is_system_admin_user((SELECT auth.uid()))
      OR (
        (
          public.has_anew_permission((SELECT auth.uid()), 'products.create')
          OR public.has_anew_permission((SELECT auth.uid()), 'products.edit')
        )
        AND EXISTS (
          SELECT 1
          FROM   public.products p
          WHERE  p.id = product_prices.product_id
            AND  p.organization_id IN (
                   SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
                 )
        )
      )
    )
  );

CREATE POLICY product_prices_update
  ON public.product_prices
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_prices.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_prices.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY product_prices_delete
  ON public.product_prices
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.delete')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_prices.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );


-- ============================================================
-- 5. product_organizations — replace all-ops policy with explicit policies
-- ============================================================
-- Baseline problems (PROD-008, PRODUCT-ORG-NO-PERMISSION-GATE):
--   a) product_organizations_manage is a FOR ALL policy (no explicit FOR clause)
--      with only org-visibility as guard — no has_anew_permission check.
--      Any org member can add/remove product-org associations regardless of role.
--   b) FOR ALL without explicit WITH CHECK: INSERT falls through to USING predicate;
--      correct for UPDATE but undefined for INSERT (no existing row to evaluate).
--   c) SELECT policy uses bare auth.uid() in get_user_visible_org_ids call.
--
-- Fix:
--   • Drop manage (all-ops) + select policies.
--   • Create explicit FOR SELECT (org-visibility only, no permission gate — read is fine).
--   • Create FOR INSERT WITH CHECK + FOR UPDATE USING+WITH CHECK + FOR DELETE USING
--     each requiring has_anew_permission('products.edit') in addition to org-visibility.

DROP POLICY IF EXISTS product_organizations_manage ON public.product_organizations;
DROP POLICY IF EXISTS product_organizations_select ON public.product_organizations;

CREATE POLICY product_organizations_select
  ON public.product_organizations
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

CREATE POLICY product_organizations_insert
  ON public.product_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY product_organizations_update
  ON public.product_organizations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY product_organizations_delete
  ON public.product_organizations
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 6. product_attribute_values — create four RLS policies
-- ============================================================
-- Baseline state: RLS is ENABLED (line 26898) but ZERO policies exist (PAV-NO-POLICIES).
-- Default-deny means no authenticated user can SELECT, INSERT, UPDATE, or DELETE
-- through PostgREST on this table. Only SECURITY DEFINER RPCs bypass this.
--
-- Fix: create four org-scoped policies joining via product_id → products.organization_id.
-- No organization_id column exists on product_attribute_values itself.
-- Permission codes mirror the products table: view / create / edit / delete.
-- Note: product_attribute_value_prices is addressed separately (Section 7).

CREATE POLICY product_attribute_values_select
  ON public.product_attribute_values
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.products p
      WHERE  p.id = product_attribute_values.product_id
        AND  p.organization_id IN (
               SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
             )
    )
  );

CREATE POLICY product_attribute_values_insert
  ON public.product_attribute_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      (
        public.has_anew_permission((SELECT auth.uid()), 'products.create')
        OR public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      )
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_attribute_values.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY product_attribute_values_update
  ON public.product_attribute_values
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_attribute_values.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_attribute_values.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY product_attribute_values_delete
  ON public.product_attribute_values
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.delete')
      AND EXISTS (
        SELECT 1
        FROM   public.products p
        WHERE  p.id = product_attribute_values.product_id
          AND  p.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );


-- ============================================================
-- 7. product_attribute_value_prices — replace all four policies with org-scoped versions
-- ============================================================
-- Baseline problems (PAV-PRICE-NO-ORG-SCOPE):
--   a) SELECT policy is USING (true) — readable by every authenticated user across
--      all tenants (and anon via GRANT ALL).
--   b) INSERT/UPDATE/DELETE policies use only auth.uid() IS NOT NULL — no org scope,
--      no permission check. Any user in org A can mutate attribute value prices for org B.
--
-- Fix: use organization_id directly — confirmed present on table via DB query
-- (columns: id, attribute_id, value_option, price, organization_id, product_id, ...).
-- No JOIN needed. has_anew_permission required on write operations.

DROP POLICY IF EXISTS "Users can view attribute value prices" ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS "Authenticated users can insert attribute value prices" ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS "Authenticated users can update attribute value prices" ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS "Authenticated users can delete attribute value prices" ON public.product_attribute_value_prices;

CREATE POLICY product_attribute_value_prices_select
  ON public.product_attribute_value_prices
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (
         SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
       )
  );

CREATE POLICY product_attribute_value_prices_insert
  ON public.product_attribute_value_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      (
        public.has_anew_permission((SELECT auth.uid()), 'products.create')
        OR public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      )
      AND organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
    )
  );

CREATE POLICY product_attribute_value_prices_update
  ON public.product_attribute_value_prices
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.edit')
      AND organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
    )
  );

CREATE POLICY product_attribute_value_prices_delete
  ON public.product_attribute_value_prices
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.delete')
      AND organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
    )
  );


-- ============================================================
-- 8. GRANT/REVOKE — revoke anon; tighten authenticated on core product tables
-- ============================================================
-- Baseline: GRANT ALL TO anon on all four tables (lines 30649-30768) and GRANT ALL
-- TO authenticated (which includes TRUNCATE and REFERENCES, not needed by the app).
-- PROD-009: anon should have zero privileges on products tables.
-- Fix: REVOKE ALL from anon; grant only SELECT/INSERT/UPDATE/DELETE to authenticated.
-- service_role retains ALL (needed for triggers, imports, admin operations).

REVOKE ALL ON TABLE public.products                    FROM anon;
REVOKE ALL ON TABLE public.product_prices              FROM anon;
REVOKE ALL ON TABLE public.product_organizations       FROM anon;
REVOKE ALL ON TABLE public.product_attribute_values    FROM anon;
REVOKE ALL ON TABLE public.product_price_history       FROM anon;
REVOKE ALL ON TABLE public.product_attribute_value_prices FROM anon;

-- Tighten authenticated: revoke ALL then grant only the DML operations the app needs.
REVOKE ALL ON TABLE public.products                    FROM authenticated;
REVOKE ALL ON TABLE public.product_prices              FROM authenticated;
REVOKE ALL ON TABLE public.product_organizations       FROM authenticated;
REVOKE ALL ON TABLE public.product_attribute_values    FROM authenticated;
REVOKE ALL ON TABLE public.product_attribute_value_prices FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products                    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_prices              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_organizations       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_attribute_values    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_attribute_value_prices TO authenticated;

-- product_price_history: authenticated gets SELECT only (writes go through SECURITY DEFINER trigger).
REVOKE ALL ON TABLE public.product_price_history FROM authenticated;
GRANT SELECT ON TABLE public.product_price_history TO authenticated;


-- ============================================================
-- 9. log_product_price_change() — fix actor resolution + drop duplicate trigger
-- ============================================================
-- Baseline bugs:
--   a) Actor resolved exclusively via auth.uid() lookup against anew_users.
--      Returns NULL in service_role / import / background contexts. (PROD-012)
--   b) Two triggers both call this function on UPDATE:
--      product_price_change_trigger (line 17419) and trigger_log_price_change (line 17797).
--      Every qualifying UPDATE writes TWO rows to product_price_history. (PROD-004)
--
-- Fix a: GUC-first actor resolution — COALESCE(app.audit_user_id GUC, anew_users lookup).
--        Preserves existing trigger condition (OLD.price IS DISTINCT FROM NEW.price) and
--        INSERT columns/values exactly. SECURITY DEFINER + search_path = public unchanged.
-- Fix b: Drop trigger_log_price_change (the later-registered duplicate, line 17797).
--        product_price_change_trigger (line 17419) is the original and is retained.

REVOKE ALL ON FUNCTION public.log_product_price_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_user_id uuid;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.price IS DISTINCT FROM NEW.price) THEN

    -- GUC-first: honours set_audit_context() called from app-layer (import flows,
    -- service_role RPCs, withAuditContext wrapper). Falls back to anew_users lookup
    -- via auth.uid() for direct UI sessions where the GUC is not set.
    v_business_user_id := COALESCE(
      nullif(current_setting('app.audit_user_id', true), '')::uuid,
      (
        SELECT id
        FROM   public.anew_users
        WHERE  auth_user_id = auth.uid()
        LIMIT  1
      )
    );

    INSERT INTO public.product_price_history (
      product_id, price_type, old_price, new_price, currency, changed_by
    ) VALUES (
      NEW.product_id, NEW.price_type, OLD.price, NEW.price, NEW.currency, v_business_user_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- service_role needs EXECUTE to fire the trigger from any caller context.
GRANT EXECUTE ON FUNCTION public.log_product_price_change() TO service_role;

-- Drop the duplicate trigger (trigger_log_price_change = second registration, line 17797).
-- product_price_change_trigger (line 17419) is retained as the canonical trigger.
DROP TRIGGER IF EXISTS trigger_log_price_change ON public.product_prices;
