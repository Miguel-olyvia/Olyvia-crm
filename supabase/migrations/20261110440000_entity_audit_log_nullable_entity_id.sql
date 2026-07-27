-- Entity Audit Log — allow NULL entity_id (fix silent audit blackout)
-- Forward-only migration. Do not fold into or edit any prior migration.
--
-- ROOT CAUSE (confirmed by reading the live trigger functions, which match
-- what `supabase migration list` shows as already applied to the remote
-- database — no drift):
--
--   entity_audit_log.entity_id was declared NOT NULL in the baseline
--   migration (20260625010000_entity_audit_log.sql, line 18). But several
--   audited tables legitimately have a NULL entity_id by design:
--     • proposals.entity_id is NULL whenever the proposal is linked via
--       deal_id instead of a direct contact/client (see comment in
--       20260815010000_proposals_audit_bypass_and_rpcs.sql line 264).
--     • deals.entity_id is nullable in the schema itself (baseline, line
--       9666) with no NOT NULL constraint.
--     • quotes.entity_id has the same "may be NULL" case documented in
--       fn_audit_quote_send() (20261009010000_entity_audit_log_add_record_id.sql
--       line 437).
--
--   Every proposal/quote/deal audit trigger function
--   (fn_audit_proposals_safe, fn_audit_proposal_child, fn_audit_proposal_send,
--   fn_audit_proposal_verification, fn_audit_quote_send, fn_audit_deal_child,
--   and the deal_needs variant) explicitly documents the intent that "the
--   audit row is still written" when entity_id resolves to NULL — org context
--   is treated as sufficient. That intent is correct, but it silently fails:
--   the INSERT into entity_audit_log violates the entity_id NOT NULL
--   constraint, and every one of those trigger functions wraps its INSERT in
--   `EXCEPTION WHEN OTHERS THEN NULL;` (deliberately, so the audit trigger
--   never blocks the originating DML) — so the constraint violation is
--   swallowed instead of surfacing, and the row is simply never written.
--
--   Confirmed impact for proposals specifically: a proposal created with
--   entity_id NULL (deal-linked, no direct contact/client) gets ZERO
--   entity_audit_log rows for its entire lifecycle (INSERT, every UPDATE,
--   line-item changes, send). A proposal that starts with entity_id NULL and
--   later has entity_id populated (e.g. once a contact/client gets linked)
--   only starts producing audit rows from that point onward — every action
--   before entity_id became non-null is silently unaudited.
--
-- FIX:
--   Drop the NOT NULL constraint on entity_audit_log.entity_id. This is the
--   single, root-cause fix: it makes the column's real-world constraint match
--   its documented and intended semantics (a nullable CRM-entity correlation
--   key), without touching any of the ~10 trigger functions that already
--   correctly resolve entity_id to NULL and expect the write to succeed.
--
--   organization_id remains NOT NULL and is the primary scoping/RLS column
--   (see entity_audit_log_select policy — it filters on organization_id only,
--   never on entity_id), so read access and org isolation are unaffected.
--   record_id (added in 20261009010000) remains available to correlate audit
--   rows back to the specific audited row even when entity_id is NULL.

ALTER TABLE public.entity_audit_log
  ALTER COLUMN entity_id DROP NOT NULL;

COMMENT ON COLUMN public.entity_audit_log.entity_id IS
  'Shared CRM-entity correlation key (FK-style pointer into the anew_entities '
  'graph), intentionally non-unique across rows belonging to the same client. '
  'May be NULL: some audited tables (e.g. proposals linked via deal_id only, '
  'deals without a linked entity) have no resolvable entity_id. Rows with '
  'NULL entity_id are still fully readable via organization_id + table_name '
  '(+ record_id, added in 20261009010000) — they are simply excluded from '
  'per-entity ("this contact/client''s history") views.';
