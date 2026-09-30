-- =============================================================================
-- Desconto automático de stock respeita a reserva FIFO + estorno das saídas
-- manuais no cancelamento
-- =============================================================================
-- Regras de negócio (inalteradas):
--   * produtos com products.manages_stock = true descontam stock na assinatura
--     (fn_contract_stock_deduction, movimento 'venda');
--   * reserva FIFO (fn_client_order_line_reservations): disponível = stock −
--     reservas de encomendas assinadas antes; POs a caminho só contam para o
--     próprio contrato (qty_ordered);
--   * o que falta é pedido ao fornecedor por fn_client_order_request_missing
--     (trg_contract_supplier_request, que corre DEPOIS da dedução pela ordem
--     alfabética dos gatilhos — não renomear gatilhos).
--
-- Problema: a dedução automática descontava SEMPRE a quantidade toda da linha,
-- mesmo que o stock estivesse reservado para encomendas anteriores (ou não
-- existisse), deixando o stock negativo e "roubando" reservas alheias. No
-- cancelamento só eram estornadas as 'venda'; as saídas manuais ('saida')
-- ficavam por estornar.
--
-- O que muda (cada função parte EXATAMENTE da definição viva obtida com
-- pg_get_functiondef em 2026-09-29; alterações marcadas "NOVO (20261204630000)";
-- CREATE OR REPLACE mantém owner, grants e SECURITY DEFINER):
--
-- 1. fn_contract_stock_deduction
--    * Mantém todas as condições atuais (stock_deduction_trigger, armazém
--      resolvido, só manages_stock, best-effort com EXCEPTION ->
--      workflow_execution_log, quantidade inteira em unidades base qt ×
--      units_per_uom, idempotência de rpc_register_sale_stock_movement).
--    * Tranca as linhas de stocks dos produtos do contrato pela mesma ordem
--      (produto, armazém) que rpc_confirm_client_order_stock_exit /
--      fn_client_order_request_missing, produto a produto, com
--      SET lock_timeout = '2s' na função. Timeout num produto -> as linhas
--      desse produto não descontam (log 'lock_timeout') e ficam na fila.
--    * Calcula a reserva FIFO uma vez para os produtos trancados (o contrato
--      já está signed no AFTER UPDATE).
--    * Por linha: desconto = LEAST(necessário, qty_reserved da linha, stock do
--      armazém resolvido). 0 -> não cria 'venda' (log 'skipped_not_reserved'),
--      a linha fica na fila (reserva / pedido ao fornecedor / saída manual).
--      Parcial -> 'venda' só dessa quantidade (log 'partial'); o resto passa a
--      qty_missing e é pedido ao fornecedor. Nunca deixa stock negativo.
-- 2. fn_client_order_line_reservations
--    * CTE sold passa a somar também a quantidade vendida (SUM(quantity) das
--      'venda' não estornadas, em unidades base — as mesmas da função).
--    * servido (venda) = GREATEST(0, LEAST(necessário, vendido) −
--      LEAST(necessário, short, dívida)); em falta (venda) = GREATEST(0,
--      necessário − servido − ordered).
--    * Para as vendas antigas (vendido = necessário) o resultado é
--      matematicamente IDÊNTICO ao anterior (verificado nas 7 vendas ativas,
--      todas da Mudelar).
-- 3. fn_client_order_reverse_stock_movement (NOVO helper interno)
--    * SECURITY DEFINER, só service_role (+ owner postgres). FOR UPDATE do
--      movimento; só 'venda'/'saida' de sale_source_type 'contract'; já
--      estornado -> {status:'skipped'} sem erro. Insere o 'estorno_venda' tal
--      como rpc_revert_client_order_stock_exit o fazia (document_number
--      copiado, document_type 'venda', reversal_of_movement_id, reference_id,
--      sale_source_*, notas, autor).
-- 4. rpc_revert_client_order_stock_exit
--    * Todas as verificações mantidas (âmbito, permissões, tipo 'saida', "já
--      foi estornada" continua a dar erro). A inserção passa para o helper.
--      Resultado para o utilizador igual ({success, balance_after}).
-- 5. fn_contract_cancelled_stock_reversal
--    * Percorre movement_type IN ('venda','saida') não estornados do contrato
--      e chama o helper dentro do bloco por movimento já existente. Ator
--      COALESCE(staff atual, created_by do movimento) — como hoje. Notas com a
--      origem certa (VD/EC/contrato, de 20261204620000); a palavra "venda"
--      passa a "saída" quando o movimento estornado é uma saída manual.
-- 6. Índice único parcial em stock_movements(reversal_of_movement_id): um
--    movimento só pode ser estornado uma vez (0 duplicados verificados;
--    tabela com 164 linhas — criação instantânea).
--
-- Nota — reassinar depois de cancelar NÃO volta a descontar automaticamente:
-- a idempotência de rpc_register_sale_stock_movement (e o pré-teste
-- equivalente na dedução) considera qualquer 'venda' da linha, incluindo as
-- estornadas. Nesse caso a linha passa pela reserva FIFO e pela saída manual
-- (rpc_confirm_client_order_stock_exit), como qualquer linha não descontada.
--
-- rpc_get_client_order_document e rpc_list_client_order_documents foram
-- revistas: consomem qty_served / qty_missing / is_served / qty_reserved e os
-- estados continuam coerentes (venda parcial -> 'parcial' / 'partial'; linha
-- sem venda -> fluxo normal da fila). Não são alteradas.
--
-- Pronto para correr dentro de BEGIN; ... COMMIT; (sem CONCURRENTLY).
-- =============================================================================


-- ── 1. fn_client_order_reverse_stock_movement (novo helper interno) ──────────
-- Criado primeiro porque as funções abaixo o chamam (plpgsql resolve em
-- runtime, mas assim o ficheiro lê-se por ordem de dependência).
CREATE OR REPLACE FUNCTION public.fn_client_order_reverse_stock_movement(p_movement_id uuid, p_actor uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mov            public.stock_movements;
  v_existing_id    uuid;
  v_reversal_id    uuid;
  v_balance_after  integer;
BEGIN
  IF p_movement_id IS NULL OR p_actor IS NULL THEN
    RAISE EXCEPTION 'movement_id e autor são obrigatórios' USING ERRCODE = 'check_violation';
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

  IF v_mov.movement_type NOT IN ('venda', 'saida')
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS NULL THEN
    RAISE EXCEPTION 'Só se estornam vendas ou saídas de encomendas de cliente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.id INTO v_existing_id
  FROM public.stock_movements r
  WHERE r.reversal_of_movement_id = v_mov.id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status',               'skipped',
      'reason',               'already_reversed',
      'movement_id',          v_mov.id,
      'reversal_movement_id', v_existing_id
    );
  END IF;

  -- Mesma inserção que rpc_revert_client_order_stock_exit fazia (20261204620000).
  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, reversal_of_movement_id,
    reference_id, sale_source_type, sale_source_id, notes, created_by
  ) VALUES (
    v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
    v_mov.document_number, 'venda', v_mov.id,
    v_mov.reference_id, 'contract', v_mov.sale_source_id,
    COALESCE(nullif(trim(p_notes), ''), format('Estorno do movimento %s', v_mov.id)),
    p_actor
  )
  RETURNING id, balance_after INTO v_reversal_id, v_balance_after;

  RETURN jsonb_build_object(
    'status',               'reversed',
    'movement_id',          v_mov.id,
    'reversal_movement_id', v_reversal_id,
    'balance_after',        v_balance_after
  );
END;
$function$;

ALTER FUNCTION public.fn_client_order_reverse_stock_movement(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_client_order_reverse_stock_movement(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_client_order_reverse_stock_movement(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_client_order_reverse_stock_movement(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_client_order_reverse_stock_movement(uuid, uuid, text) TO service_role;


-- ── 2. rpc_revert_client_order_stock_exit ────────────────────────────────────
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
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view')
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


-- ── 3. fn_contract_cancelled_stock_reversal ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contract_cancelled_stock_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reversal_aliases text[] := ARRAY['cancelled', 'rejected'];
  v_staff_actor    uuid;
  v_actor          uuid;
  v_mov            record;
  v_reversed_count integer := 0;
  -- NOVO (20261204620000): origem nas notas do estorno
  v_origin_label   text;
  -- NOVO (20261204630000)
  v_rev            jsonb;
  v_skipped_count  integer := 0;
BEGIN
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_reversal_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    v_staff_actor := public.current_business_user_id();

    -- NOVO (20261204620000): venda direta ANTES de manual; contrato real
    -- mantém exatamente 'contrato <contract_number>'. Só texto.
    v_origin_label := COALESCE(
      (
        SELECT format('venda direta %s', COALESCE(ds.sale_number, NEW.order_number, NEW.contract_number))
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = NEW.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(NEW.is_manual_order, false)
           THEN format('Encomenda Cliente %s', COALESCE(NEW.order_number, NEW.contract_number))
      END,
      format('contrato %s', NEW.contract_number)
    );

    FOR v_mov IN
      SELECT sm.*
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = NEW.id
        -- NOVO (20261204630000): também as saídas manuais confirmadas.
        AND sm.movement_type IN ('venda', 'saida')
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
      ORDER BY sm.created_at, sm.id  -- NOVO (20261204630000): ordem determinística
    LOOP
      -- Per-movement guard: a failure reversing one movement must never
      -- abort the reversal of the remaining movements of the same contract.
      BEGIN
        -- v_mov.created_by is guaranteed to satisfy the FK to anew_users
        -- (it already exists on the original movement row) — safe final
        -- fallback when there is no staff session present (e.g. cancellation
        -- triggered from a service_role context without auth.uid()).
        v_actor := COALESCE(v_staff_actor, v_mov.created_by);

        -- NOVO (20261204630000): inserção delegada no helper (mesmas colunas
        -- e valores de antes; FOR UPDATE do movimento; já estornado ->
        -- 'skipped' sem erro). Texto das notas igual ao de 20261204620000
        -- para 'venda'; 'saída' quando é uma saída manual.
        v_rev := public.fn_client_order_reverse_stock_movement(
          v_mov.id,
          v_actor,
          format('Estorno automático da %s %s (%s, status %s)',
                 CASE WHEN v_mov.movement_type = 'saida' THEN 'saída' ELSE 'venda' END,
                 v_mov.id, v_origin_label, NEW.status)
        );

        IF v_rev ->> 'status' = 'reversed' THEN
          v_reversed_count := v_reversed_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'stock_movement', v_mov.id,
          'trigger:contract_stock_reversal_line_error', 'error', SQLERRM,
          jsonb_build_object('movement_id', v_mov.id, 'product_id', v_mov.product_id,
                             'movement_type', v_mov.movement_type)  -- NOVO (20261204630000)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'stock_movement', NULL,
      'trigger:contract_stock_reversal', 'success',
      jsonb_build_object('reversed_count', v_reversed_count, 'status', NEW.status,
                         'skipped_count', v_skipped_count)  -- NOVO (20261204630000)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'stock_movement', NULL,
        'trigger:contract_stock_reversal', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;


-- ── 4. fn_client_order_line_reservations ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint, is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric, qty_received numeric, qty_reserved numeric, qty_missing numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      AND (p_product_ids IS NULL OR ql.product_id = ANY (p_product_ids))

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
      AND (p_product_ids IS NULL OR p.id = ANY (p_product_ids))
  ),
  org_stock AS (
    SELECT s.product_id AS os_product_id, SUM(s.quantity)::numeric AS os_qty
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
      (
        CASE WHEN po.status = 'received' THEN poi.quantity
             ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
        END * COALESCE(poi.units_per_uom, 1)
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
      GREATEST(0, -COALESCE(os.os_qty, 0))                      AS s1_stock_debt
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
  ),
  -- Repartição do pool de itens de PO sem ligação por (contrato, produto).
  step2 AS (
    SELECT
      s.*,
      LEAST(
        s.l_qty_needed - s.s1_linked_qty,
        GREATEST(0, s.s1_pool_qty - COALESCE(SUM(s.l_qty_needed - s.s1_linked_qty) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s2_pool_alloc
    FROM step1 s
  ),
  -- Parte recebida do pool e repartição das saídas manuais.
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
             ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END,
        GREATEST(0, s.s1_exit_pool - COALESCE(SUM(
          CASE WHEN s.s1_is_sold THEN 0
               ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END
        ) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_exit_alloc
    FROM step2 s
  ),
  -- Quantidade ainda por cobrir das linhas pendentes (entra na fila).
  step4 AS (
    SELECT
      s.*,
      CASE WHEN s.s1_is_sold OR s.s1_has_exit THEN 0
           ELSE GREATEST(0, s.l_qty_needed - s.s3_ordered) END AS s4_rem
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
  final AS (
    SELECT
      s.*,
      (LEAST(s.s1_stock, s.s5_cum_rem) - LEAST(s.s1_stock, s.s5_cum_rem - s.s4_rem)) AS f_reserved
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
  served AS (
    SELECT
      f.*,
      CASE
        WHEN f.s1_is_sold THEN
          GREATEST(0, LEAST(f.l_qty_needed, f.s1_sold_qty)
                      - LEAST(f.l_qty_needed, f.s1_short_at_sale, f.s1_stock_debt))  -- NOVO (20261204630000)
        WHEN f.s1_has_exit THEN f.s3_exit_alloc
        ELSE 0
      END::numeric AS sv_served,
      (f.s1_linked_recv + f.s3_pool_recv_alloc)::numeric AS sv_received
    FROM final f
  )
  SELECT
    f.l_contract_id,
    f.l_quote_line_id,
    f.l_component_index,
    f.l_product_id,
    f.s5_seq,
    -- NOVO (20261204340000): is_served = linha concluída —
    -- qty_served + qty_received >= qty_needed (antes: qualquer saída do
    -- (contrato, produto) marcava todas as linhas como servidas).
    ((f.sv_served + f.sv_received) >= f.l_qty_needed
      AND (f.l_qty_needed > 0 OR f.s1_is_sold OR f.s1_has_exit)),
    f.s1_is_sold,
    f.l_qty_needed,
    f.sv_served,
    f.s3_ordered,
    f.sv_received,
    -- Linhas com venda/saída não entram na fila (uma saída por (contrato,
    -- produto)): a reserva nunca conta a parte já servida; o que ficou por
    -- servir passa a qty_missing.
    CASE WHEN f.s1_is_sold OR f.s1_has_exit THEN 0 ELSE f.f_reserved END::numeric,
    CASE
      WHEN f.s1_is_sold THEN
        -- NOVO (20261204630000): necessário − servido − encomendado. Com
        -- vendida = necessária dá exatamente o de antes:
        -- LEAST(necessário, short, dívida) − encomendado.
        GREATEST(0, f.l_qty_needed - f.sv_served - f.s3_ordered)
      WHEN f.s1_has_exit THEN
        GREATEST(0, f.l_qty_needed - f.s3_ordered - f.s3_exit_alloc)
      ELSE
        GREATEST(0, f.s4_rem - f.f_reserved)
    END::numeric
  FROM served f;
$function$;


-- ── 5. fn_contract_stock_deduction ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contract_stock_deduction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
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
BEGIN
  -- Only ever react to a transition into the signed stage — exact same gate
  -- as fn_contract_signed_convert_to_client() (20261113190000), replicated
  -- here on purpose (not a new style).
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. This organization chose "deduct on proposal acceptance" instead
    --      — that is Fase 5.0C, not implemented yet. Do nothing here. ──────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

    -- ── 3. Resolve the quote (NOVO 20261115080000): prefer the direct FK,
    --      fall back to the proposal's own quote when execute-workflow left
    --      quote_id NULL (see migration header — confirmed on 84% of real
    --      contracts with an actual quote behind them). No quote resolvable
    --      at all → nothing to deduct. ──────────────────────────────────────
    v_resolved_quote_id := NEW.quote_id;
    IF v_resolved_quote_id IS NULL AND NEW.proposal_id IS NOT NULL THEN
      SELECT id INTO v_resolved_quote_id
      FROM public.quotes
      WHERE proposal_id = NEW.proposal_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_resolved_quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
    --      -warehouse fallback, else no movement at all (never guess). ─────
    v_resolved_warehouse := v_default_warehouse_id;

    IF v_resolved_warehouse IS NULL THEN
      SELECT count(*) INTO v_active_warehouse_cnt
      FROM public.warehouses
      WHERE organization_id = NEW.organization_id
        AND deleted_at IS NULL;

      IF v_active_warehouse_cnt = 1 THEN
        SELECT id INTO v_resolved_warehouse
        FROM public.warehouses
        WHERE organization_id = NEW.organization_id
          AND deleted_at IS NULL;
      ELSE
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'stock_movement', NULL,
          'trigger:contract_stock_deduction_no_warehouse', 'warning',
          jsonb_build_object(
            'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
            'active_warehouse_count', v_active_warehouse_cnt
          )
        );
        RETURN NEW;
      END IF;
    END IF;

    -- NOVO (20261204620000): número do documento de origem. Venda direta
    -- ANTES de manual (as de VD também têm is_manual_order): VD-…; encomenda
    -- manual: EC-… (order_number já vem do BEFORE trg_set_client_order_number);
    -- contrato real: contract_number, como antes.
    v_document_number := COALESCE(
      (
        SELECT COALESCE(ds.sale_number, NEW.order_number, NEW.contract_number)
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = NEW.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(NEW.is_manual_order, false)
           THEN COALESCE(NEW.order_number, NEW.contract_number)
      END,
      NEW.contract_number
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
            AND w.organization_id = NEW.organization_id
          ORDER BY s.product_id, s.warehouse_id
          FOR UPDATE OF s;

          v_locked_products := v_locked_products || v_pid;
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, error_message, execution_data
          ) VALUES (
            'contract', NEW.id, 'product', v_pid,
            'trigger:contract_stock_deduction_lock_timeout', 'warning', SQLERRM,
            jsonb_build_object('reason', 'lock_timeout', 'product_id', v_pid, 'sqlstate', SQLSTATE)
          );
        END;
      END LOOP;

      -- ── 4c. Reserva FIFO calculada uma vez (o contrato já está signed
      --        neste AFTER UPDATE), só para os produtos trancados. Chave:
      --        quote_line_id (linhas diretas, component_index NULL). ───────
      IF cardinality(v_locked_products) > 0 THEN
        SELECT jsonb_object_agg(r.quote_line_id::text, r.qty_reserved)
          INTO v_res_map
        FROM public.fn_client_order_line_reservations(NEW.organization_id, v_locked_products) r
        WHERE r.contract_id = NEW.id
          AND r.component_index IS NULL;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
    --      excluded — they are already real product lines (plan decision 4:
    --      BundleSelectionTab already expands a bundle into individual
    --      quote_lines at quote-creation time). A line with a fractional
    --      quantity is skipped with a warning log — it must never abort the
    --      remaining lines of the same contract. Likewise, any other
    --      unexpected failure on a single line (caught per-line below) never
    --      stops the loop. ─────────────────────────────────────────────────
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
          'contract', NEW.id, 'quote_line', v_line.id,
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
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom)::integer;

      -- NOVO (20261204630000): mesma idempotência de
      -- rpc_register_sale_stock_movement (qualquer 'venda' desta linha nesta
      -- origem, incluindo estornadas) testada antes do lock e da reserva,
      -- para não registar 'lock_timeout' / 'skipped_not_reserved' numa linha
      -- que já foi vendida. Conta como processada, tal como quando o RPC
      -- devolvia skipped.
      IF EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = NEW.id
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
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'lock_timeout', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204630000): desconto = LEAST(necessário, reservado para a
      -- linha, stock no armazém resolvido). Linhas de stocks já trancadas
      -- acima; o SELECT vê as vendas das linhas anteriores deste contrato.
      v_reserved := COALESCE((v_res_map ->> v_line.id::text)::numeric, 0);

      v_wh_qty := NULL;
      SELECT s.quantity
        INTO v_wh_qty
      FROM public.stocks s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id = v_line.product_id
        AND s.warehouse_id = v_resolved_warehouse
        AND s.deleted_at IS NULL
        AND w.organization_id = NEW.organization_id
        AND w.deleted_at IS NULL;

      v_qty_deduct := LEAST(
        v_qty_int::numeric,
        floor(GREATEST(v_reserved, 0)),
        GREATEST(COALESCE(v_wh_qty, 0), 0)::numeric
      )::integer;

      IF v_qty_deduct <= 0 THEN
        v_lines_not_reserved := v_lines_not_reserved + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'skipped_not_reserved', 'qt', v_line.qt, 'product_id', v_line.product_id,
                             'qty_needed', v_qty_int, 'qty_reserved', v_reserved,
                             'warehouse_id', v_resolved_warehouse, 'warehouse_qty', v_wh_qty)
        );
        CONTINUE;
      END IF;

      -- Per-line guard: a failure registering one line's movement (e.g. an
      -- unexpected RPC-level rejection) must never abort the remaining lines
      -- of the same contract.
      BEGIN
        v_result := public.rpc_register_sale_stock_movement(
          p_product_id        => v_line.product_id,
          p_warehouse_id       => v_resolved_warehouse,
          p_quantity           => v_qty_deduct,  -- NOVO (20261204630000): era v_qty_int
          p_quote_line_id      => v_line.id,
          p_sale_source_type   => 'contract',
          p_sale_source_id     => NEW.id,
          p_document_number    => v_document_number,  -- NOVO (20261204620000)
          p_unit_cost_at_time  => NULL,
          p_organization_id    => NEW.organization_id
        );

        v_lines_processed := v_lines_processed + 1;

        -- NOVO (20261204630000): desconto parcial — o resto passa a
        -- qty_missing e é pedido ao fornecedor por
        -- fn_client_order_request_missing (gatilho seguinte).
        IF v_qty_deduct < v_qty_int
           AND NOT COALESCE((v_result ->> 'skipped')::boolean, false) THEN
          v_lines_partial := v_lines_partial + 1;
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:contract_stock_deduction_partial', 'warning',
            jsonb_build_object('reason', 'partial', 'quote_line_id', v_line.id, 'product_id', v_line.product_id,
                               'qty_needed', v_qty_int, 'qty_deducted', v_qty_deduct,
                               'qty_reserved', v_reserved, 'warehouse_qty', v_wh_qty)
          );
        END IF;

        -- Traceable for Fase 5.0D (user-visible alerts, not implemented
        -- here) — nunca bloqueia nem impede o resto do fluxo.
        IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:contract_stock_deduction_insufficient', 'warning',
            jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'stock_movement', NULL,
      'trigger:contract_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id,
                         -- NOVO (20261204630000)
                         'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;


-- ── 6. Um movimento só pode ser estornado uma vez ────────────────────────────
-- 0 duplicados verificados em 2026-09-29; stock_movements tem 164 linhas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_reversal_of_movement_id
  ON public.stock_movements (reversal_of_movement_id)
  WHERE reversal_of_movement_id IS NOT NULL;
