-- =============================================================================
-- Migration: 20261101010000_revoke_anon_client_portal_users_proposal_manual_items.sql
-- Purpose  : Revoke the leftover `GRANT ALL ... TO anon` on
--            public.client_portal_users and public.proposal_manual_items.
--
-- Why      : Both tables already have RLS enabled with policies scoped only
--            to the `authenticated` role (see 20260615130000_baseline_new_
--            database.sql):
--              • client_portal_users — "Client can view own portal record",
--                "Client can update own portal record", "Org members can
--                insert/update/view client portal users" — all TO
--                authenticated.
--              • proposal_manual_items — auth_select/insert/update/delete_
--                proposal_manual_items — all TO authenticated.
--            No policy on either table grants anything to `anon`, so the
--            baseline `GRANT ALL ... TO anon` is not exploitable today (RLS
--            has no matching policy for anon, so every anon query returns
--            zero rows / is rejected). This is a defense-in-depth cleanup,
--            not a fix for an active vulnerability, done for consistency
--            with the other tables already closed to anon in
--            20261029020000_remove_legacy_proposal_public_link_access.sql.
--
-- Scope    : Only REVOKE statements below. No RLS policy, column, or
--            authenticated/service_role grant is touched.
-- =============================================================================

REVOKE ALL ON TABLE public.client_portal_users FROM anon;

REVOKE ALL ON TABLE public.proposal_manual_items FROM anon;
