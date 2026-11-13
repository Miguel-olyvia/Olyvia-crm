-- =============================================================================
-- Atributos do Catálogo — as FUNÇÕES do ECRÃ DE GESTÃO DOS ATRIBUTOS (criar e
-- renomear atributos; renomear, mudar a cor, ativar/desativar e ordenar opções).
-- Base de RH (uetjghdkwbywbftedtth). Desenho: vault/ficheiros/produtos-servicos/
-- desenho-atributos-por-produto.html.
-- =============================================================================
--
-- ORDEM: aplica-se DEPOIS de 20270117500000_atributos_funcoes_catalogo.sql (já
-- aplicada), de que reutiliza fn_cat_grupo_do_atributo, fn_cat_limpar_nome e
-- fn_cat_chave_opcao (e o padrão de permissões, erros CT00x e REVOKE/GRANT). A
-- guarda recusa se faltarem. Sem tabelas nem colunas novas. Não escreve dados.
--
-- O modelo (lido na RH, só estrutura):
--   product_attributes  NÃO tem coluna de ativo: só deleted_at (apagar). Por isso
--                       "ativo" de um atributo é sempre true e os apagados não
--                       aparecem. UNIQUE (organization_id, code) conta também os
--                       apagados. created_by NOT NULL (anew_users).
--   attribute_option_group_values  value_text varchar(255) NOT NULL (a chave,
--                       UNIQUE (group_id, value_text)), display_name, hex_color,
--                       sort_order, is_active. Maior grupo hoje: 192 opções.
--   O TEXTO da opção é a ligação em DUAS tabelas (não há option_value_id):
--     product_attribute_values.value_text        (o valor de cada produto)
--     product_attribute_value_prices.value_option (preços por opção; índices únicos
--                       parciais em (attribute_id, value_option, organization_id[, product_id])
--                       e um com coalesce(organization_id, product_id, category_id)).
--   product_attribute_price_ranges não usa texto. Por isso renomear uma opção
--   actualiza, na MESMA transacção, as duas: os valores dos produtos da organização
--   (desse atributo, produtos apagados incluídos, para não ficarem órfãos se forem
--   repostos) e os preços da organização desse atributo. Se já houver preços com o
--   texto novo, recusa (CT002) em vez de violar os índices únicos.
--   Gatilho trg_validate_attribute_measurement_color: medida e hex não convivem;
--   as funções recusam antes, com CT002 e mensagem clara.
--
-- Funções públicas (authenticated e service_role; nunca anon nem PUBLIC):
--   1. cat_ler_atributos_gestao(p_org) → {"atributos":[{id,codigo,nome,tipo,tem_hex,
--        ordem,ativo,usados,opcoes:[{id,valor,nome,hex,ordem,ativo,usados}]}]}
--        Exige products.edit OU services.view (CT001 senão: o perfil reduzido de
--        Negócios não entra). TODAS as opções do grupo (ativas e desativadas).
--        "usados" = produtos VIVOS da organização com o atributo / com essa opção.
--   2. cat_guardar_atributo(p_org, p_atributo, p_nome, p_tipo, p_tem_hex) → {"atributo":{…}}
--        p_atributo NULL: cria (lista ou medida; no máximo 200 atributos não apagados
--        por organização); senão renomeia e muda tem_hex (p_tem_hex NULL = não mexe)
--        só se nenhum produto vivo o usa e, para LIGAR a cor, se ainda não tem opções.
--        p_tipo NULL = não mexe; diferente do actual = CT002. O código não muda.
--   3. cat_editar_opcao(p_org, p_opcao, p_nome, p_hex, p_ativo)
--        → {"opcao":{…},"valores_atualizados":n,"precos_atualizados":n}
--        p_nome NULL = não mexe; p_hex NULL = não mexe, '' = LIMPA (só em atributos
--        sem cor; num atributo com cor é CT002); p_ativo NULL = não mexe. Desativar
--        não toca nos valores dos produtos. Renomear reescreve no máximo 5000 linhas
--        (valores + preços); acima disso CT002. O custo da auditoria (gatilhos
--        trg_audit_* por linha) NÃO foi medido: o teto é prudência, não medição.
--   4. cat_reordenar_opcoes(p_org, p_atributo, p_ids) → {"ok":true,"n":…,"alteradas":…}
--        sort_order = posição (1, 2, …) em p_ids; p_ids tem de trazer TODAS as opções
--        do grupo da organização (ativas e desativadas), cada uma uma vez (até 500).
--   Escrita (2, 3, 4): products.edit (fn_cat_exigir). Só no grupo da ORGANIZAÇÃO: uma
--   opção num grupo global (organization_id NULL) é CT002 «Opção partilhada: não se
--   pode alterar aqui.».
--   5. cat_guardar_produto_atributos — RECRIADA IGUAL à de 20270117500000, com UMA só
--        mudança: a leitura da opção leva FOR SHARE. Assim, gravar um produto e renomear
--        a mesma opção ao mesmo tempo esperam um pelo outro, e o produto nunca fica com
--        o texto antigo. Mesmo search_path, mesmos acessos e mesmo comentário.
--
-- Nomes: fn_cat_limpar_nome (sem invisíveis, U+00A0 como espaço, espaços colapsados);
-- repetidos comparam-se com fn_cat_chave_opcao (sem maiúsculas nem acentos). Mais de
-- 1000 caracteres recusa-se antes de processar.
--
-- Erros (mensagens em português, para o ecrã mostrar):
--   CT001  Sem permissão (…).   (fn_cat_exigir / fn_cat_exigir_uma; também outra organização)
--   CT002  dados inválidos (a mensagem diz qual)
--   CT003  Atributo / opção não encontrado(a).
--   CT004  Nome repetido. DETAIL = id do atributo / da opção que já o tem.
--
-- Concorrência: o atributo fica preso (FOR NO KEY UPDATE) em 3 e 4, como em
-- cat_guardar_opcao, e a opção em 3; criar/renomear atributos serializa-se por
-- organização (pg_advisory_xact_lock); o código repetido numa corrida dá CT004.
--
-- Idempotente: CREATE OR REPLACE; a guarda recusa se já existir outra versão
-- (outra assinatura) com o mesmo nome. Conferir no fim: assinaturas, SECURITY
-- DEFINER, search_path = public, pg_temp, sem EXECUTE para anon nem PUBLIC, e o
-- FOR SHARE no corpo de cat_guardar_produto_atributos.
--
-- Teste: supabase/tests/atributos_gestao.test.sql (BEGIN … ROLLBACK, só na nike).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_txt text; v_falta text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.cat_ler_atributos(uuid)', 'public.cat_guardar_produto_atributos(uuid,uuid,jsonb)',
                    'public.cat_guardar_opcao(uuid,uuid,text,text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_limpar_nome(text)', 'public.fn_cat_chave_opcao(text)', 'public.fn_cat_num_texto(numeric)',
                    'public.fn_cat_dimensao(jsonb,text)', 'public.current_business_user_id()']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções (%): aplicar antes 20270117500000_atributos_funcoes_catalogo.sql.', v_falta;
  END IF;

  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
  FROM (VALUES ('product_attributes', 'code'), ('product_attributes', 'label'), ('product_attributes', 'type'),
               ('product_attributes', 'value_type'), ('product_attributes', 'has_hex_color'), ('product_attributes', 'is_measurement'),
               ('product_attributes', 'measurement_type'), ('product_attributes', 'unit'), ('product_attributes', 'pricing_type'),
               ('product_attributes', 'valorization_type'), ('product_attributes', 'sort_order'), ('product_attributes', 'created_by'),
               ('product_attributes', 'deleted_at'), ('product_attributes', 'organization_id'),
               ('attribute_option_groups', 'attribute_id'), ('attribute_option_groups', 'organization_id'),
               ('attribute_option_groups', 'name'), ('attribute_option_groups', 'is_active'),
               ('attribute_option_group_values', 'group_id'), ('attribute_option_group_values', 'value_text'),
               ('attribute_option_group_values', 'display_name'), ('attribute_option_group_values', 'hex_color'),
               ('attribute_option_group_values', 'sort_order'), ('attribute_option_group_values', 'is_active'),
               ('product_attribute_values', 'value_text'), ('product_attribute_values', 'attribute_id'),
               ('product_attribute_value_prices', 'attribute_id'), ('product_attribute_value_prices', 'value_option'),
               ('product_attribute_value_prices', 'organization_id'),
               ('products', 'is_deleted'), ('products', 'organization_id')) AS x(t, c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public' AND ic.table_name = x.t AND ic.column_name = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas esperadas: %.', v_falta;
  END IF;

  -- a versão aplicada de cat_guardar_produto_atributos tem de ser a de 20270117500000 (é recriada abaixo)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')::oid)
       NOT LIKE '%c_max_valores constant integer := 50;%' THEN
    RAISE EXCEPTION 'cat_guardar_produto_atributos não é a de 20270117500000: rever esta migration antes de a recriar.';
  END IF;

  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'cat_ler_atributos_gestao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_atributo' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_atributo uuid, p_nome text, p_tipo text, p_tem_hex boolean')
      OR (p.proname = 'cat_editar_opcao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_opcao uuid, p_nome text, p_hex text, p_ativo boolean')
      OR (p.proname = 'cat_reordenar_opcoes' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_atributo uuid, p_ids uuid[]')
      OR (p.proname = 'cat_guardar_produto_atributos' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_produto uuid, p_valores jsonb'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. Ler para gestão ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_gestao(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- o ecrã de gestão: quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH atr AS (
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             coalesce(a.sort_order, 0) AS ordem,
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
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active AS ativo
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'ordem', a.ordem, 'ativo', true,
               'usados', coalesce(ua.n, 0),
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'valor', o.valor, 'nome', o.nome,
                          'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem, 'ativo', o.ativo,
                          'usados', coalesce(u.n, 0))
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
  'Catálogo (20270117600000): ecrã de gestão dos atributos. Todos os atributos da organização (não apagados) com TODAS as opções do grupo (ativas e desativadas) e quantos produtos vivos usam cada atributo e cada opção. Permissão products.edit ou services.view.';

-- ─── 2. Criar ou renomear um atributo ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_atributo(p_org uuid, p_atributo uuid, p_nome text, p_tipo text, p_tem_hex boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 100;
  c_max_atributos constant integer := 200;
  v_criador uuid; a record; v_nome text; v_tipo text; v_hex boolean; v_ex uuid;
  v_base text; v_code text; v_i integer := 1; v_id uuid; v_ordem integer; v_n integer;
BEGIN
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome do atributo é demasiado longo.' USING ERRCODE = 'CT002'; END IF;
  v_nome := public.fn_cat_limpar_nome(p_nome);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome do atributo.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome do atributo tem no máximo 100 caracteres.' USING ERRCODE = 'CT002'; END IF;
  v_tipo := lower(btrim(p_tipo));
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('lista', 'medida') THEN
    RAISE EXCEPTION 'O tipo do atributo tem de ser «lista» ou «medida».' USING ERRCODE = 'CT002';
  END IF;

  -- um de cada vez nesta organização: dois atributos com o mesmo nome ao mesmo tempo não passam
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || p_org::text, 0));

  IF p_atributo IS NOT NULL THEN
    SELECT pa.id, pa.label, pa.is_measurement, coalesce(pa.has_hex_color, false) AS tem_hex INTO a
    FROM product_attributes pa
    WHERE pa.id = p_atributo AND pa.organization_id = p_org AND pa.deleted_at IS NULL FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  END IF;

  SELECT pa.id INTO v_ex FROM product_attributes pa
  WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL AND pa.id IS DISTINCT FROM p_atributo
    AND public.fn_cat_chave_opcao(pa.label) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY pa.sort_order, pa.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um atributo com este nome.' USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  IF p_atributo IS NULL THEN
    -- ─ criar ─
    IF v_tipo IS NULL THEN RAISE EXCEPTION 'Escolha o tipo do atributo: lista ou medida.' USING ERRCODE = 'CT002'; END IF;
    v_hex := coalesce(p_tem_hex, false);
    IF v_tipo = 'medida' AND v_hex THEN
      RAISE EXCEPTION 'Uma medida não pode ter cor (hex): a cor é só para atributos de lista.' USING ERRCODE = 'CT002';
    END IF;
    SELECT count(*)::integer, coalesce(max(pa.sort_order), 0) + 1 INTO v_n, v_ordem FROM product_attributes pa
    WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL;
    IF v_n >= c_max_atributos THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de atributos (200).' USING ERRCODE = 'CT002';
    END IF;
    SELECT u.id INTO v_criador FROM anew_users u WHERE u.id = v_user;
    IF v_criador IS NULL THEN
      RAISE EXCEPTION 'Sem utilizador identificado para criar o atributo.' USING ERRCODE = 'CT001';
    END IF;
    -- código: o nome sem acentos, minúsculas, só letras, algarismos e «_»; único na organização (apagados incluídos)
    v_base := btrim(left(btrim(regexp_replace(public.fn_cat_chave_opcao(v_nome), '[^a-z0-9]+', '_', 'g'), '_'), 50), '_');
    IF v_base = '' THEN v_base := 'atributo'; END IF;
    v_code := v_base;
    WHILE EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.organization_id = p_org AND pa.code = v_code) LOOP
      v_i := v_i + 1;
      v_code := v_base || '_' || v_i::text;
    END LOOP;

    BEGIN
      INSERT INTO product_attributes (organization_id, code, label, type, value_type, has_hex_color, is_measurement,
                                      measurement_type, unit, pricing_type, valorization_type, is_variant_option,
                                      is_variant_attribute, sort_order, created_by)
      VALUES (p_org, v_code, v_nome,
              CASE WHEN v_tipo = 'medida' THEN 'text' ELSE 'select' END::public.attribute_type,
              CASE WHEN v_tipo = 'medida' THEN 'json' ELSE 'list' END,
              v_hex, v_tipo = 'medida',
              CASE WHEN v_tipo = 'medida' THEN 'dimensoes' END, CASE WHEN v_tipo = 'medida' THEN 'cm' END,
              'none', 'none', false, false, v_ordem, v_criador)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- o mesmo código criado por outro caminho ao mesmo tempo
      SELECT pa.id INTO v_ex FROM product_attributes pa WHERE pa.organization_id = p_org AND pa.code = v_code;
      RAISE EXCEPTION 'Já existe um atributo com este nome.' USING ERRCODE = 'CT004', DETAIL = coalesce(v_ex::text, '');
    END;
    IF v_tipo = 'lista' THEN
      -- o grupo de opções, vazio, sempre da ORGANIZAÇÃO
      INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
      VALUES (v_id, p_org, left(v_nome, 100), v_ordem, true, v_criador);
    END IF;
  ELSE
    -- ─ renomear (e tem_hex, se ninguém o usa) ─
    IF v_tipo IS NOT NULL AND v_tipo <> (CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END) THEN
      RAISE EXCEPTION 'O tipo de um atributo não se muda depois de criado: crie um atributo novo.' USING ERRCODE = 'CT002';
    END IF;
    v_hex := coalesce(p_tem_hex, a.tem_hex);
    IF v_hex IS DISTINCT FROM a.tem_hex THEN
      IF a.is_measurement AND v_hex THEN
        RAISE EXCEPTION 'Uma medida não pode ter cor (hex): a cor é só para atributos de lista.' USING ERRCODE = 'CT002';
      END IF;
      SELECT count(*)::integer INTO v_n FROM product_attribute_values v
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
      WHERE v.attribute_id = a.id;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'Não se pode mudar a cor (hex) de «%»: há % produto(s) a usá-lo.', a.label, v_n USING ERRCODE = 'CT002';
      END IF;
      -- ligar a cor a um atributo que já tem opções deixá-las-ia sem código de cor
      IF v_hex AND EXISTS (SELECT 1 FROM attribute_option_group_values o JOIN attribute_option_groups g ON g.id = o.group_id
                           WHERE g.attribute_id = a.id) THEN
        RAISE EXCEPTION 'Este atributo já tem opções: crie um atributo novo com cor.' USING ERRCODE = 'CT002';
      END IF;
    END IF;
    UPDATE product_attributes pa SET label = v_nome, has_hex_color = v_hex
    WHERE pa.id = a.id AND (pa.label, coalesce(pa.has_hex_color, false)) IS DISTINCT FROM (v_nome, v_hex);
    -- o grupo da organização acompanha o nome (só se ainda tinha o nome antigo); os globais não se tocam
    UPDATE attribute_option_groups g SET name = left(v_nome, 100)
    WHERE g.attribute_id = a.id AND g.organization_id = p_org AND g.name = left(a.label, 100) AND g.name <> left(v_nome, 100);
    v_id := a.id;
  END IF;

  RETURN (
    SELECT jsonb_build_object('atributo', jsonb_build_object(
             'id', pa.id, 'codigo', pa.code, 'nome', pa.label,
             'tipo', CASE WHEN pa.is_measurement THEN 'medida' ELSE 'lista' END,
             'tem_hex', coalesce(pa.has_hex_color, false), 'ordem', coalesce(pa.sort_order, 0), 'ativo', true,
             'usados', (SELECT count(*)::integer FROM product_attribute_values v
                        JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
                        WHERE v.attribute_id = pa.id)))
    FROM product_attributes pa WHERE pa.id = v_id);
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_atributo(uuid,uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_atributo(uuid,uuid,text,text,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_atributo(uuid,uuid,text,text,boolean) IS
  'Catálogo (20270117600000): cria (p_atributo NULL; lista ou medida, código único gerado do nome, grupo de opções da organização; no máximo 200) ou renomeia um atributo. tem_hex só muda sem produtos vivos a usá-lo, e só se liga sem opções; o tipo não muda. Nome repetido: CT004 com o id no DETAIL. Permissão products.edit.';

-- ─── 3. Editar uma opção ────────────────────────────────────────────────────────
-- p_nome NULL = não mexe; p_hex NULL = não mexe, '' = limpa (só sem cor); p_ativo NULL = não mexe.
CREATE OR REPLACE FUNCTION public.cat_editar_opcao(p_org uuid, p_opcao uuid, p_nome text, p_hex text, p_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 255;
  c_max_reescrever constant integer := 5000;
  a record; o record; v_grupo uuid; v_nome text; v_disp text; v_hex text; v_ex record;
  v_n integer := 0; v_np integer := 0;
BEGIN
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome da opção é demasiado longo.' USING ERRCODE = 'CT002'; END IF;

  -- o atributo (da organização, não apagado) fica preso até ao fim, como em cat_guardar_opcao
  SELECT pa.id, pa.label, pa.is_measurement, coalesce(pa.has_hex_color, false) AS tem_hex, g.organization_id AS grupo_org INTO a
  FROM attribute_option_group_values ov
  JOIN attribute_option_groups g ON g.id = ov.group_id
  JOIN product_attributes pa ON pa.id = g.attribute_id
  WHERE ov.id = p_opcao AND pa.organization_id = p_org AND pa.deleted_at IS NULL
    AND (g.organization_id = p_org OR g.organization_id IS NULL)
  FOR NO KEY UPDATE OF pa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF a.grupo_org IS NULL THEN
    RAISE EXCEPTION 'Opção partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;
  IF a.is_measurement THEN
    RAISE EXCEPTION 'A «%» não tem opções: as medidas escrevem-se em cada produto.', a.label USING ERRCODE = 'CT002';
  END IF;

  -- só a opção do grupo em uso (o mesmo que ler e gravar usam)
  v_grupo := public.fn_cat_grupo_do_atributo(a.id, p_org);
  SELECT ov.id, ov.value_text::text AS valor, ov.display_name::text AS nome, ov.hex_color::text AS hex, ov.is_active,
         coalesce(ov.sort_order, 0) AS ordem INTO o
  FROM attribute_option_group_values ov WHERE ov.id = p_opcao AND ov.group_id = v_grupo FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;

  -- nome (valor e nome mostrado = o texto escrito, limpo)
  v_nome := o.valor; v_disp := o.nome;
  IF p_nome IS NOT NULL THEN
    v_nome := public.fn_cat_limpar_nome(p_nome);
    IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da opção.' USING ERRCODE = 'CT002'; END IF;
    IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da opção tem no máximo 255 caracteres.' USING ERRCODE = 'CT002'; END IF;
    SELECT x.id, x.is_active INTO v_ex FROM attribute_option_group_values x
    WHERE x.group_id = v_grupo AND x.id <> p_opcao AND public.fn_cat_chave_opcao(x.value_text) = public.fn_cat_chave_opcao(v_nome)
    ORDER BY x.is_active DESC, x.sort_order, x.id LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '%', CASE WHEN v_ex.is_active THEN 'Esta opção já existe.' ELSE 'Esta opção já existe (está desativada).' END
        USING ERRCODE = 'CT004', DETAIL = v_ex.id::text;
    END IF;
    v_disp := v_nome;
  END IF;

  -- cor: NULL não mexe; '' limpa (só sem cor); senão #RRGGBB (só nos atributos com cor)
  v_hex := o.hex;
  IF p_hex IS NOT NULL THEN
    IF btrim(p_hex) = '' THEN
      IF a.tem_hex THEN
        RAISE EXCEPTION 'Neste atributo a cor é obrigatória (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
      END IF;
      v_hex := NULL;
    ELSIF NOT a.tem_hex THEN
      RAISE EXCEPTION 'O atributo «%» não tem cor (hex).', a.label USING ERRCODE = 'CT002';
    ELSE
      v_hex := upper(btrim(p_hex));
      IF v_hex !~ '^#[0-9A-F]{6}$' THEN
        RAISE EXCEPTION 'O código da cor tem de ser # e seis algarismos hexadecimais (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
      END IF;
    END IF;
  END IF;

  -- renomear: os valores dos produtos e os preços da organização passam ao texto novo (na mesma transacção)
  IF v_nome IS DISTINCT FROM o.valor THEN
    SELECT count(*)::integer INTO v_n FROM product_attribute_values v
    JOIN products p ON p.id = v.product_id AND p.organization_id = p_org
    WHERE v.attribute_id = a.id AND v.value_text = o.valor;
    SELECT count(*)::integer INTO v_np FROM product_attribute_value_prices pr
    WHERE pr.attribute_id = a.id AND pr.organization_id = p_org AND pr.value_option = o.valor;
    IF v_n + v_np > c_max_reescrever THEN
      RAISE EXCEPTION 'Esta opção é usada em demasiados produtos para renomear de uma vez.' USING ERRCODE = 'CT002';
    END IF;
    IF v_np > 0 AND EXISTS (SELECT 1 FROM product_attribute_value_prices pr
                            WHERE pr.attribute_id = a.id AND pr.organization_id = p_org AND pr.value_option = v_nome) THEN
      RAISE EXCEPTION 'Já há preços com o nome «%» neste atributo: não se pode renomear a opção para ele.', v_nome USING ERRCODE = 'CT002';
    END IF;

    UPDATE product_attribute_values v SET value_text = v_nome
    FROM products p
    WHERE p.id = v.product_id AND p.organization_id = p_org AND v.attribute_id = a.id AND v.value_text = o.valor;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE product_attribute_value_prices pr SET value_option = v_nome
    WHERE pr.attribute_id = a.id AND pr.organization_id = p_org AND pr.value_option = o.valor;
    GET DIAGNOSTICS v_np = ROW_COUNT;
  END IF;

  UPDATE attribute_option_group_values ov
  SET value_text = v_nome, display_name = v_disp, hex_color = v_hex, is_active = coalesce(p_ativo, ov.is_active)
  WHERE ov.id = p_opcao
    AND (ov.value_text::text, ov.display_name::text, ov.hex_color::text, ov.is_active)
        IS DISTINCT FROM (v_nome, v_disp, v_hex, coalesce(p_ativo, ov.is_active));

  RETURN jsonb_build_object(
    'opcao', jsonb_build_object(
      'id', o.id, 'valor', v_nome, 'nome', coalesce(v_disp, v_nome),
      'hex', CASE WHEN a.tem_hex THEN v_hex END, 'ordem', o.ordem, 'ativo', coalesce(p_ativo, o.is_active),
      'usados', (SELECT count(*)::integer FROM product_attribute_values v
                 JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
                 WHERE v.attribute_id = a.id AND v.value_text = v_nome)),
    'valores_atualizados', v_n,
    'precos_atualizados', v_np);
END $$;
REVOKE ALL ON FUNCTION public.cat_editar_opcao(uuid,uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_editar_opcao(uuid,uuid,text,text,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_editar_opcao(uuid,uuid,text,text,boolean) IS
  'Catálogo (20270117600000): renomeia uma opção (e, na mesma transacção, o texto dos valores dos produtos e dos preços da organização que a usam; até 5000 linhas), muda a cor (NULL não mexe; vazio limpa só sem cor) e ativa/desativa (NULL não mexe). Só no grupo da organização. Nome repetido: CT004 com o id no DETAIL. Permissão products.edit.';

-- ─── 4. Reordenar as opções ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_reordenar_opcoes(p_org uuid, p_atributo uuid, p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_opcoes constant integer := 500;
  a record; v_grupo uuid; v_grupo_org uuid; v_n integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'A ordem tem de trazer a lista das opções.' USING ERRCODE = 'CT002';
  END IF;
  IF cardinality(p_ids) > c_max_opcoes THEN
    RAISE EXCEPTION 'Um atributo tem no máximo 500 opções.' USING ERRCODE = 'CT002';
  END IF;

  SELECT pa.id, pa.label, pa.is_measurement INTO a FROM product_attributes pa
  WHERE pa.id = p_atributo AND pa.organization_id = p_org AND pa.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF a.is_measurement THEN
    RAISE EXCEPTION 'A «%» não tem opções: as medidas escrevem-se em cada produto.', a.label USING ERRCODE = 'CT002';
  END IF;
  v_grupo := public.fn_cat_grupo_do_atributo(a.id, p_org);
  IF v_grupo IS NULL THEN
    RAISE EXCEPTION 'O atributo «%» ainda não tem opções.', a.label USING ERRCODE = 'CT002';
  END IF;
  SELECT g.organization_id INTO v_grupo_org FROM attribute_option_groups g WHERE g.id = v_grupo;
  IF v_grupo_org IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'Opção partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_ids) x WHERE x IS NULL)
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'A ordem tem opções repetidas ou vazias.' USING ERRCODE = 'CT002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_ids) x WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.id = x AND o.group_id = v_grupo))
     OR EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.group_id = v_grupo AND NOT (o.id = ANY (p_ids))) THEN
    RAISE EXCEPTION 'A ordem tem de trazer todas as opções de «%», e só essas.', a.label USING ERRCODE = 'CT002';
  END IF;

  UPDATE attribute_option_group_values o SET sort_order = t.i::integer
  FROM unnest(p_ids) WITH ORDINALITY AS t(id, i)
  WHERE o.id = t.id AND o.group_id = v_grupo AND o.sort_order IS DISTINCT FROM t.i::integer;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'n', cardinality(p_ids), 'alteradas', v_n);
END $$;
REVOKE ALL ON FUNCTION public.cat_reordenar_opcoes(uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_reordenar_opcoes(uuid,uuid,uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_reordenar_opcoes(uuid,uuid,uuid[]) IS
  'Catálogo (20270117600000): ordena as opções do atributo pela ordem dos ids (1, 2, …). Tem de trazer todas as opções do grupo da organização, cada uma uma vez (máximo 500). Permissão products.edit.';

-- ─── 5. Gravar os valores de um produto — a de 20270117500000 com FOR SHARE na leitura da opção ────
-- Corpo copiado byte a byte da versão aplicada (20270117500000); a ÚNICA diferença é «FOR SHARE» na leitura
-- da opção, para esperar por um renomear em curso (cat_editar_opcao prende a opção com FOR NO KEY UPDATE).
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
  'Catálogo (20270117500000): substitui os valores de atributos de um produto (no máximo 50; uma opção por atributo de lista; a Medida 2D/3D em value_json). Só apaga valores de atributos activos da organização. Permissão products.edit.';

-- ─── 6. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record; v_src text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_atributos_gestao(uuid)', 'public.cat_guardar_atributo(uuid,uuid,text,text,boolean)',
                                'public.cat_editar_opcao(uuid,uuid,text,text,boolean)', 'public.cat_reordenar_opcoes(uuid,uuid,uuid[])',
                                'public.cat_guardar_produto_atributos(uuid,uuid,jsonb)'] LOOP
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
  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos_gestao(uuid)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_atributos_gestao não é STABLE.';
  END IF;

  -- cat_guardar_produto_atributos: os limites de 20270117500000 continuam e a leitura da opção leva FOR SHARE
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_atributos(uuid,uuid,jsonb)')::oid);
  IF v_src NOT LIKE '%c_max_valores constant integer := 50;%' OR v_src NOT LIKE '%FOR NO KEY UPDATE%'
     OR v_src NOT LIKE '%o.group_id = v_grupo FOR SHARE;%' THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto_atributos sem os limites de 20270117500000 ou sem FOR SHARE na leitura da opção.';
  END IF;
  -- os tetos estão no corpo (âncoras)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_editar_opcao(uuid,uuid,text,text,boolean)')::oid)
       NOT LIKE '%c_max_reescrever constant integer := 5000;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_atributo(uuid,uuid,text,text,boolean)')::oid)
       NOT LIKE '%c_max_atributos constant integer := 200;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_reordenar_opcoes(uuid,uuid,uuid[])')::oid)
       NOT LIKE '%c_max_opcoes constant integer := 500;%' THEN
    RAISE EXCEPTION 'Conferir: falta um dos tetos no corpo das funções (5000 linhas, 200 atributos, 500 opções).';
  END IF;
  RAISE NOTICE 'atributos_gestao_catalogo: 4 funções novas e cat_guardar_produto_atributos (com FOR SHARE) conferidas.';
END $c$;
