-- ============================================================================
-- Ver propostas e contratos exige pertencer à empresa, mesmo tendo-os criado
-- ============================================================================
--
-- As políticas de leitura de propostas e de contratos tinham um ramo "vejo o
-- que criei" (e, nos contratos, também "o que me está atribuído") SEM filtro de
-- organização. Bastava ter a permissão de ver — que é global, porque
-- has_anew_permission não recebe organização — para continuar a ler documentos
-- que se criou numa empresa de onde já se saiu, ou onde se passou a ser apenas
-- cliente do portal.
--
-- Confirmado ao vivo: um login que é apenas CLIENTE da nike continuava a ler 80
-- propostas e 93 contratos dessa empresa, apesar de a nike já não estar no seu
-- âmbito de CRM. A escrita já estava fechada (o WITH CHECK exige a empresa), por
-- isso o que aqui se fecha é a LEITURA.
--
-- Correção: a leitura passa a exigir que a empresa do documento esteja no âmbito
-- de CRM de quem lê. Os ramos por autoria/atribuição deixam de dar acesso fora
-- da empresa — dentro dela continuam cobertos pelo próprio filtro de empresa.
-- Mantém-se o caso das propostas sem empresa, que se resolvem pela empresa do
-- respetivo negócio.
--
-- Impacto medido antes de aplicar (produção): 87 propostas de 3 pessoas e 96
-- contratos de 2 pessoas — e, em todos os casos, quem perde acesso já NÃO é
-- equipa dessa empresa (é cliente, ou não tem ligação nenhuma).

ALTER POLICY "Users can view proposals in their scope" ON public.proposals
USING (
  has_anew_permission((SELECT auth.uid()), 'proposals.view'::text)
  AND (
    organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    OR (
      organization_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.deals d
        WHERE d.id = proposals.deal_id
          AND d.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
      )
    )
  )
);

ALTER POLICY client_contracts_select ON public.client_contracts
USING (
  has_anew_permission(auth.uid(), 'client_contracts.view'::text)
  AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
);
