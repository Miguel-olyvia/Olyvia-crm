-- ============================================================
-- 20270108540000_importar_aceita_permissao_importar
-- ============================================================
-- Só permissões (P2 da auditoria de 05/11/2026, problema 4 do grupo C).
-- Os botões «Importar» pedem inventory.import / warehouses.import / suppliers.import / purchase_orders.import, mas o
-- servidor só aceitava a permissão de criar (e editar no stock). Passa a aceitar TAMBÉM a de importar onde o ecrã a
-- usa; a de criar continua a valer (ninguém perde acesso):
--   · stocks INSERT (linhas novas da importação): inventory.create OU (inventory.import E a linha nasce a 0, sem custo
--     médio e viva) — é assim que a importação as cria; a quantidade entra a seguir por rpc_adjust_stock.
--   · rpc_adjust_stock: inventory.edit OU (inventory.import E motivo 'Importação CSV'), o motivo que a importação usa.
--     Fica registado como movimento de ajuste, como hoje.
--   · warehouses INSERT: warehouses.create OU warehouses.import.
--   · suppliers INSERT: suppliers.create OU suppliers.import.
--   · rpc_import_purchase_orders_csv: purchase_orders.create OU purchase_orders.import.
-- NÃO se abre o UPDATE direto de stocks a inventory.import (deixaria mudar a quantidade sem movimento): numa linha que
-- já existe, mudar só as definições (mín./máx./ponto/localização) pela importação continua a pedir inventory.edit.
-- Parte das definições VIVAS, já com o Lote B (20270108200000-260000: a permissão conta na organização da linha); o ramo
-- novo de importar também é por organização (has_anew_permission_for_org). Se alguma mudou entretanto, a migração pára.
-- rpc_import_purchase_orders_csv ainda tinha a verificação global: passa a verificar create OU import na organização de cada PO.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stocks' AND policyname = 'stocks_insert_policy';
  IF v_md5 IS DISTINCT FROM '7e7bbb343dc605839ecbddf5befb30f3' THEN
    RAISE EXCEPTION 'stocks_insert_policy mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'warehouses' AND policyname = 'warehouses_insert_policy';
  IF v_md5 IS DISTINCT FROM 'a59ae7e338048e4899f43f86c9d488a7' THEN
    RAISE EXCEPTION 'warehouses_insert_policy mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'suppliers_insert_policy';
  IF v_md5 IS DISTINCT FROM '9846a09e29f7b9c5f0e583ca28da3160' THEN
    RAISE EXCEPTION 'suppliers_insert_policy mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.rpc_adjust_stock(uuid,uuid,integer,text,text,text)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '4a91d1659c953bb295b7234b3b4d0f74' THEN
    RAISE EXCEPTION 'rpc_adjust_stock mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.rpc_import_purchase_orders_csv(jsonb)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM 'f39996b09839e969449935048facaf62' THEN
    RAISE EXCEPTION 'rpc_import_purchase_orders_csv mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
END
$guarda$;

ALTER POLICY stocks_insert_policy ON public.stocks
  WITH CHECK (
    (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.create'::text) AS get_user_permission_org_ids))
         OR (has_anew_permission_for_org(( SELECT auth.uid() AS uid), 'inventory.import'::text, organization_id)
             AND quantity = 0 AND average_cost IS NULL AND deleted_at IS NULL))
  );

ALTER POLICY warehouses_insert_policy ON public.warehouses
  WITH CHECK (
    (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'warehouses.create'::text) AS get_user_permission_org_ids))
         OR (has_anew_permission_for_org(( SELECT auth.uid() AS uid), 'warehouses.import'::text, organization_id)))
  );

ALTER POLICY suppliers_insert_policy ON public.suppliers
  WITH CHECK (
    (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.create'::text) AS get_user_permission_org_ids))
         OR (has_anew_permission_for_org(( SELECT auth.uid() AS uid), 'suppliers.import'::text, organization_id)))
  );

CREATE OR REPLACE FUNCTION public.rpc_adjust_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_direction text, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_direction NOT IN ('positivo', 'negativo') THEN
    RAISE EXCEPTION 'Direção do ajuste tem de ser ''positivo'' ou ''negativo''' USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo do ajuste é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270108540000: a importação de stocks (Stocks.tsx, motivo 'Importação CSV') aceita também inventory.import (na organização do stock).
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
             OR (public.has_anew_permission_for_org(auth.uid(), 'inventory.import', v_org) AND p_reason = 'Importação CSV')) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'ajuste_' || p_direction, p_qty,
    v_doc, 'ajuste', p_reason, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_import_purchase_orders_csv(p_orders jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor    uuid;
  v_row      jsonb;
  v_order    public.purchase_orders;
  v_org_id   uuid;
  v_count    integer := 0;
  v_new      jsonb;
  v_diff     jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
    RAISE EXCEPTION 'Sem encomendas válidas para importar' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS, predicate (2) ───
  -- The import is INSERT INTO purchase_orders; that policy checks 'purchase_orders.create'
  -- (no 'purchase_orders.import' predicate exists in the DB). Checked once up front so the
  -- whole batch fails before any write if the caller lacks the create permission.
  -- 20270108540000: aceita também purchase_orders.import (a permissão que o ecrã pede para o botão Importar). Aqui só a
  -- verificação rápida (alguma das duas); a de cada linha, por organização, está no ciclo.
  IF NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.create')
          OR public.has_anew_permission(auth.uid(), 'purchase_orders.import')) THEN
    RAISE EXCEPTION 'Sem permissão para importar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_orders)
  LOOP
    v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;

    -- ── Authorization parity: each PO's org must be in the caller's scope ────
    IF v_org_id IS NULL OR NOT public.fn_deal_org_in_scope(v_org_id) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 20270108540000: create OU import na organização da PO (Lote B: a permissão conta na organização da linha).
    IF NOT (public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.create', v_org_id)
            OR public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.import', v_org_id)) THEN
      RAISE EXCEPTION 'Sem permissão para importar encomendas de compra nesta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── INSERT the imported PO (mirrors parsePurchaseOrdersCSV output) ───────
    -- order_number comes from the CSV (values[0]); it is required and non-empty
    -- there, so it is inserted as-is rather than auto-generated.
    INSERT INTO public.purchase_orders (
      order_number, supplier_id, order_date, expected_delivery, status,
      total_value, notes, organization_id, created_by
    )
    VALUES (
      v_row ->> 'order_number',
      nullif(v_row ->> 'supplier_id', '')::uuid,
      (v_row ->> 'order_date')::date,
      nullif(v_row ->> 'expected_delivery', '')::date,
      COALESCE(nullif(v_row ->> 'status', ''), 'pending'),
      COALESCE((v_row ->> 'total_value')::numeric, 0),
      nullif(v_row ->> 'notes', ''),
      v_org_id,
      -- created_by is ALWAYS the authenticated caller (v_actor), never a value taken
      -- from the payload — matching every other RPC in the codebase (rpc_create_purchase_order,
      -- rpc_update_purchase_order, products/roles RPCs). Trusting v_row->>'created_by' would let
      -- an authenticated caller forge the author of imported POs, breaking audit traceability.
      -- The FE (parsePurchaseOrdersCSV) already always passes its own businessUserId, so this is
      -- behavior-preserving via the UI while closing the direct-call forgery gap.
      v_actor
    )
    RETURNING * INTO v_order;

    -- ── One INSERT audit row per imported PO (source 'csv_import') ───────────
    v_new := to_jsonb(v_order);
    v_diff := jsonb_build_object(
      'purchase_orders', jsonb_build_object(
        'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
        'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
        'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
        'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
        'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
        'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
        'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
        'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id')
      )
    );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'csv_import'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
