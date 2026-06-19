-- Forward-only fix for the deployed leads scope migration.
-- Supports legacy rows whose created_by contains auth.users.id.

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
  v_owned_scope_ids uuid[];
  v_team_scope_ids uuid[];
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_to < p_date_from THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_lead_access_context(p_org_id, p_scope, 'leads.view');

  v_owned_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(ARRAY[v_ctx.anew_user_id, v_ctx.auth_user_id]) AS x
    WHERE x IS NOT NULL
  );

  v_team_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[])
      || COALESCE(v_owned_scope_ids, ARRAY[]::uuid[])
    ) AS x
    WHERE x IS NOT NULL
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
      (
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
        END
      )::text AS effective_status,
      l.source::text AS source,
      l.assigned_to,
      l.created_by,
      l.created_at,
      l.converted_at,
      l.converted_to_contact_id,
      l.converted_to_client_id,
      l.scheduled_visit_id,
      l.last_contact_result::text AS last_contact_result,
      l.search_text::text AS search_text,
      COALESCE(l.contact_attempts, 0)::integer AS contact_attempts
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
  SELECT
    cl.lead_id,
    cl.organization_id,
    cl.root_organization_id,
    cl.entity_id,
    cl.campaign_id,
    cl.status,
    cl.effective_status,
    cl.source,
    cl.assigned_to,
    cl.created_by,
    cl.created_at,
    cl.converted_at,
    cl.converted_to_contact_id,
    cl.converted_to_client_id,
    cl.scheduled_visit_id,
    cl.last_contact_result,
    cl.search_text,
    cl.contact_attempts
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
        AND (
          cl.assigned_to = ANY(COALESCE(v_owned_scope_ids, ARRAY[]::uuid[]))
          OR cl.created_by = ANY(COALESCE(v_owned_scope_ids, ARRAY[]::uuid[]))
        )
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

REVOKE ALL ON FUNCTION public.get_scoped_leads_base(
  uuid, boolean, text, text, uuid, uuid, boolean, text, boolean,
  text, boolean, text, timestamp with time zone, timestamp with time zone
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_scoped_leads_base(
  uuid, boolean, text, text, uuid, uuid, boolean, text, boolean,
  text, boolean, text, timestamp with time zone, timestamp with time zone
) TO authenticated, service_role;
