-- Clear stale converted_to_contact_id on leads revived by the contacts merge
-- ============================================================
-- Found live via "os cards não estão bem": get_lead_status_counts()
-- (20260618030000) deliberately excludes any lead where
-- converted_to_contact_id IS NOT NULL -- correct under the OLD lead
-- lifecycle, where a lead converted to a contact got status='converted'
-- AND converted_to_contact_id set together, so excluding on either
-- condition was redundant.
--
-- The contacts-to-leads merge (20261110080000) reactivated these same
-- leads back to status='qualified'/'negotiation' (Case A: leads that had
-- an existing anew_contacts row pointing back via source_lead_id), but
-- never cleared converted_to_contact_id -- it wasn't in that migration's
-- UPDATE's SET list at all. Result: 952 real, correctly-classified leads
-- (544 qualified + 408 negotiation) are invisible on every "Quick Status
-- Card" / Kanban count on the Leads page, because the RPC still treats
-- them as "already graduated to a contact", a state that no longer
-- exists in this app.
--
-- converted_at was already confirmed NULL on all of these (the merge
-- migration did set that column, from the contact's own converted_at,
-- which is only non-null for client conversions -- correctly excluded
-- from this migration's scope). Only converted_to_contact_id needs
-- clearing.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.anew_leads
  WHERE status IN ('qualified', 'negotiation')
    AND converted_to_contact_id IS NOT NULL;

  RAISE NOTICE 'Leads com converted_to_contact_id residual a limpar: %', v_count;

  UPDATE public.anew_leads
  SET    converted_to_contact_id = NULL,
         updated_at = now()
  WHERE  status IN ('qualified', 'negotiation')
    AND  converted_to_contact_id IS NOT NULL;

  RAISE NOTICE 'Corrigidos.';
END $$;
