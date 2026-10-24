-- Aviso ao CLIENTE ao reagendar e ao cancelar pelo link: interruptor proprio,
-- como o do comercial (reschedule_notify_commercial / cancel_notify_commercial).
--
-- Ate aqui o cliente recebia sempre estes dois emails. As colunas novas nascem
-- LIGADAS (DEFAULT true, NOT NULL), por isso nenhum formulario existente muda de
-- comportamento: ligado = envia (como hoje), desligado = nao envia o email ao
-- cliente nesse evento. Nao mexe no aviso da Agenda (notify-schedule-change), no
-- lembrete nem na confirmacao da marcacao.
--
-- ATENCAO, ORDEM DE APLICACAO: formEmails.ts, reschedule-booking, cancel-booking,
-- book-slot, create-lead, update-lead e notify-schedule-change seleccionam estas
-- colunas. Aplicar esta migration ANTES de publicar qualquer uma delas. Se o
-- codigo for publicado primeiro, o select falha, loadFormEmailConfig devolve null
-- e todas as regras de email do formulario caem em silencio.
-- O ecra (FormEmailsTab / FormBrandingConfig) tambem pede estas colunas.

ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS reschedule_notify_client boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancel_notify_client boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.form_branding.reschedule_notify_client IS
  'Se o cliente recebe email quando reagenda a visita pelo link. Ligado por omissao (comportamento anterior).';
COMMENT ON COLUMN public.form_branding.cancel_notify_client IS
  'Se o cliente recebe email quando cancela a visita pelo link. Ligado por omissao (comportamento anterior).';

-- Conferencia: as duas colunas existem, sao NOT NULL, default true, e nenhuma
-- linha existente ficou desligada.
DO $$
DECLARE
  v_col text;
  v_nullable text;
  v_default text;
  v_off bigint;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['reschedule_notify_client', 'cancel_notify_client'] LOOP
    SELECT is_nullable, column_default
      INTO v_nullable, v_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'form_branding'
       AND column_name = v_col;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'form_branding.% nao existe', v_col;
    END IF;
    IF v_nullable <> 'NO' THEN
      RAISE EXCEPTION 'form_branding.% devia ser NOT NULL', v_col;
    END IF;
    IF v_default IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'form_branding.% devia ter default true (tem %)', v_col, v_default;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_off
    FROM public.form_branding
   WHERE NOT reschedule_notify_client OR NOT cancel_notify_client;

  IF v_off <> 0 THEN
    RAISE EXCEPTION '% formularios ficaram com o aviso ao cliente desligado; devia ser 0', v_off;
  END IF;
END
$$;
