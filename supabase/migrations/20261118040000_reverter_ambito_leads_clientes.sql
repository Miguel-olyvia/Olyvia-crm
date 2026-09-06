-- ============================================================================
-- REVERSAO de 20261118030000_leads_clientes_ambito_na_propria_tabela.sql.
--
-- POR APLICAR, e a aplicar SO se o gatilho abaixo disparar. Esta escrita de
-- antemao, e deixada ao lado da outra, para que reverter seja um comando e
-- nao um exercicio de arqueologia as tres da manha.
--
-- Repoe as seis politicas no texto EXACTO de
-- 20260927010000_strict_crm_org_isolation.sql e
-- 20260928010000_fix_missed_crm_org_ids_swap.sql. Como a migracao original
-- nunca toca no WITH CHECK do UPDATE nem na politica de INSERT, esses tambem
-- nao aparecem aqui -- reverte-se so o que se mexeu.
--
-- QUANDO USAR (decidido de antemao, para nao se discutir no momento):
--   - se o count exact em anew_leads na Mudelar, medido logo a seguir ao push
--     com o mesmo metodo da baseline (mediana de 5 execucoes, performance.now()
--     a volta do await; baseline 833 ms), passar de ~1,5 s; ou
--   - se qualquer conta com ambito ORG deixar de ver alguma linha que via
--     antes -- isso seria bug, nao aperto, e nao se depura em producao.
--
-- ANTES DE CHEGAR AQUI, tentar as duas mitigacoes mais brandas descritas no
-- cabecalho de 20261118030000: reverter so anew_leads (deixando os clientes
-- corrigidos), ou reescrever crm_scope_keys sem o laco por organizacao.
--
-- PROPRIEDADES:
--   - Puramente aditiva e nao destrutiva: nenhuma linha e alterada, nenhum
--     objecto e largado. So muda quem pode ler e escrever.
--   - Idempotente e segura de aplicar duas vezes.
--   - Reabre a falha de ambito, obviamente. E o preco de repor o desempenho, e
--     e o estado em que a base ja estava antes de 20261118030000 -- reverter
--     devolve o statu quo, nao cria um defeito novo.
--
-- A FUNCAO crm_scope_keys NAO SE APAGA. Fica orfa e inofensiva (STABLE, nao
-- escreve nada, e depois destes ALTER POLICY ninguem a chama), e mante-la
-- evita ter de a recriar para voltar a tentar. Largar uma funcao que uma
-- politica possa ainda referenciar noutro caminho e que seria arriscado.
-- ============================================================================

ALTER POLICY anew_leads_select ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.view'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY anew_leads_update ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.edit'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY anew_leads_delete ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.delete'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY anew_clients_select ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.view'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY anew_clients_update ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.edit'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY anew_clients_delete ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.delete'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

COMMENT ON POLICY anew_leads_select ON public.anew_leads IS
  'Organizacao + permissao leads.view. SEM ambito: a leitura directa da tabela devolve as leads de todos os colegas da organizacao. Estado revertido -- ver 20261118040000_reverter_ambito_leads_clientes.sql.';

COMMENT ON POLICY anew_clients_select ON public.anew_clients IS
  'Organizacao + permissao clients.view. SEM ambito: a leitura directa da tabela devolve os clientes de todos os colegas da organizacao. Estado revertido -- ver 20261118040000_reverter_ambito_leads_clientes.sql.';
