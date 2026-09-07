-- ============================================================================
-- Contactos das fichas: email, telefone e morada passam a respeitar o ambito
-- de dono, e nao so a organizacao.
--
-- POR APLICAR. Esta migracao NAO foi empurrada para o remoto quando foi
-- escrita (2026-09-07). Ler a seccao "ANTES DO db push", no fim do ficheiro,
-- antes de a aplicar. E a "segunda migracao" que o cabecalho de
-- 20261118030000 prometeu para fechar o buraco dos contactos.
--
--
-- -- A FUGA (medida ao vivo, 2026-09-07) --------------------------------------
--
-- As fichas (anew_leads) ja estavam fechadas por ambito desde 18/11: a conta
-- teste-scope-membro (ambito OWNED, dona de 9 leads na nike
-- b6ffce4f-f630-4933-833a-008649757a33) ve mesmo so as suas 9 leads. Mas os
-- CONTACTOS dessas fichas continuavam abertos a organizacao inteira. Contado
-- pela API directa do PostgREST, com o token dessa conta:
--
--     anew_entity_emails      256 visiveis   ->  9 sao das suas fichas
--                                                247 sao de leads de colegas
--     anew_entity_phones      187 visiveis
--     anew_entity_addresses    35 visiveis
--     anew_addresses           22 visiveis
--
-- Ou seja: o comercial nao via a ficha da lead do colega, mas via o email e o
-- telefone dela. 247 dos 256 emails (96%) eram fuga pura. Confirmado tambem
-- que dos 247, ZERO sao clientes e ZERO tem linha em anew_contacts (a tabela
-- anew_contacts esta hoje vazia, resto do merge de 20261110080000): a fuga vem
-- toda pelo ramo lead org-only de is_entity_in_user_scope.
--
--
-- -- A CAUSA ------------------------------------------------------------------
--
-- As politicas de SELECT/UPDATE/DELETE de anew_entity_emails,
-- anew_entity_phones, anew_entity_addresses e anew_addresses assentavam em
-- is_entity_in_user_scope(entity_id, auth.uid()) -- uma funcao SECURITY
-- DEFINER que da acesso a entidade se QUALQUER lead/cliente/contacto/
-- organizacao com aquele entity_id estiver numa organizacao VISIVEL. E
-- granularidade so de ORGANIZACAO, ZERO ambito de dono. Sendo SECURITY
-- DEFINER, a correccao das leads de 18/11 nao a estreitou.
--
--
-- -- A REGRA NOVA -------------------------------------------------------------
--
-- Um contacto passa a ser visivel se ALGUMA ficha -- lead OU cliente -- ligada
-- aquele entity_id estiver dentro do ambito de DONO da pessoa (org:*,
-- org:assigned_to ou org:created_by), exactamente como as proprias tabelas
-- anew_leads/anew_clients ja filtram desde 20261118030000. Nao e "todas as
-- fichas" nem "a organizacao": basta UMA ficha no meu ambito. Isto e
-- deliberado e obrigatorio -- na nike ha entidades que sao lead E cliente ao
-- mesmo tempo, e leads da mesma entidade com donos diferentes; exigir "todas"
-- esconderia contactos legitimos.
--
-- O que se MANTEM aberto de proposito, porque nao e a fuga e ha codigo
-- legitimo a depender disso (cabecalhos de propostas, contratos, org chart,
-- ecrans de membros):
--   - CABECALHOS DE ORGANIZACAO: se o entity_id e o de uma organizacao
--     visivel (anew_organizations.entity_id), o contacto continua visivel.
--     Comportamento igual ao de hoje (get_user_visible_org_ids).
--   - ENTIDADES QUE O PROPRIO CRIOU: o ramo do criador de
--     is_entity_in_user_scope mantem-se palavra por palavra.
--   - MORADAS DE ORGANIZACAO em anew_addresses (via anew_org_addresses):
--     ramo separado, inalterado.
-- O ramo anew_contacts (org-only) e o unico que se ABANDONA, e so porque a
-- tabela esta vazia -- confirmado ao vivo, 0 linhas. Fica assinalado como
-- lacuna assumida: se um dia anew_contacts voltar a ter linhas com dono
-- proprio, essa via de contacto tera de reentrar por ambito, nao org-only.
--
--
-- -- PORQUE UMA VEZ POR CONSULTA, E NAO POR LINHA -----------------------------
--
-- O caro nao e olhar para a linha do contacto -- e RESOLVER o ambito
-- (percorrer as organizacoes do utilizador e chamar resolve_lead_access_context
-- em cada uma). Esse trabalho fica em crm_scope_keys('leads.view') e
-- crm_scope_keys('clients.view'), cada uma chamada dentro de um "(SELECT ...)".
-- Sendo subqueries escalares SEM correlacao (so recebem o codigo de permissao,
-- constante), o PostgreSQL anexa-as como InitPlan no topo do plano: executam
-- UMA vez por consulta, guardam o text[] num Param, e todas as linhas leem o
-- Param ja calculado. E o mesmo idioma de get_user_crm_org_ids((SELECT
-- auth.uid())) usado centenas de vezes no repositorio, e o mesmo padrao de
-- 20261118030000.
--
-- O que SOBRA por linha e so a resolucao entidade->ficha, que e inevitavel:
-- os contactos nao trazem organization_id/assigned_to/created_by na sua
-- propria linha (so entity_id), logo tem sempre de saltar para anew_leads/
-- anew_clients por entity_id. Esse salto ja existia hoje dentro de
-- is_entity_in_user_scope e esta indexado (idx_anew_entity_emails_entity_id,
-- idx_anew_entity_phones_entity_id, idx_anew_entity_addresses_entity_id e as
-- FKs entity_id em anew_leads/anew_clients). Por linha fica so um EXISTS
-- indexado mais um teste de pertenca a um array pequeno. NAO se faz hoisting
-- disto para InitPlan porque depende do entity_id da linha -- e por isso a
-- funcao is_entity_contact_in_owner_scope recebe as CHAVES ja resolvidas como
-- argumento, e nunca resolve ambito por dentro.
--
-- HONESTIDADE: os tempos nao foram medidos com EXPLAIN ANALYZE (sem
-- service_role nesta maquina, base local proibida). O raciocinio e que o custo
-- por linha e igual ou menor do que o de hoje (mesma travessia indexada por
-- entity_id, menos a resolucao de get_user_visible_org_ids que passa a correr
-- so nos ramos organizacao/criador). A medicao decisiva esta no plano de
-- verificacao no fim do ficheiro.
--
--
-- -- ALCANCE: SELECT, UPDATE e DELETE (as tres, nao so a leitura) -------------
--
-- O erro que se repete neste projecto e fechar a leitura e esquecer a escrita.
-- Aqui fecham-se as tres operacoes das quatro tabelas: SELECT com o codigo
-- .view, UPDATE com .edit, DELETE com .delete -- em paralelo com o que
-- 20261118030000 fez as leads/clientes. O INSERT (WITH CHECK) fica INTACTO,
-- de proposito: nao entra no ambito desta correccao e mexer nele arriscava
-- partir a criacao de contactos. Como o entity_id de um contacto nao muda num
-- UPDATE, o WITH CHECK derivado do USING nao cria problema de reatribuicao (ao
-- contrario das leads, onde o assigned_to muda -- por isso la o WITH CHECK
-- ficou de fora e aqui nao e preciso trata-lo em separado).
--
--
-- -- AS RPCs E EDGE FUNCTIONS NAO PAGAM ISTO ----------------------------------
--
-- Tudo o que resolve contactos por SECURITY DEFINER (get_entity_contact_summary
-- e afins) ou por service_role (Edge Functions) continua a contornar o RLS.
-- O que passa a filtrar e a leitura directa das tabelas de contacto -- que e
-- exactamente a via da fuga.
--
--
-- -- COMO SE REVERTE ----------------------------------------------------------
--
-- A reversao ja esta escrita, ao lado deste ficheiro, e tambem por aplicar:
--
--     supabase/migrations/20261119040000_reverter_ambito_contactos.sql
--
-- Repoe as doze politicas no texto anterior (20261112520000 para os SELECT de
-- email/telefone, baseline 20260615130000 para o resto), por migracao para a
-- frente, nunca por edicao desta. NAO apaga is_entity_contact_in_owner_scope:
-- fica orfa e inofensiva (STABLE, nao escreve nada), e mante-la evita ter de a
-- recriar para voltar a tentar. Gatilho: se alguma conta com ambito ORG deixar
-- de ver contactos que via antes (seria bug, nao aperto), ou se um ecra
-- legitimo de proposta/contrato/org chart ficar sem contacto por causa disto.
-- ============================================================================


-- -- 1. A funcao: ambito de dono para os contactos, mesmo motor das leads -----
-- Recebe as chaves org:dono JA RESOLVIDAS (uma vez por consulta, via InitPlan
-- no chamador) e so faz o salto indexado entidade->ficha por linha. NAO
-- resolve ambito por dentro, de proposito. SECURITY DEFINER: os EXISTS
-- internos leem anew_leads/anew_clients/anew_organizations/anew_entities com
-- privilegio elevado, contornando o RLS dessas tabelas (evita recursao entre
-- politicas e resultados dependentes de permissao no meio da avaliacao).
CREATE OR REPLACE FUNCTION public.is_entity_contact_in_owner_scope(
  _entity_id         uuid,
  _lead_scope_keys   text[],
  _client_scope_keys text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_visible  uuid[];
BEGIN
  IF _entity_id IS NULL OR v_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Ramo LEAD, agora com ambito de dono (org:*, org:assigned_to, org:created_by).
  IF _lead_scope_keys IS NOT NULL AND array_length(_lead_scope_keys, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = _entity_id
        AND (
             (l.organization_id::text || ':*') = ANY (_lead_scope_keys)
          OR (l.organization_id::text || ':' || l.assigned_to::text) = ANY (_lead_scope_keys)
          OR (l.organization_id::text || ':' || l.created_by::text) = ANY (_lead_scope_keys)
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Ramo CLIENTE, tambem com ambito de dono.
  IF _client_scope_keys IS NOT NULL AND array_length(_client_scope_keys, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.anew_clients cl
      WHERE cl.entity_id = _entity_id
        AND (
             (cl.organization_id::text || ':*') = ANY (_client_scope_keys)
          OR (cl.organization_id::text || ':' || cl.assigned_to::text) = ANY (_client_scope_keys)
          OR (cl.organization_id::text || ':' || cl.created_by::text) = ANY (_client_scope_keys)
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Ramo ORGANIZACAO: cabecalhos de organizacao. Inalterado face a
  -- is_entity_in_user_scope (get_user_visible_org_ids) -- nao e a fuga, e
  -- visibilidade de organizacao, igual para toda a gente da organizacao.
  SELECT ARRAY(SELECT public.get_user_visible_org_ids(v_auth_uid))
  INTO v_visible;

  IF EXISTS (
    SELECT 1
    FROM public.anew_organizations o
    WHERE o.entity_id = _entity_id
      AND o.id = ANY (COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  -- Ramo CRIADOR: entidades que o proprio criou. Mantido palavra por palavra
  -- de is_entity_in_user_scope (inclui o e.created_by = v_auth_uid que quase
  -- nunca acerta e o join a anew_users que e o que cobre o caso real).
  IF EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = _entity_id
      AND (
        e.created_by = v_auth_uid
        OR EXISTS (
          SELECT 1 FROM public.anew_users au
          WHERE au.auth_user_id = v_auth_uid
            AND e.created_by = au.id
        )
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

COMMENT ON FUNCTION public.is_entity_contact_in_owner_scope(uuid, text[], text[]) IS
  'Um contacto (email/telefone/morada) e visivel se ALGUMA lead OU cliente do entity_id estiver no ambito de dono do utilizador (chaves org:dono recebidas ja resolvidas), ou se o entity_id for de uma organizacao visivel ou de uma entidade que o proprio criou. Recebe as chaves como argumento, de proposito: quem chama resolve-as uma vez por consulta num SELECT escalar sobre as chaves (InitPlan); esta funcao so faz o salto indexado entidade->ficha por linha. Fecha a fuga org-only dos contactos, que dava acesso sem ambito de dono (247 de 256 emails de fuga medidos na nike, 2026-09-07).';

REVOKE ALL ON FUNCTION public.is_entity_contact_in_owner_scope(uuid, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_entity_contact_in_owner_scope(uuid, text[], text[]) TO authenticated, service_role;


-- -- 2. anew_entity_emails ----------------------------------------------------
ALTER POLICY authenticated_select_anew_entity_emails ON public.anew_entity_emails
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.view'::text)),
      (SELECT public.crm_scope_keys('clients.view'::text))
    )
  );

ALTER POLICY authenticated_update_anew_entity_emails ON public.anew_entity_emails
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.edit'::text)),
      (SELECT public.crm_scope_keys('clients.edit'::text))
    )
  );

ALTER POLICY authenticated_delete_anew_entity_emails ON public.anew_entity_emails
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.delete'::text)),
      (SELECT public.crm_scope_keys('clients.delete'::text))
    )
  );

COMMENT ON POLICY authenticated_select_anew_entity_emails ON public.anew_entity_emails IS
  'Email visivel se ALGUMA lead/cliente do entity_id estiver no ambito de dono (via is_entity_contact_in_owner_scope, ambito resolvido uma vez por consulta), ou se for cabecalho de organizacao/entidade propria. Antes desta politica um comercial OWNED via 256 emails da organizacao (247 de leads de colegas), medido na nike a 2026-09-07.';


-- -- 3. anew_entity_phones ----------------------------------------------------
ALTER POLICY authenticated_select_anew_entity_phones ON public.anew_entity_phones
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.view'::text)),
      (SELECT public.crm_scope_keys('clients.view'::text))
    )
  );

ALTER POLICY authenticated_update_anew_entity_phones ON public.anew_entity_phones
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.edit'::text)),
      (SELECT public.crm_scope_keys('clients.edit'::text))
    )
  );

ALTER POLICY authenticated_delete_anew_entity_phones ON public.anew_entity_phones
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.delete'::text)),
      (SELECT public.crm_scope_keys('clients.delete'::text))
    )
  );


-- -- 4. anew_entity_addresses -------------------------------------------------
ALTER POLICY authenticated_select_anew_entity_addresses ON public.anew_entity_addresses
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.view'::text)),
      (SELECT public.crm_scope_keys('clients.view'::text))
    )
  );

ALTER POLICY authenticated_update_anew_entity_addresses ON public.anew_entity_addresses
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.edit'::text)),
      (SELECT public.crm_scope_keys('clients.edit'::text))
    )
  );

ALTER POLICY authenticated_delete_anew_entity_addresses ON public.anew_entity_addresses
  USING (
    public.is_entity_contact_in_owner_scope(
      entity_id,
      (SELECT public.crm_scope_keys('leads.delete'::text)),
      (SELECT public.crm_scope_keys('clients.delete'::text))
    )
  );


-- -- 5. anew_addresses --------------------------------------------------------
-- A morada da entidade passa pelo ambito de dono; a morada de organizacao
-- (anew_org_addresses) fica no ramo separado inalterado.
ALTER POLICY authenticated_select_anew_addresses ON public.anew_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea
      WHERE ea.address_id = anew_addresses.id
        AND public.is_entity_contact_in_owner_scope(
              ea.entity_id,
              (SELECT public.crm_scope_keys('leads.view'::text)),
              (SELECT public.crm_scope_keys('clients.view'::text))
            )
    )
    OR EXISTS (
      SELECT 1 FROM public.anew_org_addresses oa
      WHERE oa.address_id = anew_addresses.id
        AND oa.org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

ALTER POLICY authenticated_update_anew_addresses ON public.anew_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea
      WHERE ea.address_id = anew_addresses.id
        AND public.is_entity_contact_in_owner_scope(
              ea.entity_id,
              (SELECT public.crm_scope_keys('leads.edit'::text)),
              (SELECT public.crm_scope_keys('clients.edit'::text))
            )
    )
    OR EXISTS (
      SELECT 1 FROM public.anew_org_addresses oa
      WHERE oa.address_id = anew_addresses.id
        AND oa.org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

ALTER POLICY authenticated_delete_anew_addresses ON public.anew_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea
      WHERE ea.address_id = anew_addresses.id
        AND public.is_entity_contact_in_owner_scope(
              ea.entity_id,
              (SELECT public.crm_scope_keys('leads.delete'::text)),
              (SELECT public.crm_scope_keys('clients.delete'::text))
            )
    )
    OR EXISTS (
      SELECT 1 FROM public.anew_org_addresses oa
      WHERE oa.address_id = anew_addresses.id
        AND oa.org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );


-- ============================================================================
-- ANTES DO db push (por esta ordem, nenhum passo e opcional):
--
-- 1. Confirmar por introspeccao (pg_policies) que as doze politicas no remoto
--    tem mesmo o texto anterior e que nao existe nenhuma OUTRA politica
--    PERMISSIVA de SELECT/UPDATE/DELETE nestas quatro tabelas -- permissivas
--    somam-se por OR e uma que nao esteja no repositorio anularia o aperto sem
--    dar erro. O CLAUDE.md avisa que ja houve sete migrations sem ficheiro.
-- 2. Correr, contra o remoto AINDA POR CORRIGIR, o teste que demonstra a
--    falha: teste-scope-membro conta 256 emails, 187 telefones, 35
--    entity_addresses e 22 addresses na nike, dos quais 247 emails sao de
--    leads de colegas. E agora que se colhe o vermelho -- depois do push a
--    oportunidade passou e NAO se volta atras para o demonstrar.
-- 3. db push. Repetir 2. Esperado: o membro deixa de ver os 247 emails de
--    colegas e fica com os das suas fichas (mais cabecalhos de organizacao e
--    entidades que criou); o admin (ORG) continua a ver tudo o que via.
-- 4. A mao, no browser: uma conta com quotes.view/proposals ORG mas leads.view
--    OWNED a abrir um orcamento/proposta cuja lead e de outro comercial. Varios
--    sitios fazem .maybeSingle() sobre o contacto e nao distinguem "nao existe"
--    de "nao posso ver" -- o documento pode ficar sem email/telefone EM
--    SILENCIO. Se isso acontecer e for indesejado, e decisao de produto se o
--    contacto deve reaparecer para quem ve o documento por quotes.view ORG.
-- 5. Confirmar que os cabecalhos de organizacao e de utilizador (org chart,
--    ecrans de membros, PDF de contratos) continuam com contacto -- dependem
--    dos ramos organizacao/criador, que esta migracao preservou.
-- ============================================================================
