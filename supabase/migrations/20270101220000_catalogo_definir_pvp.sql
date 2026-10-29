-- Catálogo: o PVP do produto edita-se na ficha do produto (o custo vem só do catálogo do fornecedor; a margem acompanha).
-- Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas: uma função nova.
--
-- NOVA cat_definir_pvp(p_product_id, p_pvp) → { "ok": true, "pvp": numeric|null }
--   • p_pvp > 0: muda só a linha retail ATUAL do produto (valid_from DESC NULLS LAST, created_at DESC, id — a regra da opção A):
--     price (2 casas) e preco_exato (6 casas; cat_ler_catalogo lê coalesce(preco_exato, price) e 2136 linhas retail já o têm).
--     Sem linha retail: insere uma, como cat_guardar_produto (valid_from depois do último preço do produto, IVA por omissão 23),
--     na moeda do custo atual do produto ou EUR. Igual ao atual: não escreve nada. Nunca mexe nas linhas purchase.
--   • p_pvp NULL: limpar o PVP → apaga as linhas retail DESTE produto. O Catálogo (catalogoReal: «último retail» por valid_from) e os
--     ~10 leitores antigos (product_prices sem ordem nem valid_to) ignoram valid_to: fechar a linha com valid_to não a tiraria; uma
--     linha a 0 seria lida como PVP 0. Apagar é a única forma de o preço voltar a custo/(1−alvo) em todos.
--   • p_pvp <= 0 → CT002. Produto inexistente/apagado → CT003.
--   • Permissão: system admin ou products.manage_prices na organização do produto (fn_cat_exigir). SECURITY DEFINER, search_path fixo.

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL OR to_regprocedure('public.fn_cat_depois_do_ultimo_preco(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_cat_exigir / fn_cat_depois_do_ultimo_preco.';
  END IF;
  IF to_regprocedure('public.cat_definir_pvp(uuid,numeric)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: cat_definir_pvp já existe no remoto: rever antes de aplicar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_prices' AND column_name = 'preco_exato') THEN
    RAISE EXCEPTION 'Guarda: falta product_prices.preco_exato.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.cat_definir_pvp(p_product_id uuid, p_pvp numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_preco  numeric;
  v_exato  numeric;
  v_linha  public.product_prices;
  v_ccy    public.currency_code;
BEGIN
  SELECT organization_id INTO v_org FROM products WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_user := public.fn_cat_exigir(v_org, 'products.manage_prices');
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;
  IF p_pvp IS NOT NULL AND p_pvp <= 0 THEN
    RAISE EXCEPTION 'O PVP tem de ser maior do que 0 (para voltar ao preço pela margem, limpe o PVP).' USING ERRCODE = 'CT002';
  END IF;
  IF p_pvp IS NOT NULL AND round(p_pvp, 2) >= 100000000 THEN
    RAISE EXCEPTION 'O PVP é demasiado alto.' USING ERRCODE = 'CT002';
  END IF;

  -- trancar o produto: duas gravações do PVP não se cruzam
  PERFORM 1 FROM products WHERE id = p_product_id FOR NO KEY UPDATE;
  PERFORM set_config('app.audit_source', 'catalogo', true);

  IF p_pvp IS NULL THEN
    DELETE FROM product_prices WHERE product_id = p_product_id AND price_type = 'retail';
    RETURN jsonb_build_object('ok', true, 'pvp', NULL);
  END IF;

  v_preco := round(p_pvp, 2);
  v_exato := round(p_pvp, 6);
  SELECT * INTO v_linha FROM product_prices
  WHERE product_id = p_product_id AND price_type = 'retail'
  ORDER BY valid_from DESC NULLS LAST, created_at DESC, id
  LIMIT 1;

  IF v_linha.id IS NOT NULL THEN
    IF v_linha.price IS DISTINCT FROM v_preco OR COALESCE(v_linha.preco_exato, v_linha.price) IS DISTINCT FROM v_exato THEN
      UPDATE product_prices SET price = v_preco, preco_exato = v_exato, created_by = v_user WHERE id = v_linha.id;
    END IF;
  ELSE
    SELECT pp.currency INTO v_ccy FROM product_prices pp
    WHERE pp.product_id = p_product_id AND pp.price_type = 'purchase'
    ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id
    LIMIT 1;
    INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type)
    VALUES (p_product_id, COALESCE(v_ccy, 'EUR'), v_preco, v_exato,
            greatest(clock_timestamp(), public.fn_cat_depois_do_ultimo_preco(p_product_id)), v_user, 'retail');
  END IF;

  RETURN jsonb_build_object('ok', true, 'pvp', v_preco);
END $function$;

REVOKE ALL ON FUNCTION public.cat_definir_pvp(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_pvp(uuid, numeric) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_pvp(uuid, numeric) IS 'Catálogo, ficha do produto: define o PVP (só a linha retail atual; insere se não houver) ou limpa-o com NULL (apaga as linhas retail do produto). products.manage_prices na organização do produto. Nunca mexe no custo.';

DO $conferir$
BEGIN
  IF to_regprocedure('public.cat_definir_pvp(uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Conferir: cat_definir_pvp não foi criada.';
  END IF;
  IF has_function_privilege('anon', 'public.cat_definir_pvp(uuid,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_pvp(uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: EXECUTE de cat_definir_pvp tem de ser só authenticated/service_role.';
  END IF;
END $conferir$;
