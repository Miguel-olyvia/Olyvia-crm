-- rpc_get_client_order_document() — devolver o diagnóstico congelado do orçamento.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- --------------------------
-- O armazém prepara a encomenda a partir deste documento. Até agora só via as linhas
-- (produtos/serviços) e ficava sem o contexto do levantamento: área, o que demolir, o
-- que proteger, que intervenção, e a lista de materiais estimados. Isso obrigava a ir
-- ao negócio à mão. A chave nova `diagnostic` traz a fotografia congelada
-- (quote_diagnostic_snapshot, 20261203040000) para dentro do mesmo documento.
--
-- Reforço da regra de negócio: o diagnóstico continua a ser APENAS INFORMATIVO. Não
-- entra no total, não gera linhas, não gera mão de obra — é contexto para quem separa
-- o material.
--
-- Partiu-se da DEFINIÇÃO VIVA da função (pg_get_functiondef), não de migrações antigas.
-- Assinatura INALTERADA: (p_contract_id uuid) RETURNS jsonb.
--
-- Única alteração face ao vivo: nova variável v_diagnostic e nova chave `diagnostic`
-- no jsonb devolvido. NENHUMA chave existente muda de nome, tipo ou conteúdo — o
-- frontend atual não nota diferença. Reutiliza-se v_resolved_quote_id, que a função já
-- resolve com fallback via proposal_id; sem orçamento resolvido ou sem fotografia,
-- `diagnostic` vem '[]'::jsonb (nunca null — evita guardas no frontend).
--
-- Prerequisites:
--   20261130190000_client_order_documents_service_lines.sql — linhas de serviço
--   20261203040000_quote_diagnostic_snapshot.sql            — quote_diagnostic_snapshot

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
        ql.id AS quote_line_id, p.id AS product_id, NULL::uuid AS service_id, ql.qt AS qt,
        p.name AS product_name, p.sku AS product_sku,
        NULL::text AS service_name, NULL::text AS service_sku
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
        NULL::text AS service_name, NULL::text AS service_sku
      FROM public.quote_lines ql
      JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
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
        s.name AS service_name, s.sku AS service_sku
      FROM public.quote_lines ql
      JOIN public.services s ON s.id = ql.service_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.service_id IS NOT NULL
        AND ql.product_id IS NULL

      ORDER BY 1
    LOOP
      v_line_status       := NULL;
      v_stock_movement_id := NULL;
      v_po_id             := NULL;
      v_po_order_number   := NULL;
      v_available_wh      := NULL;

      IF v_line.product_id IS NULL THEN
        -- Linha de serviço: nunca há stock físico nem PO de fornecedor
        -- (fn_contract_stock_deduction / fn_contract_supplier_request já
        -- ignoram estas linhas, de propósito). Estado fixo e distinto dos
        -- estados de produto.
        v_line_status := 'servico';
      ELSE
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

                -- NOVO (20261130070000): lista de armazéns ativos da
                -- organização com stock > 0 deste produto, para o
                -- profissional escolher de onde confirmar a saída. Só se
                -- calcula para linhas neste estado — as restantes não
                -- precisam desta informação.
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
        'available_warehouses',  v_available_wh
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
    'diagnostic',      COALESCE(v_diagnostic, '[]'::jsonb)
  );
END;
$function$;
