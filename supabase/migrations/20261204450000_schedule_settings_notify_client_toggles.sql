-- Dois interruptores por organizacao na Agenda: avisar o cliente/lead quando
-- um membro da equipa muda, no ecra interno da Agenda, (a) o dia/hora de uma
-- visita, ou (b) o comercial atribuido. Lidos pela edge function
-- notify-schedule-change. Puramente aditivo, false por omissao: nenhuma
-- organizacao passa a enviar nada ate ligar o interruptor.
-- Esta migration pode ser aplicada antes do codigo: sem o ecra e a funcao
-- novos, as colunas ficam simplesmente por usar.
ALTER TABLE public.schedule_settings
  ADD COLUMN IF NOT EXISTS notify_client_on_reschedule BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_client_on_reassign   BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_settings.notify_client_on_reschedule IS
  'Quando true, mudar dia/hora de uma visita na Agenda interna avisa o cliente (email/SMS conforme confirmation_email_enabled/confirmation_sms_enabled do formulario de origem).';
COMMENT ON COLUMN public.schedule_settings.notify_client_on_reassign IS
  'Quando true, mudar o comercial atribuido a uma visita na Agenda interna avisa o cliente com o nome do novo comercial.';
