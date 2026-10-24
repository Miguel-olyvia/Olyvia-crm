-- ============================================================
-- Corrigir o custo de linhas de produto/serviço simples (não-bundle)
-- com a assinatura do mesmo bug já corrigido nos kits
-- ============================================================
-- Mesmo defeito das migrações 20261204070000/080000/090000, mas em linhas
-- de produto ou serviço vendidos sozinhos (sem bundle_id): o custo
-- (custo_material_unit) nunca foi buscado ao preço de compra real do
-- catálogo — foi calculado ao contrário, a partir do preço de venda a
-- dividir por 1,30 (30% de margem assumida), mesmo quando o custo real já
-- estava definido no produto/serviço.
--
-- Diferença desta correção para a dos kits: aqui não há um "retrato" exacto
-- gravado na linha (como o bundle_components dos kits) para reconstruir o
-- custo com certeza total — só um sinal indirecto. Esse sinal é forte:
-- margem_percent gravada em EXACTAMENTE 30,00% E o custo a não bater com o
-- preço de compra real de hoje. Confirmado por investigação prévia: das
-- 4245 linhas cujo custo difere do de hoje, 4234 (99,7%) têm essa margem
-- exacta — uma coincidência dessas não acontece ao calhas em milhares de
-- linhas. As poucas linhas que diferem do preço de hoje SEM essa margem
-- exacta não são tocadas aqui — são o comportamento esperado do custo
-- congelado (o preço do catálogo pode ter mudado depois da linha ter sido
-- gravada correctamente), não o bug.
--
-- Abrange 4 organizações (confirmado com o utilizador antes de aplicar):
-- Mudelar, BMClean, Gromicho e nike.
--
-- Mesma garantia de sempre: o PREÇO DE VENDA nunca muda. Quando
-- retail_price_unit já está definido, o preço não depende do custo (mexer é
-- seguro por construção). Quando não está definido, a margem é recalculada
-- para o preço continuar a fechar exactamente igual.
-- ============================================================

DO $$
DECLARE
  v_line RECORD;
  v_real_cost NUMERIC;
  v_old_price NUMERIC;
  v_new_margem NUMERIC;
  v_updated_count INT := 0;
  v_examined_count INT := 0;
  v_skipped_overflow INT := 0;
BEGIN
  -- Passo 1: linhas SEM preço de venda próprio definido — o preço actual é
  -- custo × (1+margem%) × (1+int%); recalcula-se a margem para o mesmo
  -- preço continuar a fechar.
  FOR v_line IN
    SELECT ql.id, ql.product_id, ql.service_id, ql.custo_material_unit, ql.custo_mao_obra_unit,
           ql.margem_percent, ql.int_percent
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.bundle_id IS NULL
      AND (ql.product_id IS NOT NULL OR ql.service_id IS NOT NULL)
      AND ql.retail_price_unit IS NULL
      AND ql.margem_percent = 30.00
      AND q.deleted_at IS NULL
  LOOP
    v_examined_count := v_examined_count + 1;

    v_real_cost := NULL;
    IF v_line.product_id IS NOT NULL THEN
      SELECT price INTO v_real_cost FROM public.product_prices
        WHERE product_id = v_line.product_id AND price_type = 'purchase'
        ORDER BY created_at DESC LIMIT 1;
    ELSIF v_line.service_id IS NOT NULL THEN
      SELECT price INTO v_real_cost FROM public.service_prices
        WHERE service_id = v_line.service_id AND price_type = 'purchase'
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    CONTINUE WHEN v_real_cost IS NULL OR v_real_cost <= 0
      OR round(v_real_cost, 2) = round(COALESCE(v_line.custo_material_unit, 0), 2);

    v_old_price := (COALESCE(v_line.custo_material_unit, 0) + COALESCE(v_line.custo_mao_obra_unit, 0))
      * (1 + COALESCE(v_line.margem_percent, 0) / 100)
      * (1 + COALESCE(v_line.int_percent, 0) / 100);

    IF v_old_price <= 0 THEN
      CONTINUE;
    END IF;

    v_new_margem := GREATEST(0, round(
      ((v_old_price / (1 + COALESCE(v_line.int_percent, 0) / 100)) / v_real_cost - 1) * 100
    , 2));

    IF v_new_margem > 999.99 THEN
      v_skipped_overflow := v_skipped_overflow + 1;
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

  RAISE NOTICE 'Passo 1 (sem preço próprio) — examinadas: % — corrigidas: % — overflow: %',
    v_examined_count, v_updated_count, v_skipped_overflow;

  -- Passo 2: linhas COM preço de venda próprio já definido — o preço nunca
  -- depende do custo, corrige-se sem qualquer preservação especial.
  v_examined_count := 0;
  v_updated_count := 0;
  v_skipped_overflow := 0;

  FOR v_line IN
    SELECT ql.id, ql.product_id, ql.service_id, ql.custo_material_unit, ql.int_percent, ql.retail_price_unit
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.bundle_id IS NULL
      AND (ql.product_id IS NOT NULL OR ql.service_id IS NOT NULL)
      AND ql.retail_price_unit IS NOT NULL
      AND ql.margem_percent = 30.00
      AND q.deleted_at IS NULL
  LOOP
    v_examined_count := v_examined_count + 1;

    v_real_cost := NULL;
    IF v_line.product_id IS NOT NULL THEN
      SELECT price INTO v_real_cost FROM public.product_prices
        WHERE product_id = v_line.product_id AND price_type = 'purchase'
        ORDER BY created_at DESC LIMIT 1;
    ELSIF v_line.service_id IS NOT NULL THEN
      SELECT price INTO v_real_cost FROM public.service_prices
        WHERE service_id = v_line.service_id AND price_type = 'purchase'
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    CONTINUE WHEN v_real_cost IS NULL OR v_real_cost <= 0
      OR round(v_real_cost, 2) = round(COALESCE(v_line.custo_material_unit, 0), 2);

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

  RAISE NOTICE 'Passo 2 (com preço próprio) — examinadas: % — corrigidas: % — overflow: %',
    v_examined_count, v_updated_count, v_skipped_overflow;
END;
$$;
