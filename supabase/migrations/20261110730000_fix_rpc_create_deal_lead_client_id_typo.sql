-- Fix: rpc_create_deal referenced anew_leads.client_id, a column that has
-- never existed on that table (only converted_to_client_id exists). This
-- raised a 42703 "record has no field" error whenever a deal was created
-- from a lead (v_lead_id IS NOT NULL and the lead row FOUND), unconditionally
-- blocking every "Criar pedido de proposta" / create-deal-from-lead flow.
--
-- Root cause: typo in the "already converted?" predicate — it should read
-- converted_to_client_id (the lead's own converted-to column), not client_id.
--
-- Fix scope: correct only the faulty field reference. No audit/security
-- check is weakened; the OR-condition semantics (already converted if
-- status = 'converted' OR converted_to_contact_id IS NOT NULL OR
-- converted_to_client_id IS NOT NULL) are preserved exactly as intended.

CREATE OR REPLACE FUNCTION public.rpc_create_deal(p_deal_data jsonb, p_organization_id uuid, p_root_organization_id uuid, p_lead_workflow_stage_id uuid, p_items jsonb)
 RETURNS deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        OR v_before_lead.converted_to_client_id IS NOT NULL
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
$function$;
