-- rpc_reassign_client_contract: enforce OWNED/TEAM ownership, not just org
-- visibility + baseline permission.
-- 2026-11-15 | Module: Contratos — client_contracts
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration (20261015020000, 20261020010000, 20261021010000
-- in particular — this migration only adds a REPLACE on top of them).
--
-- Problem this migration solves — confirmed live against the remote (nike
-- org), same shape as 20261115110000_client_contract_status_scope_ownership.sql
-- --------------------------------------------------------------
-- rpc_reassign_client_contract (created 20261015020000, extended by
-- 20261020010000/20261021010000 to validate the NEW owner) authorizes the
-- CALLER with exactly:
--   1. has_anew_permission(v_uid, 'client_contracts.edit')
--   2. the contract's organization_id is in get_user_visible_org_ids(v_uid)
-- Neither checks WHO created the contract being reassigned. Its own header
-- explicitly (and, per this migration, incorrectly) assumed "scope
-- enforcement (OWNED/TEAM/ORG) is already applied client-side ... it does
-- not need to duplicate the FE's OWNED/TEAM scope narrowing" — the same
-- assumption 20261115110000 already disproved for the sibling status RPC.
-- Reproduced against the remote with a fresh reassign-scope-ownership.spec.ts
-- (tests/e2e/contracts/): a user restricted to OWNED scope (role
-- qa_e2e_contract_signer_owned_scope — client_contracts.edit + .view, no
-- scope override) — who cannot even see a colleague's contract in the CRM
-- list — could still call rpc_reassign_client_contract directly with that
-- colleague's contract id and reassign it to themselves; a TEAM-scoped
-- leader could reassign a contract belonging to someone outside their team.
--
-- The rule this migration applies is the exact same one 20261115110000
-- documented and reused here verbatim — the gate ClientContracts.tsx
-- applies before even showing the "Reatribuir comercial" menu item
-- (handleOpenReassign -> canEditContract(contract), which is
-- canActOnEntity(editScope, contract, ...) keyed on client_contracts.edit):
--
--   NONE  -> reject
--   ORG   -> allow
--   TEAM  -> allow iff contract.created_by = caller OR contract.created_by IN teamMemberIds
--   OWNED -> allow iff contract.created_by = caller
--
-- Reuses public._client_contracts_effective_edit_scope(organization_id),
-- created by 20261115110000 specifically so future client_contracts write
-- RPCs would not re-derive this decision — do not duplicate it here.
--
-- Scope is resolved against v_before.organization_id (the CONTRACT's own
-- org, the row being reassigned), exactly like the status RPC and exactly
-- like the org-visibility check two lines above it in this same function.
--
-- What this migration does NOT touch: the p_new_owner_id validation added by
-- 20261020010000/20261021010000 (new-owner must be a real, active member
-- whose own visibility covers the contract's org) is orthogonal — it guards
-- against corrupting created_by with a bogus value, not against the CALLER
-- acting outside their own scope. Both checks are needed and are independent
-- of each other; this migration only adds the missing caller-side ownership
-- gate, unchanged everything else.
--
-- Prerequisites:
--   20261015020000_client_contracts_reassign_rpc.sql — creates
--     rpc_reassign_client_contract.
--   20261021010000_fix_reassign_contract_owner_hierarchy_check.sql — most
--     recent prior REPLACE of this function (new-owner hierarchy fix).
--   20261115110000_client_contract_status_scope_ownership.sql — creates
--     public._client_contracts_effective_edit_scope, reused here.

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

  -- ── Ownership gate — mirrors canEditContract/canActOnEntity exactly ──────
  -- (usePermissionScope.ts), identical to the gate 20261115110000 added to
  -- rpc_update_client_contract_status. ORG: no further restriction.
  -- TEAM/OWNED: the contract being reassigned must have been created by the
  -- caller (TEAM: or by one of the teams the caller leads). NONE cannot
  -- reach here (has_anew_permission above already rejects it in practice,
  -- but is treated explicitly for clarity and defense-in-depth).
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_before.organization_id);

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  ELSIF v_scope = 'OWNED' THEN
    IF v_before.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_before.created_by IS DISTINCT FROM v_actor
       AND NOT (v_before.created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
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

  -- ── UPDATE ownership (created_by is the ownership/"assigned to" column) ──
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
-- Verification (tests/e2e/contracts/reassign-scope-ownership.spec.ts)
-- ============================================================
-- 1. ORG scope (admin): still reassigns any contract in the org.
-- 2. OWNED scope: reassigns own contract; REJECTED (insufficient_privilege,
--    "âmbito") reassigning a colleague's contract.
-- 3. TEAM scope: leader reassigns a team member's contract; REJECTED
--    reassigning an outsider's contract.
-- 4. New-owner validation (20261020010000/20261021010000) untouched and
--    still runs after the ownership gate.
