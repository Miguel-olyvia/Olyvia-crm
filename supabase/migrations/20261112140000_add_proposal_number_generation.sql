-- proposals.proposal_number has no generator anywhere: no column DEFAULT, no
-- trigger, and rpc_create_proposal's INSERT never lists the column (confirmed
-- both in the migration history and live via pg_get_functiondef). 501 older
-- proposals do have a number, but every proposal created since 2026-08-07 has
-- proposal_number = NULL — whatever assigned it before is gone. Mirrors the
-- existing quotes pattern (generate_quote_number() / set_quote_number()) so
-- proposals get the same 'P-YYYY-NNNN' per-year sequential format.

CREATE OR REPLACE FUNCTION public.generate_proposal_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  new_proposal_number TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;

  SELECT COALESCE(MAX(
    CASE
      WHEN proposal_number ~ '^P-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(proposal_number, '^P-[0-9]{4}-([0-9]+)$'))[1]::INTEGER
      ELSE 0
    END
  ), 0) + 1
  INTO sequence_num
  FROM proposals
  WHERE proposal_number LIKE 'P-' || year_part || '-%';

  new_proposal_number := 'P-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN new_proposal_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_proposal_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.proposal_number IS NULL THEN
    NEW.proposal_number := public.generate_proposal_number();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_set_proposal_number ON public.proposals;
CREATE TRIGGER trigger_set_proposal_number
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_proposal_number();

-- One-time backfill: assign numbers, in creation order, to every existing
-- proposal that never got one (continues the same per-year sequence used by
-- the generator above, so no collisions with already-numbered proposals).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.proposals
    WHERE proposal_number IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.proposals
       SET proposal_number = public.generate_proposal_number()
     WHERE id = r.id;
  END LOOP;
END;
$$;
