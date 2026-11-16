-- 16/11/2026: o portal do fornecedor passa a usar as categorias da EMPRESA (product_categories), as mesmas que a empresa cria
-- no Catálogo. A categoria é da empresa, não do fornecedor: ele só escolhe uma das categorias das empresas a que está ligado.
-- Antes: lista fixa e igual para todos em sp_categorias (11 categorias), sem ligação ao Catálogo.
--
--   * sp_catalog_categorias: categorias e subcategorias ativas das empresas ligadas à conta do fornecedor (+ nome da empresa).
--   * sp_catalog_classificar_item: só aceita uma categoria dessas empresas.
--   * fn_sp_sku_base / fn_sp_catalog_sku: o código do SKU passa a ser a sigla da categoria/subcategoria.
--   * supplier_catalog_items.categoria_id/subcategoria_id passam a referir product_categories. Os artigos já classificados
--     passam para a categoria com o mesmo nome numa empresa ligada (sem igual, ficam sem categoria; o SKU volta a gerar-se).
--   * fn_sp_categoria_no_catalogo: o produto criado a partir do artigo fica também com a categoria/subcategoria da empresa.
--   * sp_categorias fica na base, sem uso.
-- Funções refeitas a partir do pg_get_functiondef ao vivo (guarda md5 abaixo).

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.sp_catalog_categorias',       'b90a7c290fa59d78de68d48793a63510'),
    ('public.sp_catalog_classificar_item', '28d9b82d5b91587de889afb0097982ef'),
    ('public.fn_sp_catalog_sku',           '5e2d7607a9b815197d9ea9e6c65ffc0b'),
    ('public.fn_sp_sku_base',              '6d2b3bef549d36c9ed6582621305decc'),
    ('public.fn_sp_categoria_no_catalogo', '18fec7bbd97137162bdfa8ca98918393')) v(f, h)
  LOOP
    IF md5(pg_get_functiondef(r.f::regproc)) <> r.h THEN
      RAISE EXCEPTION '% mudou desde que esta migração foi escrita; refazer a partir da versão atual', r.f;
    END IF;
  END LOOP;
END $g$;

-- ---------------------------------------------------------------- empresas da conta do fornecedor
CREATE OR REPLACE FUNCTION public.fn_sp_orgs_da_conta(p_conta uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT l.organization_id
  FROM public.supplier_account_links l
  JOIN public.suppliers s ON s.id = l.supplier_id
  WHERE l.supplier_account_id = p_conta AND l.status = 'active' AND s.deleted_at IS NULL
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_orgs_da_conta(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- a lista do portal
CREATE OR REPLACE FUNCTION public.sp_catalog_categorias()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', coalesce(c.sigla, ''), 'nome', c.name,
      'empresa_id', o.id, 'empresa', o.name,
      'subcategorias', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'codigo', coalesce(s.sigla, ''), 'nome', s.name) ORDER BY s.sort_order, s.name)
                                 FROM public.product_categories s
                                 WHERE s.parent_id = c.id AND s.is_active AND s.deleted_at IS NULL), '[]'))
      ORDER BY o.name, c.sort_order, c.name), '[]')
    FROM public.product_categories c
    JOIN public.anew_organizations o ON o.id = c.organization_id
    WHERE c.organization_id IN (SELECT public.fn_sp_orgs_da_conta(u.supplier_account_id))
      AND c.parent_id IS NULL AND c.is_active AND c.deleted_at IS NULL
  );
END $function$;

-- ---------------------------------------------------------------- classificar um artigo
CREATE OR REPLACE FUNCTION public.sp_catalog_classificar_item(p_id uuid, p_categoria uuid, p_subcategoria uuid, p_medida text, p_cor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u   public.supplier_portal_users := public.fn_sp_actor();
  cur public.supplier_catalog_items;
  v_medida text := nullif(btrim(regexp_replace(coalesce(p_medida, ''), '[\x01-\x1F\x7F]', '', 'g')), '');
  v_cor    text := nullif(btrim(regexp_replace(coalesce(p_cor, ''), '[\x01-\x1F\x7F]', '', 'g')), '');
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  SELECT * INTO cur FROM public.supplier_catalog_items WHERE id = p_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
  IF cur.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  -- 20270103600000
  IF cur.item_kind = 'servico' THEN
    RAISE EXCEPTION 'Um serviço não tem categoria de produto' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_categoria IS NULL THEN
    RAISE EXCEPTION 'Categoria obrigatória' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  -- 20270117950000: a categoria é de uma empresa a que o fornecedor está ligado
  IF NOT EXISTS (SELECT 1 FROM public.product_categories WHERE id = p_categoria AND parent_id IS NULL AND is_active AND deleted_at IS NULL
                   AND organization_id IN (SELECT public.fn_sp_orgs_da_conta(u.supplier_account_id))) THEN
    RAISE EXCEPTION 'Categoria desconhecida' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_subcategoria IS NULL AND EXISTS (SELECT 1 FROM public.product_categories WHERE parent_id = p_categoria AND is_active AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Subcategoria obrigatória' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_subcategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_categories WHERE id = p_subcategoria AND parent_id = p_categoria AND is_active AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'A subcategoria não é desta categoria' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF length(v_medida) > 40 OR length(v_cor) > 40 THEN
    RAISE EXCEPTION 'A medida e a cor têm no máximo 40 caracteres' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  UPDATE public.supplier_catalog_items SET categoria_id = p_categoria, subcategoria_id = p_subcategoria, medida = v_medida, cor = v_cor,
    updated_at = now(), updated_by_portal_user = u.id
  WHERE id = cur.id RETURNING * INTO cur;
  RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(cur, true));
END $function$;

-- ---------------------------------------------------------------- SKU com as siglas da empresa
CREATE OR REPLACE FUNCTION public.fn_sp_sku_base(p_categoria uuid, p_subcategoria uuid, p_medida text, p_cor text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN c.id IS NULL THEN NULL ELSE
    concat_ws('-', c.sigla, s.sigla, public.fn_sp_codigo_medida(p_medida), public.fn_sp_codigo_cor(p_cor)) END
  FROM (SELECT 1) um
  LEFT JOIN public.product_categories c ON c.id = p_categoria AND c.parent_id IS NULL
  LEFT JOIN public.product_categories s ON s.id = p_subcategoria AND s.parent_id = c.id
$function$;

CREATE OR REPLACE FUNCTION public.fn_sp_catalog_sku()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prefixo text;   -- CAT-SUB
  v_resto text;     -- MEDIDA-COR
  v_n int := 1;
  v_cand text;
  v_base text;
  v_num text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.categoria_id IS NOT DISTINCT FROM OLD.categoria_id AND NEW.subcategoria_id IS NOT DISTINCT FROM OLD.subcategoria_id
     AND NEW.medida IS NOT DISTINCT FROM OLD.medida AND NEW.cor IS NOT DISTINCT FROM OLD.cor AND NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;

  -- 20270117950000: siglas das categorias da empresa (product_categories)
  SELECT nullif(concat_ws('-', c.sigla, s.sigla), '') INTO v_prefixo
  FROM public.product_categories c
  LEFT JOIN public.product_categories s ON s.id = NEW.subcategoria_id AND s.parent_id = c.id
  WHERE c.id = NEW.categoria_id AND c.parent_id IS NULL;
  IF v_prefixo IS NULL THEN NEW.sku := NULL; RETURN NEW; END IF;
  v_resto := nullif(concat_ws('-', public.fn_sp_codigo_medida(NEW.medida), public.fn_sp_codigo_cor(NEW.cor)), '');

  IF TG_OP = 'UPDATE' AND OLD.sku IS NOT NULL THEN
    -- regra nova, mesma categoria e subcategoria: fica com o seu número
    v_num := substring(OLD.sku FROM '^' || v_prefixo || '-([0-9]{4})(-|$)');
    IF v_num IS NOT NULL THEN
      NEW.sku := concat_ws('-', v_prefixo, v_num, v_resto);
      RETURN NEW;
    END IF;
    -- artigo antigo que não mudou de categoria nem de subcategoria: a regra antiga (BASE, BASE-2, BASE-3…)
    IF NEW.categoria_id IS NOT DISTINCT FROM OLD.categoria_id AND NEW.subcategoria_id IS NOT DISTINCT FROM OLD.subcategoria_id
       AND OLD.sku !~ ('^' || v_prefixo || '-[0-9]{4}(-|$)') THEN
      v_base := public.fn_sp_sku_base(NEW.categoria_id, NEW.subcategoria_id, NEW.medida, NEW.cor);
      IF OLD.sku = v_base OR (left(OLD.sku, length(v_base) + 1) = v_base || '-' AND substr(OLD.sku, length(v_base) + 2) ~ '^[0-9]+$') THEN
        NEW.sku := OLD.sku; RETURN NEW;
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('sp_sku:' || v_base, 0));
      LOOP
        v_cand := CASE WHEN v_n = 1 THEN v_base ELSE v_base || '-' || v_n END;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.supplier_catalog_items WHERE sku = v_cand AND id IS DISTINCT FROM NEW.id);
        v_n := v_n + 1;
      END LOOP;
      NEW.sku := v_cand;
      RETURN NEW;
    END IF;
  END IF;

  -- regra nova: o número seguinte desta categoria e subcategoria
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_sku_num:' || v_prefixo, 0));
  SELECT coalesce(max(substring(sku FROM '^' || v_prefixo || '-([0-9]{4})(-|$)')::int), 0) + 1 INTO v_n
  FROM public.supplier_catalog_items
  WHERE sku ~ ('^' || v_prefixo || '-[0-9]{4}(-|$)') AND id IS DISTINCT FROM NEW.id;
  IF v_n > 9999 THEN
    RAISE EXCEPTION 'Esta subcategoria já tem 9999 artigos (%)', v_prefixo USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  NEW.sku := concat_ws('-', v_prefixo, lpad(v_n::text, 4, '0'), v_resto);
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------- as colunas passam a referir as categorias da empresa
ALTER TABLE public.supplier_catalog_items DROP CONSTRAINT supplier_catalog_items_categoria_id_fkey;
ALTER TABLE public.supplier_catalog_items DROP CONSTRAINT supplier_catalog_items_subcategoria_id_fkey;

-- artigos já classificados: a categoria com o mesmo nome numa empresa ligada à conta (a primeira por nome da empresa)
WITH velho AS (
  SELECT i.id, i.supplier_account_id, c.nome AS cat, s.nome AS sub
  FROM public.supplier_catalog_items i
  JOIN public.sp_categorias c ON c.id = i.categoria_id
  LEFT JOIN public.sp_categorias s ON s.id = i.subcategoria_id
), novo AS (
  SELECT DISTINCT ON (v.id) v.id, pc.id AS cat_id, ps.id AS sub_id
  FROM velho v
  JOIN public.product_categories pc ON pc.parent_id IS NULL AND pc.deleted_at IS NULL AND lower(pc.name) = lower(v.cat)
    AND pc.organization_id IN (SELECT public.fn_sp_orgs_da_conta(v.supplier_account_id))
  JOIN public.anew_organizations o ON o.id = pc.organization_id
  LEFT JOIN public.product_categories ps ON ps.parent_id = pc.id AND ps.deleted_at IS NULL AND lower(ps.name) = lower(v.sub)
  ORDER BY v.id, (v.sub IS NOT NULL AND ps.id IS NULL), o.name
)
UPDATE public.supplier_catalog_items i
SET categoria_id = n.cat_id, subcategoria_id = n.sub_id
FROM public.supplier_catalog_items i0
LEFT JOIN novo n ON n.id = i0.id
WHERE i.id = i0.id AND (i0.categoria_id IS NOT NULL OR i0.subcategoria_id IS NOT NULL);

ALTER TABLE public.supplier_catalog_items ADD CONSTRAINT supplier_catalog_items_categoria_id_fkey
  FOREIGN KEY (categoria_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;
ALTER TABLE public.supplier_catalog_items ADD CONSTRAINT supplier_catalog_items_subcategoria_id_fkey
  FOREIGN KEY (subcategoria_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------- o produto criado a partir do artigo
CREATE OR REPLACE FUNCTION public.fn_sp_categoria_no_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_cat text; v_sub text; v_no uuid; v_cat_id uuid; v_sub_id uuid;
BEGIN
  IF NEW.catalog_item_id IS NULL OR NEW.product_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  -- 20270117950000: a categoria do artigo já é da empresa (product_categories)
  SELECT c.name, s.name, c.id, s.id INTO v_cat, v_sub, v_cat_id, v_sub_id FROM public.supplier_catalog_items i
  JOIN public.product_categories c ON c.id = i.categoria_id AND c.organization_id = NEW.organization_id
  LEFT JOIN public.product_categories s ON s.id = i.subcategoria_id
  WHERE i.id = NEW.catalog_item_id;
  IF v_cat IS NULL THEN RETURN NEW; END IF;
  UPDATE public.products SET category_id = v_cat_id, subcategory_id = v_sub_id, updated_at = now()
  WHERE id = NEW.product_id AND organization_id = NEW.organization_id AND category_id IS NULL AND subcategory_id IS NULL;
  SELECT coalesce(f.id, p.id) INTO v_no FROM public.service_categories p
  LEFT JOIN public.service_categories f ON f.parent_id = p.id AND lower(f.name) = lower(v_sub)
  WHERE p.organization_id = NEW.organization_id AND p.parent_id IS NULL AND lower(p.name) = lower(v_cat)
  ORDER BY (f.id IS NULL), p.created_at LIMIT 1;
  IF v_no IS NOT NULL THEN
    UPDATE public.products SET catalogo_categoria_id = v_no, updated_at = now()
    WHERE id = NEW.product_id AND organization_id = NEW.organization_id AND catalogo_categoria_id IS NULL;
  END IF;
  RETURN NEW;
END $function$;
