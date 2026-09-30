-- ============================================================
-- 20261205000000_permissoes_encomendas_cliente_e_venda_direta
-- ============================================================
-- Permissões próprias para Encomendas Clientes e Venda Direta, em vez de
-- pedir emprestadas as de outros módulos.
--
-- Estado encontrado antes (lido ao vivo com pg_get_functiondef /
-- pg_policies, 30/09/2026):
--
--   • Ver Encomendas Clientes exigia inventory.view + client_contracts.view:
--     o armazém tinha de ver contratos para ver encomendas, e o Warehouse
--     Manager (BMClean), que não tem client_contracts.view, não as via nem
--     conseguia confirmar saídas de stock, apesar de ter
--     client_orders.confirm_stock_exit. O frontend já usa client_orders.view
--     (rota /client-orders, menu, ClientOrders.tsx), mas a permissão não
--     existia no catálogo.
--   • rpc_confirm_direct_sale e rpc_register_direct_sale_invoice exigiam
--     direct_sales.edit: quem edita uma venda podia também confirmá-la (gera a
--     encomenda e mexe em stock) e registar a fatura. O frontend já esconde os
--     botões atrás de direct_sales.confirm / direct_sales.register_invoice e
--     o documento interno de custos atrás de direct_sales.view_costs — nenhuma
--     destas existia no catálogo, por isso ninguém (fora System/Super Admin
--     com bypass de interface) via esses botões.
--   • direct_sales.* só estava atribuída a System Admin e Super Admin.
--   • direct_sale_sends_insert_policy só verificava a organização: qualquer
--     membro podia inserir envios de uma venda direta sem nenhuma permissão
--     de vendas diretas. Hoje nenhum código escreve nesta tabela (frontend,
--     edge functions e funções da BD verificados; 5 linhas históricas, a
--     última de 23/09/2026 — a venda direta saiu do portal em 20261204600000).
--
-- Esta migration:
--   A. client_orders.view no catálogo + atribuição (System/Super Admin, todos
--      os papéis que hoje têm inventory.view E client_contracts.view, e o
--      Warehouse Manager da BMClean) + as 6 funções que usavam a combinação
--      antiga passam a exigir client_orders.view.
--   B. direct_sales.view passa a supports_scope; novas direct_sales.confirm,
--      direct_sales.register_invoice e direct_sales.view_costs; atribuição
--      aos papéis Org Admin (code 'org_admin') e a quem cria propostas;
--      rpc_confirm_direct_sale e rpc_register_direct_sale_invoice passam às
--      permissões próprias; INSERT em direct_sale_sends passa a exigir
--      direct_sales.edit (mesmo padrão das policies de direct_sales).
--
-- Corpos das funções: cópia exata de pg_get_functiondef (30/09/2026). Só
-- mudam as linhas de verificação de permissão (e os comentários que as
-- descrevem), assinaladas "NOVO (20261205000000)". CREATE OR REPLACE mantém
-- owner (postgres), SECURITY DEFINER, search_path e ACL; os REVOKE/GRANT
-- abaixo de cada função repetem a ACL viva, confirmada em pg_proc.proacl.
-- Nenhuma das funções tem overloads.
--
-- Papéis: anew_role_permissions.role_id não tem FK para anew_roles e há
-- linhas órfãs (role_id inexistente); todas as atribuições por cópia juntam
-- anew_roles com deleted_at IS NULL para não criar mais órfãs.
--
-- Prerequisites: 20261204800000_endurecer_permissoes_venda_direta_stock.sql
--                20261204900000_eliminar_encomenda_cliente.sql

-- ============================================================
-- A.1 Catálogo: client_orders.view
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES (
  'client_orders.view',
  'Ver encomendas de cliente',
  'Permite ver a página Encomendas Clientes: lista e detalhe das encomendas (contratos assinados, encomendas manuais e de venda direta), com o estado de stock e de pedidos a fornecedor de cada linha e a morada de entrega. Não dá acesso aos contratos nem ao inventário. É também exigida para confirmar/estornar saídas de stock (com inventory.edit e client_orders.confirm_stock_exit) e para pedir material em falta ao fornecedor (com purchase_orders.create). O número da venda direta de origem só aparece a quem tem direct_sales.view.',
  'client_orders',
  NULL,
  0,
  false,
  'organization',
  true
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- A.2 Atribuição de client_orders.view
-- ============================================================
-- DISABLE TRIGGER USER: trg_protect_system_role_perms recusa escritas em
-- papéis is_system (System Admin, Super Admin) fora de service_role; o
-- gatilho de auditoria fica também desligado, como em 20261204900000.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

-- System Admin e Super Admin (o frontend não faz bypass; ver 20261130110000).
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT r.role_id, 'client_orders.view', NULL::uuid
FROM (VALUES
  ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
) AS r(role_id)
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Quem hoje vê as encomendas (inventory.view E client_contracts.view)
-- continua a vê-las — ninguém perde acesso com a troca.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT rp.role_id, 'client_orders.view', NULL::uuid
FROM public.anew_role_permissions rp
JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
WHERE rp.permission_code IN ('inventory.view', 'client_contracts.view')
GROUP BY rp.role_id
HAVING count(DISTINCT rp.permission_code) = 2
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Warehouse Manager (BMClean): tem inventory.view/edit e
-- client_orders.confirm_stock_exit, mas não client_contracts.view — é o caso
-- que motivou a permissão própria. Referido por id; se não existir, não faz nada.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'client_orders.view', NULL::uuid
FROM public.anew_roles ro
WHERE ro.id = '74d22b45-ed63-4f00-a7cc-27ba963b0b6e'::uuid
  AND ro.deleted_at IS NULL
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- A.3 rpc_list_client_order_documents
-- ============================================================

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
      cco.delivery_address AS a_cc_delivery_address
    FROM combined c
    JOIN public.client_contracts cco ON cco.id = c.a_contract_id
    LEFT JOIN LATERAL (
      SELECT true AS ds_found, d.sale_number AS ds_sale_number
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

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) TO service_role;

-- ============================================================
-- A.4 rpc_get_client_order_document
-- ============================================================

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
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN
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
        SELECT jsonb_object_agg(
                 r.quote_line_id::text || ':' || COALESCE(r.component_index, 0)::text,
                 to_jsonb(r)
               )
          INTO v_res_map
        FROM public.fn_client_order_line_reservations(v_org, v_products) r
        WHERE r.contract_id = p_contract_id;
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

          IF v_q_served_flag THEN
            -- Concluída: 'recebido' se houve parte pedida (recebida) — a parte
            -- de stock, se existir, está servida; senão servida por stock.
            v_line_status := CASE WHEN v_q_received > 0 THEN 'recebido' ELSE 'servido_por_stock' END;
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

          -- Armazéns: nunca mostrar como disponível mais do que a reserva.
          IF v_q_reserved > 0 THEN
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'warehouse_id',      w.id,
                  'warehouse_name',    w.name,
                  'quantity',          LEAST(s.quantity::numeric, v_q_reserved),
                  'physical_quantity', s.quantity
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
        'qty_served',            CASE WHEN v_res IS NOT NULL THEN v_q_served END
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
    'delivery_address_override', nullif(btrim(v_cc_delivery), '')
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_get_client_order_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_client_order_document(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_order_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_order_document(uuid) TO service_role;

-- ============================================================
-- A.5 fn_entity_delivery_address_access — Via 2 ('view')
-- ============================================================
-- Só o ramo 'view' da Via 2 muda; 'add' continua com client_contracts.edit e
-- a Via 1 (ficha de contacto + system_admin_pii_default_deny) fica igual.

CREATE OR REPLACE FUNCTION public.fn_entity_delivery_address_access(p_entity_id uuid, p_mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_original boolean := true;
BEGIN
  IF p_entity_id IS NULL OR v_uid IS NULL OR p_mode NOT IN ('view', 'edit', 'add') THEN
    RETURN false;
  END IF;

  -- ── Via 1: regra original (ficha de contacto) ─────────────────────────────
  IF p_mode = 'view' THEN
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.view'),
             public.crm_scope_keys('clients.view')) THEN
      v_original := false;
    END IF;
  ELSE
    -- 'edit' e 'add'
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.edit'),
             public.crm_scope_keys('clients.edit')) THEN
      v_original := false;
    END IF;
  END IF;

  -- system_admin_pii_default_deny (RESTRICTIVE)
  IF v_original AND public.is_system_admin(v_uid) THEN
    IF NOT (
      EXISTS (
        SELECT 1
        FROM public.anew_entity_roles er
        WHERE er.entity_id = p_entity_id
          AND er.deleted_at IS NULL
          AND er.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
      )
      OR EXISTS (
        SELECT 1
        FROM public.anew_entity_roles er
        WHERE er.entity_id = p_entity_id
          AND er.deleted_at IS NULL
          AND public.has_active_support_access(er.organization_id)
      )
    ) THEN
      v_original := false;
    END IF;
  END IF;

  IF v_original THEN
    RETURN true;
  END IF;

  -- 'edit' (usado pelo remover) não tem segunda via.
  IF p_mode = 'edit' THEN
    RETURN false;
  END IF;

  -- ── Via 2: encomendas de cliente da organização ──────────────────────────
  IF p_mode = 'view' THEN
    -- NOVO (20261205000000): client_orders.view em vez de inventory.view +
    -- client_contracts.view.
    IF NOT public.has_anew_permission(v_uid, 'client_orders.view') THEN
      RETURN false;
    END IF;
  ELSE
    -- 'add'
    IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.anew_clients c
    WHERE c.entity_id = p_entity_id
      AND c.deleted_at IS NULL
      AND public.fn_deal_org_in_scope(c.organization_id)
  );
END;
$function$;

-- ACL mantida: EXECUTE só postgres/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) TO service_role;

-- ============================================================
-- A.6 rpc_confirm_client_order_stock_exit
-- ============================================================
-- inventory.edit e client_orders.confirm_stock_exit mantidos; só
-- client_contracts.view passa a client_orders.view.

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
  -- NOVO (20261204310000)
  v_reserved        numeric;
  v_line_count      integer;
  -- NOVO (20261204340000)
  v_wh_qty          integer;
  -- NOVO (20261204620000): número da encomenda nas notas
  v_order_number    text;
  v_is_manual       boolean;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number,
         cc.order_number, COALESCE(cc.is_manual_order, false)  -- NOVO (20261204620000)
  INTO v_org, v_contract_number,
       v_order_number, v_is_manual
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
  -- ADICIONALMENTE a inventory.edit + client_orders.view (20261205000000).
  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view')  -- NOVO (20261205000000): era client_contracts.view
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204310000): lock por produto (mesma ordem que
  -- fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

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

  -- NOVO (20261204310000): só se pode consumir o stock reservado para esta
  -- encomenda (fila por ordem de assinatura).
  SELECT COALESCE(SUM(r.qty_reserved), 0), count(*)
    INTO v_reserved, v_line_count
  FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- NOVO (20261204340000): o armazém escolhido tem de ter a quantidade (as
  -- linhas de stocks deste produto já estão bloqueadas acima). Só conta stock
  -- ativo, de um armazém ativo da organização do contrato — o mesmo universo
  -- que a reserva por ordem usa.
  SELECT s.quantity
    INTO v_wh_qty
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND s.warehouse_id = p_warehouse_id
    AND s.deleted_at IS NULL
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF COALESCE(v_wh_qty, 0) < p_quantity THEN
    RAISE EXCEPTION 'O armazém escolhido só tem % un — escolha outro armazém',
      GREATEST(COALESCE(v_wh_qty, 0), 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204620000): notas com o número certo. Venda direta ANTES de
  -- manual (as de VD também têm is_manual_order); contrato real mantém o
  -- texto de antes. Só texto — nada acima nem abaixo muda.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Saída confirmada a partir da venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    WHEN v_is_manual THEN
      format('Saída confirmada a partir do documento de Encomenda Cliente %s',
             COALESCE(v_order_number, v_contract_number))
    ELSE
      format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number)
  END;

  v_balance_after := public.rpc_decrement_stock(
    p_product_id       => p_product_id,
    p_warehouse_id     => p_warehouse_id,
    p_qty              => p_quantity,
    p_document_number  => NULL,
    p_document_type    => 'venda',
    p_counterparty     => NULL,
    p_notes            => v_notes,  -- NOVO (20261204620000)
    p_sale_source_type => 'contract',
    p_sale_source_id   => p_contract_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) TO service_role;

-- ============================================================
-- A.7 rpc_revert_client_order_stock_exit
-- ============================================================

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
  -- NOVO (20261204620000)
  v_sale_number     text;
  v_is_direct_sale  boolean;
  -- NOVO (20261204630000)
  v_notes           text;
  v_result          jsonb;
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
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view')  -- NOVO (20261205000000): era client_contracts.view
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

  -- NOVO (20261204620000): venda direta mostra o VD-… nas notas; os outros
  -- casos ficam exatamente como antes. Só texto.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Estorno da saída confirmada — venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    ELSE
      format('Estorno da saída confirmada — Encomenda %s', COALESCE(v_order_number, v_contract_number))
  END;  -- NOVO (20261204620000)

  -- NOVO (20261204630000): a inserção do 'estorno_venda' passa para o helper
  -- (mesmas colunas e valores). O movimento já está trancado acima, por isso
  -- 'skipped' não é possível aqui — se acontecer, mesmo erro de antes.
  v_result := public.fn_client_order_reverse_stock_movement(v_mov.id, v_actor, v_notes);

  IF COALESCE(v_result ->> 'status', '') <> 'reversed' THEN
    RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
  END IF;

  v_balance_after := (v_result ->> 'balance_after')::integer;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_revert_client_order_stock_exit(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_revert_client_order_stock_exit(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_revert_client_order_stock_exit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revert_client_order_stock_exit(uuid, uuid) TO service_role;

-- ============================================================
-- A.8 rpc_request_missing_from_supplier
-- ============================================================
-- purchase_orders.create mantida; client_contracts.view passa a
-- client_orders.view (é o que ClientOrders.tsx já verifica).

CREATE OR REPLACE FUNCTION public.rpc_request_missing_from_supplier(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN  -- NOVO (20261205000000): era client_contracts.view
    RAISE EXCEPTION 'Sem permissão para pedir material ao fornecedor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT cc.organization_id, cc.status
    INTO v_org, v_status
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.fn_deal_org_in_scope(v_org) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
    RAISE EXCEPTION 'Só é possível pedir material para encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  v_result := public.fn_client_order_request_missing(p_contract_id, v_actor, NULL);

  RETURN jsonb_build_object(
    'success',                 COALESCE((v_result ->> 'success')::boolean, false),
    'purchase_orders_created', COALESCE((v_result ->> 'purchase_orders_created')::int, 0),
    'items_created',           COALESCE((v_result ->> 'items_created')::int, 0),
    'skipped_no_supplier',     COALESCE((v_result ->> 'skipped_no_supplier')::int, 0),
    'skipped_other',           COALESCE((v_result ->> 'skipped_other')::int, 0),
    'errors',                  COALESCE((v_result ->> 'errors')::int, 0)
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_request_missing_from_supplier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_request_missing_from_supplier(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_missing_from_supplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_request_missing_from_supplier(uuid) TO service_role;

-- ============================================================
-- B.1 Catálogo: direct_sales.view com âmbito + três permissões novas
-- ============================================================
-- DirectSales.tsx já lê getPermissionScope('direct_sales.view').

UPDATE public.anew_permissions
   SET supports_scope = true,
       updated_at     = now()
 WHERE code = 'direct_sales.view'
   AND supports_scope IS DISTINCT FROM true;

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  (
    'direct_sales.confirm',
    'Confirmar vendas diretas',
    'Permite confirmar uma venda direta (rpc_confirm_direct_sale): a venda passa a aceite, é emitida a proforma e é gerada na mesma transação a Encomenda de Cliente, que desconta ou reserva stock e pode criar pedidos a fornecedor. Criar a ficha de cliente em falta continua a exigir clients.create.',
    'direct_sales',
    NULL,
    4,
    true,
    'organization',
    false
  ),
  (
    'direct_sales.register_invoice',
    'Registar fatura de venda direta',
    'Permite registar manualmente a fatura de uma venda direta já aceite (rpc_register_direct_sale_invoice): número, série, data, ATCUD, hash e PDF. Faturas emitidas pelo módulo de faturação não podem ser alteradas.',
    'direct_sales',
    NULL,
    5,
    false,
    'organization',
    false
  ),
  (
    'direct_sales.view_costs',
    'Ver custos de vendas diretas',
    'Permite ver e descarregar o documento interno da venda direta, com o custo, a margem e as linhas internas que o cliente não vê.',
    'direct_sales',
    NULL,
    6,
    false,
    'organization',
    false
  )
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- B.2 Atribuição das permissões de venda direta
-- ============================================================
-- Ordem importa: confirm/register_invoice copiam de direct_sales.edit e
-- view_costs copia de direct_sales.view, por isso correm depois da
-- atribuição de view/create/edit.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

-- view/create/edit: papéis Org Admin (code 'org_admin' — o nome varia entre
-- 'Org Admin', 'Admin' e 'Administrador') e todos os papéis que criam
-- propostas (a venda direta é o fluxo alternativo à proposta).
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT t.role_id, p.code, NULL::uuid
FROM (
  SELECT ro.id AS role_id
    FROM public.anew_roles ro
   WHERE ro.code = 'org_admin'
     AND ro.deleted_at IS NULL
  UNION
  SELECT rp.role_id
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
   WHERE rp.permission_code = 'proposals.create'
) AS t
CROSS JOIN (VALUES ('direct_sales.view'), ('direct_sales.create'), ('direct_sales.edit')) AS p(code)
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- confirm/register_invoice: quem edita vendas diretas (já com as linhas
-- acima) + System Admin e Super Admin. Mantém o acesso de quem hoje confirma
-- e regista faturas via direct_sales.edit.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT t.role_id, p.code, NULL::uuid
FROM (
  SELECT rp.role_id
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
   WHERE rp.permission_code = 'direct_sales.edit'
  UNION
  SELECT r.role_id
    FROM (VALUES
      ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
      ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
    ) AS r(role_id)
) AS t
CROSS JOIN (VALUES ('direct_sales.confirm'), ('direct_sales.register_invoice')) AS p(code)
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- view_costs: quem vê vendas diretas E já vê custos de orçamentos
-- (quotes.view_costs) + System Admin e Super Admin.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT t.role_id, 'direct_sales.view_costs', NULL::uuid
FROM (
  SELECT rp.role_id
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
   WHERE rp.permission_code IN ('direct_sales.view', 'quotes.view_costs')
   GROUP BY rp.role_id
  HAVING count(DISTINCT rp.permission_code) = 2
  UNION
  SELECT r.role_id
    FROM (VALUES
      ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
      ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
    ) AS r(role_id)
) AS t
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- B.3 rpc_confirm_direct_sale — direct_sales.confirm
-- ============================================================
-- As duas verificações de direct_sales.edit (caminho de membro e recuo do
-- system admin sem sessão de suporte) passam a direct_sales.confirm. Âmbito
-- da organização, sessão de suporte e clients.create ficam iguais.

CREATE OR REPLACE FUNCTION public.rpc_confirm_direct_sale(p_direct_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor              uuid;
  v_is_admin           boolean;
  v_sale               public.direct_sales;
  v_contract           public.client_contracts;
  v_client_id          uuid;
  v_client_created     boolean := false;
  v_repair             boolean := false;
  v_line_count         integer;
  v_line               record;
  v_origin_source      text;
  v_origin_source_id   uuid;
  v_origin_campaign_id uuid;
  v_err_state          text;
  v_err_msg            text;
  v_err_detail         text;
BEGIN
  -- ── Autenticação ─────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: é preciso estar autenticado para confirmar a venda'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ator de negócio (anew_users.id) — o mesmo que created_by no frontend e o
  -- alvo da FK de accepted_by. Mesmo padrão de rpc_register_direct_sale_invoice.
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização ──────────────────────────────────────────────────────────
  -- Mesma forma da política de UPDATE da RLS de direct_sales
  -- (direct_sales_update_policy): system admin, OU organização visível E
  -- a permissão. NOVO (20261205000000): a permissão passa a ser a própria
  -- direct_sales.confirm (era direct_sales.edit) — confirmar gera a
  -- encomenda de cliente e mexe em stock. A ordem (permissão, depois
  -- leitura, depois âmbito) é a de rpc_register_direct_sale_invoice.
  v_is_admin := public.is_system_admin_user(auth.uid());

  IF NOT v_is_admin AND NOT public.has_anew_permission(auth.uid(), 'direct_sales.confirm') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar vendas diretas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_direct_sale_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serializa duas confirmações simultâneas da mesma venda (dois
  -- cliques, dois separadores): a segunda espera e cai na idempotência abaixo.
  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_is_admin AND v_sale.organization_id NOT IN (
    SELECT public.get_user_visible_org_ids(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Venda direta fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204800000): o atalho de system admin passa a exigir sessão de
  -- suporte ativa na organização da venda (has_active_support_access), como
  -- em system_admin_pii_default_deny. Sem sessão, o admin só passa pelo
  -- caminho normal de membro (organização visível + direct_sales.confirm) e a
  -- partir daqui é tratado como tal — incluindo a criação da ficha de
  -- cliente, que volta a exigir clients.create (ramo abaixo).
  IF v_is_admin AND NOT public.has_active_support_access(v_sale.organization_id) THEN
    IF public.has_anew_permission(auth.uid(), 'direct_sales.confirm')  -- NOVO (20261205000000): era direct_sales.edit
       AND v_sale.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
      v_is_admin := false;
    ELSE
      RAISE EXCEPTION 'Acesso de suporte não ativo para esta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Idempotência ─────────────────────────────────────────────────────────
  IF v_sale.status = 'aceite' AND v_sale.client_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
      FROM public.client_contracts
     WHERE id = v_sale.client_contract_id;

    IF v_contract.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'direct_sale_id',     v_sale.id,
        'sale_number',        v_sale.sale_number,
        'status',             v_sale.status,
        'proforma_number',    v_sale.proforma_number,
        'accepted_at',        v_sale.accepted_at,
        'accepted_by',        v_sale.accepted_by,
        'client_contract_id', v_contract.id,
        'order_number',       v_contract.order_number,
        'contract_number',    v_contract.contract_number,
        'client_id',          v_contract.client_id,
        'client_created',     false,
        'already_confirmed',  true
      );
    END IF;
    -- Ponteiro pendurado (contrato apagado à mão): segue como reparação.
  END IF;

  -- ── Estado ───────────────────────────────────────────────────────────────
  -- 'aceite' sem encomenda = aceite no portal pelo fluxo antigo, com a
  -- encomenda falhada. Não se volta a aceitar (accepted_at/accepted_by e o
  -- proforma já emitido ficam como estão): só se gera a encomenda em falta.
  IF v_sale.status = 'aceite' THEN
    v_repair := true;
  ELSIF v_sale.status = 'rejeitada' THEN
    RAISE EXCEPTION 'Esta venda direta foi rejeitada e não pode ser confirmada. Crie uma nova venda.'
      USING ERRCODE = 'check_violation';
  ELSIF v_sale.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda direta foi cancelada e não pode ser confirmada. Crie uma nova venda.'
      USING ERRCODE = 'check_violation';
  ELSIF v_sale.status NOT IN ('rascunho', 'enviada') THEN
    RAISE EXCEPTION 'Só é possível confirmar vendas diretas em rascunho ou enviadas (estado atual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Validações de dados (todas ANTES de mudar o estado) ──────────────────
  -- Cada uma corresponde a um RAISE de rpc_create_direct_sale_order ou de um
  -- gatilho a jusante; aqui com a mensagem que o comercial consegue resolver.

  IF v_sale.entity_id IS NULL THEN
    RAISE EXCEPTION 'A venda não tem cliente associado. Escolha o cliente antes de confirmar.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- client_contracts.created_by e quotes.created_by são NOT NULL e a encomenda
  -- é atribuída ao autor da venda. Só acontece se o utilizador que criou a
  -- venda tiver sido apagado (FK ON DELETE SET NULL). Não se inventa autor.
  IF v_sale.created_by IS NULL THEN
    RAISE EXCEPTION 'A venda não tem autor registado (o utilizador que a criou já não existe). Não é possível atribuir a encomenda de cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_line_count
    FROM public.direct_sale_lines l
   WHERE l.direct_sale_id = v_sale.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'A venda não tem linhas. Acrescente pelo menos um produto ou serviço antes de confirmar.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unidade de cada linha: o gatilho fn_line_units_per_uom_snapshot volta a
  -- correr no INSERT em quote_lines e rebenta se a unidade deixou de ser
  -- compatível com o produto (unidade do produto alterada depois de a linha
  -- ser gravada) ou não é visível para quem confirma. Validado aqui, linha a
  -- linha, para dizer QUAL é a linha.
  FOR v_line IN
    SELECT l.id, l.descricao_snapshot, l.uom_id, l.product_id
      FROM public.direct_sale_lines l
     WHERE l.direct_sale_id = v_sale.id
       AND l.uom_id IS NOT NULL
     ORDER BY COALESCE(l.ordem, 0), l.created_at
  LOOP
    BEGIN
      PERFORM public.fn_uom_units_per(v_line.uom_id, v_line.product_id);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      RAISE EXCEPTION 'A linha «%» tem uma unidade inválida: %. Corrija a unidade da linha antes de confirmar.',
        COALESCE(nullif(v_line.descricao_snapshot, ''), 'Item'), v_err_msg
        USING ERRCODE = v_err_state;
    END;
  END LOOP;

  -- ── Ficha de cliente (anew_clients) na organização da venda ──────────────
  -- rpc_create_direct_sale_order exige-a (entity_id + organization_id, não
  -- apagada). Em falta, cria-se pelo mesmo mecanismo que o sistema já usa ao
  -- assinar um contrato (fn_contract_signed_convert_to_client): ficha 'active',
  -- origem de marketing via fn_resolve_client_marketing_origin, root =
  -- COALESCE(root da venda, organização). Os papéis (anew_entity_roles) ficam
  -- a cargo do gatilho trg_sync_from_client, como em qualquer outra criação.
  SELECT c.id INTO v_client_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_sale.entity_id
     AND c.organization_id = v_sale.organization_id
     AND c.deleted_at IS NULL
   ORDER BY c.created_at ASC
   LIMIT 1;

  IF v_client_id IS NULL THEN
    -- Criar uma ficha de cliente é uma permissão à parte (clients.create, a
    -- mesma que rpc_create_client_manual exige). Não é implícita em
    -- direct_sales.confirm.
    -- NOVO (20261204800000): aqui v_is_admin só é true se o admin tiver
    -- sessão de suporte ativa na organização da venda (verificado acima).
    IF NOT v_is_admin AND NOT public.has_anew_permission(auth.uid(), 'clients.create') THEN
      RAISE EXCEPTION 'Este cliente ainda não tem ficha de cliente nesta empresa e não tem permissão para a criar. Peça a quem tenha permissão para criar clientes, ou crie a ficha antes de confirmar.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT o.origin_source, o.origin_source_id, o.origin_campaign_id
      INTO v_origin_source, v_origin_source_id, v_origin_campaign_id
      FROM public.fn_resolve_client_marketing_origin(v_sale.entity_id, v_sale.organization_id) o;

    PERFORM public.set_audit_context(v_actor, 'crm');

    BEGIN
      INSERT INTO public.anew_clients (
        entity_id, organization_id, root_organization_id,
        status, source_type, source_id, created_by, assigned_to,
        origin_source, origin_source_id, origin_campaign_id
      ) VALUES (
        v_sale.entity_id, v_sale.organization_id,
        COALESCE(v_sale.root_organization_id, v_sale.organization_id),
        'active', 'direct_sale', v_sale.id, v_actor, v_sale.assigned_to,
        v_origin_source, v_origin_source_id, v_origin_campaign_id
      )
      RETURNING id INTO v_client_id;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      IF v_err_msg LIKE 'plan_limit_exceeded:%' THEN
        RAISE EXCEPTION 'Não foi possível criar a ficha de cliente: o limite do plano foi atingido. A venda não foi confirmada.'
          USING ERRCODE = v_err_state, DETAIL = v_err_msg;
      END IF;
      RAISE EXCEPTION 'Não foi possível criar a ficha de cliente: %. A venda não foi confirmada.', v_err_msg
        USING ERRCODE = v_err_state;
    END;

    v_client_created := true;
  END IF;

  -- ── Aceitação ────────────────────────────────────────────────────────────
  PERFORM public.set_audit_context(v_actor, 'crm');

  -- generate_proforma_number (chamada pelo gatilho BEFORE) faz MAX()+1 sem
  -- lock e há um índice único (organization_id, proforma_number): duas
  -- confirmações simultâneas na mesma organização colidiam. Este lock de
  -- transação serializa-as, sem mexer na função partilhada.
  PERFORM pg_advisory_xact_lock(hashtext('direct_sales_proforma_' || v_sale.organization_id::text));

  IF v_repair THEN
    -- Só completa a ligação à ficha de cliente; a aceitação já existe.
    UPDATE public.direct_sales
       SET client_id = COALESCE(client_id, v_client_id)
     WHERE id = v_sale.id
       AND client_id IS NULL;
  ELSE
    -- signature_image fica NULL de propósito: não há assinatura do cliente,
    -- a prova é accepted_by (quem confirmou) + accepted_at.
    UPDATE public.direct_sales
       SET status      = 'aceite',
           accepted_at = now(),
           accepted_by = v_actor,
           client_id   = COALESCE(client_id, v_client_id)
     WHERE id = v_sale.id;
  END IF;

  -- ── Encomenda de Cliente (mesma transação) ───────────────────────────────
  -- rpc_create_direct_sale_order: SECURITY DEFINER, EXECUTE só para
  -- service_role/postgres; aqui corre como dono desta função (postgres), por
  -- isso a chamada é permitida sem abrir a RPC a authenticated. Não usa
  -- auth.uid() nem verifica papéis.
  --
  -- Qualquer erro é relançado com mensagem própria: a exceção aborta a
  -- transação inteira, incluindo o UPDATE acima e a ficha de cliente criada.
  BEGIN
    v_contract := public.rpc_create_direct_sale_order(v_sale.id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_state  = RETURNED_SQLSTATE,
      v_err_msg    = MESSAGE_TEXT,
      v_err_detail = PG_EXCEPTION_DETAIL;
    IF v_err_msg LIKE 'plan_limit_exceeded:%' THEN
      RAISE EXCEPTION 'Não foi possível gerar a encomenda de cliente: o limite do plano foi atingido. A venda não foi confirmada.'
        USING ERRCODE = v_err_state, DETAIL = v_err_msg;
    END IF;
    RAISE EXCEPTION 'Não foi possível gerar a encomenda de cliente: %. A venda não foi confirmada.', v_err_msg
      USING ERRCODE = v_err_state, DETAIL = COALESCE(v_err_detail, '');
  END;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível gerar a encomenda de cliente. A venda não foi confirmada.'
      USING ERRCODE = 'internal_error';
  END IF;

  -- Relê a venda: proforma_number/proforma_issued_at vêm do gatilho BEFORE e
  -- client_contract_id foi escrito por rpc_create_direct_sale_order.
  SELECT * INTO v_sale FROM public.direct_sales WHERE id = v_sale.id;

  RETURN jsonb_build_object(
    'direct_sale_id',     v_sale.id,
    'sale_number',        v_sale.sale_number,
    'status',             v_sale.status,
    'proforma_number',    v_sale.proforma_number,
    'accepted_at',        v_sale.accepted_at,
    'accepted_by',        v_sale.accepted_by,
    'client_contract_id', v_contract.id,
    'order_number',       v_contract.order_number,
    'contract_number',    v_contract.contract_number,
    'client_id',          v_contract.client_id,
    'client_created',     v_client_created,
    'already_confirmed',  false
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_confirm_direct_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_confirm_direct_sale(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_direct_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_direct_sale(uuid) TO service_role;

-- ============================================================
-- B.4 rpc_register_direct_sale_invoice — direct_sales.register_invoice
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_direct_sale_invoice(p_direct_sale_id uuid, p_invoice jsonb)
 RETURNS direct_sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor   uuid;
  v_sale    public.direct_sales;
  v_number  text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261205000000): permissão própria (era direct_sales.edit).
  IF NOT public.has_anew_permission(auth.uid(), 'direct_sales.register_invoice') THEN
    RAISE EXCEPTION 'Sem permissão para registar a fatura' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo âmbito organizacional que a RLS de direct_sales aplica na leitura:
  -- ter a permissão não chega, a venda tem de ser de uma organização visível.
  IF v_sale.organization_id NOT IN (
    SELECT public.get_user_visible_org_ids(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Venda direta fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Uma fatura só existe depois de o cliente aceitar. Registá-la antes seria
  -- documentar uma venda que ainda pode ser rejeitada.
  IF v_sale.status IS DISTINCT FROM 'aceite' THEN
    RAISE EXCEPTION 'A fatura só pode ser registada depois de a venda ser aceite (estado actual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A regra que justifica a coluna: o que veio do módulo certificado é registo
  -- fiscal e não se corrige à mão.
  IF v_sale.invoice_source = 'integracao' THEN
    RAISE EXCEPTION 'Esta fatura foi emitida pelo módulo de faturação e não pode ser alterada manualmente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_number := nullif(btrim(coalesce(p_invoice ->> 'invoice_number', '')), '');
  IF v_number IS NULL THEN
    RAISE EXCEPTION 'O número da fatura é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Dentro da função: set_audit_context usa set_config(..., true), que é LOCAL
  -- à transação. Chamada de fora, noutro pedido, não chegaria aqui.
  PERFORM public.set_audit_context(v_actor, 'crm');

  UPDATE public.direct_sales
     SET invoice_number      = v_number,
         invoice_series      = nullif(btrim(coalesce(p_invoice ->> 'invoice_series', '')), ''),
         invoice_issued_at   = coalesce(
                                 nullif(p_invoice ->> 'invoice_issued_at', '')::timestamptz,
                                 now()
                               ),
         invoice_atcud       = nullif(btrim(coalesce(p_invoice ->> 'invoice_atcud', '')), ''),
         invoice_hash        = nullif(btrim(coalesce(p_invoice ->> 'invoice_hash', '')), ''),
         external_invoice_id = nullif(btrim(coalesce(p_invoice ->> 'external_invoice_id', '')), ''),
         invoice_pdf_url     = nullif(btrim(coalesce(p_invoice ->> 'invoice_pdf_url', '')), ''),
         invoice_status      = 'emitida',
         invoice_source      = 'manual'
   WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_direct_sale_invoice(uuid, jsonb) TO service_role;

-- ============================================================
-- B.5 RLS — INSERT em direct_sale_sends exige direct_sales.edit
-- ============================================================
-- Antes: is_system_admin_user() OR organização visível (sem permissão).
-- Depois: o padrão de direct_sales_update_policy — system admin, OU
-- organização visível E direct_sales.edit. A policy de SELECT não muda.
-- Não há escritores atuais (ver cabeçalho): ninguém perde uma ação em uso.

DROP POLICY IF EXISTS direct_sale_sends_insert_policy ON public.direct_sale_sends;
CREATE POLICY direct_sale_sends_insert_policy ON public.direct_sale_sends
  FOR INSERT WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'direct_sales.edit')
    )
  );

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_missing        text;
  v_count          int;
  v_trigger_status text;
  v_fn             text;
BEGIN
  SELECT string_agg(c.code, ', ') INTO v_missing
  FROM (VALUES ('client_orders.view'), ('direct_sales.confirm'),
               ('direct_sales.register_invoice'), ('direct_sales.view_costs')) AS c(code)
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: permissões em falta no catálogo: %', v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'direct_sales.view' AND supports_scope) THEN
    RAISE EXCEPTION 'CONFERIR: direct_sales.view sem supports_scope';
  END IF;

  -- System Admin e Super Admin com todas as permissões novas.
  SELECT count(*) INTO v_count
  FROM (VALUES
    ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid),
    ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)
  ) AS r(role_id)
  CROSS JOIN (VALUES ('client_orders.view'), ('direct_sales.confirm'),
                     ('direct_sales.register_invoice'), ('direct_sales.view_costs')) AS c(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = r.role_id AND rp.permission_code = c.code
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % atribuição(ões) em falta nos papéis de sistema', v_count;
  END IF;

  -- Ninguém que via encomendas (inventory.view + client_contracts.view) fica sem client_orders.view.
  SELECT count(*) INTO v_count
  FROM (
    SELECT rp.role_id
      FROM public.anew_role_permissions rp
      JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
     WHERE rp.permission_code IN ('inventory.view', 'client_contracts.view')
     GROUP BY rp.role_id
    HAVING count(DISTINCT rp.permission_code) = 2
  ) b
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = b.role_id AND rp.permission_code = 'client_orders.view'
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) perderiam o acesso a Encomendas Clientes', v_count;
  END IF;

  -- Ninguém que editava vendas diretas perde confirmar/registar fatura.
  SELECT count(*) INTO v_count
  FROM public.anew_role_permissions e
  JOIN public.anew_roles ro ON ro.id = e.role_id AND ro.deleted_at IS NULL
  CROSS JOIN (VALUES ('direct_sales.confirm'), ('direct_sales.register_invoice')) AS c(code)
  WHERE e.permission_code = 'direct_sales.edit'
    AND NOT EXISTS (
      SELECT 1 FROM public.anew_role_permissions rp
      WHERE rp.role_id = e.role_id AND rp.permission_code = c.code
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % atribuição(ões) de confirm/register_invoice em falta a quem tem direct_sales.edit', v_count;
  END IF;

  -- Gatilhos de anew_role_permissions de volta ativos.
  SELECT tgenabled::text INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_protect_system_role_perms';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'CONFERIR: trg_protect_system_role_perms nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  SELECT tgenabled::text INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_audit_anew_role_permissions';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'CONFERIR: trg_audit_anew_role_permissions nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  -- As funções já não usam as verificações antigas.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date)',
    'public.rpc_get_client_order_document(uuid)',
    'public.fn_entity_delivery_address_access(uuid, text)',
    'public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid)',
    'public.rpc_revert_client_order_stock_exit(uuid, uuid)',
    'public.rpc_request_missing_from_supplier(uuid)'
  ] LOOP
    IF (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure) LIKE '%has_anew_permission(%''client_contracts.view'')%' THEN
      RAISE EXCEPTION 'CONFERIR: % ainda verifica client_contracts.view', v_fn;
    END IF;
    IF (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure) NOT LIKE '%''client_orders.view''%' THEN
      RAISE EXCEPTION 'CONFERIR: % não verifica client_orders.view', v_fn;
    END IF;
  END LOOP;

  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.rpc_confirm_direct_sale(uuid)'::regprocedure)
       LIKE '%has_anew_permission(auth.uid(), ''direct_sales.edit'')%' THEN
    RAISE EXCEPTION 'CONFERIR: rpc_confirm_direct_sale ainda verifica direct_sales.edit';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.rpc_register_direct_sale_invoice(uuid, jsonb)'::regprocedure)
       LIKE '%has_anew_permission(auth.uid(), ''direct_sales.edit'')%' THEN
    RAISE EXCEPTION 'CONFERIR: rpc_register_direct_sale_invoice ainda verifica direct_sales.edit';
  END IF;

  -- ACL: anon sem EXECUTE; fn_entity_delivery_address_access continua fechada a authenticated.
  IF has_function_privilege('anon', 'public.rpc_confirm_direct_sale(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: anon tem EXECUTE numa RPC desta migration';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_entity_delivery_address_access(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated passou a ter EXECUTE em fn_entity_delivery_address_access';
  END IF;

  -- Policy de INSERT de direct_sale_sends com a permissão.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'direct_sale_sends'
      AND policyname = 'direct_sale_sends_insert_policy' AND cmd = 'INSERT'
      AND with_check LIKE '%direct_sales.edit%'
  ) THEN
    RAISE EXCEPTION 'CONFERIR: direct_sale_sends_insert_policy sem direct_sales.edit';
  END IF;
END;
$$;
