-- =============================================================================
-- Catálogo — PREÇO GROSSISTA e PREÇO DISTRIBUIDOR dos produtos (ler, gravar) e preenchimento na MUDELAR.
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro com as linhas de dados GERADAS por script (gerar.js) a partir de
-- «Cozinhas/Lava Louça e Cubas.csv» e «Casas de Banho/Acessórios Casa de Banho/Acessórios WC.xlsx»: as linhas
-- de dados abaixo não se editam à mão — regeneram-se.
-- =============================================================================
--
-- Onde estão: product_prices, price_type 'wholesale' (grossista) e 'distributor' (distribuidor) — o enum já os tem;
-- até hoje só se usavam 'purchase' (custo) e 'retail' (PVP). Sem tabelas, colunas nem índices novos.
--
-- 1. LER — cat_ler_produtos_pagina (versão de 20270118500000, md5 conferido na guarda) passa a devolver em cada
--    produtos[] mais duas chaves:
--        grossista     o 'wholesale' mais recente (valid_from DESC NULLS LAST, created_at DESC, id), coalesce(preco_exato, price); null se não houver
--        distribuidor  o 'distributor' mais recente, pela mesma regra; null se não houver
--    Como o custo e o PVP, só com services.view (ve_valores); sem ela, null. Nada mais muda na função (assinatura,
--    filtros, ordem, permissões, as outras chaves). Um valor 0 gravado devolve-se 0 (não é «sem preço»).
--    A FICHA: cat_ler_catalogo NÃO muda — já devolve em precosProduto as linhas de TODOS os price_type
--    (product_id, price_type, price, valid_from), por isso 'wholesale' e 'distributor' já chegam ao ecrã; falta só o
--    ecrã lê-los (catalogoReal.ts montarCatalogo: ultimo(id, "wholesale") / ultimo(id, "distributor")).
--
-- 2. GRAVAR — NOVA cat_definir_grossista_distribuidor(p_product_id uuid, p_grossista numeric, p_distribuidor numeric)
--        → {"ok": true, "grossista": numeric|null, "distribuidor": numeric|null}
--    Molde de cat_definir_pvp (20270101220000), para os dois tipos de uma vez. Os DOIS valores são o estado final:
--      • NULL → apaga as linhas desse tipo do produto (ou não cria). «Vazio» é NULL: o ecrã manda null num campo vazio.
--      • valor → tem de ser >= 0, com no máximo 2 casas decimais e < 100 000 000; senão CT002 (nada se escreve: os
--        dois valores validam-se antes de qualquer escrita). Muda a linha ATUAL desse tipo (price e preco_exato);
--        sem linha, insere uma (valid_from depois do último preço do produto, IVA por omissão, moeda do custo atual
--        ou EUR). Igual ao atual: não escreve nada. Nunca mexe no custo nem no PVP.
--      • Produto inexistente ou apagado → CT003.
--      • Permissão: as de quem grava o custo E o PVP — products.edit (cat_guardar_produto, custo e PVP do Catálogo)
--        E products.manage_prices (cat_definir_pvp, PVP da ficha), na organização do produto (fn_cat_exigir: system
--        admin ou papel). Lido a 17/11: na Mudelar e na nike os membros com uma têm a outra (8/8 e 6/6).
--      SECURITY DEFINER, search_path public, pg_temp; EXECUTE só authenticated e service_role.
--    cat_guardar_produto NÃO muda: os seus chamadores não mandam grossista/distribuidor e um NULL apagaria os preços.
--
-- 3. PREENCHER — Mudelar (3242e925-…, conferida pelo nome), product_prices 'wholesale' / 'distributor' quando o valor
--    do ficheiro é > 0 (0 ou vazio não se grava), arredondado a 2 casas:
--      • Lava-louças & Cubas: 30 produtos, cada um com grossista E distribuidor (no ficheiro, 12 e 11 em todos). Ficam
--        de fora AMBAR 1 CUBA 50, AMBAR 1 CUBA 50 N (0 e 0) e a linha LEMIS (0 e 0; não existe na base).
--      • Acessórios WC: 12 produtos (Piaçaba SMOOTH ×6, Toalheiro SMOOTH BARRA 60cm ×6), só distribuidor (30 a 40);
--        nenhum tem grossista.
--      Total: 30 grossista + 42 distribuidor = 72 linhas.
--    Ligação ao produto pelo NOME (o SKU antigo deixou de existir; 20270119000000 manteve os nomes): espaços de fora
--    cortados e seguidos reduzidos a um, sem maiúsculas; tem de haver EXATAMENTE um produto vivo, tipo 'produto', da
--    Mudelar com esse nome, e o SKU dele tem de começar por LLC- (lava-louças) ou ACB- (acessórios). Senão RAISE.
--    valid_from: depois do último preço do produto (grossista em +1 µs, distribuidor em +2 µs, nunca antes de agora);
--    IVA 23, EUR, created_by = o primeiro membro ativo da Mudelar (como as importações). preco_exato = price.
--    Auditoria normal, linha a linha, app.audit_source = 'migration:catalogo_precos_grossista_distribuidor'.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever) do preenchimento se a organização 3242e925-… não existir com o nome
-- 'Mudelar', ou se os 42 produtos já tiverem exatamente estes preços (segunda execução).
-- Falha (RAISE EXCEPTION, nada fica) se: cat_ler_produtos_pagina não for a de 20270118500000 (md5); já existir
-- cat_definir_grossista_distribuidor; faltar 'wholesale'/'distributor' no enum ou uma função de apoio; um nome não der
-- exatamente um produto, ou o SKU não for do prefixo; algum dos 42 já tiver grossista/distribuidor diferente.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): as duas funções (SECURITY DEFINER,
-- search_path, acessos, volatilidade); 72 linhas novas certas (uma por produto e tipo, o valor certo); nenhum
-- grossista nos acessórios; custo e PVP dos 42 intactos; nada escrito fora destes 42 produtos (xmin); e a página
-- lida como um membro da Mudelar com services.view devolve grossista/distribuidor certos.
--
-- O ECRÃ: só ACRESCENTA (duas chaves na página e uma função nova); o ecrã atual continua a funcionar sem mudanças.
-- Para mostrar e gravar os dois preços, o ecrã precisa desta migration aplicada (src/emylia/real/produtosPaginados.ts
-- LinhaPaginaProduto, catalogoReal.ts montarCatalogo, fichaProdutoDados.ts → cat_definir_grossista_distribuidor).
-- Teste: supabase/tests/catalogo_precos_grossista_distribuidor.test.sql (BEGIN … ROLLBACK; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text; v_h text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.fn_cat_depois_do_ultimo_preco(uuid)', 'public.fn_cat_termos_pesquisa(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_medida_texto(jsonb)', 'public.has_anew_permission_in_org(uuid,text,uuid)',
                    'public.cat_ler_catalogo(uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Faltam funções: %. Rever esta migration.', v_falta; END IF;

  IF (SELECT count(*) FROM pg_enum e WHERE e.enumtypid = 'public.price_type'::regtype
        AND e.enumlabel::text IN ('wholesale', 'distributor')) <> 2 THEN
    RAISE EXCEPTION 'O enum price_type não tem wholesale e distributor. Rever esta migration.';
  END IF;

  -- a página é reescrita a partir da versão aplicada (20270118500000, lida a 17/11)
  v_h := md5(pg_get_functiondef('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)'::regprocedure));
  IF v_h IS DISTINCT FROM '7d4da1ef584494db2394d7fd22cebeb4' THEN
    RAISE EXCEPTION 'cat_ler_produtos_pagina mudou desde a leitura (md5 %): rever esta migration.', v_h;
  END IF;

  SELECT string_agg(pr.oid::regprocedure::text, ', ') INTO v_falta FROM pg_proc pr
  WHERE pr.pronamespace = 'public'::regnamespace AND pr.proname::text = 'cat_definir_grossista_distribuidor';
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Já existe %: rever esta migration.', v_falta; END IF;
END $g$;

-- ─── 1. A página de produtos, com grossista e distribuidor ──────────────────────
-- Igual a 20270118500000; o que muda: o LATERAL rv e as chaves grossista e distribuidor.
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_pagina(
  p_org uuid, p_q text DEFAULT NULL, p_categoria uuid DEFAULT NULL, p_subcategoria uuid DEFAULT NULL,
  p_modelo uuid DEFAULT NULL, p_marca text DEFAULT NULL, p_sem_categoria boolean DEFAULT false,
  p_limite integer DEFAULT 50, p_pagina integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_max_limite constant integer := 200;
  v_limite integer := coalesce(p_limite, 50);
  v_pagina integer := coalesce(p_pagina, 1);
  v_sem_cat boolean := coalesce(p_sem_categoria, false);
  v_termos text[];
  v_marca text := nullif(lower(btrim(coalesce(p_marca, ''))), '');
  v_valores boolean;
  v_total integer;
  v_produtos jsonb;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF v_limite < 1 OR v_limite > c_max_limite THEN
    RAISE EXCEPTION 'O limite tem de estar entre 1 e %.', c_max_limite USING ERRCODE = 'CT002';
  END IF;
  IF v_pagina < 1 THEN
    RAISE EXCEPTION 'A página começa em 1.' USING ERRCODE = 'CT002';
  END IF;
  v_termos := public.fn_cat_termos_pesquisa(p_q);
  -- preços e fornecedores: só com services.view (o corte de cat_ler_catalogo)
  v_valores := public.fn_cat_pode(p_org, 'services.view');

  WITH f AS MATERIALIZED (
    SELECT p.id, p.name
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
      AND (p_categoria IS NULL OR p.category_id = p_categoria OR s.parent_id = p_categoria)
      AND (p_subcategoria IS NULL OR p.subcategory_id = p_subcategoria)
      AND (p_modelo IS NULL OR p.model_id = p_modelo)
      AND (v_marca IS NULL OR lower(btrim(coalesce(b.name, p.marca_livre, ''))) = v_marca)
      AND (NOT v_sem_cat OR (p.category_id IS NULL AND p.subcategory_id IS NULL))
      AND (v_termos IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_termos) q
            WHERE strpos(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                    concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name, lpad(pm.numero::text, 4, '0')))), q) = 0))
  ),
  pag AS (
    SELECT f.id, f.name FROM f ORDER BY f.name, f.id
    OFFSET ((v_pagina::bigint - 1) * v_limite) LIMIT v_limite
  ),
  atr AS (
    SELECT a.id, a.label, a.is_measurement, coalesce(a.sort_order, 0) AS ordem,
           CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
    FROM product_attributes a
    WHERE a.organization_id = p_org AND a.deleted_at IS NULL
  )
  SELECT (SELECT count(*)::integer FROM f),
         coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'nome', p.name, 'sku', p.sku, 'sku_gerado', p.sku_gerado,
             'marca', coalesce(b.name, p.marca_livre),
             'categoria_id', coalesce(p.category_id, s.parent_id), 'categoria', c.name,
             'subcategoria_id', p.subcategory_id, 'subcategoria', s.name,
             'modelo_id', pm.id, 'modelo', pm.name, 'modelo_numero', pm.numero,
             'unidade', coalesce(nullif(u.code, ''), nullif(p.unidade, ''), 'un'),
             'custo', CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN fo.purchase_price ELSE cp.preco END,
             'pvp', CASE WHEN vp.preco > 0 THEN vp.preco END,
             'grossista', rv.grossista,
             'distribuidor', rv.distribuidor,
             'fornecedor', coalesce(CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN nullif(fo.fornecedor, '') END,
                                    nullif(p.fornecedor_livre, '')),
             'ativo', p.is_active,
             'imagem', (SELECT x.u::text FROM unnest(p.image_urls) WITH ORDINALITY AS x(u, o)
                        WHERE coalesce(x.u::text, '') <> '' ORDER BY x.o LIMIT 1),
             'atributos_resumo', ra.resumo)
           ORDER BY pg.name, pg.id)
    FROM pag pg
    JOIN products p ON p.id = pg.id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    LEFT JOIN uom u ON u.id = p.uom_id
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'purchase'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) cp ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'retail'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) vp ON true
    -- 20270119700000: o grossista e o distribuidor mais recentes, numa só leitura (idx_product_prices_type)
    LEFT JOIN LATERAL (
      SELECT max(x.preco) FILTER (WHERE x.tipo = 'wholesale') AS grossista,
             max(x.preco) FILTER (WHERE x.tipo = 'distributor') AS distribuidor
      FROM (SELECT DISTINCT ON (pp.price_type) pp.price_type AS tipo, coalesce(pp.preco_exato, pp.price) AS preco
            FROM product_prices pp
            WHERE v_valores AND pp.product_id = p.id AND pp.price_type IN ('wholesale', 'distributor')
            ORDER BY pp.price_type, pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id) x) rv ON true
    LEFT JOIN LATERAL (
      SELECT i.id, i.purchase_price, su.name AS fornecedor FROM item_suppliers i
      LEFT JOIN suppliers su ON su.id = i.supplier_id
      WHERE v_valores AND i.product_id = p.id AND i.is_active AND i.deleted_at IS NULL
      ORDER BY i.is_preferred DESC, i.updated_at DESC LIMIT 1) fo ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(x.label || ': ' || x.txt, ' · ' ORDER BY x.ordem, x.label, x.aid) AS resumo
      FROM (
        SELECT a.id AS aid, a.label, a.ordem,
               CASE WHEN a.is_measurement
                    THEN coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)
                    ELSE coalesce(nullif(o.display_name, ''), nullif(o.value_text, ''), v.value_text) END AS txt
        FROM product_attribute_values v
        JOIN atr a ON a.id = v.attribute_id
        LEFT JOIN attribute_option_group_values o
          ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text AND o.is_active
        WHERE v.product_id = p.id) x
      WHERE coalesce(x.txt, '') <> '') ra ON true), '[]'::jsonb)
  INTO v_total, v_produtos;

  RETURN jsonb_build_object(
    'total', v_total, 'pagina', v_pagina, 'limite', v_limite,
    'paginas', ceil(v_total::numeric / v_limite)::integer,
    've_valores', v_valores,
    'produtos', v_produtos);
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) IS
  'Catálogo (20270118500000; grossista e distribuidor em 20270119700000): uma página da lista de produtos (tipo produto, vivos), por nome e id, com filtros (categoria com as subs, subcategoria, modelo, marca, sem categoria) e pesquisa sem acentos por palavras (nome, SKU, marca, subcategoria, modelo). Custo, PVP, grossista, distribuidor e fornecedor só com services.view. Permissão products.edit ou services.view. p_limite 1..200.';

-- ─── 2. Gravar grossista e distribuidor ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_definir_grossista_distribuidor(p_product_id uuid, p_grossista numeric, p_distribuidor numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max   constant numeric := 100000000;
  v_org   uuid;
  v_user  uuid;
  v_tipo  public.price_type;
  v_valor numeric;
  v_linha public.product_prices;
  v_ccy   public.currency_code;
  v_rot   text;
BEGIN
  SELECT organization_id INTO v_org FROM products WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  -- as permissões de quem grava o custo (products.edit) e o PVP (products.manage_prices)
  v_user := public.fn_cat_exigir(v_org, 'products.edit');
  v_user := public.fn_cat_exigir(v_org, 'products.manage_prices');
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;

  -- validar os dois antes de escrever qualquer um
  FOREACH v_rot IN ARRAY ARRAY['grossista', 'distribuidor'] LOOP
    v_valor := CASE v_rot WHEN 'grossista' THEN p_grossista ELSE p_distribuidor END;
    CONTINUE WHEN v_valor IS NULL;
    IF v_valor < 0 THEN
      RAISE EXCEPTION 'O preço % não pode ser negativo.', v_rot USING ERRCODE = 'CT002';
    END IF;
    IF v_valor <> round(v_valor, 2) THEN
      RAISE EXCEPTION 'O preço % tem no máximo 2 casas decimais.', v_rot USING ERRCODE = 'CT002';
    END IF;
    IF v_valor >= c_max THEN
      RAISE EXCEPTION 'O preço % é demasiado alto.', v_rot USING ERRCODE = 'CT002';
    END IF;
  END LOOP;

  -- trancar o produto: duas gravações dos preços não se cruzam
  PERFORM 1 FROM products WHERE id = p_product_id FOR NO KEY UPDATE;
  PERFORM set_config('app.audit_source', 'catalogo', true);

  FOREACH v_tipo IN ARRAY ARRAY['wholesale', 'distributor']::public.price_type[] LOOP
    v_valor := CASE v_tipo WHEN 'wholesale' THEN p_grossista ELSE p_distribuidor END;
    IF v_valor IS NULL THEN
      DELETE FROM product_prices WHERE product_id = p_product_id AND price_type = v_tipo;
      CONTINUE;
    END IF;
    v_valor := round(v_valor, 2);
    v_linha := NULL;
    SELECT * INTO v_linha FROM product_prices
    WHERE product_id = p_product_id AND price_type = v_tipo
    ORDER BY valid_from DESC NULLS LAST, created_at DESC, id
    LIMIT 1;
    IF v_linha.id IS NOT NULL THEN
      IF v_linha.price IS DISTINCT FROM v_valor OR coalesce(v_linha.preco_exato, v_linha.price) IS DISTINCT FROM v_valor THEN
        UPDATE product_prices SET price = v_valor, preco_exato = v_valor, created_by = v_user WHERE id = v_linha.id;
      END IF;
    ELSE
      SELECT pp.currency INTO v_ccy FROM product_prices pp
      WHERE pp.product_id = p_product_id AND pp.price_type = 'purchase'
      ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id
      LIMIT 1;
      INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type)
      VALUES (p_product_id, coalesce(v_ccy, 'EUR'), v_valor, v_valor,
              greatest(clock_timestamp(), public.fn_cat_depois_do_ultimo_preco(p_product_id)), v_user, v_tipo);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'grossista', round(p_grossista, 2), 'distribuidor', round(p_distribuidor, 2));
END $function$;
REVOKE ALL ON FUNCTION public.cat_definir_grossista_distribuidor(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_grossista_distribuidor(uuid, numeric, numeric) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_grossista_distribuidor(uuid, numeric, numeric) IS
  'Catálogo (20270119700000): define o preço grossista (wholesale) e o distribuidor (distributor) de um produto — os dois valores são o estado final: NULL apaga, valor (>= 0, 2 casas) muda a linha atual ou insere uma. products.edit e products.manage_prices na organização do produto. Nunca mexe no custo nem no PVP.';

-- ─── 3. Preencher na Mudelar ────────────────────────────────────────────────────
DO $mig$
DECLARE
  c_org     constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte   constant text    := 'migration:catalogo_precos_grossista_distribuidor';
  c_total   constant integer := 42;
  c_lava    constant integer := 30;
  c_wc      constant integer := 12;
  c_n_gross constant integer := 30;
  c_n_dist  constant integer := 42;
  c_iva     constant numeric := 23;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_txt text; v_xid text; v_criador uuid; v_auth uuid; v_claims text; j jsonb;
BEGIN
  -- ─── 3.0 Guarda (inerte) ──────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'precos_grossista_distribuidor: a organização Mudelar (%) não existe nesta base — preenchimento não feito.', c_org;
    RETURN;
  END IF;

  -- ─── Os dados dos ficheiros (gerados) ─────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._pgd_linhas, pg_temp._pgd, pg_temp._pgd_antes;
  -- (ficheiro, linha do ficheiro, nome do produto, grossista, distribuidor); NULL = 0 ou vazio no ficheiro, não se grava
  CREATE TEMP TABLE _pgd_linhas (fonte text NOT NULL, linha integer NOT NULL, nome text NOT NULL,
                                 grossista numeric, distribuidor numeric, PRIMARY KEY (fonte, linha)) ON COMMIT DROP;
  INSERT INTO _pgd_linhas (fonte, linha, nome, grossista, distribuidor) VALUES
    ('lava', 2, 'Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 3, 'Lava-louças VELAR 1 CUBA 45', 12.00, 11.00),
    ('lava', 4, 'Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 5, 'Lava-louças AMBAR 1 CUBA 40 N', 12.00, 11.00),
    ('lava', 7, 'Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 8, 'Lava-louças VELAR 1 CUBA 34', 12.00, 11.00),
    ('lava', 9, 'Lava-louças UNA 55 - 2 CUBAS', 12.00, 11.00),
    ('lava', 10, 'Lava-louças VELAR 1 CUBA 50', 12.00, 11.00),
    ('lava', 11, 'Lava-louças LODY PVD 1 CUBA 50', 12.00, 11.00),
    ('lava', 12, 'Lava-louças DUO 80 - 2 CUBAS', 12.00, 11.00),
    ('lava', 13, 'Lava-louças BAHIA 1 CUBA', 12.00, 11.00),
    ('lava', 14, 'Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 15, 'Lava-louças LODY PVD 1 CUBA 40', 12.00, 11.00),
    ('lava', 16, 'Lava-louças VELAR 1 CUBA 40', 12.00, 11.00),
    ('lava', 17, 'Lava-louças BELÉM 1 CUBA', 12.00, 11.00),
    ('lava', 18, 'Lava-louças AMBAR 1.5 CUBA 55', 12.00, 11.00),
    ('lava', 19, 'Lava-louças UNA 75 - 2 CUBAS', 12.00, 11.00),
    ('lava', 20, 'Lava-louças LAGUNA 1 CUBA', 12.00, 11.00),
    ('lava', 21, 'Lava-louças BRASILIA 1 CUBA', 12.00, 11.00),
    ('lava', 22, 'Lava-louças DUO 60 - 2 CUBAS', 12.00, 11.00),
    ('lava', 23, 'Lava-louças AMBAR 1 CUBA 40', 12.00, 11.00),
    ('lava', 24, 'Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 25, 'Lava-louças LODY PVD 1 CUBA 70', 12.00, 11.00),
    ('lava', 26, 'Lava-louças AMBAR 1 CUBA 57', 12.00, 11.00),
    ('lava', 27, 'Lava-louças AMBAR 1 CUBA 80', 12.00, 11.00),
    ('lava', 29, 'Lava-louças AMBAR 1 CUBA 70', 12.00, 11.00),
    ('lava', 31, 'Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 32, 'Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 33, 'Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 34, 'Lava-louças VELAR 1 CUBA 70', 12.00, 11.00),
    ('wc', 56, 'Piaçaba SMOOTH CROMADO', NULL, 30.00),
    ('wc', 57, 'Piaçaba SMOOTH PRETO MATE', NULL, 35.00),
    ('wc', 58, 'Piaçaba SMOOTH GUN METAL', NULL, 40.00),
    ('wc', 59, 'Piaçaba SMOOTH BRANCO MATE', NULL, 35.00),
    ('wc', 60, 'Piaçaba SMOOTH DOURADO ESCOVADO', NULL, 40.00),
    ('wc', 61, 'Piaçaba SMOOTH ROSA GOLD ESCOVADO', NULL, 40.00),
    ('wc', 81, 'Toalheiro SMOOTH BARRA 60cm CROMADO', NULL, 40.00),
    ('wc', 82, 'Toalheiro SMOOTH BARRA 60cm PRETO MATE', NULL, 40.00),
    ('wc', 83, 'Toalheiro SMOOTH BARRA 60cm GUN METAL', NULL, 40.00),
    ('wc', 84, 'Toalheiro SMOOTH BARRA 60cm BRANCO MATE', NULL, 40.00),
    ('wc', 85, 'Toalheiro SMOOTH BARRA 60cm DOURADO ESCOVADO', NULL, 40.00),
    ('wc', 86, 'Toalheiro SMOOTH BARRA 60cm ROSA GOLD ESCOVADO', NULL, 40.00);

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT lower(l.nome)) INTO v_n, v_m FROM _pgd_linhas l;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'precos_grossista_distribuidor: os dados gerados têm % linhas (% nomes) em vez de %.', v_n, v_m, c_total;
  END IF;
  IF (SELECT count(*) FROM _pgd_linhas WHERE fonte = 'lava') <> c_lava OR (SELECT count(*) FROM _pgd_linhas WHERE fonte = 'wc') <> c_wc
     OR (SELECT count(grossista) FROM _pgd_linhas) <> c_n_gross OR (SELECT count(distribuidor) FROM _pgd_linhas) <> c_n_dist
     OR EXISTS (SELECT 1 FROM _pgd_linhas l WHERE l.grossista <= 0 OR l.distribuidor <= 0
                OR l.grossista <> round(l.grossista, 2) OR l.distribuidor <> round(l.distribuidor, 2)
                OR (l.fonte = 'wc' AND l.grossista IS NOT NULL)) THEN
    RAISE EXCEPTION 'precos_grossista_distribuidor: os dados gerados não são 30 lava-louças + 12 acessórios com os preços esperados.';
  END IF;

  -- cada linha: EXATAMENTE um produto vivo da Mudelar com esse nome, e com o SKU do prefixo da categoria
  CREATE TEMP TABLE _pgd ON COMMIT DROP AS
  SELECT l.*, x.n, x.id, x.sku
  FROM _pgd_linhas l
  LEFT JOIN LATERAL (
    SELECT count(*) AS n, (array_agg(p.id ORDER BY p.id))[1] AS id, (array_agg(p.sku ORDER BY p.id))[1] AS sku
    FROM products p
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.tipo_catalogo = 'produto'
      AND lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g')) = lower(l.nome)) x ON true;
  SELECT string_agg(b.fonte || ':' || b.linha || ' «' || b.nome || '» (' || b.n || ')', ', ' ORDER BY b.fonte, b.linha) INTO v_txt
  FROM _pgd b WHERE b.n <> 1;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'precos_grossista_distribuidor: nomes sem exatamente um produto na Mudelar: %', v_txt;
  END IF;
  SELECT string_agg(b.nome || ' = ' || coalesce(b.sku, '∅'), ', ') INTO v_txt FROM _pgd b
  WHERE coalesce(b.sku, '') NOT LIKE CASE b.fonte WHEN 'lava' THEN 'LLC-%' ELSE 'ACB-%' END;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'precos_grossista_distribuidor: SKU fora da categoria esperada: %', v_txt; END IF;
  IF (SELECT count(DISTINCT b.id) FROM _pgd b) <> c_total THEN
    RAISE EXCEPTION 'precos_grossista_distribuidor: duas linhas dos ficheiros dão o mesmo produto.';
  END IF;

  -- já preenchido? Igual ao esperado → inerte; diferente → parar
  SELECT count(*) INTO v_n FROM product_prices x JOIN _pgd b ON b.id = x.product_id
  WHERE x.price_type IN ('wholesale', 'distributor');
  IF v_n > 0 THEN
    SELECT count(*) INTO v_m FROM _pgd b
    WHERE (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'wholesale') = (b.grossista IS NOT NULL)::int
      AND (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'distributor') = (b.distribuidor IS NOT NULL)::int
      AND NOT EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id
                        AND ((x.price_type = 'wholesale' AND coalesce(x.preco_exato, x.price) IS DISTINCT FROM b.grossista)
                          OR (x.price_type = 'distributor' AND coalesce(x.preco_exato, x.price) IS DISTINCT FROM b.distribuidor)));
    IF v_m = c_total AND v_n = c_n_gross + c_n_dist THEN
      RAISE NOTICE 'precos_grossista_distribuidor: os % produtos já têm estes preços — nada a fazer.', c_total;
      RETURN;
    END IF;
    RAISE EXCEPTION 'precos_grossista_distribuidor: % produtos já têm grossista/distribuidor diferentes do ficheiro (% linhas): rever.', c_total - v_m, v_n;
  END IF;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'precos_grossista_distribuidor: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- o custo e o PVP de antes, para conferir que ficam intactos
  CREATE TEMP TABLE _pgd_antes ON COMMIT DROP AS
  SELECT x.id, x.price_type, x.price, x.preco_exato, x.valid_from FROM product_prices x JOIN _pgd b ON b.id = x.product_id;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 3.1 Gravar (auditoria normal, linha a linha) ─────────────────────────────
  -- valid_from depois do último preço do produto (a chave única é produto + moeda + valid_from)
  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.grossista, 2), round(b.grossista, 2),
         greatest(v_agora, public.fn_cat_depois_do_ultimo_preco(b.id)), v_criador, 'wholesale'::price_type, c_iva
  FROM _pgd b WHERE b.grossista IS NOT NULL
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.distribuidor, 2), round(b.distribuidor, 2),
         greatest(v_agora, public.fn_cat_depois_do_ultimo_preco(b.id)) + interval '1 microsecond', v_criador, 'distributor'::price_type, c_iva
  FROM _pgd b WHERE b.distribuidor IS NOT NULL;

  -- ─── 3.2 Conferir (conta o que está ERRADO) ───────────────────────────────────
  -- uma linha por produto e tipo, com o valor certo; nenhuma onde o ficheiro tem 0/vazio
  SELECT count(*) INTO v_n FROM _pgd b
  WHERE (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'wholesale') <> (b.grossista IS NOT NULL)::int
     OR (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'distributor') <> (b.distribuidor IS NOT NULL)::int
     OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id
                  AND ((x.price_type = 'wholesale' AND (x.price IS DISTINCT FROM b.grossista OR x.preco_exato IS DISTINCT FROM b.grossista))
                    OR (x.price_type = 'distributor' AND (x.price IS DISTINCT FROM b.distribuidor OR x.preco_exato IS DISTINCT FROM b.distribuidor))));
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: % produtos com grossista/distribuidor errado.', v_n; END IF;
  SELECT count(*) FILTER (WHERE x.price_type = 'wholesale'), count(*) FILTER (WHERE x.price_type = 'distributor') INTO v_n, v_m
  FROM product_prices x JOIN _pgd b ON b.id = x.product_id;
  IF v_n <> c_n_gross OR v_m <> c_n_dist THEN
    RAISE EXCEPTION 'Conferir: % grossista e % distribuidor em vez de % e %.', v_n, v_m, c_n_gross, c_n_dist;
  END IF;
  SELECT count(*) INTO v_n FROM product_prices x JOIN _pgd b ON b.id = x.product_id AND b.fonte = 'wc' WHERE x.price_type = 'wholesale';
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: % acessórios ficaram com grossista.', v_n; END IF;

  -- o custo e o PVP (e o que mais havia) ficam intactos
  SELECT count(*) INTO v_n FROM _pgd_antes a
  LEFT JOIN product_prices x ON x.id = a.id
  WHERE x.id IS NULL OR x.price_type IS DISTINCT FROM a.price_type OR x.price IS DISTINCT FROM a.price
     OR x.preco_exato IS DISTINCT FROM a.preco_exato OR x.valid_from IS DISTINCT FROM a.valid_from;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: % preços que já existiam mudaram.', v_n; END IF;

  -- nada escrito fora destes 42 produtos (nem produtos): só as 72 linhas novas têm o xmin desta transação
  v_xid := (txid_current() % 4294967296)::text;
  SELECT count(*) INTO v_n FROM product_prices x WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _pgd b WHERE b.id = x.product_id);
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: % preços escritos fora dos 42 produtos.', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_prices x JOIN _pgd b ON b.id = x.product_id WHERE x.xmin::text = v_xid;
  IF v_n <> c_n_gross + c_n_dist THEN
    RAISE EXCEPTION 'Conferir: % linhas com o xmin desta transação em vez de % (a verificação de «nada fora» não vale).', v_n, c_n_gross + c_n_dist;
  END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id = c_org;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: % produtos da Mudelar foram escritos.', v_n; END IF;

  -- a página, como um membro da Mudelar com services.view: os lava-louças com 12/11, AMBAR 1 CUBA 50 sem nada
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active'
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'Conferir: sem membro da Mudelar com services.view; a página não foi lida aqui (o teste lê-a).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    j := public.cat_ler_produtos_pagina(c_org, 'lava-louças', NULL, NULL, NULL, NULL, false, 200, 1);
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    SELECT count(*) INTO v_n FROM _pgd b
    WHERE b.fonte = 'lava' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(j -> 'produtos') e
      WHERE (e ->> 'id')::uuid = b.id AND (e ->> 'grossista')::numeric = b.grossista AND (e ->> 'distribuidor')::numeric = b.distribuidor);
    IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: a página não devolve grossista/distribuidor certos em % lava-louças.', v_n; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'produtos') e
                   WHERE e ->> 'nome' = 'Lava-louças AMBAR 1 CUBA 50' AND e ? 'grossista' AND e -> 'grossista' = 'null'::jsonb
                     AND e -> 'distribuidor' = 'null'::jsonb) THEN
      RAISE EXCEPTION 'Conferir: a página não devolve grossista e distribuidor null no AMBAR 1 CUBA 50.';
    END IF;
  END IF;

  RAISE NOTICE 'precos_grossista_distribuidor: % produtos da Mudelar (% lava-louças, % acessórios), % grossista e % distribuidor gravados — conferidos.',
    c_total, c_lava, c_wc, c_n_gross, c_n_dist;
END $mig$;

-- ─── 4. Conferir as funções ─────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)',
                                'public.cat_definir_grossista_distribuidor(uuid,numeric,numeric)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.provolatile::text AS vol INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type::text = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % ainda dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon pode executar %.', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: authenticated não pode executar %.', v_sig; END IF;
  END LOOP;
  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = 'public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)'::regprocedure) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = 'public.cat_definir_grossista_distribuidor(uuid,numeric,numeric)'::regprocedure) <> 'v' THEN
    RAISE EXCEPTION 'Conferir: a página tem de ser STABLE e a gravação VOLATILE.';
  END IF;
  RAISE NOTICE 'catalogo_precos_grossista_distribuidor: página com grossista/distribuidor e cat_definir_grossista_distribuidor — conferidas.';
END $c$;
