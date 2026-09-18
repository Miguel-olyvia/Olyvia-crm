-- ============================================================================
-- Funil de Leads — motor SEQUENCIAL de estágios (adopção gradual por flag)
--
-- Depende de 20261203110000_lead_pipeline_settings_and_rule_hardening.sql
-- (tabela public.lead_pipeline_settings + endurecimento de public.stage_reached).
--
-- ---------------------------------------------------------------------------
-- O DEFEITO DE FUNDO (medido ao vivo, ver "Simulação" no fim do ficheiro)
-- ---------------------------------------------------------------------------
-- public.compute_lead_stage_v2 percorre os estágios activos por
-- `ORDER BY stage_order DESC` e devolve o PRIMEIRO cuja regra bate. Ou seja:
-- devolve o estágio de stage_order MAIS ALTO que a lead satisfaz. Duas
-- consequências:
--
--   1. "Lost / Rejected" é, nas duas organizações com funil desenhado, o
--      estágio de stage_order mais alto (7 na Mudelar, 13 na BMGest). Assim que
--      a regra dele bate, ganha a QUALQUER estágio de progresso — perdido passa
--      a ser "o fim da ordem" em vez de uma saída.
--   2. A lead SALTA etapas: vai directa ao estágio mais avançado que satisfaz,
--      pelo que as `lead_stage_actions` das etapas intermédias nunca correm. O
--      motor só expõe o DESTINO, nunca o caminho.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRAÇÃO FAZ
-- ---------------------------------------------------------------------------
--   (A) lead_pipeline_settings.sequential_flow — flag nova, default false.
--   (B) public.lead_qualification_overlay_v2 — avalia lead_qualification_rules
--       (hoje NENHUMA função da BD as lê; ver nota 3) e sobrepõe MQL/SQL aos
--       sinais. Só é usada pelo motor sequencial.
--   (C) public.compute_lead_stage_path_v2 — motor novo. Devolve o CAMINHO
--       (uuid[]) do estágio actual até onde a lead pode chegar, um passo de
--       cada vez ao longo de lead_stage_transitions.
--   (D) public.compute_lead_stage_v2 — passa a devolver o ÚLTIMO elemento do
--       caminho QUANDO a flag está ligada. Com a flag desligada o corpo é
--       byte-a-byte o da versão viva. Assinatura, tipo de retorno,
--       volatilidade, SECURITY DEFINER, search_path e ACL preservados.
--
-- NENHUMA organização é ligada aqui. `sequential_flow` fica false em todas e
-- lead_pipeline_settings está vazia: COALESCE(...,false) → ramo legado.
--
-- NÃO há um único UPDATE a dados. Em particular não se toca em
-- lead_workflow_stages.reached_when — a limpeza dos elementos string legados é
-- fase separada, ainda não aprovada.
--
-- ---------------------------------------------------------------------------
-- DECISÃO: a flag vai nesta migração, não em 20261203110000
-- ---------------------------------------------------------------------------
-- 20261203110000 ainda não foi aplicada NESTE ambiente, mas as migrações são
-- imutáveis depois de escritas: editá-la faria divergir o histórico remoto
-- (`supabase_migrations.schema_migrations`) de qualquer ambiente onde já tenha
-- corrido, e o histórico deste projecto já dessincroniza com frequência.
-- `ADD COLUMN IF NOT EXISTS` é idempotente e insensível à ordem, por isso esta
-- migração aplica-se com ou sem a coluna já presente.


-- ============================================================
-- (A) lead_pipeline_settings.sequential_flow
-- ============================================================

ALTER TABLE public.lead_pipeline_settings
  ADD COLUMN IF NOT EXISTS sequential_flow boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lead_pipeline_settings.sequential_flow IS
  'Quando true, compute_lead_stage_v2 usa o motor sequencial (compute_lead_stage_path_v2): a lead avança UM estágio de cada vez ao longo de lead_stage_transitions e os estágios de saída (is_conversion/is_rejection) deixam de ganhar por stage_order. Quando false (default) mantém-se o motor histórico "maior stage_order que bate". Ligar por organização, nunca em bloco.';


-- ============================================================
-- (B) public.lead_qualification_overlay_v2
-- ============================================================
-- Requisito 4 do pedido: "a qualificação (MQL/SQL, via lead_qualification_rules
-- e a condição qualification_is) é reavaliada a cada passo".
--
-- LACUNA ENCONTRADA AO VIVO: public.lead_qualification_rules NÃO é lida por
-- nenhuma função da base de dados (verificado com
--   SELECT oid::regprocedure FROM pg_proc WHERE prosrc LIKE '%lead_qualification_rules%'
-- → 0 linhas). Só o frontend (useLeadPipelineRules.ts / QualificationRulesTab)
-- a lê e escreve. evaluate_lead_signals_v2 deriva has_qualification_mql/sql
-- exclusivamente da COLUNA anew_leads.qualification_type, que é preenchida à
-- mão via rpc_update_lead. Logo, hoje, a condição `qualification_is` nunca
-- reflecte as regras desenhadas pelo utilizador.
--
-- Esta função fecha a lacuna, mas SÓ para o motor sequencial (é chamada apenas
-- por compute_lead_stage_path_v2). Semântica deliberadamente ADITIVA:
--   resultado = qualificação manual OR regra da organização
-- Nunca REMOVE uma qualificação já gravada — despromover uma lead qualificada à
-- mão seria uma regressão visível para o comercial.
--
-- Reutiliza public.stage_reached como avaliador de {"all":[...],"any":[...]},
-- com p_matching = NULL: nesse caso, se a regra ficar sem condições utilizáveis,
-- stage_reached devolve false (`p_matching IS NOT NULL AND ...`), ou seja regra
-- vazia/NULL/mal formada → sem sobreposição. É o comportamento seguro.

CREATE OR REPLACE FUNCTION public.lead_qualification_overlay_v2(p_org uuid, p_signals jsonb, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mql_when jsonb;
  v_sql_when jsonb;
  v_mql boolean;
  v_sql boolean;
BEGIN
  IF p_org IS NULL OR p_signals IS NULL THEN
    RETURN p_signals;
  END IF;

  SELECT r.mql_when, r.sql_when
    INTO v_mql_when, v_sql_when
    FROM public.lead_qualification_rules r
   WHERE r.organization_id = p_org;

  IF NOT FOUND THEN
    RETURN p_signals;
  END IF;

  v_mql := COALESCE((p_signals->>'has_qualification_mql')::boolean, false);
  v_sql := COALESCE((p_signals->>'has_qualification_sql')::boolean, false);

  IF NOT v_mql THEN
    v_mql := public.stage_reached(p_signals, v_mql_when, p_status, NULL);
  END IF;

  IF NOT v_sql THEN
    v_sql := public.stage_reached(p_signals, v_sql_when, p_status, NULL);
  END IF;

  RETURN p_signals || jsonb_build_object(
    'has_qualification_mql', v_mql,
    'has_qualification_sql', v_sql
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lead_qualification_overlay_v2(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_qualification_overlay_v2(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_qualification_overlay_v2(uuid, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.lead_qualification_overlay_v2(uuid, jsonb, text) IS
  'Sobrepõe a qualificação MQL/SQL calculada a partir de lead_qualification_rules (mql_when/sql_when) aos sinais devolvidos por evaluate_lead_signals_v2. Aditiva: só pode ligar has_qualification_mql/sql, nunca desligar uma qualificação manual gravada em anew_leads.qualification_type. Sem linha de regras para a organização devolve os sinais intactos. Usada apenas por compute_lead_stage_path_v2.';


-- ============================================================
-- (C) public.compute_lead_stage_path_v2
-- ============================================================
-- Devolve o CAMINHO percorrido, não só o destino: uuid[] ordenado em que
--   path[1]   = estágio de partida (a lead JÁ lá está — não dispara acções)
--   path[2..] = estágios ENTRADOS por este cálculo (é aqui que as
--               lead_stage_actions têm de correr, pela ordem do array)
--   path[último] = destino, o que compute_lead_stage_v2 devolve.
--
-- ALGORITMO
-- ---------
-- 0. Conjunto efectivo de estágios: os activos da organização; se a organização
--    não tiver nenhum, os do template (organization_id IS NULL). Exactamente a
--    mesma regra da versão viva de compute_lead_stage_v2 (v_has_org_stages).
--
-- 1. ESTÁGIO DE PARTIDA, por esta ordem:
--    a) anew_leads.workflow_stage_id, se pertencer ao conjunto efectivo.
--       EXCEPÇÃO (des-encalhe): se esse estágio for uma SAÍDA (is_conversion ou
--       is_rejection) e a regra PRÓPRIA dele já não bater, é descartado. Sem
--       isto o motor nunca conseguiria reparar as leads gravadas à força em
--       "Lost / Rejected" pelo motor antigo — na Mudelar são 8 leads com
--       status 'visit_scheduled' presas em perdido. Estágios de PROGRESSO nunca
--       são revalidados: o motor não despromove.
--    b) o estágio de menor stage_order cujo matching_statuses contém o status
--       da lead, ou cujo default_status é igual ao status.
--    c) se nenhum estágio cobre o status mas havia um workflow_stage_id válido
--       gravado, MANTÉM-SE esse. Salvaguarda contra despromoção: na Mudelar,
--       228 leads com status 'lost' não têm estágio correspondente e sem esta
--       alínea cairiam em "New" (alínea d), o que seria pior do que o estado
--       actual.
--    d) o estágio de menor stage_order do conjunto efectivo.
--
-- 2. SAÍDAS PRIMEIRO, a cada iteração. Um estágio com is_conversion ou
--    is_rejection é avaliado a partir do estágio corrente, pela sua regra
--    própria, e NÃO está limitado às arestas do diagrama — o requisito é
--    "alcançável a partir de QUALQUER estágio". Se bater, é acrescentado ao
--    caminho e o ciclo termina (uma saída é terminal).
--    Porquê antes da progressão e não depois: uma lead que já está perdida ou
--    ganha não deve disparar as acções ("enviar email da Reunião 1", etc.) das
--    fases intermédias. Medido: a ordem inversa (progressão primeiro) muda o
--    destino de ZERO leads nas duas organizações e apenas acrescenta 5 passos
--    intermédios na Mudelar — logo a escolha é conservadora, não arriscada.
--
-- 3. UM PASSO DE PROGRESSÃO, só um por iteração:
--    - Se a organização TEM arestas em lead_stage_transitions: candidatos são
--      os to_stage_id das arestas activas com from_stage_id = corrente.
--    - Se NÃO tem nenhuma aresta: caminho implícito = o estágio de progresso
--      ACTIVO SEGUINTE por (stage_order, id). Apenas esse — não se salta.
--    Em ambos os casos o candidato só é aceite se public.stage_reached() for
--    verdadeiro para ELE. Estágios de saída nunca entram por esta via.
--
-- 4. DETERMINISMO (obrigatório: o grafo é editável e pode ter várias arestas a
--    sair do mesmo nó). Entre candidatos que batem todos, ganha o de MENOR
--    stage_order; empate em stage_order desempata pelo id (uuid) mais baixo.
--    Critério escolhido por ser total, estável entre execuções e independente
--    da ordem física das linhas, e por privilegiar o caminho mais curto/menos
--    avançado — errar para o lado do "ainda não avançou" é sempre mais barato
--    do que errar para o lado do "já avançou".
--
-- 5. GUARDA ANTI-CICLO, dupla e obrigatória:
--    - nenhum estágio entra duas vezes no caminho (`NOT (s.id = ANY(v_path))`);
--    - limite rígido de iterações = nº de estágios efectivos.
--    O grafo é desenhado pelo utilizador e PODE ter ciclos (p.ex. a BMGest tem
--    hoje qualified→callback_scheduled→visit_scheduled→reunião_2, arestas que
--    andam para trás em stage_order). Testado com A→B→C→A e com o auto-laço
--    A→A: param em ['A','B','C'] e ['A'] respectivamente.
--
-- 6. QUALIFICAÇÃO reavaliada a cada passo, antes de avaliar saídas e
--    progressão (requisito 4). NOTA HONESTA: dentro de uma única chamada os
--    sinais derivam de dados da lead que não mudam, por isso a sobreposição é
--    hoje invariante entre passos. A chamada está dentro do ciclo por fidelidade
--    ao requisito e para ficar correcta no dia em que houver sinais dependentes
--    do estágio.
--
-- DIFERENÇA DE GARANTIAS face ao motor antigo: com um conjunto efectivo de
-- estágios não vazio, este motor NUNCA devolve NULL (a alínea 1d garante sempre
-- um estágio). As leads "unresolved" avisadas por recompute_leads_v2_buckets
-- desaparecem: 1787 → 0 na Mudelar, 15 → 0 na BMGest.

CREATE OR REPLACE FUNCTION public.compute_lead_stage_path_v2(p_lead_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_status text;
  v_stored_stage_id uuid;
  v_signals jsonb;
  v_has_org_stages boolean;
  v_has_edges boolean;
  v_start uuid;
  v_current uuid;
  v_current_order integer;
  v_current_is_exit boolean;
  v_path uuid[];
  v_limit integer;
  v_i integer;
  v_next uuid;
  v_exit uuid;
BEGIN
  SELECT organization_id, status, workflow_stage_id
    INTO v_org, v_status, v_stored_stage_id
    FROM public.anew_leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_signals := public.evaluate_lead_signals_v2(p_lead_id);

  -- Mesma regra de conjunto efectivo da versão viva de compute_lead_stage_v2.
  SELECT EXISTS (
    SELECT 1 FROM public.lead_workflow_stages
    WHERE organization_id = v_org AND is_active = true
  ) INTO v_has_org_stages;

  SELECT COUNT(*) INTO v_limit
    FROM public.lead_workflow_stages s
   WHERE s.is_active = true
     AND ((v_has_org_stages AND s.organization_id = v_org)
       OR (NOT v_has_org_stages AND s.organization_id IS NULL));

  IF COALESCE(v_limit, 0) = 0 THEN
    -- Organização sem estágios activos e sem template: nada a calcular.
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lead_stage_transitions t
    WHERE t.organization_id = v_org
      AND COALESCE(t.is_active, true)
  ) INTO v_has_edges;

  -- ---- passo 1: estágio de partida -------------------------------------
  -- (a) o gravado, se pertencer ao conjunto efectivo; uma SAÍDA só se mantém
  --     enquanto a regra própria dela continuar a bater.
  SELECT s.id INTO v_start
    FROM public.lead_workflow_stages s
   WHERE s.id = v_stored_stage_id
     AND s.is_active = true
     AND ((v_has_org_stages AND s.organization_id = v_org)
       OR (NOT v_has_org_stages AND s.organization_id IS NULL))
     AND (
       NOT (COALESCE(s.is_conversion, false) OR COALESCE(s.is_rejection, false))
       OR public.stage_reached(v_signals, s.reached_when, v_status, s.matching_statuses)
     );

  -- (b) resolver pelo status
  IF v_start IS NULL THEN
    SELECT s.id INTO v_start
      FROM public.lead_workflow_stages s
     WHERE s.is_active = true
       AND ((v_has_org_stages AND s.organization_id = v_org)
         OR (NOT v_has_org_stages AND s.organization_id IS NULL))
       AND (
         (s.matching_statuses IS NOT NULL AND v_status = ANY(s.matching_statuses))
         OR s.default_status = v_status
       )
     ORDER BY s.stage_order ASC, s.id ASC
     LIMIT 1;
  END IF;

  -- (c) nenhum estágio cobre este status → nunca despromover o que estava
  --     gravado (mesmo sendo uma saída cuja regra já não bate).
  IF v_start IS NULL THEN
    SELECT s.id INTO v_start
      FROM public.lead_workflow_stages s
     WHERE s.id = v_stored_stage_id
       AND s.is_active = true
       AND ((v_has_org_stages AND s.organization_id = v_org)
         OR (NOT v_has_org_stages AND s.organization_id IS NULL));
  END IF;

  -- (d) último recurso: o estágio de menor stage_order
  IF v_start IS NULL THEN
    SELECT s.id INTO v_start
      FROM public.lead_workflow_stages s
     WHERE s.is_active = true
       AND ((v_has_org_stages AND s.organization_id = v_org)
         OR (NOT v_has_org_stages AND s.organization_id IS NULL))
     ORDER BY s.stage_order ASC, s.id ASC
     LIMIT 1;
  END IF;

  IF v_start IS NULL THEN
    RETURN NULL;
  END IF;

  v_path := ARRAY[v_start];

  -- ---- ciclo: um passo de cada vez, no máximo v_limit passos -------------
  FOR v_i IN 1..v_limit LOOP
    v_current := v_path[array_length(v_path, 1)];

    SELECT s.stage_order,
           (COALESCE(s.is_conversion, false) OR COALESCE(s.is_rejection, false))
      INTO v_current_order, v_current_is_exit
      FROM public.lead_workflow_stages s
     WHERE s.id = v_current;

    -- Uma saída é terminal: não se progride a partir dela.
    EXIT WHEN COALESCE(v_current_is_exit, false);

    -- passo 6: qualificação reavaliada antes de cada decisão
    v_signals := public.lead_qualification_overlay_v2(v_org, v_signals, v_status);

    -- passo 2: saídas primeiro, sem restrição de arestas
    v_exit := NULL;
    SELECT s.id INTO v_exit
      FROM public.lead_workflow_stages s
     WHERE s.is_active = true
       AND ((v_has_org_stages AND s.organization_id = v_org)
         OR (NOT v_has_org_stages AND s.organization_id IS NULL))
       AND (COALESCE(s.is_conversion, false) OR COALESCE(s.is_rejection, false))
       AND NOT (s.id = ANY(v_path))
       AND public.stage_reached(v_signals, s.reached_when, v_status, s.matching_statuses)
     ORDER BY s.stage_order ASC, s.id ASC
     LIMIT 1;

    IF v_exit IS NOT NULL THEN
      v_path := v_path || v_exit;
      EXIT;
    END IF;

    -- passo 3: um único passo de progressão
    v_next := NULL;

    IF v_has_edges THEN
      SELECT s.id INTO v_next
        FROM public.lead_stage_transitions t
        JOIN public.lead_workflow_stages s ON s.id = t.to_stage_id
       WHERE t.organization_id = v_org
         AND COALESCE(t.is_active, true)
         AND t.from_stage_id = v_current
         AND s.is_active = true
         AND ((v_has_org_stages AND s.organization_id = v_org)
           OR (NOT v_has_org_stages AND s.organization_id IS NULL))
         AND NOT (COALESCE(s.is_conversion, false) OR COALESCE(s.is_rejection, false))
         AND NOT (s.id = ANY(v_path))
         AND public.stage_reached(v_signals, s.reached_when, v_status, s.matching_statuses)
       ORDER BY s.stage_order ASC, s.id ASC
       LIMIT 1;
    ELSE
      -- Caminho implícito: SÓ o estágio de progresso imediatamente seguinte.
      -- Se a regra dele não bater, pára — não se salta por cima.
      SELECT s.id INTO v_next
        FROM public.lead_workflow_stages s
       WHERE s.is_active = true
         AND ((v_has_org_stages AND s.organization_id = v_org)
           OR (NOT v_has_org_stages AND s.organization_id IS NULL))
         AND NOT (COALESCE(s.is_conversion, false) OR COALESCE(s.is_rejection, false))
         AND NOT (s.id = ANY(v_path))
         AND (s.stage_order, s.id) > (v_current_order, v_current)
         AND public.stage_reached(v_signals, s.reached_when, v_status, s.matching_statuses)
         AND s.id = (
           SELECT n.id
             FROM public.lead_workflow_stages n
            WHERE n.is_active = true
              AND ((v_has_org_stages AND n.organization_id = v_org)
                OR (NOT v_has_org_stages AND n.organization_id IS NULL))
              AND NOT (COALESCE(n.is_conversion, false) OR COALESCE(n.is_rejection, false))
              AND (n.stage_order, n.id) > (v_current_order, v_current)
            ORDER BY n.stage_order ASC, n.id ASC
            LIMIT 1
         )
       LIMIT 1;
    END IF;

    EXIT WHEN v_next IS NULL;

    v_path := v_path || v_next;
  END LOOP;

  RETURN v_path;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_lead_stage_path_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_lead_stage_path_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lead_stage_path_v2(uuid) TO service_role;

COMMENT ON FUNCTION public.compute_lead_stage_path_v2(uuid) IS
  'Motor sequencial do funil de leads. Devolve o caminho ordenado (uuid[]) de lead_workflow_stages.id desde o estágio actual da lead até onde ela consegue chegar, avançando UM passo de cada vez ao longo das arestas activas de lead_stage_transitions (ou, se a organização não tiver arestas, pelo estágio de progresso seguinte em stage_order). path[1] é o estágio de partida, path[2..] são as entradas novas — é sobre estas que as lead_stage_actions devem correr, por ordem. Estágios com is_conversion/is_rejection são SAÍDAS: avaliados a partir de qualquer estágio pela regra própria, fora das arestas, terminais, e nunca ganham por stage_order. DESEMPATE DETERMINÍSTICO: entre candidatos que batem todos ganha o de menor stage_order e, em empate, o de menor id. GUARDA ANTI-CICLO: nenhum estágio entra duas vezes no caminho e o número de iterações está limitado ao número de estágios activos da organização — o grafo é editável pelo utilizador e pode ter ciclos. Só é usada por compute_lead_stage_v2 quando lead_pipeline_settings.sequential_flow = true.';


-- ============================================================
-- (D) public.compute_lead_stage_v2
-- ============================================================
-- Base: definição VIVA obtida com
--   SELECT pg_get_functiondef('public.compute_lead_stage_v2(uuid)'::regprocedure)
-- (regra do projecto: nunca reconstruir a partir de migração antiga).
--
-- DIFF face à versão viva — apenas acrescento, zero remoções:
--   + DECLARE v_sequential boolean;  v_path uuid[];
--   + leitura de lead_pipeline_settings.sequential_flow logo após o SELECT da
--     lead;
--   + IF COALESCE(v_sequential,false) THEN → devolve o último elemento de
--     compute_lead_stage_path_v2, ou NULL se o caminho vier vazio;
--   o resto (SELECT da lead, IF NOT FOUND, evaluate_lead_signals_v2,
--   v_has_org_stages, o FOR ... ORDER BY stage_order DESC, o RETURN NULL final)
--   está intacto, linha a linha.
--
-- PRESERVADOS: RETURNS uuid, LANGUAGE plpgsql, STABLE, SECURITY DEFINER,
-- SET search_path TO 'public'. Assinatura idêntica → nenhum dos 9 consumidores
-- precisa de tocar em nada.
--
-- A leitura de lead_pipeline_settings acontece dentro de uma função SECURITY
-- DEFINER cujo dono é `postgres`, dono também da tabela, que não tem FORCE ROW
-- LEVEL SECURITY: o motor lê a flag sem depender das políticas RLS e sem as
-- enfraquecer. As políticas de lead_pipeline_settings ficam exactamente como
-- 20261203110000 as criou.

CREATE OR REPLACE FUNCTION public.compute_lead_stage_v2(p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_status text;
  v_signals jsonb;
  v_has_org_stages boolean;
  v_stage record;
  v_sequential boolean;
  v_path uuid[];
BEGIN
  SELECT organization_id, status INTO v_org, v_status
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Adopção gradual. Sem linha em lead_pipeline_settings (o caso de TODAS as
  -- organizações nesta migração) v_sequential vem NULL → COALESCE → false →
  -- ramo legado, idêntico ao actual.
  SELECT COALESCE(s.sequential_flow, false)
    INTO v_sequential
    FROM public.lead_pipeline_settings s
   WHERE s.organization_id = v_org;

  IF COALESCE(v_sequential, false) THEN
    v_path := public.compute_lead_stage_path_v2(p_lead_id);
    IF v_path IS NULL OR array_length(v_path, 1) IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN v_path[array_length(v_path, 1)];
  END IF;

  -- ---- a partir daqui: corpo da versão viva, sem alterações --------------
  v_signals := public.evaluate_lead_signals_v2(p_lead_id);

  SELECT EXISTS (
    SELECT 1 FROM public.lead_workflow_stages
    WHERE organization_id = v_org AND is_active = true
  ) INTO v_has_org_stages;

  FOR v_stage IN
    SELECT id, reached_when, matching_statuses
    FROM public.lead_workflow_stages
    WHERE is_active = true
      AND (
        (v_has_org_stages AND organization_id = v_org)
        OR (NOT v_has_org_stages AND organization_id IS NULL)
      )
    ORDER BY stage_order DESC
  LOOP
    IF public.stage_reached(v_signals, v_stage.reached_when, v_status, v_stage.matching_statuses) THEN
      RETURN v_stage.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- Reafirma a ACL EXACTA da versão viva, confirmada em pg_proc.proacl:
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- CREATE OR REPLACE já preserva a ACL; isto garante o mesmo resultado numa base
-- reconstruída do zero, onde o default seria EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.compute_lead_stage_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_lead_stage_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lead_stage_v2(uuid) TO service_role;

COMMENT ON FUNCTION public.compute_lead_stage_v2(uuid) IS
  'Estágio resolvido de uma lead. Com lead_pipeline_settings.sequential_flow = false (default) mantém o motor histórico: devolve o estágio activo de MAIOR stage_order cuja regra bate. Com sequential_flow = true delega em compute_lead_stage_path_v2 e devolve o ÚLTIMO elemento do caminho — a lead passa a avançar um estágio de cada vez e os estágios de saída (is_conversion/is_rejection) deixam de ganhar por stage_order. Assinatura e tipo de retorno inalterados: os consumidores (fn_mark_lead_pipeline_dirty, fn_sync_lead_workflow_stage_id, recompute_leads_v2_buckets, get_lead_dashboard_stats_scoped, get_lead_journey_stage, get_lead_resolved_stage, get_leads_v2_ids_by_pipeline_status, simulate_lead_v2_bucket_changes, simulate_lead_workflow_stage_rules) não precisam de alteração.';


-- ============================================================
-- Notas de verificação (NÃO executadas por esta migração)
-- ============================================================
-- 1. Nenhuma organização ligada:
--      SELECT organization_id, sequential_flow FROM public.lead_pipeline_settings;
--    → 0 linhas. Todo o sistema continua no ramo legado.
--
-- 2. Não-regressão (flag off) — o destino tem de ser idêntico ao de hoje:
--      SELECT count(*) FROM public.anew_leads l
--       WHERE l.deleted_at IS NULL
--         AND public.compute_lead_stage_v2(l.id) IS DISTINCT FROM l.workflow_stage_id;
--    Comparar antes/depois de aplicar: tem de dar exactamente o mesmo número.
--
-- 3. Caminho de uma lead concreta (sem ligar nada — a função nova é chamável
--    directamente e não depende da flag):
--      SELECT l.id, l.status,
--             (SELECT array_agg(s.label ORDER BY x.ord)
--                FROM unnest(public.compute_lead_stage_path_v2(l.id))
--                     WITH ORDINALITY AS x(sid, ord)
--                JOIN public.lead_workflow_stages s ON s.id = x.sid) AS caminho
--        FROM public.anew_leads l
--       WHERE l.organization_id = '3242e925-da26-459a-8258-be04d904e355'
--         AND l.deleted_at IS NULL
--       LIMIT 50;
--
-- 4. Simulação em leitura já feita sobre os dados reais (18/09/2026), com a
--    lógica desta migração replicada fora da BD. Mudelar (3242e925…, 6034 leads
--    activas, 7 estágios activos, 6 arestas) e BMGest (bf3843c5…, 95 leads, 13
--    estágios, 12 arestas):
--
--    ┌────────────────────────────────────┬──────────┬──────────┐
--    │ Motor                              │ Mudelar  │ BMGest   │
--    ├────────────────────────────────────┼──────────┼──────────┤
--    │ actual (BD tal como está hoje)     │          │          │
--    │   is_rejection / is_conversion     │  0 / 0   │  0 / 0   │
--    │   sem estágio (NULL)               │  6029    │  23      │
--    │ actual + endurecimento 110000      │          │          │
--    │   is_rejection / is_conversion     │ 916 / 15 │  8 / 0   │
--    │   sem estágio (NULL)               │  1787    │  15      │
--    │ SEQUENCIAL (flag ligada)           │          │          │
--    │   is_rejection / is_conversion     │1144 / 62 │ 10 / 0   │
--    │   sem estágio (NULL)               │    0     │   0      │
--    └────────────────────────────────────┴──────────┴──────────┘
--
--    - Leads que mudariam de workflow_stage_id: 4432/6034 (Mudelar), 80/95
--      (BMGest). A esmagadora maioria é preenchimento de valores hoje NULL ou
--      apontados a estágios inactivos/órfãos, não despromoções.
--    - Passos intermédios percorridos (= execuções de acções que hoje NÃO
--      acontecem): 193 na Mudelar, 0 na BMGest.
--    - Nenhuma lead entrou em ciclo nem atingiu o limite de iterações.
--    - Os 1144 is_rejection da Mudelar = 916 que cumprem a regra (status
--      'rejected') + 228 que ficam onde já estão porque nenhum estágio cobre o
--      status 'lost' (alínea 1c). O motor sequencial NÃO acrescenta nenhuma
--      lead perdida por stage_order; liberta 8 leads com status
--      'visit_scheduled' hoje presas em "Lost / Rejected".
