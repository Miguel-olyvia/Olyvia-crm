-- Bug: editing a staff user's contact identity (email/phone) via
-- rpc_update_user -> upsert_entity_identity fails with
-- "permission denied: entity not visible" for anyone other than the
-- literal creator of that user's anew_entities row — even an Org Admin of
-- the exact same organization the target user belongs to, and even a
-- System Admin.
--
-- Root cause: can_see_entity(entity_id, auth_uid) only recognises an entity
-- as visible via: (a) being its creator, (b) anew_entity_org_links, or
-- (c) being referenced by a lead/contact/client/quote/deal/client_contracts
-- row scoped to a visible organization. A staff user's anew_entities row
-- has none of these — anew_users has no organization_id/assigned_to of its
-- own, its only link to an organization is anew_memberships (by user_id,
-- not entity_id) — so it falls through every branch and returns false for
-- everyone except its creator (often NULL, as seen on real data). Leads/
-- contacts/etc. don't have this problem because they carry
-- organization_id/root_organization_id directly.
--
-- Fix (both additive — nothing existing is narrowed or removed):
--   1. New branch: an entity is visible if it belongs to an anew_users row
--      with an active membership in a visible organization — the staff
--      equivalent of the existing lead/contact/client/etc. checks, using
--      anew_memberships as the "assigned to this org" signal users don't
--      otherwise have.
--   2. System Admin bypass at the top: is_system_admin(p_auth_uid) always
--      sees every entity, matching the `ar.code = 'system_admin' OR ...`
--      pattern used elsewhere in the codebase (get_user_visible_org_ids,
--      which this function also calls, still has no such bypass by its own
--      deliberate design — see 20260622150000 — so without this, a System
--      Admin editing a user in an organization they hold no personal
--      membership in would still fail here even after branch 1).
--
-- Everything else below is an EXACT copy of the live function body
-- (confirmed via pg_get_functiondef against the deployed database) — only
-- the two additions noted above are new.

CREATE OR REPLACE FUNCTION public.can_see_entity(p_entity_id uuid, p_auth_uid uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visible uuid[];
  v_business_uid uuid;
BEGIN
  IF p_entity_id IS NULL OR p_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- SECURITY FIX (20261112090000): System Admin always sees every entity,
  -- cross-tenant, matching the full-access role the rest of the app already
  -- grants it (e.g. 20261112060000_grant_all_permissions_system_admin_role).
  IF public.is_system_admin(p_auth_uid) THEN
    RETURN true;
  END IF;

  -- Condition A-prime: creator check via auth_user_id without needing v_business_uid.
  -- Runs before the COALESCE fallback chain so it never depends on
  -- current_business_user_id() or auth_to_business_user_map being populated.
  IF EXISTS (
    SELECT 1
    FROM public.anew_entities e
    JOIN public.anew_users au ON au.id = e.created_by
    WHERE e.id = p_entity_id
      AND au.auth_user_id = p_auth_uid
  ) THEN
    RETURN true;
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

  -- Condition A: original creator check via v_business_uid (kept for completeness).
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

  -- SECURITY FIX (20261112090000): staff users have no organization_id/
  -- assigned_to of their own (unlike leads/contacts/clients/quotes/deals/
  -- client_contracts below) — anew_memberships is their only link to an
  -- organization. Without this, any staff user's entity is invisible to
  -- everyone but its literal creator, blocking edits to teammates an
  -- Org Admin or System Admin plainly has access to in the Users UI.
  IF EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    WHERE au.entity_id = p_entity_id
      AND am.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
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

  IF EXISTS (
    SELECT 1
    FROM public.client_contracts x
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
$function$;

COMMENT ON FUNCTION public.can_see_entity(uuid, uuid) IS
  'Entity visibility check used by upsert_entity_identity and others. Fixed 20261112090000: added a staff-membership branch (anew_users/anew_memberships) since staff entities carry no organization_id/assigned_to of their own, and added an is_system_admin bypass so System Admin sees every entity cross-tenant, matching its full-access role elsewhere in the app.';
