-- Brands audit coverage — Wave 3
-- 2026-07-05 | Module: Brands | Wave: 3 (audit gaps, slug constraint, indexes, anon grants)
-- Forward-only migration. Do not fold into the baseline.
--
-- Gaps addressed:
--   BRANDS-DB-001 (CRITICAL)  — Global brands (organization_id IS NULL) produce zero audit
--                               entries. Fix: define a sentinel system-org UUID and route
--                               global-brand audit rows under it in a replacement trigger
--                               function fn_audit_brands_with_sentinel() so admin edits are
--                               traceable at the database layer.
--   BRANDS-DB-002 (HIGH)      — brands.slug has a global UNIQUE constraint (brands_slug_key)
--                               with no per-org scope. Drops the global constraint and adds
--                               UNIQUE (organization_id, slug) + a partial unique index
--                               for global brands (WHERE organization_id IS NULL).
--   BRANDS-DB-003 (HIGH)      — campaign_branding and form_branding still have GRANT ALL TO
--                               anon. Revokes anon DML; grants SELECT-only to anon on
--                               campaign_branding (intentional public catalogue reads) and
--                               no anon access to form_branding.
--   BRANDS-DB-004 (MEDIUM)    — fn_audit_brand_organizations() v_noise_cols contains
--                               'updated_at', which does not exist on brand_organizations.
--                               Dead code; remove it.
--   BRANDS-DB-005 (MEDIUM)    — brands.created_by has no index. Add it.
--
-- NOT addressed here (deferred / out of scope):
--   BRANDS-DB-006 (MEDIUM)    — entity_audit_log_select OR-chain architectural review.
--                               Flagged for a project-wide refactor of the permission lookup
--                               function; not addressed per-module.
--
-- Sentinel org for global-brand audit rows:
--   UUID '00000000-0000-0000-0000-000000000001' is reserved as the system sentinel.
--   This UUID is hard-coded here and in fn_audit_brands_with_sentinel(). It must
--   never be inserted into the organizations table as a real org. All audit rows
--   for global brands (organization_id IS NULL) are written with this sentinel so
--   that they are queryable via entity_audit_log without polluting any real org's
--   timeline. service_role access is required to read these sentinel rows.
--
-- Prerequisites:
--   20260705010000_brands_audit_triggers.sql (Wave 1 — defines trg_audit_brands)
--   20260705020000_brands_clear_audit_context.sql (Wave 2 — clear_audit_context function)


-- ============================================================
-- 1. Sentinel audit for global brands (BRANDS-DB-001)
-- ============================================================
-- fn_generic_entity_audit() silently skips rows when organization_id IS NULL
-- (line 229 of 20260625010000_entity_audit_log.sql). For global brands this
-- means zero audit coverage for admin writes.
--
-- Strategy: replace the brands trigger function with fn_audit_brands_with_sentinel()
-- which mirrors fn_generic_entity_audit() exactly but substitutes a fixed sentinel
-- UUID when v_org_id IS NULL, then writes the audit row tagged as source 'system'.
--
-- The sentinel UUID '00000000-0000-0000-0000-000000000001' is a reserved constant.
-- No real organization may have this id.

CREATE OR REPLACE FUNCTION public.fn_audit_brands_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global brands (organization_id IS NULL).
  -- Must never match a real org.  Read-only via service_role.
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

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

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- brands has no separate entity_id column; the row id serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global brands ───────────────────────────────
  -- Global brands have organization_id IS NULL.  Use the sentinel so the audit
  -- row is still written and is queryable; tag source as 'system' when no
  -- explicit source was set, to distinguish admin-via-sentinel rows from normal
  -- org-scoped writes.
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

  -- ── Build payload ─────────────────────────────────────────────────────────
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

  -- ── Write audit row ───────────────────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.fn_audit_brands_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_brands_with_sentinel() TO service_role;

-- Replace the brands trigger to use the sentinel-aware function.
-- Wave 1 registered trg_audit_brands → fn_generic_entity_audit().
-- Drop and recreate to point at the new function.
DROP TRIGGER IF EXISTS trg_audit_brands ON public.brands;
CREATE TRIGGER trg_audit_brands
  AFTER INSERT OR UPDATE OR DELETE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_brands_with_sentinel();


-- ============================================================
-- 2. Fix fn_audit_brand_organizations noise cols (BRANDS-DB-004)
-- ============================================================
-- brand_organizations schema: id, brand_id, organization_id, created_at, created_by
-- The table has no updated_at column. Remove it from v_noise_cols to eliminate dead code.
-- Full replacement via CREATE OR REPLACE; logic is otherwise identical to Wave 1.

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
  -- brand_organizations has no updated_at column; only created_at is noise.
  v_noise_cols     text[] := ARRAY['created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_brand_id       uuid;
BEGIN

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve brand_id ─────────────────────────────────────────────────────
  v_brand_id := COALESCE(
    (to_jsonb(NEW) ->> 'brand_id')::uuid,
    (to_jsonb(OLD) ->> 'brand_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent brand ────────────────
  IF v_brand_id IS NOT NULL THEN
    SELECT b.organization_id, b.id
    INTO   v_org_id, v_entity_id
    FROM   public.brands b
    WHERE  b.id = v_brand_id
    LIMIT  1;
  END IF;

  -- Global brand: junction rows that link a global brand to an org are not
  -- audited in the org-scoped log (the parent brand's own sentinel row captures
  -- the brand-level change; the junction link is administrative metadata).
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ─────────────────────────────────────────────────────────
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

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ───────────────────────────────────────────────────────
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
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_brand_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_brand_organizations() TO service_role;


-- ============================================================
-- 3. Per-org slug uniqueness (BRANDS-DB-002)
-- ============================================================
-- Drop the global unique constraint and replace with:
--   (a) UNIQUE (organization_id, slug) — scope slug uniqueness per org for
--       org-scoped brands. NULL, NULL pairs are excluded from this constraint
--       by Postgres UNIQUE null semantics (each NULL is distinct), so multiple
--       global brands with the same slug would be permitted without guard (b).
--   (b) Partial unique index on slug WHERE organization_id IS NULL — enforces
--       uniqueness among global brands independently of org-scoped brands.
--
-- This allows two different orgs to create a brand with slug 'nike' without
-- conflict, while still preventing duplicate slugs within the same org.

ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS "brands_slug_key";

ALTER TABLE public.brands
  ADD CONSTRAINT brands_organization_slug_key
  UNIQUE (organization_id, slug);

-- Partial index for global brands (organization_id IS NULL).
-- The UNIQUE constraint above does not enforce uniqueness for NULL-keyed rows
-- because UNIQUE NULL semantics treat each NULL as distinct.
DROP INDEX IF EXISTS public.idx_brands_global_slug_unique;
CREATE UNIQUE INDEX idx_brands_global_slug_unique
  ON public.brands (slug)
  WHERE organization_id IS NULL;


-- ============================================================
-- 4. Index on brands.created_by (BRANDS-DB-005)
-- ============================================================
-- brands.created_by is a FK to anew_users.id but has no index.
-- Queries filtering or joining on created_by (audit actor resolution,
-- user-deactivation cascade lookups) cause full sequential scans.

DROP INDEX IF EXISTS public.idx_brands_created_by;
CREATE INDEX idx_brands_created_by
  ON public.brands (created_by);


-- ============================================================
-- 5. Tighten anon grants on campaign_branding / form_branding (BRANDS-DB-003)
-- ============================================================
-- Baseline has GRANT ALL TO anon on both tables.
-- Wave 0 only revoked anon from brands and brand_organizations.
-- campaign_branding has a campaign_branding_public_select policy (USING (true))
-- that permits unauthenticated reads for active campaigns — this is intentional
-- for public catalogue use cases, but the grant should be SELECT-only, not ALL.
-- form_branding has no public-read use case; anon access is fully revoked.

REVOKE ALL ON TABLE public.campaign_branding FROM anon;
REVOKE ALL ON TABLE public.form_branding     FROM anon;

-- campaign_branding: restore SELECT-only for anon (public catalogue reads).
-- DML policies already specify TO authenticated, so no data-write risk.
GRANT SELECT ON TABLE public.campaign_branding TO anon;

-- form_branding: no anon access at all.
-- No policy grants SELECT TO anon on form_branding, so this REVOKE + no-grant
-- closes the table-privilege surface entirely for unauthenticated clients.


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm trg_audit_brands now uses fn_audit_brands_with_sentinel:
--
--   SELECT tgname, p.proname AS function_name
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid = 'public.brands'::regclass
--     AND t.tgname = 'trg_audit_brands';
--
-- Expected: function_name = 'fn_audit_brands_with_sentinel'
--
-- 2. Confirm slug constraint replaced:
--
--   SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'public.brands'::regclass
--     AND conname IN ('brands_slug_key', 'brands_organization_slug_key');
--
-- Expected: brands_slug_key absent; brands_organization_slug_key present (type u).
--
-- 3. Confirm partial unique index present:
--
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'brands' AND indexname = 'idx_brands_global_slug_unique';
--
-- 4. Confirm anon grants:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('campaign_branding', 'form_branding')
--     AND grantee = 'anon'
--   ORDER BY table_name, privilege_type;
--
-- Expected: campaign_branding → SELECT only; form_branding → no rows.
