-- ============================================================
-- Correção encontrada ao testar a extensão de 20261115170000 (ligação manual
-- de rpc_decrement_stock a uma Encomenda Cliente): a resolução de estado em
-- "Encomendas Clientes" (rpc_list_client_order_documents/
-- rpc_get_client_order_document, Fase 5.0F) só reconhecia como "servido por
-- stock" um stock_movements com movement_type='venda' E
-- reference_id=quote_line.id — exatamente o que a dedução AUTOMÁTICA (Fase
-- 5.0B) gera, mas NÃO o que a saída MANUAL liga (rpc_decrement_stock insere
-- sempre movement_type='saida', sem reference_id a um quote_line concreto,
-- já que o profissional pode ajustar produto/quantidade livremente na
-- linha). Resultado: escolher a Encomenda Cliente + registar a saída manual
-- não atualizava o estado da linha em "Encomendas Clientes" — o link ficava
-- gravado em stock_movements mas invisível na página, ao contrário do que
-- foi comunicado ao utilizador.
--
-- Correção: o critério "servido por stock" passa a aceitar OR entre:
--   (a) automático — sale_source_type/id + reference_id=quote_line_id +
--       movement_type='venda' (como já estava, dedução da Fase 5.0B);
--   (b) manual — sale_source_type/id + product_id=quote_line.product_id +
--       movement_type='saida' (novo, dedução manual da 20261115170000).
-- Casamento por product_id (não por quote_line_id) no caso manual porque o
-- profissional escolhe produto+quantidade livremente na linha de "Registar
-- movimento" — não há garantia de 1-para-1 com uma quote_line concreta.
--
-- Mesma assinatura em ambas as funções — CREATE OR REPLACE seguro aqui, sem
-- risco do bug de overload já documentado noutras migrations (só muda o
-- corpo, não a lista de parâmetros/tipo de retorno).
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
  lines AS (
    SELECT
      rc.rc_contract_id                       AS l_contract_id,
      rc.rc_contract_number                   AS l_contract_number,
      rc.rc_client_name                       AS l_client_name,
      rc.rc_signature_date                    AS l_signature_date,
      ql.id                                   AS l_quote_line_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.stock_movements sm
          WHERE sm.sale_source_type = 'contract'
            AND sm.sale_source_id = rc.rc_contract_id
            AND (
              (sm.movement_type = 'venda' AND sm.reference_id = ql.id)
              OR
              (sm.movement_type = 'saida' AND sm.product_id = ql.product_id)
            )
        ) THEN 'stock'
        WHEN EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = rc.rc_contract_id
            AND poi.product_id = ql.product_id
            AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
        ) THEN 'received'
        WHEN EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = rc.rc_contract_id
            AND poi.product_id = ql.product_id
            AND po.status IN ('pending', 'ordered', 'partially_received')
            AND poi.received_quantity < poi.quantity
        ) THEN 'awaiting'
        ELSE 'no_supplier'
      END                                     AS l_line_status
    FROM resolved_contracts rc
    JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND ql.product_id IS NOT NULL
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
        ql.id AS quote_line_id, ql.product_id, ql.qt,
        p.name AS product_name, p.sku AS product_sku
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
      ORDER BY ql.ordem NULLS LAST, ql.created_at
    LOOP
      v_line_status       := NULL;
      v_stock_movement_id := NULL;
      v_po_id             := NULL;
      v_po_order_number   := NULL;

      -- Automático (Fase 5.0B) OU manual ligado (20261115170000/180000) —
      -- ver cabeçalho desta migration.
      SELECT sm.id INTO v_stock_movement_id
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_contract_id
        AND (
          (sm.movement_type = 'venda' AND sm.reference_id = v_line.quote_line_id)
          OR
          (sm.movement_type = 'saida' AND sm.product_id = v_line.product_id)
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
            v_line_status := 'sem_fornecedor';
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
