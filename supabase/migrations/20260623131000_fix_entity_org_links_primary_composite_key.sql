-- Fix: use composite PK (entity_id, organization_id) to exclude current row on UPDATE
-- Previous fix incorrectly referenced l.id which does not exist on this table.

CREATE OR REPLACE FUNCTION "public"."anew_entity_org_links_enforce_single_primary"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SET "search_path" TO 'public'
AS $$
begin
  if NEW.is_primary then
    if exists (
      select 1 from public.anew_entity_org_links l
      where l.entity_id = NEW.entity_id
        and l.organization_id = NEW.organization_id
        and l.is_primary = true
        and (TG_OP = 'INSERT'
             or l.entity_id <> OLD.entity_id
             or l.organization_id <> OLD.organization_id)
    ) then
      raise exception 'entity already has a primary org link for this organization';
    end if;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;
