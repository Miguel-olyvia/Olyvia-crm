-- ============================================================
-- 20270108140000_criar_organizacao_sem_escalada
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D, P2 «organizations.create rebenta sempre» e o risco latente.
-- O problema: bootstrap_org_creator dava ao papel org_admin da organização nova TODAS as anew_permissions, incluindo system.manage,
--   que o gatilho fn_role_permissions_reservadas recusa -> criar organizações (rpc_create_organization,
--   rpc_create_organization_with_hierarchy e o primeiro registo create_initial_organization) falhava sempre, também ao super_admin.
--   Tirar só o system.manage abria uma escalada: quem tivesse organizations.create ganhava todas as permissões.
-- O que muda
--   - bootstrap_org_creator: auto-registo e administrador de sistema ficam com todas menos system.manage; os outros, só com as
--     permissões que já têm sobre as organizações abrangidas (ver o comentário na função) - sem ganhar poder. can_sign_contracts
--     só se quem cria também pode assinar.
--   - rpc_create_organization: com mãe (p_parent_id), organizations.create nessa mãe ou acima (antes não se via nada da mãe).
--   - rpc_create_organization_with_hierarchy: organizations.create na organização de referência ou acima; se a nova for MÃE
--     dela, também organizations.edit nela ou acima (antes bastava a permissão em qualquer organização + visível).
-- CREATE OR REPLACE a partir do texto vivo (guardas md5).
-- Reversão (só como migration nova): repor as 3 funções com o texto de 5/11/2026.
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_create_organization(text,text,text,text,text,text,boolean,uuid,text,text,text,jsonb,text,text,text[])'::regprocedure)) <> 'e7d6e09f41c661641c37064dfcccf606'
     OR md5(pg_get_functiondef('public.rpc_create_organization_with_hierarchy(uuid,text,text,text,text,text,text,boolean,text,text,text,jsonb,text,text,text[])'::regprocedure)) <> '0ec44e523f768af622a98d81bba9be97'
     OR md5(pg_get_functiondef('public.bootstrap_org_creator(uuid,text)'::regprocedure)) <> 'ebaef3f1971526162ee30b7e34d0d207' THEN
    RAISE EXCEPTION 'GUARDA: uma das funções mudou desde a leitura (5/11/2026)';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.rpc_create_organization(p_name text, p_type text, p_description text, p_status text, p_sector text, p_phone text, p_is_fiscal boolean, p_parent_id uuid, p_nif text, p_commercial_name text, p_country_code text, p_addresses jsonb, p_nif_encrypted text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_nif_tokens text[] DEFAULT NULL::text[])
 RETURNS anew_organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 20270108140000: pendurar a nova organização numa mãe pede organizations.create nessa mãe ou acima. Antes não se verificava
  --   nada sobre a mãe (nem a visibilidade): quem criava ficava administrador de uma filha de qualquer organização e passava a
  --   ver a mãe (a visibilidade sobe).
  IF p_parent_id IS NOT NULL
     AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.create', p_parent_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar organizações debaixo desta organização' USING ERRCODE = 'insufficient_privilege';
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_organization_with_hierarchy(p_current_org_id uuid, p_hierarchy_type text, p_name text, p_type text, p_description text, p_status text, p_sector text, p_is_fiscal boolean, p_nif text, p_commercial_name text, p_country_code text, p_addresses jsonb, p_nif_encrypted text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_nif_tokens text[] DEFAULT NULL::text[])
 RETURNS anew_organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.create') THEN
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
  -- 20270108140000: organizations.create na organização de referência ou acima; criar uma MÃE para ela mexe na hierarquia
  --   dela, por isso pede também organizations.edit nela ou acima (como a política de anew_hierarchy). Antes bastava a
  --   permissão em qualquer organização: quem criava uma mãe para uma organização onde era membro baixo ficava administrador
  --   por cima dela.
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.create', p_current_org_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar organizações ligadas a esta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_hierarchy_type = 'parent'
     AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.edit', p_current_org_id) THEN
    RAISE EXCEPTION 'Sem permissão para mudar a hierarquia desta organização' USING ERRCODE = 'insufficient_privilege';
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
    (id, name, type, description, status, sector, is_fiscal, entity_id, created_by, is_work_org)
  VALUES
    (v_new_org_id,
     p_name,
     COALESCE(p_type, 'departamento'),
     nullif(p_description, ''),
     COALESCE(nullif(p_status, ''), 'active'),
     nullif(p_sector, ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor,
     COALESCE(p_type, 'departamento') IN ('holding', 'empresa'))
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
$function$;

CREATE OR REPLACE FUNCTION public.bootstrap_org_creator(p_organization_id uuid, p_organization_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_registration_origin text;
  v_has_perm boolean;
  v_creator_role_id uuid;
  v_org_admin_role_id uuid;
  v_all_permissions text[];
  v_refs uuid[];        -- 20270108140000
  v_can_sign boolean;   -- 20270108140000
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, registration_origin INTO v_anew_user_id, v_registration_origin
  FROM public.anew_users
  WHERE auth_user_id = v_auth_uid;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_organizations
    WHERE id = p_organization_id
      AND (created_by = v_anew_user_id OR created_by = v_auth_uid)
  ) THEN
    RAISE EXCEPTION 'Not the creator of this organization';
  END IF;

  UPDATE public.anew_organizations
  SET created_by = v_anew_user_id
  WHERE id = p_organization_id
    AND created_by = v_auth_uid;

  v_has_perm := public.has_anew_permission(v_auth_uid, 'organizations.create');

  IF v_registration_origin != 'self_registration' AND NOT v_has_perm THEN
    RAISE EXCEPTION 'Not authorized to bootstrap organization';
  END IF;

  -- 20270108140000: o papel org_admin já não leva TODAS as permissões. Levava também system.manage, que o gatilho
  --   fn_role_permissions_reservadas recusa, e por isso criar organizações rebentava sempre. Sem system.manage, quem tinha
  --   organizations.create ganhava todas as permissões. Agora:
  --   - auto-registo (primeira organização) ou administrador de sistema: todas, menos system.manage (como era a intenção);
  --   - os outros: só as que quem cria já tem sobre as organizações abrangidas (sem ganhar poder):
  --       * a nova é mãe de outra(s) -> as que tem sobre cada uma delas (nela ou acima);
  --       * a nova é filha -> as que tem sobre ela (nas de cima);
  --       * a nova está solta -> as que tem em TODAS as suas organizações (a interseção);
  --     e só assina contratos se quem cria também pode, nas mesmas organizações.
  IF COALESCE(v_registration_origin = 'self_registration', false) OR public.is_system_admin(v_auth_uid) THEN
    SELECT array_agg(code) INTO v_all_permissions FROM public.anew_permissions WHERE code <> 'system.manage';
    v_can_sign := true;
  ELSE
    v_refs := ARRAY(SELECT DISTINCT h.child_org_id FROM public.anew_hierarchy h WHERE h.parent_org_id = p_organization_id);
    IF COALESCE(cardinality(v_refs), 0) = 0 THEN
      IF EXISTS (SELECT 1 FROM public.anew_hierarchy h WHERE h.child_org_id = p_organization_id) THEN
        v_refs := ARRAY[p_organization_id];
      ELSE
        v_refs := ARRAY(SELECT DISTINCT m.organization_id
                        FROM public.anew_memberships m
                        WHERE m.user_id = v_anew_user_id AND m.status = 'active' AND m.role_is_client IS NOT TRUE
                          AND m.organization_id <> p_organization_id);
      END IF;
    END IF;
    IF COALESCE(cardinality(v_refs), 0) = 0 THEN
      v_all_permissions := NULL;
      v_can_sign := false;
    ELSE
      SELECT array_agg(p.code) INTO v_all_permissions
      FROM public.anew_permissions p
      WHERE p.code <> 'system.manage'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(v_refs) AS r(org)
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.anew_memberships m
            JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id AND rp.permission_code = p.code
            WHERE m.user_id = v_anew_user_id AND m.status = 'active' AND m.role_is_client IS NOT TRUE
              AND m.organization_id <> p_organization_id
              AND m.organization_id IN (SELECT public.fn_org_e_ascendentes(r.org))));
      SELECT COALESCE(bool_and(public.fn_pode_assinar_contratos(v_anew_user_id, r.org)), false) INTO v_can_sign
      FROM unnest(v_refs) AS r(org);
    END IF;
  END IF;

  IF v_registration_origin = 'self_registration' THEN
    SELECT id INTO v_creator_role_id FROM public.anew_roles WHERE code = 'super_admin' AND organization_id IS NULL;
  END IF;

  INSERT INTO public.anew_roles (code, name, description, organization_id, is_system, is_default, can_sign_contracts, created_by)
  VALUES ('org_admin', 'Administrador', 'Administrador com todas as permissões', p_organization_id, false, false, v_can_sign, v_anew_user_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_org_admin_role_id;

  IF v_org_admin_role_id IS NULL THEN
    SELECT id INTO v_org_admin_role_id FROM public.anew_roles
    WHERE code = 'org_admin' AND organization_id = p_organization_id;
  END IF;

  

  INSERT INTO public.anew_roles (code, name, description, organization_id, is_system, is_default, can_sign_contracts, created_by)
  VALUES ('viewer', 'Visualizador', 'Apenas visualização', p_organization_id, false, true, false, v_anew_user_id)
  ON CONFLICT DO NOTHING;

  IF v_all_permissions IS NOT NULL AND v_org_admin_role_id IS NOT NULL THEN
    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_org_admin_role_id, unnest(v_all_permissions), v_anew_user_id
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_creator_role_id IS NULL THEN
    v_creator_role_id := v_org_admin_role_id;
  END IF;

  INSERT INTO public.anew_memberships (
    user_id, organization_id, role_id, status, relationship_type, join_method, accepted_at, created_by
  )
  VALUES (
    v_anew_user_id, p_organization_id, v_creator_role_id, 'active', 'MEMBER', 'created_org', now(), v_anew_user_id
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'role_id', v_creator_role_id);
END;
$function$;
