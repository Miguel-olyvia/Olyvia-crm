-- Fix: same PostgreSQL BEFORE-trigger-before-ON-CONFLICT race already fixed
-- once for create_contact_with_role (see 20260623140000_fix_create_contact_org_link_trigger_race.sql)
-- was still present in ensure_entity_org_link. Its INSERT ... ON CONFLICT DO
-- NOTHING let anew_entity_org_links_enforce_single_primary fire and raise
-- "entity already has a primary org link for this organization" on every
-- call for an entity/org pair that already has a link, even though the
-- function is documented and relied upon as idempotent (src/utils/orgEntity.ts).
-- This broke lead/contact creation end-to-end.
-- Solution: use INSERT ... WHERE NOT EXISTS so no INSERT is attempted at all
-- when the link already exists, preventing the trigger from firing.

CREATE OR REPLACE FUNCTION public.ensure_entity_org_link(p_entity_id uuid, p_organization_id uuid, p_is_primary boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_entity_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'entity_id and organization_id are required';
  END IF;

  -- Caller must have the target org within their visible scope.
  -- get_user_visible_org_ids already covers:
  --   * system_admin (returns all orgs)
  --   * direct memberships
  --   * hierarchy (ancestors + descendants)
  --   * cross-org associations
  IF NOT EXISTS (
    SELECT 1 FROM public.get_user_visible_org_ids(auth.uid()) v
    WHERE v = p_organization_id
  ) THEN
    RAISE EXCEPTION 'organization not in user scope';
  END IF;

  INSERT INTO anew_entity_org_links (entity_id, organization_id, is_primary)
  SELECT p_entity_id, p_organization_id, COALESCE(p_is_primary, false)
  WHERE NOT EXISTS (
    SELECT 1 FROM anew_entity_org_links
    WHERE entity_id = p_entity_id AND organization_id = p_organization_id
  );
END;
$function$;
