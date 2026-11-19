-- ============================================================
-- Testes: 20270123000000_so_o_portal_aceita_e_assina.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria negócios próprios (prefixo "Teste 123000") na organização
-- do primeiro negócio com número, grava-os por neg_guardar_negocio como um utilizador com pessoas.edit (role authenticated, auth.uid()
-- pelas claims) e dá ao papel dele, só dentro da transação, as permissões que a escrita direta pedia antes (assim o que recusa é a regra
-- nova, não a falta de permissão).
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/so_o_portal_aceita_e_assina.test.sql
--
-- Cobre:
--   1. authenticated: orçamento da Emylia a 'aceite' → 42501 «Só o cliente aceita…»
--   2. authenticated: contrato da Emylia a 'signed' → 42501; só a assinatura (signature_image) → 42501
--   3. authenticated: rpc_update_client_contract_status(contrato da Emylia, 'signed') → 42501 «Só o cliente assina…»
--   4. authenticated: mudar o título do orçamento da Emylia (sem decisão) não é recusado pela regra nova
--   5. authenticated: orçamento do CRM a 'aceite' não é recusado pela regra nova
--   6. service_role (o portal, e o modo de teste pela Edge Function): aceita e assina sem a regra nova
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_role uuid;
  n_em  uuid := '12300000-0000-4000-8000-000000000001';  -- da Emylia: proposta enviada, contrato enviado
  n_crm uuid := '12300000-0000-4000-8000-000000000002';  -- do CRM
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
  SELECT v_role, c, NULL::uuid FROM unnest(ARRAY['negocios.proposta.decidir', 'negocios.contrato.editar', 'negocios.orcamento.editar',
                                                 'quotes.edit', 'client_contracts.edit']) c
  WHERE EXISTS (SELECT 1 FROM anew_permissions p WHERE p.code = c)
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  VALUES (n_em, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123000 Emylia', true),
         (n_crm, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 123000 CRM', false);
  INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, estado, fluxo_emylia)
  VALUES (v_base.organization_id, v_base.root_organization_id, v_base.entity_id, n_crm,
          (SELECT id FROM anew_users WHERE auth_user_id = v_auth), 'Teste 123000 orçamento do CRM', 'enviado', false);

  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  -- o JSON de um negócio com uma versão enviada (1000 € + IVA a 23% = 1230 €), duas prestações de 50% e o contrato enviado
  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 123000', 'tipo', 'a')),
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
  PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '12300000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
END $t$;
RESET ROLE;

DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM quotes WHERE negocio_id = '12300000-0000-4000-8000-000000000001' AND versao = 1 AND estado = 'enviado')
     OR NOT EXISTS (SELECT 1 FROM client_contracts WHERE negocio_id = '12300000-0000-4000-8000-000000000001' AND versao = 1
                    AND status NOT IN ('signed', 'assinado', 'active')) THEN
    RAISE EXCEPTION 'FALHOU: fixtures sem o orçamento enviado e o contrato por assinar';
  END IF;
  PERFORM set_config('teste.contrato', (SELECT id::text FROM client_contracts WHERE negocio_id = '12300000-0000-4000-8000-000000000001' AND versao = 1), true);
END $t$;

-- ─── casos como o utilizador com sessão (authenticated) ──────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  n_em uuid := '12300000-0000-4000-8000-000000000001';
  n_crm uuid := '12300000-0000-4000-8000-000000000002';
  v_c uuid := current_setting('teste.contrato')::uuid;
  v_n int;
BEGIN
  -- 1. aceitar o orçamento da Emylia por escrita direta
  BEGIN
    UPDATE quotes SET estado = 'aceite', accepted_at = now() WHERE negocio_id = n_em AND versao = 1;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE EXCEPTION 'FALHOU 1: aceitou o orçamento da Emylia por escrita direta (% linha(s); 0 = a RLS escondeu-a, o teste não concluiu)', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Só o cliente aceita a proposta%' THEN RAISE EXCEPTION 'FALHOU 1: recusou por outro motivo: %', SQLERRM; END IF;
  END;

  -- 2. assinar o contrato da Emylia por escrita direta (o estado, e só a assinatura)
  BEGIN
    UPDATE client_contracts SET status = 'signed' WHERE id = v_c;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE EXCEPTION 'FALHOU 2: assinou o contrato da Emylia por escrita direta (% linha(s))', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Só o cliente assina o contrato%' THEN RAISE EXCEPTION 'FALHOU 2: recusou por outro motivo: %', SQLERRM; END IF;
  END;
  BEGIN
    UPDATE client_contracts SET signature_image = 'ASSINATURA FALSA', signed_by_name = 'Falso' WHERE id = v_c;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE EXCEPTION 'FALHOU 2: gravou a assinatura do cliente por escrita direta (% linha(s))', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Só o cliente assina o contrato%' THEN RAISE EXCEPTION 'FALHOU 2: recusou por outro motivo: %', SQLERRM; END IF;
  END;

  -- 3. a mudança de estado da página Contratos (SECURITY DEFINER)
  BEGIN
    PERFORM public.rpc_update_client_contract_status(v_c, 'signed');
    RAISE EXCEPTION 'FALHOU 3: rpc_update_client_contract_status assinou o contrato da Emylia';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Só o cliente assina o contrato%' THEN RAISE EXCEPTION 'FALHOU 3: recusou por outro motivo: %', SQLERRM; END IF;
  END;
  IF (SELECT status FROM client_contracts WHERE id = v_c) IN ('signed', 'assinado', 'active') THEN
    RAISE EXCEPTION 'FALHOU 3: o contrato ficou assinado';
  END IF;

  -- 4. o título do orçamento (sem decisão): a regra nova não se mete (outra recusa, de permissão, não conta aqui)
  BEGIN
    UPDATE quotes SET title = 'Teste 123000 título novo' WHERE negocio_id = n_em AND versao = 1;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM LIKE 'Só o cliente%' THEN RAISE EXCEPTION 'FALHOU 4: a regra nova recusou uma mudança sem decisão'; END IF;
  END;

  -- 5. o orçamento do CRM a aceite: a regra nova não se mete
  BEGIN
    UPDATE quotes SET estado = 'aceite', accepted_at = now() WHERE negocio_id = n_crm;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM LIKE 'Só o cliente%' THEN RAISE EXCEPTION 'FALHOU 5: a regra nova recusou um orçamento do CRM'; END IF;
  END;
END $t$;
RESET ROLE;

-- ─── 6. o portal: service_role (é o que a Edge Function client-portal-action usa, também no modo de teste) ─
DO $t$
DECLARE
  n_em uuid := '12300000-0000-4000-8000-000000000001';
  v_c uuid := current_setting('teste.contrato')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z' WHERE negocio_id = n_em AND versao = 1;
    UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal',
                                signature_date = '2026-11-19T11:30:00Z' WHERE id = v_c;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Só o cliente%' THEN RAISE EXCEPTION 'FALHOU 6: a regra nova recusou o service_role: %', SQLERRM; END IF;
    IF SQLERRM <> '__desfazer__' THEN RAISE NOTICE 'Aviso 6: como service_role outra coisa falhou (não é a regra nova): % %', SQLSTATE, SQLERRM; END IF;
  END;
  -- e como postgres (o mesmo que o teste de 20261231999700), que fica gravado até ao ROLLBACK
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-11-19T09:00:00Z' WHERE negocio_id = n_em AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal',
                              signature_date = '2026-11-19T11:30:00Z' WHERE id = v_c;
  IF (SELECT estado FROM quotes WHERE negocio_id = n_em AND versao = 1) <> 'aceite' OR (SELECT status FROM client_contracts WHERE id = v_c) <> 'signed' THEN
    RAISE EXCEPTION 'FALHOU 6: o portal não aceitou nem assinou';
  END IF;

  -- grants
  IF has_function_privilege('anon', 'public.fn_neg_documento_do_fluxo_emylia(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_so_o_portal_decide()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: as funções novas ficaram abertas a mais';
  END IF;
END $t$;

SELECT 'OK: so_o_portal_aceita_e_assina (6 grupos de casos)' AS resultado;

ROLLBACK;
