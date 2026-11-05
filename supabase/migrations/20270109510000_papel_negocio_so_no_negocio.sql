-- =============================================================================
-- 20270109510000 — o Papel no Negócio vale só no Negócio (auditoria 05/11: «armazém envia PO sem purchase_orders.approve»)
-- =============================================================================
-- neg_papeis_permissoes dá permissões pelo papel do RH (Compras e armazém, Comercial, Direção, Financeiro, Jurídico, Operações,
-- Técnico), lidas por fn_cat_pode / fn_neg_papel_permite. Quatro funções aceitavam o papel para QUALQUER registo da organização,
-- fora do negócio:
--   fn_po_crm_load (purchase_orders.approve do armazém): enviar ao fornecedor / retirar QUALQUER encomenda a fornecedor;
--   rpc_get_client_order_document, rpc_client_order_list_readiness, neg_ler_encomendas_fornecedor (client_orders.view):
--     ler QUALQUER encomenda de cliente (manual, venda direta) e as suas encomendas a fornecedor.
-- Passam a aceitar o papel só para o que é de um negócio: a PO pedida pela EC de um negócio (source_type = 'contract' e o
-- contrato com negocio_id), a EC de um negócio (client_contracts.negocio_id). Com a permissão no perfil nada muda.
-- O fluxo do Negócio continua: a página do negócio só chama estas funções para a EC do negócio (encomendaReal.ts,
-- inventarioReal.ts) e para as POs dela (aprovarPoReal).
-- Corpos a partir de pg_get_functiondef VIVO (05/11/2026); a guarda para se o corpo mudou desde a leitura.
-- Sem tabelas nem colunas novas.
-- =============================================================================

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_po_crm_load(uuid,text,boolean)'::regprocedure) IS DISTINCT FROM '95beb2e3b2278813f57a99a1790fc859' THEN
    RAISE EXCEPTION 'public.fn_po_crm_load(uuid,text,boolean) mudou desde a leitura de 05/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rpc_client_order_list_readiness(uuid,uuid[])'::regprocedure) IS DISTINCT FROM 'd251f019fdd7a691fefaed9595149564' THEN
    RAISE EXCEPTION 'public.rpc_client_order_list_readiness(uuid,uuid[]) mudou desde a leitura de 05/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rpc_get_client_order_document(uuid)'::regprocedure) IS DISTINCT FROM 'e03807e234a2d4fc49f441775348b00d' THEN
    RAISE EXCEPTION 'public.rpc_get_client_order_document(uuid) mudou desde a leitura de 05/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.neg_ler_encomendas_fornecedor(uuid,uuid)'::regprocedure) IS DISTINCT FROM '969b52b276d880da12189fc5b06de32c' THEN
    RAISE EXCEPTION 'public.neg_ler_encomendas_fornecedor(uuid,uuid) mudou desde a leitura de 05/11: rever antes de aplicar';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.fn_po_crm_load(p_po_id uuid, p_permission text, p_lock boolean)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_po  public.purchase_orders;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_lock THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL FOR UPDATE;
  ELSE
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL;
  END IF;
  IF v_po.id IS NULL OR NOT public.fn_deal_org_in_scope(v_po.organization_id) THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT (public.has_anew_permission_for_org(v_uid, p_permission, v_po.organization_id)
          OR (public.fn_neg_papel_permite(v_po.organization_id, p_permission) -- 20270101340000
              -- 20270109510000: pelo Papel no Negócio só as encomendas a fornecedor de um negócio (as que a EC do negócio pediu);
              -- as outras pedem a permissão no perfil, como no ecrã das Compras.
              AND v_po.source_type = 'contract'
              AND EXISTS (SELECT 1 FROM public.client_contracts cc
                          WHERE cc.id = v_po.source_id AND cc.organization_id = v_po.organization_id AND cc.negocio_id IS NOT NULL))) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (%)', p_permission
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN v_po;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_client_order_list_readiness(p_organization_id uuid, p_contract_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, lines_ready integer, units_ready numeric, units_in_stock_reserved numeric, units_on_po numeric, units_missing numeric, units_served numeric, units_received numeric, units_needed numeric, is_ready boolean, ec_warehouse_id uuid, ec_plan text, reserved_warehouse_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_so_negocios boolean; -- 20270109510000
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesma verificação que rpc_list_client_order_documents.
  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (COALESCE(public.has_anew_permission_for_org(v_uid, 'client_orders.view', p_organization_id), false) OR public.fn_neg_papel_permite(p_organization_id, 'client_orders.view')) THEN -- 20270101360000
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270109510000: quem só passa pelo Papel no Negócio vê só as encomendas de cliente dos negócios.
  v_so_negocios := NOT COALESCE(public.has_anew_permission_for_org(v_uid, 'client_orders.view', p_organization_id), false);

  RETURN QUERY
  WITH r AS MATERIALIZED (
    -- Uma só passagem pela reserva da organização inteira.
    -- NOVO (EC por armazém): motor por armazém (mesmos totais por linha).
    SELECT
      f.contract_id  AS r_contract_id,
      f.product_id   AS r_product_id,
      f.is_served    AS r_is_served,
      COALESCE(f.qty_needed,   0) AS r_needed,
      COALESCE(f.qty_served,   0) AS r_served,
      COALESCE(f.qty_ordered,  0) AS r_ordered,
      COALESCE(f.qty_received, 0) AS r_received,
      COALESCE(f.qty_reserved, 0) AS r_reserved,
      COALESCE(f.qty_missing,  0) AS r_missing,
      f.warehouse_alloc AS r_alloc,
      f.ec_warehouse_id AS r_ec_wh,
      f.ec_plan         AS r_ec_plan
    FROM public.fn_client_order_line_reservations_wh(p_organization_id, NULL) f
  ),
  rc AS (
    -- Contratos da lista (filtros de rpc_list_client_order_documents).
    SELECT cc.id AS rc_contract_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (ARRAY['signed', 'assinado'])
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado
      AND (p_contract_ids IS NULL OR cc.id = ANY (p_contract_ids))
      AND (NOT v_so_negocios OR cc.negocio_id IS NOT NULL) -- 20270109510000
  ),
  lx AS (
    SELECT
      r.*,
      -- Linha em aberto: negação da regra de concluída de rpc_inventory_today.
      NOT (
        r.r_is_served
        OR (r.r_reserved = 0
            AND r.r_served = 0
            AND r.r_missing = 0
            AND r.r_ordered > 0
            AND r.r_received >= r.r_ordered)
      ) AS r_open
    FROM r
    JOIN rc ON rc.rc_contract_id = r.r_contract_id
    WHERE r.r_product_id IS NOT NULL
  ),
  agg AS (
    SELECT
      lx.r_contract_id AS a_contract_id,
      count(*) FILTER (WHERE lx.r_open AND lx.r_reserved > 0)::integer           AS a_lines_ready,
      COALESCE(sum(lx.r_reserved) FILTER (WHERE lx.r_open AND lx.r_reserved > 0), 0) AS a_units_ready,
      COALESCE(sum(lx.r_reserved), 0)                                            AS a_units_reserved,
      COALESCE(sum(GREATEST(0, lx.r_ordered - lx.r_received)) FILTER (WHERE lx.r_open), 0) AS a_units_on_po,
      COALESCE(sum(lx.r_missing) FILTER (WHERE lx.r_open), 0)                    AS a_units_missing,
      COALESCE(sum(lx.r_served + lx.r_received), 0)                              AS a_units_served,
      COALESCE(sum(lx.r_received), 0)                                            AS a_units_received,
      COALESCE(sum(lx.r_needed), 0)                                              AS a_units_needed,
      -- NOVO (EC por armazém)
      count(*) FILTER (WHERE lx.r_open)::integer                                 AS a_lines_open,
      max(lx.r_ec_wh::text)::uuid                                                AS a_ec_wh,
      max(lx.r_ec_plan)                                                          AS a_ec_plan
    FROM lx
    GROUP BY lx.r_contract_id
  ),
  whs AS (
    -- NOVO (EC por armazém): armazéns com stock reservado em aberto.
    SELECT lx.r_contract_id AS w_contract_id,
           array_agg(DISTINCT (e ->> 'warehouse_id')::uuid) AS w_ids
    FROM lx
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(lx.r_alloc, '[]'::jsonb)) e
    WHERE lx.r_open
    GROUP BY lx.r_contract_id
  ),
  ecw AS (
    -- Armazém / plano da EC também para EC sem linhas de produto em aberto.
    SELECT DISTINCT ON (r.r_contract_id) r.r_contract_id AS e_contract_id, r.r_ec_wh AS e_wh, r.r_ec_plan AS e_plan
    FROM r
    ORDER BY r.r_contract_id
  )
  SELECT
    rc.rc_contract_id,
    COALESCE(a.a_lines_ready, 0),
    COALESCE(a.a_units_ready, 0)::numeric,
    COALESCE(a.a_units_reserved, 0)::numeric,
    COALESCE(a.a_units_on_po, 0)::numeric,
    COALESCE(a.a_units_missing, 0)::numeric,
    COALESCE(a.a_units_served, 0)::numeric,
    COALESCE(a.a_units_received, 0)::numeric,
    COALESCE(a.a_units_needed, 0)::numeric,
    -- NOVO (EC por armazém)
    (COALESCE(a.a_lines_open, 0) > 0
     AND COALESCE(a.a_lines_ready, 0) > 0
     AND COALESCE(a.a_units_missing, 0) = 0
     AND COALESCE(a.a_units_on_po, 0) = 0),
    COALESCE(a.a_ec_wh, e.e_wh),
    COALESCE(a.a_ec_plan, e.e_plan),
    COALESCE(w.w_ids, ARRAY[]::uuid[])
  FROM rc
  LEFT JOIN agg a ON a.a_contract_id = rc.rc_contract_id
  LEFT JOIN whs w ON w.w_contract_id = rc.rc_contract_id
  LEFT JOIN ecw e ON e.e_contract_id = rc.rc_contract_id;
END;
$function$;

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
  -- NOVO (EC por armazém)
  v_line_alloc        jsonb;
  v_line_sugg_wh      uuid;
  v_ec_warehouse_id   uuid;
  v_ec_warehouse_name text;
  v_ec_plan           text;
  v_pending_reserved  numeric := 0;
  v_ded_log           record;
  v_ded_mode          text;
  v_ded_warning       text;
  v_ded_info          jsonb;
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
     OR NOT (public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)
             OR (public.fn_neg_papel_permite(v_org, 'client_orders.view') -- 20270101360000
                 -- 20270109510000: pelo Papel no Negócio só a encomenda de cliente de um negócio
                 AND EXISTS (SELECT 1 FROM public.client_contracts cc_n WHERE cc_n.id = p_contract_id AND cc_n.negocio_id IS NOT NULL))) THEN
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
        -- NOVO (EC por armazém): motor por armazém (mesmas chaves +
        -- warehouse_id, warehouse_alloc, ec_warehouse_id, ec_plan).
        SELECT jsonb_object_agg(
                 r.quote_line_id::text || ':' || COALESCE(r.component_index, 0)::text,
                 to_jsonb(r)
               ),
               (array_agg(r.ec_warehouse_id))[1],
               (array_agg(r.ec_plan))[1],
               COALESCE(SUM(r.qty_reserved), 0)
          INTO v_res_map, v_ec_warehouse_id, v_ec_plan, v_pending_reserved
        FROM public.fn_client_order_line_reservations_wh(v_org, v_products) r
        WHERE r.contract_id = p_contract_id;

        IF v_ec_warehouse_id IS NOT NULL THEN
          SELECT w.name INTO v_ec_warehouse_name FROM public.warehouses w WHERE w.id = v_ec_warehouse_id;
        END IF;
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
      v_line_alloc        := NULL;  -- NOVO (EC por armazém)
      v_line_sugg_wh      := NULL;

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
          -- NOVO (EC por armazém): de onde sai a reserva desta linha.
          v_line_alloc    := COALESCE(v_res -> 'warehouse_alloc', '[]'::jsonb);
          v_line_sugg_wh  := (v_res ->> 'warehouse_id')::uuid;

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
          -- NOVO (EC por armazém): só elegíveis (também sem viaturas);
          -- suggested_quantity = parcela da reserva neste armazém (0 se a
          -- regra não o escolheu); os sugeridos primeiro.
          IF v_q_reserved > 0 THEN
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'warehouse_id',       w.id,
                  'warehouse_name',     w.name,
                  'quantity',           LEAST(s.quantity::numeric, v_q_reserved),
                  'physical_quantity',  s.quantity,
                  'suggested_quantity', COALESCE(al.q, 0),
                  'is_suggested',       (w.id = v_line_sugg_wh)
                )
                ORDER BY COALESCE(al.q, 0) DESC, s.quantity DESC, cw.sort_order
              ),
              '[]'::jsonb
            ) INTO v_available_wh
            FROM public.stocks s
            JOIN public.warehouses w ON w.id = s.warehouse_id
            JOIN public.fn_client_order_warehouses(v_org) cw ON cw.warehouse_id = w.id
            LEFT JOIN LATERAL (
              SELECT SUM((e ->> 'qty')::numeric) AS q
              FROM jsonb_array_elements(v_line_alloc) e
              WHERE (e ->> 'warehouse_id')::uuid = w.id
            ) al ON true
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
        'cancellations',         v_cancellations,
        -- NOVO (EC por armazém): armazém sugerido para a saída desta linha (a
        -- maior parcela da reserva) e a reserva por armazém
        -- [{warehouse_id, warehouse_name, qty}] (unidades base; soma =
        -- qty_reserved). NULL em serviços / encomendas não assinadas.
        'suggested_warehouse_id', v_line_sugg_wh,
        'warehouse_alloc',        v_line_alloc
      );
    END LOOP;

    -- NOVO (EC por armazém): aviso da baixa automática. Só quando a última
    -- tentativa (gatilho / emissão da EC) não deu baixa a tudo e ainda há stock
    -- reservado à espera de saída nesta EC — senão já não interessa.
    IF v_is_signed AND v_pending_reserved > 0 THEN
      SELECT ois.stock_deduction_trigger INTO v_ded_mode
      FROM public.organization_inventory_settings ois
      WHERE ois.organization_id = v_org;

      SELECT l.action_type, l.status, l.error_message, l.execution_data, l.executed_at
        INTO v_ded_log
      FROM public.workflow_execution_log l
      WHERE l.source_entity = 'contract'
        AND l.source_record_id = p_contract_id
        AND l.action_type IN ('trigger:contract_stock_deduction', 'trigger:contract_stock_deduction_no_warehouse')
      ORDER BY l.executed_at DESC NULLS LAST, l.id DESC
      LIMIT 1;

      IF FOUND AND COALESCE(v_ded_mode, 'contract_signed') = 'contract_signed' THEN
        IF v_ded_log.action_type = 'trigger:contract_stock_deduction_no_warehouse' THEN
          v_ded_warning := 'A baixa automática de stock não foi feita: não havia nenhum armazém elegível (ativo, que sirva clientes e não seja viatura). Dê saída do stock reservado em «Saída de stock».';
        ELSIF v_ded_log.status = 'error' THEN
          v_ded_warning := 'A baixa automática de stock falhou. Dê saída do stock reservado em «Saída de stock».';
        ELSIF COALESCE((v_ded_log.execution_data ->> 'lines_skipped')::integer, 0) > 0 THEN
          v_ded_warning := format('A baixa automática de stock saltou %s linha(s). Dê saída do stock reservado em «Saída de stock».',
                                  (v_ded_log.execution_data ->> 'lines_skipped'));
        END IF;

        IF v_ded_warning IS NOT NULL THEN
          v_ded_info := jsonb_build_object(
            'action_type', v_ded_log.action_type,
            'status',      v_ded_log.status,
            'executed_at', v_ded_log.executed_at,
            'reason',      COALESCE(v_ded_log.execution_data ->> 'reason', v_ded_log.error_message),
            'data',        v_ded_log.execution_data
          );
        END IF;
      END IF;
    END IF;

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
    'delivery_address_override', nullif(btrim(v_cc_delivery), ''),
    -- NOVO (EC por armazém): armazém da EC (único se ec_plan='single'; senão
    -- o com mais reservado; sem reserva, o sugerido para a receção), plano
    -- ('single' | 'split' | 'partial' | 'none') e aviso da baixa automática
    -- (texto pronto a mostrar + detalhe), NULL quando não há nada a avisar.
    'ec_warehouse_id',           v_ec_warehouse_id,
    'ec_warehouse_name',         v_ec_warehouse_name,
    'ec_plan',                   v_ec_plan,
    'stock_deduction_warning',   v_ded_warning,
    'stock_deduction',           v_ded_info
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_ler_encomendas_fornecedor(p_org uuid, p_contrato uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['client_orders.view', 'purchase_orders.view']);
  IF NOT EXISTS (SELECT 1 FROM client_contracts WHERE id = p_contrato AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Encomenda de cliente não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  -- 20270109510000: quem só passa pelo Papel no Negócio (fn_cat_pode sem o perfil) lê só as encomendas da EC de um negócio.
  IF NOT (public.is_system_admin_user(auth.uid())
          OR public.has_anew_permission_in_org(auth.uid(), 'client_orders.view', p_org)
          OR public.has_anew_permission_in_org(auth.uid(), 'purchase_orders.view', p_org))
     AND NOT EXISTS (SELECT 1 FROM client_contracts WHERE id = p_contrato AND organization_id = p_org AND negocio_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Sem permissão (client_orders.view ou purchase_orders.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'order_number', po.order_number, 'status', po.status,
      'expected_delivery', po.expected_delivery, 'fornecedor', s.name,
      'publicada', pub.purchase_order_id IS NOT NULL AND pub.status <> 'withdrawn', 'prometida', pub.promised_date) ORDER BY po.created_at)
    FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN supplier_po_publications pub ON pub.purchase_order_id = po.id
    WHERE po.organization_id = p_org AND po.source_type = 'contract' AND po.source_id = p_contrato AND po.deleted_at IS NULL), '[]');
END $function$;
