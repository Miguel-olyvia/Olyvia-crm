-- ============================================================
-- SLA de fornecedores: prazo de entrega acordado vs. data real de entrega.
--
-- O que esta migration faz
-- --------------------------
--   1. suppliers.delivery_sla_days — prazo de entrega acordado com o
--      fornecedor, em dias, contado a partir de purchase_orders.order_date.
--      Opcional (NULL = sem SLA definido para este fornecedor).
--   2. purchase_orders.actual_delivery_date — data real em que a encomenda
--      foi fisicamente entregue. Preenchida manualmente pelo utilizador ao
--      marcar a encomenda como recebida (pode diferir da data em que a
--      receção é registada no sistema, ex. encomenda entregue numa
--      sexta-feira mas só registada no sistema na segunda seguinte).
--   3. rpc_receive_purchase_order / rpc_receive_purchase_order_lines passam
--      a aceitar p_actual_delivery_date (novo parâmetro, DEFAULT NULL) e a
--      gravar actual_delivery_date = COALESCE(p_actual_delivery_date,
--      current_date) SÓ quando a encomenda fica totalmente recebida
--      (status='received'). Numa receção parcial (status='partially_received')
--      actual_delivery_date não é tocado — só a entrega que fecha a encomenda
--      conta para efeitos de SLA. Lógica existente preservada a 100%: única
--      alteração é este novo parâmetro + a gravação condicional da data.
--   4. rpc_get_supplier_sla_report(p_supplier_id) — relatório agregado de
--      cumprimento de SLA por fornecedor (todos os fornecedores da
--      organização do utilizador, ou só 1 quando p_supplier_id é indicado).
--   5. rpc_get_supplier_sla_orders(p_supplier_id) — lista detalhada das
--      encomendas recebidas desse fornecedor, com o desvio ao SLA linha a
--      linha.
--
-- Porque DROP FUNCTION antes de CREATE OR REPLACE nos 2 RPCs de receção
-- -----------------------------------------------------------------------
-- Acrescentar um parâmetro a uma função já existente muda a assinatura
-- (lista de tipos dos argumentos) — CREATE OR REPLACE FUNCTION só substitui
-- uma função com a MESMA assinatura; com uma assinatura diferente cria um
-- OVERLOAD novo, deixando o antigo por remover. Isso reproduziria
-- exatamente o bug já visto e corrigido neste projeto em
-- 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql: o PostgREST
-- fica incapaz de decidir qual dos 2 overloads chamar quando o frontend
-- chama só com os parâmetros antigos (PGRST203 "Multiple Choices"), porque
-- o novo parâmetro tem DEFAULT NULL e portanto pode ser omitido. Por isso,
-- tal como nessa correção anterior, esta migration remove primeiro a
-- assinatura antiga com DROP FUNCTION IF EXISTS antes de recriar a função
-- com o parâmetro novo — nenhuma perda de comportamento para quem já chama
-- só com os parâmetros antigos (o novo é opcional, DEFAULT NULL).
--
-- Segurança / multi-tenant dos 2 RPCs novos (rpc_get_supplier_sla_report/
-- _orders) — mesmo padrão já usado por rpc_receive_purchase_order(_lines):
-- SECURITY DEFINER, organização resolvida a partir do próprio fornecedor
-- (ou de get_user_visible_org_ids(auth.uid()) quando não há um fornecedor
-- concreto) e dupla verificação de permissão (suppliers.view E
-- purchase_orders.view, ambas já existentes desde 20261102020000/
-- 20261113290000) — mesmo espírito de dupla verificação usado em
-- rpc_receive_purchase_order (purchase_orders.edit + purchase_orders.receive
-- + inventory.edit) e em rpc_list_client_order_documents (inventory.view +
-- client_contracts.view). Ambos respeitam deleted_at IS NULL em suppliers e
-- em purchase_orders.
--
-- Prerequisitos: 20261113280000/20261113290000/20261114040000/20261115210000
-- (rpc_receive_purchase_order / rpc_receive_purchase_order_lines nas versões
-- vivas atuais, confirmadas por pg_get_functiondef() na BD remota antes
-- desta migration), 20261102020000 (suppliers.view/purchase_orders.view).
-- ============================================================


-- ============================================================
-- 1. suppliers.delivery_sla_days
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS delivery_sla_days integer;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_delivery_sla_days_positive
    CHECK (delivery_sla_days IS NULL OR delivery_sla_days > 0);

COMMENT ON COLUMN public.suppliers.delivery_sla_days IS
  'Prazo de entrega acordado com o fornecedor, em dias, contado a partir de '
  'purchase_orders.order_date. NULL = sem SLA definido para este fornecedor '
  '(rpc_get_supplier_sla_report devolve within_sla/over_sla/compliance_pct a '
  'NULL nesse caso — não há SLA para comparar).';


-- ============================================================
-- 2. purchase_orders.actual_delivery_date
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS actual_delivery_date date;

COMMENT ON COLUMN public.purchase_orders.actual_delivery_date IS
  'Data real em que a encomenda foi fisicamente entregue, preenchida '
  'manualmente pelo utilizador ao marcar a encomenda como recebida (pode '
  'diferir da data em que a receção é registada no sistema). Gravada por '
  'rpc_receive_purchase_order/rpc_receive_purchase_order_lines só quando a '
  'encomenda fica totalmente recebida (status=''received''), nunca numa '
  'receção parcial.';


-- ============================================================
-- 3. rpc_receive_purchase_order_lines — acrescenta p_actual_delivery_date.
--    Corpo idêntico à versão viva atual (20261115210000, confirmada por
--    pg_get_functiondef contra a BD remota), só com o parâmetro novo e a
--    gravação condicional de actual_delivery_date no UPDATE final.
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_receive_purchase_order_lines(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(
    p_purchase_order_id    uuid,
    p_warehouse_id         uuid,
    p_lines                jsonb,
    p_actual_delivery_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor            uuid;
  v_po               public.purchase_orders%ROWTYPE;
  v_line_input       jsonb;
  v_line_id          uuid;
  v_qty_requested    numeric;
  v_qty_int          integer;
  v_item             record;
  v_item_supplier_id uuid;
  v_remaining        numeric;
  v_balance          integer;
  v_received_total   numeric;
  v_lines_out        jsonb := '[]'::jsonb;
  v_sum_quantity     numeric;
  v_sum_received     numeric;
  v_new_status       text;
  v_skip_stock       boolean;
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

  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
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

  -- Ligada a uma Encomenda Cliente = já tem destino certo, não entra no
  -- stock geral (20261115210000).
  v_skip_stock := (v_po.source_type = 'contract');

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description
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

    IF v_qty_requested <> floor(v_qty_requested) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
        USING ERRCODE = 'check_violation';
    END IF;

    v_remaining := v_item.quantity - v_item.received_quantity;
    IF v_qty_requested > v_remaining THEN
      RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
        v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_qty_int := v_qty_requested::integer;
    v_balance := NULL;

    IF v_skip_stock THEN
      -- Sem movimento de entrada — a encomenda já tem destino certo (cliente
      -- final), não passa pelo stock geral. balance_after fica NULL no
      -- output (informativo, não há stock_movements gerado para esta linha).
      NULL;
    ELSE
      SELECT id INTO v_item_supplier_id
      FROM public.item_suppliers
      WHERE product_id = v_item.product_id
        AND supplier_id = v_po.supplier_id
        AND deleted_at IS NULL
      ORDER BY is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_qty_int,
        v_po.order_number, 'compra', v_item_supplier_id, v_item.unit_price,
        v_item.id,
        format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
               v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity),
        v_actor
      )
      RETURNING balance_after INTO v_balance;
    END IF;

    UPDATE public.purchase_order_items
    SET received_quantity = received_quantity + v_qty_requested
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance,
      'stock_updated',            NOT v_skip_stock
    );
  END LOOP;

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
    'stock_skipped',  v_skip_stock
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order_lines(uuid, uuid, jsonb, date) IS
  'Regista a receção (total ou parcial) de 1+ linhas de produto de uma '
  'encomenda. Se a encomenda NÃO estiver ligada a uma Encomenda Cliente '
  '(source_type IS DISTINCT FROM ''contract''): gera 1 movimento de entrada '
  'em stock_movements por linha (reference_id = purchase_order_items.id), '
  'como sempre. Se estiver ligada (já tem cliente final): salta o stock, só '
  'atualiza received_quantity/status (20261115210000). Quando a receção '
  'fecha a encomenda (status=''received''), grava também '
  'actual_delivery_date = COALESCE(p_actual_delivery_date, current_date) '
  '(20261130010000) — não gravado em receção parcial. Exige '
  'purchase_orders.edit + .receive + inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order_lines(uuid, uuid, jsonb, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order_lines(uuid, uuid, jsonb, date) TO authenticated;


-- ============================================================
-- 4. rpc_receive_purchase_order — wrapper fino. Corpo idêntico à versão viva
--    atual (20261114040000, confirmada por pg_get_functiondef contra a BD
--    remota), só com o parâmetro novo: passa-o ao RPC delegado, e grava-o
--    também no caminho direto do edge case "encomenda só com serviços"
--    (que não passa por rpc_receive_purchase_order_lines).
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_receive_purchase_order(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(
    p_purchase_order_id    uuid,
    p_warehouse_id         uuid,
    p_actual_delivery_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_product_lines boolean;
  v_lines             jsonb;
  v_actor             uuid;
  v_org               uuid;
  v_status            text;
  v_order_number      text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  ) INTO v_has_product_lines;

  IF NOT v_has_product_lines THEN
    -- Edge case documentado desde 20261114040000: encomenda só com linhas de
    -- serviço (sem stock físico) não tem p_lines possível para construir
    -- (rpc_receive_purchase_order_lines exige não-vazio). Replica o
    -- comportamento do RPC original (20261113280000): marca a encomenda como
    -- recebida diretamente, sem stock_movements nenhum, com os mesmos checks
    -- de status/permissão/organização/armazém. É sempre receção TOTAL, por
    -- isso grava actual_delivery_date aqui também (20261130010000).
    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT organization_id, status, order_number
    INTO v_org, v_status, v_order_number
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status = 'received' THEN
      RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'cancelled' THEN
      RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
    END IF;

    IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
       OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
       OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.warehouses
      WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.purchase_orders
    SET status = 'received',
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
      'order_number', v_order_number,
      'warehouse_id', p_warehouse_id,
      'status',       'received',
      'lines',        '[]'::jsonb
    );
  END IF;

  -- Caminho normal: monta p_lines com todas as linhas de produto ainda por
  -- receber, na quantidade remanescente — e delega, incluindo
  -- p_actual_delivery_date. Linhas já totalmente recebidas (quantity <=
  -- received_quantity) ficam de fora.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_item_id', id,
           'quantity', (quantity - received_quantity)
         )), '[]'::jsonb)
  INTO v_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id
    AND item_type = 'product'
    AND quantity > received_quantity;

  RETURN public.rpc_receive_purchase_order_lines(p_purchase_order_id, p_warehouse_id, v_lines, p_actual_delivery_date);
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order(uuid, uuid, date) IS
  'Wrapper fino (20261114040000) sobre rpc_receive_purchase_order_lines: '
  'recebe TODAS as linhas de produto ainda por receber, na quantidade '
  'remanescente — mesmo comportamento de sempre para quem já chama este RPC '
  '(receção total). p_actual_delivery_date (20261130010000, DEFAULT NULL) é '
  'repassado ao RPC delegado e gravado (COALESCE com current_date) também no '
  'edge case local de encomenda só com serviços. Exige purchase_orders.edit + '
  'purchase_orders.receive + inventory.edit. Para receção parcial explícita, '
  'usar rpc_receive_purchase_order_lines diretamente.';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order(uuid, uuid, date) TO authenticated;


-- ============================================================
-- 5. rpc_get_supplier_sla_report — relatório agregado de cumprimento de SLA
--    por fornecedor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_report(
    p_supplier_id uuid DEFAULT NULL
) RETURNS TABLE (
    supplier_id     uuid,
    supplier_name   text,
    total_received  integer,
    within_sla      integer,
    over_sla        integer,
    avg_delay_days  numeric,
    compliance_pct  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.view')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver o relatório de SLA de fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id                 AS b_supplier_id,
      s.name                AS b_supplier_name,
      s.delivery_sla_days   AS b_sla_days
    FROM public.suppliers s
    WHERE s.deleted_at IS NULL
      AND s.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
      AND (p_supplier_id IS NULL OR s.id = p_supplier_id)
  ),
  received AS (
    SELECT
      po.supplier_id           AS r_supplier_id,
      po.order_date             AS r_order_date,
      po.actual_delivery_date   AS r_actual_delivery_date
    FROM public.purchase_orders po
    WHERE po.deleted_at IS NULL
      AND po.status = 'received'
      AND po.actual_delivery_date IS NOT NULL
  )
  SELECT
    b.b_supplier_id   AS supplier_id,
    b.b_supplier_name AS supplier_name,
    COUNT(r.r_actual_delivery_date)::integer AS total_received,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_actual_delivery_date IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) <= b.b_sla_days
      )::integer
    END AS within_sla,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_actual_delivery_date IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) > b.b_sla_days
      )::integer
    END AS over_sla,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      ROUND(
        AVG(r.r_actual_delivery_date - r.r_order_date - b.b_sla_days) FILTER (
          WHERE r.r_actual_delivery_date IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) > b.b_sla_days
        ),
        1
      )
    END AS avg_delay_days,
    CASE WHEN b.b_sla_days IS NULL OR COUNT(r.r_actual_delivery_date) = 0 THEN NULL ELSE
      ROUND(
        COUNT(*) FILTER (
          WHERE r.r_actual_delivery_date IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) <= b.b_sla_days
        )::numeric
        / COUNT(r.r_actual_delivery_date) * 100
      )
    END AS compliance_pct
  FROM base b
  LEFT JOIN received r ON r.r_supplier_id = b.b_supplier_id
  GROUP BY b.b_supplier_id, b.b_supplier_name, b.b_sla_days
  ORDER BY b.b_supplier_name;
END;
$$;

COMMENT ON FUNCTION public.rpc_get_supplier_sla_report(uuid) IS
  'Relatório agregado de cumprimento de SLA de entrega por fornecedor '
  '(20261130010000). Sem p_supplier_id: todos os fornecedores da(s) '
  'organização(ões) visível(eis) do utilizador. total_received conta '
  'encomendas status=''received'' com actual_delivery_date preenchida, '
  'independentemente de haver SLA definido. within_sla/over_sla/'
  'avg_delay_days/compliance_pct ficam NULL quando '
  'suppliers.delivery_sla_days é NULL (sem SLA para comparar). SECURITY '
  'DEFINER — exige suppliers.view E purchase_orders.view, organização em '
  'scope do utilizador, respeita deleted_at IS NULL em suppliers e '
  'purchase_orders.';

REVOKE ALL ON FUNCTION public.rpc_get_supplier_sla_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_supplier_sla_report(uuid) TO authenticated;


-- ============================================================
-- 6. rpc_get_supplier_sla_orders — lista detalhada das encomendas recebidas
--    de 1 fornecedor concreto, com o desvio ao SLA linha a linha.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_orders(
    p_supplier_id uuid
) RETURNS TABLE (
    order_number         text,
    order_date           date,
    expected_delivery    date,
    actual_delivery_date date,
    delivery_sla_days    integer,
    days_taken           integer,
    is_within_sla        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org      uuid;
  v_sla_days integer;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.organization_id, s.delivery_sla_days
  INTO v_org, v_sla_days
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'suppliers.view')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas deste fornecedor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    po.order_number,
    po.order_date,
    po.expected_delivery,
    po.actual_delivery_date,
    v_sla_days AS delivery_sla_days,
    (po.actual_delivery_date - po.order_date)::integer AS days_taken,
    CASE WHEN v_sla_days IS NULL THEN NULL
         ELSE (po.actual_delivery_date - po.order_date) <= v_sla_days
    END AS is_within_sla
  FROM public.purchase_orders po
  WHERE po.supplier_id = p_supplier_id
    AND po.deleted_at IS NULL
    AND po.status = 'received'
    AND po.actual_delivery_date IS NOT NULL
  ORDER BY po.actual_delivery_date DESC, po.order_number DESC;
END;
$$;

COMMENT ON FUNCTION public.rpc_get_supplier_sla_orders(uuid) IS
  'Lista detalhada (20261130010000) das encomendas status=''received'' com '
  'actual_delivery_date preenchida de 1 fornecedor concreto, com '
  'days_taken e is_within_sla (NULL quando o fornecedor não tem '
  'delivery_sla_days definido) linha a linha. SECURITY DEFINER — exige '
  'suppliers.view E purchase_orders.view, organização do fornecedor em '
  'scope do utilizador, respeita deleted_at IS NULL em suppliers e '
  'purchase_orders.';

REVOKE ALL ON FUNCTION public.rpc_get_supplier_sla_orders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_supplier_sla_orders(uuid) TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration)
-- ============================================================
--
-- 1. rpc_receive_purchase_order(po_id, warehouse_id) sem p_actual_delivery_date
--    (chamada antiga, 2 args) continua a funcionar sem alteração de
--    comportamento — DROP FUNCTION IF EXISTS da assinatura de 2 args elimina
--    o overload antigo, a nova função de 3 args (3º com DEFAULT NULL) cobre
--    a mesma chamada.
-- 2. Receção total (sem receção prévia) grava actual_delivery_date =
--    current_date quando p_actual_delivery_date é omitido, ou o valor
--    indicado quando fornecido.
-- 3. Receção parcial (status devolvido 'partially_received') NÃO grava
--    actual_delivery_date (permanece NULL).
-- 4. Receção que fecha uma encomenda já parcialmente recebida (status final
--    'received') grava actual_delivery_date nesse momento.
-- 5. Encomenda só com serviços (edge case do wrapper) grava
--    actual_delivery_date também.
-- 6. rpc_get_supplier_sla_report sem p_supplier_id devolve 1 linha por
--    fornecedor da organização do utilizador; fornecedor sem
--    delivery_sla_days aparece com within_sla/over_sla/avg_delay_days/
--    compliance_pct a NULL e total_received correto.
-- 7. rpc_get_supplier_sla_report(supplier_id) filtra para 1 só fornecedor;
--    fornecedor de outra organização (fora do scope) devolve 0 linhas.
-- 8. rpc_get_supplier_sla_orders(supplier_id) inexistente ou sem
--    permissão/scope: rejeitado com no_data_found / insufficient_privilege.
