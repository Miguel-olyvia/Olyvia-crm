-- Regra 11: ecra interno com as falhas de envio de SMS/email, filtrado por
-- scope (proprio/equipa/organizacao), com reenviar.
--
-- Hoje o SMS nao deixa rasto nenhum quando falha -- so console.error, que
-- desaparece. sms_logs espelha email_logs (mesma forma, mesmo padrao de RLS)
-- para o ecra poder juntar as duas fontes.

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.anew_organizations(id) ON DELETE SET NULL,
  -- Quem criou o envio (o booker da marcacao) -- equivalente ao created_by
  -- que applyScopeFilter/usePermissionScope ja esperam nas outras listas.
  created_by UUID REFERENCES public.anew_users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id UUID,
  to_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_org_status ON public.sms_logs (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_entity ON public.sms_logs (entity_type, entity_id);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- Mesmo padrao do email_logs: visivel a quem ve a organizacao; escritas
-- ficam so para o service role das edge functions (sem policy de insert).
CREATE POLICY "Users can view sms logs in their orgs" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

COMMENT ON TABLE public.sms_logs IS
  'Historico de envios de SMS (sucesso e falha), espelhando email_logs. Alimenta o ecra de falhas de envio (regra 11) e o reenviar.';
