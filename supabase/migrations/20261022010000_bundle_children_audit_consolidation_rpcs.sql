-- Bundles — consolidate child-editor audit rows (bundle_components / bundle_choice_groups)
-- Forward-only migration. Do not fold into or edit 20260809010000_bundles_audit_bypass_and_rpcs.sql.
--
-- Problem
-- -------
-- 20260809010000 fixed bundles.INSERT/UPDATE/DELETE (create/edit/delete wizard) to write exactly
-- ONE audit row per action, via rpc_create_bundle/rpc_update_bundle/rpc_delete_bundle with
-- app.audit_bypass. It explicitly documented that the child editors (BundleComponentsEditor.tsx,
-- BundleChoiceGroupsEditor.tsx) still call supabase.from("bundle_components"/"bundle_choice_groups")
-- directly, wrapped only in withAuditContext (sets app.audit_user_id/app.audit_source, never
-- app.audit_bypass). Live E2E re-test confirms the resulting defect: adding 2 components in one
-- "Add Selected" click produces 2 separate bundle_components INSERT rows instead of 1 consolidated
-- row for that action. handleDeleteGroup is worse: it issues two separate direct calls (delete
-- components by choice_group_id, then delete the group) as two independent transactions/network
-- round trips — not just an audit-count issue, but a real non-atomicity/orphaned-row risk if the
-- second call fails after the first succeeds.
--
-- Solution
-- --------
-- Reuse the SAME foundation as 20260809010000 (fn_manual_audit_log, the app.audit_bypass guard
-- already present on fn_audit_bundle_components/fn_audit_bundle_choice_groups since that
-- migration). Add 5 new RPCs for the child-editor actions, each: re-validates the parent bundle
-- (non-deleted, organization_id matches the caller's visible orgs, products.manage permission —
-- identical predicate to rpc_update_bundle) inside its own transaction, sets app.audit_bypass='on',
-- does the mutation(s), writes exactly ONE fn_manual_audit_log call.
--
-- Authorization mirrors bundle_components_*/bundle_choice_groups_* RLS (20260704000000):
--   is_system_admin_user(uid)
--   OR ( has_anew_permission(uid,'products.manage')
--        AND parent bundle: deleted_at IS NULL AND organization_id IN get_user_visible_org_ids(uid) )
-- Every RPC derives organization_id from the bundle row itself (never trusts a client-supplied
-- p_organization_id as ground truth) to avoid a broken-access-control vector in a SECURITY DEFINER
-- function.
--
-- Prerequisites: 20260809010000_bundles_audit_bypass_and_rpcs.sql (fn_manual_audit_log, guarded
-- child trigger functions), 20260704010000_bundles_audit_triggers.sql (bundle_components /
-- bundle_choice_groups schemas), 20260615130000_baseline_new_database.sql (has_anew_permission,
-- current_business_user_id, get_user_visible_org_ids, is_system_admin_user).

-- ============================================================
-- Shared validation helper: load + authorize the parent bundle
-- ============================================================
-- Returns the bundle row when the caller is authorized to write its children; raises otherwise.
-- Not exposed to PostgREST (no GRANT to authenticated) — internal use only.

CREATE OR REPLACE FUNCTION public._bundle_children_authorize(p_bundle_id uuid)
RETURNS public.bundles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_bundle   public.bundles;
BEGIN
  SELECT * INTO v_bundle
  FROM public.bundles
  WHERE id = p_bundle_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para editar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_bundle.organization_id IS NULL
       OR NOT (v_bundle.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN v_bundle;
END;
$$;

REVOKE ALL ON FUNCTION public._bundle_children_authorize(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 1. rpc_add_bundle_components(p_bundle_id, p_items)
-- ============================================================
-- Replaces BundleComponentsEditor.handleAddItems and BundleChoiceGroupsEditor.handleAddItems.
-- p_items: jsonb array of {product_id, service_id, quantity, pricing_mode, is_optional,
--   sort_order, choice_group_id (nullable, pass-through — NOT re-derived, since the FE already
--   resolved it to a real existing group id via addItemsGroupId before calling this RPC)}.

CREATE OR REPLACE FUNCTION public.rpc_add_bundle_components(
  p_bundle_id uuid,
  p_items     jsonb
)
RETURNS SETOF public.bundle_components
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle    public.bundles;
  v_actor     uuid;
  v_item      jsonb;
  v_idx       integer;
  v_comps_diff jsonb := '[]'::jsonb;
  v_new_id    uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item para adicionar' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  FOR v_idx IN 0 .. (jsonb_array_length(p_items) - 1) LOOP
    v_item := p_items -> v_idx;

    INSERT INTO public.bundle_components
      (bundle_id, product_id, service_id, quantity, pricing_mode,
       custom_price, custom_discount_percent, custom_discount_fixed,
       is_optional, choice_group_id, sort_order)
    VALUES
      (p_bundle_id,
       nullif(v_item ->> 'product_id', '')::uuid,
       nullif(v_item ->> 'service_id', '')::uuid,
       COALESCE((v_item ->> 'quantity')::numeric, 1),
       COALESCE((v_item ->> 'pricing_mode'), 'original')::public.component_pricing_mode,
       nullif(v_item ->> 'custom_price', '')::numeric,
       nullif(v_item ->> 'custom_discount_percent', '')::numeric,
       nullif(v_item ->> 'custom_discount_fixed', '')::numeric,
       COALESCE((v_item ->> 'is_optional')::boolean, false),
       nullif(v_item ->> 'choice_group_id', '')::uuid,
       COALESCE((v_item ->> 'sort_order')::integer, v_idx))
    RETURNING id INTO v_new_id;

    v_comps_diff := v_comps_diff || jsonb_build_array(
      jsonb_build_object(
        'id',              to_jsonb(v_new_id),
        'product_id',      v_item -> 'product_id',
        'service_id',      v_item -> 'service_id',
        'quantity',        v_item -> 'quantity',
        'choice_group_id', v_item -> 'choice_group_id'
      )
    );
  END LOOP;

  IF v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_components', p_bundle_id, v_bundle.organization_id, 'INSERT',
      jsonb_build_object('bundle_components', jsonb_build_object('old', NULL, 'new', v_comps_diff)),
      'web_app'
    );
  END IF;

  RETURN QUERY SELECT * FROM public.bundle_components WHERE bundle_id = p_bundle_id ORDER BY sort_order;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_add_bundle_components(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_bundle_components(uuid, jsonb) TO authenticated;

-- ============================================================
-- 2. rpc_update_bundle_component(p_id, p_bundle_id, p_updates)
-- ============================================================
-- Replaces BundleComponentsEditor.handleUpdateComponent. Already 1-row-per-action via the raw
-- trigger today; moved into an RPC purely to standardize authorization (explicit products.manage +
-- parent-org check instead of relying only on RLS) and actor/source attribution in one transaction,
-- consistent with rpc_update_bundle.

CREATE OR REPLACE FUNCTION public.rpc_update_bundle_component(
  p_id        uuid,
  p_bundle_id uuid,
  p_updates   jsonb
)
RETURNS public.bundle_components
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle  public.bundles;
  v_actor   uuid;
  v_before  public.bundle_components;
  v_comp    public.bundle_components;
  v_diff    jsonb := '{}'::jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  SELECT * INTO v_before FROM public.bundle_components WHERE id = p_id AND bundle_id = p_bundle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Componente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.bundle_components
  SET quantity                 = COALESCE((p_updates ->> 'quantity')::numeric, quantity),
      pricing_mode             = COALESCE((p_updates ->> 'pricing_mode')::public.component_pricing_mode, pricing_mode),
      custom_price             = CASE WHEN p_updates ? 'custom_price' THEN nullif(p_updates ->> 'custom_price', '')::numeric ELSE custom_price END,
      custom_discount_percent  = CASE WHEN p_updates ? 'custom_discount_percent' THEN nullif(p_updates ->> 'custom_discount_percent', '')::numeric ELSE custom_discount_percent END,
      custom_discount_fixed    = CASE WHEN p_updates ? 'custom_discount_fixed' THEN nullif(p_updates ->> 'custom_discount_fixed', '')::numeric ELSE custom_discount_fixed END,
      is_optional              = COALESCE((p_updates ->> 'is_optional')::boolean, is_optional)
  WHERE id = p_id AND bundle_id = p_bundle_id
  RETURNING * INTO v_comp;

  IF v_before.quantity IS DISTINCT FROM v_comp.quantity THEN
    v_diff := v_diff || jsonb_build_object('quantity', jsonb_build_object('old', to_jsonb(v_before.quantity), 'new', to_jsonb(v_comp.quantity)));
  END IF;
  IF v_before.pricing_mode IS DISTINCT FROM v_comp.pricing_mode THEN
    v_diff := v_diff || jsonb_build_object('pricing_mode', jsonb_build_object('old', to_jsonb(v_before.pricing_mode), 'new', to_jsonb(v_comp.pricing_mode)));
  END IF;
  IF v_before.custom_price IS DISTINCT FROM v_comp.custom_price THEN
    v_diff := v_diff || jsonb_build_object('custom_price', jsonb_build_object('old', to_jsonb(v_before.custom_price), 'new', to_jsonb(v_comp.custom_price)));
  END IF;
  IF v_before.is_optional IS DISTINCT FROM v_comp.is_optional THEN
    v_diff := v_diff || jsonb_build_object('is_optional', jsonb_build_object('old', to_jsonb(v_before.is_optional), 'new', to_jsonb(v_comp.is_optional)));
  END IF;

  IF v_diff <> '{}'::jsonb AND v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_components', p_bundle_id, v_bundle.organization_id, 'UPDATE',
      jsonb_build_object('bundle_components', v_diff), 'web_app'
    );
  END IF;

  RETURN v_comp;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_bundle_component(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_bundle_component(uuid, uuid, jsonb) TO authenticated;

-- ============================================================
-- 3. rpc_delete_bundle_component(p_id, p_bundle_id)
-- ============================================================
-- Replaces BundleComponentsEditor.handleDeleteComponent and
-- BundleChoiceGroupsEditor.handleDeleteComponent (deleting one option from a choice group).

CREATE OR REPLACE FUNCTION public.rpc_delete_bundle_component(
  p_id        uuid,
  p_bundle_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle public.bundles;
  v_actor  uuid;
  v_before public.bundle_components;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  SELECT * INTO v_before FROM public.bundle_components WHERE id = p_id AND bundle_id = p_bundle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Componente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  DELETE FROM public.bundle_components WHERE id = p_id AND bundle_id = p_bundle_id;

  IF v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_components', p_bundle_id, v_bundle.organization_id, 'DELETE',
      jsonb_build_object('bundle_components', jsonb_build_object('old', to_jsonb(v_before), 'new', NULL)),
      'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_bundle_component(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_bundle_component(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. rpc_create_bundle_choice_group(p_bundle_id, p_group)
-- ============================================================
-- Replaces BundleChoiceGroupsEditor.handleCreateGroup.
-- p_group: jsonb {name, description, min_selections, max_selections, is_required, sort_order}.

CREATE OR REPLACE FUNCTION public.rpc_create_bundle_choice_group(
  p_bundle_id uuid,
  p_group     jsonb
)
RETURNS public.bundle_choice_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle public.bundles;
  v_actor  uuid;
  v_group  public.bundle_choice_groups;
  v_name   text := btrim(coalesce(p_group ->> 'name', ''));
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Nome do grupo é obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  PERFORM set_config('app.audit_bypass', 'on', true);

  INSERT INTO public.bundle_choice_groups
    (bundle_id, name, description, min_selections, max_selections, is_required, sort_order)
  VALUES
    (p_bundle_id,
     v_name,
     nullif(btrim(coalesce(p_group ->> 'description', '')), ''),
     COALESCE((p_group ->> 'min_selections')::integer, 1),
     COALESCE((p_group ->> 'max_selections')::integer, 1),
     COALESCE((p_group ->> 'is_required')::boolean, true),
     COALESCE((p_group ->> 'sort_order')::integer, 0))
  RETURNING * INTO v_group;

  IF v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_choice_groups', p_bundle_id, v_bundle.organization_id, 'INSERT',
      jsonb_build_object('bundle_choice_groups', jsonb_build_object(
        'old', NULL,
        'new', jsonb_build_object('id', to_jsonb(v_group.id), 'name', to_jsonb(v_group.name))
      )),
      'web_app'
    );
  END IF;

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_bundle_choice_group(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_bundle_choice_group(uuid, jsonb) TO authenticated;

-- ============================================================
-- 5. rpc_delete_bundle_choice_group(p_group_id, p_bundle_id)
-- ============================================================
-- Replaces BundleChoiceGroupsEditor.handleDeleteGroup. THE key fix: folds the two previously
-- independent round trips (delete components by choice_group_id, then delete the group) into ONE
-- transaction — closes both the N-audit-rows defect AND the non-atomicity/orphaned-component risk
-- (a failure between the two old calls could leave bundle_components with a dangling
-- choice_group_id; that is now impossible, since either both deletes commit or neither does).

CREATE OR REPLACE FUNCTION public.rpc_delete_bundle_choice_group(
  p_group_id  uuid,
  p_bundle_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle        public.bundles;
  v_actor         uuid;
  v_before_group  public.bundle_choice_groups;
  v_deleted_count integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  SELECT * INTO v_before_group
  FROM public.bundle_choice_groups
  WHERE id = p_group_id AND bundle_id = p_bundle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  WITH deleted AS (
    DELETE FROM public.bundle_components
    WHERE choice_group_id = p_group_id AND bundle_id = p_bundle_id
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  DELETE FROM public.bundle_choice_groups WHERE id = p_group_id AND bundle_id = p_bundle_id;

  IF v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_choice_groups', p_bundle_id, v_bundle.organization_id, 'DELETE',
      jsonb_build_object(
        'bundle_choice_groups', jsonb_build_object('old', jsonb_build_object('id', to_jsonb(v_before_group.id), 'name', to_jsonb(v_before_group.name)), 'new', NULL),
        'bundle_components', jsonb_build_object('deleted_count', to_jsonb(v_deleted_count))
      ),
      'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_bundle_choice_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_bundle_choice_group(uuid, uuid) TO authenticated;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Adding 2 components in one "Add Selected" action produces exactly 1 audit row:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'bundle_components' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 2).
--
-- 2. Deleting a choice group with 3 options produces exactly 1 audit row, and both
--    bundle_components and bundle_choice_groups rows are gone (or neither, if the RPC raised).
--
-- 3. All 5 RPCs raise no_data_found for a deleted/non-existent bundle, and insufficient_privilege
--    for a bundle outside the caller's visible orgs — matching bundle_components_*/
--    bundle_choice_groups_* RLS.
