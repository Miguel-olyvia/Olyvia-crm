-- =============================================================================
-- Catálogo — FAMÍLIAS DE PRODUTOS gravadas na base (estrutura e funções, SEM DADOS).
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Pedido do dono (20/11): «quero que dê para as criar na base de dados, ainda não quero dados».
-- Desenho: vault/ficheiros/produtos-servicos/familias-gravar-na-base.md.
--
-- MIGRATION E CÓDIGO ENTRAM JUNTOS. O ecrã /catalogo/produtos/familias (src/pages/CatalogoFamilias.tsx,
-- src/emylia/familias/familiasDados.ts e usarFamilias.ts) passa a chamar estas funções em vez do armazém em memória.
-- Sem esta migration o ecrã mostra «Ainda não disponível nesta base»; sem o código novo, ninguém chama estas funções.
--
-- O que cria:
--   1. Três tabelas, todas fechadas (RLS ligada, nenhum privilégio para anon nem authenticated, nenhuma política de
--      escrita; uma política de SELECT só como defesa em profundidade, igual à de product_models):
--        product_families         (id, organization_id, name, created_by, created_at, updated_at)
--                                 nome único por organização sem acentos nem maiúsculas (fn_cat_chave_opcao).
--        product_family_axes      (family_id, attribute_id, papel 'cor'|'medida', posicao 1..10)
--                                 no máximo uma cor por família; o mesmo atributo só uma vez.
--        product_family_members   (family_id, product_id, organization_id)
--                                 UM PRODUTO PERTENCE A UMA FAMÍLIA NO MÁXIMO (único por product_id).
--      Guarda-se só o agrupamento: valores, etiquetas, SKU, preço, marca e categoria continuam a derivar-se dos
--      produtos no ecrã (src/emylia/familias/nucleo.ts). Nenhuma coluna de products muda.
--      Cascades: apagar a família apaga eixos e membros; apagar de vez um produto tira-o da família; apagar de vez um
--      atributo tira o eixo. Um produto apagado por soft delete fica na família mas as leituras não o devolvem.
--   2. Cinco funções SECURITY DEFINER (search_path fixo, filtro por organização DENTRO de cada uma):
--        cat_ler_familias(p_org)                         → {familias:[{id,nome,n_produtos,updated_at}]}
--        cat_ler_familia(p_org, p_id)                    → {familia:{id,nome,updated_at,eixos:[…]}, ve_valores, produtos:[…]}
--            As linhas dos produtos têm as MESMAS colunas e a MESMA MÁSCARA de custo, PVP, grossista, distribuidor e
--            fornecedor que cat_ler_produtos_pagina (versão de 20270120900000, md5 conferido na guarda): sem
--            services.view, as leituras de preço e de fornecedor das tabelas de preços ficam vazias (WHERE v_valores AND …).
--            O campo «fornecedor» pode ainda cair para products.fornecedor_livre, que já é legível na tabela products
--            e que cat_ler_produtos_pagina também devolve: não é uma fuga nova.
--        cat_familias_dos_produtos(p_org, p_produtos)    → {produtos:[{produto_id,familia_id,nome}]} (até 60 ids)
--        cat_guardar_familia(p_org, p_id, p_nome, p_eixos, p_produtos, p_versao) — cria (p_id NULL) ou substitui
--            nome, eixos e membros numa só transação. p_eixos = [{attribute_id, papel}] pela ordem (posição = ordem).
--        cat_apagar_familia(p_org, p_id) — apaga a família (os produtos ficam como estão).
--      Leitura: products.edit ou services.view. Escrita: products.edit.
--      Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado; CT004 repetido / noutra família /
--      alterada por outra pessoa (concorrência otimista: p_versao tem de ser o updated_at lido).
--      Tetos: 200 caracteres no nome, 1 a 60 produtos, até 10 eixos, 2000 famílias por organização.
--      Lock: pg_advisory_xact_lock('cat_familias:'||org) em todas as escritas.
--   3. Nenhum INSERT de dados. O bloco final confere que as três tabelas estão vazias.
--
-- Impacto: só funções e tabelas novas. Nenhuma função, tabela ou ecrã existente muda.
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente (a 20/11 havia 31 migrations locais
-- por aplicar no remoto, de outro trabalho). Aplicar esta sozinha (cópia limpa) e conferir com --dry-run.
-- =============================================================================

SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text; v_src text; v_txt text; v_n bigint;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])',
                    'public.fn_cat_pode(uuid,text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_chave_opcao(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_medida_texto(jsonb)', 'public.current_business_user_id()',
                    'public.get_user_visible_org_ids(uuid)', 'public.is_system_admin_user(uuid)',
                    'public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções (%): esta migration assenta no Catálogo de 20270120900000.', v_falta;
  END IF;

  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.products', 'public.product_attributes', 'public.product_attribute_values',
                    'public.attribute_option_group_values', 'public.product_prices', 'public.item_suppliers',
                    'public.suppliers', 'public.brands', 'public.product_categories', 'public.product_models',
                    'public.uom', 'public.anew_organizations', 'public.anew_users']) s
  WHERE to_regclass(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Faltam tabelas (%): rever esta migration.', v_falta; END IF;

  -- as colunas que as funções leem
  SELECT count(*) INTO v_n FROM information_schema.columns ic
  WHERE ic.table_schema = 'public'
    AND ((ic.table_name = 'products' AND ic.column_name::text IN ('id', 'organization_id', 'is_deleted', 'tipo_catalogo', 'name'))
      OR (ic.table_name = 'product_attributes' AND ic.column_name::text IN ('id', 'organization_id', 'deleted_at')));
  IF v_n <> 8 THEN RAISE EXCEPTION 'products ou product_attributes não têm as colunas esperadas: rever esta migration.'; END IF;

  -- a máscara de custo e PVP é copiada de cat_ler_produtos_pagina tal como está aplicada (md5 lido na RH a 20/11).
  -- Se a função mudou, a cópia em cat_ler_familia tem de ser revista antes de aplicar.
  v_src := (SELECT pr.prosrc FROM pg_proc pr
            WHERE pr.oid = to_regprocedure('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)')::oid);
  IF md5(v_src) <> 'bad8ab2033ba91c08f8921c80b11468f' THEN
    RAISE EXCEPTION 'cat_ler_produtos_pagina mudou (md5 %): rever a máscara de custo e PVP de cat_ler_familia.', md5(v_src);
  END IF;

  -- as tabelas, se já existirem (reaplicação), têm de ser estas
  IF to_regclass('public.product_families') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = 'product_families'
      AND ic.column_name::text IN ('id', 'organization_id', 'name', 'created_by', 'created_at', 'updated_at');
    IF v_n <> 6 THEN RAISE EXCEPTION 'Já existe uma tabela product_families diferente: rever esta migration.'; END IF;
  END IF;
  IF to_regclass('public.product_family_axes') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = 'product_family_axes'
      AND ic.column_name::text IN ('family_id', 'attribute_id', 'papel', 'posicao');
    IF v_n <> 4 THEN RAISE EXCEPTION 'Já existe uma tabela product_family_axes diferente: rever esta migration.'; END IF;
  END IF;
  IF to_regclass('public.product_family_members') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = 'product_family_members'
      AND ic.column_name::text IN ('family_id', 'product_id', 'organization_id');
    IF v_n <> 3 THEN RAISE EXCEPTION 'Já existe uma tabela product_family_members diferente: rever esta migration.'; END IF;
  END IF;

  -- nenhuma outra versão (outra assinatura) das funções novas
  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'cat_ler_familias' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_ler_familia' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid')
      OR (p.proname = 'cat_familias_dos_produtos' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_produtos uuid[]')
      OR (p.proname = 'cat_guardar_familia' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_nome text, p_eixos jsonb, p_produtos uuid[], p_versao timestamp with time zone')
      OR (p.proname = 'cat_apagar_familia' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. As tabelas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.anew_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_families_name_check CHECK (name <> '' AND char_length(name) <= 200),
  -- alvo da FK composta dos membros: o membro é sempre da organização da família
  CONSTRAINT product_families_id_org_key UNIQUE (id, organization_id)
);
-- o nome não se repete na organização, sem contar acentos nem maiúsculas
CREATE UNIQUE INDEX IF NOT EXISTS product_families_nome_key
  ON public.product_families (organization_id, public.fn_cat_chave_opcao(name));

CREATE TABLE IF NOT EXISTS public.product_family_axes (
  family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
  papel text NOT NULL,
  posicao smallint NOT NULL,
  CONSTRAINT product_family_axes_pkey PRIMARY KEY (family_id, attribute_id),
  CONSTRAINT product_family_axes_papel_check CHECK (papel IN ('cor', 'medida')),
  CONSTRAINT product_family_axes_posicao_check CHECK (posicao BETWEEN 1 AND 10)
);
-- no máximo uma cor por família
CREATE UNIQUE INDEX IF NOT EXISTS product_family_axes_uma_cor_key
  ON public.product_family_axes (family_id) WHERE papel = 'cor';
CREATE INDEX IF NOT EXISTS product_family_axes_attribute_idx ON public.product_family_axes (attribute_id);

CREATE TABLE IF NOT EXISTS public.product_family_members (
  family_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  CONSTRAINT product_family_members_pkey PRIMARY KEY (family_id, product_id),
  CONSTRAINT product_family_members_family_fkey FOREIGN KEY (family_id, organization_id)
    REFERENCES public.product_families (id, organization_id) ON DELETE CASCADE
);
-- um produto pertence a uma família no máximo
CREATE UNIQUE INDEX IF NOT EXISTS product_family_members_produto_key ON public.product_family_members (product_id);
CREATE INDEX IF NOT EXISTS product_family_members_org_produto_idx ON public.product_family_members (organization_id, product_id);

COMMENT ON TABLE public.product_families IS
  'Catálogo (20270125100000): famílias de produtos (agrupamentos de produtos que só mudam nos atributos). Fechada: escritas e leituras só por cat_*familia*.';
COMMENT ON TABLE public.product_family_axes IS
  'Catálogo (20270125100000): os eixos de uma família (o atributo da cor, no máximo um, e os da medida, pela posição).';
COMMENT ON TABLE public.product_family_members IS
  'Catálogo (20270125100000): os produtos de uma família. Um produto pertence a uma família no máximo.';

-- RLS: fechada. Sem privilégios de tabela para anon nem authenticated e sem políticas de escrita; a política de SELECT
-- (igual à de product_models) é só defesa em profundidade. Tudo passa pelas funções abaixo.
ALTER TABLE public.product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_family_axes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_families_select ON public.product_families;
CREATE POLICY product_families_select ON public.product_families FOR SELECT TO authenticated
  USING (public.is_system_admin_user((SELECT auth.uid()))
         OR organization_id IN (SELECT v.o FROM public.get_user_visible_org_ids((SELECT auth.uid())) AS v(o)
                                WHERE public.fn_cat_pode(v.o, 'services.view') OR public.fn_cat_pode(v.o, 'products.edit')));
DROP POLICY IF EXISTS product_family_members_select ON public.product_family_members;
CREATE POLICY product_family_members_select ON public.product_family_members FOR SELECT TO authenticated
  USING (public.is_system_admin_user((SELECT auth.uid()))
         OR organization_id IN (SELECT v.o FROM public.get_user_visible_org_ids((SELECT auth.uid())) AS v(o)
                                WHERE public.fn_cat_pode(v.o, 'services.view') OR public.fn_cat_pode(v.o, 'products.edit')));
-- os eixos não têm organização: vê-os quem vê a família (a subconsulta passa pela política de product_families)
DROP POLICY IF EXISTS product_family_axes_select ON public.product_family_axes;
CREATE POLICY product_family_axes_select ON public.product_family_axes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_families f WHERE f.id = family_id));

REVOKE ALL ON public.product_families FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_family_axes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_family_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_families, public.product_family_axes, public.product_family_members TO service_role;

-- ─── 2. Ler a lista ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_familias(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN jsonb_build_object('familias', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.name, 'n_produtos', coalesce(c.n, 0), 'updated_at', f.updated_at)
                     ORDER BY f.name, f.id)
    FROM product_families f
    LEFT JOIN (SELECT m.family_id, count(*)::integer AS n
               FROM product_family_members m
               JOIN products p ON p.id = m.product_id AND p.organization_id = p_org AND NOT p.is_deleted
                              AND p.tipo_catalogo = 'produto'
               WHERE m.organization_id = p_org
               GROUP BY m.family_id) c ON c.family_id = f.id
    WHERE f.organization_id = p_org), '[]'::jsonb));
END $$;

-- ─── 3. Ler uma família (para a reabrir) ────────────────────────────────────────
-- As linhas dos produtos são as de cat_ler_produtos_pagina (20270120900000), com a mesma máscara: v_valores
-- (services.view) corta custo, PVP, grossista, distribuidor e fornecedor. Só os produtos vivos da organização.
CREATE OR REPLACE FUNCTION public.cat_ler_familia(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_valores boolean;
  v_familia jsonb;
  v_produtos jsonb;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  SELECT jsonb_build_object(
           'id', f.id, 'nome', f.name, 'updated_at', f.updated_at,
           'eixos', coalesce((SELECT jsonb_agg(jsonb_build_object('attribute_id', x.attribute_id, 'papel', x.papel, 'posicao', x.posicao)
                                               ORDER BY x.posicao, x.attribute_id)
                              FROM product_family_axes x
                              JOIN product_attributes pa ON pa.id = x.attribute_id AND pa.organization_id = p_org AND pa.deleted_at IS NULL
                              WHERE x.family_id = f.id), '[]'::jsonb))
    INTO v_familia
  FROM product_families f
  WHERE f.id = p_id AND f.organization_id = p_org;
  IF v_familia IS NULL THEN RAISE EXCEPTION 'Família não encontrada.' USING ERRCODE = 'CT003'; END IF;

  -- preços e fornecedores: só com services.view (o corte de cat_ler_produtos_pagina)
  v_valores := public.fn_cat_pode(p_org, 'services.view');

  WITH atr AS (
    SELECT a.id, a.label, a.is_measurement, coalesce(a.sort_order, 0) AS ordem,
           CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
    FROM product_attributes a
    WHERE a.organization_id = p_org AND a.deleted_at IS NULL
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
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
           'estado', p.status::text,
           'imagem', (SELECT x.u::text FROM unnest(p.image_urls) WITH ORDINALITY AS x(u, o)
                      WHERE coalesce(x.u::text, '') <> '' ORDER BY x.o LIMIT 1),
           'atributos_resumo', ra.resumo)
         ORDER BY p.name, p.id), '[]'::jsonb)
    INTO v_produtos
  FROM product_family_members m
  JOIN products p ON p.id = m.product_id
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
    WHERE coalesce(x.txt, '') <> '') ra ON true
  WHERE m.family_id = p_id AND m.organization_id = p_org
    AND p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted;

  RETURN jsonb_build_object('familia', v_familia, 've_valores', v_valores, 'produtos', v_produtos);
END $$;

-- ─── 4. Em que família está cada produto (a marca «já está noutra família») ─────
CREATE OR REPLACE FUNCTION public.cat_familias_dos_produtos(p_org uuid, p_produtos uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_max_ids constant integer := 60;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF coalesce(cardinality(p_produtos), 0) > c_max_ids THEN
    RAISE EXCEPTION 'Peça no máximo 60 produtos de cada vez.' USING ERRCODE = 'CT002';
  END IF;
  RETURN jsonb_build_object('produtos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('produto_id', m.product_id, 'familia_id', f.id, 'nome', f.name) ORDER BY m.product_id)
    FROM product_family_members m
    JOIN product_families f ON f.id = m.family_id AND f.organization_id = p_org
    WHERE m.organization_id = p_org AND m.product_id = ANY (coalesce(p_produtos, '{}'::uuid[]))), '[]'::jsonb));
END $$;

-- ─── 5. Criar ou editar uma família ─────────────────────────────────────────────
-- p_id NULL: cria. Senão substitui nome, eixos e membros, se p_versao for o updated_at atual (senão CT004).
-- p_eixos: [{"attribute_id": uuid, "papel": "cor"|"medida"}, …] pela ordem; a posição é a ordem (1…).
-- A validação das combinações repetidas e das variantes sem valor fica no ecrã (o núcleo); a base garante a integridade.
CREATE OR REPLACE FUNCTION public.cat_guardar_familia(p_org uuid, p_id uuid, p_nome text, p_eixos jsonb, p_produtos uuid[], p_versao timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 200;
  c_max_produtos constant integer := 60;
  c_max_eixos constant integer := 10;
  c_max_familias constant integer := 2000;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_eixos jsonb := coalesce(p_eixos, '[]'::jsonb);
  v_nome text; v_np integer; v_n integer; v_id uuid; v_versao timestamptz; v_ex uuid; v_criador uuid;
  v_outra text; v_produto text;
BEGIN
  -- o nome
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome da família é demasiado longo.' USING ERRCODE = 'CT002'; END IF;
  v_nome := public.fn_cat_limpar_nome(p_nome);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da família.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da família tem no máximo 200 caracteres.' USING ERRCODE = 'CT002'; END IF;

  -- os produtos: 1 a 60, sem vazios nem repetidos
  v_np := coalesce(cardinality(p_produtos), 0);
  IF v_np < 1 THEN RAISE EXCEPTION 'Escolha pelo menos um produto.' USING ERRCODE = 'CT002'; END IF;
  IF v_np > c_max_produtos THEN RAISE EXCEPTION 'Uma família tem no máximo 60 produtos.' USING ERRCODE = 'CT002'; END IF;
  IF array_position(p_produtos, NULL) IS NOT NULL THEN RAISE EXCEPTION 'Há um produto vazio na lista.' USING ERRCODE = 'CT002'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_produtos) x) <> v_np THEN
    RAISE EXCEPTION 'Um produto está repetido na família.' USING ERRCODE = 'CT002';
  END IF;

  -- os eixos: até 10, cada um {attribute_id (uuid), papel cor|medida}; uma cor no máximo; o mesmo atributo uma vez só
  IF jsonb_typeof(v_eixos) <> 'array' THEN RAISE EXCEPTION 'Os eixos da família não são válidos.' USING ERRCODE = 'CT002'; END IF;
  IF jsonb_array_length(v_eixos) > c_max_eixos THEN RAISE EXCEPTION 'Uma família tem no máximo 10 atributos.' USING ERRCODE = 'CT002'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_eixos) e
             WHERE jsonb_typeof(e) <> 'object'
                OR coalesce(jsonb_typeof(e -> 'attribute_id'), '') <> 'string'
                OR coalesce(e ->> 'attribute_id', '') !~ c_uuid
                OR coalesce(e ->> 'papel', '') NOT IN ('cor', 'medida')) THEN
    RAISE EXCEPTION 'Os eixos da família não são válidos.' USING ERRCODE = 'CT002';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_eixos) e WHERE e ->> 'papel' = 'cor') > 1 THEN
    RAISE EXCEPTION 'Uma família tem no máximo um atributo de cor.' USING ERRCODE = 'CT002';
  END IF;
  IF (SELECT count(DISTINCT (e ->> 'attribute_id')::uuid) FROM jsonb_array_elements(v_eixos) e) <> jsonb_array_length(v_eixos) THEN
    RAISE EXCEPTION 'O mesmo atributo não pode ser usado duas vezes (nem como cor e como medida).' USING ERRCODE = 'CT002';
  END IF;
  -- atributos visíveis para a organização (a regra de cat_ler_atributos_definicoes)
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_eixos) e
             WHERE NOT EXISTS (SELECT 1 FROM product_attributes a
                               WHERE a.id = (e ->> 'attribute_id')::uuid AND a.organization_id = p_org AND a.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Um dos atributos não existe nesta organização.' USING ERRCODE = 'CT003';
  END IF;

  -- uma escrita de cada vez por organização (nome, membros e teto)
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || p_org::text, 0));

  IF p_id IS NOT NULL THEN
    SELECT f.updated_at INTO v_versao FROM product_families f
    WHERE f.id = p_id AND f.organization_id = p_org
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Família não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF p_versao IS NULL OR p_versao IS DISTINCT FROM v_versao THEN
      RAISE EXCEPTION 'A família foi alterada por outra pessoa: reabra-a.' USING ERRCODE = 'CT004';
    END IF;
  ELSE
    SELECT count(*)::integer INTO v_n FROM product_families f WHERE f.organization_id = p_org;
    IF v_n >= c_max_familias THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de famílias (2000).' USING ERRCODE = 'CT002';
    END IF;
    SELECT u.id INTO v_criador FROM anew_users u WHERE u.id = v_user;
    IF v_criador IS NULL THEN RAISE EXCEPTION 'Sem utilizador identificado para criar a família.' USING ERRCODE = 'CT001'; END IF;
  END IF;

  -- os produtos são desta organização e estão vivos
  IF EXISTS (SELECT 1 FROM unnest(p_produtos) x
             WHERE NOT EXISTS (SELECT 1 FROM products p
                               WHERE p.id = x AND p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted)) THEN
    RAISE EXCEPTION 'Um dos produtos não existe nesta organização ou foi apagado.' USING ERRCODE = 'CT003';
  END IF;
  -- nenhum está noutra família
  SELECT f.name, p.name INTO v_outra, v_produto
  FROM product_family_members m
  JOIN product_families f ON f.id = m.family_id AND f.organization_id = p_org
  JOIN products p ON p.id = m.product_id
  WHERE m.organization_id = p_org AND m.product_id = ANY (p_produtos) AND m.family_id IS DISTINCT FROM p_id
  ORDER BY f.name, f.id, p.name, p.id
  LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION 'O produto «%» já está na família «%».', v_produto, v_outra USING ERRCODE = 'CT004', DETAIL = v_outra;
  END IF;
  -- o nome não se repete na organização (sem acentos nem maiúsculas)
  SELECT f.id INTO v_ex FROM product_families f
  WHERE f.organization_id = p_org AND f.id IS DISTINCT FROM p_id
    AND public.fn_cat_chave_opcao(f.name) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY f.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma família com este nome.' USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO product_families (organization_id, name, created_by)
    VALUES (p_org, v_nome, v_criador)
    RETURNING id, updated_at INTO v_id, v_versao;
  ELSE
    v_id := p_id;
    UPDATE product_families SET name = v_nome, updated_at = clock_timestamp()
    WHERE id = p_id AND organization_id = p_org
    RETURNING updated_at INTO v_versao;
    DELETE FROM product_family_axes WHERE family_id = p_id;
    DELETE FROM product_family_members WHERE family_id = p_id AND organization_id = p_org;
  END IF;

  INSERT INTO product_family_axes (family_id, attribute_id, papel, posicao)
  SELECT v_id, (t.e ->> 'attribute_id')::uuid, t.e ->> 'papel', t.o::smallint
  FROM jsonb_array_elements(v_eixos) WITH ORDINALITY AS t(e, o);
  INSERT INTO product_family_members (family_id, product_id, organization_id)
  SELECT v_id, x, p_org FROM unnest(p_produtos) x;

  RETURN jsonb_build_object('familia', jsonb_build_object('id', v_id, 'nome', v_nome, 'updated_at', v_versao));
END $$;

-- ─── 6. Apagar uma família ──────────────────────────────────────────────────────
-- Apaga de vez a família, os eixos e os membros (cascade). Os produtos ficam como estão.
CREATE OR REPLACE FUNCTION public.cat_apagar_familia(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'products.edit');
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || p_org::text, 0));
  DELETE FROM product_families f WHERE f.id = p_id AND f.organization_id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Família não encontrada.' USING ERRCODE = 'CT003'; END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- ─── 7. Permissões das funções: só authenticated (e service_role) ───────────────
REVOKE ALL ON FUNCTION public.cat_ler_familias(uuid), public.cat_ler_familia(uuid,uuid),
  public.cat_familias_dos_produtos(uuid,uuid[]), public.cat_guardar_familia(uuid,uuid,text,jsonb,uuid[],timestamptz),
  public.cat_apagar_familia(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_familias(uuid), public.cat_ler_familia(uuid,uuid),
  public.cat_familias_dos_produtos(uuid,uuid[]), public.cat_guardar_familia(uuid,uuid,text,jsonb,uuid[],timestamptz),
  public.cat_apagar_familia(uuid,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cat_ler_familias(uuid) IS
  'Catálogo (20270125100000): as famílias da organização com o nº de produtos vivos. products.edit ou services.view.';
COMMENT ON FUNCTION public.cat_ler_familia(uuid,uuid) IS
  'Catálogo (20270125100000): uma família (eixos e produtos vivos, com a máscara de custo e PVP de cat_ler_produtos_pagina). products.edit ou services.view.';
COMMENT ON FUNCTION public.cat_familias_dos_produtos(uuid,uuid[]) IS
  'Catálogo (20270125100000): a família de cada produto pedido (até 60). products.edit ou services.view.';
COMMENT ON FUNCTION public.cat_guardar_familia(uuid,uuid,text,jsonb,uuid[],timestamptz) IS
  'Catálogo (20270125100000): cria ou substitui uma família (nome, eixos, membros). Concorrência otimista por p_versao. products.edit.';
COMMENT ON FUNCTION public.cat_apagar_familia(uuid,uuid) IS
  'Catálogo (20270125100000): apaga uma família (os produtos ficam). products.edit.';

-- ─── 8. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  v_t text; v_f text; v_src text; v_n bigint;
  v_tabelas text[] := ARRAY['public.product_families', 'public.product_family_axes', 'public.product_family_members'];
  v_funcoes text[] := ARRAY['public.cat_ler_familias(uuid)', 'public.cat_ler_familia(uuid,uuid)',
                            'public.cat_familias_dos_produtos(uuid,uuid[])',
                            'public.cat_guardar_familia(uuid,uuid,text,jsonb,uuid[],timestamp with time zone)',
                            'public.cat_apagar_familia(uuid,uuid)'];
  c_mascara constant text := 'WHERE v_valores AND';
BEGIN
  FOREACH v_t IN ARRAY v_tabelas LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass(v_t)) THEN
      RAISE EXCEPTION 'Conferir: % não tem RLS ligada.', v_t;
    END IF;
    -- só a política de SELECT; nenhuma de escrita
    IF (SELECT count(*) FROM pg_policy pl WHERE pl.polrelid = to_regclass(v_t)) <> 1
       OR EXISTS (SELECT 1 FROM pg_policy pl WHERE pl.polrelid = to_regclass(v_t) AND pl.polcmd::text <> 'r') THEN
      RAISE EXCEPTION 'Conferir: % tem políticas além da de SELECT.', v_t;
    END IF;
    -- nenhum privilégio de tabela nem de coluna para anon e authenticated (as 4 operações fechadas)
    IF has_table_privilege('authenticated', v_t, 'SELECT') OR has_table_privilege('authenticated', v_t, 'INSERT')
       OR has_table_privilege('authenticated', v_t, 'UPDATE') OR has_table_privilege('authenticated', v_t, 'DELETE')
       OR has_table_privilege('authenticated', v_t, 'TRUNCATE') OR has_table_privilege('authenticated', v_t, 'REFERENCES')
       OR has_table_privilege('authenticated', v_t, 'TRIGGER')
       OR has_table_privilege('anon', v_t, 'SELECT') OR has_table_privilege('anon', v_t, 'INSERT')
       OR has_table_privilege('anon', v_t, 'UPDATE') OR has_table_privilege('anon', v_t, 'DELETE')
       OR has_table_privilege('anon', v_t, 'TRUNCATE') OR has_table_privilege('anon', v_t, 'REFERENCES')
       OR has_table_privilege('anon', v_t, 'TRIGGER')
       OR has_any_column_privilege('authenticated', v_t, 'SELECT, INSERT, UPDATE, REFERENCES')
       OR has_any_column_privilege('anon', v_t, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION 'Conferir: % dá privilégios a anon ou authenticated.', v_t;
    END IF;
  END LOOP;

  -- SEM DADOS: nenhuma linha em nenhuma das três tabelas
  SELECT (SELECT count(*) FROM public.product_families) + (SELECT count(*) FROM public.product_family_axes)
       + (SELECT count(*) FROM public.product_family_members) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: as tabelas das famílias têm % linhas (a migration é sem dados).', v_n; END IF;

  -- os índices únicos (nome, uma cor, um produto numa só família)
  IF (SELECT count(*) FROM pg_index i WHERE i.indisunique AND i.indisvalid
        AND ((i.indexrelid = to_regclass('public.product_families_nome_key') AND i.indpred IS NULL)
          OR (i.indexrelid = to_regclass('public.product_family_axes_uma_cor_key') AND i.indpred IS NOT NULL)
          OR (i.indexrelid = to_regclass('public.product_family_members_produto_key') AND i.indpred IS NULL))) <> 3 THEN
    RAISE EXCEPTION 'Conferir: faltam índices únicos das famílias.';
  END IF;
  IF to_regclass('public.product_family_members_org_produto_idx') IS NULL THEN
    RAISE EXCEPTION 'Conferir: falta o índice (organization_id, product_id) dos membros.';
  END IF;

  -- as funções: SECURITY DEFINER, search_path fixo, EXECUTE só para authenticated (nem anon nem PUBLIC)
  FOREACH v_f IN ARRAY v_funcoes LOOP
    IF to_regprocedure(v_f) IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_f; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_f)::oid AND p.prosecdef
                   AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
    IF has_function_privilege('anon', v_f, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_f, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = to_regprocedure(v_f)::oid AND a.grantee = 0) THEN
      RAISE EXCEPTION 'Conferir: EXECUTE de % não é só para authenticated.', v_f;
    END IF;
  END LOOP;

  -- a máscara de custo e PVP: as quatro leituras de preço/fornecedor cortadas por v_valores, como na página
  v_src := (SELECT p.prosrc FROM pg_proc p WHERE p.oid = to_regprocedure('public.cat_ler_familia(uuid,uuid)')::oid);
  IF position('v_valores := public.fn_cat_pode(p_org, ''services.view'');' IN v_src) = 0
     OR (length(v_src) - length(replace(v_src, c_mascara, ''))) / length(c_mascara) <> 4 THEN
    RAISE EXCEPTION 'Conferir: a máscara de custo e PVP de cat_ler_familia não é a de cat_ler_produtos_pagina.';
  END IF;
  v_src := (SELECT p.prosrc FROM pg_proc p
            WHERE p.oid = to_regprocedure('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)')::oid);
  IF (length(v_src) - length(replace(v_src, c_mascara, ''))) / length(c_mascara) <> 4 THEN
    RAISE EXCEPTION 'Conferir: cat_ler_produtos_pagina já não tem as quatro leituras cortadas por v_valores.';
  END IF;

  -- os tetos e o lock estão no corpo (âncoras)
  IF (SELECT p.prosrc FROM pg_proc p WHERE p.oid = to_regprocedure('public.cat_guardar_familia(uuid,uuid,text,jsonb,uuid[],timestamp with time zone)')::oid)
       NOT LIKE '%c_max_nome constant integer := 200;%c_max_produtos constant integer := 60;%c_max_eixos constant integer := 10;%c_max_familias constant integer := 2000;%pg_advisory_xact_lock%FOR UPDATE%' THEN
    RAISE EXCEPTION 'Conferir: falta um dos tetos (200, 60, 10, 2000), o lock ou o FOR UPDATE em cat_guardar_familia.';
  END IF;

  RAISE NOTICE 'catalogo_familias: 3 tabelas fechadas (RLS, sem privilégios, sem políticas de escrita, vazias) e 5 funções — conferidas.';
END $c$;

RESET lock_timeout;
