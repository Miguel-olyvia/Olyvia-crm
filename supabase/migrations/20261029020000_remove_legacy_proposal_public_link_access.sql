-- =============================================================================
-- Migration: 20261029020000_remove_legacy_proposal_public_link_access.sql
-- Purpose  : Remove the legacy unauthenticated "public proposal link"
--            (public_token / public_link_enabled / tracking_token, served at
--            /proposal/:token via src/pages/PublicProposal.tsx) and close all
--            anon (unauthenticated) database access that existed only to
--            support it.
--
-- Why      : This flow has been superseded by the authenticated client portal
--            (client_portal_users, provisioned via the create-client-portal-
--            access Edge Function), which already covers proposals with a
--            real password-protected login instead of a guessable/shareable
--            token. The public-link frontend page is being removed in this
--            same change by a parallel task; this migration removes the
--            corresponding database access so no legacy consumer remains.
--
-- Root cause (documented, already partially mitigated):
--            20260627110000_proposals_security_fixes.sql (FIX 4) found that
--            "Public can view proposals by token" (baseline line ~21538) does
--            not compare the row's public_token against any value supplied by
--            the caller — it only checks public_link_enabled = true AND
--            public_token IS NOT NULL. Combined with GRANT ALL ON
--            public.proposals TO anon (baseline), any unauthenticated REST
--            call with the anon key returns EVERY proposal with a public link
--            enabled, across ALL organizations. That migration only revoked
--            INSERT/UPDATE/DELETE from anon on proposals, keeping SELECT (and
--            the token-less policy) alive because the public link was still a
--            live feature at the time. It is not anymore — this migration
--            finishes the job by removing the policy and the grant entirely.
--
-- Scope confirmed via exhaustive grep across src/ and supabase/functions/
-- before writing this migration:
--   • src/pages/PublicProposal.tsx and src/components/proposals/
--     proposalPortalData.ts are the ONLY code paths that query
--     proposals / proposal_items / proposal_rejection_reasons / quotes /
--     quote_lines using the anon-keyed Supabase client
--     (src/integrations/supabase/client.ts). Both are being deleted from the
--     frontend as part of this same task by a parallel agent.
--   • supabase/functions/track-proposal-view, send-proposal-email,
--     send-verification-code, client-portal-action and generate-contract-pdf
--     all instantiate their Supabase client with SUPABASE_SERVICE_ROLE_KEY
--     (service_role bypasses RLS and table grants entirely), NOT the anon
--     key. client-portal-action does create a second client with the anon
--     key, but only to call `.auth.getUser()` for JWT validation — it never
--     queries proposals/quotes tables through that anon client. None of these
--     functions depend on anon's SELECT grant or on the policies being
--     dropped here.
--   • No "reject-proposal" or "generate-contract-pdf" Edge Function reads
--     proposals via anon grants/RLS: generate-contract-pdf uses service_role
--     exclusively; there is in fact no "reject-proposal" function deployed
--     under supabase/functions at all (the frontend call to it is dead code
--     tied to the page being removed).
--   • The authenticated client-portal flow (client_portal_users +
--     "Client can view own proposals" / "Client can view own quotes" / etc.
--     RLS policies, all driven by portal_user_can_see_document() against
--     auth.uid()) runs entirely under the `authenticated` role and its own
--     grants — it does not use or need the `anon` grants/policies removed
--     below.
--
-- Tables touched (anon access removed, RLS/authenticated access untouched):
--   public.proposals                 — DROP token-less SELECT policy, REVOKE ALL FROM anon
--   public.proposal_items             — anon_proposal_items_read existed solely to
--                                        gate on proposals.public_link_enabled
--                                        (baseline line ~23824); no longer used
--                                        by any surviving code path.
--   public.proposal_rejection_reasons — anon_select_proposal_rejection_reasons
--                                        used `USING (true)` (baseline line
--                                        ~23852), exposing every organization's
--                                        rejection reasons to anon; existed
--                                        only for the public rejection form.
--   public.quotes                     — anon_quotes_read gated on the parent
--                                        proposal's public_link_enabled
--                                        (baseline line ~23843); documented in
--                                        20260627050000_quotes_security_fixes.sql
--                                        (line ~178) as serving only "the
--                                        public proposal link flow".
--   public.quote_lines                — anon_quote_lines_read, same gate and
--                                        same documented purpose (baseline
--                                        line ~23833).
--
-- Not touched by this migration (intentionally):
--   • public.public_token / public_link_enabled / tracking_token columns are
--     NOT dropped here. Column removal is deferred until it is confirmed in
--     production that no previously shared public link is still being hit,
--     to avoid breaking anything unexpectedly before the frontend rollout is
--     verified.
--   • proposal_sends and proposal_verification_codes already had ALL
--     privileges (including SELECT) revoked from anon in
--     20260627110000_proposals_security_fixes.sql — nothing left to do there.
--   • Client-portal ("Client can view own proposals/quotes/...") policies for
--     the `authenticated` role are untouched; they are the intended
--     replacement for this legacy flow.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- public.proposals
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can view proposals by token" ON public.proposals;

REVOKE ALL ON TABLE public.proposals FROM anon;

-- -----------------------------------------------------------------------------
-- public.proposal_items
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "anon_proposal_items_read" ON public.proposal_items;

REVOKE ALL ON TABLE public.proposal_items FROM anon;

-- -----------------------------------------------------------------------------
-- public.proposal_rejection_reasons
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "anon_select_proposal_rejection_reasons" ON public.proposal_rejection_reasons;

REVOKE ALL ON TABLE public.proposal_rejection_reasons FROM anon;

-- -----------------------------------------------------------------------------
-- public.quotes (anon SELECT existed only to support the proposal public link)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "anon_quotes_read" ON public.quotes;

REVOKE ALL ON TABLE public.quotes FROM anon;

-- -----------------------------------------------------------------------------
-- public.quote_lines (same rationale as public.quotes above)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "anon_quote_lines_read" ON public.quote_lines;

REVOKE ALL ON TABLE public.quote_lines FROM anon;
