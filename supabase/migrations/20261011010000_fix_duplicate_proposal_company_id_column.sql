-- ---------------------------------------------------------------------------
-- Fix: public.duplicate_proposal() referenced a non-existent "company_id"
-- column on public.proposal_workflow_stages and public.proposals. Both
-- tables only have "organization_id" (proposals also has
-- "root_organization_id" and "entity_id"); "company_id" was a
-- naming-convention regression carried over unchanged from the original
-- baseline dump (20260615130000, lines ~2025-2088) into the security-fix
-- migration (20260627110000). Calling this RPC currently raises
-- "column company_id does not exist".
--
-- This migration only fixes the two bad column references:
--   1. proposal_workflow_stages lookup: company_id -> organization_id
--   2. proposals INSERT: drop company_id (proposals has no such column);
--      organization_id / root_organization_id / entity_id were already
--      set correctly.
-- Everything else (signature, SECURITY DEFINER, auth guard, audit log
-- insert into entity_change_log which does have company_id) is preserved
-- unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.duplicate_proposal(
  "source_proposal_id" uuid,
  "new_title"          text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  new_proposal_id   uuid;
  source_proposal   public.proposals%ROWTYPE;
  default_stage_id  uuid;
  v_business_user_id uuid;
BEGIN
  -- ── Authorization guard ──────────────────────────────────────────────────
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'duplicate_proposal: unauthenticated call rejected'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission((SELECT auth.uid()), 'proposals.create') THEN
    RAISE EXCEPTION 'duplicate_proposal: caller lacks proposals.create permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- ────────────────────────────────────────────────────────────────────────

  v_business_user_id := public.current_business_user_id();
  IF v_business_user_id IS NULL THEN
    RAISE EXCEPTION 'Business user not found for current auth user';
  END IF;

  SELECT * INTO source_proposal
  FROM public.proposals
  WHERE id = source_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  SELECT id INTO default_stage_id
  FROM public.proposal_workflow_stages
  WHERE (organization_id = source_proposal.organization_id OR organization_id IS NULL)
    AND is_active = true
  ORDER BY organization_id NULLS LAST, stage_order
  LIMIT 1;

  INSERT INTO public.proposals (
    deal_id, title, description, value, status, valid_until,
    document_url, notes, created_by, client_id,
    organization_id, root_organization_id, entity_id,
    currency, stage_id, request_date
  )
  VALUES (
    source_proposal.deal_id,
    COALESCE(new_title, source_proposal.title || ' (Cópia)'),
    source_proposal.description,
    source_proposal.value,
    'draft',
    source_proposal.valid_until,
    NULL,
    source_proposal.notes,
    v_business_user_id,
    source_proposal.client_id,
    source_proposal.organization_id,
    source_proposal.root_organization_id,
    source_proposal.entity_id,
    source_proposal.currency,
    default_stage_id,
    NULL
  )
  RETURNING id INTO new_proposal_id;

  INSERT INTO public.entity_change_log (
    entity_type, entity_id, company_id, action, changed_by, metadata
  )
  VALUES (
    'proposal', new_proposal_id, source_proposal.organization_id,
    'duplicate', v_business_user_id,
    jsonb_build_object('source_id', source_proposal_id)
  );

  RETURN new_proposal_id;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Explicit grants — authenticated and service_role only; anon excluded.
REVOKE ALL ON FUNCTION public.duplicate_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_proposal(uuid, text) TO authenticated, service_role;
