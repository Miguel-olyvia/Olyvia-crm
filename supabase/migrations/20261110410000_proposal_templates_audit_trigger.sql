-- Add missing audit trigger for proposal_templates ("Propostas" -> Editor de
-- Templates, src/components/ProposalTemplateEditor.tsx / src/pages/ProposalTemplates.tsx)
--
-- PROBLEM (confirmed live against the linked remote DB, not just code reading):
--   SELECT * FROM pg_trigger WHERE tgrelid = 'proposal_templates'::regclass
--   returns exactly ONE row: update_proposal_templates_updated_at, wired to
--   update_updated_at_column() (the generic "maintain updated_at" trigger).
--   There is no audit trigger on this table at all.
--
--   SELECT count(*) FROM entity_audit_log WHERE table_name = 'proposal_templates'
--   returns 0, and always has — every INSERT/UPDATE/DELETE ever made to a
--   proposal template (create, edit design/sections/colors, delete, set
--   default/active) has produced zero audit trail.
--
--   Sibling tables in the same module are fully audited: proposals, quotes and
--   client_contracts all write to entity_audit_log via triggers registered in
--   20260625010000_entity_audit_log.sql / 20260628100000_proposals_audit_triggers.sql.
--   proposal_templates was simply never included in either migration — this is
--   a gap, not an intentional exclusion (there is no PII/secret column on this
--   table that would justify a bespoke masking function the way
--   fn_audit_proposals_safe() exists for proposals' public_token/tracking_token).
--
-- FIX:
--   proposal_templates carries organization_id directly (confirmed live via
--   information_schema.columns), so per this codebase's audit classification it
--   is a plain "Group A" table — same bucket as deals, proposals, anew_leads in
--   20260625010000_entity_audit_log.sql section 4. No new trigger function is
--   needed: attach the existing generic public.fn_generic_entity_audit() as-is.
--   proposal_templates has no entity_id column, but fn_generic_entity_audit()
--   falls back to the row's own id column when entity_id is absent (see
--   20260625010000_entity_audit_log.sql section 3), so entity_id will resolve
--   to the template's own id — not NULL — same as any other Group A table
--   lacking a dedicated entity_id column.
--
-- Idempotent DROP IF EXISTS + CREATE, matching the pattern used throughout
-- supabase/migrations/*.sql in this repo.

DROP TRIGGER IF EXISTS trg_audit_proposal_templates ON public.proposal_templates;
CREATE TRIGGER trg_audit_proposal_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. After this migration, SELECT * FROM pg_trigger WHERE tgrelid =
--    'proposal_templates'::regclass should return two rows:
--    update_proposal_templates_updated_at (unchanged) and the new
--    trg_audit_proposal_templates.
-- 2. Creating, editing (name, colors, fonts, sections, design_settings,
--    is_default, is_active, template_type, ...) or deleting a proposal
--    template should each produce a corresponding row in entity_audit_log
--    with table_name = 'proposal_templates', organization_id populated from
--    the row's own organization_id column, and entity_id equal to the
--    template's own id (fn_generic_entity_audit()'s id-column fallback).
-- 3. No behavior of proposal_templates reads/writes changes; only an AFTER
--    trigger was added, so the "Editor de Templates" save/delete flows are
--    unaffected other than gaining an audit row.
