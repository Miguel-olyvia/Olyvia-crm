-- 20261205210000: pesquisa das Encomendas Clientes encontra a Venda Direta de origem
--
-- rpc_list_client_order_documents (lista de Encomendas Clientes e seletor da
-- saída manual de stock): p_search procurava só no nº do contrato (CC-...),
-- nome do cliente e nº da encomenda (EC-...). Pesquisar "VD-2026-0004" não
-- encontrava a EC gerada por essa venda direta.
--
-- Alteração mínima, só no filtro de p_search (mesmo padrão strpos/lower):
--   + origin_number  -> nº da VD de origem (já devolvido na coluna
--                       origin_number; NULL sem direct_sales.view)
--   + proforma da VD -> d.proforma_number, lido no mesmo LEFT JOIN LATERAL
--                       que já existia (LIMIT 1, não duplica linhas), com a
--                       mesma regra de visibilidade (v_can_see_ds).
-- A coluna auxiliar a_ds_proforma_number só existe dentro do CTE; o RETURNS
-- TABLE, a ordem, a paginação e o resto do corpo ficam iguais.
--
-- Segurança inalterada: mesma assinatura e retorno, SECURITY DEFINER,
-- search_path public, pg_temp, mesmas verificações de organização e
-- permissão (client_orders.view / direct_sales.view). CREATE OR REPLACE
-- mantém owner e GRANTs (authenticated, service_role; sem anon).
--
-- Partiu da definição VIVA (pg_get_functiondef em 2026-10-01), não de
-- migrations antigas. Reversão: executar o corpo anterior, em comentário no
-- fim deste ficheiro.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, lines_service integer, overall_status text, order_number text, origin_type text, origin_number text, delivery_address text)
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

  -- NOVO (20261205000000): permissão própria client_orders.view em vez de
  -- inventory.view + client_contracts.view.
  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN
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
      END AS a_origin_number,
      -- NOVO (20261204400000): entidade do contrato, para a morada de entrega.
      cco.entity_id AS a_entity_id,
      -- NOVO (20261204730000): morada escolhida na própria encomenda.
      cco.delivery_address AS a_cc_delivery_address,
      -- NOVO (20261205210000): proforma da venda direta, só para pesquisa;
      -- mesma visibilidade que origin_number (direct_sales.view).
      CASE WHEN ds.ds_found AND v_can_see_ds THEN ds.ds_proforma_number END AS a_ds_proforma_number
    FROM combined c
    JOIN public.client_contracts cco ON cco.id = c.a_contract_id
    LEFT JOIN LATERAL (
      SELECT true AS ds_found, d.sale_number AS ds_sale_number,
             d.proforma_number AS ds_proforma_number  -- NOVO (20261205210000)
      FROM public.direct_sales d
      WHERE d.client_contract_id = c.a_contract_id
      ORDER BY d.created_at DESC
      LIMIT 1
    ) ds ON true
  ),
  -- NOVO (20261204400000): filtros, ordem e paginação iguais aos anteriores;
  -- a morada de entrega só é calculada para as linhas desta página.
  page AS (
    SELECT f.*
    FROM final f
    WHERE
      (
        p_search IS NULL OR p_search = ''
        OR strpos(lower(COALESCE(f.a_contract_number, '')), lower(p_search)) > 0
        OR strpos(lower(COALESCE(f.a_client_name, '')), lower(p_search)) > 0
        -- NOVO (20261204290000)
        OR strpos(lower(COALESCE(f.a_order_number, '')), lower(p_search)) > 0
        -- NOVO (20261205210000): nº da venda direta de origem (VD-...) e a
        -- sua proforma (PF-...). origin_number já vem a NULL sem
        -- direct_sales.view, logo a pesquisa não revela VDs escondidas.
        OR strpos(lower(COALESCE(f.a_origin_number, '')), lower(p_search)) > 0
        OR strpos(lower(COALESCE(f.a_ds_proforma_number, '')), lower(p_search)) > 0
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
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    pg.a_contract_id          AS contract_id,
    pg.a_contract_number      AS contract_number,
    pg.a_client_name          AS client_name,
    pg.a_signature_date       AS signature_date,
    pg.a_total_lines          AS total_lines,
    pg.a_lines_from_stock     AS lines_from_stock,
    pg.a_lines_awaiting_order AS lines_awaiting_order,
    pg.a_lines_received       AS lines_received,
    pg.a_lines_no_supplier    AS lines_no_supplier,
    pg.a_lines_service        AS lines_service,
    pg.a_overall_status       AS overall_status,
    pg.a_order_number         AS order_number,
    pg.a_origin_type          AS origin_type,
    pg.a_origin_number        AS origin_number,
    -- NOVO (20261204400000): mesma regra de rpc_get_client_order_document.
    -- 20261204730000: + morada da própria encomenda com prioridade.
    COALESCE(nullif(btrim(pg.a_cc_delivery_address), ''), qa.qa_address, ca.ca_address) AS delivery_address
  FROM page pg
  LEFT JOIN resolved_contracts rc2 ON rc2.rc_contract_id = pg.a_contract_id
  LEFT JOIN LATERAL (
    SELECT nullif(btrim(q.obra_endereco), '') AS qa_address
    FROM public.quotes q
    WHERE q.id = rc2.rc_resolved_quote_id
    LIMIT 1
  ) qa ON true
  LEFT JOIN LATERAL (
    SELECT nullif(concat_ws(', ',
             nullif(btrim(a.street), ''),
             nullif(btrim(a.number), ''),
             nullif(btrim(a.postal_code), ''),
             nullif(btrim(a.city), '')
           ), '') AS ca_address
    FROM public.anew_entity_addresses ea
    JOIN public.anew_addresses a ON a.id = ea.address_id
    WHERE qa.qa_address IS NULL
      AND pg.a_entity_id IS NOT NULL
      AND ea.entity_id = pg.a_entity_id
      AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ORDER BY ea.is_primary DESC NULLS LAST, ea.created_at DESC
    LIMIT 1
  ) ca ON true
  ORDER BY pg.a_signature_date DESC NULLS LAST, pg.a_contract_number DESC;
END;
$function$;


-- ---------------------------------------------------------------------------
-- REVERSÃO: definição viva anterior (pg_get_functiondef, 2026-10-01).
-- Retirar o prefixo '-- ' e executar.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
--  RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, lines_service integer, overall_status text, order_number text, origin_type text, origin_number text, delivery_address text)
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_signed_aliases text[] := ARRAY['signed', 'assinado'];
--   v_limit          int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
--   v_offset         int := GREATEST(COALESCE(p_offset, 0), 0);
--   -- NOVO (20261204290000): mesma regra da RLS de direct_sales.
--   v_can_see_ds     boolean;
-- BEGIN
--   IF p_organization_id IS NULL THEN
--     RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- NOVO (20261205000000): permissão própria client_orders.view em vez de
--   -- inventory.view + client_contracts.view.
--   IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN
--     RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   v_can_see_ds := public.is_system_admin_user(auth.uid())
--                   OR public.has_anew_permission(auth.uid(), 'direct_sales.view');
--
--   RETURN QUERY
--   WITH resolved_contracts AS (
--     SELECT
--       cc.id                AS rc_contract_id,
--       cc.contract_number   AS rc_contract_number,
--       cc.signature_date    AS rc_signature_date,
--       e.display_name       AS rc_client_name,
--       COALESCE(
--         cc.quote_id,
--         (
--           SELECT q2.id
--           FROM public.quotes q2
--           WHERE q2.proposal_id = cc.proposal_id
--           ORDER BY q2.created_at DESC
--           LIMIT 1
--         )
--       )                     AS rc_resolved_quote_id
--     FROM public.client_contracts cc
--     LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
--     WHERE cc.organization_id = p_organization_id
--       AND cc.deleted_at IS NULL
--       AND cc.status = ANY (v_signed_aliases)
--   ),
--   -- NOVO (20261204310000): reserva por ordem de toda a organização (uma vez).
--   res AS (
--     SELECT
--       r.contract_id     AS r_contract_id,
--       r.quote_line_id   AS r_quote_line_id,
--       r.component_index AS r_component_index,
--       r.product_id      AS r_product_id,
--       r.is_served       AS r_is_served,
--       r.qty_served      AS r_qty_served,     -- NOVO (20261204340000)
--       r.qty_ordered     AS r_qty_ordered,
--       r.qty_received    AS r_qty_received,
--       r.qty_reserved    AS r_qty_reserved,
--       r.qty_missing     AS r_qty_missing
--     FROM public.fn_client_order_line_reservations(p_organization_id, NULL) r
--   ),
--   line_items AS (
--     SELECT
--       rc.rc_contract_id     AS li_contract_id,
--       rc.rc_contract_number AS li_contract_number,
--       rc.rc_client_name     AS li_client_name,
--       rc.rc_signature_date  AS li_signature_date,
--       ql.id                 AS li_quote_line_id,
--       ql.product_id         AS li_product_id,
--       NULL::integer         AS li_component_index
--     FROM resolved_contracts rc
--     JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
--     WHERE rc.rc_resolved_quote_id IS NOT NULL
--       AND ql.product_id IS NOT NULL
--
--     UNION ALL
--
--     SELECT
--       rc.rc_contract_id                AS li_contract_id,
--       rc.rc_contract_number            AS li_contract_number,
--       rc.rc_client_name                AS li_client_name,
--       rc.rc_signature_date             AS li_signature_date,
--       ql.id                            AS li_quote_line_id,
--       p.id                             AS li_product_id,
--       comp.ord::integer                AS li_component_index
--     FROM resolved_contracts rc
--     JOIN public.quote_lines ql
--       ON ql.quote_id = rc.rc_resolved_quote_id
--      AND ql.bundle_id IS NOT NULL
--      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
--     CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
--       WITH ORDINALITY AS comp(value, ord)
--     JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
--     WHERE rc.rc_resolved_quote_id IS NOT NULL
--       AND comp.value ->> 'type' = 'product'
--       AND comp.value ->> 'source_id' IS NOT NULL
--
--     UNION ALL
--
--     -- NOVO (20261130190000): linhas de serviço puro (sem produto associado).
--     SELECT
--       rc.rc_contract_id     AS li_contract_id,
--       rc.rc_contract_number AS li_contract_number,
--       rc.rc_client_name     AS li_client_name,
--       rc.rc_signature_date  AS li_signature_date,
--       ql.id                 AS li_quote_line_id,
--       NULL::uuid            AS li_product_id,
--       NULL::integer         AS li_component_index
--     FROM resolved_contracts rc
--     JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
--     WHERE rc.rc_resolved_quote_id IS NOT NULL
--       AND ql.service_id IS NOT NULL
--       AND ql.product_id IS NULL
--   ),
--   lines AS (
--     SELECT
--       li.li_contract_id     AS l_contract_id,
--       li.li_contract_number AS l_contract_number,
--       li.li_client_name     AS l_client_name,
--       li.li_signature_date  AS l_signature_date,
--       li.li_quote_line_id   AS l_quote_line_id,
--       CASE
--         WHEN li.li_product_id IS NULL THEN 'servico'
--         -- Produto inexistente (sem linha na reserva): nada a servir.
--         WHEN r.r_contract_id IS NULL THEN 'no_supplier'
--         -- NOVO (20261204340000): r_is_served = linha concluída
--         -- (qty_served + qty_received >= qty_needed). Com parte pedida
--         -- (recebida) é 'received'; só stock é 'stock'. Mesma regra que
--         -- rpc_get_client_order_document.
--         WHEN r.r_is_served AND r.r_qty_received > 0 THEN 'received'
--         WHEN r.r_is_served THEN 'stock'
--         -- Tudo reservado: "stock disponível — confirmar saída" conta como
--         -- a aguardar (decisão de 20261120190000, mantida).
--         WHEN r.r_qty_reserved > 0 AND r.r_qty_ordered = 0 AND r.r_qty_missing = 0 THEN 'awaiting'
--         WHEN r.r_qty_reserved > 0 THEN 'partial'
--         -- NOVO (20261204340000): parte já servida e o resto em PO por receber
--         -- ou em falta.
--         WHEN r.r_qty_served > 0 THEN 'partial'
--         WHEN r.r_qty_missing > 0 AND r.r_qty_ordered > 0 THEN 'partial'
--         WHEN r.r_qty_missing > 0 THEN 'no_supplier'
--         WHEN r.r_qty_ordered > 0 AND r.r_qty_received >= r.r_qty_ordered THEN 'received'
--         ELSE 'awaiting'
--       END                                     AS l_line_status
--     FROM line_items li
--     LEFT JOIN res r
--       ON r.r_contract_id   = li.li_contract_id
--      AND r.r_quote_line_id = li.li_quote_line_id
--      AND r.r_product_id    = li.li_product_id
--      AND r.r_component_index IS NOT DISTINCT FROM li.li_component_index
--   ),
--   aggregated AS (
--     SELECT
--       l.l_contract_id                                             AS a_contract_id,
--       l.l_contract_number                                         AS a_contract_number,
--       l.l_client_name                                              AS a_client_name,
--       l.l_signature_date                                          AS a_signature_date,
--       count(*)::int                                                AS a_total_lines,
--       count(*) FILTER (WHERE l.l_line_status = 'stock')::int       AS a_lines_from_stock,
--       -- NOVO (20261204310000): 'partial' conta como a aguardar.
--       count(*) FILTER (WHERE l.l_line_status IN ('awaiting', 'partial'))::int AS a_lines_awaiting_order,
--       count(*) FILTER (WHERE l.l_line_status = 'received')::int    AS a_lines_received,
--       count(*) FILTER (WHERE l.l_line_status = 'no_supplier')::int AS a_lines_no_supplier,
--       count(*) FILTER (WHERE l.l_line_status = 'servico')::int     AS a_lines_service
--     FROM lines l
--     GROUP BY l.l_contract_id, l.l_contract_number, l.l_client_name, l.l_signature_date
--   ),
--   no_lines AS (
--     SELECT
--       rc.rc_contract_id     AS a_contract_id,
--       rc.rc_contract_number AS a_contract_number,
--       rc.rc_client_name     AS a_client_name,
--       rc.rc_signature_date  AS a_signature_date,
--       0 AS a_total_lines, 0 AS a_lines_from_stock, 0 AS a_lines_awaiting_order,
--       0 AS a_lines_received, 0 AS a_lines_no_supplier, 0 AS a_lines_service
--     FROM resolved_contracts rc
--     WHERE NOT EXISTS (
--       SELECT 1 FROM aggregated a WHERE a.a_contract_id = rc.rc_contract_id
--     )
--   ),
--   combined AS (
--     SELECT * FROM aggregated
--     UNION ALL
--     SELECT * FROM no_lines
--   ),
--   final AS (
--     SELECT
--       c.a_contract_id, c.a_contract_number, c.a_client_name, c.a_signature_date,
--       c.a_total_lines, c.a_lines_from_stock, c.a_lines_awaiting_order,
--       c.a_lines_received, c.a_lines_no_supplier, c.a_lines_service,
--       CASE
--         WHEN c.a_total_lines = 0 THEN 'totalmente_servido'
--         WHEN c.a_lines_awaiting_order = 0 AND c.a_lines_no_supplier = 0 THEN 'totalmente_servido'
--         WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
--              AND c.a_lines_no_supplier = 0
--              AND c.a_lines_awaiting_order > 0 THEN 'a_aguardar_encomenda'
--         WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
--              AND c.a_lines_awaiting_order = 0
--              AND c.a_lines_no_supplier > 0 THEN 'sem_fornecedor'
--         ELSE 'parcialmente_pendente'
--       END AS a_overall_status,
--       -- NOVO (20261204290000): número de encomenda e origem.
--       cco.order_number AS a_order_number,
--       CASE
--         WHEN ds.ds_found THEN 'direct_sale'
--         WHEN COALESCE(cco.is_manual_order, false) THEN 'manual'
--         ELSE 'contract'
--       END AS a_origin_type,
--       CASE
--         WHEN ds.ds_found THEN CASE WHEN v_can_see_ds THEN ds.ds_sale_number END
--         WHEN COALESCE(cco.is_manual_order, false) THEN NULL
--         ELSE c.a_contract_number
--       END AS a_origin_number,
--       -- NOVO (20261204400000): entidade do contrato, para a morada de entrega.
--       cco.entity_id AS a_entity_id,
--       -- NOVO (20261204730000): morada escolhida na própria encomenda.
--       cco.delivery_address AS a_cc_delivery_address
--     FROM combined c
--     JOIN public.client_contracts cco ON cco.id = c.a_contract_id
--     LEFT JOIN LATERAL (
--       SELECT true AS ds_found, d.sale_number AS ds_sale_number
--       FROM public.direct_sales d
--       WHERE d.client_contract_id = c.a_contract_id
--       ORDER BY d.created_at DESC
--       LIMIT 1
--     ) ds ON true
--   ),
--   -- NOVO (20261204400000): filtros, ordem e paginação iguais aos anteriores;
--   -- a morada de entrega só é calculada para as linhas desta página.
--   page AS (
--     SELECT f.*
--     FROM final f
--     WHERE
--       (
--         p_search IS NULL OR p_search = ''
--         OR strpos(lower(COALESCE(f.a_contract_number, '')), lower(p_search)) > 0
--         OR strpos(lower(COALESCE(f.a_client_name, '')), lower(p_search)) > 0
--         -- NOVO (20261204290000)
--         OR strpos(lower(COALESCE(f.a_order_number, '')), lower(p_search)) > 0
--       )
--       AND (
--         p_status_filter IS NULL OR p_status_filter = 'all'
--         OR f.a_overall_status = p_status_filter
--       )
--       AND (
--         p_date_from IS NULL OR f.a_signature_date::date >= p_date_from
--       )
--       AND (
--         p_date_to IS NULL OR f.a_signature_date::date <= p_date_to
--       )
--     ORDER BY f.a_signature_date DESC NULLS LAST, f.a_contract_number DESC
--     LIMIT v_limit OFFSET v_offset
--   )
--   SELECT
--     pg.a_contract_id          AS contract_id,
--     pg.a_contract_number      AS contract_number,
--     pg.a_client_name          AS client_name,
--     pg.a_signature_date       AS signature_date,
--     pg.a_total_lines          AS total_lines,
--     pg.a_lines_from_stock     AS lines_from_stock,
--     pg.a_lines_awaiting_order AS lines_awaiting_order,
--     pg.a_lines_received       AS lines_received,
--     pg.a_lines_no_supplier    AS lines_no_supplier,
--     pg.a_lines_service        AS lines_service,
--     pg.a_overall_status       AS overall_status,
--     pg.a_order_number         AS order_number,
--     pg.a_origin_type          AS origin_type,
--     pg.a_origin_number        AS origin_number,
--     -- NOVO (20261204400000): mesma regra de rpc_get_client_order_document.
--     -- 20261204730000: + morada da própria encomenda com prioridade.
--     COALESCE(nullif(btrim(pg.a_cc_delivery_address), ''), qa.qa_address, ca.ca_address) AS delivery_address
--   FROM page pg
--   LEFT JOIN resolved_contracts rc2 ON rc2.rc_contract_id = pg.a_contract_id
--   LEFT JOIN LATERAL (
--     SELECT nullif(btrim(q.obra_endereco), '') AS qa_address
--     FROM public.quotes q
--     WHERE q.id = rc2.rc_resolved_quote_id
--     LIMIT 1
--   ) qa ON true
--   LEFT JOIN LATERAL (
--     SELECT nullif(concat_ws(', ',
--              nullif(btrim(a.street), ''),
--              nullif(btrim(a.number), ''),
--              nullif(btrim(a.postal_code), ''),
--              nullif(btrim(a.city), '')
--            ), '') AS ca_address
--     FROM public.anew_entity_addresses ea
--     JOIN public.anew_addresses a ON a.id = ea.address_id
--     WHERE qa.qa_address IS NULL
--       AND pg.a_entity_id IS NOT NULL
--       AND ea.entity_id = pg.a_entity_id
--       AND (ea.valid_to IS NULL OR ea.valid_to > now())
--     ORDER BY ea.is_primary DESC NULLS LAST, ea.created_at DESC
--     LIMIT 1
--   ) ca ON true
--   ORDER BY pg.a_signature_date DESC NULLS LAST, pg.a_contract_number DESC;
-- END;
-- $function$;
