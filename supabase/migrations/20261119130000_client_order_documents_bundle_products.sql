-- ============================================================
-- Correção da Fase 5.0F: "Encomendas Clientes" ignorava produtos vendidos
-- dentro de Bundles.
--
-- Achado (confirmado ao vivo, 2026-09-09): rpc_list_client_order_documents /
-- rpc_get_client_order_document (20261115160000) contam linhas via
-- `quote_lines.product_id IS NOT NULL`. Uma linha de Bundle NUNCA tem
-- product_id preenchido — confirmado por consulta direta: as 10.846 linhas
-- de quote_lines com bundle_id preenchido têm product_id NULL em 100% dos
-- casos, sem exceção. O produto real de cada componente do bundle só existe
-- em quote_lines.selected_attributes->'bundle_components' (array de objetos
-- {sku, name, type: 'product'|'service', source_id, quantity,
-- choice_group_id} — a "foto" já resolvida das escolhas feitas em cada
-- choice_group no momento em que o bundle foi adicionado ao orçamento, ver
-- BundleSelectionTab.tsx/AddItemsDialog.tsx/QuoteBuilder.tsx).
--
-- O comentário original em 20261115160000 (linhas 27-30) e em
-- fn_contract_stock_deduction (20261115080000, linhas ~148-156) assumia que
-- "BundleSelectionTab já expande cada bundle em quote_lines individuais reais
-- no momento da criação do orçamento" — confirmado FALSO por leitura direta
-- do código atual (BundleSelectionTab.tsx expande só em memória, para preview
-- de preço; AddItemsDialog.tsx reagrupa sempre num único item por bundle;
-- QuoteBuilder.tsx grava sempre 1 única quote_line com bundle_id preenchido e
-- product_id/service_id NULL; rpc_save_quote não expande nada do lado do
-- servidor). Isto é o comportamento ATUAL, não dado antigo por migrar —
-- qualquer bundle adicionado hoje a uma proposta nova continua a criar só 1
-- quote_line com product_id NULL.
--
-- Impacto medido em produção antes desta correção:
--   · 62 dos 78 contratos assinados têm pelo menos 1 quote_line de bundle na
--     sua quote resolvida — apareciam sempre como "Linhas: 0" / "Totalmente
--     servido" na listagem, escondendo os produtos físicos reais lá dentro.
--   · fn_contract_stock_deduction()/fn_contract_supplier_request() (ambas em
--     20261115080000) sofrem do mesmo problema (mesmo filtro
--     `product_id IS NOT NULL`) — NÃO alteradas nesta migration (fora do
--     âmbito: esta migration só corrige os 2 RPCs de LEITURA da Fase 5.0F,
--     que foi o que motivou o pedido). Confirmado que o impacto real disso
--     é zero até hoje: dos 4 produtos com manages_stock=true alguma vez
--     usados dentro de um Bundle, nenhum aparece nos bundles dos 78
--     contratos assinados — nada ficou por deduzir na prática, mas o gap na
--     função de dedução fica documentado aqui para tratamento à parte.
--
-- Correção: um novo braço UNION ALL, dentro da CTE que antes se chamava
-- `lines` (agora `line_items` + `lines`), expande cada quote_line de bundle
-- (bundle_id IS NOT NULL) via jsonb_array_elements(selected_attributes->
-- 'bundle_components'), filtrado a type='product', extraindo o product_id
-- real de comp->>'source_id'. O guard `jsonb_typeof(...) = 'array'` vai na
-- condição do JOIN (não no WHERE) de propósito — filtra as quote_lines
-- candidatas ANTES de as passar a jsonb_array_elements, que rebenta com erro
-- se receber um valor que não seja array.
--
-- Os 3 EXISTS de resolução de estado (stock/received/awaiting) passam a
-- verificar também `product_id` (antes só `reference_id = ql.id` para o caso
-- 'stock', assumindo implicitamente 1 quote_line = 1 produto) — necessário
-- porque uma única linha de bundle agora pode originar N produtos diferentes
-- com o mesmo reference_id/quote_line_id. Não muda o resultado para linhas
-- diretas (continuam a ter exatamente 1 produto por linha).
--
-- rpc_get_client_order_document ganha o mesmo tratamento no detalhe: cada
-- componente de bundle aparece como uma linha própria (product_name/sku
-- resolvidos via products, quantity = quantidade do componente × quantidade
-- do bundle na linha).
--
-- Nenhuma tabela nova, nenhum trigger novo, nenhuma alteração de permissões —
-- só o corpo das 2 funções (CREATE OR REPLACE), mesma assinatura.
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
  -- Produtos "achatados" da quote resolvida: linhas diretas (product_id
  -- preenchido) + produtos reais dentro de linhas de Bundle (product_id
  -- sempre NULL nessas — só existe em selected_attributes->
  -- 'bundle_components'). Ver nota de cabeçalho desta migration.
  line_items AS (
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      ql.product_id         AS li_product_id
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
      (comp.value ->> 'source_id')::uuid AS li_product_id
    FROM resolved_contracts rc
    JOIN public.quote_lines ql
      ON ql.quote_id = rc.rc_resolved_quote_id
     AND ql.bundle_id IS NOT NULL
     -- Guard na condição do JOIN (não no WHERE) de propósito: filtra ql ANTES
     -- de a passar a jsonb_array_elements, que rebenta com erro se o valor
     -- não for um array (ex. selected_attributes sem a chave, ou um bundle
     -- gravado antes desta convenção existir).
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
        WHEN EXISTS (
          SELECT 1
          FROM public.stock_movements sm
          WHERE sm.sale_source_type = 'contract'
            AND sm.sale_source_id = li.li_contract_id
            AND sm.reference_id = li.li_quote_line_id
            AND sm.product_id = li.li_product_id
            AND sm.movement_type = 'venda'
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
  -- Contratos resolvidos (assinados, com quote resolvível) mas sem nenhuma
  -- linha de produto (nem direta nem dentro de bundle) — ficam de fora de
  -- `aggregated` (0 linhas em GROUP BY não produz linha nenhuma), por isso
  -- são reintroduzidos aqui explicitamente com contagens todas a zero.
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
  'Fase 5.0F: listagem "Encomendas Clientes" — 1 linha por Contrato assinado '
  '(status signed/assinado), derivada ao momento da leitura (sem tabela nova). '
  'Resolve o orçamento via quote_id com fallback por proposal_id (mesma lógica '
  'de 20261115080000). Conta tanto linhas diretas (quote_lines.product_id) '
  'como produtos dentro de Bundles (selected_attributes->bundle_components, '
  'ver 20261119130000). Estado por linha via stock_movements (venda) e '
  'purchase_orders/purchase_order_items (source_type=contract). SECURITY '
  'DEFINER — exige inventory.view E client_contracts.view em simultâneo, mais '
  'a organização em scope do utilizador.';

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

  -- NOTA (inalterada de 20261115160000): este RPC não filtra por
  -- status = 'signed'/'assinado' — ver comentário original.
  IF v_resolved_quote_id IS NOT NULL THEN
    FOR v_line IN
      -- Linhas diretas (product_id preenchido) + produtos reais dentro de
      -- linhas de Bundle (ver cabeçalho de 20261119130000). quantity de um
      -- componente de bundle é a quantidade do componente dentro do bundle
      -- × a quantidade do próprio bundle na linha (ql.qt).
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

      SELECT sm.id INTO v_stock_movement_id
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_contract_id
        AND sm.reference_id = v_line.quote_line_id
        AND sm.product_id = v_line.product_id
        AND sm.movement_type = 'venda'
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

COMMENT ON FUNCTION public.rpc_get_client_order_document(uuid) IS
  'Fase 5.0F: detalhe completo de 1 documento "Encomenda Cliente" (cabeçalho + '
  'linhas com estado resolvido: servido_por_stock/recebido/a_aguardar_encomenda/'
  'sem_fornecedor, com purchase_order_id/purchase_order_number quando '
  'aplicável). Linhas incluem produtos diretos e produtos dentro de Bundles '
  '(selected_attributes->bundle_components, ver 20261119130000). Mesma '
  'resolução de quote (fallback via proposal_id) e mesma dupla verificação de '
  'permissão (inventory.view E client_contracts.view) de '
  'rpc_list_client_order_documents. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.rpc_get_client_order_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_order_document(uuid) TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration)
-- ============================================================
--
-- 1. CC-2026-0098 / CC-2026-0218 (confirmados ao vivo antes desta correção
--    com total_lines=0, overall_status='totalmente_servido' apesar de terem
--    produtos reais dentro dos seus bundles): depois da correção devem
--    passar a total_lines > 0 e overall_status='sem_fornecedor' (nenhum dos
--    produtos de bundle tem stock_movement nem purchase_order_item, porque
--    fn_contract_stock_deduction/fn_contract_supplier_request não os
--    processam — ver nota de cabeçalho, gap documentado à parte).
-- 2. Contrato só com linhas diretas (sem bundles): resultado idêntico ao de
--    antes desta migration (o novo braço UNION ALL não produz nenhuma linha
--    extra quando não há bundle_id).
-- 3. Bundle cujo selected_attributes não tem a chave 'bundle_components' (ou
--    não é array): o guard jsonb_typeof(...) = 'array' no JOIN impede o erro
--    de jsonb_array_elements — a linha de bundle é simplesmente ignorada
--    (mesmo comportamento anterior a esta migration para esse caso).
-- 4. rpc_get_client_order_document mostra quantity = quantidade do
--    componente × quantidade do bundle na linha (ex. bundle com qt=2 na
--    quote, componente com quantity=3 → 6).
