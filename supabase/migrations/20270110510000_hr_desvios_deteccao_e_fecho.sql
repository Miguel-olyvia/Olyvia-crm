-- ==============================================================================
-- Desvios de horario e de tempo (ENTREGA E3 do plano de desvios): a tabela
-- pessoas_desvios, a deteccao em lote, a validacao, e o fecho da folha que
-- recusa enquanto houver dias por validar.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth):
-- pendentes so 20270110500000 (a configuracao, de que esta depende) e este,
-- acima de 20270109900000; (2) correr a prova na nike em transaccao desfeita
-- ANTES do push (o conferir abaixo e essa prova); (3) revisao
-- ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO para nada partir. Enquanto nenhuma organizacao tiver margem configurada
-- (20270110500000 nasce sem nenhuma), a deteccao nao cria nada e o fecho da
-- folha faz exactamente o que fazia. O cliente (E5-E7: relatorio, fila,
-- traducao do erro do fecho) so e preciso para USAR a funcionalidade. Se
-- alguem gravar uma margem antes do cliente E7 estar publicado, o fecho
-- passa a poder recusar com processamento_fechar_desvios_por_validar ou
-- processamento_fechar_desvios_desactualizados sem traducao no ecra.
-- Com margem em vigor, o cliente tem de: chamar rpc_hr_desvios_detetar para o
-- periodo, validar os dias a_validar, ler rpc_hr_desvios_assinaturas, e
-- enviar em cada resultado desvios_assinatura (a da pessoa, ou null). Sem
-- margem pode omitir o campo.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. pessoas_desvios: uma VERSAO por pessoa e dia com desvio. Medidas do dia
--    (plano 1.3), em minutos, com o planeado e o realizado JA SEM as faltas
--    em vigor (v_hr_faltas_em_vigor, por intervalo):
--      fora      = realizado fora das janelas planeadas
--      em_falta  = janelas planeadas nao cobertas pelo realizado
--      diferenca = realizado - planeado (com sinal)
--      desvio_horario = min(fora, em_falta)   (D5: acumulado do dia)
--    Ha desvio quando |diferenca| > margem OU desvio_horario > margem (igual
--    nao e desvio). So se mede quando planeado > 0 e realizado > 0.
--    Exemplo: planeado 09:00-18:00, realizado 09:30-18:30: fora 30, em falta
--    30, diferenca 0, desvio de horario 30.
--    Fora dos desvios: dias sem margem em vigor (sem versao, ou versao com
--    margem NULL = "sem margem"), feriados que contam para a pessoa
--    (politica_feriados do vinculo em vigor nessa data <> trabalho_habitual;
--    sem vinculo, conta como nas horas extra: nao_laboral) e
--    dias de descanso ou sem horario (D4), vinculos com isencao de horario,
--    e dias com ausencia APROVADA (ver LACUNA abaixo).
--    estado a_validar | validado | substituido; decisao normal | hora_extra |
--    aceitar_desvio. Uma so versao nao substituida por (pessoa, dia): restricao
--    de exclusao btree, PARCIAL e DEFERRABLE INITIALLY IMMEDIATE (o plano
--    pede um indice unico parcial; a exclusao e o mesmo invariante, mas
--    verificado no FIM da instrucao, o que deixa a deteccao substituir e
--    inserir numa so instrucao sem depender da ordem das CTEs).
--    CHECKs: medidas coerentes, fora da margem, a_validar sem autor, validado
--    com autor e momento, hora_extra so com diferenca > margem, aceitar_desvio
--    com motivo (3..500).
--    Imutavel (trigger): INSERT so a_validar; UPDATE so a_validar -> validado
--    ou a_validar/validado -> substituido, sem mexer nas medidas; INSERT e
--    UPDATE recusados quando a data cai numa folha FECHADA; DELETE e TRUNCATE
--    sempre recusados. decidido_por SEM FK, de proposito (um SET NULL seria
--    um UPDATE que o trigger recusa; mesmo desenho de
--    hr_processamento_resultados.fechado_por). FK RESTRICT para a pessoa:
--    apagar fisicamente uma pessoa com desvios passa a ser recusado.
--    RLS FORCADA e SEM PRIVILEGIOS para authenticated: le-se so pelas RPCs
--    (rpc_hr_desvios_listar, rpc_hr_desvios_assinaturas). A politica de
--    SELECT (hr.assiduidade.view, ou view.own a propria ficha, via
--    hr_desvios_pode_ler) fica como defesa em profundidade, para o dia em que
--    alguem conceda SELECT. Sem politicas nem privilegios de escrita.
--
-- 2. hr_desvios_intervalos_esperados(org, pessoa, data) -> (modo,
--    tipo_horario, janelas, motivo): o ponto de extensao dos tipos de
--    horario. Hoje: sem_desvios para quem tem vinculo com isencao_horario em
--    vigor na data; padrao para os restantes (janelas = hr_horas_extra_dia,
--    com excepcoes por data e linhas corrigidas tratadas como la). Os tipos
--    livre/banco_horas/repartido nao existem na base: o ramo nao_definido
--    fica previsto no CHECK e no comentario, nao inventado.
--
-- 3. hr_desvios_detetar_core(org, de, ate, pessoa): numa so instrucao sobre o
--    conjunto (CTEs; nenhum ciclo por pessoa ou dia), para os dias com
--    realizado em vigor ou com versao em vigor, fora das folhas fechadas:
--    dia sem desvio -> a versao em vigor fica substituida; desvio novo ->
--    a_validar; assinatura (md5 dos intervalos planeados e realizados, em
--    segundos desde a meia-noite, independente do DateStyle) diferente da
--    versao em vigor -> substitui-a, mesmo validada, e cria outra a_validar
--    com substitui_id. Uma deteccao de cada vez por organizacao (lock).
--
-- 4. RPCs (authenticated, SECURITY DEFINER, search_path vazio):
--    rpc_hr_desvios_detetar(p_organization_id uuid, p_data_de date,
--      p_data_ate date, p_pessoa_id uuid DEFAULT NULL) RETURNS jsonb
--      hr.assiduidade.gerir; ate e cortado a hoje (Lisboa); tectos 31 dias
--      por organizacao, 62 por pessoa; uma de cada vez por organizacao (sem
--      esperar: desvios_detecao_em_curso).
--    rpc_hr_desvios_listar(p_organization_id uuid, p_estado text DEFAULT
--      'a_validar', p_data_de date DEFAULT NULL, p_data_ate date DEFAULT NULL,
--      p_pessoa_id uuid DEFAULT NULL) RETURNS TABLE (...)
--      hr.assiduidade.view (todas) ou view.own (a sua); p_estado NULL = todos;
--      ate 5000 linhas por data. O motivo so vai a quem tem
--      hr.assiduidade.gerir ou e a propria pessoa (ficha ligada, activa); aos
--      outros vai NULL.
--    rpc_hr_desvios_assinaturas(p_periodo_id uuid) RETURNS TABLE (pessoa_id
--      uuid, assinatura text)
--      hr.processamento.periodo.gerir ou hr.assiduidade.gerir na organizacao
--      do periodo. Por pessoa com desvios em vigor (nao substituidos) no
--      periodo: md5 de string_agg(data 'YYYY-MM-DD' || ':' || estado || ':'
--      || decisao (ou ''), ',' por data). Pessoa sem desvios: nao vem (o
--      cliente envia null). A data vai por to_char e nao por ::text, para nao
--      depender do DateStyle da sessao.
--    rpc_hr_desvio_validar(p_desvio_id uuid, p_decisao text, p_motivo text
--      DEFAULT NULL) RETURNS jsonb
--      hr.assiduidade.gerir; ninguem valida os proprios desvios (ligacao em
--      pessoas_contas, activa ou revogada: hr_horas_extra_e_propria); so
--      versoes a_validar; aceitar_desvio exige motivo; hora_extra so com
--      diferenca > margem. Devolve contado_min e extra_min (plano 1.4).
--
-- 5. rpc_hr_processamento_periodo_fechar(uuid, jsonb): CREATE OR REPLACE na
--    MESMA assinatura. O corpo e o de 20270109900000 letra a letra (guarda
--    md5 abaixo, sem \r dos dois lados), com o bloco comentado dos desvios
--    trocado por um bloco activo. Se houver margem (nao NULL) em vigor em
--    algum dia do periodo:
--      a) detecta o periodo inteiro;
--      b) recusa com processamento_fechar_desvios_por_validar (23514) se
--         ficar algum dia a_validar de uma pessoa OBRIGATORIA do periodo
--         (activa com vinculo sobreposto, a mesma regra do resto do fecho);
--         arquivadas e pessoas sem vinculo no periodo nao bloqueiam;
--      c) recalcula a assinatura dos desvios de cada pessoa da lista e recusa
--         com processamento_fechar_desvios_desactualizados (23514) se nao for
--         igual a desvios_assinatura enviada (as decisoes mudaram desde o
--         calculo).
--    ATENCAO: uma recusa desfaz a deteccao feita dentro do fecho. O cliente
--    tem de chamar rpc_hr_desvios_detetar ANTES de fechar, validar, ler
--    rpc_hr_desvios_assinaturas, calcular e so entao fechar; a mensagem diz
--    isso. Sem margem em vigor no periodo: igual a hoje (desvios_assinatura
--    e ignorada). Mantem todas as guardas, mensagens, SECURITY DEFINER,
--    search_path vazio e EXECUTE so para authenticated (o conferir prova que
--    so o bloco mudou).
--
-- 6. hr_processamento_resultado_erro(jsonb): CREATE OR REPLACE (guarda md5
--    do corpo de 20270109900000). Cada objecto de p_resultados passa a
--    aceitar UM campo OPCIONAL a mais, desvios_assinatura: string md5 (32
--    hexadecimais minusculos) ou null. Os nove campos obrigatorios e o resto
--    da validacao ficam iguais; qualquer outro campo continua a ser recusado.
--    Formato final de cada objecto:
--      pessoa_id, valor_hora, total_bruto, totais, linhas, avisos,
--      retribuicao_id, cargo_periodo_id, regra_salarial_id   (obrigatorios)
--      desvios_assinatura                                     (opcional)
--
--
-- -- LACUNA ASSUMIDA ----------------------------------------------------------
--
-- pessoas_ausencias_dias nao tem horas (so fraccao_dia e minutos). Uma
-- ausencia parcial aprovada nao se consegue tirar do planeado por intervalo:
-- o dia com QUALQUER ausencia aprovada fica fora dos desvios (como
-- hr_assiduidade_desvios ja faz). Perde-se a deteccao nesses dias; nao se
-- inventa um tempo a menos que a ausencia explica.
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Nada enquanto nao gravarem uma margem: sem deteccao e o fecho igual. Depois
-- de gravarem, o fecho passa a recusar enquanto houver dias por validar.
-- Mudelar nao esta nesta base.
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   desvios_sem_sessao / _sem_permissao / _sem_utilizador (42501)
--   desvio_sem_sessao / _sem_permissao / _sem_utilizador (42501)
--   desvio_validar_proprio (42501)
--   desvios_data_invalida / _intervalo_excedido / _estado_invalido /
--   _pessoa_invalida / _dados_invalidos (22023)
--   desvios_detecao_em_curso (55P03)
--   desvio_decisao_invalida (22023)
--   desvio_motivo_obrigatorio (23502)
--   desvio_nao_esta_a_validar / desvio_hora_extra_sem_tempo_a_mais (23514)
--   motivo_invalido (HRA82, de hr_horas_extra_texto)
--   pessoas_desvios_imutavel / pessoas_desvios_periodo_fechado (22000)
--   processamento_fechar_desvios_por_validar (23514)
--   processamento_fechar_desvios_desactualizados (23514)
--   desvios_fora_de_transaccao (25000)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor os
-- corpos de rpc_hr_processamento_periodo_fechar(uuid, jsonb) e de
-- hr_processamento_resultado_erro(jsonb) de 20270109900000 (o bloco
-- comentado; sem desvios_assinatura), largar as RPCs e funcoes desta migration e, so depois
-- de exportar e de largar os triggers, pessoas_desvios.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'desvios_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- O corpo do validador de resultados em vigor (20270109900000) -----------
CREATE TEMP TABLE tmp_dv_erro_antigo (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_dv_erro_antigo (corpo) VALUES ($old$
DECLARE
  k_chaves  constant text[] := ARRAY['pessoa_id', 'valor_hora', 'total_bruto', 'totais', 'linhas', 'avisos',
                                     'retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id'];
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
   WHERE k.chave <> ALL (k_chaves);
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

-- ---- O corpo do fecho em vigor (20270109900000), para a guarda md5 -----------
CREATE TEMP TABLE tmp_dv_fechar_antigo (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_dv_fechar_antigo (corpo) VALUES ($old$
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

  -- ---- Desvios por validar (PREPARADO, DESLIGADO) -----------------------------
  -- A tabela dos desvios chega na entrega seguinte. Quando existir, descomentar
  -- (ajustando o nome da tabela e o estado) NA MESMA migration que a cria:
  --
  -- IF EXISTS (SELECT 1 FROM public.hr_processamento_desvios d
  --             WHERE d.periodo_id = v_periodo.id
  --               AND d.organization_id = v_periodo.organization_id
  --               AND d.estado = 'por_validar') THEN
  --   RAISE EXCEPTION 'processamento_fechar_desvios_por_validar: ha desvios por validar neste periodo; validar ou recusar cada um antes de fechar.'
  --     USING ERRCODE = '23514';
  -- END IF;

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

-- ---- O bloco antigo (comentado) e o novo (activo), para a guarda e o conferir --
CREATE TEMP TABLE tmp_dv_blocos (antigo text NOT NULL, novo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_dv_blocos (antigo, novo) VALUES (
$blk$  -- ---- Desvios por validar (PREPARADO, DESLIGADO) -----------------------------
  -- A tabela dos desvios chega na entrega seguinte. Quando existir, descomentar
  -- (ajustando o nome da tabela e o estado) NA MESMA migration que a cria:
  --
  -- IF EXISTS (SELECT 1 FROM public.hr_processamento_desvios d
  --             WHERE d.periodo_id = v_periodo.id
  --               AND d.organization_id = v_periodo.organization_id
  --               AND d.estado = 'por_validar') THEN
  --   RAISE EXCEPTION 'processamento_fechar_desvios_por_validar: ha desvios por validar neste periodo; validar ou recusar cada um antes de fechar.'
  --     USING ERRCODE = '23514';
  -- END IF;$blk$,
$blk$  -- ---- Desvios por validar (ligado em 20270110510000) ------------------------
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
  END;$blk$);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista  text;
  v_n      integer;
  v_cod    text;
  v_src    text;
  v_antigo text;
  v_bloco  text;
  k_fechar constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
BEGIN
  -- G0. Quem aplica passa a RLS (tabela FORCE; as RPCs definer correm como o dono).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam nem gravariam.', current_user::text;
  END IF;

  -- G1. Nomes novos livres.
  IF to_regclass('public.pessoas_desvios') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: public.pessoas_desvios ja existe. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_desvios_minutos', 'hr_desvios_medir', 'hr_desvios_natureza',
                             'hr_desvios_assinatura', 'hr_desvios_intervalos_esperados',
                             'hr_desvios_detetar_core', 'hr_desvios_pode_ler', 'hr_pessoas_desvios_guarda',
                             'hr_desvios_assinaturas_periodo', 'rpc_hr_desvios_assinaturas',
                             'rpc_hr_desvios_detetar', 'rpc_hr_desvios_listar', 'rpc_hr_desvio_validar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;

  -- G2. Permissoes usadas (nenhuma e criada).
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.view', 'hr.assiduidade.view.own', 'hr.assiduidade.gerir',
                               'hr.processamento.periodo.gerir'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G2: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G3. Suporte: a configuracao (20270110500000), as funcoes das horas extra
  --     (20270104800000) e as vistas e colunas que a deteccao le.
  IF to_regclass('public.hr_desvios_config') IS NULL
     OR to_regprocedure('public.hr_desvios_config_guardar_core(uuid, date, integer, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G3: falta hr_desvios_config ou hr_desvios_config_guardar_core (aplicar 20270110500000 antes).';
  END IF;
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_horas_extra_dia(uuid, uuid, date)',
                      'public.hr_horas_extra_fim(time)',
                      'public.hr_horas_extra_feriados(uuid, date, date)',
                      'public.hr_horas_extra_e_propria(uuid, uuid)',
                      'public.hr_horas_extra_ambito_leitura(uuid, uuid)',
                      'public.hr_horas_extra_texto(text, integer)',
                      'public.hr_pessoa_do_utilizador(uuid, uuid)',
                      'public.hr_regras_salariais_em(uuid, date)',
                      'public.hr_processamento_resultado_erro(jsonb)']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: faltam funcoes: %.', v_lista;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.hr_horas_extra_dia(uuid, uuid, date)')::oid
                    AND 'janelas' = ANY (p.proargnames) AND 'tem_horario' = ANY (p.proargnames)) THEN
    RAISE EXCEPTION 'G3: hr_horas_extra_dia ja nao devolve janelas/tem_horario.';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('v_hr_horario_realizado_em_vigor', 'organization_id'), ('v_hr_horario_realizado_em_vigor', 'pessoa_id'),
                 ('v_hr_horario_realizado_em_vigor', 'data'), ('v_hr_horario_realizado_em_vigor', 'hora_inicio'),
                 ('v_hr_horario_realizado_em_vigor', 'hora_fim'),
                 ('v_hr_faltas_em_vigor', 'organization_id'), ('v_hr_faltas_em_vigor', 'pessoa_id'),
                 ('v_hr_faltas_em_vigor', 'data'), ('v_hr_faltas_em_vigor', 'hora_inicio'), ('v_hr_faltas_em_vigor', 'hora_fim'),
                 ('pessoas_ausencias_dias', 'organization_id'), ('pessoas_ausencias_dias', 'pessoa_id'),
                 ('pessoas_ausencias_dias', 'data'), ('pessoas_ausencias_dias', 'estado'),
                 ('pessoas_vinculos', 'organization_id'), ('pessoas_vinculos', 'pessoa_id'),
                 ('pessoas_vinculos', 'isencao_horario'), ('pessoas_vinculos', 'data_inicio'),
                 ('pessoas_vinculos', 'data_fim'), ('pessoas_vinculos', 'deleted_at'),
                 ('pessoas_vinculos', 'politica_feriados'),
                 ('pessoas', 'deleted_at'), ('pessoas', 'estado_registo'),
                 ('pessoas_horario_planeado', 'data'), ('pessoas_horario_planeado', 'hora_inicio'),
                 ('pessoas_horario_realizado', 'data'), ('pessoas_horario_realizado', 'hora_inicio'),
                 ('hr_periodos_processamento', 'estado'), ('hr_periodos_processamento', 'data_inicio'),
                 ('hr_periodos_processamento', 'data_fim'),
                 ('pessoas_contas', 'anew_user_id'), ('pessoas_contas', 'estado'), ('pessoas_contas', 'revogada_em'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 33 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas nas vistas e tabelas de assiduidade (% de 33).', v_n;
  END IF;
  IF to_regtype('tsmultirange') IS NULL THEN
    RAISE EXCEPTION 'G3: o tipo tsmultirange nao existe (precisa de PostgreSQL 14 ou mais).';
  END IF;

  -- G4. O fecho: UMA so assinatura (uuid, jsonb), SECURITY DEFINER com
  --     search_path vazio, e o corpo e o de 20270109900000 (md5 sem \r dos
  --     dois lados), com o bloco comentado dos desvios uma so vez.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_processamento_periodo_fechar';
  IF v_n <> 1 OR to_regprocedure(k_fechar) IS NULL THEN
    RAISE EXCEPTION 'G4: rpc_hr_processamento_periodo_fechar devia existir so como (uuid, jsonb); ha % assinatura(s).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_fechar)::oid AND p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'G4: o fecho deixou de ser SECURITY DEFINER com search_path vazio. Reler.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(k_fechar)::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_dv_fechar_antigo t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G4: o corpo do fecho no remoto (md5 sem \r %) nao e o de 20270109900000 transcrito aqui (md5 %). Reler a versao mais recente antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;
  SELECT replace(b.antigo, chr(13), '') INTO v_bloco FROM tmp_dv_blocos b;
  IF (length(v_src) - length(replace(v_src, v_bloco, ''))) / length(v_bloco) <> 1 THEN
    RAISE EXCEPTION 'G4: o bloco comentado dos desvios nao aparece uma so vez no corpo do fecho.';
  END IF;

  -- G6. O validador de cada resultado: assinatura (jsonb), nao SECURITY
  --     DEFINER, search_path vazio, e o corpo e o de 20270109900000.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.hr_processamento_resultado_erro(jsonb)')::oid
                    AND NOT p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'G6: hr_processamento_resultado_erro(jsonb) nao existe, passou a SECURITY DEFINER ou perdeu o search_path vazio.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_processamento_resultado_erro(jsonb)')::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_dv_erro_antigo t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G6: o corpo de hr_processamento_resultado_erro no remoto (md5 sem \r %) nao e o de 20270109900000 transcrito aqui (md5 %). Reler antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;

  -- G5. Nenhuma organizacao com margem: a funcionalidade nasce desligada.
  IF EXISTS (SELECT 1 FROM public.hr_desvios_config) THEN
    RAISE EXCEPTION 'G5: ja ha versoes em hr_desvios_config; o fecho passaria a recusar logo no push. Ler antes de aplicar.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. pessoas_desvios
-- ==============================================================================
CREATE TABLE public.pessoas_desvios (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  pessoa_id           uuid        NOT NULL,
  data                date        NOT NULL,
  substitui_id        uuid,
  tipo_horario        text        NOT NULL DEFAULT 'padrao',
  config_id           uuid        NOT NULL,
  margem_min          integer     NOT NULL,
  planeado_min        integer     NOT NULL,
  realizado_min       integer     NOT NULL,
  fora_min            integer     NOT NULL,
  em_falta_min        integer     NOT NULL,
  diferenca_min       integer     NOT NULL,
  desvio_horario_min  integer     NOT NULL,
  assinatura          text        NOT NULL,
  estado              text        NOT NULL DEFAULT 'a_validar',
  decisao             text,
  motivo              text,
  decidido_por        uuid,
  decidido_em         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_desvios_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_desvios_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_desvios_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_desvios_config_fkey
    FOREIGN KEY (config_id) REFERENCES public.hr_desvios_config (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_desvios_substitui_fkey
    FOREIGN KEY (substitui_id) REFERENCES public.pessoas_desvios (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_desvios_substitui_outra
    CHECK (substitui_id IS NULL OR substitui_id <> id),
  CONSTRAINT pessoas_desvios_tipo_horario_valido
    CHECK (tipo_horario IN ('padrao', 'isencao_horario', 'livre', 'banco_horas', 'repartido', 'outro')),
  CONSTRAINT pessoas_desvios_estado_valido
    CHECK (estado IN ('a_validar', 'validado', 'substituido')),
  CONSTRAINT pessoas_desvios_decisao_valida
    CHECK (decisao IS NULL OR decisao IN ('normal', 'hora_extra', 'aceitar_desvio')),
  CONSTRAINT pessoas_desvios_margem_intervalo
    CHECK (margem_min BETWEEN 0 AND 120),
  CONSTRAINT pessoas_desvios_medidas_coerentes
    CHECK (planeado_min > 0 AND realizado_min > 0
           AND fora_min >= 0 AND em_falta_min >= 0
           AND fora_min <= realizado_min AND em_falta_min <= planeado_min
           AND realizado_min - fora_min = planeado_min - em_falta_min
           AND diferenca_min = realizado_min - planeado_min
           AND desvio_horario_min = least(fora_min, em_falta_min)),
  CONSTRAINT pessoas_desvios_fora_da_margem
    CHECK (abs(diferenca_min) > margem_min OR desvio_horario_min > margem_min),
  CONSTRAINT pessoas_desvios_assinatura_md5
    CHECK (assinatura ~ '^[0-9a-f]{32}$'),
  CONSTRAINT pessoas_desvios_decisao_coerente
    CHECK ((estado = 'a_validar' AND decisao IS NULL AND motivo IS NULL
            AND decidido_por IS NULL AND decidido_em IS NULL)
        OR (estado = 'validado' AND decisao IS NOT NULL
            AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
        OR (estado = 'substituido' AND (decisao IS NULL) = (decidido_em IS NULL))),
  CONSTRAINT pessoas_desvios_hora_extra_com_tempo
    CHECK (decisao IS DISTINCT FROM 'hora_extra' OR diferenca_min > margem_min),
  CONSTRAINT pessoas_desvios_aceitar_com_motivo
    CHECK (decisao IS DISTINCT FROM 'aceitar_desvio' OR (motivo IS NOT NULL AND length(btrim(motivo)) >= 3)),
  CONSTRAINT pessoas_desvios_motivo_tamanho
    CHECK (motivo IS NULL OR length(motivo) <= 500),
  -- Uma so versao nao substituida por (pessoa, dia). Exclusao btree parcial e
  -- DEFERRABLE INITIALLY IMMEDIATE: verificada no FIM de cada instrucao, para
  -- a deteccao poder substituir e inserir na mesma instrucao.
  CONSTRAINT pessoas_desvios_um_em_vigor
    EXCLUDE USING btree (pessoa_id WITH =, data WITH =) WHERE (estado <> 'substituido')
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX idx_pessoas_desvios_org_estado_data
  ON public.pessoas_desvios (organization_id, estado, data);
CREATE INDEX idx_pessoas_desvios_pessoa_data
  ON public.pessoas_desvios (pessoa_id, data);
CREATE INDEX idx_pessoas_desvios_config
  ON public.pessoas_desvios (config_id);
CREATE INDEX idx_pessoas_desvios_substitui
  ON public.pessoas_desvios (substitui_id) WHERE substitui_id IS NOT NULL;

COMMENT ON TABLE public.pessoas_desvios IS
'Desvios de horario e de tempo, uma VERSAO por pessoa e dia (so uma nao substituida). Medidas em minutos, com planeado e realizado ja sem as faltas em vigor: fora (realizado fora das janelas), em_falta (janelas nao cobertas), diferenca (realizado - planeado, com sinal), desvio_horario = min(fora, em_falta). Ha desvio quando |diferenca| ou desvio_horario passam a margem da versao de hr_desvios_config em vigor. estado a_validar -> validado (decisao normal | hora_extra | aceitar_desvio, com autor e momento) ou substituido (as picagens ou o planeado mudaram: assinatura diferente, ou o dia deixou de ter desvio). Minutos que contam: normal = planeado, 0 extra; hora_extra = realizado, extra = realizado - planeado; aceitar_desvio = realizado, 0 extra; a_validar conta provisoriamente o planeado. Imutavel depois do fecho da folha; DELETE e TRUNCATE recusados. Escrita so por hr_desvios_detetar_core e rpc_hr_desvio_validar. Le-se so pelas RPCs rpc_hr_desvios_listar e rpc_hr_desvios_assinaturas (sem privilegios de tabela; a politica de SELECT fica como defesa em profundidade).';
COMMENT ON COLUMN public.pessoas_desvios.assinatura IS
'md5 dos intervalos planeados e realizados do dia (ja sem faltas), em segundos desde a meia-noite. Uma assinatura diferente na deteccao seguinte substitui a versao, mesmo validada.';
COMMENT ON COLUMN public.pessoas_desvios.decidido_por IS
'anew_users.id de quem validou. Sem FK de proposito: um ON DELETE SET NULL seria um UPDATE que a imutabilidade recusa.';
COMMENT ON COLUMN public.pessoas_desvios.tipo_horario IS
'O tipo de horario com que se mediu. Hoje so padrao gera desvios; os restantes valores sao o gancho de hr_desvios_intervalos_esperados.';

-- Imutabilidade: so as transicoes previstas; nada numa folha fechada.
CREATE FUNCTION public.hr_pessoas_desvios_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_fechado   boolean;
  v_medidas   boolean;
  v_decisao   boolean;
  v_validar   boolean;
  v_substituir boolean;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION
      'pessoas_desvios_imutavel: os desvios sao historico; nao se apagam (%).', TG_OP
      USING ERRCODE = '22000';
  END IF;

  v_fechado := EXISTS (
    SELECT 1 FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = NEW.organization_id
       AND pp.estado = 'fechado'
       AND NEW.data BETWEEN pp.data_inicio AND pp.data_fim);
  IF v_fechado THEN
    RAISE EXCEPTION
      'pessoas_desvios_periodo_fechado: o dia % ja esta numa folha fechada; os desvios desse dia nao mudam.', NEW.data
      USING ERRCODE = '22000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS DISTINCT FROM 'a_validar' THEN
      RAISE EXCEPTION
        'pessoas_desvios_imutavel: uma versao nasce sempre a_validar (recebido %).', NEW.estado
        USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: as medidas e a identidade da versao nunca mudam.
  v_medidas := ROW(NEW.id, NEW.organization_id, NEW.pessoa_id, NEW.data, NEW.substitui_id, NEW.tipo_horario,
                   NEW.config_id, NEW.margem_min, NEW.planeado_min, NEW.realizado_min, NEW.fora_min,
                   NEW.em_falta_min, NEW.diferenca_min, NEW.desvio_horario_min, NEW.assinatura, NEW.created_at)
               IS NOT DISTINCT FROM
               ROW(OLD.id, OLD.organization_id, OLD.pessoa_id, OLD.data, OLD.substitui_id, OLD.tipo_horario,
                   OLD.config_id, OLD.margem_min, OLD.planeado_min, OLD.realizado_min, OLD.fora_min,
                   OLD.em_falta_min, OLD.diferenca_min, OLD.desvio_horario_min, OLD.assinatura, OLD.created_at);
  v_decisao := ROW(NEW.decisao, NEW.motivo, NEW.decidido_por, NEW.decidido_em)
               IS NOT DISTINCT FROM
               ROW(OLD.decisao, OLD.motivo, OLD.decidido_por, OLD.decidido_em);
  v_validar := OLD.estado = 'a_validar' AND NEW.estado = 'validado';
  v_substituir := OLD.estado IN ('a_validar', 'validado') AND NEW.estado = 'substituido' AND v_decisao;

  IF v_medidas AND (v_validar OR v_substituir) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'pessoas_desvios_imutavel: so se valida uma versao a_validar ou se substitui uma versao em vigor; as medidas nunca mudam (% -> %).',
    OLD.estado, NEW.estado
    USING ERRCODE = '22000';
END;
$$;

CREATE TRIGGER trg_pessoas_desvios_guarda
  BEFORE INSERT OR UPDATE OR DELETE ON public.pessoas_desvios
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_desvios_guarda();
CREATE TRIGGER trg_pessoas_desvios_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_desvios
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_pessoas_desvios_guarda();

-- Quem pode ler uma linha: view na organizacao, ou view.own e a propria ficha.
-- SECURITY DEFINER para a politica nao depender de EXECUTE em
-- hr_pessoa_do_utilizador nem da RLS de pessoas_contas.
CREATE FUNCTION public.hr_desvios_pode_ler(p_organization_id uuid, p_pessoa_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL OR p_pessoa_id IS NULL THEN
    RETURN false;
  END IF;
  IF coalesce(public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view', p_organization_id), false) THEN
    RETURN true;
  END IF;
  IF coalesce(public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view.own', p_organization_id), false) THEN
    RETURN coalesce(public.hr_pessoa_do_utilizador(v_uid, p_organization_id) = p_pessoa_id, false);
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.hr_desvios_pode_ler(uuid, uuid) IS
'A politica de leitura de pessoas_desvios: true com hr.assiduidade.view na organizacao, ou com hr.assiduidade.view.own quando a pessoa e a ficha ligada (activa) ao utilizador. Sem sessao: false.';

-- Leitura SO pelas RPCs: nenhum privilegio de tabela para ninguem. A politica
-- fica como defesa em profundidade (so actua se alguem conceder SELECT).
REVOKE ALL ON TABLE public.pessoas_desvios FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.pessoas_desvios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_desvios FORCE ROW LEVEL SECURITY;

CREATE POLICY pessoas_desvios_select ON public.pessoas_desvios
  FOR SELECT TO authenticated
  USING (public.hr_desvios_pode_ler(organization_id, pessoa_id));
COMMENT ON POLICY pessoas_desvios_select ON public.pessoas_desvios IS
'Defesa em profundidade: hoje authenticated nao tem SELECT na tabela (le-se so por rpc_hr_desvios_listar e rpc_hr_desvios_assinaturas). Se alguem conceder SELECT, ve so quem tem hr.assiduidade.view na organizacao, ou hr.assiduidade.view.own a propria ficha. Sem politicas de escrita.';


-- ==============================================================================
-- 2. As medidas (puras) e o ponto de extensao dos tipos de horario
-- ==============================================================================
CREATE FUNCTION public.hr_desvios_minutos(p_intervalos tsmultirange)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(round(sum(extract(epoch FROM (upper(x) - lower(x)))) / 60), 0)::integer
    FROM unnest(p_intervalos) AS x
$$;

-- As medidas de um dia, a partir das janelas planeadas e do realizado (ja sem
-- faltas). fora e em_falta saem do coberto em comum, como em desvios.ts.
CREATE FUNCTION public.hr_desvios_medir(
  p_planeado tsmultirange, p_realizado tsmultirange,
  OUT planeado_min integer, OUT realizado_min integer, OUT fora_min integer,
  OUT em_falta_min integer, OUT diferenca_min integer, OUT desvio_horario_min integer)
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_coberto integer;
BEGIN
  planeado_min  := public.hr_desvios_minutos(p_planeado);
  realizado_min := public.hr_desvios_minutos(p_realizado);
  v_coberto     := public.hr_desvios_minutos(coalesce(p_planeado, '{}'::tsmultirange)
                                             * coalesce(p_realizado, '{}'::tsmultirange));
  fora_min           := realizado_min - v_coberto;
  em_falta_min       := planeado_min - v_coberto;
  diferenca_min      := realizado_min - planeado_min;
  desvio_horario_min := least(fora_min, em_falta_min);
END;
$$;

-- A natureza do desvio contra a margem (classificarDia de desvios.ts): o tempo
-- manda (mais = hora_extra, menos = tempo_a_menos); sem desvio de tempo, o de
-- horario. NULL = dentro da margem. Desvio so quando PASSA a margem.
CREATE FUNCTION public.hr_desvios_natureza(p_diferenca integer, p_desvio_horario integer, p_margem integer)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN p_margem IS NULL OR p_diferenca IS NULL OR p_desvio_horario IS NULL THEN NULL
           WHEN abs(p_diferenca) > p_margem AND p_diferenca > 0 THEN 'hora_extra'
           WHEN abs(p_diferenca) > p_margem THEN 'tempo_a_menos'
           WHEN p_desvio_horario > p_margem THEN 'desvio_horario'
           ELSE NULL
         END
$$;

-- md5 dos intervalos do dia em segundos desde a meia-noite: nao depende do
-- DateStyle da sessao.
CREATE FUNCTION public.hr_desvios_assinatura(p_dia date, p_planeado tsmultirange, p_realizado tsmultirange)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT md5(
    'p:' || coalesce((SELECT string_agg(
                               (extract(epoch FROM (lower(x) - p_dia::timestamp)))::bigint::text || '-'
                               || (extract(epoch FROM (upper(x) - p_dia::timestamp)))::bigint::text,
                               ',' ORDER BY lower(x))
                        FROM unnest(p_planeado) AS x), '')
    || '|r:' || coalesce((SELECT string_agg(
                                   (extract(epoch FROM (lower(x) - p_dia::timestamp)))::bigint::text || '-'
                                   || (extract(epoch FROM (upper(x) - p_dia::timestamp)))::bigint::text,
                                   ',' ORDER BY lower(x))
                            FROM unnest(p_realizado) AS x), ''))
$$;

-- O ponto de extensao (gemeo de intervalosEsperados em desvios.ts).
CREATE FUNCTION public.hr_desvios_intervalos_esperados(
  p_organization_id uuid, p_pessoa_id uuid, p_data date,
  OUT modo text, OUT tipo_horario text, OUT janelas tsmultirange, OUT motivo text)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_isencao boolean;
BEGIN
  v_isencao := EXISTS (
    SELECT 1 FROM public.pessoas_vinculos v
     WHERE v.organization_id = p_organization_id
       AND v.pessoa_id = p_pessoa_id
       AND v.deleted_at IS NULL
       AND v.isencao_horario IS TRUE
       AND v.data_inicio <= p_data
       AND (v.data_fim IS NULL OR v.data_fim >= p_data));
  IF v_isencao THEN
    modo         := 'sem_desvios';
    tipo_horario := 'isencao_horario';
    janelas      := '{}'::tsmultirange;
    motivo       := 'Vinculo com isencao de horario: nao ha desvios de horario.';
    RETURN;
  END IF;

  -- GANCHO: quando houver tipos de horario na base, livre e banco_horas
  -- devolvem sem_desvios e repartido/outros nao_definido (com o motivo), aqui
  -- e em intervalosEsperados (desvios.ts). Hoje so existe o padrao.
  SELECT d.janelas INTO janelas
    FROM public.hr_horas_extra_dia(p_organization_id, p_pessoa_id, p_data) AS d;
  modo         := 'padrao';
  tipo_horario := 'padrao';
  janelas      := coalesce(janelas, '{}'::tsmultirange);
  motivo       := NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_desvios_intervalos_esperados(uuid, uuid, date) IS
'INTERNA. O que se espera de uma pessoa num dia: modo (padrao | sem_desvios | nao_definido), tipo_horario, as janelas planeadas e o motivo quando nao ha desvios. sem_desvios: vinculo com isencao_horario em vigor na data. padrao: janelas de hr_horas_extra_dia (excepcoes por data, linhas corrigidas fora; descanso e sem horario = vazio). Gemea de intervalosEsperados em src/lib/hr/desvios.ts.';


-- ==============================================================================
-- 3. A deteccao, numa so instrucao sobre o conjunto
-- ==============================================================================
CREATE FUNCTION public.hr_desvios_detetar_core(
  p_organization_id uuid, p_data_de date, p_data_ate date, p_pessoa_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_feriados date[];
  v_dias     integer;
  v_com      integer;
  v_subst    integer;
  v_novos    integer;
BEGIN
  IF p_organization_id IS NULL OR p_data_de IS NULL OR p_data_ate IS NULL OR p_data_ate < p_data_de THEN
    RAISE EXCEPTION 'desvios_dados_invalidos: a organizacao e um intervalo de datas valido sao obrigatorios.'
      USING ERRCODE = '22023';
  END IF;

  -- Uma deteccao de cada vez por organizacao (a RPC tenta sem esperar; o
  -- fecho espera).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_desvios_detecao:' || p_organization_id::text, 0));

  v_feriados := public.hr_horas_extra_feriados(p_organization_id, p_data_de, p_data_ate);

  WITH fechados AS MATERIALIZED (
    SELECT pp.data_inicio, pp.data_fim
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id
       AND pp.estado = 'fechado'
       AND pp.data_inicio <= p_data_ate
       AND pp.data_fim >= p_data_de
  ),
  -- Os dias a ver: com realizado em vigor, ou com uma versao em vigor (para a
  -- substituir se o dia deixou de ter desvio). Nunca dias de folhas fechadas.
  cand AS MATERIALIZED (
    SELECT x.pessoa_id, x.data
      FROM (SELECT h.pessoa_id, h.data
              FROM public.v_hr_horario_realizado_em_vigor h
              JOIN public.pessoas p ON p.id = h.pessoa_id AND p.organization_id = h.organization_id
             WHERE h.organization_id = p_organization_id
               AND h.data BETWEEN p_data_de AND p_data_ate
               AND p.deleted_at IS NULL
               AND (p_pessoa_id IS NULL OR h.pessoa_id = p_pessoa_id)
            UNION
            SELECT d.pessoa_id, d.data
              FROM public.pessoas_desvios d
             WHERE d.organization_id = p_organization_id
               AND d.data BETWEEN p_data_de AND p_data_ate
               AND d.estado <> 'substituido'
               AND (p_pessoa_id IS NULL OR d.pessoa_id = p_pessoa_id)) AS x
     WHERE NOT EXISTS (SELECT 1 FROM fechados f WHERE x.data BETWEEN f.data_inicio AND f.data_fim)
  ),
  -- O realizado do dia, como em rpc_hr_horas_extra_detetar (23:59:59 = 24:00).
  realizado AS MATERIALIZED (
    SELECT h.pessoa_id, h.data,
           range_agg(tsrange(h.data + h.hora_inicio, h.data + public.hr_horas_extra_fim(h.hora_fim), '[)')) AS r
      FROM public.v_hr_horario_realizado_em_vigor h
      JOIN cand c ON c.pessoa_id = h.pessoa_id AND c.data = h.data
     WHERE h.organization_id = p_organization_id
     GROUP BY h.pessoa_id, h.data
  ),
  -- As faltas em vigor do dia: saem do planeado e do realizado.
  faltas AS MATERIALIZED (
    SELECT f.pessoa_id, f.data,
           range_agg(tsrange(f.data + f.hora_inicio, f.data + f.hora_fim, '[)')) AS f
      FROM public.v_hr_faltas_em_vigor f
      JOIN cand c ON c.pessoa_id = f.pessoa_id AND c.data = f.data
     WHERE f.organization_id = p_organization_id
     GROUP BY f.pessoa_id, f.data
  ),
  -- Ausencias aprovadas (sem horas na base: o dia inteiro fica fora).
  ausencias AS MATERIALIZED (
    SELECT DISTINCT a.pessoa_id, a.data
      FROM public.pessoas_ausencias_dias a
      JOIN cand c ON c.pessoa_id = a.pessoa_id AND c.data = a.data
     WHERE a.organization_id = p_organization_id
       AND a.estado = 'aprovado'
  ),
  -- Nos dias que sao feriado: conta para a pessoa? politica_feriados do
  -- vinculo em vigor NESSE dia (o mais recente, se houver dois); sem vinculo,
  -- nao_laboral, como hr_horas_extra_pessoa_ctx. trabalho_habitual = dia normal.
  feriados_dia AS MATERIALIZED (
    SELECT c.pessoa_id, c.data,
           coalesce((SELECT v.politica_feriados
                       FROM public.pessoas_vinculos v
                      WHERE v.organization_id = p_organization_id
                        AND v.pessoa_id = c.pessoa_id
                        AND v.deleted_at IS NULL
                        AND v.data_inicio <= c.data
                        AND (v.data_fim IS NULL OR v.data_fim >= c.data)
                      ORDER BY v.data_inicio DESC
                      LIMIT 1), 'nao_laboral') <> 'trabalho_habitual' AS feriado_conta
      FROM cand c
     WHERE c.data = ANY (v_feriados)
  ),
  base AS MATERIALIZED (
    SELECT c.pessoa_id, c.data, e.modo, e.tipo_horario,
           coalesce(e.janelas, '{}'::tsmultirange) - coalesce(fa.f, '{}'::tsmultirange) AS planeado,
           coalesce(r.r, '{}'::tsmultirange) - coalesce(fa.f, '{}'::tsmultirange) AS realizado,
           coalesce(fd.feriado_conta, false) AS feriado,
           au.pessoa_id IS NOT NULL AS ausencia,
           cf.id AS config_id,
           cf.margem_min
      FROM cand c
      LEFT JOIN realizado r ON r.pessoa_id = c.pessoa_id AND r.data = c.data
      LEFT JOIN faltas fa ON fa.pessoa_id = c.pessoa_id AND fa.data = c.data
      LEFT JOIN ausencias au ON au.pessoa_id = c.pessoa_id AND au.data = c.data
      LEFT JOIN feriados_dia fd ON fd.pessoa_id = c.pessoa_id AND fd.data = c.data
      LEFT JOIN LATERAL (
        SELECT k.id, k.margem_min
          FROM public.hr_desvios_config k
         WHERE k.organization_id = p_organization_id
           AND k.substituida_em IS NULL
           AND k.valido_de <= c.data
           AND (k.valido_ate IS NULL OR k.valido_ate >= c.data)
         ORDER BY k.valido_de DESC
         LIMIT 1) AS cf ON true
      -- Sem margem em vigor no dia (sem versao, ou versao "sem margem" NULL)
      -- nao se le o planeado (filtro de uma vez).
      LEFT JOIN LATERAL (
        SELECT ie.modo, ie.tipo_horario, ie.janelas
          FROM public.hr_desvios_intervalos_esperados(p_organization_id, c.pessoa_id, c.data) AS ie
         WHERE cf.margem_min IS NOT NULL) AS e ON true
  ),
  alvo AS MATERIALIZED (
    SELECT b.pessoa_id, b.data, b.tipo_horario, b.config_id, b.margem_min,
           m.planeado_min, m.realizado_min, m.fora_min, m.em_falta_min, m.diferenca_min, m.desvio_horario_min,
           public.hr_desvios_assinatura(b.data, b.planeado, b.realizado) AS assinatura,
           coalesce(b.config_id IS NOT NULL
                    AND b.margem_min IS NOT NULL
                    AND b.modo = 'padrao'
                    AND NOT b.feriado
                    AND NOT b.ausencia
                    AND m.planeado_min > 0
                    AND m.realizado_min > 0
                    AND public.hr_desvios_natureza(m.diferenca_min, m.desvio_horario_min, b.margem_min) IS NOT NULL,
                    false) AS tem_desvio
      FROM base b
      CROSS JOIN LATERAL public.hr_desvios_medir(b.planeado, b.realizado) AS m
  ),
  actual AS MATERIALIZED (
    SELECT d.id, d.pessoa_id, d.data, d.assinatura
      FROM public.pessoas_desvios d
      JOIN cand c ON c.pessoa_id = d.pessoa_id AND c.data = d.data
     WHERE d.organization_id = p_organization_id
       AND d.estado <> 'substituido'
  ),
  subst AS (
    UPDATE public.pessoas_desvios d
       SET estado = 'substituido'
      FROM alvo a
      JOIN actual ac ON ac.pessoa_id = a.pessoa_id AND ac.data = a.data
     WHERE d.id = ac.id
       AND d.organization_id = p_organization_id
       AND d.estado <> 'substituido'
       AND (NOT a.tem_desvio OR ac.assinatura <> a.assinatura)
    RETURNING d.id
  ),
  novos AS (
    INSERT INTO public.pessoas_desvios (
      organization_id, pessoa_id, data, substitui_id, tipo_horario, config_id, margem_min,
      planeado_min, realizado_min, fora_min, em_falta_min, diferenca_min, desvio_horario_min, assinatura)
    SELECT p_organization_id, a.pessoa_id, a.data, ac.id, a.tipo_horario, a.config_id, a.margem_min,
           a.planeado_min, a.realizado_min, a.fora_min, a.em_falta_min, a.diferenca_min, a.desvio_horario_min,
           a.assinatura
      FROM alvo a
      LEFT JOIN actual ac ON ac.pessoa_id = a.pessoa_id AND ac.data = a.data
     WHERE a.tem_desvio
       AND (ac.id IS NULL OR ac.assinatura <> a.assinatura)
    RETURNING id
  )
  SELECT (SELECT pg_catalog.count(*) FROM cand)::integer,
         (SELECT pg_catalog.count(*) FROM alvo a WHERE a.tem_desvio)::integer,
         (SELECT pg_catalog.count(*) FROM subst)::integer,
         (SELECT pg_catalog.count(*) FROM novos)::integer
    INTO v_dias, v_com, v_subst, v_novos;

  RETURN pg_catalog.jsonb_build_object(
    'dias_vistos',  v_dias,
    'com_desvio',   v_com,
    'substituidos', v_subst,
    'criados',      v_novos,
    'data_de',      p_data_de,
    'data_ate',     p_data_ate);
END;
$$;

COMMENT ON FUNCTION public.hr_desvios_detetar_core(uuid, date, date, uuid) IS
'INTERNA (sem EXECUTE para ninguem; chamada por rpc_hr_desvios_detetar e pelo fecho da folha). Numa so instrucao sobre o conjunto: para cada (pessoa, dia) com realizado em vigor ou com versao em vigor, fora de folhas fechadas, mede o dia (planeado e realizado sem as faltas em vigor) contra a margem em vigor nesse dia. Dia sem desvio: a versao em vigor fica substituida. Desvio novo: insere a_validar. Assinatura diferente da versao em vigor: substitui-a (mesmo validada) e insere outra a_validar com substitui_id. Fora: sem margem, feriado que conta, descanso ou sem horario, isencao de horario, ausencia aprovada. Lock por organizacao (espera). Devolve dias_vistos, com_desvio, substituidos, criados.';


-- ==============================================================================
-- 4. RPCs
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_desvios_detetar(
  p_organization_id uuid, p_data_de date, p_data_ate date, p_pessoa_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_dias_org    constant integer := 31;
  c_max_dias_pessoa constant integer := 62;
  v_auth  uuid := auth.uid();
  v_hoje  date := (pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_ate   date;
  v_dias  integer;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'desvios_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', p_organization_id), false) THEN
    RAISE EXCEPTION 'desvios_sem_permissao: detetar desvios exige hr.assiduidade.gerir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data_de IS NULL OR p_data_ate IS NULL OR NOT isfinite(p_data_de) OR NOT isfinite(p_data_ate)
     OR p_data_de < DATE '2000-01-01' OR p_data_ate < p_data_de THEN
    RAISE EXCEPTION 'desvios_data_invalida: o intervalo de datas e invalido.' USING ERRCODE = '22023';
  END IF;
  v_ate := least(p_data_ate, v_hoje);
  IF v_ate < p_data_de THEN
    RAISE EXCEPTION 'desvios_data_invalida: o intervalo comeca depois de hoje (%).', v_hoje USING ERRCODE = '22023';
  END IF;
  v_dias := (v_ate - p_data_de) + 1;
  IF v_dias > c_max_dias_pessoa OR (p_pessoa_id IS NULL AND v_dias > c_max_dias_org) THEN
    RAISE EXCEPTION 'desvios_intervalo_excedido: no maximo % dias para a organizacao e % para uma pessoa (pedido %).',
      c_max_dias_org, c_max_dias_pessoa, v_dias
      USING ERRCODE = '22023';
  END IF;

  IF p_pessoa_id IS NOT NULL THEN
    PERFORM 1 FROM public.pessoas p
     WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'desvios_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Uma de cada vez por organizacao, sem esperar.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
           pg_catalog.hashtextextended('hr_desvios_detecao:' || p_organization_id::text, 0)) THEN
    RAISE EXCEPTION 'desvios_detecao_em_curso: ja ha uma deteccao de desvios a correr nesta organizacao; tentar daqui a pouco.'
      USING ERRCODE = '55P03';
  END IF;

  RETURN public.hr_desvios_detetar_core(p_organization_id, p_data_de, v_ate, p_pessoa_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_desvios_detetar(uuid, date, date, uuid) IS
'Deteta (ou actualiza) os desvios de [p_data_de, min(p_data_ate, hoje em Lisboa)], para a organizacao ou uma pessoa. Exige hr.assiduidade.gerir (42501). Tectos: 31 dias para a organizacao, 62 para uma pessoa (desvios_intervalo_excedido). Uma deteccao de cada vez por organizacao, sem esperar (desvios_detecao_em_curso, 55P03). Sem margem em vigor nao cria nada. Devolve {dias_vistos, com_desvio, substituidos, criados, data_de, data_ate}.';

CREATE FUNCTION public.rpc_hr_desvios_listar(
  p_organization_id uuid,
  p_estado          text DEFAULT 'a_validar',
  p_data_de         date DEFAULT NULL,
  p_data_ate        date DEFAULT NULL,
  p_pessoa_id       uuid DEFAULT NULL)
RETURNS TABLE (
  id                  uuid,
  pessoa_id           uuid,
  data                date,
  estado              text,
  natureza            text,
  tipo_horario        text,
  margem_min          integer,
  planeado_min        integer,
  realizado_min       integer,
  fora_min            integer,
  em_falta_min        integer,
  diferenca_min       integer,
  desvio_horario_min  integer,
  realizado_inicio    time,
  realizado_fim       time,
  decisao             text,
  motivo              text,
  decidido_por        uuid,
  decidido_em         timestamptz,
  substitui_id        uuid,
  created_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  c_max_linhas constant integer := 5000;
  v_auth   uuid := auth.uid();
  v_pessoa uuid;
  v_gerir  boolean;
  v_eu     uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'desvios_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  -- view: todas (ou a pedida); view.own: so a sua; outra coisa: 42501.
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, p_pessoa_id);
  -- O motivo da decisao so vai a quem gere a assiduidade ou a propria pessoa.
  v_gerir := coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', p_organization_id), false);
  v_eu    := public.hr_pessoa_do_utilizador(v_auth, p_organization_id);

  IF p_estado IS NOT NULL AND p_estado NOT IN ('a_validar', 'validado', 'substituido') THEN
    RAISE EXCEPTION 'desvios_estado_invalido: o estado tem de ser a_validar, validado, substituido ou nulo (todos).'
      USING ERRCODE = '22023';
  END IF;
  IF p_data_de IS NOT NULL AND p_data_ate IS NOT NULL AND p_data_ate < p_data_de THEN
    RAISE EXCEPTION 'desvios_data_invalida: o intervalo de datas e invalido.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT d.id, d.pessoa_id, d.data, d.estado,
         public.hr_desvios_natureza(d.diferenca_min, d.desvio_horario_min, d.margem_min),
         d.tipo_horario, d.margem_min, d.planeado_min, d.realizado_min, d.fora_min, d.em_falta_min,
         d.diferenca_min, d.desvio_horario_min,
         r.inicio, r.fim,
         d.decisao,
         CASE WHEN v_gerir OR d.pessoa_id = v_eu THEN d.motivo END,
         d.decidido_por, d.decidido_em, d.substitui_id, d.created_at
    FROM public.pessoas_desvios d
    LEFT JOIN LATERAL (
      SELECT min(h.hora_inicio) AS inicio, max(h.hora_fim) AS fim
        FROM public.v_hr_horario_realizado_em_vigor h
       WHERE h.organization_id = d.organization_id
         AND h.pessoa_id = d.pessoa_id
         AND h.data = d.data) AS r ON true
   WHERE d.organization_id = p_organization_id
     AND (v_pessoa IS NULL OR d.pessoa_id = v_pessoa)
     AND (p_estado IS NULL OR d.estado = p_estado)
     AND (p_data_de IS NULL OR d.data >= p_data_de)
     AND (p_data_ate IS NULL OR d.data <= p_data_ate)
   ORDER BY d.data, d.pessoa_id, d.created_at
   LIMIT c_max_linhas;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_desvios_listar(uuid, text, date, date, uuid) IS
'Os desvios da organizacao (p_estado: a_validar por omissao; NULL = todos), por data, no maximo 5000. hr.assiduidade.view ve todos (ou a pessoa pedida); hr.assiduidade.view.own so os seus; outra coisa: 42501. natureza: hora_extra | tempo_a_menos | desvio_horario. motivo so para quem tem hr.assiduidade.gerir ou e a propria pessoa (ficha ligada, activa); aos outros NULL. realizado_inicio/_fim sao do realizado EM VIGOR hoje (numa versao substituida podem ja nao ser os medidos).';

CREATE FUNCTION public.rpc_hr_desvio_validar(p_desvio_id uuid, p_decisao text, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth    uuid := auth.uid();
  v_org     uuid;
  v_actor   uuid;
  v_d       public.pessoas_desvios%ROWTYPE;
  v_motivo  text;
  v_propria boolean;
  v_contado integer;
  v_extra   integer;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'desvio_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  -- Permissao ANTES de revelar se o desvio existe: inexistente = organizacao
  -- NULL = mesma recusa.
  SELECT d.organization_id INTO v_org FROM public.pessoas_desvios d WHERE d.id = p_desvio_id;
  IF NOT coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', v_org), false) THEN
    RAISE EXCEPTION 'desvio_sem_permissao: validar desvios exige hr.assiduidade.gerir na organizacao do desvio.'
      USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'desvio_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_d
    FROM public.pessoas_desvios d
   WHERE d.id = p_desvio_id AND d.organization_id = v_org
     FOR UPDATE;

  v_propria := public.hr_horas_extra_e_propria(v_org, v_d.pessoa_id);
  IF v_propria THEN
    RAISE EXCEPTION 'desvio_validar_proprio: ninguem valida os proprios desvios.' USING ERRCODE = '42501';
  END IF;

  IF v_d.estado IS DISTINCT FROM 'a_validar' THEN
    RAISE EXCEPTION 'desvio_nao_esta_a_validar: este desvio esta %; so se valida a versao a_validar (detetar de novo se o dia mudou).', v_d.estado
      USING ERRCODE = '23514';
  END IF;
  IF p_decisao IS NULL OR p_decisao NOT IN ('normal', 'hora_extra', 'aceitar_desvio') THEN
    RAISE EXCEPTION 'desvio_decisao_invalida: a decisao tem de ser normal, hora_extra ou aceitar_desvio.' USING ERRCODE = '22023';
  END IF;

  v_motivo := public.hr_horas_extra_texto(p_motivo, 500);
  IF p_decisao = 'aceitar_desvio' AND (v_motivo IS NULL OR length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'desvio_motivo_obrigatorio: aceitar o desvio exige um motivo (3 a 500 caracteres).' USING ERRCODE = '23502';
  END IF;
  IF p_decisao = 'hora_extra' AND v_d.diferenca_min <= v_d.margem_min THEN
    RAISE EXCEPTION 'desvio_hora_extra_sem_tempo_a_mais: so ha hora extra quando o realizado passa o planeado mais do que a margem (diferenca %, margem %).',
      v_d.diferenca_min, v_d.margem_min
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pessoas_desvios d
     SET estado = 'validado',
         decisao = p_decisao,
         motivo = v_motivo,
         decidido_por = v_actor,
         decidido_em = pg_catalog.now()
   WHERE d.id = v_d.id;

  -- Minutos que contam (plano 1.4).
  IF p_decisao = 'normal' THEN
    v_contado := v_d.planeado_min;
    v_extra   := 0;
  ELSIF p_decisao = 'hora_extra' THEN
    v_contado := v_d.realizado_min;
    v_extra   := greatest(v_d.realizado_min - v_d.planeado_min, 0);
  ELSE
    v_contado := v_d.realizado_min;
    v_extra   := 0;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',          v_d.id,
    'pessoa_id',   v_d.pessoa_id,
    'data',        v_d.data,
    'decisao',     p_decisao,
    'contado_min', v_contado,
    'extra_min',   v_extra);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_desvio_validar(uuid, text, text) IS
'Valida uma versao a_validar de pessoas_desvios: normal (conta o planeado), hora_extra (conta o realizado; extra = realizado - planeado; so com diferenca > margem) ou aceitar_desvio (conta o realizado, sem extra; motivo obrigatorio). Exige hr.assiduidade.gerir na organizacao do desvio (verificada antes de revelar se existe). Ninguem valida os proprios desvios (desvio_validar_proprio). Dia numa folha fechada: pessoas_desvios_periodo_fechado. Devolve {id, pessoa_id, data, decisao, contado_min, extra_min}.';

-- A assinatura das decisoes de cada pessoa num intervalo (interna): o que o
-- fecho confere contra o que o cliente usou no calculo. A data vai por
-- to_char (nao depende do DateStyle da sessao).
CREATE FUNCTION public.hr_desvios_assinaturas_periodo(p_organization_id uuid, p_data_de date, p_data_ate date)
RETURNS TABLE (pessoa_id uuid, assinatura text)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT d.pessoa_id,
         md5(string_agg(to_char(d.data, 'YYYY-MM-DD') || ':' || d.estado || ':' || coalesce(d.decisao, ''),
                        ',' ORDER BY d.data))
    FROM public.pessoas_desvios d
   WHERE d.organization_id = p_organization_id
     AND d.data BETWEEN p_data_de AND p_data_ate
     AND d.estado <> 'substituido'
   GROUP BY d.pessoa_id
$$;

COMMENT ON FUNCTION public.hr_desvios_assinaturas_periodo(uuid, date, date) IS
'INTERNA. Por pessoa com desvios em vigor (nao substituidos) no intervalo: md5 de string_agg(data YYYY-MM-DD || '':'' || estado || '':'' || decisao (ou vazio), '','' por data). Pessoa sem desvios: nao vem. Usada por rpc_hr_desvios_assinaturas e pelo fecho da folha.';

CREATE FUNCTION public.rpc_hr_desvios_assinaturas(p_periodo_id uuid)
RETURNS TABLE (pessoa_id uuid, assinatura text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth    uuid := auth.uid();
  v_periodo public.hr_periodos_processamento%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'desvios_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_periodo FROM public.hr_periodos_processamento pp WHERE pp.id = p_periodo_id;

  -- Inexistente e sem permissao dao a mesma recusa (organizacao NULL).
  IF NOT (coalesce(public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', v_periodo.organization_id), false)) THEN
    RAISE EXCEPTION 'desvios_sem_permissao: ler as assinaturas dos desvios exige hr.processamento.periodo.gerir ou hr.assiduidade.gerir na organizacao do periodo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.pessoa_id, s.assinatura
    FROM public.hr_desvios_assinaturas_periodo(v_periodo.organization_id, v_periodo.data_inicio, v_periodo.data_fim) AS s
   ORDER BY s.pessoa_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_desvios_assinaturas(uuid) IS
'Por pessoa com desvios em vigor no periodo da folha, a assinatura das decisoes (md5; ver hr_desvios_assinaturas_periodo). O cliente envia-a em desvios_assinatura de cada resultado ao fechar (null para quem nao vem aqui); o fecho recusa com processamento_fechar_desvios_desactualizados se ja nao for a mesma. Ler DEPOIS de detetar e validar. Exige hr.processamento.periodo.gerir ou hr.assiduidade.gerir (inexistente e sem permissao: a mesma recusa).';

-- O validador de cada resultado do fecho: o corpo de 20270109900000 com UM
-- campo opcional a mais, desvios_assinatura (md5 ou null).
CREATE OR REPLACE FUNCTION public.hr_processamento_resultado_erro(_r jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION public.hr_processamento_resultado_erro(jsonb) IS
'Interna. NULL se o objecto e um resultado bem formado (o formato do cabecalho de 20270109900000, mais o campo OPCIONAL desvios_assinatura de 20270110510000: md5 ou null); senao, a descricao do que esta mal. So valida a forma, nao os valores do calculo.';

REVOKE ALL ON FUNCTION public.hr_desvios_assinaturas_periodo(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_desvios_assinaturas(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_processamento_resultado_erro(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_desvios_assinaturas(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.hr_pessoas_desvios_guarda() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_minutos(tsmultirange) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_medir(tsmultirange, tsmultirange) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_natureza(integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_assinatura(date, tsmultirange, tsmultirange) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_intervalos_esperados(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_detetar_core(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_pode_ler(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_desvios_detetar(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_desvios_listar(uuid, text, date, date, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_desvio_validar(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_desvios_pode_ler(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_desvios_detetar(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_desvios_listar(uuid, text, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_desvio_validar(uuid, text, text) TO authenticated;


-- ==============================================================================
-- 5. O fecho da folha: o mesmo corpo, com o bloco dos desvios ligado
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_processamento_periodo_fechar(
  p_periodo_id  uuid,
  p_resultados  jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- ---- Desvios por validar (ligado em 20270110510000) ------------------------
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
$$;

COMMENT ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid, jsonb) IS
'Fecha um periodo de processamento salarial ABERTO e grava, na mesma transaccao, o resultado de cada pessoa em hr_processamento_resultados. Exige hr.processamento.periodo.gerir na organizacao do periodo (verificada antes de revelar se o periodo existe). p_resultados: array com um objecto por pessoa (formato no cabecalho de 20270109900000): obrigatorias as activas com vinculo sobreposto ao periodo; permitidas as que tem vinculo sobreposto, activas ou arquivadas. Recusa estrutura mal formada, pessoas repetidas, sem vinculo no periodo, obrigatorias em falta, totais.lancamentos_pontuais diferente da soma dos lancamentos manuais nao anulados, regra salarial diferente da em vigor no data_fim, retribuicao que nao e a em vigor no data_fim, e cargo de outra organizacao. Desde 20270110510000: se houver margem de tempo (hr_desvios_config, nao NULL) em vigor em algum dia do periodo, detecta os desvios do periodo, recusa com processamento_fechar_desvios_por_validar (23514) enquanto houver dias a_validar de pessoas OBRIGATORIAS, e recusa com processamento_fechar_desvios_desactualizados (23514) se o campo opcional desvios_assinatura de algum resultado nao for a assinatura actual dos desvios dessa pessoa (rpc_hr_desvios_assinaturas). Uma recusa desfaz a deteccao: o cliente deteta e valida antes de fechar. Sem margem, igual a antes. O calculo e do cliente; a RPC valida estrutura, coerencia dos lancamentos e versoes, e grava. Irreversivel: sem reabertura auditada.';


-- ==============================================================================
-- 6. Conferir (estrutura, privilegios, paridade com desvios.ts e comportamento
--    na nike, desfeito)
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_fechar   constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
  k_d1       constant date := DATE '2099-05-04';
  k_d2       constant date := DATE '2099-05-05';
  k_d3       constant date := DATE '2099-05-06';
  k_d4       constant date := DATE '2099-05-07';
  k_dia      constant date := DATE '2099-01-05';
  v_rpcs     text[] := ARRAY[
    'public.rpc_hr_desvios_detetar(uuid, date, date, uuid)',
    'public.rpc_hr_desvios_listar(uuid, text, date, date, uuid)',
    'public.rpc_hr_desvio_validar(uuid, text, text)',
    'public.rpc_hr_desvios_assinaturas(uuid)',
    'public.hr_desvios_pode_ler(uuid, uuid)'];
  v_internas text[] := ARRAY[
    'public.hr_desvios_assinaturas_periodo(uuid, date, date)',
    'public.hr_processamento_resultado_erro(jsonb)',
    'public.hr_pessoas_desvios_guarda()',
    'public.hr_desvios_minutos(tsmultirange)',
    'public.hr_desvios_medir(tsmultirange, tsmultirange)',
    'public.hr_desvios_natureza(integer, integer, integer)',
    'public.hr_desvios_assinatura(date, tsmultirange, tsmultirange)',
    'public.hr_desvios_intervalos_esperados(uuid, uuid, date)',
    'public.hr_desvios_detetar_core(uuid, date, date, uuid)'];
  v_fn       text;
  v_grant    text;
  v_n        integer;
  v_src      text;
  v_antigo   text;
  v_bl_ant   text;
  v_bl_novo  text;
  v_r        record;
  v_m        record;
  v_esp      record;
  v_pl       tsmultirange;
  v_re       tsmultirange;
  v_uid      uuid;
  v_autor    uuid;
  v_falso    uuid;
  v_p        uuid;
  v_per      uuid;
  v_cfg      uuid;
  v_regra_id uuid;
  v_payload  jsonb;
  v_j        jsonb;
  v_msg      text;
  v_row      public.pessoas_desvios%ROWTYPE;
  v_id1      uuid;
  v_id3      uuid;
  v_id3b     uuid;
  v_id4      uuid;
  v_t0       timestamptz;
  v_ms       numeric;
  v_ms2      numeric;
  v_com_mes  integer;
  v_custo_msg text;
  v_dias_mes integer;
  v_q        uuid;
  v_ver      uuid;
  v_ass      text;
  v_payload_ok jsonb;
  v_payload2 jsonb;
  v_per2     uuid;
  v_prova_q  text;
  v_prova_motivo text;
BEGIN
  -- 6.1 EXECUTE por aclexplode (sem o dono); SECURITY DEFINER; search_path vazio.
  FOREACH v_fn IN ARRAY v_rpcs || v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','
                               ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_fn = ANY (v_rpcs) AND v_grant <> 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: % devia ter EXECUTE so para authenticated; tem "%".', v_fn, v_grant;
    ELSIF v_fn <> ALL (v_rpcs) AND v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
    IF (v_fn = ANY (v_rpcs)) IS DISTINCT FROM
       (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER so se for RPC.', v_fn;
    END IF;
  END LOOP;

  -- 6.2 O fecho: mesma assinatura unica, definer, search_path vazio, EXECUTE
  --     so a authenticated, e o corpo e o antigo com SO o bloco trocado.
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
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(k_fechar)::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_dv_fechar_antigo t;
  SELECT replace(b.antigo, chr(13), ''), replace(b.novo, chr(13), '') INTO v_bl_ant, v_bl_novo FROM tmp_dv_blocos b;
  IF (length(v_src) - length(replace(v_src, v_bl_novo, ''))) / length(v_bl_novo) <> 1
     OR replace(v_src, v_bl_novo, v_bl_ant) IS DISTINCT FROM v_antigo THEN
    RAISE EXCEPTION 'Conferir: o corpo novo do fecho difere do de 20270109900000 em mais do que o bloco dos desvios.';
  END IF;

  -- 6.2b O validador de resultados: o corpo novo, sem as linhas acrescentadas,
  --      e o de 20270109900000 (prova que so ganhou o campo opcional).
  SELECT replace(p.prosrc, chr(13), '') INTO v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_processamento_resultado_erro(jsonb)')::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_dv_erro_antigo t;
  v_src := replace(v_src, chr(10) || $x$  k_opcionais constant text[] := ARRAY['desvios_assinatura'];$x$, '');
  v_src := replace(v_src, $x$WHERE k.chave <> ALL (k_chaves || k_opcionais);$x$, $x$WHERE k.chave <> ALL (k_chaves);$x$);
  -- O literal abaixo tem fins de linha do ficheiro (CRLF): tira-se o \r.
  v_src := replace(v_src, replace(
    $x$  -- desvios_assinatura (opcional): md5 (32 hexadecimais minusculos) ou null
  IF _r ? 'desvios_assinatura' THEN
    v_t := pg_catalog.jsonb_typeof(_r -> 'desvios_assinatura');
    IF v_t <> 'null' THEN
      IF v_t <> 'string' OR (_r ->> 'desvios_assinatura') !~ '^[0-9a-f]{32}$' THEN
        RETURN 'desvios_assinatura tem de ser um md5 (32 caracteres hexadecimais) ou null';
      END IF;
    END IF;
  END IF;

$x$, chr(13), ''), '');
  IF v_src IS DISTINCT FROM v_antigo THEN
    RAISE EXCEPTION 'Conferir: o validador de resultados mudou mais do que o campo opcional desvios_assinatura.';
  END IF;

  -- 6.3 Tabela: RLS forcada, uma politica de SELECT (defesa em profundidade),
  --     NENHUM privilegio de tabela (le-se so pelas RPCs), restricoes,
  --     exclusao deferrable, triggers.
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c
           WHERE c.oid = to_regclass('public.pessoas_desvios')) THEN
    RAISE EXCEPTION 'Conferir: pessoas_desvios devia ter RLS ligada e forcada.';
  END IF;
  SELECT string_agg((CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) || ':' || a.privilege_type::text,
                    ',' ORDER BY a.privilege_type::text) INTO v_grant
    FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.pessoas_desvios')
     AND a.grantee <> c.relowner;
  IF coalesce(v_grant, '') <> '' THEN
    RAISE EXCEPTION 'Conferir: pessoas_desvios nao devia ter privilegios de tabela para ninguem (le-se so por RPC); tem "%".', v_grant;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_desvios') AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: pessoas_desvios tem % colunas com privilegios proprios.', v_n;
  END IF;
  SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','), '')
    INTO v_grant
    FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.hr_desvios_config') AND a.grantee <> c.relowner;
  IF v_grant <> '' THEN
    RAISE EXCEPTION 'Conferir: hr_desvios_config nao devia ter privilegios de tabela; tem "%".', v_grant;
  END IF;
  IF (SELECT count(*) FROM pg_policies pl WHERE pl.schemaname::text = 'public' AND pl.tablename::text = 'pessoas_desvios') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies pl
                     WHERE pl.schemaname::text = 'public' AND pl.tablename::text = 'pessoas_desvios'
                       AND pl.cmd::text = 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: pessoas_desvios devia ter exactamente uma politica, de SELECT.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_desvios')
     AND c.conname::text IN ('pessoas_desvios_pkey', 'pessoas_desvios_org_fkey', 'pessoas_desvios_pessoa_fkey',
       'pessoas_desvios_config_fkey', 'pessoas_desvios_substitui_fkey', 'pessoas_desvios_substitui_outra',
       'pessoas_desvios_tipo_horario_valido', 'pessoas_desvios_estado_valido', 'pessoas_desvios_decisao_valida',
       'pessoas_desvios_margem_intervalo', 'pessoas_desvios_medidas_coerentes', 'pessoas_desvios_fora_da_margem',
       'pessoas_desvios_assinatura_md5', 'pessoas_desvios_decisao_coerente', 'pessoas_desvios_hora_extra_com_tempo',
       'pessoas_desvios_aceitar_com_motivo', 'pessoas_desvios_motivo_tamanho', 'pessoas_desvios_um_em_vigor');
  IF v_n <> 18 THEN
    RAISE EXCEPTION 'Conferir: restricoes em falta em pessoas_desvios (% de 18).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_desvios')
                    AND c.conname::text = 'pessoas_desvios_um_em_vigor'
                    AND c.contype::text = 'x' AND c.condeferrable AND NOT c.condeferred) THEN
    RAISE EXCEPTION 'Conferir: pessoas_desvios_um_em_vigor devia ser uma exclusao DEFERRABLE INITIALLY IMMEDIATE.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.pessoas_desvios') AND NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_pessoas_desvios_guarda', 'trg_pessoas_desvios_sem_truncate');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: faltam triggers de imutabilidade em pessoas_desvios (% de 2).', v_n;
  END IF;

  -- 6.4 Paridade com src/lib/hr/__fixtures__/desvios-casos.json (13 casos):
  --     as mesmas medidas e a mesma natureza que desvios.ts.
  FOR v_r IN
    SELECT * FROM (VALUES
      ('deslocado 30',         ARRAY['09:00-18:00'], ARRAY['09:30-18:30'], 10, false, 540, 540, 30, 30,   0, 30, 'desvio_horario'),
      ('igual',                ARRAY['09:00-18:00'], ARRAY['09:00-18:00'], 10, false, 540, 540,  0,  0,   0,  0, NULL),
      ('dentro da margem',     ARRAY['09:00-18:00'], ARRAY['09:05-18:05'], 10, false, 540, 540,  5,  5,   0,  5, NULL),
      ('25 a menos',           ARRAY['09:00-18:00'], ARRAY['09:00-17:35'], 10, false, 540, 515,  0, 25, -25,  0, 'tempo_a_menos'),
      ('almoco 1h',            ARRAY['09:00-13:00', '14:00-18:00'], ARRAY['09:00-12:00', '13:00-18:00'],
                                                                           10, false, 480, 480, 60, 60,   0, 60, 'desvio_horario'),
      ('almoco 30',            ARRAY['09:00-13:00', '14:00-18:00'], ARRAY['09:00-12:30', '13:30-18:00'],
                                                                           10, false, 480, 480, 30, 30,   0, 30, 'desvio_horario'),
      ('40 a mais',            ARRAY['09:00-18:00'], ARRAY['09:00-18:40'], 10, false, 540, 580, 40,  0,  40,  0, 'hora_extra'),
      ('realizado 0',          ARRAY['09:00-18:00'], ARRAY[]::text[],      10, true,  NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('planeado 0',           ARRAY[]::text[],      ARRAY['09:00-13:00'], 10, true,  NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('fronteira horario 10', ARRAY['09:00-18:00'], ARRAY['09:10-18:10'], 10, false, 540, 540, 10, 10,   0, 10, NULL),
      ('fronteira horario 11', ARRAY['09:00-18:00'], ARRAY['09:11-18:11'], 10, false, 540, 540, 11, 11,   0, 11, 'desvio_horario'),
      ('fronteira tempo -10',  ARRAY['09:00-18:00'], ARRAY['09:00-17:50'], 10, false, 540, 530,  0, 10, -10,  0, NULL),
      ('fronteira tempo +11',  ARRAY['09:00-18:00'], ARRAY['09:00-18:11'], 10, false, 540, 551, 11,  0,  11,  0, 'hora_extra')
    ) AS t(nome, planeado, realizado, margem, nulo, pm, rm, fm, em, dm, dh, natureza)
  LOOP
    SELECT range_agg(tsrange(k_dia + split_part(s, '-', 1)::time, k_dia + split_part(s, '-', 2)::time, '[)'))
      INTO v_pl FROM unnest(v_r.planeado) AS s;
    SELECT range_agg(tsrange(k_dia + split_part(s, '-', 1)::time, k_dia + split_part(s, '-', 2)::time, '[)'))
      INTO v_re FROM unnest(v_r.realizado) AS s;
    SELECT * INTO v_m FROM public.hr_desvios_medir(v_pl, v_re);
    IF v_r.nulo THEN
      IF NOT (v_m.planeado_min = 0 OR v_m.realizado_min = 0) THEN
        RAISE EXCEPTION 'Conferir: caso "%": devia ficar sem medidas (planeado ou realizado 0).', v_r.nome;
      END IF;
    ELSIF ROW(v_m.planeado_min, v_m.realizado_min, v_m.fora_min, v_m.em_falta_min, v_m.diferenca_min, v_m.desvio_horario_min)
          IS DISTINCT FROM ROW(v_r.pm, v_r.rm, v_r.fm, v_r.em, v_r.dm, v_r.dh)
       OR public.hr_desvios_natureza(v_m.diferenca_min, v_m.desvio_horario_min, v_r.margem) IS DISTINCT FROM v_r.natureza THEN
      RAISE EXCEPTION 'Conferir: caso "%": deu planeado %, realizado %, fora %, em falta %, diferenca %, desvio horario %, natureza %.',
        v_r.nome, v_m.planeado_min, v_m.realizado_min, v_m.fora_min, v_m.em_falta_min, v_m.diferenca_min,
        v_m.desvio_horario_min, coalesce(public.hr_desvios_natureza(v_m.diferenca_min, v_m.desvio_horario_min, v_r.margem), 'nenhuma');
    END IF;
  END LOOP;

  -- 6.5 Comportamento na nike, em 2099, DESFEITO no fim (sentinela HDV00).
  BEGIN
    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.view', k_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.retribuicao.view', k_nike)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.assiduidade.gerir/.view, hr.processamento.periodo.gerir/.view e hr.pessoas.retribuicao.view.';
    END IF;

    -- As obrigatorias de 2099-05 (o fecho exige o resultado de todas).
    CREATE TEMP TABLE tmp_dv_obrigatorias ON COMMIT DROP AS
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL
       AND v.data_inicio <= DATE '2099-05-31' AND (v.data_fim IS NULL OR v.data_fim >= DATE '2099-05-01')
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo';

    -- A pessoa de teste: obrigatoria, sem ligacao ao utilizador, sem isencao em 2099-05.
    SELECT o.id INTO v_p
      FROM tmp_dv_obrigatorias o
     WHERE NOT EXISTS (SELECT 1 FROM public.pessoas_contas pc
                        WHERE pc.pessoa_id = o.id AND pc.organization_id = k_nike AND pc.anew_user_id = v_autor)
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                        WHERE v.pessoa_id = o.id AND v.organization_id = k_nike AND v.deleted_at IS NULL
                          AND v.isencao_horario IS TRUE
                          AND v.data_inicio <= DATE '2099-05-31' AND (v.data_fim IS NULL OR v.data_fim >= DATE '2099-05-01'))
     ORDER BY o.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike nao ha pessoa activa com vinculo em 2099-05, sem isencao e sem ligacao ao utilizador de teste.';
    END IF;
    IF cardinality(public.hr_horas_extra_feriados(k_nike, k_d1, k_d4)) <> 0 THEN
      RAISE EXCEPTION 'Conferir: ha feriados da nike entre % e %; escolher outros dias de teste.', k_d1, k_d4;
    END IF;

    -- a) Custo da deteccao num mes real da nike (sem margem: so leitura, nada criado).
    v_t0 := clock_timestamp();
    v_j := public.hr_desvios_detetar_core(k_nike, current_date - 30, current_date, NULL);
    v_ms := round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000, 1);
    v_dias_mes := (v_j ->> 'dias_vistos')::integer;
    IF (v_j ->> 'criados')::integer <> 0 OR (v_j ->> 'substituidos')::integer <> 0 THEN
      RAISE EXCEPTION 'Conferir: sem margem configurada a deteccao nao devia criar nem substituir nada (%).', v_j::text;
    END IF;

    -- a2) O mesmo mes COM margem (le o planeado de cada pessoa-dia e escreve
    --     as versoes), numa subtransaccao desfeita (HDV02). Se a nike tiver
    --     uma folha fechada nesse mes, a margem e recusada e o custo fica por
    --     medir (dito no NOTICE).
    BEGIN
      v_custo_msg := NULL;
      BEGIN
        PERFORM public.hr_desvios_config_guardar_core(k_nike, current_date - 30, 10, v_autor);
      EXCEPTION WHEN OTHERS THEN v_custo_msg := SQLERRM;
      END;
      IF v_custo_msg IS NULL THEN
        v_t0 := clock_timestamp();
        v_j := public.hr_desvios_detetar_core(k_nike, current_date - 30, current_date, NULL);
        v_ms2 := round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000, 1);
        v_com_mes := (v_j ->> 'com_desvio')::integer;
      END IF;
      RAISE EXCEPTION 'custo_ok' USING ERRCODE = 'HDV02';
    EXCEPTION
      WHEN SQLSTATE 'HDV02' THEN NULL;
    END;

    -- b) Margem de 10 minutos desde 2099-01-01; folha 2099-05 aberta.
    v_cfg := public.hr_desvios_config_guardar_core(k_nike, DATE '2099-01-01', 10, v_autor);
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 5, 'aberto', DATE '2099-05-01', DATE '2099-05-31')
    RETURNING id INTO v_per;

    -- c) Planeado 09:00-18:00 em quatro dias (excepcoes por data) e o realizado:
    --    D1 09:30-18:30 (deslocado 30), D2 09:05-18:05 (dentro da margem),
    --    D3 09:00-18:40 (40 a mais), D4 09:00-17:35 (25 a menos).
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    INSERT INTO public.pessoas_horario_planeado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    SELECT v_p, k_nike, d, TIME '09:00', TIME '18:00'
      FROM unnest(ARRAY[k_d1, k_d2, k_d3, k_d4]) AS d;
    INSERT INTO public.pessoas_horario_realizado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, k_d1, TIME '09:30', TIME '18:30'),
           (v_p, k_nike, k_d2, TIME '09:05', TIME '18:05'),
           (v_p, k_nike, k_d3, TIME '09:00', TIME '18:40'),
           (v_p, k_nike, k_d4, TIME '09:00', TIME '17:35');

    SELECT * INTO v_esp FROM public.hr_desvios_intervalos_esperados(k_nike, v_p, k_d1);
    IF v_esp.modo IS DISTINCT FROM 'padrao' OR v_esp.tipo_horario IS DISTINCT FROM 'padrao'
       OR v_esp.janelas IS DISTINCT FROM tsmultirange(tsrange(k_d1 + TIME '09:00', k_d1 + TIME '18:00', '[)')) THEN
      RAISE EXCEPTION 'Conferir: os intervalos esperados de D1 deviam ser padrao 09:00-18:00; deram % %.', v_esp.modo, v_esp.janelas;
    END IF;

    -- d) Deteccao: tres desvios (D1, D3, D4); D2 dentro da margem.
    v_j := public.hr_desvios_detetar_core(k_nike, DATE '2099-05-01', DATE '2099-05-31', NULL);
    IF (v_j ->> 'criados')::integer <> 3 OR (v_j ->> 'substituidos')::integer <> 0 OR (v_j ->> 'com_desvio')::integer <> 3 THEN
      RAISE EXCEPTION 'Conferir: a deteccao devia criar 3 desvios; deu %.', v_j::text;
    END IF;
    SELECT * INTO v_row FROM public.pessoas_desvios d WHERE d.pessoa_id = v_p AND d.data = k_d1 AND d.estado <> 'substituido';
    IF ROW(v_row.planeado_min, v_row.realizado_min, v_row.fora_min, v_row.em_falta_min, v_row.diferenca_min,
           v_row.desvio_horario_min, v_row.margem_min, v_row.estado, v_row.config_id, v_row.tipo_horario)
       IS DISTINCT FROM ROW(540, 540, 30, 30, 0, 30, 10, 'a_validar'::text, v_cfg, 'padrao'::text) THEN
      RAISE EXCEPTION 'Conferir: D1 (09:30-18:30 contra 09:00-18:00) devia dar fora 30, em falta 30, diferenca 0, desvio horario 30, a_validar; deu fora %, em falta %, diferenca %, desvio %, %.',
        v_row.fora_min, v_row.em_falta_min, v_row.diferenca_min, v_row.desvio_horario_min, v_row.estado;
    END IF;
    v_id1 := v_row.id;
    IF EXISTS (SELECT 1 FROM public.pessoas_desvios d WHERE d.pessoa_id = v_p AND d.data = k_d2) THEN
      RAISE EXCEPTION 'Conferir: D2 (5 minutos, margem 10) esta dentro da margem e nao devia ter desvio.';
    END IF;
    SELECT d.id INTO v_id3 FROM public.pessoas_desvios d
     WHERE d.pessoa_id = v_p AND d.data = k_d3 AND d.estado = 'a_validar' AND d.diferenca_min = 40 AND d.fora_min = 40 AND d.em_falta_min = 0;
    SELECT d.id INTO v_id4 FROM public.pessoas_desvios d
     WHERE d.pessoa_id = v_p AND d.data = k_d4 AND d.estado = 'a_validar' AND d.diferenca_min = -25 AND d.em_falta_min = 25 AND d.fora_min = 0;
    IF v_id3 IS NULL OR v_id4 IS NULL THEN
      RAISE EXCEPTION 'Conferir: D3 devia ter diferenca 40 e D4 diferenca -25, a_validar.';
    END IF;

    -- e) Detetar outra vez sem mudancas: nada muda.
    v_j := public.hr_desvios_detetar_core(k_nike, DATE '2099-05-01', DATE '2099-05-31', NULL);
    IF (v_j ->> 'criados')::integer <> 0 OR (v_j ->> 'substituidos')::integer <> 0 THEN
      RAISE EXCEPTION 'Conferir: detetar de novo sem mudancas devia ser inerte; deu %.', v_j::text;
    END IF;

    -- f) As medidas nunca mudam, mesmo com a folha aberta.
    v_msg := NULL;
    BEGIN
      UPDATE public.pessoas_desvios SET planeado_min = 1 WHERE id = v_id4;
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('pessoas_desvios_imutavel' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: mudar as medidas de um desvio devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- g) Fecho com dias por validar: recusado.
    v_regra_id := (public.hr_regras_salariais_em(k_nike, DATE '2099-05-31') ->> 'id')::uuid;
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
      FROM tmp_dv_obrigatorias o;

    -- g0) O validador aceita desvios_assinatura (md5 ou null, ou ausente) e
    --     continua a recusar campos desconhecidos e campos em falta.
    IF public.hr_processamento_resultado_erro(v_payload -> 0) IS NOT NULL
       OR public.hr_processamento_resultado_erro(jsonb_set(v_payload -> 0, '{desvios_assinatura}', 'null'::jsonb)) IS NOT NULL
       OR public.hr_processamento_resultado_erro(jsonb_set(v_payload -> 0, '{desvios_assinatura}', to_jsonb(md5('x')))) IS NOT NULL
       OR coalesce(position('desvios_assinatura tem de ser'
                            IN public.hr_processamento_resultado_erro(jsonb_set(v_payload -> 0, '{desvios_assinatura}', '"xpto"'::jsonb))), 0) <> 1
       OR coalesce(position('desvios_assinatura tem de ser'
                            IN public.hr_processamento_resultado_erro(jsonb_set(v_payload -> 0, '{desvios_assinatura}', '12'::jsonb))), 0) <> 1
       OR coalesce(position('campos desconhecidos'
                            IN public.hr_processamento_resultado_erro(jsonb_set(v_payload -> 0, '{outro_campo}', '1'::jsonb))), 0) <> 1
       OR coalesce(position('falta o campo'
                            IN public.hr_processamento_resultado_erro((v_payload -> 0) - 'avisos')), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: o validador de resultados devia aceitar desvios_assinatura md5/null/ausente e recusar o resto.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_desvios_por_validar' IN v_msg), 0) <> 1
       OR coalesce(position('rpc_hr_desvios_detetar' IN v_msg), 0) = 0 THEN
      RAISE EXCEPTION 'Conferir: fechar com dias por validar devia dar processamento_fechar_desvios_por_validar (a dizer para detetar e validar antes); deu: %.', coalesce(v_msg, 'aceite');
    END IF;

    -- h) Validar: as recusas.
    FOR v_r IN
      SELECT t.nome, t.id, t.decisao, t.motivo, t.esperado
        FROM (VALUES
          ('hora extra sem tempo a mais', v_id1, 'hora_extra',     NULL::text, 'desvio_hora_extra_sem_tempo_a_mais'),
          ('decisao desconhecida',        v_id1, 'xpto',           NULL::text, 'desvio_decisao_invalida'),
          ('aceitar sem motivo',          v_id4, 'aceitar_desvio', NULL::text, 'desvio_motivo_obrigatorio'),
          ('aceitar com motivo vazio',    v_id4, 'aceitar_desvio', '   '::text, 'desvio_motivo_obrigatorio'),
          ('desvio inexistente',          gen_random_uuid(), 'normal', NULL::text, 'desvio_sem_permissao')
        ) AS t(nome, id, decisao, motivo, esperado)
    LOOP
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_desvio_validar(v_r.id, v_r.decisao, v_r.motivo);
      EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
      END;
      IF coalesce(position(v_r.esperado IN v_msg), 0) <> 1 THEN
        RAISE EXCEPTION 'Conferir: validar "%" devia dar % e deu: %.', v_r.nome, v_r.esperado, coalesce(v_msg, 'aceite');
      END IF;
    END LOOP;

    -- i) Ninguem valida os proprios desvios: liga-se (revogada) a conta do
    --    utilizador a pessoa de teste numa subtransaccao desfeita (HDV01).
    BEGIN
      INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id, estado, revogada_em)
      VALUES (v_p, k_nike, v_autor, 'revogada', now());
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_desvio_validar(v_id1, 'normal', NULL);
      EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
      END;
      IF coalesce(position('desvio_validar_proprio' IN v_msg), 0) <> 1 THEN
        RAISE EXCEPTION 'Conferir: validar os proprios desvios devia dar desvio_validar_proprio; deu: %.', coalesce(v_msg, 'aceite');
      END IF;
      RAISE EXCEPTION 'teste_proprio_ok' USING ERRCODE = 'HDV01';
    EXCEPTION
      WHEN SQLSTATE 'HDV01' THEN NULL;
    END;

    -- j) Sem permissao: recusado.
    v_falso := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvio_validar(v_id1, 'normal', NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvio_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: validar sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_detetar(k_nike, current_date - 6, current_date, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: detetar sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- k) Validar cada decisao, com o utilizador da nike.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_desvio_validar(v_id1, 'normal', NULL);
    IF (v_j ->> 'contado_min')::integer <> 540 OR (v_j ->> 'extra_min')::integer <> 0 THEN
      RAISE EXCEPTION 'Conferir: normal em D1 devia contar 540 e 0 extra; deu %.', v_j::text;
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvio_validar(v_id1, 'normal', NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvio_nao_esta_a_validar' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: validar duas vezes devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_j := public.rpc_hr_desvio_validar(v_id4, 'aceitar_desvio', 'saida antecipada combinada com a chefia');
    IF (v_j ->> 'contado_min')::integer <> 515 OR (v_j ->> 'extra_min')::integer <> 0 THEN
      RAISE EXCEPTION 'Conferir: aceitar_desvio em D4 devia contar 515 e 0 extra; deu %.', v_j::text;
    END IF;
    v_j := public.rpc_hr_desvio_validar(v_id3, 'hora_extra', NULL);
    IF (v_j ->> 'contado_min')::integer <> 580 OR (v_j ->> 'extra_min')::integer <> 40 THEN
      RAISE EXCEPTION 'Conferir: hora_extra em D3 devia contar 580 e 40 extra; deu %.', v_j::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_desvios d
                    WHERE d.id = v_id1 AND d.estado = 'validado' AND d.decisao = 'normal'
                      AND d.decidido_por = v_autor AND d.decidido_em IS NOT NULL) THEN
      RAISE EXCEPTION 'Conferir: a validacao de D1 devia ficar gravada com o autor.';
    END IF;

    -- l) Listar (view): tres validados, nenhum a validar.
    IF (SELECT count(*) FROM public.rpc_hr_desvios_listar(k_nike, NULL, k_d1, k_d4, v_p)) <> 3
       OR (SELECT count(*) FROM public.rpc_hr_desvios_listar(k_nike, 'a_validar', k_d1, k_d4, v_p)) <> 0
       OR (SELECT l.natureza FROM public.rpc_hr_desvios_listar(k_nike, 'validado', k_d1, k_d1, v_p) AS l) IS DISTINCT FROM 'desvio_horario'
       OR (SELECT l.realizado_inicio FROM public.rpc_hr_desvios_listar(k_nike, 'validado', k_d1, k_d1, v_p) AS l) IS DISTINCT FROM TIME '09:30' THEN
      RAISE EXCEPTION 'Conferir: listar devia dar 3 validados (D1 desvio_horario, realizado desde 09:30) e 0 a validar.';
    END IF;

    -- l2) O motivo: quem gere ve-o; quem so tem view (e nao e a pessoa) recebe NULL.
    IF (SELECT l.motivo FROM public.rpc_hr_desvios_listar(k_nike, 'validado', k_d4, k_d4, v_p) AS l)
       IS DISTINCT FROM 'saida antecipada combinada com a chefia' THEN
      RAISE EXCEPTION 'Conferir: quem tem hr.assiduidade.gerir devia ver o motivo de D4.';
    END IF;
    SELECT au.auth_user_id INTO v_ver
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike)
       AND NOT public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike)
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS DISTINCT FROM v_p
     ORDER BY au.id
     LIMIT 1;
    IF v_ver IS NULL THEN
      v_prova_motivo := 'nao provado: na nike nao ha utilizador com hr.assiduidade.view sem gerir';
    ELSE
      PERFORM set_config('request.jwt.claim.sub', v_ver::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_ver, 'role', 'authenticated')::text, true);
      IF (SELECT count(*) FROM public.rpc_hr_desvios_listar(k_nike, 'validado', k_d4, k_d4, v_p)) <> 1
         OR (SELECT l.motivo FROM public.rpc_hr_desvios_listar(k_nike, 'validado', k_d4, k_d4, v_p) AS l) IS NOT NULL THEN
        RAISE EXCEPTION 'Conferir: quem so tem hr.assiduidade.view devia ver o desvio de D4 sem o motivo.';
      END IF;
      v_prova_motivo := 'provado';
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    END IF;

    -- m) As picagens de D3 mudam (mais 20 minutos): a versao validada fica
    --    substituida e nasce outra a_validar que a substitui.
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    INSERT INTO public.pessoas_horario_realizado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, k_d3, TIME '18:40', TIME '19:00');
    v_j := public.hr_desvios_detetar_core(k_nike, DATE '2099-05-01', DATE '2099-05-31', NULL);
    IF (v_j ->> 'criados')::integer <> 1 OR (v_j ->> 'substituidos')::integer <> 1 THEN
      RAISE EXCEPTION 'Conferir: mudar o realizado de D3 devia substituir 1 e criar 1; deu %.', v_j::text;
    END IF;
    SELECT d.id INTO v_id3b FROM public.pessoas_desvios d
     WHERE d.pessoa_id = v_p AND d.data = k_d3 AND d.estado = 'a_validar'
       AND d.substitui_id = v_id3 AND d.realizado_min = 600 AND d.diferenca_min = 60;
    IF v_id3b IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.pessoas_desvios d
                       WHERE d.id = v_id3 AND d.estado = 'substituido' AND d.decisao = 'hora_extra') THEN
      RAISE EXCEPTION 'Conferir: D3 devia ficar com a versao validada substituida (decisao mantida) e uma nova a_validar (600 min, +60).';
    END IF;

    -- n) Agora sim: validar a nova e fechar.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_hr_desvio_validar(v_id3b, 'hora_extra', NULL);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_detetar(k_nike, current_date - 40, current_date, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_intervalo_excedido' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: 41 dias para a organizacao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_j := public.rpc_hr_desvios_detetar(k_nike, current_date - 6, current_date, NULL);
    IF (v_j ->> 'criados')::integer <> 0 THEN
      RAISE EXCEPTION 'Conferir: sem margem nos dias de hoje, detetar pela RPC nao devia criar nada (%).', v_j::text;
    END IF;

    -- n1) Uma pessoa NAO obrigatoria (arquivada ou sem vinculo em 2099-05)
    --     com um desvio a_validar nao bloqueia o fecho.
    SELECT p.id INTO v_q
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
       AND p.id NOT IN (SELECT o.id FROM tmp_dv_obrigatorias o)
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                        WHERE v.pessoa_id = p.id AND v.organization_id = k_nike AND v.deleted_at IS NULL
                          AND v.isencao_horario IS TRUE
                          AND v.data_inicio <= DATE '2099-05-31' AND (v.data_fim IS NULL OR v.data_fim >= DATE '2099-05-01'))
     ORDER BY p.id
     LIMIT 1;
    IF v_q IS NULL THEN
      v_prova_q := 'nao provado: na nike nao ha pessoa nao obrigatoria em 2099-05';
    ELSE
      PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
      INSERT INTO public.pessoas_horario_planeado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
      VALUES (v_q, k_nike, k_d1, TIME '09:00', TIME '18:00');
      INSERT INTO public.pessoas_horario_realizado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
      VALUES (v_q, k_nike, k_d1, TIME '09:30', TIME '18:30');
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    END IF;

    -- n2) As assinaturas: sem permissao recusado; com o utilizador da nike,
    --     a de v_p e o md5 das tres decisoes (D1 normal, D3 hora_extra,
    --     D4 aceitar_desvio), por data.
    v_falso := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_desvios_assinaturas(v_per);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler as assinaturas sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT s.assinatura INTO v_ass FROM public.rpc_hr_desvios_assinaturas(v_per) AS s WHERE s.pessoa_id = v_p;
    IF v_ass IS DISTINCT FROM md5(to_char(k_d1, 'YYYY-MM-DD') || ':validado:normal,'
                                  || to_char(k_d3, 'YYYY-MM-DD') || ':validado:hora_extra,'
                                  || to_char(k_d4, 'YYYY-MM-DD') || ':validado:aceitar_desvio') THEN
      RAISE EXCEPTION 'Conferir: a assinatura dos desvios de v_p nao e a esperada (%).', coalesce(v_ass, 'NULL');
    END IF;

    -- n3) Fechar sem a assinatura, ou com uma errada: desactualizados.
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_desvios_desactualizados' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: fechar sem desvios_assinatura devia dar processamento_fechar_desvios_desactualizados; deu: %.', coalesce(v_msg, 'aceite');
    END IF;
    SELECT jsonb_agg(CASE WHEN (e.value ->> 'pessoa_id')::uuid = v_p
                          THEN e.value || jsonb_build_object('desvios_assinatura', md5('outra coisa'))
                          ELSE e.value END ORDER BY e.ord)
      INTO v_payload_ok
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload_ok);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_fechar_desvios_desactualizados' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: fechar com uma desvios_assinatura errada devia dar processamento_fechar_desvios_desactualizados; deu: %.', coalesce(v_msg, 'aceite');
    END IF;

    -- n4) Com a assinatura de cada pessoa (null para quem nao tem desvios): fecha.
    SELECT jsonb_agg(e.value || jsonb_build_object('desvios_assinatura', s.assinatura) ORDER BY e.ord)
      INTO v_payload_ok
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)
      LEFT JOIN public.rpc_hr_desvios_assinaturas(v_per) AS s ON s.pessoa_id = (e.value ->> 'pessoa_id')::uuid;
    PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload_ok);
    IF (SELECT pp.estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per) IS DISTINCT FROM 'fechado' THEN
      RAISE EXCEPTION 'Conferir: com todos os dias validados e as assinaturas certas o fecho devia passar.';
    END IF;
    IF v_q IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.pessoas_desvios d
                      WHERE d.pessoa_id = v_q AND d.data = k_d1 AND d.estado = 'a_validar') THEN
        RAISE EXCEPTION 'Conferir: o fecho devia ter detetado o desvio da pessoa nao obrigatoria (e fechado na mesma).';
      END IF;
      v_prova_q := 'provado';
    END IF;

    -- o) Depois do fecho: nada muda nos dias da folha (mesmo ao dono).
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    v_n := 0;
    BEGIN UPDATE public.pessoas_desvios SET estado = 'substituido' WHERE id = v_id1;
    EXCEPTION WHEN OTHERS THEN IF position('pessoas_desvios_periodo_fechado' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN
      INSERT INTO public.pessoas_desvios (organization_id, pessoa_id, data, config_id, margem_min, planeado_min,
        realizado_min, fora_min, em_falta_min, diferenca_min, desvio_horario_min, assinatura)
      SELECT d.organization_id, d.pessoa_id, k_d2, d.config_id, d.margem_min, d.planeado_min, d.realizado_min,
             d.fora_min, d.em_falta_min, d.diferenca_min, d.desvio_horario_min, d.assinatura
        FROM public.pessoas_desvios d WHERE d.id = v_id1;
    EXCEPTION WHEN OTHERS THEN IF position('pessoas_desvios_periodo_fechado' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.pessoas_desvios WHERE id = v_id1;
    EXCEPTION WHEN OTHERS THEN IF position('pessoas_desvios_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN TRUNCATE public.pessoas_desvios;
    EXCEPTION WHEN OTHERS THEN IF position('pessoas_desvios_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Conferir: das 4 escritas proibidas depois do fecho (UPDATE, INSERT, DELETE, TRUNCATE) so % foram recusadas.', v_n;
    END IF;
    -- Uma picagem nova num dia da folha fechada nao reabre nada.
    INSERT INTO public.pessoas_horario_realizado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, k_d2, TIME '18:05', TIME '18:45');
    v_j := public.hr_desvios_detetar_core(k_nike, DATE '2099-05-01', DATE '2099-05-31', NULL);
    IF (v_j ->> 'dias_vistos')::integer <> 0 OR (v_j ->> 'criados')::integer <> 0 OR (v_j ->> 'substituidos')::integer <> 0 THEN
      RAISE EXCEPTION 'Conferir: depois do fecho a deteccao nao devia ver nem mudar dias da folha; deu %.', v_j::text;
    END IF;

    -- p) "Sem margem": uma versao NULL desde 2099-06-01 desliga a funcionalidade.
    --    Um dia deslocado 30 minutos em junho nao gera desvio, e a folha de
    --    junho fecha sem desvios_assinatura (nao deteta nem bloqueia).
    v_cfg := public.hr_desvios_config_guardar_core(k_nike, DATE '2099-06-01', NULL, v_autor);
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 6, 'aberto', DATE '2099-06-01', DATE '2099-06-30')
    RETURNING id INTO v_per2;
    INSERT INTO public.pessoas_horario_planeado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, DATE '2099-06-01', TIME '09:00', TIME '18:00');
    INSERT INTO public.pessoas_horario_realizado (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_p, k_nike, DATE '2099-06-01', TIME '09:30', TIME '18:30');
    v_j := public.hr_desvios_detetar_core(k_nike, DATE '2099-06-01', DATE '2099-06-30', NULL);
    IF (v_j ->> 'criados')::integer <> 0 OR (v_j ->> 'com_desvio')::integer <> 0
       OR EXISTS (SELECT 1 FROM public.pessoas_desvios d WHERE d.organization_id = k_nike AND d.data >= DATE '2099-06-01') THEN
      RAISE EXCEPTION 'Conferir: com a margem NULL em vigor a deteccao nao devia criar desvios; deu %.', v_j::text;
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
             'pessoa_id', x.id, 'valor_hora', 8, 'total_bruto', 1000,
             'totais', jsonb_build_object(
               'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
               'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
             'linhas', jsonb_build_array(),
             'avisos', jsonb_build_array(),
             'retribuicao_id', NULL, 'cargo_periodo_id', NULL,
             'regra_salarial_id', (public.hr_regras_salariais_em(k_nike, DATE '2099-06-30') ->> 'id')::uuid) ORDER BY x.id)
      INTO v_payload2
      FROM (SELECT DISTINCT p.id
              FROM public.pessoas p
              JOIN public.pessoas_vinculos v
                ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL
               AND v.data_inicio <= DATE '2099-06-30' AND (v.data_fim IS NULL OR v.data_fim >= DATE '2099-06-01')
             WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo') AS x;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_hr_processamento_periodo_fechar(v_per2, v_payload2);
    IF (SELECT pp.estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per2) IS DISTINCT FROM 'fechado'
       OR EXISTS (SELECT 1 FROM public.pessoas_desvios d WHERE d.organization_id = k_nike AND d.data >= DATE '2099-06-01') THEN
      RAISE EXCEPTION 'Conferir: com a margem NULL em vigor a folha de junho devia fechar sem detetar nada.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    RAISE NOTICE 'Conferir: deteccao de 31 dias reais da nike, % pessoa-dias vistos: sem margem % ms; com margem de 10 min % (% dias com desvio, desfeito). Pessoa nao obrigatoria nao bloqueia: %. Motivo escondido a quem so tem view: %.',
      v_dias_mes, v_ms,
      coalesce(v_ms2::text || ' ms', 'por medir: ' || coalesce(v_custo_msg, '?')),
      coalesce(v_com_mes::text, '-'),
      coalesce(v_prova_q, '?'), coalesce(v_prova_motivo, '?');
    RAISE EXCEPTION 'teste_desvios_ok' USING ERRCODE = 'HDV00';
  EXCEPTION
    WHEN SQLSTATE 'HDV00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.pessoas_desvios)
     OR EXISTS (SELECT 1 FROM public.hr_desvios_config)
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike AND pp.ano = 2099)
     OR EXISTS (SELECT 1 FROM public.pessoas_horario_realizado h WHERE h.organization_id = k_nike AND h.data >= DATE '2099-01-01')
     OR EXISTS (SELECT 1 FROM public.pessoas_horario_planeado h WHERE h.organization_id = k_nike AND h.data >= DATE '2099-01-01') THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: medidas iguais as de desvios.ts nos 13 casos; deteccao em lote (dentro da margem sem desvio, 09:30-18:30 = fora 30, em falta 30, diferenca 0, horario 30; idempotente; picagem nova substitui a versao validada); validacao normal/hora_extra/aceitar_desvio com recusas (propria pessoa, sem permissao, sem motivo, hora extra sem tempo a mais); fecho recusado com dias por validar de obrigatorias e com desvios_assinatura em falta ou errada, aceite depois; margem NULL nao deteta nem bloqueia; nada muda depois do fecho; pessoas_desvios sem privilegios de tabela; RPCs so para authenticated.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so
--    20270110500000 e este, acima de 20270109900000.
-- 2. Prova na nike ANTES do push: correr os dois ficheiros numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo); as guardas confirmam o
--    corpo do fecho no remoto, o conferir prova o resto e diz o custo da
--    deteccao de um mes real da nike (NOTICE).
-- 3. Cliente (E5-E7) antes de alguem gravar uma margem: o fecho passa a
--    poder recusar com processamento_fechar_desvios_por_validar.
-- ==============================================================================
