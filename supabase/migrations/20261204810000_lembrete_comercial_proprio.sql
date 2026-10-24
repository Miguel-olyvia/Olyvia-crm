-- Lembrete do comercial com interruptor e horas PROPRIOS, separados dos do cliente.
--
-- ATENCAO, ORDEM DE PUBLICACAO: o codigo depende desta migration.
--   _shared/formEmails.ts passa a pedir estas duas colunas no select da
--   configuracao de email; e importado por book-slot, reschedule-booking,
--   cancel-booking, process-scheduled-emails e process-scheduled-sms. Esta
--   migration tem de ser aplicada ANTES de publicar qualquer uma delas: com o
--   codigo novo e as colunas por criar, a leitura da configuracao de email falha
--   para TODOS os formularios, em silencio (a funcao segue como se nao houvesse
--   configuracao). O ecra do formulario tambem passa a gravar estas colunas.
--
-- 1. form_branding.reminder_technician_enabled / reminder_technician_hours_before
--    NULL = o comercial segue o valor do cliente (reminder_enabled /
--    reminder_hours_before); um valor explicito manda. Sem DEFAULT e sem escrever
--    nada nas linhas existentes: nenhum formulario muda de comportamento por
--    causa desta migration. As permissoes de form_branding sao da tabela inteira,
--    por isso as colunas novas ficam cobertas sem GRANT.
-- 2. fn_reminder_drift passa a respeitar a regra do comercial ao decidir se um
--    comercial sem lembrete deve ter um criado (mesma assinatura, mesmos grants).
--    Sem isto, um comercial com o lembrete desligado seria proposto para sempre.

-- ---- 1. Colunas -------------------------------------------------------------
ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS reminder_technician_enabled boolean NULL;

ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS reminder_technician_hours_before integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.form_branding'::regclass
      AND conname = 'form_branding_reminder_technician_hours_check'
  ) THEN
    ALTER TABLE public.form_branding
      ADD CONSTRAINT form_branding_reminder_technician_hours_check
      CHECK (reminder_technician_hours_before IS NULL OR reminder_technician_hours_before > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.form_branding.reminder_technician_enabled IS
  'Lembrete ao comercial ligado/desligado. NULL = segue reminder_enabled (o do cliente).';
COMMENT ON COLUMN public.form_branding.reminder_technician_hours_before IS
  'Horas de antecedencia do lembrete ao comercial. NULL = segue reminder_hours_before (o do cliente). Se preenchido, > 0.';

-- ---- 2. fn_reminder_drift respeita o interruptor e as horas do comercial -----
-- Igual a versao de 20261204750000, so a regra do comercial muda: interruptor =
-- o do comercial, senao o do cliente; horas = as do comercial (> 0), senao as do
-- cliente. Mantem o travao das tentativas e a ordenacao.
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
  LEFT JOIN LATERAL (
    SELECT coalesce(fb.reminder_technician_enabled, fb.reminder_enabled) AS t_on,
           CASE WHEN fb.reminder_technician_hours_before > 0
                THEN fb.reminder_technician_hours_before
                ELSE fb.reminder_hours_before END AS t_hours
  ) tr ON true
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
                  AND tr.t_on IS TRUE
                  AND tr.t_hours > 0
                  AND si.start_datetime - make_interval(hours => tr.t_hours) > now()
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
  'Visitas com lembretes pendentes ligados cujo estado actual ja nao bate certo com o que os lembretes assumem (o lembrete do comercial segue o interruptor e as horas do comercial, senao os do cliente). So service_role; quem a chama e o processador de lembretes.';

-- ---- 3. Conferir -------------------------------------------------------------
DO $$
DECLARE
  v_type text;
  v_nullable text;
  v_default text;
  v_filled bigint;
  v_priv boolean;
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['reminder_technician_enabled', 'reminder_technician_hours_before'] LOOP
    SELECT data_type, is_nullable, column_default
      INTO v_type, v_nullable, v_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'form_branding' AND column_name = v_col;
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'form_branding.% em falta', v_col;
    END IF;
    IF v_nullable <> 'YES' THEN
      RAISE EXCEPTION 'form_branding.% nao aceita vazio', v_col;
    END IF;
    IF v_default IS NOT NULL THEN
      RAISE EXCEPTION 'form_branding.% tem valor por omissao (%)', v_col, v_default;
    END IF;
  END LOOP;

  -- Nenhuma linha existente foi tocada.
  SELECT count(*) INTO v_filled
  FROM public.form_branding
  WHERE reminder_technician_enabled IS NOT NULL OR reminder_technician_hours_before IS NOT NULL;
  IF v_filled <> 0 THEN
    RAISE EXCEPTION '% formularios ficaram com o lembrete do comercial preenchido', v_filled;
  END IF;

  -- fn_reminder_drift: mesma assinatura, so para service_role, e corre de facto.
  IF to_regprocedure('public.fn_reminder_drift(integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_reminder_drift(integer) em falta';
  END IF;
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
END $$;
