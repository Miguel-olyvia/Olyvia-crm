-- =============================================================================
-- Desempenho das regras RLS que faziam timeout em «Artigos do fornecedor» (18/11).
-- Base de RH (uetjghdkwbywbftedtth). Sem tabelas, colunas nem dados novos.
--
-- Causa: is_system_admin_user(...) (STABLE, SECURITY DEFINER) não estava dentro de um (SELECT …) nas regras de
-- SELECT de item_suppliers, products e services, nem na vista item_suppliers_public (que também chama
-- has_anew_permission(auth.uid(), …) sem (SELECT …)). O Postgres avaliava a função linha a linha
-- (13 770 linhas do fornecedor × embeds de products/services → 22–33 s para super/system/org admin).
-- Com (SELECT …) passa a ser um InitPlan avaliado uma vez por consulta.
--
-- A lógica de acesso fica EXATAMENTE igual: as funções são STABLE e os argumentos não dependem da linha, por isso
-- (SELECT f(x)) dá o mesmo valor (incluindo NULL) que f(x). Cada texto abaixo parte do texto VIVO (pg_policies /
-- pg_get_viewdef) desta base; a única mudança é o envolvimento em (SELECT …).
-- Políticas: só USING das 3 políticas de SELECT (cmd, roles e permissive não mudam com ALTER POLICY … USING).
-- Vista: CREATE OR REPLACE mantém dono (postgres), GRANTs e colunas; a vista não tem reloptions
-- (sem security_invoker / security_barrier), por isso não leva WITH (...).
-- As regras de INSERT/UPDATE/DELETE não são tocadas.
-- =============================================================================

-- ─── 0. Guarda: os textos vivos ainda são os que esta migração substitui ───
DO $g$
BEGIN
  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'item_suppliers'
        AND policyname = 'item_suppliers_select_policy')
     IS DISTINCT FROM
     '(is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = ''product''::text) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''products.view''::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''products.view_cost''::text) AS get_user_permission_org_ids))) OR ((item_type = ''service''::text) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''services.view''::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''services.view_cost''::text) AS get_user_permission_org_ids))) OR ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''suppliers.view''::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''suppliers.view_pricing''::text) AS get_user_permission_org_ids))))))'
  THEN RAISE EXCEPTION 'item_suppliers_select_policy mudou desde a análise; rever antes de aplicar';
  END IF;

  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products'
        AND policyname = 'products_select')
     IS DISTINCT FROM
     '(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))'
  THEN RAISE EXCEPTION 'products_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services'
        AND policyname = 'services_select')
     IS DISTINCT FROM
     '(is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''services.view''::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))'
  THEN RAISE EXCEPTION 'services_select mudou desde a análise; rever antes de aplicar';
  END IF;

  -- espaços normalizados (o texto pode chegar com CRLF conforme o checkout)
  IF regexp_replace(pg_get_viewdef('public.item_suppliers_public'::regclass, false), '\s+', ' ', 'g') IS DISTINCT FROM
     regexp_replace(' SELECT id,
    organization_id,
    item_type,
    product_id,
    service_id,
    supplier_id,
    lead_time_days,
    moq,
    is_preferred,
    is_active
   FROM item_suppliers
  WHERE ((deleted_at IS NULL) AND (is_system_admin_user(auth.uid()) OR ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (((item_type = ''product''::text) AND has_anew_permission(auth.uid(), ''products.view''::text)) OR ((item_type = ''service''::text) AND has_anew_permission(auth.uid(), ''services.view''::text))))));', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'item_suppliers_public mudou desde a análise; rever antes de aplicar';
  END IF;
END
$g$;

-- ─── 1. item_suppliers: SELECT ───
ALTER POLICY item_suppliers_select_policy ON public.item_suppliers
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view_cost'::text) AS get_user_permission_org_ids))) OR ((item_type = 'service'::text) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view_cost'::text) AS get_user_permission_org_ids))) OR ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view_pricing'::text) AS get_user_permission_org_ids)))))));

-- ─── 2. products: SELECT ───
ALTER POLICY products_select ON public.products
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))));

-- ─── 3. services: SELECT ───
ALTER POLICY services_select ON public.services
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- ─── 4. Vista item_suppliers_public (mesmas colunas, mesma ordem, mesmos tipos) ───
CREATE OR REPLACE VIEW public.item_suppliers_public AS
 SELECT id,
    organization_id,
    item_type,
    product_id,
    service_id,
    supplier_id,
    lead_time_days,
    moq,
    is_preferred,
    is_active
   FROM item_suppliers
  WHERE ((deleted_at IS NULL) AND (( SELECT is_system_admin_user(auth.uid()) AS is_system_admin_user) OR ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND ( SELECT has_anew_permission(auth.uid(), 'products.view'::text) AS has_anew_permission)) OR ((item_type = 'service'::text) AND ( SELECT has_anew_permission(auth.uid(), 'services.view'::text) AS has_anew_permission))))));
