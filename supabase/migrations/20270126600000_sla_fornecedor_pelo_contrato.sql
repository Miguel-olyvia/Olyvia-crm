-- SLA de fornecedores: o prazo é sempre o do contrato (decisão 25/11/2026).
--
--  * fn_supplier_contract_sla_days(fornecedor, data): dias de entrega do contrato assinado que estava em vigor
--    nessa data (inclui versões já substituídas ou expiradas, que foram assinadas). Sem contrato -> NULL.
--  * fn_sp_po_sla (Portal do Fornecedor): prazo = envio ao fornecedor (ou data da encomenda) + dias do contrato.
--    A data prometida pelo fornecedor deixa de contar para o prazo/avisos; continua devolvida como informação.
--  * rpc_get_supplier_sla_orders / rpc_get_supplier_sla_report (relatório do CRM): dias de cada PO = contrato em
--    vigor na data da encomenda (antes: suppliers.delivery_sla_days atual). PO sem contrato = sem SLA (não conta
--    para a percentagem). Os dias continuam a contar desde a data da encomenda.
-- Sem colunas/tabelas novas. Permissões e assinaturas das RPCs iguais.

CREATE OR REPLACE FUNCTION public.fn_supplier_contract_sla_days(p_supplier_id uuid, p_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.delivery_sla_days
  FROM public.supplier_contracts c
  WHERE c.supplier_id = p_supplier_id
    AND c.status IN ('signed', 'expired', 'superseded')
    AND c.delivery_sla_days IS NOT NULL
    AND p_date IS NOT NULL
    AND (c.valid_from IS NULL OR c.valid_from <= p_date)
    AND (c.valid_until IS NULL OR c.valid_until >= p_date)
  ORDER BY c.version DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_supplier_contract_sla_days(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_supplier_contract_sla_days(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_sp_po_sla(p_purchase_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today       date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_supplier    uuid;
  v_order_date  date;
  v_po_status   text;
  v_sent_at     timestamptz;
  v_promised    date;
  v_days        integer;
  v_base        date;
  v_contract    date;
  v_due         date;
  v_source      text;
  v_status      text;
BEGIN
  SELECT po.supplier_id, po.order_date, po.status
    INTO v_supplier, v_order_date, v_po_status
  FROM public.purchase_orders po
  WHERE po.id = p_purchase_order_id;

  SELECT p.sent_at, p.promised_date
    INTO v_sent_at, v_promised
  FROM public.supplier_po_publications p
  WHERE p.purchase_order_id = p_purchase_order_id;

  v_base := COALESCE((v_sent_at AT TIME ZONE 'Europe/Lisbon')::date, v_order_date);

  IF v_supplier IS NOT NULL AND v_base IS NOT NULL THEN
    v_days := public.fn_supplier_contract_sla_days(v_supplier, v_base);
    IF v_days IS NOT NULL THEN
      v_contract := v_base + v_days;
    END IF;
  END IF;

  -- O prazo é só o do contrato; a data prometida não conta.
  IF v_contract IS NOT NULL THEN
    v_due := v_contract;  v_source := 'contract';
  END IF;

  IF v_due IS NOT NULL AND v_po_status IN ('ordered', 'partially_received') THEN
    v_status := CASE WHEN v_today > v_due THEN 'overdue'
                     WHEN v_today >= v_due - 2 THEN 'at_risk'
                     ELSE 'ok' END;
  END IF;

  RETURN jsonb_build_object(
    'due_date', v_due,
    'source', v_source,
    'status', v_status,
    'days_left', CASE WHEN v_status IN ('ok', 'at_risk') THEN v_due - v_today END,
    'days_late', CASE WHEN v_status = 'overdue' THEN v_today - v_due END,
    'contract_days', v_days,
    'promised_date', v_promised,
    'contract_due_date', v_contract
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_orders(p_supplier_id uuid)
 RETURNS TABLE(order_number text, order_date date, expected_delivery date, actual_delivery_date date, delivery_sla_days integer, days_taken integer, is_within_sla boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.organization_id
  INTO v_org
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261130080000): suppliers.view_sla_report exigida ADICIONALMENTE
  -- a suppliers.view + purchase_orders.view (ambos mantidos).
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'suppliers.view', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'suppliers.view_sla_report', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.view', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas deste fornecedor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Prazo de cada PO = contrato em vigor na data da encomenda (20270126600000).
  RETURN QUERY
  SELECT
    x.order_number,
    x.order_date,
    x.expected_delivery,
    x.actual_delivery_date,
    x.sla_days AS delivery_sla_days,
    (x.actual_delivery_date - x.order_date)::integer AS days_taken,
    CASE WHEN x.sla_days IS NULL THEN NULL
         ELSE (x.actual_delivery_date - x.order_date) <= x.sla_days
    END AS is_within_sla
  FROM (
    SELECT po.order_number, po.order_date, po.expected_delivery, po.actual_delivery_date,
           public.fn_supplier_contract_sla_days(po.supplier_id, po.order_date) AS sla_days
    FROM public.purchase_orders po
    WHERE po.supplier_id = p_supplier_id
      AND po.deleted_at IS NULL
      AND po.status = 'received'
      AND po.actual_delivery_date IS NOT NULL
  ) x
  ORDER BY x.actual_delivery_date DESC, x.order_number DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_report(p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(supplier_id uuid, supplier_name text, total_received integer, within_sla integer, over_sla integer, avg_delay_days numeric, compliance_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- NOVO (20261130080000): suppliers.view_sla_report exigida ADICIONALMENTE
  -- a suppliers.view + purchase_orders.view (ambos mantidos).
  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.view')
     OR NOT public.has_anew_permission(auth.uid(), 'suppliers.view_sla_report')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver o relatório de SLA de fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Prazo de cada PO = contrato em vigor na data da encomenda (20270126600000).
  -- PO sem contrato nessa data não conta para dentro/fora/percentagem.
  RETURN QUERY
  WITH base AS (
    SELECT
      s.id                 AS b_supplier_id,
      s.name                AS b_supplier_name
    FROM public.suppliers s
    WHERE s.deleted_at IS NULL
      AND s.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'suppliers.view'))
      AND s.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'suppliers.view_sla_report'))
      AND s.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'purchase_orders.view'))
      AND (p_supplier_id IS NULL OR s.id = p_supplier_id)
  ),
  received AS (
    SELECT
      po.supplier_id           AS r_supplier_id,
      po.order_date             AS r_order_date,
      po.actual_delivery_date   AS r_actual_delivery_date,
      public.fn_supplier_contract_sla_days(po.supplier_id, po.order_date) AS r_sla_days
    FROM public.purchase_orders po
    WHERE po.deleted_at IS NULL
      AND po.status = 'received'
      AND po.actual_delivery_date IS NOT NULL
      AND po.supplier_id IN (SELECT b2.b_supplier_id FROM base b2)
  )
  SELECT
    b.b_supplier_id   AS supplier_id,
    b.b_supplier_name AS supplier_name,
    COUNT(r.r_actual_delivery_date)::integer AS total_received,
    CASE WHEN COUNT(r.r_sla_days) = 0 THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_sla_days IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) <= r.r_sla_days
      )::integer
    END AS within_sla,
    CASE WHEN COUNT(r.r_sla_days) = 0 THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_sla_days IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) > r.r_sla_days
      )::integer
    END AS over_sla,
    CASE WHEN COUNT(r.r_sla_days) = 0 THEN NULL ELSE
      ROUND(
        AVG(r.r_actual_delivery_date - r.r_order_date - r.r_sla_days) FILTER (
          WHERE r.r_sla_days IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) > r.r_sla_days
        ),
        1
      )
    END AS avg_delay_days,
    CASE WHEN COUNT(r.r_sla_days) = 0 THEN NULL ELSE
      ROUND(
        COUNT(*) FILTER (
          WHERE r.r_sla_days IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) <= r.r_sla_days
        )::numeric
        / COUNT(r.r_sla_days) * 100
      )
    END AS compliance_pct
  FROM base b
  LEFT JOIN received r ON r.r_supplier_id = b.b_supplier_id
  GROUP BY b.b_supplier_id, b.b_supplier_name
  ORDER BY b.b_supplier_name;
END;
$function$;
