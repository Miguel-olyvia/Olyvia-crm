-- schedule_items.contact_id -> lead_id (Agenda, "Lead" no dialogo de agendamento)
-- FASE 1 de 2 — EXPANSAO. Esta migration precisa do frontend e das edge
-- functions `auto-schedule` e `ai-assistant` da MESMA entrega. E compativel
-- com o codigo antigo: `contact_id` continua a existir e e espelhado por
-- trigger com `lead_id`.
--
-- Contexto: o dialogo de agendamento so liga a leads (anew_leads), nunca a
-- contactos legados (anew_contacts), mas a coluna e o parametro chamavam-se
-- "contact". Este ficheiro so introduz a coluna nova, um backfill e um
-- espelho transitorio; a Fase 2 (fora deste ficheiro, so depois de publicado
-- e verificado em produção) remove `contact_id`.

-- ============================================================
-- 0. Guardas (so leitura; ABORTAM a transaccao se o remoto divergir do que
--    este ficheiro assume)
-- ============================================================
DO $$
DECLARE
  r record;
  v_bad text;
BEGIN
  -- Todos os triggers de utilizador de schedule_items tem de estar ENABLED
  -- (senao o ENABLE TRIGGER USER da secção 3 reactivava um que estava
  -- deliberadamente desligado por outra razão).
  SELECT string_agg(tgname, ', ') INTO v_bad
  FROM pg_trigger
  WHERE tgrelid = 'public.schedule_items'::regclass
    AND NOT tgisinternal
    AND tgenabled <> 'O';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'schedule_items tem triggers desligados: %', v_bad;
  END IF;

  -- Inventario informativo: funcoes que citam schedule_items E contact_id
  -- pelo nome (para revisão manual antes de escrever a Fase 2).
  FOR r IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ILIKE '%schedule_items%'
      AND p.prosrc ~ '\mcontact_id\M'
  LOOP
    RAISE NOTICE 'funcao a rever para a Fase 2: %', r.proname;
  END LOOP;

  IF to_regclass('public._migration_contacts_to_leads_map') IS NULL THEN
    RAISE EXCEPTION '_migration_contacts_to_leads_map nao existe no remoto';
  END IF;

  IF to_regclass('public.schedule_items') IS NULL THEN
    RAISE EXCEPTION 'schedule_items nao existe no remoto';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schedule_items' AND column_name = 'lead_id'
  ) THEN
    RAISE EXCEPTION 'schedule_items.lead_id ja existe -- esta migration ja foi aplicada?';
  END IF;
END $$;

-- ============================================================
-- 1. Coluna nova, FK (NOT VALID por agora), indice, comentario
-- ============================================================
ALTER TABLE public.schedule_items ADD COLUMN lead_id uuid;

ALTER TABLE public.schedule_items
  ADD CONSTRAINT schedule_items_lead_id_fkey FOREIGN KEY (lead_id)
  REFERENCES public.anew_leads(id) ON DELETE SET NULL NOT VALID;

CREATE INDEX idx_schedule_items_lead ON public.schedule_items (lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN public.schedule_items.lead_id IS 'Lead (anew_leads) a que o agendamento se refere. Substitui contact_id (Fase 2 remove contact_id).';

-- ============================================================
-- 2. Resolver: id de lead -> ele proprio; id de contacto fundido (fusao
--    Contactos->Leads) -> lead correspondente via _migration_contacts_to_leads_map;
--    qualquer outro valor -> NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_schedule_item_resolve_lead_id(p_ref uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT l.id FROM public.anew_leads l WHERE l.id = p_ref),
    (SELECT m.lead_id FROM public._migration_contacts_to_leads_map m
       JOIN public.anew_leads l ON l.id = m.lead_id WHERE m.contact_id = p_ref)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_schedule_item_resolve_lead_id(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Backfill, sem disparar auditoria, updated_at nem os triggers de
--    utilizador (holiday guard, etc.) para milhares de linhas históricas.
-- ============================================================
ALTER TABLE public.schedule_items DISABLE TRIGGER USER;

UPDATE public.schedule_items si
   SET lead_id = public.fn_schedule_item_resolve_lead_id(si.contact_id)
 WHERE si.contact_id IS NOT NULL;

-- Segunda convenção existente: createVisit (useCalendarScheduling.ts) guarda
-- a lead em metadata.lead_id e deixa contact_id a NULL. Copiar também essas.
UPDATE public.schedule_items si
   SET lead_id = l.id
  FROM public.anew_leads l
 WHERE si.lead_id IS NULL
   AND si.metadata ? 'lead_id'
   AND si.metadata->>'lead_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND l.id = (si.metadata->>'lead_id')::uuid;

ALTER TABLE public.schedule_items ENABLE TRIGGER USER;

ALTER TABLE public.schedule_items VALIDATE CONSTRAINT schedule_items_lead_id_fkey;

-- ============================================================
-- 4. Numeros medidos (ficam no output do push, para o relatório final)
-- ============================================================
DO $$
DECLARE a int; b int; c int; d int; x int;
BEGIN
  SELECT count(*) FILTER (WHERE contact_id IS NOT NULL),
         count(*) FILTER (WHERE contact_id IS NOT NULL AND lead_id = contact_id),
         count(*) FILTER (WHERE contact_id IS NOT NULL AND lead_id IS NOT NULL AND lead_id <> contact_id),
         count(*) FILTER (WHERE contact_id IS NOT NULL AND lead_id IS NULL),
         count(*) FILTER (WHERE contact_id IS NULL AND lead_id IS NOT NULL)
    INTO a, b, c, d, x
    FROM public.schedule_items;
  RAISE NOTICE 'contact_id preenchido=% | ja era lead=% | contacto->lead via mapa=% | sem resolucao=% | vindo de metadata.lead_id=%', a, b, c, d, x;

  SELECT count(*) INTO a
  FROM public.schedule_items si
  JOIN public.anew_leads l ON l.id = si.lead_id
  WHERE l.organization_id <> si.organization_id;
  RAISE NOTICE 'lead de outra organizacao (informativo)=%', a;
END $$;

-- ============================================================
-- 5. Espelho transitorio contact_id <-> lead_id (o frontend e as funcoes
--    antigas, ainda por publicar nalgum passo intermédio, continuam a
--    funcionar durante a janela entre o db push e o deploy).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_schedule_items_sync_lead_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      NEW.contact_id := NEW.lead_id;
    ELSIF NEW.contact_id IS NOT NULL THEN
      NEW.lead_id := public.fn_schedule_item_resolve_lead_id(NEW.contact_id);
    END IF;
  ELSE
    IF NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
      NEW.contact_id := NEW.lead_id;
    ELSIF NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
      NEW.lead_id := public.fn_schedule_item_resolve_lead_id(NEW.contact_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_schedule_items_sync_lead_contact() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_schedule_items_sync_lead_contact
  BEFORE INSERT OR UPDATE OF contact_id, lead_id ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_schedule_items_sync_lead_contact();

-- ============================================================
-- 6. rpc_create_schedule_item: DROP da assinatura de 25 tipos + CREATE com
--    p_lead_id acrescentado no fim. Feito na mesma transaccao para nunca
--    deixar duas versões visíveis ao PostgREST ao mesmo tempo.
-- ============================================================
DROP FUNCTION public.rpc_create_schedule_item(
  uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin,
  timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric,
  numeric, text, integer, text[], text, jsonb, text, text, uuid[]
);

CREATE FUNCTION public.rpc_create_schedule_item(
  p_organization_id      uuid,
  p_board_id             uuid,
  p_title                text    DEFAULT NULL,
  p_description          text    DEFAULT NULL,
  p_status               public.schedule_item_status DEFAULT NULL,
  p_origin               public.schedule_item_origin DEFAULT NULL,
  p_start_datetime       timestamptz DEFAULT NULL,
  p_end_datetime         timestamptz DEFAULT NULL,
  p_all_day              boolean DEFAULT NULL,
  p_client_id            uuid    DEFAULT NULL,
  p_contact_id           uuid    DEFAULT NULL,
  p_deal_id              uuid    DEFAULT NULL,
  p_employee_id          uuid    DEFAULT NULL,
  p_user_id              uuid    DEFAULT NULL,
  p_location             text    DEFAULT NULL,
  p_location_lat         numeric DEFAULT NULL,
  p_location_lng         numeric DEFAULT NULL,
  p_color                text    DEFAULT NULL,
  p_priority             integer DEFAULT NULL,
  p_tags                 text[]  DEFAULT NULL,
  p_notes                text    DEFAULT NULL,
  p_metadata             jsonb   DEFAULT NULL,
  p_time_off_type        text    DEFAULT NULL,
  p_approval_status      text    DEFAULT NULL,
  p_assignee_resource_ids uuid[] DEFAULT NULL,
  p_lead_id              uuid    DEFAULT NULL
)
RETURNS public.schedule_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor          uuid;
  v_item           public.schedule_items;
  v_effective_ids  uuid[];
  v_creator_res    uuid;
  v_creator_name   text;
  v_new_res_id     uuid;
  v_resource_diff  jsonb := NULL;
  v_assignee_diff  jsonb := NULL;
  v_audit_org      uuid;
  v_diff           jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ──────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items INSERT RLS ───────────────────
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT schedule_items (identical column set / defaults to createItem,
  --    mais lead_id) ──
  INSERT INTO public.schedule_items
    (board_id, title, description, status, origin,
     start_datetime, end_datetime, all_day,
     client_id, contact_id, lead_id, deal_id, employee_id, user_id,
     location, location_lat, location_lng, color, priority,
     tags, notes, metadata, time_off_type, approval_status,
     created_by, organization_id)
  VALUES
    (p_board_id,
     COALESCE(p_title, 'Novo Agendamento'),
     p_description,
     COALESCE(p_status, 'draft'::public.schedule_item_status),
     COALESCE(p_origin, 'manual'::public.schedule_item_origin),
     p_start_datetime,
     p_end_datetime,
     COALESCE(p_all_day, false),
     p_client_id,
     p_contact_id,
     p_lead_id,
     p_deal_id,
     p_employee_id,
     p_user_id,
     p_location,
     p_location_lat,
     p_location_lng,
     p_color,
     COALESCE(p_priority, 0),
     p_tags,
     p_notes,
     COALESCE(p_metadata, '{}'::jsonb),
     p_time_off_type,
     p_approval_status,
     v_actor,
     p_organization_id)
  RETURNING * INTO v_item;

  -- ── Resolve effective assignees (mirrors the FE fallback exactly) ─────────
  v_effective_ids := COALESCE(p_assignee_resource_ids, ARRAY[]::uuid[]);

  IF array_length(v_effective_ids, 1) IS NULL THEN
    -- No assignees provided → fall back to the creator's resource.
    SELECT id INTO v_creator_res
    FROM public.schedule_resources
    WHERE user_id = v_actor
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_creator_res IS NULL THEN
      -- Create a schedule_resources row for the creator (same shape as the FE).
      SELECT name INTO v_creator_name
      FROM public.anew_users
      WHERE id = v_actor
      LIMIT 1;

      -- Authorization parity with schedule_resources INSERT RLS. The FE relies on
      -- RLS to allow this insert; replicate the same predicate here.
      IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.resources.create') THEN
        RAISE EXCEPTION 'Sem permissão para criar recursos de agenda' USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.schedule_resources
        (name, resource_type, user_id, color, is_active, metadata,
         created_by, organization_id)
      VALUES
        (COALESCE(v_creator_name, 'Utilizador'),
         'user',
         v_actor,
         '#10b981',
         true,
         '{}'::jsonb,
         v_actor,
         p_organization_id)
      RETURNING id INTO v_new_res_id;

      v_creator_res := v_new_res_id;

      -- Record the created resource in the combined diff (it is a real side effect).
      v_resource_diff := jsonb_build_object(
        'id',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_res_id)),
        'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(v_creator_name, 'Utilizador'))),
        'resource_type',   jsonb_build_object('old', NULL, 'new', to_jsonb('user'::text)),
        'user_id',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_actor)),
        'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(p_organization_id))
      );
    END IF;

    IF v_creator_res IS NOT NULL THEN
      v_effective_ids := ARRAY[v_creator_res];
    END IF;
  END IF;

  -- ── INSERT assignees (deduped), mirroring the FE ──────────────────────────
  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    -- Authorization parity with schedule_item_assignees INSERT RLS
    -- (create OR edit permission; item belongs to a visible org — it does, we
    -- just inserted it into p_organization_id which was validated above).
    IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
            OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
      RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT v_item.id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;

    v_assignee_diff := jsonb_build_object(
      'resource_id', jsonb_build_object(
        'old', NULL,
        'new', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_effective_ids) ORDER BY 1))
      )
    );
  END IF;

  -- ── Build combined diff: schedule_items snapshot + side effects ───────────
  v_diff := jsonb_build_object(
    'schedule_items', jsonb_build_object(
      'board_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.board_id)),
      'title',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.title)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.status)),
      'origin',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.origin)),
      'start_datetime',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.start_datetime)),
      'end_datetime',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.end_datetime)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.organization_id))
    )
  );

  IF v_resource_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_resources', v_resource_diff);
  END IF;
  IF v_assignee_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_item_assignees', v_assignee_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'schedule_items', v_item.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_schedule_item(
  uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin,
  timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric,
  numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_schedule_item(
  uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin,
  timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric,
  numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid
) TO authenticated;

-- ============================================================
-- 7. rpc_update_schedule_item: DROP da assinatura de 39 argumentos + CREATE
--    com p_lead_id / p_set_lead_id acrescentados no fim.
-- ============================================================
DROP FUNCTION public.rpc_update_schedule_item(
  uuid,
  uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean,
  public.schedule_item_status, boolean, public.schedule_item_origin, boolean,
  uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean,
  uuid, boolean, timestamptz, boolean
);

CREATE FUNCTION public.rpc_update_schedule_item(
  p_id uuid,
  p_board_id uuid DEFAULT NULL::uuid, p_set_board_id boolean DEFAULT false,
  p_title text DEFAULT NULL::text, p_set_title boolean DEFAULT false,
  p_description text DEFAULT NULL::text, p_set_description boolean DEFAULT false,
  p_location text DEFAULT NULL::text, p_set_location boolean DEFAULT false,
  p_start_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_start_datetime boolean DEFAULT false,
  p_end_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_end_datetime boolean DEFAULT false,
  p_status schedule_item_status DEFAULT NULL::schedule_item_status, p_set_status boolean DEFAULT false,
  p_origin schedule_item_origin DEFAULT NULL::schedule_item_origin, p_set_origin boolean DEFAULT false,
  p_contact_id uuid DEFAULT NULL::uuid, p_set_contact_id boolean DEFAULT false,
  p_client_id uuid DEFAULT NULL::uuid, p_set_client_id boolean DEFAULT false,
  p_employee_id uuid DEFAULT NULL::uuid, p_set_employee_id boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL::uuid, p_set_user_id boolean DEFAULT false,
  p_notes text DEFAULT NULL::text, p_set_notes boolean DEFAULT false,
  p_metadata jsonb DEFAULT NULL::jsonb, p_set_metadata boolean DEFAULT false,
  p_organization_id uuid DEFAULT NULL::uuid, p_set_organization_id boolean DEFAULT false,
  p_time_off_type text DEFAULT NULL::text, p_set_time_off_type boolean DEFAULT false,
  p_approval_status text DEFAULT NULL::text, p_set_approval_status boolean DEFAULT false,
  p_approved_by uuid DEFAULT NULL::uuid, p_set_approved_by boolean DEFAULT false,
  p_approved_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_approved_at boolean DEFAULT false,
  p_lead_id uuid DEFAULT NULL::uuid, p_set_lead_id boolean DEFAULT false
)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.schedule_items;
  v_item       public.schedule_items;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_item_diff  jsonb := '{}'::jsonb;
  v_key        text;
  v_noise_cols text[] := ARRAY['updated_at', 'created_at', 'duration_minutes'];
  v_audit_org  uuid;
  v_diff       jsonb;
  v_set_parts  text[]  := ARRAY[]::text[];
  v_sql        text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image + guards) ──────────────────────────
  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items UPDATE RLS ───────────────────
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ambito (a5): so pode agir sobre itens dentro do seu ambito.
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_before.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_before.created_by = ANY (ctx.owner_ids)
       OR v_before.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_before.id, ctx.owner_ids)
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_set_organization_id THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Build the SET clause from ONLY the supplied whitelisted columns ───────
  IF p_set_board_id        THEN v_set_parts := v_set_parts || format('board_id = %L::uuid', p_board_id); END IF;
  IF p_set_title           THEN v_set_parts := v_set_parts || format('title = %L::text', p_title); END IF;
  IF p_set_description     THEN v_set_parts := v_set_parts || format('description = %L::text', p_description); END IF;
  IF p_set_location        THEN v_set_parts := v_set_parts || format('location = %L::text', p_location); END IF;
  IF p_set_start_datetime  THEN v_set_parts := v_set_parts || format('start_datetime = %L::timestamptz', p_start_datetime); END IF;
  IF p_set_end_datetime    THEN v_set_parts := v_set_parts || format('end_datetime = %L::timestamptz', p_end_datetime); END IF;
  IF p_set_status          THEN v_set_parts := v_set_parts || format('status = %L::public.schedule_item_status', p_status); END IF;
  IF p_set_origin          THEN v_set_parts := v_set_parts || format('origin = %L::public.schedule_item_origin', p_origin); END IF;
  IF p_set_contact_id      THEN v_set_parts := v_set_parts || format('contact_id = %L::uuid', p_contact_id); END IF;
  IF p_set_client_id       THEN v_set_parts := v_set_parts || format('client_id = %L::uuid', p_client_id); END IF;
  IF p_set_employee_id     THEN v_set_parts := v_set_parts || format('employee_id = %L::uuid', p_employee_id); END IF;
  IF p_set_user_id         THEN v_set_parts := v_set_parts || format('user_id = %L::uuid', p_user_id); END IF;
  IF p_set_notes           THEN v_set_parts := v_set_parts || format('notes = %L::text', p_notes); END IF;
  IF p_set_metadata        THEN v_set_parts := v_set_parts || format('metadata = %L::jsonb', p_metadata); END IF;
  IF p_set_organization_id THEN v_set_parts := v_set_parts || format('organization_id = %L::uuid', p_organization_id); END IF;
  IF p_set_time_off_type   THEN v_set_parts := v_set_parts || format('time_off_type = %L::text', p_time_off_type); END IF;
  IF p_set_approval_status THEN v_set_parts := v_set_parts || format('approval_status = %L::text', p_approval_status); END IF;
  IF p_set_approved_by     THEN v_set_parts := v_set_parts || format('approved_by = %L::uuid', p_approved_by); END IF;
  IF p_set_approved_at     THEN v_set_parts := v_set_parts || format('approved_at = %L::timestamptz', p_approved_at); END IF;
  IF p_set_lead_id         THEN v_set_parts := v_set_parts || format('lead_id = %L::uuid', p_lead_id); END IF;

  IF array_length(v_set_parts, 1) IS NULL THEN
    RETURN v_before;
  END IF;

  v_sql := format(
    'UPDATE public.schedule_items SET %s WHERE id = %L::uuid RETURNING *',
    array_to_string(v_set_parts, ', '),
    p_id
  );
  EXECUTE v_sql INTO v_item;

  -- ── Build the diff (same noise-column exclusions as the schedule trigger) ─
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_item);

  FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
  LOOP
    CONTINUE WHEN v_key = ANY(v_noise_cols);
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_item_diff := v_item_diff || jsonb_build_object(
        v_key,
        jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  v_diff := '{}'::jsonb;
  IF v_item_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('schedule_items', v_item_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'schedule_items', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_item;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_update_schedule_item(
  uuid,
  uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean,
  public.schedule_item_status, boolean, public.schedule_item_origin, boolean,
  uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean,
  uuid, boolean, timestamptz, boolean,
  uuid, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_schedule_item(
  uuid,
  uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean,
  public.schedule_item_status, boolean, public.schedule_item_origin, boolean,
  uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean,
  uuid, boolean, timestamptz, boolean,
  uuid, boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
