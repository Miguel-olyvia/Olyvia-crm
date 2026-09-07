-- ============================================================================
-- O contacto (email/telefone) do cliente passa a viajar COM o documento.
--
-- POR APLICAR. Esta migracao NAO foi empurrada para o remoto quando foi
-- escrita (2026-09-07). Deve ser aplicada JUNTO com (ou logo a seguir a)
-- 20261119030000_contactos_ambito_de_dono.sql -- e essa migracao que cria a
-- necessidade desta, e o frontend que passa a chamar estas RPCs so funciona
-- depois de ambas estarem no remoto. Ordem de rollout:
--   1. db push destas migracoes (20261119030000 + esta)
--   2. deploy do frontend que chama resolve_proposal_contact/resolve_quote_contact
-- Aplicar so uma das metades deixa uma janela partida:
--   - so a 030000 sem esta + sem o frontend novo: o SEND fica sem email (o bug).
--   - so o frontend novo sem estas RPCs: PGRST202 (funcao inexistente) no SEND.
--
--
-- -- O PROBLEMA ---------------------------------------------------------------
--
-- Principio do produto: quem pode VER um documento (proposta, orcamento) e ve
-- o contacto do cliente nesse documento, pode ver o contacto -- o contacto e
-- um campo do documento, nao um segredo a parte.
--
-- Ate agora os ecras liam o documento e depois faziam uma SEGUNDA consulta
-- DIRECTA a anew_entity_emails / anew_entity_phones pelo entity_id. Com
-- 20261119030000 a apertar a RLS desses contactos ao AMBITO DE DONO (das
-- leads/clientes), uma pessoa com ambito de ORGANIZACAO nas PROPOSTAS mas
-- OWNED nas LEADS ve a proposta de um colega, mas a 2a consulta ao email e-lhe
-- NEGADA -- e o SendProposalDialog fica sem destinatario e a proposta pode nao
-- sair. E precisamente o caso do "enviar".
--
--
-- -- PORQUE NAO UM JOIN/EMBED DO POSTGREST ------------------------------------
--
-- O "caminho A" literal (trazer o contacto por relacao PostgREST a partir da
-- tabela do documento) NAO e possivel, por duas razoes independentes:
--   1. NAO existe FK anew_entities -> anew_entity_emails/phones (Relationships
--      vazios em types.ts), logo o embed nem sequer resolve.
--   2. Mesmo com FK, o PostgREST aplica a RLS da tabela EMBEBIDA. Como
--      20261119030000 apertou anew_entity_emails/phones ao ambito de dono, o
--      contacto embebido continuaria filtrado -- um join relacional NAO
--      transporta a visibilidade do documento para o contacto.
--
--
-- -- A SOLUCAO: uma RPC SECURITY DEFINER por documento -------------------------
--
-- Cada RPC (1) confirma que o CHAMADOR pode ler o documento, reproduzindo o
-- MESMO predicado da politica de SELECT da tabela do documento, e so entao
-- (2) resolve o email/telefone primarios do documento.entity_id com
-- privilegios de definer -- passando por cima da RLS de contactos APENAS
-- porque a visibilidade do documento ja foi confirmada. Assim quem ve o
-- documento ve o contacto, e a RLS dona dos contactos NAO se alarga.
--
-- Reproduzir o predicado (em vez de reusar proposals_in_scope, que e SECURITY
-- INVOKER e depende da RLS -- que uma funcao DEFINER contorna) e deliberado:
-- dentro de uma funcao DEFINER a RLS de proposals/quotes ja nao se aplica, por
-- isso o predicado tem de ser explicito. auth.uid() continua a devolver o
-- utilizador do pedido mesmo dentro do definer, por isso os helpers de ambito
-- (has_anew_permission, get_user_crm_org_ids, current_business_user_id)
-- funcionam na mesma. Se a politica de SELECT do documento mudar, estas RPCs
-- tem de acompanhar -- forward-only, por nova migracao.
--
-- Contrato: cada RPC devolve no maximo UMA linha (o documento resolve UMA
-- entidade); zero linhas se o chamador nao pode ler o documento ou se nao ha
-- entidade/contacto. Os campos sao os que os ecras ja consumiam: entity_id,
-- display_name, first_name, last_name, entity_type, email, phone_number,
-- country_code. Morada e dados fiscais NAO entram aqui de proposito -- os
-- ecras corrigidos so precisam de nome/email/telefone; os sitios que tambem
-- imprimem morada (documento de contrato, PDFs) precisam de uma RPC mais larga
-- e ficam para um passo seguinte.
-- ============================================================================


-- ── Propostas ───────────────────────────────────────────────────────────────
-- Predicado espelha a politica "Users can view proposals in their scope"
-- (20261112440000): proposals.view + org visivel OU deal na org visivel OU deal
-- do proprio (created_by/assigned_to) OU proposta criada pelo proprio.
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
  'entao resolve o contacto, passando por cima da RLS de contactos ja com a '
  'visibilidade do documento confirmada. Substitui a 2a consulta directa a '
  'anew_entity_emails/phones que a RLS de ambito de dono (20261119030000) '
  'passou a negar a quem ve a proposta mas nao e dono da lead.';

GRANT EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) TO authenticated;


-- ── Orcamentos ───────────────────────────────────────────────────────────────
-- Predicado espelha a politica "quotes_select_policy" (20261102010000):
-- quotes.view + org visivel. Resolucao da entidade: entity_id directo, senao
-- cliente_id -> anew_clients, senao deal_id -> deals, senao deal.lead_id ->
-- anew_leads (mesma cadeia do SendQuoteDialog).
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
  'negar a quem ve o orcamento mas nao e dono da lead.';

GRANT EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) TO authenticated;
