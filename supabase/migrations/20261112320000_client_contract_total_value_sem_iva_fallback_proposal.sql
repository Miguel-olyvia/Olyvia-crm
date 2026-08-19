-- Corrige uma falha real encontrada em producao: total_value_sem_iva so era
-- preenchido quando client_contracts.quote_id estava definido (14 de 113
-- contratos globalmente). Os restantes contratos (assinados via
-- proposal_id, sem quote_id direto) ficavam com total_value_sem_iva = NULL,
-- e o dashboard de Clientes trata NULL como 0 (ver AnewClientsDashboard.tsx),
-- fazendo "Valor Contratos" mostrar um total muito abaixo do real (ex: um
-- org com 54 contratos assinados totalizando 418.355,89 com IVA mostrava
-- so 29.634,42 sem IVA -- 48 desses 54 contratos ficavam a 0).
--
-- Confirmado por investigacao (leitura direta na BD): todos os contratos
-- problematicos tem proposal_id preenchido, e proposals.value_sem_iva
-- (20261112280000_add_proposal_value_sem_iva.sql) esta preenchido em 100%
-- das propostas existentes. Usar esse fallback resolve 0 contratos sem
-- valor sem-IVA no org investigado, e apenas 1 em 58 contratos
-- signed/active em toda a BD (0,28% do valor com IVA), que nao tem
-- proposal_id nenhum.
--
-- Nova regra: quote_id definido -> quote.subtotal + quote.total_fees
-- (inalterado). quote_id nulo e proposal_id definido -> proposal.value_sem_iva.
-- Nenhum dos dois -> NULL (nao inventar valor).

CREATE OR REPLACE FUNCTION public.set_client_contract_total_value_sem_iva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_id IS NOT NULL THEN
    NEW.total_value_sem_iva := (
      SELECT subtotal + COALESCE(total_fees, 0) FROM public.quotes WHERE id = NEW.quote_id
    );
  ELSIF NEW.proposal_id IS NOT NULL THEN
    NEW.total_value_sem_iva := (
      SELECT value_sem_iva FROM public.proposals WHERE id = NEW.proposal_id
    );
  ELSE
    NEW.total_value_sem_iva := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger passa a disparar tambem quando proposal_id muda (alem de
-- quote_id/INSERT), para cobrir o novo caminho de fallback.
DROP TRIGGER IF EXISTS trg_set_client_contract_total_value_sem_iva ON public.client_contracts;
CREATE TRIGGER trg_set_client_contract_total_value_sem_iva
  BEFORE INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_client_contract_total_value_sem_iva();

-- Backfill: recalcula todos os contratos existentes com a nova regra
-- (quote_id tem prioridade; senao usa proposal_id).
UPDATE public.client_contracts cc
   SET total_value_sem_iva = COALESCE(
         (SELECT q.subtotal + COALESCE(q.total_fees, 0) FROM public.quotes q WHERE q.id = cc.quote_id),
         (SELECT p.value_sem_iva FROM public.proposals p WHERE p.id = cc.proposal_id)
       )
 WHERE cc.quote_id IS NOT NULL
    OR cc.proposal_id IS NOT NULL;
