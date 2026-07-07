-- ============================================================
-- Lead Workflow Stages & Automation Rules — audit-logged save RPCs
-- ============================================================
-- Gap found via live E2E testing (org Nike): saving changes in the Leads
-- "Workflow" config dialog (LeadWorkflowConfig.tsx / WorkflowAutomationRules.tsx)
-- writes directly to lead_workflow_stages / workflow_automation_rules via
-- supabase.from(...).insert()/.update()/.delete() with ZERO audit trail.
-- entity_audit_log stays flat and workflow_execution_log is unrelated (it logs
-- automation *executions* against leads, not config edits) — there is no way
-- to know who changed a stage/rule, when, or what the previous value was.
--
-- This migration adds THREE SECURITY DEFINER RPCs that replace the raw
-- multi-row writes with single, audited, transactional operations. Each RPC
-- wraps its writes in app.audit_bypass + ONE fn_manual_audit_log call per
-- invocation, with a diff limited to rows that actually changed.
--
--   1. rpc_save_lead_workflow_stages   — create / update / reorder / soft-delete
--      lead_workflow_stages for one organization, in one call.
--   2. rpc_save_lead_workflow_automation  — create or update ONE
--      workflow_automation_rules row (mirrors handleSubmit in
--      WorkflowAutomationRules.tsx, which always saves one rule at a time).
--   3. rpc_delete_lead_workflow_automation — delete ONE workflow_automation_rules
--      row (mirrors handleDelete), with an audit row capturing the deleted rule.
--
-- Frontend UX is unchanged: only the DB-write step at Save/Guardar/Delete is
-- swapped for an RPC call. No schema changes.

-- ============================================================
-- 1. rpc_save_lead_workflow_stages(...)
-- ============================================================
-- Accepts the full desired state of an organization's active stages as a
-- JSONB array and reconciles it against the current DB state:
--   · rows with id = null                     -> INSERT (create / duplicate)
--   · rows with id matching an existing stage  -> UPDATE only if changed
--   · existing active rows NOT present in the payload -> soft-delete
--     (is_active = false), mirroring handleDeleteStage's deactivate pattern.
--   · stage_order is taken from each element's position in the array,
--     mirroring handleDragEnd's reindex-by-position behaviour.
--
-- p_stage IN JSONB shape (one array element):
--   { "id": uuid|null, "name": text, "label": text, "color": text,
--     "is_final": bool, "is_conversion": bool, "is_rejection": bool,
--     "default_status": text|null }
--
-- Diff covers ONLY stages that were actually created, changed, or
-- deactivated/reordered — unchanged rows are omitted entirely.
-- Authorization mirrors the existing anew_*_lead_workflow_stages RLS
-- (organization must be in get_user_visible_org_ids).

CREATE OR REPLACE FUNCTION public.rpc_save_lead_workflow_stages(
  p_organization_id uuid,
  p_stages          jsonb
)
RETURNS SETOF public.lead_workflow_stages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_elem         jsonb;
  v_order        integer := 0;
  v_id           uuid;
  v_before       public.lead_workflow_stages;
  v_after        public.lead_workflow_stages;
  v_seen_ids     uuid[] := ARRAY[]::uuid[];
  v_row_diff     jsonb;
  v_stage_diffs  jsonb := '{}'::jsonb;
  v_any_change   boolean := false;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' THEN
    RAISE EXCEPTION 'p_stages deve ser um array JSON' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── Walk the payload in order; order in the array == new stage_order ─────
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_order := v_order + 1;
    v_id := NULLIF(v_elem->>'id', '')::uuid;

    IF v_id IS NULL THEN
      -- ── CREATE ──────────────────────────────────────────────────────────
      INSERT INTO public.lead_workflow_stages
        (organization_id, name, label, color, stage_order,
         is_final, is_conversion, is_rejection, default_status, created_by)
      VALUES
        (p_organization_id,
         v_elem->>'name',
         v_elem->>'label',
         COALESCE(v_elem->>'color', '#6366f1'),
         v_order,
         COALESCE((v_elem->>'is_final')::boolean, false),
         COALESCE((v_elem->>'is_conversion')::boolean, false),
         COALESCE((v_elem->>'is_rejection')::boolean, false),
         NULLIF(v_elem->>'default_status', ''),
         v_actor)
      RETURNING * INTO v_after;

      v_stage_diffs := v_stage_diffs || jsonb_build_object(
        v_after.id::text, jsonb_build_object(
          'operation',       'created',
          'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.name)),
          'label',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.label)),
          'color',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.color)),
          'stage_order',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.stage_order)),
          'is_final',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_final)),
          'is_conversion',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_conversion)),
          'is_rejection',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_rejection)),
          'default_status',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.default_status))
        )
      );
      v_any_change := true;
      v_seen_ids := array_append(v_seen_ids, v_after.id);

    ELSE
      -- ── UPDATE (only if it belongs to this org and something changed) ───
      SELECT * INTO v_before
      FROM public.lead_workflow_stages
      WHERE id = v_id AND organization_id = p_organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Estágio % não encontrado nesta organização', v_id
          USING ERRCODE = 'no_data_found';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_id);

      UPDATE public.lead_workflow_stages SET
        label           = COALESCE(v_elem->>'label', label),
        color           = COALESCE(v_elem->>'color', color),
        stage_order     = v_order,
        is_final        = COALESCE((v_elem->>'is_final')::boolean, is_final),
        is_conversion   = COALESCE((v_elem->>'is_conversion')::boolean, is_conversion),
        is_rejection    = COALESCE((v_elem->>'is_rejection')::boolean, is_rejection),
        default_status  = NULLIF(v_elem->>'default_status', ''),
        updated_at      = now()
      WHERE id = v_id
      RETURNING * INTO v_after;

      v_row_diff := '{}'::jsonb;
      IF v_before.label IS DISTINCT FROM v_after.label THEN
        v_row_diff := v_row_diff || jsonb_build_object('label',
          jsonb_build_object('old', to_jsonb(v_before.label), 'new', to_jsonb(v_after.label)));
      END IF;
      IF v_before.color IS DISTINCT FROM v_after.color THEN
        v_row_diff := v_row_diff || jsonb_build_object('color',
          jsonb_build_object('old', to_jsonb(v_before.color), 'new', to_jsonb(v_after.color)));
      END IF;
      IF v_before.stage_order IS DISTINCT FROM v_after.stage_order THEN
        v_row_diff := v_row_diff || jsonb_build_object('stage_order',
          jsonb_build_object('old', to_jsonb(v_before.stage_order), 'new', to_jsonb(v_after.stage_order)));
      END IF;
      IF v_before.is_final IS DISTINCT FROM v_after.is_final THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_final',
          jsonb_build_object('old', to_jsonb(v_before.is_final), 'new', to_jsonb(v_after.is_final)));
      END IF;
      IF v_before.is_conversion IS DISTINCT FROM v_after.is_conversion THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_conversion',
          jsonb_build_object('old', to_jsonb(v_before.is_conversion), 'new', to_jsonb(v_after.is_conversion)));
      END IF;
      IF v_before.is_rejection IS DISTINCT FROM v_after.is_rejection THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_rejection',
          jsonb_build_object('old', to_jsonb(v_before.is_rejection), 'new', to_jsonb(v_after.is_rejection)));
      END IF;
      IF v_before.default_status IS DISTINCT FROM v_after.default_status THEN
        v_row_diff := v_row_diff || jsonb_build_object('default_status',
          jsonb_build_object('old', to_jsonb(v_before.default_status), 'new', to_jsonb(v_after.default_status)));
      END IF;

      IF v_row_diff <> '{}'::jsonb THEN
        v_stage_diffs := v_stage_diffs || jsonb_build_object(
          v_after.id::text, jsonb_build_object('operation', 'updated') || v_row_diff
        );
        v_any_change := true;
      END IF;
    END IF;
  END LOOP;

  -- ── Soft-delete active stages of this org that were dropped from payload ──
  FOR v_before IN
    SELECT * FROM public.lead_workflow_stages
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND NOT (id = ANY (v_seen_ids))
  LOOP
    UPDATE public.lead_workflow_stages
    SET is_active = false, updated_at = now()
    WHERE id = v_before.id;

    v_stage_diffs := v_stage_diffs || jsonb_build_object(
      v_before.id::text, jsonb_build_object(
        'operation', 'deactivated',
        'is_active', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'label',     jsonb_build_object('old', to_jsonb(v_before.label), 'new', to_jsonb(v_before.label))
      )
    );
    v_any_change := true;
  END LOOP;

  IF v_any_change THEN
    PERFORM public.fn_manual_audit_log(
      'lead_workflow_stages', p_organization_id, p_organization_id, 'UPDATE',
      jsonb_build_object('lead_workflow_stages', v_stage_diffs), 'web_app'
    );
  END IF;

  RETURN QUERY
  SELECT * FROM public.lead_workflow_stages
  WHERE organization_id = p_organization_id AND is_active = true
  ORDER BY stage_order;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_lead_workflow_stages(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_lead_workflow_stages(uuid, jsonb) TO authenticated;


-- ============================================================
-- 2. rpc_save_lead_workflow_automation(...)
-- ============================================================
-- Mirrors handleSubmit in WorkflowAutomationRules.tsx: creates one rule when
-- p_id is NULL, otherwise updates the existing row (diff only covers changed
-- columns). Authorization mirrors the "Users can manage workflow automation
-- rules" RLS policy (workflows.edit permission + org visibility, or system
-- admin).

CREATE OR REPLACE FUNCTION public.rpc_save_lead_workflow_automation(
  p_id                  uuid,
  p_organization_id     uuid,
  p_name                text,
  p_description         text,
  p_is_active           boolean,
  p_source_entity       text,
  p_trigger_type        text,
  p_trigger_stage_id    uuid,
  p_target_entity       text,
  p_action_type         text,
  p_action_stage_id     uuid,
  p_relationship_field  text,
  p_execution_order     integer
)
RETURNS public.workflow_automation_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_before     public.workflow_automation_rules;
  v_after      public.workflow_automation_rules;
  v_audit_org  uuid;
  v_diff       jsonb := '{}'::jsonb;
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.is_system_admin(auth.uid())
          OR (public.has_anew_permission(auth.uid(), 'workflows.edit')
              AND (p_organization_id IS NULL
                   OR p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))))) THEN
    RAISE EXCEPTION 'Sem permissão para gerir automações de workflow' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_id IS NULL THEN
    -- ── CREATE ────────────────────────────────────────────────────────────
    INSERT INTO public.workflow_automation_rules
      (organization_id, name, description, is_active, source_entity,
       trigger_type, trigger_stage_id, target_entity, action_type,
       action_stage_id, relationship_field, execution_order, created_by)
    VALUES
      (p_organization_id, p_name, NULLIF(p_description, ''), COALESCE(p_is_active, true),
       p_source_entity, p_trigger_type, p_trigger_stage_id, p_target_entity, p_action_type,
       p_action_stage_id, NULLIF(p_relationship_field, ''), COALESCE(p_execution_order, 0), v_actor)
    RETURNING * INTO v_after;

    v_diff := jsonb_build_object(
      'name',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.name)),
      'description',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.description)),
      'is_active',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_active)),
      'source_entity',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.source_entity)),
      'trigger_type',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.trigger_type)),
      'trigger_stage_id',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.trigger_stage_id)),
      'target_entity',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.target_entity)),
      'action_type',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.action_type)),
      'action_stage_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.action_stage_id)),
      'relationship_field', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.relationship_field)),
      'execution_order',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.execution_order))
    );

    v_audit_org := COALESCE(v_after.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'workflow_automation_rules', v_after.id, v_audit_org, 'INSERT', v_diff, 'web_app'
    );

    RETURN v_after;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  SELECT * INTO v_before FROM public.workflow_automation_rules WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regra de automação não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Re-validate authorization against the row's ACTUAL organization_id, not
  -- the caller-supplied p_organization_id — otherwise a user could pass an
  -- arbitrary p_id belonging to another org while supplying their own org id
  -- (which passes the earlier visibility check) and edit a rule they have no
  -- real permission over.
  IF NOT (public.is_system_admin(auth.uid())
          OR (public.has_anew_permission(auth.uid(), 'workflows.edit')
              AND (v_before.organization_id IS NULL
                   OR v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))))) THEN
    RAISE EXCEPTION 'Sem permissão para gerir automações de workflow' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.workflow_automation_rules SET
    name                = p_name,
    description         = NULLIF(p_description, ''),
    is_active           = COALESCE(p_is_active, is_active),
    source_entity       = p_source_entity,
    trigger_type        = p_trigger_type,
    trigger_stage_id    = p_trigger_stage_id,
    target_entity       = p_target_entity,
    action_type         = p_action_type,
    action_stage_id     = p_action_stage_id,
    relationship_field  = NULLIF(p_relationship_field, ''),
    execution_order      = COALESCE(p_execution_order, execution_order),
    updated_at          = now()
  WHERE id = p_id
    AND organization_id = v_before.organization_id
  RETURNING * INTO v_after;

  IF v_before.name IS DISTINCT FROM v_after.name THEN
    v_diff := v_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_after.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_after.description THEN
    v_diff := v_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_after.description)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_after.is_active THEN
    v_diff := v_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_after.is_active)));
  END IF;
  IF v_before.source_entity IS DISTINCT FROM v_after.source_entity THEN
    v_diff := v_diff || jsonb_build_object('source_entity',
      jsonb_build_object('old', to_jsonb(v_before.source_entity), 'new', to_jsonb(v_after.source_entity)));
  END IF;
  IF v_before.trigger_type IS DISTINCT FROM v_after.trigger_type THEN
    v_diff := v_diff || jsonb_build_object('trigger_type',
      jsonb_build_object('old', to_jsonb(v_before.trigger_type), 'new', to_jsonb(v_after.trigger_type)));
  END IF;
  IF v_before.trigger_stage_id IS DISTINCT FROM v_after.trigger_stage_id THEN
    v_diff := v_diff || jsonb_build_object('trigger_stage_id',
      jsonb_build_object('old', to_jsonb(v_before.trigger_stage_id), 'new', to_jsonb(v_after.trigger_stage_id)));
  END IF;
  IF v_before.target_entity IS DISTINCT FROM v_after.target_entity THEN
    v_diff := v_diff || jsonb_build_object('target_entity',
      jsonb_build_object('old', to_jsonb(v_before.target_entity), 'new', to_jsonb(v_after.target_entity)));
  END IF;
  IF v_before.action_type IS DISTINCT FROM v_after.action_type THEN
    v_diff := v_diff || jsonb_build_object('action_type',
      jsonb_build_object('old', to_jsonb(v_before.action_type), 'new', to_jsonb(v_after.action_type)));
  END IF;
  IF v_before.action_stage_id IS DISTINCT FROM v_after.action_stage_id THEN
    v_diff := v_diff || jsonb_build_object('action_stage_id',
      jsonb_build_object('old', to_jsonb(v_before.action_stage_id), 'new', to_jsonb(v_after.action_stage_id)));
  END IF;
  IF v_before.relationship_field IS DISTINCT FROM v_after.relationship_field THEN
    v_diff := v_diff || jsonb_build_object('relationship_field',
      jsonb_build_object('old', to_jsonb(v_before.relationship_field), 'new', to_jsonb(v_after.relationship_field)));
  END IF;
  IF v_before.execution_order IS DISTINCT FROM v_after.execution_order THEN
    v_diff := v_diff || jsonb_build_object('execution_order',
      jsonb_build_object('old', to_jsonb(v_before.execution_order), 'new', to_jsonb(v_after.execution_order)));
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    v_audit_org := COALESCE(v_after.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'workflow_automation_rules', v_after.id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_lead_workflow_automation(
  uuid, uuid, text, text, boolean, text, text, uuid, text, text, uuid, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_lead_workflow_automation(
  uuid, uuid, text, text, boolean, text, text, uuid, text, text, uuid, text, integer
) TO authenticated;


-- ============================================================
-- 3. rpc_delete_lead_workflow_automation(...)
-- ============================================================
-- Mirrors handleDelete in WorkflowAutomationRules.tsx. Captures the deleted
-- row's full field set as the diff (old -> NULL) before removing it.
-- Same authorization as the manage-automation-rules RLS policy.

CREATE OR REPLACE FUNCTION public.rpc_delete_lead_workflow_automation(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before    public.workflow_automation_rules;
  v_audit_org uuid;
  v_diff      jsonb;
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  SELECT * INTO v_before FROM public.workflow_automation_rules WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regra de automação não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.is_system_admin(auth.uid())
          OR (public.has_anew_permission(auth.uid(), 'workflows.edit')
              AND (v_before.organization_id IS NULL
                   OR v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))))) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar automações de workflow' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.workflow_automation_rules WHERE id = p_id;

  v_diff := jsonb_build_object(
    'name',               jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
    'description',        jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
    'is_active',          jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL),
    'source_entity',      jsonb_build_object('old', to_jsonb(v_before.source_entity), 'new', NULL),
    'trigger_type',       jsonb_build_object('old', to_jsonb(v_before.trigger_type), 'new', NULL),
    'trigger_stage_id',   jsonb_build_object('old', to_jsonb(v_before.trigger_stage_id), 'new', NULL),
    'target_entity',      jsonb_build_object('old', to_jsonb(v_before.target_entity), 'new', NULL),
    'action_type',        jsonb_build_object('old', to_jsonb(v_before.action_type), 'new', NULL),
    'action_stage_id',    jsonb_build_object('old', to_jsonb(v_before.action_stage_id), 'new', NULL),
    'relationship_field', jsonb_build_object('old', to_jsonb(v_before.relationship_field), 'new', NULL),
    'execution_order',    jsonb_build_object('old', to_jsonb(v_before.execution_order), 'new', NULL)
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);
  PERFORM public.fn_manual_audit_log(
    'workflow_automation_rules', v_before.id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_lead_workflow_automation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_lead_workflow_automation(uuid) TO authenticated;
