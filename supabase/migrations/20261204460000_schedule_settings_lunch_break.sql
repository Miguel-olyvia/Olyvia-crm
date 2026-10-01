-- Pausa de almoco na Agenda (regra 13): quando uma visita TERMINA dentro da
-- janela [lunch_window_start, lunch_window_end] (hora local de
-- schedule_settings.timezone, extremos incluidos), a folga ate a visita
-- seguinte desse comercial tem de ser tempo de deslocacao + lunch_duration_minutes.
-- Soma-se SEMPRE a duracao a seguir ao fim da visita; nunca se conta a partir
-- do fim da janela.
-- Tudo NULL (omissao) = regra desligada. Puramente aditiva: pode ser aplicada
-- antes do codigo. As colunas ficam por usar ate as edge functions
-- book-slot / public-availability / suggest-schedule-assignee serem publicadas.
ALTER TABLE public.schedule_settings
  ADD COLUMN IF NOT EXISTS lunch_window_start     TIME    NULL,
  ADD COLUMN IF NOT EXISTS lunch_window_end       TIME    NULL,
  ADD COLUMN IF NOT EXISTS lunch_duration_minutes INTEGER NULL;

ALTER TABLE public.schedule_settings
  ADD CONSTRAINT schedule_settings_lunch_all_or_none
    CHECK (num_nonnulls(lunch_window_start, lunch_window_end, lunch_duration_minutes) IN (0, 3)),
  ADD CONSTRAINT schedule_settings_lunch_window_order
    CHECK (lunch_window_start IS NULL OR lunch_window_end IS NULL OR lunch_window_start < lunch_window_end),
  ADD CONSTRAINT schedule_settings_lunch_duration_range
    CHECK (lunch_duration_minutes IS NULL OR lunch_duration_minutes BETWEEN 1 AND 240);

COMMENT ON COLUMN public.schedule_settings.lunch_window_start IS
  'Inicio (hora local, fuso em timezone) da janela onde se verifica se uma visita termina no almoco. NULL = sem regra de almoco.';
COMMENT ON COLUMN public.schedule_settings.lunch_window_end IS
  'Fim (hora local, incluido) da janela de almoco. NULL = sem regra de almoco.';
COMMENT ON COLUMN public.schedule_settings.lunch_duration_minutes IS
  'Minutos de almoco somados ao tempo de deslocacao a seguir a uma visita que termina dentro da janela. NULL = sem regra.';
