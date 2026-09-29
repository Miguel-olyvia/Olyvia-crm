-- ============================================================================
-- Packs na ficha do produto (compra e venda por omissão)
--
-- Altera:   products — coluna sale_uom_id (unidade de venda por omissão)
-- Cria:     public.fn_products_validate_sale_uom() + gatilho trg_products_validate_sale_uom
-- Cria:     public.fn_uom_get_or_create_pack(uuid, uuid, integer)
-- Cria:     public.rpc_set_product_packs(uuid, uuid, integer, numeric, integer)
-- Redefine: public.fn_uom_validate() — só acrescenta products.sale_uom_id à
--           verificação "uom em uso" (base da versão VIVA, 20261204201500)
-- Redefine: public.rpc_register_stock_entry(...) — custo sem p_unit_cost
--           passa a purchase_price / fator do pack (base da versão VIVA)
--
-- NÃO altera: nenhuma política RLS, nenhum dado existente, product_prices
--             (o custo unitário continua a ser gravado por rpc_update_product).
--
-- ---------------------------------------------------------------------------
-- O MODELO (ver 20261204201500)
-- ---------------------------------------------------------------------------
-- O stock fica sempre na unidade do produto (products.uom_id). Um pack é uma
-- uom com base_uom_id = products.uom_id e conversion_factor inteiro >= 2.
--   • Compra: a ligação preferida em item_suppliers tem uom_id (NULL = à
--     unidade) e purchase_price = preço DESSA unidade de compra (do pack).
--   • Venda:  products.sale_uom_id (NULL = à unidade) é a unidade sugerida por
--     omissão nas linhas de venda. Não muda stock nem preços guardados.
--
-- ---------------------------------------------------------------------------
-- products.sale_uom_id — gatilho de validação
-- ---------------------------------------------------------------------------
-- Válida se: products.uom_id não é NULL, uom.base_uom_id = products.uom_id,
-- conversion_factor >= 2 e a uom é global ou da organização do produto.
--   • Se quem escreve MUDA sale_uom_id (ou INSERT) para um valor inválido → erro.
--   • Se sale_uom_id não muda mas deixa de bater certo (mudou uom_id ou
--     organization_id do produto) → passa a NULL, sem bloquear.
-- rpc_create_product / rpc_update_product / imports não escrevem sale_uom_id:
-- no INSERT fica NULL (o gatilho não faz nada); no UPDATE só pode limpar.
--
-- ---------------------------------------------------------------------------
-- fn_uom_get_or_create_pack — permissões
-- ---------------------------------------------------------------------------
-- A política uom_insert exige products.manage. Aqui aceita-se products.edit
-- OU products.manage (+ organização visível): quem pode editar o produto pode
-- definir-lhe o pack, e a função só cria uma forma restrita de uom (pack de
-- uma unidade simples, da própria empresa, código gerado). Reaproveita sempre
-- uma uom ativa com a mesma base e fator (prefere a da empresa à global).
-- Serializada por empresa com pg_advisory_xact_lock para não criar duplicados.
--
-- ---------------------------------------------------------------------------
-- rpc_set_product_packs — autorização
-- ---------------------------------------------------------------------------
-- Igual a rpc_update_product (versão viva): perfil de negócio obrigatório,
-- produto lido por (id, organization_id = empresa ativa), e — se não for
-- admin — products.edit + organização do produto visível. É o mesmo que as
-- políticas products_update e item_suppliers_update_policy (item_type
-- 'product') exigem. A ligação alterada é SEMPRE da mesma empresa.
--
-- Preço de compra: p_purchase_pack_price NULL (ou 0) mantém o preço atual SÓ
-- se o fator da ligação não mudar; se o fator mudar (ex. un → PK100), o preço
-- antigo referia-se a outra quantidade e passa a NULL em vez de ficar errado.
-- Nunca se grava 0.
--
-- Custo (item_suppliers_select_policy exige products.view_cost): mexer na
-- compra (p_purchase_qty NOT NULL) exige products.view_cost (ou admin). No
-- retorno, purchase_uom_id / purchase_units_per / purchase_price só vêm
-- preenchidos para quem tem products.view_cost ou é admin; senão NULL.
--
-- Produto de outra empresa principal (visível mas organization_id ≠ empresa
-- ativa): recusa com "Os packs só podem ser definidos na empresa principal
-- do produto". Fora do âmbito continua "Produto não encontrado".
--
-- ---------------------------------------------------------------------------
-- rpc_register_stock_entry — custo por unidade de stock
-- ---------------------------------------------------------------------------
-- Sem p_unit_cost, o fallback era item_suppliers.purchase_price (preço do
-- PACK) gravado como custo por unidade. Passa a purchase_price /
-- fn_uom_units_per(ligação.uom_id, produto). uom_id NULL = fator 1 (igual).
-- ============================================================================

-- ─── 1. products.sale_uom_id ───────────────────────────────────────────────
-- ADD COLUMN + FK pede ACCESS EXCLUSIVE em products (e SHARE ROW EXCLUSIVE em
-- uom). Se houver uma transação longa a segurar products, falha ao fim de 5s
-- em vez de ficar na fila a bloquear todas as leituras/escritas atrás dela.
-- SET LOCAL: só vale para a transação desta migration.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_uom_id uuid NULL REFERENCES public.uom(id);

CREATE INDEX IF NOT EXISTS idx_products_sale_uom_id
  ON public.products (sale_uom_id) WHERE sale_uom_id IS NOT NULL;

COMMENT ON COLUMN public.products.sale_uom_id IS
  'Unidade de venda por omissão (pack da unidade do produto). NULL = à unidade. Limpa-se sozinha se deixar de bater certo com products.uom_id.';

CREATE OR REPLACE FUNCTION public.fn_products_validate_sale_uom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok   boolean;
  v_code text;
BEGIN
  IF NEW.sale_uom_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (NEW.uom_id IS NOT NULL
          AND u.base_uom_id = NEW.uom_id
          AND u.conversion_factor >= 2
          AND (u.organization_id IS NULL OR u.organization_id = NEW.organization_id)),
         u.code
    INTO v_ok, v_code
  FROM public.uom u
  WHERE u.id = NEW.sale_uom_id;

  IF COALESCE(v_ok, false) THEN
    RETURN NEW;
  END IF;

  -- Não foi pedido mudar a unidade de venda: mudou o produto por baixo
  -- (unidade/organização). Limpa em vez de bloquear.
  IF TG_OP = 'UPDATE' AND NEW.sale_uom_id IS NOT DISTINCT FROM OLD.sale_uom_id THEN
    NEW.sale_uom_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.uom_id IS NULL THEN
    RAISE EXCEPTION 'O produto precisa de unidade de stock para usar packs'
      USING ERRCODE = 'check_violation';
  END IF;
  RAISE EXCEPTION 'A unidade de venda "%" não é um pack da unidade de stock do produto', COALESCE(v_code, NEW.sale_uom_id::text)
    USING ERRCODE = 'check_violation';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_products_validate_sale_uom() FROM PUBLIC, anon, authenticated;

-- Re-executável: CREATE OR REPLACE TRIGGER existe desde o PostgreSQL 14
-- (BD: PostgreSQL 17.6, version() 24/09/2026).
CREATE OR REPLACE TRIGGER trg_products_validate_sale_uom
  BEFORE INSERT OR UPDATE OF uom_id, sale_uom_id, organization_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_validate_sale_uom();

-- ─── 2. fn_uom_validate: sale_uom_id também conta como "em uso" ────────────
-- Cópia da versão VIVA (pg_get_functiondef, 24/09/2026 = 20261204201500);
-- única diferença: a linha products.sale_uom_id no bloco final.
CREATE OR REPLACE FUNCTION public.fn_uom_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base public.uom%ROWTYPE;
BEGIN
  NEW.code := btrim(NEW.code);
  IF NEW.code = '' THEN
    RAISE EXCEPTION 'O código da unidade é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Código de empresa não pode repetir um código global.
  IF NEW.organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.uom g
    WHERE g.organization_id IS NULL AND lower(btrim(g.code)) = lower(NEW.code) AND g.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Já existe uma unidade global com o código "%"', NEW.code USING ERRCODE = 'unique_violation';
  END IF;

  IF NEW.base_uom_id IS NOT NULL THEN
    IF NEW.base_uom_id = NEW.id THEN
      RAISE EXCEPTION 'Uma unidade não pode ser base de si própria' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_base FROM public.uom WHERE id = NEW.base_uom_id;
    IF v_base.base_uom_id IS NOT NULL THEN
      RAISE EXCEPTION 'A unidade base "%" já é ela própria uma embalagem — só é permitido um nível', v_base.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_base.organization_id IS NOT NULL AND v_base.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'A unidade base "%" pertence a outra organização', v_base.code USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.uom c WHERE c.base_uom_id = NEW.id AND c.id <> NEW.id) THEN
      RAISE EXCEPTION 'A unidade "%" é base de outras embalagens — não pode passar a ser embalagem', NEW.code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.base_uom_id IS DISTINCT FROM OLD.base_uom_id
          OR NEW.conversion_factor IS DISTINCT FROM OLD.conversion_factor)
     AND (   EXISTS (SELECT 1 FROM public.item_suppliers WHERE uom_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.products WHERE uom_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.products WHERE sale_uom_id = OLD.id)  -- NOVO (20261204270000)
          OR public.fn_uom_is_used_in_lines(OLD.id)) THEN
    RAISE EXCEPTION 'A unidade "%" já está em uso — a base e o fator não podem mudar. Crie uma nova unidade.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_uom_validate() FROM PUBLIC, anon, authenticated;

-- ─── 3. fn_uom_get_or_create_pack ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_uom_get_or_create_pack(p_organization_id uuid, p_base_uom_id uuid, p_qty integer)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_base public.uom%ROWTYPE;
  v_id   uuid;
  v_code text;
  v_try  integer := 0;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'A organização é obrigatória' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_base_uom_id IS NULL THEN
    RAISE EXCEPTION 'O produto precisa de unidade de stock para usar packs' USING ERRCODE = 'check_violation';
  END IF;
  -- Mesmo limite do CHECK uom_conversion_factor_inteiro.
  IF p_qty IS NULL OR p_qty < 2 OR p_qty > 1000000 THEN
    RAISE EXCEPTION 'A quantidade do pack tem de ser um número inteiro entre 2 e 1000000'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Autorização ──────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_system_admin_user(v_uid) THEN
    IF NOT (public.has_anew_permission(v_uid, 'products.edit')
            OR public.has_anew_permission(v_uid, 'products.manage')) THEN
      RAISE EXCEPTION 'Sem permissão para criar unidades' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Unidade base ─────────────────────────────────────────────────────────
  SELECT * INTO v_base FROM public.uom WHERE id = p_base_uom_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade de medida % não encontrada', p_base_uom_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_base.base_uom_id IS NOT NULL THEN
    RAISE EXCEPTION 'A unidade "%" já é um pack — a base tem de ser uma unidade simples', v_base.code
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_base.organization_id IS NOT NULL AND v_base.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'A unidade base "%" pertence a outra organização', v_base.code
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Reaproveitar (antes e depois do lock) ────────────────────────────────
  FOR v_try IN 1..2 LOOP
    SELECT u.id INTO v_id
    FROM public.uom u
    WHERE u.base_uom_id = p_base_uom_id
      AND u.conversion_factor = p_qty
      AND u.is_active
      AND (u.organization_id = p_organization_id OR u.organization_id IS NULL)
    ORDER BY (u.organization_id IS NULL), u.created_at, u.id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
    IF v_try = 1 THEN
      -- Serializa a criação de packs por empresa (evita duplicados e colisões de código).
      PERFORM pg_advisory_xact_lock(hashtextextended('uom_pack:' || p_organization_id::text, 0));
    END IF;
  END LOOP;

  -- ── Código livre no âmbito (empresa + globais) ───────────────────────────
  v_try := 0;
  LOOP
    v_try := v_try + 1;
    v_code := CASE
      WHEN v_try = 1 THEN 'PK' || p_qty
      WHEN v_try = 2 THEN 'PK' || p_qty || '-' || btrim(v_base.code)
      ELSE 'PK' || p_qty || '-' || btrim(v_base.code) || '-' || (v_try - 1)
    END;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.uom u
      WHERE lower(btrim(u.code)) = lower(v_code)
        AND (u.organization_id = p_organization_id OR u.organization_id IS NULL)
    );
    IF v_try >= 100 THEN
      RAISE EXCEPTION 'Não foi possível gerar um código livre para o pack de % %', p_qty, v_base.code
        USING ERRCODE = 'unique_violation';
    END IF;
  END LOOP;

  INSERT INTO public.uom (code, description, base_uom_id, conversion_factor, organization_id, is_active)
  VALUES (v_code, 'Pack de ' || p_qty || ' ' || btrim(v_base.code), p_base_uom_id, p_qty, p_organization_id, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Só é chamada dentro de rpc_set_product_packs (SECURITY DEFINER, corre como
-- owner) — authenticated NÃO a chama diretamente.
REVOKE ALL ON FUNCTION public.fn_uom_get_or_create_pack(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_uom_get_or_create_pack(uuid, uuid, integer) TO service_role;

COMMENT ON FUNCTION public.fn_uom_get_or_create_pack(uuid, uuid, integer) IS
  'Devolve a uom pack (base, fator) visível à empresa — prefere a da empresa — ou cria-a na empresa (código PK<n>, PK<n>-<base>, PK<n>-<base>-<k>).';

-- ─── 4. rpc_set_product_packs ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_set_product_packs(
  p_product_id          uuid,
  p_organization_id     uuid,
  p_purchase_qty        integer,
  p_purchase_pack_price numeric,
  p_sale_qty            integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_product      public.products%ROWTYPE;
  v_link         public.item_suppliers%ROWTYPE;
  v_has_link     boolean := false;
  v_sale_uom     uuid;
  v_purchase_uom uuid;
  v_old_factor   integer;
  v_new_price    numeric;
  v_constraint   text;
  v_code         text;
  v_is_admin     boolean;
  v_can_cost     boolean;
  v_price        numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  v_can_cost := v_is_admin OR public.has_anew_permission(v_uid, 'products.view_cost');

  -- 0 ou vazio = sem preço (nunca gravar 0).
  v_price := CASE WHEN p_purchase_pack_price > 0 THEN p_purchase_pack_price END;

  -- ── Parâmetros ───────────────────────────────────────────────────────────
  IF p_sale_qty IS NOT NULL AND (p_sale_qty < 1 OR p_sale_qty > 1000000) THEN
    RAISE EXCEPTION 'A quantidade do pack de venda tem de ser um número inteiro entre 1 e 1000000'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_purchase_qty IS NOT NULL AND (p_purchase_qty < 1 OR p_purchase_qty > 1000000) THEN
    RAISE EXCEPTION 'A quantidade do pack de compra tem de ser um número inteiro entre 1 e 1000000'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_purchase_pack_price IS NOT NULL AND p_purchase_pack_price < 0 THEN
    RAISE EXCEPTION 'O preço de compra não pode ser negativo' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Produto, lido pela empresa ativa (como rpc_update_product) ──────────
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    -- Existe e é visível, mas a empresa principal é outra: mensagem clara.
    -- (Fora do âmbito mantém "não encontrado" — não revela existência.)
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = p_product_id
        AND p.organization_id IS NOT NULL
        AND (v_is_admin OR p.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid)))
    ) THEN
      RAISE EXCEPTION 'Os packs só podem ser definidos na empresa principal do produto'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização (paridade com rpc_update_product / products_update) ────
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_product.organization_id IS NULL
       OR NOT (v_product.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Produto fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- A compra mexe no custo (item_suppliers_select_policy exige view_cost).
    IF p_purchase_qty IS NOT NULL AND NOT v_can_cost THEN
      RAISE EXCEPTION 'Sem permissão para ver ou alterar custos de produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_product.uom_id IS NULL
     AND (COALESCE(p_sale_qty, 1) >= 2 OR COALESCE(p_purchase_qty, 1) >= 2) THEN
    RAISE EXCEPTION 'O produto precisa de unidade de stock para usar packs' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Venda ────────────────────────────────────────────────────────────────
  IF COALESCE(p_sale_qty, 1) >= 2 THEN
    v_sale_uom := public.fn_uom_get_or_create_pack(p_organization_id, v_product.uom_id, p_sale_qty);
  ELSE
    v_sale_uom := NULL;
  END IF;

  IF v_sale_uom IS DISTINCT FROM v_product.sale_uom_id THEN
    UPDATE public.products
    SET sale_uom_id = v_sale_uom
    WHERE id = v_product.id
    RETURNING * INTO v_product;
  END IF;

  -- ── Compra ───────────────────────────────────────────────────────────────
  SELECT * INTO v_link
  FROM public.item_suppliers
  WHERE product_id = v_product.id
    AND organization_id = p_organization_id
    AND item_type = 'product'
    AND is_preferred
    AND is_active
    AND deleted_at IS NULL
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;
  v_has_link := FOUND;

  IF p_purchase_qty IS NOT NULL THEN
    IF NOT v_has_link THEN
      RAISE EXCEPTION 'Escolha um fornecedor preferido' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_purchase_qty >= 2 THEN
      v_purchase_uom := public.fn_uom_get_or_create_pack(p_organization_id, v_product.uom_id, p_purchase_qty);
    ELSE
      v_purchase_uom := NULL;
    END IF;

    v_old_factor := public.fn_uom_units_per(v_link.uom_id, v_product.id);
    v_new_price := CASE
      WHEN v_price IS NOT NULL               THEN v_price
      WHEN v_old_factor = p_purchase_qty     THEN v_link.purchase_price  -- mesma quantidade: mantém
      ELSE NULL                                                          -- preço antigo era de outra quantidade
    END;

    IF v_purchase_uom IS DISTINCT FROM v_link.uom_id
       OR v_new_price IS DISTINCT FROM v_link.purchase_price THEN
      BEGIN
        UPDATE public.item_suppliers
        SET uom_id         = v_purchase_uom,
            purchase_price = v_new_price
        WHERE id = v_link.id
        RETURNING * INTO v_link;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'item_suppliers_product_supplier_uom_active_uniq' THEN
          SELECT code INTO v_code FROM public.uom WHERE id = v_purchase_uom;
          RAISE EXCEPTION 'Este fornecedor já tem outra ligação a este produto em "%". Apague ou edite essa ligação antes de mudar o pack de compra.',
            COALESCE(v_code, 'unidade')
            USING ERRCODE = 'unique_violation';
        END IF;
        RAISE;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sale_uom_id',        v_product.sale_uom_id,
    'sale_units_per',     public.fn_uom_units_per(v_product.sale_uom_id, v_product.id),
    -- Dados da compra só para quem pode ver custos.
    'purchase_uom_id',    CASE WHEN v_has_link AND v_can_cost THEN v_link.uom_id END,
    'purchase_units_per', CASE WHEN v_has_link AND v_can_cost THEN public.fn_uom_units_per(v_link.uom_id, v_product.id) END,
    'purchase_price',     CASE WHEN v_has_link AND v_can_cost THEN v_link.purchase_price END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_set_product_packs(uuid, uuid, integer, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_product_packs(uuid, uuid, integer, numeric, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_set_product_packs(uuid, uuid, integer, numeric, integer) IS
  'Define o pack de venda (products.sale_uom_id) e o pack/preço de compra da ligação preferida (item_suppliers). NULL em p_purchase_qty = não mexe na compra. Não mexe em product_prices.';

-- ─── 5. rpc_register_stock_entry: custo do pack → custo por unidade ────────
-- Cópia da versão VIVA (pg_get_functiondef, 24/09/2026). Diferenças (NOVO):
--   • lê também item_suppliers.uom_id;
--   • sem p_unit_cost, o custo gravado é purchase_price / fator da ligação.
-- p_qty e stock_movements.quantity continuam em unidades do produto.
-- Grants mantêm-se (CREATE OR REPLACE com a mesma assinatura).
CREATE OR REPLACE FUNCTION public.rpc_register_stock_entry(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_price  numeric;
  v_sku    text;
  v_doc    text;
  v_result integer;
  v_link_uom uuid;  -- NOVO (20261204270000)
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT purchase_price, supplier_sku, uom_id INTO v_price, v_sku, v_link_uom  -- NOVO: uom_id
  FROM public.item_suppliers
  WHERE id = p_item_supplier_id
    AND product_id = p_product_id
    AND organization_id = v_org
    AND is_active = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor inválido, inativo, ou não associado a este produto' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204270000): purchase_price é o preço da unidade de compra
  -- (pack); o movimento guarda custo por unidade de stock.
  IF p_unit_cost IS NULL AND v_price IS NOT NULL AND v_link_uom IS NOT NULL THEN
    v_price := v_price / public.fn_uom_units_per(v_link_uom, p_product_id);
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'compra');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, item_supplier_id, unit_cost_at_time,
    supplier_sku_at_time, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'entrada', p_qty,
    v_doc, 'compra', p_item_supplier_id, COALESCE(p_unit_cost, v_price),
    v_sku, p_counterparty, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

-- ============================================================================
-- REVERSÃO (manual, por esta ordem)
-- ============================================================================
-- -- 5. repor rpc_register_stock_entry (versão viva anterior, 24/09/2026):
-- CREATE OR REPLACE FUNCTION public.rpc_register_stock_entry(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
--  RETURNS integer
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor  uuid;
--   v_org    uuid;
--   v_price  numeric;
--   v_sku    text;
--   v_doc    text;
--   v_result integer;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF p_qty IS NULL OR p_qty <= 0 THEN
--     RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT organization_id INTO v_org
--   FROM public.warehouses
--   WHERE id = p_warehouse_id AND deleted_at IS NULL;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   SELECT purchase_price, supplier_sku INTO v_price, v_sku
--   FROM public.item_suppliers
--   WHERE id = p_item_supplier_id
--     AND product_id = p_product_id
--     AND organization_id = v_org
--     AND is_active = true
--     AND deleted_at IS NULL;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Fornecedor inválido, inativo, ou não associado a este produto' USING ERRCODE = 'check_violation';
--   END IF;
--
--   v_doc := public.fn_next_stock_document_number(v_org, 'compra');
--
--   INSERT INTO public.stock_movements (
--     organization_id, product_id, warehouse_id, movement_type, quantity,
--     document_number, document_type, item_supplier_id, unit_cost_at_time,
--     supplier_sku_at_time, counterparty, notes, created_by
--   ) VALUES (
--     v_org, p_product_id, p_warehouse_id, 'entrada', p_qty,
--     v_doc, 'compra', p_item_supplier_id, COALESCE(p_unit_cost, v_price),
--     v_sku, p_counterparty, p_notes, v_actor
--   )
--   RETURNING balance_after INTO v_result;
--
--   RETURN v_result;
-- END;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.rpc_set_product_packs(uuid, uuid, integer, numeric, integer);
-- DROP FUNCTION IF EXISTS public.fn_uom_get_or_create_pack(uuid, uuid, integer);
--
-- -- 2. repor fn_uom_validate (versão viva anterior, pg_get_functiondef
-- --    24/09/2026 = 20261204201500, SEM a linha products.sale_uom_id) —
-- --    ANTES de largar a coluna, senão o gatilho da uom rebenta.
-- CREATE OR REPLACE FUNCTION public.fn_uom_validate()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_base public.uom%ROWTYPE;
-- BEGIN
--   NEW.code := btrim(NEW.code);
--   IF NEW.code = '' THEN
--     RAISE EXCEPTION 'O código da unidade é obrigatório' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Código de empresa não pode repetir um código global.
--   IF NEW.organization_id IS NOT NULL AND EXISTS (
--     SELECT 1 FROM public.uom g
--     WHERE g.organization_id IS NULL AND lower(btrim(g.code)) = lower(NEW.code) AND g.id <> NEW.id
--   ) THEN
--     RAISE EXCEPTION 'Já existe uma unidade global com o código "%"', NEW.code USING ERRCODE = 'unique_violation';
--   END IF;
--
--   IF NEW.base_uom_id IS NOT NULL THEN
--     IF NEW.base_uom_id = NEW.id THEN
--       RAISE EXCEPTION 'Uma unidade não pode ser base de si própria' USING ERRCODE = 'check_violation';
--     END IF;
--
--     SELECT * INTO v_base FROM public.uom WHERE id = NEW.base_uom_id;
--     IF v_base.base_uom_id IS NOT NULL THEN
--       RAISE EXCEPTION 'A unidade base "%" já é ela própria uma embalagem — só é permitido um nível', v_base.code
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_base.organization_id IS NOT NULL AND v_base.organization_id IS DISTINCT FROM NEW.organization_id THEN
--       RAISE EXCEPTION 'A unidade base "%" pertence a outra organização', v_base.code USING ERRCODE = 'check_violation';
--     END IF;
--     IF EXISTS (SELECT 1 FROM public.uom c WHERE c.base_uom_id = NEW.id AND c.id <> NEW.id) THEN
--       RAISE EXCEPTION 'A unidade "%" é base de outras embalagens — não pode passar a ser embalagem', NEW.code
--         USING ERRCODE = 'check_violation';
--     END IF;
--   END IF;
--
--   IF TG_OP = 'UPDATE'
--      AND (NEW.base_uom_id IS DISTINCT FROM OLD.base_uom_id
--           OR NEW.conversion_factor IS DISTINCT FROM OLD.conversion_factor)
--      AND (   EXISTS (SELECT 1 FROM public.item_suppliers WHERE uom_id = OLD.id)
--           OR EXISTS (SELECT 1 FROM public.products WHERE uom_id = OLD.id)
--           OR public.fn_uom_is_used_in_lines(OLD.id)) THEN
--     RAISE EXCEPTION 'A unidade "%" já está em uso — a base e o fator não podem mudar. Crie uma nova unidade.', OLD.code
--       USING ERRCODE = 'check_violation';
--   END IF;
--
--   RETURN NEW;
-- END;
-- $function$;
--
-- DROP TRIGGER IF EXISTS trg_products_validate_sale_uom ON public.products;
-- DROP FUNCTION IF EXISTS public.fn_products_validate_sale_uom();
-- DROP INDEX IF EXISTS public.idx_products_sale_uom_id;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS sale_uom_id;
-- -- As uom criadas por fn_uom_get_or_create_pack (código PK<n>...) ficam; só
-- -- se apagam se não estiverem em uso (item_suppliers, linhas).
