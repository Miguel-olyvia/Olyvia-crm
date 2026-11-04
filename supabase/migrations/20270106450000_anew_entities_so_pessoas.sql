-- ============================================================
-- 20270106450000_anew_entities_so_pessoas
-- ============================================================
-- O que faz (Lote A, item 2; era o rascunho supabase/pendentes/20270106000000, revisto contra a base viva a 4/11/2026):
--   As fichas de pessoas (anew_entities) passam a ser decididas por pessoas.view / pessoas.create / pessoas.edit / pessoas.delete.
--   Antes as políticas authenticated_select/insert/update/delete_anew_entities não pediam permissão nenhuma e somavam-se (OR) às
--   org_member_*: qualquer membro ativo lia/criava/editava/apagava pessoas.
--
-- Regra seguida: só se decide QUEM. Para quem tem a permissão, o conjunto de linhas é o mesmo de hoje:
--   * leitura com pessoas.view  = (o que authenticated_select OU org_member_select davam) E pessoas.view na organização da ficha
--     (ou numa acima dela; o administrador de sistema passa; ficha sem organização: pessoas.view numa associação qualquer);
--   * escrita com pessoas.edit / pessoas.delete = o mesmo âmbito de hoje (is_entity_in_user_scope) E a permissão;
--   * criação com pessoas.create na organização da ficha. A ficha da própria organização (type='organization', sem organization_id,
--     criada em Organizações / organizações filhas) continua como hoje (membro ativo).
--   Quem NÃO tem pessoas.view continua a ler, e só dentro do que hoje já lia (nunca mais):
--     - a própria ficha, as dos colegas (membros ativos não-cliente das organizações visíveis) e a da organização (cabeçalho, RH,
--       agenda, Utilizadores, PDFs);
--     - a ficha ligada a um documento que a própria pessoa consegue ler (a RLS desse documento decide): encomendas de cliente /
--       contratos (client_contracts - também o nome do cliente nas encomendas a fornecedor), vendas diretas, orçamentos, propostas,
--       deals, negócios, levantamentos, agenda, submissões de formulários, leads/clientes/contactos antigos.
--
-- PARTE A - dados: os papéis com os códigos antigos (leads/clients/contacts .view/.create/.edit/.delete) recebem o pessoas.*
--   equivalente, para ninguém perder acesso. Base RH (4/11/2026): só os 6 papéis TESTE-SCOPE (0 membros); Super Admin / System Admin
--   já os têm.
-- Sem tabelas nem colunas novas. Políticas reescritas a partir de pg_policies (vivas, 4/11/2026).
-- ============================================================

SET lock_timeout = '5s';

-- PARTE A - dados
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, 'pessoas.' || split_part(rp.permission_code, '.', 2)
FROM public.anew_role_permissions rp
JOIN public.anew_roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
WHERE rp.permission_code IN ('leads.view', 'clients.view', 'contacts.view',
                             'leads.create', 'clients.create', 'contacts.create',
                             'leads.edit', 'clients.edit', 'contacts.edit',
                             'leads.delete', 'clients.delete', 'contacts.delete')
  AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions x
                  WHERE x.role_id = rp.role_id AND x.permission_code = 'pessoas.' || split_part(rp.permission_code, '.', 2));

-- Auxiliares (só dizem as permissões do próprio utilizador; calculadas uma vez por consulta)
CREATE OR REPLACE FUNCTION public.fn_pessoas_orgs_com_permissao(p_codigo text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270106450000: as organizações visíveis em que a pessoa tem p_codigo (pessoas.*) na própria organização ou numa acima.
  SELECT o.org_id
  FROM public.get_user_visible_org_ids(auth.uid()) AS o(org_id)
  WHERE auth.uid() IS NOT NULL
    AND p_codigo LIKE 'pessoas.%'
    AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), p_codigo, o.org_id)
$function$;

CREATE OR REPLACE FUNCTION public.fn_pessoas_tem_permissao(p_codigo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270106450000: tem p_codigo (pessoas.*) numa associação ativa não-cliente, ou é administrador de sistema.
  SELECT auth.uid() IS NOT NULL AND p_codigo LIKE 'pessoas.%' AND (
    public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active' AND am.role_is_client IS NOT TRUE
      JOIN public.anew_role_permissions arp ON arp.role_id = am.role_id AND arp.permission_code = p_codigo
      WHERE au.auth_user_id = auth.uid()))
$function$;

CREATE OR REPLACE FUNCTION public.fn_pessoas_entidades_equipa()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270106450000: a própria ficha, as dos colegas (membros ativos não-cliente das organizações visíveis) e as das organizações visíveis.
  SELECT au.entity_id FROM public.anew_users au
  WHERE au.auth_user_id = auth.uid() AND au.entity_id IS NOT NULL
  UNION
  SELECT au.entity_id
  FROM public.anew_users au
  JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active' AND am.role_is_client IS NOT TRUE
  WHERE au.entity_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND am.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  UNION
  SELECT o.entity_id FROM public.anew_organizations o
  WHERE o.entity_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND o.id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
$function$;

REVOKE ALL ON FUNCTION public.fn_pessoas_orgs_com_permissao(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pessoas_tem_permissao(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pessoas_entidades_equipa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pessoas_orgs_com_permissao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_pessoas_tem_permissao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_pessoas_entidades_equipa() TO authenticated, service_role;

-- PARTE B - políticas
DROP POLICY IF EXISTS authenticated_select_anew_entities ON public.anew_entities;
DROP POLICY IF EXISTS authenticated_insert_anew_entities ON public.anew_entities;
DROP POLICY IF EXISTS authenticated_update_anew_entities ON public.anew_entities;
DROP POLICY IF EXISTS authenticated_delete_anew_entities ON public.anew_entities;

-- Leitura com pessoas.view: o que hoje se lia (authenticated_select OU organização visível), com a permissão.
DROP POLICY IF EXISTS anew_entities_org_member_select ON public.anew_entities;
CREATE POLICY anew_entities_org_member_select ON public.anew_entities
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (organization_id IN (SELECT public.fn_pessoas_orgs_com_permissao('pessoas.view'))
     OR ((organization_id IS NULL OR (SELECT public.is_system_admin((SELECT auth.uid()))))
         AND (SELECT public.fn_pessoas_tem_permissao('pessoas.view'))))
    AND (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         OR EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                    WHERE l.entity_id = anew_entities.id
                      AND l.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         OR created_by = public.current_business_user_id()
         OR public.can_see_entity(id, (SELECT auth.uid()))));

-- Leitura sem pessoas.view: a própria, colegas, organização, ou ligada a um documento que a pessoa lê - e só dentro do que
-- authenticated_select já dava (nunca alarga).
CREATE POLICY anew_entities_ligada_select ON public.anew_entities
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (id IN (SELECT public.fn_pessoas_entidades_equipa())
     OR EXISTS (SELECT 1 FROM public.client_contracts x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.direct_sales x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.quotes x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.proposals x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.deals x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.negocios x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.levantamentos x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.schedule_items x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.form_submissions x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.form_submissions x WHERE x.conflicting_entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.anew_leads x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.anew_clients x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.anew_contacts x WHERE x.entity_id = anew_entities.id))
    AND (EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                 WHERE l.entity_id = anew_entities.id
                   AND l.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         OR created_by = public.current_business_user_id()
         OR public.can_see_entity(id, (SELECT auth.uid()))));

-- Criação com pessoas.create na organização da ficha (ficha sem organização: pessoas.create numa associação, como hoje se criava).
DROP POLICY IF EXISTS anew_entities_org_member_insert ON public.anew_entities;
CREATE POLICY anew_entities_org_member_insert ON public.anew_entities
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
               AND organization_id IN (SELECT public.fn_pessoas_orgs_com_permissao('pessoas.create')))
              OR (organization_id IS NULL AND (SELECT public.fn_pessoas_tem_permissao('pessoas.create'))));

-- A ficha da própria organização (sem organization_id) continua como hoje: membro ativo (utils/orgEntity.ts).
CREATE POLICY anew_entities_ficha_organizacao_insert ON public.anew_entities
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND type = 'organization'
              AND (SELECT auth.uid()) IS NOT NULL
              AND public.user_has_active_membership((SELECT auth.uid())));

-- Edição / apagar: o âmbito de hoje (is_entity_in_user_scope), com a permissão. Sem WITH CHECK, como antes.
CREATE POLICY anew_entities_org_member_update ON public.anew_entities
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.is_entity_in_user_scope(id, auth.uid())
         AND (organization_id IN (SELECT public.fn_pessoas_orgs_com_permissao('pessoas.edit'))
              OR ((organization_id IS NULL OR (SELECT public.is_system_admin((SELECT auth.uid()))))
                  AND (SELECT public.fn_pessoas_tem_permissao('pessoas.edit')))));

CREATE POLICY anew_entities_org_member_delete ON public.anew_entities
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.is_entity_in_user_scope(id, auth.uid())
         AND (organization_id IN (SELECT public.fn_pessoas_orgs_com_permissao('pessoas.delete'))
              OR ((organization_id IS NULL OR (SELECT public.is_system_admin((SELECT auth.uid()))))
                  AND (SELECT public.fn_pessoas_tem_permissao('pessoas.delete')))));

NOTIFY pgrst, 'reload schema';
