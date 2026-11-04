-- ============================================================
-- 20270105800000_rpc_update_lead_permissao
-- ============================================================
-- O que faz: rpc_update_lead (SECURITY DEFINER, escreve anew_leads/anew_entities sem RLS) só verificava fn_lead_org_in_scope
--   (qualquer associação ativa na organização). Passa a exigir também:
--     1. leads.edit numa associação ativa à organização da lead: has_anew_permission_in_org(auth.uid(), 'leads.edit', org);
--     2. o âmbito de leads.edit sobre a lead, como as funções novas (fn_neg_pessoa_no_ambito / fn_neg_pode_mudar_dono_lead):
--        crm_scope_keys('leads.edit') (via resolve_lead_access_context, que lê anew_membership_permission_scopes) tem de conter
--        '<org>:*' (ORG), ou '<org>:<assigned_to>' / '<org>:<created_by>' da lead (OWNED, ou TEAM = equipa que lidera + ele próprio).
--     system_admin/super_admin: como nas funções novas - o papel tem leads.edit e resolve_lead_access_context dá-lhes âmbito ORG
--     nas organizações onde são membros.
--   Recusa: SQLSTATE 42501 com mensagem em português.
-- Construída a partir do texto VIVO (pg_get_functiondef na base RH, 4/11/2026); tudo o resto fica igual (assinatura, search_path,
--   SECURITY DEFINER, auditoria). CREATE OR REPLACE mantém as permissões (postgres, authenticated, service_role).
-- Nenhuma outra função nem gatilho chama rpc_update_lead (pg_proc.prosrc verificado). Hoje nenhum ecrã ativo a usa
--   (Pessoas usa neg_classificar_lead; useQualificarLeadPessoa é fallback; a página Leads antiga não tem rota).
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

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

  -- ── 20270105800000: leads.edit na organização da lead + âmbito (own/team/org) ──
  -- O mesmo teste das funções novas (fn_neg_pessoa_no_ambito): a permissão tem de
  -- existir numa associação ativa à organização da lead (has_anew_permission_in_org)
  -- e o âmbito de leads.edit (crm_scope_keys -> resolve_lead_access_context, que lê
  -- anew_membership_permission_scopes; system_admin/super_admin = ORG) tem de cobrir
  -- a lead: '<org>:*' ou '<org>:<responsável>' ou '<org>:<criador>'.
  IF auth.uid() IS NULL
     OR NOT public.has_anew_permission_in_org(auth.uid(), 'leads.edit', v_before_lead.organization_id)
     OR NOT EXISTS (
       SELECT 1 FROM unnest(public.crm_scope_keys('leads.edit')) AS k(scope_key)
       WHERE k.scope_key = v_before_lead.organization_id::text || ':*'
          OR k.scope_key = v_before_lead.organization_id::text || ':' || v_before_lead.assigned_to::text
          OR k.scope_key = v_before_lead.organization_id::text || ':' || v_before_lead.created_by::text) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta lead: é preciso leads.edit na organização da lead, com âmbito sobre ela.'
      USING ERRCODE = '42501';
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

DO $do$
BEGIN
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rpc_update_lead') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'public.rpc_update_lead'::regproc AND p.prosrc LIKE '%20270105800000%') THEN
    RAISE EXCEPTION 'CONFERIR: rpc_update_lead sem a alteração 20270105800000 (ou com sobrecargas)';
  END IF;
END $do$;
