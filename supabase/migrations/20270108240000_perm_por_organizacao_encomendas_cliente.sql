-- =============================================================================
-- 20270108240000 — Lote B (P1.4): permissão por organização · encomendas de cliente
-- =============================================================================
-- Só verificação de permissão: cada has_anew_permission / has_scheduling_permission
-- (globais) passa a has_anew_permission_for_org(uid, código, organização da linha)
-- ou, quando a organização só se conhece depois, a verificação de âmbito usa
-- get_user_permission_org_ids(uid, código) em vez de get_user_visible_org_ids.
-- As verificações globais que já existiam ficam (mesmas mensagens). Nada mais muda.
-- Cada função parte de pg_get_functiondef da versão viva (05/11/2026).
-- Funções: fn_entity_delivery_address_access, restore_business_entity, rpc_client_order_list_readiness, rpc_confirm_client_order_stock_exit, rpc_confirm_client_order_stock_exit_split, rpc_create_manual_client_order, rpc_delete_client_order, rpc_get_client_order_document, rpc_get_manual_client_order_edit, rpc_list_client_order_documents, rpc_request_missing_from_supplier, rpc_revert_client_order_stock_exit, rpc_update_client_order_header, rpc_update_manual_client_order
-- =============================================================================

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
    -- NOVO (20261205010000): client_orders.edit (morada nova ao editar a
    -- encomenda) ou client_orders.create (ao criar uma encomenda manual), em
    -- vez de client_contracts.edit.
    IF NOT (public.has_anew_permission(v_uid, 'client_orders.edit')
            OR public.has_anew_permission(v_uid, 'client_orders.create')) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.anew_clients c
    WHERE c.entity_id = p_entity_id
      AND c.deleted_at IS NULL
      AND public.fn_deal_org_in_scope(c.organization_id)
      AND CASE WHEN p_mode = 'view'
               THEN public.has_anew_permission_for_org(v_uid, 'client_orders.view', c.organization_id)
               ELSE public.has_anew_permission_for_org(v_uid, 'client_orders.edit', c.organization_id)
                 OR public.has_anew_permission_for_org(v_uid, 'client_orders.create', c.organization_id)
          END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_target_org uuid;
  -- NOVO (20261204900000)
  v_contract_manual boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id INTO v_target_org FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT organization_id, is_manual_order INTO v_target_org, v_contract_manual
      FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204900000): restaurar é o inverso de eliminar e exige a mesma
  -- permissão. Encomendas de cliente (manuais / venda direta) exigem
  -- client_orders.delete; contratos reais client_contracts.delete. Uma
  -- encomenda restaurada continua 'cancelled' (sem efeitos em stock) e a VD
  -- continua 'cancelada' — só volta a aparecer.
  IF p_kind = 'contract' THEN
    IF COALESCE(v_contract_manual, false) THEN
      IF NOT public.has_anew_permission_for_org(v_actor, 'client_orders.delete', v_target_org) THEN
        RAISE EXCEPTION 'Sem permissao para restaurar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NOT public.has_anew_permission(v_actor, 'client_contracts.delete') THEN
      RAISE EXCEPTION 'Sem permissao para restaurar contratos' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at = NULL, deleted_by = NULL, is_deleted = false
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'restored', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_client_order_list_readiness(p_organization_id uuid, p_contract_ids uuid[] DEFAULT NULL::uuid[])
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
     OR NOT (COALESCE(public.has_anew_permission_for_org(v_uid, 'client_orders.view', p_organization_id), false) OR public.fn_neg_papel_permite(p_organization_id, 'client_orders.view')) THEN -- 20270101360000
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
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)  -- NOVO (20261205000000): era client_contracts.view
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.confirm_stock_exit', v_org) THEN
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
$function$;

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

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.confirm_stock_exit', v_org) THEN
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

CREATE OR REPLACE FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_entity_id    uuid;
  v_root_org_id  uuid;
  v_client_id    uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_contract     public.client_contracts;
  v_item         jsonb;
  v_ordem        integer := 0;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_product_id   uuid;
  v_service_id   uuid;
  v_sem_iva      numeric;
  v_total_sem    numeric := 0;
  v_total_com    numeric := 0;
  v_start_date   date;
  v_prod_uom     text;  -- NOVO (20261204290000)
BEGIN
  -- ── Ator de negócio (== created_by no frontend) ──────────────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização: permissão de criar encomendas de cliente ────────────────
  -- NOVO (20261205010000): client_orders.create em vez de
  -- client_contracts.create. O contrato sintético continua a ser criado aqui
  -- (draft -> signed na mesma transação); quem o pode fazer é que muda.
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.create', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Cliente (entidade) ───────────────────────────────────────────────────
  v_entity_id := nullif(p_order ->> 'entity_id', '')::uuid;
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar o cliente da encomenda' USING ERRCODE = 'check_violation';
  END IF;

  -- `anew_entities` é agnóstica à organização (id, type, display_name, ...):
  -- quem carrega o âmbito organizacional é a ficha de cliente `anew_clients`.
  -- Exigir essa ficha é também a validação de âmbito: uma Encomenda Cliente só
  -- pode existir para um cliente real desta organização.
  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_entity_id
     AND c.organization_id = p_organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_entity_id;

  -- ── Linhas ───────────────────────────────────────────────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;

    IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
      RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
    END IF;

    v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
    IF v_qt IS NULL OR v_qt <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.services s WHERE s.id = v_service_id
    ) THEN
      RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
    END IF;

    -- NOVO (20261204290000): unidade contável (embalagem escolhida, ou
    -- unidade base do produto un/EA/PCS/BOX/PKG) => quantidade inteira.
    v_prod_uom := NULL;
    IF v_product_id IS NOT NULL THEN
      SELECT lower(u.code) INTO v_prod_uom
        FROM public.products p
        LEFT JOIN public.uom u ON u.id = p.uom_id
       WHERE p.id = v_product_id;
    END IF;

    IF (nullif(v_item ->> 'uom_id', '') IS NOT NULL
        OR v_prod_uom IN ('un', 'ea', 'pcs', 'box', 'pkg'))
       AND v_qt <> trunc(v_qt) THEN
      RAISE EXCEPTION 'A quantidade da linha "%" tem de ser um número inteiro (unidade contável)',
        COALESCE(nullif(v_item ->> 'descricao', ''), 'Item') USING ERRCODE = 'check_violation';
    END IF;

    v_preco   := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva     := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva := round(v_qt * v_preco, 2);

    v_total_sem := v_total_sem + v_sem_iva;
    v_total_com := v_total_com + round(v_sem_iva * (1 + v_iva / 100), 2);
  END LOOP;

  -- ── 1. Orçamento sintético (nunca aparece em Quotes.tsx / Proposals.tsx) ──
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas,
    obra_endereco  -- NOVO (20261204280000)
  )
  VALUES (
    v_entity_id, v_client_id, p_organization_id, v_root_org_id,
    v_actor, 'aceite', true, 'EUR',
    v_total_sem, v_total_com, 23, now(),
    'Encomenda manual — ' || COALESCE(v_entity_name, 'cliente'),
    nullif(p_order ->> 'notes', ''),
    nullif(btrim(p_order ->> 'delivery_address'), '')
  )
  RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_ordem      := v_ordem + 1;

    INSERT INTO public.quote_lines (
      quote_id, categoria, descricao_snapshot,
      qt, product_id, service_id,
      custo_material_unit, margem_percent, iva_percent,
      total_sem_iva, total_com_iva, total_com_desconto,
      ordem, section_name,
      uom_id  -- NOVO (20261204204500)
    )
    VALUES (
      v_quote_id,
      COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral'),
      COALESCE(nullif(v_item ->> 'descricao', ''), 'Item'),
      v_qt, v_product_id, v_service_id,
      v_preco, 0, v_iva,
      v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
      v_ordem, 'Geral',
      nullif(v_item ->> 'uom_id', '')::uuid
    );
  END LOOP;

  -- ── 2. Contrato em rascunho (contract_number é gerado pelo trigger
  --       trigger_set_client_contract_number, BEFORE INSERT) ────────────────
  v_start_date := COALESCE(nullif(p_order ->> 'start_date', '')::date, current_date);

  -- contract_number fica NULL de propósito: o trigger set_client_contract_number
  -- só gera o número quando o valor vem NULL (um '' passaria incólume e a
  -- encomenda ficaria sem número).
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_entity_id, v_quote_id,
    p_organization_id, v_root_org_id, v_actor,
    'draft', v_total_com, 'EUR', v_start_date,
    nullif(p_order ->> 'notes', ''),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 3. Promover a assinado: é este UPDATE que dispara a dedução de stock e
  --       os pedidos a fornecedor (AFTER UPDATE OF status) ──────────────────
  UPDATE public.client_contracts
     SET status          = 'signed',
         signature_date  = now(),
         accepted_at     = now(),
         signed_by_name  = COALESCE(v_entity_name, 'Encomenda manual'),
         status_changed_by = v_actor,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_client_order(p_contract_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_actor            uuid;
  v_contract         public.client_contracts;
  v_reason           text;
  v_full_access      boolean := false;
  v_blocking_pos     text;
  v_invoiced_sales   text;
  v_movs_before      integer := 0;
  v_pending_before   integer := 0;
  v_movs_left        integer := 0;
  v_pos_left         text;
  v_ds_cancelled     integer := 0;
  v_entity_id        uuid;
  v_err              text;
BEGIN
  -- ── Autenticação e permissão ─────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.has_anew_permission(v_uid, 'client_orders.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indique o motivo da eliminação (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'O motivo não pode ter mais de 500 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Leitura com lock (serializa duas eliminações da mesma encomenda) ─────
  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo helper de âmbito de organização que rpc_update_client_order_header.
  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id)
     OR NOT public.has_anew_permission_for_org(v_uid, 'client_orders.delete', v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Âmbito por registo (client_orders.delete tem supports_scope) ─────────
  -- Acesso total: super admin na organização ou num antepassado (o mesmo que
  -- resolve_lead_access_context e o frontend tratam como ORG), ou system
  -- admin que seja membro direto da organização ou tenha sessão de suporte
  -- ativa nela (padrão de 20261204800000 / system_admin_pii_default_deny).
  -- Restantes: chaves de âmbito da própria permissão (ORG / TEAM / OWNED),
  -- casadas com created_by ou assigned_to, como a RLS client_contracts_delete.
  v_full_access :=
    (public.is_system_admin(v_uid)
       AND (v_contract.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))
            OR public.has_active_support_access(v_contract.organization_id)))
    OR EXISTS (
      WITH RECURSIVE chain AS (
        SELECT v_contract.organization_id AS org_id
        UNION
        SELECT h.parent_org_id
          FROM public.anew_hierarchy h
          JOIN chain c ON c.org_id = h.child_org_id
         WHERE h.parent_org_id IS NOT NULL
      )
      SELECT 1
        FROM public.anew_memberships m
        JOIN public.anew_users u ON u.id = m.user_id
        JOIN public.anew_roles r ON r.id = m.role_id
       WHERE u.auth_user_id = v_uid
         AND m.status = 'active'
         AND r.code = 'super_admin'
         AND m.organization_id IN (SELECT org_id FROM chain)
    );

  IF NOT v_full_access AND NOT EXISTS (
    SELECT 1
      FROM unnest(public.crm_scope_keys('client_orders.delete')) AS k(scope_key)
     WHERE k.scope_key = v_contract.organization_id::text || ':*'
        OR k.scope_key = v_contract.organization_id::text || ':' || v_contract.created_by::text
        OR k.scope_key = v_contract.organization_id::text || ':' || v_contract.assigned_to::text
  ) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar esta encomenda (fora do seu âmbito)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Origem e estado ──────────────────────────────────────────────────────
  IF NOT COALESCE(v_contract.is_manual_order, false) THEN
    RAISE EXCEPTION 'Encomendas de contrato são anuladas no módulo Contratos' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta encomenda já está anulada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível eliminar encomendas ativas (estado atual: %)', v_contract.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Pedidos a fornecedor já em curso ─────────────────────────────────────
  -- O gatilho de anulação só cancela os 'pending'; os restantes ficariam
  -- órfãos. Recusa-se antes de mexer em nada.
  SELECT string_agg(po.order_number, ', ' ORDER BY po.order_number)
    INTO v_blocking_pos
    FROM public.purchase_orders po
   WHERE po.source_type = 'contract'
     AND po.source_id = p_contract_id
     AND po.deleted_at IS NULL
     AND po.status IN ('ordered', 'partially_received', 'received');

  IF v_blocking_pos IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível eliminar: esta encomenda já tem pedidos a fornecedor encomendados ou recebidos (%). Trate-os primeiro em Encomendas a Fornecedor.', v_blocking_pos
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Venda direta ligada ──────────────────────────────────────────────────
  PERFORM 1
    FROM public.direct_sales ds
   WHERE ds.client_contract_id = p_contract_id
     AND ds.deleted_at IS NULL
   FOR UPDATE;

  SELECT string_agg(COALESCE(ds.sale_number, ds.id::text), ', ' ORDER BY ds.sale_number)
    INTO v_invoiced_sales
    FROM public.direct_sales ds
   WHERE ds.client_contract_id = p_contract_id
     AND ds.deleted_at IS NULL
     AND ds.invoice_status = 'emitida';

  IF v_invoiced_sales IS NOT NULL THEN
    RAISE EXCEPTION 'A venda direta % já tem fatura registada; a encomenda não pode ser eliminada', v_invoiced_sales
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Contagens antes (para o retorno e para a verificação) ────────────────
  SELECT count(*) INTO v_movs_before
    FROM public.stock_movements sm
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = p_contract_id
     AND sm.movement_type IN ('venda', 'saida')
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id);

  SELECT count(*) INTO v_pending_before
    FROM public.purchase_orders po
   WHERE po.source_type = 'contract'
     AND po.source_id = p_contract_id
     AND po.status = 'pending';

  -- ── Anulação (mesmas colunas de cancel_and_replace_contract) ─────────────
  -- Este UPDATE OF status dispara trg_contract_cancelled_stock_reversal e
  -- trg_contract_cancelled_supplier_request_reversal.
  PERFORM public.set_audit_context(v_actor, 'crm');

  UPDATE public.client_contracts
     SET status              = 'cancelled',
         cancelled_at        = now(),
         cancelled_by        = v_actor,
         cancellation_reason = v_reason,
         status_changed_by   = v_actor,
         status_changed_at   = now()
   WHERE id = p_contract_id;

  -- ── Verificação: os gatilhos são best-effort, aqui não pode ser ──────────
  SELECT count(*) INTO v_movs_left
    FROM public.stock_movements sm
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = p_contract_id
     AND sm.movement_type IN ('venda', 'saida')
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id);

  IF v_movs_left > 0 THEN
    -- O registo de erro do gatilho é revertido com esta exceção: copia-se a
    -- causa para a mensagem (executed_at = now() = esta transação).
    SELECT l.error_message INTO v_err
      FROM public.workflow_execution_log l
     WHERE l.source_entity = 'contract'
       AND l.source_record_id = p_contract_id
       AND l.status = 'error'
       AND l.action_type IN ('trigger:contract_stock_reversal_line_error', 'trigger:contract_stock_reversal')
       AND l.executed_at = now()
     LIMIT 1;
    RAISE EXCEPTION 'Não foi possível devolver o stock de % movimento(s) desta encomenda; a encomenda não foi eliminada%',
      v_movs_left, COALESCE(' (' || v_err || ')', '')
      USING ERRCODE = 'internal_error';
  END IF;

  SELECT string_agg(po.order_number, ', ' ORDER BY po.order_number)
    INTO v_pos_left
    FROM public.purchase_orders po
   WHERE po.source_type = 'contract'
     AND po.source_id = p_contract_id
     AND po.status = 'pending';

  IF v_pos_left IS NOT NULL THEN
    RAISE EXCEPTION 'Não foi possível cancelar os pedidos a fornecedor pendentes (%); a encomenda não foi eliminada', v_pos_left
      USING ERRCODE = 'internal_error';
  END IF;

  -- ── Venda direta: cancelada, ligação mantida (histórico) ─────────────────
  -- Corre como postgres: o gatilho trg_direct_sales_00_guard_system_columns
  -- só trava authenticated/anon (saída de 'aceite').
  UPDATE public.direct_sales
     SET status = 'cancelada'
   WHERE client_contract_id = p_contract_id
     AND deleted_at IS NULL
     AND status IS DISTINCT FROM 'cancelada';
  GET DIAGNOSTICS v_ds_cancelled = ROW_COUNT;

  INSERT INTO public.client_contract_events (
    contract_id, event_type, description, new_values, created_by
  ) VALUES (
    p_contract_id, 'contract_cancelled', v_reason,
    jsonb_build_object(
      'source',                'rpc_delete_client_order',
      'reversed_movements',    v_movs_before,
      'cancelled_pos',         v_pending_before,
      'direct_sale_cancelled', v_ds_cancelled > 0
    ),
    v_actor
  );

  -- ── Soft delete (o que _soft_delete_business_entity_impl faz a contratos)
  UPDATE public.client_contracts
     SET deleted_at = now(),
         deleted_by = v_actor
   WHERE id = p_contract_id
     AND deleted_at IS NULL
  RETURNING entity_id INTO v_entity_id;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'deleted', 'contract', NULL, p_contract_id::text, v_actor,
              jsonb_build_object('kind', 'contract', 'id', p_contract_id,
                                 'organization_id', v_contract.organization_id,
                                 'source', 'rpc_delete_client_order',
                                 'reason', v_reason));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Retirar do portal do cliente na mesma transação (20261201070000).
  UPDATE public.client_portal_documents
     SET is_visible = false,
         revoked_at = now(),
         revoked_by = v_actor
   WHERE document_type = 'contract'::public.portal_document_type
     AND document_id = p_contract_id
     AND is_visible = true;

  RETURN jsonb_build_object(
    'success',               true,
    'contract_id',           p_contract_id,
    'order_number',          COALESCE(v_contract.order_number, v_contract.contract_number),
    'reversed_movements',    v_movs_before,
    'cancelled_pos',         v_pending_before,
    'direct_sale_cancelled', v_ds_cancelled > 0
  );
END;
$function$;

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
     OR NOT (public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org) OR public.fn_neg_papel_permite(v_org, 'client_orders.view')) THEN -- 20270101360000
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_manual_client_order_edit(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract public.client_contracts;
  v_lines    jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261205010000): permissão própria client_orders.edit em vez de
  -- client_contracts.edit.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.edit', v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_contract.is_manual_order, false)
     OR EXISTS (SELECT 1 FROM public.direct_sales ds WHERE ds.client_contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'Só as encomendas manuais podem ser editadas' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível editar encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.quote_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = v_contract.quote_id AND q.is_internal = true
  ) THEN
    RAISE EXCEPTION 'Encomenda manual sem orçamento interno associado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ql) ORDER BY ql.ordem), '[]'::jsonb)
    INTO v_lines
    FROM public.quote_lines ql
   WHERE ql.quote_id = v_contract.quote_id;

  RETURN jsonb_build_object(
    'quote_id',  v_contract.quote_id,
    'entity_id', v_contract.entity_id,
    'lines',     v_lines
  );
END;
$function$;

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
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', p_organization_id) THEN
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
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado
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
      cco.delivery_address AS a_cc_delivery_address,
      -- NOVO (20261205210000): proforma da venda direta, só para pesquisa;
      -- mesma visibilidade que origin_number (direct_sales.view).
      CASE WHEN ds.ds_found AND v_can_see_ds THEN ds.ds_proforma_number END AS a_ds_proforma_number
    FROM combined c
    JOIN public.client_contracts cco ON cco.id = c.a_contract_id
    LEFT JOIN LATERAL (
      SELECT true AS ds_found, d.sale_number AS ds_sale_number,
             d.proforma_number AS ds_proforma_number  -- NOVO (20261205210000)
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
        -- NOVO (20261205210000): nº da venda direta de origem (VD-...) e a
        -- sua proforma (PF-...). origin_number já vem a NULL sem
        -- direct_sales.view, logo a pesquisa não revela VDs escondidas.
        OR strpos(lower(COALESCE(f.a_origin_number, '')), lower(p_search)) > 0
        OR strpos(lower(COALESCE(f.a_ds_proforma_number, '')), lower(p_search)) > 0
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
     OR NOT public.fn_deal_org_in_scope(v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.create', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org) THEN
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
  -- NOVO (saída repartida)
  v_part            record;
  v_reversed        jsonb := '[]'::jsonb;
  v_self_reversed   boolean;
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

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)  -- NOVO (20261205000000): era client_contracts.view
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.confirm_stock_exit', v_org) THEN
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

  -- NOVO (saída repartida): uma saída confirmada pode ter várias parcelas
  -- (rpc_confirm_client_order_stock_exit_split: um movimento 'saida' por
  -- armazém, mesmo document_number, contrato e produto). Estorna-se a saída
  -- inteira: este movimento e as parcelas irmãs ainda não estornadas. Só há
  -- uma saída ativa por (encomenda, produto) — as confirmações recusam outra
  -- —, por isso as irmãs não estornadas são sempre da mesma saída. Trancadas
  -- por id (ordem fixa). Já estornado este movimento e todas as irmãs → o
  -- mesmo erro de antes; se faltar alguma irmã (estorno antigo parcial),
  -- estorna-se o que falta.
  v_self_reversed := EXISTS (
    SELECT 1 FROM public.stock_movements r
    WHERE r.reversal_of_movement_id = v_mov.id
  );

  PERFORM 1
  FROM public.stock_movements sm
  WHERE sm.organization_id = v_org
    AND sm.sale_source_type = 'contract'
    AND sm.sale_source_id = p_contract_id
    AND sm.product_id = v_mov.product_id
    AND sm.movement_type = 'saida'
    AND v_mov.document_number IS NOT NULL
    AND sm.document_number = v_mov.document_number
    AND sm.id <> v_mov.id
  ORDER BY sm.id
  FOR UPDATE;

  IF v_self_reversed AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
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
  IF NOT v_self_reversed THEN
    v_result := public.fn_client_order_reverse_stock_movement(v_mov.id, v_actor, v_notes);

    IF COALESCE(v_result ->> 'status', '') <> 'reversed' THEN
      RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
    END IF;

    v_balance_after := (v_result ->> 'balance_after')::integer;
    v_reversed := v_reversed || jsonb_build_object(
      'movement_id', v_mov.id, 'warehouse_id', v_mov.warehouse_id, 'quantity', v_mov.quantity,
      'reversal_movement_id', v_result ->> 'reversal_movement_id', 'balance_after', v_balance_after);
  END IF;

  -- NOVO (saída repartida): as outras parcelas da mesma saída.
  FOR v_part IN
    SELECT sm.id, sm.warehouse_id, sm.quantity
    FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
    ORDER BY sm.id
  LOOP
    v_result := public.fn_client_order_reverse_stock_movement(v_part.id, v_actor, v_notes);
    IF COALESCE(v_result ->> 'status', '') = 'reversed' THEN
      v_reversed := v_reversed || jsonb_build_object(
        'movement_id', v_part.id, 'warehouse_id', v_part.warehouse_id, 'quantity', v_part.quantity,
        'reversal_movement_id', v_result ->> 'reversal_movement_id',
        'balance_after', (v_result ->> 'balance_after')::integer);
      IF v_balance_after IS NULL THEN
        v_balance_after := (v_result ->> 'balance_after')::integer;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after,          -- saldo do armazém do movimento pedido (ou da 1.ª parcela)
    'reversed',      v_reversed                -- NOVO (saída repartida): parcelas estornadas
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_client_order_header(p_contract_id uuid, p_delivery_address text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract public.client_contracts;
  v_address  text;
  v_notes    text;
  v_actor    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261205010000): permissão própria client_orders.edit em vez de
  -- client_contracts.edit.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_address := nullif(btrim(p_delivery_address), '');
  -- Notas: conteúdo guardado tal como enviado; só vazio/espaços => NULL.
  v_notes := CASE WHEN nullif(btrim(p_notes), '') IS NULL THEN NULL ELSE p_notes END;

  IF length(v_address) > 500 THEN
    RAISE EXCEPTION 'A morada de entrega não pode ter mais de 500 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  IF length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'As notas não podem ter mais de 2000 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.edit', v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Manual verdadeira = is_manual_order sem venda direta (a mesma condição que
  -- rpc_update_manual_client_order aceita): essa tem edição própria.
  IF COALESCE(v_contract.is_manual_order, false)
     AND NOT EXISTS (SELECT 1 FROM public.direct_sales ds WHERE ds.client_contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'Use a edição completa da encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível editar encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  -- Só escreve se algo mudou (evita auditoria vazia e o recálculo de etapa das
  -- leads que fn_mark_lead_pipeline_dirty faz em qualquer UPDATE).
  IF v_contract.delivery_address IS DISTINCT FROM v_address
     OR v_contract.notes IS DISTINCT FROM v_notes THEN
    v_actor := public.current_business_user_id();
    IF v_actor IS NOT NULL THEN
      PERFORM public.set_audit_context(v_actor, 'crm');
    END IF;

    UPDATE public.client_contracts
       SET delivery_address = v_address,
           notes            = v_notes
     WHERE id = p_contract_id
    RETURNING * INTO v_contract;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'contract_id',      v_contract.id,
    'delivery_address', v_contract.delivery_address,
    'notes',            v_contract.notes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_manual_client_order(p_contract_id uuid, p_items jsonb, p_delivery_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract     public.client_contracts;
  v_quote_id     uuid;
  v_item         jsonb;
  v_line         public.quote_lines;
  v_line_id      uuid;
  v_seen_ids     uuid[] := ARRAY[]::uuid[];
  v_product_id   uuid;
  v_service_id   uuid;
  v_uom_id       uuid;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_sem_iva      numeric;
  v_descricao    text;
  v_categoria    text;
  v_prod_uom     text;
  v_ordem        integer;
  v_total_sem    numeric;
  v_total_com    numeric;
  v_total_fees   numeric;
  v_changed      boolean;
  -- NOVO (20261204310000)
  v_request_ids  uuid[] := ARRAY[]::uuid[];
  v_new_line_id  uuid;
  v_actor        uuid;
  v_trigger_mode text;
  v_request      jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Autorização: permissão de edição de encomendas de cliente ───────────
  -- NOVO (20261205010000): client_orders.edit em vez de client_contracts.edit.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo âmbito de rpc_create_manual_client_order.
  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.edit', v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_contract.is_manual_order, false)
     OR EXISTS (SELECT 1 FROM public.direct_sales ds WHERE ds.client_contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'Só as encomendas manuais podem ser editadas' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível editar encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  v_quote_id := v_contract.quote_id;
  IF v_quote_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = v_quote_id AND q.is_internal = true
  ) THEN
    RAISE EXCEPTION 'Encomenda manual sem orçamento interno associado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM public.quotes q WHERE q.id = v_quote_id FOR UPDATE;

  -- ── Validação das linhas (antes de qualquer escrita) ────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_id    := nullif(v_item ->> 'quote_line_id', '')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_uom_id     := nullif(v_item ->> 'uom_id', '')::uuid;

    IF v_line_id IS NOT NULL THEN
      IF v_line_id = ANY (v_seen_ids) THEN
        RAISE EXCEPTION 'A mesma linha aparece repetida na encomenda' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.quote_lines ql
         WHERE ql.id = v_line_id AND ql.quote_id = v_quote_id
      ) THEN
        RAISE EXCEPTION 'Linha não pertence a esta encomenda: %', v_line_id USING ERRCODE = 'no_data_found';
      END IF;
      v_seen_ids := v_seen_ids || v_line_id;
    END IF;

    IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
      RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
    END IF;

    v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
    IF v_qt IS NULL OR v_qt <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.services s WHERE s.id = v_service_id
    ) THEN
      RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
    END IF;

    -- NOVO (20261204300000): linha existente enviada sem alterações? Mesma
    -- comparação (e mesmos valores por omissão) do ciclo de escrita abaixo.
    v_changed := true;
    IF v_line_id IS NOT NULL THEN
      SELECT * INTO v_line FROM public.quote_lines WHERE id = v_line_id;
      v_changed :=
           v_line.product_id          IS DISTINCT FROM v_product_id
        OR v_line.service_id          IS DISTINCT FROM v_service_id
        OR v_line.qt                  IS DISTINCT FROM v_qt
        OR v_line.custo_material_unit IS DISTINCT FROM COALESCE((v_item ->> 'preco_unit')::numeric, 0)
        OR v_line.iva_percent         IS DISTINCT FROM COALESCE((v_item ->> 'iva_percent')::numeric, 23)
        OR v_line.uom_id              IS DISTINCT FROM v_uom_id
        OR v_line.descricao_snapshot  IS DISTINCT FROM COALESCE(nullif(v_item ->> 'descricao', ''), 'Item')
        OR v_line.categoria           IS DISTINCT FROM COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral');
    END IF;

    -- NOVO (20261204300000): produto trancado no contrato (saída de stock sem
    -- estorno ou pedido a fornecedor não cancelado) não pode ganhar quantidade
    -- por uma linha nova, nem por uma linha não trancada que mude para ele.
    IF v_product_id IS NOT NULL
       AND (
             v_line_id IS NULL
             OR (
                  v_line.product_id IS DISTINCT FROM v_product_id
                  AND NOT public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id)
                )
           )
       AND public.fn_client_order_product_locked(p_contract_id, NULL, v_product_id) THEN
      RAISE EXCEPTION 'O produto % já foi servido ou pedido a fornecedor nesta encomenda — reverta a saída antes de acrescentar quantidade',
        COALESCE(
          nullif(v_item ->> 'descricao', ''),
          (SELECT p.name FROM public.products p WHERE p.id = v_product_id),
          v_product_id::text
        ) USING ERRCODE = 'check_violation';
    END IF;

    -- Unidade contável (embalagem escolhida, ou unidade base do produto
    -- un/EA/PCS/BOX/PKG) => quantidade inteira.
    v_prod_uom := NULL;
    IF v_product_id IS NOT NULL THEN
      SELECT lower(u.code) INTO v_prod_uom
        FROM public.products p
        LEFT JOIN public.uom u ON u.id = p.uom_id
       WHERE p.id = v_product_id;
    END IF;

    -- ALTERADO (20261204300000): só para linhas novas ou alteradas — decimais
    -- antigos em linhas enviadas sem alterações (ex.: já servidas) não
    -- impedem editar o resto da encomenda.
    IF v_changed
       AND (v_uom_id IS NOT NULL OR v_prod_uom IN ('un', 'ea', 'pcs', 'box', 'pkg'))
       AND v_qt <> trunc(v_qt) THEN
      RAISE EXCEPTION 'A quantidade da linha "%" tem de ser um número inteiro (unidade contável)',
        COALESCE(nullif(v_item ->> 'descricao', ''), 'Item') USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- ── Remover linhas ausentes de p_items (nunca as trancadas) ─────────────
  FOR v_line IN
    SELECT * FROM public.quote_lines ql
     WHERE ql.quote_id = v_quote_id
       AND NOT (ql.id = ANY (v_seen_ids))
  LOOP
    IF public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id) THEN
      RAISE EXCEPTION 'A linha "%" não pode ser removida: já saiu de stock ou tem pedido a fornecedor.',
        v_line.descricao_snapshot USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.quote_lines WHERE id = v_line.id;
  END LOOP;

  -- ── Atualizar existentes / inserir novas ────────────────────────────────
  SELECT COALESCE(MAX(ql.ordem), 0) INTO v_ordem
    FROM public.quote_lines ql WHERE ql.quote_id = v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_id    := nullif(v_item ->> 'quote_line_id', '')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_uom_id     := nullif(v_item ->> 'uom_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_descricao  := COALESCE(nullif(v_item ->> 'descricao', ''), 'Item');
    v_categoria  := COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral');

    IF v_line_id IS NOT NULL THEN
      SELECT * INTO v_line FROM public.quote_lines WHERE id = v_line_id FOR UPDATE;

      IF v_line.product_id         IS DISTINCT FROM v_product_id
         OR v_line.service_id      IS DISTINCT FROM v_service_id
         OR v_line.qt              IS DISTINCT FROM v_qt
         OR v_line.custo_material_unit IS DISTINCT FROM v_preco
         OR v_line.iva_percent     IS DISTINCT FROM v_iva
         OR v_line.uom_id          IS DISTINCT FROM v_uom_id
         OR v_line.descricao_snapshot IS DISTINCT FROM v_descricao
         OR v_line.categoria       IS DISTINCT FROM v_categoria THEN

        IF public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id) THEN
          RAISE EXCEPTION 'A linha "%" não pode ser alterada: já saiu de stock ou tem pedido a fornecedor.',
            v_line.descricao_snapshot USING ERRCODE = 'check_violation';
        END IF;

        UPDATE public.quote_lines
           SET product_id          = v_product_id,
               service_id          = v_service_id,
               qt                  = v_qt,
               custo_material_unit = v_preco,
               iva_percent         = v_iva,
               descricao_snapshot  = v_descricao,
               categoria           = v_categoria,
               total_sem_iva       = v_sem_iva,
               total_com_iva       = round(v_sem_iva * (1 + v_iva / 100), 2),
               total_com_desconto  = v_sem_iva,
               uom_id              = v_uom_id,
               -- fn_line_units_per_uom_snapshot repõe unidade/fator quando
               -- há embalagem; sem embalagem a unidade antiga não fica.
               unidade             = CASE WHEN v_uom_id IS DISTINCT FROM v_line.uom_id
                                          THEN NULL ELSE v_line.unidade END
         WHERE id = v_line.id;

        -- NOVO (20261204310000): linha de produto que pode passar a precisar
        -- de mais material (v_line ainda tem os valores antigos).
        IF v_product_id IS NOT NULL
           AND (
                v_line.product_id IS DISTINCT FROM v_product_id
             OR v_line.uom_id     IS DISTINCT FROM v_uom_id
             OR v_qt > COALESCE(v_line.qt, 0)
           ) THEN
          v_request_ids := v_request_ids || v_line.id;
        END IF;
      END IF;
    ELSE
      v_ordem := v_ordem + 1;

      INSERT INTO public.quote_lines (
        quote_id, categoria, descricao_snapshot,
        qt, product_id, service_id,
        custo_material_unit, margem_percent, iva_percent,
        total_sem_iva, total_com_iva, total_com_desconto,
        ordem, section_name,
        uom_id
      )
      VALUES (
        v_quote_id,
        v_categoria,
        v_descricao,
        v_qt, v_product_id, v_service_id,
        v_preco, 0, v_iva,
        v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
        v_ordem, 'Geral',
        v_uom_id
      )
      RETURNING id INTO v_new_line_id;

      -- NOVO (20261204310000)
      IF v_product_id IS NOT NULL THEN
        v_request_ids := v_request_ids || v_new_line_id;
      END IF;
    END IF;
  END LOOP;

  -- ── Totais (mesmas fórmulas da criação: soma das linhas arredondadas) ────
  SELECT COALESCE(SUM(ql.total_sem_iva), 0), COALESCE(SUM(ql.total_com_iva), 0)
    INTO v_total_sem, v_total_com
    FROM public.quote_lines ql
   WHERE ql.quote_id = v_quote_id;

  UPDATE public.quotes
     SET subtotal      = v_total_sem,
         total         = v_total_com,
         obra_endereco = nullif(btrim(p_delivery_address), '')
   WHERE id = v_quote_id
  RETURNING COALESCE(total_fees, 0) INTO v_total_fees;

  -- set_client_contract_total_value_sem_iva não recalcula depois de assinado
  -- (valor congelado): os dois valores são escritos aqui explicitamente.
  UPDATE public.client_contracts
     SET total_value         = v_total_com,
         total_value_sem_iva = v_total_sem + v_total_fees
   WHERE id = p_contract_id
  RETURNING * INTO v_contract;

  -- ── NOVO (20261204310000): pedir ao fornecedor só o que falta ────────────
  IF cardinality(v_request_ids) > 0 THEN
    SELECT ois.stock_deduction_trigger INTO v_trigger_mode
      FROM public.organization_inventory_settings ois
     WHERE ois.organization_id = v_contract.organization_id;
    v_trigger_mode := COALESCE(v_trigger_mode, 'contract_signed');

    IF v_trigger_mode = 'contract_signed' THEN
      BEGIN
        v_actor := COALESCE(
          public.current_business_user_id(),
          (SELECT q.created_by FROM public.quotes q WHERE q.id = v_quote_id)
        );
        IF v_actor IS NOT NULL THEN
          v_request := public.fn_client_order_request_missing(p_contract_id, v_actor, v_request_ids);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_request := jsonb_build_object('success', false);
        BEGIN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, error_message
          ) VALUES (
            'contract', p_contract_id, 'purchase_order', NULL,
            'rpc:update_manual_client_order_po_request', 'error', SQLERRM
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'contract_id',  v_contract.id,
    'order_number', v_contract.order_number,
    'total_value',  v_contract.total_value,
    -- NOVO (20261204310000)
    'supplier_request', v_request
  );
END;
$function$;
