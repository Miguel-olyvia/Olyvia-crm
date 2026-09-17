-- Permissões dedicadas: relatório de SLA de fornecedores + confirmação de
-- saída de stock em Encomendas Clientes.
-- 2026-11-30 | Módulos: Suppliers, Client Orders, Roles
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.
--
-- Problema resolvido
-- -------------------
-- Hoje rpc_get_supplier_sla_report()/rpc_get_supplier_sla_orders()
-- (20261130060000) só exigem 'suppliers.view' + 'purchase_orders.view' —
-- qualquer utilizador com acesso genérico a fornecedores e a encomendas de
-- compra vê o relatório de cumprimento de SLA, sem forma de restringir esse
-- ecrã em separado (dados sensíveis de desempenho de fornecedores). Da mesma
-- forma, rpc_confirm_client_order_stock_exit() (20261130070000) só exige
-- 'inventory.edit' + 'client_contracts.view' para confirmar a saída física
-- de stock a partir do checklist da Encomenda Cliente — uma ação com impacto
-- operacional direto (desconta stock real) sem permissão dedicada própria,
-- distinta do simples "editar inventário".
--
-- O que esta migration faz
-- --------------------------
--   1. Regista 2 permissões novas em anew_permissions:
--        suppliers.view_sla_report        (categoria suppliers,     is_dangerous=false)
--        client_orders.confirm_stock_exit (categoria client_orders, is_dangerous=true — NOVA categoria)
--      Sem backfill — ambas ficam por atribuir a nenhum papel até serem
--      concedidas manualmente na página Roles (comportamento restritivo por
--      omissão, ao contrário do padrão de 20261113290000, que fazia backfill
--      da permissão-mãe já lata; aqui a permissão-mãe genérica NÃO deve dar
--      automaticamente a nova permissão dedicada, para que o efeito real da
--      restrição seja imediato assim que aplicada).
--   2. rpc_get_supplier_sla_report(): acrescenta (aditivo, mantém
--      'suppliers.view' + 'purchase_orders.view' já exigidos) a exigência de
--      'suppliers.view_sla_report'. Resto da função 100% igual à versão viva
--      atual (20261130060000).
--   3. rpc_get_supplier_sla_orders(): mesma alteração aditiva. Resto da
--      função 100% igual à versão viva atual (20261130060000).
--   4. rpc_confirm_client_order_stock_exit(): acrescenta (aditivo, mantém
--      'inventory.edit' + 'client_contracts.view' já exigidos) a exigência de
--      'client_orders.confirm_stock_exit'. Resto da função 100% igual à
--      versão viva atual (20261130070000).
--
-- Prerequisites (confirmados por leitura do schema real, pg_get_functiondef
-- via ligação direta à BD --linked):
--   20260615130000_baseline_new_database.sql                  — anew_permissions,
--                                                                 anew_role_permissions,
--                                                                 has_anew_permission()
--   20261130060000_supplier_sla_actual_delivery.sql            — rpc_get_supplier_sla_report,
--                                                                 rpc_get_supplier_sla_orders
--   20261130070000_client_order_stock_checklist.sql             — rpc_confirm_client_order_stock_exit
--
-- Confirmado ao vivo antes de escrever esta migration:
--   · `supabase migration list` (leitura): última migration local e remota
--     coincidem em 20261130070000 — sem gaps remote-only.
--   · pg_get_functiondef() das 3 funções (rpc_get_supplier_sla_report,
--     rpc_get_supplier_sla_orders, rpc_confirm_client_order_stock_exit)
--     confirmado idêntico, linha a linha, aos ficheiros de migration
--     20261130060000/20261130070000 — ninguém mexeu depois. CREATE OR
--     REPLACE abaixo reproduz essa versão viva tal e qual, só trocando o
--     bloco de verificação de permissão assinalado "NOVO" em cada função.
--   · anew_permissions.code tem UNIQUE constraint (anew_permissions_code_unique)
--     → ON CONFLICT (code) DO NOTHING é válido.
--   · display_order já usados em category='suppliers': 0 (suppliers.edit/
--     .view/.create/.import/.delete/.export) e 1 (suppliers.view_pricing,
--     20261113290000) → próximo livre = 2, usado para suppliers.view_sla_report.
--   · category='client_orders' não existe ainda no catálogo (0 linhas) →
--     client_orders.confirm_stock_exit é a primeira permissão desta
--     categoria nova, display_order = 1.
--   · Nem 'suppliers.view_sla_report' nem 'client_orders.confirm_stock_exit'
--     existem já em anew_permissions.


-- ============================================================
-- 1. anew_permissions — 2 permissões novas
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope)
VALUES
  (
    'suppliers.view_sla_report',
    'Ver relatório de SLA de fornecedores',
    'Permite ver o relatório de cumprimento de SLA de entrega por fornecedor (rpc_get_supplier_sla_report/rpc_get_supplier_sla_orders), além dos dados gerais já visíveis com suppliers.view.',
    'suppliers', NULL, 2, false, 'organization'
  ),
  (
    'client_orders.confirm_stock_exit',
    'Confirmar saída de stock em Encomendas Clientes',
    'Permite confirmar, a partir do checklist de uma Encomenda Cliente, a saída física de stock de uma linha em estado "Stock disponível — confirmar saída" (rpc_confirm_client_order_stock_exit), desconta stock real.',
    'client_orders', NULL, 1, true, 'organization'
  )
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 2. rpc_get_supplier_sla_report() — exige suppliers.view_sla_report
--    ADICIONALMENTE a suppliers.view + purchase_orders.view (mantidos).
--    Corpo idêntico à versão viva atual (20261130060000), confirmada por
--    pg_get_functiondef(), exceto o bloco de permissão assinalado "NOVO".
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_report(
    p_supplier_id uuid DEFAULT NULL
) RETURNS TABLE (
    supplier_id     uuid,
    supplier_name   text,
    total_received  integer,
    within_sla      integer,
    over_sla        integer,
    avg_delay_days  numeric,
    compliance_pct  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- NOVO (20261130080000): suppliers.view_sla_report exigida ADICIONALMENTE
  -- a suppliers.view + purchase_orders.view (ambos mantidos).
  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.view')
     OR NOT public.has_anew_permission(auth.uid(), 'suppliers.view_sla_report')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver o relatório de SLA de fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id                 AS b_supplier_id,
      s.name                AS b_supplier_name,
      s.delivery_sla_days   AS b_sla_days
    FROM public.suppliers s
    WHERE s.deleted_at IS NULL
      AND s.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
      AND (p_supplier_id IS NULL OR s.id = p_supplier_id)
  ),
  received AS (
    SELECT
      po.supplier_id           AS r_supplier_id,
      po.order_date             AS r_order_date,
      po.actual_delivery_date   AS r_actual_delivery_date
    FROM public.purchase_orders po
    WHERE po.deleted_at IS NULL
      AND po.status = 'received'
      AND po.actual_delivery_date IS NOT NULL
  )
  SELECT
    b.b_supplier_id   AS supplier_id,
    b.b_supplier_name AS supplier_name,
    COUNT(r.r_actual_delivery_date)::integer AS total_received,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_actual_delivery_date IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) <= b.b_sla_days
      )::integer
    END AS within_sla,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_actual_delivery_date IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) > b.b_sla_days
      )::integer
    END AS over_sla,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      ROUND(
        AVG(r.r_actual_delivery_date - r.r_order_date - b.b_sla_days) FILTER (
          WHERE r.r_actual_delivery_date IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) > b.b_sla_days
        ),
        1
      )
    END AS avg_delay_days,
    CASE WHEN b.b_sla_days IS NULL OR COUNT(r.r_actual_delivery_date) = 0 THEN NULL ELSE
      ROUND(
        COUNT(*) FILTER (
          WHERE r.r_actual_delivery_date IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) <= b.b_sla_days
        )::numeric
        / COUNT(r.r_actual_delivery_date) * 100
      )
    END AS compliance_pct
  FROM base b
  LEFT JOIN received r ON r.r_supplier_id = b.b_supplier_id
  GROUP BY b.b_supplier_id, b.b_supplier_name, b.b_sla_days
  ORDER BY b.b_supplier_name;
END;
$$;


-- ============================================================
-- 3. rpc_get_supplier_sla_orders() — exige suppliers.view_sla_report
--    ADICIONALMENTE a suppliers.view + purchase_orders.view (mantidos).
--    Corpo idêntico à versão viva atual (20261130060000), confirmada por
--    pg_get_functiondef(), exceto o bloco de permissão assinalado "NOVO".
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_orders(
    p_supplier_id uuid
) RETURNS TABLE (
    order_number         text,
    order_date           date,
    expected_delivery    date,
    actual_delivery_date date,
    delivery_sla_days    integer,
    days_taken           integer,
    is_within_sla        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org      uuid;
  v_sla_days integer;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.organization_id, s.delivery_sla_days
  INTO v_org, v_sla_days
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261130080000): suppliers.view_sla_report exigida ADICIONALMENTE
  -- a suppliers.view + purchase_orders.view (ambos mantidos).
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'suppliers.view')
     OR NOT public.has_anew_permission(auth.uid(), 'suppliers.view_sla_report')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas deste fornecedor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    po.order_number,
    po.order_date,
    po.expected_delivery,
    po.actual_delivery_date,
    v_sla_days AS delivery_sla_days,
    (po.actual_delivery_date - po.order_date)::integer AS days_taken,
    CASE WHEN v_sla_days IS NULL THEN NULL
         ELSE (po.actual_delivery_date - po.order_date) <= v_sla_days
    END AS is_within_sla
  FROM public.purchase_orders po
  WHERE po.supplier_id = p_supplier_id
    AND po.deleted_at IS NULL
    AND po.status = 'received'
    AND po.actual_delivery_date IS NOT NULL
  ORDER BY po.actual_delivery_date DESC, po.order_number DESC;
END;
$$;


-- ============================================================
-- 4. rpc_confirm_client_order_stock_exit() — exige
--    client_orders.confirm_stock_exit ADICIONALMENTE a inventory.edit +
--    client_contracts.view (mantidos). Corpo idêntico à versão viva atual
--    (20261130070000), confirmada por pg_get_functiondef(), exceto o bloco
--    de permissão assinalado "NOVO".
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit(
    p_contract_id  uuid,
    p_product_id   uuid,
    p_quantity     integer,
    p_warehouse_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_balance_after   integer;
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

  -- Guarda de idempotência: não duplicar a saída se já houver um movimento
  -- (automático ou manual) registado para este contrato/produto — mesma
  -- deteção usada em rpc_get_client_order_document para line_status =
  -- 'servido_por_stock'.
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = p_product_id
      AND sm.movement_type IN ('venda', 'saida')
  ) THEN
    RAISE EXCEPTION 'Este produto já teve saída de stock registada para esta encomenda' USING ERRCODE = 'unique_violation';
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
$$;


-- ============================================================
-- Notas de verificação (para revisão humana, não executadas)
-- ============================================================
--
-- 1. As 2 permissões novas existem, sem backfill (0 linhas em
--    anew_role_permissions até serem atribuídas manualmente na página Roles):
--      SELECT code, category, display_order, is_dangerous FROM anew_permissions
--      WHERE code IN ('suppliers.view_sla_report','client_orders.confirm_stock_exit');
--
-- 2. rpc_get_supplier_sla_report/rpc_get_supplier_sla_orders: um utilizador
--    com suppliers.view + purchase_orders.view MAS SEM
--    suppliers.view_sla_report passa a ser rejeitado com
--    'insufficient_privilege' (antes desta migration via) — comportamento
--    novo, restritivo por omissão (ninguém tem a permissão ainda). Um
--    utilizador com as 3 permissões continua a ver o relatório exatamente
--    como antes (lógica de agregação inalterada).
--
-- 3. rpc_confirm_client_order_stock_exit: um utilizador com inventory.edit +
--    client_contracts.view MAS SEM client_orders.confirm_stock_exit passa a
--    ser rejeitado com 'Sem permissão para confirmar saída de stock desta
--    encomenda' — comportamento novo, restritivo por omissão. Guarda de
--    idempotência e chamada a rpc_decrement_stock inalteradas.
--
-- 4. rpc_get_client_order_document (20261130070000) NÃO foi tocada nesta
--    migration — continua a exigir só inventory.view + client_contracts.view,
--    tal como antes (fora do âmbito desta migration).
--
-- 5. Depois de aplicada, atribuir manualmente
--    suppliers.view_sla_report/client_orders.confirm_stock_exit aos papéis
--    relevantes via a página Roles — sem essa atribuição, NINGUÉM (exceto
--    quem tiver bypass de is_system_admin_user, se aplicável a
--    has_anew_permission) consegue usar estas 2 funcionalidades a partir de
--    já.
