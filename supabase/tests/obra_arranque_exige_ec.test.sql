-- ============================================================
-- Testes: 20270126270000_obra_arranque_exige_ec.sql (base RH)
-- ============================================================
-- A obra só arranca com a encomenda de cliente (EC) do contrato principal emitida (fn_neg_falta_para_arrancar, chamada por
-- obra_guardar_negocio na 1.ª passagem a em curso). Antes: com o pagamento, a fase Obra e o plano aprovado a obra arrancava sem as medidas
-- aceites e sem a EC (teste de ponta a ponta de 23/11, variante bx). A EC das adendas (emitida com o pagamento da adenda) não segura o
-- arranque da obra principal; a venda direta segue a EC do seu contrato de suporte.
--
-- Tudo dentro de BEGIN … ROLLBACK: cria negócios próprios (prefixo "Teste 126270") na organização do primeiro negócio com número, grava-os
-- como um utilizador com pessoas.edit e dá-lhe, só dentro da transação, as permissões do Financeiro e da obra (como
-- obra_arranque_e_auto_com_adendas.test.sql).
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   rhq.ps1 -SqlFile supabase/tests/obra_arranque_exige_ec.test.sql
--
-- Cobre:
--   1. contrato assinado, pago, plano aprovado, SEM as medidas aceites (a EC não sai): arrancar → CT002 «… a encomenda de cliente emitida …»
--   2. aceites as medidas, a EC sai ao gravar o plano aprovado; depois a obra arranca
--   3. com uma adenda assinada sem pagamento nem EC própria (a EC principal emitida): a obra arranca
--   4. venda direta paga, plano aprovado (a EC do contrato de suporte sai): a obra arranca
--   5. sem pagamento a mensagem fica a de antes (sem a linha da EC)
-- ============================================================

BEGIN;

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  j jsonb;
BEGIN
  SELECT * INTO v_base FROM negocios WHERE numero IS NOT NULL AND deleted_at IS NULL ORDER BY numero LIMIT 1;
  IF v_base.id IS NULL THEN RAISE EXCEPTION 'FALHOU: base sem negócio com número para as fixtures'; END IF;
  SELECT u.auth_user_id INTO v_auth FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador com pessoas.edit na organização %', v_base.organization_id; END IF;
  SELECT am.role_id INTO v_role FROM anew_memberships am JOIN anew_users u ON u.id = am.user_id
  WHERE u.auth_user_id = v_auth AND am.organization_id = v_base.organization_id AND am.status = 'active' LIMIT 1;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT v_role, c, NULL::uuid FROM unnest(ARRAY['negocios.registar_fatura', 'negocios.validar_pagamento', 'negocios.obra.planear']) c
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  VALUES ('12627000-0000-4000-8000-000000000001', v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 126270 sem EC', true),
         ('12627000-0000-4000-8000-000000000002', v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 126270 adenda', true),
         ('12627000-0000-4000-8000-000000000003', v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 126270 venda direta', true),
         ('12627000-0000-4000-8000-000000000004', v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 126270 sem pagamento', true);
  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.user', (SELECT id::text FROM anew_users WHERE auth_user_id = v_auth), true);
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 126270', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-19T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
  -- a venda direta: prestação única, sem contrato (como negocio_financeiro.test.sql)
  j := jsonb_set(j, '{orcamentos,0,venda_direta}', 'true');
  j := jsonb_set(j, '{orcamentos,0,prestacoes}', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Única', 'pct', 1, 'marco', 'adjudicacao')));
  j := jsonb_set(j, '{contratos}', '[]'::jsonb);
  PERFORM set_config('teste.json_vd', j::text, true);
  PERFORM set_config('teste.obra', jsonb_build_object('estado', 'planeada', 'titulo', 'Obra Teste 126270',
    'fases', '[{"ordem": 1, "nome": "Fase 1"}]'::jsonb,
    'tarefas', '[{"chave": "t-teste", "nome": "Tarefa de teste", "fase": 1, "ordem": 1, "minutos": 60, "estado": "por_fazer"}]'::jsonb,
    'emylia', '{"plano": {"estado": "por aprovar"}}'::jsonb)::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE o uuid := current_setting('teste.org')::uuid;
BEGIN
  PERFORM public.neg_guardar_negocio(o, '12627000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(o, '12627000-0000-4000-8000-000000000002', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(o, '12627000-0000-4000-8000-000000000003', current_setting('teste.json_vd')::jsonb);
  PERFORM public.neg_guardar_negocio(o, '12627000-0000-4000-8000-000000000004', current_setting('teste.json')::jsonb);
END $t$;
RESET ROLE;

-- o portal aceita (e assina os contratos); no negócio B as medidas ficam aceites já (como postgres)
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z'
  WHERE negocio_id::text LIKE '12627000-0000-4000-8000-00000000000%' AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE negocio_id::text LIKE '12627000-0000-4000-8000-00000000000%' AND versao = 1;
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, divisao, valor, sugerido)
  VALUES (current_setting('teste.org')::uuid, '12627000-0000-4000-8000-000000000002', 'retif_aceite', '', '2026-11-19', false)
  ON CONFLICT (negocio_id, campo_chave, divisao) DO UPDATE SET valor = EXCLUDED.valor, sugerido = EXCLUDED.sugerido;
END $t$;

-- ─── o Financeiro (A, B, C; D fica sem pagamento) e o plano aprovado ──────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  ob jsonb := current_setting('teste.obra')::jsonb;
  n uuid; i int := 0; r jsonb;
BEGIN
  FOREACH n IN ARRAY ARRAY['12627000-0000-4000-8000-000000000001', '12627000-0000-4000-8000-000000000002', '12627000-0000-4000-8000-000000000003']::uuid[] LOOP
    i := i + 1;
    PERFORM public.neg_registar_fatura(o, n, 't1', 'FT TESTE126270/' || i, NULL);
    PERFORM public.neg_validar_pagamento(o, n, 'FT TESTE126270/' || i, NULL, current_date, 'TRF ' || i, NULL, NULL);
  END LOOP;
  FOREACH n IN ARRAY ARRAY['12627000-0000-4000-8000-000000000001', '12627000-0000-4000-8000-000000000002', '12627000-0000-4000-8000-000000000003']::uuid[] LOOP
    PERFORM public.obra_guardar_negocio(o, n, ob);
  END LOOP;
  -- o plano aprovado (D: a obra entra como postgres, abaixo, como em obra_arranque_e_auto_com_adendas: sem pagamento o servidor não o aprova)
  FOREACH n IN ARRAY ARRAY['12627000-0000-4000-8000-000000000001', '12627000-0000-4000-8000-000000000002', '12627000-0000-4000-8000-000000000003']::uuid[] LOOP
    r := public.obra_guardar_negocio(o, n, jsonb_set(ob, '{emylia,plano,estado}', '"aprovado"'));
  END LOOP;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, estado, criada_por, estado_emylia)
  VALUES (current_setting('teste.org')::uuid, 'OB-TESTE126270-D', '12627000-0000-4000-8000-000000000004', 'Obra Teste 126270 D', 'planeada',
          current_setting('teste.user')::uuid, '{"plano": {"estado": "aprovado"}}'::jsonb);
  -- o pressuposto: A sem EC (sem as medidas aceites); B e C com ela
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = '12627000-0000-4000-8000-000000000001' AND versao = 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o negócio A não devia ter a EC emitida (sem as medidas aceites)';
  END IF;
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = '12627000-0000-4000-8000-000000000002' AND versao = 1) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o negócio B devia ter a EC emitida (medidas aceites, pago, plano aprovado, contrato assinado)';
  END IF;
  IF (SELECT c.ec_emitida_em FROM client_contracts c WHERE c.id = public.fn_neg_contrato_ec('12627000-0000-4000-8000-000000000003')) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a venda direta C devia ter a EC do contrato de suporte emitida';
  END IF;
  -- 3. (preparação) a adenda assinada do negócio B, sem pagamento e sem EC própria
  INSERT INTO adendas (organization_id, negocio_id, numero, referencia, estado, motivo, assinada_em, total, total_com_iva)
  VALUES (current_setting('teste.org')::uuid, '12627000-0000-4000-8000-000000000002', 1, 'AD TESTE126270-1', 'assinada', 'Teste 126270', now(), 100, 123);
END $t$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  ob jsonb := current_setting('teste.obra')::jsonb;
  cur jsonb := jsonb_set(jsonb_set(current_setting('teste.obra')::jsonb, '{estado}', '"em_curso"'), '{emylia,plano,estado}', '"em curso"');
BEGIN
  -- 1. sem a EC (as medidas por aceitar): não arranca, e a mensagem diz o que falta
  BEGIN
    PERFORM public.obra_guardar_negocio(o, '12627000-0000-4000-8000-000000000001', cur);
    RAISE EXCEPTION 'FALHOU 1: a obra arrancou sem a encomenda de cliente emitida';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    IF SQLERRM NOT LIKE 'A obra ainda não pode arrancar: falta%a encomenda de cliente emitida%' THEN RAISE EXCEPTION 'FALHOU 1: outra mensagem: %', SQLERRM; END IF;
    PERFORM set_config('teste.msg1', SQLERRM, true);
  END;
  -- 3. a adenda sem EC não segura a obra principal (B)
  PERFORM public.obra_guardar_negocio(o, '12627000-0000-4000-8000-000000000002', cur);
  -- 4. a venda direta com a EC do contrato de suporte arranca (C)
  PERFORM public.obra_guardar_negocio(o, '12627000-0000-4000-8000-000000000003', cur);
  -- 5. sem pagamento: a mensagem de antes (sem a linha da EC)
  BEGIN
    PERFORM public.obra_guardar_negocio(o, '12627000-0000-4000-8000-000000000004', cur);
    RAISE EXCEPTION 'FALHOU 5: a obra arrancou sem pagamento';
  EXCEPTION WHEN SQLSTATE 'CT002' OR SQLSTATE 'NE013' THEN
    IF SQLERRM LIKE '%encomenda de cliente%' THEN RAISE EXCEPTION 'FALHOU 5: sem pagamento a mensagem não devia falar da EC: %', SQLERRM; END IF;
  END;
END $t$;
RESET ROLE;

-- 2. aceitam-se as medidas do negócio A (como postgres); a EC sai ao gravar o plano aprovado e a obra arranca
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, divisao, valor, sugerido)
  VALUES (current_setting('teste.org')::uuid, '12627000-0000-4000-8000-000000000001', 'retif_aceite', '', '2026-11-19', false)
  ON CONFLICT (negocio_id, campo_chave, divisao) DO UPDATE SET valor = EXCLUDED.valor, sugerido = EXCLUDED.sugerido;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  r jsonb;
BEGIN
  r := public.obra_guardar_negocio(o, '12627000-0000-4000-8000-000000000001', jsonb_set(current_setting('teste.obra')::jsonb, '{emylia,plano,estado}', '"aprovado"'));
  IF NOT coalesce((r->'ec'->>'emitida')::boolean, false) THEN RAISE EXCEPTION 'FALHOU 2: a EC não saiu com as medidas aceites: %', r->'ec'; END IF;
  PERFORM public.obra_guardar_negocio(o, '12627000-0000-4000-8000-000000000001',
    jsonb_set(jsonb_set(current_setting('teste.obra')::jsonb, '{estado}', '"em_curso"'), '{emylia,plano,estado}', '"em curso"'));
END $t$;
RESET ROLE;

DO $t$
DECLARE n uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  FOREACH n IN ARRAY ARRAY['12627000-0000-4000-8000-000000000001', '12627000-0000-4000-8000-000000000002', '12627000-0000-4000-8000-000000000003']::uuid[] LOOP
    IF (SELECT iniciada_em FROM ops_obra WHERE negocio_id = n) IS NULL THEN RAISE EXCEPTION 'FALHOU 2-4: a obra do negócio % não arrancou', n; END IF;
  END LOOP;
  IF (SELECT iniciada_em FROM ops_obra WHERE negocio_id = '12627000-0000-4000-8000-000000000004') IS NOT NULL THEN RAISE EXCEPTION 'FALHOU 5: a obra D arrancou'; END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_falta_para_arrancar(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: fn_neg_falta_para_arrancar ficou aberta a authenticated';
  END IF;
END $t$;

SELECT 'OK: obra_arranque_exige_ec (5 grupos de casos)' AS resultado, current_setting('teste.msg1') AS mensagem_sem_ec;

ROLLBACK;
