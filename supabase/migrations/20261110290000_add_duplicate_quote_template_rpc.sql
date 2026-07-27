-- Add missing duplicate_quote_template RPC
-- Forward-only migration. Do not fold into the baseline.
-- 2026-11-10 | Module: Orçamentos (Quote Templates)
--
-- Background
-- ----------
-- src/pages/QuoteModels.tsx already calls
-- supabase.rpc("duplicate_quote_template", { p_template_id, p_org_id,
-- p_user_id, p_new_name, p_new_codigo }) from its "Duplicar" action on a
-- Quick Template, and the signature is already declared in
-- src/integrations/supabase/types.ts (Returns: string). That means the
-- function exists on some already-provisioned remote database from prior
-- work, but no migration file ever created it — so any freshly-provisioned
-- environment (a new dev DB, a restored backup, CI) fails with
-- "42883 function public.duplicate_quote_template(...) does not exist" the
-- first time someone clicks "Duplicar" on a template.
--
-- This migration creates it from scratch, following the same patterns
-- already established for RPCs that duplicate an owned, org-scoped record on
-- behalf of the calling user:
--   - SECURITY DEFINER + SET search_path (see rpc_duplicate_quote_insert in
--     20261012010000_fix_duplicate_quote_audit_attribution.sql /
--     20261107030000_authorize_rpc_duplicate_quote_insert.sql)
--   - Explicit organization-scope authorization via
--     public.get_user_visible_org_ids(auth.uid()) — the canonical DB-side
--     org-scope check used everywhere else in this project — skipped only
--     when auth.uid() IS NULL (genuine service_role/no-JWT calls).
--   - p_user_id must equal the calling anew_users.id (resolved via
--     anew_users.auth_user_id = auth.uid()), or NULL — a caller can never
--     forge audit attribution to another user's business identity.
--   - Audit attribution via public.set_audit_context(p_user_id, 'web_app')
--     for the lifetime of the transaction, exactly like
--     rpc_duplicate_quote_insert.
--
-- Behaviour: duplicates a quote_templates row (name/codigo supplied by the
-- caller, everything else copied) plus all of its quote_template_items rows,
-- scoped to p_org_id. Returns the new template's id (as text, matching the
-- `Returns: string` signature already recorded in types.ts).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql — defines public.set_audit_context()
--   Baseline — defines public.get_user_visible_org_ids(), quote_templates,
--   quote_template_items

-- A function with this exact argument signature already exists on the
-- remote database with a different RETURNS type (discovered when this
-- migration was first applied: "cannot change return type of existing
-- function", SQLSTATE 42P13). CREATE OR REPLACE cannot change a function's
-- return type, so the old version must be dropped first.
DROP FUNCTION IF EXISTS public.duplicate_quote_template(uuid, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.duplicate_quote_template(
  p_template_id uuid,
  p_org_id      uuid,
  p_user_id     uuid,    -- anew_users.id to attribute the audit rows to; NULL => trigger fallback
  p_new_name    text,
  p_new_codigo  text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source          public.quote_templates%ROWTYPE;
  v_new_id          uuid;
  v_caller_anew_id  uuid;
BEGIN
  -- ── Authorization (skipped only for genuine service_role/no-JWT callers) ──
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR p_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    THEN
      RAISE EXCEPTION 'Not authorized for this organization'
        USING ERRCODE = '42501';
    END IF;

    SELECT au.id INTO v_caller_anew_id
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid();

    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_caller_anew_id THEN
      RAISE EXCEPTION 'Actor mismatch'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_source
  FROM public.quote_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- The source template must itself belong to the org being duplicated into
  -- (org-level templates only; global templates have organization_id NULL
  -- and are duplicatable into any org the caller is scoped to).
  IF v_source.organization_id IS NOT NULL AND v_source.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Template does not belong to this organization'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL THEN
    PERFORM public.set_audit_context(p_user_id, 'web_app');
  END IF;

  INSERT INTO public.quote_templates (
    name, codigo, description, active, created_by, organization_id
  )
  VALUES (
    COALESCE(NULLIF(p_new_name, ''), v_source.name || ' (Copy)'),
    COALESCE(NULLIF(p_new_codigo, ''), v_source.codigo || '_copy_' || EXTRACT(EPOCH FROM clock_timestamp())::bigint::text),
    v_source.description,
    v_source.active,
    COALESCE(p_user_id, v_source.created_by),
    p_org_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.quote_template_items (
    template_id, product_id, default_qt, required, ordem,
    service_id, item_type, default_attributes, bundle_id
  )
  SELECT
    v_new_id, product_id, default_qt, required, ordem,
    service_id, item_type, default_attributes, bundle_id
  FROM public.quote_template_items
  WHERE template_id = p_template_id;

  RETURN v_new_id::text;
END;
$$;

ALTER FUNCTION public.duplicate_quote_template(uuid, uuid, uuid, text, text) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.duplicate_quote_template(uuid, uuid, uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.duplicate_quote_template(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Calling with a p_org_id the caller is NOT scoped to fails with
--    "Not authorized for this organization" (ERRCODE 42501).
-- 2. Calling with a p_user_id that isn't the caller's own anew_users.id
--    fails with "Actor mismatch" (ERRCODE 42501).
-- 3. Calling with p_user_id = own anew_users.id (or NULL) on a template that
--    belongs to the caller's org (or is a global template with
--    organization_id NULL) succeeds, returns the new template's id as text,
--    and copies every quote_template_items row across.
-- 4. Calling on a template that belongs to a DIFFERENT org than p_org_id
--    fails with "Template does not belong to this organization" (ERRCODE 42501).
