-- =============================================================================
-- Catálogo — SIGLAS das categorias, subcategorias e opções dos atributos, a ORDEM dos
-- atributos no SKU (configurável por organização) e o SKU gerado ao criar um produto.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Regra do utilizador: «SKU = sigla da categoria mais as siglas da subcategoria, variação de 4
-- dígitos e depois medida e cor; se tiver a medida com o x a y; em cor a sigla da cor (azul AZ,
-- vermelho VM); as siglas de todos os atributos entram no SKU; ordem: cor, textura e medida; o
-- código base categoria+subcategoria gera a referência base, os produtos dentro dessas,
-- dependendo dos atributos, completam a ref». Depois: a ordem dos atributos é CONFIGURÁVEL por
-- organização, e nem todos os produtos têm todos os atributos (os que faltam ficam de fora).
--
--   SKU = CAT-SUB-NNNN-<um segmento por atributo, por sku_ordem, só os que entram e que o produto tem>
--   Ex. (ordem inicial cor, tonalidade, textura, brilho, tipo_grelha, medida):
--       TQA-TQB-0001-AZ-RUG-60X30   ·   sem subcategoria: TQA-0001-AZ
--   Lista: a sigla da opção. Medida: largura X comprimento (3D: X espessura), sem zeros à direita,
--   ponto decimal «P» (7.5 → 7P5); em mm leva «MM» no fim (cm é a omissão): 7P5X30X2MM.
--   NNNN: o seguinte, por organização e prefixo (CAT ou CAT-SUB), entre os SKU que já seguem o
--   padrão ^PREFIXO-NNNN; 0001 a 9999.
--
-- ORDEM: aplica-se DEPOIS de 20270117500000, 20270117600000 e 20270117700000 (a guarda recusa se
-- faltarem funções ou se as três leituras recriadas não forem as aplicadas — md5 lido na RH a 16/11).
-- O portal do fornecedor tem uma regra PARECIDA e independente (sp_categorias.codigo,
-- fn_sp_catalog_sku, 20270101440000), noutras tabelas. Esta migration não lhe toca.
--
-- O que muda:
--   1. Colunas: sigla (text, NULL) em product_categories e attribute_option_group_values;
--      sku_ordem (integer, NULL) e sku_entra (boolean NOT NULL DEFAULT true) em product_attributes.
--      Sigla: CHECK ^[A-Z0-9]{1,6}$; nas categorias também pelo menos UMA LETRA (uma sigla só de
--      algarismos, ex. «1234», tornaria ambíguo o NNNN de CAT-1234-0001 vs CAT-0001). Únicas:
--      categorias por (organização, pai) entre as não apagadas — as de topo comparam-se entre si e
--      as subs do mesmo pai entre si; a mesma sigla pode repetir-se em pais diferentes. Opções por
--      grupo (ativas e desativadas). Nada em products.
--   2. fn_cat_sugerir_sigla(nome, usadas[]) — pura: sem acentos, maiúsculas, sem artigos e
--      preposições; 2+ palavras = iniciais (até 4); 1 palavra = 1.ª letra + 1.ª consoante
--      seguinte (Azul → AZ, Vermelho → VR); repetida: mais consoantes, depois mais letras, depois
--      algarismo (AZ2…). As sugestões são editáveis (o utilizador quer VM: muda-a).
--   3. PREENCHE as siglas que faltam (todas as organizações da base; apagadas incluídas, sem
--      repetir a de nenhuma irmã) e a ordem do SKU dos atributos vivos (por organização: cor 1,
--      tonalidade 2, textura 3, brilho 4, tipo_grelha 5, medida 6, os outros a seguir por
--      sort_order). GATILHOS BEFORE INSERT preenchem a sigla (categorias, opções) e o sku_ordem
--      (atributos: o seguinte) quando vêm vazios — cobrem todos os caminhos de criação sem mudar as
--      funções atuais. Nunca impedem a criação: um erro deles deixa o campo vazio. Escolhem sob um
--      advisory lock por âmbito, por isso duas criações ao mesmo tempo não escolhem o mesmo (num
--      BEFORE INSERT não se pode apanhar o unique_violation do próprio INSERT: verifica-se antes).
--   4. Escritas (products.edit): cat_guardar_sigla_categoria, cat_guardar_sigla_opcao,
--      cat_guardar_sku_config(p_org, p_itens) — [{atributo, entra}] na ordem desejada, com TODOS
--      os atributos vivos da organização, cada um uma vez (no máximo 200, o teto de
--      cat_guardar_atributo). Mudar a ordem não reescreve nenhum SKU: só conta quando o SKU de um
--      produto volta a ser gerado.
--      Leituras recriadas (mesma assinatura, corpo aplicado + campos novos): cat_ler_categorias_gestao
--      ("sigla"), cat_ler_atributos_gestao ("sku_ordem", "sku_entra" e "sigla" nas opções),
--      cat_ler_atributos ("sigla" nas opções).
--   5. products.sku_gerado (boolean NOT NULL DEFAULT false): true só quando cat_gerar_sku_produto
--      gerou o SKU. Os produtos que já existem ficam false e nunca são reescritos por esta via.
--      cat_gerar_sku_produto(p_org, p_produto, p_forcar DEFAULT false) → {sku, gerado, faltas,
--      motivo}. Chama-se como ÚLTIMO passo ao gravar (depois de cat_guardar_produto_tabelas e
--      cat_guardar_produto_atributos): lê o que está gravado. Substitui o SKU se for provisório
--      (CAT-XXXXXXXXXX de cat_guardar_produto) ou vazio, ou se já foi gerado (sku_gerado): regenera
--      sempre, mantendo o NNNN quando o prefixo é o mesmo. Um SKU escrito à mão (sku_gerado false e
--      não provisório) só com p_forcar, e passa a gerado. Impedem a geração (e o SKU fica): sem
--      categoria, sem sigla na categoria, subcategoria inválida ou sem sigla. Não impedem (o
--      segmento fica de fora e vem em "faltas"): opção sem sigla (sigla:<código>), medida inválida
--      (medida:<código>; > 0, até 100000, no máximo 3 casas decimais, como fn_cat_dimensao).
--      A auditoria regista a escrita com app.audit_source = 'fn:cat_gerar_sku_produto'.
--   6. cat_prever_sku(p_org, p_categoria, p_subcategoria, p_atributos) → {sku, faltas}: só
--      leitura; mostra o NNNN que seria o seguinte (confirma-se ao guardar).
--   7. fn_cat_exigir_uma passa a search_path = public, pg_temp (ALTER FUNCTION; o corpo não muda).
--   Os SKU dos produtos que já existem NÃO mudam (nenhuma linha de products é escrita aqui).
--   O preenchimento escreve em TODAS as organizações desta base, a Mudelar incluída (lido a 16/11:
--   93 categorias, 201 opções, 6 atributos) — é intencional: as siglas e a ordem são de todos.
--   Gatilhos que engolem um erro deixam o campo vazio e dão um WARNING (SQLSTATE e mensagem).
--
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado; CT004 sigla repetida
-- (DETAIL = id da linha que já a tem).
-- Teste: supabase/tests/catalogo_siglas_e_sku.test.sql (BEGIN … ROLLBACK, só na nike).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

-- lock_timeout de 5 s para os ALTER TABLE; reposto no fim do ficheiro (RESET), para nao ficar na sessao.
SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_txt text; v_falta text; v_src text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.fn_neg_so_execucao(uuid,text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_medida_ler(jsonb,text)', 'public.cat_ler_categorias_gestao(uuid)',
                    'public.cat_ler_atributos_gestao(uuid)', 'public.cat_ler_atributos(uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções (%): aplicar antes 20270117500000, 20270117600000 e 20270117700000.', v_falta;
  END IF;

  -- se as colunas já existem (reaplicação), têm de ter o tipo esperado
  SELECT string_agg(ic.table_name::text || '.' || ic.column_name::text || ' ' || ic.data_type::text, ', ') INTO v_falta
  FROM information_schema.columns ic
  WHERE ic.table_schema = 'public'
    AND ((ic.column_name = 'sigla' AND ic.table_name IN ('product_categories', 'attribute_option_group_values') AND ic.data_type::text <> 'text')
      OR (ic.table_name = 'product_attributes' AND ic.column_name = 'sku_ordem' AND ic.data_type::text <> 'integer')
      OR (ic.table_name = 'product_attributes' AND ic.column_name = 'sku_entra' AND ic.data_type::text <> 'boolean')
      OR (ic.table_name = 'products' AND ic.column_name = 'sku_gerado' AND ic.data_type::text <> 'boolean'));
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Já existem colunas com outro tipo: %. Rever esta migration.', v_falta;
  END IF;

  -- as três leituras recriadas têm de ser as aplicadas (md5 do corpo lido na RH a 16/11), ou já estas
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_categorias_gestao(uuid)')::oid);
  IF md5(v_src) <> '9daec1f504f0110ccd3a1a4ae681b83b' AND position('20270118000000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_ler_categorias_gestao não é a de 20270117700000 (md5 %): rever esta migration.', md5(v_src);
  END IF;
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos_gestao(uuid)')::oid);
  IF md5(v_src) <> 'e18a52f55640ee9b6d35b2600c1f3ef3' AND position('20270118000000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_ler_atributos_gestao não é a de 20270117600000 (md5 %): rever esta migration.', md5(v_src);
  END IF;
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos(uuid)')::oid);
  IF md5(v_src) <> '4f64226780ba2537977c5eaaeb89b310' AND position('20270118000000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_ler_atributos não é a de 20270117500000 (md5 %): rever esta migration.', md5(v_src);
  END IF;

  -- nenhuma outra versão (outra assinatura) das funções novas
  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'fn_cat_sugerir_sigla' AND pg_get_function_identity_arguments(p.oid) <> 'p_nome text, p_usadas text[]')
      OR (p.proname = 'fn_cat_sigla_categoria_livre' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_pai uuid, p_nome text, p_id uuid')
      OR (p.proname = 'fn_cat_sigla_opcao_livre' AND pg_get_function_identity_arguments(p.oid) <> 'p_grupo uuid, p_nome text, p_id uuid')
      OR (p.proname = 'fn_cat_sku_medida' AND pg_get_function_identity_arguments(p.oid) <> 'p_medida jsonb')
      OR (p.proname = 'fn_cat_sku_partes' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_cat uuid, p_sub uuid, p_vals jsonb')
      OR (p.proname = 'fn_cat_sku_proximo' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_prefixo text, p_excluir uuid')
      OR (p.proname = 'fn_cat_sku_ordem_inicial' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_sigla_categoria' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_sigla text')
      OR (p.proname = 'cat_guardar_sigla_opcao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_opcao uuid, p_sigla text')
      OR (p.proname = 'cat_guardar_sku_config' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_itens jsonb')
      OR (p.proname = 'cat_gerar_sku_produto' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_produto uuid, p_forcar boolean')
      OR (p.proname = 'cat_prever_sku' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_categoria uuid, p_subcategoria uuid, p_atributos jsonb'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. Colunas e verificações ──────────────────────────────────────────────────
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS sigla text;
ALTER TABLE public.attribute_option_group_values ADD COLUMN IF NOT EXISTS sigla text;
ALTER TABLE public.product_attributes ADD COLUMN IF NOT EXISTS sku_ordem integer;
ALTER TABLE public.product_attributes ADD COLUMN IF NOT EXISTS sku_entra boolean NOT NULL DEFAULT true;
-- valor constante por omissão: só metadados, sem reescrever a tabela; todos os produtos existentes ficam false
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku_gerado boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_categories DROP CONSTRAINT IF EXISTS product_categories_sigla_check;
ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_sigla_check
  CHECK (sigla ~ '^[A-Z0-9]{1,6}$' AND sigla ~ '[A-Z]');
ALTER TABLE public.attribute_option_group_values DROP CONSTRAINT IF EXISTS attribute_option_group_values_sigla_check;
ALTER TABLE public.attribute_option_group_values ADD CONSTRAINT attribute_option_group_values_sigla_check
  CHECK (sigla ~ '^[A-Z0-9]{1,6}$');
ALTER TABLE public.product_attributes DROP CONSTRAINT IF EXISTS product_attributes_sku_ordem_check;
ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_sku_ordem_check CHECK (sku_ordem > 0);

COMMENT ON COLUMN public.product_categories.sigla IS
  'Sigla da categoria/subcategoria no SKU (20270118000000): 1 a 6 maiúsculas/algarismos, com pelo menos uma letra; única entre as irmãs não apagadas (mesma organização e mesmo pai). Preenchida automaticamente ao criar; editável em cat_guardar_sigla_categoria.';
COMMENT ON COLUMN public.attribute_option_group_values.sigla IS
  'Sigla da opção no SKU (20270118000000): 1 a 6 maiúsculas/algarismos, única no grupo. Preenchida automaticamente ao criar; editável em cat_guardar_sigla_opcao.';
COMMENT ON COLUMN public.product_attributes.sku_ordem IS
  'Posição do atributo no SKU (20270118000000): 1, 2, … por organização. Atributos novos ficam no fim. Editável em cat_guardar_sku_config; só afeta os SKU gerados depois.';
COMMENT ON COLUMN public.product_attributes.sku_entra IS
  'Se o atributo entra no SKU (20270118000000). Editável em cat_guardar_sku_config; só afeta os SKU gerados depois.';
COMMENT ON COLUMN public.products.sku_gerado IS
  'O SKU foi gerado por cat_gerar_sku_produto (20270118000000): volta a ser gerado quando se grava o produto. false = provisório ou escrito à mão (este só se substitui com p_forcar).';

-- ─── 2. Funções internas (sem EXECUTE para authenticated, anon nem PUBLIC) ──────
-- A sigla sugerida para um nome, livre de p_usadas. Sempre ^[A-Z0-9]{1,6}$ (NULL só se nada couber).
CREATE OR REPLACE FUNCTION public.fn_cat_sugerir_sigla(p_nome text, p_usadas text[]) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  c_vazias constant text[] := ARRAY['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'PARA', 'A', 'O', 'AS', 'OS', 'EM', 'NO', 'NA', 'NOS', 'NAS', 'COM'];
  c_max_iniciais constant integer := 4;
  c_max_sigla constant integer := 6;
  c_max_numero constant integer := 999;
  v_usadas text[]; v_txt text; v_pal text[]; v_ult text; v_base text; v_cons text; v_resto text; v_cand text;
  v_cands text[] := '{}'; i integer;
BEGIN
  v_usadas := ARRAY(SELECT upper(u) FROM unnest(coalesce(p_usadas, '{}'::text[])) AS u WHERE u IS NOT NULL);
  -- sem acentos, maiúsculas; tudo o que não é letra ou algarismo separa palavras (& - / …)
  v_txt := upper(translate(left(coalesce(p_nome, ''), 1000),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY'));
  v_txt := btrim(regexp_replace(v_txt, '[^A-Z0-9]+', ' ', 'g'));
  v_pal := ARRAY(SELECT t.w FROM unnest(string_to_array(v_txt, ' ')) WITH ORDINALITY AS t(w, o)
                 WHERE t.w <> '' AND NOT (t.w = ANY (c_vazias)) ORDER BY t.o);
  IF cardinality(v_pal) = 0 THEN
    -- só artigos e preposições: ficam as palavras todas
    v_pal := ARRAY(SELECT t.w FROM unnest(string_to_array(v_txt, ' ')) WITH ORDINALITY AS t(w, o) WHERE t.w <> '' ORDER BY t.o);
  END IF;

  IF cardinality(v_pal) = 0 THEN
    v_base := 'X';
  ELSIF cardinality(v_pal) = 1 THEN
    -- uma palavra: a primeira letra e a consoante (ou algarismo) seguinte; depois mais consoantes, depois as letras por ordem
    v_ult := left(v_pal[1], c_max_sigla * 4);
    v_cons := regexp_replace(substr(v_ult, 2), '[AEIOU]', '', 'g');
    v_base := left(v_ult, 1) || left(v_cons, 1);
    IF length(v_base) < 2 THEN v_base := left(v_ult, 2); END IF;
    FOR i IN 2 .. least(length(v_cons), c_max_sigla - 1) LOOP
      v_cands := array_append(v_cands, left(v_ult, 1) || left(v_cons, i));
    END LOOP;
    FOR i IN 3 .. least(length(v_ult), c_max_sigla) LOOP
      v_cands := array_append(v_cands, left(v_ult, i));
    END LOOP;
  ELSE
    -- várias palavras: as iniciais (até 4); depois as consoantes e as letras seguintes da última palavra usada
    v_base := array_to_string(ARRAY(SELECT left(t.w, 1) FROM unnest(v_pal[1:c_max_iniciais]) WITH ORDINALITY AS t(w, o) ORDER BY t.o), '');
    v_ult := left(v_pal[least(cardinality(v_pal), c_max_iniciais)], c_max_sigla * 4);
    v_resto := substr(v_ult, 2);
    v_cons := regexp_replace(v_resto, '[AEIOU]', '', 'g');
    FOR i IN 1 .. least(length(v_cons), c_max_sigla - length(v_base)) LOOP
      v_cands := array_append(v_cands, v_base || left(v_cons, i));
    END LOOP;
    FOR i IN 1 .. least(length(v_resto), c_max_sigla - length(v_base)) LOOP
      v_cands := array_append(v_cands, v_base || left(v_resto, i));
    END LOOP;
  END IF;

  v_cands := array_prepend(v_base, v_cands);
  FOREACH v_cand IN ARRAY v_cands LOOP
    IF v_cand ~ '^[A-Z0-9]{1,6}$' AND NOT (v_cand = ANY (v_usadas)) THEN
      RETURN v_cand;
    END IF;
  END LOOP;
  -- tudo ocupado: a base com um número (AZ2, AZ3, …)
  FOR i IN 2 .. c_max_numero LOOP
    v_cand := left(v_base, c_max_sigla - length(i::text)) || i::text;
    IF NOT (v_cand = ANY (v_usadas)) THEN
      RETURN v_cand;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- Uma sigla livre para uma categoria (irmãs = mesma organização e mesmo pai, apagadas incluídas), com pelo menos uma letra.
CREATE OR REPLACE FUNCTION public.fn_cat_sigla_categoria_livre(p_org uuid, p_pai uuid, p_nome text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_usadas text[]; v text;
BEGIN
  v_usadas := ARRAY(SELECT pc.sigla FROM product_categories pc
                    WHERE pc.organization_id IS NOT DISTINCT FROM p_org AND pc.parent_id IS NOT DISTINCT FROM p_pai
                      AND pc.sigla IS NOT NULL AND pc.id IS DISTINCT FROM p_id);
  v := public.fn_cat_sugerir_sigla(p_nome, v_usadas);
  IF v IS NOT NULL AND v !~ '[A-Z]' THEN
    -- um nome só de algarismos («2024»): a sigla de uma categoria leva uma letra
    v := public.fn_cat_sugerir_sigla('C ' || coalesce(p_nome, ''), v_usadas);
  END IF;
  RETURN (CASE WHEN v ~ '[A-Z]' THEN v END);
END $$;

-- Uma sigla livre para uma opção (irmãs = o mesmo grupo, ativas e desativadas).
CREATE OR REPLACE FUNCTION public.fn_cat_sigla_opcao_livre(p_grupo uuid, p_nome text, p_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT public.fn_cat_sugerir_sigla(p_nome,
           ARRAY(SELECT o.sigla FROM attribute_option_group_values o
                 WHERE o.group_id = p_grupo AND o.sigla IS NOT NULL AND o.id IS DISTINCT FROM p_id))
$$;

-- A medida no SKU: 60X30, 60X30X2, 7P5X30 (ponto = P), «MM» no fim se for em mm. NULL se não for uma medida válida:
-- as regras de fn_cat_dimensao (> 0, até 100000, no máximo 3 casas decimais); 3D precisa da espessura. Os limites são
-- verificados ANTES de escrever o número (1e100000 não chega a virar texto).
CREATE OR REPLACE FUNCTION public.fn_cat_sku_medida(p_medida jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  c_max constant numeric := 100000;
  c_casas constant integer := 3;
  v_m jsonb; v_nome text; v numeric; v_txt text[] := '{}';
BEGIN
  v_m := public.fn_cat_medida_ler(p_medida, NULL);
  IF v_m IS NULL THEN RETURN NULL; END IF;
  FOREACH v_nome IN ARRAY (CASE WHEN v_m ->> 'tipo' = '3D' THEN ARRAY['largura', 'comprimento', 'espessura']
                                ELSE ARRAY['largura', 'comprimento'] END) LOOP
    IF jsonb_typeof(v_m -> v_nome) IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
    v := (v_m ->> v_nome)::numeric;
    IF v <= 0 OR v > c_max THEN RETURN NULL; END IF;
    v := trim_scale(v);
    IF scale(v) > c_casas THEN RETURN NULL; END IF;
    v_txt := array_append(v_txt, replace(v::text, '.', 'P'));
  END LOOP;
  RETURN array_to_string(v_txt, 'X') || (CASE WHEN lower(v_m ->> 'unidade') = 'mm' THEN 'MM' ELSE '' END);
END $$;

-- As partes do SKU: prefixo (CAT ou CAT-SUB; NULL se faltar o que o bloqueia), resto (um segmento por atributo que entra,
-- por sku_ordem) e faltas. p_vals: [{"atributo":uuid,"sigla":text|null,"medida":{tipo,largura,…}|null}] já resolvidos
-- (só os atributos que o produto tem). Faltas que bloqueiam: categoria, sigla_categoria, subcategoria, sigla_subcategoria.
-- Informativas (o segmento fica de fora): sigla:<código do atributo> (opção sem sigla), medida:<código> (medida inválida).
-- Um atributo com sku_entra = false nunca entra nem gera falta.
CREATE OR REPLACE FUNCTION public.fn_cat_sku_partes(p_org uuid, p_cat uuid, p_sub uuid, p_vals jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_cat uuid := p_cat; v_ok boolean; v_pai uuid; v_cat_sigla text; v_sub_sigla text;
  v_faltas text[] := '{}'; v_bloqueia boolean := false; v_resto text; v_sem text[];
BEGIN
  IF v_cat IS NULL AND p_sub IS NOT NULL THEN
    SELECT pc.parent_id INTO v_cat FROM product_categories pc WHERE pc.id = p_sub;
  END IF;
  IF v_cat IS NULL THEN
    v_faltas := array_append(v_faltas, 'categoria'); v_bloqueia := true;
  ELSE
    SELECT true, pc.parent_id, pc.sigla INTO v_ok, v_pai, v_cat_sigla FROM product_categories pc
    WHERE pc.id = v_cat AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
    IF NOT coalesce(v_ok, false) OR v_pai IS NOT NULL THEN
      v_faltas := array_append(v_faltas, 'categoria'); v_bloqueia := true;
    ELSIF v_cat_sigla IS NULL THEN
      v_faltas := array_append(v_faltas, 'sigla_categoria'); v_bloqueia := true;
    END IF;
  END IF;

  IF p_sub IS NOT NULL THEN
    v_ok := NULL; v_pai := NULL;
    SELECT true, pc.parent_id, pc.sigla INTO v_ok, v_pai, v_sub_sigla FROM product_categories pc
    WHERE pc.id = p_sub AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
    IF NOT coalesce(v_ok, false) OR v_pai IS DISTINCT FROM v_cat THEN
      v_faltas := array_append(v_faltas, 'subcategoria'); v_bloqueia := true;
    ELSIF v_sub_sigla IS NULL THEN
      v_faltas := array_append(v_faltas, 'sigla_subcategoria'); v_bloqueia := true;
    END IF;
  END IF;

  -- um segmento por atributo que entra no SKU, pela ordem configurada
  WITH x AS (
    SELECT e.atributo, a.code::text AS codigo, a.is_measurement AS e_medida, a.sku_ordem,
           coalesce(a.sort_order, 0) AS ordem, a.label::text AS nome,
           (CASE WHEN a.is_measurement THEN public.fn_cat_sku_medida(e.medida) ELSE e.sigla END) AS seg
    FROM jsonb_to_recordset(coalesce(p_vals, '[]'::jsonb)) AS e(atributo uuid, sigla text, medida jsonb)
    JOIN product_attributes a ON a.id = e.atributo AND a.organization_id = p_org AND a.deleted_at IS NULL AND a.sku_entra
  )
  SELECT string_agg(x.seg, '-' ORDER BY x.sku_ordem NULLS LAST, x.ordem, x.nome, x.atributo) FILTER (WHERE x.seg IS NOT NULL),
         array_agg((CASE WHEN x.e_medida THEN 'medida:' ELSE 'sigla:' END) || x.codigo
                   ORDER BY x.sku_ordem NULLS LAST, x.ordem, x.nome, x.atributo) FILTER (WHERE x.seg IS NULL)
    INTO v_resto, v_sem
  FROM x;
  v_faltas := v_faltas || coalesce(v_sem, '{}'::text[]);

  RETURN jsonb_build_object(
    'prefixo', (CASE WHEN v_bloqueia THEN NULL ELSE concat_ws('-', v_cat_sigla, v_sub_sigla) END),
    'resto', nullif(v_resto, ''),
    'faltas', to_jsonb(v_faltas));
END $$;

-- O NNNN seguinte para um prefixo na organização (apagados incluídos: o número não se reutiliza).
CREATE OR REPLACE FUNCTION public.fn_cat_sku_proximo(p_org uuid, p_prefixo text, p_excluir uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(max(substring(p.sku FROM '^' || p_prefixo || '-([0-9]{4})(-|$)')::integer), 0) + 1
  FROM products p
  WHERE p.organization_id = p_org AND p.sku ~ ('^' || p_prefixo || '-[0-9]{4}(-|$)') AND p.id IS DISTINCT FROM p_excluir
$$;

-- A ordem inicial do SKU dos atributos vivos de uma organização que a não têm: cor, tonalidade, textura, brilho,
-- tipo_grelha, medida, depois os outros por sort_order; a seguir aos que já a têm. Devolve quantos preencheu.
CREATE OR REPLACE FUNCTION public.fn_cat_sku_ordem_inicial(p_org uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  c_inicial constant text[] := ARRAY['cor', 'tonalidade', 'textura', 'brilho', 'tipo_grelha', 'medida'];
  v_base integer; v_n integer;
BEGIN
  SELECT coalesce(max(b.sku_ordem), 0) INTO v_base FROM product_attributes b WHERE b.organization_id = p_org AND b.deleted_at IS NULL;
  UPDATE product_attributes pa SET sku_ordem = x.n
  FROM (SELECT a.id,
               v_base + row_number() OVER (ORDER BY coalesce(array_position(c_inicial, a.code::text), 1000),
                                                    coalesce(a.sort_order, 0), a.label, a.id)::integer AS n
        FROM product_attributes a
        WHERE a.organization_id = p_org AND a.sku_ordem IS NULL AND a.deleted_at IS NULL) x
  WHERE pa.id = x.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.fn_cat_sugerir_sigla(text,text[]), public.fn_cat_sigla_categoria_livre(uuid,uuid,text,uuid),
  public.fn_cat_sigla_opcao_livre(uuid,text,uuid), public.fn_cat_sku_medida(jsonb), public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb),
  public.fn_cat_sku_proximo(uuid,text,uuid), public.fn_cat_sku_ordem_inicial(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 3. Preencher o que falta (todas as organizações; idempotente) ──────────────
DO $b$
DECLARE r record; v text; v_nc integer := 0; v_no integer := 0; v_na integer := 0;
BEGIN
  PERFORM set_config('app.audit_source', 'migration:20270118000000_catalogo_siglas_e_sku', true);
  -- categorias e subcategorias: por âmbito, as vivas primeiro, pela ordem do ecrã (a primeira fica com a sigla mais curta)
  FOR r IN SELECT c.id, c.name, c.organization_id, c.parent_id FROM product_categories c
           WHERE c.sigla IS NULL
           ORDER BY c.organization_id NULLS FIRST, c.parent_id NULLS FIRST, (c.deleted_at IS NOT NULL),
                    coalesce(c.sort_order, 0), c.name, c.id LOOP
    v := public.fn_cat_sigla_categoria_livre(r.organization_id, r.parent_id, r.name, r.id);
    IF v IS NULL THEN RAISE EXCEPTION 'Sem sigla livre para a categoria %.', r.id; END IF;
    UPDATE product_categories SET sigla = v WHERE id = r.id;
    v_nc := v_nc + 1;
  END LOOP;
  -- opções: por grupo, pela ordem do ecrã
  FOR r IN SELECT o.id, o.group_id, coalesce(o.display_name, o.value_text)::text AS nome FROM attribute_option_group_values o
           WHERE o.sigla IS NULL
           ORDER BY o.group_id, coalesce(o.sort_order, 0), o.value_text, o.id LOOP
    v := public.fn_cat_sigla_opcao_livre(r.group_id, r.nome, r.id);
    IF v IS NULL THEN RAISE EXCEPTION 'Sem sigla livre para a opção %.', r.id; END IF;
    UPDATE attribute_option_group_values SET sigla = v WHERE id = r.id;
    v_no := v_no + 1;
  END LOOP;
  -- a ordem do SKU dos atributos vivos que a não têm, organização a organização
  FOR r IN SELECT DISTINCT a.organization_id FROM product_attributes a
           WHERE a.sku_ordem IS NULL AND a.deleted_at IS NULL AND a.organization_id IS NOT NULL LOOP
    v_na := v_na + public.fn_cat_sku_ordem_inicial(r.organization_id);
  END LOOP;
  RAISE NOTICE 'catalogo_siglas_e_sku: siglas em % categorias/subcategorias e % opções; ordem do SKU em % atributos.', v_nc, v_no, v_na;
END $b$;

-- únicas por âmbito (criadas depois do preenchimento: se ele repetisse alguma, falhava aqui)
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_sigla_ambito_key
  ON public.product_categories (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), sigla)
  WHERE sigla IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attribute_option_group_values_sigla_key
  ON public.attribute_option_group_values (group_id, sigla) WHERE sigla IS NOT NULL;

-- ─── 4. Gatilhos: o que se preenche ao criar ────────────────────────────────────
-- Normalizam o valor escrito (maiúsculas, sem espaços); vazio = escolhe. Nunca impedem a criação: um erro deixa o campo vazio.
CREATE OR REPLACE FUNCTION public.fn_cat_sigla_categoria_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.sigla := nullif(upper(btrim(NEW.sigla)), '');
  IF NEW.sigla IS NULL THEN
    BEGIN
      -- um de cada vez neste âmbito (organização + pai): duas criações ao mesmo tempo não escolhem a mesma
      PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || coalesce(NEW.organization_id::text, '-') || ':'
                                                     || coalesce(NEW.parent_id::text, '-'), 0));
      NEW.sigla := public.fn_cat_sigla_categoria_livre(NEW.organization_id, NEW.parent_id, NEW.name, NEW.id);
    EXCEPTION WHEN OTHERS THEN
      NEW.sigla := NULL;
      RAISE WARNING 'Sigla da categoria % ficou por preencher (%: %).', NEW.id, SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_cat_sigla_opcao_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.sigla := nullif(upper(btrim(NEW.sigla)), '');
  IF NEW.sigla IS NULL THEN
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || NEW.group_id::text, 0));
      NEW.sigla := public.fn_cat_sigla_opcao_livre(NEW.group_id, coalesce(NEW.display_name, NEW.value_text)::text, NEW.id);
    EXCEPTION WHEN OTHERS THEN
      NEW.sigla := NULL;
      RAISE WARNING 'Sigla da opção % ficou por preencher (%: %).', NEW.id, SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

-- Um atributo novo fica no fim da ordem do SKU da organização. A chave do lock é a de cat_guardar_sku_config, que a
-- toma DEPOIS da de cat_guardar_atributo — a mesma ordem de quem cria um atributo por cat_guardar_atributo.
CREATE OR REPLACE FUNCTION public.fn_cat_sku_ordem_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.sku_ordem IS NULL AND NEW.organization_id IS NOT NULL THEN
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || NEW.organization_id::text, 0));
      NEW.sku_ordem := coalesce((SELECT max(pa.sku_ordem) FROM product_attributes pa
                                 WHERE pa.organization_id = NEW.organization_id AND pa.deleted_at IS NULL), 0) + 1;
    EXCEPTION WHEN OTHERS THEN
      NEW.sku_ordem := NULL;
      RAISE WARNING 'Posição no SKU do atributo % ficou por preencher (%: %).', NEW.id, SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_cat_sigla_categoria_trg(), public.fn_cat_sigla_opcao_trg(), public.fn_cat_sku_ordem_trg()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cat_sigla_categoria ON public.product_categories;
CREATE TRIGGER trg_cat_sigla_categoria BEFORE INSERT ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_cat_sigla_categoria_trg();
DROP TRIGGER IF EXISTS trg_cat_sigla_opcao ON public.attribute_option_group_values;
CREATE TRIGGER trg_cat_sigla_opcao BEFORE INSERT ON public.attribute_option_group_values
  FOR EACH ROW EXECUTE FUNCTION public.fn_cat_sigla_opcao_trg();
DROP TRIGGER IF EXISTS trg_cat_sku_ordem ON public.product_attributes;
CREATE TRIGGER trg_cat_sku_ordem BEFORE INSERT ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.fn_cat_sku_ordem_trg();

-- ─── 5. Mudar a sigla de uma categoria / subcategoria ───────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_sigla_categoria(p_org uuid, p_id uuid, p_sigla text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 100;
  v_sigla text; v_ok boolean; v_org uuid; v_pai uuid; v_nome text; v_ex uuid;
BEGIN
  IF length(p_sigla) > c_max_texto THEN RAISE EXCEPTION 'A sigla é demasiado longa.' USING ERRCODE = 'CT002'; END IF;
  v_sigla := upper(translate(btrim(coalesce(p_sigla, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ', 'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY'));
  IF v_sigla = '' THEN RAISE EXCEPTION 'Escreva a sigla.' USING ERRCODE = 'CT002'; END IF;
  IF v_sigla !~ '^[A-Z0-9]{1,6}$' THEN
    RAISE EXCEPTION 'A sigla tem de ter de 1 a 6 letras ou algarismos, sem espaços nem sinais.' USING ERRCODE = 'CT002';
  END IF;
  IF v_sigla !~ '[A-Z]' THEN
    RAISE EXCEPTION 'A sigla de uma categoria tem de ter pelo menos uma letra.' USING ERRCODE = 'CT002';
  END IF;

  -- o pai não muda (cat_guardar_categoria_produto não muda de sítio): lê-se para saber o âmbito do lock
  SELECT true, pc.organization_id, pc.parent_id INTO v_ok, v_org, v_pai FROM product_categories pc
  WHERE pc.id = p_id AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002'; END IF;

  -- a mesma chave do gatilho de criação, e só depois a linha
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || p_org::text || ':' || coalesce(v_pai::text, '-'), 0));
  SELECT pc.name INTO v_nome FROM product_categories pc
  WHERE pc.id = p_id AND pc.organization_id = p_org AND pc.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;

  SELECT pc.id INTO v_ex FROM product_categories pc
  WHERE pc.organization_id = p_org AND pc.parent_id IS NOT DISTINCT FROM v_pai AND pc.deleted_at IS NULL
    AND pc.sigla = v_sigla AND pc.id <> p_id
  ORDER BY pc.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION '%', (CASE WHEN v_pai IS NULL THEN 'Já existe uma categoria com esta sigla.'
                               ELSE 'Já existe uma subcategoria com esta sigla nesta categoria.' END)
      USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  BEGIN
    UPDATE product_categories pc SET sigla = v_sigla WHERE pc.id = p_id AND pc.sigla IS DISTINCT FROM v_sigla;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma categoria com esta sigla.' USING ERRCODE = 'CT004',
      DETAIL = coalesce((SELECT pc.id::text FROM product_categories pc
                         WHERE pc.organization_id = p_org AND pc.parent_id IS NOT DISTINCT FROM v_pai
                           AND pc.deleted_at IS NULL AND pc.sigla = v_sigla AND pc.id <> p_id LIMIT 1), '');
  END;

  RETURN jsonb_build_object('categoria', jsonb_build_object('id', p_id, 'nome', v_nome, 'pai', v_pai, 'sigla', v_sigla));
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_sigla_categoria(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_sigla_categoria(uuid,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_sigla_categoria(uuid,uuid,text) IS
  'Catálogo (20270118000000): muda a sigla (SKU) de uma categoria ou subcategoria da organização: 1 a 6 letras/algarismos, em maiúsculas, com pelo menos uma letra. Repetida entre as irmãs: CT004 com o id no DETAIL. Partilhada: CT002. Os SKU já gerados não mudam. Permissão products.edit.';

-- ─── 6. Mudar a sigla de uma opção ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_sigla_opcao(p_org uuid, p_opcao uuid, p_sigla text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 100;
  v_sigla text; v_ok boolean; v_grupo uuid; v_grupo_org uuid; v_valor text; v_nome text; v_ex uuid;
BEGIN
  IF length(p_sigla) > c_max_texto THEN RAISE EXCEPTION 'A sigla é demasiado longa.' USING ERRCODE = 'CT002'; END IF;
  v_sigla := upper(translate(btrim(coalesce(p_sigla, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ', 'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY'));
  IF v_sigla = '' THEN RAISE EXCEPTION 'Escreva a sigla.' USING ERRCODE = 'CT002'; END IF;
  IF v_sigla !~ '^[A-Z0-9]{1,6}$' THEN
    RAISE EXCEPTION 'A sigla tem de ter de 1 a 6 letras ou algarismos, sem espaços nem sinais.' USING ERRCODE = 'CT002';
  END IF;

  -- a opção de um atributo da organização (não apagado), num grupo da organização ou global
  SELECT true, g.id, g.organization_id INTO v_ok, v_grupo, v_grupo_org
  FROM attribute_option_group_values ov
  JOIN attribute_option_groups g ON g.id = ov.group_id
  JOIN product_attributes pa ON pa.id = g.attribute_id
  WHERE ov.id = p_opcao AND pa.organization_id = p_org AND pa.deleted_at IS NULL
    AND (g.organization_id = p_org OR g.organization_id IS NULL);
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF v_grupo_org IS NULL THEN RAISE EXCEPTION 'Opção partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002'; END IF;

  -- a mesma chave do gatilho de criação, e só depois a linha
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_grupo::text, 0));
  SELECT ov.value_text::text, coalesce(ov.display_name, ov.value_text)::text INTO v_valor, v_nome
  FROM attribute_option_group_values ov WHERE ov.id = p_opcao AND ov.group_id = v_grupo FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;

  SELECT o.id INTO v_ex FROM attribute_option_group_values o
  WHERE o.group_id = v_grupo AND o.sigla = v_sigla AND o.id <> p_opcao ORDER BY o.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma opção com esta sigla neste atributo.' USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  BEGIN
    UPDATE attribute_option_group_values o SET sigla = v_sigla WHERE o.id = p_opcao AND o.sigla IS DISTINCT FROM v_sigla;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma opção com esta sigla neste atributo.' USING ERRCODE = 'CT004',
      DETAIL = coalesce((SELECT o.id::text FROM attribute_option_group_values o
                         WHERE o.group_id = v_grupo AND o.sigla = v_sigla AND o.id <> p_opcao LIMIT 1), '');
  END;

  RETURN jsonb_build_object('opcao', jsonb_build_object('id', p_opcao, 'valor', v_valor, 'nome', v_nome, 'sigla', v_sigla));
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_sigla_opcao(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_sigla_opcao(uuid,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_sigla_opcao(uuid,uuid,text) IS
  'Catálogo (20270118000000): muda a sigla (SKU) de uma opção de atributo da organização: 1 a 6 letras/algarismos, em maiúsculas. Repetida no mesmo atributo: CT004 com o id no DETAIL. Opção partilhada (grupo global): CT002. Os SKU já gerados não mudam. Permissão products.edit.';

-- ─── 7. A ordem dos atributos no SKU ────────────────────────────────────────────
-- p_itens = [{"atributo":uuid,"entra":boolean}] na ordem desejada (posição 1..n = sku_ordem), com TODOS os atributos vivos
-- da organização, cada um uma vez (no máximo 200 = o teto de cat_guardar_atributo). Não reescreve nenhum SKU.
CREATE OR REPLACE FUNCTION public.cat_guardar_sku_config(p_org uuid, p_itens jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_itens constant integer := 200;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_el jsonb; v_i bigint; v_attr uuid; v_ids uuid[] := '{}'; v_entra boolean[] := '{}'; v_n integer;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A ordem do SKU tem de trazer a lista dos atributos.' USING ERRCODE = 'CT002';
  END IF;
  IF jsonb_array_length(p_itens) > c_max_itens THEN
    RAISE EXCEPTION 'A ordem do SKU tem no máximo 200 atributos.' USING ERRCODE = 'CT002';
  END IF;

  -- primeiro a chave de quem cria atributos, depois a da ordem (a mesma ordem do gatilho de criação)
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || p_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || p_org::text, 0));

  FOR v_el, v_i IN SELECT t.e, t.i FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(e, i) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR coalesce(v_el ->> 'atributo', '') !~ c_uuid THEN
      RAISE EXCEPTION 'O item n.º % não diz qual é o atributo.', v_i USING ERRCODE = 'CT002';
    END IF;
    IF jsonb_typeof(v_el -> 'entra') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'O item n.º % não diz se o atributo entra no SKU (true ou false).', v_i USING ERRCODE = 'CT002';
    END IF;
    v_attr := (v_el ->> 'atributo')::uuid;
    IF NOT EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.id = v_attr AND pa.organization_id = p_org AND pa.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003';
    END IF;
    IF v_attr = ANY (v_ids) THEN
      RAISE EXCEPTION 'O item n.º % repete um atributo.', v_i USING ERRCODE = 'CT002';
    END IF;
    v_ids := array_append(v_ids, v_attr);
    v_entra := array_append(v_entra, (v_el ->> 'entra')::boolean);
  END LOOP;

  IF EXISTS (SELECT 1 FROM product_attributes pa
             WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL AND NOT (pa.id = ANY (v_ids))) THEN
    RAISE EXCEPTION 'A ordem do SKU tem de trazer todos os atributos, cada um uma vez.' USING ERRCODE = 'CT002';
  END IF;

  UPDATE product_attributes pa SET sku_ordem = t.i::integer, sku_entra = t.e
  FROM unnest(v_ids, v_entra) WITH ORDINALITY AS t(id, e, i)
  WHERE pa.id = t.id AND pa.organization_id = p_org
    AND (pa.sku_ordem, pa.sku_entra) IS DISTINCT FROM (t.i::integer, t.e);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'n', cardinality(v_ids), 'alteradas', v_n);
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_sku_config(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_sku_config(uuid,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_sku_config(uuid,jsonb) IS
  'Catálogo (20270118000000): a ordem dos atributos no SKU e quais entram. p_itens = [{atributo, entra}] na ordem desejada, com todos os atributos vivos da organização, cada um uma vez (máximo 200). Não reescreve nenhum SKU: conta quando o SKU de um produto volta a ser gerado. Permissão products.edit.';

-- ─── 8. Gerar o SKU de um produto (último passo ao gravar) ──────────────────────
CREATE OR REPLACE FUNCTION public.cat_gerar_sku_produto(p_org uuid, p_produto uuid, p_forcar boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_numero constant integer := 9999;
  c_max_tentativas constant integer := 20;
  v_ok boolean; v_sku text; v_gerado boolean; v_tipo text; v_cat uuid; v_sub uuid;
  v_vals jsonb; v_partes jsonb; v_faltas text[]; v_prefixo text; v_resto text;
  v_num text; v_n integer; v_cand text; v_tent integer := 0; v_feito boolean := false; v_fonte text;
BEGIN
  SELECT true, p.sku, p.sku_gerado, p.tipo_catalogo, p.category_id, p.subcategory_id INTO v_ok, v_sku, v_gerado, v_tipo, v_cat, v_sub
  FROM products p WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.is_deleted FOR UPDATE;
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF v_tipo IS DISTINCT FROM 'produto' THEN
    RAISE EXCEPTION '%', (CASE WHEN v_tipo = 'consumivel' THEN 'Os consumíveis não têm SKU gerado: só os produtos.'
                               ELSE 'Este artigo não é um produto do Catálogo.' END)
      USING ERRCODE = 'CT002';
  END IF;

  -- o que está gravado: as opções (com a sigla da opção do grupo em uso) e as medidas
  v_vals := (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'atributo', v.attribute_id,
             'sigla', o.sigla,
             'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
    FROM product_attribute_values v
    JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = p_org AND a.deleted_at IS NULL
    LEFT JOIN attribute_option_group_values o
      ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, p_org) AND o.value_text = v.value_text
    WHERE v.product_id = p_produto);
  v_partes := public.fn_cat_sku_partes(p_org, v_cat, v_sub, v_vals);
  v_faltas := ARRAY(SELECT jsonb_array_elements_text(v_partes -> 'faltas'));
  v_prefixo := v_partes ->> 'prefixo';
  v_resto := v_partes ->> 'resto';

  IF v_prefixo IS NULL THEN
    RETURN jsonb_build_object('sku', v_sku, 'gerado', false, 'faltas', to_jsonb(v_faltas), 'motivo', 'faltas');
  END IF;
  -- substitui: o provisório de cat_guardar_produto (CAT- e 10 hexadecimais), vazio, ou um SKU já gerado (regenera);
  -- um SKU escrito à mão só com p_forcar
  IF NOT (v_sku IS NULL OR btrim(v_sku) = '' OR v_sku ~ '^CAT-[0-9A-F]{10}$' OR v_gerado) AND NOT coalesce(p_forcar, false) THEN
    RETURN jsonb_build_object('sku', v_sku, 'gerado', false, 'faltas', to_jsonb(v_faltas), 'motivo', 'sku_manual');
  END IF;

  -- um de cada vez por organização e prefixo
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku:' || p_org::text || ':' || v_prefixo, 0));
  -- já com este prefixo: mantém o seu número; senão o seguinte
  v_num := substring(v_sku FROM '^' || v_prefixo || '-([0-9]{4})(-|$)');
  IF v_num IS NOT NULL AND v_num <> '0000' THEN
    v_n := v_num::integer;
  ELSE
    v_n := public.fn_cat_sku_proximo(p_org, v_prefixo, p_produto);
  END IF;

  -- a auditoria regista a origem desta escrita; repõe-se a anterior no fim
  v_fonte := current_setting('app.audit_source', true);
  PERFORM set_config('app.audit_source', 'fn:cat_gerar_sku_produto', true);
  LOOP
    IF v_n > c_max_numero THEN
      RAISE EXCEPTION 'Já não há números livres (9999) para o SKU %.', v_prefixo USING ERRCODE = 'CT002';
    END IF;
    v_cand := concat_ws('-', v_prefixo, lpad(v_n::text, 4, '0'), v_resto);
    IF v_cand = v_sku THEN
      -- já é este (um SKU escrito à mão igual ao gerado passa a gerado)
      UPDATE products p SET sku_gerado = true WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.sku_gerado;
      EXIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = p_org AND p.sku = v_cand AND p.id <> p_produto) THEN
      BEGIN
        UPDATE products p SET sku = v_cand, sku_gerado = true WHERE p.id = p_produto AND p.organization_id = p_org;
        v_feito := true;
      EXCEPTION WHEN unique_violation THEN
        v_feito := false;  -- criado ao mesmo tempo por outro caminho: tenta o seguinte
      END;
      EXIT WHEN v_feito;
    END IF;
    v_tent := v_tent + 1;
    IF v_tent >= c_max_tentativas THEN
      RAISE EXCEPTION 'Não foi possível encontrar um SKU livre para %.', v_prefixo USING ERRCODE = 'CT002';
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('app.audit_source', coalesce(v_fonte, ''), true);

  RETURN jsonb_build_object('sku', v_cand, 'gerado', true, 'faltas', to_jsonb(v_faltas), 'motivo', NULL);
END $$;
REVOKE ALL ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) IS
  'Catálogo (20270118000000): gera o SKU de um produto a partir do que está gravado: CAT-SUB-NNNN-<um segmento por atributo que entra e que o produto tem, pela ordem de cat_guardar_sku_config: sigla da opção, medida 60X30 / 7P5X30X2MM>. NNNN = o seguinte por organização e prefixo. Substitui o provisório CAT-…, vazio, ou um SKU já gerado (sku_gerado; regenera mantendo o número se o prefixo for o mesmo); um SKU escrito à mão só com p_forcar, e passa a gerado. Sem categoria ou sem sigla: não gera (gerado=false, faltas). Chamar como último passo ao gravar. Permissão products.edit.';

-- ─── 9. Pré-visualizar o SKU (só leitura) ───────────────────────────────────────
-- p_atributos no formato de cat_guardar_produto_atributos: [{"atributo":uuid,"opcao":uuid}|{"atributo":uuid,"medida":{…}}].
-- Um atributo sem opção ou com a medida incompleta fica de fora (o ecrã chama isto enquanto se preenche).
CREATE OR REPLACE FUNCTION public.cat_prever_sku(p_org uuid, p_categoria uuid, p_subcategoria uuid, p_atributos jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_max_valores constant integer := 50;
  c_max_numero constant integer := 9999;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_el jsonb; v_i bigint; v_attr uuid; v_attrs uuid[] := '{}'; v_label text; v_medida boolean; v_unit text;
  v_opc jsonb; v_med jsonb; v_sigla text; v_vals jsonb := '[]'::jsonb; v_partes jsonb; v_faltas text[]; v_prefixo text; v_n integer;
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
  v_faltas := ARRAY(SELECT jsonb_array_elements_text(v_partes -> 'faltas'));
  v_prefixo := v_partes ->> 'prefixo';
  IF v_prefixo IS NULL THEN
    RETURN jsonb_build_object('sku', NULL, 'faltas', to_jsonb(v_faltas));
  END IF;
  -- o número que seria o seguinte agora (não se reserva: confirma-se ao guardar)
  v_n := public.fn_cat_sku_proximo(p_org, v_prefixo, NULL);
  IF v_n > c_max_numero THEN
    RETURN jsonb_build_object('sku', NULL, 'faltas', to_jsonb(array_append(v_faltas, 'numero')));
  END IF;
  RETURN jsonb_build_object('sku', concat_ws('-', v_prefixo, lpad(v_n::text, 4, '0'), v_partes ->> 'resto'),
                            'faltas', to_jsonb(v_faltas));
END $$;
REVOKE ALL ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) IS
  'Catálogo (20270118000000): mostra o SKU que um produto teria com esta categoria, subcategoria e atributos (formato de cat_guardar_produto_atributos), pela ordem configurada, com o número seguinte de agora, sem o reservar (confirma-se ao guardar). Sem categoria ou sem sigla: sku null e faltas. Permissão products.edit ou services.view.';

-- ─── 10. Leituras com os campos novos — os corpos aplicados (md5 conferido na guarda) + os campos ─────
CREATE OR REPLACE FUNCTION public.cat_ler_categorias_gestao(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH prod AS (
      -- produtos e consumíveis vivos do Catálogo, como cat_ler_produtos_tabelas
      SELECT p.category_id, p.subcategory_id FROM products p
      WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo IS NOT NULL
    ),
    uso_cat AS (SELECT x.category_id AS id, count(*)::integer AS n FROM prod x WHERE x.category_id IS NOT NULL GROUP BY x.category_id),
    uso_sub AS (SELECT x.subcategory_id AS id, count(*)::integer AS n FROM prod x WHERE x.subcategory_id IS NOT NULL GROUP BY x.subcategory_id),
    topo AS (
      -- 20270118000000: "sigla"
      SELECT c.id, c.name, coalesce(c.sort_order, 0) AS ordem, coalesce(c.is_active, true) AS ativo, (c.organization_id IS NULL) AS global, c.sigla
      FROM product_categories c
      WHERE c.parent_id IS NULL AND c.deleted_at IS NULL
        AND (c.organization_id = p_org
             OR (c.organization_id IS NULL
                 AND (c.id IN (SELECT j.category_id FROM product_category_organizations j WHERE j.organization_id = p_org)
                      OR c.id IN (SELECT u.id FROM uso_cat u))))
    ),
    sub AS (
      SELECT s.id, s.parent_id, s.name, coalesce(s.sort_order, 0) AS ordem, coalesce(s.is_active, true) AS ativo, (s.organization_id IS NULL) AS global, s.sigla
      FROM product_categories s
      WHERE s.parent_id IN (SELECT t.id FROM topo t) AND s.deleted_at IS NULL
        AND (s.organization_id = p_org OR s.organization_id IS NULL)
    )
    SELECT jsonb_build_object('categorias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'nome', t.name, 'ordem', t.ordem, 'ativo', t.ativo, 'global', t.global,
               'usados', coalesce(uc.n, 0), 'sigla', t.sigla,
               'subcategorias', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', s.id, 'nome', s.name, 'ordem', s.ordem, 'ativo', s.ativo, 'global', s.global,
                          'usados', coalesce(us.n, 0), 'sigla', s.sigla)
                        ORDER BY s.ordem, s.name, s.id)
                 FROM sub s LEFT JOIN uso_sub us ON us.id = s.id
                 WHERE s.parent_id = t.id), '[]'::jsonb))
             ORDER BY t.ordem, t.name, t.id)
      FROM topo t LEFT JOIN uso_cat uc ON uc.id = t.id), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_categorias_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_categorias_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_categorias_gestao(uuid) IS
  'Catálogo (20270117700000, "sigla" em 20270118000000): ecrã de gestão das categorias de produto. Categorias de topo e subcategorias da organização (não apagadas, ativas e desativadas) e as globais ligadas a ela ("global": true, só leitura), com quantos produtos e consumíveis vivos usam cada uma e a sigla do SKU. Permissão products.edit ou services.view.';

CREATE OR REPLACE FUNCTION public.cat_ler_atributos_gestao(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- o ecrã de gestão: quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH atr AS (
      -- 20270118000000: "sku_ordem" e "sku_entra"
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             coalesce(a.sort_order, 0) AS ordem, a.sku_ordem, a.sku_entra,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    -- uma só passagem pelos valores: quantos produtos vivos por atributo e texto
    uso AS (
      SELECT v.attribute_id, v.value_text, count(*)::integer AS n
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
      GROUP BY v.attribute_id, v.value_text
    ),
    uso_atr AS (SELECT u.attribute_id, sum(u.n)::integer AS n FROM uso u GROUP BY u.attribute_id),
    opc AS (
      -- 20270118000000: "sigla"
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active AS ativo, o.sigla
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'ordem', a.ordem, 'ativo', true,
               'usados', coalesce(ua.n, 0), 'sku_ordem', a.sku_ordem, 'sku_entra', a.sku_entra,
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'valor', o.valor, 'nome', o.nome,
                          'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem, 'ativo', o.ativo,
                          'usados', coalesce(u.n, 0), 'sigla', o.sigla)
                        ORDER BY o.ordem, o.valor, o.id)
                 FROM opc o
                 LEFT JOIN uso u ON u.attribute_id = a.id AND u.value_text = o.valor
                 WHERE o.group_id = a.grupo), '[]'::jsonb) END)
             ORDER BY a.ordem, a.label, a.id)
      FROM atr a LEFT JOIN uso_atr ua ON ua.attribute_id = a.id), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_atributos_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_atributos_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_atributos_gestao(uuid) IS
  'Catálogo (20270117600000; "sku_ordem", "sku_entra" e "sigla" das opções em 20270118000000): ecrã de gestão dos atributos. Todos os atributos da organização (não apagados) com a posição no SKU e se entram, TODAS as opções do grupo (ativas e desativadas) com a sigla, e quantos produtos vivos usam cada atributo e cada opção. Permissão products.edit ou services.view.';

CREATE OR REPLACE FUNCTION public.cat_ler_atributos(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tec boolean; v_val boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_produtos_tabelas (20270117100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_val := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  RETURN (
    WITH atr AS (
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    -- todas as opções dos grupos (activas e desativadas): os valores resolvem-se por aqui
    -- 20270118000000: "sigla"
    opc_todas AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active, o.sigla
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    ),
    val AS (
      SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit, a.is_measurement, a.grupo, a.ordem, a.label
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo = 'produto'
      WHERE v_val
    )
    SELECT jsonb_build_object(
      'atributos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'codigo', a.code, 'nome', a.label,
                 'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
                 'tem_hex', a.tem_hex, 'ordem', a.ordem,
                 'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                   SELECT jsonb_agg(jsonb_build_object('id', o.id, 'valor', o.valor, 'nome', o.nome,
                                                       'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem,
                                                       'sigla', o.sigla)
                                    ORDER BY o.ordem, o.valor, o.id)
                   FROM opc_todas o WHERE o.group_id = a.grupo AND o.is_active), '[]'::jsonb) END)
               ORDER BY a.ordem, a.label, a.id)
        FROM atr a), '[]'::jsonb),
      'produtos', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.product_id, 'valores', x.valores) ORDER BY x.product_id)
        FROM (
          SELECT v.product_id,
                 jsonb_agg(jsonb_build_object(
                   'atributo', v.attribute_id,
                   'opcao', CASE WHEN v.is_measurement THEN NULL ELSE o.id END,
                   'valor', v.value_text,
                   'medida', CASE WHEN v.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END,
                   'ativa', CASE WHEN v.is_measurement THEN true ELSE coalesce(o.is_active, false) END)
                   ORDER BY v.ordem, v.label, v.attribute_id) AS valores
          FROM val v
          LEFT JOIN opc_todas o ON NOT v.is_measurement AND o.group_id = v.grupo AND o.valor = v.value_text
          GROUP BY v.product_id
        ) x), '[]'::jsonb)
    ));
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_atributos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_atributos(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_atributos(uuid) IS
  'Catálogo (20270117500000, "sigla" em 20270118000000): os atributos da organização com as opções activas do grupo de cada um (com a sigla do SKU), e os valores dos produtos (tipo produto) que os têm, com a opção actual mesmo se desativada ("ativa"). Mesmas permissões e corte de cat_ler_produtos_tabelas.';

-- ─── 11. search_path com pg_temp na verificação de permissões que estas funções usam (corpo igual) ───
ALTER FUNCTION public.fn_cat_exigir_uma(uuid, text[]) SET search_path = public, pg_temp;

-- ─── 12. Conferir ───────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record; v_n bigint;
BEGIN
  -- funções públicas: SECURITY DEFINER, search_path com pg_temp, authenticated sim, anon e PUBLIC não
  FOREACH v_sig IN ARRAY ARRAY['public.cat_guardar_sigla_categoria(uuid,uuid,text)', 'public.cat_guardar_sigla_opcao(uuid,uuid,text)',
                                'public.cat_guardar_sku_config(uuid,jsonb)',
                                'public.cat_gerar_sku_produto(uuid,uuid,boolean)', 'public.cat_prever_sku(uuid,uuid,uuid,jsonb)',
                                'public.cat_ler_categorias_gestao(uuid)', 'public.cat_ler_atributos_gestao(uuid)',
                                'public.cat_ler_atributos(uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % ainda dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon pode executar %.', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: authenticated não pode executar %.', v_sig; END IF;
  END LOOP;

  -- funções internas e dos gatilhos: search_path com pg_temp; ninguém de fora as executa
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_sugerir_sigla(text,text[])', 'public.fn_cat_sigla_categoria_livre(uuid,uuid,text,uuid)',
                                'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.fn_cat_sku_medida(jsonb)',
                                'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)', 'public.fn_cat_sku_proximo(uuid,text,uuid)',
                                'public.fn_cat_sku_ordem_inicial(uuid)', 'public.fn_cat_sigla_categoria_trg()', 'public.fn_cat_sigla_opcao_trg()', 'public.fn_cat_sku_ordem_trg()'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % pode ser executada de fora.', v_sig;
    END IF;
  END LOOP;

  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_categorias_gestao(uuid)')::oid) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos_gestao(uuid)')::oid) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos(uuid)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: as leituras não são STABLE.';
  END IF;

  -- as leituras trazem os campos novos
  IF position($q$'sigla', t.sigla$q$ IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_categorias_gestao(uuid)')::oid)) = 0
     OR position($q$'sigla', s.sigla$q$ IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_categorias_gestao(uuid)')::oid)) = 0
     OR position($q$'sigla', o.sigla$q$ IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos_gestao(uuid)')::oid)) = 0
     OR position($q$'sku_ordem', a.sku_ordem, 'sku_entra', a.sku_entra$q$ IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos_gestao(uuid)')::oid)) = 0
     OR position($q$'sigla', o.sigla$q$ IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos(uuid)')::oid)) = 0 THEN
    RAISE EXCEPTION 'Conferir: uma das leituras não traz os campos novos.';
  END IF;

  -- verificações, índices únicos e gatilhos
  IF (SELECT count(*) FROM pg_constraint c
      WHERE c.conname::text IN ('product_categories_sigla_check', 'attribute_option_group_values_sigla_check', 'product_attributes_sku_ordem_check')
        AND c.contype::text = 'c' AND c.convalidated) <> 3 THEN
    RAISE EXCEPTION 'Conferir: faltam as verificações das colunas novas.';
  END IF;
  IF (SELECT count(*) FROM pg_index i WHERE i.indisunique AND i.indisvalid
        AND i.indexrelid IN (to_regclass('public.product_categories_sigla_ambito_key'), to_regclass('public.attribute_option_group_values_sigla_key'))) <> 2 THEN
    RAISE EXCEPTION 'Conferir: faltam os índices únicos da sigla.';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgenabled::text = 'O'
        AND ((t.tgname::text = 'trg_cat_sigla_categoria' AND t.tgrelid = 'public.product_categories'::regclass)
          OR (t.tgname::text = 'trg_cat_sigla_opcao' AND t.tgrelid = 'public.attribute_option_group_values'::regclass)
          OR (t.tgname::text = 'trg_cat_sku_ordem' AND t.tgrelid = 'public.product_attributes'::regclass))) <> 3 THEN
    RAISE EXCEPTION 'Conferir: faltam os gatilhos.';
  END IF;

  -- tudo preenchido
  SELECT count(*) INTO v_n FROM product_categories WHERE sigla IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % categorias sem sigla.', v_n; END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values WHERE sigla IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % opções sem sigla.', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_attributes WHERE sku_ordem IS NULL AND deleted_at IS NULL AND organization_id IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % atributos sem posição no SKU.', v_n; END IF;

  -- os tetos estão no corpo (âncoras)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid)
       NOT LIKE '%c_max_numero constant integer := 9999;%c_max_tentativas constant integer := 20;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid)
       NOT LIKE '%c_max_valores constant integer := 50;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_sku_config(uuid,jsonb)')::oid)
       NOT LIKE '%c_max_itens constant integer := 200;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.fn_cat_sku_medida(jsonb)')::oid)
       NOT LIKE '%c_max constant numeric := 100000;%c_casas constant integer := 3;%' THEN
    RAISE EXCEPTION 'Conferir: falta um dos tetos no corpo das funções (9999, 20 tentativas, 50 e 200 atributos, medida 100000 e 3 casas).';
  END IF;

  -- fn_cat_exigir_uma com pg_temp; products.sku_gerado boolean NOT NULL DEFAULT false
  IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg
                 WHERE pr.oid = to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])')::oid AND cfg = c_sp) THEN
    RAISE EXCEPTION 'Conferir: fn_cat_exigir_uma sem search_path = public, pg_temp.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                 WHERE ic.table_schema = 'public' AND ic.table_name = 'products' AND ic.column_name = 'sku_gerado'
                   AND ic.data_type::text = 'boolean' AND ic.is_nullable::text = 'NO' AND ic.column_default::text = 'false') THEN
    RAISE EXCEPTION 'Conferir: products.sku_gerado não ficou boolean NOT NULL DEFAULT false.';
  END IF;
  RAISE NOTICE 'catalogo_siglas_e_sku: colunas, siglas e ordem do SKU preenchidas, 3 gatilhos, 5 funções novas e 3 leituras recriadas — conferidas.';
END $c$;

RESET lock_timeout;
