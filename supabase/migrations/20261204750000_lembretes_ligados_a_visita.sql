-- Lembretes que acompanham a visita.
--
-- Problema: os lembretes (scheduled_emails / scheduled_sms) eram criados uma so
-- vez, na marcacao, e so o link publico de reagendamento os refazia. Arrastar a
-- hora no CRM, mudar o recurso, reatribuir a lead ou cancelar nao lhes tocava:
-- o comercial recebia o lembrete de uma visita que ja nao era dele, ou de uma
-- hora que ja nao era essa.
--
-- Desenho: cada lembrete passa a saber a que visita pertence (schedule_item_id)
-- e a quem se destina (audience: cliente ou comercial). Os processadores
-- (process-scheduled-emails / process-scheduled-sms) comparam, antes de cada
-- lote, o estado actual da visita com o que cada lembrete pendente assume, e
-- acertam-no: cancelar, mover para "nova hora - intervalo do formulario",
-- cancelar o do comercial retirado, criar o do comercial acrescentado. Um unico
-- ponto cobre todos os caminhos, incluindo os que so existem na base.
--
-- ATENCAO: esta migration e o codigo entram juntos.
--  * O codigo novo (book-slot, reschedule-booking, cancel-booking,
--    process-scheduled-emails, process-scheduled-sms) escreve estas colunas e
--    chama fn_reminder_drift: publicar esse codigo ANTES desta migration faz
--    falhar as escritas e o processamento. Aplicar esta migration ANTES do deploy.
--  * Sem o codigo novo, esta migration e inofensiva: as colunas sao nullable, o
--    indice so vale para linhas ligadas (todas as actuais ficam nao ligadas) e as
--    linhas nao ligadas seguem o caminho de sempre.
--
-- Escritas em dados: SO o religar aditivo das pendentes de visita da organizacao
-- nike (b6ffce4f-f630-4933-833a-008649757a33). Preenche colunas novas; nunca toca
-- em to_email, scheduled_for, status nem no conteudo. As restantes organizacoes
-- (Mudelar incluida) NAO sao tocadas por esta migration.
--
-- schedule_item_id e uuid SEM chave estrangeira, de proposito: se a visita for
-- apagada, a linha pendente tem de continuar ligada a ela para o processador a
-- ver desaparecer e a cancelar (com SET NULL ficava "solta" e seguia o caminho
-- antigo, enviando o lembrete de uma visita que ja nao existe).

-- ---- 1. Colunas novas (nullable, aditivas) ---------------------------------
ALTER TABLE public.scheduled_emails
  ADD COLUMN IF NOT EXISTS schedule_item_id      uuid,
  ADD COLUMN IF NOT EXISTS audience              text,
  ADD COLUMN IF NOT EXISTS form_id               uuid,
  ADD COLUMN IF NOT EXISTS locale                text,
  ADD COLUMN IF NOT EXISTS visit_start_snapshot  timestamptz,
  ADD COLUMN IF NOT EXISTS content_vars          jsonb;

ALTER TABLE public.scheduled_sms
  ADD COLUMN IF NOT EXISTS schedule_item_id      uuid,
  ADD COLUMN IF NOT EXISTS audience              text,
  ADD COLUMN IF NOT EXISTS form_id               uuid,
  ADD COLUMN IF NOT EXISTS locale                text,
  ADD COLUMN IF NOT EXISTS visit_start_snapshot  timestamptz,
  ADD COLUMN IF NOT EXISTS content_vars          jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_emails_audience_check'
                 AND conrelid = 'public.scheduled_emails'::regclass) THEN
    ALTER TABLE public.scheduled_emails
      ADD CONSTRAINT scheduled_emails_audience_check
      CHECK (audience IS NULL OR audience IN ('client', 'technician'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_sms_audience_check'
                 AND conrelid = 'public.scheduled_sms'::regclass) THEN
    ALTER TABLE public.scheduled_sms
      ADD CONSTRAINT scheduled_sms_audience_check
      CHECK (audience IS NULL OR audience IN ('client', 'technician'));
  END IF;
END $$;

COMMENT ON COLUMN public.scheduled_emails.schedule_item_id IS
  'Visita (schedule_items.id) a que este lembrete pertence. null = email que nao e lembrete de visita (convites, emails por fase): segue o caminho de sempre. Sem FK de proposito.';
COMMENT ON COLUMN public.scheduled_emails.audience IS
  'Destinatario do lembrete de visita: client ou technician.';
COMMENT ON COLUMN public.scheduled_emails.form_id IS
  'Formulario da marcacao; o processador le dele o intervalo e o remetente actuais.';
COMMENT ON COLUMN public.scheduled_emails.visit_start_snapshot IS
  'Hora da visita que este lembrete assumia quando foi agendado; se a visita ja tem outra hora, o processador move o lembrete.';
COMMENT ON COLUMN public.scheduled_emails.content_vars IS
  'Variaveis do modelo (nome, contactos, ligacoes) para o processador montar assunto e corpo no envio, com a hora e o comercial actuais. null = usa o assunto/corpo guardados.';
COMMENT ON COLUMN public.scheduled_sms.schedule_item_id IS
  'Visita (schedule_items.id) a que este lembrete pertence. null = segue o caminho de sempre. Sem FK de proposito.';
COMMENT ON COLUMN public.scheduled_sms.content_vars IS
  'Variaveis para montar o SMS no envio; em linhas ligadas a visita, message guarda o texto com {{variaveis}}.';

-- ---- 2. Idempotencia: uma linha pendente por visita, destinatario e canal --
-- O destinatario e parte da chave: uma visita com varios comerciais tem uma
-- linha por comercial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_emails_visit_reminder
  ON public.scheduled_emails (schedule_item_id, audience, lower(to_email))
  WHERE status = 'pending' AND schedule_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_sms_visit_reminder
  ON public.scheduled_sms (schedule_item_id, audience, to_phone)
  WHERE status = 'pending' AND schedule_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_item
  ON public.scheduled_emails (schedule_item_id) WHERE schedule_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_item
  ON public.scheduled_sms (schedule_item_id) WHERE schedule_item_id IS NOT NULL;

-- ---- 2b. Travao: tentativas de criar o lembrete de um comercial acrescentado --
-- Quando o lembrete do comercial nao se consegue criar (falta configuracao ou
-- variaveis), a visita nao pode voltar a ser proposta a cada corrida. O processador
-- regista aqui a tentativa e fn_reminder_drift so volta a propor passado um tempo.
-- Tabela so do service_role: sem politicas, sem acesso a anon/authenticated.
CREATE TABLE IF NOT EXISTS public.reminder_create_attempts (
  item_id      uuid        NOT NULL,
  email        text        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, email)
);
ALTER TABLE public.reminder_create_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reminder_create_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_create_attempts TO service_role;
COMMENT ON TABLE public.reminder_create_attempts IS
  'Ultima tentativa (falhada) de criar o lembrete de um comercial numa visita; fn_reminder_drift so repropoe a visita 30 minutos depois. So service_role.';

-- ---- 3. Que visitas precisam de acerto? -------------------------------------
-- So devolve candidatos; quem decide e aplica e o codigo (reminderReconcile.ts).
-- Uma visita e candidata quando algum lembrete pendente ligado a ela:
--   - aponta para uma visita apagada, cancelada ou ja comecada;
--   - assume uma hora diferente da actual;
--   - e do comercial e esse comercial ja nao esta na visita;
-- ou quando a visita tem um comercial (com email) sem lembrete e ainda ha tempo
-- de o criar (o formulario tem lembrete ligado e a hora do lembrete e futura).
-- Se o lembrete do comercial acrescentado nao se conseguiu criar, a visita so
-- volta a ser proposta 30 minutos depois da ultima tentativa (reminder_create_attempts),
-- e as visitas saem por ordem (a de lembrete mais antigo primeiro) para uma
-- visita teimosa nunca ocupar o lote e deixar as outras por acertar.
CREATE OR REPLACE FUNCTION public.fn_reminder_drift(p_limit integer DEFAULT 50)
RETURNS TABLE (out_item_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pend AS (
    SELECT e.schedule_item_id AS item_id, e.visit_start_snapshot AS snap, e.audience,
           lower(btrim(e.to_email)) AS rcpt, e.form_id, e.scheduled_for AS due
    FROM public.scheduled_emails e
    WHERE e.status = 'pending' AND e.schedule_item_id IS NOT NULL
    UNION ALL
    SELECT s.schedule_item_id, s.visit_start_snapshot, s.audience, NULL::text, s.form_id, s.scheduled_for
    FROM public.scheduled_sms s
    WHERE s.status = 'pending' AND s.schedule_item_id IS NOT NULL
  ),
  items AS (
    SELECT p.item_id, (array_agg(p.form_id) FILTER (WHERE p.form_id IS NOT NULL))[1] AS form_id,
           min(p.due) AS first_due
    FROM pend p
    GROUP BY p.item_id
  ),
  techs AS (
    SELECT a.item_id, lower(btrim(u.email)) AS email
    FROM public.schedule_item_assignees a
    JOIN public.schedule_resources r ON r.id = a.resource_id
    JOIN public.anew_users u ON u.id = r.user_id
    WHERE a.item_id IN (SELECT i0.item_id FROM items i0)
      AND btrim(coalesce(u.email, '')) <> ''
  )
  SELECT i.item_id
  FROM items i
  LEFT JOIN public.schedule_items si ON si.id = i.item_id
  LEFT JOIN public.form_branding fb ON fb.form_id = i.form_id
  WHERE si.id IS NULL
     OR si.status::text = 'cancelled'
     OR si.start_datetime <= now()
     OR EXISTS (SELECT 1 FROM pend p
                WHERE p.item_id = i.item_id AND p.snap IS DISTINCT FROM si.start_datetime)
     OR EXISTS (SELECT 1 FROM pend p
                WHERE p.item_id = i.item_id AND p.audience = 'technician' AND p.rcpt IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM techs t WHERE t.item_id = i.item_id AND t.email = p.rcpt))
     OR EXISTS (SELECT 1 FROM techs t
                WHERE t.item_id = i.item_id
                  AND fb.reminder_enabled IS TRUE
                  AND fb.reminder_hours_before > 0
                  AND si.start_datetime - make_interval(hours => fb.reminder_hours_before) > now()
                  AND NOT EXISTS (
                    SELECT 1 FROM public.scheduled_emails e2
                    WHERE e2.schedule_item_id = i.item_id AND e2.audience = 'technician'
                      AND lower(btrim(e2.to_email)) = t.email
                      AND e2.status IN ('pending', 'sent', 'failed'))
                  AND NOT EXISTS (
                    SELECT 1 FROM public.reminder_create_attempts ra
                    WHERE ra.item_id = i.item_id AND ra.email = t.email
                      AND ra.attempted_at > now() - interval '30 minutes'))
  ORDER BY i.first_due, i.item_id
  LIMIT greatest(coalesce(p_limit, 50), 1);
$$;

REVOKE ALL ON FUNCTION public.fn_reminder_drift(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reminder_drift(integer) TO service_role;

COMMENT ON FUNCTION public.fn_reminder_drift(integer) IS
  'Visitas com lembretes pendentes ligados cujo estado actual ja nao bate certo com o que os lembretes assumem. So service_role; quem a chama e o processador de lembretes.';

-- ---- 4. Religar as pendentes de visita ja existentes: SO NIKE ---------------
-- Puramente aditivo: preenche as colunas novas, nao toca em to_email,
-- scheduled_for, status nem conteudo. Linhas que nao se sabe classificar (nem o
-- email da lead nem o de um comercial da visita) ficam como estao. Se houver
-- duas linhas iguais para o mesmo destinatario, so a mais antiga e religada
-- (o indice unico nao admite as duas); a outra segue o caminho de sempre.
-- snapshot: a hora que o lembrete assumia = scheduled_for + intervalo actual do
-- formulario; se a visita entretanto mudou de hora, isso difere da hora actual e
-- o processador move o lembrete. Sem formulario, assume-se a hora actual.
WITH cand AS (
  SELECT e.id, e.created_at, e.scheduled_for, l.scheduled_visit_id AS item_id,
         si.start_datetime,
         CASE WHEN si.metadata->>'form_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (si.metadata->>'form_id')::uuid END AS form_id,
         lower(btrim(e.to_email)) AS rcpt,
         lower(btrim(coalesce(l.field_values->>'email', l.field_values->>'po_email', l.field_values->>'Email', ''))) AS lead_email,
         l.locale
  FROM public.scheduled_emails e
  JOIN public.anew_leads l ON e.entity_type = 'leads' AND l.id = e.entity_id
  JOIN public.schedule_items si ON si.id = l.scheduled_visit_id
  LEFT JOIN public.email_templates t ON t.id = e.template_id
  WHERE e.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
    AND e.status = 'pending'
    AND e.schedule_item_id IS NULL
    AND (e.template_id IS NULL OR t.trigger_phase IS NULL)
    AND si.status::text <> 'cancelled'
    AND si.start_datetime > now()
),
classed AS (
  SELECT c.*,
    CASE
      WHEN c.rcpt <> '' AND c.rcpt = c.lead_email THEN 'client'
      WHEN EXISTS (
        SELECT 1 FROM public.schedule_item_assignees a
        JOIN public.schedule_resources r ON r.id = a.resource_id
        JOIN public.anew_users u ON u.id = r.user_id
        WHERE a.item_id = c.item_id AND lower(btrim(coalesce(u.email, ''))) = c.rcpt
      ) THEN 'technician'
    END AS audience
  FROM cand c
),
dedup AS (
  SELECT DISTINCT ON (x.item_id, x.audience, x.rcpt) x.*
  FROM classed x
  WHERE x.audience IS NOT NULL
  ORDER BY x.item_id, x.audience, x.rcpt, x.created_at, x.id
)
UPDATE public.scheduled_emails e
SET schedule_item_id = d.item_id,
    audience = d.audience,
    form_id = d.form_id,
    locale = d.locale,
    visit_start_snapshot = coalesce(
      d.scheduled_for + make_interval(hours => fb.reminder_hours_before),
      d.start_datetime)
FROM dedup d
LEFT JOIN public.form_branding fb ON fb.form_id = d.form_id AND fb.reminder_hours_before > 0
WHERE e.id = d.id
  AND e.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
  AND e.status = 'pending'
  AND e.schedule_item_id IS NULL;

WITH cand AS (
  SELECT s.id, s.created_at, s.scheduled_for, l.scheduled_visit_id AS item_id,
         si.start_datetime,
         CASE WHEN si.metadata->>'form_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (si.metadata->>'form_id')::uuid END AS form_id,
         s.to_phone, l.locale
  FROM public.scheduled_sms s
  JOIN public.anew_leads l ON s.entity_type = 'leads' AND l.id = s.entity_id
  JOIN public.schedule_items si ON si.id = l.scheduled_visit_id
  WHERE s.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
    AND s.status = 'pending'
    AND s.schedule_item_id IS NULL
    AND si.status::text <> 'cancelled'
    AND si.start_datetime > now()
),
dedup AS (
  SELECT DISTINCT ON (x.item_id, x.to_phone) x.*
  FROM cand x
  ORDER BY x.item_id, x.to_phone, x.created_at, x.id
)
UPDATE public.scheduled_sms s
SET schedule_item_id = d.item_id,
    audience = 'client',
    form_id = d.form_id,
    locale = d.locale,
    visit_start_snapshot = coalesce(
      d.scheduled_for + make_interval(hours => fb.reminder_hours_before),
      d.start_datetime)
FROM dedup d
LEFT JOIN public.form_branding fb ON fb.form_id = d.form_id AND fb.reminder_hours_before > 0
WHERE s.id = d.id
  AND s.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
  AND s.status = 'pending'
  AND s.schedule_item_id IS NULL;

-- ---- 5. Conferencia ---------------------------------------------------------
DO $$
DECLARE
  v_col text;
  v_tbl text;
  v_outside bigint;
  v_email_linked bigint;
  v_email_unlinked bigint;
  v_sms_linked bigint;
  v_sms_unlinked bigint;
  v_priv boolean;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['scheduled_emails', 'scheduled_sms'] LOOP
    FOREACH v_col IN ARRAY ARRAY['schedule_item_id', 'audience', 'form_id', 'locale', 'visit_start_snapshot', 'content_vars'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = v_col
      ) THEN
        RAISE EXCEPTION '%.% em falta', v_tbl, v_col;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_scheduled_emails_visit_reminder')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_scheduled_sms_visit_reminder') THEN
    RAISE EXCEPTION 'indices unicos por destinatario em falta';
  END IF;

  -- fn_reminder_drift so para service_role.
  SELECT has_function_privilege('anon', 'public.fn_reminder_drift(integer)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.fn_reminder_drift(integer)', 'EXECUTE')
    INTO v_priv;
  IF v_priv THEN
    RAISE EXCEPTION 'fn_reminder_drift esta acessivel a anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_reminder_drift(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_reminder_drift nao esta acessivel ao service_role';
  END IF;
  PERFORM 1 FROM public.fn_reminder_drift(1);  -- corre, nao so compila

  -- reminder_create_attempts: existe, com RLS e sem acesso a anon/authenticated.
  IF to_regclass('public.reminder_create_attempts') IS NULL THEN
    RAISE EXCEPTION 'reminder_create_attempts em falta';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reminder_create_attempts'::regclass) THEN
    RAISE EXCEPTION 'reminder_create_attempts sem RLS';
  END IF;
  IF has_table_privilege('anon', 'public.reminder_create_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.reminder_create_attempts', 'SELECT') THEN
    RAISE EXCEPTION 'reminder_create_attempts acessivel a anon/authenticated';
  END IF;

  -- Nada fora da nike foi religado.
  SELECT (SELECT count(*) FROM public.scheduled_emails
           WHERE schedule_item_id IS NOT NULL AND organization_id IS DISTINCT FROM 'b6ffce4f-f630-4933-833a-008649757a33')
       + (SELECT count(*) FROM public.scheduled_sms
           WHERE schedule_item_id IS NOT NULL AND organization_id IS DISTINCT FROM 'b6ffce4f-f630-4933-833a-008649757a33')
    INTO v_outside;
  IF v_outside <> 0 THEN
    RAISE EXCEPTION 'foram religadas % linhas fora da organizacao nike', v_outside;
  END IF;

  SELECT count(*) INTO v_email_linked FROM public.scheduled_emails
    WHERE status = 'pending' AND schedule_item_id IS NOT NULL;
  SELECT count(*) INTO v_email_unlinked FROM public.scheduled_emails
    WHERE status = 'pending' AND schedule_item_id IS NULL
      AND organization_id = 'b6ffce4f-f630-4933-833a-008649757a33';
  SELECT count(*) INTO v_sms_linked FROM public.scheduled_sms
    WHERE status = 'pending' AND schedule_item_id IS NOT NULL;
  SELECT count(*) INTO v_sms_unlinked FROM public.scheduled_sms
    WHERE status = 'pending' AND schedule_item_id IS NULL
      AND organization_id = 'b6ffce4f-f630-4933-833a-008649757a33';
  RAISE NOTICE 'nike: emails pendentes ligados=%, por ligar=%; sms pendentes ligados=%, por ligar=%',
    v_email_linked, v_email_unlinked, v_sms_linked, v_sms_unlinked;
END $$;
