-- Fix: search_proposal_entities(text,integer,uuid) and
-- search_visible_entity_ids(text,integer) did fuzzy matching against the
-- plaintext fiscal_entities.nif column (ILIKE)
--
-- Context
-- -------
-- public.search_proposal_entities("text","integer","uuid") (baseline
-- migration, ~line 6021-6041/6069-6089) and
-- public.search_visible_entity_ids("text","integer") (baseline migration,
-- ~line 6172-6176) both did:
--
--   ... ILIKE v_search   -- or  fe.nif ILIKE v_like ESCAPE '\'
--
-- directly against fiscal_entities.nif — a plaintext substring match over
-- the very column the rest of this codebase has been migrated away from
-- (resolve_fiscal_entity, nif-reveal, and the search-entities Edge Function
-- all resolve NIFs exclusively via nif_hash / nif_encrypted / the
-- HMAC-SHA256 trigram token table public.fiscal_entity_nif_tokens, never by
-- comparing cleartext).
--
-- Why this cannot be "rewritten to join fiscal_entity_nif_tokens" in place
-- ------------------------------------------------------------------------
-- The trigram tokens in fiscal_entity_nif_tokens are HMAC-SHA256 digests
-- (see supabase/functions/_shared/nifCrypto.ts: tokenizeNif). Producing the
-- matching tokens for an arbitrary search term requires the NIF_HMAC_KEY,
-- which:
--   - is never available inside Postgres (no pgcrypto hmac()/digest() call
--     exists anywhere in supabase/migrations — confirmed by repo-wide grep),
--   - and must never be handed to these two RPCs' actual callers to
--     tokenize client-side:
--       * search_proposal_entities(text,integer,uuid) is called directly
--         from the browser (src/components/EntitySearchInput.tsx, via
--         `supabase.rpc(...)` with the end user's own JWT, not
--         service_role) — a browser can never safely hold the HMAC key.
--       * search_visible_entity_ids(text,integer) has no live caller left
--         in this codebase at all (grep across src/ and supabase/functions
--         finds none); its baseline visibility CTE itself already drifted
--         from can_see_entity() per 20261103030000's own header comment.
-- A true tokenized-join fix already exists and is in production use: the
-- search-entities Edge Function (service_role only, holds the HMAC key,
-- queries fiscal_entity_nif_tokens, never touches plaintext nif). Per
-- EntitySearchInput.tsx's own comments, the frontend already calls
-- search-entities in parallel with search_proposal_entities specifically
-- to cover NIF matching "without exposing plaintext NIF/hash to the
-- client" and explicitly calls the RPC's own `pf.nif ILIKE` branch
-- "legacy". Recreating that same tokenized flow again inside these two
-- SQL functions is therefore both impossible without a new Postgres-side
-- HMAC primitive (pgcrypto's hmac(), not installed/used anywhere in this
-- project) and redundant, since callers that need fuzzy NIF search already
-- have search-entities available.
--
-- Fix
-- ---
-- Remove the plaintext `... ILIKE ...` NIF-matching branches from both
-- functions entirely (name/email/phone matching is untouched). This is a
-- pure capability removal, not a broken partial fix: after this migration,
-- these two RPCs simply never search by NIF, matching the "missing
-- capability means no match, never compare in the clear" principle used
-- elsewhere in this codebase (see the paired
-- 20261111010000_org_entity_identity_trigger_hash_match.sql migration).
-- Callers that need NIF search continue to use search-entities, exactly as
-- EntitySearchInput.tsx already does today.
--
-- NOT fixed by this migration (reported, not silently worked around):
-- there is currently no Postgres-side HMAC-in-SQL path and no safe way for
-- either RPC's actual callers to supply pre-computed tokens (browser caller
-- for search_proposal_entities; no live caller at all for
-- search_visible_entity_ids), so a real "join to fiscal_entity_nif_tokens"
-- rewrite of these two functions was not attempted — see the header above.

CREATE OR REPLACE FUNCTION "public"."search_proposal_entities"("p_search" "text", "p_limit" integer DEFAULT 50, "p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("type" "text", "id" "uuid", "entity_id" "uuid", "name" "text", "email" "text", "phone" "text", "status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_search text := '%' || trim(coalesce(p_search, '')) || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR length(trim(coalesce(p_search, ''))) < 2 OR p_organization_id IS NULL THEN
    RETURN;
  END IF;

  SELECT vo INTO v_org
  FROM public.get_user_visible_org_ids(auth.uid()) AS vo
  WHERE vo = p_organization_id
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched_contacts AS (
    SELECT
      'contact'::text AS entity_type,
      c.id,
      c.entity_id,
      COALESCE(e.display_name, trim(concat_ws(' ', e.first_name, e.last_name)))::text AS name,
      pe.email::text AS email,
      pp.phone::text AS phone,
      c.status::text AS status,
      c.created_at
    FROM public.anew_contacts c
    JOIN public.anew_entities e ON e.id = c.entity_id
    LEFT JOIN LATERAL (
      SELECT ee.email
      FROM public.anew_entity_emails ee
      WHERE ee.entity_id = c.entity_id AND coalesce(ee.is_primary, true)
      ORDER BY ee.is_primary DESC NULLS LAST, ee.created_at DESC
      LIMIT 1
    ) pe ON true
    LEFT JOIN LATERAL (
      SELECT ep.phone_number AS phone
      FROM public.anew_entity_phones ep
      WHERE ep.entity_id = c.entity_id AND coalesce(ep.is_primary, true)
      ORDER BY ep.is_primary DESC NULLS LAST, ep.created_at DESC
      LIMIT 1
    ) pp ON true
    WHERE c.organization_id = v_org
      AND c.deleted_at IS NULL
      AND c.converted_to_client_id IS NULL
      AND c.status = 'active'
      AND (
        extensions.unaccent(coalesce(e.display_name,'')) ILIKE extensions.unaccent(v_search)
        OR extensions.unaccent(coalesce(e.first_name,'')) ILIKE extensions.unaccent(v_search)
        OR extensions.unaccent(coalesce(e.last_name,'')) ILIKE extensions.unaccent(v_search)
        OR extensions.unaccent(trim(concat_ws(' ', e.first_name, e.last_name))) ILIKE extensions.unaccent(v_search)
        OR pe.email ILIKE v_search
        OR pp.phone ILIKE v_search
      )
  ), matched_clients AS (
    SELECT
      'client'::text AS entity_type,
      cl.id,
      cl.entity_id,
      COALESCE(e.display_name, trim(concat_ws(' ', e.first_name, e.last_name)))::text AS name,
      pe.email::text AS email,
      pp.phone::text AS phone,
      cl.status::text AS status,
      cl.created_at
    FROM public.anew_clients cl
    JOIN public.anew_entities e ON e.id = cl.entity_id
    LEFT JOIN LATERAL (
      SELECT ee.email
      FROM public.anew_entity_emails ee
      WHERE ee.entity_id = cl.entity_id AND coalesce(ee.is_primary, true)
      ORDER BY ee.is_primary DESC NULLS LAST, ee.created_at DESC
      LIMIT 1
    ) pe ON true
    LEFT JOIN LATERAL (
      SELECT ep.phone_number AS phone
      FROM public.anew_entity_phones ep
      WHERE ep.entity_id = cl.entity_id AND coalesce(ep.is_primary, true)
      ORDER BY ep.is_primary DESC NULLS LAST, ep.created_at DESC
      LIMIT 1
    ) pp ON true
    WHERE cl.organization_id = v_org
      AND cl.deleted_at IS NULL
      AND cl.status = 'active'
      AND (
        extensions.unaccent(coalesce(e.display_name,'')) ILIKE extensions.unaccent(v_search)
        OR extensions.unaccent(coalesce(e.first_name,'')) ILIKE extensions.unaccent(v_search)
        OR extensions.unaccent(coalesce(e.last_name,'')) ILIKE extensions.unaccent(v_search)
        OR extensions.unaccent(trim(concat_ws(' ', e.first_name, e.last_name))) ILIKE extensions.unaccent(v_search)
        OR pe.email ILIKE v_search
        OR pp.phone ILIKE v_search
      )
  )
  SELECT r.entity_type, r.id, r.entity_id, r.name, r.email, r.phone, r.status
  FROM (
    SELECT mc.entity_type, mc.id, mc.entity_id, mc.name, mc.email, mc.phone, mc.status, mc.created_at
    FROM matched_contacts mc
    UNION ALL
    SELECT mcl.entity_type, mcl.id, mcl.entity_id, mcl.name, mcl.email, mcl.phone, mcl.status, mcl.created_at
    FROM matched_clients mcl
  ) r
  ORDER BY r.created_at DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION "public"."search_proposal_entities"("p_search" "text", "p_limit" integer, "p_organization_id" "uuid") IS
  'Org-scoped proposal entity search by name/email/phone. Deliberately does NOT match against fiscal_entities.nif (plaintext or otherwise) — callers needing NIF search must use the search-entities Edge Function, which resolves via the HMAC-hashed fiscal_entity_nif_tokens table server-side.';

CREATE OR REPLACE FUNCTION "public"."search_visible_entity_ids"("p_search" "text", "p_limit" integer DEFAULT 200) RETURNS TABLE("entity_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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

  v_business_uid := public.current_business_user_id();
  v_visible      := ARRAY(SELECT public.get_user_visible_org_ids(v_auth));

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
    -- Deliberately no NIF branch here anymore: matching fiscal_entities.nif
    -- via ILIKE compared the plaintext column. There is no Postgres-side
    -- HMAC primitive available to tokenize v_term against
    -- fiscal_entity_nif_tokens (see this migration's header), and this
    -- function has no live caller left in this codebase to adapt for a
    -- pre-tokenized parameter. Callers needing NIF search must use the
    -- search-entities Edge Function instead.
  ),
  visible AS (
    SELECT DISTINCT c.entity_id
      FROM candidates c
     WHERE
        (v_business_uid IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.anew_entities e
                      WHERE e.id = c.entity_id AND e.created_by = v_business_uid))
        OR EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                    WHERE l.entity_id = c.entity_id AND l.organization_id = ANY(v_visible))
        OR EXISTS (SELECT 1 FROM public.anew_leads x
                    WHERE x.entity_id = c.entity_id AND x.organization_id = ANY(v_visible))
        OR EXISTS (SELECT 1 FROM public.anew_contacts x
                    WHERE x.entity_id = c.entity_id AND x.organization_id = ANY(v_visible))
        OR EXISTS (SELECT 1 FROM public.anew_clients x
                    WHERE x.entity_id = c.entity_id AND x.organization_id = ANY(v_visible))
        OR EXISTS (SELECT 1 FROM public.quotes x
                    WHERE x.entity_id = c.entity_id AND x.organization_id = ANY(v_visible))
        OR EXISTS (SELECT 1 FROM public.deals x
                    WHERE x.entity_id = c.entity_id AND x.organization_id = ANY(v_visible))
  )
  SELECT v.entity_id FROM visible v LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION "public"."search_visible_entity_ids"("p_search" "text", "p_limit" integer) IS
  'Visible-entity search by name/email/phone. Deliberately does NOT match against fiscal_entities.nif (plaintext or otherwise) — callers needing NIF search must use the search-entities Edge Function, which resolves via the HMAC-hashed fiscal_entity_nif_tokens table server-side.';
