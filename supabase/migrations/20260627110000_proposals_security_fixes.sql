-- =============================================================================
-- Migration: 20260627110000_proposals_security_fixes.sql
-- Purpose  : Resolve security issues in the Proposals module.
--
-- ALREADY FIXED — do not duplicate:
--   • proposals UPDATE policy WITH CHECK
--       Done in 20260626110000_rls_performance_and_proposals_check.sql
--   • entity_audit_log SELECT policy (quotes.manage gate)
--       Done in 20260627050000_quotes_security_fixes.sql
--
-- FIX 1 — entity_audit_log SELECT policy: widen permission gate for proposals
--   Problem : 20260627050000 replaced the open org-member policy with a guard
--             for 'quotes.manage'. A user who only holds 'proposals.manage'
--             (but not 'quotes.manage') cannot read audit rows for their own
--             proposals, breaking the proposals audit-history UI.
--   Fix     : Recreate the policy accepting EITHER 'quotes.manage' OR
--             'proposals.manage'. Admin/manager roles already hold both via
--             has_anew_permission, so no regression for privileged users.
--             Users with neither permission continue to have no direct access.
--
-- FIX 2 — archive_proposal() callable by anon
--   Problem : Baseline line 28137 grants EXECUTE on archive_proposal(_proposal_id)
--             explicitly to anon. The function is SECURITY DEFINER and runs as
--             the owner, so an unauthenticated HTTP request can permanently
--             destroy any proposal row regardless of the caller's identity.
--   Fix     : (a) REVOKE EXECUTE from anon and PUBLIC.
--             (b) Add an authorization guard at the top of the function body so
--                 that even if anon somehow regains EXECUTE in the future the
--                 call aborts before touching any data.
--             The function body is otherwise identical to the baseline
--             (lines 547–591).
--
-- FIX 3 — duplicate_proposal() callable by anon
--   Problem : Baseline line 28372 grants EXECUTE on duplicate_proposal() to
--             anon. SECURITY DEFINER — anon could create unlimited proposal
--             rows under any org (INSERT bypasses RLS inside SECURITY DEFINER).
--   Fix     : (a) REVOKE EXECUTE from anon and PUBLIC.
--             (b) Add auth.uid() IS NULL guard in function body.
--             Function body preserved exactly (baseline lines 2025–2088).
--
-- FIX 4 — GRANT ALL to anon on all proposal child tables
--   Problem : proposal_items, proposal_manual_items, proposal_quote_selections,
--             proposal_rejection_reasons, proposal_sends, proposal_stage_actions,
--             proposal_stage_transitions, proposal_templates,
--             proposal_verification_codes, proposal_workflow_stages, proposals
--             all carry GRANT ALL TO anon (baseline lines 30775–30867).
--             RLS currently protects reads; however DML grants are an
--             unnecessary attack surface: any future RLS misconfiguration
--             removes the only remaining barrier.
--             proposal_sends carries ip_address and recipient_email (PII) —
--             the SELECT grant to anon on this table is particularly sensitive.
--             proposal_verification_codes carries one-time SMS/email codes.
--   Fix     : REVOKE INSERT, UPDATE, DELETE from anon on all tables above.
--             SELECT is retained on proposal_items (anon_proposal_items_read
--             policy, baseline line 23824, serves the public proposal link
--             flow) and on proposal_rejection_reasons (anon_select_proposal_
--             rejection_reasons policy, baseline line 23852).
--             SELECT is revoked from anon on proposal_sends,
--             proposal_verification_codes (PII / security codes — no
--             legitimate anon read path exists via any policy).
--
-- FIX 5 — proposals_archive RLS
--   Problem : proposals_archive is the write target of archive_proposal().
--             If the table exists without RLS enabled an authenticated user
--             who gains direct table access (e.g. via a future misconfigured
--             grant) can read all archived proposals across all orgs.
--   Fix     : Enable RLS on proposals_archive (IF EXISTS guard so the
--             migration is safe even if the table is defined in a later
--             migration). Add a SELECT policy scoped to visible orgs.
--             INSERT is intentionally left to service_role / SECURITY DEFINER
--             paths only; no authenticated INSERT policy is added.
--
-- FIX 6 — SECURITY DEFINER trigger functions granted to anon
--   Problem : generate_proposal_token(), set_proposal_accepted_at(),
--             set_proposal_assigned_to(), sync_proposal_value_from_quote()
--             are trigger functions (RETURNS trigger) granted to anon
--             (baseline lines 28525, 29155, 29164, 29218).
--             resolve_proposal_commercial() is a SECURITY DEFINER helper
--             also granted to anon (baseline line 29038).
--             search_proposal_entities() (both overloads) are SECURITY DEFINER
--             and granted to anon (baseline lines 29110, 29119). The functions
--             already guard with `IF auth.uid() IS NULL THEN RETURN`, but the
--             grant is an unnecessary attack surface.
--   Fix     : REVOKE EXECUTE from anon on all six function signatures.
--             Authenticated and service_role retain EXECUTE.
--
-- Affected tables / functions:
--   public.entity_audit_log          (RLS policy)
--   public.archive_proposal(uuid)    (GRANT + function body)
--   public.duplicate_proposal(uuid, text)  (GRANT + function body)
--   public.proposal_items            (GRANT)
--   public.proposal_manual_items     (GRANT)
--   public.proposal_quote_selections (GRANT)
--   public.proposal_rejection_reasons (GRANT)
--   public.proposal_sends            (GRANT)
--   public.proposal_stage_actions    (GRANT)
--   public.proposal_stage_transitions (GRANT)
--   public.proposal_templates        (GRANT)
--   public.proposal_verification_codes (GRANT)
--   public.proposal_workflow_stages  (GRANT)
--   public.proposals                 (GRANT)
--   public.proposals_archive         (RLS enable + SELECT policy)
--   public.generate_proposal_token() (GRANT)
--   public.set_proposal_accepted_at() (GRANT)
--   public.set_proposal_assigned_to() (GRANT)
--   public.sync_proposal_value_from_quote() (GRANT)
--   public.resolve_proposal_commercial(uuid,uuid,uuid,uuid) (GRANT)
--   public.search_proposal_entities(text,integer) (GRANT)
--   public.search_proposal_entities(text,integer,uuid) (GRANT)
--
-- Safe     : Forward-only. All DROPs use IF EXISTS. Function bodies use
--            OR REPLACE. No schema changes. No data changes.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- FIX 1: entity_audit_log SELECT policy — widen to proposals.manage
-- ---------------------------------------------------------------------------
-- 20260627050000 set the gate to 'quotes.manage' only.
-- A proposals user (proposals.manage) cannot read audit rows for proposals.
-- Widen to accept either permission. The RESTRICTIVE deny policies for
-- UPDATE and DELETE are not touched.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;

CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
    AND (
      public.has_anew_permission((SELECT auth.uid()), 'quotes.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'proposals.manage')
    )
  );


-- ---------------------------------------------------------------------------
-- FIX 2a: Revoke EXECUTE on archive_proposal from anon / PUBLIC
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.archive_proposal(uuid) FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- FIX 2b: Recreate archive_proposal with an authorization guard
-- ---------------------------------------------------------------------------
-- Body preserved exactly from baseline lines 547–591 except for the
-- authorization guard block added after the DECLARE section.
-- The guard aborts before any DML if:
--   (a) auth.uid() is NULL (unauthenticated / anon caller), or
--   (b) the caller lacks the 'proposals.manage' permission.
-- RAISE EXCEPTION is used instead of RETURN false so the transaction is
-- aborted and the caller cannot silently discard the failure.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_proposal("_proposal_id" uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_business_user_id uuid;
BEGIN
  -- ── Authorization guard ──────────────────────────────────────────────────
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'archive_proposal: unauthenticated call rejected'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission((SELECT auth.uid()), 'proposals.manage') THEN
    RAISE EXCEPTION 'archive_proposal: caller lacks proposals.manage permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- ────────────────────────────────────────────────────────────────────────

  v_business_user_id := public.current_business_user_id();
  IF v_business_user_id IS NULL THEN
    RAISE EXCEPTION 'Business user not found for current auth user';
  END IF;

  INSERT INTO public.proposals_archive (
    id, deal_id, title, description, value, status, valid_until,
    document_url, notes, created_by, created_at, updated_at,
    company_id, client_id, currency, sent_at, viewed_at,
    accepted_at, rejected_at, acceptance_ip, acceptance_user_agent,
    client_contract_id, stage_id, request_date, delivered_at,
    delivery_time_hours, probability, template_id, public_token,
    public_link_enabled, rejection_reason, rejection_reason_code,
    rejection_notes, tracking_token, last_viewed_at, view_count,
    organization_id, entity_id, root_organization_id,
    proposal_number, rejection_reason_id, is_deleted, deleted_at, deleted_by,
    archived_at, archived_by
  )
  SELECT
    id, deal_id, title, description, value, status, valid_until,
    document_url, notes, created_by, created_at, updated_at,
    company_id, client_id, currency, sent_at, viewed_at,
    accepted_at, rejected_at, acceptance_ip, acceptance_user_agent,
    client_contract_id, stage_id, request_date, delivered_at,
    delivery_time_hours, probability, template_id, public_token,
    public_link_enabled, rejection_reason, rejection_reason_code,
    rejection_notes, tracking_token, last_viewed_at, view_count,
    organization_id, entity_id, root_organization_id,
    proposal_number, rejection_reason_id, is_deleted, deleted_at, deleted_by,
    now(), v_business_user_id
  FROM public.proposals
  WHERE id = _proposal_id;

  DELETE FROM public.proposals WHERE id = _proposal_id;

  RETURN true;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE;
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Explicit grants — authenticated and service_role only; anon excluded.
REVOKE ALL ON FUNCTION public.archive_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_proposal(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- FIX 3a: Revoke EXECUTE on duplicate_proposal from anon / PUBLIC
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.duplicate_proposal(uuid, text) FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- FIX 3b: Recreate duplicate_proposal with an authorization guard
-- ---------------------------------------------------------------------------
-- Body preserved exactly from baseline lines 2025–2088 except for the
-- authorization guard block added before the business user lookup.
-- The guard uses 'proposals.create' — the same permission checked by the
-- proposals INSERT RLS policy — so that the function and the policy stay
-- in sync. A user without proposals.create cannot create a duplicate anyway.
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
  WHERE (company_id = source_proposal.organization_id OR company_id IS NULL)
    AND is_active = true
  ORDER BY company_id NULLS LAST, stage_order
  LIMIT 1;

  INSERT INTO public.proposals (
    deal_id, title, description, value, status, valid_until,
    document_url, notes, created_by, company_id, client_id,
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
    source_proposal.company_id,
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


-- ---------------------------------------------------------------------------
-- FIX 4: Revoke excessive DML grants on proposal tables from anon
-- ---------------------------------------------------------------------------
-- Baseline grants GRANT ALL TO anon on every proposal-family table.
-- Strategy per table:
--   proposal_items              — keep SELECT (anon_proposal_items_read policy
--                                 serves public proposal link flow); revoke DML
--   proposal_rejection_reasons  — keep SELECT (anon_select_proposal_rejection_
--                                 reasons policy); revoke DML
--   proposal_sends              — revoke DML AND SELECT (contains PII:
--                                 ip_address, recipient_email, opened_at;
--                                 no legitimate anon read path)
--   proposal_verification_codes — revoke DML AND SELECT (OTP security codes;
--                                 no legitimate anon read path)
--   all others                  — revoke DML; SELECT retained for safety
--                                 (no anon policies cover these tables but
--                                 RLS blocks rows anyway; revoking SELECT
--                                 would break the public token read flow on
--                                 proposal_workflow_stages / proposal_templates
--                                 which the app may read server-side as anon)
-- ---------------------------------------------------------------------------

-- proposal_items: public link flow needs SELECT; revoke DML only
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_items FROM anon;

-- proposal_manual_items: no anon read policy; revoke DML
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_manual_items FROM anon;

-- proposal_quote_selections: no anon read policy; revoke DML
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_quote_selections FROM anon;

-- proposal_rejection_reasons: anon SELECT policy exists; revoke DML only
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_rejection_reasons FROM anon;

-- proposal_sends: PII (ip_address, recipient_email) — revoke DML and SELECT
REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLE public.proposal_sends FROM anon;

-- proposal_stage_actions: no anon read policy; revoke DML
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_stage_actions FROM anon;

-- proposal_stage_transitions: no anon read policy; revoke DML
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_stage_transitions FROM anon;

-- proposal_templates: no anon read policy; revoke DML
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_templates FROM anon;

-- proposal_verification_codes: OTP codes — revoke DML and SELECT
REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLE public.proposal_verification_codes FROM anon;

-- proposal_workflow_stages: no anon DML needed
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_workflow_stages FROM anon;

-- proposals (parent): anon SELECT policy "Public can view proposals by token"
-- already exists and is intentional; revoke DML only
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposals FROM anon;


-- ---------------------------------------------------------------------------
-- FIX 5: proposals_archive — enable RLS and add org-scoped SELECT policy
-- ---------------------------------------------------------------------------
-- proposals_archive receives rows via archive_proposal() (SECURITY DEFINER).
-- Without RLS, any session that somehow gains SELECT on the table can read
-- all archived proposals across all organisations.
-- The DO block is used so the migration succeeds even if the table was not
-- yet created (it could be defined in a future migration or a separate schema
-- management step).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'proposals_archive'
  ) THEN
    -- Enable RLS (idempotent — safe to run if already enabled)
    ALTER TABLE public.proposals_archive ENABLE ROW LEVEL SECURITY;

    -- Drop existing policy if present so this migration is re-runnable
    DROP POLICY IF EXISTS proposals_archive_select ON public.proposals_archive;

    -- Org-scoped SELECT: only users whose visible orgs include the archived row
    -- and who hold proposals.manage (same gate as audit log for proposals)
    CREATE POLICY proposals_archive_select
      ON public.proposals_archive
      FOR SELECT
      TO authenticated
      USING (
        organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
        AND public.has_anew_permission((SELECT auth.uid()), 'proposals.manage')
      );

    -- Deny direct UPDATE / DELETE — archive is append-only
    DROP POLICY IF EXISTS proposals_archive_no_update ON public.proposals_archive;
    CREATE POLICY proposals_archive_no_update
      ON public.proposals_archive
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (false)
      WITH CHECK (false);

    DROP POLICY IF EXISTS proposals_archive_no_delete ON public.proposals_archive;
    CREATE POLICY proposals_archive_no_delete
      ON public.proposals_archive
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (false);

  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- FIX 6: Revoke EXECUTE on SECURITY DEFINER proposal helper functions from anon
-- ---------------------------------------------------------------------------
-- Trigger functions (RETURNS trigger) cannot be called directly, but having
-- EXECUTE for anon on them is unnecessary and adds noise to permission audits.
-- resolve_proposal_commercial and search_proposal_entities are callable RPCs
-- with internal auth.uid() guards — but the grants are still unnecessary.
-- ---------------------------------------------------------------------------

-- Trigger function: fires on proposals BEFORE INSERT; not directly callable
-- but the grant is unnecessarily permissive.
REVOKE EXECUTE ON FUNCTION public.generate_proposal_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_proposal_token() TO authenticated, service_role;

-- Trigger function: fires on proposals BEFORE INSERT/UPDATE; same reasoning.
REVOKE EXECUTE ON FUNCTION public.set_proposal_accepted_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_proposal_accepted_at() TO authenticated, service_role;

-- Trigger function: fires on proposals BEFORE INSERT; same reasoning.
REVOKE EXECUTE ON FUNCTION public.set_proposal_assigned_to() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_proposal_assigned_to() TO authenticated, service_role;

-- Trigger function: fires on quotes AFTER INSERT/UPDATE; same reasoning.
REVOKE EXECUTE ON FUNCTION public.sync_proposal_value_from_quote() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_proposal_value_from_quote() TO authenticated, service_role;

-- SECURITY DEFINER helper: internal auth guard present but anon grant unneeded.
REVOKE EXECUTE ON FUNCTION public.resolve_proposal_commercial(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_commercial(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- SECURITY DEFINER search RPC (both overloads): internal auth.uid() IS NULL
-- guard already returns empty; but grant to anon is still unnecessary.
REVOKE EXECUTE ON FUNCTION public.search_proposal_entities(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_proposal_entities(text, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.search_proposal_entities(text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_proposal_entities(text, integer, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- 1. The (SELECT auth.uid()) pattern is used throughout to evaluate the JWT
--    claim once per query, not once per row — consistent with the performance
--    pattern established in 20260626110000.
--
-- 2. archive_proposal is SECURITY DEFINER. The authorization guard runs as
--    the caller (auth.uid() is a JWT claim at connection time) before any DML
--    runs as the function owner. This is the same pattern used in
--    20260627050000 for archive_quote.
--
-- 3. The entity_audit_log SELECT policy now accepts 'quotes.manage' OR
--    'proposals.manage'. If a dedicated 'audit.view' permission is introduced
--    in a future migration this policy should be updated to use it exclusively.
--
-- 4. REVOKE on table-level DML grants does not affect RLS policies or the
--    existing authenticated / service_role grants on the same tables. The
--    anon role can still SELECT from proposal_items (public link flow) and
--    proposal_rejection_reasons (rejection reason picker) through their
--    respective RLS policies — the SELECT grant on those tables is retained.
--
-- 5. proposals_archive RLS is applied inside a DO block so that this
--    migration is safe to apply even before the archive table is physically
--    created. If proposals_archive is later confirmed to exist, run:
--      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
--    to verify the RLS policy evaluates correctly in a live session.
--
-- 6. Trigger functions (generate_proposal_token, set_proposal_accepted_at,
--    set_proposal_assigned_to, sync_proposal_value_from_quote) cannot be
--    called directly by client code regardless of EXECUTE grants because they
--    RETURN trigger. The REVOKE is defensive hygiene for permission audits.
-- =============================================================================
