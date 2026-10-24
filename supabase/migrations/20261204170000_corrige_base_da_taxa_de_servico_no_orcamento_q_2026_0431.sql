-- ============================================================
-- Corrigir a base da taxa de serviço do orçamento Q-2026-0431
-- (ficou desatualizada depois de repor as 5 linhas perdidas)
-- ============================================================
-- A migração anterior (20261204160000) repôs 5 linhas de quote_lines e os
-- totais agregados de quotes (subtotal/total_fees/total), mas não tocou na
-- linha de quote_fees ligada a este orçamento — essa linha continuava com a
-- base de cálculo antiga (13.654,15 €, o subtotal de antes da reposição),
-- desalinhada do novo subtotal (17.382,99 €).
--
-- Valores exactos confirmados em auditoria (entity_audit_log, changed_fields
-- ->'quote_fees', gravação de pico às 2026-09-22 17:43:56): base_amount
-- 17382.99 (= subtotal), vat_rate 6%, calculated_value 1216.8093,
-- vat_amount 73.008558 — arredondados aqui a 2 casas decimais (tipo da
-- coluna é NUMERIC(12,2)).
-- ============================================================

DO $$
DECLARE
  v_fee_id CONSTANT uuid := '76060742-a6b2-4417-b4f7-12f55dab3f9a';
BEGIN
  UPDATE public.quote_fees
  SET base_amount = 17382.99,
      calculated_value = 1216.81,
      vat_amount = 73.01
  WHERE id = v_fee_id
    AND base_amount <> 17382.99;

  IF NOT FOUND THEN
    RAISE NOTICE 'quote_fees % já estava correcto ou não encontrado — nada a fazer.', v_fee_id;
  END IF;
END;
$$;
