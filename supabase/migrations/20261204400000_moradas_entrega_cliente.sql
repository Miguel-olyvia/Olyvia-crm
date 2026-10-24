-- ============================================================================
-- Moradas de entrega por cliente + morada de entrega na lista de encomendas.
--
-- 1. rpc_list_client_order_documents: nova coluna delivery_address (no fim do
--    RETURNS TABLE), com a MESMA regra de rpc_get_client_order_document:
--    quotes.obra_endereco do orçamento resolvido; senão a morada ativa do
--    cliente (is_primary DESC, created_at DESC). Calculada só para a página
--    devolvida (depois do LIMIT), com LATERAL ... LIMIT 1.
--    Parte da definição AO VIVO (pg_get_functiondef, 20261204340000); o resto
--    fica igual. Muda o tipo de retorno => DROP + CREATE + GRANTs reaplicados.
-- 2. rpc_list_entity_delivery_addresses / rpc_add_entity_delivery_address /
--    rpc_remove_entity_delivery_address: moradas address_type = 'delivery' em
--    anew_entity_addresses. As moradas (anew_addresses) são partilhadas entre
--    entidades: nunca se faz UPDATE a uma morada; reutiliza-se pelo
--    address_key ou cria-se uma nova. Remover = valid_to = now().
--
-- Permissões: as mesmas da RLS de anew_entity_addresses (incluindo a policy
-- RESTRICTIVE system_admin_pii_default_deny), verificadas dentro das funções.
-- ============================================================================

-- ─── Verificação de acesso (interna) ────────────────────────────────────────
-- p_mode = 'view' -> policy SELECT (leads.view / clients.view)
-- p_mode = 'edit' -> policy UPDATE (leads.edit / clients.edit)
-- Mais a policy RESTRICTIVE system_admin_pii_default_deny, palavra por palavra.
CREATE OR REPLACE FUNCTION public.fn_entity_delivery_address_access(p_entity_id uuid, p_mode text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF p_entity_id IS NULL OR v_uid IS NULL OR p_mode NOT IN ('view', 'edit') THEN
    RETURN false;
  END IF;

  IF p_mode = 'view' THEN
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.view'),
             public.crm_scope_keys('clients.view')) THEN
      RETURN false;
    END IF;
  ELSE
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.edit'),
             public.crm_scope_keys('clients.edit')) THEN
      RETURN false;
    END IF;
  END IF;

  -- system_admin_pii_default_deny (RESTRICTIVE)
  IF public.is_system_admin(v_uid) THEN
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
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM authenticated;

-- ─── 1. rpc_list_client_order_documents (+ delivery_address) ────────────────
DROP FUNCTION IF EXISTS public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date);

CREATE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
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
      cco.entity_id AS a_entity_id
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
    COALESCE(qa.qa_address, ca.ca_address) AS delivery_address
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

REVOKE ALL ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_client_order_documents(uuid, text, text, integer, integer, date, date) TO service_role;

-- ─── 2. rpc_list_entity_delivery_addresses ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_entity_delivery_addresses(p_entity_id uuid)
RETURNS TABLE(
  entity_address_id uuid,
  address_id        uuid,
  street            text,
  number            text,
  floor             text,
  unit              text,
  postal_code       text,
  city              text,
  formatted         text,
  created_at        timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'view') THEN
    RAISE EXCEPTION 'Sem permissão para ver as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ea.id,
    a.id,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    nullif(concat_ws(', ',
      nullif(btrim(a.street), ''),
      nullif(btrim(a.number), ''),
      nullif(btrim(a.postal_code), ''),
      nullif(btrim(a.city), '')
    ), ''),
    ea.created_at
  FROM public.anew_entity_addresses ea
  JOIN public.anew_addresses a ON a.id = ea.address_id
  WHERE ea.entity_id = p_entity_id
    AND ea.address_type = 'delivery'
    AND (ea.valid_to IS NULL OR ea.valid_to > now())
  ORDER BY ea.created_at, ea.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) TO authenticated;

-- ─── 3. rpc_add_entity_delivery_address ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_add_entity_delivery_address(
  p_entity_id   uuid,
  p_street      text,
  p_number      text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_city        text DEFAULT NULL,
  p_floor       text DEFAULT NULL,
  p_unit        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor      uuid;
  v_street     text := btrim(coalesce(p_street, ''));
  v_number     text := btrim(coalesce(p_number, ''));
  v_floor      text := nullif(btrim(coalesce(p_floor, '')), '');
  v_unit       text := nullif(btrim(coalesce(p_unit, '')), '');
  v_postal     text := btrim(coalesce(p_postal_code, ''));
  v_city       text := btrim(coalesce(p_city, ''));
  v_country    text := 'PT';
  v_key        text;
  v_address_id uuid;
  v_link_id    uuid;
  v_existing   boolean := false;
  v_formatted  text;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_street = '' THEN
    RAISE EXCEPTION 'A rua é obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal = '' THEN
    RAISE EXCEPTION 'O código postal é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  -- Mesmo formato da ficha (POSTAL_CODE_PT_PATTERN / sync_entity_primary_address).
  IF v_postal !~ '^[0-9]{4}-[0-9]{3}$' OR v_postal = '0000-000' THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;
  IF v_city = '' THEN
    RAISE EXCEPTION 'A localidade é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesmo cálculo de address_key que assign_address_to_org.
  v_key :=
    lower(v_street) || '|' ||
    lower(v_number) || '|' ||
    lower(coalesce(v_floor, '')) || '|' ||
    lower(coalesce(v_unit, '')) || '|' ||
    lower(v_postal) || '|' ||
    lower(v_city) || '|' ||
    lower(v_country);

  -- Reutiliza uma morada existente (nunca lhe faz UPDATE); senão cria.
  SELECT a.id INTO v_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_key
  ORDER BY a.created_at
  LIMIT 1;

  IF v_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      street, number, floor, unit, postal_code, city, country, address_key, created_by
    ) VALUES (
      v_street, v_number, v_floor, v_unit, v_postal, v_city, v_country, v_key, v_actor
    )
    RETURNING id INTO v_address_id;
  ELSE
    -- Já ligada a esta entidade como entrega ativa? Devolve a existente.
    SELECT ea.id INTO v_link_id
    FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = p_entity_id
      AND ea.address_id = v_address_id
      AND ea.address_type = 'delivery'
      AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ORDER BY ea.created_at
    LIMIT 1;
    v_existing := v_link_id IS NOT NULL;
  END IF;

  IF v_link_id IS NULL THEN
    INSERT INTO public.anew_entity_addresses (
      entity_id, address_id, address_type, is_primary, is_fiscal, valid_from, created_by
    ) VALUES (
      p_entity_id, v_address_id, 'delivery', false, false, now(), v_actor
    )
    RETURNING id INTO v_link_id;
  END IF;

  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(btrim(a.postal_code), ''),
           nullif(btrim(a.city), '')
         ), '')
    INTO v_formatted
  FROM public.anew_addresses a
  WHERE a.id = v_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', v_link_id,
    'address_id',        v_address_id,
    'formatted',         v_formatted,
    'already_existed',   v_existing
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text) TO authenticated;

-- ─── 4. rpc_remove_entity_delivery_address ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_remove_entity_delivery_address(p_entity_address_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_entity_id uuid;
  v_type      text;
  v_valid_to  timestamptz;
BEGIN
  IF p_entity_address_id IS NULL THEN
    RAISE EXCEPTION 'entity_address_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT ea.entity_id, ea.address_type, ea.valid_to
    INTO v_entity_id, v_type, v_valid_to
  FROM public.anew_entity_addresses ea
  WHERE ea.id = p_entity_address_id
  FOR UPDATE;

  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'Morada não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Permissão antes de revelar o tipo/estado da linha.
  IF NOT public.fn_entity_delivery_address_access(v_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_type IS DISTINCT FROM 'delivery' THEN
    RAISE EXCEPTION 'Só é possível remover moradas de entrega' USING ERRCODE = 'check_violation';
  END IF;

  IF v_valid_to IS NOT NULL AND v_valid_to <= now() THEN
    RAISE EXCEPTION 'Esta morada de entrega já foi removida' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.anew_entity_addresses
     SET valid_to = now()
   WHERE id = p_entity_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', p_entity_address_id,
    'removed',           true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_remove_entity_delivery_address(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_remove_entity_delivery_address(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_remove_entity_delivery_address(uuid) TO authenticated;
