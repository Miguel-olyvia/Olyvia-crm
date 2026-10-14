-- ============================================================================
-- Propostas ATRIBUIDAS a um comercial passam a entrar no ambito dele.
-- ============================================================================
--
-- O DEFEITO
-- ---------
-- Na listagem de propostas, um comercial com ambito OWNED ou TEAM ve:
--   * as propostas do negocio de uma lead atribuida a ele (ou a equipa), e
--   * as propostas que ele (ou a equipa) CRIOU (created_by).
-- O campo proposals.assigned_to -- o "Comercial" escolhido no formulario --
-- nunca contou. Caso real: proposta criada por A, atribuida a B, sem negocio
-- (deal_id nulo) -> nao aparece a B em lado nenhum da listagem.
--
-- A REGRA NOVA
-- ------------
-- No modo IDS, a proposta passa TAMBEM se assigned_to estiver em
-- _scope_created_by_ids, SEMPRE -- sem a condicao de fallback que a regra de
-- created_by tem em ambito OWNED (_created_by_fallback_only). Tudo o resto
-- fica exactamente igual: organizacao, deleted_at, a regra por deal_id, a
-- regra por created_by com o seu fallback, e o modo ORG.
-- Em TEAM, _scope_created_by_ids leva o proprio e os membros da equipa, por
-- isso passam a entrar tambem as propostas atribuidas a membros da equipa --
-- coerente com o que ja acontecia para as que eles criaram.
--
-- QUEM E AFECTADO (todos passam por proposals_in_scope)
-- ------------------------------------------------------
-- Lido nas versoes em vigor:
--   * proposals_list_filtered (20261116010000) -- FROM proposals_in_scope(...)
--   * get_proposals_list_page   (20261113070000) -- via proposals_list_filtered
--   * get_proposals_list_metrics(20261113070000) -- via proposals_list_filtered
--   * get_proposals_alert_feed  (20261113070000) -- FROM proposals_in_scope(...)
-- Nenhuma destas replica o predicado de ambito; por isso basta mudar esta
-- funcao. (resolve_proposal_contact, 20261119040000, reproduz a politica de
-- RLS de leitura e nao o ambito da listagem; nao e tocada aqui.)
-- A RLS de SELECT de proposals e ao nivel da organizacao (20261130040000),
-- por isso nao esconde a proposta atribuida: quem decide e este predicado.
--
-- EFEITO PARA A MUDELAR
-- ---------------------
-- A lista, os cartoes de metricas e as barras de alerta de TODOS os
-- comerciais com ambito OWNED/TEAM passam a incluir as propostas que lhes
-- estao atribuidas (ou, em TEAM, a membros da equipa). Quem tem ambito ORG
-- (ou e system admin) nao ve diferenca nenhuma.
--
-- CODIGO NO CLIENTE: NAO E PRECISO
-- --------------------------------
-- Confirmado por leitura: src/pages/Proposals.tsx (loadData, ~859-905) envia
-- em _scope_created_by_ids o id de anew_users do proprio (e da equipa em
-- TEAM) -- o mesmo espaco de ids de proposals.assigned_to -- e
-- src/lib/proposalsListQuery.ts passa-o tal e qual as RPCs. Depois da RPC o
-- cliente le as linhas por id (.in("id", ...)) e NAO volta a filtrar por
-- created_by, por isso as propostas novas aparecem sem mudar o frontend.
--
-- INDICE
-- ------
-- Nao se cria nenhum: idx_proposals_assigned_to (btree em assigned_to) ja
-- existe desde o baseline (20260615130000) e foi confirmado no remoto em
-- 20261201120000. O bloco de conferencia avisa (WARNING) se faltar.
--
-- DESEMPENHO: NAO MEDIDO. A condicao nova e mais um ramo OR sobre linhas ja
-- filtradas por organizacao; nao ha subconsulta nova.
--
-- Sem backfill; nenhuma outra funcao e alterada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proposals_in_scope(
  _organization_id          uuid,
  _scope_mode               text,
  _scope_deal_ids           uuid[],
  _scope_created_by_ids     uuid[],
  _created_by_fallback_only boolean
)
RETURNS SETOF public.proposals
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT p.*
  FROM public.proposals p
  WHERE p.organization_id = _organization_id
    AND p.deleted_at IS NULL
    AND (
      _scope_mode = 'ORG'
      OR (_scope_deal_ids IS NOT NULL AND p.deal_id = ANY (_scope_deal_ids))
      OR (_scope_created_by_ids IS NOT NULL AND p.assigned_to = ANY (_scope_created_by_ids))
      OR (
        _scope_created_by_ids IS NOT NULL
        AND p.created_by = ANY (_scope_created_by_ids)
        AND (
          NOT _created_by_fallback_only
          OR NOT EXISTS (
            SELECT 1
            FROM public.proposals p2
            WHERE p2.organization_id = _organization_id
              AND p2.deleted_at IS NULL
              AND _scope_deal_ids IS NOT NULL
              AND p2.deal_id = ANY (_scope_deal_ids)
          )
        )
      )
    )
$function$;

COMMENT ON FUNCTION public.proposals_in_scope(uuid, text, uuid[], uuid[], boolean) IS
  'Propostas nao apagadas de uma organizacao, restritas ao ambito JA RESOLVIDO '
  'pelo cliente. Modo IDS: entra a proposta cujo deal_id esta em _scope_deal_ids, '
  'OU cujo assigned_to esta em _scope_created_by_ids (sempre, desde 20261214110000), '
  'OU cujo created_by esta em _scope_created_by_ids (em OWNED so quando nao ha '
  'propostas pelos deals). Nao decide autorizacao: aplica o predicado que recebe. '
  'SECURITY INVOKER -- o RLS de proposals continua a aplicar-se.';

GRANT EXECUTE ON FUNCTION public.proposals_in_scope(uuid, text, uuid[], uuid[], boolean) TO authenticated;


-- ── Conferencia ─────────────────────────────────────────────────────────────
DO $check$
DECLARE
  v_count    integer;
  v_oid      oid;
  v_args     text;
  v_def      text;
  v_volatile text;
  v_secdef   boolean;
  v_retset   boolean;
  v_rettype  text;
  v_config   text;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname::text = 'public'
    AND pr.proname::text = 'proposals_in_scope';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'proposals_in_scope: esperava 1 versao, encontrei %', v_count;
  END IF;

  SELECT pr.oid,
         pg_get_function_identity_arguments(pr.oid)::text,
         pg_get_functiondef(pr.oid)::text,
         pr.provolatile::text,
         pr.prosecdef,
         pr.proretset,
         pr.prorettype::regtype::text,
         COALESCE(array_to_string(pr.proconfig, ','), '')::text
    INTO v_oid, v_args, v_def, v_volatile, v_secdef, v_retset, v_rettype, v_config
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname::text = 'public'
    AND pr.proname::text = 'proposals_in_scope';

  IF v_args <> '_organization_id uuid, _scope_mode text, _scope_deal_ids uuid[], _scope_created_by_ids uuid[], _created_by_fallback_only boolean' THEN
    RAISE EXCEPTION 'proposals_in_scope: assinatura inesperada: %', v_args;
  END IF;

  IF NOT v_retset
     OR NOT EXISTS (SELECT 1 FROM pg_proc pr2
                    WHERE pr2.oid = v_oid
                      AND pr2.prorettype = 'public.proposals'::regtype) THEN
    RAISE EXCEPTION 'proposals_in_scope: retorno inesperado (setof=%, tipo=%)', v_retset, v_rettype;
  END IF;

  IF v_volatile <> 's' THEN
    RAISE EXCEPTION 'proposals_in_scope: deixou de ser STABLE (provolatile=%)', v_volatile;
  END IF;

  IF v_secdef THEN
    RAISE EXCEPTION 'proposals_in_scope: passou a SECURITY DEFINER, devia ser INVOKER';
  END IF;

  IF v_config NOT LIKE '%search_path=public%' THEN
    RAISE EXCEPTION 'proposals_in_scope: search_path inesperado: %', v_config;
  END IF;

  IF v_def NOT LIKE '%p.assigned_to = ANY (_scope_created_by_ids)%' THEN
    RAISE EXCEPTION 'proposals_in_scope: a regra nova por assigned_to nao esta na definicao';
  END IF;

  IF v_def NOT LIKE '%p.created_by = ANY (_scope_created_by_ids)%'
     OR v_def NOT LIKE '%NOT _created_by_fallback_only%'
     OR v_def NOT LIKE '%p.deal_id = ANY (_scope_deal_ids)%'
     OR v_def NOT LIKE '%p.deleted_at IS NULL%'
     OR v_def NOT LIKE '%p.organization_id = _organization_id%'
     OR v_def NOT LIKE '%_scope_mode = ''ORG''%' THEN
    RAISE EXCEPTION 'proposals_in_scope: uma das regras existentes desapareceu da definicao';
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'proposals_in_scope: authenticated perdeu EXECUTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes i
    WHERE i.schemaname::text = 'public'
      AND i.tablename::text = 'proposals'
      AND i.indexdef::text LIKE '%(assigned_to%'
  ) THEN
    RAISE WARNING 'proposals_in_scope: nao ha indice em proposals(assigned_to); a regra nova funciona mas sem apoio de indice';
  END IF;
END
$check$;
