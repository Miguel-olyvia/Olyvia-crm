-- Replace the narrow "reopen accepted proposal on content change" system
-- (20261111320000_reopen_accepted_proposal_on_content_change.sql) with a
-- richer publish/decision snapshot system ported from a sibling reference
-- implementation (github.com/ricardobelchior1984-code/olyvia,
-- 20260626144931 / 20260626145025 / 20260730134703), adapted to this repo's
-- conventions:
--   * SECURITY DEFINER + SET search_path TO 'public', 'pg_temp' on every
--     function (reference used SECURITY INVOKER for triggers) — mirrors
--     fn_generic_entity_audit (20260625010000) / fn_mark_lead_pipeline_dirty.
--   * Org-visibility check (get_user_visible_org_ids(auth.uid())) on the one
--     RPC that is called directly with an arbitrary proposal id from a
--     caller-JWT-scoped edge function (republish_proposal_snapshot, invoked
--     from create-client-portal-access via callerClient, exactly like
--     reopen_accepted_proposal_if_changed was) — mirrors get_lead_resolved_stage
--     (20261111180000) and the old reopen_accepted_proposal_if_changed
--     (20261111320000).
--   * record_proposal_decision is called from client-portal-action using its
--     service_role client (confirmed live in
--     supabase/functions/client-portal-action/index.ts — that function has no
--     end-user JWT/auth.uid() context; the portal user's identity is verified
--     upstream via portal session + verification codes, not Supabase Auth
--     org membership). Adding an auth.uid()-based org check here would make
--     it permanently unusable by its only real caller, so it intentionally
--     has no org check, same trust boundary as an internal/system function —
--     it is still REVOKE ALL FROM PUBLIC, anon / GRANT TO authenticated,
--     service_role for defense in depth.
--   * compute_proposal_business_hash has no org check either, matching the
--     old compute_proposal_content_hash convention: it is an internal helper
--     invoked by triggers (running under table-owner/service_role context
--     with no reliable auth.uid()) and by the org-checked RPCs above: the
--     check belongs on the entry points, not the shared helper.
--   * Soft-delete (deleted_at/deleted_by) instead of the reference's hard
--     DELETE when discarding a draft/pending_signature contract on reopen —
--     actor resolution mirrors the old reopen_accepted_proposal_if_changed's
--     v_actor := public.resolve_business_user_id(auth.uid()).
--   * quote_fees' real FK column to service_fee_types is `fee_type_id`
--     (confirmed live via 20260615130000_baseline_new_database.sql:11518-11528
--     and the join in the old compute_proposal_content_hash body:
--     `LEFT JOIN public.service_fee_types sft ON sft.id = qf.fee_type_id`) —
--     NOT `service_fee_type_id`.
--   * 'signed' contract status blocks reopen; this repo's own
--     client_contracts.status vocabulary (confirmed live) also uses 'active'
--     for post-signature contracts, so both 'signed' and 'active' block,
--     matching the old reopen_accepted_proposal_if_changed.
--   * "sent" stage lookup uses the same org-stages-else-template fallback as
--     the old function / get_lead_resolved_stage / compute_lead_stage_v2,
--     not the reference's simpler "organization_id IS NULL" only lookup.

-- ============================================================
-- Cleanup: drop the superseded narrower implementation
-- ============================================================
-- Nothing else in this codebase reads accepted_content_hash yet (the 2 edge
-- functions that reference reopen_accepted_proposal_if_changed are being
-- rewired to republish_proposal_snapshot in a separate follow-up task).

DROP FUNCTION IF EXISTS public.reopen_accepted_proposal_if_changed(uuid);
DROP FUNCTION IF EXISTS public.compute_proposal_content_hash(uuid);
ALTER TABLE public.proposals DROP COLUMN IF EXISTS accepted_content_hash;

-- ============================================================
-- Snapshot columns
-- ============================================================

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS published_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS has_unpublished_changes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decided_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS decided_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS decided_published_at timestamptz;

COMMENT ON COLUMN public.proposals.published_snapshot IS
  'Full business-content snapshot (proposal header + manual items + quote '
  'selections + quotes/lines/fees) captured the last time this proposal was '
  'published/republished to the client portal, via republish_proposal_snapshot().';
COMMENT ON COLUMN public.proposals.published_snapshot_hash IS
  'md5 hash of the business content used to compute this snapshot, via '
  'compute_proposal_business_hash(). Compared against a fresh hash to derive '
  'has_unpublished_changes and to decide whether a decided (accepted/rejected) '
  'proposal must be reopened for re-signature on republish.';
COMMENT ON COLUMN public.proposals.has_unpublished_changes IS
  'true when the proposal''s live business content hash differs from '
  'published_snapshot_hash. Pre-decision UI feedback only — not itself part of '
  'the reopen mechanism, which compares live hash against decided_snapshot_hash '
  'inside republish_proposal_snapshot().';
COMMENT ON COLUMN public.proposals.decided_snapshot_hash IS
  'md5 hash of the business content as it was at the moment this proposal was '
  'last accepted or rejected, via record_proposal_decision(). Compared against '
  'a fresh hash inside republish_proposal_snapshot() to decide whether an '
  'accepted/rejected proposal must be reopened for re-signature.';

-- ============================================================
-- compute_proposal_business_hash
-- ============================================================
-- Deterministic hash over the proposal's full business content (header +
-- manual items + quote selections + quotes/lines/fees). Internal helper only
-- (see header note above for why it has no org-visibility check).

CREATE OR REPLACE FUNCTION public.compute_proposal_business_hash(p_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'proposal', jsonb_build_object(
      'id', p.id, 'title', p.title, 'description', p.description, 'value', p.value,
      'valid_until', p.valid_until, 'notes', p.notes, 'currency', p.currency,
      'client_id', p.client_id, 'entity_id', p.entity_id, 'deal_id', p.deal_id,
      'template_id', p.template_id
    ),
    'manual_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', mi.id, 'description', mi.description, 'quantity', mi.quantity,
        'unit_price', mi.unit_price, 'total', mi.total, 'sort_order', mi.sort_order,
        'notes', mi.notes
      ) ORDER BY mi.sort_order, mi.id)
      FROM public.proposal_manual_items mi WHERE mi.proposal_id = p.id
    ), '[]'::jsonb),
    'quote_selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('quote_id', qs.quote_id, 'selected', qs.selected) ORDER BY qs.quote_id)
      FROM public.proposal_quote_selections qs WHERE qs.proposal_id = p.id
    ), '[]'::jsonb),
    'quotes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'quote_number', q.quote_number, 'title', q.title, 'subtotal', q.subtotal,
        'total', q.total, 'total_fees', q.total_fees, 'iva_rate', q.iva_rate,
        'desconto_global_percent', q.desconto_global_percent, 'client_notes', q.client_notes,
        'conditions', q.conditions,
        'lines', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', ql.id, 'descricao_snapshot', ql.descricao_snapshot, 'item_description', ql.item_description,
            'qt', ql.qt, 'unidade', ql.unidade, 'total_sem_iva', ql.total_sem_iva,
            'total_com_iva', ql.total_com_iva, 'total_com_desconto', ql.total_com_desconto,
            'iva_percent', ql.iva_percent, 'discount_percent', ql.discount_percent,
            'selected_attributes', ql.selected_attributes, 'section_name', ql.section_name, 'ordem', ql.ordem
          ) ORDER BY ql.ordem NULLS LAST, ql.id)
          FROM public.quote_lines ql WHERE ql.quote_id = q.id
        ), '[]'::jsonb),
        'fees', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', qf.id, 'fee_type_id', qf.fee_type_id, 'base_amount', qf.base_amount,
            'calculated_value', qf.calculated_value, 'vat_rate', qf.vat_rate, 'vat_amount', qf.vat_amount
          ) ORDER BY qf.id)
          FROM public.quote_fees qf WHERE qf.quote_id = q.id
        ), '[]'::jsonb)
      ) ORDER BY q.id)
      FROM public.quotes q WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_payload
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN md5(v_payload::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_proposal_business_hash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_proposal_business_hash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_proposal_business_hash(uuid) TO service_role;

-- ============================================================
-- Dirty-tracking triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.proposal_mark_dirty_from_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_proposal_ids uuid[];
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME IN ('proposal_manual_items', 'proposal_quote_selections') THEN
    v_proposal_ids := ARRAY[COALESCE(NEW.proposal_id, OLD.proposal_id)];
  ELSIF TG_TABLE_NAME = 'quotes' THEN
    v_proposal_ids := ARRAY[COALESCE(NEW.proposal_id, OLD.proposal_id)];
  ELSIF TG_TABLE_NAME IN ('quote_lines', 'quote_fees') THEN
    SELECT array_agg(DISTINCT q.proposal_id)
    INTO v_proposal_ids
    FROM public.quotes q
    WHERE q.id = COALESCE(NEW.quote_id, OLD.quote_id);
  END IF;

  IF v_proposal_ids IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.proposals
  SET has_unpublished_changes = (public.compute_proposal_business_hash(id) IS DISTINCT FROM published_snapshot_hash)
  WHERE id = ANY(v_proposal_ids)
    AND id IS NOT NULL
    AND status NOT IN ('accepted', 'rejected');

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.proposal_mark_dirty_from_child() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_mark_dirty_from_child() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_mark_dirty_from_child() TO service_role;

CREATE OR REPLACE FUNCTION public.proposal_mark_dirty_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('accepted', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- This update IS the publish action itself (republish_proposal_snapshot
  -- already computed a fresh, trustworthy hash) — don't recompute.
  IF NEW.published_snapshot_hash IS DISTINCT FROM OLD.published_snapshot_hash THEN
    RETURN NEW;
  END IF;

  NEW.has_unpublished_changes := (public.compute_proposal_business_hash(NEW.id) IS DISTINCT FROM NEW.published_snapshot_hash);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.proposal_mark_dirty_before_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_mark_dirty_before_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_mark_dirty_before_update() TO service_role;

DROP TRIGGER IF EXISTS trg_proposals_mark_dirty ON public.proposals;
CREATE TRIGGER trg_proposals_mark_dirty
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_mark_dirty_before_update();

DROP TRIGGER IF EXISTS trg_proposal_manual_items_mark_dirty ON public.proposal_manual_items;
CREATE TRIGGER trg_proposal_manual_items_mark_dirty
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_manual_items
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_mark_dirty_from_child();

DROP TRIGGER IF EXISTS trg_proposal_quote_selections_mark_dirty ON public.proposal_quote_selections;
CREATE TRIGGER trg_proposal_quote_selections_mark_dirty
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_quote_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_mark_dirty_from_child();

DROP TRIGGER IF EXISTS trg_quotes_mark_dirty ON public.quotes;
CREATE TRIGGER trg_quotes_mark_dirty
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_mark_dirty_from_child();

DROP TRIGGER IF EXISTS trg_quote_lines_mark_dirty ON public.quote_lines;
CREATE TRIGGER trg_quote_lines_mark_dirty
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_mark_dirty_from_child();

DROP TRIGGER IF EXISTS trg_quote_fees_mark_dirty ON public.quote_fees;
CREATE TRIGGER trg_quote_fees_mark_dirty
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_mark_dirty_from_child();

-- ============================================================
-- Backfill: existing sent/decided proposals shouldn't look dirty/reopenable
-- the moment this migration ships.
-- ============================================================

DO $backfill$
DECLARE
  v_rec record;
  v_hash text;
  v_snapshot jsonb;
  v_published_at timestamptz;
BEGIN
  FOR v_rec IN
    SELECT p.id, p.status, p.sent_at, p.updated_at
    FROM public.proposals p
    WHERE p.sent_at IS NOT NULL
      AND p.published_snapshot IS NULL
      AND p.is_deleted IS NOT TRUE
  LOOP
    v_hash := public.compute_proposal_business_hash(v_rec.id);
    v_published_at := COALESCE(v_rec.sent_at, v_rec.updated_at);

    SELECT jsonb_build_object(
      'proposal_id', p.id, 'computed_at', v_published_at, 'source', 'backfill', 'published_by', NULL,
      'business', jsonb_build_object(
        'proposal', row_to_json(p.*)::jsonb,
        'manual_items', COALESCE((SELECT jsonb_agg(row_to_json(mi.*)::jsonb ORDER BY mi.sort_order, mi.id) FROM public.proposal_manual_items mi WHERE mi.proposal_id = p.id), '[]'::jsonb),
        'quote_selections', COALESCE((SELECT jsonb_agg(row_to_json(qs.*)::jsonb ORDER BY qs.quote_id) FROM public.proposal_quote_selections qs WHERE qs.proposal_id = p.id), '[]'::jsonb),
        'quotes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'quote', row_to_json(q.*)::jsonb,
            'lines', COALESCE((SELECT jsonb_agg(row_to_json(ql.*)::jsonb ORDER BY ql.ordem NULLS LAST, ql.id) FROM public.quote_lines ql WHERE ql.quote_id = q.id), '[]'::jsonb),
            'fees', COALESCE((SELECT jsonb_agg(row_to_json(qf.*)::jsonb ORDER BY qf.id) FROM public.quote_fees qf WHERE qf.quote_id = q.id), '[]'::jsonb)
          ) ORDER BY q.id)
          FROM public.quotes q WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
        ), '[]'::jsonb)
      )
    )
    INTO v_snapshot
    FROM public.proposals p
    WHERE p.id = v_rec.id;

    UPDATE public.proposals
    SET published_snapshot = v_snapshot,
        published_snapshot_hash = v_hash,
        published_at = v_published_at,
        has_unpublished_changes = false,
        decided_snapshot = CASE WHEN v_rec.status IN ('accepted', 'rejected') THEN v_snapshot ELSE decided_snapshot END,
        decided_snapshot_hash = CASE WHEN v_rec.status IN ('accepted', 'rejected') THEN v_hash ELSE decided_snapshot_hash END,
        decided_published_at = CASE WHEN v_rec.status IN ('accepted', 'rejected') THEN v_published_at ELSE decided_published_at END
    WHERE id = v_rec.id;
  END LOOP;
END;
$backfill$;

CREATE INDEX IF NOT EXISTS idx_proposals_has_unpublished_changes
  ON public.proposals (organization_id, has_unpublished_changes)
  WHERE has_unpublished_changes = true;

-- ============================================================
-- record_proposal_decision
-- ============================================================
-- Called from client-portal-action right after a proposal's status is set to
-- 'accepted' or 'rejected'. No org-visibility check: this function is only
-- ever invoked by that edge function's service_role client, which has no
-- auth.uid()/org-membership context to check against (the portal user's
-- identity is already verified upstream via portal session + verification
-- code) — see header note above.

CREATE OR REPLACE FUNCTION public.record_proposal_decision(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hash text;
  v_snapshot jsonb;
  v_published_at timestamptz;
BEGIN
  SELECT published_snapshot, published_snapshot_hash, published_at
  INTO v_snapshot, v_hash, v_published_at
  FROM public.proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id;
  END IF;

  IF v_snapshot IS NULL THEN
    v_hash := public.compute_proposal_business_hash(p_proposal_id);
    v_published_at := now();

    SELECT jsonb_build_object(
      'proposal_id', p.id, 'computed_at', v_published_at, 'source', 'decision_fallback', 'published_by', NULL,
      'business', jsonb_build_object(
        'proposal', row_to_json(p.*)::jsonb,
        'manual_items', COALESCE((SELECT jsonb_agg(row_to_json(mi.*)::jsonb ORDER BY mi.sort_order, mi.id) FROM public.proposal_manual_items mi WHERE mi.proposal_id = p.id), '[]'::jsonb),
        'quote_selections', COALESCE((SELECT jsonb_agg(row_to_json(qs.*)::jsonb ORDER BY qs.quote_id) FROM public.proposal_quote_selections qs WHERE qs.proposal_id = p.id), '[]'::jsonb),
        'quotes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'quote', row_to_json(q.*)::jsonb,
            'lines', COALESCE((SELECT jsonb_agg(row_to_json(ql.*)::jsonb ORDER BY ql.ordem NULLS LAST, ql.id) FROM public.quote_lines ql WHERE ql.quote_id = q.id), '[]'::jsonb),
            'fees', COALESCE((SELECT jsonb_agg(row_to_json(qf.*)::jsonb ORDER BY qf.id) FROM public.quote_fees qf WHERE qf.quote_id = q.id), '[]'::jsonb)
          ) ORDER BY q.id)
          FROM public.quotes q WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
        ), '[]'::jsonb)
      )
    )
    INTO v_snapshot
    FROM public.proposals p
    WHERE p.id = p_proposal_id;
  END IF;

  UPDATE public.proposals
  SET decided_snapshot = v_snapshot,
      decided_snapshot_hash = v_hash,
      decided_published_at = v_published_at
  WHERE id = p_proposal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_proposal_decision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_proposal_decision(uuid) TO service_role;

-- ============================================================
-- republish_proposal_snapshot
-- ============================================================
-- Called directly from create-client-portal-access via callerClient (the
-- staff caller's own JWT, not service_role) with an arbitrary
-- p_proposal_id — org-visibility check is mandatory here, same pattern as
-- get_lead_resolved_stage (20261111180000) and the old
-- reopen_accepted_proposal_if_changed (20261111320000).

CREATE OR REPLACE FUNCTION public.republish_proposal_snapshot(p_proposal_id uuid, p_published_by uuid DEFAULT NULL::uuid)
RETURNS TABLE(proposal_id uuid, published_at timestamptz, published_snapshot_hash text, has_unpublished_changes boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_authorized boolean;
  v_status text;
  v_old_hash text;
  v_hash text;
  v_snapshot jsonb;
  v_now timestamptz := now();
  v_has_org_stages boolean;
  v_sent_stage_id uuid;
  v_contract_id uuid;
  v_contract_status text;
  v_actor uuid := COALESCE(p_published_by, public.resolve_business_user_id(auth.uid()));
BEGIN
  SELECT organization_id, status, decided_snapshot_hash
  INTO v_org, v_status, v_old_hash
  FROM public.proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id;
  END IF;

  SELECT v_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', v_org;
  END IF;

  v_hash := public.compute_proposal_business_hash(p_proposal_id);

  SELECT jsonb_build_object(
    'proposal_id', p.id, 'computed_at', v_now, 'source', 'republish', 'published_by', p_published_by,
    'business', jsonb_build_object(
      'proposal', row_to_json(p.*)::jsonb,
      'manual_items', COALESCE((SELECT jsonb_agg(row_to_json(mi.*)::jsonb ORDER BY mi.sort_order, mi.id) FROM public.proposal_manual_items mi WHERE mi.proposal_id = p.id), '[]'::jsonb),
      'quote_selections', COALESCE((SELECT jsonb_agg(row_to_json(qs.*)::jsonb ORDER BY qs.quote_id) FROM public.proposal_quote_selections qs WHERE qs.proposal_id = p.id), '[]'::jsonb),
      'quotes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quote', row_to_json(q.*)::jsonb,
          'lines', COALESCE((SELECT jsonb_agg(row_to_json(ql.*)::jsonb ORDER BY ql.ordem NULLS LAST, ql.id) FROM public.quote_lines ql WHERE ql.quote_id = q.id), '[]'::jsonb),
          'fees', COALESCE((SELECT jsonb_agg(row_to_json(qf.*)::jsonb ORDER BY qf.id) FROM public.quote_fees qf WHERE qf.quote_id = q.id), '[]'::jsonb)
        ) ORDER BY q.id)
        FROM public.quotes q WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
      ), '[]'::jsonb)
    )
  )
  INTO v_snapshot
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  -- Reopen decided proposals when business content changed since decision.
  IF v_status IN ('accepted', 'rejected') AND v_old_hash IS NOT NULL AND v_hash <> v_old_hash THEN
    SELECT id, status INTO v_contract_id, v_contract_status
    FROM public.client_contracts
    WHERE proposal_id = p_proposal_id AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_contract_status IN ('signed', 'active') THEN
      RAISE EXCEPTION 'proposal_has_signed_contract';
    END IF;

    IF v_contract_id IS NOT NULL THEN
      UPDATE public.client_contracts
      SET deleted_at = v_now, deleted_by = v_actor
      WHERE id = v_contract_id;

      UPDATE public.proposals
      SET client_contract_id = NULL
      WHERE id = p_proposal_id AND client_contract_id = v_contract_id;
    END IF;

    -- Same org-stages-else-template fallback as get_lead_resolved_stage /
    -- compute_lead_stage_v2 / the old reopen_accepted_proposal_if_changed.
    SELECT EXISTS(
      SELECT 1 FROM public.proposal_workflow_stages
      WHERE organization_id = v_org AND is_active = true
    ) INTO v_has_org_stages;

    SELECT id INTO v_sent_stage_id
    FROM public.proposal_workflow_stages
    WHERE name = 'sent'
      AND is_active = true
      AND (
        (v_has_org_stages AND organization_id = v_org)
        OR (NOT v_has_org_stages AND organization_id IS NULL)
      )
    LIMIT 1;

    UPDATE public.proposals
    SET status = 'sent',
        stage_id = COALESCE(v_sent_stage_id, stage_id),
        accepted_at = NULL,
        signature_image = NULL,
        acceptance_ip = NULL,
        acceptance_user_agent = NULL,
        rejected_at = NULL,
        rejection_reason = NULL,
        updated_at = v_now
    WHERE id = p_proposal_id;

    UPDATE public.client_portal_users
    SET portal_status = 'sent', updated_at = v_now
    WHERE proposal_id = p_proposal_id;
  END IF;

  UPDATE public.proposals
  SET published_snapshot = v_snapshot,
      published_snapshot_hash = v_hash,
      published_at = v_now,
      has_unpublished_changes = false,
      updated_at = v_now
  WHERE id = p_proposal_id;

  -- Content unchanged since decision: keep the decided snapshot in lockstep
  -- with the (re-)published one, so future comparisons stay consistent.
  IF v_status IN ('accepted', 'rejected') AND v_old_hash IS NOT NULL AND v_hash = v_old_hash THEN
    UPDATE public.proposals
    SET decided_snapshot = v_snapshot, decided_snapshot_hash = v_hash
    WHERE id = p_proposal_id;
  END IF;

  RETURN QUERY SELECT p_proposal_id, v_now, v_hash, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.republish_proposal_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.republish_proposal_snapshot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.republish_proposal_snapshot(uuid, uuid) TO service_role;
