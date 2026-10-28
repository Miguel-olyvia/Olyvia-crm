-- RASCUNHO, NADA APLICADO. Base RH (uetjghdkwbywbftedtth). Não é uma migration até ser revista (ecc:database-reviewer e ecc:security-reviewer)
-- e copiada para supabase/migrations com este mesmo nome (20261231999500_levantamento_efeitos.sql).
--
-- Levantamento configurável com efeito no orçamento: cada pergunta declara a que campo da Emylia se liga (campo_emylia), se mexe no
-- orçamento (efeito_modo) e, nas numéricas com efeito «próprio», o efeito por unidade (efeito); cada opção declara o valor que tem no
-- campo da Emylia (valor_emylia) e o efeito de ser a escolhida (efeito, só com o modo «próprio» na pergunta).
--
-- O CÓDIGO DA APLICAÇÃO JÁ ESTÁ NO REMOTO e espera exactamente este contrato (src/hooks/pessoas/workflow/questionario.ts e
-- efeitosQuestionario.ts no envio e na leitura do editor; src/components/negocio-metas/questionarioForm.ts na leitura da visita). Os controlos
-- estão escondidos pela bandeira EFEITOS_NA_BASE = false (src/components/pessoas-workflow/LevantamentoEfeito.tsx). Enquanto ela estiver
-- desligada o editor não manda nenhuma chave nova, por isso esta migration não muda nada do que hoje se grava ou se lê.
--
-- ORDEM OBRIGATÓRIA (migração e código juntos, no mesmo dia):
--   1. Testes contra o remoto AINDA POR CORRIGIR (o vermelho é agora: hoje uma chave nova dá NG009). Nunca depois do push.
--   2. supabase.cmd migration list --linked: confirmar que o pendente é SÓ este ficheiro (o carimbo 20261231998000 já está ocupado no remoto
--      por rh_cargos_tecnicos_oficios, de outro ramo; por isso este é 20261231999500).
--   3. supabase.cmd db push --linked --dry-run; depois supabase.cmd db push --linked.
--   4. Só então ligar a bandeira: EFEITOS_NA_BASE = true em LevantamentoEfeito.tsx, publicar, e ver ao vivo na nike (guardar um efeito,
--      reabrir, ver a nota na visita). Nunca na Mudelar.
--
-- O que muda para quem já usa (Mudelar incluída): só colunas novas, todas NULL e SEM valor por omissão (nada se inventa: uma pergunta sem
-- ligação nem efeito fica exactamente como hoje). As três funções mantêm assinatura, SECURITY, search_path, permissões e validações de
-- âmbito; só passam a aceitar, validar (NG009), gravar e devolver as chaves novas. A leitura do questionário passa a devolver custo e preço
-- dos efeitos a quem já o lê hoje (pessoas.view): decisão a confirmar pelo database-reviewer (ver DESENHO, ponto 6).
--
-- Versões de partida, confirmadas em 28/10 (pg_get_functiondef no remoto = ficheiro, linha a linha):
--   fn_neg_questionario_normalizar  20261227100000_juntar_estrutura_da_principal.sql (a de 20261226090000)
--   neg_guardar_questionario        20261231100000_qualificacao_negocio_e_contacto.sql (6h)
--   neg_questionario_levantamento   20261227100000_juntar_estrutura_da_principal.sql (a de 20261226090000)
-- A guarda abaixo recusa correr se alguma delas tiver mudado entretanto (md5 da definição).

-- -----------------------------------------------------------------------------
-- 0. Guarda de partida
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  v_nome text;
  v_n    integer;
  v_h    text;
  v_def  text;
  v_esp  text;
BEGIN
  FOREACH v_nome IN ARRAY ARRAY['fn_neg_questionario_normalizar', 'neg_guardar_questionario', 'neg_questionario_levantamento'] LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
    SELECT md5(pg_get_functiondef(p.oid)), pg_get_functiondef(p.oid)::text INTO v_h, v_def FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    -- Já com esta migration (re-execução): aceita-se. Senão tem de ser a versão copiada.
    SELECT x.h INTO v_esp FROM (VALUES ('fn_neg_questionario_normalizar', '2b35b1f8bc581adae3d0ff517a48f459'), ('neg_guardar_questionario', '6e6e89935db279970ca06487f3d9a588'), ('neg_questionario_levantamento', 'aa172d317166731dffd838090b0a3e80')) AS x(n, h) WHERE x.n = v_nome;
    IF position('campo_emylia' IN v_def) = 0 AND v_h <> v_esp THEN
      RAISE EXCEPTION 'Guarda: public.% no remoto já não é a versão copiada (md5 %).', v_nome, v_h;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('fn_levantamento_efeito_valido', 'fn_neg_questionario_efeito')
    AND position('20261231999500' IN coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existe uma função de efeitos que não é desta migration.';
  END IF;
END
$guarda$;

-- -----------------------------------------------------------------------------
-- 1. A forma de um efeito (usada pelos CHECK e pela função de normalizar)
-- -----------------------------------------------------------------------------
-- Uma lista de 1 a 5 itens; cada item tem exactamente as chaves do seu tipo, todas preenchidas (sem valores por omissão):
--   valor        {tipo, descricao, custo, preco}
--   horas        {tipo, descricao, horas, custo_hora, preco_hora}
--   percentagem  {tipo, descricao, pct}             (pct em pontos: 10 = mais dez por cento sobre os serviços)
-- descricao: o motivo, 1 a 120 caracteres, aparado, sem caracteres de controlo. Números: de 0 a 99999999 (pct de 0 a 1000).
-- NULL = sem efeito. Uma lista vazia ou um item por preencher é inválido. Nunca levanta erro: devolve falso.
CREATE OR REPLACE FUNCTION public.fn_levantamento_efeito_valido(p_efeito jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_i    jsonb;
  v_tipo text;
  v_nums text[];
  v_k    text;
  v_d    text;
  v_max  numeric;
BEGIN
  IF p_efeito IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p_efeito) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_efeito) < 1 OR jsonb_array_length(p_efeito) > 5 THEN
    RETURN false;
  END IF;
  FOR v_i IN SELECT e.value FROM jsonb_array_elements(p_efeito) AS e(value) LOOP
    IF jsonb_typeof(v_i) <> 'object' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_i -> 'tipo') IS DISTINCT FROM 'string' OR jsonb_typeof(v_i -> 'descricao') IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;
    v_tipo := v_i ->> 'tipo';
    v_nums := CASE v_tipo
                WHEN 'valor'       THEN ARRAY['custo', 'preco']
                WHEN 'horas'       THEN ARRAY['horas', 'custo_hora', 'preco_hora']
                WHEN 'percentagem' THEN ARRAY['pct']
              END;
    IF v_nums IS NULL THEN
      RETURN false;
    END IF;
    IF (SELECT array_agg(k.chave ORDER BY k.chave) FROM jsonb_object_keys(v_i) AS k(chave))
       IS DISTINCT FROM
       (SELECT array_agg(x.chave ORDER BY x.chave) FROM unnest(ARRAY['tipo', 'descricao'] || v_nums) AS x(chave)) THEN
      RETURN false;
    END IF;
    v_d := v_i ->> 'descricao';
    IF v_d <> btrim(v_d) OR char_length(v_d) < 1 OR char_length(v_d) > 120 OR v_d ~ '[[:cntrl:]]' THEN
      RETURN false;
    END IF;
    v_max := CASE WHEN v_tipo = 'percentagem' THEN 1000 ELSE 99999999 END;
    FOREACH v_k IN ARRAY v_nums LOOP
      IF jsonb_typeof(v_i -> v_k) IS DISTINCT FROM 'number' THEN
        RETURN false;
      END IF;
      IF (v_i ->> v_k)::numeric < 0 OR (v_i ->> v_k)::numeric > v_max THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_levantamento_efeito_valido(p_efeito jsonb) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.fn_levantamento_efeito_valido(p_efeito jsonb) IS 'Pessoas, levantamento configurável: a forma de um efeito no orçamento (NULL ou 1 a 5 itens completos: valor, horas ou percentagem, com motivo). Usada pelos CHECK de levantamento_perguntas e levantamento_opcoes. Pura, nunca levanta erro. 20261231999500.';

-- A mesma forma, com a mensagem NG009 que o editor mostra, e normalizada (só as chaves do tipo, motivo aparado, números).
-- Ausente ou null = sem efeito (NULL); lista vazia = sem efeito (NULL). Uso interno de fn_neg_questionario_normalizar.
CREATE OR REPLACE FUNCTION public.fn_neg_questionario_efeito(p_valor jsonb, p_campo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_itens CONSTANT integer := 5;
  c_max_valor CONSTANT numeric := 99999999;
  c_max_pct   CONSTANT numeric := 1000;
  v_i    jsonb;
  v_tipo text;
  v_nums text[];
  v_k    text;
  v_n    numeric;
  v_item jsonb;
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_valor) <> 'array' THEN
    RAISE EXCEPTION 'Questionário inválido: % tem de ser uma lista.', p_campo USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(p_valor) = 0 THEN
    RETURN NULL;
  END IF;
  IF jsonb_array_length(p_valor) > c_max_itens THEN
    RAISE EXCEPTION 'Questionário inválido: % tem no máximo 5 itens.', p_campo USING ERRCODE = 'NG009';
  END IF;

  FOR v_i IN SELECT e.value FROM jsonb_array_elements(p_valor) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
  LOOP
    IF jsonb_typeof(v_i) <> 'object' THEN
      RAISE EXCEPTION 'Questionário inválido: % tem de ser uma lista de objectos.', p_campo USING ERRCODE = 'NG009';
    END IF;
    v_tipo := public.fn_neg_questionario_texto(v_i -> 'tipo', 20, false, 'tipo do efeito');
    v_nums := CASE v_tipo
                WHEN 'valor'       THEN ARRAY['custo', 'preco']
                WHEN 'horas'       THEN ARRAY['horas', 'custo_hora', 'preco_hora']
                WHEN 'percentagem' THEN ARRAY['pct']
              END;
    IF v_nums IS NULL THEN
      RAISE EXCEPTION 'Questionário inválido: tipo de efeito desconhecido.' USING ERRCODE = 'NG009';
    END IF;
    PERFORM public.fn_neg_questionario_objecto(v_i, ARRAY['tipo', 'descricao'] || v_nums, p_campo);
    v_item := jsonb_build_object(
      'tipo', v_tipo,
      'descricao', public.fn_neg_questionario_texto(v_i -> 'descricao', 120, false, 'motivo do efeito'));
    FOREACH v_k IN ARRAY v_nums LOOP
      v_n := public.fn_neg_questionario_numero(v_i -> v_k, 'valor do efeito');
      IF v_n IS NULL THEN
        RAISE EXCEPTION 'Questionário inválido: % por preencher (sem valores por omissão).', p_campo USING ERRCODE = 'NG009';
      END IF;
      IF v_n < 0 OR v_n > (CASE WHEN v_tipo = 'percentagem' THEN c_max_pct ELSE c_max_valor END) THEN
        RAISE EXCEPTION 'Questionário inválido: valores do efeito fora dos limites (não negativos; até 99999999, ou até 1000 pontos na percentagem).'
          USING ERRCODE = 'NG009';
      END IF;
      v_item := v_item || jsonb_build_object(v_k, v_n);
    END LOOP;
    v_out := v_out || jsonb_build_array(v_item);
  END LOOP;

  -- A mesma regra dos CHECK das tabelas (defensivo: as duas não podem divergir).
  IF NOT public.fn_levantamento_efeito_valido(v_out) THEN
    RAISE EXCEPTION 'Questionário inválido: % com forma inválida.', p_campo USING ERRCODE = 'NG009';
  END IF;
  RETURN v_out;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_efeito(p_valor jsonb, p_campo text) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_questionario_efeito(p_valor jsonb, p_campo text) IS 'Pessoas, levantamento configurável: valida (NG009) e normaliza um efeito no orçamento de uma pergunta ou opção. Uso interno de fn_neg_questionario_normalizar. 20261231999500.';

-- -----------------------------------------------------------------------------
-- 2. Colunas (todas NULL, sem valor por omissão), CHECK e índice único
-- -----------------------------------------------------------------------------
ALTER TABLE public.levantamento_perguntas
  ADD COLUMN IF NOT EXISTS campo_emylia text,
  ADD COLUMN IF NOT EXISTS efeito_modo  text,
  ADD COLUMN IF NOT EXISTS efeito       jsonb;

ALTER TABLE public.levantamento_opcoes
  ADD COLUMN IF NOT EXISTS valor_emylia text,
  ADD COLUMN IF NOT EXISTS efeito       jsonb;

COMMENT ON COLUMN public.levantamento_perguntas.campo_emylia IS 'Chave do campo da visita da Emylia (src/emylia/campos.ts) que esta pergunta preenche. NULL = só nota do levantamento. Uma pergunta viva por campo e por organização (levantamento_perguntas_campo_emylia_uq).';
COMMENT ON COLUMN public.levantamento_perguntas.efeito_modo IS 'nenhum | emylia | proprio. NULL = omissão (o efeito que a Emylia já tem no campo ligado, se o tiver; senão nenhum).';
COMMENT ON COLUMN public.levantamento_perguntas.efeito IS 'Efeito por unidade, só nas perguntas de número com efeito_modo = proprio. Forma: fn_levantamento_efeito_valido. NULL = sem efeito.';
COMMENT ON COLUMN public.levantamento_opcoes.valor_emylia IS 'O valor que esta opção tem no campo da Emylia ligado à pergunta. NULL = sem correspondência.';
COMMENT ON COLUMN public.levantamento_opcoes.efeito IS 'Efeito de escolher esta opção; só conta (e só se aceita) com efeito_modo = proprio na pergunta. Forma: fn_levantamento_efeito_valido. NULL = sem efeito.';

-- Os CHECK, idempotentes (guarda no catálogo; ::regclass só dentro do DO).
DO $chk$
DECLARE
  v_def record;
BEGIN
  FOR v_def IN
    SELECT * FROM (VALUES
      ('public.levantamento_perguntas', 'levantamento_perguntas_campo_emylia_check',
       'CHECK (campo_emylia IS NULL OR campo_emylia ~ ''^[a-z][a-z0-9_]{0,59}$'')'),
      ('public.levantamento_perguntas', 'levantamento_perguntas_efeito_modo_check',
       'CHECK (efeito_modo IS NULL OR efeito_modo IN (''nenhum'', ''emylia'', ''proprio''))'),
      ('public.levantamento_perguntas', 'levantamento_perguntas_efeito_check',
       'CHECK (public.fn_levantamento_efeito_valido(efeito))'),
      ('public.levantamento_perguntas', 'levantamento_perguntas_efeito_proprio_check',
       'CHECK (efeito IS NULL OR (efeito_modo = ''proprio'' AND tipo = ''numero''))'),
      ('public.levantamento_opcoes', 'levantamento_opcoes_valor_emylia_check',
       'CHECK (valor_emylia IS NULL OR (char_length(valor_emylia) BETWEEN 1 AND 80 AND valor_emylia = btrim(valor_emylia) AND valor_emylia !~ ''[[:cntrl:]]''))'),
      ('public.levantamento_opcoes', 'levantamento_opcoes_efeito_check',
       'CHECK (public.fn_levantamento_efeito_valido(efeito))')
    ) AS t(tabela, nome, expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                   WHERE c.conrelid = v_def.tabela::regclass AND c.conname = v_def.nome) THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', v_def.tabela, v_def.nome, v_def.expr);
    END IF;
  END LOOP;
END
$chk$;

-- Um campo da Emylia liga-se a uma só pergunta viva por organização (o questionário é um por organização: levantamento_questionario).
-- Conta também as perguntas inactivas: reactivar uma não pode dar duas respostas ao mesmo campo. As apagadas ficam de fora.
-- neg_guardar_questionario escreve este campo num passo próprio, depois de apagar o que não veio, para o índice nunca ver um duplicado
-- a meio de uma troca de campos entre perguntas.
CREATE UNIQUE INDEX IF NOT EXISTS levantamento_perguntas_campo_emylia_uq
  ON public.levantamento_perguntas (organization_id, campo_emylia)
  WHERE campo_emylia IS NOT NULL AND apagada_em IS NULL;

-- -----------------------------------------------------------------------------
-- 3. fn_neg_questionario_normalizar: aceita, valida e devolve as chaves novas
--    (pergunta: campo_emylia, efeito_modo, efeito; opção: valor_emylia, efeito). O resto igual.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_questionario_normalizar(p_seccoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_bytes     CONSTANT integer := 262144;
  c_max_seccoes   CONSTANT integer := 20;
  c_max_perguntas CONSTANT integer := 150;
  c_max_opcoes    CONSTANT integer := 30;
  c_max_numero    CONSTANT numeric := 99999999999.999;
  c_tipos     CONSTANT text[] := ARRAY['escolha_unica', 'escolha_multipla', 'texto', 'numero'];
  c_modos     CONSTANT text[] := ARRAY['nenhum', 'emylia', 'proprio'];
  c_chaves_s  CONSTANT text[] := ARRAY['id', 'ref', 'titulo', 'aba', 'especial', 'activa', 'perguntas'];
  c_chaves_p  CONSTANT text[] := ARRAY['id', 'ref', 'texto', 'tipo', 'bloco', 'activa', 'numero',
                                       'texto_max', 'depende', 'opcoes',
                                       'campo_emylia', 'efeito_modo', 'efeito'];
  c_chaves_o  CONSTANT text[] := ARRAY['id', 'ref', 'texto', 'activa', 'valor_emylia', 'efeito'];
  c_chaves_n  CONSTANT text[] := ARRAY['min', 'max', 'casas', 'unidade'];
  c_chaves_d  CONSTANT text[] := ARRAY['pergunta', 'opcoes', 'sem_resposta'];
  v_s     jsonb;
  v_q     jsonb;
  v_o     jsonb;
  v_x     jsonb;
  v_dep   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_qs    jsonb;
  v_os    jsonb;
  v_ids   text[] := ARRAY[]::text[];
  v_refs  text[] := ARRAY[]::text[];
  v_sid   text;
  v_sref  text;
  v_pid   text;
  v_pref  text;
  v_oid   text;
  v_oref  text;
  v_tipo  text;
  v_aba   text;
  v_esp   text;
  v_min   numeric;
  v_max   numeric;
  v_casas numeric;
  v_tmax  numeric;
  v_unid  text;
  v_np    integer := 0;
  v_campo  text;
  v_modo   text;
  v_ef     jsonb;
  v_oef    jsonb;
  v_campos text[] := ARRAY[]::text[];
BEGIN
  IF p_seccoes IS NULL OR jsonb_typeof(p_seccoes) <> 'array'
     OR octet_length(p_seccoes::text) > c_max_bytes THEN
    RAISE EXCEPTION 'Questionário inválido: lista de secções (até 256 KB).' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(p_seccoes) < 1 OR jsonb_array_length(p_seccoes) > c_max_seccoes THEN
    RAISE EXCEPTION 'Questionário inválido: de 1 a 20 secções.' USING ERRCODE = 'NG009';
  END IF;

  FOR v_s IN SELECT e.value FROM jsonb_array_elements(p_seccoes) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
  LOOP
    PERFORM public.fn_neg_questionario_objecto(v_s, c_chaves_s, 'secção');
    v_sid  := public.fn_neg_questionario_ident(v_s -> 'id', 'id', 'id da secção');
    v_sref := public.fn_neg_questionario_ident(v_s -> 'ref', 'ref', 'ref da secção');
    IF v_sid = ANY (v_ids) OR v_sref = ANY (v_refs) THEN
      RAISE EXCEPTION 'Questionário inválido: id ou ref repetido.' USING ERRCODE = 'NG009';
    END IF;
    IF v_sid IS NOT NULL THEN v_ids := v_ids || v_sid; END IF;
    IF v_sref IS NOT NULL THEN v_refs := v_refs || v_sref; END IF;

    v_aba := public.fn_neg_questionario_texto(v_s -> 'aba', 20, true, 'aba');
    v_esp := public.fn_neg_questionario_texto(v_s -> 'especial', 20, true, 'tipo especial');
    IF v_aba IS NOT NULL AND v_aba NOT IN ('visita', 'qualificacao') THEN
      RAISE EXCEPTION 'Questionário inválido: aba desconhecida.' USING ERRCODE = 'NG009';
    END IF;
    IF v_esp IS NOT NULL AND v_esp NOT IN ('visitas', 'medidas') THEN
      RAISE EXCEPTION 'Questionário inválido: tipo especial desconhecido.' USING ERRCODE = 'NG009';
    END IF;

    v_x := v_s -> 'perguntas';
    IF v_x IS NULL OR jsonb_typeof(v_x) = 'null' THEN
      v_x := '[]'::jsonb;
    END IF;
    IF jsonb_typeof(v_x) <> 'array' THEN
      RAISE EXCEPTION 'Questionário inválido: as perguntas de uma secção são uma lista.' USING ERRCODE = 'NG009';
    END IF;

    v_qs := '[]'::jsonb;
    FOR v_q IN SELECT e.value FROM jsonb_array_elements(v_x) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
    LOOP
      v_np := v_np + 1;
      IF v_np > c_max_perguntas THEN
        RAISE EXCEPTION 'Questionário inválido: até 150 perguntas.' USING ERRCODE = 'NG009';
      END IF;
      PERFORM public.fn_neg_questionario_objecto(v_q, c_chaves_p, 'pergunta');
      v_pid  := public.fn_neg_questionario_ident(v_q -> 'id', 'id', 'id da pergunta');
      v_pref := public.fn_neg_questionario_ident(v_q -> 'ref', 'ref', 'ref da pergunta');
      IF v_pid = ANY (v_ids) OR v_pref = ANY (v_refs) THEN
        RAISE EXCEPTION 'Questionário inválido: id ou ref repetido.' USING ERRCODE = 'NG009';
      END IF;
      IF v_pid IS NOT NULL THEN v_ids := v_ids || v_pid; END IF;
      IF v_pref IS NOT NULL THEN v_refs := v_refs || v_pref; END IF;

      v_tipo := public.fn_neg_questionario_texto(v_q -> 'tipo', 20, false, 'tipo da pergunta');
      IF v_tipo <> ALL (c_tipos) THEN
        RAISE EXCEPTION 'Questionário inválido: tipo de pergunta desconhecido.' USING ERRCODE = 'NG009';
      END IF;

      -- Número: limites, casas decimais e unidade (só em perguntas de número).
      v_min := NULL; v_max := NULL; v_casas := NULL; v_unid := NULL;
      v_x := v_q -> 'numero';
      IF v_x IS NOT NULL AND jsonb_typeof(v_x) <> 'null' THEN
        IF v_tipo <> 'numero' THEN
          RAISE EXCEPTION 'Questionário inválido: só as perguntas de número têm limites.' USING ERRCODE = 'NG009';
        END IF;
        PERFORM public.fn_neg_questionario_objecto(v_x, c_chaves_n, 'limites do número');
        v_min   := public.fn_neg_questionario_numero(v_x -> 'min', 'mínimo');
        v_max   := public.fn_neg_questionario_numero(v_x -> 'max', 'máximo');
        v_casas := public.fn_neg_questionario_numero(v_x -> 'casas', 'casas decimais');
        v_unid  := public.fn_neg_questionario_texto(v_x -> 'unidade', 12, true, 'unidade');
        IF abs(v_min) > c_max_numero OR v_min <> round(v_min, 3)
           OR abs(v_max) > c_max_numero OR v_max <> round(v_max, 3)
           OR v_min > v_max
           OR v_casas <> trunc(v_casas) OR v_casas < 0 OR v_casas > 3 THEN
          RAISE EXCEPTION 'Questionário inválido: limites do número (mínimo até máximo, até 3 casas decimais).'
            USING ERRCODE = 'NG009';
        END IF;
      END IF;

      v_tmax := public.fn_neg_questionario_numero(v_q -> 'texto_max', 'tamanho do texto');
      IF v_tmax IS NOT NULL
         AND (v_tipo <> 'texto' OR v_tmax <> trunc(v_tmax) OR v_tmax < 1 OR v_tmax > 2000) THEN
        RAISE EXCEPTION 'Questionário inválido: tamanho do texto (1 a 2000, só em perguntas de texto).'
          USING ERRCODE = 'NG009';
      END IF;

      -- 20261231999500: ligação ao campo da Emylia e efeito no orçamento (ausente = nada; nunca se inventa um valor).
      v_campo := public.fn_neg_questionario_texto(v_q -> 'campo_emylia', 60, true, 'campo da Emylia');
      IF v_campo IS NOT NULL THEN
        IF v_campo !~ '^[a-z][a-z0-9_]{0,59}$' THEN
          RAISE EXCEPTION 'Questionário inválido: campo da Emylia desconhecido.' USING ERRCODE = 'NG009';
        END IF;
        IF v_campo = ANY (v_campos) THEN
          RAISE EXCEPTION 'Questionário inválido: o campo da Emylia «%» está ligado a mais de uma pergunta.', v_campo
            USING ERRCODE = 'NG009';
        END IF;
        v_campos := v_campos || v_campo;
      END IF;
      v_modo := public.fn_neg_questionario_texto(v_q -> 'efeito_modo', 20, true, 'efeito no orçamento');
      IF v_modo IS NOT NULL AND v_modo <> ALL (c_modos) THEN
        RAISE EXCEPTION 'Questionário inválido: efeito no orçamento desconhecido.' USING ERRCODE = 'NG009';
      END IF;
      v_ef := public.fn_neg_questionario_efeito(v_q -> 'efeito', 'efeito da pergunta');
      IF v_ef IS NOT NULL AND (v_tipo <> 'numero' OR v_modo IS DISTINCT FROM 'proprio') THEN
        RAISE EXCEPTION 'Questionário inválido: o efeito por unidade só existe nas perguntas de número com efeito próprio.'
          USING ERRCODE = 'NG009';
      END IF;

      -- Opções: 2 a 30 nas perguntas de escolha; nenhuma nas outras.
      v_x := v_q -> 'opcoes';
      IF v_x IS NULL OR jsonb_typeof(v_x) = 'null' THEN
        v_x := '[]'::jsonb;
      END IF;
      IF jsonb_typeof(v_x) <> 'array' THEN
        RAISE EXCEPTION 'Questionário inválido: as opções são uma lista.' USING ERRCODE = 'NG009';
      END IF;
      IF v_tipo IN ('escolha_unica', 'escolha_multipla') THEN
        IF jsonb_array_length(v_x) < 2 OR jsonb_array_length(v_x) > c_max_opcoes THEN
          RAISE EXCEPTION 'Questionário inválido: uma pergunta de escolha tem de 2 a 30 opções.' USING ERRCODE = 'NG009';
        END IF;
      ELSIF jsonb_array_length(v_x) > 0 THEN
        RAISE EXCEPTION 'Questionário inválido: só as perguntas de escolha têm opções.' USING ERRCODE = 'NG009';
      END IF;

      v_os := '[]'::jsonb;
      FOR v_o IN SELECT e.value FROM jsonb_array_elements(v_x) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
      LOOP
        PERFORM public.fn_neg_questionario_objecto(v_o, c_chaves_o, 'opção');
        v_oid  := public.fn_neg_questionario_ident(v_o -> 'id', 'id', 'id da opção');
        v_oref := public.fn_neg_questionario_ident(v_o -> 'ref', 'ref', 'ref da opção');
        IF v_oid = ANY (v_ids) OR v_oref = ANY (v_refs) THEN
          RAISE EXCEPTION 'Questionário inválido: id ou ref repetido.' USING ERRCODE = 'NG009';
        END IF;
        IF v_oid IS NOT NULL THEN v_ids := v_ids || v_oid; END IF;
        IF v_oref IS NOT NULL THEN v_refs := v_refs || v_oref; END IF;
        v_oef := public.fn_neg_questionario_efeito(v_o -> 'efeito', 'efeito da opção');
        IF v_oef IS NOT NULL AND v_modo IS DISTINCT FROM 'proprio' THEN
          RAISE EXCEPTION 'Questionário inválido: o efeito de uma opção só conta com efeito próprio na pergunta.'
            USING ERRCODE = 'NG009';
        END IF;
        v_os := v_os || jsonb_build_array(jsonb_build_object(
          'id', v_oid, 'ref', v_oref,
          'texto', public.fn_neg_questionario_texto(v_o -> 'texto', 80, false, 'texto da opção'),
          'activa', public.fn_neg_questionario_booleano(v_o -> 'activa', true, 'activa'),
          'valor_emylia', public.fn_neg_questionario_texto(v_o -> 'valor_emylia', 80, true, 'valor no campo da Emylia'),
          'efeito', v_oef));
      END LOOP;

      -- Condição (um nível; resolvida e conferida na gravação).
      v_dep := NULL;
      v_x := v_q -> 'depende';
      IF v_x IS NOT NULL AND jsonb_typeof(v_x) <> 'null' THEN
        PERFORM public.fn_neg_questionario_objecto(v_x, c_chaves_d, 'condição');
        IF jsonb_typeof(v_x -> 'opcoes') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Questionário inválido: as opções da condição são uma lista.' USING ERRCODE = 'NG009';
        END IF;
        IF jsonb_array_length(v_x -> 'opcoes') < 1 OR jsonb_array_length(v_x -> 'opcoes') > c_max_opcoes THEN
          RAISE EXCEPTION 'Questionário inválido: a condição tem de 1 a 30 opções.' USING ERRCODE = 'NG009';
        END IF;
        v_dep := jsonb_build_object(
          'pergunta', public.fn_neg_questionario_ident(v_x -> 'pergunta', 'id_ou_ref', 'pergunta da condição'),
          'opcoes', (SELECT jsonb_agg(public.fn_neg_questionario_ident(e.value, 'id_ou_ref', 'opção da condição')
                                      ORDER BY e.ord)
                     FROM jsonb_array_elements(v_x -> 'opcoes') WITH ORDINALITY AS e(value, ord)),
          'sem_resposta', public.fn_neg_questionario_booleano(v_x -> 'sem_resposta', false, 'sem resposta'));
        IF v_dep ->> 'pergunta' IS NULL OR (v_dep -> 'opcoes') @> '[null]'::jsonb THEN
          RAISE EXCEPTION 'Questionário inválido: condição sem pergunta ou com opção vazia.' USING ERRCODE = 'NG009';
        END IF;
      END IF;

      v_qs := v_qs || jsonb_build_array(jsonb_build_object(
        'id', v_pid, 'ref', v_pref,
        'texto', public.fn_neg_questionario_texto(v_q -> 'texto', 200, false, 'texto da pergunta'),
        'tipo', v_tipo,
        'bloco', public.fn_neg_questionario_texto(v_q -> 'bloco', 80, true, 'subtítulo'),
        'activa', public.fn_neg_questionario_booleano(v_q -> 'activa', true, 'activa'),
        'numero_min', v_min, 'numero_max', v_max, 'numero_casas', v_casas::integer, 'unidade', v_unid,
        'texto_max', v_tmax::integer, 'depende', v_dep, 'opcoes', v_os,
        'campo_emylia', v_campo, 'efeito_modo', v_modo, 'efeito', v_ef));
    END LOOP;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_sid, 'ref', v_sref,
      'titulo', public.fn_neg_questionario_texto(v_s -> 'titulo', 80, false, 'título da secção'),
      'aba', v_aba, 'especial', v_esp,
      'activa', public.fn_neg_questionario_booleano(v_s -> 'activa', true, 'activa'),
      'perguntas', v_qs));
  END LOOP;

  RETURN v_out;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_normalizar(p_seccoes jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. neg_guardar_questionario: grava as chaves novas; mudar só o efeito, o modo, o valor da opção ou o campo da Emylia conta como
--    alteração e sobe a versão. O campo da Emylia escreve-se num passo próprio, depois de apagado o que não veio (índice único).
--    Permissões, âmbito, bloqueio, versão (NG021), D4 e invariantes: iguais à versão de 20261231100000.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_guardar_questionario(p_organization_id uuid, p_versao integer, p_seccoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_escolha  CONSTANT text[] := ARRAY['escolha_unica', 'escolha_multipla'];
  c_re_uuid  CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_uid      uuid := auth.uid();
  v_norm     jsonb;
  v_keys_pes text[];
  v_versao   integer;
  v_actor    uuid;
  v_s        jsonb;
  v_q        jsonb;
  v_o        jsonb;
  v_si       integer;
  v_qi       integer;
  v_oi       integer;
  v_sid      uuid;
  v_pid      uuid;
  v_oid      uuid;
  v_sec      public.levantamento_seccoes;
  v_per      public.levantamento_perguntas;
  v_chave    text;
  v_n        integer;
  v_k        integer;
  v_refs     jsonb := '{}'::jsonb;
  v_vs       uuid[] := ARRAY[]::uuid[];
  v_vp       uuid[] := ARRAY[]::uuid[];
  v_vo       uuid[] := ARRAY[]::uuid[];
  v_novas_p  uuid[] := ARRAY[]::uuid[];
  v_alt_s    uuid[] := ARRAY[]::uuid[];
  v_alt_p    uuid[] := ARRAY[]::uuid[];
  v_alt_o    uuid[] := ARRAY[]::uuid[];
  v_cri_s    integer := 0;
  v_cri_p    integer := 0;
  v_cri_o    integer := 0;
  v_apa_s    integer := 0;
  v_apa_p    integer := 0;
  v_apa_o    integer := 0;
  v_alvo     uuid;
  v_alvo_txt text;
  v_dep_ops  text[];
  v_dep_sem  boolean;
  v_n_env    integer;
  v_n_ok     integer;
  v_n_dist   integer;
  v_mudou    boolean;
  v_campos   text[] := ARRAY[]::text[];
  v_alt_cam  uuid[] := ARRAY[]::uuid[];
BEGIN
  -- 1. Valores (NG009), antes de tudo.
  IF p_organization_id IS NULL OR p_versao IS NULL OR p_versao < 1 THEN
    RAISE EXCEPTION 'Questionário inválido: organização ou versão.' USING ERRCODE = 'NG009';
  END IF;
  v_norm := public.fn_neg_questionario_normalizar(p_seccoes);

  -- 2. Sessão
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view, Pessoas activa e questionário
  --    (a mesma mensagem nos quatro casos).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':'))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = p_organization_id)
     OR NOT EXISTS (SELECT 1 FROM public.levantamento_questionario q WHERE q.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 4. Permissão própria do Workflow de Pessoas, nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o levantamento.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Exclusivo por organização (as gravações de levantamentos tomam o
  --    mesmo bloqueio partilhado) e versão.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('levantamento_questionario:' || p_organization_id::text, 0));
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id
  FOR UPDATE;
  IF v_versao <> p_versao THEN
    RAISE EXCEPTION 'A configuração do levantamento foi alterada entretanto; volte a abrir.' USING ERRCODE = 'NG021';
  END IF;

  -- 6 e 7. Secções, perguntas e opções, pela ordem do pedido.
  FOR v_s, v_si IN SELECT e.value, (e.ord - 1)::integer
                   FROM jsonb_array_elements(v_norm) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
  LOOP
    v_sid := (v_s ->> 'id')::uuid;
    IF v_sid IS NOT NULL THEN
      SELECT ls.* INTO v_sec
      FROM public.levantamento_seccoes ls
      WHERE ls.id = v_sid AND ls.organization_id = p_organization_id AND ls.apagada_em IS NULL
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Questionário inválido: secção desconhecida.' USING ERRCODE = 'NG009';
      END IF;
      IF ((v_s ->> 'aba') IS NOT NULL AND (v_s ->> 'aba') <> v_sec.aba)
         OR ((v_s ->> 'especial') IS NOT NULL AND (v_s ->> 'especial') IS DISTINCT FROM v_sec.especial) THEN
        RAISE EXCEPTION 'Questionário inválido: a aba e o tipo de uma secção não mudam.' USING ERRCODE = 'NG009';
      END IF;
      IF v_sec.especial IS NOT NULL AND NOT (v_s ->> 'activa')::boolean THEN
        RAISE EXCEPTION 'Questionário inválido: as secções Visitas e Medidas só se reordenam.' USING ERRCODE = 'NG009';
      END IF;
      UPDATE public.levantamento_seccoes ls
      SET titulo = v_s ->> 'titulo', ordem = v_si, activa = (v_s ->> 'activa')::boolean
      WHERE ls.id = v_sid
        AND (ls.titulo, ls.ordem, ls.activa)
            IS DISTINCT FROM (v_s ->> 'titulo', v_si, (v_s ->> 'activa')::boolean);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        v_alt_s := v_alt_s || v_sid;
      END IF;
    ELSE
      IF (v_s ->> 'especial') IS NOT NULL OR COALESCE(v_s ->> 'aba', 'visita') <> 'visita' THEN
        RAISE EXCEPTION 'Questionário inválido: só se criam secções da aba Visita, sem tipo especial.'
          USING ERRCODE = 'NG009';
      END IF;
      LOOP
        v_chave := 's' || substr(md5(gen_random_uuid()::text), 1, 10);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.levantamento_seccoes x
                              WHERE x.organization_id = p_organization_id AND x.chave = v_chave);
      END LOOP;
      INSERT INTO public.levantamento_seccoes (organization_id, chave, titulo, aba, especial, ordem, activa)
      VALUES (p_organization_id, v_chave, v_s ->> 'titulo', 'visita', NULL, v_si, (v_s ->> 'activa')::boolean)
      RETURNING * INTO v_sec;
      v_sid := v_sec.id;
      v_cri_s := v_cri_s + 1;
    END IF;
    IF v_sid = ANY (v_vs) THEN
      RAISE EXCEPTION 'Questionário inválido: secção repetida.' USING ERRCODE = 'NG009';
    END IF;
    v_vs := v_vs || v_sid;
    IF (v_s ->> 'ref') IS NOT NULL THEN
      v_refs := v_refs || jsonb_build_object(v_s ->> 'ref', v_sid);
    END IF;

    IF v_sec.especial IS NOT NULL AND jsonb_array_length(v_s -> 'perguntas') > 0 THEN
      RAISE EXCEPTION 'Questionário inválido: as secções Visitas e Medidas não têm perguntas.' USING ERRCODE = 'NG009';
    END IF;

    FOR v_q, v_qi IN SELECT e.value, (e.ord - 1)::integer
                     FROM jsonb_array_elements(v_s -> 'perguntas') WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
    LOOP
      v_pid := (v_q ->> 'id')::uuid;
      IF v_pid IS NOT NULL THEN
        SELECT lp.* INTO v_per
        FROM public.levantamento_perguntas lp
        WHERE lp.id = v_pid AND lp.organization_id = p_organization_id AND lp.apagada_em IS NULL
        FOR UPDATE;
        IF NOT FOUND OR v_pid = ANY (v_vp) THEN
          RAISE EXCEPTION 'Questionário inválido: pergunta desconhecida.' USING ERRCODE = 'NG009';
        END IF;
        -- D4 (20/10): o tipo só muda enquanto a pergunta não tiver respostas.
        -- 20261231100000: contam também as respostas da qualificação do negócio.
        IF v_per.tipo <> (v_q ->> 'tipo')
           AND (EXISTS (SELECT 1 FROM public.levantamento_respostas lr
                        WHERE lr.organization_id = p_organization_id AND lr.pergunta = v_per.chave)
                OR EXISTS (SELECT 1 FROM public.negocio_qualificacao_respostas nr
                           WHERE nr.organization_id = p_organization_id AND nr.pergunta = v_per.chave)) THEN
          RAISE EXCEPTION 'Questionário inválido: a pergunta «%» já tem respostas e não muda de tipo; crie uma pergunta nova.',
            v_per.texto USING ERRCODE = 'NG009';
        END IF;
        -- 20261231999500: efeito_modo e efeito (o efeito em jsonb null passa a NULL de SQL: os CHECK só aceitam NULL ou uma lista).
        UPDATE public.levantamento_perguntas lp
        SET seccao_id    = v_sid,
            texto        = v_q ->> 'texto',
            bloco        = v_q ->> 'bloco',
            tipo         = v_q ->> 'tipo',
            numero_min   = (v_q ->> 'numero_min')::numeric,
            numero_max   = (v_q ->> 'numero_max')::numeric,
            numero_casas = (v_q ->> 'numero_casas')::smallint,
            unidade      = v_q ->> 'unidade',
            texto_max    = (v_q ->> 'texto_max')::smallint,
            ordem        = v_qi,
            activa       = (v_q ->> 'activa')::boolean,
            efeito_modo  = v_q ->> 'efeito_modo',
            efeito       = NULLIF(v_q -> 'efeito', 'null'::jsonb)
        WHERE lp.id = v_pid
          AND (lp.seccao_id, lp.texto, lp.bloco, lp.tipo, lp.numero_min, lp.numero_max, lp.numero_casas,
               lp.unidade, lp.texto_max, lp.ordem, lp.activa, lp.efeito_modo, lp.efeito)
              IS DISTINCT FROM
              (v_sid, v_q ->> 'texto', v_q ->> 'bloco', v_q ->> 'tipo', (v_q ->> 'numero_min')::numeric,
               (v_q ->> 'numero_max')::numeric, (v_q ->> 'numero_casas')::smallint, v_q ->> 'unidade',
               (v_q ->> 'texto_max')::smallint, v_qi, (v_q ->> 'activa')::boolean,
               v_q ->> 'efeito_modo', NULLIF(v_q -> 'efeito', 'null'::jsonb));
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN
          v_alt_p := v_alt_p || v_pid;
        END IF;
      ELSE
        LOOP
          v_chave := 'p' || substr(md5(gen_random_uuid()::text), 1, 10);
          EXIT WHEN NOT EXISTS (SELECT 1 FROM public.levantamento_perguntas x
                                WHERE x.organization_id = p_organization_id AND x.chave = v_chave);
        END LOOP;
        INSERT INTO public.levantamento_perguntas
          (organization_id, seccao_id, chave, texto, bloco, tipo, numero_min, numero_max, numero_casas,
           unidade, texto_max, ordem, activa, efeito_modo, efeito)
        VALUES
          (p_organization_id, v_sid, v_chave, v_q ->> 'texto', v_q ->> 'bloco', v_q ->> 'tipo',
           (v_q ->> 'numero_min')::numeric, (v_q ->> 'numero_max')::numeric, (v_q ->> 'numero_casas')::smallint,
           v_q ->> 'unidade', (v_q ->> 'texto_max')::smallint, v_qi, (v_q ->> 'activa')::boolean,
           v_q ->> 'efeito_modo', NULLIF(v_q -> 'efeito', 'null'::jsonb))
        RETURNING id INTO v_pid;
        v_novas_p := v_novas_p || v_pid;
        v_cri_p := v_cri_p + 1;
      END IF;
      v_vp := v_vp || v_pid;
      -- O campo da Emylia desta pergunta, alinhado com v_vp (escreve-se no passo próprio, mais abaixo).
      v_campos := array_append(v_campos, v_q ->> 'campo_emylia');
      IF (v_q ->> 'ref') IS NOT NULL THEN
        v_refs := v_refs || jsonb_build_object(v_q ->> 'ref', v_pid);
      END IF;

      FOR v_o, v_oi IN SELECT e.value, (e.ord - 1)::integer
                       FROM jsonb_array_elements(v_q -> 'opcoes') WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
      LOOP
        v_oid := (v_o ->> 'id')::uuid;
        IF v_oid IS NOT NULL THEN
          PERFORM 1 FROM public.levantamento_opcoes lo
          WHERE lo.id = v_oid AND lo.pergunta_id = v_pid AND lo.organization_id = p_organization_id
            AND lo.apagada_em IS NULL
          FOR UPDATE;
          IF NOT FOUND OR v_oid = ANY (v_vo) THEN
            RAISE EXCEPTION 'Questionário inválido: opção desconhecida.' USING ERRCODE = 'NG009';
          END IF;
          UPDATE public.levantamento_opcoes lo
          SET texto = v_o ->> 'texto', ordem = v_oi, activa = (v_o ->> 'activa')::boolean,
              valor_emylia = v_o ->> 'valor_emylia', efeito = NULLIF(v_o -> 'efeito', 'null'::jsonb)
          WHERE lo.id = v_oid
            AND (lo.texto, lo.ordem, lo.activa, lo.valor_emylia, lo.efeito)
                IS DISTINCT FROM (v_o ->> 'texto', v_oi, (v_o ->> 'activa')::boolean,
                                  v_o ->> 'valor_emylia', NULLIF(v_o -> 'efeito', 'null'::jsonb));
          GET DIAGNOSTICS v_n = ROW_COUNT;
          IF v_n > 0 THEN
            v_alt_o := v_alt_o || v_oid;
          END IF;
        ELSE
          LOOP
            v_chave := 'o' || substr(md5(gen_random_uuid()::text), 1, 8);
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.levantamento_opcoes x
                                  WHERE x.pergunta_id = v_pid AND x.chave = v_chave);
          END LOOP;
          INSERT INTO public.levantamento_opcoes (organization_id, pergunta_id, chave, texto, ordem, activa, valor_emylia, efeito)
          VALUES (p_organization_id, v_pid, v_chave, v_o ->> 'texto', v_oi, (v_o ->> 'activa')::boolean,
                  v_o ->> 'valor_emylia', NULLIF(v_o -> 'efeito', 'null'::jsonb))
          RETURNING id INTO v_oid;
          v_cri_o := v_cri_o + 1;
        END IF;
        v_vo := v_vo || v_oid;
        IF (v_o ->> 'ref') IS NOT NULL THEN
          v_refs := v_refs || jsonb_build_object(v_o ->> 'ref', v_oid);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Apagar o que não veio (nunca DELETE). Visitas, Medidas e Qualificação ficam.
  IF EXISTS (SELECT 1 FROM public.levantamento_seccoes ls
             WHERE ls.organization_id = p_organization_id AND ls.apagada_em IS NULL
               AND ls.id <> ALL (v_vs) AND (ls.especial IS NOT NULL OR ls.chave = 'qualificacao')) THEN
    RAISE EXCEPTION 'Questionário inválido: as secções Visitas, Medidas e Qualificação não se apagam.'
      USING ERRCODE = 'NG009';
  END IF;
  UPDATE public.levantamento_opcoes lo
  SET apagada_em = now()
  WHERE lo.organization_id = p_organization_id AND lo.apagada_em IS NULL
    AND lo.pergunta_id = ANY (v_vp) AND lo.id <> ALL (v_vo);
  GET DIAGNOSTICS v_apa_o = ROW_COUNT;
  UPDATE public.levantamento_perguntas lp
  SET apagada_em = now()
  WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL AND lp.id <> ALL (v_vp);
  GET DIAGNOSTICS v_apa_p = ROW_COUNT;
  UPDATE public.levantamento_seccoes ls
  SET apagada_em = now()
  WHERE ls.organization_id = p_organization_id AND ls.apagada_em IS NULL AND ls.id <> ALL (v_vs);
  GET DIAGNOSTICS v_apa_s = ROW_COUNT;

  -- 20261231999500: campos da Emylia. Já só estão vivas as perguntas do pedido; o pedido não repete campos (normalizar).
  -- Em dois passos, para o índice único parcial nunca ver o mesmo campo em duas perguntas vivas a meio (troca de campos
  -- entre perguntas): primeiro limpa-se o campo das que mudam, depois escreve-se o novo.
  SELECT COALESCE(array_agg(lp.id), ARRAY[]::uuid[]) INTO v_alt_cam
  FROM unnest(v_vp, v_campos) AS u(id, campo)
  JOIN public.levantamento_perguntas lp ON lp.id = u.id
  WHERE lp.campo_emylia IS DISTINCT FROM u.campo;
  UPDATE public.levantamento_perguntas lp
  SET campo_emylia = NULL
  WHERE lp.id = ANY (v_alt_cam) AND lp.campo_emylia IS NOT NULL;
  UPDATE public.levantamento_perguntas lp
  SET campo_emylia = u.campo
  FROM unnest(v_vp, v_campos) AS u(id, campo)
  WHERE lp.id = u.id AND lp.id = ANY (v_alt_cam) AND u.campo IS NOT NULL;
  v_alt_p := v_alt_p || ARRAY(SELECT x.id FROM unnest(v_alt_cam) AS x(id)
                              WHERE x.id <> ALL (v_novas_p) AND x.id <> ALL (v_alt_p));

  -- Condições: resolvidas depois de todas as perguntas e opções terem id
  -- (podem apontar para uma criada nesta mesma gravação, por ref).
  v_k := 0;
  FOR v_q IN SELECT q.value
             FROM jsonb_array_elements(v_norm) WITH ORDINALITY AS s(value, ord)
             CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') WITH ORDINALITY AS q(value, ord)
             ORDER BY s.ord, q.ord
  LOOP
    v_k := v_k + 1;
    v_pid := v_vp[v_k];
    v_alvo := NULL;
    v_dep_ops := NULL;
    v_dep_sem := false;
    IF jsonb_typeof(v_q -> 'depende') = 'object' THEN
      v_alvo_txt := v_q -> 'depende' ->> 'pergunta';
      v_alvo := CASE WHEN v_alvo_txt ~ c_re_uuid THEN v_alvo_txt::uuid
                     ELSE (v_refs ->> v_alvo_txt)::uuid END;
      IF v_alvo IS NULL OR NOT (v_alvo = ANY (v_vp)) OR v_alvo = v_pid THEN
        RAISE EXCEPTION 'Questionário inválido: condição de uma pergunta desconhecida.' USING ERRCODE = 'NG009';
      END IF;
      SELECT count(*), count(lo.id), count(DISTINCT lo.id), array_agg(lo.chave ORDER BY d.ord)
        INTO v_n_env, v_n_ok, v_n_dist, v_dep_ops
      FROM jsonb_array_elements_text(v_q -> 'depende' -> 'opcoes') WITH ORDINALITY AS d(ref, ord)
      LEFT JOIN public.levantamento_opcoes lo
        ON lo.id = CASE WHEN d.ref ~ c_re_uuid THEN d.ref::uuid ELSE (v_refs ->> d.ref)::uuid END
       AND lo.pergunta_id = v_alvo AND lo.apagada_em IS NULL;
      IF v_n_ok <> v_n_env OR v_n_dist <> v_n_env THEN
        RAISE EXCEPTION 'Questionário inválido: a condição tem opções desconhecidas ou repetidas.' USING ERRCODE = 'NG009';
      END IF;
      v_dep_sem := (v_q -> 'depende' ->> 'sem_resposta')::boolean;
    END IF;
    UPDATE public.levantamento_perguntas lp
    SET depende_de = v_alvo, depende_opcoes = v_dep_ops, depende_sem_resposta = v_dep_sem
    WHERE lp.id = v_pid
      AND (lp.depende_de, lp.depende_opcoes, lp.depende_sem_resposta)
          IS DISTINCT FROM (v_alvo, v_dep_ops, v_dep_sem);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 AND NOT (v_pid = ANY (v_novas_p)) AND NOT (v_pid = ANY (v_alt_p)) THEN
      v_alt_p := v_alt_p || v_pid;
    END IF;
  END LOOP;

  -- Invariantes do resultado (falha: NG009 e tudo se desfaz).
  IF EXISTS (SELECT 1
             FROM public.levantamento_perguntas lp
             JOIN public.levantamento_perguntas alvo ON alvo.id = lp.depende_de
             WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL
               AND (alvo.apagada_em IS NOT NULL
                    OR alvo.tipo <> ALL (c_escolha)
                    OR alvo.depende_de IS NOT NULL
                    OR EXISTS (SELECT 1 FROM unnest(lp.depende_opcoes) AS d(chave)
                               WHERE NOT EXISTS (SELECT 1 FROM public.levantamento_opcoes lo
                                                 WHERE lo.pergunta_id = alvo.id AND lo.chave = d.chave
                                                   AND lo.apagada_em IS NULL)))) THEN
    RAISE EXCEPTION 'Questionário inválido: cada condição aponta para uma pergunta de escolha viva, sem condição própria, e para opções dela.'
      USING ERRCODE = 'NG009';
  END IF;
  IF EXISTS (SELECT 1 FROM public.levantamento_perguntas lp
             WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL
               AND ((lp.tipo = ANY (c_escolha)
                     AND (SELECT count(*) FROM public.levantamento_opcoes lo
                          WHERE lo.pergunta_id = lp.id AND lo.apagada_em IS NULL) < 2)
                    OR (lp.tipo <> ALL (c_escolha)
                        AND EXISTS (SELECT 1 FROM public.levantamento_opcoes lo
                                    WHERE lo.pergunta_id = lp.id AND lo.apagada_em IS NULL)))) THEN
    RAISE EXCEPTION 'Questionário inválido: perguntas de escolha com 2 a 30 opções; as outras sem opções.'
      USING ERRCODE = 'NG009';
  END IF;
  IF (SELECT string_agg(ls.chave, ',' ORDER BY ls.chave) FROM public.levantamento_seccoes ls
      WHERE ls.organization_id = p_organization_id AND ls.apagada_em IS NULL
        AND (ls.especial IS NOT NULL OR ls.chave = 'qualificacao'))
     IS DISTINCT FROM 'medidas,qualificacao,visitas' THEN
    RAISE EXCEPTION 'Questionário inválido: faltam as secções Visitas, Medidas ou Qualificação.' USING ERRCODE = 'NG009';
  END IF;
  -- 20261231999500: o efeito de uma opção só existe com o efeito próprio na pergunta (viva).
  IF EXISTS (SELECT 1 FROM public.levantamento_opcoes lo
             JOIN public.levantamento_perguntas lp ON lp.id = lo.pergunta_id
             WHERE lp.organization_id = p_organization_id AND lp.apagada_em IS NULL AND lo.apagada_em IS NULL
               AND lo.efeito IS NOT NULL AND lp.efeito_modo IS DISTINCT FROM 'proprio') THEN
    RAISE EXCEPTION 'Questionário inválido: o efeito de uma opção só conta com efeito próprio na pergunta.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 8. Versão e auditoria, só se alguma coisa mudou.
  v_mudou := v_cri_s + v_cri_p + v_cri_o + v_apa_s + v_apa_p + v_apa_o
             + cardinality(v_alt_s) + cardinality(v_alt_p) + cardinality(v_alt_o) > 0;
  IF v_mudou THEN
    v_actor := public.fn_neg_actor();
    UPDATE public.levantamento_questionario q
    SET versao = q.versao + 1, updated_by = v_actor
    WHERE q.organization_id = p_organization_id
    RETURNING q.versao INTO v_versao;
    PERFORM public.fn_manual_audit_log(
      'levantamento_questionario', NULL, p_organization_id, 'UPDATE',
      jsonb_build_object('levantamento_questionario', jsonb_build_object(
        'versao', jsonb_build_object('old', v_versao - 1, 'new', v_versao),
        'criadas', jsonb_build_object('seccoes', v_cri_s, 'perguntas', v_cri_p, 'opcoes', v_cri_o),
        'alteradas', jsonb_build_object('seccoes', cardinality(v_alt_s), 'perguntas', cardinality(v_alt_p),
                                        'opcoes', cardinality(v_alt_o)),
        'apagadas', jsonb_build_object('seccoes', v_apa_s, 'perguntas', v_apa_p, 'opcoes', v_apa_o))),
      'web_app', p_organization_id);
  END IF;

  RETURN jsonb_build_object(
    'versao', v_versao,
    'mudou', v_mudou,
    'criadas', jsonb_build_object('seccoes', v_cri_s, 'perguntas', v_cri_p, 'opcoes', v_cri_o),
    'alteradas', jsonb_build_object('seccoes', cardinality(v_alt_s), 'perguntas', cardinality(v_alt_p),
                                    'opcoes', cardinality(v_alt_o)),
    'apagadas', jsonb_build_object('seccoes', v_apa_s, 'perguntas', v_apa_p, 'opcoes', v_apa_o),
    'refs', v_refs);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_guardar_questionario(p_organization_id uuid, p_versao integer, p_seccoes jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_questionario(p_organization_id uuid, p_versao integer, p_seccoes jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. neg_questionario_levantamento: devolve as colunas novas (NULL vira null em JSON; o cliente lê null como «sem ligação/sem efeito»).
--    INVOKER (RLS), permissões e filtros iguais.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_questionario_levantamento(p_organization_id uuid, p_incluir_inactivas boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_versao integer;
BEGIN
  IF p_organization_id IS NULL OR p_incluir_inactivas IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: organização.' USING ERRCODE = 'NG009';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  IF p_incluir_inactivas AND NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o levantamento.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'versao', v_versao,
      'seccoes', COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'chave', s.chave, 'titulo', s.titulo, 'aba', s.aba, 'especial', s.especial,
        'ordem', s.ordem, 'activa', s.activa,
        'perguntas', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'chave', p.chave, 'texto', p.texto, 'tipo', p.tipo, 'bloco', p.bloco,
                   'ordem', p.ordem, 'activa', p.activa,
                   'numero', CASE WHEN p.tipo = 'numero' THEN jsonb_build_object(
                               'min', p.numero_min, 'max', p.numero_max,
                               'casas', p.numero_casas, 'unidade', p.unidade) END,
                   'texto_max', CASE WHEN p.tipo = 'texto' THEN COALESCE(p.texto_max, 2000) END,
                   'depende', CASE WHEN p.depende_de IS NOT NULL THEN jsonb_build_object(
                                'pergunta_id', p.depende_de, 'pergunta_chave', alvo.chave,
                                'opcoes', to_jsonb(p.depende_opcoes),
                                'sem_resposta', p.depende_sem_resposta) END,
                   'campo_emylia', p.campo_emylia, 'efeito_modo', p.efeito_modo, 'efeito', p.efeito,
                   'opcoes', (
                     SELECT COALESCE(jsonb_agg(jsonb_build_object(
                              'id', o.id, 'chave', o.chave, 'texto', o.texto,
                              'ordem', o.ordem, 'activa', o.activa,
                              'valor_emylia', o.valor_emylia, 'efeito', o.efeito)
                              ORDER BY o.ordem, o.chave), '[]'::jsonb)
                     FROM public.levantamento_opcoes o
                     WHERE o.pergunta_id = p.id AND o.apagada_em IS NULL
                       AND (p_incluir_inactivas OR o.activa)))
                   ORDER BY p.ordem, p.chave), '[]'::jsonb)
          FROM public.levantamento_perguntas p
          LEFT JOIN public.levantamento_perguntas alvo ON alvo.id = p.depende_de
          WHERE p.seccao_id = s.id AND p.apagada_em IS NULL
            AND (p_incluir_inactivas OR p.activa)))
        ORDER BY s.ordem, s.chave), '[]'::jsonb))
    FROM public.levantamento_seccoes s
    WHERE s.organization_id = p_organization_id AND s.apagada_em IS NULL
      AND (p_incluir_inactivas OR s.activa));
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_questionario_levantamento(p_organization_id uuid, p_incluir_inactivas boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_questionario_levantamento(p_organization_id uuid, p_incluir_inactivas boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Conferir o resultado (falha = tudo se desfaz). Sem escrever dados: só catálogo e chamadas a funções puras.
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  v_nome text;
  v_n    integer;
  v_txt  text;
  v_j    jsonb;
  v_ok   boolean;
  c_item CONSTANT jsonb := '{"tipo":"valor","descricao":"Andar sem elevador","custo":10,"preco":15}'::jsonb;
BEGIN
  -- Colunas: tipo certo, NULL permitido e sem valor por omissão.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  WHERE NOT a.attisdropped AND NOT a.attnotnull AND NOT a.atthasdef
    AND ((a.attrelid = 'public.levantamento_perguntas'::regclass
          AND ((a.attname::text = 'campo_emylia' AND a.atttypid = 'text'::regtype)
            OR (a.attname::text = 'efeito_modo' AND a.atttypid = 'text'::regtype)
            OR (a.attname::text = 'efeito' AND a.atttypid = 'jsonb'::regtype)))
      OR (a.attrelid = 'public.levantamento_opcoes'::regclass
          AND ((a.attname::text = 'valor_emylia' AND a.atttypid = 'text'::regtype)
            OR (a.attname::text = 'efeito' AND a.atttypid = 'jsonb'::regtype))));
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Conferir: colunas novas com tipo, NULL ou omissão errados (% de 5).', v_n;
  END IF;

  -- CHECK (validados) e índice único parcial.
  SELECT count(*) INTO v_n FROM pg_catalog.pg_constraint c
  WHERE c.contype::text = 'c' AND c.convalidated
    AND c.conname::text IN ('levantamento_perguntas_campo_emylia_check', 'levantamento_perguntas_efeito_modo_check',
                            'levantamento_perguntas_efeito_check', 'levantamento_perguntas_efeito_proprio_check',
                            'levantamento_opcoes_valor_emylia_check', 'levantamento_opcoes_efeito_check')
    AND c.conrelid IN ('public.levantamento_perguntas'::regclass, 'public.levantamento_opcoes'::regclass);
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Conferir: faltam CHECK das colunas novas (% de 6).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_index i
  WHERE i.indexrelid = 'public.levantamento_perguntas_campo_emylia_uq'::regclass
    AND i.indrelid = 'public.levantamento_perguntas'::regclass
    AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL
    AND position('apagada_em IS NULL' IN pg_catalog.pg_get_indexdef(i.indexrelid)::text) > 0;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: levantamento_perguntas_campo_emylia_uq não é único e parcial.';
  END IF;

  -- Funções: uma assinatura, SECURITY e search_path de antes, permissões de antes, e já com as chaves novas.
  FOREACH v_nome IN ARRAY ARRAY['fn_neg_questionario_normalizar', 'neg_guardar_questionario', 'neg_questionario_levantamento',
                                'fn_neg_questionario_efeito', 'fn_levantamento_efeito_valido'] LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname::text = 'neg_guardar_questionario' AND NOT p.prosecdef)
      OR (p.proname::text IN ('fn_neg_questionario_normalizar', 'neg_questionario_levantamento',
                              'fn_neg_questionario_efeito', 'fn_levantamento_efeito_valido') AND p.prosecdef)
      OR (p.proname::text IN ('fn_neg_questionario_normalizar', 'neg_guardar_questionario', 'neg_questionario_levantamento',
                              'fn_neg_questionario_efeito')
          AND p.proconfig::text IS DISTINCT FROM '{"search_path=public, pg_temp"}'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % funções com SECURITY ou search_path trocado.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname::text IN ('neg_guardar_questionario', 'neg_questionario_levantamento')
          AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')))
      OR (p.proname::text IN ('fn_neg_questionario_normalizar', 'fn_neg_questionario_efeito', 'fn_levantamento_efeito_valido')
          AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % funções com permissões trocadas.', v_n;
  END IF;
  FOREACH v_nome IN ARRAY ARRAY['fn_neg_questionario_normalizar', 'neg_guardar_questionario', 'neg_questionario_levantamento'] LOOP
    SELECT pg_get_functiondef(p.oid)::text INTO v_txt FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF position('campo_emylia' IN v_txt) = 0 OR position('valor_emylia' IN v_txt) = 0 OR position('efeito' IN v_txt) = 0 THEN
      RAISE EXCEPTION 'Conferir: public.% não trata as chaves novas.', v_nome;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef(p.oid)::text INTO v_txt FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_questionario';
  IF position('FROM public.negocio_qualificacao_respostas nr' IN v_txt) = 0
     OR position('fn_neg_tem_permissao_org(p_organization_id, ''pessoas.config'')' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_questionario perdeu a guarda D4 ou a permissão pessoas.config.';
  END IF;

  -- A forma do efeito (função pura).
  IF NOT public.fn_levantamento_efeito_valido(NULL)
     OR NOT public.fn_levantamento_efeito_valido(jsonb_build_array(c_item))
     OR NOT public.fn_levantamento_efeito_valido('[{"tipo":"horas","descricao":"Montagem","horas":2,"custo_hora":20,"preco_hora":30}]'::jsonb)
     OR NOT public.fn_levantamento_efeito_valido('[{"tipo":"percentagem","descricao":"Acesso difícil","pct":10}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[]'::jsonb)
     OR public.fn_levantamento_efeito_valido('null'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"valor","descricao":"X","custo":10}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"valor","descricao":"X","custo":-1,"preco":1}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"valor","descricao":"","custo":1,"preco":1}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"valor","descricao":"X","custo":"1","preco":1}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"valor","descricao":"X","custo":1,"preco":1,"pct":1}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"percentagem","descricao":"X","pct":1001}]'::jsonb)
     OR public.fn_levantamento_efeito_valido('[{"tipo":"fator","descricao":"X","pct":1}]'::jsonb)
     OR public.fn_levantamento_efeito_valido(jsonb_build_array(c_item, c_item, c_item, c_item, c_item, c_item)) THEN
    RAISE EXCEPTION 'Conferir: fn_levantamento_efeito_valido aceita ou recusa o que não devia.';
  END IF;

  -- fn_neg_questionario_normalizar (pura): aceita e devolve as chaves novas; ausente = NULL; recusa o resto com NG009.
  v_j := public.fn_neg_questionario_normalizar(jsonb_build_array(jsonb_build_object(
    'ref', 's1', 'titulo', 'Exterior', 'activa', true, 'perguntas', jsonb_build_array(
      jsonb_build_object('ref', 'p1', 'texto', 'Acesso', 'tipo', 'escolha_unica', 'bloco', null, 'activa', true,
        'campo_emylia', 'acesso', 'efeito_modo', 'proprio', 'opcoes', jsonb_build_array(
          jsonb_build_object('ref', 'o1', 'texto', 'Fácil', 'activa', true, 'valor_emylia', 'Fácil'),
          jsonb_build_object('ref', 'o2', 'texto', 'Difícil', 'activa', true, 'valor_emylia', 'Difícil',
                             'efeito', jsonb_build_array(c_item || '{"descricao":"  Acesso difícil  "}'::jsonb)))),
      jsonb_build_object('ref', 'p2', 'texto', 'Andares', 'tipo', 'numero', 'bloco', null, 'activa', true,
        'efeito_modo', 'proprio', 'efeito', jsonb_build_array(c_item), 'opcoes', '[]'::jsonb),
      jsonb_build_object('ref', 'p3', 'texto', 'Notas', 'tipo', 'texto', 'bloco', null, 'activa', true, 'opcoes', '[]'::jsonb)))));
  IF v_j #>> '{0,perguntas,0,campo_emylia}' IS DISTINCT FROM 'acesso'
     OR v_j #>> '{0,perguntas,0,efeito_modo}' IS DISTINCT FROM 'proprio'
     OR v_j #>> '{0,perguntas,0,opcoes,1,valor_emylia}' IS DISTINCT FROM 'Difícil'
     OR v_j #>> '{0,perguntas,0,opcoes,1,efeito,0,descricao}' IS DISTINCT FROM 'Acesso difícil'
     OR jsonb_typeof(v_j #> '{0,perguntas,0,opcoes,0,efeito}') IS DISTINCT FROM 'null'
     OR (v_j #>> '{0,perguntas,1,efeito,0,preco}')::numeric IS DISTINCT FROM 15
     OR jsonb_typeof(v_j #> '{0,perguntas,2,campo_emylia}') IS DISTINCT FROM 'null'
     OR jsonb_typeof(v_j #> '{0,perguntas,2,efeito_modo}') IS DISTINCT FROM 'null'
     OR jsonb_typeof(v_j #> '{0,perguntas,2,efeito}') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'Conferir: fn_neg_questionario_normalizar não devolve as chaves novas como esperado.';
  END IF;

  -- Cada um destes tem de dar NG009: campo repetido; modo desconhecido; efeito de opção sem «próprio»; efeito por unidade numa
  -- pergunta de escolha; efeito por preencher; chave desconhecida na opção.
  FOR v_j IN SELECT x.p FROM (VALUES
    (jsonb_build_array(
      jsonb_build_object('ref', 'a', 'texto', 'A', 'tipo', 'texto', 'activa', true, 'campo_emylia', 'gas'),
      jsonb_build_object('ref', 'b', 'texto', 'B', 'tipo', 'texto', 'activa', true, 'campo_emylia', 'gas'))),
    (jsonb_build_array(jsonb_build_object('ref', 'a', 'texto', 'A', 'tipo', 'texto', 'activa', true, 'efeito_modo', 'fator'))),
    (jsonb_build_array(jsonb_build_object('ref', 'a', 'texto', 'A', 'tipo', 'escolha_unica', 'activa', true, 'efeito_modo', 'emylia',
      'opcoes', jsonb_build_array(jsonb_build_object('ref', 'o1', 'texto', 'Sim', 'efeito', jsonb_build_array(c_item)),
                                  jsonb_build_object('ref', 'o2', 'texto', 'Não'))))),
    (jsonb_build_array(jsonb_build_object('ref', 'a', 'texto', 'A', 'tipo', 'escolha_unica', 'activa', true, 'efeito_modo', 'proprio',
      'efeito', jsonb_build_array(c_item),
      'opcoes', jsonb_build_array(jsonb_build_object('ref', 'o1', 'texto', 'Sim'), jsonb_build_object('ref', 'o2', 'texto', 'Não'))))),
    (jsonb_build_array(jsonb_build_object('ref', 'a', 'texto', 'A', 'tipo', 'numero', 'activa', true, 'efeito_modo', 'proprio',
      'efeito', '[{"tipo":"valor","descricao":"X","custo":1}]'::jsonb))),
    (jsonb_build_array(jsonb_build_object('ref', 'a', 'texto', 'A', 'tipo', 'escolha_unica', 'activa', true,
      'opcoes', jsonb_build_array(jsonb_build_object('ref', 'o1', 'texto', 'Sim', 'fator', 1), jsonb_build_object('ref', 'o2', 'texto', 'Não')))))
  ) AS x(p)
  LOOP
    v_ok := false;
    BEGIN
      PERFORM public.fn_neg_questionario_normalizar(jsonb_build_array(jsonb_build_object(
        'ref', 's1', 'titulo', 'S', 'activa', true, 'perguntas', v_j)));
    EXCEPTION WHEN SQLSTATE 'NG009' THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: fn_neg_questionario_normalizar aceitou um questionário que devia recusar (NG009): %', v_j::text;
    END IF;
  END LOOP;
END
$conferir$;
