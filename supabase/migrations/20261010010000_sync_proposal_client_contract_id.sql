-- Sync proposals.client_contract_id whenever a client_contracts row is created
-- for a proposal, so the dedicated (indexed, FK'd) column is never left NULL
-- after a proposal is accepted, regardless of which code path created the
-- contract (execute-workflow Edge Function, pipeline-automation actions, or
-- any future caller).

-- ── Backfill existing orphaned proposals ─────────────────────────────────────
UPDATE public.proposals p
SET client_contract_id = cc.id
FROM public.client_contracts cc
WHERE cc.proposal_id = p.id
  AND p.client_contract_id IS NULL;

-- ── Trigger function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_proposal_client_contract_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    UPDATE public.proposals
    SET client_contract_id = NEW.id
    WHERE id = NEW.proposal_id
      AND client_contract_id IS DISTINCT FROM NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_proposal_client_contract_id ON public.client_contracts;

CREATE TRIGGER trg_sync_proposal_client_contract_id
AFTER INSERT ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_proposal_client_contract_id();
