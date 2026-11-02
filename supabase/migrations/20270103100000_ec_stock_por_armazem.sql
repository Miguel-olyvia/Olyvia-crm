-- ============================================================
-- 20270103100000_ec_stock_por_armazem
-- ============================================================
-- O que faz: as Encomendas de Cliente (EC) passam a reservar, dar baixa e
--   pedir ao fornecedor por ARMAZÉM, calculado na hora a partir das
--   existências (sem tabelas nem colunas novas).
--
-- Regra (por EC, pela ordem FIFO que já existia — assinatura, contrato — e
-- consumindo o stock livre por armazém deixado pelas EC anteriores):
--   * armazéns elegíveis: ativos, serves_customers, não apagados, não viatura
--     (fn_client_order_warehouses);
--   1. se um armazém cobre TODAS as linhas pendentes da EC, reserva-se tudo
--      dele; se vários cobrem: o mais próximo da morada da EC (coordenadas do
--      armazém, senão do CP do armazém, e do CP da morada pela cache
--      postal_codes); sem coordenadas: o armazém por omissão se for elegível;
--      senão o com mais stock livre; desempate por nome, id;
--   2. se nenhum cobre tudo: linha a linha — o armazém que cobre a linha (mesma
--      ordem de escolha); senão reparte-se (mais stock livre primeiro). O que
--      faltar fica em falta (qty_missing) e é pedido ao fornecedor. Sem
--      transferências automáticas;
--   3. determinístico; a saída real (stock_movements.warehouse_id) fixa.
--   O total reservado por linha é o mesmo de antes (cada linha leva
--   min(pendente, stock livre total)); muda só de onde sai. Diferenças: o
--   stock em viaturas deixa de contar; um armazém com stock negativo já não
--   abate o stock positivo de outro.
--
-- Funções novas: fn_normalize_pt_postal_code, fn_postal_code_coords,
--   fn_client_order_coords, fn_client_order_warehouses,
--   fn_client_order_line_reservations_wh (motor),
--   rpc_confirm_client_order_stock_exit_split (saída repartida por armazéns).
-- Funções alteradas (a partir do pg_get_functiondef vivo da BD RH, marcado
--   "NOVO (EC por armazém)"):
--   fn_client_order_line_reservations (passa a invólucro do motor, mesma
--     assinatura e colunas), fn_contract_deduct_stock,
--   fn_client_order_request_missing, rpc_get_client_order_document,
--   rpc_confirm_client_order_stock_exit (recusa viaturas),
--   rpc_client_order_list_readiness (DROP + CREATE: 4 colunas no fim).
-- Permissões: todas as verificações existentes mantêm-se; funções internas só
--   para service_role; RPCs para authenticated como antes.
-- Reversão (só como migration nova): repor as definições anteriores a partir
--   do histórico (schema_migrations) e DROP das funções novas.
-- ============================================================
SET lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. Código postal → coordenadas (cache postal_codes; a BD nunca chama APIs)
-- ------------------------------------------------------------
-- CP português normalizado 'NNNN-NNN' (ou 'NNNN'). Em texto livre procura o
-- primeiro 'NNNN-NNN'.
CREATE OR REPLACE FUNCTION public.fn_normalize_pt_postal_code(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m text[];
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  m := regexp_match(p_value, '^\s*(\d{4})\s*-?\s*(\d{3})?\s*$');
  IF m IS NULL THEN
    m := regexp_match(p_value, '(?:^|\D)(\d{4})\s?-\s?(\d{3})(?!\d)');
  END IF;
  IF m IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN CASE WHEN m[2] IS NULL THEN m[1] ELSE m[1] || '-' || m[2] END;
END;
$function$;

-- Coordenadas de um CP: CP7 exato; senão a média do CP4. Sem linha → nada.
CREATE OR REPLACE FUNCTION public.fn_postal_code_coords(p_postal_code text)
 RETURNS TABLE(lat numeric, lon numeric, cp_used text, cp_precision text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cp  text := public.fn_normalize_pt_postal_code(p_postal_code);
  v_cp4 text;
  v_cp3 text;
  v_lat numeric;
  v_lon numeric;
BEGIN
  IF v_cp IS NULL THEN
    RETURN;
  END IF;
  v_cp4 := split_part(v_cp, '-', 1);
  v_cp3 := nullif(split_part(v_cp, '-', 2), '');

  IF v_cp3 IS NOT NULL THEN
    SELECT pc.latitude, pc.longitude
      INTO v_lat, v_lon
    FROM public.postal_codes pc
    WHERE pc.postal_code = v_cp4
      AND pc.postal_code_extension = v_cp3
      AND pc.latitude IS NOT NULL
      AND pc.longitude IS NOT NULL
      AND pc.is_active IS NOT FALSE
    ORDER BY pc.id
    LIMIT 1;

    IF v_lat IS NOT NULL THEN
      RETURN QUERY SELECT v_lat, v_lon, v_cp, 'cp7'::text;
      RETURN;
    END IF;
  END IF;

  SELECT avg(pc.latitude), avg(pc.longitude)
    INTO v_lat, v_lon
  FROM public.postal_codes pc
  WHERE pc.postal_code = v_cp4
    AND pc.latitude IS NOT NULL
    AND pc.longitude IS NOT NULL
    AND pc.is_active IS NOT FALSE;

  IF v_lat IS NOT NULL THEN
    RETURN QUERY SELECT v_lat, v_lon, v_cp, 'cp4'::text;
  END IF;
END;
$function$;

-- Coordenadas da morada de uma EC. O CP vem, por esta ordem (o primeiro que
-- existir decide, como a morada de entrega do documento da EC):
--   1. morada gravada na encomenda (client_contracts.delivery_address);
--   2. morada estruturada da obra do orçamento (quotes.site_address_id);
--   3. morada da obra em texto (quotes.obra_endereco);
--   4. morada principal do cliente (anew_entity_addresses válida).
-- Sem CP ou CP fora da cache → nada.
CREATE OR REPLACE FUNCTION public.fn_client_order_coords(p_contract_id uuid)
 RETURNS TABLE(lat numeric, lon numeric, cp_used text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_delivery text;
  v_entity   uuid;
  v_quote_id uuid;
  v_site     text;
  v_obra     text;
  v_cp       text;
BEGIN
  SELECT cc.delivery_address, cc.entity_id,
         COALESCE(
           cc.quote_id,
           (SELECT q2.id FROM public.quotes q2
             WHERE q2.proposal_id = cc.proposal_id
             ORDER BY q2.created_at DESC
             LIMIT 1)
         )
    INTO v_delivery, v_entity, v_quote_id
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id;

  v_cp := public.fn_normalize_pt_postal_code(nullif(btrim(v_delivery), ''));

  IF v_cp IS NULL AND v_quote_id IS NOT NULL THEN
    SELECT a.postal_code, q.obra_endereco, COALESCE(v_entity, q.entity_id)
      INTO v_site, v_obra, v_entity
    FROM public.quotes q
    LEFT JOIN public.anew_addresses a ON a.id = q.site_address_id
    WHERE q.id = v_quote_id;

    v_cp := COALESCE(public.fn_normalize_pt_postal_code(v_site),
                     public.fn_normalize_pt_postal_code(v_obra));
  END IF;

  IF v_cp IS NULL AND v_entity IS NOT NULL THEN
    SELECT public.fn_normalize_pt_postal_code(a.postal_code)
      INTO v_cp
    FROM public.anew_entity_addresses ea
    JOIN public.anew_addresses a ON a.id = ea.address_id
    WHERE ea.entity_id = v_entity
      AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ORDER BY ea.is_primary DESC NULLS LAST, ea.created_at DESC, ea.id
    LIMIT 1;
  END IF;

  IF v_cp IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.lat, c.lon, c.cp_used
  FROM public.fn_postal_code_coords(v_cp) c
  LIMIT 1;
END;
$function$;

-- ------------------------------------------------------------
-- 2. Armazéns elegíveis para EC (ativos, servem clientes, não apagados, não
--    viatura), com coordenadas (as da ficha; senão as do CP do armazém) e se
--    são o armazém por omissão da organização. Ordem estável: nome, id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_client_order_warehouses(p_org uuid)
 RETURNS TABLE(warehouse_id uuid, warehouse_name text, lat numeric, lon numeric, is_default boolean, sort_order bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT w.id,
         w.name,
         CASE WHEN w.latitude IS NOT NULL AND w.longitude IS NOT NULL THEN w.latitude ELSE pc.lat END,
         CASE WHEN w.latitude IS NOT NULL AND w.longitude IS NOT NULL THEN w.longitude ELSE pc.lon END,
         (w.id = ois.default_warehouse_id) IS TRUE,
         row_number() OVER (ORDER BY COALESCE(w.name, ''), w.id)
  FROM public.warehouses w
  LEFT JOIN public.organization_inventory_settings ois ON ois.organization_id = w.organization_id
  LEFT JOIN LATERAL (
    SELECT c.lat, c.lon
    FROM public.fn_postal_code_coords(w.postal_code) c
    WHERE w.latitude IS NULL OR w.longitude IS NULL
    LIMIT 1
  ) pc ON true
  WHERE w.organization_id = p_org
    AND w.deleted_at IS NULL
    AND w.is_active = true
    AND w.serves_customers = true
    AND COALESCE(w.is_vehicle, false) = false
  ORDER BY COALESCE(w.name, ''), w.id;
$function$;

-- ------------------------------------------------------------
-- 3. Motor: reserva das EC por armazém.
--    Mesmas colunas que fn_client_order_line_reservations e, no fim:
--      warehouse_id    — armazém sugerido para a linha (o da maior parcela
--                        reservada); NULL sem reserva;
--      warehouse_alloc — [{warehouse_id, warehouse_name, qty}] (qty em
--                        unidades base; soma = qty_reserved), maior primeiro;
--      ec_warehouse_id — armazém da EC: o único se ec_plan='single'; senão o
--                        com mais reservado; sem reserva, o mais próximo /
--                        por omissão / primeiro por nome (sugestão para
--                        receção de POs);
--      ec_plan         — 'single' (um armazém cobre tudo o pendente),
--                        'split' (tudo coberto, por mais de um armazém),
--                        'partial' (há falta), 'none' (nada pendente).
--    As partes até step4/served são as da versão viva, sem o filtro de
--    produtos (a EC é decidida inteira); a fila FIFO por produto (f_reserved)
--    é substituída pelo ciclo por EC abaixo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations_wh(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint, is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric, qty_received numeric, qty_reserved numeric, qty_missing numeric, warehouse_id uuid, warehouse_alloc jsonb, ec_warehouse_id uuid, ec_plan text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  -- linhas (ordem FIFO: assinatura, contrato, linha, componente)
  b_contract uuid[];
  b_ql       uuid[];
  b_comp     integer[];
  b_prod     uuid[];
  b_seq      bigint[];
  b_done     boolean[];
  b_sold     boolean[];
  b_need     numeric[];
  b_served   numeric[];
  b_ordered  numeric[];
  b_received numeric[];
  b_rem      numeric[];
  b_queued   boolean[];
  b_missing  numeric[];
  n          integer;
  -- armazéns elegíveis (ordem nome, id)
  w_ids      uuid[];
  w_names    text[];
  w_lat      numeric[];
  w_lon      numeric[];
  w_def      boolean[];
  w_cnt      integer;
  w_coords   boolean;
  -- stock livre: chave armazém||produto
  v_free     jsonb;
  -- resultado por linha
  a_res      numeric[];
  a_alloc    jsonb[];
  -- ciclo
  i          integer := 1;
  j          integer;
  k          integer;
  v_dem      jsonb;
  v_best     integer;
  v_need     numeric;
  v_take     numeric;
  v_f        numeric;
  v_key      text;
  v_dist     numeric[];
  v_ec_lat   numeric;
  v_ec_lon   numeric;
  v_plan     text;
  v_ecw      uuid;
  v_partial  boolean;
  v_nwh      integer;
  v_e        record;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(cw.warehouse_id ORDER BY cw.sort_order),
         array_agg(cw.warehouse_name ORDER BY cw.sort_order),
         array_agg(cw.lat ORDER BY cw.sort_order),
         array_agg(cw.lon ORDER BY cw.sort_order),
         array_agg(cw.is_default ORDER BY cw.sort_order)
    INTO w_ids, w_names, w_lat, w_lon, w_def
  FROM public.fn_client_order_warehouses(p_organization_id) cw;

  w_cnt := COALESCE(cardinality(w_ids), 0);
  w_coords := w_cnt > 1 AND EXISTS (
    SELECT 1 FROM unnest(w_lat, w_lon) u(la, lo) WHERE u.la IS NOT NULL AND u.lo IS NOT NULL
  );

  WITH contracts AS (
    SELECT
      cc.id AS c_id,
      COALESCE(cc.signature_date, cc.status_changed_at, cc.created_at) AS c_sort_ts,
      COALESCE(
        cc.quote_id,
        (
          SELECT q2.id
          FROM public.quotes q2
          WHERE q2.proposal_id = cc.proposal_id
          ORDER BY q2.created_at DESC
          LIMIT 1
        )
      ) AS c_quote_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status IN ('signed', 'assinado')
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado
  ),
  lines AS (
    SELECT
      c.c_id                AS l_contract_id,
      c.c_sort_ts           AS l_sort_ts,
      ql.id                 AS l_quote_line_id,
      NULL::integer         AS l_component_index,
      ql.product_id         AS l_product_id,
      GREATEST(COALESCE(ql.qt * COALESCE(ql.units_per_uom, 1), 0), 0)::numeric AS l_qty_needed
    FROM contracts c
    JOIN public.quote_lines ql ON ql.quote_id = c.c_quote_id
    JOIN public.products p ON p.id = ql.product_id
    WHERE ql.product_id IS NOT NULL
      -- NOVO (EC por armazém): sem filtro de produto — a escolha do armazém olha
      -- para a EC inteira; o filtro de produtos só se aplica ao que se devolve.

    UNION ALL

    SELECT
      c.c_id,
      c.c_sort_ts,
      ql.id,
      comp.ord::integer,
      p.id,
      GREATEST(COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1), 0)::numeric
    FROM contracts c
    JOIN public.quote_lines ql
      ON ql.quote_id = c.c_quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
      WITH ORDINALITY AS comp(value, ord)
    JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
    WHERE comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
      -- NOVO (EC por armazém): sem filtro de produto (ver acima).
  ),
  -- NOVO (serve clientes): a reserva só conta stock de armazéns ativos que
  -- servem clientes (os_qty). A dívida de stock (s1_stock_debt) continua
  -- sobre todos os armazéns não apagados, como antes (os_qty_all).
  org_stock AS (
    SELECT s.product_id AS os_product_id,
           COALESCE(SUM(s.quantity) FILTER (WHERE w.is_active = true AND w.serves_customers = true), 0)::numeric AS os_qty,  -- NOVO (serve clientes)
           SUM(s.quantity)::numeric AS os_qty_all  -- NOVO (serve clientes)
    FROM public.stocks s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.deleted_at IS NULL
      AND w.organization_id = p_organization_id
      AND w.deleted_at IS NULL
      AND s.product_id IN (SELECT l.l_product_id FROM lines l)
    GROUP BY s.product_id
  ),
  sold AS (
    SELECT
      sm.sale_source_id AS sd_contract_id,
      sm.reference_id   AS sd_quote_line_id,
      sm.product_id     AS sd_product_id,
      SUM(LEAST(sm.quantity, GREATEST(0, -sm.balance_after)))::numeric AS sd_short,
      -- NOVO (20261204630000): quantidade realmente vendida (unidades base,
      -- como l_qty_needed). A dedução passou a poder ser parcial.
      SUM(sm.quantity)::numeric AS sd_qty
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.movement_type = 'venda'
      AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
    GROUP BY sm.sale_source_id, sm.reference_id, sm.product_id
  ),
  exits AS (
    SELECT
      sm.sale_source_id AS ex_contract_id,
      sm.product_id     AS ex_product_id,
      SUM(sm.quantity)::numeric AS ex_qty
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.movement_type = 'saida'
      AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
    GROUP BY sm.sale_source_id, sm.product_id
  ),
  po_items AS (
    SELECT
      po.source_id         AS pi_contract_id,
      poi.product_id       AS pi_product_id,
      poi.quote_line_id    AS pi_quote_line_id,
      poi.component_index  AS pi_component_index,
      (poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS pi_qty,
      -- NOVO (20261206130000): só conta como recebido pela EC o que não
      -- entrou em stock (received_to_stock_units, unidades de stock).
      GREATEST(0,
        CASE WHEN po.status = 'received' THEN poi.quantity
             ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
        END * COALESCE(poi.units_per_uom, 1)
        - COALESCE(poi.received_to_stock_units, 0)
      )::numeric AS pi_recv
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id IN (SELECT c.c_id FROM contracts c)
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id IS NOT NULL
  ),
  po_linked AS (
    SELECT pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id,
           SUM(pi_qty) AS pl_qty, SUM(pi_recv) AS pl_recv
    FROM po_items
    WHERE pi_quote_line_id IS NOT NULL
    GROUP BY pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id
  ),
  po_pool AS (
    SELECT pi_contract_id, pi_product_id,
           SUM(pi_qty) AS pp_qty, SUM(pi_recv) AS pp_recv
    FROM po_items
    WHERE pi_quote_line_id IS NULL
    GROUP BY pi_contract_id, pi_product_id
  ),
  -- NOVO (anulado): quantidade anulada (rpc_cancel_po_line_remainder /
  -- rpc_cancel_po_remainder) e não desfeita = deixa de ser recebida e deixa de
  -- ser necessária na EC (não vai à reserva FIFO nem a qty_missing). Unidades
  -- base (× units_per_uom da linha da PO). Conta qualquer que seja o estado da
  -- PO (uma PO com tudo anulado fica 'cancelled'); POs apagadas não contam;
  -- anulações cuja linha da PO já não existe (purchase_order_item_id NULL)
  -- não se conseguem ligar e não contam.
  cancels AS (
    SELECT
      po.source_id         AS ca_contract_id,
      poi.product_id       AS ca_product_id,
      poi.quote_line_id    AS ca_quote_line_id,
      poi.component_index  AS ca_component_index,
      (c.quantity_cancelled * COALESCE(poi.units_per_uom, 1))::numeric AS ca_qty
    FROM public.purchase_order_item_cancellations c
    JOIN public.purchase_order_items poi ON poi.id = c.purchase_order_item_id
    JOIN public.purchase_orders po ON po.id = c.purchase_order_id
    WHERE c.organization_id = p_organization_id
      AND c.undone_at IS NULL
      AND c.quantity_cancelled > 0
      AND po.source_type = 'contract'
      AND po.source_id IN (SELECT c2.c_id FROM contracts c2)
      AND po.deleted_at IS NULL
      AND poi.product_id IS NOT NULL
      AND poi.product_id IN (SELECT l.l_product_id FROM lines l)
  ),
  ca_linked AS (
    SELECT ca_contract_id, ca_quote_line_id, ca_component_index, ca_product_id,
           SUM(ca_qty) AS cl_qty
    FROM cancels
    WHERE ca_quote_line_id IS NOT NULL
    GROUP BY ca_contract_id, ca_quote_line_id, ca_component_index, ca_product_id
  ),
  ca_pool AS (
    SELECT ca_contract_id, ca_product_id, SUM(ca_qty) AS cp_qty
    FROM cancels
    WHERE ca_quote_line_id IS NULL
    GROUP BY ca_contract_id, ca_product_id
  ),
  step1 AS (
    SELECT
      l.*,
      COALESCE(l.l_component_index, 0)                          AS s1_comp_key,
      (sd.sd_contract_id IS NOT NULL)                           AS s1_is_sold,
      COALESCE(sd.sd_short, 0)                                  AS s1_short_at_sale,
      COALESCE(sd.sd_qty, 0)                                    AS s1_sold_qty,  -- NOVO (20261204630000)
      (ex.ex_contract_id IS NOT NULL)                           AS s1_has_exit,
      COALESCE(ex.ex_qty, 0)                                    AS s1_exit_pool,
      LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))             AS s1_linked_qty,
      LEAST(COALESCE(pl.pl_recv, 0), l.l_qty_needed, COALESCE(pl.pl_qty, 0)) AS s1_linked_recv,
      COALESCE(pp.pp_qty, 0)                                    AS s1_pool_qty,
      COALESCE(pp.pp_recv, 0)                                   AS s1_pool_recv,
      GREATEST(0, COALESCE(os.os_qty, 0))                       AS s1_stock,
      GREATEST(0, -COALESCE(os.os_qty_all, 0))                  AS s1_stock_debt,  -- NOVO (serve clientes): os_qty_all
      -- NOVO (anulado): anulação ligada à linha, até ao que a linha ainda
      -- precisa depois da parte ligada encomendada. Limitação conhecida: uma PO
      -- manual sem quote_line_id criada depois da anulação não é atribuída a
      -- esta linha (o "Pedir em falta" cria sempre linhas ligadas).
      LEAST(COALESCE(cl.cl_qty, 0),
            l.l_qty_needed - LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))) AS s1_linked_cancel,
      COALESCE(cp.cp_qty, 0)                                    AS s1_pool_cancel
    FROM lines l
    LEFT JOIN sold sd
      ON sd.sd_contract_id   = l.l_contract_id
     AND sd.sd_quote_line_id = l.l_quote_line_id
     AND sd.sd_product_id    = l.l_product_id
     AND l.l_component_index IS NULL
    LEFT JOIN exits ex
      ON ex.ex_contract_id = l.l_contract_id
     AND ex.ex_product_id  = l.l_product_id
    LEFT JOIN po_linked pl
      ON pl.pi_contract_id   = l.l_contract_id
     AND pl.pi_quote_line_id = l.l_quote_line_id
     AND pl.pi_component_index IS NOT DISTINCT FROM l.l_component_index
     AND pl.pi_product_id    = l.l_product_id
    LEFT JOIN po_pool pp
      ON pp.pi_contract_id = l.l_contract_id
     AND pp.pi_product_id  = l.l_product_id
    LEFT JOIN org_stock os
      ON os.os_product_id = l.l_product_id
    LEFT JOIN ca_linked cl
      ON cl.ca_contract_id   = l.l_contract_id
     AND cl.ca_quote_line_id = l.l_quote_line_id
     AND cl.ca_component_index IS NOT DISTINCT FROM l.l_component_index
     AND cl.ca_product_id    = l.l_product_id
    LEFT JOIN ca_pool cp
      ON cp.ca_contract_id = l.l_contract_id
     AND cp.ca_product_id  = l.l_product_id
  ),
  -- Repartição do pool de itens de PO sem ligação por (contrato, produto).
  step2 AS (
    SELECT
      s.*,
      -- NOVO (anulado): - s1_linked_cancel (0 sem anulações ligadas).
      LEAST(
        s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel,
        GREATEST(0, s.s1_pool_qty - COALESCE(SUM(s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s2_pool_alloc
    FROM step1 s
  ),
  -- NOVO (anulado): anulação de linhas de PO sem ligação, repartida por
  -- (contrato, produto) na MESMA ordem do pool (seq), a seguir à parte
  -- encomendada — equivale a repartir o pool original (antes da anulação) e
  -- dar a parte anulada às últimas unidades que ele cobria.
  -- s2c_need = necessidade efetiva (necessária − anulada). Sem anulações
  -- s2c_cancel = 0 e s2c_need = l_qty_needed.
  step2c AS (
    SELECT
      x.*,
      x.s1_linked_cancel + x.s2c_pool_cancel                  AS s2c_cancel,
      x.l_qty_needed - x.s1_linked_cancel - x.s2c_pool_cancel AS s2c_need
    FROM (
      SELECT
        s.*,
        LEAST(
          s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel - s.s2_pool_alloc,
          GREATEST(0, s.s1_pool_cancel - COALESCE(SUM(
            s.l_qty_needed - s.s1_linked_qty - s.s1_linked_cancel - s.s2_pool_alloc
          ) OVER (
            PARTITION BY s.l_contract_id, s.l_product_id
            ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0))
        ) AS s2c_pool_cancel
      FROM step2 s
    ) x
  ),
  -- Parte recebida do pool e repartição das saídas manuais.
  -- NOVO (anulado): daqui em diante a necessidade é s2c_need.
  step3 AS (
    SELECT
      s.*,
      s.s1_linked_qty + s.s2_pool_alloc AS s3_ordered,
      LEAST(
        s.s2_pool_alloc,
        GREATEST(0, s.s1_pool_recv - COALESCE(SUM(s.s2_pool_alloc) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_pool_recv_alloc,
      LEAST(
        CASE WHEN s.s1_is_sold THEN 0
             ELSE s.s2c_need - s.s1_linked_qty - s.s2_pool_alloc END,
        GREATEST(0, s.s1_exit_pool - COALESCE(SUM(
          CASE WHEN s.s1_is_sold THEN 0
               ELSE s.s2c_need - s.s1_linked_qty - s.s2_pool_alloc END
        ) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_exit_alloc
    FROM step2c s
  ),
  -- Quantidade ainda por cobrir das linhas pendentes (entra na fila).
  step4 AS (
    SELECT
      s.*,
      CASE WHEN s.s1_is_sold OR s.s1_has_exit THEN 0
           ELSE GREATEST(0, s.s2c_need - s.s3_ordered) END AS s4_rem
    FROM step3 s
  ),
  -- Fila por produto (window) — reserva do stock livre por ordem.
  step5 AS (
    SELECT
      s.*,
      row_number() OVER w_prod AS s5_seq,
      SUM(s.s4_rem) OVER (w_prod ROWS UNBOUNDED PRECEDING) AS s5_cum_rem
    FROM step4 s
    WINDOW w_prod AS (
      PARTITION BY s.l_product_id
      ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
    )
  ),
  -- NOVO (EC por armazém): a reserva (antes f_reserved, FIFO por produto sobre
  -- o total da organização) passa a ser feita a seguir, por EC e por armazém.
  final AS (
    SELECT s.*
    FROM step5 s
  ),
  -- NOVO (20261204340000): quantidade realmente servida por stock e
  -- recebida do fornecedor, por linha.
  --  * venda automática: servida = necessária menos a parte que ficou a
  --    descoberto no momento da venda (e continua em dívida no stock);
  --    NOVO (20261204630000): limitada à quantidade realmente vendida
  --    (LEAST(necessária, vendida)) — a dedução pode ser parcial. Com
  --    vendida = necessária (todas as vendas anteriores) é igual a antes;
  --  * saída manual: a saída do (contrato, produto) é repartida pelas linhas
  --    por ordem (seq) até à quantidade realmente saída (s3_exit_alloc) — uma
  --    saída pequena já não serve todas as linhas;
  --  * a receção de POs de contrato não entra em stock (vai direto à
  --    encomenda), por isso a parte recebida conta como entregue.
  --    NOVO (20261206130000): exceto a parte que entrou em stock
  --    (excedente / EC inativa / passagem para stock), descontada em pi_recv.
  served AS (
    SELECT
      f.*,
      CASE
        WHEN f.s1_is_sold THEN
          GREATEST(0, LEAST(f.s2c_need, f.s1_sold_qty)
                      - LEAST(f.s2c_need, f.s1_short_at_sale, f.s1_stock_debt))  -- NOVO (20261204630000); anulado: s2c_need
        WHEN f.s1_has_exit THEN f.s3_exit_alloc
        ELSE 0
      END::numeric AS sv_served,
      (f.s1_linked_recv + f.s3_pool_recv_alloc)::numeric AS sv_received
    FROM final f
  )

  SELECT
    array_agg(f.l_contract_id     ORDER BY f.o),
    array_agg(f.l_quote_line_id   ORDER BY f.o),
    array_agg(f.l_component_index ORDER BY f.o),
    array_agg(f.l_product_id      ORDER BY f.o),
    array_agg(f.s5_seq            ORDER BY f.o),
    -- is_served = linha concluída (igual à versão viva)
    array_agg(((f.sv_served + f.sv_received) >= f.s2c_need
               AND (f.s2c_need > 0 OR f.s1_is_sold OR f.s1_has_exit OR f.s2c_cancel > 0)) ORDER BY f.o),
    array_agg(f.s1_is_sold        ORDER BY f.o),
    array_agg(f.s2c_need          ORDER BY f.o),
    array_agg(f.sv_served         ORDER BY f.o),
    array_agg(f.s3_ordered        ORDER BY f.o),
    array_agg(f.sv_received       ORDER BY f.o),
    array_agg(f.s4_rem            ORDER BY f.o),
    -- Linhas com venda/saída não entram na fila (como antes).
    array_agg(NOT (f.s1_is_sold OR f.s1_has_exit) ORDER BY f.o),
    array_agg(CASE
                WHEN f.s1_is_sold THEN GREATEST(0, f.s2c_need - f.sv_served - f.s3_ordered)
                WHEN f.s1_has_exit THEN GREATEST(0, f.s2c_need - f.s3_ordered - f.s3_exit_alloc)
              END::numeric ORDER BY f.o)
    INTO b_contract, b_ql, b_comp, b_prod, b_seq, b_done, b_sold, b_need, b_served,
         b_ordered, b_received, b_rem, b_queued, b_missing
  FROM (
    SELECT sv.*,
           row_number() OVER (ORDER BY sv.l_sort_ts, sv.l_contract_id, sv.l_quote_line_id, sv.s1_comp_key) AS o
    FROM served sv
  ) f;

  n := COALESCE(cardinality(b_contract), 0);
  IF n = 0 THEN
    RETURN;
  END IF;

  -- Stock livre inicial por (armazém elegível, produto) — só produtos com
  -- quantidade pendente; stock negativo conta 0 (não abate outro armazém).
  SELECT COALESCE(jsonb_object_agg(s.warehouse_id::text || s.product_id::text, s.quantity), '{}'::jsonb)
    INTO v_free
  FROM public.stocks s
  WHERE s.deleted_at IS NULL
    AND s.quantity > 0
    AND s.warehouse_id = ANY (COALESCE(w_ids, ARRAY[]::uuid[]))
    AND s.product_id IN (
      SELECT DISTINCT u.p FROM unnest(b_prod, b_rem, b_queued) u(p, r, q) WHERE u.q AND u.r > 0
    );

  a_res   := array_fill(0::numeric, ARRAY[n]);
  a_alloc := array_fill('[]'::jsonb, ARRAY[n]);

  WHILE i <= n LOOP
    j := i;
    WHILE j < n AND b_contract[j + 1] = b_contract[i] LOOP
      j := j + 1;
    END LOOP;

    -- Procura pendente da EC por produto.
    v_dem := '{}'::jsonb;
    FOR k IN i..j LOOP
      IF b_queued[k] AND b_rem[k] > 0 THEN
        v_key := b_prod[k]::text;
        v_dem := v_dem || jsonb_build_object(v_key, COALESCE((v_dem ->> v_key)::numeric, 0) + b_rem[k]);
      END IF;
    END LOOP;

    -- Distância da morada da EC a cada armazém (só quando há escolha e
    -- coordenadas); senão tudo NULL e decide o armazém por omissão / stock.
    v_dist := array_fill(NULL::numeric, ARRAY[GREATEST(w_cnt, 1)]);
    IF w_coords THEN
      v_ec_lat := NULL; v_ec_lon := NULL;
      SELECT c.lat, c.lon INTO v_ec_lat, v_ec_lon
      FROM public.fn_client_order_coords(b_contract[i]) c
      LIMIT 1;
      IF v_ec_lat IS NOT NULL AND v_ec_lon IS NOT NULL THEN
        FOR k IN 1..w_cnt LOOP
          IF w_lat[k] IS NOT NULL AND w_lon[k] IS NOT NULL THEN
            v_dist[k] := public.calculate_distance_km(v_ec_lat, v_ec_lon, w_lat[k], w_lon[k]);
          END IF;
        END LOOP;
      END IF;
    END IF;

    v_plan := 'none';
    v_ecw := NULL;
    v_partial := false;

    IF v_dem <> '{}'::jsonb THEN
      -- 1. Um armazém que cubra tudo o pendente da EC.
      v_best := NULL;
      IF w_cnt > 0 THEN
        SELECT u.o INTO v_best
        FROM unnest(w_ids) WITH ORDINALITY u(wid, o)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_each_text(v_dem) d(pid, q)
          WHERE COALESCE((v_free ->> (u.wid::text || d.pid))::numeric, 0) < d.q::numeric
        )
        ORDER BY v_dist[u.o] NULLS LAST,
                 w_def[u.o] DESC,
                 (SELECT SUM(COALESCE((v_free ->> (u.wid::text || d.pid))::numeric, 0))
                    FROM jsonb_each_text(v_dem) d(pid, q)) DESC,
                 u.o
        LIMIT 1;
      END IF;

      IF v_best IS NOT NULL THEN
        v_plan := 'single';
        v_ecw := w_ids[v_best];
        FOR k IN i..j LOOP
          IF b_queued[k] AND b_rem[k] > 0 THEN
            v_key := w_ids[v_best]::text || b_prod[k]::text;
            v_f := COALESCE((v_free ->> v_key)::numeric, 0);
            a_res[k] := b_rem[k];
            a_alloc[k] := jsonb_build_array(jsonb_build_object(
              'warehouse_id', w_ids[v_best], 'warehouse_name', w_names[v_best], 'qty', b_rem[k]));
            v_free := v_free || jsonb_build_object(v_key, v_f - b_rem[k]);
          END IF;
        END LOOP;
      ELSE
        -- 2. Linha a linha: o armazém que cobre a linha; senão repartir.
        FOR k IN i..j LOOP
          CONTINUE WHEN NOT (b_queued[k] AND b_rem[k] > 0);
          v_need := b_rem[k];
          v_best := NULL;
          IF w_cnt > 0 THEN
            SELECT u.o INTO v_best
            FROM unnest(w_ids) WITH ORDINALITY u(wid, o)
            WHERE COALESCE((v_free ->> (u.wid::text || b_prod[k]::text))::numeric, 0) >= v_need
            ORDER BY v_dist[u.o] NULLS LAST,
                     w_def[u.o] DESC,
                     COALESCE((v_free ->> (u.wid::text || b_prod[k]::text))::numeric, 0) DESC,
                     u.o
            LIMIT 1;
          END IF;

          IF v_best IS NOT NULL THEN
            v_key := w_ids[v_best]::text || b_prod[k]::text;
            v_f := COALESCE((v_free ->> v_key)::numeric, 0);
            a_alloc[k] := jsonb_build_array(jsonb_build_object(
              'warehouse_id', w_ids[v_best], 'warehouse_name', w_names[v_best], 'qty', v_need));
            v_free := v_free || jsonb_build_object(v_key, v_f - v_need);
            v_need := 0;
          ELSIF w_cnt > 0 THEN
            FOR v_e IN
              SELECT u.o AS o, u.wid AS wid,
                     COALESCE((v_free ->> (u.wid::text || b_prod[k]::text))::numeric, 0) AS f
              FROM unnest(w_ids) WITH ORDINALITY u(wid, o)
              WHERE COALESCE((v_free ->> (u.wid::text || b_prod[k]::text))::numeric, 0) > 0
              ORDER BY 3 DESC, v_dist[u.o] NULLS LAST, w_def[u.o] DESC, u.o
            LOOP
              EXIT WHEN v_need <= 0;
              v_take := LEAST(v_need, v_e.f);
              a_alloc[k] := a_alloc[k] || jsonb_build_object(
                'warehouse_id', v_e.wid, 'warehouse_name', w_names[v_e.o], 'qty', v_take);
              v_free := v_free || jsonb_build_object(v_e.wid::text || b_prod[k]::text, v_e.f - v_take);
              v_need := v_need - v_take;
            END LOOP;
          END IF;

          a_res[k] := b_rem[k] - v_need;
          IF v_need > 0 THEN
            v_partial := true;
          END IF;
        END LOOP;

        -- Armazém da EC = o com mais reservado (desempate: ordem de escolha).
        SELECT x.wid, x.nwh INTO v_ecw, v_nwh
        FROM (
          SELECT (e ->> 'warehouse_id')::uuid AS wid,
                 SUM((e ->> 'qty')::numeric) AS q,
                 COUNT(*) OVER () AS nwh
          FROM unnest(a_alloc[i:j]) AS al(arr)
          CROSS JOIN LATERAL jsonb_array_elements(al.arr) e
          GROUP BY 1
        ) x
        JOIN unnest(w_ids) WITH ORDINALITY u(wid, o) ON u.wid = x.wid
        ORDER BY x.q DESC, v_dist[u.o] NULLS LAST, w_def[u.o] DESC, u.o
        LIMIT 1;

        v_plan := CASE WHEN v_partial THEN 'partial'
                       WHEN COALESCE(v_nwh, 0) > 1 THEN 'split'
                       ELSE 'single' END;
      END IF;
    END IF;

    -- Sem reserva: sugestão = mais próximo / por omissão / primeiro por nome.
    IF v_ecw IS NULL AND w_cnt > 0 THEN
      SELECT u.wid INTO v_ecw
      FROM unnest(w_ids) WITH ORDINALITY u(wid, o)
      ORDER BY v_dist[u.o] NULLS LAST, w_def[u.o] DESC, u.o
      LIMIT 1;
    END IF;

    FOR k IN i..j LOOP
      IF p_product_ids IS NULL OR b_prod[k] = ANY (p_product_ids) THEN
        contract_id     := b_contract[k];
        quote_line_id   := b_ql[k];
        component_index := b_comp[k];
        product_id      := b_prod[k];
        seq             := b_seq[k];
        is_served       := b_done[k];
        is_sold         := b_sold[k];
        qty_needed      := b_need[k];
        qty_served      := b_served[k];
        qty_ordered     := b_ordered[k];
        qty_received    := b_received[k];
        IF b_queued[k] THEN
          qty_reserved := a_res[k];
          qty_missing  := GREATEST(0, b_rem[k] - a_res[k]);
        ELSE
          qty_reserved := 0;
          qty_missing  := b_missing[k];
        END IF;
        SELECT COALESCE(jsonb_agg(e ORDER BY (e ->> 'qty')::numeric DESC, x.ord), '[]'::jsonb)
          INTO warehouse_alloc
        FROM jsonb_array_elements(a_alloc[k]) WITH ORDINALITY x(e, ord);
        warehouse_id    := (warehouse_alloc -> 0 ->> 'warehouse_id')::uuid;
        ec_warehouse_id := v_ecw;
        ec_plan         := v_plan;
        RETURN NEXT;
      END IF;
    END LOOP;

    i := j + 1;
  END LOOP;
END;
$function$;

-- ------------------------------------------------------------
-- 4. fn_client_order_line_reservations: mesma assinatura e colunas (há
--    chamadores com SELECT *), agora sobre o motor por armazém.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint, is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric, qty_received numeric, qty_reserved numeric, qty_missing numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- NOVO (EC por armazém): a reserva passou a ser por EC e por armazém
  -- (fn_client_order_line_reservations_wh). Colunas e significado iguais; o
  -- total reservado por linha é o mesmo, muda de onde sai.
  SELECT r.contract_id, r.quote_line_id, r.component_index, r.product_id, r.seq,
         r.is_served, r.is_sold, r.qty_needed, r.qty_served, r.qty_ordered,
         r.qty_received, r.qty_reserved, r.qty_missing
  FROM public.fn_client_order_line_reservations_wh(p_organization_id, p_product_ids) r;
$function$;

-- ------------------------------------------------------------
-- 5. fn_contract_deduct_stock (baixa por armazém)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_contract_deduct_stock(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_c                    public.client_contracts;  -- 29/10: era NEW (gatilho)
  v_trigger_mode         text;
  v_default_warehouse_id uuid;
  v_resolved_warehouse   uuid;
  v_active_warehouse_cnt integer;
  v_resolved_quote_id    uuid;
  v_line                 record;
  v_qty_int              integer;
  v_result               jsonb;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
  -- NOVO (20261204620000): número que fica no movimento
  v_document_number      text;
  -- NOVO (20261204630000): desconto limitado à reserva FIFO
  v_managed_products     uuid[];
  v_locked_products      uuid[] := ARRAY[]::uuid[];
  v_pid                  uuid;
  v_res_map              jsonb;
  v_reserved             numeric;
  v_wh_qty               integer;
  v_qty_deduct           integer;
  v_lines_partial        integer := 0;
  v_lines_not_reserved   integer := 0;
  -- NOVO (EC por armazém): baixa repartida pelos armazéns da reserva
  v_default_ignored      uuid;
  v_alloc                jsonb;
  v_a                    record;
  v_left                 integer;
  v_line_deducted        integer;
  v_line_moves           jsonb;
  v_first_mv             uuid;
  v_mv_id                uuid;
  v_mv_balance           integer;
  v_mv_actor             uuid;
  v_used_warehouses      uuid[] := ARRAY[]::uuid[];
BEGIN
  -- 29/10: o contrato pelo id (o gatilho e a emissão da EC chamam com o contrato já assinado)
  SELECT * INTO v_c FROM public.client_contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'contract_not_found');
  END IF;
  IF v_c.status IS NULL OR NOT (v_c.status = ANY (v_signed_aliases)) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_signed');
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = v_c.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. Only 'contract_signed' deducts automatically ('manual' = só pela
    --      Saída para clientes; 'proposal_accepted' = antigo). ─────────────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'mode', 'mode', v_trigger_mode);
    END IF;

    -- ── 3. Resolve the quote (NOVO 20261115080000): prefer the direct FK,
    --      fall back to the proposal's own quote when execute-workflow left
    --      quote_id NULL. No quote resolvable at all → nothing to deduct. ──
    v_resolved_quote_id := v_c.quote_id;
    IF v_resolved_quote_id IS NULL AND v_c.proposal_id IS NOT NULL THEN
      SELECT id INTO v_resolved_quote_id
      FROM public.quotes
      WHERE proposal_id = v_c.proposal_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_resolved_quote_id IS NULL THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'no_quote');
    END IF;

    -- ── 4. NOVO (EC por armazém): a baixa sai, linha a linha, dos armazéns
    --      onde a reserva por armazém a pôs (fn_client_order_line_reservations_wh).
    --      Só contam armazéns elegíveis (ativos, servem clientes, não
    --      apagados, não viatura). Um armazém por omissão que não seja
    --      elegível é ignorado (fica registado). Sem nenhum elegível não há
    --      baixa — fica registado e o documento da EC mostra o aviso. ──────
    SELECT count(*) INTO v_active_warehouse_cnt
    FROM public.fn_client_order_warehouses(v_c.organization_id);

    IF v_default_warehouse_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.fn_client_order_warehouses(v_c.organization_id) cw
         WHERE cw.warehouse_id = v_default_warehouse_id
       ) THEN
      v_default_ignored := v_default_warehouse_id;
      v_default_warehouse_id := NULL;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', v_c.id, 'warehouse', v_default_ignored,
        'trigger:contract_stock_deduction_default_ignored', 'warning',
        jsonb_build_object(
          'reason', 'default_warehouse_not_eligible',
          'default_warehouse_id', v_default_ignored
        )
      );
    END IF;

    IF v_active_warehouse_cnt = 0 THEN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', v_c.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction_no_warehouse', 'warning',
        jsonb_build_object(
          'reason', 'no_eligible_warehouse',
          'eligible_warehouse_count', 0,
          'default_warehouse_ignored', v_default_ignored
        )
      );
      RETURN jsonb_build_object('skipped', true, 'reason', 'no_warehouse');
    END IF;

    -- NOVO (20261204620000): número do documento de origem. Venda direta
    -- ANTES de manual (as de VD também têm is_manual_order): VD-…; encomenda
    -- manual: EC-…; contrato real: contract_number, como antes.
    v_document_number := COALESCE(
      (
        SELECT COALESCE(ds.sale_number, v_c.order_number, v_c.contract_number)
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = v_c.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(v_c.is_manual_order, false)
           THEN COALESCE(v_c.order_number, v_c.contract_number)
      END,
      v_c.contract_number
    );

    -- ── NOVO (20261204630000): 4b. Trancar as linhas de stocks dos produtos
    --      com gestão de stock deste contrato, pela mesma ordem (produto,
    --      armazém) que rpc_confirm_client_order_stock_exit e
    --      fn_client_order_request_missing. Produto a produto, com
    --      lock_timeout 2s (SET na função): um timeout só afeta as linhas
    --      desse produto, que não descontam e ficam na fila. ──────────────
    SELECT array_agg(DISTINCT ql.product_id ORDER BY ql.product_id)
      INTO v_managed_products
    FROM public.quote_lines ql
    JOIN public.products p ON p.id = ql.product_id
    WHERE ql.quote_id = v_resolved_quote_id
      AND ql.product_id IS NOT NULL
      AND p.manages_stock = true;

    IF v_managed_products IS NOT NULL THEN
      FOREACH v_pid IN ARRAY v_managed_products LOOP
        BEGIN
          PERFORM 1
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = v_pid
            AND w.organization_id = v_c.organization_id
          ORDER BY s.product_id, s.warehouse_id
          FOR UPDATE OF s;

          v_locked_products := v_locked_products || v_pid;
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, error_message, execution_data
          ) VALUES (
            'contract', v_c.id, 'product', v_pid,
            'trigger:contract_stock_deduction_lock_timeout', 'warning', SQLERRM,
            jsonb_build_object('reason', 'lock_timeout', 'product_id', v_pid, 'sqlstate', SQLSTATE)
          );
        END;
      END LOOP;

      -- ── 4c. Reserva FIFO calculada uma vez, só para os produtos
      --        trancados. Chave: quote_line_id (linhas diretas,
      --        component_index NULL). ──────────────────────────────────────
      IF cardinality(v_locked_products) > 0 THEN
        -- NOVO (EC por armazém): reserva + armazéns da linha.
        SELECT jsonb_object_agg(r.quote_line_id::text,
                 jsonb_build_object('qty_reserved', r.qty_reserved, 'alloc', r.warehouse_alloc))
          INTO v_res_map
        FROM public.fn_client_order_line_reservations_wh(v_c.organization_id, v_locked_products) r
        WHERE r.contract_id = v_c.id
          AND r.component_index IS NULL;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. A line with a fractional quantity is skipped
    --      with a warning log — it must never abort the remaining lines of
    --      the same contract. Likewise, any other unexpected failure on a
    --      single line (caught per-line below) never stops the loop. ──────
    FOR v_line IN
      SELECT ql.id, ql.product_id, ql.qt,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = true
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): a validação de inteiro aplica-se à quantidade
      -- em unidades de stock (qt × fator). Com fator 1 é a mesma de antes.
      IF (v_line.qt * v_line.units_per_uom) <> floor(v_line.qt * v_line.units_per_uom) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom)::integer;

      -- NOVO (20261204630000): mesma idempotência de
      -- rpc_register_sale_stock_movement (qualquer 'venda' desta linha nesta
      -- origem, incluindo estornadas) testada antes do lock e da reserva.
      -- Conta como processada.
      IF EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = v_c.id
          AND sm.reference_id = v_line.id
          AND sm.movement_type = 'venda'
      ) THEN
        v_lines_processed := v_lines_processed + 1;
        CONTINUE;
      END IF;

      -- NOVO (20261204630000): produto não trancado (lock_timeout) -> não
      -- desconta; a linha fica na fila.
      IF NOT (v_line.product_id = ANY (v_locked_products)) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'lock_timeout', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (EC por armazém): desconto = LEAST(necessário, reservado para a
      -- linha), repartido pelos armazéns da reserva da linha (maior parcela
      -- primeiro), cada parcela limitada ao stock desse armazém.
      v_reserved := COALESCE((v_res_map -> v_line.id::text ->> 'qty_reserved')::numeric, 0);
      v_alloc    := COALESCE(v_res_map -> v_line.id::text -> 'alloc', '[]'::jsonb);
      v_left     := LEAST(v_qty_int::numeric, floor(GREATEST(v_reserved, 0)))::integer;

      IF v_left <= 0 OR jsonb_array_length(v_alloc) = 0 THEN
        v_lines_not_reserved := v_lines_not_reserved + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'skipped_not_reserved', 'qt', v_line.qt, 'product_id', v_line.product_id,
                             'qty_needed', v_qty_int, 'qty_reserved', v_reserved,
                             'warehouse_alloc', v_alloc)
        );
        CONTINUE;
      END IF;

      -- Per-line guard: a failure registering one line's movement must never
      -- abort the remaining lines of the same contract (as parcelas da linha
      -- ficam todas ou nenhuma).
      BEGIN
        v_line_deducted := 0;
        v_line_moves := '[]'::jsonb;
        v_first_mv := NULL;
        v_mv_actor := NULL;
        v_result := NULL;

        FOR v_a IN
          SELECT (x.e ->> 'warehouse_id')::uuid AS wid, (x.e ->> 'qty')::numeric AS q
          FROM jsonb_array_elements(v_alloc) WITH ORDINALITY x(e, ord)
          ORDER BY x.ord
        LOOP
          EXIT WHEN v_left <= 0;

          v_wh_qty := NULL;
          SELECT s.quantity
            INTO v_wh_qty
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = v_line.product_id
            AND s.warehouse_id = v_a.wid
            AND s.deleted_at IS NULL
            AND w.organization_id = v_c.organization_id
            AND w.deleted_at IS NULL;

          v_qty_deduct := LEAST(
            v_left::numeric,
            floor(GREATEST(v_a.q, 0)),
            GREATEST(COALESCE(v_wh_qty, 0), 0)::numeric
          )::integer;

          CONTINUE WHEN v_qty_deduct <= 0;

          IF v_first_mv IS NULL THEN
            -- 1.ª parcela: pela RPC de sempre (validações + idempotência).
            v_result := public.rpc_register_sale_stock_movement(
              p_product_id        => v_line.product_id,
              p_warehouse_id       => v_a.wid,
              p_quantity           => v_qty_deduct,
              p_quote_line_id      => v_line.id,
              p_sale_source_type   => 'contract',
              p_sale_source_id     => v_c.id,
              p_document_number    => v_document_number,
              p_unit_cost_at_time  => NULL,
              p_organization_id    => v_c.organization_id
            );
            EXIT WHEN COALESCE((v_result ->> 'skipped')::boolean, false);
            v_mv_id := (v_result ->> 'movement_id')::uuid;
            v_mv_balance := (v_result ->> 'balance_after')::integer;
            v_first_mv := v_mv_id;
            SELECT sm.created_by INTO v_mv_actor FROM public.stock_movements sm WHERE sm.id = v_mv_id;
          ELSE
            -- Parcelas seguintes (outro armazém): mesmo movimento 'venda' da
            -- mesma linha e origem. A RPC só aceita um por linha
            -- (idempotência), por isso entram aqui com os mesmos campos e o
            -- mesmo autor. O armazém é elegível e da organização (reserva).
            INSERT INTO public.stock_movements (
              organization_id, product_id, warehouse_id, movement_type, quantity,
              document_number, document_type, unit_cost_at_time,
              sale_source_type, sale_source_id, reference_id, notes, created_by
            ) VALUES (
              v_c.organization_id, v_line.product_id, v_a.wid, 'venda', v_qty_deduct,
              v_document_number, 'venda', NULL,
              'contract', v_c.id, v_line.id,
              format('Venda registada a partir de %s %s (linha de orçamento %s)',
                     'contract', v_c.id, v_line.id),
              v_mv_actor
            )
            RETURNING id, balance_after INTO v_mv_id, v_mv_balance;
          END IF;

          v_left := v_left - v_qty_deduct;
          v_line_deducted := v_line_deducted + v_qty_deduct;
          v_line_moves := v_line_moves || jsonb_build_object(
            'warehouse_id', v_a.wid, 'quantity', v_qty_deduct,
            'movement_id', v_mv_id, 'balance_after', v_mv_balance);
          IF NOT (v_a.wid = ANY (v_used_warehouses)) THEN
            v_used_warehouses := v_used_warehouses || v_a.wid;
          END IF;

          IF v_mv_balance < 0 THEN
            INSERT INTO public.workflow_execution_log (
              source_entity, source_record_id, target_entity, target_record_id,
              action_type, status, execution_data
            ) VALUES (
              'contract', v_c.id, 'stock_movement', v_mv_id,
              'trigger:contract_stock_deduction_insufficient', 'warning',
              jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id,
                                 'warehouse_id', v_a.wid, 'balance_after', v_mv_balance)
            );
          END IF;
        END LOOP;

        IF v_line_deducted = 0 THEN
          IF v_first_mv IS NULL AND COALESCE((v_result ->> 'skipped')::boolean, false) THEN
            -- Já registada (corrida): conta como processada, como antes.
            v_lines_processed := v_lines_processed + 1;
          ELSE
            v_lines_not_reserved := v_lines_not_reserved + 1;
            INSERT INTO public.workflow_execution_log (
              source_entity, source_record_id, target_entity, target_record_id,
              action_type, status, execution_data
            ) VALUES (
              'contract', v_c.id, 'quote_line', v_line.id,
              'trigger:contract_stock_deduction_line_skipped', 'warning',
              jsonb_build_object('reason', 'skipped_not_reserved', 'qt', v_line.qt, 'product_id', v_line.product_id,
                                 'qty_needed', v_qty_int, 'qty_reserved', v_reserved,
                                 'warehouse_alloc', v_alloc)
            );
          END IF;
        ELSE
          v_lines_processed := v_lines_processed + 1;

          -- NOVO (20261204630000): desconto parcial — o resto passa a
          -- qty_missing e é pedido ao fornecedor por
          -- fn_client_order_request_missing.
          IF v_line_deducted < v_qty_int THEN
            v_lines_partial := v_lines_partial + 1;
            INSERT INTO public.workflow_execution_log (
              source_entity, source_record_id, target_entity, target_record_id,
              action_type, status, execution_data
            ) VALUES (
              'contract', v_c.id, 'stock_movement', v_first_mv,
              'trigger:contract_stock_deduction_partial', 'warning',
              jsonb_build_object('reason', 'partial', 'quote_line_id', v_line.id, 'product_id', v_line.product_id,
                                 'qty_needed', v_qty_int, 'qty_deducted', v_line_deducted,
                                 'qty_reserved', v_reserved, 'movements', v_line_moves)
            );
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt, 'warehouse_alloc', v_alloc)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', v_c.id, 'stock_movement', NULL,
      'trigger:contract_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_used_warehouses[1], 'resolved_quote_id', v_resolved_quote_id,
                         -- NOVO (EC por armazém)
                         'warehouse_ids', to_jsonb(v_used_warehouses), 'eligible_warehouse_count', v_active_warehouse_cnt, 'default_warehouse_ignored', v_default_ignored,
                         -- NOVO (20261204630000)
                         'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', v_c.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
    RETURN jsonb_build_object('skipped', true, 'reason', 'error', 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('skipped', false, 'lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped,
                            'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved,
                            'warehouse_id', v_used_warehouses[1],
                            'warehouse_ids', to_jsonb(v_used_warehouses));  -- NOVO (EC por armazém)
END;
$function$
;

-- ------------------------------------------------------------
-- 6. fn_client_order_request_missing
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_client_order_request_missing(p_contract_id uuid, p_actor uuid, p_quote_line_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases      text[] := ARRAY['signed', 'assinado'];
  v_org                 uuid;
  v_status              text;
  v_contract_number     text;
  v_quote_id            uuid;
  v_products            uuid[];
  v_line                record;
  v_supplier_id         uuid;
  v_purchase_price      numeric;
  v_link_uom            uuid;
  v_link_sku            text;
  v_link_units          integer;
  v_qty_int             integer;
  v_unit_price          numeric;
  v_po_id               uuid;
  v_po_is_new           boolean;
  v_touched_pos         uuid[] := ARRAY[]::uuid[];
  v_pos_created         integer := 0;
  v_items_created       integer := 0;
  v_skipped_no_supplier integer := 0;
  v_skipped_other       integer := 0;
  v_errors              integer := 0;
  -- NOVO (EC por armazém): armazém sugerido para a receção
  v_ec_warehouse_id     uuid;
  v_ec_warehouse_name   text;
BEGIN
  IF p_contract_id IS NULL OR p_actor IS NULL THEN
    RAISE EXCEPTION 'contract_id e autor são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    cc.organization_id, cc.status, cc.contract_number,
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
  INTO v_org, v_status, v_contract_number, v_quote_id
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Emylia (20261231980000): a encomenda de cliente só existe depois do 1.º pagamento validado
  IF NOT public.fn_ec_emitida(p_contract_id) THEN
    RAISE EXCEPTION 'A encomenda de cliente deste negócio só é emitida quando o 1.º pagamento for validado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS NULL OR NOT (v_status = ANY (v_signed_aliases)) OR v_quote_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'purchase_orders_created', 0,
      'items_created', 0,
      'skipped_no_supplier', 0,
      'skipped_other', 0,
      'errors', 0,
      'reason', CASE WHEN v_quote_id IS NULL THEN 'no_quote' ELSE 'not_signed' END
    );
  END IF;

  -- Serializa pedidos concorrentes da mesma encomenda.
  PERFORM pg_advisory_xact_lock(hashtextextended('fn_client_order_request_missing:' || p_contract_id::text, 0));

  SELECT array_agg(DISTINCT t.pid ORDER BY t.pid)
    INTO v_products
  FROM (
    SELECT ql.product_id AS pid
    FROM public.quote_lines ql
    WHERE ql.quote_id = v_quote_id
      AND ql.product_id IS NOT NULL
    UNION
    SELECT (comp.value ->> 'source_id')::uuid
    FROM public.quote_lines ql
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
    WHERE ql.quote_id = v_quote_id
      AND ql.bundle_id IS NOT NULL
      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
      AND comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
  ) t;

  IF v_products IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'purchase_orders_created', 0,
      'items_created', 0,
      'skipped_no_supplier', 0,
      'skipped_other', 0,
      'errors', 0
    );
  END IF;

  -- Mesmo lock que rpc_confirm_client_order_stock_exit (ordem fixa).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = ANY (v_products)
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  FOR v_line IN
    -- NOVO (EC por armazém): a falta (qty_missing) vem da reserva por
    -- armazém — o que nenhum armazém elegível tem livre para esta EC.
    SELECT r.quote_line_id, r.component_index, r.product_id,
           r.qty_needed, r.qty_missing,
           p.name AS product_name, p.sku AS product_sku,
           r.ec_warehouse_id
    FROM public.fn_client_order_line_reservations_wh(v_org, v_products) r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.contract_id = p_contract_id
      AND r.qty_missing > 0
      AND (p_quote_line_ids IS NULL OR r.quote_line_id = ANY (p_quote_line_ids))
    ORDER BY r.quote_line_id, r.component_index NULLS FIRST
  LOOP
    -- Paridade com o gatilho antigo: quantidade vendida fracionária em
    -- unidades de stock é saltada com aviso.
    IF v_line.qty_needed <> floor(v_line.qty_needed) THEN
      v_skipped_other := v_skipped_other + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_line_skipped', 'warning',
        jsonb_build_object('reason', 'fractional_quantity', 'qty_needed', v_line.qty_needed,
                           'product_id', v_line.product_id, 'component_index', v_line.component_index)
      );
      CONTINUE;
    END IF;

    -- NOVO (EC por armazém): o armazém da EC (igual em todas as linhas).
    IF v_ec_warehouse_id IS NULL AND v_line.ec_warehouse_id IS NOT NULL THEN
      v_ec_warehouse_id := v_line.ec_warehouse_id;
      SELECT w.name INTO v_ec_warehouse_name FROM public.warehouses w WHERE w.id = v_ec_warehouse_id;
    END IF;

    v_supplier_id := NULL; v_purchase_price := NULL; v_link_uom := NULL; v_link_sku := NULL;

    SELECT supplier_id, purchase_price, uom_id, supplier_sku
      INTO v_supplier_id, v_purchase_price, v_link_uom, v_link_sku
    FROM public.item_suppliers
    WHERE product_id = v_line.product_id
      AND is_preferred = true
      AND deleted_at IS NULL
      -- NOVO (20261204340000): só ligações ativas e da organização do
      -- contrato (is_active e organization_id são NOT NULL). Mesmo critério
      -- que has_preferred_supplier em rpc_get_client_order_document.
      AND is_active = true
      AND organization_id = v_org
    LIMIT 1;

    IF v_supplier_id IS NULL THEN
      v_skipped_no_supplier := v_skipped_no_supplier + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_no_supplier', 'warning',
        jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id,
                           'component_index', v_line.component_index, 'qty_missing', v_line.qty_missing)
      );
      CONTINUE;
    END IF;

    BEGIN
      v_link_units := public.fn_uom_units_per(v_link_uom, v_line.product_id);
    EXCEPTION WHEN OTHERS THEN
      v_link_units := NULL;
    END;

    IF v_link_units IS NULL OR v_link_units < 1 THEN
      v_skipped_other := v_skipped_other + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_line_skipped', 'warning',
        jsonb_build_object('reason', 'incompatible_supplier_uom', 'product_id', v_line.product_id, 'uom_id', v_link_uom)
      );
      CONTINUE;
    END IF;

    IF v_purchase_price IS NULL THEN
      SELECT price INTO v_purchase_price
      FROM public.product_prices
      WHERE product_id = v_line.product_id AND price_type = 'purchase'
      ORDER BY valid_from DESC NULLS LAST
      LIMIT 1;
      IF v_link_units <> 1 THEN
        v_purchase_price := v_purchase_price * v_link_units;
      END IF;
    END IF;

    v_unit_price := COALESCE(v_purchase_price, 0);
    -- Unidades em falta -> unidade da ligação, arredondando para cima.
    v_qty_int := ceil(v_line.qty_missing / v_link_units)::integer;

    BEGIN
      v_po_id := NULL;

      SELECT po.id INTO v_po_id
      FROM public.purchase_orders po
      WHERE po.source_type = 'contract'
        AND po.source_id = p_contract_id
        AND po.supplier_id = v_supplier_id
        AND po.status = 'pending'
        AND po.deleted_at IS NULL
      ORDER BY po.created_at DESC
      LIMIT 1
      FOR UPDATE;

      v_po_is_new := v_po_id IS NULL;

      IF v_po_is_new THEN
        INSERT INTO public.purchase_orders (
          organization_id, supplier_id, order_date, status,
          source_type, source_id, notes, created_by
        ) VALUES (
          v_org, v_supplier_id, now()::date, 'pending',
          'contract', p_contract_id,
          -- NOVO (20261204610000): a origem certa nos contratos sintéticos.
          -- Venda direta ANTES de manual (as de VD também têm is_manual_order).
          COALESCE(
            (
              SELECT CASE
                       WHEN cc.order_number IS NOT NULL THEN
                         format('Gerada automaticamente a partir da venda direta %s (Encomenda Cliente %s)',
                                COALESCE(ds.sale_number, ds.id::text), cc.order_number)
                       ELSE
                         format('Gerada automaticamente a partir da venda direta %s',
                                COALESCE(ds.sale_number, ds.id::text))
                     END
              FROM public.direct_sales ds
              JOIN public.client_contracts cc ON cc.id = ds.client_contract_id
              WHERE ds.client_contract_id = p_contract_id
              ORDER BY ds.created_at DESC
              LIMIT 1
            ),
            (
              SELECT format('Gerada automaticamente a partir da Encomenda Cliente %s',
                            COALESCE(cc.order_number, cc.contract_number, p_contract_id::text))
              FROM public.client_contracts cc
              WHERE cc.id = p_contract_id
                AND cc.is_manual_order = true
            ),
            format('Gerada automaticamente a partir do contrato %s', COALESCE(v_contract_number, p_contract_id::text))
          )
          -- NOVO (EC por armazém): armazém sugerido para a receção (texto).
          || COALESCE(format(' — receção sugerida no armazém %s', v_ec_warehouse_name), ''),
          p_actor
        )
        RETURNING id INTO v_po_id;
      END IF;

      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, description, sku,
        quantity, unit_price, total_price,
        uom_id, supplier_sku,          -- units_per_uom pelo gatilho
        quote_line_id, component_index -- NOVO: pertence à linha que o gerou
      ) VALUES (
        v_po_id, 'product', v_line.product_id,
        v_line.product_name, v_line.product_sku,
        v_qty_int, v_unit_price, v_unit_price * v_qty_int,
        v_link_uom, nullif(v_link_sku, ''),
        v_line.quote_line_id, v_line.component_index
      );

      IF v_po_is_new THEN
        v_pos_created := v_pos_created + 1;
      END IF;
      v_items_created := v_items_created + 1;
      IF NOT (v_po_id = ANY (v_touched_pos)) THEN
        v_touched_pos := v_touched_pos || v_po_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_supplier_error', 'error', SQLERRM,
        jsonb_build_object('supplier_id', v_supplier_id, 'product_id', v_line.product_id,
                           'component_index', v_line.component_index)
      );
    END;
  END LOOP;

  IF cardinality(v_touched_pos) > 0 THEN
    UPDATE public.purchase_orders po
       SET total_value = (
             SELECT COALESCE(SUM(poi.total_price), 0)
             FROM public.purchase_order_items poi
             WHERE poi.purchase_order_id = po.id
           )
     WHERE po.id = ANY (v_touched_pos);
  END IF;

  INSERT INTO public.workflow_execution_log (
    source_entity, source_record_id, target_entity, target_record_id,
    action_type, status, execution_data
  ) VALUES (
    'contract', p_contract_id, 'purchase_order', NULL,
    'fn:client_order_request_missing', 'success',
    jsonb_build_object(
      'purchase_orders_created', v_pos_created,
      'items_created', v_items_created,
      'skipped_no_supplier', v_skipped_no_supplier,
      'skipped_other', v_skipped_other,
      'errors', v_errors,
      'quote_line_ids', to_jsonb(p_quote_line_ids),
      'resolved_quote_id', v_quote_id,
      'suggested_warehouse_id', v_ec_warehouse_id  -- NOVO (EC por armazém)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_orders_created', v_pos_created,
    'items_created', v_items_created,
    'skipped_no_supplier', v_skipped_no_supplier,
    'skipped_other', v_skipped_other,
    'errors', v_errors,
    'suggested_warehouse_id', v_ec_warehouse_id  -- NOVO (EC por armazém)
  );
END;
$function$
;

-- ------------------------------------------------------------
-- rpc_client_order_list_readiness: 4 colunas novas no fim (DROP + CREATE,
-- mesmas permissões). As 9 de antes ficam iguais.
--   is_ready              — pronta a expedir: há linhas em aberto e todas
--                           estão cobertas por stock reservado (nada em falta,
--                           nada à espera de PO) segundo a regra por armazém;
--   ec_warehouse_id       — armazém da EC (ver fn_client_order_line_reservations_wh);
--   ec_plan               — 'single' | 'split' | 'partial' | 'none';
--   reserved_warehouse_ids — armazéns de onde sai o stock reservado.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_client_order_list_readiness(uuid, uuid[]);

CREATE FUNCTION public.rpc_client_order_list_readiness(p_organization_id uuid, p_contract_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, lines_ready integer, units_ready numeric, units_in_stock_reserved numeric, units_on_po numeric, units_missing numeric, units_served numeric, units_received numeric, units_needed numeric, is_ready boolean, ec_warehouse_id uuid, ec_plan text, reserved_warehouse_ids uuid[])
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
     OR NOT (COALESCE(public.has_anew_permission(v_uid, 'client_orders.view'), false) OR public.fn_neg_papel_permite(p_organization_id, 'client_orders.view')) THEN -- 20270101360000
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH r AS MATERIALIZED (
    -- Uma só passagem pela reserva da organização inteira.
    -- NOVO (EC por armazém): motor por armazém (mesmos totais por linha).
    SELECT
      f.contract_id  AS r_contract_id,
      f.product_id   AS r_product_id,
      f.is_served    AS r_is_served,
      COALESCE(f.qty_needed,   0) AS r_needed,
      COALESCE(f.qty_served,   0) AS r_served,
      COALESCE(f.qty_ordered,  0) AS r_ordered,
      COALESCE(f.qty_received, 0) AS r_received,
      COALESCE(f.qty_reserved, 0) AS r_reserved,
      COALESCE(f.qty_missing,  0) AS r_missing,
      f.warehouse_alloc AS r_alloc,
      f.ec_warehouse_id AS r_ec_wh,
      f.ec_plan         AS r_ec_plan
    FROM public.fn_client_order_line_reservations_wh(p_organization_id, NULL) f
  ),
  rc AS (
    -- Contratos da lista (filtros de rpc_list_client_order_documents).
    SELECT cc.id AS rc_contract_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (ARRAY['signed', 'assinado'])
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado
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
      COALESCE(sum(lx.r_needed), 0)                                              AS a_units_needed,
      -- NOVO (EC por armazém)
      count(*) FILTER (WHERE lx.r_open)::integer                                 AS a_lines_open,
      max(lx.r_ec_wh::text)::uuid                                                AS a_ec_wh,
      max(lx.r_ec_plan)                                                          AS a_ec_plan
    FROM lx
    GROUP BY lx.r_contract_id
  ),
  whs AS (
    -- NOVO (EC por armazém): armazéns com stock reservado em aberto.
    SELECT lx.r_contract_id AS w_contract_id,
           array_agg(DISTINCT (e ->> 'warehouse_id')::uuid) AS w_ids
    FROM lx
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(lx.r_alloc, '[]'::jsonb)) e
    WHERE lx.r_open
    GROUP BY lx.r_contract_id
  ),
  ecw AS (
    -- Armazém / plano da EC também para EC sem linhas de produto em aberto.
    SELECT DISTINCT ON (r.r_contract_id) r.r_contract_id AS e_contract_id, r.r_ec_wh AS e_wh, r.r_ec_plan AS e_plan
    FROM r
    ORDER BY r.r_contract_id
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
    COALESCE(a.a_units_needed, 0)::numeric,
    -- NOVO (EC por armazém)
    (COALESCE(a.a_lines_open, 0) > 0
     AND COALESCE(a.a_lines_ready, 0) > 0
     AND COALESCE(a.a_units_missing, 0) = 0
     AND COALESCE(a.a_units_on_po, 0) = 0),
    COALESCE(a.a_ec_wh, e.e_wh),
    COALESCE(a.a_ec_plan, e.e_plan),
    COALESCE(w.w_ids, ARRAY[]::uuid[])
  FROM rc
  LEFT JOIN agg a ON a.a_contract_id = rc.rc_contract_id
  LEFT JOIN whs w ON w.w_contract_id = rc.rc_contract_id
  LEFT JOIN ecw e ON e.e_contract_id = rc.rc_contract_id;
END;
$function$;

-- ------------------------------------------------------------
-- 7. rpc_get_client_order_document
-- ------------------------------------------------------------
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
  -- NOVO (20261205040000): categoria principal e subcategoria da linha.
  v_category_name     text;
  v_subcategory_name  text;
  -- NOVO (anulado): quantidade anulada na PO (deixa de ser recebida).
  v_q_cancelled       numeric;
  v_cancellations     jsonb;
  -- NOVO (EC por armazém)
  v_line_alloc        jsonb;
  v_line_sugg_wh      uuid;
  v_ec_warehouse_id   uuid;
  v_ec_warehouse_name text;
  v_ec_plan           text;
  v_pending_reserved  numeric := 0;
  v_ded_log           record;
  v_ded_mode          text;
  v_ded_warning       text;
  v_ded_info          jsonb;
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
     OR NOT (public.has_anew_permission(auth.uid(), 'client_orders.view') OR public.fn_neg_papel_permite(v_org, 'client_orders.view')) THEN -- 20270101360000
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
        -- NOVO (EC por armazém): motor por armazém (mesmas chaves +
        -- warehouse_id, warehouse_alloc, ec_warehouse_id, ec_plan).
        SELECT jsonb_object_agg(
                 r.quote_line_id::text || ':' || COALESCE(r.component_index, 0)::text,
                 to_jsonb(r)
               ),
               (array_agg(r.ec_warehouse_id))[1],
               (array_agg(r.ec_plan))[1],
               COALESCE(SUM(r.qty_reserved), 0)
          INTO v_res_map, v_ec_warehouse_id, v_ec_plan, v_pending_reserved
        FROM public.fn_client_order_line_reservations_wh(v_org, v_products) r
        WHERE r.contract_id = p_contract_id;

        IF v_ec_warehouse_id IS NOT NULL THEN
          SELECT w.name INTO v_ec_warehouse_name FROM public.warehouses w WHERE w.id = v_ec_warehouse_id;
        END IF;
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
      -- NOVO (20261205040000)
      v_category_name     := NULL;
      v_subcategory_name  := NULL;
      v_q_cancelled       := NULL;
      v_cancellations     := NULL;
      v_line_alloc        := NULL;  -- NOVO (EC por armazém)
      v_line_sugg_wh      := NULL;

      -- NOVO (20261205040000): categoria do produto (linhas de produto e
      -- componentes de pack; serviços ficam NULL). Categoria principal = raiz
      -- da árvore (parent_id; parent_category_id não está preenchido) a partir
      -- de category_id — há produtos que guardam aí a folha sem
      -- subcategory_id. Subcategoria = subcategory_id; senão category_id,
      -- quando esta é filha. Categorias apagadas (deleted_at) não se mostram,
      -- como em useProductCategories.
      IF v_line.product_id IS NOT NULL THEN
        SELECT
          (
            WITH RECURSIVE up(id, parent_id, name, deleted_at, depth) AS (
              SELECT c.id, c.parent_id, c.name, c.deleted_at, 0
              FROM public.product_categories c
              WHERE c.id = COALESCE(p.category_id, p.subcategory_id)
              UNION ALL
              SELECT pc.id, pc.parent_id, pc.name, pc.deleted_at, up.depth + 1
              FROM public.product_categories pc
              JOIN up ON pc.id = up.parent_id
              WHERE up.depth < 10
            )
            SELECT u.name
            FROM up u
            WHERE u.parent_id IS NULL
              AND u.deleted_at IS NULL
            LIMIT 1
          ),
          COALESCE(
            (SELECT s.name
               FROM public.product_categories s
              WHERE s.id = p.subcategory_id
                AND s.parent_id IS NOT NULL
                AND s.deleted_at IS NULL),
            (SELECT c.name
               FROM public.product_categories c
              WHERE c.id = p.category_id
                AND c.parent_id IS NOT NULL
                AND c.deleted_at IS NULL)
          )
          INTO v_category_name, v_subcategory_name
        FROM public.products p
        WHERE p.id = v_line.product_id;
      END IF;

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
          -- NOVO (EC por armazém): de onde sai a reserva desta linha.
          v_line_alloc    := COALESCE(v_res -> 'warehouse_alloc', '[]'::jsonb);
          v_line_sugg_wh  := (v_res ->> 'warehouse_id')::uuid;

          -- NOVO (anulado): fn_client_order_line_reservations devolve
          -- qty_needed já sem a quantidade anulada nas POs; a diferença para a
          -- quantidade da linha (mesma fórmula: qt × fator, ou quantidade do
          -- componente × qt) é a anulada. Só se calcula quando há anulações
          -- ativas deste produto nesta encomenda (ligadas a esta linha ou sem
          -- ligação) — sem anulações fica 0 e nada muda.
          v_q_cancelled := 0;
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'cancellation_id',       c.id,
                     'purchase_order_id',     po.id,
                     'purchase_order_number', po.order_number,
                     'quantity_cancelled',    c.quantity_cancelled * COALESCE(poi.units_per_uom, 1),
                     'reason',                c.reason,
                     'notes',                 c.notes,
                     'created_at',            c.created_at
                   )
                   ORDER BY c.created_at, c.id
                 )
            INTO v_cancellations
          FROM public.purchase_order_item_cancellations c
          JOIN public.purchase_order_items poi ON poi.id = c.purchase_order_item_id
          JOIN public.purchase_orders po ON po.id = c.purchase_order_id
          WHERE c.undone_at IS NULL
            AND c.quantity_cancelled > 0
            AND po.source_type = 'contract'
            AND po.source_id = p_contract_id
            AND po.deleted_at IS NULL
            AND poi.product_id = v_line.product_id
            AND (
              poi.quote_line_id IS NULL
              OR (poi.quote_line_id = v_line.quote_line_id
                  AND poi.component_index IS NOT DISTINCT FROM v_line.component_index)
            );

          IF v_cancellations IS NOT NULL THEN
            v_q_cancelled := GREATEST(0, GREATEST(COALESCE(v_line.qt, 0), 0) - v_q_needed);
            IF v_q_cancelled = 0 THEN
              -- Anulação sem ligação que coube a outra linha do mesmo produto.
              v_cancellations := NULL;
            END IF;
          END IF;

          IF v_q_served_flag THEN
            -- Concluída: 'recebido' se houve parte pedida (recebida) — a parte
            -- de stock, se existir, está servida; senão servida por stock.
            -- NOVO (anulado): nada recebido nem servido e só anulado →
            -- 'nao_recebido_anulado'.
            v_line_status := CASE WHEN v_q_received > 0 THEN 'recebido'
                                  WHEN v_q_cancelled > 0 AND v_q_served = 0 THEN 'nao_recebido_anulado'
                                  ELSE 'servido_por_stock' END;
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

          -- NOVO (anulado): sem PO em curso/recebida para a linha, a PO da
          -- anulação mais recente (para o rótulo e o atalho para a PO).
          IF v_po_id IS NULL AND v_q_cancelled > 0 THEN
            v_po_id           := (v_cancellations -> -1 ->> 'purchase_order_id')::uuid;
            v_po_order_number := v_cancellations -> -1 ->> 'purchase_order_number';
          END IF;

          -- Armazéns: nunca mostrar como disponível mais do que a reserva.
          -- NOVO (EC por armazém): só elegíveis (também sem viaturas);
          -- suggested_quantity = parcela da reserva neste armazém (0 se a
          -- regra não o escolheu); os sugeridos primeiro.
          IF v_q_reserved > 0 THEN
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'warehouse_id',       w.id,
                  'warehouse_name',     w.name,
                  'quantity',           LEAST(s.quantity::numeric, v_q_reserved),
                  'physical_quantity',  s.quantity,
                  'suggested_quantity', COALESCE(al.q, 0),
                  'is_suggested',       (w.id = v_line_sugg_wh)
                )
                ORDER BY COALESCE(al.q, 0) DESC, s.quantity DESC, cw.sort_order
              ),
              '[]'::jsonb
            ) INTO v_available_wh
            FROM public.stocks s
            JOIN public.warehouses w ON w.id = s.warehouse_id
            JOIN public.fn_client_order_warehouses(v_org) cw ON cw.warehouse_id = w.id
            LEFT JOIN LATERAL (
              SELECT SUM((e ->> 'qty')::numeric) AS q
              FROM jsonb_array_elements(v_line_alloc) e
              WHERE (e ->> 'warehouse_id')::uuid = w.id
            ) al ON true
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
        'qty_served',            CASE WHEN v_res IS NOT NULL THEN v_q_served END,
        -- NOVO (20261205040000): categoria principal (raiz) e subcategoria do
        -- produto. NULL em serviços e em produtos sem categoria.
        'category_name',         v_category_name,
        'subcategory_name',      v_subcategory_name,
        -- NOVO (anulado): quantidade anulada nas POs (unidades base) e as
        -- anulações (PO, motivo, nota). NULL em serviços e em encomendas não
        -- assinadas; 0 / NULL quando não há anulação.
        'qty_cancelled',         v_q_cancelled,
        'cancellations',         v_cancellations,
        -- NOVO (EC por armazém): armazém sugerido para a saída desta linha (a
        -- maior parcela da reserva) e a reserva por armazém
        -- [{warehouse_id, warehouse_name, qty}] (unidades base; soma =
        -- qty_reserved). NULL em serviços / encomendas não assinadas.
        'suggested_warehouse_id', v_line_sugg_wh,
        'warehouse_alloc',        v_line_alloc
      );
    END LOOP;

    -- NOVO (EC por armazém): aviso da baixa automática. Só quando a última
    -- tentativa (gatilho / emissão da EC) não deu baixa a tudo e ainda há stock
    -- reservado à espera de saída nesta EC — senão já não interessa.
    IF v_is_signed AND v_pending_reserved > 0 THEN
      SELECT ois.stock_deduction_trigger INTO v_ded_mode
      FROM public.organization_inventory_settings ois
      WHERE ois.organization_id = v_org;

      SELECT l.action_type, l.status, l.error_message, l.execution_data, l.executed_at
        INTO v_ded_log
      FROM public.workflow_execution_log l
      WHERE l.source_entity = 'contract'
        AND l.source_record_id = p_contract_id
        AND l.action_type IN ('trigger:contract_stock_deduction', 'trigger:contract_stock_deduction_no_warehouse')
      ORDER BY l.executed_at DESC NULLS LAST, l.id DESC
      LIMIT 1;

      IF FOUND AND COALESCE(v_ded_mode, 'contract_signed') = 'contract_signed' THEN
        IF v_ded_log.action_type = 'trigger:contract_stock_deduction_no_warehouse' THEN
          v_ded_warning := 'A baixa automática de stock não foi feita: não havia nenhum armazém elegível (ativo, que sirva clientes e não seja viatura). Dê saída do stock reservado em «Saída de stock».';
        ELSIF v_ded_log.status = 'error' THEN
          v_ded_warning := 'A baixa automática de stock falhou. Dê saída do stock reservado em «Saída de stock».';
        ELSIF COALESCE((v_ded_log.execution_data ->> 'lines_skipped')::integer, 0) > 0 THEN
          v_ded_warning := format('A baixa automática de stock saltou %s linha(s). Dê saída do stock reservado em «Saída de stock».',
                                  (v_ded_log.execution_data ->> 'lines_skipped'));
        END IF;

        IF v_ded_warning IS NOT NULL THEN
          v_ded_info := jsonb_build_object(
            'action_type', v_ded_log.action_type,
            'status',      v_ded_log.status,
            'executed_at', v_ded_log.executed_at,
            'reason',      COALESCE(v_ded_log.execution_data ->> 'reason', v_ded_log.error_message),
            'data',        v_ded_log.execution_data
          );
        END IF;
      END IF;
    END IF;

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
    'delivery_address_override', nullif(btrim(v_cc_delivery), ''),
    -- NOVO (EC por armazém): armazém da EC (único se ec_plan='single'; senão
    -- o com mais reservado; sem reserva, o sugerido para a receção), plano
    -- ('single' | 'split' | 'partial' | 'none') e aviso da baixa automática
    -- (texto pronto a mostrar + detalhe), NULL quando não há nada a avisar.
    'ec_warehouse_id',           v_ec_warehouse_id,
    'ec_warehouse_name',         v_ec_warehouse_name,
    'ec_plan',                   v_ec_plan,
    'stock_deduction_warning',   v_ded_warning,
    'stock_deduction',           v_ded_info
  );
END;
$function$
;

-- ------------------------------------------------------------
-- 8. rpc_confirm_client_order_stock_exit (recusa viaturas)
-- ------------------------------------------------------------
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
  -- NOVO (serve clientes)
  v_wh_name         text;
  v_wh_active       boolean;
  v_wh_serves       boolean;
  v_wh_vehicle      boolean;  -- NOVO (EC por armazém)
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

  -- NOVO (serve clientes): só se dá saída para EC de um armazém ativo que
  -- serve clientes. Armazém inexistente/de outra org/apagado continua a cair
  -- na validação de quantidade mais abaixo, como antes.
  SELECT w.name, w.is_active, w.serves_customers, COALESCE(w.is_vehicle, false)
    INTO v_wh_name, v_wh_active, v_wh_serves, v_wh_vehicle
  FROM public.warehouses w
  WHERE w.id = p_warehouse_id
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF FOUND AND NOT COALESCE(v_wh_active, false) THEN
    RAISE EXCEPTION 'O armazém "%" está inativo — escolha outro armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  IF FOUND AND NOT COALESCE(v_wh_serves, false) THEN
    RAISE EXCEPTION 'O armazém "%" não serve encomendas de cliente — escolha outro armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (EC por armazém): o stock de viaturas não entra na reserva das EC.
  IF FOUND AND v_wh_vehicle THEN
    RAISE EXCEPTION 'O armazém "%" é uma viatura — a saída para encomendas de cliente é feita de um armazém', v_wh_name
      USING ERRCODE = 'check_violation';
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
$function$
;

-- ------------------------------------------------------------
-- Saída de stock para uma EC repartida por armazéns (uma só confirmação por
-- produto). As mesmas verificações de rpc_confirm_client_order_stock_exit e
-- de rpc_decrement_stock (organização visível, inventory.edit +
-- client_orders.view + client_orders.confirm_stock_exit, EC assinada, produto
-- na EC, sem saída anterior não estornada, não coberto por PO, total <=
-- reservado, cada armazém elegível e com a quantidade). Grava um movimento
-- 'saida' por armazém, todos com o mesmo número de documento.
--   p_allocations: [{"warehouse_id": uuid, "quantity": inteiro > 0}, ...]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit_split(p_contract_id uuid, p_product_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_is_manual       boolean;
  v_status          text;
  v_order_label     text;
  v_total           integer;
  v_n_alloc         integer;
  v_reserved        numeric;
  v_line_count      integer;
  v_needed          numeric;
  v_ordered         numeric;
  v_po_numbers      text;
  v_a               record;
  v_wh_qty          integer;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
  v_actor           uuid;
  v_doc             text;
  v_mv_id           uuid;
  v_balance         integer;
  v_moves           jsonb := '[]'::jsonb;
BEGIN
  IF p_contract_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e product_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Indique pelo menos um armazém e quantidade' USING ERRCODE = 'check_violation';
  END IF;

  -- Formato: armazém uuid, quantidade inteira positiva, sem armazéns repetidos.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) e
    WHERE jsonb_typeof(e) <> 'object'
       OR (e ->> 'warehouse_id') IS NULL
       OR (e ->> 'warehouse_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (e ->> 'quantity') IS NULL
       OR (e ->> 'quantity') !~ '^\s*[0-9]+\s*$'
       OR (e ->> 'quantity')::numeric <= 0
       OR (e ->> 'quantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'Cada linha tem de ter um armazém e uma quantidade inteira positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), count(DISTINCT (e ->> 'warehouse_id')::uuid), SUM((e ->> 'quantity')::integer)
    INTO v_n_alloc, v_line_count, v_total
  FROM jsonb_array_elements(p_allocations) e;

  IF v_n_alloc <> v_line_count THEN
    RAISE EXCEPTION 'O mesmo armazém aparece mais de uma vez' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number,
         COALESCE(cc.is_manual_order, false), cc.status,
         COALESCE(cc.order_number, cc.contract_number)
    INTO v_org, v_contract_number, v_order_number, v_is_manual, v_status, v_order_label
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
    RAISE EXCEPTION 'A encomenda % não está assinada — só é possível dar saída de stock para encomendas de cliente assinadas', v_order_label
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cada armazém tem de ser elegível (ativo, serve clientes, não apagado, não
  -- viatura) e desta organização.
  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, w.name, w.organization_id AS worg,
           w.deleted_at, w.is_active, w.serves_customers, COALESCE(w.is_vehicle, false) AS is_vehicle
    FROM jsonb_array_elements(p_allocations) e
    LEFT JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
  LOOP
    IF v_a.worg IS DISTINCT FROM v_org OR v_a.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(v_a.is_active, false) THEN
      RAISE EXCEPTION 'O armazém "%" está inativo — escolha outro armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(v_a.serves_customers, false) THEN
      RAISE EXCEPTION 'O armazém "%" não serve encomendas de cliente — escolha outro armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
    IF v_a.is_vehicle THEN
      RAISE EXCEPTION 'O armazém "%" é uma viatura — a saída para encomendas de cliente é feita de um armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Lock por produto (mesma ordem que o confirm e fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

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
    RAISE EXCEPTION 'Este produto já teve saída de stock registada na encomenda % — estorne a saída anterior antes de registar outra', v_order_label
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT count(*),
         COALESCE(SUM(r.qty_needed), 0),
         COALESCE(SUM(r.qty_ordered), 0),
         COALESCE(SUM(r.qty_reserved), 0)
    INTO v_line_count, v_needed, v_ordered, v_reserved
  FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_ordered > 0 THEN
    SELECT string_agg(DISTINCT COALESCE(po.order_number, po.id::text), ', ')
      INTO v_po_numbers
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id = p_contract_id
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id = p_product_id;
  END IF;

  IF v_needed > 0 AND v_ordered >= v_needed THEN
    RAISE EXCEPTION 'Este produto da encomenda % já está coberto pela encomenda a fornecedor % (recebida ou a caminho) — não é possível dar também saída de stock',
      v_order_label, COALESCE(v_po_numbers, '—')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_total > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta ou já encomendado ao fornecedor. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Cada armazém tem de ter a sua quantidade (linhas já trancadas acima).
  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, (e ->> 'quantity')::integer AS qty, w.name
    FROM jsonb_array_elements(p_allocations) e
    JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
  LOOP
    v_wh_qty := NULL;
    SELECT s.quantity INTO v_wh_qty
    FROM public.stocks s
    WHERE s.product_id = p_product_id
      AND s.warehouse_id = v_a.wid
      AND s.deleted_at IS NULL;

    IF COALESCE(v_wh_qty, 0) < v_a.qty THEN
      RAISE EXCEPTION 'O armazém "%" só tem % un — ajuste a quantidade ou escolha outro armazém',
        v_a.name, GREATEST(COALESCE(v_wh_qty, 0), 0)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Notas: as mesmas de rpc_confirm_client_order_stock_exit.
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

  v_doc := public.fn_next_stock_document_number(v_org, 'venda');

  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, (e ->> 'quantity')::integer AS qty, w.name
    FROM jsonb_array_elements(p_allocations) e
    JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
    ORDER BY (e ->> 'quantity')::integer DESC, COALESCE(w.name, ''), w.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, counterparty, notes, created_by,
      sale_source_type, sale_source_id
    ) VALUES (
      v_org, p_product_id, v_a.wid, 'saida', v_a.qty,
      v_doc, 'venda', NULL, v_notes, v_actor,
      'contract', p_contract_id
    )
    RETURNING id, balance_after INTO v_mv_id, v_balance;

    v_moves := v_moves || jsonb_build_object(
      'warehouse_id', v_a.wid, 'warehouse_name', v_a.name, 'quantity', v_a.qty,
      'movement_id', v_mv_id, 'balance_after', v_balance);
  END LOOP;

  RETURN jsonb_build_object(
    'success',         true,
    'document_number', v_doc,
    'total_quantity',  v_total,
    'movements',       v_moves
  );
END;
$function$;

-- ------------------------------------------------------------
-- Permissões: internas só service_role (como as que já existiam); RPCs para
-- authenticated (como antes), nunca anon nem PUBLIC.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_normalize_pt_postal_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_postal_code_coords(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_client_order_coords(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_client_order_warehouses(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_client_order_line_reservations_wh(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_normalize_pt_postal_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_postal_code_coords(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_client_order_coords(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_client_order_warehouses(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_client_order_line_reservations_wh(uuid, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_client_order_list_readiness(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_client_order_list_readiness(uuid, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_confirm_client_order_stock_exit_split(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit_split(uuid, uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_client_order_line_reservations_wh(uuid, uuid[]) IS
  'Reserva das Encomendas de Cliente por armazém (EC a EC, ordem FIFO): um armazém elegível que cubra tudo (mais próximo / por omissão / mais stock livre / nome), senão linha a linha e repartido. Mesmas colunas de fn_client_order_line_reservations + warehouse_id, warehouse_alloc, ec_warehouse_id, ec_plan. Calcula sempre a organização inteira; p_product_ids só filtra a saída.';
COMMENT ON FUNCTION public.fn_client_order_warehouses(uuid) IS
  'Armazéns elegíveis para Encomendas de Cliente: ativos, serves_customers, não apagados, não viatura; com coordenadas (ficha ou CP pela cache postal_codes) e se são o armazém por omissão.';
COMMENT ON FUNCTION public.rpc_confirm_client_order_stock_exit_split(uuid, uuid, jsonb) IS
  'Saída de stock de um produto para uma Encomenda de Cliente repartida por armazéns elegíveis ([{warehouse_id, quantity}]), numa só confirmação; mesmas verificações de rpc_confirm_client_order_stock_exit / rpc_decrement_stock.';
