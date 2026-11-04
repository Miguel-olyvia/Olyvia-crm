-- ============================================================
-- 20270106000000_anew_entities_so_pessoas   *** RASCUNHO - NÃO APLICADO - À ESPERA DE APROVAÇÃO ***
-- ============================================================
-- Está em supabase/pendentes/ (fora de supabase/migrations/) de propósito: um db push não o leva.
-- Para aplicar depois de aprovado: rever as DECISÕES abaixo, mover para supabase/migrations/ e aplicar como as outras do Lote A.
--
-- O que faz (Lote A, item 2): em anew_entities as políticas permissivas authenticated_select/insert/update/delete_anew_entities não
--   pedem permissão nenhuma e somam-se (OR) às org_member_*: qualquer membro ativo lê/cria/edita/apaga pessoas. Passam a valer só
--   pessoas.view / pessoas.create / pessoas.edit / pessoas.delete NA organização da entidade (has_anew_permission_in_org), sem os
--   códigos antigos (leads.*, clients.*, contacts.*).
--
-- PARTE A - dados: os papéis que hoje têm o código antigo recebem o novo (ninguém perde acesso).
--   Base RH (4/11/2026): só papéis de teste sem membros (testescope_*) ganham códigos; super_admin/system_admin já os têm.
--
-- PARTE B - políticas.
--
-- DECISÕES EM ABERTO (o que partiria se se aplicasse só a parte "pessoas.*"), por isso a parte B traz já a política C1:
--   C1 (incluída): a própria entidade do utilizador, as entidades dos colegas (membros ativos da mesma organização) e a entidade da
--      organização - hoje vistas por authenticated_select via can_see_entity. Sem isto: o nome no cabeçalho (TopHeader.tsx),
--      useEntityIdentity, os colegas no RH/agenda/Utilizadores e o cabeçalho dos PDFs (utils/orgEntity.ts) desapareciam para quem
--      não tem pessoas.view (ex.: papéis teste_rh_*, 8 membros).
--   C2 (NÃO incluída, decidir): nomes de clientes/fornecedores em listas que não são do CRM, lidos por embed (anew_entities!...):
--      Encomendas de Cliente (clientOrderFilters, useDeletedClientOrders), Encomendas a Fornecedor (PurchaseOrders.tsx, usePoOrigins),
--      Vendas Diretas, Orçamentos/Propostas/Contratos (quem tem quotes.view/proposals.view mas não pessoas.view). Opções:
--      (a) dar pessoas.view a esses papéis; (b) política extra "entidade ligada a um documento que a pessoa pode ver";
--      (c) RPCs de leitura com o nome.
--   C3: âmbito (own/team/org) na leitura - aqui a leitura é ao nível da organização (como org_member_select hoje); a escrita usa
--      is_entity_in_user_scope (como authenticated_update/delete hoje).
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

-- PARTE B - políticas
DROP POLICY IF EXISTS authenticated_select_anew_entities ON public.anew_entities;
DROP POLICY IF EXISTS authenticated_insert_anew_entities ON public.anew_entities;
DROP POLICY IF EXISTS authenticated_update_anew_entities ON public.anew_entities;
DROP POLICY IF EXISTS authenticated_delete_anew_entities ON public.anew_entities;

DROP POLICY IF EXISTS anew_entities_org_member_select ON public.anew_entities;
CREATE POLICY anew_entities_org_member_select ON public.anew_entities
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id));

DROP POLICY IF EXISTS anew_entities_org_member_insert ON public.anew_entities;
CREATE POLICY anew_entities_org_member_insert ON public.anew_entities
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.create', organization_id));

CREATE POLICY anew_entities_org_member_update ON public.anew_entities
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.edit', organization_id)
         AND public.is_entity_in_user_scope(id, auth.uid()))
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.edit', organization_id));

CREATE POLICY anew_entities_org_member_delete ON public.anew_entities
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.delete', organization_id)
         AND public.is_entity_in_user_scope(id, auth.uid()));

-- C1: a própria, os colegas e a organização (só leitura)
CREATE POLICY anew_entities_equipa_select ON public.anew_entities
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    id IN (SELECT au.entity_id FROM public.anew_users au WHERE au.auth_user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.anew_users au
               JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
               WHERE au.entity_id = anew_entities.id
                 AND am.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
    OR EXISTS (SELECT 1 FROM public.anew_organizations o
               WHERE o.entity_id = anew_entities.id
                 AND o.id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))));
