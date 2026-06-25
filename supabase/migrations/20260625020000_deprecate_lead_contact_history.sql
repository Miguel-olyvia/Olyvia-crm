-- Phase 4: deprecate lead_contact_history.
--
-- The application no longer dual-writes to lead_contact_history. Contact history
-- is now sourced exclusively from entity_interactions (interaction_type = 'call').
--
-- This migration retires the legacy table WITHOUT destroying data: the table is
-- renamed to lead_contact_history_deprecated and all active RLS policies are
-- dropped so the table is no longer reachable through the API by authenticated
-- users. The historical rows remain fully intact for auditing / backfill and can
-- be inspected via a privileged (service_role) connection if ever needed.
--
-- Forward-only: do not edit once applied. Any correction must ship as a later
-- migration.

DO $$
BEGIN
  -- Rename only if the live table still exists and the deprecated name is free.
  -- Keeps this migration idempotent against partial / re-run states.
  IF to_regclass('public.lead_contact_history') IS NOT NULL
     AND to_regclass('public.lead_contact_history_deprecated') IS NULL THEN

    ALTER TABLE "public"."lead_contact_history"
      RENAME TO "lead_contact_history_deprecated";

  END IF;
END
$$;

-- Drop the active RLS policies on the (now renamed) table. Policies follow the
-- table through RENAME, so they are referenced here under the deprecated name.
-- Data is preserved; only active access via these policies is removed.
DO $$
BEGIN
  IF to_regclass('public.lead_contact_history_deprecated') IS NOT NULL THEN

    -- Baseline CRUD policies (20260615130000_baseline_new_database.sql)
    DROP POLICY IF EXISTS "anew_contact_history_select"
      ON "public"."lead_contact_history_deprecated";
    DROP POLICY IF EXISTS "anew_contact_history_insert"
      ON "public"."lead_contact_history_deprecated";
    DROP POLICY IF EXISTS "anew_contact_history_update"
      ON "public"."lead_contact_history_deprecated";
    DROP POLICY IF EXISTS "anew_contact_history_delete"
      ON "public"."lead_contact_history_deprecated";

    -- System-admin PII default-deny RESTRICTIVE policy
    -- (20260622114000 / 20260623150000 / 20260624110000).
    DROP POLICY IF EXISTS "system_admin_pii_default_deny"
      ON "public"."lead_contact_history_deprecated";

    -- Keep RLS enabled so that, with no policies present, the table denies all
    -- access to authenticated/anon roles by default (defence in depth). The data
    -- stays reachable only through service_role / superuser connections.
    EXECUTE 'ALTER TABLE "public"."lead_contact_history_deprecated" ENABLE ROW LEVEL SECURITY';

    COMMENT ON TABLE "public"."lead_contact_history_deprecated" IS
      'DEPRECATED (Phase 4, 2026-06-25). Historical lead contact records are '
      'preserved here for auditing only. The application no longer reads or '
      'writes this table; contact history now lives in entity_interactions '
      '(interaction_type = ''call''). All active RLS policies were dropped, so '
      'the table is unreachable via the API by authenticated users.';

  END IF;
END
$$;
