-- 20270126000000 (auditoria de permissões 23/11, lote Contratos/Portal, C1): anular um contrato pede client_contracts.cancel.
-- cancel_and_replace_contract («Anular contrato» em /client-contracts) e rpc_update_client_contract_status(p_id, 'cancelled') só pediam
-- client_contracts.edit + âmbito: o comercial dono anulava o seu contrato ASSINADO sem a permissão «Anular contratos (enviados ou
-- assinados) e gerar substituição». Passam a pedir também client_contracts.cancel (fn_cat_pode na organização do contrato, a mesma de
-- neg_anular_contrato); o edit e o âmbito ficam iguais.
-- Contratos assinados de um negócio da Emylia (fn_neg_documento_do_fluxo_emylia): recusados aqui e apontados para o Negócio, que é o
-- caminho que verifica as encomendas a fornecedor (NE011) e marca o negócio anulado. Os contratos do CRM (incl. negócios do fecho v4,
-- fluxo_emylia = false) e os rascunhos não mudam.
-- Partiu das versões vivas (pg_get_functiondef, 23/11) — guarda md5 abaixo. Grants, SECURITY DEFINER e search_path iguais.

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.cancel_and_replace_contract(uuid,text,boolean)'::regprocedure)) IS DISTINCT FROM 'bb0ced478d7d453c418fd88a3f74b7a0' THEN
    RAISE EXCEPTION 'A versão viva de public.cancel_and_replace_contract(uuid,text,boolean) mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
  IF md5(pg_get_functiondef('public.rpc_update_client_contract_status(uuid,text)'::regprocedure)) IS DISTINCT FROM 'c5b7fd9678ebab7bcb0ddf1e41fc9732' THEN
    RAISE EXCEPTION 'A versão viva de public.rpc_update_client_contract_status(uuid,text) mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.cancel_and_replace_contract(p_contract_id uuid, p_reason text, p_create_replacement boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_actor uuid := public.resolve_business_user_id(auth.uid());
  v_new_contract_id uuid;
  -- 20270110400000
  v_scope        text;
  v_team_ids     uuid[];
  v_eu           uuid;
  v_created_by   uuid;
  v_assigned     uuid;
BEGIN
  SELECT organization_id, status, deleted_at
  INTO v_org_id, v_status, v_deleted_at
  FROM public.client_contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  -- 20270126000000: anular pede client_contracts.cancel na organização do contrato («Anular contratos (enviados ou assinados) e gerar
  -- substituição»), como neg_anular_contrato. O edit e o âmbito abaixo ficam como estavam.
  IF NOT public.fn_cat_pode(v_org_id, 'client_contracts.cancel') THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  -- 20270110400000: o âmbito de client_contracts.edit sobre o contrato, o mesmo bloco de rpc_update_client_contract
  -- (_client_contracts_effective_edit_scope; dono = created_by OU assigned_to, como canActOnContract no ecrã).
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_org_id);
  v_eu := public.current_business_user_id();
  SELECT created_by, assigned_to INTO v_created_by, v_assigned
  FROM public.client_contracts WHERE id = p_contract_id;

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'insufficient_permission';
  ELSIF v_scope = 'OWNED' THEN
    IF v_eu IS DISTINCT FROM v_created_by AND v_eu IS DISTINCT FROM v_assigned THEN
      RAISE EXCEPTION 'insufficient_permission';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_eu IS DISTINCT FROM v_created_by AND v_eu IS DISTINCT FROM v_assigned
       AND NOT (v_created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[])))
       AND NOT (v_assigned = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'insufficient_permission';
    END IF;
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contract_already_deleted';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'contract_already_cancelled';
  END IF;

  IF v_status NOT IN ('signed', 'active', 'draft') THEN
    RAISE EXCEPTION 'contract_not_cancellable';
  END IF;

  -- 20270126000000: um contrato assinado de um negócio da Emylia anula-se no Negócio (neg_anular_contrato: verifica as encomendas a
  -- fornecedor já encomendadas, NE011, e marca o negócio anulado/perdido). Daqui não passa.
  IF v_status IN ('signed', 'active') AND EXISTS (
       SELECT 1 FROM public.client_contracts c
       WHERE c.id = p_contract_id AND public.fn_neg_documento_do_fluxo_emylia(c.negocio_id, c.adenda_id, c.quote_id)) THEN
    RAISE EXCEPTION 'contract_in_negocio';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.client_contracts
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      status_changed_by = v_actor,
      status_changed_at = now()
  WHERE id = p_contract_id;

  IF p_create_replacement THEN
    INSERT INTO public.client_contracts (
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, status, contract_body_html,
      replaces_contract_id, created_by
    )
    SELECT
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, 'draft', NULL,
      id, v_actor
    FROM public.client_contracts
    WHERE id = p_contract_id
    RETURNING id INTO v_new_contract_id;

    UPDATE public.client_contracts
    SET replaced_by_contract_id = v_new_contract_id
    WHERE id = p_contract_id;

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object('replacement_contract_id', v_new_contract_id),
      v_actor
    );

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      v_new_contract_id, 'contract_replaced', 'Contrato de substituicao criado',
      jsonb_build_object('replaces_contract_id', p_contract_id),
      v_actor
    );
  ELSE
    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object('replacement_contract_id', NULL),
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'cancelled_contract_id', p_contract_id,
    'replacement_contract_id', v_new_contract_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_client_contract_status(p_id uuid, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 20270123000000 início (auditoria 19/11): num negócio da Emylia só o cliente assina, no portal (service_role); daqui não passa
  --   a signed / active / assinado. As outras mudanças de estado ficam como estavam.
  IF p_status IN ('signed', 'active', 'assinado') AND EXISTS (
       SELECT 1 FROM public.client_contracts c
       WHERE c.id = p_id AND c.status IS DISTINCT FROM p_status
         AND public.fn_neg_documento_do_fluxo_emylia(c.negocio_id, c.adenda_id, c.quote_id)) THEN
    RAISE EXCEPTION 'Só o cliente assina o contrato, no portal: num negócio da Emylia o contrato não passa a assinado por aqui.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270123000000 fim
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

  -- 20270126000000 início: passar a cancelled (anular) pede client_contracts.cancel na organização do contrato, como
  --   cancel_and_replace_contract e neg_anular_contrato; um contrato assinado de um negócio da Emylia anula-se no Negócio.
  IF p_status = 'cancelled' AND v_before.status IS DISTINCT FROM 'cancelled' THEN
    IF NOT public.fn_cat_pode(v_before.organization_id, 'client_contracts.cancel') THEN
      RAISE EXCEPTION 'Sem permissão para anular contratos (client_contracts.cancel)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.status IN ('signed', 'active', 'assinado')
       AND public.fn_neg_documento_do_fluxo_emylia(v_before.negocio_id, v_before.adenda_id, v_before.quote_id) THEN
      RAISE EXCEPTION 'Este contrato é de um negócio: anula-se no Negócio («Anular contrato»), que verifica as encomendas a fornecedor.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- 20270126000000 fim

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
$function$;

