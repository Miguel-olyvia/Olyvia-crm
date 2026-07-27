-- ============================================================
-- Fix: rpc_create_service_subcategory (and any other 1-arg caller of
-- get_service_category_org_id) fails with Postgres error 42725
-- "function public.get_service_category_org_id(uuid) is not unique".
--
-- Root cause: identical bug pattern to the one already fixed for
-- get_product_category_org_id (see 20260910010000). Two overloads
-- existed — get_service_category_org_id(cat_id uuid) and
-- get_service_category_org_id(cat_id uuid, depth integer DEFAULT 0).
-- Because the second parameter has a DEFAULT, any 1-arg call site is
-- ambiguous — Postgres refuses to guess. This completely blocked
-- creating any Service Subcategory through the UI.
--
-- 3 RLS policies (service_categories select/insert/delete) were
-- already bound to the 1-arg overload's OID at CREATE POLICY time
-- (confirmed via pg_depend); service_categories_update already used
-- the 2-arg form explicitly. This migration recreates the 3 dependent
-- policies calling the 2-arg form explicitly, then drops the
-- now-unreferenced 1-arg overload.
-- ============================================================

DROP POLICY "service_categories_delete" ON public."service_categories";
CREATE POLICY "service_categories_delete" ON public."service_categories" AS PERMISSIVE FOR DELETE TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'service_categories.delete'::text) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'service_subcategories.delete'::text) AND (get_service_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

DROP POLICY "service_categories_insert" ON public."service_categories";
CREATE POLICY "service_categories_insert" ON public."service_categories" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'service_categories.create'::text) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'service_subcategories.create'::text) AND (get_service_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

DROP POLICY "service_categories_select" ON public."service_categories";
CREATE POLICY "service_categories_select" ON public."service_categories" AS PERMISSIVE FOR SELECT TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (get_service_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

DROP FUNCTION IF EXISTS public.get_service_category_org_id(uuid);
