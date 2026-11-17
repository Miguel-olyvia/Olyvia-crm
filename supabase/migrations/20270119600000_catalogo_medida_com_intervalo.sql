-- =============================================================================
-- Catálogo — a MEDIDA de um produto passa a aceitar, em cada dimensão, um número OU um INTERVALO (de X a Y).
-- Base de RH (uetjghdkwbywbftedtth). Sem tabelas, colunas nem dados novos: só funções.
-- =============================================================================
--
-- O valor guardado (product_attribute_values.value_json de um atributo is_measurement):
--   {"tipo":"2D"|"3D", "largura":D, "comprimento":D, "espessura":D|null, "unidade":"cm"|"mm"}
--   D = um número JSON (como até agora)  OU  {"de": n1, "ate": n2} com n1 < n2.
--   Cada número (o próprio D, ou n1 e n2) segue as regras de fn_cat_dimensao: > 0, até 100000, no máximo 3 casas
--   decimais (guardado sem zeros à direita). A espessura só conta no 3D (no 2D fica null, como até agora).
--   Os valores que já existem (só números) continuam válidos e NÃO mudam: lidos, escritos e com o mesmo SKU.
--
-- Referência (SKU): o intervalo escreve-se <de>A<ate>, com as regras do número (ponto → P).
--   Largura 91–100 e comprimento 90 → 91A100X90; 7.5–8 × 30 em mm → 7P5A8X30MM.
--   Dois produtos com o mesmo intervalo dão o mesmo segmento → o mesmo SKU → «duplicado» (cat_gerar_sku_produto e
--   cat_prever_sku_modelo comparam o SKU; não precisam de mudar).
-- Texto: o value_text gravado passa a «91–100 × 90 cm» (traço «–», U+2013); fn_cat_medida_texto (o resumo da lista
--   paginada) dá «91–100×90 cm», com o separador «×» sem espaços que já usava para os números («70×70 cm»).
--
-- Recusas (CT002, mensagem em português, ao gravar com cat_guardar_produto_atributos):
--   «No intervalo da largura, o início (100) tem de ser menor que o fim (91).»   (de >= ate)
--   «No intervalo da largura falta o fim («ate»).» / «… falta o início («de»).»
--   «O intervalo da largura só leva «de» e «ate».»                                (outras chaves)
--   «O início da largura tem de ser um número maior que zero.» (e as outras regras de fn_cat_dimensao, com o sujeito
--   «O início da largura» / «O fim da largura»)
--   Um número continua com as mensagens de sempre («A largura tem de ser um número maior que zero.», …).
-- Na PRÉ-VISUALIZAÇÃO (cat_prever_sku_modelo) uma medida inválida não dá erro, como até agora: o segmento fica de fora
-- e a falta «medida:<código>» aparece.
--
-- Funções (versão anterior → esta):
--   fn_cat_medida_ler(jsonb,text)            20270117500000 → aceita o intervalo e devolve-o {de, ate} (só estas chaves)
--   fn_cat_sku_medida(jsonb)                 20270118000000 → <de>A<ate>
--   fn_cat_medida_texto(jsonb)               20270118500000 → «91–100×90 cm»
--   cat_guardar_produto_atributos(uuid,uuid,jsonb) 20270117600000 → valida e grava o intervalo; value_text com «–»
--   NOVAS internas (só ao gravar): fn_cat_dimensao_medida(jsonb,text), fn_cat_dimensao_texto(jsonb).
--   Sem mudança (passam o intervalo por estas acima): fn_cat_dimensao, cat_ler_atributos, cat_ler_atributos_produto,
--   cat_gerar_sku_produto, cat_prever_sku_modelo, cat_prever_sku, fn_cat_sku_partes, cat_ler_produtos_pagina.
--
-- Desempenho: fn_cat_medida_ler, fn_cat_sku_medida e fn_cat_medida_texto correm uma vez por valor em cada leitura
-- (cat_ler_atributos lê os 14 328 da Mudelar). Não chamam funções auxiliares (cada chamada a uma função com SET
-- search_path custa, nunca é expandida em linha), e fn_cat_medida_ler e fn_cat_medida_texto passam de LANGUAGE sql a
-- plpgsql: uma função SQL não expandida volta a preparar o corpo inteiro em cada chamada, e o corpo com o intervalo
-- ficava duas vezes mais lento; em plpgsql as expressões preparam-se uma vez por sessão. Medido a 17/11 sobre os
-- 14 328 valores da Mudelar (BEGIN … ROLLBACK, só leitura): ler 220 ms → 115 ms; texto (com o ler) 900 ms → 195 ms;
-- os mesmos resultados nos 14 328. Assinatura, IMMUTABLE, search_path e acessos ficam iguais.
--
-- Guarda: o corpo aplicado de cada função recriada (e das que dependem dela sem mudar) tem de ser o lido no remoto a
-- 17/11 (md5 do prosrc); senão recusa. Só CREATE OR REPLACE: assinaturas, volatilidade, SECURITY DEFINER,
-- search_path e acessos iguais aos vivos (LANGUAGE: ver Desempenho). As novas são internas (sem EXECUTE para PUBLIC, anon, authenticated).
--
-- O ECRÃ: até o ecrã saber mostrar e editar o intervalo (src/emylia/atributosTexto.ts textoMedida e o editor da
-- medida), só a base aceita intervalos; nenhum produto atual muda. Um produto gravado com intervalo apareceria no ecrã
-- atual com o texto errado («[object Object]») — publicar o ecrã antes de se começar a gravar intervalos.
-- Teste: supabase/tests/catalogo_medida_com_intervalo.test.sql (passo 0 falha ANTES desta migration).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_txt text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.fn_cat_medida_ler(jsonb,text)',                         '96f4d8551e1690094370d4fc4ddb79a6'),
      ('public.fn_cat_sku_medida(jsonb)',                              'f37619cf904190dc319ce75f082d8337'),
      ('public.fn_cat_medida_texto(jsonb)',                            '70336339ca5b3f087c8db4ebe80191cb'),
      ('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)',        'a4492b35c1856494ddbbac2e65e8b7b9'),
      -- não mudam, mas esta migration conta com o corpo que têm
      ('public.fn_cat_dimensao(jsonb,text)',                           '7cb75c1ecb424b9fe213114e66118f10'),
      ('public.fn_cat_num_texto(numeric)',                             '9defb626f49b5c275ba2e307299c556d'),
      ('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',               '35f20ab07322d3cace1c94a97c1289b9'),
      ('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)', 'ca264514ef73bbe0ae048e79daef407c'),
      ('public.cat_gerar_sku_produto(uuid,uuid,boolean)',              'f4873274998614a326c4572ee195ddd7')
    ) AS t(sig, md5) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'Falta a função %: rever esta migration.', r.sig;
    END IF;
    IF (SELECT md5(pr.prosrc) FROM pg_proc pr WHERE pr.oid = to_regprocedure(r.sig)::oid) IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '% não é a versão esperada (md5 %, esperado %): rever esta migration.',
        r.sig, (SELECT md5(pr.prosrc) FROM pg_proc pr WHERE pr.oid = to_regprocedure(r.sig)::oid), r.md5;
    END IF;
  END LOOP;

  -- nenhuma outra versão (outra assinatura) das recriadas, e as novas ainda não existem
  SELECT string_agg(pr.oid::regprocedure::text, ', ') INTO v_txt FROM pg_proc pr
  WHERE pr.pronamespace = 'public'::regnamespace
    AND (   (pr.proname = 'fn_cat_medida_ler' AND pg_get_function_identity_arguments(pr.oid) <> 'p_json jsonb, p_unit text')
         OR (pr.proname = 'fn_cat_sku_medida' AND pg_get_function_identity_arguments(pr.oid) <> 'p_medida jsonb')
         OR (pr.proname = 'fn_cat_medida_texto' AND pg_get_function_identity_arguments(pr.oid) <> 'p_medida jsonb')
         OR (pr.proname = 'cat_guardar_produto_atributos'
             AND pg_get_function_identity_arguments(pr.oid) <> 'p_org uuid, p_produto uuid, p_valores jsonb')
         OR pr.proname IN ('fn_cat_dimensao_medida', 'fn_cat_dimensao_texto'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. Internas novas ──────────────────────────────────────────────────────────
-- Uma dimensão ao GRAVAR: um número (as regras e as mensagens de fn_cat_dimensao, devolvido sem zeros à direita) ou um
-- intervalo {"de": n1, "ate": n2} (cada um com as mesmas regras e n1 < n2), devolvido {"de": n1, "ate": n2}.
-- p_nome é o sujeito da mensagem («A largura», «O comprimento», «A espessura»). Recusas: CT002.
CREATE OR REPLACE FUNCTION public.fn_cat_dimensao_medida(p_valor jsonb, p_nome text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_de_nome text := 'd' || lower(p_nome);   -- «da largura», «do comprimento», «da espessura»
  v_de numeric; v_ate numeric;
BEGIN
  IF jsonb_typeof(p_valor) IS DISTINCT FROM 'object' THEN
    RETURN to_jsonb(public.fn_cat_dimensao(p_valor, p_nome));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_valor) k WHERE k NOT IN ('de', 'ate')) THEN
    RAISE EXCEPTION 'O intervalo % só leva «de» e «ate».', v_de_nome USING ERRCODE = 'CT002';
  END IF;
  IF coalesce(p_valor -> 'de', 'null'::jsonb) = 'null'::jsonb THEN
    RAISE EXCEPTION 'No intervalo % falta o início («de»).', v_de_nome USING ERRCODE = 'CT002';
  END IF;
  IF coalesce(p_valor -> 'ate', 'null'::jsonb) = 'null'::jsonb THEN
    RAISE EXCEPTION 'No intervalo % falta o fim («ate»).', v_de_nome USING ERRCODE = 'CT002';
  END IF;
  v_de := public.fn_cat_dimensao(p_valor -> 'de', 'O início ' || v_de_nome);
  v_ate := public.fn_cat_dimensao(p_valor -> 'ate', 'O fim ' || v_de_nome);
  IF v_de >= v_ate THEN
    RAISE EXCEPTION 'No intervalo %, o início (%) tem de ser menor que o fim (%).', v_de_nome,
      public.fn_cat_num_texto(v_de), public.fn_cat_num_texto(v_ate) USING ERRCODE = 'CT002';
  END IF;
  RETURN jsonb_build_object('de', v_de, 'ate', v_ate);
END $$;

-- Uma dimensão escrita: «0,9» ou «91–100» (traço U+2013). NULL se não for número nem intervalo.
CREATE OR REPLACE FUNCTION public.fn_cat_dimensao_texto(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN jsonb_typeof(p) = 'number' THEN public.fn_cat_num_texto((p #>> '{}')::numeric)
    WHEN jsonb_typeof(p) = 'object' AND jsonb_typeof(p -> 'de') = 'number' AND jsonb_typeof(p -> 'ate') = 'number'
    THEN public.fn_cat_num_texto((p ->> 'de')::numeric) || '–' || public.fn_cat_num_texto((p ->> 'ate')::numeric)
  END
$$;

REVOKE ALL ON FUNCTION public.fn_cat_dimensao_medida(jsonb,text), public.fn_cat_dimensao_texto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_dimensao_medida(jsonb,text), public.fn_cat_dimensao_texto(jsonb) TO service_role;

-- ─── 2. Ler a medida (20270117500000 + intervalo) ───────────────────────────────
-- A medida guardada (value_json + unit) no formato do ecrã; NULL se não for uma medida 2D/3D válida. Cada dimensão:
-- o número tal como está, ou {de, ate} (só estas duas chaves) se as duas forem números. Só a forma: as regras
-- (> 0, …, de < ate) verificam-se ao gravar e no SKU. Para os números o resultado é exatamente o de 20270117500000
-- (no 3D, uma espessura que não seja número nem intervalo fica null, como antes).
CREATE OR REPLACE FUNCTION public.fn_cat_medida_ler(p_json jsonb, p_unit text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270119600000: cada dimensão pode ser um número ou um intervalo {de, ate}; plpgsql (ver Desempenho)
  v_tipo text; v_l jsonb; v_c jsonb; v_e jsonb;
BEGIN
  IF jsonb_typeof(p_json) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  v_tipo := p_json ->> 'tipo';
  IF v_tipo IS NULL OR v_tipo NOT IN ('2D', '3D') THEN RETURN NULL; END IF;

  v_l := p_json -> 'largura';
  IF jsonb_typeof(v_l) = 'object' THEN
    v_l := CASE WHEN jsonb_typeof(v_l -> 'de') = 'number' AND jsonb_typeof(v_l -> 'ate') = 'number'
                THEN jsonb_build_object('de', v_l -> 'de', 'ate', v_l -> 'ate') END;
  ELSIF jsonb_typeof(v_l) IS DISTINCT FROM 'number' THEN
    RETURN NULL;
  END IF;
  IF v_l IS NULL THEN RETURN NULL; END IF;

  v_c := p_json -> 'comprimento';
  IF jsonb_typeof(v_c) = 'object' THEN
    v_c := CASE WHEN jsonb_typeof(v_c -> 'de') = 'number' AND jsonb_typeof(v_c -> 'ate') = 'number'
                THEN jsonb_build_object('de', v_c -> 'de', 'ate', v_c -> 'ate') END;
  ELSIF jsonb_typeof(v_c) IS DISTINCT FROM 'number' THEN
    RETURN NULL;
  END IF;
  IF v_c IS NULL THEN RETURN NULL; END IF;

  IF v_tipo = '3D' THEN
    v_e := p_json -> 'espessura';
    IF jsonb_typeof(v_e) = 'object' THEN
      v_e := CASE WHEN jsonb_typeof(v_e -> 'de') = 'number' AND jsonb_typeof(v_e -> 'ate') = 'number'
                  THEN jsonb_build_object('de', v_e -> 'de', 'ate', v_e -> 'ate') END;
    ELSIF jsonb_typeof(v_e) IS DISTINCT FROM 'number' THEN
      v_e := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object('tipo', v_tipo, 'largura', v_l, 'comprimento', v_c, 'espessura', v_e,
                            'unidade', coalesce(nullif(p_json ->> 'unidade', ''), nullif(p_unit, ''), 'cm'));
END $$;

-- ─── 3. A medida no SKU (20270118000000 + intervalo) ────────────────────────────
-- 60X30, 60X30X2, 7P5X30, 91A100X90 (intervalo = <de>A<ate>), «MM» no fim se for em mm. NULL se não for uma medida
-- válida: as regras de fn_cat_dimensao (> 0, até 100000, no máximo 3 casas decimais) em cada número; no intervalo
-- de < ate; 3D precisa da espessura. Os limites são verificados ANTES de escrever o número (1e100000 não chega a
-- virar texto).
CREATE OR REPLACE FUNCTION public.fn_cat_sku_medida(p_medida jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270119600000: cada dimensão é um número ou um intervalo {de, ate} → <de>A<ate>
  c_max constant numeric := 100000;
  c_casas constant integer := 3;
  v_m jsonb; v_nome text; v_d jsonb; v_el jsonb; v numeric; v_ant numeric; v_seg text; v_txt text[] := '{}';
BEGIN
  v_m := public.fn_cat_medida_ler(p_medida, NULL);
  IF v_m IS NULL THEN RETURN NULL; END IF;
  FOREACH v_nome IN ARRAY (CASE WHEN v_m ->> 'tipo' = '3D' THEN ARRAY['largura', 'comprimento', 'espessura']
                                ELSE ARRAY['largura', 'comprimento'] END) LOOP
    v_d := v_m -> v_nome;
    v_seg := NULL; v_ant := NULL;
    -- um número, ou o início e o fim do intervalo (fn_cat_medida_ler só deixa passar estas duas formas)
    FOREACH v_el IN ARRAY (CASE WHEN jsonb_typeof(v_d) = 'object' THEN ARRAY[v_d -> 'de', v_d -> 'ate'] ELSE ARRAY[v_d] END) LOOP
      IF jsonb_typeof(v_el) IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
      v := (v_el #>> '{}')::numeric;
      IF v <= 0 OR v > c_max THEN RETURN NULL; END IF;
      v := trim_scale(v);
      IF scale(v) > c_casas THEN RETURN NULL; END IF;
      IF v_ant IS NOT NULL AND v_ant >= v THEN RETURN NULL; END IF;   -- intervalo: de < ate
      v_seg := (CASE WHEN v_seg IS NULL THEN '' ELSE v_seg || 'A' END) || replace(v::text, '.', 'P');
      v_ant := v;
    END LOOP;
    v_txt := array_append(v_txt, v_seg);
  END LOOP;
  RETURN array_to_string(v_txt, 'X') || (CASE WHEN lower(v_m ->> 'unidade') = 'mm' THEN 'MM' ELSE '' END);
END $$;

-- ─── 4. O texto da medida na lista paginada (20270118500000 + intervalo) ────────
-- textoMedida do ecrã sobre o formato de fn_cat_medida_ler: «70×70 cm», «12,5×25×0,8 mm», «91–100×90 cm» (a espessura
-- só no 3D). NULL se não for uma medida. Cada número escreve-se como fn_cat_num_texto (sem zeros a mais, vírgula).
CREATE OR REPLACE FUNCTION public.fn_cat_medida_texto(p_medida jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270119600000: cada dimensão é um número («0,9») ou um intervalo («91–100», traço U+2013); plpgsql (ver Desempenho)
  v_nome text; v_d jsonb; v_seg text; v_txt text[] := '{}';
BEGIN
  IF p_medida IS NULL OR jsonb_typeof(p_medida) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  FOREACH v_nome IN ARRAY (CASE WHEN p_medida ->> 'tipo' = '3D' THEN ARRAY['largura', 'comprimento', 'espessura']
                                ELSE ARRAY['largura', 'comprimento'] END) LOOP
    v_d := p_medida -> v_nome;
    v_seg := CASE jsonb_typeof(v_d)
               WHEN 'number' THEN replace(trim_scale((v_d #>> '{}')::numeric)::text, '.', ',')
               WHEN 'object' THEN replace(trim_scale((v_d ->> 'de')::numeric)::text, '.', ',') || '–'
                                  || replace(trim_scale((v_d ->> 'ate')::numeric)::text, '.', ',')
             END;
    IF v_seg IS NULL THEN
      IF v_nome = 'espessura' THEN EXIT; END IF;   -- 3D sem espessura: só largura × comprimento, como antes
      RETURN NULL;
    END IF;
    v_txt := array_append(v_txt, v_seg);
  END LOOP;
  RETURN array_to_string(v_txt, '×') || ' ' || (p_medida ->> 'unidade');
END $$;

-- ─── 5. Gravar os valores de um produto (20270117600000 + intervalo) ────────────
-- Corpo copiado da versão aplicada (20270117600000); as ÚNICAS diferenças: v_l, v_c, v_e passam a jsonb e vêm de
-- fn_cat_dimensao_medida (número ou intervalo), e o texto de cada dimensão vem de fn_cat_dimensao_texto. Para os
-- números o value_text e o value_json gravados são exatamente os de antes.
CREATE OR REPLACE FUNCTION public.cat_guardar_produto_atributos(p_org uuid, p_produto uuid, p_valores jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_valores constant integer := 50;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_tipo_cat text;
  v_el jsonb; v_i bigint;
  v_attr uuid; a record;
  v_opc jsonb; v_med jsonb; v_opc_id uuid; v_grupo uuid; v_ativa boolean; v_txt text;
  -- 20270119600000: cada dimensão é um número ou um intervalo {de, ate} (jsonb)
  v_tipo text; v_uni text; v_l jsonb; v_c jsonb; v_e jsonb;
  v_attrs uuid[] := '{}'; v_txts text[] := '{}'; v_jsons jsonb[] := '{}'; v_units text[] := '{}';
BEGIN
  IF p_valores IS NULL OR jsonb_typeof(p_valores) <> 'array' THEN
    RAISE EXCEPTION 'Os atributos têm de vir numa lista (uma lista vazia tira todos).' USING ERRCODE = 'CT002';
  END IF;
  IF jsonb_array_length(p_valores) > c_max_valores THEN
    RAISE EXCEPTION 'No máximo 50 atributos por produto.' USING ERRCODE = 'CT002';
  END IF;

  SELECT p.tipo_catalogo INTO v_tipo_cat FROM products p
  WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.is_deleted FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF v_tipo_cat IS DISTINCT FROM 'produto' THEN
    RAISE EXCEPTION '%', CASE WHEN v_tipo_cat = 'consumivel' THEN 'Os consumíveis não têm atributos: só os produtos.'
                              ELSE 'Este artigo não é um produto do Catálogo: não tem atributos.' END
      USING ERRCODE = 'CT002';
  END IF;

  FOR v_el, v_i IN SELECT t.e, t.i FROM jsonb_array_elements(p_valores) WITH ORDINALITY AS t(e, i) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR coalesce(v_el ->> 'atributo', '') !~ c_uuid THEN
      RAISE EXCEPTION 'O valor n.º % não diz qual é o atributo.', v_i USING ERRCODE = 'CT002';
    END IF;
    v_attr := (v_el ->> 'atributo')::uuid;
    SELECT pa.id, pa.label, pa.is_measurement, pa.unit INTO a FROM product_attributes pa
    WHERE pa.id = v_attr AND pa.organization_id = p_org AND pa.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    IF v_attr = ANY (v_attrs) THEN
      RAISE EXCEPTION 'O atributo «%» vem mais de uma vez: um produto tem uma só opção em cada atributo.', a.label USING ERRCODE = 'CT002';
    END IF;
    v_opc := nullif(v_el -> 'opcao', 'null'::jsonb);
    v_med := nullif(v_el -> 'medida', 'null'::jsonb);
    IF v_opc IS NOT NULL AND v_med IS NOT NULL THEN
      RAISE EXCEPTION 'O atributo «%» tem de levar uma opção ou uma medida, não as duas.', a.label USING ERRCODE = 'CT002';
    END IF;

    IF a.is_measurement THEN
      -- ─ medida ─
      IF v_opc IS NOT NULL THEN
        RAISE EXCEPTION 'A «%» não tem opções: escreva as medidas.', a.label USING ERRCODE = 'CT002';
      END IF;
      IF v_med IS NULL OR jsonb_typeof(v_med) <> 'object' THEN
        RAISE EXCEPTION 'Falta a medida em «%».', a.label USING ERRCODE = 'CT002';
      END IF;
      v_tipo := upper(btrim(coalesce(v_med ->> 'tipo', '')));
      IF v_tipo NOT IN ('2D', '3D') THEN
        RAISE EXCEPTION 'A medida tem de ser 2D ou 3D.' USING ERRCODE = 'CT002';
      END IF;
      v_uni := lower(btrim(coalesce(nullif(v_med ->> 'unidade', ''), a.unit, 'cm')));
      IF v_uni NOT IN ('cm', 'mm') THEN
        RAISE EXCEPTION 'A unidade da medida tem de ser cm ou mm.' USING ERRCODE = 'CT002';
      END IF;
      v_l := public.fn_cat_dimensao_medida(v_med -> 'largura', 'A largura');
      v_c := public.fn_cat_dimensao_medida(v_med -> 'comprimento', 'O comprimento');
      v_e := CASE WHEN v_tipo = '3D' THEN public.fn_cat_dimensao_medida(v_med -> 'espessura', 'A espessura') END;  -- 2D: a espessura não conta
      v_attrs := array_append(v_attrs, v_attr);
      v_txts := array_append(v_txts, public.fn_cat_dimensao_texto(v_l) || ' × ' || public.fn_cat_dimensao_texto(v_c)
                           || CASE WHEN v_e IS NULL THEN '' ELSE ' × ' || public.fn_cat_dimensao_texto(v_e) END || ' ' || v_uni);
      v_jsons := array_append(v_jsons, jsonb_build_object('tipo', v_tipo, 'largura', v_l, 'comprimento', v_c, 'espessura', v_e, 'unidade', v_uni));
      v_units := array_append(v_units, v_uni);
    ELSE
      -- ─ opção ─
      IF v_med IS NOT NULL THEN
        RAISE EXCEPTION 'O atributo «%» não é uma medida: escolha uma opção.', a.label USING ERRCODE = 'CT002';
      END IF;
      IF v_opc IS NULL OR jsonb_typeof(v_opc) <> 'string' OR (v_opc #>> '{}') !~ c_uuid THEN
        RAISE EXCEPTION 'Falta a opção em «%».', a.label USING ERRCODE = 'CT002';
      END IF;
      v_opc_id := (v_opc #>> '{}')::uuid;
      v_grupo := public.fn_cat_grupo_do_atributo(v_attr, p_org);
      SELECT o.value_text::text, o.is_active INTO v_txt, v_ativa FROM attribute_option_group_values o
      WHERE o.id = v_opc_id AND o.group_id = v_grupo FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A opção escolhida não pertence ao atributo «%».', a.label USING ERRCODE = 'CT002';
      END IF;
      -- uma opção desativada só passa se já for a que o produto tem (reenviar o conjunto não rebenta)
      IF NOT v_ativa AND NOT EXISTS (SELECT 1 FROM product_attribute_values x
                                     WHERE x.product_id = p_produto AND x.attribute_id = v_attr AND x.value_text = v_txt) THEN
        RAISE EXCEPTION 'A opção «%» está desativada.', v_txt USING ERRCODE = 'CT002';
      END IF;
      v_attrs := array_append(v_attrs, v_attr);
      v_txts := array_append(v_txts, v_txt);
      v_jsons := array_append(v_jsons, NULL::jsonb);
      v_units := array_append(v_units, NULL::text);
    END IF;
  END LOOP;

  -- só os atributos activos da organização: os valores de atributos apagados (ou de fora) ficam
  DELETE FROM product_attribute_values
  WHERE product_id = p_produto AND NOT (attribute_id = ANY (v_attrs))
    AND attribute_id IN (SELECT pa.id FROM product_attributes pa WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL);

  -- só escreve o que mudou (gravar duas vezes o mesmo não gera escrita nem auditoria)
  INSERT INTO product_attribute_values AS pav (product_id, attribute_id, value_text, value_json, unit)
  SELECT p_produto, x.a, x.t, x.j, x.u FROM unnest(v_attrs, v_txts, v_jsons, v_units) AS x(a, t, j, u)
  ON CONFLICT (product_id, attribute_id) DO UPDATE
    SET value_text = EXCLUDED.value_text, value_json = EXCLUDED.value_json, unit = EXCLUDED.unit,
        value_number = NULL, value_bool = NULL, value_date = NULL
    WHERE (pav.value_text, pav.value_json, pav.unit, pav.value_number, pav.value_bool, pav.value_date)
          IS DISTINCT FROM (EXCLUDED.value_text, EXCLUDED.value_json, EXCLUDED.unit, NULL::numeric, NULL::boolean, NULL::date);

  RETURN jsonb_build_object('ok', true, 'n', cardinality(v_attrs));
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_produto_atributos(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_produto_atributos(uuid,uuid,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_produto_atributos(uuid,uuid,jsonb) IS
  'Catálogo (20270117500000; intervalo em 20270119600000): substitui os valores de atributos de um produto (no máximo 50; uma opção por atributo de lista; a Medida 2D/3D em value_json, cada dimensão um número ou um intervalo {"de","ate"} com de < ate). Só apaga valores de atributos activos da organização. Permissão products.edit.';

-- ─── 6. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record;
BEGIN
  -- internas: search_path com pg_temp, nem PUBLIC nem anon nem authenticated
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_dimensao_medida(jsonb,text)', 'public.fn_cat_dimensao_texto(jsonb)',
                                'public.fn_cat_medida_ler(jsonb,text)', 'public.fn_cat_sku_medida(jsonb)',
                                'public.fn_cat_medida_texto(jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.provolatile::text AS vol INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não devia ser SECURITY DEFINER.', v_sig; END IF;
    IF p.vol <> 'i' THEN RAISE EXCEPTION 'Conferir: % não é IMMUTABLE.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: anon ou authenticated pode executar %.', v_sig;
    END IF;
  END LOOP;

  -- a pública: SECURITY DEFINER, search_path, authenticated sim, anon e PUBLIC não, os limites no corpo
  v_oid := to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')::oid;
  SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.prosrc INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
  IF NOT p.prosecdef OR p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig))
     OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
     OR has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto_atributos sem SECURITY DEFINER, search_path ou acessos esperados.';
  END IF;
  IF p.prosrc NOT LIKE '%c_max_valores constant integer := 50;%' OR p.prosrc NOT LIKE '%FOR NO KEY UPDATE%'
     OR p.prosrc NOT LIKE '%o.group_id = v_grupo FOR SHARE;%' OR p.prosrc NOT LIKE '%fn_cat_dimensao_medida(v_med -> ''largura''%' THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto_atributos sem os limites, o FOR SHARE ou o intervalo.';
  END IF;

  -- o comportamento (números iguais aos de antes; intervalo; as recusas ficam para o teste)
  IF public.fn_cat_medida_ler('{"tipo":"2D","largura":70,"comprimento":70,"espessura":null,"unidade":"cm"}'::jsonb, 'cm')
       IS DISTINCT FROM '{"tipo":"2D","largura":70,"comprimento":70,"espessura":null,"unidade":"cm"}'::jsonb
     OR public.fn_cat_medida_ler('{"tipo":"2D","largura":{"de":91,"ate":100,"x":1},"comprimento":90,"unidade":"cm"}'::jsonb, NULL)
       IS DISTINCT FROM '{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"espessura":null,"unidade":"cm"}'::jsonb
     OR public.fn_cat_medida_ler('{"tipo":"2D","largura":{"de":91},"comprimento":90}'::jsonb, NULL) IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":60,"comprimento":30}'::jsonb) IS DISTINCT FROM '60X30'
     OR public.fn_cat_sku_medida('{"tipo":"3D","largura":7.5,"comprimento":30,"espessura":2,"unidade":"mm"}'::jsonb) IS DISTINCT FROM '7P5X30X2MM'
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90}'::jsonb) IS DISTINCT FROM '91A100X90'
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":100,"ate":91},"comprimento":90}'::jsonb) IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"3D","largura":60,"comprimento":30,"espessura":{"de":1,"ate":2.5}}'::jsonb) IS DISTINCT FROM '60X30X1A2P5'
     OR public.fn_cat_sku_medida('{"tipo":"3D","largura":60,"comprimento":30}'::jsonb) IS NOT NULL
     OR public.fn_cat_medida_texto('{"tipo":"2D","largura":70,"comprimento":70,"unidade":"cm","espessura":null}'::jsonb) IS DISTINCT FROM '70×70 cm'
     OR public.fn_cat_medida_texto('{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.8,"unidade":"mm"}'::jsonb) IS DISTINCT FROM '12,5×25×0,8 mm'
     OR public.fn_cat_medida_texto('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"unidade":"cm"}'::jsonb) IS DISTINCT FROM '91–100×90 cm'
     OR public.fn_cat_medida_texto(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: fn_cat_medida_ler, fn_cat_sku_medida ou fn_cat_medida_texto não dão o esperado.';
  END IF;
  RAISE NOTICE 'catalogo_medida_com_intervalo: 2 funções novas e 4 recriadas (medida_ler, sku_medida, medida_texto, guardar_produto_atributos) conferidas.';
END $c$;

RESET lock_timeout;
