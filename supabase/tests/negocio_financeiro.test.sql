-- ============================================================
-- Testes: 20261231999700_negocio_financeiro.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria negócios próprios (prefixo "Teste 999700") na organização
-- do primeiro negócio com número, grava-os por neg_guardar_negocio como um utilizador com pessoas.edit (role authenticated, auth.uid()
-- pelas claims), dá-lhe as duas permissões novas só dentro da transação e desfaz tudo no fim. As linhas dos orçamentos são livres (sem
-- produtos): não reservam stock nem pedem ao fornecedor.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/negocio_financeiro.test.sql
--
-- Cobre:
--   1. Validar o pagamento sem fatura registada → NE010
--   2. Fatura registada sem pagamento → sem EC, a fase fica 4
--   3. Fatura e pagamento → EC emitida uma vez (validar outra vez e emitir outra vez não mudam nada), fase 5, recibo RC aaaa/n
--   4. Recibos seguidos não repetem o número; um recibo do ERP repetido → NE009; uma fatura repetida noutra prestação → NE009
--   5. JSON com fatura_paga, recibo, ec, faturas novas e fase 5 → ignorado, com aviso
--   6. Sem permissão → CT001
--   7. Negócio do CRM → NE005
--   8. Venda direta → contrato de suporte assinado, ligado ao orçamento, com a EC (order_number) e a fase 5 na leitura
--   9. Anular com uma PO já encomendada → NE011
--  10. Anular sem PO → contratos cancelados (os gatilhos de estorno correm), negócio anulado e perdido; segunda vez é idempotente
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_base negocios;
  v_auth uuid;
  v_role uuid;
  n_ct  uuid := '99970000-0000-4000-8000-000000000001';  -- contrato: assinado no portal, depois fatura e pagamento
  n_js  uuid := '99970000-0000-4000-8000-000000000002';  -- contrato assinado: o JSON tenta pagar e emitir a EC
  n_vd  uuid := '99970000-0000-4000-8000-000000000003';  -- venda direta aceite no portal
  n_crm uuid := '99970000-0000-4000-8000-000000000004';  -- CRM
  j jsonb;
BEGIN
  SELECT * INTO v_base FROM negocios WHERE numero IS NOT NULL AND deleted_at IS NULL ORDER BY numero LIMIT 1;
  IF v_base.id IS NULL THEN RAISE EXCEPTION 'FALHOU: base sem negócio com número para as fixtures'; END IF;
  SELECT u.auth_user_id INTO v_auth FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador com pessoas.edit na organização %', v_base.organization_id; END IF;

  -- as duas permissões novas e a de anular, ao papel desse utilizador nesta organização (só nesta transação)
  SELECT am.role_id INTO v_role FROM anew_memberships am JOIN anew_users u ON u.id = am.user_id
  WHERE u.auth_user_id = v_auth AND am.organization_id = v_base.organization_id AND am.status = 'active' LIMIT 1;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT v_role, c, NULL::uuid FROM unnest(ARRAY['negocios.registar_fatura', 'negocios.validar_pagamento', 'client_contracts.cancel']) c
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  VALUES (n_ct, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 999700 contrato', true),
         (n_js, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 999700 JSON', true),
         (n_vd, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 999700 venda direta', true),
         (n_crm, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 999700 CRM', false);
  INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, estado, fluxo_emylia)
  VALUES (v_base.organization_id, v_base.root_organization_id, v_base.entity_id, n_crm,
          (SELECT id FROM anew_users WHERE auth_user_id = v_auth), 'Teste 999700 orçamento do CRM', 'rascunho', false);

  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  -- o JSON de um negócio com uma versão enviada (1000 € + IVA a 23% = 1230 €), duas prestações de 50% e o contrato enviado
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 999700', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-10-20T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
  -- a venda direta: uma prestação única, sem contrato
  j := jsonb_set(j, '{orcamentos,0,venda_direta}', 'true');
  j := jsonb_set(j, '{orcamentos,0,prestacoes}', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Única', 'pct', 1, 'marco', 'adjudicacao')));
  j := jsonb_set(j, '{contratos}', '[]'::jsonb);
  PERFORM set_config('teste.json_vd', j::text, true);
END $fx$;

-- ─── 1.ª gravação (como o comercial) ─────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000002', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000003', current_setting('teste.json_vd')::jsonb);
END $t$;
RESET ROLE;

-- ─── o portal (servidor, sem sessão): aceita e assina ────────────────────────
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-10-21T09:00:00Z'
  WHERE negocio_id IN ('99970000-0000-4000-8000-000000000001', '99970000-0000-4000-8000-000000000002', '99970000-0000-4000-8000-000000000003') AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = '2026-10-22T11:30:00Z'
  WHERE negocio_id IN ('99970000-0000-4000-8000-000000000001', '99970000-0000-4000-8000-000000000002') AND versao = 1;
  IF (SELECT count(*) FROM client_contracts WHERE negocio_id IN ('99970000-0000-4000-8000-000000000001', '99970000-0000-4000-8000-000000000002') AND status = 'signed') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: fixtures sem os dois contratos assinados';
  END IF;
  IF public.fn_neg_fase_minima('99970000-0000-4000-8000-000000000001') <> 4 OR public.fn_neg_fase_minima('99970000-0000-4000-8000-000000000003') <> 4 THEN
    RAISE EXCEPTION 'FALHOU: contrato assinado e venda direta aceite deviam dar a fase 4';
  END IF;
END $t$;

-- ─── casos como o utilizador do Financeiro ───────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_ct uuid := '99970000-0000-4000-8000-000000000001';
  n_js uuid := '99970000-0000-4000-8000-000000000002';
  n_vd uuid := '99970000-0000-4000-8000-000000000003';
  n_crm uuid := '99970000-0000-4000-8000-000000000004';
  r jsonb; r2 jsonb; v_estado text; ano text := extract(year FROM current_date)::text; j jsonb; v_ec1 timestamptz; v_ec2 timestamptz;
BEGIN
  -- 1. sem fatura
  BEGIN
    PERFORM public.neg_validar_pagamento(o, n_ct, 'FT TESTE999700/1', 615, current_date, 'TRF 1', NULL, NULL);
    RAISE EXCEPTION 'FALHOU 1: validou sem fatura';
  EXCEPTION WHEN SQLSTATE 'NE010' THEN NULL;
  END;

  -- 2. fatura sem pagamento
  r := public.neg_registar_fatura(o, n_ct, 't1', 'FT TESTE999700/1', NULL);
  IF (r->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU 2: emitiu a EC só com a fatura'; END IF;
  IF (r->>'total')::numeric <> 615 THEN RAISE EXCEPTION 'FALHOU 2: a 1.ª prestação devia valer 615 (veio %)', r->>'total'; END IF;
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = n_ct AND versao = 1) IS NOT NULL THEN RAISE EXCEPTION 'FALHOU 2: ec_emitida_em escrito'; END IF;
  IF (SELECT fatura_numero FROM negocios WHERE id = n_ct) IS DISTINCT FROM 'FT TESTE999700/1' THEN RAISE EXCEPTION 'FALHOU 2: a fatura do negócio não ficou'; END IF;
  -- a mesma fatura outra vez: idempotente
  r := public.neg_registar_fatura(o, n_ct, 't1', 'FT TESTE999700/1', jsonb_build_object('atcud', 'ABCD-1', 'estado', 'por pagar'));
  IF (SELECT atcud FROM faturas WHERE organization_id = o AND numero = 'FT TESTE999700/1') IS DISTINCT FROM 'ABCD-1' THEN RAISE EXCEPTION 'FALHOU 2: o ERP não atualizou a fatura'; END IF;

  -- 3. pagamento: a EC nasce, uma vez
  r := public.neg_validar_pagamento(o, n_ct, 'FT TESTE999700/1', NULL, current_date, 'TRF 1', NULL, 'Banco A');
  IF NOT (r->'ec'->>'emitida')::boolean OR NOT (r->'ec'->>'nova')::boolean THEN RAISE EXCEPTION 'FALHOU 3: não emitiu a EC: %', r; END IF;
  IF r->>'recibo' !~ ('^RC ' || ano || '/[0-9]+$') THEN RAISE EXCEPTION 'FALHOU 3: recibo com outro formato: %', r->>'recibo'; END IF;
  SELECT ec_emitida_em INTO v_ec1 FROM client_contracts WHERE negocio_id = n_ct AND versao = 1;
  IF v_ec1 IS NULL OR (SELECT order_number FROM client_contracts WHERE negocio_id = n_ct AND versao = 1) IS NULL THEN RAISE EXCEPTION 'FALHOU 3: contrato sem EC'; END IF;
  IF (SELECT fase FROM negocios WHERE id = n_ct) <> 5 OR NOT (SELECT fatura_paga FROM negocios WHERE id = n_ct)
     OR (SELECT recibo_numero FROM negocios WHERE id = n_ct) IS DISTINCT FROM r->>'recibo' THEN RAISE EXCEPTION 'FALHOU 3: o negócio não ficou pago na fase 5'; END IF;
  r2 := public.neg_validar_pagamento(o, n_ct, 'FT TESTE999700/1', NULL, current_date, 'TRF 1', NULL, NULL);
  IF NOT (r2->>'ja_validado')::boolean OR r2->>'recibo' IS DISTINCT FROM r->>'recibo' OR (r2->'ec'->>'nova')::boolean THEN RAISE EXCEPTION 'FALHOU 3: a 2.ª validação mudou alguma coisa: %', r2; END IF;
  SELECT ec_emitida_em INTO v_ec2 FROM client_contracts WHERE negocio_id = n_ct AND versao = 1;
  IF v_ec2 IS DISTINCT FROM v_ec1 OR (SELECT count(*) FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id JOIN faturas f ON f.id = pg.fatura_id WHERE f.negocio_id = n_ct) <> 1 THEN
    RAISE EXCEPTION 'FALHOU 3: a EC ou o recibo duplicaram';
  END IF;
  PERFORM set_config('teste.rc1', r->>'recibo', true);

  -- 4. a 2.ª prestação: recibo seguinte; o mesmo número de fatura noutra prestação e um recibo do ERP repetido são recusados
  BEGIN
    PERFORM public.neg_registar_fatura(o, n_ct, 't2', 'FT TESTE999700/1', NULL);
    RAISE EXCEPTION 'FALHOU 4: a mesma fatura ficou em duas prestações';
  EXCEPTION WHEN SQLSTATE 'NE009' THEN NULL;
  END;
  PERFORM public.neg_registar_fatura(o, n_ct, 't2', 'FT TESTE999700/2', NULL);
  r2 := public.neg_validar_pagamento(o, n_ct, 'FT TESTE999700/2', NULL, current_date, NULL, NULL, NULL);
  IF r2->>'recibo' = r->>'recibo' OR split_part(r2->>'recibo', '/', 2)::int <= split_part(r->>'recibo', '/', 2)::int THEN
    RAISE EXCEPTION 'FALHOU 4: o recibo seguinte repetiu ou recuou: % depois de %', r2->>'recibo', r->>'recibo';
  END IF;
  PERFORM set_config('teste.rc2', r2->>'recibo', true);
  PERFORM public.neg_registar_fatura(o, n_vd, 'unica', 'FT TESTE999700/3', NULL);
  BEGIN
    PERFORM public.neg_validar_pagamento(o, n_vd, 'FT TESTE999700/3', NULL, current_date, NULL, r->>'recibo', NULL);
    RAISE EXCEPTION 'FALHOU 4: aceitou um recibo do ERP repetido';
  EXCEPTION WHEN SQLSTATE 'NE009' THEN NULL;
  END;

  -- 5. o JSON tenta pagar, emitir a EC e passar à Obra num contrato assinado sem fatura
  j := current_setting('teste.json')::jsonb;
  j := jsonb_set(j, '{negocio,fase}', '5');
  j := jsonb_set(j, '{negocio,fatura_numero}', '"FT FALSA/1"');
  j := jsonb_set(j, '{negocio,fatura_paga}', 'true');
  j := jsonb_set(j, '{negocio,recibo_numero}', '"RC FALSO/1"');
  j := j || jsonb_build_object('ec', jsonb_build_object('emitida_em', '2026-10-23T10:00:00Z', 'por', 'Falso'),
    'faturas', jsonb_build_array(jsonb_build_object('chave', 'f1-t1', 'numero', 'FT FALSA/1', 'total', 615, 'prestacao_ordem', 1,
      'pagamento', jsonb_build_object('validado_em', '2026-10-23T10:00:00Z', 'conta_destino', 'X', 'referencia', 'Y'), 'recibo', 'RC FALSO/1')));
  r := public.neg_guardar_negocio(o, n_js, j);
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = n_js AND versao = 1) IS NOT NULL THEN RAISE EXCEPTION 'FALHOU 5: o JSON emitiu a EC'; END IF;
  IF EXISTS (SELECT 1 FROM faturas WHERE negocio_id = n_js) OR EXISTS (SELECT 1 FROM recibos WHERE organization_id = o AND numero = 'RC FALSO/1') THEN RAISE EXCEPTION 'FALHOU 5: o JSON criou a fatura ou o recibo'; END IF;
  IF (SELECT fatura_paga OR fatura_numero IS NOT NULL OR recibo_numero IS NOT NULL FROM negocios WHERE id = n_js) THEN RAISE EXCEPTION 'FALHOU 5: o JSON escreveu a fatura no negócio'; END IF;
  IF (SELECT fase FROM negocios WHERE id = n_js) <> 4 THEN RAISE EXCEPTION 'FALHOU 5: a fase devia ficar 4 (a do servidor), ficou %', (SELECT fase FROM negocios WHERE id = n_js); END IF;
  IF NOT (r->'avisos')::text LIKE '%só se registam no Financeiro%' OR NOT (r->'avisos')::text LIKE '%A fase 5%' THEN RAISE EXCEPTION 'FALHOU 5: faltam os avisos: %', r->'avisos'; END IF;
  PERFORM set_config('teste.avisos5', (r->'avisos')::text, true);

  -- 7. CRM
  BEGIN
    PERFORM public.neg_registar_fatura(o, n_crm, 't1', 'FT TESTE999700/9', NULL);
    RAISE EXCEPTION 'FALHOU 7: registou num negócio do CRM';
  EXCEPTION WHEN SQLSTATE 'NE005' THEN NULL;
  END;

  -- 8. venda direta: o contrato de suporte com a EC
  r := public.neg_validar_pagamento(o, n_vd, 'FT TESTE999700/3', NULL, current_date, NULL, NULL, NULL);
  IF NOT (r->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU 8: a venda direta não emitiu a EC: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM client_contracts c JOIN quotes q ON q.id = c.quote_id
                 WHERE c.id = (r->'ec'->>'contract_id')::uuid AND q.negocio_id = n_vd AND q.venda_direta AND c.status = 'signed'
                   AND c.ec_emitida_em IS NOT NULL AND c.order_number IS NOT NULL AND c.negocio_id IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 8: sem contrato de suporte assinado, ligado ao orçamento, com a EC';
  END IF;
  IF (SELECT fase FROM negocios WHERE id = n_vd) <> 5 THEN RAISE EXCEPTION 'FALHOU 8: a venda direta não passou à fase 5'; END IF;
  PERFORM set_config('teste.vd_ec', (r->'ec')::text, true);
  PERFORM set_config('teste.vd_contrato', r->'ec'->>'contract_id', true);
  -- a leitura do negócio: fase 5 e a EC
  SELECT x INTO r2 FROM jsonb_array_elements(public.neg_ler_negocios(o)) x WHERE x->'negocio'->>'id' = n_vd::text;
  IF (r2->'negocio'->>'fase')::int <> 5 OR r2->'ec'->>'order_number' IS NULL OR r2->'ec'->>'contract_id' <> r->'ec'->>'contract_id' THEN
    RAISE EXCEPTION 'FALHOU 8: a leitura não devolve a fase 5 e a EC: %', r2->'ec';
  END IF;
  IF jsonb_array_length(r2->'contratos') <> 0 THEN RAISE EXCEPTION 'FALHOU 8: o contrato de suporte apareceu como contrato da venda direta'; END IF;
END $t$;
RESET ROLE;

-- ─── 6. sem permissão (uma sessão sem papel nesta organização) ───────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.neg_registar_fatura(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000002', 't1', 'FT TESTE999700/8', NULL);
    RAISE EXCEPTION 'FALHOU 6: registou sem permissão';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.neg_validar_pagamento(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000001', 'FT TESTE999700/1');
    RAISE EXCEPTION 'FALHOU 6: validou sem permissão';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.neg_anular_contrato(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000001', 'Sem permissão');
    RAISE EXCEPTION 'FALHOU 6: anulou sem permissão';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 9. uma PO já encomendada ao fornecedor segura a anulação (como postgres) ─
DO $t$
DECLARE v_c uuid; v_po uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT id INTO v_c FROM client_contracts WHERE negocio_id = '99970000-0000-4000-8000-000000000001' AND versao = 1;
  INSERT INTO purchase_orders (organization_id, order_date, status, created_by, source_type, source_id)
  VALUES (current_setting('teste.org')::uuid, current_date, 'pending',
          (SELECT created_by FROM client_contracts WHERE id = v_c), 'contract', v_c)
  RETURNING id INTO v_po;
  UPDATE purchase_orders SET status = 'ordered' WHERE id = v_po;
  PERFORM set_config('teste.po', v_po::text, true);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  BEGIN
    PERFORM public.neg_anular_contrato(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000001', 'Cliente desistiu');
    RAISE EXCEPTION 'FALHOU 9: anulou com uma PO encomendada';
  EXCEPTION WHEN SQLSTATE 'NE011' THEN NULL;
  END;
  IF (SELECT status FROM client_contracts WHERE negocio_id = '99970000-0000-4000-8000-000000000001' AND versao = 1) <> 'signed' THEN
    RAISE EXCEPTION 'FALHOU 9: o contrato mudou';
  END IF;

  -- 10. a venda direta, sem POs encomendadas: anula-se
  r := public.neg_anular_contrato(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000003', 'Cliente desistiu da venda');
  IF NOT (r->>'anulado')::boolean OR (r->>'contratos')::int <> 1 THEN RAISE EXCEPTION 'FALHOU 10: não anulou: %', r; END IF;
  r := public.neg_anular_contrato(current_setting('teste.org')::uuid, '99970000-0000-4000-8000-000000000003', 'Outra vez');
  IF NOT (r->>'ja_anulado')::boolean THEN RAISE EXCEPTION 'FALHOU 10: a 2.ª anulação não foi idempotente'; END IF;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  IF (SELECT status FROM client_contracts WHERE id = current_setting('teste.vd_contrato')::uuid) <> 'cancelled' THEN
    RAISE EXCEPTION 'FALHOU 10: o contrato de suporte não ficou cancelado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM negocios WHERE id = '99970000-0000-4000-8000-000000000003' AND estado = 'perdido' AND anulado_em IS NOT NULL
                 AND anulado_origem = 'negocio' AND motivo_perda LIKE 'Venda anulada:%') THEN
    RAISE EXCEPTION 'FALHOU 10: o negócio não ficou anulado e perdido';
  END IF;
  -- os gatilhos de estorno do CRM correram para o contrato cancelado
  IF NOT EXISTS (SELECT 1 FROM workflow_execution_log WHERE source_record_id = current_setting('teste.vd_contrato')::uuid AND executed_at >= now() - interval '1 hour'
                 AND action_type ILIKE '%revers%') THEN
    RAISE NOTICE 'Aviso 10: sem registo de estorno no workflow_execution_log (sem linhas de produto não há nada a estornar)';
  END IF;
  -- grants
  IF has_function_privilege('anon', 'public.neg_registar_fatura(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_validar_pagamento(uuid,uuid,text,numeric,date,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_anular_contrato(uuid,uuid,text)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: anon pode executar as RPCs novas'; END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_emitir_ec_se_pronta(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_fase_minima(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_ler_ec(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_contrato_ec(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: as fn_neg_* internas ficaram abertas';
  END IF;
END $t$;

SELECT 'OK: negocio_financeiro (10 grupos de casos)' AS resultado,
       current_setting('teste.rc1') AS recibo_1, current_setting('teste.rc2') AS recibo_2,
       current_setting('teste.vd_ec')::jsonb AS ec_venda_direta,
       current_setting('teste.avisos5')::jsonb AS avisos_json;

ROLLBACK;
