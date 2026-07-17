-- Make quote_templates.codigo unique per-organization, not globally
-- Forward-only migration. Do not fold into the baseline.
-- 2026-11-10 | Module: Orçamentos (Quote Templates)
--
-- Background
-- ----------
-- 20260615130000_baseline_new_database.sql (lines ~14453-14457) defines
--   ALTER TABLE ONLY "public"."quote_templates"
--     ADD CONSTRAINT "quote_templates_codigo_key" UNIQUE ("codigo");
-- i.e. a single-column UNIQUE constraint with no organization_id in the key.
-- Two unrelated tenants that both pick an intuitive code like "TPL001" collide
-- with a cross-tenant unique-violation, even though quote_templates.codigo is
-- meant to be scoped per organization (organization_id IS NULL is reserved
-- for global/shared templates).
--
-- Fix: drop the single-column constraint and replace it with a composite
-- UNIQUE (organization_id, codigo). Two caveats this migration deliberately
-- accepts:
--   1. Postgres treats NULL as distinct from any other NULL for uniqueness
--      purposes, so this does NOT enforce uniqueness among global templates
--      (organization_id IS NULL) — multiple global templates could still
--      share a codigo. That already matches the pre-existing intent (global
--      templates were never distinguished from org templates by this
--      constraint before), and tightening that further is out of scope here.
--   2. Any existing (organization_id, codigo) duplicates would block this
--      migration from applying — none are expected under the previous
--      stricter global-uniqueness constraint (a stricter constraint cannot
--      produce more duplicates than a looser one), so no cleanup step is
--      included.

ALTER TABLE ONLY "public"."quote_templates"
  DROP CONSTRAINT IF EXISTS "quote_templates_codigo_key";

ALTER TABLE ONLY "public"."quote_templates"
  ADD CONSTRAINT "quote_templates_org_codigo_key" UNIQUE ("organization_id", "codigo");

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Two organizations can each create a quote_templates row with the same
--    codigo (e.g. "TPL001") without a unique-violation.
-- 2. The same organization still cannot create two quote_templates rows with
--    the same codigo — still enforced, now scoped to that organization_id.
