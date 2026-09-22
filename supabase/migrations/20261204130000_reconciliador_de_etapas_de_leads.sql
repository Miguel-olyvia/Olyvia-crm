-- ============================================================================
-- pipeline_dirty_at deixa de ser uma fila SEM CONSUMIDOR
--
-- Cria: public.fn_reconcile_dirty_lead_pipelines(integer)
-- Agenda: tarefa pg_cron 'reconcile-lead-pipelines', de 5 em 5 minutos
--
-- NÃO altera: fn_mark_lead_pipeline_dirty, recompute_leads_v2_buckets,
--             compute_lead_stage_v2, nenhum gatilho, nenhuma tabela.
--             Esta migração SÓ ACRESCENTA.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- `anew_leads.pipeline_dirty_at` é uma fila com PRODUTOR e sem CONSUMIDOR.
--
-- Quem escreve na fila: public.fn_mark_lead_pipeline_dirty, o gatilho que corre
-- em cinco tabelas (deals, quotes, proposals, client_contracts,
-- entity_interactions). Quando um sinal muda, recalcula a etapa da lead e:
--   - se a etapa nova tem `auto_advance` → grava `status` + `workflow_stage_id`
--     e limpa `pipeline_dirty_at`;
--   - senão → escreve `pipeline_dirty_at = now()` e mais nada.
--
-- Quem lê `pipeline_dirty_at` para AGIR: ninguém. A marca fica lá para sempre,
-- e a lead fica para sempre com a etapa antiga no ecrã.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO (22/09/2026)
-- ---------------------------------------------------------------------------
--   F1. 585 leads com `pipeline_dirty_at IS NOT NULL` — marcadas e nunca
--       processadas. A mais antiga está marcada desde 22/07/2026: dois meses à
--       espera de um consumidor que não existe.
--
--   F2. 335 leads têm `workflow_stage_id` DIFERENTE de
--       compute_lead_stage_v2(id), repartidas por organização:
--         nike 165, BMClean 95, BM24 50, teste 13, Mudelar 5, Gromicho 4,
--         sdfsdf 3.
--       O kanban mostra `workflow_stage_id`. Ou seja: o motor calcula bem e o
--       ecrã mostra outra coisa. Não é um bug de cálculo, é uma cache que
--       ninguém actualiza.
--
--   F3. Não há nenhuma tarefa em `cron.job` a consumir a fila. As 10 tarefas
--       existentes são limpezas de dados e chamadas http a edge functions —
--       nenhuma toca em pipeline_dirty_at.
--
--   F4. O frontend também não lê a coluna para nada:
--       src/lib/timeline/auditIgnoredFields.ts classifica `pipeline_dirty_at`
--       como "purely internal bookkeeping" e esconde-a da cronologia. Logo não
--       há ninguém, de nenhum dos lados, a esvaziar a fila.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--   D1. SEPARAR "sincronizar a cache" de "avançar o estado". É O PONTO desta
--       migração, e é uma decisão do utilizador:
--
--         `workflow_stage_id` — sincroniza SEMPRE que o calculado seja NOT NULL
--             e diferente do gravado, com ou sem `auto_advance`. Esta coluna é
--             uma CÓPIA do que compute_lead_stage_v2 já calcula; uma cópia
--             desactualizada não serve a ninguém, e é exactamente ela que o
--             kanban mostra (F2).
--
--         `status` — só muda quando a etapa de destino tem
--             `auto_advance = true`, e nesse caso passa a
--             COALESCE(default_status, name) da etapa. Com `auto_advance`
--             desligado o `status` fica INTACTO. "Avanço automático desligado"
--             tem de continuar a significar "não mexas na lead sozinho" — é a
--             promessa que a configuração do funil faz ao utilizador e esta
--             função não a quebra.
--
--   D2. `pipeline_dirty_at` passa a NULL em TODAS as leads examinadas, mesmo
--       nas que não mudaram de etapa. Se só se limpasse a marca às que mudam, a
--       fila nunca esvaziava: as leads já coerentes voltariam no lote seguinte,
--       para sempre, e as mais antigas (ORDER BY pipeline_dirty_at ASC) ficavam
--       a tapar a saída às outras. Marca consumida é marca apagada.
--
--   D3. NÃO cria notas em `entity_interactions`. Nem "Lead perdida
--       automaticamente" nem nenhuma outra. Esta é uma diferença DELIBERADA
--       face a fn_mark_lead_pipeline_dirty e a recompute_leads_v2_buckets, que
--       escrevem notas de propósito:
--         - ali, a nota regista um acontecimento de negócio ou um recálculo
--           pedido à mão por um utilizador, num momento identificável;
--         - aqui, é uma reconciliação de uma CACHE que corre sozinha de 5 em 5
--           minutos. 585 notas de uma assentada (F1), e depois mais a cada
--           ciclo, afogavam a cronologia dos clientes com ruído de manutenção e
--           tornavam-na inútil para quem a lê para perceber o negócio.
--       Quem quiser saber o que mudou tem a auditoria (D5).
--
--   D4. NÃO toca em `lost_reason`. Marcar uma lead como perdida COM MOTIVO é um
--       acto do gatilho de rejeição (ver 20261204120000), tomado no momento em
--       que o sinal chega. Um reconciliador de cache que corre duas horas depois
--       não tem contexto nenhum para inventar um motivo de perda, e escrevê-lo
--       aqui punha texto gerado por manutenção num campo que o comercial lê.
--
--   D5. O gatilho de auditoria `trg_audit_anew_leads` MANTÉM-SE ligado, e NÃO se
--       usa `app.audit_bypass`. Cada linha alterada aqui é uma alteração real ao
--       registo da lead — a etapa que o kanban mostra muda — e tem de ficar
--       registada. O custo (uma linha de auditoria por lead alterada) é o preço
--       de saber quem mexeu no quê, e paga-se.
--
--   D6. O LIMIT é aplicado ANTES do cálculo, com duas CTE MATERIALIZED
--       (`batch` → só colunas da tabela, ordena e corta; `resolved` → corre
--       compute_lead_stage_v2 já só sobre o lote). compute_lead_stage_v2 é caro:
--       ~0,8ms por lead, medido em 20261204060000, onde esta mesma técnica foi
--       usada pelo mesmo motivo. Sem o MATERIALIZED o planeador é livre de
--       fundir as CTE e de avaliar a função em TODAS as leads marcadas antes de
--       cortar nas 500 — e cada ciclo de cron pagaria a fila inteira.
--
--   D7. ORDER BY pipeline_dirty_at ASC: as mais antigas primeiro. É a ordem
--       justa (a lead marcada em Julho é a que está errada no ecrã há mais
--       tempo) e, com o D2, garante progresso — o que foi consumido não volta.
--       Não é preciso cursor por id como em 20261204060000: aqui a própria
--       condição de selecção desaparece à medida que se processa.
--
--   D8. `restantes` é devolvido para quem chama saber se precisa de correr outra
--       vez. Com 585 na fila (F1) e lotes de 500, esvazia em dois ciclos, ou
--       seja em 10 minutos. Daí para a frente cada ciclo apanha só o que se
--       sujou nos 5 minutos anteriores — dezenas, não centenas.
--
--   D9. ACL fechada: REVOKE de PUBLIC, anon e authenticated; EXECUTE só a
--       service_role. É uma função de MANUTENÇÃO, não faz parte da API do
--       frontend. Dar EXECUTE a `authenticated` seria expor uma função
--       SECURITY DEFINER que escreve em anew_leads de TODAS as organizações,
--       sem validação por get_user_visible_org_ids — qualquer utilizador
--       autenticado poderia disparar escritas em leads que não vê. O botão do
--       editor do funil continua a ser recompute_leads_v2_buckets, que valida a
--       organização; esta é para o cron e para o service_role.
--
--  D10. NENHUMA lead é alterada pela migração em si. A função NÃO é executada
--       no auto-teste: ela escreve em anew_leads, e uma migração não é sítio
--       para 585 UPDATEs com gatilhos de auditoria atrás. A primeira
--       reconciliação acontece quando a tarefa correr, no máximo 5 minutos
--       depois de aplicar.
--
-- ---------------------------------------------------------------------------
-- AVISO A QUEM VIER A SEGUIR — o custo dos gatilhos, e porque é que está bem
-- ---------------------------------------------------------------------------
-- Um UPDATE em anew_leads dispara `trg_sync_lead_workflow_stage_id` (AFTER
-- UPDATE), que volta a chamar compute_lead_stage_v2 uma vez por linha. Isto é
-- esperado e NÃO é um erro: o valor que ele calcula já vai coincidir com o que
-- acabámos de gravar (viemos da mesma função), portanto não há escrita aninhada
-- nem risco de recursão — só o custo do cálculo repetido. Na prática, um lote de
-- 500 leads paga o compute_lead_stage_v2 duas vezes, uma na CTE `resolved` e
-- outra no gatilho. É por isso que o lote é de 500 e o ciclo de 5 minutos, e não
-- o contrário: há folga de sobra para o dobro do trabalho.
--
-- Não se desliga o gatilho, não se mexe nele, e não se tenta ser esperto a
-- evitá-lo. Ele existe para manter a coluna coerente venha a escrita de onde
-- vier, e essa garantia vale mais do que os milissegundos que se poupavam.
-- ============================================================================


-- ============================================================
-- PARTE 1 — guardas
-- ============================================================
-- Nada do que esta migração cria faz sentido se uma destas peças faltar. Mais
-- vale rebentar aqui, à aplicação, do que criar uma função que só rebenta daqui
-- a 5 minutos dentro do cron, onde ninguém está a olhar.

DO $guarda$
DECLARE
  v_col_existe boolean;
BEGIN
  -- 1.1 O motor que resolve a etapa de cada lead.
  IF to_regprocedure('public.compute_lead_stage_v2(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'public.compute_lead_stage_v2(uuid) não existe — é o motor que esta função '
      'reconcilia. Sem ele não há nada para reconciliar.';
  END IF;

  -- 1.2 As tabelas.
  IF to_regclass('public.anew_leads') IS NULL THEN
    RAISE EXCEPTION 'public.anew_leads não existe.';
  END IF;

  IF to_regclass('public.lead_workflow_stages') IS NULL THEN
    RAISE EXCEPTION
      'public.lead_workflow_stages não existe — é de lá que vêm auto_advance e '
      'default_status, que decidem se o estado avança (D1).';
  END IF;

  -- 1.3 A própria fila. É o objecto central desta migração.
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'anew_leads'
       AND column_name  = 'pipeline_dirty_at'
  ) INTO v_col_existe;

  IF NOT v_col_existe THEN
    RAISE EXCEPTION
      'A coluna public.anew_leads.pipeline_dirty_at não existe — é a fila que '
      'esta migração passa a consumir.';
  END IF;

  -- 1.4 pg_cron. Sem ele a função ficava criada e nunca era chamada por
  --     ninguém: trocávamos uma fila sem consumidor por outra. Rebenta.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION
      'A extensão pg_cron não está instalada — sem ela a tarefa não pode ser '
      'agendada e a fila pipeline_dirty_at continuava sem consumidor, que é '
      'exactamente o problema que esta migração resolve.';
  END IF;

  RAISE NOTICE 'GUARDA: compute_lead_stage_v2, anew_leads.pipeline_dirty_at, '
               'lead_workflow_stages e pg_cron presentes.';
END;
$guarda$;


-- ============================================================
-- PARTE 2 — o estado da fila, hoje, antes de mexer
-- ============================================================
-- Só relatório. Fica no log da aplicação da migração para se poder comparar
-- depois: se daqui a uma hora o número não tiver descido, a tarefa não está a
-- correr e é aí que se vai procurar.

DO $relatorio$
DECLARE
  v_marcadas   integer;
  v_mais_velha timestamptz;
BEGIN
  SELECT COUNT(*)::integer, MIN(pipeline_dirty_at)
    INTO v_marcadas, v_mais_velha
    FROM public.anew_leads
   WHERE pipeline_dirty_at IS NOT NULL
     AND deleted_at IS NULL;

  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'FILA pipeline_dirty_at, neste momento:';
  RAISE NOTICE '  leads marcadas e por processar : %', v_marcadas;
  RAISE NOTICE '  marca mais antiga             : %',
               COALESCE(v_mais_velha::text, '(nenhuma)');

  IF v_marcadas = 0 THEN
    RAISE NOTICE '  A fila está vazia — a tarefa fica agendada na mesma, para o '
                 'que se sujar a partir de agora.';
  ELSE
    RAISE NOTICE '  Com lotes de 500 de 5 em 5 minutos, esvazia em % ciclo(s).',
                 GREATEST(1, CEIL(v_marcadas::numeric / 500)::integer);
  END IF;
  RAISE NOTICE '-----------------------------------------------------------';
END;
$relatorio$;


-- ============================================================
-- PARTE 3 — o consumidor
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reconcile_dirty_lead_pipelines(
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  examinadas           integer,
  etapas_sincronizadas integer,
  estados_avancados    integer,
  restantes            integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_examinadas integer := 0;
  v_etapas     integer := 0;
  v_estados    integer := 0;
  v_restantes  integer := 0;
BEGIN
  -- Guarda. p_limit NULL ou <= 0 não é "processa tudo": aqui, ao contrário de
  -- recompute_leads_v2_buckets, quem chama é o cron e um lote sem tecto podia
  -- pegar na fila inteira de uma vez, com o compute_lead_stage_v2 a ser pago
  -- duas vezes por lead (ver AVISO no cabeçalho). Exige-se um número positivo.
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit tem de ser um inteiro positivo, recebi %',
      COALESCE(p_limit::text, 'NULL');
  END IF;

  WITH batch AS MATERIALIZED (
    -- O LOTE. Só colunas da tabela aqui dentro: nada de compute_lead_stage_v2,
    -- para o corte acontecer ANTES do cálculo e não depois (D6).
    -- ORDER BY pipeline_dirty_at ASC = as que estão erradas no ecrã há mais
    -- tempo saem primeiro (D7).
    SELECT
      al.id,
      al.workflow_stage_id AS old_stage_id
    FROM public.anew_leads al
    WHERE al.pipeline_dirty_at IS NOT NULL
      AND al.deleted_at IS NULL
    ORDER BY al.pipeline_dirty_at ASC
    LIMIT p_limit
  ),
  resolved AS MATERIALIZED (
    -- O CÁLCULO, já só sobre as leads do lote. MATERIALIZED nas duas CTE é o
    -- que impede o planeador de as fundir e de empurrar a função cara para
    -- antes do LIMIT (D6).
    SELECT
      b.id,
      b.old_stage_id,
      public.compute_lead_stage_v2(b.id) AS new_stage_id
    FROM batch b
  ),
  alvo AS MATERIALIZED (
    -- A DECISÃO, lead a lead. LEFT JOIN: se compute_lead_stage_v2 devolveu NULL
    -- (lead que não resolve para etapa nenhuma) a linha continua no lote, para
    -- lhe ser limpa a marca (D2), mas `muda_etapa` fica false e nada se escreve
    -- além do pipeline_dirty_at.
    SELECT
      r.id,
      -- Sincroniza a cache SEMPRE que há um valor novo e diferente,
      -- independentemente de auto_advance (D1).
      (r.new_stage_id IS NOT NULL
        AND r.new_stage_id IS DISTINCT FROM r.old_stage_id) AS muda_etapa,
      -- O estado só avança com auto_advance ligado (D1). Sem ele, `status`
      -- fica intacto mesmo com a etapa a mudar.
      (r.new_stage_id IS NOT NULL
        AND r.new_stage_id IS DISTINCT FROM r.old_stage_id
        AND COALESCE(s.auto_advance, false)
        AND COALESCE(s.default_status, s.name) IS NOT NULL) AS muda_estado,
      r.new_stage_id,
      COALESCE(s.default_status, s.name) AS novo_status
    FROM resolved r
    LEFT JOIN public.lead_workflow_stages s ON s.id = r.new_stage_id
  ),
  escrito AS (
    -- UM só UPDATE para as três coisas. Note-se que TODAS as leads do lote são
    -- actualizadas, mesmo as que não mudam de etapa: é pipeline_dirty_at = NULL
    -- que esvazia a fila (D2).
    --
    -- Este UPDATE dispara trg_sync_lead_workflow_stage_id (AFTER UPDATE) e
    -- trg_audit_anew_leads. Ambos ficam ligados de propósito (D5 e AVISO).
    UPDATE public.anew_leads al
    SET
      workflow_stage_id = CASE WHEN a.muda_etapa
                               THEN a.new_stage_id
                               ELSE al.workflow_stage_id END,
      status            = CASE WHEN a.muda_estado
                               THEN a.novo_status
                               ELSE al.status END,
      -- Sempre. Marca consumida é marca apagada (D2).
      pipeline_dirty_at = NULL
      -- lost_reason NÃO aparece aqui, e é de propósito (D4).
    FROM alvo a
    WHERE al.id = a.id
    RETURNING a.muda_etapa AS muda_etapa, a.muda_estado AS muda_estado
  )
  SELECT
    COUNT(*)::integer,
    (COUNT(*) FILTER (WHERE e.muda_etapa))::integer,
    (COUNT(*) FILTER (WHERE e.muda_estado))::integer
  INTO v_examinadas, v_etapas, v_estados
  FROM escrito e;

  -- Quantas ficam por processar DEPOIS deste lote. Lido como instrução
  -- separada, já depois do UPDATE, portanto vê o efeito dele — e também vê o
  -- que os gatilhos tenham voltado a marcar entretanto, que é precisamente o
  -- que interessa a quem decide se corre outra vez (D8).
  SELECT COUNT(*)::integer
    INTO v_restantes
    FROM public.anew_leads
   WHERE pipeline_dirty_at IS NOT NULL
     AND deleted_at IS NULL;

  RETURN QUERY SELECT v_examinadas, v_etapas, v_estados, v_restantes;
END;
$function$;


-- ============================================================
-- PARTE 4 — ACL (D9)
-- ============================================================
-- Função de MANUTENÇÃO, SECURITY DEFINER, sem validação de organização: escreve
-- em leads de todas as organizações. Não pertence à API do frontend e
-- `authenticated` NÃO leva EXECUTE.

REVOKE ALL     ON FUNCTION public.fn_reconcile_dirty_lead_pipelines(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_dirty_lead_pipelines(integer) TO service_role;

COMMENT ON FUNCTION public.fn_reconcile_dirty_lead_pipelines(integer) IS
  'Consome a fila anew_leads.pipeline_dirty_at, que fn_mark_lead_pipeline_dirty '
  'enche e que até 20261204130000 ninguém lia (585 leads marcadas, a mais antiga '
  'de 22/07/2026, e 335 leads com workflow_stage_id diferente do que '
  'compute_lead_stage_v2 calcula). '
  'SEPARA DUAS COISAS QUE NÃO SÃO A MESMA: '
  '(1) workflow_stage_id é SEMPRE sincronizado quando o calculado é NOT NULL e '
  'difere do gravado, com ou sem auto_advance — é uma cópia do que o motor já '
  'calcula, é o que o kanban mostra, e uma cópia desactualizada não serve a '
  'ninguém; '
  '(2) status SÓ muda quando a etapa de destino tem auto_advance = true, e passa '
  'a COALESCE(default_status, name) — com auto_advance desligado o status fica '
  'INTACTO, porque "avanço automático desligado" tem de continuar a significar '
  '"não mexas na lead sozinho". '
  'pipeline_dirty_at passa a NULL em todas as leads examinadas, mudem de etapa '
  'ou não, senão a fila nunca esvaziava. '
  'NÃO escreve notas em entity_interactions (é reconciliação de uma cache que '
  'corre de 5 em 5 minutos, não um acontecimento de negócio: afogaria a '
  'cronologia) e NÃO toca em lost_reason (marcar uma lead como perdida com '
  'motivo é acto do gatilho de rejeição, não deste reconciliador). A auditoria '
  'por trg_audit_anew_leads mantém-se ligada. '
  'Processa por lotes ordenados por pipeline_dirty_at ASC, com o LIMIT aplicado '
  'ANTES de compute_lead_stage_v2 (CTE batch/resolved, ambas MATERIALIZED). '
  'restantes = quantas leads continuam marcadas depois deste lote, para quem '
  'chama saber se precisa de correr outra vez. '
  'Manutenção, não API: EXECUTE só a service_role. Chamada pela tarefa pg_cron '
  '''reconcile-lead-pipelines'' a cada 5 minutos.';


-- ============================================================
-- PARTE 5 — a tarefa agendada
-- ============================================================
-- Primeiro o unschedule, para a migração poder ser reaplicada sem duplicar a
-- tarefa; dentro de um bloco DO que não rebenta se ela ainda não existir.

DO $desagendar$
BEGIN
  PERFORM cron.unschedule('reconcile-lead-pipelines')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-lead-pipelines');
END;
$desagendar$;

-- Agora agenda. Ao contrário das tarefas de limpeza de 20261105020000, aqui NÃO
-- se engole a excepção com "best-effort": se o agendamento falhar, a função fica
-- sem quem a chame e o problema desta migração continua exactamente igual. Se
-- falhar, queremos saber à aplicação.
--
-- 500 leads de 5 em 5 minutos dá folga larga: a fila de hoje (585) esvazia em
-- dois ciclos e, em regime, cada ciclo apanha só o que se sujou nos 5 minutos
-- anteriores.
DO $agendar$
BEGIN
  PERFORM cron.schedule(
    'reconcile-lead-pipelines',
    '*/5 * * * *',
    $cron$SELECT public.fn_reconcile_dirty_lead_pipelines(500)$cron$
  );

  RAISE NOTICE 'Tarefa ''reconcile-lead-pipelines'' agendada: */5 * * * *';
END;
$agendar$;


-- ============================================================
-- PARTE 6 — auto-teste (D10)
-- ============================================================
-- NÃO chama a função. Ela escreve em anew_leads — 585 UPDATEs com dois gatilhos
-- atrás de cada um — e uma migração não é sítio para alterar dados de negócio.
-- Verifica-se por pg_proc e cron.job tudo o que dá para verificar sem executar.

DO $auto_teste$
DECLARE
  v_oid      oid;
  v_n        integer;
  v_nargs    integer;
  v_job      record;
BEGIN
  -- ── 6.1 Existe exactamente UMA função com este nome. Um overload aqui seria
  --    ambíguo para o cron tal como é para o PostgREST.
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_reconcile_dirty_lead_pipelines';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.1 falhou: esperava exactamente 1 função '
      'public.fn_reconcile_dirty_lead_pipelines, encontrei %.', v_n;
  END IF;

  SELECT p.oid, p.pronargs INTO v_oid, v_nargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_reconcile_dirty_lead_pipelines';

  -- ── 6.2 Um argumento de entrada, com DEFAULT (o cron passa-o explicitamente,
  --    mas quem chamar à mão deve poder não passar).
  IF v_nargs IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.2 falhou: esperava 1 argumento de entrada, tem %. '
      'Assinatura actual: fn_reconcile_dirty_lead_pipelines(%)',
      v_nargs, pg_get_function_identity_arguments(v_oid);
  END IF;

  IF pg_get_function_identity_arguments(v_oid) IS DISTINCT FROM 'p_limit integer' THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.2 falhou: assinatura inesperada. Esperava "p_limit integer", '
      'obtive "%".', pg_get_function_identity_arguments(v_oid);
  END IF;

  -- ── 6.3 SECURITY DEFINER com search_path fixo. A função escreve em leads de
  --    todas as organizações; um search_path solto seria um vector de escalada.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.prosecdef) THEN
    RAISE EXCEPTION 'AUTO-TESTE 6.3 falhou: a função não ficou SECURITY DEFINER.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p,
           LATERAL unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
     WHERE p.oid = v_oid
       AND replace(cfg, '"', '') = 'search_path=public'
  ) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.3 falhou: a função não ficou com SET search_path TO public. '
      'proconfig = %', (SELECT COALESCE(p.proconfig::text, '(NULL)')
                          FROM pg_proc p WHERE p.oid = v_oid);
  END IF;

  -- ── 6.4 ACL fechada (D9). É aqui que se apanha um REVOKE esquecido: a função
  --    nasceria com EXECUTE para PUBLIC, sendo SECURITY DEFINER e sem validação
  --    de organização.
  IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.4 falhou: o role authenticated PODE executar a função. É uma '
      'função de manutenção SECURITY DEFINER que escreve em leads de todas as '
      'organizações — não pertence à API do frontend.';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.4 falhou: o role anon PODE executar a função.';
  END IF;

  -- PUBLIC verifica-se pela ACL e não por has_function_privilege: 'public' é um
  -- pseudo-role, não está em pg_roles, e passá-lo àquela função dá erro de role
  -- inexistente. Em aclexplode, PUBLIC é o grantee com oid 0.
  IF EXISTS (
    SELECT 1
      FROM pg_proc p,
           LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
     WHERE p.oid = v_oid
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.4 falhou: PUBLIC ainda tem EXECUTE — o REVOKE não pegou.';
  END IF;

  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.4 falhou: o role service_role não pode executar a função — '
      'ninguém a conseguiria chamar.';
  END IF;

  -- ── 6.5 A tarefa ficou agendada, com o horário certo e activa. Sem isto
  --    voltávamos ao problema de origem: uma fila sem consumidor.
  SELECT j.jobname, j.schedule, j.command, j.active
    INTO v_job
    FROM cron.job j
   WHERE j.jobname = 'reconcile-lead-pipelines';

  IF v_job IS NULL THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.5 falhou: a tarefa ''reconcile-lead-pipelines'' não existe em '
      'cron.job. A função ficaria sem quem a chamasse e a fila continuaria sem '
      'consumidor — que é o problema que esta migração resolve.';
  END IF;

  IF v_job.schedule IS DISTINCT FROM '*/5 * * * *' THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.5 falhou: horário inesperado. Esperava "*/5 * * * *", '
      'obtive "%".', v_job.schedule;
  END IF;

  IF NOT COALESCE(v_job.active, false) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.5 falhou: a tarefa existe mas está INACTIVA — nunca correria.';
  END IF;

  IF position('fn_reconcile_dirty_lead_pipelines' in v_job.command) = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.5 falhou: a tarefa está agendada mas não chama a função. '
      'command = %', v_job.command;
  END IF;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'AUTO-TESTE: 5 grupos de verificações OK.';
  RAISE NOTICE '  assinatura : fn_reconcile_dirty_lead_pipelines(%)',
               pg_get_function_identity_arguments(v_oid);
  RAISE NOTICE '  segurança  : SECURITY DEFINER, search_path=public, EXECUTE só '
               'a service_role (authenticated, anon e PUBLIC sem acesso)';
  RAISE NOTICE '  tarefa     : % | % | activa=%',
               v_job.jobname, v_job.schedule, v_job.active;
  RAISE NOTICE '  comando    : %', v_job.command;
  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'NENHUMA LEAD FOI ALTERADA POR ESTA MIGRAÇÃO. A função não foi '
               'executada aqui de propósito (D10): escreve em anew_leads e uma '
               'migração não é sítio para isso.';
  RAISE NOTICE 'A PRIMEIRA RECONCILIAÇÃO acontece quando a tarefa correr — no '
               'máximo daqui a 5 minutos.';
  RAISE NOTICE 'fn_mark_lead_pipeline_dirty, recompute_leads_v2_buckets e '
               'compute_lead_stage_v2 NÃO foram tocadas. Nenhum gatilho foi '
               'recriado.';
  RAISE NOTICE '===========================================================';
END;
$auto_teste$;


-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- ATENÇÃO: reverter devolve a fila ao estado de origem — produtor sem
-- consumidor. As leads voltam a acumular pipeline_dirty_at para sempre e o
-- kanban volta a divergir do que compute_lead_stage_v2 calcula. Reverter só faz
-- sentido se o problema for outro e não este.
--
-- Pela ordem: primeiro tirar o agendamento (senão fica uma tarefa a chamar uma
-- função que já não existe, e o cron a registar falhas de 5 em 5 minutos), só
-- depois apagar a função.
--
--   SELECT cron.unschedule('reconcile-lead-pipelines');
--   DROP FUNCTION public.fn_reconcile_dirty_lead_pipelines(integer);
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. A tarefa ficou registada:
--      SELECT jobname, schedule, command, active
--        FROM cron.job WHERE jobname = 'reconcile-lead-pipelines';
--
-- 2. Ao fim de ~10 minutos (dois ciclos), a fila tem de ter esvaziado:
--      SELECT count(*) AS marcadas, min(pipeline_dirty_at) AS mais_antiga
--        FROM public.anew_leads
--       WHERE pipeline_dirty_at IS NOT NULL AND deleted_at IS NULL;
--      -- de 585 para perto de 0; a "mais_antiga" deixa de ser de Julho.
--
-- 3. A divergência das 335 leads tem de ter desaparecido:
--      SELECT count(*)
--        FROM public.anew_leads al
--       WHERE al.deleted_at IS NULL
--         AND public.compute_lead_stage_v2(al.id) IS NOT NULL
--         AND public.compute_lead_stage_v2(al.id) IS DISTINCT FROM al.workflow_stage_id;
--      -- deve tender para 0 (cuidado: esta consulta é cara, correr fora de horas).
--
-- 4. Confirmar que o `status` NÃO mexeu onde auto_advance está desligado (D1) —
--    é a promessa mais importante desta migração. Escolher uma lead que tenha
--    sido sincronizada para uma etapa com auto_advance = false e verificar na
--    auditoria que só workflow_stage_id e pipeline_dirty_at mudaram:
--      SELECT changed_at, changes
--        FROM public.entity_audit_log
--       WHERE table_name = 'anew_leads' AND record_id = '<uuid da lead>'
--       ORDER BY changed_at DESC LIMIT 5;
--
-- 5. Confirmar que NÃO apareceram notas de manutenção na cronologia (D3):
--      SELECT count(*) FROM public.entity_interactions
--       WHERE interaction_at > now() - interval '1 hour'
--         AND notes ILIKE '%automaticamente%';
--      -- não deve subir por causa desta tarefa.
--
-- 6. Saúde da tarefa, se algo parecer parado:
--      SELECT start_time, status, return_message
--        FROM cron.job_run_details
--       WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reconcile-lead-pipelines')
--       ORDER BY start_time DESC LIMIT 10;
