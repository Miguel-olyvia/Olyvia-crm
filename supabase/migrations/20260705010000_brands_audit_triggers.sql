-- Brands Audit Triggers — Wave 1
-- 2026-07-05 | Module: Brands | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_brand_organizations() — satellite: org+entity via brand_id → brands
--   2. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   3. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the satellite patterns in
-- fn_audit_bundle_choice_groups() / fn_audit_bundle_components()
-- (20260704010000_bundles_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites: 20260705000000_brands_security_fixes.sql (Wave 0)
--   Wave 0 must be applied first: GRANT/REVOKE on brand tables and RLS policies
--   must be in place before audit triggers are registered.
--
-- Tables audited:
--   brands              — fn_generic_entity_audit()           Strategy A
--                         organization_id column is nullable.
--                         fn_generic_entity_audit() skips silently when org IS NULL
--                         (line 229: "Cannot determine org — skip silently").
--                         Global brands (org_id IS NULL) produce no audit row.
--                         This is the intended behaviour per module design notes:
--                         global brands are system-managed; their edits are visible
--                         via service_role access logs, not the org-scoped audit log.
--                         entity_id falls back to brands.id (no separate entity_id column).
--
--   brand_organizations — fn_audit_brand_organizations()      satellite via brand_id → brands
--                         brand_organizations.organization_id IS NOT NULL (junction table),
--                         but fn_generic_entity_audit() resolves org from
--                         NEW/OLD.organization_id directly (Strategy A). However, the entity_id
--                         on brand_organizations is the row's own id, not the parent brand's id,
--                         which would scatter audit rows across many entity timelines.
--                         A satellite function is used to group brand_organizations changes
--                         under the parent brand's entity timeline (entity_id = brands.id),
--                         matching the bundle_choice_groups / bundle_components pattern.
--
-- Gaps addressed:
--   BRANDS-001 (CRITICAL) — no audit trigger on brands
--   BRANDS-002 (CRITICAL) — no audit trigger on brand_organizations
--   BRANDS-AUDIT-001 through BRANDS-AUDIT-006 — frontend audit context calls are fixed
--     separately in Brands.tsx and useBulkActions.ts; this migration provides the
--     database-side trigger that those context calls will populate.
--
-- Duplicate trigger check:
--   The baseline registers only one trigger on brands:
--     update_brands_updated_at  (BEFORE UPDATE)
--   No audit triggers exist on brands or brand_organizations at this timestamp.
--   DROP IF EXISTS guards below make the registrations idempotent.
--
-- Noise columns excluded from UPDATE diff (fn_audit_brand_organizations):
--   'updated_at', 'created_at'


-- ============================================================
-- 1. fn_audit_brand_organizations()
-- ============================================================
-- Handles: brand_organizations
--
-- brand_organizations columns:
--   id, brand_id, organization_id, created_at, created_by
--
-- org and entity are resolved via: JOIN public.brands ON brands.id = brand_id
--   organization_id → brands.organization_id  (may be NULL for global brands)
--   entity_id       → brands.id               (groups audit rows under the brand
--                                              entity timeline in the UI)
--
-- If the parent brand is a global brand (organization_id IS NULL), the trigger
-- skips silently — consistent with the brands trigger behaviour and with
-- fn_generic_entity_audit() line 229.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_brand_organizations()
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
  v_brand_id       uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve brand_id from whichever side is available ───────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_brand_id := COALESCE(
    (to_jsonb(NEW) ->> 'brand_id')::uuid,
    (to_jsonb(OLD) ->> 'brand_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent brand ──────────────
  -- entity_id is set to the parent brand's id so that audit rows for
  -- brand_organizations changes group under the brand entity timeline in the UI.
  IF v_brand_id IS NOT NULL THEN
    SELECT b.organization_id, b.id
    INTO   v_org_id, v_entity_id
    FROM   public.brands b
    WHERE  b.id = v_brand_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently.
  -- This covers global brands (brands.organization_id IS NULL): junction rows
  -- that link a global brand to an org are not audited in the org-scoped log.
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

REVOKE ALL ON FUNCTION public.fn_audit_brand_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_brand_organizations() TO service_role;


-- ============================================================
-- 2. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).
--
-- Existing triggers on these tables (BEFORE UPDATE, updated_at maintenance):
--   update_brands_updated_at — BEFORE UPDATE, fires first, harmless
-- brand_organizations has no existing triggers.
--
-- Alphabetical execution order (same timing, same event):
--   trg_audit_* names sort after update_* names → audit triggers fire second,
--   which is correct (they see the final updated_at value in the row).

-- brands — Strategy A: organization_id nullable.
-- fn_generic_entity_audit() skips silently when organization_id IS NULL
-- (baseline fn body: "Cannot determine org — skip silently").
-- entity_id falls back to brands.id (no separate entity_id column on brands).
DROP TRIGGER IF EXISTS trg_audit_brands ON public.brands;
CREATE TRIGGER trg_audit_brands
  AFTER INSERT OR UPDATE OR DELETE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- brand_organizations — satellite via brand_id → brands.
-- entity_id is set to the parent brand's id inside fn_audit_brand_organizations().
DROP TRIGGER IF EXISTS trg_audit_brand_organizations ON public.brand_organizations;
CREATE TRIGGER trg_audit_brand_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.brand_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_brand_organizations();


-- ============================================================
-- 3. Verification notes (for human review, not executed)
-- ============================================================
-- After applying, verify trigger registrations:
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.brands'::regclass,
--     'public.brand_organizations'::regclass
--   )
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected output (3 rows total):
--   trg_audit_brands                | brands              | enabled
--   update_brands_updated_at        | brands              | enabled
--   trg_audit_brand_organizations   | brand_organizations | enabled
--
-- Verify no duplicate trigger exists on brands:
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.brands'::regclass
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one row — trg_audit_brands.
