-- ============================================================================
-- schedule_items: o AMBITO passa a valer no UPDATE e no DELETE -- nas RPCs E na
-- RLS.  (achado a5 do raio-X)
--
-- A SELECT ja e consciente do ambito (get_schedule_item_scope_context). Mas:
--   1) As RPCs rpc_update_schedule_item / rpc_delete_schedule_item (o caminho
--      que a app usa, useScheduling.ts:455/471) sao SECURITY DEFINER e IGNORAM a
--      RLS -- so verificavam has_scheduling_permission + org, nunca o ambito.
--      Um OWNED com .edit/.delete alterava/apagava itens de toda a organizacao.
--   2) As politicas RLS de UPDATE/DELETE (caminho REST residual) tambem so
--      isolavam por org.
--
-- Fecha-se nos DOIS sitios, com o MESMO predicado da SELECT scoped, mas
-- resolvido pela permissao de ACCAO (.edit/.delete) e NAO pela .view: um admin
-- pode configurar view=ORG e edit=OWNED, e nesse caso o ambito de escrita tem de
-- seguir o edit, nao o view.
--
-- As RPCs abaixo sao a definicao ACTUAL (pg_get_functiondef) com o unico
-- acrescento do bloco de ambito logo apos o check de organizacao. CREATE OR
-- REPLACE preserva os GRANTs existentes.
-- ============================================================================

-- ---- RPC de UPDATE ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item(p_id uuid, p_board_id uuid DEFAULT NULL::uuid, p_set_board_id boolean DEFAULT false, p_title text DEFAULT NULL::text, p_set_title boolean DEFAULT false, p_description text DEFAULT NULL::text, p_set_description boolean DEFAULT false, p_location text DEFAULT NULL::text, p_set_location boolean DEFAULT false, p_start_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_start_datetime boolean DEFAULT false, p_end_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_end_datetime boolean DEFAULT false, p_status schedule_item_status DEFAULT NULL::schedule_item_status, p_set_status boolean DEFAULT false, p_origin schedule_item_origin DEFAULT NULL::schedule_item_origin, p_set_origin boolean DEFAULT false, p_contact_id uuid DEFAULT NULL::uuid, p_set_contact_id boolean DEFAULT false, p_client_id uuid DEFAULT NULL::uuid, p_set_client_id boolean DEFAULT false, p_employee_id uuid DEFAULT NULL::uuid, p_set_employee_id boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid, p_set_user_id boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_set_notes boolean DEFAULT false, p_metadata jsonb DEFAULT NULL::jsonb, p_set_metadata boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_set_organization_id boolean DEFAULT false, p_time_off_type text DEFAULT NULL::text, p_set_time_off_type boolean DEFAULT false, p_approval_status text DEFAULT NULL::text, p_set_approval_status boolean DEFAULT false, p_approved_by uuid DEFAULT NULL::uuid, p_set_approved_by boolean DEFAULT false, p_approved_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_approved_at boolean DEFAULT false)
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

  -- Ambito (a5): so pode agir sobre itens dentro do seu ambito -- a MESMA logica
  -- da policy SELECT scoped, mas resolvida pela permissao de ACCAO ('scheduling.items.edit'),
  -- porque view e edit podem ter niveis independentes.
  -- Esta RPC e SECURITY DEFINER e ignora a RLS, por isso o check tem de estar
  -- aqui: sem ele, um OWNED editava/apagava itens de toda a organizacao.
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
  -- Only these columns appear in SET, so trg_prevent_schedule_items_on_holidays
  -- fires only when start_datetime / end_datetime / organization_id / board_id /
  -- status is among them — matching the pre-RPC behavior byte-for-byte.
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

-- ---- RPC de DELETE ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_delete_schedule_item(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Ambito (a5): so pode agir sobre itens dentro do seu ambito -- a MESMA logica
  -- da policy SELECT scoped, mas resolvida pela permissao de ACCAO ('scheduling.items.delete'),
  -- porque view e delete podem ter niveis independentes.
  -- Esta RPC e SECURITY DEFINER e ignora a RLS, por isso o check tem de estar
  -- aqui: sem ele, um OWNED editava/apagava itens de toda a organizacao.
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_before.organization_id, 'scheduling.items.delete') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_before.created_by = ANY (ctx.owner_ids)
       OR v_before.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_before.id, ctx.owner_ids)
  ) THEN
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
$function$;

-- ---- RPC de ATRIBUICAO de recursos (irmao) --------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item_assignees(p_item_id uuid, p_resource_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid;
  v_org_id        uuid;
  v_effective_ids uuid[];
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorization parity with schedule_item_assignees INSERT RLS
  -- (baseline 20260615130000, linha ~21747: create OR edit permission).
  IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
          OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Authorization parity with the "item_id IN (visible schedule_items)" clause
  -- of that same INSERT policy — checked here explicitly, once, instead of via
  -- a caller-scoped SELECT subquery (that subquery is exactly what created the
  -- circular RLS dependency this RPC fixes).
  SELECT organization_id INTO v_org_id
  FROM public.schedule_items
  WHERE id = p_item_id;

  IF v_org_id IS NULL
     OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ambito (a5, irmao): so pode reatribuir recursos de um item dentro do seu
  -- ambito. Esta RPC e SECURITY DEFINER e reescreve schedule_item_assignees;
  -- sem este check, um OWNED reatribuia recursos de qualquer item da org.
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_items si
    CROSS JOIN LATERAL public.get_schedule_item_scope_context(si.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE si.id = p_item_id
      AND (ctx.applied_scope = 'ORG'
        OR si.created_by = ANY (ctx.owner_ids)
        OR si.user_id = ANY (ctx.owner_ids)
        OR public.schedule_item_assigned_to_owners(si.id, ctx.owner_ids))
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_ids := COALESCE(p_resource_ids, ARRAY[]::uuid[]);

  -- Atomic: same function call / same transaction, sem round-trip pelo
  -- PostgREST nem re-avaliação da RLS de schedule_items do chamador entre
  -- as duas instruções.
  DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT p_item_id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;
  END IF;
END;
$function$;

-- ---- RLS residual (caminho REST directo) -----------------------------------
ALTER POLICY "Users can update schedule items" ON public.schedule_items
  USING (
    has_scheduling_permission(auth.uid(), 'scheduling.items.edit'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.edit'::text) ctx(applied_scope, owner_ids)
      WHERE ctx.applied_scope = 'ORG'::text
         OR schedule_items.created_by = ANY (ctx.owner_ids)
         OR schedule_items.user_id = ANY (ctx.owner_ids)
         OR schedule_item_assigned_to_owners(schedule_items.id, ctx.owner_ids)
    )
  );

ALTER POLICY "Users can delete schedule items" ON public.schedule_items
  USING (
    has_scheduling_permission(auth.uid(), 'scheduling.items.delete'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.delete'::text) ctx(applied_scope, owner_ids)
      WHERE ctx.applied_scope = 'ORG'::text
         OR schedule_items.created_by = ANY (ctx.owner_ids)
         OR schedule_items.user_id = ANY (ctx.owner_ids)
         OR schedule_item_assigned_to_owners(schedule_items.id, ctx.owner_ids)
    )
  );
