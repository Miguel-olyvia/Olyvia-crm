-- Fix create-lead's broken form_submissions upsert (real ON CONFLICT mismatch)
-- 2026-07-30 | Module: Leads / Form submissions
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem (confirmed live via a real anonymous public-form submission, not
-- static reading — the request returned Postgres error 42P10 "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification")
-- -------------------------------------------------------------------------
-- form_submissions' real uniqueness guarantee (20260823010000) is an
-- EXPRESSION-based unique index:
--   uniq_form_submissions_org_entity_form_campaign
--     ON (organization_id, entity_id,
--         COALESCE(form_id, '00000000-0000-0000-0000-000000000000'),
--         COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'))
-- create-lead/index.ts calls the Supabase JS client's
-- `.upsert(row, { onConflict: 'organization_id,entity_id,form_id,campaign_id' })`,
-- which builds a plain `ON CONFLICT (organization_id, entity_id, form_id,
-- campaign_id)` clause — a BARE column list that does not match the real
-- COALESCE-expression index at all. Postgres has no way to know that clause
-- refers to the same uniqueness guarantee, so the upsert 500s on every call
-- that reaches this branch (any public-form resubmission that classifies as
-- an existing contact/client) — this write path has likely never succeeded
-- since the feature was introduced, which is consistent with
-- form_submissions being empty in every org checked live today.
--
-- Fix
-- ---
-- The JS client's `onConflict` option only accepts a plain identifier list
-- (or a real constraint name via `ignoreDuplicates`/`onConflict` — neither
-- supports arbitrary expressions), so it structurally cannot target an
-- expression-based unique index. Give create-lead a SECURITY DEFINER RPC
-- that performs the correct native `INSERT ... ON CONFLICT (<the real
-- expression>) DO UPDATE` instead, and switch the Edge Function to call it.

CREATE OR REPLACE FUNCTION "public"."upsert_form_submission"(
  "p_organization_id" "uuid",
  "p_root_organization_id" "uuid",
  "p_entity_id" "uuid",
  "p_form_id" "uuid",
  "p_campaign_id" "uuid",
  "p_target_type" "text",
  "p_target_id" "uuid",
  "p_field_values" "jsonb",
  "p_status" "text",
  "p_is_complete" boolean,
  "p_current_step" integer,
  "p_total_steps" integer
)
RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.form_submissions (
    organization_id, root_organization_id, entity_id, form_id, campaign_id,
    target_type, target_id, field_values, status, is_complete, current_step, total_steps
  ) VALUES (
    p_organization_id, p_root_organization_id, p_entity_id, p_form_id, p_campaign_id,
    p_target_type, p_target_id, p_field_values, p_status, p_is_complete, p_current_step, p_total_steps
  )
  ON CONFLICT (
    organization_id, entity_id,
    COALESCE(form_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  DO UPDATE SET
    target_type   = EXCLUDED.target_type,
    target_id     = EXCLUDED.target_id,
    field_values  = EXCLUDED.field_values,
    status        = EXCLUDED.status,
    is_complete   = EXCLUDED.is_complete,
    current_step  = EXCLUDED.current_step,
    total_steps   = EXCLUDED.total_steps,
    updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION "public"."upsert_form_submission" IS
  'Correct native upsert for form_submissions, targeting the real COALESCE-expression unique index (uniq_form_submissions_org_entity_form_campaign) that the Supabase JS client''s .upsert({onConflict: "..."}) cannot express (it only supports a bare column list). Called by create-lead via service_role — not exposed to authenticated/anon (this table is service_role-write-only by design, see 20260823010000).';

-- Table is service_role-write-only by design (see 20260823010000's own
-- comment) - keep it that way, only the Edge Functions (via service_role,
-- which bypasses grants entirely) are meant to call this.
REVOKE ALL ON FUNCTION "public"."upsert_form_submission"(
  "uuid", "uuid", "uuid", "uuid", "uuid", "text", "uuid", "jsonb", "text", boolean, integer, integer
) FROM PUBLIC, "anon", "authenticated";

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Calling this twice with the same (organization_id, entity_id, form_id,
--    campaign_id) tuple (including both NULL) updates the same row (same id
--    returned both times) instead of erroring or creating a duplicate.
-- 2. A different form_id or campaign_id for the same (org, entity) creates a
--    distinct row.
