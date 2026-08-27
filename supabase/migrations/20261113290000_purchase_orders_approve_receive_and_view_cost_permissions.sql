-- Encomendas (Purchase Orders) — permissões dedicadas de aprovação/receção
-- + permissões de "ver custo/preço de compra" para Products/Services/Suppliers.
-- 2026-11-13 | Módulos: Purchase Orders, Products, Services, Suppliers, Roles
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problema resolvido
-- -------------------
-- Hoje rpc_update_purchase_order() (20260814020000) permite QUALQUER
-- transição de status (incluindo pending→ordered, a "aprovação" de facto no
-- frontend atual) a quem tenha só 'purchase_orders.edit'. Da mesma forma,
-- rpc_receive_purchase_order() (20261113280000) também só exige
-- 'purchase_orders.edit' (+ 'inventory.edit') para marcar uma encomenda como
-- recebida e gerar a entrada de stock correspondente. Não há hoje forma de
-- separar "quem pode editar uma encomenda" de "quem pode aprová-la" ou
-- "quem pode recebê-la fisicamente" — dois momentos com impacto financeiro/
-- operacional distinto do simples editar campos.
--
-- Da mesma forma, não há hoje permissão dedicada para ver custo de compra em
-- Products/Services nem preço de compra em Suppliers (item_suppliers) — só
-- .view/.edit genéricos, que também dão acesso a dados de margem/custo.
--
-- O que esta migration faz
-- --------------------------
--   1. Regista 5 permissões novas em anew_permissions:
--        purchase_orders.approve   (categoria purchase_orders, is_dangerous=true)
--        purchase_orders.receive   (categoria purchase_orders, is_dangerous=true)
--        products.view_cost        (categoria products,        is_dangerous=false)
--        services.view_cost        (categoria services,         is_dangerous=false)
--        suppliers.view_pricing    (categoria suppliers,        is_dangerous=false)
--   2. Backfill: todos os papéis que já têm a permissão "irmã" mais lata
--      ficam também com a nova — zero mudança de comportamento agora,
--      infraestrutura pronta para restringir depois via a página Roles
--      já existente:
--        purchase_orders.edit  → também purchase_orders.approve
--        purchase_orders.edit  → também purchase_orders.receive
--        products.view         → também products.view_cost
--        services.view         → também services.view_cost
--        suppliers.view        → também suppliers.view_pricing
--   3. rpc_update_purchase_order(): acrescenta (aditivo, NÃO substitui o
--      check de .edit já existente) a exigência de purchase_orders.approve
--      só quando a transição pending→...→ordered está mesmo a acontecer
--      (v_before.status IS DISTINCT FROM 'ordered' AND novo status =
--      'ordered'). Qualquer outro UPDATE (incluindo manter status='ordered'
--      já existente, ou mudar outros campos) continua a exigir só .edit,
--      como hoje.
--   4. rpc_receive_purchase_order(): acrescenta (aditivo, mantém .edit e
--      inventory.edit já exigidos) a exigência de purchase_orders.receive.
--   5. Cria a vista public.item_suppliers_public (colunas não-sensíveis de
--      item_suppliers — sem purchase_price/currency/supplier_sku). Filtra
--      deleted_at IS NULL, mesmo padrão hoje aplicado no frontend
--      (ItemSuppliersTable.tsx faz .is("deleted_at", null) em todas as
--      leituras). REVISTO — ver ADDENDUM logo a seguir a este cabeçalho:
--      a versão security_invoker=true original NÃO protegia o custo a
--      sério (só escondia colunas na vista; a tabela base continuava
--      legível na íntegra por quem só tivesse products.view/services.view).
--      Substituída por uma vista sobre uma função SECURITY DEFINER.
--
-- ADDENDUM (mesmo dia, revisão de segurança) — lacuna encontrada e corrigida
-- ANTES de esta migration ser aplicada:
-- -----------------------------------------------------------------------
-- A policy item_suppliers_select_policy (20261112110000, ~linhas 340-350)
-- exige só products.view/services.view para ler QUALQUER coluna da TABELA
-- BASE, incluindo purchase_price/currency/supplier_sku. As novas permissões
-- .view_cost/.view_pricing só eram aplicadas no frontend (ItemSuppliersTable.tsx/
-- SupplierCatalogDialog.tsx escolhem item_suppliers vs item_suppliers_public
-- consoante a permissão) — um utilizador com só products.view conseguia
-- sempre ler o custo via API direta (supabase.from("item_suppliers").select()),
-- contornando a UI. Corrigido nesta mesma migration, antes de aplicada:
--   a) A policy item_suppliers_select_policy passa a exigir, ADICIONALMENTE
--      ao .view já existente, a permissão de custo/preço correspondente:
--        item_type='product' → products.view  AND products.view_cost
--        item_type='service' → services.view  AND services.view_cost
--        (novo, replicando o mesmo uso em SupplierCatalogDialog.tsx)
--                             → suppliers.view AND suppliers.view_pricing
--      Sem a permissão de custo, a tabela base fica ilegível de todo (não só
--      as colunas sensíveis) — quem só tem .view passa a ser obrigado a usar
--      item_suppliers_public.
--   b) Uma CREATE VIEW simples não tem cláusula SECURITY DEFINER em Postgres
--      (só funções têm) — confirmado, sem precedente de "vista com bypass de
--      RLS" no codebase (grep -rn "SECURITY DEFINER" supabase/migrations/ só
--      devolve RPCs de escrita/leitura de negócio, nunca uma vista). Padrão
--      mais próximo encontrado: funções SETOF/TABLE SECURITY DEFINER que
--      replicam à mão o predicado de RLS de origem (proposals_in_scope em
--      20261113070000 — mas essa é INVOKER deliberado; _bundle_children_authorize
--      + rpc_add_bundle_components em 20261022010000 — essa sim SECURITY
--      DEFINER, replica has_anew_permission()+get_user_visible_org_ids() à
--      mão). Seguido esse padrão: public.fn_item_suppliers_public() é uma
--      função SQL SECURITY DEFINER que replica à MÃO o predicado ORIGINAL
--      (pré-esta-migration) da policy — org scope + products.view/
--      services.view, SEM view_cost/view_pricing — e devolve só as colunas
--      não-sensíveis. A vista item_suppliers_public passa a ser
--      "SELECT * FROM fn_item_suppliers_public()": corre com os privilégios
--      elevados da função (que já filtrou tudo corretamente por si mesma),
--      nunca expõe mais linhas/colunas do que a função decide devolver.
--   c) Fora do âmbito de hoje (documentado, não resolvido): a policy de
--      UPDATE/INSERT/DELETE de item_suppliers continua a exigir só
--      products.edit/services.edit (20261112110000), tal como antes desta
--      migration existir — quem já tinha .edit já podia escrever/ler o
--      próprio valor que escrevia; não é uma lacuna nova introduzida hoje.
-- -----------------------------------------------------------------------
--
-- Prerequisites (confirmados por leitura do schema real, supabase db query --linked):
--   20260615130000_baseline_new_database.sql            — anew_permissions,
--                                                          anew_role_permissions,
--                                                          has_anew_permission()
--   20260814020000_purchase_orders_audit_bypass_and_rpcs.sql — rpc_update_purchase_order
--   20261113280000_rpc_receive_purchase_order.sql        — rpc_receive_purchase_order
--   20261112110000_item_suppliers_foundation.sql         — item_suppliers
--     (coluna de código de compra confirmada: supplier_sku, não purchase_code)
--
-- Confirmado ao vivo antes de escrever esta migration:
--   · anew_permissions.code tem UNIQUE constraint (anew_permissions_code_unique)
--     → ON CONFLICT (code) DO NOTHING é válido.
--   · anew_role_permissions tem UNIQUE (role_id, permission_code)
--     (anew_role_permissions_role_code_unique) → ON CONFLICT (role_id,
--     permission_code) DO NOTHING é válido. Colunas: id (default
--     gen_random_uuid()), role_id, permission_code, created_at (default
--     now()), created_by (nullable) — nenhuma coluna extra obrigatória.
--   · Categorias confirmadas: purchase_orders.edit → 'purchase_orders';
--     products.view → 'products'; services.view → 'services';
--     suppliers.view → 'suppliers'.
--   · Contagens pré-backfill (supabase db query --linked):
--       purchase_orders.edit → 128 linhas em anew_role_permissions
--       products.view        → 199 linhas
--       services.view        → 186 linhas
--       suppliers.view       → 186 linhas


-- ============================================================
-- 1. anew_permissions — 5 permissões novas
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope)
VALUES
  (
    'purchase_orders.approve',
    'Aprovar encomendas de compra',
    'Permite transitar uma encomenda de compra para o estado "encomendada" (aprovação da encomenda antes de ser enviada ao fornecedor).',
    'purchase_orders', NULL, 1, true, 'organization'
  ),
  (
    'purchase_orders.receive',
    'Receber encomendas de compra',
    'Permite marcar uma encomenda de compra como recebida, o que gera automaticamente a entrada de stock correspondente no armazém escolhido.',
    'purchase_orders', NULL, 2, true, 'organization'
  ),
  (
    'products.view_cost',
    'Ver custo de compra de produtos',
    'Permite ver o custo/preço de compra de produtos (dados de fornecedores associados via item_suppliers), além dos dados gerais já visíveis com products.view.',
    'products', NULL, 1, false, 'organization'
  ),
  (
    'services.view_cost',
    'Ver custo de compra de serviços',
    'Permite ver o custo/preço de compra de serviços (dados de fornecedores associados via item_suppliers), além dos dados gerais já visíveis com services.view.',
    'services', NULL, 1, false, 'organization'
  ),
  (
    'suppliers.view_pricing',
    'Ver preços de compra de fornecedores',
    'Permite ver os preços de compra praticados por um fornecedor (item_suppliers.purchase_price/currency/supplier_sku), além dos dados gerais já visíveis com suppliers.view.',
    'suppliers', NULL, 1, false, 'organization'
  )
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 2. Backfill — mesmos papéis que já têm a permissão "irmã" mais lata
--    ficam também com a nova. Zero mudança de comportamento agora.
--
-- NOTA (confirmada ao vivo antes de escrever esta migration): existe um
-- trigger protect_system_role_permissions() em anew_role_permissions que
-- bloqueia INSERT/UPDATE/DELETE para roles com is_system=true (System
-- Admin, Super Admin) exceto quando request.jwt.claims->>'role' =
-- 'service_role'. Sem o bypass abaixo, o backfill falharia com
-- "Permissões de roles de sistema não podem ser modificadas" assim que
-- tentasse tocar nesses 2 roles. Mesmo padrão já usado em
-- 20260919010000_seed_stocks_permissions.sql e
-- 20261111070000_add_rgpd_erasure_manage_permission.sql.
-- ============================================================

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT role_id, 'purchase_orders.approve'
  FROM public.anew_role_permissions
  WHERE permission_code = 'purchase_orders.edit'
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT role_id, 'purchase_orders.receive'
  FROM public.anew_role_permissions
  WHERE permission_code = 'purchase_orders.edit'
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT role_id, 'products.view_cost'
  FROM public.anew_role_permissions
  WHERE permission_code = 'products.view'
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT role_id, 'services.view_cost'
  FROM public.anew_role_permissions
  WHERE permission_code = 'services.view'
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT role_id, 'suppliers.view_pricing'
  FROM public.anew_role_permissions
  WHERE permission_code = 'suppliers.view'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
END $$;


-- ============================================================
-- 3. rpc_update_purchase_order() — exige purchase_orders.approve
--    ADICIONALMENTE a purchase_orders.edit, só na transição real para
--    'ordered'. Corpo idêntico ao de 20260814020000 exceto o bloco
--    assinalado "NOVO" abaixo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(
  p_purchase_order_id uuid,
  p_order             jsonb,
  p_items             jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_before     public.purchase_orders;
  v_order      public.purchase_orders;
  v_item       jsonb;
  v_diff       jsonb := '{}'::jsonb;
  v_po_diff    jsonb := '{}'::jsonb;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_key        text;
  v_new_status text;
  v_editable_cols text[] := ARRAY[
    'supplier_id','order_date','expected_delivery','status','total_value','notes'
  ];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_update RLS ──────────────────
  -- Predicate (2): the edit permission (checked first — fail before any read/write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load the before-image (for the diff + org-scope guard) ────────────────
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
    RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261113290000): exige purchase_orders.approve ADICIONALMENTE a
  --    .edit, só quando esta chamada está mesmo a transitar o status para
  --    'ordered' (não em updates que já estavam em 'ordered' e mantêm o
  --    estado, nem em updates que mudam outros campos sem tocar no status).
  v_new_status := COALESCE(nullif(p_order ->> 'status', ''), 'pending');
  IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
    IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.approve') THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = v_new_status,
      total_value       = COALESCE((p_order ->> 'total_value')::numeric, 0),
      notes             = nullif(p_order ->> 'notes', '')
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes
      )
      VALUES (
        p_purchase_order_id,
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

  -- ── Build the combined diff across both tables ────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_order);
  FOREACH v_key IN ARRAY v_editable_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_po_diff := v_po_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  -- ── Emit the single consolidated UPDATE audit row only when the PO itself
  --    actually changed — same pattern as rpc_update_deal (20260730010000), which
  --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
  --    (no real change in purchase_orders) every time the user re-submits the form
  --    without editing any field. When there IS a real PO change we also attach the
  --    resulting item set so the single row reflects the full save. ───────────
  IF v_po_diff <> '{}'::jsonb THEN
    v_diff := v_diff
      || jsonb_build_object('purchase_orders', v_po_diff)
      || jsonb_build_object(
           'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_purchase_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_purchase_order(uuid, jsonb, jsonb) TO authenticated;


-- ============================================================
-- 4. rpc_receive_purchase_order() — exige purchase_orders.receive
--    ADICIONALMENTE a purchase_orders.edit + inventory.edit (mantidos).
--    Corpo idêntico ao de 20261113280000 exceto o check de permissão.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(
    p_purchase_order_id uuid,
    p_warehouse_id      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_status      text;
  v_supplier_id uuid;
  v_order_number text;
  v_item        record;
  v_item_supplier_id uuid;
  v_qty         integer;
  v_balance     integer;
  v_lines       jsonb := '[]'::jsonb;
  v_line_count  integer := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT organization_id, status, supplier_id, order_number
  INTO v_org, v_status, v_supplier_id, v_order_number
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261113290000): purchase_orders.receive exigido ADICIONALMENTE a
  -- .edit e inventory.edit (ambos mantidos, aditivo).
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN
    SELECT id, product_id, quantity, unit_price, description
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      CONTINUE;
    END IF;
    IF v_item.quantity <> floor(v_item.quantity) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;
    v_qty := v_item.quantity::integer;

    -- Fornecedor concreto (item_suppliers) para este par produto/fornecedor da
    -- encomenda, se existir — melhor esforço, não bloqueia a receção se faltar
    -- (o produto pode ter sido descontinuado nesse fornecedor entretanto).
    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_supplier_id
      AND deleted_at IS NULL
    ORDER BY is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      notes, created_by
    ) VALUES (
      v_org, v_item.product_id, p_warehouse_id, 'entrada', v_qty,
      v_order_number, 'compra', v_item_supplier_id, v_item.unit_price,
      'Receção de ' || v_order_number, v_actor
    )
    RETURNING balance_after INTO v_balance;

    v_line_count := v_line_count + 1;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_item.product_id, 'quantity', v_qty, 'balance_after', v_balance
    );
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'received', updated_at = now()
  WHERE id = p_purchase_order_id;

  RETURN jsonb_build_object(
    'order_number', v_order_number,
    'warehouse_id', p_warehouse_id,
    'lines_received', v_line_count,
    'lines', v_lines
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order IS
  'Marca uma encomenda como recebida E gera a entrada de stock correspondente '
  '(uma linha em stock_movements por linha de produto da encomenda, no armazém '
  'escolhido) — tudo na mesma transação. Só receção total (todas as linhas de '
  'produto de uma vez); serviços não geram movimento. document_number reutiliza '
  'o order_number da própria encomenda. Exige purchase_orders.edit + '
  'purchase_orders.receive + inventory.edit (20261113290000).';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order TO authenticated;


-- ============================================================
-- 5a. Aperta item_suppliers_select_policy (20261112110000) — exige
--     ADICIONALMENTE a permissão de custo/preço correspondente, para que a
--     TABELA BASE (todas as colunas, incluindo purchase_price/currency/
--     supplier_sku) só seja legível por quem tem mesmo essa permissão.
--     Mantém intactos os predicados de INSERT/UPDATE/DELETE (fora do
--     âmbito de hoje — ver ADDENDUM no cabeçalho desta migration).
-- ============================================================

DROP POLICY IF EXISTS item_suppliers_select_policy ON public.item_suppliers;
CREATE POLICY item_suppliers_select_policy ON public.item_suppliers
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (
          item_type = 'product'
          AND public.has_anew_permission((SELECT auth.uid()), 'products.view')
          AND public.has_anew_permission((SELECT auth.uid()), 'products.view_cost')
        )
        OR (
          item_type = 'service'
          AND public.has_anew_permission((SELECT auth.uid()), 'services.view')
          AND public.has_anew_permission((SELECT auth.uid()), 'services.view_cost')
        )
        OR (
          -- Caminho do ecrã de Fornecedores (SupplierCatalogDialog.tsx): vê
          -- linhas de produto E serviço para um fornecedor, gate próprio,
          -- independente de products.view_cost/services.view_cost.
          public.has_anew_permission((SELECT auth.uid()), 'suppliers.view')
          AND public.has_anew_permission((SELECT auth.uid()), 'suppliers.view_pricing')
        )
      )
    )
  );

COMMENT ON POLICY item_suppliers_select_policy ON public.item_suppliers IS
  'Endurecida em 20261113290000 (revisão de segurança, mesmo dia): products.view/'
  'services.view sozinhos deixaram de bastar para ler a tabela base (incluíam '
  'purchase_price/currency/supplier_sku). Exige agora, adicionalmente, '
  'products.view_cost/services.view_cost — ou suppliers.view+suppliers.view_pricing '
  'para o caminho inverso (fornecedor→artigos). Quem só tem .view lê '
  'item_suppliers_public (fn_item_suppliers_public(), abaixo).';


-- ============================================================
-- 5b. public.item_suppliers_public — vista direta sobre item_suppliers,
--     replicando À MÃO o predicado ORIGINAL (pré-20261113290000) da policy de
--     SELECT: org scope + products.view/services.view, SEM view_cost/
--     view_pricing. Nunca devolve linha de organização fora do scope do
--     utilizador nem de um item_type sem a permissão .view de base — só
--     omite as colunas sensíveis.
--
--     Correção 2026-08-27 (mesma sessão): a primeira versão desta vista
--     passava por uma função SECURITY DEFINER (fn_item_suppliers_public(),
--     RETURNS TABLE) para bypassar a RLS agora apertada de item_suppliers —
--     mas confirmado via teste real contra o REST (não só SQL) que o
--     PostgREST não consegue inferir a relação de FK (product_id→products,
--     service_id→services, supplier_id→suppliers) através de uma vista que
--     assenta numa função: `?select=...,suppliers(name)` falhava com
--     PGRST200 "Could not find a relationship" — quebrava o embed que
--     ItemSuppliersTable.tsx/SupplierCatalogDialog.tsx dependem para mostrar
--     nomes. Corrigido usando antes uma vista SEM security_invoker (omitido =
--     false, o comportamento por omissão do Postgres para CREATE VIEW): a
--     vista corre com os privilégios do dono (bypassa a RLS da tabela base,
--     mesmo efeito que SECURITY DEFINER), mas por ser um SELECT direto sobre
--     item_suppliers (não uma função), o PostgREST consegue seguir a
--     linhagem das colunas até às FKs reais da tabela base — embed volta a
--     funcionar. Testado: sem PGRST200, e um utilizador real
--     (b9336dcd-0222-4e66-b535-ebd433a5b3f3, system_admin) vê exatamente as
--     144 linhas esperadas via `SET request.jwt.claims` simulando o utilizador.
-- ============================================================

CREATE VIEW public.item_suppliers_public AS
SELECT id, organization_id, item_type, product_id, service_id, supplier_id,
       lead_time_days, moq, is_preferred, is_active
FROM public.item_suppliers
WHERE deleted_at IS NULL
  AND (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.view'))
        OR (item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.view'))
      )
    )
  );

COMMENT ON VIEW public.item_suppliers_public IS
  'Subconjunto não-sensível de item_suppliers (sem purchase_price/currency/'
  'supplier_sku) para consumidores que só precisam de saber QUE fornecedores '
  'existem para um artigo, não a que preço. SEM security_invoker (omisso = '
  'false por omissão no Postgres) — corre com os privilégios do dono, '
  'bypassando deliberadamente a RLS apertada de item_suppliers (que agora '
  'exige view_cost/view_pricing), replicando à mão dentro do próprio SELECT '
  'o predicado original (org scope + products.view/services.view). Mantida '
  'como vista direta (não uma função) de propósito — só assim o PostgREST '
  'consegue inferir as FKs para embeds tipo suppliers(name)/products(name,sku).';

REVOKE ALL ON public.item_suppliers_public FROM PUBLIC, anon;
GRANT SELECT ON public.item_suppliers_public TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. As 5 permissões novas existem:
--      SELECT code, category, is_dangerous FROM anew_permissions
--      WHERE code IN ('purchase_orders.approve','purchase_orders.receive',
--                      'products.view_cost','services.view_cost','suppliers.view_pricing');
--
-- 2. Backfill correto (deve bater certo com as contagens da permissão-mãe):
--      purchase_orders.edit → 128 | purchase_orders.approve / .receive → 128 cada
--      products.view        → 199 | products.view_cost                → 199
--      services.view        → 186 | services.view_cost                → 186
--      suppliers.view       → 186 | suppliers.view_pricing             → 186
--
-- 3. rpc_update_purchase_order: um utilizador com .edit + .approve consegue
--    transitar pending→ordered; um utilizador só com .edit (sem .approve)
--    é rejeitado com 'Sem permissão para aprovar encomendas de compra'.
--    Um UPDATE que mantém status='ordered' (ou muda outro campo sem tocar
--    no status) NÃO exige .approve.
--
-- 4. rpc_receive_purchase_order: mesma lógica para .receive.
--
-- 5. item_suppliers_public devolve só as 10 colunas esperadas (sem
--    purchase_price/currency/supplier_sku) e respeita a RLS de
--    item_suppliers (um utilizador sem products.view/services.view não vê
--    linhas do tipo correspondente).
--
-- 6. (ADDENDUM, segurança) Utilizador com products.view MAS SEM
--    products.view_cost, na mesma organização de linhas reais de
--    item_suppliers item_type='product':
--      SELECT * FROM item_suppliers WHERE item_type='product';
--      -- Esperado: 0 linhas (RLS bloqueia a tabela base por completo).
--      SELECT * FROM item_suppliers_public WHERE item_type='product';
--      -- Esperado: as linhas da sua organização, com as 10 colunas não-
--      -- sensíveis, SEM purchase_price/currency/supplier_sku (nem sequer
--      -- como colunas presentes — a função não as seleciona).
--    Mesmo par de testes para services.view/services.view_cost e para
--    suppliers.view/suppliers.view_pricing (este último sem filtrar por
--    item_type — cobre as duas ramificações da tabela).
--
-- 7. (ADDENDUM) Utilizador com products.view + products.view_cost (ou
--    services./suppliers. equivalente): ambos os caminhos continuam a
--    devolver exatamente o mesmo que devolviam antes desta migration —
--    comportamento inalterado para quem já tinha a permissão de custo via
--    o backfill da secção 2.
--
-- 8. (ADDENDUM) Nenhum dos dois caminhos (tabela base nem
--    item_suppliers_public) devolve linhas de uma organização fora do
--    scope do utilizador, com ou sem view_cost/view_pricing — testado com
--    um utilizador de uma organização diferente da das linhas seed.
