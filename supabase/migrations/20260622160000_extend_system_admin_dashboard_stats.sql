-- Slide 8 follow-up: system_admin keeps zero access to org-level PII tables
-- (leads, contacts, clients, proposals, quotes, contracts) by design. Instead
-- of opening RLS for those tables, extend the aggregated platform dashboard
-- with more global counts so system_admin still gets visibility without
-- touching individual rows.
-- Forward-only migration. Do not fold into the baseline.

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
  v_contacts bigint := 0;
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
  SELECT count(*) INTO v_contacts FROM public.anew_contacts WHERE deleted_at IS NULL;
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
    'contacts', COALESCE(v_contacts, 0),
    'clients', COALESCE(v_clients, 0),
    'proposals', COALESCE(v_proposals, 0),
    'quotes', COALESCE(v_quotes, 0),
    'contracts', COALESCE(v_contracts, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_admin_dashboard_stats() TO authenticated, service_role;
