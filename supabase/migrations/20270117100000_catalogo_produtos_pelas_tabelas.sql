-- 13/11/2026: os produtos do Catálogo passam a ler e gravar a marca, a unidade e a categoria pelas tabelas de referência.
-- Pedido do Miguel: para importar produtos de outra base sem os escrever à mão, a marca tem de vir de brands (products.brand_id),
-- a unidade de uom (products.uom_id) e a categoria da árvore dos produtos, product_categories (products.category_id e
-- products.subcategory_id). Até aqui o Catálogo usava o texto products.marca_livre, o texto products.unidade e
-- products.catalogo_categoria_id, que aponta para a árvore dos serviços (service_categories).
--
-- O que faz (nada se apaga: marca_livre, unidade e catalogo_categoria_id ficam, sempre acertadas com as colunas novas):
--   1. services.exige_categoria_produto_id: o ramo da árvore dos produtos de onde o serviço obriga a escolher um produto
--      (a regra «exige produto» do motor). A coluna antiga exige_produto_categoria_id (árvore dos serviços) fica.
--   2. negocio_produtos.categoria_id e quote_versao_produtos.categoria_id deixam de ter chave para service_categories: guardam o
--      ramo do produto, que agora pode ser uma categoria de produto. As colunas ficam.
--   3. Funções de apoio: encontrar ou criar a marca, a unidade e a categoria de produto pelo nome (fn_cat_marca, fn_cat_unidade,
--      fn_cat_categoria_produto) e acertar o ramo da árvore dos serviços com o mesmo nome (fn_cat_ramo_servico).
--   4. Gatilho em products (trg_cat_produto_tabelas), só nos produtos do Catálogo (tipo_catalogo preenchido):
--        ids → textos: quem grava brand_id, uom_id, category_id ou subcategory_id (a importação do Miguel) fica com
--          marca_livre, unidade e catalogo_categoria_id acertados;
--        textos → ids: quem ainda grava o texto (versões antigas da app, o portal do fornecedor) fica com os ids acertados.
--      Quando os dois mudam na mesma gravação, ganham os ids.
--   5. cat_ler_produtos_tabelas(p_org): a marca, a unidade e a categoria de cada produto pelas tabelas, a árvore dos produtos,
--      as marcas e as unidades da organização e a regra «exige produto» pela árvore dos produtos. Mesmas permissões e mesmo corte
--      de cat_ler_catalogo (20270113100000). A app chama-a ao lado de cat_ler_catalogo; sem ela (SQL por colar), lê como antes.
--   6. cat_guardar_produto_tabelas e cat_guardar_servico_exige: a app grava por aqui a marca, a unidade e a categoria do produto
--      e o ramo exigido pelo serviço (pelo nome; criam a marca, a unidade ou a categoria que falte).
--   7. Preenche os ids dos produtos e serviços que hoje só têm o texto (marca_livre, unidade, catalogo_categoria_id,
--      exige_produto_categoria_id), pelo nome. Cria a marca, a unidade ou a categoria de produto que falte. Não mexe nos ids que
--      já estão preenchidos.
--
-- A unidade só se preenche quando é segura: um produto com ligações a fornecedores noutra unidade (item_suppliers.uom_id) fica
-- sem uom_id, porque fn_uom_units_per passava a dar «Unidade incompatível» nas encomendas desse produto.
--
-- Idempotente: pode correr-se mais de uma vez. No fim mostra (NOTICE) quantos produtos e serviços ficaram preenchidos.

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $g$
BEGIN
  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL OR to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_neg_so_execucao(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Faltam fn_cat_exigir, fn_cat_pode ou fn_neg_so_execucao: aplicar antes as migrações do Catálogo e das permissões.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'deleted_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_categories' AND column_name = 'deleted_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'marca_livre')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_suppliers' AND column_name = 'deleted_at') THEN
    RAISE EXCEPTION 'Faltam colunas esperadas (brands.deleted_at, product_categories.deleted_at, products.marca_livre ou item_suppliers.deleted_at).';
  END IF;
END $g$;

-- ─── 1. O ramo exigido pelo serviço, na árvore dos produtos ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS exige_categoria_produto_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.services.exige_categoria_produto_id IS
  'Catálogo (20270117100000): o ramo da árvore dos produtos (product_categories) de onde o serviço obriga a escolher um produto. Substitui exige_produto_categoria_id (árvore dos serviços), que fica acertada quando o ramo existe com o mesmo nome.';

-- ─── 2. O ramo do produto nos negócios e nas versões: sem chave para service_categories ─────────────────────────────────────────────
DO $fk$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, t.relname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace s ON s.oid = t.relnamespace
    WHERE s.nspname = 'public' AND t.relname IN ('negocio_produtos', 'quote_versao_produtos') AND c.contype = 'f'
      AND c.confrelid = 'public.service_categories'::regclass
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'categoria_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
  END LOOP;
END $fk$;

-- ─── 3. Funções de apoio ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O nome para comparar: sem espaços a mais e em minúsculas.
CREATE OR REPLACE FUNCTION public.fn_cat_nome(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

-- O slug: sem acentos, só letras, números e hífenes.
CREATE OR REPLACE FUNCTION public.fn_cat_slug(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(btrim(regexp_replace(translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ²³', 'aaaaaeeeeiiiiooooouuuucn23'),
    '[^a-z0-9]+', '-', 'g'), '-'), ''), 'x')
$$;

-- A marca pelo nome (da organização ou global); cria-a na organização se não houver. Nome vazio: NULL.
CREATE OR REPLACE FUNCTION public.fn_cat_marca(p_org uuid, p_nome text, p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'); v_id uuid;
BEGIN
  IF v_nome = '' THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM brands
  WHERE (organization_id = p_org OR organization_id IS NULL) AND deleted_at IS NULL AND public.fn_cat_nome(name) = public.fn_cat_nome(v_nome)
  ORDER BY (organization_id IS NULL), created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO brands (name, slug, created_by, organization_id, is_active)
    VALUES (v_nome, public.fn_cat_slug(v_nome) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), p_user, p_org, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- A unidade pelo código (global ou da organização); cria-a na organização se não houver. Código vazio: NULL.
-- Uma embalagem (base_uom_id preenchido) não pode ser a unidade de um produto: dá erro CT002.
CREATE OR REPLACE FUNCTION public.fn_cat_unidade(p_org uuid, p_codigo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cod text := btrim(coalesce(p_codigo, '')); v_id uuid; v_base uuid;
BEGIN
  IF v_cod = '' THEN RETURN NULL; END IF;
  SELECT id, base_uom_id INTO v_id, v_base FROM uom
  WHERE (organization_id IS NULL OR organization_id = p_org) AND lower(btrim(code)) = lower(v_cod)
  ORDER BY (organization_id IS NULL) DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO uom (code, description, organization_id, is_active) VALUES (v_cod, v_cod, p_org, true) RETURNING id INTO v_id;
  ELSIF v_base IS NOT NULL THEN
    RAISE EXCEPTION 'A unidade «%» é uma embalagem: a unidade do produto tem de ser uma unidade base.', v_cod USING ERRCODE = 'CT002';
  END IF;
  RETURN v_id;
END $$;

-- A unidade pode ser a do produto sem estragar as ligações a fornecedores (fn_uom_units_per): nenhuma ligação ativa noutra
-- unidade que não seja esta nem uma embalagem dela.
CREATE OR REPLACE FUNCTION public.fn_cat_unidade_segura(p_produto uuid, p_uom uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uom IS NULL OR NOT EXISTS (
    SELECT 1 FROM item_suppliers i LEFT JOIN uom u ON u.id = i.uom_id
    WHERE i.product_id = p_produto AND i.deleted_at IS NULL AND i.uom_id IS NOT NULL AND i.uom_id <> p_uom
      AND u.base_uom_id IS DISTINCT FROM p_uom)
$$;

-- A categoria de produto pelo nome, debaixo de p_pai (NULL = de topo), da organização (ou ligada a ela); cria-a se não houver.
CREATE OR REPLACE FUNCTION public.fn_cat_categoria_produto(p_org uuid, p_nome text, p_pai uuid, p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'); v_id uuid; v_slug text; v_pai text;
BEGIN
  IF v_nome = '' THEN RETURN NULL; END IF;
  SELECT c.id INTO v_id FROM product_categories c
  WHERE c.deleted_at IS NULL AND c.parent_id IS NOT DISTINCT FROM p_pai AND public.fn_cat_nome(c.name) = public.fn_cat_nome(v_nome)
    AND (c.organization_id = p_org OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))
  ORDER BY (c.organization_id IS DISTINCT FROM p_org), c.created_at LIMIT 1;
  IF v_id IS NULL THEN
    v_slug := public.fn_cat_slug(v_nome);
    IF p_pai IS NOT NULL THEN SELECT lower(name) INTO v_pai FROM product_categories WHERE id = p_pai; END IF;
    INSERT INTO product_categories (name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
    VALUES (v_nome, v_slug, CASE WHEN v_pai IS NULL THEN v_slug ELSE v_pai || '/' || v_slug END, p_pai,
      coalesce((SELECT max(sort_order) + 1 FROM product_categories WHERE parent_id IS NOT DISTINCT FROM p_pai AND organization_id = p_org), 0),
      true, p_user, p_org)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- Os nomes do ramo (categoria de topo e sub) de uma categoria de produto ou de um ramo da árvore dos serviços.
CREATE OR REPLACE FUNCTION public.fn_cat_caminho_produto(p_id uuid, OUT cat text, OUT sub text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN c.parent_id IS NULL THEN c.name ELSE p.name END, CASE WHEN c.parent_id IS NULL THEN NULL ELSE c.name END
  FROM product_categories c LEFT JOIN product_categories p ON p.id = c.parent_id WHERE c.id = p_id
$$;
CREATE OR REPLACE FUNCTION public.fn_cat_caminho_servico(p_id uuid, OUT cat text, OUT sub text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN c.parent_id IS NULL THEN c.name ELSE p.name END, CASE WHEN c.parent_id IS NULL THEN NULL ELSE c.name END
  FROM service_categories c LEFT JOIN service_categories p ON p.id = c.parent_id WHERE c.id = p_id
$$;

-- O ramo da árvore dos serviços com os mesmos nomes (só encontra; não cria). Sem sub: o de topo. Com sub que não exista: NULL.
CREATE OR REPLACE FUNCTION public.fn_cat_ramo_servico(p_org uuid, p_cat text, p_sub text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.fn_cat_nome(p_sub) = '' THEN r.id ELSE f.id END
  FROM service_categories r
  LEFT JOIN service_categories f ON f.parent_id = r.id AND NOT f.is_deleted AND public.fn_cat_nome(f.name) = public.fn_cat_nome(p_sub)
  WHERE r.organization_id = p_org AND r.parent_id IS NULL AND NOT r.is_deleted AND public.fn_cat_nome(p_cat) <> ''
    AND public.fn_cat_nome(r.name) = public.fn_cat_nome(p_cat)
  ORDER BY (CASE WHEN public.fn_cat_nome(p_sub) = '' THEN r.id ELSE f.id END) IS NULL, r.created_at, f.created_at LIMIT 1
$$;

-- A categoria e a sub de produto com os nomes de um ramo da árvore dos serviços (cria as que faltem).
CREATE OR REPLACE FUNCTION public.fn_cat_categoria_do_ramo(p_org uuid, p_ramo uuid, p_user uuid, OUT categoria_id uuid, OUT subcategoria_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.fn_cat_caminho_servico(p_ramo);
  IF c.cat IS NULL THEN RETURN; END IF;
  categoria_id := public.fn_cat_categoria_produto(p_org, c.cat, NULL, p_user);
  subcategoria_id := CASE WHEN c.sub IS NULL THEN NULL ELSE public.fn_cat_categoria_produto(p_org, c.sub, categoria_id, p_user) END;
END $$;

REVOKE ALL ON FUNCTION public.fn_cat_marca(uuid,text,uuid), public.fn_cat_unidade(uuid,text), public.fn_cat_unidade_segura(uuid,uuid),
  public.fn_cat_categoria_produto(uuid,text,uuid,uuid), public.fn_cat_caminho_produto(uuid), public.fn_cat_caminho_servico(uuid),
  public.fn_cat_ramo_servico(uuid,text,text), public.fn_cat_categoria_do_ramo(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- ─── 4. O gatilho que mantém os ids e os textos acertados ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cat_produto_tabelas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_novo boolean;
  v_uom uuid;
  c record; s record; r record;
BEGIN
  IF NEW.tipo_catalogo IS NULL OR NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  -- um produto que acabou de entrar no Catálogo conta como novo (todos os campos se acertam)
  v_novo := TG_OP = 'INSERT' OR OLD.tipo_catalogo IS NULL;

  -- marca
  IF NEW.brand_id IS NOT NULL AND (v_novo OR NEW.brand_id IS DISTINCT FROM OLD.brand_id) THEN
    NEW.marca_livre := (SELECT name FROM brands WHERE id = NEW.brand_id);
  ELSIF NEW.brand_id IS NULL AND v_novo OR (NOT v_novo AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id AND NEW.marca_livre IS DISTINCT FROM OLD.marca_livre) THEN
    NEW.brand_id := public.fn_cat_marca(NEW.organization_id, NEW.marca_livre, NEW.created_by);
  END IF;

  -- unidade
  IF NEW.uom_id IS NOT NULL AND (v_novo OR NEW.uom_id IS DISTINCT FROM OLD.uom_id) THEN
    NEW.unidade := (SELECT code FROM uom WHERE id = NEW.uom_id);
  ELSIF (NEW.uom_id IS NULL AND v_novo OR (NOT v_novo AND NEW.uom_id IS NOT DISTINCT FROM OLD.uom_id AND NEW.unidade IS DISTINCT FROM OLD.unidade))
        AND nullif(btrim(NEW.unidade), '') IS NOT NULL THEN
    BEGIN
      v_uom := public.fn_cat_unidade(NEW.organization_id, NEW.unidade);
    EXCEPTION WHEN OTHERS THEN v_uom := NULL;  -- uma embalagem: fica o texto, sem uom_id
    END;
    IF v_uom IS NOT NULL AND (TG_OP = 'INSERT' OR public.fn_cat_unidade_segura(NEW.id, v_uom)) THEN NEW.uom_id := v_uom; END IF;
  END IF;

  -- categoria
  IF (NEW.category_id IS NOT NULL OR NEW.subcategory_id IS NOT NULL)
     AND (v_novo OR NEW.category_id IS DISTINCT FROM OLD.category_id OR NEW.subcategory_id IS DISTINCT FROM OLD.subcategory_id) THEN
    SELECT * INTO c FROM public.fn_cat_caminho_produto(coalesce(NEW.subcategory_id, NEW.category_id));
    SELECT * INTO s FROM public.fn_cat_caminho_servico(NEW.catalogo_categoria_id);
    -- o ramo antigo fica se já tem os mesmos nomes; senão, o da árvore dos serviços com esses nomes (ou nenhum)
    IF NEW.catalogo_categoria_id IS NULL OR public.fn_cat_nome(s.cat) <> public.fn_cat_nome(c.cat) OR public.fn_cat_nome(s.sub) <> public.fn_cat_nome(c.sub) THEN
      NEW.catalogo_categoria_id := public.fn_cat_ramo_servico(NEW.organization_id, c.cat, c.sub);
    END IF;
  ELSIF NEW.category_id IS NULL AND NEW.subcategory_id IS NULL AND NEW.catalogo_categoria_id IS NOT NULL
        AND (v_novo OR NEW.catalogo_categoria_id IS DISTINCT FROM OLD.catalogo_categoria_id) THEN
    SELECT * INTO r FROM public.fn_cat_categoria_do_ramo(NEW.organization_id, NEW.catalogo_categoria_id, NEW.created_by);
    NEW.category_id := r.categoria_id;
    NEW.subcategory_id := r.subcategoria_id;
  ELSIF NOT v_novo AND NEW.catalogo_categoria_id IS NOT NULL AND NEW.catalogo_categoria_id IS DISTINCT FROM OLD.catalogo_categoria_id
        AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND NEW.subcategory_id IS NOT DISTINCT FROM OLD.subcategory_id THEN
    -- uma versão antiga da app mudou o ramo pela árvore dos serviços: a categoria de produto segue-o
    SELECT * INTO r FROM public.fn_cat_categoria_do_ramo(NEW.organization_id, NEW.catalogo_categoria_id, NEW.created_by);
    IF r.categoria_id IS NOT NULL THEN NEW.category_id := r.categoria_id; NEW.subcategory_id := r.subcategoria_id; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_cat_produto_tabelas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cat_produto_tabelas ON public.products;
CREATE TRIGGER trg_cat_produto_tabelas
  BEFORE INSERT OR UPDATE OF brand_id, uom_id, category_id, subcategory_id, marca_livre, unidade, catalogo_categoria_id, tipo_catalogo
  ON public.products FOR EACH ROW EXECUTE FUNCTION public.fn_cat_produto_tabelas();

-- ─── 5. Ler ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_tabelas(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tec boolean; v_mat boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_catalogo (20270113100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  RETURN (
    WITH prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted AND v_mat),
         exige AS (SELECT id, exige_categoria_produto_id FROM services
                   WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted AND exige_categoria_produto_id IS NOT NULL),
         usadas AS (SELECT category_id AS id FROM prod UNION SELECT subcategory_id FROM prod UNION SELECT exige_categoria_produto_id FROM exige),
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order FROM product_categories c
                  WHERE c.id IN (SELECT id FROM usadas WHERE id IS NOT NULL)
                     OR (c.deleted_at IS NULL AND (c.organization_id = p_org
                         OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))))
    SELECT jsonb_build_object(
      'produtos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'brand_id', p.brand_id, 'marca', b.name, 'uom_id', p.uom_id,
                    'uom', u.code, 'category_id', p.category_id, 'subcategory_id', p.subcategory_id))
                  FROM prod p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN uom u ON u.id = p.uom_id), '[]'),
      -- as categorias de topo do ramo das subs que vêm (mesmo de outra organização), para a árvore ficar inteira
      'categoriasProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT id, name, parent_id, sort_order FROM cats
                    UNION SELECT c.id, c.name, c.parent_id, c.sort_order FROM product_categories c WHERE c.id IN (SELECT parent_id FROM cats)) x), '[]'),
      'marcas', coalesce((SELECT jsonb_agg(DISTINCT b.name) FROM brands b
                  WHERE b.deleted_at IS NULL AND coalesce(b.is_active, true)
                    AND (b.organization_id = p_org OR b.id IN (SELECT brand_id FROM prod))), '[]'),
      'unidades', coalesce((SELECT jsonb_agg(DISTINCT u.code) FROM uom u
                  WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = p_org)), '[]'),
      'exige', coalesce((SELECT jsonb_agg(jsonb_build_object('service_id', id, 'categoria_produto_id', exige_categoria_produto_id)) FROM exige), '[]')
    ));
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produtos_tabelas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_tabelas(uuid) TO authenticated, service_role;

-- ─── 6. Gravar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A marca, a unidade e a categoria do produto, pelo nome. Marca vazia: sem marca. Unidade vazia: fica a que está.
-- Categoria vazia: sem categoria. Sub vazia: só a categoria de topo.
CREATE OR REPLACE FUNCTION public.cat_guardar_produto_tabelas(p_org uuid, p_id uuid, p_marca text, p_unidade text, p_categoria text, p_subcategoria text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_p products%ROWTYPE; v_marca uuid; v_uom uuid; v_cat uuid; v_sub uuid;
BEGIN
  SELECT * INTO v_p FROM products WHERE id = p_id AND organization_id = p_org AND NOT is_deleted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_marca := public.fn_cat_marca(p_org, p_marca, v_user);
  v_uom := coalesce(public.fn_cat_unidade(p_org, p_unidade), v_p.uom_id);
  IF v_uom IS DISTINCT FROM v_p.uom_id AND NOT public.fn_cat_unidade_segura(p_id, v_uom) THEN
    IF v_p.uom_id IS NOT NULL THEN
      RAISE EXCEPTION 'Não dá para mudar a unidade de «%»: tem ligações a fornecedores noutra unidade.', v_p.name USING ERRCODE = 'CT002';
    END IF;
    v_uom := NULL;  -- fica só o texto, como antes
  END IF;
  v_cat := public.fn_cat_categoria_produto(p_org, p_categoria, NULL, v_user);
  v_sub := CASE WHEN v_cat IS NULL THEN NULL ELSE public.fn_cat_categoria_produto(p_org, p_subcategoria, v_cat, v_user) END;
  UPDATE products SET brand_id = v_marca, uom_id = v_uom, category_id = v_cat, subcategory_id = v_sub,
    marca_livre = (SELECT name FROM brands WHERE id = v_marca),
    unidade = coalesce((SELECT code FROM uom WHERE id = v_uom), nullif(btrim(p_unidade), ''), unidade),
    updated_at = now()
  WHERE id = p_id;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text) TO authenticated, service_role;

-- O ramo da árvore dos produtos de onde o serviço obriga a escolher um produto, pelo nome. Categoria vazia: não obriga.
-- A coluna antiga (exige_produto_categoria_id) grava-a cat_guardar_servico_detalhes, como antes.
CREATE OR REPLACE FUNCTION public.cat_guardar_servico_exige(p_org uuid, p_id uuid, p_categoria text, p_subcategoria text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'services.edit'); v_cat uuid; v_no uuid; v_id uuid;
BEGIN
  v_cat := public.fn_cat_categoria_produto(p_org, p_categoria, NULL, v_user);
  v_no := CASE WHEN v_cat IS NULL THEN NULL ELSE coalesce(public.fn_cat_categoria_produto(p_org, p_subcategoria, v_cat, v_user), v_cat) END;
  UPDATE services SET exige_categoria_produto_id = v_no, updated_at = now()
  WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Serviço não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_servico_exige(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_servico_exige(uuid,uuid,text,text) TO authenticated, service_role;

-- ─── 7. Preencher os ids a partir do texto ──────────────────────────────────────────────────────────────────────────────────────────
DO $b$
DECLARE
  r record; c record; v_uom uuid;
  n_marca int := 0; n_uni int := 0; n_uni_fora int := 0; n_cat int := 0; n_cat_dif int := 0; n_svc int := 0;
BEGIN
  FOR r IN SELECT * FROM products WHERE tipo_catalogo IS NOT NULL AND NOT is_deleted AND organization_id IS NOT NULL ORDER BY created_at LOOP
    IF r.brand_id IS NULL AND nullif(btrim(r.marca_livre), '') IS NOT NULL THEN
      UPDATE products SET brand_id = public.fn_cat_marca(r.organization_id, r.marca_livre, r.created_by) WHERE id = r.id;
      n_marca := n_marca + 1;
    END IF;
    IF r.uom_id IS NULL AND nullif(btrim(r.unidade), '') IS NOT NULL THEN
      BEGIN
        v_uom := public.fn_cat_unidade(r.organization_id, r.unidade);
      EXCEPTION WHEN OTHERS THEN v_uom := NULL;
      END;
      IF v_uom IS NOT NULL AND public.fn_cat_unidade_segura(r.id, v_uom) THEN
        UPDATE products SET uom_id = v_uom WHERE id = r.id;
        n_uni := n_uni + 1;
      ELSE
        n_uni_fora := n_uni_fora + 1;
      END IF;
    END IF;
    IF r.category_id IS NULL AND r.subcategory_id IS NULL AND r.catalogo_categoria_id IS NOT NULL THEN
      SELECT * INTO c FROM public.fn_cat_categoria_do_ramo(r.organization_id, r.catalogo_categoria_id, r.created_by);
      IF c.categoria_id IS NOT NULL THEN
        UPDATE products SET category_id = c.categoria_id, subcategory_id = c.subcategoria_id WHERE id = r.id;
        n_cat := n_cat + 1;
      END IF;
    ELSIF (r.category_id IS NOT NULL OR r.subcategory_id IS NOT NULL) AND r.catalogo_categoria_id IS NOT NULL THEN
      -- já tinha categoria de produto: fica a que tem; conta-se se o nome do ramo for outro (a Catálogo passa a mostrar a de produto)
      IF (SELECT public.fn_cat_nome(p.cat) || '|' || public.fn_cat_nome(p.sub) FROM public.fn_cat_caminho_produto(coalesce(r.subcategory_id, r.category_id)) p)
         IS DISTINCT FROM (SELECT public.fn_cat_nome(s.cat) || '|' || public.fn_cat_nome(s.sub) FROM public.fn_cat_caminho_servico(r.catalogo_categoria_id) s) THEN
        n_cat_dif := n_cat_dif + 1;
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM services WHERE exige_categoria_produto_id IS NULL AND exige_produto_categoria_id IS NOT NULL AND NOT is_deleted LOOP
    SELECT * INTO c FROM public.fn_cat_categoria_do_ramo(r.organization_id, r.exige_produto_categoria_id, r.created_by);
    IF c.categoria_id IS NOT NULL THEN
      UPDATE services SET exige_categoria_produto_id = coalesce(c.subcategoria_id, c.categoria_id) WHERE id = r.id;
      n_svc := n_svc + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Produtos com a marca preenchida: %; com a unidade: % (ficaram sem, por ligações a fornecedores noutra unidade: %); com a categoria: % (já tinham outra categoria de produto: %). Serviços com o ramo exigido: %.',
    n_marca, n_uni, n_uni_fora, n_cat, n_cat_dif, n_svc;
END $b$;

-- ─── 8. Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $c$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE tipo_catalogo IS NOT NULL AND NOT is_deleted AND organization_id IS NOT NULL
             AND brand_id IS NULL AND nullif(btrim(marca_livre), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: ficaram produtos do Catálogo com marca em texto e sem brand_id.';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE tipo_catalogo IS NOT NULL AND NOT is_deleted AND organization_id IS NOT NULL
             AND category_id IS NULL AND subcategory_id IS NULL AND catalogo_categoria_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: ficaram produtos do Catálogo com ramo e sem categoria de produto.';
  END IF;
END $c$;
