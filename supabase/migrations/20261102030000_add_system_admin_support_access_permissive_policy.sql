-- Ponto 2: fix the break-glass support-access mechanism for the 8 tables in
-- scope (quotes, quote_sends, quote_lines, quote_fees, purchase_orders,
-- stocks, suppliers, warehouses).
--
-- ROOT CAUSE (verified against the live schema on 2026-11-02 via pg_policies):
-- `system_admin_pii_default_deny` is a RESTRICTIVE policy. A RESTRICTIVE
-- policy can only ever narrow access down — it can never be the thing that
-- GRANTS a row to a role. For a row to become visible, at least one
-- PERMISSIVE policy must also independently evaluate to true. Every
-- `*_select_policy` / `*_policy` PERMISSIVE policy on these tables requires
-- real org membership (get_user_visible_org_ids / get_user_crm_org_ids), and
-- those functions return an EMPTY set for a caller whose only role is
-- system_admin (get_user_visible_org_ids explicitly filters out
-- is_system_admin() rows; a system_admin has no genuine membership in a
-- client's org). So even though the RESTRICTIVE policy's USING clause has an
-- `OR (is_system_admin(...) AND has_active_support_access(...))` branch, that
-- branch can only ever make the RESTRICTIVE check pass — it never grants
-- anything on its own. Net result: an approved, active support_access_log
-- session gives system_admin exactly 0 rows on every one of these tables
-- today.
--
-- SYSTEMIC SCOPE: this is not specific to these 8 tables. The exact same
-- RESTRICTIVE-only pattern (confirmed via `select tablename, permissive from
-- pg_policies where policyname = 'system_admin_pii_default_deny'`, all 25
-- rows returned `RESTRICTIVE`, zero `PERMISSIVE` counterpart exists anywhere
-- in the schema for `has_active_support_access`) affects ALL of:
--   anew_addresses, anew_clients, anew_contacts, anew_entities,
--   anew_entity_addresses, anew_entity_emails, anew_entity_history,
--   anew_entity_phones, anew_entity_relationships, anew_entity_roles,
--   anew_leads, client_contract_parties, client_contracts,
--   contract_documents, deals, entity_interactions, proposal_items,
--   proposals, purchase_orders, quote_fees, quote_lines, quotes, stocks,
--   suppliers, warehouses
-- i.e. including proposals/client_contracts, which the original investigation
-- assumed were the working reference example. There is no functioning
-- example of this pattern anywhere in the schema. This migration fixes ONLY
-- the 8 tables in scope for this task (quotes, quote_sends, quote_lines,
-- quote_fees, purchase_orders, stocks, suppliers, warehouses); the remaining
-- 17 tables above need the identical fix in a separate, deliberately-scoped
-- follow-up migration so a system_admin with approved support access doesn't
-- end up with read access to half the system and none of the other half.
--
-- FIX: add one new PERMISSIVE policy per table, `system_admin_support_access`,
-- that actually grants SELECT when is_system_admin() AND
-- has_active_support_access(<org>) both hold. Scoped to SELECT only (read),
-- matching the asymmetric intent already encoded in
-- system_admin_pii_default_deny itself: its WITH CHECK clause deliberately
-- does NOT include the has_active_support_access branch, i.e. support access
-- was always meant to be read-only, never a write channel. No changes to
-- system_admin_pii_default_deny itself; it already contains the correct
-- restrictive-side condition and is left as-is.
--
-- quote_sends does not currently have a system_admin_pii_default_deny
-- RESTRICTIVE policy at all (it never got PII-locked in the earlier support-
-- access rollout). It is added here for consistency with its sibling
-- quotes/quote_lines/quote_fees tables, so system_admin's access to the
-- whole quote object graph is governed by one uniform, auditable mechanism.

-- ---------------------------------------------------------------------------
-- quotes (organization_id only tenancy column)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS system_admin_support_access ON public.quotes;
CREATE POLICY system_admin_support_access ON public.quotes
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND has_active_support_access(organization_id)
  );

-- ---------------------------------------------------------------------------
-- quote_sends: add the missing system_admin_pii_default_deny RESTRICTIVE
-- policy (mirrors quotes) plus the new PERMISSIVE support-access grant.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.quote_sends;
CREATE POLICY system_admin_pii_default_deny ON public.quote_sends
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

DROP POLICY IF EXISTS system_admin_support_access ON public.quote_sends;
CREATE POLICY system_admin_support_access ON public.quote_sends
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND has_active_support_access(organization_id)
  );

-- ---------------------------------------------------------------------------
-- quote_lines / quote_fees: org resolved via quotes (organization_id or
-- root_organization_id), mirrors the existing system_admin_pii_default_deny
-- EXISTS-join shape on these two tables.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS system_admin_support_access ON public.quote_lines;
CREATE POLICY system_admin_support_access ON public.quote_lines
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_lines.quote_id
        AND (
          has_active_support_access(q.organization_id)
          OR has_active_support_access(q.root_organization_id)
        )
    )
  );

DROP POLICY IF EXISTS system_admin_support_access ON public.quote_fees;
CREATE POLICY system_admin_support_access ON public.quote_fees
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_fees.quote_id
        AND (
          has_active_support_access(q.organization_id)
          OR has_active_support_access(q.root_organization_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- purchase_orders / stocks / suppliers / warehouses (organization_id only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS system_admin_support_access ON public.purchase_orders;
CREATE POLICY system_admin_support_access ON public.purchase_orders
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND has_active_support_access(organization_id)
  );

DROP POLICY IF EXISTS system_admin_support_access ON public.stocks;
CREATE POLICY system_admin_support_access ON public.stocks
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND has_active_support_access(organization_id)
  );

DROP POLICY IF EXISTS system_admin_support_access ON public.suppliers;
CREATE POLICY system_admin_support_access ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND has_active_support_access(organization_id)
  );

DROP POLICY IF EXISTS system_admin_support_access ON public.warehouses;
CREATE POLICY system_admin_support_access ON public.warehouses
  FOR SELECT
  TO authenticated
  USING (
    is_system_admin((SELECT auth.uid()))
    AND has_active_support_access(organization_id)
  );
