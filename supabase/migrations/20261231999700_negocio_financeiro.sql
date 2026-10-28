-- Negócio (F3): o Financeiro do negócio da Emylia passa para o servidor. A encomenda de cliente (EC), de contrato ou de venda direta, só
-- nasce quando o Financeiro registou a fatura (o número emitido no Eticadata) E validou o pagamento da 1.ª prestação, por esta ordem.
-- Não acrescenta tabelas nem colunas: usa faturas, pagamentos, recibos, quote_prestacoes, client_contracts (ec_emitida_em/por,
-- order_number), negocios (fatura_*, recibo_*, fase, anulado_*) e adendas; acrescenta funções e reescreve quatro a partir do texto vivo.
--
--   1. Permissões (dados em anew_permissions): negocios.registar_fatura e negocios.validar_pagamento, dadas ao super_admin global (não há
--      papel de financeiro na base). Anular usa a que já existe: client_contracts.cancel.
--   2. neg_registar_fatura(org, negócio, chave, número, erp): a fatura de uma prestação do contrato ("t<n>" ou "unica") ou de uma parcela
--      de adenda ("<referência>#<i>"), única por (organização, número); os campos do ERP que a tabela tem (erp_ref, atcud, nif_cliente,
--      vencimento, erp_pago, erp_lida_em, referencia_mb, pdf_caminho). A 1.ª prestação fica também em negocios.fatura_*.
--   3. neg_validar_pagamento(org, negócio, fatura, valor, data, referência, recibo do ERP, conta): exige a fatura registada; o recibo é o
--      do ERP ou, sem ele, numerado aqui ("RC aaaa/n") com pg_advisory_xact_lock por organização e ano. A 1.ª prestação fica também em
--      negocios.fatura_paga/recibo_*.
--   4. fn_neg_emitir_ec_se_pronta(negócio, utilizador), chamada no fim das duas: com a fatura e o pagamento da 1.ª prestação grava
--      ec_emitida_em/por no contrato em vigor (na venda direta cria um contrato de suporte assinado, ligado ao orçamento aceite, como
--      rpc_create_direct_sale_order), pede ao fornecedor o que falta (fn_client_order_request_missing), emite as EC das adendas com a 1.ª
--      parcela paga e põe o negócio na fase 5. Idempotente (o negócio fica preso com FOR UPDATE).
--   5. neg_anular_contrato(org, negócio, motivo): client_contracts.cancel; recusa se houver encomendas a fornecedor já encomendadas;
--      cancela o contrato em vigor, o de suporte e os das adendas (os gatilhos de estorno do CRM libertam o stock e anulam as POs por
--      enviar) e marca o negócio anulado e perdido.
--   6. neg_guardar_negocio e fn_neg_guardar_adendas (do texto vivo): ignoram do JSON a fatura, o pagamento, o recibo, a EC, a anulação
--      e a fase 4/5 (a fase do JSON vai até 3; a 4 e a 5 são as do servidor), com aviso.
--   7. fn_neg_fase_minima (4: contrato da Emylia assinado ou venda direta aceite; 5: EC emitida); fn_neg_fase_derivada junta-a;
--      neg_ler_negocios devolve a fase com ela e a EC ('ec': contrato, order_number, emitida_em/por, e as das adendas).
--
-- Cada função reescrita parte do texto vivo. A migration pára se alguma tiver mudado entretanto (md5 do texto).

SET lock_timeout = '5s';

DO $do$
DECLARE
  v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.neg_guardar_negocio(uuid,uuid,jsonb)', '1290a6d7566ee7cb7b69622cdc49ae45'),
    ('public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)', '667f4199ca8208e651edae797d9549b6'),
    ('public.neg_ler_negocios(uuid)', 'abab64fad1a7327344c0bedc5b6262d7'),
    ('public.fn_neg_fase_derivada(uuid,uuid)', '662dbc9c93043a2bb2cda47f68596d87')
  ) AS t(assinatura, md5) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('20261231999700' IN v) = 0 AND md5(v) <> r.md5 THEN
      RAISE EXCEPTION 'A função % mudou: rever a migration 20261231999700 contra o texto vivo.', r.assinatura;
    END IF;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ 1. permissões
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('negocios.registar_fatura', 'Registar faturas do negócio', 'Registar no negócio a fatura emitida no programa de faturação certificado (Eticadata), por prestação do contrato ou parcela de adenda.', 'pessoas', NULL, 6, false, 'organization', false),
  ('negocios.validar_pagamento', 'Validar pagamentos do negócio', 'Confirmar que o pagamento de uma fatura do negócio entrou: emite o recibo e, com a 1.ª prestação, a encomenda de cliente no Inventário.', 'pessoas', NULL, 7, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $do$
DECLARE
  v_role       uuid;
  v_n          int;
  v_prev_claim text;
  v_codes      text[] := ARRAY['negocios.registar_fatura', 'negocios.validar_pagamento'];
BEGIN
  SELECT count(*) INTO v_n FROM public.anew_permissions p WHERE p.code = ANY (v_codes);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'GUARDA: esperadas 2 permissões no catálogo, encontradas %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_roles r WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'Papel super_admin global não existe nesta base: não se concede nada.';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papéis super_admin globais de sistema (esperado 1)', v_n;
  ELSE
    SELECT r.id INTO v_role FROM public.anew_roles r WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;
    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_role, c, NULL::uuid FROM unnest(v_codes) AS c
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);
    SELECT count(*) INTO v_n FROM public.anew_role_permissions rp WHERE rp.role_id = v_role AND rp.permission_code = ANY (v_codes);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'CONFERIR: o super_admin tem % de 2 permissões novas', v_n;
    END IF;
  END IF;
END $do$;

-- ------------------------------------------------------------------ o contrato da EC do negócio
-- O contrato em vigor da Emylia (com versão, sem adenda, assinado e não substituído) ou, na venda direta, o contrato de suporte: sem
-- negócio (o CRM não deixa ligar contratos a um negócio que fecha na proposta nem a um negócio ganho), ligado ao orçamento aceite.
CREATE OR REPLACE FUNCTION public.fn_neg_contrato_ec(p_negocio uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT c.id FROM client_contracts c
      WHERE c.negocio_id = p_negocio AND c.adenda_id IS NULL AND c.versao IS NOT NULL AND c.replaced_by_contract_id IS NULL
        AND c.deleted_at IS NULL AND c.status IN ('signed', 'assinado')
      ORDER BY c.versao DESC LIMIT 1),
    (SELECT c.id FROM client_contracts c JOIN quotes q ON q.id = c.quote_id
      WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.venda_direta AND q.adenda_id IS NULL AND q.deleted_at IS NULL
        AND c.negocio_id IS NULL AND c.adenda_id IS NULL AND c.deleted_at IS NULL AND c.status IN ('signed', 'assinado')
      ORDER BY c.created_at DESC LIMIT 1))
$$;
COMMENT ON FUNCTION public.fn_neg_contrato_ec(uuid) IS 'Negócio da Emylia: o contrato que é a encomenda de cliente (o em vigor ou, na venda direta, o de suporte). 20261231999700.';
REVOKE ALL ON FUNCTION public.fn_neg_contrato_ec(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_contrato_ec(uuid) TO service_role;

-- ------------------------------------------------------------------ a fase que só o servidor dá
CREATE OR REPLACE FUNCTION public.fn_neg_fase_minima(p_negocio uuid) RETURNS smallint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM client_contracts c WHERE c.id = public.fn_neg_contrato_ec(p_negocio) AND c.ec_emitida_em IS NOT NULL) THEN 5
    WHEN public.fn_neg_contrato_ec(p_negocio) IS NOT NULL
      OR EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.venda_direta AND q.adenda_id IS NULL
                 AND q.deleted_at IS NULL AND q.estado = 'aceite') THEN 4
    ELSE 0
  END::smallint
$$;
COMMENT ON FUNCTION public.fn_neg_fase_minima(uuid) IS 'Negócio da Emylia: 5 com a encomenda de cliente emitida; 4 com o contrato assinado ou a venda direta aceite; senão 0. A fase do negócio nunca fica abaixo disto (neg_guardar_negocio, neg_ler_negocios). 20261231999700.';
REVOKE ALL ON FUNCTION public.fn_neg_fase_minima(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_minima(uuid) TO service_role;

-- ------------------------------------------------------------------ fn_neg_fase_derivada: 4 e 5 por cima da regra do quadro
-- (INVOKER como estava: vê o que a RLS de quem chama deixa ver; por isso as duas condições ficam aqui escritas, sem a função acima)
CREATE OR REPLACE FUNCTION public.fn_neg_fase_derivada(p_negocio uuid, p_org uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    -- 20261231999700: a encomenda de cliente emitida (5) e o contrato assinado ou a venda direta aceite (4)
    WHEN EXISTS (SELECT 1 FROM public.client_contracts cc LEFT JOIN public.quotes q ON q.id = cc.quote_id
                 WHERE (cc.negocio_id = p_negocio OR (cc.negocio_id IS NULL AND q.negocio_id = p_negocio AND q.venda_direta))
                   AND cc.adenda_id IS NULL AND cc.deleted_at IS NULL AND cc.replaced_by_contract_id IS NULL
                   AND cc.status IN ('signed', 'assinado') AND cc.ec_emitida_em IS NOT NULL) THEN 5
    WHEN EXISTS (SELECT 1 FROM public.client_contracts cc
                 WHERE cc.negocio_id = p_negocio AND cc.versao IS NOT NULL AND cc.adenda_id IS NULL AND cc.deleted_at IS NULL
                   AND cc.replaced_by_contract_id IS NULL AND cc.status IN ('signed', 'assinado'))
      OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.venda_direta
                 AND q.adenda_id IS NULL AND q.deleted_at IS NULL AND q.estado = 'aceite') THEN 4
    WHEN EXISTS (SELECT 1 FROM public.client_contracts cc WHERE cc.negocio_id = p_negocio AND cc.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.proposals pr WHERE pr.negocio_id = p_negocio AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
      OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.negocio_id = p_negocio AND q.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.levantamentos lt WHERE lt.negocio_id = p_negocio AND lt.deleted_at IS NULL) THEN 3
    WHEN EXISTS (SELECT 1 FROM public.schedule_items s
                 WHERE s.negocio_id = p_negocio AND s.organization_id = p_org
                   AND s.status <> 'cancelled'::public.schedule_item_status
                   AND s.time_off_type IS NULL AND s.vacation_id IS NULL) THEN 2
    WHEN EXISTS (SELECT 1 FROM public.entity_interactions i
                 WHERE i.negocio_id = p_negocio AND i.organization_id = p_org AND i.interaction_type = 'call') THEN 1
    ELSE 0
  END::smallint
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) IS 'A fase do negócio: encomenda de cliente emitida 5; contrato da Emylia assinado ou venda direta aceite 4 (20261231999700); depois a regra de neg_resumo_quadro: contrato, proposta, orçamento ou levantamento 3; visita não cancelada 2; chamada 1; senão 0. INVOKER: vê o que a RLS de quem chama deixa ver. 20261231997000.';

-- ------------------------------------------------------------------ a EC para a leitura do negócio
CREATE OR REPLACE FUNCTION public.fn_neg_ler_ec(p_negocio uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN c.id IS NOT NULL THEN jsonb_build_object(
    'contract_id', c.id, 'order_number', c.order_number, 'emitida_em', c.ec_emitida_em, 'emitida_por', c.ec_emitida_por,
    'venda_direta', c.negocio_id IS NULL,
    'adendas', coalesce((SELECT jsonb_agg(jsonb_build_object('referencia', a.referencia, 'contract_id', ca.id, 'order_number', ca.order_number,
                  'emitida_em', ca.ec_emitida_em, 'emitida_por', ca.ec_emitida_por) ORDER BY a.numero)
                FROM adendas a JOIN client_contracts ca ON ca.adenda_id = a.id
                WHERE a.negocio_id = p_negocio AND ca.deleted_at IS NULL AND ca.replaced_by_contract_id IS NULL
                  AND ca.status IN ('signed', 'assinado') AND ca.ec_emitida_em IS NOT NULL), '[]'::jsonb)) END
  FROM (SELECT 1) x
  LEFT JOIN client_contracts c ON c.id = public.fn_neg_contrato_ec(p_negocio) AND c.ec_emitida_em IS NOT NULL
$$;
COMMENT ON FUNCTION public.fn_neg_ler_ec(uuid) IS 'Negócio da Emylia: a encomenda de cliente emitida (contrato, número, quando, por quem) e as das adendas; null antes de emitida. 20261231999700.';
REVOKE ALL ON FUNCTION public.fn_neg_ler_ec(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_ler_ec(uuid) TO service_role;

-- ------------------------------------------------------------------ 4. a encomenda de cliente, quando está pronta
-- Pronta = a 1.ª prestação do orçamento aceite tem fatura registada e pagamento validado (por esta ordem: não há pagamento sem fatura).
-- Idempotente: o negócio fica preso (FOR UPDATE) e um contrato com ec_emitida_em não se volta a emitir.
CREATE OR REPLACE FUNCTION public.fn_neg_emitir_ec_se_pronta(p_negocio uuid, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_neg negocios; v_q quotes; v_c client_contracts; v_pago timestamptz; v_por text; v_autor uuid; v_nome text;
  v_nova boolean := false; v_ads jsonb := '[]'::jsonb; v_r jsonb; r record;
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

  IF v_pago IS NOT NULL AND v_c.id IS NULL AND v_q.venda_direta THEN
    -- venda direta: o contrato de suporte, como rpc_create_direct_sale_order (rascunho ligado ao orçamento aceite e promovido a assinado na
    -- mesma transação: os gatilhos AFTER UPDATE OF status reservam o stock e pedem ao fornecedor o que falta). Fica sem negócio (o CRM
    -- não liga contratos a um negócio que fecha na proposta nem a um negócio ganho) e já emitido (ec_emitida_em).
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
  ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL THEN
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = v_c.id RETURNING * INTO v_c;
    v_nova := true;
    -- o que falta pede-se ao fornecedor (como o gatilho do CRM faz na assinatura, aqui na emissão); nunca faz falhar a validação
    BEGIN
      v_r := public.fn_client_order_request_missing(v_c.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
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
    BEGIN
      v_r := public.fn_client_order_request_missing(r.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    v_ads := v_ads || jsonb_build_object('referencia', r.referencia, 'contract_id', r.id,
      'order_number', (SELECT order_number FROM client_contracts WHERE id = r.id));
  END LOOP;

  -- a encomenda emitida põe o negócio na Obra
  IF coalesce(v_neg.fase, 0) < 5 THEN
    UPDATE negocios SET fase = 5 WHERE id = p_negocio;
  END IF;

  RETURN jsonb_build_object('emitida', true, 'nova', v_nova, 'contract_id', v_c.id, 'order_number', v_c.order_number,
    'emitida_em', v_c.ec_emitida_em, 'adendas', v_ads);
END $$;
COMMENT ON FUNCTION public.fn_neg_emitir_ec_se_pronta(uuid, uuid) IS 'Negócio da Emylia: emite a encomenda de cliente (contrato em vigor ou, na venda direta, de suporte) e as das adendas pagas, quando a 1.ª prestação tem fatura e pagamento; põe a fase 5. Idempotente. 20261231999700.';
REVOKE ALL ON FUNCTION public.fn_neg_emitir_ec_se_pronta(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_emitir_ec_se_pronta(uuid, uuid) TO service_role;

-- ------------------------------------------------------------------ 2. registar a fatura (emitida no Eticadata)
-- p_chave: a prestação do contrato ("unica", "t<n>" ou "p<n>", n a partir de 1) ou a parcela de uma adenda ("<referência>#<i>", i a
-- partir de 0, a chave de sempre das faturas das adendas). p_erp: o que se sabe da fatura (a leitura do Eticadata ou o formulário):
-- data, total ou valor, atcud, nif, vencimento, pago, lidaEm, bd ou erp_ref, referencia_mb, pdf. Só se gravam as colunas que faturas tem.
CREATE OR REPLACE FUNCTION public.neg_registar_fatura(p_org uuid, p_negocio uuid, p_chave text, p_numero text, p_erp jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    IF NOT FOUND OR NOT (coalesce(v_q.venda_direta, false) OR public.fn_neg_contrato_ec(p_negocio) IS NOT NULL) THEN
      RAISE EXCEPTION 'Ainda não há contrato assinado nem venda direta aceite: a fatura regista-se depois.' USING ERRCODE = 'NE008';
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
END $$;
COMMENT ON FUNCTION public.neg_registar_fatura(uuid, uuid, text, text, jsonb) IS 'Negócio da Emylia: regista a fatura emitida no Eticadata de uma prestação do contrato ou de uma parcela de adenda (negocios.registar_fatura). Única por (organização, número); idempotente. 20261231999700.';
REVOKE ALL ON FUNCTION public.neg_registar_fatura(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_registar_fatura(uuid, uuid, text, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------------ 3. validar o pagamento (sai o recibo)
-- p_fatura: o número da fatura (ou a sua chave). Sem fatura registada, recusa. O recibo é o do ERP (p_recibo_erp) ou numera-se aqui,
-- "RC <ano>/<n>", com um cadeado por organização e ano (dois pedidos ao mesmo tempo não repetem o número; há também o índice único).
CREATE OR REPLACE FUNCTION public.neg_validar_pagamento(p_org uuid, p_negocio uuid, p_fatura text, p_valor numeric DEFAULT NULL, p_data date DEFAULT NULL,
  p_referencia text DEFAULT NULL, p_recibo_erp text DEFAULT NULL, p_conta text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'negocios.validar_pagamento');
  v_neg negocios; v_f faturas; v_pg uuid; v_rc text; v_rc_existente text; v_ano int; v_n int; v_valor numeric; v_quando timestamptz;
  v_primeira boolean; v_ec jsonb; v_ja boolean := false;
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF NOT coalesce(v_neg.fluxo_emylia, false) THEN
    RAISE EXCEPTION 'Este negócio é do CRM: o pagamento valida-se em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;
  IF v_neg.anulado_em IS NOT NULL THEN
    RAISE EXCEPTION 'O contrato deste negócio foi anulado: já não se validam pagamentos.' USING ERRCODE = 'NE007';
  END IF;

  SELECT * INTO v_f FROM faturas
  WHERE organization_id = p_org AND negocio_id = p_negocio AND estado <> 'anulada'
    AND (numero = btrim(coalesce(p_fatura, '')) OR chave = btrim(coalesce(p_fatura, '')))
  ORDER BY (numero = btrim(coalesce(p_fatura, ''))) DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registe primeiro a fatura: sem a fatura do Eticadata não se valida o pagamento.' USING ERRCODE = 'NE010';
  END IF;

  -- já validado: devolve o recibo que tem (idempotente)
  SELECT pg.id, rc.numero INTO v_pg, v_rc_existente FROM pagamentos pg LEFT JOIN recibos rc ON rc.pagamento_id = pg.id
  WHERE pg.fatura_id = v_f.id AND pg.validado_em IS NOT NULL ORDER BY pg.validado_em LIMIT 1;
  IF v_pg IS NOT NULL THEN
    v_ja := true;
    v_rc := v_rc_existente;
  ELSE
    v_valor := coalesce(p_valor, v_f.total);
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor do pagamento inválido.' USING ERRCODE = 'NE006'; END IF;
    v_quando := coalesce(p_data::timestamptz, now());
    IF nullif(btrim(coalesce(p_recibo_erp, '')), '') IS NOT NULL THEN
      v_rc := btrim(p_recibo_erp);
      IF EXISTS (SELECT 1 FROM recibos WHERE organization_id = p_org AND numero = v_rc) THEN
        RAISE EXCEPTION 'O recibo % já está registado.', v_rc USING ERRCODE = 'NE009';
      END IF;
    ELSE
      v_ano := extract(year FROM current_date)::int;
      PERFORM pg_advisory_xact_lock(hashtextextended('recibos_numero:' || p_org::text || ':' || v_ano, 0));
      SELECT coalesce(max((regexp_match(numero, '^RC ' || v_ano || '/([0-9]+)$'))[1]::int), 0) + 1 INTO v_n
      FROM recibos WHERE organization_id = p_org AND numero LIKE 'RC ' || v_ano || '/%';
      v_rc := 'RC ' || v_ano || '/' || v_n;
    END IF;
    -- o aviso do cliente no portal (comunicado, por validar) passa a validado; senão nasce o pagamento
    SELECT id INTO v_pg FROM pagamentos WHERE fatura_id = v_f.id AND validado_em IS NULL AND recusado_motivo IS NULL ORDER BY comunicado_em LIMIT 1;
    IF v_pg IS NOT NULL THEN
      UPDATE pagamentos SET valor = v_valor, validado_em = v_quando, validado_por = v_user,
        conta_destino = coalesce(nullif(btrim(coalesce(p_conta, '')), ''), conta_destino),
        referencia = coalesce(nullif(btrim(coalesce(p_referencia, '')), ''), referencia)
      WHERE id = v_pg;
    ELSE
      INSERT INTO pagamentos (organization_id, fatura_id, metodo, valor, conta_destino, referencia, comunicado_em, validado_em, validado_por)
      VALUES (p_org, v_f.id, 'transferencia', v_valor, nullif(btrim(coalesce(p_conta, '')), ''), nullif(btrim(coalesce(p_referencia, '')), ''),
        v_quando, v_quando, v_user)
      RETURNING id INTO v_pg;
    END IF;
    INSERT INTO recibos (organization_id, pagamento_id, numero, emitido_em, erp_ref)
    VALUES (p_org, v_pg, v_rc, now(), CASE WHEN nullif(btrim(coalesce(p_recibo_erp, '')), '') IS NOT NULL THEN v_rc END);
    UPDATE faturas SET estado = 'paga' WHERE id = v_f.id;
  END IF;

  -- a fatura da 1.ª prestação do contrato é a do negócio: paga, com o recibo
  v_primeira := v_f.chave IS NOT NULL AND position('#' IN v_f.chave) = 0 AND EXISTS (
    SELECT 1 FROM quote_prestacoes p WHERE p.id = v_f.quote_prestacao_id
      AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = p.quote_id));
  IF v_primeira AND NOT v_ja THEN
    UPDATE negocios SET fatura_numero = v_f.numero, fatura_em = coalesce(fatura_em, v_f.emitida_em), fatura_paga = true,
      recibo_numero = v_rc, recibo_em = now()
    WHERE id = p_negocio;
  END IF;

  v_ec := public.fn_neg_emitir_ec_se_pronta(p_negocio, v_user);
  RETURN jsonb_build_object('fatura', v_f.numero, 'chave', v_f.chave, 'recibo', v_rc, 'pagamento_id', v_pg, 'ja_validado', v_ja,
    'primeira', v_primeira, 'ec', v_ec);
END $$;
COMMENT ON FUNCTION public.neg_validar_pagamento(uuid, uuid, text, numeric, date, text, text, text) IS 'Negócio da Emylia: valida o pagamento de uma fatura registada (negocios.validar_pagamento) e emite o recibo (do ERP ou RC aaaa/n, numerado com cadeado por organização e ano); com a 1.ª prestação emite a encomenda de cliente. Idempotente. 20261231999700.';
REVOKE ALL ON FUNCTION public.neg_validar_pagamento(uuid, uuid, text, numeric, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_validar_pagamento(uuid, uuid, text, numeric, date, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------ 5. anular o contrato (ou a venda direta)
-- A EC do CRM é o próprio contrato: cancelá-lo põe a correr os gatilhos de estorno que já existem (fn_contract_cancelled_stock_reversal,
-- fn_contract_cancelled_supplier_request_reversal: só anulam as POs por enviar). Uma PO já encomendada ao fornecedor segura a anulação.
CREATE OR REPLACE FUNCTION public.neg_anular_contrato(p_org uuid, p_negocio uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'client_contracts.cancel');
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_neg negocios; v_c uuid; v_vd boolean; v_ids uuid[]; v_pos text; v_por text; v_n int;
BEGIN
  IF char_length(v_motivo) < 3 OR char_length(v_motivo) > 900 THEN
    RAISE EXCEPTION 'Escreva o motivo (3 a 900 caracteres).' USING ERRCODE = 'NE006';
  END IF;
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF NOT coalesce(v_neg.fluxo_emylia, false) THEN
    RAISE EXCEPTION 'Este negócio é do CRM: o contrato anula-se em Contratos.' USING ERRCODE = 'NE005';
  END IF;
  IF v_neg.anulado_em IS NOT NULL THEN
    RETURN jsonb_build_object('anulado', true, 'ja_anulado', true);
  END IF;

  v_c := public.fn_neg_contrato_ec(p_negocio);
  v_vd := EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.venda_direta AND q.adenda_id IS NULL
                  AND q.deleted_at IS NULL AND q.estado = 'aceite');
  IF v_c IS NULL AND NOT v_vd THEN
    RAISE EXCEPTION 'Não há contrato para anular: só se anula um contrato assinado ou uma venda direta aceite.' USING ERRCODE = 'NE008';
  END IF;

  -- o contrato em vigor (ou o de suporte) e os das adendas assinadas
  SELECT array_agg(c.id) INTO v_ids FROM client_contracts c
  WHERE c.deleted_at IS NULL AND c.replaced_by_contract_id IS NULL AND c.status IN ('signed', 'assinado')
    AND (c.id = v_c OR c.adenda_id IN (SELECT a.id FROM adendas a WHERE a.negocio_id = p_negocio));

  SELECT string_agg(coalesce(po.order_number, po.id::text), ', ' ORDER BY po.order_number) INTO v_pos
  FROM purchase_orders po
  WHERE po.source_type = 'contract' AND po.source_id = ANY (coalesce(v_ids, '{}'::uuid[])) AND po.status NOT IN ('pending', 'cancelled');
  IF v_pos IS NOT NULL THEN
    RAISE EXCEPTION 'Há encomendas a fornecedor já encomendadas (%): anule-as ou receba-as no Inventário antes de anular o contrato.', v_pos
      USING ERRCODE = 'NE011';
  END IF;

  v_por := coalesce((SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM anew_users u WHERE u.id = v_user), 'Direção');
  UPDATE client_contracts SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user, cancellation_reason = v_motivo,
    status_changed_by = v_user, status_changed_at = now()
  WHERE id = ANY (coalesce(v_ids, '{}'::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- o negócio: anulado e perdido, com o motivo (o fecho do CRM vê-o perdido e não o mexe outra vez)
  UPDATE negocios SET anulado_em = now(), anulado_por = v_por, anulado_motivo = v_motivo, anulado_origem = 'negocio' WHERE id = p_negocio;
  IF v_neg.estado <> 'perdido' THEN
    PERFORM public.fn_neg_mudar_estado(p_negocio, 'perdido', 'contrato',
      (CASE WHEN v_vd THEN 'Venda anulada: ' ELSE 'Contrato anulado: ' END) || v_motivo, NULL,
      'contrato', v_c, 'cancelled', public.fn_neg_canal(public.fn_negocios_actor(), NULL), NULL, NULL,
      CASE WHEN v_vd THEN 'Venda direta anulada' ELSE 'Contrato anulado' END);
  END IF;

  RETURN jsonb_build_object('anulado', true, 'ja_anulado', false, 'contratos', v_n, 'venda_direta', v_vd);
END $$;
COMMENT ON FUNCTION public.neg_anular_contrato(uuid, uuid, text) IS 'Negócio da Emylia: anula o contrato assinado ou a venda direta (client_contracts.cancel): cancela a encomenda de cliente e as das adendas (os gatilhos estornam), recusa com POs já encomendadas, marca o negócio anulado e perdido. 20261231999700.';
REVOKE ALL ON FUNCTION public.neg_anular_contrato(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_anular_contrato(uuid, uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------------ 6. gravar: o Financeiro deixa de vir do JSON (texto vivo da 20261231994000)
CREATE OR REPLACE FUNCTION public.neg_guardar_negocio(p_org uuid, p_negocio_id uuid, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; b jsonb := p_linhas->'negocio'; e jsonb; o jsonb; l jsonb; k jsonb;
  v_q uuid; v_l uuid; v_z uuid; v_prop uuid; v_atual uuid; v_aceite uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid;
  i int; v_iva numeric; v_tot numeric; v_estado text; v_status text; v_ids uuid[] := '{}'; v_avisos text[] := '{}';
  v_docs_crm boolean; v_q_base text; v_c_base text; v_fixo boolean;
  v_min smallint; v_fase smallint; v_ignorado boolean := false;
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;

  -- um negócio do CRM (orçamentos, contratos ou vendas diretas do CRM) não se grava por aqui: abre-se em Contratos/Propostas; e o
  -- negócio só passa ao fluxo da Emylia se não tiver documentos do CRM (com fluxo_emylia a encomenda do CRM deixava de reservar) (20261231994000)
  v_docs_crm := public.fn_neg_docs_crm(p_negocio_id);
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND v_docs_crm THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- a fase 4 (contrato assinado ou venda direta aceite) e a 5 (encomenda de cliente emitida) são do servidor, como a fatura, o
  -- pagamento, o recibo e a anulação (neg_registar_fatura, neg_validar_pagamento, neg_anular_contrato): do JSON fica só a fase até ao
  -- Negócio (3); o resto fica o da base, com aviso (20261231999700)
  v_min := public.fn_neg_fase_minima(p_negocio_id);
  v_fase := CASE WHEN v_neg.anulado_em IS NOT NULL THEN v_neg.fase
                 WHEN v_min > 0 THEN v_min
                 ELSE least(coalesce((b->>'fase')::smallint, 0), 3)::smallint END;
  IF b ? 'fase' AND (b->>'fase')::smallint IS DISTINCT FROM v_fase AND greatest(coalesce((b->>'fase')::smallint, 0), coalesce(v_fase, 0)) >= 4 THEN
    v_avisos := v_avisos || format('A fase %s só a dão o portal e o Financeiro (ficou %s).', b->>'fase', coalesce(v_fase, 0));
  END IF;
  IF (b ? 'fatura_numero' AND b->>'fatura_numero' IS DISTINCT FROM v_neg.fatura_numero)
     OR (b ? 'fatura_paga' AND coalesce((b->>'fatura_paga')::boolean, false) IS DISTINCT FROM coalesce(v_neg.fatura_paga, false))
     OR (b ? 'recibo_numero' AND b->>'recibo_numero' IS DISTINCT FROM v_neg.recibo_numero)
     OR (b ? 'anulado_em' AND (b->>'anulado_em' IS NULL) IS DISTINCT FROM (v_neg.anulado_em IS NULL)) THEN
    v_ignorado := true;
  END IF;

  -- o negócio (o título só muda num negócio aberto: o CRM protege o dos fechados)
  UPDATE negocios SET fase = v_fase, linha = b->>'linha', linha_por_definir = coalesce((b->>'linha_por_definir')::boolean, false),
    servico_pedido = b->>'servico_pedido', morada_obra = b->>'morada_obra', origem = b->>'origem', pedido_em = (b->>'pedido_em')::timestamptz,
    dono_papel = b->>'dono_papel',
    fluxo_emylia = coalesce(v_neg.fluxo_emylia, false) OR NOT v_docs_crm,
    titulo = CASE WHEN v_neg.estado = 'aberto' AND coalesce(b->>'titulo', '') <> '' THEN b->>'titulo' ELSE titulo END
  WHERE id = p_negocio_id;

  -- respostas, medidas, serviços e produtos da visita, partes tiradas, histórico (substituem-se)
  DELETE FROM negocio_respostas WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, valor, sugerido, atualizado_por)
  SELECT p_org, p_negocio_id, x->>'campo_chave', coalesce(x->>'valor', ''), coalesce((x->>'sugerido')::boolean, false), v_user
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'respostas')) x;
  e := p_linhas->'medidas';
  INSERT INTO negocio_medidas AS m (organization_id, negocio_id, pav, par, ptf, ptq, pts, pcs, necessidades, slot, fotos_total, fotos_exterior, fotos_interior, fotos_area, fechada, visitas)
  VALUES (p_org, p_negocio_id, coalesce((e->>'pav')::numeric, 0), coalesce((e->>'par')::numeric, 0), coalesce((e->>'ptf')::numeric, 0), coalesce((e->>'ptq')::numeric, 0),
    coalesce((e->>'pts')::numeric, 0), coalesce((e->>'pcs')::numeric, 0), ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(e->'necessidades'))), e->>'slot',
    coalesce((e->>'fotos_total')::smallint, 0), coalesce((e->>'fotos_exterior')::smallint, 0), coalesce((e->>'fotos_interior')::smallint, 0),
    coalesce((e->>'fotos_area')::smallint, 0), coalesce((e->>'fechada')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'visitas'))::smallint))
  ON CONFLICT (negocio_id) DO UPDATE SET pav = EXCLUDED.pav, par = EXCLUDED.par, ptf = EXCLUDED.ptf, ptq = EXCLUDED.ptq, pts = EXCLUDED.pts, pcs = EXCLUDED.pcs,
    necessidades = EXCLUDED.necessidades, slot = EXCLUDED.slot, fotos_total = EXCLUDED.fotos_total, fotos_exterior = EXCLUDED.fotos_exterior,
    fotos_interior = EXCLUDED.fotos_interior, fotos_area = EXCLUDED.fotos_area, fechada = EXCLUDED.fechada, visitas = EXCLUDED.visitas;
  DELETE FROM negocio_servicos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_servicos (organization_id, negocio_id, servico_id, inclusao, quantidade, mantem, cliente_compra, ordem)
  SELECT p_org, p_negocio_id, (x->>'servico')::uuid, x->>'inclusao', (x->>'quantidade')::numeric, (x->>'mantem')::boolean, x->>'cliente_compra', coalesce((x->>'ordem')::int, 0)
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'servicos')) x;
  DELETE FROM negocio_produtos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_produtos (organization_id, negocio_id, produto_id, quantidade, cliente_fornece, servico_id, sem_instalacao, ordem, nome, unidade, custo_un, pvp_un, categoria_id, fator)
  SELECT p_org, p_negocio_id, (x->>'produto')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid,
    coalesce((x->>'sem_instalacao')::boolean, false), (x->>'ordem')::int, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
    (x->>'categoria')::uuid, (x->>'fator')::numeric
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'produtos')) x;
  DELETE FROM negocio_partes_fora WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_partes_fora (organization_id, negocio_id, parte)
  SELECT DISTINCT p_org, p_negocio_id, x FROM jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'partes_fora')) x;
  DELETE FROM negocio_historico WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)
  SELECT p_org, p_negocio_id, (x->>'ordem')::int, coalesce((x->>'ocorrido_em')::timestamptz, now()), x->>'texto', x->>'tipo', NULL
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'historico')) x;

  -- orçamentos (quotes), uma linha por versão
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'orcamentos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id INTO v_q FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND versao = (o->>'versao')::smallint;
    IF v_q IS NULL THEN
      INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, modelo_base, versao, fluxo_emylia, estado)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero || ' · versão ' || (o->>'versao'),
        coalesce(o->>'modelo', ''), (o->>'versao')::smallint, true, 'rascunho')
      RETURNING id INTO v_q;
    END IF;
    -- a decisão do cliente (aceite, recusado) só a escreve o portal: a versão decidida fica como está (só passa a substituída, quando
    -- há versão nova); o JSON não a dá como aceite nem recusada; accepted_at, recusada_em e recusa_* ficam os da base (20261231994000)
    SELECT estado INTO v_q_base FROM quotes WHERE id = v_q;
    v_estado := o->>'estado';
    IF v_q_base IN ('aceite', 'rejeitado', 'recusado') THEN
      IF v_estado IS DISTINCT FROM 'substituido' THEN v_estado := v_q_base; END IF;
    ELSIF v_estado IN ('aceite', 'recusado', 'rejeitado') THEN
      v_avisos := v_avisos || format('Orçamento versão %s: a decisão do cliente só se regista no portal (ficou %s).', o->>'versao', coalesce(v_q_base, 'rascunho'));
      v_estado := coalesce(v_q_base, 'rascunho');
    END IF;
    UPDATE quotes SET modelo_base = coalesce(o->>'modelo', ''), estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
      desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2), venda_direta = coalesce((o->>'venda_direta')::boolean, false),
      inicio_obra = (o->>'inicio_obra')::date, equipa = (o->>'equipa')::smallint,
      verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END,
      aprovacao = o->>'aprovacao', motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos_versao'))), nota_versao = o->>'nota_versao',
      onde_refeita = o->>'onde_refeita',
      pedido_cliente_motivos = CASE WHEN o->'pedido_cliente' IS NOT NULL AND jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(o->'pedido_cliente'->'motivos')) END,
      pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
      enviado_em = (o->>'enviado_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
      aceite_antes_em = (o->>'aceite_antes_em')::timestamptz, preco_final = (o->>'preco_final')::numeric, total_com_iva = (o->>'total_com_iva')::numeric,
      subtotal = coalesce((o->>'preco_final')::numeric, subtotal), total = coalesce((o->>'total_com_iva')::numeric, total),
      prestacoes_por_fases = coalesce((o->>'prestacoes_por_fases')::boolean, false), sem_demolicao = coalesce((o->>'sem_demolicao')::boolean, false), updated_at = now()
    WHERE id = v_q;
    IF v_estado <> 'substituido' THEN v_atual := v_q; END IF;
    IF v_estado = 'aceite' THEN v_aceite := v_q; END IF;

    -- as linhas de uma versão aceite, assinada, com a encomenda emitida ou já usadas (encomenda a fornecedor, tarefa da obra) não se
    -- apagam nem se reescrevem: os ids ficam; se o JSON divergir, avisa-se (20261231994000)
    v_fixo := v_q_base = 'aceite'
      OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.quote_id = v_q AND c.deleted_at IS NULL
                 AND (c.status IN ('signed', 'assinado', 'active') OR c.ec_emitida_em IS NOT NULL))
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN purchase_order_items pi ON pi.quote_line_id = ql.id WHERE ql.quote_id = v_q)
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN ops_obra_tarefa t ON t.orcamento_linha_id = ql.id WHERE ql.quote_id = v_q);
    IF v_fixo THEN
      IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> jsonb_array_length(public.fn_neg_lista(o->'linhas'))
         OR (SELECT coalesce(sum(total_sem_iva), 0) FROM quote_lines WHERE quote_id = v_q)
            <> (SELECT coalesce(sum(round((x->>'quantidade')::numeric * (x->>'preco_un')::numeric, 2)), 0) FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) x) THEN
        v_avisos := v_avisos || format('Orçamento versão %s: já está aceite ou em curso, as linhas ficaram como estavam.', o->>'versao');
      END IF;
    ELSE
    -- linhas (substituem-se; as filhas vão com elas) e zonas
    DELETE FROM quote_lines WHERE quote_id = v_q;
    DELETE FROM quote_zonas WHERE quote_id = v_q;
    i := 0;
    FOR k IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'zonas')) LOOP
      i := i + 1;
      INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome) VALUES (p_org, v_q, i, k #>> '{}');
    END LOOP;
    -- as zonas que as linhas usam e não estão na lista (as versões anteriores não guardam a lista): criam-se pela ordem em que aparecem
    INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome)
    SELECT p_org, v_q, (SELECT coalesce(max(ordem), 0) FROM quote_zonas WHERE quote_id = v_q) + row_number() OVER (ORDER BY min(x.pos)), x.nome
    FROM (SELECT z.v->>'zona' AS nome, ln.n * 1000 + z.n AS pos
          FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) WITH ORDINALITY ln(v, n),
               jsonb_array_elements(public.fn_neg_lista(ln.v->'zonas')) WITH ORDINALITY z(v, n)) x
    WHERE NOT EXISTS (SELECT 1 FROM quote_zonas q2 WHERE q2.quote_id = v_q AND lower(btrim(q2.nome)) = lower(btrim(x.nome)))
    GROUP BY x.nome;
    FOR l IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) LOOP
      v_iva := coalesce((l->>'taxa_iva')::numeric, CASE WHEN l->>'parte_iva' = 'mao_obra' THEN 6 ELSE 23 END);
      v_tot := round((l->>'quantidade')::numeric * (l->>'preco_un')::numeric, 2);
      INSERT INTO quote_lines (quote_id, categoria, descricao_snapshot, qt, quantidade_exata, retail_price_unit, preco_un_exato, cost_price, custo_un_exato,
        iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, product_id, unidade, section_name, tipo_emylia, custo_manual, fornecedor,
        qtd_origem, preco_un_origem, custo_un_origem, custo_mao_obra_unit, custo_material_unit, margem_percent)
      VALUES (v_q, CASE WHEN l->>'tipo' = 'servico' THEN 'Serviços' ELSE 'Materiais' END,
        coalesce((SELECT s.name FROM services s WHERE s.id = (l->>'servico')::uuid), l->>'descricao', ''),
        -- uma linha de produto guarda o total (quantidade 1); qt e o preço unitário do CRM ficam com a quantidade real do produto, para a
        -- reserva e o pedido ao fornecedor da encomenda de cliente o verem (20261231980000)
        CASE WHEN l->>'tipo' = 'produto' AND l->>'qtd_origem' IS NOT NULL THEN round((l->>'qtd_origem')::numeric, 2) ELSE round((l->>'quantidade')::numeric, 2) END,
        (l->>'quantidade')::numeric,
        CASE WHEN l->>'tipo' = 'produto' AND l->>'preco_un_origem' IS NOT NULL THEN round((l->>'preco_un_origem')::numeric, 2) ELSE round((l->>'preco_un')::numeric, 2) END,
        (l->>'preco_un')::numeric,
        (l->'custo'->>'custo_un')::numeric, (l->'custo'->>'custo_un')::numeric, v_iva, l->>'taxa_iva' IS NOT NULL,
        v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int, (l->>'servico')::uuid, (l->>'produto')::uuid, l->>'unidade',
        coalesce(l->'zonas'->0->>'zona', 'Geral'), l->>'tipo', coalesce((l->'custo'->>'manual')::boolean, false), l->>'fornecedor',
        (l->>'qtd_origem')::numeric, (l->>'preco_un_origem')::numeric, (l->>'custo_un_origem')::numeric,
        CASE WHEN l->>'tipo' = 'servico' THEN round((l->'custo'->>'custo_un')::numeric, 2) ELSE 0 END,
        CASE WHEN l->>'tipo' = 'servico' THEN 0 ELSE round((l->'custo'->>'custo_un')::numeric, 2) END, 0)
      RETURNING id INTO v_l;
      k := l->'custo';
      INSERT INTO quote_line_custos (organization_id, quote_line_id, congelado, congelado_em, horas_un, mao_obra_un, equipamentos_un, consumiveis_un, estrutura_hora, estrutura_un, ajuste_un)
      VALUES (p_org, v_l, coalesce((k->>'congelado')::boolean, false), (k->>'congelado_em')::timestamptz, coalesce((k->>'horas_un')::numeric, 0),
        coalesce((k->>'mao_obra_un')::numeric, 0), coalesce((k->>'equipamentos_un')::numeric, 0), coalesce((k->>'consumiveis_un')::numeric, 0),
        coalesce((k->>'estrutura_hora')::numeric, 0), coalesce((k->>'estrutura_un')::numeric, 0), coalesce((k->>'ajuste_un')::numeric, 0));
      INSERT INTO quote_line_oficios (organization_id, quote_line_id, ordem, perfil_chave, nome, horas_un, custo_hora, tecnicos)
      SELECT p_org, v_l, (x.n - 1)::smallint, x.v->>'perfil_chave', x.v->>'nome', (x.v->>'horas_un')::numeric, (x.v->>'custo_hora')::numeric,
        CASE WHEN jsonb_typeof(x.v->'tecnicos') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(x.v->'tecnicos')) END
      FROM jsonb_array_elements(public.fn_neg_lista(k->'oficios')) WITH ORDINALITY x(v, n);
      INSERT INTO quote_line_zonas (organization_id, quote_line_id, zona_id, ordem, quantidade, valor)
      SELECT p_org, v_l, z.id, (x.n - 1)::smallint, (x.v->>'quantidade')::numeric, (x.v->>'valor')::numeric
      FROM jsonb_array_elements(public.fn_neg_lista(l->'zonas')) WITH ORDINALITY x(v, n)
      JOIN quote_zonas z ON z.quote_id = v_q AND lower(btrim(z.nome)) = lower(btrim(x.v->>'zona'));
    END LOOP;
    -- uma linha com zonas cujo nome não está na lista de zonas do orçamento: a zona cria-se (a Emylia deixa)
    -- (não acontece nos dados da Emylia: as zonas das linhas vêm da lista; fica a nota)
    END IF;

    DELETE FROM quote_prazo WHERE quote_id = v_q;
    INSERT INTO quote_prazo (organization_id, quote_id, tarefa, dias)
    SELECT p_org, v_q, x->>'tarefa', (x->>'dias')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'prazo')) x;
    -- prestações: as faturas apontam para elas, por isso atualizam-se pela ordem em vez de se apagarem
    INSERT INTO quote_prestacoes AS qp (organization_id, quote_id, ordem, rotulo, pct, marco, fase)
    SELECT p_org, v_q, (x->>'ordem')::smallint, x->>'rotulo', (x->>'pct')::numeric, x->>'marco', (x->>'fase')::smallint
    FROM jsonb_array_elements(public.fn_neg_lista(o->'prestacoes')) x
    ON CONFLICT (quote_id, ordem) DO UPDATE SET rotulo = EXCLUDED.rotulo, pct = EXCLUDED.pct, marco = EXCLUDED.marco, fase = EXCLUDED.fase;
    DELETE FROM quote_prestacoes p WHERE p.quote_id = v_q
      AND p.ordem > jsonb_array_length(public.fn_neg_lista(o->'prestacoes'))
      AND NOT EXISTS (SELECT 1 FROM faturas f WHERE f.quote_prestacao_id = p.id);
    DELETE FROM quote_avisos_vistos WHERE quote_id = v_q;
    INSERT INTO quote_avisos_vistos (organization_id, quote_id, chave) SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'avisos')) x;
    DELETE FROM quote_precos_manuais WHERE quote_id = v_q;
    INSERT INTO quote_precos_manuais (organization_id, quote_id, descricao, preco)
    SELECT p_org, v_q, x->>'descricao', (x->>'preco')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'precos_manuais')) x;
    DELETE FROM quote_versao_produtos WHERE quote_id = v_q;
    INSERT INTO quote_versao_produtos (organization_id, quote_id, ordem, produto_id, nome, unidade, custo_un, pvp_un, categoria_id, quantidade, cliente_fornece, servico_id, fator, sem_instalacao)
    SELECT p_org, v_q, (x->>'ordem')::int, (x->>'produto')::uuid, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
      (x->>'categoria')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid, (x->>'fator')::numeric,
      coalesce((x->>'sem_instalacao')::boolean, false)
    FROM jsonb_array_elements(public.fn_neg_lista(o->'produtos')) x;
    DELETE FROM quote_versao_partes WHERE quote_id = v_q;
    INSERT INTO quote_versao_partes (organization_id, quote_id, parte)
    SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'partes_fora')) x;
  END LOOP;

  -- a proposta (uma por negócio): nasce no primeiro envio; a versão atual liga-se a ela, as anteriores desligam-se
  SELECT id INTO v_prop FROM proposals WHERE negocio_id = p_negocio_id AND coalesce(is_deleted, false) = false ORDER BY created_at LIMIT 1;
  IF v_prop IS NULL AND EXISTS (SELECT 1 FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND enviado_em IS NOT NULL) THEN
    INSERT INTO proposals (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, value, status)
    VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero, 0, 'draft')
    RETURNING id INTO v_prop;
  END IF;
  IF v_prop IS NOT NULL THEN
    UPDATE quotes SET proposal_id = CASE WHEN id = v_atual THEN v_prop END
    WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND proposal_id IS DISTINCT FROM CASE WHEN id = v_atual THEN v_prop END;
    -- o estado só se sincroniza entre rascunho e enviada; aceite e recusada são do portal (e accepted_at, rejected_at e rejection_notes
    -- também) (20261231994000)
    SELECT CASE q.estado WHEN 'enviado' THEN 'sent' WHEN 'rascunho' THEN 'draft' END INTO v_status
    FROM quotes q WHERE q.id = v_atual;
    UPDATE proposals p SET status = v_status, sent_at = coalesce(q.enviado_em, p.sent_at),
      value = coalesce(q.preco_final, p.value), value_sem_iva = coalesce(q.preco_final, p.value_sem_iva), updated_at = now()
    FROM quotes q WHERE p.id = v_prop AND q.id = v_atual AND v_status IS NOT NULL AND p.status IN ('draft', 'sent', 'viewed')
      AND p.status IS DISTINCT FROM v_status;
  END IF;

  -- contratos (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
  v_c_ant := NULL;
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'contratos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id, status INTO v_c, v_c_base FROM client_contracts WHERE negocio_id = p_negocio_id AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
    IF v_c IS NULL THEN
      -- depois de uma versão assinada no portal não nasce outra: escondia a assinada (20261231994000)
      IF v_c_ant IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE id = v_c_ant AND status IN ('signed', 'assinado', 'active')) THEN
        v_avisos := v_avisos || format('O contrato já está assinado no portal: a versão %s não foi criada.', o->>'versao');
        EXIT;
      END IF;
      INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, negocio_id, created_by, status, versao, quote_id, proposal_id, replaces_contract_id)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'draft', (o->>'versao')::smallint, coalesce(v_aceite, v_atual), v_prop, v_c_ant)
      RETURNING id, status INTO v_c, v_c_base;
    END IF;
    IF v_c_ant IS NOT NULL THEN
      UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
      WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c AND status NOT IN ('signed', 'assinado', 'active', 'rejected', 'cancelled');
    END IF;
    -- um contrato assinado, recusado ou cancelado não se mexe; a assinatura (signature_*, signed_by_name, signature_date) e o estado
    -- assinado só os escreve o portal: "assinado" no JSON ignora-se, com aviso (20261231994000)
    IF v_c_base IN ('signed', 'assinado', 'active', 'rejected', 'cancelled') THEN
      v_c_ant := v_c;
      CONTINUE;
    END IF;
    IF o->>'estado' = 'assinado' THEN v_avisos := v_avisos || 'A assinatura só se faz no portal do cliente.'::text; END IF;
    v_status := CASE o->>'estado' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                  WHEN 'substituido' THEN 'cancelled' WHEN 'assinado' THEN v_c_base ELSE 'draft' END;
    UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
      quote_id = coalesce(quote_id, v_aceite, v_atual), proposal_id = coalesce(proposal_id, v_prop), updated_at = now()
    WHERE id = v_c;
    -- o estado à parte, para os gatilhos do CRM verem a passagem
    UPDATE client_contracts SET status = v_status, status_changed_by = v_user, status_changed_at = now()
    -- a versão substituída só muda de estado quando se liga à seguinte (no mesmo UPDATE): cancelada sem substituta seria perda
    WHERE id = v_c AND status IS DISTINCT FROM v_status AND replaced_by_contract_id IS NULL AND o->>'estado' <> 'substituido';
    DELETE FROM client_contract_pedidos WHERE contract_id = v_c;
    INSERT INTO client_contract_pedidos (organization_id, contract_id, ordem, clausula, nota, pedido_em)
    SELECT p_org, v_c, (x.n - 1)::smallint, x.v->>'clausula', x.v->>'nota', coalesce((x.v->>'pedido_em')::timestamptz, now())
    FROM jsonb_array_elements(public.fn_neg_lista(o->'pedidos')) WITH ORDINALITY x(v, n);
    DELETE FROM client_contract_clausulas WHERE contract_id = v_c;
    INSERT INTO client_contract_clausulas (organization_id, contract_id, titulo, texto)
    SELECT p_org, v_c, x->>'titulo', x->>'texto' FROM jsonb_array_elements(public.fn_neg_lista(o->'clausulas')) x;
    v_c_ant := v_c;
  END LOOP;

  -- a encomenda de cliente nasce no servidor (fn_neg_emitir_ec_se_pronta: fatura registada e pagamento validado): a do JSON ignora-se
  -- (20261231999700)
  IF jsonb_typeof(p_linhas->'ec') = 'object' AND public.fn_neg_fase_minima(p_negocio_id) < 5 THEN
    v_ignorado := true;
  END IF;

  -- as faturas, os pagamentos e os recibos são do Financeiro (neg_registar_fatura, neg_validar_pagamento): do JSON só o PDF de uma
  -- fatura que já existe; uma fatura nova ou um pagamento por validar ficam de fora, com aviso (20261231999700)
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'faturas')) LOOP
    SELECT id INTO v_f FROM faturas WHERE negocio_id = p_negocio_id AND chave = o->>'chave';
    IF v_f IS NULL THEN v_ignorado := true; CONTINUE; END IF;
    UPDATE faturas SET pdf_caminho = coalesce(o->>'pdf_caminho', pdf_caminho) WHERE id = v_f;
    IF jsonb_typeof(o->'pagamento') = 'object'
       AND NOT EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = v_f AND validado_em IS NOT NULL) THEN
      v_ignorado := true;
    END IF;
  END LOOP;

  -- as adendas (20261231990000); os avisos delas juntam-se aos do negócio (20261231994000)
  v_avisos := v_avisos || public.fn_neg_guardar_adendas(p_org, p_negocio_id, p_linhas->'adendas', v_user);

  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)
  v_avisos := v_avisos || public.fn_neg_sincronizar_visitas(p_org, p_negocio_id, p_linhas->'respostas', p_linhas->'visitas');

  IF v_ignorado THEN
    v_avisos := v_avisos || 'A fatura, o pagamento, o recibo, a encomenda de cliente e a anulação só se registam no Financeiro: ficou o que está na base.'::text;
  END IF;

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $function$
;
REVOKE ALL ON FUNCTION public.neg_guardar_negocio(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_negocio(uuid, uuid, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------------ 6. as adendas: as faturas, os pagamentos e a EC deixam de vir do JSON (texto vivo da 20261231994000)
CREATE OR REPLACE FUNCTION public.fn_neg_guardar_adendas(p_org uuid, p_negocio_id uuid, p_adendas jsonb, p_user uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg negocios; a jsonb; o jsonb; l jsonb; e jsonb;
  v_ad uuid; v_q uuid; v_atual uuid; v_base uuid; v_l uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid; v_pr uuid;
  v_iva numeric; v_tot numeric; v_base_mo numeric; v_status text; v_pago timestamptz;
  v_estado text; v_q_base text; v_c_base text; v_fixo boolean; v_avisos text[] := '{}';
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org;
  -- as parcelas das adendas são as do contrato: as do orçamento aceite em vigor
  SELECT id INTO v_base FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND estado = 'aceite' ORDER BY versao DESC LIMIT 1;

  FOR a IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_adendas)) ORDER BY (value->>'numero')::int LOOP
    INSERT INTO adendas AS x (organization_id, negocio_id, numero, referencia, estado, motivo, imprevisto_ref, origem_texto, origem_onde, origem_foto,
      criada_em, enviada_em, aceite_em, assinada_em, recusada_em, recusa_motivo, anulada_em, total, total_com_iva, vista)
    VALUES (p_org, p_negocio_id, (a->>'numero')::smallint, a->>'referencia', a->>'estado', coalesce(a->>'motivo', ''),
      a->'origem'->>'imprevisto', a->'origem'->>'texto', a->'origem'->>'onde', a->'origem'->>'foto',
      coalesce((a->>'criada_em')::timestamptz, now()), (a->>'enviada_em')::timestamptz, (a->>'aceite_em')::timestamptz, (a->>'assinada_em')::timestamptz,
      (a->>'recusada_em')::timestamptz, a->>'recusa', CASE WHEN a->>'estado' = 'anulada' THEN now() END,
      (a->>'total')::numeric, (a->>'total_com_iva')::numeric, coalesce((a->>'vista')::boolean, false))
    ON CONFLICT (negocio_id, numero) DO UPDATE SET referencia = EXCLUDED.referencia, estado = EXCLUDED.estado, motivo = EXCLUDED.motivo,
      imprevisto_ref = EXCLUDED.imprevisto_ref, origem_texto = EXCLUDED.origem_texto, origem_onde = EXCLUDED.origem_onde, origem_foto = EXCLUDED.origem_foto,
      criada_em = EXCLUDED.criada_em, enviada_em = EXCLUDED.enviada_em, aceite_em = EXCLUDED.aceite_em, assinada_em = EXCLUDED.assinada_em,
      recusada_em = EXCLUDED.recusada_em, recusa_motivo = EXCLUDED.recusa_motivo,
      anulada_em = CASE WHEN EXCLUDED.estado = 'anulada' THEN coalesce(x.anulada_em, now()) END,
      total = EXCLUDED.total, total_com_iva = EXCLUDED.total_com_iva, vista = EXCLUDED.vista
    RETURNING id INTO v_ad;

    -- as versões da proposta da adenda (quotes), a atual é a última
    v_atual := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(a->'versoes')) ORDER BY (value->>'versao')::int LOOP
      SELECT id INTO v_q FROM quotes WHERE adenda_id = v_ad AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
      IF v_q IS NULL THEN
        INSERT INTO quotes (organization_id, root_organization_id, entity_id, created_by, title, modelo_base, versao, fluxo_emylia, estado, adenda_id)
        VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_user,
          'Adenda ' || coalesce(a->>'referencia', v_neg.numero || '-' || (a->>'numero')) || ' · versão ' || (o->>'versao'), 'adenda',
          (o->>'versao')::smallint, true, 'rascunho', v_ad)
        RETURNING id INTO v_q;
      END IF;
      -- a decisão do cliente (aceite, recusado) só a escreve o portal; a versão decidida só passa a substituída (20261231994000)
      SELECT estado INTO v_q_base FROM quotes WHERE id = v_q;
      v_estado := o->>'estado';
      IF v_q_base IN ('aceite', 'rejeitado', 'recusado') THEN
        IF v_estado IS DISTINCT FROM 'substituido' THEN v_estado := v_q_base; END IF;
      ELSIF v_estado IN ('aceite', 'recusado', 'rejeitado') THEN
        v_avisos := v_avisos || format('Adenda %s, versão %s: a decisão do cliente só se regista no portal (ficou %s).',
          coalesce(a->>'referencia', a->>'numero'), o->>'versao', coalesce(v_q_base, 'rascunho'));
        v_estado := coalesce(v_q_base, 'rascunho');
      END IF;
      UPDATE quotes SET estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
        desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2),
        verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END, aprovacao = o->>'aprovacao',
        motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos'))), nota_versao = o->>'nota',
        pedido_cliente_motivos = CASE WHEN jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'pedido_cliente'->'motivos'))) END,
        pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
        enviado_em = (o->>'enviado_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
        preco_final = (o->>'total')::numeric, total_com_iva = (o->>'total_com_iva')::numeric
      WHERE id = v_q;

      -- as linhas de uma versão aceite, assinada, com encomenda emitida ou já usadas (encomenda a fornecedor, tarefa da obra) não se
      -- apagam nem se reescrevem: os ids ficam (20261231994000)
      v_fixo := v_q_base = 'aceite'
        OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.quote_id = v_q AND c.deleted_at IS NULL
                   AND (c.status IN ('signed', 'assinado', 'active') OR c.ec_emitida_em IS NOT NULL))
        OR EXISTS (SELECT 1 FROM quote_lines ql JOIN purchase_order_items pi ON pi.quote_line_id = ql.id WHERE ql.quote_id = v_q)
        OR EXISTS (SELECT 1 FROM quote_lines ql JOIN ops_obra_tarefa t ON t.orcamento_linha_id = ql.id WHERE ql.quote_id = v_q);
      IF v_fixo THEN
        IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> jsonb_array_length(public.fn_neg_lista(o->'linhas'))
           OR (SELECT coalesce(sum(total_sem_iva), 0) FROM quote_lines WHERE quote_id = v_q)
              <> (SELECT coalesce(sum(round((x->>'quantidade')::numeric * (x->>'preco_un')::numeric, 2)), 0) FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) x) THEN
          v_avisos := v_avisos || format('Adenda %s, versão %s: já está aceite ou em curso, as linhas ficaram como estavam.',
            coalesce(a->>'referencia', a->>'numero'), o->>'versao');
        END IF;
      ELSE
      DELETE FROM quote_lines WHERE quote_id = v_q;
      FOR l IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) LOOP
        -- a mão de obra a 6% (os materiais das linhas livres, a 23%, contam nos totais da adenda)
        v_iva := 6;
        v_tot := round((l->>'quantidade')::numeric * (l->>'preco_un')::numeric, 2);
        INSERT INTO quote_lines (quote_id, categoria, descricao_snapshot, qt, quantidade_exata, retail_price_unit, preco_un_exato, cost_price, custo_un_exato,
          iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, unidade, section_name, tipo_emylia, custo_manual,
          custo_mao_obra_unit, custo_material_unit, margem_percent, chave_emylia, perfil_nome, perfil_chave, mao_obra_congelada)
        VALUES (v_q, 'Serviços', coalesce(l->>'descricao', ''), round((l->>'quantidade')::numeric, 2), (l->>'quantidade')::numeric,
          round((l->>'preco_un')::numeric, 2), (l->>'preco_un')::numeric, round(coalesce((l->>'custo_un')::numeric, 0), 2), (l->>'custo_un')::numeric,
          v_iva, false, v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int,
          CASE WHEN coalesce((l->>'livre')::boolean, false) THEN NULL ELSE (l->>'servico')::uuid END, l->>'unidade', 'Adenda',
          CASE WHEN coalesce((l->>'livre')::boolean, false) THEN 'livre' ELSE 'servico' END, false,
          round(coalesce((l->>'custo_un')::numeric, 0), 2), 0, 0, l->>'chave', l->>'perfil', l->>'perfil_chave', (l->>'mao_obra_un')::numeric)
        RETURNING id INTO v_l;
        INSERT INTO quote_line_custos (organization_id, quote_line_id, congelado, horas_un, mao_obra_un)
        VALUES (p_org, v_l, l->>'custo_un' IS NOT NULL, coalesce((l->>'horas_un')::numeric, 0), coalesce((l->>'mao_obra_un')::numeric, 0));
        INSERT INTO quote_line_materiais (organization_id, quote_line_id, ordem, nome, quantidade, unidade, preco, fornecedor)
        SELECT p_org, v_l, (x.n - 1)::smallint, x.v->>'nome', (x.v->>'quantidade')::numeric, coalesce(x.v->>'unidade', ''), (x.v->>'preco')::numeric, x.v->>'fornecedor'
        FROM jsonb_array_elements(public.fn_neg_lista(l->'materiais')) WITH ORDINALITY x(v, n);
      END LOOP;
      END IF;
      v_atual := v_q;
    END LOOP;

    -- as parcelas (as do contrato), na versão atual
    IF v_atual IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quote_prestacoes WHERE quote_id = v_atual) THEN
      IF v_base IS NOT NULL AND EXISTS (SELECT 1 FROM quote_prestacoes WHERE quote_id = v_base) THEN
        INSERT INTO quote_prestacoes (organization_id, quote_id, ordem, rotulo, pct, marco, fase)
        SELECT p_org, v_atual, ordem, rotulo, pct, marco, fase FROM quote_prestacoes WHERE quote_id = v_base;
      ELSE
        INSERT INTO quote_prestacoes (organization_id, quote_id, ordem, rotulo, pct, marco, fase) VALUES (p_org, v_atual, 1, 'Única', 1, 'adjudicacao', NULL);
      END IF;
    END IF;

    -- o contrato da adenda (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
    v_c_ant := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(a->'contratos')) ORDER BY (value->>'versao')::int LOOP
      SELECT id, status INTO v_c, v_c_base FROM client_contracts WHERE adenda_id = v_ad AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
      IF v_c IS NULL THEN
        -- depois de uma versão assinada no portal não nasce outra: escondia a assinada (20261231994000)
        IF v_c_ant IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE id = v_c_ant AND status IN ('signed', 'assinado', 'active')) THEN
          v_avisos := v_avisos || format('Adenda %s: o contrato já está assinado no portal; a versão %s não foi criada.',
            coalesce(a->>'referencia', a->>'numero'), o->>'versao');
          EXIT;
        END IF;
        INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, created_by, status, versao, quote_id, replaces_contract_id, adenda_id)
        VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_user, 'draft', (o->>'versao')::smallint, v_atual, v_c_ant, v_ad)
        RETURNING id, status INTO v_c, v_c_base;
      END IF;
      IF v_c_ant IS NOT NULL THEN
        UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
        WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c AND status NOT IN ('signed', 'assinado', 'active', 'rejected', 'cancelled');
      END IF;
      -- um contrato assinado, recusado ou cancelado não se mexe; a assinatura (signature_*, signed_by_name, signature_date) e o estado
      -- assinado só os escreve o portal (20261231994000)
      IF v_c_base IN ('signed', 'assinado', 'active', 'rejected', 'cancelled') THEN
        v_c_ant := v_c;
        CONTINUE;
      END IF;
      IF o->>'estado' = 'assinado' THEN v_avisos := v_avisos || 'A assinatura só se faz no portal do cliente.'::text; END IF;
      v_status := CASE o->>'estado' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                    WHEN 'substituido' THEN 'cancelled' WHEN 'assinado' THEN v_c_base ELSE 'draft' END;
      UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
        quote_id = coalesce(v_atual, quote_id), updated_at = now()
      WHERE id = v_c;
      UPDATE client_contracts SET status = v_status, status_changed_by = p_user, status_changed_at = now()
      WHERE id = v_c AND status IS DISTINCT FROM v_status AND replaced_by_contract_id IS NULL AND o->>'estado' <> 'substituido';
      DELETE FROM client_contract_pedidos WHERE contract_id = v_c;
      INSERT INTO client_contract_pedidos (organization_id, contract_id, ordem, clausula, nota, pedido_em)
      SELECT p_org, v_c, (x.n - 1)::smallint, x.v->>'clausula', x.v->>'nota', coalesce((x.v->>'pedido_em')::timestamptz, now())
      FROM jsonb_array_elements(public.fn_neg_lista(o->'pedidos')) WITH ORDINALITY x(v, n);
      DELETE FROM client_contract_clausulas WHERE contract_id = v_c;
      INSERT INTO client_contract_clausulas (organization_id, contract_id, titulo, texto)
      SELECT p_org, v_c, x->>'titulo', x->>'texto' FROM jsonb_array_elements(public.fn_neg_lista(o->'clausulas')) x;
      v_c_ant := v_c;
    END LOOP;

    -- as faturas, os pagamentos, os recibos e a encomenda da adenda são do Financeiro (neg_registar_fatura, neg_validar_pagamento e
    -- fn_neg_emitir_ec_se_pronta): daqui só os avisos do cliente nas faturas que já existem (20261231999700)
    FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(a->'faturas')) LOOP
      SELECT id INTO v_f FROM faturas WHERE negocio_id = p_negocio_id AND chave = o->>'chave';
      IF v_f IS NULL THEN
        v_avisos := v_avisos || format('Adenda %s: a fatura %s só se regista no Financeiro.', a->>'referencia', o->>'numero');
        CONTINUE;
      END IF;
      DELETE FROM fatura_avisos_cliente WHERE fatura_id = v_f;
      INSERT INTO fatura_avisos_cliente (organization_id, fatura_id, campo, valor)
      SELECT DISTINCT ON (x->>'campo') p_org, v_f, x->>'campo', coalesce(x->>'valor', '') FROM jsonb_array_elements(public.fn_neg_lista(o->'aviso')) x;
      IF jsonb_typeof(o->'recibo') = 'object' AND NOT EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = v_f AND validado_em IS NOT NULL) THEN
        v_avisos := v_avisos || format('Adenda %s: o pagamento da fatura %s só se valida no Financeiro.', a->>'referencia', o->>'numero');
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_avisos;
END $function$
;
REVOKE ALL ON FUNCTION public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid) TO service_role;

-- ------------------------------------------------------------------ 7. ler: a fase com a do servidor e a EC (texto vivo da 20261231994000)
CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.numero), '[]') INTO r FROM (
    SELECT n.numero, jsonb_build_object(
      'negocio', jsonb_build_object('id', n.id, 'entity_id', n.entity_id, 'numero', n.numero, 'titulo', n.titulo, 'telefone', coalesce(e.phone, ''),
        'fase', CASE WHEN n.anulado_em IS NULL THEN greatest(coalesce(n.fase, 0), public.fn_neg_fase_minima(n.id)) ELSE coalesce(n.fase, 0) END, 'linha', coalesce(n.linha, 'geral'), 'linha_por_definir', n.linha_por_definir, 'servico_pedido', coalesce(n.servico_pedido, ''),
        'morada_obra', coalesce(n.morada_obra, ''), 'origem', coalesce(n.origem, ''), 'pedido_em', n.pedido_em, 'dono_papel', coalesce(n.dono_papel, 'comercial'),
        'estado', CASE WHEN n.estado = 'perdido' THEN 'perdido' ELSE 'aberto' END, 'estado_crm', n.estado, 'motivo_perda', n.motivo_perda,
        'anulado_em', n.anulado_em, 'anulado_por', n.anulado_por, 'anulado_motivo', n.anulado_motivo, 'anulado_origem', n.anulado_origem,
        'fatura_numero', n.fatura_numero, 'fatura_em', n.fatura_em, 'fatura_paga', n.fatura_paga, 'recibo_numero', n.recibo_numero, 'recibo_em', n.recibo_em,
        'fluxo_emylia', n.fluxo_emylia,
        -- tem documentos do CRM: o ecrã da Emylia abre-o só de leitura (20261231994000)
        'docs_crm', public.fn_neg_docs_crm(n.id)),
      'respostas', coalesce((SELECT jsonb_agg(jsonb_build_object('campo_chave', r.campo_chave, 'valor', r.valor, 'sugerido', r.sugerido) ORDER BY r.campo_chave)
                    FROM negocio_respostas r WHERE r.negocio_id = n.id AND r.divisao = ''), '[]'),
      'visitas', to_jsonb(coalesce(m.visitas, '{}')),
      'medidas', jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0),
        'ptf', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptf END, 'ptq', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptq END,
        'necessidades', to_jsonb(coalesce(m.necessidades, '{}')), 'slot', coalesce(m.slot, ''), 'fotos_total', coalesce(m.fotos_total, 0),
        'fotos_exterior', NULLIF(m.fotos_exterior, 0), 'fotos_interior', NULLIF(m.fotos_interior, 0), 'fotos_area', NULLIF(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false)),
      'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                    'cliente_compra', s.cliente_compra, 'ordem', s.ordem) ORDER BY s.ordem) FROM negocio_servicos s WHERE s.negocio_id = n.id), '[]'),
      'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', p.custo_un,
                    'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', p.cliente_fornece, 'servico', p.servico_id,
                    'fator', p.fator, 'sem_instalacao', p.sem_instalacao) ORDER BY p.ordem) FROM negocio_produtos p WHERE p.negocio_id = n.id),
      'partes_fora', (SELECT jsonb_agg(pf.parte ORDER BY pf.parte) FROM negocio_partes_fora pf WHERE pf.negocio_id = n.id),
      'orcamentos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_orcamento(q.id) ORDER BY q.versao) FROM quotes q
                    WHERE q.negocio_id = n.id AND q.fluxo_emylia AND q.deleted_at IS NULL), '[]'),
      'contratos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_contrato(c.id) ORDER BY c.versao) FROM client_contracts c
                    WHERE c.negocio_id = n.id AND c.versao IS NOT NULL AND c.deleted_at IS NULL), '[]'),
      'faturas', (SELECT jsonb_agg(jsonb_build_object('chave', f.chave, 'numero', f.numero, 'emitida_em', f.emitida_em, 'total', f.total,
                    'prestacao_ordem', qp.ordem, 'pdf_caminho', f.pdf_caminho,
                    'pagamento', (SELECT jsonb_build_object('validado_em', pg.validado_em, 'conta_destino', coalesce(pg.conta_destino, ''), 'referencia', coalesce(pg.referencia, ''))
                                  FROM pagamentos pg WHERE pg.fatura_id = f.id ORDER BY pg.comunicado_em LIMIT 1),
                    'recibo', (SELECT rc.numero FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id WHERE pg.fatura_id = f.id LIMIT 1))
                    ORDER BY f.emitida_em, f.numero)
                    FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM quotes qa WHERE qa.id = qp.quote_id AND qa.adenda_id IS NOT NULL)),
      -- a encomenda de cliente emitida no servidor (o contrato em vigor ou, na venda direta, o de suporte) e as das adendas (20261231999700)
      'ec', public.fn_neg_ler_ec(n.id),
      -- as adendas (20261231990000)
      'adendas', public.fn_neg_ler_adendas(n.id),
      'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', h.ordem, 'texto', h.texto, 'tipo', h.tipo, 'ocorrido_em', h.ocorrido_em) ORDER BY h.ordem)
                    FROM negocio_historico h WHERE h.negocio_id = n.id), '[]')
    ) j
    FROM negocios n
    LEFT JOIN anew_entities e ON e.id = n.entity_id
    LEFT JOIN negocio_medidas m ON m.negocio_id = n.id
    WHERE n.organization_id = p_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
  ) x;
  RETURN r;
END $function$
;
REVOKE ALL ON FUNCTION public.neg_ler_negocios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_negocios(uuid) TO authenticated, service_role;

RESET lock_timeout;
