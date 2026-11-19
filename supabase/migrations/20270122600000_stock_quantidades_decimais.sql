-- 20270122600000: stock com quantidades decimais em unidades mensuráveis (m², ml, kg…).
--
-- Caso real: EC-2026-0024 tem 21,34 m² de revestimento reservados de um stock de 22; a saída tem de deixar
-- 0,66 em stock. As quantidades de stock eram integer e várias RPCs recusavam/saltavam decimais.
--
-- Regra única: public.fn_product_requires_integer_qty(produto) — true quando a unidade de stock do produto
-- (products.uom_id → uom.code) é contável (un, ea, pcs, box, pkg), igual a src/utils/quotes/integerQty.ts.
-- Produto sem unidade → false (decimais permitidos), como no frontend.
--
-- Todas as funções abaixo foram recriadas a partir da definição viva (pg_get_functiondef) do ramo RH; só
-- mudam os tipos das quantidades (integer/bigint → numeric) e as recusas de decimais, que passam a valer
-- apenas para unidades contáveis. Permissões, SECURITY DEFINER, search_path e GRANTs ficam iguais.

-- =====================================================================
-- 1. Regra: unidade contável → quantidade inteira
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_product_requires_integer_qty(p_product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT lower(btrim(u.code)) IN ('un', 'ea', 'pcs', 'box', 'pkg')
    FROM public.products p
    JOIN public.uom u ON u.id = p.uom_id
    WHERE p.id = p_product_id
  ), false);
$function$;

REVOKE ALL ON FUNCTION public.fn_product_requires_integer_qty(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_product_requires_integer_qty(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_product_requires_integer_qty(uuid) IS
  '20270122600000: true se a unidade de stock do produto (products.uom_id → uom.code) é contável (un, ea, pcs, box, pkg) e a quantidade tem de ser inteira. Sem unidade → false. Mesma regra de src/utils/quotes/integerQty.ts.';

-- =====================================================================
-- 2. Colunas de quantidade de stock → numeric(14,4)
--    A política de INSERT e o gatilho de guarda de stocks referem stocks.quantity e impedem o ALTER;
--    são removidos e recriados exatamente iguais.
-- =====================================================================
DROP POLICY stocks_insert_policy ON public.stocks;
DROP TRIGGER trg_stocks_00_guarda_escrita_direta ON public.stocks;

ALTER TABLE public.stocks
  ALTER COLUMN quantity         TYPE numeric(14,4),
  ALTER COLUMN minimum_quantity TYPE numeric(14,4),
  ALTER COLUMN maximum_quantity TYPE numeric(14,4),
  ALTER COLUMN reorder_point    TYPE numeric(14,4);

ALTER TABLE public.stock_movements
  ALTER COLUMN quantity      TYPE numeric(14,4),
  ALTER COLUMN balance_after TYPE numeric(14,4);

ALTER TABLE public.inventory_count_lines
  ALTER COLUMN system_quantity_at_start TYPE numeric(14,4),
  ALTER COLUMN counted_quantity         TYPE numeric(14,4);

ALTER TABLE public.fleet_restock_requests
  ALTER COLUMN quantity TYPE numeric(14,4);

CREATE POLICY stocks_insert_policy ON public.stocks
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.create'::text) AS get_user_permission_org_ids)) OR (has_anew_permission_for_org(( SELECT auth.uid() AS uid), 'inventory.import'::text, organization_id) AND (quantity = 0) AND (average_cost IS NULL) AND (deleted_at IS NULL))));

CREATE TRIGGER trg_stocks_00_guarda_escrita_direta BEFORE INSERT OR UPDATE OF quantity, average_cost, product_id, warehouse_id, organization_id, deleted_at, deleted_by ON public.stocks FOR EACH ROW EXECUTE FUNCTION fn_stocks_guarda_escrita_direta();

-- =====================================================================
-- 3. Assinatura muda (integer → numeric): DROP + CREATE com os mesmos GRANTs e comentários
-- =====================================================================
DROP FUNCTION public.rpc_adjust_stock(uuid, uuid, integer, text, text, text);
DROP FUNCTION public.rpc_register_stock_loss(uuid, uuid, integer, text, text);
DROP FUNCTION public.rpc_register_stock_entry(uuid, uuid, integer, uuid, numeric, text, text);
DROP FUNCTION public.rpc_register_supplier_return(uuid, uuid, integer, uuid, text);
DROP FUNCTION public.rpc_decrement_stock(uuid, uuid, integer, text, text, text, text, text, uuid);
DROP FUNCTION public.rpc_register_stock_transfer(uuid, uuid, uuid, integer, text);
DROP FUNCTION public.rpc_register_sale_stock_movement(uuid, uuid, integer, uuid, text, uuid, text, numeric, uuid);
DROP FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid);
DROP FUNCTION public.rpc_update_inventory_count_line_quantity(uuid, integer);
DROP FUNCTION public.rpc_stock_import_settings(uuid, integer, integer, integer, text);
DROP FUNCTION public.rpc_fleet_set_van_minimum(uuid, uuid, integer);

-- rpc_adjust_stock
CREATE OR REPLACE FUNCTION public.rpc_adjust_stock(p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_direction text, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result numeric;
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

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_qty) USING ERRCODE = 'check_violation';
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
REVOKE ALL ON FUNCTION public.rpc_adjust_stock(uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_stock(uuid, uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_stock(uuid, uuid, numeric, text, text, text) TO service_role;

-- rpc_register_stock_loss
CREATE OR REPLACE FUNCTION public.rpc_register_stock_loss(p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo da quebra é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_qty) USING ERRCODE = 'check_violation';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'quebra', p_qty,
    v_doc, 'ajuste', p_reason, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_register_stock_loss(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_loss(uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_loss(uuid, uuid, numeric, text, text) TO service_role;

-- rpc_register_stock_entry
CREATE OR REPLACE FUNCTION public.rpc_register_stock_entry(p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_item_supplier_id uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_price  numeric;
  v_sku    text;
  v_doc    text;
  v_result numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT purchase_price, supplier_sku INTO v_price, v_sku
  FROM public.item_suppliers
  WHERE id = p_item_supplier_id
    AND product_id = p_product_id
    AND organization_id = v_org
    AND is_active = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor inválido, inativo, ou não associado a este produto' USING ERRCODE = 'check_violation';
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_qty) USING ERRCODE = 'check_violation';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'compra');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, item_supplier_id, unit_cost_at_time,
    supplier_sku_at_time, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'entrada', p_qty,
    v_doc, 'compra', p_item_supplier_id, COALESCE(p_unit_cost, v_price),
    v_sku, p_counterparty, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_register_stock_entry(uuid, uuid, numeric, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_entry(uuid, uuid, numeric, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_entry(uuid, uuid, numeric, uuid, numeric, text, text) TO service_role;

-- rpc_register_supplier_return
CREATE OR REPLACE FUNCTION public.rpc_register_supplier_return(p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_item_supplier_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_result numeric;
  v_doc    text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ao contrário de rpc_register_stock_entry, não exige is_active: devolver a
  -- um fornecedor que entretanto ficou inativo continua a ser uma operação
  -- válida (é o histórico da compra original que importa, não o estado atual).
  IF NOT EXISTS (
    SELECT 1 FROM public.item_suppliers
    WHERE id = p_item_supplier_id AND product_id = p_product_id AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Fornecedor não associado a este produto' USING ERRCODE = 'check_violation';
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_qty) USING ERRCODE = 'check_violation';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'compra');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, item_supplier_id, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'devolucao_fornecedor', p_qty,
    v_doc, 'compra', p_item_supplier_id, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_register_supplier_return(uuid, uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_supplier_return(uuid, uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_supplier_return(uuid, uuid, numeric, uuid, text) TO service_role;

-- rpc_decrement_stock
CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_document_number text, p_document_type text, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_sale_source_type text DEFAULT NULL::text, p_sale_source_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result numeric;
  -- NOVO (20261205200000): guarda da saída ligada a Encomenda Cliente
  v_order_label  text;
  v_status       text;
  v_line_count   integer;
  v_needed       numeric;
  v_ordered      numeric;
  v_reserved     numeric;
  v_po_numbers   text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_sale_source_type IS NOT NULL AND p_sale_source_type NOT IN ('contract', 'proposal') THEN
    RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR (p_sale_source_type IS DISTINCT FROM 'contract'  -- 18/11 perm: saída ligada a EC verificada logo abaixo (inclui inventory.edit)
         AND NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: saída ligada a Encomenda Cliente pede as mesmas permissões que rpc_confirm_client_order_stock_exit
  -- (inventory.edit + client_orders.view + client_orders.confirm_stock_exit, na organização do stock).
  IF p_sale_source_type = 'contract' THEN
    PERFORM public.fn_exigir_permissoes(v_org,
      ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
      'confirmar saída de stock desta encomenda');
  END IF;

  -- Confirma que o contrato/proposta indicado é visível pelo utilizador e
  -- pertence à mesma organização — nunca confiar num id vindo do cliente sem
  -- validar o scope (mesmo princípio de segurança usado em
  -- rpc_get_client_order_document).
  IF p_sale_source_type = 'contract' AND p_sale_source_id IS NOT NULL THEN
    -- NOVO (20261205200000): lê também o número e o estado (era só EXISTS).
    SELECT COALESCE(cc.order_number, cc.contract_number), cc.status
      INTO v_order_label, v_status
    FROM public.client_contracts cc
    WHERE cc.id = p_sale_source_id
      AND cc.organization_id = v_org
      AND cc.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;

    -- NOVO (20261205200000): guarda — mesmas regras de
    -- rpc_confirm_client_order_stock_exit.
    IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
      RAISE EXCEPTION 'A encomenda % não está assinada — só é possível dar saída de stock para encomendas de cliente assinadas', v_order_label
        USING ERRCODE = 'check_violation';
    END IF;

    -- Lock por produto (mesma ordem que o confirm e
    -- fn_client_order_request_missing): serializa saídas concorrentes da
    -- mesma encomenda/produto. Dentro do confirm as linhas já estão trancadas.
    PERFORM 1
    FROM public.stocks s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.product_id = p_product_id
      AND w.organization_id = v_org
    ORDER BY s.product_id, s.warehouse_id
    FOR UPDATE OF s;

    -- 3. Já há saída/venda ativa (não estornada) deste produto nesta encomenda.
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_sale_source_id
        AND sm.product_id = p_product_id
        AND sm.movement_type IN ('venda', 'saida')
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    ) THEN
      RAISE EXCEPTION 'Este produto já teve saída de stock registada na encomenda % — estorne a saída anterior antes de registar outra', v_order_label
        USING ERRCODE = 'unique_violation';
    END IF;

    SELECT count(*),
           COALESCE(SUM(r.qty_needed), 0),
           COALESCE(SUM(r.qty_ordered), 0),
           COALESCE(SUM(r.qty_reserved), 0)
      INTO v_line_count, v_needed, v_ordered, v_reserved
    FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
    WHERE r.contract_id = p_sale_source_id;

    -- 1. O produto tem de estar numa linha da encomenda.
    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Este produto não faz parte da encomenda %', v_order_label
        USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Coberto por PO ligada ao contrato (recebida ou a caminho) — mesmo
    -- universo de POs que fn_client_order_line_reservations conta.
    IF v_ordered > 0 THEN
      SELECT string_agg(DISTINCT COALESCE(po.order_number, po.id::text), ', ')
        INTO v_po_numbers
      FROM public.purchase_orders po
      JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.source_type = 'contract'
        AND po.source_id = p_sale_source_id
        AND po.status IS DISTINCT FROM 'cancelled'
        AND po.deleted_at IS NULL
        AND poi.product_id = p_product_id;
    END IF;

    IF v_needed > 0 AND v_ordered >= v_needed THEN
      RAISE EXCEPTION 'Este produto da encomenda % já está coberto pela encomenda a fornecedor % (recebida ou a caminho) — não é possível dar também saída de stock',
        v_order_label, COALESCE(v_po_numbers, '—')
        USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Só se consome o stock reservado para esta encomenda.
    IF p_qty > v_reserved THEN
      IF v_ordered > 0 THEN
        RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto na encomenda % — o restante já está encomendado ao fornecedor (%) ou reservado para encomendas assinadas antes desta',
          trim_scale(GREATEST(v_reserved, 0)), v_order_label, COALESCE(v_po_numbers, '—')
          USING ERRCODE = 'check_violation';
      ELSIF v_reserved <= 0 THEN
        RAISE EXCEPTION 'Não há stock livre para a encomenda %: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.',
          v_order_label
          USING ERRCODE = 'check_violation';
      ELSE
        RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto na encomenda % — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
          trim_scale(v_reserved), v_order_label
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_qty) USING ERRCODE = 'check_violation';
  END IF;

  v_doc := COALESCE(p_document_number, public.fn_next_stock_document_number(v_org, p_document_type));

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by,
    sale_source_type, sale_source_id
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'saida', p_qty,
    v_doc, p_document_type, p_counterparty, p_notes, v_actor,
    p_sale_source_type, p_sale_source_id
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_decrement_stock(uuid, uuid, numeric, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_decrement_stock(uuid, uuid, numeric, text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_decrement_stock(uuid, uuid, numeric, text, text, text, text, text, uuid) TO service_role;
COMMENT ON FUNCTION public.rpc_decrement_stock(uuid, uuid, numeric, text, text, text, text, text, uuid) IS $cmt$Saída de stock (ledger). p_sale_source_type/p_sale_source_id (opcionais) ligam manualmente o movimento a uma Encomenda Cliente (client_contracts) como prova/rastreabilidade — usado pelo registo manual em StockMovementDialog.tsx (Fase 5.0F). Independente da dedução automática de stock (Fase 5.0B), que continua a inserir diretamente via fn_contract_stock_deduction(), não por este RPC.$cmt$;

-- rpc_register_stock_transfer
CREATE OR REPLACE FUNCTION public.rpc_register_stock_transfer(p_product_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_qty numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_source_cost numeric(12,4);
  v_group       uuid;
  v_doc         text;
  v_from_balance numeric;
  v_to_balance   numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Armazém de origem e destino têm de ser diferentes' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id, average_cost INTO v_org, v_source_cost
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto no armazém de origem' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- O armazém de destino tem de pertencer à mesma organização.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_to_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém de destino inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_qty) USING ERRCODE = 'check_violation';
  END IF;

  v_group := gen_random_uuid();
  v_doc := public.fn_next_stock_document_number(v_org, 'transferencia');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, transfer_group_id, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_from_warehouse_id, 'transferencia_saida', p_qty,
    v_doc, 'transferencia', v_group, p_notes, v_actor
  )
  RETURNING balance_after INTO v_from_balance;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, transfer_group_id, unit_cost_at_time, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_to_warehouse_id, 'transferencia_entrada', p_qty,
    v_doc, 'transferencia', v_group, v_source_cost, p_notes, v_actor
  )
  RETURNING balance_after INTO v_to_balance;

  RETURN jsonb_build_object(
    'document_number', v_doc,
    'transfer_group_id', v_group,
    'from_balance', v_from_balance,
    'to_balance', v_to_balance
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_register_stock_transfer(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_transfer(uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_transfer(uuid, uuid, uuid, numeric, text) TO service_role;

-- rpc_register_sale_stock_movement
CREATE OR REPLACE FUNCTION public.rpc_register_sale_stock_movement(p_product_id uuid, p_warehouse_id uuid, p_quantity numeric, p_quote_line_id uuid, p_sale_source_type text, p_sale_source_id uuid, p_document_number text, p_unit_cost_at_time numeric DEFAULT NULL::numeric, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_movement_id uuid;
  v_balance     numeric;
BEGIN
  IF p_sale_source_type NOT IN ('contract', 'proposal') THEN
    RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quote_line_id IS NULL OR p_sale_source_id IS NULL THEN
    RAISE EXCEPTION 'quote_line_id e sale_source_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  IF nullif(trim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'document_number é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261115060000): a organização não é deduzida do produto — é
  -- sempre a de quem está a vender (Contrato/Proposta), fornecida pelo
  -- chamador. products.organization_id pode ser NULL (produto partilhado via
  -- product_organizations) sem que isso seja um erro.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotência: uma linha de orçamento só gera 1 movimento de venda por
  --    origem — uma segunda chamada (ex. trigger disparada de novo por um
  --    UPDATE que não devia repetir o efeito) é ignorada, nunca duplica.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE sale_source_type = p_sale_source_type
      AND sale_source_id = p_sale_source_id
      AND reference_id = p_quote_line_id
      AND movement_type = 'venda'
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_registered');
  END IF;

  -- NOVO (20261115060000): validação de existência do produto isolada da
  -- resolução de organização (que já não depende do produto).
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261115060000): armazém validado contra p_organization_id (quem
  -- vende), não contra a organização do produto.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- ── created_by: este RPC não é chamado pelo frontend (ver GRANT abaixo),
  --    só por triggers internas da Fase 5.0B/5.0C que podem correr sem
  --    sessão de staff presente (ex. assinatura via portal do cliente).
  --    current_business_user_id() cobre o caso "staff assina no admin"; se
  --    NULL, cai para o criador do próprio orçamento (mesmo padrão de
  --    fallback já usado por client-portal-action/index.ts para ações sem
  --    staff presente). quotes.created_by é NOT NULL, por isso este
  --    fallback está sempre disponível quando p_quote_line_id é válido.
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    SELECT q.created_by INTO v_actor
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.id = p_quote_line_id;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o autor do movimento de venda' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_quantity) USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, unit_cost_at_time,
    sale_source_type, sale_source_id, reference_id, notes, created_by
  ) VALUES (
    p_organization_id, p_product_id, p_warehouse_id, 'venda', p_quantity,
    p_document_number, 'venda', p_unit_cost_at_time,
    p_sale_source_type, p_sale_source_id, p_quote_line_id,
    format('Venda registada a partir de %s %s (linha de orçamento %s)',
           p_sale_source_type, p_sale_source_id, p_quote_line_id),
    v_actor
  )
  RETURNING id, balance_after INTO v_movement_id, v_balance;

  RETURN jsonb_build_object(
    'skipped',         false,
    'movement_id',     v_movement_id,
    'balance_after',   v_balance,
    'was_insufficient', v_balance < 0
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_register_sale_stock_movement(uuid, uuid, numeric, uuid, text, uuid, text, numeric, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_sale_stock_movement(uuid, uuid, numeric, uuid, text, uuid, text, numeric, uuid) TO service_role;
COMMENT ON FUNCTION public.rpc_register_sale_stock_movement(uuid, uuid, numeric, uuid, text, uuid, text, numeric, uuid) IS $cmt$Fase 5.0A/5.0B: motor do movimento de venda (movement_type='venda'), nunca rejeitado por saldo insuficiente (fn_stock_movements_apply trata a exceção). Idempotente por (sale_source_type, sale_source_id, reference_id=quote_line_id). p_organization_id (20261115060000) é sempre a organização de quem vende (Contrato/Proposta), nunca deduzida de products.organization_id — corrige o bug em que um produto partilhado (products.organization_id NULL, via product_organizations) era tratado como "não encontrado". NÃO É CHAMÁVEL PELO FRONTEND nesta fase — só GRANT a service_role. Invocado por fn_contract_stock_deduction (Fase 5.0B) e, futuramente, pela Fase 5.0C (Proposta aceite).$cmt$;

-- rpc_confirm_client_order_stock_exit
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit(p_contract_id uuid, p_product_id uuid, p_quantity numeric, p_warehouse_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_balance_after   numeric;
  -- NOVO (20261204310000)
  v_reserved        numeric;
  v_line_count      integer;
  -- NOVO (20261204340000)
  v_wh_qty          numeric;
  -- NOVO (20261204620000): número da encomenda nas notas
  v_order_number    text;
  v_is_manual       boolean;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
  -- NOVO (serve clientes)
  v_wh_name         text;
  v_wh_active       boolean;
  v_wh_serves       boolean;
  v_wh_vehicle      boolean;  -- NOVO (EC por armazém)
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number,
         cc.order_number, COALESCE(cc.is_manual_order, false)  -- NOVO (20261204620000)
  INTO v_org, v_contract_number,
       v_order_number, v_is_manual
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261130080000): client_orders.confirm_stock_exit exigida
  -- ADICIONALMENTE a inventory.edit + client_orders.view (20261205000000).
  -- 18/11 perm: mesmas 3 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
    'confirmar saída de stock desta encomenda');

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_quantity) USING ERRCODE = 'check_violation';
  END IF;


  -- NOVO (serve clientes): só se dá saída para EC de um armazém ativo que
  -- serve clientes. Armazém inexistente/de outra org/apagado continua a cair
  -- na validação de quantidade mais abaixo, como antes.
  SELECT w.name, w.is_active, w.serves_customers, COALESCE(w.is_vehicle, false)
    INTO v_wh_name, v_wh_active, v_wh_serves, v_wh_vehicle
  FROM public.warehouses w
  WHERE w.id = p_warehouse_id
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF FOUND AND NOT COALESCE(v_wh_active, false) THEN
    RAISE EXCEPTION 'O armazém "%" está inativo — escolha outro armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  IF FOUND AND NOT COALESCE(v_wh_serves, false) THEN
    RAISE EXCEPTION 'O armazém "%" não serve encomendas de cliente — escolha outro armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (EC por armazém): o stock de viaturas não entra na reserva das EC.
  IF FOUND AND v_wh_vehicle THEN
    RAISE EXCEPTION 'O armazém "%" é uma viatura — a saída para encomendas de cliente é feita de um armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204310000): lock por produto (mesma ordem que
  -- fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  -- Guarda de idempotência: não duplicar a saída se já houver um movimento
  -- (automático ou manual) registado para este contrato/produto — mesma
  -- deteção usada em rpc_get_client_order_document para line_status =
  -- 'servido_por_stock'.
  -- NOVO (20261204290000): movimentos já estornados não contam — depois de
  -- estornar uma saída é possível confirmá-la de novo.
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = p_product_id
      AND sm.movement_type IN ('venda', 'saida')
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
  ) THEN
    RAISE EXCEPTION 'Este produto já teve saída de stock registada para esta encomenda' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204310000): só se pode consumir o stock reservado para esta
  -- encomenda (fila por ordem de assinatura).
  SELECT COALESCE(SUM(r.qty_reserved), 0), count(*)
    INTO v_reserved, v_line_count
  FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- NOVO (20261204340000): o armazém escolhido tem de ter a quantidade (as
  -- linhas de stocks deste produto já estão bloqueadas acima). Só conta stock
  -- ativo, de um armazém ativo da organização do contrato — o mesmo universo
  -- que a reserva por ordem usa.
  SELECT s.quantity
    INTO v_wh_qty
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND s.warehouse_id = p_warehouse_id
    AND s.deleted_at IS NULL
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF COALESCE(v_wh_qty, 0) < p_quantity THEN
    RAISE EXCEPTION 'O armazém escolhido só tem % un — escolha outro armazém',
      GREATEST(COALESCE(v_wh_qty, 0), 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204620000): notas com o número certo. Venda direta ANTES de
  -- manual (as de VD também têm is_manual_order); contrato real mantém o
  -- texto de antes. Só texto — nada acima nem abaixo muda.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Saída confirmada a partir da venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    WHEN v_is_manual THEN
      format('Saída confirmada a partir do documento de Encomenda Cliente %s',
             COALESCE(v_order_number, v_contract_number))
    ELSE
      format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number)
  END;

  v_balance_after := public.rpc_decrement_stock(
    p_product_id       => p_product_id,
    p_warehouse_id     => p_warehouse_id,
    p_qty              => p_quantity,
    p_document_number  => NULL,
    p_document_type    => 'venda',
    p_counterparty     => NULL,
    p_notes            => v_notes,  -- NOVO (20261204620000)
    p_sale_source_type => 'contract',
    p_sale_source_id   => p_contract_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, numeric, uuid) TO service_role;
COMMENT ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, numeric, uuid) IS $cmt$Wrapper fino (20261130070000) sobre rpc_decrement_stock para confirmar, a partir do checklist de uma Encomenda Cliente, a saída de stock de uma linha em estado stock_disponivel_confirmar num armazém escolhido. Não duplica a lógica da trigger fn_stock_movements_apply nem a de rpc_decrement_stock — apenas valida scope/permissões, aplica uma guarda de idempotência (não permite duplicar a saída para o mesmo contrato + produto) e delega a escrita do movimento. SECURITY DEFINER; exige inventory.edit e client_contracts.view; GRANT apenas a authenticated.$cmt$;

-- rpc_update_inventory_count_line_quantity
CREATE OR REPLACE FUNCTION public.rpc_update_inventory_count_line_quantity(p_line_id uuid, p_counted_quantity numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_org        uuid;
  v_status     text;
  v_product_id uuid;
  v_warehouse_id uuid;
  v_snapshot   numeric;
  v_live_qty   numeric;
  v_had_resolution boolean;
  v_moved      boolean;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade contada tem de ser um número não negativo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT ic.organization_id, ic.status, ic.warehouse_id,
         icl.product_id, icl.system_quantity_at_start,
         (icl.discrepancy_resolution IS NOT NULL)
  INTO v_org, v_status, v_warehouse_id, v_product_id, v_snapshot, v_had_resolution
  FROM public.inventory_count_lines icl
  JOIN public.inventory_counts ic ON ic.id = icl.inventory_count_id
  WHERE icl.id = p_line_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.count', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para contar inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(v_product_id) AND p_counted_quantity <> trunc(p_counted_quantity) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_counted_quantity) USING ERRCODE = 'check_violation';
  END IF;


  SELECT quantity INTO v_live_qty
  FROM public.stocks
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  v_moved := (COALESCE(v_live_qty, 0) IS DISTINCT FROM v_snapshot);

  -- D2: recontar uma linha já resolvida limpa a resolução anterior — evita
  -- que rpc_finalize_inventory_count aceite uma resolução desatualizada face
  -- ao novo valor contado.
  UPDATE public.inventory_count_lines
  SET counted_quantity   = p_counted_quantity,
      counted_by         = v_actor,
      counted_at         = now(),
      -- D3: cumulativo, nunca volta a false sozinho.
      moved_during_count = moved_during_count OR v_moved,
      discrepancy_resolution = CASE WHEN v_had_resolution THEN NULL ELSE discrepancy_resolution END,
      resolution_notes        = CASE WHEN v_had_resolution THEN NULL ELSE resolution_notes END,
      stock_movement_id       = CASE WHEN v_had_resolution THEN NULL ELSE stock_movement_id END
  WHERE id = p_line_id
  RETURNING moved_during_count INTO v_moved;

  RETURN jsonb_build_object(
    'id', p_line_id,
    'counted_quantity', p_counted_quantity,
    'system_quantity_at_start', v_snapshot,
    'moved_during_count', v_moved,
    'resolution_cleared', v_had_resolution
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_update_inventory_count_line_quantity(uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_inventory_count_line_quantity(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_inventory_count_line_quantity(uuid, numeric) TO service_role;
COMMENT ON FUNCTION public.rpc_update_inventory_count_line_quantity(uuid, numeric) IS $cmt$Regista a quantidade contada de uma linha (sem resolver diferenças). Marca moved_during_count=true (cumulativo) se o saldo ao vivo de stocks já divergir do snapshot original neste momento. Limpa qualquer resolução anterior da linha (decisão D2, ver cabeçalho da migration). Exige só inventory.count — resolver/finalizar continua a exigir inventory.edit.$cmt$;

-- rpc_stock_import_settings
CREATE OR REPLACE FUNCTION public.rpc_stock_import_settings(p_stock_id uuid, p_minimum_quantity numeric, p_maximum_quantity numeric, p_reorder_point numeric, p_location text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_actor   uuid;
  v_org     uuid;
  v_deleted timestamptz;
  v_product uuid;  -- 20270122600000
  v_loc     text := NULLIF(btrim(COALESCE(p_location, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_stock_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a linha de stock' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.organization_id, s.deleted_at, s.product_id INTO v_org, v_deleted, v_product
    FROM public.stocks s
   WHERE s.id = p_stock_id
   FOR UPDATE;

  IF v_org IS NULL OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Linha de stock não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (public.has_anew_permission_for_org(v_uid, 'inventory.edit', v_org)
             OR public.has_anew_permission_for_org(v_uid, 'inventory.import', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as definições de stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_minimum_quantity IS NULL OR p_maximum_quantity IS NULL OR p_reorder_point IS NULL
     OR p_minimum_quantity < 0 OR p_maximum_quantity < 0 OR p_reorder_point < 0 THEN
    RAISE EXCEPTION 'Mínimo, máximo e ponto de encomenda têm de ser números positivos' USING ERRCODE = 'check_violation';
  END IF;
  -- 20270122600000: decimais só em unidades mensuráveis.
  IF public.fn_product_requires_integer_qty(v_product)
     AND (p_minimum_quantity <> trunc(p_minimum_quantity) OR p_maximum_quantity <> trunc(p_maximum_quantity)
          OR p_reorder_point <> trunc(p_reorder_point)) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — mínimo, máximo e ponto de encomenda têm de ser números inteiros' USING ERRCODE = 'check_violation';
  END IF;
  IF p_maximum_quantity <> 0 AND p_maximum_quantity < p_minimum_quantity THEN
    RAISE EXCEPTION 'A quantidade máxima deve ser maior ou igual à quantidade mínima.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_loc) > 255 THEN
    RAISE EXCEPTION 'A localização deve ter menos de 255 caracteres.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.set_audit_context(v_actor, 'csv_import');

  -- Só as definições: quantidade, custo e estado nunca mudam aqui.
  UPDATE public.stocks
     SET minimum_quantity = p_minimum_quantity,
         maximum_quantity = p_maximum_quantity,
         reorder_point    = p_reorder_point,
         location         = v_loc,
         updated_at       = now()
   WHERE id = p_stock_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_stock_import_settings(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_stock_import_settings(uuid, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_stock_import_settings(uuid, numeric, numeric, numeric, text) TO service_role;
COMMENT ON FUNCTION public.rpc_stock_import_settings(uuid, numeric, numeric, numeric, text) IS $cmt$20270109230000: importação de stock — grava só mínimo/máximo/ponto de encomenda/localização de uma linha existente; inventory.edit OU inventory.import na organização da linha.$cmt$;

-- rpc_fleet_set_van_minimum
CREATE OR REPLACE FUNCTION public.rpc_fleet_set_van_minimum(p_vehicle_id uuid, p_product_id uuid, p_minimum numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.fleet_vehicles;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['inventory.edit']);
  IF v.warehouse_id IS NULL THEN RAISE EXCEPTION 'A % não é um armazém móvel.', v.plate USING ERRCODE = 'check_violation'; END IF;
  IF p_minimum IS NULL OR p_minimum < 0 THEN RAISE EXCEPTION 'Indica o mínimo.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id AND p.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Artigo inválido.' USING ERRCODE = 'check_violation';
  END IF;
  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND p_minimum <> trunc(p_minimum) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — a quantidade tem de ser um número inteiro (indicado: %)', trim_scale(p_minimum) USING ERRCODE = 'check_violation';
  END IF;


  UPDATE public.stocks SET minimum_quantity = p_minimum, reorder_point = 0
   WHERE product_id = p_product_id AND warehouse_id = v.warehouse_id;
  IF NOT FOUND THEN
    INSERT INTO public.stocks (organization_id, product_id, warehouse_id, quantity, minimum_quantity, reorder_point, created_by)
    VALUES (v.organization_id, p_product_id, v.warehouse_id, 0, p_minimum, 0, public.current_business_user_id());
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_fleet_set_van_minimum(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fleet_set_van_minimum(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fleet_set_van_minimum(uuid, uuid, numeric) TO service_role;

-- =====================================================================
-- 4. Mesma assinatura: CREATE OR REPLACE a partir da definição viva (GRANTs mantêm-se)
-- =====================================================================

-- fn_stock_movements_apply
CREATE OR REPLACE FUNCTION public.fn_stock_movements_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_increment boolean;
  v_delta        numeric;
  v_current_qty  numeric;
  v_current_cost numeric(12,4);
  v_new_qty      numeric;
  v_new_cost     numeric(12,4);
BEGIN
  -- NOVO (20261115040000): 'estorno_venda' é sempre incremento (reversão de
  -- uma venda anterior).
  v_is_increment := NEW.movement_type IN ('entrada', 'transferencia_entrada', 'ajuste_positivo', 'estorno_venda');
  v_delta := CASE WHEN v_is_increment THEN NEW.quantity ELSE -NEW.quantity END;

  -- Lock da linha de stocks (se existir) para serializar movimentos
  -- concorrentes sobre o mesmo par produto/armazém.
  -- 20270106470000: o custo médio já não se lê diretamente (20270106070000); a quantidade e o lock continuam aqui, com a RLS de
  -- sempre, e o custo vem logo abaixo pela função interna fn_stock_movements_custo_medio_atual.
  SELECT quantity INTO v_current_qty
  FROM public.stocks
  WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- NOVO (20261115040000): 'venda' é a única exceção que pode partir de
    -- saldo inexistente sem ser rejeitada — trata como stock=0 e segue para
    -- o cálculo do novo saldo (que pode ficar negativo, ver abaixo). Todos
    -- os outros tipos de decremento continuam a exigir uma linha prévia em
    -- stocks, exatamente como antes.
    IF NOT v_is_increment AND NEW.movement_type <> 'venda' THEN
      RAISE EXCEPTION 'stock_insuficiente: não existe stock de % no armazém %', NEW.product_id, NEW.warehouse_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_current_qty := 0;
    v_current_cost := NULL;
  ELSE
    v_current_cost := public.fn_stock_movements_custo_medio_atual(NEW.product_id, NEW.warehouse_id);
  END IF;

  v_new_qty := v_current_qty + v_delta;
  -- NOVO (20261115040000): 'venda' nunca é rejeitada por saldo insuficiente —
  -- decisão de negócio confirmada no plano (Fase 5.0): a venda a stock fixo
  -- nunca pode bloquear a aceitação de uma proposta/assinatura de contrato.
  -- Todos os outros tipos de movimento (incluindo 'estorno_venda', que é
  -- sempre incremento e nunca ficaria negativo por definição) continuam a
  -- bloquear saldo negativo exatamente como antes.
  IF v_new_qty < 0 AND NEW.movement_type <> 'venda' THEN
    RAISE EXCEPTION 'stock_insuficiente: saldo atual % é inferior à quantidade pedida %', v_current_qty, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  -- Custo médio ponderado (5.1.1): só recalcula em entradas reais com custo
  -- conhecido. transferencia_entrada preserva o custo médio de origem quando
  -- o chamador não passa unit_cost_at_time (é o mesmo stock a mudar de sítio,
  -- não uma nova compra). 'venda'/'estorno_venda' não recalculam average_cost
  -- (não são eventos de compra) — caem no ELSE e preservam o custo atual.
  IF NEW.movement_type IN ('entrada', 'transferencia_entrada') AND NEW.unit_cost_at_time IS NOT NULL THEN
    v_new_cost := CASE
      WHEN v_current_qty = 0 OR v_current_cost IS NULL THEN NEW.unit_cost_at_time
      ELSE ((v_current_cost * v_current_qty) + (NEW.unit_cost_at_time * NEW.quantity)) / v_new_qty
    END;
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  INSERT INTO public.stocks (product_id, warehouse_id, organization_id, quantity, average_cost, created_by)
  VALUES (NEW.product_id, NEW.warehouse_id, NEW.organization_id, v_new_qty, v_new_cost, NEW.created_by)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET quantity = v_new_qty,
        average_cost = v_new_cost,
        updated_at = now(),
        -- 20270114910000 (F11): um movimento numa linha apagada repõe-na (as unidades não ficam invisíveis).
        deleted_at = NULL,
        deleted_by = NULL;

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$function$;

-- rpc_confirm_client_order_stock_exit_split
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit_split(p_contract_id uuid, p_product_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_is_manual       boolean;
  v_status          text;
  v_order_label     text;
  v_total           numeric;
  v_n_alloc         integer;
  v_reserved        numeric;
  v_line_count      integer;
  v_needed          numeric;
  v_ordered         numeric;
  v_po_numbers      text;
  v_a               record;
  v_wh_qty          numeric;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
  v_actor           uuid;
  v_doc             text;
  v_mv_id           uuid;
  v_balance         numeric;
  v_moves           jsonb := '[]'::jsonb;
BEGIN
  IF p_contract_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e product_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Indique pelo menos um armazém e quantidade' USING ERRCODE = 'check_violation';
  END IF;

  -- Formato: armazém uuid, quantidade positiva (decimal permitido; 20270122600000), sem armazéns repetidos.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) e
    WHERE jsonb_typeof(e) <> 'object'
       OR (e ->> 'warehouse_id') IS NULL
       OR (e ->> 'warehouse_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (e ->> 'quantity') IS NULL
       OR (e ->> 'quantity') !~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
       OR (e ->> 'quantity')::numeric <= 0
       OR (e ->> 'quantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'Cada linha tem de ter um armazém e uma quantidade positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), count(DISTINCT (e ->> 'warehouse_id')::uuid), SUM((e ->> 'quantity')::numeric)
    INTO v_n_alloc, v_line_count, v_total
  FROM jsonb_array_elements(p_allocations) e;

  IF v_n_alloc <> v_line_count THEN
    RAISE EXCEPTION 'O mesmo armazém aparece mais de uma vez' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number,
         COALESCE(cc.is_manual_order, false), cc.status,
         COALESCE(cc.order_number, cc.contract_number)
    INTO v_org, v_contract_number, v_order_number, v_is_manual, v_status, v_order_label
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 18/11 perm: mesmas 3 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
    'confirmar saída de stock desta encomenda');

  -- 20270122600000: decimais só em unidades mensuráveis (m², ml, kg…); contáveis continuam inteiras.
  IF public.fn_product_requires_integer_qty(p_product_id) AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) e
    WHERE (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
  ) THEN
    RAISE EXCEPTION 'A unidade deste produto é contável — cada quantidade tem de ser um número inteiro' USING ERRCODE = 'check_violation';
  END IF;


  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
    RAISE EXCEPTION 'A encomenda % não está assinada — só é possível dar saída de stock para encomendas de cliente assinadas', v_order_label
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cada armazém tem de ser elegível (ativo, serve clientes, não apagado, não
  -- viatura) e desta organização.
  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, w.name, w.organization_id AS worg,
           w.deleted_at, w.is_active, w.serves_customers, COALESCE(w.is_vehicle, false) AS is_vehicle
    FROM jsonb_array_elements(p_allocations) e
    LEFT JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
  LOOP
    IF v_a.worg IS DISTINCT FROM v_org OR v_a.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(v_a.is_active, false) THEN
      RAISE EXCEPTION 'O armazém "%" está inativo — escolha outro armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(v_a.serves_customers, false) THEN
      RAISE EXCEPTION 'O armazém "%" não serve encomendas de cliente — escolha outro armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
    IF v_a.is_vehicle THEN
      RAISE EXCEPTION 'O armazém "%" é uma viatura — a saída para encomendas de cliente é feita de um armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Lock por produto (mesma ordem que o confirm e fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = p_product_id
      AND sm.movement_type IN ('venda', 'saida')
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
  ) THEN
    RAISE EXCEPTION 'Este produto já teve saída de stock registada na encomenda % — estorne a saída anterior antes de registar outra', v_order_label
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT count(*),
         COALESCE(SUM(r.qty_needed), 0),
         COALESCE(SUM(r.qty_ordered), 0),
         COALESCE(SUM(r.qty_reserved), 0)
    INTO v_line_count, v_needed, v_ordered, v_reserved
  FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_ordered > 0 THEN
    SELECT string_agg(DISTINCT COALESCE(po.order_number, po.id::text), ', ')
      INTO v_po_numbers
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id = p_contract_id
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id = p_product_id;
  END IF;

  IF v_needed > 0 AND v_ordered >= v_needed THEN
    RAISE EXCEPTION 'Este produto da encomenda % já está coberto pela encomenda a fornecedor % (recebida ou a caminho) — não é possível dar também saída de stock',
      v_order_label, COALESCE(v_po_numbers, '—')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_total > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta ou já encomendado ao fornecedor. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Cada armazém tem de ter a sua quantidade (linhas já trancadas acima).
  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, (e ->> 'quantity')::numeric AS qty, w.name
    FROM jsonb_array_elements(p_allocations) e
    JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
  LOOP
    v_wh_qty := NULL;
    SELECT s.quantity INTO v_wh_qty
    FROM public.stocks s
    WHERE s.product_id = p_product_id
      AND s.warehouse_id = v_a.wid
      AND s.deleted_at IS NULL;

    IF COALESCE(v_wh_qty, 0) < v_a.qty THEN
      RAISE EXCEPTION 'O armazém "%" só tem % un — ajuste a quantidade ou escolha outro armazém',
        v_a.name, GREATEST(COALESCE(v_wh_qty, 0), 0)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Notas: as mesmas de rpc_confirm_client_order_stock_exit.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Saída confirmada a partir da venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    WHEN v_is_manual THEN
      format('Saída confirmada a partir do documento de Encomenda Cliente %s',
             COALESCE(v_order_number, v_contract_number))
    ELSE
      format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number)
  END;

  v_doc := public.fn_next_stock_document_number(v_org, 'venda');

  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, (e ->> 'quantity')::numeric AS qty, w.name
    FROM jsonb_array_elements(p_allocations) e
    JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
    ORDER BY (e ->> 'quantity')::numeric DESC, COALESCE(w.name, ''), w.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, counterparty, notes, created_by,
      sale_source_type, sale_source_id
    ) VALUES (
      v_org, p_product_id, v_a.wid, 'saida', v_a.qty,
      v_doc, 'venda', NULL, v_notes, v_actor,
      'contract', p_contract_id
    )
    RETURNING id, balance_after INTO v_mv_id, v_balance;

    v_moves := v_moves || jsonb_build_object(
      'warehouse_id', v_a.wid, 'warehouse_name', v_a.name, 'quantity', v_a.qty,
      'movement_id', v_mv_id, 'balance_after', v_balance);
  END LOOP;

  RETURN jsonb_build_object(
    'success',         true,
    'document_number', v_doc,
    'total_quantity',  v_total,
    'movements',       v_moves
  );
END;
$function$;

-- fn_client_order_request_missing
CREATE OR REPLACE FUNCTION public.fn_client_order_request_missing(p_contract_id uuid, p_actor uuid, p_quote_line_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases      text[] := ARRAY['signed', 'assinado'];
  v_org                 uuid;
  v_status              text;
  v_contract_number     text;
  v_quote_id            uuid;
  v_products            uuid[];
  v_line                record;
  v_supplier_id         uuid;
  v_purchase_price      numeric;
  v_link_uom            uuid;
  v_link_sku            text;
  v_link_units          integer;
  v_qty_int             integer;
  v_unit_price          numeric;
  v_po_id               uuid;
  v_po_is_new           boolean;
  v_touched_pos         uuid[] := ARRAY[]::uuid[];
  v_pos_created         integer := 0;
  v_items_created       integer := 0;
  v_skipped_no_supplier integer := 0;
  v_skipped_other       integer := 0;
  v_errors              integer := 0;
  -- NOVO (EC por armazém): armazém sugerido para a receção
  v_ec_warehouse_id     uuid;
  v_ec_warehouse_name   text;
BEGIN
  IF p_contract_id IS NULL OR p_actor IS NULL THEN
    RAISE EXCEPTION 'contract_id e autor são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    cc.organization_id, cc.status, cc.contract_number,
    COALESCE(
      cc.quote_id,
      (
        SELECT q2.id
        FROM public.quotes q2
        WHERE q2.proposal_id = cc.proposal_id
        ORDER BY q2.created_at DESC
        LIMIT 1
      )
    )
  INTO v_org, v_status, v_contract_number, v_quote_id
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Emylia (20261231980000): a encomenda de cliente só existe depois do 1.º pagamento validado
  IF NOT public.fn_ec_emitida(p_contract_id) THEN
    RAISE EXCEPTION 'A encomenda de cliente deste negócio só é emitida quando o 1.º pagamento for validado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS NULL OR NOT (v_status = ANY (v_signed_aliases)) OR v_quote_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'purchase_orders_created', 0,
      'items_created', 0,
      'skipped_no_supplier', 0,
      'skipped_other', 0,
      'errors', 0,
      'reason', CASE WHEN v_quote_id IS NULL THEN 'no_quote' ELSE 'not_signed' END
    );
  END IF;

  -- Serializa pedidos concorrentes da mesma encomenda.
  PERFORM pg_advisory_xact_lock(hashtextextended('fn_client_order_request_missing:' || p_contract_id::text, 0));

  SELECT array_agg(DISTINCT t.pid ORDER BY t.pid)
    INTO v_products
  FROM (
    SELECT ql.product_id AS pid
    FROM public.quote_lines ql
    WHERE ql.quote_id = v_quote_id
      AND ql.product_id IS NOT NULL
    UNION
    SELECT (comp.value ->> 'source_id')::uuid
    FROM public.quote_lines ql
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
    WHERE ql.quote_id = v_quote_id
      AND ql.bundle_id IS NOT NULL
      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
      AND comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
  ) t;

  IF v_products IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'purchase_orders_created', 0,
      'items_created', 0,
      'skipped_no_supplier', 0,
      'skipped_other', 0,
      'errors', 0
    );
  END IF;

  -- Mesmo lock que rpc_confirm_client_order_stock_exit (ordem fixa).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = ANY (v_products)
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  FOR v_line IN
    -- NOVO (EC por armazém): a falta (qty_missing) vem da reserva por
    -- armazém — o que nenhum armazém elegível tem livre para esta EC.
    SELECT r.quote_line_id, r.component_index, r.product_id,
           r.qty_needed, r.qty_missing,
           p.name AS product_name, p.sku AS product_sku,
           r.ec_warehouse_id
    FROM public.fn_client_order_line_reservations_wh(v_org, v_products) r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.contract_id = p_contract_id
      AND r.qty_missing > 0
      AND (p_quote_line_ids IS NULL OR r.quote_line_id = ANY (p_quote_line_ids))
    ORDER BY r.quote_line_id, r.component_index NULLS FIRST
  LOOP
    -- 20270122600000: quantidades decimais (m², ml, kg…) já não são saltadas;
    -- o ceil abaixo arredonda a falta à unidade da ligação do fornecedor.

    -- NOVO (EC por armazém): o armazém da EC (igual em todas as linhas).
    IF v_ec_warehouse_id IS NULL AND v_line.ec_warehouse_id IS NOT NULL THEN
      v_ec_warehouse_id := v_line.ec_warehouse_id;
      SELECT w.name INTO v_ec_warehouse_name FROM public.warehouses w WHERE w.id = v_ec_warehouse_id;
    END IF;

    v_supplier_id := NULL; v_purchase_price := NULL; v_link_uom := NULL; v_link_sku := NULL;

    SELECT supplier_id, purchase_price, uom_id, supplier_sku
      INTO v_supplier_id, v_purchase_price, v_link_uom, v_link_sku
    FROM public.item_suppliers
    WHERE product_id = v_line.product_id
      AND is_preferred = true
      AND deleted_at IS NULL
      -- NOVO (20261204340000): só ligações ativas e da organização do
      -- contrato (is_active e organization_id são NOT NULL). Mesmo critério
      -- que has_preferred_supplier em rpc_get_client_order_document.
      AND is_active = true
      AND organization_id = v_org
    LIMIT 1;

    IF v_supplier_id IS NULL THEN
      v_skipped_no_supplier := v_skipped_no_supplier + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_no_supplier', 'warning',
        jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id,
                           'component_index', v_line.component_index, 'qty_missing', v_line.qty_missing)
      );
      CONTINUE;
    END IF;

    BEGIN
      v_link_units := public.fn_uom_units_per(v_link_uom, v_line.product_id);
    EXCEPTION WHEN OTHERS THEN
      v_link_units := NULL;
    END;

    IF v_link_units IS NULL OR v_link_units < 1 THEN
      v_skipped_other := v_skipped_other + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_line_skipped', 'warning',
        jsonb_build_object('reason', 'incompatible_supplier_uom', 'product_id', v_line.product_id, 'uom_id', v_link_uom)
      );
      CONTINUE;
    END IF;

    IF v_purchase_price IS NULL THEN
      SELECT price INTO v_purchase_price
      FROM public.product_prices
      WHERE product_id = v_line.product_id AND price_type = 'purchase'
      ORDER BY valid_from DESC NULLS LAST
      LIMIT 1;
      IF v_link_units <> 1 THEN
        v_purchase_price := v_purchase_price * v_link_units;
      END IF;
    END IF;

    v_unit_price := COALESCE(v_purchase_price, 0);
    -- Unidades em falta -> unidade da ligação, arredondando para cima.
    v_qty_int := ceil(v_line.qty_missing / v_link_units)::integer;

    BEGIN
      v_po_id := NULL;

      SELECT po.id INTO v_po_id
      FROM public.purchase_orders po
      WHERE po.source_type = 'contract'
        AND po.source_id = p_contract_id
        AND po.supplier_id = v_supplier_id
        AND po.status = 'pending'
        AND po.deleted_at IS NULL
      ORDER BY po.created_at DESC
      LIMIT 1
      FOR UPDATE;

      v_po_is_new := v_po_id IS NULL;

      IF v_po_is_new THEN
        INSERT INTO public.purchase_orders (
          organization_id, supplier_id, order_date, status,
          source_type, source_id, notes, created_by
        ) VALUES (
          v_org, v_supplier_id, now()::date, 'pending',
          'contract', p_contract_id,
          -- NOVO (20261204610000): a origem certa nos contratos sintéticos.
          -- Venda direta ANTES de manual (as de VD também têm is_manual_order).
          COALESCE(
            (
              SELECT CASE
                       WHEN cc.order_number IS NOT NULL THEN
                         format('Gerada automaticamente a partir da venda direta %s (Encomenda Cliente %s)',
                                COALESCE(ds.sale_number, ds.id::text), cc.order_number)
                       ELSE
                         format('Gerada automaticamente a partir da venda direta %s',
                                COALESCE(ds.sale_number, ds.id::text))
                     END
              FROM public.direct_sales ds
              JOIN public.client_contracts cc ON cc.id = ds.client_contract_id
              WHERE ds.client_contract_id = p_contract_id
              ORDER BY ds.created_at DESC
              LIMIT 1
            ),
            (
              SELECT format('Gerada automaticamente a partir da Encomenda Cliente %s',
                            COALESCE(cc.order_number, cc.contract_number, p_contract_id::text))
              FROM public.client_contracts cc
              WHERE cc.id = p_contract_id
                AND cc.is_manual_order = true
            ),
            format('Gerada automaticamente a partir do contrato %s', COALESCE(v_contract_number, p_contract_id::text))
          )
          -- NOVO (EC por armazém): armazém sugerido para a receção (texto).
          || COALESCE(format(' — receção sugerida no armazém %s', v_ec_warehouse_name), ''),
          p_actor
        )
        RETURNING id INTO v_po_id;
      END IF;

      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, description, sku,
        quantity, unit_price, total_price,
        uom_id, supplier_sku,          -- units_per_uom pelo gatilho
        quote_line_id, component_index -- NOVO: pertence à linha que o gerou
      ) VALUES (
        v_po_id, 'product', v_line.product_id,
        v_line.product_name, v_line.product_sku,
        v_qty_int, v_unit_price, v_unit_price * v_qty_int,
        v_link_uom, nullif(v_link_sku, ''),
        v_line.quote_line_id, v_line.component_index
      );

      IF v_po_is_new THEN
        v_pos_created := v_pos_created + 1;
      END IF;
      v_items_created := v_items_created + 1;
      IF NOT (v_po_id = ANY (v_touched_pos)) THEN
        v_touched_pos := v_touched_pos || v_po_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_supplier_error', 'error', SQLERRM,
        jsonb_build_object('supplier_id', v_supplier_id, 'product_id', v_line.product_id,
                           'component_index', v_line.component_index)
      );
    END;
  END LOOP;

  IF cardinality(v_touched_pos) > 0 THEN
    UPDATE public.purchase_orders po
       SET total_value = (
             SELECT COALESCE(SUM(poi.total_price), 0)
             FROM public.purchase_order_items poi
             WHERE poi.purchase_order_id = po.id
           )
     WHERE po.id = ANY (v_touched_pos);
  END IF;

  INSERT INTO public.workflow_execution_log (
    source_entity, source_record_id, target_entity, target_record_id,
    action_type, status, execution_data
  ) VALUES (
    'contract', p_contract_id, 'purchase_order', NULL,
    'fn:client_order_request_missing', 'success',
    jsonb_build_object(
      'purchase_orders_created', v_pos_created,
      'items_created', v_items_created,
      'skipped_no_supplier', v_skipped_no_supplier,
      'skipped_other', v_skipped_other,
      'errors', v_errors,
      'quote_line_ids', to_jsonb(p_quote_line_ids),
      'resolved_quote_id', v_quote_id,
      'suggested_warehouse_id', v_ec_warehouse_id  -- NOVO (EC por armazém)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_orders_created', v_pos_created,
    'items_created', v_items_created,
    'skipped_no_supplier', v_skipped_no_supplier,
    'skipped_other', v_skipped_other,
    'errors', v_errors,
    'suggested_warehouse_id', v_ec_warehouse_id  -- NOVO (EC por armazém)
  );
END;
$function$;

-- rpc_get_client_order_document
CREATE OR REPLACE FUNCTION public.rpc_get_client_order_document(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org               uuid;
  v_status            text;
  v_contract_number   text;
  v_client_name       text;
  v_signature_date    timestamptz;
  v_total_value       numeric;
  v_resolved_quote_id uuid;
  v_lines             jsonb := '[]'::jsonb;
  v_line              record;
  v_line_status       text;
  v_stock_movement_id uuid;
  v_po_id             uuid;
  v_po_order_number   text;
  v_available_stock   numeric;
  v_available_wh      jsonb;
  -- NOVO (20261203050000): diagnóstico congelado do orçamento resolvido.
  v_diagnostic        jsonb := '[]'::jsonb;
  -- NOVO (20261204290000)
  v_order_number      text;
  v_entity_id         uuid;
  v_is_manual         boolean;
  v_has_ds            boolean := false;
  v_ds_number         text;
  v_origin_type       text;
  v_origin_number     text;
  v_delivery_address  text;
  v_is_editable       boolean;
  v_stock_exit_id     uuid;
  v_line_locked       boolean;
  -- NOVO (20261204310000): reserva por ordem.
  v_is_signed         boolean;
  v_products          uuid[];
  v_res_map           jsonb;
  v_res               jsonb;
  v_q_needed          numeric;
  v_q_reserved        numeric;
  v_q_ordered         numeric;
  v_q_received        numeric;
  v_q_missing         numeric;
  v_q_served_flag     boolean;
  v_missing_lines     integer := 0;
  -- NOVO (20261204340000)
  v_q_served          numeric;
  v_has_pref          boolean;
  v_missing_units     numeric := 0;
  -- NOVO (20261204730000): cabeçalho editável nas encomendas com origem.
  v_cc_delivery       text;
  v_notes             text;
  v_can_edit_header   boolean;
  -- NOVO (20261205040000): categoria principal e subcategoria da linha.
  v_category_name     text;
  v_subcategory_name  text;
  -- NOVO (anulado): quantidade anulada na PO (deixa de ser recebida).
  v_q_cancelled       numeric;
  v_cancellations     jsonb;
  -- NOVO (EC por armazém)
  v_line_alloc        jsonb;
  v_line_sugg_wh      uuid;
  v_ec_warehouse_id   uuid;
  v_ec_warehouse_name text;
  v_ec_plan           text;
  v_pending_reserved  numeric := 0;
  v_ded_log           record;
  v_ded_mode          text;
  v_ded_warning       text;
  v_ded_info          jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    cc.organization_id, cc.status, cc.contract_number, cc.signature_date,
    cc.total_value, e.display_name,
    COALESCE(
      cc.quote_id,
      (
        SELECT q2.id
        FROM public.quotes q2
        WHERE q2.proposal_id = cc.proposal_id
        ORDER BY q2.created_at DESC
        LIMIT 1
      )
    ),
    cc.order_number, cc.entity_id, COALESCE(cc.is_manual_order, false),
    -- NOVO (20261204730000)
    cc.delivery_address, cc.notes
  INTO v_org, v_status, v_contract_number, v_signature_date, v_total_value,
       v_client_name, v_resolved_quote_id,
       v_order_number, v_entity_id, v_is_manual,
       v_cc_delivery, v_notes
  FROM public.client_contracts cc
  LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261205000000): permissão própria client_orders.view em vez de
  -- inventory.view + client_contracts.view.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)
             OR (public.fn_neg_papel_permite(v_org, 'client_orders.view') -- 20270101360000
                 -- 20270109510000: pelo Papel no Negócio só a encomenda de cliente de um negócio
                 AND EXISTS (SELECT 1 FROM public.client_contracts cc_n WHERE cc_n.id = p_contract_id AND cc_n.negocio_id IS NOT NULL))) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204290000): origem. O número da venda direta só é devolvido a
  -- quem a RLS de direct_sales deixaria ver (direct_sales.view ou admin de
  -- sistema) — esta página não pode passar a mostrar vendas diretas a quem
  -- não as pode ver.
  SELECT true, ds.sale_number
    INTO v_has_ds, v_ds_number
    FROM public.direct_sales ds
   WHERE ds.client_contract_id = p_contract_id
   ORDER BY ds.created_at DESC
   LIMIT 1;
  v_has_ds := COALESCE(v_has_ds, false);

  IF v_has_ds THEN
    v_origin_type := 'direct_sale';
    IF public.is_system_admin_user(auth.uid())
       OR public.has_anew_permission(auth.uid(), 'direct_sales.view') THEN
      v_origin_number := v_ds_number;
    END IF;
  ELSIF v_is_manual THEN
    v_origin_type := 'manual';
    v_origin_number := NULL;
  ELSE
    v_origin_type := 'contract';
    v_origin_number := v_contract_number;
  END IF;

  -- Mesma condição que rpc_update_manual_client_order aceita.
  v_is_editable := v_is_manual AND NOT v_has_ds AND v_status = 'signed';

  -- NOVO (20261204730000): encomendas com origem (contrato real ou venda
  -- direta) assinadas — só morada de entrega e notas, via
  -- rpc_update_client_order_header (mesma condição). Apagadas já foram
  -- excluídas acima (deleted_at IS NULL).
  v_can_edit_header := v_status = 'signed' AND NOT v_is_editable;

  -- NOVO (20261204310000)
  v_is_signed := v_status IN ('signed', 'assinado');

  -- NOVO (20261204290000): morada de entrega = morada da obra do orçamento
  -- resolvido; senão a morada principal do cliente.
  -- NOVO (20261204730000): a morada escolhida na própria encomenda
  -- (client_contracts.delivery_address) tem prioridade sobre as duas.
  v_delivery_address := nullif(btrim(v_cc_delivery), '');

  IF v_delivery_address IS NULL AND v_resolved_quote_id IS NOT NULL THEN
    SELECT nullif(btrim(q.obra_endereco), '')
      INTO v_delivery_address
      FROM public.quotes q
     WHERE q.id = v_resolved_quote_id;
  END IF;

  IF v_delivery_address IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT nullif(concat_ws(', ',
             nullif(btrim(a.street), ''),
             nullif(btrim(a.number), ''),
             nullif(btrim(a.postal_code), ''),
             nullif(btrim(a.city), '')
           ), '')
      INTO v_delivery_address
      FROM public.anew_entity_addresses ea
      JOIN public.anew_addresses a ON a.id = ea.address_id
     WHERE ea.entity_id = v_entity_id
       AND (ea.valid_to IS NULL OR ea.valid_to > now())
     ORDER BY ea.is_primary DESC NULLS LAST, ea.created_at DESC
     LIMIT 1;
  END IF;

  IF v_resolved_quote_id IS NOT NULL THEN
    -- NOVO (20261204310000): reserva calculada uma vez, só para os produtos
    -- desta encomenda (a fila é por produto, logo o filtro é exato).
    IF v_is_signed THEN
      SELECT array_agg(DISTINCT t.pid)
        INTO v_products
      FROM (
        SELECT ql.product_id AS pid
        FROM public.quote_lines ql
        WHERE ql.quote_id = v_resolved_quote_id
          AND ql.product_id IS NOT NULL
        UNION
        SELECT (comp.value ->> 'source_id')::uuid
        FROM public.quote_lines ql
        CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
        WHERE ql.quote_id = v_resolved_quote_id
          AND ql.bundle_id IS NOT NULL
          AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
          AND comp.value ->> 'type' = 'product'
          AND comp.value ->> 'source_id' IS NOT NULL
      ) t;

      IF v_products IS NOT NULL THEN
        -- NOVO (EC por armazém): motor por armazém (mesmas chaves +
        -- warehouse_id, warehouse_alloc, ec_warehouse_id, ec_plan).
        SELECT jsonb_object_agg(
                 r.quote_line_id::text || ':' || COALESCE(r.component_index, 0)::text,
                 to_jsonb(r)
               ),
               (array_agg(r.ec_warehouse_id))[1],
               (array_agg(r.ec_plan))[1],
               COALESCE(SUM(r.qty_reserved), 0)
          INTO v_res_map, v_ec_warehouse_id, v_ec_plan, v_pending_reserved
        FROM public.fn_client_order_line_reservations_wh(v_org, v_products) r
        WHERE r.contract_id = p_contract_id;

        IF v_ec_warehouse_id IS NOT NULL THEN
          SELECT w.name INTO v_ec_warehouse_name FROM public.warehouses w WHERE w.id = v_ec_warehouse_id;
        END IF;
      END IF;
    END IF;

    FOR v_line IN
      SELECT
        ql.id AS quote_line_id, p.id AS product_id, NULL::uuid AS service_id,
        -- NOVO (20261204203500): quantity passa a vir em unidades de stock
        -- (qt × fator) — é o que o armazém move e o que
        -- rpc_confirm_client_order_stock_exit recebe. Fator 1 => igual.
        (ql.qt * COALESCE(ql.units_per_uom, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku,
        NULL::text AS service_name, NULL::text AS service_sku,
        ql.qt AS line_quantity, ql.uom_id AS line_uom_id, COALESCE(ql.units_per_uom, 1) AS units_per_uom, ql.unidade AS line_unidade,
        NULL::integer AS component_index
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL

      UNION ALL

      SELECT
        ql.id AS quote_line_id,
        p.id AS product_id, NULL::uuid AS service_id,
        (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku,
        NULL::text AS service_name, NULL::text AS service_sku,
        (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS line_quantity,
        NULL::uuid AS line_uom_id, 1 AS units_per_uom, NULL::text AS line_unidade,
        comp.ord::integer AS component_index
      FROM public.quote_lines ql
      JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
        WITH ORDINALITY AS comp(value, ord)
        ON true
      JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.bundle_id IS NOT NULL
        AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
        AND comp.value ->> 'type' = 'product'
        AND comp.value ->> 'source_id' IS NOT NULL

      UNION ALL

      -- NOVO (20261130190000): linhas de serviço puro — sem stock/PO a
      -- rastrear; ver bloco IF v_line.product_id IS NULL abaixo.
      SELECT
        ql.id AS quote_line_id, NULL::uuid AS product_id, s.id AS service_id, ql.qt AS qt,
        NULL::text AS product_name, NULL::text AS product_sku,
        s.name AS service_name, s.sku AS service_sku,
        ql.qt AS line_quantity, ql.uom_id AS line_uom_id, COALESCE(ql.units_per_uom, 1) AS units_per_uom, ql.unidade AS line_unidade,
        NULL::integer AS component_index
      FROM public.quote_lines ql
      JOIN public.services s ON s.id = ql.service_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.service_id IS NOT NULL
        AND ql.product_id IS NULL

      ORDER BY 1, 13 NULLS FIRST
    LOOP
      v_line_status       := NULL;
      v_stock_movement_id := NULL;
      v_po_id             := NULL;
      v_po_order_number   := NULL;
      v_available_wh      := NULL;
      v_stock_exit_id     := NULL;
      v_line_locked       := false;
      v_res               := NULL;
      v_q_needed          := NULL;
      v_q_reserved        := NULL;
      v_q_ordered         := NULL;
      v_q_received        := NULL;
      v_q_missing         := NULL;
      v_q_served          := NULL;
      v_has_pref          := NULL;
      -- NOVO (20261205040000)
      v_category_name     := NULL;
      v_subcategory_name  := NULL;
      v_q_cancelled       := NULL;
      v_cancellations     := NULL;
      v_line_alloc        := NULL;  -- NOVO (EC por armazém)
      v_line_sugg_wh      := NULL;

      -- NOVO (20261205040000): categoria do produto (linhas de produto e
      -- componentes de pack; serviços ficam NULL). Categoria principal = raiz
      -- da árvore (parent_id; parent_category_id não está preenchido) a partir
      -- de category_id — há produtos que guardam aí a folha sem
      -- subcategory_id. Subcategoria = subcategory_id; senão category_id,
      -- quando esta é filha. Categorias apagadas (deleted_at) não se mostram,
      -- como em useProductCategories.
      IF v_line.product_id IS NOT NULL THEN
        SELECT
          (
            WITH RECURSIVE up(id, parent_id, name, deleted_at, depth) AS (
              SELECT c.id, c.parent_id, c.name, c.deleted_at, 0
              FROM public.product_categories c
              WHERE c.id = COALESCE(p.category_id, p.subcategory_id)
              UNION ALL
              SELECT pc.id, pc.parent_id, pc.name, pc.deleted_at, up.depth + 1
              FROM public.product_categories pc
              JOIN up ON pc.id = up.parent_id
              WHERE up.depth < 10
            )
            SELECT u.name
            FROM up u
            WHERE u.parent_id IS NULL
              AND u.deleted_at IS NULL
            LIMIT 1
          ),
          COALESCE(
            (SELECT s.name
               FROM public.product_categories s
              WHERE s.id = p.subcategory_id
                AND s.parent_id IS NOT NULL
                AND s.deleted_at IS NULL),
            (SELECT c.name
               FROM public.product_categories c
              WHERE c.id = p.category_id
                AND c.parent_id IS NOT NULL
                AND c.deleted_at IS NULL)
          )
          INTO v_category_name, v_subcategory_name
        FROM public.products p
        WHERE p.id = v_line.product_id;
      END IF;

      IF v_line.product_id IS NULL THEN
        -- Linha de serviço: nunca há stock físico nem PO de fornecedor
        -- (fn_contract_stock_deduction / fn_contract_supplier_request já
        -- ignoram estas linhas, de propósito). Estado fixo e distinto dos
        -- estados de produto.
        v_line_status := 'servico';
      ELSE
        -- (a) automático (venda + reference_id) OU (b) saída manual ligada
        -- via "Encomenda Cliente de origem" (saida, sem reference_id).
        -- NOVO (20261204290000): movimentos já estornados não contam.
        SELECT sm.id INTO v_stock_movement_id
        FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = p_contract_id
          AND sm.product_id = v_line.product_id
          AND (
            (sm.movement_type = 'venda' AND sm.reference_id = v_line.quote_line_id)
            OR sm.movement_type = 'saida'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.stock_movements r
            WHERE r.reversal_of_movement_id = sm.id
          )
        ORDER BY sm.created_at DESC
        LIMIT 1;

        -- NOVO (20261204290000): saída manual (estornável) que serve a linha.
        SELECT sm.id INTO v_stock_exit_id
        FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = p_contract_id
          AND sm.product_id = v_line.product_id
          AND sm.movement_type = 'saida'
          AND NOT EXISTS (
            SELECT 1 FROM public.stock_movements r
            WHERE r.reversal_of_movement_id = sm.id
          )
        ORDER BY sm.created_at DESC
        LIMIT 1;

        v_line_locked := public.fn_client_order_product_locked(
          p_contract_id, v_line.quote_line_id, v_line.product_id
        );

        -- NOVO (20261204340000): fornecedor preferido com o critério EXATO
        -- com que fn_client_order_request_missing o escolhe (ligação
        -- preferida, ativa, não apagada, da organização do contrato).
        v_has_pref := EXISTS (
          SELECT 1
          FROM public.item_suppliers isup
          WHERE isup.product_id = v_line.product_id
            AND isup.is_preferred = true
            AND isup.deleted_at IS NULL
            AND isup.is_active = true
            AND isup.organization_id = v_org
        );

        IF v_res_map IS NOT NULL THEN
          v_res := v_res_map -> (v_line.quote_line_id::text || ':' || COALESCE(v_line.component_index, 0)::text);
        END IF;

        IF v_res IS NOT NULL THEN
          -- ── NOVO (20261204310000): estado com reserva por ordem ──────────
          v_q_needed      := COALESCE((v_res ->> 'qty_needed')::numeric, 0);
          v_q_reserved    := COALESCE((v_res ->> 'qty_reserved')::numeric, 0);
          v_q_ordered     := COALESCE((v_res ->> 'qty_ordered')::numeric, 0);
          v_q_received    := COALESCE((v_res ->> 'qty_received')::numeric, 0);
          v_q_missing     := COALESCE((v_res ->> 'qty_missing')::numeric, 0);
          -- NOVO (20261204340000): is_served = linha concluída
          -- (qty_served + qty_received >= qty_needed).
          v_q_served_flag := COALESCE((v_res ->> 'is_served')::boolean, false);
          v_q_served      := COALESCE((v_res ->> 'qty_served')::numeric, 0);
          -- NOVO (EC por armazém): de onde sai a reserva desta linha.
          v_line_alloc    := COALESCE(v_res -> 'warehouse_alloc', '[]'::jsonb);
          v_line_sugg_wh  := (v_res ->> 'warehouse_id')::uuid;

          -- NOVO (anulado): fn_client_order_line_reservations devolve
          -- qty_needed já sem a quantidade anulada nas POs; a diferença para a
          -- quantidade da linha (mesma fórmula: qt × fator, ou quantidade do
          -- componente × qt) é a anulada. Só se calcula quando há anulações
          -- ativas deste produto nesta encomenda (ligadas a esta linha ou sem
          -- ligação) — sem anulações fica 0 e nada muda.
          v_q_cancelled := 0;
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'cancellation_id',       c.id,
                     'purchase_order_id',     po.id,
                     'purchase_order_number', po.order_number,
                     'quantity_cancelled',    c.quantity_cancelled * COALESCE(poi.units_per_uom, 1),
                     'reason',                c.reason,
                     'notes',                 c.notes,
                     'created_at',            c.created_at
                   )
                   ORDER BY c.created_at, c.id
                 )
            INTO v_cancellations
          FROM public.purchase_order_item_cancellations c
          JOIN public.purchase_order_items poi ON poi.id = c.purchase_order_item_id
          JOIN public.purchase_orders po ON po.id = c.purchase_order_id
          WHERE c.undone_at IS NULL
            AND c.quantity_cancelled > 0
            AND po.source_type = 'contract'
            AND po.source_id = p_contract_id
            AND po.deleted_at IS NULL
            AND poi.product_id = v_line.product_id
            AND (
              poi.quote_line_id IS NULL
              OR (poi.quote_line_id = v_line.quote_line_id
                  AND poi.component_index IS NOT DISTINCT FROM v_line.component_index)
            );

          IF v_cancellations IS NOT NULL THEN
            v_q_cancelled := GREATEST(0, GREATEST(COALESCE(v_line.qt, 0), 0) - v_q_needed);
            IF v_q_cancelled = 0 THEN
              -- Anulação sem ligação que coube a outra linha do mesmo produto.
              v_cancellations := NULL;
            END IF;
          END IF;

          IF v_q_served_flag THEN
            -- Concluída: 'recebido' se houve parte pedida (recebida) — a parte
            -- de stock, se existir, está servida; senão servida por stock.
            -- NOVO (anulado): nada recebido nem servido e só anulado →
            -- 'nao_recebido_anulado'.
            v_line_status := CASE WHEN v_q_received > 0 THEN 'recebido'
                                  WHEN v_q_cancelled > 0 AND v_q_served = 0 THEN 'nao_recebido_anulado'
                                  ELSE 'servido_por_stock' END;
          ELSIF v_q_reserved > 0 THEN
            v_line_status := CASE WHEN v_q_ordered = 0 AND v_q_missing = 0
                                  THEN 'stock_disponivel_confirmar' ELSE 'parcial' END;
          ELSIF v_q_served > 0 THEN
            -- NOVO (20261204340000): parte servida por stock e o resto em PO
            -- por receber ou em falta (antes aparecia 'servido_por_stock').
            v_line_status := 'parcial';
          ELSIF v_q_missing > 0 THEN
            v_line_status := CASE WHEN v_q_ordered > 0 THEN 'parcial' ELSE 'sem_fornecedor' END;
          ELSIF v_q_ordered > 0 THEN
            v_line_status := CASE WHEN v_q_received >= v_q_ordered
                                  THEN 'recebido' ELSE 'a_aguardar_encomenda' END;
          ELSE
            -- Quantidade nula/zero: nada a servir (como antes: stock >= 0).
            v_line_status := 'stock_disponivel_confirmar';
          END IF;

          -- NOVO (20261204340000): só contam linhas que o pedido ao fornecedor
          -- consegue de facto requisitar — mesmas regras de
          -- fn_client_order_request_missing: falta > 0, quantidade vendida
          -- (decimais incluídas desde 20270122600000),
          -- fornecedor preferido (critério acima). A condição "assinado" já
          -- está garantida (v_res só existe com v_is_signed).
          IF v_q_missing > 0
             AND v_has_pref THEN
            v_missing_lines := v_missing_lines + 1;
            v_missing_units := v_missing_units + v_q_missing;
          END IF;

          -- PO da linha: primeiro o ligado a esta linha; senão um antigo sem
          -- ligação do mesmo produto; nunca um ligado a outra linha. Abertos
          -- primeiro.
          IF v_q_ordered > 0 THEN
            SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
            FROM public.purchase_orders po
            JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
            WHERE po.source_type = 'contract'
              AND po.source_id = p_contract_id
              AND poi.product_id = v_line.product_id
              AND po.status IS DISTINCT FROM 'cancelled'
              AND po.deleted_at IS NULL
              AND (
                poi.quote_line_id IS NULL
                OR (poi.quote_line_id = v_line.quote_line_id
                    AND poi.component_index IS NOT DISTINCT FROM v_line.component_index)
              )
            ORDER BY (poi.quote_line_id IS NOT NULL) DESC,
                     (po.status IN ('pending', 'ordered', 'partially_received')
                      AND poi.received_quantity < poi.quantity) DESC,
                     po.created_at DESC
            LIMIT 1;
          END IF;

          -- NOVO (anulado): sem PO em curso/recebida para a linha, a PO da
          -- anulação mais recente (para o rótulo e o atalho para a PO).
          IF v_po_id IS NULL AND v_q_cancelled > 0 THEN
            v_po_id           := (v_cancellations -> -1 ->> 'purchase_order_id')::uuid;
            v_po_order_number := v_cancellations -> -1 ->> 'purchase_order_number';
          END IF;

          -- Armazéns: nunca mostrar como disponível mais do que a reserva.
          -- NOVO (EC por armazém): só elegíveis (também sem viaturas);
          -- suggested_quantity = parcela da reserva neste armazém (0 se a
          -- regra não o escolheu); os sugeridos primeiro.
          IF v_q_reserved > 0 THEN
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'warehouse_id',       w.id,
                  'warehouse_name',     w.name,
                  'quantity',           LEAST(s.quantity::numeric, v_q_reserved),
                  'physical_quantity',  s.quantity,
                  'suggested_quantity', COALESCE(al.q, 0),
                  'is_suggested',       (w.id = v_line_sugg_wh)
                )
                ORDER BY COALESCE(al.q, 0) DESC, s.quantity DESC, cw.sort_order
              ),
              '[]'::jsonb
            ) INTO v_available_wh
            FROM public.stocks s
            JOIN public.warehouses w ON w.id = s.warehouse_id
            JOIN public.fn_client_order_warehouses(v_org) cw ON cw.warehouse_id = w.id
            LEFT JOIN LATERAL (
              SELECT SUM((e ->> 'qty')::numeric) AS q
              FROM jsonb_array_elements(v_line_alloc) e
              WHERE (e ->> 'warehouse_id')::uuid = w.id
            ) al ON true
            WHERE s.product_id = v_line.product_id
              AND s.deleted_at IS NULL
              AND s.quantity > 0
              AND w.organization_id = v_org
              AND w.deleted_at IS NULL;
          END IF;

        -- ── Legado (encomenda não assinada): comportamento anterior ────────
        ELSIF v_stock_movement_id IS NOT NULL THEN
          v_line_status := 'servido_por_stock';
        ELSE
          SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = p_contract_id
            AND poi.product_id = v_line.product_id
            AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
          LIMIT 1;

          IF v_po_id IS NOT NULL THEN
            v_line_status := 'recebido';
          ELSE
            SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
            FROM public.purchase_orders po
            JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
            WHERE po.source_type = 'contract'
              AND po.source_id = p_contract_id
              AND poi.product_id = v_line.product_id
              AND po.status IN ('pending', 'ordered', 'partially_received')
              AND poi.received_quantity < poi.quantity
            LIMIT 1;

            IF v_po_id IS NOT NULL THEN
              v_line_status := 'a_aguardar_encomenda';
            ELSE
              SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
              FROM public.stocks s
              JOIN public.warehouses w ON w.id = s.warehouse_id
              WHERE s.product_id = v_line.product_id
                AND s.deleted_at IS NULL
                AND w.organization_id = v_org
                AND w.deleted_at IS NULL;

              IF v_available_stock >= v_line.qt THEN
                v_line_status := 'stock_disponivel_confirmar';

                SELECT COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'warehouse_id',   w.id,
                      'warehouse_name', w.name,
                      'quantity',       s.quantity
                    )
                    ORDER BY s.quantity DESC
                  ),
                  '[]'::jsonb
                ) INTO v_available_wh
                FROM public.stocks s
                JOIN public.warehouses w ON w.id = s.warehouse_id
                WHERE s.product_id = v_line.product_id
                  AND s.deleted_at IS NULL
                  AND s.quantity > 0
                  AND w.organization_id = v_org
                  AND w.deleted_at IS NULL;
              ELSE
                v_line_status := 'sem_fornecedor';
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

      v_lines := v_lines || jsonb_build_object(
        'quote_line_id',         v_line.quote_line_id,
        'item_type',             CASE WHEN v_line.product_id IS NOT NULL THEN 'product' ELSE 'service' END,
        'product_id',            v_line.product_id,
        'product_name',          v_line.product_name,
        'product_sku',           v_line.product_sku,
        'service_id',            v_line.service_id,
        'service_name',          v_line.service_name,
        'service_sku',           v_line.service_sku,
        'quantity',              v_line.qt,
        'line_status',           v_line_status,
        'stock_movement_id',     v_stock_movement_id,
        'purchase_order_id',     v_po_id,
        'purchase_order_number', v_po_order_number,
        'available_warehouses',  v_available_wh,
        -- NOVO (20261204203500): quantidade/unidade tal como na linha vendida.
        'line_quantity',         v_line.line_quantity,
        'uom_id',                v_line.line_uom_id,
        'unidade',               v_line.line_unidade,
        'units_per_uom',         v_line.units_per_uom,
        -- NOVO (20261204290000)
        'stock_exit_movement_id', v_stock_exit_id,
        'line_locked',           v_line_locked,
        -- NOVO (20261204310000): reserva por ordem (unidades base). NULL em
        -- serviços e em encomendas não assinadas.
        'component_index',       v_line.component_index,
        'qty_needed',            v_q_needed,
        'qty_reserved',          v_q_reserved,
        'qty_ordered',           v_q_ordered,
        'qty_received',          v_q_received,
        'qty_missing',           v_q_missing,
        -- NOVO (20261204330000): há fornecedor preferido para o produto — mesmo
        -- critério com que fn_client_order_request_missing escolhe o fornecedor.
        -- 20261204340000: + is_active = true e organization_id = org do
        -- contrato (v_has_pref, calculado acima). NULL em serviços.
        'has_preferred_supplier', v_has_pref,
        -- NOVO (20261204340000): quantidade já servida por stock (unidades
        -- base; saídas repartidas por ordem). NULL em serviços e em
        -- encomendas não assinadas.
        'qty_served',            CASE WHEN v_res IS NOT NULL THEN v_q_served END,
        -- NOVO (20261205040000): categoria principal (raiz) e subcategoria do
        -- produto. NULL em serviços e em produtos sem categoria.
        'category_name',         v_category_name,
        'subcategory_name',      v_subcategory_name,
        -- NOVO (anulado): quantidade anulada nas POs (unidades base) e as
        -- anulações (PO, motivo, nota). NULL em serviços e em encomendas não
        -- assinadas; 0 / NULL quando não há anulação.
        'qty_cancelled',         v_q_cancelled,
        'cancellations',         v_cancellations,
        -- NOVO (EC por armazém): armazém sugerido para a saída desta linha (a
        -- maior parcela da reserva) e a reserva por armazém
        -- [{warehouse_id, warehouse_name, qty}] (unidades base; soma =
        -- qty_reserved). NULL em serviços / encomendas não assinadas.
        'suggested_warehouse_id', v_line_sugg_wh,
        'warehouse_alloc',        v_line_alloc
      );
    END LOOP;

    -- NOVO (EC por armazém): aviso da baixa automática. Só quando a última
    -- tentativa (gatilho / emissão da EC) não deu baixa a tudo e ainda há stock
    -- reservado à espera de saída nesta EC — senão já não interessa.
    IF v_is_signed AND v_pending_reserved > 0 THEN
      SELECT ois.stock_deduction_trigger INTO v_ded_mode
      FROM public.organization_inventory_settings ois
      WHERE ois.organization_id = v_org;

      SELECT l.action_type, l.status, l.error_message, l.execution_data, l.executed_at
        INTO v_ded_log
      FROM public.workflow_execution_log l
      WHERE l.source_entity = 'contract'
        AND l.source_record_id = p_contract_id
        AND l.action_type IN ('trigger:contract_stock_deduction', 'trigger:contract_stock_deduction_no_warehouse')
      ORDER BY l.executed_at DESC NULLS LAST, l.id DESC
      LIMIT 1;

      IF FOUND AND COALESCE(v_ded_mode, 'contract_signed') = 'contract_signed' THEN
        IF v_ded_log.action_type = 'trigger:contract_stock_deduction_no_warehouse' THEN
          v_ded_warning := 'A baixa automática de stock não foi feita: não havia nenhum armazém elegível (ativo, que sirva clientes e não seja viatura). Dê saída do stock reservado em «Saída de stock».';
        ELSIF v_ded_log.status = 'error' THEN
          v_ded_warning := 'A baixa automática de stock falhou. Dê saída do stock reservado em «Saída de stock».';
        ELSIF COALESCE((v_ded_log.execution_data ->> 'lines_skipped')::integer, 0) > 0 THEN
          v_ded_warning := format('A baixa automática de stock saltou %s linha(s). Dê saída do stock reservado em «Saída de stock».',
                                  (v_ded_log.execution_data ->> 'lines_skipped'));
        END IF;

        IF v_ded_warning IS NOT NULL THEN
          v_ded_info := jsonb_build_object(
            'action_type', v_ded_log.action_type,
            'status',      v_ded_log.status,
            'executed_at', v_ded_log.executed_at,
            'reason',      COALESCE(v_ded_log.execution_data ->> 'reason', v_ded_log.error_message),
            'data',        v_ded_log.execution_data
          );
        END IF;
      END IF;
    END IF;

    -- NOVO (20261203050000): diagnóstico congelado do MESMO orçamento já resolvido
    -- acima (inclui o fallback via proposal_id) — não se refaz a resolução.
    -- Informativo para o armazém: não soma ao total nem gera linhas.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'deal_need_id',               qds.deal_need_id,
          'need_title',                 qds.need_title,
          'diag_area_m2',               qds.diag_area_m2,
          'diag_demolir_descricao',     qds.diag_demolir_descricao,
          'diag_demolir_m2',            qds.diag_demolir_m2,
          'diag_proteger_descricao',    qds.diag_proteger_descricao,
          'diag_intervencao_tipo',      qds.diag_intervencao_tipo,
          'diag_intervencao_descricao', qds.diag_intervencao_descricao,
          'materials',                  qds.materials
        )
        ORDER BY qds.created_at, qds.need_title
      ),
      '[]'::jsonb
    ) INTO v_diagnostic
    FROM public.quote_diagnostic_snapshot qds
    WHERE qds.quote_id = v_resolved_quote_id;
  END IF;

  RETURN jsonb_build_object(
    'contract_id',     p_contract_id,
    'contract_number', v_contract_number,
    'client_name',     v_client_name,
    'signature_date',  v_signature_date,
    'total_value',     v_total_value,
    'status',          v_status,
    'lines',           v_lines,
    -- NOVO (20261203050000): chave acrescentada; nenhuma das anteriores mudou.
    'diagnostic',      COALESCE(v_diagnostic, '[]'::jsonb),
    -- NOVO (20261204290000): chaves acrescentadas; nenhuma das anteriores mudou.
    'order_number',     v_order_number,
    'origin_type',      v_origin_type,
    'origin_number',    v_origin_number,
    'delivery_address', v_delivery_address,
    'is_editable',      v_is_editable,
    -- NOVO (20261204310000): botão "Pedir em falta ao fornecedor".
    -- 20261204340000: só linhas requisitáveis (falta inteira > 0 com
    -- fornecedor preferido ativo da organização) e contrato assinado.
    'missing_lines_count', v_missing_lines,
    'can_request_missing', (COALESCE(v_is_signed, false) AND v_missing_lines > 0),
    -- NOVO (20261204340000): soma das unidades em falta dessas linhas
    -- (unidades base, antes do arredondamento à embalagem do fornecedor).
    'missing_units_total', v_missing_units,
    -- NOVO (20261204730000)
    'notes',            v_notes,
    'can_edit_header',  COALESCE(v_can_edit_header, false),
    -- NOVO (20261204740000): cliente da encomenda e a morada gravada na
    -- própria encomenda (sem os fallbacks de obra/morada do cliente).
    'entity_id',                 v_entity_id,
    'delivery_address_override', nullif(btrim(v_cc_delivery), ''),
    -- NOVO (EC por armazém): armazém da EC (único se ec_plan='single'; senão
    -- o com mais reservado; sem reserva, o sugerido para a receção), plano
    -- ('single' | 'split' | 'partial' | 'none') e aviso da baixa automática
    -- (texto pronto a mostrar + detalhe), NULL quando não há nada a avisar.
    'ec_warehouse_id',           v_ec_warehouse_id,
    'ec_warehouse_name',         v_ec_warehouse_name,
    'ec_plan',                   v_ec_plan,
    'stock_deduction_warning',   v_ded_warning,
    'stock_deduction',           v_ded_info
  );
END;
$function$;

-- rpc_revert_client_order_stock_exit
CREATE OR REPLACE FUNCTION public.rpc_revert_client_order_stock_exit(p_contract_id uuid, p_movement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_actor           uuid;
  v_mov             public.stock_movements;
  v_balance_after   numeric;
  -- NOVO (20261204620000)
  v_sale_number     text;
  v_is_direct_sale  boolean;
  -- NOVO (20261204630000)
  v_notes           text;
  v_result          jsonb;
  -- NOVO (saída repartida)
  v_part            record;
  v_reversed        jsonb := '[]'::jsonb;
  v_self_reversed   boolean;
BEGIN
  IF p_contract_id IS NULL OR p_movement_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e movement_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number
  INTO v_org, v_contract_number, v_order_number
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmas verificações de âmbito e permissão da confirmação.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 18/11 perm: mesmas 3 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
    'estornar saída de stock desta encomenda');

  -- Trancar o movimento original serializa estornos concorrentes do mesmo
  -- movimento: o segundo espera e depois vê o estorno do primeiro.
  SELECT sm.* INTO v_mov
  FROM public.stock_movements sm
  WHERE sm.id = p_movement_id
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'Movimento de stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_mov.movement_type IS DISTINCT FROM 'saida'
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS DISTINCT FROM p_contract_id THEN
    RAISE EXCEPTION 'Este movimento não é uma saída confirmada desta encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_mov.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Movimento de stock de outra organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (saída repartida): uma saída confirmada pode ter várias parcelas
  -- (rpc_confirm_client_order_stock_exit_split: um movimento 'saida' por
  -- armazém, mesmo document_number, contrato e produto). Estorna-se a saída
  -- inteira: este movimento e as parcelas irmãs ainda não estornadas. Só há
  -- uma saída ativa por (encomenda, produto) — as confirmações recusam outra
  -- —, por isso as irmãs não estornadas são sempre da mesma saída. Trancadas
  -- por id (ordem fixa). Já estornado este movimento e todas as irmãs → o
  -- mesmo erro de antes; se faltar alguma irmã (estorno antigo parcial),
  -- estorna-se o que falta.
  v_self_reversed := EXISTS (
    SELECT 1 FROM public.stock_movements r
    WHERE r.reversal_of_movement_id = v_mov.id
  );

  PERFORM 1
  FROM public.stock_movements sm
  WHERE sm.organization_id = v_org
    AND sm.sale_source_type = 'contract'
    AND sm.sale_source_id = p_contract_id
    AND sm.product_id = v_mov.product_id
    AND sm.movement_type = 'saida'
    AND v_mov.document_number IS NOT NULL
    AND sm.document_number = v_mov.document_number
    AND sm.id <> v_mov.id
  ORDER BY sm.id
  FOR UPDATE;

  IF v_self_reversed AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
  ) THEN
    RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204620000): venda direta mostra o VD-… nas notas; os outros
  -- casos ficam exatamente como antes. Só texto.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Estorno da saída confirmada — venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    ELSE
      format('Estorno da saída confirmada — Encomenda %s', COALESCE(v_order_number, v_contract_number))
  END;  -- NOVO (20261204620000)

  -- NOVO (20261204630000): a inserção do 'estorno_venda' passa para o helper
  -- (mesmas colunas e valores). O movimento já está trancado acima, por isso
  -- 'skipped' não é possível aqui — se acontecer, mesmo erro de antes.
  IF NOT v_self_reversed THEN
    v_result := public.fn_client_order_reverse_stock_movement(v_mov.id, v_actor, v_notes);

    IF COALESCE(v_result ->> 'status', '') <> 'reversed' THEN
      RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
    END IF;

    v_balance_after := (v_result ->> 'balance_after')::numeric;
    v_reversed := v_reversed || jsonb_build_object(
      'movement_id', v_mov.id, 'warehouse_id', v_mov.warehouse_id, 'quantity', v_mov.quantity,
      'reversal_movement_id', v_result ->> 'reversal_movement_id', 'balance_after', v_balance_after);
  END IF;

  -- NOVO (saída repartida): as outras parcelas da mesma saída.
  FOR v_part IN
    SELECT sm.id, sm.warehouse_id, sm.quantity
    FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
    ORDER BY sm.id
  LOOP
    v_result := public.fn_client_order_reverse_stock_movement(v_part.id, v_actor, v_notes);
    IF COALESCE(v_result ->> 'status', '') = 'reversed' THEN
      v_reversed := v_reversed || jsonb_build_object(
        'movement_id', v_part.id, 'warehouse_id', v_part.warehouse_id, 'quantity', v_part.quantity,
        'reversal_movement_id', v_result ->> 'reversal_movement_id',
        'balance_after', (v_result ->> 'balance_after')::numeric);
      IF v_balance_after IS NULL THEN
        v_balance_after := (v_result ->> 'balance_after')::numeric;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after,          -- saldo do armazém do movimento pedido (ou da 1.ª parcela)
    'reversed',      v_reversed                -- NOVO (saída repartida): parcelas estornadas
  );
END;
$function$;

-- fn_client_order_reverse_stock_movement
CREATE OR REPLACE FUNCTION public.fn_client_order_reverse_stock_movement(p_movement_id uuid, p_actor uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mov            public.stock_movements;
  v_existing_id    uuid;
  v_reversal_id    uuid;
  v_balance_after  numeric;
BEGIN
  IF p_movement_id IS NULL OR p_actor IS NULL THEN
    RAISE EXCEPTION 'movement_id e autor são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  -- Trancar o movimento original serializa estornos concorrentes do mesmo
  -- movimento: o segundo espera e depois vê o estorno do primeiro.
  SELECT sm.* INTO v_mov
  FROM public.stock_movements sm
  WHERE sm.id = p_movement_id
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'Movimento de stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_mov.movement_type NOT IN ('venda', 'saida')
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS NULL THEN
    RAISE EXCEPTION 'Só se estornam vendas ou saídas de encomendas de cliente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.id INTO v_existing_id
  FROM public.stock_movements r
  WHERE r.reversal_of_movement_id = v_mov.id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status',               'skipped',
      'reason',               'already_reversed',
      'movement_id',          v_mov.id,
      'reversal_movement_id', v_existing_id
    );
  END IF;

  -- Mesma inserção que rpc_revert_client_order_stock_exit fazia (20261204620000).
  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, reversal_of_movement_id,
    reference_id, sale_source_type, sale_source_id, notes, created_by
  ) VALUES (
    v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
    v_mov.document_number, 'venda', v_mov.id,
    v_mov.reference_id, 'contract', v_mov.sale_source_id,
    COALESCE(nullif(trim(p_notes), ''), format('Estorno do movimento %s', v_mov.id)),
    p_actor
  )
  RETURNING id, balance_after INTO v_reversal_id, v_balance_after;

  RETURN jsonb_build_object(
    'status',               'reversed',
    'movement_id',          v_mov.id,
    'reversal_movement_id', v_reversal_id,
    'balance_after',        v_balance_after
  );
END;
$function$;

-- fn_contract_deduct_stock
CREATE OR REPLACE FUNCTION public.fn_contract_deduct_stock(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_c                    public.client_contracts;  -- 29/10: era NEW (gatilho)
  v_trigger_mode         text;
  v_default_warehouse_id uuid;
  v_resolved_warehouse   uuid;
  v_active_warehouse_cnt integer;
  v_resolved_quote_id    uuid;
  v_line                 record;
  v_qty_int              numeric;
  v_int_qty              boolean;  -- 20270122600000
  v_result               jsonb;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
  -- NOVO (20261204620000): número que fica no movimento
  v_document_number      text;
  -- NOVO (20261204630000): desconto limitado à reserva FIFO
  v_managed_products     uuid[];
  v_locked_products      uuid[] := ARRAY[]::uuid[];
  v_pid                  uuid;
  v_res_map              jsonb;
  v_reserved             numeric;
  v_wh_qty               numeric;
  v_qty_deduct           numeric;
  v_lines_partial        integer := 0;
  v_lines_not_reserved   integer := 0;
  -- NOVO (EC por armazém): baixa repartida pelos armazéns da reserva
  v_default_ignored      uuid;
  v_alloc                jsonb;
  v_a                    record;
  v_left                 numeric;
  v_line_deducted        numeric;
  v_line_moves           jsonb;
  v_first_mv             uuid;
  v_mv_id                uuid;
  v_mv_balance           numeric;
  v_mv_actor             uuid;
  v_used_warehouses      uuid[] := ARRAY[]::uuid[];
BEGIN
  -- 29/10: o contrato pelo id (o gatilho e a emissão da EC chamam com o contrato já assinado)
  SELECT * INTO v_c FROM public.client_contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'contract_not_found');
  END IF;
  IF v_c.status IS NULL OR NOT (v_c.status = ANY (v_signed_aliases)) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_signed');
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = v_c.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. Only 'contract_signed' deducts automatically ('manual' = só pela
    --      Saída para clientes; 'proposal_accepted' = antigo). ─────────────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'mode', 'mode', v_trigger_mode);
    END IF;

    -- ── 3. Resolve the quote (NOVO 20261115080000): prefer the direct FK,
    --      fall back to the proposal's own quote when execute-workflow left
    --      quote_id NULL. No quote resolvable at all → nothing to deduct. ──
    v_resolved_quote_id := v_c.quote_id;
    IF v_resolved_quote_id IS NULL AND v_c.proposal_id IS NOT NULL THEN
      SELECT id INTO v_resolved_quote_id
      FROM public.quotes
      WHERE proposal_id = v_c.proposal_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_resolved_quote_id IS NULL THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'no_quote');
    END IF;

    -- ── 4. NOVO (EC por armazém): a baixa sai, linha a linha, dos armazéns
    --      onde a reserva por armazém a pôs (fn_client_order_line_reservations_wh).
    --      Só contam armazéns elegíveis (ativos, servem clientes, não
    --      apagados, não viatura). Um armazém por omissão que não seja
    --      elegível é ignorado (fica registado). Sem nenhum elegível não há
    --      baixa — fica registado e o documento da EC mostra o aviso. ──────
    SELECT count(*) INTO v_active_warehouse_cnt
    FROM public.fn_client_order_warehouses(v_c.organization_id);

    IF v_default_warehouse_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.fn_client_order_warehouses(v_c.organization_id) cw
         WHERE cw.warehouse_id = v_default_warehouse_id
       ) THEN
      v_default_ignored := v_default_warehouse_id;
      v_default_warehouse_id := NULL;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', v_c.id, 'warehouse', v_default_ignored,
        'trigger:contract_stock_deduction_default_ignored', 'warning',
        jsonb_build_object(
          'reason', 'default_warehouse_not_eligible',
          'default_warehouse_id', v_default_ignored
        )
      );
    END IF;

    IF v_active_warehouse_cnt = 0 THEN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', v_c.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction_no_warehouse', 'warning',
        jsonb_build_object(
          'reason', 'no_eligible_warehouse',
          'eligible_warehouse_count', 0,
          'default_warehouse_ignored', v_default_ignored
        )
      );
      RETURN jsonb_build_object('skipped', true, 'reason', 'no_warehouse');
    END IF;

    -- NOVO (20261204620000): número do documento de origem. Venda direta
    -- ANTES de manual (as de VD também têm is_manual_order): VD-…; encomenda
    -- manual: EC-…; contrato real: contract_number, como antes.
    v_document_number := COALESCE(
      (
        SELECT COALESCE(ds.sale_number, v_c.order_number, v_c.contract_number)
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = v_c.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(v_c.is_manual_order, false)
           THEN COALESCE(v_c.order_number, v_c.contract_number)
      END,
      v_c.contract_number
    );

    -- ── NOVO (20261204630000): 4b. Trancar as linhas de stocks dos produtos
    --      com gestão de stock deste contrato, pela mesma ordem (produto,
    --      armazém) que rpc_confirm_client_order_stock_exit e
    --      fn_client_order_request_missing. Produto a produto, com
    --      lock_timeout 2s (SET na função): um timeout só afeta as linhas
    --      desse produto, que não descontam e ficam na fila. ──────────────
    SELECT array_agg(DISTINCT ql.product_id ORDER BY ql.product_id)
      INTO v_managed_products
    FROM public.quote_lines ql
    JOIN public.products p ON p.id = ql.product_id
    WHERE ql.quote_id = v_resolved_quote_id
      AND ql.product_id IS NOT NULL
      AND p.manages_stock = true;

    IF v_managed_products IS NOT NULL THEN
      FOREACH v_pid IN ARRAY v_managed_products LOOP
        BEGIN
          PERFORM 1
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = v_pid
            AND w.organization_id = v_c.organization_id
          ORDER BY s.product_id, s.warehouse_id
          FOR UPDATE OF s;

          v_locked_products := v_locked_products || v_pid;
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, error_message, execution_data
          ) VALUES (
            'contract', v_c.id, 'product', v_pid,
            'trigger:contract_stock_deduction_lock_timeout', 'warning', SQLERRM,
            jsonb_build_object('reason', 'lock_timeout', 'product_id', v_pid, 'sqlstate', SQLSTATE)
          );
        END;
      END LOOP;

      -- ── 4c. Reserva FIFO calculada uma vez, só para os produtos
      --        trancados. Chave: quote_line_id (linhas diretas,
      --        component_index NULL). ──────────────────────────────────────
      IF cardinality(v_locked_products) > 0 THEN
        -- NOVO (EC por armazém): reserva + armazéns da linha.
        SELECT jsonb_object_agg(r.quote_line_id::text,
                 jsonb_build_object('qty_reserved', r.qty_reserved, 'alloc', r.warehouse_alloc))
          INTO v_res_map
        FROM public.fn_client_order_line_reservations_wh(v_c.organization_id, v_locked_products) r
        WHERE r.contract_id = v_c.id
          AND r.component_index IS NULL;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. A line with a fractional quantity is skipped
    --      with a warning log — it must never abort the remaining lines of
    --      the same contract. Likewise, any other unexpected failure on a
    --      single line (caught per-line below) never stops the loop. ──────
    FOR v_line IN
      SELECT ql.id, ql.product_id, ql.qt,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = true
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): a validação de inteiro aplica-se à quantidade
      -- em unidades de stock (qt × fator). Com fator 1 é a mesma de antes.
      -- 20270122600000: só as unidades contáveis exigem inteiro; m², ml, kg… descontam decimais.
      v_int_qty := public.fn_product_requires_integer_qty(v_line.product_id);
      IF v_int_qty AND (v_line.qt * v_line.units_per_uom) <> floor(v_line.qt * v_line.units_per_uom) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom);

      -- NOVO (20261204630000): mesma idempotência de
      -- rpc_register_sale_stock_movement (qualquer 'venda' desta linha nesta
      -- origem, incluindo estornadas) testada antes do lock e da reserva.
      -- Conta como processada.
      IF EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = v_c.id
          AND sm.reference_id = v_line.id
          AND sm.movement_type = 'venda'
      ) THEN
        v_lines_processed := v_lines_processed + 1;
        CONTINUE;
      END IF;

      -- NOVO (20261204630000): produto não trancado (lock_timeout) -> não
      -- desconta; a linha fica na fila.
      IF NOT (v_line.product_id = ANY (v_locked_products)) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'lock_timeout', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (EC por armazém): desconto = LEAST(necessário, reservado para a
      -- linha), repartido pelos armazéns da reserva da linha (maior parcela
      -- primeiro), cada parcela limitada ao stock desse armazém.
      v_reserved := COALESCE((v_res_map -> v_line.id::text ->> 'qty_reserved')::numeric, 0);
      v_alloc    := COALESCE(v_res_map -> v_line.id::text -> 'alloc', '[]'::jsonb);
      v_left     := LEAST(v_qty_int, CASE WHEN v_int_qty THEN floor(GREATEST(v_reserved, 0)) ELSE GREATEST(v_reserved, 0) END);

      IF v_left <= 0 OR jsonb_array_length(v_alloc) = 0 THEN
        v_lines_not_reserved := v_lines_not_reserved + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'skipped_not_reserved', 'qt', v_line.qt, 'product_id', v_line.product_id,
                             'qty_needed', v_qty_int, 'qty_reserved', v_reserved,
                             'warehouse_alloc', v_alloc)
        );
        CONTINUE;
      END IF;

      -- Per-line guard: a failure registering one line's movement must never
      -- abort the remaining lines of the same contract (as parcelas da linha
      -- ficam todas ou nenhuma).
      BEGIN
        v_line_deducted := 0;
        v_line_moves := '[]'::jsonb;
        v_first_mv := NULL;
        v_mv_actor := NULL;
        v_result := NULL;

        FOR v_a IN
          SELECT (x.e ->> 'warehouse_id')::uuid AS wid, (x.e ->> 'qty')::numeric AS q
          FROM jsonb_array_elements(v_alloc) WITH ORDINALITY x(e, ord)
          ORDER BY x.ord
        LOOP
          EXIT WHEN v_left <= 0;

          v_wh_qty := NULL;
          SELECT s.quantity
            INTO v_wh_qty
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = v_line.product_id
            AND s.warehouse_id = v_a.wid
            AND s.deleted_at IS NULL
            AND w.organization_id = v_c.organization_id
            AND w.deleted_at IS NULL;

          v_qty_deduct := LEAST(
            v_left::numeric,
            CASE WHEN v_int_qty THEN floor(GREATEST(v_a.q, 0)) ELSE GREATEST(v_a.q, 0) END,
            GREATEST(COALESCE(v_wh_qty, 0), 0)::numeric
          );

          CONTINUE WHEN v_qty_deduct <= 0;

          IF v_first_mv IS NULL THEN
            -- 1.ª parcela: pela RPC de sempre (validações + idempotência).
            v_result := public.rpc_register_sale_stock_movement(
              p_product_id        => v_line.product_id,
              p_warehouse_id       => v_a.wid,
              p_quantity           => v_qty_deduct,
              p_quote_line_id      => v_line.id,
              p_sale_source_type   => 'contract',
              p_sale_source_id     => v_c.id,
              p_document_number    => v_document_number,
              p_unit_cost_at_time  => NULL,
              p_organization_id    => v_c.organization_id
            );
            EXIT WHEN COALESCE((v_result ->> 'skipped')::boolean, false);
            v_mv_id := (v_result ->> 'movement_id')::uuid;
            v_mv_balance := (v_result ->> 'balance_after')::numeric;
            v_first_mv := v_mv_id;
            SELECT sm.created_by INTO v_mv_actor FROM public.stock_movements sm WHERE sm.id = v_mv_id;
          ELSE
            -- Parcelas seguintes (outro armazém): mesmo movimento 'venda' da
            -- mesma linha e origem. A RPC só aceita um por linha
            -- (idempotência), por isso entram aqui com os mesmos campos e o
            -- mesmo autor. O armazém é elegível e da organização (reserva).
            INSERT INTO public.stock_movements (
              organization_id, product_id, warehouse_id, movement_type, quantity,
              document_number, document_type, unit_cost_at_time,
              sale_source_type, sale_source_id, reference_id, notes, created_by
            ) VALUES (
              v_c.organization_id, v_line.product_id, v_a.wid, 'venda', v_qty_deduct,
              v_document_number, 'venda', NULL,
              'contract', v_c.id, v_line.id,
              format('Venda registada a partir de %s %s (linha de orçamento %s)',
                     'contract', v_c.id, v_line.id),
              v_mv_actor
            )
            RETURNING id, balance_after INTO v_mv_id, v_mv_balance;
          END IF;

          v_left := v_left - v_qty_deduct;
          v_line_deducted := v_line_deducted + v_qty_deduct;
          v_line_moves := v_line_moves || jsonb_build_object(
            'warehouse_id', v_a.wid, 'quantity', v_qty_deduct,
            'movement_id', v_mv_id, 'balance_after', v_mv_balance);
          IF NOT (v_a.wid = ANY (v_used_warehouses)) THEN
            v_used_warehouses := v_used_warehouses || v_a.wid;
          END IF;

          IF v_mv_balance < 0 THEN
            INSERT INTO public.workflow_execution_log (
              source_entity, source_record_id, target_entity, target_record_id,
              action_type, status, execution_data
            ) VALUES (
              'contract', v_c.id, 'stock_movement', v_mv_id,
              'trigger:contract_stock_deduction_insufficient', 'warning',
              jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id,
                                 'warehouse_id', v_a.wid, 'balance_after', v_mv_balance)
            );
          END IF;
        END LOOP;

        IF v_line_deducted = 0 THEN
          IF v_first_mv IS NULL AND COALESCE((v_result ->> 'skipped')::boolean, false) THEN
            -- Já registada (corrida): conta como processada, como antes.
            v_lines_processed := v_lines_processed + 1;
          ELSE
            v_lines_not_reserved := v_lines_not_reserved + 1;
            INSERT INTO public.workflow_execution_log (
              source_entity, source_record_id, target_entity, target_record_id,
              action_type, status, execution_data
            ) VALUES (
              'contract', v_c.id, 'quote_line', v_line.id,
              'trigger:contract_stock_deduction_line_skipped', 'warning',
              jsonb_build_object('reason', 'skipped_not_reserved', 'qt', v_line.qt, 'product_id', v_line.product_id,
                                 'qty_needed', v_qty_int, 'qty_reserved', v_reserved,
                                 'warehouse_alloc', v_alloc)
            );
          END IF;
        ELSE
          v_lines_processed := v_lines_processed + 1;

          -- NOVO (20261204630000): desconto parcial — o resto passa a
          -- qty_missing e é pedido ao fornecedor por
          -- fn_client_order_request_missing.
          IF v_line_deducted < v_qty_int THEN
            v_lines_partial := v_lines_partial + 1;
            INSERT INTO public.workflow_execution_log (
              source_entity, source_record_id, target_entity, target_record_id,
              action_type, status, execution_data
            ) VALUES (
              'contract', v_c.id, 'stock_movement', v_first_mv,
              'trigger:contract_stock_deduction_partial', 'warning',
              jsonb_build_object('reason', 'partial', 'quote_line_id', v_line.id, 'product_id', v_line.product_id,
                                 'qty_needed', v_qty_int, 'qty_deducted', v_line_deducted,
                                 'qty_reserved', v_reserved, 'movements', v_line_moves)
            );
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt, 'warehouse_alloc', v_alloc)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', v_c.id, 'stock_movement', NULL,
      'trigger:contract_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_used_warehouses[1], 'resolved_quote_id', v_resolved_quote_id,
                         -- NOVO (EC por armazém)
                         'warehouse_ids', to_jsonb(v_used_warehouses), 'eligible_warehouse_count', v_active_warehouse_cnt, 'default_warehouse_ignored', v_default_ignored,
                         -- NOVO (20261204630000)
                         'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', v_c.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
    RETURN jsonb_build_object('skipped', true, 'reason', 'error', 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('skipped', false, 'lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped,
                            'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved,
                            'warehouse_id', v_used_warehouses[1],
                            'warehouse_ids', to_jsonb(v_used_warehouses));  -- NOVO (EC por armazém)
END;
$function$;

-- fn_proposal_stock_deduction
CREATE OR REPLACE FUNCTION public.fn_proposal_stock_deduction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trigger_mode         text;
  v_default_warehouse_id uuid;
  v_resolved_warehouse   uuid;
  v_active_warehouse_cnt integer;
  v_resolved_quote_id    uuid;
  v_line                 record;
  v_qty_int              numeric;
  v_result               jsonb;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
BEGIN
  -- Only ever react to a transition into 'accepted' — proposals_status_check
  -- has a single literal for acceptance (no alias array needed, unlike
  -- client_contracts' 'signed'/'assinado').
  IF NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- proposals.organization_id is NULLABLE (unlike client_contracts.
  -- organization_id, NOT NULL) — nothing to resolve settings/warehouse
  -- against, and stock_movements.organization_id is NOT NULL. Never guess.
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block accept_proposal_atomic's UPDATE
  -- (which has no BEGIN/EXCEPTION of its own — confirmed by reading
  -- 20261115020000).
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. This organization deducts on contract signature instead (the
    --      default) — that is Fase 5.0B, handled by fn_contract_stock_
    --      deduction(). Do nothing here (inverse guard of that function's
    --      own point 2). ───────────────────────────────────────────────────
    IF v_trigger_mode <> 'proposal_accepted' THEN
      RETURN NEW;
    END IF;

    -- ── 3. Resolve the quote: proposals has no quote_id column (unlike
    --      client_contracts) — always use the same fallback subquery
    --      20261115080000 introduced for contracts, applied directly here.
    --      No quote resolvable → nothing to deduct. ─────────────────────────
    SELECT id INTO v_resolved_quote_id
    FROM public.quotes
    WHERE proposal_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_resolved_quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
    --      -warehouse fallback, else no movement at all (never guess). ─────
    v_resolved_warehouse := v_default_warehouse_id;

    IF v_resolved_warehouse IS NULL THEN
      SELECT count(*) INTO v_active_warehouse_cnt
      FROM public.warehouses
      WHERE organization_id = NEW.organization_id
        AND deleted_at IS NULL;

      IF v_active_warehouse_cnt = 1 THEN
        SELECT id INTO v_resolved_warehouse
        FROM public.warehouses
        WHERE organization_id = NEW.organization_id
          AND deleted_at IS NULL;
      ELSE
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'stock_movement', NULL,
          'trigger:proposal_stock_deduction_no_warehouse', 'warning',
          jsonb_build_object(
            'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
            'active_warehouse_count', v_active_warehouse_cnt
          )
        );
        RETURN NEW;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
    --      excluded — same plan decision as Fase 5.0B. A line with a
    --      fractional/invalid quantity is skipped with a warning log — it
    --      must never abort the remaining lines. Any other unexpected
    --      failure on a single line (caught per-line below) never stops the
    --      loop. ─────────────────────────────────────────────────────────────
    FOR v_line IN
      SELECT ql.id, ql.product_id, ql.qt,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = true
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): a validação de inteiro aplica-se à quantidade
      -- em unidades de stock (qt × fator). Com fator 1 é a mesma de antes.
      -- 20270122600000: só as unidades contáveis exigem inteiro; m², ml, kg… descontam decimais.
      IF public.fn_product_requires_integer_qty(v_line.product_id)
         AND (v_line.qt * v_line.units_per_uom) <> floor(v_line.qt * v_line.units_per_uom) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom);

      -- Per-line guard: a failure registering one line's movement must never
      -- abort the remaining lines of the same proposal.
      BEGIN
        v_result := public.rpc_register_sale_stock_movement(
          p_product_id        => v_line.product_id,
          p_warehouse_id       => v_resolved_warehouse,
          p_quantity           => v_qty_int,
          p_quote_line_id      => v_line.id,
          p_sale_source_type   => 'proposal',
          p_sale_source_id     => NEW.id,
          p_document_number    => COALESCE(NEW.proposal_number, NEW.id::text),
          p_unit_cost_at_time  => NULL,
          p_organization_id    => NEW.organization_id
        );

        v_lines_processed := v_lines_processed + 1;

        -- Traceable for Fase 5.0D (user-visible alerts, not implemented
        -- here) — never blocks nor stops the rest of the flow.
        IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'proposal', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:proposal_stock_deduction_insufficient', 'warning',
            jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'proposal', NEW.id, 'stock_movement', NULL,
      'trigger:proposal_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'proposal', NEW.id, 'stock_movement', NULL,
        'trigger:proposal_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

-- rpc_receive_purchase_order_lines
CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_po               public.purchase_orders%ROWTYPE;
  v_line_input       jsonb;
  v_line_id          uuid;
  v_qty_requested    numeric;
  v_qty_int          numeric;
  v_item             record;
  v_item_supplier_id uuid;
  v_remaining        numeric;
  v_balance          numeric;
  v_received_total   numeric;
  v_lines_out        jsonb := '[]'::jsonb;
  v_sum_quantity     numeric;
  v_sum_received     numeric;
  v_new_status       text;
  v_skip_stock       boolean;
  -- NOVO (20261204203500): embalagens — fator congelado na linha.
  v_units            integer;
  v_stock_qty        numeric;
  v_unit_cost        numeric;
  -- NOVO (20261206130000): destino por linha (EC / stock).
  v_alloc            record;
  v_to_order         numeric;
  v_to_stock         numeric;
  v_movement_id      uuid;
  v_sum_to_order     numeric := 0;
  v_sum_to_stock     numeric := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 3 permissões (20270114960000 F10: receiving.receive como na Receção); a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_po.organization_id,
    ARRAY['purchase_orders.receive', 'inventory.edit', 'receiving.receive'],
    'receber encomendas desta organização');

  -- 20270114960000 (F10): os testes de estado vêm depois da permissão.
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261206130000): o destino passa a ser decidido por linha
  -- (fn_po_receipt_allocation). PO ligada a uma Encomenda Cliente ativa: a
  -- parte que a EC ainda precisa vai para a EC (sem stock geral, como desde
  -- 20261115210000); o excedente, ou tudo se a EC estiver cancelada/apagada/
  -- não assinada, entra em stock. PO de stock: tudo para stock, como antes.
  -- v_skip_stock (stock_skipped no resultado) = nada entrou em stock numa PO
  -- de contrato; é calculado no fim.
  v_skip_stock := false;

  -- Serializa receções de POs diferentes da mesma EC (cada uma lê a
  -- necessidade em aberto da EC antes de escrever).
  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description,
           uom_id, units_per_uom, supplier_sku
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
      RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    -- 20270122600000: só as unidades contáveis exigem inteiro.
    IF public.fn_product_requires_integer_qty(v_item.product_id) AND v_qty_requested <> floor(v_qty_requested) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — a unidade deste produto é contável e o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
        USING ERRCODE = 'check_violation';
    END IF;

    v_remaining := v_item.quantity - v_item.received_quantity;
    IF v_qty_requested > v_remaining THEN
      RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
        v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_qty_int := v_qty_requested;
    v_balance := NULL;

    -- NOVO (20261204203500): a linha está na unidade de compra (ex. PK100);
    -- o stock entra na unidade do produto. received_quantity continua na
    -- unidade da linha. Custo por unidade de stock = preço da linha / fator.
    -- Com fator 1 tudo fica exatamente como antes.
    v_units     := COALESCE(v_item.units_per_uom, 1);
    v_stock_qty := v_qty_int * v_units;
    IF v_stock_qty > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" excede o limite de stock (% unidades)', v_item.description, v_stock_qty
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;
    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    -- NOVO (20261206130000): repartição EC / stock em unidades de stock.
    SELECT * INTO v_alloc
    FROM public.fn_po_receipt_allocation(v_item.id, v_stock_qty);
    v_to_order := v_alloc.units_to_order;
    v_to_stock := v_stock_qty - v_to_order;
    v_movement_id := NULL;

    IF v_to_stock <= 0 THEN
      -- Sem movimento de entrada — tudo vai para a Encomenda Cliente, não
      -- passa pelo stock geral. balance_after fica NULL no output
      -- (informativo, não há stock_movements gerado para esta linha).
      NULL;
    ELSE
      SELECT id INTO v_item_supplier_id
      FROM public.item_suppliers
      WHERE product_id = v_item.product_id
        AND supplier_id = v_po.supplier_id
        AND deleted_at IS NULL
      -- NOVO (20261204203500): primeiro a ligação na MESMA unidade da linha.
      ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_to_stock,
        v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
        v_item.id,
        CASE
          -- Tudo para stock: texto exatamente como antes.
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' AND v_units = 1 THEN
            format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity)
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' THEN
            format('Receção de %s: %s × %s un. (%s unidades de stock) agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_units, v_stock_qty, v_item.received_quantity + v_qty_requested, v_item.quantity)
          -- NOVO (20261206130000): PO de Encomenda Cliente.
          WHEN v_to_order = 0 THEN
            format('Receção de %s: %s unidades de stock agora nesta linha (total recebido %s de %s) — %s',
                   v_po.order_number, v_to_stock, v_item.received_quantity + v_qty_requested, v_item.quantity,
                   CASE WHEN v_alloc.allocation_reason = 'client_order_inactive'
                        THEN format('encomenda cliente %s inativa, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                        ELSE format('necessidade da encomenda cliente %s já coberta, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                   END)
          ELSE
            format('Receção de %s: %s unidades de stock recebidas nesta linha, %s para a encomenda cliente %s e %s para stock (total recebido %s de %s)',
                   v_po.order_number, v_stock_qty, v_to_order, COALESCE(v_alloc.contract_order_number, '?'), v_to_stock,
                   v_item.received_quantity + v_qty_requested, v_item.quantity)
        END,
        v_actor
      )
      RETURNING id, balance_after INTO v_movement_id, v_balance;
    END IF;

    UPDATE public.purchase_order_items
    SET received_quantity       = received_quantity + v_qty_requested,
        received_to_stock_units = received_to_stock_units + v_to_stock  -- NOVO (20261206130000)
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    -- NOVO (20261206130000): histórico da receção.
    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, received_by
    ) VALUES (
      v_po.organization_id, p_purchase_order_id, v_item.id, v_item.product_id, 'receipt',
      p_warehouse_id, v_qty_requested, v_units, v_to_order, v_to_stock,
      CASE WHEN v_po.source_type = 'contract' THEN v_alloc.contract_id END,
      v_alloc.allocation_reason, v_movement_id, v_actor
    );

    v_sum_to_order := v_sum_to_order + v_to_order;
    v_sum_to_stock := v_sum_to_stock + v_to_stock;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance,
      'stock_updated',            (v_to_stock > 0),
      -- NOVO (20261204203500): chaves acrescentadas; as anteriores não mudam.
      'units_per_uom',            v_units,
      'stock_quantity_now',       CASE WHEN v_to_stock > 0 THEN v_to_stock END,
      -- NOVO (20261206130000): destino da receção. qty_* na unidade da linha
      -- (pode ser fracionária numa embalagem repartida); units_* em unidades
      -- de stock.
      'purchase_order_item_id',   v_item.id,
      'qty_to_order',             round(v_to_order::numeric / v_units, 4),
      'qty_to_stock',             round(v_to_stock::numeric / v_units, 4),
      'units_to_order',           v_to_order,
      'units_to_stock',           v_to_stock,
      'contract_id',              v_alloc.contract_id,
      'contract_order_number',    v_alloc.contract_order_number,
      'contract_active',          v_alloc.contract_active,
      'allocation_reason',        v_alloc.allocation_reason,
      'destination',              CASE WHEN v_to_order > 0 AND v_to_stock > 0 THEN 'split'
                                       WHEN v_to_order > 0 THEN 'client_order'
                                       ELSE 'stock' END
    );
  END LOOP;

  -- NOVO (20261206130000): stock_skipped = PO de contrato em que nada entrou
  -- em stock nesta receção (tudo foi para a EC). PO de stock: false.
  v_skip_stock := (v_po.source_type = 'contract' AND v_sum_to_stock = 0);

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
    v_new_status := 'received';
  ELSIF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := v_po.status;
  END IF;

  -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
  -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
  -- "data de entrega" da encomenda como um todo.
  IF v_new_status = 'received' THEN
    UPDATE public.purchase_orders
    SET status = v_new_status,
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = v_new_status, updated_at = now()
    WHERE id = p_purchase_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_number',   v_po.order_number,
    'warehouse_id',   p_warehouse_id,
    'status',         v_new_status,
    'lines',          v_lines_out,
    'stock_skipped',  v_skip_stock,
    -- NOVO (20261206130000)
    'units_to_order_total', v_sum_to_order,
    'units_to_stock_total', v_sum_to_stock
  );
END;
$function$;

-- fn_po_receipt_allocation
CREATE OR REPLACE FUNCTION public.fn_po_receipt_allocation(p_purchase_order_item_id uuid, p_units numeric)
 RETURNS TABLE(contract_id uuid, contract_order_number text, contract_active boolean, units_to_order numeric, units_to_stock numeric, allocation_reason text, open_units numeric, cap_units numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item     record;
  v_cc       record;
  v_units    numeric := GREATEST(COALESCE(p_units, 0), 0);
  v_open     numeric := 0;
  v_cap      numeric := 0;
  v_to_order numeric := 0;
  v_reason   text;
BEGIN
  SELECT poi.id, poi.product_id, poi.quote_line_id, poi.component_index,
         po.organization_id, po.source_type, po.source_id
  INTO v_item
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = p_purchase_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de encomenda % não encontrada', p_purchase_order_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.source_type IS DISTINCT FROM 'contract' OR v_item.source_id IS NULL OR v_item.product_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::boolean, 0::numeric, v_units, 'stock_order'::text, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  SELECT cc.id,
         COALESCE(cc.order_number, cc.contract_number) AS num,
         (cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')) AS active
  INTO v_cc
  FROM public.client_contracts cc
  WHERE cc.id = v_item.source_id
    AND cc.organization_id = v_item.organization_id;

  IF NOT FOUND OR NOT v_cc.active THEN
    RETURN QUERY SELECT v_item.source_id, v_cc.num, false, 0::numeric, v_units, 'client_order_inactive'::text, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  WITH r AS (
    SELECT x.quote_line_id, x.component_index, x.qty_needed, x.qty_served, x.qty_received
    FROM public.fn_client_order_line_reservations(v_item.organization_id, ARRAY[v_item.product_id]) x
    WHERE x.contract_id = v_item.source_id
      AND x.product_id  = v_item.product_id
  ),
  -- Mesmas regras de po_items em fn_client_order_line_reservations.
  pi AS (
    SELECT poi.quote_line_id   AS ql,
           poi.component_index AS ci,
           (poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS q,
           GREATEST(0,
             CASE WHEN po.status = 'received' THEN poi.quantity
                  ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
             END * COALESCE(poi.units_per_uom, 1)
             - COALESCE(poi.received_to_stock_units, 0)
           )::numeric AS rv
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id = v_item.source_id
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id = v_item.product_id
  ),
  linked AS (
    SELECT ql, ci, SUM(q) AS lq, SUM(rv) AS lrv
    FROM pi WHERE ql IS NOT NULL
    GROUP BY ql, ci
  ),
  rl AS (
    SELECT r.*, COALESCE(l.lq, 0) AS lq, COALESCE(l.lrv, 0) AS lrv
    FROM r
    LEFT JOIN linked l
      ON l.ql = r.quote_line_id
     AND l.ci IS NOT DISTINCT FROM r.component_index
  )
  SELECT
    CASE WHEN v_item.quote_line_id IS NOT NULL THEN
      COALESCE(SUM(GREATEST(0, rl.qty_needed - rl.qty_served - rl.qty_received))
               FILTER (WHERE rl.quote_line_id = v_item.quote_line_id
                         AND rl.component_index IS NOT DISTINCT FROM v_item.component_index), 0)
    ELSE
      COALESCE(SUM(GREATEST(0, rl.qty_needed - rl.qty_served - rl.qty_received)), 0)
    END,
    CASE WHEN v_item.quote_line_id IS NOT NULL THEN
      GREATEST(0,
        LEAST(
          COALESCE(SUM(rl.qty_needed) FILTER (WHERE rl.quote_line_id = v_item.quote_line_id
                                                AND rl.component_index IS NOT DISTINCT FROM v_item.component_index), 0),
          COALESCE((SELECT l.lq FROM linked l WHERE l.ql = v_item.quote_line_id
                      AND l.ci IS NOT DISTINCT FROM v_item.component_index), 0)
        )
        - COALESCE((SELECT l.lrv FROM linked l WHERE l.ql = v_item.quote_line_id
                      AND l.ci IS NOT DISTINCT FROM v_item.component_index), 0))
    ELSE
      GREATEST(0,
        LEAST(
          COALESCE((SELECT SUM(q) FROM pi WHERE ql IS NULL), 0),
          COALESCE(SUM(rl.qty_needed - LEAST(rl.qty_needed, rl.lq)), 0)
        )
        - COALESCE((SELECT SUM(rv) FROM pi WHERE ql IS NULL), 0))
    END
  INTO v_open, v_cap
  FROM rl;

  -- 20270122600000: o arredondamento para cima só se aplica a unidades contáveis; em m², ml, kg… a
  -- EC fica com o que precisa e o excedente decimal entra em stock.
  v_to_order := LEAST(v_units, CASE WHEN public.fn_product_requires_integer_qty(v_item.product_id)
                                    THEN ceil(LEAST(COALESCE(v_open, 0), COALESCE(v_cap, 0)))
                                    ELSE LEAST(COALESCE(v_open, 0), COALESCE(v_cap, 0)) END);
  v_reason := CASE
    WHEN v_to_order >= v_units AND v_units > 0 THEN 'client_order'
    WHEN v_to_order > 0 THEN 'client_order_surplus_to_stock'
    ELSE 'client_order_already_covered'
  END;

  RETURN QUERY SELECT v_item.source_id, v_cc.num, true, v_to_order, v_units - v_to_order, v_reason, v_open, v_cap;
END;
$function$;

-- rpc_po_receipt_release_to_stock
CREATE OR REPLACE FUNCTION public.rpc_po_receipt_release_to_stock(p_item_ids uuid[], p_warehouse_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_org              uuid;
  v_org_count        integer;
  v_po               record;
  v_item             record;
  v_cc               record;
  v_units            integer;
  v_pending          numeric;
  v_mov_units        numeric;
  v_unit_cost        numeric;
  v_item_supplier_id uuid;
  v_movement_id      uuid;
  v_balance          numeric;
  v_reason           text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_lines_out        jsonb := '[]'::jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para passar para stock' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Todas as linhas da mesma organização.
  SELECT min(po.organization_id::text)::uuid, count(DISTINCT po.organization_id)
  INTO v_org, v_org_count
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = ANY (p_item_ids);

  IF v_org IS NULL OR (SELECT count(*) FROM public.purchase_order_items WHERE id = ANY (p_item_ids)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'As linhas têm de ser todas da mesma organização' USING ERRCODE = 'check_violation';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['purchase_orders.receive', 'inventory.edit'],
    'receber encomendas desta organização');

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- Trancar as POs (mesma ordem sempre) — serializa com receções/reversões.
  PERFORM 1
  FROM public.purchase_orders po
  WHERE po.id IN (SELECT purchase_order_id FROM public.purchase_order_items WHERE id = ANY (p_item_ids))
  ORDER BY po.id
  FOR UPDATE;

  FOR v_item IN
    SELECT poi.id, poi.purchase_order_id, poi.product_id, poi.item_type, poi.description,
           poi.quantity, poi.received_quantity, poi.received_to_stock_units, poi.unit_price,
           poi.uom_id, COALESCE(poi.units_per_uom, 1) AS units_per_uom
    FROM public.purchase_order_items poi
    WHERE poi.id = ANY (p_item_ids)
    ORDER BY poi.id
    FOR UPDATE
  LOOP
    SELECT id, organization_id, order_number, status, source_type, source_id, supplier_id, deleted_at
    INTO v_po
    FROM public.purchase_orders WHERE id = v_item.purchase_order_id;

    IF v_po.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A encomenda % foi apagada', v_po.order_number USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto', v_item.description USING ERRCODE = 'check_violation';
    END IF;
    IF v_po.source_type IS DISTINCT FROM 'contract' THEN
      RAISE EXCEPTION 'A linha "%" é de uma encomenda de stock — o recebido já está em stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT cc.id, COALESCE(cc.order_number, cc.contract_number) AS num,
           (cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')) AS active
    INTO v_cc
    FROM public.client_contracts cc
    WHERE cc.id = v_po.source_id AND cc.organization_id = v_po.organization_id;

    IF FOUND AND v_cc.active THEN
      RAISE EXCEPTION 'A encomenda cliente % da linha "%" está ativa — o recebido pertence-lhe e não pode passar para stock',
        v_cc.num, v_item.description USING ERRCODE = 'check_violation';
    END IF;

    v_units   := v_item.units_per_uom;
    v_pending := v_item.received_quantity * v_units - v_item.received_to_stock_units;

    IF v_pending <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida por passar para stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;
    IF (public.fn_product_requires_integer_qty(v_item.product_id) AND v_pending <> floor(v_pending)) OR v_pending > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade por passar para stock inválida (%)', v_item.description, v_pending
        USING ERRCODE = 'check_violation';
    END IF;

    -- As entradas por estornar da linha têm de bater com o que já está
    -- marcado como stock; senão (p.ex. entrada antiga de PO-2026-0010) a
    -- passagem duplicaria stock.
    SELECT COALESCE(sum(m.quantity), 0) INTO v_mov_units
    FROM public.stock_movements m
    WHERE m.reference_id = v_item.id
      AND m.organization_id = v_po.organization_id
      AND m.product_id = v_item.product_id
      AND m.document_type = 'compra'
      AND m.movement_type = 'entrada'
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = m.id);

    IF v_mov_units <> v_item.received_to_stock_units THEN
      RAISE EXCEPTION 'Não é possível passar "%" para stock automaticamente: as entradas de stock da linha (% un.) não batem com o registado (% un.)',
        v_item.description, v_mov_units, v_item.received_to_stock_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_po.supplier_id
      AND deleted_at IS NULL
    ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      reference_id, notes, created_by
    ) VALUES (
      v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_pending,
      v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
      v_item.id,
      format('Passagem para stock de %s: %s unidades recebidas para a encomenda cliente %s (inativa)%s',
             v_po.order_number, v_pending, COALESCE(v_cc.num, '?'),
             CASE WHEN v_reason IS NOT NULL THEN format(' (motivo: %s)', v_reason) ELSE '' END),
      v_actor
    )
    RETURNING id, balance_after INTO v_movement_id, v_balance;

    UPDATE public.purchase_order_items
    SET received_to_stock_units = received_to_stock_units + v_pending
    WHERE id = v_item.id;

    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, notes, received_by
    ) VALUES (
      v_po.organization_id, v_po.id, v_item.id, v_item.product_id, 'release_to_stock',
      p_warehouse_id, 0, v_units, 0, v_pending,
      v_po.source_id, 'client_order_inactive', v_movement_id, v_reason, v_actor
    );

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'purchase_order_id',      v_po.id,
      'order_number',           v_po.order_number,
      'product_id',             v_item.product_id,
      'units_to_stock',         v_pending,
      'qty_to_stock',           round(v_pending / v_units, 4),
      'contract_id',            v_po.source_id,
      'contract_order_number',  v_cc.num,
      'balance_after',          v_balance
    );
  END LOOP;

  RETURN jsonb_build_object('warehouse_id', p_warehouse_id, 'lines', v_lines_out);
END;
$function$;

-- rpc_revert_purchase_order_receipt
CREATE OR REPLACE FUNCTION public.rpc_revert_purchase_order_receipt(p_purchase_order_id uuid, p_item_ids uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_po             public.purchase_orders%ROWTYPE;
  v_reason         text;
  v_skip_stock     boolean;
  v_item_id        uuid;
  v_item           record;
  v_line_mov_ids   uuid[];
  v_line_mov_units numeric;
  v_line_expected  numeric;
  v_all_mov_ids    uuid[] := ARRAY[]::uuid[];
  v_lines_out      jsonb := '[]'::jsonb;
  v_audit_lines    jsonb := '[]'::jsonb;
  v_grp            record;
  v_stock_qty      numeric;
  v_stock_cost     numeric;
  v_new_cost       numeric;
  v_mov            public.stock_movements%ROWTYPE;
  v_sum_quantity   numeric;
  v_sum_received   numeric;
  v_new_status     text;
  v_prev_bypass    text;
  v_diff           jsonb;
  -- NOVO (20261206130000)
  v_line_legacy    boolean;
  v_rev_mov_id     uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Trancar a encomenda serializa com receções e reversões concorrentes
  -- (rpc_receive_purchase_order_lines tranca-a da mesma forma).
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Só é possível reverter a receção de encomendas recebidas ou parcialmente recebidas (estado atual: %)', v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_po.organization_id,
    ARRAY['purchase_orders.revert_receipt', 'inventory.edit'],
    'reverter receções desta organização');

  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indica o motivo da reversão (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para reverter' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  v_skip_stock := (v_po.source_type = 'contract');

  -- ── 1. Validar e trancar as linhas e as entradas de stock de cada uma ──
  FOREACH v_item_id IN ARRAY p_item_ids
  LOOP
    SELECT id, product_id, item_type, quantity, received_quantity, description,
           COALESCE(units_per_uom, 1) AS units_per_uom,
           received_to_stock_units  -- NOVO (20261206130000)
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_item_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_item_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm receção de stock a reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_item.received_quantity IS NULL OR v_item.received_quantity <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida para reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    -- Entradas da receção desta linha ainda sem estorno. O filtro por
    -- organização e produto usa idx_stock_movements_product (não há índice
    -- em reference_id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]),
           COALESCE(sum(t.quantity), 0)
    INTO v_line_mov_ids, v_line_mov_units
    FROM (
      SELECT m.id, m.quantity
      FROM public.stock_movements m
      WHERE m.reference_id = v_item.id
        AND m.organization_id = v_po.organization_id
        AND m.product_id = v_item.product_id
        AND m.document_type = 'compra'
        AND m.movement_type = 'entrada'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = m.id
        )
      ORDER BY m.id
      FOR UPDATE OF m
    ) t;

    -- NOVO (20261206130000): as entradas por estornar têm de explicar a
    -- parte da linha que foi para stock (received_to_stock_units); a parte
    -- entregue à Encomenda Cliente não tem movimento e só repõe contadores.
    -- PO de stock: received_to_stock_units = recebido × fator (backfill),
    -- exatamente a verificação anterior. PO de contrato sem entradas: 0.
    -- Legado (receção anterior a esta migração, sem linhas em
    -- purchase_order_receipts) com entradas = recebido × fator, como antes
    -- (PO-2026-0010): continua a reverter-se.
    v_line_expected := v_item.received_to_stock_units;
    v_line_legacy := NOT EXISTS (
        SELECT 1 FROM public.purchase_order_receipts pr
        WHERE pr.purchase_order_item_id = v_item.id
      )
      AND v_line_mov_units = v_item.received_quantity * v_item.units_per_uom;

    IF v_line_mov_units <> v_line_expected AND NOT v_line_legacy THEN
      RAISE EXCEPTION 'Não é possível reverter "%" automaticamente: a linha tem % recebidas (% unidades de stock deram entrada em stock), mas as entradas de stock por estornar somam % unidades',
        v_item.description, v_item.received_quantity, v_line_expected, v_line_mov_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_all_mov_ids := v_all_mov_ids || v_line_mov_ids;

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'description',            v_item.description,
      'quantity_reverted',      v_item.received_quantity,
      'stock_reverted',         cardinality(v_line_mov_ids) > 0,
      'movements_reverted',     cardinality(v_line_mov_ids),
      -- NOVO (20261206130000)
      'units_reverted_from_stock',        v_line_mov_units,
      'units_reverted_from_client_order', GREATEST(0, v_item.received_quantity * v_item.units_per_uom - v_line_mov_units)
    );
  END LOOP;

  -- ── 2. Stock suficiente e custo médio, por produto/armazém ──
  -- Tudo verificado antes do primeiro estorno. Ordem fixa para trancar
  -- stocks sempre pela mesma sequência.
  FOR v_grp IN
    SELECT m.product_id,
           m.warehouse_id,
           sum(m.quantity)::numeric                       AS qty,
           bool_or(m.unit_cost_at_time IS NULL)           AS any_cost_null,
           sum(m.unit_cost_at_time * m.quantity)          AS cost_total,
           string_agg(DISTINCT poi.description, '", "')   AS descriptions,
           w.name                                         AS warehouse_name
    FROM public.stock_movements m
    JOIN public.purchase_order_items poi ON poi.id = m.reference_id
    LEFT JOIN public.warehouses w ON w.id = m.warehouse_id
    WHERE m.id = ANY (v_all_mov_ids)
    GROUP BY m.product_id, m.warehouse_id, w.name
    ORDER BY m.product_id, m.warehouse_id
  LOOP
    v_stock_qty  := NULL;
    v_stock_cost := NULL;

    SELECT s.quantity, s.average_cost
    INTO v_stock_qty, v_stock_cost
    FROM public.stocks s
    WHERE s.product_id = v_grp.product_id
      AND s.warehouse_id = v_grp.warehouse_id
    FOR UPDATE;

    IF COALESCE(v_stock_qty, 0) < v_grp.qty THEN
      RAISE EXCEPTION 'Não é possível reverter "%": o armazém % tem % unidades e a receção deu entrada de % (já saiu stock)',
        v_grp.descriptions, COALESCE(v_grp.warehouse_name, v_grp.warehouse_id::text),
        COALESCE(v_stock_qty, 0), v_grp.qty
        USING ERRCODE = 'check_violation';
    END IF;

    -- Repor o custo médio antes dos estornos: o apply lê average_cost desta
    -- linha e volta a gravá-lo tal como está.
    IF v_stock_qty - v_grp.qty > 0
       AND v_stock_cost IS NOT NULL
       AND NOT v_grp.any_cost_null THEN
      v_new_cost := round(
        ((v_stock_cost * v_stock_qty) - v_grp.cost_total) / (v_stock_qty - v_grp.qty),
        4
      );
      IF v_new_cost >= 0 AND v_new_cost IS DISTINCT FROM v_stock_cost THEN
        UPDATE public.stocks
        SET average_cost = v_new_cost,
            updated_at   = now()
        WHERE product_id = v_grp.product_id
          AND warehouse_id = v_grp.warehouse_id;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Estornos ──
  FOR v_mov IN
    SELECT m.*
    FROM public.stock_movements m
    WHERE m.id = ANY (v_all_mov_ids)
    ORDER BY m.product_id, m.warehouse_id, m.created_at, m.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      supplier_sku_at_time, reference_id, reversal_of_movement_id, notes, created_by
    ) VALUES (
      v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'ajuste_negativo', v_mov.quantity,
      v_mov.document_number, 'compra', v_mov.item_supplier_id, v_mov.unit_cost_at_time,
      v_mov.supplier_sku_at_time, v_mov.reference_id, v_mov.id,
      format('Estorno da receção de %s: %s unidades (motivo: %s)', v_po.order_number, v_mov.quantity, v_reason),
      v_actor
    )
    RETURNING id INTO v_rev_mov_id;  -- NOVO (20261206130000)

    UPDATE public.purchase_order_receipts
    SET revert_movement_id = v_rev_mov_id
    WHERE stock_movement_id = v_mov.id
      AND purchase_order_item_id = v_mov.reference_id;
  END LOOP;

  -- NOVO (20261206130000): receções destas linhas ficam marcadas como
  -- revertidas (o histórico não se apaga).
  UPDATE public.purchase_order_receipts
  SET reverted_at   = now(),
      reverted_by   = v_actor,
      revert_reason = v_reason
  WHERE purchase_order_item_id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id
    AND reverted_at IS NULL;

  -- ── 4. Linhas e estado da encomenda ──
  -- A encomenda e as linhas ficam numa única linha de auditoria (abaixo);
  -- o bypass só cobre estes dois UPDATE e é reposto a seguir.
  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.purchase_order_items
  SET received_quantity       = 0,
      received_to_stock_units = 0  -- NOVO (20261206130000)
  WHERE id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    -- Último estado anterior à receção. Gatilho genérico: status em
    -- changed_fields (UPDATE) ou full_record (INSERT), record_id = PO;
    -- rpc_update_purchase_order: changed_fields.purchase_orders.status,
    -- entity_id = PO e record_id NULL. Dentro da mesma linha, 'new' é
    -- posterior a 'old'.
    SELECT v.val
    INTO v_new_status
    FROM public.entity_audit_log a
    CROSS JOIN LATERAL (VALUES
      (1, a.full_record ->> 'status'),
      (2, a.changed_fields #>> '{status,old}'),
      (3, a.changed_fields #>> '{status,new}'),
      (2, a.changed_fields #>> '{purchase_orders,status,old}'),
      (3, a.changed_fields #>> '{purchase_orders,status,new}')
    ) AS v(ord, val)
    WHERE a.table_name = 'purchase_orders'
      AND (a.record_id = p_purchase_order_id OR a.entity_id = p_purchase_order_id)
      AND v.val IN ('pending', 'ordered')
    ORDER BY a.created_at DESC, v.ord DESC
    LIMIT 1;

    v_new_status := COALESCE(v_new_status, 'ordered');
  END IF;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = NULL,
      updated_at           = now()
  WHERE id = p_purchase_order_id;

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  SELECT COALESCE(jsonb_agg(
           (l.value - 'quantity_reverted')
           || jsonb_build_object(
                'received_quantity', jsonb_build_object('old', l.value -> 'quantity_reverted', 'new', 0)
              )
         ), '[]'::jsonb)
  INTO v_audit_lines
  FROM jsonb_array_elements(v_lines_out) AS l(value);

  v_diff := jsonb_build_object(
    'status', jsonb_build_object('old', v_po.status, 'new', v_new_status),
    'receipt_reversal', jsonb_build_object(
      'reason',               v_reason,
      'lines',                v_audit_lines,
      'reversal_of_movement_ids', to_jsonb(v_all_mov_ids)
    )
  );
  IF v_po.actual_delivery_date IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', NULL)
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_purchase_order_id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', p_purchase_order_id
  );

  RETURN jsonb_build_object(
    'order_number', v_po.order_number,
    'status',       v_new_status,
    'lines',        v_lines_out
  );
END;
$function$;

-- rpc_bulk_update_inventory_count_lines
CREATE OR REPLACE FUNCTION public.rpc_bulk_update_inventory_count_lines(p_inventory_count_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_warehouse_id uuid;
  v_row          jsonb;
  v_idx          integer := -1;
  v_input_index  integer;
  v_sku          text;
  v_qty_txt      text;
  v_qty          numeric;
  v_matches      integer;
  v_line_id      uuid;
  v_product_id   uuid;
  v_snapshot     numeric;
  v_had_resolution boolean;
  v_live_qty     numeric;
  v_moved        boolean;
  v_results      jsonb := '[]'::jsonb;
  v_updated      integer := 0;
  v_failed       integer := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ic.organization_id, ic.status, ic.warehouse_id
  INTO v_org, v_status, v_warehouse_id
  FROM public.inventory_counts ic
  WHERE ic.id = p_inventory_count_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sessão de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesma exigência de rpc_update_inventory_count_line_quantity: organização
  -- visível + inventory.count. Esta função é a versão em lote dessa; não pode
  -- abrir uma porta que a versão unitária não abre.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.count', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para contar inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'A contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- D13: travão defensivo, não regra de negócio — o cliente deve partir
  -- ficheiros grandes em lotes em vez de segurar uma transação aberta.
  IF jsonb_array_length(p_lines) > 5000 THEN
    RAISE EXCEPTION 'Demasiadas linhas numa só chamada (% linhas, máximo 5000) — divida a importação em lotes', jsonb_array_length(p_lines)
      USING ERRCODE = 'program_limit_exceeded';
  END IF;

  -- ---- Mapa SKU → linha, construído UMA vez por chamada (D16) -------------
  --
  -- A comparação upper(btrim(p.sku)) não pode usar idx_products_sku (btree
  -- simples sobre sku); resolver o SKU dentro do ciclo obrigava a varrer
  -- TODAS as linhas da contagem por cada linha do ficheiro — duas vezes, aliás
  -- (o count(*) e depois a query de campos). Numa contagem inicial de milhares
  -- de produtos isso são milhões de comparações por lote e o statement_timeout
  -- do role authenticated mata a chamada inteira. Agora é um scan só, seguido
  -- de um lookup indexado por linha de ficheiro.
  --
  -- DROP defensivo antes de criar: a tabela é ON COMMIT DROP, mas se esta
  -- função for chamada duas vezes DENTRO da mesma transação (um DO block, ou
  -- outra rotina que a chame em ciclo) a segunda chamada encontraria viva a
  -- tabela da primeira. O nome é improvável de propósito.
  --
  -- Todas as referências são qualificadas com pg_temp.: como pg_temp está
  -- listado EXPLICITAMENTE no search_path desta função (e em último lugar),
  -- um nome não qualificado resolveria primeiro em public — e nunca se há de
  -- poder criar em public uma tabela que sequestre esta.
  DROP TABLE IF EXISTS pg_temp._olyvia_bulk_icl_sku_map;

  CREATE TEMP TABLE _olyvia_bulk_icl_sku_map ON COMMIT DROP AS
  SELECT upper(btrim(p.sku))                             AS k,
         count(*)                                        AS n,
         -- ATENÇÃO: quando n > 1 estes quatro agregados podem vir de linhas
         -- DIFERENTES (são independentes entre si, não há aqui nenhum
         -- "escolher a linha X e ler os seus campos"). É inofensivo porque
         -- n > 1 é rejeitado como "SKU ambíguo" no ciclo ANTES de qualquer um
         -- deles ser lido. Se algum dia se deixar de rejeitar o caso ambíguo,
         -- isto TEM de passar a DISTINCT ON (k) com uma ordenação estável.
         min(icl.id::text)::uuid                         AS line_id,
         min(icl.product_id::text)::uuid                 AS product_id,
         min(icl.system_quantity_at_start)               AS snapshot,
         bool_or(icl.discrepancy_resolution IS NOT NULL) AS had_resolution
  FROM public.inventory_count_lines icl
  JOIN public.products p ON p.id = icl.product_id
  WHERE icl.inventory_count_id = p_inventory_count_id
    AND p.sku IS NOT NULL
    AND btrim(p.sku) <> ''
  GROUP BY 1;

  CREATE INDEX ON pg_temp._olyvia_bulk_icl_sku_map (k);
  ANALYZE pg_temp._olyvia_bulk_icl_sku_map;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_idx := v_idx + 1;

    -- Calculados FORA do bloco com EXCEPTION para que o relatório de erro
    -- consiga sempre identificar a linha, mesmo quando o próprio conteúdo é
    -- inválido.
    -- Só se aceita um input_index que seja de facto um inteiro pequeno; um
    -- valor decimal ou gigante rebentaria o cast AQUI, fora do bloco
    -- protegido, e abortaria o lote inteiro. Na dúvida usa-se a posição real
    -- no array.
    v_input_index := CASE
                       WHEN jsonb_typeof(v_row -> 'input_index') = 'number'
                            AND (v_row ->> 'input_index') ~ '^-?[0-9]{1,9}$'
                       THEN (v_row ->> 'input_index')::integer
                       ELSE v_idx
                     END;
    v_sku := NULLIF(btrim(COALESCE(v_row ->> 'sku', '')), '');

    -- Um BEGIN ... EXCEPTION por elemento cria o SAVEPOINT implícito do
    -- plpgsql: uma linha que rebente é revertida sozinha e as restantes
    -- continuam (mesmo padrão de rpc_bulk_import_products, 20260826010000).
    BEGIN
      IF v_sku IS NULL THEN
        RAISE EXCEPTION 'SKU em falta' USING ERRCODE = 'invalid_parameter_value';
      END IF;

      -- Quantidade: só inteiro não negativo. A validação é feita em texto com
      -- regex antes de qualquer cast, para que "abc", "-3", "1,5" ou um valor
      -- em falta deem a mensagem de negócio e não um erro de conversão do
      -- Postgres. Aceita "12" e "12.0" (folhas de cálculo exportam assim).
      -- O limite de 9 dígitos evita ainda o overflow de integer.
      v_qty_txt := btrim(COALESCE(v_row ->> 'counted_quantity', ''));
      IF v_qty_txt = ''
         OR v_qty_txt !~ '^[0-9]{1,9}(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- 20270122600000: decimais aceites; a regra de inteiro (unidade contável) é aplicada depois de resolver o SKU.
      v_qty := v_qty_txt::numeric;

      -- Resolve o SKU dentro DESTA contagem (nunca no catálogo inteiro): a
      -- linha tem de já existir na sessão. Comparação robusta (maiúsculas e
      -- espaços) porque o SKU vem de scanner ou de ficheiro.
      --
      -- Um único lookup indexado no mapa pré-construído acima (D16), a
      -- substituir as duas varreduras completas que aqui estavam.
      --
      -- O mapa é um retrato tirado antes do ciclo. O único campo que o ciclo
      -- pode desatualizar é had_resolution, e só quando o MESMO SKU aparece
      -- duas vezes no mesmo lote: a 2ª passagem voltaria a pôr a NULL campos
      -- que a 1ª já pôs a NULL. É idempotente, o estado final é idêntico ao
      -- da versão anterior. line_id/product_id/snapshot são imutáveis aqui.
      SELECT m.n, m.line_id, m.product_id, m.snapshot, m.had_resolution
      INTO v_matches, v_line_id, v_product_id, v_snapshot, v_had_resolution
      FROM pg_temp._olyvia_bulk_icl_sku_map m
      WHERE m.k = upper(btrim(v_sku));

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado nesta contagem' USING ERRCODE = 'no_data_found';
      ELSIF v_matches > 1 THEN
        RAISE EXCEPTION 'SKU ambíguo' USING ERRCODE = 'cardinality_violation';
      END IF;

      IF public.fn_product_requires_integer_qty(v_product_id) AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION 'Quantidade inválida: a unidade deste produto é contável (tem de ser inteira)' USING ERRCODE = 'invalid_parameter_value';
      END IF;

      -- A partir daqui é réplica fiel de rpc_update_inventory_count_line_
      -- quantity (20261116020000:685-704) — D12. Não inventar lógica nova.
      SELECT quantity INTO v_live_qty
      FROM public.stocks
      WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

      v_moved := (COALESCE(v_live_qty, 0) IS DISTINCT FROM v_snapshot);

      -- D2: recontar uma linha já resolvida limpa a resolução anterior.
      UPDATE public.inventory_count_lines
      SET counted_quantity   = v_qty,
          counted_by         = v_actor,
          counted_at         = now(),
          -- D3: cumulativo, nunca volta a false sozinho.
          moved_during_count = moved_during_count OR v_moved,
          discrepancy_resolution = CASE WHEN v_had_resolution THEN NULL ELSE discrepancy_resolution END,
          resolution_notes       = CASE WHEN v_had_resolution THEN NULL ELSE resolution_notes END,
          stock_movement_id      = CASE WHEN v_had_resolution THEN NULL ELSE stock_movement_id END
      WHERE id = v_line_id;

      v_updated := v_updated + 1;
      v_results := v_results || jsonb_build_object(
        'input_index', v_input_index,
        'sku',         v_sku,
        'status',      'ok'
      );

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object(
        'input_index', v_input_index,
        'sku',         v_sku,
        'status',      'error',
        'error',       SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'failed',  v_failed,
    'results', v_results
  );
END;
$function$;

-- rpc_resolve_inventory_count_line
CREATE OR REPLACE FUNCTION public.rpc_resolve_inventory_count_line(p_line_id uuid, p_resolution text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_org            uuid;
  v_status         text;
  v_document_number text;
  v_product_id     uuid;
  v_warehouse_id   uuid;
  v_counted_qty    numeric;
  v_live_qty       numeric;
  v_diff           numeric;
  v_direction      text;
  v_doc            text;
  v_movement_id    uuid;
  v_balance        numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_resolution NOT IN ('ajustado', 'aceite_sem_ajuste', 'recontagem_pedida') THEN
    RAISE EXCEPTION 'Resolução desconhecida: %', p_resolution USING ERRCODE = 'check_violation';
  END IF;

  SELECT ic.organization_id, ic.status, ic.document_number, ic.warehouse_id,
         icl.product_id, icl.counted_quantity
  INTO v_org, v_status, v_document_number, v_warehouse_id, v_product_id, v_counted_qty
  FROM public.inventory_count_lines icl
  JOIN public.inventory_counts ic ON ic.id = icl.inventory_count_id
  WHERE icl.id = p_line_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para resolver discrepâncias de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  IF p_resolution = 'recontagem_pedida' THEN
    -- D4: reset completo da linha ao estado "nunca contada".
    UPDATE public.inventory_count_lines
    SET counted_quantity       = NULL,
        counted_by             = NULL,
        counted_at             = NULL,
        discrepancy_resolution = NULL,
        resolution_notes       = NULL,
        stock_movement_id      = NULL,
        moved_during_count     = false
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', NULL, 'reset', true);
  END IF;

  IF v_counted_qty IS NULL THEN
    RAISE EXCEPTION 'Não é possível resolver uma linha que ainda não foi contada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_resolution = 'aceite_sem_ajuste' THEN
    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
      RAISE EXCEPTION 'Motivo é obrigatório para aceitar a diferença sem ajuste' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.inventory_count_lines
    SET discrepancy_resolution = 'aceite_sem_ajuste',
        resolution_notes       = p_notes,
        stock_movement_id      = NULL
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', 'aceite_sem_ajuste', 'stock_movement_id', NULL);
  END IF;

  -- p_resolution = 'ajustado' — lê o saldo AO VIVO (não o snapshot), gera o
  -- movimento de ajuste reaproveitando fn_next_stock_document_number (mesma
  -- numeração NE-A-NNNN de rpc_adjust_stock, decisão D5).
  SELECT quantity INTO v_live_qty
  FROM public.stocks
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
  FOR UPDATE;

  IF v_live_qty IS NULL THEN
    -- ÚNICA alteração face à versão anterior desta função.
    --
    -- PORQUÊ: este é o caso normal da CONTAGEM INICIAL de um armazém novo (ou
    -- de um artigo nunca movimentado) — o produto existe no catálogo, está
    -- fisicamente na prateleira, mas nunca teve linha em public.stocks. Antes
    -- disto a função rebentava aqui e a contagem ficava impossível de ajustar
    -- E impossível de finalizar (ver explicação no cabeçalho da secção 3).
    --
    -- Criar a linha a ZERO, e não tratar simplesmente NULL como 0 (D14): dá um
    -- registo real para o FOR UPDATE bloquear e para o last_counted da
    -- finalização escrever.
    --
    -- ON CONFLICT sobre unique_product_warehouse UNIQUE (product_id,
    -- warehouse_id): outra transação pode ter criado a linha entretanto (ex:
    -- uma venda, ou a resolução de outra sessão de contagem). DO NOTHING em
    -- vez de DO UPDATE porque a quantidade dessa linha é a verdade — nunca a
    -- queremos esmagar com 0.
    --
    -- Colunas: organization_id, product_id, warehouse_id e created_by são as
    -- ÚNICAS NOT NULL sem default em public.stocks (F6). quantity tem default
    -- 0 mas vai explícito, para o leitor não ter de o ir confirmar.
    INSERT INTO public.stocks (
      organization_id, product_id, warehouse_id, quantity, created_by
    ) VALUES (
      v_org, v_product_id, v_warehouse_id, 0, v_actor
    )
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;

    -- Relê já com a linha criada (ou com a que a outra transação criou), e
    -- volta a tomar o lock — o FOR UPDATE de cima não travou nada, porque não
    -- havia linha para travar.
    SELECT quantity INTO v_live_qty
    FROM public.stocks
    WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
    FOR UPDATE;

    IF v_live_qty IS NULL THEN
      -- Rede de segurança: a exceção original, intacta. Chegar aqui significa
      -- que nem o nosso INSERT nem o de outrem produziram linha visível — na
      -- prática só sob REPEATABLE READ/SERIALIZABLE. Falhar é o correto.
      RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  v_diff := v_counted_qty - v_live_qty;

  IF v_diff = 0 THEN
    -- O saldo ao vivo já coincide com a contagem (ex: outro movimento entretanto
    -- corrigiu a diferença) — nada a ajustar, mas a linha fica resolvida.
    UPDATE public.inventory_count_lines
    SET discrepancy_resolution = 'ajustado',
        resolution_notes       = p_notes,
        stock_movement_id      = NULL
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', 'ajustado', 'stock_movement_id', NULL, 'adjusted_quantity', 0);
  END IF;

  v_direction := CASE WHEN v_diff > 0 THEN 'positivo' ELSE 'negativo' END;
  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, reference_id, notes, created_by
  ) VALUES (
    v_org, v_product_id, v_warehouse_id, 'ajuste_' || v_direction, abs(v_diff),
    v_doc, 'ajuste', 'Contagem física ' || v_document_number, p_line_id, p_notes, v_actor
  )
  RETURNING id, balance_after INTO v_movement_id, v_balance;

  UPDATE public.inventory_count_lines
  SET discrepancy_resolution = 'ajustado',
      resolution_notes       = p_notes,
      stock_movement_id      = v_movement_id
  WHERE id = p_line_id;

  RETURN jsonb_build_object(
    'id', p_line_id,
    'discrepancy_resolution', 'ajustado',
    'stock_movement_id', v_movement_id,
    'adjusted_quantity', abs(v_diff),
    'balance_after', v_balance
  );
END;
$function$;

-- cat_definir_armazem_produto
CREATE OR REPLACE FUNCTION public.cat_definir_armazem_produto(p_product_id uuid, p_warehouse_id uuid, p_ativo boolean, p_minimo numeric DEFAULT NULL::numeric, p_maximo numeric DEFAULT NULL::numeric, p_ponto_encomenda numeric DEFAULT NULL::numeric, p_localizacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prod   record;
  v_wh     warehouses;
  v_user   uuid;
  s        stocks;
  v_motivo text;
  v_n      integer;
  v_int    boolean := public.fn_product_requires_integer_qty(p_product_id);  -- 20270122600000
  v_loc    text := nullif(btrim(coalesce(p_localizacao, '')), '');
BEGIN
  SELECT id, organization_id, manages_stock, name INTO v_prod FROM products
  WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_user := public.fn_cat_exigir(v_prod.organization_id, 'inventory.edit');
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;
  IF p_ativo IS NULL THEN RAISE EXCEPTION 'Indique se o armazém fica ativo.' USING ERRCODE = 'CT002'; END IF;
  SELECT * INTO v_wh FROM warehouses WHERE id = p_warehouse_id AND organization_id = v_prod.organization_id AND deleted_at IS NULL;
  IF v_wh.id IS NULL THEN RAISE EXCEPTION 'Armazém não encontrado nesta organização.' USING ERRCODE = 'CT003'; END IF;
  -- stocks guarda valores ≥ 0 (inteiros quando a unidade do produto é contável; 20270122600000)
  IF (p_minimo IS NOT NULL AND (p_minimo < 0 OR (v_int AND p_minimo <> trunc(p_minimo)) OR p_minimo > 2147483647))
     OR (p_maximo IS NOT NULL AND (p_maximo < 0 OR (v_int AND p_maximo <> trunc(p_maximo)) OR p_maximo > 2147483647))
     OR (p_ponto_encomenda IS NOT NULL AND (p_ponto_encomenda < 0 OR (v_int AND p_ponto_encomenda <> trunc(p_ponto_encomenda)) OR p_ponto_encomenda > 2147483647)) THEN
    RAISE EXCEPTION 'Mínimo, máximo e ponto de encomenda são números 0 ou mais (inteiros quando a unidade do produto é contável).' USING ERRCODE = 'CT002';
  END IF;
  IF v_loc IS NOT NULL AND char_length(v_loc) > 200 THEN
    RAISE EXCEPTION 'Localização demasiado longa (máx. 200 caracteres).' USING ERRCODE = 'CT002';
  END IF;

  -- a mesma ordem de bloqueio dos movimentos (produto, depois a linha de stocks)
  PERFORM 1 FROM products WHERE id = p_product_id FOR NO KEY UPDATE;
  SELECT * INTO s FROM stocks WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id FOR UPDATE;
  PERFORM set_config('app.audit_source', 'catalogo', true);

  IF p_ativo THEN
    IF NOT v_wh.is_active AND (s.id IS NULL OR s.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'O armazém % está inativo: ative-o no Inventário antes de lhe ligar produtos.', v_wh.name USING ERRCODE = 'CT002';
    END IF;
    IF s.id IS NULL THEN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, minimum_quantity, maximum_quantity, reorder_point,
                          location, created_by)
      VALUES (v_wh.organization_id, p_product_id, p_warehouse_id, 0, coalesce(p_minimo, 0), coalesce(p_maximo, 0),
              coalesce(p_ponto_encomenda, 0), v_loc, v_user);
      v_motivo := 'Armazém ligado ao produto.';
    ELSE
      UPDATE stocks SET
        deleted_at = NULL, deleted_by = NULL,
        minimum_quantity = coalesce(p_minimo, minimum_quantity),
        maximum_quantity = coalesce(p_maximo, maximum_quantity),
        reorder_point = coalesce(p_ponto_encomenda, reorder_point),
        location = CASE WHEN p_localizacao IS NULL THEN location ELSE v_loc END,
        updated_at = now()
      WHERE id = s.id;
      v_motivo := CASE WHEN s.deleted_at IS NOT NULL THEN 'Armazém voltou a ficar ligado ao produto.' ELSE 'Dados do armazém atualizados.' END;
    END IF;
    -- 20270101240000: os armazéns só dizem onde o produto está/pode estar; manages_stock não muda aqui
    RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', v_prod.manages_stock);
  END IF;

  -- ── desligar ──
  IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'O armazém já não estava ligado ao produto.', 'gere_stock', v_prod.manages_stock);
  END IF;
  -- 20270101240000: as regras de bloqueio vivem em fn_cat_armazem_bloqueios (partilhadas com cat_definir_armazem_produtos);
  -- as mensagens são as mesmas de antes.
  SELECT b.motivo INTO v_motivo FROM public.fn_cat_armazem_bloqueios(v_prod.organization_id, p_warehouse_id, ARRAY[p_product_id]) b LIMIT 1;
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'CT002'; END IF;

  UPDATE stocks SET deleted_at = now(), deleted_by = v_user, updated_at = now() WHERE id = s.id;
  v_motivo := 'Armazém desligado do produto.';
  RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', v_prod.manages_stock);
END $function$;
