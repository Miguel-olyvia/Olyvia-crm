-- =============================================================================
-- 20261213100000_rpc_inventory_today.sql
--
-- NOVA função de leitura: contadores do ecrã "Hoje" do Inventário, numa só
-- chamada. Só leitura, sem tabelas nem colunas novas.
--
-- Âmbito: só a organização ativa (organization_id = p_organization_id, sem
-- descendentes) e só linhas não apagadas (deleted_at IS NULL onde existe).
--
-- Cada bloco tem a sua permissão (has_anew_permission). Sem a permissão o
-- bloco vem a null (não dá erro):
--   purchases      purchase_orders.view (open_delivery_notes e
--                  delivery_notes_with_divergences: purchase_orders.view OU
--                  purchase_orders.receive, como a RLS de
--                  supplier_delivery_notes; os outros campos ficam null só
--                  com .receive)
--   suppliers     suppliers.view   (price_changes_pending exige também
--                  suppliers.view_pricing OU products.view_cost, como a RLS
--                  de supplier_price_change_requests; senão null;
--                  catalog_unlinked = regra 'unlinked' de
--                  rpc_supplier_catalog_list)
--   client_orders  client_orders.view
--   stock          inventory.view   (value exige também products.view_cost;
--                  senão null)
--   counts         inventory.view
--   settings       inventory.view
--
-- Regras (iguais às das RPCs/ecrãs de origem):
--   • PO aberta = status 'ordered' ou 'partially_received' ('pending' = por
--     aprovar; passa a 'ordered' em "Encomendar", purchase_orders.approve).
--   • Encomendas de Cliente: fn_client_order_line_reservations chamada UMA
--     vez (mesma base de rpc_list_client_order_documents e de
--     rpc_get_product_stock_reservations). EC em aberto = alguma linha de
--     produto ainda não concluída, com a mesma tabela de estados da lista
--     (awaiting / partial / no_supplier); origem igual à lista (venda direta
--     > manual > contrato).
--   • EC sem fornecedor preferido = EC em aberto com alguma linha com
--     qty_missing > 0 e qty_ordered = 0 cujo produto não tem fornecedor
--     preferido (critério v_has_pref de rpc_get_client_order_document,
--     definição de 20261206150000: item_suppliers preferida, ativa, não
--     apagada, da organização).
--   • Stock alinhado com a lista de Existências (Stocks.tsx): por linha
--     produto×armazém, stocks não apagados com produto existente
--     (products!inner), sem filtro de armazém (a lista não filtra o armazém);
--     estado como getStockStatusCode: low tem prioridade sobre overstock
--     (quantity >= maximum_quantity).
--   • Guia com divergências = guia em aberto, com linhas anunciadas, em que
--     algum produto tem anunciado ≠ recebido (mesma regra de
--     fn_delivery_note_summary, em SQL de conjunto, sem chamar a função por
--     guia).
--
-- Segurança: utilizador autenticado, org visível (get_user_visible_org_ids),
-- como em rpc_get_product_stock_reservations.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_inventory_today(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_can_po       boolean;
  v_can_rec      boolean;
  v_can_sup      boolean;
  v_can_pricing  boolean;
  v_can_ec       boolean;
  v_can_inv      boolean;
  v_can_cost     boolean;
  v_purchases    jsonb;
  v_suppliers    jsonb;
  v_client_ord   jsonb;
  v_stock        jsonb;
  v_counts       jsonb;
  v_settings     jsonb;
  v_reserved     numeric;
  v_open_dn      integer;
  v_div_dn       integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para ver o inventário desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_po  := COALESCE(public.has_anew_permission(v_uid, 'purchase_orders.view'), false);
  -- Guias do fornecedor: mesma regra da RLS de supplier_delivery_notes.
  v_can_rec := v_can_po OR COALESCE(public.has_anew_permission(v_uid, 'purchase_orders.receive'), false);
  v_can_sup := COALESCE(public.has_anew_permission(v_uid, 'suppliers.view'), false);
  v_can_ec  := COALESCE(public.has_anew_permission(v_uid, 'client_orders.view'), false);
  v_can_inv := COALESCE(public.has_anew_permission(v_uid, 'inventory.view'), false);

  -- Sem nenhuma permissão: tudo a null.
  IF NOT (v_can_po OR v_can_rec OR v_can_sup OR v_can_ec OR v_can_inv) THEN
    RETURN jsonb_build_object(
      'purchases', NULL, 'suppliers', NULL, 'client_orders', NULL,
      'stock', NULL, 'counts', NULL, 'settings', NULL
    );
  END IF;

  v_can_cost    := COALESCE(public.has_anew_permission(v_uid, 'products.view_cost'), false);
  v_can_pricing := v_can_cost OR COALESCE(public.has_anew_permission(v_uid, 'suppliers.view_pricing'), false);

  -- ── 1. Compras (purchase_orders.view; guias: .view OU .receive) ────────────
  IF v_can_po THEN
    SELECT jsonb_build_object(
             'pending_approval', count(*) FILTER (WHERE po.status = 'pending'),
             'late',             count(*) FILTER (WHERE po.status IN ('ordered', 'partially_received')
                                                    AND po.expected_delivery < current_date),
             'portal_unseen',    count(*) FILTER (WHERE po.status IN ('ordered', 'partially_received')
                                                    AND pub.status = 'sent'),
             'portal_confirmed', count(*) FILTER (WHERE po.status IN ('ordered', 'partially_received')
                                                    AND pub.status = 'confirmed')
           )
      INTO v_purchases
      FROM public.purchase_orders po
      LEFT JOIN public.supplier_po_publications pub ON pub.purchase_order_id = po.id
     WHERE po.organization_id = p_organization_id
       AND po.deleted_at IS NULL;
  ELSIF v_can_rec THEN
    -- Só purchase_orders.receive: campos de POs a null, guias abaixo.
    v_purchases := jsonb_build_object(
      'pending_approval', NULL, 'late', NULL,
      'portal_unseen',    NULL, 'portal_confirmed', NULL
    );
  END IF;

  IF v_can_rec THEN
    -- Guias do fornecedor em aberto e, dessas, as com divergências ao vivo.
    WITH dn AS (
      SELECT n.id
        FROM public.supplier_delivery_notes n
       WHERE n.organization_id = p_organization_id
         AND n.status = 'open'
    ), ann AS (
      SELECT l.delivery_note_id AS note_id, l.product_id,
             sum(l.quantity * l.units_per_uom) AS units
        FROM public.supplier_delivery_note_lines l
        JOIN dn ON dn.id = l.delivery_note_id
       GROUP BY 1, 2
    ), rcv AS (
      SELECT pr.delivery_note_id AS note_id,
             COALESCE(pr.product_id, poi.product_id) AS product_id,
             sum(pr.quantity * pr.units_per_uom) AS units
        FROM public.purchase_order_receipts pr
        JOIN dn ON dn.id = pr.delivery_note_id
        LEFT JOIN public.purchase_order_items poi ON poi.id = pr.purchase_order_item_id
       WHERE pr.kind = 'receipt'
         AND pr.reverted_at IS NULL
       GROUP BY 1, 2
    )
    SELECT (SELECT count(*) FROM dn)::int,
           (SELECT count(DISTINCT COALESCE(a.note_id, r.note_id))
              FROM ann a
              FULL JOIN rcv r ON r.note_id = a.note_id AND r.product_id = a.product_id
             WHERE COALESCE(a.note_id, r.note_id) IN (SELECT note_id FROM ann)  -- só guias com linhas
               AND COALESCE(a.units, 0) <> COALESCE(r.units, 0))::int
      INTO v_open_dn, v_div_dn;

    v_purchases := v_purchases || jsonb_build_object(
      'open_delivery_notes',             v_open_dn,
      'delivery_notes_with_divergences', v_div_dn
    );
  END IF;

  -- ── 2. Fornecedores (suppliers.view) ───────────────────────────────────────
  IF v_can_sup THEN
    v_suppliers := jsonb_build_object(
      -- Pedidos de preço por decidir (fornecedor não apagado). Só com
      -- permissão de preços, como a RLS da tabela.
      'price_changes_pending',
        CASE WHEN v_can_pricing THEN (
          SELECT count(*)::int
            FROM public.supplier_price_change_requests pcr
            JOIN public.suppliers s ON s.id = pcr.supplier_id AND s.deleted_at IS NULL
           WHERE pcr.organization_id = p_organization_id
             AND pcr.status = 'pending'
        ) END,
      -- Fornecedores com ligação ativa ao portal cujo owner ainda não
      -- confirmou os dados (supplier_portal_users.profile_confirmed_at).
      'awaiting_profile', (
        SELECT count(DISTINCT l.supplier_id)::int
          FROM public.supplier_account_links l
          JOIN public.supplier_accounts a ON a.id = l.supplier_account_id AND a.status = 'active'
          JOIN public.suppliers s ON s.id = l.supplier_id AND s.deleted_at IS NULL
         WHERE l.organization_id = p_organization_id
           AND l.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM public.supplier_portal_users u
              WHERE u.supplier_account_id = l.supplier_account_id
                AND u.role = 'owner'
                AND u.status = 'active'
                AND u.profile_confirmed_at IS NOT NULL
           )
      ),
      -- Fila "por ligar" do catálogo do fornecedor: mesma regra de
      -- rpc_supplier_catalog_list(p_filter => 'unlinked') (definição de
      -- 20261211150000), somada por todos os fornecedores da organização.
      -- Como lá (fn_sp_crm_supplier_org), exige perfil do CRM; senão null.
      'catalog_unlinked',
        CASE WHEN public.current_business_user_id() IS NOT NULL THEN (
          SELECT count(*)::int
            FROM public.suppliers s
            JOIN public.supplier_account_links l
              ON l.supplier_id = s.id AND l.status = 'active'
            JOIN public.supplier_catalog_items ci
              ON ci.supplier_account_id = l.supplier_account_id AND ci.is_active
           WHERE s.organization_id = p_organization_id
             AND s.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.item_suppliers isup
                              WHERE isup.supplier_id = s.id
                                AND isup.catalog_item_id = ci.id
                                AND isup.deleted_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d
                              WHERE d.link_id = l.id
                                AND d.catalog_item_id = ci.id)
        ) END
    );
  END IF;

  -- ── 3. Encomendas de Cliente + unidades reservadas (uma só passagem) ───────
  IF v_can_ec OR v_can_inv THEN
    -- r é MATERIALIZED: a função corre uma só vez e o mesmo resultado serve
    -- reserved_units (bloco stock, via v_reserved) e o bloco client_orders.
    WITH r AS MATERIALIZED (
      SELECT * FROM public.fn_client_order_line_reservations(p_organization_id, NULL)
    ), per_contract AS (
      -- Linha concluída = 'stock'/'received' na lista; o resto (awaiting,
      -- partial, no_supplier) deixa a EC em aberto.
      SELECT r.contract_id,
             bool_or(COALESCE(r.qty_reserved, 0) > 0) AS has_ready,
             -- Em falta, nada pedido e produto sem fornecedor preferido:
             -- critério v_has_pref de rpc_get_client_order_document
             -- (20261206150000).
             bool_or(COALESCE(r.qty_missing, 0) > 0
                     AND COALESCE(r.qty_ordered, 0) = 0
                     AND NOT EXISTS (
                       SELECT 1
                         FROM public.item_suppliers isup
                        WHERE isup.product_id = r.product_id
                          AND isup.is_preferred = true
                          AND isup.deleted_at IS NULL
                          AND isup.is_active = true
                          AND isup.organization_id = p_organization_id
                     )) AS has_missing
        FROM r
       WHERE NOT (
               r.is_served
               OR (COALESCE(r.qty_reserved, 0) = 0
                   AND COALESCE(r.qty_served, 0) = 0
                   AND COALESCE(r.qty_missing, 0) = 0
                   AND COALESCE(r.qty_ordered, 0) > 0
                   AND COALESCE(r.qty_received, 0) >= r.qty_ordered)
             )
       GROUP BY r.contract_id
    ), open_ec AS (
      SELECT pc.has_ready, pc.has_missing,
             CASE
               WHEN EXISTS (SELECT 1 FROM public.direct_sales d WHERE d.client_contract_id = cc.id) THEN 'direct_sale'
               WHEN COALESCE(cc.is_manual_order, false) THEN 'manual'
               ELSE 'contract'
             END AS origin
        FROM per_contract pc
        JOIN public.client_contracts cc ON cc.id = pc.contract_id
    )
    SELECT
      (SELECT COALESCE(sum(COALESCE(r.qty_reserved, 0)), 0) FROM r WHERE r.product_id IS NOT NULL),
      (SELECT jsonb_build_object(
                'open',                       count(*),
                'ready_to_ship',              count(*) FILTER (WHERE e.has_ready),
                'without_preferred_supplier', count(*) FILTER (WHERE e.has_missing),
                'by_origin', jsonb_build_object(
                  'contract',    count(*) FILTER (WHERE e.origin = 'contract'),
                  'direct_sale', count(*) FILTER (WHERE e.origin = 'direct_sale'),
                  'manual',      count(*) FILTER (WHERE e.origin = 'manual')
                )
              )
         FROM open_ec e)
      INTO v_reserved, v_client_ord;

    IF NOT v_can_ec THEN
      v_client_ord := NULL;
    END IF;
  END IF;

  -- ── 4. Stock, contagens e definições (inventory.view) ──────────────────────
  IF v_can_inv THEN
    -- Mesmas linhas que a lista de Existências por omissão (Stocks.tsx):
    -- stocks não apagados da organização com produto existente
    -- (products!inner); o armazém é LEFT na lista, sem filtro de
    -- is_active/deleted_at, por isso aqui também não se filtra.
    -- reorder_point / maximum_quantity são NOT NULL DEFAULT 0: 0 = não
    -- definido. Estado como getStockStatusCode: low primeiro, depois
    -- overstock (quantity >= maximum_quantity).
    SELECT jsonb_build_object(
             'below_reorder_point', count(*) FILTER (WHERE s.reorder_point > 0 AND s.quantity <= s.reorder_point),
             'overstock',           count(*) FILTER (WHERE s.maximum_quantity > 0 AND s.quantity >= s.maximum_quantity
                                                       AND NOT (s.reorder_point > 0 AND s.quantity <= s.reorder_point)),
             'reserved_units',      COALESCE(v_reserved, 0),
             'value',               CASE WHEN v_can_cost THEN
                                      round(COALESCE(sum(s.quantity * s.average_cost)
                                                       FILTER (WHERE s.quantity > 0 AND s.average_cost IS NOT NULL), 0), 2)
                                    END
           )
      INTO v_stock
      FROM public.stocks s
      JOIN public.products p ON p.id = s.product_id
     WHERE s.organization_id = p_organization_id
       AND s.deleted_at IS NULL;

    -- Contagens em curso; parada = sem atividade (cabeçalho ou linhas) há
    -- mais de 7 dias.
    SELECT jsonb_build_object(
             'in_progress', count(*),
             'stalled',     count(*) FILTER (WHERE GREATEST(c.started_at, c.updated_at, la.last_at) < now() - interval '7 days')
           )
      INTO v_counts
      FROM public.inventory_counts c
      LEFT JOIN LATERAL (
        SELECT max(GREATEST(l.updated_at, l.counted_at)) AS last_at
          FROM public.inventory_count_lines l
         WHERE l.inventory_count_id = c.id
      ) la ON true
     WHERE c.organization_id = p_organization_id
       AND c.status = 'em_contagem';

    -- Sem linha de definições vale 'contract_signed' (como os gatilhos de stock).
    v_settings := jsonb_build_object(
      'stock_deduction_trigger',
      COALESCE(
        (SELECT ois.stock_deduction_trigger
           FROM public.organization_inventory_settings ois
          WHERE ois.organization_id = p_organization_id),
        'contract_signed'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'purchases',     v_purchases,
    'suppliers',     v_suppliers,
    'client_orders', v_client_ord,
    'stock',         v_stock,
    'counts',        v_counts,
    'settings',      v_settings
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_inventory_today(uuid) IS
  'Contadores do ecrã Hoje do Inventário (compras, fornecedores, encomendas de cliente, stock, contagens, definições) da organização ativa. Cada bloco exige a sua permissão (null sem ela). Exige org visível. Só leitura.';

REVOKE ALL ON FUNCTION public.rpc_inventory_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_inventory_today(uuid) TO authenticated, service_role;

COMMIT;
