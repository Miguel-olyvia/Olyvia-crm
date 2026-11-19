-- ============================================================
-- Testes: 20270123010000_faturar_e_validar_so_com_contrato.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration (e a 20270123020000, porque o caso 6 passa pela verificação no ERP com o NIF e o valor certos).
-- Tudo dentro de BEGIN … ROLLBACK: cria negócios próprios (prefixo "Teste 123010") na organização do primeiro negócio com número,
-- grava-os por neg_guardar_negocio como um utilizador com pessoas.edit e dá-lhe, só dentro da transação, as permissões do Financeiro.
-- O portal (aceitar e assinar) e as mudanças do contrato fazem-se como postgres.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/faturar_e_validar_so_com_contrato.test.sql
--
-- Cobre:
--   1. proposta aceite, contrato por assinar: registar a fatura da 1.ª prestação → NE014
--   2. venda direta aceite (sem contrato): registar e validar a 1.ª prestação passam
--   3. contrato assinado: registar passa (615 €)
--   4. a fatura registada e o contrato a voltar a por assinar (o caso do fluxo de 9/11): validar o pagamento → NE014; registar outra vez
--      a mesma fatura (dados do ERP) passa
--   5. fn_neg_validar_pagamento_erp (a verificação automática) → NE014
--   6. neg_erp_registar_leitura com a fatura paga no ERP → acao 'erro' com a mensagem do contrato; a fatura fica por pagar
--   7. contrato assinado outra vez: validar passa; validar outra vez é idempotente, mesmo com o contrato de novo por assinar
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  n_ct uuid := '12301000-0000-4000-8000-000000000001';  -- com contrato
  n_vd uuid := '12301000-0000-4000-8000-000000000002';  -- venda direta
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
  VALUES (n_ct, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123010 contrato', true),
         (n_vd, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123010 venda direta', true);
  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 123010', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-19T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
  j := jsonb_set(j, '{orcamentos,0,venda_direta}', 'true');
  j := jsonb_set(j, '{orcamentos,0,prestacoes}', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Única', 'pct', 1, 'marco', 'adjudicacao')));
  j := jsonb_set(j, '{contratos}', '[]'::jsonb);
  PERFORM set_config('teste.json_vd', j::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12301000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12301000-0000-4000-8000-000000000002', current_setting('teste.json_vd')::jsonb);
END $t$;
RESET ROLE;

-- o portal aceita as duas propostas; o contrato fica por assinar
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z'
  WHERE negocio_id IN ('12301000-0000-4000-8000-000000000001', '12301000-0000-4000-8000-000000000002') AND versao = 1;
  -- o NIF de faturação, depois da gravação do negócio (o caso 6 passa pela regra do NIF e do valor de 20270123020000)
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, divisao, valor)
  VALUES (current_setting('teste.org')::uuid, '12301000-0000-4000-8000-000000000001', 'nif_fat', '', '500000000')
  ON CONFLICT (negocio_id, campo_chave, divisao) DO UPDATE SET valor = EXCLUDED.valor;
  PERFORM set_config('teste.contrato', (SELECT id::text FROM client_contracts WHERE negocio_id = '12301000-0000-4000-8000-000000000001' AND versao = 1), true);
  IF current_setting('teste.contrato', true) IS NULL OR public.fn_neg_contrato_principal_assinado('12301000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FALHOU: fixtures sem o contrato por assinar';
  END IF;
END $t$;

-- ─── 1 a 4, como o Financeiro ────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_ct uuid := '12301000-0000-4000-8000-000000000001';
  n_vd uuid := '12301000-0000-4000-8000-000000000002';
  r jsonb;
BEGIN
  -- 1. sem contrato assinado
  BEGIN
    PERFORM public.neg_registar_fatura(o, n_ct, 't1', 'FT TESTE123010/1', NULL);
    RAISE EXCEPTION 'FALHOU 1: registou a fatura da 1.ª prestação sem o contrato assinado';
  EXCEPTION WHEN SQLSTATE 'NE014' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM faturas WHERE negocio_id = n_ct) THEN RAISE EXCEPTION 'FALHOU 1: ficou uma fatura'; END IF;

  -- 2. a venda direta não tem contrato
  r := public.neg_registar_fatura(o, n_vd, 'unica', 'FT TESTE123010/3', NULL);
  r := public.neg_validar_pagamento(o, n_vd, 'FT TESTE123010/3', NULL, current_date, NULL, NULL, NULL);
  IF r->>'recibo' IS NULL THEN RAISE EXCEPTION 'FALHOU 2: a venda direta não validou: %', r; END IF;
END $t$;
RESET ROLE;

-- o portal assina o contrato
UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
WHERE id = current_setting('teste.contrato')::uuid;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  -- 3. com o contrato assinado
  r := public.neg_registar_fatura(current_setting('teste.org')::uuid, '12301000-0000-4000-8000-000000000001', 't1', 'FT TESTE123010/1', NULL);
  IF (r->>'total')::numeric <> 615 THEN RAISE EXCEPTION 'FALHOU 3: a 1.ª prestação devia valer 615 (veio %)', r->>'total'; END IF;
  PERFORM set_config('teste.fatura', r->>'fatura_id', true);
END $t$;
RESET ROLE;

-- o contrato volta a por assinar (o negócio do fluxo de 9/11: fatura registada antes do contrato)
UPDATE client_contracts SET status = 'pending_signature', signature_image = NULL, signed_by_name = NULL, signature_date = NULL
WHERE id = current_setting('teste.contrato')::uuid;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE o uuid := current_setting('teste.org')::uuid; n_ct uuid := '12301000-0000-4000-8000-000000000001';
BEGIN
  -- 4. validar sem contrato: recusa; registar outra vez a mesma fatura (o ERP) passa
  BEGIN
    PERFORM public.neg_validar_pagamento(o, n_ct, 'FT TESTE123010/1', NULL, current_date, 'TRF 1', NULL, NULL);
    RAISE EXCEPTION 'FALHOU 4: validou o pagamento da 1.ª prestação sem o contrato assinado';
  EXCEPTION WHEN SQLSTATE 'NE014' THEN NULL;
  END;
  PERFORM public.neg_registar_fatura(o, n_ct, 't1', 'FT TESTE123010/1', jsonb_build_object('atcud', 'ABCD-123010', 'estado', 'por pagar'));
  IF (SELECT atcud FROM faturas WHERE organization_id = o AND numero = 'FT TESTE123010/1') IS DISTINCT FROM 'ABCD-123010' THEN
    RAISE EXCEPTION 'FALHOU 4: registar outra vez a mesma fatura deixou de atualizar o ERP';
  END IF;
END $t$;
RESET ROLE;

-- ─── 5 e 6: a verificação automática (como postgres, é do service_role) ──────
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid; n_ct uuid := '12301000-0000-4000-8000-000000000001'; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.fn_neg_validar_pagamento_erp(NULL, o, n_ct, 'FT TESTE123010/1', NULL, current_date, NULL, NULL, NULL);
    RAISE EXCEPTION 'FALHOU 5: a verificação automática validou sem o contrato assinado';
  EXCEPTION WHEN SQLSTATE 'NE014' THEN NULL;
  END;

  r := public.neg_erp_registar_leitura(current_setting('teste.fatura')::uuid,
         jsonb_build_object('encontrada', true, 'numero', 'FT TESTE123010/1', 'nif', '500000000', 'total', 615, 'pago', 615,
                            'estado', 'paga', 'recibos', jsonb_build_array(jsonb_build_object('n', 'REC TESTE123010/1', 'data', current_date::text, 'valor', 615))));
  IF r->>'acao' <> 'erro' OR coalesce(r->>'msg', '') NOT LIKE '%contrato assinado%' THEN
    RAISE EXCEPTION 'FALHOU 6: a leitura do ERP devia dar erro do contrato: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = current_setting('teste.fatura')::uuid AND validado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'FALHOU 6: ficou um pagamento validado';
  END IF;

  -- o portal assina outra vez
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE id = current_setting('teste.contrato')::uuid;
END $t$;

-- ─── 7. com o contrato assinado, valida; e validar outra vez é idempotente ───
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE o uuid := current_setting('teste.org')::uuid; n_ct uuid := '12301000-0000-4000-8000-000000000001'; r jsonb; r2 jsonb;
BEGIN
  r := public.neg_validar_pagamento(o, n_ct, 'FT TESTE123010/1', NULL, current_date, 'TRF 1', NULL, NULL);
  IF r->>'recibo' IS NULL OR (r->>'ja_validado')::boolean THEN RAISE EXCEPTION 'FALHOU 7: não validou: %', r; END IF;
  PERFORM set_config('teste.recibo', r->>'recibo', true);
END $t$;
RESET ROLE;
UPDATE client_contracts SET status = 'pending_signature' WHERE id = current_setting('teste.contrato')::uuid;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.neg_validar_pagamento(current_setting('teste.org')::uuid, '12301000-0000-4000-8000-000000000001', 'FT TESTE123010/1');
  IF NOT (r->>'ja_validado')::boolean OR r->>'recibo' IS DISTINCT FROM current_setting('teste.recibo') THEN
    RAISE EXCEPTION 'FALHOU 7: validar outra vez deixou de ser idempotente: %', r;
  END IF;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_neg_contrato_principal_assinado(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_exigir_contrato_para_pagar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: as funções novas ficaram abertas a authenticated';
  END IF;
END $t$;

SELECT 'OK: faturar_e_validar_so_com_contrato (7 grupos de casos)' AS resultado, current_setting('teste.recibo') AS recibo;

ROLLBACK;
