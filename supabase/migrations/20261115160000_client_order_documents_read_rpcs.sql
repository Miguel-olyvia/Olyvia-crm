-- ============================================================
-- Fase 5.0F do plano de inventário (plano-fornecedores-multi-stock-execucao.md,
-- secção "Fase 5.0F — Página 'Encomendas Clientes' + documento de
-- satisfação"), lado backend: 2 RPCs de LEITURA apenas. Sem tabela nova, sem
-- trigger nova, sem alteração de comportamento em nenhum fluxo existente —
-- "Encomendas Clientes" é derivada ao momento da leitura de client_contracts
-- + quote_lines (mesmo fallback via proposal_id já usado nas triggers da
-- 5.0B/5.0C) + stock_movements (via sale_source_type/sale_source_id/
-- reference_id, Fase 5.0A) + purchase_orders/purchase_order_items (via
-- source_type/source_id, Fase 5.0C).
--
-- rpc_list_client_order_documents(p_organization_id, p_search,
-- p_status_filter, p_limit, p_offset)
-- ------------------------------------------------------------------------
--   1 linha por Contrato assinado (client_contracts.status IN ('signed',
--   'assinado') — confirmado ao vivo: só 'signed' está em uso hoje (98
--   contratos), 'assinado' nunca ocorre; mantido como alias por consistência
--   literal com fn_contract_stock_deduction()/fn_contract_supplier_request(),
--   que já tratam os dois como equivalentes). deleted_at IS NULL.
--
--   Resolução da quote: client_contracts.quote_id quando presente, senão a
--   quote mais recente de quotes.proposal_id — EXATAMENTE o fallback
--   introduzido em 20261115080000 (fn_contract_stock_deduction/
--   fn_contract_supplier_request), replicado aqui sem alteração porque é o
--   mesmo problema (quote_id fica NULL em 84% dos contratos reais — ver
--   cabeçalho dessa migration). Linhas via quote_lines.quote_id = quote
--   resolvida, filtro só product_id IS NOT NULL — bundles incluídos de
--   propósito (bundle_id NÃO é filtrado; BundleSelectionTab já expande cada
--   bundle em quote_lines individuais reais no momento da criação do
--   orçamento, mesma decisão de negócio 4 documentada em 20261115040000).
--
--   Estado por linha (replica literalmente a definição do pedido, sem
--   inventar critério novo):
--     · 'stock'       — existe stock_movements(sale_source_type='contract',
--       sale_source_id=contrato, reference_id=quote_line.id,
--       movement_type='venda'). Existe mesmo que o saldo tenha ficado
--       negativo (fn_stock_movements_apply nunca rejeita 'venda') — a
--       intenção aqui é "foi processada a venda", não "havia stock
--       suficiente".
--     · 'received'    — existe purchase_orders(source_type='contract',
--       source_id=contrato) cujos purchase_order_items têm este product_id,
--       E (purchase_orders.status='received' OU
--       purchase_order_items.received_quantity >=
--       purchase_order_items.quantity). received_quantity é NOT NULL DEFAULT
--       0 (20261114040000), por isso a comparação nunca lida com NULL.
--     · 'awaiting'    — mesma PO/item, mas purchase_orders.status IN
--       ('pending','ordered','partially_received') E ainda não totalmente
--       recebido (linha ativa, não cancelada).
--     · 'no_supplier' — nenhum dos casos acima. Cobre tanto "produto sem
--       fornecedor preferencial quando o contrato foi assinado" (o caso
--       nomeado no pedido, já registado em workflow_execution_log pela Fase
--       5.0C) como qualquer outro motivo pelo qual a linha nunca gerou nem
--       stock_movement nem purchase_order_item (ex. quantidade fracionária
--       saltada, ou a PO gerada foi cancelada manualmente por um utilizador
--       depois do contrato assinado — caso raro: a reversão automática de
--       20261115070000 só cancela POs 'pending' quando o PRÓPRIO contrato é
--       cancelado/rejeitado, e aqui só listamos contratos 'signed').
--
--   Cada produto de uma linha, num contrato assinado, só deveria ter no
--   máximo 1 PO-item associado (fn_contract_supplier_request agrupa por
--   fornecedor preferencial resolvido UMA vez, no momento da assinatura) —
--   os LIMIT 1 nas sub-consultas são defesa, não a fonte da correção.
--
--   overall_status — DECISÃO TOMADA AQUI (o pedido nomeia os 4 valores
--   possíveis mas não a regra de prioridade entre eles; esta é a leitura
--   adotada, documentada para revisão):
--     · total_lines = 0 (contrato sem produto físico nas linhas, ex.
--       serviço puro, ou sem orçamento resolvível) → 'totalmente_servido'
--       (nada por satisfazer, vacuamente verdadeiro).
--     · lines_awaiting_order = 0 E lines_no_supplier = 0 (tudo é stock ou
--       received) → 'totalmente_servido'.
--     · Nenhuma linha servida/recebida ainda (lines_from_stock +
--       lines_received = 0) E lines_no_supplier = 0 E lines_awaiting_order >
--       0 → 'a_aguardar_encomenda' (tudo pendente, mas nada bloqueado).
--     · Nenhuma linha servida/recebida ainda E lines_awaiting_order = 0 E
--       lines_no_supplier > 0 → 'sem_fornecedor' (tudo bloqueado, ação
--       manual necessária em todas as linhas por satisfazer).
--     · Qualquer outra combinação (mistura de servido + pendente, ou de
--       pendente + bloqueado, etc.) → 'parcialmente_pendente'.
--
--   Sem total_count de propósito: mesmo padrão de paginação já usado em
--   Stocks.tsx (infinite scroll com .range(), sem contagem total separada) —
--   ver "Ficheiros críticos" na secção Fase 5.0F do ficheiro de execução.
--
--   IMPORTANTE (bug já corrigido uma vez neste projeto,
--   20261111360000_fix_republish_proposal_snapshot_ambiguous_column.sql):
--   RETURNS TABLE(...) cria variáveis PL/pgSQL implícitas com o mesmo nome
--   das colunas de saída (contract_id, contract_number, ...). Qualquer
--   referência NÃO qualificada a um nome igual dentro do corpo da função
--   rebenta com "column reference is ambiguous". Por isso, todas as colunas
--   nas CTEs abaixo são sempre referenciadas com o alias da tabela/CTE de
--   origem (rc., ql., l., a., nl., c., f.) — nunca em nome nu.
--
-- rpc_get_client_order_document(p_contract_id)
-- ------------------------------------------------------------------------
--   Detalhe completo de 1 contrato: cabeçalho + array de linhas (jsonb, não
--   RETURNS TABLE — evita de propósito o mesmo risco de ambiguidade acima, e
--   é o padrão já usado por rpc_register_sale_stock_movement/
--   rpc_receive_purchase_order para respostas estruturadas). Cada linha inclui
--   o estado resolvido (mesmos 4 valores, nomeados por extenso:
--   servido_por_stock / recebido / a_aguardar_encomenda / sem_fornecedor) e,
--   quando aplicável, purchase_order_id + purchase_order_number (order_number)
--   da PO associada. NÃO inclui uma data de receção — nem purchase_orders nem
--   purchase_order_items guardam esse timestamp por linha (só
--   purchase_orders.updated_at, que muda em qualquer edição, não só na
--   receção — teria sido uma aproximação enganosa, por isso omitido de
--   propósito; ver Fase 5.0D/UI para se algum dia isto precisar de campo
--   próprio).
--
-- Segurança (decidida no plano, secção "Arquitetura fechada"): ambos
-- SECURITY DEFINER, verificam has_anew_permission(auth.uid(), 'inventory.view')
-- E has_anew_permission(auth.uid(), 'client_contracts.view') em simultâneo —
-- mesmo padrão de dupla verificação já usado por rpc_receive_purchase_order
-- (purchase_orders.edit + inventory.edit) — e organization_id IN
-- get_user_visible_org_ids(auth.uid()). GRANT EXECUTE só a authenticated.
--
-- Fonte do nome do cliente: client_contracts.entity_id → anew_entities.
-- display_name — mesmo JOIN já usado por client_contracts_list_metrics
-- (20261115010000) para o mesmo propósito (anew_clients não tem coluna de
-- nome própria, só entity_id).
--
-- Prerequisitos: 20261115040000 (stock_movements.sale_source_type/
-- sale_source_id, movement_type='venda'), 20261115070000
-- (purchase_orders.source_type/source_id), 20261115080000 (fallback de
-- quote_id via proposal_id, replicado aqui), 20261114040000
-- (purchase_order_items.received_quantity).
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
            AND sm.reference_id = ql.id
            AND sm.movement_type = 'venda'
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
  -- Contratos resolvidos (assinados, com quote resolvível) mas sem nenhuma
  -- quote_line com product_id — ficam de fora de `aggregated` (0 linhas em
  -- GROUP BY não produz linha nenhuma), por isso são reintroduzidos aqui
  -- explicitamente com contagens todas a zero.
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
  'de 20261115080000). Estado por linha via stock_movements (venda) e '
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

  -- NOTA: ao contrário de rpc_list_client_order_documents, este RPC NÃO
  -- filtra por status = 'signed'/'assinado' — o detalhe é acessível para
  -- qualquer contrato existente que o utilizador já possa ver (ex. consulta
  -- histórica de um contrato entretanto cancelado, ou navegação a partir do
  -- link "Gerada automaticamente a partir do Contrato X" no dialog de
  -- PurchaseOrders.tsx, que pode apontar para um contrato em qualquer
  -- estado). A permissão dupla acima (inventory.view + client_contracts.view
  -- + organização em scope) já é o controlo de acesso — não há necessidade
  -- de um filtro de status adicional.
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

      SELECT sm.id INTO v_stock_movement_id
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_contract_id
        AND sm.reference_id = v_line.quote_line_id
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
  'aplicável). Mesma resolução de quote (fallback via proposal_id) e mesma '
  'dupla verificação de permissão (inventory.view E client_contracts.view) de '
  'rpc_list_client_order_documents. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.rpc_get_client_order_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_order_document(uuid) TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration; ver relatório do agente para os
-- resultados reais)
-- ============================================================
--
-- 1. Contrato assinado com 1 linha manages_stock=true já processada (stock_
--    movements venda existente): rpc_list_client_order_documents devolve
--    lines_from_stock=1, os restantes a 0, overall_status='totalmente_servido';
--    rpc_get_client_order_document mostra essa linha com line_status=
--    'servido_por_stock' e stock_movement_id preenchido.
-- 2. Contrato assinado com 1 linha manages_stock=false com PO gerada ainda
--    'pending' (nenhuma receção): lines_awaiting_order=1, overall_status=
--    'a_aguardar_encomenda'; detalhe mostra line_status='a_aguardar_encomenda'
--    com purchase_order_id/purchase_order_number preenchidos.
-- 3. Mesmo cenário após a PO ficar 'received' (ou received_quantity >=
--    quantity): lines_received=1, overall_status='totalmente_servido';
--    detalhe mostra 'recebido'.
-- 4. Contrato assinado com 1 linha manages_stock=false cujo produto não tinha
--    fornecedor preferencial no momento da assinatura (nenhuma PO gerada):
--    lines_no_supplier=1, overall_status='sem_fornecedor'; detalhe mostra
--    'sem_fornecedor' sem purchase_order_id.
-- 5. Contrato com mistura (1 linha servida + 1 a aguardar): overall_status=
--    'parcialmente_pendente'.
-- 6. Utilizador com inventory.view mas SEM client_contracts.view (ou
--    vice-versa): ambos os RPCs rejeitam com insufficient_privilege.
-- 7. p_organization_id fora do scope do utilizador (get_user_visible_org_ids):
--    rejeitado com insufficient_privilege antes de tocar em client_contracts.
-- 8. Contrato com quote_id NULL mas proposal_id com quote associada: resolvido
--    corretamente via fallback (mesmo teste que confirmou o bug de
--    20261115080000 em produção, CC-2026-0099).
-- 9. p_search por parte do contract_number e por parte do nome do cliente
--    (case-insensitive) devolvem o contrato esperado; p_status_filter=
--    'sem_fornecedor' devolve só os contratos nesse estado.
-- 10. Paginação: p_limit=1 devolve só 1 linha mesmo com mais contratos
--     elegíveis; p_offset=1 avança para o 2º.
