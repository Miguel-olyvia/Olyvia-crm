-- ============================================================
-- Testes: 20270124000000_embalagens_fator_decimal.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK, como postgres, na organização com mais produtos: cria
-- unidades próprias (prefixo T124), 2 produtos e 1 fornecedor de teste. Sem DDL. Cada bloco apanha os seus erros, junta-os em
-- teste.falhas e o resultado sai no SELECT final (o ROLLBACK corre sempre).
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/embalagens_fator_decimal.test.sql
--
-- Cobre:
--   A. uom: caixa de 1,44 numa base que se mede passa; 1,5 numa base contável (un) é recusado; fator 1 é recusado; PK100 continua
--   B. fn_uom_fator: 1,44 exato; 100 no PK100; 1 sem unidade; incompatível dá o mesmo erro de fn_uom_units_per
--   C. fn_uom_units_per: recusa a caixa decimal (em vez de 1) e continua a dar 100 no PK100
--   D. item_suppliers: a ligação preferida na caixa de 1,44 grava-se
--   E. catálogo: as trocas de fn_client_order_request_missing estão lá; ceil(21,34 / 1,44) = 15 caixas = 21,60 m²
-- Não cobre o pedido ao fornecedor de ponta a ponta (precisa de uma encomenda de cliente emitida, que o fluxo do negócio só emite com
-- contrato, pagamento, medidas e plano); fica para o teste no browser.
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true);

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org uuid; v_act uuid; v_un uuid; f text := '';
  m2 uuid := '12400000-0000-4000-8000-0000000000a1';
  cx uuid := '12400000-0000-4000-8000-0000000000a2';  -- caixa de 1,44 m²
  pk uuid := '12400000-0000-4000-8000-0000000000a3';  -- PK100 de un
  kg uuid := '12400000-0000-4000-8000-0000000000a4';  -- outra base que se mede
  p_m2 uuid := '12400000-0000-4000-8000-0000000000b1';
  p_un uuid := '12400000-0000-4000-8000-0000000000b2';
  s uuid := '12400000-0000-4000-8000-0000000000c1';
BEGIN
  BEGIN
    SELECT organization_id INTO v_org FROM products WHERE NOT is_deleted GROUP BY organization_id ORDER BY count(*) DESC LIMIT 1;
    IF v_org IS NULL THEN RAISE EXCEPTION 'base sem produtos'; END IF;
    SELECT id INTO v_act FROM anew_users WHERE auth_user_id IS NOT NULL ORDER BY created_at NULLS LAST, id LIMIT 1;
    SELECT id INTO v_un FROM uom WHERE organization_id IS NULL AND lower(btrim(code)) = 'un' LIMIT 1;
    IF v_un IS NULL THEN
      v_un := '12400000-0000-4000-8000-0000000000a5';
      INSERT INTO uom (id, code, description, organization_id) VALUES (v_un, 'un', 'Teste 124 unidade', v_org);
    END IF;
    INSERT INTO uom (id, code, description, organization_id) VALUES
      (m2, 'T124M2', 'Teste 124 metro quadrado', v_org), (kg, 'T124KG', 'Teste 124 quilo', v_org);
    INSERT INTO uom (id, code, description, organization_id, base_uom_id, conversion_factor) VALUES
      (cx, 'T124CX', 'Teste 124 caixa de 1,44 m²', v_org, m2, 1.44), (pk, 'T124PK100', 'Teste 124 pacote de 100', v_org, v_un, 100);
    INSERT INTO products (id, sku, name, created_by, organization_id, manages_stock, uom_id) VALUES
      (p_m2, 'TESTE-124-M2', 'Teste 124 revestimento', v_act, v_org, true, m2),
      (p_un, 'TESTE-124-UN', 'Teste 124 parafuso', v_act, v_org, true, v_un);
    INSERT INTO suppliers (id, name, created_by, organization_id) VALUES (s, 'Teste 124 fornecedor', v_act, v_org);
    PERFORM set_config('teste.org', v_org::text, true);
    PERFORM set_config('teste.act', v_act::text, true);
    PERFORM set_config('teste.un', v_un::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── A, B, C, D ──────────────────────────────────────────────────────────────
DO $t$
DECLARE
  f text := ''; v numeric; i integer;
  v_org uuid := nullif(current_setting('teste.org', true), '')::uuid;
  v_un uuid := nullif(current_setting('teste.un', true), '')::uuid;
  m2 uuid := '12400000-0000-4000-8000-0000000000a1';
  cx uuid := '12400000-0000-4000-8000-0000000000a2';
  pk uuid := '12400000-0000-4000-8000-0000000000a3';
  kg uuid := '12400000-0000-4000-8000-0000000000a4';
  p_m2 uuid := '12400000-0000-4000-8000-0000000000b1';
  p_un uuid := '12400000-0000-4000-8000-0000000000b2';
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  -- A
  BEGIN
    INSERT INTO uom (code, description, organization_id, base_uom_id, conversion_factor) VALUES ('T124CXUN', 'Teste 124 caixa de 1,5 un', v_org, v_un, 1.5);
    f := f || 'A1 aceitou 1,5 numa base contável; ';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%unidade que se conta%' THEN f := f || 'A1 recusou com outra mensagem: ' || SQLERRM || '; '; END IF;
  END;
  BEGIN
    INSERT INTO uom (code, description, organization_id, base_uom_id, conversion_factor) VALUES ('T124UM', 'Teste 124 fator 1', v_org, m2, 1);
    f := f || 'A2 aceitou fator 1; ';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO uom (code, description, organization_id, base_uom_id, conversion_factor) VALUES ('T124MEIO', 'Teste 124 caixa de 0,5 kg', v_org, kg, 0.5);
  EXCEPTION WHEN OTHERS THEN f := f || 'A3 recusou 0,5 kg numa base que se mede: ' || SQLERRM || '; ';
  END;
  -- B
  BEGIN
    v := public.fn_uom_fator(cx, p_m2);
    IF v IS DISTINCT FROM 1.44 THEN f := f || format('B1 fn_uom_fator(caixa) = %s (esperado 1,44); ', v); END IF;
    v := public.fn_uom_fator(pk, p_un);
    IF v IS DISTINCT FROM 100 THEN f := f || format('B2 fn_uom_fator(PK100) = %s; ', v); END IF;
    v := public.fn_uom_fator(NULL, p_m2);
    IF v IS DISTINCT FROM 1 THEN f := f || format('B3 fn_uom_fator(NULL) = %s; ', v); END IF;
  EXCEPTION WHEN OTHERS THEN f := f || 'B1-3 erro: ' || SQLERRM || '; ';
  END;
  BEGIN
    v := public.fn_uom_fator(cx, p_un);
    f := f || 'B4 caixa de m² num produto à unidade passou; ';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Unidade incompatível%' THEN f := f || 'B4 outra mensagem: ' || SQLERRM || '; '; END IF;
  END;
  -- C
  BEGIN
    i := public.fn_uom_units_per(cx, p_m2);
    f := f || format('C1 fn_uom_units_per(caixa decimal) devolveu %s em vez de recusar; ', i);
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%fator decimal%' THEN f := f || 'C1 outra mensagem: ' || SQLERRM || '; '; END IF;
  END;
  BEGIN
    i := public.fn_uom_units_per(pk, p_un);
    IF i <> 100 THEN f := f || format('C2 fn_uom_units_per(PK100) = %s; ', i); END IF;
  EXCEPTION WHEN OTHERS THEN f := f || 'C2 erro: ' || SQLERRM || '; ';
  END;
  -- D
  BEGIN
    INSERT INTO item_suppliers (organization_id, item_type, supplier_id, created_by, product_id, is_preferred, is_active, purchase_price, uom_id)
    VALUES (v_org, 'product', '12400000-0000-4000-8000-0000000000c1', current_setting('teste.act')::uuid, p_m2, true, true, 30, cx);
  EXCEPTION WHEN OTHERS THEN f := f || 'D1 a ligação na caixa de 1,44 não se gravou: ' || SQLERRM || '; ';
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

-- ─── E. catálogo ─────────────────────────────────────────────────────────────
DO $t$
DECLARE f text := ''; d text := pg_get_functiondef('public.fn_client_order_request_missing(uuid,uuid,uuid[])'::regprocedure);
BEGIN
  IF position('public.fn_uom_fator(v_link_uom, v_line.product_id)' IN d) = 0 THEN f := f || 'E1 o pedido não usa fn_uom_fator; '; END IF;
  IF position('v_link_units          numeric;' IN d) = 0 THEN f := f || 'E2 v_link_units não é numeric; '; END IF;
  IF position('ceil(v_qty_int * v_link_units * 100) / 100' IN d) = 0 THEN f := f || 'E3 falta a linha em m² das caixas inteiras; '; END IF;
  IF ceil(21.34 / 1.44) <> 15 OR ceil(15 * 1.44 * 100) / 100 <> 21.60 THEN f := f || 'E4 a conta das caixas não dá 15 = 21,60; '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.uom'::regclass AND tgname = 'trg_uom_zz_fator_decimal' AND tgenabled = 'O') THEN
    f := f || 'E5 gatilho trg_uom_zz_fator_decimal em falta; ';
  END IF;
  IF has_function_privilege('anon', 'public.fn_uom_fator(uuid,uuid)', 'EXECUTE') THEN f := f || 'E6 fn_uom_fator aberta a anon; '; END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: embalagens com fator decimal — A (3), B (4), C (2), D (1) e E (catálogo)'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
