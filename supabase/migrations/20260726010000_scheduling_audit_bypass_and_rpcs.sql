-- Agendamentos (Scheduling) — single-log RPCs on the shared audit-bypass foundation
-- 2026-07-26 | Module: Fase · Agendamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on the scheduling module (create / update / delete a
-- schedule item) is issued from the frontend (src/hooks/useScheduling.ts) as
-- SEVERAL independent Supabase calls, each its own Postgres transaction:
--   · createItem : INSERT schedule_items
--                  + (fallback) SELECT/INSERT schedule_resources for the creator
--                  + INSERT schedule_item_assignees
--   · updateItem : UPDATE schedule_items
--   · deleteItem : DELETE schedule_items
-- Every audited table fires an AFTER trigger that writes to entity_audit_log
-- (fn_audit_schedule_with_sentinel on schedule_items — see
-- 20260718010000_schedule_audit_triggers.sql). A single "create appointment"
-- therefore produces N audit rows (one per touched, audited table) when the
-- business intent is exactly ONE audit entry.
--
-- Solution
-- --------
-- The reusable foundation already exists (created in the Roles module —
-- 20260719010000_roles_audit_bypass_and_rpcs.sql; grep for "app.audit_bypass" /
-- "fn_manual_audit_log" returns it). This migration DOES NOT recreate it:
--   · app.audit_bypass GUC — checked at the TOP of fn_generic_entity_audit()
--     AND of fn_audit_schedule_with_sentinel() (guard added here for the schedule
--     function, since it did not carry the guard yet — see §0).
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text) — reused as-is.
--
-- Three RPCs (rpc_create_schedule_item / rpc_update_schedule_item /
-- rpc_delete_schedule_item) reproduce, field-for-field and condition-for-condition,
-- exactly what useScheduling.ts does today, all inside a single transaction with
-- app.audit_bypass = 'on', accumulate a combined diff across ALL touched tables
-- ({table: {col: {old, new}}}), and call fn_manual_audit_log ONCE.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on schedule_items / schedule_resources /
-- schedule_item_assignees does NOT self-enforce inside them. Each RPC therefore
-- re-checks, explicitly, the SAME predicates the RLS policies enforce today
-- (baseline 20260615130000_baseline_new_database.sql):
--   schedule_items INSERT  (line ~21759):
--     has_scheduling_permission(auth.uid(),'scheduling.items.create')
--     AND organization_id IN get_user_visible_org_ids(auth.uid())
--   schedule_items UPDATE  (line ~22226):
--     has_scheduling_permission(auth.uid(),'scheduling.items.edit')
--     AND organization_id IN get_user_visible_org_ids(auth.uid())
--   schedule_items DELETE  (line ~21891):
--     has_scheduling_permission(auth.uid(),'scheduling.items.delete')
--     AND organization_id IN get_user_visible_org_ids(auth.uid())
--   schedule_resources INSERT (line ~21766):
--     has_scheduling_permission(auth.uid(),'scheduling.resources.create')
--     AND organization_id IN get_user_visible_org_ids(auth.uid())
--   schedule_item_assignees INSERT (line ~21741):
--     (has_scheduling_permission(...,'scheduling.items.create')
--       OR has_scheduling_permission(...,'scheduling.items.edit'))
--     AND item_id IN (schedule_items visible to the caller's orgs)
-- The BEFORE guard trg_prevent_schedule_items_on_holidays
-- (prevent_schedule_items_on_holidays, baseline line ~17629) still fires on the
-- underlying INSERT/UPDATE inside the RPC exactly as before — SECURITY DEFINER
-- changes the executing privileges, not which triggers fire. IMPORTANT: that guard
-- is BEFORE UPDATE OF start_datetime, end_datetime, organization_id, company_id,
-- board_id, status, i.e. it fires whenever one of those columns is present in the
-- SET clause (value change irrelevant). rpc_update_schedule_item therefore builds its
-- SET clause DYNAMICALLY, emitting only the columns the caller actually supplied, so a
-- title-only edit does NOT list any watched column and does NOT trip the holiday guard
-- — reproducing exactly the pre-RPC FE behavior (cleanUpdates). See §2.
--
-- Audit full_record trade-off
-- ---------------------------
-- The old AFTER trigger (fn_audit_schedule_with_sentinel) wrote the COMPLETE row into
-- entity_audit_log.full_record on INSERT/DELETE. The reused fn_manual_audit_log has no
-- full_record parameter (it always inserts full_record = NULL), so the create/delete
-- RPCs store a hand-picked, business-meaningful subset in changed_fields instead of the
-- full snapshot. This is an accepted, documented detail loss (see §1 and §3 inline
-- notes) — extending fn_manual_audit_log's signature is out of scope for this module
-- and would touch the shared Roles foundation.
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant fn_audit_schedule_with_sentinel
-- uses to route rows whose organization_id IS NULL. In practice createItem always
-- passes organization_id = companyId, but we mirror the trigger so the manual audit
-- row lands in the SAME place the trigger would have written it. Never insert this
-- UUID into anew_organizations.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql   — schedule_* tables, RLS policies,
--                                                 has_scheduling_permission(),
--                                                 get_user_visible_org_ids(),
--                                                 current_business_user_id(),
--                                                 prevent_schedule_items_on_holidays()
--   20260625010000_entity_audit_log.sql         — entity_audit_log + fn_generic_entity_audit()
--   20260718010000_schedule_audit_triggers.sql  — fn_audit_schedule_with_sentinel(), triggers
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard on
--                                                 fn_generic_entity_audit() +
--                                                 fn_manual_audit_log() (REUSED, not recreated)


-- ============================================================
-- 0. fn_audit_schedule_with_sentinel() — add audit-bypass guard at the top
-- ============================================================
-- The shared foundation added the app.audit_bypass guard to fn_generic_entity_audit()
-- in the Roles migration, but the schedule tables use their own dedicated audit
-- function (fn_audit_schedule_with_sentinel), which did NOT yet carry the guard.
-- Without it, the AFTER trigger on schedule_items would still write its own row even
-- when the RPC set app.audit_bypass='on', defeating the single-log goal.
--
-- Body is byte-identical to 20260718010000_schedule_audit_triggers.sql §1 EXCEPT for
-- the new guard as the first statement. CREATE OR REPLACE only — the triggers
-- (trg_audit_schedule_items / trg_audit_schedule_boards) are NOT touched.

CREATE OR REPLACE FUNCTION public.fn_audit_schedule_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global / system schedule rows (organization_id IS NULL).
  -- Same constant as fn_audit_uom_with_sentinel / fn_audit_brands_with_sentinel.
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at', 'duration_minutes'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global / system rows ───────────────────────
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

  -- ── Build payload ─────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ───────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_schedule_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_schedule_with_sentinel() TO service_role;


-- ============================================================
-- 1. rpc_create_schedule_item(...)
-- ============================================================
-- Mirrors createItem in src/hooks/useScheduling.ts (lines ~379-487):
--   1. INSERT schedule_items with EXACTLY the insertData column set:
--        board_id, title (default 'Novo Agendamento'), description, status
--        (default 'draft'), origin (default 'manual'), start_datetime, end_datetime,
--        all_day (default false), client_id, contact_id, deal_id, employee_id,
--        user_id, location, location_lat, location_lng, color, priority (default 0),
--        tags, notes, metadata (default {}), time_off_type, approval_status,
--        created_by = business user, organization_id = active org.
--   2. Resolve assignees: if p_assignee_resource_ids is empty, fall back to the
--      creator's schedule_resources row — find the active one for user_id = creator,
--      and if none exists CREATE it (same insert shape as the FE), then use its id.
--   3. INSERT schedule_item_assignees for the (deduped) effective resource ids,
--      {item_id, resource_id}.
-- All inside one transaction, one consolidated audit row.
-- Returns the created schedule_items row (SELECT * so the FE gets the full record,
-- matching the FE's .select().single()).
--
-- p_assignee_resource_ids semantics mirror the FE's assigneeResourceIds argument:
--   NULL  → treated as "not provided" → creator fallback applies (FE: `?? []`).
--   '{}'  → also empty → creator fallback applies.
--   non-empty → used as-is (deduped).

CREATE OR REPLACE FUNCTION public.rpc_create_schedule_item(
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
  p_assignee_resource_ids uuid[] DEFAULT NULL
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

  -- ── INSERT schedule_items (identical column set / defaults to createItem) ──
  INSERT INTO public.schedule_items
    (board_id, title, description, status, origin,
     start_datetime, end_datetime, all_day,
     client_id, contact_id, deal_id, employee_id, user_id,
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
  -- KNOWN DETAIL LOSS vs the old AFTER trigger: fn_audit_schedule_with_sentinel
  -- wrote the COMPLETE row into entity_audit_log.full_record on INSERT/DELETE.
  -- fn_manual_audit_log (reused from the Roles migration) has NO full_record
  -- parameter and always inserts full_record = NULL; the consolidated diff is stored
  -- in changed_fields only. To keep parity with the old audit intent we therefore
  -- record a hand-picked, business-meaningful subset (the columns below) rather than
  -- the full snapshot. See the migration summary for the accepted trade-off.
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
  numeric, text, integer, text[], text, jsonb, text, text, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_schedule_item(
  uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin,
  timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric,
  numeric, text, integer, text[], text, jsonb, text, text, uuid[]
) TO authenticated;


-- ============================================================
-- 2. rpc_update_schedule_item(...)
-- ============================================================
-- Mirrors updateItem in src/hooks/useScheduling.ts (lines ~489-525):
--   · The FE filters incoming updates to a whitelist of "valid columns" and only
--     sends the keys that are actually present in the updates object (cleanUpdates).
--     We reproduce the "only touch fields the caller supplied" semantics with a
--     boolean present-flag per column so that unspecified columns are left untouched
--     (COALESCE would be wrong here — a caller may legitimately set a nullable column
--     back to NULL).
--   · UPDATE schedule_items SET <supplied whitelisted columns> WHERE id.
-- Whitelist (identical to validColumns in the FE):
--   board_id, title, description, location, start_datetime, end_datetime, status,
--   origin, contact_id, client_id, employee_id, user_id, notes, metadata,
--   organization_id, time_off_type, approval_status, approved_by, approved_at.
-- Returns the updated schedule_items row.
--
-- CRITICAL — trigger parity (trg_prevent_schedule_items_on_holidays)
-- ------------------------------------------------------------------
-- That guard is a BEFORE UPDATE OF start_datetime, end_datetime, organization_id,
-- company_id, board_id, status trigger. Postgres fires an "UPDATE OF <cols>" trigger
-- whenever any listed column APPEARS in the SET clause, regardless of whether its
-- value actually changes. The full set of watched columns is start_datetime,
-- end_datetime, organization_id, company_id, board_id and status (company_id is
-- watched too, even though it is not in the FE validColumns / RPC whitelist and so is
-- never emitted here — behavioral parity is preserved). A static UPDATE that writes
-- every whitelisted column with a CASE ... ELSE <same column> no-op therefore ALWAYS
-- lists start_datetime / end_datetime / organization_id / board_id / status in SET and
-- fires the holiday guard on EVERY update — so editing only the title of an item on a
-- holiday date
-- would wrongly fail with "dia bloqueado". The old FE code (cleanUpdates) only put the
-- keys actually sent into the UPDATE, so a title-only edit did NOT touch those columns
-- and did NOT fire the guard.
-- To replicate that semantics exactly we build the SET list DYNAMICALLY: only columns
-- whose p_set_<col> flag is true are emitted, and values are bound via USING (no
-- interpolation of user values, correct typing for enums/uuids/jsonb). If the caller
-- supplies no columns, we skip the UPDATE entirely (a true no-op, exactly like an
-- empty cleanUpdates).
--
-- Only touches schedule_items today, but the diff is namespaced per table for
-- consistency with the other RPCs; a single UPDATE log row is written only when
-- something meaningful changed (matching the trigger's skip-on-no-change behavior).

CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item(
  p_id              uuid,
  p_board_id        uuid    DEFAULT NULL, p_set_board_id        boolean DEFAULT false,
  p_title           text    DEFAULT NULL, p_set_title           boolean DEFAULT false,
  p_description     text    DEFAULT NULL, p_set_description     boolean DEFAULT false,
  p_location        text    DEFAULT NULL, p_set_location        boolean DEFAULT false,
  p_start_datetime  timestamptz DEFAULT NULL, p_set_start_datetime  boolean DEFAULT false,
  p_end_datetime    timestamptz DEFAULT NULL, p_set_end_datetime    boolean DEFAULT false,
  p_status          public.schedule_item_status DEFAULT NULL, p_set_status boolean DEFAULT false,
  p_origin          public.schedule_item_origin DEFAULT NULL, p_set_origin boolean DEFAULT false,
  p_contact_id      uuid    DEFAULT NULL, p_set_contact_id      boolean DEFAULT false,
  p_client_id       uuid    DEFAULT NULL, p_set_client_id       boolean DEFAULT false,
  p_employee_id     uuid    DEFAULT NULL, p_set_employee_id     boolean DEFAULT false,
  p_user_id         uuid    DEFAULT NULL, p_set_user_id         boolean DEFAULT false,
  p_notes           text    DEFAULT NULL, p_set_notes           boolean DEFAULT false,
  p_metadata        jsonb   DEFAULT NULL, p_set_metadata        boolean DEFAULT false,
  p_organization_id uuid    DEFAULT NULL, p_set_organization_id boolean DEFAULT false,
  p_time_off_type   text    DEFAULT NULL, p_set_time_off_type   boolean DEFAULT false,
  p_approval_status text    DEFAULT NULL, p_set_approval_status boolean DEFAULT false,
  p_approved_by     uuid    DEFAULT NULL, p_set_approved_by     boolean DEFAULT false,
  p_approved_at     timestamptz DEFAULT NULL, p_set_approved_at boolean DEFAULT false
)
RETURNS public.schedule_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  -- Dynamic SET-clause assembly. Only columns whose p_set_<col> flag is true are
  -- emitted, so the "UPDATE OF" holiday trigger fires only when one of its watched
  -- columns is actually supplied (parity with the FE's cleanUpdates). Each fragment is
  -- built with format('%I = %L::type', ...): %L emits a safely-escaped SQL literal, so
  -- caller values cannot inject SQL, and the explicit cast preserves column typing.
  v_set_parts  text[]  := ARRAY[]::text[];   -- e.g. 'title = ''x''::text'
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
  -- If the caller moves the row to another org, that target org must also be visible
  -- (matches the UPDATE policy re-checking organization_id on the new row).
  IF p_set_organization_id THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Build the SET clause from ONLY the supplied whitelisted columns ───────
  -- format('%L', <value>) emits a correctly-escaped SQL literal (NULL → NULL,
  -- otherwise a quoted string), so nothing the caller supplies can inject SQL.
  -- An explicit cast per column keeps the literal's type identical to the static
  -- version (enums, uuids, timestamptz, jsonb, text).
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

  IF array_length(v_set_parts, 1) IS NULL THEN
    -- No columns supplied → true no-op, exactly like an empty cleanUpdates. No
    -- UPDATE is issued, so the "UPDATE OF" holiday trigger cannot fire, and there is
    -- nothing to audit. Return the unchanged current row.
    RETURN v_before;
  END IF;

  -- ── UPDATE only the supplied whitelisted columns ──────────────────────────
  -- Only supplied whitelisted columns appear in SET, so
  -- trg_prevent_schedule_items_on_holidays fires only when one of the trigger's watched
  -- columns is among them. Of that watched set (start_datetime, end_datetime,
  -- organization_id, company_id, board_id, status) company_id is never emitted here
  -- (not in the whitelist), so in practice only start_datetime / end_datetime /
  -- organization_id / board_id / status can trip the guard — matching the pre-RPC
  -- behavior byte-for-byte.
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
$$;

REVOKE ALL ON FUNCTION public.rpc_update_schedule_item(
  uuid,
  uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean,
  public.schedule_item_status, boolean, public.schedule_item_origin, boolean,
  uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean,
  uuid, boolean, timestamptz, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_schedule_item(
  uuid,
  uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean,
  public.schedule_item_status, boolean, public.schedule_item_origin, boolean,
  uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean,
  uuid, boolean, timestamptz, boolean
) TO authenticated;


-- ============================================================
-- 3. rpc_delete_schedule_item(...)
-- ============================================================
-- Mirrors deleteItem in src/hooks/useScheduling.ts (lines ~527-547):
--   · DELETE FROM schedule_items WHERE id.
--     schedule_item_assignees.item_id references the item; the FE relies on the
--     DB's ON DELETE behavior. We do NOT pre-delete assignees here — we reproduce
--     exactly the single DELETE the FE issues, and any FK cascade behaves as it
--     does today. (If no cascade existed, the FE's own single DELETE would fail
--     the same way; we do not add behavior the FE does not have.)
-- Returns void.
--
-- Authorization mirrors schedule_items DELETE RLS.

CREATE OR REPLACE FUNCTION public.rpc_delete_schedule_item(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.schedule_items;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items DELETE RLS ───────────────────
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── DELETE the item (single statement, exactly like the FE) ───────────────
  DELETE FROM public.schedule_items WHERE id = p_id;

  -- ── Combined diff: business-meaningful subset of the removed item ─────────
  -- Same KNOWN DETAIL LOSS as rpc_create_schedule_item: fn_manual_audit_log cannot
  -- populate entity_audit_log.full_record (no parameter for it), so where the old
  -- AFTER trigger stored the full OLD row on DELETE, we store this hand-picked
  -- subset in changed_fields. See the migration summary.
  v_diff := jsonb_build_object(
    'schedule_items', jsonb_build_object(
      'board_id',        jsonb_build_object('old', to_jsonb(v_before.board_id), 'new', NULL),
      'title',           jsonb_build_object('old', to_jsonb(v_before.title), 'new', NULL),
      'status',          jsonb_build_object('old', to_jsonb(v_before.status), 'new', NULL),
      'origin',          jsonb_build_object('old', to_jsonb(v_before.origin), 'new', NULL),
      'start_datetime',  jsonb_build_object('old', to_jsonb(v_before.start_datetime), 'new', NULL),
      'end_datetime',    jsonb_build_object('old', to_jsonb(v_before.end_datetime), 'new', NULL),
      'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
    )
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'schedule_items', p_id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_schedule_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_schedule_item(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard now present at the top of the schedule audit function:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_generic_entity_audit', 'fn_audit_schedule_with_sentinel')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows.
--
-- 2. A single "create appointment" that also creates the creator resource + one
--    assignee produces exactly ONE audit row:
--   SELECT public.rpc_create_schedule_item(
--     p_organization_id => '<org-uuid>', p_board_id => '<board-uuid>',
--     p_start_datetime => now(), p_end_datetime => now() + interval '1 hour');
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'schedule_items' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 2-3, despite schedule_resources + schedule_item_assignees writes).
--
-- 3. rpc_update_schedule_item touching only title yields ONE UPDATE row whose
--    changed_fields = {"schedule_items": {"title": {...}}}; an update that changes
--    nothing writes NO audit row.
--
-- 3b. HOLIDAY-GUARD PARITY (the bug this revision fixes): editing ONLY the title of an
--    item whose start_datetime falls on a blocked holiday must SUCCEED, because the
--    dynamic SET clause omits every watched column (start_datetime, end_datetime,
--    organization_id, company_id, board_id, status), so
--    trg_prevent_schedule_items_on_holidays never fires:
--      SELECT public.rpc_update_schedule_item(
--        p_id => '<item-on-holiday>', p_title => 'novo titulo', p_set_title => true);
--      -- Expected: succeeds. (Before the fix it failed with the holiday error because
--      --           the static SET always listed the watched columns.)
--    Conversely, supplying p_set_start_datetime => true with a holiday date still fails
--    with the holiday error, exactly as the FE did when it sent start_datetime.
--
-- 3c. DETAIL-LOSS DISCLAIMER: create/delete audit rows carry a hand-picked subset in
--    changed_fields and full_record = NULL (fn_manual_audit_log has no full_record
--    parameter). The old AFTER trigger stored the complete row in full_record. Accepted
--    trade-off — see the header "Audit full_record trade-off" note.
--
-- 4. Calling any RPC without the matching scheduling permission, or on an item
--    outside the caller's visible orgs, raises insufficient_privilege — matching RLS.
