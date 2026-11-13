-- =============================================================================
-- Atributos por produto no Catálogo — as FUNÇÕES que o ecrã /catalogo-custos chama.
-- Base de RH (uetjghdkwbywbftedtth). Desenho: vault/ficheiros/produtos-servicos/
-- desenho-atributos-por-produto.html (secção 2, «As funções da base»).
-- =============================================================================
--
-- Sem tabelas nem colunas novas. Não mexe em cat_ler_catalogo nem em
-- cat_guardar_produto: são funções NOVAS, ao lado, como cat_ler_produtos_tabelas
-- (20270117100000). Não escreve dados: só cria funções.
--
-- O modelo (tabelas que já existem):
--   atributo  = product_attributes (da organização, deleted_at nulo). A Cor tem
--               has_hex_color; a Medida tem is_measurement.
--   opção     = attribute_option_group_values, dentro do grupo do atributo
--               (attribute_option_groups.attribute_id). value_text = nome da opção
--               (é a chave: UNIQUE (group_id, value_text)).
--   valor     = product_attribute_values, uma linha por produto e atributo
--               (UNIQUE (product_id, attribute_id)). Lista: value_text = value_text
--               da opção. Medida: value_json = {tipo, largura, comprimento,
--               espessura, unidade}, unit = cm|mm, value_text legível
--               («60 × 60 × 0,9 cm»).
--   Grupo para LER e escolher: o primeiro grupo activo do atributo, o da
--   organização antes de um global (fn_cat_grupo_do_atributo).
--   Grupo para ESCREVER opções: só o da organização; se o atributo só tiver um
--   grupo global, cria-se o da organização (nunca se escreve num grupo global).
--
-- Funções públicas (authenticated e service_role; nunca anon nem PUBLIC):
--   1. cat_ler_atributos(p_org) → jsonb
--        {"atributos":[{id,codigo,nome,tipo:'lista'|'medida',tem_hex,ordem,
--                       opcoes:[{id,valor,nome,hex,ordem}]}],
--         "produtos":[{id,valores:[{atributo,opcao,valor,medida,ativa}]}]}
--        Mesmas permissões e mesmo corte de cat_ler_produtos_tabelas: services.view,
--        ou o perfil reduzido (técnico, pessoas.view, negocios.*); nesse perfil os
--        valores dos produtos só com negocios.obra.materiais (senão "produtos" = []).
--        "produtos": produtos da organização, tipo 'produto', não apagados, que TÊM
--        valores. "opcao" é a opção actual mesmo se desativada ("ativa": false);
--        null se já não existir. Na Medida "opcao" é null e "ativa" é true.
--        "nome" da opção = display_name (o ecrã mostra-o; "valor" é a chave).
--   2. cat_guardar_produto_atributos(p_org, p_produto, p_valores) → {"ok":true,"n":…}
--        Substitui o conjunto de valores do produto (no máximo 50). Permissão
--        products.edit. Só produtos (tipo_catalogo = 'produto'); consumível: CT002.
--        Só apaga valores de atributos ACTIVOS da organização (os de atributos
--        apagados ficam). Uma opção desativada só passa se já for a do produto.
--        Medidas: > 0, até 100000, no máximo 3 casas decimais.
--   3. cat_guardar_opcao(p_org, p_atributo, p_valor, p_hex) → {"opcao":{id,valor,nome,hex,ordem}}
--        Cria uma opção no grupo da organização (e o grupo, se faltar). No máximo
--        500 opções por grupo; nome até 255 caracteres (texto recebido até 1000).
--        Tira caracteres invisíveis e trata o espaço de não-quebra como espaço.
--
-- Erros (mensagens em português, para o ecrã mostrar):
--   CT001  Sem permissão (…).                        (fn_cat_exigir)
--   CT002  dados inválidos (a mensagem diz qual)
--   CT003  Produto / atributo não encontrado.
--   CT004  Esta opção já existe.  DETAIL = id da opção existente.
--
-- Funções internas (sem EXECUTE para authenticated nem anon): fn_cat_grupo_do_atributo,
-- fn_cat_limpar_nome, fn_cat_chave_opcao, fn_cat_num_texto, fn_cat_medida_ler,
-- fn_cat_dimensao. Todas com search_path = public, pg_temp.
--
-- Bloqueios: FOR NO KEY UPDATE no produto (gravar valores) e no atributo (criar
-- opção): serializa as gravações sem bloquear chaves estrangeiras.
-- Auditoria: os gatilhos trg_audit_* destas tabelas registam as escritas como
-- sempre. validate_attribute_measurement_color só actua em product_attributes,
-- onde estas funções não escrevem.
--
-- Idempotente: CREATE OR REPLACE; a guarda recusa se já existir outra versão
-- (outra assinatura) com o mesmo nome, para o PostgREST não ficar com duas.
-- Conferir no fim: assinaturas, SECURITY DEFINER, search_path, acessos e os
-- limites no corpo.
--
-- Teste: supabase/tests/atributos_funcoes.test.sql (BEGIN … ROLLBACK, só na nike).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_txt text;
BEGIN
  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL OR to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_neg_so_execucao(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Faltam fn_cat_exigir, fn_cat_pode ou fn_neg_so_execucao: aplicar antes as migrações do Catálogo e das permissões.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_attributes' AND column_name = 'is_measurement')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_attributes' AND column_name = 'has_hex_color')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_attributes' AND column_name = 'deleted_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_attribute_values' AND column_name = 'unit')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tipo_catalogo') THEN
    RAISE EXCEPTION 'Faltam colunas esperadas (product_attributes.is_measurement/has_hex_color/deleted_at, product_attribute_values.unit ou products.tipo_catalogo).';
  END IF;
  -- o ON CONFLICT (product_id, attribute_id) precisa da restrição única
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid = to_regclass('public.product_attribute_values') AND c.contype::text IN ('u', 'p')
                   AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
                        WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['attribute_id', 'product_id']) THEN
    RAISE EXCEPTION 'Falta a restrição única (product_id, attribute_id) em product_attribute_values.';
  END IF;
  -- nenhuma outra versão (outra assinatura) destas funções
  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'cat_ler_atributos' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_produto_atributos' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_produto uuid, p_valores jsonb')
      OR (p.proname = 'cat_guardar_opcao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_atributo uuid, p_valor text, p_hex text'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. Funções internas ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O grupo de opções de um atributo, para ler e escolher: o primeiro grupo activo (da organização antes dos globais).
CREATE OR REPLACE FUNCTION public.fn_cat_grupo_do_atributo(p_atributo uuid, p_org uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.id FROM attribute_option_groups g
  WHERE g.attribute_id = p_atributo AND g.is_active AND (g.organization_id = p_org OR g.organization_id IS NULL)
  ORDER BY (g.organization_id IS NULL), coalesce(g.sort_order, 0), g.created_at, g.id
  LIMIT 1
$$;

-- O nome limpo: sem caracteres invisíveis (espaços de largura zero, marcas de direcção, hífen suave, BOM), o espaço de
-- não-quebra como espaço, espaços seguidos colapsados e sem espaços nas pontas.
CREATE OR REPLACE FUNCTION public.fn_cat_limpar_nome(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p, ''), '[​-‏‪-‮⁠­﻿]', '', 'g'),
             ' ', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- A chave de comparação do nome de uma opção: o nome limpo, sem acentos, em minúsculas.
CREATE OR REPLACE FUNCTION public.fn_cat_chave_opcao(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT lower(translate(public.fn_cat_limpar_nome(p),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY'))
$$;

-- Um número como se escreve em português: sem zeros a mais e com vírgula (0.90 → «0,9»).
CREATE OR REPLACE FUNCTION public.fn_cat_num_texto(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT replace(trim_scale(p)::text, '.', ',')
$$;

-- A medida guardada (value_json + unit) no formato do ecrã; NULL se não for uma medida 2D/3D válida.
CREATE OR REPLACE FUNCTION public.fn_cat_medida_ler(p_json jsonb, p_unit text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_json) = 'object' AND p_json ->> 'tipo' IN ('2D', '3D')
         AND jsonb_typeof(p_json -> 'largura') = 'number' AND jsonb_typeof(p_json -> 'comprimento') = 'number'
    THEN jsonb_build_object(
      'tipo', p_json ->> 'tipo',
      'largura', p_json -> 'largura',
      'comprimento', p_json -> 'comprimento',
      'espessura', CASE WHEN p_json ->> 'tipo' = '3D' AND jsonb_typeof(p_json -> 'espessura') = 'number' THEN p_json -> 'espessura' END,
      'unidade', coalesce(nullif(p_json ->> 'unidade', ''), nullif(p_unit, ''), 'cm'))
  END
$$;

-- Uma dimensão da medida: número JSON (sempre finito), maior que zero, até 100000, no máximo 3 casas decimais.
-- p_nome é o sujeito da mensagem («A largura», «O comprimento», «A espessura»).
CREATE OR REPLACE FUNCTION public.fn_cat_dimensao(p_valor jsonb, p_nome text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  c_max constant numeric := 100000;
  c_casas constant integer := 3;
  v numeric;
BEGIN
  IF jsonb_typeof(p_valor) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '% tem de ser um número maior que zero.', p_nome USING ERRCODE = 'CT002';
  END IF;
  v := (p_valor #>> '{}')::numeric;
  IF v <= 0 THEN
    RAISE EXCEPTION '% tem de ser um número maior que zero.', p_nome USING ERRCODE = 'CT002';
  END IF;
  IF v > c_max THEN
    RAISE EXCEPTION '% não pode passar de 100000.', p_nome USING ERRCODE = 'CT002';
  END IF;
  v := trim_scale(v);
  IF scale(v) > c_casas THEN
    RAISE EXCEPTION '% tem no máximo 3 casas decimais.', p_nome USING ERRCODE = 'CT002';
  END IF;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.fn_cat_grupo_do_atributo(uuid,uuid), public.fn_cat_limpar_nome(text), public.fn_cat_chave_opcao(text),
  public.fn_cat_num_texto(numeric), public.fn_cat_medida_ler(jsonb,text), public.fn_cat_dimensao(jsonb,text) FROM PUBLIC, anon, authenticated;

-- ─── 2. Ler ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
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
    opc_todas AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active
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
                                                       'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem)
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
  'Catálogo (20270117500000): os atributos da organização com as opções activas do grupo de cada um, e os valores dos produtos (tipo produto) que os têm, com a opção actual mesmo se desativada ("ativa"). Mesmas permissões e corte de cat_ler_produtos_tabelas.';

-- ─── 3. Gravar os valores de um produto ─────────────────────────────────────────────────────────────────────────────────────────────
-- p_valores: [{"atributo":uuid,"opcao":uuid}] ou [{"atributo":uuid,"medida":{"tipo":"2D"|"3D","largura":n,"comprimento":n,"espessura":n,"unidade":"cm"|"mm"}}].
-- Substitui o conjunto: o que não vem apaga-se (só nos atributos activos da organização). Tudo ou nada.
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
  v_tipo text; v_uni text; v_l numeric; v_c numeric; v_e numeric;
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
      v_l := public.fn_cat_dimensao(v_med -> 'largura', 'A largura');
      v_c := public.fn_cat_dimensao(v_med -> 'comprimento', 'O comprimento');
      v_e := CASE WHEN v_tipo = '3D' THEN public.fn_cat_dimensao(v_med -> 'espessura', 'A espessura') END;  -- 2D: a espessura não conta
      v_attrs := array_append(v_attrs, v_attr);
      v_txts := array_append(v_txts, public.fn_cat_num_texto(v_l) || ' × ' || public.fn_cat_num_texto(v_c)
                           || CASE WHEN v_e IS NULL THEN '' ELSE ' × ' || public.fn_cat_num_texto(v_e) END || ' ' || v_uni);
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
      WHERE o.id = v_opc_id AND o.group_id = v_grupo;
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
  'Catálogo (20270117500000): substitui os valores de atributos de um produto (no máximo 50; uma opção por atributo de lista; a Medida 2D/3D em value_json). Só apaga valores de atributos activos da organização. Permissão products.edit.';

-- ─── 4. Criar uma opção ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_opcao(p_org uuid, p_atributo uuid, p_valor text, p_hex text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 255;
  c_max_opcoes constant integer := 500;
  a record; v_nome text; v_hex text; v_grupo uuid; v_ex record; v_n integer; v_ordem integer; v_id uuid;
BEGIN
  -- texto absurdo: recusado antes de qualquer trabalho
  IF length(p_valor) > c_max_texto THEN
    RAISE EXCEPTION 'O nome da opção é demasiado longo.' USING ERRCODE = 'CT002';
  END IF;

  -- o atributo fica preso até ao fim: duas opções iguais, ou a 501.ª, ao mesmo tempo não passam
  SELECT pa.id, pa.label, pa.is_measurement, coalesce(pa.has_hex_color, false) AS tem_hex, pa.sort_order INTO a
  FROM product_attributes pa
  WHERE pa.id = p_atributo AND pa.organization_id = p_org AND pa.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF a.is_measurement THEN
    RAISE EXCEPTION 'A «%» não tem opções: as medidas escrevem-se em cada produto.', a.label USING ERRCODE = 'CT002';
  END IF;

  v_nome := public.fn_cat_limpar_nome(p_valor);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da opção.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da opção tem no máximo 255 caracteres.' USING ERRCODE = 'CT002'; END IF;

  IF a.tem_hex THEN
    v_hex := upper(btrim(coalesce(p_hex, '')));
    IF v_hex = '' THEN
      RAISE EXCEPTION 'Falta o código da cor (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
    END IF;
    IF v_hex !~ '^#[0-9A-F]{6}$' THEN
      RAISE EXCEPTION 'O código da cor tem de ser # e seis algarismos hexadecimais (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
    END IF;
  ELSE
    v_hex := NULL;  -- só a Cor tem hex
  END IF;

  -- escreve-se só no grupo da organização; se o atributo não o tem (nem que tenha um global), cria-se
  SELECT g.id INTO v_grupo FROM attribute_option_groups g
  WHERE g.attribute_id = a.id AND g.organization_id = p_org AND g.is_active
  ORDER BY coalesce(g.sort_order, 0), g.created_at, g.id LIMIT 1;
  IF v_grupo IS NULL THEN
    INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
    VALUES (a.id, p_org, left(a.label, 100), coalesce(a.sort_order, 0), true, (SELECT u.id FROM anew_users u WHERE u.id = v_user))
    RETURNING id INTO v_grupo;
  END IF;

  SELECT o.id, o.is_active INTO v_ex FROM attribute_option_group_values o
  WHERE o.group_id = v_grupo AND public.fn_cat_chave_opcao(o.value_text) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY o.is_active DESC, o.sort_order, o.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '%', CASE WHEN v_ex.is_active THEN 'Esta opção já existe.' ELSE 'Esta opção já existe (está desativada).' END
      USING ERRCODE = 'CT004', DETAIL = v_ex.id::text;
  END IF;

  SELECT count(*)::integer, coalesce(max(o.sort_order) + 1, 1) INTO v_n, v_ordem
  FROM attribute_option_group_values o WHERE o.group_id = v_grupo;
  IF v_n >= c_max_opcoes THEN
    RAISE EXCEPTION 'Este atributo já tem o máximo de opções.' USING ERRCODE = 'CT002';
  END IF;

  INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active)
  VALUES (v_grupo, v_nome, v_nome, v_hex, v_ordem, true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('opcao', jsonb_build_object('id', v_id, 'valor', v_nome, 'nome', v_nome, 'hex', v_hex, 'ordem', v_ordem));
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_opcao(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_opcao(uuid,uuid,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_opcao(uuid,uuid,text,text) IS
  'Catálogo (20270117500000): cria uma opção no grupo da organização do atributo (cria o grupo se faltar; no máximo 500). Cor: hex #RRGGBB obrigatório. Nome repetido (sem maiúsculas, acentos, espaços nem invisíveis): CT004 com o id no DETAIL. Permissão products.edit.';

-- ─── 5. Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_atributos(uuid)', 'public.cat_guardar_produto_atributos(uuid,uuid,jsonb)',
                                'public.cat_guardar_opcao(uuid,uuid,text,text)'] LOOP
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
  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos(uuid)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_atributos não é STABLE.';
  END IF;

  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_chave_opcao(text)',
                                'public.fn_cat_num_texto(numeric)', 'public.fn_cat_medida_ler(jsonb,text)', 'public.fn_cat_dimensao(jsonb,text)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = c_sp) THEN
      RAISE EXCEPTION 'Conferir: a função interna % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: a função interna % está aberta a anon ou authenticated.', v_sig;
    END IF;
  END LOOP;

  -- os limites estão no corpo (âncoras)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_opcao(uuid,uuid,text,text)')::oid)
       NOT LIKE '%c_max_opcoes constant integer := 500;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_opcao(uuid,uuid,text,text)')::oid)
       NOT LIKE '%c_max_texto constant integer := 1000;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')::oid)
       NOT LIKE '%c_max_valores constant integer := 50;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')::oid)
       NOT LIKE '%FOR NO KEY UPDATE%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.fn_cat_dimensao(jsonb,text)')::oid)
       NOT LIKE '%c_max constant numeric := 100000;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.fn_cat_dimensao(jsonb,text)')::oid)
       NOT LIKE '%c_casas constant integer := 3;%' THEN
    RAISE EXCEPTION 'Conferir: falta um dos limites no corpo das funções (500 opções, 1000 caracteres, 50 valores, 100000, 3 casas, FOR NO KEY UPDATE).';
  END IF;

  IF public.fn_cat_num_texto(0.90) <> '0,9'
     OR public.fn_cat_chave_opcao('  Cínza   TESTE ') <> 'cinza teste'
     OR public.fn_cat_limpar_nome(E' Cin​za  Teste﻿ ') <> 'Cinza Teste' THEN
    RAISE EXCEPTION 'Conferir: fn_cat_num_texto, fn_cat_chave_opcao ou fn_cat_limpar_nome não dão o esperado.';
  END IF;
  RAISE NOTICE 'atributos_funcoes_catalogo: 3 funções públicas e 6 internas conferidas.';
END $c$;
