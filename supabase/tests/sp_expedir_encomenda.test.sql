-- ============================================================
-- Testes: 20261231850000_sp_expedir_encomenda.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria
-- fixtures próprias (fornecedores, contas do portal, utilizadores auth, POs,
-- publicações) na 1.ª organização existente e desfaz tudo no fim.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com
-- 'FALHOU: …' e o ROLLBACK implícito da transação abortada desfaz tudo):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/sp_expedir_encomenda.test.sql
--   (ou copiar o conteúdo para o SQL editor da base RH)
--
-- Cobre:
--   1. PO não publicada → not_found
--   2. PO de outro fornecedor → not_found (e sp_order_shipments/anexo idem)
--   3. Publicação não confirmada → not_confirmed
--   4. Revisão antiga → stale_revision
--   5. Mais do que falta → validation
--   6. Expedição válida: guia aberta, created_by NULL, origem no history,
--      linha na unidade da PO, quantidade 0 ignorada
--   7. Mesmo request_id → already_shipped
--   8. Nº de guia repetido (maiúsc./espaços) → duplicate_note
--   9. Segunda guia só até ao que falta; sp_order_shipments soma tudo
--  10. Anexo: mime/caminho/nome errados → validation; objeto inexistente →
--      validation; (se o storage deixar inserir o objeto) anexo válido,
--      substituição = novo elemento, o último conta
--  11. Grants: anon sem EXECUTE; fn_sp_po_shipped fechada
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org     uuid := (SELECT id FROM public.anew_organizations ORDER BY created_at NULLS LAST, id LIMIT 1);
  v_creator uuid := (SELECT id FROM public.anew_users ORDER BY created_at NULLS LAST, id LIMIT 1);
  -- ids fixos (prefixo 5e5e…) para ler nos testes por current_setting
  a_auth uuid := '5e5e0000-0000-4000-8000-00000000a001';
  b_auth uuid := '5e5e0000-0000-4000-8000-00000000b001';
  s_a    uuid := '5e5e0000-0000-4000-8000-00000000a002';
  s_b    uuid := '5e5e0000-0000-4000-8000-00000000b002';
  acc_a  uuid := '5e5e0000-0000-4000-8000-00000000a003';
  acc_b  uuid := '5e5e0000-0000-4000-8000-00000000b003';
  l_a    uuid := '5e5e0000-0000-4000-8000-00000000a004';
  l_b    uuid := '5e5e0000-0000-4000-8000-00000000b004';
  u_a    uuid := '5e5e0000-0000-4000-8000-00000000a005';
  u_b    uuid := '5e5e0000-0000-4000-8000-00000000b005';
  prod   uuid := '5e5e0000-0000-4000-8000-000000000006';
  po1    uuid := '5e5e0000-0000-4000-8000-000000000101';  -- A, publicada e confirmada
  po2    uuid := '5e5e0000-0000-4000-8000-000000000102';  -- A, não publicada
  po3    uuid := '5e5e0000-0000-4000-8000-000000000103';  -- A, publicada 'sent'
  pob    uuid := '5e5e0000-0000-4000-8000-000000000104';  -- B, publicada e confirmada
  i1     uuid := '5e5e0000-0000-4000-8000-000000000201';
  i2     uuid := '5e5e0000-0000-4000-8000-000000000202';
  i3     uuid := '5e5e0000-0000-4000-8000-000000000203';
  i2b    uuid := '5e5e0000-0000-4000-8000-000000000204';
  ib     uuid := '5e5e0000-0000-4000-8000-000000000205';
BEGIN
  IF v_org IS NULL OR v_creator IS NULL THEN
    RAISE EXCEPTION 'FALHOU: base sem organização/utilizador para as fixtures';
  END IF;

  INSERT INTO auth.users (id, instance_id, email, aud, role)
  VALUES (a_auth, '00000000-0000-0000-0000-000000000000', 'sp-ship-a@example.test', 'authenticated', 'authenticated'),
         (b_auth, '00000000-0000-0000-0000-000000000000', 'sp-ship-b@example.test', 'authenticated', 'authenticated');

  INSERT INTO public.suppliers (id, name, organization_id, created_by)
  VALUES (s_a, 'Fornecedor Teste Expedir A', v_org, v_creator),
         (s_b, 'Fornecedor Teste Expedir B', v_org, v_creator);

  INSERT INTO public.supplier_accounts (id, nif_key, display_name)
  VALUES (acc_a, 'ZZSHIPTEST01', 'Conta Teste A'), (acc_b, 'ZZSHIPTEST02', 'Conta Teste B');

  INSERT INTO public.supplier_account_links (id, supplier_account_id, organization_id, supplier_id, status)
  VALUES (l_a, acc_a, v_org, s_a, 'active'), (l_b, acc_b, v_org, s_b, 'active');

  INSERT INTO public.supplier_portal_users (id, supplier_account_id, auth_user_id, email, name, role, status, first_login)
  VALUES (u_a, acc_a, a_auth, 'sp-ship-a@example.test', 'Ana Expedição', 'owner', 'active', false),
         (u_b, acc_b, b_auth, 'sp-ship-b@example.test', NULL, 'owner', 'active', false);

  INSERT INTO public.supplier_portal_user_access (portal_user_id, link_id, organization_id)
  VALUES (u_a, l_a, v_org), (u_b, l_b, v_org);

  INSERT INTO public.products (id, sku, name, organization_id, created_by)
  VALUES (prod, 'ZZ-SHIP-TEST-1', 'Produto Teste Expedir', v_org, v_creator);

  INSERT INTO public.purchase_orders (id, order_number, order_date, status, supplier_id, organization_id, created_by)
  VALUES (po1, 'ZZ-SHIP-PO1', current_date - 5, 'ordered', s_a, v_org, v_creator),
         (po2, 'ZZ-SHIP-PO2', current_date - 5, 'ordered', s_a, v_org, v_creator),
         (po3, 'ZZ-SHIP-PO3', current_date - 5, 'ordered', s_a, v_org, v_creator),
         (pob, 'ZZ-SHIP-POB', current_date - 5, 'ordered', s_b, v_org, v_creator);

  INSERT INTO public.purchase_order_items (id, purchase_order_id, product_id, item_type, description, quantity, unit_price, total_price)
  VALUES (i1,  po1, prod, 'product', 'Linha 1 teste', 10, 1, 10),
         (i2,  po1, prod, 'product', 'Linha 2 teste', 5,  1, 5),
         (i3,  po2, prod, 'product', 'Linha PO2',     3,  1, 3),
         (i2b, po3, prod, 'product', 'Linha PO3',     3,  1, 3),
         (ib,  pob, prod, 'product', 'Linha POB',     3,  1, 3);

  INSERT INTO public.supplier_po_publications (purchase_order_id, organization_id, link_id, revision, status, confirmed_at, confirmed_by)
  VALUES (po1, v_org, l_a, 1, 'confirmed', now(), u_a),
         (po3, v_org, l_a, 1, 'sent', NULL, NULL),
         (pob, v_org, l_b, 1, 'confirmed', now(), u_b);

  PERFORM set_config('t.org', v_org::text, true);
  PERFORM set_config('t.a_auth', a_auth::text, true);
  PERFORM set_config('t.b_auth', b_auth::text, true);
END
$fx$;

-- ─── Como fornecedor A ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.a_auth'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $t$
DECLARE
  po1 uuid := '5e5e0000-0000-4000-8000-000000000101';
  po2 uuid := '5e5e0000-0000-4000-8000-000000000102';
  po3 uuid := '5e5e0000-0000-4000-8000-000000000103';
  pob uuid := '5e5e0000-0000-4000-8000-000000000104';
  i1  uuid := '5e5e0000-0000-4000-8000-000000000201';
  i2  uuid := '5e5e0000-0000-4000-8000-000000000202';
  i3  uuid := '5e5e0000-0000-4000-8000-000000000203';
  ib  uuid := '5e5e0000-0000-4000-8000-000000000205';
  r1  uuid := '5e5e0000-0000-4000-8000-000000000301';
  r2  uuid := '5e5e0000-0000-4000-8000-000000000302';
  r3  uuid := '5e5e0000-0000-4000-8000-000000000303';
  r9  uuid := '5e5e0000-0000-4000-8000-000000000309';
  v_hint text;
  v_res  jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM current_setting('t.a_auth')::uuid THEN
    RAISE EXCEPTION 'FALHOU: auth.uid() não é o do fornecedor A';
  END IF;

  -- 1. PO não publicada → not_found
  BEGIN
    PERFORM public.sp_ship_order(r9, po2, 1, 'X-1', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i3, 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 1: PO não publicada devia dar not_found';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'FALHOU 1: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 2. PO de outro fornecedor → not_found
  BEGIN
    PERFORM public.sp_ship_order(r9, pob, 1, 'X-2', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', ib, 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 2: PO de outro fornecedor devia dar not_found';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'FALHOU 2: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.sp_order_shipments(pob);
    RAISE EXCEPTION 'FALHOU 2b: sp_order_shipments de outro fornecedor devia dar not_found';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'FALHOU 2b: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 3. Publicação não confirmada → not_confirmed
  BEGIN
    PERFORM public.sp_ship_order(r9, po3, 1, 'X-3', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', '5e5e0000-0000-4000-8000-000000000204', 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 3: publicação não confirmada devia dar not_confirmed';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_confirmed' THEN RAISE EXCEPTION 'FALHOU 3: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 4. Revisão antiga → stale_revision
  BEGIN
    PERFORM public.sp_ship_order(r9, po1, 2, 'X-4', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 4: revisão errada devia dar stale_revision';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'stale_revision' THEN RAISE EXCEPTION 'FALHOU 4: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 5. Mais do que falta (10 encomendadas) → validation
  BEGIN
    PERFORM public.sp_ship_order(r9, po1, 1, 'X-5', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 11)));
    RAISE EXCEPTION 'FALHOU 5: mais do que falta devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 5: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 5b. Linha de outra PO → validation; data no futuro distante → validation
  BEGIN
    PERFORM public.sp_ship_order(r9, po1, 1, 'X-5b', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i3, 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 5b: linha de outra PO devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 5b: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.sp_ship_order(r9, po1, 1, 'X-5c', current_date + 61,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 5c: data a +61 dias devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 5c: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 6. Expedição válida (linha 2 com 0 = ignorada)
  v_res := public.sp_ship_order(r1, po1, 1, 'GR-0001', current_date,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 4),
                      jsonb_build_object('purchase_order_item_id', i2, 'quantity', 0)),
    'Transportes Teste', 'Entregar no cais 2');
  IF (v_res ->> 'already_shipped')::boolean IS DISTINCT FROM false
     OR v_res ->> 'delivery_note_id' IS DISTINCT FROM r1::text
     OR jsonb_array_length(v_res -> 'lines') <> 1
     OR (v_res -> 'lines' -> 0 ->> 'to_ship')::numeric <> 6 THEN
    RAISE EXCEPTION 'FALHOU 6: resultado inesperado %', v_res;
  END IF;

  -- 7. Mesmo request_id → already_shipped (mesmo com outros dados)
  v_res := public.sp_ship_order(r1, po1, 1, 'OUTRO-NUM', current_date,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 1)));
  IF (v_res ->> 'already_shipped')::boolean IS DISTINCT FROM true OR v_res ->> 'note_number' <> 'GR-0001'
     OR (v_res -> 'lines' -> 0 ->> 'quantity')::numeric <> 4 THEN
    RAISE EXCEPTION 'FALHOU 7: repetição devia devolver already_shipped %', v_res;
  END IF;

  -- 8. Nº repetido (maiúsculas/espaços diferentes) → duplicate_note
  BEGIN
    PERFORM public.sp_ship_order(r2, po1, 1, '  gr-0001 ', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 8: nº repetido devia dar duplicate_note';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'duplicate_note' THEN RAISE EXCEPTION 'FALHOU 8: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 9. Só faltam 6 na linha 1: 7 falha, 6 passa
  BEGIN
    PERFORM public.sp_ship_order(r3, po1, 1, 'GR-0002', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 7)));
    RAISE EXCEPTION 'FALHOU 9: 7 com 6 em falta devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 9: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  v_res := public.sp_ship_order(r3, po1, 1, 'GR-0002', current_date,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id', i1, 'quantity', 6),
                      jsonb_build_object('purchase_order_item_id', i2, 'quantity', 2)));
  IF (v_res ->> 'already_shipped')::boolean IS DISTINCT FROM false OR jsonb_array_length(v_res -> 'lines') <> 2 THEN
    RAISE EXCEPTION 'FALHOU 9b: %', v_res;
  END IF;

  v_res := public.sp_order_shipments(po1);
  IF jsonb_array_length(v_res -> 'shipments') <> 2
     OR (SELECT (l ->> 'shipped')::numeric FROM jsonb_array_elements(v_res -> 'lines') l WHERE l ->> 'id' = i1::text) IS DISTINCT FROM 10
     OR (SELECT (l ->> 'to_ship')::numeric FROM jsonb_array_elements(v_res -> 'lines') l WHERE l ->> 'id' = i1::text) IS DISTINCT FROM 0
     OR (SELECT (l ->> 'to_ship')::numeric FROM jsonb_array_elements(v_res -> 'lines') l WHERE l ->> 'id' = i2::text) IS DISTINCT FROM 3
     OR (SELECT s ->> 'carrier' FROM jsonb_array_elements(v_res -> 'shipments') s WHERE s ->> 'id' = r1::text) IS DISTINCT FROM 'Transportes Teste'
     OR (SELECT (s ->> 'has_file')::boolean FROM jsonb_array_elements(v_res -> 'shipments') s WHERE s ->> 'id' = r1::text) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 9c: sp_order_shipments inesperado %', v_res;
  END IF;

  -- 10. Anexo — erros
  BEGIN  -- mime errado
    PERFORM public.sp_attach_delivery_note_file(r1,
      current_setting('t.org') || '/supplier-delivery-notes/' || r1 || '/f1.txt', 'guia.txt', 'text/plain', 100, true);
    RAISE EXCEPTION 'FALHOU 10a: mime text/plain devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 10a: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN  -- caminho de outra guia
    PERFORM public.sp_attach_delivery_note_file(r1,
      current_setting('t.org') || '/supplier-delivery-notes/' || r3 || '/f1.pdf', 'guia.pdf', 'application/pdf', 100, true);
    RAISE EXCEPTION 'FALHOU 10b: caminho de outra guia devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 10b: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN  -- traversal
    PERFORM public.sp_attach_delivery_note_file(r1,
      current_setting('t.org') || '/supplier-delivery-notes/' || r1 || '/../x.pdf', 'guia.pdf', 'application/pdf', 100, true);
    RAISE EXCEPTION 'FALHOU 10c: caminho com .. devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 10c: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN  -- caminho noutra pasta da organização
    PERFORM public.sp_attach_delivery_note_file(r1,
      current_setting('t.org') || '/contract/' || r1 || '/f1.pdf', 'guia.pdf', 'application/pdf', 100, true);
    RAISE EXCEPTION 'FALHOU 10d: pasta errada devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 10d: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN  -- > 10 MB
    PERFORM public.sp_attach_delivery_note_file(r1,
      current_setting('t.org') || '/supplier-delivery-notes/' || r1 || '/f1.pdf', 'guia.pdf', 'application/pdf', 10485761, true);
    RAISE EXCEPTION 'FALHOU 10e: > 10 MB devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 10e: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN  -- objeto ainda não promovido (não dry-run)
    PERFORM public.sp_attach_delivery_note_file(r1,
      current_setting('t.org') || '/supplier-delivery-notes/' || r1 || '/naoexiste.pdf', 'guia.pdf', 'application/pdf', 100, false);
    RAISE EXCEPTION 'FALHOU 10f: objeto inexistente devia dar erro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'validation' THEN RAISE EXCEPTION 'FALHOU 10f: hint % (%)', v_hint, SQLERRM; END IF;
  END;

  -- 10g. dry-run válido
  v_res := public.sp_attach_delivery_note_file(r1,
    current_setting('t.org') || '/supplier-delivery-notes/' || r1 || '/f1.pdf', 'Guia 0001.pdf', NULL, NULL, true);
  IF (v_res ->> 'ok')::boolean IS DISTINCT FROM true OR (v_res ->> 'dry_run')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 10g: dry-run válido %', v_res;
  END IF;
END
$t$;

-- ─── Como fornecedor B: não vê as guias de A ────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.b_auth'), 'role', 'authenticated')::text, true);

DO $t$
DECLARE
  v_hint text;
BEGIN
  BEGIN
    PERFORM public.sp_order_shipments('5e5e0000-0000-4000-8000-000000000101');
    RAISE EXCEPTION 'FALHOU 2c: B não pode ver as expedições da PO de A';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'FALHOU 2c: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.sp_attach_delivery_note_file('5e5e0000-0000-4000-8000-000000000301',
      current_setting('t.org') || '/supplier-delivery-notes/5e5e0000-0000-4000-8000-000000000301/f1.pdf',
      'guia.pdf', 'application/pdf', 100, true);
    RAISE EXCEPTION 'FALHOU 2d: B não pode anexar à guia de A';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'FALHOU 2d: hint % (%)', v_hint, SQLERRM; END IF;
  END;
  -- Mesmo request_id de A numa PO de B → not_found (não revela a guia de A)
  BEGIN
    PERFORM public.sp_ship_order('5e5e0000-0000-4000-8000-000000000301', '5e5e0000-0000-4000-8000-000000000104', 1,
      'B-1', current_date,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id', '5e5e0000-0000-4000-8000-000000000205', 'quantity', 1)));
    RAISE EXCEPTION 'FALHOU 2e: request_id alheio devia dar not_found';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'FALHOU 2e: hint % (%)', v_hint, SQLERRM; END IF;
  END;
END
$t$;

-- ─── Como postgres: o que ficou gravado ──────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $t$
DECLARE
  r1 uuid := '5e5e0000-0000-4000-8000-000000000301';
  n  public.supplier_delivery_notes;
BEGIN
  SELECT * INTO n FROM public.supplier_delivery_notes WHERE id = r1;
  IF n.id IS NULL OR n.status <> 'open' OR n.created_by IS NOT NULL OR n.note_number <> 'GR-0001'
     OR n.document_date <> current_date OR n.notes <> 'Entregar no cais 2'
     OR n.supplier_id <> '5e5e0000-0000-4000-8000-00000000a002'
     OR NOT (n.history @> jsonb_build_array(jsonb_build_object(
               'action', 'shipped', 'origin', 'supplier_portal', 'by_name', 'Ana Expedição',
               'carrier', 'Transportes Teste', 'purchase_order_id', '5e5e0000-0000-4000-8000-000000000101',
               'revision', 1, 'by_portal_user', '5e5e0000-0000-4000-8000-00000000a005'))) THEN
    RAISE EXCEPTION 'FALHOU 6b: guia gravada inesperada %', to_jsonb(n);
  END IF;
  IF (SELECT count(*) FROM public.supplier_delivery_note_orders
      WHERE delivery_note_id = r1 AND purchase_order_id = '5e5e0000-0000-4000-8000-000000000101') <> 1 THEN
    RAISE EXCEPTION 'FALHOU 6c: falta a ligação guia ↔ PO';
  END IF;
  IF (SELECT count(*) FROM public.supplier_delivery_note_lines WHERE delivery_note_id = r1) <> 1
     OR (SELECT quantity FROM public.supplier_delivery_note_lines WHERE delivery_note_id = r1) <> 4
     OR (SELECT units_per_uom FROM public.supplier_delivery_note_lines WHERE delivery_note_id = r1) <> 1
     OR (SELECT product_id FROM public.supplier_delivery_note_lines WHERE delivery_note_id = r1) <> '5e5e0000-0000-4000-8000-000000000006' THEN
    RAISE EXCEPTION 'FALHOU 6d: linhas da guia inesperadas';
  END IF;
  -- Nenhuma guia nas tentativas falhadas
  IF EXISTS (SELECT 1 FROM public.supplier_delivery_notes
             WHERE id IN ('5e5e0000-0000-4000-8000-000000000302', '5e5e0000-0000-4000-8000-000000000309')) THEN
    RAISE EXCEPTION 'FALHOU: ficou guia de uma tentativa falhada';
  END IF;

  -- 11. Grants
  IF has_function_privilege('anon', 'public.sp_ship_order(uuid, uuid, integer, text, date, jsonb, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sp_order_shipments(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sp_attach_delivery_note_file(uuid, text, text, text, bigint, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_sp_po_shipped(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU 11: grants errados';
  END IF;
END
$t$;

-- ─── 10h. Anexo válido (precisa de inserir o objeto em storage.objects) ─────
-- Se o storage não deixar inserir diretamente, o teste fica marcado como
-- 'saltado' em t.attach (não falha).
DO $t$
DECLARE
  v_path1 text := current_setting('t.org') || '/supplier-delivery-notes/5e5e0000-0000-4000-8000-000000000301/a1.pdf';
  v_path2 text := current_setting('t.org') || '/supplier-delivery-notes/5e5e0000-0000-4000-8000-000000000301/a2.png';
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('documents', v_path1, jsonb_build_object('size', 1234, 'mimetype', 'application/pdf')),
           ('documents', v_path2, jsonb_build_object('size', 2048, 'mimetype', 'image/png'));
    PERFORM set_config('t.attach', 'pronto', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('t.attach', 'saltado: ' || SQLERRM, true);
  END;
END
$t$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.a_auth'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $t$
DECLARE
  r1 uuid := '5e5e0000-0000-4000-8000-000000000301';
  v_path1 text := current_setting('t.org') || '/supplier-delivery-notes/5e5e0000-0000-4000-8000-000000000301/a1.pdf';
  v_path2 text := current_setting('t.org') || '/supplier-delivery-notes/5e5e0000-0000-4000-8000-000000000301/a2.png';
  v_res jsonb;
BEGIN
  IF current_setting('t.attach') <> 'pronto' THEN
    RAISE NOTICE '10h %', current_setting('t.attach');
    RETURN;
  END IF;
  -- tamanho declarado errado (999): conta o do objeto (1234)
  v_res := public.sp_attach_delivery_note_file(r1, v_path1, 'Guia 0001.pdf', 'application/pdf', 999, false);
  IF (v_res ->> 'replaced')::boolean OR (v_res -> 'file' ->> 'size')::bigint <> 1234 THEN
    RAISE EXCEPTION 'FALHOU 10h: 1.º anexo %', v_res;
  END IF;
  v_res := public.sp_attach_delivery_note_file(r1, v_path1, 'Guia 0001.pdf', 'application/pdf', 1234, false);
  IF (v_res ->> 'already_attached')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 10i: repetição do mesmo anexo %', v_res;
  END IF;
  v_res := public.sp_attach_delivery_note_file(r1, v_path2, 'foto guia.png', 'image/png', 2048, false);
  IF (v_res ->> 'replaced')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 10j: substituição %', v_res;
  END IF;
  v_res := public.sp_order_shipments('5e5e0000-0000-4000-8000-000000000101');
  IF (SELECT s -> 'file' ->> 'path' FROM jsonb_array_elements(v_res -> 'shipments') s WHERE s ->> 'id' = r1::text) IS DISTINCT FROM v_path2
     OR (SELECT (s ->> 'has_file')::boolean FROM jsonb_array_elements(v_res -> 'shipments') s WHERE s ->> 'id' = r1::text) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU 10k: o último anexo devia contar %', v_res;
  END IF;
  PERFORM set_config('t.attach', 'ok', true);
END
$t$;

RESET ROLE;

SELECT 'sp_expedir_encomenda: todos os testes passaram' AS resultado,
       current_setting('t.attach') AS anexo_valido;

ROLLBACK;
