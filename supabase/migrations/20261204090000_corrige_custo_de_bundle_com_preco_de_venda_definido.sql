-- ============================================================
-- Corrigir o custo de linhas de bundle/kit que têm preço de venda definido
-- (retail_price_unit NOT NULL) — em qualquer estado do orçamento
-- ============================================================
-- Terceira volta do mesmo bug (20261204070000 e 20261204080000): as duas
-- migrações anteriores excluíram de propósito as linhas com retail_price_unit
-- definido, por engano — a ideia era "não mexer onde o preço não depende do
-- custo", mas é exactamente o contrário: quando retail_price_unit está
-- definido, getLineUnitPrice() devolve-o directamente (quoteLinePricing.ts),
-- SEM olhar para custo_material_unit nem para margem_percent. Corrigir o
-- custo aqui é mais seguro ainda do que nas duas migrações anteriores — o
-- preço de venda não pode mudar porque nunca dependeu do custo.
--
-- Sem filtro de estado (rascunho/enviado/aceite/perdido/rejeitado): o
-- argumento de "não mexer no que já foi enviado" era sobre não alterar o
-- preço visto pelo cliente, e aqui isso está garantido por construção.
-- ============================================================

DO $$
DECLARE
  v_line RECORD;
  v_comp JSONB;
  v_real_cost NUMERIC;
  v_comp_cost NUMERIC;
  v_new_margem NUMERIC;
  v_updated_count INT := 0;
  v_examined_count INT := 0;
  v_skipped_overflow INT := 0;
BEGIN
  FOR v_line IN
    SELECT ql.id, ql.selected_attributes, ql.custo_material_unit, ql.custo_mao_obra_unit,
           ql.int_percent, ql.retail_price_unit
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.bundle_id IS NOT NULL
      AND ql.retail_price_unit IS NOT NULL
      AND q.deleted_at IS NULL
      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
  LOOP
    v_examined_count := v_examined_count + 1;

    v_real_cost := 0;
    FOR v_comp IN SELECT * FROM jsonb_array_elements(v_line.selected_attributes -> 'bundle_components')
    LOOP
      v_comp_cost := NULL;
      IF (v_comp ->> 'type') = 'product' AND (v_comp ->> 'source_id') IS NOT NULL THEN
        SELECT price INTO v_comp_cost FROM public.product_prices
          WHERE product_id = (v_comp ->> 'source_id')::uuid AND price_type = 'purchase'
          ORDER BY created_at DESC LIMIT 1;
      ELSIF (v_comp ->> 'type') = 'service' AND (v_comp ->> 'source_id') IS NOT NULL THEN
        SELECT price INTO v_comp_cost FROM public.service_prices
          WHERE service_id = (v_comp ->> 'source_id')::uuid AND price_type = 'purchase'
          ORDER BY created_at DESC LIMIT 1;
      END IF;
      v_real_cost := v_real_cost + COALESCE(v_comp_cost, 0) * COALESCE((v_comp ->> 'quantity')::numeric, 1);
    END LOOP;

    CONTINUE WHEN v_real_cost <= 0 OR round(v_real_cost, 2) = round(COALESCE(v_line.custo_material_unit, 0), 2);

    -- markupFromCostAndPrice em quoteLinePricing.ts: o preço de venda já
    -- gravado (retail_price_unit) é o que manda; o custo real e ele é que
    -- dão a margem correcta a mostrar, sem o preço mexer.
    v_new_margem := GREATEST(0, round(
      ((v_line.retail_price_unit / (1 + COALESCE(v_line.int_percent, 0) / 100)) / v_real_cost - 1) * 100
    , 2));

    IF v_new_margem > 999.99 THEN
      v_skipped_overflow := v_skipped_overflow + 1;
      RAISE NOTICE 'Linha % ficou de fora (margem calculada % excede o limite da coluna) — custo real %, preço %',
        v_line.id, v_new_margem, v_real_cost, v_line.retail_price_unit;
      CONTINUE;
    END IF;

    UPDATE public.quote_lines
    SET custo_material_unit = round(v_real_cost, 2),
        margem_percent = v_new_margem
    WHERE id = v_line.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RAISE NOTICE 'Linhas de bundle com preço de venda definido examinadas: % — corrigidas: % — com overflow (fora): %',
    v_examined_count, v_updated_count, v_skipped_overflow;
END;
$$;
