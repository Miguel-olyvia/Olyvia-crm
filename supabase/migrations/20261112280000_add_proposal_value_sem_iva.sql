-- Adiciona proposals.value_sem_iva (valor sem IVA), espelhando exatamente a
-- mesma logica condicional de calculate_proposal_value_from_quotes()
-- (20261112130000_fix_sync_proposal_value_from_quote_sum.sql). Objetivo: os
-- dashboards passarem a ter um valor liquido (sem IVA) real na BD para
-- Propostas, em vez de o calcularem a partir de value (com IVA).
--
-- IMPORTANTE: o valor sem IVA de uma quote NAO e so quotes.subtotal. Confirmado
-- em src/utils/quotes/computeQuoteTotals.ts (fonte de verdade do calculo,
-- usada ao gravar a quote): total = subtotal + total_fees + totalIva, onde
-- total_fees (quotes.total_fees) e o valor das taxas de servico JA SEM IVA
-- (totalFeesValueRounded, gravado tal-e-qual — ver
-- 20261112240000_rpc_save_quote_add_lost_reason.sql). Logo o valor liquido
-- real de uma quote e (subtotal + total_fees), nao so subtotal.
--
-- Mesma regra de negocio (2026-08-14), agora tambem aplicada ao valor sem IVA:
--   - Se a proposta tiver pelo menos uma quote com estado = 'aceite', o valor
--     e a soma apenas das quotes aceites.
--   - Caso contrario, o valor e a soma de todas as quotes nao rejeitadas.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS value_sem_iva numeric(15,2);

CREATE OR REPLACE FUNCTION public.calculate_proposal_value_sem_iva_from_quotes(p_proposal_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_accepted boolean;
  v_value numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL AND estado = 'aceite'
  ) INTO v_has_accepted;

  IF v_has_accepted THEN
    SELECT COALESCE(SUM(subtotal + COALESCE(total_fees, 0)), 0) INTO v_value
    FROM public.quotes
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL AND estado = 'aceite';
  ELSE
    SELECT COALESCE(SUM(subtotal + COALESCE(total_fees, 0)), 0) INTO v_value
    FROM public.quotes
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL AND estado IS DISTINCT FROM 'rejeitado';
  END IF;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_proposal_value_from_quote() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    UPDATE public.proposals
       SET value = public.calculate_proposal_value_from_quotes(NEW.proposal_id),
           value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(NEW.proposal_id),
           updated_at = now()
     WHERE id = NEW.proposal_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.proposal_id IS NOT NULL AND OLD.proposal_id IS DISTINCT FROM NEW.proposal_id THEN
    UPDATE public.proposals p
       SET value = public.calculate_proposal_value_from_quotes(OLD.proposal_id),
           value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(OLD.proposal_id),
           updated_at = now()
     WHERE p.id = OLD.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: recalcula value_sem_iva para todas as propostas existentes com a
-- mesma funcao (inclusive as sem quotes ligadas, que ficam a 0, tal como
-- calculate_proposal_value_from_quotes ja fazia para value nesse caso).
UPDATE public.proposals p
   SET value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(p.id)
 WHERE p.value_sem_iva IS DISTINCT FROM public.calculate_proposal_value_sem_iva_from_quotes(p.id);
