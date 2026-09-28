-- ============================================================
-- Novo estado de linha: "coberto por stock, falta confirmar saída" —
-- distinto de "sem fornecedor preferencial".
--
-- Desde 20261120160000, fn_contract_supplier_request() deixa de gerar
-- Encomenda ao Fornecedor quando já há stock suficiente do produto (mesmo
-- sem manages_stock ativo). Essas linhas ficam sem PO e sem stock_movement
-- — exatamente a mesma "assinatura" de uma linha genuinamente sem fornecedor
-- configurado. rpc_get_client_order_document/rpc_list_client_order_documents
-- não distinguiam os dois casos: ambos caíam em 'sem_fornecedor'.
--
-- Reproduzido ao vivo: CC-2026-0255, "Banheira EVA" (DBB0001) — tem
-- fornecedor preferencial configurado desde 11/08, e havia 1 unidade em
-- stock quando o contrato foi assinado (log confirma
-- trigger:contract_po_request_covered_by_stock). Mesmo assim aparecia
-- "Sem fornecedor preferencial", que é enganoso — o produto TEM fornecedor,
-- só não precisou de ser usado.
--
-- Correção:
--   rpc_get_client_order_document — nova linha de verificação, só quando os
--   3 casos anteriores (stock/recebido/a_aguardar_encomenda) não se aplicam:
--   se o stock real do produto (somado nos armazéns ativos da organização)
--   já cobre a quantidade da linha, line_status='stock_disponivel_confirmar'
--   em vez de 'sem_fornecedor'. Frontend (ClientOrders.tsx) precisa de um
--   novo rótulo/cor para este valor — ver commit acompanhante.
--
--   rpc_list_client_order_documents — mesma verificação de stock na CTE
--   `lines`, mas classificada como 'awaiting' (decisão do utilizador: conta
--   para "A aguardar encomenda" no estado geral do contrato, sem criar mais
--   uma categoria no filtro de estados da listagem). Para isto, `line_items`
--   passa a transportar a quantidade de cada linha (li_qty) — antes só
--   transportava o product_id.
--
-- Mesma assinatura nas duas funções.
-- ============================================================


-- ============================================================
-- 1. rpc_list_client_order_documents
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(
    p_organization_id uuid,
    p_search          text DEFAULT NULL,
    p_status_filter   text DEFAULT NULL,
    p_limit           int  DEFAULT 30,
    p_offset          int  DEFAULT 0
) RETURNS TABLE (
    contract_id          uuid,
    contract_number      text,
    client_name          text,
    signature_date       timestamptz,
    total_lines          integer,
    lines_from_stock     integer,
    lines_awaiting_order integer,
    lines_received       integer,
    lines_no_supplier    integer,
    overall_status       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signed_aliases text[] := ARRAY['signed', 'assinado'];
  v_limit          int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset         int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  line_items AS (
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      ql.product_id         AS li_product_id,
      ql.qt                 AS li_qty
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
      (comp.value ->> 'source_id')::uuid AS li_product_id,
      (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS li_qty
    FROM resolved_contracts rc
    JOIN public.quote_lines ql
      ON ql.quote_id = rc.rc_resolved_quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
  ),
  lines AS (
    SELECT
      li.li_contract_id     AS l_contract_id,
      li.li_contract_number AS l_contract_number,
      li.li_client_name     AS l_client_name,
      li.li_signature_date  AS l_signature_date,
      li.li_quote_line_id   AS l_quote_line_id,
      CASE
        -- (a) automático (venda + reference_id) OU (b) saída manual ligada
        -- via "Encomenda Cliente de origem" (saida, sem reference_id — ver
        -- cabeçalho desta migration e 20261115180000).
        WHEN EXISTS (
          SELECT 1
          FROM public.stock_movements sm
          WHERE sm.sale_source_type = 'contract'
            AND sm.sale_source_id = li.li_contract_id
            AND sm.product_id = li.li_product_id
            AND (
              (sm.movement_type = 'venda' AND sm.reference_id = li.li_quote_line_id)
              OR sm.movement_type = 'saida'
            )
        ) THEN 'stock'
        WHEN EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = li.li_contract_id
            AND poi.product_id = li.li_product_id
            AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
        ) THEN 'received'
        WHEN EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = li.li_contract_id
            AND poi.product_id = li.li_product_id
            AND po.status IN ('pending', 'ordered', 'partially_received')
            AND poi.received_quantity < poi.quantity
        ) THEN 'awaiting'
        -- NOVO (20261120190000): coberto por stock, sem PO gerada de
        -- propósito (20261120160000) — conta como "a aguardar encomenda"
        -- no estado geral do contrato (decisão do utilizador: não introduz
        -- mais uma categoria no filtro de estados da listagem). O rótulo
        -- distinto ("Stock disponível — confirmar saída") só é mostrado no
        -- detalhe (rpc_get_client_order_document).
        WHEN (
          SELECT COALESCE(SUM(s.quantity), 0)
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = li.li_product_id
            AND s.deleted_at IS NULL
            AND w.organization_id = p_organization_id
            AND w.deleted_at IS NULL
        ) >= li.li_qty THEN 'awaiting'
        ELSE 'no_supplier'
      END                                     AS l_line_status
    FROM line_items li
  ),
  aggregated AS (
    SELECT
      l.l_contract_id                                             AS a_contract_id,
      l.l_contract_number                                         AS a_contract_number,
      l.l_client_name                                              AS a_client_name,
      l.l_signature_date                                          AS a_signature_date,
      count(*)::int                                                AS a_total_lines,
      count(*) FILTER (WHERE l.l_line_status = 'stock')::int       AS a_lines_from_stock,
      count(*) FILTER (WHERE l.l_line_status = 'awaiting')::int    AS a_lines_awaiting_order,
      count(*) FILTER (WHERE l.l_line_status = 'received')::int    AS a_lines_received,
      count(*) FILTER (WHERE l.l_line_status = 'no_supplier')::int AS a_lines_no_supplier
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
      0 AS a_lines_received, 0 AS a_lines_no_supplier
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
      c.a_lines_received, c.a_lines_no_supplier,
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
      END AS a_overall_status
    FROM combined c
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
    f.a_overall_status       AS overall_status
  FROM final f
  WHERE
    (
      p_search IS NULL OR p_search = ''
      OR strpos(lower(COALESCE(f.a_contract_number, '')), lower(p_search)) > 0
      OR strpos(lower(COALESCE(f.a_client_name, '')), lower(p_search)) > 0
    )
    AND (
      p_status_filter IS NULL OR p_status_filter = 'all'
      OR f.a_overall_status = p_status_filter
    )
  ORDER BY f.a_signature_date DESC NULLS LAST, f.a_contract_number DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, int, int) IS
  'Fase 5.0F (corrigida em 20261119130000, 20261120150000 e 20261120190000): '
  'listagem "Encomendas Clientes" — 1 linha por Contrato assinado, derivada '
  'ao momento da leitura. Conta linhas diretas + produtos de Bundle. Estado '
  'por linha: stock (venda automática OU saida manual ligada), received, '
  'awaiting (PO pendente OU já coberto por stock, sem PO gerada de propósito '
  '— 20261120190000), no_supplier. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, int, int) TO authenticated;


-- ============================================================
-- 2. rpc_get_client_order_document
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_client_order_document(
    p_contract_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    )
  INTO v_org, v_status, v_contract_number, v_signature_date, v_total_value,
       v_client_name, v_resolved_quote_id
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

  IF v_resolved_quote_id IS NOT NULL THEN
    FOR v_line IN
      SELECT
        ql.id AS quote_line_id, p.id AS product_id, ql.qt AS qt,
        p.name AS product_name, p.sku AS product_sku
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL

      UNION ALL

      SELECT
        ql.id AS quote_line_id,
        p.id AS product_id,
        (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku
      FROM public.quote_lines ql
      JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
        ON true
      JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.bundle_id IS NOT NULL
        AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
        AND comp.value ->> 'type' = 'product'
        AND comp.value ->> 'source_id' IS NOT NULL

      ORDER BY 1
    LOOP
      v_line_status       := NULL;
      v_stock_movement_id := NULL;
      v_po_id             := NULL;
      v_po_order_number   := NULL;

      -- (a) automático (venda + reference_id) OU (b) saída manual ligada
      -- via "Encomenda Cliente de origem" (saida, sem reference_id).
      SELECT sm.id INTO v_stock_movement_id
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_contract_id
        AND sm.product_id = v_line.product_id
        AND (
          (sm.movement_type = 'venda' AND sm.reference_id = v_line.quote_line_id)
          OR sm.movement_type = 'saida'
        )
      ORDER BY sm.created_at DESC
      LIMIT 1;

      IF v_stock_movement_id IS NOT NULL THEN
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
            -- NOVO (20261120190000): antes de aceitar "sem fornecedor", ver
            -- se já há stock real suficiente (o produto pode ter fornecedor
            -- preferencial configurado — fn_contract_supplier_request só não
            -- gerou PO porque não era preciso, 20261120160000).
            SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
            FROM public.stocks s
            JOIN public.warehouses w ON w.id = s.warehouse_id
            WHERE s.product_id = v_line.product_id
              AND s.deleted_at IS NULL
              AND w.organization_id = v_org
              AND w.deleted_at IS NULL;

            IF v_available_stock >= v_line.qt THEN
              v_line_status := 'stock_disponivel_confirmar';
            ELSE
              v_line_status := 'sem_fornecedor';
            END IF;
          END IF;
        END IF;
      END IF;

      v_lines := v_lines || jsonb_build_object(
        'quote_line_id',         v_line.quote_line_id,
        'product_id',            v_line.product_id,
        'product_name',          v_line.product_name,
        'product_sku',           v_line.product_sku,
        'quantity',              v_line.qt,
        'line_status',           v_line_status,
        'stock_movement_id',     v_stock_movement_id,
        'purchase_order_id',     v_po_id,
        'purchase_order_number', v_po_order_number
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'contract_id',     p_contract_id,
    'contract_number', v_contract_number,
    'client_name',     v_client_name,
    'signature_date',  v_signature_date,
    'total_value',     v_total_value,
    'status',          v_status,
    'lines',           v_lines
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_get_client_order_document(uuid) IS
  'Fase 5.0F (corrigida em 20261119130000, 20261120150000 e 20261120190000): '
  'detalhe completo de 1 documento "Encomenda Cliente". line_status: '
  'servido_por_stock, recebido, a_aguardar_encomenda, '
  'stock_disponivel_confirmar (coberto por stock, sem PO gerada de '
  'propósito — 20261120160000/20261120190000), sem_fornecedor. SECURITY '
  'DEFINER.';

REVOKE ALL ON FUNCTION public.rpc_get_client_order_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_order_document(uuid) TO authenticated;
