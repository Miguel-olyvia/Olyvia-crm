-- TEMPORARY, throwaway migration used ONLY to demonstrate RED against the
-- remote before re-applying 20261115130000's fix in the very next migration
-- (20261115150000). Restores the exact pre-20261115130000 function bodies
-- (created_by-only ownership predicate, and no ownership gate at all for
-- rpc_update_client_contract) so the new assigned_to-focused e2e tests can be
-- shown failing live, per the task's "demonstração do vermelho" requirement.
-- Forward-only: this does not edit 20261115130000 or any earlier migration,
-- it is itself a new file; 20261115150000 immediately restores the fixed
-- behaviour as another new forward migration. No functional net effect is
-- meant to survive past 20261115150000.

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

  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

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
    UPDATE public.client_contracts
    SET status            = p_status,
        status_changed_by = v_actor,
        status_changed_at = now()
    WHERE id = p_id
    RETURNING * INTO v_contract;
  END IF;

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

  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

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

  UPDATE public.client_contracts
  SET created_by = p_new_owner_id
  WHERE id = p_id
  RETURNING * INTO v_contract;

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

  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

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

  UPDATE public.client_contracts
  SET contract_template_id = p_contract_template_id,
      start_date           = p_start_date,
      end_date             = p_end_date,
      notes                = nullif(p_notes, ''),
      payment_terms        = nullif(p_payment_terms, ''),
      prompt_values        = CASE WHEN v_merged_pv <> '{}'::jsonb THEN v_merged_pv END
  WHERE id = p_id
  RETURNING * INTO v_contract;

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

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE',
      jsonb_build_object('client_contracts', v_diff), 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;
