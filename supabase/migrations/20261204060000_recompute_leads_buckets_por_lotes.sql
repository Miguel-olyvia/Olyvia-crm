-- ============================================================================
-- Recálculo dos buckets das leads — passa a poder ser feito POR LOTES
--
-- Altera: public.recompute_leads_v2_buckets
--   de  (p_org uuid)
--   para (p_org uuid, p_limit integer DEFAULT NULL, p_after uuid DEFAULT NULL)
--
-- Depende de:
--   public.compute_lead_stage_v2(uuid)        — NÃO é tocada por esta migração
--   public.evaluate_lead_signals_v2(...)      — NÃO é tocada por esta migração
--   public.get_user_visible_org_ids(uuid)     — validação de autorização
--   public.anew_leads, public.lead_workflow_stages, public.entity_interactions
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA, COMO SE MANIFESTA EM PRODUÇÃO
-- ---------------------------------------------------------------------------
-- O botão "Recalcular buckets das leads" no editor do funil chama a RPC
-- public.recompute_leads_v2_buckets(p_org) e rebenta SEMPRE com:
--
--     canceling statement due to statement timeout
--
-- Não é um bug de lentidão acidental. É trabalho a mais para o tempo que há.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO ANTES DE ESCREVER ESTE FICHEIRO
-- ---------------------------------------------------------------------------
--
--   F1. O role `authenticated` tem statement_timeout = 8s, confirmado em
--       pg_roles.rolconfig. É esse o tecto que a RPC tem de respeitar quando é
--       chamada do browser via PostgREST.
--
--   F2. Na organização Mudelar há 6120 leads activas (deleted_at IS NULL).
--       Uma passagem completa da função mede ~23s, repartidos assim:
--
--         calcular as etapas com compute_lead_stage_v2 .......   5,0s
--         UPDATE de ~4785 leads ..............................   4,0s
--         INSERT de ~4780 notas em entity_interactions .......  14,8s
--                                                              ------
--                                                               23,8s
--
--       23,8s contra um tecto de 8s. Não há optimização que meta isto dentro
--       do limite: o trabalho é real e é o trabalho que se pediu. A única saída
--       honesta é dividi-lo em pedaços que caibam, e deixar o cliente chamar a
--       RPC várias vezes.
--
--   F3. Definição VIVA da função obtida hoje por pg_get_functiondef(). É essa e
--       só essa que serve de base a esta migração. NÃO foi reconstruída a
--       partir de nenhum ficheiro de migração antigo — um ficheiro antigo teria
--       deixado cair, em silêncio, todas as correcções feitas à função desde
--       então. O corpo abaixo é o corpo vivo, com a única diferença de ter
--       ganho o cursor e o limite.
--
--   F4. O peso está no INSERT das notas (14,8s de 23,8s), não no cálculo. Foi a
--       tentação óbvia: remover o registo em entity_interactions e o problema
--       "desaparecia". NÃO se faz — ver D5.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--
--   D1. DROP antes do CREATE, OBRIGATÓRIO.
--       Em PostgreSQL uma função é identificada pelo nome MAIS a lista de
--       argumentos. Criar a versão de 3 argumentos sem apagar a de 1 argumento
--       não substitui nada: ficam as DUAS, como overload. E um overload em que
--       uma assinatura é prefixo da outra com defaults é ambíguo para o
--       PostgREST — uma chamada com apenas {"p_org": ...} passa a poder resolver
--       para qualquer uma das duas e a RPC começa a devolver erro de função não
--       encontrada / ambígua. Já aconteceu neste projeto exactamente assim com
--       rpc_save_quote. Por isso o DROP não é higiene, é parte da correcção.
--
--       Também é feito DROP IF EXISTS da assinatura NOVA (uuid, integer, uuid),
--       para esta migração poder ser reaplicada: CREATE OR REPLACE não consegue
--       mudar o tipo de retorno de uma função existente.
--
--   D2. ESTE É O PONTO MAIS IMPORTANTE DA MIGRAÇÃO — o LIMIT tem de ser aplicado
--       ANTES do cálculo da etapa, nunca depois.
--
--       public.compute_lead_stage_v2(id) é caro: é ele que vale os 5,0s de F2
--       sobre 6120 leads, ou seja ~0,8ms por lead. Se a selecção do lote fosse
--       escrita como
--
--           SELECT id, compute_lead_stage_v2(id) ... ORDER BY id LIMIT 500
--
--       o planeador ficaria livre para avaliar a função nas 6120 leads e só
--       depois cortar nas 500 — e cada lote continuaria a custar os 5s de
--       cálculo. Doze lotes pagariam doze vezes o cálculo todo: PIOR do que
--       estava, e a rebentar na mesma.
--
--       Por isso há duas CTE separadas e explicitamente MATERIALIZED:
--         `batch`    — só lê colunas da tabela, ordena por id, corta com LIMIT.
--         `resolved` — corre compute_lead_stage_v2 SOBRE `batch`, já cortado.
--       O MATERIALIZED é o que impede o planeador de fundir as duas e voltar a
--       empurrar a função para antes do corte. Sem ele esta migração não
--       resolve nada.
--
--   D3. O cursor é por id (keyset), não por OFFSET.
--       OFFSET voltaria a ler e a descartar as linhas anteriores em cada lote —
--       custo quadrático — e, pior, o próprio recálculo altera as linhas entre
--       chamadas, pelo que um OFFSET poderia saltar leads. `id > p_after` com
--       ORDER BY id é estável: o que já foi visto não volta a aparecer e nada
--       fica por ver, porque a chave não muda durante o processo.
--
--   D4. Compatibilidade preservada. p_limit e p_after têm DEFAULT NULL e
--       p_limit NULL significa "processa tudo":
--       em PostgreSQL `LIMIT NULL` é, por definição, o mesmo que não ter LIMIT
--       nenhum (ao contrário de `LIMIT 0`, que devolve zero linhas). Ou seja,
--       uma chamada antiga recompute_leads_v2_buckets(p_org) continua a fazer
--       exactamente o que fazia — incluindo continuar a exceder os 8s numa
--       organização grande, o que é correcto: quem não passa lote está a pedir
--       a passagem completa.
--
--   D5. O registo das notas em entity_interactions MANTÉM-SE.
--       São 14,8s dos 23,8s (F4) e era a poupança mais fácil, mas cada nota é o
--       rasto de uma alteração automática ao funil de um cliente. Apagar o
--       rasto para a função caber no tempo seria trocar auditoria por
--       velocidade sem ninguém ter pedido. Repartido por lotes de algumas
--       centenas, o custo cabe à vontade.
--
--   D6. Nada mais do corpo muda. A validação por
--       get_user_visible_org_ids(auth.uid()), o filtro deleted_at IS NULL, o
--       UPDATE de workflow_stage_id + pipeline_dirty_at, o INSERT das notas, o
--       RAISE WARNING das leads não resolvidas, SECURITY DEFINER e
--       SET search_path = public ficam byte a byte como estavam (F3).
--
--   D7. Contadores novos, com semântica explícita:
--
--         processed_count — quantas leads foram EXAMINADAS neste lote. NÃO é o
--                           número de leads alteradas. É este o valor que diz
--                           ao cliente quando parar: acabou quando
--                           processed_count < p_limit (ou quando é 0).
--         last_id         — o MAIOR id examinado neste lote, para o cliente
--                           passar como p_after na chamada seguinte. NULL
--                           quando o lote vem vazio, ou seja, quando acabou.
--
--       updated_count, unresolved_count e unresolved_lead_ids passam a
--       referir-se APENAS ao lote corrente, nunca ao total da organização.
--       unresolved_lead_ids continua limitado a 50 ids (amostra, não lista).
--       Quem quiser totais soma os lotes do lado do cliente.
--
--   D8. GRANTs reafirmados, e aqui não é opcional.
--       DROP + CREATE apaga a ACL da função. Sem repor os GRANTs a nova função
--       nasce com a ACL por omissão (EXECUTE para PUBLIC) — que é MAIS aberta
--       do que a anterior — e, sendo SECURITY DEFINER, significaria expor a
--       função a `anon`. A única barreira que sobrava era o auth.uid() NULL lá
--       dentro. Repõe-se explicitamente o padrão das outras RPC do projeto:
--       REVOKE de PUBLIC e anon, GRANT a authenticated e service_role.
--
--   D9. O auto-teste NÃO chama a função.
--       Dentro de uma migração auth.uid() é NULL, logo get_user_visible_org_ids
--       não devolve nada e a validação de autorização rebentaria com
--       'not authorized for organization %'. O auto-teste verifica por pg_proc
--       o que dá para verificar sem executar: que existe UMA só função com este
--       nome, que tem 3 argumentos, que os 2 últimos têm DEFAULT, e que o
--       retorno tem as 5 colunas esperadas pela ordem esperada.
--
--  D10. NENHUMA lead é recalculada por esta migração. Ela muda a ferramenta,
--       não os dados. O recálculo continua a ser uma decisão do utilizador,
--       tomada no editor do funil.
--
-- ---------------------------------------------------------------------------
-- COMO O CLIENTE PASSA A CHAMAR (para quem for mexer no frontend)
-- ---------------------------------------------------------------------------
--   let after = null, updated = 0, unresolved = 0;
--   for (;;) {
--     const { data } = await supabase.rpc('recompute_leads_v2_buckets',
--       { p_org: orgId, p_limit: 300, p_after: after });
--     const r = data[0];
--     updated    += r.updated_count;
--     unresolved += r.unresolved_count;
--     if (r.processed_count < 300 || r.last_id === null) break;   // acabou
--     after = r.last_id;                                          // continua
--   }
--
--   Com 6120 leads e lotes de 300 são ~21 chamadas. Pelos números de F2 cada
--   lote fica na ordem de ~1,2s — bem dentro dos 8s de F1, com folga para uma
--   organização que cresça ou para um dia mau da base de dados.
--
-- ---------------------------------------------------------------------------
-- IMPACTO — LER ANTES DE APLICAR
-- ---------------------------------------------------------------------------
-- Objectos alterados: 1 função. Nenhuma tabela, nenhuma linha de dados,
-- nenhuma configuração de funil, nenhuma lead.
--
-- Quebra de compatibilidade: o TIPO DE RETORNO ganha 2 colunas
-- (processed_count, last_id). Quem consome por nome de coluna não nota. Quem
-- consumisse por posição notaria — mas as 3 colunas antigas mantêm a posição e
-- as novas vão para o fim, precisamente para isso não acontecer.
--
-- Durante a aplicação há uma janela de milissegundos entre o DROP e o CREATE em
-- que a RPC não existe. Uma chamada nesse instante apanha "function not found".
-- É aceitável: é o recálculo manual do funil, não um caminho crítico.
-- ============================================================================


-- ============================================================
-- PARTE 1 — guardas
-- ============================================================

-- ── 1.1 Se já existir mais do que uma versão desta função, PARAR. Criar mais
--    uma em cima de um overload existente só tornaria a ambiguidade pior e mais
--    difícil de diagnosticar (D1). Quem aplicar tem de ir ver o que lá está e
--    limpar à mão, com conhecimento de causa.
DO $guarda_overload$
DECLARE
  v_n integer;
  r   record;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'recompute_leads_v2_buckets';

  IF v_n > 1 THEN
    RAISE WARNING 'Versões encontradas de public.recompute_leads_v2_buckets:';
    FOR r IN
      SELECT pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'recompute_leads_v2_buckets'
       ORDER BY 1
    LOOP
      RAISE WARNING '    recompute_leads_v2_buckets(%)', r.args;
    END LOOP;

    RAISE EXCEPTION
      'Já existem % versões de public.recompute_leads_v2_buckets — é um overload '
      'e a RPC já deve estar ambígua no PostgREST. Esta migração PARA aqui em vez '
      'de acrescentar mais uma. Apagar à mão as versões a mais (ver os avisos '
      'acima com as assinaturas) e só depois voltar a aplicar.', v_n;
  END IF;

  IF v_n = 0 THEN
    RAISE WARNING
      'public.recompute_leads_v2_buckets não existe — esta migração vai criá-la '
      'de raiz na assinatura de 3 argumentos.';
  END IF;

  RAISE NOTICE 'GUARDA 1.1: % versão(ões) de recompute_leads_v2_buckets em public.', v_n;
END;
$guarda_overload$;

-- ── 1.2 As dependências do corpo têm de existir. Esta migração não as cria nem
--    as toca; se faltarem, a função seria criada e só rebentaria em produção,
--    no clique do utilizador.
DO $guarda_dependencias$
BEGIN
  IF to_regprocedure('public.compute_lead_stage_v2(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'public.compute_lead_stage_v2(uuid) não existe — é o motor que resolve a '
      'etapa de cada lead e é chamado pelo corpo desta função.';
  END IF;

  IF to_regprocedure('public.get_user_visible_org_ids(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'public.get_user_visible_org_ids(uuid) não existe — é a validação de '
      'autorização desta RPC, que é SECURITY DEFINER. Sem ela a função não pode '
      'ser criada em segurança.';
  END IF;

  IF to_regclass('public.anew_leads') IS NULL THEN
    RAISE EXCEPTION 'public.anew_leads não existe.';
  END IF;

  IF to_regclass('public.lead_workflow_stages') IS NULL THEN
    RAISE EXCEPTION 'public.lead_workflow_stages não existe.';
  END IF;

  IF to_regclass('public.entity_interactions') IS NULL THEN
    RAISE EXCEPTION
      'public.entity_interactions não existe — é onde ficam as notas do recálculo '
      'automático, que esta migração mantém de propósito (D5).';
  END IF;

  RAISE NOTICE 'GUARDA 1.2: dependências presentes (compute_lead_stage_v2, '
               'get_user_visible_org_ids, anew_leads, lead_workflow_stages, '
               'entity_interactions).';
END;
$guarda_dependencias$;


-- ============================================================
-- PARTE 2 — apagar a versão antiga (D1)
-- ============================================================
-- IF EXISTS nas duas para a migração poder ser reaplicada. A de 1 argumento é a
-- que está viva hoje; a de 3 argumentos só existe se isto já tiver corrido — e
-- tem de cair na mesma, porque CREATE OR REPLACE não muda o tipo de retorno.

DROP FUNCTION IF EXISTS public.recompute_leads_v2_buckets(uuid);
DROP FUNCTION IF EXISTS public.recompute_leads_v2_buckets(uuid, integer, uuid);


-- ============================================================
-- PARTE 3 — a versão nova, com cursor e lote
-- ============================================================

CREATE FUNCTION public.recompute_leads_v2_buckets(
  p_org   uuid,
  p_limit integer DEFAULT NULL,
  p_after uuid    DEFAULT NULL
)
RETURNS TABLE(
  updated_count       integer,
  unresolved_count    integer,
  unresolved_lead_ids uuid[],
  processed_count     integer,
  last_id             uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_count integer;
  v_logged_count integer;
  v_total_count integer;
  v_unresolved_count integer;
  v_unresolved_ids uuid[];
  v_last_id uuid;
BEGIN
  SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org;
  END IF;

  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION 'p_limit tem de ser positivo (ou NULL para processar tudo), recebi %', p_limit;
  END IF;

  WITH batch AS MATERIALIZED (
    -- O LOTE. Só colunas da tabela aqui dentro: nada de compute_lead_stage_v2,
    -- para o corte acontecer ANTES do cálculo e não depois (D2).
    -- LIMIT p_limit com p_limit NULL é, em PostgreSQL, o mesmo que não ter
    -- LIMIT: processa tudo, que é o comportamento antigo (D4).
    -- ORDER BY id é o que torna o cursor p_after/last_id estável (D3).
    SELECT
      al.id,
      al.entity_id,
      al.organization_id,
      al.root_organization_id,
      al.workflow_stage_id AS old_stage_id
    FROM public.anew_leads al
    WHERE al.organization_id = p_org
      AND al.deleted_at IS NULL
      AND (p_after IS NULL OR al.id > p_after)
    ORDER BY al.id
    LIMIT p_limit
  ),
  resolved AS MATERIALIZED (
    -- O CÁLCULO, já só sobre as leads do lote. MATERIALIZED nas duas CTE é o que
    -- impede o planeador de as fundir e de voltar a empurrar a função cara para
    -- antes do LIMIT (D2).
    SELECT
      b.id,
      b.entity_id,
      b.organization_id,
      b.root_organization_id,
      b.old_stage_id,
      public.compute_lead_stage_v2(b.id) AS new_stage_id
    FROM batch b
  ),
  updated AS (
    UPDATE public.anew_leads al
    SET workflow_stage_id = r.new_stage_id,
        pipeline_dirty_at = NULL
    FROM resolved r
    WHERE al.id = r.id
      AND al.workflow_stage_id IS DISTINCT FROM r.new_stage_id
    RETURNING al.id, r.entity_id, r.organization_id, r.root_organization_id,
      r.old_stage_id, r.new_stage_id
  ),
  logged AS (
    -- MANTÉM-SE de propósito: é o rasto de auditoria de cada alteração
    -- automática ao funil. Era a poupança fácil e não se faz (D5).
    INSERT INTO public.entity_interactions
      (entity_id, organization_id, root_organization_id, interaction_type,
       subject, notes, created_by, interaction_at)
    SELECT
      u.entity_id,
      u.organization_id,
      u.root_organization_id,
      'note',
      'Recalculo automático de estágio do pipeline',
      'Estágio alterado automaticamente de "' || COALESCE(os.label, 'sem estágio') ||
        '" para "' || COALESCE(ns.label, 'sem estágio') || '".',
      auth.uid()::text,
      now()
    FROM updated u
    LEFT JOIN public.lead_workflow_stages os ON os.id = u.old_stage_id
    LEFT JOIN public.lead_workflow_stages ns ON ns.id = u.new_stage_id
    WHERE u.entity_id IS NOT NULL
    RETURNING 1
  ),
  unresolved AS (
    SELECT id FROM resolved WHERE new_stage_id IS NULL
  ),
  unresolved_sample AS (
    SELECT id FROM unresolved ORDER BY id LIMIT 50
  )
  SELECT
    (SELECT COUNT(*) FROM updated)::integer,
    (SELECT COUNT(*) FROM logged)::integer,
    -- v_total_count = leads EXAMINADAS neste lote, não da organização (D7).
    (SELECT COUNT(*) FROM resolved)::integer,
    (SELECT COUNT(*) FROM unresolved)::integer,
    (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM unresolved_sample),
    -- Maior id examinado = cursor para a chamada seguinte. NULL se o lote veio
    -- vazio, ou seja, se já não há mais nada para processar (D7).
    --
    -- ORDER BY ... DESC LIMIT 1 e NÃO max(id): o PostgreSQL não tem agregado
    -- max()/min() para uuid (verificado ao vivo — "function max(uuid) does not
    -- exist"). O operador de ordenação existe, o agregado é que não, por isso
    -- esta é a forma de obter o maior uuid. Usa a mesma ordem do ORDER BY id da
    -- CTE `batch`, portanto o cursor é coerente com o corte do lote.
    (SELECT r_max.id FROM resolved r_max ORDER BY r_max.id DESC LIMIT 1)
  INTO v_count, v_logged_count, v_total_count, v_unresolved_count, v_unresolved_ids, v_last_id;

  IF v_unresolved_count > 0 THEN
    RAISE WARNING 'recompute_leads_v2_buckets: % of % active lead(s) in org % did not resolve to any workflow stage (compute_lead_stage_v2 returned NULL)',
      v_unresolved_count, v_total_count, p_org;
  END IF;

  RETURN QUERY SELECT v_count, v_unresolved_count, v_unresolved_ids, v_total_count, v_last_id;
END;
$function$;


-- ============================================================
-- PARTE 4 — ACL (D8)
-- ============================================================
-- O DROP da PARTE 2 levou a ACL antiga com ele. Sem estas três linhas a função
-- nasceria com EXECUTE para PUBLIC — mais aberta do que a anterior, e ela é
-- SECURITY DEFINER. Não é higiene, é obrigatório.

REVOKE ALL     ON FUNCTION public.recompute_leads_v2_buckets(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid, integer, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid, integer, uuid) TO service_role;

COMMENT ON FUNCTION public.recompute_leads_v2_buckets(uuid, integer, uuid) IS
  'Recalcula a etapa do funil (workflow_stage_id) das leads activas de uma '
  'organização, com compute_lead_stage_v2, e regista cada alteração como nota em '
  'entity_interactions. '
  'PROCESSA POR LOTES, com cursor por id: o role authenticated tem '
  'statement_timeout de 8s e uma passagem completa na Mudelar (6120 leads) leva '
  '~23s, pelo que a chamada sem lote rebentava sempre. '
  'p_limit NULL processa tudo (comportamento histórico, preservado); p_limit N '
  'processa no máximo N leads, escolhidas por ORDER BY id. p_after NULL começa do '
  'princípio; p_after = <uuid> continua a partir daí (só leads com id maior). '
  'O cliente itera: chama com p_after = last_id da chamada anterior e pára quando '
  'processed_count < p_limit ou last_id vier NULL. '
  'processed_count = leads EXAMINADAS no lote (não as alteradas). '
  'updated_count = leads que mudaram mesmo de etapa NESTE lote. '
  'unresolved_count / unresolved_lead_ids = leads deste lote para as quais '
  'compute_lead_stage_v2 devolveu NULL, com a lista limitada a 50 ids (amostra). '
  'Todos os contadores são POR LOTE, nunca totais da organização — quem quiser '
  'totais soma-os do lado do cliente. '
  'O LIMIT é aplicado antes de compute_lead_stage_v2 (CTE batch/resolved, ambas '
  'MATERIALIZED): fundir essas CTE faria cada lote pagar o cálculo da organização '
  'inteira e anulava toda a correcção. '
  'SECURITY DEFINER: valida sempre p_org contra get_user_visible_org_ids(auth.uid()).';


-- ============================================================
-- PARTE 5 — auto-teste (D9)
-- ============================================================
-- Não chama a função: dentro de uma migração auth.uid() é NULL, a validação de
-- autorização rebentaria com 'not authorized for organization %' e o teste
-- falharia por um motivo que nada tem a ver com o que se quer provar. Verifica-se
-- por pg_proc tudo o que dá para verificar sem executar.

DO $auto_teste$
DECLARE
  v_oid              oid;
  v_n                integer;
  v_nargs            integer;
  v_ndefaults        integer;
  v_secdef           boolean;
  v_argnames         text[];
  v_argmodes         "char"[];
  v_out_names        text[];
  c_out_esperado constant text[] :=
    ARRAY['updated_count', 'unresolved_count', 'unresolved_lead_ids',
          'processed_count', 'last_id'];
BEGIN
  -- ── 5.1 Exactamente UMA função com este nome. Se houver duas, o DROP da
  --    PARTE 2 não apanhou tudo e a RPC está ambígua no PostgREST (D1).
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'recompute_leads_v2_buckets';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.1 falhou: esperava exactamente 1 função '
      'public.recompute_leads_v2_buckets, encontrei %. Um overload torna a RPC '
      'ambígua no PostgREST.', v_n;
  END IF;

  SELECT p.oid, p.pronargs, p.pronargdefaults, p.prosecdef, p.proargnames, p.proargmodes
    INTO v_oid, v_nargs, v_ndefaults, v_secdef, v_argnames, v_argmodes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'recompute_leads_v2_buckets';

  -- ── 5.2 Três argumentos de entrada.
  IF v_nargs IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.2 falhou: esperava 3 argumentos de entrada, tem %. '
      'Assinatura actual: recompute_leads_v2_buckets(%)',
      v_nargs, pg_get_function_identity_arguments(v_oid);
  END IF;

  -- ── 5.3 Os dois últimos têm DEFAULT. Sem isto as chamadas antigas, com só
  --    p_org, deixariam de funcionar (D4).
  IF v_ndefaults IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.3 falhou: esperava 2 argumentos com DEFAULT '
      '(p_limit e p_after), tem %. Sem os defaults, recompute_leads_v2_buckets('
      'p_org) sozinha deixa de resolver.', v_ndefaults;
  END IF;

  -- ── 5.4 A assinatura de identidade, tal como o PostgREST a vê.
  IF pg_get_function_identity_arguments(v_oid) IS DISTINCT FROM 'p_org uuid, p_limit integer, p_after uuid' THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.4 falhou: assinatura inesperada. Esperava '
      '"p_org uuid, p_limit integer, p_after uuid", obtive "%".',
      pg_get_function_identity_arguments(v_oid);
  END IF;

  -- ── 5.5 SECURITY DEFINER preservado (D6). Sem isto a função perdia o acesso
  --    às tabelas por baixo da RLS e falhava para todos os utilizadores.
  IF v_secdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.5 falhou: a função não ficou SECURITY DEFINER.';
  END IF;

  -- ── 5.6 search_path fixo em public. Numa função SECURITY DEFINER um
  --    search_path solto é um vector de escalada de privilégios.
  --    A comparação é feita sobre o texto de proconfig com as aspas retiradas,
  --    porque o Postgres tanto pode guardar `search_path=public` como
  --    `search_path="public"` conforme a forma como o SET foi escrito.
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

  -- ── 5.7 O retorno tem as 5 colunas esperadas, pela ordem esperada.
  --    proargmodes marca os parâmetros de saída de um RETURNS TABLE com 't'.
  IF v_argmodes IS NULL THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.7 falhou: proargmodes é NULL — a função não está a devolver '
      'um RETURNS TABLE com colunas nomeadas.';
  END IF;

  SELECT array_agg(nome ORDER BY ord) INTO v_out_names
    FROM (
      SELECT v_argnames[i] AS nome, i AS ord
        FROM generate_subscripts(v_argmodes, 1) AS i
       WHERE v_argmodes[i] = 't'
    ) s;

  IF v_out_names IS DISTINCT FROM c_out_esperado THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.7 falhou: colunas de retorno inesperadas. Esperava %, obtive %.',
      c_out_esperado::text, COALESCE(v_out_names::text, '(nenhuma)');
  END IF;

  -- ── 5.8 A versão antiga, de 1 argumento, já não pode existir (D1).
  IF to_regprocedure('public.recompute_leads_v2_buckets(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.8 falhou: a versão de 1 argumento ainda existe. Fica um '
      'overload e a RPC passa a ser ambígua no PostgREST — foi exactamente isto '
      'que aconteceu com rpc_save_quote.';
  END IF;

  -- ── 5.9 ACL: authenticated executa, anon e PUBLIC não (D8).
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.9 falhou: o role authenticated não pode executar a função — '
      'o botão de recálculo ficaria inutilizável.';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.9 falhou: o role anon PODE executar a função. É SECURITY '
      'DEFINER — o REVOKE não foi aplicado.';
  END IF;

  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 5.9 falhou: o role service_role não pode executar a função.';
  END IF;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'AUTO-TESTE: 9 verificações OK.';
  RAISE NOTICE '  assinatura : recompute_leads_v2_buckets(%)',
               pg_get_function_identity_arguments(v_oid);
  RAISE NOTICE '  retorno    : %', array_to_string(v_out_names, ', ');
  RAISE NOTICE '  defaults   : % (p_limit, p_after)', v_ndefaults;
  RAISE NOTICE '  segurança  : SECURITY DEFINER, search_path=public, '
               'EXECUTE só a authenticated e service_role';
  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'A função NÃO foi executada aqui: dentro de uma migração '
               'auth.uid() é NULL e a validação de autorização rebentaria (D9).';
  RAISE NOTICE 'NENHUMA lead foi recalculada por esta migração (D10). O '
               'recálculo continua a ser uma decisão do utilizador, no editor '
               'do funil — agora aos lotes, e sem timeout.';
  RAISE NOTICE '===========================================================';
END;
$auto_teste$;


-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- Repõe a função exactamente como estava antes desta migração: assinatura de 1
-- argumento, corpo vivo de F3, e os mesmos GRANTs. O DROP da versão de 3
-- argumentos é obrigatório na reversão pelo mesmo motivo que o DROP da de 1
-- argumento foi obrigatório aqui (D1) — sem ele ficam as duas e a RPC fica
-- ambígua no PostgREST.
--
-- ATENÇÃO: reverter traz de volta o timeout. O botão "Recalcular buckets das
-- leads" volta a rebentar com "canceling statement due to statement timeout" em
-- qualquer organização com alguns milhares de leads. Reverter só faz sentido se
-- o problema for outro e não este.
--
--   DROP FUNCTION IF EXISTS public.recompute_leads_v2_buckets(uuid, integer, uuid);
--
--   CREATE OR REPLACE FUNCTION public.recompute_leads_v2_buckets(p_org uuid)
--    RETURNS TABLE(updated_count integer, unresolved_count integer, unresolved_lead_ids uuid[])
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_authorized boolean;
--     v_count integer;
--     v_logged_count integer;
--     v_total_count integer;
--     v_unresolved_count integer;
--     v_unresolved_ids uuid[];
--   BEGIN
--     SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--     INTO v_authorized;
--
--     IF NOT COALESCE(v_authorized, false) THEN
--       RAISE EXCEPTION 'not authorized for organization %', p_org;
--     END IF;
--
--     WITH resolved AS (
--       SELECT
--         id,
--         entity_id,
--         organization_id,
--         root_organization_id,
--         workflow_stage_id AS old_stage_id,
--         public.compute_lead_stage_v2(id) AS new_stage_id
--       FROM public.anew_leads
--       WHERE organization_id = p_org AND deleted_at IS NULL
--     ),
--     updated AS (
--       UPDATE public.anew_leads al
--       SET workflow_stage_id = r.new_stage_id,
--           pipeline_dirty_at = NULL
--       FROM resolved r
--       WHERE al.id = r.id
--         AND al.workflow_stage_id IS DISTINCT FROM r.new_stage_id
--       RETURNING al.id, r.entity_id, r.organization_id, r.root_organization_id,
--         r.old_stage_id, r.new_stage_id
--     ),
--     logged AS (
--       INSERT INTO public.entity_interactions
--         (entity_id, organization_id, root_organization_id, interaction_type,
--          subject, notes, created_by, interaction_at)
--       SELECT
--         u.entity_id,
--         u.organization_id,
--         u.root_organization_id,
--         'note',
--         'Recalculo automático de estágio do pipeline',
--         'Estágio alterado automaticamente de "' || COALESCE(os.label, 'sem estágio') ||
--           '" para "' || COALESCE(ns.label, 'sem estágio') || '".',
--         auth.uid()::text,
--         now()
--       FROM updated u
--       LEFT JOIN public.lead_workflow_stages os ON os.id = u.old_stage_id
--       LEFT JOIN public.lead_workflow_stages ns ON ns.id = u.new_stage_id
--       WHERE u.entity_id IS NOT NULL
--       RETURNING 1
--     ),
--     unresolved AS (
--       SELECT id FROM resolved WHERE new_stage_id IS NULL
--     ),
--     unresolved_sample AS (
--       SELECT id FROM unresolved ORDER BY id LIMIT 50
--     )
--     SELECT
--       (SELECT COUNT(*) FROM updated)::integer,
--       (SELECT COUNT(*) FROM logged)::integer,
--       (SELECT COUNT(*) FROM resolved)::integer,
--       (SELECT COUNT(*) FROM unresolved)::integer,
--       (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM unresolved_sample)
--     INTO v_count, v_logged_count, v_total_count, v_unresolved_count, v_unresolved_ids;
--
--     IF v_unresolved_count > 0 THEN
--       RAISE WARNING 'recompute_leads_v2_buckets: % of % active lead(s) in org % did not resolve to any workflow stage (compute_lead_stage_v2 returned NULL)',
--         v_unresolved_count, v_total_count, p_org;
--     END IF;
--
--     RETURN QUERY SELECT v_count, v_unresolved_count, v_unresolved_ids;
--   END;
--   $function$;
--
--   REVOKE ALL     ON FUNCTION public.recompute_leads_v2_buckets(uuid) FROM PUBLIC, anon;
--   GRANT  EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid) TO authenticated;
--   GRANT  EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid) TO service_role;
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. Uma só versão, com a assinatura nova:
--      SELECT pg_get_function_identity_arguments(p.oid)
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'recompute_leads_v2_buckets';
--      -- uma linha: p_org uuid, p_limit integer, p_after uuid
--
-- 2. Um lote pequeno, autenticado como utilizador da organização (não como
--    postgres — a validação precisa de auth.uid()):
--      SELECT * FROM public.recompute_leads_v2_buckets(
--        '3242e925-da26-459a-8258-be04d904e355', 50, NULL);
--      -- processed_count = 50 e last_id preenchido => há mais; repetir com
--      --   p_after = last_id até processed_count < 50.
--
-- 3. Tempo por lote no browser: deve ficar bem abaixo dos 8s de statement_timeout
--    do role authenticated. Se um lote de 300 se aproximar dos 8s, baixar o lote
--    no frontend — não é preciso migração nenhuma para isso.
--
-- 4. O frontend TEM de ser alterado para iterar (ver o exemplo no cabeçalho).
--    Enquanto não for, o botão continua a chamar sem p_limit e continua a
--    rebentar — a migração dá a ferramenta, não muda quem a usa.
