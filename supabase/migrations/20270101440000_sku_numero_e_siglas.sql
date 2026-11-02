-- Portal do fornecedor (reunião de 30/10/2026): o SKU leva um número de 4 algarismos e as siglas não se repetem.
--
-- Pedido do Ricardo (docs/21 do repositório de documentação, F7 e F8):
--   • SKU = sigla da categoria - sigla da subcategoria - número de 4 algarismos (0001 a 9999) - medida - cor.
--     Exemplo: ELE-ILU-0001-18X18-PRE. O número conta por categoria e subcategoria.
--   • Se a subcategoria tiver a mesma sigla da categoria (Eletricidade e Elétrica dão as duas ELE), a da subcategoria
--     leva a letra seguinte do nome (ELET).
-- Decisão do Rúben (2/11/2026): os artigos que já têm SKU ficam com ele. Só os novos, e os que mudam de categoria ou de
-- subcategoria, levam a regra nova. Um artigo antigo que só muda a medida ou a cor continua com a regra antiga (-2, -3…).
--
-- O que muda (a base só cresce; nada se apaga):
--   1. fn_sp_sigla_de_nome          a sigla de um nome: as letras sem acentos, em maiúsculas, as primeiras n.
--   2. fn_sp_categoria_codigo       (gatilho em sp_categorias) uma categoria nova sem código fica com as 3 primeiras letras do
--                                   nome. Se a sigla da subcategoria for igual à da categoria, ou já existir ao lado, acrescenta
--                                   a letra seguinte do nome; se ainda repetir, troca essa 4.ª letra pelas seguintes.
--                                   As subcategorias que hoje repetem a sigla da categoria são corrigidas.
--   3. fn_sp_catalog_sku            (gatilho, redefinido) a regra nova, com a antiga só para os artigos antigos.
SET lock_timeout = '5s';

DO $do$
BEGIN
  -- guarda: fn_sp_catalog_sku é a da 20270101310000 (md5 lido da base RH a 2/11)
  IF md5(pg_get_functiondef('public.fn_sp_catalog_sku()'::regprocedure)) <> '0cae8f3ddbcc6b90d251a7ab16af8cb0' THEN
    RAISE EXCEPTION 'Guarda: fn_sp_catalog_sku mudou desde a 20270101310000. Rever esta migration antes de a aplicar.';
  END IF;
END $do$;

-- ------------------------------------------------------------------ 1. a sigla de um nome
CREATE OR REPLACE FUNCTION public.fn_sp_sigla_de_nome(p_nome text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT regexp_replace(upper(translate(coalesce(p_nome, ''),
           'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
         '[^A-Z0-9]', '', 'g')
$$;

-- ------------------------------------------------------------------ 2. a sigla da categoria e da subcategoria
CREATE OR REPLACE FUNCTION public.fn_sp_categoria_codigo() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_letras text := public.fn_sp_sigla_de_nome(NEW.nome);
  v_pai text;
  v_cand text;
  i int;
BEGIN
  IF coalesce(btrim(NEW.codigo), '') = '' THEN
    NEW.codigo := left(v_letras, 3);
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT codigo INTO v_pai FROM public.sp_categorias WHERE id = NEW.parent_id;
  END IF;
  -- livre: diferente da sigla do pai e de qualquer irmã
  IF NEW.codigo IS DISTINCT FROM v_pai AND NOT EXISTS (
       SELECT 1 FROM public.sp_categorias x
       WHERE x.parent_id IS NOT DISTINCT FROM NEW.parent_id AND x.codigo = NEW.codigo AND x.id IS DISTINCT FROM NEW.id) THEN
    RETURN NEW;
  END IF;
  -- repete: as 3 letras + a letra seguinte do nome; se ainda repetir, as letras depois dessa
  FOR i IN 4 .. greatest(length(v_letras), 4) LOOP
    v_cand := left(NEW.codigo, 3) || substr(v_letras, i, 1);
    CONTINUE WHEN length(v_cand) < 4;
    IF v_cand IS DISTINCT FROM v_pai AND NOT EXISTS (
         SELECT 1 FROM public.sp_categorias x
         WHERE x.parent_id IS NOT DISTINCT FROM NEW.parent_id AND x.codigo = v_cand AND x.id IS DISTINCT FROM NEW.id) THEN
      NEW.codigo := v_cand;
      RETURN NEW;
    END IF;
  END LOOP;
  -- o nome não tem letras que cheguem: um algarismo no fim
  FOR i IN 1 .. 9 LOOP
    v_cand := left(NEW.codigo, 3) || i;
    IF v_cand IS DISTINCT FROM v_pai AND NOT EXISTS (
         SELECT 1 FROM public.sp_categorias x
         WHERE x.parent_id IS NOT DISTINCT FROM NEW.parent_id AND x.codigo = v_cand AND x.id IS DISTINCT FROM NEW.id) THEN
      NEW.codigo := v_cand;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Não há sigla livre para %', NEW.nome USING ERRCODE = 'unique_violation';
END $$;
DROP TRIGGER IF EXISTS trg_sp_categoria_codigo ON public.sp_categorias;
CREATE TRIGGER trg_sp_categoria_codigo BEFORE INSERT OR UPDATE OF codigo, nome, parent_id ON public.sp_categorias
  FOR EACH ROW EXECUTE FUNCTION public.fn_sp_categoria_codigo();

-- as subcategorias que hoje repetem a sigla da categoria (o gatilho escolhe a nova)
UPDATE public.sp_categorias s SET codigo = s.codigo
FROM public.sp_categorias c
WHERE s.parent_id = c.id AND s.codigo = c.codigo;

-- ------------------------------------------------------------------ 3. o SKU
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_sku() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
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

  SELECT concat_ws('-', c.codigo, s.codigo) INTO v_prefixo
  FROM public.sp_categorias c
  LEFT JOIN public.sp_categorias s ON s.id = NEW.subcategoria_id AND s.parent_id = c.id
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
END $$;
-- o gatilho trg_sp_catalog_sku (20270101310000) já chama esta função

COMMENT ON COLUMN public.supplier_catalog_items.sku IS
  'Gerado pela base (fn_sp_catalog_sku): categoria-subcategoria-número de 4 algarismos-medida-cor (20270101440000). Os SKU anteriores ficam como estavam.';
