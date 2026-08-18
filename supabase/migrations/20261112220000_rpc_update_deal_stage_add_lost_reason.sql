-- Deals — adds lost_reason support to rpc_update_deal_stage
-- 2026-11-12 | Module: Deals
--
-- Adds a new p_lost_reason parameter (DEFAULT NULL) to rpc_update_deal_stage, so the
-- Kanban stage-drop path (Deals.tsx handleKanbanStageDrop) can persist a lost reason
-- alongside the stage change when a deal is dropped onto a "lost" stage. The column
-- deals.lost_reason already exists (added previously) — this migration only extends
-- the RPC's write to it.
--
-- Ambiguous-overload precaution
-- ------------------------------
-- The previous signature is (uuid, uuid, uuid). Simply adding CREATE OR REPLACE with a
-- 4th DEFAULT-ed parameter would NOT replace that function in place — Postgres treats a
-- different parameter list as a distinct overload — leaving BOTH the old 3-arg and the
-- new 4-arg function defined side by side. When the frontend calls with exactly 3 named
-- args, PostgREST cannot disambiguate between "the 3-arg function" and "the 4-arg
-- function with its extra param omitted", and every call fails with PGRST203 (300
-- Multiple Choices) — this exact bug already broke rpc_update_lead in production once,
-- fixed by 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql. To avoid repeating
-- it, the old 3-arg overload is explicitly dropped before recreating with 4 args.
--
-- Body otherwise unchanged from 20260824010000_deals_duplicate_and_stage_rpcs.sql — same
-- SECURITY DEFINER, same auth/scope checks, same audit-bypass + fn_manual_audit_log
-- pattern, same GRANT/REVOKE targets (signature updated to match the new parameter list).
--
-- Prerequisites:
--   20260824010000_deals_duplicate_and_stage_rpcs.sql — original rpc_update_deal_stage
--   deals.lost_reason column (already exists)

DROP FUNCTION IF EXISTS public.rpc_update_deal_stage(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_update_deal_stage(
  p_deal_id         uuid,
  p_new_stage_id    uuid,
  p_organization_id uuid,
  p_lost_reason     text DEFAULT NULL
)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_before_deal public.deals;
  v_deal        public.deals;
  v_diff        jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_before_deal
  FROM public.deals
  WHERE id = p_deal_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found or access denied.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.deals
  SET stage_id    = p_new_stage_id,
      updated_at  = now(),
      lost_reason = COALESCE(p_lost_reason, lost_reason)
  WHERE id = p_deal_id AND organization_id = p_organization_id
  RETURNING * INTO v_deal;

  IF v_before_deal.stage_id IS DISTINCT FROM v_deal.stage_id THEN
    v_diff := jsonb_build_object(
      'deals', jsonb_build_object(
        'stage_id', jsonb_build_object(
          'old', to_jsonb(v_before_deal.stage_id),
          'new', to_jsonb(v_deal.stage_id)
        )
      )
    );

    PERFORM public.fn_manual_audit_log(
      'deals',
      p_deal_id,
      p_organization_id,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_deal;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_deal_stage(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_deal_stage(uuid, uuid, uuid, text) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Only one signature of rpc_update_deal_stage exists after this migration:
--   SELECT oid, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'rpc_update_deal_stage';
--   -- Expected: exactly one row, arguments
--   -- "p_deal_id uuid, p_new_stage_id uuid, p_organization_id uuid, p_lost_reason text DEFAULT NULL::text"
--
-- 2. Calling with the original 3 args (no p_lost_reason) behaves exactly as before,
--    leaving deals.lost_reason unchanged (COALESCE keeps the existing value).
--
-- 3. Calling with p_lost_reason set updates deals.lost_reason to that value, in the
--    same UPDATE that changes stage_id, still producing at most one audit row.
