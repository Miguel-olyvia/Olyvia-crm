-- Users Audit Triggers — Wave 1
-- 2026-07-09 | Module: Utilizadores (Users) | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_anew_users()  — satellite-style: org resolved via JOIN to anew_memberships
--   2. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   3. REVOKE/GRANT for the new function
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql), fn_audit_product_prices()
-- (20260703010000_products_audit_triggers.sql), and fn_audit_uom_with_sentinel()
-- (20260708010000_uom_audit_triggers.sql):
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
-- Tables audited:
--   anew_memberships — fn_generic_entity_audit()  Strategy A (organization_id NOT NULL, direct column)
--                      entity_id = anew_memberships.id (no separate entity_id column).
--   anew_users       — fn_audit_anew_users()       satellite: org resolved via JOIN to anew_memberships
--                      anew_users has NO organization_id column and its entity_id column points to
--                      anew_entities (not a role/lead/contact/client), so the generic function's
--                      Strategy B/C org lookups do not resolve it. A dedicated function resolves the
--                      org via the user's active membership.
--
-- anew_users org resolution (module-specific note):
--   anew_users has no organization_id. Org is resolved via:
--     JOIN public.anew_memberships m ON m.user_id = anew_users.id
--   A single user may belong to multiple organisations. We select the most relevant
--   membership deterministically:
--     · prefer status = 'active'
--     · then the most recently created membership (created_at DESC)
--   entity_id is set to anew_users.id so audit rows group under the user timeline.


-- ============================================================
-- 1. fn_audit_anew_users()
-- ============================================================
-- Handles: anew_users
--
-- anew_users columns (from baseline): id, email, name, phone, avatar_url, status,
--   created_at, updated_at, created_by, auth_user_id, description, position,
--   location, custom_attributes, template_id, entity_id, has_completed_welcome,
--   registration_origin, email_signature.
--
-- org is resolved via JOIN public.anew_memberships ON m.user_id = anew_users.id.
-- entity_id = anew_users.id.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'.

CREATE OR REPLACE FUNCTION public.fn_audit_anew_users()
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
  v_row_id         uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve the anew_users row id from whichever side is available ───────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_row_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );
  v_entity_id := v_row_id;

  -- ── Resolve organization_id via the user's membership ────────────────────
  -- anew_users has no organization_id column; resolve via anew_memberships.
  -- A user may belong to several orgs; prefer the active, most recent membership.
  IF v_row_id IS NOT NULL THEN
    SELECT m.organization_id
    INTO   v_org_id
    FROM   public.anew_memberships m
    WHERE  m.user_id = v_row_id
    ORDER BY (m.status = 'active') DESC, m.created_at DESC
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently (user with no membership yet).
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

REVOKE ALL ON FUNCTION public.fn_audit_anew_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_users() TO service_role;


-- ============================================================
-- 2. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).

-- anew_memberships — Strategy A: organization_id NOT NULL (direct column).
-- Uses the shared fn_generic_entity_audit(); entity_id falls back to the row's
-- own id (no separate entity_id column on anew_memberships), same acceptable
-- pattern as product_organizations / service_organizations.
DROP TRIGGER IF EXISTS trg_audit_anew_memberships ON public.anew_memberships;
CREATE TRIGGER trg_audit_anew_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_memberships
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- anew_users — satellite via user membership → anew_memberships.organization_id.
-- Dedicated function because anew_users has no organization_id and its entity_id
-- points to anew_entities (not resolvable by the generic function's role lookup).
DROP TRIGGER IF EXISTS trg_audit_anew_users ON public.anew_users;
CREATE TRIGGER trg_audit_anew_users
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_users
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_anew_users();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm triggers are registered and point to the expected functions:
--
--   SELECT t.tgname, p.proname AS function_name, t.tgenabled
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid IN ('public.anew_users'::regclass, 'public.anew_memberships'::regclass)
--     AND t.tgname LIKE '%audit%'
--   ORDER BY t.tgname;
--
-- Expected:
--   trg_audit_anew_memberships → fn_generic_entity_audit, enabled
--   trg_audit_anew_users       → fn_audit_anew_users,     enabled
--
-- 2. Confirm no duplicate audit trigger on either table:
--
--   SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
--   WHERE tgrelid IN ('public.anew_users'::regclass, 'public.anew_memberships'::regclass)
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one audit trigger per table.
