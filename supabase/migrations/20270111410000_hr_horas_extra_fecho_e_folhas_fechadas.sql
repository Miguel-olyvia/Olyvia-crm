-- ==============================================================================
-- Horas extra aprovadas (ENTREGA E2 do plano "horas extra aprovadas passam a
-- contar no relatorio e no pagamento"): o fecho da folha recusa enquanto
-- houver horas extra por decidir e confere a assinatura delas; nada se cria
-- nem decide numa folha fechada; a deteccao salta esses dias. RISCO ALTO: muda
-- o fecho da folha, partilhado por todas as organizacoes da base RH.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth):
-- pendentes so 20270111400000 (de que esta depende) e este, acima de
-- 20270110710000; (2) correr a prova na nike em transaccao desfeita ANTES do
-- push (o conferir abaixo e essa prova); (3) revisao ecc:database-reviewer e
-- ecc:security-reviewer.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO para nada partir. Enquanto nenhuma organizacao tiver
-- hr_horas_extra_config.aprovacao_conta_desde (20270111400000 nasce NULL em
-- todas), o fecho, o registo, a decisao e a deteccao fazem exactamente o que
-- faziam (o conferir prova-o). O cliente (E3 a E5) so e preciso para USAR:
-- com o interruptor ligado o fecho passa a poder recusar com
-- processamento_fechar_horas_extra_por_decidir ou
-- processamento_fechar_horas_extra_desactualizadas, e registar/decidir numa
-- folha fechada com folha_fechada (HRA87) -- sem traducao no ecra ate E5.
-- Com o interruptor ligado o cliente tem de: decidir as pendentes do periodo,
-- ler rpc_hr_horas_extra_assinaturas DEPOIS de decidir, calcular, e enviar em
-- TODOS os resultados a chave horas_extra_assinatura (a da pessoa; com o
-- interruptor ligado nunca e null). Desligado, pode omitir o campo.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. rpc_hr_processamento_periodo_fechar(uuid, jsonb): CREATE OR REPLACE na
--    MESMA assinatura, por troca de texto no corpo do remoto (pg_get_
--    functiondef). O corpo do remoto tem de ser o de 20270110710000 letra a
--    letra (guarda md5 abaixo, sem \r dos dois lados). Entra UM bloco novo
--    imediatamente antes de "Gravar e fechar" (depois do bloco dos desvios).
--    So actua se aprovacao_conta_desde estiver preenchida e for <= data_fim do
--    periodo:
--      a) recusa com processamento_fechar_horas_extra_por_decidir (23514) se
--         houver hora extra PENDENTE com data entre max(data_inicio, desde) e
--         data_fim de uma pessoa OBRIGATORIA do periodo (activa com vinculo
--         sobreposto: a mesma regra dos desvios e do resto do fecho);
--         arquivadas e pessoas sem vinculo no periodo nao bloqueiam;
--      b) exige a chave horas_extra_assinatura em TODOS os resultados
--         (revisao H1: um cliente antigo, que a omite, calculou em modo
--         bruto); sem ela recusa com
--         processamento_fechar_horas_extra_desactualizadas (23514), com a
--         mensagem a mandar recarregar a pagina;
--      c) recalcula a assinatura das horas extra de cada pessoa da lista
--         (hr_horas_extra_assinaturas_periodo de data_inicio a data_fim, com
--         a data do interruptor: com ele ligado nunca e NULL, tambem para quem
--         nao tem linhas) e recusa com
--         processamento_fechar_horas_extra_desactualizadas (23514) se nao for
--         igual a horas_extra_assinatura enviada (null tambem e recusado).
--    NAO deteta horas extra (os tectos HRA84 da deteccao nao cabem no fecho):
--    o excesso nunca detetado nao e pago (aviso no cliente, E5). Sem
--    interruptor, ou com ele depois do fim do periodo: igual a hoje
--    (horas_extra_assinatura e ignorada). Mantem todas as guardas, mensagens,
--    SECURITY DEFINER, search_path vazio e EXECUTE so para authenticated (o
--    conferir prova que so entrou o bloco).
--
-- 2. hr_processamento_resultado_erro(jsonb): troca de texto (guarda md5 do
--    corpo de 20270110710000). Cada objecto de p_resultados passa a aceitar
--    MAIS UM campo OPCIONAL, horas_extra_assinatura: string md5 (32
--    hexadecimais minusculos) ou null. Qualquer outro campo continua recusado.
--    Formato final de cada objecto:
--      pessoa_id, valor_hora, total_bruto, totais, linhas, avisos,
--      retribuicao_id, cargo_periodo_id, regra_salarial_id   (obrigatorios)
--      desvios_assinatura, horas_extra_assinatura             (opcionais)
--
-- 3. Trigger trg_pessoas_horas_extra_folha_fechada (BEFORE INSERT OR UPDATE,
--    por linha) em pessoas_horas_extra: com aprovacao_conta_desde <= data da
--    linha, recusa (folha_fechada, HRA87) se a data cair numa folha FECHADA
--    da organizacao (D5: a correccao tardia e um lancamento manual no periodo
--    seguinte). Le o interruptor com FOR KEY SHARE da linha de
--    hr_horas_extra_config (serializa com o FOR UPDATE de
--    rpc_hr_horas_extra_contagem_guardar; revisao M2; so as organizacoes que
--    ja tem linha). Antes de ler o estado toma FOR SHARE da folha desse dia: um
--    fecho em curso (FOR UPDATE) termina primeiro e o estado lido ja e o
--    depois dele; um registo em curso faz o fecho esperar e ser contado. Vale
--    para registar, decidir, a deteccao e escritas do dono. Sem interruptor,
--    ou antes da data: nada muda.
--
-- 4. rpc_hr_horas_extra_detetar: troca de texto no corpo MAIS RECENTE (o de
--    20270104800000 com as trocas de 20270109700000), guardada por contagem
--    da ancora: o ciclo deixa de ver os dias em que
--    hr_horas_extra_dia_fechado(org, data) (interruptor ligado nessa data e
--    folha fechada). Sem isto, a deteccao rebentaria no trigger ao tocar
--    num desses dias. As contagens finais (obsoletas, divergentes) nao
--    escrevem e ficam como estavam.
--
-- 5. hr_horas_extra_dia_fechado(uuid, date) e
--    hr_horas_extra_folha_fechada_guarda(): internas novas.
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Nada enquanto nao ligarem o interruptor (rpc_hr_horas_extra_contagem_
-- guardar). Cada fecho passa a ler uma linha de hr_horas_extra_config (pela
-- PK); cada escrita em pessoas_horas_extra tambem. Mudelar nao esta nesta
-- base.
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   processamento_fechar_horas_extra_por_decidir (23514)
--   processamento_fechar_horas_extra_desactualizadas (23514)
--   folha_fechada (HRA87, MESSAGE = codigo como nas RPCs de horas extra; o
--     DETAIL diz o dia e a folha)
--   horas_extra_fecho_fora_de_transaccao (25000)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor
-- os corpos de rpc_hr_processamento_periodo_fechar(uuid, jsonb) e de
-- hr_processamento_resultado_erro(jsonb) de 20270110710000 (tirar o bloco e o
-- campo), tirar a condicao da deteccao, largar o trigger e as duas internas.
-- Desligar o interruptor em todas as organizacoes chega para voltar ao
-- comportamento de hoje sem tocar no codigo.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'horas_extra_fecho_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- O corpo do validador de resultados em vigor (20270110710000) -----------
CREATE TEMP TABLE tmp_he_erro_antigo (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_he_erro_antigo (corpo) VALUES ($old$
DECLARE
  k_chaves  constant text[] := ARRAY['pessoa_id', 'valor_hora', 'total_bruto', 'totais', 'linhas', 'avisos',
                                     'retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id'];
  k_opcionais constant text[] := ARRAY['desvios_assinatura'];
  k_totais  constant text[] := ARRAY['base_mes', 'divisor_duodecimos', 'total_codigos_automaticos', 'total_regras',
                                     'desconto_faltas', 'subsidio_alimentacao', 'lancamentos_pontuais'];
  k_uuids   constant text[] := ARRAY['retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id'];
  k_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  k_max     constant numeric := 10000000;
  k_linhas  constant integer := 500;
  k_avisos  constant integer := 20;
  v_k       text;
  v_t       text;
  v_e       jsonb;
BEGIN
  IF _r IS NULL OR pg_catalog.jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN
    RETURN 'cada resultado tem de ser um objecto';
  END IF;

  SELECT pg_catalog.string_agg(k.chave, ', ' ORDER BY k.chave) INTO v_t
    FROM pg_catalog.jsonb_object_keys(_r) AS k(chave)
   WHERE k.chave <> ALL (k_chaves || k_opcionais);
  IF v_t IS NOT NULL THEN
    RETURN 'campos desconhecidos: ' || v_t;
  END IF;
  FOREACH v_k IN ARRAY k_chaves LOOP
    IF NOT (_r ? v_k) THEN
      RETURN 'falta o campo ' || v_k;
    END IF;
  END LOOP;

  -- pessoa_id
  IF pg_catalog.jsonb_typeof(_r -> 'pessoa_id') <> 'string' OR (_r ->> 'pessoa_id') !~ k_uuid_re THEN
    RETURN 'pessoa_id tem de ser um uuid';
  END IF;

  -- versoes: uuid ou null
  FOREACH v_k IN ARRAY k_uuids LOOP
    v_t := pg_catalog.jsonb_typeof(_r -> v_k);
    IF v_t <> 'null' THEN
      IF v_t <> 'string' OR (_r ->> v_k) !~ k_uuid_re THEN
        RETURN v_k || ' tem de ser um uuid ou null';
      END IF;
    END IF;
  END LOOP;

  -- desvios_assinatura (opcional): md5 (32 hexadecimais minusculos) ou null
  IF _r ? 'desvios_assinatura' THEN
    v_t := pg_catalog.jsonb_typeof(_r -> 'desvios_assinatura');
    IF v_t <> 'null' THEN
      IF v_t <> 'string' OR (_r ->> 'desvios_assinatura') !~ '^[0-9a-f]{32}$' THEN
        RETURN 'desvios_assinatura tem de ser um md5 (32 caracteres hexadecimais) ou null';
      END IF;
    END IF;
  END IF;

  -- valor_hora: number >= 0 e <= 10000, ou null
  v_t := pg_catalog.jsonb_typeof(_r -> 'valor_hora');
  IF v_t = 'number' THEN
    IF (_r ->> 'valor_hora')::numeric < 0 OR (_r ->> 'valor_hora')::numeric > 10000 THEN
      RETURN 'valor_hora fora do intervalo (0 a 10000)';
    END IF;
  ELSIF v_t <> 'null' THEN
    RETURN 'valor_hora tem de ser numero ou null';
  END IF;

  -- total_bruto: number ou null
  v_t := pg_catalog.jsonb_typeof(_r -> 'total_bruto');
  IF v_t = 'number' THEN
    IF pg_catalog.abs((_r ->> 'total_bruto')::numeric) > k_max THEN
      RETURN 'total_bruto fora do intervalo';
    END IF;
  ELSIF v_t <> 'null' THEN
    RETURN 'total_bruto tem de ser numero ou null';
  END IF;

  -- totais: objecto com exactamente as chaves k_totais, cada uma number ou null
  IF pg_catalog.jsonb_typeof(_r -> 'totais') <> 'object' THEN
    RETURN 'totais tem de ser um objecto';
  END IF;
  SELECT pg_catalog.string_agg(k.chave, ', ' ORDER BY k.chave) INTO v_t
    FROM pg_catalog.jsonb_object_keys(_r -> 'totais') AS k(chave)
   WHERE k.chave <> ALL (k_totais);
  IF v_t IS NOT NULL THEN
    RETURN 'campos desconhecidos em totais: ' || v_t;
  END IF;
  FOREACH v_k IN ARRAY k_totais LOOP
    IF NOT ((_r -> 'totais') ? v_k) THEN
      RETURN 'falta totais.' || v_k;
    END IF;
    v_t := pg_catalog.jsonb_typeof(_r -> 'totais' -> v_k);
    IF v_t = 'number' THEN
      IF pg_catalog.abs((_r -> 'totais' ->> v_k)::numeric) > k_max THEN
        RETURN 'totais.' || v_k || ' fora do intervalo';
      END IF;
    ELSIF v_t <> 'null' THEN
      RETURN 'totais.' || v_k || ' tem de ser numero ou null';
    END IF;
  END LOOP;

  -- linhas: array de objectos com origem e valor
  IF pg_catalog.jsonb_typeof(_r -> 'linhas') <> 'array' THEN
    RETURN 'linhas tem de ser uma lista';
  END IF;
  IF pg_catalog.jsonb_array_length(_r -> 'linhas') > k_linhas THEN
    RETURN 'linhas a mais (maximo 500)';
  END IF;
  FOR v_e IN SELECT x.value FROM pg_catalog.jsonb_array_elements(_r -> 'linhas') AS x(value) LOOP
    IF pg_catalog.jsonb_typeof(v_e) <> 'object' THEN
      RETURN 'cada linha tem de ser um objecto';
    END IF;
    IF pg_catalog.octet_length(v_e::text) > 2000 THEN
      RETURN 'linha demasiado grande (mais de 2000 bytes)';
    END IF;
    IF pg_catalog.jsonb_typeof(v_e -> 'origem') IS DISTINCT FROM 'string'
       OR (v_e ->> 'origem') NOT IN ('codigo', 'regra', 'lancamento') THEN
      RETURN 'linha com origem invalida (codigo, regra ou lancamento)';
    END IF;
    IF pg_catalog.jsonb_typeof(v_e -> 'valor') IS DISTINCT FROM 'number' THEN
      RETURN 'linha sem valor numerico';
    END IF;
    IF pg_catalog.abs((v_e ->> 'valor')::numeric) > k_max THEN
      RETURN 'linha com valor fora do intervalo';
    END IF;
  END LOOP;

  -- avisos: array de codigos curtos
  IF pg_catalog.jsonb_typeof(_r -> 'avisos') <> 'array' THEN
    RETURN 'avisos tem de ser uma lista';
  END IF;
  IF pg_catalog.jsonb_array_length(_r -> 'avisos') > k_avisos THEN
    RETURN 'avisos a mais (maximo 20)';
  END IF;
  FOR v_e IN SELECT x.value FROM pg_catalog.jsonb_array_elements(_r -> 'avisos') AS x(value) LOOP
    IF pg_catalog.jsonb_typeof(v_e) <> 'string' OR (v_e #>> '{}') !~ '^[a-z_]{1,60}$' THEN
      RETURN 'cada aviso tem de ser um codigo (letras minusculas e _)';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$old$);

-- ---- O corpo do fecho em vigor (20270110710000), para a guarda md5 ------------
CREATE TEMP TABLE tmp_he_fechar_antigo (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_he_fechar_antigo (corpo) VALUES ($old$
DECLARE
  k_max_pessoas constant integer := 5000;
  k_max_bytes   constant integer := 8000000;
  v_auth        uuid := auth.uid();
  v_periodo     public.hr_periodos_processamento%ROWTYPE;
  v_autor_id    uuid;
  v_agora       timestamptz := pg_catalog.now();
  v_pode        boolean;
  v_item        jsonb;
  v_ord         bigint;
  v_erro        text;
  v_ids         uuid[];
  v_exemplo     uuid;
  v_falta       integer;
  v_regra_id    uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_periodo_fechar exige um utilizador autenticado.';
  END IF;

  -- FOR UPDATE: fecha a corrida com rpc_hr_processamento_lancamento_criar
  -- (FOR SHARE na mesma linha) e com outro fecho em simultaneo.
  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento pp
   WHERE pp.id = p_periodo_id
   FOR UPDATE;

  -- Permissao logo depois do lock, ANTES de revelar se o periodo existe ou o
  -- seu estado (mesma regra da versao de 20261207020400). Periodo inexistente:
  -- organizacao NULL, sem permissao. O coalesce garante que um NULL nunca passa.
  v_pode := coalesce(public.has_anew_permission_in_org(
    v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id), false);
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.periodo.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado.', p_periodo_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  -- ---- Estrutura -------------------------------------------------------------
  IF p_resultados IS NULL OR pg_catalog.jsonb_typeof(p_resultados) <> 'array' THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: p_resultados tem de ser uma lista (array jsonb) com um resultado por pessoa.'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_resultados) > k_max_pessoas
     OR pg_catalog.octet_length(p_resultados::text) > k_max_bytes THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: a lista excede o limite (% pessoas, % bytes).',
      k_max_pessoas, k_max_bytes
      USING ERRCODE = '22023';
  END IF;

  FOR v_item, v_ord IN
    SELECT e.value, e.ord FROM pg_catalog.jsonb_array_elements(p_resultados) WITH ORDINALITY AS e(value, ord)
  LOOP
    v_erro := public.hr_processamento_resultado_erro(v_item);
    IF v_erro IS NOT NULL THEN
      RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: resultado % da lista: %.', v_ord, v_erro
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_ids := ARRAY(SELECT (e.value ->> 'pessoa_id')::uuid
                   FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value));

  -- ---- Pessoas do periodo ------------------------------------------------------
  -- PERMITIDAS: pessoas da organizacao (sem deleted_at), activas ou arquivadas,
  --   com um vinculo nao apagado que sobrepoe [data_inicio, data_fim] do
  --   periodo. pessoas_vinculos.data_fim e o ULTIMO dia do contrato
  --   (inclusive); NULL = sem fim.
  -- OBRIGATORIAS: as permitidas com estado_registo = 'activo' (o que o ecra
  --   mostra).
  -- Anti-joins por LEFT JOIN a CTEs materializadas (hash join), nao NOT EXISTS
  -- correlacionado sobre o array: escala para 5000 pessoas.
  SELECT x.id INTO v_exemplo
    FROM pg_catalog.unnest(v_ids) AS x(id)
   GROUP BY x.id
  HAVING pg_catalog.count(*) > 1
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_pessoa_repetida: a pessoa % aparece mais de uma vez na lista.', v_exemplo
      USING ERRCODE = '22023';
  END IF;

  WITH permitidas AS MATERIALIZED (
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id
       AND v.organization_id = p.organization_id
       AND v.deleted_at IS NULL
       AND v.data_inicio <= v_periodo.data_fim
       AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio)
     WHERE p.organization_id = v_periodo.organization_id
       AND p.deleted_at IS NULL
  ),
  enviadas AS MATERIALIZED (
    SELECT x.id FROM pg_catalog.unnest(v_ids) AS x(id)
  )
  SELECT e.id INTO v_exemplo
    FROM enviadas e
    LEFT JOIN permitidas pe ON pe.id = e.id
   WHERE pe.id IS NULL
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_pessoa_fora_do_periodo: a pessoa % nao tem vinculo com esta organizacao entre % e %.',
      v_exemplo, v_periodo.data_inicio, v_periodo.data_fim
      USING ERRCODE = '23514';
  END IF;

  WITH obrigatorias AS MATERIALIZED (
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id
       AND v.organization_id = p.organization_id
       AND v.deleted_at IS NULL
       AND v.data_inicio <= v_periodo.data_fim
       AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio)
     WHERE p.organization_id = v_periodo.organization_id
       AND p.deleted_at IS NULL
       AND p.estado_registo = 'activo'
  ),
  enviadas AS MATERIALIZED (
    SELECT x.id FROM pg_catalog.unnest(v_ids) AS x(id)
  )
  SELECT pg_catalog.count(*)::integer, (pg_catalog.array_agg(o.id ORDER BY o.id))[1]
    INTO v_falta, v_exemplo
    FROM obrigatorias o
    LEFT JOIN enviadas e ON e.id = o.id
   WHERE e.id IS NULL;
  IF v_falta > 0 THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_em_falta: faltam os resultados de % pessoa(s) activa(s) com vinculo no periodo (por exemplo %); o calculo de todas tem de terminar antes de fechar.',
      v_falta, v_exemplo
      USING ERRCODE = '23514';
  END IF;

  -- ---- Coerencia: lancamentos pontuais (manuais, nao anulados) ----------------
  -- totais.lancamentos_pontuais tem de ser a soma, ao centimo, dos lancamentos
  -- manuais nao anulados da pessoa neste periodo (null conta 0). km e ajudas
  -- tem linha propria da regra e nao entram neste total (como no cliente,
  -- processamentoTotais.ts calcularLancamentosPontuais). O FOR UPDATE do periodo
  -- impede lancamentos novos enquanto isto corre.
  WITH somas AS MATERIALIZED (
    SELECT l.pessoa_id, pg_catalog.round(pg_catalog.sum(l.valor), 2) AS total
      FROM public.hr_processamento_lancamentos l
     WHERE l.periodo_id = v_periodo.id
       AND l.organization_id = v_periodo.organization_id
       AND l.anulado_em IS NULL
       AND l.tipo = 'manual'
     GROUP BY l.pessoa_id
  ),
  enviadas AS MATERIALIZED (
    SELECT (e.value ->> 'pessoa_id')::uuid AS pid,
           pg_catalog.round(coalesce((e.value -> 'totais' ->> 'lancamentos_pontuais')::numeric, 0), 2) AS total
      FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
  )
  SELECT en.pid INTO v_exemplo
    FROM enviadas en
    LEFT JOIN somas s ON s.pessoa_id = en.pid
   WHERE en.total IS DISTINCT FROM coalesce(s.total, 0)
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_lancamentos_desactualizados: os lancamentos pontuais da pessoa % mudaram desde o calculo; recalcular e voltar a fechar.', v_exemplo
      USING ERRCODE = '23514';
  END IF;

  -- ---- Versoes: regra salarial do servidor; retribuicao e cargo conferidos ----
  v_regra_id := (public.hr_regras_salariais_em(v_periodo.organization_id, v_periodo.data_fim) ->> 'id')::uuid;

  SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
    FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
   WHERE (e.value ->> 'regra_salarial_id')::uuid IS DISTINCT FROM v_regra_id
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_regra_desactualizada: o resultado da pessoa % foi calculado com outra regra salarial; a regra em vigor a % e %. Recalcular e voltar a fechar.',
      v_exemplo, v_periodo.data_fim, coalesce(v_regra_id::text, 'nenhuma')
      USING ERRCODE = '23514';
  END IF;

  SELECT x.pid INTO v_exemplo
    FROM (SELECT (e.value ->> 'pessoa_id')::uuid AS pid, (e.value ->> 'retribuicao_id')::uuid AS rid
            FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)) AS x
   WHERE x.rid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pessoas_retribuicoes r
                      WHERE r.id = x.rid
                        AND r.pessoa_id = x.pid
                        AND r.organization_id = v_periodo.organization_id
                        AND r.deleted_at IS NULL
                        -- a versao em vigor no data_fim; valido_ate e EXCLUSIVO
                        -- (trigger de nao sobreposicao com '[)').
                        AND r.valido_de <= v_periodo.data_fim
                        AND (r.valido_ate IS NULL OR r.valido_ate > v_periodo.data_fim))
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_versao_invalida: a retribuicao indicada para a pessoa % nao e a versao dela em vigor a %; recalcular e voltar a fechar.',
      v_exemplo, v_periodo.data_fim
      USING ERRCODE = '23514';
  END IF;

  SELECT x.pid INTO v_exemplo
    FROM (SELECT (e.value ->> 'pessoa_id')::uuid AS pid, (e.value ->> 'cargo_periodo_id')::uuid AS cid
            FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)) AS x
   WHERE x.cid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hr_cargos_periodos c
                      WHERE c.id = x.cid
                        AND c.organization_id = v_periodo.organization_id)
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_versao_invalida: a versao do cargo indicada para a pessoa % nao e desta organizacao.', v_exemplo
      USING ERRCODE = '23514';
  END IF;

  -- ---- Desvios por validar (ligado em 20270110710000) ------------------------
  -- So actua se houver uma margem de tempo (nao NULL) em vigor em algum dia
  -- do periodo; sem ela, o fecho fica exactamente como antes. Detecta de novo
  -- o periodo inteiro, recusa enquanto houver dias por validar de pessoas
  -- OBRIGATORIAS e confere a assinatura dos desvios de cada pessoa enviada.
  -- Uma recusa desfaz a deteccao: o cliente deteta (rpc_hr_desvios_detetar) e
  -- valida ANTES de fechar.
  DECLARE
    v_com_margem  boolean;
    v_por_validar integer;
  BEGIN
    v_com_margem := EXISTS (
      SELECT 1 FROM public.hr_desvios_config k
       WHERE k.organization_id = v_periodo.organization_id
         AND k.substituida_em IS NULL
         AND k.margem_min IS NOT NULL
         AND k.valido_de <= v_periodo.data_fim
         AND (k.valido_ate IS NULL OR k.valido_ate >= v_periodo.data_inicio));
    IF v_com_margem THEN
      PERFORM public.hr_desvios_detetar_core(
        v_periodo.organization_id, v_periodo.data_inicio, v_periodo.data_fim, NULL);

      SELECT pg_catalog.count(*)::integer INTO v_por_validar
        FROM public.pessoas_desvios d
       WHERE d.organization_id = v_periodo.organization_id
         AND d.data BETWEEN v_periodo.data_inicio AND v_periodo.data_fim
         AND d.estado = 'a_validar'
         AND EXISTS (
           SELECT 1
             FROM public.pessoas p
             JOIN public.pessoas_vinculos v
               ON v.pessoa_id = p.id
              AND v.organization_id = p.organization_id
              AND v.deleted_at IS NULL
              AND v.data_inicio <= v_periodo.data_fim
              AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio)
            WHERE p.id = d.pessoa_id
              AND p.organization_id = v_periodo.organization_id
              AND p.deleted_at IS NULL
              AND p.estado_registo = 'activo');
      IF v_por_validar > 0 THEN
        RAISE EXCEPTION 'processamento_fechar_desvios_por_validar: ha % dia(s) com desvios por validar neste periodo; detetar (rpc_hr_desvios_detetar) e validar os desvios do periodo antes de fechar.', v_por_validar
          USING ERRCODE = '23514';
      END IF;

      WITH calculadas AS MATERIALIZED (
        SELECT s.pessoa_id, s.assinatura
          FROM public.hr_desvios_assinaturas_periodo(
                 v_periodo.organization_id, v_periodo.data_inicio, v_periodo.data_fim) AS s
      ),
      enviadas AS MATERIALIZED (
        SELECT (e.value ->> 'pessoa_id')::uuid AS pid, e.value ->> 'desvios_assinatura' AS assinatura
          FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
      )
      SELECT en.pid INTO v_exemplo
        FROM enviadas en
        LEFT JOIN calculadas c ON c.pessoa_id = en.pid
       WHERE en.assinatura IS DISTINCT FROM c.assinatura
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_desvios_desactualizados: os desvios da pessoa % mudaram desde o calculo; ler rpc_hr_desvios_assinaturas, recalcular e voltar a fechar.', v_exemplo
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END;

  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------
  INSERT INTO public.hr_processamento_resultados (
    organization_id, periodo_id, pessoa_id, valor_hora, total_bruto, totais, linhas, avisos,
    retribuicao_id, cargo_periodo_id, regra_salarial_id, fechado_por, fechado_em
  )
  SELECT v_periodo.organization_id,
         v_periodo.id,
         (e.value ->> 'pessoa_id')::uuid,
         pg_catalog.round((e.value ->> 'valor_hora')::numeric, 4),
         pg_catalog.round((e.value ->> 'total_bruto')::numeric, 2),
         e.value -> 'totais',
         e.value -> 'linhas',
         ARRAY(SELECT a.value FROM pg_catalog.jsonb_array_elements_text(e.value -> 'avisos') AS a(value)),
         (e.value ->> 'retribuicao_id')::uuid,
         (e.value ->> 'cargo_periodo_id')::uuid,
         v_regra_id,
         v_autor_id,
         v_agora
    FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value);

  UPDATE public.hr_periodos_processamento
     SET estado = 'fechado',
         fechado_em = v_agora,
         fechado_por = v_autor_id
   WHERE id = v_periodo.id;
END;
$old$);

-- ---- As trocas de texto: funcao, ancora, substituto, ocorrencias da ancora ---
CREATE TEMP TABLE tmp_he_trocas (ordem integer PRIMARY KEY, fn text NOT NULL, ancora text NOT NULL,
                                 novo text NOT NULL, vezes integer NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_he_trocas (ordem, fn, ancora, novo, vezes) VALUES
-- 1. O fecho: o bloco das horas extra entra antes de "Gravar e fechar".
(1, 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
 '  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------',
$blk$  -- ---- Horas extra por decidir (ligado em 20270111410000) --------------------
  -- So actua se a organizacao contar so as horas extra aprovadas a partir de
  -- um dia ate ao fim do periodo (hr_horas_extra_config.aprovacao_conta_desde);
  -- sem isso, o fecho fica exactamente como antes. NAO deteta horas extra:
  -- recusa enquanto houver pendentes de pessoas OBRIGATORIAS nos dias que
  -- contam e confere a assinatura das horas extra de cada pessoa enviada.
  DECLARE
    v_he_desde     date;
    v_he_de        date;
    v_he_pendentes integer;
  BEGIN
    SELECT c.aprovacao_conta_desde INTO v_he_desde
      FROM public.hr_horas_extra_config c
     WHERE c.organization_id = v_periodo.organization_id;
    IF v_he_desde IS NOT NULL AND v_he_desde <= v_periodo.data_fim THEN
      v_he_de := GREATEST(v_periodo.data_inicio, v_he_desde);

      SELECT pg_catalog.count(*)::integer INTO v_he_pendentes
        FROM public.pessoas_horas_extra x
       WHERE x.organization_id = v_periodo.organization_id
         AND x.estado = 'pendente'
         AND x.data BETWEEN v_he_de AND v_periodo.data_fim
         AND EXISTS (
           SELECT 1
             FROM public.pessoas p
             JOIN public.pessoas_vinculos v
               ON v.pessoa_id = p.id
              AND v.organization_id = p.organization_id
              AND v.deleted_at IS NULL
              AND v.data_inicio <= v_periodo.data_fim
              AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio)
            WHERE p.id = x.pessoa_id
              AND p.organization_id = v_periodo.organization_id
              AND p.deleted_at IS NULL
              AND p.estado_registo = 'activo');
      IF v_he_pendentes > 0 THEN
        RAISE EXCEPTION 'processamento_fechar_horas_extra_por_decidir: ha % hora(s) extra pendente(s) de pessoas activas neste periodo a partir de %; confirmar ou rejeitar cada uma antes de fechar.', v_he_pendentes, pg_catalog.to_char(v_he_de, 'YYYY-MM-DD')
          USING ERRCODE = '23514';
      END IF;

      -- Com a contagem ligada, TODOS os resultados trazem a chave (null nunca
      -- bate): um cliente antigo, que a omite, calculou em modo bruto.
      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE NOT (e.value ? 'horas_extra_assinatura')
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_horas_extra_desactualizadas: o resultado da pessoa % nao traz horas_extra_assinatura (calculado por uma versao antiga do ecra); recarregar a pagina, recalcular e voltar a fechar.', v_exemplo
          USING ERRCODE = '23514';
      END IF;

      WITH calculadas AS MATERIALIZED (
        SELECT s.pessoa_id, s.assinatura
          FROM public.hr_horas_extra_assinaturas_periodo(
                 v_periodo.organization_id, v_periodo.data_inicio, v_periodo.data_fim, v_ids) AS s
      ),
      enviadas AS MATERIALIZED (
        SELECT (e.value ->> 'pessoa_id')::uuid AS pid, e.value ->> 'horas_extra_assinatura' AS assinatura
          FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
      )
      SELECT en.pid INTO v_exemplo
        FROM enviadas en
        LEFT JOIN calculadas c ON c.pessoa_id = en.pid
       WHERE en.assinatura IS DISTINCT FROM c.assinatura
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_horas_extra_desactualizadas: as horas extra da pessoa % mudaram desde o calculo; ler rpc_hr_horas_extra_assinaturas, recalcular e voltar a fechar.', v_exemplo
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END;

  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------$blk$,
 1),
-- 2. O validador: o campo opcional novo na lista.
(2, 'public.hr_processamento_resultado_erro(jsonb)',
 $x$ARRAY['desvios_assinatura'];$x$,
 $x$ARRAY['desvios_assinatura', 'horas_extra_assinatura'];$x$,
 1),
-- 3. O validador: a forma do campo novo (md5 ou null), antes de valor_hora.
(3, 'public.hr_processamento_resultado_erro(jsonb)',
 '  -- valor_hora: number >= 0 e <= 10000, ou null',
$blk$  -- horas_extra_assinatura (opcional): md5 (32 hexadecimais minusculos) ou null
  IF _r ? 'horas_extra_assinatura' THEN
    v_t := pg_catalog.jsonb_typeof(_r -> 'horas_extra_assinatura');
    IF v_t <> 'null' THEN
      IF v_t <> 'string' OR (_r ->> 'horas_extra_assinatura') !~ '^[0-9a-f]{32}$' THEN
        RETURN 'horas_extra_assinatura tem de ser um md5 (32 caracteres hexadecimais) ou null';
      END IF;
    END IF;
  END IF;

  -- valor_hora: number >= 0 e <= 10000, ou null$blk$,
 1),
-- 4. A deteccao: o ciclo nao ve os dias de folhas fechadas com o interruptor ligado.
(4, 'public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid)',
 'GROUP BY h.pessoa_id, h.data',
 'AND NOT public.hr_horas_extra_dia_fechado(p_organization_id, h.data) GROUP BY h.pessoa_id, h.data',
 1);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista  text;
  v_n      integer;
  v_r      record;
  v_src    text;
  v_antigo text;
  v_cod    text;
  k_fechar constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
  k_erro   constant text := 'public.hr_processamento_resultado_erro(jsonb)';
BEGIN
  -- G0. Quem aplica passa a RLS (as RPCs definer correm como o dono).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;

  -- G1. 20270111400000 aplicada: a coluna e as funcoes de que o fecho depende.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.hr_horas_extra_config')
                    AND a.attname::text = 'aprovacao_conta_desde' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G1: falta hr_horas_extra_config.aprovacao_conta_desde (aplicar 20270111400000 antes).';
  END IF;
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.hr_horas_extra_assinaturas_periodo(uuid, date, date, uuid[])',
                      'public.rpc_hr_horas_extra_do_periodo_org(uuid, date, date)',
                      'public.hr_horas_extra_assinatura(uuid, uuid, date, date)',
                      'public.rpc_hr_horas_extra_assinaturas(uuid)',
                      'public.rpc_hr_horas_extra_contagem_guardar(uuid, date)',
                      'public.rpc_hr_horas_extra_do_periodo(uuid, uuid, date, date)',
                      'public.rpc_hr_hora_extra_registar(uuid, uuid, date, time without time zone, time without time zone, text)',
                      'public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text)',
                      'public.hr_horas_extra_hoje()',
                      'public.hr_regras_salariais_em(uuid, date)',
                      'public.hr_desvios_config_guardar_core(uuid, date, integer, uuid)',
                      'public.has_anew_permission_in_org(uuid, text, uuid)']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: faltam funcoes: %.', v_lista;
  END IF;
  IF to_regclass('public.hr_desvios_config') IS NULL OR to_regclass('public.pessoas_desvios') IS NULL THEN
    RAISE EXCEPTION 'G1: faltam hr_desvios_config ou pessoas_desvios (20270110700000/20270110710000): o corpo do fecho le-as.';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('pessoas_horario_planeado', 'pessoa_id'), ('pessoas_horario_planeado', 'organization_id'),
                 ('pessoas_horario_planeado', 'data'), ('pessoas_horario_planeado', 'hora_inicio'),
                 ('pessoas_horario_planeado', 'hora_fim'),
                 ('pessoas_horario_realizado', 'pessoa_id'), ('pessoas_horario_realizado', 'organization_id'),
                 ('pessoas_horario_realizado', 'data'), ('pessoas_horario_realizado', 'hora_inicio'),
                 ('pessoas_horario_realizado', 'hora_fim'),
                 ('pessoas_horas_extra', 'motivo_origem'), ('pessoas_horas_extra', 'hora_inicio'),
                 ('pessoas_horas_extra', 'hora_fim'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'G1: faltam colunas esperadas no horario planeado/realizado ou em pessoas_horas_extra (% de 13).', v_n;
  END IF;

  -- G2. Nomes novos livres.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_horas_extra_dia_fechado', 'hr_horas_extra_folha_fechada_guarda');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('public.pessoas_horas_extra')
                AND t.tgname::text = 'trg_pessoas_horas_extra_folha_fechada') THEN
    RAISE EXCEPTION 'G2: o trigger trg_pessoas_horas_extra_folha_fechada ja existe.';
  END IF;

  -- G3. As funcoes que se trocam existem com UMA so assinatura (a lida).
  SELECT string_agg(f.proname || ' (' || f.n::text || ')', ', ') INTO v_lista
    FROM (SELECT x.proname, (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                              WHERE ns.nspname::text = 'public' AND p.proname::text = x.proname) AS n
            FROM unnest(ARRAY['rpc_hr_processamento_periodo_fechar', 'hr_processamento_resultado_erro',
                              'rpc_hr_horas_extra_detetar']) AS x(proname)) f
   WHERE f.n <> 1;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: estas funcoes nao existem ou tem mais de uma assinatura: %.', v_lista;
  END IF;
  FOR v_r IN SELECT DISTINCT t.fn FROM tmp_he_trocas t LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'G3: % nao existe com esta assinatura.', v_r.fn;
    END IF;
  END LOOP;

  -- G4. O fecho: SECURITY DEFINER com search_path vazio, e o corpo e o de
  --     20270110710000 (md5 sem \r dos dois lados).
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_fechar)::oid AND p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'G4: o fecho deixou de ser SECURITY DEFINER com search_path vazio. Reler.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(k_fechar)::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_he_fechar_antigo t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G4: o corpo do fecho no remoto (md5 sem \r %) nao e o de 20270110710000 transcrito aqui (md5 %). Reler a versao mais recente antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;

  -- G5. O validador: nao SECURITY DEFINER, search_path vazio, corpo de 20270110710000.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_erro)::oid
                    AND NOT p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'G5: hr_processamento_resultado_erro(jsonb) passou a SECURITY DEFINER ou perdeu o search_path vazio.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(k_erro)::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_he_erro_antigo t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G5: o corpo de hr_processamento_resultado_erro no remoto (md5 sem \r %) nao e o de 20270110710000 transcrito aqui (md5 %). Reler antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;

  -- G6. As ancoras das trocas aparecem o numero exacto de vezes no corpo do
  --     remoto (a deteccao: o corpo MAIS RECENTE, seja qual for).
  FOR v_r IN SELECT * FROM tmp_he_trocas ORDER BY ordem LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    v_n := (length(v_src) - length(replace(v_src, v_r.ancora, ''))) / length(v_r.ancora);
    IF v_n <> v_r.vezes THEN
      RAISE EXCEPTION 'G6: em %, "%" aparece % vez(es), esperavam-se %. Reler o corpo do remoto.', v_r.fn, v_r.ancora, v_n, v_r.vezes;
    END IF;
  END LOOP;

  -- G7. HRA87 so e usado pela RPC do interruptor (20270111400000).
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.prosrc LIKE '%HRA87%'
     AND p.proname::text <> 'rpc_hr_horas_extra_contagem_guardar';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G7: o codigo HRA87 ja e usado por: %. Escolher outro.', v_lista;
  END IF;

  -- G8. Permissoes usadas na prova.
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.view', 'hr.assiduidade.gerir', 'hr.processamento.periodo.gerir'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G8: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G9. Nenhuma organizacao com o interruptor ligado: o fecho passaria a
  --     recusar logo no push.
  IF EXISTS (SELECT 1 FROM public.hr_horas_extra_config c WHERE c.aprovacao_conta_desde IS NOT NULL) THEN
    RAISE EXCEPTION 'G9: ja ha organizacoes com aprovacao_conta_desde; o fecho delas passaria a recusar logo no push. Ler antes de aplicar.';
  END IF;
END;
$guardas$;

-- Os corpos de antes das trocas, para o conferir provar que so mudou o pedido.
CREATE TEMP TABLE tmp_he_antes ON COMMIT DROP AS
SELECT DISTINCT t.fn, p.prosrc, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl
  FROM tmp_he_trocas t
  JOIN pg_proc p ON p.oid = to_regprocedure(t.fn)::oid;


-- ==============================================================================
-- 1. As internas novas e o trigger da folha fechada
-- ==============================================================================

-- O dia esta numa folha fechada E o interruptor ja conta nesse dia? (a deteccao
-- salta-o; nada se escreve nele).
CREATE FUNCTION public.hr_horas_extra_dia_fechado(p_organization_id uuid, p_data date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.hr_horas_extra_config c
                  WHERE c.organization_id = p_organization_id
                    AND c.aprovacao_conta_desde IS NOT NULL
                    AND c.aprovacao_conta_desde <= p_data)
     AND EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
                  WHERE pp.organization_id = p_organization_id
                    AND pp.estado = 'fechado'
                    AND p_data BETWEEN pp.data_inicio AND pp.data_fim)
$$;

COMMENT ON FUNCTION public.hr_horas_extra_dia_fechado(uuid, date) IS
'INTERNA (sem EXECUTE para ninguem). true quando a organizacao conta so as horas extra aprovadas nessa data (hr_horas_extra_config.aprovacao_conta_desde <= p_data) e a data esta numa folha fechada. A deteccao (rpc_hr_horas_extra_detetar) nao ve esses dias. Desde 20270111410000.';

-- Nada se cria nem decide numa folha fechada (com o interruptor a contar nesse dia).
CREATE FUNCTION public.hr_horas_extra_folha_fechada_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_desde  date;
  v_estado text;
  v_ini    date;
  v_fim    date;
BEGIN
  -- FOR KEY SHARE da linha da organizacao: espera por um
  -- rpc_hr_horas_extra_contagem_guardar em curso (FOR UPDATE) e le o valor
  -- de depois dele.
  SELECT c.aprovacao_conta_desde INTO v_desde
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = NEW.organization_id
     FOR KEY SHARE;
  IF v_desde IS NULL OR NEW.data < v_desde THEN
    RETURN NEW;
  END IF;

  -- FOR SHARE da folha desse dia SEM filtrar pelo estado: um fecho em curso
  -- (FOR UPDATE) termina primeiro e a linha devolvida ja e a de depois dele;
  -- um fecho que comece depois espera por esta transaccao e conta esta linha.
  SELECT pp.estado, pp.data_inicio, pp.data_fim INTO v_estado, v_ini, v_fim
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = NEW.organization_id
     AND NEW.data BETWEEN pp.data_inicio AND pp.data_fim
     FOR SHARE;

  IF v_estado = 'fechado' THEN
    RAISE EXCEPTION 'folha_fechada' USING ERRCODE = 'HRA87',
      DETAIL = 'O dia ' || to_char(NEW.data, 'YYYY-MM-DD') || ' esta na folha fechada de '
               || to_char(v_ini, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD')
               || '; as horas extra desse dia ja nao mudam (corrigir por lancamento no periodo seguinte).';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_horas_extra_folha_fechada_guarda() IS
'INTERNA (trigger BEFORE INSERT OR UPDATE de pessoas_horas_extra). Com hr_horas_extra_config.aprovacao_conta_desde <= data da linha, recusa (folha_fechada, HRA87) quando a data esta numa folha fechada da organizacao. Le o interruptor com FOR KEY SHARE da linha de hr_horas_extra_config (serializa com rpc_hr_horas_extra_contagem_guardar) e toma FOR SHARE da folha desse dia antes de ler o estado (serializa com o fecho). Sem interruptor, ou antes da data: nao faz nada. Desde 20270111410000.';

CREATE TRIGGER trg_pessoas_horas_extra_folha_fechada
  BEFORE INSERT OR UPDATE ON public.pessoas_horas_extra
  FOR EACH ROW EXECUTE FUNCTION public.hr_horas_extra_folha_fechada_guarda();

REVOKE ALL ON FUNCTION public.hr_horas_extra_dia_fechado(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_folha_fechada_guarda() FROM PUBLIC, anon, authenticated, service_role;


-- ==============================================================================
-- 2. As trocas (CREATE OR REPLACE via pg_get_functiondef: mantem dono,
--    privilegios, SECURITY DEFINER, search_path e comentario)
-- ==============================================================================
DO $trocas$
DECLARE
  v_fn  text;
  v_def text;
  v_r   record;
BEGIN
  FOR v_fn IN SELECT DISTINCT t.fn FROM tmp_he_trocas t ORDER BY 1 LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_fn)::oid);
    FOR v_r IN SELECT * FROM tmp_he_trocas t WHERE t.fn = v_fn ORDER BY t.ordem LOOP
      v_def := replace(v_def, v_r.ancora, v_r.novo);
    END LOOP;
    EXECUTE v_def;
  END LOOP;
END;
$trocas$;

-- Os comentarios: o de cada funcao trocada ganha uma frase no fim.
DO $comentarios$
DECLARE
  v_r record;
BEGIN
  FOR v_r IN
    SELECT * FROM (VALUES
      ('public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
       ' Desde 20270111410000: se hr_horas_extra_config.aprovacao_conta_desde estiver preenchida e for <= data_fim do periodo, recusa com processamento_fechar_horas_extra_por_decidir (23514) enquanto houver horas extra pendentes de pessoas OBRIGATORIAS com data entre max(data_inicio, aprovacao_conta_desde) e data_fim, e com processamento_fechar_horas_extra_desactualizadas (23514) se algum resultado nao trouxer a chave horas_extra_assinatura ou ela nao for a assinatura actual das horas extra dessa pessoa no periodo (rpc_hr_horas_extra_assinaturas). Nao deteta horas extra. Sem essa data, ou com ela depois do periodo, igual a antes.'),
      ('public.hr_processamento_resultado_erro(jsonb)',
       ' Desde 20270111410000: aceita tambem o campo OPCIONAL horas_extra_assinatura (md5 ou null).'),
      ('public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid)',
       ' Desde 20270111410000: nao ve os dias em que a organizacao conta so as horas extra aprovadas e que estao numa folha fechada (hr_horas_extra_dia_fechado).')
    ) AS t(fn, extra)
  LOOP
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',
                   to_regprocedure(v_r.fn)::text,
                   coalesce(obj_description(to_regprocedure(v_r.fn)::oid, 'pg_proc'), '') || v_r.extra);
  END LOOP;
END;
$comentarios$;


-- ==============================================================================
-- 3. Conferir (estrutura, trocas, e comportamento na nike, desfeito)
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo   constant text := 'prova da migracao 20270111410000';
  k_fechar   constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
  v_novas    text[] := ARRAY['public.hr_horas_extra_dia_fechado(uuid, date)',
                             'public.hr_horas_extra_folha_fechada_guarda()'];
  v_fn       text;
  v_grant    text;
  v_n        integer;
  v_msg      text;
  v_st       text;
  v_j        jsonb;
  v_r        record;
  v_new      record;
  v_esperado text;
  v_base     jsonb;
  v_hoje     date;
  v_ult      date;
  v_ini      date;
  v_fim      date;
  v_d        date;
  v_uid      uuid;
  v_autor    uuid;
  v_uid2     uuid;
  v_autor2   uuid;
  v_p        uuid;
  v_q        uuid;
  v_per      uuid;
  v_he       uuid;
  v_he_q     uuid;
  v_regra_id uuid;
  v_payload  jsonb;
  v_payload_ok jsonb;
  v_s_antiga text;
  v_n_desvios integer;
  v_prova_q  text;
  v_prova_desvios text;
  v_prova_decisor text;
BEGIN
  -- 3.1 As internas novas: sem EXECUTE para ninguem, search_path vazio, nao definer.
  FOREACH v_fn IN ARRAY v_novas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid AND NOT p.prosecdef
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % devia ter search_path vazio e nao ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;

  -- 3.2 O trigger: ligado, BEFORE, por linha, em INSERT e UPDATE (nao DELETE).
  --     tgtype: 1 ROW, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = to_regclass('public.pessoas_horas_extra')
                    AND t.tgname::text = 'trg_pessoas_horas_extra_folha_fechada'
                    AND NOT t.tgisinternal AND t.tgenabled::text <> 'D'
                    AND t.tgfoid = to_regprocedure('public.hr_horas_extra_folha_fechada_guarda()')::oid
                    AND (t.tgtype::integer & 31) = 23) THEN
    RAISE EXCEPTION 'Conferir: trg_pessoas_horas_extra_folha_fechada devia estar ligado, BEFORE INSERT OR UPDATE, por linha.';
  END IF;

  -- 3.3 As trocas: corpo novo = corpo antigo com as trocas (sem \r); SECURITY
  --     DEFINER, search_path e privilegios iguais.
  FOR v_r IN SELECT * FROM tmp_he_antes ORDER BY fn LOOP
    v_esperado := v_r.prosrc;
    FOR v_new IN SELECT * FROM tmp_he_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_esperado := replace(v_esperado, v_new.ancora, v_new.novo);
    END LOOP;
    SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
           coalesce(p.proacl::text, '') AS proacl
      INTO v_new FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF replace(v_new.prosrc, chr(13), '') IS DISTINCT FROM replace(v_esperado, chr(13), '')
       OR v_new.prosecdef IS DISTINCT FROM v_r.prosecdef
       OR v_new.proconfig IS DISTINCT FROM v_r.proconfig
       OR v_new.proacl IS DISTINCT FROM v_r.proacl THEN
      RAISE EXCEPTION 'Conferir: % mudou mais do que as trocas (corpo, SECURITY DEFINER, search_path ou privilegios).', v_r.fn;
    END IF;
  END LOOP;
  -- E o fecho e o validador continuam a ser, sem as trocas, os de 20270110710000.
  SELECT replace(p.prosrc, chr(13), '') INTO v_esperado FROM pg_proc p WHERE p.oid = to_regprocedure(k_fechar)::oid;
  SELECT replace(v_esperado, replace(t.novo, chr(13), ''), t.ancora) INTO v_esperado
    FROM tmp_he_trocas t WHERE t.ordem = 1;
  IF v_esperado IS DISTINCT FROM (SELECT replace(a.corpo, chr(13), '') FROM tmp_he_fechar_antigo a) THEN
    RAISE EXCEPTION 'Conferir: sem o bloco das horas extra, o fecho devia ser o de 20270110710000.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_esperado
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_processamento_resultado_erro(jsonb)')::oid;
  FOR v_r IN SELECT * FROM tmp_he_trocas t WHERE t.ordem IN (2, 3) ORDER BY t.ordem DESC LOOP
    v_esperado := replace(v_esperado, replace(v_r.novo, chr(13), ''), v_r.ancora);
  END LOOP;
  IF v_esperado IS DISTINCT FROM (SELECT replace(a.corpo, chr(13), '') FROM tmp_he_erro_antigo a) THEN
    RAISE EXCEPTION 'Conferir: sem o campo horas_extra_assinatura, o validador devia ser o de 20270110710000.';
  END IF;

  -- 3.4 O fecho: uma so assinatura, definer, search_path vazio, EXECUTE so a authenticated.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_processamento_periodo_fechar') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                     WHERE p.oid = to_regprocedure(k_fechar)::oid AND p.prosecdef
                       AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Conferir: o fecho devia existir so como (uuid, jsonb), SECURITY DEFINER e search_path vazio.';
  END IF;
  SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',') INTO v_grant
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = to_regprocedure(k_fechar)::oid
     AND a.privilege_type::text = 'EXECUTE'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF coalesce(v_grant, '') IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Conferir: EXECUTE no fecho devia ser so "authenticated", e "%".', coalesce(v_grant, '');
  END IF;

  -- 3.5 O validador (puro): aceita horas_extra_assinatura md5/null/ausente,
  --     com ou sem desvios_assinatura; recusa o resto como antes.
  v_base := jsonb_build_object(
    'pessoa_id', gen_random_uuid(), 'valor_hora', 8, 'total_bruto', 1000,
    'totais', jsonb_build_object(
      'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
      'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
    'linhas', jsonb_build_array(), 'avisos', jsonb_build_array(),
    'retribuicao_id', NULL, 'cargo_periodo_id', NULL, 'regra_salarial_id', NULL);
  IF public.hr_processamento_resultado_erro(v_base) IS NOT NULL
     OR public.hr_processamento_resultado_erro(v_base || jsonb_build_object('horas_extra_assinatura', NULL)) IS NOT NULL
     OR public.hr_processamento_resultado_erro(v_base || jsonb_build_object('horas_extra_assinatura', md5('x'))) IS NOT NULL
     OR public.hr_processamento_resultado_erro(v_base || jsonb_build_object('horas_extra_assinatura', md5('x'),
                                                                           'desvios_assinatura', md5('y'))) IS NOT NULL
     OR coalesce(position('horas_extra_assinatura tem de ser'
                          IN public.hr_processamento_resultado_erro(v_base || jsonb_build_object('horas_extra_assinatura', 'xpto'))), 0) <> 1
     OR coalesce(position('horas_extra_assinatura tem de ser'
                          IN public.hr_processamento_resultado_erro(v_base || jsonb_build_object('horas_extra_assinatura', 12))), 0) <> 1
     OR coalesce(position('horas_extra_assinatura tem de ser'
                          IN public.hr_processamento_resultado_erro(v_base || jsonb_build_object('horas_extra_assinatura', upper(md5('x'))))), 0) <> 1
     OR coalesce(position('desvios_assinatura tem de ser'
                          IN public.hr_processamento_resultado_erro(v_base || jsonb_build_object('desvios_assinatura', 'xpto'))), 0) <> 1
     OR coalesce(position('campos desconhecidos'
                          IN public.hr_processamento_resultado_erro(v_base || jsonb_build_object('outro_campo', 1))), 0) <> 1
     OR coalesce(position('falta o campo'
                          IN public.hr_processamento_resultado_erro(v_base - 'avisos')), 0) <> 1 THEN
    RAISE EXCEPTION 'Conferir: o validador devia aceitar horas_extra_assinatura md5/null/ausente e continuar a recusar o resto.';
  END IF;

  -- 3.6 Comportamento na nike, com datas reais (registar so aceita os ultimos
  --     12 meses), DESFEITO no fim (sentinela HHE00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    v_hoje := public.hr_horas_extra_hoje();
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- Quem regista e fecha (gerir, view, gerir a folha) e quem decide (gerir,
    -- outro utilizador se houver). Toda a consulta leva a organizacao da nike.
    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.assiduidade.gerir, hr.assiduidade.view e hr.processamento.periodo.gerir.';
    END IF;
    SELECT au.auth_user_id, au.id INTO v_uid2, v_autor2
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND au.id <> v_autor
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid2 IS NULL THEN
      v_uid2 := v_uid;
      v_autor2 := v_autor;
      v_prova_decisor := 'o mesmo que registou (a nike so tem um utilizador activo com gerir)';
    ELSE
      v_prova_decisor := 'outro utilizador';
    END IF;

    -- Um intervalo fora de qualquer folha da nike, com um dia de teste ate
    -- ontem (hoje, se o intervalo comecar hoje).
    SELECT max(pp.data_fim) INTO v_ult FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike;
    v_ini := greatest(coalesce(v_ult + 1, make_date(extract(year FROM v_hoje)::integer, extract(month FROM v_hoje)::integer, 1)),
                      v_hoje - 300);
    IF v_ini > v_hoje THEN
      RAISE EXCEPTION 'Conferir: a nike ja tem folhas ate %; a prova precisa de um dia ate hoje fora de qualquer folha.', v_ult;
    END IF;
    v_fim := (make_date(extract(year FROM v_ini)::integer, extract(month FROM v_ini)::integer, 1)
              + interval '1 month' - interval '1 day')::date;
    IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
                WHERE pp.organization_id = k_nike
                  AND pp.ano = extract(year FROM v_fim)::integer AND pp.mes = extract(month FROM v_fim)::integer) THEN
      v_fim := (make_date(extract(year FROM v_ini)::integer, extract(month FROM v_ini)::integer, 1)
                + interval '2 months' - interval '1 day')::date;
    END IF;
    v_d := least(v_fim, v_hoje - 1);
    IF v_d < v_ini THEN
      v_d := v_hoje;
    END IF;
    -- Pendentes reais a partir do dia de teste bloqueariam o fecho com o
    -- interruptor ligado (e a prova deixaria de provar a assinatura).
    IF EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                WHERE x.organization_id = k_nike AND x.estado = 'pendente' AND x.data BETWEEN v_d AND v_fim) THEN
      RAISE EXCEPTION 'Conferir: a nike tem horas extra pendentes entre % e %; decidi-las antes de correr a prova.', v_d, v_fim;
    END IF;

    -- As obrigatorias do periodo de teste (o fecho exige o resultado de todas).
    CREATE TEMP TABLE tmp_he_obrigatorias ON COMMIT DROP AS
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL
       AND v.data_inicio <= v_fim AND (v.data_fim IS NULL OR v.data_fim >= v_ini)
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo';

    -- A pessoa de teste: obrigatoria, sem ligacao a quem regista ou decide, sem
    -- horas extra, planeado por data nem realizado no dia de teste.
    SELECT o.id INTO v_p
      FROM tmp_he_obrigatorias o
     WHERE NOT EXISTS (SELECT 1 FROM public.pessoas_contas pc
                        WHERE pc.pessoa_id = o.id AND pc.organization_id = k_nike
                          AND pc.anew_user_id IN (v_autor, v_autor2))
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                        WHERE x.pessoa_id = o.id AND x.organization_id = k_nike AND x.data = v_d)
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horario_planeado hp
                        WHERE hp.pessoa_id = o.id AND hp.organization_id = k_nike AND hp.data = v_d)
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horario_realizado hr
                        WHERE hr.pessoa_id = o.id AND hr.organization_id = k_nike AND hr.data = v_d)
     ORDER BY o.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike nao ha pessoa activa com vinculo entre % e %, sem ligacao aos utilizadores de teste e sem horas/horario a %.', v_ini, v_fim, v_d;
    END IF;

    -- Uma pessoa NAO obrigatoria (arquivada ou sem vinculo no periodo), para
    -- provar que a pendente dela nao bloqueia.
    SELECT p.id INTO v_q
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
       AND p.id NOT IN (SELECT o.id FROM tmp_he_obrigatorias o)
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_contas pc
                        WHERE pc.pessoa_id = p.id AND pc.organization_id = k_nike
                          AND pc.anew_user_id IN (v_autor, v_autor2))
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                        WHERE x.pessoa_id = p.id AND x.organization_id = k_nike AND x.data = v_d)
     ORDER BY p.id
     LIMIT 1;

    -- Desvios fora da prova: se houver margem em vigor no intervalo, desliga-se
    -- (versao NULL desde v_ini), para o bloco dos desvios do fecho nao recusar.
    SELECT count(*) INTO v_n_desvios FROM public.hr_desvios_config k WHERE k.organization_id = k_nike;
    IF EXISTS (SELECT 1 FROM public.hr_desvios_config k
                WHERE k.organization_id = k_nike AND k.substituida_em IS NULL AND k.margem_min IS NOT NULL
                  AND k.valido_de <= v_fim AND (k.valido_ate IS NULL OR k.valido_ate >= v_ini)) THEN
      BEGIN
        PERFORM public.hr_desvios_config_guardar_core(k_nike, v_ini, NULL, v_autor);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Conferir: a nike tem margem de desvios em vigor entre % e % e a prova nao a conseguiu desligar (%).', v_ini, v_fim, SQLERRM;
      END;
      v_prova_desvios := 'margem dos desvios desligada na prova a partir de ' || to_char(v_ini, 'YYYY-MM-DD');
    ELSE
      v_prova_desvios := 'sem margem dos desvios no intervalo';
    END IF;

    -- Folha de teste aberta; planeado 09:00-18:00 e realizado 09:00-20:00 no
    -- dia de teste (a deteccao veria 18:00-20:00).
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim, transicao)
    VALUES (k_nike, extract(year FROM v_fim)::integer, extract(month FROM v_fim)::integer, 'aberto', v_ini, v_fim, true)
    RETURNING id INTO v_per;
    -- So para a prova (tudo desfeito no fim): o trigger do planeado recusa
    -- insercao directa em dias ja decorridos. session_replication_role =
    -- replica desliga os triggers so nesta sessao, so em volta destas duas
    -- linhas, sem lock de tabela (revisao M4: ALTER TABLE ... DISABLE TRIGGER
    -- trancava a tabela para todas as organizacoes durante o push).
    SET LOCAL session_replication_role = replica;
    INSERT INTO public.pessoas_horario_planeado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, v_d, TIME '09:00', TIME '18:00');
    INSERT INTO public.pessoas_horario_realizado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, v_d, TIME '09:00', TIME '20:00');
    SET LOCAL session_replication_role = origin;

    -- a) Uma hora extra pendente de v_p (e de v_q, se houver), registada.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_hora_extra_registar(k_nike, v_p, v_d, TIME '21:00', TIME '22:00', k_motivo);
    v_he := (v_j ->> 'id')::uuid;
    IF v_he IS NULL THEN
      RAISE EXCEPTION 'Conferir: registar a hora extra de teste devia devolver o id; deu %.', v_j::text;
    END IF;
    IF v_q IS NULL THEN
      v_prova_q := 'nao provado: na nike nao ha pessoa nao obrigatoria no periodo de teste';
    ELSE
      BEGIN
        v_he_q := (public.rpc_hr_hora_extra_registar(k_nike, v_q, v_d, TIME '21:00', TIME '22:00', k_motivo) ->> 'id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_he_q := NULL;
        v_prova_q := 'nao provado: registar a pessoa nao obrigatoria falhou (' || SQLSTATE || ')';
      END;
    END IF;

    -- b) Antes de fechar, a deteccao criaria uma hora extra nesse dia
    --    (subtransaccao desfeita, HHE02).
    BEGIN
      v_j := public.rpc_hr_horas_extra_detetar(k_nike, v_d, v_d, v_p);
      IF (v_j ->> 'criadas')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Conferir: com a folha aberta a deteccao de % devia criar 1 hora extra (realizado 09:00-20:00 contra 09:00-18:00); deu %.', v_d, v_j::text;
      END IF;
      RAISE EXCEPTION 'detecao_ok' USING ERRCODE = 'HHE02';
    EXCEPTION
      WHEN SQLSTATE 'HHE02' THEN NULL;
    END;

    -- O resultado minimo de cada obrigatoria.
    v_regra_id := (public.hr_regras_salariais_em(k_nike, v_fim) ->> 'id')::uuid;
    SELECT jsonb_agg(jsonb_build_object(
             'pessoa_id', o.id, 'valor_hora', 8, 'total_bruto', 1000,
             'totais', jsonb_build_object(
               'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
               'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
             'linhas', jsonb_build_array(),
             'avisos', jsonb_build_array(),
             'retribuicao_id', NULL, 'cargo_periodo_id', NULL,
             'regra_salarial_id', v_regra_id) ORDER BY o.id)
      INTO v_payload
      FROM tmp_he_obrigatorias o;

    -- c) INTERRUPTOR DESLIGADO = como hoje (subtransaccao desfeita, HHE01): o
    --    fecho passa com uma pendente, sem a chave na pessoa de teste e com
    --    assinaturas que nao batem nas outras (ignoradas); depois, registar num dia da folha fechada e aceite e
    --    o dia nao conta como fechado; ligar o interruptor sobre ela e recusado.
    BEGIN
      SELECT jsonb_agg(CASE WHEN (e.value ->> 'pessoa_id')::uuid = v_p THEN e.value
                            ELSE e.value || jsonb_build_object('horas_extra_assinatura', md5('ignorada com o interruptor desligado'))
                       END ORDER BY e.ord)
        INTO v_payload_ok
        FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord);
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload_ok);
      IF (SELECT pp.estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per) IS DISTINCT FROM 'fechado' THEN
        RAISE EXCEPTION 'Conferir: com o interruptor desligado o fecho devia passar com uma hora extra pendente.';
      END IF;
      IF public.hr_horas_extra_dia_fechado(k_nike, v_d) THEN
        RAISE EXCEPTION 'Conferir: com o interruptor desligado nenhum dia devia contar como fechado para as horas extra.';
      END IF;
      v_j := public.rpc_hr_hora_extra_registar(k_nike, v_p, v_d, TIME '22:30', TIME '23:30', k_motivo);
      IF (v_j ->> 'id') IS NULL THEN
        RAISE EXCEPTION 'Conferir: com o interruptor desligado registar numa folha fechada devia ser aceite (como hoje); deu %.', v_j::text;
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM 'HRA87' THEN
        RAISE EXCEPTION 'Conferir: ligar o interruptor sobre a folha fechada devia dar HRA87 (deu %).', coalesce(v_st, 'aceite');
      END IF;
      RAISE EXCEPTION 'desligado_ok' USING ERRCODE = 'HHE01';
    EXCEPTION
      WHEN SQLSTATE 'HHE01' THEN NULL;
    END;
    IF (SELECT pp.estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per) IS DISTINCT FROM 'aberto' THEN
      RAISE EXCEPTION 'Conferir: a subtransaccao do interruptor desligado devia ter sido desfeita.';
    END IF;

    -- d) Ligar o interruptor no dia de teste (folha ainda aberta).
    v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
    IF (v_j ->> 'alterada')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'Conferir: ligar o interruptor a % devia gravar; deu %.', v_d, v_j::text;
    END IF;
    IF public.hr_horas_extra_dia_fechado(k_nike, v_d) THEN
      RAISE EXCEPTION 'Conferir: com a folha aberta o dia de teste nao devia contar como fechado.';
    END IF;

    -- e) Com uma pendente de uma obrigatoria, o fecho recusa.
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_horas_extra_por_decidir' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: fechar com uma hora extra pendente devia dar processamento_fechar_horas_extra_por_decidir; deu: %.', coalesce(v_msg, 'aceite');
    END IF;

    -- f) A assinatura antes de decidir; decidir (confirmar) com o decisor.
    SELECT s.assinatura INTO v_s_antiga FROM public.rpc_hr_horas_extra_assinaturas(v_per) AS s WHERE s.pessoa_id = v_p;
    IF v_s_antiga IS NULL THEN
      RAISE EXCEPTION 'Conferir: a pessoa de teste devia ter assinatura de horas extra no periodo.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_hora_extra_decidir(v_he, k_nike, 'confirmar', k_motivo);
    IF (v_j ->> 'estado') IS DISTINCT FROM 'confirmada' THEN
      RAISE EXCEPTION 'Conferir: confirmar a hora extra de teste devia dar confirmada; deu %.', v_j::text;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- g) Sem o campo, ou com a assinatura de antes de decidir: desactualizadas.
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_horas_extra_desactualizadas' IN v_msg), 0) <> 1
       OR coalesce(position('recarregar' IN v_msg), 0) = 0 THEN
      RAISE EXCEPTION 'Conferir: fechar sem a chave horas_extra_assinatura devia dar processamento_fechar_horas_extra_desactualizadas a mandar recarregar; deu: %.', coalesce(v_msg, 'aceite');
    END IF;
    SELECT jsonb_agg(e.value || jsonb_build_object('horas_extra_assinatura', NULL) ORDER BY e.ord)
      INTO v_payload_ok
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload_ok);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_horas_extra_desactualizadas' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: com o interruptor ligado, horas_extra_assinatura null devia ser recusado (processamento_fechar_horas_extra_desactualizadas); deu: %.', coalesce(v_msg, 'aceite');
    END IF;
    SELECT jsonb_agg(e.value || jsonb_build_object('horas_extra_assinatura',
                       CASE WHEN (e.value ->> 'pessoa_id')::uuid = v_p THEN v_s_antiga ELSE s.assinatura END)
                     ORDER BY e.ord)
      INTO v_payload_ok
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)
      LEFT JOIN public.rpc_hr_horas_extra_assinaturas(v_per) AS s ON s.pessoa_id = (e.value ->> 'pessoa_id')::uuid;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload_ok);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_horas_extra_desactualizadas' IN v_msg), 0) <> 1
       OR coalesce(position(v_p::text IN v_msg), 0) = 0 THEN
      RAISE EXCEPTION 'Conferir: fechar com a assinatura de antes da decisao devia dar processamento_fechar_horas_extra_desactualizadas da pessoa de teste; deu: %.', coalesce(v_msg, 'aceite');
    END IF;

    -- h) Com a assinatura de cada pessoa (null para quem nao tem): fecha, mesmo
    --    com a pendente da pessoa nao obrigatoria.
    SELECT jsonb_agg(e.value || jsonb_build_object('horas_extra_assinatura', s.assinatura) ORDER BY e.ord)
      INTO v_payload_ok
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)
      LEFT JOIN public.rpc_hr_horas_extra_assinaturas(v_per) AS s ON s.pessoa_id = (e.value ->> 'pessoa_id')::uuid;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload_ok) AS e(value)
                WHERE (e.value ->> 'horas_extra_assinatura') IS NULL) THEN
      RAISE EXCEPTION 'Conferir: com o interruptor ligado nenhuma obrigatoria devia ficar sem assinatura (tambem quem nao tem horas extra).';
    END IF;
    PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload_ok);
    IF (SELECT pp.estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per) IS DISTINCT FROM 'fechado' THEN
      RAISE EXCEPTION 'Conferir: com as pendentes decididas e as assinaturas certas o fecho devia passar.';
    END IF;
    IF v_he_q IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.pessoas_horas_extra x WHERE x.id = v_he_q AND x.estado = 'pendente') THEN
        RAISE EXCEPTION 'Conferir: a hora extra pendente da pessoa nao obrigatoria devia ter ficado pendente.';
      END IF;
      v_prova_q := 'provado';
    END IF;

    -- i) Folha fechada com o interruptor ligado: registar recusado, escrever
    --    como dono recusado, decidir recusado; a deteccao salta o dia (sem
    --    erro e sem criar), e o dia anterior ao interruptor nao conta.
    IF NOT public.hr_horas_extra_dia_fechado(k_nike, v_d) THEN
      RAISE EXCEPTION 'Conferir: depois do fecho, com o interruptor ligado, o dia de teste devia contar como fechado.';
    END IF;
    IF v_d > v_ini AND public.hr_horas_extra_dia_fechado(k_nike, v_d - 1) THEN
      RAISE EXCEPTION 'Conferir: o dia antes do interruptor nao devia contar como fechado para as horas extra.';
    END IF;
    v_st := NULL;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_hora_extra_registar(k_nike, v_p, v_d, TIME '22:30', TIME '23:30', k_motivo);
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE; v_msg := SQLERRM;
    END;
    IF v_st IS DISTINCT FROM 'HRA87' OR v_msg IS DISTINCT FROM 'folha_fechada' THEN
      RAISE EXCEPTION 'Conferir: registar numa folha fechada com o interruptor ligado devia dar folha_fechada HRA87 (deu % %).', coalesce(v_st, 'aceite'), coalesce(v_msg, '');
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    v_st := NULL;
    BEGIN
      INSERT INTO public.pessoas_horas_extra
        (organization_id, pessoa_id, data, hora_inicio, hora_fim, minutos, origem, tipo_registo, motivo_origem)
      VALUES (k_nike, v_p, v_d, TIME '23:00', TIME '23:30', 30, 'diaria', 'registada', k_motivo);
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HRA87' THEN
      RAISE EXCEPTION 'Conferir: escrever como dono numa folha fechada devia dar HRA87 (deu %).', coalesce(v_st, 'aceite');
    END IF;
    IF v_he_q IS NOT NULL THEN
      PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_hora_extra_decidir(v_he_q, k_nike, 'rejeitar', k_motivo);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM 'HRA87' THEN
        RAISE EXCEPTION 'Conferir: decidir uma pendente numa folha fechada devia dar HRA87 (deu %).', coalesce(v_st, 'aceite');
      END IF;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_horas_extra_detetar(k_nike, v_d, v_d, v_p);
    IF (v_j ->> 'criadas')::integer IS DISTINCT FROM 0 OR (v_j ->> 'atualizadas')::integer IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'Conferir: depois do fecho a deteccao devia saltar o dia de teste; deu %.', v_j::text;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir: prova na nike entre % e % (dia %); decisor: %; pessoa nao obrigatoria nao bloqueia: %; desvios: %.',
      v_ini, v_fim, v_d, v_prova_decisor, coalesce(v_prova_q, '?'), v_prova_desvios;
    RAISE EXCEPTION 'teste_horas_extra_fecho_ok' USING ERRCODE = 'HHE00';
  EXCEPTION
    WHEN SQLSTATE 'HHE00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.hr_horas_extra_config c WHERE c.aprovacao_conta_desde IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.pessoas_horas_extra x WHERE x.motivo_origem = k_motivo)
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.id = v_per)
     OR EXISTS (SELECT 1 FROM public.pessoas_horario_planeado hp
                 WHERE hp.pessoa_id = v_p AND hp.organization_id = k_nike AND hp.data = v_d)
     OR EXISTS (SELECT 1 FROM public.pessoas_horario_realizado hr
                 WHERE hr.pessoa_id = v_p AND hr.organization_id = k_nike AND hr.data = v_d)
     OR (SELECT count(*) FROM public.hr_desvios_config k WHERE k.organization_id = k_nike) IS DISTINCT FROM v_n_desvios THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: fecho = corpo de 20270110710000 + bloco das horas extra; validador = o de 20270110710000 + horas_extra_assinatura; deteccao = corpo anterior + salto dos dias fechados. Interruptor desligado: fecho passa com pendente e assinatura ignorada, registar em folha fechada aceite. Ligado: pendente de obrigatoria recusa, chave em falta (manda recarregar), null ou assinatura antiga recusa, certa fecha (nenhuma assinatura NULL); depois do fecho registar, escrever como dono e decidir dao HRA87 e a deteccao salta o dia.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so
--    20270111400000 e este, acima de 20270110710000.
-- 2. Prova na nike ANTES do push: correr os dois ficheiros numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo); as guardas confirmam os
--    corpos do fecho e do validador no remoto e a ancora da deteccao, o
--    conferir prova o resto (NOTICE com o intervalo e o que ficou por provar).
-- 3. Cliente (E3 a E5) publicado ANTES de alguem ligar o interruptor: o fecho
--    passa a poder recusar com as duas mensagens novas.
-- ==============================================================================
