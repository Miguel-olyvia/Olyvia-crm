-- ============================================================
-- Testes: 20270101250000_negocio_baixa_automatica_na_emissao.sql (base RH)
-- ============================================================
-- 29/10: corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: na organização dos negócios cria 1 armazém de teste
-- (padrão nas definições de inventário, só nesta transação), 5 produtos com gestão de stock, 1 fornecedor preferido e negócios próprios
-- (prefixo "Teste 250000"), gravados por neg_guardar_negocio como um utilizador com pessoas.edit (role authenticated); a fatura e o
-- pagamento pelas RPCs do Financeiro; a assinatura como o portal (sem sessão). Desfaz tudo no fim.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/negocio_baixa_automatica_na_emissao.test.sql
--
-- Cobre:
--   A. Contrato: assinado sem pagamento → sem baixa; fatura + pagamento → EC emitida, baixa até à reserva (3 de 5), PO pendente de 2
--      ligada à linha; validar outra vez e chamar fn_contract_deduct_stock outra vez não descontam de novo
--   B. FIFO entre duas ECs do mesmo produto (stock 5, 4 + 4): a 1.ª emitida leva 4, a 2.ª leva 1 e pede 3
--   C. Venda direta: baixa uma só vez (gatilho da assinatura sintética), nem a 2.ª validação nem uma chamada direta repetem
--   D. Modo manual: EC emitida sem baixa nem pedido ao fornecedor (contrato e venda direta)
--   E. Contrato assinado DEPOIS da fatura e do pagamento: a EC emite-se na assinatura, com baixa e pedido
--   F. rpc_upsert_inventory_settings aceita 'manual', recusa lixo e NULL; grants da função interna
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_base negocios;
  v_auth uuid;
  v_act  uuid;
  v_role uuid;
  w  uuid := '25000000-0000-4000-8000-0000000000a1';
  s  uuid := '25000000-0000-4000-8000-0000000000b1';
  p1 uuid := '25000000-0000-4000-8000-0000000000c1';  -- A: stock 3, precisa 5
  p2 uuid := '25000000-0000-4000-8000-0000000000c2';  -- B: stock 5, 4 + 4
  p3 uuid := '25000000-0000-4000-8000-0000000000c3';  -- C: stock 10, precisa 2
  p4 uuid := '25000000-0000-4000-8000-0000000000c4';  -- D: stock 5, precisa 2 (manual)
  p5 uuid := '25000000-0000-4000-8000-0000000000c5';  -- E: stock 4, precisa 6
  j jsonb;
BEGIN
  SELECT * INTO v_base FROM negocios WHERE numero IS NOT NULL AND deleted_at IS NULL ORDER BY numero LIMIT 1;
  IF v_base.id IS NULL THEN RAISE EXCEPTION 'FALHOU: base sem negócio com número para as fixtures'; END IF;
  SELECT u.auth_user_id, u.id INTO v_auth, v_act FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador com pessoas.edit na organização %', v_base.organization_id; END IF;

  SELECT am.role_id INTO v_role FROM anew_memberships am
  WHERE am.user_id = v_act AND am.organization_id = v_base.organization_id AND am.status = 'active' LIMIT 1;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT v_role, c, NULL::uuid FROM unnest(ARRAY['negocios.registar_fatura', 'negocios.validar_pagamento', 'inventory.edit', 'inventory.view']) c
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  -- armazém de teste (padrão só nesta transação), produtos com stock e o fornecedor preferido
  INSERT INTO warehouses (id, name, code, is_active, serves_customers, created_by, organization_id)
  VALUES (w, 'Teste 250000 armazém', 'TESTE250000W', true, true, v_act, v_base.organization_id);
  INSERT INTO organization_inventory_settings (organization_id, stock_deduction_trigger, default_warehouse_id, created_by)
  VALUES (v_base.organization_id, 'contract_signed', w, v_act)
  ON CONFLICT (organization_id) DO UPDATE SET stock_deduction_trigger = 'contract_signed', default_warehouse_id = w;
  INSERT INTO products (id, sku, name, created_by, organization_id, manages_stock)
  SELECT x.id, 'TESTE-250000-' || x.n, 'Teste 250000 produto ' || x.n, v_act, v_base.organization_id, true
  FROM (VALUES (p1, 1), (p2, 2), (p3, 3), (p4, 4), (p5, 5)) x(id, n);
  INSERT INTO stocks (product_id, warehouse_id, quantity, created_by, organization_id)
  VALUES (p1, w, 3, v_act, v_base.organization_id), (p2, w, 5, v_act, v_base.organization_id), (p3, w, 10, v_act, v_base.organization_id),
         (p4, w, 5, v_act, v_base.organization_id), (p5, w, 4, v_act, v_base.organization_id);
  INSERT INTO suppliers (id, name, created_by, organization_id) VALUES (s, 'Teste 250000 fornecedor', v_act, v_base.organization_id);
  INSERT INTO item_suppliers (organization_id, item_type, supplier_id, created_by, product_id, is_preferred, is_active, purchase_price)
  SELECT v_base.organization_id, 'product', s, v_act, x, true, true, 10 FROM unnest(ARRAY[p1, p2, p3, p4, p5]) x;

  -- negócios: A (contrato), B1/B2 (FIFO), C (venda direta), D (manual, contrato), D2 (manual, venda direta), E (assinado depois)
  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  SELECT x.id, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 250000 ' || x.t, true
  FROM (VALUES ('25000000-0000-4000-8000-000000000001'::uuid, 'A'), ('25000000-0000-4000-8000-000000000002'::uuid, 'B1'),
               ('25000000-0000-4000-8000-000000000003'::uuid, 'B2'), ('25000000-0000-4000-8000-000000000004'::uuid, 'C'),
               ('25000000-0000-4000-8000-000000000005'::uuid, 'D'), ('25000000-0000-4000-8000-000000000006'::uuid, 'D2'),
               ('25000000-0000-4000-8000-000000000007'::uuid, 'E')) x(id, t);

  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.w', w::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  -- JSON base: uma versão enviada com uma linha de produto (quantidade em teste.json_*), prestação única e o contrato enviado
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 250000', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-10-20T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 1, 'marco', 'adjudicacao')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'produto', 'produto', NULL, 'descricao', 'Produto', 'unidade', 'un',
        'quantidade', 1, 'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
END $fx$;

-- JSON de um negócio: produto, quantidade, venda direta
CREATE FUNCTION pg_temp.teste_json(p_prod uuid, p_qt numeric, p_vd boolean) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE WHEN p_vd
    THEN jsonb_set(jsonb_set(jsonb_set(jsonb_set(current_setting('teste.json')::jsonb,
           '{orcamentos,0,linhas,0,produto}', to_jsonb(p_prod)), '{orcamentos,0,linhas,0,quantidade}', to_jsonb(p_qt)),
           '{orcamentos,0,venda_direta}', 'true'), '{contratos}', '[]'::jsonb)
    ELSE jsonb_set(jsonb_set(current_setting('teste.json')::jsonb,
           '{orcamentos,0,linhas,0,produto}', to_jsonb(p_prod)), '{orcamentos,0,linhas,0,quantidade}', to_jsonb(p_qt)) END
$$;
-- stock do produto no armazém de teste
CREATE FUNCTION pg_temp.teste_stock(p_prod uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT quantity FROM public.stocks WHERE product_id = p_prod AND warehouse_id = current_setting('teste.w')::uuid
$$;
-- unidades descontadas ('venda', não estornadas) e unidades pedidas ao fornecedor para um produto, nas ECs de um negócio
CREATE FUNCTION pg_temp.teste_vendido(p_neg uuid, p_prod uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(sum(sm.quantity), 0) FROM public.stock_movements sm JOIN public.client_contracts c ON c.id = sm.sale_source_id
  JOIN public.quotes q ON q.id = c.quote_id
  WHERE sm.sale_source_type = 'contract' AND sm.movement_type = 'venda' AND sm.product_id = p_prod AND q.negocio_id = p_neg
$$;
CREATE FUNCTION pg_temp.teste_movs(p_neg uuid, p_prod uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FROM public.stock_movements sm JOIN public.client_contracts c ON c.id = sm.sale_source_id
  JOIN public.quotes q ON q.id = c.quote_id
  WHERE sm.sale_source_type = 'contract' AND sm.movement_type = 'venda' AND sm.product_id = p_prod AND q.negocio_id = p_neg
$$;
CREATE FUNCTION pg_temp.teste_pedido(p_neg uuid, p_prod uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(sum(poi.quantity), 0) FROM public.purchase_order_items poi JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.client_contracts c ON c.id = po.source_id JOIN public.quotes q ON q.id = c.quote_id
  WHERE po.source_type = 'contract' AND po.deleted_at IS NULL AND po.status = 'pending' AND poi.product_id = p_prod
    AND poi.quote_line_id IS NOT NULL AND q.negocio_id = p_neg
$$;
GRANT EXECUTE ON FUNCTION pg_temp.teste_json(uuid, numeric, boolean) TO authenticated;

-- ─── gravação (como o comercial) ─────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE o uuid := current_setting('teste.org')::uuid;
BEGIN
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000001', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c1', 5, false));
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000002', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c2', 4, false));
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000003', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c2', 4, false));
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000004', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c3', 2, true));
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000005', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c4', 2, false));
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000006', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c4', 1, true));
  -- E começa como venda direta (fatura registável sem contrato) e passa a contrato antes do pagamento
  PERFORM public.neg_guardar_negocio(o, '25000000-0000-4000-8000-000000000007', pg_temp.teste_json('25000000-0000-4000-8000-0000000000c5', 6, true));
END $t$;
RESET ROLE;

-- ─── o portal (sem sessão): aceita as propostas e assina A, B1 (antes), B2 (depois), D ─
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-10-21T09:00:00Z'
  WHERE negocio_id::text LIKE '25000000-0000-4000-8000-00000000000%' AND versao = 1;
  IF (SELECT count(*) FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
      WHERE q.negocio_id::text LIKE '25000000-0000-4000-8000-00000000000%' AND ql.product_id::text LIKE '25000000-%') <> 7 THEN
    RAISE EXCEPTION 'FALHOU: as linhas de produto não ficaram nos orçamentos';
  END IF;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal',
         signature_date = CASE negocio_id WHEN '25000000-0000-4000-8000-000000000003' THEN '2026-10-22T12:00:00Z'::timestamptz
                                          ELSE '2026-10-22T11:00:00Z'::timestamptz END
  WHERE negocio_id IN ('25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002',
                       '25000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000005') AND versao = 1;
  IF (SELECT count(*) FROM client_contracts WHERE negocio_id::text LIKE '25000000-0000-4000-8000-00000000000%' AND status = 'signed') <> 4 THEN
    RAISE EXCEPTION 'FALHOU: fixtures sem os 4 contratos assinados';
  END IF;
  -- A assinado sem pagamento: nada desconta, a emissão foi tentada e recusada
  IF pg_temp.teste_vendido('25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-0000000000c1') <> 0
     OR pg_temp.teste_stock('25000000-0000-4000-8000-0000000000c1') <> 3 THEN
    RAISE EXCEPTION 'FALHOU A: descontou na assinatura antes do pagamento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workflow_execution_log l JOIN client_contracts c ON c.id = l.source_record_id
                 WHERE c.negocio_id = '25000000-0000-4000-8000-000000000001' AND l.action_type = 'trigger:contract_signed_emitir_ec'
                   AND l.execution_data->>'emitida' = 'false') THEN
    RAISE EXCEPTION 'FALHOU A: a assinatura não tentou a emissão';
  END IF;
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = '25000000-0000-4000-8000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU A: emitiu a EC sem pagamento';
  END IF;
END $t$;

-- ─── Financeiro ──────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  nA uuid := '25000000-0000-4000-8000-000000000001'; nB1 uuid := '25000000-0000-4000-8000-000000000002';
  nB2 uuid := '25000000-0000-4000-8000-000000000003'; nC uuid := '25000000-0000-4000-8000-000000000004';
  nE uuid := '25000000-0000-4000-8000-000000000007';
  p1 uuid := '25000000-0000-4000-8000-0000000000c1'; p2 uuid := '25000000-0000-4000-8000-0000000000c2';
  p3 uuid := '25000000-0000-4000-8000-0000000000c3';
  r jsonb;
BEGIN
  -- A. fatura sem pagamento: nada; pagamento: EC, baixa de 3 (reserva), pedido de 2
  r := public.neg_registar_fatura(o, nA, 't1', 'FT T250000/1', NULL);
  IF (r->'ec'->>'emitida')::boolean OR pg_temp.teste_vendido(nA, p1) <> 0 THEN RAISE EXCEPTION 'FALHOU A: emitiu/descontou só com a fatura'; END IF;
  r := public.neg_validar_pagamento(o, nA, 'FT T250000/1', NULL, current_date, 'TRF', NULL, NULL);
  IF NOT (r->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU A: não emitiu a EC: %', r; END IF;
  IF pg_temp.teste_vendido(nA, p1) <> 3 OR pg_temp.teste_stock(p1) <> 0 THEN
    RAISE EXCEPTION 'FALHOU A: devia descontar 3 (descontou %, stock %)', pg_temp.teste_vendido(nA, p1), pg_temp.teste_stock(p1);
  END IF;
  IF pg_temp.teste_pedido(nA, p1) <> 2 THEN RAISE EXCEPTION 'FALHOU A: devia pedir 2 ao fornecedor (pediu %)', pg_temp.teste_pedido(nA, p1); END IF;
  -- outra vez: nada muda
  r := public.neg_validar_pagamento(o, nA, 'FT T250000/1', NULL, current_date, 'TRF', NULL, NULL);
  IF pg_temp.teste_movs(nA, p1) <> 1 OR pg_temp.teste_stock(p1) <> 0 OR pg_temp.teste_pedido(nA, p1) <> 2 THEN
    RAISE EXCEPTION 'FALHOU A: a 2.ª validação descontou ou pediu outra vez';
  END IF;

  -- B. FIFO: B1 emitida primeiro leva 4; B2 leva 1 e pede 3
  PERFORM public.neg_registar_fatura(o, nB1, 't1', 'FT T250000/2', NULL);
  PERFORM public.neg_validar_pagamento(o, nB1, 'FT T250000/2', NULL, current_date, NULL, NULL, NULL);
  PERFORM public.neg_registar_fatura(o, nB2, 't1', 'FT T250000/3', NULL);
  PERFORM public.neg_validar_pagamento(o, nB2, 'FT T250000/3', NULL, current_date, NULL, NULL, NULL);
  IF pg_temp.teste_vendido(nB1, p2) <> 4 OR pg_temp.teste_pedido(nB1, p2) <> 0 THEN
    RAISE EXCEPTION 'FALHOU B: B1 devia levar 4 sem pedido (levou %, pediu %)', pg_temp.teste_vendido(nB1, p2), pg_temp.teste_pedido(nB1, p2);
  END IF;
  IF pg_temp.teste_vendido(nB2, p2) <> 1 OR pg_temp.teste_pedido(nB2, p2) <> 3 OR pg_temp.teste_stock(p2) <> 0 THEN
    RAISE EXCEPTION 'FALHOU B: B2 devia levar 1 e pedir 3 (levou %, pediu %, stock %)', pg_temp.teste_vendido(nB2, p2), pg_temp.teste_pedido(nB2, p2), pg_temp.teste_stock(p2);
  END IF;

  -- C. venda direta: uma só baixa
  PERFORM public.neg_registar_fatura(o, nC, 'unica', 'FT T250000/4', NULL);
  r := public.neg_validar_pagamento(o, nC, 'FT T250000/4', NULL, current_date, NULL, NULL, NULL);
  IF NOT (r->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU C: não emitiu: %', r; END IF;
  PERFORM set_config('teste.c_contrato', r->'ec'->>'contract_id', true);
  IF pg_temp.teste_movs(nC, p3) <> 1 OR pg_temp.teste_vendido(nC, p3) <> 2 OR pg_temp.teste_stock(p3) <> 8 THEN
    RAISE EXCEPTION 'FALHOU C: devia descontar 2 uma vez (movs %, qtd %, stock %)', pg_temp.teste_movs(nC, p3), pg_temp.teste_vendido(nC, p3), pg_temp.teste_stock(p3);
  END IF;
  PERFORM public.neg_validar_pagamento(o, nC, 'FT T250000/4', NULL, current_date, NULL, NULL, NULL);
  IF pg_temp.teste_movs(nC, p3) <> 1 OR pg_temp.teste_stock(p3) <> 8 THEN RAISE EXCEPTION 'FALHOU C: a 2.ª validação descontou outra vez'; END IF;

  -- E. fatura registada como venda direta; passa a contrato (enviado) antes do pagamento; o pagamento não emite (sem contrato assinado)
  PERFORM public.neg_registar_fatura(o, nE, 'unica', 'FT T250000/7', NULL);
  PERFORM public.neg_guardar_negocio(o, nE, jsonb_set(pg_temp.teste_json('25000000-0000-4000-8000-0000000000c5', 6, false), '{orcamentos,0,estado}', '"aceite"'));
  r := public.neg_validar_pagamento(o, nE, 'FT T250000/7', NULL, current_date, NULL, NULL, NULL);
  IF (r->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU E: emitiu sem contrato assinado: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM client_contracts WHERE negocio_id = nE AND versao = 1 AND status NOT IN ('signed', 'assinado')) THEN
    RAISE EXCEPTION 'FALHOU E: o contrato por assinar não ficou criado';
  END IF;
END $t$;
RESET ROLE;

-- ─── C (como postgres): chamada direta repetida não desconta; E: o portal assina depois do pagamento ─
DO $t$
DECLARE
  nE uuid := '25000000-0000-4000-8000-000000000007'; p5 uuid := '25000000-0000-4000-8000-0000000000c5';
  p3 uuid := '25000000-0000-4000-8000-0000000000c3'; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.fn_contract_deduct_stock(current_setting('teste.c_contrato')::uuid);
  IF pg_temp.teste_movs('25000000-0000-4000-8000-000000000004', p3) <> 1 OR pg_temp.teste_stock(p3) <> 8 THEN
    RAISE EXCEPTION 'FALHOU C: a chamada direta descontou outra vez: %', r;
  END IF;

  IF pg_temp.teste_vendido(nE, p5) <> 0 THEN RAISE EXCEPTION 'FALHOU E: descontou antes da assinatura'; END IF;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE negocio_id = nE AND versao = 1;
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = nE AND versao = 1) IS NULL THEN
    RAISE EXCEPTION 'FALHOU E: a assinatura depois do pagamento não emitiu a EC';
  END IF;
  IF pg_temp.teste_vendido(nE, p5) <> 4 OR pg_temp.teste_stock(p5) <> 0 OR pg_temp.teste_pedido(nE, p5) <> 2 THEN
    RAISE EXCEPTION 'FALHOU E: devia descontar 4 e pedir 2 (descontou %, stock %, pediu %)', pg_temp.teste_vendido(nE, p5), pg_temp.teste_stock(p5), pg_temp.teste_pedido(nE, p5);
  END IF;
  IF (SELECT fase FROM negocios WHERE id = nE) <> 5 THEN RAISE EXCEPTION 'FALHOU E: o negócio não passou à fase 5'; END IF;

  -- D. modo manual
  UPDATE organization_inventory_settings SET stock_deduction_trigger = 'manual' WHERE organization_id = current_setting('teste.org')::uuid;
END $t$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  nD uuid := '25000000-0000-4000-8000-000000000005'; nD2 uuid := '25000000-0000-4000-8000-000000000006';
  p4 uuid := '25000000-0000-4000-8000-0000000000c4';
  r jsonb; r2 jsonb;
BEGIN
  PERFORM public.neg_registar_fatura(o, nD, 't1', 'FT T250000/5', NULL);
  r := public.neg_validar_pagamento(o, nD, 'FT T250000/5', NULL, current_date, NULL, NULL, NULL);
  PERFORM public.neg_registar_fatura(o, nD2, 'unica', 'FT T250000/6', NULL);
  r2 := public.neg_validar_pagamento(o, nD2, 'FT T250000/6', NULL, current_date, NULL, NULL, NULL);
  IF NOT (r->'ec'->>'emitida')::boolean OR NOT (r2->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU D: em manual a EC também se emite: % / %', r, r2; END IF;
  IF pg_temp.teste_vendido(nD, p4) <> 0 OR pg_temp.teste_vendido(nD2, p4) <> 0 OR pg_temp.teste_stock(p4) <> 5 THEN
    RAISE EXCEPTION 'FALHOU D: em manual descontou';
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_orders po WHERE po.source_type = 'contract'
             AND po.source_id IN ((r->'ec'->>'contract_id')::uuid, (r2->'ec'->>'contract_id')::uuid)) THEN
    RAISE EXCEPTION 'FALHOU D: em manual pediu ao fornecedor';
  END IF;

  -- F. definições
  PERFORM public.rpc_upsert_inventory_settings(o, 'contract_signed', current_setting('teste.w')::uuid);
  PERFORM public.rpc_upsert_inventory_settings(o, 'manual', current_setting('teste.w')::uuid);
  IF (SELECT stock_deduction_trigger FROM organization_inventory_settings WHERE organization_id = o) <> 'manual' THEN
    RAISE EXCEPTION 'FALHOU F: não gravou manual';
  END IF;
  BEGIN
    PERFORM public.rpc_upsert_inventory_settings(o, 'lixo', NULL);
    RAISE EXCEPTION 'FALHOU F: aceitou lixo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.rpc_upsert_inventory_settings(o, NULL, NULL);
    RAISE EXCEPTION 'FALHOU F: aceitou NULL';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.fn_contract_deduct_stock((r->'ec'->>'contract_id')::uuid);
    RAISE EXCEPTION 'FALHOU F: authenticated chamou fn_contract_deduct_stock';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  IF has_function_privilege('anon', 'public.fn_contract_deduct_stock(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_contract_deduct_stock(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU F: fn_contract_deduct_stock aberta';
  END IF;
  -- nenhuma linha vendeu mais do que precisava nem deixou stock negativo
  IF EXISTS (SELECT 1 FROM stocks WHERE warehouse_id = current_setting('teste.w')::uuid AND quantity < 0) THEN
    RAISE EXCEPTION 'FALHOU: stock negativo';
  END IF;
END $t$;

SELECT 'OK: negocio_baixa_automatica_na_emissao (A–F)' AS resultado,
       (SELECT jsonb_object_agg(p.name, s.quantity) FROM stocks s JOIN products p ON p.id = s.product_id
        WHERE s.warehouse_id = current_setting('teste.w')::uuid) AS stock_final;

ROLLBACK;
