-- Catálogo: fornecedores reais a partir do texto livre products.fornecedor_livre (só dados). Base RH (uetjghdkwbywbftedtth).
-- Sem tabelas, colunas nem funções novas/alteradas.
--
-- Organização Nike (b6ffce4f-f630-4933-833a-008649757a33): os produtos do Catálogo (tipo_catalogo 'produto'/'consumivel', não apagados)
-- só têm o fornecedor em texto livre. Decisão do utilizador (29/10/2026):
--   1. Um fornecedor por nome distinto nessa organização (reutiliza um não apagado com o mesmo nome, sem maiúsculas/espaços nas pontas).
--      "Anlorbel" junta-se a "Anlorbel - Com. de Mat. de Construção e Decoração, SA" (um só fornecedor, com o nome longo).
--      Ficam de fora "A definir por obra" e "Entidade inspetora de gás" (sem fornecedor; produtos intactos).
--      Sem NIF/email/morada; ativo; code NULL — o mesmo insert do formulário de Fornecedores (Suppliers.tsx: organization_id, name,
--      is_active, created_by).
--   2. Por produto com esse fornecedor_livre: item_suppliers como o ItemSuppliersTable (item_type 'product', uom_id NULL = unidade do
--      produto, created_by) + preco_data como o rpc_catalog_link quando grava preço. purchase_price = custo ATUAL do produto (linha
--      purchase mais recente: valid_from DESC NULLS LAST, created_at DESC; coalesce(preco_exato, price) arredondado a 2 casas), na
--      moeda dessa linha; supplier_sku = products.sku; is_active; is_preferred = true se o produto ainda não tiver preferencial
--      (fn_item_suppliers_sync_preferred acerta products.supplier_id). Salta produtos que já tenham ligação não apagada a esse fornecedor.
--      Não chama fn_apply_product_cost_from_supplier: product_prices não muda. Sem pedidos de alteração de preço nem notificações
--      (nenhum gatilho de INSERT em item_suppliers os cria; o histórico de preço só corre em UPDATE).
--   3. products.fornecedor_livre fica como está.
-- Autor (created_by e contexto de auditoria): quem criou os produtos do Catálogo dessa organização.
-- Idempotente; não faz nada se a organização não existir.

SET lock_timeout = '5s';

DO $mig$
DECLARE
  c_org   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_anl   constant text := 'Anlorbel - Com. de Mat. de Construção e Decoração, SA';
  v_actor uuid;
  v_sup   int;
  v_lnk   int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c_org) THEN
    RAISE NOTICE 'catalogo_fornecedores_reais: organização % não existe — nada a fazer', c_org;
    RETURN;
  END IF;

  SELECT p.created_by INTO v_actor
  FROM public.products p
  JOIN public.anew_users u ON u.id = p.created_by
  WHERE p.organization_id = c_org AND p.fornecedor_livre IS NOT NULL
  GROUP BY p.created_by
  ORDER BY count(*) DESC, p.created_by
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE NOTICE 'catalogo_fornecedores_reais: sem produtos com fornecedor em texto livre — nada a fazer';
    RETURN;
  END IF;

  PERFORM set_config('app.audit_user_id', v_actor::text, true);
  PERFORM set_config('app.audit_source', 'migration:catalogo_fornecedores_reais', true);

  DROP TABLE IF EXISTS pg_temp._cfr_prod, pg_temp._cfr_map;
  CREATE TEMP TABLE _cfr_prod ON COMMIT DROP AS
  SELECT p.id AS product_id, p.sku,
         CASE WHEN btrim(p.fornecedor_livre) = 'Anlorbel' THEN c_anl ELSE btrim(p.fornecedor_livre) END AS sup_name
  FROM public.products p
  WHERE p.organization_id = c_org
    AND p.tipo_catalogo IN ('produto', 'consumivel')
    AND COALESCE(p.is_deleted, false) = false
    AND p.deleted_at IS NULL
    AND NULLIF(btrim(p.fornecedor_livre), '') IS NOT NULL
    AND btrim(p.fornecedor_livre) NOT IN ('A definir por obra', 'Entidade inspetora de gás');

  -- 1. Fornecedores (um por nome; reutiliza o existente)
  INSERT INTO public.suppliers (organization_id, name, is_active, created_by)
  SELECT c_org, n.sup_name, true, v_actor
  FROM (SELECT DISTINCT sup_name FROM _cfr_prod) n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL
      AND lower(btrim(s.name)) = lower(n.sup_name)
  )
  ORDER BY n.sup_name;
  GET DIAGNOSTICS v_sup = ROW_COUNT;

  CREATE TEMP TABLE _cfr_map ON COMMIT DROP AS
  SELECT DISTINCT ON (n.sup_name) n.sup_name, s.id AS supplier_id
  FROM (SELECT DISTINCT sup_name FROM _cfr_prod) n
  JOIN public.suppliers s
    ON s.organization_id = c_org AND s.deleted_at IS NULL AND lower(btrim(s.name)) = lower(n.sup_name)
  ORDER BY n.sup_name, s.created_at, s.id;

  -- 2. Ligações produto ↔ fornecedor com o custo atual do produto
  INSERT INTO public.item_suppliers (
    organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
    is_preferred, is_active, created_by, preco_data
  )
  SELECT c_org, 'product', cp.product_id, m.supplier_id, NULL, cp.sku,
         round(COALESCE(pp.preco_exato, pp.price), 2),
         COALESCE(pp.currency::text, 'EUR'),
         NOT EXISTS (SELECT 1 FROM public.item_suppliers x
                     WHERE x.product_id = cp.product_id AND x.is_preferred AND x.deleted_at IS NULL),
         true, v_actor,
         CASE WHEN pp.id IS NOT NULL THEN current_date END
  FROM _cfr_prod cp
  JOIN _cfr_map m ON m.sup_name = cp.sup_name
  LEFT JOIN LATERAL (
    SELECT r.id, r.price, r.preco_exato, r.currency
    FROM public.product_prices r
    WHERE r.product_id = cp.product_id AND r.price_type = 'purchase'
    ORDER BY r.valid_from DESC NULLS LAST, r.created_at DESC
    LIMIT 1
  ) pp ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.item_suppliers x
    WHERE x.product_id = cp.product_id AND x.supplier_id = m.supplier_id AND x.deleted_at IS NULL
  );
  GET DIAGNOSTICS v_lnk = ROW_COUNT;

  RAISE NOTICE 'catalogo_fornecedores_reais: % fornecedores criados, % ligações criadas', v_sup, v_lnk;
END
$mig$;
