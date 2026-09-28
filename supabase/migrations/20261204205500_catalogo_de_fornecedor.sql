-- ============================================================================
-- Catálogo de um fornecedor (leitura) — por unidade/embalagem
--
-- Cria: public.rpc_supplier_catalog(p_supplier_id uuid)
-- Cria: public.rpc_supplier_catalog_search(p_supplier_id uuid, p_query text, p_limit integer)
--
-- SECURITY INVOKER: corre com o RLS de quem chama — item_suppliers exige
-- products.view + products.view_cost (ou suppliers.view + view_pricing),
-- products exige a organização visível. Nada é exposto que a pessoa não
-- pudesse já ler com SELECTs diretos.
--
-- Uma linha por ligação item_suppliers ativa (não apagada) de PRODUTO. O
-- mesmo produto pode aparecer 2× (ex. à unidade e em PK100). units_per_uom é
-- calculado sem lançar erro (NULL se a ligação tiver unidade incompatível —
-- não deve acontecer, o gatilho trg_item_suppliers_validate_uom impede-o).
--
-- A pesquisa casa (sem distinguir maiúsculas) products.sku, products.barcode,
-- item_suppliers.supplier_sku e products.name. Correspondências exatas de
-- código vêm primeiro (leitor de código de barras / referência colada).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_supplier_catalog(p_supplier_id uuid)
RETURNS TABLE (
  item_supplier_id uuid,
  product_id       uuid,
  product_name     text,
  sku              text,
  barcode          text,
  supplier_sku     text,
  uom_id           uuid,
  uom_code         text,
  units_per_uom    integer,
  product_uom_id   uuid,
  product_uom_code text,
  purchase_price   numeric,
  currency         text,
  moq              numeric,
  lead_time_days   integer,
  is_preferred     boolean,
  is_active        boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    i.id, p.id, p.name, p.sku, p.barcode, i.supplier_sku,
    i.uom_id, u.code,
    CASE
      WHEN i.uom_id IS NULL OR i.uom_id = p.uom_id THEN 1
      WHEN u.base_uom_id IS NULL AND p.uom_id IS NULL THEN 1
      WHEN u.base_uom_id = p.uom_id THEN u.conversion_factor::integer
      ELSE NULL
    END,
    p.uom_id, pu.code,
    i.purchase_price, i.currency, i.moq, i.lead_time_days, i.is_preferred, i.is_active
  FROM public.item_suppliers i
  JOIN public.products p ON p.id = i.product_id
  LEFT JOIN public.uom u  ON u.id  = i.uom_id
  LEFT JOIN public.uom pu ON pu.id = p.uom_id
  WHERE i.supplier_id = p_supplier_id
    AND i.deleted_at IS NULL
    AND i.item_type = 'product'
    AND p.is_deleted = false
  ORDER BY p.name, COALESCE(u.conversion_factor, 1), i.id
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_catalog_search(p_supplier_id uuid, p_query text, p_limit integer DEFAULT 50)
RETURNS TABLE (
  item_supplier_id uuid,
  product_id       uuid,
  product_name     text,
  sku              text,
  barcode          text,
  supplier_sku     text,
  uom_id           uuid,
  uom_code         text,
  units_per_uom    integer,
  product_uom_id   uuid,
  product_uom_code text,
  purchase_price   numeric,
  currency         text,
  moq              numeric,
  lead_time_days   integer,
  is_preferred     boolean,
  is_active        boolean,
  match_rank       integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH q AS (
    SELECT lower(btrim(COALESCE(p_query, ''))) AS term,
           '%' || replace(replace(replace(lower(btrim(COALESCE(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  )
  SELECT c.*,
         CASE
           WHEN lower(c.supplier_sku) = q.term OR lower(c.sku) = q.term OR lower(c.barcode) = q.term THEN 0
           WHEN lower(c.supplier_sku) LIKE q.pat OR lower(c.sku) LIKE q.pat OR lower(c.barcode) LIKE q.pat THEN 1
           ELSE 2
         END AS match_rank
  FROM public.rpc_supplier_catalog(p_supplier_id) c, q
  WHERE q.term <> ''
    AND (   lower(c.supplier_sku) LIKE q.pat
         OR lower(c.sku)          LIKE q.pat
         OR lower(c.barcode)      LIKE q.pat
         OR lower(c.product_name) LIKE q.pat)
  ORDER BY match_rank, c.product_name, c.units_per_uom NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
$function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_catalog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_supplier_catalog_search(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_catalog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_catalog_search(uuid, text, integer) TO authenticated, service_role;

-- ============================================================================
-- REVERSÃO (manual)
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.rpc_supplier_catalog_search(uuid, text, integer);
-- DROP FUNCTION IF EXISTS public.rpc_supplier_catalog(uuid);
