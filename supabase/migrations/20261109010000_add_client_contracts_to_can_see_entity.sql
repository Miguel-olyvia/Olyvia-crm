-- Migration: add client_contracts as a valid visibility path in can_see_entity()
--
-- Why: generate-contract-pdf (and any future scoped-auth caller) resolves a
-- contract's counterparty via anew_entities.id = client_contracts.entity_id.
-- can_see_entity() — used by the authenticated RLS policy on anew_entities —
-- already checks anew_entity_org_links/anew_leads/anew_contacts/anew_clients/
-- quotes/deals, but never client_contracts itself. An entity that is only
-- ever referenced by a contract (no lead/contact/client/quote/deal row) would
-- be invisible to an authenticated (RLS-scoped) caller even though the
-- caller can see the contract itself via client_contracts' own org-scoped
-- RLS policy. This adds the same organization_id/root_organization_id check
-- already used for the other entity-linking tables, restoring the identical
-- structure and semantics (CREATE OR REPLACE on top of the version from
-- 20260626000000_harden_can_see_entity_creator_check.sql).
--
-- This function is SECURITY DEFINER and used by: the authenticated RLS
-- policy on anew_entities, is_entity_in_user_scope-adjacent write guards
-- (20260618030000_leads_security_scope_integrity.sql), the batch RPC
-- filter_visible_entity_ids (20261103030000), and a data-erasure visibility
-- check (20261105010000). Adding client_contracts only ever ADDS visibility
-- for entities already reachable via an org the caller can see — it cannot
-- remove or narrow any existing path, so all of the above call sites keep
-- their current behavior and just gain the one additional legitimate case.

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
$$;
