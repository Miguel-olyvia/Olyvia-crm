-- Configuracao PROPRIA da Agenda para o aviso ao cliente quando uma visita muda
-- de dia/hora ou de comercial: canais (email e/ou SMS) e modelo por evento, mais
-- SMTP e link no SMS comuns. Deixa de depender do formulario de origem da lead.
-- Lidas pela edge function notify-schedule-change.
--
-- ATENCAO: esta migration e o codigo entram juntos. A funcao tem de ser
-- publicada com `supabase functions deploy notify-schedule-change`; sem isso
-- as colunas ficam por usar e a funcao antiga continua a seguir o formulario.
--
-- Puramente aditiva. Email ligado e SMS desligado por omissao (o SMS tem custo).
-- Sem CHECK: um evento ligado com os dois canais desligados e valido e nao envia nada.
-- A RLS de schedule_settings nao muda: cobre as colunas novas.
ALTER TABLE public.schedule_settings
  ADD COLUMN IF NOT EXISTS reschedule_notify_email       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reschedule_notify_sms         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reschedule_email_template_id  UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_sms_message        TEXT,
  ADD COLUMN IF NOT EXISTS reassign_notify_email         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reassign_notify_sms           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reassign_email_template_id    UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reassign_sms_message          TEXT,
  ADD COLUMN IF NOT EXISTS notify_client_smtp_id         UUID REFERENCES public.organization_smtp_settings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_client_sms_include_link BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_settings.reschedule_notify_email IS
  'Aviso de mudanca de dia/hora: enviar por email.';
COMMENT ON COLUMN public.schedule_settings.reschedule_notify_sms IS
  'Aviso de mudanca de dia/hora: enviar por SMS.';
COMMENT ON COLUMN public.schedule_settings.reschedule_email_template_id IS
  'Modelo de email do aviso de mudanca de dia/hora; null = texto padrao do sistema.';
COMMENT ON COLUMN public.schedule_settings.reschedule_sms_message IS
  'Texto do SMS de mudanca de dia/hora (variaveis {{lead_name}}, {{meeting_date}}, {{company_name}}, {{technician_name}}, {{cancel_url}}); null/vazio = texto padrao.';
COMMENT ON COLUMN public.schedule_settings.reassign_notify_email IS
  'Aviso de mudanca de comercial: enviar por email.';
COMMENT ON COLUMN public.schedule_settings.reassign_notify_sms IS
  'Aviso de mudanca de comercial: enviar por SMS.';
COMMENT ON COLUMN public.schedule_settings.reassign_email_template_id IS
  'Modelo de email do aviso de mudanca de comercial; null = texto padrao do sistema.';
COMMENT ON COLUMN public.schedule_settings.reassign_sms_message IS
  'Texto do SMS de mudanca de comercial; null/vazio = texto padrao.';
COMMENT ON COLUMN public.schedule_settings.notify_client_smtp_id IS
  'SMTP usado nos avisos da Agenda; null = SMTP padrao da organizacao.';
COMMENT ON COLUMN public.schedule_settings.notify_client_sms_include_link IS
  'Incluir o link de gerir agendamento no SMS (desligado por omissao por causa do erro 94 da SMSAPI).';
