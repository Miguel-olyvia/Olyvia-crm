-- ============================================================
-- rpc_reassign_client_contract(...)
-- ============================================================
-- Purpose: fix the dead "Reatribuir comercial" menu item in
-- src/pages/ClientContracts.tsx (draft-status dropdown). client_contracts has
-- no `assigned_to` column — `created_by` (uuid, not null) is the ownership
-- field, and the FE already resolves `assigned_to_name` from it for display
-- (ClientContracts.tsx, "Resolve assigned user names" query).
--
-- Modeled directly on rpc_update_client_contract_status from
-- 20260814010000_client_contracts_audit_bypass_and_rpcs.sql: same guard shape
-- (resolve actor, SELECT current row, has_anew_permission + org-visibility
-- check), single UPDATE, diff-only fn_manual_audit_log call.
--
-- Authorization: scope enforcement (OWNED/TEAM/ORG) is already applied
-- client-side by canEditContract()/editScope in ClientContracts.tsx, exactly
-- like every other mutation in this file. This RPC re-checks the same
-- baseline permission + org-visibility guard as the sibling RPCs
-- (has_anew_permission('client_contracts.edit') + org in
-- get_user_visible_org_ids) — it does not need to duplicate the FE's
-- OWNED/TEAM scope narrowing, since that narrowing only restricts which rows
-- the FE ever shows/targets; the RPC still blocks anyone without the
-- baseline edit permission or visibility into the contract's organization.
-- No validation that p_new_owner_id belongs to any particular org is added
-- here on purpose (YAGNI): the FE only ever offers members of the caller's
-- visible org subtree via its "assignableCompanyUsers"-style picker, and the
-- existing sibling RPCs in this module take the same approach (no FK
-- membership check on any actor/owner argument).

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
-- 1. Caller without 'client_contracts.edit' gets insufficient_privilege:
--      SELECT rpc_reassign_client_contract('<contract-id>', '<some-user-id>');
--
-- 2. Caller with the permission but no visibility into the contract's org
--    also gets insufficient_privilege (org-visibility check runs after the
--    permission check, mirroring rpc_update_client_contract_status).
--
-- 3. A successful reassignment updates created_by and writes exactly ONE
--    'UPDATE' row to entity_audit_log for table_name = 'client_contracts'.
--
-- 4. Calling with p_new_owner_id equal to the current created_by yields ZERO
--    audit rows (diff empty), matching the status-RPC's "skip when nothing
--    changed" behaviour.
