-- ============================================================================
-- Performance de RLS em anew_entities: atalho indexado que retira
-- get_user_visible_org_ids() do ciclo por linha.
--
-- PROBLEMA MEDIDO (EXPLAIN ANALYZE, utilizador real, RLS aplicada):
--   Index Scan using anew_entities_pkey on anew_entities
--     (actual time=1.423..1.423 rows=1 loops=438)
--     Filter: ... can_see_entity(id, ...)
--   Buffers: shared hit=121832
--   -> 438 loops x 1,42 ms = 624 ms, ~950 MB de buffers, para 438 linhas.
--
-- can_see_entity(p_entity_id, p_auth_uid) recebe o id DA LINHA como
-- argumento, pelo que o planeador nao a pode avaliar uma unica vez: corre
-- por linha, por definicao. Envolver auth.uid() em (SELECT auth.uid()) --
-- a otimizacao de 20261112440000/20261112450000 -- nao resolve isto.
--
-- Dentro da funcao, cada chamada volta a executar
-- get_user_visible_org_ids(p_auth_uid) (travessia de organizacoes) antes de
-- chegar ao teste que interessa.
--
-- MEDICAO QUE JUSTIFICA O ATALHO: para as 438 entidades referidas pelas
-- propostas da maior organizacao, contei qual o ramo da cadeia que as
-- resolve:
--   anew_entity_org_links   438/438  (100%)
--   quotes                  436
--   anew_leads              407
--   anew_contacts           386
--   anew_clients             84
--   client_contracts         63
--   deals                    44
-- O ramo que sempre acerta esta em SEXTO lugar na cadeia, depois de duas
-- resolucoes de identidade e dois EXISTS de criador que nunca acertam. E
-- anew_entity_org_links tem indice exato para este teste:
--   anew_entity_org_links_pkey (entity_id, organization_id)
--
-- PORQUE NAO ALARGA ACESSO: o ramo acrescentado abaixo e exatamente o teste
-- de anew_entity_org_links que can_see_entity ja faz, com o mesmo conjunto
-- de organizacoes (get_user_visible_org_ids do mesmo auth uid). E portanto um
-- SUBCONJUNTO estrito do que a policy ja permitia: qualquer linha que o
-- atalho aceita, can_see_entity tambem aceitaria. Os dois ramos originais
-- ficam intactos a seguir, pelo que nada deixa de ser visivel. O conjunto
-- resultante e identico -- confirmado por contagem antes/depois.
--
-- A diferenca de custo esta no argumento: get_user_visible_org_ids recebe
-- aqui uma constante ((SELECT auth.uid())), pelo que o planeador a avalia uma
-- vez como InitPlan, e o EXISTS resolve-se pelo indice.
--
-- Os ramos originais mantem-se palavra por palavra, com a unica diferenca de
-- auth.uid() passar a (SELECT auth.uid()) -- estava sem wrap nesta policy.
-- NAO se troca can_see_entity por outra funcao, nem se toca na policy
-- RESTRICTIVE system_admin_pii_default_deny, nem em anon_entities_read.
--
-- NAO INCLUIDO DE PROPOSITO: anew_entity_emails e anew_entity_phones usam
-- is_entity_in_user_scope(), que NAO verifica anew_entity_org_links (os seus
-- ramos sao created_by, anew_contacts, anew_leads, anew_clients,
-- anew_organizations). Aplicar-lhes o mesmo atalho TORNARIA VISIVEIS emails e
-- telefones de entidades ligadas a uma organizacao sem contacto/lead/cliente
-- correspondente -- um alargamento de acesso a dados pessoais, nao uma
-- otimizacao. Essas duas tabelas precisam de tratamento proprio.
-- ============================================================================

ALTER POLICY authenticated_select_anew_entities
  ON public.anew_entities
  USING (
    -- Atalho: ligacao direta entidade -> organizacao visivel, pelo indice
    -- anew_entity_org_links_pkey. Subconjunto do ramo homonimo de
    -- can_see_entity; existe apenas para evitar a chamada por linha.
    EXISTS (
      SELECT 1
      FROM public.anew_entity_org_links l
      WHERE l.entity_id = anew_entities.id
        AND l.organization_id IN (
          SELECT get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
    -- Ramos originais, inalterados.
    OR created_by = current_business_user_id()
    OR can_see_entity(id, (SELECT auth.uid()))
  );
