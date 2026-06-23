-- Clean up orphaned anew_entity_org_links rows: records where the entity has
-- an org link (is_primary = true) but no corresponding role in anew_entity_roles.
-- These are left over from incomplete or failed entity creation attempts.

DELETE FROM public.anew_entity_org_links eol
WHERE eol.is_primary = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.anew_entity_roles er
    WHERE er.entity_id = eol.entity_id
      AND er.organization_id = eol.organization_id
  );
