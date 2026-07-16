-- Fix: 'negotiating' was never a real status — the app already had 'negotiation'
-- ============================================================
-- Found live: the contacts-to-leads merge (20261110080000) invented a new
-- status value 'negotiating' for contacts with a quote/proposal attached,
-- without checking that this CRM already has a pre-existing, fully wired
-- lead pipeline (lead_workflow_stages table, Kanban board, "Quick Status
-- Cards" on the Leads page) with a stage for exactly this concept, named
-- 'negotiation' (label "Negotiation" / "Em Negociação") -- not
-- 'negotiating'. Every "Em Negociação" card/column on the real Leads page
-- was showing 0 because no lead actually had status='negotiation'; they
-- all had the invented 'negotiating' instead, which matches nothing.
--
-- Fix: rename every migrated lead's status from 'negotiating' to
-- 'negotiation' so it lines up with the pipeline that already existed.
-- 'qualified' was already correct (matches an existing stage name too),
-- left untouched.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.anew_leads WHERE status = 'negotiating';
  RAISE NOTICE 'Leads com status=negotiating a corrigir para negotiation: %', v_count;

  UPDATE public.anew_leads SET status = 'negotiation', updated_at = now() WHERE status = 'negotiating';

  RAISE NOTICE 'Corrigidos.';
END $$;

-- Same fix in the backend RPC that counts qualified/negotiating leads for
-- the SystemAdminDashboard KPI card (20261110120000).
CREATE OR REPLACE FUNCTION public.get_system_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_organizations bigint := 0;
  v_users bigint := 0;
  v_memberships bigint := 0;
  v_deals bigint := 0;
  v_deals_value numeric := 0;
  v_leads bigint := 0;
  v_qualified_leads bigint := 0;
  v_clients bigint := 0;
  v_proposals bigint := 0;
  v_quotes bigint := 0;
  v_contracts bigint := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_system_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: system_admin required';
  END IF;

  SELECT count(*) INTO v_organizations FROM public.anew_organizations;
  SELECT count(*) INTO v_users FROM public.anew_users;
  SELECT count(*) INTO v_memberships FROM public.anew_memberships WHERE status = 'active';
  SELECT count(*), COALESCE(sum(value), 0)
  INTO v_deals, v_deals_value
  FROM public.deals
  WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_leads FROM public.anew_leads WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_qualified_leads
  FROM public.anew_leads
  WHERE deleted_at IS NULL AND status IN ('qualified', 'negotiation');
  SELECT count(*) INTO v_clients FROM public.anew_clients WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_proposals FROM public.proposals WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_quotes FROM public.quotes WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_contracts FROM public.client_contracts WHERE deleted_at IS NULL;

  RETURN jsonb_build_object(
    'organizations', COALESCE(v_organizations, 0),
    'users', COALESCE(v_users, 0),
    'memberships', COALESCE(v_memberships, 0),
    'deals', COALESCE(v_deals, 0),
    'deals_value', COALESCE(v_deals_value, 0),
    'leads', COALESCE(v_leads, 0),
    'qualified_leads', COALESCE(v_qualified_leads, 0),
    'clients', COALESCE(v_clients, 0),
    'proposals', COALESCE(v_proposals, 0),
    'quotes', COALESCE(v_quotes, 0),
    'contracts', COALESCE(v_contracts, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_admin_dashboard_stats() TO authenticated, service_role;
