-- ============================================================================
-- Performance de RLS em anew_entity_emails e anew_entity_phones: atalho
-- indexado que retira get_user_visible_org_ids() do ciclo por linha.
--
-- PROBLEMA MEDIDO (EXPLAIN ANALYZE, utilizador real, RLS aplicada, sobre as
-- 440 entidades referidas pelas propostas da maior organizacao):
--   anew_entity_emails -> Execution Time: 509 ms
--   Index Scan using idx_anew_entity_emails_entity_id
--     (actual time=1.020..1.027 rows=1 loops=440)
--     Filter: ... is_entity_in_user_scope(entity_id, ...)
--   -> 440 loops x 1,02 ms. anew_entity_phones usa a MESMA policy e o mesmo
--      indice, com volumes equivalentes.
--
-- is_entity_in_user_scope(_entity_id, _auth_uid) recebe o id DA LINHA, pelo
-- que o planeador nao a pode avaliar uma unica vez: corre por linha. E dentro
-- dela ha uma travessia de organizacoes (get_user_visible_org_ids) por cada
-- chamada -- 20261112470000 ja a reduziu de quatro para uma, mas continua a
-- ser uma por linha.
--
-- ATALHO. Acrescenta-se antes da chamada a funcao o teste do ramo anew_leads,
-- que is_entity_in_user_scope JA FAZ, com o mesmo predicado:
--   l.organization_id IN (SELECT get_user_visible_org_ids(<auth uid>))
-- A diferenca esta no argumento: aqui e uma constante ((SELECT auth.uid())),
-- pelo que o planeador o avalia uma vez como InitPlan e o EXISTS resolve-se
-- pelo indice idx_anew_leads_entity_id.
--
-- PORQUE NAO ALARGA ACESSO. O ramo acrescentado e um SUBCONJUNTO estrito do
-- que a policy ja permitia: qualquer linha que o atalho aceite,
-- is_entity_in_user_scope tambem aceitaria pelo seu proprio ramo anew_leads.
-- A chamada a funcao mantem-se intacta a seguir, no mesmo OR, pelo que nada
-- deixa de ser visivel. Note-se ainda que o atalho e, se algo, MAIS ESTREITO
-- do que o ramo interno: aqui o EXISTS sobre anew_leads corre com invoker
-- rights e portanto sujeito ao RLS de anew_leads, enquanto dentro da funcao
-- (SECURITY DEFINER) esse RLS e contornado. Ser mais estreito e seguro --
-- quando o atalho nao acerta, o OR cai na funcao, que decide como antes.
-- Verificado por contagem de linhas visiveis antes/depois, para dois
-- utilizadores reais.
--
-- COBERTURA. Das 438 entidades referidas pelas propostas da maior
-- organizacao, 407 (93%) tem lead. As restantes caem na funcao, como hoje.
--
-- ESCOLHA DO RAMO. NAO se usou anew_entity_org_links, o atalho de
-- 20261112460000 para anew_entities: is_entity_in_user_scope NAO verifica essa
-- tabela (os seus ramos sao created_by, anew_contacts, anew_leads,
-- anew_clients, anew_organizations). Usa-la aqui tornaria visiveis emails e
-- telefones de entidades ligadas a uma organizacao sem contacto, lead ou
-- cliente correspondente -- alargamento de acesso a dados pessoais, nao
-- otimizacao. anew_leads e o ramo com maior cobertura entre os que a funcao
-- efetivamente verifica.
--
-- Nao se toca nas policies RESTRICTIVE system_admin_pii_default_deny nem nas
-- anon_*_read destas tabelas, nem na propria funcao.
-- ============================================================================

ALTER POLICY authenticated_select_anew_entity_emails
  ON public.anew_entity_emails
  USING (
    -- Atalho: entidade com lead numa organizacao visivel, pelo indice
    -- idx_anew_leads_entity_id. Subconjunto do ramo homonimo de
    -- is_entity_in_user_scope; existe apenas para evitar a chamada por linha.
    EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = anew_entity_emails.entity_id
        AND l.organization_id IN (
          SELECT get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
    -- Ramo original, inalterado.
    OR is_entity_in_user_scope(entity_id, (SELECT auth.uid()))
  );

ALTER POLICY authenticated_select_anew_entity_phones
  ON public.anew_entity_phones
  USING (
    EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = anew_entity_phones.entity_id
        AND l.organization_id IN (
          SELECT get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
    OR is_entity_in_user_scope(entity_id, (SELECT auth.uid()))
  );
