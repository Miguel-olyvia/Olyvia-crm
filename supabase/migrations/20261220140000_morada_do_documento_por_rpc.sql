-- ============================================================================
-- Morada dos documentos: o PDF de orcamentos e propostas passa a ler as
-- moradas da ficha por RPC, resolvidas PELA leitura do proprio documento.
--
-- POR APLICAR. Entra junto com o codigo de src/utils/quotePdfClient.ts que
-- passa a chamar estas funcoes (hoje le anew_entity_addresses directamente).
--
--
-- -- EFEITO NA MUDELAR (funcoes novas) ---------------------------------------
--
--   * Nulo ate o cliente as chamar: sao duas funcoes NOVAS, nao substituem
--     nenhuma existente e nao mudam dados.
--   * Depois de publicado o codigo que as usa, os PDFs de orcamentos e
--     propostas passam a mostrar as moradas da ficha mesmo quando o RLS de
--     anew_entity_addresses/anew_addresses as esconderia ao utilizador que
--     consegue ver o documento.
--   * DESEMPENHO: NAO medido. Cada chamada resolve um documento e le as
--     moradas de UMA entidade, pelo indice idx_anew_entity_addresses_entity_id
--     (20261112170000) e pela chave primaria de anew_addresses. A verificacao
--     de pertenca faz ate cinco pesquisas indexadas por id por chamada:
--     anew_leads, anew_contacts e anew_clients pelos indices *_entity_id do
--     baseline; anew_organizations pela chave primaria (id); e
--     anew_entity_org_links pela chave primaria (entity_id, organization_id)
--     -- existe tambem anew_entity_org_links_entity_idx (entity_id), ambos no
--     baseline 20260615130000. O custo esperado e desprezavel, mas nao ha
--     EXPLAIN.
--
--
-- -- O QUE FAZEM ----------------------------------------------------------------
--
-- resolve_quote_address(_quote_id) e resolve_proposal_address(_proposal_id):
--   * Predicado de acesso e resolucao do entity_id copiados LETRA A LETRA de
--     resolve_quote_contact / resolve_proposal_contact na versao em vigor
--     (20261220120000_contacto_primario_mais_recente.sql). Se o chamador nao
--     pode ler o documento, devolvem zero linhas.
--   * PERTENCA A ORGANIZACAO DO DOCUMENTO: o entity_id (e cliente_id/deal_id)
--     gravados no documento nao sao de confianca -- quem tem quotes.edit ou
--     proposals.edit e conhece o UUID de uma ficha de outra organizacao
--     poderia ligar-lhe o documento e, sendo isto SECURITY DEFINER, ler as
--     moradas dela. Por isso, depois de resolvido o entity_id, so se devolvem
--     linhas se a entidade pertencer a organizacao do documento. Cinco ramos,
--     todos por igualdade exacta de organizacao (sem hierarquia nem
--     get_user_visible_org_ids):
--       1-4. o criterio de sync_entity_primary_address (20261120110000):
--            existe anew_leads, anew_contacts ou anew_clients com esse
--            entity_id e organization_id = organizacao do documento, ou
--            anew_organizations com esse entity_id e id = organizacao do
--            documento;
--       5.   existe anew_entity_org_links (entity_id, organization_id) com
--            esse entity_id e organization_id = organizacao do documento --
--            a mesma ligacao que is_entity_in_user_scope (baseline
--            20260615130000) ja aceita como pertenca. Medido na nike: das 27
--            fichas de documentos que os quatro primeiros ramos rejeitariam,
--            25 estao ligadas a organizacao do documento nesta tabela; sem
--            este ramo esses documentos perderiam a morada no PDF em silencio.
--       - orcamento: quotes.organization_id (o predicado de acesso ja exige
--         que seja uma organizacao CRM do chamador, logo nunca e NULL aqui);
--       - proposta: proposals.organization_id e, quando e NULL (a coluna e
--         nullable e o predicado de acesso aceita esse caso pelo negocio),
--         deals.organization_id do negocio da proposta. Se ambas forem NULL
--         nao ha organizacao contra a qual confirmar: zero linhas.
--     A FRAQUEZA EQUIVALENTE existe nos RPCs de contacto ja aplicados,
--     resolve_quote_contact e resolve_proposal_contact (20261220120000): nao
--     confirmam a pertenca da entidade a organizacao do documento. NAO sao
--     alterados aqui; fica registado como por fazer (migration propria).
--   * Devolvem as moradas da ficha (anew_entity_addresses JOIN anew_addresses)
--     activas (valid_to IS NULL OR valid_to > now()) e que nao sao de entrega
--     (address_type IS DISTINCT FROM 'delivery'), pela mesma ordem que o
--     cliente ja usava (sortEntityAddressLinks): primaria primeiro, depois a
--     mais recente, com o id da ligacao a desempatar. is_primary e nullable:
--     ordena-se por COALESCE(is_primary, false) para um NULL contar como
--     "nao primaria" (como no cliente) em vez de subir ao topo num DESC.
--   * LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'.
--   * EXECUTE so a authenticated (PUBLIC e anon revogados).
--
-- Colunas confirmadas no baseline 20260615130000 (nenhuma migration posterior
-- altera estas tabelas, so cria indices ou triggers):
--   anew_entity_org_links: entity_id uuid NOT NULL, organization_id uuid
--     NOT NULL, is_primary boolean, shared_from_org_id, shared_by, shared_at,
--     created_at, updated_at; PK (entity_id, organization_id).
--   anew_entity_addresses: id, entity_id, address_id, address_type text,
--     is_primary boolean, is_fiscal, valid_from timestamptz, valid_to
--     timestamptz, created_by, created_at timestamptz.
--   anew_addresses: id, street, number, floor, unit, postal_code, city,
--     district, country (todas text), extra, address_key, ...
--
-- NAO faz backfill nem mexe noutras funcoes.
-- ============================================================================


-- -- 1. resolve_proposal_address -----------------------------------------------
-- Predicado de prop e resolucao do eid iguais a resolve_proposal_contact
-- (20261220120000) letra a letra; acrescenta-se so a coluna doc_org (organizacao
-- da proposta, ou a do negocio quando a da proposta e NULL) e a verificacao de
-- pertenca da entidade a doc_org (cinco ramos, o ultimo anew_entity_org_links).
CREATE OR REPLACE FUNCTION public.resolve_proposal_address(_proposal_id uuid)
RETURNS TABLE (
  address_id   uuid,
  address_type text,
  is_primary   boolean,
  valid_from   timestamptz,
  valid_to     timestamptz,
  created_at   timestamptz,
  street       text,
  number       text,
  floor        text,
  unit         text,
  postal_code  text,
  city         text,
  district     text,
  country      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH prop AS (
    SELECT p.entity_id, p.deal_id,
           COALESCE(
             p.organization_id,
             (SELECT d0.organization_id FROM public.deals d0 WHERE d0.id = p.deal_id)
           ) AS doc_org
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
    ) AS eid,
    prop.doc_org
    FROM prop
  )
  SELECT
    ea.address_id,
    ea.address_type,
    ea.is_primary,
    ea.valid_from,
    ea.valid_to,
    ea.created_at,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    a.district,
    a.country
  FROM resolved r
  JOIN public.anew_entity_addresses ea ON ea.entity_id = r.eid
  JOIN public.anew_addresses a ON a.id = ea.address_id
  WHERE r.eid IS NOT NULL
    -- Pertenca: a entidade tem de ser da MESMA organizacao do documento
    -- (criterio de sync_entity_primary_address, 20261120110000, mais a
    -- ligacao em anew_entity_org_links que is_entity_in_user_scope aceita).
    AND EXISTS (
      SELECT 1 FROM public.anew_leads l
        WHERE l.entity_id = r.eid AND l.organization_id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_contacts c
        WHERE c.entity_id = r.eid AND c.organization_id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_clients cl
        WHERE cl.entity_id = r.eid AND cl.organization_id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_organizations o
        WHERE o.entity_id = r.eid AND o.id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_entity_org_links ol
        WHERE ol.entity_id = r.eid AND ol.organization_id = r.doc_org
    )
    AND (ea.valid_to IS NULL OR ea.valid_to > now())
    AND ea.address_type IS DISTINCT FROM 'delivery'
  ORDER BY COALESCE(ea.is_primary, false) DESC, ea.created_at DESC, ea.id DESC
$function$;

COMMENT ON FUNCTION public.resolve_proposal_address(uuid) IS
  'Moradas activas (nao de entrega) do cliente de uma proposta, resolvidas '
  'PELA leitura da propria proposta. SECURITY DEFINER: confirma primeiro que o '
  'chamador pode ler a proposta (mesmo predicado de resolve_proposal_contact), '
  'que a entidade pertence a organizacao da proposta (ou do negocio, se a da '
  'proposta for NULL) -- por lead, contacto, cliente, organizacao ou ligacao em '
  'anew_entity_org_links, com igualdade exacta de organizacao -- e so entao devolve as moradas, primaria primeiro e depois a mais recente '
  '(is_primary DESC, created_at DESC, id DESC). EXECUTE so a authenticated.';

REVOKE ALL ON FUNCTION public.resolve_proposal_address(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_proposal_address(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_address(uuid) TO authenticated;


-- -- 2. resolve_quote_address --------------------------------------------------
-- Predicado de q e resolucao do eid iguais a resolve_quote_contact
-- (20261220120000) letra a letra; acrescenta-se so a coluna doc_org (organizacao
-- do orcamento) e a verificacao de pertenca da entidade a doc_org (cinco ramos,
-- o ultimo anew_entity_org_links).
CREATE OR REPLACE FUNCTION public.resolve_quote_address(_quote_id uuid)
RETURNS TABLE (
  address_id   uuid,
  address_type text,
  is_primary   boolean,
  valid_from   timestamptz,
  valid_to     timestamptz,
  created_at   timestamptz,
  street       text,
  number       text,
  floor        text,
  unit         text,
  postal_code  text,
  city         text,
  district     text,
  country      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT qt.entity_id, qt.cliente_id, qt.deal_id,
           qt.organization_id AS doc_org
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
    ) AS eid,
    q.doc_org
    FROM q
  )
  SELECT
    ea.address_id,
    ea.address_type,
    ea.is_primary,
    ea.valid_from,
    ea.valid_to,
    ea.created_at,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    a.district,
    a.country
  FROM resolved r
  JOIN public.anew_entity_addresses ea ON ea.entity_id = r.eid
  JOIN public.anew_addresses a ON a.id = ea.address_id
  WHERE r.eid IS NOT NULL
    -- Pertenca: a entidade tem de ser da MESMA organizacao do documento
    -- (criterio de sync_entity_primary_address, 20261120110000, mais a
    -- ligacao em anew_entity_org_links que is_entity_in_user_scope aceita).
    AND EXISTS (
      SELECT 1 FROM public.anew_leads l
        WHERE l.entity_id = r.eid AND l.organization_id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_contacts c
        WHERE c.entity_id = r.eid AND c.organization_id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_clients cl
        WHERE cl.entity_id = r.eid AND cl.organization_id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_organizations o
        WHERE o.entity_id = r.eid AND o.id = r.doc_org
      UNION ALL
      SELECT 1 FROM public.anew_entity_org_links ol
        WHERE ol.entity_id = r.eid AND ol.organization_id = r.doc_org
    )
    AND (ea.valid_to IS NULL OR ea.valid_to > now())
    AND ea.address_type IS DISTINCT FROM 'delivery'
  ORDER BY COALESCE(ea.is_primary, false) DESC, ea.created_at DESC, ea.id DESC
$function$;

COMMENT ON FUNCTION public.resolve_quote_address(uuid) IS
  'Moradas activas (nao de entrega) do cliente de um orcamento, resolvidas '
  'PELA leitura do proprio orcamento. SECURITY DEFINER: confirma primeiro que o '
  'chamador pode ler o orcamento (mesmo predicado de resolve_quote_contact), '
  'que a entidade pertence a organizacao do orcamento (por lead, contacto, '
  'cliente, organizacao ou ligacao em anew_entity_org_links, com igualdade '
  'exacta de organizacao) e so entao devolve as '
  'moradas, primaria primeiro e depois a mais recente '
  '(is_primary DESC, created_at DESC, id DESC). EXECUTE so a authenticated.';

REVOKE ALL ON FUNCTION public.resolve_quote_address(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_quote_address(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_quote_address(uuid) TO authenticated;


-- -- 3. Conferencia ------------------------------------------------------------
-- Tudo o que vem do catalogo e convertido para ::text. Nenhum caracter de
-- percentagem nas mensagens de RAISE: so concatenacao, via USING MESSAGE.
DO $check$
DECLARE
  r       record;
  v_def   text;
  v_res   constant text := 'TABLE(address_id uuid, address_type text, is_primary boolean, '
                        || 'valid_from timestamp with time zone, valid_to timestamp with time zone, '
                        || 'created_at timestamp with time zone, street text, number text, floor text, '
                        || 'unit text, postal_code text, city text, district text, country text)';
BEGIN
  FOR r IN
    SELECT f.fn, f.perm, f.contact_fn
    FROM (VALUES
      ('public.resolve_proposal_address(uuid)', 'proposals.view', 'public.resolve_proposal_contact(uuid)'),
      ('public.resolve_quote_address(uuid)',    'quotes.view',    'public.resolve_quote_contact(uuid)')
    ) AS f(fn, perm, contact_fn)
  LOOP
    -- 3a. Existe, sql, STABLE, SECURITY DEFINER, search_path=public, retorno certo.
    v_def := NULL;
    SELECT pg_catalog.pg_get_functiondef(pr.oid)::text
      INTO v_def
      FROM pg_catalog.pg_proc pr
      JOIN pg_catalog.pg_language l ON l.oid = pr.prolang
     WHERE pr.oid = to_regprocedure(r.fn)
       AND l.lanname::text = 'sql'
       AND pr.prosecdef
       AND pr.provolatile::text = 's'
       AND pr.proretset
       AND array_to_string(pr.proconfig, ',') = 'search_path=public'
       AND pg_catalog.pg_get_function_result(pr.oid)::text = v_res;
    IF v_def IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' em falta ou com atributos/retorno alterados';
    END IF;

    -- 3b. Predicado de acesso e filtros presentes.
    IF v_def NOT LIKE '%has_anew_permission((SELECT auth.uid()), ''' || r.perm || ''')%'
       OR v_def NOT LIKE '%get_user_crm_org_ids((SELECT auth.uid()))%'
       OR v_def NOT LIKE '%ea.address_type IS DISTINCT FROM ''delivery''%'
       OR v_def NOT LIKE '%(ea.valid_to IS NULL OR ea.valid_to > now())%'
       OR v_def NOT LIKE '%ORDER BY COALESCE(ea.is_primary, false) DESC, ea.created_at DESC, ea.id DESC%'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' sem o predicado de acesso, o filtro de moradas ou a ordem esperada';
    END IF;

    -- 3b2. Verificacao de pertenca da entidade a organizacao do documento.
    -- Os cinco ramos e o confronto com doc_org; os sublinhados de nomes como
    -- anew_leads sao escapados (\_) para casarem so o caracter literal.
    IF v_def NOT LIKE '%AS doc\_org%'
       OR v_def NOT LIKE '%public.anew\_leads l%WHERE l.entity\_id = r.eid AND l.organization\_id = r.doc\_org%'
       OR v_def NOT LIKE '%public.anew\_contacts c%WHERE c.entity\_id = r.eid AND c.organization\_id = r.doc\_org%'
       OR v_def NOT LIKE '%public.anew\_clients cl%WHERE cl.entity\_id = r.eid AND cl.organization\_id = r.doc\_org%'
       OR v_def NOT LIKE '%public.anew\_organizations o%WHERE o.entity\_id = r.eid AND o.id = r.doc\_org%'
       OR v_def NOT LIKE '%public.anew\_entity\_org\_links ol%WHERE ol.entity\_id = r.eid AND ol.organization\_id = r.doc\_org%'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' sem a verificacao de pertenca da entidade a organizacao do documento';
    END IF;

    -- 3c. A funcao de contacto irma continua a existir (o predicado foi copiado dela).
    IF to_regprocedure(r.contact_fn) IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao de referencia ' || r.contact_fn || ' em falta';
    END IF;

    -- 3d. Grants: authenticated executa; anon e PUBLIC nao.
    IF NOT has_function_privilege('authenticated', r.fn, 'EXECUTE') THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' sem EXECUTE para authenticated';
    END IF;
    IF has_function_privilege('anon', r.fn, 'EXECUTE') THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' ainda executavel por anon';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_proc pr,
             LATERAL aclexplode(pr.proacl) x
       WHERE pr.oid = to_regprocedure(r.fn)
         AND x.grantee = 0
         AND x.privilege_type::text = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' ainda executavel por PUBLIC';
    END IF;
  END LOOP;
END
$check$;
