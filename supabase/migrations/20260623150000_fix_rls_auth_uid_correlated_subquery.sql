-- Performance fix: replace bare auth.uid() with (SELECT auth.uid()) in
-- system_admin_pii_default_deny RESTRICTIVE policies.
--
-- PostgreSQL evaluates auth.uid() once per row when called directly inside a
-- USING clause. Wrapping it in (SELECT auth.uid()) marks it as a stable
-- subquery, allowing the planner to hoist the evaluation to once per query
-- and use it as an index-compatible constant — significant on large PII tables.
--
-- These policies were created dynamically in 20260622114000_system_admin_least_privilege.sql.
-- ALTER POLICY is used here instead of DROP/CREATE to avoid a window where
-- the RESTRICTIVE policy is absent.

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'anew_entities', 'anew_addresses', 'anew_entity_addresses',
    'anew_entity_emails', 'anew_entity_phones', 'anew_entity_history',
    'anew_entity_relationships', 'anew_entity_roles', 'anew_leads',
    'anew_contacts', 'anew_clients', 'deals', 'quotes', 'quote_lines',
    'quote_fees', 'proposals', 'proposal_items', 'client_contracts',
    'client_contract_parties', 'contract_documents', 'entity_interactions',
    'lead_contact_history'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY system_admin_pii_default_deny ON public.%I
           USING (NOT public.is_system_admin((SELECT auth.uid())))
           WITH CHECK (NOT public.is_system_admin((SELECT auth.uid())))',
        v_table
      );
    END IF;
  END LOOP;
END
$$;
