-- ============================================================================
-- Performance de RLS: envolver auth.uid() em (SELECT auth.uid()) nas policies
-- de entity_interactions e na policy de DELETE de proposals.
--
-- Mesma classe de otimizacao (e mesmo racional) de:
--   - 20260626110000_rls_performance_and_proposals_check.sql
--   - 20260927010000_strict_crm_org_isolation.sql
--   - 20261112440000_proposals_rls_perf_and_listing_indexes.sql
-- Sem `(SELECT ...)`, o Postgres pode tratar auth.uid() como volatil e
-- reavalia-la uma vez por linha em vez de uma vez por query.
--
-- NENHUMA condicao de autorizacao e alterada. A unica diferenca em cada
-- expressao e a forma como auth.uid() e invocada. Em particular, NAO se troca
-- nenhuma funcao de resolucao de orgs:
--   - entity_interactions continua a usar get_user_visible_org_ids (que
--     inclui ascendentes/descendentes/associacoes). NAO se migra para
--     get_user_crm_org_ids: essa troca foi feita deliberadamente apenas para
--     as 7 tabelas do contrato CRM em 20260927010000 e para proposal_items em
--     20260928010000. entity_interactions nao faz parte desse contrato, e
--     estreitar o acesso aqui seria uma alteracao de comportamento, nao uma
--     otimizacao.
--   - proposals (DELETE) continua a usar get_user_crm_org_ids.
--
-- Estado confirmado por query directa a pg_policies no remoto antes de
-- escrever este ficheiro (regra do projeto: nao assumir a partir de leitura
-- de codigo). As 5 policies abaixo eram, nesse momento, as unicas destas duas
-- tabelas com auth.uid() nao envolvido:
--   entity_interactions: SELECT, INSERT, UPDATE, DELETE (as 4 policies base)
--   proposals:           DELETE
-- Ja estavam correctas e NAO sao tocadas aqui:
--   entity_interactions.system_admin_pii_default_deny (RESTRICTIVE)
--   proposals: SELECT / UPDATE / system_admin_pii_default_deny
--   proposal_items: as 4 base + system_admin_pii_default_deny
--
-- Usa-se ALTER POLICY em vez de DROP + CREATE de proposito: preserva
-- comando, roles e caracter PERMISSIVE/RESTRICTIVE de cada policy, e nao
-- abre nenhuma janela em que a policy nao existe. ALTER POLICY nao tem
-- IF EXISTS -- se algum nome de policy tiver mudado no remoto, esta migration
-- falha em voz alta em vez de criar silenciosamente uma policy diferente da
-- que existia. E o comportamento desejado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. entity_interactions -- 4 policies base
--    Original (SELECT):
--      organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
--    Original (UPDATE/DELETE):
--      created_by = (auth.uid())::text
--      OR organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
--    A comparacao created_by (text) com auth.uid()::text mantem-se tal e qual,
--    incluindo o cast.
-- ----------------------------------------------------------------------------

ALTER POLICY "Users can view interactions in their org tree"
  ON public.entity_interactions
  USING (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );

ALTER POLICY "Users can insert interactions in their org tree"
  ON public.entity_interactions
  WITH CHECK (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );

ALTER POLICY "Users can update their own interactions"
  ON public.entity_interactions
  USING (
    created_by = ((SELECT auth.uid()))::text
    OR organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );

ALTER POLICY "Users can delete their own interactions"
  ON public.entity_interactions
  USING (
    created_by = ((SELECT auth.uid()))::text
    OR organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );

-- ----------------------------------------------------------------------------
-- 2. proposals -- policy de DELETE
--    Original:
--      has_anew_permission(auth.uid(), 'proposals.delete')
--      AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
--    O wrap dentro de has_anew_permission(...) segue o padrao ja activo na
--    policy de SELECT desta mesma tabela (20261112440000).
-- ----------------------------------------------------------------------------

ALTER POLICY "Users with permission can delete proposals"
  ON public.proposals
  USING (
    has_anew_permission((SELECT auth.uid()), 'proposals.delete'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );
