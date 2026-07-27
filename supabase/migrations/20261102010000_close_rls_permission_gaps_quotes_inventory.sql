-- Fix CRITICAL RLS gap: quotes, quote_sends, quote_lines, quote_fees, purchase_orders,
-- stocks, suppliers, warehouses policies only checked org membership, never permission.
-- Since portal clients (role 'client', zero anew permissions) receive an 'active'
-- membership in the org, they could read/edit/delete these records directly via the
-- REST API, bypassing the app UI entirely.
--
-- This migration:
--   1. quotes            -> split SELECT/UPDATE/DELETE to require quotes.view/edit/delete
--                           (mirrors the existing proposals/client_contracts pattern)
--   2. quote_sends       -> same split, reusing the quotes.* permission codes
--                           (quote_sends has no permission codes of its own)
--   3. quote_lines       -> split the old permissive "ALL" + redundant SELECT policy
--   4. quote_fees        -> same split as quote_lines
--   5. purchase_orders / stocks / suppliers / warehouses -> drop the legacy org_*
--      duplicated policies that had no permission check (they were OR'd against the
--      already-correct *_policy ones, silently defeating the permission check)
--   6. purchase_orders / stocks / suppliers / warehouses -> add the
--      system_admin_pii_default_deny RESTRICTIVE policy, replicating the existing
--      break-glass support-access pattern already used on quotes/proposals/client_contracts
--   7. Grant inventory.view/create/edit/delete to sales_technician and
--      assistente_comercial, which today only "saw" stocks through the buggy org_*
--      policies being removed in step 5 (they have zero inventory.* permission codes
--      granted despite using stock management screens in the app).

-- ---------------------------------------------------------------------------
-- 1. quotes: add permission checks to SELECT/UPDATE/DELETE
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS quotes_select_policy ON public.quotes;
CREATE POLICY quotes_select_policy ON public.quotes
  FOR SELECT
  USING (
    (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())))
    AND has_anew_permission(auth.uid(), 'quotes.view')
  );

DROP POLICY IF EXISTS quotes_update_policy ON public.quotes;
CREATE POLICY quotes_update_policy ON public.quotes
  FOR UPDATE
  USING (
    (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    AND has_anew_permission((SELECT auth.uid()), 'quotes.edit')
  )
  WITH CHECK (
    (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    AND has_anew_permission((SELECT auth.uid()), 'quotes.edit')
  );

DROP POLICY IF EXISTS quotes_delete_policy ON public.quotes;
CREATE POLICY quotes_delete_policy ON public.quotes
  FOR DELETE
  USING (
    (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())))
    AND has_anew_permission(auth.uid(), 'quotes.delete')
  );

-- ---------------------------------------------------------------------------
-- 2. quote_sends: reuse quotes.view/edit/delete (no permission codes of its own)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_select_quote_sends ON public.quote_sends;
CREATE POLICY quote_sends_select_policy ON public.quote_sends
  FOR SELECT
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
    AND has_anew_permission(auth.uid(), 'quotes.view')
  );

DROP POLICY IF EXISTS org_update_quote_sends ON public.quote_sends;
CREATE POLICY quote_sends_update_policy ON public.quote_sends
  FOR UPDATE
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
    AND has_anew_permission(auth.uid(), 'quotes.edit')
  )
  WITH CHECK (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
    AND has_anew_permission(auth.uid(), 'quotes.edit')
  );

DROP POLICY IF EXISTS org_delete_quote_sends ON public.quote_sends;
CREATE POLICY quote_sends_delete_policy ON public.quote_sends
  FOR DELETE
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
    AND has_anew_permission(auth.uid(), 'quotes.delete')
  );

-- org_insert_quote_sends is left untouched (out of scope, mirrors quotes_insert_policy
-- which is also not permission-gated today).

-- ---------------------------------------------------------------------------
-- 3. quote_lines: split the permissive "ALL" policy + drop redundant SELECT
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_manage_quote_lines ON public.quote_lines;
DROP POLICY IF EXISTS org_select_quote_lines ON public.quote_lines;

CREATE POLICY quote_lines_select_policy ON public.quote_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.view')
    )
  );

CREATE POLICY quote_lines_insert_policy ON public.quote_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.edit')
    )
  );

CREATE POLICY quote_lines_update_policy ON public.quote_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.edit')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.edit')
    )
  );

CREATE POLICY quote_lines_delete_policy ON public.quote_lines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.delete')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. quote_fees: same split as quote_lines
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_manage_quote_fees ON public.quote_fees;
DROP POLICY IF EXISTS org_select_quote_fees ON public.quote_fees;

CREATE POLICY quote_fees_select_policy ON public.quote_fees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_fees.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.view')
    )
  );

CREATE POLICY quote_fees_insert_policy ON public.quote_fees
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_fees.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.edit')
    )
  );

CREATE POLICY quote_fees_update_policy ON public.quote_fees
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_fees.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.edit')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_fees.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.edit')
    )
  );

CREATE POLICY quote_fees_delete_policy ON public.quote_fees
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_fees.quote_id
        AND quotes.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
        AND has_anew_permission(auth.uid(), 'quotes.delete')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. purchase_orders / stocks / suppliers / warehouses: drop legacy org_* dupes
--    that had no permission check and were silently defeating the correct
--    *_policy ones via PERMISSIVE-OR semantics.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_select_purchase_orders ON public.purchase_orders;
DROP POLICY IF EXISTS org_insert_purchase_orders ON public.purchase_orders;
DROP POLICY IF EXISTS org_update_purchase_orders ON public.purchase_orders;
DROP POLICY IF EXISTS org_delete_purchase_orders ON public.purchase_orders;

DROP POLICY IF EXISTS "Authenticated users can create stocks" ON public.stocks;
DROP POLICY IF EXISTS "Users can delete stocks" ON public.stocks;
DROP POLICY IF EXISTS "Users can update stocks" ON public.stocks;
DROP POLICY IF EXISTS "Users can view all stocks" ON public.stocks;
DROP POLICY IF EXISTS org_select_stocks ON public.stocks;
DROP POLICY IF EXISTS org_insert_stocks ON public.stocks;
DROP POLICY IF EXISTS org_update_stocks ON public.stocks;
DROP POLICY IF EXISTS org_delete_stocks ON public.stocks;

DROP POLICY IF EXISTS org_select_suppliers ON public.suppliers;
DROP POLICY IF EXISTS org_insert_suppliers ON public.suppliers;
DROP POLICY IF EXISTS org_update_suppliers ON public.suppliers;
DROP POLICY IF EXISTS org_delete_suppliers ON public.suppliers;

DROP POLICY IF EXISTS org_select_warehouses ON public.warehouses;
DROP POLICY IF EXISTS org_insert_warehouses ON public.warehouses;
DROP POLICY IF EXISTS org_update_warehouses ON public.warehouses;
DROP POLICY IF EXISTS org_delete_warehouses ON public.warehouses;

-- ---------------------------------------------------------------------------
-- 6. purchase_orders / stocks / suppliers / warehouses: replicate the
--    system_admin_pii_default_deny break-glass pattern already used on
--    quotes/proposals/client_contracts, so system_admin keeps controlled,
--    auditable access via support_access_log instead of blanket org_* access.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.purchase_orders;
CREATE POLICY system_admin_pii_default_deny ON public.purchase_orders
  AS RESTRICTIVE
  FOR ALL
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.stocks;
CREATE POLICY system_admin_pii_default_deny ON public.stocks
  AS RESTRICTIVE
  FOR ALL
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.suppliers;
CREATE POLICY system_admin_pii_default_deny ON public.suppliers
  AS RESTRICTIVE
  FOR ALL
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.warehouses;
CREATE POLICY system_admin_pii_default_deny ON public.warehouses
  AS RESTRICTIVE
  FOR ALL
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

-- ---------------------------------------------------------------------------
-- 7. Grant inventory.* permission codes to sales_technician and
--    assistente_comercial so they keep their current stock management
--    capability once the unguarded org_* policies on stocks are removed above.
--    (They previously had zero inventory.* codes and only had access through
--    the buggy org_insert/update/delete_stocks policies dropped in step 5.)
-- ---------------------------------------------------------------------------

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.anew_roles r
CROSS JOIN (VALUES
  ('inventory.view'),
  ('inventory.create'),
  ('inventory.edit'),
  ('inventory.delete')
) AS p(code)
WHERE r.code IN ('sales_technician', 'assistente_comercial')
ON CONFLICT (role_id, permission_code) DO NOTHING;
