-- Log "notes" changes and "lost_reason" (lead perdida) as entity_interactions
-- rows, so both the "Notas" tab (ClientNotesTab, filters entity_interactions
-- where notes IS NOT NULL) and the "Timeline" tab (LeadTimelineTab reads
-- entity_interactions directly) automatically pick them up — no FE changes.
--
-- Rebuilt from the LIVE definition of public.rpc_update_lead (14-arg
-- signature, verified via pg_get_functiondef against the remote DB on
-- 2026-09-14), NOT from the older migration files
-- 20261112200000_rpc_update_lead_add_lost_reason.sql /
-- 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql /
-- 20261112250000_fix_rpc_update_lead_ambiguous_overload_v2.sql, so none of
-- the fixes already applied on top of those (e.g. the single 14-arg overload,
-- fn_lead_org_in_scope authorization parity, qualification sticky rules) are
-- lost. Signature, argument order and defaults are IDENTICAL to the live
-- version — this is a pure CREATE OR REPLACE, no new/removed/reordered
-- parameters, so it cannot reintroduce the ambiguous-overload bug those two
-- fixes addressed.
--
-- New behaviour added (both are additive, wrapped in their own IF blocks,
-- placed after the existing anew_leads diff is built and before the single
-- consolidated audit-log row is emitted):
--
--   a) When the lead's `notes` actually changes (old IS DISTINCT FROM new,
--      new IS NOT NULL) — i.e. NOT when the same text is resubmitted, and
--      NOT when p_notes was blank/omitted — insert one entity_interactions
--      row (interaction_type = 'note', notes = new text).
--
--   b) When the lead's status is (or becomes) 'lost' and p_lost_reason is
--      provided, AND this is an actual change (status just transitioned to
--      'lost', or the reason text itself changed while already lost) —
--      insert one entity_interactions row with
--      notes = 'Lead perdida — Motivo: <lost_reason>'. Guarded so resaving
--      an already-lost lead with the same reason does not spam the timeline.
--
-- Both inserts use created_by = v_actor::text (entity_interactions.created_by
-- is TEXT, not uuid — matches the existing convention in e.g.
-- rpc_schedule_meeting, see 20260902010000_contacts_clients_atomic_create_and_fixes.sql)
-- and organization_id/root_organization_id copied from the just-updated lead.
--
-- Each insert is followed by an explicit public.fn_manual_audit_log(...) call
-- for the 'entity_interactions' row, matching the same convention used by
-- rpc_schedule_meeting — required because this function already does
-- `PERFORM set_config('app.audit_bypass', 'on', true)` at the top (so the
-- lead update produces a single consolidated audit row instead of one per
-- touched table), which also silently suppresses the entity_interactions
-- table's own AFTER-trigger (trg_audit_entity_interactions ->
-- fn_generic_entity_audit) for the rest of this transaction. Without this
-- explicit call, the new interaction rows would leave zero trace in
-- entity_audit_log. This does NOT duplicate anything in the Timeline tab:
-- LeadTimelineTab explicitly excludes table_name = 'entity_interactions' rows
-- coming from entity_audit_log (see the `row.table_name !== "entity_interactions"`
-- guard in LeadTimelineTab.tsx) precisely because those interactions are
-- already rendered from the entity_interactions query itself.
--
-- No schema change. No new/removed parameters. Safe to review as a pure
-- CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.rpc_update_lead(p_lead_id uuid, p_field_values jsonb, p_status text, p_source text, p_notes text, p_assigned_to uuid, p_status_changed boolean, p_workflow_stage_id uuid, p_display_name text, p_first_name text, p_last_name text, p_qualification_type text DEFAULT NULL::text, p_qualification_changed boolean DEFAULT false, p_lost_reason text DEFAULT NULL::text)
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
  v_notes_interaction_id uuid;
  v_lost_interaction_id  uuid;
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

  -- ── Timeline: log a "note" interaction when anew_leads.notes changes ─────
  -- Surfaces the free-text "Notas" field saved via the Edit Lead modal in
  -- both the "Notas" tab (ClientNotesTab — filters entity_interactions where
  -- notes IS NOT NULL) and the "Timeline" tab (LeadTimelineTab reads
  -- entity_interactions directly), without a FE change. Only fires on an
  -- actual change to a non-blank value, so resubmitting the same text (or an
  -- omitted/blank p_notes) does not create duplicate rows.
  IF v_entity_id IS NOT NULL
     AND v_before_lead.notes IS DISTINCT FROM v_lead.notes
     AND v_lead.notes IS NOT NULL THEN
    INSERT INTO public.entity_interactions
      (entity_id, organization_id, root_organization_id, interaction_type,
       notes, created_by, interaction_at)
    VALUES
      (v_entity_id, v_lead.organization_id, v_lead.root_organization_id, 'note',
       v_lead.notes, v_actor::text, now())
    RETURNING id INTO v_notes_interaction_id;

    PERFORM public.fn_manual_audit_log(
      'entity_interactions',
      v_entity_id,
      v_lead.organization_id,
      'INSERT',
      jsonb_build_object('entity_interactions', jsonb_build_object(
        'id',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_notes_interaction_id)),
        'interaction_type', jsonb_build_object('old', NULL, 'new', to_jsonb('note'::text)),
        'notes',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_lead.notes))
      )),
      'web_app'
    );
  END IF;

  -- ── Timeline: log a dedicated interaction when the lead is lost ──────────
  -- Guarded so resaving an already-lost lead with the same reason does not
  -- spam the timeline: only fires when status just transitioned to 'lost',
  -- or the reason text itself changed while the lead was already lost.
  IF v_entity_id IS NOT NULL
     AND v_lead.status = 'lost'
     AND p_lost_reason IS NOT NULL
     AND (v_before_lead.status IS DISTINCT FROM v_lead.status
          OR v_before_lead.lost_reason IS DISTINCT FROM v_lead.lost_reason) THEN
    INSERT INTO public.entity_interactions
      (entity_id, organization_id, root_organization_id, interaction_type,
       notes, created_by, interaction_at)
    VALUES
      (v_entity_id, v_lead.organization_id, v_lead.root_organization_id, 'note',
       'Lead perdida — Motivo: ' || v_lead.lost_reason, v_actor::text, now())
    RETURNING id INTO v_lost_interaction_id;

    PERFORM public.fn_manual_audit_log(
      'entity_interactions',
      v_entity_id,
      v_lead.organization_id,
      'INSERT',
      jsonb_build_object('entity_interactions', jsonb_build_object(
        'id',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_lost_interaction_id)),
        'interaction_type', jsonb_build_object('old', NULL, 'new', to_jsonb('note'::text)),
        'notes',            jsonb_build_object('old', NULL, 'new', to_jsonb('Lead perdida — Motivo: ' || v_lead.lost_reason))
      )),
      'web_app'
    );
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
