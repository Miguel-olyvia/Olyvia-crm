-- Fix get_lead_status_counts: the "Won / Converted" status pill on the Leads
-- dashboard/list always shows 0, regardless of how many leads actually
-- converted.
--
-- Root cause: this function's WHERE clause explicitly excludes converted
-- leads BEFORE grouping —
--   WHERE l.effective_status <> 'converted'
--     AND l.converted_to_contact_id IS NULL
--     AND l.converted_at IS NULL
--   GROUP BY l.effective_status
-- — so the result set can structurally never contain a 'converted' row, no
-- matter how many leads are actually converted. This has been the function's
-- behavior since it was first created (20260618030000_leads_security_scope_
-- integrity.sql) and was never a deliberate "active pipeline only" API: the
-- frontend (src/pages/AnewLeads.tsx) reads statusCounts['converted'] directly
-- to render the "Won / Converted" pill/card (see e.g. the Quick Status Cards
-- around line 4889), and separately EXCLUDES 'converted' only when summing
-- the "Total" pill (globalTotal, line 539: `.filter(([key]) => key !==
-- 'converted')`) — which only makes sense if 'converted' is normally present
-- in the map. The sibling function get_lead_dashboard_stats_scoped's own
-- status_counts (used for the dashboard's other breakdowns) has no such
-- exclusion and correctly includes 'converted'.
--
-- Fix: drop the WHERE clause entirely so every effective_status bucket
-- (including 'converted') is grouped and returned normally, matching what
-- get_scoped_leads_base already computes and what the frontend expects.

CREATE OR REPLACE FUNCTION public.get_lead_status_counts(p_org_id uuid, p_is_root boolean DEFAULT false, p_scope text DEFAULT 'ALL'::text, p_anew_user_id uuid DEFAULT NULL::uuid, p_auth_user_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_contact_result text DEFAULT NULL::text, p_contact_result_none boolean DEFAULT false, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_source_is_null boolean DEFAULT false)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    l.effective_status AS status,
    COUNT(*)::bigint AS count
  FROM public.get_scoped_leads_base(
    p_org_id => p_org_id,
    p_is_root => p_is_root,
    p_scope => p_scope,
    p_status => NULL,
    p_campaign_id => p_campaign_id,
    p_assigned_to => p_assigned_to,
    p_assigned_unassigned => p_assigned_unassigned,
    p_contact_result => p_contact_result,
    p_contact_result_none => p_contact_result_none,
    p_source => p_source,
    p_source_is_null => p_source_is_null,
    p_search => p_search,
    p_date_from => p_date_from,
    p_date_to => p_date_to
  ) l
  GROUP BY l.effective_status;
END;
$function$;
