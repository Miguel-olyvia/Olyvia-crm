-- rpc_create_proposal silently dropped template_snapshot: its INSERT uses an
-- explicit column list (confirmed live via pg_get_functiondef) that predates
-- the new proposals.template_snapshot column, so a value passed in
-- p_proposal_data was accepted by the function call but never stored —
-- confirmed empirically (created a real proposal via the RPC with a test
-- template_snapshot value; the resulting row had it as NULL).
--
-- Everything else in the function — auth/RLS-parity checks, relation
-- persistence, audit-log diff building — is unchanged. template_snapshot is
-- intentionally NOT added to v_diff_cols: it's a full template config object,
-- not a business field, and would bloat the audit diff for no benefit (the
-- proposals table itself remains the source of truth for its current value).
--
-- rpc_update_proposal is NOT touched: its UPDATE...SET column list (confirmed
-- via the same introspection) never references template_snapshot, so it is
-- already impossible for an edit to reset an already-frozen snapshot.

CREATE OR REPLACE FUNCTION public.rpc_create_proposal(p_proposal_data jsonb, p_selected_quote_ids uuid[] DEFAULT ARRAY[]::uuid[], p_inline_quotes jsonb DEFAULT '[]'::jsonb, p_proposal_items jsonb DEFAULT '[]'::jsonb, p_quote_entity_id uuid DEFAULT NULL::uuid)
 RETURNS proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_org_id       uuid;
  v_root_org_id  uuid;
  v_entity_id    uuid;
  v_deal_id      uuid;
  v_proposal     public.proposals;
  v_iq_ids       uuid[];
  v_diff         jsonb := '{}'::jsonb;
  v_prop_diff    jsonb := '{}'::jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_diff_cols    text[] := ARRAY[
    'title','description','value','probability','deal_id','entity_id','valid_until',
    'notes','stage_id','status','organization_id','root_organization_id',
    'template_id','assigned_to'
  ];
  v_iq_id        uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id      := nullif(p_proposal_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_proposal_data ->> 'root_organization_id', '')::uuid;
  v_deal_id     := nullif(p_proposal_data ->> 'deal_id', '')::uuid;
  v_entity_id   := nullif(p_proposal_data ->> 'entity_id', '')::uuid;

  -- ── Authorization parity with proposals INSERT RLS ────────────────────────
  -- Policy: created_by = current_business_user_id()
  --         AND has proposals.create
  --         AND (organization_id IS NULL OR organization_id IN visible orgs).
  IF NOT public.has_anew_permission(auth.uid(), 'proposals.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar propostas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_org_id IS NOT NULL
     AND NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the proposal (identical column set to proposalData in the FE) ──
  INSERT INTO public.proposals (
    title, description, value, probability, deal_id, entity_id, valid_until,
    notes, stage_id, status, organization_id, root_organization_id,
    template_id, template_snapshot, assigned_to, created_by
  )
  VALUES (
    p_proposal_data ->> 'title',
    nullif(p_proposal_data ->> 'description', ''),
    COALESCE((p_proposal_data ->> 'value')::numeric, 0),
    COALESCE((p_proposal_data ->> 'probability')::numeric, 50),
    v_deal_id,
    v_entity_id,
    nullif(p_proposal_data ->> 'valid_until', '')::date,
    nullif(p_proposal_data ->> 'notes', ''),
    nullif(p_proposal_data ->> 'stage_id', '')::uuid,
    COALESCE(nullif(p_proposal_data ->> 'status', ''), 'draft'),
    v_org_id,
    COALESCE(v_root_org_id, v_org_id),
    nullif(p_proposal_data ->> 'template_id', '')::uuid,
    p_proposal_data -> 'template_snapshot',
    nullif(p_proposal_data ->> 'assigned_to', '')::uuid,
    v_actor
  )
  RETURNING * INTO v_proposal;

  -- ── Relations (quotes relink + inline quotes + proposal_items) ────────────
  v_iq_ids := public.fn_proposals_persist_relations(
    v_proposal.id,
    v_proposal.organization_id,
    COALESCE(v_root_org_id, v_proposal.organization_id),
    v_deal_id,
    v_proposal.entity_id,
    v_actor,
    p_selected_quote_ids,
    p_inline_quotes,
    p_proposal_items,
    p_quote_entity_id
  );

  -- ── Build the combined diff (INSERT snapshot of the tracked columns) ──────
  v_new_json := to_jsonb(v_proposal);
  FOREACH v_key IN ARRAY v_diff_cols LOOP
    v_prop_diff := v_prop_diff || jsonb_build_object(
      v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
    );
  END LOOP;
  v_diff := v_diff || jsonb_build_object('proposals', v_prop_diff);

  IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'quotes', jsonb_build_object('linked', to_jsonb(p_selected_quote_ids))
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  v_diff := v_diff || jsonb_build_object(
    'proposal_items', jsonb_build_object('new', COALESCE(p_proposal_items, '[]'::jsonb))
  );

  -- ── One consolidated audit row for the proposal ───────────────────────────
  PERFORM public.fn_manual_audit_log(
    'proposals',
    v_proposal.entity_id,
    v_proposal.organization_id,
    'INSERT',
    v_diff,
    'web_app'
  );

  -- Each inline quote is an independent creation — one INSERT row apiece.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_proposal.organization_id, 'INSERT',
        jsonb_build_object('inline_of_proposal', to_jsonb(v_proposal.id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_proposal;
END;
$function$;
