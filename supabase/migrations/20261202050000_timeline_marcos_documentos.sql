-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Timeline — marcos próprios para propostas, orçamentos e contratos        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- As vendas diretas ganharam marcos com nome em 20261202030000. Propostas,
-- orçamentos e contratos continuavam a aparecer como diffs em bruto: uma
-- proposta aceite lia-se "Editou estado: sent → accepted", e a criação como
-- "Registo adicionado". Esta migration dá-lhes o mesmo tratamento.
--
-- Mesmo mecanismo: escreve-se em anew_entity_history, que as três timelines
-- (lead, cliente, contacto) já leem. Não se toca em entity_audit_log — esse
-- continua a ser o trilho de auditoria completo, para quem precise do detalhe.
--
-- ── O que NÃO gera eventos, e porquê ────────────────────────────────────────
--   · quotes.is_internal = true     — o orçamento sintético da venda direta e
--                                     das encomendas manuais. O utilizador
--                                     nunca o vê; a venda direta já tem os
--                                     seus próprios marcos.
--   · client_contracts.is_manual_order = true — idem para o contrato sintético.
--     Sem esta exclusão, aceitar uma venda direta escrevia "Venda direta
--     aceite" E "Contrato assinado" para o mesmo facto.
--   · linhas sem entity_id — não há ficha onde mostrar.
--
-- ── Estados reais em produção ───────────────────────────────────────────────
--   proposals.status        draft | sent | accepted | rejected
--   quotes.estado           rascunho | enviado | aceite | rejeitado | perdido | finalizado
--   client_contracts.status draft | pending_signature | signed | cancelled

-- ── Propostas ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_proposal_timeline_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_meta jsonb;
BEGIN
  IF NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_meta := jsonb_build_object(
    'document_id', NEW.id,
    'number',      NEW.proposal_number,
    'title',       NEW.title,
    'total',       NEW.value,
    'currency',    COALESCE(NEW.currency, 'EUR')
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_write_entity_history(NEW.entity_id, 'proposal_created', 'proposal', v_meta);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'proposal_sent', 'proposal', v_meta);
    ELSIF NEW.status = 'accepted' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'proposal_accepted', 'proposal', v_meta);
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.fn_write_entity_history(
        NEW.entity_id, 'proposal_rejected', 'proposal',
        v_meta || jsonb_build_object('reason', NEW.rejection_reason)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_proposal_timeline_history ON public.proposals;
CREATE TRIGGER trg_proposal_timeline_history
  AFTER INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_proposal_timeline_history();

-- ── Orçamentos ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_quote_timeline_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_meta jsonb;
BEGIN
  -- O orçamento sintético da venda direta / encomenda manual nunca aparece ao
  -- utilizador; a venda direta já tem os seus próprios marcos.
  IF NEW.entity_id IS NULL OR COALESCE(NEW.is_internal, false) THEN
    RETURN NEW;
  END IF;

  v_meta := jsonb_build_object(
    'document_id', NEW.id,
    'number',      NEW.quote_number,
    'title',       NEW.title,
    'total',       NEW.total,
    'currency',    COALESCE(NEW.moeda, 'EUR')
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_write_entity_history(NEW.entity_id, 'quote_created', 'quote', v_meta);
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'enviado' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'quote_sent', 'quote', v_meta);
    ELSIF NEW.estado = 'aceite' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'quote_accepted', 'quote', v_meta);
    ELSIF NEW.estado = 'rejeitado' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'quote_rejected', 'quote', v_meta);
    ELSIF NEW.estado = 'perdido' THEN
      PERFORM public.fn_write_entity_history(
        NEW.entity_id, 'quote_lost', 'quote',
        v_meta || jsonb_build_object('reason', NEW.lost_reason)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_quote_timeline_history ON public.quotes;
CREATE TRIGGER trg_quote_timeline_history
  AFTER INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_quote_timeline_history();

-- ── Contratos ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_contract_timeline_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_meta jsonb;
BEGIN
  -- Contrato sintético (venda direta / encomenda manual): sem esta guarda,
  -- aceitar uma venda direta escrevia "Venda direta aceite" E "Contrato
  -- assinado" para o mesmo facto.
  IF NEW.entity_id IS NULL OR COALESCE(NEW.is_manual_order, false) THEN
    RETURN NEW;
  END IF;

  v_meta := jsonb_build_object(
    'document_id', NEW.id,
    'number',      NEW.contract_number,
    'total',       NEW.total_value,
    'currency',    COALESCE(NEW.currency, 'EUR')
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_write_entity_history(NEW.entity_id, 'contract_created', 'contract', v_meta);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('signed', 'assinado') THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'contract_signed', 'contract', v_meta);
    ELSIF NEW.status = 'pending_signature' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'contract_pending_signature', 'contract', v_meta);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.fn_write_entity_history(NEW.entity_id, 'contract_cancelled', 'contract', v_meta);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contract_timeline_history ON public.client_contracts;
CREATE TRIGGER trg_contract_timeline_history
  AFTER INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_contract_timeline_history();
