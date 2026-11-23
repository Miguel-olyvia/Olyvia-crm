-- =============================================================================
-- A confirmacao da visita ao cliente sai quando a EMPRESA confirma na Agenda
-- (desenho: vault/ficheiros/agendamento/confirmacao-da-visita-ao-confirmar-na-agenda.md)
--
-- ADITIVA E IDEMPOTENTE. Por omissao NAO muda nada a ninguem:
--   * form_branding.confirmation_send_on = 'booking' em todos os formularios
--     (comportamento de hoje: o book-slot envia logo ao marcar);
--   * schedule_settings.send_confirmation_on_confirm = false em todas as
--     organizacoes (visitas criadas no CRM continuam sem confirmacao);
--   * schedule_items.confirmation_send_on fica NULL em todas as visitas que ja
--     existem (= modo antigo) -- ligar o modo novo num formulario so afecta as
--     visitas marcadas DEPOIS, porque o modo grava-se na visita ao cria-la.
--
-- O QUE CRIA
--   1. form_branding.confirmation_send_on ('booking' | 'agenda_confirm')
--   2. schedule_settings.send_confirmation_on_confirm (interruptor do CRM)
--   3. schedule_items.confirmation_send_on (modo gravado na propria visita;
--      coluna e nao metadata, porque rpc_update_schedule_item substitui o
--      metadata inteiro quando o ecra o envia)
--   4. Fila visit_confirmation_sends (uma linha por canal email/sms), RLS
--      ligada SEM politicas (fechada nas 4 operacoes para anon/authenticated);
--      so a service_role (edge function send-visit-confirmation) lhe escreve.
--   5. Gatilho BEFORE INSERT: visita criada fora de formulario, com lead ou
--      cliente, numa organizacao com o interruptor ligado -> 'agenda_confirm'.
--   6. Gatilho AFTER INSERT OR UPDATE OF status: passagem a 'confirmed' com
--      confirmed_at AINDA VAZIO (= confirmada pela EMPRESA; a confirmacao do
--      cliente pelo link carimba confirmed_at no mesmo UPDATE) numa visita em
--      modo 'agenda_confirm' -> enfileira email + sms. Idempotente: indice
--      unico (visita, canal, hora da visita) para kind='auto'.
--   7. RPCs SECURITY DEFINER com filtro de organizacao e ambito por dentro:
--      rpc_visit_confirmation_status (ler; scheduling.items.view com ambito),
--      rpc_request_visit_confirmation_resend (reenviar; scheduling.items.edit
--      com ambito; 3 por canal por visita por 24 h),
--      fn_visit_confirmation_claim (so service_role; reclama linhas).
--
-- CAMINHO QUENTE: o calendario (get_resource_available_slots,
-- get_month_availability, find_nearest_resources) so LE schedule_items: nada
-- disto corre la. Na escrita: o gatilho AFTER tem clausula WHEN, por isso a
-- funcao nem e chamada para visitas em modo antigo (todas, hoje). O BEFORE
-- INSERT so faz uma leitura por indice unico (schedule_settings.organization_id)
-- quando a visita nao vem de formulario e tem lead/cliente.
--
-- FASE 2 (fica so o gancho, nada construido): o alerta «sem confirmar ha X horas»
-- e o contador de pendentes alargado leem schedule_items WHERE confirmation_send_on
-- = 'agenda_confirm' AND status IN ('scheduled','rescheduled') AND start_datetime >
-- now() (created_at da visita = desde quando espera). Se for preciso, um indice
-- parcial (organization_id, start_datetime) WHERE confirmation_send_on =
-- 'agenda_confirm' torna essa leitura barata sem tocar nas visitas de hoje.
--
-- PRECISA DE CODIGO NOVO para o modo novo funcionar (book-slot, send-visit-
-- confirmation, notify-schedule-change, reminderRunner, process-scheduled-
-- emails, ecras). SEM esse codigo nada muda: os interruptores estao desligados.
-- Aplicar ESTA migration ANTES de publicar as funcoes e o front-end.
-- =============================================================================

-- 1. Modo por formulario --------------------------------------------------------
ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS confirmation_send_on text NOT NULL DEFAULT 'booking';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_branding_confirmation_send_on_check'
      AND conrelid = 'public.form_branding'::regclass
  ) THEN
    ALTER TABLE public.form_branding
      ADD CONSTRAINT form_branding_confirmation_send_on_check
      CHECK (confirmation_send_on IN ('booking', 'agenda_confirm'));
  END IF;
END $$;

COMMENT ON COLUMN public.form_branding.confirmation_send_on IS
  'Quando sai o email/SMS de confirmacao ao cliente: booking = logo ao marcar no formulario (omissao, comportamento antigo); agenda_confirm = quando a empresa confirma a visita na Agenda.';

-- 2. Interruptor da organizacao para visitas criadas no CRM ---------------------
ALTER TABLE public.schedule_settings
  ADD COLUMN IF NOT EXISTS send_confirmation_on_confirm boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_settings.send_confirmation_on_confirm IS
  'Visitas criadas no CRM (fora de formulario, com lead ou cliente): enviar a confirmacao ao cliente quando a visita e confirmada na Agenda. Omissao false.';

-- 3. Modo gravado na visita ------------------------------------------------------
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS confirmation_send_on text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_items_confirmation_send_on_check'
      AND conrelid = 'public.schedule_items'::regclass
  ) THEN
    ALTER TABLE public.schedule_items
      ADD CONSTRAINT schedule_items_confirmation_send_on_check
      CHECK (confirmation_send_on IS NULL OR confirmation_send_on IN ('booking', 'agenda_confirm'));
  END IF;
END $$;

COMMENT ON COLUMN public.schedule_items.confirmation_send_on IS
  'Modo da confirmacao ao cliente gravado ao criar a visita. NULL ou booking = antigo (nada reage a confirmar). agenda_confirm = a confirmacao sai quando a empresa confirma.';

-- 4. Fila --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visit_confirmation_sends (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  schedule_item_id     uuid NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  channel              text NOT NULL CHECK (channel IN ('email', 'sms')),
  kind                 text NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto', 'resend')),
  visit_start_snapshot timestamptz NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts             integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at           timestamptz,
  error_message        text,
  skip_reason          text,
  recipient            text,
  requested_by_auth    uuid,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.visit_confirmation_sends IS
  'Fila do email/SMS de confirmacao ao cliente quando a empresa confirma a visita (modo agenda_confirm). Escrita so pela service_role (send-visit-confirmation) e pelos gatilhos/RPCs SECURITY DEFINER.';

-- Idempotencia: a mesma visita a mesma hora recebe a confirmacao automatica uma vez por canal.
CREATE UNIQUE INDEX IF NOT EXISTS visit_confirmation_sends_auto_once
  ON public.visit_confirmation_sends (schedule_item_id, channel, visit_start_snapshot)
  WHERE kind = 'auto';

CREATE INDEX IF NOT EXISTS visit_confirmation_sends_due
  ON public.visit_confirmation_sends (next_attempt_at)
  WHERE status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS visit_confirmation_sends_item
  ON public.visit_confirmation_sends (schedule_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS visit_confirmation_sends_org
  ON public.visit_confirmation_sends (organization_id);

ALTER TABLE public.visit_confirmation_sends ENABLE ROW LEVEL SECURITY;
-- Sem politicas: anon/authenticated nao leem nem escrevem directamente.
REVOKE ALL ON TABLE public.visit_confirmation_sends FROM PUBLIC;
REVOKE ALL ON TABLE public.visit_confirmation_sends FROM anon;
REVOKE ALL ON TABLE public.visit_confirmation_sends FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.visit_confirmation_sends TO service_role;

-- 5. Modo por omissao das visitas criadas fora de formulario -------------------
CREATE OR REPLACE FUNCTION public.fn_schedule_items_confirmation_mode_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Veio de um formulario: o modo e o do formulario e e o book-slot que o grava.
  IF NEW.organization_id IS NULL OR COALESCE(NEW.metadata ->> 'form_id', '') <> '' THEN
    RETURN NEW;
  END IF;
  -- Sem lead nem cliente nao ha a quem confirmar (reunioes internas, eventos).
  IF NEW.lead_id IS NULL AND NEW.client_id IS NULL AND COALESCE(NEW.metadata ->> 'lead_id', '') = '' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schedule_settings s
    WHERE s.organization_id = NEW.organization_id
      AND s.send_confirmation_on_confirm
  ) THEN
    NEW.confirmation_send_on := 'agenda_confirm';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_schedule_items_confirmation_mode_default() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_schedule_items_confirmation_mode_default() FROM anon;
REVOKE ALL ON FUNCTION public.fn_schedule_items_confirmation_mode_default() FROM authenticated;

DROP TRIGGER IF EXISTS trg_schedule_items_confirmation_mode_default ON public.schedule_items;
CREATE TRIGGER trg_schedule_items_confirmation_mode_default
  BEFORE INSERT ON public.schedule_items
  FOR EACH ROW
  WHEN (NEW.confirmation_send_on IS NULL AND NEW.time_off_type IS NULL)
  EXECUTE FUNCTION public.fn_schedule_items_confirmation_mode_default();

-- 6. Enfileirar quando a EMPRESA confirma --------------------------------------
CREATE OR REPLACE FUNCTION public.fn_schedule_items_enqueue_visit_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- So a PASSAGEM a confirmada conta (confirmed -> confirmed nao reenvia).
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text = 'confirmed' THEN
      RETURN NULL;
    END IF;
  END IF;
  IF NEW.organization_id IS NULL OR NEW.start_datetime IS NULL OR NEW.time_off_type IS NOT NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.visit_confirmation_sends
    (organization_id, schedule_item_id, channel, kind, visit_start_snapshot, requested_by_auth)
  SELECT NEW.organization_id, NEW.id, c.channel, 'auto', NEW.start_datetime, auth.uid()
  FROM (VALUES ('email'), ('sms')) AS c(channel)
  ON CONFLICT (schedule_item_id, channel, visit_start_snapshot) WHERE kind = 'auto' DO NOTHING;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_schedule_items_enqueue_visit_confirmation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_schedule_items_enqueue_visit_confirmation() FROM anon;
REVOKE ALL ON FUNCTION public.fn_schedule_items_enqueue_visit_confirmation() FROM authenticated;

DROP TRIGGER IF EXISTS trg_schedule_items_enqueue_visit_confirmation ON public.schedule_items;
CREATE TRIGGER trg_schedule_items_enqueue_visit_confirmation
  AFTER INSERT OR UPDATE OF status ON public.schedule_items
  FOR EACH ROW
  WHEN (
    NEW.status = 'confirmed'
    AND NEW.confirmed_at IS NULL
    AND NEW.confirmation_send_on = 'agenda_confirm'
  )
  EXECUTE FUNCTION public.fn_schedule_items_enqueue_visit_confirmation();

-- 7a. Ler o estado (ecra da Agenda) --------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_visit_confirmation_status(p_item_ids uuid[])
RETURNS TABLE (
  schedule_item_id     uuid,
  confirmation_send_on text,
  channel              text,
  kind                 text,
  status               text,
  attempts             integer,
  error_message        text,
  skip_reason          text,
  recipient            text,
  sent_at              timestamptz,
  created_at           timestamptz,
  visit_start_snapshot timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_item_ids) > 200 THEN
    RAISE EXCEPTION 'Demasiadas visitas num so pedido (maximo 200)' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT si.id, si.confirmation_send_on, q.channel, q.kind, q.status, q.attempts,
         q.error_message, q.skip_reason, q.recipient, q.sent_at, q.created_at, q.visit_start_snapshot
  FROM public.schedule_items si
  LEFT JOIN LATERAL (
    SELECT DISTINCT ON (v.channel) v.*
    FROM public.visit_confirmation_sends v
    WHERE v.schedule_item_id = si.id
      AND v.organization_id = si.organization_id
    ORDER BY v.channel, v.created_at DESC
  ) q ON true
  WHERE si.id = ANY (p_item_ids)
    AND si.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.get_schedule_item_scope_context(si.organization_id, 'scheduling.items.view') ctx(applied_scope, owner_ids)
      WHERE ctx.applied_scope = 'ORG'
         OR si.created_by = ANY (ctx.owner_ids)
         OR si.user_id = ANY (ctx.owner_ids)
         OR public.schedule_item_assigned_to_owners(si.id, ctx.owner_ids)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_visit_confirmation_status(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_visit_confirmation_status(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_visit_confirmation_status(uuid[]) TO authenticated;

-- 7b. Reenviar (explicito e limitado) ------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_request_visit_confirmation_resend(
  p_item_id  uuid,
  p_channels text[] DEFAULT ARRAY['email', 'sms']
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_max_per_day constant integer := 3;
  v_item     public.schedule_items;
  v_channel  text;
  v_inserted integer := 0;
  v_recent   integer;
BEGIN
  IF p_channels IS NULL OR cardinality(p_channels) = 0
     OR NOT (p_channels <@ ARRAY['email', 'sms']::text[]) THEN
    RAISE EXCEPTION 'Canais invalidos' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item FROM public.schedule_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit') THEN
    RAISE EXCEPTION 'Sem permissao para editar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_item.organization_id IS NULL
     OR NOT (v_item.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do ambito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_item.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_item.created_by = ANY (ctx.owner_ids)
       OR v_item.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_item.id, ctx.owner_ids)
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do ambito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- So depois das verificacoes: bloqueia a visita para dois cliques seguidos nao passarem o limite.
  PERFORM 1 FROM public.schedule_items WHERE id = v_item.id FOR UPDATE;

  IF COALESCE(v_item.confirmation_send_on, 'booking') <> 'agenda_confirm' THEN
    RAISE EXCEPTION 'Esta visita nao envia a confirmacao pela Agenda' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.status::text <> 'confirmed' THEN
    RAISE EXCEPTION 'So se reenvia a confirmacao de uma visita confirmada' USING ERRCODE = 'check_violation';
  END IF;

  FOREACH v_channel IN ARRAY (SELECT array_agg(DISTINCT c) FROM unnest(p_channels) AS c)
  LOOP
    -- Ja ha um envio deste canal por fazer: nao se empilha outro.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.visit_confirmation_sends v
      WHERE v.schedule_item_id = v_item.id AND v.channel = v_channel
        AND v.status IN ('pending', 'sending')
    );
    SELECT count(*) INTO v_recent
    FROM public.visit_confirmation_sends v
    WHERE v.schedule_item_id = v_item.id AND v.channel = v_channel
      AND v.kind = 'resend' AND v.created_at > now() - interval '24 hours';
    CONTINUE WHEN v_recent >= k_max_per_day;

    INSERT INTO public.visit_confirmation_sends
      (organization_id, schedule_item_id, channel, kind, visit_start_snapshot, requested_by_auth)
    VALUES (v_item.organization_id, v_item.id, v_channel, 'resend', v_item.start_datetime, auth.uid());
    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'Limite de reenvios atingido ou envio ja em curso' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_request_visit_confirmation_resend(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_request_visit_confirmation_resend(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_visit_confirmation_resend(uuid, text[]) TO authenticated;

-- 7c. Reclamar linhas (so a edge function, com a service_role) ------------------
CREATE OR REPLACE FUNCTION public.fn_visit_confirmation_claim(
  p_item_id uuid DEFAULT NULL,
  p_limit   integer DEFAULT 20
)
RETURNS SETOF public.visit_confirmation_sends
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_row   public.visit_confirmation_sends;
BEGIN
  -- Uma linha presa em 'sending' ha mais de 10 minutos (a funcao caiu a meio)
  -- passa a falhada: pode ter saido, por isso nao se repete sozinha -- fica o
  -- botao Reenviar.
  UPDATE public.visit_confirmation_sends
     SET status = 'failed',
         error_message = COALESCE(error_message, 'Envio interrompido; confirme com o cliente ou reenvie'),
         updated_at = now()
   WHERE status = 'sending'
     AND claimed_at < now() - interval '10 minutes';

  -- FOR ... IN UPDATE ... RETURNING (forma documentada do PL/pgSQL para DML com RETURNING).
  FOR v_row IN
    UPDATE public.visit_confirmation_sends v
       SET status = 'sending',
           attempts = v.attempts + 1,
           claimed_at = now(),
           updated_at = now()
     WHERE v.id IN (
       SELECT p.id
       FROM public.visit_confirmation_sends p
       WHERE p.status = 'pending'
         AND p.next_attempt_at <= now()
         AND (p_item_id IS NULL OR p.schedule_item_id = p_item_id)
       ORDER BY p.created_at
       LIMIT v_limit
       FOR UPDATE SKIP LOCKED
     )
    RETURNING v.*
  LOOP
    RETURN NEXT v_row;
  END LOOP;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_visit_confirmation_claim(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_visit_confirmation_claim(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_visit_confirmation_claim(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_visit_confirmation_claim(uuid, integer) TO service_role;

-- 8. Conferir ------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  -- Colunas e omissoes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'form_branding'
      AND column_name = 'confirmation_send_on' AND column_default LIKE '''booking''%' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'form_branding.confirmation_send_on em falta ou sem omissao booking';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schedule_settings'
      AND column_name = 'send_confirmation_on_confirm' AND column_default = 'false' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'schedule_settings.send_confirmation_on_confirm em falta ou sem omissao false';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schedule_items'
      AND column_name = 'confirmation_send_on' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'schedule_items.confirmation_send_on em falta ou com omissao';
  END IF;

  -- O comportamento por omissao nao mudou para ninguem
  IF EXISTS (SELECT 1 FROM public.form_branding WHERE confirmation_send_on <> 'booking') THEN
    RAISE EXCEPTION 'Ha formularios fora do modo booking logo a seguir a migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_settings WHERE send_confirmation_on_confirm) THEN
    RAISE EXCEPTION 'Ha organizacoes com o interruptor do CRM ligado logo a seguir a migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_items WHERE confirmation_send_on IS NOT NULL) THEN
    RAISE EXCEPTION 'Ha visitas com modo gravado logo a seguir a migration';
  END IF;

  -- Fila fechada
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.visit_confirmation_sends'::regclass) THEN
    RAISE EXCEPTION 'RLS desligada em visit_confirmation_sends';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'visit_confirmation_sends') THEN
    RAISE EXCEPTION 'visit_confirmation_sends nao deve ter politicas (acesso so por funcoes)';
  END IF;
  SELECT string_agg(r.rolname || ':' || p.priv, ', ') INTO v_missing
  FROM (VALUES ('anon'::text), ('authenticated'::text)) AS r(rolname)
  CROSS JOIN (VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)) AS p(priv)
  WHERE has_table_privilege(r.rolname, 'public.visit_confirmation_sends', p.priv);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'visit_confirmation_sends com privilegios a mais: %', v_missing;
  END IF;

  -- Indice de idempotencia
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'visit_confirmation_sends_auto_once'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%kind = ''auto''%'
  ) THEN
    RAISE EXCEPTION 'Indice unico de idempotencia em falta';
  END IF;

  -- Gatilhos
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.schedule_items'::regclass AND NOT tgisinternal
      AND tgname::text = 'trg_schedule_items_enqueue_visit_confirmation'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.schedule_items'::regclass AND NOT tgisinternal
      AND tgname::text = 'trg_schedule_items_confirmation_mode_default'
  ) THEN
    RAISE EXCEPTION 'Gatilhos de confirmacao em falta em schedule_items';
  END IF;

  -- Funcoes: SECURITY DEFINER com search_path fixo
  SELECT string_agg(p.proname::text, ', ') INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname::text IN ('fn_schedule_items_confirmation_mode_default', 'fn_schedule_items_enqueue_visit_confirmation',
                            'rpc_visit_confirmation_status', 'rpc_request_visit_confirmation_resend', 'fn_visit_confirmation_claim')
    AND (NOT p.prosecdef OR p.proconfig IS NULL
         OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%'));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Funcoes sem SECURITY DEFINER ou sem search_path: %', v_missing;
  END IF;

  -- Quem pode chamar o que
  IF has_function_privilege('authenticated', 'public.fn_visit_confirmation_claim(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_visit_confirmation_claim(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_visit_confirmation_claim nao pode ser chamada por anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_visit_confirmation_status(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_request_visit_confirmation_resend(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPCs de confirmacao abertas a anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_visit_confirmation_status(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_request_visit_confirmation_resend(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPCs de confirmacao sem EXECUTE para authenticated';
  END IF;
END $$;
