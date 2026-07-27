-- entity-search-500 fix: EntitySearchInput's lead-matching fallback was
-- hitting anew_entities/anew_entity_emails/anew_entity_phones directly with
-- a plain ILIKE, under RLS. RLS predicates on those tables defeat the
-- trigram GIN indexes (idx_anew_entities_display_name_trgm, etc.) because
-- the planner cannot prove the RLS check is leakproof, forcing a per-row
-- expensive re-check. For org-scoped users this can exceed the PostgREST
-- statement_timeout (57014), surfacing as a hard HTTP 500 to the client
-- (confirmed live: 8.2s, HTTP 500, "canceling statement due to statement
-- timeout" for teste-scope-team-leader@example.com against org Nike).
--
-- Fix mirrors the already-shipped, already-locked-down search_proposal_entities
-- pattern (20260615130000, ACLs tightened in 20260627110000): a narrowly
-- scoped SECURITY DEFINER STABLE RPC that bypasses RLS internally to keep the
-- trigram indexes usable, but re-applies visibility explicitly in the query
-- body via get_user_visible_org_ids — so the caller-supplied org id list is
-- always intersected with the orgs the calling user can actually see before
-- any row is returned. No RLS policy is touched; no grant on the underlying
-- tables changes.

CREATE OR REPLACE FUNCTION "public"."search_lead_entities"(
  "p_search" "text",
  "p_org_ids" "uuid"[],
  "p_limit" integer DEFAULT 100
) RETURNS TABLE("entity_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_search text := '%' || trim(coalesce(p_search, '')) || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_org_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR length(trim(coalesce(p_search, ''))) < 2 THEN
    RETURN;
  END IF;

  -- SECURITY: never trust p_org_ids as-is. Intersect it with the orgs the
  -- calling user can actually see (same helper search_proposal_entities uses)
  -- so a caller cannot pass an arbitrary org id and read leads outside their
  -- own visibility.
  SELECT array_agg(vo) INTO v_org_ids
  FROM public.get_user_visible_org_ids(auth.uid()) AS vo
  WHERE vo = ANY(coalesce(p_org_ids, ARRAY[]::uuid[]));

  IF v_org_ids IS NULL OR array_length(v_org_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT e.id AS entity_id
  FROM public.anew_entities e
  JOIN public.anew_leads l ON l.entity_id = e.id
  LEFT JOIN public.anew_entity_emails ee ON ee.entity_id = e.id
  LEFT JOIN public.anew_entity_phones ep ON ep.entity_id = e.id
  WHERE l.organization_id = ANY(v_org_ids)
    AND l.deleted_at IS NULL
    AND (
      e.display_name ILIKE v_search
      OR e.first_name ILIKE v_search
      OR e.last_name ILIKE v_search
      OR ee.email ILIKE v_search
      OR ep.phone_number ILIKE v_search
    )
  LIMIT v_limit;
END;
$$;

-- Same lockdown pattern as search_proposal_entities: no anon/PUBLIC access,
-- only authenticated callers (who are then subject to the auth.uid()-based
-- visibility check inside the function body) and service_role.
REVOKE ALL ON FUNCTION "public"."search_lead_entities"("text", "uuid"[], integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."search_lead_entities"("text", "uuid"[], integer) TO "authenticated", "service_role";
