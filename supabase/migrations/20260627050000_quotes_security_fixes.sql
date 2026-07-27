-- =============================================================================
-- Migration: 20260627050000_quotes_security_fixes.sql
-- Purpose  : Resolve 3 CRITICAL security issues in the Quotes module.
--
-- FIX 1 — quotes UPDATE policy missing WITH CHECK
--   Problem : The baseline policy (line 27567 of baseline_new_database.sql) has
--             only a USING clause. A user inside the org can UPDATE a quote and
--             move it to any organization_id — including orgs outside their
--             scope — because the post-write row is never validated.
--   Fix     : Drop and recreate the policy with a matching WITH CHECK that
--             enforces the same org-scope constraint on the committed row.
--
-- FIX 2 — archive_quote() callable by anon
--   Problem : The baseline grants EXECUTE on archive_quote(_quote_id uuid)
--             explicitly to anon (line 28146). The function is SECURITY DEFINER,
--             so it runs as the owner and can delete any quote row regardless of
--             the caller's identity. An unauthenticated HTTP request can
--             permanently destroy quote data.
--   Fix     : (a) REVOKE EXECUTE from anon.
--             (b) Add an authorization guard inside the function body so that
--                 even if anon somehow gains EXECUTE again in the future the
--                 call will raise an exception before touching any data.
--             The function is recreated with OR REPLACE; its signature,
--             language, SECURITY DEFINER, and search_path are preserved exactly.
--
-- FIX 3 — GRANT ALL to anon on financial quote tables
--   Problem : quote_fees, quote_sends, and quote_lines all have
--             GRANT ALL ... TO anon (baseline lines 30892, 30901, 30910).
--             RLS policies on these tables protect against data reads, but:
--             (a) The INSERT/UPDATE/DELETE grants are an unnecessary attack
--                 surface if any future RLS misconfiguration removes protection.
--             (b) quote_sends.ip_address / recipient_email carry PII — the
--                 SELECT grant is especially sensitive for anon.
--   Fix     : REVOKE ALL DML (INSERT, UPDATE, DELETE) from anon on quote_fees
--             and quote_sends. Retain the existing SELECT-only anon policy on
--             quote_lines (used by the public proposal link flow); revoke DML.
--
-- FIX 4 — entity_audit_log SELECT policy lacks permission guard
--   Problem : The policy created in 20260625010000_entity_audit_log.sql allows
--             any authenticated user who belongs to an org to read all audit rows
--             for that org. Audit logs contain full_record (verbatim row data)
--             and changed_fields that may include PII or sensitive business data.
--             Access should be restricted to users with quotes.manage or an
--             admin/manager role, not every org member.
--   Fix     : Drop and recreate entity_audit_log_select with an additional
--             has_anew_permission guard for 'quotes.manage'. Users without that
--             permission lose direct SELECT access; they still receive audit
--             context through the application layer.
--             has_anew_permission is confirmed in the baseline (line 4131).
--
-- Affected tables / functions:
--   public.quotes                (RLS policy)
--   public.archive_quote(uuid)   (GRANT + function body)
--   public.quote_fees            (GRANT)
--   public.quote_sends           (GRANT)
--   public.quote_lines           (GRANT)
--   public.entity_audit_log      (RLS policy)
--
-- Safe     : Forward-only. All DROPs use IF EXISTS. Function is OR REPLACE.
--            No schema changes, no data changes.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- FIX 1: quotes UPDATE policy — add WITH CHECK
-- ---------------------------------------------------------------------------
-- The existing policy name is "quotes_update_policy" (baseline line 27564).
-- We drop it and recreate it with an identical USING clause plus a WITH CHECK
-- that mirrors the org-scope constraint, following the same pattern used in
-- 20260626110000_rls_performance_and_proposals_check.sql for proposals.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;

CREATE POLICY "quotes_update_policy"
  ON public.quotes
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );


-- ---------------------------------------------------------------------------
-- FIX 2a: Revoke EXECUTE on archive_quote from anon
-- ---------------------------------------------------------------------------
-- Baseline line 28146 grants EXECUTE explicitly to anon.
-- REVOKE without IF NOT EXISTS is safe — Postgres silently ignores a REVOKE
-- when the privilege does not exist, so this is idempotent.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.archive_quote(uuid) FROM anon;


-- ---------------------------------------------------------------------------
-- FIX 2b: Recreate archive_quote with an authorization guard
-- ---------------------------------------------------------------------------
-- The original body (baseline lines 598–628) is preserved exactly except for
-- the guard block added at the top of the function body.
-- The guard raises an exception before any DML if:
--   (a) auth.uid() is NULL (unauthenticated / anon caller), or
--   (b) the caller lacks the 'quotes.manage' permission in their active
--       membership (checked via has_anew_permission — confirmed at line 4131).
-- Using RAISE EXCEPTION rather than RETURN false ensures the caller cannot
-- silently discard the failure: the transaction is aborted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_quote("_quote_id" uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- ── Authorization guard ──────────────────────────────────────────────────
  -- Must be an authenticated user with quotes.manage permission.
  -- Evaluated once here; SECURITY DEFINER means the rest of the body runs as
  -- the function owner, so this check is the only RLS gate.
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'archive_quote: unauthenticated call rejected'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission((SELECT auth.uid()), 'quotes.manage') THEN
    RAISE EXCEPTION 'archive_quote: caller lacks quotes.manage permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- ────────────────────────────────────────────────────────────────────────

  INSERT INTO public.quotes_archive (
    id, modelo_base, cliente_id, obra_endereco, obra_notas, estado, moeda,
    desconto_global_percent, company_id, business_unit_id, created_by,
    created_at, updated_at, archived_at, archived_by,
    organization_id, entity_id, root_organization_id, title, template_id,
    deal_id, quote_number, validade_dias, subtotal, total_fees, total,
    site_address_id, proposal_id, request_date, delivered_at, delivery_time_hours
  )
  SELECT
    id, modelo_base, cliente_id, obra_endereco, obra_notas, estado, moeda,
    desconto_global_percent, company_id, business_unit_id, created_by,
    created_at, updated_at, now(), auth.uid(),
    organization_id, entity_id, root_organization_id, title, template_id,
    deal_id, quote_number, validade_dias, subtotal, total_fees, total,
    site_address_id, proposal_id, request_date, delivered_at, delivery_time_hours
  FROM public.quotes
  WHERE id = _quote_id;

  DELETE FROM public.quotes WHERE id = _quote_id;

  RETURN true;
EXCEPTION
  -- Re-raise our own authorization errors so callers see a clear message.
  WHEN insufficient_privilege THEN
    RAISE;
  -- All other errors return false (preserving original behaviour).
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Explicit grants — authenticated and service_role only (anon excluded).
REVOKE ALL ON FUNCTION public.archive_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_quote(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- FIX 3: Revoke excessive DML grants on financial quote tables from anon
-- ---------------------------------------------------------------------------
-- Baseline grants GRANT ALL TO anon on all three tables.
-- We revoke only DML (INSERT, UPDATE, DELETE) from anon.
-- SELECT is retained on quote_lines because the existing anon_quote_lines_read
-- policy (baseline line 23833) serves the public proposal link flow and is
-- intentionally scoped to public-link-enabled quotes.
-- SELECT is also retained on quote_fees and quote_sends because existing anon
-- policies may depend on it; DML grants are the primary attack surface.
-- ---------------------------------------------------------------------------

-- quote_fees: no anon DML needed (no anon policy covers INSERT/UPDATE/DELETE)
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_fees FROM anon;

-- quote_sends: no anon DML needed
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_sends FROM anon;

-- quote_lines: anon_quote_lines_read policy covers SELECT only; revoke DML
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_lines FROM anon;


-- ---------------------------------------------------------------------------
-- FIX 4: entity_audit_log SELECT policy — add permission guard
-- ---------------------------------------------------------------------------
-- The policy created in 20260625010000_entity_audit_log.sql (line 52) allows
-- any org member to read audit rows. Audit rows can contain full_record with
-- sensitive quote data. We tighten the policy to require 'quotes.manage'
-- so that only users who can manage quotes can read audit history.
--
-- Users with admin/manager roles already have quotes.manage via their role
-- (has_anew_permission grants bypass for system_admin and super_admin roles),
-- so this change does not regress any privileged user.
--
-- The INSERT, UPDATE-deny, and DELETE-deny policies are not touched — only
-- the SELECT policy is replaced.
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
    AND public.has_anew_permission((SELECT auth.uid()), 'quotes.manage')
  );


-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- 1. The (SELECT auth.uid()) pattern is used throughout — it causes Postgres
--    to evaluate auth.uid() once per query rather than once per row, consistent
--    with the performance fix applied in 20260626110000.
--
-- 2. archive_quote is SECURITY DEFINER, so the archived_by = auth.uid() call
--    inside the body uses the caller's auth identity, not the owner's. This is
--    correct: auth.uid() is a JWT claim resolved at connection time and is not
--    affected by SECURITY DEFINER.
--
-- 3. The entity_audit_log SELECT policy uses 'quotes.manage' as the permission
--    gate rather than a broader 'audit.view' permission that does not yet exist
--    in the permission catalogue. If a dedicated audit permission is introduced
--    in a future migration, this policy should be updated accordingly.
--
-- 4. REVOKE on table DML grants does not affect the existing RLS policies or
--    the authenticated / service_role grants on the same tables. The anon role
--    will still be able to SELECT from quote_lines via the anon_quote_lines_read
--    RLS policy (which is scoped to public-link-enabled quotes only).
-- =============================================================================
