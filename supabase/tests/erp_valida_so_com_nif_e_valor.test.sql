-- ============================================================
-- Testes: 20270123020000_erp_valida_so_com_nif_e_valor.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria um negócio próprio (prefixo "Teste 123020") na organização
-- do primeiro negócio com número, grava-o por neg_guardar_negocio, o portal aceita e assina (como postgres) e o Financeiro regista a
-- fatura da 1.ª prestação (615 €). As leituras do ERP passam por neg_erp_registar_leitura como postgres (a função é do service_role).
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/erp_valida_so_com_nif_e_valor.test.sql
--
-- Cobre:
--   1. o negócio sem NIF de faturação → 'sem_nif', fica no histórico, a fatura fica por pagar
--   2. com NIF no negócio e a leitura sem NIF → 'nif_diferente'
--   3. NIF certo, total do ERP 600 € (a fatura é de 615 €) → 'valor_diferente'; 615,03 € (fora da tolerância) → 'valor_diferente'
--   4. NIF certo e total 615,01 € (texto, com vírgula; dentro dos 0,02 €) → 'validada', com o recibo do ERP
-- ============================================================

BEGIN;

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  n_ct uuid := '12302000-0000-4000-8000-000000000001';
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
  SELECT v_role, c, NULL::uuid FROM unnest(ARRAY['negocios.registar_fatura', 'negocios.validar_pagamento']) c
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  VALUES (n_ct, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123020 ERP', true);
  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 123020', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-19T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12302000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
END $t$;
RESET ROLE;

-- o portal aceita e assina
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z' WHERE negocio_id = '12302000-0000-4000-8000-000000000001' AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE negocio_id = '12302000-0000-4000-8000-000000000001' AND versao = 1;
END $t$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.neg_registar_fatura(current_setting('teste.org')::uuid, '12302000-0000-4000-8000-000000000001', 't1', 'FT TESTE123020/1', NULL);
  IF (r->>'total')::numeric <> 615 THEN RAISE EXCEPTION 'FALHOU: a 1.ª prestação devia valer 615 (veio %)', r->>'total'; END IF;
  PERFORM set_config('teste.fatura', r->>'fatura_id', true);
END $t$;
RESET ROLE;

-- ─── as leituras do ERP (como postgres) ──────────────────────────────────────
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_ct uuid := '12302000-0000-4000-8000-000000000001';
  f uuid := current_setting('teste.fatura')::uuid;
  base jsonb := jsonb_build_object('encontrada', true, 'numero', 'FT TESTE123020/1', 'estado', 'paga',
                  'recibos', jsonb_build_array(jsonb_build_object('n', 'REC TESTE123020/1', 'data', current_date::text, 'valor', 615, 'meio', 'TRF')));
  r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

  -- 1. sem NIF de faturação no negócio
  r := public.neg_erp_registar_leitura(f, base || jsonb_build_object('nif', '500000000', 'total', 615, 'pago', 615));
  IF r->>'acao' <> 'sem_nif' THEN RAISE EXCEPTION 'FALHOU 1: sem NIF no negócio devia dar sem_nif: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM negocio_historico WHERE negocio_id = n_ct AND texto LIKE 'FT TESTE123020/1: paga no Eticadata, mas o negócio não tem o NIF%') THEN
    RAISE EXCEPTION 'FALHOU 1: sem a linha no histórico';
  END IF;
  IF EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = f AND validado_em IS NOT NULL) THEN RAISE EXCEPTION 'FALHOU 1: validou o pagamento'; END IF;

  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, divisao, valor)
  VALUES (o, n_ct, 'nif_fat', '', '500 000 000')
  ON CONFLICT (negocio_id, campo_chave, divisao) DO UPDATE SET valor = EXCLUDED.valor;

  -- 2. a leitura sem NIF
  r := public.neg_erp_registar_leitura(f, base || jsonb_build_object('nif', '', 'total', 615, 'pago', 615));
  IF r->>'acao' <> 'nif_diferente' THEN RAISE EXCEPTION 'FALHOU 2: a leitura sem NIF devia dar nif_diferente: %', r; END IF;

  -- 3. o total não bate
  r := public.neg_erp_registar_leitura(f, base || jsonb_build_object('nif', '500000000', 'total', 600, 'pago', 600));
  IF r->>'acao' <> 'valor_diferente' THEN RAISE EXCEPTION 'FALHOU 3: o total de 600 € devia dar valor_diferente: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM negocio_historico WHERE negocio_id = n_ct AND texto LIKE 'FT TESTE123020/1: paga no Eticadata, mas o total do ERP%') THEN
    RAISE EXCEPTION 'FALHOU 3: sem a linha do valor no histórico';
  END IF;
  r := public.neg_erp_registar_leitura(f, base || jsonb_build_object('nif', '500000000', 'total', 615.03, 'pago', 615.03));
  IF r->>'acao' <> 'valor_diferente' THEN RAISE EXCEPTION 'FALHOU 3: 615,03 € (fora da tolerância) devia dar valor_diferente: %', r; END IF;
  r := public.neg_erp_registar_leitura(f, base || jsonb_build_object('nif', '500000000', 'pago', 615));
  IF r->>'acao' <> 'valor_diferente' THEN RAISE EXCEPTION 'FALHOU 3: a leitura sem total devia dar valor_diferente: %', r; END IF;
  IF EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = f AND validado_em IS NOT NULL) THEN RAISE EXCEPTION 'FALHOU 3: validou o pagamento'; END IF;

  -- 4. NIF e valor certos (dentro da tolerância)
  r := public.neg_erp_registar_leitura(f, base || jsonb_build_object('nif', 'PT500000000', 'total', '615,01', 'pago', 615.01));
  IF r->>'acao' <> 'validada' THEN RAISE EXCEPTION 'FALHOU 4: com o NIF e o valor certos devia validar: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = f AND validado_em IS NOT NULL) THEN RAISE EXCEPTION 'FALHOU 4: sem pagamento validado'; END IF;
  PERFORM set_config('teste.recibo', coalesce(r->>'recibo', ''), true);
END $t$;

SELECT 'OK: erp_valida_so_com_nif_e_valor (4 grupos de casos)' AS resultado, current_setting('teste.recibo') AS recibo;

ROLLBACK;
