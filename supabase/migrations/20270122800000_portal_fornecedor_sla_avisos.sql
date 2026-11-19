-- Portal do Fornecedor: avisos de SLA nas encomendas (PO).
-- Só funções (regra do ramo RH: sem tabelas nem colunas novas).
--  * fn_sp_po_sla(uuid): helper interno (sem EXECUTE para anon/authenticated).
--  * sp_list_orders: cada item ganha 'sla'; counts ganha 'sla_alert' e 'sla_overdue'.
--  * sp_get_order: raiz ganha 'sla'.
-- sp_list_orders / sp_get_order recriadas a partir de pg_get_functiondef (ramo RH, 19/11/2026).

-- Calcula o SLA de entrega de uma encomenda (PO) para o Portal do Fornecedor.
-- Data limite = a mais cedo entre:
--   a) prazo contratado (contrato signed e válido hoje em Lisboa, com delivery_sla_days):
--      dia do envio ao fornecedor (sent_at em Europe/Lisbon; sem envio -> order_date) + delivery_sla_days
--   b) data prometida pelo fornecedor (supplier_po_publications.promised_date)
-- Empate -> 'contract'. Estado só para encomendas por entregar (ordered / partially_received).
-- Uso interno: só é chamada pelas sp_* que já validam o acesso do fornecedor.
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

  IF v_supplier IS NOT NULL THEN
    SELECT c.delivery_sla_days
      INTO v_days
    FROM public.supplier_contracts c
    WHERE c.supplier_id = v_supplier
      AND c.status = 'signed'
      AND (c.valid_until IS NULL OR c.valid_until >= v_today)
      AND c.delivery_sla_days IS NOT NULL
    ORDER BY c.version DESC
    LIMIT 1;
  END IF;

  IF v_days IS NOT NULL THEN
    v_base := COALESCE((v_sent_at AT TIME ZONE 'Europe/Lisbon')::date, v_order_date);
    IF v_base IS NOT NULL THEN
      v_contract := v_base + v_days;
    END IF;
  END IF;

  IF v_contract IS NOT NULL AND (v_promised IS NULL OR v_contract <= v_promised) THEN
    v_due := v_contract;  v_source := 'contract';
  ELSIF v_promised IS NOT NULL THEN
    v_due := v_promised;  v_source := 'promised';
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

REVOKE ALL ON FUNCTION public.fn_sp_po_sla(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_po_sla(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sp_list_orders(p_org_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'all');
  v_q      text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like   text;
  v_counts jsonb;
  v_total  integer;
  v_items  jsonb;
BEGIN
  IF v_status NOT IN ('all', 'to_confirm', 'confirmed', 'open', 'received', 'cancelled') THEN
    RAISE EXCEPTION 'Filtro de estado inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  SELECT jsonb_build_object(
           'all', count(*),
           'to_confirm', count(*) FILTER (WHERE pub_status IN ('sent', 'viewed') AND order_status IN ('ordered', 'partially_received')),
           'confirmed', count(*) FILTER (WHERE pub_status = 'confirmed'),
           'open', count(*) FILTER (WHERE order_status IN ('ordered', 'partially_received')),
           'received', count(*) FILTER (WHERE order_status = 'received'),
           'cancelled', count(*) FILTER (WHERE order_status = 'cancelled'),
           'sla_alert', count(*) FILTER (WHERE sla_status IN ('at_risk', 'overdue')),
           'sla_overdue', count(*) FILTER (WHERE sla_status = 'overdue'))
  INTO v_counts
  FROM public.fn_sp_orders_visible(u.id, p_org_id, v_like) z
  CROSS JOIN LATERAL (
    SELECT CASE WHEN z.order_status IN ('ordered', 'partially_received')
                THEN public.fn_sp_po_sla(z.purchase_order_id) ->> 'status' END AS sla_status
  ) s;

  v_total := (v_counts ->> CASE WHEN v_status = 'all' THEN 'all' ELSE v_status END)::integer;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_id', v.purchase_order_id,
           'order_number', v.order_number,
           'organization', jsonb_build_object('id', v.organization_id, 'name', v.org_name, 'logo_url', v.org_logo),
           'order_date', v.order_date,
           'expected_delivery', v.expected_delivery,
           'order_status', v.order_status,
           'publication_status', v.pub_status,
           'revision', v.revision,
           'sent_at', v.sent_at,
           'viewed_at', v.viewed_at,
           'confirmed_at', v.confirmed_at,
           'promised_date', v.promised_date,
           'lines', t.n,
           'subtotal', t.subtotal,
           'vat_total', t.vat_total,
           'total', t.subtotal + t.vat_total,
           'currency', 'EUR',
           'can_confirm', v.pub_status IN ('sent', 'viewed') AND v.order_status IN ('ordered', 'partially_received'),
           'sla', public.fn_sp_po_sla(v.purchase_order_id)
         ) ORDER BY v.sent_at DESC, v.purchase_order_id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT * FROM public.fn_sp_orders_visible(u.id, p_org_id, v_like) z
    WHERE v_status = 'all'
       OR (v_status = 'to_confirm' AND z.pub_status IN ('sent', 'viewed') AND z.order_status IN ('ordered', 'partially_received'))
       OR (v_status = 'confirmed' AND z.pub_status = 'confirmed')
       OR (v_status = 'open' AND z.order_status IN ('ordered', 'partially_received'))
       OR (v_status = 'received' AND z.order_status = 'received')
       OR (v_status = 'cancelled' AND z.order_status = 'cancelled')
    ORDER BY z.sent_at DESC, z.purchase_order_id
    LIMIT v_limit OFFSET v_offset
  ) v
  CROSS JOIN LATERAL (
    SELECT count(*) AS n,
           round(COALESCE(sum(i.unit_price * i.quantity), 0), 2) AS subtotal,
           round(COALESCE(sum(COALESCE(i.vat_amount, 0)), 0), 2) AS vat_total
    FROM public.purchase_order_items i
    WHERE i.purchase_order_id = v.purchase_order_id
  ) t;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset,
                            'counts', v_counts, 'items', v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sp_get_order(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_pub    public.supplier_po_publications := public.fn_sp_po_publication(p_po_id, u.id);
  v_po     public.purchase_orders;
  v_org    public.anew_organizations;
  v_sup    record;
  v_snd    record;
  v_nif    text;
  v_addr   text;
  v_lines  jsonb;
  v_tot    record;
BEGIN
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_pub.purchase_order_id;
  SELECT * INTO v_org FROM public.anew_organizations WHERE id = v_po.organization_id;
  SELECT name, tax_id, email, phone INTO v_sup FROM public.suppliers WHERE id = v_po.supplier_id;
  SELECT name, email, phone INTO v_snd FROM public.anew_users WHERE id = v_pub.sent_by;

  SELECT fe.nif INTO v_nif
  FROM public.anew_entity_fiscal_entities efe
  JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
  WHERE efe.entity_id = v_org.entity_id AND (efe.valid_to IS NULL OR efe.valid_to > now())
  ORDER BY efe.is_primary DESC NULLS LAST, efe.created_at DESC
  LIMIT 1;

  SELECT concat_ws(', ', NULLIF(concat_ws(' ', a.street, a.number), ''), NULLIF(concat_ws(' ', a.postal_code, a.city), ''), a.country)
  INTO v_addr
  FROM public.anew_entity_addresses ea
  JOIN public.anew_addresses a ON a.id = ea.address_id
  WHERE ea.entity_id = v_org.entity_id AND (ea.valid_to IS NULL OR ea.valid_to > now())
  ORDER BY ea.is_fiscal DESC NULLS LAST, ea.is_primary DESC NULLS LAST, ea.created_at DESC
  LIMIT 1;

  v_lines := public.fn_sp_po_lines_json(v_po.id);
  SELECT round(COALESCE(sum(i.unit_price * i.quantity), 0), 2) AS subtotal,
         round(COALESCE(sum(COALESCE(i.vat_amount, 0)), 0), 2) AS vat_total
  INTO v_tot
  FROM public.purchase_order_items i WHERE i.purchase_order_id = v_po.id;

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'order_number', v_po.order_number,
    'order_date', v_po.order_date,
    'expected_delivery', v_po.expected_delivery,
    'order_status', v_po.status,
    'supplier_notes', v_po.supplier_notes,
    'currency', 'EUR',
    'publication', jsonb_build_object(
      'status', v_pub.status,
      'revision', v_pub.revision,
      'sent_at', v_pub.sent_at,
      'viewed_at', v_pub.viewed_at,
      'confirmed_at', v_pub.confirmed_at,
      'confirmed_by_name', (SELECT COALESCE(name, email) FROM public.supplier_portal_users WHERE id = v_pub.confirmed_by),
      'promised_date', v_pub.promised_date,
      'supplier_comment', v_pub.supplier_comment,
      'promised_date_accepted', v_pub.promised_date_accepted_at IS NOT NULL),
    'can_confirm', v_pub.status IN ('sent', 'viewed') AND v_po.status IN ('ordered', 'partially_received'),
    'sla', public.fn_sp_po_sla(v_po.id),
    'company', jsonb_build_object(
      'organization_id', v_org.id, 'name', v_org.name, 'nif', v_nif, 'address', NULLIF(v_addr, ''),
      'phone', v_org.phone, 'logo_url', v_org.logo_url),
    'supplier', jsonb_build_object('name', v_sup.name, 'tax_id', v_sup.tax_id, 'email', v_sup.email, 'phone', v_sup.phone),
    'sent_by', CASE WHEN v_pub.sent_by IS NULL THEN NULL
                    ELSE jsonb_build_object('name', v_snd.name, 'email', v_snd.email, 'phone', v_snd.phone) END,
    'lines', v_lines,
    'totals', jsonb_build_object('subtotal', v_tot.subtotal, 'vat_total', v_tot.vat_total,
                                 'total', v_tot.subtotal + v_tot.vat_total)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_list_orders(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_list_orders(uuid, text, text, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.sp_get_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_get_order(uuid) TO authenticated, service_role;
