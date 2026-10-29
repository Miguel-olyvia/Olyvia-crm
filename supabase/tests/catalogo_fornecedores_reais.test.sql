-- ============================================================
-- Testes: 20270101270000_catalogo_fornecedores_reais.sql (base RH)
-- ============================================================
-- Pós-condições: correm DEPOIS da migration (na mesma transação no ensaio, ou depois de aplicada). Só leituras; qualquer falha
-- rebenta com 'FALHOU: …'. O resultado útil é o último SELECT (fornecedores e nº de produtos ligados a cada um).
--
-- Ensaio (tudo numa transação desfeita):
--   BEGIN; <instantâneo _cfr_antes/_cfr_antes_n — ver abaixo>; <migration>; <migration outra vez>; <este ficheiro>; ROLLBACK;
-- Se existirem as tabelas temporárias _cfr_antes (product_prices da organização) e _cfr_antes_n (contagens de notifications,
-- supplier_price_change_requests, item_supplier_price_history, product_price_history), compara antes/depois:
--   CREATE TEMP TABLE _cfr_antes AS SELECT pp.* FROM product_prices pp JOIN products p ON p.id = pp.product_id
--     WHERE p.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33';
--   CREATE TEMP TABLE _cfr_antes_n AS SELECT (SELECT count(*) FROM notifications) n_notif, (SELECT count(*) FROM
--     supplier_price_change_requests) n_pcr, (SELECT count(*) FROM item_supplier_price_history) n_isph,
--     (SELECT count(*) FROM product_price_history) n_pph;
--
-- Cobre:
--   A. 27 fornecedores (um por nome; "Anlorbel" junto ao nome longo; sem "A definir por obra" / "Entidade inspetora de gás"),
--      ativos, sem NIF/email/morada, code NULL
--   B. Cada produto do Catálogo com fornecedor_livre (fora os 2 excluídos) tem UMA ligação ao fornecedor certo: preferencial, ativa,
--      uom NULL, sku = products.sku, preço = custo atual arredondado, moeda da linha de custo, preco_data preenchida;
--      products.supplier_id = esse fornecedor; fornecedor_livre intacto
--   C. Excluídos e os 3 do portal intactos
--   D. product_prices idênticos; sem notificações, pedidos de alteração de preço nem histórico de preços novos (se houver instantâneo)
-- ============================================================

DO $t$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_anl constant text := 'Anlorbel - Com. de Mat. de Construção e Decoração, SA';
  v int;
  v2 int;
BEGIN
  -- A. Fornecedores
  SELECT count(*) INTO v FROM suppliers s
  WHERE s.organization_id = c_org AND s.deleted_at IS NULL
    AND s.name IN (SELECT DISTINCT CASE WHEN fornecedor_livre = 'Anlorbel' THEN c_anl ELSE fornecedor_livre END
                   FROM products WHERE organization_id = c_org AND fornecedor_livre IS NOT NULL);
  IF v <> 27 THEN RAISE EXCEPTION 'FALHOU A: esperados 27 fornecedores, há %', v; END IF;

  SELECT count(*) INTO v FROM suppliers WHERE organization_id = c_org AND deleted_at IS NULL
    AND name IN ('Anlorbel', 'A definir por obra', 'Entidade inspetora de gás');
  IF v <> 0 THEN RAISE EXCEPTION 'FALHOU A: há fornecedores que não deviam existir (%)', v; END IF;

  SELECT count(*) INTO v FROM (
    SELECT lower(btrim(name)) FROM suppliers WHERE organization_id = c_org AND deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1) d;
  IF v <> 0 THEN RAISE EXCEPTION 'FALHOU A: nomes de fornecedor repetidos (%)', v; END IF;

  SELECT count(*) INTO v FROM suppliers s
  WHERE s.organization_id = c_org AND s.deleted_at IS NULL
    AND s.name IN (SELECT DISTINCT CASE WHEN fornecedor_livre = 'Anlorbel' THEN c_anl ELSE fornecedor_livre END
                   FROM products WHERE organization_id = c_org AND fornecedor_livre IS NOT NULL)
    AND (s.is_active IS NOT TRUE OR s.tax_id IS NOT NULL OR s.vat_number IS NOT NULL OR s.email IS NOT NULL
         OR s.address IS NOT NULL OR s.code IS NOT NULL OR s.created_by IS NULL);
  IF v <> 0 THEN RAISE EXCEPTION 'FALHOU A: % fornecedores com campos inesperados', v; END IF;

  -- B. Ligações
  WITH alvo AS (
    SELECT p.id, p.sku, p.supplier_id AS p_sup,
           CASE WHEN p.fornecedor_livre = 'Anlorbel' THEN c_anl ELSE p.fornecedor_livre END AS nome
    FROM products p
    WHERE p.organization_id = c_org AND p.tipo_catalogo IN ('produto', 'consumivel')
      AND COALESCE(p.is_deleted, false) = false AND p.deleted_at IS NULL
      AND p.fornecedor_livre IS NOT NULL
      AND p.fornecedor_livre NOT IN ('A definir por obra', 'Entidade inspetora de gás')
  ), ok AS (
    SELECT a.id
    FROM alvo a
    JOIN suppliers s ON s.organization_id = c_org AND s.deleted_at IS NULL AND s.name = a.nome
    JOIN item_suppliers i ON i.product_id = a.id AND i.supplier_id = s.id AND i.deleted_at IS NULL
    JOIN LATERAL (
      SELECT r.price, r.preco_exato, r.currency FROM product_prices r
      WHERE r.product_id = a.id AND r.price_type = 'purchase'
      ORDER BY r.valid_from DESC NULLS LAST, r.created_at DESC LIMIT 1
    ) pp ON true
    WHERE i.is_preferred AND i.is_active AND i.item_type = 'product' AND i.organization_id = c_org
      AND i.uom_id IS NULL AND i.supplier_sku IS NOT DISTINCT FROM a.sku
      AND i.purchase_price = round(COALESCE(pp.preco_exato, pp.price), 2)
      AND i.currency = pp.currency::text AND i.preco_data IS NOT NULL AND i.created_by IS NOT NULL
      AND i.catalog_item_id IS NULL
      AND a.p_sup = s.id
  )
  SELECT (SELECT count(*) FROM alvo), (SELECT count(*) FROM ok) INTO v, v2;
  IF v <> 2310 OR v2 <> v THEN RAISE EXCEPTION 'FALHOU B: % produtos alvo, % ligados corretamente (esperado 2310)', v, v2; END IF;

  SELECT count(*) INTO v FROM (
    SELECT i.product_id, i.supplier_id FROM item_suppliers i JOIN products p ON p.id = i.product_id
    WHERE p.organization_id = c_org AND i.deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v <> 0 THEN RAISE EXCEPTION 'FALHOU B: ligações repetidas (%)', v; END IF;

  SELECT count(*) INTO v FROM products WHERE organization_id = c_org AND fornecedor_livre = 'Anlorbel';
  IF v <> 52 THEN RAISE EXCEPTION 'FALHOU B: fornecedor_livre mexido (Anlorbel = %)', v; END IF;

  -- C. Excluídos e portal intactos
  SELECT count(*) INTO v FROM products p
  WHERE p.organization_id = c_org AND p.fornecedor_livre IN ('A definir por obra', 'Entidade inspetora de gás')
    AND (p.supplier_id IS NOT NULL OR EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id));
  IF v <> 0 THEN RAISE EXCEPTION 'FALHOU C: % produtos excluídos foram ligados', v; END IF;

  SELECT count(*) INTO v FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo IN ('produto', 'consumivel') AND p.fornecedor_livre IS NULL
    AND COALESCE(p.is_deleted, false) = false AND p.deleted_at IS NULL
    AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
    AND p.supplier_id IS NOT NULL;
  IF v <> 3 THEN RAISE EXCEPTION 'FALHOU C: produtos do portal mexidos (% de 3 com 1 ligação)', v; END IF;

  -- D. Antes/depois (só no ensaio com instantâneo)
  IF to_regclass('pg_temp._cfr_antes') IS NOT NULL THEN
    SELECT count(*) INTO v FROM (
      (SELECT pp.* FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org
       EXCEPT ALL SELECT * FROM pg_temp._cfr_antes)
      UNION ALL
      (SELECT * FROM pg_temp._cfr_antes
       EXCEPT ALL SELECT pp.* FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org)
    ) d;
    IF v <> 0 THEN RAISE EXCEPTION 'FALHOU D: product_prices mudou (% linhas diferentes)', v; END IF;
  END IF;

  IF to_regclass('pg_temp._cfr_antes_n') IS NOT NULL THEN
    SELECT count(*) INTO v FROM pg_temp._cfr_antes_n a
    WHERE a.n_notif = (SELECT count(*) FROM notifications)
      AND a.n_pcr = (SELECT count(*) FROM supplier_price_change_requests)
      AND a.n_isph = (SELECT count(*) FROM item_supplier_price_history)
      AND a.n_pph = (SELECT count(*) FROM product_price_history);
    IF v <> 1 THEN RAISE EXCEPTION 'FALHOU D: novas notificações / pedidos de preço / histórico de preços'; END IF;
  END IF;
END
$t$;

SELECT s.name AS fornecedor, count(i.id) AS produtos_ligados
FROM suppliers s
LEFT JOIN item_suppliers i ON i.supplier_id = s.id AND i.deleted_at IS NULL
WHERE s.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33' AND s.deleted_at IS NULL
GROUP BY s.name
ORDER BY 2 DESC, 1;
