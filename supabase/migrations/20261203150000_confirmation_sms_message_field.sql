-- Campo de texto para a mensagem de SMS de confirmacao, ao lado do
-- interruptor "Tambem por SMS" ja existente em form_branding
-- (confirmation_sms_enabled, 20261203140000).
--
-- NULL por omissao (nenhum formulario existente muda de comportamento):
-- book-slot continua a usar a mensagem fixa de hoje quando este campo
-- estiver vazio, e passa a usar o texto configurado quando alguem o
-- preencher. Mesmas variaveis {{...}} que o email ja usa, renderizadas
-- com a mesma funcao renderSubject (texto simples, sem HTML).

ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS confirmation_sms_message TEXT;

COMMENT ON COLUMN public.form_branding.confirmation_sms_message IS
  'Texto do SMS de confirmacao enviado quando confirmation_sms_enabled = true. Aceita as mesmas variaveis {{lead_name}}, {{meeting_date}}, {{company_name}}, {{cancel_url}}, etc. usadas nos modelos de email (ver baseVars em book-slot/index.ts). NULL (omissao) = usa a mensagem por omissao fixa no codigo.';
