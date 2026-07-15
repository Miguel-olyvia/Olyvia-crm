-- Backfill deals.client_id for deals whose contact was already a client
-- ============================================================
-- Found live while double-checking the contacts-to-leads merge: 51 deals
-- had contact_id set but no lead_id (the merge migration 20261110080000
-- only repoints deals whose contact was migrated to a lead -- contacts
-- already converted to a client are deliberately excluded, per explicit
-- product decision earlier in this work). 1 of those 51 was already
-- soft-deleted (irrelevant). The other 50 are real, active deals whose
-- underlying contact had converted_to_client_id set BEFORE this session's
-- work even started -- a pre-existing gap, not introduced by the merge:
-- deals.client_id was simply never backfilled at the time of that
-- client conversion.
--
-- Left as-is, Deals.tsx's legacy "contact_id present, lead_id/client_id
-- both null" branch (already updated this session to resolve as 'lead')
-- would incorrectly show these as leads instead of clients. Confirmed all
-- 50 have entity_id populated (nothing fully orphaned) and their
-- anew_contacts.converted_to_client_id points to a real anew_clients row.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.deals d
  JOIN public.anew_contacts c ON c.id = d.contact_id
  WHERE d.contact_id IS NOT NULL
    AND d.lead_id IS NULL
    AND d.client_id IS NULL
    AND d.deleted_at IS NULL
    AND c.converted_to_client_id IS NOT NULL;

  RAISE NOTICE 'Deals a corrigir (contact_id -> client_id via conversao ja existente): %', v_count;

  UPDATE public.deals d
  SET    client_id = c.converted_to_client_id
  FROM   public.anew_contacts c
  WHERE  c.id = d.contact_id
    AND  d.contact_id IS NOT NULL
    AND  d.lead_id IS NULL
    AND  d.client_id IS NULL
    AND  d.deleted_at IS NULL
    AND  c.converted_to_client_id IS NOT NULL;

  RAISE NOTICE 'Corrigidos.';
END $$;
