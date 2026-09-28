-- ════════════════════════════════════════════════════════════════════════════
-- Encomendas Clientes — reserva de stock por ordem de assinatura
-- ════════════════════════════════════════════════════════════════════════════
--
-- Todas as funções alteradas partem da definição VIVA (pg_get_functiondef em
-- 2026-09-24, depois de 20261204290000 e 20261204300000). Mantêm-se
-- SECURITY DEFINER, search_path, validações e permissões. CREATE OR REPLACE
-- preserva os GRANTs existentes; as funções novas têm REVOKE/GRANT explícitos
-- como as vizinhas (internas: só service_role; RPC: authenticated +
-- service_role, nunca PUBLIC/anon).
--
-- REGRAS DE NEGÓCIO (aprovadas)
--   * Disponível para uma linha = stock físico da organização (soma dos
--     armazéns ativos, como hoje) − quantidades reservadas por linhas de
--     encomendas assinadas ANTES e ainda sem saída.
--     Ordem: COALESCE(signature_date, status_changed_at, created_at),
--     contract_id, quote_line_id, índice do componente de bundle (linhas
--     diretas primeiro).
--   * Linha pendente = sem saída/venda não estornada e sem quantidade coberta
--     por pedido a fornecedor (PO). POs a caminho NÃO contam como disponível;
--     cada PO pertence à linha que o gerou (purchase_order_items.quote_line_id).
--   * Cobertura parcial: reservado = LEAST(em falta de PO,
--     GREATEST(0, stock − reservado acumulado anterior)); o resto é pedido ao
--     fornecedor.
--   * Cancelamento/estorno liberta automaticamente (cálculo ao vivo). PO
--     feito não se anula.
--   * Contas em unidades base (qt × units_per_uom). Sem lógica nova de
--     packs/MOQ (a conversão para a unidade do fornecedor continua a
--     arredondar para cima, como em 20261204203500).
--   * Encomendas existentes: esta migration NÃO gera POs retroativos.
--
-- CONTEÚDO
--   1. purchase_order_items.quote_line_id (+ component_index) e índice.
--   2. NOVA fn_client_order_line_reservations (interna).
--   3. NOVA fn_client_order_request_missing (interna) +
--      fn_contract_supplier_request passa a delegar nela.
--   4. rpc_get_client_order_document e rpc_list_client_order_documents com
--      reserva por linha.
--   5. rpc_confirm_client_order_stock_exit valida contra a reserva.
--   6. NOVA rpc_request_missing_from_supplier (botão "Pedir em falta").
--   7. rpc_update_manual_client_order pede a parte em falta das linhas
--      novas/aumentadas. fn_client_order_product_locked NÃO muda (ver nota).
--   8. fn_contract_stock_deduction NÃO muda (ver nota sobre ordem dos
--      gatilhos).
--
-- ORDEM DOS GATILHOS (ponto 8)
--   Gatilhos AFTER da mesma tabela/evento disparam por ordem alfabética do
--   nome. Em client_contracts (AFTER UPDATE OF status):
--     trg_contract_cancelled_stock_reversal
--     trg_contract_cancelled_supplier_request_reversal
--     trg_contract_signed_convert_to_client
--     trg_contract_stock_deduction        <- 'st' ...
--     trg_contract_supplier_request       <- ... 'su' : corre DEPOIS
--   Logo fn_contract_supplier_request já vê a 'venda' (e o balance_after
--   negativo) feita por fn_contract_stock_deduction na mesma transação.
--   Não é preciso renomear nada. NÃO renomear estes gatilhos sem manter esta
--   ordem.
--
-- NOTA fn_client_order_product_locked (ponto 7)
--   Tranca o produto do contrato quando há saída/venda não estornada ou um
--   item de PO não cancelado desse produto nesse contrato. Uma reserva
--   sozinha não gera movimento nem PO, logo não tranca — já é o
--   comportamento pretendido. Os POs ligados por linha continuam a ter
--   product_id + source_id do contrato, portanto continuam a ser detetados.
--   Mantém-se a granularidade por produto (mais conservadora). Sem alterações.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. purchase_order_items: ligação à linha da encomenda
-- ────────────────────────────────────────────────────────────────────────────
-- FK com ON DELETE SET NULL (e não sem FK / não RESTRICT):
--   * RESTRICT/NO ACTION bloquearia apagar/regravar linhas de orçamento que
--     tenham PO (ex.: rpc_save_quote a regravar linhas) — partia fluxos
--     existentes.
--   * Sem FK, uma linha apagada deixava um quote_line_id órfão: o item deixava
--     de contar para qualquer linha e o cálculo pediria outra vez ao
--     fornecedor (PO duplicado).
--   * SET NULL transforma o item num item "antigo" sem ligação, que continua a
--     contar pelo fallback por (contrato, produto) — nunca se perde cobertura.
-- component_index = posição (1..n) em selected_attributes->'bundle_components'
-- quando a linha vem de um componente de bundle; NULL para linhas diretas.
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS quote_line_id uuid NULL
    REFERENCES public.quote_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS component_index integer NULL;

COMMENT ON COLUMN public.purchase_order_items.quote_line_id IS
  'Linha da Encomenda Cliente (quote_lines.id) que gerou este item de pedido a fornecedor. NULL em itens antigos/manuais (contam por contrato+produto).';
COMMENT ON COLUMN public.purchase_order_items.component_index IS
  'Posição (1..n) do componente em quote_lines.selected_attributes->''bundle_components''; NULL para linhas diretas.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_quote_line_id
  ON public.purchase_order_items (quote_line_id)
  WHERE quote_line_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. NOVA fn_client_order_line_reservations
-- ────────────────────────────────────────────────────────────────────────────
-- Uma linha por (contrato assinado, linha de produto, componente de bundle)
-- da organização. Tudo em unidades base.
--
--   qty_needed   = qt × units_per_uom (componente: quantidade × qt).
--   is_sold      = tem 'venda' não estornada ligada à linha (reference_id) —
--                  produtos manages_stock=true baixados na assinatura.
--   is_served    = is_sold OU há 'saida' não estornada do produto neste
--                  contrato (mesma deteção do detalhe/listagem).
--   qty_ordered  = itens de PO não cancelados/apagados ligados à linha
--                  (quote_line_id + component_index); itens antigos sem
--                  ligação formam um "pool" por (contrato, produto) repartido
--                  pelas linhas desse produto por ordem. Limitado a qty_needed.
--   qty_received = parte recebida de qty_ordered (PO 'received' = tudo).
--   qty_served   = venda → qty_needed; saída → parte do total de saídas do
--                  (contrato, produto) repartida por ordem.
--   qty_reserved = só linhas pendentes: parte do stock livre por ordem
--                  (window por produto):
--                    LEAST(S, acum_incl) − LEAST(S, acum_incl − em_falta_PO)
--                  com S = GREATEST(0, stock da organização). É equivalente a
--                  LEAST(em_falta_PO, GREATEST(0, S − reservado_anterior)).
--   qty_missing  = pendente: em_falta_PO − reservado;
--                  saída: qty_needed − ordered − servido;
--                  venda: parte que a baixa deixou negativa ainda sem PO =
--                    LEAST(qty_needed, défice no momento da venda
--                    (−balance_after), défice atual da organização) − ordered.
--   seq          = posição na fila do produto (1 = mais antiga).
--
-- p_product_ids filtra os produtos ANTES das windows — é seguro porque todas
-- as partições são por produto (ou contrato+produto).
-- Uso interno apenas (SECURITY DEFINER, EXECUTE só service_role): é chamada
-- pelas RPC abaixo, que fazem as verificações de âmbito/permissão.
CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations(
  p_organization_id uuid,
  p_product_ids uuid[] DEFAULT NULL
)
 RETURNS TABLE(
   contract_id     uuid,
   quote_line_id   uuid,
   component_index integer,
   product_id      uuid,
   seq             bigint,
   is_served       boolean,
   is_sold         boolean,
   qty_needed      numeric,
   qty_served      numeric,
   qty_ordered     numeric,
   qty_received    numeric,
   qty_reserved    numeric,
   qty_missing     numeric
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
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
      SUM(LEAST(sm.quantity, GREATEST(0, -sm.balance_after)))::numeric AS sd_short
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
  )
  SELECT
    f.l_contract_id,
    f.l_quote_line_id,
    f.l_component_index,
    f.l_product_id,
    f.s5_seq,
    (f.s1_is_sold OR f.s1_has_exit),
    f.s1_is_sold,
    f.l_qty_needed,
    CASE WHEN f.s1_is_sold THEN f.l_qty_needed
         WHEN f.s1_has_exit THEN f.s3_exit_alloc
         ELSE 0 END::numeric,
    f.s3_ordered,
    (f.s1_linked_recv + f.s3_pool_recv_alloc),
    CASE WHEN f.s1_is_sold OR f.s1_has_exit THEN 0 ELSE f.f_reserved END::numeric,
    CASE
      WHEN f.s1_is_sold THEN
        GREATEST(0, LEAST(f.l_qty_needed, f.s1_short_at_sale, f.s1_stock_debt) - f.s3_ordered)
      WHEN f.s1_has_exit THEN
        GREATEST(0, f.l_qty_needed - f.s3_ordered - f.s3_exit_alloc)
      ELSE
        GREATEST(0, f.s4_rem - f.f_reserved)
    END::numeric
  FROM final f;
$function$;

COMMENT ON FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]) IS
  'Encomendas Clientes: reserva de stock por ordem de assinatura (window por produto). Interna — só chamada por RPC SECURITY DEFINER que validam âmbito/permissões. Ver migration 20261204310000.';

REVOKE ALL ON FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 3a. NOVA fn_client_order_request_missing
-- ────────────────────────────────────────────────────────────────────────────
-- Pede ao fornecedor preferido APENAS qty_missing de cada linha da encomenda
-- (p_quote_line_ids NULL = todas as linhas). Idempotente por linha: o que já
-- tem item de PO ligado à linha sai de qty_missing, logo nunca volta a ser
-- pedido. Reutiliza um PO 'pending' (não apagado) do mesmo (contrato,
-- fornecedor); senão cria um. Mesmas regras de fornecedor/preço/unidade que o
-- gatilho antigo (20261204203500): item_suppliers preferido; preço da ligação,
-- senão preço de compra do produto × fator; unidade da ligação com
-- arredondamento para cima; unidade incompatível/quantidade fracionária
-- salta a linha com aviso, nunca aborta as outras.
--
-- Concorrência: advisory lock por contrato (duplo clique / gatilho + botão) e
-- FOR UPDATE nas linhas de stocks dos produtos da encomenda (ordenado por
-- produto, armazém) — o mesmo lock usado por rpc_confirm_client_order_stock_exit,
-- para a fila não mudar enquanto se calcula.
--
-- Interna (EXECUTE só service_role). Não verifica permissões do utilizador:
-- quem chama (gatilho de assinatura, rpc_request_missing_from_supplier,
-- rpc_update_manual_client_order) é responsável por isso.
CREATE OR REPLACE FUNCTION public.fn_client_order_request_missing(
  p_contract_id uuid,
  p_actor uuid,
  p_quote_line_ids uuid[] DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    SELECT r.quote_line_id, r.component_index, r.product_id,
           r.qty_needed, r.qty_missing,
           p.name AS product_name, p.sku AS product_sku
    FROM public.fn_client_order_line_reservations(v_org, v_products) r
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

    v_supplier_id := NULL; v_purchase_price := NULL; v_link_uom := NULL; v_link_sku := NULL;

    SELECT supplier_id, purchase_price, uom_id, supplier_sku
      INTO v_supplier_id, v_purchase_price, v_link_uom, v_link_sku
    FROM public.item_suppliers
    WHERE product_id = v_line.product_id
      AND is_preferred = true
      AND deleted_at IS NULL
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
          format('Gerada automaticamente a partir do contrato %s', COALESCE(v_contract_number, p_contract_id::text)),
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
      'resolved_quote_id', v_quote_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_orders_created', v_pos_created,
    'items_created', v_items_created,
    'skipped_no_supplier', v_skipped_no_supplier,
    'skipped_other', v_skipped_other,
    'errors', v_errors
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_client_order_request_missing(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_client_order_request_missing(uuid, uuid, uuid[]) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 3b. fn_contract_supplier_request (gatilho) — delega na função acima
-- ────────────────────────────────────────────────────────────────────────────
-- Mantém: portão de transição para assinado, portão
-- organization_inventory_settings.stock_deduction_trigger='contract_signed',
-- resolução do orçamento, resolução do autor (e o erro se não houver),
-- best-effort (nunca bloqueia a escrita em client_contracts), logs.
-- ALTERADO:
--   * pede só qty_missing por linha (reserva por ordem + POs ligados);
--   * passa a incluir manages_stock=true: linhas ainda sem venda (ex.:
--     componentes de bundle, org sem armazém resolvido) entram na fila; linhas
--     com venda que deixou stock negativo pedem a parte negativa (a venda já
--     foi feita por trg_contract_stock_deduction — ver ordem no cabeçalho);
--   * deixa de saltar o fornecedor inteiro quando já existe um PO do
--     (contrato, fornecedor): idempotência por linha, reutilizando o PO
--     'pending' existente;
--   * purchase_order_items.quote_line_id/component_index preenchidos.
-- Permissões/ACL: CREATE OR REPLACE preserva as existentes.
CREATE OR REPLACE FUNCTION public.fn_contract_supplier_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_trigger_mode         text;
  v_resolved_quote_id    uuid;
  v_actor                uuid;
  v_result               jsonb;
BEGIN
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT stock_deduction_trigger INTO v_trigger_mode
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
    END IF;

    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

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

    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      SELECT q.created_by INTO v_actor
      FROM public.quotes q
      WHERE q.id = v_resolved_quote_id;
    END IF;

    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Não foi possível determinar o autor do pedido a fornecedor (contrato %, quote %)', NEW.id, v_resolved_quote_id;
    END IF;

    -- NOVO (20261204310000): reserva por ordem + pedido só do que falta.
    v_result := public.fn_client_order_request_missing(NEW.id, v_actor, NULL);

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'purchase_order', NULL,
      'trigger:contract_po_request', 'success',
      COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('resolved_quote_id', v_resolved_quote_id)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'purchase_order', NULL,
        'trigger:contract_po_request', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4a. rpc_get_client_order_document — estado por linha com reserva
-- ────────────────────────────────────────────────────────────────────────────
-- Base: definição viva (20261204290000). Mesmas verificações de permissão.
-- Encomenda assinada: estado vem de fn_client_order_line_reservations:
--   servido (venda/saída) sem falta      -> 'servido_por_stock'
--   servido mas com falta por cobrir     -> 'parcial'
--   reservado = tudo o que falta de PO   -> 'stock_disponivel_confirmar'
--   reservado + (PO e/ou falta)          -> 'parcial'
--   sem reserva, falta + algum PO        -> 'parcial'
--   sem reserva, falta sem PO            -> 'sem_fornecedor'
--   tudo em PO, tudo recebido            -> 'recebido'
--   tudo em PO                           -> 'a_aguardar_encomenda'
-- Encomenda não assinada (ex.: cancelada aberta por link): comportamento
-- anterior, sem reserva (bloco legado mantido tal e qual).
-- Chaves novas por linha: component_index, qty_needed, qty_reserved,
-- qty_ordered, qty_received, qty_missing. available_warehouses: só quando há
-- reserva; 'quantity' = LEAST(stock do armazém, qty_reserved) e
-- 'physical_quantity' = stock do armazém.
-- Chaves novas no topo: missing_lines_count, can_request_missing.
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
    cc.order_number, cc.entity_id, COALESCE(cc.is_manual_order, false)
  INTO v_org, v_status, v_contract_number, v_signature_date, v_total_value,
       v_client_name, v_resolved_quote_id,
       v_order_number, v_entity_id, v_is_manual
  FROM public.client_contracts cc
  LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
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

  -- NOVO (20261204310000)
  v_is_signed := v_status IN ('signed', 'assinado');

  -- NOVO (20261204290000): morada de entrega = morada da obra do orçamento
  -- resolvido; senão a morada principal do cliente.
  IF v_resolved_quote_id IS NOT NULL THEN
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
          v_q_served_flag := COALESCE((v_res ->> 'is_served')::boolean, false);

          IF v_q_served_flag THEN
            v_line_status := CASE WHEN v_q_missing > 0 THEN 'parcial' ELSE 'servido_por_stock' END;
          ELSIF v_q_reserved > 0 THEN
            v_line_status := CASE WHEN v_q_ordered = 0 AND v_q_missing = 0
                                  THEN 'stock_disponivel_confirmar' ELSE 'parcial' END;
          ELSIF v_q_missing > 0 THEN
            v_line_status := CASE WHEN v_q_ordered > 0 THEN 'parcial' ELSE 'sem_fornecedor' END;
          ELSIF v_q_ordered > 0 THEN
            v_line_status := CASE WHEN v_q_received >= v_q_ordered
                                  THEN 'recebido' ELSE 'a_aguardar_encomenda' END;
          ELSE
            -- Quantidade nula/zero: nada a servir (como antes: stock >= 0).
            v_line_status := 'stock_disponivel_confirmar';
          END IF;

          IF v_q_missing > 0 THEN
            v_missing_lines := v_missing_lines + 1;
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
        'qty_missing',           v_q_missing
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
    'missing_lines_count', v_missing_lines,
    'can_request_missing', (v_is_signed AND v_missing_lines > 0)
  );
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4b. rpc_list_client_order_documents — contagens com reserva
-- ────────────────────────────────────────────────────────────────────────────
-- Base: definição viva (20261204290000). Assinatura e colunas iguais (sem
-- DROP). Mesmo mapeamento do detalhe; 'parcial' e
-- 'stock_disponivel_confirmar' contam em lines_awaiting_order (como antes
-- para o stock disponível). overall_status inalterado.
-- ALTERADO: componentes de bundle passam a exigir o produto existente
-- (JOIN products), como no detalhe e no gatilho — as contagens batem com o
-- detalhe.
CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, lines_service integer, overall_status text, order_number text, origin_type text, origin_number text)
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
        WHEN r.r_is_served AND r.r_qty_missing > 0 THEN 'partial'
        WHEN r.r_is_served THEN 'stock'
        -- Tudo reservado: "stock disponível — confirmar saída" conta como
        -- a aguardar (decisão de 20261120190000, mantida).
        WHEN r.r_qty_reserved > 0 AND r.r_qty_ordered = 0 AND r.r_qty_missing = 0 THEN 'awaiting'
        WHEN r.r_qty_reserved > 0 THEN 'partial'
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
      END AS a_origin_number
    FROM combined c
    JOIN public.client_contracts cco ON cco.id = c.a_contract_id
    LEFT JOIN LATERAL (
      SELECT true AS ds_found, d.sale_number AS ds_sale_number
      FROM public.direct_sales d
      WHERE d.client_contract_id = c.a_contract_id
      ORDER BY d.created_at DESC
      LIMIT 1
    ) ds ON true
  )
  SELECT
    f.a_contract_id          AS contract_id,
    f.a_contract_number      AS contract_number,
    f.a_client_name          AS client_name,
    f.a_signature_date       AS signature_date,
    f.a_total_lines          AS total_lines,
    f.a_lines_from_stock     AS lines_from_stock,
    f.a_lines_awaiting_order AS lines_awaiting_order,
    f.a_lines_received       AS lines_received,
    f.a_lines_no_supplier    AS lines_no_supplier,
    f.a_lines_service        AS lines_service,
    f.a_overall_status       AS overall_status,
    f.a_order_number         AS order_number,
    f.a_origin_type          AS origin_type,
    f.a_origin_number        AS origin_number
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
  LIMIT v_limit OFFSET v_offset;
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. rpc_confirm_client_order_stock_exit — só consome o que está reservado
-- ────────────────────────────────────────────────────────────────────────────
-- Base: definição viva (20261204290000). Mantém verificações de âmbito,
-- permissões (inventory.edit + client_contracts.view +
-- client_orders.confirm_stock_exit), guarda de idempotência (uma saída por
-- contrato/produto) e rpc_decrement_stock.
-- NOVO:
--   * FOR UPDATE nas linhas de stocks do produto na organização (ordem por
--     armazém) ANTES da guarda — serializa confirmações concorrentes do mesmo
--     produto (inclusive duplo clique) e pedidos a fornecedor; cada instrução
--     seguinte vê o que a outra transação gravou (READ COMMITTED).
--   * p_quantity ≤ soma de qty_reserved das linhas deste produto nesta
--     encomenda; mensagem clara quando o stock está reservado para encomendas
--     anteriores. Produto que não faz parte da encomenda (ou encomenda não
--     assinada) é recusado.
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
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number
  INTO v_org, v_contract_number
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
  -- ADICIONALMENTE a inventory.edit + client_contracts.view (ambos mantidos).
  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view')
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

  v_balance_after := public.rpc_decrement_stock(
    p_product_id       => p_product_id,
    p_warehouse_id     => p_warehouse_id,
    p_qty              => p_quantity,
    p_document_number  => NULL,
    p_document_type    => 'venda',
    p_counterparty     => NULL,
    p_notes            => format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number),
    p_sale_source_type => 'contract',
    p_sale_source_id   => p_contract_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;

-- A ACL viva ainda tinha EXECUTE para anon (sem efeito prático: auth.uid()
-- NULL falha as verificações). Alinha com rpc_revert_client_order_stock_exit
-- — só aperta, nunca alarga.
REVOKE ALL ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_client_order_stock_exit(uuid, uuid, integer, uuid) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. NOVA rpc_request_missing_from_supplier — botão "Pedir em falta"
-- ────────────────────────────────────────────────────────────────────────────
-- Permissões: as mesmas de rpc_create_purchase_order (purchase_orders.create
-- + fn_deal_org_in_scope) e ver a encomenda (client_contracts.view + org
-- visível). Só encomendas assinadas. Ignora o modo
-- stock_deduction_trigger (é uma ação explícita do utilizador).
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
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
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

REVOKE ALL ON FUNCTION public.rpc_request_missing_from_supplier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_missing_from_supplier(uuid) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. rpc_update_manual_client_order — pede a parte em falta das linhas
--    novas/aumentadas
-- ────────────────────────────────────────────────────────────────────────────
-- Base: definição viva (20261204300000). Validações, bloqueios e permissões
-- iguais. NOVO: depois de gravar, para as linhas de produto novas ou cuja
-- quantidade subiu / produto ou unidade mudou, chama
-- fn_client_order_request_missing (só qty_missing dessas linhas). Respeita o
-- modo stock_deduction_trigger da organização (como o gatilho de
-- assinatura). Best-effort: uma falha no pedido é registada e não desfaz a
-- edição (o botão "Pedir em falta" permite repetir). Chave nova no retorno:
-- supplier_request (jsonb ou NULL).
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

  -- ── Autorização: permissão de edição de contratos ───────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
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
  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id) THEN
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

COMMIT;
