-- Regra 3 (continuacao): lembrete por SMS, X horas antes da visita --
-- ate agora so existia por email. Espelha scheduled_emails/process-scheduled-emails,
-- mas mais simples: sendSmsNow e chamado directamente de dentro da propria
-- funcao de cron, sem precisar de saltar para outra edge function (foi
-- exactamente esse salto, com uma credencial sem formato de JWT, que
-- mantinha os lembretes de email "enviados" sem nunca terem saido -- ver
-- migration 20261203180000 e o commit que a acompanha).

CREATE TABLE IF NOT EXISTS public.scheduled_sms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.anew_organizations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.anew_users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id UUID,
  to_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sms_due ON public.scheduled_sms (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_entity ON public.scheduled_sms (entity_type, entity_id);

ALTER TABLE public.scheduled_sms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scheduled sms in their orgs" ON public.scheduled_sms
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

COMMENT ON TABLE public.scheduled_sms IS
  'Lembretes por SMS pendentes de envio (regra 3), agendados para X horas antes da visita. Processados pelo cron process-scheduled-sms, que envia via sendSmsNow directamente (sem chamada de rede a outra funcao) e regista o resultado em sms_logs.';

-- Cron a cada 5 minutos, mesmo padrao/credencial ja usado pelos outros jobs
-- (cron_service_role_key no Vault) -- consistente com process-scheduled-emails.
SELECT cron.schedule(
  'process-scheduled-sms',
  '*/5 * * * *',
  $cmd$
  SELECT net.http_post(
    url:='https://tzbfgwpckrfbqcolqxtm.supabase.co/functions/v1/process-scheduled-sms',
    headers:=jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $cmd$
);
