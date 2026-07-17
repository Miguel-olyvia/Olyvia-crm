-- ============================================================
-- Deals: persist the "Valor Máximo" (value_max) field
-- ============================================================
-- The Deals.tsx form has always had a value_max input (bound to
-- formData.value_max, read back on edit) but the deals table never had a
-- matching column and rpc_create_deal / rpc_update_deal never wrote it —
-- the field was silently dropped on every save. This migration:
--   1. Adds the `value_max` column to public.deals.
--   2. Updates rpc_create_deal to insert it (from p_deal_data ->> 'value_max').
--   3. Updates rpc_update_deal to update it and include it in the diff.
-- No signature changes: both RPCs already take the deal fields via a single
-- jsonb p_deal_data parameter, so existing REVOKE/GRANT statements remain valid.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS value_max numeric;


-- ============================================================
-- 1. rpc_create_deal(...) — add value_max to the INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_deal(
  p_deal_data              jsonb,   -- title,value,value_max,stage_id,probability,description,expected_close_date,lost_reason,lead_id,client_id,contact_id,entity_id
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
    title, value, value_max, stage_id, organization_id, root_organization_id,
    lead_id, client_id, contact_id, entity_id, probability,
    description, expected_close_date, lost_reason, created_by, assigned_to
  )
  VALUES (
    p_deal_data ->> 'title',
    COALESCE((p_deal_data ->> 'value')::numeric, 0),
    nullif(p_deal_data ->> 'value_max', '')::numeric,
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
-- 2. rpc_update_deal(...) — add value_max to the UPDATE + diff
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_deal(
  p_deal_id          uuid,
  p_deal_data        jsonb,   -- title,value,value_max,stage_id,probability,description,expected_close_date,lost_reason,lead_id,client_id,contact_id,entity_id
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
      value_max           = nullif(p_deal_data ->> 'value_max', '')::numeric,
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
    'title','value','value_max','stage_id','probability','description',
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
