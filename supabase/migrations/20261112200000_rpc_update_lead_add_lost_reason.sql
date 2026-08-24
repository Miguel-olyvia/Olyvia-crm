-- Adds p_lost_reason to rpc_update_lead, so the "Perdida" reason captured by
-- the new LeadLostReasonDialog (Kanban drag-and-drop, bulk status change,
-- and the edit dialog's status Select — see AnewLeads.tsx and
-- AnewLeadEditDialog.tsx) can be persisted through the same RPC that already
-- writes every other lead-update field, instead of a second round-trip.
--
-- This is a straight copy of the CURRENTLY ACTIVE function body — the
-- 13-arg CREATE OR REPLACE from 20261110480000_lead_sql_mql_qualification.sql,
-- confirmed to still be the live definition because
-- 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql only DROPs the
-- older 11-arg overload and does not touch this one. Nothing else in the
-- function is changed:
--   - p_lost_reason text DEFAULT NULL is appended as a new, defaulted last
--     parameter, so every existing caller (which never passes it) is
--     unaffected.
--   - Both UPDATE branches (status_changed / not) gain
--     lost_reason = COALESCE(p_lost_reason, lost_reason) — writing the new
--     reason when one is passed, and otherwise leaving whatever reason (or
--     NULL) the lead already had untouched, exactly like the instruction
--     "não apagar motivo já existente se não for passado".
--   - No other column, branch, diff computation, audit call, or the
--     qualification-history insert is touched.

CREATE OR REPLACE FUNCTION public.rpc_update_lead(
  p_lead_id uuid,
  p_field_values jsonb,
  p_status text,
  p_source text,
  p_notes text,
  p_assigned_to uuid,
  p_status_changed boolean,
  p_workflow_stage_id uuid,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_qualification_type text DEFAULT NULL,
  p_qualification_changed boolean DEFAULT false,
  p_lost_reason text DEFAULT NULL
)
RETURNS anew_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_before_lead  public.anew_leads;
  v_lead         public.anew_leads;
  v_before_ent   public.anew_entities;
  v_ent          public.anew_entities;
  v_entity_id    uuid;
  v_audit_org    uuid;
  v_lead_diff    jsonb;
  v_ent_diff     jsonb;
  v_diff         jsonb;
  v_ent_update   jsonb;
  v_new_qualification_type text;
  v_new_qualified_at timestamptz;
  v_new_qualification_set_by uuid;
BEGIN
  -- Consolidate all writes below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the lead (before-image + guards) ────────────────────────────────
  SELECT * INTO v_before_lead FROM public.anew_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_leads_update RLS ──────────────────────
  -- Accept BOTH the lead's organization_id and its root_organization_id, exactly
  -- like the anew_leads RLS policy, so a root-org member is not falsely rejected.
  IF NOT public.fn_lead_org_in_scope(v_before_lead.organization_id, v_before_lead.root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Resolve qualification fields (sticky rules) ──────────────────────────
  IF p_qualification_changed THEN
    v_new_qualification_type := p_qualification_type;
    IF p_qualification_type IS NOT NULL AND v_before_lead.qualified_at IS NULL THEN
      v_new_qualified_at := now();
    ELSE
      v_new_qualified_at := v_before_lead.qualified_at;
    END IF;
    IF p_qualification_type IS DISTINCT FROM v_before_lead.qualification_type THEN
      v_new_qualification_set_by := v_actor;
    ELSE
      v_new_qualification_set_by := v_before_lead.qualification_set_by;
    END IF;
  ELSE
    v_new_qualification_type := v_before_lead.qualification_type;
    v_new_qualified_at := v_before_lead.qualified_at;
    v_new_qualification_set_by := v_before_lead.qualification_set_by;
  END IF;

  -- ── UPDATE anew_leads (identical columns to handleSave's updatePayload) ───
  -- workflow_stage_id is only written when the status changed AND the FE
  -- resolved a stage id (mirrors "if (statusChanged && workflowStageId)").
  IF p_status_changed AND p_workflow_stage_id IS NOT NULL THEN
    UPDATE public.anew_leads
    SET field_values     = p_field_values,
        status           = p_status,
        source           = nullif(p_source, ''),
        notes            = nullif(p_notes, ''),
        assigned_to      = p_assigned_to,
        workflow_stage_id = p_workflow_stage_id,
        qualification_type = v_new_qualification_type,
        qualified_at        = v_new_qualified_at,
        qualification_set_by = v_new_qualification_set_by,
        lost_reason      = COALESCE(p_lost_reason, lost_reason),
        updated_at       = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.anew_leads
    SET field_values = p_field_values,
        status       = p_status,
        source       = nullif(p_source, ''),
        notes        = nullif(p_notes, ''),
        assigned_to  = p_assigned_to,
        qualification_type = v_new_qualification_type,
        qualified_at        = v_new_qualified_at,
        qualification_set_by = v_new_qualification_set_by,
        lost_reason  = COALESCE(p_lost_reason, lost_reason),
        updated_at   = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  END IF;

  v_entity_id := v_lead.entity_id;

  -- ── Sync anew_entities display_name (matches handleSave's entity update) ──
  -- Only when the lead has an entity AND the FE derived a non-empty display_name.
  v_ent_diff := '{}'::jsonb;
  IF v_entity_id IS NOT NULL AND nullif(btrim(p_display_name), '') IS NOT NULL THEN
    SELECT * INTO v_before_ent FROM public.anew_entities WHERE id = v_entity_id;

    v_ent_update := jsonb_build_object('display_name', btrim(p_display_name));
    IF nullif(p_first_name, '') IS NOT NULL THEN
      v_ent_update := v_ent_update || jsonb_build_object('first_name', p_first_name);
    END IF;
    IF nullif(p_last_name, '') IS NOT NULL THEN
      v_ent_update := v_ent_update || jsonb_build_object('last_name', p_last_name);
    END IF;

    UPDATE public.anew_entities
    SET display_name = btrim(p_display_name),
        first_name   = CASE WHEN nullif(p_first_name, '') IS NOT NULL THEN p_first_name ELSE first_name END,
        last_name    = CASE WHEN nullif(p_last_name, '')  IS NOT NULL THEN p_last_name  ELSE last_name  END
    WHERE id = v_entity_id
    RETURNING * INTO v_ent;

    IF FOUND THEN
      IF v_before_ent.display_name IS DISTINCT FROM v_ent.display_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('display_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.display_name), 'new', to_jsonb(v_ent.display_name)));
      END IF;
      IF v_before_ent.first_name IS DISTINCT FROM v_ent.first_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('first_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.first_name), 'new', to_jsonb(v_ent.first_name)));
      END IF;
      IF v_before_ent.last_name IS DISTINCT FROM v_ent.last_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('last_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.last_name), 'new', to_jsonb(v_ent.last_name)));
      END IF;
    END IF;
  END IF;

  -- ── Build the anew_leads diff (skip noise cols, like the trigger) ─────────
  v_lead_diff := '{}'::jsonb;
  IF v_before_lead.field_values IS DISTINCT FROM v_lead.field_values THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('field_values',
      jsonb_build_object('old', v_before_lead.field_values, 'new', v_lead.field_values));
  END IF;
  IF v_before_lead.status IS DISTINCT FROM v_lead.status THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_lead.status), 'new', to_jsonb(v_lead.status)));
  END IF;
  IF v_before_lead.source IS DISTINCT FROM v_lead.source THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('source',
      jsonb_build_object('old', to_jsonb(v_before_lead.source), 'new', to_jsonb(v_lead.source)));
  END IF;
  IF v_before_lead.notes IS DISTINCT FROM v_lead.notes THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before_lead.notes), 'new', to_jsonb(v_lead.notes)));
  END IF;
  IF v_before_lead.assigned_to IS DISTINCT FROM v_lead.assigned_to THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('assigned_to',
      jsonb_build_object('old', to_jsonb(v_before_lead.assigned_to), 'new', to_jsonb(v_lead.assigned_to)));
  END IF;
  IF v_before_lead.workflow_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('workflow_stage_id',
      jsonb_build_object('old', to_jsonb(v_before_lead.workflow_stage_id), 'new', to_jsonb(v_lead.workflow_stage_id)));
  END IF;
  IF v_before_lead.qualification_type IS DISTINCT FROM v_lead.qualification_type THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('qualification_type',
      jsonb_build_object('old', to_jsonb(v_before_lead.qualification_type), 'new', to_jsonb(v_lead.qualification_type)));
  END IF;

  -- ── Combine + emit ONE audit row keyed on the shared entity_id ────────────
  v_diff := '{}'::jsonb;
  IF v_lead_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_ent_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', v_ent_diff);
  END IF;

  v_audit_org := v_lead.organization_id;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_leads',
      COALESCE(v_entity_id, p_lead_id),
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  -- ── Dedicated qualification-change history row (separate from the above) ─
  IF v_before_lead.qualification_type IS DISTINCT FROM v_lead.qualification_type THEN
    BEGIN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (
        COALESCE(v_entity_id, p_lead_id),
        'qualification_changed',
        'qualification_type',
        v_before_lead.qualification_type,
        v_lead.qualification_type,
        v_actor,
        jsonb_build_object('organization_id', v_audit_org, 'lead_id', p_lead_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_lead;
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. anew_leads.lost_reason (added in 20261112190000) is only ever written
--    via COALESCE(p_lost_reason, lost_reason) — a NULL/omitted p_lost_reason
--    never clears an existing reason.
-- 2. Every other parameter, branch, diff, audit call and the
--    qualification-history insert are byte-for-byte identical to the
--    20261110480000 definition; only p_lost_reason (new, defaulted) and the
--    two "lost_reason = COALESCE(...)" lines were added.
