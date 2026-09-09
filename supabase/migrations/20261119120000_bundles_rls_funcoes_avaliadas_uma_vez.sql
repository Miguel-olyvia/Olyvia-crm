-- ============================================================================
-- bundles / bundle_components: RLS deixa de chamar funcoes STABLE por LINHA
-- (achado de performance -- timeout 57014 ao carregar bundles).
--
-- -- O PROBLEMA -------------------------------------------------------------
-- As politicas de bundles e bundle_components chamavam is_system_admin_user()
-- e has_anew_permission() SEM as embrulhar num sub-SELECT. O Postgres avalia
-- essas funcoes STABLE uma vez POR LINHA. Na politica de bundle_components
-- (que a pagina de Bundles lê embebida), isso corria is_system_admin_user por
-- cada um dos ~milhares de componentes -- medido em producao: a leitura dos
-- componentes de uma org demorava ~924ms. Para um utilizador de uma org grande
-- (muitas orgs visiveis, mais bundles), o total passava o statement_timeout e
-- a query era cancelada (57014, "Erro ao carregar bundles").
--
-- -- A CORRECCAO (so performance, SEM mudar quem acede a quê) ---------------
-- Embrulhar cada chamada a is_system_admin_user() e has_anew_permission() num
-- escalar ( SELECT ... ). Como o argumento ja e (SELECT auth.uid()) -- estavel
-- -- o Postgres promove a expressao a InitPlan e avalia-a UMA vez por query, e
-- nao por linha. get_user_visible_org_ids() ja estava dentro de IN ( SELECT ...)
-- por isso ja era avaliada uma vez -- fica na mesma.
--
-- Semanticamente identico: ( SELECT f(x) ) devolve exatamente o mesmo booleano
-- que f(x). Nenhuma linha passa a ser visivel/escrevivel que nao fosse antes.
-- Medido em producao (transacao revertida): 924ms -> 38ms na leitura dos
-- componentes (~24x).
-- ============================================================================

-- ---- bundles ---------------------------------------------------------------
ALTER POLICY bundles_select ON public.bundles
  USING (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      deleted_at IS NULL
      AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

ALTER POLICY bundles_insert ON public.bundles
  WITH CHECK (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

ALTER POLICY bundles_update ON public.bundles
  USING (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      deleted_at IS NULL
      AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

ALTER POLICY bundles_delete ON public.bundles
  USING (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

-- ---- bundle_components ------------------------------------------------------
-- O EXISTS a bundles mantem-se (a visibilidade do componente segue o bundle);
-- so is_system_admin_user e has_anew_permission passam a ( SELECT ... ).
ALTER POLICY bundle_components_select ON public.bundle_components
  USING (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR EXISTS (
      SELECT 1 FROM public.bundles b
      WHERE b.id = bundle_components.bundle_id
        AND b.deleted_at IS NULL
        AND b.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

ALTER POLICY bundle_components_insert ON public.bundle_components
  WITH CHECK (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND EXISTS (
        SELECT 1 FROM public.bundles b
        WHERE b.id = bundle_components.bundle_id
          AND b.deleted_at IS NULL
          AND b.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );

ALTER POLICY bundle_components_update ON public.bundle_components
  USING (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND EXISTS (
        SELECT 1 FROM public.bundles b
        WHERE b.id = bundle_components.bundle_id
          AND b.deleted_at IS NULL
          AND b.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND EXISTS (
        SELECT 1 FROM public.bundles b
        WHERE b.id = bundle_components.bundle_id
          AND b.deleted_at IS NULL
          AND b.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );

ALTER POLICY bundle_components_delete ON public.bundle_components
  USING (
    (SELECT public.is_system_admin_user((SELECT auth.uid())))
    OR (
      (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage'))
      AND EXISTS (
        SELECT 1 FROM public.bundles b
        WHERE b.id = bundle_components.bundle_id
          AND b.deleted_at IS NULL
          AND b.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );
