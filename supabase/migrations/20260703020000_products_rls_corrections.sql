-- Products RLS Corrections — Wave 2
-- 2026-07-03 | Module: Products | Wave: 2 (post-review corrections)
-- Forward-only migration. Do not fold into the baseline.
--
-- Corrections applied:
--
--   FIX-1 (HIGH) — product_prices SELECT: remove bare org-visibility fallback branch.
--     The third OR arm in Wave 0 granted SELECT on product_prices to any org member
--     regardless of the products.view permission. Any user holding contacts.view (or any
--     other org-scoped permission) could read all product prices for their org.
--     Correct predicate: is_system_admin_user OR (products.view AND org-scope).
--
--   FIX-2 (LOW) — product_price_history INSERT deny: add AS RESTRICTIVE.
--     Wave 0 created a PERMISSIVE WITH CHECK (false) INSERT policy. With no other
--     PERMISSIVE INSERT policy the default deny achieves the same practical result, but
--     the semantics are incorrect: if any future migration adds a permissive INSERT policy
--     it would override the deny. AS RESTRICTIVE enforces the deny regardless of future
--     permissive policies, matching the intent stated in the Wave 0 comment and matching
--     the UPDATE/DELETE deny policies on the same table which correctly use AS RESTRICTIVE.
--
-- Not fixed here (accepted limitations):
--   MEDIUM — products_update / product_organizations_update WITH CHECK does not enforce
--     organization_id immutability. PostgreSQL RLS cannot enforce a self-join on the
--     updated table within WITH CHECK without a stable key reference. Enforcement would
--     require a BEFORE UPDATE trigger. This is a known gap documented in the audit log.
--     Practical exposure is bounded: attacker must hold products.edit in both orgs.
--
-- Prerequisites: 20260703000000_products_security_fixes.sql (Wave 0)

-- ============================================================
-- FIX-1: product_prices SELECT — remove bare org-visibility fallback
-- ============================================================
-- Before (Wave 0):
--   USING (
--     is_system_admin_user(...)
--     OR (has_anew_permission(..., 'products.view') AND EXISTS (...org scope...))
--     OR (EXISTS (...org scope...))   ← bare fallback, no permission gate
--   )
-- After:
--   USING (
--     is_system_admin_user(...)
--     OR (has_anew_permission(..., 'products.view') AND EXISTS (...org scope...))
--   )

DROP POLICY IF EXISTS product_prices_select ON public.product_prices;

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
  );


-- ============================================================
-- FIX-2: product_price_history INSERT deny — add AS RESTRICTIVE
-- ============================================================
-- Drop the PERMISSIVE deny policy created in Wave 0 and replace with
-- AS RESTRICTIVE to match the UPDATE and DELETE deny policies on this table.
-- Effect is identical in the current state (no other INSERT policy exists),
-- but RESTRICTIVE is the correct semantics for a deny-all guard.

DROP POLICY IF EXISTS product_price_history_system_insert ON public.product_price_history;

CREATE POLICY product_price_history_system_insert
  ON public.product_price_history
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
