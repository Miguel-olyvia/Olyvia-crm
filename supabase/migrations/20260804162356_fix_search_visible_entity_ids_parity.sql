-- search_visible_entity_ids() exists precisely to avoid the perf trap in
-- can_see_entity() (RLS on anew_entities calls can_see_entity() once per
-- candidate row, and can_see_entity() recomputes the recursive
-- get_user_visible_org_ids() CTE from scratch every single call — for a
-- text search that can't use an index, this multiplies a recursive CTE by
-- every candidate row and times out: confirmed live, 8+ second / 500 errors
-- on a table of under 5k rows). search_visible_entity_ids() computes
-- get_user_visible_org_ids() exactly once per call instead.
--
-- But it had no live caller anywhere in the codebase and had drifted out of
-- sync with can_see_entity() (the actual RLS source of truth) since it was
-- last touched:
--   - missing the root_organization_id half of the visibility check on
--     anew_leads/anew_contacts/anew_clients/quotes/deals (can_see_entity
--     checks organization_id = ANY(visible) OR root_organization_id =
--     ANY(visible); this only checked organization_id)
--   - missing the client_contracts branch entirely (added to can_see_entity
--     by 20261109010000_add_client_contracts_to_can_see_entity.sql)
--   - missing the auth_user_id-direct creator shortcut (added to
--     can_see_entity by 20260626000000_harden_can_see_entity_creator_check.sql)
--     and the auth_to_business_user_map fallback in resolving v_business_uid
--
-- This migration re-syncs it to be a faithful mirror of can_see_entity's
-- current visibility rule (same checks, same tables, same fallback chain) —
-- not a new/relaxed rule — before wiring any caller to it, so switching
-- clientSearch.ts over doesn't change who can see what, only how fast.
CREATE OR REPLACE FUNCTION public.search_visible_entity_ids(p_search text, p_limit integer DEFAULT 200)
 RETURNS TABLE(entity_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_auth         uuid;
  v_business_uid uuid;
  v_visible      uuid[];
  v_term         text;
  v_like         text;
  v_digits       text;
  v_digits_like  text;
  v_limit        integer;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RETURN;
  END IF;

  v_term := btrim(coalesce(p_search, ''));
  IF length(v_term) < 2 THEN
    RETURN;
  END IF;

  v_limit := greatest(1, least(coalesce(p_limit, 200), 1000));

  -- Escape ILIKE wildcards/escape from user input (defence in depth).
  -- Keep original case so the trigram GIN indexes (ILIKE is case-insensitive) are used.
  v_like := '%' ||
            replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') ||
            '%';

  v_digits := regexp_replace(v_term, '[^0-9]', '', 'g');
  IF length(v_digits) >= 2 THEN
    v_digits_like := '%' || v_digits || '%';
  ELSE
    v_digits_like := NULL;
  END IF;

  -- Computed ONCE per call (the entire point of this function existing) —
  -- not once per candidate row like the RLS path does.
  v_visible := ARRAY(SELECT public.get_user_visible_org_ids(v_auth));

  -- Same v_business_uid resolution chain as can_see_entity, so a creator
  -- with no active membership (e.g. between org transfers) still resolves.
  SELECT COALESCE(
           public.current_business_user_id(),
           (SELECT m.business_user_id FROM public.auth_to_business_user_map m
             WHERE m.auth_user_id = v_auth LIMIT 1),
           (SELECT au.id FROM public.anew_users au
             WHERE au.auth_user_id = v_auth LIMIT 1)
         )
  INTO v_business_uid;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id AS entity_id
      FROM public.anew_entities e
     WHERE e.display_name ILIKE v_like ESCAPE '\'
        OR e.first_name   ILIKE v_like ESCAPE '\'
        OR e.last_name    ILIKE v_like ESCAPE '\'
    UNION
    SELECT em.entity_id
      FROM public.anew_entity_emails em
     WHERE em.email ILIKE v_like ESCAPE '\'
    UNION
    SELECT ph.entity_id
      FROM public.anew_entity_phones ph
     WHERE ph.phone_number ILIKE v_like ESCAPE '\'
    UNION
    SELECT ph.entity_id
      FROM public.anew_entity_phones ph
     WHERE v_digits_like IS NOT NULL
       AND regexp_replace(ph.phone_number, '[^0-9]', '', 'g') ILIKE v_digits_like ESCAPE '\'
    -- Deliberately no NIF branch here: matching fiscal_entities.nif via
    -- ILIKE compared the plaintext column, removed in
    -- 20261111020000_remove_plaintext_nif_ilike_from_search_rpcs.sql.
    -- Callers needing NIF search must use the search-entities Edge Function.
  ),
  visible AS (
    SELECT DISTINCT c.entity_id
      FROM candidates c
     WHERE
        -- Condition A-prime: creator via auth_user_id directly (mirrors can_see_entity).
        EXISTS (SELECT 1 FROM public.anew_entities e
                 JOIN public.anew_users au ON au.id = e.created_by
                WHERE e.id = c.entity_id AND au.auth_user_id = v_auth)
        OR (v_business_uid IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.anew_entities e
                         WHERE e.id = c.entity_id AND e.created_by = v_business_uid))
        OR EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                    WHERE l.entity_id = c.entity_id AND l.organization_id = ANY(v_visible))
        OR EXISTS (SELECT 1 FROM public.anew_leads x
                    WHERE x.entity_id = c.entity_id
                      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible)))
        OR EXISTS (SELECT 1 FROM public.anew_contacts x
                    WHERE x.entity_id = c.entity_id
                      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible)))
        OR EXISTS (SELECT 1 FROM public.anew_clients x
                    WHERE x.entity_id = c.entity_id
                      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible)))
        OR EXISTS (SELECT 1 FROM public.quotes x
                    WHERE x.entity_id = c.entity_id
                      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible)))
        OR EXISTS (SELECT 1 FROM public.deals x
                    WHERE x.entity_id = c.entity_id
                      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible)))
        OR EXISTS (SELECT 1 FROM public.client_contracts x
                    WHERE x.entity_id = c.entity_id
                      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible)))
  )
  SELECT v.entity_id FROM visible v LIMIT v_limit;
END;
$function$;
