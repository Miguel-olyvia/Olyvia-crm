-- ============================================================
-- Fix: rpc_update_product_subcategory / rpc_delete_product_subcategory
-- (and any other 1-arg caller of get_product_category_org_id) fail with
-- Postgres error 42725 "function public.get_product_category_org_id(uuid)
-- is not unique".
--
-- Root cause: two overloads of get_product_category_org_id existed —
-- an old get_product_category_org_id(cat_id uuid) and a newer, safer
-- get_product_category_org_id(cat_id uuid, depth integer DEFAULT 0)
-- (added later to guard against infinite recursion on cyclic parent
-- chains). Because the second parameter has a DEFAULT, any 1-arg call
-- site is ambiguous between "call the 1-arg overload" and "call the
-- 2-arg overload using its default" — Postgres refuses to guess.
--
-- 9 RLS policies (product_categories select/insert/delete,
-- category_attributes insert/update/delete, category_attribute_palettes
-- insert/update/delete) were already bound to the 1-arg overload's OID
-- at CREATE POLICY time (confirmed via pg_depend), so they kept working
-- despite the ambiguity — but that also blocked dropping the old
-- overload outright. This migration recreates those 9 policies calling
-- the 2-arg form explicitly (get_product_category_org_id(x, 0)),
-- matching the pattern product_categories_update already used, then
-- drops the now-unreferenced 1-arg overload. Every remaining call site
-- (RPCs in prior migrations) calls with 1 arg and will now
-- unambiguously resolve to the 2-arg overload's default depth=0,
-- identical prior behavior plus the recursion guard.
-- ============================================================

DROP POLICY "product_categories_select" ON public."product_categories";
CREATE POLICY "product_categories_select" ON public."product_categories" AS PERMISSIVE FOR SELECT TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR (id IN ( SELECT pco.category_id
   FROM product_category_organizations pco
  WHERE (pco.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))) OR ((parent_id IS NOT NULL) AND (public.get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

DROP POLICY "product_categories_insert" ON public."product_categories";
CREATE POLICY "product_categories_insert" ON public."product_categories" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'product_categories.create'::text) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'product_subcategories.create'::text) AND (public.get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

DROP POLICY "product_categories_delete" ON public."product_categories";
CREATE POLICY "product_categories_delete" ON public."product_categories" AS PERMISSIVE FOR DELETE TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'product_categories.delete'::text) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'product_subcategories.delete'::text) AND (public.get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

DROP POLICY "category_attributes_insert" ON public."category_attributes";
CREATE POLICY "category_attributes_insert" ON public."category_attributes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

DROP POLICY "category_attributes_update" ON public."category_attributes";
CREATE POLICY "category_attributes_update" ON public."category_attributes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))))))) WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

DROP POLICY "category_attributes_delete" ON public."category_attributes";
CREATE POLICY "category_attributes_delete" ON public."category_attributes" AS PERMISSIVE FOR DELETE TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

DROP POLICY "category_attribute_palettes_insert" ON public."category_attribute_palettes";
CREATE POLICY "category_attribute_palettes_insert" ON public."category_attribute_palettes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

DROP POLICY "category_attribute_palettes_update" ON public."category_attribute_palettes";
CREATE POLICY "category_attribute_palettes_update" ON public."category_attribute_palettes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))))))) WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

DROP POLICY "category_attribute_palettes_delete" ON public."category_attribute_palettes";
CREATE POLICY "category_attribute_palettes_delete" ON public."category_attribute_palettes" AS PERMISSIVE FOR DELETE TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (public.get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

DROP FUNCTION IF EXISTS public.get_product_category_org_id(uuid);
