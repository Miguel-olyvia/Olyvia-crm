-- 20270126020000 (auditoria de permissões 23/11, lote Contratos/Portal, A4): rpc_contra_assinar_contrato, modo 'signatario_minuta'
-- (assinar pelo signatário já verificado da minuta, sem SMS), só verificava a organização + client_contracts.send_signature: o
-- comercial B contra-assinava o contrato do comercial A. Passa a pedir também o âmbito de client_contracts.edit sobre o contrato
-- (fn_doc_no_ambito_acao, o critério de âmbito do servidor já usado em rpc_save_quote e no soft delete). O modo 'proprio' (SMS +
-- can_sign_contracts) não muda.
-- Partiu da versão viva (pg_get_functiondef, 23/11) — guarda md5 abaixo. Grants, SECURITY DEFINER e search_path iguais.

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_contra_assinar_contrato(uuid,text)'::regprocedure)) IS DISTINCT FROM '9d1006a822e2ce25b82ba9c7bde873eb' THEN
    RAISE EXCEPTION 'A versão viva de public.rpc_contra_assinar_contrato(uuid,text) mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.rpc_contra_assinar_contrato(p_contract_id uuid, p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_uuid       CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_actor_name text;
  v_c          public.client_contracts;
  v_sig_id     uuid;
  v_sig_name   text;
  v_tpl_sig    text;
  v_otp        uuid;
  v_pode_minuta boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_modo IS NULL OR p_modo NOT IN ('proprio', 'signatario_minuta') THEN
    RAISE EXCEPTION 'Modo de assinatura inválido' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT u.id, u.name INTO v_actor, v_actor_name
  FROM public.anew_users u
  WHERE u.auth_user_id = v_uid AND u.deleted_at IS NULL
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_c FROM public.client_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_c.organization_id IS NULL
     OR NOT (v_c.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_c.deleted_at IS NOT NULL OR v_c.status = 'cancelled' THEN
    RAISE EXCEPTION 'Contrato cancelado ou apagado: não pode ser assinado' USING ERRCODE = 'check_violation';
  END IF;
  IF v_c.company_signature_date IS NOT NULL THEN
    RAISE EXCEPTION 'O contrato já foi assinado pela empresa' USING ERRCODE = 'check_violation';
  END IF;

  IF p_modo = 'proprio' THEN
    IF NOT public.fn_pode_assinar_contratos(v_actor, v_c.organization_id) THEN
      RAISE EXCEPTION 'Não tem poderes para assinar contratos nesta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Consome atomicamente o OTP verificado (o mesmo critério do portal em
    -- client-portal-action: do próprio, verificado há <= 10 min, por consumir).
    UPDATE public.sms_otp_codes o
       SET consumed_at = now()
     WHERE o.id = (
             SELECT s.id
             FROM public.sms_otp_codes s
             WHERE s.reference_type = 'contract_company'
               AND s.reference_id   = p_contract_id
               AND s.purpose        = 'company_signature'
               AND s.auth_user_id   = v_uid
               AND s.verified_at IS NOT NULL
               AND s.verified_at >= now() - interval '10 minutes'
               AND s.consumed_at IS NULL
             ORDER BY s.verified_at DESC
             LIMIT 1
             FOR UPDATE SKIP LOCKED)
       AND o.consumed_at IS NULL
    RETURNING o.id INTO v_otp;

    IF v_otp IS NULL THEN
      RAISE EXCEPTION 'Código SMS não verificado, expirado ou já utilizado. Peça um novo código.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_sig_id   := v_actor;
    v_sig_name := COALESCE(NULLIF(btrim(v_actor_name), ''), 'Representante');

  ELSE -- 'signatario_minuta'
    WITH RECURSIVE orgs(org) AS (
      SELECT v_c.organization_id
      UNION
      SELECT h.parent_org_id FROM public.anew_hierarchy h JOIN orgs o ON h.child_org_id = o.org
    )
    SELECT EXISTS (
      SELECT 1 FROM orgs
      WHERE public.has_anew_permission_in_org(v_uid, 'client_contracts.send_signature', orgs.org)
    ) INTO v_pode_minuta;
    IF NOT v_pode_minuta THEN
      RAISE EXCEPTION 'Sem permissão para assinar pelo signatário da minuta' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 20270126020000: e o âmbito de client_contracts.edit sobre o contrato (fn_doc_no_ambito_acao: o dono e a cadeia do negócio,
    -- TEAM/ORG pelas linhas de âmbito, admins). Sem isto, quem envia contratos contra-assinava o contrato de outro comercial.
    IF NOT public.fn_doc_no_ambito_acao('contract', p_contract_id, 'client_contracts.edit', 'pessoas.edit') THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT lower(btrim(ct.signatory_user_id)) INTO v_tpl_sig
    FROM public.client_contract_templates ct
    WHERE ct.id = v_c.contract_template_id
      AND ct.organization_id = v_c.organization_id;
    IF v_tpl_sig IS NULL OR v_tpl_sig !~ c_uuid THEN
      RAISE EXCEPTION 'Esta minuta ainda não tem um signatário verificado.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT u.id, u.name INTO v_sig_id, v_sig_name
    FROM public.anew_users u
    WHERE u.id = v_tpl_sig::uuid AND u.deleted_at IS NULL;
    IF v_sig_id IS NULL THEN
      RAISE EXCEPTION 'O signatário da minuta já não existe.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.fn_pode_assinar_contratos(v_sig_id, v_c.organization_id) THEN
      RAISE EXCEPTION 'O signatário da minuta já não tem poderes para assinar contratos.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_sig_name := COALESCE(NULLIF(btrim(v_sig_name), ''), 'Representante');
  END IF;

  -- Auditoria: quem executou (não necessariamente o signatário).
  PERFORM set_config('app.audit_user_id', v_actor::text, true);
  PERFORM set_config('app.audit_source', 'ui', true);
  PERFORM set_config('app.contra_assinatura', 'on', true);

  UPDATE public.client_contracts
     SET company_signature_date    = now(),
         company_signed_by_name    = v_sig_name,
         company_signed_by_id      = v_sig_id,
         -- = UNFREEZE_CONTRACT_COLUMNS: a assinatura muda o documento
         contract_body_frozen_html = NULL,
         contract_frozen_at        = NULL
   WHERE id = p_contract_id
  RETURNING * INTO v_c;

  PERFORM set_config('app.contra_assinatura', '', true);

  INSERT INTO public.client_contract_events
    (contract_id, event_type, description, new_values, created_by)
  VALUES
    (p_contract_id,
     'company_signed',
     CASE WHEN p_modo = 'proprio'
          THEN 'Contrato assinado pela empresa (SMS OTP) por ' || v_sig_name
          ELSE 'Contrato assinado pela empresa pelo signatário da minuta (' || v_sig_name || ')' END,
     jsonb_build_object(
       'modo', p_modo,
       'company_signature_date', v_c.company_signature_date,
       'company_signed_by_id', v_sig_id,
       'company_signed_by_name', v_sig_name,
       'executado_por', v_actor,
       'otp_id', v_otp),
     v_actor);

  RETURN jsonb_build_object(
    'contract_id', v_c.id,
    'company_signature_date', v_c.company_signature_date,
    'company_signed_by_id', v_c.company_signed_by_id,
    'company_signed_by_name', v_c.company_signed_by_name);
END;
$function$;

