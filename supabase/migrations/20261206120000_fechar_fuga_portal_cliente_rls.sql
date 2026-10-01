-- 20261206120000_fechar_fuga_portal_cliente_rls.sql
--
-- FECHO DAS FUGAS DO PORTAL DE CLIENTES (RLS + funcoes + grants)
--
-- NAO DEPENDE DE CODIGO NOVO. Esta migration pode ser aplicada sozinha, sem
-- qualquer deploy de frontend ou de Edge Functions a acompanhar: so aperta o
-- que o portal de clientes ja faz e devolve ao cliente politicas proprias para
-- continuar a ver apenas os SEUS dados. O frontend existente continua a
-- funcionar sem alteracoes (useClientRole continua a ler a propria linha de
-- anew_users, as proprias memberships e os roles dessas memberships).
--
-- Causa central: get_user_visible_org_ids() contava as ligacoes de cliente
-- (anew_memberships.role_is_client = true). Um utilizador do portal via assim,
-- pela API directa, as organizacoes (e descendentes/ascendentes/associadas) a
-- que estava ligado como cliente, e tudo o que essas politicas penduram.
--
-- Esta migration:
--   1. Exclui as ligacoes de cliente de get_user_visible_org_ids e de
--      get_flow_user_org_ids (assinatura, SECURITY DEFINER, search_path e
--      grants mantidos; CREATE OR REPLACE preserva o ACL existente).
--   2. Cria funcoes auxiliares SECURITY DEFINER (secao 2) e devolve ao cliente
--      politicas proprias de leitura, limitadas as organizacoes/linhas ligadas
--      aos SEUS client_portal_users, para o portal continuar a funcionar.
--   3. Fecha escritas: client_portal_users (ambito por organizacao + trigger de
--      lista branca), client_portal_documents (clientes fora do ALL; documento
--      tem de pertencer a organizacao da linha), contract_sends (ambito),
--      anew_organizations (self_registration so sem membership activa),
--      anew_org_associations / anew_hierarchy (ambito), move/unlink_organization_node
--      (permissao), bootstrap_org_creator (REVOKE a PUBLIC/anon/authenticated).
--   4. get_commercial_info passa a ter guarda (o ramo anonimo da pagina publica
--      de propostas mantem-se); get_portal_commercial usa a versao interna.
--      Efeito aceite (decisao do coordenador): quem abre o link publico de uma
--      proposta COM sessao iniciada (por exemplo, equipa de outra organizacao)
--      deixa de ver nome/email/telefone do comercial nessa pagina, porque o
--      ramo do link publico so vale sem sessao.
--   4b. NIF no portal: filter_visible_entity_ids (so service_role, usada pela
--      edge function nif-reveal) ganha um ramo para o cliente nas entidades que
--      ele ve; fiscal_entities e anew_entity_fiscal_entities ganham politicas
--      de portal. can_see_entity e is_entity_in_user_scope NAO mudam (ver 10b).
--      ATENCAO: authenticated tem SELECT em TODAS as colunas de fiscal_entities,
--      incluindo nif. A politica de portal deixa portanto o cliente ler pela API,
--      em claro, o NIF das entidades que o portal lhe mostra (a propria, a da
--      organizacao ligada, as dos documentos concedidos). E muito menos do que
--      hoje (via orgs de cliente via o de toda a organizacao), mas nao e nada.
--      Fechar por coluna (REVOKE de tabela + GRANT coluna a coluna, com
--      verificacao de colunas) fica para migration propria.
--   4c. proposal_rejection_reasons ganha leitura de portal.
--   5. roles / role_permissions / client_contract_templates deixam de ter ramo
--      por ligacoes de cliente.
--
-- ---------------------------------------------------------------------------
-- RECURSAO DE RLS (B1) — regra seguida por TODAS as politicas desta migration
-- ---------------------------------------------------------------------------
-- Ja existem na base duas politicas que fecham ciclo com quem as consulte:
--   * anew_users_select (anew_users)             consulta anew_memberships.
--   * client_templates_select (antes desta mig.) juntava anew_memberships e
--     anew_users.
-- Uma politica nova em anew_memberships que lesse anew_users, ou uma politica
-- nova em anew_users que lesse client_contract_templates ou anew_memberships,
-- dava "infinite recursion detected in policy". Por isso:
--   - NENHUMA politica criada aqui le directamente anew_users, anew_memberships
--     ou client_contract_templates. Essas leituras fazem-se so dentro de
--     funcoes SECURITY DEFINER (dono postgres, sem RLS), que nao reavaliam
--     politicas.
--   - A unica tabela com RLS lida directamente pelas politicas novas do portal
--     e client_portal_users (no prefixo EXISTS de M4). As politicas SELECT de
--     client_portal_users so usam auth.uid() e has_anew_permission (definer):
--     nao consultam tabela nenhuma, logo nao ha caminho de volta.
--   - anew_role_permissions_select le anew_roles (como ja lia); as politicas
--     SELECT de anew_roles criadas aqui so usam funcoes definer e
--     client_portal_users, nunca anew_role_permissions.
--
-- Mapa: politica -> tabelas com RLS que consulta DIRECTAMENTE
--       [funcoes definer usadas; estas leem sem RLS]
--   anew_memberships.portal_client_reads_own_membership
--       -> client_portal_users            [current_business_user_id]
--   anew_organizations.portal_client_reads_linked_org
--       -> client_portal_users            [portal_linked_org_ids]
--   anew_org_addresses.portal_client_reads_linked_org_addresses
--       -> client_portal_users            [portal_linked_org_ids]
--   organization_document_settings.portal_client_reads_org_doc_settings
--       -> client_portal_users            [portal_linked_org_ids]
--   custom_contract_variables.portal_client_reads_org_custom_vars
--       -> client_portal_users            [portal_linked_org_ids]
--   proposal_templates.portal_client_reads_org_proposal_templates
--       -> client_portal_users            [portal_linked_org_ids]
--   client_contract_templates.portal_client_reads_org_contract_templates
--       -> client_portal_users            [portal_linked_org_ids]
--   anew_entities.portal_client_reads_portal_entities
--       -> client_portal_users            [portal_visible_entity_ids]
--   anew_entity_emails / _phones / _addresses
--     (.portal_client_reads_portal_entity_*)
--       -> client_portal_users            [portal_contact_entity_ids]
--   anew_entity_fiscal_entities.portal_client_reads_portal_fiscal_links
--       -> client_portal_users            [portal_visible_entity_ids]
--   fiscal_entities.portal_client_reads_portal_fiscal_entities
--       -> client_portal_users            [portal_visible_fiscal_entity_ids]
--   fiscal_entities.authenticated_update_fiscal_entities (USING e WITH CHECK)
--       -> anew_entity_fiscal_entities    [is_entity_in_user_scope]
--   proposal_rejection_reasons.portal_client_reads_org_rejection_reasons
--       -> client_portal_users            [portal_linked_org_ids]
--   anew_addresses.portal_client_reads_portal_addresses
--       -> client_portal_users            [portal_visible_address_ids]
--   anew_users.portal_client_reads_doc_commercials
--       -> client_portal_users            [portal_visible_user_ids]
--   anew_roles.portal_client_reads_signatory_roles
--       -> client_portal_users            [portal_signatory_role_ids]
--   proposal_quote_selections.portal_client_reads_doc_pq_selections
--       -> client_portal_users            [portal_granted_document_ids]
--   client_portal_users."Org members can insert/update client portal users"
--       -> (nenhuma)                      [get_user_crm_org_ids,
--                                          current_user_has_permission_in_org]
--   client_portal_documents."Org members manage portal documents"
--       -> (nenhuma)                      [get_user_crm_org_ids,
--                                          portal_document_in_org, portal_user_in_org]
--   contract_sends (SELECT / INSERT)
--       -> (nenhuma)                      [get_user_visible_org_ids]
--   anew_organizations.authenticated_insert_anew_organizations
--       -> (nenhuma)                      [has_anew_permission,
--                                          user_can_self_register_first_org]
--   anew_org_associations."Admins can manage associations"
--       -> (nenhuma)                      [has_anew_permission, get_user_visible_org_ids]
--   anew_hierarchy (INSERT / UPDATE / DELETE)
--       -> (nenhuma)                      [get_user_visible_org_ids, has_anew_permission,
--                                          org_is_own_unparented]
--   anew_roles.anew_roles_select
--       -> (nenhuma)                      [get_user_visible_org_ids, get_user_own_role_ids]
--   anew_role_permissions.anew_role_permissions_select
--       -> anew_roles                     [get_user_visible_org_ids, get_user_own_role_ids]
--   client_contract_templates.client_templates_select
--       -> (nenhuma)                      [is_system_admin, get_user_crm_org_ids]
--
-- Bloco final DO $$...$$ confere o resultado (so catalogo; nao le tabelas com
-- RLS como authenticated — isso e coberto por
-- tests/security/portal-client-isolation.mjs) e levanta excepcao se divergir.

BEGIN;

-- =====================================================================
-- 1. FUNCAO CENTRAL: get_user_visible_org_ids (exclui ligacoes de cliente)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE direct_orgs AS (
    SELECT m.organization_id
    FROM public.anew_memberships m
    JOIN public.anew_users u ON u.id = m.user_id
    WHERE u.auth_user_id = _auth_uid
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ),
  descendant_orgs AS (
    SELECT organization_id FROM direct_orgs
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN descendant_orgs d ON d.organization_id = h.parent_org_id
  ),
  ancestor_orgs AS (
    SELECT organization_id FROM direct_orgs
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN ancestor_orgs a ON a.organization_id = h.child_org_id
  ),
  hierarchy_orgs AS (
    SELECT organization_id FROM descendant_orgs
    UNION
    SELECT organization_id FROM ancestor_orgs
  ),
  expanded AS (
    SELECT organization_id FROM hierarchy_orgs
    UNION
    SELECT a.associated_org_id
    FROM public.anew_org_associations a
    JOIN hierarchy_orgs h ON h.organization_id = a.org_id
    UNION
    SELECT a.org_id
    FROM public.anew_org_associations a
    JOIN hierarchy_orgs h ON h.organization_id = a.associated_org_id
  )
  SELECT organization_id FROM expanded
$function$;

-- flow_builder: a mesma travessia, mesma correcao.
CREATE OR REPLACE FUNCTION public.get_flow_user_org_ids(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE direct_orgs AS (
    SELECT m.organization_id
    FROM anew_memberships m
    JOIN anew_users u ON u.id = m.user_id
    WHERE u.auth_user_id = _auth_uid
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ),
  descendant_orgs AS (
    SELECT organization_id AS org_id FROM direct_orgs
    UNION
    SELECT h.child_org_id AS org_id
    FROM anew_hierarchy h
    JOIN descendant_orgs d ON h.parent_org_id = d.org_id
  )
  SELECT org_id FROM descendant_orgs;
$function$;

-- =====================================================================
-- 2. FUNCOES AUXILIARES (SECURITY DEFINER, sem RLS por dentro).
--    Duas familias:
--      * NUCLEOS "*_for(_auth_uid ...)": recebem o auth uid. So para outras
--        funcoes definer (e para filter_visible_entity_ids, chamada pela edge
--        function nif-reveal com service_role, onde nao ha auth.uid()).
--        REVOKE de PUBLIC, anon e authenticated: ninguem os chama pela API com
--        um uid arbitrario.
--      * EMBRULHOS sem uid: usam auth.uid() e sao os que as politicas chamam
--        (uma funcao numa politica corre como o utilizador da consulta, por
--        isso precisa de EXECUTE para authenticated). So respondem sobre o
--        proprio chamador.
--    REVOKE de PUBLIC e anon em todas. Ordem importa: as de baixo usam as de cima.
-- =====================================================================

-- 2.1 Organizacoes ligadas aos client_portal_users do utilizador (nao apagadas).
CREATE OR REPLACE FUNCTION public.portal_linked_org_ids_for(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT cpu.organization_id
  FROM public.client_portal_users cpu
  JOIN public.anew_organizations o ON o.id = cpu.organization_id
  WHERE _auth_uid IS NOT NULL
    AND cpu.auth_user_id = _auth_uid
    AND o.deleted_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.portal_linked_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.portal_linked_org_ids_for(auth.uid())
$function$;

-- 2.2 Documentos concedidos (visiveis) ao utilizador, de um tipo, cujo
--     documento de origem nao esta apagado.
CREATE OR REPLACE FUNCTION public.portal_granted_document_ids_for(_auth_uid uuid, _doc_type public.portal_document_type)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.document_id
  FROM public.client_portal_documents d
  JOIN public.client_portal_users pu ON pu.id = d.portal_user_id
  WHERE _auth_uid IS NOT NULL
    AND pu.auth_user_id = _auth_uid
    AND d.document_type = _doc_type
    AND d.is_visible = true
    AND CASE _doc_type::text
          WHEN 'proposal' THEN EXISTS (
            SELECT 1 FROM public.proposals p
            WHERE p.id = d.document_id AND p.deleted_at IS NULL)
          WHEN 'quote' THEN EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = d.document_id AND q.deleted_at IS NULL)
          WHEN 'contract' THEN EXISTS (
            SELECT 1 FROM public.client_contracts c
            WHERE c.id = d.document_id AND c.deleted_at IS NULL)
          WHEN 'direct_sale' THEN EXISTS (
            SELECT 1 FROM public.direct_sales s
            WHERE s.id = d.document_id AND s.deleted_at IS NULL)
          ELSE false
        END
$function$;

CREATE OR REPLACE FUNCTION public.portal_granted_document_ids(_doc_type public.portal_document_type)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.portal_granted_document_ids_for(auth.uid(), _doc_type)
$function$;

-- 2.3 Entidades de contacto do portal: a propria ficha do cliente e a entidade
--     de cada organizacao ligada.
CREATE OR REPLACE FUNCTION public.portal_contact_entity_ids_for(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cpu.entity_id
  FROM public.client_portal_users cpu
  WHERE _auth_uid IS NOT NULL
    AND cpu.auth_user_id = _auth_uid
    AND cpu.entity_id IS NOT NULL
  UNION
  SELECT o.entity_id
  FROM public.anew_organizations o
  WHERE o.entity_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.id IN (SELECT public.portal_linked_org_ids_for(_auth_uid))
$function$;

CREATE OR REPLACE FUNCTION public.portal_contact_entity_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.portal_contact_entity_ids_for(auth.uid())
$function$;

-- 2.4 Entidades visiveis: as de contacto + as dos contratos/propostas concedidos.
CREATE OR REPLACE FUNCTION public.portal_visible_entity_ids_for(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT x.entity_id FROM public.portal_contact_entity_ids_for(_auth_uid) AS x(entity_id)
  UNION
  SELECT c.entity_id
  FROM public.client_contracts c
  WHERE c.entity_id IS NOT NULL
    AND c.id IN (SELECT public.portal_granted_document_ids_for(_auth_uid, 'contract'::public.portal_document_type))
  UNION
  SELECT p.entity_id
  FROM public.proposals p
  WHERE p.entity_id IS NOT NULL
    AND p.id IN (SELECT public.portal_granted_document_ids_for(_auth_uid, 'proposal'::public.portal_document_type))
$function$;

CREATE OR REPLACE FUNCTION public.portal_visible_entity_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.portal_visible_entity_ids_for(auth.uid())
$function$;

-- 2.4b Uma entidade e visivel ao cliente do portal _auth_uid (nucleo, usado por
--      filter_visible_entity_ids na revelacao do NIF).
CREATE OR REPLACE FUNCTION public.portal_entity_visible_to(_entity_id uuid, _auth_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _entity_id IS NOT NULL
     AND _auth_uid IS NOT NULL
     AND _entity_id IN (SELECT public.portal_visible_entity_ids_for(_auth_uid))
$function$;

-- 2.4c Entidades fiscais (fiscal_entities.id) ligadas as entidades visiveis do
--      portal (NIF e nome comercial no contrato e no cabecalho da empresa).
CREATE OR REPLACE FUNCTION public.portal_visible_fiscal_entity_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT aef.fiscal_entity_id
  FROM public.anew_entity_fiscal_entities aef
  WHERE aef.entity_id IN (SELECT public.portal_visible_entity_ids_for(auth.uid()))
$function$;

-- 2.5 Utilizadores (anew_users.id) que o cliente pode ver para alem de si
--     proprio (decisao M3): comerciais e assinantes dos documentos concedidos,
--     e o signatario das minutas de contrato das organizacoes ligadas.
--     signatory_user_id e text: compara-se com id::text.
CREATE OR REPLACE FUNCTION public.portal_visible_user_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH doc_users AS (
    SELECT p.created_by AS uid FROM public.proposals p
     WHERE p.id IN (SELECT public.portal_granted_document_ids('proposal'::public.portal_document_type))
    UNION
    SELECT p.assigned_to FROM public.proposals p
     WHERE p.id IN (SELECT public.portal_granted_document_ids('proposal'::public.portal_document_type))
    UNION
    SELECT d.assigned_to FROM public.proposals p JOIN public.deals d ON d.id = p.deal_id
     WHERE p.id IN (SELECT public.portal_granted_document_ids('proposal'::public.portal_document_type))
    UNION
    SELECT q.created_by FROM public.quotes q
     WHERE q.id IN (SELECT public.portal_granted_document_ids('quote'::public.portal_document_type))
    UNION
    SELECT q.assigned_to FROM public.quotes q
     WHERE q.id IN (SELECT public.portal_granted_document_ids('quote'::public.portal_document_type))
    UNION
    SELECT c.created_by FROM public.client_contracts c
     WHERE c.id IN (SELECT public.portal_granted_document_ids('contract'::public.portal_document_type))
    UNION
    SELECT c.assigned_to FROM public.client_contracts c
     WHERE c.id IN (SELECT public.portal_granted_document_ids('contract'::public.portal_document_type))
    UNION
    SELECT c.company_signed_by_id FROM public.client_contracts c
     WHERE c.id IN (SELECT public.portal_granted_document_ids('contract'::public.portal_document_type))
    UNION
    SELECT s.created_by FROM public.direct_sales s
     WHERE s.id IN (SELECT public.portal_granted_document_ids('direct_sale'::public.portal_document_type))
    UNION
    SELECT s.assigned_to FROM public.direct_sales s
     WHERE s.id IN (SELECT public.portal_granted_document_ids('direct_sale'::public.portal_document_type))
  )
  SELECT u.id
  FROM public.anew_users u
  WHERE u.deleted_at IS NULL
    AND (
      u.id IN (SELECT du.uid FROM doc_users du WHERE du.uid IS NOT NULL)
      OR u.id::text IN (
        SELECT t.signatory_user_id
        FROM public.client_contract_templates t
        WHERE t.signatory_user_id IS NOT NULL
          AND t.organization_id IN (SELECT public.portal_linked_org_ids())
      )
    )
$function$;

-- 2.6 Roles signatarios das minutas de contrato das organizacoes ligadas.
CREATE OR REPLACE FUNCTION public.portal_signatory_role_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id
  FROM public.anew_roles r
  WHERE r.id::text IN (
    SELECT t.signatory_role_id
    FROM public.client_contract_templates t
    WHERE t.signatory_role_id IS NOT NULL
      AND t.organization_id IN (SELECT public.portal_linked_org_ids())
  )
$function$;

-- 2.7 Moradas (anew_addresses.id) das organizacoes ligadas e das entidades de
--     contacto do portal.
CREATE OR REPLACE FUNCTION public.portal_visible_address_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT oa.address_id
  FROM public.anew_org_addresses oa
  WHERE oa.org_id IN (SELECT public.portal_linked_org_ids())
  UNION
  SELECT ea.address_id
  FROM public.anew_entity_addresses ea
  WHERE ea.entity_id IN (SELECT public.portal_contact_entity_ids())
$function$;

-- 2.8 Roles das memberships activas do PROPRIO utilizador (clientes incluidos:
--     useClientRole precisa de ler o codigo do proprio role para decidir
--     portal vs CRM; ver o proprio role nao expoe ninguem).
CREATE OR REPLACE FUNCTION public.get_user_own_role_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT m.role_id
  FROM public.anew_memberships m
  JOIN public.anew_users u ON u.id = m.user_id
  WHERE u.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role_id IS NOT NULL
$function$;

-- 2.9 Permissao NUMA organizacao concreta (membership activa nao-cliente nessa
--     organizacao cujo role tem a permissao). Mesmo padrao de
--     has_anew_permission (20260622114000), mais o filtro de organizacao e de
--     role_is_client. Nao herda por hierarquia.
CREATE OR REPLACE FUNCTION public.current_user_has_permission_in_org(_permission_code text, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND _org_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.anew_users au
       JOIN public.anew_memberships am
         ON am.user_id = au.id
        AND am.status = 'active'
        AND am.organization_id = _org_id
        AND am.role_is_client IS NOT TRUE
       JOIN public.anew_role_permissions arp
         ON arp.role_id = am.role_id
        AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = auth.uid()
     )
$function$;

-- 2.10 Auto-registo: utilizador self_registration sem nenhuma membership activa
--      (so pode criar a PRIMEIRA organizacao, como create_initial_organization).
CREATE OR REPLACE FUNCTION public.user_can_self_register_first_org()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.anew_users au
           WHERE au.auth_user_id = auth.uid()
             AND au.registration_origin = 'self_registration'
             AND au.deleted_at IS NULL
         )
     AND NOT EXISTS (
           SELECT 1
           FROM public.anew_memberships m
           JOIN public.anew_users au2 ON au2.id = m.user_id
           WHERE au2.auth_user_id = auth.uid()
             AND m.status = 'active'
         )
$function$;

-- 2.11 Organizacao criada pelo proprio utilizador e que ainda nao tem pai
--      (fallback de ChildOrganizationsTree: cria a org e a seguir a linha de
--      anew_hierarchy, quando a filha ainda nao e visivel).
CREATE OR REPLACE FUNCTION public.org_is_own_unparented(_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _org_id IS NOT NULL
     AND EXISTS (
           SELECT 1 FROM public.anew_organizations o
           WHERE o.id = _org_id
             AND o.deleted_at IS NULL
             AND o.created_by IS NOT NULL
             AND o.created_by = public.current_business_user_id()
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.anew_hierarchy h
           WHERE h.child_org_id = _org_id
         )
$function$;

-- 2.12 O documento (por tipo) pertence a organizacao indicada. Chamada pela
--      politica de client_portal_documents, por isso precisa de EXECUTE para
--      authenticated; para nao ser oraculo de existencia, so responde quando
--      a organizacao e uma organizacao CRM do PROPRIO chamador (de outra org,
--      devolve sempre false).
CREATE OR REPLACE FUNCTION public.portal_document_in_org(_doc_type public.portal_document_type, _doc_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _org_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))
     AND CASE _doc_type::text
           WHEN 'proposal' THEN EXISTS (
             SELECT 1 FROM public.proposals p
             WHERE p.id = _doc_id AND p.organization_id = _org_id)
           WHEN 'quote' THEN EXISTS (
             SELECT 1 FROM public.quotes q
             WHERE q.id = _doc_id AND q.organization_id = _org_id)
           WHEN 'contract' THEN EXISTS (
             SELECT 1 FROM public.client_contracts c
             WHERE c.id = _doc_id AND c.organization_id = _org_id)
           WHEN 'direct_sale' THEN EXISTS (
             SELECT 1 FROM public.direct_sales s
             WHERE s.id = _doc_id AND s.organization_id = _org_id)
           ELSE false
         END
$function$;

-- 2.13 O utilizador do portal pertence a organizacao indicada. Mesma regra que
--      2.12: so responde sobre organizacoes CRM do proprio chamador.
CREATE OR REPLACE FUNCTION public.portal_user_in_org(_portal_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _org_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))
     AND EXISTS (
    SELECT 1 FROM public.client_portal_users cpu
    WHERE cpu.id = _portal_user_id
      AND cpu.organization_id = _org_id
  )
$function$;

-- Nucleos com uid: so funcoes definer (dono postgres) e service_role.
REVOKE ALL ON FUNCTION public.portal_linked_org_ids_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_granted_document_ids_for(uuid, public.portal_document_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_contact_entity_ids_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_visible_entity_ids_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_entity_visible_to(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_linked_org_ids_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_granted_document_ids_for(uuid, public.portal_document_type) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_contact_entity_ids_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_visible_entity_ids_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_entity_visible_to(uuid, uuid) TO service_role;

-- Embrulhos (auth.uid()) chamados pelas politicas.
REVOKE ALL ON FUNCTION public.portal_visible_fiscal_entity_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_linked_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_granted_document_ids(public.portal_document_type) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_contact_entity_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_visible_entity_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_visible_user_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_signatory_role_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_visible_address_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_own_role_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_has_permission_in_org(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_self_register_first_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_is_own_unparented(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_document_in_org(public.portal_document_type, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_user_in_org(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.portal_visible_fiscal_entity_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_linked_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_granted_document_ids(public.portal_document_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_contact_entity_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_visible_entity_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_visible_user_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_signatory_role_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_visible_address_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_own_role_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission_in_org(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_self_register_first_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_is_own_unparented(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_document_in_org(public.portal_document_type, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_user_in_org(uuid, uuid) TO authenticated, service_role;

-- =====================================================================
-- 3. POLITICAS PROPRIAS DO PORTAL (leitura dos dados do PROPRIO cliente)
--    Todas PERMISSIVE: so acrescentam acesso ao cliente, nunca tiram a staff.
--    Todas comecam pelo prefixo M4 (o utilizador tem pelo menos uma linha em
--    client_portal_users) e depois usam SO funcoes definer da secao 2.
-- =====================================================================

-- 3a. A propria ligacao de membership (useClientRole decide portal vs CRM).
--     user_id = current_business_user_id(): NAO le anew_users (B1).
DROP POLICY IF EXISTS portal_client_reads_own_membership ON public.anew_memberships;
CREATE POLICY portal_client_reads_own_membership
  ON public.anew_memberships FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND user_id = (SELECT public.current_business_user_id())
  );

-- 3b. Organizacoes ligadas ao cliente (nome/logo/metadata do portal).
DROP POLICY IF EXISTS portal_client_reads_linked_org ON public.anew_organizations;
CREATE POLICY portal_client_reads_linked_org
  ON public.anew_organizations FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND deleted_at IS NULL
    AND id IN (SELECT public.portal_linked_org_ids())
  );

-- 3c. Moradas da organizacao ligada (cabecalho do contrato).
DROP POLICY IF EXISTS portal_client_reads_linked_org_addresses ON public.anew_org_addresses;
CREATE POLICY portal_client_reads_linked_org_addresses
  ON public.anew_org_addresses FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND org_id IN (SELECT public.portal_linked_org_ids())
  );

-- 3d. Definicoes de documento e variaveis personalizadas da organizacao ligada.
DROP POLICY IF EXISTS portal_client_reads_org_doc_settings ON public.organization_document_settings;
CREATE POLICY portal_client_reads_org_doc_settings
  ON public.organization_document_settings FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND organization_id IN (SELECT public.portal_linked_org_ids())
  );

DROP POLICY IF EXISTS portal_client_reads_org_custom_vars ON public.custom_contract_variables;
CREATE POLICY portal_client_reads_org_custom_vars
  ON public.custom_contract_variables FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND organization_id IN (SELECT public.portal_linked_org_ids())
  );

-- 3e. Minutas (proposta e contrato) da organizacao ligada. As de sistema
--     (organization_id NULL) ja sao lidas por client_templates_select.
DROP POLICY IF EXISTS portal_client_reads_org_proposal_templates ON public.proposal_templates;
CREATE POLICY portal_client_reads_org_proposal_templates
  ON public.proposal_templates FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND organization_id IN (SELECT public.portal_linked_org_ids())
  );

DROP POLICY IF EXISTS portal_client_reads_org_contract_templates ON public.client_contract_templates;
CREATE POLICY portal_client_reads_org_contract_templates
  ON public.client_contract_templates FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND organization_id IN (SELECT public.portal_linked_org_ids())
  );

-- 3f. Entidades: a propria ficha do cliente, a entidade da organizacao ligada,
--     e as entidades dos contratos/propostas concedidos.
DROP POLICY IF EXISTS portal_client_reads_portal_entities ON public.anew_entities;
CREATE POLICY portal_client_reads_portal_entities
  ON public.anew_entities FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND id IN (SELECT public.portal_visible_entity_ids())
  );

-- 3g. Contactos e ligacao fiscal das entidades de contacto do portal
--     (entidade propria + entidade da organizacao ligada).
DROP POLICY IF EXISTS portal_client_reads_portal_entity_emails ON public.anew_entity_emails;
CREATE POLICY portal_client_reads_portal_entity_emails
  ON public.anew_entity_emails FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND entity_id IN (SELECT public.portal_contact_entity_ids())
  );

DROP POLICY IF EXISTS portal_client_reads_portal_entity_phones ON public.anew_entity_phones;
CREATE POLICY portal_client_reads_portal_entity_phones
  ON public.anew_entity_phones FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND entity_id IN (SELECT public.portal_contact_entity_ids())
  );

DROP POLICY IF EXISTS portal_client_reads_portal_entity_addresses ON public.anew_entity_addresses;
CREATE POLICY portal_client_reads_portal_entity_addresses
  ON public.anew_entity_addresses FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND entity_id IN (SELECT public.portal_contact_entity_ids())
  );

-- Ligacao fiscal: de TODAS as entidades que o cliente ve (inclui a entidade do
-- contrato concedido), porque fetchPrimaryFiscalEntity (contractDocument.ts)
-- a le para a entidade do contrato e useOrgHeaderData para a da empresa.
DROP POLICY IF EXISTS portal_client_reads_portal_fiscal_links ON public.anew_entity_fiscal_entities;
CREATE POLICY portal_client_reads_portal_fiscal_links
  ON public.anew_entity_fiscal_entities FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND entity_id IN (SELECT public.portal_visible_entity_ids())
  );

-- 3g-bis. fiscal_entities (nome comercial / pais no contrato). A politica da
--     equipa usa is_entity_in_user_scope -> get_user_visible_org_ids, que ja nao
--     conta ligacoes de cliente. Ramo proprio do portal, sem ler as tabelas
--     com RLS da ligacao: tudo em portal_visible_fiscal_entity_ids.
--     NAO e so a nif-reveal que da o NIF: authenticated tem SELECT em todas as
--     colunas de fiscal_entities (nif incluido), por isso esta politica deixa o
--     cliente ler pela API o NIF em claro destas entidades (propria, da
--     organizacao ligada, dos documentos concedidos). Fechar a coluna nif
--     (REVOKE de tabela + GRANT coluna a coluna) fica para migration propria.
DROP POLICY IF EXISTS portal_client_reads_portal_fiscal_entities ON public.fiscal_entities;
CREATE POLICY portal_client_reads_portal_fiscal_entities
  ON public.fiscal_entities FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND id IN (SELECT public.portal_visible_fiscal_entity_ids())
  );

-- 3g-ter. fiscal_entities UPDATE (confirmado ao vivo pelo coordenador): a
--     politica da baseline so exigia "ter uma membership activa" (qualquer
--     organizacao, cliente incluido) — um cliente do portal podia mudar o NIF
--     e o nome de QUALQUER linha. Passa a espelhar a politica de leitura da
--     equipa (authenticated_select_fiscal_entities, 20261110610000), em USING e
--     WITH CHECK. Le anew_entity_fiscal_entities (como a de leitura ja le) e
--     is_entity_in_user_scope (definer); NAO le anew_memberships/anew_users.
--     O cliente do portal nao ganha UPDATE: is_entity_in_user_scope usa
--     get_user_visible_org_ids, que ja nao conta ligacoes de cliente.
--     A INSERT authenticated_insert_fiscal_entities (no repositorio: WITH CHECK
--     = existe membership activa do utilizador, sem organizacao) fica como
--     esta: nao confirmada partida nesta revisao.
DROP POLICY IF EXISTS authenticated_update_fiscal_entities ON public.fiscal_entities;
CREATE POLICY authenticated_update_fiscal_entities
  ON public.fiscal_entities FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.fiscal_entity_id = fiscal_entities.id
        AND public.is_entity_in_user_scope(aef.entity_id, (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.fiscal_entity_id = fiscal_entities.id
        AND public.is_entity_in_user_scope(aef.entity_id, (SELECT auth.uid()))
    )
  );

-- 3h. Moradas (anew_addresses) das organizacoes/entidades do portal.
DROP POLICY IF EXISTS portal_client_reads_portal_addresses ON public.anew_addresses;
CREATE POLICY portal_client_reads_portal_addresses
  ON public.anew_addresses FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND id IN (SELECT public.portal_visible_address_ids())
  );

-- 3i. anew_users (decisao M3): a propria linha e os comerciais/assinantes dos
--     documentos concedidos. NAO le anew_memberships nem
--     client_contract_templates directamente (B1): tudo em portal_visible_user_ids.
DROP POLICY IF EXISTS portal_client_reads_doc_commercials ON public.anew_users;
CREATE POLICY portal_client_reads_doc_commercials
  ON public.anew_users FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND (
      auth_user_id = (SELECT auth.uid())
      OR id IN (SELECT public.portal_visible_user_ids())
    )
  );

-- 3j. Roles signatarios das minutas das organizacoes ligadas.
DROP POLICY IF EXISTS portal_client_reads_signatory_roles ON public.anew_roles;
CREATE POLICY portal_client_reads_signatory_roles
  ON public.anew_roles FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND id IN (SELECT public.portal_signatory_role_ids())
  );

-- 3k. Seleccoes de orcamento da proposta concedida.
DROP POLICY IF EXISTS portal_client_reads_doc_pq_selections ON public.proposal_quote_selections;
CREATE POLICY portal_client_reads_doc_pq_selections
  ON public.proposal_quote_selections FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND proposal_id IN (SELECT public.portal_granted_document_ids('proposal'::public.portal_document_type))
  );

-- 3l. Motivos de rejeicao de proposta da organizacao ligada (e os globais,
--     organization_id NULL), para o cliente poder rejeitar no portal.
DROP POLICY IF EXISTS portal_client_reads_org_rejection_reasons ON public.proposal_rejection_reasons;
CREATE POLICY portal_client_reads_org_rejection_reasons
  ON public.proposal_rejection_reasons FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = (SELECT auth.uid())))
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.portal_linked_org_ids())
    )
  );

-- Nota: documents (politica "Portal users can view their entity documents") e
-- storage.objects (politica "portal_users_can_read_documents") ja dao ao
-- cliente, por portal_user_can_see_doc / colunas do client_portal_users, os
-- documentos concedidos. Nao dependem de get_user_visible_org_ids, por isso
-- continuam intactas e nao precisam de politica nova.

-- =====================================================================
-- 4. client_portal_users
-- 4a. (A1) INSERT/UPDATE da equipa: alem da permissao, a linha tem de ser de
--     uma organizacao onde o utilizador e membro CRM, e a permissao
--     proposals.edit tem de ser NESSA organizacao. A edge function
--     create-client-portal-access escreve com service_role (nao passa por RLS).
--     As politicas do proprio cliente ("Client can view/update own portal
--     record", auth_user_id = auth.uid()) ficam como estao.
-- =====================================================================
DROP POLICY IF EXISTS "Org members can insert client portal users" ON public.client_portal_users;
CREATE POLICY "Org members can insert client portal users"
  ON public.client_portal_users FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.current_user_has_permission_in_org('proposals.edit', organization_id)
  );

DROP POLICY IF EXISTS "Org members can update client portal users" ON public.client_portal_users;
CREATE POLICY "Org members can update client portal users"
  ON public.client_portal_users FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.current_user_has_permission_in_org('proposals.edit', organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.current_user_has_permission_in_org('proposals.edit', organization_id)
  );

-- 4b. (A2) Trigger BEFORE UPDATE em LISTA BRANCA. A politica UPDATE nao
--     consegue comparar OLD/NEW; faz-se aqui.
--       - sem auth.uid() (service_role, jobs) -> passa.
--       - equipa com proposals.edit na organizacao da linha (antes e depois)
--         -> passa.
--       - o proprio cliente (auth.uid() = auth_user_id, antes ou depois) -> so
--         pode mudar last_login_at, first_login, password_changed_at. Tambem se
--         ignora updated_at, que e so um carimbo (protege contra um trigger de
--         updated_at que corra antes deste).
--       - outros chamadores: a RLS ja decide; RPCs definer da equipa
--         (republicar proposta, reabrir) mantem o comportamento.
CREATE OR REPLACE FUNCTION public.tg_client_portal_users_guard_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed text[] := ARRAY['last_login_at', 'first_login', 'password_changed_at', 'updated_at'];
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_user_has_permission_in_org('proposals.edit', OLD.organization_id)
     AND public.current_user_has_permission_in_org('proposals.edit', NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  IF v_uid = OLD.auth_user_id OR v_uid = NEW.auth_user_id THEN
    IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
      RAISE EXCEPTION 'Portal client may only update login fields (last_login_at, first_login, password_changed_at)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_client_portal_users_guard_self_update ON public.client_portal_users;
CREATE TRIGGER tg_client_portal_users_guard_self_update
  BEFORE UPDATE ON public.client_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_portal_users_guard_self_update();

-- =====================================================================
-- 5. (A3) client_portal_documents: clientes fora da politica ALL. So membros
--    CRM da organizacao da linha gerem concessoes, e o documento concedido
--    tem de pertencer a essa organizacao (proposal/quote/contract/direct_sale).
--    Na escrita, o utilizador do portal tambem tem de ser dessa organizacao.
--    O cliente continua a LER pela politica "Portal user reads own visible
--    documents".
-- =====================================================================
DROP POLICY IF EXISTS "Org members manage portal documents" ON public.client_portal_documents;
CREATE POLICY "Org members manage portal documents"
  ON public.client_portal_documents FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.portal_document_in_org(document_type, document_id, organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.portal_document_in_org(document_type, document_id, organization_id)
    AND public.portal_user_in_org(portal_user_id, organization_id)
  );

-- =====================================================================
-- 6. contract_sends: leitura e insercao por ambito de equipa (orgs visiveis),
--    em vez de SELECT USING (true).
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can view contract sends" ON public.contract_sends;
CREATE POLICY "Authenticated users can view contract sends"
  ON public.contract_sends FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can insert contract sends" ON public.contract_sends;
CREATE POLICY "Authenticated users can insert contract sends"
  ON public.contract_sends FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))));

-- =====================================================================
-- 7. anew_organizations: self_registration so cria a PRIMEIRA organizacao
--    (sem membership activa), igual a create_initial_organization.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_insert_anew_organizations ON public.anew_organizations;
CREATE POLICY authenticated_insert_anew_organizations
  ON public.anew_organizations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_anew_permission((SELECT auth.uid()), 'organizations.create')
    OR public.user_can_self_register_first_org()
  );

-- =====================================================================
-- 8. anew_org_associations e anew_hierarchy: ambito de organizacao nas duas
--    pontas. No INSERT de anew_hierarchy a filha pode ainda nao ser visivel
--    quando acabou de ser criada pelo proprio utilizador e nao tem pai (M1,
--    fallback de ChildOrganizationsTree). UPDATE mantem a permissao que ja
--    tinha (organizations.manage), so ganha o ambito da filha.
-- =====================================================================
DROP POLICY IF EXISTS "Admins can manage associations" ON public.anew_org_associations;
CREATE POLICY "Admins can manage associations"
  ON public.anew_org_associations FOR ALL TO authenticated
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')
    AND org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND associated_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  )
  WITH CHECK (
    public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')
    AND org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND associated_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS authenticated_insert_anew_hierarchy ON public.anew_hierarchy;
CREATE POLICY authenticated_insert_anew_hierarchy
  ON public.anew_hierarchy FOR INSERT TO authenticated
  WITH CHECK (
    parent_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND (
      child_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      OR public.org_is_own_unparented(child_org_id)
    )
    AND public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')
  );

DROP POLICY IF EXISTS authenticated_update_anew_hierarchy ON public.anew_hierarchy;
CREATE POLICY authenticated_update_anew_hierarchy
  ON public.anew_hierarchy FOR UPDATE TO authenticated
  USING (
    parent_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND child_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'organizations.manage')
  );

DROP POLICY IF EXISTS authenticated_delete_anew_hierarchy ON public.anew_hierarchy;
CREATE POLICY authenticated_delete_anew_hierarchy
  ON public.anew_hierarchy FOR DELETE TO authenticated
  USING (
    parent_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND child_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')
  );

-- =====================================================================
-- 9. move/unlink_organization_node: exigir permissao, nao so visibilidade.
--    Resto identico ao existente (actor por auth.uid(), p_created_by ignorado).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.move_organization_node(p_child_org_id uuid, p_new_parent_org_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_child uuid;
  v_actor uuid := auth.uid();
  v_visible uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_child_org_id IS NULL OR p_new_parent_org_id IS NULL THEN
    RAISE EXCEPTION 'child_org_id and new_parent_org_id are required';
  END IF;

  IF p_child_org_id = p_new_parent_org_id THEN
    RAISE EXCEPTION 'An organization cannot be its own parent';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_child_org_id) THEN
    RAISE EXCEPTION 'Child organization does not exist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_new_parent_org_id) THEN
    RAISE EXCEPTION 'Parent organization does not exist';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.edit') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Do not trust client-supplied identity: derive actor from auth.uid().
  -- p_created_by is intentionally ignored.
  v_visible := ARRAY(SELECT public.get_user_visible_org_ids(v_actor));
  IF NOT (p_child_org_id = ANY (v_visible)) OR NOT (p_new_parent_org_id = ANY (v_visible)) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE descendants AS (
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    WHERE h.parent_org_id = p_child_org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN descendants d ON h.parent_org_id = d.child_org_id
  )
  SELECT child_org_id INTO v_existing_child
  FROM descendants
  WHERE child_org_id = p_new_parent_org_id
  LIMIT 1;

  IF v_existing_child IS NOT NULL THEN
    RAISE EXCEPTION 'Move would create a hierarchy cycle';
  END IF;

  DELETE FROM public.anew_hierarchy
  WHERE child_org_id = p_child_org_id;

  INSERT INTO public.anew_hierarchy (
    parent_org_id,
    child_org_id,
    relationship_type,
    is_primary,
    created_by
  ) VALUES (
    p_new_parent_org_id,
    p_child_org_id,
    'parent_of',
    true,
    v_actor
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlink_organization_node(p_child_org_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_child_org_id IS NULL THEN
    RAISE EXCEPTION 'child_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_child_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.edit') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Do not trust client-supplied identity: p_created_by is intentionally ignored.
  IF NOT (p_child_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.anew_hierarchy
  WHERE child_org_id = p_child_org_id;
END;
$function$;

-- =====================================================================
-- 10. bootstrap_org_creator: so chamada por funcoes SECURITY DEFINER (owner
--     postgres). Inclui PUBLIC: o ACL trazia EXECUTE a PUBLIC, por isso tirar
--     so a anon/authenticated nao bastava.
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.bootstrap_org_creator(uuid, text) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 10b. filter_visible_entity_ids (versao de 20261103030000, a unica): ramo do
--      portal para a revelacao do NIF. A edge function nif-reveal chama-a com
--      service_role e p_auth_uid explicito. Antes, o cliente via o NIF das suas
--      entidades porque can_see_entity passava pelas orgs de cliente de
--      get_user_visible_org_ids; isso acabou na secao 1.
--      O ramo vai AQUI e nao em can_see_entity de proposito: can_see_entity
--      tambem decide escritas (upsert_entity_identity), a politica de
--      anew_entities, a PII por omissao e o apagamento de dados; um ramo de
--      cliente la abria tudo isso ao portal. filter_visible_entity_ids so serve
--      a nif-reveal. Para a equipa o resultado e identico: OR com um ramo que so
--      e verdadeiro para quem tem linhas em client_portal_users.
--      Assinatura, search_path (public, pg_temp) e ACL mantidos (CREATE OR
--      REPLACE preserva o ACL: so service_role).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.filter_visible_entity_ids(
  p_entity_ids uuid[],
  p_auth_uid   uuid
)
RETURNS TABLE(entity_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_auth_uid IS NULL
     OR p_entity_ids IS NULL
     OR array_length(p_entity_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ids.entity_id
  FROM unnest(p_entity_ids) AS ids(entity_id)
  WHERE public.can_see_entity(ids.entity_id, p_auth_uid)
     OR public.portal_entity_visible_to(ids.entity_id, p_auth_uid);
END;
$$;

COMMENT ON FUNCTION public.filter_visible_entity_ids(uuid[], uuid) IS
  'Batch visibility check for anew_entities.id: can_see_entity per candidate id, plus (20261206120000) the portal branch portal_entity_visible_to for client portal users (own entity, linked org entity, entities of granted contracts/proposals). p_auth_uid is caller-supplied; the only caller is the nif-reveal Edge Function via service_role. Never grant to authenticated/anon.';

-- =====================================================================
-- 11. get_commercial_info: versao interna (dados em bruto, so para funcoes
--     definer) + versao publica com guarda.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_commercial_info_internal(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_name text;
  v_email text;
  v_phone text;
BEGIN
  SELECT u.name, COALESCE(u.entity_id, u.id)
  INTO v_name, v_entity_id
  FROM public.anew_users u
  WHERE u.id = p_user_id OR u.auth_user_id = p_user_id
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.email INTO v_email
  FROM public.anew_entity_emails e
  WHERE e.entity_id = v_entity_id AND e.is_primary = true
  LIMIT 1;

  IF v_email IS NULL THEN
    SELECT e.email INTO v_email
    FROM public.anew_entity_emails e
    WHERE e.entity_id = v_entity_id
    LIMIT 1;
  END IF;

  SELECT ep.phone_number INTO v_phone
  FROM public.anew_entity_phones ep
  WHERE ep.entity_id = v_entity_id AND ep.is_primary = true
  LIMIT 1;

  IF v_phone IS NULL THEN
    SELECT ep.phone_number INTO v_phone
    FROM public.anew_entity_phones ep
    WHERE ep.entity_id = v_entity_id
    LIMIT 1;
  END IF;

  IF v_email IS NULL THEN
    SELECT u.email INTO v_email
    FROM public.anew_users u
    WHERE u.id = p_user_id OR u.auth_user_id = p_user_id
    LIMIT 1;
  END IF;

  IF v_phone IS NULL THEN
    SELECT u.phone INTO v_phone
    FROM public.anew_users u
    WHERE u.id = p_user_id OR u.auth_user_id = p_user_id
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone);
END;
$function$;

-- Funcao nova: por omissao, PUBLIC recebe EXECUTE. Tirar a PUBLIC e aos papeis
-- do PostgREST para que so as funcoes definer (owner postgres) e o service_role
-- a possam chamar.
REVOKE EXECUTE ON FUNCTION public.get_commercial_info_internal(uuid) FROM PUBLIC, anon, authenticated;

-- Publica (decisao M2): o EXECUTE de anon mantem-se (CREATE OR REPLACE preserva
-- o ACL) porque a pagina publica de propostas (PublicProposal.tsx) a chama sem
-- sessao.
--   - SEM sessao (anon): so o comercial de uma proposta com link publico activo.
--   - COM sessao: so staff que partilha uma organizacao visivel com o alvo, ou
--     cliente do portal sobre um documento que lhe foi concedido. O ramo do
--     link publico NAO serve a utilizadores autenticados.
CREATE OR REPLACE FUNCTION public.get_commercial_info(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_uid IS NULL THEN
    -- (b) pagina publica: o alvo e o comercial de uma proposta com link publico
    IF EXISTS (
      SELECT 1
      FROM public.proposals p
      LEFT JOIN public.deals d ON d.id = p.deal_id
      WHERE p.public_link_enabled = true
        AND p.deleted_at IS NULL
        AND (p.assigned_to = p_user_id OR p.created_by = p_user_id OR d.assigned_to = p_user_id)
    ) THEN
      v_allowed := true;
    END IF;
  ELSE
    -- (a) staff que partilha uma organizacao visivel com o alvo
    IF EXISTS (
      SELECT 1
      FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id
      WHERE (u.id = p_user_id OR u.auth_user_id = p_user_id)
        AND m.status = 'active'
        AND m.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
    ) THEN
      v_allowed := true;
    END IF;

    -- (c) cliente do portal: o alvo e o comercial de um documento concedido
    IF NOT v_allowed AND EXISTS (
      SELECT 1 FROM public.client_portal_users cpu WHERE cpu.auth_user_id = v_uid
    ) THEN
      IF EXISTS (
        SELECT 1
        FROM public.proposals p
        LEFT JOIN public.deals d ON d.id = p.deal_id
        WHERE (p.assigned_to = p_user_id OR p.created_by = p_user_id OR d.assigned_to = p_user_id)
          AND p.id IN (SELECT public.portal_granted_document_ids('proposal'::public.portal_document_type))
      ) OR EXISTS (
        SELECT 1
        FROM public.client_contracts c
        WHERE (c.assigned_to = p_user_id OR c.created_by = p_user_id)
          AND c.id IN (SELECT public.portal_granted_document_ids('contract'::public.portal_document_type))
      ) OR EXISTS (
        SELECT 1
        FROM public.direct_sales s
        WHERE (s.assigned_to = p_user_id OR s.created_by = p_user_id)
          AND s.id IN (SELECT public.portal_granted_document_ids('direct_sale'::public.portal_document_type))
      ) THEN
        v_allowed := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RETURN NULL;
  END IF;

  RETURN public.get_commercial_info_internal(p_user_id);
END;
$function$;

-- get_portal_commercial (versao de 20261204180000) passa a chamar a versao
-- interna (ja corre como definer e ja restringe ao proprio cliente).
CREATE OR REPLACE FUNCTION public.get_portal_commercial(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_client_id uuid;
  v_commercial uuid;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cpu.entity_id, cpu.client_id
    INTO v_entity_id, v_client_id
  FROM public.client_portal_users cpu
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.organization_id = p_organization_id
  ORDER BY cpu.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 1. Resp. Comercial da lead
  IF v_entity_id IS NOT NULL THEN
    SELECT l.assigned_to INTO v_commercial
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id
      AND l.entity_id = v_entity_id
      AND l.deleted_at IS NULL
      AND l.assigned_to IS NOT NULL
    ORDER BY l.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 2. Comercial da ficha de cliente
  IF v_commercial IS NULL THEN
    SELECT c.assigned_to INTO v_commercial
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND c.assigned_to IS NOT NULL
      AND (c.id = v_client_id OR (v_entity_id IS NOT NULL AND c.entity_id = v_entity_id))
    ORDER BY (c.id = v_client_id) DESC, c.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 3. Comercial do documento mais recente
  IF v_commercial IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT x.assigned_to INTO v_commercial
    FROM (
      SELECT ds.assigned_to, ds.created_at
      FROM public.direct_sales ds
      WHERE ds.organization_id = p_organization_id
        AND ds.entity_id = v_entity_id
        AND ds.deleted_at IS NULL
        AND ds.assigned_to IS NOT NULL
      UNION ALL
      SELECT d.assigned_to, p.created_at
      FROM public.proposals p
      JOIN public.deals d ON d.id = p.deal_id
      WHERE p.organization_id = p_organization_id
        AND p.entity_id = v_entity_id
        AND p.deleted_at IS NULL
        AND d.assigned_to IS NOT NULL
    ) x
    ORDER BY x.created_at DESC
    LIMIT 1;
  END IF;

  IF v_commercial IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.get_commercial_info_internal(v_commercial);
END;
$function$;

-- =====================================================================
-- 12. roles / role_permissions / client_contract_templates: sem ramo por
--     ligacoes de cliente e sem joins em bruto a anew_memberships/anew_users
--     (B1). O antigo ramo "ancestors" ficou contido em get_user_visible_org_ids
--     (que ja inclui os ascendentes das organizacoes CRM directas). O ramo
--     "roles das proprias memberships" mantem-se, via get_user_own_role_ids,
--     porque useClientRole le o codigo do proprio role.
-- =====================================================================
DROP POLICY IF EXISTS anew_roles_select ON public.anew_roles;
CREATE POLICY anew_roles_select
  ON public.anew_roles FOR SELECT TO authenticated
  USING (
    is_system = true
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    OR id IN (SELECT public.get_user_own_role_ids())
  );

DROP POLICY IF EXISTS anew_role_permissions_select ON public.anew_role_permissions;
CREATE POLICY anew_role_permissions_select
  ON public.anew_role_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.anew_roles r
    WHERE r.id = anew_role_permissions.role_id
      AND (
        r.is_system = true
        OR r.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
        OR r.id IN (SELECT public.get_user_own_role_ids())
      )
  ));

DROP POLICY IF EXISTS client_templates_select ON public.client_contract_templates;
CREATE POLICY client_templates_select
  ON public.client_contract_templates FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_system_admin((SELECT auth.uid()))
    OR organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
  );

-- =====================================================================
-- 13. BLOCO DE VERIFICACAO (so catalogo). Levanta excepcao e aborta se algo
--     divergir. Nao le tabelas com RLS como authenticated.
-- =====================================================================
DO $verify$
DECLARE
  v_def text;
  v_qual text;
  v_check text;
  v_fn text;
  v_oid oid;
  v_pol record;
  v_found int;
  v_direct_read text := '(from|join)\s+(public\.)?(anew_users|anew_memberships|client_contract_templates)\M';
  v_new_policies text[][] := ARRAY[
    ARRAY['anew_memberships', 'portal_client_reads_own_membership'],
    ARRAY['anew_organizations', 'portal_client_reads_linked_org'],
    ARRAY['anew_org_addresses', 'portal_client_reads_linked_org_addresses'],
    ARRAY['organization_document_settings', 'portal_client_reads_org_doc_settings'],
    ARRAY['custom_contract_variables', 'portal_client_reads_org_custom_vars'],
    ARRAY['proposal_templates', 'portal_client_reads_org_proposal_templates'],
    ARRAY['client_contract_templates', 'portal_client_reads_org_contract_templates'],
    ARRAY['anew_entities', 'portal_client_reads_portal_entities'],
    ARRAY['anew_entity_emails', 'portal_client_reads_portal_entity_emails'],
    ARRAY['anew_entity_phones', 'portal_client_reads_portal_entity_phones'],
    ARRAY['anew_entity_addresses', 'portal_client_reads_portal_entity_addresses'],
    ARRAY['anew_entity_fiscal_entities', 'portal_client_reads_portal_fiscal_links'],
    ARRAY['fiscal_entities', 'portal_client_reads_portal_fiscal_entities'],
    ARRAY['fiscal_entities', 'authenticated_update_fiscal_entities'],
    ARRAY['proposal_rejection_reasons', 'portal_client_reads_org_rejection_reasons'],
    ARRAY['anew_addresses', 'portal_client_reads_portal_addresses'],
    ARRAY['anew_users', 'portal_client_reads_doc_commercials'],
    ARRAY['anew_roles', 'portal_client_reads_signatory_roles'],
    ARRAY['proposal_quote_selections', 'portal_client_reads_doc_pq_selections'],
    ARRAY['client_portal_users', 'Org members can insert client portal users'],
    ARRAY['client_portal_users', 'Org members can update client portal users'],
    ARRAY['client_portal_documents', 'Org members manage portal documents'],
    ARRAY['contract_sends', 'Authenticated users can view contract sends'],
    ARRAY['contract_sends', 'Authenticated users can insert contract sends'],
    ARRAY['anew_organizations', 'authenticated_insert_anew_organizations'],
    ARRAY['anew_org_associations', 'Admins can manage associations'],
    ARRAY['anew_hierarchy', 'authenticated_insert_anew_hierarchy'],
    ARRAY['anew_hierarchy', 'authenticated_update_anew_hierarchy'],
    ARRAY['anew_hierarchy', 'authenticated_delete_anew_hierarchy'],
    ARRAY['anew_roles', 'anew_roles_select'],
    ARRAY['anew_role_permissions', 'anew_role_permissions_select'],
    ARRAY['client_contract_templates', 'client_templates_select']
  ];
  i int;
BEGIN
  -- central: get_user_visible_org_ids / get_flow_user_org_ids excluem clientes
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_user_visible_org_ids';
  IF v_def IS NULL OR position('role_is_client IS NOT TRUE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY: get_user_visible_org_ids nao exclui role_is_client';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_flow_user_org_ids';
  IF v_def IS NULL OR position('role_is_client IS NOT TRUE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY: get_flow_user_org_ids nao exclui role_is_client';
  END IF;

  -- funcoes auxiliares: existem, SECURITY DEFINER, search_path fixo,
  -- sem EXECUTE para anon, com EXECUTE para authenticated
  FOREACH v_fn IN ARRAY ARRAY[
    'portal_linked_org_ids', 'portal_granted_document_ids', 'portal_contact_entity_ids',
    'portal_visible_entity_ids', 'portal_visible_user_ids', 'portal_signatory_role_ids',
    'portal_visible_address_ids', 'get_user_own_role_ids', 'current_user_has_permission_in_org',
    'user_can_self_register_first_org', 'org_is_own_unparented', 'portal_document_in_org',
    'portal_user_in_org', 'portal_visible_fiscal_entity_ids'
  ] LOOP
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'VERIFY: auxiliar % em falta, sem SECURITY DEFINER ou sem search_path', v_fn;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'VERIFY: auxiliar % executavel por anon', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'VERIFY: auxiliar % sem EXECUTE para authenticated', v_fn;
    END IF;
    v_oid := NULL;
  END LOOP;

  -- nucleos com uid: definer, search_path fixo, SEM EXECUTE para anon e authenticated
  FOREACH v_fn IN ARRAY ARRAY[
    'portal_linked_org_ids_for', 'portal_granted_document_ids_for', 'portal_contact_entity_ids_for',
    'portal_visible_entity_ids_for', 'portal_entity_visible_to'
  ] LOOP
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'VERIFY: nucleo % em falta, sem SECURITY DEFINER ou sem search_path', v_fn;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'VERIFY: nucleo % executavel por anon/authenticated (oraculo por uid)', v_fn;
    END IF;
    v_oid := NULL;
  END LOOP;

  -- filter_visible_entity_ids: ramo do portal e continua so para service_role
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'filter_visible_entity_ids';
  IF v_def IS NULL OR position('portal_entity_visible_to' IN v_def) = 0
     OR position('can_see_entity' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY: filter_visible_entity_ids sem ramo do portal';
  END IF;
  IF has_function_privilege('anon', 'public.filter_visible_entity_ids(uuid[],uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.filter_visible_entity_ids(uuid[],uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY: filter_visible_entity_ids executavel por anon/authenticated';
  END IF;

  -- bootstrap_org_creator sem EXECUTE para anon/authenticated
  IF has_function_privilege('anon', 'public.bootstrap_org_creator(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bootstrap_org_creator(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY: bootstrap_org_creator ainda executavel por anon/authenticated';
  END IF;

  -- get_commercial_info com guarda + versao interna; anon mantem EXECUTE (M2)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_commercial_info';
  IF v_def IS NULL OR position('get_commercial_info_internal' IN v_def) = 0
     OR position('v_uid IS NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY: get_commercial_info sem guarda por sessao ou sem versao interna';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_commercial_info(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY: get_commercial_info perdeu EXECUTE de anon (pagina publica)';
  END IF;
  IF has_function_privilege('anon', 'public.get_commercial_info_internal(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_commercial_info_internal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY: get_commercial_info_internal executavel por anon/authenticated';
  END IF;

  -- move/unlink exigem permissao
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'move_organization_node';
  IF v_def IS NULL OR position('has_anew_permission' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY: move_organization_node sem verificacao de permissao';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'unlink_organization_node';
  IF v_def IS NULL OR position('has_anew_permission' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY: unlink_organization_node sem verificacao de permissao';
  END IF;

  -- A2: trigger presente e em lista branca
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.client_portal_users'::regclass
                 AND tgname = 'tg_client_portal_users_guard_self_update' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'VERIFY: trigger de colunas de client_portal_users em falta';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tg_client_portal_users_guard_self_update';
  IF v_def IS NULL OR position('to_jsonb(NEW)' IN v_def) = 0
     OR position('current_user_has_permission_in_org' IN v_def) = 0
     OR position('NEW.contract_id' IN v_def) > 0 THEN
    RAISE EXCEPTION 'VERIFY: trigger de client_portal_users nao esta em lista branca por organizacao';
  END IF;

  -- A1: INSERT/UPDATE da equipa em client_portal_users por organizacao
  SELECT with_check INTO v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'client_portal_users'
     AND policyname = 'Org members can insert client portal users';
  IF v_check IS NULL OR position('get_user_crm_org_ids' IN v_check) = 0 THEN
    RAISE EXCEPTION 'VERIFY: client_portal_users INSERT sem ambito de organizacao';
  END IF;
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'client_portal_users'
     AND policyname = 'Org members can update client portal users';
  IF v_qual IS NULL OR v_check IS NULL
     OR position('get_user_crm_org_ids' IN v_qual) = 0
     OR position('get_user_crm_org_ids' IN v_check) = 0 THEN
    RAISE EXCEPTION 'VERIFY: client_portal_users UPDATE sem ambito de organizacao';
  END IF;

  -- A3: client_portal_documents ALL fora dos clientes e com documento da org
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'client_portal_documents'
     AND policyname = 'Org members manage portal documents';
  IF v_qual IS NULL OR v_check IS NULL
     OR position('get_user_crm_org_ids' IN v_qual) = 0
     OR position('portal_document_in_org' IN v_qual) = 0
     OR position('portal_document_in_org' IN v_check) = 0
     OR position('portal_user_in_org' IN v_check) = 0 THEN
    RAISE EXCEPTION 'VERIFY: client_portal_documents ALL sem ambito de organizacao do documento';
  END IF;

  -- fiscal_entities UPDATE espelha a leitura (ambito por entidade), USING e WITH CHECK
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'fiscal_entities'
     AND policyname = 'authenticated_update_fiscal_entities';
  IF v_qual IS NULL OR v_check IS NULL
     OR position('is_entity_in_user_scope' IN v_qual) = 0
     OR position('is_entity_in_user_scope' IN v_check) = 0 THEN
    RAISE EXCEPTION 'VERIFY: fiscal_entities UPDATE sem ambito por entidade';
  END IF;

  -- contract_sends SELECT por ambito (nao true)
  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'contract_sends'
     AND policyname = 'Authenticated users can view contract sends';
  IF v_qual IS NULL OR position('get_user_visible_org_ids' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'VERIFY: contract_sends SELECT nao esta por ambito';
  END IF;

  -- anew_hierarchy insert cobre child_org_id (M1: com excepcao da org propria sem pai)
  SELECT with_check INTO v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'anew_hierarchy'
     AND policyname = 'authenticated_insert_anew_hierarchy';
  IF v_check IS NULL OR position('child_org_id' IN v_check) = 0
     OR position('org_is_own_unparented' IN v_check) = 0 THEN
    RAISE EXCEPTION 'VERIFY: anew_hierarchy insert nao cobre child_org_id';
  END IF;

  -- anew_org_associations manage por ambito
  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'anew_org_associations'
     AND policyname = 'Admins can manage associations';
  IF v_qual IS NULL OR position('get_user_visible_org_ids' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'VERIFY: anew_org_associations manage sem filtro de org';
  END IF;

  -- anew_organizations insert self_registration exige ausencia de membership
  SELECT with_check INTO v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'anew_organizations'
     AND policyname = 'authenticated_insert_anew_organizations';
  IF v_check IS NULL OR position('user_can_self_register_first_org' IN v_check) = 0 THEN
    RAISE EXCEPTION 'VERIFY: anew_organizations insert self_registration sem check de membership';
  END IF;

  -- roles/role_permissions/client_templates sem ramo de clientes
  SELECT qual INTO v_qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anew_roles' AND policyname = 'anew_roles_select';
  IF v_qual IS NULL OR position('get_user_own_role_ids' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'VERIFY: anew_roles_select nao usa get_user_own_role_ids';
  END IF;
  SELECT qual INTO v_qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_contract_templates' AND policyname = 'client_templates_select';
  IF v_qual IS NULL OR position('get_user_crm_org_ids' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'VERIFY: client_templates_select nao usa get_user_crm_org_ids';
  END IF;

  -- B1: todas as politicas desta migration existem e nenhuma le directamente
  -- anew_users, anew_memberships ou client_contract_templates.
  FOR i IN 1 .. array_length(v_new_policies, 1) LOOP
    SELECT count(*) INTO v_found FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = v_new_policies[i][1]
       AND policyname = v_new_policies[i][2];
    IF v_found <> 1 THEN
      RAISE EXCEPTION 'VERIFY: politica % em % em falta', v_new_policies[i][2], v_new_policies[i][1];
    END IF;
    SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = v_new_policies[i][1]
       AND policyname = v_new_policies[i][2];
    IF coalesce(v_qual, '') ~* v_direct_read OR coalesce(v_check, '') ~* v_direct_read THEN
      RAISE EXCEPTION 'VERIFY: politica % em % le directamente anew_users/anew_memberships/client_contract_templates (risco de recursao)',
        v_new_policies[i][2], v_new_policies[i][1];
    END IF;
  END LOOP;

  RAISE NOTICE 'VERIFY OK: todas as verificacoes passaram.';
END;
$verify$;

COMMIT;
