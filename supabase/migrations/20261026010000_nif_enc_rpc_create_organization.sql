-- NIF Encryption — Phase 2 (dual-write): rpc_create_organization
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Context
-- -------
-- Prerequisite 20261023010000_fiscal_entities_nif_encryption_targets.sql added
-- fiscal_entities.nif_encrypted / fiscal_entities.nif_hash (nullable) and the
-- fiscal_entity_nif_tokens destination table. public.fiscal_entities.nif remains
-- the single source of truth; nothing here changes any read path or existing
-- business behaviour.
--
-- This migration ONLY touches rpc_create_organization, reproduced verbatim from
-- its CURRENTLY LIVE definition (base body from
-- 20260722010000_organizations_audit_bypass_and_rpcs.sql §2a, as subsequently
-- patched in-place by:
--   · 20260905010000_fix_organizations_manage_permission_mismatch.sql
--       (permission check 'organizations.manage' → 'organizations.create')
--   · 20261019010000_fix_org_create_missing_is_work_org.sql
--       (INSERT INTO anew_organizations now also sets is_work_org)
-- confirmed by reading both patches and applying them on top of the base body
-- before writing this migration, since those two migrations patch the live
-- catalog definition in place via pg_get_functiondef/EXECUTE rather than
-- shipping a textual CREATE OR REPLACE).
--
-- Change in THIS migration
-- -------------------------
-- Adds three new OPTIONAL parameters at the END of the parameter list:
--   p_nif_encrypted text DEFAULT NULL, p_nif_hash text DEFAULT NULL,
--   p_nif_tokens text[] DEFAULT NULL
-- CORRECTION: Postgres identifies a function by name + argument-TYPE list, not
-- by name alone. Appending parameters — even ones with DEFAULT values — changes
-- that type list, so CREATE OR REPLACE FUNCTION here does NOT replace the same
-- catalog object; it creates a brand-new, SEPARATE 15-arg overload alongside the
-- pre-existing 12-arg one. Left as two overloads, a call with the original 12
-- arguments would become ambiguous (all 3 new trailing params have defaults).
-- To guarantee exactly one rpc_create_organization stays in scope and existing
-- 12-argument callers keep resolving unambiguously, the OLD 12-arg overload is
-- explicitly DROPped below, AFTER the new 15-arg version has been created —
-- the same pattern already used for rpc_update_client's Bug 3 fix in
-- 20260902010000_contacts_clients_atomic_create_and_fixes.sql.
--
-- Dual-write behaviour (only engaged when the new params are actually passed):
--   · New fiscal_entities row (v_fiscal_entity_id IS NULL branch): also sets
--     nif_encrypted / nif_hash to the provided values (a brand-new row has no
--     prior value to protect, so no COALESCE needed there).
--   · Existing fiscal_entities row reused (ELSE branch): also sets
--     nif_encrypted / nif_hash via COALESCE(p_x, fiscal_entities.x) so that
--     omitting the new params (legacy callers) never overwrites an
--     already-populated encrypted value with NULL.
--   · fiscal_entity_nif_tokens: only touched when p_nif_tokens IS NOT NULL.
--     New row → INSERT one token per array element (ON CONFLICT DO NOTHING,
--     matches PK (fiscal_entity_id, token_hash)). Existing row reused →
--     DELETE all current tokens for that fiscal_entity_id first, then INSERT
--     the new set (mirrors the "delete then insert" pattern already used for
--     anew_entity_fiscal_entities primary-link upsert in this same function).
-- Nothing else changes: business logic, validations, RLS parity checks,
-- audit-diff construction and the manual audit-log call are byte-for-byte the
-- same as the live function when the three new parameters are omitted/NULL.
--
-- Prerequisites:
--   20260722010000_organizations_audit_bypass_and_rpcs.sql          — base rpc_create_organization
--   20260905010000_fix_organizations_manage_permission_mismatch.sql — organizations.create check
--   20261019010000_fix_org_create_missing_is_work_org.sql           — is_work_org on INSERT
--   20261023010000_fiscal_entities_nif_encryption_targets.sql       — nif_encrypted/nif_hash/tokens table

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
  p_addresses       jsonb,
  p_nif_encrypted   text DEFAULT NULL,
  p_nif_hash        text DEFAULT NULL,
  p_nif_tokens      text[] DEFAULT NULL
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
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.create') THEN
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
    (id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by, is_work_org)
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
     v_actor,
     p_type IN ('holding', 'empresa'))
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
      -- New fiscal_entities row: no prior nif_encrypted/nif_hash value to protect,
      -- so write the provided values directly (NULL when the caller omits them —
      -- identical to today's behaviour for legacy callers).
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by, nif_encrypted, nif_hash)
      VALUES (v_nif, nullif(p_commercial_name, ''), v_country, v_actor, p_nif_encrypted, p_nif_hash)
      RETURNING id INTO v_fiscal_entity_id;

      IF p_nif_tokens IS NOT NULL THEN
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        SELECT v_fiscal_entity_id, t
        FROM unnest(p_nif_tokens) AS t
        WHERE t IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
    ELSE
      -- Existing fiscal_entities row reused (matched by nif/country_code):
      -- COALESCE preserves any already-populated encrypted value when the caller
      -- does not pass the new parameters (full retrocompatibility).
      UPDATE public.fiscal_entities
      SET commercial_name = nullif(p_commercial_name, ''),
          updated_at = now(),
          nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash = COALESCE(p_nif_hash, nif_hash)
      WHERE id = v_fiscal_entity_id;

      IF p_nif_tokens IS NOT NULL THEN
        DELETE FROM public.fiscal_entity_nif_tokens WHERE fiscal_entity_id = v_fiscal_entity_id;
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        SELECT v_fiscal_entity_id, t
        FROM unnest(p_nif_tokens) AS t
        WHERE t IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
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

-- Old 12-arg signature is superseded by this 15-arg overload (3 new trailing
-- DEFAULT NULL params) — drop it so PostgreSQL/PostgREST don't have to
-- disambiguate two overloads with the same leading parameters.
DROP FUNCTION IF EXISTS public.rpc_create_organization(
  text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb
);

REVOKE ALL ON FUNCTION public.rpc_create_organization(
  text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb, text, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_organization(
  text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb, text, text, text[]
) TO authenticated;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Existing callers (12 positional args, no NIF-encryption params) resolve to
--    the SAME 15-arg overload created above (the old 12-arg overload was
--    explicitly DROPped, so there is no ambiguity) and behave byte-for-byte as
--    before:
--   SELECT public.rpc_create_organization('Acme', 'empresa', NULL, 'active',
--          NULL, NULL, true, NULL, '500000000', 'Acme SA', 'PT', '[]'::jsonb);
--   -- fiscal_entities row inserted with nif_encrypted/nif_hash both NULL,
--   -- exactly as before this migration.
--
-- 2. New callers passing the three extra params populate the dual-write columns
--    and fiscal_entity_nif_tokens without altering fiscal_entities.nif or any
--    other existing column/behaviour.
