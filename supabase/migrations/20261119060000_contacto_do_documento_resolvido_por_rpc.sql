-- ============================================================================
-- O CONTACTO DO CLIENTE VIAJA COM O DOCUMENTO (proposta / orcamento)
--
-- POR APLICAR. Migracao ADITIVA: so cria/repoe duas funcoes e ajusta os seus
-- GRANTs. Nada de existente (tabelas, politicas RLS, outras funcoes) e alterado,
-- por isso e segura de aplicar isoladamente.
--
--
-- -- O PROBLEMA (medido ao vivo na org nike, 2026-09-07) ----------------------
--
-- A RLS de anew_entity_emails / anew_entity_phones / anew_entity_addresses foi
-- apertada (20261119030000) ao AMBITO DE DONO das leads/clientes: so ve o
-- contacto quem e dono da lead/cliente a que a entidade pertence.
--
-- Mas os ecras de proposta/orcamento liam o contacto por uma SEGUNDA consulta
-- DIRECTA a essas tabelas, pelo entity_id. Para quem VE a proposta mas NAO e
-- dono da lead (ex.: proposals.view=ORG, leads.view=OWNED), essa 2a consulta
-- passou a ser NEGADA -- "documento visivel, contacto oculto". Medido no
-- universo real da nike: 11 de 12 entidades distintas com email nas propostas
-- visiveis ficam sem contacto para esse utilizador; a 12a e o unico caso onde
-- por acaso coincide o dono. O caso do SEND (proposta em status 'sent') fica
-- sem email e a proposta pode nao sair. Confirmado ao vivo: como a conta de
-- teste, a proposta P-2026-0505 e visivel (1 linha) mas a consulta directa a
-- anew_entity_emails/phones pela entidade devolve 0 linhas, enquanto o admin
-- ve 1 email e 1 telefone na mesma entidade.
--
--
-- -- O PRINCIPIO (dono do produto) --------------------------------------------
--
-- Quem pode VER um documento (proposta, orcamento) pode ver os dados desse
-- documento, incluindo o contacto do cliente -- o contacto e um campo do
-- documento, nao um segredo a parte. A visibilidade e do DOCUMENTO.
--
--
-- -- PORQUE POR DOCUMENTO E NAO POR CONSULTA DIRECTA / JOIN -------------------
--
-- Nao se alarga a RLS dos contactos -- essa fica apertada como esta, ao ambito
-- de dono, para todos os outros usos (nomeadamente as PESQUISAS de contacto ao
-- CRIAR uma proposta/orcamento, onde o documento ainda nao existe e a pesquisa
-- deve continuar limitada ao ambito de quem procura). Um JOIN/embed do PostgREST
-- tambem nao serve: aplica a RLS da tabela embebida, logo o contacto continuaria
-- filtrado -- um join relacional NAO transporta a visibilidade do documento para
-- o contacto.
--
-- A resolucao passa a ser feita PELO DOCUMENTO: uma RPC SECURITY DEFINER que
-- recebe o id do documento, CONFIRMA que o chamador pode ver esse documento
-- (reimplementando o MESMO predicado da politica de SELECT do documento -- NAO
-- se confia na RLS, que o definer contorna) e so entao devolve o email/telefone
-- primarios da entidade, com privilegio de definer. Se o chamador nao pode ver
-- o documento, a funcao devolve VAZIO (0 linhas). auth.uid() continua a devolver
-- o utilizador do pedido dentro do definer, por isso os helpers de ambito
-- (has_anew_permission, get_user_crm_org_ids, current_business_user_id) avaliam
-- na mesma o ambito real de quem chama.
--
--
-- -- RELACAO COM 20261119040000 ----------------------------------------------
--
-- A 20261119040000 introduziu estas mesmas duas funcoes mas so fez
-- GRANT EXECUTE ... TO authenticated, deixando de pe o EXECUTE que o Postgres
-- concede por omissao a PUBLIC (e portanto a anon) em qualquer funcao nova.
-- Esta migracao repoe as funcoes (definicao identica, MESMA assinatura -- os
-- parametros mantem os nomes _proposal_id / _quote_id de proposito: mudar o nome
-- de um parametro faria CREATE OR REPLACE falhar com "cannot change name of
-- input parameter") e fecha essa lacuna com REVOKE EXECUTE FROM PUBLIC/anon,
-- deixando so authenticated. E idempotente e pode correr antes ou depois da
-- 040000.
--
-- Confirmado por leitura antes de escrever: no remoto NENHUMA das duas funcoes
-- existe hoje (a chamada devolve PGRST202), por isso nao ha risco de colidir com
-- uma assinatura ja aplicada.
--
--
-- -- CONTRATO -----------------------------------------------------------------
--
-- Cada RPC devolve no maximo UMA linha (o documento resolve UMA entidade); zero
-- linhas se o chamador nao pode ler o documento ou se nao ha entidade/contacto.
-- Campos: entity_id, display_name, first_name, last_name, entity_type, email,
-- phone_number, country_code -- os que os ecras corrigidos consomem. Morada e
-- dados fiscais NAO entram (os sitios que imprimem morada precisam de uma RPC
-- mais larga, num passo seguinte).
--
-- NOTA de ambito: o predicado reproduz a politica PERMISSIVE de ambito do
-- documento. NAO reproduz o ramo system_admin_support_access (acesso de suporte
-- de um system_admin), de proposito: o contacto e PII e o system_admin esta
-- sujeito ao default-deny de PII (system_admin_pii_default_deny); esta RPC nao
-- e um canal para contornar esse deny. Um membro real da org continua a obter o
-- contacto normalmente. Se a politica de SELECT do documento mudar, estas RPCs
-- tem de acompanhar -- forward-only, por nova migracao.
-- ============================================================================


-- Propostas -------------------------------------------------------------------
-- Predicado espelha a politica activa "Users can view proposals in their scope"
-- (definicao activa: 20261112440000, identica a 20260927010000):
--   proposals.view
--   AND ( org visivel do proprio utilizador
--         OR (org NULL e deal do documento em org visivel)
--         OR deal do documento criado/atribuido ao proprio
--         OR proposta criada pelo proprio ).
CREATE OR REPLACE FUNCTION public.resolve_proposal_contact(_proposal_id uuid)
RETURNS TABLE (
  entity_id    uuid,
  display_name text,
  first_name   text,
  last_name    text,
  entity_type  text,
  email        text,
  phone_number text,
  country_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH prop AS (
    SELECT p.entity_id, p.deal_id
    FROM public.proposals p
    WHERE p.id = _proposal_id
      AND public.has_anew_permission((SELECT auth.uid()), 'proposals.view')
      AND (
        (p.organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
        OR (
          p.organization_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.deals d
            WHERE d.id = p.deal_id
              AND d.organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.deals d
          WHERE d.id = p.deal_id
            AND (d.created_by = public.current_business_user_id()
                 OR d.assigned_to = public.current_business_user_id())
        )
        OR p.created_by = public.current_business_user_id()
      )
  ),
  resolved AS (
    SELECT COALESCE(
      prop.entity_id,
      (SELECT d.entity_id FROM public.deals d WHERE d.id = prop.deal_id)
    ) AS eid
    FROM prop
  )
  SELECT
    e.id AS entity_id,
    e.display_name,
    e.first_name,
    e.last_name,
    e.type::text AS entity_type,
    (SELECT em.email FROM public.anew_entity_emails em
       WHERE em.entity_id = e.id AND em.is_primary = true LIMIT 1) AS email,
    (SELECT ph.phone_number FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true LIMIT 1) AS phone_number,
    (SELECT ph.country_code FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true LIMIT 1) AS country_code
  FROM resolved r
  JOIN public.anew_entities e ON e.id = r.eid
  WHERE r.eid IS NOT NULL
$function$;

COMMENT ON FUNCTION public.resolve_proposal_contact(uuid) IS
  'Contacto primario (email/telefone) do cliente de uma proposta, resolvido '
  'PELA leitura da propria proposta. SECURITY DEFINER: confirma primeiro que o '
  'chamador pode ler a proposta (mesmo predicado da politica de SELECT) e so '
  'entao resolve o contacto, com a visibilidade do documento ja confirmada. '
  'Substitui a 2a consulta directa a anew_entity_emails/phones que a RLS de '
  'ambito de dono (20261119030000) passou a negar a quem ve a proposta mas nao '
  'e dono da lead. EXECUTE so a authenticated (anon revogado).';

REVOKE EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) TO authenticated;


-- Orcamentos ------------------------------------------------------------------
-- Predicado espelha a politica activa "quotes_select_policy" (20261102010000):
--   org visivel do proprio utilizador AND quotes.view.
-- Resolucao da entidade (mesma cadeia do SendQuoteDialog): entity_id directo,
-- senao cliente_id -> anew_clients, senao deal_id -> deals, senao a lead do deal.
CREATE OR REPLACE FUNCTION public.resolve_quote_contact(_quote_id uuid)
RETURNS TABLE (
  entity_id    uuid,
  display_name text,
  first_name   text,
  last_name    text,
  entity_type  text,
  email        text,
  phone_number text,
  country_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT qt.entity_id, qt.cliente_id, qt.deal_id
    FROM public.quotes qt
    WHERE qt.id = _quote_id
      AND public.has_anew_permission((SELECT auth.uid()), 'quotes.view')
      AND qt.organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
  ),
  resolved AS (
    SELECT COALESCE(
      q.entity_id,
      (SELECT c.entity_id FROM public.anew_clients c WHERE c.id = q.cliente_id),
      (SELECT d.entity_id FROM public.deals d WHERE d.id = q.deal_id),
      (SELECT al.entity_id FROM public.anew_leads al
         WHERE al.id = (SELECT d2.lead_id FROM public.deals d2 WHERE d2.id = q.deal_id))
    ) AS eid
    FROM q
  )
  SELECT
    e.id AS entity_id,
    e.display_name,
    e.first_name,
    e.last_name,
    e.type::text AS entity_type,
    (SELECT em.email FROM public.anew_entity_emails em
       WHERE em.entity_id = e.id AND em.is_primary = true LIMIT 1) AS email,
    (SELECT ph.phone_number FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true LIMIT 1) AS phone_number,
    (SELECT ph.country_code FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true LIMIT 1) AS country_code
  FROM resolved r
  JOIN public.anew_entities e ON e.id = r.eid
  WHERE r.eid IS NOT NULL
$function$;

COMMENT ON FUNCTION public.resolve_quote_contact(uuid) IS
  'Contacto primario (email/telefone) do cliente de um orcamento, resolvido '
  'PELA leitura do proprio orcamento. SECURITY DEFINER: confirma primeiro que '
  'o chamador pode ler o orcamento (mesmo predicado da politica de SELECT) e '
  'so entao resolve o contacto. Substitui a 2a consulta directa a '
  'anew_entity_emails que a RLS de ambito de dono (20261119030000) passou a '
  'negar a quem ve o orcamento mas nao e dono da lead. EXECUTE so a '
  'authenticated (anon revogado).';

REVOKE EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) TO authenticated;
