-- Fix real bug found via live testing in 20261111340000: republish_proposal_snapshot
-- declares `RETURNS TABLE(proposal_id uuid, ...)`, which implicitly creates a
-- PL/pgSQL variable named proposal_id in scope for the whole function body.
-- The client_contracts lookup then references the unqualified column
-- `proposal_id` in its WHERE clause, colliding with that variable:
--   ERROR 42702: column reference "proposal_id" is ambiguous
--   ("It could refer to either a PL/pgSQL variable or a table column.")
-- Confirmed live: calling republish_proposal_snapshot on a real accepted
-- proposal with changed content (the one code path that reaches this lookup)
-- failed with exactly this error. Forward-only fix: qualify the column with
-- the table alias. Same fix applied preemptively to the client_portal_users
-- update further down, which has the same unqualified-column shape. No other
-- logic changes.

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
  SELECT p.organization_id, p.status, p.decided_snapshot_hash
  INTO v_org, v_status, v_old_hash
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

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
    SELECT cc.id, cc.status INTO v_contract_id, v_contract_status
    FROM public.client_contracts cc
    WHERE cc.proposal_id = p_proposal_id AND cc.deleted_at IS NULL
    ORDER BY cc.created_at DESC
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
    WHERE client_portal_users.proposal_id = p_proposal_id;
  END IF;

  UPDATE public.proposals
  SET published_snapshot = v_snapshot,
      published_snapshot_hash = v_hash,
      published_at = v_now,
      has_unpublished_changes = false,
      updated_at = v_now
  WHERE id = p_proposal_id;

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
