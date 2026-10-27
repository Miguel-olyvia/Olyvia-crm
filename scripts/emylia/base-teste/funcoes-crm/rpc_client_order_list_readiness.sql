CREATE OR REPLACE FUNCTION public.rpc_client_order_list_readiness(p_organization_id uuid, p_contract_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, lines_ready integer, units_ready numeric, units_in_stock_reserved numeric, units_on_po numeric, units_missing numeric, units_served numeric, units_received numeric, units_needed numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesma verificação que rpc_list_client_order_documents.
  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT COALESCE(public.has_anew_permission(v_uid, 'client_orders.view'), false) THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH r AS MATERIALIZED (
    -- Uma só passagem pela reserva FIFO da organização inteira.
    SELECT
      f.contract_id  AS r_contract_id,
      f.product_id   AS r_product_id,
      f.is_served    AS r_is_served,
      COALESCE(f.qty_needed,   0) AS r_needed,
      COALESCE(f.qty_served,   0) AS r_served,
      COALESCE(f.qty_ordered,  0) AS r_ordered,
      COALESCE(f.qty_received, 0) AS r_received,
      COALESCE(f.qty_reserved, 0) AS r_reserved,
      COALESCE(f.qty_missing,  0) AS r_missing
    FROM public.fn_client_order_line_reservations(p_organization_id, NULL) f
  ),
  rc AS (
    -- Contratos da lista (filtros de rpc_list_client_order_documents).
    SELECT cc.id AS rc_contract_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (ARRAY['signed', 'assinado'])
      AND (p_contract_ids IS NULL OR cc.id = ANY (p_contract_ids))
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
      COALESCE(sum(lx.r_needed), 0)                                              AS a_units_needed
    FROM lx
    GROUP BY lx.r_contract_id
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
    COALESCE(a.a_units_needed, 0)::numeric
  FROM rc
  LEFT JOIN agg a ON a.a_contract_id = rc.rc_contract_id;
END;
$function$
