-- ============================================================
-- Fix: rpc_update_deal_needs — add the missing p_update_need_columns parameter
-- ============================================================
--
-- Context / bug being corrected
-- -----------------------------
-- Migration 20260730010000_deals_audit_bypass_and_rpcs.sql documented (in the
-- comment block at lines ~133-143 describing fn_apply_deal_need) that
-- rpc_update_deal_needs was supposed to expose a
--   p_update_need_columns boolean DEFAULT true
-- parameter — the mandatory fix from an earlier review that enables the
-- "items-only" mode (rewrite deal_need_items without overwriting the
-- deal_needs row). The comment landed in the file, but the actual
-- CREATE OR REPLACE FUNCTION rpc_update_deal_needs was never updated: the
-- applied function has only 4 parameters
--   (p_deal_id, p_need_id, p_need_data, p_items).
--
-- Confirmed against the live database via a direct query to pg_proc:
--   SELECT pg_get_function_arguments(oid) FROM pg_proc
--   WHERE proname = 'rpc_update_deal_needs';
--   -> "p_deal_id uuid, p_need_id uuid, p_need_data jsonb, p_items jsonb"
-- while the shared helper is already correct:
--   fn_apply_deal_need(... , p_update_need_columns boolean DEFAULT true, ...).
--
-- Migration 20260730010000 is ALREADY APPLIED to the live database and is
-- immutable. This forward-only migration therefore re-creates
-- rpc_update_deal_needs with the COMPLETE signature (adding
-- p_update_need_columns boolean DEFAULT true) and forwards the flag into the
-- helper, implementing the documented "IF p_update_need_columns THEN ... ELSE
-- ..." behaviour (the ELSE branch already lives inside fn_apply_deal_need).
--
-- Nothing else is changed. The body is otherwise identical to the applied
-- version. The Deals frontend does not yet call this RPC, so the blast radius
-- of this correction is minimal. Adding a parameter with a DEFAULT preserves
-- the existing 4-argument call signature, so any current caller keeps working.
--
-- Note on overloads: CREATE OR REPLACE FUNCTION with a new argument list
-- creates a NEW overload rather than replacing the old one, because the added
-- parameter changes the function's identity. To avoid leaving a stale
-- 4-argument overload behind, the old signature is dropped first.

-- Drop the stale 4-argument overload (the one missing p_update_need_columns).
DROP FUNCTION IF EXISTS public.rpc_update_deal_needs(uuid, uuid, jsonb, jsonb);

-- Mirrors handleSubmit in src/components/deals/DealNeedsSection.tsx: a single
-- need (create OR edit) plus its linked items, treated as ONE transaction with
-- ONE audit row. Column-for-column:
--   · editing an existing need   -> UPDATE deal_needs (full editable column set),
--     DELETE its deal_need_items, then reinsert the linked items.
--   · creating a new need         -> INSERT deal_needs with sort_order = p_sort_order
--     (the FE passes needs.length), then insert the linked items.
--
-- p_update_need_columns (DEFAULT true) is forwarded to fn_apply_deal_need:
--   · TRUE  (default) -> the existing-need branch UPDATEs the full deal_needs
--     column set. This is the DealNeedsSection.tsx behaviour, which DOES edit
--     the need.
--   · FALSE           -> items-only mode: leave deal_needs untouched and only
--     delete+reinsert the linked deal_need_items, preserving a need's
--     independently-set title/status verbatim.
-- When p_need_id IS NULL (create) the flag is irrelevant — a new row is always
-- inserted from the payload.
--
-- The FE owns the customFields/measurementValues/checklist array construction
-- and the title-required guard; the resolved need column payload is passed in
-- as p_need_data and the items as p_items. Authorization is checked against the
-- parent deal's organization_id (deal_needs RLS derives from the parent deal).
-- Returns the resulting deal_needs row.

CREATE OR REPLACE FUNCTION public.rpc_update_deal_needs(
  p_deal_id             uuid,
  p_need_id             uuid,     -- existing need id (edit), or NULL (create)
  p_need_data           jsonb,    -- full deal_needs column payload
  p_items               jsonb,    -- array of linked items, or NULL/[]
  p_update_need_columns boolean DEFAULT true  -- FALSE = items-only, leave deal_needs untouched
)
RETURNS public.deal_needs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid;
  v_org_id   uuid;
  v_deal      public.deals;
  v_need      public.deal_needs;
  v_need_id   uuid;
  v_need_frag jsonb;
  v_diff      jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the parent deal for org scope (deal_needs RLS derives from it) ───
  SELECT * INTO v_deal FROM public.deals WHERE id = p_deal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  v_org_id := v_deal.organization_id;

  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Guard: when editing, the need must belong to this deal ────────────────
  IF p_need_id IS NOT NULL THEN
    PERFORM 1 FROM public.deal_needs WHERE id = p_need_id AND deal_id = p_deal_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Necessidade não encontrada para este pedido' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── Apply the need + items via the shared helper (single diff) ────────────
  -- p_update_need_columns is forwarded so the caller can choose the full-need
  -- edit (TRUE, default) or the items-only mode (FALSE).
  SELECT h.o_need_id, h.o_diff INTO v_need_id, v_need_frag
  FROM public.fn_apply_deal_need(
    p_deal_id,
    p_need_id,
    p_need_data,
    p_items,
    v_actor,
    p_update_need_columns
  ) AS h;
  v_diff := v_diff || v_need_frag;

  -- ── Emit ONE audit row keyed on the deal id ───────────────────────────────
  PERFORM public.fn_manual_audit_log(
    'deals',
    p_deal_id,
    v_org_id,
    CASE WHEN p_need_id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_diff,
    'web_app'
  );

  SELECT * INTO v_need FROM public.deal_needs WHERE id = v_need_id;
  RETURN v_need;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_deal_needs(uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_deal_needs(uuid, uuid, jsonb, jsonb, boolean) TO authenticated;

-- ============================================================
-- Verification (run manually after apply, not executed here)
-- ============================================================
-- SELECT pg_get_function_arguments(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'rpc_update_deal_needs';
-- Expected:
--   p_deal_id uuid, p_need_id uuid, p_need_data jsonb, p_items jsonb,
--   p_update_need_columns boolean DEFAULT true
