-- Align client_contracts EDIT scope with the VIEW scope's own ownership
-- union (created_by OR assigned_to), and close rpc_update_client_contract's
-- ownership gap -- the third write RPC left with the original hole.
-- 2026-08-29 | Module: Contratos — client_contracts
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration (20261115110000, 20261115120000 in particular --
-- this migration only adds REPLACEs on top of them).
--
-- Product decision this migration encodes
-- --------------------------------------------------------------
-- A contract ASSIGNED to someone (client_contracts.assigned_to) who did not
-- CREATE it (client_contracts.created_by) is already VISIBLE to that person
-- in the Contratos list -- src/lib/contracts/scope.ts's
-- resolveContractsScopeUserIds and the list query both apply the union
-- `created_by OR assigned_to` for client_contracts.view. Reassignment,
-- however, only ever granted VIEW access: EDIT (client_contracts.edit,
-- canActOnEntity in usePermissionScope.ts, keyed on created_by alone) still
-- refused every action for the new assignee. The product owner decided to
-- align: whoever has a contract assigned to them can now act on it, exactly
-- like whoever created it.
--
-- Measured against the remote (2026-08-29): 14 of 90 client_contracts rows
-- have assigned_to <> created_by (10 in a test organization, 4 in nike,
-- which holds real customer data) -- 9 of those 14 are not yet signed, i.e.
-- 9 real cases of "sees it as theirs in the CRM, cannot sign it".
--
-- What changed, in order (FE first, so the RPCs never grant more than the
-- UI already offers):
--   1. src/pages/ClientContracts.tsx's canEditContract now calls the new
--      contracts-only src/lib/contracts/scope.ts#canActOnContract (created_by
--      OR assigned_to), instead of the shared canActOnEntity (created_by
--      only). canActOnEntity itself is UNCHANGED -- it is shared with leads,
--      proposals and quotes, none of which were asked to change.
--   2. This migration widens the SAME predicate, symmetrically, in the three
--      SECURITY DEFINER RPCs that already enforce (or, for #3, never
--      enforced) an ownership gate on client_contracts writes:
--        a. rpc_update_client_contract_status (20261115110000)
--        b. rpc_reassign_client_contract (20261115120000)
--        c. rpc_update_client_contract (20260814010000) -- this one had NO
--           ownership gate at all until now: only has_anew_permission(...)
--           + org-visibility, confirmed by reading the migration that
--           created it, exactly like 20261115110000/20261115120000 confirmed
--           for their own RPCs before they were fixed. This is the generic
--           contract editor (template, dates, notes, payment terms) and was
--           flagged, unfixed, in 20261115110000/20261115120000's own
--           "NOT fixed by this migration" follow-up notes -- this migration
--           closes it, using the exact same _client_contracts_effective_edit_scope
--           helper those two already introduced/reused, no new helper needed.
--
-- _client_contracts_effective_edit_scope (20261115110000) is UNCHANGED here:
-- it only resolves the scope LEVEL (NONE/OWNED/TEAM/ORG), which does not
-- depend on assigned_to at all. Only the per-row ownership PREDICATE each
-- RPC applies on top of that scope level is widened, from
-- `v_before.created_by = v_actor` to
-- `v_actor IN (v_before.created_by, v_before.assigned_to)` (and the TEAM
-- variant analogously). This mirrors, column for column, the widening
-- resolveContractsScopeUserIds already applies for the LIST's view scope.
--
-- Prerequisites:
--   20260814010000_client_contracts_audit_bypass_and_rpcs.sql — creates
--     rpc_update_client_contract (no ownership gate, being added here).
--   20261115110000_client_contract_status_scope_ownership.sql — creates
--     _client_contracts_effective_edit_scope, reused unchanged; most recent
--     prior REPLACE of rpc_update_client_contract_status.
--   20261115120000_client_contract_reassign_scope_ownership.sql — most
--     recent prior REPLACE of rpc_reassign_client_contract.

-- ============================================================
-- 1. rpc_update_client_contract_status — widen ownership predicate
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_update_client_contract_status(
  p_id     uuid,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid                    uuid := auth.uid();
  v_actor                  uuid;
  v_actor_name             text;
  v_before                 public.client_contracts;
  v_contract               public.client_contracts;
  v_diff                   jsonb;
  v_client_already_signed  boolean;
  v_record_company_signature boolean;
  v_scope                  text;
  v_team_ids               uuid[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.client_contracts WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with client_contracts_update RLS ────────────────
  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ownership gate — mirrors canEditContract/canActOnContract exactly ────
  -- (src/lib/contracts/scope.ts). ORG: no further restriction. TEAM/OWNED:
  -- the contract must have been CREATED by the caller OR ASSIGNED to the
  -- caller (TEAM: or created-by/assigned-to one of the teams the caller
  -- leads). NONE cannot reach here (has_anew_permission above already
  -- rejects it in practice, but is treated explicitly for clarity and
  -- defense-in-depth).
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_before.organization_id);

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  ELSIF v_scope = 'OWNED' THEN
    IF v_actor IS DISTINCT FROM v_before.created_by AND v_actor IS DISTINCT FROM v_before.assigned_to THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_actor IS DISTINCT FROM v_before.created_by AND v_actor IS DISTINCT FROM v_before.assigned_to
       AND NOT (v_before.created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[])))
       AND NOT (v_before.assigned_to = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- ORG: allowed, no additional restriction.

  -- ── Decide whether this transition counts as an internal (CRM) acceptance ──
  -- Only when entering signed/active, and only when the client has not
  -- already signed (client proof columns all null). Never overwrite an
  -- existing client signature or an existing internal-acceptance record.
  v_client_already_signed := (
    v_before.signature_ip IS NOT NULL
    OR v_before.signature_date IS NOT NULL
    OR v_before.signed_by_name IS NOT NULL
  );
  v_record_company_signature :=
    p_status IN ('signed', 'active')
    AND NOT v_client_already_signed;

  IF v_record_company_signature THEN
    SELECT name INTO v_actor_name FROM public.anew_users WHERE id = v_actor;

    UPDATE public.client_contracts
    SET status                  = p_status,
        status_changed_by       = v_actor,
        status_changed_at       = now(),
        company_signature_date  = now(),
        company_signed_by_name  = COALESCE(v_actor_name, 'Utilizador'),
        company_signed_by_id    = v_actor
    WHERE id = p_id
    RETURNING * INTO v_contract;
  ELSE
    -- ── UPDATE status (identical column set to the original handleStatusChange) ──
    UPDATE public.client_contracts
    SET status            = p_status,
        status_changed_by = v_actor,
        status_changed_at = now()
    WHERE id = p_id
    RETURNING * INTO v_contract;
  END IF;

  -- ── Build the diff — only for columns that actually changed ───────────────
  v_diff := '{}'::jsonb;
  IF v_before.status IS DISTINCT FROM v_contract.status THEN
    v_diff := v_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_contract.status)));
    v_diff := v_diff || jsonb_build_object('status_changed_by',
      jsonb_build_object('old', to_jsonb(v_before.status_changed_by), 'new', to_jsonb(v_contract.status_changed_by)));
  END IF;
  IF v_before.company_signed_by_id IS DISTINCT FROM v_contract.company_signed_by_id THEN
    v_diff := v_diff || jsonb_build_object('company_signed_by_id',
      jsonb_build_object('old', to_jsonb(v_before.company_signed_by_id), 'new', to_jsonb(v_contract.company_signed_by_id)));
    v_diff := v_diff || jsonb_build_object('company_signature_date',
      jsonb_build_object('old', to_jsonb(v_before.company_signature_date), 'new', to_jsonb(v_contract.company_signature_date)));
    v_diff := v_diff || jsonb_build_object('company_signed_by_name',
      jsonb_build_object('old', to_jsonb(v_before.company_signed_by_name), 'new', to_jsonb(v_contract.company_signed_by_name)));
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE', jsonb_build_object('client_contracts', v_diff), 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;

-- Signature is unchanged (p_id uuid, p_status text) — grants already in place
-- from 20260814010000 are preserved by CREATE OR REPLACE; no re-grant needed.

-- ============================================================
-- 2. rpc_reassign_client_contract — widen ownership predicate
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_reassign_client_contract(
  p_id           uuid,
  p_new_owner_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_actor            uuid;
  v_before           public.client_contracts;
  v_contract         public.client_contracts;
  v_diff             jsonb;
  v_new_owner_auth   uuid;
  v_scope            text;
  v_team_ids         uuid[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF p_new_owner_id IS NULL THEN
    RAISE EXCEPTION 'Novo responsável não indicado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.client_contracts WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with client_contracts_update RLS ────────────────
  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ownership gate — mirrors canEditContract/canActOnContract exactly ────
  -- (src/lib/contracts/scope.ts), identical widening to the one applied to
  -- rpc_update_client_contract_status above. ORG: no further restriction.
  -- TEAM/OWNED: the contract being reassigned must have been CREATED by the
  -- caller OR currently ASSIGNED to the caller (TEAM: or created-by/
  -- assigned-to one of the teams the caller leads). NONE cannot reach here
  -- (has_anew_permission above already rejects it in practice, but is
  -- treated explicitly for clarity and defense-in-depth).
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_before.organization_id);

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  ELSIF v_scope = 'OWNED' THEN
    IF v_actor IS DISTINCT FROM v_before.created_by AND v_actor IS DISTINCT FROM v_before.assigned_to THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_actor IS DISTINCT FROM v_before.created_by AND v_actor IS DISTINCT FROM v_before.assigned_to
       AND NOT (v_before.created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[])))
       AND NOT (v_before.assigned_to = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- ORG: allowed, no additional restriction.

  -- ── New owner must be a real, active user whose OWN visibility scope
  -- covers the contract's organization (unchanged from 20261021010000) ─────
  SELECT au.auth_user_id INTO v_new_owner_auth
  FROM public.anew_users au
  JOIN public.anew_memberships am
    ON am.user_id = au.id
   AND am.status = 'active'
  WHERE au.id = p_new_owner_id
  LIMIT 1;

  IF v_new_owner_auth IS NULL THEN
    RAISE EXCEPTION 'Novo responsável não é um utilizador ativo' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_new_owner_auth)) THEN
    RAISE EXCEPTION 'Novo responsável não tem visibilidade sobre esta organização' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── UPDATE ownership (created_by is the ownership column; reassignment
  -- itself is UNCHANGED by this migration -- it still only sets created_by,
  -- exactly as before. Widening the READ-side ownership PREDICATE above does
  -- not touch what a successful reassignment writes.) ──────────────────────
  UPDATE public.client_contracts
  SET created_by = p_new_owner_id
  WHERE id = p_id
  RETURNING * INTO v_contract;

  -- ── Build the diff — only when the owner actually changed ────────────────
  IF v_before.created_by IS DISTINCT FROM v_contract.created_by THEN
    v_diff := jsonb_build_object(
      'client_contracts', jsonb_build_object(
        'created_by', jsonb_build_object(
          'old', to_jsonb(v_before.created_by), 'new', to_jsonb(v_contract.created_by))
      )
    );

    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;

-- Signature is unchanged (p_id uuid, p_new_owner_id uuid) — grants already
-- in place from 20261015020000 are preserved by CREATE OR REPLACE; no
-- re-grant needed.

-- ============================================================
-- 3. rpc_update_client_contract — ADD the ownership gate (had none)
-- ============================================================
-- Confirmed by reading 20260814010000: this RPC only checked
-- has_anew_permission('client_contracts.edit') + org visibility -- no
-- ownership predicate at all, unlike its two siblings above (which at least
-- had a created_by-only gate before this migration). This is the generic
-- contract editor invoked by ClientContracts.tsx's updateMutation
-- (template_id, dates, notes, payment_terms, prompt_values) -- gated
-- client-side by the SAME canEditContract check as handleFinalize/
-- handleStatusChange/handleOpenReassign (see handleDialogSave in
-- ClientContracts.tsx), so it needs the identical server-side gate.
CREATE OR REPLACE FUNCTION public.rpc_update_client_contract(
  p_id                    uuid,
  p_contract_template_id  uuid,
  p_start_date            date,
  p_end_date              date,
  p_notes                 text,
  p_payment_terms         text,
  p_prompt_values         jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_before       public.client_contracts;
  v_contract     public.client_contracts;
  v_existing_pv  jsonb;
  v_merged_pv    jsonb;
  v_diff         jsonb;
  v_scope        text;
  v_team_ids     uuid[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + the prompt_values merge) ──
  SELECT * INTO v_before FROM public.client_contracts WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with client_contracts_update RLS ────────────────
  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ownership gate — mirrors canEditContract/canActOnContract exactly ────
  -- (src/lib/contracts/scope.ts), reusing _client_contracts_effective_edit_scope
  -- exactly like rpc_update_client_contract_status and
  -- rpc_reassign_client_contract above. This RPC had NO such gate before
  -- this migration.
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_before.organization_id);

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  ELSIF v_scope = 'OWNED' THEN
    IF v_actor IS DISTINCT FROM v_before.created_by AND v_actor IS DISTINCT FROM v_before.assigned_to THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_actor IS DISTINCT FROM v_before.created_by AND v_actor IS DISTINCT FROM v_before.assigned_to
       AND NOT (v_before.created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[])))
       AND NOT (v_before.assigned_to = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- ORG: allowed, no additional restriction.

  -- ── Merge prompt_values (mirrors FE mergedPromptValues, lines 738-743) ────
  v_existing_pv := CASE
    WHEN v_before.prompt_values IS NOT NULL
         AND jsonb_typeof(v_before.prompt_values) = 'object'
    THEN v_before.prompt_values
    ELSE '{}'::jsonb
  END;

  IF p_prompt_values IS NOT NULL
     AND jsonb_typeof(p_prompt_values) = 'object'
     AND p_prompt_values <> '{}'::jsonb THEN
    v_merged_pv := v_existing_pv || p_prompt_values;
  ELSE
    v_merged_pv := v_existing_pv;
  END IF;

  -- ── UPDATE the contract (identical column set to updatePayload) ───────────
  UPDATE public.client_contracts
  SET contract_template_id = p_contract_template_id,
      start_date           = p_start_date,
      end_date             = p_end_date,
      notes                = nullif(p_notes, ''),
      payment_terms        = nullif(p_payment_terms, ''),
      prompt_values        = CASE WHEN v_merged_pv <> '{}'::jsonb THEN v_merged_pv END
  WHERE id = p_id
  RETURNING * INTO v_contract;

  -- ── Build the diff (only changed columns) ─────────────────────────────────
  v_diff := '{}'::jsonb;
  IF v_before.contract_template_id IS DISTINCT FROM v_contract.contract_template_id THEN
    v_diff := v_diff || jsonb_build_object('contract_template_id',
      jsonb_build_object('old', to_jsonb(v_before.contract_template_id), 'new', to_jsonb(v_contract.contract_template_id)));
  END IF;
  IF v_before.start_date IS DISTINCT FROM v_contract.start_date THEN
    v_diff := v_diff || jsonb_build_object('start_date',
      jsonb_build_object('old', to_jsonb(v_before.start_date), 'new', to_jsonb(v_contract.start_date)));
  END IF;
  IF v_before.end_date IS DISTINCT FROM v_contract.end_date THEN
    v_diff := v_diff || jsonb_build_object('end_date',
      jsonb_build_object('old', to_jsonb(v_before.end_date), 'new', to_jsonb(v_contract.end_date)));
  END IF;
  IF v_before.notes IS DISTINCT FROM v_contract.notes THEN
    v_diff := v_diff || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before.notes), 'new', to_jsonb(v_contract.notes)));
  END IF;
  IF v_before.payment_terms IS DISTINCT FROM v_contract.payment_terms THEN
    v_diff := v_diff || jsonb_build_object('payment_terms',
      jsonb_build_object('old', to_jsonb(v_before.payment_terms), 'new', to_jsonb(v_contract.payment_terms)));
  END IF;
  IF v_before.prompt_values IS DISTINCT FROM v_contract.prompt_values THEN
    v_diff := v_diff || jsonb_build_object('prompt_values',
      jsonb_build_object('old', to_jsonb(v_before.prompt_values), 'new', to_jsonb(v_contract.prompt_values)));
  END IF;

  -- Emit a single UPDATE log row only when something meaningful changed
  -- (matches the "skip when nothing changed" behaviour of the triggers).
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE',
      jsonb_build_object('client_contracts', v_diff), 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;

-- Signature is unchanged (7 params, same order/types) — grants already in
-- place from 20260814010000 are preserved by CREATE OR REPLACE; no re-grant
-- needed.

-- ============================================================
-- Verification
-- ============================================================
-- tests/e2e/contracts/status-scope-ownership.spec.ts — extended with a
--   "created by A, assigned to B" case per RPC (status, reassign, update).
-- tests/e2e/contracts/reassign-scope-ownership.spec.ts — same.
-- tests/e2e/contracts/update-contract-scope-ownership.spec.ts — new spec for
--   rpc_update_client_contract, mirroring the sibling specs' ORG/OWNED/TEAM
--   shape plus the assigned-to case.
