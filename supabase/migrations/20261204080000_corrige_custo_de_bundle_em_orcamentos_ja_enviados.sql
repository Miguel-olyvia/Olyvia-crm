-- ============================================================
-- Corrigir o custo de linhas de bundle/kit em orçamentos já enviados,
-- aceites ou perdidos (não só os que ainda estão em rascunho)
-- ============================================================
-- Sequência da migração 20261204070000 (mesmo dia, mesmo bug): confirmado
-- que o custo errado (assumindo sempre 30% de margem sobre o preço de venda,
-- em vez de somar o custo de compra real dos componentes do kit) também
-- afecta orçamentos que já saíram do estado "rascunho".
--
-- Pedido explícito do utilizador para alargar a correcção a estes também:
-- corrigir a MARGEM (custo interno) de um orçamento já enviado é seguro
-- porque nunca muda o PREÇO que o cliente viu — só o número que a equipa vê
-- internamente. Por isso, ao contrário da regra geral de "não mexer no que
-- já foi enviado", esta correcção é aceitável aqui: não há alteração
-- visível para o cliente, só a correcção de um valor interno errado.
--
-- Mesma lógica exacta da migração anterior, sem o filtro por estado.
-- ============================================================

DO $$
DECLARE
  v_line RECORD;
  v_comp JSONB;
  v_real_cost NUMERIC;
  v_comp_cost NUMERIC;
  v_old_price NUMERIC;
  v_new_margem NUMERIC;
  v_updated_count INT := 0;
  v_examined_count INT := 0;
BEGIN
  FOR v_line IN
    SELECT ql.id, ql.selected_attributes, ql.custo_material_unit, ql.custo_mao_obra_unit,
           ql.margem_percent, ql.int_percent, ql.retail_price_unit
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.bundle_id IS NOT NULL
      AND q.estado <> 'rascunho'
      AND q.deleted_at IS NULL
      AND ql.retail_price_unit IS NULL
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

    v_old_price := (COALESCE(v_line.custo_material_unit, 0) + COALESCE(v_line.custo_mao_obra_unit, 0))
      * (1 + COALESCE(v_line.margem_percent, 0) / 100)
      * (1 + COALESCE(v_line.int_percent, 0) / 100);

    IF v_old_price <= 0 THEN
      CONTINUE;
    END IF;

    v_new_margem := GREATEST(0, round(
      ((v_old_price / (1 + COALESCE(v_line.int_percent, 0) / 100)) / v_real_cost - 1) * 100
    , 2));

    -- margem_percent é NUMERIC(5,2) — no máximo 999.99. Um caso que exceda
    -- isso é anómalo (custo real muito menor do que o preço, provavelmente
    -- um preço de compra desactualizado ou um componente trocado) — fica de
    -- fora para revisão manual, em vez de gravar um número sem sentido ou
    -- rebentar a migração toda outra vez.
    IF v_new_margem > 999.99 THEN
      RAISE NOTICE 'Linha % ficou de fora (margem calculada % excede o limite da coluna) — custo real %, preço %',
        v_line.id, v_new_margem, v_real_cost, v_old_price;
      CONTINUE;
    END IF;

    UPDATE public.quote_lines
    SET custo_material_unit = round(v_real_cost, 2),
        margem_percent = v_new_margem
    WHERE id = v_line.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RAISE NOTICE 'Linhas de bundle em orçamentos NAO-rascunho examinadas: % — corrigidas: %', v_examined_count, v_updated_count;
END;
$$;
