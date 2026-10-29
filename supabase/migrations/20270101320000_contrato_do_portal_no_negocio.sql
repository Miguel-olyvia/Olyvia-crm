-- Negócio (29/10/2026): o contrato que o portal cria quando o cliente aceita a proposta passa a ser a versão 1 do contrato do negócio.
--
-- O problema (negócio 1010, 29/10):
--   1. Quando o cliente aceita a proposta no portal, a Edge Function client-portal-action cria um contrato em client_contracts (sem
--      versão). O trg_negocios_10_herdar liga-o ao negócio pela proposta.
--   2. O Negócio da Emylia só reconhece contratos com versão (fn_neg_templates_estado, neg_guardar_negocio). Para ele, este contrato
--      é "do CRM" (fn_neg_docs_crm) e o negócio fica sem contrato: o "Enviar para o portal do cliente" dá "O contrato ainda não está
--      gravado na base".
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Gatilho BEFORE INSERT em client_contracts, depois do trg_negocios_10_herdar: um contrato sem versão nem adenda, num negócio do
--      fluxo da Emylia que ainda não tem contrato com versão, nasce como versão 1. O neg_guardar_negocio encontra-o pela versão e
--      passa a geri-lo (estado, cláusulas, envio), em vez de criar um segundo.
--   2. Os contratos que já estão nesse estado passam a versão 1 (o do negócio 1010 já foi corrigido à mão a 29/10).
--
-- O que muda para a Mudelar: nada nos negócios fora do fluxo da Emylia (fluxo_emylia falso ou sem negócio).
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_neg_contrato_do_portal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.versao IS NULL AND NEW.adenda_id IS NULL AND NEW.negocio_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM negocios n WHERE n.id = NEW.negocio_id AND n.fluxo_emylia)
     AND NOT EXISTS (SELECT 1 FROM client_contracts c WHERE c.negocio_id = NEW.negocio_id AND c.versao IS NOT NULL AND c.deleted_at IS NULL) THEN
    NEW.versao := 1;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_neg_contrato_do_portal() IS 'Negócio: gatilho BEFORE INSERT em client_contracts, depois de trg_negocios_10_herdar; o contrato que o portal cria ao aceitar a proposta, num negócio do fluxo da Emylia sem contrato com versão, nasce como versão 1. 20270101320000.';

DROP TRIGGER IF EXISTS trg_negocios_20_contrato_portal ON public.client_contracts;
CREATE TRIGGER trg_negocios_20_contrato_portal
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_contrato_do_portal();

-- os que já existem: um por negócio (o mais antigo), só se o negócio não tiver nenhum com versão
UPDATE client_contracts c SET versao = 1, updated_at = now()
WHERE c.id IN (
  SELECT DISTINCT ON (x.negocio_id) x.id
  FROM client_contracts x JOIN negocios n ON n.id = x.negocio_id AND n.fluxo_emylia
  WHERE x.versao IS NULL AND x.adenda_id IS NULL AND x.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM client_contracts y WHERE y.negocio_id = x.negocio_id AND y.versao IS NOT NULL AND y.deleted_at IS NULL)
  ORDER BY x.negocio_id, x.created_at);
