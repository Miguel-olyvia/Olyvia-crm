-- Fase 5.0A do plano de inventário (plano-fornecedores-multi-stock-execucao.md,
-- secção "Fase 5.0 — Venda a stock fixo"): fundação de dados apenas. Esta
-- migration NÃO liga nada às triggers de Contratos/Propostas — isso é a
-- Fase 5.0B (assinatura de Contrato) e 5.0C (aceitação de Proposta), ainda
-- por implementar. Sem esta ligação, nada aqui muda o comportamento de
-- nenhum fluxo hoje em produção:
--   · products.manages_stock nasce com default false — nenhum produto
--     existente passa a participar na baixa de stock.
--   · organization_inventory_settings é uma tabela nova, vazia, sem leitor.
--   · stock_movements ganha 2 tipos de movimento novos e 2 colunas novas,
--     mas nada no sistema hoje gera 'venda'/'estorno_venda'.
--   · rpc_register_sale_stock_movement é uma função nova, sem chamador (nem
--     frontend, nem trigger) até à Fase 5.0B/5.0C.
--
-- O que esta migration faz
-- --------------------------
--   1. products.manages_stock boolean NOT NULL DEFAULT false — granularidade
--      por produto (decisão de negócio 1 do plano): só produtos marcados
--      assim participam na baixa automática; todos os outros continuam
--      100% manuais/informativos, como hoje. rpc_create_product/
--      rpc_update_product passam a aceitar p_manages_stock boolean DEFAULT
--      false, seguindo exatamente o padrão já usado por p_is_sellable/
--      p_is_purchasable (20260817010000) — parâmetro novo acrescentado no
--      FIM da lista de argumentos com DEFAULT, o que faz de
--      CREATE OR REPLACE FUNCTION uma verdadeira substituição da função
--      existente (mesmo OID, grants preservados), não uma nova sobrecarga
--      (ver documentação do Postgres: "you can add new arguments to the end,
--      as long as they have default values").
--
--   2. organization_inventory_settings (tabela nova) — momento configurável
--      por organização (decisão de negócio 2 do plano): por omissão ao
--      assinar o Contrato ('contract_signed'), alternativa ao aceitar a
--      Proposta ('proposal_accepted'). Padrão "1 tabela pequena por assunto
--      de definições por organização" (mesmo espírito de
--      organization_smtp_settings, embora aqui sem tabela satélite --- é
--      literalmente 1 linha por organização, organization_id como PK).
--      RLS reutiliza inventory.view/inventory.edit — os mesmos códigos que já
--      protegem stocks/stock_movements desde a Fase 4A, sem permissão nova
--      (YAGNI). RPC dedicado rpc_upsert_inventory_settings faz o upsert.
--
--   3. stock_movements: 2 movement_type novos ('venda', 'estorno_venda') +
--      2 colunas novas (sale_source_type, sale_source_id) — usadas para
--      idempotência (uma linha de orçamento só gera 1 movimento de venda,
--      nunca duplicado) e para localizar, mais tarde (Fase 5.0B trigger de
--      cancelamento de Contrato), os movimentos a reverter por
--      'estorno_venda'. document_type='venda' NÃO precisa de alteração —
--      já existia no CHECK original (20261113260000, linha do
--      document_type), nunca tinha sido usado até agora. sale_source_id
--      fica SEM foreign key: pode apontar para client_contracts.id OU
--      proposals.id consoante sale_source_type (polimórfico) — uma FK
--      rígida para uma única tabela não seria válida para o outro caso; o
--      índice parcial (WHERE sale_source_id IS NOT NULL) já cobre a
--      consulta "todas as vendas por origem" sem precisar de integridade
--      referencial ao nível da BD.
--
--   4. fn_stock_movements_apply() — alteração cirúrgica: hoje rejeita
--      SEMPRE saldo negativo (RAISE EXCEPTION stock_insuficiente), quer não
--      exista linha prévia em stocks (NOT FOUND + decremento), quer o
--      decremento leve o saldo abaixo de zero. Passa a ter DUAS exceções,
--      ambas restritas a NEW.movement_type = 'venda':
--        a. NOT FOUND (sem linha prévia em stocks para este par
--           produto/armazém) deixa de rejeitar — trata como current_qty=0 e
--           segue para o cálculo do novo saldo.
--        b. v_new_qty < 0 deixa de rejeitar — o saldo fica negativo e o
--           movimento é gravado na mesma.
--      Nenhum outro tipo de movimento muda de comportamento — incluindo
--      'estorno_venda', que é sempre incremento (adicionado à lista
--      v_is_increment) e por definição nunca ficaria negativo, por isso não
--      precisa de exceção nenhuma nos dois pontos acima. 'saida'/
--      'ajuste_negativo'/'transferencia_saida'/'devolucao_fornecedor'/
--      'quebra' continuam a bloquear negativo exatamente como antes — é
--      isso que o teste 5 desta migration confirma.
--
--   5. rpc_register_sale_stock_movement — RPC novo, motor do movimento de
--      venda. Idempotente por (sale_source_type, sale_source_id,
--      reference_id=quote_line_id, movement_type='venda'): uma segunda
--      chamada com os mesmos 3 valores é ignorada ({skipped: true}), nunca
--      duplica o movimento — necessário porque a Fase 5.0B/5.0C vai chamar
--      este RPC a partir de triggers que podem, em teoria, disparar mais do
--      que uma vez para o mesmo evento de negócio (ex. um UPDATE que toca
--      noutras colunas além de status).
--      NÃO É CHAMÁVEL PELO FRONTEND NESTA FASE: só a Fase 5.0B/5.0C (ainda
--      por implementar) vai invocar este RPC, a partir de triggers
--      SECURITY DEFINER em client_contracts/propostas. Por isso:
--        · REVOKE ALL ... FROM PUBLIC + GRANT ... TO service_role apenas —
--          NÃO a authenticated. Não há caminho do browser para este RPC
--          hoje; abrir a authenticated seria expor uma escrita de stock sem
--          nenhuma validação de permissão de utilizador (propositadamente
--          omitida aqui, ver a seguir) a qualquer sessão autenticada.
--        · Sem check de permissão de utilizador (has_anew_permission) — o
--          chamador não é uma sessão de staff, é uma trigger interna; a
--          autorização de "quem pode assinar este contrato/aceitar esta
--          proposta" já foi validada a montante, no RPC/edge function que
--          disparou a trigger.
--      DECISÃO NÃO COBERTA EXPLICITAMENTE PELO PEDIDO — resolução de
--      created_by: a assinatura dada não inclui p_created_by, e o chamador
--      (trigger da Fase 5.0B/5.0C) pode correr numa sessão sem staff
--      presente (ex. cliente assina via portal, client-portal-action usa a
--      service_role key e não tem auth.uid() de um anew_user). Résolução:
--      current_business_user_id() primeiro (cobre o caso "staff assina no
--      admin"); se NULL, cai para o created_by do próprio orçamento
--      (quotes.created_by via quote_lines.quote_id) — mesmo padrão de
--      fallback já usado por client-portal-action/index.ts para ações que
--      chegam sem staff presente (ex. linha 379/684 desse ficheiro:
--      "created_by: quote.created_by"). quotes.created_by é NOT NULL, por
--      isso este fallback está sempre disponível quando p_quote_line_id é
--      válido.
--
-- Prerequisitos: 20260615130000 (products, warehouses, has_anew_permission,
-- get_user_visible_org_ids, current_business_user_id, quotes/quote_lines),
-- 20260625010000 (fn_generic_entity_audit, fn_manual_audit_log), 20260817010000
-- (rpc_create_product/rpc_update_product, padrão p_is_sellable a replicar),
-- 20261113260000 (stock_movements, fn_stock_movements_apply).


-- ============================================================
-- 1. products.manages_stock
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN manages_stock boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.manages_stock IS
  'Fase 5.0A (plano-fornecedores-multi-stock-execucao.md, secção "Venda a stock '
  'fixo"): quando true, este produto participa na baixa automática de stock ao '
  'vender (Contrato assinado ou Proposta aceite, conforme '
  'organization_inventory_settings.stock_deduction_trigger — mecanismo ainda por '
  'ligar, Fase 5.0B/5.0C). false por omissão — nenhuma mudança de comportamento '
  'para produtos existentes; todos continuam 100% manuais/informativos.';


-- ============================================================
-- 2a. rpc_create_product — CREATE OR REPLACE com p_manages_stock no fim da
--     lista de argumentos (mesmo padrão de p_is_sellable/p_is_purchasable).
--     Corpo idêntico a 20260817010000 exceto os pontos assinalados
--     "NOVO (20261115040000)".
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_product(
  p_sku              text,
  p_name             text,
  p_status           text,
  p_is_sellable      boolean,
  p_is_purchasable   boolean,
  p_category_id      uuid,
  p_subcategory_id   uuid,
  p_primary_org_id   uuid,
  p_uom_id           uuid,
  p_description      text,
  p_barcode          text,
  p_brand_id         uuid,
  p_supplier_id      uuid,
  p_all_org_ids      uuid[],
  p_prices           jsonb,
  p_attribute_values jsonb,
  p_manages_stock    boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_org         uuid;
  v_unique_orgs uuid[];
  v_product     public.products;
  v_price       jsonb;
  v_attr        jsonb;
  v_diff        jsonb;
  v_price_new   jsonb := '[]'::jsonb;
  v_attr_new    jsonb := '[]'::jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Build the unique org set: {primaryOrgId} ∪ p_all_org_ids (FE's Set) ───
  -- Preserve insertion order: primary first, then each new id in first-seen order.
  WITH combined AS (
    SELECT p_primary_org_id AS o, 0 AS ord WHERE p_primary_org_id IS NOT NULL
    UNION ALL
    SELECT o, ord
    FROM unnest(COALESCE(p_all_org_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(o, ord)
    WHERE o IS NOT NULL
  ),
  dedup AS (
    SELECT o, min(ord) AS ord FROM combined GROUP BY o
  )
  SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
  INTO   v_unique_orgs
  FROM   dedup;

  -- ── Authorization parity with products_insert RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_primary_org_id IS NULL
       OR NOT (p_primary_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_unique_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the product (FE productData + conditional fields + supplier_id) ─
  -- The FE only sets description/barcode when truthy and brand_id when present;
  -- '' → NULL here is equivalent to the key being absent for these nullable columns.
  INSERT INTO public.products
    (sku, name, status, is_active, is_sellable, is_purchasable,
     category_id, subcategory_id, organization_id, uom_id,
     description, barcode, brand_id, supplier_id, created_by,
     manages_stock)
  VALUES
    (p_sku,
     p_name,
     p_status::public.product_status,
     true,
     COALESCE(p_is_sellable, false),
     COALESCE(p_is_purchasable, false),
     p_category_id,
     p_subcategory_id,
     p_primary_org_id,
     p_uom_id,
     nullif(p_description, ''),
     nullif(p_barcode, ''),
     p_brand_id,
     p_supplier_id,
     v_actor,
     COALESCE(p_manages_stock, false))
  RETURNING * INTO v_product;

  -- ── INSERT org associations for the full unique set ───────────────────────
  FOREACH v_org IN ARRAY v_unique_orgs LOOP
    INSERT INTO public.product_organizations (product_id, organization_id, created_by)
    VALUES (v_product.id, v_org, v_actor)
    ON CONFLICT (product_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── INSERT prices (every provided entry is fresh on create) ───────────────
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'array' THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
      INSERT INTO public.product_prices
        (product_id, price_type, price, currency, vat_rate, created_by)
      VALUES
        (v_product.id,
         (v_price ->> 'price_type')::public.price_type,
         (v_price ->> 'price')::numeric,
         (v_price ->> 'currency')::public.currency_code,
         (v_price ->> 'vat_rate')::numeric,
         v_actor);
      v_price_new := v_price_new || jsonb_build_object(
        'price_type', v_price ->> 'price_type',
        'price',      v_price -> 'price',
        'currency',   v_price ->> 'currency',
        'vat_rate',   v_price -> 'vat_rate'
      );
    END LOOP;
  END IF;

  -- ── INSERT attribute values (every provided entry is fresh on create) ─────
  IF p_attribute_values IS NOT NULL AND jsonb_typeof(p_attribute_values) = 'array' THEN
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attribute_values) LOOP
      INSERT INTO public.product_attribute_values
        (product_id, attribute_id, value_text, value_number, value_bool)
      VALUES
        (v_product.id,
         (v_attr ->> 'attribute_id')::uuid,
         CASE WHEN v_attr ? 'value_text'   THEN v_attr ->> 'value_text' END,
         CASE WHEN v_attr ? 'value_number' THEN (v_attr ->> 'value_number')::numeric END,
         CASE WHEN v_attr ? 'value_bool'   THEN (v_attr ->> 'value_bool')::boolean END);
      v_attr_new := v_attr_new || v_attr;
    END LOOP;
  END IF;

  -- ── Combined diff: full snapshot of the created product + child sets ──────
  v_diff := jsonb_build_object(
    'products', jsonb_build_object(
      'sku',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.sku)),
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.name)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.status)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_active)),
      'is_sellable',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_sellable)),
      'is_purchasable',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_purchasable)),
      'category_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.category_id)),
      'subcategory_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.subcategory_id)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.organization_id)),
      'uom_id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.uom_id)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.description)),
      'barcode',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.barcode)),
      'brand_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.brand_id)),
      'supplier_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.supplier_id)),
      'manages_stock',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.manages_stock))
    ),
    'product_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_unique_orgs))
    ),
    'product_prices', jsonb_build_object(
      'prices', jsonb_build_object('old', NULL, 'new', v_price_new)
    ),
    'product_attribute_values', jsonb_build_object(
      'values', jsonb_build_object('old', NULL, 'new', v_attr_new)
    )
  );

  PERFORM public.fn_manual_audit_log(
    'products', v_product.id, v_product.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_product.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_product(
  text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, jsonb, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_product(
  text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, jsonb, boolean
) TO authenticated;


-- ============================================================
-- 2b. rpc_update_product — mesma lógica: p_manages_stock no fim, DEFAULT
--     false. Corpo idêntico a 20260817010000 exceto os pontos assinalados
--     "NOVO (20261115040000)".
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_product(
  p_id               uuid,
  p_active_org_id    uuid,
  p_sku              text,
  p_name             text,
  p_status           text,
  p_is_sellable      boolean,
  p_is_purchasable   boolean,
  p_category_id      uuid,
  p_subcategory_id   uuid,
  p_primary_org_id   uuid,
  p_uom_id           uuid,
  p_description      text,
  p_barcode          text,
  p_brand_id         uuid,
  p_supplier_id      uuid,
  p_all_org_ids      uuid[],
  p_prices           jsonb,
  p_attribute_ids    uuid[],
  p_attribute_values jsonb,
  p_manages_stock    boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_before       public.products;
  v_product      public.products;
  v_org          uuid;
  v_unique_orgs  uuid[];
  v_price        jsonb;
  v_attr         jsonb;
  v_existing_id  uuid;
  v_attr_ids     uuid[];
  v_prod_diff    jsonb;
  v_diff         jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id
    AND organization_id = p_active_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Build the unique org set (same rule as create) ────────────────────────
  WITH combined AS (
    SELECT p_primary_org_id AS o, 0 AS ord WHERE p_primary_org_id IS NOT NULL
    UNION ALL
    SELECT o, ord
    FROM unnest(COALESCE(p_all_org_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(o, ord)
    WHERE o IS NOT NULL
  ),
  dedup AS (
    SELECT o, min(ord) AS ord FROM combined GROUP BY o
  )
  SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
  INTO   v_unique_orgs
  FROM   dedup;

  v_attr_ids := COALESCE(p_attribute_ids, ARRAY[]::uuid[]);

  -- ── Authorization parity with products_update RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Produto fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF p_primary_org_id IS NULL
       OR NOT (p_primary_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_unique_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── UPDATE the product (FE main-fields UPDATE + folded supplier_id UPDATE) ─
  UPDATE public.products
  SET sku             = p_sku,
      name            = p_name,
      status          = p_status::public.product_status,
      is_active       = true,
      is_sellable     = COALESCE(p_is_sellable, false),
      is_purchasable  = COALESCE(p_is_purchasable, false),
      category_id     = p_category_id,
      subcategory_id  = p_subcategory_id,
      organization_id = p_primary_org_id,
      uom_id          = p_uom_id,
      description     = nullif(p_description, ''),
      barcode         = nullif(p_barcode, ''),
      brand_id        = p_brand_id,
      supplier_id     = p_supplier_id,
      manages_stock   = COALESCE(p_manages_stock, false)
  WHERE id = p_id
    AND organization_id = p_active_org_id
  RETURNING * INTO v_product;

  -- ── Rewrite org associations: delete the active company row, then insert set ──
  -- Mirrors the FE: .delete().eq(product_id).eq(organization_id, activeCompany.id)
  -- followed by insert of the full unique set.
  -- INTENTIONAL BEHAVIOUR CHANGE (see 20260817010000 header): ON CONFLICT DO NOTHING
  -- makes the insert idempotent for orgs already associated (other than the active
  -- company, which was just deleted).
  DELETE FROM public.product_organizations
  WHERE product_id = p_id
    AND organization_id = p_active_org_id;

  FOREACH v_org IN ARRAY v_unique_orgs LOOP
    INSERT INTO public.product_organizations (product_id, organization_id, created_by)
    VALUES (p_id, v_org, v_actor)
    ON CONFLICT (product_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── Upsert prices by (product_id, price_type) — mirrors FE maybeSingle then up/insert ──
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'array' THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
      SELECT id INTO v_existing_id
      FROM public.product_prices
      WHERE product_id = p_id
        AND price_type = (v_price ->> 'price_type')::public.price_type
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.product_prices
        SET price      = (v_price ->> 'price')::numeric,
            currency   = (v_price ->> 'currency')::public.currency_code,
            vat_rate   = (v_price ->> 'vat_rate')::numeric,
            created_by = v_actor
        WHERE id = v_existing_id;
      ELSE
        INSERT INTO public.product_prices
          (product_id, price_type, price, currency, vat_rate, created_by)
        VALUES
          (p_id,
           (v_price ->> 'price_type')::public.price_type,
           (v_price ->> 'price')::numeric,
           (v_price ->> 'currency')::public.currency_code,
           (v_price ->> 'vat_rate')::numeric,
           v_actor);
      END IF;
      v_existing_id := NULL;
    END LOOP;
  END IF;

  -- ── Reconcile attribute values ────────────────────────────────────────────
  DELETE FROM public.product_attribute_values
  WHERE product_id = p_id
    AND NOT (attribute_id = ANY (v_attr_ids));

  IF p_attribute_values IS NOT NULL AND jsonb_typeof(p_attribute_values) = 'array' THEN
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attribute_values) LOOP
      SELECT id INTO v_existing_id
      FROM public.product_attribute_values
      WHERE product_id = p_id
        AND attribute_id = (v_attr ->> 'attribute_id')::uuid
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.product_attribute_values AS pav
        SET value_text   = CASE WHEN v_attr ? 'value_text'
                                THEN v_attr ->> 'value_text'
                                ELSE pav.value_text END,
            value_number = CASE WHEN v_attr ? 'value_number'
                                THEN (v_attr ->> 'value_number')::numeric
                                ELSE pav.value_number END,
            value_bool   = CASE WHEN v_attr ? 'value_bool'
                                THEN (v_attr ->> 'value_bool')::boolean
                                ELSE pav.value_bool END
        WHERE pav.id = v_existing_id;
      ELSE
        INSERT INTO public.product_attribute_values
          (product_id, attribute_id, value_text, value_number, value_bool)
        VALUES
          (p_id,
           (v_attr ->> 'attribute_id')::uuid,
           CASE WHEN v_attr ? 'value_text'   THEN v_attr ->> 'value_text' END,
           CASE WHEN v_attr ? 'value_number' THEN (v_attr ->> 'value_number')::numeric END,
           CASE WHEN v_attr ? 'value_bool'   THEN (v_attr ->> 'value_bool')::boolean END);
      END IF;
      v_existing_id := NULL;
    END LOOP;
  END IF;

  -- ── Build the products-table diff (only changed columns) ──────────────────
  v_prod_diff := '{}'::jsonb;
  IF v_before.sku IS DISTINCT FROM v_product.sku THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('sku',
      jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_product.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_product.name THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_product.name)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_product.status THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_product.status)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_product.is_active THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_product.is_active)));
  END IF;
  IF v_before.is_sellable IS DISTINCT FROM v_product.is_sellable THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_sellable',
      jsonb_build_object('old', to_jsonb(v_before.is_sellable), 'new', to_jsonb(v_product.is_sellable)));
  END IF;
  IF v_before.is_purchasable IS DISTINCT FROM v_product.is_purchasable THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_purchasable',
      jsonb_build_object('old', to_jsonb(v_before.is_purchasable), 'new', to_jsonb(v_product.is_purchasable)));
  END IF;
  IF v_before.category_id IS DISTINCT FROM v_product.category_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('category_id',
      jsonb_build_object('old', to_jsonb(v_before.category_id), 'new', to_jsonb(v_product.category_id)));
  END IF;
  IF v_before.subcategory_id IS DISTINCT FROM v_product.subcategory_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('subcategory_id',
      jsonb_build_object('old', to_jsonb(v_before.subcategory_id), 'new', to_jsonb(v_product.subcategory_id)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_product.organization_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_product.organization_id)));
  END IF;
  IF v_before.uom_id IS DISTINCT FROM v_product.uom_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('uom_id',
      jsonb_build_object('old', to_jsonb(v_before.uom_id), 'new', to_jsonb(v_product.uom_id)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_product.description THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_product.description)));
  END IF;
  IF v_before.barcode IS DISTINCT FROM v_product.barcode THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('barcode',
      jsonb_build_object('old', to_jsonb(v_before.barcode), 'new', to_jsonb(v_product.barcode)));
  END IF;
  IF v_before.brand_id IS DISTINCT FROM v_product.brand_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('brand_id',
      jsonb_build_object('old', to_jsonb(v_before.brand_id), 'new', to_jsonb(v_product.brand_id)));
  END IF;
  IF v_before.supplier_id IS DISTINCT FROM v_product.supplier_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('supplier_id',
      jsonb_build_object('old', to_jsonb(v_before.supplier_id), 'new', to_jsonb(v_product.supplier_id)));
  END IF;
  -- NOVO (20261115040000)
  IF v_before.manages_stock IS DISTINCT FROM v_product.manages_stock THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('manages_stock',
      jsonb_build_object('old', to_jsonb(v_before.manages_stock), 'new', to_jsonb(v_product.manages_stock)));
  END IF;

  -- ── Combined diff across all tables touched ───────────────────────────────
  v_diff := '{}'::jsonb;
  IF v_prod_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('products', v_prod_diff);
  END IF;
  v_diff := v_diff || jsonb_build_object(
    'product_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_unique_orgs))
    ),
    'product_prices', jsonb_build_object(
      'prices', jsonb_build_object('old', NULL, 'new', COALESCE(p_prices, '[]'::jsonb))
    ),
    'product_attribute_values', jsonb_build_object(
      'values', jsonb_build_object('old', NULL, 'new', COALESCE(p_attribute_values, '[]'::jsonb))
    )
  );

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'products', p_id, v_product.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_product.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_product(
  uuid, uuid, text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, uuid[], jsonb, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_product(
  uuid, uuid, text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, uuid[], jsonb, boolean
) TO authenticated;


-- ============================================================
-- 3. organization_inventory_settings
-- ============================================================

CREATE TABLE public.organization_inventory_settings (
    organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id),
    stock_deduction_trigger text NOT NULL DEFAULT 'contract_signed'
        CHECK (stock_deduction_trigger IN ('contract_signed','proposal_accepted')),
    default_warehouse_id uuid REFERENCES public.warehouses(id),
    created_by uuid NOT NULL REFERENCES public.anew_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_inventory_settings IS
  'Fase 5.0A: definições de inventário por organização, 1 linha por organização. '
  'stock_deduction_trigger controla QUANDO um produto com manages_stock=true baixa '
  'stock (Contrato assinado ou Proposta aceite — mecanismo ainda por ligar, Fase '
  '5.0B/5.0C). default_warehouse_id é o armazém usado para gerar o movimento de '
  'venda quando a organização não tiver exatamente 1 armazém ativo (nesse caso '
  'único, a Fase 5.0B/5.0C usa-o automaticamente sem precisar desta definição).';
COMMENT ON COLUMN public.organization_inventory_settings.default_warehouse_id IS
  'Se NULL e a organização só tiver 1 armazém ativo, esse é usado automaticamente '
  '(lógica na Fase 5.0B/5.0C, não aqui). Se NULL e houver vários armazéns ativos '
  'sem default definido, o movimento de venda não é gerado para esse produto — '
  'nunca se inventa um armazém.';

CREATE TRIGGER update_organization_inventory_settings_updated_at
  BEFORE UPDATE ON public.organization_inventory_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger — mesmo padrão (Strategy A) de item_suppliers. Nota honesta:
-- fn_generic_entity_audit() resolve entity_id via NEW.entity_id ou, em
-- alternativa, NEW.id (20260625010000) — esta tabela não tem nenhuma das
-- duas colunas (organization_id É a PK). v_entity_id fica NULL; como
-- entity_audit_log.entity_id é NOT NULL, o INSERT de auditoria falha e é
-- engolido pelo bloco EXCEPTION WHEN OTHERS da própria função (nunca bloqueia
-- o INSERT/UPDATE original). Resultado prático: esta tabela, tal como
-- organization_ai_credits (20261112390000, mesmo formato de PK), não produz
-- linhas em entity_audit_log — comportamento existente noutras tabelas do
-- projeto com este mesmo formato de chave, não uma regressão introduzida
-- aqui. Mantido mesmo assim (trigger instalado) por seguir literalmente o
-- padrão pedido; se o histórico de alterações desta tabela vier a ser
-- necessário, o RPC rpc_upsert_inventory_settings é o único caminho de
-- escrita e pode ganhar um fn_manual_audit_log dedicado nessa altura.
CREATE TRIGGER trg_audit_organization_inventory_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_inventory_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

ALTER TABLE public.organization_inventory_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_inventory_settings_select_policy ON public.organization_inventory_settings
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'inventory.view')
  );

CREATE POLICY organization_inventory_settings_insert_policy ON public.organization_inventory_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'inventory.edit')
  );

CREATE POLICY organization_inventory_settings_update_policy ON public.organization_inventory_settings
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'inventory.edit')
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'inventory.edit')
  );

-- Sem DELETE de propósito: "desligar" faz-se com UPDATE para os valores por
-- omissão (stock_deduction_trigger='contract_signed', default_warehouse_id=NULL),
-- nunca apagando a linha. RLS sem policy de DELETE nega por omissão.

-- ============================================================
-- 3b. rpc_upsert_inventory_settings — upsert dedicado
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_upsert_inventory_settings(
    p_organization_id         uuid,
    p_stock_deduction_trigger text,
    p_default_warehouse_id    uuid
) RETURNS public.organization_inventory_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_row   public.organization_inventory_settings;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar definições de inventário desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_stock_deduction_trigger NOT IN ('contract_signed', 'proposal_accepted') THEN
    RAISE EXCEPTION 'stock_deduction_trigger inválido: %', p_stock_deduction_trigger USING ERRCODE = 'check_violation';
  END IF;

  IF p_default_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_default_warehouse_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.organization_inventory_settings (
    organization_id, stock_deduction_trigger, default_warehouse_id, created_by
  ) VALUES (
    p_organization_id, p_stock_deduction_trigger, p_default_warehouse_id, v_actor
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET stock_deduction_trigger = EXCLUDED.stock_deduction_trigger,
        default_warehouse_id    = EXCLUDED.default_warehouse_id,
        updated_at              = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_upsert_inventory_settings IS
  'Cria ou atualiza (upsert por organization_id) as definições de inventário de '
  'uma organização. Exige inventory.edit + organização em scope. created_by NUNCA '
  'é atualizado num UPDATE — regista sempre quem criou a linha originalmente.';

REVOKE ALL ON FUNCTION public.rpc_upsert_inventory_settings(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_inventory_settings(uuid, text, uuid) TO authenticated;


-- ============================================================
-- 4. stock_movements — 2 movement_type novos + 2 colunas novas
-- ============================================================

-- Encontra e remove o CHECK atual de movement_type sem assumir o nome
-- exato que o Postgres lhe deu automaticamente (era uma constraint de
-- coluna inline em 20261113260000, não nomeada explicitamente).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.stock_movements'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%movement_type%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', v_conname);
  END IF;
END;
$$;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'entrada', 'saida',
    'transferencia_entrada', 'transferencia_saida',
    'ajuste_positivo', 'ajuste_negativo',
    'devolucao_fornecedor', 'quebra',
    'venda', 'estorno_venda'
  ));

-- document_type já aceitava 'venda' desde 20261113260000 (nunca usado até
-- agora) — sem alteração necessária nesse CHECK.

ALTER TABLE public.stock_movements
  ADD COLUMN sale_source_type text CHECK (sale_source_type IN ('contract','proposal')),
  ADD COLUMN sale_source_id uuid;

COMMENT ON COLUMN public.stock_movements.sale_source_type IS
  'Fase 5.0A: só preenchido em movement_type IN (''venda'', ''estorno_venda''). '
  'Indica se a origem da venda foi um Contrato assinado ou uma Proposta aceite '
  '(conforme organization_inventory_settings.stock_deduction_trigger).';
COMMENT ON COLUMN public.stock_movements.sale_source_id IS
  'Fase 5.0A: id de client_contracts ou de proposals, consoante sale_source_type '
  '— sem foreign key rígida de propósito (polimórfico, não há uma única tabela '
  'para apontar). Usado com sale_source_type + reference_id (quote_line_id) para '
  'idempotência em rpc_register_sale_stock_movement e, na Fase 5.0B, para '
  'localizar os movimentos ''venda'' a reverter com ''estorno_venda'' quando um '
  'contrato é cancelado.';

CREATE INDEX idx_stock_movements_sale_source
  ON public.stock_movements (sale_source_type, sale_source_id)
  WHERE sale_source_id IS NOT NULL;


-- ============================================================
-- 5. fn_stock_movements_apply() — alteração cirúrgica: 'venda' nunca é
--    rejeitada por saldo insuficiente (nem por ausência de linha prévia em
--    stocks). Todos os outros tipos continuam a bloquear negativo
--    exatamente como antes. 'estorno_venda' passa a contar como incremento
--    (é sempre +, nunca ficaria negativo por definição).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_stock_movements_apply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_increment boolean;
  v_delta        integer;
  v_current_qty  integer;
  v_current_cost numeric(12,4);
  v_new_qty      integer;
  v_new_cost     numeric(12,4);
BEGIN
  -- NOVO (20261115040000): 'estorno_venda' é sempre incremento (reversão de
  -- uma venda anterior).
  v_is_increment := NEW.movement_type IN ('entrada', 'transferencia_entrada', 'ajuste_positivo', 'estorno_venda');
  v_delta := CASE WHEN v_is_increment THEN NEW.quantity ELSE -NEW.quantity END;

  -- Lock da linha de stocks (se existir) para serializar movimentos
  -- concorrentes sobre o mesmo par produto/armazém.
  SELECT quantity, average_cost INTO v_current_qty, v_current_cost
  FROM public.stocks
  WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- NOVO (20261115040000): 'venda' é a única exceção que pode partir de
    -- saldo inexistente sem ser rejeitada — trata como stock=0 e segue para
    -- o cálculo do novo saldo (que pode ficar negativo, ver abaixo). Todos
    -- os outros tipos de decremento continuam a exigir uma linha prévia em
    -- stocks, exatamente como antes.
    IF NOT v_is_increment AND NEW.movement_type <> 'venda' THEN
      RAISE EXCEPTION 'stock_insuficiente: não existe stock de % no armazém %', NEW.product_id, NEW.warehouse_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_current_qty := 0;
    v_current_cost := NULL;
  END IF;

  v_new_qty := v_current_qty + v_delta;
  -- NOVO (20261115040000): 'venda' nunca é rejeitada por saldo insuficiente —
  -- decisão de negócio confirmada no plano (Fase 5.0): a venda a stock fixo
  -- nunca pode bloquear a aceitação de uma proposta/assinatura de contrato.
  -- Todos os outros tipos de movimento (incluindo 'estorno_venda', que é
  -- sempre incremento e nunca ficaria negativo por definição) continuam a
  -- bloquear saldo negativo exatamente como antes.
  IF v_new_qty < 0 AND NEW.movement_type <> 'venda' THEN
    RAISE EXCEPTION 'stock_insuficiente: saldo atual % é inferior à quantidade pedida %', v_current_qty, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  -- Custo médio ponderado (5.1.1): só recalcula em entradas reais com custo
  -- conhecido. transferencia_entrada preserva o custo médio de origem quando
  -- o chamador não passa unit_cost_at_time (é o mesmo stock a mudar de sítio,
  -- não uma nova compra). 'venda'/'estorno_venda' não recalculam average_cost
  -- (não são eventos de compra) — caem no ELSE e preservam o custo atual.
  IF NEW.movement_type IN ('entrada', 'transferencia_entrada') AND NEW.unit_cost_at_time IS NOT NULL THEN
    v_new_cost := CASE
      WHEN v_current_qty = 0 OR v_current_cost IS NULL THEN NEW.unit_cost_at_time
      ELSE ((v_current_cost * v_current_qty) + (NEW.unit_cost_at_time * NEW.quantity)) / v_new_qty
    END;
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  INSERT INTO public.stocks (product_id, warehouse_id, organization_id, quantity, average_cost, created_by)
  VALUES (NEW.product_id, NEW.warehouse_id, NEW.organization_id, v_new_qty, v_new_cost, NEW.created_by)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET quantity = v_new_qty,
        average_cost = v_new_cost,
        updated_at = now();

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_stock_movements_apply() IS
  'BEFORE INSERT em stock_movements. Única via de escrita em stocks.quantity/'
  'average_cost. Faz SELECT ... FOR UPDATE sobre a linha de stocks '
  'correspondente para serializar movimentos concorrentes; RAISE EXCEPTION '
  '(rollback) se o movimento levaria o saldo abaixo de zero — EXCETO para '
  'movement_type=''venda'' (Fase 5.0A), que pode partir de saldo inexistente e '
  'ir a negativo sem ser rejeitado (decisão de negócio: venda a stock fixo nunca '
  'bloqueia a aceitação de proposta/assinatura de contrato). Nota: se a linha de '
  'stocks encontrada estiver soft-deleted (stocks.deleted_at IS NOT NULL), esta '
  'função ainda assim atualiza-a — unique_product_warehouse não é um índice '
  'parcial por deleted_at, limitação pré-existente da tabela stocks, não '
  'introduzida aqui.';


-- ============================================================
-- 6. rpc_register_sale_stock_movement
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_sale_stock_movement(
    p_product_id       uuid,
    p_warehouse_id     uuid,
    p_quantity         integer,
    p_quote_line_id    uuid,
    p_sale_source_type text,
    p_sale_source_id   uuid,
    p_document_number  text,
    p_unit_cost_at_time numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_movement_id uuid;
  v_balance     integer;
BEGIN
  IF p_sale_source_type NOT IN ('contract', 'proposal') THEN
    RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quote_line_id IS NULL OR p_sale_source_id IS NULL THEN
    RAISE EXCEPTION 'quote_line_id e sale_source_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  IF nullif(trim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'document_number é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotência: uma linha de orçamento só gera 1 movimento de venda por
  --    origem — uma segunda chamada (ex. trigger disparada de novo por um
  --    UPDATE que não devia repetir o efeito) é ignorada, nunca duplica.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE sale_source_type = p_sale_source_type
      AND sale_source_id = p_sale_source_id
      AND reference_id = p_quote_line_id
      AND movement_type = 'venda'
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_registered');
  END IF;

  -- ── Organização: resolvida via produto, fonte única de verdade — não
  --    depende de já existir uma linha em stocks para este par.
  SELECT organization_id INTO v_org FROM public.products WHERE id = p_product_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado ou sem organização associada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- ── created_by: este RPC não é chamado pelo frontend (ver GRANT abaixo),
  --    só por triggers internas da Fase 5.0B/5.0C que podem correr sem
  --    sessão de staff presente (ex. assinatura via portal do cliente).
  --    current_business_user_id() cobre o caso "staff assina no admin"; se
  --    NULL, cai para o criador do próprio orçamento (mesmo padrão de
  --    fallback já usado por client-portal-action/index.ts para ações sem
  --    staff presente). quotes.created_by é NOT NULL, por isso este
  --    fallback está sempre disponível quando p_quote_line_id é válido.
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    SELECT q.created_by INTO v_actor
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.id = p_quote_line_id;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o autor do movimento de venda' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, unit_cost_at_time,
    sale_source_type, sale_source_id, reference_id, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'venda', p_quantity,
    p_document_number, 'venda', p_unit_cost_at_time,
    p_sale_source_type, p_sale_source_id, p_quote_line_id,
    format('Venda registada a partir de %s %s (linha de orçamento %s)',
           p_sale_source_type, p_sale_source_id, p_quote_line_id),
    v_actor
  )
  RETURNING id, balance_after INTO v_movement_id, v_balance;

  RETURN jsonb_build_object(
    'skipped',         false,
    'movement_id',     v_movement_id,
    'balance_after',   v_balance,
    'was_insufficient', v_balance < 0
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_register_sale_stock_movement IS
  'Fase 5.0A: motor do movimento de venda (movement_type=''venda''), nunca '
  'rejeitado por saldo insuficiente (fn_stock_movements_apply trata a exceção). '
  'Idempotente por (sale_source_type, sale_source_id, reference_id=quote_line_id). '
  'NÃO É CHAMÁVEL PELO FRONTEND nesta fase — só GRANT a service_role. Será '
  'invocado pelas triggers da Fase 5.0B (Contrato assinado) e 5.0C (Proposta '
  'aceite), ainda por implementar; até lá esta função não tem nenhum chamador.';

REVOKE ALL ON FUNCTION public.rpc_register_sale_stock_movement(
  uuid, uuid, integer, uuid, text, uuid, text, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_sale_stock_movement(
  uuid, uuid, integer, uuid, text, uuid, text, numeric
) TO service_role;


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration)
-- ============================================================
--
-- 1. products.manages_stock: default false num INSERT direto; rpc_update_product
--    com p_manages_stock=true grava true sem afetar outros campos (sku/name/
--    is_sellable inalterados); rpc_update_product sem passar p_manages_stock
--    (chamador antigo, se algum dia existisse) usaria o DEFAULT false — não
--    aplicável aqui porque a assinatura completa é sempre passada pela FE.
--
-- 2. organization_inventory_settings: rpc_upsert_inventory_settings cria (INSERT)
--    e depois atualiza (UPDATE via ON CONFLICT) a mesma organização; utilizador
--    sem inventory.edit correndo o mesmo RPC deve ser rejeitado
--    (insufficient_privilege) — e um SELECT direto (fora do RPC) sem
--    inventory.view deve devolver 0 linhas (RLS).
--
-- 3. rpc_register_sale_stock_movement chamado 2x com os mesmos
--    sale_source_type/sale_source_id/p_quote_line_id → 1ª chamada cria o
--    movimento, 2ª devolve {skipped: true, reason: 'already_registered'},
--    sem 2ª linha em stock_movements.
--
-- 4. rpc_register_sale_stock_movement para um par produto/armazém SEM
--    nenhuma linha em stocks, pedindo 5 unidades → cria o movimento
--    (movement_type='venda'), stocks.quantity fica -5, resposta com
--    was_insufficient=true — nunca rejeitado.
--
-- 5. rpc_register_stock_entry / rpc_adjust_stock (tipos 'entrada'/
--    'ajuste_negativo', já existentes desde a Fase 4B) continuam a rejeitar
--    saldo negativo com a mensagem stock_insuficiente — confirma que a
--    alteração cirúrgica em fn_stock_movements_apply() não enfraqueceu a
--    validação para nenhum outro tipo de movimento.
--
-- 6. RLS/CHECK: pg_policies confirma 4 policies em organization_inventory_settings
--    (select/insert/update, sem delete); pg_get_constraintdef do CHECK de
--    movement_type em stock_movements confirma os 10 valores (8 antigos + venda
--    + estorno_venda).
