-- ============================================================
-- 20261205060000_reverter_rececao_encomenda_fornecedor
-- ============================================================
-- Reverter a receção de linhas de uma encomenda a fornecedor.
--
-- Hoje, uma receção feita por engano (quantidade errada, encomenda errada,
-- armazém errado) não tem volta: received_quantity fica gravada, a entrada de
-- stock fica no armazém e a encomenda fica "recebida". A única saída era
-- mexer à mão no stock e na BD.
--
-- Esta migration:
--   1. Permissão nova purchase_orders.revert_receipt (perigosa, categoria
--      purchase_orders, como purchase_orders.receive). Atribuída a System
--      Admin, Super Admin e aos papéis Org Admin (code 'org_admin') que já
--      recebem encomendas. Não é dada a papéis de armazém nem de compras.
--   2. rpc_revert_purchase_order_receipt(p_purchase_order_id, p_item_ids,
--      p_reason): para as linhas escolhidas, estorna as entradas de stock da
--      receção (movimento 'ajuste_negativo' com reversal_of_movement_id),
--      repõe o custo médio, põe received_quantity a 0 e recalcula o estado
--      da encomenda. Tudo numa transação; recusa se o stock já saiu.
--
-- Lido ao vivo antes de escrever (supabase db query --linked, 30/09/2026):
--   · stock_movements_movement_type_check inclui 'ajuste_negativo';
--     stock_movements_document_type_check inclui 'compra'; não há CHECK que
--     cruze os dois. fn_stock_movements_apply trata 'ajuste_negativo' como
--     decremento, recusa saldo negativo, e só recalcula average_cost em
--     'entrada'/'transferencia_entrada' (nas subtrações mantém o custo atual
--     da linha de stocks, lido no próprio gatilho).
--   · fn_stock_movements_guard_reversal recusa reversal_of_movement_id quando
--     current_user é authenticated/anon — esta função é SECURITY DEFINER
--     (owner postgres), como fn_client_order_reverse_stock_movement.
--   · uq_stock_movements_reversal_of_movement_id: um só estorno por movimento.
--   · stocks: quantity integer, average_cost numeric; UNIQUE (product_id,
--     warehouse_id). purchase_order_items: received_quantity numeric,
--     units_per_uom integer (fator congelado; o gatilho
--     fn_line_units_per_uom_snapshot mantém-no num UPDATE sem mudar uom/produto).
--   · As receções (rpc_receive_purchase_order_lines, 20261205050000) gravam
--     reference_id = purchase_order_items.id nas entradas 'compra'. Dados
--     vivos: todas as linhas recebidas de encomendas sem origem batem certo
--     (soma dos movimentos = received_quantity × units_per_uom); há 1 linha
--     de encomenda de contrato com entrada de stock (receção anterior a
--     20261115210000) — ver regra do stock abaixo.
--   · entity_audit_log.operation só aceita INSERT/UPDATE/DELETE: não há
--     ação 'revert_receipt'. O motivo fica numa linha UPDATE consolidada
--     (fn_manual_audit_log + app.audit_bypass), o mesmo padrão de
--     rpc_update_purchase_order.
--
-- Prerequisites: 20261113290000_purchase_orders_approve_receive_and_view_cost_permissions.sql
--                20261205050000_receber_encomendas_sem_editar.sql

-- ============================================================
-- 1. Catálogo: purchase_orders.revert_receipt
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES (
  'purchase_orders.revert_receipt',
  'Reverter receção de encomendas de compra',
  'Permite anular a receção de linhas de uma encomenda de compra (rpc_revert_purchase_order_receipt): a entrada de stock é estornada no armazém onde entrou, o custo médio é reposto, a quantidade recebida volta a zero e a encomenda regressa ao estado anterior. Exige um motivo e inventory.edit. Recusa se o stock que entrou já tiver saído.',
  'purchase_orders',
  NULL,
  3,
  true,
  'organization',
  false
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. Atribuição
-- ============================================================
-- DISABLE TRIGGER USER: trg_protect_system_role_perms recusa escritas em
-- papéis is_system fora de service_role; o gatilho de auditoria fica também
-- desligado, como em 20261204900000 e 20261205000000. Junta anew_roles
-- (deleted_at IS NULL) para não criar linhas órfãs.
--
-- Org Admin: só os que já têm purchase_orders.receive (ao vivo: 75 de 77) —
-- reverter sem poder receber não faz sentido. Editor, Warehouse Manager e
-- Purchase Technician também recebem, mas ficam de fora de propósito.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'purchase_orders.revert_receipt', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND (
    ro.id IN (
      '03a43423-9b3c-4640-9dbe-31687f829869'::uuid, -- System Admin
      'e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid  -- Super Admin
    )
    OR (
      ro.code = 'org_admin'
      AND EXISTS (
        SELECT 1 FROM public.anew_role_permissions rp
        WHERE rp.role_id = ro.id
          AND rp.permission_code = 'purchase_orders.receive'
      )
    )
  )
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- 3. rpc_revert_purchase_order_receipt
-- ============================================================
-- Regras:
--   · Só encomendas 'received' / 'partially_received', não apagadas.
--   · Linhas: desta encomenda, de produto, com received_quantity > 0; sem
--     repetidas. Reverte-se a linha toda (received_quantity → 0).
--   · Stock: estornam-se todas as entradas 'compra' da linha
--     (reference_id = linha) ainda sem estorno, cada uma com um
--     'ajuste_negativo' ligado por reversal_of_movement_id, no armazém onde
--     entrou. A soma tem de bater com received_quantity × units_per_uom;
--     senão recusa (não se adivinha o que corrigir).
--   · Encomendas de contrato (source_type = 'contract') não deram entrada de
--     stock desde 20261115210000: sem movimentos, só se repõe a quantidade.
--     Se uma linha de contrato tiver entradas (receção antiga), são
--     estornadas como nas outras — pôr received_quantity a 0 e deixar o
--     stock lá ficaria errado.
--   · Stock insuficiente: verificado por produto/armazém ANTES de inserir,
--     com a linha de stocks trancada. Nunca fica negativo.
--   · Custo médio: fn_stock_movements_apply não o recalcula em subtrações e
--     reescreve average_cost com o valor que lê da linha de stocks. Por
--     isso o custo é reposto ANTES dos estornos (mesma transação, linha já
--     trancada): novo = (custo × q_antes − Σ custo_entrada × q) / (q_antes − Σ q),
--     arredondado a 4 casas (o apply guarda-o em numeric(12,4)). Mantém-se o
--     atual se o stock ficar a 0, se o resultado for negativo, se não houver
--     custo atual ou se alguma entrada não tiver unit_cost_at_time.
--   · Estado: sem nada recebido volta ao último estado anterior à receção
--     no entity_audit_log ('pending' ou 'ordered'; senão 'ordered'); com
--     algo recebido fica 'partially_received'. actual_delivery_date → NULL.
--   · Auditoria: os movimentos e stocks ficam auditados pelos gatilhos
--     normais. A encomenda e as linhas ficam numa única linha UPDATE
--     (fn_manual_audit_log) com status, actual_delivery_date e
--     receipt_reversal { reason, lines } — o motivo fica registado também
--     nas encomendas de contrato, que não geram movimentos.

CREATE OR REPLACE FUNCTION public.rpc_revert_purchase_order_receipt(p_purchase_order_id uuid, p_item_ids uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_po             public.purchase_orders%ROWTYPE;
  v_reason         text;
  v_skip_stock     boolean;
  v_item_id        uuid;
  v_item           record;
  v_line_mov_ids   uuid[];
  v_line_mov_units bigint;
  v_line_expected  numeric;
  v_all_mov_ids    uuid[] := ARRAY[]::uuid[];
  v_lines_out      jsonb := '[]'::jsonb;
  v_audit_lines    jsonb := '[]'::jsonb;
  v_grp            record;
  v_stock_qty      integer;
  v_stock_cost     numeric;
  v_new_cost       numeric;
  v_mov            public.stock_movements%ROWTYPE;
  v_sum_quantity   numeric;
  v_sum_received   numeric;
  v_new_status     text;
  v_prev_bypass    text;
  v_diff           jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Trancar a encomenda serializa com receções e reversões concorrentes
  -- (rpc_receive_purchase_order_lines tranca-a da mesma forma).
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Só é possível reverter a receção de encomendas recebidas ou parcialmente recebidas (estado atual: %)', v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.revert_receipt')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indica o motivo da reversão (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para reverter' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  v_skip_stock := (v_po.source_type = 'contract');

  -- ── 1. Validar e trancar as linhas e as entradas de stock de cada uma ──
  FOREACH v_item_id IN ARRAY p_item_ids
  LOOP
    SELECT id, product_id, item_type, quantity, received_quantity, description,
           COALESCE(units_per_uom, 1) AS units_per_uom
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_item_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_item_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm receção de stock a reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_item.received_quantity IS NULL OR v_item.received_quantity <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida para reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    -- Entradas da receção desta linha ainda sem estorno. O filtro por
    -- organização e produto usa idx_stock_movements_product (não há índice
    -- em reference_id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]),
           COALESCE(sum(t.quantity), 0)
    INTO v_line_mov_ids, v_line_mov_units
    FROM (
      SELECT m.id, m.quantity
      FROM public.stock_movements m
      WHERE m.reference_id = v_item.id
        AND m.organization_id = v_po.organization_id
        AND m.product_id = v_item.product_id
        AND m.document_type = 'compra'
        AND m.movement_type = 'entrada'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = m.id
        )
      ORDER BY m.id
      FOR UPDATE OF m
    ) t;

    v_line_expected := v_item.received_quantity * v_item.units_per_uom;

    -- Contrato sem entradas: a receção não passou pelo stock geral. Em todos
    -- os outros casos os movimentos têm de explicar a quantidade recebida.
    IF NOT (v_skip_stock AND cardinality(v_line_mov_ids) = 0)
       AND v_line_mov_units <> v_line_expected THEN
      RAISE EXCEPTION 'Não é possível reverter "%" automaticamente: a linha tem % recebidas (% unidades de stock), mas as entradas de stock por estornar somam % unidades',
        v_item.description, v_item.received_quantity, v_line_expected, v_line_mov_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_all_mov_ids := v_all_mov_ids || v_line_mov_ids;

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'description',            v_item.description,
      'quantity_reverted',      v_item.received_quantity,
      'stock_reverted',         cardinality(v_line_mov_ids) > 0,
      'movements_reverted',     cardinality(v_line_mov_ids)
    );
  END LOOP;

  -- ── 2. Stock suficiente e custo médio, por produto/armazém ──
  -- Tudo verificado antes do primeiro estorno. Ordem fixa para trancar
  -- stocks sempre pela mesma sequência.
  FOR v_grp IN
    SELECT m.product_id,
           m.warehouse_id,
           sum(m.quantity)::bigint                        AS qty,
           bool_or(m.unit_cost_at_time IS NULL)           AS any_cost_null,
           sum(m.unit_cost_at_time * m.quantity)          AS cost_total,
           string_agg(DISTINCT poi.description, '", "')   AS descriptions,
           w.name                                         AS warehouse_name
    FROM public.stock_movements m
    JOIN public.purchase_order_items poi ON poi.id = m.reference_id
    LEFT JOIN public.warehouses w ON w.id = m.warehouse_id
    WHERE m.id = ANY (v_all_mov_ids)
    GROUP BY m.product_id, m.warehouse_id, w.name
    ORDER BY m.product_id, m.warehouse_id
  LOOP
    v_stock_qty  := NULL;
    v_stock_cost := NULL;

    SELECT s.quantity, s.average_cost
    INTO v_stock_qty, v_stock_cost
    FROM public.stocks s
    WHERE s.product_id = v_grp.product_id
      AND s.warehouse_id = v_grp.warehouse_id
    FOR UPDATE;

    IF COALESCE(v_stock_qty, 0) < v_grp.qty THEN
      RAISE EXCEPTION 'Não é possível reverter "%": o armazém % tem % unidades e a receção deu entrada de % (já saiu stock)',
        v_grp.descriptions, COALESCE(v_grp.warehouse_name, v_grp.warehouse_id::text),
        COALESCE(v_stock_qty, 0), v_grp.qty
        USING ERRCODE = 'check_violation';
    END IF;

    -- Repor o custo médio antes dos estornos: o apply lê average_cost desta
    -- linha e volta a gravá-lo tal como está.
    IF v_stock_qty - v_grp.qty > 0
       AND v_stock_cost IS NOT NULL
       AND NOT v_grp.any_cost_null THEN
      v_new_cost := round(
        ((v_stock_cost * v_stock_qty) - v_grp.cost_total) / (v_stock_qty - v_grp.qty),
        4
      );
      IF v_new_cost >= 0 AND v_new_cost IS DISTINCT FROM v_stock_cost THEN
        UPDATE public.stocks
        SET average_cost = v_new_cost,
            updated_at   = now()
        WHERE product_id = v_grp.product_id
          AND warehouse_id = v_grp.warehouse_id;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Estornos ──
  FOR v_mov IN
    SELECT m.*
    FROM public.stock_movements m
    WHERE m.id = ANY (v_all_mov_ids)
    ORDER BY m.product_id, m.warehouse_id, m.created_at, m.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      supplier_sku_at_time, reference_id, reversal_of_movement_id, notes, created_by
    ) VALUES (
      v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'ajuste_negativo', v_mov.quantity,
      v_mov.document_number, 'compra', v_mov.item_supplier_id, v_mov.unit_cost_at_time,
      v_mov.supplier_sku_at_time, v_mov.reference_id, v_mov.id,
      format('Estorno da receção de %s: %s unidades (motivo: %s)', v_po.order_number, v_mov.quantity, v_reason),
      v_actor
    );
  END LOOP;

  -- ── 4. Linhas e estado da encomenda ──
  -- A encomenda e as linhas ficam numa única linha de auditoria (abaixo);
  -- o bypass só cobre estes dois UPDATE e é reposto a seguir.
  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.purchase_order_items
  SET received_quantity = 0
  WHERE id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    -- Último estado anterior à receção. Gatilho genérico: status em
    -- changed_fields (UPDATE) ou full_record (INSERT), record_id = PO;
    -- rpc_update_purchase_order: changed_fields.purchase_orders.status,
    -- entity_id = PO e record_id NULL. Dentro da mesma linha, 'new' é
    -- posterior a 'old'.
    SELECT v.val
    INTO v_new_status
    FROM public.entity_audit_log a
    CROSS JOIN LATERAL (VALUES
      (1, a.full_record ->> 'status'),
      (2, a.changed_fields #>> '{status,old}'),
      (3, a.changed_fields #>> '{status,new}'),
      (2, a.changed_fields #>> '{purchase_orders,status,old}'),
      (3, a.changed_fields #>> '{purchase_orders,status,new}')
    ) AS v(ord, val)
    WHERE a.table_name = 'purchase_orders'
      AND (a.record_id = p_purchase_order_id OR a.entity_id = p_purchase_order_id)
      AND v.val IN ('pending', 'ordered')
    ORDER BY a.created_at DESC, v.ord DESC
    LIMIT 1;

    v_new_status := COALESCE(v_new_status, 'ordered');
  END IF;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = NULL,
      updated_at           = now()
  WHERE id = p_purchase_order_id;

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  SELECT COALESCE(jsonb_agg(
           (l.value - 'quantity_reverted')
           || jsonb_build_object(
                'received_quantity', jsonb_build_object('old', l.value -> 'quantity_reverted', 'new', 0)
              )
         ), '[]'::jsonb)
  INTO v_audit_lines
  FROM jsonb_array_elements(v_lines_out) AS l(value);

  v_diff := jsonb_build_object(
    'status', jsonb_build_object('old', v_po.status, 'new', v_new_status),
    'receipt_reversal', jsonb_build_object(
      'reason',               v_reason,
      'lines',                v_audit_lines,
      'reversal_of_movement_ids', to_jsonb(v_all_mov_ids)
    )
  );
  IF v_po.actual_delivery_date IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', NULL)
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_purchase_order_id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', p_purchase_order_id
  );

  RETURN jsonb_build_object(
    'order_number', v_po.order_number,
    'status',       v_new_status,
    'lines',        v_lines_out
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_revert_purchase_order_receipt(uuid, uuid[], text) IS
  'Reverte a receção das linhas escolhidas de uma encomenda de compra: estorna '
  'as entradas de stock (ajuste_negativo com reversal_of_movement_id), repõe o '
  'custo médio, põe received_quantity a 0 e recalcula o estado. Recusa se o stock '
  'já saiu. Exige purchase_orders.revert_receipt + inventory.edit e um motivo '
  '(20261205060000).';

REVOKE ALL ON FUNCTION public.rpc_revert_purchase_order_receipt(uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_revert_purchase_order_receipt(uuid, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_revert_purchase_order_receipt(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revert_purchase_order_receipt(uuid, uuid[], text) TO service_role;
