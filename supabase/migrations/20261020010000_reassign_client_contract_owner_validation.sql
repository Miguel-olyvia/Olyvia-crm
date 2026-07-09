-- ============================================================
-- Fix: rpc_reassign_client_contract(p_id, p_new_owner_id) — added in
-- 20261015020000_client_contracts_reassign_rpc.sql — never validated that
-- p_new_owner_id refers to a real, org-visible anew_users row before writing
-- it into client_contracts.created_by (NOT NULL, no FK constraint on this
-- column).
--
-- created_by drives assigned_to_name resolution, the "Só os meus" filter and
-- OWNED/TEAM scope checks throughout src/pages/ClientContracts.tsx and the
-- sibling scope-aware RPCs. Any caller holding only the baseline
-- 'client_contracts.edit' permission (and visibility into the contract's
-- org) could call this RPC directly — bypassing whatever assignable-user
-- picker the UI offers — and set created_by to an arbitrary or
-- non-existent UUID, corrupting ownership resolution for that contract.
--
-- Fix (forward-only; CREATE OR REPLACE on the existing function signature,
-- 20261015020000 is not edited): require that p_new_owner_id is an active
-- anew_users.id with an active anew_memberships row in the contract's own
-- organization_id, mirroring the anew_users/anew_memberships pattern used by
-- get_proposal_edit_scope / can_write_proposal_row
-- (20261006010000_fix_proposal_scope_org_leak_and_ownership_spoofing.sql).
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
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_before    public.client_contracts;
  v_contract  public.client_contracts;
  v_diff      jsonb;
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

  -- ── NEW: p_new_owner_id must be a real, active member of the contract's
  -- own organization — closes the ownership-spoofing / corruption vector
  -- described above. Mirrors the anew_users/anew_memberships EXISTS pattern
  -- used elsewhere in this codebase (e.g. get_proposal_edit_scope).
  IF NOT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
     AND am.organization_id = v_before.organization_id
    WHERE au.id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'Novo responsável não é um membro ativo desta organização' USING ERRCODE = 'invalid_parameter_value';
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

REVOKE ALL ON FUNCTION public.rpc_reassign_client_contract(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_client_contract(uuid, uuid) TO authenticated;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. p_new_owner_id = NULL still raises invalid_parameter_value (unchanged).
--
-- 2. p_new_owner_id = a random/non-existent UUID now raises
--    invalid_parameter_value ("Novo responsável não é um membro ativo desta
--    organização") instead of silently corrupting created_by.
--
-- 3. p_new_owner_id = a real anew_users.id but with no active membership in
--    the contract's organization_id (e.g. member of a different org, or
--    membership status != 'active') is also rejected.
--
-- 4. p_new_owner_id = a real, active member of the contract's organization
--    still succeeds exactly as before: created_by is updated and exactly ONE
--    'UPDATE' row is written to entity_audit_log when the owner actually
--    changed.
--
-- 5. Permission and org-visibility checks (steps already present in
--    20261015020000) still run, and still run BEFORE this new membership
--    check, preserving their existing error precedence.
