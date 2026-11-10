-- ============================================================
-- 20270112853000 — Encomendas a fornecedor: anulações e registo de auditoria (valores só com products.view_cost)
-- ============================================================
-- Problema:
--   · purchase_order_item_cancellations («Não vou receber o resto»): a política SELECT só pede a organização visível —
--     qualquer membro (mesmo sem purchase_orders.view) lia os totais antes/depois da linha e da encomenda
--     (total_price_*, vat_amount_*, po_total_value_*).
--   · entity_audit_log: os registos de purchase_order_items já pedem products.view_cost, mas os de purchase_orders
--     (diff/registo com total_value e, nas gravações pelas RPCs, as linhas com preços) caem no ELSE true.
--
-- O quê (o mesmo padrão de 20270112850000; o REVOKE das colunas fica em 20270112851000):
--   · A política purchase_order_item_cancellations_select passa a pedir também purchase_orders.view na organização
--     (como a de purchase_orders). O único ecrã que lê sem ser pelas encomendas (ClientOrders.tsx) já junta
--     purchase_orders!inner, por isso já dependia de purchase_orders.view.
--   · fn_po_valores_anulacoes() (SECURITY DEFINER) + vista security_invoker po_v_purchase_order_item_cancellations:
--     mesmas colunas/ordem/tipos; valores NULL sem products.view_cost. PurchaseOrders.tsx passa a ler a vista.
--   · entity_audit_log_select: 'purchase_orders' junta-se a 'stocks','stock_movements','purchase_order_items' (pede
--     products.view_cost). O histórico da encomenda no ecrã vem por rpc_po_historico (SECURITY DEFINER, já tira os
--     valores a quem não tem products.view_cost) e só lê a tabela direto se a RPC disser «sem permissão».
--     Substituição de UM texto na política viva, com guarda md5.
--
-- Guarda (10/11/2026): md5(qual) de purchase_order_item_cancellations_select = 0e75c95545d65f9b8f1e858815e58f86;
--   md5(qual) de entity_audit_log_select = 71da17e4500866a9debee7cf55c802a3; colunas exatas das anulações.
-- Reversão: ALTER POLICY purchase_order_item_cancellations_select ... USING (organization_id IN (SELECT
--   get_user_visible_org_ids((SELECT auth.uid())))); ALTER POLICY entity_audit_log_select com o ARRAY sem
--   'purchase_orders'; DROP VIEW po_v_purchase_order_item_cancellations; DROP FUNCTION fn_po_valores_anulacoes().
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'purchase_order_item_cancellations'
        AND policyname = 'purchase_order_item_cancellations_select') IS DISTINCT FROM '0e75c95545d65f9b8f1e858815e58f86' THEN
    RAISE EXCEPTION 'Guarda: purchase_order_item_cancellations_select mudou desde 10/11/2026. Rever esta migration.';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'entity_audit_log'
        AND policyname = 'entity_audit_log_select') IS DISTINCT FROM '71da17e4500866a9debee7cf55c802a3' THEN
    RAISE EXCEPTION 'Guarda: entity_audit_log_select mudou desde 10/11/2026. Rever esta migration.';
  END IF;
  IF (SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid = 'public.purchase_order_item_cancellations'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM 'id,organization_id,purchase_order_id,purchase_order_item_id,batch_id,quantity_cancelled,quantity_before,quantity_after,total_price_before,total_price_after,vat_amount_before,vat_amount_after,po_total_value_before,po_total_value_after,po_status_before,po_status_after,po_actual_delivery_date_before,reason,notes,created_by,created_at,undone_at,undone_by,undo_reason' THEN
    RAISE EXCEPTION 'Guarda: as colunas de purchase_order_item_cancellations mudaram desde 10/11/2026. Rever esta migration.';
  END IF;
  IF has_table_privilege('authenticated', 'public.purchase_order_item_cancellations', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Guarda: authenticated escreve em purchase_order_item_cancellations. Rever esta migration.';
  END IF;
  IF to_regclass('public.po_v_purchase_order_item_cancellations') IS NOT NULL OR to_regprocedure('public.fn_po_valores_anulacoes()') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: já existe a vista/função nova. Rever esta migration.';
  END IF;
END $guarda$;

ALTER POLICY purchase_order_item_cancellations_select ON public.purchase_order_item_cancellations
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
     AND (organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'purchase_orders.view'))));

CREATE FUNCTION public.fn_po_valores_anulacoes()
RETURNS TABLE (id uuid, total_price_before numeric, total_price_after numeric, vat_amount_before numeric, vat_amount_after numeric,
               po_total_value_before numeric, po_total_value_after numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.total_price_before, c.total_price_after, c.vat_amount_before, c.vat_amount_after, c.po_total_value_before, c.po_total_value_after
  FROM public.purchase_order_item_cancellations c
  WHERE c.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND c.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'products.view_cost'))
$$;

REVOKE ALL ON FUNCTION public.fn_po_valores_anulacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_po_valores_anulacoes() TO authenticated, service_role;

CREATE VIEW public.po_v_purchase_order_item_cancellations WITH (security_invoker = true) AS
SELECT c.id, c.organization_id, c.purchase_order_id, c.purchase_order_item_id, c.batch_id, c.quantity_cancelled, c.quantity_before,
       c.quantity_after,
       v.total_price_before::numeric AS total_price_before, v.total_price_after::numeric AS total_price_after,
       v.vat_amount_before::numeric AS vat_amount_before, v.vat_amount_after::numeric AS vat_amount_after,
       v.po_total_value_before::numeric AS po_total_value_before, v.po_total_value_after::numeric AS po_total_value_after,
       c.po_status_before, c.po_status_after, c.po_actual_delivery_date_before, c.reason, c.notes, c.created_by, c.created_at,
       c.undone_at, c.undone_by, c.undo_reason
FROM public.purchase_order_item_cancellations c
LEFT JOIN public.fn_po_valores_anulacoes() v ON v.id = c.id;

REVOKE ALL ON public.po_v_purchase_order_item_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.po_v_purchase_order_item_cancellations TO authenticated, service_role;

DO $auditoria$
DECLARE
  v_qual text := (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'entity_audit_log' AND policyname = 'entity_audit_log_select');
  v_old  text := $t$ARRAY['stocks'::text, 'stock_movements'::text, 'purchase_order_items'::text]$t$;
  v_new  text := $t$ARRAY['stocks'::text, 'stock_movements'::text, 'purchase_order_items'::text, 'purchase_orders'::text]$t$;
BEGIN
  IF (length(v_qual) - length(replace(v_qual, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Guarda: a lista de tabelas com custo de entity_audit_log_select não aparece exatamente uma vez.';
  END IF;
  EXECUTE format('ALTER POLICY entity_audit_log_select ON public.entity_audit_log USING (%s)', replace(v_qual, v_old, v_new));
END $auditoria$;

DO $verificar$
BEGIN
  IF (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid = 'public.purchase_order_item_cancellations'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM
     (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid = 'public.po_v_purchase_order_item_cancellations'::regclass AND a.attnum > 0 AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'Verificação: po_v_purchase_order_item_cancellations não tem as mesmas colunas/tipos/ordem.';
  END IF;
  IF (SELECT qual FROM pg_policies WHERE tablename = 'entity_audit_log' AND policyname = 'entity_audit_log_select') NOT LIKE '%''purchase_orders''::text]%' THEN
    RAISE EXCEPTION 'Verificação: entity_audit_log_select não ficou com purchase_orders.';
  END IF;
  IF (SELECT qual FROM pg_policies WHERE tablename = 'purchase_order_item_cancellations' AND policyname = 'purchase_order_item_cancellations_select') NOT LIKE '%purchase_orders.view%' THEN
    RAISE EXCEPTION 'Verificação: purchase_order_item_cancellations_select não pede purchase_orders.view.';
  END IF;
END $verificar$;

NOTIFY pgrst, 'reload schema';
