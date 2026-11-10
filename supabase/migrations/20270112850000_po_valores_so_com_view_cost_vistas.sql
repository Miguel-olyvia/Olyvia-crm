-- ============================================================
-- 20270112850000 — Encomendas a fornecedor: valores só com products.view_cost (1/2: vistas mascaradas)
-- ============================================================
-- Problema: a política SELECT de purchase_orders deixa ler as linhas com purchase_orders.view (a de
--   purchase_order_items só pede a organização visível da PO) e o authenticated tem SELECT em todas as colunas.
--   Quem não tem products.view_cost recebia da base os valores, embora o ecrã mostre «—»
--   (src/pages/PurchaseOrders.tsx precoPo, src/components/purchase-orders/PoKpis.tsx PO_VALUE_PERMISSION):
--     purchase_orders.total_value; purchase_order_items.unit_price / vat_amount / total_price.
--   (vat_rate é uma taxa, não um valor: continua visível.)
--
-- Escolha (o mesmo padrão da Frota, 20270112800000/20270112801000): o RLS não mascara colunas e um REVOKE por coluna
--   parte os select("*") do ecrã. Por isso, em duas migrações:
--   1/2 (esta, segura com o ecrã atual e com o novo):
--     · Funções SECURITY DEFINER fn_po_valores_encomendas() / fn_po_valores_linhas() que devolvem (id, valores) SÓ
--       das encomendas cuja organização é visível ao utilizador E onde ele tem products.view_cost (a permissão que o
--       ecrã, rpc_po_historico e o registo de auditoria de purchase_order_items já usam para estes valores).
--     · Vistas security_invoker po_v_purchase_orders e po_v_purchase_order_items: as mesmas colunas, pela mesma ordem e
--       com os mesmos tipos das tabelas; as linhas vêm da tabela (o RLS de quem lê decide quais) e os valores vêm por
--       LEFT JOIN da função (NULL sem products.view_cost). O ecrã passa a ler estas vistas em vez das tabelas.
--   2/2 (20270112851000, só DEPOIS do ecrã que lê as vistas estar publicado E de rpc_update_purchase_order deixar de
--     depender dos preços lidos pelo ecrã — ver o relatório): REVOKE SELECT nas colunas de valor das tabelas.
--
-- Não muda nada do que existe: só cria 2 funções e 2 vistas. Nenhuma RPC usa as vistas (as RPCs leem as tabelas).
-- Guarda (10/11/2026): colunas exatas das 2 tabelas (as listas abaixo); RLS ligado nas 2; vistas novas ainda não existem.
-- Reversão: DROP VIEW po_v_purchase_order_items, po_v_purchase_orders; DROP FUNCTION fn_po_valores_linhas(),
--   fn_po_valores_encomendas().
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
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || r.tabela)::regclass) THEN
      RAISE EXCEPTION 'Guarda: % não tem RLS ligado. Rever esta migration.', r.tabela;
    END IF;
  END LOOP;

  IF to_regclass('public.po_v_purchase_orders') IS NOT NULL OR to_regclass('public.po_v_purchase_order_items') IS NOT NULL
     OR to_regprocedure('public.fn_po_valores_encomendas()') IS NOT NULL OR to_regprocedure('public.fn_po_valores_linhas()') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: já existe uma das vistas/funções novas. Rever esta migration.';
  END IF;
END $guarda$;

-- ------------------------------------------------------------
-- Os valores que cada um pode ver: só organizações visíveis E com products.view_cost.
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_po_valores_encomendas()
RETURNS TABLE (id uuid, total_value numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.total_value
  FROM public.purchase_orders p
  WHERE p.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND p.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'products.view_cost'))
$$;

CREATE FUNCTION public.fn_po_valores_linhas()
RETURNS TABLE (id uuid, unit_price numeric, total_price numeric, vat_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.unit_price, i.total_price, i.vat_amount
  FROM public.purchase_order_items i
  JOIN public.purchase_orders p ON p.id = i.purchase_order_id
  WHERE p.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND p.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'products.view_cost'))
$$;

REVOKE ALL ON FUNCTION public.fn_po_valores_encomendas(), public.fn_po_valores_linhas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_po_valores_encomendas(), public.fn_po_valores_linhas() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Vistas security_invoker: linhas pelo RLS de quem lê; valores só com products.view_cost.
-- ------------------------------------------------------------
CREATE VIEW public.po_v_purchase_orders WITH (security_invoker = true) AS
SELECT p.id, p.order_number, p.supplier_id, p.order_date, p.expected_delivery, p.status,
       v.total_value::numeric AS total_value,
       p.notes, p.created_by, p.created_at, p.updated_at, p.organization_id, p.business_unit_id, p.deleted_at, p.deleted_by,
       p.source_type, p.source_id, p.actual_delivery_date, p.supplier_notes, p.payment_terms_days, p.payment_due_date
FROM public.purchase_orders p
LEFT JOIN public.fn_po_valores_encomendas() v ON v.id = p.id;

CREATE VIEW public.po_v_purchase_order_items WITH (security_invoker = true) AS
SELECT i.id, i.purchase_order_id, i.product_id, i.service_id, i.item_type, i.description, i.sku, i.quantity,
       v.unit_price::numeric(10,2) AS unit_price, v.total_price::numeric(10,2) AS total_price,
       i.notes, i.created_at, i.updated_at, i.vat_rate,
       v.vat_amount::numeric AS vat_amount,
       i.selected_attributes, i.received_quantity, i.uom_id, i.units_per_uom, i.supplier_sku, i.quote_line_id,
       i.component_index, i.received_to_stock_units
FROM public.purchase_order_items i
LEFT JOIN public.fn_po_valores_linhas() v ON v.id = i.id;

REVOKE ALL ON public.po_v_purchase_orders, public.po_v_purchase_order_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.po_v_purchase_orders, public.po_v_purchase_order_items TO authenticated, service_role;

DO $verificar$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('purchase_orders', 'po_v_purchase_orders'), ('purchase_order_items', 'po_v_purchase_order_items')) AS t(tabela, vista)
  LOOP
    IF (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid = ('public.' || r.tabela)::regclass AND a.attnum > 0 AND NOT a.attisdropped)
       IS DISTINCT FROM
       (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid = ('public.' || r.vista)::regclass AND a.attnum > 0 AND NOT a.attisdropped) THEN
      RAISE EXCEPTION 'Verificação: % não tem as mesmas colunas/tipos/ordem de %.', r.vista, r.tabela;
    END IF;
    IF NOT ('security_invoker=true' = ANY (coalesce((SELECT c.reloptions FROM pg_class c WHERE c.oid = ('public.' || r.vista)::regclass), '{}'::text[]))) THEN
      RAISE EXCEPTION 'Verificação: % não é security_invoker.', r.vista;
    END IF;
  END LOOP;
END $verificar$;

NOTIFY pgrst, 'reload schema';
