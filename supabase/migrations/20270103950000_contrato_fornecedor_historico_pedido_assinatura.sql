-- ============================================================
-- 20270103950000_contrato_fornecedor_historico_pedido_assinatura
-- ============================================================
-- Contrato de Fornecedor, Fase 2b. Base RH (uetjghdkwbywbftedtth). NUNCA a principal.
--
-- O que faz
--   1. supplier_contract_events aceita um tipo novo: signature_request_resent (pedido de assinatura enviado por
--      email ao fornecedor: reenvio no CRM ou convite do portal com o contrato junto).
--   2. RPC nova rpc_supplier_contract_log_signature_request (só service_role, como rpc_supplier_contract_register_file):
--      a Edge que enviou o email regista o evento com quem enviou, os destinatários MASCARADOS e o smtp_status.
--      Volta a verificar quem pede (CRM, org visível + suppliers.contract_manage) e que o contrato está 'sent'.
--      Os destinatários têm de vir mascarados (contêm "***@"): o histórico não guarda emails completos.
--
-- Nenhuma função existente é reescrita. O portal continua a não ver este tipo de evento (fn_sc_contrato_json só lhe
-- mostra a lista fixa de tipos), o CRM vê todos.
--
-- Reversão (só como migration nova): DROP FUNCTION rpc_supplier_contract_log_signature_request; repor o CHECK sem o
-- tipo novo (depois de apagar/converter os eventos desse tipo, com os gatilhos de guarda).
-- ============================================================

BEGIN;

ALTER TABLE public.supplier_contract_events
  DROP CONSTRAINT supplier_contract_events_event_type_check,
  ADD CONSTRAINT supplier_contract_events_event_type_check CHECK (event_type IN
    ('created', 'updated', 'conditions_updated', 'sent', 'file_added', 'supplier_signed',
     'company_signed', 'refused', 'cancelled', 'superseded', 'expired', 'new_version',
     'signature_request_resent'));

-- p_source: 'reenvio' (supplier-contract-action) | 'convite' (create-supplier-portal-access)
-- p_recipients: array jsonb de emails mascarados (1 a 20); p_smtp_status: sent | not_found | send_failed
CREATE FUNCTION public.rpc_supplier_contract_log_signature_request(p_caller_auth_uid uuid, p_contract_id uuid,
                                                                   p_source text, p_recipients jsonb,
                                                                   p_smtp_status text, p_sent_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c       public.supplier_contracts;
  v_act   public.anew_users;
  v_name  text;
  v_desc  text;
  v_n     integer;
BEGIN
  IF p_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  SELECT * INTO v_act FROM public.anew_users WHERE auth_user_id = p_caller_auth_uid AND deleted_at IS NULL LIMIT 1;
  IF c.id IS NULL OR v_act.id IS NULL OR NOT public.fn_sc_pode_ver(p_caller_auth_uid, c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.fn_sc_pode(p_caller_auth_uid, 'suppliers.contract_manage', c.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF c.status <> 'sent' THEN
    RAISE EXCEPTION 'O contrato não está à espera da assinatura do fornecedor' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('reenvio', 'convite') THEN
    RAISE EXCEPTION 'Origem inválida' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF p_smtp_status IS NULL OR p_smtp_status NOT IN ('sent', 'not_found', 'send_failed') THEN
    RAISE EXCEPTION 'Estado do envio inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array'
     OR jsonb_array_length(p_recipients) NOT BETWEEN 1 AND 20
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_recipients) e
                WHERE jsonb_typeof(e) <> 'string' OR char_length(e #>> '{}') > 320
                   OR position('***@' IN (e #>> '{}')) = 0) THEN
    RAISE EXCEPTION 'Destinatários inválidos (têm de vir mascarados)' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  v_n := GREATEST(0, LEAST(COALESCE(p_sent_count, 0), 20));

  v_name := COALESCE(NULLIF(btrim(v_act.name), ''), 'utilizador');
  v_desc := CASE p_source
              WHEN 'convite' THEN 'Pedido de assinatura enviado com o convite do portal por ' || v_name
              ELSE 'Pedido de assinatura reenviado ao fornecedor por ' || v_name END
            || CASE p_smtp_status
                 WHEN 'sent' THEN ''
                 WHEN 'not_found' THEN ' (email não enviado: sem SMTP configurado)'
                 ELSE ' (email não enviado: erro SMTP)' END;

  PERFORM public.fn_sc_evento(c, 'signature_request_resent', v_desc,
    jsonb_build_object('source', p_source, 'recipients', p_recipients, 'smtp_status', p_smtp_status,
                       'sent_count', v_n, 'by_user_id', v_act.id, 'by_user_name', v_name),
    v_act.id, NULL);

  RETURN jsonb_build_object('ok', true, 'contract_id', c.id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_supplier_contract_log_signature_request(uuid, uuid, text, jsonb, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_log_signature_request(uuid, uuid, text, jsonb, text, integer)
  TO service_role;

COMMIT;
