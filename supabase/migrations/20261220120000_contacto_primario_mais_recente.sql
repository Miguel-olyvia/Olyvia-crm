-- ============================================================================
-- Contacto dos documentos: os leitores do contacto primario de uma ficha
-- passam a escolher o primario MAIS RECENTE, de forma deterministica.
--
-- POR APLICAR.
--
-- So os leitores. A mudanca das politicas de DELETE dos contactos (apagar um
-- contacto seguir o EDITAR da ficha) foi separada e esta EM ESPERA, fora da
-- pasta das migrations: vault/ficheiros/migracoes-em-espera/
-- contactos_apagar_segue_o_editar.sql.EM-ESPERA
--
--
-- -- EFEITO NA MUDELAR (funcoes partilhadas) ---------------------------------
--
--   * Os orcamentos (resolve_quote_contact), as propostas
--     (resolve_proposal_contact) e os resumos de contacto
--     (get_entity_contact_summary, usado na listagem/enriquecimento) passam a
--     mostrar o email e o telefone primarios MAIS RECENTES da ficha, em vez de
--     um primario qualquer escolhido pela ordem fisica das linhas. Numa ficha
--     com um so primario o resultado e exactamente o mesmo.
--   * NAO limpa dados: os primarios repetidos que ja existam ficam na tabela.
--   * NAO cria indice unico.
--   * DESEMPENHO: NAO medido (ver abaixo).
--
--
-- -- O PROBLEMA ---------------------------------------------------------------
--
-- Ha fichas com varios contactos marcados is_primary = true (medido: 5 copias
-- do mesmo email, todas primarias, na mesma entidade). Os leitores com
-- LIMIT 1 sem ORDER BY devolviam um primario arbitrario. Passam a
-- ORDER BY created_at DESC, id DESC: o mais recente ganha (e o que o
-- utilizador acabou de gravar) e o id desempata, para o resultado nao
-- depender do plano.
--
--
-- -- O QUE ESTA MIGRACAO NAO FAZ ----------------------------------------------
--
--   * NAO limpa os primarios repetidos ja existentes (sem backfill).
--   * NAO cria indice unico parcial de "um primario por entidade". Ambos ficam
--     para uma fase posterior, depois de medida a extensao dos duplicados.
--   * NAO muda assinatura, tipo de retorno, atributos nem grants das tres
--     funcoes; so acrescenta o ORDER BY nos subselects de contacto.
--     get_entity_contact_summary continua SECURITY INVOKER (como em
--     20261113040000); resolve_*_contact continuam SECURITY DEFINER.
--
-- DESEMPENHO: NAO medido. O ORDER BY corre sobre as linhas primarias de UMA
-- entidade (normalmente 1, em casos degenerados poucas), ja localizadas pelo
-- indice por entity_id; o custo esperado e desprezavel, mas nao ha EXPLAIN.
--
-- Estado de partida confirmado por leitura (grep a todas as migrations
-- posteriores): resolve_proposal_contact / resolve_quote_contact de
-- 20261119060000; get_entity_contact_summary de 20261113040000. Nenhuma
-- posterior as redefine.
-- ============================================================================


-- -- 1. resolve_proposal_contact: primario mais recente ------------------------
-- Igual a 20261119060000 letra a letra, excepto o ORDER BY nos tres subselects.
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
       WHERE em.entity_id = e.id AND em.is_primary = true
       ORDER BY em.created_at DESC, em.id DESC LIMIT 1) AS email,
    (SELECT ph.phone_number FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true
       ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1) AS phone_number,
    (SELECT ph.country_code FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true
       ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1) AS country_code
  FROM resolved r
  JOIN public.anew_entities e ON e.id = r.eid
  WHERE r.eid IS NOT NULL
$function$;

COMMENT ON FUNCTION public.resolve_proposal_contact(uuid) IS
  'Contacto primario (email/telefone) do cliente de uma proposta, resolvido '
  'PELA leitura da propria proposta. SECURITY DEFINER: confirma primeiro que o '
  'chamador pode ler a proposta (mesmo predicado da politica de SELECT) e so '
  'entao resolve o contacto, com a visibilidade do documento ja confirmada. '
  'Havendo varios primarios, devolve o MAIS RECENTE (created_at DESC, id DESC). '
  'EXECUTE so a authenticated (anon revogado).';

REVOKE EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_contact(uuid) TO authenticated;


-- -- 2. resolve_quote_contact: primario mais recente ---------------------------
-- Igual a 20261119060000 letra a letra, excepto o ORDER BY nos tres subselects.
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
       WHERE em.entity_id = e.id AND em.is_primary = true
       ORDER BY em.created_at DESC, em.id DESC LIMIT 1) AS email,
    (SELECT ph.phone_number FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true
       ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1) AS phone_number,
    (SELECT ph.country_code FROM public.anew_entity_phones ph
       WHERE ph.entity_id = e.id AND ph.is_primary = true
       ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1) AS country_code
  FROM resolved r
  JOIN public.anew_entities e ON e.id = r.eid
  WHERE r.eid IS NOT NULL
$function$;

COMMENT ON FUNCTION public.resolve_quote_contact(uuid) IS
  'Contacto primario (email/telefone) do cliente de um orcamento, resolvido '
  'PELA leitura do proprio orcamento. SECURITY DEFINER: confirma primeiro que '
  'o chamador pode ler o orcamento (mesmo predicado da politica de SELECT) e '
  'so entao resolve o contacto. Havendo varios primarios, devolve o MAIS '
  'RECENTE (created_at DESC, id DESC). EXECUTE so a authenticated (anon '
  'revogado).';

REVOKE EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_quote_contact(uuid) TO authenticated;


-- -- 3. get_entity_contact_summary: primario mais recente ----------------------
-- Igual a 20261113040000 letra a letra, excepto o ORDER BY nos dois subselects
-- de contacto. Continua SECURITY INVOKER (sem SECURITY DEFINER), de proposito.
-- Grants iguais aos de 20261113040000 (so GRANT a authenticated, sem REVOKE).
CREATE OR REPLACE FUNCTION public.get_entity_contact_summary(_entity_ids uuid[])
RETURNS TABLE (
  entity_id uuid,
  display_name text,
  email text,
  phone_number text,
  last_interaction_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    e.id AS entity_id,
    e.display_name,
    (
      SELECT em.email
      FROM public.anew_entity_emails em
      WHERE em.entity_id = e.id
        AND em.is_primary = true
      ORDER BY em.created_at DESC, em.id DESC
      LIMIT 1
    ) AS email,
    (
      SELECT ph.phone_number
      FROM public.anew_entity_phones ph
      WHERE ph.entity_id = e.id
        AND ph.is_primary = true
      ORDER BY ph.created_at DESC, ph.id DESC
      LIMIT 1
    ) AS phone_number,
    (
      SELECT i.interaction_at
      FROM public.entity_interactions i
      WHERE i.entity_id = e.id
      ORDER BY i.interaction_at DESC
      LIMIT 1
    ) AS last_interaction_at
  FROM public.anew_entities e
  WHERE e.id = ANY(_entity_ids)
$function$;

COMMENT ON FUNCTION public.get_entity_contact_summary(uuid[]) IS
  'Nome, email primario, telefone primario e ultima interacao por entidade, '
  'numa chamada em vez de quatro. Os ids seguem no corpo do POST e nao no URL, '
  'que era onde estava metade do tempo da vaga de enriquecimento. '
  'Havendo varios primarios, devolve o MAIS RECENTE (created_at DESC, id DESC). '
  'SECURITY INVOKER de proposito: o RLS de cada tabela tem de continuar a '
  'aplicar-se, sobretudo o de emails e telefones.';

GRANT EXECUTE ON FUNCTION public.get_entity_contact_summary(uuid[]) TO authenticated;


-- -- 4. Conferencia ------------------------------------------------------------
-- Tudo o que vem do catalogo e convertido para ::text. Nenhum caracter de
-- percentagem nas mensagens de RAISE: so concatenacao, via USING MESSAGE.
DO $check$
DECLARE
  r          record;
  v_def      text;
  v_found    int;
  v_expected int;
  v_pat_em   constant text := 'ORDER BY em.created_at DESC, em.id DESC';
  v_pat_ph   constant text := 'ORDER BY ph.created_at DESC, ph.id DESC';
BEGIN
  -- 4a. As tres funcoes existem, sao STABLE, mantem SECURITY DEFINER / INVOKER
  --     como antes e tem o ORDER BY em todos os subselects de contacto.
  FOR r IN
    SELECT f.fn, f.n_em, f.n_ph, f.must_definer
    FROM (VALUES
      ('public.resolve_proposal_contact(uuid)',     1, 2, true),
      ('public.resolve_quote_contact(uuid)',        1, 2, true),
      ('public.get_entity_contact_summary(uuid[])', 1, 1, false)
    ) AS f(fn, n_em, n_ph, must_definer)
  LOOP
    v_def := NULL;  -- explicito: cada volta parte do zero
    SELECT pg_catalog.pg_get_functiondef(pr.oid)::text
      INTO v_def
      FROM pg_catalog.pg_proc pr
     WHERE pr.oid = to_regprocedure(r.fn)
       AND pr.prosecdef = r.must_definer
       AND pr.provolatile::text = 's';
    IF v_def IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' em falta ou com atributos alterados (STABLE / SECURITY)';
    END IF;
    IF v_def NOT LIKE '%' || v_pat_em || '%' OR v_def NOT LIKE '%' || v_pat_ph || '%' THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' sem o ORDER BY created_at DESC, id DESC';
    END IF;
    v_expected := r.n_em;
    v_found := (length(v_def) - length(replace(v_def, v_pat_em, ''))) / length(v_pat_em);
    IF v_found <> v_expected THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ': ORDER BY de email em ' || v_found::text
        || ' subselects, esperados ' || v_expected::text;
    END IF;
    v_expected := r.n_ph;
    v_found := (length(v_def) - length(replace(v_def, v_pat_ph, ''))) / length(v_pat_ph);
    IF v_found <> v_expected THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ': ORDER BY de telefone em ' || v_found::text
        || ' subselects, esperados ' || v_expected::text;
    END IF;
  END LOOP;

  -- 4b. Grants: authenticated executa as tres; anon nao executa as duas
  --     resolve_*_contact (revogado acima). get_entity_contact_summary nao e
  --     verificada para anon porque 20261113040000 nunca lho revogou.
  FOR r IN
    SELECT f.fn, f.anon_revoked
    FROM (VALUES
      ('public.resolve_proposal_contact(uuid)',     true),
      ('public.resolve_quote_contact(uuid)',        true),
      ('public.get_entity_contact_summary(uuid[])', false)
    ) AS f(fn, anon_revoked)
  LOOP
    IF NOT has_function_privilege('authenticated', r.fn, 'EXECUTE') THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' sem EXECUTE para authenticated';
    END IF;
    IF r.anon_revoked AND has_function_privilege('anon', r.fn, 'EXECUTE') THEN
      RAISE EXCEPTION USING MESSAGE = 'Funcao ' || r.fn || ' ainda executavel por anon';
    END IF;
  END LOOP;
END
$check$;
