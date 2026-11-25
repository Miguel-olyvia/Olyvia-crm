-- ============================================================================================================================
-- Teste: lote Contratos/Portal da auditoria de permissões (23/11/2026) — migrações 20270126000000, 20270126010000, 20270126020000
-- Base: ramo RH (uetjghdkwbywbftedtth). NUNCA correr na produção (tzbfgwpckrfbqcolqxtm).
-- Correr:  powershell -NoProfile -ExecutionPolicy Bypass -File C:\Olyvia\vault\auditoria-permissoes\rhq.ps1 -SqlFile <este ficheiro>
--
-- Não deixa nada: BEGIN … ROLLBACK; cada ação corre num sub-bloco que acaba SEMPRE em RAISE; tabelas temporárias ON COMMIT DROP;
-- funções de apoio em pg_temp. Fixtures criadas dentro da transação (prefixo «LC2311»), como em fase2_contrato_financeiro.sql.
-- Impersonação: request.jwt.claims {sub, role:authenticated} + SET LOCAL ROLE authenticated.
--
-- Resultado (último SELECT): json { falhas, ok, linhas: [conta | caso | esperado | obtido | resultado | detalhe] }.
-- Cobre:
--   C1  cancel_and_replace_contract / rpc_update_client_contract_status('cancelled') pedem client_contracts.cancel (+ o edit e o âmbito
--       de sempre); contrato ASSINADO de um negócio da Emylia → recusado e apontado para o Negócio (neg_anular_contrato).
--       Caminho legítimo: o super_admin anula um contrato assinado do CRM (sem negócio).
--   A3  client_portal_documents (INSERT/UPDATE): permissão de create-client-portal-access na organização + âmbito do documento;
--       fn_portal_doc_no_ambito (a que a edge function chama); republish_proposal_snapshot com âmbito.
--   A4  rpc_contra_assinar_contrato('signatario_minuta'): send_signature + âmbito de client_contracts.edit.
-- ============================================================================================================================
BEGIN;

CREATE TEMP TABLE r (n serial, conta text, caso text, esperado text, obtido text, resultado text, detalhe text) ON COMMIT DROP;
CREATE TEMP TABLE ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE contas (ordem int, conta text, email text, auth uuid, uid uuid) ON COMMIT DROP;

-- tenta uma ação como p_auth (p_prep como postgres, p_acao como authenticated, p_verif como postgres); desfeita pelo RAISE final
CREATE FUNCTION pg_temp.tentar(p_auth uuid, p_prep text, p_acao text, p_verif text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text; v_ok boolean;
BEGIN
  BEGIN
    IF p_prep IS NOT NULL THEN EXECUTE p_prep; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_acao INTO v;
    EXECUTE 'RESET ROLE';
    IF p_verif IS NOT NULL THEN EXECUTE p_verif INTO v_ok; ELSE v_ok := true; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = CASE WHEN coalesce(v_ok, false) THEN 'PASSA' ELSE 'SEM EFEITO' END, DETAIL = left(coalesce(v, ''), 200);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0999' THEN
      GET STACKED DIAGNOSTICS v = PG_EXCEPTION_DETAIL;
      RETURN SQLERRM || '|' || coalesce(v, '');
    END IF;
    RETURN 'RECUSA|' || SQLSTATE || ' ' || left(SQLERRM, 220);
  END;
END $f$;

-- regista: p_esperado 'passa' | 'recusa' | 'recusa:<padrão>' (recusa com a mensagem a casar o padrão)
CREATE FUNCTION pg_temp.reg(p_conta text, p_caso text, p_esperado text, p_res text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_obt text := CASE WHEN p_res LIKE 'PASSA%' THEN 'passa' ELSE 'recusa' END;
        v_ok boolean;
BEGIN
  v_ok := CASE WHEN p_esperado = 'passa' THEN v_obt = 'passa'
               WHEN p_esperado = 'recusa' THEN v_obt = 'recusa'
               ELSE v_obt = 'recusa' AND p_res ~* split_part(p_esperado, ':', 2) END;
  INSERT INTO r (conta, caso, esperado, obtido, resultado, detalhe)
  VALUES (p_conta, p_caso, p_esperado, v_obt, CASE WHEN v_ok THEN 'OK' ELSE 'FALHA' END, left(p_res, 200));
END $f$;

INSERT INTO contas (ordem, conta, email)
VALUES (1, 'comercial A (dono)', 'rita.costa@mudelar.pt'),
       (2, 'comercial B (não dono)', 'rui.jesus@mudelar.pt'),
       (3, 'financeiro', 'financeiro@bmlar.pt'),
       (4, 'org_admin', 'marco.rodrigues@bmlar.pt'),
       (5, 'super_admin', 'ricardo.belchior@bmlar.pt');
UPDATE contas c SET auth = u.auth_user_id, uid = u.id FROM anew_users u WHERE u.email = c.email AND u.deleted_at IS NULL;

-- ─── fixtures (como postgres) ─────────────────────────────────────────────────────────────────────────────────────────────
DO $fx$
DECLARE
  o uuid := '3242e925-da26-459a-8258-be04d904e355';           -- Mudelar
  v_root uuid := '4e5901c6-ed7d-45c3-a143-ea2bdd09f091';
  v_ent uuid := 'e35e068a-860f-4769-a31c-8c26b88d72a1';        -- tem acesso ao portal na Mudelar (client_portal_users 2ee50e89…)
  v_rita uuid := (SELECT auth FROM contas WHERE ordem = 1);
  n2 uuid := '23110000-0000-4000-8000-0000000000a2';  -- contrato enviado (pending_signature), no portal
  n3 uuid := '23110000-0000-4000-8000-0000000000a3';  -- contrato assinado no portal
  n6 uuid := '23110000-0000-4000-8000-0000000000a6';  -- contrato em rascunho
  j jsonb; j_ct jsonb; j_draft jsonb; v_crm uuid;
BEGIN
  IF (SELECT count(*) FROM contas WHERE auth IS NOT NULL) <> 5 THEN RAISE EXCEPTION 'FIXTURE: faltam contas (%)', (SELECT json_agg(email) FROM contas WHERE auth IS NULL); END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_rita, 'role', 'authenticated')::text, true);
  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  SELECT x, o, v_root, v_ent, 'LC2311 ' || right(x::text, 2), true FROM unnest(ARRAY[n2, n3, n6]) x;
  UPDATE negocios SET fase = 3 WHERE id IN (n2, n3, n6);

  j := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'LC2311', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0, 'venda_direta', false,
      'enviado_em', '2026-11-20T10:00:00Z', 'preco_final', 1000, 'total_com_iva', 1230, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                      jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 1000, 'parte_iva', 'materiais', 'custo', jsonb_build_object('custo_un', 500))))),
    'contratos', '[]'::jsonb);
  j_ct := jsonb_set(j, '{contratos}', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb)));
  j_draft := jsonb_set(j_ct, '{contratos,0,estado}', '"rascunho"');

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.neg_guardar_negocio(o, n2, j_ct);
  PERFORM public.neg_guardar_negocio(o, n3, j_ct);
  PERFORM public.neg_guardar_negocio(o, n6, j_draft);
  EXECUTE 'RESET ROLE';

  -- o portal (sem sessão): aceita as propostas e o cliente assina n3 (OTP)
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = now() WHERE negocio_id IN (n2, n3, n6) AND versao = 1;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente LC2311', signature_date = now()
  WHERE negocio_id = n3 AND versao = 1;

  INSERT INTO ctx SELECT 'c' || right(negocio_id::text, 1), id::text FROM client_contracts WHERE negocio_id IN (n2, n3, n6) AND versao = 1;
  IF (SELECT count(*) FROM ctx WHERE k IN ('c2', 'c3', 'c6')) <> 3 THEN RAISE EXCEPTION 'FIXTURE: faltam contratos (%)', (SELECT string_agg(k, ',') FROM ctx); END IF;
  INSERT INTO ctx SELECT 'p2', id::text FROM proposals WHERE negocio_id = n2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1;

  -- contrato do CRM (sem negócio) da Rita, assinado: o caminho legítimo de «Anular contrato» em /client-contracts
  INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, created_by, status, currency, notes)
  VALUES (o, v_root, v_ent, (SELECT uid FROM contas WHERE ordem = 1), 'draft', 'EUR', 'LC2311 CRM') RETURNING id INTO v_crm;
  UPDATE client_contracts SET status = 'signed' WHERE id = v_crm;
  INSERT INTO ctx VALUES ('crm', v_crm::text), ('o', o::text), ('ent', v_ent::text);

  -- minuta com signatário (o super admin, can_sign_contracts) no contrato c2 (já enviado)
  UPDATE client_contract_templates SET signatory_user_id = (SELECT uid FROM contas WHERE ordem = 5)::text WHERE id = '6f1ce794-3466-4596-ad63-ee584a51a9ab';
  UPDATE client_contracts SET contract_template_id = '6f1ce794-3466-4596-ad63-ee584a51a9ab' WHERE id = (SELECT v FROM ctx WHERE k = 'c2')::uuid;

  -- c2 no portal do cliente
  INSERT INTO client_portal_documents (portal_user_id, organization_id, entity_id, document_type, document_id, is_visible)
  VALUES ('2ee50e89-8f6e-4018-8ab9-bf2cb70fc4cd', o, v_ent, 'contract', (SELECT v FROM ctx WHERE k = 'c2')::uuid, true);
END $fx$;

-- ─── verificações ─────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c record;
  o text := (SELECT v FROM ctx WHERE k = 'o'); ent text := (SELECT v FROM ctx WHERE k = 'ent');
  c2 text := (SELECT v FROM ctx WHERE k = 'c2'); c3 text := (SELECT v FROM ctx WHERE k = 'c3'); c6 text := (SELECT v FROM ctx WHERE k = 'c6');
  crm text := (SELECT v FROM ctx WHERE k = 'crm'); p2 text := (SELECT v FROM ctx WHERE k = 'p2');
  -- esperado por conta (perfis da Mudelar, 23/11): dono = Rita; âmbito admin/negócio = org_admin, super_admin; cancel = org_admin, super_admin;
  -- âmbito de client_contracts.edit nos contratos do CRM (_client_contracts_effective_edit_scope) = Rita (dona) e super_admin (ORG)
  v_dono boolean; v_amb boolean; v_cancel boolean; v_cc_crm boolean; v_envia boolean;
BEGIN
  FOR c IN SELECT * FROM contas ORDER BY ordem LOOP
    v_dono := c.ordem = 1;
    v_amb := c.ordem IN (1, 4, 5);
    v_cancel := c.ordem IN (4, 5);
    v_cc_crm := c.ordem IN (1, 5);
    v_envia := c.ordem IN (1, 2, 4, 5);   -- portal.manage ou client_contracts.send_signature na Mudelar

    -- C1 — anular
    PERFORM pg_temp.reg(c.conta, 'C1 cancel_and_replace_contract (contrato do CRM assinado)',
      CASE WHEN v_cancel AND v_cc_crm THEN 'passa' ELSE 'recusa:insufficient_permission' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.cancel_and_replace_contract(%L, %L, false)::text', crm, 'LC2311 motivo'),
        format('SELECT status = %L FROM client_contracts WHERE id = %L', 'cancelled', crm)));
    PERFORM pg_temp.reg(c.conta, 'C1 rpc_update_client_contract_status(cancelled) (contrato do CRM assinado)',
      CASE WHEN v_cancel AND v_cc_crm THEN 'passa' WHEN NOT v_cc_crm THEN 'recusa' ELSE 'recusa:client_contracts.cancel' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.rpc_update_client_contract_status(%L, %L)::text', crm, 'cancelled'),
        format('SELECT status = %L FROM client_contracts WHERE id = %L', 'cancelled', crm)));
    PERFORM pg_temp.reg(c.conta, 'C1 cancel_and_replace_contract (contrato do negócio Emylia assinado)',
      CASE WHEN v_cancel AND (c.ordem = 5 OR v_dono) THEN 'recusa:contract_in_negocio' ELSE 'recusa' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.cancel_and_replace_contract(%L, %L, false)::text', c3, 'LC2311 motivo'),
        format('SELECT status = %L FROM client_contracts WHERE id = %L', 'cancelled', c3)));
    PERFORM pg_temp.reg(c.conta, 'C1 rpc_update_client_contract_status(cancelled) (negócio Emylia assinado)',
      CASE WHEN v_cancel AND (c.ordem = 5 OR v_dono) THEN 'recusa:anula-se no Neg' ELSE 'recusa' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.rpc_update_client_contract_status(%L, %L)::text', c3, 'cancelled'),
        format('SELECT status = %L FROM client_contracts WHERE id = %L', 'cancelled', c3)));
    PERFORM pg_temp.reg(c.conta, 'C1 neg_anular_contrato (o caminho do Negócio, sem mudanças)',
      CASE WHEN v_cancel THEN 'passa' ELSE 'recusa:client_contracts.cancel' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.neg_anular_contrato(%L, %L, %L)::text', o, '23110000-0000-4000-8000-0000000000a3', 'LC2311 motivo'),
        format('SELECT status = %L FROM client_contracts WHERE id = %L', 'cancelled', c3)));

    -- A3 — pôr / tirar do portal
    PERFORM pg_temp.reg(c.conta, 'A3 INSERT client_portal_documents (contrato c6 da Rita)',
      CASE WHEN v_envia AND v_amb THEN 'passa' ELSE 'recusa' END,
      pg_temp.tentar(c.auth, NULL, format($q$WITH x AS (INSERT INTO client_portal_documents (portal_user_id, organization_id, entity_id, document_type, document_id, is_visible)
          VALUES ('2ee50e89-8f6e-4018-8ab9-bf2cb70fc4cd', %L, %L, 'contract', %L, true) RETURNING 1) SELECT count(*)::text FROM x$q$, o, ent, c6),
        format('SELECT EXISTS (SELECT 1 FROM client_portal_documents WHERE document_id = %L AND is_visible)', c6)));
    PERFORM pg_temp.reg(c.conta, 'A3 UPDATE client_portal_documents is_visible=false (contrato c2 da Rita)',
      CASE WHEN v_envia AND v_amb THEN 'passa' ELSE 'recusa' END,
      pg_temp.tentar(c.auth, NULL, format('WITH x AS (UPDATE client_portal_documents SET is_visible = false, revoked_at = now() WHERE document_id = %L RETURNING 1) SELECT count(*)::text FROM x', c2),
        format('SELECT NOT is_visible FROM client_portal_documents WHERE document_id = %L', c2)));
    -- o âmbito do servidor (fn_doc_no_ambito_acao) inclui o back-office do Negócio (Financeiro: negocios.registar_fatura, 20270110910000);
    -- o Financeiro fica de fora do portal pela permissão (sem portal.manage / send_signature), não pelo âmbito
    PERFORM pg_temp.reg(c.conta, 'A3 fn_portal_doc_no_ambito(contract c2) (a verificação da edge function)',
      CASE WHEN v_amb OR c.ordem = 3 THEN 'passa' ELSE 'recusa' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.fn_portal_doc_no_ambito(%L, %L)::text', 'contract', c2), NULL));
    IF p2 IS NOT NULL THEN
      PERFORM pg_temp.reg(c.conta, 'A3 republish_proposal_snapshot (proposta do negócio da Rita)',
        CASE WHEN v_amb AND c.ordem <> 3 THEN 'passa' WHEN c.ordem = 3 THEN 'recusa' ELSE 'recusa:fora do seu' END,
        pg_temp.tentar(c.auth, NULL, format('SELECT count(*)::text FROM public.republish_proposal_snapshot(%L, NULL)', p2), NULL));
    END IF;

    -- A4 — contra-assinatura pelo signatário da minuta
    PERFORM pg_temp.reg(c.conta, 'A4 rpc_contra_assinar_contrato(signatario_minuta) (contrato c2 da Rita)',
      CASE WHEN v_envia AND v_amb THEN 'passa' WHEN v_envia THEN 'recusa:fora do' ELSE 'recusa' END,
      pg_temp.tentar(c.auth, NULL, format('SELECT public.rpc_contra_assinar_contrato(%L, %L)::text', c2, 'signatario_minuta'),
        format('SELECT company_signature_date IS NOT NULL FROM client_contracts WHERE id = %L', c2)));
  END LOOP;
END $t$;

-- o resultado de fn_portal_doc_no_ambito tem de ser true/false (não erro): conferir o texto devolvido
UPDATE r SET resultado = 'FALHA', detalhe = 'devolveu ' || detalhe
WHERE caso LIKE 'A3 fn_portal_doc_no_ambito%' AND NOT (detalhe ~ '^PASSA\|(true|false)$');
UPDATE r SET obtido = CASE WHEN detalhe LIKE '%|true' THEN 'passa' ELSE 'recusa' END
WHERE caso LIKE 'A3 fn_portal_doc_no_ambito%' AND detalhe NOT LIKE 'devolveu%';
UPDATE r SET resultado = CASE WHEN obtido = esperado THEN 'OK' ELSE 'FALHA' END
WHERE caso LIKE 'A3 fn_portal_doc_no_ambito%' AND detalhe NOT LIKE 'devolveu%';

SELECT json_build_object(
  'falhas', (SELECT count(*) FROM r WHERE resultado = 'FALHA'),
  'ok', (SELECT count(*) FROM r WHERE resultado = 'OK'),
  'linhas', (SELECT json_agg(json_build_array(conta, caso, esperado, obtido, resultado, left(detalhe, 160)) ORDER BY n) FROM r));

ROLLBACK;
