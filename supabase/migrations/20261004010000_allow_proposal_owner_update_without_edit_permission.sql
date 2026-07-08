-- ============================================================================
-- Fix: proposal owner cannot change their own proposal's status
-- (e.g. Rascunho -> Aceite) when their role only has proposals.edit with an
-- OWNED scope entry that isn't a literal row in anew_role_permissions, or no
-- proposals.edit at all.
--
-- Root cause: rpc_update_proposal's Gate 2 (WITH CHECK) and the live RLS
-- policy "Users with permission can update proposals" (WITH CHECK), both
-- introduced/confirmed in 20260815010000 and 20260927010000 respectively,
-- require has_anew_permission(auth.uid(), 'proposals.edit') UNCONDITIONALLY,
-- with no OR for created_by. Gate 1 / the USING clause already allows the
-- owner through, so an owner who is not otherwise granted proposals.edit at
-- the role level reaches the update, then gets rejected by Gate 2/WITH CHECK
-- with "Sem permissão para editar esta proposta" / insufficient_privilege.
--
-- Fix: make Gate 2 / WITH CHECK symmetric with Gate 1 / USING — the row's
-- owner (created_by = current_business_user_id()) is a sufficient condition
-- on its own, exactly like the existing owner bypass in Gate 1. Non-owners
-- still require proposals.edit, so a user without permission still cannot
-- edit somebody else's proposal. Org-scope constraint on the incoming
-- organization_id is preserved unchanged.
--
-- Forward-only migration — does not edit 20260815010000 or 20260927010000.
-- ============================================================================

-- ── 1. rpc_update_proposal: align Gate 2 (WITH CHECK) with Gate 1 (USING) ───
CREATE OR REPLACE FUNCTION public.rpc_update_proposal(
  p_id                 uuid,
  p_proposal_data      jsonb,
  p_selected_quote_ids uuid[]  DEFAULT ARRAY[]::uuid[],
  p_inline_quotes      jsonb   DEFAULT '[]'::jsonb,
  p_proposal_items     jsonb   DEFAULT '[]'::jsonb,
  p_quote_entity_id    uuid    DEFAULT NULL   -- inline-quote entity from the FE cascade
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_org_id       uuid;
  v_root_org_id  uuid;
  v_entity_id    uuid;
  v_deal_id      uuid;
  v_before       public.proposals;
  v_proposal     public.proposals;
  v_iq_ids       uuid[];
  v_diff         jsonb := '{}'::jsonb;
  v_prop_diff    jsonb := '{}'::jsonb;
  v_old_json     jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_diff_cols    text[] := ARRAY[
    'title','description','value','probability','deal_id','entity_id','valid_until',
    'notes','stage_id','status','organization_id','root_organization_id',
    'template_id','assigned_to'
  ];
  v_iq_id        uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + guards) ─────────────
  SELECT * INTO v_before FROM public.proposals WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id      := nullif(p_proposal_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_proposal_data ->> 'root_organization_id', '')::uuid;
  v_deal_id     := nullif(p_proposal_data ->> 'deal_id', '')::uuid;
  v_entity_id   := nullif(p_proposal_data ->> 'entity_id', '')::uuid;

  -- ── Authorization parity with proposals UPDATE RLS ────────────────────────
  -- Both gates now allow the record owner through unconditionally, symmetric
  -- with the live RLS policy fixed alongside this migration
  -- (see 20261004010000 change to "Users with permission can update proposals"):
  --
  --   USING (row must be visible to update):
  --       created_by = current_business_user_id()
  --       OR (has proposals.edit AND organization_id IN visible orgs)
  --
  --   WITH CHECK (write is only allowed at all):
  --       created_by = current_business_user_id()
  --       OR (has proposals.edit AND organization_id IN visible orgs)
  --
  -- A non-owner still needs proposals.edit (and org visibility) to update
  -- somebody else's proposal — that path is unchanged.

  -- Gate 1 — USING: evaluated against the EXISTING row (v_before).
  IF NOT (
       v_before.created_by = v_actor
       OR (
         public.has_anew_permission(auth.uid(), 'proposals.edit')
         AND v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       )
     ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 — WITH CHECK: the record owner is sufficient on its own, exactly
  -- like Gate 1. Non-owners still require proposals.edit.
  IF NOT (
       v_before.created_by = v_actor
       OR public.has_anew_permission(auth.uid(), 'proposals.edit')
     ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 (org-scope half of WITH CHECK): the resulting organization_id must be
  -- NULL or within the caller's visible orgs. Applied to the INCOMING org.
  IF v_org_id IS NOT NULL
     AND NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the proposal (identical column set to proposalData in the FE) ──
  UPDATE public.proposals
  SET title                = p_proposal_data ->> 'title',
      description          = nullif(p_proposal_data ->> 'description', ''),
      value                = COALESCE((p_proposal_data ->> 'value')::numeric, 0),
      probability          = COALESCE((p_proposal_data ->> 'probability')::numeric, 50),
      deal_id              = v_deal_id,
      entity_id            = v_entity_id,
      valid_until          = nullif(p_proposal_data ->> 'valid_until', '')::date,
      notes                = nullif(p_proposal_data ->> 'notes', ''),
      stage_id             = nullif(p_proposal_data ->> 'stage_id', '')::uuid,
      status               = COALESCE(nullif(p_proposal_data ->> 'status', ''), 'draft'),
      organization_id      = v_org_id,
      root_organization_id = COALESCE(v_root_org_id, v_org_id),
      template_id          = nullif(p_proposal_data ->> 'template_id', '')::uuid,
      assigned_to          = nullif(p_proposal_data ->> 'assigned_to', '')::uuid
  WHERE id = p_id
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

  -- ── Build the combined diff (only changed proposal columns) ───────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_proposal);
  FOREACH v_key IN ARRAY v_diff_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_prop_diff := v_prop_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  IF v_prop_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('proposals', v_prop_diff);
  END IF;

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
    'UPDATE',
    v_diff,
    'web_app'
  );

  -- Each inline quote created during this save is an independent creation.
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
$$;

REVOKE ALL ON FUNCTION public.rpc_update_proposal(uuid, jsonb, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_proposal(uuid, jsonb, uuid[], jsonb, jsonb, uuid) TO authenticated;

-- ── 2. Live RLS policy: mirror the same owner bypass in WITH CHECK ──────────
-- Was (20260927010000):
--   WITH CHECK (
--     has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
--     AND (organization_id IS NULL OR organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
--   )
-- Now: owner is sufficient on its own, matching USING. Non-owners unchanged.
ALTER POLICY "Users with permission can update proposals" ON public.proposals
  USING (
    created_by = current_business_user_id()
    OR (
      has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
      AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    created_by = current_business_user_id()
    OR (
      has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
      AND (organization_id IS NULL OR organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    )
  );
