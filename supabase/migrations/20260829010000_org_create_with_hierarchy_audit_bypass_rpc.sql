-- Organizações (Organizations) — single-audit-row RPC for "create child org from
-- hierarchy sheet" (src/pages/OrganizationDetail.tsx handleCreateOrgFromSheet).
-- 2026-07-03 | Module: Organizações (Organizations)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- handleCreateOrgFromSheet (OrganizationDetail.tsx, ~line 430) is used when creating a
-- new CHILD organization directly inside an existing hierarchy/org-tree view. The user
-- experiences ONE "create organization" action, but the frontend issues up to FIVE
-- independent Supabase calls, each its own transaction:
--   1  INSERT anew_organizations (raw insert)
--   2  upsertOrgFiscalEntity (fiscal_entities + anew_entity_fiscal_entities) — only if fiscal
--   3  INSERT anew_hierarchy (raw insert, direction depends on hierarchyForm.type)
--   4  bootstrap_org_creator RPC — creator membership/role
--   5  assign_address_to_org RPC — once per valid address
-- anew_organizations carries an AFTER audit trigger (fn_audit_anew_organizations) that
-- already has the app.audit_bypass guard (added by 20260722010000). Without wrapping
-- all 5 steps in one bypassed transaction, step 1 alone still fires its own audit row,
-- and nothing today emits a manual consolidated row for this flow.
--
-- Solution
-- --------
-- rpc_create_organization_with_hierarchy(...) reproduces, field-for-field, what
-- handleCreateOrgFromSheet does today, inside ONE transaction:
--   · PERFORM set_config('app.audit_bypass','on', true) FIRST, before any DML.
--   · resolve entity_id exactly like resolveOrganizationEntityId (fiscal-match reuse or
--     new anew_entities row) — mirrors src/utils/orgEntity.ts.
--   · INSERT anew_organizations (id, name, type, description, status, sector, is_fiscal,
--     entity_id, created_by) — note: this flow has no phone field (unlike the
--     Organizations.tsx page-level create), so p_phone is NOT part of this RPC's surface.
--   · when fiscal: upsert fiscal_entities + anew_entity_fiscal_entities (delete+insert
--     primary), reproducing src/utils/orgFiscalEntity.ts upsertOrgFiscalEntity exactly,
--     including the "ambiguous match" abort when >1 fiscal_entities row matches (nif,country).
--   · INSERT anew_hierarchy — direction mirrors p_hierarchy_type ('parent' means the NEW
--     org becomes the PARENT of the current org; anything else means the new org becomes
--     the CHILD of the current org), relationship_type = 'parent_of' (byte-identical to
--     the FE's handleCreateOrgFromSheet insertData, NOT the 'parent_child' literal used by
--     the page-level rpc_create_organization — that divergence is pre-existing FE behaviour
--     and is reproduced faithfully here, not normalised).
--   · bootstrap_org_creator(new_org_id, name) — reuse existing atomic RPC verbatim.
--   · assign_address_to_org(...) per valid address — reuse existing atomic RPC verbatim.
--   · exactly ONE fn_manual_audit_log call at the end, keyed to anew_organizations,
--     self-org (organization_id = entity_id = the new org's own id), with a combined diff
--     across every touched table.
--
-- Existing business RPCs reused (unchanged, called from inside the new RPC)
-- ---------------------------------------------------------------------------
-- Both are already atomic (single transaction) and SECURITY DEFINER, and — confirmed by
-- grep — neither calls fn_manual_audit_log itself (they predate the manual-audit
-- pattern and only do plain DML). Because app.audit_bypass is SET LOCAL'd at the top of
-- THIS function's transaction, their internal DML on audited tables is silenced too, so
-- calling them here does not add any extra audit rows on top of the one below:
--   · bootstrap_org_creator(p_organization_id, p_organization_name)
--   · assign_address_to_org(p_org_id, p_street, p_number, p_floor, p_unit, p_postal_code,
--       p_city, p_district, p_country, p_extra, p_is_fiscal, p_created_by,
--       p_existing_address_id, p_existing_link_id)
-- Their own auth checks (auth.uid()-based) still fire because SECURITY DEFINER changes
-- executing privileges, NOT the JWT role.
--
-- Authorization / RLS parity
-- ---------------------------
-- SECURITY DEFINER bypasses RLS, so the RPC re-checks, explicitly, both predicates the
-- replaced raw inserts were subject to:
--   · authenticated_insert_anew_organizations: has_anew_permission(auth.uid(), 'organizations.manage')
--   · authenticated_insert_anew_hierarchy: has_anew_permission(...) AND parent_org_id IN
--     get_user_visible_org_ids(auth.uid()) — re-checked here against p_current_org_id
--     (the org the caller already has a relationship to), regardless of which side
--     (parent/child) it ends up on, since RLS itself only ever constrained parent_org_id.
-- assign_address_to_org re-checks org visibility internally (unchanged, reused verbatim).
--
-- Out of scope (unchanged)
-- -------------------------
--   · rpc_create_organization / rpc_update_organization (page-level Organizations.tsx
--     flow) and create_initial_organization / create_orgs_from_template — already
--     consolidated or already out of scope per 20260722010000. Not touched here.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql        — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      assign_address_to_org(),
--                                                      bootstrap_org_creator()
--   20260625010000_entity_audit_log.sql              — entity_audit_log
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — app.audit_bypass GUC,
--                                                      fn_manual_audit_log()
--   20260722010000_organizations_audit_bypass_and_rpcs.sql — audit-bypass guard on
--                                                      fn_audit_anew_organizations()

CREATE OR REPLACE FUNCTION public.rpc_create_organization_with_hierarchy(
  p_current_org_id  uuid,
  p_hierarchy_type  text,      -- 'parent' → new org becomes PARENT of p_current_org_id; else new org becomes CHILD
  p_name            text,
  p_type            text,
  p_description     text,
  p_status          text,
  p_sector          text,
  p_is_fiscal       boolean,
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
  v_actor            uuid;
  v_org              public.anew_organizations;
  v_new_org_id       uuid := gen_random_uuid();
  v_entity_id        uuid;
  v_nif              text := nullif(btrim(coalesce(p_nif, '')), '');
  v_country          text := coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'PT');
  v_has_fiscal       boolean;
  v_fiscal_entity_id uuid;
  v_matched_entity   uuid;
  v_addr             jsonb;
  v_parent_org_id    uuid;
  v_child_org_id     uuid;
  v_diff             jsonb;
  v_fiscal_after     jsonb;
  v_addr_after       jsonb;
  v_match_fe_id      uuid;
  v_match_fe_count   bigint;
  v_match_link_count bigint;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_current_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização de referência não indicada' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── Authorization parity with authenticated_insert_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para criar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization parity with authenticated_insert_anew_hierarchy RLS ────
  -- The raw insert this RPC replaces was subject to RLS requiring BOTH
  -- has_anew_permission(...) AND parent_org_id visible to the caller. Because
  -- this RPC is SECURITY DEFINER, RLS never runs, so we must re-check org
  -- visibility explicitly. p_current_org_id is always an org the caller
  -- already has a relationship to (it becomes either parent_org_id or
  -- child_org_id depending on p_hierarchy_type — RLS only ever constrained
  -- parent_org_id, but re-checking p_current_org_id regardless of direction
  -- closes the gap for both directions without loosening it).
  IF p_current_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem visibilidade sobre esta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_has_fiscal := COALESCE(p_is_fiscal, false) AND v_nif IS NOT NULL;

  -- ── Resolve entity (resolveOrganizationEntityId), verbatim two-step match ──
  IF v_has_fiscal THEN
    SELECT count(*) INTO v_match_fe_count
    FROM (
      SELECT fe.id FROM public.fiscal_entities fe
      WHERE fe.nif = v_nif AND fe.country_code = v_country
      LIMIT 2
    ) s;

    IF v_match_fe_count = 1 THEN
      SELECT fe.id INTO v_match_fe_id
      FROM public.fiscal_entities fe
      WHERE fe.nif = v_nif AND fe.country_code = v_country
      LIMIT 1;

      SELECT count(*) INTO v_match_link_count
      FROM (
        SELECT l.entity_id FROM public.anew_entity_fiscal_entities l
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

  -- ── INSERT the organization (identical column set to handleCreateOrgFromSheet) ──
  INSERT INTO public.anew_organizations
    (id, name, type, description, status, sector, is_fiscal, entity_id, created_by)
  VALUES
    (v_new_org_id,
     p_name,
     COALESCE(p_type, 'departamento'),
     nullif(p_description, ''),
     COALESCE(nullif(p_status, ''), 'active'),
     nullif(p_sector, ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor)
  RETURNING * INTO v_org;

  -- ── Fiscal link (upsertOrgFiscalEntity): only when hasFiscalData ─────────
  IF v_has_fiscal THEN
    SELECT count(*) INTO v_match_fe_count
    FROM (
      SELECT fe.id FROM public.fiscal_entities fe
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

  -- ── Hierarchy link — direction mirrors hierarchyForm.type in the FE ──────
  -- relationship_type = 'parent_of' matches handleCreateOrgFromSheet's insertData
  -- verbatim (distinct from the page-level rpc_create_organization's 'parent_child';
  -- pre-existing FE divergence, reproduced faithfully, not normalised here).
  IF p_hierarchy_type = 'parent' THEN
    v_parent_org_id := v_new_org_id;
    v_child_org_id  := p_current_org_id;
  ELSE
    v_parent_org_id := p_current_org_id;
    v_child_org_id  := v_new_org_id;
  END IF;

  INSERT INTO public.anew_hierarchy
    (parent_org_id, child_org_id, relationship_type, is_primary, created_by)
  VALUES
    (v_parent_org_id, v_child_org_id, 'parent_of', true, v_actor);

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

  -- ── Combined diff: full snapshot of the created org + hierarchy + fiscal + addresses ──
  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'name',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.name)),
      'type',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.type)),
      'description', jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.description)),
      'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.status)),
      'sector',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.sector)),
      'is_fiscal',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.is_fiscal)),
      'entity_id',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_org.entity_id))
    ),
    'anew_hierarchy', jsonb_build_object(
      'parent_org_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_parent_org_id)),
      'child_org_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_child_org_id))
    )
  );

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

  -- Self-org: organization_id = entity_id = the new org's own id (matches the trigger).
  PERFORM public.fn_manual_audit_log(
    'anew_organizations', v_new_org_id, v_new_org_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_organization_with_hierarchy(
  uuid, text, text, text, text, text, text, boolean, text, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_organization_with_hierarchy(
  uuid, text, text, text, text, text, text, boolean, text, text, text, jsonb
) TO authenticated;
