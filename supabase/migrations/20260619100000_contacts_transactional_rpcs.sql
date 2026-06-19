-- Contacts module: transactional RPCs for H5, M1 and M3 findings of
-- vault/problemas/contactos/auditoria-contactos.md.
--
-- Builds strictly on the authorization primitives introduced in
-- 20260619090000_contacts_security_scope_integrity.sql:
--   public.resolve_contact_access_context(p_org_id, p_requested_scope, p_permission_code)
--   public.can_access_contact_row(p_org_id, p_created_by, p_assigned_to, p_permission_code)
--
-- No INSERT statements define permission codes anywhere in the migration
-- history that ships with this repo (anew_permissions rows are seeded
-- outside of versioned migrations), so 'contacts.convert' cannot be
-- confirmed to exist on the live database. convert_contact_to_client()
-- therefore checks at runtime whether 'contacts.convert' is a known code in
-- public.anew_permissions; if present it is used as the single required
-- permission, otherwise the function falls back to requiring BOTH
-- 'contacts.edit' AND 'clients.create'. See the function body for details.


-- =====================================================================
-- H5 — Transactional contact -> client conversion
-- =====================================================================
CREATE OR REPLACE FUNCTION public.convert_contact_to_client(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_actor uuid;
  v_contact RECORD;
  v_org_id uuid;
  v_entity_id uuid;
  v_created_by uuid;
  v_assigned_to uuid;
  v_ctx RECORD;
  v_team_scope_ids uuid[];
  v_permission_code text;
  v_has_convert_permission_code boolean := false;
  v_now timestamptz := now();
  v_existing_client_id uuid;
  v_existing_client_status text;
  v_client_id uuid;
  v_existing_client_role_id uuid;
  v_display_name text;
  v_name_parts text[];
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'p_contact_id is required';
  END IF;

  v_actor := COALESCE(
    public.current_business_user_id(),
    (
      SELECT au.id
      FROM public.anew_users au
      WHERE au.auth_user_id = v_auth_uid
      LIMIT 1
    )
  );

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'convert_contact_to_client: actor not resolved for auth.uid=%', v_auth_uid
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the contact row before any decision is made.
  SELECT
    c.id,
    c.entity_id,
    c.organization_id,
    c.root_organization_id,
    c.created_by,
    c.assigned_to,
    c.deleted_at,
    c.converted_to_client_id
  INTO v_contact
  FROM public.anew_contacts c
  WHERE c.id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;

  IF v_contact.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contact is deleted: %', p_contact_id;
  END IF;

  v_org_id := v_contact.organization_id;
  v_entity_id := v_contact.entity_id;
  v_created_by := v_contact.created_by;
  v_assigned_to := v_contact.assigned_to;

  -- Determine which permission contract to enforce. Prefer a dedicated
  -- 'contacts.convert' code when the live anew_permissions table defines
  -- it; otherwise require both contacts.edit and clients.create.
  SELECT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'contacts.convert'
  )
  INTO v_has_convert_permission_code;

  IF v_has_convert_permission_code THEN
    v_permission_code := 'contacts.convert';

    SELECT *
    INTO v_ctx
    FROM public.resolve_contact_access_context(v_org_id, 'ORG', v_permission_code);

    v_team_scope_ids := ARRAY(
      SELECT DISTINCT x
      FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
    );

    IF v_ctx.applied_scope = 'OWNED'
       AND NOT (v_assigned_to = v_ctx.anew_user_id OR v_created_by = v_ctx.anew_user_id) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    IF v_ctx.applied_scope = 'TEAM'
       AND NOT (
         v_assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
         OR v_created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;
  ELSE
    -- Fallback contract: both contacts.edit (mutating the contact) and
    -- clients.create (creating/reactivating the client) are required.
    SELECT *
    INTO v_ctx
    FROM public.resolve_contact_access_context(v_org_id, 'ORG', 'contacts.edit');

    v_team_scope_ids := ARRAY(
      SELECT DISTINCT x
      FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
    );

    IF v_ctx.applied_scope = 'OWNED'
       AND NOT (v_assigned_to = v_ctx.anew_user_id OR v_created_by = v_ctx.anew_user_id) THEN
      RAISE EXCEPTION 'permission denied: contacts.edit required';
    END IF;

    IF v_ctx.applied_scope = 'TEAM'
       AND NOT (
         v_assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
         OR v_created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
       ) THEN
      RAISE EXCEPTION 'permission denied: contacts.edit required';
    END IF;

    -- clients.create has no scope semantics tied to an existing row (it
    -- gates the creation of a brand-new client), so just confirm the
    -- actor holds it (or is admin) in this organization.
    PERFORM 1
    FROM public.resolve_contact_access_context(v_org_id, 'ORG', 'clients.create');
  END IF;

  -- Find a reusable (not soft-deleted) client for the same entity/org.
  SELECT cl.id, cl.status
  INTO v_existing_client_id, v_existing_client_status
  FROM public.anew_clients cl
  WHERE cl.entity_id = v_entity_id
    AND cl.organization_id = v_org_id
    AND cl.deleted_at IS NULL
  ORDER BY cl.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_client_id IS NOT NULL THEN
    UPDATE public.anew_clients
    SET status = 'active',
        deleted_at = NULL,
        updated_at = v_now
    WHERE id = v_existing_client_id;
    v_client_id := v_existing_client_id;
  ELSE
    INSERT INTO public.anew_clients (
      entity_id,
      root_organization_id,
      organization_id,
      status,
      source_type,
      source_id,
      created_by,
      assigned_to,
      client_type
    )
    VALUES (
      v_entity_id,
      COALESCE(v_contact.root_organization_id, v_org_id),
      v_org_id,
      'active',
      'contact',
      v_contact.id,
      v_actor,
      v_assigned_to,
      'individual'
    )
    RETURNING id INTO v_client_id;
  END IF;

  -- Update the contact: point it at the new/reactivated client and mark
  -- it inactive, matching the existing frontend behaviour.
  UPDATE public.anew_contacts
  SET converted_to_client_id = v_client_id,
      converted_at = v_now,
      status = 'inactive',
      updated_at = v_now
  WHERE id = v_contact.id;

  -- Sync entity display name fragments, mirroring the previous client-side step.
  SELECT display_name INTO v_display_name
  FROM public.anew_entities
  WHERE id = v_entity_id;

  IF v_display_name IS NOT NULL AND BTRIM(v_display_name) <> '' THEN
    v_name_parts := regexp_split_to_array(BTRIM(v_display_name), '\s+');
    IF array_length(v_name_parts, 1) >= 1 THEN
      UPDATE public.anew_entities
      SET first_name = v_name_parts[1],
          last_name = CASE
            WHEN array_length(v_name_parts, 1) > 1
            THEN array_to_string(v_name_parts[2:array_length(v_name_parts, 1)], ' ')
            ELSE last_name
          END
      WHERE id = v_entity_id;
    END IF;
  END IF;

  -- Client role: activate (create or reactivate) in the contact's own org.
  SELECT er.id
  INTO v_existing_client_role_id
  FROM public.anew_entity_roles er
  WHERE er.entity_id = v_entity_id
    AND er.role = 'client'
    AND er.organization_id = v_org_id
  ORDER BY er.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_client_role_id IS NULL THEN
    INSERT INTO public.anew_entity_roles (
      entity_id,
      role,
      status,
      organization_id,
      source_type,
      created_by
    )
    VALUES (
      v_entity_id,
      'client',
      'active',
      v_org_id,
      'contacts',
      v_actor
    );
  ELSE
    UPDATE public.anew_entity_roles
    SET status = 'active',
        previous_status = NULL,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = v_now
    WHERE id = v_existing_client_role_id;
  END IF;

  -- Deactivate the contact role, only within the contact's own org.
  UPDATE public.anew_entity_roles
  SET previous_status = status,
      status = 'inactive',
      updated_at = v_now
  WHERE entity_id = v_entity_id
    AND role = 'contact'
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  -- History is best-effort: failure here must not roll back the conversion,
  -- matching the soft_delete_entity_facet pattern.
  BEGIN
    INSERT INTO public.anew_entity_history (
      entity_id,
      change_type,
      field_name,
      old_value,
      new_value,
      changed_by,
      metadata
    )
    VALUES (
      v_entity_id,
      'converted',
      'contact_to_client',
      v_contact.id::text,
      v_client_id::text,
      v_actor,
      jsonb_build_object(
        'contact_id', v_contact.id,
        'client_id', v_client_id,
        'organization_id', v_org_id,
        'reused_existing_client', v_existing_client_id IS NOT NULL
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'client_id', v_client_id,
    'contact_id', v_contact.id,
    'entity_id', v_entity_id,
    'organization_id', v_org_id,
    'reused_existing_client', v_existing_client_id IS NOT NULL
  );
END;
$$;


-- =====================================================================
-- M1 — Transactional contact creation with guaranteed role
-- =====================================================================
-- p_payload shape (camelCase keys mirrored 1:1 from AnewContacts.tsx):
-- {
--   "entityId": uuid | null,            -- existing entity to reuse (omit/null to create new)
--   "organizationId": uuid,             -- required
--   "rootOrganizationId": uuid | null,  -- defaults to organizationId
--   "displayName": text,                -- required when entityId is null
--   "entityType": "person" | "organization", -- required when entityId is null
--   "firstName": text | null,
--   "lastName": text | null,
--   "email": text | null,
--   "phone": text | null,
--   "phoneCountryCode": text | null,
--   "vat": text | null,
--   "status": text,                     -- contact + role status, defaults to 'active'
--   "sourceType": text | null,          -- defaults to 'manual'
--   "assignedTo": uuid | null
-- }
CREATE OR REPLACE FUNCTION public.create_contact_with_role(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_actor uuid;
  v_org_id uuid;
  v_root_org_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_phone_cc text;
  v_vat text;
  v_status text;
  v_source_type text;
  v_assigned_to uuid;
  v_ctx RECORD;
  v_contact_id uuid;
  v_role_id uuid;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'p_payload is required';
  END IF;

  v_actor := COALESCE(
    public.current_business_user_id(),
    (
      SELECT au.id
      FROM public.anew_users au
      WHERE au.auth_user_id = v_auth_uid
      LIMIT 1
    )
  );

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_contact_with_role: actor not resolved for auth.uid=%', v_auth_uid
      USING ERRCODE = 'P0001';
  END IF;

  v_org_id := (p_payload->>'organizationId')::uuid;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organizationId is required';
  END IF;

  v_root_org_id := COALESCE((p_payload->>'rootOrganizationId')::uuid, v_org_id);
  v_entity_id := (p_payload->>'entityId')::uuid;
  v_entity_type := COALESCE(p_payload->>'entityType', 'person');
  v_display_name := p_payload->>'displayName';
  v_first_name := p_payload->>'firstName';
  v_last_name := p_payload->>'lastName';
  v_email := NULLIF(BTRIM(COALESCE(p_payload->>'email', '')), '');
  v_phone := NULLIF(BTRIM(COALESCE(p_payload->>'phone', '')), '');
  v_phone_cc := p_payload->>'phoneCountryCode';
  v_vat := NULLIF(BTRIM(COALESCE(p_payload->>'vat', '')), '');
  v_status := COALESCE(p_payload->>'status', 'active');
  v_source_type := COALESCE(p_payload->>'sourceType', 'manual');
  v_assigned_to := (p_payload->>'assignedTo')::uuid;

  -- Validate organization-level authorization before touching any row.
  -- resolve_contact_access_context() already raises on missing
  -- authentication, invisible organization, or missing 'contacts.create'
  -- permission, so reaching this point means the actor is authorized.
  -- created_by is still pinned explicitly to the resolved actor below
  -- rather than trusting any caller-supplied value, since this function
  -- is SECURITY DEFINER and bypasses RLS.
  SELECT *
  INTO v_ctx
  FROM public.resolve_contact_access_context(v_org_id, 'ORG', 'contacts.create');

  IF v_entity_id IS NULL THEN
    IF v_display_name IS NULL OR BTRIM(v_display_name) = '' THEN
      RAISE EXCEPTION 'displayName is required to create a new entity';
    END IF;

    INSERT INTO public.anew_entities (
      type,
      display_name,
      created_by,
      first_name,
      last_name
    )
    VALUES (
      v_entity_type,
      v_display_name,
      v_actor,
      v_first_name,
      v_last_name
    )
    RETURNING id INTO v_entity_id;

    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, is_primary, created_by)
      VALUES (v_entity_id, v_email, true, v_actor);
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
      VALUES (v_entity_id, v_phone, COALESCE(v_phone_cc, '+351'), 'work', true, v_actor);
    END IF;

    IF v_vat IS NOT NULL THEN
      DECLARE
        v_fiscal_entity_id uuid;
      BEGIN
        INSERT INTO public.fiscal_entities (nif, entity_type, created_by)
        VALUES (v_vat, CASE WHEN v_entity_type = 'person' THEN 'individual' ELSE 'company' END, v_actor)
        RETURNING id INTO v_fiscal_entity_id;

        INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
        VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);
      END;
    END IF;
  END IF;

  INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary)
  VALUES (v_entity_id, v_org_id, true)
  ON CONFLICT (entity_id, organization_id) DO NOTHING;

  INSERT INTO public.anew_contacts (
    entity_id,
    root_organization_id,
    organization_id,
    status,
    source_type,
    assigned_to,
    created_by
  )
  VALUES (
    v_entity_id,
    v_root_org_id,
    v_org_id,
    v_status,
    v_source_type,
    v_assigned_to,
    v_actor
  )
  RETURNING id INTO v_contact_id;

  SELECT er.id
  INTO v_role_id
  FROM public.anew_entity_roles er
  WHERE er.entity_id = v_entity_id
    AND er.role = 'contact'
    AND er.organization_id = v_org_id
  LIMIT 1
  FOR UPDATE;

  IF v_role_id IS NULL THEN
    INSERT INTO public.anew_entity_roles (
      entity_id,
      role,
      status,
      organization_id,
      source_type,
      created_by
    )
    VALUES (
      v_entity_id,
      'contact',
      v_status,
      v_org_id,
      v_source_type,
      v_actor
    )
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE public.anew_entity_roles
    SET status = v_status,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = now()
    WHERE id = v_role_id;
  END IF;

  -- If the entity was reused, the role insert/update above could still
  -- fail to materialize a row (e.g. constraint races). Guarantee the
  -- invariant the whole RPC exists to protect: a contact never persists
  -- without its role.
  IF NOT EXISTS (
    SELECT 1
    FROM public.anew_entity_roles
    WHERE entity_id = v_entity_id
      AND role = 'contact'
      AND organization_id = v_org_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'create_contact_with_role: failed to guarantee contact role for entity %', v_entity_id;
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'entity_id', v_entity_id,
    'role_id', v_role_id,
    'organization_id', v_org_id
  );
END;
$$;


-- =====================================================================
-- M3 — Server-side KPI aggregation for the contacts dashboard
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_contact_dashboard_kpis(
  p_org_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH requested_orgs AS (
    SELECT DISTINCT unnest(COALESCE(p_org_ids, ARRAY[]::uuid[])) AS org_id
  ),
  visible_org_ids AS (
    SELECT org_id
    FROM requested_orgs
    INTERSECT
    SELECT public.get_user_visible_org_ids(auth.uid())
  ),
  excluded_entities AS (
    SELECT DISTINCT aer.entity_id
    FROM public.anew_entity_roles aer
    WHERE aer.organization_id IN (SELECT org_id FROM visible_org_ids)
      AND (
        (aer.role = 'contact' AND aer.status = 'inactive')
        OR (aer.role = 'client' AND aer.status = 'active')
      )
  ),
  scoped_contacts AS (
    SELECT
      c.entity_id,
      c.organization_id,
      c.status,
      c.assigned_to,
      c.created_by,
      c.last_interaction_at
    FROM public.anew_contacts c
    WHERE c.organization_id IN (SELECT org_id FROM visible_org_ids)
      AND c.deleted_at IS NULL
      AND c.converted_to_client_id IS NULL
      AND c.entity_id NOT IN (SELECT entity_id FROM excluded_entities)
      AND public.can_access_contact_row(
        c.organization_id,
        c.created_by,
        c.assigned_to,
        'contacts.view'::text
      )
  ),
  active_contacts AS (
    SELECT * FROM scoped_contacts WHERE status = 'active'
  ),
  with_deals AS (
    SELECT DISTINCT sc.entity_id
    FROM scoped_contacts sc
    JOIN public.deals d
      ON d.entity_id = sc.entity_id
     AND d.organization_id = sc.organization_id
     AND d.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM scoped_contacts),
    'active', (SELECT COUNT(*) FROM active_contacts),
    'inactive', (SELECT COUNT(*) FROM scoped_contacts WHERE status != 'active'),
    'unassigned', COALESCE((
      SELECT COUNT(*) FROM scoped_contacts WHERE assigned_to IS NULL
    ), 0),
    'no_contact_7d', COALESCE((
      SELECT COUNT(*)
      FROM scoped_contacts
      WHERE last_interaction_at IS NULL
         OR last_interaction_at < (now() - interval '7 days')
    ), 0),
    'no_contact_14d', COALESCE((
      SELECT COUNT(*)
      FROM scoped_contacts
      WHERE last_interaction_at IS NULL
         OR last_interaction_at < (now() - interval '14 days')
    ), 0),
    'with_deals', COALESCE((SELECT COUNT(*) FROM with_deals), 0),
    'without_deals', COALESCE((
      SELECT COUNT(*) FROM scoped_contacts sc
      WHERE NOT EXISTS (SELECT 1 FROM with_deals wd WHERE wd.entity_id = sc.entity_id)
    ), 0)
  );
$$;


REVOKE ALL ON FUNCTION public.convert_contact_to_client(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_contact_to_client(uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_contact_with_role(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_contact_with_role(jsonb)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_contact_dashboard_kpis(uuid[])
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contact_dashboard_kpis(uuid[])
TO authenticated, service_role;
