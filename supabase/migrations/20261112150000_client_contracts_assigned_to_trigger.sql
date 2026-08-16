-- client_contracts.assigned_to (column + RLS clauses) was already applied to
-- production at some point outside version control — the migration that
-- introduced it (20260625120000_client_contracts_assigned_to.sql) exists
-- locally but was never committed, and only ran its one-time backfill, never
-- a durable trigger. Result: every client_contracts row created since that
-- backfill (15 found, e.g. CC-2026-0081) has assigned_to = NULL, even when
-- the source proposal/quote clearly has a commercial assigned — the
-- Contracts list then shows no "Comercial" for them.
--
-- Mirrors the existing set_proposal_assigned_to() trigger so new contracts
-- never drift out of sync again: proposal.assigned_to -> quote.assigned_to
-- -> created_by.

-- One-time catch-up backfill for contracts created since the last manual run.
UPDATE public.client_contracts cc
SET assigned_to = COALESCE(
  (SELECT p.assigned_to FROM public.proposals p WHERE p.id = cc.proposal_id),
  (SELECT q.assigned_to FROM public.quotes q WHERE q.id = cc.quote_id),
  cc.created_by
)
WHERE cc.assigned_to IS NULL;

CREATE OR REPLACE FUNCTION public.set_client_contract_assigned_to()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := COALESCE(
      (SELECT assigned_to FROM public.proposals WHERE id = NEW.proposal_id),
      (SELECT assigned_to FROM public.quotes WHERE id = NEW.quote_id),
      NEW.created_by
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_client_contract_assigned_to ON public.client_contracts;
CREATE TRIGGER trg_set_client_contract_assigned_to
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_client_contract_assigned_to();
