-- ============================================================
-- Fix: 20261020010000_reassign_client_contract_owner_validation.sql added a
-- new-owner validation to rpc_reassign_client_contract, but it required an
-- EXACT organization_id match (am.organization_id = v_before.organization_id).
-- The frontend's own "Reatribuir comercial" picker (src/pages/
-- ClientContracts.tsx companyUsers query) and the caller's own org-visibility
-- check two lines above (get_user_visible_org_ids) both resolve across the
-- FULL org hierarchy/subtree (ancestors + descendants + associations) for a
-- hierarchical-org product like this one -- not just the exact org. The
-- exact-match check therefore wrongly rejects a legitimate FE-offered
-- candidate (e.g. a member of a parent or descendant org in the same
-- subtree) with "Novo responsável não é um membro ativo desta organização",
-- a regression versus the pre-fix behavior for any org with a hierarchy.
--
-- Fix (forward-only; CREATE OR REPLACE, 20261020010000 is not edited):
-- resolve the new owner's own auth_user_id, then check that the contract's
-- organization_id is inside get_user_visible_org_ids() for THAT user --
-- i.e. reuse the exact same hierarchy-aware visibility rule already applied
-- to the caller, just evaluated for the new owner. No new subtree-walking
-- logic is introduced.
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

  -- ── New owner must be a real, active user whose OWN visibility scope
  -- covers the contract's organization (same hierarchy-aware rule as the
  -- caller's own check above, evaluated for the new owner instead) ────────
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

REVOKE ALL ON FUNCTION public.rpc_reassign_client_contract(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_client_contract(uuid, uuid) TO authenticated;
