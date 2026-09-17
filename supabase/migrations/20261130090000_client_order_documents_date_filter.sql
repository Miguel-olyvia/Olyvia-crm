-- Filtro por intervalo de datas (coluna "Data" = signature_date) na
-- listagem de Encomendas Clientes.
-- 2026-11-30 | Módulos: Client Orders
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.
--
-- Problema resolvido
-- -------------------
-- rpc_list_client_order_documents (última versão viva: 20261120190000) só
-- filtra por p_search (número do contrato / nome do cliente) e
-- p_status_filter (estado geral). Não existe forma de restringir a listagem
-- por período de assinatura do contrato (coluna "Data" da tabela em
-- ClientOrders.tsx, que mostra client_contracts.signature_date).
--
-- O que esta migration faz
-- --------------------------
-- rpc_list_client_order_documents(): acrescenta 2 parâmetros NOVOS no FIM da
-- lista de argumentos (depois de p_offset), ambos opcionais com
-- DEFAULT NULL:
--   p_date_from date DEFAULT NULL
--   p_date_to   date DEFAULT NULL
-- Filtram por f.a_signature_date::date (cast de timestamptz para date, para
-- comparar com os parâmetros date), combinados com AND na mesma cláusula
-- WHERE final onde já vivem p_search e p_status_filter:
--   (p_date_from IS NULL OR f.a_signature_date::date >= p_date_from)
--   AND (p_date_to IS NULL OR f.a_signature_date::date <= p_date_to)
--
-- Como os 2 parâmetros são realmente novos no fim da lista (não existe
-- nenhuma outra versão da função com aridade diferente — confirmado via
-- pg_get_function_identity_arguments antes desta migration: só existe
-- 1 overload, com 5 argumentos), NÃO é necessário DROP FUNCTION da
-- assinatura antiga. CREATE OR REPLACE com parâmetros novos, todos com
-- DEFAULT, no fim da lista é compatível com:
--   - chamadas antigas por posição (5 argumentos) — continuam a funcionar,
--     os 2 novos assumem o DEFAULT NULL;
--   - chamadas antigas por nome (como as 3 usadas no código: ClientOrders.tsx,
--     PurchaseOrders.tsx, StockMovementDialog.tsx — todas invocam via
--     supabase.rpc('rpc_list_client_order_documents', { p_organization_id,
--     p_search, p_status_filter, p_limit, p_offset }), sem p_date_from/
--     p_date_to) — continuam a funcionar sem alteração nenhuma no frontend.
--
-- Resto da função 100% igual à versão viva atual (20261120190000): a CTE de
-- resolução de contratos/linhas (resolved_contracts, line_items, lines,
-- aggregated, no_lines, combined, final), o cálculo de overall_status, a
-- paginação (clamps de p_limit/p_offset em v_limit/v_offset), a ordenação
-- (ORDER BY a_signature_date DESC NULLS LAST, a_contract_number DESC) e as
-- permissões exigidas (inventory.view E client_contracts.view, além de
-- pertença à organização) ficam inalteradas.

CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(
  p_organization_id uuid,
  p_search          text DEFAULT NULL::text,
  p_status_filter   text DEFAULT NULL::text,
  p_limit           integer DEFAULT 30,
  p_offset          integer DEFAULT 0,
  p_date_from       date DEFAULT NULL,
  p_date_to         date DEFAULT NULL
)
 RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, overall_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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


-- ============================================================
-- Notas de verificação (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Confirmado antes desta migration, via pg_get_function_identity_arguments
--    sobre pg_proc/pg_namespace, que só existe 1 overload de
--    rpc_list_client_order_documents na BD viva, com a assinatura
--    (p_organization_id uuid, p_search text, p_status_filter text,
--    p_limit integer, p_offset integer) — idêntica à migration
--    20261120190000. CREATE OR REPLACE com p_date_from/p_date_to novos no
--    fim (ambos com DEFAULT) substitui essa mesma função sem criar overload
--    nenhum — não foi necessário DROP FUNCTION.
--
-- 2. Chamadores confirmados no código (todos via supabase.rpc(...) com
--    argumentos nomeados, sem p_date_from/p_date_to):
--      - src/pages/ClientOrders.tsx (listagem principal)
--      - src/pages/PurchaseOrders.tsx (opções de encomenda cliente ao criar PO)
--      - src/components/inventory/StockMovementDialog.tsx (opções ao
--        registar saída manual)
--    Nenhum precisa de alteração — continuam a receber os mesmos resultados
--    de antes (p_date_from/p_date_to assumem NULL, sem filtro de data
--    aplicado, comportamento idêntico ao pré-migration).
--
-- 3. Passar p_date_from='2026-01-01' e/ou p_date_to='2026-12-31' filtra a
--    listagem por client_contracts.signature_date::date dentro desse
--    intervalo (inclusive nos dois extremos), sem alterar p_search,
--    p_status_filter, a paginação (p_limit/p_offset) nem o cálculo de
--    overall_status — que continua a refletir TODAS as linhas do contrato,
--    independentemente do filtro de data aplicado à listagem.
--
-- 4. Resto da função (CTEs, permissões exigidas, ordenação) 100% idêntico à
--    versão viva anterior (20261120190000) — apenas a assinatura e a
--    cláusula WHERE final foram tocadas.
