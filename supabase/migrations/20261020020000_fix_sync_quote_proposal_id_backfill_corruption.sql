-- Fix for 20261016010000_sync_quote_proposal_id.sql:
--
-- That migration's backfill UPDATE writes quotes.proposal_id, which is a
-- column watched by the pre-existing (dormant, since quotes.proposal_id was
-- always NULL in production until now) baseline trigger
-- trg_sync_proposal_value_from_quote / sync_proposal_value_from_quote()
-- (see 20260615130000_baseline_new_database.sql). That trigger runs:
--
--   UPDATE public.proposals SET value = COALESCE(NEW.total, 0) ...
--
-- i.e. it sets proposals.value to a SINGLE quote's total, not SUM(). The
-- schema allows a non-unique proposal_id on quotes (idx_quotes_proposal_id
-- has no uniqueness/partial constraint), so any proposal linked to more
-- than one *active* quote (via pipeline_links) would have its
-- backfill-triggered UPDATE OF proposal_id fire that trigger once per
-- matching quote row, in unspecified order, leaving proposals.value equal
-- to an arbitrary single quote's total instead of the correct aggregate.
--
-- This migration does NOT touch sync_proposal_value_from_quote() itself
-- (fixing its SUM() logic is a separate, larger concern, out of scope
-- here). It only makes sure this migration's own backfill can never feed
-- more than one active quote into a given proposal_id, and hardens the
-- trigger function added in 20261016010000 to only ever propagate active
-- links, matching the status='active' guard used by sibling helpers
-- (e.g. auto_create_proposal_from_quote()'s
-- "UPDATE pipeline_links ... WHERE quote_id=NEW.id AND status='active'").

-- ── 1. Undo any corruption already introduced by the original backfill ──────
-- If 20261016010000's backfill has already run on this database and wrote
-- proposal_id onto more than one active quote for the same proposal, clear
-- those specific quote rows back to NULL so we don't leave corrupted state
-- in place while we re-run a safe backfill below. This is a no-op if the
-- unsafe backfill never affected a multi-quote proposal.
DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT pl.proposal_id, array_agg(DISTINCT pl.quote_id) AS quote_ids, count(*) AS active_quote_count
    FROM public.pipeline_links pl
    WHERE pl.proposal_id IS NOT NULL
      AND pl.quote_id IS NOT NULL
      AND pl.status = 'active'
    GROUP BY pl.proposal_id
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'fix_sync_quote_proposal_id_backfill_corruption: proposal % has % active linked quotes (%); clearing quotes.proposal_id for these quotes to avoid single-quote-total corruption via trg_sync_proposal_value_from_quote',
      v_rec.proposal_id, v_rec.active_quote_count, v_rec.quote_ids;

    UPDATE public.quotes
    SET proposal_id = NULL
    WHERE id = ANY (v_rec.quote_ids)
      AND proposal_id = v_rec.proposal_id;
  END LOOP;
END;
$$;

-- ── 2. Safe backfill: only proposals with exactly one active linked quote ───
-- Re-run the original backfill intent, but skip (and log) any proposal_id
-- that has more than one active linked quote, so we never trigger the
-- dormant sync_proposal_value_from_quote() single-quote-total assumption
-- with more than one quote in play. Skipped quote rows are left with
-- proposal_id = NULL, same as before this migration.
DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT pl.proposal_id, array_agg(DISTINCT pl.quote_id) AS quote_ids, count(*) AS active_quote_count
    FROM public.pipeline_links pl
    WHERE pl.proposal_id IS NOT NULL
      AND pl.quote_id IS NOT NULL
      AND pl.status = 'active'
    GROUP BY pl.proposal_id
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'fix_sync_quote_proposal_id_backfill_corruption: skipping backfill of quotes.proposal_id for proposal % — % active linked quotes found (%); leaving proposal_id NULL for these quotes',
      v_rec.proposal_id, v_rec.active_quote_count, v_rec.quote_ids;
  END LOOP;
END;
$$;

UPDATE public.quotes q
SET proposal_id = pl.proposal_id
FROM public.pipeline_links pl
WHERE pl.quote_id = q.id
  AND pl.proposal_id IS NOT NULL
  AND pl.status = 'active'
  AND q.proposal_id IS NULL
  AND pl.proposal_id NOT IN (
    -- Exclude any proposal_id that has more than one active linked quote.
    SELECT pl2.proposal_id
    FROM public.pipeline_links pl2
    WHERE pl2.proposal_id IS NOT NULL
      AND pl2.quote_id IS NOT NULL
      AND pl2.status = 'active'
    GROUP BY pl2.proposal_id
    HAVING count(*) > 1
  );

-- ── 3. Harden fn_sync_quote_proposal_id() with a status='active' guard ─────
-- The version created in 20261016010000 only checked
-- NEW.quote_id IS NOT NULL AND NEW.proposal_id IS NOT NULL, without
-- checking NEW.status = 'active', unlike sibling helpers that treat
-- status='active' as the only authoritative pipeline_links link state
-- (see auto_create_proposal_from_quote() and the backfill above). Without
-- this guard, an UPDATE that sets proposal_id/quote_id on a pipeline_links
-- row whose status is not 'active' (e.g. superseded/inactive) would still
-- propagate onto quotes.proposal_id.
CREATE OR REPLACE FUNCTION public.fn_sync_quote_proposal_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL
     AND NEW.proposal_id IS NOT NULL
     AND NEW.status = 'active' THEN
    UPDATE public.quotes
    SET proposal_id = NEW.proposal_id
    WHERE id = NEW.quote_id
      AND proposal_id IS DISTINCT FROM NEW.proposal_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition itself (event/columns/timing) is unchanged; only the
-- function body above changed. Re-create defensively for idempotency.
DROP TRIGGER IF EXISTS trg_sync_quote_proposal_id ON public.pipeline_links;

CREATE TRIGGER trg_sync_quote_proposal_id
AFTER INSERT OR UPDATE OF proposal_id, quote_id ON public.pipeline_links
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_quote_proposal_id();
