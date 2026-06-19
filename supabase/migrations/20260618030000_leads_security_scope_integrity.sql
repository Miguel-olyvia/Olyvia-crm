CREATE OR REPLACE FUNCTION public.resolve_root_organization_id(p_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE walk(org_id, path, depth) AS (
    SELECT p_org_id, ARRAY[p_org_id]::uuid[], 0
    WHERE p_org_id IS NOT NULL

    UNION ALL

    SELECT h.parent_org_id, w.path || h.parent_org_id, w.depth + 1
    FROM walk w
    JOIN public.anew_hierarchy h
      ON h.child_org_id = w.org_id
    WHERE h.parent_org_id IS NOT NULL
      AND NOT h.parent_org_id = ANY(w.path)
      AND w.depth < 31
  )
  SELECT COALESCE(
    (SELECT org_id FROM walk ORDER BY depth DESC LIMIT 1),
    p_org_id
  );
$$;


CREATE OR REPLACE FUNCTION public.resolve_lead_access_context(
  p_org_id uuid,
  p_requested_scope text DEFAULT 'ORG',
  p_permission_code text DEFAULT 'leads.view'
)
RETURNS TABLE (
  auth_user_id uuid,
  anew_user_id uuid,
  visible_org_ids uuid[],
  requested_scope text,
  permitted_scope text,
  applied_scope text,
  team_user_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_visible_org_ids uuid[];
  v_requested_scope text;
  v_permitted_scope text := 'OWNED';
  v_applied_scope text := 'OWNED';
  v_team_user_ids uuid[] := ARRAY[]::uuid[];
  v_is_admin boolean := false;
  v_has_permission boolean := false;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  SELECT au.id
  INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'business user not found for auth user';
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_visible_org_ids(v_auth_uid)
  )
  INTO v_visible_org_ids;

  IF NOT (p_org_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'permission denied: organization not visible';
  END IF;

  v_requested_scope := UPPER(COALESCE(NULLIF(BTRIM(p_requested_scope), ''), 'ORG'));
  IF v_requested_scope = 'ALL' THEN
    v_requested_scope := 'ORG';
  END IF;
  IF v_requested_scope NOT IN ('ORG', 'TEAM', 'OWNED') THEN
    v_requested_scope := 'ORG';
  END IF;

  WITH RECURSIVE org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc
      ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id, r.code AS role_code
    FROM public.anew_memberships m
    JOIN public.anew_roles r
      ON r.id = m.role_id
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  )
  SELECT EXISTS (
           SELECT 1
           FROM scoped_memberships sm
           WHERE sm.role_code IN ('system_admin', 'super_admin')
         ),
         EXISTS (
           SELECT 1
           FROM scoped_memberships sm
           JOIN public.anew_role_permissions arp
             ON arp.role_id = sm.role_id
            AND arp.permission_code = p_permission_code
         )
  INTO v_is_admin, v_has_permission;

  IF NOT v_is_admin AND NOT v_has_permission THEN
    RAISE EXCEPTION 'permission denied: % required', p_permission_code;
  END IF;

  IF v_is_admin THEN
    v_permitted_scope := 'ORG';
  ELSE
    WITH RECURSIVE org_chain AS (
      SELECT p_org_id AS org_id
      UNION
      SELECT h.parent_org_id
      FROM public.anew_hierarchy h
      JOIN org_chain oc
        ON oc.org_id = h.child_org_id
      WHERE h.parent_org_id IS NOT NULL
    ),
    scoped_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id IN (SELECT org_id FROM org_chain)
    )
    SELECT CASE
             WHEN EXISTS (
               SELECT 1
               FROM public.anew_membership_permission_scopes s
               JOIN scoped_memberships sm
                 ON sm.id = s.membership_id
               WHERE s.permission_code = p_permission_code
                 AND s.scope_level = 'ORG'
             ) THEN 'ORG'
             WHEN EXISTS (
               SELECT 1
               FROM public.anew_membership_permission_scopes s
               JOIN scoped_memberships sm
                 ON sm.id = s.membership_id
               WHERE s.permission_code = p_permission_code
                 AND s.scope_level = 'TEAM'
             ) THEN 'TEAM'
             ELSE 'OWNED'
           END
    INTO v_permitted_scope;
  END IF;

  IF v_requested_scope = 'ORG' THEN
    v_applied_scope := CASE v_permitted_scope
      WHEN 'ORG' THEN 'ORG'
      WHEN 'TEAM' THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSIF v_requested_scope = 'TEAM' THEN
    v_applied_scope := CASE v_permitted_scope
      WHEN 'ORG' THEN 'TEAM'
      WHEN 'TEAM' THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSE
    v_applied_scope := 'OWNED';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
  INTO v_team_user_ids
  FROM public.organization_teams t
  JOIN public.organization_team_members tm
    ON tm.team_id = t.id
  WHERE t.organization_id = p_org_id
    AND t.leader_id = v_anew_user_id;

  RETURN QUERY
  SELECT v_auth_uid,
         v_anew_user_id,
         COALESCE(v_visible_org_ids, ARRAY[]::uuid[]),
         v_requested_scope,
         v_permitted_scope,
         v_applied_scope,
         COALESCE(v_team_user_ids, ARRAY[]::uuid[]);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_scoped_leads_base(
  p_org_id uuid,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG',
  p_status text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_assigned_unassigned boolean DEFAULT false,
  p_contact_result text DEFAULT NULL,
  p_contact_result_none boolean DEFAULT false,
  p_source text DEFAULT NULL,
  p_source_is_null boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  lead_id uuid,
  organization_id uuid,
  root_organization_id uuid,
  entity_id uuid,
  campaign_id uuid,
  status text,
  effective_status text,
  source text,
  assigned_to uuid,
  created_by uuid,
  created_at timestamp with time zone,
  converted_at timestamp with time zone,
  converted_to_contact_id uuid,
  converted_to_client_id uuid,
  scheduled_visit_id uuid,
  last_contact_result text,
  search_text text,
  contact_attempts integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx RECORD;
  v_team_scope_ids uuid[];
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_to < p_date_from THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_lead_access_context(p_org_id, p_scope, 'leads.view');

  v_team_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
  );

  RETURN QUERY
  WITH candidate_leads AS (
    SELECT
      l.id AS lead_id,
      l.organization_id,
      l.root_organization_id,
      l.entity_id,
      l.campaign_id,
      COALESCE(l.status::text, 'new') AS status,
      CASE
        WHEN l.converted_at IS NOT NULL
          OR l.converted_to_contact_id IS NOT NULL
          OR l.converted_to_client_id IS NOT NULL
          OR COALESCE(LOWER(l.status::text), '') = 'converted'
          THEN 'converted'
        WHEN l.status = 'visit_scheduled' THEN 'visit_scheduled'
        WHEN l.scheduled_visit_id IS NOT NULL THEN 'visit_scheduled'
        WHEN l.last_contact_result IS NOT NULL AND (
          LOWER(REPLACE(REPLACE(l.last_contact_result, ' ', '_'), '-', '_')) IN ('visit_scheduled', 'visita_agendada')
          OR LOWER(REPLACE(REPLACE(COALESCE(lcr.name, ''), ' ', '_'), '-', '_')) IN ('visit_scheduled', 'visita_agendada')
        ) THEN 'visit_scheduled'
        ELSE COALESCE(l.status::text, 'new')
      END AS effective_status,
      l.source,
      l.assigned_to,
      l.created_by,
      l.created_at,
      l.converted_at,
      l.converted_to_contact_id,
      l.converted_to_client_id,
      l.scheduled_visit_id,
      l.last_contact_result::text,
      l.search_text,
      COALESCE(l.contact_attempts, 0) AS contact_attempts
    FROM public.anew_leads l
    LEFT JOIN public.lead_contact_results lcr
      ON l.last_contact_result IS NOT NULL
     AND lcr.id::text = l.last_contact_result
    WHERE (
        (p_is_root AND (l.root_organization_id = p_org_id OR l.organization_id = p_org_id))
        OR (NOT p_is_root AND l.organization_id = p_org_id)
      )
      AND l.deleted_at IS NULL
      AND (p_campaign_id IS NULL OR l.campaign_id = p_campaign_id)
      AND (
        (p_assigned_unassigned AND l.assigned_to IS NULL)
        OR (
          NOT p_assigned_unassigned
          AND (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
        )
      )
      AND (
        (p_contact_result_none AND l.last_contact_result IS NULL)
        OR (
          NOT p_contact_result_none
          AND (p_contact_result IS NULL OR l.last_contact_result = p_contact_result)
        )
      )
      AND (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND (p_date_to IS NULL OR l.created_at <= p_date_to)
      AND (p_search IS NULL OR l.search_text ILIKE '%' || p_search || '%')
      AND (
        (p_source_is_null AND NULLIF(BTRIM(COALESCE(l.source, '')), '') IS NULL)
        OR (
          NOT p_source_is_null
          AND (p_source IS NULL OR l.source = p_source)
        )
      )
  )
  SELECT *
  FROM candidate_leads cl
  WHERE (
      p_status IS NULL
      OR p_status = 'all'
      OR (p_status = 'lost' AND cl.effective_status IN ('lost', 'rejected'))
      OR (p_status = 'visit_scheduled' AND cl.effective_status = 'visit_scheduled')
      OR (p_status = 'new' AND cl.effective_status = 'new')
      OR (p_status NOT IN ('all', 'lost', 'visit_scheduled', 'new') AND cl.effective_status = p_status)
    )
    AND (
      v_ctx.applied_scope = 'ORG'
      OR (
        v_ctx.applied_scope = 'OWNED'
        AND (cl.assigned_to = v_ctx.anew_user_id OR cl.created_by = v_ctx.anew_user_id)
      )
      OR (
        v_ctx.applied_scope = 'TEAM'
        AND (
          cl.assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
          OR cl.created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
        )
      )
    );
END;
$$;


DROP FUNCTION IF EXISTS public.get_lead_status_counts(
  uuid,
  boolean,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  boolean
);

CREATE FUNCTION public.get_lead_status_counts(
  p_org_id uuid,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ALL'::text,
  p_anew_user_id uuid DEFAULT NULL::uuid,
  p_auth_user_id uuid DEFAULT NULL::uuid,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_assigned_unassigned boolean DEFAULT false,
  p_contact_result text DEFAULT NULL::text,
  p_contact_result_none boolean DEFAULT false,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_search text DEFAULT NULL::text,
  p_source text DEFAULT NULL::text,
  p_source_is_null boolean DEFAULT false
)
RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  WHERE l.effective_status <> 'converted'
    AND l.converted_to_contact_id IS NULL
    AND l.converted_at IS NULL
  GROUP BY l.effective_status;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_lead_status_counts(
  p_org_id uuid,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ALL'::text,
  p_anew_user_id uuid DEFAULT NULL::uuid,
  p_auth_user_id uuid DEFAULT NULL::uuid,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_assigned_unassigned boolean DEFAULT false,
  p_contact_result text DEFAULT NULL::text,
  p_contact_result_none boolean DEFAULT false,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_search text DEFAULT NULL::text
)
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.get_lead_status_counts(
    p_org_id => p_org_id,
    p_is_root => p_is_root,
    p_scope => p_scope,
    p_anew_user_id => p_anew_user_id,
    p_auth_user_id => p_auth_user_id,
    p_campaign_id => p_campaign_id,
    p_assigned_to => p_assigned_to,
    p_assigned_unassigned => p_assigned_unassigned,
    p_contact_result => p_contact_result,
    p_contact_result_none => p_contact_result_none,
    p_date_from => p_date_from,
    p_date_to => p_date_to,
    p_search => p_search,
    p_source => NULL,
    p_source_is_null => false
  );
$$;


DROP FUNCTION IF EXISTS public.get_lead_dashboard_stats_scoped(
  uuid,
  boolean,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text,
  timestamp with time zone,
  timestamp with time zone,
  boolean
);

CREATE FUNCTION public.get_lead_dashboard_stats_scoped(
  p_org_id uuid,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG',
  p_anew_user_id uuid DEFAULT NULL::uuid,
  p_auth_user_id uuid DEFAULT NULL::uuid,
  p_status text DEFAULT NULL::text,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_assigned_unassigned boolean DEFAULT false,
  p_contact_result text DEFAULT NULL::text,
  p_contact_result_none boolean DEFAULT false,
  p_source text DEFAULT NULL::text,
  p_source_is_null boolean DEFAULT false,
  p_search text DEFAULT NULL::text,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_compare_previous boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx RECORD;
  v_previous_from timestamp with time zone;
  v_previous_to timestamp with time zone;
  v_current jsonb;
  v_previous jsonb;
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_to < p_date_from THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_lead_access_context(p_org_id, p_scope, 'leads.view');

  IF p_compare_previous AND p_date_from IS NOT NULL AND p_date_to IS NOT NULL THEN
    v_previous_to := p_date_from - interval '1 second';
    v_previous_from := v_previous_to - (p_date_to - p_date_from);
  END IF;

  WITH current_rows AS (
    SELECT *
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope,
      p_status => p_status,
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
    )
  ),
  current_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE effective_status <> 'converted')::bigint AS active_pipeline,
      COUNT(*)::bigint AS leads_in_period,
      COUNT(*) FILTER (
        WHERE (created_at AT TIME ZONE 'Europe/Lisbon')::date = (now() AT TIME ZONE 'Europe/Lisbon')::date
      )::bigint AS leads_today,
      COUNT(*) FILTER (WHERE effective_status = 'converted')::bigint AS converted_in_period,
      COUNT(*) FILTER (
        WHERE effective_status = 'converted'
          AND p_date_from IS NOT NULL
          AND p_date_to IS NOT NULL
          AND created_at >= p_date_from
          AND created_at <= p_date_to
      )::bigint AS cohort_conversions,
      COUNT(*) FILTER (WHERE effective_status = 'visit_scheduled')::bigint AS visits_scheduled,
      COALESCE(SUM(contact_attempts), 0)::bigint AS contact_attempts
    FROM current_rows
  ),
  current_status_counts AS (
    SELECT COALESCE(jsonb_object_agg(effective_status, cnt), '{}'::jsonb) AS value
    FROM (
      SELECT effective_status, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY effective_status
    ) s
  ),
  current_source_counts AS (
    SELECT COALESCE(jsonb_object_agg(COALESCE(NULLIF(source, ''), '__none__'), cnt), '{}'::jsonb) AS value
    FROM (
      SELECT COALESCE(NULLIF(source, ''), '__none__') AS source, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY COALESCE(NULLIF(source, ''), '__none__')
    ) s
  ),
  current_campaign_counts AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'campaign_id', c.campaign_id,
          'campaign_name', camp.name,
          'count', c.cnt
        )
        ORDER BY c.cnt DESC, camp.name NULLS LAST
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT campaign_id, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY campaign_id
    ) c
    LEFT JOIN public.campaigns camp
      ON camp.id = c.campaign_id
  ),
  current_assigned_counts AS (
    SELECT COALESCE(jsonb_object_agg(COALESCE(assigned_to::text, 'unassigned'), cnt), '{}'::jsonb) AS value
    FROM (
      SELECT assigned_to, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY assigned_to
    ) s
  ),
  current_daily_counts AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', TO_CHAR(day_bucket, 'YYYY-MM-DD'),
          'count', cnt
        )
        ORDER BY day_bucket
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS day_bucket, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY (created_at AT TIME ZONE 'Europe/Lisbon')::date
    ) s
  ),
  current_deal_counts AS (
    SELECT jsonb_build_object(
      'open_deals_total', COUNT(d.*)::bigint,
      'leads_with_open_deals', COUNT(DISTINCT d.lead_id)::bigint
    ) AS value
    FROM current_rows cr
    LEFT JOIN public.deals d
      ON d.lead_id = cr.lead_id
     AND d.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'active_pipeline', cs.active_pipeline,
    'leads_in_period', cs.leads_in_period,
    'leads_today', cs.leads_today,
    'converted_in_period', cs.converted_in_period,
    'cohort_conversions', cs.cohort_conversions,
    'conversion_rate', CASE
      WHEN cs.leads_in_period = 0 THEN 0
      ELSE ROUND((cs.converted_in_period::numeric / cs.leads_in_period::numeric) * 100, 2)
    END,
    'visits_scheduled', cs.visits_scheduled,
    'contact_attempts', cs.contact_attempts,
    'contact_attempts_in_period', cs.contact_attempts,
    'status_counts', csc.value,
    'source_counts', csrc.value,
    'campaign_counts', ccc.value,
    'assigned_counts', cac.value,
    'daily_counts', cdc.value,
    'deal_counts', cdeal.value
  )
  INTO v_current
  FROM current_summary cs
  CROSS JOIN current_status_counts csc
  CROSS JOIN current_source_counts csrc
  CROSS JOIN current_campaign_counts ccc
  CROSS JOIN current_assigned_counts cac
  CROSS JOIN current_daily_counts cdc
  CROSS JOIN current_deal_counts cdeal;

  IF p_compare_previous AND v_previous_from IS NOT NULL AND v_previous_to IS NOT NULL THEN
    WITH previous_rows AS (
      SELECT *
      FROM public.get_scoped_leads_base(
        p_org_id => p_org_id,
        p_is_root => p_is_root,
        p_scope => p_scope,
        p_status => p_status,
        p_campaign_id => p_campaign_id,
        p_assigned_to => p_assigned_to,
        p_assigned_unassigned => p_assigned_unassigned,
        p_contact_result => p_contact_result,
        p_contact_result_none => p_contact_result_none,
        p_source => p_source,
        p_source_is_null => p_source_is_null,
        p_search => p_search,
        p_date_from => v_previous_from,
        p_date_to => v_previous_to
      )
    ),
    previous_summary AS (
      SELECT
        COUNT(*)::bigint AS leads_in_period,
        COUNT(*) FILTER (WHERE effective_status = 'converted')::bigint AS converted_in_period,
        COUNT(*) FILTER (WHERE effective_status = 'converted')::bigint AS cohort_conversions,
        COALESCE(SUM(contact_attempts), 0)::bigint AS contact_attempts
      FROM previous_rows
    ),
    previous_daily_counts AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'date', TO_CHAR(day_bucket, 'YYYY-MM-DD'),
            'count', cnt
          )
          ORDER BY day_bucket
        ),
        '[]'::jsonb
      ) AS value
      FROM (
        SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS day_bucket, COUNT(*)::bigint AS cnt
        FROM previous_rows
        GROUP BY (created_at AT TIME ZONE 'Europe/Lisbon')::date
      ) s
    )
    SELECT jsonb_build_object(
      'leads_in_period', ps.leads_in_period,
      'converted_in_period', ps.converted_in_period,
      'cohort_conversions', ps.cohort_conversions,
      'contact_attempts', ps.contact_attempts,
      'contact_attempts_in_period', ps.contact_attempts,
      'daily_counts', pdc.value
    )
    INTO v_previous
    FROM previous_summary ps
    CROSS JOIN previous_daily_counts pdc;
  ELSE
    v_previous := NULL;
  END IF;

  RETURN COALESCE(v_current, '{}'::jsonb) || jsonb_build_object(
    'meta', jsonb_build_object(
      'scope_applied', v_ctx.applied_scope,
      'date_from', p_date_from,
      'date_to', p_date_to,
      'comparison_from', v_previous_from,
      'comparison_to', v_previous_to
    ),
    'current', COALESCE(v_current, '{}'::jsonb),
    'previous', v_previous
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.can_see_entity(p_entity_id uuid, p_auth_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_visible uuid[];
  v_business_uid uuid;
BEGIN
  IF p_entity_id IS NULL OR p_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_visible_org_ids(p_auth_uid)
  )
  INTO v_visible;

  SELECT COALESCE(
           public.current_business_user_id(),
           (
             SELECT m.business_user_id
             FROM public.auth_to_business_user_map m
             WHERE m.auth_user_id = p_auth_uid
             LIMIT 1
           ),
           (
             SELECT au.id
             FROM public.anew_users au
             WHERE au.auth_user_id = p_auth_uid
             LIMIT 1
           )
         )
  INTO v_business_uid;

  IF v_business_uid IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = p_entity_id
      AND e.created_by = v_business_uid
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_entity_org_links l
    WHERE l.entity_id = p_entity_id
      AND l.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_leads x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_contacts x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_clients x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotes x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.deals x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


CREATE OR REPLACE FUNCTION public.upsert_entity_identity(
  p_entity_id uuid,
  p_emails jsonb DEFAULT NULL::jsonb,
  p_phones jsonb DEFAULT NULL::jsonb,
  p_addresses jsonb DEFAULT NULL::jsonb,
  p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_anew_user_id uuid;
  v_creator uuid;
  v_email jsonb;
  v_phone jsonb;
  v_addr jsonb;
  v_addr_id uuid;
  v_entity_exists boolean;
  v_emails jsonb;
  v_phones jsonb;
  v_addresses jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM public.anew_entities
    WHERE id = p_entity_id
  )
  INTO v_entity_exists;

  IF NOT v_entity_exists THEN
    RAISE EXCEPTION 'Entity % does not exist', p_entity_id;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.can_see_entity(p_entity_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: entity not visible';
  END IF;

  IF p_emails IS NULL OR p_emails = 'null'::jsonb THEN
    v_emails := NULL;
  ELSIF jsonb_typeof(p_emails) <> 'array' THEN
    RAISE EXCEPTION 'p_emails must be a JSON array';
  ELSE
    v_emails := p_emails;
  END IF;

  IF p_phones IS NULL OR p_phones = 'null'::jsonb THEN
    v_phones := NULL;
  ELSIF jsonb_typeof(p_phones) <> 'array' THEN
    RAISE EXCEPTION 'p_phones must be a JSON array';
  ELSE
    v_phones := p_phones;
  END IF;

  IF p_addresses IS NULL OR p_addresses = 'null'::jsonb THEN
    v_addresses := NULL;
  ELSIF jsonb_typeof(p_addresses) <> 'array' THEN
    RAISE EXCEPTION 'p_addresses must be a JSON array';
  ELSE
    v_addresses := p_addresses;
  END IF;

  IF p_created_by IS NOT NULL THEN
    SELECT id
    INTO v_anew_user_id
    FROM public.anew_users
    WHERE id = p_created_by
    LIMIT 1;

    IF v_anew_user_id IS NOT NULL THEN
      v_creator := v_anew_user_id;
    ELSE
      SELECT id
      INTO v_anew_user_id
      FROM public.anew_users
      WHERE auth_user_id = p_created_by
      LIMIT 1;
      v_creator := COALESCE(v_anew_user_id, p_created_by);
    END IF;
  ELSE
    SELECT COALESCE(
             (
               SELECT au.id
               FROM public.anew_users au
               WHERE au.auth_user_id = auth.uid()
               LIMIT 1
             ),
             public.current_business_user_id()
           )
    INTO v_creator;
  END IF;

  IF v_emails IS NOT NULL THEN
    DELETE FROM public.anew_entity_emails
    WHERE entity_id = p_entity_id;

    FOR v_email IN
      SELECT *
      FROM jsonb_array_elements(v_emails)
    LOOP
      INSERT INTO public.anew_entity_emails (
        entity_id,
        email,
        email_type,
        is_primary,
        created_by
      )
      VALUES (
        p_entity_id,
        v_email->>'email',
        COALESCE(v_email->>'email_type', 'personal'),
        COALESCE((v_email->>'is_primary')::boolean, false),
        v_creator
      );
    END LOOP;
  END IF;

  IF v_phones IS NOT NULL THEN
    DELETE FROM public.anew_entity_phones
    WHERE entity_id = p_entity_id;

    FOR v_phone IN
      SELECT *
      FROM jsonb_array_elements(v_phones)
    LOOP
      INSERT INTO public.anew_entity_phones (
        entity_id,
        phone_number,
        country_code,
        phone_type,
        is_primary,
        created_by
      )
      VALUES (
        p_entity_id,
        v_phone->>'phone_number',
        COALESCE(v_phone->>'country_code', '+351'),
        COALESCE(v_phone->>'phone_type', 'mobile'),
        COALESCE((v_phone->>'is_primary')::boolean, false),
        v_creator
      );
    END LOOP;
  END IF;

  IF v_addresses IS NOT NULL THEN
    UPDATE public.anew_entity_addresses
    SET valid_to = now()
    WHERE entity_id = p_entity_id
      AND valid_to IS NULL;

    FOR v_addr IN
      SELECT *
      FROM jsonb_array_elements(v_addresses)
    LOOP
      INSERT INTO public.anew_addresses (
        address_key,
        street,
        number,
        floor,
        unit,
        postal_code,
        city,
        district,
        country,
        extra,
        created_by
      )
      VALUES (
        md5(
          COALESCE(v_addr->>'street', '') || '|' ||
          COALESCE(v_addr->>'number', '') || '|' ||
          COALESCE(v_addr->>'postal_code', '') || '|' ||
          COALESCE(v_addr->>'city', '')
        ),
        COALESCE(v_addr->>'street', ''),
        COALESCE(v_addr->>'number', ''),
        NULLIF(v_addr->>'floor', ''),
        NULLIF(v_addr->>'unit', ''),
        COALESCE(v_addr->>'postal_code', ''),
        COALESCE(v_addr->>'city', ''),
        NULLIF(v_addr->>'district', ''),
        COALESCE(v_addr->>'country', 'PT'),
        NULLIF(v_addr->>'extra', ''),
        v_creator
      )
      RETURNING id INTO v_addr_id;

      INSERT INTO public.anew_entity_addresses (
        entity_id,
        address_id,
        address_type,
        is_primary,
        is_fiscal,
        valid_from,
        created_by
      )
      VALUES (
        p_entity_id,
        v_addr_id,
        COALESCE(v_addr->>'address_type', 'home'),
        COALESCE((v_addr->>'is_primary')::boolean, false),
        COALESCE((v_addr->>'is_fiscal')::boolean, false),
        now(),
        v_creator
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entity_id', p_entity_id,
    'emails_count', CASE WHEN v_emails IS NULL THEN 0 ELSE jsonb_array_length(v_emails) END,
    'phones_count', CASE WHEN v_phones IS NULL THEN 0 ELSE jsonb_array_length(v_phones) END,
    'addresses_count', CASE WHEN v_addresses IS NULL THEN 0 ELSE jsonb_array_length(v_addresses) END
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.revert_lead_to_contact(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contact RECORD;
  v_lead RECORD;
  v_ctx RECORD;
  v_actor uuid := auth.uid();
  v_team_scope_ids uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT
    c.id,
    c.entity_id,
    c.organization_id,
    c.root_organization_id,
    c.source_lead_id,
    c.assigned_to,
    c.created_by
  INTO v_contact
  FROM public.anew_contacts c
  WHERE c.id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  IF v_contact.source_lead_id IS NULL THEN
    RAISE EXCEPTION 'Contact was not converted from a lead';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_lead_access_context(v_contact.organization_id, 'ORG', 'leads.edit');

  v_team_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
  );

  IF v_ctx.applied_scope = 'OWNED'
     AND NOT (
       v_contact.assigned_to = v_ctx.anew_user_id
       OR v_contact.created_by = v_ctx.anew_user_id
     ) THEN
    RAISE EXCEPTION 'permission denied: leads.edit required';
  END IF;

  IF v_ctx.applied_scope = 'TEAM'
     AND NOT (
       v_contact.assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
       OR v_contact.created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
     ) THEN
    RAISE EXCEPTION 'permission denied: leads.edit required';
  END IF;

  SELECT
    l.id,
    l.entity_id,
    l.organization_id,
    l.root_organization_id,
    l.converted_to_contact_id,
    l.deleted_at
  INTO v_lead
  FROM public.anew_leads l
  WHERE l.id = v_contact.source_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source lead not found';
  END IF;

  IF v_lead.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Source lead is deleted';
  END IF;

  IF v_lead.entity_id IS DISTINCT FROM v_contact.entity_id THEN
    RAISE EXCEPTION 'Source lead/entity mismatch';
  END IF;

  IF v_lead.organization_id IS DISTINCT FROM v_contact.organization_id THEN
    RAISE EXCEPTION 'Source lead organization mismatch';
  END IF;

  IF v_lead.converted_to_contact_id IS DISTINCT FROM p_contact_id THEN
    RAISE EXCEPTION 'Source lead is not linked to this contact';
  END IF;

  UPDATE public.anew_contacts
  SET status = 'inactive'
  WHERE id = p_contact_id;

  UPDATE public.anew_entity_roles
  SET status = 'inactive'
  WHERE entity_id = v_contact.entity_id
    AND organization_id = v_contact.organization_id
    AND role = 'contact'
    AND status <> 'deleted';

  UPDATE public.anew_leads
  SET converted_to_contact_id = NULL,
      converted_at = NULL,
      converted_by = NULL,
      status = 'qualified'
  WHERE id = v_lead.id;

  UPDATE public.anew_entity_roles
  SET status = 'active'
  WHERE entity_id = v_contact.entity_id
    AND organization_id = v_contact.organization_id
    AND role = 'lead'
    AND status <> 'deleted';

  INSERT INTO public.anew_entity_history (
    entity_id,
    change_type,
    field_name,
    old_value,
    new_value,
    changed_by,
    metadata
  )
  VALUES (
    v_contact.entity_id,
    'conversion_reverted',
    'lead_to_contact',
    p_contact_id::text,
    v_lead.id::text,
    v_actor,
    jsonb_build_object(
      'contact_id', p_contact_id,
      'lead_id', v_lead.id,
      'organization_id', v_contact.organization_id
    )
  );

  RETURN true;
END;
$$;


CREATE FUNCTION public.assert_lead_dynamic_uniqueness(
  p_org_id uuid,
  p_root_org_id uuid,
  p_field_key text,
  p_field_value text,
  p_exclude_lead_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_root_org_id uuid := COALESCE(p_root_org_id, public.resolve_root_organization_id(p_org_id));
  v_duplicate RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.has_anew_permission(auth.uid(), 'leads.create')
      OR public.has_anew_permission(auth.uid(), 'leads.edit')
    ) THEN
      RAISE EXCEPTION 'permission denied: leads.create required';
    END IF;

    IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'permission denied: organization not visible';
    END IF;
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_field_key, '')), '') IS NULL
     OR NULLIF(BTRIM(COALESCE(p_field_value, '')), '') IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'checked', false
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      COALESCE(v_root_org_id::text, p_org_id::text, 'no-org') || '|' ||
      LOWER(BTRIM(p_field_key)) || '|' ||
      LOWER(BTRIM(p_field_value)),
      0
    )
  );

  SELECT l.id, l.entity_id
  INTO v_duplicate
  FROM public.anew_leads l
  WHERE l.deleted_at IS NULL
    AND COALESCE(l.root_organization_id, l.organization_id) = COALESCE(v_root_org_id, p_org_id)
    AND (p_exclude_lead_id IS NULL OR l.id <> p_exclude_lead_id)
    AND LOWER(COALESCE(l.field_values ->> p_field_key, '')) = LOWER(BTRIM(p_field_value))
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'Duplicate lead detected for %=%', p_field_key, p_field_value;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'checked', true,
    'organization_id', p_org_id,
    'root_organization_id', v_root_org_id,
    'field_key', p_field_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_lead_dynamic_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_root_org_id uuid := COALESCE(
    NEW.root_organization_id,
    public.resolve_root_organization_id(NEW.organization_id)
  );
  v_field RECORD;
  v_value text;
BEGIN
  IF NEW.campaign_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR v_field IN
    WITH campaign_form AS (
      SELECT c.form_id
      FROM public.campaigns c
      WHERE c.id = NEW.campaign_id
    )
    SELECT ff.field_key
    FROM campaign_form cf
    JOIN public.form_fields ff
      ON ff.form_id = cf.form_id
    WHERE cf.form_id IS NOT NULL
      AND ff.is_active = true
      AND ff.is_unique = true

    UNION

    SELECT lfd.field_key
    FROM public.lead_field_definitions lfd
    WHERE lfd.campaign_id = NEW.campaign_id
      AND lfd.is_active = true
      AND lfd.is_unique = true
      AND NOT EXISTS (
        SELECT 1
        FROM campaign_form cf
        WHERE cf.form_id IS NOT NULL
      )
  LOOP
    v_value := NULLIF(BTRIM(COALESCE(NEW.field_values ->> v_field.field_key, '')), '');
    IF v_value IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        COALESCE(v_root_org_id::text, NEW.organization_id::text, 'no-org') || '|' ||
        NEW.campaign_id::text || '|' ||
        LOWER(BTRIM(v_field.field_key)) || '|' ||
        LOWER(v_value),
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.id <> NEW.id
        AND l.deleted_at IS NULL
        AND l.campaign_id = NEW.campaign_id
        AND COALESCE(l.root_organization_id, l.organization_id)
          = COALESCE(v_root_org_id, NEW.organization_id)
        AND LOWER(BTRIM(COALESCE(l.field_values ->> v_field.field_key, '')))
          = LOWER(v_value)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format(
          'Duplicate lead detected for %s=%s',
          v_field.field_key,
          v_value
        );
    END IF;
  END LOOP;

  NEW.root_organization_id := v_root_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_lead_dynamic_uniqueness ON public.anew_leads;
CREATE TRIGGER enforce_lead_dynamic_uniqueness
BEFORE INSERT OR UPDATE OF field_values, campaign_id, organization_id, root_organization_id
ON public.anew_leads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lead_dynamic_uniqueness();

CREATE FUNCTION public.get_lead_page_health(
  p_org_id uuid,
  p_entity_ids uuid[],
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG',
  p_since timestamp with time zone DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  entity_id uuid,
  interaction_count bigint,
  has_open_deal boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH visible_entities AS (
    SELECT DISTINCT l.entity_id
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope
    ) l
    WHERE l.entity_id = ANY(COALESCE(p_entity_ids, ARRAY[]::uuid[]))
  ),
  interaction_counts AS (
    SELECT
      ve.entity_id,
      COUNT(ei.id) FILTER (WHERE ei.interaction_at >= p_since)::bigint AS interaction_count
    FROM visible_entities ve
    LEFT JOIN public.entity_interactions ei
      ON ei.entity_id = ve.entity_id
    GROUP BY ve.entity_id
  ),
  deal_flags AS (
    SELECT
      ve.entity_id,
      COALESCE(BOOL_OR(d.id IS NOT NULL), false) AS has_open_deal
    FROM visible_entities ve
    LEFT JOIN public.deals d
      ON d.entity_id = ve.entity_id
     AND d.closed_at IS NULL
     AND d.deleted_at IS NULL
    GROUP BY ve.entity_id
  )
  SELECT
    ve.entity_id,
    COALESCE(ic.interaction_count, 0)::bigint,
    COALESCE(df.has_open_deal, false)
  FROM visible_entities ve
  LEFT JOIN interaction_counts ic USING (entity_id)
  LEFT JOIN deal_flags df USING (entity_id);
$$;

CREATE FUNCTION public.get_lead_source_options(
  p_org_id uuid,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG'
)
RETURNS TABLE (source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT BTRIM(l.source) AS source
  FROM public.get_scoped_leads_base(
    p_org_id => p_org_id,
    p_is_root => p_is_root,
    p_scope => p_scope
  ) l
  WHERE NULLIF(BTRIM(COALESCE(l.source, '')), '') IS NOT NULL
  ORDER BY source;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anew_contacts_source_lead_id_fkey'
      AND conrelid = 'public.anew_contacts'::regclass
  ) THEN
    ALTER TABLE public.anew_contacts
      ADD CONSTRAINT anew_contacts_source_lead_id_fkey
      FOREIGN KEY (source_lead_id)
      REFERENCES public.anew_leads(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;


DROP POLICY IF EXISTS anew_leads_select ON public.anew_leads;
DROP POLICY IF EXISTS anew_leads_insert ON public.anew_leads;
DROP POLICY IF EXISTS anew_leads_update ON public.anew_leads;
DROP POLICY IF EXISTS anew_leads_delete ON public.anew_leads;

CREATE POLICY anew_leads_select
ON public.anew_leads
FOR SELECT
TO authenticated
USING (
  public.has_anew_permission(auth.uid(), 'leads.view'::text)
  AND (
    organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);

CREATE POLICY anew_leads_insert
ON public.anew_leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_anew_permission(auth.uid(), 'leads.create'::text)
  AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  AND root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  AND root_organization_id = public.resolve_root_organization_id(organization_id)
  AND (
    created_by IS NULL
    OR created_by = COALESCE(
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = auth.uid()
        LIMIT 1
      ),
      public.current_business_user_id()
    )
  )
);

CREATE POLICY anew_leads_update
ON public.anew_leads
FOR UPDATE
TO authenticated
USING (
  public.has_anew_permission(auth.uid(), 'leads.edit'::text)
  AND (
    organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
)
WITH CHECK (
  public.has_anew_permission(auth.uid(), 'leads.edit'::text)
  AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  AND root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  AND root_organization_id = public.resolve_root_organization_id(organization_id)
);

CREATE POLICY anew_leads_delete
ON public.anew_leads
FOR DELETE
TO authenticated
USING (
  public.has_anew_permission(auth.uid(), 'leads.delete'::text)
  AND (
    organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);


REVOKE ALL ON FUNCTION public.resolve_root_organization_id(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.resolve_root_organization_id(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_lead_access_context(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_see_entity(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.can_see_entity(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_see_entity(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_entity_identity(uuid, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.upsert_entity_identity(uuid, jsonb, jsonb, jsonb, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_entity_identity(uuid, jsonb, jsonb, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.revert_lead_to_contact(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.revert_lead_to_contact(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revert_lead_to_contact(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.revert_lead_to_contact_conversion(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_entity_with_contacts_and_roles(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.create_entity_with_contacts_and_roles(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_lead_dashboard_stats(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.get_lead_dashboard_stats(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.get_lead_dashboard_stats_scoped(uuid, boolean, text, uuid, uuid, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_lead_dashboard_stats_scoped(uuid, boolean, text, uuid, uuid, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_dashboard_stats_scoped(uuid, boolean, text, uuid, uuid, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.assert_lead_dynamic_uniqueness(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.assert_lead_dynamic_uniqueness(uuid, uuid, text, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assert_lead_dynamic_uniqueness(uuid, uuid, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_lead_dynamic_uniqueness() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_lead_page_health(uuid, uuid[], boolean, text, timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_lead_page_health(uuid, uuid[], boolean, text, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_page_health(uuid, uuid[], boolean, text, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.get_lead_source_options(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_lead_source_options(uuid, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_source_options(uuid, boolean, text) TO service_role;
