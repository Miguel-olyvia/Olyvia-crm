-- ============================================================
-- 20261226180000_neg_criar_proposta_uma_viva
-- ============================================================
-- Decisão do utilizador (21/10, ponto 3, escolha A): aplicar no servidor a
--   mesma restrição de propostas que a interface já aplica.
--
-- O que faz: neg_criar_proposta (nossa; a partilhada rpc_create_proposal NÃO
--   se toca) passa a recusar criar uma proposta num negócio que já tem uma
--   proposta enviada ou aceite que o cliente não recusou: NG025, «Este negócio
--   já tem uma proposta enviada ou aceite: não se cria outra.».
--   A regra é a do ecrã, igual palavra por palavra:
--     PainelPropostaReal passa propostaVivaNoNegocio = temPropostaEnviadaOuAceite
--     (src/hooks/pessoas/documentosDoNegocio.ts): alguma proposta do negócio
--     que NÃO está recusada (propostaViva.ts: rejeitado, rejeitada, recusado,
--     recusada, rejected, declined, lost) e cujo estado NÃO é rascunho
--     (estadoPropostaDeDb em adaptarNegociosFicha.ts: draft e rascunho são
--     rascunho; accepted, aceite, aceita, approved são aceite; sent, viewed,
--     enviada, enviado, rejected, declined, expired são enviada; um estado
--     desconhecido é aceite com accepted_at, enviada com sent_at, senão
--     rascunho). Estado comparado em minúsculas e sem espaços nas pontas.
--     As propostas são as que a ficha mostra no negócio: negocio_id = o
--     negócio, deleted_at nulo e is_deleted não verdadeiro, com a RLS de quem
--     chama (a função é INVOKER, como a ficha). Essa RLS é só de organização:
--     a política de leitura de proposals (20261130040000) pede proposals.view
--     e a organização no âmbito de CRM de quem lê, sem âmbito por comercial,
--     por isso quem passa por fn_neg_negocio_editavel vê as propostas dos
--     colegas do mesmo negócio e a verificação não é contornada por um âmbito
--     mais estreito. O único caso fora é quem cria propostas sem
--     proposals.view: não vê nenhuma e a regra não o trava (cria-se com
--     proposals.create; a ficha também não lhe mostra propostas).
--   A verificação corre depois de fn_neg_negocio_editavel, que tranca o
--   negócio (FOR NO KEY UPDATE): duas criações ao mesmo tempo no mesmo
--   negócio esperam uma pela outra e a segunda vê a primeira.
--   Uma proposta em rascunho não impede: criar outra continua possível, como
--   no ecrã.
--   Fica igual: assinatura, INVOKER, VOLATILE, search_path e privilégios
--   (EXECUTE só para authenticated; CREATE OR REPLACE mantém-nos; o CONFERIR
--   confirma). Muda o comentário (lista o NG025).
--
-- Desempenho: uma leitura pelo índice idx_proposals_negocio_id, só nas
--   criações de propostas a partir de um negócio. Nenhuma leitura de catálogo
--   na função. Medido na nike a 21/10 (só leitura): ver o relatório.
--
-- MUDELAR: nada. A Mudelar não tem negocio_workflow_config (NG008 antes de
--   chegar aqui) e nenhuma tabela, política ou função partilhada é tocada.
-- PRECISA DE CÓDIGO? Não parte nada. Para a mensagem sair traduzida, o ecrã
--   tem de conhecer o NG025: src/hooks/pessoas/errosNeg.ts (CHAVES_ERRO_NEG e
--   a expressão CODIGO_NO_TEXTO, hoje NG001 a NG024) e
--   src/translations/pessoasErros.ts (pt e en). Sem isso aparece a mensagem
--   genérica. O ecrã já não deixa chegar aqui com uma proposta viva.
-- LACUNAS (fora deste passo; a regra vale no botão e em neg_criar_proposta, não
--   é uma garantia absoluta do servidor). Uma proposta viva continua a poder
--   nascer num negócio por quatro outras vias, e o utilizador deve sabê-lo:
--     (a) dois rascunhos criados antes (a regra só vale na criação) podem ser
--         enviados depois, e ficam duas propostas vivas;
--     (b) neg_ligar_registo liga à mão uma proposta já enviada a um negócio
--         que já tem outra;
--     (c) a partilhada rpc_create_proposal, chamada diretamente, cria a
--         proposta sem negocio_id (liga-se depois por (b));
--     (d) a proposta da cadeia herda o negócio do orçamento no gatilho AFTER
--         de 20261226150000, sem passar por aqui.
--   Fechar (a) a (d) pede um gatilho em proposals (tabela partilhada com a
--   Mudelar: só se faz depois de medir o custo na nike e com autorização
--   expressa). Não se fez nesta ronda.
-- ORDEM: depois de 20261226150000 (que criou a função).
-- Pré-condição: md5 da versão de 20261226150000 lido no remoto a 21/10
--   (00da3808cf5a63c8a59633afd7aaad9c).
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226180000_neg_criar_proposta_uma_viva.sql).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  -- A versão a substituir é a de 20261226150000 (md5 lido no remoto a 21/10).
  IF pg_catalog.to_regprocedure('public.neg_criar_proposta(uuid,jsonb,uuid[],jsonb,jsonb,uuid)') IS NULL
     OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.neg_criar_proposta(uuid,jsonb,uuid[],jsonb,jsonb,uuid)')))
        IS DISTINCT FROM '00da3808cf5a63c8a59633afd7aaad9c' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_criar_proposta não está na versão de 20261226150000; nada feito.';
  END IF;
  -- As colunas que a verificação lê.
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.proposals'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attname::text IN ('negocio_id', 'status', 'deleted_at', 'is_deleted', 'accepted_at', 'sent_at')) <> 6 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam colunas em proposals; nada feito.';
  END IF;
  -- O código NG025 ainda não é usado por nenhuma função.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%NG025%') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: o código NG025 já está em uso; nada feito.';
  END IF;
END
$pre$;

-- ============================================================
-- neg_criar_proposta (a de 20261226150000, mais a verificação NG025)
-- ============================================================

CREATE OR REPLACE FUNCTION public.neg_criar_proposta(p_negocio_id uuid, p_proposal_data jsonb, p_selected_quote_ids uuid[] DEFAULT ARRAY[]::uuid[], p_inline_quotes jsonb DEFAULT '[]'::jsonb, p_proposal_items jsonb DEFAULT '[]'::jsonb, p_quote_entity_id uuid DEFAULT NULL::uuid)
 RETURNS proposals
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg public.negocios;
  v_p   public.proposals;
BEGIN
  IF p_proposal_data IS NULL OR jsonb_typeof(p_proposal_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados da proposta.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF NULLIF(p_proposal_data ->> 'organization_id', '')::uuid IS DISTINCT FROM v_neg.organization_id
     OR NULLIF(p_proposal_data ->> 'entity_id', '')::uuid IS DISTINCT FROM v_neg.entity_id THEN
    RAISE EXCEPTION 'A proposta tem de ser da mesma organização e da mesma pessoa do negócio.'
      USING ERRCODE = 'NG004';
  END IF;

  -- 20261226180000: a regra do ecrã (temPropostaEnviadaOuAceite, em
  -- src/hooks/pessoas/documentosDoNegocio.ts, com propostaRecusada e
  -- estadoPropostaDeDb), sobre as mesmas propostas que a ficha mostra no
  -- negócio. Uma proposta conta se o cliente não a recusou e já saiu de
  -- rascunho: estado de aceite ou de enviada, ou, com um estado desconhecido,
  -- accepted_at ou sent_at preenchidos. O negócio está trancado (FOR NO KEY
  -- UPDATE em fn_neg_negocio_editavel): duas criações ao mesmo tempo não passam
  -- as duas.
  IF EXISTS (
    SELECT 1
    FROM public.proposals pr
    CROSS JOIN LATERAL (SELECT lower(btrim(COALESCE(pr.status::text, ''))) AS s) e
    WHERE pr.negocio_id = v_neg.id
      AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
      AND e.s NOT IN ('rejeitado', 'rejeitada', 'recusado', 'recusada', 'rejected', 'declined', 'lost')
      AND e.s NOT IN ('draft', 'rascunho')
      AND (e.s IN ('accepted', 'aceite', 'aceita', 'approved',
                   'sent', 'viewed', 'enviada', 'enviado', 'expired')
           OR pr.accepted_at IS NOT NULL OR pr.sent_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Este negócio já tem uma proposta enviada ou aceite: não se cria outra.'
      USING ERRCODE = 'NG025';
  END IF;

  PERFORM set_config('app.neg_criar_proposta', v_neg.id::text, true);
  v_p := public.rpc_create_proposal(p_proposal_data, p_selected_quote_ids, p_inline_quotes,
                                    p_proposal_items, p_quote_entity_id);
  PERFORM set_config('app.neg_criar_proposta', '', true);

  IF v_p.negocio_id IS DISTINCT FROM v_neg.id THEN
    RAISE EXCEPTION 'A proposta não ficou ligada ao negócio.' USING ERRCODE = 'NG004';
  END IF;
  RETURN v_p;
END;
$function$;

COMMENT ON FUNCTION public.neg_criar_proposta(uuid, jsonb, uuid[], jsonb, jsonb, uuid) IS
  'Pessoas: cria uma proposta já ligada ao negócio (aberto), envolvendo rpc_create_proposal sem a alterar. Recusa uma segunda proposta enviada ou aceite (não recusada) no mesmo negócio, com a regra do ecrã (NG025). NG001, NG002, NG004, NG008, NG009, NG025. Se rpc_create_proposal mudar de argumentos, esta função tem de acompanhar. 20261226150000, 20261226180000.';

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  v_txt text;
BEGIN
  -- Atributos, privilégios (como lidos no remoto a 21/10: EXECUTE só para o
  -- dono e authenticated), uma só assinatura e a versão desta migration.
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES ('public.neg_criar_proposta(uuid,jsonb,uuid[],jsonb,jsonb,uuid)')) AS e(sig)
            LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 'v'
               OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
               OR md5(pg_catalog.pg_get_functiondef(p.oid)) IS DISTINCT FROM '285451e5cea8bf2b292d7bd2ba5b2b78');
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_criar_proposta') <> 1 THEN
    v_txt := COALESCE(v_txt || ', ', '') || 'mais do que uma neg_criar_proposta';
  END IF;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (atributos, privilégios ou versão de neg_criar_proposta): %', v_txt;
  END IF;
END
$conferir$;

COMMIT;
