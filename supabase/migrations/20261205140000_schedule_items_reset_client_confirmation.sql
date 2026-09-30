-- Confirmacao do cliente deixa de valer quando a visita muda de dia ou de hora.
--
-- O link "Confirmo" (confirm-booking) passa a pôr a visita em 'confirmed' e a
-- gravar confirmed_at. Se depois a visita for movida (reagendar pelo link,
-- arrastar ou editar na Agenda, reatribuir com nova hora, assistente de IA),
-- o cliente confirmou OUTRA hora: confirmed_at volta a NULL e o estado deixa
-- de ser 'confirmed'.
--
-- Regras do gatilho (BEFORE UPDATE, so quando start_datetime ou end_datetime
-- mudam de facto):
--   * confirmed_at := NULL.
--   * se o estado era 'confirmed' e continua 'confirmed' nesta escrita, passa a
--     'scheduled'. Se o fluxo ja definiu outro estado ('rescheduled' ao
--     arrastar, 'scheduled' no link), esse fica. Se alguem escolheu 'confirmed'
--     de proposito NESTA escrita (vindo de outro estado), a escolha fica, mas
--     sem a confirmacao do cliente.
--   * mudar so o comercial (mesma hora) nao toca em start/end: a confirmacao
--     mantem-se.
--
-- ORDEM DE APLICACAO: nao depende de codigo novo e pode ser aplicada ja. Aplicar
-- ANTES de publicar a confirm-booking nova (que grava status 'confirmed'):
-- sem este gatilho, mover uma visita confirmada deixaria o selo "Confirmado
-- pelo cliente" a apontar para a hora antiga.
--
-- Ordem dos BEFORE UPDATE em schedule_items (alfabetica): trg_prevent_... corre
-- antes deste; este so mexe em confirmed_at e status, nao afecta o veto de
-- feriados (que so deixa passar 'cancelled').

CREATE OR REPLACE FUNCTION public.fn_schedule_items_reset_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.start_datetime IS DISTINCT FROM NEW.start_datetime
     OR OLD.end_datetime IS DISTINCT FROM NEW.end_datetime THEN
    NEW.confirmed_at := NULL;
    IF OLD.status = 'confirmed' AND NEW.status = 'confirmed' THEN
      NEW.status := 'scheduled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_schedule_items_reset_confirmation() IS
  'Limpa confirmed_at (e tira o estado confirmed) quando a visita muda de dia ou hora: o cliente confirmou a hora anterior.';

DROP TRIGGER IF EXISTS trg_schedule_items_reset_confirmation ON public.schedule_items;
CREATE TRIGGER trg_schedule_items_reset_confirmation
  BEFORE UPDATE OF start_datetime, end_datetime ON public.schedule_items
  FOR EACH ROW
  WHEN (OLD.start_datetime IS DISTINCT FROM NEW.start_datetime
        OR OLD.end_datetime IS DISTINCT FROM NEW.end_datetime)
  EXECUTE FUNCTION public.fn_schedule_items_reset_confirmation();

-- ---------------------------------------------------------------------------
-- Conferir: o gatilho existe, e BEFORE UPDATE de linha, e corre depois do veto
-- de feriados (ordem alfabetica dos nomes).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_before_names text[];
BEGIN
  SELECT pg_get_triggerdef(t.oid) INTO v_def
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.schedule_items'::regclass
     AND t.tgname = 'trg_schedule_items_reset_confirmation'
     AND NOT t.tgisinternal;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'gatilho trg_schedule_items_reset_confirmation nao foi criado';
  END IF;
  IF v_def NOT LIKE '%BEFORE UPDATE OF start_datetime, end_datetime%' THEN
    RAISE EXCEPTION 'gatilho com definicao inesperada: %', v_def;
  END IF;

  SELECT array_agg(t.tgname::text ORDER BY t.tgname) INTO v_before_names
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.schedule_items'::regclass
     AND NOT t.tgisinternal
     AND (t.tgtype & 2) = 2     -- BEFORE
     AND (t.tgtype & 16) = 16;  -- UPDATE

  IF array_position(v_before_names, 'trg_prevent_schedule_items_on_holidays')
       > array_position(v_before_names, 'trg_schedule_items_reset_confirmation') THEN
    RAISE EXCEPTION 'ordem dos BEFORE UPDATE inesperada: %', v_before_names;
  END IF;
END
$$;
