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
  -- NOVO (serve clientes): a reserva só conta stock de armazéns ativos que
  -- servem clientes (os_qty). A dívida de stock (s1_stock_debt) continua
  -- sobre todos os armazéns não apagados, como antes (os_qty_all).
  org_stock AS (
    SELECT s.product_id AS os_product_id,
           COALESCE(SUM(s.quantity) FILTER (WHERE w.is_active = true AND w.serves_customers = true), 0)::numeric AS os_qty,  -- NOVO (serve clientes)
           SUM(s.quantity)::numeric AS os_qty_all  -- NOVO (serve clientes)
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
      SUM(LEAST(sm.quantity, GREATEST(0, -sm.balance_after)))::numeric AS sd_short,
      -- NOVO (20261204630000): quantidade realmente vendida (unidades base,
      -- como l_qty_needed). A dedução passou a poder ser parcial.
      SUM(sm.quantity)::numeric AS sd_qty
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
      -- NOVO (20261206130000): só conta como recebido pela EC o que não
      -- entrou em stock (received_to_stock_units, unidades de stock).
      GREATEST(0,
        CASE WHEN po.status = 'received' THEN poi.quantity
             ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
        END * COALESCE(poi.units_per_uom, 1)
        - COALESCE(poi.received_to_stock_units, 0)
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
  -- NOVO (anulado): quantidade anulada (rpc_cancel_po_line_remainder /
  -- rpc_cancel_po_remainder) e não desfeita = deixa de ser recebida e deixa de
  -- ser necessária na EC (não vai à reserva FIFO nem a qty_missing). Unidades
  -- base (× units_per_uom da linha da PO). Conta qualquer que seja o estado da
  -- PO (uma PO com tudo anulado fica 'cancelled'); POs apagadas não contam;
  -- anulações cuja linha da PO já não existe (purchase_order_item_id NULL)
  -- não se conseguem ligar e não contam.
  cancels AS (
    SELECT
      po.source_id         AS ca_contract_id,
      poi.product_id       AS ca_product_id,
      poi.quote_line_id    AS ca_quote_line_id,
      poi.component_index  AS ca_component_index,
      (c.quantity_cancelled * COALESCE(poi.units_per_uom, 1))::numeric AS ca_qty
    FROM public.purchase_order_item_cancellations c
    JOIN public.purchase_order_items poi ON poi.id = c.purchase_order_item_id
    JOIN public.purchase_orders po ON po.id = c.purchase_order_id
    WHERE c.organization_id = p_organization_id
      AND c.undone_at IS NULL
      AND c.quantity_cancelled > 0
      AND po.source_type = 'contract'
      AND po.source_id IN (SELECT c2.c_id FROM contracts c2)
      AND po.deleted_at IS NULL
      AND poi.product_id IS NOT NULL
      AND poi.product_id IN (SELECT l.l_product_id FROM lines l)
  ),
  ca_linked AS (
    SELECT ca_contract_id, ca_quote_line_id, ca_component_index, ca_product_id,
           SUM(ca_qty) AS cl_qty
    FROM cancels
    WHERE ca_quote_line_id IS NOT NULL
    GROUP BY ca_contract_id, ca_quote_line_id, ca_component_index, ca_product_id
  ),
  ca_pool AS (
    SELECT ca_contract_id, ca_product_id, SUM(ca_qty) AS cp_qty
    FROM cancels
    WHERE ca_quote_line_id IS NULL
    GROUP BY ca_contract_id, ca_product_id
  ),
  step1 AS (
    SELECT
      l.*,
      COALESCE(l.l_component_index, 0)                          AS s1_comp_key,
      (sd.sd_contract_id IS NOT NULL)                           AS s1_is_sold,
      COALESCE(sd.sd_short, 0)                                  AS s1_short_at_sale,
      COALESCE(sd.sd_qty, 0)                                    AS s1_sold_qty,  -- NOVO (20261204630000)
      (ex.ex_contract_id IS NOT NULL)                           AS s1_has_exit,
      COALESCE(ex.ex_qty, 0)                                    AS s1_exit_pool,
      LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))             AS s1_linked_qty,
      LEAST(COALESCE(pl.pl_recv, 0), l.l_qty_needed, COALESCE(pl.pl_qty, 0)) AS s1_linked_recv,
      COALESCE(pp.pp_qty, 0)                                    AS s1_pool_qty,
      COALESCE(pp.pp_recv, 0)                                   AS s1_pool_recv,
      GREATEST(0, COALESCE(os.os_qty, 0))                       AS s1_stock,
      GREATEST(0, -COALESCE(os.os_qty_all, 0))                  AS s1_stock_debt,  -- NOVO (serve clientes): os_qty_all
      -- NOVO (anulado): anulação ligada à linha, até ao que a linha ainda
      -- precisa depois da parte ligada encomendada. Limitação conhecida: uma PO
      -- manual sem quote_line_id criada depois da anulação não é atribuída a
      -- esta linha (o "Pedir em falta" cria sempre linhas ligadas).
      LEAST(COALESCE(cl.cl_qty, 0),
            l.l_qty_needed - LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))) AS s1_linked_cancel,
      COALESCE(cp.cp_qty, 0)                                    AS s1_pool_cancel
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
    LEFT JOIN ca_linked cl
      ON cl.ca_contract_id   = l.l_contract_id
     AND cl.ca_quote_line_id = l.l_quote_line_id
     AND cl.ca_component_index IS NOT DISTINCT FROM l.l_component_index
     AND cl.ca_product_id    = l.l_product_id
    LEFT JOIN ca_pool cp
      ON cp.ca_contract_id = l.l_contract_id
     AND cp.ca_product_id  = l.l_product_id
  ),
  -- Repartição do pool de itens de PO sem ligação por (contrato, produto).
  step2 AS (
    SELECT
      s.*,
      -- NOVO (anulado): - s1_linked_cancel (0 sem anulações ligadas).
      LEAST(
        s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel,
        GREATEST(0, s.s1_pool_qty - COALESCE(SUM(s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s2_pool_alloc
    FROM step1 s
  ),
  -- NOVO (anulado): anulação de linhas de PO sem ligação, repartida por
  -- (contrato, produto) na MESMA ordem do pool (seq), a seguir à parte
  -- encomendada — equivale a repartir o pool original (antes da anulação) e
  -- dar a parte anulada às últimas unidades que ele cobria.
  -- s2c_need = necessidade efetiva (necessária − anulada). Sem anulações
  -- s2c_cancel = 0 e s2c_need = l_qty_needed.
  step2c AS (
    SELECT
      x.*,
      x.s1_linked_cancel + x.s2c_pool_cancel                  AS s2c_cancel,
      x.l_qty_needed - x.s1_linked_cancel - x.s2c_pool_cancel AS s2c_need
    FROM (
      SELECT
        s.*,
        LEAST(
          s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel - s.s2_pool_alloc,
          GREATEST(0, s.s1_pool_cancel - COALESCE(SUM(
            s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel - s.s2_pool_alloc
          ) OVER (
            PARTITION BY s.l_contract_id, s.l_product_id
            ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0))
        ) AS s2c_pool_cancel
      FROM step2 s
    ) x
  ),
  -- Parte recebida do pool e repartição das saídas manuais.
  -- NOVO (anulado): daqui em diante a necessidade é s2c_need.
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
             ELSE s.s2c_need - s.s1_linked_qty - s.s2_pool_alloc END,
        GREATEST(0, s.s1_exit_pool - COALESCE(SUM(
          CASE WHEN s.s1_is_sold THEN 0
               ELSE s.s2c_need - s.s1_linked_qty - s.s2_pool_alloc END
        ) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_exit_alloc
    FROM step2c s
  ),
  -- Quantidade ainda por cobrir das linhas pendentes (entra na fila).
  step4 AS (
    SELECT
      s.*,
      CASE WHEN s.s1_is_sold OR s.s1_has_exit THEN 0
           ELSE GREATEST(0, s.s2c_need - s.s3_ordered) END AS s4_rem
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
  --    NOVO (20261204630000): limitada à quantidade realmente vendida
  --    (LEAST(necessária, vendida)) — a dedução pode ser parcial. Com
  --    vendida = necessária (todas as vendas anteriores) é igual a antes;
  --  * saída manual: a saída do (contrato, produto) é repartida pelas linhas
  --    por ordem (seq) até à quantidade realmente saída (s3_exit_alloc) — uma
  --    saída pequena já não serve todas as linhas;
  --  * a receção de POs de contrato não entra em stock (vai direto à
  --    encomenda), por isso a parte recebida conta como entregue.
  --    NOVO (20261206130000): exceto a parte que entrou em stock
  --    (excedente / EC inativa / passagem para stock), descontada em pi_recv.
  served AS (
    SELECT
      f.*,
      CASE
        WHEN f.s1_is_sold THEN
          GREATEST(0, LEAST(f.s2c_need, f.s1_sold_qty)
                      - LEAST(f.s2c_need, f.s1_short_at_sale, f.s1_stock_debt))  -- NOVO (20261204630000); anulado: s2c_need
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
    -- NOVO (anulado): contra a necessidade efetiva; uma linha totalmente
    -- anulada (s2c_need = 0, s2c_cancel > 0) fica concluída.
    -- qty_needed devolvido = necessidade efetiva (necessária − anulada).
    ((f.sv_served + f.sv_received) >= f.s2c_need
      AND (f.s2c_need > 0 OR f.s1_is_sold OR f.s1_has_exit OR f.s2c_cancel > 0)),
    f.s1_is_sold,
    f.s2c_need,
    f.sv_served,
    f.s3_ordered,
    f.sv_received,
    -- Linhas com venda/saída não entram na fila (uma saída por (contrato,
    -- produto)): a reserva nunca conta a parte já servida; o que ficou por
    -- servir passa a qty_missing.
    CASE WHEN f.s1_is_sold OR f.s1_has_exit THEN 0 ELSE f.f_reserved END::numeric,
    CASE
      WHEN f.s1_is_sold THEN
        -- NOVO (20261204630000): necessário − servido − encomendado. Com
        -- vendida = necessária dá exatamente o de antes:
        -- LEAST(necessário, short, dívida) − encomendado.
        GREATEST(0, f.s2c_need - f.sv_served - f.s3_ordered)
      WHEN f.s1_has_exit THEN
        GREATEST(0, f.s2c_need - f.s3_ordered - f.s3_exit_alloc)
      ELSE
        GREATEST(0, f.s4_rem - f.f_reserved)
    END::numeric
  FROM served f;
$function$
