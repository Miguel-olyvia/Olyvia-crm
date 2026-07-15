-- Deactivate orphan 'contact' entity roles (no matching anew_contacts row)
-- ============================================================
-- Found live while verifying the contacts-to-leads migration
-- (20261110080000): 11 anew_entity_roles rows with role='contact',
-- status='active', but NO corresponding anew_contacts row at all. All 11
-- share the exact same created_at (2026-02-27T14:29:36) in org "Grupo
-- BMLar", with entity display_names like "Duplicado Removido" / "Lead -"
-- (blank) — clearly leftovers from an old import/dedup script, months
-- before this session's work, unrelated to the Contacts->Leads merge.
--
-- Every one of these 11 entities already has an active 'lead' role and a
-- real anew_leads row (confirmed live) — nothing needs to be created here,
-- the stray 'contact' role is just switched off, same as any other
-- deactivated role, never deleted (keeps history honest).
--
-- General condition (not a hardcoded ID list) so it also catches any other
-- orphan of the same shape that wasn't part of the 11 found by hand.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.anew_entity_roles r
  WHERE r.role = 'contact'
    AND r.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.anew_contacts c
      WHERE c.entity_id = r.entity_id AND c.organization_id = r.organization_id
    );

  RAISE NOTICE 'Roles contact orfas encontradas (sem anew_contacts correspondente): %', v_count;

  UPDATE public.anew_entity_roles r
  SET    status = 'inactive', updated_at = now(), previous_status = r.status
  WHERE  r.role = 'contact'
    AND  r.status = 'active'
    AND  NOT EXISTS (
      SELECT 1 FROM public.anew_contacts c
      WHERE c.entity_id = r.entity_id AND c.organization_id = r.organization_id
    );

  RAISE NOTICE 'Roles contact orfas desativadas: %', v_count;
END $$;
