-- =============================================================================
-- Catálogo — a MEDIDA de um produto passa a aceitar também 1D: uma só dimensão, a dizer qual é.
-- Base de RH (uetjghdkwbywbftedtth). Sem tabelas, colunas nem dados novos: só funções.
-- Fase 1 de 4 da retirada do atributo de lista «Largura» (seguem: o editor na ficha, a migração dos produtos que têm
-- Largura, e retirar a Largura). Esta migration NÃO mexe em nenhum produto.
-- =============================================================================
--
-- O valor guardado (product_attribute_values.value_json de um atributo is_measurement):
--   1D (NOVO): {"tipo":"1D", "dimensao":"largura"|"altura"|"comprimento"|"espessura", "valor":D, "unidade":"cm"|"mm"}
--   2D/3D (iguais): {"tipo":"2D"|"3D", "largura":D, "comprimento":D, "espessura":D|null, "unidade":"cm"|"mm"}
--   D = um número  OU  {"de": n1, "ate": n2}.
--   Número: > 0, até 100000, no máximo 3 casas decimais (guardado sem zeros à direita).
--   Intervalo (NOVO, em qualquer dimensão de qualquer tipo): o início pode ser 0 («até 40 cm» = {"de":0,"ate":40});
--   de >= 0, ate > de; o resto das regras do número igual. Os valores existentes não mudam (nenhum tem de = 0: era
--   recusado).
--
-- Referência (SKU) do 1D: só o troço da dimensão, com as regras de sempre (ponto → P, intervalo <de>A<ate>, «MM» no
--   fim se for em mm), com prefixo pela dimensão: largura SEM prefixo, altura ALT, comprimento COMP, espessura ESP.
--   Largura 70 → 70; 100–105 → 100A105; altura 70 → ALT70; espessura 5,5 mm → ESP5P5MM; comprimento 76 → COMP76;
--   largura 0–40 → 0A40. Nenhum troço 1D tem «X» (o 2D/3D tem sempre), e só a largura começa por um algarismo: não
--   há colisões entre 1D, 2D e 3D nem entre dimensões. Duplicados: o mesmo valor 1D da mesma dimensão no mesmo modelo
--   dá o mesmo SKU → «duplicado» (cat_gerar_sku_produto e cat_prever_sku_modelo comparam o SKU).
-- Texto do 1D (o value_text gravado e fn_cat_medida_texto da lista paginada): «Largura 70 cm», «Largura 95–100 cm»,
--   «Altura 70 cm», «Espessura 5,5 mm» (traço U+2013, vírgula decimal). O 2D/3D fica como estava.
--
-- Recusas novas (CT002, ao gravar com cat_guardar_produto_atributos):
--   «A medida tem de ser 1D, 2D ou 3D.»                     (antes: «… 2D ou 3D.»)
--   «Uma medida 1D leva só «dimensao» e «valor»: não leva largura, comprimento nem espessura.»  (só com valor:
--     essas chaves a null aceitam-se e não se gravam)
--   «Falta dizer qual é a dimensão da medida 1D (largura, altura, comprimento ou espessura).»
--   «A dimensão da medida 1D tem de ser largura, altura, comprimento ou espessura.»
--   «Falta o valor da altura.» / «… do comprimento.»
--   «O início da largura tem de ser um número igual ou maior que zero.»  (antes: «… maior que zero.», no intervalo)
--   O valor do 1D usa as mensagens de sempre com o sujeito da dimensão («A altura tem de ser um número maior que zero.»).
-- Na PRÉ-VISUALIZAÇÃO (cat_prever_sku_modelo) uma medida inválida não dá erro, como até agora.
--
-- Funções (versão anterior → esta):
--   fn_cat_medida_ler(jsonb,text)                   20270119600000 → lê o 1D
--   fn_cat_sku_medida(jsonb)                        20270119600000 → troço do 1D com prefixo; início do intervalo pode ser 0
--   fn_cat_medida_texto(jsonb)                      20270119600000 → «Largura 70 cm»
--   fn_cat_dimensao_medida(jsonb,text)              20270119600000 → início do intervalo pode ser 0
--   cat_guardar_produto_atributos(uuid,uuid,jsonb)  20270119600000 → valida e grava o 1D
--   cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid) 20270118300000 → passa «dimensao» e «valor» ao SKU (sem isto
--     a pré-visualização de um 1D ficava sempre sem medida)
--   Sem mudança (o 1D passa por elas): fn_cat_dimensao, fn_cat_num_texto, fn_cat_dimensao_texto, fn_cat_sku_partes,
--   cat_gerar_sku_produto, cat_prever_sku, cat_ler_atributos, cat_ler_atributos_produto, cat_ler_produtos_pagina,
--   cat_pesquisar_produtos.
--
-- Guarda: o corpo aplicado de cada função recriada (e das que dependem dela sem mudar) tem de ser o lido no remoto a
-- 18/11 (md5 do prosrc); senão recusa. Só CREATE OR REPLACE: assinaturas, LANGUAGE, volatilidade, SECURITY DEFINER,
-- search_path e acessos iguais aos vivos.
--
-- O ECRÃ: até o editor da ficha saber mostrar e editar o 1D (fase 2: src/emylia/atributosTexto.ts textoMedida e o
-- editor da medida), só a base aceita 1D; nenhum produto atual muda. Não gravar 1D antes de publicar o ecrã.
-- Teste: supabase/tests/catalogo_medida_1d.test.sql (passo 0 falha ANTES desta migration).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET LOCAL lock_timeout = '5s';   -- só nesta transação

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_txt text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.fn_cat_medida_ler(jsonb,text)',                         'c798d5749ee1671d5c8002234d8c888a'),
      ('public.fn_cat_sku_medida(jsonb)',                              'c88f17bf1eb83b289a02c7e019f40ee3'),
      ('public.fn_cat_medida_texto(jsonb)',                            '23dd5afa6c41cd32f781b822955844d3'),
      ('public.fn_cat_dimensao_medida(jsonb,text)',                    '4b03e50c1b9af3723e12038660c0adcb'),
      ('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)',        '4b6d7168fb271c294e1f21b5b7ce0dfe'),
      ('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)', 'ca264514ef73bbe0ae048e79daef407c'),
      -- não mudam, mas esta migration conta com o corpo que têm
      ('public.fn_cat_dimensao(jsonb,text)',                           '7cb75c1ecb424b9fe213114e66118f10'),
      ('public.fn_cat_num_texto(numeric)',                             '9defb626f49b5c275ba2e307299c556d'),
      ('public.fn_cat_dimensao_texto(jsonb)',                          '4fe5396f082f1353fdc676289abfaff7'),
      ('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',               '35f20ab07322d3cace1c94a97c1289b9'),
      ('public.cat_gerar_sku_produto(uuid,uuid,boolean)',              'f4873274998614a326c4572ee195ddd7'),
      ('public.cat_prever_sku(uuid,uuid,uuid,jsonb)',                  'f72760e24fcc81584aa325b01249bb9c'),
      ('public.cat_ler_atributos(uuid)',                               'e104a9d4043bc6edc7cc5e8f5c1f4716'),
      ('public.cat_ler_atributos_produto(uuid,uuid)',                  '3f5c0fca0f6ed2ac8550cc3debad00d9'),
      ('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)', 'bad8ab2033ba91c08f8921c80b11468f'),
      ('public.cat_pesquisar_produtos(uuid,text,uuid,uuid,uuid,integer,integer)',               'b61112f75c4223eca58df20e7b0150e0')
    ) AS t(sig, md5) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'Falta a função %: rever esta migration.', r.sig;
    END IF;
    IF (SELECT md5(pr.prosrc) FROM pg_proc pr WHERE pr.oid = to_regprocedure(r.sig)::oid) IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '% não é a versão esperada (md5 %, esperado %): rever esta migration.',
        r.sig, (SELECT md5(pr.prosrc) FROM pg_proc pr WHERE pr.oid = to_regprocedure(r.sig)::oid), r.md5;
    END IF;
  END LOOP;

  -- nenhuma outra versão (outra assinatura) das recriadas
  SELECT string_agg(pr.oid::regprocedure::text, ', ') INTO v_txt FROM pg_proc pr
  WHERE pr.pronamespace = 'public'::regnamespace
    AND (   (pr.proname = 'fn_cat_medida_ler' AND pg_get_function_identity_arguments(pr.oid) <> 'p_json jsonb, p_unit text')
         OR (pr.proname = 'fn_cat_sku_medida' AND pg_get_function_identity_arguments(pr.oid) <> 'p_medida jsonb')
         OR (pr.proname = 'fn_cat_medida_texto' AND pg_get_function_identity_arguments(pr.oid) <> 'p_medida jsonb')
         OR (pr.proname = 'fn_cat_dimensao_medida' AND pg_get_function_identity_arguments(pr.oid) <> 'p_valor jsonb, p_nome text')
         OR (pr.proname = 'cat_guardar_produto_atributos'
             AND pg_get_function_identity_arguments(pr.oid) <> 'p_org uuid, p_produto uuid, p_valores jsonb')
         OR (pr.proname = 'cat_prever_sku_modelo'
             AND pg_get_function_identity_arguments(pr.oid)
                 <> 'p_org uuid, p_categoria uuid, p_subcategoria uuid, p_modelo uuid, p_atributos jsonb, p_produto uuid'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. Uma dimensão ao GRAVAR (20270119600000 + início do intervalo pode ser 0) ──
-- Um número (as regras e as mensagens de fn_cat_dimensao, devolvido sem zeros à direita) ou um intervalo
-- {"de": n1, "ate": n2}: n1 >= 0 (0 para «até n2»), n2 com as regras do número, n1 < n2; devolvido {"de", "ate"}.
-- p_nome é o sujeito da mensagem («A largura», «A altura», «O comprimento», «A espessura»). Recusas: CT002.
CREATE OR REPLACE FUNCTION public.fn_cat_dimensao_medida(p_valor jsonb, p_nome text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270122300000: o início do intervalo pode ser 0 («até 40» = {"de":0,"ate":40})
  v_de_nome text := 'd' || lower(p_nome);   -- «da largura», «da altura», «do comprimento», «da espessura»
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
  -- o início: 0 ou um número com as regras de fn_cat_dimensao (os IF encaixados: o cast só depois de saber que é número)
  IF jsonb_typeof(p_valor -> 'de') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'O início % tem de ser um número igual ou maior que zero.', v_de_nome USING ERRCODE = 'CT002';
  END IF;
  IF (p_valor ->> 'de')::numeric < 0 THEN
    RAISE EXCEPTION 'O início % tem de ser um número igual ou maior que zero.', v_de_nome USING ERRCODE = 'CT002';
  END IF;
  IF (p_valor ->> 'de')::numeric = 0 THEN
    v_de := 0;
  ELSE
    v_de := public.fn_cat_dimensao(p_valor -> 'de', 'O início ' || v_de_nome);
  END IF;
  v_ate := public.fn_cat_dimensao(p_valor -> 'ate', 'O fim ' || v_de_nome);
  IF v_de >= v_ate THEN
    RAISE EXCEPTION 'No intervalo %, o início (%) tem de ser menor que o fim (%).', v_de_nome,
      public.fn_cat_num_texto(v_de), public.fn_cat_num_texto(v_ate) USING ERRCODE = 'CT002';
  END IF;
  RETURN jsonb_build_object('de', v_de, 'ate', v_ate);
END $$;

-- ─── 2. Ler a medida (20270119600000 + 1D) ──────────────────────────────────────
-- A medida guardada (value_json + unit) no formato do ecrã; NULL se não for uma medida 1D/2D/3D válida.
-- 1D: {tipo:"1D", dimensao, valor, unidade} (só estas chaves); a dimensão tem de ser uma das quatro, o valor um número
-- ou {de, ate} com os dois números. 2D/3D: exatamente o resultado de 20270119600000. Só a forma: as regras (> 0, …,
-- de < ate) verificam-se ao gravar e no SKU.
CREATE OR REPLACE FUNCTION public.fn_cat_medida_ler(p_json jsonb, p_unit text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270119600000: cada dimensão pode ser um número ou um intervalo {de, ate}; plpgsql (ver Desempenho)
  -- 20270122300000: 1D {tipo, dimensao, valor, unidade}
  v_tipo text; v_l jsonb; v_c jsonb; v_e jsonb; v_dim text;
BEGIN
  IF jsonb_typeof(p_json) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  v_tipo := p_json ->> 'tipo';
  IF v_tipo IS NULL OR v_tipo NOT IN ('1D', '2D', '3D') THEN RETURN NULL; END IF;

  IF v_tipo = '1D' THEN
    v_dim := p_json ->> 'dimensao';
    IF v_dim IS NULL OR v_dim NOT IN ('largura', 'altura', 'comprimento', 'espessura') THEN RETURN NULL; END IF;
    v_l := p_json -> 'valor';
    IF jsonb_typeof(v_l) = 'object' THEN
      v_l := CASE WHEN jsonb_typeof(v_l -> 'de') = 'number' AND jsonb_typeof(v_l -> 'ate') = 'number'
                  THEN jsonb_build_object('de', v_l -> 'de', 'ate', v_l -> 'ate') END;
    ELSIF jsonb_typeof(v_l) IS DISTINCT FROM 'number' THEN
      RETURN NULL;
    END IF;
    IF v_l IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('tipo', '1D', 'dimensao', v_dim, 'valor', v_l,
                              'unidade', coalesce(nullif(p_json ->> 'unidade', ''), nullif(p_unit, ''), 'cm'));
  END IF;

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

-- ─── 3. A medida no SKU (20270119600000 + 1D + início 0) ────────────────────────
-- 60X30, 60X30X2, 7P5X30, 91A100X90, «MM» no fim se for em mm. 1D: o troço da dimensão com o prefixo (largura sem
-- prefixo, ALT, COMP, ESP): 70, ALT70, ESP5P5MM, 0A40. NULL se não for uma medida válida: as regras de fn_cat_dimensao
-- (> 0, até 100000, no máximo 3 casas decimais) em cada número, exceto o início de um intervalo, que pode ser 0; no
-- intervalo de < ate; 3D precisa da espessura. Os limites são verificados ANTES de escrever o número.
CREATE OR REPLACE FUNCTION public.fn_cat_sku_medida(p_medida jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270119600000: cada dimensão é um número ou um intervalo {de, ate} → <de>A<ate>
  -- 20270122300000: 1D com prefixo da dimensão (largura sem prefixo); o início do intervalo pode ser 0
  c_max constant numeric := 100000;
  c_casas constant integer := 3;
  v_m jsonb; v_dims jsonb[]; v_pref text := ''; v_d jsonb; v_el jsonb; v numeric; v_ant numeric; v_seg text;
  v_txt text[] := '{}';
BEGIN
  v_m := public.fn_cat_medida_ler(p_medida, NULL);
  IF v_m IS NULL THEN RETURN NULL; END IF;
  IF v_m ->> 'tipo' = '1D' THEN
    v_dims := ARRAY[v_m -> 'valor'];
    v_pref := CASE v_m ->> 'dimensao' WHEN 'altura' THEN 'ALT' WHEN 'comprimento' THEN 'COMP'
                                      WHEN 'espessura' THEN 'ESP' ELSE '' END;
  ELSIF v_m ->> 'tipo' = '3D' THEN
    v_dims := ARRAY[v_m -> 'largura', v_m -> 'comprimento', v_m -> 'espessura'];
  ELSE
    v_dims := ARRAY[v_m -> 'largura', v_m -> 'comprimento'];
  END IF;
  FOREACH v_d IN ARRAY v_dims LOOP
    v_seg := NULL; v_ant := NULL;
    -- um número, ou o início e o fim do intervalo (fn_cat_medida_ler só deixa passar estas duas formas)
    FOREACH v_el IN ARRAY (CASE WHEN jsonb_typeof(v_d) = 'object' THEN ARRAY[v_d -> 'de', v_d -> 'ate'] ELSE ARRAY[v_d] END) LOOP
      IF jsonb_typeof(v_el) IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
      v := (v_el #>> '{}')::numeric;
      IF v < 0 OR v > c_max THEN RETURN NULL; END IF;
      -- 0 só no início de um intervalo
      IF v = 0 AND NOT (jsonb_typeof(v_d) = 'object' AND v_ant IS NULL) THEN RETURN NULL; END IF;
      v := trim_scale(v);
      IF scale(v) > c_casas THEN RETURN NULL; END IF;
      IF v_ant IS NOT NULL AND v_ant >= v THEN RETURN NULL; END IF;   -- intervalo: de < ate
      v_seg := (CASE WHEN v_seg IS NULL THEN '' ELSE v_seg || 'A' END) || replace(v::text, '.', 'P');
      v_ant := v;
    END LOOP;
    v_txt := array_append(v_txt, v_seg);
  END LOOP;
  RETURN v_pref || array_to_string(v_txt, 'X') || (CASE WHEN lower(v_m ->> 'unidade') = 'mm' THEN 'MM' ELSE '' END);
END $$;

-- ─── 4. O texto da medida na lista paginada (20270119600000 + 1D) ───────────────
-- textoMedida do ecrã sobre o formato de fn_cat_medida_ler: «70×70 cm», «12,5×25×0,8 mm», «91–100×90 cm»; 1D:
-- «Largura 70 cm», «Altura 95–100 cm», «Espessura 5,5 mm». NULL se não for uma medida.
CREATE OR REPLACE FUNCTION public.fn_cat_medida_texto(p_medida jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270119600000: cada dimensão é um número («0,9») ou um intervalo («91–100», traço U+2013); plpgsql (ver Desempenho)
  -- 20270122300000: 1D «<Dimensão> <valor> <unidade>»
  v_nome text; v_d jsonb; v_seg text; v_txt text[] := '{}';
BEGIN
  IF p_medida IS NULL OR jsonb_typeof(p_medida) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  IF p_medida ->> 'tipo' = '1D' THEN
    v_d := p_medida -> 'valor';
    v_seg := CASE jsonb_typeof(v_d)
               WHEN 'number' THEN replace(trim_scale((v_d #>> '{}')::numeric)::text, '.', ',')
               WHEN 'object' THEN replace(trim_scale((v_d ->> 'de')::numeric)::text, '.', ',') || '–'
                                  || replace(trim_scale((v_d ->> 'ate')::numeric)::text, '.', ',')
             END;
    v_nome := CASE p_medida ->> 'dimensao' WHEN 'largura' THEN 'Largura' WHEN 'altura' THEN 'Altura'
                                           WHEN 'comprimento' THEN 'Comprimento' WHEN 'espessura' THEN 'Espessura' END;
    IF v_seg IS NULL OR v_nome IS NULL THEN RETURN NULL; END IF;
    RETURN v_nome || ' ' || v_seg || ' ' || (p_medida ->> 'unidade');
  END IF;
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

-- ─── 5. Gravar os valores de um produto (20270119600000 + 1D) ───────────────────
-- Corpo copiado da versão aplicada (20270119600000); as ÚNICAS diferenças estão no ramo da medida: aceita o tipo 1D
-- (valida a dimensão e o valor, recusa largura/comprimento/espessura soltas) e grava {tipo, dimensao, valor, unidade}
-- com o texto «Largura 70 cm». Para o 2D/3D o value_text e o value_json gravados são exatamente os de antes.
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
  -- 20270122300000: 1D {tipo, dimensao, valor, unidade}
  v_dim text; v_sujeito text;
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
      IF v_tipo NOT IN ('1D', '2D', '3D') THEN
        RAISE EXCEPTION 'A medida tem de ser 1D, 2D ou 3D.' USING ERRCODE = 'CT002';
      END IF;
      v_uni := lower(btrim(coalesce(nullif(v_med ->> 'unidade', ''), a.unit, 'cm')));
      IF v_uni NOT IN ('cm', 'mm') THEN
        RAISE EXCEPTION 'A unidade da medida tem de ser cm ou mm.' USING ERRCODE = 'CT002';
      END IF;
      IF v_tipo = '1D' THEN
        -- 20270122300000: uma só dimensão, a dizer qual é
        -- as chaves do 2D/3D só contam com valor: a null (o editor pode mandá-las sempre) não se recusam
        IF coalesce(v_med -> 'largura', 'null'::jsonb) <> 'null'::jsonb OR coalesce(v_med -> 'comprimento', 'null'::jsonb) <> 'null'::jsonb
           OR coalesce(v_med -> 'espessura', 'null'::jsonb) <> 'null'::jsonb THEN
          RAISE EXCEPTION 'Uma medida 1D leva só «dimensao» e «valor»: não leva largura, comprimento nem espessura.' USING ERRCODE = 'CT002';
        END IF;
        v_dim := lower(btrim(coalesce(v_med ->> 'dimensao', '')));
        IF v_dim = '' THEN
          RAISE EXCEPTION 'Falta dizer qual é a dimensão da medida 1D (largura, altura, comprimento ou espessura).' USING ERRCODE = 'CT002';
        END IF;
        v_sujeito := CASE v_dim WHEN 'largura' THEN 'A largura' WHEN 'altura' THEN 'A altura'
                                WHEN 'comprimento' THEN 'O comprimento' WHEN 'espessura' THEN 'A espessura' END;
        IF v_sujeito IS NULL THEN
          RAISE EXCEPTION 'A dimensão da medida 1D tem de ser largura, altura, comprimento ou espessura.' USING ERRCODE = 'CT002';
        END IF;
        IF coalesce(v_med -> 'valor', 'null'::jsonb) = 'null'::jsonb THEN
          RAISE EXCEPTION 'Falta o valor %.', 'd' || lower(v_sujeito) USING ERRCODE = 'CT002';
        END IF;
        v_l := public.fn_cat_dimensao_medida(v_med -> 'valor', v_sujeito);
        v_attrs := array_append(v_attrs, v_attr);
        v_txts := array_append(v_txts, initcap(v_dim) || ' ' || public.fn_cat_dimensao_texto(v_l) || ' ' || v_uni);
        v_jsons := array_append(v_jsons, jsonb_build_object('tipo', '1D', 'dimensao', v_dim, 'valor', v_l, 'unidade', v_uni));
        v_units := array_append(v_units, v_uni);
      ELSE
        v_l := public.fn_cat_dimensao_medida(v_med -> 'largura', 'A largura');
        v_c := public.fn_cat_dimensao_medida(v_med -> 'comprimento', 'O comprimento');
        v_e := CASE WHEN v_tipo = '3D' THEN public.fn_cat_dimensao_medida(v_med -> 'espessura', 'A espessura') END;  -- 2D: a espessura não conta
        v_attrs := array_append(v_attrs, v_attr);
        v_txts := array_append(v_txts, public.fn_cat_dimensao_texto(v_l) || ' × ' || public.fn_cat_dimensao_texto(v_c)
                             || CASE WHEN v_e IS NULL THEN '' ELSE ' × ' || public.fn_cat_dimensao_texto(v_e) END || ' ' || v_uni);
        v_jsons := array_append(v_jsons, jsonb_build_object('tipo', v_tipo, 'largura', v_l, 'comprimento', v_c, 'espessura', v_e, 'unidade', v_uni));
        v_units := array_append(v_units, v_uni);
      END IF;
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
  'Catálogo (20270117500000; intervalo em 20270119600000; 1D em 20270122300000): substitui os valores de atributos de um produto (no máximo 50; uma opção por atributo de lista; a Medida em value_json: 1D {"tipo","dimensao","valor","unidade"} ou 2D/3D {"largura","comprimento","espessura"}, cada dimensão um número ou um intervalo {"de","ate"} com 0 <= de < ate). Só apaga valores de atributos activos da organização. Permissão products.edit.';

-- ─── 6. Pré-visualizar o SKU (20270118300000 + 1D) ──────────────────────────────
-- Corpo copiado da versão aplicada (20270118300000); a ÚNICA diferença: a medida passada a fn_cat_sku_partes leva
-- também «dimensao» (em minúsculas, sem espaços) e «valor», para o 1D. Para o 2D/3D essas chaves ficam null e
-- fn_cat_medida_ler ignora-as: o SKU é o mesmo de antes.
CREATE OR REPLACE FUNCTION public.cat_prever_sku_modelo(p_org uuid, p_categoria uuid, p_subcategoria uuid, p_modelo uuid,
  p_atributos jsonb, p_produto uuid DEFAULT NULL::uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270118300000; 20270122300000: a medida 1D (dimensao, valor)
  c_max_valores constant integer := 50;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_el jsonb; v_i bigint; v_attr uuid; v_attrs uuid[] := '{}'; v_label text; v_medida boolean; v_unit text;
  v_opc jsonb; v_med jsonb; v_sigla text; v_vals jsonb := '[]'::jsonb; v_partes jsonb; v_faltas text[]; v_prefixo text;
  v_numero integer; v_cand text; v_outro uuid; v_outro_apagado boolean;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF p_atributos IS NOT NULL AND jsonb_typeof(p_atributos) <> 'array' THEN
    RAISE EXCEPTION 'Os atributos têm de vir numa lista.' USING ERRCODE = 'CT002';
  END IF;
  IF jsonb_array_length(coalesce(p_atributos, '[]'::jsonb)) > c_max_valores THEN
    RAISE EXCEPTION 'No máximo 50 atributos por produto.' USING ERRCODE = 'CT002';
  END IF;
  IF p_categoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.id = p_categoria AND pc.deleted_at IS NULL
                                             AND (pc.organization_id = p_org OR pc.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003';
  END IF;
  IF p_subcategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.id = p_subcategoria AND pc.deleted_at IS NULL
                                                AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
                                                AND pc.parent_id IS NOT DISTINCT FROM p_categoria) THEN
    RAISE EXCEPTION 'A subcategoria não pertence a esta categoria.' USING ERRCODE = 'CT002';
  END IF;
  IF p_modelo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_models pm WHERE pm.id = p_modelo AND pm.organization_id = p_org
                                          AND pm.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  IF p_produto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = p_produto AND p.organization_id = p_org) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003';
  END IF;

  FOR v_el, v_i IN SELECT t.e, t.i FROM jsonb_array_elements(coalesce(p_atributos, '[]'::jsonb)) WITH ORDINALITY AS t(e, i) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR coalesce(v_el ->> 'atributo', '') !~ c_uuid THEN
      RAISE EXCEPTION 'O valor n.º % não diz qual é o atributo.', v_i USING ERRCODE = 'CT002';
    END IF;
    v_attr := (v_el ->> 'atributo')::uuid;
    v_label := NULL;
    SELECT pa.label::text, pa.is_measurement, pa.unit::text INTO v_label, v_medida, v_unit FROM product_attributes pa
    WHERE pa.id = v_attr AND pa.organization_id = p_org AND pa.deleted_at IS NULL;
    IF v_label IS NULL THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    IF v_attr = ANY (v_attrs) THEN
      RAISE EXCEPTION 'O atributo «%» vem mais de uma vez.', v_label USING ERRCODE = 'CT002';
    END IF;
    v_attrs := array_append(v_attrs, v_attr);
    v_opc := nullif(v_el -> 'opcao', 'null'::jsonb);
    v_med := nullif(v_el -> 'medida', 'null'::jsonb);

    IF v_medida THEN
      CONTINUE WHEN v_med IS NULL OR jsonb_typeof(v_med) <> 'object';
      v_vals := v_vals || jsonb_build_array(jsonb_build_object(
        'atributo', v_attr, 'sigla', NULL,
        'medida', jsonb_build_object('tipo', upper(btrim(coalesce(v_med ->> 'tipo', ''))),
                                     'largura', v_med -> 'largura', 'comprimento', v_med -> 'comprimento',
                                     'espessura', v_med -> 'espessura',
                                     'dimensao', lower(btrim(v_med ->> 'dimensao')), 'valor', v_med -> 'valor',
                                     'unidade', lower(btrim(coalesce(nullif(v_med ->> 'unidade', ''), v_unit, 'cm'))))));
    ELSE
      CONTINUE WHEN v_opc IS NULL;
      IF jsonb_typeof(v_opc) <> 'string' OR (v_opc #>> '{}') !~ c_uuid THEN
        RAISE EXCEPTION 'A opção de «%» não é válida.', v_label USING ERRCODE = 'CT002';
      END IF;
      v_sigla := NULL;
      SELECT o.sigla INTO v_sigla FROM attribute_option_group_values o
      WHERE o.id = (v_opc #>> '{}')::uuid AND o.group_id = public.fn_cat_grupo_do_atributo(v_attr, p_org);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A opção escolhida não pertence ao atributo «%».', v_label USING ERRCODE = 'CT002';
      END IF;
      v_vals := v_vals || jsonb_build_array(jsonb_build_object('atributo', v_attr, 'sigla', v_sigla, 'medida', NULL));
    END IF;
  END LOOP;

  v_partes := public.fn_cat_sku_partes(p_org, p_categoria, p_subcategoria, v_vals);
  v_prefixo := v_partes ->> 'prefixo';
  v_numero := public.fn_cat_modelo_numero(p_org, p_subcategoria, p_modelo);
  v_faltas := public.fn_cat_sku_juntar_faltas(v_partes -> 'faltas', v_numero IS NULL);
  IF v_prefixo IS NULL OR v_numero IS NULL THEN
    RETURN jsonb_build_object('sku', NULL, 'faltas', to_jsonb(v_faltas));
  END IF;

  v_cand := concat_ws('-', v_prefixo, lpad(v_numero::text, 4, '0'), v_partes ->> 'resto');
  SELECT p.id, p.is_deleted INTO v_outro, v_outro_apagado FROM products p
  WHERE p.organization_id = p_org AND p.sku = v_cand AND p.id IS DISTINCT FROM p_produto
  ORDER BY p.is_deleted, p.id LIMIT 1;
  IF v_outro IS NOT NULL THEN
    -- o id do outro só para quem edita produtos, e nunca o de um apagado
    RETURN jsonb_build_object('sku', v_cand, 'faltas', to_jsonb(v_faltas || 'duplicado'::text), 'outro_apagado', v_outro_apagado)
           || (CASE WHEN NOT v_outro_apagado AND public.fn_cat_pode(p_org, 'products.edit')
                    THEN jsonb_build_object('outro_produto', v_outro) ELSE '{}'::jsonb END);
  END IF;
  RETURN jsonb_build_object('sku', v_cand, 'faltas', to_jsonb(v_faltas));
END $$;

-- ─── 7. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record;
BEGIN
  -- internas: IMMUTABLE, plpgsql, search_path com pg_temp, nem PUBLIC nem anon nem authenticated
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_dimensao_medida(jsonb,text)', 'public.fn_cat_medida_ler(jsonb,text)',
                                'public.fn_cat_sku_medida(jsonb)', 'public.fn_cat_medida_texto(jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.provolatile::text AS vol, l.lanname::text AS lang INTO p
    FROM pg_proc pr JOIN pg_language l ON l.oid = pr.prolang WHERE pr.oid = v_oid;
    IF p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não devia ser SECURITY DEFINER.', v_sig; END IF;
    IF p.vol <> 'i' THEN RAISE EXCEPTION 'Conferir: % não é IMMUTABLE.', v_sig; END IF;
    IF p.lang <> 'plpgsql' THEN RAISE EXCEPTION 'Conferir: % não é plpgsql.', v_sig; END IF;
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

  -- as públicas: SECURITY DEFINER, search_path, authenticated sim, anon e PUBLIC não
  FOREACH v_sig IN ARRAY ARRAY['public.cat_guardar_produto_atributos(uuid,uuid,jsonb)',
                                'public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef OR p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig))
       OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % sem SECURITY DEFINER, search_path ou acessos esperados.', v_sig;
    END IF;
  END LOOP;
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')::oid)
       NOT LIKE '%c_max_valores constant integer := 50;%FOR NO KEY UPDATE%o.group_id = v_grupo FOR SHARE;%' THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto_atributos sem os limites ou o FOR SHARE.';
  END IF;

  -- o comportamento (2D/3D iguais aos de antes; 1D; início 0; as recusas ficam para o teste)
  IF public.fn_cat_medida_ler('{"tipo":"2D","largura":70,"comprimento":70,"espessura":null,"unidade":"cm"}'::jsonb, 'cm')
       IS DISTINCT FROM '{"tipo":"2D","largura":70,"comprimento":70,"espessura":null,"unidade":"cm"}'::jsonb
     OR public.fn_cat_medida_ler('{"tipo":"1D","dimensao":"altura","valor":{"de":0,"ate":40,"x":1},"largura":3}'::jsonb, 'mm')
       IS DISTINCT FROM '{"tipo":"1D","dimensao":"altura","valor":{"de":0,"ate":40},"unidade":"mm"}'::jsonb
     OR public.fn_cat_medida_ler('{"tipo":"1D","dimensao":"profundidade","valor":40}'::jsonb, NULL) IS NOT NULL
     OR public.fn_cat_medida_ler('{"tipo":"1D","dimensao":"largura"}'::jsonb, NULL) IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":60,"comprimento":30}'::jsonb) IS DISTINCT FROM '60X30'
     OR public.fn_cat_sku_medida('{"tipo":"3D","largura":7.5,"comprimento":30,"espessura":2,"unidade":"mm"}'::jsonb) IS DISTINCT FROM '7P5X30X2MM'
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90}'::jsonb) IS DISTINCT FROM '91A100X90'
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":0,"ate":40},"comprimento":90}'::jsonb) IS DISTINCT FROM '0A40X90'
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":0,"comprimento":90}'::jsonb) IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":10,"ate":0},"comprimento":90}'::jsonb) IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"3D","largura":60,"comprimento":30}'::jsonb) IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"largura","valor":70,"unidade":"cm"}'::jsonb) IS DISTINCT FROM '70'
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"largura","valor":{"de":100,"ate":105}}'::jsonb) IS DISTINCT FROM '100A105'
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"altura","valor":70}'::jsonb) IS DISTINCT FROM 'ALT70'
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"espessura","valor":5.5,"unidade":"mm"}'::jsonb) IS DISTINCT FROM 'ESP5P5MM'
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"comprimento","valor":76}'::jsonb) IS DISTINCT FROM 'COMP76'
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"largura","valor":{"de":0,"ate":40}}'::jsonb) IS DISTINCT FROM '0A40'
     OR public.fn_cat_sku_medida('{"tipo":"1D","dimensao":"largura","valor":0}'::jsonb) IS NOT NULL
     OR public.fn_cat_medida_texto('{"tipo":"2D","largura":70,"comprimento":70,"unidade":"cm","espessura":null}'::jsonb) IS DISTINCT FROM '70×70 cm'
     OR public.fn_cat_medida_texto('{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.8,"unidade":"mm"}'::jsonb) IS DISTINCT FROM '12,5×25×0,8 mm'
     OR public.fn_cat_medida_texto('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"unidade":"cm"}'::jsonb) IS DISTINCT FROM '91–100×90 cm'
     OR public.fn_cat_medida_texto('{"tipo":"1D","dimensao":"largura","valor":{"de":95,"ate":100},"unidade":"cm"}'::jsonb) IS DISTINCT FROM 'Largura 95–100 cm'
     OR public.fn_cat_medida_texto('{"tipo":"1D","dimensao":"espessura","valor":5.5,"unidade":"mm"}'::jsonb) IS DISTINCT FROM 'Espessura 5,5 mm'
     OR public.fn_cat_medida_texto(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: fn_cat_medida_ler, fn_cat_sku_medida ou fn_cat_medida_texto não dão o esperado.';
  END IF;
  RAISE NOTICE 'catalogo_medida_1d: 6 funções recriadas (dimensao_medida, medida_ler, sku_medida, medida_texto, guardar_produto_atributos, prever_sku_modelo) conferidas.';
END $c$;
