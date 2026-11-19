-- ============================================================
-- Testes: 20270123050000_ec_so_com_medidas_aceites.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria um negócio próprio (prefixo "Teste 123050") na organização
-- do primeiro negócio com número, grava-o por neg_guardar_negocio como um utilizador com pessoas.edit, o portal aceita e assina (como
-- postgres), o Financeiro fatura e valida a 1.ª prestação e as Operações aprovam o plano (permissões dadas só dentro da transação).
-- As linhas do orçamento são livres (sem produtos): a encomenda não reserva stock nem pede ao fornecedor.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/ec_so_com_medidas_aceites.test.sql
--
-- Cobre:
--   1. pago, contrato assinado, plano aprovado e SEM as medidas aceites: a encomenda não sai; o motivo fala das medidas; a fase é 5
--   2. com retif_aceite sugerido (não confirmado): continua sem sair
--   3. com retif_aceite confirmado: a encomenda sai
--   4. o atalho dos negócios antigos: com a encomenda já emitida, tirar retif_aceite não muda nada (emitida continua verdadeiro)
-- ============================================================

BEGIN;

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  n_a uuid := '12305000-0000-4000-8000-000000000001';
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
  VALUES (n_a, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123050 medidas', true);
  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 123050', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-19T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
  PERFORM set_config('teste.obra', jsonb_build_object('estado', 'planeada', 'titulo', 'Obra Teste 123050',
    'fases', '[{"ordem": 1, "nome": "Fase 1"}]'::jsonb,
    'tarefas', '[{"chave": "t-teste", "nome": "Tarefa de teste", "fase": 1, "ordem": 1, "minutos": 60, "estado": "por_fazer"}]'::jsonb,
    'emylia', '{"plano": {"estado": "por aprovar"}}'::jsonb)::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12305000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
END $t$;
RESET ROLE;

DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z' WHERE negocio_id = '12305000-0000-4000-8000-000000000001' AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE negocio_id = '12305000-0000-4000-8000-000000000001' AND versao = 1;
END $t$;

-- ─── 1. o Financeiro e as Operações; sem as medidas aceites ──────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_a uuid := '12305000-0000-4000-8000-000000000001';
  ob jsonb := current_setting('teste.obra')::jsonb;
  r jsonb;
BEGIN
  PERFORM public.neg_registar_fatura(o, n_a, 't1', 'FT TESTE123050/1', NULL);
  r := public.neg_validar_pagamento(o, n_a, 'FT TESTE123050/1', NULL, current_date, 'TRF 1', NULL, NULL);
  IF (r->'ec'->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU 1: emitiu a encomenda só com o pagamento: %', r->'ec'; END IF;
  PERFORM public.obra_guardar_negocio(o, n_a, ob);
  r := public.obra_guardar_negocio(o, n_a, jsonb_set(ob, '{emylia,plano,estado}', '"aprovado"'));
  IF coalesce((r->'ec'->>'emitida')::boolean, false) THEN RAISE EXCEPTION 'FALHOU 1: emitiu a encomenda sem as medidas aceites: %', r->'ec'; END IF;
  IF coalesce(r->'ec'->>'motivo', '') NOT LIKE '%medidas retificadas e aceites%' THEN
    RAISE EXCEPTION 'FALHOU 1: o motivo devia falar das medidas: %', r->'ec';
  END IF;
END $t$;
RESET ROLE;

DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_a uuid := '12305000-0000-4000-8000-000000000001';
  r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = n_a AND versao = 1) IS NOT NULL THEN RAISE EXCEPTION 'FALHOU 1: ec_emitida_em escrito'; END IF;
  IF (SELECT fase FROM negocios WHERE id = n_a) <> 5 THEN RAISE EXCEPTION 'FALHOU 1: o negócio pago devia estar na Obra (5)'; END IF;

  -- 2. sugerido (por confirmar) não conta
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, divisao, valor, sugerido)
  VALUES (o, n_a, 'retif_aceite', '', '2026-11-19', true)
  ON CONFLICT (negocio_id, campo_chave, divisao) DO UPDATE SET valor = EXCLUDED.valor, sugerido = EXCLUDED.sugerido;
  r := public.fn_neg_emitir_ec_se_pronta(n_a, NULL);
  IF (r->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU 2: emitiu com as medidas só sugeridas'; END IF;

  -- 3. aceites: a encomenda sai
  UPDATE negocio_respostas SET sugerido = false WHERE negocio_id = n_a AND campo_chave = 'retif_aceite' AND divisao = '';
  r := public.fn_neg_emitir_ec_se_pronta(n_a, NULL);
  IF NOT (r->>'emitida')::boolean THEN RAISE EXCEPTION 'FALHOU 3: não emitiu com as medidas aceites: %', r; END IF;
  IF (SELECT ec_emitida_em FROM client_contracts WHERE negocio_id = n_a AND versao = 1) IS NULL THEN RAISE EXCEPTION 'FALHOU 3: sem ec_emitida_em'; END IF;

  -- 4. o atalho: com a encomenda emitida, as medidas já não seguram nada
  DELETE FROM negocio_respostas WHERE negocio_id = n_a AND campo_chave = 'retif_aceite';
  r := public.fn_neg_emitir_ec_se_pronta(n_a, NULL);
  IF NOT (r->>'emitida')::boolean OR (r->>'nova')::boolean THEN RAISE EXCEPTION 'FALHOU 4: o negócio com a encomenda emitida mudou: %', r; END IF;

  IF has_function_privilege('authenticated', 'public.fn_neg_medidas_aceites(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_emitir_ec_se_pronta(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: as funções internas ficaram abertas a authenticated';
  END IF;
END $t$;

SELECT 'OK: ec_so_com_medidas_aceites (4 grupos de casos)' AS resultado;

ROLLBACK;
