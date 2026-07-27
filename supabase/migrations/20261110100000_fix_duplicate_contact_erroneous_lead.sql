-- Fix: erroneous 'negotiating' lead created for an entity that is already a client
-- ============================================================
-- Found live while double-checking the contacts-to-leads migration
-- (20261110080000). One entity (b51d07d0-9231-47cc-aaa6-f75123e9bf08, org
-- Mudelar) had TWO separate anew_contacts rows for the same person, created
-- 3 seconds apart: one plain (converted_to_client_id NULL) and one that
-- converted to a real client (anew_clients f8660b8d..., still active
-- today). The migration correctly followed its per-row rule
-- ("converted_to_client_id IS NULL -> migrate") and created a brand-new
-- lead (7f0a81f4-d0b5-4430-8e1c-02e75c8e142a, status='negotiating') from
-- the never-converted duplicate row -- but the entity is a real active
-- client, so it should never have an active lead pursuing it.
--
-- Confirmed isolated: only 1 entity in the whole database has this
-- duplicate-contact-row shape (2 total have duplicates, only this one has
-- a client+non-client split). Confirmed nothing references the erroneous
-- lead (0 deals, 0 portal access) -- safe to remove outright rather than
-- soft-delete.

DO $$
DECLARE
  v_lead_id   constant uuid := '7f0a81f4-d0b5-4430-8e1c-02e75c8e142a';
  v_entity_id constant uuid := 'b51d07d0-9231-47cc-aaa6-f75123e9bf08';
  v_org_id    constant uuid := '3242e925-da26-459a-8258-be04d904e355';
BEGIN
  -- Remove the erroneous lead row itself.
  DELETE FROM public.anew_leads WHERE id = v_lead_id;

  -- Deactivate the 'lead' role the merge migration created for this
  -- entity -- it already has an active 'client' role, which is correct.
  UPDATE public.anew_entity_roles
  SET    status = 'inactive', updated_at = now(), previous_status = status
  WHERE  entity_id = v_entity_id
    AND  organization_id = v_org_id
    AND  role = 'lead'
    AND  status = 'active';

  -- Drop the stale mapping row so the migration audit trail reflects
  -- that this contact ended up NOT becoming a standalone lead.
  DELETE FROM public._migration_contacts_to_leads_map
  WHERE contact_id = '17e33ffc-df8c-4709-99da-cea988273176';

  RAISE NOTICE 'Lead erronea removida, role lead desativada, mapa corrigido para entidade %', v_entity_id;
END $$;
