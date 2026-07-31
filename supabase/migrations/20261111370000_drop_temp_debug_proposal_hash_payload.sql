-- Drop the temporary diagnostic function added in 20261111350000, no longer
-- needed now that the compute_proposal_business_hash "stale hash" report was
-- root-caused (a soft-deleted test quote, not a real bug) and the real
-- ambiguous-column bug in republish_proposal_snapshot was found and fixed
-- (20261111360000).

DROP FUNCTION IF EXISTS public._debug_proposal_hash_payload(uuid);
