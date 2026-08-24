-- Deals — adds lost_reason support to bulk_update_deal_stage
-- 2026-11-12 | Module: Deals
--
-- Adds a new p_lost_reason parameter (DEFAULT NULL) to bulk_update_deal_stage, so the
-- bulk "change status" action can also persist a lost reason when a batch of deals is
-- moved to a "lost" stage. The column deals.lost_reason already exists (added
-- previously) — this migration only extends the RPC's write to it.
--
-- Ambiguous-overload precaution
-- ------------------------------
-- The previous signature is (uuid[], uuid). Simply adding CREATE OR REPLACE with a 3rd
-- DEFAULT-ed parameter would NOT replace that function in place — Postgres treats a
-- different parameter list as a distinct overload — leaving BOTH the old 2-arg and the
-- new 3-arg function defined side by side. When the frontend calls with exactly 2 named
-- args, PostgREST cannot disambiguate between "the 2-arg function" and "the 3-arg
-- function with its extra param omitted", and every call fails with PGRST203 (300
-- Multiple Choices) — this exact bug already broke rpc_update_lead in production once,
-- fixed by 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql. To avoid repeating
-- it, the old 2-arg overload is explicitly dropped before recreating with 3 args.
--
-- Body otherwise unchanged from 20260618100000_bulk_update_deal_stage.sql — same
-- SECURITY INVOKER (RLS on deals self-enforces, covering OWNED/TEAM/ORG scopes), no
-- GRANT/REVOKE existed on the original function so none is added here.
--
-- Prerequisites:
--   20260618100000_bulk_update_deal_stage.sql — original bulk_update_deal_stage
--   deals.lost_reason column (already exists)

DROP FUNCTION IF EXISTS public.bulk_update_deal_stage(uuid[], uuid);

CREATE OR REPLACE FUNCTION bulk_update_deal_stage(
  p_deal_ids uuid[],
  p_stage_id uuid,
  p_lost_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE deals
  SET stage_id    = p_stage_id,
      updated_at  = now(),
      lost_reason = COALESCE(p_lost_reason, lost_reason)
  WHERE id = ANY(p_deal_ids)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('updated', updated_count);
END;
$$;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Only one signature of bulk_update_deal_stage exists after this migration:
--   SELECT oid, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'bulk_update_deal_stage';
--   -- Expected: exactly one row, arguments
--   -- "p_deal_ids uuid[], p_stage_id uuid, p_lost_reason text DEFAULT NULL::text"
--
-- 2. Calling with the original 2 args (no p_lost_reason) behaves exactly as before,
--    leaving deals.lost_reason unchanged (COALESCE keeps the existing value) for every
--    row in p_deal_ids.
--
-- 3. Calling with p_lost_reason set updates deals.lost_reason to that value on every
--    matched row, in the same UPDATE that changes stage_id.
