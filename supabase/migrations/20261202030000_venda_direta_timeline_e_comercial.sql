-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Venda Direta — timeline da lead/cliente + comercial responsável          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── 1. Timeline ─────────────────────────────────────────────────────────────
-- As vendas diretas JÁ apareciam nas timelines, mas disfarçadas de ruído: o
-- trg_audit_direct_sales escreve em entity_audit_log, e o frontend traduz isso
-- em "Registo adicionado" (na lead) ou "Editou status: rascunho → enviada"
-- (nas duas), sem dizer sequer que se trata de uma venda direta. No cliente, a
-- criação nem aparece — só UPDATEs são processados.
--
-- A timeline não é uma tabela nem uma RPC: é montada no frontend a partir de
-- entity_interactions + anew_entity_history + entity_audit_log, sempre por
-- `entity_id`. Escrever eventos com nome próprio em `anew_entity_history` é o
-- caminho mais curto, porque AS DUAS fichas (lead e cliente) já leem essa
-- tabela — resolve-se de um lado só em vez de acrescentar uma query a cada um
-- dos três componentes de timeline.
--
-- Usa-se fn_write_entity_history, o mesmo helper que produz os "Criado",
-- "Qualificação alterada" e "Convertido". Engole as próprias exceções, por isso
-- um problema a escrever o histórico nunca pode impedir a venda de avançar.
--
-- ── 2. Comercial ────────────────────────────────────────────────────────────
-- `direct_sales.assigned_to` existia desde 20261201120000 mas nunca foi ligada
-- a nada. Passa a ser preenchida na criação, com o comercial da lead/cliente —
-- que tem PRIORIDADE sobre quem cria a venda. Quem responde pela venda é o
-- comercial a quem a lead estava atribuída, não quem carregou no botão.
--
-- Fica gravada e não muda depois: se a lead for reatribuída, as vendas
-- continuam do primeiro comercial (foi ele que as fez). O comercial actual da
-- lead mostra-se ao lado, lido ao vivo, quando for diferente.

-- ── Trigger de histórico ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_direct_sale_timeline_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_meta jsonb;
BEGIN
  -- Sem entidade não há ficha onde mostrar o evento.
  IF NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_meta := jsonb_build_object(
    'direct_sale_id', NEW.id,
    'sale_number',    NEW.sale_number,
    'total',          NEW.total,
    'currency',       COALESCE(NEW.currency, 'EUR')
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_write_entity_history(
      NEW.entity_id, 'direct_sale_created', 'direct_sale', v_meta
    );
    RETURN NEW;
  END IF;

  -- Soft delete e edições de linhas não são marcos: só transições de estado
  -- e a emissão da fatura entram na timeline.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'enviada' THEN
      PERFORM public.fn_write_entity_history(
        NEW.entity_id, 'direct_sale_sent', 'direct_sale', v_meta
      );
    ELSIF NEW.status = 'aceite' THEN
      PERFORM public.fn_write_entity_history(
        NEW.entity_id, 'direct_sale_accepted', 'direct_sale',
        v_meta || jsonb_build_object('proforma_number', NEW.proforma_number)
      );
    ELSIF NEW.status = 'rejeitada' THEN
      PERFORM public.fn_write_entity_history(
        NEW.entity_id, 'direct_sale_rejected', 'direct_sale',
        v_meta || jsonb_build_object('rejection_reason', NEW.rejection_reason)
      );
    ELSIF NEW.status = 'cancelada' THEN
      PERFORM public.fn_write_entity_history(
        NEW.entity_id, 'direct_sale_cancelled', 'direct_sale', v_meta
      );
    END IF;
  END IF;

  IF NEW.invoice_status = 'emitida' AND OLD.invoice_status IS DISTINCT FROM 'emitida' THEN
    PERFORM public.fn_write_entity_history(
      NEW.entity_id, 'direct_sale_invoiced', 'direct_sale',
      v_meta || jsonb_build_object('invoice_number', NEW.invoice_number)
    );
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_direct_sale_timeline_history() IS
  'Escreve os marcos da venda direta em anew_entity_history, para aparecerem '
  'com nome próprio na timeline da lead e do cliente (as duas leem essa tabela). '
  'Só transições de estado e a emissão da fatura — edições de linhas não são marcos.';

DROP TRIGGER IF EXISTS trg_direct_sale_timeline_history ON public.direct_sales;
CREATE TRIGGER trg_direct_sale_timeline_history
  AFTER INSERT OR UPDATE ON public.direct_sales
  FOR EACH ROW EXECUTE FUNCTION public.fn_direct_sale_timeline_history();

-- ── Backfill do comercial ───────────────────────────────────────────────────
-- Prioridade: comercial da lead → comercial do cliente → quem criou. As vendas
-- que já existem ficariam a mostrar o comercial actual da lead lido ao vivo, que
-- é exatamente a regra que não se quer (a venda é de quem a fez).

UPDATE public.direct_sales ds
   SET assigned_to = COALESCE(
         (SELECT l.assigned_to FROM public.anew_leads l
           WHERE l.entity_id = ds.entity_id
             AND l.organization_id = ds.organization_id
             AND l.deleted_at IS NULL
             AND l.assigned_to IS NOT NULL
           LIMIT 1),
         (SELECT c.assigned_to FROM public.anew_clients c
           WHERE c.entity_id = ds.entity_id
             AND c.organization_id = ds.organization_id
             AND c.deleted_at IS NULL
             AND c.assigned_to IS NOT NULL
           LIMIT 1),
         ds.created_by
       )
 WHERE ds.assigned_to IS NULL
   AND ds.deleted_at IS NULL;
