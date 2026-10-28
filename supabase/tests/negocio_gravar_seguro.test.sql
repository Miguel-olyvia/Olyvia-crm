-- ============================================================
-- Testes: 20261231994000_negocio_gravar_seguro.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria
-- negócios próprios (prefixo "Teste 994000") na organização do primeiro
-- negócio com número, grava-os por neg_guardar_negocio como um utilizador
-- com pessoas.edit (role authenticated, auth.uid() pelas claims) e desfaz
-- tudo no fim.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com
-- 'FALHOU: …' e o ROLLBACK implícito da transação abortada desfaz tudo):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/negocio_gravar_seguro.test.sql
--
-- Cobre:
--   1. Contrato assinado no portal + JSON antigo (enviado, com assinatura
--      inventada) → fica signed, com a signature_date e o nome do portal
--   2. Quote aceite no portal + JSON enviado → fica aceite (accepted_at da
--      base) e a proposta fica accepted
--   3. As linhas do quote aceite mantêm os ids (o JSON com outras linhas
--      não as reescreve) e devolve-se um aviso
--   4. JSON "assinado" com prova falsa num contrato por assinar → não assina,
--      não escreve signature_*, devolve "A assinatura só se faz no portal
--      do cliente."; JSON "aceite" num orçamento enviado → não aceita, avisa
--   5. Negócio do CRM (orçamento fora da Emylia) → NE005 e o fluxo_emylia
--      não muda; docs_crm verdadeiro na leitura
--   6. Leitura: fn_neg_ler_contrato devolve o id e a assinatura do portal
--      (portal_sms); "rejeitado" lê-se "recusado"
--   7. Grants: anon sem EXECUTE nas neg_*; authenticated sem EXECUTE nas
--      fn_neg_* internas
-- (O histórico só a acrescentar NÃO está nesta migration: ver o relatório.)
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_base negocios;
  v_auth uuid;
  n_emy  uuid := '9940a000-0000-4000-8000-000000000001';  -- Emylia: vai ser aceite e assinado no portal
  n_fal  uuid := '9940a000-0000-4000-8000-000000000002';  -- Emylia: o JSON tenta assinar e aceitar
  n_crm  uuid := '9940a000-0000-4000-8000-000000000003';  -- CRM: tem um orçamento fora da Emylia
BEGIN
  SELECT * INTO v_base FROM negocios WHERE numero IS NOT NULL AND deleted_at IS NULL ORDER BY numero LIMIT 1;
  IF v_base.id IS NULL THEN RAISE EXCEPTION 'FALHOU: base sem negócio com número para as fixtures'; END IF;
  SELECT u.auth_user_id INTO v_auth FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador com pessoas.edit na organização %', v_base.organization_id; END IF;
  -- o orçamento do CRM cria-se com a sessão do comercial (fn_neg_validar_documento exige pessoas.edit)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
  VALUES (n_emy, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 994000 portal', true),
         (n_fal, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 994000 falso', true),
         (n_crm, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 994000 CRM', false);
  INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, estado, fluxo_emylia)
  VALUES (v_base.organization_id, v_base.root_organization_id, v_base.entity_id, n_crm,
          (SELECT id FROM anew_users WHERE auth_user_id = v_auth), 'Teste 994000 orçamento do CRM', 'rascunho', false);

  PERFORM set_config('teste.org', v_base.organization_id::text, true);
  PERFORM set_config('teste.auth', v_auth::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  -- o JSON de um negócio com uma versão enviada (duas linhas) e o contrato enviado
  PERFORM set_config('teste.json', jsonb_build_object(
    'negocio', jsonb_build_object('fase', 4, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
    'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 994000', 'tipo', 'a')),
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'modelo', 'wc', 'desconto', 0,
      'enviado_em', '2026-10-20T10:00:00Z', 'preco_final', 300, 'total_com_iva', 318, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Única', 'pct', 1, 'marco', 'adjudicacao')),
      'linhas', jsonb_build_array(
        jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha A', 'unidade', 'un', 'quantidade', 1, 'preco_un', 100, 'parte_iva', 'mao_obra',
          'custo', jsonb_build_object('custo_un', 50), 'zonas', jsonb_build_array(jsonb_build_object('zona', 'Geral', 'quantidade', 1))),
        jsonb_build_object('ordem', 1, 'tipo', 'livre', 'descricao', 'Linha B', 'unidade', 'un', 'quantidade', 2, 'preco_un', 100, 'parte_iva', 'mao_obra',
          'custo', jsonb_build_object('custo_un', 50))))),
    'contratos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'enviado', 'pedidos', '[]'::jsonb, 'clausulas', '[]'::jsonb))
  )::text, true);
END $fx$;

-- ─── 1.ª gravação dos dois negócios da Emylia (como o comercial) ───────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.neg_guardar_negocio(current_setting('teste.org')::uuid, '9940a000-0000-4000-8000-000000000001', current_setting('teste.json')::jsonb);
  PERFORM set_config('teste.r_emy1', r::text, true);
  r := public.neg_guardar_negocio(current_setting('teste.org')::uuid, '9940a000-0000-4000-8000-000000000002', current_setting('teste.json')::jsonb);
  PERFORM set_config('teste.r_fal1', r::text, true);
END $t$;
RESET ROLE;

DO $t$
DECLARE v_q uuid; v_c uuid; v_p uuid;
BEGIN
  SELECT id INTO v_q FROM quotes WHERE negocio_id = '9940a000-0000-4000-8000-000000000001' AND versao = 1;
  SELECT id INTO v_c FROM client_contracts WHERE negocio_id = '9940a000-0000-4000-8000-000000000001' AND versao = 1;
  SELECT id INTO v_p FROM proposals WHERE negocio_id = '9940a000-0000-4000-8000-000000000001';
  IF v_q IS NULL OR v_c IS NULL OR v_p IS NULL THEN RAISE EXCEPTION 'FALHOU: a 1.ª gravação não criou o orçamento, o contrato e a proposta'; END IF;
  IF (SELECT estado FROM quotes WHERE id = v_q) <> 'enviado' THEN RAISE EXCEPTION 'FALHOU: o orçamento devia estar enviado'; END IF;
  IF (SELECT status FROM client_contracts WHERE id = v_c) <> 'pending_signature' THEN RAISE EXCEPTION 'FALHOU: o contrato devia estar pending_signature'; END IF;
  IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> 2 THEN RAISE EXCEPTION 'FALHOU: o orçamento devia ter 2 linhas'; END IF;

  -- o portal (servidor, sem sessão): o cliente aceita a proposta e assina o contrato com o código por SMS
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE quotes SET estado = 'aceite', accepted_at = '2026-10-21T09:00:00Z' WHERE id = v_q;
  UPDATE proposals SET status = 'accepted', accepted_at = '2026-10-21T09:00:00Z' WHERE id = v_p;
  UPDATE client_contracts SET status = 'signed', signature_image = 'OTP_SMS_VERIFIED', signed_by_name = 'Cliente do Portal',
    signature_date = '2026-10-22T11:30:00Z', signature_phone_masked = '9•• ••• 123' WHERE id = v_c;

  PERFORM set_config('teste.q', v_q::text, true);
  PERFORM set_config('teste.c', v_c::text, true);
  PERFORM set_config('teste.p', v_p::text, true);
  PERFORM set_config('teste.linhas', (SELECT string_agg(id::text, ',' ORDER BY id) FROM quote_lines WHERE quote_id = v_q), true);
END $t$;

-- ─── 2.ª gravação com o JSON antigo (o ecrã ainda não releu) ───────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; j jsonb := current_setting('teste.json')::jsonb;
BEGIN
  -- o ecrã antigo: orçamento enviado com uma 3.ª linha e o contrato enviado com uma assinatura inventada
  j := jsonb_set(j, '{orcamentos,0,linhas}', (j #> '{orcamentos,0,linhas}') || jsonb_build_array(jsonb_build_object('ordem', 2, 'tipo', 'livre',
         'descricao', 'Linha C', 'unidade', 'un', 'quantidade', 1, 'preco_un', 50, 'parte_iva', 'mao_obra', 'custo', jsonb_build_object('custo_un', 20))));
  j := jsonb_set(j, '{contratos,0,assinatura}', jsonb_build_object('metodo', 'sms', 'nome', 'Outra Pessoa', 'identificador', 'X', 'assinado_em', '2026-10-25T00:00:00Z'));
  r := public.neg_guardar_negocio(current_setting('teste.org')::uuid, '9940a000-0000-4000-8000-000000000001', j);
  PERFORM set_config('teste.r_emy2', r::text, true);

  -- o negócio "falso": o JSON dá o orçamento como aceite e o contrato como assinado, com uma prova inventada
  j := current_setting('teste.json')::jsonb;
  j := jsonb_set(j, '{orcamentos,0,estado}', '"aceite"');
  j := jsonb_set(j, '{orcamentos,0,aceite_em}', '"2026-10-21T09:00:00Z"');
  j := jsonb_set(j, '{contratos,0,estado}', '"assinado"');
  j := jsonb_set(j, '{contratos,0,assinado_em}', '"2026-10-22T11:30:00Z"');
  j := jsonb_set(j, '{contratos,0,assinatura}', jsonb_build_object('metodo', 'digital', 'nome', 'Falso', 'identificador', 'CMD-FALSO', 'assinado_em', '2026-10-22T11:30:00Z'));
  r := public.neg_guardar_negocio(current_setting('teste.org')::uuid, '9940a000-0000-4000-8000-000000000002', j);
  PERFORM set_config('teste.r_fal2', r::text, true);

  -- o negócio do CRM: recusado com NE005
  BEGIN
    PERFORM public.neg_guardar_negocio(current_setting('teste.org')::uuid, '9940a000-0000-4000-8000-000000000003', current_setting('teste.json')::jsonb);
    PERFORM set_config('teste.crm', 'gravou', true);
  EXCEPTION WHEN SQLSTATE 'NE005' THEN
    PERFORM set_config('teste.crm', 'NE005: ' || SQLERRM, true);
  END;

  PERFORM set_config('teste.ler', public.neg_ler_negocios(current_setting('teste.org')::uuid)::text, true);
END $t$;
RESET ROLE;

-- ─── Verificações (como postgres) ───────────────────────────────────────────
DO $t$
DECLARE
  v_q uuid := current_setting('teste.q')::uuid; v_c uuid := current_setting('teste.c')::uuid; v_p uuid := current_setting('teste.p')::uuid;
  r jsonb := current_setting('teste.r_emy2')::jsonb; rf jsonb := current_setting('teste.r_fal2')::jsonb;
  ler jsonb := current_setting('teste.ler')::jsonb; x jsonb; c client_contracts; q quotes;
BEGIN
  -- 1. contrato assinado no portal + JSON antigo
  SELECT * INTO c FROM client_contracts WHERE id = v_c;
  IF c.status <> 'signed' THEN RAISE EXCEPTION 'FALHOU 1: o contrato assinado passou a %', c.status; END IF;
  IF c.signature_date IS DISTINCT FROM '2026-10-22T11:30:00Z'::timestamptz THEN RAISE EXCEPTION 'FALHOU 1: signature_date mudou para %', c.signature_date; END IF;
  IF c.signed_by_name IS DISTINCT FROM 'Cliente do Portal' OR c.signature_method IS NOT NULL OR c.signature_reference IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 1: a assinatura do portal foi reescrita (%, %, %)', c.signed_by_name, c.signature_method, c.signature_reference;
  END IF;

  -- 2. quote aceite + JSON enviado; a proposta fica accepted
  SELECT * INTO q FROM quotes WHERE id = v_q;
  IF q.estado <> 'aceite' THEN RAISE EXCEPTION 'FALHOU 2: o orçamento aceite passou a %', q.estado; END IF;
  IF q.accepted_at IS DISTINCT FROM '2026-10-21T09:00:00Z'::timestamptz THEN RAISE EXCEPTION 'FALHOU 2: accepted_at mudou para %', q.accepted_at; END IF;
  IF (SELECT status FROM proposals WHERE id = v_p) <> 'accepted' THEN RAISE EXCEPTION 'FALHOU 2: a proposta passou a %', (SELECT status FROM proposals WHERE id = v_p); END IF;

  -- 3. as linhas do quote aceite mantêm os ids; avisa-se que o JSON divergia
  IF (SELECT string_agg(id::text, ',' ORDER BY id) FROM quote_lines WHERE quote_id = v_q) IS DISTINCT FROM current_setting('teste.linhas') THEN
    RAISE EXCEPTION 'FALHOU 3: as linhas do orçamento aceite foram reescritas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(r->'avisos') a WHERE a LIKE 'Orçamento versão 1: já está aceite%') THEN
    RAISE EXCEPTION 'FALHOU 3: sem aviso das linhas divergentes (%)', r->'avisos';
  END IF;

  -- 4. JSON "assinado"/"aceite" com prova falsa: não assina, não aceita, avisa
  SELECT * INTO c FROM client_contracts WHERE negocio_id = '9940a000-0000-4000-8000-000000000002' AND versao = 1;
  IF c.status IN ('signed', 'assinado', 'active') THEN RAISE EXCEPTION 'FALHOU 4: o JSON assinou o contrato'; END IF;
  IF c.signature_date IS NOT NULL OR c.signature_method IS NOT NULL OR c.signature_reference IS NOT NULL OR c.signed_by_name IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 4: o JSON escreveu a assinatura (%, %, %)', c.signature_date, c.signature_method, c.signed_by_name;
  END IF;
  IF NOT (rf->'avisos') ? 'A assinatura só se faz no portal do cliente.' THEN RAISE EXCEPTION 'FALHOU 4: sem o aviso da assinatura (%)', rf->'avisos'; END IF;
  SELECT * INTO q FROM quotes WHERE negocio_id = '9940a000-0000-4000-8000-000000000002' AND versao = 1;
  IF q.estado <> 'enviado' OR q.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'FALHOU 4: o JSON aceitou o orçamento (%, %)', q.estado, q.accepted_at; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(rf->'avisos') a WHERE a LIKE 'Orçamento versão 1: a decisão do cliente só se regista no portal%') THEN
    RAISE EXCEPTION 'FALHOU 4: sem aviso do orçamento aceite pelo JSON (%)', rf->'avisos';
  END IF;
  IF (SELECT status FROM proposals WHERE negocio_id = '9940a000-0000-4000-8000-000000000002') NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'FALHOU 4: a proposta do JSON falso passou a decidida';
  END IF;

  -- 5. negócio do CRM: NE005 e o fluxo_emylia não muda; a leitura diz docs_crm
  IF current_setting('teste.crm') NOT LIKE 'NE005: Este negócio é do CRM%' THEN RAISE EXCEPTION 'FALHOU 5: o negócio do CRM deu %', current_setting('teste.crm'); END IF;
  IF (SELECT fluxo_emylia FROM negocios WHERE id = '9940a000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'FALHOU 5: o fluxo_emylia do negócio do CRM mudou'; END IF;
  SELECT n INTO x FROM jsonb_array_elements(ler) n WHERE n->'negocio'->>'id' = '9940a000-0000-4000-8000-000000000003';
  IF x IS NULL OR (x->'negocio'->>'docs_crm')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU 5: neg_ler_negocios não diz docs_crm no negócio do CRM'; END IF;
  SELECT n INTO x FROM jsonb_array_elements(ler) n WHERE n->'negocio'->>'id' = '9940a000-0000-4000-8000-000000000001';
  IF (x->'negocio'->>'docs_crm')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU 5: o negócio da Emylia aparece com docs_crm'; END IF;

  -- 6. leitura do contrato (id e assinatura do portal) e "rejeitado" → "recusado"
  x := x->'contratos'->0;
  IF x->>'id' IS DISTINCT FROM v_c::text OR x->>'estado' <> 'assinado' OR x->'assinatura'->>'metodo' IS DISTINCT FROM 'portal_sms'
     OR x->'assinatura'->>'nome' IS DISTINCT FROM 'Cliente do Portal' OR (x->'assinatura'->>'assinado_em')::timestamptz IS DISTINCT FROM '2026-10-22T11:30:00Z'::timestamptz THEN
    RAISE EXCEPTION 'FALHOU 6: fn_neg_ler_contrato devolveu %', x;
  END IF;
  UPDATE quotes SET estado = 'rejeitado' WHERE negocio_id = '9940a000-0000-4000-8000-000000000002' AND versao = 1;
  IF public.fn_neg_ler_orcamento((SELECT id FROM quotes WHERE negocio_id = '9940a000-0000-4000-8000-000000000002' AND versao = 1))->>'estado' <> 'recusado' THEN
    RAISE EXCEPTION 'FALHOU 6: "rejeitado" não se lê "recusado"';
  END IF;

  -- 7. grants
  IF has_function_privilege('anon', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_ler_negocios(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU 7: anon pode executar as neg_*'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.neg_ler_negocios(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU 7: authenticated perdeu as neg_*'; END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_docs_crm(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_ler_contrato(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU 7: as fn_neg_* internas ficaram abertas';
  END IF;
END $t$;

SELECT 'OK: negocio_gravar_seguro (7 grupos de casos)' AS resultado,
       current_setting('teste.r_emy2')::jsonb->'avisos' AS avisos_json_antigo,
       current_setting('teste.r_fal2')::jsonb->'avisos' AS avisos_json_falso,
       current_setting('teste.crm') AS negocio_crm;

ROLLBACK;
