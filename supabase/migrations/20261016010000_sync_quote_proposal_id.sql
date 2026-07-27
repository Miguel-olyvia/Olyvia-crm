-- Sync quotes.proposal_id whenever a pipeline_links row links a quote to a
-- proposal, so the dedicated (indexed, FK'd) column is never left NULL after
-- a proposal is created/reused from an accepted quote, regardless of which
-- code path wrote the link (pipeline-automation Edge Function's
-- create_proposal_from_quote action, or any future caller).

-- ── Backfill existing orphaned quotes ────────────────────────────────────────
UPDATE public.quotes q
SET proposal_id = pl.proposal_id
FROM public.pipeline_links pl
WHERE pl.quote_id = q.id
  AND pl.proposal_id IS NOT NULL
  AND pl.status = 'active'
  AND q.proposal_id IS NULL;

-- ── Trigger function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_quote_proposal_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL AND NEW.proposal_id IS NOT NULL THEN
    UPDATE public.quotes
    SET proposal_id = NEW.proposal_id
    WHERE id = NEW.quote_id
      AND proposal_id IS DISTINCT FROM NEW.proposal_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_quote_proposal_id ON public.pipeline_links;

CREATE TRIGGER trg_sync_quote_proposal_id
AFTER INSERT OR UPDATE OF proposal_id, quote_id ON public.pipeline_links
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_quote_proposal_id();
