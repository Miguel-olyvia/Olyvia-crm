-- Deals / Pedidos Proposta — single-log RPCs (create + update + needs sync)
-- 2026-07-30 | Module: Deals
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today a single user action in the Deals module (create a deal, edit a deal, or
-- add/edit a deal "need" from DealNeedsSection) is issued from the frontend as
-- SEVERAL independent Supabase calls, each its own Postgres transaction:
--   · src/pages/Deals.tsx handleSubmit (create path): INSERT deals, UPDATE
--     anew_leads (status -> qualified + workflow_stage_id), INSERT/UPDATE
--     pipeline_links, INSERT deal_needs, INSERT deal_need_items  — the survey
--     counted 7 separate calls for one create.
--   · handleSubmit (edit path): UPDATE deals, then delete+insert deal_need_items
--     (+ maybe insert/delete deal_needs).
--   · src/components/deals/DealNeedsSection.tsx handleSubmit: insert/update
--     deal_needs, delete + insert deal_need_items.
-- Every touched table (deals, deal_needs, deal_need_items, pipeline_links,
-- anew_leads) carries the AFTER audit trigger fn_generic_entity_audit(), so ONE
-- business gesture produces N audit rows when the intent is exactly 1.
--
-- Solution
-- --------
-- This migration REUSES the foundation created in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql:
--   · the app.audit_bypass GUC guard already present at the top of
--     fn_generic_entity_audit()  (grep for "app.audit_bypass" confirms it exists)
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text)
-- The foundation is NOT recreated here.
--
-- Three RPCs reproduce, field-for-field / condition-for-condition, what the
-- frontend does today, all inside a single transaction with app.audit_bypass = 'on',
-- accumulate a combined diff across every touched table
-- ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE:
--   · rpc_create_deal        — Deals.tsx handleSubmit, create branch
--   · rpc_update_deal        — Deals.tsx handleSubmit, edit branch
--   · rpc_update_deal_needs  — DealNeedsSection.tsx handleSubmit (single need + items)
--
-- Division of responsibility (kept identical to the current app)
-- --------------------------------------------------------------
-- The frontend still owns everything that is NOT a plain multi-table write:
--   · Zod / input validation (dealSchema) and the lead/client/contact selection
--     guard.
--   · Resolution of resolvedClientId / resolvedContactId (anew_clients /
--     anew_contacts lookups) — passed in as p_client_id / p_contact_id.
--   · resolveRootOrgId (anew_hierarchy walk) — passed in as p_root_organization_id.
--   · isDisqualifiedStage → whether lost_reason is kept — the FE computes the final
--     lost_reason value (already null when the stage is not disqualified) and passes
--     it in verbatim.
--   · The recent-duplicate guard (30s window) — stays in the FE BEFORE calling the
--     RPC, unchanged.
--   · The "proposta" lead_workflow_stages resolution — the FE resolves the stage id
--     and passes it as p_lead_workflow_stage_id; the lead status transition to
--     'qualified' happens inside the RPC only when the lead is not already converted,
--     exactly like the FE's isAlreadyConverted check.
--   · execute-workflow Edge Function invocations remain post-RPC FE calls, unchanged.
--   · The line items (dealLineItems) are computed in the FE and passed in as a jsonb
--     array; the RPC performs the identical deal_needs / deal_need_items writes.
-- The RPC owns ONLY the consolidated DML across these tables + the single audit row.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS does NOT self-enforce inside them. Each RPC
-- therefore re-checks, explicitly, the SAME predicate the deals / deal_needs /
-- deal_need_items / pipeline_links RLS policies enforce today (baseline
-- 20260615130000): the row's organization_id must be in
-- get_user_visible_org_ids(auth.uid()). deal_needs / deal_need_items have no org
-- column of their own; their RLS derives visibility from the parent deal's
-- organization_id, so checking the parent deal's org is the correct, identical
-- boundary. fn_deal_org_in_scope(org) below evaluates exactly that membership set.
--
-- Behavior divergence (documented, intentional — created_by author)
-- -----------------------------------------------------------------
-- The FE resolves the author as resolveCurrentBusinessUserId() and aborts with a
-- toast when it is null. These RPCs use current_business_user_id() and RAISE
-- 'Perfil de utilizador não encontrado' when it is NULL — the same fail-closed,
-- self-consistent behavior as every other audit-bypass RPC in this codebase
-- (roles/users/organizations/leads/contacts). Not a security regression.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard + fn_manual_audit_log()
--   20260615130000_baseline_new_database.sql       — current_business_user_id(),
--                                                     get_user_visible_org_ids(), deals + deal_needs
--                                                     + deal_need_items + pipeline_links + anew_leads + RLS


-- ============================================================
-- 0. Shared authorization helper — deals RLS parity
-- ============================================================
-- Returns TRUE when p_org_id is in the current auth.uid()'s visible org set, which
-- is EXACTLY the predicate used by every deals/deal_needs/deal_need_items/
-- pipeline_links RLS policy in the baseline
-- (organization_id IN get_user_visible_org_ids(auth.uid())). SECURITY DEFINER so it
-- can evaluate the membership set regardless of the caller's own RLS, but it only
-- ever answers a boolean about the CURRENT user. A NULL org never matches.

CREATE OR REPLACE FUNCTION public.fn_deal_org_in_scope(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_org_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.get_user_visible_org_ids((SELECT auth.uid())) AS g(id)
       WHERE g.id = p_org_id
     );
$$;

REVOKE ALL ON FUNCTION public.fn_deal_org_in_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_deal_org_in_scope(uuid) TO authenticated, service_role;


-- ============================================================
-- Shared internal helper — apply one deal_need + its items
-- ============================================================
-- Encapsulates the deal_needs upsert + deal_need_items delete/insert that BOTH the
-- Deals.tsx create/edit path and DealNeedsSection.tsx perform, so the three RPCs
-- stay DRY and behave identically. Returns the resulting need id and appends the
-- deal_needs / deal_need_items changes into the caller's accumulating diff via
-- INOUT params. NOTE: p_full_need_data carries the full need column payload as jsonb
-- (used by rpc_update_deal_needs which sets every column); when only the minimal
-- Deals.tsx shape is needed the caller passes just title/status/created_by/sort_order.
-- This is an internal function, callable only by the RPCs (no direct client GRANT).
--
-- p_items is a jsonb array of {item_type, product_id, service_id, quantity,
-- unit_price, notes, sort_order}. When p_need_id is provided the existing items are
-- deleted first (delete+reinsert semantics, identical to the FE).
--
-- p_update_need_columns controls the existing-need branch (p_need_id NOT NULL):
--   · TRUE  (default)  -> UPDATE the deal_needs row with the full editable column set.
--     Used by rpc_update_deal_needs (DealNeedsSection.tsx), which DOES edit the need.
--   · FALSE            -> do NOT touch deal_needs at all; only delete+reinsert the
--     linked deal_need_items. Used by rpc_update_deal (Deals.tsx edit path), where the
--     FE, when a need already exists, ONLY deletes+reinserts deal_need_items and never
--     writes deal_needs — so the need's title/status set independently (e.g. via
--     DealNeedsSection) must be preserved verbatim. Writing deal_needs here would be a
--     destructive divergence from the frontend.
-- When p_need_id IS NULL (INSERT), p_update_need_columns is irrelevant (a new row is
-- always created from the payload).

CREATE OR REPLACE FUNCTION public.fn_apply_deal_need(
  p_deal_id             uuid,
  p_need_id             uuid,        -- existing need id, or NULL to insert
  p_need_data           jsonb,       -- full column payload for the need
  p_items               jsonb,       -- array of item rows (may be empty/NULL)
  p_created_by          uuid,
  p_update_need_columns boolean DEFAULT true,  -- FALSE = items-only, leave deal_needs untouched
  OUT o_need_id         uuid,        -- resulting need id
  OUT o_diff            jsonb        -- {deal_needs: {...}} fragment to merge into the caller's diff
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_need_id     uuid := p_need_id;
  v_item        jsonb;
  v_idx         integer := 0;
  v_items_arr   jsonb := COALESCE(p_items, '[]'::jsonb);
  v_need_diff   jsonb := '{}'::jsonb;
BEGIN
  IF v_need_id IS NULL THEN
    -- INSERT a new deal_needs row from the payload.
    INSERT INTO public.deal_needs (
      deal_id, title, description, priority, status, internal_notes,
      initial_estimate, estimate_min, estimate_max, template_id,
      custom_fields, measurement_values, checklist, created_by,
      category_id, category_name, technical_notes, measurements, sort_order
    )
    VALUES (
      p_deal_id,
      COALESCE(p_need_data ->> 'title', 'Itens do pedido'),
      p_need_data ->> 'description',
      COALESCE(p_need_data ->> 'priority', 'media'),
      COALESCE(p_need_data ->> 'status', 'pending'),
      p_need_data ->> 'internal_notes',
      COALESCE((p_need_data ->> 'initial_estimate')::numeric, 0),
      COALESCE((p_need_data ->> 'estimate_min')::numeric, 0),
      COALESCE((p_need_data ->> 'estimate_max')::numeric, 0),
      nullif(p_need_data ->> 'template_id', '')::uuid,
      COALESCE(p_need_data -> 'custom_fields', '[]'::jsonb),
      COALESCE(p_need_data -> 'measurement_values', '[]'::jsonb),
      COALESCE(p_need_data -> 'checklist', '[]'::jsonb),
      p_created_by,
      nullif(p_need_data ->> 'category_id', '')::uuid,
      p_need_data ->> 'category_name',
      p_need_data ->> 'technical_notes',
      COALESCE(p_need_data -> 'measurements', '{}'::jsonb),
      COALESCE((p_need_data ->> 'sort_order')::integer, 0)
    )
    RETURNING id INTO v_need_id;

    v_need_diff := jsonb_build_object(
      'id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_need_id)),
      'title', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_need_data ->> 'title', 'Itens do pedido')))
    );
  ELSE
    IF p_update_need_columns THEN
      -- UPDATE the existing need only with the columns present in p_need_data.
      -- rpc_update_deal_needs supplies the full editable column set here.
      UPDATE public.deal_needs
      SET title            = COALESCE(p_need_data ->> 'title', title),
          description      = CASE WHEN p_need_data ? 'description' THEN p_need_data ->> 'description' ELSE description END,
          priority         = COALESCE(p_need_data ->> 'priority', priority),
          status           = COALESCE(p_need_data ->> 'status', status),
          internal_notes   = CASE WHEN p_need_data ? 'internal_notes' THEN p_need_data ->> 'internal_notes' ELSE internal_notes END,
          initial_estimate = COALESCE((p_need_data ->> 'initial_estimate')::numeric, initial_estimate),
          estimate_min     = COALESCE((p_need_data ->> 'estimate_min')::numeric, estimate_min),
          estimate_max     = COALESCE((p_need_data ->> 'estimate_max')::numeric, estimate_max),
          template_id      = CASE WHEN p_need_data ? 'template_id' THEN nullif(p_need_data ->> 'template_id', '')::uuid ELSE template_id END,
          custom_fields    = COALESCE(p_need_data -> 'custom_fields', custom_fields),
          measurement_values = COALESCE(p_need_data -> 'measurement_values', measurement_values),
          checklist        = COALESCE(p_need_data -> 'checklist', checklist),
          category_id      = CASE WHEN p_need_data ? 'category_id' THEN nullif(p_need_data ->> 'category_id', '')::uuid ELSE category_id END,
          category_name    = CASE WHEN p_need_data ? 'category_name' THEN p_need_data ->> 'category_name' ELSE category_name END,
          technical_notes  = CASE WHEN p_need_data ? 'technical_notes' THEN p_need_data ->> 'technical_notes' ELSE technical_notes END,
          measurements     = COALESCE(p_need_data -> 'measurements', measurements),
          updated_at       = now()
      WHERE id = v_need_id AND deal_id = p_deal_id;

      v_need_diff := jsonb_build_object(
        'id', jsonb_build_object('old', to_jsonb(v_need_id), 'new', to_jsonb(v_need_id))
      );
    ELSE
      -- Items-only path (Deals.tsx edit): leave deal_needs completely untouched.
      -- The FE never writes deal_needs when a need already exists — it only
      -- rewrites deal_need_items — so the need's independently-set title/status
      -- (e.g. from DealNeedsSection) is preserved verbatim.
      v_need_diff := jsonb_build_object(
        'id', jsonb_build_object('old', to_jsonb(v_need_id), 'new', to_jsonb(v_need_id))
      );
    END IF;

    -- Delete existing items (delete+reinsert, identical to the FE).
    DELETE FROM public.deal_need_items WHERE deal_need_id = v_need_id;
  END IF;

  -- (Re)insert the items in order, mirroring the FE's map(item, idx) shape.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_arr)
  LOOP
    INSERT INTO public.deal_need_items (
      deal_need_id, item_type, product_id, service_id,
      quantity, unit_price, notes, sort_order
    )
    VALUES (
      v_need_id,
      v_item ->> 'item_type',
      nullif(v_item ->> 'product_id', '')::uuid,
      nullif(v_item ->> 'service_id', '')::uuid,
      COALESCE((v_item ->> 'quantity')::numeric, 1),
      COALESCE((v_item ->> 'unit_price')::numeric, 0),
      v_item ->> 'notes',
      COALESCE((v_item ->> 'sort_order')::integer, v_idx)
    );
    v_idx := v_idx + 1;
  END LOOP;

  IF jsonb_array_length(v_items_arr) > 0 THEN
    v_need_diff := v_need_diff || jsonb_build_object('items_count',
      jsonb_build_object('old', NULL, 'new', to_jsonb(jsonb_array_length(v_items_arr))));
  END IF;

  o_need_id := v_need_id;
  o_diff    := jsonb_build_object('deal_needs', v_need_diff);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_apply_deal_need(uuid, uuid, jsonb, jsonb, uuid, boolean) FROM PUBLIC, anon;
-- No client GRANT: internal helper, invoked only from the SECURITY DEFINER RPCs below.


-- ============================================================
-- 1. rpc_create_deal(...)
-- ============================================================
-- Mirrors the create branch of handleSubmit in src/pages/Deals.tsx:
--   1. INSERT deals with the exact dealData columns (+ created_by = assigned_to =
--      business user). lost_reason arrives already-resolved (null when the stage is
--      not disqualified — the FE computed it).
--   2. WHEN a lead is linked AND that lead is not already converted
--      (status='converted' OR converted_to_contact_id set OR client_id set):
--      UPDATE anew_leads SET status='qualified' (+ workflow_stage_id when the FE
--      resolved the 'proposta' stage). Mirrors the isAlreadyConverted check.
--   3. pipeline_links: when a lead is linked, reuse the existing active lead link
--      (UPDATE deal_id + updated_at) else INSERT a fresh link; when no lead, INSERT.
--   4. WHEN line items were provided: INSERT deal_needs + deal_need_items.
-- The recent-duplicate guard, stage resolution and execute-workflow stay in the FE.
-- Returns the created deals row.

CREATE OR REPLACE FUNCTION public.rpc_create_deal(
  p_deal_data              jsonb,   -- title,value,stage_id,probability,description,expected_close_date,lost_reason,lead_id,client_id,contact_id,entity_id
  p_organization_id        uuid,
  p_root_organization_id   uuid,
  p_lead_workflow_stage_id uuid,    -- resolved 'proposta' stage, or NULL
  p_items                  jsonb    -- array of line items, or NULL/[]
)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_deal         public.deals;
  v_lead_id      uuid := nullif(p_deal_data ->> 'lead_id', '')::uuid;
  v_before_lead  public.anew_leads;
  v_after_lead   public.anew_leads;
  v_is_converted boolean;
  v_existing_link uuid;
  v_link_id      uuid;
  v_need_id      uuid;
  v_need_frag    jsonb;
  v_diff         jsonb := '{}'::jsonb;
  v_deal_diff    jsonb := '{}'::jsonb;
  v_lead_diff    jsonb := '{}'::jsonb;
  v_link_diff    jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorization parity with deals RLS: org must be visible to the caller.
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── 1. INSERT the deal (columns identical to handleSubmit insertData) ─────
  INSERT INTO public.deals (
    title, value, stage_id, organization_id, root_organization_id,
    lead_id, client_id, contact_id, entity_id, probability,
    description, expected_close_date, lost_reason, created_by, assigned_to
  )
  VALUES (
    p_deal_data ->> 'title',
    COALESCE((p_deal_data ->> 'value')::numeric, 0),
    (p_deal_data ->> 'stage_id')::uuid,
    p_organization_id,
    COALESCE(p_root_organization_id, p_organization_id),
    v_lead_id,
    nullif(p_deal_data ->> 'client_id', '')::uuid,
    nullif(p_deal_data ->> 'contact_id', '')::uuid,
    nullif(p_deal_data ->> 'entity_id', '')::uuid,
    COALESCE((p_deal_data ->> 'probability')::integer, 50),
    nullif(p_deal_data ->> 'description', ''),
    nullif(p_deal_data ->> 'expected_close_date', '')::date,
    nullif(p_deal_data ->> 'lost_reason', ''),
    v_actor,
    v_actor
  )
  RETURNING * INTO v_deal;

  v_deal_diff := jsonb_build_object(
    'id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.id)),
    'title',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.title)),
    'value',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.value)),
    'stage_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.stage_id))
  );

  -- ── 2. Lead status transition (only when not already converted) ───────────
  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_before_lead FROM public.anew_leads WHERE id = v_lead_id;
    IF FOUND THEN
      v_is_converted := (
        v_before_lead.status = 'converted'
        OR v_before_lead.converted_to_contact_id IS NOT NULL
        OR v_before_lead.client_id IS NOT NULL
      );

      IF NOT v_is_converted THEN
        IF p_lead_workflow_stage_id IS NOT NULL THEN
          UPDATE public.anew_leads
          SET status = 'qualified',
              workflow_stage_id = p_lead_workflow_stage_id
          WHERE id = v_lead_id
          RETURNING * INTO v_after_lead;
        ELSE
          UPDATE public.anew_leads
          SET status = 'qualified'
          WHERE id = v_lead_id
          RETURNING * INTO v_after_lead;
        END IF;

        IF v_before_lead.status IS DISTINCT FROM v_after_lead.status THEN
          v_lead_diff := v_lead_diff || jsonb_build_object('status',
            jsonb_build_object('old', to_jsonb(v_before_lead.status), 'new', to_jsonb(v_after_lead.status)));
        END IF;
        IF v_before_lead.workflow_stage_id IS DISTINCT FROM v_after_lead.workflow_stage_id THEN
          v_lead_diff := v_lead_diff || jsonb_build_object('workflow_stage_id',
            jsonb_build_object('old', to_jsonb(v_before_lead.workflow_stage_id), 'new', to_jsonb(v_after_lead.workflow_stage_id)));
        END IF;
      END IF;
    END IF;
  END IF;

  -- ── 3. pipeline_links (reuse active lead link, else insert) ───────────────
  IF v_lead_id IS NOT NULL THEN
    SELECT id INTO v_existing_link
    FROM public.pipeline_links
    WHERE lead_id = v_lead_id AND status = 'active'
    LIMIT 1;

    IF v_existing_link IS NOT NULL THEN
      UPDATE public.pipeline_links
      SET deal_id = v_deal.id, updated_at = now()
      WHERE id = v_existing_link;
      v_link_id := v_existing_link;
      v_link_diff := jsonb_build_object('deal_id',
        jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.id)));
    ELSE
      INSERT INTO public.pipeline_links
        (deal_id, lead_id, organization_id, root_organization_id, status)
      VALUES
        (v_deal.id, v_lead_id, p_organization_id,
         COALESCE(p_root_organization_id, p_organization_id), 'active')
      RETURNING id INTO v_link_id;
      v_link_diff := jsonb_build_object(
        'id',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_link_id)),
        'deal_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.id)));
    END IF;
  ELSE
    INSERT INTO public.pipeline_links
      (deal_id, organization_id, root_organization_id, status)
    VALUES
      (v_deal.id, p_organization_id,
       COALESCE(p_root_organization_id, p_organization_id), 'active')
    RETURNING id INTO v_link_id;
    v_link_diff := jsonb_build_object(
      'id',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_link_id)),
      'deal_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deal.id)));
  END IF;

  -- ── 4. deal_needs + deal_need_items (only when line items provided) ───────
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    SELECT h.o_need_id, h.o_diff INTO v_need_id, v_need_frag
    FROM public.fn_apply_deal_need(
      v_deal.id,
      NULL,
      jsonb_build_object('title', COALESCE(p_deal_data ->> 'title', 'Itens do pedido'),
                         'status', 'pending', 'sort_order', 0),
      p_items,
      v_actor
    ) AS h;
    v_diff := v_diff || v_need_frag;
  END IF;

  -- ── Combine + emit ONE audit row keyed on the deal id ─────────────────────
  IF v_deal_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('deals', v_deal_diff);
  END IF;
  IF v_lead_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_link_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('pipeline_links', v_link_diff);
  END IF;

  PERFORM public.fn_manual_audit_log(
    'deals',
    v_deal.id,
    p_organization_id,
    'INSERT',
    v_diff,
    'web_app'
  );

  RETURN v_deal;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_deal(jsonb, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_deal(jsonb, uuid, uuid, uuid, jsonb) TO authenticated;


-- ============================================================
-- 2. rpc_update_deal(...)
-- ============================================================
-- Mirrors the edit branch of handleSubmit in src/pages/Deals.tsx:
--   1. UPDATE deals with the exact dealData columns, scoped to id + organization_id
--      (the FE guards count === 0 as "not found / access denied" — the RPC RAISES).
--   2. deal_needs / deal_need_items sync (identical to the FE branching):
--        · line items present  -> reuse existing need (delete items, reinsert) OR
--          create a need first, then insert items.
--        · no line items but a need exists -> delete its items AND the need.
--        · no line items and no need -> nothing.
-- The FE resolves resolvedClientId / resolvedContactId and the final lost_reason and
-- passes them in via p_deal_data. execute-workflow (stage change) stays in the FE.
-- Returns the updated deals row.

CREATE OR REPLACE FUNCTION public.rpc_update_deal(
  p_deal_id          uuid,
  p_deal_data        jsonb,   -- title,value,stage_id,probability,description,expected_close_date,lost_reason,lead_id,client_id,contact_id,entity_id
  p_organization_id  uuid,
  p_items            jsonb    -- array of line items, or NULL/[]
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
  v_existing_need uuid;
  v_need_id     uuid;
  v_need_frag   jsonb;
  v_col         text;
  v_diff        jsonb := '{}'::jsonb;
  v_deal_diff   jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorization parity with deals RLS: org must be visible to the caller.
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load before-image, scoped to org (mirrors .eq id + .eq organization_id) ──
  SELECT * INTO v_before_deal
  FROM public.deals
  WHERE id = p_deal_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found or access denied.' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── 1. UPDATE the deal (columns identical to handleSubmit dealData) ───────
  UPDATE public.deals
  SET title               = p_deal_data ->> 'title',
      value               = COALESCE((p_deal_data ->> 'value')::numeric, 0),
      stage_id            = (p_deal_data ->> 'stage_id')::uuid,
      root_organization_id = COALESCE(nullif(p_deal_data ->> 'root_organization_id', '')::uuid, root_organization_id),
      lead_id             = nullif(p_deal_data ->> 'lead_id', '')::uuid,
      client_id           = nullif(p_deal_data ->> 'client_id', '')::uuid,
      contact_id          = nullif(p_deal_data ->> 'contact_id', '')::uuid,
      entity_id           = nullif(p_deal_data ->> 'entity_id', '')::uuid,
      probability         = COALESCE((p_deal_data ->> 'probability')::integer, 50),
      description         = nullif(p_deal_data ->> 'description', ''),
      expected_close_date = nullif(p_deal_data ->> 'expected_close_date', '')::date,
      lost_reason         = nullif(p_deal_data ->> 'lost_reason', ''),
      updated_at          = now()
  WHERE id = p_deal_id AND organization_id = p_organization_id
  RETURNING * INTO v_deal;

  -- ── Build the deals diff (only changed cols) ──────────────────────────────
  FOR v_col IN SELECT unnest(ARRAY[
    'title','value','stage_id','probability','description',
    'expected_close_date','lost_reason','lead_id','client_id','contact_id','entity_id',
    'root_organization_id'
  ])
  LOOP
    IF to_jsonb(v_before_deal) -> v_col IS DISTINCT FROM to_jsonb(v_deal) -> v_col THEN
      v_deal_diff := v_deal_diff || jsonb_build_object(v_col,
        jsonb_build_object('old', to_jsonb(v_before_deal) -> v_col, 'new', to_jsonb(v_deal) -> v_col));
    END IF;
  END LOOP;

  -- ── 2. deal_needs / deal_need_items sync (mirrors the FE branching) ───────
  SELECT id INTO v_existing_need
  FROM public.deal_needs
  WHERE deal_id = p_deal_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    -- Reuse existing need (delete+reinsert items, leave deal_needs untouched — the FE
    -- never writes deal_needs on the edit path) OR create a fresh need when none
    -- exists (the payload title/status is then used for the new row).
    -- p_update_need_columns => false enforces the items-only behavior when the need
    -- already exists; it is a no-op when v_existing_need IS NULL (a new row is created).
    SELECT h.o_need_id, h.o_diff INTO v_need_id, v_need_frag
    FROM public.fn_apply_deal_need(
      p_deal_id,
      v_existing_need,
      jsonb_build_object('title', COALESCE(p_deal_data ->> 'title', 'Itens do pedido'),
                         'status', 'pending', 'sort_order', 0),
      p_items,
      v_actor,
      false
    ) AS h;
    v_diff := v_diff || v_need_frag;
  ELSIF v_existing_need IS NOT NULL THEN
    -- No line items but a need exists -> delete its items AND the need.
    DELETE FROM public.deal_need_items WHERE deal_need_id = v_existing_need;
    DELETE FROM public.deal_needs WHERE id = v_existing_need;
    v_diff := v_diff || jsonb_build_object('deal_needs',
      jsonb_build_object('id', jsonb_build_object('old', to_jsonb(v_existing_need), 'new', NULL)));
  END IF;

  -- ── Combine + emit ONE audit row keyed on the deal id ─────────────────────
  IF v_deal_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('deals', v_deal_diff);
  END IF;

  IF v_diff <> '{}'::jsonb THEN
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

REVOKE ALL ON FUNCTION public.rpc_update_deal(uuid, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_deal(uuid, jsonb, uuid, jsonb) TO authenticated;


-- ============================================================
-- 3. rpc_update_deal_needs(...)
-- ============================================================
-- Mirrors handleSubmit in src/components/deals/DealNeedsSection.tsx: a single need
-- (create OR edit) plus its linked items, treated as ONE transaction with ONE audit
-- row. Column-for-column:
--   · editing an existing need   -> UPDATE deal_needs (full editable column set),
--     DELETE its deal_need_items, then reinsert the linked items.
--   · creating a new need         -> INSERT deal_needs with sort_order = p_sort_order
--     (the FE passes needs.length), then insert the linked items.
-- The FE owns the customFields/measurementValues/checklist array construction and
-- the title-required guard; the resolved need column payload is passed in as
-- p_need_data and the items as p_items. Authorization is checked against the parent
-- deal's organization_id (deal_needs RLS derives from the parent deal). Returns the
-- resulting deal_needs row.

CREATE OR REPLACE FUNCTION public.rpc_update_deal_needs(
  p_deal_id     uuid,
  p_need_id     uuid,     -- existing need id (edit), or NULL (create)
  p_need_data   jsonb,    -- full deal_needs column payload
  p_items       jsonb     -- array of linked items, or NULL/[]
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
  SELECT h.o_need_id, h.o_diff INTO v_need_id, v_need_frag
  FROM public.fn_apply_deal_need(
    p_deal_id,
    p_need_id,
    p_need_data,
    p_items,
    v_actor
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

REVOKE ALL ON FUNCTION public.rpc_update_deal_needs(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_deal_needs(uuid, uuid, jsonb, jsonb) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Foundation reused, not recreated — this migration references but does NOT
--    redefine fn_generic_entity_audit() / fn_manual_audit_log(). It only ADDS
--    fn_deal_org_in_scope(), the fn_apply_deal_need() helper and the three RPCs.
--
-- 2. A single deal create that links a lead, updates the lead to 'qualified',
--    creates the pipeline link and adds line items produces exactly ONE audit row
--    (deals + anew_leads + pipeline_links + deal_needs in one changed_fields diff),
--    keyed on the new deal id, operation INSERT:
--      SELECT rpc_create_deal('{...}'::jsonb, '<org>', '<root>', '<stage>', '[...]'::jsonb);
--      SELECT count(*) FROM entity_audit_log
--      WHERE entity_id = '<new deal id>' AND created_at > now() - interval '1 minute';  -- 1
--
-- 3. A deal edit that also rewrites its need items produces exactly ONE row
--    (deals + deal_needs), operation UPDATE, keyed on the deal id. When nothing
--    actually changed the RPC emits no row (v_diff stays '{}').
--
-- 4. rpc_update_deal_needs yields ONE row for a single need create/edit + its items,
--    keyed on the parent deal id, operation INSERT (create) or UPDATE (edit).
--
-- 5. Authorization: calling any RPC for an organization the caller cannot see
--    (organization_id NOT IN get_user_visible_org_ids(auth.uid())) raises
--    insufficient_privilege — identical boundary to the deals/deal_needs/
--    deal_need_items/pipeline_links RLS policies. rpc_update_deal additionally
--    RAISES 'Deal not found or access denied.' when the id+org row is absent,
--    matching the FE's count === 0 guard.
--
-- 6. created_by author resolution intentionally uses current_business_user_id() and
--    RAISES on NULL (fail closed), consistent with every other audit-bypass RPC.
--
-- 7. Scope caveat: execute-workflow, the recent-duplicate guard and stage/id
--    resolution stay in the FE by design (unchanged). The "exactly 1 row" guarantee
--    describes each RPC's consolidated DML; any FE side-effect performed outside the
--    RPC (e.g. execute-workflow writing its own rows) is outside this migration.
