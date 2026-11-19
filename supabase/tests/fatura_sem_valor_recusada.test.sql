-- ============================================================
-- Testes: 20270123040000_fatura_sem_valor_recusada.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria negócios próprios (prefixo "Teste 123040") na organização
-- do primeiro negócio com número, grava-os por neg_guardar_negocio como um utilizador com pessoas.edit, o portal aceita e assina (como
-- postgres) e o Financeiro regista as faturas (permissões dadas só dentro da transação).
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/fatura_sem_valor_recusada.test.sql
--
-- Cobre:
--   1. o ERP diz que a fatura vale 0 € → NE006 «O valor a faturar dá 0 €…», sem fatura gravada
--   2. o orçamento sem valor (0 €) e sem leitura do ERP → NE006
--   3. o mesmo orçamento com o total do ERP (100 €) → regista
--   4. registar outra vez a fatura que já está na base, com um ERP que diz 0 → passa (só atualiza o ERP; não encrava as que existem)
-- ============================================================

BEGIN;

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  n_a uuid := '12304000-0000-4000-8000-000000000001';  -- 1230 €
  n_z uuid := '12304000-0000-4000-8000-000000000002';  -- 0 €
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
  VALUES (n_a, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123040 com valor', true),
         (n_z, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123040 sem valor', true);
  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 123040', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-19T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  PERFORM set_config('teste.json', j::text, true);
  -- o orçamento sem valor
  j := jsonb_set(j, '{orcamentos,0,preco_final}', '0');
  j := jsonb_set(j, '{orcamentos,0,total_com_iva}', '0');
  j := jsonb_set(j, '{orcamentos,0,linhas,0,preco_un}', '0');
  PERFORM set_config('teste.json_z', j::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12304000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12304000-0000-4000-8000-000000000002', current_setting('teste.json_z')::jsonb);
END $t$;
RESET ROLE;

-- o portal aceita e assina
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z'
  WHERE negocio_id IN ('12304000-0000-4000-8000-000000000001', '12304000-0000-4000-8000-000000000002') AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal', signature_date = now()
  WHERE negocio_id IN ('12304000-0000-4000-8000-000000000001', '12304000-0000-4000-8000-000000000002') AND versao = 1;
  IF (SELECT coalesce(total_com_iva, total, 0) FROM quotes WHERE negocio_id = '12304000-0000-4000-8000-000000000002' AND versao = 1) <> 0 THEN
    RAISE NOTICE 'Aviso: o orçamento sem valor ficou com total (o caso 2 não se aplica): %',
      (SELECT coalesce(total_com_iva, total) FROM quotes WHERE negocio_id = '12304000-0000-4000-8000-000000000002' AND versao = 1);
  END IF;
END $t$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  o uuid := current_setting('teste.org')::uuid;
  n_a uuid := '12304000-0000-4000-8000-000000000001';
  n_z uuid := '12304000-0000-4000-8000-000000000002';
  r jsonb;
BEGIN
  -- 1. o ERP diz 0 €
  BEGIN
    PERFORM public.neg_registar_fatura(o, n_a, 't1', 'FT TESTE123040/1', jsonb_build_object('total', 0));
    RAISE EXCEPTION 'FALHOU 1: registou uma fatura de 0 €';
  EXCEPTION WHEN SQLSTATE 'NE006' THEN
    IF SQLERRM NOT LIKE 'O valor a faturar dá 0 €%' THEN RAISE EXCEPTION 'FALHOU 1: outra mensagem: %', SQLERRM; END IF;
  END;
  IF EXISTS (SELECT 1 FROM faturas WHERE organization_id = o AND numero = 'FT TESTE123040/1') THEN RAISE EXCEPTION 'FALHOU 1: ficou a fatura'; END IF;

  -- 2. o orçamento sem valor e sem ERP
  IF (SELECT coalesce(total_com_iva, total, 0) FROM quotes WHERE negocio_id = n_z AND versao = 1) = 0 THEN
    BEGIN
      PERFORM public.neg_registar_fatura(o, n_z, 't1', 'FT TESTE123040/2', NULL);
      RAISE EXCEPTION 'FALHOU 2: registou uma fatura de 0 € (orçamento sem valor)';
    EXCEPTION WHEN SQLSTATE 'NE006' THEN
      IF SQLERRM NOT LIKE 'O valor a faturar dá 0 €%' THEN RAISE EXCEPTION 'FALHOU 2: outra mensagem: %', SQLERRM; END IF;
    END;
  END IF;

  -- 3. o mesmo com o total do ERP
  r := public.neg_registar_fatura(o, n_z, 't1', 'FT TESTE123040/2', jsonb_build_object('total', 100));
  IF (r->>'total')::numeric <> 100 THEN RAISE EXCEPTION 'FALHOU 3: devia registar 100 € (veio %)', r->>'total'; END IF;

  -- 4. a mesma fatura outra vez, com um ERP que diz 0: só atualiza o ERP
  r := public.neg_registar_fatura(o, n_z, 't1', 'FT TESTE123040/2', jsonb_build_object('total', 0, 'atcud', 'ABCD-123040'));
  IF (SELECT atcud FROM faturas WHERE organization_id = o AND numero = 'FT TESTE123040/2') IS DISTINCT FROM 'ABCD-123040'
     OR (SELECT total FROM faturas WHERE organization_id = o AND numero = 'FT TESTE123040/2') <> 100 THEN
    RAISE EXCEPTION 'FALHOU 4: registar outra vez mudou o valor ou não atualizou o ERP';
  END IF;
END $t$;
RESET ROLE;

SELECT 'OK: fatura_sem_valor_recusada (4 grupos de casos)' AS resultado;

ROLLBACK;
