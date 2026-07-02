-- Organizations Audit Triggers — Wave 1
-- 2026-07-11 | Module: Organizações (Organizations) | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_anew_organizations()   — self-org: organization_id = the row's own id
--   2. fn_audit_anew_org_addresses()   — satellite: org resolved via org_id → anew_organizations
--   3. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   4. REVOKE/GRANT for the new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the satellite patterns in
-- fn_audit_brand_organizations() (20260705010000_brands_audit_triggers.sql),
-- fn_audit_anew_users() (20260709010000_users_audit_triggers.sql), and
-- fn_audit_anew_role_permissions() (20260710000000_roles_audit_triggers.sql):
--   · SECURITY DEFINER + pinned search_path = public, pg_temp
--   · Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   · UPDATE rows skipped when only noise columns changed
--   · Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   · changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql — entity_audit_log table + fn_generic_entity_audit()
--
-- Schema confirmed directly from the baseline (20260615130000_baseline_new_database.sql):
--
--   anew_organizations (line ~8270):
--     id uuid NOT NULL, name text NOT NULL, type text NOT NULL, description text,
--     logo_url text, status text NOT NULL, metadata jsonb, created_by uuid,
--     created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, sector text,
--     is_fiscal boolean, entity_id uuid, phone text
--     NOTE: anew_organizations has NO organization_id column — it IS the organization.
--     The generic function's Strategy A org lookup (NEW/OLD.organization_id) resolves
--     to NULL and it would skip silently. A dedicated function sets both
--     v_org_id and v_entity_id to the row's own id so the org's own edits are logged
--     under its own org+entity timeline. Its entity_id column points at anew_entities
--     and must NOT be used as the audit entity_id (that would scatter audit rows).
--     An existing BEFORE INSERT trigger (trg_ensure_organization_entity_identity,
--     line ~17545) populates entity_id; it fires before the AFTER trigger and is
--     left untouched.
--
--   anew_org_addresses (line ~8203):
--     id uuid NOT NULL, org_id uuid NOT NULL, address_id uuid NOT NULL,
--     is_fiscal boolean NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz,
--     created_by uuid, created_at timestamptz NOT NULL
--     NOTE: no organization_id column, no updated_at column, no entity_id column.
--     org+entity are resolved by joining the parent organization via org_id.
--     entity_id is set to the parent organization's id so address-history audit rows
--     group under the organization entity timeline in the UI.
--
-- Tables audited:
--   anew_organizations  — fn_audit_anew_organizations()   self-org (org_id = entity_id = id)
--   anew_org_addresses  — fn_audit_anew_org_addresses()    satellite via org_id → anew_organizations
--
-- Existing triggers on these tables (baseline — confirmed):
--   anew_organizations: trg_ensure_organization_entity_identity (BEFORE INSERT, entity identity).
--                       No audit trigger exists at this timestamp.
--   anew_org_addresses: none.
--   DROP IF EXISTS guards below make the registrations idempotent.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'.


-- ============================================================
-- 1. fn_audit_anew_organizations()
-- ============================================================
-- Handles: anew_organizations
--
-- anew_organizations has no organization_id column; the row's own id is both the
-- organization_id and the entity_id for its audit trail. This groups an org's own
-- edits under its own org+entity timeline.

CREATE OR REPLACE FUNCTION public.fn_audit_anew_organizations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- The organization IS the row; both org and entity are the row's own id.
  -- (Deliberately NOT the anew_entities-pointing entity_id column.)
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );
  v_entity_id := v_org_id;

  -- Cannot determine org — skip silently (should not happen; id is NOT NULL).
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    -- Skip write when nothing meaningful changed.
    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_organizations() TO service_role;


-- ============================================================
-- 2. fn_audit_anew_org_addresses()
-- ============================================================
-- Handles: anew_org_addresses
--
-- anew_org_addresses columns:
--   id, org_id, address_id, is_fiscal, valid_from, valid_to, created_by, created_at
--
-- org and entity are resolved via: org_id → anew_organizations
--   organization_id → anew_organizations.id (i.e. the org_id value itself)
--   entity_id       → anew_organizations.id (groups address-history audit rows under
--                                            the organization entity timeline in the UI)
--
-- The parent org is looked up so a stale/orphaned org_id (should not occur — org_id is
-- NOT NULL with an FK to anew_organizations) is handled by skipping the audit write.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'
-- (updated_at does not exist on this table but is harmless to list).

CREATE OR REPLACE FUNCTION public.fn_audit_anew_org_addresses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_org_ref        uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id from whichever side is available ──────────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_org_ref := COALESCE(
    (to_jsonb(NEW) ->> 'org_id')::uuid,
    (to_jsonb(OLD) ->> 'org_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent organization ────────
  -- entity_id is set to the parent org's id so address-history changes group
  -- under the organization entity timeline in the UI.
  IF v_org_ref IS NOT NULL THEN
    SELECT o.id, o.id
    INTO   v_org_id, v_entity_id
    FROM   public.anew_organizations o
    WHERE  o.id = v_org_ref
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently (orphaned org_id).
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    -- Skip write when nothing meaningful changed.
    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_org_addresses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_org_addresses() TO service_role;


-- ============================================================
-- 3. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).
--
-- Existing triggers left untouched:
--   anew_organizations: trg_ensure_organization_entity_identity (BEFORE INSERT).
--   That trigger sorts before trg_audit_* and populates entity_id, so the AFTER
--   audit trigger sees the finalized row.

-- anew_organizations — self-org: org_id = entity_id = row's own id.
DROP TRIGGER IF EXISTS trg_audit_anew_organizations ON public.anew_organizations;
CREATE TRIGGER trg_audit_anew_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_anew_organizations();

-- anew_org_addresses — satellite via org_id → anew_organizations.
-- entity_id is set to the parent organization's id inside fn_audit_anew_org_addresses().
DROP TRIGGER IF EXISTS trg_audit_anew_org_addresses ON public.anew_org_addresses;
CREATE TRIGGER trg_audit_anew_org_addresses
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_org_addresses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_anew_org_addresses();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm triggers are registered and point to the expected functions:
--
--   SELECT t.tgname, p.proname AS function_name, t.tgenabled
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid IN ('public.anew_organizations'::regclass, 'public.anew_org_addresses'::regclass)
--     AND t.tgname LIKE '%audit%'
--   ORDER BY t.tgname;
--
-- Expected:
--   trg_audit_anew_org_addresses → fn_audit_anew_org_addresses, enabled
--   trg_audit_anew_organizations → fn_audit_anew_organizations, enabled
--
-- 2. Confirm no duplicate audit trigger on either table:
--
--   SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
--   WHERE tgrelid IN ('public.anew_organizations'::regclass, 'public.anew_org_addresses'::regclass)
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one audit trigger per table.
--
-- 3. Confirm the pre-existing entity-identity trigger is still present on
--    anew_organizations (must not have been dropped by this migration):
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.anew_organizations'::regclass
--     AND tgname = 'trg_ensure_organization_entity_identity';
--
-- Expected: 1 row.
