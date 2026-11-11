-- ============================================================
-- Testes: lote «buracos do reteste do inventário» (base RH)
--   20270114900000_inventario_apagar_stock_so_a_zero             (F12)
--   20270114910000_inventario_movimento_repoe_linha_apagada      (F11)
--   20270114920000_compras_apagar_po_so_sem_rececao              (O11)
--   20270114930000_compras_criar_po_estado_inicial               (F5, lista branca)
--   20270114940000_compras_importar_po_estado_inicial            (F5, lista branca)
--   20270114950000_compras_editar_po_estado_permitido            (revisão de segurança A)
--   20270114960000_rececao_linhas_exige_receiving_receive        (F10)
--   20270114970000_rececao_po_exige_receiving_receive            (F10, ramo só serviços)
--   20270114980000_purchase_orders_estado_conhecido              (CHECK do estado)
--   20270114990000_stocks_sem_delete_direto                      (D1)
--   20270115000000_purchase_orders_sem_delete_direto             (D1)
-- ============================================================
-- ORDEM OBRIGATÓRIA (regra do CLAUDE.md: nunca deixar o remoto num estado defeituoso para mostrar o vermelho):
--   1. ANTES do db push, contra o remoto ainda por corrigir → VERMELHO esperado: o resultado começa por 'FALHOU:' e lista os
--      casos «passou» / «ficou apagada» (o ROLLBACK final desfaz tudo).
--   2. db push das 11 migrations.
--   3. Correr outra vez → VERDE ('OK: …'). Não se reverte nada para voltar a mostrar o vermelho.
--   Correr também inventario_guarda_quantidade_e_apagar.test.sql depois (deve continuar verde).
--
-- Correr (a partir do worktree rh-pessoas, ligado a uetjghdkwbywbftedtth):
--   supabase db query --linked -o csv -f supabase/tests/inventario_reteste_buracos.test.sql
--
-- Higiene: tudo dentro de BEGIN … ROLLBACK, sem DDL. NENHUM RAISE por apanhar: cada bloco apanha os seus erros, acumula-os em
-- teste.falhas e o resultado sai num SELECT final, seguido do ROLLBACK. Se as fixtures falharem, os blocos seguintes não
-- correm (teste.ok). Cada recusa esperada corre num sub-bloco que apanha o SQLSTATE certo e EXIGE o fragmento da mensagem
-- nova (uma recusa de outra origem conta como falha). [suposto, como no teste de hoje] um erro apanhado por EXCEPTION em
-- plpgsql não chega ao registo do servidor.
-- O DELETE físico direto com a política USING (false) NÃO dá erro: apaga 0 linhas. Prova-se com GET DIAGNOSTICS = 0, como
-- authenticated, numa linha que existe e é visível ao utilizador (e confirma-se depois, como postgres, que continua lá).
--
-- Fixtures, como postgres, SÓ na nike (b6ffce4f-f630-4933-833a-008649757a33, confirmada no início). Linhas «ZZ-TESTE-RETESTE».
-- Utilizador: o membro ativo do papel 'teste_inventario' da nike (não system admin; o papel está a zero permissões e
-- recebe-as só nesta transação, por fases):
--   fase 1 — inventário, armazéns e encomendas (ver, criar, editar, apagar, importar, receber) + inventory.edit + view_cost,
--            SEM purchase_orders.approve e SEM receiving.receive;
--   fase 2 — + purchase_orders.approve + receiving.receive.
--
-- Casos:
--   H  caminhos felizes: entrada, ajuste +2/−1, transferência, INSERT a 0, apagar/restaurar armazém, apagar/restaurar PO
--      sem receção, apagar linha de stock a 0, criar PO pendente, editar PO para cancelada
--   F12 apagar linha com 3 unidades → recusado «ainda tem»
--   F11 linha apagada a 0 + entrada de 2 → linha reposta (deleted_at NULL) com 2, e o saldo bate com os movimentos
--   O11 apagar PO com received_quantity > 0 → recusado «mercadoria recebida»
--   F5  criar 'ordered' / 'Ordered' sem approve → recusado; criar 'received' / 'foo' → recusado; importar 'ordered' sem
--       approve e 'received' → recusado (com o número da encomenda); com approve: 'ordered' e 'Ordered' passam e gravam
--       'ordered'; importar 'ordered' passa
--   A   editar PO para 'received' → recusado; para 'cancelled' → passa
--   F10 sem receiving.receive: receber por linhas, pré-visualizar e receber a PO só de serviços → recusado; com as três passa
--   D1  DELETE direto em stocks e purchase_orders → 0 linhas
--   CK  (como postgres) UPDATE para um estado fora da lista → recusado pelo CHECK; catálogo: políticas USING (false) e CHECK
--       validado
--   S   saldos de cada linha tocada = soma dos movimentos = esperado; estados finais das POs
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true),
       set_config('teste.claims', '{"role":"authenticated"}', true);

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_rol uuid; v_auth uuid; v_act uuid; v_p uuid; v_is uuid; v_sup uuid; v_svc uuid; f text := '';
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = v_org AND name = 'nike') THEN
      RAISE EXCEPTION 'a organização nike não está nesta base';
    END IF;

    SELECT r.id INTO v_rol FROM anew_roles r
    WHERE r.organization_id = v_org AND r.code = 'teste_inventario' AND r.is_system IS NOT TRUE;
    IF v_rol IS NULL THEN RAISE EXCEPTION 'sem o papel teste_inventario na nike'; END IF;

    SELECT u.auth_user_id, u.id INTO v_auth, v_act
    FROM anew_memberships am JOIN anew_users u ON u.id = am.user_id
    WHERE am.role_id = v_rol AND am.organization_id = v_org AND am.status = 'active' AND am.role_is_client IS NOT TRUE
      AND u.auth_user_id IS NOT NULL AND NOT public.is_system_admin_user(u.auth_user_id)
    ORDER BY am.created_at, am.id LIMIT 1;
    IF v_auth IS NULL THEN RAISE EXCEPTION 'sem membro ativo (não system admin) do papel teste_inventario'; END IF;

    -- produto da nike com um item_suppliers ativo (rpc_register_stock_entry e a receção precisam dele)
    SELECT i.product_id, i.id, i.supplier_id INTO v_p, v_is, v_sup
    FROM item_suppliers i JOIN products p ON p.id = i.product_id
    WHERE i.organization_id = v_org AND i.item_type = 'product' AND i.is_active AND i.deleted_at IS NULL
      AND p.organization_id = v_org AND NOT p.is_deleted AND p.deleted_at IS NULL
    ORDER BY i.created_at, i.id LIMIT 1;
    IF v_p IS NULL THEN RAISE EXCEPTION 'sem produto da nike com fornecedor ativo'; END IF;

    SELECT s.id INTO v_svc FROM services s WHERE s.organization_id = v_org ORDER BY s.created_at, s.id LIMIT 1;
    IF v_svc IS NULL THEN RAISE EXCEPTION 'sem serviço da nike (para a PO só de serviços)'; END IF;

    -- fase 1: sem approve e sem receiving.receive
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_rol, c, NULL::uuid
    FROM unnest(ARRAY['inventory.view', 'inventory.edit', 'inventory.create', 'inventory.delete',
                      'warehouses.view', 'warehouses.edit', 'warehouses.delete',
                      'products.view_cost',
                      'purchase_orders.view', 'purchase_orders.edit', 'purchase_orders.create',
                      'purchase_orders.delete', 'purchase_orders.import', 'purchase_orders.receive']) c
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', '', true);

    -- as recusas de approve / receiving.receive só valem se o utilizador não as tiver por outra associação
    IF public.has_anew_permission_for_org(v_auth, 'purchase_orders.approve', v_org)
       OR public.has_anew_permission_for_org(v_auth, 'receiving.receive', v_org) THEN
      f := f || 'FIXTURE o utilizador já tem approve ou receiving.receive por outra via (as recusas não valem); ';
    END IF;

    INSERT INTO warehouses (id, name, code, is_active, created_by, organization_id) VALUES
      ('2027c910-0000-4000-8000-0000000000a1', 'ZZ-TESTE-RETESTE W1', 'ZZTRET1', true, v_act, v_org),
      ('2027c910-0000-4000-8000-0000000000a2', 'ZZ-TESTE-RETESTE W2', 'ZZTRET2', true, v_act, v_org),
      ('2027c910-0000-4000-8000-0000000000a3', 'ZZ-TESTE-RETESTE W3', 'ZZTRET3', true, v_act, v_org),
      ('2027c910-0000-4000-8000-0000000000a5', 'ZZ-TESTE-RETESTE W5', 'ZZTRET5', true, v_act, v_org),
      ('2027c910-0000-4000-8000-0000000000a8', 'ZZ-TESTE-RETESTE W8', 'ZZTRET8', true, v_act, v_org);

    INSERT INTO purchase_orders (id, order_number, order_date, status, supplier_id, created_by, organization_id) VALUES
      ('2027c910-0000-4000-8000-0000000000c1', 'ZZ-TESTE-RETESTE-1', current_date, 'pending',  NULL,  v_act, v_org),  -- apagar/restaurar
      ('2027c910-0000-4000-8000-0000000000c2', 'ZZ-TESTE-RETESTE-2', current_date, 'partially_received', v_sup, v_act, v_org),  -- O11
      ('2027c910-0000-4000-8000-0000000000c4', 'ZZ-TESTE-RETESTE-4', current_date, 'ordered',  v_sup, v_act, v_org),  -- F10 linhas
      ('2027c910-0000-4000-8000-0000000000c5', 'ZZ-TESTE-RETESTE-5', current_date, 'ordered',  NULL,  v_act, v_org),  -- F10 só serviços
      ('2027c910-0000-4000-8000-0000000000c6', 'ZZ-TESTE-RETESTE-6', current_date, 'pending',  NULL,  v_act, v_org),  -- A editar
      ('2027c910-0000-4000-8000-0000000000c7', 'ZZ-TESTE-RETESTE-7', current_date, 'pending',  NULL,  v_act, v_org);  -- D1
    INSERT INTO purchase_order_items (id, purchase_order_id, item_type, product_id, service_id, description,
                                      quantity, unit_price, vat_rate, vat_amount, total_price, received_quantity) VALUES
      ('2027c910-0000-4000-8000-0000000000d2', '2027c910-0000-4000-8000-0000000000c2', 'product', v_p, NULL,
       'ZZ-TESTE-RETESTE linha recebida', 3, 1, 0, 0, 3, 1),
      ('2027c910-0000-4000-8000-0000000000d4', '2027c910-0000-4000-8000-0000000000c4', 'product', v_p, NULL,
       'ZZ-TESTE-RETESTE linha a receber', 3, 1, 0, 0, 3, 0),
      ('2027c910-0000-4000-8000-0000000000d5', '2027c910-0000-4000-8000-0000000000c5', 'service', NULL, v_svc,
       'ZZ-TESTE-RETESTE serviço', 1, 1, 0, 0, 1, 0);

    PERFORM set_config('teste.org', v_org::text, true);
    PERFORM set_config('teste.rol', v_rol::text, true);
    PERFORM set_config('teste.act', v_act::text, true);
    PERFORM set_config('teste.p', v_p::text, true);
    PERFORM set_config('teste.is', v_is::text, true);
    PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    IF f = '' THEN PERFORM set_config('teste.ok', 'sim', true); END IF;
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── Fase 1: stocks (H, F12, F11) ────────────────────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; v_saldo integer; r jsonb; v_s1 uuid; v_s2 uuid; v_del timestamptz;
  v_org uuid; v_p uuid; v_act uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid; v_p := current_setting('teste.p')::uuid; v_act := current_setting('teste.act')::uuid;
  BEGIN
    -- H1 entrada 3 em W1, ajustes +2 e −1, transferência 1 para W3 (W1 fica com 3)
    BEGIN
      v_saldo := public.rpc_register_stock_entry(v_p, '2027c910-0000-4000-8000-0000000000a1', 3,
                                                 current_setting('teste.is')::uuid, NULL, NULL, 'ZZ-TESTE-RETESTE');
      IF v_saldo IS DISTINCT FROM 3 THEN f := f || format('H1 entrada: saldo %s (esperado 3); ', v_saldo); END IF;
      v_saldo := public.rpc_adjust_stock(v_p, '2027c910-0000-4000-8000-0000000000a1', 2, 'positivo', 'ZZ-TESTE-RETESTE');
      v_saldo := public.rpc_adjust_stock(v_p, '2027c910-0000-4000-8000-0000000000a1', 1, 'negativo', 'ZZ-TESTE-RETESTE');
      IF v_saldo IS DISTINCT FROM 4 THEN f := f || format('H1 ajustes: saldo %s (esperado 4); ', v_saldo); END IF;
      r := public.rpc_register_stock_transfer(v_p, '2027c910-0000-4000-8000-0000000000a1',
                                              '2027c910-0000-4000-8000-0000000000a3', 1, 'ZZ-TESTE-RETESTE');
      IF (r->>'from_balance')::int IS DISTINCT FROM 3 OR (r->>'to_balance')::int IS DISTINCT FROM 1 THEN
        f := f || format('H1 transferência: %s (esperado 3 e 1); ', r);
      END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('H1 entrada/ajuste/transferência falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    SELECT id INTO v_s1 FROM stocks WHERE product_id = v_p AND warehouse_id = '2027c910-0000-4000-8000-0000000000a1';

    -- H2 INSERT direto a 0 em W2 e W8 (o que Stocks.tsx faz)
    BEGIN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, created_by) VALUES
        (v_org, v_p, '2027c910-0000-4000-8000-0000000000a2', 0, v_act),
        (v_org, v_p, '2027c910-0000-4000-8000-0000000000a8', 0, v_act);
    EXCEPTION WHEN OTHERS THEN f := f || format('H2 INSERT direto de stocks a 0 recusado: %s %s; ', SQLSTATE, SQLERRM);
    END;
    SELECT id INTO v_s2 FROM stocks WHERE product_id = v_p AND warehouse_id = '2027c910-0000-4000-8000-0000000000a2';
    PERFORM set_config('teste.s2', coalesce(v_s2::text, ''), true);

    -- H3 apagar a linha de W2 (a 0) passa
    BEGIN
      PERFORM public.rpc_delete_stock(v_s2);
      SELECT deleted_at INTO v_del FROM stocks WHERE id = v_s2;
      IF v_del IS NULL THEN f := f || 'H3 rpc_delete_stock a 0 não apagou; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('H3 rpc_delete_stock a 0 falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- F11 entrada de 2 na linha apagada de W2: repõe-na (verificado como postgres no fim, S)
    BEGIN
      v_saldo := public.rpc_register_stock_entry(v_p, '2027c910-0000-4000-8000-0000000000a2', 2,
                                                 current_setting('teste.is')::uuid, NULL, NULL, 'ZZ-TESTE-RETESTE');
      IF v_saldo IS DISTINCT FROM 2 THEN f := f || format('F11 entrada na linha apagada: saldo %s (esperado 2); ', v_saldo); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F11 entrada na linha apagada falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- F12 apagar a linha de W1 com 3 unidades → recusado
    BEGIN
      PERFORM public.rpc_delete_stock(v_s1);
      f := f || 'F12 rpc_delete_stock com 3 unidades passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('ainda tem 3 unidade' IN SQLERRM) = 0 THEN f := f || format('F12 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F12 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- H4 apagar e restaurar um armazém vazio (W5)
    BEGIN
      PERFORM public.rpc_delete_warehouse('2027c910-0000-4000-8000-0000000000a5');
      PERFORM public.rpc_restore_warehouse('2027c910-0000-4000-8000-0000000000a5');
      SELECT deleted_at INTO v_del FROM warehouses WHERE id = '2027c910-0000-4000-8000-0000000000a5';
      IF v_del IS NOT NULL THEN f := f || 'H4 rpc_restore_warehouse não repôs; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('H4 apagar/restaurar armazém falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
  EXCEPTION WHEN OTHERS THEN f := f || format('fase 1 stocks: bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── Fase 1: encomendas (H, O11, F5, A, F10 sem receiving.receive) ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; v_po public.purchase_orders; v_del timestamptz; r jsonb; n integer;
  v_org uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid;
  BEGIN
    -- H5 apagar e restaurar uma PO sem receção
    BEGIN
      PERFORM public.rpc_delete_purchase_order('2027c910-0000-4000-8000-0000000000c1');
      SELECT deleted_at INTO v_del FROM purchase_orders WHERE id = '2027c910-0000-4000-8000-0000000000c1';
      IF v_del IS NULL THEN f := f || 'H5 rpc_delete_purchase_order não apagou; '; END IF;
      PERFORM public.rpc_restore_purchase_order('2027c910-0000-4000-8000-0000000000c1');
      SELECT deleted_at INTO v_del FROM purchase_orders WHERE id = '2027c910-0000-4000-8000-0000000000c1';
      IF v_del IS NOT NULL THEN f := f || 'H5 rpc_restore_purchase_order não repôs; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('H5 apagar/restaurar PO sem receção falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- O11 apagar uma PO com received_quantity > 0 → recusado
    BEGIN
      PERFORM public.rpc_delete_purchase_order('2027c910-0000-4000-8000-0000000000c2');
      f := f || 'O11 apagar PO com mercadoria recebida passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('mercadoria recebida' IN SQLERRM) = 0 THEN f := f || format('O11 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('O11 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- H6 criar PO pendente passa
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', 'pending'), '[]'::jsonb);
      IF v_po.status IS DISTINCT FROM 'pending' THEN f := f || format('H6 criar pendente: estado %s; ', v_po.status); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('H6 criar PO pendente falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- F5-a / F5-a2 criar 'ordered' e 'Ordered' sem approve → recusado
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', 'ordered'), '[]'::jsonb);
      f := f || 'F5-a criar ordered sem approve passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('aprovar encomendas' IN SQLERRM) = 0 THEN f := f || format('F5-a recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F5-a erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', ' Ordered '), '[]'::jsonb);
      f := f || format('F5-a2 criar « Ordered » sem approve passou (gravou %s); ', v_po.status);
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('aprovar encomendas' IN SQLERRM) = 0 THEN f := f || format('F5-a2 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F5-a2 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- F5-e / F5-i criar 'received' e 'foo' → recusado
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', 'received'), '[]'::jsonb);
      f := f || 'F5-e criar received passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('nasce pendente' IN SQLERRM) = 0 THEN f := f || format('F5-e recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F5-e erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', 'foo'), '[]'::jsonb);
      f := f || 'F5-i criar foo passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('nasce pendente' IN SQLERRM) = 0 THEN f := f || format('F5-i recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F5-i erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- F5-c / F5-f importar 'ordered' sem approve e 'received' → recusado, com o número da encomenda
    BEGIN
      n := public.rpc_import_purchase_orders_csv(jsonb_build_array(jsonb_build_object(
             'order_number', 'ZZ-TESTE-RETESTE-IMP-1', 'organization_id', v_org, 'order_date', current_date, 'status', 'ordered')));
      f := f || 'F5-c importar ordered sem approve passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('aprovar encomendas' IN SQLERRM) = 0 OR position('ZZ-TESTE-RETESTE-IMP-1' IN SQLERRM) = 0 THEN
                  f := f || format('F5-c recusado por outra razão: %s; ', SQLERRM);
                END IF;
              WHEN OTHERS THEN f := f || format('F5-c erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      n := public.rpc_import_purchase_orders_csv(jsonb_build_array(jsonb_build_object(
             'order_number', 'ZZ-TESTE-RETESTE-IMP-2', 'organization_id', v_org, 'order_date', current_date, 'status', 'received')));
      f := f || 'F5-f importar received passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('não pode ser importada' IN SQLERRM) = 0 OR position('ZZ-TESTE-RETESTE-IMP-2' IN SQLERRM) = 0 THEN
                  f := f || format('F5-f recusado por outra razão: %s; ', SQLERRM);
                END IF;
              WHEN OTHERS THEN f := f || format('F5-f erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- A-a editar para 'received' → recusado; A-b editar para 'cancelled' → passa
    BEGIN
      v_po := public.rpc_update_purchase_order('2027c910-0000-4000-8000-0000000000c6',
                jsonb_build_object('order_date', current_date, 'status', 'received'), '[]'::jsonb);
      f := f || 'A-a editar para received passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('não se escolhe ao editar' IN SQLERRM) = 0 THEN f := f || format('A-a recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('A-a erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      v_po := public.rpc_update_purchase_order('2027c910-0000-4000-8000-0000000000c6',
                jsonb_build_object('order_date', current_date, 'status', 'cancelled'), '[]'::jsonb);
      IF v_po.status IS DISTINCT FROM 'cancelled' THEN f := f || format('A-b editar para cancelled: estado %s; ', v_po.status); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A-b editar para cancelled falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- F10-a receber por linhas sem receiving.receive → recusado
    BEGIN
      r := public.rpc_receive_purchase_order_lines('2027c910-0000-4000-8000-0000000000c4', '2027c910-0000-4000-8000-0000000000a3',
             jsonb_build_array(jsonb_build_object('purchase_order_item_id', '2027c910-0000-4000-8000-0000000000d4', 'quantity', 1)), NULL);
      f := f || 'F10-a receber por linhas sem receiving.receive passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('Sem permissão para receber' IN SQLERRM) = 0 THEN f := f || format('F10-a recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F10-a erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- F10-p pré-visualizar sem receiving.receive → recusado (a recusa da função interna propaga-se)
    BEGIN
      r := public.rpc_preview_po_receipt('2027c910-0000-4000-8000-0000000000c4', NULL, '2027c910-0000-4000-8000-0000000000a3');
      f := f || 'F10-p pré-visualizar sem receiving.receive passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('Sem permissão para receber' IN SQLERRM) = 0 THEN f := f || format('F10-p recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F10-p erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- F10-s receber a PO só de serviços sem receiving.receive → recusado
    BEGIN
      r := public.rpc_receive_purchase_order('2027c910-0000-4000-8000-0000000000c5', '2027c910-0000-4000-8000-0000000000a3', NULL);
      f := f || 'F10-s receber PO só de serviços sem receiving.receive passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('Sem permissão para receber' IN SQLERRM) = 0 THEN f := f || format('F10-s recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('F10-s erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
  EXCEPTION WHEN OTHERS THEN f := f || format('fase 1 encomendas: bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── Fase 2: dar approve e receiving.receive (como postgres) ─────────────────────────────────────────────────────────────
DO $fx$
DECLARE f text := '';
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
    SELECT current_setting('teste.rol')::uuid, c, NULL::uuid
    FROM unnest(ARRAY['purchase_orders.approve', 'receiving.receive']) c
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE fase 2 falhou: %s %s; ', SQLSTATE, SQLERRM);
    PERFORM set_config('teste.ok', 'nao', true);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── Fase 2: com as permissões, passa; D1 DELETE direto ─────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; v_po public.purchase_orders; r jsonb; n bigint; v_s8 uuid;
  v_org uuid; v_p uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid; v_p := current_setting('teste.p')::uuid;
  BEGIN
    -- F5-d / F5-d2 / F5-g com approve: 'ordered' e ' Ordered ' passam e gravam 'ordered'; importar 'ordered' passa
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', 'ordered'), '[]'::jsonb);
      IF v_po.status IS DISTINCT FROM 'ordered' THEN f := f || format('F5-d criar ordered: estado %s; ', v_po.status); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F5-d criar ordered com approve falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      v_po := public.rpc_create_purchase_order(v_org, jsonb_build_object('order_date', current_date, 'status', ' Ordered '), '[]'::jsonb);
      IF v_po.status IS DISTINCT FROM 'ordered' THEN f := f || format('F5-d2 criar « Ordered » gravou %s (esperado ordered); ', v_po.status); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F5-d2 criar « Ordered » com approve falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      n := public.rpc_import_purchase_orders_csv(jsonb_build_array(jsonb_build_object(
             'order_number', 'ZZ-TESTE-RETESTE-IMP-3', 'organization_id', v_org, 'order_date', current_date, 'status', 'ordered')));
      IF n IS DISTINCT FROM 1 THEN f := f || format('F5-g importar ordered com approve: %s linhas; ', n); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F5-g importar ordered com approve falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- F10-b com as três: pré-visualizar e receber 1 unidade por linhas para W3
    BEGIN
      r := public.rpc_preview_po_receipt('2027c910-0000-4000-8000-0000000000c4', NULL, '2027c910-0000-4000-8000-0000000000a3');
      IF (r->>'preview')::boolean IS NOT TRUE THEN f := f || format('F10-b pré-visualização: %s; ', r); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F10-b pré-visualizar com as três falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      r := public.rpc_receive_purchase_order_lines('2027c910-0000-4000-8000-0000000000c4', '2027c910-0000-4000-8000-0000000000a3',
             jsonb_build_array(jsonb_build_object('purchase_order_item_id', '2027c910-0000-4000-8000-0000000000d4', 'quantity', 1)), NULL);
      IF r->>'status' IS DISTINCT FROM 'partially_received' THEN f := f || format('F10-b receção: estado %s; ', r->>'status'); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F10-b receber por linhas com as três falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- F10-s2 receber a PO só de serviços com as três
    BEGIN
      r := public.rpc_receive_purchase_order('2027c910-0000-4000-8000-0000000000c5', '2027c910-0000-4000-8000-0000000000a3', NULL);
      IF r->>'status' IS DISTINCT FROM 'received' THEN f := f || format('F10-s2 receção só de serviços: estado %s; ', r->>'status'); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('F10-s2 receber PO só de serviços com as três falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- D1 DELETE físico direto: 0 linhas, sem erro, em linhas visíveis
    SELECT id INTO v_s8 FROM stocks WHERE product_id = v_p AND warehouse_id = '2027c910-0000-4000-8000-0000000000a8';
    IF v_s8 IS NULL THEN f := f || 'D1 a linha de stock de W8 não é visível (o teste do DELETE não vale); '; END IF;
    PERFORM set_config('teste.s8', coalesce(v_s8::text, ''), true);
    IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id = '2027c910-0000-4000-8000-0000000000c7') THEN
      f := f || 'D1 a PO 7 não é visível (o teste do DELETE não vale); ';
    END IF;
    BEGIN
      DELETE FROM stocks WHERE id = v_s8;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 0 THEN f := f || format('D1 DELETE direto em stocks apagou %s linha(s); ', n); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('D1 DELETE em stocks deu erro (esperado 0 linhas): %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      DELETE FROM purchase_orders WHERE id = '2027c910-0000-4000-8000-0000000000c7';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 0 THEN f := f || format('D1 DELETE direto em purchase_orders apagou %s linha(s); ', n); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('D1 DELETE em purchase_orders deu erro (esperado 0 linhas): %s %s; ', SQLSTATE, SQLERRM);
    END;
  EXCEPTION WHEN OTHERS THEN f := f || format('fase 2: bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── CK, S: CHECK, catálogo, saldos e estados (como postgres) ───────────────────────────────────────────────────────────
DO $t$
DECLARE
  f text := ''; v_p uuid; rec record; v_st text;
BEGIN
  BEGIN
    IF current_setting('teste.ok') = 'sim' THEN
      v_p := current_setting('teste.p')::uuid;

      -- S1 saldos: cada linha tocada bate com a soma dos movimentos e com o esperado
      FOR rec IN
        SELECT e.wh, e.qtd_esperada, e.mov_esperados, s.quantity, s.deleted_at,
               (SELECT coalesce(sum(CASE WHEN m.movement_type IN ('entrada', 'transferencia_entrada', 'ajuste_positivo', 'estorno_venda')
                                         THEN m.quantity ELSE -m.quantity END), 0)::integer
                FROM stock_movements m WHERE m.product_id = v_p AND m.warehouse_id = e.wh) AS soma,
               (SELECT count(*)::integer FROM stock_movements m WHERE m.product_id = v_p AND m.warehouse_id = e.wh) AS n_mov
        FROM (VALUES ('2027c910-0000-4000-8000-0000000000a1'::uuid, 3, 4),   -- entrada 3, +2, −1, transf. −1
                     ('2027c910-0000-4000-8000-0000000000a2'::uuid, 2, 1),   -- F11: entrada 2 na linha apagada
                     ('2027c910-0000-4000-8000-0000000000a3'::uuid, 2, 2),   -- transf. +1, receção +1
                     ('2027c910-0000-4000-8000-0000000000a8'::uuid, 0, 0))   -- D1: a linha continua lá
             AS e(wh, qtd_esperada, mov_esperados)
        LEFT JOIN stocks s ON s.product_id = v_p AND s.warehouse_id = e.wh
      LOOP
        IF rec.quantity IS DISTINCT FROM rec.soma OR rec.quantity IS DISTINCT FROM rec.qtd_esperada
           OR rec.n_mov <> rec.mov_esperados THEN
          f := f || format('S1 armazém %s: saldo %s, soma dos movimentos %s, %s movimentos (esperado %s com %s); ',
                           rec.wh, rec.quantity, rec.soma, rec.n_mov, rec.qtd_esperada, rec.mov_esperados);
        END IF;
        IF rec.deleted_at IS NOT NULL THEN
          f := f || format('S1 armazém %s: a linha de stock ficou apagada%s; ', rec.wh,
                           CASE WHEN rec.wh = '2027c910-0000-4000-8000-0000000000a2'::uuid THEN ' (F11: o movimento não a repôs)' ELSE '' END);
        END IF;
      END LOOP;

      -- S2 estados finais das POs de fixture
      FOR rec IN
        SELECT e.id, e.esperado, e.nome, po.status, po.deleted_at
        FROM (VALUES ('2027c910-0000-4000-8000-0000000000c1'::uuid, 'pending', 'H5'),
                     ('2027c910-0000-4000-8000-0000000000c2'::uuid, 'partially_received', 'O11'),
                     ('2027c910-0000-4000-8000-0000000000c4'::uuid, 'partially_received', 'F10-b'),
                     ('2027c910-0000-4000-8000-0000000000c5'::uuid, 'received', 'F10-s2'),
                     ('2027c910-0000-4000-8000-0000000000c6'::uuid, 'cancelled', 'A'),
                     ('2027c910-0000-4000-8000-0000000000c7'::uuid, 'pending', 'D1')) AS e(id, esperado, nome)
        LEFT JOIN purchase_orders po ON po.id = e.id
      LOOP
        IF rec.status IS NULL THEN
          f := f || format('S2 %s: a PO desapareceu; ', rec.nome);
        ELSIF rec.status IS DISTINCT FROM rec.esperado OR rec.deleted_at IS NOT NULL THEN
          f := f || format('S2 %s: estado %s%s (esperado %s, ativa); ', rec.nome, rec.status,
                           CASE WHEN rec.deleted_at IS NOT NULL THEN ', apagada' ELSE '' END, rec.esperado);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM purchase_orders WHERE organization_id = current_setting('teste.org')::uuid
                   AND status IS DISTINCT FROM btrim(status)) THEN
        f := f || 'S2 ficou uma PO com espaços no estado (F5 não normalizou); ';
      END IF;
    END IF;

    -- CK1 o CHECK recusa um estado fora da lista (escrita como postgres, que as guardas de gatilho deixam passar)
    BEGIN
      UPDATE purchase_orders SET status = 'zz_desconhecido' WHERE id = '2027c910-0000-4000-8000-0000000000c7';
      f := f || 'CK1 UPDATE para um estado fora da lista passou; ';
    EXCEPTION WHEN check_violation THEN
                IF position('purchase_orders_status_conhecido' IN SQLERRM) = 0 THEN f := f || format('CK1 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('CK1 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- CK2 catálogo
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conrelid = 'public.purchase_orders'::regclass
                     AND c.conname::text = 'purchase_orders_status_conhecido' AND c.convalidated) THEN
      f := f || 'CK2 CHECK purchase_orders_status_conhecido em falta ou por validar; ';
    END IF;
    IF (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.cmd::text = 'DELETE' AND p.qual = 'false'
          AND ((p.tablename = 'stocks' AND p.policyname = 'stocks_delete_policy')
            OR (p.tablename = 'purchase_orders' AND p.policyname = 'purchase_orders_delete_policy'))) <> 2 THEN
      f := f || 'CK2 as políticas de DELETE de stocks e purchase_orders não são USING (false); ';
    END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('CK/S bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: buracos do reteste — H (6), F12, F11, O11, F5 (10), A (2), F10 (6), D1 (2), CK (3), S (saldos e estados)'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
