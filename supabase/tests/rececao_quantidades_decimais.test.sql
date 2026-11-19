-- ============================================================
-- Testes: 20270124020000_rececao_quantidades_decimais.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar 20270124000000 e 20270124020000. Tudo dentro de BEGIN … ROLLBACK. Sem DDL. Fixtures como postgres na
-- organização com mais produtos: unidades T1242, 2 produtos (um em m², um à unidade), 1 armazém. O utilizador é um membro ativo da
-- organização (não system admin) e recebe receiving.receive, purchase_orders.receive, inventory.edit e receiving.view só nesta
-- transação. Cada bloco apanha os seus erros e o resultado sai no SELECT final.
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/rececao_quantidades_decimais.test.sql
--
-- Cobre (rpc_receive_by_code em dry-run, sem encomendas a fornecedor em aberto):
--   A1. 2,5 de um produto em m² passa a verificação do inteiro e só pára no «em aberto» (Leste 2.5 …)
--   A2. 2,5 de um produto à unidade é recusado («A quantidade lida tem de ser um número inteiro»)
--   A3. 2,5 caixas (embalagem de m²) é recusado (uma caixa é inteira)
--   A4. 3 de um produto à unidade passa a verificação (pára no «em aberto»)
--   B.  rpc_receiving_lookup: integer_qty = false no produto em m² e true no produto à unidade
--   C.  catálogo: as trocas estão nas duas funções
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true);

DO $fx$
DECLARE
  v_org uuid; v_auth uuid; v_act uuid; v_un uuid; f text := '';
  m2 uuid := '12402000-0000-4000-8000-0000000000a1';
  cx uuid := '12402000-0000-4000-8000-0000000000a2';
  w  uuid := '12402000-0000-4000-8000-0000000000d1';
  p_m2 uuid := '12402000-0000-4000-8000-0000000000b1';
  p_un uuid := '12402000-0000-4000-8000-0000000000b2';
BEGIN
  BEGIN
    SELECT organization_id INTO v_org FROM products WHERE NOT is_deleted GROUP BY organization_id ORDER BY count(*) DESC LIMIT 1;
    SELECT u.auth_user_id, u.id INTO v_auth, v_act
    FROM anew_memberships am JOIN anew_users u ON u.id = am.user_id
    WHERE am.organization_id = v_org AND am.status = 'active' AND am.role_is_client IS NOT TRUE
      AND u.auth_user_id IS NOT NULL AND NOT public.is_system_admin_user(u.auth_user_id)
    ORDER BY am.created_at, am.id LIMIT 1;
    IF v_auth IS NULL THEN RAISE EXCEPTION 'sem membro ativo (não system admin) na organização %', v_org; END IF;
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
    SELECT am.role_id, c, NULL::uuid
    FROM anew_memberships am
    CROSS JOIN unnest(ARRAY['receiving.receive', 'receiving.view', 'purchase_orders.receive', 'purchase_orders.view', 'inventory.edit', 'inventory.view']) c
    WHERE am.user_id = v_act AND am.organization_id = v_org AND am.status = 'active'
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT id INTO v_un FROM uom WHERE organization_id IS NULL AND lower(btrim(code)) = 'un' LIMIT 1;
    IF v_un IS NULL THEN
      v_un := '12402000-0000-4000-8000-0000000000a5';
      INSERT INTO uom (id, code, description, organization_id) VALUES (v_un, 'un', 'Teste 1242 unidade', v_org);
    END IF;
    INSERT INTO uom (id, code, description, organization_id) VALUES (m2, 'T1242M2', 'Teste 1242 m²', v_org);
    INSERT INTO uom (id, code, description, organization_id, base_uom_id, conversion_factor) VALUES (cx, 'T1242CX', 'Teste 1242 caixa', v_org, m2, 2);
    INSERT INTO products (id, sku, name, created_by, organization_id, manages_stock, uom_id) VALUES
      (p_m2, 'TESTE-1242-M2', 'Teste 1242 revestimento', v_act, v_org, true, m2),
      (p_un, 'TESTE-1242-UN', 'Teste 1242 parafuso', v_act, v_org, true, v_un);
    INSERT INTO warehouses (id, name, code, is_active, created_by, organization_id) VALUES (w, 'Teste 1242 armazém', 'TESTE1242W', true, v_act, v_org);
    PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims', true), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; r jsonb; c jsonb;
  w  uuid := '12402000-0000-4000-8000-0000000000d1';
  cx uuid := '12402000-0000-4000-8000-0000000000a2';
  p_m2 uuid := '12402000-0000-4000-8000-0000000000b1';
  p_un uuid := '12402000-0000-4000-8000-0000000000b2';
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  -- A1
  BEGIN
    r := public.rpc_receive_by_code(gen_random_uuid(), w, p_m2, 2.5, NULL, NULL, NULL, NULL, true, NULL, false);
    f := f || 'A1 passou sem encomenda em aberto; ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%número inteiro%' THEN f := f || 'A1 recusou 2,5 m²: ' || SQLERRM || '; ';
    ELSIF SQLERRM NOT LIKE 'Leste %' THEN f := f || 'A1 outra mensagem: ' || SQLERRM || '; ';
    END IF;
  END;
  -- A2
  BEGIN
    r := public.rpc_receive_by_code(gen_random_uuid(), w, p_un, 2.5, NULL, NULL, NULL, NULL, true, NULL, false);
    f := f || 'A2 aceitou 2,5 de um produto à unidade; ';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'A quantidade lida tem de ser um número inteiro%' THEN f := f || 'A2 outra mensagem: ' || SQLERRM || '; '; END IF;
  END;
  -- A3
  BEGIN
    r := public.rpc_receive_by_code(gen_random_uuid(), w, p_m2, 2.5, cx, NULL, NULL, NULL, true, NULL, false);
    f := f || 'A3 aceitou 2,5 caixas; ';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'A quantidade lida tem de ser um número inteiro%' THEN f := f || 'A3 outra mensagem: ' || SQLERRM || '; '; END IF;
  END;
  -- A4
  BEGIN
    r := public.rpc_receive_by_code(gen_random_uuid(), w, p_un, 3, NULL, NULL, NULL, NULL, true, NULL, false);
    f := f || 'A4 passou sem encomenda em aberto; ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Leste %' THEN f := f || 'A4 outra mensagem: ' || SQLERRM || '; '; END IF;
  END;
  -- B
  BEGIN
    r := public.rpc_receiving_lookup(w, 'TESTE-1242-M2', NULL, NULL, false);
    SELECT x INTO c FROM jsonb_array_elements(coalesce(r->'candidates', '[]'::jsonb)) x WHERE x->>'product_id' = p_m2::text LIMIT 1;
    IF c IS NULL THEN f := f || 'B1 o produto em m² não apareceu na leitura; ';
    ELSIF (c->>'integer_qty')::boolean IS DISTINCT FROM false THEN f := f || 'B1 integer_qty do m² = ' || coalesce(c->>'integer_qty', 'NULL') || '; ';
    END IF;
    r := public.rpc_receiving_lookup(w, 'TESTE-1242-UN', NULL, NULL, false);
    c := NULL;
    SELECT x INTO c FROM jsonb_array_elements(coalesce(r->'candidates', '[]'::jsonb)) x WHERE x->>'product_id' = p_un::text LIMIT 1;
    IF c IS NULL THEN f := f || 'B2 o produto à unidade não apareceu na leitura; ';
    ELSIF (c->>'integer_qty')::boolean IS DISTINCT FROM true THEN f := f || 'B2 integer_qty da unidade = ' || coalesce(c->>'integer_qty', 'NULL') || '; ';
    END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('B erro: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

DO $t$
DECLARE f text := '';
BEGIN
  IF position('fn_product_requires_integer_qty(p_product_id)' IN
       pg_get_functiondef('public.rpc_receive_by_code(uuid,uuid,uuid,numeric,uuid,uuid,uuid,text,boolean,uuid,boolean)'::regprocedure)) = 0 THEN
    f := f || 'C1 rpc_receive_by_code sem a regra dos decimais; ';
  END IF;
  IF position('''integer_qty''' IN pg_get_functiondef('public.rpc_receiving_lookup(uuid,text,uuid,uuid,boolean)'::regprocedure)) = 0 THEN
    f := f || 'C2 rpc_receiving_lookup sem integer_qty; ';
  END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: receção com decimais — A (4), B (2) e C (catálogo)'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
