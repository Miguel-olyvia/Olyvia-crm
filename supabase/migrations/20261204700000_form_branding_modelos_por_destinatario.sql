-- Modelo de email PROPRIO por destinatario (cliente / comercial) para o lembrete,
-- o reagendamento e o cancelamento, em form_branding. A confirmacao e o aviso de
-- marcacao ja tem coluna propria; estas cinco completam o quadro.
--
-- ATENCAO: esta migration e o codigo entram juntos. O codigo que le estas colunas
-- (supabase/functions/_shared/formEmails.ts, loadFormEmailConfig, e todas as
-- funcoes que o importam: cancel-booking, book-slot, reschedule-booking, ...)
-- pede-as no select: publicar esse codigo ANTES desta migration faz falhar a
-- leitura da configuracao de email de todos os formularios.
--
-- Puramente aditiva. Nullable, sem CHECK: null = "igual ao do cliente" (comercial)
-- ou texto padrao do sistema (cliente), portanto quem nao configurar nada fica
-- exactamente como hoje. A RLS de form_branding cobre as colunas novas.
ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS reminder_technician_template_id    UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_client_template_id      UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_technician_template_id  UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_client_template_id          UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_technician_template_id      UUID REFERENCES public.email_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.form_branding.reminder_technician_template_id IS
  'Modelo do lembrete enviado ao comercial; null = usa o do cliente (reminder_template_id).';
COMMENT ON COLUMN public.form_branding.reschedule_client_template_id IS
  'Modelo do aviso de reagendamento ao cliente; null = usa meeting_notify_template_id ou o texto padrao.';
COMMENT ON COLUMN public.form_branding.reschedule_technician_template_id IS
  'Modelo do aviso de reagendamento ao comercial; null = usa o do cliente.';
COMMENT ON COLUMN public.form_branding.cancel_client_template_id IS
  'Modelo do aviso de cancelamento ao cliente; null = texto padrao do sistema.';
COMMENT ON COLUMN public.form_branding.cancel_technician_template_id IS
  'Modelo do aviso de cancelamento ao comercial; null = usa o do cliente.';

-- Conferencia: as cinco colunas existem, sao uuid, e cada uma tem FK a
-- email_templates(id) com ON DELETE SET NULL.
DO $$
DECLARE
  v_col text;
  v_cols text[] := ARRAY[
    'reminder_technician_template_id',
    'reschedule_client_template_id',
    'reschedule_technician_template_id',
    'cancel_client_template_id',
    'cancel_technician_template_id'
  ];
BEGIN
  FOREACH v_col IN ARRAY v_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'form_branding'
        AND column_name = v_col AND data_type = 'uuid' AND is_nullable = 'YES'
    ) THEN
      RAISE EXCEPTION 'form_branding.% em falta ou com tipo errado', v_col;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.form_branding'::regclass
        AND c.confrelid = 'public.email_templates'::regclass
        AND c.confdeltype = 'n'
        AND a.attname = v_col
    ) THEN
      RAISE EXCEPTION 'form_branding.% sem FK a email_templates com ON DELETE SET NULL', v_col;
    END IF;
  END LOOP;
END $$;
