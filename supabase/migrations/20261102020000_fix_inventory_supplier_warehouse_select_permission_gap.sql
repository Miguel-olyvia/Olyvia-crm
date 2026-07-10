-- Ponto 1: suppliers_select_policy / warehouses_select_policy / stocks_select_policy /
-- purchase_orders_select_policy only ever checked org membership
-- (get_user_visible_org_ids), never a real permission code. Since portal clients
-- (role 'client', zero anew_permissions) receive an 'active' membership in the
-- org via the normal onboarding flow, they could SELECT suppliers, warehouses,
-- stocks and purchase_orders directly via the REST API/PostgREST, even though
-- the app UI never exposes those screens to them.
--
-- Verified live on 2026-11-02 (pg_policies inspection): INSERT/UPDATE/DELETE on
-- all four tables already require suppliers.*/warehouses.*/inventory.*/
-- purchase_orders.* — only SELECT was missing the check. All roles that
-- currently rely on these SELECT policies (org_admin, org_editor, org_viewer,
-- sales_technician, sales_team_leader, purchase_technician,
-- assistente_comercial, super_admin) already hold the matching *.view
-- permission code, so this tightens the client-portal gap without regressing
-- any legitimate internal role.
--
-- Pattern mirrors quotes_select_policy / proposals_select_policy: org
-- membership AND permission, both required.

DROP POLICY IF EXISTS suppliers_select_policy ON public.suppliers;
CREATE POLICY suppliers_select_policy ON public.suppliers
  FOR SELECT
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    AND has_anew_permission((SELECT auth.uid()), 'suppliers.view')
  );

DROP POLICY IF EXISTS warehouses_select_policy ON public.warehouses;
CREATE POLICY warehouses_select_policy ON public.warehouses
  FOR SELECT
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    AND has_anew_permission((SELECT auth.uid()), 'warehouses.view')
  );

DROP POLICY IF EXISTS purchase_orders_select_policy ON public.purchase_orders;
CREATE POLICY purchase_orders_select_policy ON public.purchase_orders
  FOR SELECT
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    AND has_anew_permission((SELECT auth.uid()), 'purchase_orders.view')
  );

DROP POLICY IF EXISTS stocks_select_policy ON public.stocks;
CREATE POLICY stocks_select_policy ON public.stocks
  FOR SELECT
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    AND has_anew_permission((SELECT auth.uid()), 'inventory.view')
  );
