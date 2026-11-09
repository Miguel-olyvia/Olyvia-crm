-- =============================================================================
-- 20270109210000 — Leitura do catálogo: a permissão conta por organização
-- =============================================================================
-- Lote B (20270108210000/250000) passou a ESCRITA do catálogo a contar a
-- permissão na organização da linha. As policies de LEITURA que pedem uma
-- permissão ainda usavam has_anew_permission(uid, código) (global: chega tê-la
-- em QUALQUER organização) + «organização visível». Passam a:
--     <organização da linha> IN get_user_permission_org_ids(uid, código)
-- (a organização onde o papel tem a permissão e as filhas — 20270109200000).
-- A organização é a da própria linha ou, nas filhas, a do produto/serviço.
--   · product_prices / product_price_history ........ products.view (org do produto)
--   · services / service_price_history ............... services.view
--   · service_prices ................................. services.view (o 2.º ramo, sem
--       permissão — qualquer membro que veja o serviço — fica igual; ver reporte)
--   · service_materials .............................. services.view (org da linha)
--   · service_fee_types .............................. service_fees.view; as taxas
--       GLOBAIS (organization_id nulo) mantêm a verificação global, como as regras
--       globais da agenda no Lote B
--   · item_supplier_price_history .................... products.view / services.view
--   · catalog_items (select e manage) ................ quotes.view / quotes.manage — o
--       ramo «OR has_anew_permission(quotes.view)» deixava ler os artigos de TODAS as
--       organizações, mesmo as não visíveis
-- Sem mudança (não pedem permissão — só «organização visível», que já é por
-- organização): products, brands, bundles(+componentes/grupos), categorias,
-- atributos, uom, preços de atributos. category_attributes/palettes: as linhas de
-- categorias globais (sem organização) mantêm a verificação global.
-- O resto de cada policy fica igual (is_system_admin_user, visibilidade).
-- Partem de pg_policies vivas (05/11/2026); a guarda pára se alguma mudou.
-- Impacto nos dados de 05/11/2026: uma só organização — ninguém perde leitura.
-- =============================================================================
SET lock_timeout = '5s';

DO $guarda$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('product_prices', 'product_prices_select', '451b3789528d6ecc1312de85dca16b3b'),
      ('product_price_history', 'product_price_history_select', '5323355d5d639fce24ffaea0c0b0e0e9'),
      ('service_prices', 'service_prices_select', '19abe2368b0244f489c33191aae12161'),
      ('service_price_history', 'service_price_history_select', 'e1a78bcab7e9214a6922d6356e9e4932'),
      ('services', 'services_select', '3cbaf4e24ca4b37dc1caaa58dd99f726'),
      ('service_materials', 'service_materials_select_policy', '64057a5e411a6452355004163a46332a'),
      ('service_fee_types', 'service_fee_types_select', 'b81317f28e5199a0e7e3562ebcad49e9'),
      ('item_supplier_price_history', 'item_supplier_price_history_select_policy', '30fbe84b215fd91b26fd5436b7f256ff'),
      ('catalog_items', 'catalog_items_select', 'e53c67a16e859a1c660b26702a5d5819'),
      ('catalog_items', 'catalog_items_manage', '71c402b8d6948acb2f2ba2a7c0a5fdb3')
    ) AS v(t, p, m)
  LOOP
    IF (SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
          FROM pg_policies WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p) IS DISTINCT FROM r.m THEN
      RAISE EXCEPTION 'GUARDA: a policy %.% mudou desde a leitura (05/11/2026)', r.t, r.p;
    END IF;
  END LOOP;
END
$guarda$;

-- product_prices · SELECT (products.view na organização do produto)
ALTER POLICY "product_prices_select" ON public.product_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (p.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids)))))));

-- product_price_history · SELECT (products.view na organização do produto)
ALTER POLICY "product_price_history_select" ON public.product_price_history
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_price_history.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (p.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids)))))));

-- service_prices · SELECT (1.º ramo: services.view na organização do serviço; o 2.º ramo fica como estava)
ALTER POLICY "service_prices_select" ON public.service_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (s.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids))))) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))));

-- service_price_history · SELECT (services.view na organização do serviço)
ALTER POLICY "service_price_history_select" ON public.service_price_history
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_price_history.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (s.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids)))))));

-- services · SELECT (services.view na organização do serviço)
ALTER POLICY "services_select" ON public.services
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((services.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_materials · SELECT (services.view na organização da linha)
ALTER POLICY "service_materials_select_policy" ON public.service_materials
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (service_materials.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE (s.id = service_materials.service_id))))));

-- service_fee_types · SELECT (service_fees.view na organização da taxa; taxas globais: verificação global, como antes)
ALTER POLICY "service_fee_types_select" ON public.service_fee_types
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_fee_types.organization_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'service_fees.view'::text)) OR ((service_fee_types.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_fees.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- item_supplier_price_history · SELECT (products.view / services.view na organização da linha)
ALTER POLICY "item_supplier_price_history_select_policy" ON public.item_supplier_price_history
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (EXISTS ( SELECT 1
   FROM item_suppliers isup
  WHERE ((isup.id = item_supplier_price_history.item_supplier_id) AND (((isup.item_type = 'product'::text) AND (item_supplier_price_history.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids))) OR ((isup.item_type = 'service'::text) AND (item_supplier_price_history.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids))))))))));

-- catalog_items · SELECT (visível; o ramo quotes.view passa a contar só nas organizações onde a tem)
ALTER POLICY "catalog_items_select" ON public.catalog_items
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) OR (catalog_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'quotes.view'::text) AS get_user_permission_org_ids))));

-- catalog_items · ALL (quotes.manage na organização da linha)
ALTER POLICY "catalog_items_manage" ON public.catalog_items
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (catalog_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'quotes.manage'::text) AS get_user_permission_org_ids))))
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (catalog_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'quotes.manage'::text) AS get_user_permission_org_ids))));
