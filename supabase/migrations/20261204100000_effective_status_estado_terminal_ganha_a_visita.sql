-- ============================================================================
-- effective_status — um estado TERMINAL ganha a um facto histórico
--
-- Altera: public.get_scoped_leads_base
--   (p_org_id uuid, p_is_root boolean, p_scope text, p_status text,
--    p_campaign_id uuid, p_assigned_to uuid, p_assigned_unassigned boolean,
--    p_contact_result text, p_contact_result_none boolean, p_source text,
--    p_source_is_null boolean, p_search text, p_date_from timestamptz,
--    p_date_to timestamptz, p_date_field text)
--
-- A assinatura, o tipo de retorno, STABLE SECURITY DEFINER e
-- SET search_path TO 'public' ficam EXACTAMENTE como estão. O corpo muda numa
-- coisa só: acrescenta UM ramo ao CASE que calcula a coluna effective_status.
--
-- Depende de:
--   public.resolve_lead_access_context(uuid, text, text) — NÃO é tocada
--   public.anew_leads, public.lead_contact_results       — NÃO são tocadas
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA, COMO SE MANIFESTA EM PRODUÇÃO
-- ---------------------------------------------------------------------------
-- A lista de leads e os cartões de contagem no topo não mostram l.status: usam
-- a coluna CALCULADA effective_status, que sai desta função. O CASE que a
-- calcula avalia os ramos por ordem e fica no primeiro que der verdade.
--
-- Uma lead que teve visita agendada e que DEPOIS foi registada como perdida
-- continua com scheduled_visit_id preenchido — e tem de continuar, é um facto
-- que aconteceu. Só que o ramo da visita estava ANTES de qualquer consideração
-- sobre 'lost'/'rejected', logo era ele que ganhava. Resultado: a lead aparece
-- como "Visita Agendada", e desaparece do cartão Lost/Rejected. O utilizador
-- registou a perda e a lista continua a dizer-lhe que há uma visita marcada.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO ANTES DE ESCREVER ESTE FICHEIRO
-- ---------------------------------------------------------------------------
--
--   F1. Definição VIVA da função obtida por pg_get_functiondef() em 22/09/2026.
--       É essa e só essa que serve de base a este ficheiro. NÃO foi
--       reconstruída a partir de nenhuma migração antiga — um ficheiro antigo
--       teria deixado cair, em silêncio, todas as correcções feitas à função
--       desde então (a pesquisa palavra a palavra, o p_date_field com os três
--       modos, o p_source_is_null, o scope OWNED/TEAM). O corpo da PARTE 3 é o
--       corpo vivo, byte a byte, com a única diferença do ramo novo.
--
--   F2. O CASE vivo tinha esta ordem de ramos:
--         1. converted   (converted_at / converted_to_* / status='converted')
--         2. qualified | negotiation
--         3. status = 'visit_scheduled'
--         4. scheduled_visit_id IS NOT NULL
--         5. last_contact_result diz "visita agendada"
--         6. ELSE o status tal como está
--       'lost' e 'rejected' NÃO estavam entre os estados decisivos: só chegavam
--       ao ELSE, e só se nenhum dos três ramos de visita tivesse disparado
--       antes.
--
--   F3. Contagem ao vivo das leads afectadas — leads com status 'lost' ou
--       'rejected' que o CASE mostrava como 'visit_scheduled':
--
--         Mudelar  ....  93 em 'lost'
--         Mudelar  ....  59 em 'rejected'
--         BMGest   ....   1 em 'rejected'
--                       ----
--                        153 leads
--
--       153 leads a serem contadas no cartão errado. Não é um caso de canto.
--
--   F4. A função tem exactamente UM overload, com os 15 argumentos acima
--       (confirmado em pg_proc). A ACL é {postgres=X, authenticated=X,
--       service_role=X}.
--
--   F5. O filtro por p_status no fim da função já trata 'lost' e 'rejected'
--       como o mesmo cartão:
--         OR (p_status = 'lost' AND cl.effective_status IN ('lost', 'rejected'))
--       Ou seja, a máquina de filtrar já estava certa — o que estava errado era
--       o valor que lhe chegava. É por isso que a correcção é no CASE e em mais
--       lado nenhum.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--
--   D1. A REGRA, dita pelo utilizador: "a visita agendada foi antes do registar
--       como perdido, logo se registou como perdido tem de ir para
--       lost/rejected".
--
--       Não é uma excepção nova, é o princípio que a função JÁ aplicava e que
--       só não tinha sido aplicado até ao fim: um ESTADO TERMINAL ganha a um
--       FACTO HISTÓRICO. É exactamente o que o ramo 1 faz com 'converted' (uma
--       lead convertida que também teve visita mostra 'converted', não
--       'visit_scheduled') e o que o ramo 2 faz com 'qualified'/'negotiation'.
--       'lost' e 'rejected' eram os dois que faltavam à lista.
--
--   D2. UM ramo novo, e nada mais.
--
--         WHEN LOWER(l.status::text) IN ('lost', 'rejected')
--           THEN LOWER(l.status::text)
--
--       LOWER() para acompanhar os ramos vizinhos, que já normalizam assim.
--       Devolve o próprio status em vez de uma literal, para 'lost' e 'rejected'
--       continuarem distintos um do outro — juntá-los aqui seria conveniente
--       para o cartão (F5 já os junta) mas destruiria a diferença para quem
--       filtre por um só.
--
--   D3. A POSIÇÃO do ramo é a correcção. Não é o texto.
--       Tem de ficar DEPOIS do converted e do qualified/negotiation — uma lead
--       perdida que mais tarde foi convertida é uma conversão, e o converted
--       mantém a primazia que sempre teve — e ANTES dos três ramos de visita,
--       que é onde estava o erro. Pôr o mesmo ramo no fim do CASE não mudava
--       absolutamente nada. É por isso que o auto-teste da PARTE 5 compara
--       POSIÇÕES no texto da definição e não se contenta com a presença do
--       ramo: verificar só que o ramo existe daria verde a uma migração que não
--       corrige nada.
--
--   D4. Os três ramos da visita ficam INTACTOS, incluindo o que lê o
--       last_contact_result e o que faz JOIN a lead_contact_results. Continuam
--       a valer para tudo o que não seja terminal — uma lead viva com visita
--       marcada continua a mostrar 'visit_scheduled' como sempre mostrou.
--
--   D5. CREATE OR REPLACE, NUNCA DROP.
--       A assinatura e o tipo de retorno não mudam, logo o REPLACE chega. E o
--       DROP seria activamente mau aqui: apagaria a ACL de F4 e, durante a
--       migração, haveria uma janela em que a função não existia — esta é
--       chamada em CADA abertura da lista de leads e em CADA recarregamento dos
--       cartões, ao contrário de uma RPC de manutenção. DROP + CREATE também
--       deixaria a função a nascer com EXECUTE para PUBLIC, sendo ela SECURITY
--       DEFINER, o que a exporia a anon.
--
--   D6. ACL reafirmada por segurança, não por necessidade.
--       CREATE OR REPLACE preserva a ACL (F4), por isso as três linhas da
--       PARTE 4 são, em rigor, redundantes. Ficam na mesma para o ficheiro ser
--       auto-suficiente: quem o ler sabe qual é a ACL pretendida sem ter de ir
--       à base de dados, e se alguém um dia trocar o REPLACE por um DROP o
--       ficheiro já não deixa a função aberta a PUBLIC.
--
--   D7. O auto-teste NÃO chama a função.
--       Dentro de uma migração auth.uid() é NULL, logo
--       resolve_lead_access_context não resolve contexto nenhum e a chamada
--       rebentaria por um motivo que nada tem a ver com o que se quer provar. O
--       auto-teste lê pg_get_functiondef() da função já criada e verifica o
--       texto: que o ramo novo lá está, que está ANTES da visita (D3), e que os
--       ramos do converted e do qualified/negotiation continuam onde estavam.
--
--   D8. NENHUMA lead é alterada por esta migração. Nem uma linha de UPDATE.
--       Ver a secção IMPACTO.
--
-- ---------------------------------------------------------------------------
-- IMPACTO — LER ANTES DE APLICAR
-- ---------------------------------------------------------------------------
-- Objectos alterados: 1 função. Nenhuma tabela, nenhum trigger, nenhuma
-- política RLS, nenhuma linha de dados. public.anew_leads NÃO é escrita.
--
-- O efeito é puramente de APRESENTAÇÃO e de FILTRO. As 153 leads de F3 não
-- mudam: o status delas já era 'lost' ou 'rejected' na tabela, e o
-- scheduled_visit_id delas continua preenchido, porque a visita de facto
-- existiu. O que muda é a etiqueta que a lista lhes põe e o cartão em que são
-- contadas.
--
-- O que o utilizador vai notar a seguir a aplicar:
--   - o cartão "Visita Agendada" DESCE 153 (93 + 59 na Mudelar, 1 na BMGest);
--   - o cartão "Perdidas/Rejeitadas" SOBE os mesmos 153;
--   - o total de leads não muda;
--   - filtrar por "Visita Agendada" deixa de trazer leads perdidas;
--   - filtrar por "Perdidas" passa a trazê-las todas.
-- Uma contagem que desce de repente não é perda de dados — é o fim de uma
-- contagem inflacionada.
--
-- Reversível sem perda: basta voltar a correr o CREATE OR REPLACE da secção de
-- reversão no fim do ficheiro. Como nada foi escrito nas leads, reverter repõe
-- o estado anterior na íntegra.
-- ============================================================================


-- ============================================================
-- PARTE 1 — guardas
-- ============================================================

-- ── 1.1 Se já existir mais do que uma versão desta função, ou se a que existe
--    não tiver os 15 argumentos esperados, PARAR. Um CREATE OR REPLACE com uma
--    assinatura diferente da que lá está não substitui nada: CRIA uma segunda
--    função e deixa o PostgREST com duas candidatas para a mesma chamada. Já
--    aconteceu neste projeto com rpc_save_quote. Melhor parar aqui do que
--    piorar em silêncio.
DO $guarda_assinatura$
DECLARE
  v_n     integer;
  v_nargs integer;
  r       record;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_scoped_leads_base';

  IF v_n > 1 THEN
    RAISE WARNING 'Versões encontradas de public.get_scoped_leads_base:';
    FOR r IN
      SELECT pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'get_scoped_leads_base'
       ORDER BY 1
    LOOP
      RAISE WARNING '    get_scoped_leads_base(%)', r.args;
    END LOOP;

    RAISE EXCEPTION
      'Já existem % versões de public.get_scoped_leads_base — é um overload e a '
      'RPC já deve estar ambígua no PostgREST. Esta migração PARA aqui em vez de '
      'acrescentar mais uma. Apagar à mão as versões a mais (ver os avisos acima '
      'com as assinaturas) e só depois voltar a aplicar.', v_n;
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION
      'public.get_scoped_leads_base não existe. Esta migração ALTERA uma função '
      'viva — não a cria de raiz. Se a função desapareceu, há um problema maior '
      'do que o desta migração e é esse que tem de ser resolvido primeiro.';
  END IF;

  SELECT p.pronargs INTO v_nargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_scoped_leads_base';

  IF v_nargs IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION
      'public.get_scoped_leads_base tem % argumentos, esperava 15. Assinatura '
      'actual: get_scoped_leads_base(%). O CREATE OR REPLACE desta migração usa a '
      'assinatura de 15 argumentos: aplicá-lo a uma função com outra assinatura '
      'NÃO a substituiria, criaria uma segunda função e a RPC ficaria ambígua.',
      v_nargs,
      (SELECT pg_get_function_identity_arguments(p.oid)
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_scoped_leads_base');
  END IF;

  RAISE NOTICE 'GUARDA 1.1: 1 versão de get_scoped_leads_base em public, com 15 argumentos.';
END;
$guarda_assinatura$;

-- ── 1.2 As dependências do corpo têm de existir. Esta migração não as cria nem
--    as toca; se faltarem, a função seria substituída e só rebentaria em
--    produção, na primeira abertura da lista de leads.
DO $guarda_dependencias$
BEGIN
  IF to_regprocedure('public.resolve_lead_access_context(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION
      'public.resolve_lead_access_context(uuid, text, text) não existe — é quem '
      'resolve o âmbito (ORG/OWNED/TEAM) e a permissão leads.view desta função, '
      'que é SECURITY DEFINER. Sem ela não há como criar a função em segurança.';
  END IF;

  IF to_regclass('public.anew_leads') IS NULL THEN
    RAISE EXCEPTION 'public.anew_leads não existe.';
  END IF;

  IF to_regclass('public.lead_contact_results') IS NULL THEN
    RAISE EXCEPTION
      'public.lead_contact_results não existe — é o LEFT JOIN que dá o nome ao '
      'resultado de contacto no último ramo de visita do CASE (D4).';
  END IF;

  RAISE NOTICE 'GUARDA 1.2: dependências presentes (resolve_lead_access_context, '
               'anew_leads, lead_contact_results).';
END;
$guarda_dependencias$;

-- ── 1.3 Informativo: quantas leads vão mudar de cartão. Só um SELECT de
--    contagem, não escreve nada. É a medida de F3 refeita no momento da
--    aplicação, para quem aplicar ver o número real da sua base de dados em vez
--    de acreditar no que este cabeçalho diz.
DO $contagem_previa$
DECLARE
  v_afetadas integer;
BEGIN
  SELECT count(*) INTO v_afetadas
    FROM public.anew_leads l
   WHERE l.deleted_at IS NULL
     AND LOWER(COALESCE(l.status::text, '')) IN ('lost', 'rejected')
     AND l.converted_at IS NULL
     AND l.converted_to_contact_id IS NULL
     AND l.converted_to_client_id IS NULL
     AND l.scheduled_visit_id IS NOT NULL;

  RAISE NOTICE 'GUARDA 1.3: % lead(s) perdidas/rejeitadas com visita agendada — são '
               'estas que passam a ser contadas no cartão Perdidas em vez do cartão '
               'Visita Agendada. (Medição de referência em 22/09/2026: 153.)',
               v_afetadas;
END;
$contagem_previa$;


-- ============================================================
-- PARTE 2 — nada a apagar (D5)
-- ============================================================
-- Não há DROP nesta migração, de propósito. A assinatura e o tipo de retorno
-- não mudam, logo CREATE OR REPLACE substitui a função no lugar, mantém a ACL
-- (F4) e não abre nenhuma janela em que a função não exista. Esta função é
-- chamada em cada abertura da lista de leads: uma janela de milissegundos sem
-- ela seria um erro visível a utilizadores reais.


-- ============================================================
-- PARTE 3 — a função, com o ramo novo
-- ============================================================
-- Corpo vivo de F1, byte a byte. A ÚNICA diferença em todo o ficheiro está
-- assinalada com o comentário "RAMO NOVO" dentro do CASE do effective_status.

CREATE OR REPLACE FUNCTION public.get_scoped_leads_base(p_org_id uuid, p_is_root boolean DEFAULT false, p_scope text DEFAULT 'ORG'::text, p_status text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_contact_result text DEFAULT NULL::text, p_contact_result_none boolean DEFAULT false, p_source text DEFAULT NULL::text, p_source_is_null boolean DEFAULT false, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_field text DEFAULT 'created_at'::text)
 RETURNS TABLE(lead_id uuid, organization_id uuid, root_organization_id uuid, entity_id uuid, campaign_id uuid, status text, effective_status text, source text, assigned_to uuid, created_by uuid, created_at timestamp with time zone, converted_at timestamp with time zone, converted_to_contact_id uuid, converted_to_client_id uuid, scheduled_visit_id uuid, last_contact_result text, search_text text, contact_attempts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx RECORD;
  v_owned_scope_ids uuid[];
  v_team_scope_ids uuid[];
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_to < p_date_from THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_lead_access_context(p_org_id, p_scope, 'leads.view');

  v_owned_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(ARRAY[v_ctx.anew_user_id, v_ctx.auth_user_id]) AS x
    WHERE x IS NOT NULL
  );

  v_team_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[])
      || COALESCE(v_owned_scope_ids, ARRAY[]::uuid[])
    ) AS x
    WHERE x IS NOT NULL
  );

  RETURN QUERY
  WITH candidate_leads AS (
    SELECT
      l.id AS lead_id,
      l.organization_id,
      l.root_organization_id,
      l.entity_id,
      l.campaign_id,
      COALESCE(l.status::text, 'new') AS status,
      (
        -- A ORDEM DOS RAMOS E QUE E A REGRA DE NEGOCIO. O CASE fica no primeiro
        -- ramo que der verdade, por isso cada ramo acima e mais forte do que
        -- todos os que vem abaixo. O principio e: um ESTADO TERMINAL ganha a um
        -- FACTO HISTORICO.
        CASE
          WHEN l.converted_at IS NOT NULL
            OR l.converted_to_contact_id IS NOT NULL
            OR l.converted_to_client_id IS NOT NULL
            OR COALESCE(LOWER(l.status::text), '') = 'converted'
            THEN 'converted'
          WHEN LOWER(l.status::text) IN ('qualified', 'negotiation')
            THEN LOWER(l.status::text)
          -- RAMO NOVO (a unica alteracao desta migracao).
          -- Uma lead registada como perdida ou rejeitada e uma lead perdida ou
          -- rejeitada, ainda que tenha tido uma visita agendada antes disso. A
          -- visita aconteceu, o scheduled_visit_id fica preenchido e fica bem
          -- preenchido -- mas ja nao e ele que descreve a lead. Sem este ramo,
          -- os tres ramos de visita que vem a seguir apanhavam-nas e a lista
          -- mostrava "Visita Agendada" a uma lead que o utilizador tinha dado
          -- como perdida.
          -- Devolve o proprio status para 'lost' e 'rejected' continuarem
          -- distintos; quem os quiser somados usa p_status = 'lost', que ja os
          -- junta no filtro la em baixo.
          WHEN LOWER(l.status::text) IN ('lost', 'rejected')
            THEN LOWER(l.status::text)
          WHEN l.status = 'visit_scheduled' THEN 'visit_scheduled'
          WHEN l.scheduled_visit_id IS NOT NULL THEN 'visit_scheduled'
          WHEN l.last_contact_result IS NOT NULL AND (
            LOWER(REPLACE(REPLACE(l.last_contact_result, ' ', '_'), '-', '_')) IN ('visit_scheduled', 'visita_agendada')
            OR LOWER(REPLACE(REPLACE(COALESCE(lcr.name, ''), ' ', '_'), '-', '_')) IN ('visit_scheduled', 'visita_agendada')
          ) THEN 'visit_scheduled'
          ELSE COALESCE(l.status::text, 'new')
        END
      )::text AS effective_status,
      l.source::text AS source,
      l.assigned_to,
      l.created_by,
      l.created_at,
      l.converted_at,
      l.converted_to_contact_id,
      l.converted_to_client_id,
      l.scheduled_visit_id,
      l.last_contact_result::text AS last_contact_result,
      l.search_text::text AS search_text,
      COALESCE(l.contact_attempts, 0)::integer AS contact_attempts
    FROM public.anew_leads l
    LEFT JOIN public.lead_contact_results lcr
      ON l.last_contact_result IS NOT NULL
     AND lcr.id::text = l.last_contact_result
    WHERE (
        (p_is_root AND (l.root_organization_id = p_org_id OR l.organization_id = p_org_id))
        OR (NOT p_is_root AND l.organization_id = p_org_id)
      )
      AND l.deleted_at IS NULL
      AND (p_campaign_id IS NULL OR l.campaign_id = p_campaign_id)
      AND (
        (p_assigned_unassigned AND l.assigned_to IS NULL)
        OR (
          NOT p_assigned_unassigned
          AND (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
        )
      )
      AND (
        (p_contact_result_none AND l.last_contact_result IS NULL)
        OR (
          NOT p_contact_result_none
          AND (p_contact_result IS NULL OR l.last_contact_result = p_contact_result)
        )
      )
      -- A data sobre a qual se filtra passa a ser escolhida por quem chama.
      -- Sem isto so era possivel perguntar "criadas em X"; agora tambem
      -- "contactadas em X". Qualquer valor diferente de 'last_contact_at'
      -- comporta-se como antes (created_at), por isso os 7 consumidores que
      -- nao passam nada mantem exactamente o comportamento de sempre.
      -- Quem nunca foi contactado tem last_contact_at NULL e fica de fora ao
      -- filtrar por contacto, que e o que se espera.
      -- Tres modos de filtrar por data:
      --   'created_at'      (omissao) -- quando a lead entrou
      --   'last_contact_at'           -- quando foi trabalhada
      --   'ambos'                     -- entrou E foi trabalhada dentro do
      --                                  intervalo; e uma interseccao, logo
      --                                  devolve sempre menos do que qualquer
      --                                  uma das outras duas.
      -- Quem nunca foi contactado tem last_contact_at nulo e fica de fora nos
      -- modos que olham para o contacto, que e o esperado.
      AND (p_date_from IS NULL OR (
            CASE p_date_field
              WHEN 'last_contact_at' THEN l.last_contact_at >= p_date_from
              WHEN 'ambos'           THEN l.created_at >= p_date_from AND l.last_contact_at >= p_date_from
              ELSE                        l.created_at >= p_date_from
            END))
      AND (p_date_to IS NULL OR (
            CASE p_date_field
              WHEN 'last_contact_at' THEN l.last_contact_at <= p_date_to
              WHEN 'ambos'           THEN l.created_at <= p_date_to AND l.last_contact_at <= p_date_to
              ELSE                        l.created_at <= p_date_to
            END))
      -- Pesquisa palavra a palavra: cada palavra de p_search tem de aparecer
      -- algures em search_text, em qualquer ordem. O predicado anterior era de
      -- frase seguida ('%' || p_search || '%'), por isso "joao silva" nunca
      -- encontrava "Joao Pedro Silva". Regra identica a de get_quotes_kpi_stats
      -- (20261113170000_quotes_search_text.sql) e a de applySearchTextFilter no
      -- cliente (src/lib/searchTextFilter.ts): lower + trim + split por espacos
      -- e nada mais, para os contadores de estado e a lista nunca divergirem.
      AND (
        p_search IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(regexp_split_to_array(lower(trim(p_search)), '\s+')) AS w
          WHERE w <> '' AND COALESCE(l.search_text, '') NOT ILIKE '%' || w || '%'
        )
      )
      AND (
        (p_source_is_null AND NULLIF(BTRIM(COALESCE(l.source, '')), '') IS NULL)
        OR (
          NOT p_source_is_null
          AND (p_source IS NULL OR l.source = p_source)
        )
      )
  )
  SELECT
    cl.lead_id,
    cl.organization_id,
    cl.root_organization_id,
    cl.entity_id,
    cl.campaign_id,
    cl.status,
    cl.effective_status,
    cl.source,
    cl.assigned_to,
    cl.created_by,
    cl.created_at,
    cl.converted_at,
    cl.converted_to_contact_id,
    cl.converted_to_client_id,
    cl.scheduled_visit_id,
    cl.last_contact_result,
    cl.search_text,
    cl.contact_attempts
  FROM candidate_leads cl
  WHERE (
      p_status IS NULL
      OR p_status = 'all'
      OR (p_status = 'lost' AND cl.effective_status IN ('lost', 'rejected'))
      OR (p_status = 'visit_scheduled' AND cl.effective_status = 'visit_scheduled')
      OR (p_status = 'new' AND cl.effective_status = 'new')
      OR (p_status NOT IN ('all', 'lost', 'visit_scheduled', 'new') AND cl.effective_status = p_status)
    )
    AND (
      v_ctx.applied_scope = 'ORG'
      OR (
        v_ctx.applied_scope = 'OWNED'
        AND (
          cl.assigned_to = ANY(COALESCE(v_owned_scope_ids, ARRAY[]::uuid[]))
          OR cl.created_by = ANY(COALESCE(v_owned_scope_ids, ARRAY[]::uuid[]))
        )
      )
      OR (
        v_ctx.applied_scope = 'TEAM'
        AND (
          cl.assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
          OR cl.created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
        )
      )
    );
END;
$function$;


-- ============================================================
-- PARTE 4 — ACL (D6)
-- ============================================================
-- CREATE OR REPLACE preserva a ACL, por isso estas linhas são redundantes hoje.
-- Ficam para o ficheiro ser auto-suficiente: dizem qual é a ACL pretendida sem
-- obrigar a ir à base de dados, e protegem o caso de alguém um dia trocar o
-- REPLACE por um DROP — a função é SECURITY DEFINER e nascer com EXECUTE para
-- PUBLIC significaria expô-la a anon.

REVOKE ALL     ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamptz, timestamptz, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamptz, timestamptz, text) TO service_role;


-- ============================================================
-- PARTE 5 — auto-teste (D7)
-- ============================================================
-- Não chama a função: dentro de uma migração auth.uid() é NULL,
-- resolve_lead_access_context não resolveria contexto nenhum e o teste falharia
-- por um motivo que nada tem a ver com o que se quer provar.
--
-- Em vez disso lê pg_get_functiondef() da função acabada de criar e verifica o
-- TEXTO. O teste central é o 5.3: a POSIÇÃO do ramo novo. Verificar apenas que
-- o ramo existe daria verde a uma migração que o tivesse posto no fim do CASE —
-- onde não corrigiria coisa nenhuma (D3).

DO $auto_teste$
DECLARE
  v_oid          oid;
  v_n            integer;
  v_def          text;
  v_pos_lost     integer;
  v_pos_visita   integer;
  v_pos_conv     integer;
  v_pos_qual     integer;
  c_ramo_lost   constant text := 'LOWER(l.status::text) IN (''lost'', ''rejected'')';
  c_ramo_visita constant text := 'l.scheduled_visit_id IS NOT NULL';
  c_ramo_conv   constant text := 'COALESCE(LOWER(l.status::text), '''') = ''converted''';
  c_ramo_qual   constant text := 'LOWER(l.status::text) IN (''qualified'', ''negotiation'')';
BEGIN
  -- ── 5.1 Continua a existir exactamente UMA função com este nome. Se houver
  --    duas, o CREATE OR REPLACE não substituiu — criou. A RPC ficaria ambígua
  --    no PostgREST e a lista de leads deixaria de carregar.
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_scoped_leads_base';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.1 falhou: esperava exactamente 1 função '
      'public.get_scoped_leads_base, encontrei %. O CREATE OR REPLACE criou uma '
      'segunda em vez de substituir a existente — a assinatura não coincidia.', v_n;
  END IF;

  SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_scoped_leads_base';

  v_def := pg_get_functiondef(v_oid);

  -- ── 5.2 O ramo novo existe (D2).
  v_pos_lost := position(c_ramo_lost in v_def);
  IF v_pos_lost = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.2 falhou: o ramo "%" não está na definição da função. A '
      'correcção não foi aplicada — leads perdidas continuam a aparecer como '
      'Visita Agendada.', c_ramo_lost;
  END IF;

  -- ── 5.3 O TESTE QUE INTERESSA: o ramo novo vem ANTES do ramo da visita (D3).
  --    É a ordem, e só a ordem, que corrige o problema. O ramo do
  --    scheduled_visit_id é o primeiro dos três de visita que apanhava as leads
  --    perdidas; se o ramo novo não estiver antes dele, esta migração não fez
  --    nada de útil.
  v_pos_visita := position(c_ramo_visita in v_def);
  IF v_pos_visita = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.3 falhou: o ramo "%" desapareceu da função. Ele tem de '
      'CONTINUAR a existir — uma lead viva com visita marcada tem de continuar a '
      'mostrar Visita Agendada (D4).', c_ramo_visita;
  END IF;

  IF NOT (v_pos_lost < v_pos_visita) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.3 falhou: o ramo lost/rejected está na posição % e o ramo da '
      'visita na posição % — o da visita vem PRIMEIRO e continua a ganhar. Um CASE '
      'fica no primeiro ramo verdadeiro, por isso pôr o ramo lost/rejected depois '
      'do da visita não corrige absolutamente nada. Mover o ramo para cima dos '
      'ramos de visita.',
      v_pos_lost, v_pos_visita;
  END IF;

  -- ── 5.4 O ramo do converted continua a existir e continua ANTES do novo.
  --    Uma lead que foi dada como perdida e mais tarde convertida é uma
  --    conversão: o converted mantém a primazia que sempre teve (D3).
  v_pos_conv := position(c_ramo_conv in v_def);
  IF v_pos_conv = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.4 falhou: o ramo do converted desapareceu da função. Leads '
      'convertidas deixariam de ser contadas como convertidas.';
  END IF;

  IF NOT (v_pos_conv < v_pos_lost) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.4 falhou: o ramo lost/rejected (posição %) ficou ANTES do ramo '
      'do converted (posição %). Uma lead convertida com status antigo de perdida '
      'passaria a contar como perdida. O converted tem de continuar a ser o '
      'primeiro ramo do CASE.',
      v_pos_lost, v_pos_conv;
  END IF;

  -- ── 5.5 O ramo do qualified/negotiation continua a existir e continua ANTES
  --    do novo. É o vizinho imediato: o ramo novo foi colocado logo a seguir.
  v_pos_qual := position(c_ramo_qual in v_def);
  IF v_pos_qual = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.5 falhou: o ramo qualified/negotiation desapareceu da função.';
  END IF;

  IF NOT (v_pos_qual < v_pos_lost) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.5 falhou: o ramo lost/rejected (posição %) ficou ANTES do ramo '
      'qualified/negotiation (posição %). A ordem pretendida é converted -> '
      'qualified/negotiation -> lost/rejected -> visita.',
      v_pos_lost, v_pos_qual;
  END IF;

  -- ── 5.6 Segurança preservada: continua STABLE SECURITY DEFINER com
  --    search_path fixo. Num SECURITY DEFINER um search_path solto é um vector
  --    de escalada de privilégios.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'AUTO-TESTE 5.6 falhou: a função deixou de ser SECURITY DEFINER.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p,
           LATERAL unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
     WHERE p.oid = v_oid
       AND replace(cfg, '"', '') = 'search_path=public'
  ) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.6 falhou: a função não ficou com SET search_path TO public. '
      'proconfig = %', (SELECT COALESCE(p.proconfig::text, '(NULL)')
                          FROM pg_proc p WHERE p.oid = v_oid);
  END IF;

  -- ── 5.7 ACL: authenticated e service_role executam, anon não (D6).
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.7 falhou: o role authenticated não pode executar a função — a '
      'lista de leads deixaria de carregar para toda a gente.';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.7 falhou: o role anon PODE executar a função. É SECURITY '
      'DEFINER — o REVOKE não foi aplicado.';
  END IF;

  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.7 falhou: o role service_role não pode executar a função.';
  END IF;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'AUTO-TESTE: 7 verificações OK.';
  RAISE NOTICE '  assinatura : get_scoped_leads_base(... 15 argumentos ...)';
  RAISE NOTICE '  ordem do CASE do effective_status:';
  RAISE NOTICE '    converted ............. posição %', v_pos_conv;
  RAISE NOTICE '    qualified/negotiation . posição %', v_pos_qual;
  RAISE NOTICE '    lost/rejected ......... posição %   <-- RAMO NOVO', v_pos_lost;
  RAISE NOTICE '    scheduled_visit_id .... posição %', v_pos_visita;
  RAISE NOTICE '  segurança  : STABLE SECURITY DEFINER, search_path=public, '
               'EXECUTE só a authenticated e service_role';
  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'A função NÃO foi executada aqui: dentro de uma migração '
               'auth.uid() é NULL e resolve_lead_access_context não resolveria '
               'contexto nenhum (D7).';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'NENHUMA LEAD FOI ALTERADA POR ESTA MIGRAÇÃO (D8).';
  RAISE NOTICE 'Não foi escrita uma única linha em public.anew_leads: nem status,';
  RAISE NOTICE 'nem scheduled_visit_id, nem workflow_stage_id, nada. O que mudou';
  RAISE NOTICE 'foi uma COLUNA CALCULADA — effective_status — que só existe no';
  RAISE NOTICE 'resultado desta função. O efeito é puramente de apresentação e de';
  RAISE NOTICE 'filtro: as leads perdidas com visita agendada passam a ser';
  RAISE NOTICE 'contadas no cartão Perdidas/Rejeitadas em vez do cartão Visita';
  RAISE NOTICE 'Agendada, sem que nada nelas tenha mudado. O cartão Visita';
  RAISE NOTICE 'Agendada vai DESCER e o das Perdidas vai SUBIR o mesmo número';
  RAISE NOTICE '(ver GUARDA 1.3 acima); o total de leads não muda. Uma contagem';
  RAISE NOTICE 'que desce aqui não é perda de dados — é o fim de uma contagem';
  RAISE NOTICE 'inflacionada.';
  RAISE NOTICE '===========================================================';
END;
$auto_teste$;


-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- Repõe a função exactamente como estava antes desta migração: o mesmo corpo
-- vivo de F1, sem o ramo lost/rejected no CASE do effective_status. É um
-- CREATE OR REPLACE, tal como a ida — não há DROP na reversão, pela mesma razão
-- de D5: a assinatura não muda e a função é chamada a toda a hora.
--
-- Como esta migração não escreveu nada em anew_leads (D8), reverter repõe o
-- estado anterior na íntegra, sem perda nenhuma.
--
-- ATENÇÃO: reverter traz de volta o problema. As leads perdidas ou rejeitadas
-- que tiveram visita agendada voltam a ser mostradas como "Visita Agendada" e
-- voltam a desaparecer do cartão Perdidas/Rejeitadas (eram 153 em 22/09/2026).
-- Reverter só faz sentido se o problema for outro e não este.
--
--   CREATE OR REPLACE FUNCTION public.get_scoped_leads_base(p_org_id uuid, p_is_root boolean DEFAULT false, p_scope text DEFAULT 'ORG'::text, p_status text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_contact_result text DEFAULT NULL::text, p_contact_result_none boolean DEFAULT false, p_source text DEFAULT NULL::text, p_source_is_null boolean DEFAULT false, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_field text DEFAULT 'created_at'::text)
--    RETURNS TABLE(lead_id uuid, organization_id uuid, root_organization_id uuid, entity_id uuid, campaign_id uuid, status text, effective_status text, source text, assigned_to uuid, created_by uuid, created_at timestamp with time zone, converted_at timestamp with time zone, converted_to_contact_id uuid, converted_to_client_id uuid, scheduled_visit_id uuid, last_contact_result text, search_text text, contact_attempts integer)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_ctx RECORD;
--     v_owned_scope_ids uuid[];
--     v_team_scope_ids uuid[];
--   BEGIN
--     IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_to < p_date_from THEN
--       RAISE EXCEPTION 'invalid date range';
--     END IF;
--
--     SELECT *
--     INTO v_ctx
--     FROM public.resolve_lead_access_context(p_org_id, p_scope, 'leads.view');
--
--     v_owned_scope_ids := ARRAY(
--       SELECT DISTINCT x
--       FROM unnest(ARRAY[v_ctx.anew_user_id, v_ctx.auth_user_id]) AS x
--       WHERE x IS NOT NULL
--     );
--
--     v_team_scope_ids := ARRAY(
--       SELECT DISTINCT x
--       FROM unnest(
--         COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[])
--         || COALESCE(v_owned_scope_ids, ARRAY[]::uuid[])
--       ) AS x
--       WHERE x IS NOT NULL
--     );
--
--     RETURN QUERY
--     WITH candidate_leads AS (
--       SELECT
--         l.id AS lead_id,
--         l.organization_id,
--         l.root_organization_id,
--         l.entity_id,
--         l.campaign_id,
--         COALESCE(l.status::text, 'new') AS status,
--         (
--           CASE
--             WHEN l.converted_at IS NOT NULL
--               OR l.converted_to_contact_id IS NOT NULL
--               OR l.converted_to_client_id IS NOT NULL
--               OR COALESCE(LOWER(l.status::text), '') = 'converted'
--               THEN 'converted'
--             WHEN LOWER(l.status::text) IN ('qualified', 'negotiation')
--               THEN LOWER(l.status::text)
--             WHEN l.status = 'visit_scheduled' THEN 'visit_scheduled'
--             WHEN l.scheduled_visit_id IS NOT NULL THEN 'visit_scheduled'
--             WHEN l.last_contact_result IS NOT NULL AND (
--               LOWER(REPLACE(REPLACE(l.last_contact_result, ' ', '_'), '-', '_')) IN ('visit_scheduled', 'visita_agendada')
--               OR LOWER(REPLACE(REPLACE(COALESCE(lcr.name, ''), ' ', '_'), '-', '_')) IN ('visit_scheduled', 'visita_agendada')
--             ) THEN 'visit_scheduled'
--             ELSE COALESCE(l.status::text, 'new')
--           END
--         )::text AS effective_status,
--         l.source::text AS source,
--         l.assigned_to,
--         l.created_by,
--         l.created_at,
--         l.converted_at,
--         l.converted_to_contact_id,
--         l.converted_to_client_id,
--         l.scheduled_visit_id,
--         l.last_contact_result::text AS last_contact_result,
--         l.search_text::text AS search_text,
--         COALESCE(l.contact_attempts, 0)::integer AS contact_attempts
--       FROM public.anew_leads l
--       LEFT JOIN public.lead_contact_results lcr
--         ON l.last_contact_result IS NOT NULL
--        AND lcr.id::text = l.last_contact_result
--       WHERE (
--           (p_is_root AND (l.root_organization_id = p_org_id OR l.organization_id = p_org_id))
--           OR (NOT p_is_root AND l.organization_id = p_org_id)
--         )
--         AND l.deleted_at IS NULL
--         AND (p_campaign_id IS NULL OR l.campaign_id = p_campaign_id)
--         AND (
--           (p_assigned_unassigned AND l.assigned_to IS NULL)
--           OR (
--             NOT p_assigned_unassigned
--             AND (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
--           )
--         )
--         AND (
--           (p_contact_result_none AND l.last_contact_result IS NULL)
--           OR (
--             NOT p_contact_result_none
--             AND (p_contact_result IS NULL OR l.last_contact_result = p_contact_result)
--           )
--         )
--         AND (p_date_from IS NULL OR (
--               CASE p_date_field
--                 WHEN 'last_contact_at' THEN l.last_contact_at >= p_date_from
--                 WHEN 'ambos'           THEN l.created_at >= p_date_from AND l.last_contact_at >= p_date_from
--                 ELSE                        l.created_at >= p_date_from
--               END))
--         AND (p_date_to IS NULL OR (
--               CASE p_date_field
--                 WHEN 'last_contact_at' THEN l.last_contact_at <= p_date_to
--                 WHEN 'ambos'           THEN l.created_at <= p_date_to AND l.last_contact_at <= p_date_to
--                 ELSE                        l.created_at <= p_date_to
--               END))
--         AND (
--           p_search IS NULL
--           OR NOT EXISTS (
--             SELECT 1
--             FROM unnest(regexp_split_to_array(lower(trim(p_search)), '\s+')) AS w
--             WHERE w <> '' AND COALESCE(l.search_text, '') NOT ILIKE '%' || w || '%'
--           )
--         )
--         AND (
--           (p_source_is_null AND NULLIF(BTRIM(COALESCE(l.source, '')), '') IS NULL)
--           OR (
--             NOT p_source_is_null
--             AND (p_source IS NULL OR l.source = p_source)
--           )
--         )
--     )
--     SELECT
--       cl.lead_id,
--       cl.organization_id,
--       cl.root_organization_id,
--       cl.entity_id,
--       cl.campaign_id,
--       cl.status,
--       cl.effective_status,
--       cl.source,
--       cl.assigned_to,
--       cl.created_by,
--       cl.created_at,
--       cl.converted_at,
--       cl.converted_to_contact_id,
--       cl.converted_to_client_id,
--       cl.scheduled_visit_id,
--       cl.last_contact_result,
--       cl.search_text,
--       cl.contact_attempts
--     FROM candidate_leads cl
--     WHERE (
--         p_status IS NULL
--         OR p_status = 'all'
--         OR (p_status = 'lost' AND cl.effective_status IN ('lost', 'rejected'))
--         OR (p_status = 'visit_scheduled' AND cl.effective_status = 'visit_scheduled')
--         OR (p_status = 'new' AND cl.effective_status = 'new')
--         OR (p_status NOT IN ('all', 'lost', 'visit_scheduled', 'new') AND cl.effective_status = p_status)
--       )
--       AND (
--         v_ctx.applied_scope = 'ORG'
--         OR (
--           v_ctx.applied_scope = 'OWNED'
--           AND (
--             cl.assigned_to = ANY(COALESCE(v_owned_scope_ids, ARRAY[]::uuid[]))
--             OR cl.created_by = ANY(COALESCE(v_owned_scope_ids, ARRAY[]::uuid[]))
--           )
--         )
--         OR (
--           v_ctx.applied_scope = 'TEAM'
--           AND (
--             cl.assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
--             OR cl.created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
--           )
--         )
--       );
--   END;
--   $function$;
--
--   REVOKE ALL     ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
--   GRANT  EXECUTE ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamptz, timestamptz, text) TO authenticated;
--   GRANT  EXECUTE ON FUNCTION public.get_scoped_leads_base(uuid, boolean, text, text, uuid, uuid, boolean, text, boolean, text, boolean, text, timestamptz, timestamptz, text) TO service_role;
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. Uma só versão, com os 15 argumentos de sempre:
--      SELECT pg_get_function_identity_arguments(p.oid)
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'get_scoped_leads_base';
--      -- uma linha só.
--
-- 2. As leads visadas, directamente na tabela (não muda nada, só conta):
--      SELECT o.name, l.status, count(*)
--        FROM public.anew_leads l
--        JOIN public.organizations o ON o.id = l.organization_id
--       WHERE l.deleted_at IS NULL
--         AND LOWER(COALESCE(l.status::text, '')) IN ('lost', 'rejected')
--         AND l.scheduled_visit_id IS NOT NULL
--         AND l.converted_at IS NULL
--         AND l.converted_to_contact_id IS NULL
--         AND l.converted_to_client_id IS NULL
--       GROUP BY 1, 2 ORDER BY 1, 2;
--      -- referência de 22/09/2026: Mudelar lost 93, Mudelar rejected 59,
--      --                           BMGest rejected 1.
--
-- 3. Na aplicação, autenticado como utilizador da Mudelar (a função precisa de
--    auth.uid(); como postgres não devolve nada):
--    - o cartão "Visita Agendada" desce 152 e o "Perdidas" sobe 152;
--    - abrir o filtro "Visita Agendada" e confirmar que já não aparece nenhuma
--      lead com etiqueta de perdida;
--    - abrir uma das leads afectadas e confirmar que a visita continua lá no
--      histórico — o facto não foi apagado, só deixou de mandar na etiqueta.
--
-- 4. Não é preciso mexer no frontend. A coluna effective_status já era
--    consumida tal como vem; o que mudou foi o valor que ela traz.
