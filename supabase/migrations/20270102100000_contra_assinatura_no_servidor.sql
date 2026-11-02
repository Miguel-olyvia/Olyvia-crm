-- ============================================================
-- 20270102100000_contra_assinatura_no_servidor
-- ============================================================
-- O que faz
--   1. fn_pode_assinar_contratos(user, org): o utilizador (anew_users.id) tem
--      membership ativa (não-cliente) num papel não apagado com
--      can_sign_contracts = true na organização indicada OU numa organização
--      ascendente (anew_hierarchy). Só para uso interno (sem EXECUTE para
--      authenticated/anon).
--   2. rpc_contra_assinar_contrato(p_contract_id, p_modo): a contra-assinatura
--      da empresa passa a ser decidida no servidor.
--        'proprio'           -> exige um OTP em sms_otp_codes
--                               (reference_type 'contract_company',
--                               purpose 'company_signature', do próprio
--                               auth.uid(), verificado há <= 10 min e por
--                               consumir), consome-o atomicamente e exige que
--                               quem assina tenha can_sign_contracts na org do
--                               contrato ou numa ascendente. Grava o próprio.
--        'signatario_minuta' -> sem SMS (decisão "opção a"): exige
--                               client_contracts.send_signature na org do
--                               contrato (ou ascendente) e grava o signatário
--                               da minuta do contrato (contract_template_id),
--                               que tem de continuar a ter can_sign_contracts.
--      Em ambos: contrato visível (get_user_crm_org_ids), não apagado, não
--      cancelado e ainda sem company_signature_date. Descongela o documento
--      (= UNFREEZE_CONTRACT_COLUMNS do frontend), põe o contexto de auditoria
--      (app.audit_user_id = quem executou) e regista um evento
--      'company_signed' em client_contract_events.
--   3. Trigger trg_contracts_00_guarda_contra_assinatura (BEFORE INSERT OR
--      UPDATE em client_contracts): recusa a authenticated/anon escrever
--      company_signature_date / company_signed_by_id / company_signed_by_name
--      diretamente. Passam: a RPC (app.contra_assinatura = 'on' e corre como
--      definer), qualquer função SECURITY DEFINER (current_user = dono, p.ex.
--      rpc_update_client_contract_status), service_role e postgres.
--      O nome ordena-o ANTES de trg_negocios_30_pre_assinar: a pré-assinatura
--      do negócio (fn_neg_contrato_pre_assinar, definer) preenche as colunas
--      depois da guarda e continua a funcionar quando o utilizador muda a
--      minuta ou insere um contrato.
--
-- Quem escrevia estas colunas (verificado no código e nas funções vivas)
--   - ContractBodyTab.tsx (UPDATE direto)          -> passa a usar a RPC
--   - fn_neg_contrato_pre_assinar (trigger definer) -> corre depois da guarda
--   - rpc_update_client_contract_status (definer)   -> current_user = postgres
--   - edges: nenhuma escreve estas colunas
--
-- Sem tabelas nem colunas novas.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Quem pode assinar contratos numa organização ----------------------------
CREATE OR REPLACE FUNCTION public.fn_pode_assinar_contratos(p_user_id uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE orgs(org) AS (
    SELECT p_org
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN orgs o ON h.child_org_id = o.org
  )
  SELECT p_user_id IS NOT NULL AND p_org IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.anew_memberships m
    JOIN public.anew_roles r ON r.id = m.role_id
    WHERE m.user_id = p_user_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
      AND r.can_sign_contracts = true
      AND r.deleted_at IS NULL
      AND m.organization_id IN (SELECT org FROM orgs)
  )
$$;

REVOKE ALL ON FUNCTION public.fn_pode_assinar_contratos(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2. A RPC -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_contra_assinar_contrato(p_contract_id uuid, p_modo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.rpc_contra_assinar_contrato(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_contra_assinar_contrato(uuid, text) TO authenticated;

-- 3. Guarda das colunas de contra-assinatura ----------------------------------
-- SECURITY INVOKER de propósito: current_user é quem escreve (authenticated
-- num UPDATE direto via PostgREST; o dono numa função SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.fn_contrato_guarda_contra_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR COALESCE(current_setting('app.contra_assinatura', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.company_signature_date IS NOT NULL
       OR NEW.company_signed_by_id IS NOT NULL
       OR NEW.company_signed_by_name IS NOT NULL THEN
      RAISE EXCEPTION 'A assinatura da empresa só pode ser registada pela contra-assinatura (rpc_contra_assinar_contrato)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.company_signature_date IS DISTINCT FROM OLD.company_signature_date
     OR NEW.company_signed_by_id   IS DISTINCT FROM OLD.company_signed_by_id
     OR NEW.company_signed_by_name IS DISTINCT FROM OLD.company_signed_by_name THEN
    RAISE EXCEPTION 'A assinatura da empresa só pode ser alterada pela contra-assinatura (rpc_contra_assinar_contrato)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_contrato_guarda_contra_assinatura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contracts_00_guarda_contra_assinatura ON public.client_contracts;
CREATE TRIGGER trg_contracts_00_guarda_contra_assinatura
  BEFORE INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_guarda_contra_assinatura();

COMMIT;
