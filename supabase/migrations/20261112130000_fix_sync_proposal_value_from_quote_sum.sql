-- Fix: sync_proposal_value_from_quote() was setting proposals.value to a
-- SINGLE quote's total (NEW.total) instead of aggregating all quotes linked
-- to the proposal. Because the trigger fires once per affected row, linking
-- 2+ quotes to the same proposal in one UPDATE (fn_proposals_persist_relations)
-- left proposals.value equal to whichever quote's row the trigger processed
-- last — silently overwriting the correct total that rpc_update_proposal had
-- just computed and saved in the same transaction. Already documented as a
-- known-but-unfixed bug in 20261020020000_fix_sync_quote_proposal_id_backfill_corruption.sql.
--
-- New value rule (business decision, 2026-08-14):
--   - If the proposal has at least one quote with estado = 'aceite', value is
--     the sum of only the accepted quotes (rejected/other alternatives are
--     excluded once a decision has been made).
--   - Otherwise (nothing accepted yet), value is the sum of all quotes that
--     are not rejected (rascunho/enviado/perdido) — an estimate for the
--     pipeline while the proposal is undecided.

CREATE OR REPLACE FUNCTION public.calculate_proposal_value_from_quotes(p_proposal_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_accepted boolean;
  v_value numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL AND estado = 'aceite'
  ) INTO v_has_accepted;

  IF v_has_accepted THEN
    SELECT COALESCE(SUM(total), 0) INTO v_value
    FROM public.quotes
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL AND estado = 'aceite';
  ELSE
    SELECT COALESCE(SUM(total), 0) INTO v_value
    FROM public.quotes
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL AND estado IS DISTINCT FROM 'rejeitado';
  END IF;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_proposal_value_from_quote() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    UPDATE public.proposals
       SET value = public.calculate_proposal_value_from_quotes(NEW.proposal_id),
           updated_at = now()
     WHERE id = NEW.proposal_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.proposal_id IS NOT NULL AND OLD.proposal_id IS DISTINCT FROM NEW.proposal_id THEN
    UPDATE public.proposals p
       SET value = public.calculate_proposal_value_from_quotes(OLD.proposal_id),
           updated_at = now()
     WHERE p.id = OLD.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

-- One-time repair: recompute value for every proposal with at least one
-- non-deleted linked quote whose stored value no longer matches the correct
-- aggregate (covers the 57 proposals found corrupted by the old trigger).
UPDATE public.proposals p
   SET value = public.calculate_proposal_value_from_quotes(p.id),
       updated_at = now()
 WHERE EXISTS (
         SELECT 1 FROM public.quotes q
         WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
       )
   AND p.value IS DISTINCT FROM public.calculate_proposal_value_from_quotes(p.id);
