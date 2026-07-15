-- Remove all role='contact' rows from anew_entity_roles
-- ============================================================
-- Unlike 'lead' <-> 'client' transitions, which stay part of live business
-- logic (a client relationship can end and revert to lead pursuit, so an
-- inactive lead role can be reactivated at any time), 'contact' is being
-- retired from the role model entirely as of the contacts-to-leads merge
-- (20261110080000). No future code will ever check or reactivate
-- role='contact' again, so keeping ~1267 permanently-dead rows around
-- (all already status='inactive' after the merge + orphan cleanup) is
-- pure clutter, not a preserved history.
--
-- Safe to hard-delete, not soft-delete: the actual historical record of
-- "this entity was once a contact" lives in anew_contacts itself (not
-- dropped yet -- that only happens in a later phase after the frontend
-- rewrite) plus whatever entity_audit_log/anew_entity_history rows already
-- exist independently of this table. anew_entity_roles is a live-state
-- index, not the primary historical record.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.anew_entity_roles WHERE role = 'contact';
  RAISE NOTICE 'Roles role=contact a remover: %', v_count;

  DELETE FROM public.anew_entity_roles WHERE role = 'contact';

  RAISE NOTICE 'Removidas.';
END $$;
