-- Gap fix: fn_mark_lead_pipeline_dirty auto-advance can push a lead into a
-- rejection/lost stage WITHOUT ever capturing a lost_reason, unlike
-- rpc_update_lead (the only user-facing path today), which requires one.
-- This is currently inert in practice (the only 2 configured rules with
-- is_rejection/counts_as_lost + auto_advance, in Mudelar and BMGest, never
-- fire due to an unrelated reached_when format bug — NOT touched here), but
-- it is an architectural gap: if such a rule ever fires (today or in the
-- future, in any organization), the lead would be marked lost/rejected with
-- an empty lost_reason and zero trace in the Notas/Timeline tabs.
--
-- Rebuilt from the LIVE definition of public.fn_mark_lead_pipeline_dirty,
-- verified via pg_get_functiondef against the remote DB on 2026-09-14 —
-- confirmed byte-for-byte identical to 20261111100000_pipeline_dirty_trigger_
-- recursion_guard.sql, so that migration's guard/comments are preserved
-- as-is. This is a pure additive CREATE OR REPLACE: the anti-recursion guard
-- (pg_trigger_depth() > 1), the entity_id resolution, the FOR loop over
-- leads sharing the trigger's entity_id, compute_lead_stage_v2 call, and the
-- non-auto_advance / non-rejection branches are all IDENTICAL to the live
-- version. Only the auto_advance branch is split in two:
--
--   * v_new_stage.is_rejection OR v_new_stage.counts_as_lost  → NEW behaviour
--     below (lost_reason + entity_interactions row), in addition to the
--     existing status/workflow_stage_id/pipeline_dirty_at write.
--   * anything else (qualified, negotiation, converted, ...)  → UNCHANGED,
--     byte-for-byte the same UPDATE as before.
--
-- New behaviour (only on the is_rejection/counts_as_lost auto-advance path):
--   a) lost_reason is set to a clearly-labelled automatic value
--      ('Motivo automático — regra do motor: ' || v_new_stage.label) —
--      but ONLY when the lead does not already have a lost_reason
--      (COALESCE(v_lead.lost_reason, ...)), so a manually-entered reason is
--      never overwritten by this trigger.
--   b) One entity_interactions row is inserted (interaction_type = 'note',
--      notes = 'Lead perdida automaticamente pelo motor — Estágio: ' ||
--      v_new_stage.label), using the lead's own entity_id/organization_id/
--      root_organization_id — same convention as the lost-reason interaction
--      added to rpc_update_lead in 20261130140000. created_by is left NULL
--      (no human actor here; entity_interactions.created_by is nullable and
--      the FE already renders created_by as string | null).
--   c) An explicit public.fn_manual_audit_log(...) call follows the insert,
--      matching the same convention used by rpc_update_lead / rpc_schedule_
--      meeting: this trigger does not set app.audit_bypass itself, but the
--      INSERT/UPDATE that fired it (on deals/quotes/proposals/
--      client_contracts/entity_interactions) may have been issued by an RPC
--      that already set app.audit_bypass = 'on' for its own consolidated
--      audit row, which would silently suppress entity_interactions' own
--      trg_audit_entity_interactions trigger for the rest of that
--      transaction. The explicit call guarantees an audit trail regardless
--      of the caller's audit_bypass state.
--
-- Recursion note: this function is itself attached to entity_interactions
-- (trg_entity_interactions_mark_lead_pipeline_dirty). The new INSERT into
-- entity_interactions below will therefore re-fire this same trigger one
-- level deeper — this is exactly the scenario the pre-existing
-- pg_trigger_depth() > 1 guard (added defensively in 20261111100000) now
-- protects against: the nested invocation hits depth 2 and returns
-- immediately via `RETURN COALESCE(NEW, OLD)` at the top, doing no
-- additional work. No infinite loop, single extra no-op invocation.
--
-- No schema change. No new/removed parameters. Trigger definitions
-- (trg_deals_mark_lead_pipeline_dirty, trg_quotes_mark_lead_pipeline_dirty,
-- trg_proposals_mark_lead_pipeline_dirty,
-- trg_client_contracts_mark_lead_pipeline_dirty,
-- trg_entity_interactions_mark_lead_pipeline_dirty) are untouched — they
-- already point at public.fn_mark_lead_pipeline_dirty() by name and pick up
-- this CREATE OR REPLACE automatically.

CREATE OR REPLACE FUNCTION public.fn_mark_lead_pipeline_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_lead record;
  v_new_stage_id uuid;
  v_new_stage record;
  v_lost_interaction_id uuid;
BEGIN
  -- Guarda anti-recursão defensiva (ver nota (b) em 20261111100000): esta
  -- função escreve em anew_leads e, desde esta migração, também insere em
  -- entity_interactions (ver nota acima) — o que agora ativa esta guarda na
  -- prática para essa reentrada, além de continuar como salvaguarda para
  -- qualquer outra cadeia de triggers futura.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_entity_id := COALESCE(NEW.entity_id, OLD.entity_id);
  IF v_entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_lead IN
    SELECT id, status, workflow_stage_id, lost_reason, organization_id, root_organization_id
    FROM public.anew_leads
    WHERE entity_id = v_entity_id AND deleted_at IS NULL
  LOOP
    v_new_stage_id := public.compute_lead_stage_v2(v_lead.id);

    IF v_new_stage_id IS NOT NULL AND v_new_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
      SELECT * INTO v_new_stage FROM public.lead_workflow_stages WHERE id = v_new_stage_id;

      IF v_new_stage.auto_advance THEN
        IF v_new_stage.is_rejection OR v_new_stage.counts_as_lost THEN
          UPDATE public.anew_leads
          SET status = COALESCE(v_new_stage.default_status, v_new_stage.name),
              workflow_stage_id = v_new_stage.id,
              pipeline_dirty_at = NULL,
              lost_reason = COALESCE(v_lead.lost_reason, 'Motivo automático — regra do motor: ' || v_new_stage.label)
          WHERE id = v_lead.id;

          INSERT INTO public.entity_interactions
            (entity_id, organization_id, root_organization_id, interaction_type,
             notes, created_by, interaction_at)
          VALUES
            (v_entity_id, v_lead.organization_id, v_lead.root_organization_id, 'note',
             'Lead perdida automaticamente pelo motor — Estágio: ' || v_new_stage.label, NULL, now())
          RETURNING id INTO v_lost_interaction_id;

          PERFORM public.fn_manual_audit_log(
            'entity_interactions',
            v_entity_id,
            v_lead.organization_id,
            'INSERT',
            jsonb_build_object('entity_interactions', jsonb_build_object(
              'id',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_lost_interaction_id)),
              'interaction_type', jsonb_build_object('old', NULL, 'new', to_jsonb('note'::text)),
              'notes',            jsonb_build_object('old', NULL, 'new', to_jsonb('Lead perdida automaticamente pelo motor — Estágio: ' || v_new_stage.label))
            )),
            'web_app'
          );
        ELSE
          UPDATE public.anew_leads
          SET status = COALESCE(v_new_stage.default_status, v_new_stage.name),
              workflow_stage_id = v_new_stage.id,
              pipeline_dirty_at = NULL
          WHERE id = v_lead.id;
        END IF;
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.anew_leads
    SET pipeline_dirty_at = now()
    WHERE id = v_lead.id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Non-rejection auto_advance path (e.g. a rule advancing to "qualified"
--    or "negotiation"): confirm status/workflow_stage_id still update and
--    lost_reason/entity_interactions are NOT touched — byte-for-byte same
--    UPDATE as the pre-existing live function.
-- 2. Rejection/lost auto_advance path with a lead that has lost_reason
--    IS NULL: confirm lost_reason gets set to the automatic label AND a
--    matching entity_interactions row + entity_audit_log row appear.
-- 3. Rejection/lost auto_advance path with a lead that ALREADY has a
--    lost_reason (manually set): confirm lost_reason is preserved
--    unchanged (COALESCE guard), while the entity_interactions row/audit
--    log row are still recorded (this trigger fires regardless, matching
--    the "estágio atingido" event, not the reason capture itself).
-- 4. Non-auto_advance path: confirm only pipeline_dirty_at changes, exactly
--    as before.
-- 5. pg_trigger_depth() > 1 guard: confirm the entity_interactions INSERT
--    added in step 2 does NOT cause infinite recursion or a second
--    lost_reason/timeline write — the nested invocation must return at the
--    top via the existing guard.
