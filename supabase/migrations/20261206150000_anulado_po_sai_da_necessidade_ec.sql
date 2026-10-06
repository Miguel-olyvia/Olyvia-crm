SET lock_timeout = '5s';
-- quantidade anulada numa PO = não será recebida.
-- Não vai à reserva FIFO, não fica em falta, não é pedida de novo.
-- EC mostra "Não será recebido — anulado na PO-X (motivo)".
--
-- Só CREATE OR REPLACE, assinaturas e tipos de retorno iguais (grants,
-- owner e SECURITY DEFINER mantêm-se). Funções alteradas:
--   1. fn_client_order_line_reservations  (qty_needed devolvido = necessária − anulada)
--   2. rpc_get_client_order_document      (chaves novas qty_cancelled / cancellations,
--                                          line_status novo 'nao_recebido_anulado')
-- Tudo o resto (fn_po_receipt_allocation, rpc_decrement_stock,
-- fn_client_order_request_missing, rpc_get_product_stock_reservations,
-- rpc_list_client_order_documents, rpc_confirm_client_order_stock_exit,
-- fn_contract_stock_deduction) herda pela função 1, sem mudanças.
--
-- Testado em BEGIN…ROLLBACK (2026-10-02) sobre as 6 organizações:
-- 1236 linhas de reserva, só a do aspirador (EC-2026-0100) muda;
-- 172 documentos, só a linha do aspirador muda (+ missing_lines_count 1→0).

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
      GREATEST(0, -COALESCE(os.os_qty, 0))                      AS s1_stock_debt,
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
;

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
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN
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
      -- NOVO (20261205040000)
      v_category_name     := NULL;
      v_subcategory_name  := NULL;
      v_q_cancelled       := NULL;
      v_cancellations     := NULL;

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

          -- NOVO (anulado): sem PO em curso/recebida para a linha, a PO da
          -- anulação mais recente (para o rótulo e o atalho para a PO).
          IF v_po_id IS NULL AND v_q_cancelled > 0 THEN
            v_po_id           := (v_cancellations -> -1 ->> 'purchase_order_id')::uuid;
            v_po_order_number := v_cancellations -> -1 ->> 'purchase_order_number';
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
        'qty_served',            CASE WHEN v_res IS NOT NULL THEN v_q_served END,
        -- NOVO (20261205040000): categoria principal (raiz) e subcategoria do
        -- produto. NULL em serviços e em produtos sem categoria.
        'category_name',         v_category_name,
        'subcategory_name',      v_subcategory_name,
        -- NOVO (anulado): quantidade anulada nas POs (unidades base) e as
        -- anulações (PO, motivo, nota). NULL em serviços e em encomendas não
        -- assinadas; 0 / NULL quando não há anulação.
        'qty_cancelled',         v_q_cancelled,
        'cancellations',         v_cancellations
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
    'missing_units_total', v_missing_units,
    -- NOVO (20261204730000)
    'notes',            v_notes,
    'can_edit_header',  COALESCE(v_can_edit_header, false),
    -- NOVO (20261204740000): cliente da encomenda e a morada gravada na
    -- própria encomenda (sem os fallbacks de obra/morada do cliente).
    'entity_id',                 v_entity_id,
    'delivery_address_override', nullif(btrim(v_cc_delivery), '')
  );
END;
$function$
;

