-- Portal do fornecedor (29/10/2026): o SKU gera-se sozinho quando o fornecedor insere o artigo.
--
-- Decisões do Rúben (29/10):
--   • O SKU é categoria-subcategoria-medida-cor, em códigos: REV-PAR-30X60-BRA.
--   • A categoria e a subcategoria vêm de uma lista única do portal (a conta do fornecedor serve várias organizações e a árvore
--     do Catálogo é de cada uma). Ao criar o produto numa organização, a categoria liga-se à árvore dela pelo nome.
--   • Dois artigos com o mesmo SKU: o segundo fica com -2, o terceiro com -3…
--
-- O que muda (a base só cresce; nada se apaga):
--   1. sp_categorias                  a lista do portal: categorias (sem pai) e subcategorias, cada uma com um código de 3 letras.
--                                     Semeada com a árvore de materiais do Catálogo da nike (sem as categorias só de serviços).
--   2. supplier_catalog_items         + categoria_id, subcategoria_id, medida, cor e sku (único em todo o portal).
--   3. fn_sp_codigo_medida / fn_sp_codigo_cor / fn_sp_sku_base   as regras do código:
--        medida  maiúsculas; ×, x e * passam a X; a vírgula a ponto; fica só o que é número, ponto e X ("30 x 60 cm" → 30X60).
--        cor     as 3 primeiras letras da primeira palavra, sem acentos ("Branco mate" → BRA).
--        sku     os códigos que existem, por esta ordem, separados por hífen. Sem categoria não há SKU.
--   4. fn_sp_catalog_sku (gatilho)    gera o SKU ao inserir e quando muda a categoria, a subcategoria, a medida ou a cor. Livre:
--                                     o primeiro de BASE, BASE-2, BASE-3…; o artigo que já tem BASE ou BASE-n fica com o seu.
--   5. sp_catalog_categorias()        a lista, para o portal e para o CRM.
--      sp_catalog_classificar_item    o fornecedor (utilizador principal da conta) põe a categoria, a medida e a cor num artigo.
--   6. fn_sp_catalog_item_json        devolve também a categoria, a subcategoria, a medida, a cor e o SKU (o portal e o CRM leem-no).
--   7. item_suppliers (gatilho)       um produto ligado a um artigo classificado e ainda sem categoria no Catálogo fica com a categoria
--                                     da árvore da organização que tem o mesmo nome (a subcategoria, se existir; senão a categoria).
--
-- Fica para depois: a importação em lote (sp_catalog_import) ainda não traz a categoria, a medida e a cor.
SET lock_timeout = '5s';

-- ------------------------------------------------------------------ 1. a lista do portal
CREATE TABLE IF NOT EXISTS public.sp_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.sp_categorias(id) ON DELETE RESTRICT,
  codigo text NOT NULL CHECK (codigo ~ '^[A-Z0-9]{2,4}$'),
  nome text NOT NULL,
  ordem smallint NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sp_categorias_codigo_unico ON public.sp_categorias (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);
CREATE UNIQUE INDEX IF NOT EXISTS sp_categorias_nome_unico ON public.sp_categorias (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
COMMENT ON TABLE public.sp_categorias IS 'Categorias e subcategorias do portal do fornecedor (lista única), com o código que entra no SKU do artigo.';
ALTER TABLE public.sp_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_categorias_ler ON public.sp_categorias;
CREATE POLICY sp_categorias_ler ON public.sp_categorias FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.sp_categorias FROM anon;
GRANT SELECT ON public.sp_categorias TO authenticated;

WITH cat(codigo, nome, ordem) AS (VALUES
  ('ALV', 'Alvenarias e rebocos', 1), ('AVA', 'AVAC', 2), ('CAI', 'Caixilharia', 3), ('CAN', 'Canalização', 4),
  ('CAR', 'Carpintaria', 5), ('ELE', 'Eletricidade', 6), ('GAS', 'Gás', 7), ('ISO', 'Isolamento e impermeabilização', 8),
  ('MAR', 'Marmoraria', 9), ('PIN', 'Pintura', 10), ('REV', 'Revestimentos', 11))
INSERT INTO public.sp_categorias (codigo, nome, ordem)
SELECT c.codigo, c.nome, c.ordem FROM cat c
WHERE NOT EXISTS (SELECT 1 FROM public.sp_categorias x WHERE x.parent_id IS NULL AND x.codigo = c.codigo);

WITH sub(pai, codigo, nome, ordem) AS (VALUES
  ('AVA', 'ARC', 'Ar condicionado', 1),
  ('CAI', 'JAN', 'Janelas', 1), ('CAI', 'RED', 'Redes mosquiteiras', 2),
  ('CAN', 'AGU', 'Águas e esgotos', 1), ('CAN', 'AQU', 'Aquecimento de águas', 2), ('CAN', 'LAV', 'Lava-loiças e torneiras de cozinha', 3),
  ('CAN', 'LOU', 'Louças e torneiras', 4),
  ('CAR', 'ACE', 'Acessórios WC', 1), ('CAR', 'ELD', 'Eletrodomésticos', 2), ('CAR', 'MOB', 'Mobiliário', 3), ('CAR', 'MCB', 'Móveis de casa de banho', 4),
  ('CAR', 'PLA', 'Pladur', 5), ('CAR', 'POR', 'Portas', 6), ('CAR', 'RES', 'Resguardos', 7), ('CAR', 'ROU', 'Roupeiros', 8),
  ('ELE', 'APA', 'Aparelhagem e quadros', 1), ('ELE', 'ILU', 'Iluminação', 2), ('ELE', 'VEN', 'Ventilação', 3),
  ('GAS', 'APG', 'Aparelhos a gás', 1), ('GAS', 'RDG', 'Redes de gás', 2),
  ('MAR', 'BWC', 'Bancadas de casa de banho', 1), ('MAR', 'BCZ', 'Bancadas de cozinha', 2),
  ('PIN', 'PAR', 'Paredes', 1), ('PIN', 'TET', 'Tetos', 2),
  ('REV', 'COL', 'Colas e argamassas', 1), ('REV', 'PAR', 'Parede', 2), ('REV', 'PAV', 'Pavimento', 3))
INSERT INTO public.sp_categorias (parent_id, codigo, nome, ordem)
SELECT p.id, s.codigo, s.nome, s.ordem FROM sub s JOIN public.sp_categorias p ON p.parent_id IS NULL AND p.codigo = s.pai
WHERE NOT EXISTS (SELECT 1 FROM public.sp_categorias x WHERE x.parent_id = p.id AND x.codigo = s.codigo);

-- ------------------------------------------------------------------ 2. os campos do artigo
ALTER TABLE public.supplier_catalog_items ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.sp_categorias(id) ON DELETE RESTRICT;
ALTER TABLE public.supplier_catalog_items ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES public.sp_categorias(id) ON DELETE RESTRICT;
ALTER TABLE public.supplier_catalog_items ADD COLUMN IF NOT EXISTS medida text;
ALTER TABLE public.supplier_catalog_items ADD COLUMN IF NOT EXISTS cor text;
ALTER TABLE public.supplier_catalog_items ADD COLUMN IF NOT EXISTS sku text;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_catalog_items_sku_unico ON public.supplier_catalog_items (sku) WHERE sku IS NOT NULL;
COMMENT ON COLUMN public.supplier_catalog_items.sku IS 'Gerado pela base (fn_sp_catalog_sku): categoria-subcategoria-medida-cor, com -2, -3… quando se repete.';

-- ------------------------------------------------------------------ 3. as regras do código
CREATE OR REPLACE FUNCTION public.fn_sp_codigo_medida(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(
           regexp_replace(translate(upper(coalesce(p, '')), '×*,', 'XX.'), '[^0-9.X]', '', 'g'),
           'X{2,}', 'X', 'g'), '^[X.]+|[X.]+$', '', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.fn_sp_codigo_cor(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT nullif(left(regexp_replace(
           upper(translate(split_part(btrim(coalesce(p, '')), ' ', 1), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
           '[^A-Z0-9]', '', 'g'), 3), '')
$$;

CREATE OR REPLACE FUNCTION public.fn_sp_sku_base(p_categoria uuid, p_subcategoria uuid, p_medida text, p_cor text) RETURNS text
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN c.id IS NULL THEN NULL ELSE
    concat_ws('-', c.codigo, s.codigo, public.fn_sp_codigo_medida(p_medida), public.fn_sp_codigo_cor(p_cor)) END
  FROM (SELECT 1) um
  LEFT JOIN public.sp_categorias c ON c.id = p_categoria AND c.parent_id IS NULL
  LEFT JOIN public.sp_categorias s ON s.id = p_subcategoria AND s.parent_id = c.id
$$;

-- ------------------------------------------------------------------ 4. o gatilho
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_sku() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_base text; v_n int := 1; v_cand text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.categoria_id IS NOT DISTINCT FROM OLD.categoria_id AND NEW.subcategoria_id IS NOT DISTINCT FROM OLD.subcategoria_id
     AND NEW.medida IS NOT DISTINCT FROM OLD.medida AND NEW.cor IS NOT DISTINCT FROM OLD.cor AND NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;
  v_base := public.fn_sp_sku_base(NEW.categoria_id, NEW.subcategoria_id, NEW.medida, NEW.cor);
  IF v_base IS NULL THEN NEW.sku := NULL; RETURN NEW; END IF;
  -- o artigo que já tem este código (ou um com número) fica com o seu
  IF TG_OP = 'UPDATE' AND OLD.sku IS NOT NULL AND (OLD.sku = v_base
     OR (left(OLD.sku, length(v_base) + 1) = v_base || '-' AND substr(OLD.sku, length(v_base) + 2) ~ '^[0-9]+$')) THEN
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
END $$;
DROP TRIGGER IF EXISTS trg_sp_catalog_sku ON public.supplier_catalog_items;
CREATE TRIGGER trg_sp_catalog_sku BEFORE INSERT OR UPDATE ON public.supplier_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_sp_catalog_sku();

-- ------------------------------------------------------------------ 5. a lista e a classificação
CREATE OR REPLACE FUNCTION public.sp_catalog_categorias() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome,
    'subcategorias', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'codigo', s.codigo, 'nome', s.nome) ORDER BY s.ordem, s.nome)
                               FROM public.sp_categorias s WHERE s.parent_id = c.id AND s.ativa), '[]'))
    ORDER BY c.ordem, c.nome), '[]')
  FROM public.sp_categorias c WHERE c.parent_id IS NULL AND c.ativa
$$;
REVOKE ALL ON FUNCTION public.sp_catalog_categorias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_catalog_categorias() TO authenticated, service_role;

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
  IF p_categoria IS NULL THEN
    RAISE EXCEPTION 'Categoria obrigatória' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_categorias WHERE id = p_categoria AND parent_id IS NULL AND ativa) THEN
    RAISE EXCEPTION 'Categoria desconhecida' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_subcategoria IS NULL AND EXISTS (SELECT 1 FROM public.sp_categorias WHERE parent_id = p_categoria AND ativa) THEN
    RAISE EXCEPTION 'Subcategoria obrigatória' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_subcategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sp_categorias WHERE id = p_subcategoria AND parent_id = p_categoria AND ativa) THEN
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
REVOKE ALL ON FUNCTION public.sp_catalog_classificar_item(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_catalog_classificar_item(uuid, uuid, uuid, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------ 6. o JSON do artigo (o texto vivo + 5 campos)
DO $do$
BEGIN
  -- guarda: o texto vivo é o da 20261227100000 (md5 lido da base RH a 29/10)
  IF md5(pg_get_functiondef('public.fn_sp_catalog_item_json(supplier_catalog_items,boolean)'::regprocedure)) <> 'f44de9c1b57773845e4ebbda0d5412c0' THEN
    RAISE EXCEPTION 'Guarda: fn_sp_catalog_item_json mudou desde a 20261227100000. Rever esta migration antes de a aplicar.';
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.fn_sp_catalog_item_json(p_item supplier_catalog_items, p_with_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', p_item.id,
    'supplier_ref', p_item.supplier_ref,
    'barcode', p_item.barcode,
    'name', p_item.name,
    'description', p_item.description,
    'brand', p_item.brand,
    'unit_label', p_item.unit_label,
    'units_per_pack', p_item.units_per_pack,
    'base_price', CASE WHEN p_with_price THEN p_item.base_price END,
    'currency', p_item.currency,
    'moq', p_item.moq,
    'lead_time_days', p_item.lead_time_days,
    'is_active', p_item.is_active,
    'updated_at', p_item.updated_at,
    -- 20270101310000: a classificação e o SKU gerado
    'categoria_id', p_item.categoria_id,
    'subcategoria_id', p_item.subcategoria_id,
    'medida', p_item.medida,
    'cor', p_item.cor,
    'sku', p_item.sku
  )
$function$;

-- ------------------------------------------------------------------ 7. a categoria do Catálogo ao ligar o produto
CREATE OR REPLACE FUNCTION public.fn_sp_categoria_no_catalogo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_cat text; v_sub text; v_no uuid;
BEGIN
  IF NEW.catalog_item_id IS NULL OR NEW.product_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT c.nome, s.nome INTO v_cat, v_sub FROM public.supplier_catalog_items i
  JOIN public.sp_categorias c ON c.id = i.categoria_id LEFT JOIN public.sp_categorias s ON s.id = i.subcategoria_id
  WHERE i.id = NEW.catalog_item_id;
  IF v_cat IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(f.id, p.id) INTO v_no FROM public.service_categories p
  LEFT JOIN public.service_categories f ON f.parent_id = p.id AND lower(f.name) = lower(v_sub)
  WHERE p.organization_id = NEW.organization_id AND p.parent_id IS NULL AND lower(p.name) = lower(v_cat)
  ORDER BY (f.id IS NULL), p.created_at LIMIT 1;
  IF v_no IS NOT NULL THEN
    UPDATE public.products SET catalogo_categoria_id = v_no, updated_at = now()
    WHERE id = NEW.product_id AND organization_id = NEW.organization_id AND catalogo_categoria_id IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sp_categoria_no_catalogo ON public.item_suppliers;
CREATE TRIGGER trg_sp_categoria_no_catalogo AFTER INSERT OR UPDATE OF catalog_item_id ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_sp_categoria_no_catalogo();
