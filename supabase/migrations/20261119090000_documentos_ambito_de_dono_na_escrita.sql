-- ============================================================================
-- deals / proposals / quotes / client_contracts: o AMBITO de dono passa a valer
-- tambem no UPDATE e no DELETE directos da tabela (via REST/PostgREST).
--
-- -- A LACUNA (achado a4 do raio-X) -------------------------------------------
--
-- As politicas de UPDATE/DELETE destas quatro tabelas isolavam so por
-- ORGANIZACAO (organization_id IN get_user_crm_org_ids) mais a permissao
-- respetiva -- nunca o ambito OWNED/TEAM/ORG. Um comercial com ambito OWNED e a
-- permissao .edit/.delete podia alterar e apagar QUALQUER registo da
-- organizacao, incluindo os que a sua propria leitura ja lhe esconde. E a mesma
-- classe que anew_leads/anew_clients tinham antes de 18/11.
--
-- (deals ia mais longe: o UPDATE/DELETE nem sequer verificava a permissao --
-- so a organizacao. Esta migracao fecha as duas coisas de uma vez para deals:
-- passa a exigir deals.edit / deals.delete E o ambito.)
--
-- -- O PADRAO (o mesmo das leads, NAO o dos contactos) -------------------------
--
-- crm_scope_keys('<t>.view') devolve as chaves de ambito do utilizador para a
-- VISIBILIDADE daquela tabela:
--     ambito ORG            ->  "<org>:*"          (uma por org)
--     ambito TEAM / OWNED   ->  "<org>:<dono>"     (um por dono no ambito)
-- created_by e assigned_to destas tabelas sao o business_user_id (o mesmo que
-- current_business_user_id() devolve), por isso a chave "<org>:<dono>" casa.
-- O EXISTS corre uma vez (a lista de chaves e um (SELECT ...) InitPlan) e
-- compara com as tres formas: org (ORG ve tudo), org:assigned, org:created.
--
-- Usa-se a permissao de VISTA (.view) para o ambito -- so se pode escrever o que
-- se pode ver -- e mantem-se a permissao de accao (.edit/.delete) como porta.
--
-- -- ALCANCE: so o USING do UPDATE e do DELETE --------------------------------
--
-- O WITH CHECK do UPDATE fica INTACTO de proposito (como na correccao das
-- leads): por o ambito no WITH CHECK impediria reatribuir a propria ficha a um
-- colega. O USING sozinho fecha a falha (so se mexe no que se alcanca).
--
-- entity_interactions fica DE FORA desta migracao (o seu ambito seguiria a
-- entidade, e isso puxa logica do modulo de contactos -- excluido por decisao).
-- ============================================================================

-- ---- deals -----------------------------------------------------------------
ALTER POLICY "Users can update deals in their org" ON public.deals
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'deals.edit')
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('deals.view'::text))) AS k(scope_key)
      WHERE k.scope_key = deals.organization_id::text || ':*'
         OR k.scope_key = deals.organization_id::text || ':' || deals.assigned_to::text
         OR k.scope_key = deals.organization_id::text || ':' || deals.created_by::text
    )
  );

ALTER POLICY "Users can delete deals in their org" ON public.deals
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'deals.delete')
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('deals.view'::text))) AS k(scope_key)
      WHERE k.scope_key = deals.organization_id::text || ':*'
         OR k.scope_key = deals.organization_id::text || ':' || deals.assigned_to::text
         OR k.scope_key = deals.organization_id::text || ':' || deals.created_by::text
    )
  );

-- ---- proposals -------------------------------------------------------------
-- Mantem o ramo "sou o criador" (podia editar a propria sem depender do ambito);
-- so o ramo de permissao+org e que ganha o ambito.
ALTER POLICY "Users with permission can update proposals" ON public.proposals
  USING (
    (created_by = public.current_business_user_id())
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')
      AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
      AND EXISTS (
        SELECT 1 FROM unnest((SELECT public.crm_scope_keys('proposals.view'::text))) AS k(scope_key)
        WHERE k.scope_key = proposals.organization_id::text || ':*'
           OR k.scope_key = proposals.organization_id::text || ':' || proposals.assigned_to::text
           OR k.scope_key = proposals.organization_id::text || ':' || proposals.created_by::text
      )
    )
  );

ALTER POLICY "Users with permission can delete proposals" ON public.proposals
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'proposals.delete')
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('proposals.view'::text))) AS k(scope_key)
      WHERE k.scope_key = proposals.organization_id::text || ':*'
         OR k.scope_key = proposals.organization_id::text || ':' || proposals.assigned_to::text
         OR k.scope_key = proposals.organization_id::text || ':' || proposals.created_by::text
    )
  );

-- ---- quotes ----------------------------------------------------------------
ALTER POLICY quotes_update_policy ON public.quotes
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'quotes.edit')
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('quotes.view'::text))) AS k(scope_key)
      WHERE k.scope_key = quotes.organization_id::text || ':*'
         OR k.scope_key = quotes.organization_id::text || ':' || quotes.assigned_to::text
         OR k.scope_key = quotes.organization_id::text || ':' || quotes.created_by::text
    )
  );

ALTER POLICY quotes_delete_policy ON public.quotes
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'quotes.delete')
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('quotes.view'::text))) AS k(scope_key)
      WHERE k.scope_key = quotes.organization_id::text || ':*'
         OR k.scope_key = quotes.organization_id::text || ':' || quotes.assigned_to::text
         OR k.scope_key = quotes.organization_id::text || ':' || quotes.created_by::text
    )
  );

-- ---- client_contracts ------------------------------------------------------
-- O USING actual ja tinha created_by/assigned_to, mas com um OR "org IN
-- crm_orgs" que abria tudo. Troca-se esse OR pelo EXISTS de ambito.
ALTER POLICY client_contracts_update ON public.client_contracts
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'client_contracts.edit')
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('client_contracts.view'::text))) AS k(scope_key)
      WHERE k.scope_key = client_contracts.organization_id::text || ':*'
         OR k.scope_key = client_contracts.organization_id::text || ':' || client_contracts.assigned_to::text
         OR k.scope_key = client_contracts.organization_id::text || ':' || client_contracts.created_by::text
    )
  );

ALTER POLICY client_contracts_delete ON public.client_contracts
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'client_contracts.delete')
    AND EXISTS (
      SELECT 1 FROM unnest((SELECT public.crm_scope_keys('client_contracts.view'::text))) AS k(scope_key)
      WHERE k.scope_key = client_contracts.organization_id::text || ':*'
         OR k.scope_key = client_contracts.organization_id::text || ':' || client_contracts.assigned_to::text
         OR k.scope_key = client_contracts.organization_id::text || ':' || client_contracts.created_by::text
    )
  );
