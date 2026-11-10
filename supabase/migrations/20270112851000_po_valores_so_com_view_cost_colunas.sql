-- ============================================================
-- 20270112851000 — Encomendas a fornecedor: valores só com products.view_cost (2/2: colunas fechadas)
-- ============================================================
-- SÓ aplicar DEPOIS de, por esta ordem:
--   (a) 20270112850000 (vistas po_v_purchase_orders / po_v_purchase_order_items);
--   (b) 20270112852000 (rpc_update/rpc_create_purchase_order sem depender dos preços lidos pelo ecrã + PDF por RPC) e
--       20270112853000 (vista po_v_purchase_order_item_cancellations, políticas das anulações e da auditoria);
--   (c) o ecrã que lê as vistas/RPC em vez das tabelas estar publicado (todas as leituras com select("*") ou com
--       colunas de valor — senão dão 42501 «permission denied», também a quem tem products.view_cost).
--
-- O quê: REVOKE SELECT das tabelas a anon e authenticated; GRANT SELECT só nas colunas sem valor a authenticated.
--   purchase_orders: fecha total_value. purchase_order_items: fecha unit_price, total_price, vat_amount.
--   purchase_order_item_cancellations: fecha total_price_*, vat_amount_*, po_total_value_* (lê-se pela vista de 853).
--   anon deixa de ter SELECT (nunca lia nada: as políticas pedem auth.uid()).
--   ops_v_compra_linha (security_invoker, lê unit_price/total_price): deixa de ser legível por anon/authenticated —
--     ficaria a dar 42501 de qualquer forma; só a leem rpc_ops_lancar_custo (SECURITY DEFINER, corre como dono) e um
--     comentário de fn_po_cancel_line_remainder_internal. Nenhum ecrã nem edge function a lê.
-- Não afetado: as RPCs (todas SECURITY DEFINER) e as funções INVOKER internas que só elas chamam (correm como dono);
--   as políticas RLS (usam id/organization_id/purchase_order_id, que continuam concedidas); os gatilhos (NEW/OLD
--   não precisam de privilégio de coluna e as escritas passam pelas RPCs).
-- Escritas diretas (INSERT/UPDATE/DELETE de authenticated): não mudam aqui.
--
-- Guarda (10/11/2026): colunas exatas das 2 tabelas; vistas de 1/2 existem; ops_v_compra_linha com a definição viva
--   (md5 abaixo, só para garantir que é a vista conhecida).
-- Reversão: GRANT SELECT ON public.purchase_orders, public.purchase_order_items, public.purchase_order_item_cancellations
--   TO authenticated (e anon nas duas primeiras, se quiser repor exatamente); GRANT SELECT ON public.ops_v_compra_linha
--   TO authenticated, anon.
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('purchase_orders', 'id,order_number,supplier_id,order_date,expected_delivery,status,total_value,notes,created_by,created_at,updated_at,organization_id,business_unit_id,deleted_at,deleted_by,source_type,source_id,actual_delivery_date,supplier_notes,payment_terms_days,payment_due_date'),
      ('purchase_order_items', 'id,purchase_order_id,product_id,service_id,item_type,description,sku,quantity,unit_price,total_price,notes,created_at,updated_at,vat_rate,vat_amount,selected_attributes,received_quantity,uom_id,units_per_uom,supplier_sku,quote_line_id,component_index,received_to_stock_units')
    ) AS t(tabela, colunas)
  LOOP
    IF (SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid = ('public.' || r.tabela)::regclass AND a.attnum > 0 AND NOT a.attisdropped) IS DISTINCT FROM r.colunas THEN
      RAISE EXCEPTION 'Guarda: as colunas de % mudaram desde 10/11/2026. Rever esta migration.', r.tabela;
    END IF;
  END LOOP;

  IF to_regclass('public.po_v_purchase_orders') IS NULL OR to_regclass('public.po_v_purchase_order_items') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta 20270112850000 (vistas po_v_*). Aplicar 1/2 primeiro.';
  END IF;
  IF to_regprocedure('public.rpc_po_documento_fornecedor(uuid)') IS NULL
     OR pg_get_functiondef('public.rpc_update_purchase_order(uuid,jsonb,jsonb)'::regprocedure) NOT LIKE '%fn_po_linhas_precos_guardados%'
     OR pg_get_functiondef('public.rpc_create_purchase_order(uuid,jsonb,jsonb)'::regprocedure) NOT LIKE '%fn_po_linhas_precos_guardados%' THEN
    RAISE EXCEPTION 'Guarda: falta 20270112852000 (RPCs de gravação e PDF). Aplicar primeiro.';
  END IF;
  IF to_regclass('public.po_v_purchase_order_item_cancellations') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta 20270112853000 (vista das anulações). Aplicar primeiro.';
  END IF;
  IF (SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid = 'public.purchase_order_item_cancellations'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM 'id,organization_id,purchase_order_id,purchase_order_item_id,batch_id,quantity_cancelled,quantity_before,quantity_after,total_price_before,total_price_after,vat_amount_before,vat_amount_after,po_total_value_before,po_total_value_after,po_status_before,po_status_after,po_actual_delivery_date_before,reason,notes,created_by,created_at,undone_at,undone_by,undo_reason' THEN
    RAISE EXCEPTION 'Guarda: as colunas de purchase_order_item_cancellations mudaram desde 10/11/2026. Rever esta migration.';
  END IF;

  IF md5(pg_get_viewdef('public.ops_v_compra_linha'::regclass)) <> 'a3cabbd121f635cf41f36f0ee6b829da' THEN
    RAISE EXCEPTION 'Guarda: ops_v_compra_linha mudou desde 10/11/2026. Rever esta migration.';
  END IF;
END $guarda$;

REVOKE SELECT ON public.purchase_orders FROM anon, authenticated;
GRANT SELECT (id, order_number, supplier_id, order_date, expected_delivery, status, notes, created_by, created_at, updated_at,
  organization_id, business_unit_id, deleted_at, deleted_by, source_type, source_id, actual_delivery_date, supplier_notes,
  payment_terms_days, payment_due_date)
  ON public.purchase_orders TO authenticated;

REVOKE SELECT ON public.purchase_order_items FROM anon, authenticated;
GRANT SELECT (id, purchase_order_id, product_id, service_id, item_type, description, sku, quantity, notes, created_at, updated_at,
  vat_rate, selected_attributes, received_quantity, uom_id, units_per_uom, supplier_sku, quote_line_id, component_index,
  received_to_stock_units)
  ON public.purchase_order_items TO authenticated;

REVOKE SELECT ON public.purchase_order_item_cancellations FROM anon, authenticated;
GRANT SELECT (id, organization_id, purchase_order_id, purchase_order_item_id, batch_id, quantity_cancelled, quantity_before,
  quantity_after, po_status_before, po_status_after, po_actual_delivery_date_before, reason, notes, created_by, created_at,
  undone_at, undone_by, undo_reason)
  ON public.purchase_order_item_cancellations TO authenticated;

REVOKE SELECT ON public.ops_v_compra_linha FROM PUBLIC, anon, authenticated;

DO $verificar$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('purchase_orders', 'total_value'), ('purchase_order_items', 'unit_price'), ('purchase_order_items', 'total_price'),
      ('purchase_order_items', 'vat_amount'), ('purchase_order_item_cancellations', 'total_price_before'),
      ('purchase_order_item_cancellations', 'total_price_after'), ('purchase_order_item_cancellations', 'vat_amount_before'),
      ('purchase_order_item_cancellations', 'vat_amount_after'), ('purchase_order_item_cancellations', 'po_total_value_before'),
      ('purchase_order_item_cancellations', 'po_total_value_after')
    ) AS t(tabela, coluna)
  LOOP
    IF has_column_privilege('authenticated', 'public.' || r.tabela, r.coluna, 'SELECT')
       OR has_column_privilege('anon', 'public.' || r.tabela, r.coluna, 'SELECT') THEN
      RAISE EXCEPTION 'Verificação: authenticated/anon continua a poder ler %.%.', r.tabela, r.coluna;
    END IF;
  END LOOP;
  IF NOT has_column_privilege('authenticated', 'public.purchase_orders', 'order_number', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.purchase_order_items', 'received_quantity', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.purchase_order_items', 'vat_rate', 'SELECT') THEN
    RAISE EXCEPTION 'Verificação: faltam as colunas concedidas.';
  END IF;
  IF has_table_privilege('authenticated', 'public.ops_v_compra_linha', 'SELECT') THEN
    RAISE EXCEPTION 'Verificação: ops_v_compra_linha continua legível por authenticated.';
  END IF;
END $verificar$;

NOTIFY pgrst, 'reload schema';
