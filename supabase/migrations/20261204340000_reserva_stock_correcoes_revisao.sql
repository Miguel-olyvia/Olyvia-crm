-- Encomendas de Cliente — reserva de stock por ordem: correções da revisão.
--
-- Base: pg_get_functiondef() das versões VIVAS (após 20261204310000,
-- 20261204320000 e 20261204330000). CREATE OR REPLACE mantém dono, GRANTs,
-- SECURITY DEFINER e search_path; as assinaturas e os tipos de retorno não
-- mudam (não há DROP).
--
-- 1. Estado das linhas parciais (fn_client_order_line_reservations, get, list)
--    * is_served passa a significar "linha concluída":
--      qty_served + qty_received >= qty_needed. Antes, qualquer saída do
--      (contrato, produto) marcava TODAS as linhas desse produto como
--      servidas, e uma linha com parte servida e parte em PO por receber
--      aparecia 'servido_por_stock'.
--    * qty_served = venda automática: necessária menos a parte que ficou a
--      descoberto; saída manual: a saída do (contrato, produto) repartida por
--      ordem (seq) até à quantidade realmente saída.
--    * A receção de POs com source_type='contract' não dá entrada em stock
--      (rpc_receive_purchase_order_lines, v_skip_stock): a parte recebida
--      conta como entregue à encomenda.
--    * Estados: concluída -> 'recebido' (houve parte pedida, recebida) ou
--      'servido_por_stock'; parte servida/reservada + parte em PO por receber
--      ou em falta -> 'parcial'. Na lista: 'received' / 'stock' / 'partial'.
--    * qty_reserved continua a 0 em linhas com venda/saída (regra de uma
--      saída por (contrato, produto) mantida em
--      rpc_confirm_client_order_stock_exit): a reserva nunca conta a parte
--      servida; o que ficou por servir passa a qty_missing.
-- 2. rpc_confirm_client_order_stock_exit: valida o stock do armazém escolhido
--    (depois do lock por produto).
-- 3. fn_client_order_request_missing: SET lock_timeout = '2s' — uma espera
--    por locks levanta lock_not_available (apanhado pelo WHEN OTHERS de
--    fn_contract_supplier_request) em vez de o statement_timeout cancelar a
--    assinatura.
-- 4. Fornecedor preferido: + is_active = true e organization_id = org do
--    contrato (ambas as colunas são NOT NULL). Mesmo critério em
--    fn_client_order_request_missing e em has_preferred_supplier.
-- 5. rpc_get_client_order_document: missing_lines_count / can_request_missing
--    só contam linhas requisitáveis; nova chave missing_units_total. Nova
--    chave por linha: qty_served.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- public.fn_client_order_line_reservations
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint, is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric, qty_received numeric, qty_reserved numeric, qty_missing numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH contracts AS (
    SELECT
      cc.id AS c_id,
      COALESCE(cc.signature_date, cc.status_changed_at, cc.created_at) AS c_sort_ts,
      COALESCE(
        cc.quote_id,
        (
          SELECT q2.id
          FROM public.quotes q2
          WHERE q2.proposal_id = cc.proposal_id
          ORDER BY q2.created_at DESC
          LIMIT 1
        )
      ) AS c_quote_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status IN ('signed', 'assinado')
  ),
  lines AS (
    SELECT
      c.c_id                AS l_contract_id,
      c.c_sort_ts           AS l_sort_ts,
      ql.id                 AS l_quote_line_id,
      NULL::integer         AS l_component_index,
      ql.product_id         AS l_product_id,
      GREATEST(COALESCE(ql.qt * COALESCE(ql.units_per_uom, 1), 0), 0)::numeric AS l_qty_needed
    FROM contracts c
    JOIN public.quote_lines ql ON ql.quote_id = c.c_quote_id
    JOIN public.products p ON p.id = ql.product_id
    WHERE ql.product_id IS NOT NULL
      AND (p_product_ids IS NULL OR ql.product_id = ANY (p_product_ids))

    UNION ALL

    SELECT
      c.c_id,
      c.c_sort_ts,
      ql.id,
      comp.ord::integer,
      p.id,
      GREATEST(COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1), 0)::numeric
    FROM contracts c
    JOIN public.quote_lines ql
      ON ql.quote_id = c.c_quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
      WITH ORDINALITY AS comp(value, ord)
    JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
    WHERE comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
      AND (p_product_ids IS NULL OR p.id = ANY (p_product_ids))
  ),
  org_stock AS (
    SELECT s.product_id AS os_product_id, SUM(s.quantity)::numeric AS os_qty
    FROM public.stocks s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.deleted_at IS NULL
      AND w.organization_id = p_organization_id
      AND w.deleted_at IS NULL
      AND s.product_id IN (SELECT l.l_product_id FROM lines l)
    GROUP BY s.product_id
  ),
  sold AS (
    SELECT
      sm.sale_source_id AS sd_contract_id,
      sm.reference_id   AS sd_quote_line_id,
      sm.product_id     AS sd_product_id,
      SUM(LEAST(sm.quantity, GREATEST(0, -sm.balance_after)))::numeric AS sd_short
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.movement_type = 'venda'
      AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
    GROUP BY sm.sale_source_id, sm.reference_id, sm.product_id
  ),
  exits AS (
    SELECT
      sm.sale_source_id AS ex_contract_id,
      sm.product_id     AS ex_product_id,
      SUM(sm.quantity)::numeric AS ex_qty
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.movement_type = 'saida'
      AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
    GROUP BY sm.sale_source_id, sm.product_id
  ),
  po_items AS (
    SELECT
      po.source_id         AS pi_contract_id,
      poi.product_id       AS pi_product_id,
      poi.quote_line_id    AS pi_quote_line_id,
      poi.component_index  AS pi_component_index,
      (poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS pi_qty,
      (
        CASE WHEN po.status = 'received' THEN poi.quantity
             ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
        END * COALESCE(poi.units_per_uom, 1)
      )::numeric AS pi_recv
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id IN (SELECT c.c_id FROM contracts c)
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id IS NOT NULL
  ),
  po_linked AS (
    SELECT pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id,
           SUM(pi_qty) AS pl_qty, SUM(pi_recv) AS pl_recv
    FROM po_items
    WHERE pi_quote_line_id IS NOT NULL
    GROUP BY pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id
  ),
  po_pool AS (
    SELECT pi_contract_id, pi_product_id,
           SUM(pi_qty) AS pp_qty, SUM(pi_recv) AS pp_recv
    FROM po_items
    WHERE pi_quote_line_id IS NULL
    GROUP BY pi_contract_id, pi_product_id
  ),
  step1 AS (
    SELECT
      l.*,
      COALESCE(l.l_component_index, 0)                          AS s1_comp_key,
      (sd.sd_contract_id IS NOT NULL)                           AS s1_is_sold,
      COALESCE(sd.sd_short, 0)                                  AS s1_short_at_sale,
      (ex.ex_contract_id IS NOT NULL)                           AS s1_has_exit,
      COALESCE(ex.ex_qty, 0)                                    AS s1_exit_pool,
      LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))             AS s1_linked_qty,
      LEAST(COALESCE(pl.pl_recv, 0), l.l_qty_needed, COALESCE(pl.pl_qty, 0)) AS s1_linked_recv,
      COALESCE(pp.pp_qty, 0)                                    AS s1_pool_qty,
      COALESCE(pp.pp_recv, 0)                                   AS s1_pool_recv,
      GREATEST(0, COALESCE(os.os_qty, 0))                       AS s1_stock,
      GREATEST(0, -COALESCE(os.os_qty, 0))                      AS s1_stock_debt
    FROM lines l
    LEFT JOIN sold sd
      ON sd.sd_contract_id   = l.l_contract_id
     AND sd.sd_quote_line_id = l.l_quote_line_id
     AND sd.sd_product_id    = l.l_product_id
     AND l.l_component_index IS NULL
    LEFT JOIN exits ex
      ON ex.ex_contract_id = l.l_contract_id
     AND ex.ex_product_id  = l.l_product_id
    LEFT JOIN po_linked pl
      ON pl.pi_contract_id   = l.l_contract_id
     AND pl.pi_quote_line_id = l.l_quote_line_id
     AND pl.pi_component_index IS NOT DISTINCT FROM l.l_component_index
     AND pl.pi_product_id    = l.l_product_id
    LEFT JOIN po_pool pp
      ON pp.pi_contract_id = l.l_contract_id
     AND pp.pi_product_id  = l.l_product_id
    LEFT JOIN org_stock os
      ON os.os_product_id = l.l_product_id
  ),
  -- Repartição do pool de itens de PO sem ligação por (contrato, produto).
  step2 AS (
    SELECT
      s.*,
      LEAST(
        s.l_qty_needed - s.s1_linked_qty,
        GREATEST(0, s.s1_pool_qty - COALESCE(SUM(s.l_qty_needed - s.s1_linked_qty) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s2_pool_alloc
    FROM step1 s
  ),
  -- Parte recebida do pool e repartição das saídas manuais.
  step3 AS (
    SELECT
      s.*,
      s.s1_linked_qty + s.s2_pool_alloc AS s3_ordered,
      LEAST(
        s.s2_pool_alloc,
        GREATEST(0, s.s1_pool_recv - COALESCE(SUM(s.s2_pool_alloc) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_pool_recv_alloc,
      LEAST(
        CASE WHEN s.s1_is_sold THEN 0
             ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END,
        GREATEST(0, s.s1_exit_pool - COALESCE(SUM(
          CASE WHEN s.s1_is_sold THEN 0
               ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END
        ) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_exit_alloc
    FROM step2 s
  ),
  -- Quantidade ainda por cobrir das linhas pendentes (entra na fila).
  step4 AS (
    SELECT
      s.*,
      CASE WHEN s.s1_is_sold OR s.s1_has_exit THEN 0
           ELSE GREATEST(0, s.l_qty_needed - s.s3_ordered) END AS s4_rem
    FROM step3 s
  ),
  -- Fila por produto (window) — reserva do stock livre por ordem.
  step5 AS (
    SELECT
      s.*,
      row_number() OVER w_prod AS s5_seq,
      SUM(s.s4_rem) OVER (w_prod ROWS UNBOUNDED PRECEDING) AS s5_cum_rem
    FROM step4 s
    WINDOW w_prod AS (
      PARTITION BY s.l_product_id
      ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
    )
  ),
  final AS (
    SELECT
      s.*,
      (LEAST(s.s1_stock, s.s5_cum_rem) - LEAST(s.s1_stock, s.s5_cum_rem - s.s4_rem)) AS f_reserved
    FROM step5 s
  ),
  -- NOVO (20261204340000): quantidade realmente servida por stock e
  -- recebida do fornecedor, por linha.
  --  * venda automática: servida = necessária menos a parte que ficou a
  --    descoberto no momento da venda (e continua em dívida no stock);
  --  * saída manual: a saída do (contrato, produto) é repartida pelas linhas
  --    por ordem (seq) até à quantidade realmente saída (s3_exit_alloc) — uma
  --    saída pequena já não serve todas as linhas;
  --  * a receção de POs de contrato não entra em stock (vai direto à
  --    encomenda), por isso a parte recebida conta como entregue.
  served AS (
    SELECT
      f.*,
      CASE
        WHEN f.s1_is_sold THEN
          GREATEST(0, f.l_qty_needed - LEAST(f.l_qty_needed, f.s1_short_at_sale, f.s1_stock_debt))
        WHEN f.s1_has_exit THEN f.s3_exit_alloc
        ELSE 0
      END::numeric AS sv_served,
      (f.s1_linked_recv + f.s3_pool_recv_alloc)::numeric AS sv_received
    FROM final f
  )
  SELECT
    f.l_contract_id,
    f.l_quote_line_id,
    f.l_component_index,
    f.l_product_id,
    f.s5_seq,
    -- NOVO (20261204340000): is_served = linha concluída —
    -- qty_served + qty_received >= qty_needed (antes: qualquer saída do
    -- (contrato, produto) marcava todas as linhas como servidas).
    ((f.sv_served + f.sv_received) >= f.l_qty_needed
      AND (f.l_qty_needed > 0 OR f.s1_is_sold OR f.s1_has_exit)),
    f.s1_is_sold,
    f.l_qty_needed,
    f.sv_served,
    f.s3_ordered,
    f.sv_received,
    -- Linhas com venda/saída não entram na fila (uma saída por (contrato,
    -- produto)): a reserva nunca conta a parte já servida; o que ficou por
    -- servir passa a qty_missing.
    CASE WHEN f.s1_is_sold OR f.s1_has_exit THEN 0 ELSE f.f_reserved END::numeric,
    CASE
      WHEN f.s1_is_sold THEN
        GREATEST(0, LEAST(f.l_qty_needed, f.s1_short_at_sale, f.s1_stock_debt) - f.s3_ordered)
      WHEN f.s1_has_exit THEN
        GREATEST(0, f.l_qty_needed - f.s3_ordered - f.s3_exit_alloc)
      ELSE
        GREATEST(0, f.s4_rem - f.f_reserved)
    END::numeric
  FROM served f;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- public.fn_client_order_request_missing
-- ───────────────────────────────────────────────────────────────────────────
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
    SELECT r.quote_line_id, r.component_index, r.product_id,
           r.qty_needed, r.qty_missing,
           p.name AS product_name, p.sku AS product_sku
    FROM public.fn_client_order_line_reservations(v_org, v_products) r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.contract_id = p_contract_id
      AND r.qty_missing > 0
      AND (p_quote_line_ids IS NULL OR r.quote_line_id = ANY (p_quote_line_ids))
    ORDER BY r.quote_line_id, r.component_index NULLS FIRST
  LOOP
    -- Paridade com o gatilho antigo: quantidade vendida fracionária em
    -- unidades de stock é saltada com aviso.
    IF v_line.qty_needed <> floor(v_line.qty_needed) THEN
      v_skipped_other := v_skipped_other + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_line_skipped', 'warning',
        jsonb_build_object('reason', 'fractional_quantity', 'qty_needed', v_line.qty_needed,
                           'product_id', v_line.product_id, 'component_index', v_line.component_index)
      );
      CONTINUE;
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
          format('Gerada automaticamente a partir do contrato %s', COALESCE(v_contract_number, p_contract_id::text)),
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
      'resolved_quote_id', v_quote_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_orders_created', v_pos_created,
    'items_created', v_items_created,
    'skipped_no_supplier', v_skipped_no_supplier,
    'skipped_other', v_skipped_other,
    'errors', v_errors
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- public.rpc_confirm_client_order_stock_exit
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit(p_contract_id uuid, p_product_id uuid, p_quantity integer, p_warehouse_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_balance_after   integer;
  -- NOVO (20261204310000)
  v_reserved        numeric;
  v_line_count      integer;
  -- NOVO (20261204340000)
  v_wh_qty          integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number
  INTO v_org, v_contract_number
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
  -- ADICIONALMENTE a inventory.edit + client_contracts.view (ambos mantidos).
  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
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

  v_balance_after := public.rpc_decrement_stock(
    p_product_id       => p_product_id,
    p_warehouse_id     => p_warehouse_id,
    p_qty              => p_quantity,
    p_document_number  => NULL,
    p_document_type    => 'venda',
    p_counterparty     => NULL,
    p_notes            => format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number),
    p_sale_source_type => 'contract',
    p_sale_source_id   => p_contract_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- public.rpc_get_client_order_document
-- ───────────────────────────────────────────────────────────────────────────
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
    cc.order_number, cc.entity_id, COALESCE(cc.is_manual_order, false)
  INTO v_org, v_status, v_contract_number, v_signature_date, v_total_value,
       v_client_name, v_resolved_quote_id,
       v_order_number, v_entity_id, v_is_manual
  FROM public.client_contracts cc
  LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
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

  -- NOVO (20261204310000)
  v_is_signed := v_status IN ('signed', 'assinado');

  -- NOVO (20261204290000): morada de entrega = morada da obra do orçamento
  -- resolvido; senão a morada principal do cliente.
  IF v_resolved_quote_id IS NOT NULL THEN
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
        SELECT jsonb_object_agg(
                 r.quote_line_id::text || ':' || COALESCE(r.component_index, 0)::text,
                 to_jsonb(r)
               )
          INTO v_res_map
        FROM public.fn_client_order_line_reservations(v_org, v_products) r
        WHERE r.contract_id = p_contract_id;
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

          IF v_q_served_flag THEN
            -- Concluída: 'recebido' se houve parte pedida (recebida) — a parte
            -- de stock, se existir, está servida; senão servida por stock.
            v_line_status := CASE WHEN v_q_received > 0 THEN 'recebido' ELSE 'servido_por_stock' END;
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
          -- inteira em unidades de stock (as fracionárias são saltadas),
          -- fornecedor preferido (critério acima). A condição "assinado" já
          -- está garantida (v_res só existe com v_is_signed).
          IF v_q_missing > 0
             AND v_q_needed = floor(v_q_needed)
             AND v_q_missing = floor(v_q_missing)
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

          -- Armazéns: nunca mostrar como disponível mais do que a reserva.
          IF v_q_reserved > 0 THEN
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'warehouse_id',      w.id,
                  'warehouse_name',    w.name,
                  'quantity',          LEAST(s.quantity::numeric, v_q_reserved),
                  'physical_quantity', s.quantity
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
        'qty_served',            CASE WHEN v_res IS NOT NULL THEN v_q_served END
      );
    END LOOP;

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
    'missing_units_total', v_missing_units
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- public.rpc_list_client_order_documents
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, lines_service integer, overall_status text, order_number text, origin_type text, origin_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_signed_aliases text[] := ARRAY['signed', 'assinado'];
  v_limit          int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset         int := GREATEST(COALESCE(p_offset, 0), 0);
  -- NOVO (20261204290000): mesma regra da RLS de direct_sales.
  v_can_see_ds     boolean;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_see_ds := public.is_system_admin_user(auth.uid())
                  OR public.has_anew_permission(auth.uid(), 'direct_sales.view');

  RETURN QUERY
  WITH resolved_contracts AS (
    SELECT
      cc.id                AS rc_contract_id,
      cc.contract_number   AS rc_contract_number,
      cc.signature_date    AS rc_signature_date,
      e.display_name       AS rc_client_name,
      COALESCE(
        cc.quote_id,
        (
          SELECT q2.id
          FROM public.quotes q2
          WHERE q2.proposal_id = cc.proposal_id
          ORDER BY q2.created_at DESC
          LIMIT 1
        )
      )                     AS rc_resolved_quote_id
    FROM public.client_contracts cc
    LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (v_signed_aliases)
  ),
  -- NOVO (20261204310000): reserva por ordem de toda a organização (uma vez).
  res AS (
    SELECT
      r.contract_id     AS r_contract_id,
      r.quote_line_id   AS r_quote_line_id,
      r.component_index AS r_component_index,
      r.product_id      AS r_product_id,
      r.is_served       AS r_is_served,
      r.qty_served      AS r_qty_served,     -- NOVO (20261204340000)
      r.qty_ordered     AS r_qty_ordered,
      r.qty_received    AS r_qty_received,
      r.qty_reserved    AS r_qty_reserved,
      r.qty_missing     AS r_qty_missing
    FROM public.fn_client_order_line_reservations(p_organization_id, NULL) r
  ),
  line_items AS (
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      ql.product_id         AS li_product_id,
      NULL::integer         AS li_component_index
    FROM resolved_contracts rc
    JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND ql.product_id IS NOT NULL

    UNION ALL

    SELECT
      rc.rc_contract_id                AS li_contract_id,
      rc.rc_contract_number            AS li_contract_number,
      rc.rc_client_name                AS li_client_name,
      rc.rc_signature_date             AS li_signature_date,
      ql.id                            AS li_quote_line_id,
      p.id                             AS li_product_id,
      comp.ord::integer                AS li_component_index
    FROM resolved_contracts rc
    JOIN public.quote_lines ql
      ON ql.quote_id = rc.rc_resolved_quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
      WITH ORDINALITY AS comp(value, ord)
    JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL

    UNION ALL

    -- NOVO (20261130190000): linhas de serviço puro (sem produto associado).
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      NULL::uuid            AS li_product_id,
      NULL::integer         AS li_component_index
    FROM resolved_contracts rc
    JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND ql.service_id IS NOT NULL
      AND ql.product_id IS NULL
  ),
  lines AS (
    SELECT
      li.li_contract_id     AS l_contract_id,
      li.li_contract_number AS l_contract_number,
      li.li_client_name     AS l_client_name,
      li.li_signature_date  AS l_signature_date,
      li.li_quote_line_id   AS l_quote_line_id,
      CASE
        WHEN li.li_product_id IS NULL THEN 'servico'
        -- Produto inexistente (sem linha na reserva): nada a servir.
        WHEN r.r_contract_id IS NULL THEN 'no_supplier'
        -- NOVO (20261204340000): r_is_served = linha concluída
        -- (qty_served + qty_received >= qty_needed). Com parte pedida
        -- (recebida) é 'received'; só stock é 'stock'. Mesma regra que
        -- rpc_get_client_order_document.
        WHEN r.r_is_served AND r.r_qty_received > 0 THEN 'received'
        WHEN r.r_is_served THEN 'stock'
        -- Tudo reservado: "stock disponível — confirmar saída" conta como
        -- a aguardar (decisão de 20261120190000, mantida).
        WHEN r.r_qty_reserved > 0 AND r.r_qty_ordered = 0 AND r.r_qty_missing = 0 THEN 'awaiting'
        WHEN r.r_qty_reserved > 0 THEN 'partial'
        -- NOVO (20261204340000): parte já servida e o resto em PO por receber
        -- ou em falta.
        WHEN r.r_qty_served > 0 THEN 'partial'
        WHEN r.r_qty_missing > 0 AND r.r_qty_ordered > 0 THEN 'partial'
        WHEN r.r_qty_missing > 0 THEN 'no_supplier'
        WHEN r.r_qty_ordered > 0 AND r.r_qty_received >= r.r_qty_ordered THEN 'received'
        ELSE 'awaiting'
      END                                     AS l_line_status
    FROM line_items li
    LEFT JOIN res r
      ON r.r_contract_id   = li.li_contract_id
     AND r.r_quote_line_id = li.li_quote_line_id
     AND r.r_product_id    = li.li_product_id
     AND r.r_component_index IS NOT DISTINCT FROM li.li_component_index
  ),
  aggregated AS (
    SELECT
      l.l_contract_id                                             AS a_contract_id,
      l.l_contract_number                                         AS a_contract_number,
      l.l_client_name                                              AS a_client_name,
      l.l_signature_date                                          AS a_signature_date,
      count(*)::int                                                AS a_total_lines,
      count(*) FILTER (WHERE l.l_line_status = 'stock')::int       AS a_lines_from_stock,
      -- NOVO (20261204310000): 'partial' conta como a aguardar.
      count(*) FILTER (WHERE l.l_line_status IN ('awaiting', 'partial'))::int AS a_lines_awaiting_order,
      count(*) FILTER (WHERE l.l_line_status = 'received')::int    AS a_lines_received,
      count(*) FILTER (WHERE l.l_line_status = 'no_supplier')::int AS a_lines_no_supplier,
      count(*) FILTER (WHERE l.l_line_status = 'servico')::int     AS a_lines_service
    FROM lines l
    GROUP BY l.l_contract_id, l.l_contract_number, l.l_client_name, l.l_signature_date
  ),
  no_lines AS (
    SELECT
      rc.rc_contract_id     AS a_contract_id,
      rc.rc_contract_number AS a_contract_number,
      rc.rc_client_name     AS a_client_name,
      rc.rc_signature_date  AS a_signature_date,
      0 AS a_total_lines, 0 AS a_lines_from_stock, 0 AS a_lines_awaiting_order,
      0 AS a_lines_received, 0 AS a_lines_no_supplier, 0 AS a_lines_service
    FROM resolved_contracts rc
    WHERE NOT EXISTS (
      SELECT 1 FROM aggregated a WHERE a.a_contract_id = rc.rc_contract_id
    )
  ),
  combined AS (
    SELECT * FROM aggregated
    UNION ALL
    SELECT * FROM no_lines
  ),
  final AS (
    SELECT
      c.a_contract_id, c.a_contract_number, c.a_client_name, c.a_signature_date,
      c.a_total_lines, c.a_lines_from_stock, c.a_lines_awaiting_order,
      c.a_lines_received, c.a_lines_no_supplier, c.a_lines_service,
      CASE
        WHEN c.a_total_lines = 0 THEN 'totalmente_servido'
        WHEN c.a_lines_awaiting_order = 0 AND c.a_lines_no_supplier = 0 THEN 'totalmente_servido'
        WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
             AND c.a_lines_no_supplier = 0
             AND c.a_lines_awaiting_order > 0 THEN 'a_aguardar_encomenda'
        WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
             AND c.a_lines_awaiting_order = 0
             AND c.a_lines_no_supplier > 0 THEN 'sem_fornecedor'
        ELSE 'parcialmente_pendente'
      END AS a_overall_status,
      -- NOVO (20261204290000): número de encomenda e origem.
      cco.order_number AS a_order_number,
      CASE
        WHEN ds.ds_found THEN 'direct_sale'
        WHEN COALESCE(cco.is_manual_order, false) THEN 'manual'
        ELSE 'contract'
      END AS a_origin_type,
      CASE
        WHEN ds.ds_found THEN CASE WHEN v_can_see_ds THEN ds.ds_sale_number END
        WHEN COALESCE(cco.is_manual_order, false) THEN NULL
        ELSE c.a_contract_number
      END AS a_origin_number
    FROM combined c
    JOIN public.client_contracts cco ON cco.id = c.a_contract_id
    LEFT JOIN LATERAL (
      SELECT true AS ds_found, d.sale_number AS ds_sale_number
      FROM public.direct_sales d
      WHERE d.client_contract_id = c.a_contract_id
      ORDER BY d.created_at DESC
      LIMIT 1
    ) ds ON true
  )
  SELECT
    f.a_contract_id          AS contract_id,
    f.a_contract_number      AS contract_number,
    f.a_client_name          AS client_name,
    f.a_signature_date       AS signature_date,
    f.a_total_lines          AS total_lines,
    f.a_lines_from_stock     AS lines_from_stock,
    f.a_lines_awaiting_order AS lines_awaiting_order,
    f.a_lines_received       AS lines_received,
    f.a_lines_no_supplier    AS lines_no_supplier,
    f.a_lines_service        AS lines_service,
    f.a_overall_status       AS overall_status,
    f.a_order_number         AS order_number,
    f.a_origin_type          AS origin_type,
    f.a_origin_number        AS origin_number
  FROM final f
  WHERE
    (
      p_search IS NULL OR p_search = ''
      OR strpos(lower(COALESCE(f.a_contract_number, '')), lower(p_search)) > 0
      OR strpos(lower(COALESCE(f.a_client_name, '')), lower(p_search)) > 0
      -- NOVO (20261204290000)
      OR strpos(lower(COALESCE(f.a_order_number, '')), lower(p_search)) > 0
    )
    AND (
      p_status_filter IS NULL OR p_status_filter = 'all'
      OR f.a_overall_status = p_status_filter
    )
    AND (
      p_date_from IS NULL OR f.a_signature_date::date >= p_date_from
    )
    AND (
      p_date_to IS NULL OR f.a_signature_date::date <= p_date_to
    )
  ORDER BY f.a_signature_date DESC NULLS LAST, f.a_contract_number DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

COMMIT;
