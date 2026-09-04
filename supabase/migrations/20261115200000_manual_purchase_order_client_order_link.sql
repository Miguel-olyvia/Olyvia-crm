-- ============================================================
-- Pedido do utilizador (2026-08-31, plano-fornecedores-multi-stock-execucao.md
-- secção Fase 5.0F): quando uma linha de "Encomendas Clientes" fica
-- "sem_fornecedor" (produto manages_stock=false sem fornecedor preferencial
-- na altura da assinatura — nenhuma PO foi autogerada, Fase 5.0C), o
-- profissional cria a Encomenda manualmente em PurchaseOrders.tsx. Até agora
-- essa encomenda manual nunca ficava ligada ao contrato (source_type/
-- source_id ficavam NULL) — "Encomendas Clientes" nunca refletia a
-- resolução, mesmo depois de receber a encomenda. Mesmo problema já
-- corrigido do lado do stock manual (20261115170000/180000), agora do lado
-- das Encomendas a fornecedor.
--
-- rpc_create_purchase_order ganha leitura opcional de source_type/source_id
-- a partir de p_order (chaves novas no jsonb — CREATE OR REPLACE seguro
-- aqui, a assinatura da função em si não muda). Reaproveita as colunas já
-- existentes em purchase_orders (Fase 5.0C, 20261115070000) — sem coluna
-- nova. Mesma validação de scope que já existe em rpc_decrement_stock
-- (20261115170000): o contrato tem de pertencer à mesma organização.
--
-- rpc_update_purchase_order NÃO é tocado de propósito — editar uma encomenda
-- existente nunca deve reescrever source_type/source_id (nem para NULL nem
-- para outro valor): esses campos só fazem sentido fixados na criação
-- (automática ou manual), tal como a automática já se comporta hoje.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(
  p_organization_id uuid,
  p_order           jsonb,
  p_items           jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_order       public.purchase_orders;
  v_item        jsonb;
  v_diff        jsonb;
  v_new         jsonb;
  v_source_type text;
  v_source_id   uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS ─────────────────
  -- Predicate (2): the create permission (checked first — fail before any write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Predicate (1): the target org must be in the caller's visible-org scope.
  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ligação opcional a uma Encomenda Cliente (novo, 20261115200000) ───────
  v_source_type := nullif(p_order ->> 'source_type', '');
  v_source_id   := nullif(p_order ->> 'source_id', '')::uuid;
  IF v_source_type IS NOT NULL THEN
    IF v_source_type NOT IN ('contract', 'proposal') THEN
      RAISE EXCEPTION 'source_type inválido: %', v_source_type USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_id IS NULL THEN
      RAISE EXCEPTION 'source_id é obrigatório quando source_type é indicado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_type = 'contract' AND NOT EXISTS (
      SELECT 1 FROM public.client_contracts
      WHERE id = v_source_id AND organization_id = p_organization_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── INSERT the order (identical column set to handleSubmit, order_number ''
  --    so trigger_set_po_number auto-generates it) ───────────────────────────
  INSERT INTO public.purchase_orders (
    order_number, supplier_id, order_date, expected_delivery, status,
    total_value, notes, organization_id, created_by, source_type, source_id
  )
  VALUES (
    '',
    nullif(p_order ->> 'supplier_id', '')::uuid,
    (p_order ->> 'order_date')::date,
    nullif(p_order ->> 'expected_delivery', '')::date,
    COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
    COALESCE((p_order ->> 'total_value')::numeric, 0),
    nullif(p_order ->> 'notes', ''),
    p_organization_id,
    v_actor,
    v_source_type,
    v_source_id
  )
  RETURNING * INTO v_order;

  -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes
      )
      VALUES (
        v_order.id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', '')
      );
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot of the created PO + item set ───────
  v_new := to_jsonb(v_order);
  v_diff := jsonb_build_object(
    'purchase_orders', jsonb_build_object(
      'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
      'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
      'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
      'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
      'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
      'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
      'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
      'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id'),
      'source_type',       jsonb_build_object('old', NULL, 'new', v_new -> 'source_type'),
      'source_id',         jsonb_build_object('old', NULL, 'new', v_new -> 'source_id')
    ),
    'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
  );

  -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.rpc_create_purchase_order(uuid, jsonb, jsonb) IS
  'Cria uma Encomenda de Compra + itens. p_order pode incluir source_type/'
  'source_id (opcionais) para ligar manualmente a uma Encomenda Cliente '
  '(client_contracts) — mesmo mecanismo já usado pela geração automática '
  '(Fase 5.0C), agora também disponível na criação manual (Fase 5.0F).';

REVOKE ALL ON FUNCTION public.rpc_create_purchase_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_purchase_order(uuid, jsonb, jsonb) TO authenticated;
