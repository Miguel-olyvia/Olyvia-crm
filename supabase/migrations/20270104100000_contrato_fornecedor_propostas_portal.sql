-- ============================================================
-- 20270104100000_contrato_fornecedor_propostas_portal
-- ============================================================
-- Contrato de Fornecedor: o FORNECEDOR também propõe um contrato no portal. Base RH (uetjghdkwbywbftedtth).
-- NUNCA a principal.
--
-- Fluxo
--   1. Portal: só o titular (owner) propõe (sp_supplier_contract_propose). Escolhe a origem ('modelo' = o nosso modelo
--      padrão, 'pdf_fornecedor' = o PDF dele, carregado a seguir pela Edge supplier-contract-action), o tipo, o título,
--      a validade e as condições estruturadas (as mesmas chaves de fn_sc_aplicar_condicoes). Estado novo 'proposed'.
--      Aviso no sino do CRM (fn_sc_notificar, tipo supplier_contract_proposed).
--   2. Enquanto 'proposed' o fornecedor não edita: pode juntar o PDF do contrato (uma vez, se origem pdf_fornecedor) e
--      anexos, ou retirar a proposta (sp_supplier_contract_withdraw → 'cancelled'). Para mudar, retira e propõe de novo.
--   3. CRM (suppliers.contract_manage): aceitar (rpc_supplier_contract_accept_proposal → 'draft'; se origem 'modelo'
--      e sem modelo, aplica o primeiro modelo ativo do mesmo tipo, como o diálogo "Novo contrato") e segue o fluxo de
--      sempre (send → assinatura do fornecedor por SMS → contra-assinatura). Não há atalho: o fornecedor volta a
--      assinar. Recusar com motivo (rpc_supplier_contract_refuse_proposal → 'refused'), motivo visível ao fornecedor.
--   4. Um só contrato em curso por fornecedor: 'proposed' entra no índice supplier_contracts_um_em_curso.
--
-- O que o portal vê
--   proposed                       tudo (é dele); can_withdraw / can_attach / can_attach_main
--   draft criado pelo portal       "Aceite — em preparação": os campos da PROPOSTA (do evento 'proposed'), não o
--                                  rascunho que o CRM está a editar; só os ficheiros que ele próprio carregou
--   draft criado pelo CRM          nada (como antes)
--   refused (recusa da empresa)    refused_by = 'empresa', refusal_reason
--   cancelled (retirada)           proposal_state = 'withdrawn'
--   o resto                        como antes
--
-- Estrutura (só contratos de fornecedor)
--   supplier_contracts.created_via ('crm'|'portal') + created_by_portal_user_id (CHECK de autoria como em
--   supplier_contract_files); estado 'proposed'; transições proposed→draft|refused|cancelled; 4 tipos de evento novos.
--
-- Funções reescritas (a partir da versão viva, pg_get_functiondef, 03/11/2026):
--   fn_sc_contrato_guarda, fn_sc_ficheiro_guarda, fn_sc_ficheiro_legivel, fn_sc_contrato_json, fn_sc_portal_contrato,
--   sp_supplier_contracts_list, sp_supplier_contract_get, rpc_supplier_contract_register_file,
--   rpc_supplier_contract_get, rpc_supplier_contract_preview, rpc_supplier_contract_save_draft (só a lista de estados
--   em curso), rpc_supplier_contract_new_version (idem).
-- Funções novas: fn_sc_portal_json, fn_sc_portal_flags, sp_supplier_contract_propose, sp_supplier_contract_withdraw,
--   rpc_supplier_contract_accept_proposal, rpc_supplier_contract_refuse_proposal.
--
-- Reversão (só como migration nova): repor as funções desta lista a partir de 20270103300000; apagar/converter as
-- linhas created_via='portal' e os eventos dos tipos novos (com os gatilhos de guarda); repor os CHECKs e o índice.
-- ============================================================

BEGIN;

-- 0. Guarda --------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_contracts_status_check') THEN
    RAISE EXCEPTION 'Guarda: falta supplier_contracts_status_check (base do contrato de fornecedor não aplicada).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'supplier_contracts' AND column_name = 'created_via') THEN
    RAISE EXCEPTION 'Guarda: supplier_contracts.created_via já existe.';
  END IF;
END $$;

-- 1. Estrutura -----------------------------------------------------------------------------------------------------
ALTER TABLE public.supplier_contracts
  ADD COLUMN created_via text NOT NULL DEFAULT 'crm',
  ADD COLUMN created_by_portal_user_id uuid REFERENCES public.supplier_portal_users(id);

ALTER TABLE public.supplier_contracts
  ADD CONSTRAINT supplier_contracts_created_via_check CHECK (created_via IN ('crm', 'portal')),
  ADD CONSTRAINT supplier_contracts_autor_chk CHECK (
    (created_via = 'crm' AND created_by_portal_user_id IS NULL)
    OR (created_via = 'portal' AND created_by_portal_user_id IS NOT NULL AND created_by IS NULL)),
  DROP CONSTRAINT supplier_contracts_status_check,
  ADD CONSTRAINT supplier_contracts_status_check CHECK (status IN
    ('proposed', 'draft', 'sent', 'signed_supplier', 'signed', 'refused', 'cancelled', 'expired', 'superseded')),
  -- Proposta recusada pela empresa: nunca foi enviada, não tem documento congelado.
  DROP CONSTRAINT supplier_contracts_enviado_chk,
  ADD CONSTRAINT supplier_contracts_enviado_chk CHECK (
    status IN ('proposed', 'draft', 'cancelled')
    OR (status = 'refused' AND created_via = 'portal' AND sent_at IS NULL)
    OR (document_html IS NOT NULL AND document_sha256 IS NOT NULL AND document_frozen_at IS NOT NULL
        AND sent_at IS NOT NULL));

DROP INDEX public.supplier_contracts_um_em_curso;
CREATE UNIQUE INDEX supplier_contracts_um_em_curso ON public.supplier_contracts (supplier_id)
  WHERE status IN ('proposed', 'draft', 'sent', 'signed_supplier');

CREATE INDEX idx_supplier_contracts_portal_autor ON public.supplier_contracts (created_by_portal_user_id)
  WHERE created_by_portal_user_id IS NOT NULL;

ALTER TABLE public.supplier_contract_events
  DROP CONSTRAINT supplier_contract_events_event_type_check,
  ADD CONSTRAINT supplier_contract_events_event_type_check CHECK (event_type IN
    ('created', 'updated', 'conditions_updated', 'sent', 'file_added', 'supplier_signed',
     'company_signed', 'refused', 'cancelled', 'superseded', 'expired', 'new_version',
     'signature_request_resent',
     'proposed', 'proposal_accepted', 'proposal_refused', 'proposal_withdrawn'));

-- 2. Guarda do contrato --------------------------------------------------------------------------------------------
-- Novo: created_via/created_by_portal_user_id imutáveis; 'proposed' imutável (só pode ganhar o PDF principal uma vez,
-- e ao passar a 'draft' o CRM pode aplicar o modelo); transições proposed→draft|refused|cancelled.
CREATE OR REPLACE FUNCTION public.fn_sc_contrato_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Os contratos de fornecedor só se alteram pelas funções do sistema'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Um contrato de fornecedor enviado não pode ser apagado' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
    RETURN OLD;
  END IF;

  IF (NEW.id, NEW.organization_id, NEW.supplier_id, NEW.contract_number, NEW.version, NEW.previous_contract_id,
      NEW.created_at, NEW.created_by, NEW.created_via, NEW.created_by_portal_user_id)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.supplier_id, OLD.contract_number, OLD.version, OLD.previous_contract_id,
      OLD.created_at, OLD.created_by, OLD.created_via, OLD.created_by_portal_user_id) THEN
    RAISE EXCEPTION 'A identificação do contrato de fornecedor não pode ser alterada' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  -- Conteúdo: livre em 'draft' e na aceitação da proposta (proposed → draft, o CRM passa a editar).
  IF OLD.status <> 'draft' AND NOT (OLD.status = 'proposed' AND NEW.status = 'draft') THEN
    IF (NEW.kind, NEW.origin, NEW.template_id, NEW.title, NEW.body_html, NEW.payment_terms_days, NEW.payment_method,
        NEW.delivery_sla_days, NEW.shipping_terms, NEW.shipping_free_from, NEW.discount_percent, NEW.min_order_value,
        NEW.returns_accepted, NEW.returns_days, NEW.returns_notes, NEW.conditions_notes, NEW.valid_from, NEW.valid_until,
        NEW.document_html, NEW.document_sha256, NEW.document_frozen_at, NEW.supplier_account_id,
        NEW.supplier_account_link_id, NEW.sent_at, NEW.sent_by)
       IS DISTINCT FROM
       (OLD.kind, OLD.origin, OLD.template_id, OLD.title, OLD.body_html, OLD.payment_terms_days, OLD.payment_method,
        OLD.delivery_sla_days, OLD.shipping_terms, OLD.shipping_free_from, OLD.discount_percent, OLD.min_order_value,
        OLD.returns_accepted, OLD.returns_days, OLD.returns_notes, OLD.conditions_notes, OLD.valid_from, OLD.valid_until,
        OLD.document_html, OLD.document_sha256, OLD.document_frozen_at, OLD.supplier_account_id,
        OLD.supplier_account_link_id, OLD.sent_at, OLD.sent_by)
       OR (NEW.main_file_id IS DISTINCT FROM OLD.main_file_id
           -- Proposta com o PDF do fornecedor: o PDF principal fixa-se uma vez, ainda em 'proposed'.
           AND NOT (OLD.status = 'proposed' AND NEW.status = 'proposed' AND OLD.main_file_id IS NULL
                    AND OLD.origin = 'pdf_fornecedor')) THEN
      RAISE EXCEPTION 'Um contrato de fornecedor enviado ou proposto não pode ser alterado: faça uma nova versão'
        USING ERRCODE = 'check_violation', HINT = 'immutable';
    END IF;
  END IF;

  IF OLD.supplier_signed_at IS NOT NULL AND
     (NEW.supplier_signed_at, NEW.supplier_signed_by_portal_user_id, NEW.supplier_signed_by_name, NEW.supplier_signed_by_email,
      NEW.supplier_signed_phone, NEW.supplier_signed_ip, NEW.supplier_signed_user_agent, NEW.supplier_signed_document_sha256,
      NEW.supplier_signed_files, NEW.supplier_signature_sha256, NEW.supplier_signature_otp_id)
     IS DISTINCT FROM
     (OLD.supplier_signed_at, OLD.supplier_signed_by_portal_user_id, OLD.supplier_signed_by_name, OLD.supplier_signed_by_email,
      OLD.supplier_signed_phone, OLD.supplier_signed_ip, OLD.supplier_signed_user_agent, OLD.supplier_signed_document_sha256,
      OLD.supplier_signed_files, OLD.supplier_signature_sha256, OLD.supplier_signature_otp_id) THEN
    RAISE EXCEPTION 'A assinatura do fornecedor não pode ser alterada' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF OLD.company_signed_at IS NOT NULL AND
     (NEW.company_signed_at, NEW.company_signed_by_id, NEW.company_signed_by_name, NEW.company_signature_mode,
      NEW.company_signature_otp_id, NEW.company_signed_ip, NEW.company_signed_user_agent)
     IS DISTINCT FROM
     (OLD.company_signed_at, OLD.company_signed_by_id, OLD.company_signed_by_name, OLD.company_signature_mode,
      OLD.company_signature_otp_id, OLD.company_signed_ip, OLD.company_signed_user_agent) THEN
    RAISE EXCEPTION 'A contra-assinatura da empresa não pode ser alterada' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF (OLD.refused_at IS NOT NULL AND (NEW.refused_at, NEW.refused_by_portal_user_id, NEW.refusal_reason)
        IS DISTINCT FROM (OLD.refused_at, OLD.refused_by_portal_user_id, OLD.refusal_reason))
     OR (OLD.cancelled_at IS NOT NULL AND (NEW.cancelled_at, NEW.cancelled_by, NEW.cancel_reason)
        IS DISTINCT FROM (OLD.cancelled_at, OLD.cancelled_by, OLD.cancel_reason))
     OR (OLD.superseded_at IS NOT NULL AND (NEW.superseded_at, NEW.superseded_by_id)
        IS DISTINCT FROM (OLD.superseded_at, OLD.superseded_by_id))
     OR (OLD.expired_at IS NOT NULL AND NEW.expired_at IS DISTINCT FROM OLD.expired_at) THEN
    RAISE EXCEPTION 'O registo de recusa, cancelamento, substituição ou expiração não pode ser alterado'
      USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status, NEW.status) NOT IN (
       ('proposed', 'draft'), ('proposed', 'refused'), ('proposed', 'cancelled'),
       ('draft', 'sent'), ('draft', 'cancelled'),
       ('sent', 'signed_supplier'), ('sent', 'refused'), ('sent', 'cancelled'),
       ('signed_supplier', 'signed'), ('signed_supplier', 'cancelled'),
       ('signed', 'superseded'), ('signed', 'expired'), ('expired', 'superseded')) THEN
    RAISE EXCEPTION 'Mudança de estado inválida no contrato de fornecedor (% → %)', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Ficheiros: guarda e leitura -----------------------------------------------------------------------------------
-- Novo: o portal também regista ficheiros numa proposta sua ('proposed' criado pelo portal).
CREATE OR REPLACE FUNCTION public.fn_sc_ficheiro_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_org    uuid;
  v_via    text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Os ficheiros dos contratos de fornecedor só se registam pelas funções do sistema'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Um ficheiro de contrato de fornecedor não pode ser alterado' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;
  SELECT c.status, c.organization_id, c.created_via INTO v_status, v_org, v_via
  FROM public.supplier_contracts c WHERE c.id = COALESCE(NEW.contract_id, OLD.contract_id);
  IF TG_OP = 'DELETE' THEN
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Um ficheiro de um contrato enviado não pode ser apagado' USING ERRCODE = 'check_violation', HINT = 'immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org
     OR (NEW.uploaded_via = 'crm' AND v_status IS DISTINCT FROM 'draft')
     OR (NEW.uploaded_via = 'portal' AND v_status IS DISTINCT FROM 'sent'
         AND NOT (v_status = 'proposed' AND v_via = 'portal')) THEN
    RAISE EXCEPTION 'Não é possível anexar ficheiros a este contrato no estado atual' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  RETURN NEW;
END;
$function$;

-- Novo: numa proposta aceite (draft criado pelo portal) o fornecedor continua a ler os ficheiros que ele carregou.
CREATE OR REPLACE FUNCTION public.fn_sc_ficheiro_legivel(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.supplier_contract_files f
    JOIN public.supplier_contracts c ON c.id = f.contract_id
    WHERE f.storage_path = p_name
      AND (public.fn_sc_pode_ver(auth.uid(), c.organization_id)
           OR ((c.status <> 'draft' OR (c.created_via = 'portal' AND f.uploaded_via = 'portal')) AND EXISTS (
                 SELECT 1
                 FROM public.supplier_portal_users u
                 JOIN public.supplier_accounts a ON a.id = u.supplier_account_id AND a.status = 'active'
                 WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
                   AND public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id)))))
$function$;

-- 4. JSON do contrato ----------------------------------------------------------------------------------------------
-- Novo (CRM e portal): created_via, proposal_state (null | pending | accepted | refused | withdrawn), refused_by
-- (empresa | fornecedor), proposed_by_name; completo: proposal_snapshot (o que o fornecedor propôs). Só CRM:
-- created_by_portal_user_id, proposed_by_email. O portal passa a ver os eventos das propostas.
CREATE OR REPLACE FUNCTION public.fn_sc_contrato_json(c supplier_contracts, p_para text, p_completo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hoje   date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v        jsonb;
  v_files  jsonb;
  v_events jsonb;
  v_sname  text;
  v_oname  text;
  v_pu     public.supplier_portal_users;
  v_pstate text;
BEGIN
  SELECT s.name INTO v_sname FROM public.suppliers s WHERE s.id = c.supplier_id;
  SELECT o.name INTO v_oname FROM public.anew_organizations o WHERE o.id = c.organization_id;
  IF c.created_by_portal_user_id IS NOT NULL THEN
    SELECT * INTO v_pu FROM public.supplier_portal_users WHERE id = c.created_by_portal_user_id;
  END IF;

  v_pstate := CASE
    WHEN c.created_via IS DISTINCT FROM 'portal' THEN NULL
    WHEN c.status = 'proposed' THEN 'pending'
    WHEN c.status = 'refused' AND c.sent_at IS NULL THEN 'refused'
    WHEN c.status = 'cancelled' AND c.sent_at IS NULL AND c.cancelled_by IS NULL THEN 'withdrawn'
    ELSE 'accepted' END;

  v := jsonb_build_object(
    'id', c.id, 'organization_id', c.organization_id, 'organization_name', v_oname,
    'supplier_id', c.supplier_id, 'supplier_name', v_sname,
    'contract_number', c.contract_number, 'version', c.version, 'previous_contract_id', c.previous_contract_id,
    'superseded_by_id', c.superseded_by_id,
    'kind', c.kind, 'origin', c.origin, 'title', c.title, 'status', c.status,
    'conditions', jsonb_build_object(
      'payment_terms_days', c.payment_terms_days, 'payment_method', c.payment_method,
      'delivery_sla_days', c.delivery_sla_days, 'shipping_terms', c.shipping_terms,
      'shipping_free_from', c.shipping_free_from, 'discount_percent', c.discount_percent,
      'min_order_value', c.min_order_value, 'returns_accepted', c.returns_accepted,
      'returns_days', c.returns_days, 'returns_notes', c.returns_notes, 'conditions_notes', c.conditions_notes),
    'valid_from', c.valid_from, 'valid_until', c.valid_until,
    'days_to_expiry', CASE WHEN c.valid_until IS NULL THEN NULL ELSE c.valid_until - v_hoje END,
    'expires_soon', c.status = 'signed' AND c.valid_until IS NOT NULL AND c.valid_until - v_hoje BETWEEN 0 AND 30,
    'sent_at', c.sent_at, 'document_sha256', c.document_sha256, 'document_frozen_at', c.document_frozen_at,
    'main_file_id', c.main_file_id,
    'supplier_signed_at', c.supplier_signed_at, 'supplier_signed_by_name', c.supplier_signed_by_name,
    'supplier_signed_phone_masked', public.fn_sc_mascarar_telemovel(c.supplier_signed_phone),
    'supplier_signature_sha256', c.supplier_signature_sha256,
    'company_signed_at', c.company_signed_at, 'company_signed_by_name', c.company_signed_by_name,
    'refused_at', c.refused_at, 'refusal_reason', c.refusal_reason,
    'refused_by', CASE WHEN c.status = 'refused'
                       THEN CASE WHEN c.refused_by_portal_user_id IS NULL THEN 'empresa' ELSE 'fornecedor' END END,
    'cancelled_at', c.cancelled_at, 'superseded_at', c.superseded_at, 'expired_at', c.expired_at,
    'created_via', c.created_via, 'proposal_state', v_pstate,
    'proposed_by_name', CASE WHEN v_pu.id IS NOT NULL THEN COALESCE(NULLIF(btrim(v_pu.name), ''), v_pu.email) END,
    'created_at', c.created_at, 'updated_at', c.updated_at);

  IF p_para = 'crm' THEN
    v := v || jsonb_build_object(
      'template_id', c.template_id, 'supplier_account_id', c.supplier_account_id,
      'supplier_account_link_id', c.supplier_account_link_id, 'sent_by', c.sent_by,
      'supplier_signed_by_portal_user_id', c.supplier_signed_by_portal_user_id,
      'supplier_signed_by_email', c.supplier_signed_by_email, 'supplier_signed_ip', c.supplier_signed_ip,
      'supplier_signed_user_agent', c.supplier_signed_user_agent,
      'supplier_signed_document_sha256', c.supplier_signed_document_sha256,
      'supplier_signed_files', c.supplier_signed_files,
      'company_signed_by_id', c.company_signed_by_id, 'company_signature_mode', c.company_signature_mode,
      'company_signed_ip', c.company_signed_ip,
      'cancelled_by', c.cancelled_by, 'cancel_reason', c.cancel_reason,
      'created_by', c.created_by, 'updated_by', c.updated_by,
      'created_by_portal_user_id', c.created_by_portal_user_id, 'proposed_by_email', v_pu.email);
  END IF;

  IF p_completo THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', f.id, 'kind', f.kind, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
             'sha256', f.sha256, 'storage_bucket', f.storage_bucket, 'storage_path', f.storage_path,
             'uploaded_via', f.uploaded_via, 'created_at', f.created_at,
             'is_main', COALESCE(f.id = c.main_file_id, false)) ORDER BY f.created_at, f.id), '[]'::jsonb)
    INTO v_files
    FROM public.supplier_contract_files f WHERE f.contract_id = c.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', e.id, 'event_type', e.event_type, 'description', e.description, 'created_at', e.created_at)
             || CASE WHEN p_para = 'crm'
                     THEN jsonb_build_object('data', e.data, 'actor_user_id', e.actor_user_id,
                                             'actor_portal_user_id', e.actor_portal_user_id, 'ip', e.ip)
                     ELSE '{}'::jsonb END
             ORDER BY e.created_at, e.id), '[]'::jsonb)
    INTO v_events
    FROM public.supplier_contract_events e
    WHERE e.contract_id = c.id
      AND (p_para = 'crm' OR e.event_type IN ('sent', 'file_added', 'supplier_signed', 'company_signed', 'refused',
                                              'cancelled', 'superseded', 'expired', 'proposed', 'proposal_accepted',
                                              'proposal_refused', 'proposal_withdrawn'));

    v := v || jsonb_build_object('document_html', c.document_html, 'files', v_files, 'events', v_events,
      'proposal_snapshot', CASE WHEN c.created_via = 'portal' THEN (
         SELECT e.data -> 'proposal' FROM public.supplier_contract_events e
         WHERE e.contract_id = c.id AND e.event_type = 'proposed' ORDER BY e.created_at DESC, e.id LIMIT 1) END);
    IF p_para = 'crm' THEN
      v := v || jsonb_build_object('body_html', c.body_html);
    END IF;
  END IF;

  RETURN v;
END;
$function$;

-- 5. Portal: que contratos vê e como -------------------------------------------------------------------------------
-- Novo: um rascunho criado pelo portal (proposta aceite) é visível ao fornecedor; os do CRM continuam invisíveis.
CREATE OR REPLACE FUNCTION public.fn_sc_portal_contrato(p_contract_id uuid, u supplier_portal_users, p_lock boolean)
 RETURNS supplier_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c public.supplier_contracts;
BEGIN
  IF p_lock THEN
    SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id FOR UPDATE;
  ELSE
    SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  END IF;
  IF c.id IS NULL OR (c.status = 'draft' AND c.created_via IS DISTINCT FROM 'portal')
     OR NOT public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  RETURN c;
END;
$function$;

-- JSON para o portal. Rascunho (proposta aceite, em preparação): mostra o que o fornecedor PROPÔS (evento 'proposed'),
-- nunca o rascunho que o CRM está a editar; só os ficheiros carregados pelo portal e os eventos da proposta.
CREATE OR REPLACE FUNCTION public.fn_sc_portal_json(c supplier_contracts, p_completo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_snap jsonb;
  v_c    public.supplier_contracts;
  v      jsonb;
BEGIN
  IF c.status <> 'draft' THEN
    RETURN public.fn_sc_contrato_json(c, 'portal', p_completo);
  END IF;
  IF c.created_via IS DISTINCT FROM 'portal' THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  SELECT e.data -> 'proposal' INTO v_snap FROM public.supplier_contract_events e
  WHERE e.contract_id = c.id AND e.event_type = 'proposed' ORDER BY e.created_at DESC, e.id LIMIT 1;

  v_c := jsonb_populate_record(c, COALESCE(v_snap, '{}'::jsonb) - 'main_file_id');
  v_c.template_id := NULL;
  v_c.body_html := NULL;
  v_c.document_html := NULL;
  v_c.document_sha256 := NULL;
  v_c.document_frozen_at := NULL;
  v_c.updated_at := c.created_at;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_contract_files f
                 WHERE f.id = c.main_file_id AND f.uploaded_via = 'portal') THEN
    v_c.main_file_id := NULL;
  END IF;

  v := public.fn_sc_contrato_json(v_c, 'portal', false) || jsonb_build_object('proposal_snapshot', v_snap);
  IF p_completo THEN
    v := v || jsonb_build_object(
      'document_html', NULL,
      'files', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', f.id, 'kind', f.kind, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                 'sha256', f.sha256, 'storage_bucket', f.storage_bucket, 'storage_path', f.storage_path,
                 'uploaded_via', f.uploaded_via, 'created_at', f.created_at,
                 'is_main', COALESCE(f.id = v_c.main_file_id, false)) ORDER BY f.created_at, f.id)
        FROM public.supplier_contract_files f WHERE f.contract_id = c.id AND f.uploaded_via = 'portal'), '[]'::jsonb),
      'events', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'description', e.description,
                                            'created_at', e.created_at) ORDER BY e.created_at, e.id)
        FROM public.supplier_contract_events e
        WHERE e.contract_id = c.id
          AND (e.event_type IN ('proposed', 'proposal_accepted')
               OR (e.event_type = 'file_added' AND e.actor_portal_user_id IS NOT NULL))), '[]'::jsonb));
  END IF;
  RETURN v;
END;
$function$;

-- O que o utilizador do portal pode fazer com o contrato (titular da conta fixada no contrato).
CREATE OR REPLACE FUNCTION public.fn_sc_portal_flags(c supplier_contracts, u supplier_portal_users)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dono boolean := COALESCE(u.role = 'owner' AND u.supplier_account_id = c.supplier_account_id, false);
  v_prop boolean := c.status = 'proposed' AND c.created_via = 'portal';
BEGIN
  RETURN jsonb_build_object(
    'is_owner', COALESCE(u.role = 'owner', false),
    'can_sign', v_dono AND c.status = 'sent',
    'can_refuse', v_dono AND c.status = 'sent',
    'can_attach', v_dono AND (c.status = 'sent' OR v_prop),
    'can_attach_main', v_dono AND v_prop AND c.origin = 'pdf_fornecedor' AND c.main_file_id IS NULL,
    'can_withdraw', v_dono AND v_prop);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sp_supplier_contracts_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
BEGIN
  RETURN jsonb_build_object(
    'is_owner', u.role = 'owner',
    'phone_set', u.phone IS NOT NULL,
    'phone_masked', public.fn_sc_mascarar_telemovel(u.phone),
    'contracts', COALESCE((
      SELECT jsonb_agg(public.fn_sc_portal_json(c, false) || (public.fn_sc_portal_flags(c, u) - 'is_owner')
                       ORDER BY COALESCE(c.sent_at, c.created_at) DESC, c.version DESC)
      FROM public.supplier_contracts c
      WHERE (c.status <> 'draft' OR c.created_via = 'portal')
        AND public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id)), '[]'::jsonb),
    -- Onde pode propor um contrato: as ligações ativas da conta dele (um contrato em curso de cada vez por fornecedor).
    'proposal_targets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'organization_id', l.organization_id, 'organization_name', o.name,
               'supplier_id', l.supplier_id, 'supplier_name', s.name,
               'has_open_contract', x.aberto,
               'can_propose', u.role = 'owner' AND NOT x.aberto) ORDER BY o.name, s.name)
      FROM public.supplier_portal_user_access a
      JOIN public.supplier_account_links l ON l.id = a.link_id
      JOIN public.suppliers s ON s.id = l.supplier_id
      JOIN public.anew_organizations o ON o.id = l.organization_id
      CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM public.supplier_contracts y
                                         WHERE y.supplier_id = l.supplier_id
                                           AND y.status IN ('proposed', 'draft', 'sent', 'signed_supplier')) AS aberto) x
      WHERE a.portal_user_id = u.id AND a.revoked_at IS NULL AND l.status = 'active' AND s.deleted_at IS NULL
        AND l.supplier_account_id = u.supplier_account_id), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.sp_supplier_contract_get(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
  c public.supplier_contracts := public.fn_sc_portal_contrato(p_contract_id, u, false);
BEGIN
  RETURN public.fn_sc_portal_json(c, true) || public.fn_sc_portal_flags(c, u) || jsonb_build_object(
    'phone_set', u.phone IS NOT NULL,
    'phone_masked', public.fn_sc_mascarar_telemovel(u.phone));
END;
$function$;

-- 6. Portal: propor e retirar --------------------------------------------------------------------------------------
-- p_data: { origin: 'modelo'|'pdf_fornecedor' (obrigatório), kind?: 'material'|'servico', title?: text,
--           valid_from?: 'AAAA-MM-DD', valid_until?: 'AAAA-MM-DD', conditions: {chaves de fn_sc_aplicar_condicoes} }
-- Obrigatório nas condições: payment_terms_days e payment_method (as mesmas do envio); portes grátis exige o valor.
-- p_supplier_id só é preciso se a conta estiver ligada a mais de um fornecedor na mesma empresa.
CREATE OR REPLACE FUNCTION public.sp_supplier_contract_propose(p_organization_id uuid, p_supplier_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u      public.supplier_portal_users := public.fn_sp_actor();
  l      public.supplier_account_links;
  s      public.suppliers;
  c      public.supplier_contracts;
  v_prev public.supplier_contracts;
  v_n    integer;
  v_txt  text;
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_snap jsonb;
  v_nome text;
BEGIN
  IF u.role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Só o responsável da conta pode propor um contrato' USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  PERFORM public.fn_sc_so_chaves(p_data, ARRAY['origin', 'kind', 'title', 'valid_from', 'valid_until', 'conditions']);
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Dados inválidos' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Indique a empresa' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;

  -- A ligação ativa da conta dele a esta empresa (e fornecedor), com acesso não revogado.
  SELECT count(*) INTO v_n
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_account_links l2 ON l2.id = x.link_id
  JOIN public.suppliers s2 ON s2.id = l2.supplier_id
  WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL AND l2.status = 'active' AND s2.deleted_at IS NULL
    AND l2.organization_id = p_organization_id AND l2.supplier_account_id = u.supplier_account_id
    AND (p_supplier_id IS NULL OR l2.supplier_id = p_supplier_id);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'A sua conta está ligada a mais de um fornecedor nesta empresa: indique qual'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'supplier_required';
  END IF;
  SELECT l2.* INTO l
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_account_links l2 ON l2.id = x.link_id
  JOIN public.suppliers s2 ON s2.id = l2.supplier_id
  WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL AND l2.status = 'active' AND s2.deleted_at IS NULL
    AND l2.organization_id = p_organization_id AND l2.supplier_account_id = u.supplier_account_id
    AND (p_supplier_id IS NULL OR l2.supplier_id = p_supplier_id);
  SELECT * INTO s FROM public.suppliers WHERE id = l.supplier_id AND deleted_at IS NULL;
  IF s.id IS NULL OR NOT public.fn_sc_portal_tem_acesso(u.id, s.id, l.organization_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sc_supplier:' || s.id::text, 0));
  IF EXISTS (SELECT 1 FROM public.supplier_contracts x
             WHERE x.supplier_id = s.id AND x.status IN ('proposed', 'draft', 'sent', 'signed_supplier')) THEN
    RAISE EXCEPTION 'Já há um contrato em curso com esta empresa: aguarde que termine antes de propor outro'
      USING ERRCODE = 'check_violation', HINT = 'open_contract_exists';
  END IF;
  SELECT * INTO v_prev FROM public.supplier_contracts x WHERE x.supplier_id = s.id ORDER BY x.version DESC LIMIT 1;

  c.id := gen_random_uuid();
  c.organization_id := s.organization_id;
  c.supplier_id := s.id;
  c.kind := 'material';
  c.title := left('Condições comerciais — ' || s.name, 200);

  v_txt := public.fn_sc_j_text(p_data, 'origin', 'Origem', 20);
  IF v_txt IS NULL OR v_txt NOT IN ('modelo', 'pdf_fornecedor') THEN
    RAISE EXCEPTION 'A origem tem de ser modelo ou pdf_fornecedor' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  c.origin := v_txt;
  IF p_data ? 'kind' THEN
    v_txt := public.fn_sc_j_text(p_data, 'kind', 'Tipo', 20);
    IF v_txt IS NULL OR v_txt NOT IN ('material', 'servico') THEN
      RAISE EXCEPTION 'O tipo tem de ser material ou serviço' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.kind := v_txt;
  END IF;
  IF p_data ? 'title' THEN
    v_txt := public.fn_sc_j_text(p_data, 'title', 'Título', 200);
    IF v_txt IS NULL THEN
      RAISE EXCEPTION 'O campo «Título» é obrigatório.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.title := v_txt;
  END IF;
  c.valid_from := public.fn_sc_j_date(p_data, 'valid_from', 'Início da validade');
  c.valid_until := public.fn_sc_j_date(p_data, 'valid_until', 'Fim da validade');
  IF c.valid_from IS NOT NULL AND c.valid_until IS NOT NULL AND c.valid_until < c.valid_from THEN
    RAISE EXCEPTION 'O fim da validade não pode ser antes do início.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < v_hoje THEN
    RAISE EXCEPTION 'O fim da validade já passou' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF NOT (p_data ? 'conditions') OR jsonb_typeof(p_data -> 'conditions') <> 'object' THEN
    RAISE EXCEPTION 'Preencha as condições comerciais' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  c := public.fn_sc_aplicar_condicoes(c, p_data -> 'conditions');
  IF c.payment_terms_days IS NULL OR c.payment_method IS NULL THEN
    RAISE EXCEPTION 'Preencha pelo menos o prazo e a forma de pagamento' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF c.shipping_terms = 'gratis_acima_minimo' AND c.shipping_free_from IS NULL THEN
    RAISE EXCEPTION 'Indique a partir de que valor os portes são grátis' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;

  c.contract_number := COALESCE(v_prev.contract_number, public.fn_sc_novo_numero(s.organization_id));
  c.version := COALESCE(v_prev.version, 0) + 1;
  c.previous_contract_id := v_prev.id;

  INSERT INTO public.supplier_contracts
    (id, organization_id, supplier_id, contract_number, version, previous_contract_id, kind, origin, title,
     payment_terms_days, payment_method, delivery_sla_days, shipping_terms, shipping_free_from, discount_percent,
     min_order_value, returns_accepted, returns_days, returns_notes, conditions_notes, valid_from, valid_until,
     supplier_account_id, supplier_account_link_id, status, created_via, created_by_portal_user_id)
  VALUES
    (c.id, c.organization_id, c.supplier_id, c.contract_number, c.version, c.previous_contract_id, c.kind, c.origin,
     c.title, c.payment_terms_days, c.payment_method, c.delivery_sla_days, c.shipping_terms, c.shipping_free_from,
     c.discount_percent, c.min_order_value, c.returns_accepted, c.returns_days, c.returns_notes, c.conditions_notes,
     c.valid_from, c.valid_until, l.supplier_account_id, l.id, 'proposed', 'portal', u.id)
  RETURNING * INTO c;

  v_snap := jsonb_build_object(
    'kind', c.kind, 'origin', c.origin, 'title', c.title, 'valid_from', c.valid_from, 'valid_until', c.valid_until,
    'payment_terms_days', c.payment_terms_days, 'payment_method', c.payment_method,
    'delivery_sla_days', c.delivery_sla_days, 'shipping_terms', c.shipping_terms,
    'shipping_free_from', c.shipping_free_from, 'discount_percent', c.discount_percent,
    'min_order_value', c.min_order_value, 'returns_accepted', c.returns_accepted, 'returns_days', c.returns_days,
    'returns_notes', c.returns_notes, 'conditions_notes', c.conditions_notes);
  v_nome := COALESCE(NULLIF(btrim(u.name), ''), u.email);

  PERFORM public.fn_sc_evento(c, 'proposed', 'Proposta de contrato do fornecedor (versão ' || c.version || ') por ' || v_nome,
    jsonb_build_object('proposal', v_snap, 'portal_user_id', u.id, 'link_id', l.id), NULL, u.id);
  PERFORM public.fn_sc_notificar(c, 'supplier_contract_proposed', 'Proposta de contrato do fornecedor',
    format('%s propôs um contrato (%s, versão %s): reveja-o na ficha do fornecedor.', s.name, c.contract_number, c.version));

  RETURN public.fn_sc_portal_json(c, true) || public.fn_sc_portal_flags(c, u);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sp_supplier_contract_withdraw(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
  c public.supplier_contracts := public.fn_sc_portal_contrato(p_contract_id, u, true);
BEGIN
  IF u.role IS DISTINCT FROM 'owner' OR u.supplier_account_id IS DISTINCT FROM c.supplier_account_id THEN
    RAISE EXCEPTION 'Só o responsável da conta pode retirar a proposta' USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF c.status <> 'proposed' OR c.created_via IS DISTINCT FROM 'portal' THEN
    RAISE EXCEPTION 'Esta proposta já não pode ser retirada' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  UPDATE public.supplier_contracts SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = c.id RETURNING * INTO c;
  PERFORM public.fn_sc_evento(c, 'proposal_withdrawn', 'Proposta retirada pelo fornecedor', '{}'::jsonb, NULL, u.id);

  UPDATE public.notifications SET is_resolved = true
  WHERE type = 'supplier_contract_proposed' AND entity_id = c.id AND is_resolved = false;
  PERFORM public.fn_sc_notificar(c, 'supplier_contract_proposal_withdrawn', 'Proposta de contrato retirada',
    format('O fornecedor retirou a proposta de contrato %s (versão %s).', c.contract_number, c.version));

  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'cancelled_at', c.cancelled_at);
END;
$function$;

-- 7. CRM: aceitar e recusar a proposta ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_accept_proposal(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  c       public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  t       public.supplier_contract_templates;
  v_name  text;
BEGIN
  IF c.status <> 'proposed' THEN
    RAISE EXCEPTION 'Esta proposta já não está à espera de resposta (estado %)', c.status USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = c.supplier_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Origem 'modelo': o modelo padrão = o primeiro modelo ativo do mesmo tipo (como o diálogo "Novo contrato").
  IF c.origin = 'modelo' AND c.template_id IS NULL THEN
    SELECT * INTO t FROM public.supplier_contract_templates x
    WHERE x.organization_id = c.organization_id AND x.kind = c.kind AND x.is_active
    ORDER BY x.name, x.id LIMIT 1;
  END IF;

  UPDATE public.supplier_contracts SET
    status = 'draft',
    template_id = COALESCE(t.id, template_id),
    body_html = CASE WHEN t.id IS NOT NULL THEN t.body_html ELSE body_html END,
    updated_by = v_actor.id, updated_at = now()
  WHERE id = c.id RETURNING * INTO c;

  v_name := COALESCE(NULLIF(btrim(v_actor.name), ''), 'utilizador');
  PERFORM public.fn_sc_evento(c, 'proposal_accepted',
    'Proposta aceite pela empresa: em preparação para envio',
    jsonb_build_object('by_user_id', v_actor.id, 'by_user_name', v_name, 'template_id', t.id), v_actor.id, NULL);

  UPDATE public.notifications SET is_resolved = true
  WHERE type = 'supplier_contract_proposed' AND entity_id = c.id AND is_resolved = false;

  RETURN public.fn_sc_contrato_json(c, 'crm', true) || jsonb_build_object(
    'can_manage', true, 'can_countersign', false, 'can_accept_proposal', false, 'can_refuse_proposal', false,
    'template_applied', t.id IS NOT NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_refuse_proposal(p_contract_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  public.anew_users := public.fn_sc_crm_actor(auth.uid());
  c        public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  v_reason text := NULLIF(regexp_replace(COALESCE(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
BEGIN
  IF c.status <> 'proposed' THEN
    RAISE EXCEPTION 'Esta proposta já não está à espera de resposta (estado %)', c.status USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'Indique o motivo da recusa (3 a 2000 caracteres)' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  UPDATE public.supplier_contracts SET
    status = 'refused', refused_at = now(), refusal_reason = v_reason, updated_by = v_actor.id, updated_at = now()
  WHERE id = c.id RETURNING * INTO c;
  PERFORM public.fn_sc_evento(c, 'proposal_refused', 'Proposta recusada pela empresa',
    jsonb_build_object('reason', v_reason, 'by_user_id', v_actor.id), v_actor.id, NULL);

  UPDATE public.notifications SET is_resolved = true
  WHERE type = 'supplier_contract_proposed' AND entity_id = c.id AND is_resolved = false;

  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'refused_at', c.refused_at,
                            'refusal_reason', c.refusal_reason);
END;
$function$;

-- 8. CRM: detalhe e pré-visualização -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_get(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  c     public.supplier_contracts;
  v_act public.anew_users;
  v_man boolean;
BEGIN
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  IF c.id IS NULL OR NOT public.fn_sc_pode_ver(v_uid, c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_act FROM public.anew_users WHERE auth_user_id = v_uid AND deleted_at IS NULL LIMIT 1;
  v_man := public.fn_sc_pode(v_uid, 'suppliers.contract_manage', c.organization_id);
  RETURN public.fn_sc_contrato_json(c, 'crm', true) || jsonb_build_object(
    'can_manage', v_man,
    'can_countersign', c.status = 'signed_supplier'
                       AND v_man
                       AND public.fn_pode_assinar_contratos(v_act.id, c.organization_id),
    'can_accept_proposal', c.status = 'proposed' AND v_man,
    'can_refuse_proposal', c.status = 'proposed' AND v_man);
END;
$function$;

-- Novo: uma proposta pré-visualiza-se como um rascunho (ainda não há documento congelado).
CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_preview(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c public.supplier_contracts;
BEGIN
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  IF c.id IS NULL OR NOT public.fn_sc_pode_ver(auth.uid(), c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF c.status NOT IN ('draft', 'proposed') THEN
    RETURN jsonb_build_object('html', c.document_html, 'sha256', c.document_sha256, 'frozen', true);
  END IF;
  IF c.origin = 'modelo' AND c.body_html IS NULL THEN
    RETURN jsonb_build_object('html', NULL, 'sha256', NULL, 'frozen', false);
  END IF;
  RETURN jsonb_build_object('html', public.fn_sc_render(c, now()), 'sha256', NULL, 'frozen', false);
END;
$function$;

-- 9. Registo de ficheiros ------------------------------------------------------------------------------------------
-- Novo: o titular regista ficheiros numa proposta da conta dele ('proposed' criado pelo portal): anexos e, se a origem
-- é pdf_fornecedor, o PDF do contrato (uma só vez; passa a main_file_id). O resto como antes.
CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_register_file(p_caller_auth_uid uuid, p_contract_id uuid, p_kind text, p_storage_path text, p_file_name text, p_mime text, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c       public.supplier_contracts;
  u       public.supplier_portal_users;
  v_act   public.anew_users;
  v_via   text;
  v_pref  text;
  v_leaf  text;
  v_name  text := btrim(COALESCE(p_file_name, ''));
  v_mime  text := lower(btrim(COALESCE(p_mime, '')));
  v_sha   text := lower(btrim(COALESCE(p_sha256, '')));
  v_objsz text;
  v_size  bigint;
  f       public.supplier_contract_files;
BEGIN
  IF p_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  SELECT pu.* INTO u FROM public.supplier_portal_users pu
  JOIN public.supplier_accounts a ON a.id = pu.supplier_account_id AND a.status = 'active'
  WHERE pu.auth_user_id = p_caller_auth_uid AND pu.status = 'active';

  IF u.id IS NOT NULL THEN
    v_via := 'portal';
    IF c.status = 'draft' OR NOT public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id) THEN
      RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF u.role IS DISTINCT FROM 'owner' OR u.supplier_account_id IS DISTINCT FROM c.supplier_account_id THEN
      RAISE EXCEPTION 'Só o responsável da conta pode anexar ficheiros ao contrato' USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
    END IF;
    IF c.status = 'proposed' AND c.created_via = 'portal' THEN
      IF p_kind = 'contrato_fornecedor' AND c.origin IS DISTINCT FROM 'pdf_fornecedor' THEN
        RAISE EXCEPTION 'Esta proposta usa o modelo da empresa: só pode juntar anexos' USING ERRCODE = 'check_violation', HINT = 'validation';
      END IF;
      IF p_kind = 'contrato_fornecedor' AND c.main_file_id IS NOT NULL THEN
        RAISE EXCEPTION 'O PDF do contrato já foi carregado: para o trocar, retire a proposta e proponha de novo'
          USING ERRCODE = 'check_violation', HINT = 'invalid_state';
      END IF;
    ELSIF c.status <> 'sent' THEN
      RAISE EXCEPTION 'Já não é possível anexar ficheiros a este contrato' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
  ELSE
    v_via := 'crm';
    SELECT * INTO v_act FROM public.anew_users WHERE auth_user_id = p_caller_auth_uid AND deleted_at IS NULL LIMIT 1;
    IF v_act.id IS NULL OR NOT public.fn_sc_pode_ver(p_caller_auth_uid, c.organization_id) THEN
      RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF NOT public.fn_sc_pode(p_caller_auth_uid, 'suppliers.contract_manage', c.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
    IF c.status <> 'draft' THEN
      RAISE EXCEPTION 'Só se anexam ficheiros a um rascunho' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('contrato_fornecedor', 'anexo') THEN
    RAISE EXCEPTION 'Tipo de ficheiro inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  v_pref := c.organization_id::text || '/' || c.id::text || '/';
  IF p_storage_path IS NULL OR left(p_storage_path, char_length(v_pref)) <> v_pref THEN
    RAISE EXCEPTION 'Caminho do ficheiro inválido para este contrato' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_leaf := substr(p_storage_path, char_length(v_pref) + 1);
  IF v_leaf !~ '^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$' THEN
    RAISE EXCEPTION 'Caminho do ficheiro inválido para este contrato' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_name = '' OR char_length(v_name) > 255 OR v_name ~ '[\x01-\x1F\x7F/\\]' THEN
    RAISE EXCEPTION 'Nome do ficheiro inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     OR (p_kind = 'contrato_fornecedor' AND v_mime <> 'application/pdf') THEN
    RAISE EXCEPTION 'Tipo de ficheiro não permitido (o contrato tem de ser PDF; anexos PDF, JPEG, PNG ou WEBP)'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'SHA-256 inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  -- Repetição do mesmo caminho → devolve o que já está.
  SELECT * INTO f FROM public.supplier_contract_files WHERE storage_path = p_storage_path;
  IF f.id IS NOT NULL THEN
    IF f.contract_id <> c.id OR f.sha256 <> v_sha THEN
      RAISE EXCEPTION 'Caminho do ficheiro já usado' USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    RETURN jsonb_build_object('file_id', f.id, 'already_registered', true, 'is_main', COALESCE(f.id = c.main_file_id, false));
  END IF;

  IF (SELECT count(*) FROM public.supplier_contract_files WHERE contract_id = c.id) >= 20 THEN
    RAISE EXCEPTION 'Limite de 20 ficheiros por contrato' USING ERRCODE = 'check_violation', HINT = 'limit';
  END IF;

  SELECT o.metadata ->> 'size' INTO v_objsz FROM storage.objects o
  WHERE o.bucket_id = 'supplier-contracts' AND o.name = p_storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficheiro não encontrado: carregue-o de novo' USING ERRCODE = 'no_data_found', HINT = 'validation';
  END IF;
  IF v_objsz ~ '^[0-9]{1,18}$' THEN
    v_size := v_objsz::bigint;
  END IF;
  IF v_size IS NULL OR v_size <= 0 OR v_size > 20971520 THEN
    RAISE EXCEPTION 'O ficheiro tem de ter até 20 MB' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  INSERT INTO public.supplier_contract_files
    (contract_id, organization_id, kind, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_via,
     uploaded_by_user_id, uploaded_by_portal_user_id)
  VALUES (c.id, c.organization_id, p_kind, p_storage_path, v_name, v_mime, v_size, v_sha, v_via,
          CASE WHEN v_via = 'crm' THEN v_act.id END, CASE WHEN v_via = 'portal' THEN u.id END)
  RETURNING * INTO f;

  IF v_via = 'crm' AND p_kind = 'contrato_fornecedor' AND c.origin = 'pdf_fornecedor' THEN
    UPDATE public.supplier_contracts SET main_file_id = f.id, updated_by = v_act.id, updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  ELSIF v_via = 'portal' AND p_kind = 'contrato_fornecedor' AND c.status = 'proposed' AND c.origin = 'pdf_fornecedor' THEN
    UPDATE public.supplier_contracts SET main_file_id = f.id, updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  END IF;

  PERFORM public.fn_sc_evento(c, 'file_added',
    CASE WHEN v_via = 'portal' THEN 'Ficheiro anexado pelo fornecedor: ' ELSE 'Ficheiro anexado: ' END || v_name,
    jsonb_build_object('file_id', f.id, 'kind', p_kind, 'sha256', v_sha, 'size', v_size, 'via', v_via),
    v_act.id, u.id);

  IF v_via = 'portal' AND c.status = 'proposed' THEN
    -- Na proposta reaviva o mesmo aviso (um por contrato), em vez de um aviso por ficheiro.
    PERFORM public.fn_sc_notificar(c, 'supplier_contract_proposed', 'Proposta de contrato do fornecedor',
      format('O fornecedor juntou «%s» à proposta de contrato %s (versão %s).', v_name, c.contract_number, c.version));
  ELSIF v_via = 'portal' THEN
    PERFORM public.fn_sc_notificar(c, 'supplier_contract_file', 'Fornecedor anexou um ficheiro ao contrato',
      format('O fornecedor anexou «%s» ao contrato %s (versão %s).', v_name, c.contract_number, c.version));
  END IF;

  RETURN jsonb_build_object('file_id', f.id, 'already_registered', false, 'is_main', COALESCE(f.id = c.main_file_id, false),
                            'size_bytes', v_size, 'via', v_via);
END;
$function$;

-- 10. 'proposed' conta como contrato em curso nas RPCs do CRM (save_draft / new_version) ---------------------------
-- Gerado a partir da versão viva: só muda a lista de estados (antes ('draft', 'sent', 'signed_supplier')).
CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_save_draft(p_contract_id uuid, p_supplier_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  public.anew_users := public.fn_sc_crm_actor(auth.uid());
  s        public.suppliers;
  c        public.supplier_contracts;
  v_prev   public.supplier_contracts;
  t        public.supplier_contract_templates;
  v_novo   boolean := p_contract_id IS NULL;
  v_txt    text;
  v_tpl    uuid;
BEGIN
  PERFORM public.fn_sc_so_chaves(p_data, ARRAY['title', 'kind', 'origin', 'template_id', 'body_html', 'valid_from',
                                               'valid_until', 'conditions']);
  p_data := COALESCE(p_data, '{}'::jsonb);

  IF v_novo THEN
    SELECT * INTO s FROM public.suppliers WHERE id = p_supplier_id AND deleted_at IS NULL;
    IF s.id IS NULL OR NOT public.fn_sc_pode_ver(v_uid, s.organization_id) THEN
      RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF NOT public.fn_sc_pode(v_uid, 'suppliers.contract_manage', s.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sc_supplier:' || s.id::text, 0));
    IF EXISTS (SELECT 1 FROM public.supplier_contracts x WHERE x.supplier_id = s.id AND x.status IN ('proposed', 'draft', 'sent', 'signed_supplier')) THEN
      RAISE EXCEPTION 'Já existe um contrato em curso para este fornecedor' USING ERRCODE = 'check_violation', HINT = 'open_contract_exists';
    END IF;
    SELECT * INTO v_prev FROM public.supplier_contracts x WHERE x.supplier_id = s.id ORDER BY x.version DESC LIMIT 1;

    c.id := gen_random_uuid();
    c.organization_id := s.organization_id;
    c.supplier_id := s.id;
    c.contract_number := COALESCE(v_prev.contract_number, public.fn_sc_novo_numero(s.organization_id));
    c.version := COALESCE(v_prev.version, 0) + 1;
    c.previous_contract_id := v_prev.id;
    c.kind := 'material';
    c.origin := 'modelo';
    c.title := left('Condições comerciais — ' || s.name, 200);
    c.status := 'draft';
    c.created_by := v_actor.id;

    INSERT INTO public.supplier_contracts
      (id, organization_id, supplier_id, contract_number, version, previous_contract_id, kind, origin, title, status,
       created_by, updated_by)
    VALUES (c.id, c.organization_id, c.supplier_id, c.contract_number, c.version, c.previous_contract_id, c.kind,
            c.origin, c.title, c.status, c.created_by, v_actor.id);
    SELECT * INTO c FROM public.supplier_contracts WHERE id = c.id;
  ELSE
    c := public.fn_sc_crm_contrato_para_escrita(p_contract_id, v_uid);
    IF p_supplier_id IS NOT NULL AND p_supplier_id IS DISTINCT FROM c.supplier_id THEN
      RAISE EXCEPTION 'O contrato é de outro fornecedor' USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    IF c.status <> 'draft' THEN
      RAISE EXCEPTION 'Só um rascunho pode ser alterado: faça uma nova versão' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
  END IF;

  IF p_data ? 'title' THEN
    v_txt := public.fn_sc_j_text(p_data, 'title', 'Título', 200);
    IF v_txt IS NULL THEN
      RAISE EXCEPTION 'O campo «Título» é obrigatório.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.title := v_txt;
  END IF;
  IF p_data ? 'origin' THEN
    v_txt := public.fn_sc_j_text(p_data, 'origin', 'Origem', 20);
    IF v_txt IS NULL OR v_txt NOT IN ('modelo', 'pdf_fornecedor') THEN
      RAISE EXCEPTION 'A origem tem de ser modelo ou pdf_fornecedor' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.origin := v_txt;
  END IF;
  IF p_data ? 'kind' THEN
    v_txt := public.fn_sc_j_text(p_data, 'kind', 'Tipo', 20);
    IF v_txt IS NULL OR v_txt NOT IN ('material', 'servico') THEN
      RAISE EXCEPTION 'O tipo tem de ser material ou serviço' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.kind := v_txt;
  END IF;
  IF p_data ? 'template_id' THEN
    v_tpl := public.fn_sc_j_uuid(p_data, 'template_id', 'Modelo');
    IF v_tpl IS NULL THEN
      c.template_id := NULL;
    ELSE
      SELECT * INTO t FROM public.supplier_contract_templates WHERE id = v_tpl;
      IF t.id IS NULL OR t.organization_id IS DISTINCT FROM c.organization_id OR NOT t.is_active THEN
        RAISE EXCEPTION 'Modelo não encontrado ou inativo' USING ERRCODE = 'no_data_found', HINT = 'not_found';
      END IF;
      IF p_data ? 'kind' AND c.kind IS DISTINCT FROM t.kind THEN
        RAISE EXCEPTION 'O tipo do contrato não coincide com o do modelo' USING ERRCODE = 'check_violation', HINT = 'validation';
      END IF;
      c.template_id := t.id;
      c.kind := t.kind;
      IF NOT (p_data ? 'body_html') THEN
        c.body_html := t.body_html;
      END IF;
    END IF;
  END IF;
  IF p_data ? 'body_html' THEN
    IF jsonb_typeof(p_data -> 'body_html') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'O texto do contrato é inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.body_html := NULLIF(p_data ->> 'body_html', '');
    IF c.body_html IS NOT NULL THEN
      IF char_length(c.body_html) > 500000 THEN
        RAISE EXCEPTION 'O texto do contrato é demasiado longo.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
      END IF;
      PERFORM public.fn_sc_validar_corpo(c.body_html);
    END IF;
  END IF;
  IF p_data ? 'valid_from' THEN c.valid_from := public.fn_sc_j_date(p_data, 'valid_from', 'Início da validade'); END IF;
  IF p_data ? 'valid_until' THEN c.valid_until := public.fn_sc_j_date(p_data, 'valid_until', 'Fim da validade'); END IF;
  IF c.valid_from IS NOT NULL AND c.valid_until IS NOT NULL AND c.valid_until < c.valid_from THEN
    RAISE EXCEPTION 'O fim da validade não pode ser antes do início.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF p_data ? 'conditions' THEN
    c := public.fn_sc_aplicar_condicoes(c, p_data -> 'conditions');
  END IF;
  -- Ao passar a modelo, o PDF principal deixa de contar como o documento.
  IF c.origin = 'modelo' THEN
    c.main_file_id := NULL;
  END IF;

  c.updated_by := v_actor.id;
  PERFORM public.fn_sc_gravar_rascunho(c);
  SELECT * INTO c FROM public.supplier_contracts WHERE id = c.id;

  PERFORM public.fn_sc_evento(c, CASE WHEN v_novo THEN 'created' ELSE 'updated' END,
    CASE WHEN v_novo THEN 'Rascunho criado (versão ' || c.version || ')' ELSE 'Rascunho alterado' END,
    jsonb_build_object('fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(p_data) k)),
    v_actor.id, NULL);

  RETURN public.fn_sc_contrato_json(c, 'crm', true);
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_supplier_contract_new_version(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  o       public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  v_ult   public.supplier_contracts;
  n       public.supplier_contracts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sc_supplier:' || o.supplier_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.supplier_contracts x WHERE x.supplier_id = o.supplier_id AND x.status IN ('proposed', 'draft', 'sent', 'signed_supplier')) THEN
    RAISE EXCEPTION 'Já existe um contrato em curso para este fornecedor' USING ERRCODE = 'check_violation', HINT = 'open_contract_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = o.supplier_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_ult FROM public.supplier_contracts x WHERE x.supplier_id = o.supplier_id ORDER BY x.version DESC LIMIT 1;

  INSERT INTO public.supplier_contracts
    (organization_id, supplier_id, contract_number, version, previous_contract_id, kind, origin, template_id, title,
     body_html, payment_terms_days, payment_method, delivery_sla_days, shipping_terms, shipping_free_from,
     discount_percent, min_order_value, returns_accepted, returns_days, returns_notes, conditions_notes, valid_from,
     valid_until, status, created_by, updated_by)
  VALUES
    (o.organization_id, o.supplier_id, o.contract_number, v_ult.version + 1, v_ult.id, o.kind, o.origin, o.template_id,
     o.title, o.body_html, o.payment_terms_days, o.payment_method, o.delivery_sla_days, o.shipping_terms,
     o.shipping_free_from, o.discount_percent, o.min_order_value, o.returns_accepted, o.returns_days, o.returns_notes,
     o.conditions_notes, NULL, NULL, 'draft', v_actor.id, v_actor.id)
  RETURNING * INTO n;

  PERFORM public.fn_sc_evento(n, 'new_version', 'Nova versão ' || n.version || ' a partir da versão ' || o.version,
    jsonb_build_object('from_contract_id', o.id, 'from_version', o.version), v_actor.id, NULL);
  RETURN public.fn_sc_contrato_json(n, 'crm', true);
END;
$function$;

-- 11. Privilégios das funções novas/reescritas ---------------------------------------------------------------------
-- O default ACL do schema dá EXECUTE a anon/authenticated: tirar e dar só o necessário (como em 20270103300000).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('fn_sc_portal_json', 'fn_sc_portal_flags', 'sp_supplier_contract_propose',
                               'sp_supplier_contract_withdraw', 'rpc_supplier_contract_accept_proposal',
                               'rpc_supplier_contract_refuse_proposal') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.sp_supplier_contract_propose(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_supplier_contract_withdraw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_accept_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_refuse_proposal(uuid, text) TO authenticated;
-- As reescritas (CREATE OR REPLACE) mantêm os privilégios que tinham.

COMMIT;
