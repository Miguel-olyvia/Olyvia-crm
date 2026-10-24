-- ============================================================
-- 20261228100000_entidade_unica_preparar
-- ============================================================
-- Alvo: SO a base de RH (uetjghdkwbywbftedtth). Etapas 1 (preparar) e 2
-- (copiar) da entidade unica: anew_entities passa a ter a organizacao, o
-- contacto, o fiscal, o "cliente desde", a origem, a campanha e a atividade.
-- Especificacao: vault/ficheiros/crm/nova-base/entidade-unica-antes-e-depois.html
--
-- O que faz, por ordem
--   1. Acrescenta 26 colunas a anew_entities (todas anulaveis; locale nasce
--      'pt' e extra nasce '{}'), com as FKs de assigned_to, deleted_by
--      (anew_users), origin_id (lead_sources) e campaign_id (campaigns), todas
--      ON DELETE SET NULL, e as validacoes de preferred_contact, nif_last3,
--      billing_nif_last3 e email/telefone nao vazios.
--   2. Copia os dados que ja existem (idempotente: so preenche o que esta
--      vazio). Organizacao: ligacao principal > cliente > lead > papel >
--      organizacao cuja entidade e esta > utilizador com UMA so organizacao.
--      Depois, sempre dentro da organizacao escolhida: soft delete (so quando
--      todas as leads e clientes estao apagados), cliente desde, email e
--      telefone principais, fiscal (nome, NIF cifrado, hash, ultimos 3),
--      responsavel, origem (id, ou o texto da lead procurado pelo nome em
--      lead_sources), campanha, notas, idioma, extra (custom_fields do
--      cliente), legacy_lead_id, legacy_client_id e last_activity_at.
--   3. GUARDA: aborta se alguma entidade ficar sem organization_id. Depois:
--      FK organization_id -> anew_organizations (ON DELETE RESTRICT), UNIQUE
--      (id, organization_id), unicos (org, lower(email)), (org, ultimos 9
--      digitos do telefone) e (org, nif_hash) so quando ha valor E a entidade
--      nao esta apagada (deleted_at IS NULL; cada um com uma guarda de
--      repetidos antes, com o mesmo predicado), e indices de procura.
--   4. Trigger em entity_interactions (search_path vazio) que mantem
--      anew_entities.last_activity_at = interacao mais recente; e trigger em
--      anew_entity_org_links que preenche organization_id de uma entidade
--      nova quando lhe criam a ligacao (o codigo de hoje ainda cria a
--      entidade sem organizacao e liga-a a seguir).
--      E fn_generic_entity_audit (trigger de auditoria de 47 tabelas,
--      anew_entities incluida) passa a retirar do que grava em
--      entity_audit_log (full_record e changed_fields):
--        - em TODAS as tabelas, nif_encrypted, nif_hash e
--          billing_nif_encrypted (como antes da revisao; no-op onde nao
--          existem);
--        - SO nas linhas de anew_entities, todas as 22 colunas sem leitura
--          para authenticated (as 3 fiscais cifradas + as 19 retidas do
--          passo 5). Nas outras 46 tabelas, colunas com o mesmo nome (email,
--          notes, assigned_to...) continuam a ser auditadas como hoje.
--      Motivo: com organization_id em todas as linhas, todo INSERT/UPDATE/
--      DELETE de anew_entities passa a ser auditado, e o log e lido por
--      membros com outras permissoes (timeline de leads, contactos,
--      clientes), o que furava a mascara por coluna. Consequencia aceite:
--      uma alteracao SO a colunas retidas de anew_entities nao gera linha de
--      log ate essas colunas terem leitura (migration do codigo novo). Corpo
--      copiado da versao em vigor na RH (lida no catalogo).
--      E as duas funcoes de trigger anew_entity_emails_sync_entities_search_
--      text_trigger e anew_entity_phones_sync_entities_search_text_trigger
--      (SECURITY INVOKER, de 20261113150000) sao recriadas a ler SO
--      display_name, first_name e last_name: liam a linha inteira (SELECT *
--      INTO %ROWTYPE) e, com a leitura por coluna, todo INSERT/UPDATE/DELETE
--      de emails e telefones feito por um utilizador dava permission denied.
--      Mesmo comportamento, mesmo search_path vazio, mesmo dono e EXECUTE
--      (CREATE OR REPLACE). Procura feita no catalogo da RH (prosrc das 58
--      funcoes que referem anew_entities, 14 SECURITY INVOKER; as 44 DEFINER
--      sao do postgres; pg_get_viewdef das 2 vistas, ambas so display_name):
--      foram as unicas com SELECT * / %ROWTYPE / to_jsonb / row_to_json /
--      alias.* / RETURNING * sobre anew_entities. Os triggers na propria
--      anew_entities usam NEW/OLD, que nao passam pela mascara.
--      A copia do passo 2 corre com app.audit_bypass = 'on' (SET LOCAL),
--      para nao escrever linhas de ruido no log.
--   5. Acesso: as 7 politicas existentes ficam intactas. Acrescenta a regra
--      por organization_id da spec (membros da organizacao com permissao de
--      pessoas/leads/clientes, que e o que exclui o tecnico nesta base):
--        - SELECT e INSERT: politica permissiva nova (nunca mais larga do que
--          as que ja existem: a de leitura equivale ao ramo de
--          anew_entity_org_links, a de escrita e mais estreita que a atual);
--        - INSERT, UPDATE e DELETE: politica RESTRITIVA "a organizacao da
--          entidade tem de ser uma das que o utilizador ve" (com NULL aceite
--          durante a transicao). So estreita.
--      Privilegios: retira tudo a anon e authenticated e volta a dar por
--      coluna. anon so le as 10 colunas antigas (as propostas publicas) e
--      nada das novas. authenticated le as 10 antigas e SO 4 novas, sem dado
--      pessoal nem interno: organization_id, client_since, locale,
--      deleted_at. Mantem INSERT, UPDATE e DELETE. Sai o TRUNCATE de ambos.
--      FICAM SEM LEITURA para authenticated, por agora (19 colunas): email,
--      phone, preferred_contact, preferred_time, fiscal_name, billing_email,
--      nif_last3, billing_nif_last3, assigned_to, origin_id, campaign_id,
--      referred_by, gdpr_consented_at, last_activity_at, notes, extra,
--      deleted_by, legacy_lead_id, legacy_client_id. Motivo: as politicas de leitura antigas continuam
--      permissivas e deixam ler a linha a quem nao tem permissao de
--      pessoas/leads/clientes (ramo anew_entity_org_links = qualquer membro
--      da organizacao, o tecnico incluido; created_by; can_see_entity; e
--      portal_client_reads_portal_entities = utilizadores do portal de
--      cliente). Uma politica nova permissiva nao estreita as antigas, por
--      isso conceder estas colunas dava-lhes notas internas, contactos e
--      responsavel. A concessao entra na migration do codigo novo, junto com
--      o estreitamento das politicas antigas.
--      E as 3 colunas fiscais cifradas (nif_encrypted, nif_hash,
--      billing_nif_encrypted) nunca sao concedidas: leitura so por RPC com
--      permissao, a fazer.
--   6. CONFERIR no fim: falha se faltar alguma peca.
--
-- O que NAO faz
--   - Nao apaga nem altera nenhuma coluna, tabela ou politica existente, e
--     nenhuma funcao alem de fn_generic_entity_audit e das duas funcoes de
--     search_text de emails/telefones (passo 4; mesma
--     assinatura, dono, SECURITY DEFINER, search_path e EXECUTE, que o
--     CREATE OR REPLACE preserva) (status, leads, clientes, papeis, ligacoes, emails,
--     telefones e fiscal ficam como estao). Nao cria tags, status nem
--     qualificacao. Nao mexe em form_submissions, negocios nem moradas.
--   - NAO poe NOT NULL em organization_id. Motivo: o codigo de hoje cria
--     entidades sem organizacao e so depois as liga (useEntityIdentity.ts:409,
--     execute-workflow/index.ts:488, create_entity_with_contacts_and_roles,
--     create_lead_entity_for_org, ensure_organization_entity_identity).
--     Com NOT NULL, criar uma pessoa partia no instante do push. O NOT NULL
--     entra na migration que acompanhar o codigo novo. A guarda do passo 3
--     garante na mesma que as linhas existentes ficam todas com organizacao.
--   - Nao mantem email/phone/fiscal sincronizados com anew_entity_emails,
--     _phones e fiscal_entities: sao copia do momento. Quem passar a ler as
--     colunas novas tem de passar tambem a escrever nelas (etapa 3/4).
--   - Nao da UPDATE/DELETE permissivo por organizacao: hoje as 6 entidades
--     ligadas so por anew_entity_org_links so podem ser editadas pelo
--     criador (is_entity_in_user_scope nao le as ligacoes); dar a todos os
--     membros abriria acesso. Fica para a etapa do codigo, por decisao.
--
-- PRECISA DE CODIGO NOVO (entrar junto com o push)
--   src/pages/AnewClients.tsx:1623 pede anew_entities!anew_clients_entity_id_fkey(*):
--   com a leitura por coluna, "*" inclui as colunas fiscais negadas e o
--   pedido falha. Trocar o (*) pela lista de colunas antes ou junto do push.
--   Nenhum outro "select *" a anew_entities como utilizador foi encontrado.
--   E nenhum codigo pode ainda ler, como utilizador, as 19 colunas que
--   ficam sem leitura (email, phone, notes, extra, assigned_to, origin_id,
--   campaign_id, last_activity_at, fiscal...): o pedido falha. Isto inclui
--   insert/update com .select() sem lista de colunas (RETURNING *). A
--   leitura delas entra com a migration do codigo novo.
--
-- RISCOS RESIDUAIS (conhecidos, NAO corrigidos aqui)
--   - authenticated mantem INSERT e UPDATE de tabela inteira: pode escrever
--     as colunas que nao le (notas, responsavel, NIF cifrado/hash...),
--     sujeito as politicas. Estreita-se por coluna na migration do codigo
--     novo, quando se souber que colunas o codigo escreve.
--   - Apagamento RGPD: execute_entity_erasure (RH, lida no catalogo) NAO
--     toca em entity_audit_log, nem no modo apagar nem no anonimizar; as
--     linhas antigas do log com dados da pessoa (de anew_entities e das
--     tabelas de emails/telefones/moradas, auditadas com full_record)
--     ficam. E no modo anonimizar so limpa display_name, first_name e
--     last_name: as colunas novas copiadas aqui (email, phone, fiscal_name,
--     nif_*, billing_*, notes, extra, referred_by...) ficam na linha. Tem de
--     ser corrigido antes de anew_entities passar a ser a fonte de verdade.
--
-- Estado da RH lido antes (catalogo, so leitura): 8 entidades (6 com
-- ligacao a nike; a entidade da propria organizacao nike; e o utilizador
-- Miguel tester, com uma so organizacao), 0 leads, 0 clientes, 0 papeis,
-- 6 emails, 0 telefones, 0 fiscais, 0 interacoes, 0 repetidos.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ------------------------------------------------------------
-- 1. Colunas novas
-- ------------------------------------------------------------
ALTER TABLE public.anew_entities
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS client_since date,
  ADD COLUMN IF NOT EXISTS email text
    CONSTRAINT anew_entities_email_not_blank CHECK (email IS NULL OR btrim(email) <> ''),
  ADD COLUMN IF NOT EXISTS phone text
    CONSTRAINT anew_entities_phone_not_blank CHECK (phone IS NULL OR btrim(phone) <> ''),
  ADD COLUMN IF NOT EXISTS preferred_contact text
    CONSTRAINT anew_entities_preferred_contact_check
      CHECK (preferred_contact IS NULL OR preferred_contact IN ('telefone', 'email', 'whatsapp', 'sms')),
  ADD COLUMN IF NOT EXISTS preferred_time text,
  ADD COLUMN IF NOT EXISTS locale text DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS fiscal_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS nif_encrypted text,
  ADD COLUMN IF NOT EXISTS nif_hash text,
  ADD COLUMN IF NOT EXISTS nif_last3 text
    CONSTRAINT anew_entities_nif_last3_check CHECK (nif_last3 IS NULL OR nif_last3 ~ '^[0-9]{3}$'),
  ADD COLUMN IF NOT EXISTS billing_nif_encrypted text,
  ADD COLUMN IF NOT EXISTS billing_nif_last3 text
    CONSTRAINT anew_entities_billing_nif_last3_check CHECK (billing_nif_last3 IS NULL OR billing_nif_last3 ~ '^[0-9]{3}$'),
  ADD COLUMN IF NOT EXISTS assigned_to uuid
    CONSTRAINT anew_entities_assigned_to_fkey REFERENCES public.anew_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_id uuid
    CONSTRAINT anew_entities_origin_id_fkey REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id uuid
    CONSTRAINT anew_entities_campaign_id_fkey REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_by text,
  ADD COLUMN IF NOT EXISTS gdpr_consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS extra jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid
    CONSTRAINT anew_entities_deleted_by_fkey REFERENCES public.anew_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_lead_id uuid,
  ADD COLUMN IF NOT EXISTS legacy_client_id uuid;

COMMENT ON COLUMN public.anew_entities.organization_id IS 'Organizacao da entidade (uma entidade por organizacao). Substitui anew_entity_org_links.';
COMMENT ON COLUMN public.anew_entities.client_since IS 'Vazio = lead; preenchido = cliente desde esta data. Substitui anew_leads/anew_clients/anew_entity_roles.';
COMMENT ON COLUMN public.anew_entities.origin_id IS 'Origem do primeiro contacto (lead_sources). Cada entrada fica na submissao.';
COMMENT ON COLUMN public.anew_entities.campaign_id IS 'Campanha do primeiro contacto. Cada entrada fica na submissao.';
COMMENT ON COLUMN public.anew_entities.nif_encrypted IS 'NIF cifrado. Sem leitura direta para authenticated; ler por RPC com permissao.';
COMMENT ON COLUMN public.anew_entities.nif_hash IS 'Hash do NIF para procura de duplicados. Sem leitura direta para authenticated.';
COMMENT ON COLUMN public.anew_entities.billing_nif_encrypted IS 'NIF de faturacao cifrado (so se diferente). Sem leitura direta para authenticated.';
COMMENT ON COLUMN public.anew_entities.last_activity_at IS 'Interacao mais recente (entity_interactions.interaction_at), mantida por trigger.';
COMMENT ON COLUMN public.anew_entities.legacy_lead_id IS 'TEMPORARIA: anew_leads.id de origem; apaga-se na etapa de limpeza.';
COMMENT ON COLUMN public.anew_entities.legacy_client_id IS 'TEMPORARIA: anew_clients.id de origem; apaga-se na etapa de limpeza.';

-- ------------------------------------------------------------
-- 2. Copia dos dados existentes (so preenche o que esta vazio)
-- ------------------------------------------------------------

-- A copia nao e uma alteracao de negocio: sem linhas no log de auditoria
-- (fn_generic_entity_audit sai logo com app.audit_bypass = 'on'). Desliga-se
-- no fim do passo 2.
SET LOCAL app.audit_bypass = 'on';

-- 2.1 Organizacao
CREATE TEMP TABLE _eu_org_cand ON COMMIT DROP AS
SELECT l.entity_id, l.organization_id, 1 AS prio,
       CASE WHEN l.is_primary IS TRUE THEN 0 ELSE 1 END AS sub,
       l.shared_at::timestamptz AS ts
FROM public.anew_entity_org_links l
UNION ALL
SELECT c.entity_id, c.organization_id, 2,
       CASE WHEN c.deleted_at IS NULL THEN 0 ELSE 1 END, c.created_at::timestamptz
FROM public.anew_clients c
UNION ALL
SELECT ld.entity_id, ld.organization_id, 3,
       CASE WHEN ld.deleted_at IS NULL THEN 0 ELSE 1 END, ld.created_at::timestamptz
FROM public.anew_leads ld
WHERE ld.entity_id IS NOT NULL
UNION ALL
SELECT r.entity_id, r.organization_id, 4,
       CASE WHEN r.deleted_at IS NULL THEN 0 ELSE 1 END, NULL::timestamptz
FROM public.anew_entity_roles r
WHERE r.entity_id IS NOT NULL AND r.organization_id IS NOT NULL
UNION ALL
SELECT o.entity_id, o.id, 5, 0, NULL::timestamptz
FROM public.anew_organizations o
WHERE o.entity_id IS NOT NULL
UNION ALL
SELECT u.entity_id, (array_agg(DISTINCT m.organization_id))[1], 6, 0, NULL::timestamptz
FROM public.anew_users u
JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active'
WHERE u.entity_id IS NOT NULL
GROUP BY u.entity_id
HAVING count(DISTINCT m.organization_id) = 1;

DO $$
DECLARE
  v_multi int;
BEGIN
  SELECT count(*) INTO v_multi
  FROM (
    SELECT c.entity_id
    FROM _eu_org_cand c
    GROUP BY c.entity_id
    HAVING count(DISTINCT c.organization_id) > 1
  ) t;
  IF v_multi > 0 THEN
    RAISE NOTICE 'AVISO: % entidades tem mais do que uma organizacao possivel; ficou a de maior prioridade (ligacao principal, cliente, lead, papel). As outras continuam nas tabelas antigas.', v_multi;
  END IF;
END
$$;

UPDATE public.anew_entities e
SET organization_id = b.organization_id
FROM (
  SELECT DISTINCT ON (c.entity_id) c.entity_id, c.organization_id
  FROM _eu_org_cand c
  ORDER BY c.entity_id, c.prio, c.sub, c.ts NULLS LAST, c.organization_id
) b
WHERE b.entity_id = e.id
  AND e.organization_id IS NULL;

-- GUARDA: nenhuma entidade pode ficar sem organizacao.
DO $$
DECLARE
  v_n int;
  v_ex text;
BEGIN
  SELECT count(*) INTO v_n FROM public.anew_entities WHERE organization_id IS NULL;
  IF v_n > 0 THEN
    SELECT string_agg(t.x, ', ') INTO v_ex
    FROM (
      SELECT e.id::text || ' (' || e.display_name || ')' AS x
      FROM public.anew_entities e
      WHERE e.organization_id IS NULL
      ORDER BY e.id
      LIMIT 10
    ) t;
    RAISE EXCEPTION 'GUARDA: % entidades ficaram sem organization_id (sem ligacao, cliente, lead, papel, organizacao nem utilizador com uma so organizacao). Exemplos: %. Decidir o destino delas antes de aplicar.', v_n, v_ex;
  END IF;
END
$$;

-- 2.2 Leads e clientes da MESMA organizacao da entidade
CREATE TEMP TABLE _eu_lead ON COMMIT DROP AS
SELECT DISTINCT ON (ld.entity_id)
       ld.entity_id, ld.id, ld.source_id, ld.source::text AS source_text,
       ld.campaign_id, ld.locale::text AS locale, ld.notes
FROM public.anew_leads ld
JOIN public.anew_entities e ON e.id = ld.entity_id AND e.organization_id = ld.organization_id
ORDER BY ld.entity_id, (ld.deleted_at IS NULL) DESC, ld.created_at, ld.id;

CREATE TEMP TABLE _eu_client ON COMMIT DROP AS
SELECT DISTINCT ON (c.entity_id)
       c.entity_id, c.id, c.assigned_to, c.source_id, c.origin_source_id,
       c.origin_campaign_id, c.notes, c.custom_fields,
       (c.deleted_at IS NULL) AS is_live
FROM public.anew_clients c
JOIN public.anew_entities e ON e.id = c.entity_id AND e.organization_id = c.organization_id
ORDER BY c.entity_id, (c.deleted_at IS NULL) DESC, c.created_at, c.id;

-- 2.3 Soft delete: so quando a entidade tem leads/clientes e estao todos apagados.
WITH refs AS (
  SELECT ld.entity_id, ld.deleted_at::timestamptz AS deleted_at, ld.deleted_by
  FROM public.anew_leads ld
  JOIN public.anew_entities e ON e.id = ld.entity_id AND e.organization_id = ld.organization_id
  UNION ALL
  SELECT c.entity_id, c.deleted_at::timestamptz, c.deleted_by
  FROM public.anew_clients c
  JOIN public.anew_entities e ON e.id = c.entity_id AND e.organization_id = c.organization_id
),
agg AS (
  SELECT r.entity_id, max(r.deleted_at) AS last_deleted
  FROM refs r
  GROUP BY r.entity_id
  HAVING bool_and(r.deleted_at IS NOT NULL)
),
who AS (
  SELECT DISTINCT ON (r.entity_id) r.entity_id, r.deleted_by
  FROM refs r
  WHERE r.deleted_at IS NOT NULL
  ORDER BY r.entity_id, r.deleted_at DESC
)
UPDATE public.anew_entities e
SET deleted_at = a.last_deleted,
    deleted_by = (SELECT u.id FROM public.anew_users u WHERE u.id = w.deleted_by)
FROM agg a
LEFT JOIN who w ON w.entity_id = a.entity_id
WHERE a.entity_id = e.id
  AND e.deleted_at IS NULL;

-- 2.4 Cliente desde (data em Lisboa): clientes vivos; se so houver apagados,
--     so quando a propria entidade ficou apagada.
UPDATE public.anew_entities e
SET client_since = COALESCE(s.since_live, CASE WHEN e.deleted_at IS NOT NULL THEN s.since_any END)
FROM (
  SELECT c.entity_id,
         ((min(c.created_at::timestamptz) FILTER (WHERE c.deleted_at IS NULL)) AT TIME ZONE 'Europe/Lisbon')::date AS since_live,
         ((min(c.created_at::timestamptz)) AT TIME ZONE 'Europe/Lisbon')::date AS since_any
  FROM public.anew_clients c
  JOIN public.anew_entities e2 ON e2.id = c.entity_id AND e2.organization_id = c.organization_id
  GROUP BY c.entity_id
) s
WHERE s.entity_id = e.id
  AND e.client_since IS NULL
  AND COALESCE(s.since_live, CASE WHEN e.deleted_at IS NOT NULL THEN s.since_any END) IS NOT NULL;

-- 2.5 Email principal
UPDATE public.anew_entities e
SET email = m.email
FROM (
  SELECT DISTINCT ON (em.entity_id) em.entity_id, lower(btrim(em.email)) AS email
  FROM public.anew_entity_emails em
  WHERE btrim(em.email) <> ''
  ORDER BY em.entity_id, em.is_primary DESC NULLS LAST, em.created_at, em.id
) m
WHERE m.entity_id = e.id
  AND e.email IS NULL;

-- 2.6 Telefone principal, com indicativo
UPDATE public.anew_entities e
SET phone = p.phone
FROM (
  SELECT DISTINCT ON (ph.entity_id) ph.entity_id,
         CASE
           WHEN btrim(ph.phone_number) LIKE '+%' OR btrim(ph.phone_number) LIKE '00%'
             THEN btrim(ph.phone_number)
           WHEN btrim(coalesce(ph.country_code, '')) ~ '^\+?[0-9]{1,4}$'
             THEN '+' || ltrim(btrim(ph.country_code), '+') || ' ' || btrim(ph.phone_number)
           ELSE btrim(ph.phone_number)
         END AS phone
  FROM public.anew_entity_phones ph
  WHERE btrim(ph.phone_number) <> ''
  ORDER BY ph.entity_id, ph.is_primary DESC NULLS LAST, ph.created_at, ph.id
) p
WHERE p.entity_id = e.id
  AND e.phone IS NULL;

-- 2.7 Fiscal (nome, NIF cifrado, hash e ultimos 3 digitos; o NIF em claro nao e copiado)
UPDATE public.anew_entities e
SET fiscal_name   = COALESCE(e.fiscal_name, f.fiscal_name),
    nif_encrypted = COALESCE(e.nif_encrypted, f.nif_encrypted),
    nif_hash      = COALESCE(e.nif_hash, f.nif_hash),
    nif_last3     = COALESCE(e.nif_last3, f.nif_last3)
FROM (
  SELECT DISTINCT ON (ef.entity_id) ef.entity_id,
         NULLIF(btrim(COALESCE(fe.legal_name, fe.commercial_name)), '') AS fiscal_name,
         fe.nif_encrypted,
         fe.nif_hash,
         CASE WHEN length(regexp_replace(fe.nif, '[^0-9]', '', 'g')) >= 3
              THEN right(regexp_replace(fe.nif, '[^0-9]', '', 'g'), 3) END AS nif_last3
  FROM public.anew_entity_fiscal_entities ef
  JOIN public.fiscal_entities fe ON fe.id = ef.fiscal_entity_id
  ORDER BY ef.entity_id, ef.is_primary DESC NULLS LAST, (ef.valid_to IS NULL) DESC, ef.created_at DESC, ef.id
) f
WHERE f.entity_id = e.id
  AND (e.fiscal_name IS NULL OR e.nif_encrypted IS NULL OR e.nif_hash IS NULL OR e.nif_last3 IS NULL);

-- 2.8 Responsavel: o do cliente vivo; senao o da lead viva mais recente.
UPDATE public.anew_entities e
SET assigned_to = r.assigned_to
FROM (
  SELECT e2.id AS entity_id,
         COALESCE(
           (SELECT c.assigned_to FROM _eu_client c
             WHERE c.entity_id = e2.id AND c.is_live AND c.assigned_to IS NOT NULL),
           (SELECT ld.assigned_to FROM public.anew_leads ld
             WHERE ld.entity_id = e2.id AND ld.organization_id = e2.organization_id
               AND ld.deleted_at IS NULL AND ld.assigned_to IS NOT NULL
             ORDER BY ld.created_at DESC, ld.id LIMIT 1)
         ) AS assigned_to
  FROM public.anew_entities e2
) r
WHERE r.entity_id = e.id
  AND e.assigned_to IS NULL
  AND r.assigned_to IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.anew_users u WHERE u.id = r.assigned_to);

-- 2.9 Origem e campanha do primeiro contacto (so origens/campanhas da mesma
--     organizacao ou globais). Texto da lead procurado pelo nome.
UPDATE public.anew_entities e
SET origin_id = o.origin_id
FROM (
  SELECT e2.id AS entity_id,
         COALESCE(
           (SELECT ls.id FROM public.lead_sources ls
             WHERE ls.id = fl.source_id
               AND (ls.organization_id IS NULL OR ls.organization_id = e2.organization_id)),
           (SELECT ls.id FROM public.lead_sources ls
             WHERE NULLIF(btrim(fl.source_text), '') IS NOT NULL
               AND lower(btrim(ls.name)) = lower(btrim(fl.source_text))
               AND (ls.organization_id IS NULL OR ls.organization_id = e2.organization_id)
             ORDER BY (ls.organization_id IS NULL), ls.created_at NULLS LAST, ls.id
             LIMIT 1),
           (SELECT ls.id FROM public.lead_sources ls
             WHERE ls.id = fc.origin_source_id
               AND (ls.organization_id IS NULL OR ls.organization_id = e2.organization_id)),
           (SELECT ls.id FROM public.lead_sources ls
             WHERE ls.id = fc.source_id
               AND (ls.organization_id IS NULL OR ls.organization_id = e2.organization_id))
         ) AS origin_id
  FROM public.anew_entities e2
  LEFT JOIN _eu_lead fl ON fl.entity_id = e2.id
  LEFT JOIN _eu_client fc ON fc.entity_id = e2.id
) o
WHERE o.entity_id = e.id
  AND e.origin_id IS NULL
  AND o.origin_id IS NOT NULL;

UPDATE public.anew_entities e
SET campaign_id = k.campaign_id
FROM (
  SELECT e2.id AS entity_id,
         COALESCE(
           (SELECT ca.id FROM public.campaigns ca
             WHERE ca.id = fl.campaign_id
               AND (ca.organization_id IS NULL OR ca.organization_id = e2.organization_id)),
           (SELECT ca.id FROM public.campaigns ca
             WHERE ca.id = fc.origin_campaign_id
               AND (ca.organization_id IS NULL OR ca.organization_id = e2.organization_id))
         ) AS campaign_id
  FROM public.anew_entities e2
  LEFT JOIN _eu_lead fl ON fl.entity_id = e2.id
  LEFT JOIN _eu_client fc ON fc.entity_id = e2.id
) k
WHERE k.entity_id = e.id
  AND e.campaign_id IS NULL
  AND k.campaign_id IS NOT NULL;

-- 2.10 Notas, idioma, extra e ids antigos
UPDATE public.anew_entities e
SET notes = n.notes
FROM (
  SELECT e2.id AS entity_id,
         NULLIF(concat_ws(E'\n\n',
                  NULLIF(btrim(fc.notes), ''),
                  CASE WHEN NULLIF(btrim(fl.notes), '') IS DISTINCT FROM NULLIF(btrim(fc.notes), '')
                       THEN NULLIF(btrim(fl.notes), '') END), '') AS notes
  FROM public.anew_entities e2
  LEFT JOIN _eu_lead fl ON fl.entity_id = e2.id
  LEFT JOIN _eu_client fc ON fc.entity_id = e2.id
) n
WHERE n.entity_id = e.id
  AND e.notes IS NULL
  AND n.notes IS NOT NULL;

UPDATE public.anew_entities e
SET locale = btrim(fl.locale)
FROM _eu_lead fl
WHERE fl.entity_id = e.id
  AND NULLIF(btrim(fl.locale), '') IS NOT NULL
  AND (e.locale IS NULL OR e.locale = 'pt');

UPDATE public.anew_entities SET locale = 'pt' WHERE locale IS NULL;

UPDATE public.anew_entities e
SET extra = fc.custom_fields || COALESCE(e.extra, '{}'::jsonb)
FROM _eu_client fc
WHERE fc.entity_id = e.id
  AND jsonb_typeof(fc.custom_fields) = 'object'
  AND fc.custom_fields <> '{}'::jsonb
  AND NOT (COALESCE(e.extra, '{}'::jsonb) @> fc.custom_fields);

UPDATE public.anew_entities SET extra = '{}'::jsonb WHERE extra IS NULL;

UPDATE public.anew_entities e
SET legacy_lead_id = fl.id
FROM _eu_lead fl
WHERE fl.entity_id = e.id
  AND e.legacy_lead_id IS NULL;

UPDATE public.anew_entities e
SET legacy_client_id = fc.id
FROM _eu_client fc
WHERE fc.entity_id = e.id
  AND e.legacy_client_id IS NULL;

-- 2.11 Ultima atividade = interacao mais recente
UPDATE public.anew_entities e
SET last_activity_at = i.last_at
FROM (
  SELECT ei.entity_id, max(ei.interaction_at) AS last_at
  FROM public.entity_interactions ei
  GROUP BY ei.entity_id
) i
WHERE i.entity_id = e.id
  AND e.last_activity_at IS DISTINCT FROM i.last_at;

SET LOCAL app.audit_bypass = 'off';

-- locale e extra sao obrigatorios na spec e ja tem valor por omissao: seguro.
ALTER TABLE public.anew_entities ALTER COLUMN locale SET NOT NULL;
ALTER TABLE public.anew_entities ALTER COLUMN extra SET NOT NULL;

-- ------------------------------------------------------------
-- 3. Chaves e indices
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'anew_entities'
      AND c.conname = 'anew_entities_organization_id_fkey'
  ) THEN
    ALTER TABLE public.anew_entities
      ADD CONSTRAINT anew_entities_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'anew_entities'
      AND c.conname = 'anew_entities_id_organization_id_key'
  ) THEN
    ALTER TABLE public.anew_entities
      ADD CONSTRAINT anew_entities_id_organization_id_key UNIQUE (id, organization_id);
  END IF;
END
$$;

-- Os 3 unicos so valem para entidades vivas (deleted_at IS NULL): uma ficha
-- apagada nao bloqueia criar outra com o mesmo email/telefone/NIF. Cada
-- guarda conta repetidos com o MESMO predicado do indice que protege.

-- GUARDA: emails repetidos na mesma organizacao
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.anew_entities
    WHERE email IS NOT NULL AND deleted_at IS NULL
    GROUP BY organization_id, lower(email)
    HAVING count(*) > 1
  ) t;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % emails repetidos na mesma organizacao. Juntar as entidades antes de criar o indice unico.', v_n;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_anew_entities_org_email
  ON public.anew_entities (organization_id, lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- GUARDA: telefones repetidos (ultimos 9 digitos) na mesma organizacao
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.anew_entities
    WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
      AND deleted_at IS NULL
    GROUP BY organization_id, right(regexp_replace(phone, '[^0-9]', '', 'g'), 9)
    HAVING count(*) > 1
  ) t;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % telefones repetidos (ultimos 9 digitos) na mesma organizacao. Juntar as entidades antes de criar o indice unico.', v_n;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_anew_entities_org_phone9
  ON public.anew_entities (organization_id, right(regexp_replace(phone, '[^0-9]', '', 'g'), 9))
  WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
    AND deleted_at IS NULL;

-- GUARDA: NIF repetido (hash) na mesma organizacao
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.anew_entities
    WHERE nif_hash IS NOT NULL AND deleted_at IS NULL
    GROUP BY organization_id, nif_hash
    HAVING count(*) > 1
  ) t;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % NIF repetidos (nif_hash) na mesma organizacao. Juntar as entidades antes de criar o indice unico.', v_n;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_anew_entities_org_nif_hash
  ON public.anew_entities (organization_id, nif_hash)
  WHERE nif_hash IS NOT NULL AND deleted_at IS NULL;

-- Procura (spec) e apoio as FKs
CREATE INDEX IF NOT EXISTS idx_anew_entities_org_origin
  ON public.anew_entities (organization_id, origin_id)
  WHERE origin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anew_entities_org_last_activity
  ON public.anew_entities (organization_id, last_activity_at DESC)
  WHERE last_activity_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anew_entities_org_live
  ON public.anew_entities (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_anew_entities_assigned_to
  ON public.anew_entities (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anew_entities_campaign_id
  ON public.anew_entities (campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Triggers
-- ------------------------------------------------------------

-- 4.1 last_activity_at = interacao mais recente
CREATE OR REPLACE FUNCTION public.fn_entity_interactions_sync_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.anew_entities e
    SET last_activity_at = NEW.interaction_at
    WHERE e.id = NEW.entity_id
      AND (e.last_activity_at IS NULL OR e.last_activity_at < NEW.interaction_at);
    RETURN NULL;
  END IF;

  -- UPDATE ou DELETE: recalcular a(s) entidade(s) afetada(s).
  UPDATE public.anew_entities e
  SET last_activity_at = (
    SELECT max(i.interaction_at) FROM public.entity_interactions i WHERE i.entity_id = e.id
  )
  WHERE e.id = OLD.entity_id
    AND e.last_activity_at IS DISTINCT FROM (
      SELECT max(i.interaction_at) FROM public.entity_interactions i WHERE i.entity_id = e.id
    );

  IF TG_OP = 'UPDATE' AND NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    UPDATE public.anew_entities e
    SET last_activity_at = (
      SELECT max(i.interaction_at) FROM public.entity_interactions i WHERE i.entity_id = e.id
    )
    WHERE e.id = NEW.entity_id
      AND e.last_activity_at IS DISTINCT FROM (
        SELECT max(i.interaction_at) FROM public.entity_interactions i WHERE i.entity_id = e.id
      );
  END IF;

  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_entity_interactions_sync_last_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entity_interactions_sync_last_activity ON public.entity_interactions;
CREATE TRIGGER trg_entity_interactions_sync_last_activity
  AFTER INSERT OR DELETE OR UPDATE OF interaction_at, entity_id
  ON public.entity_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_entity_interactions_sync_last_activity();

-- 4.2 Entidade nova sem organizacao recebe a da primeira ligacao criada.
CREATE OR REPLACE FUNCTION public.fn_anew_entity_org_links_fill_entity_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.anew_entities e
  SET organization_id = NEW.organization_id
  WHERE e.id = NEW.entity_id
    AND e.organization_id IS NULL;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_anew_entity_org_links_fill_entity_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_anew_entity_org_links_fill_entity_org ON public.anew_entity_org_links;
CREATE TRIGGER trg_anew_entity_org_links_fill_entity_org
  AFTER INSERT ON public.anew_entity_org_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_anew_entity_org_links_fill_entity_org();

-- 4.3 Auditoria sem os NIF cifrados nem o hash, e sem nenhuma coluna de
--     anew_entities que authenticated nao le.
--     Corpo = versao em vigor na RH (pg_get_functiondef, lida antes). Unica
--     mudanca: v_strip (v_secret_cols em todas as tabelas; v_entity_hidden_cols
--     em anew_entities) retirado de to_jsonb(NEW/OLD) antes de montar
--     full_record e changed_fields. v_entity_hidden_cols tem de ser igual a
--     v_secret || v_held do CONFERIR. record_id, entity_id e organization_id
--     continuam a ser resolvidos como antes. Mesma assinatura: o CREATE OR
--     REPLACE mantem dono, EXECUTE e os 47 triggers que a usam.
CREATE OR REPLACE FUNCTION public.fn_generic_entity_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_changed_by    uuid;
  v_source        text;
  v_org_id        uuid;
  v_entity_id     uuid;
  v_record_id     uuid;
  v_old           jsonb;
  v_new           jsonb;
  v_changed       jsonb;
  v_full          jsonb;
  v_key           text;
  -- Columns that carry no semantic meaning for change-tracking
  v_noise_cols    text[] := ARRAY[
    'updated_at', 'search_text', 'contact_attempts', 'last_activity_at'
  ];
  -- Columns that must never be copied to entity_audit_log (column-masked
  -- secrets; the log is readable without that mask). Absent keys are a no-op.
  v_secret_cols   text[] := ARRAY[
    'nif_encrypted', 'nif_hash', 'billing_nif_encrypted'
  ];
  -- public.anew_entities only: every column authenticated cannot SELECT
  -- (fiscal secrets + columns held until the new-code migration). Other
  -- tables keep auditing their own columns with the same names.
  v_entity_hidden_cols text[] := ARRAY[
    'nif_encrypted', 'nif_hash', 'billing_nif_encrypted',
    'email', 'phone', 'preferred_contact', 'preferred_time', 'fiscal_name',
    'billing_email', 'nif_last3', 'billing_nif_last3', 'assigned_to',
    'origin_id', 'campaign_id', 'referred_by', 'gdpr_consented_at',
    'last_activity_at', 'notes', 'extra', 'deleted_by', 'legacy_lead_id',
    'legacy_client_id'
  ];
  v_strip         text[];
BEGIN

  -- Audit bypass: a business RPC that already wrote a consolidated row via
  -- fn_manual_audit_log() sets app.audit_bypass='on' (SET LOCAL).
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve actor
  BEGIN
    v_changed_by := (current_setting('app.audit_user_id', true))::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  -- Resolve source
  v_source := current_setting('app.audit_source', true);
  IF v_source = '' THEN
    v_source := NULL;
  END IF;

  -- Resolve record_id (the audited row's own PK)
  IF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_record_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;

  -- Resolve entity_id (anew_entities falls back to its own id)
  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
    END IF;
  ELSE
    v_entity_id := (to_jsonb(NEW) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    END IF;
  END IF;

  -- Resolve organization_id. Strategy A: table carries organization_id.
  IF TG_OP = 'DELETE' THEN
    v_org_id := (to_jsonb(OLD) ->> 'organization_id')::uuid;
  ELSE
    v_org_id := (to_jsonb(NEW) ->> 'organization_id')::uuid;
  END IF;

  -- Strategy B: via role tables.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT er.organization_id
    INTO   v_org_id
    FROM   public.anew_entity_roles er
    WHERE  er.entity_id  = v_entity_id
      AND  er.deleted_at IS NULL
    ORDER BY er.created_at DESC
    LIMIT 1;
  END IF;

  -- Strategy C: via parent lead/contact/client.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT COALESCE(l.organization_id, c.organization_id, cl.organization_id)
    INTO   v_org_id
    FROM   (SELECT NULL::uuid) dummy
    LEFT JOIN public.anew_leads    l  ON l.entity_id  = v_entity_id AND l.deleted_at IS NULL
    LEFT JOIN public.anew_contacts c  ON c.entity_id  = v_entity_id AND c.deleted_at IS NULL
    LEFT JOIN public.anew_clients  cl ON cl.entity_id = v_entity_id AND cl.deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Cannot determine org: skip silently to avoid polluting the log.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Columns never copied to the log for this table.
  IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'anew_entities' THEN
    v_strip := v_entity_hidden_cols;
  ELSE
    v_strip := v_secret_cols;
  END IF;

  -- Build changed_fields / full_record (without the stripped columns)
  IF TG_OP = 'INSERT' THEN
    v_changed := NULL;
    v_full    := to_jsonb(NEW) - v_strip;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'INSERT',
         v_changed, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) - v_strip;
    v_new := to_jsonb(NEW) - v_strip;
    v_changed := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      END IF;
    END LOOP;

    -- Only write a row when something meaningful actually changed.
    IF v_changed = '{}'::jsonb OR v_changed IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'UPDATE',
         v_changed, NULL, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_full := to_jsonb(OLD) - v_strip;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'DELETE',
         NULL, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN OLD;
  END IF;

  -- Fallback: should never reach here.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- The audit trigger must never block the originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$fn$;

-- 4.4 search_text das entidades a partir de emails/telefones: ler SO as 3
--     colunas de nome, e nunca a linha inteira (SELECT * INTO %ROWTYPE parte
--     com a leitura por coluna do passo 5, porque estas funcoes sao SECURITY
--     INVOKER e correm como o utilizador). Corpo = versao em vigor na RH
--     (pg_get_functiondef, lida antes); mesmo resultado, mesmo search_path
--     vazio, continuam SECURITY INVOKER. O CREATE OR REPLACE mantem dono,
--     EXECUTE e os triggers trg_anew_entity_emails_sync_entities_search_text
--     e trg_anew_entity_phones_sync_entities_search_text.
CREATE OR REPLACE FUNCTION public.anew_entity_emails_sync_entities_search_text_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  v_entity_id    uuid := coalesce(NEW.entity_id, OLD.entity_id);
  v_display_name public.anew_entities.display_name%TYPE;
  v_first_name   public.anew_entities.first_name%TYPE;
  v_last_name    public.anew_entities.last_name%TYPE;
BEGIN
  IF v_entity_id IS NOT NULL THEN
    SELECT e.display_name, e.first_name, e.last_name
      INTO v_display_name, v_first_name, v_last_name
      FROM public.anew_entities e
     WHERE e.id = v_entity_id;
    IF FOUND THEN
      UPDATE public.anew_entities
         SET search_text = public.anew_entities_compute_search_text(v_display_name, v_first_name, v_last_name, v_entity_id)
       WHERE id = v_entity_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.anew_entity_phones_sync_entities_search_text_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  v_entity_id    uuid := coalesce(NEW.entity_id, OLD.entity_id);
  v_display_name public.anew_entities.display_name%TYPE;
  v_first_name   public.anew_entities.first_name%TYPE;
  v_last_name    public.anew_entities.last_name%TYPE;
BEGIN
  IF v_entity_id IS NOT NULL THEN
    SELECT e.display_name, e.first_name, e.last_name
      INTO v_display_name, v_first_name, v_last_name
      FROM public.anew_entities e
     WHERE e.id = v_entity_id;
    IF FOUND THEN
      UPDATE public.anew_entities
         SET search_text = public.anew_entities_compute_search_text(v_display_name, v_first_name, v_last_name, v_entity_id)
       WHERE id = v_entity_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

-- ------------------------------------------------------------
-- 5. Regras de acesso (as 7 existentes ficam como estao)
-- ------------------------------------------------------------

-- 5.1 Leitura por organizacao, membros com permissao de pessoas/leads/clientes.
DROP POLICY IF EXISTS anew_entities_org_member_select ON public.anew_entities;
CREATE POLICY anew_entities_org_member_select
  ON public.anew_entities
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND (
      public.has_anew_permission((SELECT auth.uid()), 'pessoas.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'leads.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'clients.view')
    )
  );

-- 5.2 Criacao na propria organizacao, com permissao de criar.
DROP POLICY IF EXISTS anew_entities_org_member_insert ON public.anew_entities;
CREATE POLICY anew_entities_org_member_insert
  ON public.anew_entities
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND (
      public.has_anew_permission((SELECT auth.uid()), 'pessoas.create')
      OR public.has_anew_permission((SELECT auth.uid()), 'leads.create')
      OR public.has_anew_permission((SELECT auth.uid()), 'clients.create')
    )
  );

-- 5.3 Cerca restritiva: nunca escrever numa organizacao que nao se ve.
DROP POLICY IF EXISTS anew_entities_org_fence_insert ON public.anew_entities;
CREATE POLICY anew_entities_org_fence_insert
  ON public.anew_entities
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS anew_entities_org_fence_update ON public.anew_entities;
CREATE POLICY anew_entities_org_fence_update
  ON public.anew_entities
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  )
  WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS anew_entities_org_fence_delete ON public.anew_entities;
CREATE POLICY anew_entities_org_fence_delete
  ON public.anew_entities
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

-- 5.4 Privilegios: tirar tudo e voltar a dar por coluna.
REVOKE ALL ON TABLE public.anew_entities FROM anon;
REVOKE ALL ON TABLE public.anew_entities FROM authenticated;

-- anon: so as 10 colunas antigas (leitura das propostas publicas). Nada novo.
GRANT SELECT (id, type, display_name, status, created_by, created_at, updated_at,
              first_name, last_name, search_text)
  ON public.anew_entities TO anon;

-- authenticated: escreve como antes (risco residual, ver cabecalho); le as 10
-- antigas e so 4 novas sem dado pessoal nem interno. As outras 19 novas ficam
-- sem leitura ate a migration do codigo novo estreitar as politicas antigas
-- (ver cabecalho, passo 5); os 3 NIF cifrados/hash nunca.
GRANT INSERT, UPDATE, DELETE ON TABLE public.anew_entities TO authenticated;
GRANT SELECT (id, type, display_name, status, created_by, created_at, updated_at,
              first_name, last_name, search_text,
              organization_id, client_since, locale, deleted_at)
  ON public.anew_entities TO authenticated;

GRANT ALL ON TABLE public.anew_entities TO service_role;

-- ------------------------------------------------------------
-- 6. CONFERIR
-- ------------------------------------------------------------
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'organization_id','client_since','email','phone','preferred_contact','preferred_time',
    'locale','fiscal_name','billing_email','nif_encrypted','nif_hash','nif_last3',
    'billing_nif_encrypted','billing_nif_last3','assigned_to','origin_id','campaign_id',
    'referred_by','gdpr_consented_at','last_activity_at','notes','extra','deleted_at',
    'deleted_by','legacy_lead_id','legacy_client_id'];
  v_old text[] := ARRAY['id','type','display_name','status','created_by','created_at',
    'updated_at','first_name','last_name','search_text'];
  v_secret text[] := ARRAY['nif_encrypted','nif_hash','billing_nif_encrypted'];
  -- Novas que authenticated le ja, e novas que ficam sem leitura por agora.
  v_auth_new text[] := ARRAY['organization_id','client_since','locale','deleted_at'];
  v_held text[] := ARRAY['email','phone','preferred_contact','preferred_time',
    'fiscal_name','billing_email','nif_last3','billing_nif_last3','assigned_to',
    'origin_id','campaign_id','referred_by','gdpr_consented_at','last_activity_at',
    'notes','extra','deleted_by','legacy_lead_id','legacy_client_id'];
  v_def text;
  v_hidden text[];
  v_old_policies text[] := ARRAY['anon_entities_read','authenticated_delete_anew_entities',
    'authenticated_insert_anew_entities','authenticated_select_anew_entities',
    'authenticated_update_anew_entities','portal_client_reads_portal_entities',
    'system_admin_pii_default_deny'];
  v_new_policies text[] := ARRAY['anew_entities_org_member_select','anew_entities_org_member_insert',
    'anew_entities_org_fence_insert','anew_entities_org_fence_update','anew_entities_org_fence_delete'];
  v_n int;
  v_missing text;
  v_col text;
BEGIN
  -- Colunas novas e antigas
  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(v_expected || v_old) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities' AND c.column_name = x
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: faltam colunas em anew_entities: %', v_missing;
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities';
  IF v_n <> 36 THEN
    RAISE EXCEPTION 'CONFERIR: anew_entities devia ter 36 colunas (35 da spec + status antiga), tem %', v_n;
  END IF;

  -- Tipos principais
  SELECT string_agg(c.column_name::text || '=' || c.data_type::text, ', ') INTO v_missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities'
    AND (
      (c.column_name IN ('organization_id','assigned_to','origin_id','campaign_id','deleted_by',
                         'legacy_lead_id','legacy_client_id') AND c.data_type <> 'uuid')
      OR (c.column_name = 'client_since' AND c.data_type <> 'date')
      OR (c.column_name IN ('gdpr_consented_at','last_activity_at','deleted_at')
          AND c.data_type <> 'timestamp with time zone')
      OR (c.column_name = 'extra' AND c.data_type <> 'jsonb')
    );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: tipos errados: %', v_missing;
  END IF;

  -- Dados
  SELECT count(*) INTO v_n FROM public.anew_entities WHERE organization_id IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % entidades sem organization_id', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_entities WHERE locale IS NULL OR extra IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % entidades com locale ou extra vazio', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.anew_entities e
  WHERE e.last_activity_at IS DISTINCT FROM (
    SELECT max(i.interaction_at) FROM public.entity_interactions i WHERE i.entity_id = e.id
  );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % entidades com last_activity_at diferente da interacao mais recente', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.anew_entity_org_links l
  JOIN public.anew_entities e ON e.id = l.entity_id
  WHERE l.is_primary IS TRUE AND e.organization_id <> l.organization_id;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % entidades com organization_id diferente da ligacao principal', v_n;
  END IF;

  -- Restricoes
  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(ARRAY['anew_entities_organization_id_fkey','anew_entities_id_organization_id_key',
    'anew_entities_assigned_to_fkey','anew_entities_origin_id_fkey','anew_entities_campaign_id_fkey',
    'anew_entities_deleted_by_fkey','anew_entities_preferred_contact_check',
    'anew_entities_nif_last3_check','anew_entities_billing_nif_last3_check',
    'anew_entities_email_not_blank','anew_entities_phone_not_blank']) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'anew_entities' AND c.conname = x
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: faltam restricoes: %', v_missing;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'anew_entities'
    AND c.conname = 'anew_entities_organization_id_fkey'
    AND c.confdeltype::text = 'r';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: a FK de organization_id devia ser ON DELETE RESTRICT';
  END IF;

  -- Indices
  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(ARRAY['uq_anew_entities_org_email','uq_anew_entities_org_phone9',
    'uq_anew_entities_org_nif_hash','idx_anew_entities_org_origin',
    'idx_anew_entities_org_last_activity','idx_anew_entities_org_live',
    'idx_anew_entities_assigned_to','idx_anew_entities_campaign_id']) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename = 'anew_entities' AND i.indexname = x
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: faltam indices: %', v_missing;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_index ix
  JOIN pg_class ci ON ci.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = ci.relnamespace
  WHERE n.nspname = 'public'
    AND ci.relname IN ('uq_anew_entities_org_email','uq_anew_entities_org_phone9','uq_anew_entities_org_nif_hash')
    AND ix.indisunique;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: esperados 3 indices unicos, encontrados %', v_n;
  END IF;

  -- Triggers e funcoes (search_path fixo)
  SELECT count(*) INTO v_n
  FROM pg_trigger tg
  JOIN pg_class t ON t.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND NOT tg.tgisinternal
    AND ((t.relname = 'entity_interactions' AND tg.tgname = 'trg_entity_interactions_sync_last_activity')
      OR (t.relname = 'anew_entity_org_links' AND tg.tgname = 'trg_anew_entity_org_links_fill_entity_org'));
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: esperados 2 triggers novos, encontrados %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_entity_interactions_sync_last_activity','fn_anew_entity_org_links_fill_entity_org')
    AND p.prosecdef
    AND array_to_string(p.proconfig, ',') LIKE 'search_path=%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: as 2 funcoes de trigger deviam ser SECURITY DEFINER com search_path fixo (encontradas %)', v_n;
  END IF;

  -- RLS e politicas (as antigas todas presentes, as novas criadas)
  SELECT count(*) INTO v_n
  FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'anew_entities' AND t.relrowsecurity;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: RLS desligada em anew_entities';
  END IF;

  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(v_old_policies || v_new_policies) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'anew_entities' AND p.policyname = x
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: faltam politicas: %', v_missing;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'anew_entities'
    AND p.policyname IN ('anew_entities_org_fence_insert','anew_entities_org_fence_update',
                         'anew_entities_org_fence_delete','system_admin_pii_default_deny')
    AND p.permissive::text = 'RESTRICTIVE';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CONFERIR: esperadas 4 politicas restritivas, encontradas %', v_n;
  END IF;

  -- Privilegios: anon sem escrita e sem nenhuma coluna nova
  IF has_table_privilege('anon', 'public.anew_entities', 'INSERT')
     OR has_table_privilege('anon', 'public.anew_entities', 'UPDATE')
     OR has_table_privilege('anon', 'public.anew_entities', 'DELETE')
     OR has_table_privilege('anon', 'public.anew_entities', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.anew_entities', 'SELECT') THEN
    RAISE EXCEPTION 'CONFERIR: anon ainda tem privilegios de tabela em anew_entities';
  END IF;

  FOREACH v_col IN ARRAY v_expected LOOP
    IF has_column_privilege('anon', 'public.anew_entities', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'CONFERIR: anon le a coluna nova %', v_col;
    END IF;
  END LOOP;

  -- authenticated: sem leitura de tabela inteira; le exatamente as 10
  -- antigas + v_auth_new; nao le v_secret nem v_held. As tres listas tem de
  -- cobrir todas as colunas (uma coluna futura por classificar falha aqui).
  IF has_table_privilege('authenticated', 'public.anew_entities', 'SELECT')
     OR has_table_privilege('authenticated', 'public.anew_entities', 'TRUNCATE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated ainda tem SELECT ou TRUNCATE de tabela (anula a mascara por coluna)';
  END IF;

  IF cardinality(v_auth_new) + cardinality(v_held) + cardinality(v_secret) <> cardinality(v_expected)
     OR EXISTS (SELECT 1 FROM unnest(v_expected) x
                WHERE NOT (x = ANY (v_auth_new || v_held || v_secret))) THEN
    RAISE EXCEPTION 'CONFERIR: as listas de leitura (v_auth_new, v_held, v_secret) nao classificam exatamente as 26 colunas novas';
  END IF;

  FOREACH v_col IN ARRAY v_secret || v_held LOOP
    IF has_column_privilege('authenticated', 'public.anew_entities', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'CONFERIR: authenticated le a coluna % (fiscal cifrada ou ainda sem leitura)', v_col;
    END IF;
  END LOOP;

  SELECT string_agg(c.column_name::text, ', ') INTO v_missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities'
    AND NOT (c.column_name::text = ANY (v_secret || v_held))
    AND NOT has_column_privilege('authenticated', 'public.anew_entities', c.column_name::text, 'SELECT');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: authenticated nao le as colunas: %', v_missing;
  END IF;

  -- Auditoria: em anew_entities a funcao em vigor retira EXATAMENTE as
  -- colunas sem leitura (v_secret || v_held), e nenhuma linha do log de
  -- anew_entities as contem.
  v_hidden := v_secret || v_held;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generic_entity_audit'
    AND p.prosecdef;
  IF v_def IS NULL
     OR position('TG_TABLE_NAME = ''anew_entities''' IN v_def) = 0
     OR position('v_strip := v_entity_hidden_cols' IN v_def) = 0
     OR position('to_jsonb(NEW) - v_strip' IN v_def) = 0
     OR position('to_jsonb(OLD) - v_strip' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: fn_generic_entity_audit nao retira as colunas sem leitura de anew_entities do log';
  END IF;

  SELECT string_agg(x, ', ') INTO v_missing
  FROM (
    (SELECT m[1] AS x
       FROM regexp_matches(
              substring(v_def FROM 'v_entity_hidden_cols text\[\] := ARRAY\[([^]]*)\]'),
              '''([a-z0-9_]+)''', 'g') AS m
     EXCEPT
     SELECT unnest(v_hidden))
    UNION ALL
    (SELECT unnest(v_hidden)
     EXCEPT
     SELECT m[1]
       FROM regexp_matches(
              substring(v_def FROM 'v_entity_hidden_cols text\[\] := ARRAY\[([^]]*)\]'),
              '''([a-z0-9_]+)''', 'g') AS m)
  ) d;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: v_entity_hidden_cols da auditoria difere das colunas sem leitura (v_secret || v_held): %', v_missing;
  END IF;

  -- search_text de emails/telefones: SECURITY INVOKER, search_path fixo, e
  -- sem ler a linha inteira de anew_entities.
  SELECT count(*) INTO v_n
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('anew_entity_emails_sync_entities_search_text_trigger',
                      'anew_entity_phones_sync_entities_search_text_trigger')
    AND NOT p.prosecdef
    AND array_to_string(p.proconfig, ',') LIKE 'search_path=%'
    AND p.prosrc !~* 'anew_entities\s*%\s*rowtype'
    AND p.prosrc !~* 'select\s+\*';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: as 2 funcoes de search_text de emails/telefones ainda leem a linha inteira de anew_entities (ok: %)', v_n;
  END IF;

  -- Nenhuma funcao SECURITY INVOKER pode ler a linha inteira de
  -- anew_entities (%ROWTYPE ou SELECT * ... FROM anew_entities): com a
  -- leitura por coluna dava permission denied a quem a chama.
  SELECT string_agg(p.proname::text, ', ') INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT p.prosecdef
    AND (p.prosrc ~* 'anew_entities\s*%\s*rowtype'
      OR p.prosrc ~* 'select\s+\*\s+(into\s+\w+\s+)?from\s+(public\.)?anew_entities\M');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funcoes SECURITY INVOKER ainda leem a linha inteira de anew_entities: %', v_missing;
  END IF;

  -- Os 3 unicos so para entidades vivas.
  SELECT count(*) INTO v_n
  FROM pg_index ix
  JOIN pg_class ci ON ci.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = ci.relnamespace
  WHERE n.nspname = 'public'
    AND ci.relname IN ('uq_anew_entities_org_email','uq_anew_entities_org_phone9','uq_anew_entities_org_nif_hash')
    AND pg_get_expr(ix.indpred, ix.indrelid) LIKE '%deleted_at IS NULL%';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: os 3 indices unicos deviam excluir entidades apagadas (deleted_at IS NULL); ok: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_trigger tg
  JOIN pg_class t ON t.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_proc p ON p.oid = tg.tgfoid
  WHERE n.nspname = 'public' AND t.relname = 'anew_entities'
    AND NOT tg.tgisinternal AND p.proname = 'fn_generic_entity_audit';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: esperado 1 trigger de auditoria em anew_entities, encontrados %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.entity_audit_log a
  WHERE a.table_name = 'anew_entities'
    AND ((a.full_record IS NOT NULL AND a.full_record ?| v_hidden)
      OR (a.changed_fields IS NOT NULL AND a.changed_fields ?| v_hidden));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % linhas do log de auditoria de anew_entities com colunas sem leitura (NIF cifrado, hash ou retidas)', v_n;
  END IF;

  IF NOT (has_table_privilege('authenticated', 'public.anew_entities', 'INSERT')
      AND has_table_privilege('authenticated', 'public.anew_entities', 'UPDATE')
      AND has_table_privilege('authenticated', 'public.anew_entities', 'DELETE')) THEN
    RAISE EXCEPTION 'CONFERIR: authenticated perdeu INSERT, UPDATE ou DELETE';
  END IF;

  RAISE NOTICE 'CONFERIR: anew_entities preparada (36 colunas, organizacao em todas as linhas, 3 unicos, 2 triggers, 5 politicas novas, leitura fiscal fechada, 19 colunas ainda sem leitura, auditoria sem nenhuma delas, search_text de emails/telefones sem ler a linha inteira).';
END
$$;

COMMIT;
