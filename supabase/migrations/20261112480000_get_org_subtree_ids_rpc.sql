-- ============================================================================
-- get_org_subtree_ids(): resolve o subtree de organizacoes numa unica ida a
-- base de dados, em vez de uma ida por nivel de profundidade.
--
-- PROBLEMA MEDIDO. src/lib/orgSubtree.ts::resolveOrgSubtree() faz BFS no
-- cliente: cada ronda do ciclo e um round-trip a anew_hierarchy com
-- .in('parent_org_id', frontier), em serie. Na pagina de Propostas isso
-- somava 11 pedidos a anew_hierarchy, 1746 ms, porque quatro hooks que montam
-- ao mesmo tempo no layout (useDescendantOrgIds, useNotifications,
-- useSidebarAlertCounts, useModuleAlerts) repetem cada um a travessia
-- completa. O padrao correto ja existe nesta base de dados -- ver a CTE
-- recursiva de get_user_work_orgs() -- e e o que se aplica aqui.
--
-- SEMANTICA: replica exatamente o BFS do cliente.
--   - Arranca em _root_org_id e desce por anew_hierarchy (parent -> child).
--   - UNION (nao UNION ALL) faz o papel do Set `visited` do cliente,
--     terminando em ciclos em vez de recorrer indefinidamente.
--   - NAO filtra relationship_type. O BFS do cliente tambem nao filtrava, e
--     acrescentar aqui o filtro ('parent_of'/'parent_child') que
--     get_user_work_orgs usa estreitaria o resultado -- seria alteracao de
--     comportamento, nao otimizacao.
--   - Devolve o root e todos os descendentes, como o cliente.
--
-- SECURITY INVOKER (o valor por omissao) DE PROPOSITO, e nao SECURITY
-- DEFINER: as queries que esta funcao substitui eram feitas pelo cliente com
-- a chave anonima, logo sujeitas ao RLS de anew_hierarchy
-- (authenticated_select_anew_hierarchy). Com SECURITY DEFINER a travessia
-- passaria a ignorar esse RLS e poderia devolver organizacoes que o
-- utilizador nao ve hoje -- e esse resultado alimenta depois filtros
-- .in('organization_id', ...) por toda a app, pelo que seria um alargamento
-- de acesso multi-tenant. Mantendo invoker rights, o conjunto devolvido e
-- identico ao que o BFS do cliente obtinha.
--
-- STABLE: apenas le. Sem efeitos laterais.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_subtree_ids(_root_org_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE subtree AS (
    SELECT _root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON s.org_id = h.parent_org_id
  )
  SELECT org_id FROM subtree WHERE org_id IS NOT NULL
$function$;

COMMENT ON FUNCTION public.get_org_subtree_ids(uuid) IS
  'Root org + todos os descendentes em anew_hierarchy, numa unica query. '
  'Substitui o BFS por niveis que src/lib/orgSubtree.ts fazia no cliente. '
  'SECURITY INVOKER de proposito: o RLS de anew_hierarchy tem de continuar a '
  'aplicar-se, para o resultado ser identico ao das queries que substitui.';

GRANT EXECUTE ON FUNCTION public.get_org_subtree_ids(uuid) TO authenticated;
