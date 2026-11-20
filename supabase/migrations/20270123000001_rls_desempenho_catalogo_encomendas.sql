-- Renumerada a 20/11/2026 (antes 20270123000000): havia duas migrations com a versão 20270123000000 (a outra é 20270123000000_so_o_portal_aceita_e_assina.sql).
-- Já estava aplicada à mão no editor SQL: mudar o nome do ficheiro não muda nada na base. O texto abaixo fica como foi aplicado
-- (onde diz «20270123000000» a falar desta migration, leia-se 20270123000001).
-- =============================================================================
-- Desempenho das regras RLS de leitura do catálogo usado nas Encomendas a fornecedor (19/11).
-- Base de RH (uetjghdkwbywbftedtth). Sem tabelas, colunas nem dados novos.
--
-- Sintoma: «Erro ao carregar encomendas — canceling statement due to statement timeout» ao abrir «Ver» /
-- «Nova Encomenda» (loadCatalog). A leitura de product_organizations da Mudelar demorava ~15 s (limite 8 s).
-- Causa: is_system_admin_user(...) (STABLE, SECURITY DEFINER) fora de (SELECT …) nas regras de SELECT — o Postgres
-- avaliava-a linha a linha (29 793 linhas). Com (SELECT …) passa a InitPlan, avaliado uma vez por consulta.
-- Mesmo padrão de 20270122500000_rls_desempenho_artigos_fornecedor.
--
-- A lógica de acesso fica EXATAMENTE igual: a função é STABLE e o argumento não depende da linha.
-- Cada texto parte do texto VIVO (pg_policies) desta base; a única mudança é o envolvimento em (SELECT …).
-- Só o USING das regras de SELECT (cmd, roles e permissive não mudam com ALTER POLICY … USING).
-- As regras de INSERT/UPDATE/DELETE não são tocadas.
-- =============================================================================

-- ─── 0. Guarda: os textos vivos ainda são os que esta migração substitui (espaços normalizados) ───
DO $g$
BEGIN
  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'brands'
        AND policyname = 'brands_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'brands_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'category_attributes'
        AND policyname = 'category_attributes_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (has_anew_permission(( SELECT auth.uid() AS uid), ''products.manage''::text) OR has_anew_permission(( SELECT auth.uid() AS uid), ''product_categories.view''::text))))))))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'category_attributes_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_attribute_values'
        AND policyname = 'product_attribute_values_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_attribute_values.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'product_attribute_values_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_categories'
        AND policyname = 'product_categories_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR (id IN ( SELECT pco.category_id
   FROM product_category_organizations pco
  WHERE (pco.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))) OR ((parent_id IS NOT NULL) AND (get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'product_categories_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_organizations'
        AND policyname = 'product_organizations_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'product_organizations_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_prices'
        AND policyname = 'product_prices_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (p.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''products.view''::text) AS get_user_permission_org_ids))))))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'product_prices_select mudou desde a análise; rever antes de aplicar';
  END IF;

  IF regexp_replace((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'service_prices'
        AND policyname = 'service_prices_select'), '\s+', ' ', 'g')
     IS DISTINCT FROM regexp_replace('(is_system_admin_user(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (s.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), ''services.view''::text) AS get_user_permission_org_ids))))) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))', '\s+', ' ', 'g')
  THEN RAISE EXCEPTION 'service_prices_select mudou desde a análise; rever antes de aplicar';
  END IF;

END
$g$;

-- ─── 1. Regras de SELECT: is_system_admin_user dentro de (SELECT …) ───

ALTER POLICY brands_select ON public.brands
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)));

ALTER POLICY category_attributes_select ON public.category_attributes
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_categories.view'::text))))))));

ALTER POLICY product_attribute_values_select ON public.product_attribute_values
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_attribute_values.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))));

ALTER POLICY product_categories_select ON public.product_categories
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR (id IN ( SELECT pco.category_id
   FROM product_category_organizations pco
  WHERE (pco.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))) OR ((parent_id IS NOT NULL) AND (get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))));

ALTER POLICY product_organizations_select ON public.product_organizations
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)));

ALTER POLICY product_prices_select ON public.product_prices
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (p.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids))))));

ALTER POLICY service_prices_select ON public.service_prices
  USING (( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (s.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids))))) OR (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))));
