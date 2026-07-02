-- Organizações (Organizations) — audit-bypass guard on the dedicated org audit
-- trigger functions + single-log RPCs for create / update / delete.
-- 2026-07-22 | Module: Organizações (Organizations)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- One user action in src/pages/Organizations.tsx (handleCreate / handleUpdate /
-- handleConfirmDelete, each wrapped in withAuditContext) is issued from the frontend
-- as SEVERAL independent Supabase calls, each its own Postgres transaction. The
-- survey identified up to 6 separate calls per "save organization":
--   1  UPDATE/INSERT anew_organizations
--   2  ensureOrgEntity → SELECT + (INSERT anew_entities) + UPDATE anew_organizations.entity_id
--   3  upsertOrgFiscalEntity / removeOrgFiscalEntity → fiscal_entities + anew_entity_fiscal_entities
--   4  anew_hierarchy (via unlink_organization_node / move_organization_node RPCs)
--   5  anew_org_addresses (DELETE + assign_address_to_org RPC per address)
--   6  anew_addresses (INSERT inside assign_address_to_org)
--
-- Of the tables touched, these carry AFTER audit triggers that write to
-- entity_audit_log:
--   anew_organizations  → fn_audit_anew_organizations()   (dedicated; self-org: org_id = entity_id = id)
--   anew_org_addresses  → fn_audit_anew_org_addresses()    (dedicated; org via org_id → anew_organizations)
--   anew_entities       → fn_generic_entity_audit()         (generic; already guarded by 20260719010000)
-- (anew_hierarchy, anew_entity_fiscal_entities, fiscal_entities and anew_addresses
--  carry NO audit trigger, so they never produced log rows. NOTE: the module survey
--  named an "anew_org_fiscal_entities" table — it does NOT exist; the fiscal link is
--  stored per-entity in anew_entity_fiscal_entities + fiscal_entities, confirmed against
--  the baseline. This migration uses the real table names.)
-- Result: one "save organization" produces many entity_audit_log rows (organizations
-- UPDATE + org_addresses INSERT/DELETE per address + entity INSERT) when the business
-- intent is exactly one.
--
-- Solution
-- --------
-- 1. Foundation reuse (NOT recreated here). The app.audit_bypass GUC + reusable
--    fn_manual_audit_log(...) were introduced by the Roles module migration
--    20260719010000_roles_audit_bypass_and_rpcs.sql, which also added the bypass
--    guard to fn_generic_entity_audit() (covering anew_entities). A grep for
--    "app.audit_bypass" / "fn_manual_audit_log" confirms they already exist; they are
--    reused verbatim. The ONLY audited tables in this module whose trigger functions
--    still lack the guard are anew_organizations (fn_audit_anew_organizations) and
--    anew_org_addresses (fn_audit_anew_org_addresses). §1 below adds the guard to both.
--
-- 2. rpc_create_organization / rpc_update_organization / rpc_delete_organization
--    reproduce, field-for-field / condition-for-condition, what the Organizations.tsx
--    handlers do today — each inside ONE transaction with app.audit_bypass = 'on' —
--    accumulate a combined diff across every touched table ({table:{col:{old,new}}}),
--    and call fn_manual_audit_log ONCE keyed to anew_organizations.
--
-- Existing business RPCs reused (unchanged, called from inside the new RPCs)
-- -------------------------------------------------------------------------
-- These are already atomic (single transaction) and SECURITY DEFINER. Rather than
-- duplicating their logic (module note: reuse existing RPCs), the new RPCs call them
-- while app.audit_bypass='on', so their internal DML on audited tables is silenced and
-- the whole action still yields ONE consolidated audit row:
--   · assign_address_to_org(...)     — address dedup + anew_org_addresses/anew_addresses writes
--   · move_organization_node(...)    — cycle-safe re-parent in anew_hierarchy
--   · unlink_organization_node(...)  — remove hierarchy link
--   · bootstrap_org_creator(...)     — creator membership/role bootstrap (create only)
--   · delete_organization_subtree(...) — recursive cascade DELETE of the subtree
-- All of them run in the SAME transaction as the caller, so set_config(...,true)
-- (SET LOCAL) applies to their DML too. Their own auth checks (auth.uid() based)
-- still fire because SECURITY DEFINER changes executing privileges, NOT the JWT role.
-- delete_organization_subtree is confirmed atomic and unchanged; it is wrapped (not
-- modified) so the cascade behaviour is preserved exactly.
--
-- Known pre-existing inconsistency (reproduced faithfully, NOT fixed here)
-- ------------------------------------------------------------------------
-- The hierarchy relationship_type differs between the create and update flows in the
-- CURRENT system, and this migration reproduces that difference on purpose:
--   · create: Organizations.tsx (line ~397) inserts anew_hierarchy directly with
--     relationship_type = 'parent_child'  → rpc_create_organization inserts 'parent_child'.
--   · update: the FE re-parents via move_organization_node (baseline), which writes
--     relationship_type = 'parent_of'     → rpc_update_organization calls the same RPC,
--     so the value stays 'parent_of'.
-- This 'parent_child' vs 'parent_of' divergence is inherited from the existing app
-- behaviour, not introduced here. Normalising it is a separate data/behaviour change and
-- is intentionally out of scope for this audit-consolidation migration.
--
-- Out of scope (documented, unchanged)
-- ------------------------------------
--   · create_initial_organization / create_orgs_from_template — bootstrap flows taken
--     when the caller has NO organizations.create permission (isInitialOrganizationCreation)
--     or uses a template. They are dedicated SECURITY DEFINER RPCs with their own auth
--     model (self-bootstrap of the first org / template expansion) and already funnel
--     through set_audit_context / withAuditContext. Consolidating those is a separate change.
--   · unlink / link (handleConfirmUnlink / handleConfirmLink) standalone actions — these
--     reuse unlink_organization_node / move_organization_node directly and also touch
--     anew_memberships (which has its own audit via fn_generic_entity_audit). Left as-is;
--     this migration targets the create/update/delete "save organization" flows named in
--     the module survey.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on the touched tables does NOT self-enforce
-- inside them. Each RPC re-checks, explicitly, the SAME predicates the RLS policies
-- enforce today (baseline 20260615130000):
--   authenticated_insert_anew_organizations : has_anew_permission(auth.uid(),'organizations.manage')
--                                              OR first-org bootstrap EXISTS(...) — the RPC path
--                                              requires organizations.manage (bootstrap is the
--                                              separate create_initial_organization flow, out of scope).
--   authenticated_update_anew_organizations : id IN get_user_visible_org_ids(auth.uid())
--                                              AND has_anew_permission(auth.uid(),'organizations.manage')
--   authenticated_delete_anew_organizations : id IN get_user_visible_org_ids(auth.uid())
--                                              AND has_anew_permission(auth.uid(),'organizations.manage')
-- The reused RPCs additionally re-check org visibility (assign_address_to_org) or
-- existence (move/unlink/delete), so those writes remain gated exactly as before.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log + fn_generic_entity_audit()
--   20260711010000_organizations_audit_triggers.sql — fn_audit_anew_organizations(), fn_audit_anew_org_addresses()
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass guard on fn_generic_entity_audit()
--                                                      + fn_manual_audit_log()
--   20260615130000_baseline_new_database.sql        — has_anew_permission(), current_business_user_id(),
--                                                      get_user_visible_org_ids(), assign_address_to_org(),
--                                                      move_organization_node(), unlink_organization_node(),
--                                                      bootstrap_org_creator(), delete_organization_subtree()


-- ============================================================
-- 1a. fn_audit_anew_organizations() — add audit-bypass guard at the top
-- ============================================================
-- Body byte-identical to 20260711010000_organizations_audit_triggers.sql §1 except
-- for the new guard as the FIRST statement (before any other logic). CREATE OR REPLACE
-- only; the trg_audit_anew_organizations trigger itself is NOT touched.

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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_organizations() TO service_role;


-- ============================================================
-- 1b. fn_audit_anew_org_addresses() — add audit-bypass guard at the top
-- ============================================================
-- Body byte-identical to 20260711010000_organizations_audit_triggers.sql §2 except
-- for the new guard as the FIRST statement. CREATE OR REPLACE only; the
-- trg_audit_anew_org_addresses trigger itself is NOT touched.

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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id from whichever side is available ──────────────────────
  v_org_ref := COALESCE(
    (to_jsonb(NEW) ->> 'org_id')::uuid,
    (to_jsonb(OLD) ->> 'org_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent organization ────────
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
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_org_addresses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_org_addresses() TO service_role;


-- ============================================================
-- 2a. rpc_create_organization(...)
-- ============================================================
-- Mirrors the main branch of handleCreate in src/pages/Organizations.tsx
-- (lines ~316-427, the NON-initial, NON-template path):
--   · resolve typeToUse (formData.type === 'other' ? customType : type)
--   · entityId = resolveOrganizationEntityId({ orgName, createdBy, nif })
--       → reuse an existing entity via a unique (nif,country) fiscal match, else INSERT
--         a fresh anew_entities row (type 'organization', status 'active').
--   · INSERT anew_organizations {id, name, type, description|null, status,
--                                sector (only when no parent), phone|null, is_fiscal, entity_id, created_by}
--   · when fiscal: upsert fiscal_entities + anew_entity_fiscal_entities (delete+insert primary)
--   · when parentId: INSERT anew_hierarchy (parent_child, is_primary)
--   · bootstrap_org_creator(org_id, name) — creator membership/role
--   · for each valid address: assign_address_to_org(...)
-- Returns the created anew_organizations row.
--
-- Address / fiscal shapes match the FE payloads verbatim. p_addresses is a jsonb array
-- of { street, number, floor, unit, postal_code, city, district, country, extra, is_fiscal }.
-- p_nif / p_commercial_name apply only when p_is_fiscal AND p_nif is non-empty (hasFiscalData).

CREATE OR REPLACE FUNCTION public.rpc_create_organization(
  p_name            text,
  p_type            text,
  p_description     text,
  p_status          text,
  p_sector          text,
  p_phone           text,
  p_is_fiscal       boolean,
  p_parent_id       uuid,
  p_nif             text,
  p_commercial_name text,
  p_country_code    text,
  p_addresses       jsonb
)
RETURNS public.anew_organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor           uuid;
  v_org             public.anew_organizations;
  v_new_org_id      uuid := gen_random_uuid();
  v_entity_id       uuid;
  v_nif             text := nullif(btrim(coalesce(p_nif, '')), '');
  v_country         text := coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'PT');
  v_has_fiscal      boolean;
  v_fiscal_entity_id uuid;
  v_matched_entity  uuid;
  v_addr            jsonb;
  v_sector          text;
  v_diff            jsonb;
  v_fiscal_after    jsonb;
  v_addr_after      jsonb;
  v_match_fe_id     uuid;
  v_match_fe_count  bigint;
  v_match_link_count bigint;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_insert_anew_organizations RLS ─
  -- (RPC path is the permissioned create; the first-org bootstrap EXISTS branch
  --  is the separate create_initial_organization flow, out of scope here.)
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para criar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_has_fiscal := COALESCE(p_is_fiscal, false) AND v_nif IS NOT NULL;

  -- ── Resolve entity (resolveOrganizationEntityId → findEntityByFiscalIdentity) ─
  -- Reproduces the TWO sequential queries in src/utils/orgEntity.ts verbatim, so the
  -- ambiguity rules match exactly (any ambiguity ⇒ null ⇒ create a fresh entity):
  --   1) fiscal_entities WHERE nif=X AND country_code=Y, LIMIT 2 → continue only if
  --      EXACTLY ONE such fiscal_entity exists globally (fiscalEntities.length === 1).
  --   2) anew_entity_fiscal_entities WHERE fiscal_entity_id = <that id>, LIMIT 2 →
  --      return entity_id only if that fiscal_entity has EXACTLY ONE link total
  --      (links.length === 1), regardless of which/how many entity_ids it points to.
  -- The previous GROUP BY l.entity_id HAVING count(*)=1 was NOT equivalent: a
  -- fiscal_entity linked to two distinct entities (each with one link) yielded two
  -- rows and LIMIT 1 picked one arbitrarily, whereas the FE rejects (2 links ⇒ null)
  -- and creates a new entity. We now count ALL links of the single fiscal_entity.
  IF v_has_fiscal THEN
    -- Step 1: exactly one fiscal_entities row for this (nif, country)?
    SELECT count(*) INTO v_match_fe_count
    FROM (
      SELECT fe.id
      FROM public.fiscal_entities fe
      WHERE fe.nif = v_nif AND fe.country_code = v_country
      LIMIT 2
    ) s;

    IF v_match_fe_count = 1 THEN
      SELECT fe.id INTO v_match_fe_id
      FROM public.fiscal_entities fe
      WHERE fe.nif = v_nif AND fe.country_code = v_country
      LIMIT 1;

      -- Step 2: does that single fiscal_entity have exactly one link total?
      SELECT count(*) INTO v_match_link_count
      FROM (
        SELECT l.entity_id
        FROM public.anew_entity_fiscal_entities l
        WHERE l.fiscal_entity_id = v_match_fe_id
        LIMIT 2
      ) s;

      IF v_match_link_count = 1 THEN
        SELECT l.entity_id INTO v_matched_entity
        FROM public.anew_entity_fiscal_entities l
        WHERE l.fiscal_entity_id = v_match_fe_id
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_matched_entity IS NOT NULL THEN
    v_entity_id := v_matched_entity;
  ELSE
    v_entity_id := gen_random_uuid();
    INSERT INTO public.anew_entities (id, display_name, type, status, created_by)
    VALUES (v_entity_id, p_name, 'organization', 'active', v_actor);
  END IF;

  -- ── INSERT the organization (identical column set to the FE insert) ──────
  v_sector := CASE WHEN p_parent_id IS NULL THEN nullif(p_sector, '') ELSE NULL END;

  INSERT INTO public.anew_organizations
    (id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by)
  VALUES
    (v_new_org_id,
     p_name,
     p_type,
     nullif(p_description, ''),
     p_status,
     v_sector,
     nullif(btrim(coalesce(p_phone, '')), ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor)
  RETURNING * INTO v_org;

  -- ── Fiscal link (upsertOrgFiscalEntity): only when hasFiscalData ─────────
  -- Cardinality parity with src/utils/orgFiscalEntity.ts L27-53: the FE selects up to
  -- TWO fiscal_entities for (nif, country_code) and ABORTS the whole operation
  -- (throw "Fiscal entity match is ambiguous") when more than one exists. There is no
  -- UNIQUE(nif, country_code) constraint on fiscal_entities, so 2+ rows is reachable
  -- (concurrent upserts / legacy data). We must reproduce the abort, NOT pick one row
  -- arbitrarily via LIMIT 1. When exactly one exists it is updated; when none exists a
  -- fresh row is inserted (existing?.[0] ? update : insert).
  IF v_has_fiscal THEN
    SELECT count(*) INTO v_match_fe_count
    FROM (
      SELECT fe.id
      FROM public.fiscal_entities fe
      WHERE fe.nif = v_nif AND fe.country_code = v_country
      LIMIT 2
    ) s;

    IF v_match_fe_count > 1 THEN
      RAISE EXCEPTION 'Fiscal entity match is ambiguous' USING ERRCODE = 'cardinality_violation';
    END IF;

    IF v_match_fe_count = 1 THEN
      SELECT id INTO v_fiscal_entity_id
      FROM public.fiscal_entities
      WHERE nif = v_nif AND country_code = v_country
      LIMIT 1;
    ELSE
      v_fiscal_entity_id := NULL;
    END IF;

    IF v_fiscal_entity_id IS NULL THEN
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by)
      VALUES (v_nif, nullif(p_commercial_name, ''), v_country, v_actor)
      RETURNING id INTO v_fiscal_entity_id;
    ELSE
      UPDATE public.fiscal_entities
      SET commercial_name = nullif(p_commercial_name, ''), updated_at = now()
      WHERE id = v_fiscal_entity_id;
    END IF;

    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
    INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
    VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);
  END IF;

  -- ── Hierarchy: attach to parent when provided ─────────────────────────────
  IF p_parent_id IS NOT NULL THEN
    INSERT INTO public.anew_hierarchy
      (parent_org_id, child_org_id, relationship_type, is_primary, created_by)
    VALUES
      (p_parent_id, v_new_org_id, 'parent_child', true, v_actor);
  END IF;

  -- ── Creator bootstrap (membership/role) — reuse existing atomic RPC ───────
  PERFORM public.bootstrap_org_creator(v_new_org_id, p_name);

  -- ── Addresses — reuse assign_address_to_org verbatim (dedup + org visibility) ─
  IF p_addresses IS NOT NULL AND jsonb_typeof(p_addresses) = 'array' THEN
    FOR v_addr IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      CONTINUE WHEN NULLIF(v_addr ->> 'street', '') IS NULL
                 OR NULLIF(v_addr ->> 'number', '') IS NULL
                 OR NULLIF(v_addr ->> 'city', '') IS NULL
                 OR NULLIF(v_addr ->> 'postal_code', '') IS NULL;
      PERFORM public.assign_address_to_org(
        v_new_org_id,
        v_addr ->> 'street',
        v_addr ->> 'number',
        NULLIF(v_addr ->> 'floor', ''),
        NULLIF(v_addr ->> 'unit', ''),
        v_addr ->> 'postal_code',
        v_addr ->> 'city',
        NULLIF(v_addr ->> 'district', ''),
        COALESCE(NULLIF(v_addr ->> 'country', ''), 'PT'),
        NULLIF(v_addr ->> 'extra', ''),
        COALESCE((v_addr ->> 'is_fiscal')::boolean, false),
        v_actor,
        NULL,
        NULL
      );
    END LOOP;
  END IF;

  -- ── Combined diff: full snapshot of the created org + fiscal + addresses ──
  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'name',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.name)),
      'type',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.type)),
      'description', jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.description)),
      'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.status)),
      'sector',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.sector)),
      'phone',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.phone)),
      'is_fiscal',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.is_fiscal)),
      'entity_id',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.entity_id))
    )
  );

  IF p_parent_id IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('anew_hierarchy', jsonb_build_object(
      'parent_org_id', jsonb_build_object('old', NULL, 'new', to_jsonb(p_parent_id))));
  END IF;

  IF v_has_fiscal THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
             'nif', fe.nif, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
    INTO v_fiscal_after
    FROM public.anew_entity_fiscal_entities efe
    LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
    WHERE efe.entity_id = v_entity_id;
    v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
      jsonb_build_object('old', '[]'::jsonb, 'new', v_fiscal_after));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'address_id', oa.address_id, 'is_fiscal', oa.is_fiscal,
           'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
           'city', a.city, 'country', a.country) ORDER BY oa.address_id), '[]'::jsonb)
  INTO v_addr_after
  FROM public.anew_org_addresses oa
  LEFT JOIN public.anew_addresses a ON a.id = oa.address_id
  WHERE oa.org_id = v_new_org_id AND oa.valid_to IS NULL;

  IF v_addr_after <> '[]'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_org_addresses',
      jsonb_build_object('old', '[]'::jsonb, 'new', v_addr_after));
  END IF;

  -- Self-org: organization_id = entity_id = the org's own id (matches the trigger).
  PERFORM public.fn_manual_audit_log(
    'anew_organizations', v_new_org_id, v_new_org_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_organization(
  text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_organization(
  text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb
) TO authenticated;


-- ============================================================
-- 2b. rpc_update_organization(...)
-- ============================================================
-- Mirrors handleUpdate in src/pages/Organizations.tsx (lines ~440-510):
--   · ensureOrgEntity: backfill anew_entities + anew_organizations.entity_id when the
--     org has no entity yet (unique-fiscal reuse, else create); no-op when already set.
--   · UPDATE anew_organizations {name, type, description|null, status, sector (only when
--     no parent), phone|null, is_fiscal, updated_at}
--   · fiscal: when isFiscal && nif → upsertOrgFiscalEntity; else removeOrgFiscalEntity
--   · unlink_organization_node(org) — always detach current parent link first
--     (matches the FE which calls unlink unconditionally, then move when a parent is chosen)
--   · when parentId → move_organization_node(org, parentId)
--   · DELETE all anew_org_addresses for the org, then assign_address_to_org(...) per valid address
-- Returns the updated anew_organizations row.
--
-- Authorization mirrors authenticated_update_anew_organizations RLS
-- (org visible AND organizations.manage).

CREATE OR REPLACE FUNCTION public.rpc_update_organization(
  p_id              uuid,
  p_name            text,
  p_type            text,
  p_description     text,
  p_status          text,
  p_sector          text,
  p_phone           text,
  p_is_fiscal       boolean,
  p_parent_id       uuid,
  p_nif             text,
  p_commercial_name text,
  p_country_code    text,
  p_addresses       jsonb
)
RETURNS public.anew_organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor           uuid;
  v_before          public.anew_organizations;
  v_org             public.anew_organizations;
  v_entity_id       uuid;
  v_nif             text := nullif(btrim(coalesce(p_nif, '')), '');
  v_country         text := coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'PT');
  v_has_fiscal      boolean;
  v_fiscal_entity_id uuid;
  v_matched_entity  uuid;
  v_addr            jsonb;
  v_sector          text;
  v_match_fe_id     uuid;
  v_match_fe_count  bigint;
  v_match_link_count bigint;

  v_old_fiscal      jsonb;
  v_new_fiscal      jsonb;
  v_old_addresses   jsonb;
  v_new_addresses   jsonb;
  v_old_parent      uuid;
  v_new_parent      uuid;

  v_org_diff        jsonb;
  v_diff            jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load current row (before-image + guards) ─────────────────────────────
  SELECT * INTO v_before FROM public.anew_organizations WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_update_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para editar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_has_fiscal := COALESCE(p_is_fiscal, false) AND v_nif IS NOT NULL;

  -- ── ensureOrgEntity: backfill entity when the org has none ───────────────
  v_entity_id := v_before.entity_id;
  IF v_entity_id IS NULL THEN
    -- Same two-query resolution as findEntityByFiscalIdentity (see rpc_create_organization
    -- for the full rationale). handleUpdate passes nif to ensureOrgEntity as
    -- `formData.isFiscal && formData.nif?.trim() ? formData.nif : null` (Organizations.tsx
    -- line ~450), i.e. a NIF match is only attempted when isFiscal is true AND a NIF is
    -- present — exactly the hasFiscalData gate used in create. We therefore key off
    -- v_has_fiscal (p_is_fiscal AND v_nif IS NOT NULL), matching the FE precisely.
    v_matched_entity := NULL;
    IF v_has_fiscal THEN
      -- Step 1: exactly one fiscal_entities row for this (nif, country)?
      SELECT count(*) INTO v_match_fe_count
      FROM (
        SELECT fe.id
        FROM public.fiscal_entities fe
        WHERE fe.nif = v_nif AND fe.country_code = v_country
        LIMIT 2
      ) s;

      IF v_match_fe_count = 1 THEN
        SELECT fe.id INTO v_match_fe_id
        FROM public.fiscal_entities fe
        WHERE fe.nif = v_nif AND fe.country_code = v_country
        LIMIT 1;

        -- Step 2: does that single fiscal_entity have exactly one link total?
        SELECT count(*) INTO v_match_link_count
        FROM (
          SELECT l.entity_id
          FROM public.anew_entity_fiscal_entities l
          WHERE l.fiscal_entity_id = v_match_fe_id
          LIMIT 2
        ) s;

        IF v_match_link_count = 1 THEN
          SELECT l.entity_id INTO v_matched_entity
          FROM public.anew_entity_fiscal_entities l
          WHERE l.fiscal_entity_id = v_match_fe_id
          LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF v_matched_entity IS NOT NULL THEN
      v_entity_id := v_matched_entity;
    ELSE
      v_entity_id := gen_random_uuid();
      INSERT INTO public.anew_entities (id, display_name, type, status, created_by)
      VALUES (v_entity_id, p_name, 'organization', 'active', v_actor);
    END IF;

    UPDATE public.anew_organizations SET entity_id = v_entity_id, updated_at = now() WHERE id = p_id;
  END IF;

  -- ── Snapshot old fiscal / addresses / parent for the diff ────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
           'nif', fe.nif, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
  INTO v_old_fiscal
  FROM public.anew_entity_fiscal_entities efe
  LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
  WHERE efe.entity_id = v_entity_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'address_id', oa.address_id, 'is_fiscal', oa.is_fiscal,
           'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
           'city', a.city, 'country', a.country) ORDER BY oa.address_id), '[]'::jsonb)
  INTO v_old_addresses
  FROM public.anew_org_addresses oa
  LEFT JOIN public.anew_addresses a ON a.id = oa.address_id
  WHERE oa.org_id = p_id AND oa.valid_to IS NULL;

  SELECT parent_org_id INTO v_old_parent
  FROM public.anew_hierarchy WHERE child_org_id = p_id LIMIT 1;

  -- ── UPDATE the organization (identical column set to the FE update) ──────
  v_sector := CASE WHEN p_parent_id IS NULL THEN nullif(p_sector, '') ELSE NULL END;

  UPDATE public.anew_organizations
  SET name        = p_name,
      type        = p_type,
      description = nullif(p_description, ''),
      status      = p_status,
      sector      = v_sector,
      phone       = nullif(btrim(coalesce(p_phone, '')), ''),
      is_fiscal   = COALESCE(p_is_fiscal, false),
      updated_at  = now()
  WHERE id = p_id
  RETURNING * INTO v_org;

  -- ── Fiscal: upsert when isFiscal && nif, else remove (matches the FE) ────
  -- Same cardinality parity as rpc_create_organization / orgFiscalEntity.ts L27-53:
  -- ABORT ("Fiscal entity match is ambiguous") when 2+ fiscal_entities share
  -- (nif, country_code) rather than picking one via LIMIT 1. No UNIQUE(nif, country_code)
  -- constraint exists, so this state is reachable and the FE aborts on it.
  IF v_has_fiscal THEN
    SELECT count(*) INTO v_match_fe_count
    FROM (
      SELECT fe.id
      FROM public.fiscal_entities fe
      WHERE fe.nif = v_nif AND fe.country_code = v_country
      LIMIT 2
    ) s;

    IF v_match_fe_count > 1 THEN
      RAISE EXCEPTION 'Fiscal entity match is ambiguous' USING ERRCODE = 'cardinality_violation';
    END IF;

    IF v_match_fe_count = 1 THEN
      SELECT id INTO v_fiscal_entity_id
      FROM public.fiscal_entities
      WHERE nif = v_nif AND country_code = v_country
      LIMIT 1;
    ELSE
      v_fiscal_entity_id := NULL;
    END IF;

    IF v_fiscal_entity_id IS NULL THEN
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by)
      VALUES (v_nif, nullif(p_commercial_name, ''), v_country, v_actor)
      RETURNING id INTO v_fiscal_entity_id;
    ELSE
      UPDATE public.fiscal_entities
      SET commercial_name = nullif(p_commercial_name, ''), updated_at = now()
      WHERE id = v_fiscal_entity_id;
    END IF;

    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
    INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
    VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);
  ELSE
    -- removeOrgFiscalEntity(org): clear the fiscal links on the org's entity.
    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
  END IF;

  -- ── Hierarchy: unlink current parent, then move under the chosen parent ──
  -- Reuse the existing atomic RPCs verbatim (same order as the FE handler).
  PERFORM public.unlink_organization_node(p_id, v_actor);
  IF p_parent_id IS NOT NULL THEN
    PERFORM public.move_organization_node(p_id, p_parent_id, v_actor);
  END IF;

  -- ── Addresses: delete all current links, then re-assign (matches the FE) ─
  DELETE FROM public.anew_org_addresses WHERE org_id = p_id;

  IF p_addresses IS NOT NULL AND jsonb_typeof(p_addresses) = 'array' THEN
    FOR v_addr IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      CONTINUE WHEN NULLIF(v_addr ->> 'street', '') IS NULL
                 OR NULLIF(v_addr ->> 'number', '') IS NULL
                 OR NULLIF(v_addr ->> 'city', '') IS NULL
                 OR NULLIF(v_addr ->> 'postal_code', '') IS NULL;
      PERFORM public.assign_address_to_org(
        p_id,
        v_addr ->> 'street',
        v_addr ->> 'number',
        NULLIF(v_addr ->> 'floor', ''),
        NULLIF(v_addr ->> 'unit', ''),
        v_addr ->> 'postal_code',
        v_addr ->> 'city',
        NULLIF(v_addr ->> 'district', ''),
        COALESCE(NULLIF(v_addr ->> 'country', ''), 'PT'),
        NULLIF(v_addr ->> 'extra', ''),
        COALESCE((v_addr ->> 'is_fiscal')::boolean, false),
        v_actor,
        NULL,
        NULL
      );
    END LOOP;
  END IF;

  -- ── Snapshot new fiscal / addresses / parent ─────────────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
           'nif', fe.nif, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
  INTO v_new_fiscal
  FROM public.anew_entity_fiscal_entities efe
  LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
  WHERE efe.entity_id = v_entity_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'address_id', oa.address_id, 'is_fiscal', oa.is_fiscal,
           'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
           'city', a.city, 'country', a.country) ORDER BY oa.address_id), '[]'::jsonb)
  INTO v_new_addresses
  FROM public.anew_org_addresses oa
  LEFT JOIN public.anew_addresses a ON a.id = oa.address_id
  WHERE oa.org_id = p_id AND oa.valid_to IS NULL;

  SELECT parent_org_id INTO v_new_parent
  FROM public.anew_hierarchy WHERE child_org_id = p_id LIMIT 1;

  -- ── Build the combined diff across every touched table ───────────────────
  v_diff := '{}'::jsonb;

  -- anew_organizations field-level diff (same noise exclusions as the trigger)
  v_org_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_org.name THEN
    v_org_diff := v_org_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_org.name)));
  END IF;
  IF v_before.type IS DISTINCT FROM v_org.type THEN
    v_org_diff := v_org_diff || jsonb_build_object('type',
      jsonb_build_object('old', to_jsonb(v_before.type), 'new', to_jsonb(v_org.type)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_org.description THEN
    v_org_diff := v_org_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_org.description)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_org.status THEN
    v_org_diff := v_org_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_org.status)));
  END IF;
  IF v_before.sector IS DISTINCT FROM v_org.sector THEN
    v_org_diff := v_org_diff || jsonb_build_object('sector',
      jsonb_build_object('old', to_jsonb(v_before.sector), 'new', to_jsonb(v_org.sector)));
  END IF;
  IF v_before.phone IS DISTINCT FROM v_org.phone THEN
    v_org_diff := v_org_diff || jsonb_build_object('phone',
      jsonb_build_object('old', to_jsonb(v_before.phone), 'new', to_jsonb(v_org.phone)));
  END IF;
  IF v_before.is_fiscal IS DISTINCT FROM v_org.is_fiscal THEN
    v_org_diff := v_org_diff || jsonb_build_object('is_fiscal',
      jsonb_build_object('old', to_jsonb(v_before.is_fiscal), 'new', to_jsonb(v_org.is_fiscal)));
  END IF;
  IF v_before.entity_id IS DISTINCT FROM v_org.entity_id THEN
    v_org_diff := v_org_diff || jsonb_build_object('entity_id',
      jsonb_build_object('old', to_jsonb(v_before.entity_id), 'new', to_jsonb(v_org.entity_id)));
  END IF;
  IF v_org_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_organizations', v_org_diff);
  END IF;

  IF v_old_parent IS DISTINCT FROM v_new_parent THEN
    v_diff := v_diff || jsonb_build_object('anew_hierarchy', jsonb_build_object(
      'parent_org_id', jsonb_build_object('old', to_jsonb(v_old_parent), 'new', to_jsonb(v_new_parent))));
  END IF;

  IF v_old_fiscal IS DISTINCT FROM v_new_fiscal THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
      jsonb_build_object('old', v_old_fiscal, 'new', v_new_fiscal));
  END IF;

  IF v_old_addresses IS DISTINCT FROM v_new_addresses THEN
    v_diff := v_diff || jsonb_build_object('anew_org_addresses',
      jsonb_build_object('old', v_old_addresses, 'new', v_new_addresses));
  END IF;

  -- ── Emit a single consolidated audit row (only when something changed) ────
  -- Self-org: organization_id = entity_id = the org's own id (matches the trigger).
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_organizations', p_id, p_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_organization(
  uuid, text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_organization(
  uuid, text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb
) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_organization(...)
-- ============================================================
-- Mirrors handleConfirmDelete in src/pages/Organizations.tsx (lines ~514-542):
--   · delete_organization_subtree(root) — recursive cascade DELETE of the subtree
--     (anew_hierarchy links + anew_organizations rows). Confirmed already atomic in the
--     baseline; wrapped (NOT modified) so its cascade behaviour is preserved exactly.
-- The FE also client-side collects descendant ids purely for UI state; the actual delete
-- is the single subtree RPC. This RPC captures a snapshot of the removed subtree for the
-- audit diff and emits ONE consolidated DELETE row keyed to the root org.
-- Returns the array of deleted org ids (same shape delete_organization_subtree returns).
--
-- Authorization mirrors authenticated_delete_anew_organizations RLS
-- (org visible AND organizations.manage). The check is on the ROOT; the cascade removes
-- the whole subtree, matching the FE which only surfaces delete on orgs the caller can
-- act on (canDeleteOrg → organizations.delete scope). We gate on organizations.manage to
-- match the table RLS that actually governs the DELETE statement.

CREATE OR REPLACE FUNCTION public.rpc_delete_organization(
  p_root_org_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_deleted     uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_delete_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Snapshot the subtree (root + descendants) BEFORE deleting, for the diff ─
  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  -- ── Cascade delete — reuse the existing atomic RPC verbatim ──────────────
  v_deleted := public.delete_organization_subtree(p_root_org_id);

  -- ── Combined diff: full snapshot of the removed root + its subtree ────────
  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'name',   jsonb_build_object('old', to_jsonb(v_root.name), 'new', NULL),
      'type',   jsonb_build_object('old', to_jsonb(v_root.type), 'new', NULL),
      'status', jsonb_build_object('old', to_jsonb(v_root.status), 'new', NULL)
    ),
    'subtree', jsonb_build_object('old', v_subtree, 'new', NULL)
  );

  -- Self-org: organization_id = entity_id = the root org's own id.
  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'DELETE', v_diff, 'web_app'
  );

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_organization(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of the two dedicated org audit functions:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_anew_organizations', 'fn_audit_anew_org_addresses')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows. (fn_generic_entity_audit already carries the guard from
--   --            20260719010000_roles_audit_bypass_and_rpcs.sql, covering anew_entities.)
--
-- 2. A single "save organization" (org fields + fiscal + one address + re-parent)
--    produces exactly ONE audit row instead of one-per-touched-table:
--   SELECT public.rpc_update_organization('<org-uuid>', 'Acme', 'empresa', 'desc',
--          'active', NULL, '+351...', true, '<parent-uuid>', '500000000', 'Acme SA',
--          'PT', '[{"street":"Rua A","number":"1","postal_code":"1000-001","city":"Lisboa","country":"PT","is_fiscal":true}]'::jsonb);
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'anew_organizations' AND operation = 'UPDATE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not org UPDATE + N org_addresses INSERT/DELETE + entity writes).
--
-- 3. Create with fiscal + parent + address → exactly ONE anew_organizations INSERT row.
--
-- 4. Delete of a 3-org subtree → exactly ONE anew_organizations DELETE row (not 3),
--    and the subtree is fully removed by delete_organization_subtree.
--
-- 5. Calling any RPC without organizations.manage, or on an org outside the caller's
--    visible orgs (update/delete), raises insufficient_privilege and writes NOTHING —
--    matching the anew_organizations RLS policies.
