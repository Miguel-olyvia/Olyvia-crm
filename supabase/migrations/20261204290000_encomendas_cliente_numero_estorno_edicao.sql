-- ============================================================================
-- Encomendas Clientes: número de encomenda, estorno da saída confirmada e
-- edição de encomendas manuais.
--
-- Todas as funções alteradas partem da definição VIVA (pg_get_functiondef em
-- 2026-09-24), não de migrations antigas. Mantêm SECURITY DEFINER, search_path
-- e todas as verificações de permissão/âmbito que já tinham.
--
--  1) client_contracts.order_number ('EC-AAAA-NNNN'), atribuído ao assinar
--     (trigger BEFORE INSERT OR UPDATE OF status) + backfill.
--  2) rpc_get_client_order_document: order_number, origin_type, origin_number,
--     delivery_address, is_editable; por linha stock_exit_movement_id e
--     line_locked; saídas/vendas estornadas deixam de contar como servidas.
--  3) rpc_list_client_order_documents: order_number, origin_type,
--     origin_number; pesquisa por order_number. (DROP + CREATE: o tipo de
--     retorno muda.)
--  4) rpc_confirm_client_order_stock_exit: idempotência ignora estornados.
--  5) NOVA rpc_revert_client_order_stock_exit.
--  6) NOVA rpc_update_manual_client_order.
--  7) rpc_create_manual_client_order: quantidade inteira em unidades contáveis.
-- ============================================================================

-- Tudo numa transação: se algo falhar, nada fica aplicado (em particular os
-- triggers desligados durante o backfill nunca ficam desligados).
BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. NÚMERO DE ENCOMENDA
-- ────────────────────────────────────────────────────────────────────────────
-- Espelha generate_client_contract_number(): sequência GLOBAL por ano
-- (MAX + 1 sob pg_advisory_xact_lock por ano), formato PREFIXO-AAAA-NNNN.

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS order_number text;

COMMENT ON COLUMN public.client_contracts.order_number IS
  'Número da Encomenda Cliente (EC-AAAA-NNNN). Atribuído quando o contrato passa a assinado; nunca muda depois.';

CREATE OR REPLACE FUNCTION public.generate_client_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  year_part    text;
  sequence_num integer;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::text;

  PERFORM pg_advisory_xact_lock(
    hashtext('client_contracts_order_number_' || year_part)
  );

  SELECT COALESCE(MAX(
    CASE
      WHEN order_number ~ '^EC-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(order_number, '^EC-[0-9]{4}-([0-9]+)$'))[1]::integer
      ELSE 0
    END
  ), 0) + 1
  INTO sequence_num
  FROM public.client_contracts
  WHERE order_number LIKE 'EC-' || year_part || '-%';

  RETURN 'EC-' || year_part || '-' || lpad(sequence_num::text, 4, '0');
END;
$function$;

-- SECURITY DEFINER para que o número seja gerado seja qual for o caminho que
-- assina o contrato (RPC, portal, service_role) — a função de trigger não é
-- chamável diretamente e o gerador só é chamado a partir dela.
CREATE OR REPLACE FUNCTION public.set_client_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_number IS NULL
     AND NEW.status IN ('signed', 'assinado')
     AND NEW.deleted_at IS NULL THEN
    NEW.order_number := public.generate_client_order_number();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_client_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_client_order_number() TO service_role;
REVOKE ALL ON FUNCTION public.set_client_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_order_number() TO service_role;

-- Backfill: exatamente o universo de rpc_list_client_order_documents
-- (status signed/assinado, não apagados), numerado por ano de
-- COALESCE(signature_date, created_at), por ordem cronológica.
-- Os triggers de "updated_at" e do motor de leads são desligados só durante
-- este UPDATE: atribuir um número não é uma alteração de negócio e não deve
-- reavaliar etapas de leads (fn_mark_lead_pipeline_dirty) nem mexer em
-- updated_at. A auditoria genérica mantém-se ligada.
ALTER TABLE public.client_contracts DISABLE TRIGGER trg_client_contracts_mark_lead_pipeline_dirty;
ALTER TABLE public.client_contracts DISABLE TRIGGER update_client_contracts_updated_at;

WITH numbered AS (
  SELECT
    cc.id,
    EXTRACT(YEAR FROM COALESCE(cc.signature_date, cc.created_at))::int AS y,
    row_number() OVER (
      PARTITION BY EXTRACT(YEAR FROM COALESCE(cc.signature_date, cc.created_at))
      ORDER BY COALESCE(cc.signature_date, cc.created_at), cc.created_at, cc.id
    ) AS n
  FROM public.client_contracts cc
  WHERE cc.deleted_at IS NULL
    AND cc.status IN ('signed', 'assinado')
    AND cc.order_number IS NULL
)
UPDATE public.client_contracts cc
   SET order_number = 'EC-' || numbered.y::text || '-' || lpad(numbered.n::text, 4, '0')
  FROM numbered
 WHERE numbered.id = cc.id;

ALTER TABLE public.client_contracts ENABLE TRIGGER trg_client_contracts_mark_lead_pipeline_dirty;
ALTER TABLE public.client_contracts ENABLE TRIGGER update_client_contracts_updated_at;

-- Único global: o gerador é global por ano (tal como contract_number).
CREATE UNIQUE INDEX IF NOT EXISTS client_contracts_order_number_key
  ON public.client_contracts (order_number)
  WHERE order_number IS NOT NULL;

DROP TRIGGER IF EXISTS trg_set_client_order_number ON public.client_contracts;
CREATE TRIGGER trg_set_client_order_number
  BEFORE INSERT OR UPDATE OF status ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_client_order_number();


-- ────────────────────────────────────────────────────────────────────────────
-- Auxiliar: uma linha/produto da encomenda está "trancada" para edição?
--  - servida por stock: movimento venda (reference_id = linha) ou saída do
--    (contrato, produto) SEM estorno; ou
--  - produto com item num pedido a fornecedor do contrato (não cancelado).
-- Só é chamada de dentro das RPCs SECURITY DEFINER abaixo.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_client_order_product_locked(
  p_contract_id   uuid,
  p_quote_line_id uuid,
  p_product_id    uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_product_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_contract_id
        AND sm.product_id = p_product_id
        AND (
          (sm.movement_type = 'venda' AND sm.reference_id = p_quote_line_id)
          OR sm.movement_type = 'saida'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.source_type = 'contract'
        AND po.source_id = p_contract_id
        AND poi.product_id = p_product_id
        AND po.status IS DISTINCT FROM 'cancelled'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_client_order_product_locked(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_client_order_product_locked(uuid, uuid, uuid) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. rpc_get_client_order_document
-- ────────────────────────────────────────────────────────────────────────────
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
    FOR v_line IN
      SELECT
        ql.id AS quote_line_id, p.id AS product_id, NULL::uuid AS service_id,
        -- NOVO (20261204203500): quantity passa a vir em unidades de stock
        -- (qt × fator) — é o que o armazém move e o que
        -- rpc_confirm_client_order_stock_exit recebe. Fator 1 => igual.
        (ql.qt * COALESCE(ql.units_per_uom, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku,
        NULL::text AS service_name, NULL::text AS service_sku,
        ql.qt AS line_quantity, ql.uom_id AS line_uom_id, COALESCE(ql.units_per_uom, 1) AS units_per_uom, ql.unidade AS line_unidade
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
        NULL::uuid AS line_uom_id, 1 AS units_per_uom, NULL::text AS line_unidade
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
        s.name AS service_name, s.sku AS service_sku,
        ql.qt AS line_quantity, ql.uom_id AS line_uom_id, COALESCE(ql.units_per_uom, 1) AS units_per_uom, ql.unidade AS line_unidade
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
      v_stock_exit_id     := NULL;
      v_line_locked       := false;

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
        'available_warehouses',  v_available_wh,
        -- NOVO (20261204203500): quantidade/unidade tal como na linha vendida.
        'line_quantity',         v_line.line_quantity,
        'uom_id',                v_line.line_uom_id,
        'unidade',               v_line.line_unidade,
        'units_per_uom',         v_line.units_per_uom,
        -- NOVO (20261204290000)
        'stock_exit_movement_id', v_stock_exit_id,
        'line_locked',           v_line_locked
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
    'is_editable',      v_is_editable
  );
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. rpc_list_client_order_documents  (tipo de retorno muda → DROP + CREATE)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date);

CREATE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
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
  line_items AS (
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      ql.product_id         AS li_product_id,
      (ql.qt * COALESCE(ql.units_per_uom, 1)) AS li_qty  -- NOVO (20261204203500): unidades de stock
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

    UNION ALL

    -- NOVO (20261130190000): linhas de serviço puro (sem produto associado).
    -- li_product_id fica NULL de propósito — não há stock_movements nem
    -- purchase_orders para casar (serviços não passam por armazém nem por
    -- pedido a fornecedor nestes fluxos); o CASE em `lines` reconhece
    -- li_product_id IS NULL como marcador de linha de serviço, antes de
    -- tentar qualquer verificação de stock/PO.
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      NULL::uuid            AS li_product_id,
      ql.qt                 AS li_qty
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
        -- NOVO (20261130190000): linha de serviço puro — nunca teve
        -- product_id, nunca vai ter stock_movements/purchase_orders.
        WHEN li.li_product_id IS NULL THEN 'servico'
        -- (a) automático (venda + reference_id) OU (b) saída manual ligada
        -- via "Encomenda Cliente de origem" (saida, sem reference_id — ver
        -- cabeçalho desta migration e 20261115180000).
        -- NOVO (20261204290000): movimentos estornados não contam (mesma
        -- regra do detalhe).
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
            AND NOT EXISTS (
              SELECT 1 FROM public.stock_movements r
              WHERE r.reversal_of_movement_id = sm.id
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

-- A versão anterior tinha EXECUTE para PUBLIC/anon (a função recusa sem
-- sessão de qualquer forma). Fica alinhada com rpc_get_client_order_document.
REVOKE ALL ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. rpc_confirm_client_order_stock_exit — idempotência ignora estornados
-- ────────────────────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────────────────────
-- 5. NOVA rpc_revert_client_order_stock_exit
-- ────────────────────────────────────────────────────────────────────────────
-- Estorna uma saída manual confirmada ('saida' ligada ao contrato) com um
-- movimento compensatório 'estorno_venda' (padrão de
-- fn_contract_cancelled_stock_reversal). stock_movements é só de inserção:
-- o movimento original nunca é alterado.
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
  v_balance_after   integer;
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

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para estornar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
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

  IF v_mov.movement_type IS DISTINCT FROM 'saida'
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS DISTINCT FROM p_contract_id THEN
    RAISE EXCEPTION 'Este movimento não é uma saída confirmada desta encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_mov.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Movimento de stock de outra organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements r
    WHERE r.reversal_of_movement_id = v_mov.id
  ) THEN
    RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, reversal_of_movement_id,
    reference_id, sale_source_type, sale_source_id, notes, created_by
  ) VALUES (
    v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
    v_mov.document_number, 'venda', v_mov.id,
    v_mov.reference_id, 'contract', p_contract_id,
    format('Estorno da saída confirmada — Encomenda %s', COALESCE(v_order_number, v_contract_number)),
    v_actor
  )
  RETURNING balance_after INTO v_balance_after;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_revert_client_order_stock_exit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_revert_client_order_stock_exit(uuid, uuid) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. NOVA rpc_update_manual_client_order
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_manual_client_order(p_contract_id uuid, p_items jsonb, p_delivery_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract     public.client_contracts;
  v_quote_id     uuid;
  v_item         jsonb;
  v_line         public.quote_lines;
  v_line_id      uuid;
  v_seen_ids     uuid[] := ARRAY[]::uuid[];
  v_product_id   uuid;
  v_service_id   uuid;
  v_uom_id       uuid;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_sem_iva      numeric;
  v_descricao    text;
  v_categoria    text;
  v_prod_uom     text;
  v_ordem        integer;
  v_total_sem    numeric;
  v_total_com    numeric;
  v_total_fees   numeric;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Autorização: permissão de edição de contratos ───────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo âmbito de rpc_create_manual_client_order.
  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_contract.is_manual_order, false)
     OR EXISTS (SELECT 1 FROM public.direct_sales ds WHERE ds.client_contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'Só as encomendas manuais podem ser editadas' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível editar encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  v_quote_id := v_contract.quote_id;
  IF v_quote_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = v_quote_id AND q.is_internal = true
  ) THEN
    RAISE EXCEPTION 'Encomenda manual sem orçamento interno associado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM public.quotes q WHERE q.id = v_quote_id FOR UPDATE;

  -- ── Validação das linhas (antes de qualquer escrita) ────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_id    := nullif(v_item ->> 'quote_line_id', '')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_uom_id     := nullif(v_item ->> 'uom_id', '')::uuid;

    IF v_line_id IS NOT NULL THEN
      IF v_line_id = ANY (v_seen_ids) THEN
        RAISE EXCEPTION 'A mesma linha aparece repetida na encomenda' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.quote_lines ql
         WHERE ql.id = v_line_id AND ql.quote_id = v_quote_id
      ) THEN
        RAISE EXCEPTION 'Linha não pertence a esta encomenda: %', v_line_id USING ERRCODE = 'no_data_found';
      END IF;
      v_seen_ids := v_seen_ids || v_line_id;
    END IF;

    IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
      RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
    END IF;

    v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
    IF v_qt IS NULL OR v_qt <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.services s WHERE s.id = v_service_id
    ) THEN
      RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
    END IF;

    -- Unidade contável (embalagem escolhida, ou unidade base do produto
    -- un/EA/PCS/BOX/PKG) => quantidade inteira.
    v_prod_uom := NULL;
    IF v_product_id IS NOT NULL THEN
      SELECT lower(u.code) INTO v_prod_uom
        FROM public.products p
        LEFT JOIN public.uom u ON u.id = p.uom_id
       WHERE p.id = v_product_id;
    END IF;

    IF (v_uom_id IS NOT NULL OR v_prod_uom IN ('un', 'ea', 'pcs', 'box', 'pkg'))
       AND v_qt <> trunc(v_qt) THEN
      RAISE EXCEPTION 'A quantidade da linha "%" tem de ser um número inteiro (unidade contável)',
        COALESCE(nullif(v_item ->> 'descricao', ''), 'Item') USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- ── Remover linhas ausentes de p_items (nunca as trancadas) ─────────────
  FOR v_line IN
    SELECT * FROM public.quote_lines ql
     WHERE ql.quote_id = v_quote_id
       AND NOT (ql.id = ANY (v_seen_ids))
  LOOP
    IF public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id) THEN
      RAISE EXCEPTION 'A linha "%" não pode ser removida: já saiu de stock ou tem pedido a fornecedor.',
        v_line.descricao_snapshot USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.quote_lines WHERE id = v_line.id;
  END LOOP;

  -- ── Atualizar existentes / inserir novas ────────────────────────────────
  SELECT COALESCE(MAX(ql.ordem), 0) INTO v_ordem
    FROM public.quote_lines ql WHERE ql.quote_id = v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_id    := nullif(v_item ->> 'quote_line_id', '')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_uom_id     := nullif(v_item ->> 'uom_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_descricao  := COALESCE(nullif(v_item ->> 'descricao', ''), 'Item');
    v_categoria  := COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral');

    IF v_line_id IS NOT NULL THEN
      SELECT * INTO v_line FROM public.quote_lines WHERE id = v_line_id FOR UPDATE;

      IF v_line.product_id         IS DISTINCT FROM v_product_id
         OR v_line.service_id      IS DISTINCT FROM v_service_id
         OR v_line.qt              IS DISTINCT FROM v_qt
         OR v_line.custo_material_unit IS DISTINCT FROM v_preco
         OR v_line.iva_percent     IS DISTINCT FROM v_iva
         OR v_line.uom_id          IS DISTINCT FROM v_uom_id
         OR v_line.descricao_snapshot IS DISTINCT FROM v_descricao
         OR v_line.categoria       IS DISTINCT FROM v_categoria THEN

        IF public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id) THEN
          RAISE EXCEPTION 'A linha "%" não pode ser alterada: já saiu de stock ou tem pedido a fornecedor.',
            v_line.descricao_snapshot USING ERRCODE = 'check_violation';
        END IF;

        UPDATE public.quote_lines
           SET product_id          = v_product_id,
               service_id          = v_service_id,
               qt                  = v_qt,
               custo_material_unit = v_preco,
               iva_percent         = v_iva,
               descricao_snapshot  = v_descricao,
               categoria           = v_categoria,
               total_sem_iva       = v_sem_iva,
               total_com_iva       = round(v_sem_iva * (1 + v_iva / 100), 2),
               total_com_desconto  = v_sem_iva,
               uom_id              = v_uom_id,
               -- fn_line_units_per_uom_snapshot repõe unidade/fator quando
               -- há embalagem; sem embalagem a unidade antiga não fica.
               unidade             = CASE WHEN v_uom_id IS DISTINCT FROM v_line.uom_id
                                          THEN NULL ELSE v_line.unidade END
         WHERE id = v_line.id;
      END IF;
    ELSE
      v_ordem := v_ordem + 1;

      INSERT INTO public.quote_lines (
        quote_id, categoria, descricao_snapshot,
        qt, product_id, service_id,
        custo_material_unit, margem_percent, iva_percent,
        total_sem_iva, total_com_iva, total_com_desconto,
        ordem, section_name,
        uom_id
      )
      VALUES (
        v_quote_id,
        v_categoria,
        v_descricao,
        v_qt, v_product_id, v_service_id,
        v_preco, 0, v_iva,
        v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
        v_ordem, 'Geral',
        v_uom_id
      );
    END IF;
  END LOOP;

  -- ── Totais (mesmas fórmulas da criação: soma das linhas arredondadas) ────
  SELECT COALESCE(SUM(ql.total_sem_iva), 0), COALESCE(SUM(ql.total_com_iva), 0)
    INTO v_total_sem, v_total_com
    FROM public.quote_lines ql
   WHERE ql.quote_id = v_quote_id;

  UPDATE public.quotes
     SET subtotal      = v_total_sem,
         total         = v_total_com,
         obra_endereco = nullif(btrim(p_delivery_address), '')
   WHERE id = v_quote_id
  RETURNING COALESCE(total_fees, 0) INTO v_total_fees;

  -- set_client_contract_total_value_sem_iva não recalcula depois de assinado
  -- (valor congelado): os dois valores são escritos aqui explicitamente.
  UPDATE public.client_contracts
     SET total_value         = v_total_com,
         total_value_sem_iva = v_total_sem + v_total_fees
   WHERE id = p_contract_id
  RETURNING * INTO v_contract;

  RETURN jsonb_build_object(
    'success',      true,
    'contract_id',  v_contract.id,
    'order_number', v_contract.order_number,
    'total_value',  v_contract.total_value
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_update_manual_client_order(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_manual_client_order(uuid, jsonb, text) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. rpc_create_manual_client_order — só acrescenta a validação de
--    quantidade inteira em unidades contáveis. Resto igual à versão viva.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_entity_id    uuid;
  v_root_org_id  uuid;
  v_client_id    uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_contract     public.client_contracts;
  v_item         jsonb;
  v_ordem        integer := 0;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_product_id   uuid;
  v_service_id   uuid;
  v_sem_iva      numeric;
  v_total_sem    numeric := 0;
  v_total_com    numeric := 0;
  v_start_date   date;
  v_prod_uom     text;  -- NOVO (20261204290000)
BEGIN
  -- ── Ator de negócio (== created_by no frontend) ──────────────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização: mesma permissão de criar um contrato, porque é
  --    literalmente isso que esta função cria ────────────────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Cliente (entidade) ───────────────────────────────────────────────────
  v_entity_id := nullif(p_order ->> 'entity_id', '')::uuid;
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar o cliente da encomenda' USING ERRCODE = 'check_violation';
  END IF;

  -- `anew_entities` é agnóstica à organização (id, type, display_name, ...):
  -- quem carrega o âmbito organizacional é a ficha de cliente `anew_clients`.
  -- Exigir essa ficha é também a validação de âmbito: uma Encomenda Cliente só
  -- pode existir para um cliente real desta organização.
  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_entity_id
     AND c.organization_id = p_organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_entity_id;

  -- ── Linhas ───────────────────────────────────────────────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;

    IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
      RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
    END IF;

    v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
    IF v_qt IS NULL OR v_qt <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.services s WHERE s.id = v_service_id
    ) THEN
      RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
    END IF;

    -- NOVO (20261204290000): unidade contável (embalagem escolhida, ou
    -- unidade base do produto un/EA/PCS/BOX/PKG) => quantidade inteira.
    v_prod_uom := NULL;
    IF v_product_id IS NOT NULL THEN
      SELECT lower(u.code) INTO v_prod_uom
        FROM public.products p
        LEFT JOIN public.uom u ON u.id = p.uom_id
       WHERE p.id = v_product_id;
    END IF;

    IF (nullif(v_item ->> 'uom_id', '') IS NOT NULL
        OR v_prod_uom IN ('un', 'ea', 'pcs', 'box', 'pkg'))
       AND v_qt <> trunc(v_qt) THEN
      RAISE EXCEPTION 'A quantidade da linha "%" tem de ser um número inteiro (unidade contável)',
        COALESCE(nullif(v_item ->> 'descricao', ''), 'Item') USING ERRCODE = 'check_violation';
    END IF;

    v_preco   := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva     := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva := round(v_qt * v_preco, 2);

    v_total_sem := v_total_sem + v_sem_iva;
    v_total_com := v_total_com + round(v_sem_iva * (1 + v_iva / 100), 2);
  END LOOP;

  -- ── 1. Orçamento sintético (nunca aparece em Quotes.tsx / Proposals.tsx) ──
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas,
    obra_endereco  -- NOVO (20261204280000)
  )
  VALUES (
    v_entity_id, v_client_id, p_organization_id, v_root_org_id,
    v_actor, 'aceite', true, 'EUR',
    v_total_sem, v_total_com, 23, now(),
    'Encomenda manual — ' || COALESCE(v_entity_name, 'cliente'),
    nullif(p_order ->> 'notes', ''),
    nullif(btrim(p_order ->> 'delivery_address'), '')
  )
  RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_ordem      := v_ordem + 1;

    INSERT INTO public.quote_lines (
      quote_id, categoria, descricao_snapshot,
      qt, product_id, service_id,
      custo_material_unit, margem_percent, iva_percent,
      total_sem_iva, total_com_iva, total_com_desconto,
      ordem, section_name,
      uom_id  -- NOVO (20261204204500)
    )
    VALUES (
      v_quote_id,
      COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral'),
      COALESCE(nullif(v_item ->> 'descricao', ''), 'Item'),
      v_qt, v_product_id, v_service_id,
      v_preco, 0, v_iva,
      v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
      v_ordem, 'Geral',
      nullif(v_item ->> 'uom_id', '')::uuid
    );
  END LOOP;

  -- ── 2. Contrato em rascunho (contract_number é gerado pelo trigger
  --       trigger_set_client_contract_number, BEFORE INSERT) ────────────────
  v_start_date := COALESCE(nullif(p_order ->> 'start_date', '')::date, current_date);

  -- contract_number fica NULL de propósito: o trigger set_client_contract_number
  -- só gera o número quando o valor vem NULL (um '' passaria incólume e a
  -- encomenda ficaria sem número).
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_entity_id, v_quote_id,
    p_organization_id, v_root_org_id, v_actor,
    'draft', v_total_com, 'EUR', v_start_date,
    nullif(p_order ->> 'notes', ''),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 3. Promover a assinado: é este UPDATE que dispara a dedução de stock e
  --       os pedidos a fornecedor (AFTER UPDATE OF status) ──────────────────
  UPDATE public.client_contracts
     SET status          = 'signed',
         signature_date  = now(),
         accepted_at     = now(),
         signed_by_name  = COALESCE(v_entity_name, 'Encomenda manual'),
         status_changed_by = v_actor,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$function$;

COMMIT;
