-- ============================================================================
-- Dono da lead/cliente e recurso da visita FUTURA sempre alinhados.
--
-- Regra: anew_leads.assigned_to / anew_clients.assigned_to e o recurso (utilizador)
-- das visitas futuras dessa lead/cliente nunca divergem; mudar um muda o outro.
--
-- COMPATIBILIDADE COM O FRONTEND: esta migration e compativel com o frontend
-- ANTIGO (o trigger faz cumprir a regra em qualquer caminho, e a RPC
-- rpc_update_schedule_item_assignees passa de void a jsonb, valor que o frontend
-- antigo ignora). O frontend NOVO depende dela: rpc_set_entity_owner,
-- rpc_bulk_set_entity_owner, rpc_reassign_visit e o jsonb de
-- rpc_update_schedule_item_assignees. Publicar o frontend novo SO depois do push.
--
-- Visitas afectadas: start_datetime > now(), estado fora de cancelled/completed,
-- sem time_off_type. Passadas ficam intocadas.
--
-- Sentido lead/cliente -> visita: trigger na base (AFTER UPDATE OF assigned_to).
-- Sentido visita -> lead/cliente: SO na RPC rpc_update_schedule_item_assignees e
-- em rpc_reassign_visit (mudancas feitas por pessoas no CRM). A marcacao publica,
-- o auto-schedule e o assistente NUNCA mudam o dono da lead.
--
-- Variaveis locais a transaccao (set_config(..., true)) usadas entre triggers e RPCs:
--   app.owner_sync_running      'on' durante o alinhamento (anti-recursao)
--   app.owner_sync_mode         'bulk' => salta em vez de lancar erro
--   app.owner_sync_origin_item  visita de origem (ja alinhada, nao se toca)
--   app.owner_sync_affected     jsonb array de ids de visitas alteradas
--   app.owner_sync_skipped      jsonb array {id,name,reason} de entidades saltadas
-- ============================================================================

-- ---- 1. recurso activo de um utilizador numa organizacao -------------------
CREATE OR REPLACE FUNCTION public.fn_owner_sync_resource_for_user(p_org uuid, p_user uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id
  FROM public.schedule_resources r
  WHERE r.organization_id = p_org
    AND r.user_id = p_user
    AND r.is_active IS TRUE
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1;
$$;

-- ---- 2. visitas futuras de uma lead/cliente --------------------------------
CREATE OR REPLACE FUNCTION public.fn_owner_sync_future_visits(p_kind text, p_entity_id uuid, p_org uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT si.id
  FROM public.schedule_items si
  WHERE si.organization_id = p_org
    AND si.start_datetime > now()
    AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
    AND si.time_off_type IS NULL
    AND (
      (p_kind = 'lead' AND (
           si.lead_id = p_entity_id
        OR (si.lead_id IS NULL AND si.metadata ->> 'lead_id' = p_entity_id::text)
        OR si.id = (SELECT l.scheduled_visit_id FROM public.anew_leads l WHERE l.id = p_entity_id)
      ))
      OR (p_kind = 'client' AND si.client_id = p_entity_id)
    );
$$;

-- ---- 3. alinhar as visitas futuras com o novo dono -------------------------
CREATE OR REPLACE FUNCTION public.fn_owner_sync_apply(
  p_kind text, p_entity_id uuid, p_org uuid, p_old_user uuid, p_new_user uuid, p_skip_item uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_res  uuid;
  v_item     uuid;
  v_changed  boolean;
  v_n        integer;
  v_affected uuid[] := ARRAY[]::uuid[];
BEGIN
  v_new_res := public.fn_owner_sync_resource_for_user(p_org, p_new_user);
  IF v_new_res IS NULL THEN
    RETURN v_affected;
  END IF;

  FOR v_item IN
    SELECT f FROM public.fn_owner_sync_future_visits(p_kind, p_entity_id, p_org) f
    WHERE p_skip_item IS NULL OR f <> p_skip_item
  LOOP
    v_changed := false;

    IF p_old_user IS NOT NULL THEN
      DELETE FROM public.schedule_item_assignees a
      USING public.schedule_resources r
      WHERE a.item_id = v_item
        AND a.resource_id = r.id
        AND r.user_id = p_old_user
        AND r.organization_id = p_org
        AND r.id <> v_new_res;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_changed := true; END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.schedule_item_assignees a
      WHERE a.item_id = v_item AND a.resource_id = v_new_res
    ) THEN
      INSERT INTO public.schedule_item_assignees (item_id, resource_id) VALUES (v_item, v_new_res);
      v_changed := true;
    END IF;

    IF v_changed THEN
      v_affected := v_affected || v_item;
    END IF;
  END LOOP;

  RETURN v_affected;
END;
$$;

-- ---- 4. visita -> lead/cliente ---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_owner_sync_entity_from_visit(
  p_item_id uuid, p_old_resource_ids uuid[], p_new_resource_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item        public.schedule_items;
  v_old         uuid[] := COALESCE(p_old_resource_ids, ARRAY[]::uuid[]);
  v_new         uuid[] := COALESCE(p_new_resource_ids, ARRAY[]::uuid[]);
  v_lead        uuid;
  v_client      uuid;
  v_meta_lead   text;
  v_cur_owner   uuid;
  v_all_users   uuid[];
  v_added_users uuid[];
  v_new_owner   uuid;
  v_lead_old    uuid;
  v_lead_new    uuid;
  v_client_old  uuid;
  v_client_new  uuid;
  v_others      jsonb := '[]'::jsonb;
  v_res_lead    boolean := false;
  v_res_client  boolean := false;
BEGIN
  SELECT * INTO v_item FROM public.schedule_items WHERE id = p_item_id;
  IF NOT FOUND
     OR v_item.start_datetime <= now()
     OR v_item.status IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
     OR v_item.time_off_type IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Conjunto de recursos inalterado: nada a fazer (o ecra grava sempre os recursos).
  IF (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(v_old) x)
     = (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(v_new) x) THEN
    RETURN NULL;
  END IF;
  IF array_length(v_new, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Utilizadores dos recursos novos, pela ordem do array.
  SELECT COALESCE(array_agg(r.user_id ORDER BY u.ord), ARRAY[]::uuid[]) INTO v_all_users
  FROM unnest(v_new) WITH ORDINALITY u(id, ord)
  JOIN public.schedule_resources r ON r.id = u.id
  WHERE r.user_id IS NOT NULL AND r.organization_id = v_item.organization_id;

  SELECT COALESCE(array_agg(r.user_id ORDER BY u.ord), ARRAY[]::uuid[]) INTO v_added_users
  FROM unnest(v_new) WITH ORDINALITY u(id, ord)
  JOIN public.schedule_resources r ON r.id = u.id
  WHERE r.user_id IS NOT NULL AND r.organization_id = v_item.organization_id
    AND NOT (u.id = ANY (v_old));

  IF array_length(v_all_users, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.owner_sync_mode', 'strict', true);
  PERFORM set_config('app.owner_sync_affected', '[]', true);
  PERFORM set_config('app.owner_sync_skipped', '[]', true);

  -- ---- lead ----
  v_lead := v_item.lead_id;
  IF v_lead IS NULL THEN
    v_meta_lead := v_item.metadata ->> 'lead_id';
    IF v_meta_lead ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_lead := v_meta_lead::uuid;
    END IF;
  END IF;
  IF v_lead IS NULL THEN
    SELECT l.id INTO v_lead FROM public.anew_leads l WHERE l.scheduled_visit_id = p_item_id LIMIT 1;
  END IF;

  IF v_lead IS NOT NULL THEN
    SELECT l.assigned_to INTO v_cur_owner
    FROM public.anew_leads l
    WHERE l.id = v_lead AND l.organization_id = v_item.organization_id AND l.deleted_at IS NULL;
    v_res_lead := FOUND;
    IF v_res_lead AND (v_cur_owner IS NULL OR NOT (v_cur_owner = ANY (v_all_users))) THEN
      v_new_owner := COALESCE(v_added_users[1], v_all_users[1]);
      PERFORM set_config('app.owner_sync_origin_item', p_item_id::text, true);
      UPDATE public.anew_leads SET assigned_to = v_new_owner WHERE id = v_lead;
      PERFORM set_config('app.owner_sync_origin_item', '', true);
      v_lead_old := v_cur_owner;
      v_lead_new := v_new_owner;
    ELSE
      v_lead := CASE WHEN v_res_lead THEN v_lead ELSE NULL END;
    END IF;
  END IF;

  -- ---- cliente ----
  v_client := v_item.client_id;
  IF v_client IS NOT NULL THEN
    SELECT c.assigned_to INTO v_cur_owner
    FROM public.anew_clients c
    WHERE c.id = v_client AND c.organization_id = v_item.organization_id AND c.deleted_at IS NULL;
    v_res_client := FOUND;
    IF v_res_client AND (v_cur_owner IS NULL OR NOT (v_cur_owner = ANY (v_all_users))) THEN
      v_new_owner := COALESCE(v_added_users[1], v_all_users[1]);
      PERFORM set_config('app.owner_sync_origin_item', p_item_id::text, true);
      UPDATE public.anew_clients SET assigned_to = v_new_owner WHERE id = v_client;
      PERFORM set_config('app.owner_sync_origin_item', '', true);
      v_client_old := v_cur_owner;
      v_client_new := v_new_owner;
    ELSE
      v_client := NULL;
    END IF;
  END IF;

  IF v_lead_new IS NULL AND v_client_new IS NULL THEN
    RETURN NULL;
  END IF;

  v_others := COALESCE(NULLIF(current_setting('app.owner_sync_affected', true), ''), '[]')::jsonb;

  RETURN jsonb_build_object(
    'lead_id', CASE WHEN v_lead_new IS NOT NULL THEN v_lead END,
    'client_id', CASE WHEN v_client_new IS NOT NULL THEN v_client END,
    'old_owner', COALESCE(v_lead_old, v_client_old),
    'new_owner', COALESCE(v_lead_new, v_client_new),
    'other_visit_ids', v_others
  );
END;
$$;

-- ---- 5. trigger: guarda (BEFORE) -------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_owner_sync_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind   text;
  v_skip   uuid;
  v_has    boolean;
  v_reason text;
  v_name   text;
  v_skipped jsonb;
BEGIN
  IF current_setting('app.owner_sync_running', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  v_kind := CASE TG_TABLE_NAME WHEN 'anew_leads' THEN 'lead' ELSE 'client' END;
  v_skip := NULLIF(current_setting('app.owner_sync_origin_item', true), '')::uuid;

  SELECT EXISTS (
    SELECT 1 FROM public.fn_owner_sync_future_visits(v_kind, OLD.id, OLD.organization_id) f
    WHERE v_skip IS NULL OR f <> v_skip
  ) INTO v_has;
  IF NOT v_has THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    v_reason := 'owner_required';
  ELSIF public.fn_owner_sync_resource_for_user(OLD.organization_id, NEW.assigned_to) IS NULL THEN
    v_reason := 'no_resource';
  ELSE
    RETURN NEW;
  END IF;

  IF current_setting('app.owner_sync_mode', true) = 'bulk' THEN
    SELECT e.display_name INTO v_name
    FROM public.anew_entities e
    WHERE e.id = OLD.entity_id;
    v_skipped := COALESCE(NULLIF(current_setting('app.owner_sync_skipped', true), ''), '[]')::jsonb
      || jsonb_build_array(jsonb_build_object('id', OLD.id, 'name', v_name, 'reason', v_reason));
    PERFORM set_config('app.owner_sync_skipped', v_skipped::text, true);
    NEW.assigned_to := OLD.assigned_to;
    RETURN NEW;
  END IF;

  IF v_reason = 'owner_required' THEN
    RAISE EXCEPTION 'owner_required_for_future_visit';
  END IF;

  SELECT u.name INTO v_name FROM public.anew_users u WHERE u.id = NEW.assigned_to;
  RAISE EXCEPTION '%', 'owner_without_schedule_resource: ' || COALESCE(v_name, '?');
END;
$$;

-- ---- 6. trigger: alinhamento (AFTER) ---------------------------------------
CREATE OR REPLACE FUNCTION public.trg_owner_sync_visits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind     text;
  v_skip     uuid;
  v_ids      uuid[];
  v_affected jsonb;
BEGIN
  IF current_setting('app.owner_sync_running', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  v_kind := CASE TG_TABLE_NAME WHEN 'anew_leads' THEN 'lead' ELSE 'client' END;
  v_skip := NULLIF(current_setting('app.owner_sync_origin_item', true), '')::uuid;

  PERFORM set_config('app.owner_sync_running', 'on', true);
  v_ids := public.fn_owner_sync_apply(v_kind, NEW.id, NEW.organization_id, OLD.assigned_to, NEW.assigned_to, v_skip);
  PERFORM set_config('app.owner_sync_running', 'off', true);

  IF array_length(v_ids, 1) IS NOT NULL THEN
    v_affected := COALESCE(NULLIF(current_setting('app.owner_sync_affected', true), ''), '[]')::jsonb
      || to_jsonb(v_ids);
    PERFORM set_config('app.owner_sync_affected', v_affected::text, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_sync_guard ON public.anew_leads;
CREATE TRIGGER trg_owner_sync_guard
  BEFORE UPDATE OF assigned_to ON public.anew_leads
  FOR EACH ROW WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.trg_owner_sync_guard();

DROP TRIGGER IF EXISTS trg_owner_sync_guard ON public.anew_clients;
CREATE TRIGGER trg_owner_sync_guard
  BEFORE UPDATE OF assigned_to ON public.anew_clients
  FOR EACH ROW WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.trg_owner_sync_guard();

DROP TRIGGER IF EXISTS trg_owner_sync_visits ON public.anew_leads;
CREATE TRIGGER trg_owner_sync_visits
  AFTER UPDATE OF assigned_to ON public.anew_leads
  FOR EACH ROW WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.trg_owner_sync_visits();

DROP TRIGGER IF EXISTS trg_owner_sync_visits ON public.anew_clients;
CREATE TRIGGER trg_owner_sync_visits
  AFTER UPDATE OF assigned_to ON public.anew_clients
  FOR EACH ROW WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.trg_owner_sync_visits();

-- ---- 7. RPC: mudar o dono de uma lead/cliente ------------------------------
-- SECURITY INVOKER: o UPDATE passa pela RLS (ambito certo, sem o copiar). A
-- troca do recurso das visitas e feita pelo trigger SECURITY DEFINER, so como
-- consequencia da mudanca de dono.
CREATE OR REPLACE FUNCTION public.rpc_set_entity_owner(p_kind text, p_id uuid, p_assigned_to uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows   integer;
  v_name   text;
BEGIN
  IF p_kind NOT IN ('lead', 'client') THEN
    RAISE EXCEPTION 'Tipo de entidade invalido' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM set_config('app.owner_sync_mode', 'strict', true);
  PERFORM set_config('app.owner_sync_origin_item', '', true);
  PERFORM set_config('app.owner_sync_affected', '[]', true);
  PERFORM set_config('app.owner_sync_skipped', '[]', true);

  -- Sem RETURNING: ROW_COUNT chega para saber se a RLS deixou actualizar. (Nota: um
  -- utilizador com ambito "so meus" que passa a ficha a OUTRA pessoa que nao ele
  -- recebe "violates row-level security policy" da propria RLS, exactamente como
  -- com o UPDATE directo de antes -- a RPC nao muda isso.)
  IF p_kind = 'lead' THEN
    UPDATE public.anew_leads SET assigned_to = p_assigned_to WHERE id = p_id;
  ELSE
    UPDATE public.anew_clients SET assigned_to = p_assigned_to WHERE id = p_id;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Sem permissão para alterar o responsável' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    SELECT u.name INTO v_name FROM public.anew_users u WHERE u.id = p_assigned_to;
  END IF;

  RETURN jsonb_build_object(
    'affected_visit_ids', COALESCE(NULLIF(current_setting('app.owner_sync_affected', true), ''), '[]')::jsonb,
    'owner_name', v_name
  );
END;
$$;

-- ---- 8. RPC: mudar o dono em massa -----------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_bulk_set_entity_owner(p_kind text, p_ids uuid[], p_assigned_to uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated uuid[] := ARRAY[]::uuid[];
  v_skipped jsonb;
  v_skipped_ids uuid[];
  v_id      uuid;
  v_rows    integer;
BEGIN
  IF p_kind NOT IN ('lead', 'client') THEN
    RAISE EXCEPTION 'Tipo de entidade invalido' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM set_config('app.owner_sync_mode', 'bulk', true);
  PERFORM set_config('app.owner_sync_origin_item', '', true);
  PERFORM set_config('app.owner_sync_affected', '[]', true);
  PERFORM set_config('app.owner_sync_skipped', '[]', true);

  -- Uma ficha por instrucao, sem RETURNING: ROW_COUNT diz, ficha a ficha, se a RLS
  -- deixou actualizar (o resultado por ficha e o que o ecra precisa para avisar).
  FOREACH v_id IN ARRAY COALESCE(p_ids, ARRAY[]::uuid[]) LOOP
    IF p_kind = 'lead' THEN
      UPDATE public.anew_leads SET assigned_to = p_assigned_to WHERE id = v_id;
    ELSE
      UPDATE public.anew_clients SET assigned_to = p_assigned_to WHERE id = v_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      v_updated := array_append(v_updated, v_id);
    END IF;
  END LOOP;

  PERFORM set_config('app.owner_sync_mode', 'strict', true);

  v_skipped := COALESCE(NULLIF(current_setting('app.owner_sync_skipped', true), ''), '[]')::jsonb;
  SELECT COALESCE(array_agg((e ->> 'id')::uuid), ARRAY[]::uuid[]) INTO v_skipped_ids
  FROM jsonb_array_elements(v_skipped) e;

  RETURN jsonb_build_object(
    'updated_ids', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM unnest(v_updated) x WHERE NOT (x = ANY (v_skipped_ids))),
    'skipped', v_skipped,
    'not_permitted_ids', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) x WHERE NOT (x = ANY (v_updated))),
    'affected_visit_ids', COALESCE(NULLIF(current_setting('app.owner_sync_affected', true), ''), '[]')::jsonb
  );
END;
$$;

-- ---- 9. rpc_update_schedule_item_assignees: passa a devolver jsonb ---------
-- Corpo de 20261119100000 sem alteracoes nas verificacoes. Acrescenta: guarda os
-- recursos antigos e, no fim, alinha o dono da lead/cliente (unico caminho
-- visita -> lead, decisao 2).
DROP FUNCTION IF EXISTS public.rpc_update_schedule_item_assignees(uuid, uuid[]);

CREATE FUNCTION public.rpc_update_schedule_item_assignees(p_item_id uuid, p_resource_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid;
  v_org_id        uuid;
  v_effective_ids uuid[];
  v_old_ids       uuid[];
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
          OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.schedule_items
  WHERE id = p_item_id;

  IF v_org_id IS NULL
     OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

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

  SELECT COALESCE(array_agg(resource_id), ARRAY[]::uuid[]) INTO v_old_ids
  FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT p_item_id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;
  END IF;

  RETURN public.fn_owner_sync_entity_from_visit(p_item_id, v_old_ids, v_effective_ids);
END;
$function$;

-- ---- 10. rpc_reassign_visit: data + recurso numa so transaccao -------------
CREATE OR REPLACE FUNCTION public.rpc_reassign_visit(
  p_item_id uuid, p_new_user_id uuid, p_start timestamptz, p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor    uuid;
  v_before   public.schedule_items;
  v_name     text;
  v_res      uuid;
  v_old_ids  uuid[];
  v_changes  text[] := ARRAY[]::text[];
  v_sync     jsonb;
  v_diff     jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
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

  IF p_new_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador de destino em falta' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT u.name INTO v_name FROM public.anew_users u WHERE u.id = p_new_user_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador de destino não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_res := public.fn_owner_sync_resource_for_user(v_before.organization_id, p_new_user_id);
  IF v_res IS NULL THEN
    IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.resources.create') THEN
      RAISE EXCEPTION '%', 'owner_without_schedule_resource: ' || COALESCE(v_name, '?');
    END IF;
    INSERT INTO public.schedule_resources
      (name, resource_type, user_id, color, is_active, metadata, created_by, organization_id)
    VALUES
      (COALESCE(v_name, 'Utilizador'), 'user', p_new_user_id, '#10b981', true, '{}'::jsonb, v_actor, v_before.organization_id)
    RETURNING id INTO v_res;
  END IF;

  -- Data (so se mudou). O bypass so cobre este UPDATE: a auditoria e manual, e a
  -- da lead/cliente (mais abaixo) tem de continuar activa.
  IF (p_start IS NOT NULL AND p_start IS DISTINCT FROM v_before.start_datetime)
     OR (p_end IS NOT NULL AND p_end IS DISTINCT FROM v_before.end_datetime) THEN
    PERFORM set_config('app.audit_bypass', 'on', true);
    UPDATE public.schedule_items
       SET start_datetime = COALESCE(p_start, start_datetime),
           end_datetime   = COALESCE(p_end, end_datetime)
     WHERE id = p_item_id;
    PERFORM set_config('app.audit_bypass', 'off', true);

    v_diff := jsonb_build_object('schedule_items', jsonb_build_object(
      'start_datetime', jsonb_build_object('old', to_jsonb(v_before.start_datetime), 'new', to_jsonb(COALESCE(p_start, v_before.start_datetime))),
      'end_datetime',   jsonb_build_object('old', to_jsonb(v_before.end_datetime),   'new', to_jsonb(COALESCE(p_end, v_before.end_datetime)))
    ));
    PERFORM public.fn_manual_audit_log(
      'schedule_items', p_item_id, COALESCE(v_before.organization_id, k_system_sentinel), 'UPDATE', v_diff, 'web_app'
    );
    v_changes := array_append(v_changes, 'datetime'::text);
  END IF;

  SELECT COALESCE(array_agg(resource_id), ARRAY[]::uuid[]) INTO v_old_ids
  FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF NOT (v_old_ids = ARRAY[v_res]) THEN
    DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;
    INSERT INTO public.schedule_item_assignees (item_id, resource_id) VALUES (p_item_id, v_res);
    v_changes := array_append(v_changes, 'assignee'::text);
  END IF;

  v_sync := public.fn_owner_sync_entity_from_visit(p_item_id, v_old_ids, ARRAY[v_res]);

  RETURN jsonb_build_object(
    'changes', to_jsonb(v_changes),
    'lead_id', v_sync -> 'lead_id',
    'client_id', v_sync -> 'client_id',
    'new_owner', COALESCE(v_sync -> 'new_owner', to_jsonb(p_new_user_id)),
    'other_visit_ids', COALESCE(v_sync -> 'other_visit_ids', '[]'::jsonb),
    'resource_id', to_jsonb(v_res)
  );
END;
$$;

-- ---- GRANTs -----------------------------------------------------------------
-- Internas: ninguem de fora.
REVOKE ALL ON FUNCTION public.fn_owner_sync_resource_for_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_owner_sync_future_visits(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_owner_sync_apply(text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_owner_sync_entity_from_visit(uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_owner_sync_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_owner_sync_visits() FROM PUBLIC, anon, authenticated;

-- Expostas: so authenticated (e service_role).
REVOKE ALL ON FUNCTION public.rpc_set_entity_owner(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_bulk_set_entity_owner(text, uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_update_schedule_item_assignees(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reassign_visit(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_entity_owner(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_set_entity_owner(text, uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_schedule_item_assignees(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_visit(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ---- Verificacao -------------------------------------------------------------
DO $verify$
DECLARE
  v_n int;
  v_fn text;
  v_sig text[] := ARRAY[
    'public.fn_owner_sync_resource_for_user(uuid,uuid)',
    'public.fn_owner_sync_future_visits(text,uuid,uuid)',
    'public.fn_owner_sync_apply(text,uuid,uuid,uuid,uuid,uuid)',
    'public.fn_owner_sync_entity_from_visit(uuid,uuid[],uuid[])',
    'public.trg_owner_sync_guard()',
    'public.trg_owner_sync_visits()',
    'public.rpc_update_schedule_item_assignees(uuid,uuid[])',
    'public.rpc_reassign_visit(uuid,uuid,timestamptz,timestamptz)'
  ];
  v_exposed text[] := ARRAY[
    'public.rpc_set_entity_owner(text,uuid,uuid)',
    'public.rpc_bulk_set_entity_owner(text,uuid[],uuid)',
    'public.rpc_update_schedule_item_assignees(uuid,uuid[])',
    'public.rpc_reassign_visit(uuid,uuid,timestamptz,timestamptz)'
  ];
  v_internal text[] := ARRAY[
    'public.fn_owner_sync_resource_for_user(uuid,uuid)',
    'public.fn_owner_sync_future_visits(text,uuid,uuid)',
    'public.fn_owner_sync_apply(text,uuid,uuid,uuid,uuid,uuid)',
    'public.fn_owner_sync_entity_from_visit(uuid,uuid[],uuid[])',
    'public.trg_owner_sync_guard()',
    'public.trg_owner_sync_visits()'
  ];
BEGIN
  -- 4 triggers activos
  SELECT count(*) INTO v_n
  FROM pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
    AND t.tgname IN ('trg_owner_sync_guard', 'trg_owner_sync_visits')
    AND t.tgrelid IN ('public.anew_leads'::regclass, 'public.anew_clients'::regclass);
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'owner_sync: esperava 4 triggers, encontrei %', v_n;
  END IF;

  -- SECURITY DEFINER + search_path fixo (as duas RPCs INVOKER sao verificadas a parte)
  FOREACH v_fn IN ARRAY v_sig LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = v_fn::regprocedure AND p.prosecdef
        AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
    ) THEN
      RAISE EXCEPTION 'owner_sync: % sem SECURITY DEFINER ou sem search_path', v_fn;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN ('public.rpc_set_entity_owner(text,uuid,uuid)'::regprocedure,
                    'public.rpc_bulk_set_entity_owner(text,uuid[],uuid)'::regprocedure)
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'owner_sync: rpc_set_entity_owner/rpc_bulk_set_entity_owner tem de ser SECURITY INVOKER';
  END IF;

  -- uma so sobrecarga
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_update_schedule_item_assignees';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'owner_sync: % sobrecargas de rpc_update_schedule_item_assignees', v_n;
  END IF;

  -- privilegios
  FOREACH v_fn IN ARRAY v_exposed LOOP
    IF NOT has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'owner_sync: authenticated nao executa %', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'owner_sync: anon executa %', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_internal LOOP
    IF has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE')
       OR has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'owner_sync: % executavel por authenticated/anon', v_fn;
    END IF;
  END LOOP;
END
$verify$;
