-- NIF Encryption — Phase 2 (dual-write): rpc_update_organization
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
-- This migration ONLY touches rpc_update_organization, reproduced verbatim from
-- its CURRENTLY LIVE definition (base body from
-- 20260722010000_organizations_audit_bypass_and_rpcs.sql §2b — a DISTINCT
-- function from rpc_create_organization in the SAME source file, confirmed by
-- re-reading both function bodies line-by-line before writing this migration
-- so the two are not confused — as subsequently patched in-place by:
--   · 20260905010000_fix_organizations_manage_permission_mismatch.sql
--       (permission check 'organizations.manage' → 'organizations.edit';
--        NOTE this is 'edit', NOT 'create' — rpc_update_organization's own
--        permission code, distinct from rpc_create_organization's 'create')
-- confirmed by reading that patch and applying it on top of the base body
-- before writing this migration, since that migration patches the live
-- catalog definition in place via pg_get_functiondef/EXECUTE rather than
-- shipping a textual CREATE OR REPLACE. No other migration patches
-- rpc_update_organization's body — grepped the full migrations directory to
-- confirm.
--
-- Change in THIS migration
-- -------------------------
-- Adds three new OPTIONAL parameters at the END of the parameter list:
--   p_nif_encrypted text DEFAULT NULL, p_nif_hash text DEFAULT NULL,
--   p_nif_tokens text[] DEFAULT NULL
-- CORRECTION: Postgres identifies a function by name + argument-TYPE list, not
-- by name alone. Appending parameters — even ones with DEFAULT values — changes
-- that type list, so CREATE OR REPLACE FUNCTION here does NOT replace the same
-- catalog object; it creates a brand-new, SEPARATE 16-arg overload alongside the
-- pre-existing 13-arg one. Left as two overloads, a call with the original 13
-- arguments would become ambiguous (all 3 new trailing params have defaults).
-- To guarantee exactly one rpc_update_organization stays in scope and existing
-- 13-argument callers keep resolving unambiguously, the OLD 13-arg overload is
-- explicitly DROPped below, AFTER the new 16-arg version has been created —
-- the same pattern already used for rpc_update_client's Bug 3 fix in
-- 20260902010000_contacts_clients_atomic_create_and_fixes.sql.
--
-- Dual-write behaviour (only engaged when the new params are actually passed):
--   · New fiscal_entities row (v_fiscal_entity_id IS NULL branch, isFiscal &&
--     nif path): also sets nif_encrypted / nif_hash to the provided values (a
--     brand-new row has no prior value to protect, so no COALESCE needed).
--   · Existing fiscal_entities row reused (ELSE branch): also sets
--     nif_encrypted / nif_hash via COALESCE(p_x, fiscal_entities.x) so that
--     omitting the new params (legacy callers) never overwrites an
--     already-populated encrypted value with NULL.
--   · fiscal_entity_nif_tokens: only touched when p_nif_tokens IS NOT NULL.
--     New row → INSERT one token per array element (ON CONFLICT DO NOTHING,
--     matches PK (fiscal_entity_id, token_hash)). Existing row reused →
--     DELETE all current tokens for that fiscal_entity_id first, then INSERT
--     the new set. The "remove fiscal data" branch (isFiscal false / no nif —
--     removeOrgFiscalEntity) is UNCHANGED: it only clears
--     anew_entity_fiscal_entities links and never writes fiscal_entities or
--     fiscal_entity_nif_tokens, exactly as today.
-- Nothing else changes: business logic, validations, RLS parity checks, the
-- ensureOrgEntity backfill, hierarchy re-parenting, address re-assignment,
-- audit-diff construction and the manual audit-log call are byte-for-byte the
-- same as the live function when the three new parameters are omitted/NULL.
--
-- Prerequisites:
--   20260722010000_organizations_audit_bypass_and_rpcs.sql          — base rpc_update_organization
--   20260905010000_fix_organizations_manage_permission_mismatch.sql — organizations.edit check
--   20261023010000_fiscal_entities_nif_encryption_targets.sql       — nif_encrypted/nif_hash/tokens table

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
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.edit') THEN
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
  ELSE
    -- removeOrgFiscalEntity(org): clear the fiscal links on the org's entity.
    -- Unchanged: no fiscal_entities / fiscal_entity_nif_tokens write happens here,
    -- matching the live function exactly.
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

-- Old 13-arg signature is superseded by this 16-arg overload (3 new trailing
-- DEFAULT NULL params) — drop it so PostgreSQL/PostgREST don't have to
-- disambiguate two overloads with the same leading parameters.
DROP FUNCTION IF EXISTS public.rpc_update_organization(
  uuid, text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb
);

REVOKE ALL ON FUNCTION public.rpc_update_organization(
  uuid, text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb, text, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_organization(
  uuid, text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb, text, text, text[]
) TO authenticated;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Existing callers (13 positional args, no NIF-encryption params) resolve to
--    the SAME 16-arg overload created above (the old 13-arg overload was
--    explicitly DROPped, so there is no ambiguity) and behave byte-for-byte as
--    before:
--   SELECT public.rpc_update_organization('<org-uuid>', 'Acme', 'empresa',
--          NULL, 'active', NULL, NULL, true, NULL, '500000000', 'Acme SA',
--          'PT', '[]'::jsonb);
--   -- fiscal_entities row updated with nif_encrypted/nif_hash left exactly as
--   -- they were before this call (COALESCE against NULL new params).
--
-- 2. New callers passing the three extra params populate/refresh the
--    dual-write columns and fiscal_entity_nif_tokens without altering
--    fiscal_entities.nif or any other existing column/behaviour.
--
-- 3. The isFiscal=false / no-nif branch (removeOrgFiscalEntity) never touches
--    fiscal_entities or fiscal_entity_nif_tokens, matching the live function.
