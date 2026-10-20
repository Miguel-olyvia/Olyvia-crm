-- ============================================================
-- 20261226090000_levantamento_questionario_funcoes
-- ============================================================
-- O que faz (desenho: vault ficheiros/crm/levantamento-configuravel-desenho.md,
--   secção 5; decisões do utilizador de 20/10, com D4 ALTERADA):
--   NOVAS
--   1. neg_guardar_questionario(p_organization_id, p_versao, p_seccoes)
--      grava o questionário inteiro (o separador «Levantamento» do Workflow
--      tem um só «Guardar»). SECURITY DEFINER. Guardas, por esta ordem:
--        NG009 valores (forma e limites: até 256 KB, 20 secções, 150
--              perguntas, 30 opções por pergunta; textos; tipo; número só em
--              número; texto_max só em texto; escolha com 2 a 30 opções;
--              refs e ids sem repetidos);
--        42501 sessão; NG008 organização do utilizador, pessoas.view,
--              negocio_workflow_config e questionário (mesma mensagem);
--        42501 pessoas.config (existe desde 20261226025000);
--        NG021 versão desactualizada (bloqueio consultivo exclusivo por
--              organização e linha do questionário FOR UPDATE).
--      Aplica: insere as novas (chave gerada: s/p + 10 hex, o + 8 hex),
--      actualiza as que mudaram, marca apagada_em nas que não vieram (nunca
--      DELETE). Mudar o TIPO de uma pergunta (D4 alterada, 20/10) só se a
--      pergunta não tiver respostas na organização (conta-as antes; havendo,
--      NG009 «crie uma pergunta nova»). Secções Visitas e Medidas só se
--      reordenam (D6); estas e a Qualificação não se apagam nem mudam de aba.
--      Condição de um nível (D9: só no ecrã) apontando para pergunta de
--      escolha viva, sem condição própria, e opções vivas dela. Sem mudanças:
--      mudou:false e a versão fica. Com mudanças: versao + 1 e UMA entrada de
--      auditoria (fn_manual_audit_log).
--      Devolve {versao, mudou, criadas, alteradas, apagadas, refs}.
--   2. neg_questionario_levantamento(p_organization_id, p_incluir_inactivas)
--      leitura (INVOKER, a RLS decide): NG009, NG008; com inactivas exige
--      pessoas.config (42501). Apagadas nunca vêm.
--   3. Auxiliares puras (só o dono as executa): fn_neg_questionario_normalizar,
--      _texto, _numero, _booleano, _ident, _objecto.
--   SUBSTITUÍDAS (CREATE OR REPLACE, mesma assinatura, só acrescentam)
--   4. neg_guardar_levantamento (era md5 560158b2...): p_respostas aceita a
--      forma nova {"escolhas": [...]} | {"texto": "..."} | {"numero": n} e a
--      antiga da Fase V {"seccao", "resposta"} (= escolhas [resposta]; a
--      secção enviada passa a ser ignorada: vem da configuração). Valida
--      contra o questionário da organização, ANTES de escrever: pergunta
--      desconhecida, tipo, opções, limites -> NG009. Aceita perguntas e opções
--      inactivas ou apagadas (D5). Snapshot só em respostas novas ou com valor
--      diferente. Retorno acrescenta versao_questionario e questionario_mudou
--      (quando p_dados.versao_questionario vem e difere). Bloqueio consultivo
--      PARTILHADO por organização: uma gravação do questionário espera pelas
--      gravações de levantamentos em curso, e vice-versa (é o que garante a
--      regra «o tipo só muda sem respostas»).
--   5. fn_neg_ficha_seccao (versão de 20261226060000, que TEM de estar
--      aplicada antes): cada resposta dos levantamentos ganha tipo,
--      pergunta_texto, seccao_titulo, bloco, ordem, escolhas, escolhas_texto,
--      valor_texto e valor_numero; ordem ordem NULLS LAST, seccao, pergunta.
--   6. neg_ficha_pessoa (era md5 3764f801...): pessoa.qualificacao igual (só
--      as respostas de escolha única, como hoje são todas); chave nova
--      pessoa.qualificacao_respostas com o snapshot, do mesmo levantamento.
--   Nenhuma chave muda de nome nem de tipo.
-- MUDELAR: sem negocio_workflow_config, todas as funções lhe dão NG008.
--   Nenhum dado dela é lido nem escrito por esta migration.
-- PRECISA DE CÓDIGO? Não parte nada: a Fase V continua a mandar a forma
--   antiga, que passa a gravar com snapshot; a ficha só ganha chaves. O ecrã
--   do separador «Levantamento», o formulário a ler o questionário, os
--   componentes de múltipla, texto e número, e NG021 em errosNeg.ts vêm no
--   passo de UI (D10). Regenerar os tipos do Supabase.
-- ORDEM: depois de 20261226060000 (pré-condição por md5 da versão dela),
--   20261226070000 e 20261226080000.
-- Reversão: fora da pasta das migrations.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $pre$
DECLARE
  v_txt text;
BEGIN
  -- As funções a substituir são as lidas no remoto a 20/10, e a da ficha é a
  -- que 20261226060000 deixa (md5 calculado do ficheiro dessa migration:
  -- cabeçalho no formato de pg_get_functiondef e corpo tal como está).
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.neg_guardar_levantamento(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid)', '560158b25c0c337d0406135042c03b82'),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])',              '3764f801a3276dfda2c4ff40232a9aae'),
              ('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)',             '926d9f8b20bd775eafaeb197b8d1fccd'),
              ('public.fn_neg_exigir_config(uuid)',                                    '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',                               '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',                           '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_actor()',                                                '01c906dd40875e72a5e63bdc10200359'),
              ('public.current_business_user_id()',                                    '7e60101f074e4ff526559140be6618bb'),
              ('public.crm_scope_keys(text)',                                          '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',                                '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',                                    '29782031244dd3b0842ca43b271e2bf1'),
              ('public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text,uuid)',      'a824e72cc17905f1747d7a9284cf40a8')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10 (ou falta 20261226060000): %; nada feito.', v_txt;
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname::text = 'public'
        AND p.proname::text IN ('neg_guardar_levantamento', 'neg_ficha_pessoa', 'fn_neg_ficha_seccao')) <> 3 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: há sobrecargas das funções a substituir; nada feito.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
             WHERE s.nspname::text = 'public'
               AND p.proname::text IN ('neg_guardar_questionario', 'neg_questionario_levantamento',
                                       'fn_neg_questionario_normalizar', 'fn_neg_questionario_texto',
                                       'fn_neg_questionario_numero', 'fn_neg_questionario_booleano',
                                       'fn_neg_questionario_ident', 'fn_neg_questionario_objecto')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as funções do questionário já existem; nada feito.';
  END IF;

  -- 20261226070000 e 20261226080000 aplicadas.
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.levantamento_respostas'::regclass AND NOT a.attisdropped
        AND a.attname::text IN ('tipo', 'pergunta_texto', 'seccao_titulo', 'bloco', 'ordem', 'escolhas',
                                'escolhas_texto', 'valor_texto', 'valor_numero')) <> 9
     OR pg_catalog.to_regclass('public.levantamento_opcoes') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.levantamento_questionario q
                    WHERE q.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam 20261226070000 ou 20261226080000; nada feito.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = 'pessoas.config') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta a permissão pessoas.config; nada feito.';
  END IF;
END
$pre$;

-- ============================================================
-- 1. Auxiliares puras (NG009)
-- ============================================================

CREATE FUNCTION public.fn_neg_questionario_objecto(p_valor jsonb, p_chaves text[], p_campo text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) <> 'object' THEN
    RAISE EXCEPTION 'Questionário inválido: % tem de ser um objecto.', p_campo USING ERRCODE = 'NG009';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_valor) AS k(chave) WHERE k.chave <> ALL (p_chaves)) THEN
    RAISE EXCEPTION 'Questionário inválido: % com campos desconhecidos.', p_campo USING ERRCODE = 'NG009';
  END IF;
END;
$function$;

CREATE FUNCTION public.fn_neg_questionario_texto(p_valor jsonb, p_max integer, p_nulo boolean, p_campo text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v text;
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) = 'null' THEN
    IF p_nulo THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Questionário inválido: falta %.', p_campo USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_valor) <> 'string' THEN
    RAISE EXCEPTION 'Questionário inválido: % tem de ser texto.', p_campo USING ERRCODE = 'NG009';
  END IF;
  v := btrim(p_valor #>> '{}');
  IF v = '' THEN
    IF p_nulo THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Questionário inválido: falta %.', p_campo USING ERRCODE = 'NG009';
  END IF;
  IF char_length(v) > p_max OR v ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Questionário inválido: % com mais de % caracteres ou com caracteres de controlo.', p_campo, p_max
      USING ERRCODE = 'NG009';
  END IF;
  RETURN v;
END;
$function$;

CREATE FUNCTION public.fn_neg_questionario_numero(p_valor jsonb, p_campo text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_valor) <> 'number' THEN
    RAISE EXCEPTION 'Questionário inválido: % tem de ser um número.', p_campo USING ERRCODE = 'NG009';
  END IF;
  RETURN (p_valor #>> '{}')::numeric;
END;
$function$;

CREATE FUNCTION public.fn_neg_questionario_booleano(p_valor jsonb, p_omissao boolean, p_campo text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) = 'null' THEN
    RETURN p_omissao;
  END IF;
  IF jsonb_typeof(p_valor) <> 'boolean' THEN
    RAISE EXCEPTION 'Questionário inválido: % tem de ser verdadeiro ou falso.', p_campo USING ERRCODE = 'NG009';
  END IF;
  RETURN (p_valor #>> '{}')::boolean;
END;
$function$;

-- p_formato: 'id' (uuid, devolvido em minúsculas), 'ref' (A-Z a-z 0-9 _,
-- até 40, nunca um uuid) ou 'id_ou_ref'. NULL ou null json devolve NULL.
CREATE FUNCTION public.fn_neg_questionario_ident(p_valor jsonb, p_formato text, p_campo text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_re_uuid CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  c_re_ref  CONSTANT text := '^[A-Za-z0-9_]{1,40}$';
  v text;
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_valor) <> 'string' THEN
    RAISE EXCEPTION 'Questionário inválido: % tem de ser texto.', p_campo USING ERRCODE = 'NG009';
  END IF;
  v := p_valor #>> '{}';
  IF v ~ c_re_uuid AND p_formato IN ('id', 'id_ou_ref') THEN
    RETURN lower(v);
  END IF;
  IF v ~ c_re_ref AND p_formato IN ('ref', 'id_ou_ref') THEN
    RETURN v;
  END IF;
  RAISE EXCEPTION 'Questionário inválido: % com formato errado.', p_campo USING ERRCODE = 'NG009';
END;
$function$;

-- Valida a forma de p_seccoes e devolve-a normalizada (textos aparados,
-- omissões preenchidas). Não lê a base: as regras que dependem do que está
-- gravado ficam em neg_guardar_questionario.
CREATE FUNCTION public.fn_neg_questionario_normalizar(p_seccoes jsonb)
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
  c_chaves_s  CONSTANT text[] := ARRAY['id', 'ref', 'titulo', 'aba', 'especial', 'activa', 'perguntas'];
  c_chaves_p  CONSTANT text[] := ARRAY['id', 'ref', 'texto', 'tipo', 'bloco', 'activa', 'numero',
                                       'texto_max', 'depende', 'opcoes'];
  c_chaves_o  CONSTANT text[] := ARRAY['id', 'ref', 'texto', 'activa'];
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
        v_os := v_os || jsonb_build_array(jsonb_build_object(
          'id', v_oid, 'ref', v_oref,
          'texto', public.fn_neg_questionario_texto(v_o -> 'texto', 80, false, 'texto da opção'),
          'activa', public.fn_neg_questionario_booleano(v_o -> 'activa', true, 'activa')));
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
        'texto_max', v_tmax::integer, 'depende', v_dep, 'opcoes', v_os));
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

REVOKE ALL ON FUNCTION public.fn_neg_questionario_objecto(jsonb, text[], text)         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_texto(jsonb, integer, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_numero(jsonb, text)                  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_booleano(jsonb, boolean, text)       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_ident(jsonb, text, text)             FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_questionario_normalizar(jsonb)                    FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_questionario_normalizar(jsonb) IS
  'Pessoas, levantamento configurável: valida a forma de p_seccoes de neg_guardar_questionario (NG009) e devolve-a normalizada. Uso interno. 20261226090000.';

-- ============================================================
-- 2. neg_guardar_questionario
-- ============================================================

CREATE FUNCTION public.neg_guardar_questionario(p_organization_id uuid, p_versao integer, p_seccoes jsonb)
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
        IF v_per.tipo <> (v_q ->> 'tipo')
           AND EXISTS (SELECT 1 FROM public.levantamento_respostas lr
                       WHERE lr.organization_id = p_organization_id AND lr.pergunta = v_per.chave) THEN
          RAISE EXCEPTION 'Questionário inválido: a pergunta «%» já tem respostas e não muda de tipo; crie uma pergunta nova.',
            v_per.texto USING ERRCODE = 'NG009';
        END IF;
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
            activa       = (v_q ->> 'activa')::boolean
        WHERE lp.id = v_pid
          AND (lp.seccao_id, lp.texto, lp.bloco, lp.tipo, lp.numero_min, lp.numero_max, lp.numero_casas,
               lp.unidade, lp.texto_max, lp.ordem, lp.activa)
              IS DISTINCT FROM
              (v_sid, v_q ->> 'texto', v_q ->> 'bloco', v_q ->> 'tipo', (v_q ->> 'numero_min')::numeric,
               (v_q ->> 'numero_max')::numeric, (v_q ->> 'numero_casas')::smallint, v_q ->> 'unidade',
               (v_q ->> 'texto_max')::smallint, v_qi, (v_q ->> 'activa')::boolean);
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
           unidade, texto_max, ordem, activa)
        VALUES
          (p_organization_id, v_sid, v_chave, v_q ->> 'texto', v_q ->> 'bloco', v_q ->> 'tipo',
           (v_q ->> 'numero_min')::numeric, (v_q ->> 'numero_max')::numeric, (v_q ->> 'numero_casas')::smallint,
           v_q ->> 'unidade', (v_q ->> 'texto_max')::smallint, v_qi, (v_q ->> 'activa')::boolean)
        RETURNING id INTO v_pid;
        v_novas_p := v_novas_p || v_pid;
        v_cri_p := v_cri_p + 1;
      END IF;
      v_vp := v_vp || v_pid;
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
          SET texto = v_o ->> 'texto', ordem = v_oi, activa = (v_o ->> 'activa')::boolean
          WHERE lo.id = v_oid
            AND (lo.texto, lo.ordem, lo.activa)
                IS DISTINCT FROM (v_o ->> 'texto', v_oi, (v_o ->> 'activa')::boolean);
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
          INSERT INTO public.levantamento_opcoes (organization_id, pergunta_id, chave, texto, ordem, activa)
          VALUES (p_organization_id, v_pid, v_chave, v_o ->> 'texto', v_oi, (v_o ->> 'activa')::boolean)
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

REVOKE ALL ON FUNCTION public.neg_guardar_questionario(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_questionario(uuid, integer, jsonb) TO authenticated;

COMMENT ON FUNCTION public.neg_guardar_questionario(uuid, integer, jsonb) IS
  'Pessoas, Workflow, Levantamento: grava o questionário inteiro da organização (secções, perguntas, opções, condições). Forma inválida NG009; sem sessão 42501; sem Pessoas, sem questionário ou sem pessoas.view NG008; sem pessoas.config 42501; versão desactualizada NG021. Tipo só muda sem respostas. Devolve {versao, mudou, criadas, alteradas, apagadas, refs}. 20261226090000.';

-- ============================================================
-- 3. neg_questionario_levantamento
-- ============================================================

CREATE FUNCTION public.neg_questionario_levantamento(p_organization_id uuid, p_incluir_inactivas boolean DEFAULT false)
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
                   'opcoes', (
                     SELECT COALESCE(jsonb_agg(jsonb_build_object(
                              'id', o.id, 'chave', o.chave, 'texto', o.texto,
                              'ordem', o.ordem, 'activa', o.activa)
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

REVOKE ALL ON FUNCTION public.neg_questionario_levantamento(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_questionario_levantamento(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.neg_questionario_levantamento(uuid, boolean) IS
  'Pessoas, Levantamento: o questionário da organização {versao, seccoes[perguntas[opcoes]]}, pela ordem. Sem inactivas (formulário) ou com inactivas (separador do Workflow, exige pessoas.config, 42501). Apagadas nunca. NG009, NG008. INVOKER (RLS). 20261226090000.';

-- ============================================================
-- 4. neg_guardar_levantamento (substituída; só acrescenta)
-- ============================================================

CREATE OR REPLACE FUNCTION public.neg_guardar_levantamento(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_dados jsonb, p_linhas jsonb, p_respostas jsonb, p_negocio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg       public.negocios;
  v_lev       public.levantamentos;
  v_dados     jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_linhas    jsonb := COALESCE(p_linhas, '[]'::jsonb);
  v_respostas jsonb := COALESCE(p_respostas, '{}'::jsonb);
  v_data      date;
  v_visita    uuid;
  v_feito_por uuid;
  v_criado    boolean;
  v_ligado    uuid;
  v_n         int;
  -- 20261226090000: questionário configurável.
  v_norm      jsonb;
  v_versao    integer;
  v_versao_cl integer;
  v_res       jsonb;
  v_erro      text;
BEGIN
  IF p_id IS NULL
     OR jsonb_typeof(v_dados) <> 'object'
     OR jsonb_typeof(v_linhas) <> 'array'
     OR jsonb_typeof(v_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: identificador, dados, linhas ou respostas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_linhas) > 200
     OR (SELECT count(*) FROM jsonb_object_keys(v_respostas)) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: até 200 linhas e 200 respostas.' USING ERRCODE = 'NG009';
  END IF;
  BEGIN
    v_data      := (v_dados ->> 'data_levantamento')::date;
    v_visita    := (v_dados ->> 'visita_id')::uuid;
    v_feito_por := (v_dados ->> 'feito_por')::uuid;
    v_versao_cl := (v_dados ->> 'versao_questionario')::integer;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
              OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: data, visita, autor ou versão do questionário.' USING ERRCODE = 'NG009';
  END;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: falta a data do levantamento.' USING ERRCODE = 'NG009';
  END IF;

  -- 20261226090000: cada resposta é {"escolhas": [chaves]}, {"texto": "..."} ou
  -- {"numero": n}. A forma antiga da Fase V, {"seccao": "...", "resposta": "chave"},
  -- vale como {"escolhas": [chave]}; a secção enviada é ignorada (vem da
  -- configuração da organização).
  v_erro := (SELECT r.pergunta
             FROM jsonb_each(v_respostas) AS r(pergunta, valor)
             WHERE CASE
               WHEN r.pergunta !~ '^[a-z][A-Za-z0-9]{0,39}$' THEN true
               WHEN jsonb_typeof(r.valor) <> 'object' THEN true
               WHEN EXISTS (SELECT 1 FROM jsonb_object_keys(r.valor) AS k(chave)
                            WHERE k.chave NOT IN ('escolhas', 'texto', 'numero', 'resposta', 'seccao')) THEN true
               WHEN (r.valor ? 'escolhas')::integer + (r.valor ? 'texto')::integer
                    + (r.valor ? 'numero')::integer + (r.valor ? 'resposta')::integer <> 1 THEN true
               WHEN r.valor ? 'seccao' AND NOT (r.valor ? 'resposta') THEN true
               WHEN r.valor ? 'escolhas' THEN
                 CASE WHEN jsonb_typeof(r.valor -> 'escolhas') <> 'array' THEN true
                      WHEN jsonb_array_length(r.valor -> 'escolhas') NOT BETWEEN 1 AND 30 THEN true
                      ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(r.valor -> 'escolhas') AS x(v)
                                   WHERE jsonb_typeof(x.v) <> 'string')
                 END
               WHEN r.valor ? 'texto' THEN jsonb_typeof(r.valor -> 'texto') <> 'string'
               WHEN r.valor ? 'numero' THEN jsonb_typeof(r.valor -> 'numero') <> 'number'
               ELSE jsonb_typeof(r.valor -> 'resposta') <> 'string'
                    OR COALESCE(jsonb_typeof(r.valor -> 'seccao'), 'null') NOT IN ('string', 'null')
             END
             ORDER BY r.pergunta
             LIMIT 1);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: resposta à pergunta %.', left(v_erro, 40) USING ERRCODE = 'NG009';
  END IF;
  v_norm := (SELECT COALESCE(jsonb_object_agg(r.pergunta,
                       CASE WHEN r.valor ? 'resposta'
                            THEN jsonb_build_object('escolhas', jsonb_build_array(r.valor -> 'resposta'))
                            ELSE r.valor END), '{}'::jsonb)
             FROM jsonb_each(v_respostas) AS r(pergunta, valor));

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 20261226090000: o questionário da organização. Bloqueio PARTILHADO, o mesmo
  -- que neg_guardar_questionario toma em exclusivo: as respostas validam-se e
  -- gravam-se contra uma configuração que não muda a meio (e o tipo de uma
  -- pergunta não muda enquanto se grava uma resposta a ela).
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('levantamento_questionario:' || p_organization_id::text, 0));
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id;
  IF v_versao IS NULL AND v_norm <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- Validação das respostas contra o questionário (sob RLS), ANTES de
  -- escrever: pergunta desconhecida nesta organização, tipo do valor, opções
  -- da pergunta, limites -> NG009. Perguntas e opções inactivas ou apagadas
  -- aceitam-se (D5): existem e têm texto para o snapshot.
  v_res := (
    SELECT jsonb_agg(jsonb_build_object(
             'pergunta', z.pergunta, 'valido', z.valido, 'seccao', z.seccao, 'tipo', z.tipo,
             'pergunta_texto', z.texto, 'seccao_titulo', z.s_titulo, 'bloco', z.bloco,
             'ordem', z.s_ordem * 1000 + z.p_ordem,
             'escolhas', CASE WHEN z.tipo IN ('escolha_unica', 'escolha_multipla') THEN to_jsonb(z.esc) END,
             'escolhas_texto', CASE WHEN z.tipo IN ('escolha_unica', 'escolha_multipla') THEN to_jsonb(z.esc_txt) END,
             'resposta', CASE WHEN z.tipo = 'escolha_unica' THEN z.esc[1] END,
             'valor_texto', CASE WHEN z.tipo = 'texto' THEN z.txt END,
             'valor_numero', CASE WHEN z.tipo = 'numero' THEN z.num END))
    FROM (
      SELECT y.*,
             CASE
               WHEN y.pid IS NULL THEN false
               WHEN y.valor ? 'escolhas' THEN
                 y.tipo IN ('escolha_unica', 'escolha_multipla')
                 AND y.n_ok = y.n_env AND y.n_dist = y.n_env
                 AND (y.tipo = 'escolha_multipla' OR y.n_env = 1)
               WHEN y.valor ? 'texto' THEN
                 y.tipo = 'texto' AND char_length(y.txt) BETWEEN 1 AND COALESCE(y.texto_max, 2000)
               WHEN y.valor ? 'numero' THEN
                 y.tipo = 'numero' AND abs(y.num) <= 99999999999.999
                 AND y.num = round(y.num, COALESCE(y.numero_casas, 3))
                 AND (y.numero_min IS NULL OR y.num >= y.numero_min)
                 AND (y.numero_max IS NULL OR y.num <= y.numero_max)
               ELSE false
             END AS valido
      FROM (
        SELECT n.pergunta, n.valor, p.id AS pid, p.tipo, p.texto, p.bloco, p.ordem AS p_ordem,
               p.texto_max, p.numero_min, p.numero_max, p.numero_casas,
               s.chave AS seccao, s.titulo AS s_titulo, s.ordem AS s_ordem,
               CASE WHEN n.valor ? 'texto' THEN btrim(n.valor ->> 'texto') END AS txt,
               CASE WHEN n.valor ? 'numero' THEN (n.valor ->> 'numero')::numeric END AS num,
               x.n_env, x.n_dist, x.n_ok, x.esc, x.esc_txt
        FROM jsonb_each(v_norm) AS n(pergunta, valor)
        LEFT JOIN public.levantamento_perguntas p
          ON p.organization_id = p_organization_id AND p.chave = n.pergunta
        LEFT JOIN public.levantamento_seccoes s ON s.id = p.seccao_id
        LEFT JOIN LATERAL (
          SELECT count(*)::integer AS n_env, count(DISTINCT c.chave)::integer AS n_dist,
                 count(o.id)::integer AS n_ok,
                 array_agg(c.chave ORDER BY o.ordem, c.chave) FILTER (WHERE o.id IS NOT NULL) AS esc,
                 array_agg(o.texto ORDER BY o.ordem, c.chave) FILTER (WHERE o.id IS NOT NULL) AS esc_txt
          FROM jsonb_array_elements_text(CASE WHEN n.valor ? 'escolhas' THEN n.valor -> 'escolhas'
                                              ELSE '[]'::jsonb END) AS c(chave)
          LEFT JOIN public.levantamento_opcoes o ON o.pergunta_id = p.id AND o.chave = c.chave
        ) x ON true
      ) y
    ) z);
  v_erro := (SELECT x.e ->> 'pergunta'
             FROM jsonb_array_elements(v_res) AS x(e)
             WHERE NOT (x.e ->> 'valido')::boolean
             ORDER BY 1
             LIMIT 1);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: resposta à pergunta %.', left(v_erro, 40) USING ERRCODE = 'NG009';
  END IF;

  -- Ordem de bloqueio: negócio primeiro (ligação feita no fim).
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = p_negocio_id AND o.id <> p_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
  END IF;

  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- 1. CRIAR (sem negocio_id) ou alterar o existente.
  INSERT INTO public.levantamentos
    (id, organization_id, entity_id, visita_id, feito_por, data_levantamento, estado, notas,
     morada_rua, morada_codigo_postal, morada_localidade, morada_andar)
  VALUES
    (p_id, p_organization_id, p_entity_id, v_visita, v_feito_por, v_data,
     COALESCE(NULLIF(v_dados ->> 'estado', ''), 'por_fazer'),
     NULLIF(btrim(v_dados ->> 'notas'), ''),
     NULLIF(btrim(v_dados ->> 'morada_rua'), ''),
     NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), ''),
     NULLIF(btrim(v_dados ->> 'morada_localidade'), ''),
     NULLIF(btrim(v_dados ->> 'morada_andar'), ''))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_criado := v_n > 0;

  IF NOT v_criado THEN
    SELECT lv.* INTO v_lev FROM public.levantamentos lv WHERE lv.id = p_id;
    IF NOT FOUND OR v_lev.organization_id <> p_organization_id OR v_lev.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF v_lev.negocio_id IS NOT NULL THEN
      IF v_lev.negocio_id = p_negocio_id THEN
        RETURN jsonb_build_object('levantamento_id', p_id, 'criado', false, 'mudou', false,
                                  'ligado_a', v_lev.negocio_id,
                                  'versao_questionario', v_versao,
                                  'questionario_mudou', v_versao_cl IS NOT NULL
                                                        AND v_versao_cl IS DISTINCT FROM v_versao);
      END IF;
      RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
        USING ERRCODE = 'NG005';
    END IF;

    UPDATE public.levantamentos lv
    SET visita_id            = v_visita,
        feito_por            = COALESCE(v_feito_por, lv.feito_por),
        data_levantamento    = v_data,
        estado               = COALESCE(NULLIF(v_dados ->> 'estado', ''), lv.estado),
        notas                = NULLIF(btrim(v_dados ->> 'notas'), ''),
        morada_rua           = NULLIF(btrim(v_dados ->> 'morada_rua'), ''),
        morada_codigo_postal = NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), ''),
        morada_localidade    = NULLIF(btrim(v_dados ->> 'morada_localidade'), ''),
        morada_andar         = NULLIF(btrim(v_dados ->> 'morada_andar'), '')
    WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar o levantamento.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. PREENCHER: linhas por substituição completa, na ordem recebida.
  DELETE FROM public.levantamento_linhas ll WHERE ll.levantamento_id = p_id;
  BEGIN
    INSERT INTO public.levantamento_linhas
      (levantamento_id, organization_id, divisao, trabalho, trabalho_outro, medida, unidade,
       observacoes, ordem)
    SELECT p_id, p_organization_id,
           e.valor ->> 'divisao',
           e.valor ->> 'trabalho',
           NULLIF(btrim(e.valor ->> 'trabalho_outro'), ''),
           (e.valor ->> 'medida')::numeric,
           COALESCE(NULLIF(e.valor ->> 'unidade', ''), 'm2'),
           NULLIF(btrim(e.valor ->> 'observacoes'), ''),
           (e.posicao - 1)::int
    FROM jsonb_array_elements(v_linhas) WITH ORDINALITY AS e(valor, posicao);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: medida de uma linha do levantamento.' USING ERRCODE = 'NG009';
  END;

  -- Respostas: as enviadas (upsert, sem id no payload) e apagar as que deixaram de vir.
  -- 20261226090000: validadas acima; o snapshot (tipo, textos, secção, ordem) só
  -- se escreve quando a resposta é nova ou o valor mudou, para que mudar a
  -- configuração não altere o que já foi respondido.
  INSERT INTO public.levantamento_respostas AS lr
    (levantamento_id, organization_id, seccao, pergunta, resposta, tipo, pergunta_texto,
     seccao_titulo, bloco, ordem, escolhas, escolhas_texto, valor_texto, valor_numero)
  SELECT p_id, p_organization_id, x.seccao, x.pergunta, x.resposta, x.tipo, x.pergunta_texto,
         x.seccao_titulo, x.bloco, x.ordem, x.escolhas, x.escolhas_texto, x.valor_texto, x.valor_numero
  FROM jsonb_to_recordset(v_res) AS x(pergunta text, seccao text, resposta text, tipo text,
         pergunta_texto text, seccao_titulo text, bloco text, ordem integer, escolhas text[],
         escolhas_texto text[], valor_texto text, valor_numero numeric)
  LEFT JOIN public.levantamento_respostas a
    ON a.levantamento_id = p_id AND a.pergunta = x.pergunta
  WHERE a.id IS NULL
     OR a.tipo IS DISTINCT FROM x.tipo
     OR a.resposta IS DISTINCT FROM x.resposta
     OR a.valor_texto IS DISTINCT FROM x.valor_texto
     OR a.valor_numero IS DISTINCT FROM x.valor_numero
     OR ARRAY(SELECT u.c FROM unnest(a.escolhas) AS u(c) ORDER BY u.c)
        IS DISTINCT FROM ARRAY(SELECT u.c FROM unnest(x.escolhas) AS u(c) ORDER BY u.c)
  ON CONFLICT (levantamento_id, pergunta)
  DO UPDATE SET seccao = EXCLUDED.seccao, resposta = EXCLUDED.resposta, tipo = EXCLUDED.tipo,
                pergunta_texto = EXCLUDED.pergunta_texto, seccao_titulo = EXCLUDED.seccao_titulo,
                bloco = EXCLUDED.bloco, ordem = EXCLUDED.ordem, escolhas = EXCLUDED.escolhas,
                escolhas_texto = EXCLUDED.escolhas_texto, valor_texto = EXCLUDED.valor_texto,
                valor_numero = EXCLUDED.valor_numero;

  DELETE FROM public.levantamento_respostas lr
  WHERE lr.levantamento_id = p_id
    AND NOT (v_respostas ? lr.pergunta);

  -- 3. LIGAR (o trigger valida um por negócio e a permissão).
  IF p_negocio_id IS NOT NULL THEN
    UPDATE public.levantamentos lv SET negocio_id = p_negocio_id WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN
      v_ligado := p_negocio_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('levantamento_id', p_id, 'criado', v_criado, 'mudou', true,
                            'ligado_a', v_ligado,
                            'versao_questionario', v_versao,
                            'questionario_mudou', v_versao_cl IS NOT NULL
                                                  AND v_versao_cl IS DISTINCT FROM v_versao);
END;
$function$;

-- ============================================================
-- 5. fn_neg_ficha_seccao (a partir da versão de 20261226060000)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_neg_ficha_seccao(p_organization_id uuid, p_entity_id uuid, p_tipo text, p_limite integer, p_depois jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_lim    int;
  v_ts     timestamptz;
  v_dt     date;
  v_id     uuid;
  v_leads  uuid[];
  v_clis   uuid[];
  v_total  bigint;
  v_itens  jsonb;
  v_mais   boolean;
  v_ult_ts timestamptz;
  v_ult_dt date;
  v_ult_id uuid;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: secção, limite (1 a 100) ou página.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    BEGIN
      v_id := (p_depois ->> 'id')::uuid;
      IF p_tipo = 'levantamentos' THEN
        v_dt := (p_depois ->> 'em')::date;
      ELSE
        v_ts := (p_depois ->> 'em')::timestamptz;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- qualquer erro de conversão (uuid, data, fuso): página inválida
      RAISE EXCEPTION 'Valor inválido: página.' USING ERRCODE = 'NG009';
    END;
    IF v_id IS NULL OR (v_ts IS NULL AND v_dt IS NULL) THEN
      RAISE EXCEPTION 'Valor inválido: página.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- Guardas: saltadas só se neg_ficha_pessoa já as passou nesta transacção
  -- para esta organização e pessoa (variável local que a API não escreve).
  IF COALESCE(current_setting('app.neg_ficha_verificada', true), '')
     IS DISTINCT FROM p_organization_id::text || ':' || p_entity_id::text THEN
    PERFORM public.fn_neg_exigir_config(p_organization_id);
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  END IF;

  -- 20261226060000: os levantamentos paginam como as outras secções, com
  -- p_limite por página (antes, no máximo 10).
  v_lim := p_limite;

  IF p_tipo IN ('contactos', 'atividade') THEN
    SELECT count(*) INTO v_total
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
      AND (p_tipo = 'atividade' OR i.interaction_type = 'call');

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_ts, v_ult_id
    FROM (
      SELECT i.id, i.interaction_at AS em,
             row_number() OVER (ORDER BY i.interaction_at DESC, i.id DESC) AS rn,
             CASE WHEN p_tipo = 'contactos' THEN
               jsonb_build_object('id', i.id, 'resultado', i.result, 'notas', i.notes,
                                  'em', i.interaction_at, 'proxima_acao_em', i.next_action_date,
                                  'negocio_id', i.negocio_id, 'criado_por_nome', cu.name)
             ELSE
               jsonb_build_object('id', i.id, 'tipo', i.interaction_type, 'assunto', i.subject,
                                  'resultado', i.result, 'notas', i.notes, 'em', i.interaction_at,
                                  'negocio_id', i.negocio_id, 'criado_por_nome', cu.name)
             END AS item
      FROM (
        SELECT ei.*
        FROM public.entity_interactions ei
        WHERE ei.entity_id = p_entity_id AND ei.organization_id = p_organization_id
          AND (p_tipo = 'atividade' OR ei.interaction_type = 'call')
          AND (v_ts IS NULL OR (ei.interaction_at, ei.id) < (v_ts, v_id))
        ORDER BY ei.interaction_at DESC, ei.id DESC
        LIMIT v_lim + 1
      ) i
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = CASE WHEN i.created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN i.created_by::uuid END
        LIMIT 1
      ) cu ON true
    ) z;

  ELSIF p_tipo = 'visitas' THEN
    -- Dois ramos por índice (leads e clientes da pessoa); sem ausências,
    -- férias nem quadros de ausências ou de frota. 20261226060000: as
    -- canceladas passam a vir (antes eram escondidas), marcadas com
    -- 'cancelada' = true; o total e a paginação contam-nas.
    v_leads := ARRAY(SELECT l.id FROM public.anew_leads l
                     WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                       AND l.deleted_at IS NULL);
    v_clis  := ARRAY(SELECT c.id FROM public.anew_clients c
                     WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                       AND c.deleted_at IS NULL);

    SELECT count(*) INTO v_total
    FROM (SELECT si.id FROM public.schedule_items si
          WHERE si.lead_id = ANY (v_leads) AND si.organization_id = p_organization_id
          UNION
          SELECT si.id FROM public.schedule_items si
          WHERE si.client_id = ANY (v_clis) AND si.organization_id = p_organization_id) ids
    JOIN public.schedule_items s ON s.id = ids.id
    LEFT JOIN public.schedule_boards b ON b.id = s.board_id
    WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'));

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_ts, v_ult_id
    FROM (
      SELECT s.id, s.start_datetime AS em,
             row_number() OVER (ORDER BY s.start_datetime DESC, s.id DESC) AS rn,
             jsonb_build_object(
               'id', s.id, 'inicio', s.start_datetime, 'fim', s.end_datetime, 'status', s.status,
               'resultado', s.visit_outcome, 'tipo', s.visit_kind, 'titulo', s.title,
               'notas', s.description, 'local', s.location, 'negocio_id', s.negocio_id,
               'feito_por_nome', fp.name, 'board_id', s.board_id, 'board_nome', s.board_nome,
               'recursos', rc.lista, 'detalhes', s.metadata -> 'pessoas',
               'cancelada', s.status = 'cancelled'::public.schedule_item_status) AS item
      FROM (
        SELECT si.*, b.name AS board_nome
        FROM (SELECT x.id FROM public.schedule_items x
              WHERE x.lead_id = ANY (v_leads) AND x.organization_id = p_organization_id
              UNION
              SELECT x.id FROM public.schedule_items x
              WHERE x.client_id = ANY (v_clis) AND x.organization_id = p_organization_id) ids
        JOIN public.schedule_items si ON si.id = ids.id
        LEFT JOIN public.schedule_boards b ON b.id = si.board_id
        WHERE si.time_off_type IS NULL AND si.vacation_id IS NULL
          AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))
          AND (v_ts IS NULL OR (si.start_datetime, si.id) < (v_ts, v_id))
        ORDER BY si.start_datetime DESC, si.id DESC
        LIMIT v_lim + 1
      ) s
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = s.created_by OR u.auth_user_id = s.created_by
        LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.name,
                                                     'user_id', r.user_id, 'ativo', r.is_active)
                                  ORDER BY r.name, r.id), '[]'::jsonb) AS lista
        FROM public.schedule_item_assignees a
        JOIN public.schedule_resources r ON r.id = a.resource_id
        WHERE a.item_id = s.id
      ) rc ON true
    ) z;

  ELSE -- levantamentos
    SELECT count(*) INTO v_total
    FROM public.levantamentos lt
    WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
      AND lt.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_dt, v_ult_id
    FROM (
      SELECT lt.id, lt.data_levantamento AS em,
             row_number() OVER (ORDER BY lt.data_levantamento DESC, lt.id DESC) AS rn,
             jsonb_build_object(
               'id', lt.id, 'visita_id', lt.visita_id, 'negocio_id', lt.negocio_id,
               'data', lt.data_levantamento, 'estado', lt.estado, 'notas', lt.notas,
               'feito_por_id', lt.feito_por, 'feito_por_nome', fp.name,
               'morada', jsonb_build_object('rua', lt.morada_rua, 'codigo_postal', lt.morada_codigo_postal,
                                            'localidade', lt.morada_localidade, 'andar', lt.morada_andar),
               'n_linhas', ln.n, 'n_respostas', rs.n,
               'linhas', ln.lista, 'respostas', rs.lista) AS item
      FROM (
        SELECT l2.*
        FROM public.levantamentos l2
        WHERE l2.entity_id = p_entity_id AND l2.organization_id = p_organization_id
          AND l2.deleted_at IS NULL
          AND (v_dt IS NULL OR (l2.data_levantamento, l2.id) < (v_dt, v_id))
        ORDER BY l2.data_levantamento DESC, l2.id DESC
        LIMIT v_lim + 1
      ) lt
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u WHERE u.id = lt.feito_por LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'divisao', ll.divisao, 'trabalho', ll.trabalho, 'trabalho_outro', ll.trabalho_outro,
                 'medida', ll.medida, 'unidade', ll.unidade, 'observacoes', ll.observacoes,
                 'ordem', ll.ordem) ORDER BY ll.ordem, ll.id), '[]'::jsonb) AS lista
        FROM public.levantamento_linhas ll
        WHERE ll.levantamento_id = lt.id
      ) ln ON true
      LEFT JOIN LATERAL (
        -- 20261226090000: cada resposta traz o snapshot (o que a pessoa viu e
        -- respondeu); tipo NULL = resposta antiga, só com a chave em 'resposta'.
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'seccao', lr.seccao, 'pergunta', lr.pergunta, 'resposta', lr.resposta,
                 'tipo', lr.tipo, 'pergunta_texto', lr.pergunta_texto, 'seccao_titulo', lr.seccao_titulo,
                 'bloco', lr.bloco, 'ordem', lr.ordem, 'escolhas', lr.escolhas,
                 'escolhas_texto', lr.escolhas_texto, 'valor_texto', lr.valor_texto,
                 'valor_numero', lr.valor_numero)
                 ORDER BY lr.ordem NULLS LAST, lr.seccao, lr.pergunta), '[]'::jsonb) AS lista
        FROM public.levantamento_respostas lr
        WHERE lr.levantamento_id = lt.id
      ) rs ON true
    ) z;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'tem_mais', v_mais,
    'proximo', CASE WHEN v_mais THEN jsonb_build_object(
                 'em', CASE WHEN p_tipo = 'levantamentos' THEN to_char(v_ult_dt, 'YYYY-MM-DD')
                            ELSE to_char(v_ult_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
                 'id', v_ult_id) END,
    'itens', v_itens);
END;
$function$;

-- ============================================================
-- 6. neg_ficha_pessoa (substituída; só acrescenta)
-- ============================================================

CREATE OR REPLACE FUNCTION public.neg_ficha_pessoa(p_organization_id uuid, p_entity_id uuid, p_limite integer DEFAULT 30, p_depois jsonb DEFAULT NULL::jsonb, p_partes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_momento   text;
  v_base      boolean;
  v_lead      public.anew_leads;
  v_cli       public.anew_clients;
  v_lds       uuid[];
  v_pessoa    jsonb;
  v_lead_j    jsonb;
  v_abertas   jsonb;
  v_agreg     jsonb;
  v_perm      jsonb;
  v_negocios  jsonb;
  v_docs      jsonb;
  v_ng        record;
  v_ct        record;
  v_vs        record;
  v_lv_por    bigint;
  v_etapa     text;
  v_res       jsonb;
BEGIN
  -- 1. Valores
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_partes IS NOT NULL AND (cardinality(p_partes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(p_partes) AS x(parte)
           WHERE x.parte IS NULL
              OR x.parte NOT IN ('base', 'contactos', 'visitas', 'levantamentos', 'atividade'))))
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: limite (1 a 100), partes ou páginas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_depois) AS k(chave)
               WHERE k.chave NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')) THEN
      RAISE EXCEPTION 'Valor inválido: páginas.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- 2. Guardas, antes de qualquer leitura de registos; as secções não as
  --    repetem para esta organização e pessoa nesta transacção.
  v_momento := public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  PERFORM set_config('app.neg_ficha_verificada',
                     p_organization_id::text || ':' || p_entity_id::text, true);

  v_base := p_partes IS NULL OR 'base' = ANY (p_partes);

  IF v_base THEN
    -- A lead (a mais recente viva) e o cliente (o mais antigo vivo), como no resumo.
    SELECT l.* INTO v_lead
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 1;
    SELECT c.* INTO v_cli
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
    v_lds := ARRAY(SELECT l.id FROM public.anew_leads l
                   WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                     AND l.deleted_at IS NULL);

    -- Agregados: os mesmos predicados de neg_resumo_pessoas.
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           count(*) AS total,
           max(n.created_at) AS ultimo_em
      INTO v_ng
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id AND n.deleted_at IS NULL;

    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           count(*) AS total
      INTO v_ct
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id AND i.interaction_type = 'call';

    SELECT min(s.start_datetime) FILTER (
             WHERE s.start_datetime >= now()
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(s.start_datetime) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE s.lead_id IS NOT NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
      INTO v_vs
    FROM (
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE si.lead_id = ANY (v_lds)
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
      UNION ALL
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE v_cli.id IS NOT NULL AND si.client_id = v_cli.id
        AND (si.lead_id IS NULL OR si.lead_id <> ALL (v_lds))
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s;

    SELECT count(*) INTO v_lv_por
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = p_entity_id
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz);

    v_etapa := CASE
      WHEN v_cli.id IS NOT NULL THEN 'cliente'
      WHEN v_ng.abertos > 0 THEN 'qualificada'
      WHEN v_vs.visitas_lead > 0 THEN 'visitaMarcada'
      WHEN v_ct.ultimo IS NOT NULL THEN 'emContacto'
      ELSE 'nova'
    END;

    v_agreg := jsonb_build_object(
      'ultimo_contacto_em', v_ct.ultimo,
      'ultimo_resultado', (SELECT i.result FROM public.entity_interactions i
                           WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
                             AND i.interaction_type = 'call'
                           ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1),
      'proximo_contacto_em', public.fn_neg_proximo_contacto(p_organization_id, p_entity_id),
      -- 20261225150000: o contacto EFECTIVO, a regra da Lista (ultimo_resultado):
      -- o mais recente entre a última chamada (acima) e o último contacto
      -- guardado na lead mostrada pela página de Leads (last_contact_at e
      -- last_contact_result); em empate ganha a chamada. É o que a UI deve usar.
      'ultimo_contacto_efetivo_em', GREATEST(v_ct.ultimo, v_lead.last_contact_at),
      'ultimo_resultado_efetivo', CASE
         WHEN v_ct.ultimo IS NULL AND v_lead.last_contact_at IS NULL THEN NULL
         WHEN v_lead.last_contact_at IS NULL OR v_ct.ultimo >= v_lead.last_contact_at THEN
           (SELECT i.result FROM public.entity_interactions i
            WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
              AND i.interaction_type = 'call'
            ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1)
         ELSE v_lead.last_contact_result::text END,
      'ultima_visita_feita_em', v_vs.ultima_feita,
      'proxima_visita_em', v_vs.proxima,
      'por_ligar', jsonb_build_object('contactos', v_ct.por_ligar, 'visitas', v_vs.por_ligar,
                                      'levantamentos', v_lv_por),
      'negocios', jsonb_build_object('abertos', v_ng.abertos, 'ganhos', v_ng.ganhos,
                                     'perdidos', v_ng.perdidos),
      'total_contactos', v_ct.total,
      'total_visitas', (SELECT count(*)
                        FROM (SELECT si.id FROM public.schedule_items si
                              WHERE si.lead_id = ANY (v_lds) AND si.organization_id = p_organization_id
                              UNION
                              SELECT si.id FROM public.schedule_items si
                              WHERE si.organization_id = p_organization_id
                                AND si.client_id IN (SELECT c.id FROM public.anew_clients c
                                                     WHERE c.organization_id = p_organization_id
                                                       AND c.entity_id = p_entity_id
                                                       AND c.deleted_at IS NULL)) ids
                        JOIN public.schedule_items s ON s.id = ids.id
                        LEFT JOIN public.schedule_boards b ON b.id = s.board_id
                        WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
                          AND s.status <> 'cancelled'::public.schedule_item_status
                          AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))),
      'total_levantamentos', (SELECT count(*) FROM public.levantamentos lt
                              WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
                                AND lt.deleted_at IS NULL),
      'total_atividade', (SELECT count(*) FROM public.entity_interactions i
                          WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id));

    -- Pessoa
    SELECT jsonb_build_object(
      'id', p_entity_id,
      'nome', e.display_name,
      'papel', CASE WHEN v_cli.id IS NOT NULL THEN 'cliente' ELSE 'lead' END,
      'lead_id', v_lead.id,
      'client_id', v_cli.id,
      'responsavel_id', COALESCE(v_cli.assigned_to, v_lead.assigned_to),
      'responsavel_nome', (SELECT u.name FROM public.anew_users u
                           WHERE u.id = COALESCE(v_cli.assigned_to, v_lead.assigned_to)),
      'etapa', v_etapa,
      'desde', LEAST((SELECT min(l.created_at) FROM public.anew_leads l
                      WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                        AND l.deleted_at IS NULL),
                     v_cli.created_at),
      'contacto', jsonb_build_object(
        'telefone', (SELECT ph.phone_number FROM public.anew_entity_phones ph
                     WHERE ph.entity_id = p_entity_id
                     ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC LIMIT 1),
        'email', (SELECT em.email FROM public.anew_entity_emails em
                  WHERE em.entity_id = p_entity_id
                  ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1)),
      'morada', (SELECT jsonb_build_object(
                          'rua', NULLIF(btrim(concat_ws(' ', a.street, a.number)), ''),
                          'codigo_postal', a.postal_code, 'localidade', a.city,
                          'andar', a.floor, 'distrito', a.district)
                 FROM public.anew_entity_addresses ea
                 JOIN public.anew_addresses a ON a.id = ea.address_id
                 WHERE ea.entity_id = p_entity_id
                   AND (ea.valid_to IS NULL OR ea.valid_to > now())
                 ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
                 LIMIT 1),
      -- As respostas da aba Qualificação do levantamento vivo mais recente que as tenha
      -- (ql, abaixo). 20261226090000: 'qualificacao' fica {pergunta: chave} só com as de
      -- escolha única (hoje são todas); 'qualificacao_respostas' traz as mesmas com o
      -- snapshot (textos, tipo, escolhas, valores), do mesmo levantamento.
      'qualificacao', (SELECT jsonb_object_agg(lr.pergunta, lr.resposta) FILTER (WHERE lr.resposta IS NOT NULL)
                       FROM public.levantamento_respostas lr
                       WHERE lr.seccao = 'qualificacao'
                         AND lr.levantamento_id = ql.id),
      'qualificacao_respostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'seccao', lr.seccao, 'pergunta', lr.pergunta, 'resposta', lr.resposta,
                                   'tipo', lr.tipo, 'pergunta_texto', lr.pergunta_texto,
                                   'seccao_titulo', lr.seccao_titulo, 'bloco', lr.bloco, 'ordem', lr.ordem,
                                   'escolhas', lr.escolhas, 'escolhas_texto', lr.escolhas_texto,
                                   'valor_texto', lr.valor_texto, 'valor_numero', lr.valor_numero)
                                   ORDER BY lr.ordem NULLS LAST, lr.pergunta), '[]'::jsonb)
                                 FROM public.levantamento_respostas lr
                                 WHERE lr.seccao = 'qualificacao'
                                   AND lr.levantamento_id = ql.id),
      'origem', CASE WHEN v_lead.id IS NULL THEN NULL ELSE jsonb_build_object(
                  'origin', v_lead.origin,
                  'source', v_lead.source,
                  'campanha_id', v_lead.campaign_id,
                  'campanha', (SELECT ca.name FROM public.campaigns ca WHERE ca.id = v_lead.campaign_id),
                  'formulario_id', (SELECT f.id FROM public.campaigns ca
                                    JOIN public.forms f ON f.id = ca.form_id
                                    WHERE ca.id = v_lead.campaign_id),
                  'formulario', (SELECT f.name FROM public.campaigns ca
                                 JOIN public.forms f ON f.id = ca.form_id
                                 WHERE ca.id = v_lead.campaign_id)) END,
      'nif', NULL,
      'empresa', NULL,
      -- 20261225150000: MQL/SQL da lead mostrada (v_lead); as respostas da aba
      -- Qualificação continuam na chave 'qualificacao', acima.
      'qualificacao_tipo', v_lead.qualification_type,
      -- «Voltou a contactar»: a regra da página de Leads, contando também as
      -- chamadas registadas (entity_interactions 'call', onde escreve
      -- neg_registar_contacto).
      'ultima_atividade_em', v_lead.last_activity_at,
      'ultimo_contacto_lead_em', v_lead.last_contact_at,
      'voltou_a_contactar', (v_lead.last_activity_at IS NOT NULL
                             AND (GREATEST(v_lead.last_contact_at, v_ct.ultimo) IS NULL
                                  OR v_lead.last_activity_at > GREATEST(v_lead.last_contact_at, v_ct.ultimo))),
      -- Identidade: tipo da entidade, nome da empresa (organização) e se há
      -- NIF, só em leitura. O NIF nunca sai daqui, nem o id da entidade
      -- fiscal: só se há uma ligação fiscal PRINCIPAL em vigor.
      'tipo', e.type,
      'empresa_nome', CASE WHEN e.type = 'organization' THEN e.display_name END,
      'tem_nif', fe.fid IS NOT NULL)
      INTO v_pessoa
    FROM (SELECT 1) AS um
    LEFT JOIN public.anew_entities e ON e.id = p_entity_id
    LEFT JOIN LATERAL (
      SELECT aef.fiscal_entity_id AS fid
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.entity_id = p_entity_id AND aef.is_primary IS TRUE
        AND (aef.valid_to IS NULL OR aef.valid_to > now())
      ORDER BY aef.created_at DESC, aef.id DESC
      LIMIT 1
    ) fe ON true
    LEFT JOIN LATERAL (
      SELECT lt.id FROM public.levantamentos lt
      WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
        AND lt.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.levantamento_respostas q
                    WHERE q.levantamento_id = lt.id AND q.seccao = 'qualificacao')
      ORDER BY lt.data_levantamento DESC, lt.created_at DESC, lt.id DESC
      LIMIT 1
    ) ql ON true;

    -- Lead e encerramento (a nota 'Abordagem encerrada' mais recente).
    IF v_lead.id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', v_lead.id,
        'estado', v_lead.status,
        'aberta', public.fn_neg_lead_aberta(v_lead.status::text) AND v_lead.closure_result IS NULL,
        'encerramento', CASE WHEN v_lead.closure_result IS NULL THEN NULL ELSE jsonb_build_object(
          'resultado', v_lead.closure_result,
          'motivo', nt.result,
          'motivo_outro', CASE WHEN nt.result = 'outro' THEN nt.notes END,
          'em', nt.interaction_at) END)
        INTO v_lead_j
      FROM (SELECT 1) AS um
      LEFT JOIN LATERAL (
        SELECT i.result, i.notes, i.interaction_at
        FROM public.entity_interactions i
        WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
          AND i.interaction_type = 'note' AND i.subject = 'Abordagem encerrada'
        ORDER BY i.interaction_at DESC, i.id DESC
        LIMIT 1
      ) nt ON true;
    END IF;

    v_abertas := (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                           'id', l.id, 'status', l.status, 'created_at', l.created_at,
                           'closure_result', l.closure_result) ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb)
                  FROM (SELECT l1.* FROM public.anew_leads l1
                        WHERE l1.organization_id = p_organization_id AND l1.entity_id = p_entity_id
                          AND l1.deleted_at IS NULL AND public.fn_neg_lead_aberta(l1.status::text)
                        ORDER BY l1.created_at DESC, l1.id DESC
                        LIMIT 20) l);

    v_perm := jsonb_build_object(
      'editar', public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'),
      'criar',  public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create'));

    -- Negócios (até 50, recentes primeiro), com documentos e os últimos 10 eventos.
    v_negocios := jsonb_build_object(
      'total', v_ng.total,
      'itens', (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
                FROM (
                  SELECT n.id, n.created_at,
                    jsonb_build_object(
                      'id', n.id, 'titulo', n.titulo, 'notas', n.notas, 'estado', n.estado,
                      'criado_em', n.created_at, 'ganho_em', n.ganho_em, 'perdido_em', n.perdido_em,
                      'fase_perda', n.fase_perda, 'motivo_perda', n.motivo_perda,
                      'responsavel_id', n.assigned_to,
                      'responsavel_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = n.assigned_to),
                      'valor', public.fn_neg_valor_negocio(n.id),
                      'pronto_a_ganhar', n.estado = 'aberto' AND CASE
                        WHEN v_momento = 'proposta_aceite' THEN EXISTS (
                          SELECT 1 FROM public.proposals pr
                          WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                            AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
                        WHEN v_momento = 'contrato_assinado' THEN EXISTS (
                          SELECT 1 FROM public.client_contracts cc
                          WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado')
                            AND cc.deleted_at IS NULL)
                        ELSE false END,
                      'parado_desde', CASE WHEN n.estado = 'aberto'
                                           THEN public.fn_neg_parado_desde(n.id) END,
                      'levantamento_id', (SELECT lt.id FROM public.levantamentos lt
                                          WHERE lt.negocio_id = n.id AND lt.deleted_at IS NULL LIMIT 1),
                      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                                       'total', q.total, 'criado_em', q.created_at)
                                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                                     FROM public.quotes q
                                     WHERE q.negocio_id = n.id AND q.deleted_at IS NULL),
                      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                                      'criado_em', pr.created_at)
                                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                                    FROM public.proposals pr
                                    WHERE pr.negocio_id = n.id AND pr.deleted_at IS NULL
                                      AND pr.is_deleted IS NOT TRUE),
                      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                                      'criado_em', cc.created_at,
                                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                                    FROM public.client_contracts cc
                                    WHERE cc.negocio_id = n.id AND cc.deleted_at IS NULL),
                      'eventos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                    'id', ev.id, 'tipo', ev.tipo, 'fase', ev.fase, 'motivo', ev.motivo,
                                    'motivo_reabertura', ev.motivo_reabertura, 'criado_em', ev.created_at,
                                    'criado_por_nome', (SELECT u.name FROM public.anew_users u
                                                        WHERE u.id = ev.created_by))
                                    ORDER BY ev.created_at DESC, ev.id DESC), '[]'::jsonb)
                                  FROM (SELECT e1.* FROM public.negocio_eventos e1
                                        WHERE e1.negocio_id = n.id
                                        ORDER BY e1.created_at DESC, e1.id DESC
                                        LIMIT 10) ev)
                    ) AS item
                  FROM (SELECT n1.* FROM public.negocios n1
                        WHERE n1.organization_id = p_organization_id AND n1.entity_id = p_entity_id
                          AND n1.deleted_at IS NULL
                        ORDER BY n1.created_at DESC, n1.id DESC
                        LIMIT 50) n
                ) x));

    -- Documentos da pessoa ainda sem negócio (até 50 de cada).
    v_docs := jsonb_build_object(
      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                       'total', q.total, 'criado_em', q.created_at)
                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                     FROM (SELECT q1.* FROM public.quotes q1
                           WHERE q1.entity_id = p_entity_id AND q1.organization_id = p_organization_id
                             AND q1.deleted_at IS NULL AND q1.negocio_id IS NULL
                           ORDER BY q1.created_at DESC, q1.id DESC LIMIT 50) q),
      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                      'criado_em', pr.created_at)
                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                    FROM (SELECT p1.* FROM public.proposals p1
                          WHERE p1.entity_id = p_entity_id AND p1.organization_id = p_organization_id
                            AND p1.deleted_at IS NULL AND p1.is_deleted IS NOT TRUE AND p1.negocio_id IS NULL
                          ORDER BY p1.created_at DESC, p1.id DESC LIMIT 50) pr),
      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                      'criado_em', cc.created_at,
                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                    FROM (SELECT c1.* FROM public.client_contracts c1
                          WHERE c1.entity_id = p_entity_id AND c1.organization_id = p_organization_id
                            AND c1.deleted_at IS NULL AND c1.negocio_id IS NULL
                          ORDER BY c1.created_at DESC, c1.id DESC LIMIT 50) cc));
  END IF;

  v_res := jsonb_build_object(
    'pessoa', v_pessoa,
    'lead', v_lead_j,
    'leads_abertas', v_abertas,
    'agregados', v_agreg,
    'permissoes', v_perm,
    'negocios', v_negocios,
    'documentos_por_ligar', v_docs,
    'contactos', CASE WHEN p_partes IS NULL OR 'contactos' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'contactos', p_limite,
                                              p_depois -> 'contactos') END,
    'visitas', CASE WHEN p_partes IS NULL OR 'visitas' = ANY (p_partes) THEN
                 public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'visitas', p_limite,
                                            p_depois -> 'visitas') END,
    'levantamentos', CASE WHEN p_partes IS NULL OR 'levantamentos' = ANY (p_partes) THEN
                       public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'levantamentos', p_limite,
                                                  p_depois -> 'levantamentos') END,
    'atividade', CASE WHEN p_partes IS NULL OR 'atividade' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'atividade', p_limite,
                                              p_depois -> 'atividade') END);

  -- Repõe a marca: as guardas só ficam dispensadas durante esta chamada.
  PERFORM set_config('app.neg_ficha_verificada', '', true);
  RETURN v_res;
END;
$function$;

-- Privilégios das substituídas: os de antes (CREATE OR REPLACE mantém-nos;
-- o CONFERIR confirma que continuam sem PUBLIC nem anon).

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  c_nike  CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_txt   text;
  v_r     jsonb;
  v_caso  text;
  v_casos text[] := ARRAY[
    'null', '{}', '[]', '[1]',
    '[{"titulo": ""}]',
    '[{"titulo": "A", "x": 1}]',
    '[{"titulo": "' || repeat('a', 81) || '"}]',
    '[{"titulo": "A\u0001"}]',
    '[{"titulo": "A", "aba": "outra"}]',
    '[{"titulo": "A", "especial": "fotos"}]',
    '[{"titulo": "A", "activa": "sim"}]',
    '[{"titulo": "A", "id": "nao-e-uuid"}]',
    '[{"titulo": "A", "ref": "com-hifen"}]',
    '[{"titulo": "A", "ref": "r1"}, {"titulo": "B", "ref": "r1"}]',
    '[{"titulo": "A", "perguntas": {}}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "data"}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "escolha_unica", "opcoes": [{"texto": "a"}]}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "texto", "opcoes": [{"texto": "a"}, {"texto": "b"}]}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "texto", "numero": {"min": 1}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "numero", "texto_max": 10}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "numero", "numero": {"casas": 4}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "numero", "numero": {"min": 5, "max": 1}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "numero", "numero": {"min": 0.0001}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "texto", "texto_max": 2001}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "texto", "depende": {"pergunta": "r1", "opcoes": []}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "texto", "depende": {"opcoes": ["o1"]}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "P", "tipo": "texto", "depende": {"pergunta": "r1", "opcoes": [null]}}]}]',
    '[{"titulo": "A", "perguntas": [{"texto": "", "tipo": "texto"}]}]'];
BEGIN
  -- 1. Atributos e privilégios das funções novas e substituídas.
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.neg_guardar_questionario(uuid,integer,jsonb)',  true,  'v', true),
              ('public.neg_questionario_levantamento(uuid,boolean)',   false, 's', true),
              ('public.neg_guardar_levantamento(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid)', false, 'v', true),
              ('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)', false, 's', true),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])',  false, 's', true),
              ('public.fn_neg_questionario_normalizar(jsonb)',         false, 'i', false),
              ('public.fn_neg_questionario_texto(jsonb,integer,boolean,text)', false, 'i', false),
              ('public.fn_neg_questionario_numero(jsonb,text)',        false, 'i', false),
              ('public.fn_neg_questionario_booleano(jsonb,boolean,text)', false, 'i', false),
              ('public.fn_neg_questionario_ident(jsonb,text,text)',    false, 'i', false),
              ('public.fn_neg_questionario_objecto(jsonb,text[],text)', false, 'i', false)
            ) AS e(sig, definer, vol, autenticado)
            LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef <> e.definer
               OR p.provolatile::text <> e.vol
               OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres'
               OR array_to_string(p.proconfig, ',') NOT LIKE 'search_path=public, pg_temp%'
               OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
               OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') <> e.autenticado
               OR (NOT e.autenticado AND pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))
               OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
                          WHERE a.grantee = 0));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. atributos ou privilégios): %', v_txt;
  END IF;
  IF pg_catalog.has_function_privilege('service_role', 'public.neg_guardar_questionario(uuid,integer,jsonb)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.neg_questionario_levantamento(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR (1. service_role nas funções novas)';
  END IF;

  -- 2. As substituídas são as desta migration.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = 'public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)'::regprocedure
                   AND p.prosrc LIKE '%''valor_numero'', lr.valor_numero%'
                   AND p.prosrc LIKE '%ORDER BY lr.ordem NULLS LAST, lr.seccao, lr.pergunta%'
                   AND p.prosrc LIKE '%''cancelada'', s.status = ''cancelled''::public.schedule_item_status%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                    WHERE p.oid = 'public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])'::regprocedure
                      AND p.prosrc LIKE '%''qualificacao_respostas''%'
                      AND p.prosrc LIKE '%lr.levantamento_id = ql.id%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                    WHERE p.oid = 'public.neg_guardar_levantamento(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid)'::regprocedure
                      AND p.prosrc LIKE '%pg_advisory_xact_lock_shared%'
                      AND p.prosrc LIKE '%''versao_questionario'', v_versao%'
                      AND p.prosrc NOT LIKE '%r.valor ->> ''seccao'', r.pergunta%') THEN
    RAISE EXCEPTION 'CONFERIR (2. versões das funções substituídas)';
  END IF;

  -- 3. Normalizar: uma forma válida passa, aparada e com omissões.
  v_r := public.fn_neg_questionario_normalizar(
    '[{"titulo": " Exterior ", "ref": "s1", "perguntas": [
        {"ref": "q1", "texto": "Acesso", "tipo": "escolha_unica",
         "opcoes": [{"ref": "o1", "texto": "Fácil"}, {"ref": "o2", "texto": " Difícil ", "activa": false}]},
        {"texto": "Área", "tipo": "numero", "bloco": " ", "numero": {"min": 0, "max": 500.5, "casas": 1, "unidade": "m²"},
         "depende": {"pergunta": "q1", "opcoes": ["o2"], "sem_resposta": true}},
        {"texto": "Notas", "tipo": "texto", "texto_max": 300.0}]}]'::jsonb);
  IF v_r -> 0 ->> 'titulo' IS DISTINCT FROM 'Exterior'
     OR (v_r -> 0 ->> 'activa')::boolean IS DISTINCT FROM true
     OR jsonb_array_length(v_r -> 0 -> 'perguntas') <> 3
     OR v_r -> 0 -> 'perguntas' -> 0 -> 'opcoes' -> 1 ->> 'texto' IS DISTINCT FROM 'Difícil'
     OR (v_r -> 0 -> 'perguntas' -> 0 -> 'opcoes' -> 1 ->> 'activa')::boolean IS DISTINCT FROM false
     OR v_r -> 0 -> 'perguntas' -> 1 ->> 'bloco' IS NOT NULL
     OR (v_r -> 0 -> 'perguntas' -> 1 ->> 'numero_max')::numeric IS DISTINCT FROM 500.5
     OR v_r -> 0 -> 'perguntas' -> 1 -> 'depende' IS DISTINCT FROM
        '{"pergunta": "q1", "opcoes": ["o2"], "sem_resposta": true}'::jsonb
     OR (v_r -> 0 -> 'perguntas' -> 2 ->> 'texto_max')::integer IS DISTINCT FROM 300 THEN
    RAISE EXCEPTION 'CONFERIR (3. normalização): %', v_r::text;
  END IF;

  -- 4. Normalizar: cada forma inválida dá NG009.
  FOREACH v_caso IN ARRAY v_casos
  LOOP
    BEGIN
      PERFORM public.fn_neg_questionario_normalizar(v_caso::jsonb);
      RAISE EXCEPTION 'CONFERIR (4. forma inválida passou): %', left(v_caso, 120);
    EXCEPTION WHEN SQLSTATE 'NG009' THEN
      NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.fn_neg_questionario_normalizar(
      (SELECT jsonb_agg(jsonb_build_object('titulo', 'S' || g::text)) FROM generate_series(1, 21) AS g));
    RAISE EXCEPTION 'CONFERIR (4. 21 secções passaram)';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;
  BEGIN
    PERFORM public.fn_neg_questionario_normalizar(jsonb_build_array(jsonb_build_object('titulo', 'A',
      'perguntas', (SELECT jsonb_agg(jsonb_build_object('texto', 'P' || g::text, 'tipo', 'texto'))
                    FROM generate_series(1, 151) AS g))));
    RAISE EXCEPTION 'CONFERIR (4. 151 perguntas passaram)';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;

  -- 5. Gravar o questionário: valores primeiro (NG009), depois sessão (42501).
  BEGIN
    PERFORM public.neg_guardar_questionario(c_nike, 1, '[]'::jsonb);
    RAISE EXCEPTION 'CONFERIR (5. forma inválida sem NG009)';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;
  BEGIN
    PERFORM public.neg_guardar_questionario(c_nike, 1, '[{"titulo": "A"}]'::jsonb);
    RAISE EXCEPTION 'CONFERIR (5. sem sessão não recusou)';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 6. Ler o questionário da nike (a migration é dona: sem RLS).
  v_r := public.neg_questionario_levantamento(c_nike, false);
  IF (v_r ->> 'versao')::integer <> 1
     OR jsonb_array_length(v_r -> 'seccoes') <> 8
     OR (SELECT sum(jsonb_array_length(s.value -> 'perguntas')) FROM jsonb_array_elements(v_r -> 'seccoes') AS s) <> 36
     OR (SELECT sum(jsonb_array_length(p.value -> 'opcoes'))
         FROM jsonb_array_elements(v_r -> 'seccoes') AS s
         CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') AS p) <> 109
     OR (SELECT p.value -> 'depende'
         FROM jsonb_array_elements(v_r -> 'seccoes') AS s
         CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') AS p
         WHERE p.value ->> 'chave' = 'tipologia')
        - 'pergunta_id' IS DISTINCT FROM
        '{"pergunta_chave": "tipoEspaco", "opcoes": ["casa"], "sem_resposta": true}'::jsonb
     OR v_r -> 'seccoes' -> 0 ->> 'chave' IS DISTINCT FROM 'visitas'
     OR v_r -> 'seccoes' -> 7 ->> 'chave' IS DISTINCT FROM 'qualificacao' THEN
    RAISE EXCEPTION 'CONFERIR (6. leitura do questionário da nike)';
  END IF;
  BEGIN
    PERFORM public.neg_questionario_levantamento(c_nike, true);
    RAISE EXCEPTION 'CONFERIR (6. inactivas sem pessoas.config não recusou)';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.neg_questionario_levantamento(NULL, false);
    RAISE EXCEPTION 'CONFERIR (6. organização nula sem NG009)';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;

  -- 7. Gravar levantamento: forma de resposta inválida recusa antes de
  --    qualquer leitura ou escrita.
  FOREACH v_caso IN ARRAY ARRAY[
    '{"acesso": {"escolhas": "facil"}}',
    '{"acesso": {"escolhas": []}}',
    '{"acesso": {"escolhas": [1]}}',
    '{"acesso": {"resposta": "facil", "texto": "x"}}',
    '{"acesso": {"seccao": "exterior"}}',
    '{"acesso": {"numero": "3"}}',
    '{"acesso": {"texto": 3}}',
    '{"acesso": {"outra": 1}}',
    '{"Acesso": {"escolhas": ["facil"]}}',
    '{"acesso": "facil"}']
  LOOP
    BEGIN
      PERFORM public.neg_guardar_levantamento(gen_random_uuid(), c_nike, gen_random_uuid(),
        '{"data_levantamento": "2026-10-20"}'::jsonb, '[]'::jsonb, v_caso::jsonb, NULL);
      RAISE EXCEPTION 'CONFERIR (7. resposta inválida passou): %', v_caso;
    EXCEPTION WHEN SQLSTATE 'NG009' THEN
      NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.neg_guardar_levantamento(gen_random_uuid(), c_nike, gen_random_uuid(),
      '{"data_levantamento": "2026-10-20", "versao_questionario": "x"}'::jsonb, '[]'::jsonb, '{}'::jsonb, NULL);
    RAISE EXCEPTION 'CONFERIR (7. versão do questionário inválida passou)';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;

  -- 8. Nenhum questionário fora da nike; a nike continua na versão 1.
  IF (SELECT count(*) FROM public.levantamento_questionario) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.levantamento_questionario q
                    WHERE q.organization_id = c_nike AND q.versao = 1) THEN
    RAISE EXCEPTION 'CONFERIR (8. questionários)';
  END IF;
END
$conferir$;

COMMIT;
