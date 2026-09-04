-- Fase 4B do plano de inventário (plano-fornecedores-multi-stock.md, secção 5.4):
-- RPCs de registo de movimento (entrada, transferência, ajuste, devolução a
-- fornecedor, quebra) + geração de document_number. Continua sem UI/ecrã —
-- isso é o passo seguinte desta mesma fase, depois de validar os RPCs.
--
-- Decisão que se afasta da minuta literal do plano (5.1, "document_number
-- gerado por sequência dedicada por tipo"): NÃO uso CREATE SEQUENCE global.
-- purchase_orders.order_number usava exatamente esse padrão (sequência/MAX
-- global) e foi corrigido em 20261110310000_warehouses_and_purchase_orders_
-- org_scoped_unique.sql precisamente porque causava colisões entre
-- organizações diferentes a competir pelo "próximo" número. fn_next_stock_
-- document_number() replica o padrão já corrigido (generate_po_number):
-- MAX(...) + 1 calculado por organização, não uma sequência Postgres única
-- partilhada por todos os tenants.
--
-- Mesma limitação aceite que já existe em generate_po_number (não resolvida
-- aqui, nem lá): MAX+1 sem lock explícito pode, em teoria, dar o mesmo número
-- a dois movimentos inseridos em paralelo pela mesma organização no mesmo
-- instante. Ao contrário de purchase_orders (order_number tem UNIQUE por
-- organização, por isso uma colisão real falha com erro), stock_movements
-- não tem unicidade em document_number — de propósito, uma transferência
-- grava DUAS linhas com o mesmo número. Uma colisão rara entre duas compras
-- simultâneas seria só um problema cosmético de rastreio (dois documentos
-- distintos com o mesmo número visível), nunca um problema de integridade do
-- saldo — isso continua garantido pelo trigger da 20261113260000,
-- independente de document_number.
--
-- Prerequisitos: 20261113260000 (stock_movements, fn_stock_movements_apply,
-- rpc_decrement_stock), 20261112110000 (item_suppliers).

-- ============================================================
-- 1. fn_next_stock_document_number — NE-V-0001 / NE-C-0001 / NE-T-0001 / NE-A-0001,
--    numeração por organização (nunca global).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_next_stock_document_number(
    p_organization_id uuid,
    p_document_type   text
) RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix text;
  v_next   integer;
BEGIN
  v_prefix := CASE p_document_type
    WHEN 'venda'         THEN 'NE-V-'
    WHEN 'compra'        THEN 'NE-C-'
    WHEN 'transferencia' THEN 'NE-T-'
    WHEN 'ajuste'         THEN 'NE-A-'
    ELSE NULL
  END;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'document_type desconhecido: %', p_document_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(MAX(
    CASE
      WHEN document_number ~ ('^' || v_prefix || '[0-9]+$')
      THEN substring(document_number FROM (length(v_prefix) + 1))::integer
      ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM public.stock_movements
  WHERE organization_id = p_organization_id
    AND document_number LIKE (v_prefix || '%');

  RETURN v_prefix || lpad(v_next::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_next_stock_document_number IS
  'Próximo número de documento (NE-V/C/T/A-NNNN), calculado por organização — '
  'mesmo padrão de generate_po_number() (20261110310000), nunca uma sequência '
  'Postgres global partilhada entre tenants.';

-- rpc_decrement_stock (20261113260000) passa a gerar o número automaticamente
-- quando o chamador não o fornece — mesma assinatura, só o corpo muda.
CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(
    p_product_id     uuid,
    p_warehouse_id   uuid,
    p_qty            integer,
    p_document_number text,
    p_document_type   text,
    p_counterparty    text DEFAULT NULL,
    p_notes           text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_doc := COALESCE(p_document_number, public.fn_next_stock_document_number(v_org, p_document_type));

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'saida', p_qty,
    v_doc, p_document_type, p_counterparty, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 2. rpc_register_stock_entry — entrada (compra). Exige item_suppliers ativo
--    do produto (5.2.2 do plano: "não é possível comprar sem fornecedor") —
--    custo e código de compra vêm daí, não de parâmetros soltos, para nunca
--    divergirem do que está realmente configurado para esse par.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_stock_entry(
    p_product_id       uuid,
    p_warehouse_id     uuid,
    p_qty              integer,
    p_item_supplier_id uuid,
    p_unit_cost        numeric DEFAULT NULL,
    p_counterparty     text DEFAULT NULL,
    p_notes            text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_price  numeric;
  v_sku    text;
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

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
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
$$;

-- ============================================================
-- 3. rpc_register_stock_transfer — 2 linhas ligadas por transfer_group_id,
--    mesma transação. Preserva o custo médio da origem no destino (o
--    trigger só recalcula average_cost quando unit_cost_at_time vem
--    preenchido — sem isto, o destino ficaria com average_cost NULL numa
--    primeira transferência para um armazém novo).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_stock_transfer(
    p_product_id        uuid,
    p_from_warehouse_id uuid,
    p_to_warehouse_id   uuid,
    p_qty               integer,
    p_notes             text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_source_cost numeric(12,4);
  v_group       uuid;
  v_doc         text;
  v_from_balance integer;
  v_to_balance   integer;
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
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- O armazém de destino tem de pertencer à mesma organização.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_to_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém de destino inválido para esta organização' USING ERRCODE = 'check_violation';
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
$$;

-- ============================================================
-- 4. rpc_adjust_stock — contagem física / correção de inventário.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_adjust_stock(
    p_product_id   uuid,
    p_warehouse_id uuid,
    p_qty          integer,
    p_direction    text,  -- 'positivo' | 'negativo'
    p_reason       text,
    p_notes        text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
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
$$;

-- ============================================================
-- 5. rpc_register_supplier_return — devolução a fornecedor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_supplier_return(
    p_product_id       uuid,
    p_warehouse_id     uuid,
    p_qty              integer,
    p_item_supplier_id uuid,
    p_notes            text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_result integer;
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
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
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
$$;

-- ============================================================
-- 6. rpc_register_stock_loss — quebra/perda.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_stock_loss(
    p_product_id   uuid,
    p_warehouse_id uuid,
    p_qty          integer,
    p_reason       text,
    p_notes        text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
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
$$;

-- ============================================================
-- 7. GRANTs
-- ============================================================

REVOKE ALL ON FUNCTION public.rpc_register_stock_entry FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_stock_transfer FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_adjust_stock FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_supplier_return FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_stock_loss FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_register_stock_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_supplier_return TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_loss TO authenticated;
