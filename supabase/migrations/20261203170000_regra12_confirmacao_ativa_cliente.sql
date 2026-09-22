-- Regra 12: confirmacao ativa do cliente. O link "Confirmo a visita" vive no
-- email do LEMBRETE (regra 3), nunca na confirmacao inicial de marcacao --
-- decisao explicita, so aparece quando "Lembrete antes da visita" esta
-- ligado. Segue exactamente o padrao ja existente de cancel-booking: um
-- booking_tokens novo, com action 'confirm', que confirm-booking valida e
-- queima como os outros.

-- schedule_items.confirmed_at: nulo por omissao, nenhuma marcacao existente
-- muda de estado. So fica preenchido quando o cliente clica no link.
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.schedule_items.confirmed_at IS
  'Preenchido quando o cliente confirma a visita pelo link no email do lembrete (confirm-booking). NULL = ainda nao confirmou (regra 12). O que fazer com quem nunca confirma fica fora desta entrega.';

-- O gatilho existente so aceitava 'cancel'/'reschedule' -- adicionar 'confirm'
-- a mesma lista, sem tocar em mais nada da funcao.
CREATE OR REPLACE FUNCTION "public"."validate_booking_token_action"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.action NOT IN ('cancel', 'reschedule', 'confirm') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be cancel, reschedule or confirm', NEW.action;
  END IF;
  RETURN NEW;
END;
$$;
