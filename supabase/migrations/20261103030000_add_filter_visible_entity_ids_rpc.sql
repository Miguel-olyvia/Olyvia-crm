-- NIF Encryption E2E fix (Bug 1): nif-reveal Edge Function always failed with
-- 500 "Failed to resolve visibility" because it calls an RPC,
-- filter_visible_entity_ids(p_entity_ids uuid[], p_auth_uid uuid), that was
-- never created by any prior migration. Confirmed live against org "Nike":
-- `select * from pg_proc where proname = 'filter_visible_entity_ids'` returns
-- 0 rows, so no NIF has ever been decryptable through this Edge Function.
--
-- This is the batch counterpart of public.can_see_entity(p_entity_id, p_auth_uid)
-- (hardened in 20260626000000_harden_can_see_entity_creator_check.sql), which is
-- the current source of truth for "can auth user X see anew_entities row Y".
-- Rather than re-deriving the visibility predicate again (as
-- search_visible_entity_ids's own baseline copy already drifted from
-- can_see_entity — e.g. it does not check root_organization_id), this batches
-- can_see_entity() itself over the input array, so both call sites share
-- exactly one visibility implementation going forward.
--
-- nif-reveal always calls this via its service-role Supabase client, so there
-- is no session `auth.uid()` to rely on (it would evaluate to NULL under
-- SECURITY DEFINER here) — the caller's auth uid must be passed explicitly,
-- same as can_see_entity's own signature. Because p_auth_uid is caller-supplied
-- and NOT re-derived from the session, this function must never be reachable by
-- anon/authenticated directly (that would let any authenticated user probe
-- visibility for an arbitrary auth uid) — reachable only via service_role,
-- exactly like resolve_fiscal_entity (20261029010000_fiscal_entities_nif_hash_country_unique.sql).

CREATE OR REPLACE FUNCTION public.filter_visible_entity_ids(
  p_entity_ids uuid[],
  p_auth_uid   uuid
)
RETURNS TABLE(entity_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_auth_uid IS NULL
     OR p_entity_ids IS NULL
     OR array_length(p_entity_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ids.entity_id
  FROM unnest(p_entity_ids) AS ids(entity_id)
  WHERE public.can_see_entity(ids.entity_id, p_auth_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.filter_visible_entity_ids(uuid[], uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.filter_visible_entity_ids(uuid[], uuid)
  TO service_role;

COMMENT ON FUNCTION public.filter_visible_entity_ids(uuid[], uuid) IS
  'Batch visibility check for anew_entities.id, reusing public.can_see_entity per candidate id. p_auth_uid is caller-supplied (not derived from the session) because the only caller, the nif-reveal Edge Function, invokes it via a service-role client with no session auth.uid(). Never grant to authenticated/anon: an authenticated caller could otherwise probe visibility for an arbitrary auth uid. service_role only, same as resolve_fiscal_entity.';
