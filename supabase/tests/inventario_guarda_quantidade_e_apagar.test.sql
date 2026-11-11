-- ============================================================
-- Testes: lote «integridade do inventário» (base RH)
--   20270114600000_inventario_integridade_stocks
--   20270114610000_inventario_integridade_warehouses
--   20270114620000_inventario_integridade_suppliers
--   20270114630000_inventario_integridade_purchase_orders
--   20270114640000_inventario_integridade_stock_movements_insert
-- ============================================================
-- ORDEM OBRIGATÓRIA (regra do CLAUDE.md: nunca deixar o remoto num estado defeituoso para mostrar o vermelho):
--   1. ANTES do db push, contra o remoto ainda por corrigir → VERMELHO esperado: o resultado final começa por 'FALHOU:' e lista
--      os casos (os UPDATE/INSERT diretos passam; o ROLLBACK final desfaz tudo).
--   2. db push das 5 migrations.
--   3. Correr outra vez → VERDE (resultado 'OK: …'). Não se reverte nada para voltar a mostrar o vermelho.
--
-- Correr (a partir do worktree rh-pessoas, ligado a uetjghdkwbywbftedtth):
--   supabase db query --linked -o csv -f supabase/tests/inventario_guarda_quantidade_e_apagar.test.sql
--
-- Higiene: tudo dentro de BEGIN … ROLLBACK, sem DDL. NENHUM RAISE EXCEPTION por apanhar, nem nas fixtures: cada bloco apanha
-- os seus erros, acumula-os em teste.falhas e o resultado sai num SELECT final, seguido do ROLLBACK (um erro por apanhar
-- saltaria o ROLLBACK e deixaria a sessão abortada). Se as fixtures falharem, os blocos seguintes não correm (teste.ok).
-- Cada recusa esperada corre num sub-bloco que apanha insufficient_privilege e EXIGE o fragmento da mensagem da guarda
-- (um 42501 de outra origem — RLS, uma RPC — conta como falha).
--
-- Fixtures, como postgres, SÓ na nike (b6ffce4f-f630-4933-833a-008649757a33, confirmada no início) e numa organização
-- descartável criada nesta transação. Utilizador: o membro ativo do papel 'teste_inventario' da nike (não system admin; o
-- papel está a zero permissões e recebe-as só nesta transação, por fases):
--   fase 1 — .view/.edit/.create SEM .delete (prova F2: «edit sem delete» não apaga);
--   fase 2 — + .delete (os caminhos de eliminar/restaurar pelas RPCs).
--
-- Cobre:
--   A. caminhos felizes: rpc_register_stock_entry (ramo INSERT de fn_stock_movements_apply); rpc_adjust_stock +2 e −1 na
--      MESMA linha (ramo ON CONFLICT DO UPDATE SET quantity, average_cost); rpc_register_stock_transfer; INSERT direto de
--      stocks a 0; UPDATE direto de mínimo/localização; is_active do armazém; cat_definir_armazem_produtos ligar/desligar
--      (escreve deleted_at em stocks dentro de uma RPC)
--   B. recusas: UPDATE direto de quantity / average_cost / deleted_at em stocks; INSERT em stocks com quantity 5 e com armazém
--      de outra organização; INSERT direto em stock_movements; soft-delete direto em warehouses, suppliers, purchase_orders;
--      organization_id em warehouses e purchase_orders (utilizador com .edit nas duas organizações)
--   C. rpc_delete_/rpc_restore_ de warehouse, supplier, purchase_order e stock passam; a reposição direta é recusada
--   D. o saldo de cada linha de stock tocada bate com a soma dos movimentos
--   E. catálogo: gatilhos ativos e INVOKER, auxiliar DEFINER sem EXECUTE para anon, política WITH CHECK (false)
--
-- Limite conhecido (B6): o INSERT direto em stock_movements é recusado já pela guarda de stocks (fn_stock_movements_apply é
-- INVOKER e escreve a quantidade como authenticated), ANTES de a política ser avaliada. Por isso B6 NÃO prova o ficheiro
-- 20270114640000; esse fica provado só pelo catálogo (E: WITH CHECK (false)). B6 aceita as duas mensagens.
-- rpc_revert_purchase_order_receipt não é exercitada (exige uma encomenda recebida com lotes; fica fora deste teste).
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true),
       set_config('teste.claims', '{"role":"authenticated"}', true);

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org  constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_org2 constant uuid := '2027c900-0000-4000-8000-0000000000f1';
  v_rol2 constant uuid := '2027c900-0000-4000-8000-0000000000f2';
  v_rol uuid; v_auth uuid; v_act uuid; v_p uuid; v_is uuid; f text := '';
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

    SELECT i.product_id, i.id INTO v_p, v_is
    FROM item_suppliers i JOIN products p ON p.id = i.product_id
    WHERE i.organization_id = v_org AND i.item_type = 'product' AND i.is_active AND i.deleted_at IS NULL
      AND p.organization_id = v_org AND NOT p.is_deleted AND p.deleted_at IS NULL
    ORDER BY i.created_at, i.id LIMIT 1;
    IF v_p IS NULL THEN RAISE EXCEPTION 'sem produto da nike com fornecedor ativo'; END IF;

    -- fase 1: .edit sem .delete, no papel teste_inventario
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_rol, c, NULL::uuid
    FROM unnest(ARRAY['inventory.view', 'inventory.edit', 'inventory.create',
                      'warehouses.view', 'warehouses.edit',
                      'suppliers.view', 'suppliers.edit',
                      'purchase_orders.view', 'purchase_orders.edit']) c
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    -- organização descartável, com o mesmo utilizador e .edit lá (para provar a mudança de organização)
    INSERT INTO anew_organizations (id, name, created_by) VALUES (v_org2, 'ZZ-TESTE-INVENTARIO descartável', v_act);
    INSERT INTO anew_roles (id, code, name, organization_id) VALUES (v_rol2, 'zz_teste_inventario', 'ZZ-TESTE-INVENTARIO', v_org2);
    INSERT INTO anew_memberships (user_id, organization_id, role_id) VALUES (v_act, v_org2, v_rol2);
    INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_rol2, c, NULL::uuid
    FROM unnest(ARRAY['warehouses.view', 'warehouses.edit', 'purchase_orders.view', 'purchase_orders.edit',
                      'inventory.view', 'inventory.create']) c
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', '', true);

    -- a prova F2 só vale se o utilizador não tiver .delete por outra associação
    IF public.has_anew_permission_for_org(v_auth, 'warehouses.delete', v_org)
       OR public.has_anew_permission_for_org(v_auth, 'suppliers.delete', v_org)
       OR public.has_anew_permission_for_org(v_auth, 'purchase_orders.delete', v_org)
       OR public.has_anew_permission_for_org(v_auth, 'inventory.delete', v_org) THEN
      f := f || 'FIXTURE o utilizador já tem .delete por outra via (a prova «edit sem delete» não vale); ';
    END IF;

    INSERT INTO warehouses (id, name, code, is_active, created_by, organization_id) VALUES
      ('2027c900-0000-4000-8000-0000000000a1', 'ZZ-TESTE-INVENTARIO W1', 'ZZTINV1', true, v_act, v_org),
      ('2027c900-0000-4000-8000-0000000000a2', 'ZZ-TESTE-INVENTARIO W2', 'ZZTINV2', true, v_act, v_org),
      ('2027c900-0000-4000-8000-0000000000a3', 'ZZ-TESTE-INVENTARIO W3', 'ZZTINV3', true, v_act, v_org2),
      ('2027c900-0000-4000-8000-0000000000a5', 'ZZ-TESTE-INVENTARIO W5', 'ZZTINV5', true, v_act, v_org),
      ('2027c900-0000-4000-8000-0000000000a7', 'ZZ-TESTE-INVENTARIO W7', 'ZZTINV7', true, v_act, v_org),
      ('2027c900-0000-4000-8000-0000000000a8', 'ZZ-TESTE-INVENTARIO W8', 'ZZTINV8', true, v_act, v_org);
    INSERT INTO suppliers (id, name, created_by, organization_id)
    VALUES ('2027c900-0000-4000-8000-0000000000b1', 'ZZ-TESTE-INVENTARIO fornecedor', v_act, v_org);
    INSERT INTO purchase_orders (id, order_number, order_date, status, created_by, organization_id) VALUES
      ('2027c900-0000-4000-8000-0000000000c1', 'ZZ-TESTE-INV-1', current_date, 'pending', v_act, v_org),
      ('2027c900-0000-4000-8000-0000000000c2', 'ZZ-TESTE-INV-2', current_date, 'pending', v_act, v_org);

    PERFORM set_config('teste.org', v_org::text, true);
    PERFORM set_config('teste.org2', v_org2::text, true);
    PERFORM set_config('teste.rol', v_rol::text, true);
    PERFORM set_config('teste.auth', v_auth::text, true);
    PERFORM set_config('teste.act', v_act::text, true);
    PERFORM set_config('teste.p', v_p::text, true);
    PERFORM set_config('teste.is', v_is::text, true);
    PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── Fase 1 (edit sem delete): A. caminhos felizes ───────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; n bigint; v_saldo integer; v_s1 uuid; r jsonb;
  v_org uuid; v_p uuid; v_act uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid; v_p := current_setting('teste.p')::uuid; v_act := current_setting('teste.act')::uuid;
  BEGIN
    -- A1 entrada: ramo INSERT do gatilho do livro (W1 não tinha linha)
    BEGIN
      v_saldo := public.rpc_register_stock_entry(v_p, '2027c900-0000-4000-8000-0000000000a1', 3,
                                                 current_setting('teste.is')::uuid, NULL, NULL, 'ZZ-TESTE-INVENTARIO');
      IF v_saldo IS DISTINCT FROM 3 THEN f := f || format('A1 entrada: saldo %s (esperado 3); ', v_saldo); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A1 rpc_register_stock_entry falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    SELECT id INTO v_s1 FROM stocks WHERE product_id = v_p AND warehouse_id = '2027c900-0000-4000-8000-0000000000a1';
    IF v_s1 IS NULL THEN f := f || 'A1 linha de stock de W1 não visível; '; END IF;
    PERFORM set_config('teste.s1', coalesce(v_s1::text, ''), true);

    -- A2 ajustes na MESMA linha: ramo ON CONFLICT DO UPDATE SET quantity
    BEGIN
      v_saldo := public.rpc_adjust_stock(v_p, '2027c900-0000-4000-8000-0000000000a1', 2, 'positivo', 'ZZ-TESTE-INVENTARIO');
      IF v_saldo IS DISTINCT FROM 5 THEN f := f || format('A2 ajuste +2: saldo %s (esperado 5); ', v_saldo); END IF;
      v_saldo := public.rpc_adjust_stock(v_p, '2027c900-0000-4000-8000-0000000000a1', 1, 'negativo', 'ZZ-TESTE-INVENTARIO');
      IF v_saldo IS DISTINCT FROM 4 THEN f := f || format('A2 ajuste -1: saldo %s (esperado 4); ', v_saldo); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A2 rpc_adjust_stock falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- A3 INSERT direto a 0 (o que Stocks.tsx faz) em W2 e W8
    BEGIN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, created_by) VALUES
        (v_org, v_p, '2027c900-0000-4000-8000-0000000000a2', 0, v_act),
        (v_org, v_p, '2027c900-0000-4000-8000-0000000000a8', 0, v_act);
    EXCEPTION WHEN OTHERS THEN f := f || format('A3 INSERT direto de stocks a 0 recusado: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- A4 transferência W1 → W2 (W2 já tem linha: ramo UPDATE no destino)
    BEGIN
      r := public.rpc_register_stock_transfer(v_p, '2027c900-0000-4000-8000-0000000000a1',
                                              '2027c900-0000-4000-8000-0000000000a2', 1, 'ZZ-TESTE-INVENTARIO');
      IF (r->>'from_balance')::int IS DISTINCT FROM 3 OR (r->>'to_balance')::int IS DISTINCT FROM 1 THEN
        f := f || format('A4 transferência: %s (esperado 3 e 1); ', r);
      END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A4 rpc_register_stock_transfer falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- A5 definições da linha
    BEGIN
      UPDATE stocks SET minimum_quantity = 1, location = 'ZZ-TESTE' WHERE id = v_s1;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN f := f || format('A5 UPDATE de mínimo/localização afetou %s linhas; ', n); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A5 UPDATE de mínimo/localização recusado: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- A6 is_active do armazém (Warehouses.tsx)
    BEGIN
      UPDATE warehouses SET is_active = false, updated_at = now() WHERE id = '2027c900-0000-4000-8000-0000000000a5';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN f := f || format('A6 UPDATE de is_active afetou %s linhas; ', n); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A6 UPDATE de is_active recusado: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- A7 Catálogo: ligar e desligar W7 (a RPC escreve deleted_at em stocks)
    BEGIN
      r := public.cat_definir_armazem_produtos(ARRAY[v_p], '2027c900-0000-4000-8000-0000000000a7', true);
      IF (r->>'alterados')::int IS DISTINCT FROM 1 THEN f := f || format('A7 ligar W7: %s; ', r); END IF;
      r := public.cat_definir_armazem_produtos(ARRAY[v_p], '2027c900-0000-4000-8000-0000000000a7', false);
      IF (r->>'alterados')::int IS DISTINCT FROM 1 THEN f := f || format('A7 desligar W7: %s; ', r); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('A7 cat_definir_armazem_produtos falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
  EXCEPTION WHEN OTHERS THEN f := f || format('A bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── Fase 1 (edit sem delete): B. recusas esperadas ──────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; n bigint;
  v_org uuid; v_org2 uuid; v_p uuid; v_act uuid; v_s1 uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid; v_org2 := current_setting('teste.org2')::uuid;
  v_p := current_setting('teste.p')::uuid; v_act := current_setting('teste.act')::uuid;
  v_s1 := nullif(current_setting('teste.s1', true), '')::uuid;
  BEGIN
    -- B1 quantity
    BEGIN
      UPDATE stocks SET quantity = quantity + 1 WHERE id = v_s1;
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B1 linha invisível; ' ELSE 'B1 UPDATE direto de quantity passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('mudam por um movimento' IN SQLERRM) = 0 THEN f := f || format('B1 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B1 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B2 average_cost
    BEGIN
      UPDATE stocks SET average_cost = 1 WHERE id = v_s1;
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B2 linha invisível; ' ELSE 'B2 UPDATE direto de average_cost passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('mudam por um movimento' IN SQLERRM) = 0 THEN f := f || format('B2 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B2 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B3 soft-delete de stocks
    BEGIN
      UPDATE stocks SET deleted_at = now() WHERE id = v_s1;
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B3 linha invisível; ' ELSE 'B3 soft-delete direto de stocks passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('restaurar uma linha de stock' IN SQLERRM) = 0 THEN f := f || format('B3 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B3 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B4 INSERT em stocks com armazém de outra organização
    BEGIN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, created_by)
      VALUES (v_org, v_p, '2027c900-0000-4000-8000-0000000000a3', 0, v_act);
      f := f || 'B4 INSERT de stocks com armazém de outra organização passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('O produto e o armaz' IN SQLERRM) = 0 THEN f := f || format('B4 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B4 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B5 INSERT em stocks com quantidade
    BEGIN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, created_by)
      VALUES (v_org, v_p, '2027c900-0000-4000-8000-0000000000a5', 5, v_act);
      f := f || 'B5 INSERT de stocks com quantity 5 passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('mudam por um movimento' IN SQLERRM) = 0 THEN f := f || format('B5 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B5 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B6 INSERT direto em stock_movements (recusado pela guarda de stocks ou pela política: ver o cabeçalho)
    BEGIN
      INSERT INTO stock_movements (organization_id, product_id, warehouse_id, movement_type, quantity,
                                   document_number, document_type, balance_after, created_by)
      VALUES (v_org, v_p, '2027c900-0000-4000-8000-0000000000a1', 'ajuste_positivo', 1,
              'ZZ-TESTE-INV-DOC', 'ajuste', 0, v_act);
      f := f || 'B6 INSERT direto em stock_movements passou; ';
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('mudam por um movimento' IN SQLERRM) = 0 AND position('row-level security' IN SQLERRM) = 0 THEN
                  f := f || format('B6 recusado por outra razão: %s; ', SQLERRM);
                END IF;
              WHEN OTHERS THEN f := f || format('B6 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B7 soft-delete de warehouses (edit sem delete)
    BEGIN
      UPDATE warehouses SET deleted_at = now() WHERE id = '2027c900-0000-4000-8000-0000000000a1';
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B7 linha invisível; ' ELSE 'B7 soft-delete direto de warehouses passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('use Eliminar ou Restaurar' IN SQLERRM) = 0 THEN f := f || format('B7 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B7 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B8 soft-delete de suppliers
    BEGIN
      UPDATE suppliers SET deleted_at = now() WHERE id = '2027c900-0000-4000-8000-0000000000b1';
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B8 linha invisível; ' ELSE 'B8 soft-delete direto de suppliers passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('use Eliminar ou Restaurar' IN SQLERRM) = 0 THEN f := f || format('B8 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B8 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B9 soft-delete de purchase_orders
    BEGIN
      UPDATE purchase_orders SET deleted_at = now() WHERE id = '2027c900-0000-4000-8000-0000000000c1';
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B9 linha invisível; ' ELSE 'B9 soft-delete direto de purchase_orders passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('use Eliminar ou Restaurar' IN SQLERRM) = 0 THEN f := f || format('B9 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B9 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B10 mudar a organização de um armazém
    BEGIN
      UPDATE warehouses SET organization_id = v_org2 WHERE id = '2027c900-0000-4000-8000-0000000000a5';
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B10 linha invisível; ' ELSE 'B10 mudar organization_id de warehouses passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('de organiza' IN SQLERRM) = 0 THEN f := f || format('B10 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B10 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    -- B11 mudar a organização de uma encomenda
    BEGIN
      UPDATE purchase_orders SET organization_id = v_org2 WHERE id = '2027c900-0000-4000-8000-0000000000c2';
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'B11 linha invisível; ' ELSE 'B11 mudar organization_id de purchase_orders passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('de organiza' IN SQLERRM) = 0 THEN f := f || format('B11 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('B11 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
  EXCEPTION WHEN OTHERS THEN f := f || format('B bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── Fase 2: dar .delete (como postgres) ─────────────────────────────────────────────────────────────────────────────────
DO $fx$
DECLARE f text := '';
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
    SELECT current_setting('teste.rol')::uuid, c, NULL::uuid
    FROM unnest(ARRAY['warehouses.delete', 'suppliers.delete', 'purchase_orders.delete', 'inventory.delete']) c
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE fase 2 falhou: %s %s; ', SQLSTATE, SQLERRM);
    PERFORM set_config('teste.ok', 'nao', true);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── Fase 2: C. eliminar e restaurar pelas RPCs; reposição direta recusada ───────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE f text := ''; n bigint; v_del timestamptz; v_s8 uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  BEGIN
    -- C1-C3 armazém W2
    BEGIN
      PERFORM public.rpc_delete_warehouse('2027c900-0000-4000-8000-0000000000a2');
      SELECT deleted_at INTO v_del FROM warehouses WHERE id = '2027c900-0000-4000-8000-0000000000a2';
      IF v_del IS NULL THEN f := f || 'C1 rpc_delete_warehouse não apagou; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('C1 rpc_delete_warehouse falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      UPDATE warehouses SET deleted_at = NULL, deleted_by = NULL WHERE id = '2027c900-0000-4000-8000-0000000000a2';
      GET DIAGNOSTICS n = ROW_COUNT;
      f := f || CASE WHEN n = 0 THEN 'C2 linha invisível; ' ELSE 'C2 reposição direta de warehouses passou; ' END;
    EXCEPTION WHEN insufficient_privilege THEN
                IF position('use Eliminar ou Restaurar' IN SQLERRM) = 0 THEN f := f || format('C2 recusado por outra razão: %s; ', SQLERRM); END IF;
              WHEN OTHERS THEN f := f || format('C2 erro inesperado %s %s; ', SQLSTATE, SQLERRM);
    END;
    BEGIN
      PERFORM public.rpc_restore_warehouse('2027c900-0000-4000-8000-0000000000a2');
      SELECT deleted_at INTO v_del FROM warehouses WHERE id = '2027c900-0000-4000-8000-0000000000a2';
      IF v_del IS NOT NULL THEN f := f || 'C3 rpc_restore_warehouse não repôs; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('C3 rpc_restore_warehouse falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- C4 fornecedor S1
    BEGIN
      PERFORM public.rpc_delete_supplier('2027c900-0000-4000-8000-0000000000b1');
      SELECT deleted_at INTO v_del FROM suppliers WHERE id = '2027c900-0000-4000-8000-0000000000b1';
      IF v_del IS NULL THEN f := f || 'C4 rpc_delete_supplier não apagou; '; END IF;
      PERFORM public.rpc_restore_supplier('2027c900-0000-4000-8000-0000000000b1');
      SELECT deleted_at INTO v_del FROM suppliers WHERE id = '2027c900-0000-4000-8000-0000000000b1';
      IF v_del IS NOT NULL THEN f := f || 'C4 rpc_restore_supplier não repôs; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('C4 eliminar/restaurar fornecedor falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- C5 encomenda P1
    BEGIN
      PERFORM public.rpc_delete_purchase_order('2027c900-0000-4000-8000-0000000000c1');
      SELECT deleted_at INTO v_del FROM purchase_orders WHERE id = '2027c900-0000-4000-8000-0000000000c1';
      IF v_del IS NULL THEN f := f || 'C5 rpc_delete_purchase_order não apagou; '; END IF;
      PERFORM public.rpc_restore_purchase_order('2027c900-0000-4000-8000-0000000000c1');
      SELECT deleted_at INTO v_del FROM purchase_orders WHERE id = '2027c900-0000-4000-8000-0000000000c1';
      IF v_del IS NOT NULL THEN f := f || 'C5 rpc_restore_purchase_order não repôs; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('C5 eliminar/restaurar encomenda falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;

    -- C6 linha de stock em W8 (a 0)
    BEGIN
      SELECT id INTO v_s8 FROM stocks
      WHERE product_id = current_setting('teste.p')::uuid AND warehouse_id = '2027c900-0000-4000-8000-0000000000a8';
      PERFORM public.rpc_delete_stock(v_s8);
      SELECT deleted_at INTO v_del FROM stocks WHERE id = v_s8;
      IF v_del IS NULL THEN f := f || 'C6 rpc_delete_stock não apagou; '; END IF;
      PERFORM public.rpc_restore_stock(v_s8);
      SELECT deleted_at INTO v_del FROM stocks WHERE id = v_s8;
      IF v_del IS NOT NULL THEN f := f || 'C6 rpc_restore_stock não repôs; '; END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('C6 eliminar/restaurar stock falhou: %s %s; ', SQLSTATE, SQLERRM);
    END;
  EXCEPTION WHEN OTHERS THEN f := f || format('C bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── D, E. Saldos e catálogo (como postgres) ─────────────────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  f text := ''; v_p uuid; rec record;
BEGIN
  BEGIN
    IF current_setting('teste.ok') = 'sim' THEN
      v_p := current_setting('teste.p')::uuid;
      -- D: cada linha tocada bate com a soma dos movimentos, e com o esperado
      FOR rec IN
        SELECT e.wh, e.qtd_esperada, e.mov_esperados, s.quantity,
               (SELECT coalesce(sum(CASE WHEN m.movement_type IN ('entrada', 'transferencia_entrada', 'ajuste_positivo', 'estorno_venda')
                                         THEN m.quantity ELSE -m.quantity END), 0)::integer
                FROM stock_movements m WHERE m.product_id = v_p AND m.warehouse_id = e.wh) AS soma,
               (SELECT count(*)::integer FROM stock_movements m WHERE m.product_id = v_p AND m.warehouse_id = e.wh) AS n_mov
        FROM (VALUES ('2027c900-0000-4000-8000-0000000000a1'::uuid, 3, 4),   -- entrada 3, +2, -1, transf. -1
                     ('2027c900-0000-4000-8000-0000000000a2'::uuid, 1, 1))   -- transf. +1
             AS e(wh, qtd_esperada, mov_esperados)
        LEFT JOIN stocks s ON s.product_id = v_p AND s.warehouse_id = e.wh
      LOOP
        IF rec.quantity IS DISTINCT FROM rec.soma OR rec.quantity IS DISTINCT FROM rec.qtd_esperada
           OR rec.n_mov <> rec.mov_esperados THEN
          f := f || format('D armazém %s: saldo %s, soma dos movimentos %s, %s movimentos (esperado %s com %s); ',
                           rec.wh, rec.quantity, rec.soma, rec.n_mov, rec.qtd_esperada, rec.mov_esperados);
        END IF;
      END LOOP;
      IF (SELECT organization_id FROM warehouses WHERE id = '2027c900-0000-4000-8000-0000000000a5') <> current_setting('teste.org')::uuid
         OR (SELECT organization_id FROM purchase_orders WHERE id = '2027c900-0000-4000-8000-0000000000c2') <> current_setting('teste.org')::uuid THEN
        f := f || 'D um armazém ou encomenda mudou de organização; ';
      END IF;
      IF (SELECT deleted_at FROM warehouses WHERE id = '2027c900-0000-4000-8000-0000000000a1') IS NOT NULL
         OR (SELECT deleted_at FROM suppliers WHERE id = '2027c900-0000-4000-8000-0000000000b1') IS NOT NULL
         OR (SELECT deleted_at FROM purchase_orders WHERE id = '2027c900-0000-4000-8000-0000000000c1') IS NOT NULL
         OR (SELECT deleted_at FROM stocks WHERE id = nullif(current_setting('teste.s1', true), '')::uuid) IS NOT NULL THEN
        f := f || 'D ficou apagada uma linha que só devia mudar pelas RPCs; ';
      END IF;
      IF (SELECT deleted_at FROM stocks WHERE product_id = v_p AND warehouse_id = '2027c900-0000-4000-8000-0000000000a7') IS NULL THEN
        f := f || 'D desligar W7 no Catálogo não apagou a linha; ';
      END IF;
    END IF;

    -- E: catálogo
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgenabled::text = 'O' AND NOT p.prosecdef
          AND ((t.tgrelid = 'public.stocks'::regclass          AND t.tgname::text = 'trg_stocks_00_guarda_escrita_direta')
            OR (t.tgrelid = 'public.warehouses'::regclass      AND t.tgname::text = 'trg_warehouses_00_guarda_apagar')
            OR (t.tgrelid = 'public.suppliers'::regclass       AND t.tgname::text = 'trg_suppliers_00_guarda_apagar')
            OR (t.tgrelid = 'public.purchase_orders'::regclass AND t.tgname::text = 'trg_purchase_orders_03_guarda_apagar'))) <> 4 THEN
      f := f || 'E os 4 gatilhos não estão todos ativos e INVOKER; ';
    END IF;
    IF to_regprocedure('public.fn_stocks_destino_da_organizacao(uuid,uuid,uuid)') IS NULL
       OR has_function_privilege('anon', 'public.fn_stocks_destino_da_organizacao(uuid,uuid,uuid)', 'EXECUTE') THEN
      f := f || 'E auxiliar fn_stocks_destino_da_organizacao em falta ou com EXECUTE para anon; ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'stock_movements'
                     AND p.policyname = 'stock_movements_insert_policy' AND p.with_check::text = 'false') THEN
      f := f || 'E stock_movements_insert_policy não é WITH CHECK (false); ';
    END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('D/E bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: integridade do inventário — A (7), B (11 recusas), C (6), D (saldos) e E (catálogo)'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
