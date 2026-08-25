-- ============================================================================
-- Reaplica o atalho de 20261112500000, agora com prova. Substitui
-- 20261112510000, que o reverteu por causa de um falso alarme.
--
-- O QUE ACONTECEU, porque a historia importa mais do que o resultado:
--
-- 20261112500000 acrescentou as policies de SELECT de anew_entity_emails e
-- anew_entity_phones um atalho indexado por anew_leads. A verificacao usada
-- foi contar linhas visiveis antes e depois -- o mesmo metodo que validou
-- 20261112460000 e 20261112470000. A contagem subiu 10 linhas em cada tabela,
-- para dois utilizadores independentes, e a migration foi revertida de
-- imediato por 20261112510000: 10 linhas de emails e telefones a mais e
-- alargamento de acesso a dados pessoais, causa desconhecida ou nao.
--
-- Depois da reversao as contagens NAO voltaram ao valor original. A policy
-- estava de novo exatamente como antes e o total continuava +10. Logo o
-- aumento nunca foi da policy: foram DADOS NOVOS, criados em producao nos ~40
-- minutos entre a captura da baseline e o teste. A base de dados esta viva e
-- comparar contagens ao longo do tempo nao e um teste valido de alteracoes de
-- RLS -- foi sorte que as duas migrations anteriores tenham passado, e o
-- metodo estava errado nas tres.
--
-- O TESTE CORRETO, agora feito: avaliar as duas expressoes -- a antiga e a
-- nova -- sobre as MESMAS linhas no MESMO instante, numa unica query, com o
-- auth uid passado explicitamente. Corrido como postgres, o EXISTS sobre
-- anew_leads nao e filtrado pelo RLS dessa tabela, o que torna o atalho mais
-- largo do que sera em producao: e portanto um teste conservador.
--
--   emails: antes=5695 depois=5695 ACRESCENTADAS=0 removidas=0
--   phones: antes=5605 depois=5605 ACRESCENTADAS=0 removidas=0
--
-- Zero linhas acrescentadas e zero removidas: as duas expressoes descrevem
-- exatamente o mesmo conjunto. O atalho e equivalente, como o raciocinio
-- original dizia -- o ramo anew_leads que se antecipa e o mesmo que
-- is_entity_in_user_scope ja verifica, com o mesmo predicado.
--
-- MOTIVO DA ALTERACAO (inalterado desde 20261112500000): a funcao recebe o id
-- DA LINHA, pelo que corre por linha, e mede-se
--   anew_entity_emails -> 509 ms, 440 loops x 1,02 ms
-- O atalho passa o argumento como constante ((SELECT auth.uid())), o que
-- permite ao planeador avaliar get_user_visible_org_ids uma vez como InitPlan
-- e resolver o EXISTS por idx_anew_leads_entity_id. Cobre 407 das 438
-- entidades (93%); as restantes caem na funcao, como hoje.
--
-- NAO se usa anew_entity_org_links aqui: is_entity_in_user_scope nao verifica
-- essa tabela, e usa-la tornaria visiveis contactos de entidades sem lead,
-- contacto ou cliente correspondente.
-- ============================================================================

ALTER POLICY authenticated_select_anew_entity_emails
  ON public.anew_entity_emails
  USING (
    EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = anew_entity_emails.entity_id
        AND l.organization_id IN (
          SELECT get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
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
