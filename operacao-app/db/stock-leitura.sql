-- ============================================================
-- Operações — stock do CRM, SÓ LEITURA
-- ============================================================
-- Ao criar uma obra a partir do contrato, cada tarefa leva materiais. Este
-- ficheiro diz, para cada produto, quanto há, quanto já está prometido e
-- quanto vem a caminho — com a MESMA conta do ecrã de Stocks do CRM.
--
--   rpc_ops_stock_pesquisar(org, texto, limite)        procurar produtos
--   rpc_ops_stock_sugerir(org, servico, quantidade)    a ficha técnica × qt
--   rpc_ops_stock_disponivel(org, produtos[])          refrescar
--
-- As três devolvem as mesmas colunas de disponibilidade:
--
--   fisico     soma de stocks.quantity da organização (todos os armazéns
--              não apagados) — como o "Total" de Stocks.tsx;
--   reservado  o que as Encomendas de Cliente assinadas já reservaram, pela
--              fila por data de assinatura do CRM: soma de qty_reserved de
--              public.fn_client_order_line_reservations(org, produtos) — a
--              mesma função que rpc_get_product_stock_reservations e a guarda
--              da saída manual (rpc_decrement_stock) usam. Não se copia a
--              conta: chama-se a do CRM, para nunca divergirem;
--   a_chegar   encomendas a fornecedor por receber que vão para STOCK: POs da
--              organização em pending/ordered/partially_received, não
--              apagadas, que NÃO são de Encomenda Cliente (essas vão direto à
--              EC), (quantity − received_quantity) × units_per_uom. Uma
--              linha anulada já tem a quantity descida (anular_resto_linha_po);
--   disponivel fisico − reservado — o "Livre" de Stocks.tsx. NULL quando o
--              produto não gere stock (products.manages_stock = false).
--
-- Regras do módulo:
--   · ZERO escritas, ZERO FKs. Não reserva nada: só lê.
--   · SECURITY DEFINER + search_path fixo; ops_pode(org, 'operations.view')
--     NESSA organização — um técnico de Operações não precisa de
--     inventory.view, mas só vê produtos e stock da organização que pediu.
--   · Instala numa base sem as tabelas do Inventário: tudo o que toca no CRM
--     é SQL dinâmico, e sem as tabelas as funções devolvem vazio. Uma peça
--     opcional em falta (POs, reservas, unidades, partilha de produtos)
--     conta como zero/NULL em vez de rebentar.
--   · Idempotente: só CREATE OR REPLACE.
--
-- Correr depois de seguranca.sql.
-- ============================================================

DO $verificar$
BEGIN
  IF to_regprocedure('public.ops_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.ops_pode — corre primeiro db/seguranca.sql.';
  END IF;
END
$verificar$;


-- ============================================================
-- 1. Auxiliares internas
-- ============================================================

-- A tabela existe e tem estas colunas todas?
CREATE OR REPLACE FUNCTION public.ops_stock_tem(p_tabela text, p_colunas text[])
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT to_regclass('public.' || p_tabela) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM unnest(p_colunas) c(nome)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = to_regclass('public.' || p_tabela)
             AND a.attname = c.nome AND a.attnum > 0 AND NOT a.attisdropped))
$$;

-- O mínimo para haver stock: produtos, linhas de stock e armazéns.
CREATE OR REPLACE FUNCTION public.ops_stock_ha_inventario()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.ops_stock_tem('products',   ARRAY['id','name','sku','organization_id','deleted_at','manages_stock'])
     AND public.ops_stock_tem('stocks',     ARRAY['product_id','warehouse_id','quantity','deleted_at'])
     AND public.ops_stock_tem('warehouses', ARRAY['id','organization_id','deleted_at'])
$$;

-- Os produtos que a organização vê: os seus, e os partilhados com ela
-- (product_organizations), quando essa tabela existe. Devolve uma expressão
-- SQL sobre o alias `p`, com a organização em $1.
CREATE OR REPLACE FUNCTION public.ops_stock_filtro_org()
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN public.ops_stock_tem('product_organizations', ARRAY['product_id','organization_id']) THEN
      '(p.organization_id = $1 OR EXISTS (SELECT 1 FROM public.product_organizations po_'
      || ' WHERE po_.product_id = p.id AND po_.organization_id = $1))'
    ELSE 'p.organization_id = $1'
  END
$$;

-- O cálculo. Interna: só as RPCs abaixo a chamam, depois de verificarem o
-- acesso. Devolve uma linha por produto pedido que exista na organização.
CREATE OR REPLACE FUNCTION public.ops_stock_calcular(p_org uuid, p_produtos uuid[])
RETURNS TABLE (
  produto_id uuid,
  nome       text,
  sku        text,
  unidade    text,
  gere_stock boolean,
  fisico     numeric,
  reservado  numeric,
  a_chegar   numeric,
  disponivel numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_unidade text := 'NULL::text';
  v_join    text := '';
  v_res     text := 'SELECT NULL::uuid AS product_id, 0::numeric AS q WHERE false';
  v_chega   text := 'SELECT NULL::uuid AS product_id, 0::numeric AS q WHERE false';
BEGIN
  IF p_org IS NULL OR p_produtos IS NULL OR cardinality(p_produtos) = 0
     OR NOT public.ops_stock_ha_inventario() THEN
    RETURN;
  END IF;

  IF public.ops_stock_tem('products', ARRAY['uom_id'])
     AND public.ops_stock_tem('uom', ARRAY['id','code']) THEN
    v_unidade := 'u.code::text';
    v_join    := 'LEFT JOIN public.uom u ON u.id = p.uom_id';
  END IF;

  -- Reservas das ECs: a função do CRM, tal e qual.
  IF to_regprocedure('public.fn_client_order_line_reservations(uuid,uuid[])') IS NOT NULL THEN
    v_res := 'SELECT r.product_id, SUM(COALESCE(r.qty_reserved, 0))::numeric AS q
                FROM public.fn_client_order_line_reservations($1, ARRAY(SELECT id FROM prod)) r
               WHERE r.product_id IS NOT NULL
               GROUP BY r.product_id';
  END IF;

  IF public.ops_stock_tem('purchase_orders', ARRAY['id','organization_id','status','deleted_at','source_type'])
     AND public.ops_stock_tem('purchase_order_items', ARRAY['purchase_order_id','product_id','quantity','received_quantity','units_per_uom']) THEN
    v_chega := 'SELECT poi.product_id,
                       SUM(GREATEST(0, poi.quantity - COALESCE(poi.received_quantity, 0))
                           * COALESCE(poi.units_per_uom, 1))::numeric AS q
                  FROM public.purchase_orders po
                  JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
                 WHERE po.organization_id = $1
                   AND po.deleted_at IS NULL
                   AND po.status IN (''pending'', ''ordered'', ''partially_received'')
                   AND po.source_type IS DISTINCT FROM ''contract''
                   AND poi.product_id IN (SELECT id FROM prod)
                 GROUP BY poi.product_id';
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH prod AS (
      SELECT p.id, p.name::text AS nome, NULLIF(p.sku::text, '') AS sku,
             %1$s AS unidade, COALESCE(p.manages_stock, true) AS gere
        FROM public.products p
        %2$s
       WHERE p.id = ANY ($2)
         AND p.deleted_at IS NULL
         AND %3$s
    ),
    fis AS (
      SELECT s.product_id, SUM(s.quantity)::numeric AS q
        FROM public.stocks s
        JOIN public.warehouses w ON w.id = s.warehouse_id
       WHERE w.organization_id = $1
         AND w.deleted_at IS NULL
         AND s.deleted_at IS NULL
         AND s.product_id IN (SELECT id FROM prod)
       GROUP BY s.product_id
    ),
    res   AS (%4$s),
    chega AS (%5$s)
    SELECT pr.id, pr.nome, pr.sku, pr.unidade, pr.gere,
           COALESCE(f.q, 0), COALESCE(r.q, 0), COALESCE(c.q, 0),
           CASE WHEN pr.gere THEN COALESCE(f.q, 0) - COALESCE(r.q, 0) END
      FROM prod pr
      LEFT JOIN fis   f ON f.product_id = pr.id
      LEFT JOIN res   r ON r.product_id = pr.id
      LEFT JOIN chega c ON c.product_id = pr.id
  $q$, v_unidade, v_join, public.ops_stock_filtro_org(), v_res, v_chega)
  USING p_org, p_produtos;
END
$$;

-- Internas: sem EXECUTE para quem chega pela API.
REVOKE ALL ON FUNCTION public.ops_stock_tem(text, text[])         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_stock_ha_inventario()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_stock_filtro_org()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_stock_calcular(uuid, uuid[])    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_stock_calcular(uuid, uuid[]) TO service_role;

-- Quem pergunta tem de ver Operações NESTA organização.
CREATE OR REPLACE FUNCTION public.ops_stock_verificar(p_org uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_org IS NULL OR NOT public.ops_pode(p_org, 'operations.view') THEN
    RAISE EXCEPTION 'Sem acesso ao stock desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.ops_stock_verificar(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. Pesquisar
-- ============================================================
-- Por nome, SKU ou código de barras. Texto vazio devolve os primeiros por
-- ordem alfabética. Limite entre 1 e 50.
CREATE OR REPLACE FUNCTION public.rpc_ops_stock_pesquisar(
  p_org    uuid,
  p_texto  text,
  p_limite int DEFAULT 20
)
RETURNS TABLE (
  produto_id uuid, nome text, sku text, unidade text, gere_stock boolean,
  fisico numeric, reservado numeric, a_chegar numeric, disponivel numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_texto  text := btrim(COALESCE(p_texto, ''));
  v_limite int  := LEAST(GREATEST(COALESCE(p_limite, 20), 1), 50);
  v_padrao text;
  v_barras text := '';
  v_ids    uuid[];
BEGIN
  PERFORM public.ops_stock_verificar(p_org);
  IF NOT public.ops_stock_ha_inventario() THEN
    RETURN;
  END IF;

  -- %, _ e \ escritos pela pessoa são texto, não padrões.
  v_padrao := '%' || replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF public.ops_stock_tem('products', ARRAY['barcode']) THEN
    v_barras := ' OR p.barcode = $2';
  END IF;

  EXECUTE format($q$
    SELECT COALESCE(array_agg(x.id ORDER BY x.ordem, x.nome), '{}')
      FROM (
        SELECT p.id, p.name AS nome,
               CASE WHEN $2 <> '' AND (lower(p.sku) = lower($2)%1$s) THEN 0 ELSE 1 END AS ordem
          FROM public.products p
         WHERE p.deleted_at IS NULL
           AND %2$s
           AND ($2 = '' OR p.name ILIKE $3 OR p.sku ILIKE $3%1$s)
         ORDER BY ordem, p.name
         LIMIT $4
      ) x
  $q$, v_barras, public.ops_stock_filtro_org())
  INTO v_ids
  USING p_org, v_texto, v_padrao, v_limite;

  RETURN QUERY
  SELECT c.* FROM public.ops_stock_calcular(p_org, v_ids) c
   ORDER BY array_position(v_ids, c.produto_id);
END
$$;


-- ============================================================
-- 3. Sugerir — a ficha técnica do serviço × a quantidade vendida
-- ============================================================
-- service_materials diz, por serviço, que produtos leva. A quantidade de
-- cada material segue a regra do CRM (QuoteDiagnosticPhase):
--   · com regra por área (reference_area_m2 > 0 e reference_quantity):
--       ceil(reference_quantity / reference_area_m2 × quantidade);
--   · sem regra: quantity × quantidade.
-- Numa embalagem (service_materials.uom_id com base na unidade do produto) a
-- quantidade passa a unidades de stock: × uom.conversion_factor.
-- O mesmo produto duas vezes na ficha soma-se numa linha.
CREATE OR REPLACE FUNCTION public.rpc_ops_stock_sugerir(
  p_org        uuid,
  p_servico_id uuid,
  p_quantidade numeric
)
RETURNS TABLE (
  produto_id uuid, nome text, sku text, unidade text, quantidade numeric,
  gere_stock boolean, fisico numeric, reservado numeric, a_chegar numeric,
  disponivel numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_qt     numeric := COALESCE(p_quantidade, 1);
  v_regra  text := 'NULL::numeric';
  v_ordem  text := '0';
  v_fator  text := '1';
  v_join   text := '';
  v_ids    uuid[];
  v_qts    numeric[];
BEGIN
  PERFORM public.ops_stock_verificar(p_org);
  IF v_qt < 0 THEN
    RAISE EXCEPTION 'A quantidade do serviço não pode ser negativa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_servico_id IS NULL
     OR NOT public.ops_stock_ha_inventario()
     OR NOT public.ops_stock_tem('service_materials',
              ARRAY['service_id','product_id','quantity','organization_id','deleted_at']) THEN
    RETURN;
  END IF;

  IF public.ops_stock_tem('service_materials', ARRAY['reference_area_m2','reference_quantity']) THEN
    v_regra := 'CASE WHEN sm.reference_area_m2 > 0 AND sm.reference_quantity IS NOT NULL
                     THEN ceil(sm.reference_quantity / sm.reference_area_m2 * $3) END';
  END IF;
  IF public.ops_stock_tem('service_materials', ARRAY['sort_order']) THEN
    v_ordem := 'COALESCE(sm.sort_order, 0)';
  END IF;
  IF public.ops_stock_tem('service_materials', ARRAY['uom_id'])
     AND public.ops_stock_tem('products', ARRAY['uom_id'])
     AND public.ops_stock_tem('uom', ARRAY['id','base_uom_id','conversion_factor']) THEN
    v_join  := 'LEFT JOIN public.products p ON p.id = sm.product_id
                LEFT JOIN public.uom mu ON mu.id = sm.uom_id';
    v_fator := 'CASE WHEN sm.uom_id IS NULL OR sm.uom_id = p.uom_id THEN 1
                     WHEN mu.base_uom_id = p.uom_id AND mu.conversion_factor >= 1 THEN mu.conversion_factor
                     ELSE 1 END';
  END IF;

  EXECUTE format($q$
    SELECT COALESCE(array_agg(x.product_id ORDER BY x.ordem), '{}'),
           COALESCE(array_agg(x.q          ORDER BY x.ordem), '{}')
      FROM (
        SELECT sm.product_id,
               MIN(%1$s) AS ordem,
               round(SUM(COALESCE(%2$s, COALESCE(sm.quantity, 0) * $3) * %3$s), 3) AS q
          FROM public.service_materials sm
          %4$s
         WHERE sm.service_id = $2
           AND sm.organization_id = $1
           AND sm.deleted_at IS NULL
           AND sm.product_id IS NOT NULL
         GROUP BY sm.product_id
      ) x
  $q$, v_ordem, v_regra, v_fator, v_join)
  INTO v_ids, v_qts
  USING p_org, p_servico_id, v_qt;

  RETURN QUERY
  SELECT c.produto_id, c.nome, c.sku, c.unidade,
         v_qts[array_position(v_ids, c.produto_id)],
         c.gere_stock, c.fisico, c.reservado, c.a_chegar, c.disponivel
    FROM public.ops_stock_calcular(p_org, v_ids) c
   ORDER BY array_position(v_ids, c.produto_id);
END
$$;


-- ============================================================
-- 4. Refrescar — a disponibilidade de produtos já escolhidos
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_ops_stock_disponivel(
  p_org      uuid,
  p_produtos uuid[]
)
RETURNS TABLE (
  produto_id uuid, nome text, sku text, unidade text, gere_stock boolean,
  fisico numeric, reservado numeric, a_chegar numeric, disponivel numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.ops_stock_verificar(p_org);
  IF cardinality(p_produtos) > 500 THEN
    RAISE EXCEPTION 'Demasiados produtos de uma vez (máximo 500).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY SELECT c.* FROM public.ops_stock_calcular(p_org, p_produtos) c ORDER BY c.nome;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_stock_pesquisar(uuid, text, int)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_ops_stock_sugerir(uuid, uuid, numeric)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_ops_stock_disponivel(uuid, uuid[])          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_pesquisar(uuid, text, int)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_sugerir(uuid, uuid, numeric)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_disponivel(uuid, uuid[])      TO authenticated, service_role;
