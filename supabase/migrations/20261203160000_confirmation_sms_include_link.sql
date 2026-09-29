-- Interruptor para incluir (ou nao) o link de gerir/cancelar no SMS de
-- confirmacao. Por omissao DESLIGADO: a conta SMSAPI partilhada da Olyvia
-- (mesma do sms-otp) recusa hoje qualquer SMS com link para remetentes nao
-- verificados (erro 94 "Not allowed to send messages with link"), confirmado
-- ao vivo em 22/09. Ligar isto sem a verificacao do remetente feita do lado
-- da SMSAPI faz o SMS falhar sempre, em silencio (fail-soft, como o resto do
-- envio). NULL nao se aplica aqui -- boolean com omissao segura.

ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS confirmation_sms_include_link BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.form_branding.confirmation_sms_include_link IS
  'Se true, {{cancel_url}} e substituido pelo link real no SMS de confirmacao (default e mensagem personalizada). Se false (omissao), {{cancel_url}} fica vazio no SMS -- a conta SMSAPI partilhada da Olyvia bloqueia SMS com links para remetentes nao verificados. O email nao e afetado por este campo.';
