-- Entity Audit Log — Phase 2
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log table + indexes + RLS
--   2. set_audit_context() helper
--   3. fn_generic_entity_audit() trigger function
--   4. Triggers on audited tables
--   5. pg_cron cleanup job (conditional)

-- ============================================================
-- 1. entity_audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entity_audit_log (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  entity_id        uuid        NOT NULL,
  table_name       text        NOT NULL,
  operation        text        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields   jsonb,
  full_record      jsonb,
  changed_by       uuid        REFERENCES public.anew_users (id),
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entity_audit_log_pkey PRIMARY KEY (id)
);

-- Primary access pattern: per-entity chronological history
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_date
  ON public.entity_audit_log (entity_id, created_at DESC);

-- Secondary filter axes
CREATE INDEX IF NOT EXISTS idx_audit_log_org_date
  ON public.entity_audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_op
  ON public.entity_audit_log (table_name, operation);

-- changed_by for user-scoped audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON public.entity_audit_log (changed_by);

-- ============================================================
-- 1b. RLS — append-only, org-scoped
-- ============================================================

ALTER TABLE public.entity_audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read rows for their visible organisations.
CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- Authenticated users can insert rows only for their visible organisations.
-- The trigger function runs as SECURITY DEFINER, so most writes arrive via
-- service_role; this policy covers direct RPC callers.
CREATE POLICY entity_audit_log_insert
  ON public.entity_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- Explicitly deny UPDATE — append-only ledger.
CREATE POLICY entity_audit_log_no_update
  ON public.entity_audit_log
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Explicitly deny DELETE — append-only ledger.
CREATE POLICY entity_audit_log_no_delete
  ON public.entity_audit_log
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 2. set_audit_context(p_user_id, p_source)
-- ============================================================
-- Call this at the start of any transaction that should be attributed.
-- Uses SET LOCAL so the values are scoped to the current transaction.

CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_user_id uuid,
  p_source  text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.audit_user_id', p_user_id::text, true);  -- true = LOCAL
  PERFORM set_config('app.audit_source',  p_source,         true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_audit_context(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_audit_context(uuid, text)
  TO authenticated, service_role;

-- ============================================================
-- 3. fn_generic_entity_audit()
-- ============================================================
-- Generic AFTER INSERT/UPDATE/DELETE trigger that writes a single row to
-- entity_audit_log per qualifying change.
--
-- Design notes:
--   • SECURITY DEFINER so the function can always INSERT into entity_audit_log
--     regardless of the RLS policy on the audited table.
--   • search_path pinned to public,pg_temp to prevent search-path injection.
--   • Actor resolved via app.audit_user_id GUC first; falls back to
--     current_business_user_id() and then the anew_users row matching auth.uid().
--   • UPDATE rows are only written when meaningful fields actually changed
--     (noise columns excluded).
--   • org_id is resolved directly from the record for tables that carry
--     organization_id, and via a JOIN to anew_entity_roles for entity/satellite
--     tables that do not.
--   • Any exception is swallowed with RETURN NEW/OLD so the audit trigger
--     can never cause the originating DML to fail.

CREATE OR REPLACE FUNCTION public.fn_generic_entity_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed_by    uuid;
  v_source        text;
  v_org_id        uuid;
  v_entity_id     uuid;
  v_old           jsonb;
  v_new           jsonb;
  v_changed       jsonb;
  v_full          jsonb;
  v_key           text;
  -- Columns that carry no semantic meaning for change-tracking
  v_noise_cols    text[] := ARRAY[
    'updated_at', 'search_text', 'contact_attempts', 'last_activity_at'
  ];
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_changed_by := (current_setting('app.audit_user_id', true))::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := current_setting('app.audit_source', true);
  IF v_source = '' THEN
    v_source := NULL;
  END IF;

  -- ── Resolve entity_id ────────────────────────────────────────────────────
  -- Satellite tables use COALESCE(NEW.entity_id, OLD.entity_id) to handle
  -- DELETE where NEW is NULL.
  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD) ->> 'entity_id')::uuid;
    -- For tables whose PK *is* the entity (anew_entities), fall back to id.
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
    END IF;
  ELSE
    v_entity_id := (to_jsonb(NEW) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    END IF;
  END IF;

  -- ── Resolve organization_id ──────────────────────────────────────────────
  -- Strategy A: table carries organization_id directly.
  IF TG_OP = 'DELETE' THEN
    v_org_id := (to_jsonb(OLD) ->> 'organization_id')::uuid;
  ELSE
    v_org_id := (to_jsonb(NEW) ->> 'organization_id')::uuid;
  END IF;

  -- Strategy B: no direct organization_id — look up via role tables.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT er.organization_id
    INTO   v_org_id
    FROM   public.anew_entity_roles er
    WHERE  er.entity_id  = v_entity_id
      AND  er.deleted_at IS NULL
    ORDER BY er.created_at DESC
    LIMIT 1;
  END IF;

  -- Strategy C: satellite tables joined through their parent lead/contact/client.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT COALESCE(l.organization_id, c.organization_id, cl.organization_id)
    INTO   v_org_id
    FROM   (SELECT NULL::uuid) dummy
    LEFT JOIN public.anew_leads    l  ON l.entity_id  = v_entity_id AND l.deleted_at IS NULL
    LEFT JOIN public.anew_contacts c  ON c.entity_id  = v_entity_id AND c.deleted_at IS NULL
    LEFT JOIN public.anew_clients  cl ON cl.entity_id = v_entity_id AND cl.deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Cannot determine org — skip silently to avoid polluting the log.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build changed_fields / full_record ───────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_changed := NULL;
    v_full    := to_jsonb(NEW);

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, TG_TABLE_NAME, 'INSERT',
         v_changed, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      END IF;
    END LOOP;

    -- Only write a row when something meaningful actually changed.
    IF v_changed = '{}'::jsonb OR v_changed IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, TG_TABLE_NAME, 'UPDATE',
         v_changed, NULL, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_full := to_jsonb(OLD);

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, TG_TABLE_NAME, 'DELETE',
         NULL, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN OLD;
  END IF;

  -- Fallback — should never reach here.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- The audit trigger must never block the originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generic_entity_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_generic_entity_audit()
  TO service_role;

-- ============================================================
-- 4. Triggers
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- Each trigger is created with CREATE OR REPLACE (Postgres 14+) / DROP+CREATE
-- pattern for idempotent migrations.

-- ── Group A: tables with direct organization_id ──────────────────────────

-- anew_leads
DROP TRIGGER IF EXISTS trg_audit_anew_leads ON public.anew_leads;
CREATE TRIGGER trg_audit_anew_leads
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- anew_contacts
DROP TRIGGER IF EXISTS trg_audit_anew_contacts ON public.anew_contacts;
CREATE TRIGGER trg_audit_anew_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_contacts
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- anew_clients
DROP TRIGGER IF EXISTS trg_audit_anew_clients ON public.anew_clients;
CREATE TRIGGER trg_audit_anew_clients
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- deals
DROP TRIGGER IF EXISTS trg_audit_deals ON public.deals;
CREATE TRIGGER trg_audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- proposals
DROP TRIGGER IF EXISTS trg_audit_proposals ON public.proposals;
CREATE TRIGGER trg_audit_proposals
  AFTER INSERT OR UPDATE OR DELETE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ── Group B: anew_entities — no direct organization_id, lookup via roles ──

DROP TRIGGER IF EXISTS trg_audit_anew_entities ON public.anew_entities;
CREATE TRIGGER trg_audit_anew_entities
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ── Group C: satellite tables — lookup + COALESCE(NEW.entity_id, OLD.entity_id)
-- The trigger function already handles NULL NEW for DELETE via to_jsonb(OLD).

-- anew_entity_emails
DROP TRIGGER IF EXISTS trg_audit_anew_entity_emails ON public.anew_entity_emails;
CREATE TRIGGER trg_audit_anew_entity_emails
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_entity_emails
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- anew_entity_phones
DROP TRIGGER IF EXISTS trg_audit_anew_entity_phones ON public.anew_entity_phones;
CREATE TRIGGER trg_audit_anew_entity_phones
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_entity_phones
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- anew_entity_addresses
DROP TRIGGER IF EXISTS trg_audit_anew_entity_addresses ON public.anew_entity_addresses;
CREATE TRIGGER trg_audit_anew_entity_addresses
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_entity_addresses
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ============================================================
-- 5. pg_cron cleanup job (conditional on extension availability)
-- ============================================================
-- Deletes audit rows older than 90 days at 03:00 UTC every day.
-- Wrapped in a DO block so the migration succeeds even when pg_cron is not
-- installed on the target environment.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'audit-log-cleanup',
      '0 3 * * *',
      $cron$DELETE FROM public.entity_audit_log WHERE created_at < now() - interval '90 days'$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron registration is best-effort; never fail the migration.
  NULL;
END;
$$;
