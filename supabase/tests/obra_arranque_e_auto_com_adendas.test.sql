-- ============================================================
-- Testes: 20270123030000_obra_arranque_e_auto_com_adendas.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar 20270122900000 e esta migration (e as 20270123010000/20270123050000, se já estiverem: o fluxo das fixtures
-- cumpre-as). Tudo dentro de BEGIN … ROLLBACK: cria negócios próprios (prefixo "Teste 123030") na organização do primeiro negócio com
-- número, grava-os como um utilizador com pessoas.edit e dá-lhe, só dentro da transação, as permissões do Financeiro e da obra.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/obra_arranque_e_auto_com_adendas.test.sql
--
-- Cobre:
--   1. pago, plano gravado por aprovar: gravar a obra em curso (com o plano em curso) → CT002 «… aprovar o plano da obra …»
--   2. o plano aprovado grava-se; depois a obra arranca
--   3. sem pagamento, com o plano aprovado já na base: arrancar → CT002 «… pagamento da 1.ª prestação …»
--   4. fn_neg_parcelas_por_pagar: sem p_so_arranque conta a parcela da adenda assinada por faturar; com p_so_arranque não
-- ============================================================

BEGIN;

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  n_a uuid := '12303000-0000-4000-8000-000000000001';  -- pago
  n_b uuid := '12303000-0000-4000-8000-000000000002';  -- sem pagamento
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
  VALUES (n_a, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123030 pago', true),
         (n_b, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123030 sem pagamento', true);
  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.user', (SELECT id::text FROM anew_users WHERE auth_user_id = v_auth), true);
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 123030', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-19T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
  -- a obra (como em medidas_depois_do_pagamento.sql): uma tarefa, o plano por aprovar
  PERFORM set_config('teste.obra', jsonb_build_object('estado', 'planeada', 'titulo', 'Obra Teste 123030',
    'fases', '[{"ordem": 1, "nome": "Fase 1"}]'::jsonb,
    'tarefas', '[{"chave": "t-teste", "nome": "Tarefa de teste", "fase": 1, "ordem": 1, "minutos": 60, "estado": "por_fazer"}]'::jsonb,
    'emylia', '{"plano": {"estado": "por aprovar"}}'::jsonb)::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12303000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12303000-0000-4000-8000-000000000002', current_setting('teste.json')::jsonb);
END $t$;
RESET ROLE;

-- o portal aceita e assina os dois
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z'
  WHERE negocio_id IN ('12303000-0000-4000-8000-000000000001', '12303000-0000-4000-8000-000000000002') AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE negocio_id IN ('12303000-0000-4000-8000-000000000001', '12303000-0000-4000-8000-000000000002') AND versao = 1;
END $t$;

-- ─── o Financeiro (só o negócio A) e a obra ──────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_a uuid := '12303000-0000-4000-8000-000000000001';
BEGIN
  PERFORM public.neg_registar_fatura(o, n_a, 't1', 'FT TESTE123030/1', NULL);
  PERFORM public.neg_validar_pagamento(o, n_a, 'FT TESTE123030/1', NULL, current_date, 'TRF 1', NULL, NULL);
END $t$;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_a uuid := '12303000-0000-4000-8000-000000000001';
  ob jsonb := current_setting('teste.obra')::jsonb;
  r jsonb;
BEGIN
  -- a obra nasce com o plano por aprovar
  r := public.obra_guardar_negocio(o, n_a, ob);
  IF r->>'obra_id' IS NULL THEN RAISE EXCEPTION 'FALHOU: a obra não nasceu: %', r; END IF;

  -- 1. arrancar com o plano gravado por aprovar
  BEGIN
    PERFORM public.obra_guardar_negocio(o, n_a, jsonb_set(jsonb_set(ob, '{estado}', '"em_curso"'), '{emylia,plano,estado}', '"em curso"'));
    RAISE EXCEPTION 'FALHOU 1: a obra arrancou sem o plano aprovado gravado';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    IF SQLERRM NOT LIKE 'A obra ainda não pode arrancar: falta%aprovar o plano da obra%' THEN RAISE EXCEPTION 'FALHOU 1: outra mensagem: %', SQLERRM; END IF;
  END;

  -- 2. aprova-se (grava-se) e depois arranca
  PERFORM public.obra_guardar_negocio(o, n_a, jsonb_set(ob, '{emylia,plano,estado}', '"aprovado"'));
  PERFORM public.obra_guardar_negocio(o, n_a, jsonb_set(jsonb_set(ob, '{estado}', '"em_curso"'), '{emylia,plano,estado}', '"em curso"'));
  IF (SELECT iniciada_em FROM ops_obra WHERE negocio_id = n_a) IS NULL THEN RAISE EXCEPTION 'FALHOU 2: a obra não arrancou'; END IF;
END $t$;
RESET ROLE;

-- ─── 3. sem pagamento: a obra do negócio B com o plano aprovado já na base (como postgres) ─
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, estado, criada_por, estado_emylia)
  VALUES (current_setting('teste.org')::uuid, 'OB-TESTE123030-B', '12303000-0000-4000-8000-000000000002', 'Obra Teste 123030 B', 'planeada',
          current_setting('teste.user')::uuid, '{"plano": {"estado": "aprovado"}}'::jsonb);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE ob jsonb := current_setting('teste.obra')::jsonb;
BEGIN
  BEGIN
    PERFORM public.obra_guardar_negocio(current_setting('teste.org')::uuid, '12303000-0000-4000-8000-000000000002',
      jsonb_set(jsonb_set(ob, '{estado}', '"em_curso"'), '{emylia,plano,estado}', '"em curso"'));
    RAISE EXCEPTION 'FALHOU 3: a obra arrancou sem o pagamento da 1.ª prestação';
  EXCEPTION WHEN SQLSTATE 'CT002' OR SQLSTATE 'NE013' THEN
    -- NE013 (20270117830000) também é recusa do pagamento; com CT002 a mensagem é a nova
    IF SQLSTATE = 'CT002' AND SQLERRM NOT LIKE 'A obra ainda não pode arrancar: falta%pagamento da 1.ª prestação%' THEN
      RAISE EXCEPTION 'FALHOU 3: outra mensagem: %', SQLERRM;
    END IF;
  END;
END $t$;
RESET ROLE;

-- ─── 4. as parcelas das adendas assinadas no auto de receção (como postgres) ─
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_a uuid := '12303000-0000-4000-8000-000000000001';
  v_ad uuid; v_q uuid; l text[];
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  l := public.fn_neg_parcelas_por_pagar(n_a, false);
  IF array_to_string(l, ' | ') NOT LIKE '%a parcela final (50%)%' OR array_to_string(l, ' | ') LIKE '%adenda%' THEN
    RAISE EXCEPTION 'FALHOU 4: antes da adenda devia faltar só a parcela final: %', l;
  END IF;

  INSERT INTO adendas (organization_id, negocio_id, numero, referencia, estado, motivo, assinada_em, total, total_com_iva)
  VALUES (o, n_a, 1, 'AD TESTE123030-1', 'assinada', 'Teste 123030', now(), 100, 123)
  RETURNING id INTO v_ad;
  INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, adenda_id, created_by, title, estado, fluxo_emylia, versao, total_com_iva)
  SELECT n.organization_id, n.root_organization_id, n.entity_id, n.id, v_ad, current_setting('teste.user')::uuid, 'Teste 123030 adenda', 'aceite', true, 1, 123
  FROM negocios n WHERE n.id = n_a
  RETURNING id INTO v_q;
  INSERT INTO quote_prestacoes (organization_id, quote_id, ordem, rotulo, pct, marco)
  VALUES (o, v_q, 1, 'Na assinatura', 1, 'adjudicacao');

  l := public.fn_neg_parcelas_por_pagar(n_a, false);
  IF NOT ('faturar e receber a 1.ª parcela da adenda AD TESTE123030-1' = ANY (l)) THEN
    RAISE EXCEPTION 'FALHOU 4: o auto de receção não espera pela parcela da adenda: %', l;
  END IF;
  l := public.fn_neg_parcelas_por_pagar(n_a, true);
  IF array_to_string(l, ' | ') LIKE '%adenda%' THEN
    RAISE EXCEPTION 'FALHOU 4: o arranque passou a esperar pela adenda: %', l;
  END IF;

  IF has_function_privilege('authenticated', 'public.fn_neg_parcelas_por_pagar(uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_falta_para_arrancar(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: as funções internas ficaram abertas a authenticated';
  END IF;
END $t$;

SELECT 'OK: obra_arranque_e_auto_com_adendas (4 grupos de casos)' AS resultado;

ROLLBACK;
