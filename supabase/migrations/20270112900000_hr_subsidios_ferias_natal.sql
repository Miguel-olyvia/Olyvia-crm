-- ==============================================================================
-- Subsidios de ferias e de Natal: a configuracao do pagamento por organizacao
-- (a partir de que data se pagam e em que folha cada um) e a gravacao dos dois
-- valores no fecho da folha (totais.subsidio_ferias / totais.subsidio_natal),
-- com o fecho LIGADO a configuracao por uma assinatura (subsidios_assinatura),
-- como as horas extra e os desvios.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth), e
-- confirmar que 20270112500000 ja esta aplicada (o validador e o fecho
-- esperados sao os de depois dela) e que este ficheiro fica acima do maximo
-- aplicado (em 10/11/2026 o remoto ja tinha 20270112740000); (2) correr a
-- prova na nike em transaccao desfeita ANTES do push (o conferir abaixo e essa
-- prova; trocar o COMMIT final por ROLLBACK); (3) revisao
-- ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO? -------------------------------------
--
-- SO QUANDO UMA ORGANIZACAO LIGAR O PAGAMENTO. O push nao parte o fecho de
-- nenhuma organizacao com o pagamento desligado (todas, a tabela nasce vazia):
-- o validador passa a ACEITAR (opcionais) totais.subsidio_ferias,
-- totais.subsidio_natal e subsidios_assinatura, sem os exigir; o cliente de
-- hoje, que nao os envia, continua a fechar exactamente como antes.
-- Uma organizacao que ligue o pagamento (rpc_hr_subsidios_config_guardar com
-- data) passa a ter o fecho das folhas cobertas a exigir as duas chaves e a
-- assinatura: com o cliente antigo, fechar essas folhas e recusado com HRA90
-- (processamento_fechar_subsidios_desactualizados), a folha fica aberta e nada
-- se grava. Por isso o ecra da configuracao (que e o unico caminho para ligar)
-- e o calculo novo entram juntos no cliente.
--
-- ORDEM OBRIGATORIA: PUSH DESTA MIGRATION PRIMEIRO, CLIENTE NOVO DEPOIS.
-- O cliente novo envia SEMPRE totais.subsidio_ferias e totais.subsidio_natal
-- (9 chaves em totais) e o validador de hoje no remoto so aceita as 7 de
-- k_totais: se o cliente sair ANTES do push, fechar QUALQUER folha, em TODAS
-- as organizacoes, falha com "campos desconhecidos em totais".
-- Depois do push, o cliente novo funciona com o pagamento desligado (as
-- chaves sao opcionais e aceites). Para LIGAR o pagamento, o cliente tem de
-- enviar subsidios_assinatura (lida de rpc_hr_subsidios_assinatura) em cada
-- resultado; sem ela o fecho das folhas cobertas e recusado com HRA90.
--
-- O cliente novo tem de:
--   - ler a configuracao por rpc_hr_subsidios_config_ler e grava-la por
--     rpc_hr_subsidios_config_guardar (ecra das regras salariais);
--   - ao calcular uma folha, ler rpc_hr_subsidios_assinatura(periodo_id) NUMA
--     SO chamada (devolve a configuracao usada E a assinatura dela), calcular
--     os subsidios com ESSES meses e, ao fechar, enviar em CADA resultado:
--       subsidios_assinatura = o campo "assinatura" lido (md5) quando
--         "aplica" e true; com "aplica" false, omitir o campo (ou null);
--       totais.subsidio_ferias e totais.subsidio_natal (number com |valor|
--         ate 10000000, ou null; null/0 = nao paga nesta folha): OBRIGATORIOS
--         quando "aplica" e true; com "aplica" false podem omitir-se.
--   - traduzir HRA90 (mensagem processamento_fechar_subsidios_desactualizados)
--     como "a configuracao dos subsidios mudou desde o calculo; recarregar,
--     recalcular e voltar a fechar".
--
-- A ASSINATURA (o que o servidor recalcula no fecho e compara). O cliente NAO
-- a precisa de calcular: le-a pronta em rpc_hr_subsidios_assinatura (o mesmo
-- padrao de rpc_hr_horas_extra_assinaturas e rpc_hr_desvios_assinaturas).
-- Para quem a quiser reproduzir (testes), e:
--   md5 (hex, 32 caracteres minusculos) do texto ASCII
--     'hr_subsidios:v1:' || ativo_desde em 'YYYY-MM-DD' || ':' || ferias_mes
--       || ':' || natal_mes
--   com os meses em decimal sem zeros a esquerda (1..12). Exemplo:
--   ativo_desde 2027-01-01, ferias 6, Natal 11 -> texto
--   'hr_subsidios:v1:2027-01-01:6:11' -> d74503770973ffd487137ae2117b58e2.
--   Implementada uma so vez, em public.hr_subsidios_assinatura(date, integer,
--   integer), que o fecho e a RPC chamam. Pagamento desligado: sem assinatura.
--
-- DESLIGADO POR OMISSAO: a tabela nasce vazia; sem linha = desligado, meses 6 e
-- 11. Nenhuma organizacao paga subsidios ate alguem os ligar.
--
--
-- -- QUANDO SE PAGA: data de activacao e mes da folha --------------------------
--
-- Fala-se sempre em "folha de mes/ano": o rotulo (hr_periodos_processamento.
-- ano, mes) da folha, que nao tem de coincidir com as datas que ela cobre.
--   - ACTIVACAO: uma folha esta coberta pelo pagamento quando o seu ULTIMO dia
--     (data_fim) e >= ativo_desde. Compara-se data_fim, nao o rotulo.
--   - MES DO SUBSIDIO: a folha de mes/ano paga o subsidio de ferias quando o
--     seu rotulo mes = ferias_mes (idem Natal com natal_mes). Usa-se o rotulo
--     (ano, mes), nao as datas.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. public.hr_subsidios_config (UMA linha por organizacao, PK organization_id,
--    FK a anew_organizations ON DELETE CASCADE como hr_horas_extra_config):
--      ativo_desde date NULL  NULL = desligado. Com data: so pagam as folhas com
--                             data_fim >= ativo_desde. CHECK 2000-01-01..2100-12-31.
--      ferias_mes smallint NOT NULL DEFAULT 6   CHECK 1..12 (rotulo mes da folha)
--      natal_mes  smallint NOT NULL DEFAULT 11  CHECK 1..12 (rotulo mes da folha)
--      created_at, updated_at (trigger update_updated_at_column), updated_by.
--    public.hr_subsidios_config_eventos: so de acrescentar (UPDATE, DELETE e
--    TRUNCATE recusados por trigger), uma linha por alteracao (config_alterada,
--    dados {antes, depois, linha_criada}).
--    As duas: RLS FORCADA, sem politicas, sem privilegios para PUBLIC, anon,
--    authenticated nem service_role. So as RPCs.
--
-- 2. public.hr_subsidios_assinatura(p_ativo_desde date, p_ferias_mes integer,
--      p_natal_mes integer) RETURNS text: INTERNA (sem EXECUTE para ninguem),
--    STABLE, a assinatura acima; NULL com p_ativo_desde NULL.
--
-- 3. rpc_hr_subsidios_config_ler(p_organization_id uuid) RETURNS jsonb
--      {tem_config, ativo_desde, ferias_mes, natal_mes, folhas_fechadas_desde,
--       ultima_folha_fechada_ate}
--    A permissao da leitura das regras salariais (rpc_hr_regras_salariais_ler):
--    hr.vencimento.codigos.view OU hr.vencimento.codigos.gerir OU
--    hr.vencimento.subsidio.view na organizacao.
--      folhas_fechadas_desde    = data_inicio da PRIMEIRA folha fechada com o
--                                 pagamento ligado (data_fim >= ativo_desde);
--                                 null se nenhuma. Nao null = a data ja nao se
--                                 desliga nem se adia.
--      ultima_folha_fechada_ate = data_fim da ultima folha fechada da
--                                 organizacao (ligar so a partir do dia seguinte).
--
-- 4. rpc_hr_subsidios_assinatura(p_periodo_id uuid) RETURNS jsonb
--      {aplica, ano, mes, ativo_desde, ferias_mes, natal_mes, paga_ferias,
--       paga_natal, assinatura}
--    Para o calculo e o fecho de UMA folha: aplica = pagamento ligado e
--    data_fim da folha >= ativo_desde; paga_ferias / paga_natal = aplica e o
--    rotulo mes da folha e o do subsidio; assinatura = a de cima (null sem
--    aplica). Exige hr.processamento.periodo.gerir OU
--    hr.processamento.periodo.view na organizacao da folha (inexistente e sem
--    permissao: a mesma recusa 42501). So le datas e meses, nenhum valor.
--
-- 5. rpc_hr_subsidios_config_guardar(p_organization_id uuid, p_ativo_desde date,
--      p_ferias_mes integer, p_natal_mes integer)
--      RETURNS jsonb {alterada, ativo_desde, ferias_mes, natal_mes}
--    hr.vencimento.codigos.gerir (a de rpc_hr_regras_salariais_guardar),
--    verificada ANTES do lock e de ler qualquer dado. Lock advisory da
--    organizacao (chave 'hr_periodos_processamento:' das regras salariais, da
--    margem dos desvios e das horas extra) e FOR SHARE das folhas que acabam a
--    partir da mais antiga das duas datas (antiga e nova). Regras:
--      a) meses 1..12, obrigatorios (HRA81);
--      b) ativo_desde de 2000-01-01 ate hoje (Lisboa) + 5 anos (HRA81);
--      c) mudar ativo_desde para uma data em ou antes do data_fim de uma folha
--         FECHADA: recusado (HRA88) -- nao se paga retroactivamente;
--      d) desligar ou adiar deixando de cobrir uma folha fechada que a data
--         antiga cobria: recusado (HRA88) -- depois de uma folha fechada com o
--         pagamento ligado, a data fica congelada (como as horas extra);
--      e) MESES (regra abaixo): recusado com HRA89;
--      f) nada muda: alterada=false, sem evento e sem criar linha;
--      g) evento config_alterada com antes e depois.
--    Mudar os meses com uma folha ABERTA ja calculada no browser nao se recusa
--    aqui: e o fecho que a apanha (a assinatura muda; HRA90).
--
-- 6. hr_processamento_resultado_erro(jsonb): troca de texto (guarda md5 sobre
--    o corpo vivo), 4 trocas. Passam a ser aceites, todas OPCIONAIS:
--      subsidios_assinatura (md5 de 32 hexadecimais minusculos, ou null);
--      totais.subsidio_ferias e totais.subsidio_natal (quando presentes:
--        number com |valor| <= 10000000, ou null).
--    k_totais (as 7 obrigatorias) NAO muda. O validador e IMMUTABLE e nao
--    conhece a folha: a obrigatoriedade condicional faz-se no fecho.
--
-- 7. rpc_hr_processamento_periodo_fechar(uuid, jsonb): troca de texto (guarda
--    md5 sobre o corpo vivo), um bloco novo antes de "Gravar e fechar". Le a
--    configuracao da organizacao da folha (depois do FOR UPDATE da folha):
--      pagamento ligado para a folha (ativo_desde nao null e data_fim >=
--      ativo_desde):
--        - algum resultado sem subsidios_assinatura, ou com uma diferente da
--          recalculada (hr_subsidios_assinatura da configuracao actual):
--          recusa HRA90 processamento_fechar_subsidios_desactualizados;
--        - algum resultado sem totais.subsidio_ferias ou totais.subsidio_natal:
--          recusa 22023 processamento_fechar_resultado_mal_formado;
--        - totais.subsidio_ferias com valor (nao null e nao 0) numa folha cujo
--          rotulo mes nao e ferias_mes (idem subsidio_natal com natal_mes), ou
--          qualquer dos dois negativo: recusa 22023
--          processamento_fechar_resultado_mal_formado. 0 e null aceites em
--          qualquer folha;
--      pagamento desligado para a folha:
--        - as duas chaves de totais sao opcionais (gravam-se se vierem);
--        - um resultado com subsidios_assinatura NAO null e recusado com HRA90:
--          foi calculado com o pagamento ligado e entretanto desligou-se ou a
--          data passou para depois da folha (pagaria um subsidio desligado).
--          Ausente ou null: aceite.
--    Corrida com rpc_hr_subsidios_config_guardar: o guardar toma FOR SHARE das
--    folhas a partir da data e o fecho segura FOR UPDATE da sua; quem chega
--    segundo espera e ve o que o primeiro gravou (o fecho le a configuracao
--    numa instrucao posterior ao lock). Nao se tranca a linha da
--    configuracao no fecho (evita a ordem inversa de locks).
--    O servidor confere a FORMA dos dois valores e a configuracao com que foram
--    calculados, nao os valores (tal como os outros totais).
--
--
-- -- A REGRA DOS MESES (decisao tomada aqui, a validar) -------------------------
--
-- Mudar ferias_mes ou natal_mes nunca toca em folhas ja fechadas (os valores
-- ficaram gravados no fecho). So se aplica com o pagamento ligado e com pelo
-- menos uma folha fechada coberta (data_fim >= ativo_desde). Seja a folha de
-- U/Y (rotulo mes/ano) a ULTIMA folha fechada coberta. Para cada subsidio cujo
-- mes muda de A para N, recusa (HRA89) se:
--   - PAGAR DUAS VEZES: o subsidio JA FOI PAGO em Y -- ha uma folha fechada
--     coberta de A/Y com totais.<subsidio> > 0 gravado em pelo menos um
--     resultado (o dinheiro realmente gravado, nao so a folha fechada) -- e
--     N > U (voltaria a ser pago na folha de N/Y); ou
--   - NUNCA PAGAR: A > U (a folha de A/Y ainda nao fechou) e N <= U (a folha de
--     N/Y ja fechou).
-- Os dois meses ja passados, ou os dois por vir, sao aceites (o ano Y paga
-- uma vez; o seguinte paga no mes novo). Mudar ao mesmo tempo a data e os
-- meses: a data so pode mudar sem folhas fechadas cobertas, e entao a regra
-- dos meses nao se aplica.
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Nenhum comportamento: a tabela nasce vazia (desligado em todas); o validador
-- so passa a aceitar tres chaves opcionais; o fecho, com o pagamento
-- desligado, so recusa uma subsidios_assinatura nao null (que o cliente de
-- hoje nao envia). A Mudelar nao esta nesta base; a prova so le e escreve na
-- nike, e tudo o que escreve e desfeito.
--
--
-- -- CODIGOS DE ERRO -----------------------------------------------------------
--
--   RPCs da configuracao (MESSAGE = codigo, como nas RPCs de horas extra):
--   reutilizados (mesmo sentido): 42501 insufficient_privilege (sem sessao, sem
--   permissao, sessao sem utilizador), HRA10 pedido_invalido (organizacao ou
--   folha null), HRA81 config_invalida (meses fora de 1..12 ou null; data fora
--   de 2000-01-01..hoje+5 anos).
--   novos (livres em todas as migrations e no cliente, lido em 10/11/2026; o
--   ultimo usado era HRA87):
--     HRA88 subsidios_folha_fechada  -- regras c) e d); DETAIL diz qual folha.
--     HRA89 subsidios_mes_bloqueado  -- regra dos meses; DETAIL diz qual.
--     HRA90 processamento_fechar_subsidios_desactualizados (no fecho; MESSAGE
--           comeca por este prefixo, como os outros erros do fecho) -- a
--           assinatura falta ou nao e a da configuracao actual, ou vem nao null
--           com o pagamento desligado para a folha. O cliente traduz HRA90.
--   HRA87 (folha_fechada das horas extra) NAO e reutilizado: o cliente traduz
--   esse codigo como sendo das horas extra.
--   processamento_fechar_resultado_mal_formado (22023): falta de
--   totais.subsidio_ferias / subsidio_natal com o pagamento ligado, ou valor
--   fora da folha do mes do subsidio, ou valor negativo.
--   hr_subsidios_fora_de_transaccao (25000).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova (e com o
-- cliente antigo): desfazer as trocas do fecho e do validador (guarda md5
-- sobre os corpos novos), largar as tres RPCs, hr_subsidios_assinatura, a
-- funcao do trigger e, depois de exportar, as duas tabelas.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'hr_subsidios_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- As trocas de texto: funcao, ancora (uma linha), substituto, vezes -------
-- As ancoras contam-se no texto de pg_get_functiondef (o que se troca) e
-- aplicam-se por ordem.
CREATE TEMP TABLE tmp_hs_trocas (ordem integer PRIMARY KEY, fn text NOT NULL, ancora text NOT NULL,
                                 novo text NOT NULL, vezes integer NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_hs_trocas (ordem, fn, ancora, novo, vezes) VALUES
-- V1. O validador: subsidios_assinatura entra nas chaves OPCIONAIS.
(1, 'public.hr_processamento_resultado_erro(jsonb)',
 $x$ARRAY['desvios_assinatura', 'horas_extra_assinatura'];$x$,
 $x$ARRAY['desvios_assinatura', 'horas_extra_assinatura', 'subsidios_assinatura'];$x$,
 1),
-- V2. O validador: a forma de subsidios_assinatura, antes de valor_hora.
(2, 'public.hr_processamento_resultado_erro(jsonb)',
 '  -- valor_hora: number >= 0 e <= 10000, ou null',
$blk$  -- subsidios_assinatura (opcional, desde 20270112900000): md5 (32 hexadecimais minusculos) ou null
  IF _r ? 'subsidios_assinatura' THEN
    v_t := pg_catalog.jsonb_typeof(_r -> 'subsidios_assinatura');
    IF v_t <> 'null' THEN
      IF v_t <> 'string' OR (_r ->> 'subsidios_assinatura') !~ '^[0-9a-f]{32}$' THEN
        RETURN 'subsidios_assinatura tem de ser um md5 (32 caracteres hexadecimais) ou null';
      END IF;
    END IF;
  END IF;

  -- valor_hora: number >= 0 e <= 10000, ou null$blk$,
 1),
-- V3. O validador: subsidio_ferias e subsidio_natal deixam de ser
--     "campos desconhecidos em totais" (continuam fora de k_totais: nao
--     obrigatorias).
(3, 'public.hr_processamento_resultado_erro(jsonb)',
 '   WHERE k.chave <> ALL (k_totais);',
 $x$   WHERE k.chave <> ALL (k_totais || ARRAY['subsidio_ferias', 'subsidio_natal']);$x$,
 1),
-- V4. O validador: a forma das duas, quando presentes, antes de linhas.
(4, 'public.hr_processamento_resultado_erro(jsonb)',
 '  -- linhas: array de objectos com origem e valor',
$blk$  -- totais.subsidio_ferias / totais.subsidio_natal (OPCIONAIS desde 20270112900000;
  -- o fecho exige-as com o pagamento ligado para a folha): number ou null
  FOREACH v_k IN ARRAY ARRAY['subsidio_ferias', 'subsidio_natal'] LOOP
    IF (_r -> 'totais') ? v_k THEN
      v_t := pg_catalog.jsonb_typeof(_r -> 'totais' -> v_k);
      IF v_t = 'number' THEN
        IF pg_catalog.abs((_r -> 'totais' ->> v_k)::numeric) > k_max THEN
          RETURN 'totais.' || v_k || ' fora do intervalo';
        END IF;
      ELSIF v_t <> 'null' THEN
        RETURN 'totais.' || v_k || ' tem de ser numero ou null';
      END IF;
    END IF;
  END LOOP;

  -- linhas: array de objectos com origem e valor$blk$,
 1),
-- F1. O fecho: o bloco dos subsidios antes de "Gravar e fechar".
(5, 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
 '  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------',
$blk$  -- ---- Subsidios de ferias e de Natal (desde 20270112900000) ----------------
  -- Pagamento ligado para esta folha (hr_subsidios_config.ativo_desde nao null
  -- e data_fim >= ativo_desde): TODOS os resultados trazem
  -- subsidios_assinatura igual a da configuracao actual (o cliente le-a em
  -- rpc_hr_subsidios_assinatura ao calcular) e as chaves
  -- totais.subsidio_ferias e totais.subsidio_natal. Desligado para esta folha:
  -- as chaves sao opcionais e uma subsidios_assinatura nao null e recusada (o
  -- calculo foi feito com o pagamento ligado). A configuracao le-se depois do
  -- FOR UPDATE da folha: rpc_hr_subsidios_config_guardar toma FOR SHARE dela.
  DECLARE
    v_sb_desde  date;
    v_sb_ferias integer;
    v_sb_natal  integer;
    v_sb_ass    text;
  BEGIN
    SELECT c.ativo_desde, c.ferias_mes, c.natal_mes INTO v_sb_desde, v_sb_ferias, v_sb_natal
      FROM public.hr_subsidios_config c
     WHERE c.organization_id = v_periodo.organization_id;
    IF v_sb_desde IS NOT NULL AND v_periodo.data_fim >= v_sb_desde THEN
      v_sb_ass := public.hr_subsidios_assinatura(v_sb_desde, v_sb_ferias, v_sb_natal);

      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE (e.value ->> 'subsidios_assinatura') IS DISTINCT FROM v_sb_ass
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_subsidios_desactualizados: o resultado da pessoa % nao foi calculado com a configuracao actual dos subsidios (pagamento desde %, ferias na folha do mes %, Natal na folha do mes %); recarregar a pagina, recalcular e voltar a fechar a folha de %/%.',
          v_exemplo, pg_catalog.to_char(v_sb_desde, 'YYYY-MM-DD'), v_sb_ferias, v_sb_natal, v_periodo.mes, v_periodo.ano
          USING ERRCODE = 'HRA90';
      END IF;

      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE NOT ((e.value -> 'totais') ? 'subsidio_ferias')
          OR NOT ((e.value -> 'totais') ? 'subsidio_natal')
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: pessoa %: com o pagamento dos subsidios ligado para a folha de %/%, falta totais.subsidio_ferias ou totais.subsidio_natal.',
          v_exemplo, v_periodo.mes, v_periodo.ano
          USING ERRCODE = '22023';
      END IF;

      -- Valor (nao null e nao 0) so na folha do mes do subsidio; nunca negativo.
      -- O validador ja garantiu number ou null.
      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE pg_catalog.jsonb_typeof(e.value -> 'totais' -> 'subsidio_ferias') = 'number'
         AND (e.value -> 'totais' ->> 'subsidio_ferias')::numeric <> 0
         AND v_periodo.mes <> v_sb_ferias
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: pessoa %: subsidio_ferias so se paga na folha do mes % e esta e a folha de %/%.',
          v_exemplo, v_sb_ferias, v_periodo.mes, v_periodo.ano
          USING ERRCODE = '22023';
      END IF;

      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE pg_catalog.jsonb_typeof(e.value -> 'totais' -> 'subsidio_natal') = 'number'
         AND (e.value -> 'totais' ->> 'subsidio_natal')::numeric <> 0
         AND v_periodo.mes <> v_sb_natal
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: pessoa %: subsidio_natal so se paga na folha do mes % e esta e a folha de %/%.',
          v_exemplo, v_sb_natal, v_periodo.mes, v_periodo.ano
          USING ERRCODE = '22023';
      END IF;

      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE (pg_catalog.jsonb_typeof(e.value -> 'totais' -> 'subsidio_ferias') = 'number'
              AND (e.value -> 'totais' ->> 'subsidio_ferias')::numeric < 0)
          OR (pg_catalog.jsonb_typeof(e.value -> 'totais' -> 'subsidio_natal') = 'number'
              AND (e.value -> 'totais' ->> 'subsidio_natal')::numeric < 0)
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: pessoa %: subsidio_ferias e subsidio_natal nao podem ser negativos (folha de %/%).',
          v_exemplo, v_periodo.mes, v_periodo.ano
          USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
        FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
       WHERE (e.value ->> 'subsidios_assinatura') IS NOT NULL
       LIMIT 1;
      IF v_exemplo IS NOT NULL THEN
        RAISE EXCEPTION 'processamento_fechar_subsidios_desactualizados: o resultado da pessoa % foi calculado com o pagamento dos subsidios ligado, e para a folha de %/% ele agora esta desligado; recarregar a pagina, recalcular e voltar a fechar.',
          v_exemplo, v_periodo.mes, v_periodo.ano
          USING ERRCODE = 'HRA90';
      END IF;
    END IF;
  END;

  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------$blk$,
 1);

-- ---- Os corpos esperados no remoto (md5 do prosrc SEM \r) ------------------
-- Reconstruidos dos ficheiros (o mesmo metodo das migrations anteriores):
-- validador = o de 20270110710000 com as trocas 2 e 3 de 20270111410000 e 4 e
--   5 de 20270112500000 -> 41e142e14f1c22977c5f48c2f46bee2f, que coincide com
--   o MEDIDO no remoto depois de 20270112500000.
-- fecho = o de 20270110710000 com a troca 1 de 20270111410000 (o mesmo metodo
--   da e70eaf2c9233d4dc6f17c85e4522dc12, o "antes" que 20270112500000 usou) e
--   as trocas 1, 2 e 3 de 20270112500000 -> 3c2943c86d9105a96d3e0e954a77a359
--   (calculado, NAO medido no remoto). Se a guarda G5 abortar no fecho, medir:
--   supabase db query --linked "select md5(replace(prosrc, chr(13), ''))
--   from pg_proc where oid = 'public.rpc_hr_processamento_periodo_fechar(uuid,
--   jsonb)'::regprocedure" e comparar o corpo antes de mudar a ancora.
-- Depois: o mesmo com as trocas acima (calculado, nao medido).
CREATE TEMP TABLE tmp_hs_esperado (fn text PRIMARY KEY, md5_antes text NOT NULL, md5_depois text NOT NULL,
                                   definer boolean NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_hs_esperado (fn, md5_antes, md5_depois, definer) VALUES
('public.hr_processamento_resultado_erro(jsonb)',            '41e142e14f1c22977c5f48c2f46bee2f', 'c2a08355b7f71950b4fa5ecd208a4587', false),
('public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)', '3c2943c86d9105a96d3e0e954a77a359', '1408363d6bc9280cd6d49f5f7d90fa21', true);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_cod   text;
  v_r     record;
  v_t     record;
  v_def   text;
BEGIN
  -- G0. Quem aplica passa a RLS (tabelas FORCE sem politicas; as RPCs definer
  --     correm com os direitos deste papel).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam a configuracao.', current_user::text;
  END IF;

  -- G1. Nomes novos livres.
  IF to_regclass('public.hr_subsidios_config') IS NOT NULL
     OR to_regclass('public.hr_subsidios_config_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existe hr_subsidios_config ou hr_subsidios_config_eventos. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('rpc_hr_subsidios_config_ler', 'rpc_hr_subsidios_config_guardar',
                             'rpc_hr_subsidios_assinatura', 'hr_subsidios_assinatura',
                             'hr_subsidios_eventos_imutavel');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;

  -- G2. Os codigos novos HRA88, HRA89 e HRA90 e o prefixo novo do fecho nao
  --     estao em uso no remoto.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND (p.prosrc LIKE '%HRA88%' OR p.prosrc LIKE '%HRA89%' OR p.prosrc LIKE '%HRA90%'
          OR p.prosrc LIKE '%processamento_fechar_subsidios_desactualizados%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: os codigos HRA88/HRA89/HRA90 (ou o prefixo processamento_fechar_subsidios_desactualizados) ja sao usados por: %. Escolher outros.', v_lista;
  END IF;

  -- G3. Suporte: funcoes e colunas usadas.
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.update_updated_at_column()',
                      'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
                      'public.hr_processamento_resultado_erro(jsonb)',
                      'public.hr_regras_salariais_em(uuid, date)',
                      'public.hr_desvios_config_guardar_core(uuid, date, integer, uuid)',
                      'public.hr_horas_extra_assinaturas_periodo(uuid, date, date, uuid[])']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: faltam funcoes: %.', v_lista;
  END IF;
  SELECT count(DISTINCT e.tabela || '.' || e.coluna)::integer INTO v_n
    FROM (VALUES ('hr_periodos_processamento', 'organization_id'), ('hr_periodos_processamento', 'estado'),
                 ('hr_periodos_processamento', 'ano'), ('hr_periodos_processamento', 'mes'),
                 ('hr_periodos_processamento', 'data_inicio'), ('hr_periodos_processamento', 'data_fim'),
                 ('hr_processamento_resultados', 'totais'), ('hr_processamento_resultados', 'periodo_id'),
                 ('hr_processamento_resultados', 'organization_id'),
                 ('anew_users', 'auth_user_id'), ('anew_organizations', 'id'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas em hr_periodos_processamento, hr_processamento_resultados, anew_users ou anew_organizations (% de 11).', v_n;
  END IF;

  -- G4. Permissoes usadas (nenhuma e criada).
  FOREACH v_cod IN ARRAY ARRAY['hr.vencimento.codigos.view', 'hr.vencimento.codigos.gerir',
                               'hr.vencimento.subsidio.view', 'hr.processamento.periodo.gerir',
                               'hr.processamento.periodo.view'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G4: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G5. O validador e o fecho: uma so assinatura cada, SECURITY DEFINER como
  --     esperado, search_path vazio, corpo com o md5 esperado (sem \r), cada
  --     ancora o numero exacto de vezes no texto de pg_get_functiondef (o que
  --     se troca), e ainda nao falam de subsidios.
  FOR v_r IN SELECT * FROM tmp_hs_esperado ORDER BY fn LOOP
    SELECT count(*)::integer INTO v_n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname::text = 'public'
       AND p.proname::text = split_part(replace(v_r.fn, 'public.', ''), '(', 1);
    IF v_n <> 1 OR to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'G5: % devia existir com uma so assinatura (ha %).', v_r.fn, v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_r.fn)::oid
                      AND p.prosecdef = v_r.definer
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'G5: % devia ter SECURITY DEFINER = % e search_path vazio. Reler.', v_r.fn, v_r.definer::text;
    END IF;
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_lista FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF v_lista IS DISTINCT FROM v_r.md5_antes THEN
      RAISE EXCEPTION 'G5: o corpo de % no remoto (md5 sem \r %) nao e o lido (md5 sem \r %). 20270112500000 aplicada? Reler a versao mais recente antes de aplicar.',
        v_r.fn, v_lista, v_r.md5_antes;
    END IF;
    v_def := pg_get_functiondef(to_regprocedure(v_r.fn)::oid);
    FOR v_t IN SELECT * FROM tmp_hs_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_n := (length(v_def) - length(replace(v_def, v_t.ancora, ''))) / length(v_t.ancora);
      IF v_n <> v_t.vezes THEN
        RAISE EXCEPTION 'G5: em %, a ancora % aparece % vez(es), esperavam-se %. Reler o corpo do remoto.',
          v_r.fn, v_t.ordem::text, v_n, v_t.vezes;
      END IF;
    END LOOP;
    IF position('subsidio_ferias' IN v_def) > 0 OR position('subsidio_natal' IN v_def) > 0
       OR position('subsidios_assinatura' IN v_def) > 0 OR position('hr_subsidios' IN v_def) > 0 THEN
      RAISE EXCEPTION 'G5: % ja fala de subsidios de ferias/Natal. Ler o que la esta.', v_r.fn;
    END IF;
  END LOOP;

  -- G6. O dono do fecho (SECURITY DEFINER) le hr_subsidios_config (RLS
  --     forcada, sem politicas) e chama hr_subsidios_assinatura (sem EXECUTE
  --     para ninguem): tem de ser quem aplica (dono das duas) ou superuser, e
  --     passar a RLS.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
                  WHERE p.oid = to_regprocedure('public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)')::oid
                    AND (r.rolname::text = current_user::text OR r.rolsuper)
                    AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G6: o dono de rpc_hr_processamento_periodo_fechar nao e quem aplica (%) nem superuser com BYPASSRLS; o fecho nao leria a configuracao.', current_user::text;
  END IF;
END;
$guardas$;

-- O estado do validador e do fecho antes das trocas (o conferir prova que so
-- mudou o pedido). Os privilegios guardam-se como conjunto ordenado.
CREATE TEMP TABLE tmp_hs_antes ON COMMIT DROP AS
SELECT e.fn,
       p.prosrc,
       p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(p.proacl) AS x), '') AS proacl,
       p.proowner,
       pg_get_function_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid) AS resultado,
       pg_get_functiondef(p.oid) AS def,
       obj_description(p.oid, 'pg_proc') AS comentario
  FROM tmp_hs_esperado e
  JOIN pg_proc p ON p.oid = to_regprocedure(e.fn)::oid;


-- ==============================================================================
-- 1. As tabelas
-- ==============================================================================
CREATE TABLE public.hr_subsidios_config (
  organization_id uuid        NOT NULL,
  ativo_desde     date,
  ferias_mes      smallint    NOT NULL DEFAULT 6,
  natal_mes       smallint    NOT NULL DEFAULT 11,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,

  CONSTRAINT hr_subsidios_config_pkey PRIMARY KEY (organization_id),
  CONSTRAINT hr_subsidios_config_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_subsidios_config_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_subsidios_config_ativo_desde_intervalo
    CHECK (ativo_desde IS NULL OR ativo_desde BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT hr_subsidios_config_ferias_mes CHECK (ferias_mes BETWEEN 1 AND 12),
  CONSTRAINT hr_subsidios_config_natal_mes  CHECK (natal_mes BETWEEN 1 AND 12)
);
COMMENT ON TABLE public.hr_subsidios_config IS
'Pagamento dos subsidios de ferias e de Natal por organizacao (uma linha por organizacao). ativo_desde NULL = desligado; com data, so pagam as folhas cujo ultimo dia (data_fim) e >= ativo_desde. ferias_mes / natal_mes: o rotulo mes (1..12) da folha de mes/ano em que cada subsidio se paga. Sem linha = desligado, meses 6 e 11. Os valores pagos ficam gravados no fecho (hr_processamento_resultados.totais.subsidio_ferias / subsidio_natal), que confere a configuracao por subsidios_assinatura. So por rpc_hr_subsidios_config_guardar. RLS forcada, sem politicas, sem privilegios. Desde 20270112900000.';
CREATE INDEX idx_hr_subsidios_config_updated_by ON public.hr_subsidios_config (updated_by) WHERE updated_by IS NOT NULL;

CREATE TABLE public.hr_subsidios_config_eventos (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  acao            text        NOT NULL,
  ator_auth_uid   uuid        NOT NULL,
  ator_id         uuid,
  dados           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_subsidios_config_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT hr_subsidios_config_eventos_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_subsidios_config_eventos_acao_valida CHECK (acao = 'config_alterada'),
  CONSTRAINT hr_subsidios_config_eventos_dados CHECK (
    jsonb_typeof(dados) = 'object' AND pg_column_size(dados) <= 2000)
);
COMMENT ON TABLE public.hr_subsidios_config_eventos IS
'Registo so de acrescentar das alteracoes a hr_subsidios_config: config_alterada, dados {antes: {ativo_desde, ferias_mes, natal_mes}, depois: {...}, linha_criada}. UPDATE, DELETE e TRUNCATE recusados por trigger. RLS forcada, sem politicas, sem privilegios. Desde 20270112900000.';
COMMENT ON COLUMN public.hr_subsidios_config_eventos.ator_id IS
'anew_users.id do actor, SEM FK de proposito (imutabilidade). ator_auth_uid e o auth.users.id. Desde 20270112900000.';
CREATE INDEX idx_hr_subsidios_config_eventos_org ON public.hr_subsidios_config_eventos (organization_id, criado_em);

CREATE TRIGGER trg_hr_subsidios_config_updated_at
  BEFORE UPDATE ON public.hr_subsidios_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.hr_subsidios_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'evento_imutavel' USING ERRCODE = '42501';
END;
$$;
COMMENT ON FUNCTION public.hr_subsidios_eventos_imutavel() IS
'INTERNA (trigger; sem EXECUTE para ninguem). Recusa UPDATE, DELETE e TRUNCATE em hr_subsidios_config_eventos. Desde 20270112900000.';
CREATE TRIGGER trg_hr_subsidios_config_eventos_sem_alterar
  BEFORE UPDATE OR DELETE ON public.hr_subsidios_config_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_subsidios_eventos_imutavel();
CREATE TRIGGER trg_hr_subsidios_config_eventos_sem_truncate
  BEFORE TRUNCATE ON public.hr_subsidios_config_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_subsidios_eventos_imutavel();

REVOKE ALL ON TABLE public.hr_subsidios_config         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.hr_subsidios_config_eventos FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.hr_subsidios_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_subsidios_config         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_subsidios_config_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_subsidios_config_eventos FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito (o linter avisa "RLS sem politica"; e o desenho).


-- ==============================================================================
-- 2. Funcoes
-- ==============================================================================

-- 2.0 A assinatura da configuracao (uma so implementacao: o fecho e a RPC).
CREATE FUNCTION public.hr_subsidios_assinatura(p_ativo_desde date, p_ferias_mes integer, p_natal_mes integer)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_ativo_desde IS NULL THEN NULL
              ELSE pg_catalog.md5('hr_subsidios:v1:' || pg_catalog.to_char(p_ativo_desde, 'YYYY-MM-DD')
                                  || ':' || p_ferias_mes::text || ':' || p_natal_mes::text)
         END
$$;
COMMENT ON FUNCTION public.hr_subsidios_assinatura(date, integer, integer) IS
'INTERNA (sem EXECUTE para ninguem). A assinatura da configuracao dos subsidios: md5(''hr_subsidios:v1:'' || ativo_desde YYYY-MM-DD || '':'' || ferias_mes || '':'' || natal_mes), meses em decimal sem zeros a esquerda; NULL com ativo_desde NULL. Usada por rpc_hr_subsidios_assinatura e pelo fecho da folha. Desde 20270112900000.';

-- 2.1 Ler a configuracao (o ecra das regras salariais).
CREATE FUNCTION public.rpc_hr_subsidios_config_ler(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k_ferias_omissao constant smallint := 6;
  k_natal_omissao  constant smallint := 11;
  v_auth  uuid := auth.uid();
  v_cfg   public.hr_subsidios_config%ROWTYPE;
  v_tem   boolean;
  v_desde date;
  v_ult   date;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  -- A mesma permissao da leitura das regras salariais (rpc_hr_regras_salariais_ler).
  IF NOT (coalesce(public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.view', p_organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.gerir', p_organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.vencimento.subsidio.view', p_organization_id), false)) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501',
      DETAIL = 'Ver a configuracao dos subsidios exige hr.vencimento.subsidio.view ou hr.vencimento.codigos.view nesta organizacao.';
  END IF;

  SELECT * INTO v_cfg FROM public.hr_subsidios_config c WHERE c.organization_id = p_organization_id;
  v_tem := FOUND;

  SELECT max(pp.data_fim) INTO v_ult
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado';

  IF v_cfg.ativo_desde IS NOT NULL THEN
    SELECT min(pp.data_inicio) INTO v_desde
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado'
       AND pp.data_fim >= v_cfg.ativo_desde;
  END IF;

  RETURN jsonb_build_object(
    'tem_config',               v_tem,
    'ativo_desde',              v_cfg.ativo_desde,
    'ferias_mes',               coalesce(v_cfg.ferias_mes, k_ferias_omissao),
    'natal_mes',                coalesce(v_cfg.natal_mes, k_natal_omissao),
    'folhas_fechadas_desde',    v_desde,
    'ultima_folha_fechada_ate', v_ult);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_subsidios_config_ler(uuid) IS
'RH (authenticated). A configuracao do pagamento dos subsidios de ferias e de Natal da organizacao: {tem_config (ha linha), ativo_desde (null = desligado; cobre as folhas com data_fim >= ativo_desde), ferias_mes, natal_mes (rotulo mes da folha; sem linha: 6 e 11), folhas_fechadas_desde (data_inicio da primeira folha fechada com o pagamento ligado, data_fim >= ativo_desde; null se nenhuma: com valor, a data ja nao se desliga nem se adia), ultima_folha_fechada_ate (data_fim da ultima folha fechada: ligar so a partir do dia seguinte)}. Exige hr.vencimento.codigos.view, hr.vencimento.codigos.gerir ou hr.vencimento.subsidio.view (42501); organizacao null = pedido_invalido HRA10. Desde 20270112900000.';

-- 2.2 A configuracao e a assinatura para calcular e fechar UMA folha.
CREATE FUNCTION public.rpc_hr_subsidios_assinatura(p_periodo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k_ferias_omissao constant smallint := 6;
  k_natal_omissao  constant smallint := 11;
  v_auth    uuid := auth.uid();
  v_periodo public.hr_periodos_processamento%ROWTYPE;
  v_cfg     public.hr_subsidios_config%ROWTYPE;
  v_aplica  boolean;
  v_ferias  integer;
  v_natal   integer;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_periodo_id IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT * INTO v_periodo FROM public.hr_periodos_processamento pp WHERE pp.id = p_periodo_id;

  -- Inexistente e sem permissao dao a mesma recusa (organizacao NULL).
  IF NOT (coalesce(public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.view', v_periodo.organization_id), false)) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501',
      DETAIL = 'Ler a configuracao dos subsidios de uma folha exige hr.processamento.periodo.gerir ou hr.processamento.periodo.view na organizacao da folha.';
  END IF;

  SELECT * INTO v_cfg FROM public.hr_subsidios_config c WHERE c.organization_id = v_periodo.organization_id;
  v_aplica := coalesce(v_cfg.ativo_desde IS NOT NULL AND v_periodo.data_fim >= v_cfg.ativo_desde, false);
  v_ferias := coalesce(v_cfg.ferias_mes, k_ferias_omissao);
  v_natal  := coalesce(v_cfg.natal_mes, k_natal_omissao);

  RETURN jsonb_build_object(
    'aplica',      v_aplica,
    'ano',         v_periodo.ano,
    'mes',         v_periodo.mes,
    'ativo_desde', v_cfg.ativo_desde,
    'ferias_mes',  v_ferias,
    'natal_mes',   v_natal,
    'paga_ferias', v_aplica AND v_periodo.mes = v_ferias,
    'paga_natal',  v_aplica AND v_periodo.mes = v_natal,
    'assinatura',  CASE WHEN v_aplica
                        THEN public.hr_subsidios_assinatura(v_cfg.ativo_desde, v_ferias, v_natal)
                   END);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_subsidios_assinatura(uuid) IS
'RH (authenticated). Para calcular e fechar a folha p_periodo_id: {aplica (pagamento ligado e data_fim da folha >= ativo_desde), ano, mes (rotulo da folha), ativo_desde, ferias_mes, natal_mes, paga_ferias / paga_natal (aplica e o rotulo mes da folha e o do subsidio), assinatura (md5 da configuracao; null sem aplica)}. Ler UMA vez ao calcular, calcular com estes meses e enviar a assinatura em subsidios_assinatura de cada resultado; o fecho recusa com HRA90 (processamento_fechar_subsidios_desactualizados) se a configuracao mudou entretanto. Exige hr.processamento.periodo.gerir ou hr.processamento.periodo.view (inexistente e sem permissao: 42501); folha null = pedido_invalido HRA10. Desde 20270112900000.';

-- 2.3 Ligar, mudar ou desligar o pagamento; mudar os meses.
CREATE FUNCTION public.rpc_hr_subsidios_config_guardar(
  p_organization_id uuid,
  p_ativo_desde     date,
  p_ferias_mes      integer,
  p_natal_mes       integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k_ferias_omissao constant smallint := 6;
  k_natal_omissao  constant smallint := 11;
  v_auth     uuid := auth.uid();
  v_actor    uuid;
  v_limite   date;
  v_existe   boolean;
  v_a_desde  date;
  v_a_ferias smallint;
  v_a_natal  smallint;
  v_fechado  date;
  v_descob   date;
  v_ano      integer;
  v_ult_mes  integer;
  v_pago     boolean;
  v_r        record;
BEGIN
  -- Sessao e permissao ANTES do lock e de ler qualquer dado.
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.gerir', p_organization_id), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501',
      DETAIL = 'Gravar a configuracao dos subsidios exige hr.vencimento.codigos.gerir nesta organizacao.';
  END IF;
  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_auth ORDER BY au.id LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501',
      DETAIL = 'A sessao nao corresponde a nenhum utilizador.';
  END IF;

  -- Forma dos argumentos.
  IF p_ferias_mes IS NULL OR p_natal_mes IS NULL
     OR p_ferias_mes NOT BETWEEN 1 AND 12 OR p_natal_mes NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'config_invalida' USING ERRCODE = 'HRA81',
      DETAIL = 'ferias_mes e natal_mes sao obrigatorios, de 1 a 12 (o mes da folha em que cada subsidio se paga).';
  END IF;
  v_limite := ((pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date + interval '5 years')::date;
  IF p_ativo_desde IS NOT NULL
     AND (NOT isfinite(p_ativo_desde) OR p_ativo_desde < DATE '2000-01-01' OR p_ativo_desde > v_limite) THEN
    RAISE EXCEPTION 'config_invalida' USING ERRCODE = 'HRA81',
      DETAIL = 'ativo_desde tem de estar entre 2000-01-01 e ' || to_char(v_limite, 'YYYY-MM-DD') || '.';
  END IF;

  -- Lock da organizacao (a mesma chave das regras salariais, da margem dos
  -- desvios e das horas extra), antes de ler a linha e as folhas.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || p_organization_id::text, 0));

  SELECT true, c.ativo_desde, c.ferias_mes, c.natal_mes
    INTO v_existe, v_a_desde, v_a_ferias, v_a_natal
    FROM public.hr_subsidios_config c
   WHERE c.organization_id = p_organization_id
     FOR UPDATE;
  v_existe := coalesce(v_existe, false);
  IF NOT v_existe THEN
    v_a_ferias := k_ferias_omissao;
    v_a_natal  := k_natal_omissao;
  END IF;

  -- Nada muda: idempotente, sem evento, sem criar linha.
  IF v_a_desde IS NOT DISTINCT FROM p_ativo_desde
     AND v_a_ferias = p_ferias_mes AND v_a_natal = p_natal_mes THEN
    RETURN jsonb_build_object('alterada', false, 'ativo_desde', p_ativo_desde,
                              'ferias_mes', p_ferias_mes, 'natal_mes', p_natal_mes);
  END IF;

  -- FOR SHARE das folhas que acabam a partir da mais antiga das duas datas: um
  -- fecho em curso (FOR UPDATE da linha) termina antes, e as leituras seguintes
  -- ja o veem; e um fecho que comece depois espera por este COMMIT e le a
  -- configuracao nova. Desligado antes e depois: nenhuma folha importa.
  PERFORM 1 FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.data_fim >= LEAST(p_ativo_desde, v_a_desde)
     FOR SHARE;
  SELECT max(pp.data_fim) INTO v_fechado
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado';

  -- c) Ligar ou mudar a data para em ou antes do ultimo dia de uma folha fechada.
  IF p_ativo_desde IS NOT NULL AND p_ativo_desde IS DISTINCT FROM v_a_desde
     AND v_fechado IS NOT NULL AND v_fechado >= p_ativo_desde THEN
    RAISE EXCEPTION 'subsidios_folha_fechada' USING ERRCODE = 'HRA88',
      DETAIL = 'Ha uma folha fechada que acaba em ' || to_char(v_fechado, 'YYYY-MM-DD')
               || '; a activacao compara o ultimo dia de cada folha com a data, por isso o pagamento dos subsidios so pode comecar a partir de '
               || to_char(v_fechado + 1, 'YYYY-MM-DD') || '.';
  END IF;

  -- d) Desligar ou adiar deixando de cobrir uma folha fechada que a data antiga cobria.
  IF v_a_desde IS NOT NULL AND p_ativo_desde IS DISTINCT FROM v_a_desde THEN
    SELECT max(pp.data_fim) INTO v_descob
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado'
       AND pp.data_fim >= v_a_desde
       AND (p_ativo_desde IS NULL OR pp.data_fim < p_ativo_desde);
    IF v_descob IS NOT NULL THEN
      RAISE EXCEPTION 'subsidios_folha_fechada' USING ERRCODE = 'HRA88',
        DETAIL = 'O pagamento dos subsidios vale desde ' || to_char(v_a_desde, 'YYYY-MM-DD')
                 || ' e ja fechou uma folha coberta, que acaba em ' || to_char(v_descob, 'YYYY-MM-DD')
                 || '; depois disso nao se desliga nem se adia.';
    END IF;
  END IF;

  -- e) Os meses (regra no cabecalho da migration 20270112900000), pelo rotulo
  --    (ano, mes) das folhas. Aqui a data ou nao mudou, ou mudou sem folhas
  --    fechadas cobertas (c e d).
  IF v_a_desde IS NOT NULL AND (p_ferias_mes <> v_a_ferias OR p_natal_mes <> v_a_natal) THEN
    SELECT pp.ano, pp.mes INTO v_ano, v_ult_mes
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado'
       AND pp.data_fim >= v_a_desde
     ORDER BY pp.ano DESC, pp.mes DESC
     LIMIT 1;
    IF v_ano IS NOT NULL THEN
      FOR v_r IN
        SELECT m.campo, m.chave, m.antes, m.depois
          FROM (VALUES ('ferias_mes', 'subsidio_ferias', v_a_ferias::integer, p_ferias_mes),
                       ('natal_mes',  'subsidio_natal',  v_a_natal::integer,  p_natal_mes)) AS m(campo, chave, antes, depois)
         WHERE m.antes <> m.depois
      LOOP
        -- Ja foi pago = o dinheiro gravado: uma folha fechada coberta de antes/ano
        -- com o subsidio > 0 em pelo menos um resultado.
        v_pago := EXISTS (SELECT 1
                            FROM public.hr_periodos_processamento pp
                            JOIN public.hr_processamento_resultados r
                              ON r.periodo_id = pp.id AND r.organization_id = pp.organization_id
                           WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado'
                             AND pp.ano = v_ano AND pp.mes = v_r.antes
                             AND pp.data_fim >= v_a_desde
                             AND coalesce((r.totais ->> v_r.chave)::numeric, 0) > 0);
        IF v_pago AND v_r.depois > v_ult_mes THEN
          RAISE EXCEPTION 'subsidios_mes_bloqueado' USING ERRCODE = 'HRA89',
            DETAIL = v_r.campo || ': o subsidio ja foi pago na folha de ' || v_r.antes::text || '/' || v_ano::text
                     || ' (fechada, com valor gravado); mudar para o mes ' || v_r.depois::text
                     || ' pagava-o outra vez na folha de ' || v_r.depois::text || '/' || v_ano::text
                     || '. Escolher um mes ate ' || v_ult_mes::text || ' (a ultima folha fechada e a de '
                     || v_ult_mes::text || '/' || v_ano::text || ') ou esperar pelo fecho da folha de 12/' || v_ano::text || '.';
        END IF;
        IF v_r.antes > v_ult_mes AND v_r.depois <= v_ult_mes THEN
          RAISE EXCEPTION 'subsidios_mes_bloqueado' USING ERRCODE = 'HRA89',
            DETAIL = v_r.campo || ': a folha de ' || v_r.antes::text || '/' || v_ano::text
                     || ' ainda nao fechou e a de ' || v_r.depois::text || '/' || v_ano::text
                     || ' ja fechou; o subsidio nunca seria pago em ' || v_ano::text
                     || '. Escolher um mes depois de ' || v_ult_mes::text || ' (a ultima folha fechada e a de '
                     || v_ult_mes::text || '/' || v_ano::text || ') ou esperar pelo fecho da folha de 12/' || v_ano::text || '.';
        END IF;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.hr_subsidios_config AS c
    (organization_id, ativo_desde, ferias_mes, natal_mes, updated_by)
  VALUES
    (p_organization_id, p_ativo_desde, p_ferias_mes::smallint, p_natal_mes::smallint, v_actor)
  ON CONFLICT (organization_id) DO UPDATE
    SET ativo_desde = EXCLUDED.ativo_desde,
        ferias_mes  = EXCLUDED.ferias_mes,
        natal_mes   = EXCLUDED.natal_mes,
        updated_by  = EXCLUDED.updated_by;

  INSERT INTO public.hr_subsidios_config_eventos (organization_id, acao, ator_auth_uid, ator_id, dados)
  VALUES (p_organization_id, 'config_alterada', v_auth, v_actor,
          jsonb_build_object(
            'antes',  jsonb_build_object('ativo_desde', v_a_desde, 'ferias_mes', v_a_ferias, 'natal_mes', v_a_natal),
            'depois', jsonb_build_object('ativo_desde', p_ativo_desde, 'ferias_mes', p_ferias_mes, 'natal_mes', p_natal_mes),
            'linha_criada', NOT v_existe));

  RETURN jsonb_build_object('alterada', true, 'ativo_desde', p_ativo_desde,
                            'ferias_mes', p_ferias_mes, 'natal_mes', p_natal_mes);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_subsidios_config_guardar(uuid, date, integer, integer) IS
'RH (authenticated). Grava a configuracao do pagamento dos subsidios de ferias e de Natal: p_ativo_desde (null = desligado; cobre as folhas com data_fim >= p_ativo_desde; de 2000-01-01 ate hoje + 5 anos em Lisboa), p_ferias_mes e p_natal_mes (rotulo mes da folha, 1..12, obrigatorios); fora disso config_invalida HRA81. Exige hr.vencimento.codigos.gerir (42501), verificada antes de ler qualquer dado. Toma o lock da organizacao e FOR SHARE das folhas que acabam a partir da data. Recusa subsidios_folha_fechada (HRA88) uma data nova em ou antes do ultimo dia de uma folha fechada e desligar ou adiar depois de uma folha fechada com o pagamento ligado. Recusa subsidios_mes_bloqueado (HRA89) mudar um mes quando isso pagaria o subsidio duas vezes (ja pago = valor > 0 gravado numa folha fechada coberta do mes antigo) ou nunca no ano da ultima folha fechada coberta (regra no cabecalho de 20270112900000). Uma folha aberta ja calculada com os meses antigos e recusada no fecho (HRA90). Nada muda: alterada=false, sem evento e sem criar linha. Evento config_alterada {antes, depois, linha_criada}. Devolve {alterada, ativo_desde, ferias_mes, natal_mes}. Desde 20270112900000.';


-- ==============================================================================
-- 3. EXECUTE explicito (o Supabase da EXECUTE por omissao a anon e authenticated)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_subsidios_eventos_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_subsidios_assinatura(date, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_subsidios_config_ler(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_subsidios_assinatura(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_subsidios_config_guardar(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_subsidios_config_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_subsidios_assinatura(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_subsidios_config_guardar(uuid, date, integer, integer) TO authenticated;


-- ==============================================================================
-- 4. As trocas no validador e no fecho (via pg_get_functiondef; CREATE OR
--    REPLACE mantem dono, privilegios, IMMUTABLE/SECURITY DEFINER e
--    search_path) e os comentarios (o de antes mais uma frase)
-- ==============================================================================
DO $trocas$
DECLARE
  v_fn  text;
  v_def text;
  v_r   record;
BEGIN
  FOR v_fn IN SELECT DISTINCT t.fn FROM tmp_hs_trocas t ORDER BY 1 LOOP
    SELECT a.def INTO v_def FROM tmp_hs_antes a WHERE a.fn = v_fn;
    FOR v_r IN SELECT * FROM tmp_hs_trocas t WHERE t.fn = v_fn ORDER BY t.ordem LOOP
      v_def := replace(v_def, v_r.ancora, v_r.novo);
    END LOOP;
    EXECUTE v_def;
  END LOOP;
END;
$trocas$;

DO $comentarios$
DECLARE
  v_r record;
BEGIN
  FOR v_r IN
    SELECT t.fn, t.extra, a.comentario
      FROM (VALUES
        ('public.hr_processamento_resultado_erro(jsonb)',
         ' Desde 20270112900000: aceita tambem, OPCIONAIS, subsidios_assinatura (md5 ou null) e totais.subsidio_ferias / totais.subsidio_natal (number com |valor| ate 10000000 ou null); o fecho exige-as com o pagamento dos subsidios ligado para a folha.'),
        ('public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)',
         ' Desde 20270112900000: com o pagamento dos subsidios ligado para a folha (hr_subsidios_config.ativo_desde nao null e data_fim >= ativo_desde), recusa com HRA90 processamento_fechar_subsidios_desactualizados um resultado sem subsidios_assinatura ou com uma diferente da configuracao actual (rpc_hr_subsidios_assinatura), e com 22023 processamento_fechar_resultado_mal_formado um sem totais.subsidio_ferias ou totais.subsidio_natal; desligado para a folha, as duas chaves sao opcionais e uma subsidios_assinatura nao null e recusada com HRA90.')
      ) AS t(fn, extra)
      JOIN tmp_hs_antes a ON a.fn = t.fn
  LOOP
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',
                   to_regprocedure(v_r.fn)::text,
                   coalesce(v_r.comentario, '') || v_r.extra);
  END LOOP;
END;
$comentarios$;


-- ==============================================================================
-- 5. Conferir (estrutura, privilegios, trocas e comportamento na nike, desfeito)
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_ini       constant date := DATE '2099-04-01';
  k_fim       constant date := DATE '2099-04-30';
  k_fechar    constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
  k_erro      constant text := 'public.hr_processamento_resultado_erro(jsonb)';
  v_rpcs      text[] := ARRAY['public.rpc_hr_subsidios_config_ler(uuid)',
                              'public.rpc_hr_subsidios_assinatura(uuid)',
                              'public.rpc_hr_subsidios_config_guardar(uuid, date, integer, integer)'];
  v_internas  text[] := ARRAY['public.hr_subsidios_eventos_imutavel()',
                              'public.hr_subsidios_assinatura(date, integer, integer)', k_erro];
  v_papel     text := current_user::text;
  v_fn        text;
  v_grant     text;
  v_tab       text;
  v_pap       text;
  v_priv      text;
  v_r         record;
  v_t         record;
  v_new       record;
  v_esperado  text;
  v_n         integer;
  v_msg       text;
  v_st        text;
  v_j         jsonb;
  v_sj        jsonb;
  v_hoje      date;
  v_ult_real  date;
  v_d1        date;
  v_uid       uuid;
  v_autor     uuid;
  v_uid_fecho uuid;
  v_autor_fecho uuid;
  v_uid_sem_gerir uuid;
  v_uid_sem_ver   uuid;
  v_uid_sem_folha uuid;
  v_prova_sem text := '';
  v_obrig     uuid[];
  v_pessoas   integer;
  v_primeira  uuid;
  v_per       uuid;
  v_regra_id  uuid;
  v_he_desde  date;
  v_he_ligado boolean;
  v_n_desvios integer;
  v_prova_desvios text;
  v_payload   jsonb;
  v_payload_chaves jsonb;
  v_payload_zero   jsonb;
  v_ass1      text;
  v_ass2      text;
  v_base      jsonb;
  v_estado    text;
  v_totais    jsonb;
BEGIN
  -- C1. EXECUTE por aclexplode (sem o dono): RPCs so authenticated; internas a
  --     ninguem. SECURITY DEFINER so nas RPCs; search_path vazio em todas.
  FOREACH v_fn IN ARRAY v_rpcs || v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','
                               ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type::text = 'EXECUTE' AND a.grantee <> p.proowner;
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

  -- C2. As tabelas: RLS activa e forcada, sem politicas, sem privilegios para
  --     PUBLIC/anon/authenticated/service_role (por aclexplode e por
  --     has_table_privilege); colunas, DEFAULT 6 e 11, CHECK, triggers; vazias.
  FOREACH v_tab IN ARRAY ARRAY['public.hr_subsidios_config', 'public.hr_subsidios_config_eventos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass(v_tab) AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'Conferir: % devia ter RLS activa e forcada.', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = to_regclass(v_tab)) THEN
      RAISE EXCEPTION 'Conferir: % nao devia ter politicas.', v_tab;
    END IF;
    SELECT string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
                      || ':' || a.privilege_type::text, ',') INTO v_grant
      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = to_regclass(v_tab) AND a.grantee <> c.relowner;
    IF v_grant IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: % tem privilegios para outros papeis: %.', v_tab, v_grant;
    END IF;
    FOREACH v_pap IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        IF has_table_privilege(v_pap, v_tab, v_priv) THEN
          RAISE EXCEPTION 'Conferir: % tem % em %.', v_pap, v_priv, v_tab;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  SELECT count(DISTINCT a.attname::text)::integer INTO v_n
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = to_regclass('public.hr_subsidios_config') AND NOT a.attisdropped
     AND ((a.attname::text = 'ativo_desde' AND format_type(a.atttypid, a.atttypmod) = 'date' AND NOT a.attnotnull AND d.adbin IS NULL)
          OR (a.attname::text = 'ferias_mes' AND format_type(a.atttypid, a.atttypmod) = 'smallint' AND a.attnotnull
              AND pg_get_expr(d.adbin, d.adrelid) = '6')
          OR (a.attname::text = 'natal_mes' AND format_type(a.atttypid, a.atttypmod) = 'smallint' AND a.attnotnull
              AND pg_get_expr(d.adbin, d.adrelid) = '11'));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: das colunas ativo_desde (date null), ferias_mes (smallint, DEFAULT 6) e natal_mes (smallint, DEFAULT 11) so % estao certas.', v_n;
  END IF;
  SELECT count(DISTINCT c.conname::text)::integer INTO v_n
    FROM pg_constraint c
   WHERE c.conrelid IN (to_regclass('public.hr_subsidios_config'), to_regclass('public.hr_subsidios_config_eventos'))
     AND c.convalidated
     AND c.conname::text IN ('hr_subsidios_config_pkey', 'hr_subsidios_config_organization_fkey',
                             'hr_subsidios_config_updated_by_fkey', 'hr_subsidios_config_ativo_desde_intervalo',
                             'hr_subsidios_config_ferias_mes', 'hr_subsidios_config_natal_mes',
                             'hr_subsidios_config_eventos_pkey', 'hr_subsidios_config_eventos_organization_fkey',
                             'hr_subsidios_config_eventos_acao_valida', 'hr_subsidios_config_eventos_dados');
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'Conferir: das 10 constraints esperadas so % existem.', v_n;
  END IF;
  SELECT count(DISTINCT t.tgname::text)::integer INTO v_n
    FROM pg_trigger t
   WHERE t.tgrelid IN (to_regclass('public.hr_subsidios_config'), to_regclass('public.hr_subsidios_config_eventos'))
     AND NOT t.tgisinternal AND t.tgenabled::text = 'O'
     AND t.tgname::text IN ('trg_hr_subsidios_config_updated_at', 'trg_hr_subsidios_config_eventos_sem_alterar',
                            'trg_hr_subsidios_config_eventos_sem_truncate');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: dos 3 triggers esperados so % existem activos.', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_subsidios_config) OR EXISTS (SELECT 1 FROM public.hr_subsidios_config_eventos) THEN
    RAISE EXCEPTION 'Conferir: a migration nao devia ligar os subsidios em nenhuma organizacao.';
  END IF;

  -- C3. As trocas: corpo novo = antigo com as trocas (sem \r dos dois lados);
  --     md5 esperado; SECURITY DEFINER, search_path, privilegios, dono,
  --     argumentos e resultado iguais; desfeitas as trocas, volta ao md5 lido.
  FOR v_r IN SELECT a.*, e.md5_antes, e.md5_depois FROM tmp_hs_antes a JOIN tmp_hs_esperado e ON e.fn = a.fn ORDER BY a.fn LOOP
    v_esperado := v_r.prosrc;
    FOR v_t IN SELECT * FROM tmp_hs_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_esperado := replace(v_esperado, v_t.ancora, v_t.novo);
    END LOOP;
    SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
           coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(p.proacl) AS x), '') AS proacl,
           p.proowner, pg_get_function_arguments(p.oid) AS argumentos, pg_get_function_result(p.oid) AS resultado
      INTO v_new FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF replace(v_new.prosrc, chr(13), '') IS DISTINCT FROM replace(v_esperado, chr(13), '')
       OR v_new.prosecdef IS DISTINCT FROM v_r.prosecdef
       OR v_new.proconfig IS DISTINCT FROM v_r.proconfig
       OR v_new.proacl IS DISTINCT FROM v_r.proacl
       OR v_new.proowner IS DISTINCT FROM v_r.proowner
       OR v_new.argumentos IS DISTINCT FROM v_r.argumentos
       OR v_new.resultado IS DISTINCT FROM v_r.resultado THEN
      RAISE EXCEPTION 'Conferir: % mudou mais do que as trocas (corpo, SECURITY DEFINER, search_path, privilegios, dono, argumentos ou resultado).', v_r.fn;
    END IF;
    IF md5(replace(v_new.prosrc, chr(13), '')) IS DISTINCT FROM v_r.md5_depois THEN
      RAISE EXCEPTION 'Conferir: o corpo novo de % tem md5 sem \r %, esperava-se %.', v_r.fn,
        md5(replace(v_new.prosrc, chr(13), '')), v_r.md5_depois;
    END IF;
    v_esperado := replace(v_new.prosrc, chr(13), '');
    FOR v_t IN SELECT * FROM tmp_hs_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem DESC LOOP
      v_esperado := replace(v_esperado, replace(v_t.novo, chr(13), ''), v_t.ancora);
    END LOOP;
    IF md5(v_esperado) IS DISTINCT FROM v_r.md5_antes THEN
      RAISE EXCEPTION 'Conferir: sem as trocas, % devia voltar ao corpo lido (md5 sem \r %), e da %.', v_r.fn, v_r.md5_antes, md5(v_esperado);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname::text = 'public'
         AND p.proname::text IN ('hr_processamento_resultado_erro', 'rpc_hr_processamento_periodo_fechar')) <> 2 THEN
    RAISE EXCEPTION 'Conferir: o validador e o fecho deviam ter uma so assinatura cada.';
  END IF;
  SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','), '')
    INTO v_grant
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = to_regprocedure(k_fechar)::oid AND a.privilege_type::text = 'EXECUTE'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF v_grant IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Conferir: EXECUTE no fecho devia ser so authenticated; e "%".', v_grant;
  END IF;

  -- C4. O validador (puro): as tres chaves novas sao OPCIONAIS; quando
  --     presentes, number/null ate 10000000 e md5/null; o resto como antes.
  v_base := jsonb_build_object(
    'pessoa_id', gen_random_uuid(), 'valor_hora', 8, 'total_bruto', 1000,
    'totais', jsonb_build_object(
      'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
      'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
    'linhas', jsonb_build_array(), 'avisos', jsonb_build_array(),
    'retribuicao_id', NULL, 'cargo_periodo_id', NULL, 'regra_salarial_id', NULL,
    'planeado_minutos', 480, 'realizado_minutos', 0);
  FOR v_t IN
    SELECT x.nome, x.payload, x.texto
      FROM (VALUES
        ('cliente antigo (sem nenhuma)', v_base,                                                     NULL::text),
        ('com as duas',            jsonb_set(jsonb_set(v_base, '{totais,subsidio_ferias}', '1234.56'::jsonb),
                                             '{totais,subsidio_natal}', 'null'::jsonb),                NULL),
        ('so ferias',              jsonb_set(v_base, '{totais,subsidio_ferias}', '0'::jsonb),          NULL),
        ('aceita -10000000',       jsonb_set(v_base, '{totais,subsidio_natal}', '-10000000'::jsonb),   NULL),
        ('aceita 10000000',        jsonb_set(v_base, '{totais,subsidio_ferias}', '10000000'::jsonb),   NULL),
        ('assinatura md5',         v_base || jsonb_build_object('subsidios_assinatura', md5('x')),     NULL),
        ('assinatura null',        v_base || jsonb_build_object('subsidios_assinatura', NULL),         NULL),
        ('todas as assinaturas',   v_base || jsonb_build_object('desvios_assinatura', md5('a'), 'horas_extra_assinatura', md5('b'),
                                                                'subsidios_assinatura', md5('c')),    NULL),
        ('texto',                  jsonb_set(v_base, '{totais,subsidio_ferias}', '"100"'::jsonb),
                                                                                                       'totais.subsidio_ferias tem de ser numero ou null'),
        ('acima do maximo',        jsonb_set(v_base, '{totais,subsidio_natal}', '10000001'::jsonb),
                                                                                                       'totais.subsidio_natal fora do intervalo'),
        ('chave a mais em totais', jsonb_set(v_base, '{totais,subsidio_pascoa}', '1'::jsonb),
                                                                                                       'campos desconhecidos em totais: subsidio_pascoa'),
        ('chave obrigatoria em falta', v_base #- '{totais,base_mes}',                                 'falta totais.base_mes'),
        ('assinatura texto',       v_base || jsonb_build_object('subsidios_assinatura', 'xpto'),
                                                                                                       'subsidios_assinatura tem de ser um md5'),
        ('assinatura numero',      v_base || jsonb_build_object('subsidios_assinatura', 12),
                                                                                                       'subsidios_assinatura tem de ser um md5'),
        ('assinatura maiusculas',  v_base || jsonb_build_object('subsidios_assinatura', upper(md5('x'))),
                                                                                                       'subsidios_assinatura tem de ser um md5'),
        ('campo desconhecido',     v_base || jsonb_build_object('subsidio_assinatura', md5('x')),
                                                                                                       'campos desconhecidos: subsidio_assinatura')
      ) AS x(nome, payload, texto)
  LOOP
    v_msg := public.hr_processamento_resultado_erro(v_t.payload);
    IF (v_t.texto IS NULL AND v_msg IS NOT NULL)
       OR (v_t.texto IS NOT NULL AND coalesce(position(v_t.texto IN v_msg), 0) <> 1) THEN
      RAISE EXCEPTION 'Conferir: validador "%": esperava-se %, deu %.', v_t.nome,
        coalesce(v_t.texto, 'NULL (aceite)'), coalesce(v_msg, 'NULL (aceite)');
    END IF;
  END LOOP;

  -- C5. A assinatura (pura): o texto documentado no cabecalho.
  IF public.hr_subsidios_assinatura(DATE '2027-01-01', 6, 11) IS DISTINCT FROM 'd74503770973ffd487137ae2117b58e2'
     OR public.hr_subsidios_assinatura(DATE '2027-01-01', 6, 11) IS DISTINCT FROM md5('hr_subsidios:v1:2027-01-01:6:11')
     OR public.hr_subsidios_assinatura(NULL, 6, 11) IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: hr_subsidios_assinatura nao da o texto do cabecalho (md5 de hr_subsidios:v1:2027-01-01:6:11 = d74503770973ffd487137ae2117b58e2; null sem data).';
  END IF;

  -- P. Comportamento na nike, DESFEITO no fim (sentinela HSB00). Toda a
  --    consulta leva a organizacao da nike; nenhuma outra e lida.
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    v_hoje := (pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date;

    -- Quem configura (codigos.gerir) e quem fecha (periodo.gerir), NA NIKE.
    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.vencimento.codigos.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.vencimento.codigos.gerir.';
    END IF;
    SELECT au.auth_user_id, au.id INTO v_uid_fecho, v_autor_fecho
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_fecho IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.processamento.periodo.gerir.';
    END IF;
    -- Sem permissao: um utilizador real da nike se houver, senao um uuid sem nada.
    SELECT au.auth_user_id INTO v_uid_sem_gerir
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.vencimento.codigos.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_sem_gerir IS NULL THEN
      v_uid_sem_gerir := gen_random_uuid();
      v_prova_sem := v_prova_sem || 'guardar sem permissao provado com um uuid sem permissoes (a nike nao tem utilizador activo sem codigos.gerir); ';
    ELSE
      v_prova_sem := v_prova_sem || 'guardar sem permissao provado com um utilizador real da nike; ';
    END IF;
    SELECT au.auth_user_id INTO v_uid_sem_ver
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.vencimento.codigos.view', k_nike), false)
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.vencimento.codigos.gerir', k_nike), false)
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.vencimento.subsidio.view', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_sem_ver IS NULL THEN
      v_uid_sem_ver := gen_random_uuid();
      v_prova_sem := v_prova_sem || 'ler sem permissao provado com um uuid sem permissoes; ';
    ELSE
      v_prova_sem := v_prova_sem || 'ler sem permissao provado com um utilizador real da nike; ';
    END IF;
    SELECT au.auth_user_id INTO v_uid_sem_folha
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike), false)
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.view', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_sem_folha IS NULL THEN
      v_uid_sem_folha := gen_random_uuid();
      v_prova_sem := v_prova_sem || 'assinatura sem permissao provada com um uuid sem permissoes';
    ELSE
      v_prova_sem := v_prova_sem || 'assinatura sem permissao provada com um utilizador real da nike';
    END IF;

    IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
                WHERE pp.organization_id = k_nike AND pp.ano = 2099) THEN
      RAISE EXCEPTION 'Conferir: a nike ja tem folhas em 2099; a prova precisa desse ano livre.';
    END IF;
    SELECT max(pp.data_fim) INTO v_ult_real
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = k_nike AND pp.estado = 'fechado';
    -- A data a ligar: depois de hoje e da ultima folha fechada real, dentro do limite.
    v_d1 := GREATEST(v_hoje, coalesce(v_ult_real, v_hoje)) + 30;
    IF v_d1 + 1 > (v_hoje + interval '5 years')::date THEN
      RAISE EXCEPTION 'Conferir: a nike tem folhas fechadas ate %; nao ha data futura valida para a prova.', v_ult_real;
    END IF;

    -- Folha de teste 4/2099 (aberta) e o que o fecho exige (como 20270112500000).
    SELECT array_agg(x.id ORDER BY x.id) INTO v_obrig
      FROM (SELECT DISTINCT p.id
              FROM public.pessoas p
              JOIN public.pessoas_vinculos v
                ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL
               AND v.data_inicio <= k_fim AND (v.data_fim IS NULL OR v.data_fim >= k_ini)
             WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo') x;
    v_pessoas := coalesce(cardinality(v_obrig), 0);
    IF v_pessoas < 1 THEN
      RAISE EXCEPTION 'Conferir: na nike nao ha pessoas activas com vinculo em %-%.', k_ini, k_fim;
    END IF;
    v_primeira := v_obrig[1];

    SELECT count(*)::integer INTO v_n_desvios FROM public.hr_desvios_config k WHERE k.organization_id = k_nike;
    IF EXISTS (SELECT 1 FROM public.hr_desvios_config k
                WHERE k.organization_id = k_nike AND k.substituida_em IS NULL AND k.margem_min IS NOT NULL
                  AND k.valido_de <= k_fim AND (k.valido_ate IS NULL OR k.valido_ate >= k_ini)) THEN
      BEGIN
        PERFORM public.hr_desvios_config_guardar_core(k_nike, k_ini, NULL, v_autor_fecho);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Conferir: a nike tem margem de desvios em vigor em 2099 e a prova nao a conseguiu desligar (%).', SQLERRM;
      END;
      v_prova_desvios := 'margem dos desvios desligada na prova a partir de ' || to_char(k_ini, 'YYYY-MM-DD');
    ELSE
      v_prova_desvios := 'sem margem dos desvios em 2099';
    END IF;

    SELECT c.aprovacao_conta_desde INTO v_he_desde
      FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike;
    v_he_ligado := v_he_desde IS NOT NULL AND v_he_desde <= k_fim;
    IF v_he_ligado AND EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                                WHERE x.organization_id = k_nike AND x.estado = 'pendente'
                                  AND x.data BETWEEN k_ini AND k_fim AND x.pessoa_id = ANY (v_obrig)) THEN
      RAISE EXCEPTION 'Conferir: a nike tem horas extra pendentes em %-%; a prova nao fecharia.', k_ini, k_fim;
    END IF;

    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 4, 'aberto', k_ini, k_fim)
    RETURNING id INTO v_per;
    v_regra_id := (public.hr_regras_salariais_em(k_nike, k_fim) ->> 'id')::uuid;

    -- v_payload: o do cliente de hoje (sem as chaves de subsidios nem a
    -- assinatura). v_payload_chaves: com as duas chaves (a primeira pessoa
    -- paga 1234.56 de ferias). v_payload_zero: com as duas chaves a 0/null.
    SELECT jsonb_agg(jsonb_build_object(
             'pessoa_id', o.id, 'valor_hora', 8, 'total_bruto', 1000,
             'totais', jsonb_build_object(
               'base_mes', 1000, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
               'total_regras', 0, 'desconto_faltas', 0, 'subsidio_alimentacao', 0, 'lancamentos_pontuais', NULL),
             'linhas', jsonb_build_array(), 'avisos', jsonb_build_array(),
             'retribuicao_id', NULL, 'cargo_periodo_id', NULL, 'regra_salarial_id', v_regra_id,
             'planeado_minutos', 9600, 'realizado_minutos', 9000) ORDER BY o.ord)
      INTO v_payload
      FROM unnest(v_obrig) WITH ORDINALITY AS o(id, ord);
    IF v_he_ligado THEN
      SELECT jsonb_agg(e.value || jsonb_build_object('horas_extra_assinatura', s.assinatura) ORDER BY e.ord)
        INTO v_payload
        FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)
        LEFT JOIN public.hr_horas_extra_assinaturas_periodo(k_nike, k_ini, k_fim, v_obrig) AS s
          ON s.pessoa_id = (e.value ->> 'pessoa_id')::uuid;
    END IF;
    SELECT jsonb_agg(jsonb_set(e.value, '{totais}',
                               (e.value -> 'totais')
                               || jsonb_build_object('subsidio_ferias',
                                                     (CASE WHEN (e.value ->> 'pessoa_id')::uuid = v_primeira THEN 1234.56 ELSE 0 END),
                                                     'subsidio_natal', NULL)) ORDER BY e.ord)
      INTO v_payload_chaves
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord);
    SELECT jsonb_agg(jsonb_set(e.value, '{totais}',
                               (e.value -> 'totais') || jsonb_build_object('subsidio_ferias', 0, 'subsidio_natal', NULL)) ORDER BY e.ord)
      INTO v_payload_zero
      FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord);

    -- P1. Sem sessao e sem permissao: ler, guardar e a assinatura da folha
    --     recusados (42501).
    FOR v_t IN
      SELECT x.nome, x.uid, x.op
        FROM (VALUES ('ler sem sessao', NULL::uuid, 'ler'), ('guardar sem sessao', NULL::uuid, 'guardar'),
                     ('assinatura sem sessao', NULL::uuid, 'assinatura'),
                     ('ler sem permissao', v_uid_sem_ver, 'ler'), ('guardar sem permissao', v_uid_sem_gerir, 'guardar'),
                     ('assinatura sem permissao', v_uid_sem_folha, 'assinatura'))
             AS x(nome, uid, op)
    LOOP
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_t.uid::text, ''), true),
              set_config('request.jwt.claims',
                         (CASE WHEN v_t.uid IS NULL THEN '{}'
                               ELSE json_build_object('sub', v_t.uid, 'role', 'authenticated')::text END), true);
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        IF v_t.op = 'ler' THEN
          v_j := public.rpc_hr_subsidios_config_ler(k_nike);
        ELSIF v_t.op = 'guardar' THEN
          v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 6, 11);
        ELSE
          v_j := public.rpc_hr_subsidios_assinatura(v_per);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: "%" devia dar 42501; deu % %.', v_t.nome, coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;

    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- P2. Ler sem linha: desligado, 6 e 11, ultima folha fechada real.
    v_j := public.rpc_hr_subsidios_config_ler(k_nike);
    IF (v_j ->> 'tem_config')::boolean IS DISTINCT FROM false
       OR (v_j -> 'ativo_desde') IS DISTINCT FROM 'null'::jsonb
       OR (v_j ->> 'ferias_mes')::integer IS DISTINCT FROM 6
       OR (v_j ->> 'natal_mes')::integer IS DISTINCT FROM 11
       OR (v_j -> 'folhas_fechadas_desde') IS DISTINCT FROM 'null'::jsonb
       OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_ult_real THEN
      RAISE EXCEPTION 'Conferir: ler sem linha devia dar desligado, 6, 11 e ultima folha %; deu %.', v_ult_real, v_j;
    END IF;

    -- P3. Guardar as omissoes sem linha: alterada=false, sem linha, sem evento.
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, NULL, 6, 11);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM false
       OR EXISTS (SELECT 1 FROM public.hr_subsidios_config c WHERE c.organization_id = k_nike)
       OR EXISTS (SELECT 1 FROM public.hr_subsidios_config_eventos e WHERE e.organization_id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: guardar as omissoes sem linha devia ser alterada=false sem linha nem evento; deu %.', v_j;
    END IF;

    -- P4. Forma: meses 0, 13 e null; datas fora do intervalo (HRA81).
    FOR v_t IN
      SELECT x.nome, x.desde, x.fm, x.nm
        FROM (VALUES ('ferias 0', v_d1, 0, 11), ('ferias 13', v_d1, 13, 11),
                     ('natal 0', v_d1, 6, 0), ('natal 13', v_d1, 6, 13),
                     ('ferias null', v_d1, NULL::integer, 11), ('natal null', v_d1, 6, NULL::integer),
                     ('data acima de hoje + 5 anos', (v_hoje + interval '5 years' + interval '1 day')::date, 6, 11),
                     ('data antes de 2000', DATE '1999-12-31', 6, 11),
                     ('data infinita', 'infinity'::date, 6, 11))
             AS x(nome, desde, fm, nm)
    LOOP
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_t.desde, v_t.fm, v_t.nm);
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM 'HRA81' OR v_msg IS DISTINCT FROM 'config_invalida' THEN
        RAISE EXCEPTION 'Conferir: guardar "%" devia dar HRA81 config_invalida; deu % %.', v_t.nome, coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;

    -- P5. Pagamento DESLIGADO (subtransaccao propria, sentinela HSB01):
    --     a) a assinatura da folha diz aplica=false e sem assinatura;
    --     b) uma subsidios_assinatura nao null e recusada (HRA90);
    --     c) o payload de hoje (sem as chaves nem a assinatura) FECHA e nao
    --        grava as chaves;
    --     d) ligar em v_d1 (<= 2099-04-30) sobre a folha fechada: HRA88.
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', v_uid_fecho::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid_fecho, 'role', 'authenticated')::text, true);
      v_sj := public.rpc_hr_subsidios_assinatura(v_per);
      IF (v_sj ->> 'aplica')::boolean IS DISTINCT FROM false
         OR (v_sj -> 'assinatura') IS DISTINCT FROM 'null'::jsonb
         OR (v_sj ->> 'ano')::integer IS DISTINCT FROM 2099 OR (v_sj ->> 'mes')::integer IS DISTINCT FROM 4
         OR (v_sj ->> 'paga_ferias')::boolean IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Conferir: a assinatura da folha 4/2099 com o pagamento desligado devia ser aplica=false sem assinatura; deu %.', v_sj;
      END IF;
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
          (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', md5('calculado ligado')) ORDER BY e.ord)
             FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)));
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM 'HRA90'
         OR coalesce(position('processamento_fechar_subsidios_desactualizados' IN v_msg), 0) <> 1 THEN
        RAISE EXCEPTION 'Conferir: desligado, fechar com subsidios_assinatura nao null devia dar HRA90; deu % %.', coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;

      -- Desligado ignora as regras do mes e do sinal (so valem ligado): Natal
      -- 500 na folha de abril e ferias -10 fecham (sentinela HSB04, desfeito).
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
          (SELECT jsonb_agg(jsonb_set(e.value, '{totais}',
                                      (e.value -> 'totais') || jsonb_build_object('subsidio_ferias', -10, 'subsidio_natal', 500))
                            ORDER BY e.ord)
             FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)));
        SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
        IF v_estado IS DISTINCT FROM 'fechado' THEN
          RAISE EXCEPTION 'Conferir: desligado, Natal 500 na folha 4 e ferias -10 deviam fechar (estado %).', v_estado;
        END IF;
        RAISE EXCEPTION 'teste_subsidios_desligado_ignora_ok' USING ERRCODE = 'HSB04';
      EXCEPTION
        WHEN SQLSTATE 'HSB04' THEN
          NULL; -- desfeito: a folha 4/2099 volta a estar aberta e sem resultados.
      END;

      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
      SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
      SELECT count(DISTINCT r.pessoa_id)::integer INTO v_n
        FROM public.hr_processamento_resultados r
       WHERE r.periodo_id = v_per AND r.organization_id = k_nike
         AND NOT (r.totais ? 'subsidio_ferias') AND NOT (r.totais ? 'subsidio_natal');
      IF v_estado IS DISTINCT FROM 'fechado' OR v_n <> v_pessoas THEN
        RAISE EXCEPTION 'Conferir: desligado, o payload de hoje (sem as chaves) devia fechar com % pessoas sem as chaves (estado %, % pessoas).',
          v_pessoas, v_estado, v_n;
      END IF;

      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 6, 11);
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM 'HRA88' OR v_msg IS DISTINCT FROM 'subsidios_folha_fechada' THEN
        RAISE EXCEPTION 'Conferir: ligar em % com a folha 4/2099 fechada devia dar HRA88; deu % %.', v_d1, coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
      RAISE EXCEPTION 'teste_subsidios_desligado_ok' USING ERRCODE = 'HSB01';
    EXCEPTION
      WHEN SQLSTATE 'HSB01' THEN
        NULL; -- desfeito: a folha 4/2099 volta a estar aberta e sem resultados.
    END;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
    SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados r WHERE r.periodo_id = v_per AND r.organization_id = k_nike;
    IF v_estado IS DISTINCT FROM 'aberto' OR v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: depois de P5 a folha 4/2099 devia voltar a estar aberta e sem resultados (% / %).', v_estado, v_n;
    END IF;

    -- P6. Ligar com data futura, ferias em abril: alterada, linha, um evento.
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 4, 11);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM true
       OR (v_j ->> 'ativo_desde')::date IS DISTINCT FROM v_d1
       OR NOT EXISTS (SELECT 1 FROM public.hr_subsidios_config c
                       WHERE c.organization_id = k_nike AND c.ativo_desde = v_d1 AND c.ferias_mes = 4 AND c.natal_mes = 11
                         AND c.updated_by = v_autor)
       OR (SELECT count(*) FROM public.hr_subsidios_config_eventos e WHERE e.organization_id = k_nike) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.hr_subsidios_config_eventos e
                       WHERE e.organization_id = k_nike AND e.acao = 'config_alterada'
                         AND e.ator_auth_uid = v_uid AND e.ator_id = v_autor
                         AND e.dados = jsonb_build_object(
                               'antes',  jsonb_build_object('ativo_desde', NULL, 'ferias_mes', 6, 'natal_mes', 11),
                               'depois', jsonb_build_object('ativo_desde', v_d1, 'ferias_mes', 4, 'natal_mes', 11),
                               'linha_criada', true)) THEN
      RAISE EXCEPTION 'Conferir: ligar em % devia criar a linha (4, 11) e um evento com antes/depois; deu %.', v_d1, v_j;
    END IF;
    -- O mesmo outra vez: alterada=false, sem evento novo.
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 4, 11);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM false
       OR (SELECT count(*) FROM public.hr_subsidios_config_eventos e WHERE e.organization_id = k_nike) <> 1 THEN
      RAISE EXCEPTION 'Conferir: guardar o mesmo devia dar alterada=false sem evento; deu %.', v_j;
    END IF;
    v_j := public.rpc_hr_subsidios_config_ler(k_nike);
    IF (v_j ->> 'tem_config')::boolean IS DISTINCT FROM true
       OR (v_j ->> 'ativo_desde')::date IS DISTINCT FROM v_d1
       OR (v_j ->> 'ferias_mes')::integer IS DISTINCT FROM 4
       OR (v_j -> 'folhas_fechadas_desde') IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Conferir: ler depois de ligar deu %.', v_j;
    END IF;

    -- P7. O fecho com o pagamento LIGADO para a folha 4/2099 (v_d1 <= 2099-04-30).
    PERFORM set_config('request.jwt.claim.sub', v_uid_fecho::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid_fecho, 'role', 'authenticated')::text, true);
    -- a) A assinatura da folha: aplica, paga ferias (rotulo 4 = ferias_mes 4),
    --    e o texto documentado.
    v_sj := public.rpc_hr_subsidios_assinatura(v_per);
    v_ass1 := v_sj ->> 'assinatura';
    IF (v_sj ->> 'aplica')::boolean IS DISTINCT FROM true
       OR (v_sj ->> 'paga_ferias')::boolean IS DISTINCT FROM true
       OR (v_sj ->> 'paga_natal')::boolean IS DISTINCT FROM false
       OR (v_sj ->> 'ferias_mes')::integer IS DISTINCT FROM 4
       OR (v_sj ->> 'natal_mes')::integer IS DISTINCT FROM 11
       OR (v_sj ->> 'ativo_desde')::date IS DISTINCT FROM v_d1
       OR v_ass1 IS DISTINCT FROM md5('hr_subsidios:v1:' || to_char(v_d1, 'YYYY-MM-DD') || ':4:11') THEN
      RAISE EXCEPTION 'Conferir: a assinatura da folha 4/2099 com o pagamento ligado devia ser aplica, paga ferias, md5 do texto do cabecalho; deu %.', v_sj;
    END IF;

    -- b) a d) Recusas, todas com a folha aberta e nada gravado no fim.
    FOR v_t IN
      SELECT x.nome, x.payload, x.codigo, x.texto
        FROM (VALUES
          ('cliente de hoje (sem chaves nem assinatura)', v_payload, 'HRA90', 'processamento_fechar_subsidios_desactualizados'),
          ('assinatura errada',
           (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', md5('errada')) ORDER BY e.ord)
              FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)),
           'HRA90', 'processamento_fechar_subsidios_desactualizados'),
          ('assinatura null',
           (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', NULL) ORDER BY e.ord)
              FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)),
           'HRA90', 'processamento_fechar_subsidios_desactualizados'),
          ('assinatura certa, sem as chaves',
           (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
              FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)),
           '22023', 'processamento_fechar_resultado_mal_formado'),
          ('assinatura certa, so subsidio_ferias',
           (SELECT jsonb_agg((e.value #- '{totais,subsidio_natal}') || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
              FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)),
           '22023', 'processamento_fechar_resultado_mal_formado')
        ) AS x(nome, payload, codigo, texto)
    LOOP
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_t.payload);
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM v_t.codigo OR coalesce(position(v_t.texto IN v_msg), 0) <> 1 THEN
        RAISE EXCEPTION 'Conferir: ligado, fechar "%" devia dar % %; deu % %.', v_t.nome, v_t.codigo, v_t.texto,
          coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;

    -- b2) Ligado, assinatura certa (ferias 4, Natal 11), folha 4: Natal com
    --     valor fora do seu mes e valores negativos sao recusados (22023).
    FOR v_t IN
      SELECT x.nome, x.payload, x.contem
        FROM (VALUES
          ('subsidio_natal 100 na folha 4 (Natal na 11)',
           (SELECT jsonb_agg(jsonb_set(e.value, '{totais,subsidio_natal}', '100'::jsonb)
                             || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
              FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)),
           'subsidio_natal so se paga na folha do mes 11'),
          ('subsidio_ferias -1 na folha certa',
           (SELECT jsonb_agg(jsonb_set(e.value, '{totais,subsidio_ferias}', '-1'::jsonb)
                             || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
              FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)),
           'nao podem ser negativos')
        ) AS x(nome, payload, contem)
    LOOP
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_t.payload);
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM '22023'
         OR coalesce(position('processamento_fechar_resultado_mal_formado' IN v_msg), 0) <> 1
         OR coalesce(position(v_t.contem IN v_msg), 0) = 0 THEN
        RAISE EXCEPTION 'Conferir: ligado, fechar "%" devia dar 22023 com "%"; deu % %.', v_t.nome, v_t.contem,
          coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;

    -- e) Mudar o mes com a folha aberta ja calculada: o calculo levou v_ass1
    --    (ferias 4); alguem muda ferias 4 -> 5 (aceite: nenhuma folha fechada
    --    coberta); o fecho com v_ass1 ja nao passa em silencio (HRA90). Repor
    --    4 devolve a mesma assinatura.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 5, 11);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Conferir: ferias 4 -> 5 sem folhas fechadas cobertas devia ser aceite; deu %.', v_j;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid_fecho::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid_fecho, 'role', 'authenticated')::text, true);
    v_st := NULL;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
        (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
           FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)));
    EXCEPTION WHEN OTHERS THEN
      v_st := SQLSTATE;
      v_msg := SQLERRM;
    END;
    IF v_st IS DISTINCT FROM 'HRA90'
       OR coalesce(position('processamento_fechar_subsidios_desactualizados' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: fechar com a assinatura de antes da mudanca de mes devia dar HRA90; deu % %.', coalesce(v_st, 'aceite'), coalesce(v_msg, '');
    END IF;
    v_ass2 := public.rpc_hr_subsidios_assinatura(v_per) ->> 'assinatura';
    IF v_ass2 IS NULL OR v_ass2 = v_ass1
       OR v_ass2 IS DISTINCT FROM md5('hr_subsidios:v1:' || to_char(v_d1, 'YYYY-MM-DD') || ':5:11') THEN
      RAISE EXCEPTION 'Conferir: a assinatura depois de ferias 4 -> 5 devia mudar para o md5 do texto com 5 (antes %, depois %).', v_ass1, coalesce(v_ass2, 'NULL');
    END IF;
    -- Com ferias 5 e Natal 11, a folha 4 nao e de nenhum dos dois: ferias
    -- 1234.56 recusado (22023); 0 e null nas duas chaves aceites (fecha;
    -- sentinela HSB03, desfeito).
    v_st := NULL;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
        (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', v_ass2) ORDER BY e.ord)
           FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)));
    EXCEPTION WHEN OTHERS THEN
      v_st := SQLSTATE;
      v_msg := SQLERRM;
    END;
    IF v_st IS DISTINCT FROM '22023'
       OR coalesce(position('processamento_fechar_resultado_mal_formado' IN v_msg), 0) <> 1
       OR coalesce(position('subsidio_ferias so se paga na folha do mes 5' IN v_msg), 0) = 0 THEN
      RAISE EXCEPTION 'Conferir: ferias na folha 5, fechar a folha 4 com subsidio_ferias 1234.56 devia dar 22023; deu % %.',
        coalesce(v_st, 'aceite'), coalesce(v_msg, '');
    END IF;
    BEGIN
      -- A primeira pessoa leva ferias null e Natal 0; as outras ferias 0 e Natal null.
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
        (SELECT jsonb_agg(jsonb_set(e.value, '{totais}',
                                    (e.value -> 'totais')
                                    || (CASE WHEN (e.value ->> 'pessoa_id')::uuid = v_primeira
                                             THEN jsonb_build_object('subsidio_ferias', NULL, 'subsidio_natal', 0)
                                             ELSE jsonb_build_object('subsidio_ferias', 0, 'subsidio_natal', NULL) END))
                          || jsonb_build_object('subsidios_assinatura', v_ass2) ORDER BY e.ord)
           FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS e(value, ord)));
      SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
      IF v_estado IS DISTINCT FROM 'fechado' THEN
        RAISE EXCEPTION 'Conferir: 0 e null nos subsidios numa folha fora dos dois meses deviam fechar (estado %).', v_estado;
      END IF;
      RAISE EXCEPTION 'teste_subsidios_zero_null_ok' USING ERRCODE = 'HSB03';
    EXCEPTION
      WHEN SQLSTATE 'HSB03' THEN
        NULL; -- desfeito: a folha 4/2099 volta a estar aberta e sem resultados.
    END;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 4, 11);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Conferir: repor ferias 5 -> 4 devia ser aceite; deu %.', v_j;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid_fecho::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid_fecho, 'role', 'authenticated')::text, true);
    IF (public.rpc_hr_subsidios_assinatura(v_per) ->> 'assinatura') IS DISTINCT FROM v_ass1 THEN
      RAISE EXCEPTION 'Conferir: repor ferias 4 devia devolver a assinatura de antes.';
    END IF;
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
    SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados r WHERE r.periodo_id = v_per AND r.organization_id = k_nike;
    IF v_estado IS DISTINCT FROM 'aberto' OR v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: depois das recusas a folha devia continuar aberta e sem resultados (% / %).', v_estado, v_n;
    END IF;

    -- f) "Ja foi pago" e o dinheiro gravado (subtransaccao, sentinela HSB02):
    --    fechar 4/2099 com subsidio_ferias 0 em todos e mudar ferias 4 -> 9 e
    --    ACEITE (a folha de 4/2099 fechou mas nao pagou ferias).
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
        (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
           FROM jsonb_array_elements(v_payload_zero) WITH ORDINALITY AS e(value, ord)));
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 9, 11);
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS NOT NULL OR (v_j ->> 'alterada')::boolean IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Conferir: com a folha 4/2099 fechada sem subsidio de ferias pago (0), ferias 4 -> 9 devia ser aceite; deu % %.',
          coalesce(v_st, 'aceite'), coalesce(v_msg, v_j::text);
      END IF;
      RAISE EXCEPTION 'teste_subsidios_pago_e_dinheiro_ok' USING ERRCODE = 'HSB02';
    EXCEPTION
      WHEN SQLSTATE 'HSB02' THEN
        NULL; -- desfeito: a folha volta a estar aberta, ferias volta a 4.
    END;
    PERFORM set_config('request.jwt.claim.sub', v_uid_fecho::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid_fecho, 'role', 'authenticated')::text, true);

    -- g) Assinatura certa e as duas chaves: fecha e grava os valores enviados.
    PERFORM public.rpc_hr_processamento_periodo_fechar(v_per,
      (SELECT jsonb_agg(e.value || jsonb_build_object('subsidios_assinatura', v_ass1) ORDER BY e.ord)
         FROM jsonb_array_elements(v_payload_chaves) WITH ORDINALITY AS e(value, ord)));
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per AND pp.organization_id = k_nike;
    SELECT count(DISTINCT r.pessoa_id)::integer INTO v_n
      FROM public.hr_processamento_resultados r
     WHERE r.periodo_id = v_per AND r.organization_id = k_nike
       AND r.totais ? 'subsidio_ferias' AND r.totais ? 'subsidio_natal';
    SELECT r.totais INTO v_totais FROM public.hr_processamento_resultados r
     WHERE r.periodo_id = v_per AND r.organization_id = k_nike AND r.pessoa_id = v_primeira;
    IF v_estado IS DISTINCT FROM 'fechado' OR v_n <> v_pessoas
       OR (v_totais ->> 'subsidio_ferias')::numeric IS DISTINCT FROM 1234.56
       OR (v_totais -> 'subsidio_natal') IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Conferir: fechar com a assinatura certa e as chaves devia fechar com % pessoas e gravar 1234.56/null (estado %, % pessoas, totais %).',
        v_pessoas, v_estado, v_n, v_totais;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- P8. Com a folha de 4/2099 fechada e coberta (ligado desde v_d1): a data
    --     ja nao muda (HRA88); a regra dos meses (Y = 2099, U = 4; ferias
    --     pagas com valor gravado na folha de 4/2099, Natal ainda nao).
    FOR v_t IN
      SELECT x.nome, x.desde, x.fm, x.nm, x.codigo
        FROM (VALUES
          ('desligar',                       NULL::date, 4, 11, 'HRA88'),
          ('adiar',                          v_d1 + 1,   4, 11, 'HRA88'),
          ('antecipar (antes da folha fechada)', v_d1 - 1, 4, 11, 'HRA88'),
          ('ferias 4 -> 9 (pagaria duas vezes)', v_d1,   9, 11, 'HRA89'),
          ('natal 11 -> 3 (nunca pagaria)',  v_d1,       4, 3,  'HRA89'),
          ('natal 11 -> 4 (nunca pagaria)',  v_d1,       4, 4,  'HRA89'))
             AS x(nome, desde, fm, nm, codigo)
    LOOP
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_t.desde, v_t.fm, v_t.nm);
      EXCEPTION WHEN OTHERS THEN
        v_st := SQLSTATE;
        v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM v_t.codigo THEN
        RAISE EXCEPTION 'Conferir: "%" devia dar %; deu % %.', v_t.nome, v_t.codigo, coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;
    -- Aceites: os dois meses ja passados (ferias 4 -> 2) e os dois por vir (natal 11 -> 12).
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 2, 11);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Conferir: ferias 4 -> 2 (os dois ja passados em 2099) devia ser aceite; deu %.', v_j;
    END IF;
    v_j := public.rpc_hr_subsidios_config_guardar(k_nike, v_d1, 2, 12);
    IF (v_j ->> 'alterada')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Conferir: natal 11 -> 12 (os dois por vir em 2099) devia ser aceite; deu %.', v_j;
    END IF;
    -- Eventos: ligar (1), 4 -> 5 e 5 -> 4 em P7 e) (2), e os dois aceites (2).
    IF NOT EXISTS (SELECT 1 FROM public.hr_subsidios_config c
                    WHERE c.organization_id = k_nike AND c.ativo_desde = v_d1 AND c.ferias_mes = 2 AND c.natal_mes = 12)
       OR (SELECT count(*) FROM public.hr_subsidios_config_eventos e WHERE e.organization_id = k_nike) <> 5
       OR NOT EXISTS (SELECT 1 FROM public.hr_subsidios_config_eventos e
                       WHERE e.organization_id = k_nike
                         AND e.dados = jsonb_build_object(
                               'antes',  jsonb_build_object('ativo_desde', v_d1, 'ferias_mes', 2, 'natal_mes', 11),
                               'depois', jsonb_build_object('ativo_desde', v_d1, 'ferias_mes', 2, 'natal_mes', 12),
                               'linha_criada', false)) THEN
      RAISE EXCEPTION 'Conferir: depois de P8 a linha devia ser (%, 2, 12) com 5 eventos (o ultimo 11 -> 12).', v_d1;
    END IF;
    -- A folha fechada continua com o que gravou (mudar os meses nao lhe toca).
    IF (SELECT r.totais FROM public.hr_processamento_resultados r
         WHERE r.periodo_id = v_per AND r.organization_id = k_nike AND r.pessoa_id = v_primeira) IS DISTINCT FROM v_totais THEN
      RAISE EXCEPTION 'Conferir: mudar os meses alterou os totais de uma folha fechada.';
    END IF;

    -- P9. Ler: a primeira folha fechada coberta e a ultima fechada.
    v_j := public.rpc_hr_subsidios_config_ler(k_nike);
    IF (v_j ->> 'folhas_fechadas_desde')::date IS DISTINCT FROM k_ini
       OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM k_fim
       OR (v_j ->> 'ferias_mes')::integer IS DISTINCT FROM 2
       OR (v_j ->> 'natal_mes')::integer IS DISTINCT FROM 12 THEN
      RAISE EXCEPTION 'Conferir: ler depois do fecho devia dar folhas_fechadas_desde %, ultima %, meses 2 e 12; deu %.', k_ini, k_fim, v_j;
    END IF;

    -- P10. Eventos so de acrescentar (mesmo ao dono).
    v_n := 0;
    BEGIN UPDATE public.hr_subsidios_config_eventos SET dados = '{}'::jsonb WHERE organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE = '42501' THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_subsidios_config_eventos WHERE organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE = '42501' THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'Conferir: UPDATE e DELETE de eventos deviam ser recusados (% de 2).', v_n;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir: prova na nike na folha de 4/2099 (ligado desde %); %; %; horas extra: %.',
      v_d1, v_prova_sem, v_prova_desvios,
      (CASE WHEN v_he_ligado THEN 'interruptor ligado, assinaturas enviadas' ELSE 'interruptor desligado' END);
    RAISE EXCEPTION 'teste_subsidios_ok' USING ERRCODE = 'HSB00';
  EXCEPTION
    WHEN SQLSTATE 'HSB00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF current_user::text IS DISTINCT FROM v_papel THEN
    RAISE EXCEPTION 'Conferir: o papel no fim (%) nao e o do inicio (%).', current_user::text, v_papel;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike AND pp.ano = 2099)
     OR EXISTS (SELECT 1 FROM public.hr_subsidios_config c WHERE c.organization_id = k_nike)
     OR EXISTS (SELECT 1 FROM public.hr_subsidios_config_eventos e WHERE e.organization_id = k_nike)
     OR (SELECT count(*) FROM public.hr_desvios_config k WHERE k.organization_id = k_nike) IS DISTINCT FROM v_n_desvios THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: hr_subsidios_config e eventos (RLS forcada, sem politicas nem privilegios, DEFAULT 6 e 11, CHECK); RPCs so para authenticated; validador e fecho = corpos lidos + trocas (md5 % e %); validador aceita sem as chaves novas e recusa a forma errada; assinatura = texto do cabecalho; na nike: 42501 sem sessao e sem permissao (ler, guardar, assinatura), omissoes, HRA81; desligado: fecha sem as chaves, ignora mes e sinal dos valores, e recusa assinatura nao null (HRA90); ligado: recusa sem assinatura, errada ou null (HRA90), sem as chaves, valor fora do mes do subsidio ou negativo (22023), aceita 0 e null fora dos dois meses, mudar o mes com a folha aberta calculada (HRA90), e fecha com a assinatura certa; HRA88 e HRA89 (ja pago = valor gravado > 0); meses aceites.',
    (SELECT e.md5_depois FROM tmp_hs_esperado e WHERE e.fn = k_erro),
    (SELECT e.md5_depois FROM tmp_hs_esperado e WHERE e.fn = k_fechar);
END;
$conferir$;

COMMIT;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): 20270112500000
--    ja aplicada (senao a guarda G5 aborta: o validador e o fecho ainda sao
--    os de antes) e so este ficheiro pendente, com carimbo acima do maximo do
--    remoto.
-- 2. Prova na nike ANTES do push: correr este ficheiro numa transaccao
--    terminada por ROLLBACK (trocar o COMMIT final). E a primeira medicao do
--    md5 do fecho vivo (3c2943c8..., calculado dos ficheiros).
-- 3. ORDEM OBRIGATORIA: este push PRIMEIRO, o cliente novo DEPOIS. O cliente
--    novo envia sempre totais.subsidio_ferias e totais.subsidio_natal, que o
--    validador de antes deste push recusa ("campos desconhecidos em totais"):
--    publicado antes, fechar qualquer folha falharia em todas as organizacoes.
--    O cliente de hoje continua a fechar depois do push (pagamento desligado
--    em todas). Para ligar o pagamento o cliente tem de enviar
--    subsidios_assinatura (de rpc_hr_subsidios_assinatura), senao HRA90.
-- ==============================================================================
