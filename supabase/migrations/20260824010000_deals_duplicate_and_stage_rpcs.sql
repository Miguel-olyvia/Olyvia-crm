-- Deals — single-log RPCs for "Duplicate deal" and Kanban stage-drop
-- 2026-08-24 | Module: Deals
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Two Deals.tsx actions bypass the audit_bypass/RPC pattern established in
-- 20260730010000_deals_audit_bypass_and_rpcs.sql (rpc_create_deal / rpc_update_deal):
--
--   · handleDuplicate (~line 1354): a raw `.from("deals").insert(...)` wrapped only in
--     withAuditContext (which sets app.audit_user_id/app.audit_source for
--     fn_generic_entity_audit() attribution — it does NOT set app.audit_bypass).
--     The normal AFTER INSERT trigger fires and writes its own audit_log row.
--     Investigated: handleDuplicate duplicates ONLY the `deals` row itself — no
--     deal_needs / deal_need_items / pipeline_links are copied by the current
--     frontend code — so this is a single extra trigger-sourced row, not several,
--     but it is still the wrong path (bypasses fn_manual_audit_log, inconsistent
--     with every other create path in this module).
--
--   · handleKanbanStageDrop (~line 1157): a raw `.from("deals").update({stage_id})`
--     also wrapped only in withAuditContext, same trigger-fires-normally situation,
--     followed by a SEPARATE `execute-workflow` Edge Function invocation. The
--     deals.stage_id UPDATE itself produces its own ordinary audit_log row via
--     fn_generic_entity_audit(); execute-workflow's own side effects (tasks,
--     notifications, etc.) are a legitimately distinct, separately-actored
--     automation event and are correctly OUT OF SCOPE here — this migration only
--     makes the drag's OWN deals-table write atomic and singly-logged.
--
-- Solution
-- --------
-- Two new RPCs, following the exact pattern already used by rpc_create_deal /
-- rpc_update_deal: PERFORM set_config('app.audit_bypass','on',true) to suppress
-- fn_generic_entity_audit(), do the DML, call fn_manual_audit_log() exactly once.
--
--   · rpc_duplicate_deal   — Deals.tsx handleDuplicate. Single deals INSERT copying
--     the same columns the frontend copies today (title suffixed "(cópia)", value,
--     probability, description, stage_id, lead_id, client_id, entity_id,
--     organization_id, expected_close_date, created_by, assigned_to). Returns the
--     new deals row. If a future change to handleDuplicate starts also copying
--     deal_needs/deal_need_items, this RPC is the correct place to extend (reusing
--     fn_apply_deal_need from the prior migration) — not present today because the
--     current frontend does not do it.
--
--   · rpc_update_deal_stage — Deals.tsx handleKanbanStageDrop. Single deals.stage_id
--     UPDATE scoped to id + organization_id (same RLS-parity guard as rpc_update_deal).
--     Returns the updated deals row. The frontend still calls execute-workflow
--     afterward, unchanged and independent.
--
-- Authorization / RLS parity
-- ---------------------------
-- Both RPCs are SECURITY DEFINER and reuse fn_deal_org_in_scope(uuid) from
-- 20260730010000_deals_audit_bypass_and_rpcs.sql — identical boundary to the deals
-- RLS policy (organization_id IN get_user_visible_org_ids(auth.uid())).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass guard + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql  — fn_deal_org_in_scope(), deals RPC pattern
--   20260615130000_baseline_new_database.sql        — current_business_user_id(), deals table + RLS


-- ============================================================
-- 1. rpc_duplicate_deal(...)
-- ============================================================
-- Mirrors handleDuplicate in src/pages/Deals.tsx: a single deals INSERT copying the
-- source deal's fields, with a new id, "(cópia)" title suffix, created_by/assigned_to
-- set to the acting business user, and stage reset to the pipeline's first stage
-- (falling back to the source deal's own stage) — identical to the FE's
-- `stages[0]?.id || deal.deal_stages?.id` fallback. No child rows (deal_needs,
-- deal_need_items, pipeline_links) are duplicated, matching current FE behavior.

CREATE OR REPLACE FUNCTION public.rpc_duplicate_deal(
  p_source_deal_id  uuid,
  p_organization_id uuid,
  p_target_stage_id uuid    -- resolved stages[0]?.id ?? source deal's stage_id (FE-resolved fallback)
)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_source public.deals;
  v_new    public.deals;
  v_diff   jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load source deal, scoped to org (mirrors the FE reading `deal` from the
  --    already-loaded, org-scoped list) ──────────────────────────────────────
  SELECT * INTO v_source
  FROM public.deals
  WHERE id = p_source_deal_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found or access denied.' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── INSERT the copy (columns identical to handleDuplicate's insert payload) ──
  INSERT INTO public.deals (
    title, value, probability, description, stage_id,
    lead_id, client_id, entity_id, organization_id,
    expected_close_date, created_by, assigned_to
  )
  VALUES (
    v_source.title || ' (cópia)',
    v_source.value,
    v_source.probability,
    v_source.description,
    COALESCE(p_target_stage_id, v_source.stage_id),
    v_source.lead_id,
    v_source.client_id,
    v_source.entity_id,
    p_organization_id,
    v_source.expected_close_date,
    v_actor,
    v_source.assigned_to
  )
  RETURNING * INTO v_new;

  v_diff := jsonb_build_object(
    'deals', jsonb_build_object(
      'id',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.id)),
      'title',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.title)),
      'stage_id',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.stage_id)),
      'duplicated_from', jsonb_build_object('old', NULL, 'new', to_jsonb(v_source.id))
    )
  );

  -- ── Emit ONE audit row keyed on the NEW deal id ───────────────────────────
  PERFORM public.fn_manual_audit_log(
    'deals',
    v_new.id,
    p_organization_id,
    'INSERT',
    v_diff,
    'web_app'
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_duplicate_deal(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_deal(uuid, uuid, uuid) TO authenticated;


-- ============================================================
-- 2. rpc_update_deal_stage(...)
-- ============================================================
-- Mirrors handleKanbanStageDrop in src/pages/Deals.tsx: a single, atomic
-- deals.stage_id UPDATE scoped to id + organization_id, singly-logged via
-- fn_manual_audit_log. The FE still calls execute-workflow immediately afterward
-- as a SEPARATE, independent call — that automation side-effect (task creation,
-- notifications, etc.) is intentionally out of scope for this RPC and keeps its
-- own actor/timing. This RPC only guarantees the drag's OWN write is atomic and
-- produces exactly one audit row (or zero, if the stage did not actually change).

CREATE OR REPLACE FUNCTION public.rpc_update_deal_stage(
  p_deal_id         uuid,
  p_new_stage_id    uuid,
  p_organization_id uuid
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
  SET stage_id   = p_new_stage_id,
      updated_at = now()
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

REVOKE ALL ON FUNCTION public.rpc_update_deal_stage(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_deal_stage(uuid, uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. rpc_duplicate_deal produces exactly ONE audit row (operation INSERT) keyed on
--    the NEW deal id:
--      SELECT rpc_duplicate_deal('<source-id>', '<org>', '<stage>');
--      SELECT count(*) FROM entity_audit_log
--      WHERE entity_id = '<new deal id>' AND created_at > now() - interval '1 minute';  -- 1
--
-- 2. rpc_update_deal_stage produces exactly ONE audit row (operation UPDATE) when the
--    stage actually changes, ZERO when p_new_stage_id equals the current stage_id
--    (no-op drop). execute-workflow's own DB writes (if any) remain a separate,
--    independently-actored event outside this RPC's transaction, by design.
--
-- 3. Authorization: both RPCs RAISE insufficient_privilege for an organization_id
--    outside get_user_visible_org_ids(auth.uid()), and 'Deal not found or access
--    denied.' when the id+org row is absent — identical boundary to rpc_update_deal.
--
-- 4. Frontend follow-up (not part of this migration): switch handleDuplicate's raw
--    `.from("deals").insert(...)` to call rpc_duplicate_deal, and
--    handleKanbanStageDrop's raw `.from("deals").update(...)` to call
--    rpc_update_deal_stage, keeping the execute-workflow invocation unchanged.
