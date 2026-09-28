-- Fase: Checklist de saída de stock na Encomenda Cliente (linhas "Stock
-- disponível — confirmar saída").
--
-- Objetivo (pedido do utilizador): quando uma linha da Encomenda Cliente tem
-- `line_status = 'stock_disponivel_confirmar'`, o profissional precisa de ver
-- em que armazém(ns) existe esse stock, para escolher de onde confirmar a
-- saída. Este ficheiro:
--   1. Acrescenta o campo `available_warehouses` às linhas com esse estado em
--      `rpc_get_client_order_document`, SEM alterar a cascata de decisão de
--      `line_status` (servido_por_stock / recebido / a_aguardar_encomenda /
--      stock_disponivel_confirmar / sem_fornecedor), que já está correta e
--      testada (última alteração: 20261120190000).
--   2. Cria `rpc_confirm_client_order_stock_exit`, um wrapper fino sobre
--      `rpc_decrement_stock` (não duplica a lógica da trigger
--      `fn_stock_movements_apply`) para o profissional confirmar a saída a
--      partir de um armazém concreto, com guarda de idempotência.
--
-- Base usada (versão viva confirmada via pg_get_functiondef() na BD remota,
-- não o ficheiro de migration antigo 20261120190000, que pode estar
-- desatualizado face a outras alterações feitas entretanto por outra sessão):
--
--   CREATE OR REPLACE FUNCTION public.rpc_get_client_order_document(p_contract_id uuid)
--    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
--    SET search_path TO 'public', 'pg_temp'
--
-- Assinatura viva confirmada de rpc_decrement_stock (não alterada aqui):
--   rpc_decrement_stock(
--     p_product_id uuid, p_warehouse_id uuid, p_qty integer,
--     p_document_number text, p_document_type text,
--     p_counterparty text DEFAULT NULL, p_notes text DEFAULT NULL,
--     p_sale_source_type text DEFAULT NULL, p_sale_source_id uuid DEFAULT NULL
--   ) RETURNS integer  -- balance_after

-- =============================================================================
-- 1. rpc_get_client_order_document — só acrescenta `available_warehouses`
-- =============================================================================
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
      v_available_wh      := NULL;

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

      v_lines := v_lines || jsonb_build_object(
        'quote_line_id',         v_line.quote_line_id,
        'product_id',            v_line.product_id,
        'product_name',          v_line.product_name,
        'product_sku',           v_line.product_sku,
        'quantity',              v_line.qt,
        'line_status',           v_line_status,
        'stock_movement_id',     v_stock_movement_id,
        'purchase_order_id',     v_po_id,
        'purchase_order_number', v_po_order_number,
        'available_warehouses',  v_available_wh
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
$function$;

COMMENT ON FUNCTION public.rpc_get_client_order_document(uuid) IS
  'Devolve o documento de Encomenda Cliente com o estado de cada linha '
  '(servido_por_stock / recebido / a_aguardar_encomenda / '
  'stock_disponivel_confirmar / sem_fornecedor). 20261130070000: preserva '
  '100% a cascata de decisão já existente (última alteração em '
  '20261120190000) — a única mudança é o novo campo `available_warehouses` '
  '(array de {warehouse_id, warehouse_name, quantity}, ordenado por '
  'quantity DESC) nas linhas com line_status = stock_disponivel_confirmar, '
  'para o profissional escolher o armazém a usar em '
  'rpc_confirm_client_order_stock_exit. Nas restantes linhas o campo vem '
  'a null.';

-- =============================================================================
-- 2. rpc_confirm_client_order_stock_exit — wrapper fino sobre rpc_decrement_stock
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit(
    p_contract_id  uuid,
    p_product_id   uuid,
    p_quantity     integer,
    p_warehouse_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_balance_after   integer;
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

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Guarda de idempotência: não duplicar a saída se já houver um movimento
  -- (automático ou manual) registado para este contrato/produto — mesma
  -- deteção usada em rpc_get_client_order_document para line_status =
  -- 'servido_por_stock'.
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = p_product_id
      AND sm.movement_type IN ('venda', 'saida')
  ) THEN
    RAISE EXCEPTION 'Este produto já teve saída de stock registada para esta encomenda' USING ERRCODE = 'unique_violation';
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

REVOKE ALL ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) IS
  'Wrapper fino (20261130070000) sobre rpc_decrement_stock para confirmar, '
  'a partir do checklist de uma Encomenda Cliente, a saída de stock de uma '
  'linha em estado stock_disponivel_confirmar num armazém escolhido. Não '
  'duplica a lógica da trigger fn_stock_movements_apply nem a de '
  'rpc_decrement_stock — apenas valida scope/permissões, aplica uma guarda '
  'de idempotência (não permite duplicar a saída para o mesmo contrato + '
  'produto) e delega a escrita do movimento. SECURITY DEFINER; exige '
  'inventory.edit e client_contracts.view; GRANT apenas a authenticated.';

-- =============================================================================
-- Notas de verificação (não executadas)
-- =============================================================================
-- 1. Versão viva de rpc_get_client_order_document confirmada via:
--      SELECT pg_get_functiondef(p.oid) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.proname='rpc_get_client_order_document';
--    Resultado: idêntica à versão de 20261120190000 (nenhuma alteração
--    adicional detetada por outra sessão). CREATE OR REPLACE acima reproduz
--    essa versão linha a linha, só acrescentando `v_available_wh` e o bloco
--    de cálculo de `available_warehouses` dentro do ramo
--    `stock_disponivel_confirmar`.
--
-- 2. Assinatura viva de rpc_decrement_stock confirmada via pg_get_functiondef
--    (overload único: rpc_decrement_stock(uuid,uuid,integer,text,text,text,
--    text,text,uuid) RETURNS integer). Chamada acima usa argumentos
--    nomeados (=>) para não depender da ordem posicional. document_type =
--    'venda' replica o padrão já usado em StockMovementDialog.tsx (saída
--    manual ligada a Encomenda Cliente).
--
-- 3. `supabase migration list` (leitura) confirmou que a última migration
--    local e remota coincidem em 20261130060000 — sem gaps remote-only no
--    intervalo usado por este ficheiro (20261130070000).
--
-- 4. Verificar manualmente após deploy:
--    - Documento de Encomenda Cliente com linha stock_disponivel_confirmar
--      mostra available_warehouses com os armazéns corretos, ordenados por
--      quantidade desc.
--    - Confirmar saída deduz stock no armazém escolhido e o line_status
--      passa a servido_por_stock na próxima leitura do documento.
--    - Repetir a confirmação para o mesmo contrato/produto é bloqueada pela
--      guarda de idempotência.
