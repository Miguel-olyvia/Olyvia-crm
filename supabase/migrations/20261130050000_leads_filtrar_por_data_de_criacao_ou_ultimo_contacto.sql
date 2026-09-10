-- ============================================================================
-- Filtrar leads por data de CRIACAO ou por data do ULTIMO CONTACTO
-- ============================================================================
--
-- O filtro de datas da lista de leads dizia apenas "Data Inicio"/"Data Fim" e
-- estava preso a data de CRIACAO. Uma lead criada em Agosto e contactada em
-- Setembro nao aparecia num filtro "a partir de 1 de Setembro" -- era cortada
-- antes de a lista a ver. Nao havia forma de perguntar "o que foi contactado
-- neste periodo".
--
-- Passa a existir um parametro que diz SOBRE QUE DATA se filtra. Por omissao e
-- 'created_at', pelo que os sete consumidores de get_scoped_leads_base
-- (dashboard, pipeline, saude da pagina, origens, contadores, etc.) que nao
-- passam nada mantem exactamente o comportamento anterior.
--
-- Os contadores dos separadores tem de receber o mesmo parametro: sao contados
-- por get_lead_status_counts, que delega nesta base. Sem isso a lista contaria
-- por uma data e os numeros por outra -- a divergencia que o proprio codigo da
-- pagina avisa que nao pode acontecer.
--
-- Substitui-se em vez de sobrecarregar: um segundo par de funcoes com aridades
-- diferentes deixaria o PostgREST sem saber qual escolher. Nenhuma politica RLS
-- e nenhuma vista dependem destas funcoes (verificado), por isso a substituicao
-- e segura.

DROP FUNCTION IF EXISTS public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text, text, boolean);

CREATE OR REPLACE FUNCTION public.get_scoped_leads_base(p_org_id uuid, p_is_root boolean DEFAULT false, p_scope text DEFAULT 'ORG'::text, p_status text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_contact_result text DEFAULT NULL::text, p_contact_result_none boolean DEFAULT false, p_source text DEFAULT NULL::text, p_source_is_null boolean DEFAULT false, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_field text DEFAULT 'created_at'::text)
 RETURNS TABLE(lead_id uuid, organization_id uuid, root_organization_id uuid, entity_id uuid, campaign_id uuid, status text, effective_status text, source text, assigned_to uuid, created_by uuid, created_at timestamp with time zone, converted_at timestamp with time zone, converted_to_contact_id uuid, converted_to_client_id uuid, scheduled_visit_id uuid, last_contact_result text, search_text text, contact_attempts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          WHEN LOWER(l.status::text) IN ('qualified', 'negotiation')
            THEN LOWER(l.status::text)
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
      -- A data sobre a qual se filtra passa a ser escolhida por quem chama.
      -- Sem isto so era possivel perguntar "criadas em X"; agora tambem
      -- "contactadas em X". Qualquer valor diferente de 'last_contact_at'
      -- comporta-se como antes (created_at), por isso os 7 consumidores que
      -- nao passam nada mantem exactamente o comportamento de sempre.
      -- Quem nunca foi contactado tem last_contact_at NULL e fica de fora ao
      -- filtrar por contacto, que e o que se espera.
      AND (p_date_from IS NULL OR
           (CASE WHEN p_date_field = 'last_contact_at' THEN l.last_contact_at ELSE l.created_at END) >= p_date_from)
      AND (p_date_to IS NULL OR
           (CASE WHEN p_date_field = 'last_contact_at' THEN l.last_contact_at ELSE l.created_at END) <= p_date_to)
      -- Pesquisa palavra a palavra: cada palavra de p_search tem de aparecer
      -- algures em search_text, em qualquer ordem. O predicado anterior era de
      -- frase seguida ('%' || p_search || '%'), por isso "joao silva" nunca
      -- encontrava "Joao Pedro Silva". Regra identica a de get_quotes_kpi_stats
      -- (20261113170000_quotes_search_text.sql) e a de applySearchTextFilter no
      -- cliente (src/lib/searchTextFilter.ts): lower + trim + split por espacos
      -- e nada mais, para os contadores de estado e a lista nunca divergirem.
      AND (
        p_search IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(regexp_split_to_array(lower(trim(p_search)), '\s+')) AS w
          WHERE w <> '' AND COALESCE(l.search_text, '') NOT ILIKE '%' || w || '%'
        )
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_lead_status_counts(p_org_id uuid, p_is_root boolean DEFAULT false, p_scope text DEFAULT 'ALL'::text, p_anew_user_id uuid DEFAULT NULL::uuid, p_auth_user_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_contact_result text DEFAULT NULL::text, p_contact_result_none boolean DEFAULT false, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_source_is_null boolean DEFAULT false, p_date_field text DEFAULT 'created_at'::text)
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
    p_date_to => p_date_to,
    p_date_field => p_date_field
  ) l
  GROUP BY l.effective_status;
END;
$function$;


REVOKE ALL ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_status_counts(uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean, timestamp with time zone, timestamp with time zone, text, text, boolean, text) TO authenticated, service_role;
