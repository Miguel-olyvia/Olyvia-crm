-- Fix: convert_contact_to_client corrupted entity first_name/last_name.
--
-- The original function (20260619100000_contacts_transactional_rpcs.sql)
-- read anew_entities.display_name (already "first_name || ' ' || last_name"),
-- split it on whitespace, and overwrote first_name/last_name from the split.
-- This destroyed the original field boundary whenever first_name itself
-- contained an internal space (e.g. "E2E TEST" + "Contact" was corrupted to
-- "E2E" + "TEST Contact").
--
-- A contact -> client conversion is a role change on the same entity, not a
-- name edit, so the function must not touch first_name/last_name at all.
-- This migration drops that block (and its now-dead local variables) and is
-- otherwise byte-identical to the shipped function. Forward-only per repo
-- convention: the 20260619100000 migration is left untouched.

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


REVOKE ALL ON FUNCTION public.convert_contact_to_client(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_contact_to_client(uuid)
TO authenticated, service_role;
