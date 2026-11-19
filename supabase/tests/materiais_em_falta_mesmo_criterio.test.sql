-- ============================================================
-- Testes: 20270124010000_materiais_em_falta_mesmo_criterio.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar 20270124000000 e 20270124010000. Tudo dentro de BEGIN … ROLLBACK. Sem DDL. Cada bloco apanha os seus erros,
-- junta-os em teste.falhas e o resultado sai no SELECT final.
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/materiais_em_falta_mesmo_criterio.test.sql
--
-- Cobre:
--   A. fn_client_order_line_request_block (como postgres, produtos de teste T124):
--      sem ligação → no_preferred_supplier; só ligação não preferida → no_preferred_supplier; preferida inativa → no_preferred_supplier;
--      preferida na unidade do produto → NULL; preferida na caixa de 1,44 m² → NULL; preferida numa unidade simples que deixou de
--      ser a do produto → incompatible_supplier_uom
--   B. com os dados reais da organização (as encomendas de cliente emitidas, como um utilizador com client_orders.view):
--      rpc_client_order_missing_causes.units_missing = units_missing da prontidão; units_requestable <= units_missing;
--      no documento, missing_units_total = units_requestable, can_request_missing = (units_requestable > 0), e cada linha em falta
--      traz request_block_reason = fn_client_order_line_request_block
--   C. rpc_client_order_missing_causes recusa quem não tem client_orders.view; a lista vazia não devolve nada
-- Sem encomendas emitidas na organização, B não tem casos (o resultado diz quantas viu).
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true), set_config('teste.b', '0', true);

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org uuid; v_act uuid; f text := '';
  m2 uuid := '12401000-0000-4000-8000-0000000000a1';
  cx uuid := '12401000-0000-4000-8000-0000000000a2';
  kg uuid := '12401000-0000-4000-8000-0000000000a4';
  p0 uuid := '12401000-0000-4000-8000-0000000000b0';  -- sem ligação
  p1 uuid := '12401000-0000-4000-8000-0000000000b1';  -- só ligação não preferida
  p2 uuid := '12401000-0000-4000-8000-0000000000b2';  -- preferida inativa
  p3 uuid := '12401000-0000-4000-8000-0000000000b3';  -- preferida na unidade do produto
  p4 uuid := '12401000-0000-4000-8000-0000000000b4';  -- preferida na caixa de 1,44 m²
  p5 uuid := '12401000-0000-4000-8000-0000000000b5';  -- preferida em kg, produto passou a m²
  s uuid := '12401000-0000-4000-8000-0000000000c1';
BEGIN
  BEGIN
    -- a organização com mais encomendas de cliente emitidas (senão, a com mais produtos)
    SELECT cc.organization_id INTO v_org FROM client_contracts cc
    WHERE cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado') AND public.fn_ec_emitida(cc.id)
    GROUP BY cc.organization_id ORDER BY count(*) DESC LIMIT 1;
    IF v_org IS NULL THEN
      SELECT organization_id INTO v_org FROM products WHERE NOT is_deleted GROUP BY organization_id ORDER BY count(*) DESC LIMIT 1;
    END IF;
    SELECT id INTO v_act FROM anew_users WHERE auth_user_id IS NOT NULL ORDER BY created_at NULLS LAST, id LIMIT 1;
    INSERT INTO uom (id, code, description, organization_id) VALUES
      (m2, 'T1241M2', 'Teste 1241 m²', v_org), (kg, 'T1241KG', 'Teste 1241 kg', v_org);
    INSERT INTO uom (id, code, description, organization_id, base_uom_id, conversion_factor) VALUES (cx, 'T1241CX', 'Teste 1241 caixa', v_org, m2, 1.44);
    INSERT INTO products (id, sku, name, created_by, organization_id, manages_stock, uom_id)
    SELECT x.id, 'TESTE-1241-' || x.n, 'Teste 1241 produto ' || x.n, v_act, v_org, true, x.u
    FROM (VALUES (p0, 0, m2), (p1, 1, m2), (p2, 2, m2), (p3, 3, m2), (p4, 4, m2), (p5, 5, NULL::uuid)) x(id, n, u);
    INSERT INTO suppliers (id, name, created_by, organization_id) VALUES (s, 'Teste 1241 fornecedor', v_act, v_org);
    INSERT INTO item_suppliers (organization_id, item_type, supplier_id, created_by, product_id, is_preferred, is_active, purchase_price, uom_id) VALUES
      (v_org, 'product', s, v_act, p1, false, true, 10, NULL),
      (v_org, 'product', s, v_act, p2, true, false, 10, NULL),
      (v_org, 'product', s, v_act, p3, true, true, 10, NULL),
      (v_org, 'product', s, v_act, p4, true, true, 30, cx),
      (v_org, 'product', s, v_act, p5, true, true, 10, kg);   -- produto sem unidade + unidade simples: aceite
    UPDATE products SET uom_id = m2 WHERE id = p5;             -- agora a ligação em kg não converte para m²
    PERFORM set_config('teste.org', v_org::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── A ───────────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  f text := ''; r record; v text;
  v_org uuid := nullif(current_setting('teste.org', true), '')::uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
      ('12401000-0000-4000-8000-0000000000b0'::uuid, 'no_preferred_supplier', 'A1 sem ligação'),
      ('12401000-0000-4000-8000-0000000000b1'::uuid, 'no_preferred_supplier', 'A2 só não preferida'),
      ('12401000-0000-4000-8000-0000000000b2'::uuid, 'no_preferred_supplier', 'A3 preferida inativa'),
      ('12401000-0000-4000-8000-0000000000b3'::uuid, NULL, 'A4 preferida na unidade do produto'),
      ('12401000-0000-4000-8000-0000000000b4'::uuid, NULL, 'A5 preferida na caixa de 1,44'),
      ('12401000-0000-4000-8000-0000000000b5'::uuid, 'incompatible_supplier_uom', 'A6 unidade incompatível')) x(p, esperado, caso) LOOP
    BEGIN
      v := public.fn_client_order_line_request_block(v_org, r.p);
      IF v IS DISTINCT FROM r.esperado THEN f := f || format('%s: deu %s (esperado %s); ', r.caso, coalesce(v, 'NULL'), coalesce(r.esperado, 'NULL')); END IF;
    EXCEPTION WHEN OTHERS THEN f := f || format('%s: erro %s; ', r.caso, SQLERRM);
    END;
  END LOOP;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

-- ─── B e C (como um utilizador com client_orders.view nesta organização) ─────
DO $fx$
DECLARE v_org uuid := nullif(current_setting('teste.org', true), '')::uuid; v_auth uuid; v_sem uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  SELECT u.auth_user_id INTO v_auth FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_for_org(u.auth_user_id, 'client_orders.view', v_org)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  SELECT u.auth_user_id INTO v_sem FROM anew_users u JOIN anew_memberships am ON am.user_id = u.id AND am.organization_id = v_org AND am.status = 'active'
  WHERE u.auth_user_id IS NOT NULL AND NOT public.has_anew_permission_for_org(u.auth_user_id, 'client_orders.view', v_org)
    AND NOT public.fn_neg_papel_permite(v_org, 'client_orders.view') AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  PERFORM set_config('teste.claims', CASE WHEN v_auth IS NULL THEN '' ELSE json_build_object('sub', v_auth, 'role', 'authenticated')::text END, true);
  PERFORM set_config('teste.claims_sem', CASE WHEN v_sem IS NULL THEN '' ELSE json_build_object('sub', v_sem, 'role', 'authenticated')::text END, true);
  IF v_auth IS NULL THEN
    PERFORM set_config('teste.falhas', current_setting('teste.falhas') || 'B sem utilizador com client_orders.view na organização; ', true);
  END IF;
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims', true), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; r record; doc jsonb; l jsonb; n integer := 0; ls jsonb := '[]'::jsonb;
  v_org uuid := nullif(current_setting('teste.org', true), '')::uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' OR coalesce(current_setting('teste.claims', true), '') = '' THEN RETURN; END IF;
  BEGIN
    IF EXISTS (SELECT 1 FROM public.rpc_client_order_missing_causes(v_org, ARRAY[]::uuid[])) THEN f := f || 'C2 a lista vazia devolveu linhas; '; END IF;
    FOR r IN
      SELECT c.contract_id, c.units_missing, c.units_requestable, rd.units_missing AS prontidao
      FROM public.rpc_client_order_missing_causes(v_org, ARRAY(
             SELECT cc.id FROM client_contracts cc
             WHERE cc.organization_id = v_org AND cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado') AND public.fn_ec_emitida(cc.id)
             ORDER BY cc.created_at DESC LIMIT 30)) c
      JOIN public.rpc_client_order_list_readiness(v_org, NULL) rd ON rd.contract_id = c.contract_id
    LOOP
      n := n + 1;
      IF r.units_missing <> r.prontidao THEN f := f || format('B1 %s: falta %s ≠ prontidão %s; ', r.contract_id, r.units_missing, r.prontidao); END IF;
      IF r.units_requestable > r.units_missing THEN f := f || format('B2 %s: pedível %s > falta %s; ', r.contract_id, r.units_requestable, r.units_missing); END IF;
      doc := public.rpc_get_client_order_document(r.contract_id);
      IF coalesce((doc->>'missing_units_total')::numeric, 0) <> r.units_requestable THEN
        f := f || format('B3 %s: documento %s ≠ pedível %s; ', r.contract_id, doc->>'missing_units_total', r.units_requestable);
      END IF;
      IF coalesce((doc->>'can_request_missing')::boolean, false) <> (r.units_requestable > 0) THEN
        f := f || format('B4 %s: can_request_missing %s com pedível %s; ', r.contract_id, doc->>'can_request_missing', r.units_requestable);
      END IF;
      -- as linhas em falta, para comparar com fn_client_order_line_request_block como postgres (authenticated não a pode chamar)
      FOR l IN SELECT * FROM jsonb_array_elements(coalesce(doc->'lines', '[]'::jsonb)) LOOP
        IF l->>'product_id' IS NOT NULL AND coalesce((l->>'qty_missing')::numeric, 0) > 0 THEN
          ls := ls || jsonb_build_object('c', r.contract_id, 'l', l->>'quote_line_id', 'p', l->>'product_id', 'r', l->'request_block_reason');
        END IF;
      END LOOP;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN f := f || format('B bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.b', n::text, true);
  PERFORM set_config('teste.linhas', ls::text, true);
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- B5 (como postgres): cada linha em falta traz a causa de fn_client_order_line_request_block
DO $t$
DECLARE f text := ''; l jsonb; v_org uuid := nullif(current_setting('teste.org', true), '')::uuid;
BEGIN
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(nullif(current_setting('teste.linhas', true), '')::jsonb, '[]'::jsonb)) LOOP
    IF (l->>'r') IS DISTINCT FROM public.fn_client_order_line_request_block(v_org, (l->>'p')::uuid) THEN
      f := f || format('B5 %s: a linha %s tem request_block_reason %s; ', l->>'c', l->>'l', coalesce(l->>'r', 'NULL'));
    END IF;
  END LOOP;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem', true), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE f text := ''; v_org uuid := nullif(current_setting('teste.org', true), '')::uuid;
BEGIN
  IF current_setting('teste.ok') <> 'sim' OR coalesce(current_setting('teste.claims_sem', true), '') = '' THEN RETURN; END IF;
  BEGIN
    PERFORM 1 FROM public.rpc_client_order_missing_causes(v_org, ARRAY[gen_random_uuid()]);
    f := f || 'C1 quem não tem client_orders.view leu a falta; ';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Sem permissão para ver encomendas%' THEN f := f || 'C1 outra recusa: ' || SQLERRM || '; '; END IF;
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: o mesmo critério para o que falta pedir — A (6), B (' || current_setting('teste.b') || ' encomendas emitidas) e C'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
