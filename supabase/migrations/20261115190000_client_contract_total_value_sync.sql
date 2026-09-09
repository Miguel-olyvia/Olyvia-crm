-- ============================================================
-- Correção: client_contracts.total_value (valor COM IVA) fica preso ao
-- valor da proposta no momento em que o contrato é criado, e nunca mais é
-- atualizado — mesmo quando a proposta/orçamento é editado depois.
--
-- Encontrado num caso real: cliente Fernando de Azevedo Ferreira, contrato
-- CC-2026-0080. Proposta aceite em 13/08 com valor 12.773,39€; orçamento
-- editado em 31/08 para 13.394,29€, proposta republicada e a mostrar o
-- valor novo corretamente — mas o contrato (já criado, ainda em rascunho,
-- por assinar) continuou a mostrar 12.773,39€ na tabela de Contratos e no
-- Portal do Cliente.
--
-- Causa raiz: já existe um trigger BEFORE INSERT/UPDATE em client_contracts
-- (set_client_contract_total_value_sem_iva, 20261112320000) que recalcula
-- o campo SEM IVA a cada gravação da linha — mas nunca foi replicado para o
-- campo COM IVA (total_value), que é o campo lido pela tabela de Contratos,
-- pelo Dashboard e pelo Portal do Cliente. Essa assimetria é a causa direta
-- do bug: o campo sem IVA está sempre correto, o campo com IVA fica parado
-- no valor de quando o contrato foi criado.
--
-- Verificado antes de aplicar (dry-run manual): 16 contratos com o mesmo
-- desfasamento no total, mas 7 não devem ser tocados por este fix —
-- 5 estavam 'cancelled' (histórico, não se mexe) e 1 estava ligado a uma
-- proposta ainda em 'draft' com valor 0 (contrato criado antes da aceitação
-- normal, fora do fluxo habitual). Por isso a condição usa sempre
-- proposal.status = 'accepted' e contract.status IN ('draft',
-- 'pending_signature') — nunca 'signed' nem 'cancelled'.
--
-- Correção em 2 partes:
--
-- 1. Estender o trigger existente para recalcular também total_value, com a
--    mesma prioridade já usada para total_value_sem_iva (quote_id quando
--    presente, senão proposal_id, e só quando a proposta está 'accepted').
--    Só corre enquanto o contrato NÃO estiver assinado — uma vez assinado
--    (status = 'signed'), o valor fica congelado para sempre.
--
-- 2. Trigger novo em proposals (AFTER UPDATE OF value, value_sem_iva): se a
--    proposta já tem um client_contract_id ligado, "toca" nesse contrato
--    (UPDATE updated_at) para forçar o trigger acima a recalcular. Sem isto,
--    o gatilho de (1) só corre na próxima vez que alguém mexer no próprio
--    contrato — o que pode nunca acontecer, como neste caso real.
-- ============================================================


-- ── 1. Estender set_client_contract_total_value_sem_iva() para também
--      recalcular total_value, com a mesma fonte/prioridade, só quando a
--      proposta de origem está aceite, e só enquanto o contrato não
--      estiver assinado. ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_client_contract_total_value_sem_iva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total         numeric;
  v_total_sem_iva numeric;
BEGIN
  -- Uma vez assinado, o valor do contrato fica congelado: nenhuma edição
  -- posterior (nem uma alteração na proposta/orçamento de origem) volta a
  -- tocar em total_value / total_value_sem_iva.
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' THEN
    RETURN NEW;
  END IF;

  IF NEW.quote_id IS NOT NULL THEN
    SELECT total, subtotal + COALESCE(total_fees, 0)
    INTO v_total, v_total_sem_iva
    FROM public.quotes WHERE id = NEW.quote_id;
  ELSIF NEW.proposal_id IS NOT NULL THEN
    -- Só usa o valor da proposta quando ela está mesmo aceite — uma
    -- proposta ainda em rascunho/reaberta não deve ditar o valor de um
    -- contrato já existente.
    SELECT value, value_sem_iva
    INTO v_total, v_total_sem_iva
    FROM public.proposals WHERE id = NEW.proposal_id AND status = 'accepted';
  END IF;

  IF v_total IS NOT NULL THEN
    NEW.total_value := v_total;
  END IF;
  IF v_total_sem_iva IS NOT NULL THEN
    NEW.total_value_sem_iva := v_total_sem_iva;
  ELSIF NEW.quote_id IS NULL AND NEW.proposal_id IS NULL THEN
    NEW.total_value_sem_iva := NULL;
  END IF;

  RETURN NEW;
END;
$function$;


-- ── 2. Trigger novo em proposals: propaga a edição de valor para o
--      contrato ligado (se houver, ainda não estiver assinado, e a
--      proposta estiver aceite). ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_proposal_sync_contract_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.client_contract_id IS NOT NULL
     AND NEW.status = 'accepted'
     AND (NEW.value IS DISTINCT FROM OLD.value
          OR NEW.value_sem_iva IS DISTINCT FROM OLD.value_sem_iva) THEN
    -- Este UPDATE não muda nada visível por si só — só existe para disparar
    -- o trigger BEFORE UPDATE de client_contracts (acima), que é quem
    -- decide os valores novos (e respeita o "congelado se já assinado").
    UPDATE public.client_contracts
    SET updated_at = now()
    WHERE id = NEW.client_contract_id
      AND status IN ('draft', 'pending_signature');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_proposals_sync_contract_value ON public.proposals;
CREATE TRIGGER trg_proposals_sync_contract_value
AFTER UPDATE OF value, value_sem_iva ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.fn_proposal_sync_contract_value();


-- ── 3. Backfill: corrigir os contratos já existentes com este desfasamento
--      (não só o caso do Fernando Ferreira) — só draft/pending_signature,
--      só quando a proposta de origem está aceite. ──────────────────────

UPDATE public.client_contracts cc
SET total_value = COALESCE(
      (SELECT total FROM public.quotes WHERE id = cc.quote_id),
      p.value
    ),
    total_value_sem_iva = COALESCE(
      (SELECT subtotal + COALESCE(total_fees, 0) FROM public.quotes WHERE id = cc.quote_id),
      p.value_sem_iva
    )
FROM public.proposals p
WHERE cc.proposal_id = p.id
  AND cc.status IN ('draft', 'pending_signature')
  AND p.status = 'accepted'
  AND (
    cc.total_value IS DISTINCT FROM COALESCE(
      (SELECT total FROM public.quotes WHERE id = cc.quote_id), p.value
    )
    OR cc.total_value_sem_iva IS DISTINCT FROM COALESCE(
      (SELECT subtotal + COALESCE(total_fees, 0) FROM public.quotes WHERE id = cc.quote_id), p.value_sem_iva
    )
  );
