-- 20270112300000 (Rúben, 9/11/2026): o fluxo novo do negócio à obra
--   proposta aceite → Financeiro valida o pagamento → (Obra) o supervisor retifica as medidas → as Operações aprovam o plano → contrato
--   assinado → encomenda de cliente (e a fornecedor) com tudo recebido → início da obra.
--  1. fn_neg_fase_minima: aceite = 4; pago = 5 (sem contrato); encomenda emitida = 5.
--  2. neg_registar_fatura: fatura-se com a proposta aceite (já não exige o contrato assinado).
--  3. fn_neg_emitir_ec_se_pronta: pago e sem contrato (ou sem o plano aprovado) passa à Obra e a encomenda espera.
--  4. o contrato assinado emite a encomenda de cliente (gatilho), se o pagamento e o plano estiverem prontos.
-- As funções são as que estavam na base a 9/11 (com 20270112200000), com as mudanças marcadas «20270112300000».

CREATE OR REPLACE FUNCTION public.fn_neg_fase_minima(p_negocio uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270112300000 (Rúben, 9/11, o fluxo novo): a proposta aceite já é Financeiro (4); o pagamento validado da 1.ª prestação já é Obra
  -- (5), mesmo sem contrato (assina-se lá, depois das medidas e do plano); a encomenda emitida também (5)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM client_contracts c WHERE c.id = public.fn_neg_contrato_ec(p_negocio) AND c.ec_emitida_em IS NOT NULL) THEN 5
    WHEN EXISTS (SELECT 1 FROM quotes q
                 JOIN quote_prestacoes p ON p.quote_id = q.id
                 JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                 JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
                 WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL AND q.deleted_at IS NULL AND q.estado = 'aceite'
                   AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = q.id)) THEN 5
    WHEN public.fn_neg_contrato_ec(p_negocio) IS NOT NULL
      OR EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL
                 AND q.deleted_at IS NULL AND q.estado = 'aceite') THEN 4
    ELSE 0
  END::smallint
$function$;

CREATE OR REPLACE FUNCTION public.neg_registar_fatura(p_org uuid, p_negocio uuid, p_chave text, p_numero text, p_erp jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'negocios.registar_fatura');
  v_numero text := btrim(coalesce(p_numero, ''));
  v_chave text := btrim(coalesce(p_chave, ''));
  e jsonb := CASE WHEN jsonb_typeof(p_erp) = 'object' THEN p_erp ELSE '{}'::jsonb END;
  v_neg negocios; v_q quotes; v_ad adendas; v_f faturas;
  v_pr uuid; v_ordem int; v_ultima int; v_pct numeric; v_soma_ant numeric; v_base_tot numeric; v_sem_iva numeric;
  v_tot numeric; v_iva numeric; v_mo numeric; v_quando timestamptz; v_primeira boolean := false; v_chave_f text; v_ec jsonb;
BEGIN
  IF v_numero = '' OR char_length(v_numero) > 60 THEN
    RAISE EXCEPTION 'Escreva o número da fatura (até 60 caracteres).' USING ERRCODE = 'NE006';
  END IF;
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF NOT coalesce(v_neg.fluxo_emylia, false) THEN
    RAISE EXCEPTION 'Este negócio é do CRM: a fatura regista-se em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;
  IF v_neg.anulado_em IS NOT NULL THEN
    RAISE EXCEPTION 'O contrato deste negócio foi anulado: já não se registam faturas.' USING ERRCODE = 'NE007';
  END IF;

  IF position('#' IN v_chave) > 0 THEN
    -- a parcela de uma adenda assinada (as parcelas são as do orçamento da adenda)
    SELECT * INTO v_ad FROM adendas WHERE negocio_id = p_negocio AND referencia = regexp_replace(v_chave, '#[^#]*$', '');
    IF NOT FOUND OR v_ad.estado <> 'assinada' THEN
      RAISE EXCEPTION 'A adenda % não está assinada: ainda não se fatura.', regexp_replace(v_chave, '#[^#]*$', '') USING ERRCODE = 'NE008';
    END IF;
    v_ordem := nullif(regexp_replace(v_chave, '^.*#', ''), '')::int + 1;
    SELECT * INTO v_q FROM quotes WHERE adenda_id = v_ad.id AND deleted_at IS NULL AND estado <> 'substituido' ORDER BY versao DESC NULLS LAST LIMIT 1;
    v_base_tot := coalesce(v_ad.total_com_iva, v_q.total_com_iva, 0);
    v_sem_iva := coalesce(v_ad.total, v_q.preco_final, 0);
    v_chave_f := v_ad.referencia || '#' || (v_ordem - 1);
  ELSE
    v_ordem := CASE WHEN v_chave = 'unica' THEN 1 WHEN v_chave ~ '^[tp][0-9]+$' THEN substr(v_chave, 2)::int END;
    IF v_ordem IS NULL THEN RAISE EXCEPTION 'Prestação desconhecida: %.', v_chave USING ERRCODE = 'NE006'; END IF;
    SELECT * INTO v_q FROM quotes WHERE negocio_id = p_negocio AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite'
    ORDER BY versao DESC NULLS LAST LIMIT 1;
    -- 20270112300000 (Rúben, 9/11, o fluxo novo): fatura-se com a proposta aceite; o contrato assina-se depois, na Obra
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ainda não há proposta aceite: a fatura regista-se depois.' USING ERRCODE = 'NE008';
    END IF;
    v_base_tot := coalesce(v_q.total_com_iva, v_q.total, 0);
    v_sem_iva := coalesce(v_q.preco_final, v_q.subtotal, 0);
    v_chave_f := 'f-t' || v_ordem;
  END IF;

  SELECT p.id, p.pct INTO v_pr, v_pct FROM quote_prestacoes p WHERE p.quote_id = v_q.id AND p.ordem = v_ordem;
  IF v_pr IS NULL THEN
    RAISE EXCEPTION 'O contrato não tem a prestação %.', v_ordem USING ERRCODE = 'NE004';
  END IF;
  v_primeira := v_ad.id IS NULL AND v_ordem = (SELECT min(ordem) FROM quote_prestacoes WHERE quote_id = v_q.id);

  -- a mesma fatura outra vez: só atualiza o que veio do ERP (idempotente); outro número na mesma prestação ou o mesmo número noutra: não
  SELECT * INTO v_f FROM faturas WHERE organization_id = p_org AND numero = v_numero;
  IF FOUND AND v_f.quote_prestacao_id IS DISTINCT FROM v_pr THEN
    RAISE EXCEPTION 'A fatura % já está registada noutro negócio ou noutra prestação.', v_numero USING ERRCODE = 'NE009';
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO v_f FROM faturas WHERE quote_prestacao_id = v_pr AND estado <> 'anulada';
    IF FOUND THEN
      RAISE EXCEPTION 'Esta prestação já tem a fatura %.', v_f.numero USING ERRCODE = 'NE009';
    END IF;
    v_f := NULL;
  END IF;

  -- o valor: o do ERP; senão a percentagem da prestação (a última leva o resto, para a soma bater certo)
  SELECT max(ordem) INTO v_ultima FROM quote_prestacoes WHERE quote_id = v_q.id;
  SELECT coalesce(sum(round(v_base_tot * p.pct, 2)), 0) INTO v_soma_ant FROM quote_prestacoes p WHERE p.quote_id = v_q.id AND p.ordem < v_ordem;
  v_tot := coalesce(nullif(e->>'total', '')::numeric, nullif(e->>'valor', '')::numeric,
                    CASE WHEN v_ordem = v_ultima THEN v_base_tot - v_soma_ant ELSE round(v_base_tot * v_pct, 2) END);
  IF v_tot IS NULL OR v_tot < 0 THEN RAISE EXCEPTION 'Valor da fatura inválido.' USING ERRCODE = 'NE006'; END IF;
  -- o IVA reparte-se pelo do orçamento (o exato está no Eticadata); a fatura do CRM guarda a base toda em materiais, como antes
  v_iva := CASE WHEN v_base_tot > 0 THEN round(v_tot * (1 - v_sem_iva / v_base_tot), 2) ELSE 0 END;
  v_mo := 0;
  v_quando := coalesce(nullif(e->>'data', '')::date::timestamptz, now());

  IF v_f.id IS NULL THEN
    INSERT INTO faturas (organization_id, negocio_id, quote_prestacao_id, numero, emitida_em, emitida_por, base_mao_obra, base_materiais, iva, total,
      erp_ref, atcud, nif_cliente, vencimento, erp_pago, erp_lida_em, referencia_mb, pdf_caminho, chave)
    VALUES (p_org, p_negocio, v_pr, v_numero, v_quando, v_user, v_mo, v_tot - v_iva - v_mo, v_iva, v_tot,
      coalesce(nullif(e->>'erp_ref', ''), nullif(e->>'bd', '')), nullif(e->>'atcud', ''), nullif(e->>'nif', ''), nullif(e->>'vencimento', '')::date,
      nullif(e->>'pago', '')::numeric, CASE WHEN e ? 'estado' OR e ? 'lidaEm' THEN coalesce(nullif(e->>'lidaEm', '')::timestamptz, now()) END,
      nullif(e->>'referencia_mb', ''), nullif(e->>'pdf', ''), v_chave_f)
    RETURNING * INTO v_f;
  ELSE
    UPDATE faturas SET
      erp_ref = coalesce(nullif(e->>'erp_ref', ''), nullif(e->>'bd', ''), erp_ref), atcud = coalesce(nullif(e->>'atcud', ''), atcud),
      nif_cliente = coalesce(nullif(e->>'nif', ''), nif_cliente), vencimento = coalesce(nullif(e->>'vencimento', '')::date, vencimento),
      erp_pago = coalesce(nullif(e->>'pago', '')::numeric, erp_pago),
      erp_lida_em = CASE WHEN e ? 'estado' OR e ? 'lidaEm' THEN coalesce(nullif(e->>'lidaEm', '')::timestamptz, now()) ELSE erp_lida_em END,
      referencia_mb = coalesce(nullif(e->>'referencia_mb', ''), referencia_mb), pdf_caminho = coalesce(nullif(e->>'pdf', ''), pdf_caminho)
    WHERE id = v_f.id
    RETURNING * INTO v_f;
  END IF;

  -- a fatura da 1.ª prestação é também a fatura do negócio (o passo «Validar o pagamento» lê-a daqui)
  IF v_primeira THEN
    UPDATE negocios SET fatura_numero = v_f.numero, fatura_em = v_f.emitida_em WHERE id = p_negocio;
  END IF;

  v_ec := public.fn_neg_emitir_ec_se_pronta(p_negocio, v_user);
  RETURN jsonb_build_object('fatura_id', v_f.id, 'numero', v_f.numero, 'chave', v_f.chave, 'total', v_f.total,
    'emitida_em', v_f.emitida_em, 'primeira', v_primeira, 'ec', v_ec);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_emitir_ec_se_pronta(p_negocio uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg negocios; v_q quotes; v_c client_contracts; v_pago timestamptz; v_por text; v_autor uuid; v_nome text;
  v_nova boolean := false; v_ads jsonb := '[]'::jsonb; v_r jsonb; r record;
  v_modo text;  -- 29/10: modo de baixa de stock da organização
  v_plano_ok boolean; -- 20270112200000: o plano da obra aprovado (a encomenda de cliente só depois dele)
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_neg.anulado_em IS NOT NULL THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', 'O negócio está anulado.');
  END IF;
  SELECT * INTO v_q FROM quotes WHERE negocio_id = p_negocio AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite'
  ORDER BY versao DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', 'O negócio não tem orçamento aceite.');
  END IF;
  -- o pagamento validado da fatura da 1.ª prestação
  SELECT min(pg.validado_em) INTO v_pago
  FROM quote_prestacoes p
  JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
  JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
  WHERE p.quote_id = v_q.id AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = v_q.id);

  v_por := coalesce((SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM anew_users u WHERE u.id = p_user), 'Financeiro');
  v_autor := coalesce(p_user, v_q.created_by);
  SELECT * INTO v_c FROM client_contracts WHERE id = public.fn_neg_contrato_ec(p_negocio);

  -- 29/10: o modo de baixa de stock (sem linha = 'contract_signed', como os gatilhos do CRM). 'contract_signed': desconta da reserva
  -- FIFO e pede ao fornecedor o que falta; 'manual': nem desconta nem pede (só pela Saída para clientes); 'proposal_accepted' (antigo):
  -- só o pedido, como antes.
  SELECT s.stock_deduction_trigger INTO v_modo FROM organization_inventory_settings s WHERE s.organization_id = v_neg.organization_id;
  v_modo := coalesce(v_modo, 'contract_signed');

  -- 20270112200000 (Rúben, 9/11: «a encomenda a cliente só acontece depois do plano de obra estar aprovado»): o plano da obra do negócio
  -- aprovado pelas Operações (ou já em curso / concluído). A venda direta não tem obra: fica como estava.
  v_plano_ok := EXISTS (SELECT 1 FROM ops_obra o WHERE o.negocio_id = p_negocio
                         AND o.estado_emylia->'plano'->>'estado' IN ('aprovado', 'em curso', 'concluída'));

  IF v_pago IS NOT NULL AND v_c.id IS NULL AND v_q.venda_direta THEN
    -- venda direta: o contrato de suporte, como rpc_create_direct_sale_order (rascunho ligado ao orçamento aceite e promovido a assinado na
    -- mesma transação: os gatilhos AFTER UPDATE OF status reservam o stock e pedem ao fornecedor o que falta). Fica sem negócio (o CRM
    -- não liga contratos a um negócio que fecha na proposta nem a um negócio ganho) e já emitido (ec_emitida_em).
    -- 29/10: a baixa e o pedido ficam com esses gatilhos (respeitam o modo); não se chamam outra vez aqui.
    SELECT coalesce(nullif(btrim(e.fiscal_name), ''), e.display_name) INTO v_nome FROM anew_entities e WHERE e.id = v_neg.entity_id;
    INSERT INTO client_contracts (contract_number, entity_id, organization_id, root_organization_id, created_by, status, total_value, currency,
      start_date, notes, ec_emitida_em, ec_emitida_por)
    VALUES (NULL, v_neg.entity_id, v_neg.organization_id, coalesce(v_neg.root_organization_id, v_neg.organization_id), v_autor, 'draft',
      coalesce(v_q.total_com_iva, v_q.total, 0), 'EUR', current_date,
      'Encomenda de cliente da venda direta do negócio ' || coalesce(v_neg.numero::text, v_neg.id::text) || ' (Emylia: emitida ao validar o pagamento)',
      now(), v_por)
    RETURNING * INTO v_c;
    UPDATE client_contracts SET quote_id = v_q.id WHERE id = v_c.id;
    UPDATE client_contracts
       SET status = 'signed', signature_date = coalesce(v_q.accepted_at, now()), accepted_at = coalesce(v_q.accepted_at, now()),
           signed_by_name = coalesce(v_nome, 'Cliente'), status_changed_by = v_autor, status_changed_at = now()
     WHERE id = v_c.id
    RETURNING * INTO v_c;
    v_nova := true;
  ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND v_plano_ok THEN
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = v_c.id RETURNING * INTO v_c;
    v_nova := true;
    -- 29/10: o que há em stock serve-se já (reserva FIFO, movimento 'venda'; idempotente por linha, nunca falha)
    IF v_modo = 'contract_signed' THEN
      PERFORM public.fn_contract_deduct_stock(v_c.id);
    END IF;
    -- o que falta pede-se ao fornecedor (como o gatilho do CRM faz na assinatura, aqui na emissão); nunca faz falhar a validação
    IF v_modo <> 'manual' THEN  -- 29/10
    BEGIN
      v_r := public.fn_client_order_request_missing(v_c.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    END IF;
  END IF;

  -- 20270112200000: pago e com contrato, mas o plano por aprovar: o negócio passa à Obra (é lá que se aprova o plano) e a encomenda espera
  -- 20270112300000: também sem contrato (no fluxo novo assina-se na Obra, depois das medidas e do plano)
  IF v_pago IS NOT NULL AND NOT coalesce(v_q.venda_direta, false) AND (v_c.id IS NULL OR (v_c.ec_emitida_em IS NULL AND NOT v_plano_ok)) THEN
    IF coalesce(v_neg.fase, 0) < 5 THEN
      UPDATE negocios SET fase = 5 WHERE id = p_negocio;
    END IF;
    RETURN jsonb_build_object('emitida', false, 'aguarda_plano', true,
      'motivo', CASE WHEN v_c.id IS NULL THEN 'A encomenda de cliente emite-se com o plano aprovado e o contrato assinado.'
                     ELSE 'A encomenda de cliente emite-se quando o plano da obra for aprovado.' END);
  END IF;

  IF v_c.id IS NULL OR v_c.ec_emitida_em IS NULL THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', CASE
      WHEN v_pago IS NULL THEN 'Falta a fatura registada e o pagamento validado da 1.ª prestação.'
      ELSE 'O contrato ainda não está assinado.' END);
  END IF;

  -- as adendas assinadas com a 1.ª parcela paga: a sua encomenda, depois da inicial (decisão B da Emylia)
  FOR r IN
    SELECT ca.id, a.referencia FROM adendas a JOIN client_contracts ca ON ca.adenda_id = a.id
    WHERE a.negocio_id = p_negocio AND ca.deleted_at IS NULL AND ca.replaced_by_contract_id IS NULL
      AND ca.status IN ('signed', 'assinado') AND ca.ec_emitida_em IS NULL
      AND EXISTS (SELECT 1 FROM quotes qa JOIN quote_prestacoes p ON p.quote_id = qa.id
                  JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                  JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
                  WHERE qa.adenda_id = a.id AND qa.deleted_at IS NULL AND p.ordem = 1)
    ORDER BY a.numero
  LOOP
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = r.id;
    -- 29/10: a baixa da adenda, como a do contrato
    IF v_modo = 'contract_signed' THEN
      PERFORM public.fn_contract_deduct_stock(r.id);
    END IF;
    IF v_modo <> 'manual' THEN  -- 29/10
    BEGIN
      v_r := public.fn_client_order_request_missing(r.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    END IF;
    v_ads := v_ads || jsonb_build_object('referencia', r.referencia, 'contract_id', r.id,
      'order_number', (SELECT order_number FROM client_contracts WHERE id = r.id));
  END LOOP;

  -- a encomenda emitida põe o negócio na Obra
  IF coalesce(v_neg.fase, 0) < 5 THEN
    UPDATE negocios SET fase = 5 WHERE id = p_negocio;
  END IF;

  RETURN jsonb_build_object('emitida', true, 'nova', v_nova, 'contract_id', v_c.id, 'order_number', v_c.order_number,
    'emitida_em', v_c.ec_emitida_em, 'adendas', v_ads);
END $function$;

-- 20270112300000: o contrato assinado (no fluxo novo, na Obra, com o plano aprovado) emite a encomenda de cliente, se o pagamento já estiver
-- validado. fn_neg_emitir_ec_se_pronta é idempotente e diz porque não emitiu; nunca faz falhar a assinatura.
CREATE OR REPLACE FUNCTION public.fn_neg_contrato_assinado_emite_ec()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.negocio_id IS NOT NULL AND NEW.adenda_id IS NULL AND NEW.status IN ('signed', 'assinado')
     AND OLD.status IS DISTINCT FROM NEW.status AND NEW.ec_emitida_em IS NULL THEN
    BEGIN
      PERFORM public.fn_neg_emitir_ec_se_pronta(NEW.negocio_id, coalesce(NEW.status_changed_by, NEW.created_by));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', NEW.id, 'negocio', NEW.negocio_id, 'negocio:ec_no_contrato', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_contrato_assinado_emite_ec() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_negocios_40_contrato_emite_ec ON public.client_contracts;
CREATE TRIGGER trg_negocios_40_contrato_emite_ec AFTER UPDATE OF status ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_contrato_assinado_emite_ec();
