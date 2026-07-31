-- Reopen an ACCEPTED proposal for signature when it is edited/republished to
-- the client portal AFTER acceptance, but only if its actual business
-- content changed since acceptance, and only if no already-signed contract
-- blocks it (a signed contract is legally final and must never be silently
-- invalidated).
--
-- This codebase has no pre-existing snapshot/hash infrastructure for
-- proposals (confirmed live: `accepted_content_hash` does not exist yet on
-- `proposals`, no `republish_proposal_snapshot` RPC exists) — this migration
-- builds the equivalent fresh, adapted to the real schema here.
--
-- Quote resolution mirrors src/utils/generateProposalPdfBlob.ts's
-- generateFromQuotePdfs: prefer quotes.proposal_id direct matches, and only
-- if that returns nothing, fall back to pipeline_links (status = 'active',
-- quote_id IS NOT NULL).
--
-- "Sent" stage lookup mirrors the org-stages-else-template fallback used by
-- lead_workflow_stages / compute_lead_stage_v2 / get_lead_resolved_stage:
-- prefer the proposal's own organization_id's active stages if it has any,
-- otherwise the shared organization_id IS NULL template stages. Confirmed
-- live: org Nike (b6ffce4f-f630-4933-833a-008649757a33) has zero org-specific
-- proposal_workflow_stages rows, so it falls back to the template row
-- 8fb8c2df-a917-4060-9b6c-8e3955f8b2be (name='sent', label='Enviada').

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS accepted_content_hash text;

COMMENT ON COLUMN public.proposals.accepted_content_hash IS
  'md5 hash of the proposal''s linked quotes'' business content (lines + fees + '
  'discount) as computed by compute_proposal_content_hash(), captured at the '
  'moment the proposal was last accepted. Compared against the live hash by '
  'reopen_accepted_proposal_if_changed() to decide whether an accepted '
  'proposal must be reopened for signature after edits. NULL until the '
  'proposal has been accepted at least once. Set by the acceptance caller, '
  'never by this migration.';

-- ============================================================
-- compute_proposal_content_hash
-- ============================================================
-- Deterministic, order-independent hash over a proposal's linked quotes'
-- meaningful business fields. Deliberately excludes ids, timestamps, and
-- anything else that can change without the business content changing —
-- row ordering for determinism is done via ORDER BY id, but no id value is
-- ever embedded in the hashed text itself.

CREATE OR REPLACE FUNCTION public.compute_proposal_content_hash(p_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote_ids uuid[];
  v_content text;
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO v_quote_ids
  FROM public.quotes
  WHERE proposal_id = p_proposal_id;

  -- Fallback: some quotes only link via pipeline_links, not quotes.proposal_id
  -- (same dual-lookup pattern as generateFromQuotePdfs).
  IF v_quote_ids IS NULL OR array_length(v_quote_ids, 1) IS NULL THEN
    SELECT array_agg(DISTINCT pl.quote_id ORDER BY pl.quote_id)
    INTO v_quote_ids
    FROM public.pipeline_links pl
    WHERE pl.proposal_id = p_proposal_id
      AND pl.status = 'active'
      AND pl.quote_id IS NOT NULL;
  END IF;

  IF v_quote_ids IS NULL OR array_length(v_quote_ids, 1) IS NULL THEN
    RETURN md5('');
  END IF;

  SELECT string_agg(
    format(
      'desc:%s|lines:%s|fees:%s',
      COALESCE(q.desconto_global_percent, 0),
      COALESCE((
        SELECT string_agg(
          format(
            '%s:%s:%s:%s:%s:%s:%s:%s',
            ql.qt,
            ql.custo_material_unit,
            ql.custo_mao_obra_unit,
            ql.margem_percent,
            ql.iva_percent,
            ql.discount_percent,
            ql.total_sem_iva,
            ql.total_com_iva
          ),
          ';' ORDER BY ql.id
        )
        FROM public.quote_lines ql
        WHERE ql.quote_id = q.id
      ), ''),
      COALESCE((
        SELECT string_agg(
          format(
            '%s:%s:%s:%s',
            COALESCE(sft.name, ''),
            qf.calculated_value,
            qf.vat_rate,
            qf.vat_amount
          ),
          ';' ORDER BY qf.id
        )
        FROM public.quote_fees qf
        LEFT JOIN public.service_fee_types sft ON sft.id = qf.fee_type_id
        WHERE qf.quote_id = q.id
      ), '')
    ),
    '||' ORDER BY q.id
  )
  INTO v_content
  FROM public.quotes q
  WHERE q.id = ANY(v_quote_ids);

  RETURN md5(COALESCE(v_content, ''));
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_proposal_content_hash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_proposal_content_hash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_proposal_content_hash(uuid) TO service_role;

-- ============================================================
-- reopen_accepted_proposal_if_changed
-- ============================================================
-- Org-visibility check follows the same public.get_user_visible_org_ids
-- (auth.uid()) pattern as get_lead_resolved_stage (20261111180000) — RAISE
-- EXCEPTION if not authorized rather than silently no-op, since this is
-- callable directly by an authenticated user with an arbitrary proposal id.

CREATE OR REPLACE FUNCTION public.reopen_accepted_proposal_if_changed(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_status text;
  v_accepted_hash text;
  v_current_hash text;
  v_authorized boolean;
  v_contract_id uuid;
  v_contract_status text;
  v_actor uuid := public.resolve_business_user_id(auth.uid());
  v_has_org_stages boolean;
  v_sent_stage_id uuid;
BEGIN
  SELECT organization_id, status, accepted_content_hash, client_contract_id
  INTO v_org, v_status, v_accepted_hash, v_contract_id
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

  IF v_status <> 'accepted' THEN
    RETURN jsonb_build_object('reopened', false, 'blocked', false, 'reason', 'not_accepted');
  END IF;

  v_current_hash := public.compute_proposal_content_hash(p_proposal_id);

  IF v_current_hash IS NOT DISTINCT FROM v_accepted_hash THEN
    RETURN jsonb_build_object('reopened', false, 'blocked', false, 'reason', 'unchanged');
  END IF;

  IF v_contract_id IS NOT NULL THEN
    SELECT status INTO v_contract_status
    FROM public.client_contracts
    WHERE id = v_contract_id;

    IF v_contract_status IN ('signed', 'active') THEN
      RETURN jsonb_build_object(
        'reopened', false,
        'blocked', true,
        'reason', 'proposal_has_signed_contract'
      );
    ELSIF v_contract_status IN ('draft', 'pending_signature') THEN
      UPDATE public.client_contracts
      SET deleted_at = now(), deleted_by = v_actor
      WHERE id = v_contract_id;

      UPDATE public.proposals
      SET client_contract_id = NULL
      WHERE id = p_proposal_id;
    END IF;
  END IF;

  -- Same org-stages-else-template fallback as get_lead_resolved_stage /
  -- compute_lead_stage_v2, applied to proposal_workflow_stages: prefer the
  -- proposal's own org's active stages if it has any, else the shared
  -- organization_id IS NULL template stages.
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
      acceptance_ip = NULL,
      acceptance_user_agent = NULL,
      signature_image = NULL
  WHERE id = p_proposal_id;

  -- Defensive reset: create-client-portal-access/index.ts already sets
  -- portal_status = 'sent' unconditionally on every republish call, but do
  -- it here too so this function stays correct on its own / atomically.
  UPDATE public.client_portal_users
  SET portal_status = 'sent'
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object('reopened', true, 'blocked', false, 'reason', null);
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_accepted_proposal_if_changed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_accepted_proposal_if_changed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_accepted_proposal_if_changed(uuid) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- Live-verified during authoring against org Nike
-- (b6ffce4f-f630-4933-833a-008649757a33), proposal
-- 3923057f-a804-49d4-9e05-99e7800c3295 (quote 166c73a9-dc43-4a47-9e3c-38f70092c17a,
-- line 66033c84-152f-42e5-81c1-a6ef1dff2bed, contract d835df02-b149-4de7-a0db-8a20e1e315d1):
-- 1. status='accepted', accepted_content_hash = live compute_proposal_content_hash()
--    output -> reopen_accepted_proposal_if_changed() returns
--    {reopened:false, blocked:false, reason:'unchanged'}, no row changes.
-- 2. Mutate quote_lines.qt (or a price field) for a linked quote -> call again
--    -> {reopened:true, blocked:false, reason:null}; proposals.status='sent',
--    stage_id = the real 'sent' stage id, accepted_at/acceptance_ip/
--    acceptance_user_agent/signature_image all NULL; the linked draft
--    contract is soft-deleted (deleted_at set) and proposals.client_contract_id
--    cleared.
-- 3. Re-accept, set a stale accepted_content_hash, link a contract with
--    status='signed' -> call again -> {reopened:false, blocked:true,
--    reason:'proposal_has_signed_contract'}, nothing changes.
