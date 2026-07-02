-- Marcas — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-07 | Module: Marcas — brands + brand_organizations
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on the Brands module is issued from the frontend as SEVERAL
-- independent Supabase calls, each its own Postgres transaction:
--   · create : INSERT brands  +  UPSERT N × brand_organizations                     (handleSubmit)
--   · update : UPDATE brands   +  UPSERT N × brand_organizations  +  DELETE stale    (handleSubmit)
--   · delete : DELETE brands                                                          (handleDelete)
--   · bulk   : UPDATE/DELETE N × brands via useBulkActions (status / delete / org).
-- Every audited table has an AFTER trigger that writes to entity_audit_log
-- (fn_audit_brands_with_sentinel on brands, fn_audit_brand_organizations on
--  brand_organizations), so a single "save brand" that also rewrites the junction
-- produces N audit rows (one per table touched, sometimes several for the junction
-- rewrite) when the business intent is exactly ONE audit entry.
--
-- Solution
-- --------
-- The audit-bypass FOUNDATION already exists — created by the Roles module in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql (grep for "app.audit_bypass" /
-- "fn_manual_audit_log" confirms it). It provides:
--   · The per-transaction GUC `app.audit_bypass`. When set to 'on' (SET LOCAL), guarded
--     audit trigger functions short-circuit and write nothing.
--   · fn_manual_audit_log(p_table_name, p_entity_id, p_organization_id, p_operation,
--     p_changed_fields, p_source) — writes exactly ONE row to entity_audit_log, reusing the
--     SAME author-resolution chain as the trigger functions (app.audit_user_id GUC →
--     current_business_user_id() → anew_users via auth.uid()). Never raises.
-- We REUSE it here; we do NOT recreate it. This module creates NO foundation.
--
-- This migration:
--   1. Adds the audit-bypass guard to the TWO audit trigger functions that fire on the
--      tables these RPCs write to — they did NOT have it yet (only the Roles trigger
--      functions and fn_generic_entity_audit were guarded in 20260719010000):
--        · fn_audit_brands_with_sentinel()   (brands)
--        · fn_audit_brand_organizations()     (brand_organizations)
--      CREATE OR REPLACE only; bodies are otherwise byte-identical to
--      20260705030000_brands_audit_coverage.sql. The triggers themselves are NOT touched.
--   2. Adds RPCs that reproduce, field-for-field, condition-for-condition, what
--      Brands.tsx / useBulkActions.ts do today, each inside a single transaction with
--      app.audit_bypass = 'on', accumulate a combined diff across BOTH tables
--      ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE per action.
--
--      Single-row actions (mirror src/pages/Brands.tsx):
--        · rpc_create_brand       — INSERT brands + UPSERT brand_organizations
--        · rpc_update_brand       — UPDATE brands + UPSERT + prune stale brand_organizations
--        · rpc_delete_brand       — DELETE brands (scoped by active org)
--
--      Bulk actions (mirror src/hooks/useBulkActions.ts as wired in Brands.tsx —
--      softDelete:false, organizationId = active company):
--        · rpc_bulk_status_brand  — UPDATE is_active on N brands, scoped by org
--        · rpc_bulk_delete_brand  — hard DELETE N brands, scoped by org
--        · rpc_bulk_org_brand     — UPDATE organization_id on N brands, scoped by org
--      Each bulk RPC emits ONE consolidated audit row per affected brand (the audit
--      log is per-entity; a single log row cannot represent multiple distinct entities),
--      but crucially NOT the extra junction/trigger rows that the raw multi-statement
--      path would have produced — and the whole bulk operation is one atomic transaction.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on brands / brand_organizations does NOT
-- self-enforce inside them. Each RPC therefore re-checks, explicitly, the SAME predicate
-- the RLS policies enforce today (20260705000000_brands_security_fixes.sql §2–3):
--   brands_insert : is_system_admin_user(uid)
--                   OR ( has_anew_permission(uid,'brands.edit')
--                        AND organization_id IS NOT NULL
--                        AND organization_id IN get_user_visible_org_ids(uid) )
--   brands_update : is_system_admin_user(uid)
--                   OR ( has_anew_permission(uid,'brands.edit')
--                        AND organization_id IN get_user_visible_org_ids(uid) )
--                   (both the USING pre-image and the WITH CHECK post-image org must satisfy it)
--   brands_delete : is_system_admin_user(uid)
--                   OR ( has_anew_permission(uid,'brands.edit')
--                        AND organization_id IN get_user_visible_org_ids(uid) )
--   brand_organizations_(insert|update|delete) : is_system_admin_user(uid)
--                   OR ( has_anew_permission(uid,'brands.edit')
--                        AND organization_id IN get_user_visible_org_ids(uid) )
-- The canonical write permission code for the whole brands module is 'brands.edit'
-- (see the Wave-0 header note: create/edit/delete UI gates all consolidate to brands.edit
-- as the DB write gate). Each per-company org row written to brand_organizations is
-- re-validated against get_user_visible_org_ids(uid) so a caller cannot associate a brand
-- with an org outside their scope (matching brand_organizations_insert WITH CHECK).
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant used by
-- fn_audit_brands_with_sentinel(). brands.organization_id is nullable (global brands);
-- the manual audit row is routed under the sentinel exactly like the trigger would, so it
-- lands in the SAME place. Never insert this UUID into anew_organizations. Note: the FE
-- create/update always sets organization_id = active company (non-NULL), so the sentinel
-- path is defensive only for these RPCs.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log
--   20260705010000_brands_audit_triggers.sql        — fn_audit_brand_organizations() (v1)
--   20260705030000_brands_audit_coverage.sql        — fn_audit_brands_with_sentinel(),
--                                                      fn_audit_brand_organizations() (v2)
--   20260705000000_brands_security_fixes.sql         — the RLS policies mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log() (FOUNDATION, reused)
--   20260615130000_baseline_new_database.sql         — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      is_system_admin_user()


-- ============================================================
-- 1a. fn_audit_brands_with_sentinel() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260705030000_brands_audit_coverage.sql §1 except for the
-- new guard as the first statement. The guard must run BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_audit_brands_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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

REVOKE ALL ON FUNCTION public.fn_audit_brands_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_brands_with_sentinel() TO service_role;


-- ============================================================
-- 1b. fn_audit_brand_organizations() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260705030000_brands_audit_coverage.sql §2 except for the
-- new guard as the first statement.

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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
  -- audited in the org-scoped log.
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
-- 2a. rpc_create_brand(...)
-- ============================================================
-- Mirrors the create branch of handleSubmit() in src/pages/Brands.tsx:
--   · slug := provided slug OR generateSlug(name) (the FE computes it; passed in already resolved).
--   · brandPayload = { name, slug, is_active = true, organization_id = active company,
--                      description?, website?, logo_url? } and, for INSERT, created_by = business user.
--     Optional fields are only present when non-empty in the FE; here we translate '' → NULL so an
--     omitted-in-FE field lands as NULL (equivalent to "key absent" for these nullable columns).
--   · brand_organizations UPSERT for each selected company id (onConflict brand_id,organization_id,
--     ignoreDuplicates) with created_by = business user. On create there are no stale rows to prune.
-- The FE performs insert-then-upsert across two audit windows; the single transaction here gives
-- that atomicity for free and emits exactly ONE audit row.
-- Returns the created brands row.
--
-- Authorization mirrors brands_insert + brand_organizations_insert RLS.

CREATE OR REPLACE FUNCTION public.rpc_create_brand(
  p_name            text,
  p_slug            text,
  p_description     text,
  p_website         text,
  p_logo_url        text,
  p_organization_id uuid,
  p_org_ids         uuid[]
)
RETURNS public.brands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_brand       public.brands;
  v_audit_org   uuid;
  v_diff        jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order (mirrors allCompanyIds / upsert dedup) ──
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  -- ── Authorization parity with brands_insert RLS ──────────────────────────
  -- brands_insert requires organization_id IS NOT NULL for non-admins; the FE always
  -- sets organization_id = active company.
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para criar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible too (brand_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the brand (identical column set to the FE brandPayload + created_by) ──
  INSERT INTO public.brands
    (name, slug, is_active, organization_id, description, website, logo_url, created_by)
  VALUES
    (p_name,
     p_slug,
     true,
     p_organization_id,
     nullif(p_description, ''),
     nullif(p_website, ''),
     nullif(p_logo_url, ''),
     v_actor)
  RETURNING * INTO v_brand;

  -- ── UPSERT company associations (mirrors the ignoreDuplicates upsert) ─────
  FOREACH v_org IN ARRAY v_dedup_orgs LOOP
    INSERT INTO public.brand_organizations (brand_id, organization_id, created_by)
    VALUES (v_brand.id, v_org, v_actor)
    ON CONFLICT (brand_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── Combined diff: full snapshot of created row + granted org associations ─
  v_diff := jsonb_build_object(
    'brands', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.slug)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.description)),
      'website',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.website)),
      'logo_url',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.logo_url)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.is_active)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.organization_id))
    ),
    'brand_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_dedup_orgs))
    )
  );

  -- Route global brands under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_brand.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', v_brand.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_brand;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_brand(text, text, text, text, text, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_brand(text, text, text, text, text, uuid, uuid[]) TO authenticated;


-- ============================================================
-- 2b. rpc_update_brand(...)
-- ============================================================
-- Mirrors the edit branch of handleSubmit() in src/pages/Brands.tsx:
--   · UPDATE brands SET {name, slug, is_active = true, organization_id = active company,
--       description|NULL, website|NULL, logo_url|NULL} WHERE id = editing brand
--       AND organization_id = active company.
--       (The FE scopes the update with .eq("id").eq("organization_id", activeCompany.id).
--        Note the FE slug input is DISABLED while editing, so the slug it re-sends is the
--        brand's existing slug — passing it through is a no-op in practice.)
--   · brand_organizations: UPSERT each selected company (ignoreDuplicates), THEN, when the
--     target set is non-empty, DELETE junction rows whose organization_id is NOT in the set
--     (insert-before-delete, so a failed insert never leaves the brand org-orphaned).
--     When the target set is empty, DELETE all junction rows for the brand.
-- Returns the updated brands row.
--
-- Authorization mirrors brands_update (pre + post org visible) +
-- brand_organizations_(insert|delete) RLS.

CREATE OR REPLACE FUNCTION public.rpc_update_brand(
  p_id              uuid,
  p_organization_id uuid,
  p_name            text,
  p_slug            text,
  p_description     text,
  p_website         text,
  p_logo_url        text,
  p_org_ids         uuid[]
)
RETURNS public.brands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.brands;
  v_brand       public.brands;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_old_orgs    uuid[];
  v_audit_org   uuid;
  v_diff        jsonb;
  v_brand_diff  jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order ──────────────────────────────────────
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  -- ── Authorization parity with brands_update RLS ──────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (brand_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── Snapshot old associations before the upsert/prune rewrite ─────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.brand_organizations
  WHERE  brand_id = p_id;

  -- ── UPDATE the brand (identical column set to brandPayload) ───────────────
  UPDATE public.brands
  SET name            = p_name,
      slug            = p_slug,
      is_active       = true,
      organization_id = p_organization_id,
      description     = nullif(p_description, ''),
      website         = nullif(p_website, ''),
      logo_url        = nullif(p_logo_url, '')
  WHERE id = p_id
    AND organization_id = p_organization_id
  RETURNING * INTO v_brand;

  -- ── Rewrite associations: upsert-then-prune (matches FE insert-before-delete) ──
  IF array_length(v_dedup_orgs, 1) IS NOT NULL AND array_length(v_dedup_orgs, 1) > 0 THEN
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      INSERT INTO public.brand_organizations (brand_id, organization_id, created_by)
      VALUES (p_id, v_org, v_actor)
      ON CONFLICT (brand_id, organization_id) DO NOTHING;
    END LOOP;

    DELETE FROM public.brand_organizations
    WHERE brand_id = p_id
      AND NOT (organization_id = ANY (v_dedup_orgs));
  ELSE
    -- No target companies — remove all associations (matches FE else-branch).
    DELETE FROM public.brand_organizations WHERE brand_id = p_id;
  END IF;

  -- ── Build combined diff across both tables ────────────────────────────────
  v_brand_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_brand.name THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_brand.name)));
  END IF;
  IF v_before.slug IS DISTINCT FROM v_brand.slug THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('slug',
      jsonb_build_object('old', to_jsonb(v_before.slug), 'new', to_jsonb(v_brand.slug)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_brand.description THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_brand.description)));
  END IF;
  IF v_before.website IS DISTINCT FROM v_brand.website THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('website',
      jsonb_build_object('old', to_jsonb(v_before.website), 'new', to_jsonb(v_brand.website)));
  END IF;
  IF v_before.logo_url IS DISTINCT FROM v_brand.logo_url THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('logo_url',
      jsonb_build_object('old', to_jsonb(v_before.logo_url), 'new', to_jsonb(v_brand.logo_url)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_brand.is_active THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_brand.is_active)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_brand.organization_id THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_brand.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_brand_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('brands', v_brand_diff);
  END IF;

  -- Record an associations change only when the org set actually changed (order-insensitive).
  IF EXISTS (SELECT unnest(v_old_orgs)   EXCEPT SELECT unnest(v_dedup_orgs))
     OR EXISTS (SELECT unnest(v_dedup_orgs) EXCEPT SELECT unnest(v_old_orgs)) THEN
    v_diff := v_diff || jsonb_build_object(
      'brand_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object(
          'old', to_jsonb(v_old_orgs),
          'new', to_jsonb(v_dedup_orgs)
        )
      )
    );
  END IF;

  v_audit_org := COALESCE(v_brand.organization_id, k_system_sentinel);

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behavior of the triggers.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'brands', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_brand;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_brand(uuid, uuid, text, text, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_brand(uuid, uuid, text, text, text, text, text, uuid[]) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_brand(...)
-- ============================================================
-- Mirrors handleDelete() in src/pages/Brands.tsx:
--   · DELETE FROM brands WHERE id AND organization_id = active company.
--     (The FE scopes the delete by the active company id; we take that org as a parameter
--      and enforce the same predicate so a caller cannot delete a brand whose
--      organization_id differs from the passed active org.)
--   · The junction rows in brand_organizations are removed first so the combined audit diff
--     reflects the full effect and no orphan rows remain (the FE relies on FK cascade / the
--     same DB behavior; deleting them explicitly is safe and matches the intent).
-- Returns void.
--
-- Authorization mirrors brands_delete RLS.

CREATE OR REPLACE FUNCTION public.rpc_delete_brand(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.brands;
  v_old_orgs   uuid[];
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with brands_delete RLS ──────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Snapshot associations, then delete associations + brand ───────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.brand_organizations
  WHERE  brand_id = p_id;

  DELETE FROM public.brand_organizations WHERE brand_id = p_id;
  DELETE FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;

  -- ── Combined diff: full snapshot of the removed brand + its associations ───
  v_diff := jsonb_build_object(
    'brands', jsonb_build_object(
      'name',            jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
      'slug',            jsonb_build_object('old', to_jsonb(v_before.slug), 'new', NULL),
      'description',     jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
      'website',         jsonb_build_object('old', to_jsonb(v_before.website), 'new', NULL),
      'logo_url',        jsonb_build_object('old', to_jsonb(v_before.logo_url), 'new', NULL),
      'is_active',       jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL),
      'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
    ),
    'brand_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', to_jsonb(v_old_orgs), 'new', NULL)
    )
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', p_id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_brand(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_brand(uuid, uuid) TO authenticated;


-- ============================================================
-- 2d. rpc_bulk_status_brand(...)
-- ============================================================
-- Mirrors handleBulkStatusChange('is_active') in src/hooks/useBulkActions.ts as wired
-- by Brands.tsx (organizationId = active company):
--   · UPDATE brands SET is_active = <bool> WHERE id IN (selected) AND organization_id = active org.
-- The raw path fires the brands trigger once per row. Here the whole batch is one transaction
-- with app.audit_bypass = 'on'; a consolidated UPDATE audit row is emitted per affected brand
-- (audit rows are per-entity), and NO extra junction/trigger noise is produced.
-- Returns the number of brands updated.
--
-- Authorization mirrors brands_update RLS (pre- and post-image org identical here — is_active
-- toggle does not change organization_id).

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_brand(
  p_ids             uuid[],
  p_organization_id uuid,
  p_is_active       boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- ── Authorization parity with brands_update RLS ──────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The .eq(organization_id) FE scope + RLS both require the target org be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose is_active actually flips are audited (mirrors trigger skip-on-no-change).
  FOR v_rec IN
    UPDATE public.brands b
    SET is_active = p_is_active
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.is_active IS DISTINCT FROM p_is_active
    RETURNING b.id, b.organization_id,
              (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_brand(uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_brand(uuid[], uuid, boolean) TO authenticated;


-- ============================================================
-- 2e. rpc_bulk_delete_brand(...)
-- ============================================================
-- Mirrors handleBulkDelete() in src/hooks/useBulkActions.ts (softDelete:false as wired
-- by Brands.tsx, organizationId = active company):
--   · DELETE FROM brands WHERE id IN (selected) AND organization_id = active org.
-- Junction rows for each affected brand are removed first (same rationale as rpc_delete_brand).
-- One consolidated DELETE audit row is emitted per affected brand.
-- Returns the number of brands deleted.
--
-- Authorization mirrors brands_delete RLS.

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_brand(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_before      public.brands;
  v_old_orgs    uuid[];
  v_audit_org   uuid;
  v_diff        jsonb;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- ── Authorization parity with brands_delete RLS ──────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Iterate the in-scope rows; delete junction + brand; audit once per brand ──
  FOR v_before IN
    SELECT * FROM public.brands
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
  LOOP
    SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
    INTO   v_old_orgs
    FROM   public.brand_organizations
    WHERE  brand_id = v_before.id;

    DELETE FROM public.brand_organizations WHERE brand_id = v_before.id;
    DELETE FROM public.brands
    WHERE id = v_before.id
      AND organization_id = p_organization_id;

    v_diff := jsonb_build_object(
      'brands', jsonb_build_object(
        'name',            jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
        'slug',            jsonb_build_object('old', to_jsonb(v_before.slug), 'new', NULL),
        'description',     jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
        'website',         jsonb_build_object('old', to_jsonb(v_before.website), 'new', NULL),
        'logo_url',        jsonb_build_object('old', to_jsonb(v_before.logo_url), 'new', NULL),
        'is_active',       jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL),
        'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
      ),
      'brand_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_old_orgs), 'new', NULL)
      )
    );

    v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

    PERFORM public.fn_manual_audit_log(
      'brands', v_before.id, v_audit_org, 'DELETE', v_diff, 'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_brand(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_brand(uuid[], uuid) TO authenticated;


-- ============================================================
-- 2f. rpc_bulk_org_brand(...)
-- ============================================================
-- Mirrors handleBulkCompanyChange('organization_id') in src/hooks/useBulkActions.ts as wired
-- by Brands.tsx (organizationId = active company scope filter; bulkNewCompanyId = target org):
--   · UPDATE brands SET organization_id = <new org> WHERE id IN (selected)
--       AND organization_id = active org.
-- This reassigns each in-scope brand to a new organization. One consolidated UPDATE audit row
-- is emitted per affected brand (only when organization_id actually changes).
-- Returns the number of brands updated.
--
-- Authorization mirrors brands_update RLS: the pre-image org (the scope org) AND the post-image
-- org (the new org) must BOTH be visible to the caller (USING + WITH CHECK).

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_brand(
  p_ids             uuid[],
  p_organization_id uuid,
  p_new_org_id      uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_org_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- ── Authorization parity with brands_update RLS (pre + post org visible) ──
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update (scope) org must be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update (target) org must be visible.
    IF NOT (p_new_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  FOR v_rec IN
    UPDATE public.brands b
    SET organization_id = p_new_org_id
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.organization_id IS DISTINCT FROM p_new_org_id
    RETURNING b.id, p_organization_id AS old_org, p_new_org_id AS new_org
  LOOP
    -- Audit row is routed under the NEW org (the row's post-update org), matching the
    -- trigger which reads NEW.organization_id.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_org_brand(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_org_brand(uuid[], uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of both brands trigger functions:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_brands_with_sentinel', 'fn_audit_brand_organizations')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows.
--
-- 2. A single "create brand associated with 3 companies" produces exactly ONE audit row:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'brands' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 1 + 3, despite the junction upserts).
--
-- 3. An update that only rewrites company associations yields ONE row with a
--    brand_organizations diff and no brands diff.
--
-- 4. rpc_delete_brand / rpc_update_brand on a brand whose organization_id differs from the
--    passed active org raises no_data_found; a brand outside the caller's visible orgs
--    raises insufficient_privilege — matching the RLS + FE .eq(organization_id) scoping.
--
-- 5. rpc_bulk_status_brand / rpc_bulk_delete_brand / rpc_bulk_org_brand each emit exactly
--    one audit row per affected brand and none of the junction/trigger noise the raw
--    multi-statement path produces; the whole batch is one atomic transaction.
--
-- 6. rpc_bulk_org_brand rejects a target org outside the caller's visible orgs
--    (insufficient_privilege), mirroring brands_update WITH CHECK.
