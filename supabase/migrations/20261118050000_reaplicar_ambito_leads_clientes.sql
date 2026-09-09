-- Reaplica o ambito das leads e dos clientes na propria tabela.
--
-- A 20261118030000 poe o ambito ORG/TEAM/OWNED nas politicas de leitura,
-- edicao e remocao de anew_leads e anew_clients. A 20261118040000 e a
-- REVERSAO dessa alteracao, escrita para ficar de reserva -- nao para ser
-- aplicada.
--
-- As duas foram empurradas na mesma execucao de "supabase db push", que aplica
-- por ordem tudo o que estiver pendente. A reversao correu logo a seguir a
-- correccao e desfe-la. Medido a seguir: uma conta com ambito PROPRIO, dona de
-- 9 leads, voltava a ler as 382 leads da nike pela API directa.
--
-- Como as migracoes sao so para a frente, nao se apaga nada: reaplica-se aqui,
-- sozinha. A funcao public.crm_scope_keys nao foi removida pela reversao, por
-- isso so e preciso repor as seis politicas.
--
-- O ambito e resolvido UMA VEZ POR CONSULTA -- o (SELECT ...) a envolver a
-- chamada faz o Postgres trata-la como constante da consulta. Por linha sobra
-- so a comparacao de texto contra um array pequeno. E o que evita os ~4
-- segundos que uma politica ingenua custaria nas 5983 leads da Mudelar.
--
-- Para reverter: repetir os ALTER POLICY de 20261118040000 numa migracao nova.


-- -- 2. anew_leads ------------------------------------------------------------
ALTER POLICY anew_leads_select ON public.anew_leads
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'leads.view'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('leads.view'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_leads.organization_id::text || ':*'
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.assigned_to::text
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.created_by::text
    )
  );

ALTER POLICY anew_leads_update ON public.anew_leads
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'leads.edit'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('leads.edit'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_leads.organization_id::text || ':*'
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.assigned_to::text
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.created_by::text
    )
  );
-- WITH CHECK de anew_leads_update deliberadamente NAO alterado (ver cabecalho).

ALTER POLICY anew_leads_delete ON public.anew_leads
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'leads.delete'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('leads.delete'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_leads.organization_id::text || ':*'
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.assigned_to::text
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.created_by::text
    )
  );

COMMENT ON POLICY anew_leads_select ON public.anew_leads IS
  'Organizacao + permissao leads.view + AMBITO ORG/TEAM/OWNED, resolvido uma vez por consulta via crm_scope_keys. Antes desta politica a leitura directa da tabela devolvia as leads de todos os colegas da organizacao (382 contra as 9 proprias, medido na nike a 2026-09-06).';


-- -- 3. anew_clients ----------------------------------------------------------
ALTER POLICY anew_clients_select ON public.anew_clients
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'clients.view'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('clients.view'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_clients.organization_id::text || ':*'
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.assigned_to::text
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.created_by::text
    )
  );

ALTER POLICY anew_clients_update ON public.anew_clients
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'clients.edit'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('clients.edit'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_clients.organization_id::text || ':*'
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.assigned_to::text
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.created_by::text
    )
  );
-- WITH CHECK de anew_clients_update (20260928010000) deliberadamente NAO alterado.

ALTER POLICY anew_clients_delete ON public.anew_clients
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'clients.delete'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('clients.delete'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_clients.organization_id::text || ':*'
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.assigned_to::text
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.created_by::text
    )
  );

