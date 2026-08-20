-- ============================================================================
-- Clients dashboard: two new SECURITY DEFINER RPCs that fix truncation/scope
-- inconsistencies found in an audit of AnewClientsDashboard.tsx and
-- ClientsValueView.tsx.
--
-- Problem being fixed (both existing components):
--   1. The "org-wide" KPI totals (Valor Contratos, Contratos Activos, A
--      Expirar) are built by paging client_contracts with a plain
--      `.select()` (PostgREST default row cap applies, currently 1000). An
--      organization with more signed/active contracts than that cap silently
--      under-counts every KPI card, with no error surfaced anywhere.
--   2. That same org-wide query ignores whatever the user has filtered the
--      client list by (search, health, etc.) -- it always aggregates the
--      full backing table for the org, not the currently-filtered set the
--      user is looking at.
--   3. There is no existing way to break clients down by marketing origin
--      (lead_sources / campaigns) with real name/color/icon -- this is new
--      functionality, not a fix.
--
-- Both problems are fixed by doing the aggregation in SQL (SUM/COUNT over
-- the full matching set, not a capped client-side page) inside a
-- SECURITY DEFINER function that accepts the caller's already-resolved
-- filters (p_entity_ids, p_scope_org_ids) as explicit parameters.
--
-- Security note (see "Verificação de segurança" in the task spec this
-- migration was written from): get_lead_dashboard_stats_scoped does NOT
-- blindly trust its p_org_id/p_scope argument -- it re-derives the caller's
-- real access via resolve_lead_access_context() (permission check +
-- get_user_crm_org_ids() org-visibility check) before running any query,
-- because SECURITY DEFINER bypasses RLS entirely. filter_visible_entity_ids
-- goes further and is restricted to service_role only, precisely because it
-- accepts an identity-bearing parameter with no independent verification.
--
-- Both RPCs below follow that same "verify, don't just trust" pattern,
-- scaled to what anew_clients_select / client_contracts_select actually
-- check today (20260927010000_strict_crm_org_isolation.sql +
-- 20260928010000_fix_missed_crm_org_ids_swap.sql):
--   organization_id IN get_user_crm_org_ids(auth.uid())
--   AND has_anew_permission(auth.uid(), '<clients.view|client_contracts.view>')
--
-- p_organization_id/p_scope_org_ids are therefore re-validated against
-- get_user_crm_org_ids(auth.uid()) inside the function (intersected, never
-- taken as-is) before being used to filter rows, and the relevant binary
-- permission is re-checked with has_anew_permission -- exactly what the
-- RLS policies these functions bypass would otherwise have enforced. This
-- is at least as strict as today's plain `.select()` calls, which run under
-- the caller's own session and are already bound by that same RLS.
--
-- p_entity_ids is trusted as a pure narrowing filter (same trust model the
-- task spec asked for): it can only ever shrink the result versus the
-- already org-scoped query, never widen it to rows the org check wouldn't
-- already allow, so it carries no privilege-escalation risk on its own.
--
-- Deliberate addition vs. the literal spec: rpc_client_contract_stats gets
-- one extra trailing parameter, p_creator_ids (default NULL), not present
-- in the original 4-parameter sketch. AnewClientsDashboard.tsx's own
-- comment block ("client_contracts.view scope ... distinct from ... the
-- clients.view scope already applied to scopedClients ... Both scopes must
-- be respected") documents that client_contracts.view has its own
-- independent OWNED/TEAM creator-based scope, applied today via
-- `.in("created_by", contractCreatorFilter)` on both the per-entity and the
-- org-wide contract queries. p_entity_ids alone cannot carry that second,
-- independent scope dimension. Dropping it in the new RPC would mean an
-- OWNED/TEAM-scoped user suddenly sees org-wide contract totals in the KPI
-- cards instead of their restricted subset -- a real regression versus
-- current behavior, so p_creator_ids (nullable, purely a narrowing filter
-- like p_entity_ids, ANDed into the WHERE clause) is added to let the
-- frontend keep passing that scope through. NULL preserves the exact
-- literal-spec behavior (no creator restriction / ORG scope).
-- ============================================================================

-- ── RPC 1: client_contracts aggregate stats, filter- and scope-aware ────────
CREATE OR REPLACE FUNCTION public.rpc_client_contract_stats(
  p_organization_id uuid,
  p_scope_org_ids uuid[] DEFAULT NULL,
  p_entity_ids uuid[] DEFAULT NULL,
  p_statuses text[] DEFAULT ARRAY['signed','active'],
  p_creator_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_visible_org_ids uuid[];
  v_effective_org_ids uuid[];
  v_empty jsonb := jsonb_build_object(
    'value_sem_iva', 0,
    'value_com_iva', 0,
    'active_count', 0,
    'expiring_soon_count', 0,
    'distinct_clients_with_contract', 0
  );
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'p_organization_id is required';
  END IF;

  -- Mirrors client_contracts_select RLS exactly (same permission code). This
  -- function is SECURITY DEFINER and therefore bypasses that policy, so the
  -- check must be re-done here -- a missing/removed permission must degrade
  -- to zeroed stats (matching the dashboard's existing "NONE scope -> skip,
  -- values stay 0" UX), not leak an aggregate the caller could not otherwise
  -- see.
  IF NOT public.has_anew_permission(v_auth_uid, 'client_contracts.view') THEN
    RETURN v_empty;
  END IF;

  SELECT ARRAY(SELECT public.get_user_crm_org_ids(v_auth_uid)) INTO v_visible_org_ids;

  IF p_scope_org_ids IS NOT NULL THEN
    -- Never trust the caller-supplied scope list as-is -- intersect with what
    -- this auth user actually has an active membership in, same source of
    -- truth client_contracts_select itself reads from.
    SELECT ARRAY(
      SELECT unnest(p_scope_org_ids)
      INTERSECT
      SELECT unnest(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))
    ) INTO v_effective_org_ids;
  ELSE
    IF NOT (p_organization_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
      RETURN v_empty;
    END IF;
    v_effective_org_ids := ARRAY[p_organization_id];
  END IF;

  IF v_effective_org_ids IS NULL OR array_length(v_effective_org_ids, 1) IS NULL THEN
    RETURN v_empty;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'value_sem_iva', COALESCE(SUM(cc.total_value_sem_iva) FILTER (WHERE cc.status = ANY(p_statuses)), 0),
      'value_com_iva', COALESCE(SUM(cc.total_value) FILTER (WHERE cc.status = ANY(p_statuses)), 0),
      'active_count', COUNT(*) FILTER (WHERE cc.status = ANY(p_statuses)),
      'expiring_soon_count', COUNT(*) FILTER (
        WHERE cc.status = ANY(p_statuses)
          AND cc.end_date IS NOT NULL
          AND cc.end_date < (now() + interval '30 days')
          AND cc.end_date >= now()
      ),
      'distinct_clients_with_contract', COUNT(DISTINCT cc.entity_id) FILTER (WHERE cc.status = ANY(p_statuses))
    )
    FROM public.client_contracts cc
    WHERE cc.deleted_at IS NULL
      AND cc.organization_id = ANY(v_effective_org_ids)
      AND (p_entity_ids IS NULL OR cc.entity_id = ANY(p_entity_ids))
      AND (p_creator_ids IS NULL OR cc.created_by = ANY(p_creator_ids))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_client_contract_stats(uuid, uuid[], uuid[], text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_client_contract_stats(uuid, uuid[], uuid[], text[], uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_client_contract_stats(uuid, uuid[], uuid[], text[], uuid[]) IS
  'Scope-aware, set-based client_contracts KPI aggregate for the Clients dashboard (replaces capped client-side .select() aggregation in AnewClientsDashboard.tsx / ClientsValueView.tsx). Re-checks client_contracts.view permission and get_user_crm_org_ids() org-visibility internally (SECURITY DEFINER bypasses RLS). p_entity_ids/p_creator_ids are pure narrowing filters supplied by the caller (already resolved client-side via usePermissionScope/scopedClients), same trust model as the rest of this dashboard.';

-- ── RPC 2: client distribution by marketing origin (source / campaign) ─────
CREATE OR REPLACE FUNCTION public.rpc_client_origin_distribution(
  p_organization_id uuid,
  p_scope_org_ids uuid[] DEFAULT NULL,
  p_entity_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_visible_org_ids uuid[];
  v_effective_org_ids uuid[];
  v_empty jsonb := jsonb_build_object(
    'total_clients', 0,
    'unknown_count', 0,
    'by_source', '[]'::jsonb,
    'by_campaign', '[]'::jsonb
  );
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'p_organization_id is required';
  END IF;

  -- Mirrors anew_clients_select RLS exactly (same permission code, same
  -- org-visibility function) -- see security note at the top of this file.
  IF NOT public.has_anew_permission(v_auth_uid, 'clients.view') THEN
    RETURN v_empty;
  END IF;

  SELECT ARRAY(SELECT public.get_user_crm_org_ids(v_auth_uid)) INTO v_visible_org_ids;

  IF p_scope_org_ids IS NOT NULL THEN
    SELECT ARRAY(
      SELECT unnest(p_scope_org_ids)
      INTERSECT
      SELECT unnest(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))
    ) INTO v_effective_org_ids;
  ELSE
    IF NOT (p_organization_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
      RETURN v_empty;
    END IF;
    v_effective_org_ids := ARRAY[p_organization_id];
  END IF;

  IF v_effective_org_ids IS NULL OR array_length(v_effective_org_ids, 1) IS NULL THEN
    RETURN v_empty;
  END IF;

  RETURN (
    WITH scoped_clients AS (
      SELECT c.id, c.entity_id, c.origin_source, c.origin_source_id, c.origin_campaign_id
      FROM public.anew_clients c
      WHERE c.deleted_at IS NULL
        AND c.organization_id = ANY(v_effective_org_ids)
        AND (p_entity_ids IS NULL OR c.entity_id = ANY(p_entity_ids))
    ),
    by_source AS (
      SELECT
        ls.id AS source_id,
        COALESCE(ls.name, sc.origin_source, 'Desconhecida') AS name,
        COALESCE(ls.color, '#94a3b8') AS color,
        ls.icon,
        COUNT(*) AS client_count,
        COALESCE(SUM(cs.value_sem_iva), 0) AS value_sem_iva
      FROM scoped_clients sc
      LEFT JOIN public.lead_sources ls ON ls.id = sc.origin_source_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cc.total_value_sem_iva), 0) AS value_sem_iva
        FROM public.client_contracts cc
        WHERE cc.entity_id = sc.entity_id
          AND cc.status = ANY(ARRAY['signed', 'active'])
          AND cc.deleted_at IS NULL
      ) cs ON true
      WHERE sc.origin_source_id IS NOT NULL OR sc.origin_source IS NOT NULL
      GROUP BY ls.id, ls.name, sc.origin_source, ls.color, ls.icon
    ),
    by_campaign AS (
      SELECT
        camp.id AS campaign_id,
        camp.name,
        COUNT(*) AS client_count,
        COALESCE(SUM(cs.value_sem_iva), 0) AS value_sem_iva
      FROM scoped_clients sc
      JOIN public.campaigns camp ON camp.id = sc.origin_campaign_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cc.total_value_sem_iva), 0) AS value_sem_iva
        FROM public.client_contracts cc
        WHERE cc.entity_id = sc.entity_id
          AND cc.status = ANY(ARRAY['signed', 'active'])
          AND cc.deleted_at IS NULL
      ) cs ON true
      GROUP BY camp.id, camp.name
      ORDER BY COUNT(*) DESC
      LIMIT 10
    ),
    totals AS (
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE origin_source_id IS NULL AND origin_source IS NULL) AS unknown_count
      FROM scoped_clients
    )
    SELECT jsonb_build_object(
      'total_clients', (SELECT total FROM totals),
      'unknown_count', (SELECT unknown_count FROM totals),
      'by_source', COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
              'source_id', source_id,
              'name', name,
              'color', color,
              'icon', icon,
              'client_count', client_count,
              'value_sem_iva', value_sem_iva
            )
            ORDER BY client_count DESC
          )
         FROM by_source),
        '[]'::jsonb
      ),
      'by_campaign', COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
              'campaign_id', campaign_id,
              'name', name,
              'client_count', client_count,
              'value_sem_iva', value_sem_iva
            )
          )
         FROM by_campaign),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_client_origin_distribution(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_client_origin_distribution(uuid, uuid[], uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_client_origin_distribution(uuid, uuid[], uuid[]) IS
  'Client distribution by marketing origin (lead_sources.origin_source_id) and by campaign (campaigns.origin_campaign_id), with real name/color/icon, plus per-bucket contract value (signed/active, sem IVA). Re-checks clients.view permission and get_user_crm_org_ids() org-visibility internally (SECURITY DEFINER bypasses RLS). p_entity_ids is a pure narrowing filter supplied by the caller (already resolved client-side).';
