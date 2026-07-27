-- Migration: harden can_see_entity creator check
-- Adds Condition A-prime: a direct auth_user_id → anew_entities.created_by join
-- that resolves the creator without depending on v_business_uid / current_business_user_id().
-- This makes the creator short-circuit reliable even when auth_to_business_user_map is empty
-- and the anew_users fallback is slow or not yet populated.

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

  RETURN false;
END;
$$;
