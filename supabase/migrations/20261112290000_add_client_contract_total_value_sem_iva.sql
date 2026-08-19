-- Adiciona client_contracts.total_value_sem_iva (valor sem IVA), copiado da
-- quote ligada (client_contracts.quote_id -> quotes). Objetivo: os
-- dashboards passarem a ter um valor liquido (sem IVA) real na BD para
-- Contratos, tal como ja feito para proposals.value_sem_iva
-- (20261112280000_add_proposal_value_sem_iva.sql).
--
-- IMPORTANTE: o valor sem IVA de uma quote NAO e so quotes.subtotal. Confirmado
-- em src/utils/quotes/computeQuoteTotals.ts (fonte de verdade do calculo,
-- usada ao gravar a quote): total = subtotal + total_fees + totalIva, onde
-- total_fees (quotes.total_fees) e o valor das taxas de servico JA SEM IVA
-- (totalFeesValueRounded, gravado tal-e-qual — ver
-- 20261112240000_rpc_save_quote_add_lost_reason.sql). Logo o valor liquido
-- real de uma quote e (subtotal + total_fees), nao so subtotal.
--
-- Regra: quote_id definido/alterado -> total_value_sem_iva =
-- quote.subtotal + COALESCE(quote.total_fees, 0). quote_id nulo ->
-- total_value_sem_iva fica NULL (nao inventar valor). Segue o padrao BEFORE
-- INSERT/UPDATE ja usado por set_client_contract_assigned_to()
-- (20261112150000_client_contracts_assigned_to_trigger.sql).

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS total_value_sem_iva numeric;

CREATE OR REPLACE FUNCTION public.set_client_contract_total_value_sem_iva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_id IS NULL THEN
    NEW.total_value_sem_iva := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    NEW.total_value_sem_iva := (
      SELECT subtotal + COALESCE(total_fees, 0) FROM public.quotes WHERE id = NEW.quote_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_client_contract_total_value_sem_iva ON public.client_contracts;
CREATE TRIGGER trg_set_client_contract_total_value_sem_iva
  BEFORE INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_client_contract_total_value_sem_iva();

-- Backfill dos contratos existentes com quote_id preenchido.
UPDATE public.client_contracts cc
   SET total_value_sem_iva = q.subtotal + COALESCE(q.total_fees, 0)
  FROM public.quotes q
 WHERE cc.quote_id = q.id
   AND cc.total_value_sem_iva IS DISTINCT FROM (q.subtotal + COALESCE(q.total_fees, 0));
