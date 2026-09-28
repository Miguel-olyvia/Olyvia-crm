-- ============================================================================
-- Mudar a CONFIGURAÇÃO do funil passa a reavaliar as leads
--
-- Cria:   public.fn_mark_org_leads_pipeline_dirty()  (função de gatilho)
-- Cria:   9 gatilhos AFTER ... FOR EACH STATEMENT (3 tabelas × INSERT/UPDATE/DELETE)
--           lead_workflow_stages, lead_pipeline_settings, lead_stage_transitions
-- Altera: a tarefa pg_cron 'reconcile-lead-pipelines' passa de lote 500 para 2000
-- Marca:  UMA vez, as leads já dessincronizadas das organizações COM funil próprio
--
-- NÃO altera: fn_reconcile_dirty_lead_pipelines, fn_mark_lead_pipeline_dirty,
--             compute_lead_stage_v2, recompute_leads_v2_buckets,
--             rpc_save_lead_workflow_stages, nenhuma tabela, nenhuma política RLS.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- Mudar a configuração do funil não reavalia NENHUMA lead.
--
-- Cria-se um estágio, muda-se uma regra, liga-se o fluxo sequencial — e nem uma
-- lead é reavaliada. O ecrã continua a mostrar a etapa calculada com as regras
-- ANTIGAS, até que aconteça outra coisa qualquer.
--
-- O motor só volta a correr em dois casos:
--   (a) quando muda um SINAL — deals, quotes, proposals, client_contracts,
--       entity_interactions — via public.fn_mark_lead_pipeline_dirty;
--   (b) quando alguém carrega à mão no botão "Recalcular buckets das leads".
--
-- Ou seja: o utilizador reconfigura o funil, fecha o editor, e fica convencido de
-- que o que vê no kanban resulta da configuração que acabou de gravar. Não
-- resulta. Resulta da anterior.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO (22/09/2026)
-- ---------------------------------------------------------------------------
--   F1. As três tabelas de configuração do funil — `lead_workflow_stages`,
--       `lead_pipeline_settings` e `lead_stage_transitions` — NÃO têm nenhum
--       gatilho que marque leads para recálculo. Confirmado em `pg_trigger`: só
--       existem os `update_*_updated_at` e um gatilho de auditoria em
--       `lead_pipeline_settings`. Nenhum deles toca em `anew_leads`.
--
--   F2. Desde 20261204130000 existe
--       `public.fn_reconcile_dirty_lead_pipelines(p_limit)`, agendada como tarefa
--       pg_cron 'reconcile-lead-pipelines' (`*/5 * * * *`, hoje com lote 500), que
--       consome a fila `anew_leads.pipeline_dirty_at`. Há consumidor. O que falta
--       é alguém pôr as leads na fila quando a CONFIGURAÇÃO muda — e é só isso
--       que esta migração acrescenta.
--
--   F3. ~170 leads estão dessincronizadas neste momento em organizações COM funil
--       próprio: nike 164, Mudelar 5, Gromicho 1.
--
--   F4. Outras organizações estão dessincronizadas mas NÃO têm funil próprio
--       (nenhuma linha activa em lead_workflow_stages com o seu organization_id):
--       BMClean 95, BM24 45, teste 12, sdfsdf 3. Para estas, o motor só consegue
--       atribuir etapas do TEMPLATE GLOBAL. Ver D5.
--
--   F5. As etapas do template global têm `organization_id IS NULL` em
--       `lead_workflow_stages` e `lead_stage_transitions`. Em
--       `lead_pipeline_settings` isso não acontece: ali `organization_id` é a
--       própria chave primária, logo NOT NULL — não há definições globais.
--
--   F6. `rpc_save_lead_workflow_stages` grava o funil INTEIRO de uma vez: apaga e
--       reinsere/actualiza várias linhas na mesma instrução ou no mesmo bloco.
--       Um gatilho FOR EACH ROW marcaria as mesmas leads N vezes por gravação.
--
--   F7. A Mudelar tem 6139 leads. Gravar o funil dela marca as 6139 de uma vez.
--       A 500 por ciclo de 5 minutos, isso demorava mais de uma hora a
--       reconciliar. Ver D6.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--   D1. Gatilho ao nível da INSTRUÇÃO (FOR EACH STATEMENT), não da linha. Por F6:
--       gravar um funil de 8 etapas com um gatilho por linha faria 8 UPDATE
--       massivos sobre as mesmas leads da mesma organização — 8× o trabalho para
--       o mesmo resultado. Ao nível da instrução, é UM UPDATE por instrução, e as
--       tabelas de transição (REFERENCING NEW TABLE / OLD TABLE) dão as
--       organizações afectadas sem ter de as recolher linha a linha.
--
--   D2. UM gatilho POR OPERAÇÃO, não um `AFTER INSERT OR UPDATE OR DELETE`. Não é
--       preferência de estilo: o PostgreSQL PROÍBE declarar um gatilho com
--       REFERENCING para mais do que uma operação. Daí os sufixos _ins, _upd,
--       _del, com NEW TABLE no de INSERT, OLD TABLE no de DELETE e as duas no de
--       UPDATE. A função é a mesma nos nove, e distingue o caso por TG_OP.
--
--   D3. `AND pipeline_dirty_at IS NULL` na marcação. NÃO se reescreve a marca de
--       quem já está na fila. O reconciliador processa ORDER BY pipeline_dirty_at
--       ASC (D7 de 20261204130000): reescrever now() numa lead marcada há duas
--       horas mandava-a para o fim da fila e, com gravações sucessivas do funil,
--       as mais antigas podiam nunca chegar a ser atendidas. Marca posta é marca
--       que se respeita.
--
--   D4. As linhas com `organization_id IS NULL` — o template global (F5) — são
--       IGNORADAS de propósito. Mexer numa etapa do template afecta, em teoria,
--       todas as organizações sem funil próprio; marcar por causa disso as leads
--       de TODAS as organizações da instalação seria desproporcionado (dezenas de
--       milhares de leads e de linhas de auditoria por causa de uma alteração a
--       uma etapa de catálogo). O template raramente muda, e quem lhe mexer sabe
--       o que está a fazer: corre o recálculo à mão pelo botão do editor, que
--       valida a organização. A alternativa — marcar tudo — é o género de efeito
--       secundário que ninguém espera de um ecrã de configuração.
--
--   D5. O apanhar-o-atraso da PARTE 5 cobre SÓ as organizações com funil próprio
--       (EXISTS em lead_workflow_stages com is_active). As de F4 ficam DE FORA, e
--       é deliberado: sem funil próprio, o motor só lhes pode atribuir etapas do
--       template global, e empurrá-las agora para lá gravava em `anew_leads` o
--       resultado de uma configuração que essas organizações nunca escolheram —
--       agravava um problema conhecido em vez de o resolver. Quando criarem o
--       funil delas, os gatilhos da PARTE 3 marcam-nas automaticamente, que é
--       precisamente o objectivo desta migração.
--
--   D6. O lote do reconciliador sobe de 500 para 2000. Por F7: com os gatilhos
--       novos, uma gravação do funil da Mudelar passa a marcar 6139 leads de uma
--       assentada, e a 500 por ciclo o utilizador esperava mais de uma hora para
--       ver o efeito da configuração que gravou. A 2000 fica em ~15 minutos. O
--       reconciliador corre no cron, como service_role, sem o statement_timeout
--       de 8s do role `authenticated`, e 2000 leads custam cerca de 2 segundos de
--       cálculo — com folga de sobra dentro de um ciclo de 5 minutos, mesmo
--       contando com o compute_lead_stage_v2 ser pago duas vezes por lead (ver o
--       AVISO no cabeçalho de 20261204130000).
--
--   D7. Guarda anti-recursão `pg_trigger_depth() > 1`. Hoje não é estritamente
--       necessária: o reconciliador escreve em `anew_leads`, não nestas três
--       tabelas, e nenhum gatilho de `anew_leads` escreve na configuração. Mas
--       custa uma comparação de inteiros e protege de cadeias futuras — por
--       exemplo, alguém pôr um dia um gatilho que ajuste `stage_positions` a
--       partir de uma alteração de lead. É seguro por acidente hoje e por desenho
--       a partir daqui.
--
--   D8. A função NÃO recalcula nada. Só marca. Toda a inteligência —
--       compute_lead_stage_v2, a decisão de sincronizar a etapa e a de avançar o
--       estado — continua onde estava, no reconciliador. Um gatilho de
--       configuração que se pusesse a chamar compute_lead_stage_v2 para 6139
--       leads dentro da transação do editor do funil rebentava o statement_timeout
--       do `authenticated` e a gravação do funil falhava. Marcar é barato (um
--       UPDATE de uma coluna, por índice de organização); calcular é caro e faz-se
--       fora do caminho crítico do utilizador.
--
--   D9. NENHUM gatilho é disparado pelo auto-teste. Verifica-se por catálogo
--       (pg_trigger, cron.job) que os gatilhos existem, são de instrução e estão
--       activos, e que a tarefa está agendada com 2000. Disparar um gatilho no
--       auto-teste significava escrever na configuração do funil de uma
--       organização real — uma migração não faz isso para se auto-verificar.
--
--  D10. A marcação da PARTE 5 é a ÚNICA escrita em dados que esta migração faz, e
--       escreve numa só coluna de bookkeeping (pipeline_dirty_at). Não muda
--       `status`, não muda `workflow_stage_id`, não cria notas. Quem faz a
--       mudança visível é o reconciliador, no próximo ciclo do cron.
-- ============================================================================


-- ============================================================
-- PARTE 1 — guardas
-- ============================================================
-- Esta migração é o PRODUTOR de uma fila cujo CONSUMIDOR foi criado em
-- 20261204130000. Sem o consumidor, os gatilhos novos só serviam para encher
-- `pipeline_dirty_at` e nunca a esvaziar — exactamente o estado que aquela
-- migração veio corrigir. Mais vale rebentar aqui.

DO $guarda$
DECLARE
  v_col_existe boolean;
  v_tabela     text;
BEGIN
  -- 1.1 O consumidor da fila.
  IF to_regprocedure('public.fn_reconcile_dirty_lead_pipelines(integer)') IS NULL THEN
    RAISE EXCEPTION
      'public.fn_reconcile_dirty_lead_pipelines(integer) não existe — é quem '
      'consome a fila que esta migração passa a encher. Aplicar primeiro a '
      'migração 20261204130000.';
  END IF;

  -- 1.2 A tabela das leads.
  IF to_regclass('public.anew_leads') IS NULL THEN
    RAISE EXCEPTION 'public.anew_leads não existe.';
  END IF;

  -- 1.3 A própria fila.
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'anew_leads'
       AND column_name  = 'pipeline_dirty_at'
  ) INTO v_col_existe;

  IF NOT v_col_existe THEN
    RAISE EXCEPTION
      'A coluna public.anew_leads.pipeline_dirty_at não existe — é a fila onde os '
      'gatilhos desta migração escrevem.';
  END IF;

  -- 1.4 As três tabelas de configuração, e a coluna que liga cada uma à
  --     organização. Sem `organization_id` a função não saberia QUE leads marcar,
  --     e marcar leads a mais é pior do que não marcar nenhuma.
  FOREACH v_tabela IN ARRAY ARRAY[
    'lead_workflow_stages',
    'lead_pipeline_settings',
    'lead_stage_transitions'
  ] LOOP
    IF to_regclass('public.' || v_tabela) IS NULL THEN
      RAISE EXCEPTION
        'public.% não existe — é uma das três tabelas de configuração do funil '
        'que esta migração passa a vigiar.', v_tabela;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = v_tabela
         AND column_name  = 'organization_id'
    ) THEN
      RAISE EXCEPTION
        'public.%.organization_id não existe — sem essa coluna o gatilho não '
        'consegue delimitar que leads reavaliar.', v_tabela;
    END IF;
  END LOOP;

  -- 1.5 pg_cron. A PARTE 4 reagenda a tarefa; sem a extensão, essa parte
  --     rebentava a meio da migração em vez de rebentar no início.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION
      'A extensão pg_cron não está instalada — sem ela a tarefa '
      '''reconcile-lead-pipelines'' não existe e as leads marcadas por estes '
      'gatilhos nunca seriam reconciliadas.';
  END IF;

  RAISE NOTICE 'GUARDA: fn_reconcile_dirty_lead_pipelines, '
               'anew_leads.pipeline_dirty_at, as três tabelas de configuração '
               '(todas com organization_id) e pg_cron presentes.';
END;
$guarda$;


-- ============================================================
-- PARTE 2 — a função de gatilho
-- ============================================================
-- Só MARCA. Não calcula etapas, não muda estados, não escreve notas (D8).

CREATE OR REPLACE FUNCTION public.fn_mark_org_leads_pipeline_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orgs     uuid[];
  v_globais  integer := 0;
  v_marcadas integer := 0;
BEGIN
  -- Guarda anti-recursão (D7). Barata, e protege de cadeias que ainda não
  -- existem mas que um dia alguém acrescenta sem se lembrar deste gatilho.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- QUE organizações foram afectadas. As tabelas de transição só existem para as
  -- operações declaradas em cada gatilho (D2), por isso a ramificação por TG_OP
  -- não é decorativa: referenciar `linhas_novas` num gatilho de DELETE dava erro
  -- de relação inexistente.
  --
  -- As linhas com organization_id IS NULL são o template global e são ignoradas
  -- de propósito (D4). Contam-se só para ficar rasto no log.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.organization_id)
             FILTER (WHERE n.organization_id IS NOT NULL),
           COUNT(*) FILTER (WHERE n.organization_id IS NULL)::integer
      INTO v_orgs, v_globais
      FROM linhas_novas n;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.organization_id)
             FILTER (WHERE o.organization_id IS NOT NULL),
           COUNT(*) FILTER (WHERE o.organization_id IS NULL)::integer
      INTO v_orgs, v_globais
      FROM linhas_antigas o;

  ELSE  -- UPDATE: as duas tabelas. A linha pode ter MUDADO de organização, e
        -- nesse caso tanto a de origem como a de destino têm de ser reavaliadas.
    SELECT array_agg(DISTINCT u.org) FILTER (WHERE u.org IS NOT NULL),
           COUNT(*) FILTER (WHERE u.org IS NULL)::integer
      INTO v_orgs, v_globais
      FROM (
        SELECT n.organization_id AS org FROM linhas_novas   n
        UNION
        SELECT o.organization_id       FROM linhas_antigas o
      ) u;
  END IF;

  IF v_globais > 0 THEN
    RAISE NOTICE
      '[%] %: % linha(s) do template global (organization_id IS NULL) '
      'ignorada(s) — ver D4 de 20261204150000.',
      TG_NAME, TG_TABLE_NAME, v_globais;
  END IF;

  -- Instrução que não tocou em nenhuma organização concreta: nada a fazer. Um
  -- gatilho de instrução dispara mesmo quando o UPDATE não apanhou linha nenhuma.
  IF v_orgs IS NULL OR cardinality(v_orgs) = 0 THEN
    RETURN NULL;
  END IF;

  -- A MARCA. Uma só coluna, por índice de organização (D8, D10).
  -- `pipeline_dirty_at IS NULL` preserva a antiguidade de quem já está na fila
  -- (D3) e, de caminho, evita reescrever linhas à toa quando o funil é gravado
  -- várias vezes seguidas.
  UPDATE public.anew_leads
     SET pipeline_dirty_at = now()
   WHERE organization_id = ANY(v_orgs)
     AND deleted_at IS NULL
     AND pipeline_dirty_at IS NULL;

  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  RAISE NOTICE
    '[%] % em %: % organização(ões) afectada(s), % lead(s) marcada(s) para '
    'reavaliação.',
    TG_NAME, TG_OP, TG_TABLE_NAME, cardinality(v_orgs), v_marcadas;

  -- AFTER ... FOR EACH STATEMENT: o valor devolvido é ignorado.
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.fn_mark_org_leads_pipeline_dirty() IS
  'Gatilho de INSTRUÇÃO nas três tabelas de configuração do funil de leads '
  '(lead_workflow_stages, lead_pipeline_settings, lead_stage_transitions). '
  'Até 20261204150000, mudar a configuração do funil não reavaliava NENHUMA '
  'lead: o motor só voltava a correr quando mudava um sinal de negócio '
  '(fn_mark_lead_pipeline_dirty) ou quando alguém carregava no botão de '
  'recálculo à mão. '
  'Esta função marca `pipeline_dirty_at = now()` nas leads activas das '
  'organizações cuja configuração mudou, e mais nada — não chama '
  'compute_lead_stage_v2, não muda status nem workflow_stage_id, não cria notas. '
  'Quem faz o trabalho é fn_reconcile_dirty_lead_pipelines, no ciclo seguinte do '
  'cron; calcular aqui, dentro da transação do editor do funil, rebentaria o '
  'statement_timeout do role authenticated numa organização com milhares de '
  'leads. '
  'É FOR EACH STATEMENT porque rpc_save_lead_workflow_stages grava o funil '
  'inteiro de uma vez e um gatilho por linha marcaria as mesmas leads N vezes. '
  'NÃO reescreve pipeline_dirty_at em leads já na fila, para não lhes destruir a '
  'antiguidade (o reconciliador processa ORDER BY pipeline_dirty_at ASC). '
  'IGNORA linhas com organization_id IS NULL (template global): marcar as leads '
  'de todas as organizações por causa de uma alteração ao catálogo seria '
  'desproporcionado — quem lhe mexer usa o recálculo manual.';


-- ============================================================
-- PARTE 3 — os nove gatilhos
-- ============================================================
-- Três tabelas × três operações. Um gatilho por operação porque o PostgreSQL não
-- aceita REFERENCING num gatilho declarado para mais do que uma operação (D2).
-- DROP IF EXISTS antes de cada CREATE para a migração poder ser reaplicada.

-- ── 3.1 lead_workflow_stages — as etapas e as suas regras.
DROP TRIGGER IF EXISTS trg_lead_workflow_stages_mark_dirty_ins ON public.lead_workflow_stages;
CREATE TRIGGER trg_lead_workflow_stages_mark_dirty_ins
  AFTER INSERT ON public.lead_workflow_stages
  REFERENCING NEW TABLE AS linhas_novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_lead_workflow_stages_mark_dirty_upd ON public.lead_workflow_stages;
CREATE TRIGGER trg_lead_workflow_stages_mark_dirty_upd
  AFTER UPDATE ON public.lead_workflow_stages
  REFERENCING NEW TABLE AS linhas_novas OLD TABLE AS linhas_antigas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_lead_workflow_stages_mark_dirty_del ON public.lead_workflow_stages;
CREATE TRIGGER trg_lead_workflow_stages_mark_dirty_del
  AFTER DELETE ON public.lead_workflow_stages
  REFERENCING OLD TABLE AS linhas_antigas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

-- ── 3.2 lead_pipeline_settings — posições das etapas e o interruptor
--        `enforce_stage_transitions`, que liga o fluxo sequencial. Ligar ou
--        desligar este interruptor muda a etapa calculada de todas as leads da
--        organização, e até agora não reavaliava nenhuma.
--        Aqui organization_id é a própria chave primária, logo NOT NULL: nunca há
--        linhas globais nesta tabela (F5).
DROP TRIGGER IF EXISTS trg_lead_pipeline_settings_mark_dirty_ins ON public.lead_pipeline_settings;
CREATE TRIGGER trg_lead_pipeline_settings_mark_dirty_ins
  AFTER INSERT ON public.lead_pipeline_settings
  REFERENCING NEW TABLE AS linhas_novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_lead_pipeline_settings_mark_dirty_upd ON public.lead_pipeline_settings;
CREATE TRIGGER trg_lead_pipeline_settings_mark_dirty_upd
  AFTER UPDATE ON public.lead_pipeline_settings
  REFERENCING NEW TABLE AS linhas_novas OLD TABLE AS linhas_antigas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_lead_pipeline_settings_mark_dirty_del ON public.lead_pipeline_settings;
CREATE TRIGGER trg_lead_pipeline_settings_mark_dirty_del
  AFTER DELETE ON public.lead_pipeline_settings
  REFERENCING OLD TABLE AS linhas_antigas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

-- ── 3.3 lead_stage_transitions — que saltos são permitidos entre etapas.
--        Coluna de ligação confirmada no baseline (20260615130000:10383):
--        `organization_id uuid` (anulável, logo com template global — D4).
DROP TRIGGER IF EXISTS trg_lead_stage_transitions_mark_dirty_ins ON public.lead_stage_transitions;
CREATE TRIGGER trg_lead_stage_transitions_mark_dirty_ins
  AFTER INSERT ON public.lead_stage_transitions
  REFERENCING NEW TABLE AS linhas_novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_lead_stage_transitions_mark_dirty_upd ON public.lead_stage_transitions;
CREATE TRIGGER trg_lead_stage_transitions_mark_dirty_upd
  AFTER UPDATE ON public.lead_stage_transitions
  REFERENCING NEW TABLE AS linhas_novas OLD TABLE AS linhas_antigas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_lead_stage_transitions_mark_dirty_del ON public.lead_stage_transitions;
CREATE TRIGGER trg_lead_stage_transitions_mark_dirty_del
  AFTER DELETE ON public.lead_stage_transitions
  REFERENCING OLD TABLE AS linhas_antigas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_mark_org_leads_pipeline_dirty();


-- ============================================================
-- PARTE 4 — o lote do reconciliador sobe para 2000 (D6)
-- ============================================================
-- A partir da PARTE 3, gravar o funil de uma organização grande marca todas as
-- leads dela de uma vez (Mudelar: 6139). A 500 por ciclo, o utilizador esperava
-- mais de uma hora para ver o efeito do que gravou; a 2000, ~15 minutos.
--
-- Primeiro o unschedule, dentro de um bloco DO que não rebenta se a tarefa não
-- existir; depois o reagendamento. Se o reagendamento falhar queremos saber à
-- aplicação — sem tarefa, os gatilhos novos só serviam para encher a fila.

DO $desagendar$
BEGIN
  PERFORM cron.unschedule('reconcile-lead-pipelines')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-lead-pipelines');
END;
$desagendar$;

DO $agendar$
BEGIN
  PERFORM cron.schedule(
    'reconcile-lead-pipelines',
    '*/5 * * * *',
    $cron$SELECT public.fn_reconcile_dirty_lead_pipelines(2000)$cron$
  );

  RAISE NOTICE 'Tarefa ''reconcile-lead-pipelines'' reagendada: */5 * * * *, '
               'lote 500 -> 2000.';
END;
$agendar$;


-- ============================================================
-- PARTE 5 — recuperar o atraso acumulado, UMA vez (D5, D10)
-- ============================================================
-- Os gatilhos da PARTE 3 só apanham alterações FUTURAS. As leads que já estão
-- dessincronizadas por alterações de configuração feitas antes de hoje continuam
-- erradas no ecrã até alguém lhes mexer. Marcam-se agora, uma vez.
--
-- SÓ as organizações com funil próprio (F3). As de F4 ficam de fora de propósito:
-- sem funil próprio, o motor só lhes pode atribuir etapas do template global, e
-- atirá-las para lá agravava um problema conhecido em vez de o resolver. Quando
-- criarem o funil delas, os gatilhos da PARTE 3 marcam-nas automaticamente — que
-- é precisamente o objectivo desta migração.
--
-- Esta consulta chama compute_lead_stage_v2 uma vez por lead candidata (~0,8ms
-- cada) e é cara. Corre UMA vez, na aplicação da migração, como postgres e sem o
-- statement_timeout de 8s do role `authenticated`.

DO $recuperar$
DECLARE
  v_marcadas integer := 0;
  v_fila     integer := 0;
BEGIN
  UPDATE public.anew_leads l
     SET pipeline_dirty_at = now()
   WHERE l.deleted_at IS NULL
     AND l.pipeline_dirty_at IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.lead_workflow_stages s
        WHERE s.organization_id = l.organization_id
          AND s.is_active
     )
     AND l.workflow_stage_id IS DISTINCT FROM public.compute_lead_stage_v2(l.id);

  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  SELECT COUNT(*)::integer
    INTO v_fila
    FROM public.anew_leads
   WHERE pipeline_dirty_at IS NOT NULL
     AND deleted_at IS NULL;

  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'ATRASO ACUMULADO:';
  RAISE NOTICE '  leads dessincronizadas agora marcadas : %', v_marcadas;
  RAISE NOTICE '  total na fila pipeline_dirty_at       : %', v_fila;
  RAISE NOTICE '  ciclos de cron até esvaziar (lote 2000): %',
               GREATEST(1, CEIL(v_fila::numeric / 2000)::integer);
  RAISE NOTICE '  organizações SEM funil próprio ficaram DE FORA, de propósito '
               '(D5).';
  RAISE NOTICE '-----------------------------------------------------------';
END;
$recuperar$;


-- ============================================================
-- PARTE 6 — auto-teste (D9)
-- ============================================================
-- Por catálogo. NÃO dispara nenhum gatilho: fazê-lo obrigava a escrever na
-- configuração do funil de uma organização real, e uma migração não mexe em
-- dados de negócio para se auto-verificar.
--
-- Nota sobre tgtype (pg_trigger): bit 0 (valor 1) ligado = FOR EACH ROW.
-- Portanto (tgtype & 1) = 0 significa FOR EACH STATEMENT, que é o ponto central
-- de D1 e o erro mais fácil de cometer ao recriar estes gatilhos à mão.
-- bit 1 (2) = BEFORE; bit 2 (4) = INSERT; bit 3 (8) = DELETE; bit 4 (16) = UPDATE.

DO $auto_teste$
DECLARE
  v_esperado CONSTANT integer := 9;
  v_n        integer;
  v_por_linha text;
  v_inactivos text;
  v_job      record;
  v_rec      record;
BEGIN
  -- ── 6.1 A função de gatilho existe, uma só, SECURITY DEFINER e com
  --    search_path fixo. Escreve em anew_leads de qualquer organização; um
  --    search_path solto seria um vector de escalada.
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_mark_org_leads_pipeline_dirty';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.1 falhou: esperava exactamente 1 função '
      'public.fn_mark_org_leads_pipeline_dirty, encontrei %.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_mark_org_leads_pipeline_dirty'
       AND p.prosecdef
       AND EXISTS (
         SELECT 1
           FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
          WHERE replace(cfg, '"', '') = 'search_path=public'
       )
  ) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.1 falhou: a função não ficou SECURITY DEFINER com '
      'SET search_path TO public.';
  END IF;

  -- ── 6.2 Os nove gatilhos existem, nas tabelas certas.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public'
     AND p.proname = 'fn_mark_org_leads_pipeline_dirty'
     AND c.relname IN ('lead_workflow_stages',
                       'lead_pipeline_settings',
                       'lead_stage_transitions');

  IF v_n <> v_esperado THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.2 falhou: esperava % gatilhos (3 tabelas × '
      'INSERT/UPDATE/DELETE), encontrei %.', v_esperado, v_n;
  END IF;

  -- ── 6.3 TODOS são FOR EACH STATEMENT. É o ponto de D1: um gatilho que
  --    escorregue para FOR EACH ROW multiplicaria por N o trabalho de cada
  --    gravação do funil, sem mudar o resultado.
  SELECT string_agg(c.relname || '.' || t.tgname, ', ' ORDER BY t.tgname)
    INTO v_por_linha
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname = 'fn_mark_org_leads_pipeline_dirty'
     AND (t.tgtype & 1) <> 0;

  IF v_por_linha IS NOT NULL THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.3 falhou: estes gatilhos ficaram FOR EACH ROW e deviam ser '
      'FOR EACH STATEMENT (D1): %', v_por_linha;
  END IF;

  -- ── 6.4 Todos activos. Um gatilho desactivado (tgenabled = 'D') existe no
  --    catálogo, passa nas contagens, e não faz nada — é a falha mais silenciosa
  --    possível aqui.
  -- tgenabled é do tipo "char" (um só carácter, não text): sem o cast explícito
  -- o `||` fica ambíguo e o Postgres recusa com "operator is not unique".
  SELECT string_agg(c.relname || '.' || t.tgname || ' (tgenabled=' || t.tgenabled::text || ')',
                    ', ' ORDER BY t.tgname)
    INTO v_inactivos
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname = 'fn_mark_org_leads_pipeline_dirty'
     AND t.tgenabled = 'D';

  IF v_inactivos IS NOT NULL THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.4 falhou: gatilhos DESACTIVADOS — existem mas nunca correm: %',
      v_inactivos;
  END IF;

  -- ── 6.5 Cada tabela tem exactamente 3 (um por operação). Apanha o caso de
  --    uma tabela ter ficado a zero e outra com seis.
  FOR v_rec IN
    SELECT c.relname AS tabela, count(*)::integer AS n
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.proname = 'fn_mark_org_leads_pipeline_dirty'
     GROUP BY c.relname
  LOOP
    IF v_rec.n <> 3 THEN
      RAISE EXCEPTION
        'AUTO-TESTE 6.5 falhou: public.% tem % gatilho(s) de marcação, esperava 3 '
        '(INSERT, UPDATE, DELETE).', v_rec.tabela, v_rec.n;
    END IF;
  END LOOP;

  -- ── 6.6 A tarefa do reconciliador ficou agendada com o lote novo (D6).
  SELECT j.jobname, j.schedule, j.command, j.active
    INTO v_job
    FROM cron.job j
   WHERE j.jobname = 'reconcile-lead-pipelines';

  IF v_job IS NULL THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.6 falhou: a tarefa ''reconcile-lead-pipelines'' não existe em '
      'cron.job. Os gatilhos desta migração encheriam a fila e ninguém a '
      'esvaziava.';
  END IF;

  IF NOT COALESCE(v_job.active, false) THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.6 falhou: a tarefa existe mas está INACTIVA — nunca correria.';
  END IF;

  IF v_job.schedule IS DISTINCT FROM '*/5 * * * *' THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.6 falhou: horário inesperado. Esperava "*/5 * * * *", '
      'obtive "%".', v_job.schedule;
  END IF;

  IF position('fn_reconcile_dirty_lead_pipelines' in v_job.command) = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.6 falhou: a tarefa não chama o reconciliador. command = %',
      v_job.command;
  END IF;

  IF position('2000' in v_job.command) = 0 THEN
    RAISE EXCEPTION
      'AUTO-TESTE 6.6 falhou: a tarefa não ficou com o lote de 2000 (D6). '
      'command = %', v_job.command;
  END IF;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'AUTO-TESTE: 6 grupos de verificações OK.';
  RAISE NOTICE '  função   : public.fn_mark_org_leads_pipeline_dirty() '
               '(SECURITY DEFINER, search_path=public)';
  RAISE NOTICE '  gatilhos : % activos, todos FOR EACH STATEMENT, 3 por tabela '
               '(lead_workflow_stages, lead_pipeline_settings, '
               'lead_stage_transitions)', v_esperado;
  RAISE NOTICE '  tarefa   : % | % | activa=%',
               v_job.jobname, v_job.schedule, v_job.active;
  RAISE NOTICE '  comando  : %', v_job.command;
  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'NENHUM GATILHO FOI DISPARADO PELO AUTO-TESTE (D9).';
  RAISE NOTICE 'A ÚNICA escrita em dados desta migração foi a PARTE 5, e só na '
               'coluna pipeline_dirty_at: status e workflow_stage_id não foram '
               'tocados por ninguém aqui.';
  RAISE NOTICE 'fn_reconcile_dirty_lead_pipelines, fn_mark_lead_pipeline_dirty, '
               'compute_lead_stage_v2 e recompute_leads_v2_buckets NÃO foram '
               'alteradas.';
  RAISE NOTICE '===========================================================';
END;
$auto_teste$;


-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- ATENÇÃO: reverter devolve o sistema ao estado em que mudar a configuração do
-- funil não reavalia nenhuma lead. O utilizador volta a gravar o funil e a ver no
-- kanban o resultado das regras antigas, sem nada que o avise.
--
-- Pela ordem: primeiro os gatilhos (senão ficavam a apontar para uma função
-- inexistente e QUALQUER gravação do funil passava a falhar), depois a função,
-- por fim o lote do cron de volta a 500.
--
--   DROP TRIGGER IF EXISTS trg_lead_workflow_stages_mark_dirty_ins   ON public.lead_workflow_stages;
--   DROP TRIGGER IF EXISTS trg_lead_workflow_stages_mark_dirty_upd   ON public.lead_workflow_stages;
--   DROP TRIGGER IF EXISTS trg_lead_workflow_stages_mark_dirty_del   ON public.lead_workflow_stages;
--   DROP TRIGGER IF EXISTS trg_lead_pipeline_settings_mark_dirty_ins ON public.lead_pipeline_settings;
--   DROP TRIGGER IF EXISTS trg_lead_pipeline_settings_mark_dirty_upd ON public.lead_pipeline_settings;
--   DROP TRIGGER IF EXISTS trg_lead_pipeline_settings_mark_dirty_del ON public.lead_pipeline_settings;
--   DROP TRIGGER IF EXISTS trg_lead_stage_transitions_mark_dirty_ins ON public.lead_stage_transitions;
--   DROP TRIGGER IF EXISTS trg_lead_stage_transitions_mark_dirty_upd ON public.lead_stage_transitions;
--   DROP TRIGGER IF EXISTS trg_lead_stage_transitions_mark_dirty_del ON public.lead_stage_transitions;
--
--   DROP FUNCTION IF EXISTS public.fn_mark_org_leads_pipeline_dirty();
--
--   SELECT cron.unschedule('reconcile-lead-pipelines');
--   SELECT cron.schedule(
--     'reconcile-lead-pipelines',
--     '*/5 * * * *',
--     $$SELECT public.fn_reconcile_dirty_lead_pipelines(500)$$
--   );
--
-- A reversão NÃO desfaz a marcação da PARTE 5: essas leads ficam na fila e serão
-- reconciliadas na mesma. Desfazê-la seria apagar marcas legítimas e deixar as
-- leads erradas no ecrã, que é o contrário do que se quer em qualquer cenário.
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. Os nove gatilhos, e que são de instrução:
--      SELECT c.relname, t.tgname,
--             CASE WHEN (t.tgtype & 1) = 0 THEN 'STATEMENT' ELSE 'ROW' END AS nivel,
--             t.tgenabled
--        FROM pg_trigger t
--        JOIN pg_class c ON c.oid = t.tgrelid
--        JOIN pg_proc  p ON p.oid = t.tgfoid
--       WHERE NOT t.tgisinternal
--         AND p.proname = 'fn_mark_org_leads_pipeline_dirty'
--       ORDER BY c.relname, t.tgname;
--
-- 2. O lote do cron:
--      SELECT jobname, schedule, command, active
--        FROM cron.job WHERE jobname = 'reconcile-lead-pipelines';
--
-- 3. A fila tem de descer a cada 5 minutos:
--      SELECT count(*) AS marcadas, min(pipeline_dirty_at) AS mais_antiga
--        FROM public.anew_leads
--       WHERE pipeline_dirty_at IS NOT NULL AND deleted_at IS NULL;
--
-- 4. O TESTE QUE INTERESSA, numa organização de ensaio: gravar o funil pelo
--    editor e confirmar que as leads dessa organização ficaram marcadas na mesma
--    transação —
--      SELECT count(*) FROM public.anew_leads
--       WHERE organization_id = '<uuid da organização>'
--         AND deleted_at IS NULL
--         AND pipeline_dirty_at IS NOT NULL;
--    Antes de 20261204150000 este número ficava a zero depois de gravar o funil.
--
-- 5. Confirmar que uma alteração ao TEMPLATE GLOBAL (organization_id IS NULL) NÃO
--    marca leads (D4): repetir a consulta 3 antes e depois, o total não pode
--    saltar, e o log tem de registar o NOTICE de "linha(s) do template global
--    ignorada(s)".
--
-- 6. Saúde da tarefa, se algo parecer parado:
--      SELECT start_time, status, return_message
--        FROM cron.job_run_details
--       WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reconcile-lead-pipelines')
--       ORDER BY start_time DESC LIMIT 10;
