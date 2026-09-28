-- ============================================================
-- Corrigir o custo de linhas de bundle/kit em orçamentos ainda em rascunho
-- ============================================================
-- Encontrado ao investigar a margem errada de uma linha real (orçamento
-- Q-2026-1595, "Sanita Compacta C/Instalação"): ao adicionar um kit a um
-- orçamento, o custo da linha (custo_material_unit) nunca era a soma real do
-- custo de compra dos componentes escolhidos — QuoteBuilder.tsx assumia
-- sempre uma margem de 30% e invertia essa margem a partir do preço de
-- venda, mesmo quando o custo real de cada peça já estava no catálogo.
-- Confirmado com números: sanita (140,00€) + instalação (37,50€) = 177,50€
-- de custo real; a linha tinha gravado 220,69€ (= 286,90 ÷ 1,30).
--
-- O código já foi corrigido (BundleSelectionTab.tsx busca o custo real de
-- cada componente ao seleccionar o kit; QuoteBuilder.tsx passa a usá-lo em
-- vez de assumir 30%). Esta migração corrige os dados já gravados, mas só
-- em orçamentos AINDA em rascunho — um orçamento já enviado ou aceite é um
-- registo histórico do que o cliente viu, e não se mexe nesse valor
-- silenciosamente (mesma regra já usada para o custo congelado).
--
-- O PREÇO DE VENDA mostrado ao cliente NUNCA muda com esta correcção: só
-- corrige o custo (e a margem que dele deriva), recalculando margem_percent
-- de forma a que custo × (1+margem%) continue a dar exactamente o mesmo
-- preço unitário que já estava gravado. Nenhuma linha com retail_price_unit
-- definido é tocada (nessas o preço de venda é gravado directamente, não
-- depende do custo).
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
      AND q.estado = 'rascunho'
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

    -- Só corrige quando conseguimos apurar um custo real positivo, e quando
    -- difere do que já lá estava (evita tocar em linhas já correctas).
    CONTINUE WHEN v_real_cost <= 0 OR round(v_real_cost, 2) = round(COALESCE(v_line.custo_material_unit, 0), 2);

    -- Preço unitário actual (fórmula única de getLineUnitPrice em
    -- quoteLinePricing.ts, quando não há retail_price_unit definido).
    v_old_price := (COALESCE(v_line.custo_material_unit, 0) + COALESCE(v_line.custo_mao_obra_unit, 0))
      * (1 + COALESCE(v_line.margem_percent, 0) / 100)
      * (1 + COALESCE(v_line.int_percent, 0) / 100);

    IF v_old_price <= 0 THEN
      CONTINUE;
    END IF;

    -- Inverte a margem para o mesmo preço continuar a fechar exactamente
    -- (markupFromCostAndPrice em quoteLinePricing.ts).
    v_new_margem := GREATEST(0, round(
      ((v_old_price / (1 + COALESCE(v_line.int_percent, 0) / 100)) / v_real_cost - 1) * 100
    , 2));

    UPDATE public.quote_lines
    SET custo_material_unit = round(v_real_cost, 2),
        margem_percent = v_new_margem
    WHERE id = v_line.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RAISE NOTICE 'Linhas de bundle em rascunho examinadas: % — corrigidas: %', v_examined_count, v_updated_count;
END;
$$;
