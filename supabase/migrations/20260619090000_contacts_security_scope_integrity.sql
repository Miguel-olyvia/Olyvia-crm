CREATE OR REPLACE FUNCTION public.resolve_contact_access_context(
  p_org_id uuid,
  p_requested_scope text DEFAULT 'ORG',
  p_permission_code text DEFAULT 'contacts.view'
)
RETURNS TABLE (
  auth_user_id uuid,
  anew_user_id uuid,
  visible_org_ids uuid[],
  requested_scope text,
  permitted_scope text,
  applied_scope text,
  team_user_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_visible_org_ids uuid[];
  v_requested_scope text;
  v_permitted_scope text := 'OWNED';
  v_applied_scope text := 'OWNED';
  v_team_user_ids uuid[] := ARRAY[]::uuid[];
  v_is_admin boolean := false;
  v_has_permission boolean := false;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  SELECT au.id
  INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'business user not found for auth user';
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_visible_org_ids(v_auth_uid)
  )
  INTO v_visible_org_ids;

  IF NOT (p_org_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'permission denied: organization not visible';
  END IF;

  v_requested_scope := UPPER(COALESCE(NULLIF(BTRIM(p_requested_scope), ''), 'ORG'));
  IF v_requested_scope = 'ALL' THEN
    v_requested_scope := 'ORG';
  END IF;
  IF v_requested_scope NOT IN ('ORG', 'TEAM', 'OWNED') THEN
    v_requested_scope := 'ORG';
  END IF;

  WITH RECURSIVE
  admin_memberships AS (
    SELECT m.id, m.organization_id, r.code AS role_code
    FROM public.anew_memberships m
    JOIN public.anew_roles r
      ON r.id = m.role_id
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND r.code IN ('system_admin', 'super_admin')
  ),
  super_roots AS (
    SELECT organization_id
    FROM admin_memberships
    WHERE role_code = 'super_admin'
  ),
  super_descendants AS (
    SELECT organization_id FROM super_roots
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN super_descendants d
      ON d.organization_id = h.parent_org_id
  ),
  super_ancestors AS (
    SELECT organization_id FROM super_roots
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN super_ancestors a
      ON a.organization_id = h.child_org_id
  ),
  super_hierarchy AS (
    SELECT organization_id FROM super_descendants
    UNION
    SELECT organization_id FROM super_ancestors
  ),
  super_graph AS (
    SELECT organization_id FROM super_hierarchy
    UNION
    SELECT a.associated_org_id
    FROM public.anew_org_associations a
    JOIN super_hierarchy h
      ON h.organization_id = a.org_id
    UNION
    SELECT a.org_id
    FROM public.anew_org_associations a
    JOIN super_hierarchy h
      ON h.organization_id = a.associated_org_id
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM admin_memberships
      WHERE role_code = 'system_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM super_graph
      WHERE organization_id = p_org_id
    )
  INTO v_is_admin;

  WITH RECURSIVE org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc
      ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped_memberships sm
    JOIN public.anew_role_permissions arp
      ON arp.role_id = sm.role_id
     AND arp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  IF NOT v_is_admin AND NOT v_has_permission THEN
    RAISE EXCEPTION 'permission denied: % required', p_permission_code;
  END IF;

  IF v_is_admin THEN
    v_permitted_scope := 'ORG';
  ELSE
    WITH RECURSIVE org_chain AS (
      SELECT p_org_id AS org_id
      UNION
      SELECT h.parent_org_id
      FROM public.anew_hierarchy h
      JOIN org_chain oc
        ON oc.org_id = h.child_org_id
      WHERE h.parent_org_id IS NOT NULL
    ),
    scoped_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id IN (SELECT org_id FROM org_chain)
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm
          ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm
          ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      ELSE 'OWNED'
    END
    INTO v_permitted_scope;
  END IF;

  IF v_requested_scope = 'ORG' THEN
    v_applied_scope := v_permitted_scope;
  ELSIF v_requested_scope = 'TEAM' THEN
    v_applied_scope := CASE
      WHEN v_permitted_scope IN ('ORG', 'TEAM') THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSE
    v_applied_scope := 'OWNED';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
  INTO v_team_user_ids
  FROM public.organization_teams t
  JOIN public.organization_team_members tm
    ON tm.team_id = t.id
  WHERE t.organization_id = p_org_id
    AND t.leader_id = v_anew_user_id;

  RETURN QUERY
  SELECT
    v_auth_uid,
    v_anew_user_id,
    COALESCE(v_visible_org_ids, ARRAY[]::uuid[]),
    v_requested_scope,
    v_permitted_scope,
    v_applied_scope,
    COALESCE(v_team_user_ids, ARRAY[]::uuid[]);
END;
$$;


CREATE OR REPLACE FUNCTION public.can_access_contact_row(
  p_org_id uuid,
  p_created_by uuid,
  p_assigned_to uuid,
  p_permission_code text DEFAULT 'contacts.view'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx RECORD;
  v_team_scope_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_org_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_contact_access_context(p_org_id, 'ORG', p_permission_code);

  v_team_scope_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
  );

  RETURN (
    v_ctx.applied_scope = 'ORG'
    OR (
      v_ctx.applied_scope = 'TEAM'
      AND (
        p_assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
        OR p_created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
      )
    )
    OR (
      v_ctx.applied_scope = 'OWNED'
      AND (
        p_assigned_to = v_ctx.anew_user_id
        OR p_created_by = v_ctx.anew_user_id
      )
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;


DROP POLICY IF EXISTS anew_contacts_select ON public.anew_contacts;
DROP POLICY IF EXISTS anew_contacts_insert ON public.anew_contacts;
DROP POLICY IF EXISTS anew_contacts_update ON public.anew_contacts;
DROP POLICY IF EXISTS anew_contacts_delete ON public.anew_contacts;

CREATE POLICY anew_contacts_select
ON public.anew_contacts
FOR SELECT
TO authenticated
USING (
  public.has_anew_permission(auth.uid(), 'contacts.view'::text)
  AND public.can_access_contact_row(
    organization_id,
    created_by,
    assigned_to,
    'contacts.view'::text
  )
);

CREATE POLICY anew_contacts_insert
ON public.anew_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_anew_permission(auth.uid(), 'contacts.create'::text)
  AND created_by = public.current_business_user_id()
  AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
);

CREATE POLICY anew_contacts_update
ON public.anew_contacts
FOR UPDATE
TO authenticated
USING (
  public.has_anew_permission(auth.uid(), 'contacts.edit'::text)
  AND public.can_access_contact_row(
    organization_id,
    created_by,
    assigned_to,
    'contacts.edit'::text
  )
)
WITH CHECK (
  public.has_anew_permission(auth.uid(), 'contacts.edit'::text)
  AND public.can_access_contact_row(
    organization_id,
    created_by,
    assigned_to,
    'contacts.edit'::text
  )
);

CREATE POLICY anew_contacts_delete
ON public.anew_contacts
FOR DELETE
TO authenticated
USING (
  public.has_anew_permission(auth.uid(), 'contacts.delete'::text)
  AND public.can_access_contact_row(
    organization_id,
    created_by,
    assigned_to,
    'contacts.delete'::text
  )
);


CREATE OR REPLACE FUNCTION public.soft_delete_entity_facet(
  p_kind text,
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_actor uuid;
  v_deleted_at timestamptz;
  v_entity_id uuid;
  v_org_id uuid;
  v_created_by uuid;
  v_assigned_to uuid;
  v_permission_code text;
  v_ctx RECORD;
  v_team_scope_ids uuid[];
  v_deals integer := 0;
  v_quotes integer := 0;
  v_props integer := 0;
  v_contracts integer := 0;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
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
    RAISE EXCEPTION 'soft_delete_entity_facet: actor not resolved for auth.uid=%', v_auth_uid
      USING ERRCODE = 'P0001';
  END IF;

  v_permission_code := CASE p_kind
    WHEN 'lead' THEN 'leads.delete'
    WHEN 'contact' THEN 'contacts.delete'
    WHEN 'client' THEN 'clients.delete'
    ELSE NULL
  END;

  IF v_permission_code IS NULL THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Before any UPDATE, lock the target row and validate scope in definer context.
  IF p_kind = 'lead' THEN
    SELECT
      l.entity_id,
      l.organization_id,
      l.created_by,
      l.assigned_to,
      l.deleted_at
    INTO v_entity_id, v_org_id, v_created_by, v_assigned_to, v_deleted_at
    FROM public.anew_leads l
    WHERE l.id = p_id
    FOR UPDATE;

    IF NOT FOUND OR v_entity_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_deleted_at IS NOT NULL THEN
      RETURN false;
    END IF;

    SELECT *
    INTO v_ctx
    FROM public.resolve_lead_access_context(v_org_id, 'ORG', v_permission_code);

    v_team_scope_ids := ARRAY(
      SELECT DISTINCT x
      FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
    );

    IF v_ctx.applied_scope = 'OWNED'
       AND NOT (
         v_assigned_to = v_ctx.anew_user_id
         OR v_created_by = v_ctx.anew_user_id
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    IF v_ctx.applied_scope = 'TEAM'
       AND NOT (
         v_assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
         OR v_created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    v_deleted_at := now();

    UPDATE public.anew_leads
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE id = p_id
      AND deleted_at IS NULL;
  ELSIF p_kind = 'contact' THEN
    SELECT
      c.entity_id,
      c.organization_id,
      c.created_by,
      c.assigned_to,
      c.deleted_at
    INTO v_entity_id, v_org_id, v_created_by, v_assigned_to, v_deleted_at
    FROM public.anew_contacts c
    WHERE c.id = p_id
    FOR UPDATE;

    IF NOT FOUND OR v_entity_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_deleted_at IS NOT NULL THEN
      RETURN false;
    END IF;

    SELECT *
    INTO v_ctx
    FROM public.resolve_contact_access_context(v_org_id, 'ORG', v_permission_code);

    v_team_scope_ids := ARRAY(
      SELECT DISTINCT x
      FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
    );

    IF v_ctx.applied_scope = 'OWNED'
       AND NOT (
         v_assigned_to = v_ctx.anew_user_id
         OR v_created_by = v_ctx.anew_user_id
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    IF v_ctx.applied_scope = 'TEAM'
       AND NOT (
         v_assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
         OR v_created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    v_deleted_at := now();

    UPDATE public.anew_contacts
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE id = p_id
      AND deleted_at IS NULL;
  ELSE
    SELECT
      c.entity_id,
      c.organization_id,
      c.created_by,
      c.assigned_to,
      c.deleted_at
    INTO v_entity_id, v_org_id, v_created_by, v_assigned_to, v_deleted_at
    FROM public.anew_clients c
    WHERE c.id = p_id
    FOR UPDATE;

    IF NOT FOUND OR v_entity_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_deleted_at IS NOT NULL THEN
      RETURN false;
    END IF;

    SELECT *
    INTO v_ctx
    FROM public.resolve_contact_access_context(v_org_id, 'ORG', v_permission_code);

    v_team_scope_ids := ARRAY(
      SELECT DISTINCT x
      FROM unnest(COALESCE(v_ctx.team_user_ids, ARRAY[]::uuid[]) || ARRAY[v_ctx.anew_user_id]) AS x
    );

    IF v_ctx.applied_scope = 'OWNED'
       AND NOT (
         v_assigned_to = v_ctx.anew_user_id
         OR v_created_by = v_ctx.anew_user_id
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    IF v_ctx.applied_scope = 'TEAM'
       AND NOT (
         v_assigned_to = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
         OR v_created_by = ANY(COALESCE(v_team_scope_ids, ARRAY[]::uuid[]))
       ) THEN
      RAISE EXCEPTION 'permission denied: % required', v_permission_code;
    END IF;

    v_deleted_at := now();

    UPDATE public.anew_clients
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE id = p_id
      AND deleted_at IS NULL;
  END IF;

  UPDATE public.anew_entity_roles
  SET previous_status = status,
      status = 'deleted',
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE entity_id = v_entity_id
    AND organization_id = v_org_id
    AND role = p_kind
    AND deleted_at IS NULL;

  UPDATE public.deals
  SET deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE entity_id = v_entity_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_deals = ROW_COUNT;

  UPDATE public.quotes
  SET deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE entity_id = v_entity_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_quotes = ROW_COUNT;

  UPDATE public.client_contracts
  SET deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE entity_id = v_entity_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_contracts = ROW_COUNT;

  UPDATE public.proposals
  SET deleted_at = v_deleted_at,
      deleted_by = v_actor,
      is_deleted = true
  WHERE entity_id = v_entity_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_props = ROW_COUNT;

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
      'deleted',
      p_kind,
      NULL,
      p_id::text,
      v_actor,
      jsonb_build_object(
        'kind', p_kind,
        'id', p_id,
        'organization_id', v_org_id,
        'cascade', jsonb_build_object(
          'deals', v_deals,
          'quotes', v_quotes,
          'proposals', v_props,
          'contracts', v_contracts
        )
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_contact_alert_counts(
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
  active_contacts AS (
    SELECT
      c.entity_id,
      c.last_interaction_at,
      c.assigned_to,
      c.created_by,
      c.status
    FROM public.anew_contacts c
    WHERE c.organization_id IN (SELECT org_id FROM visible_org_ids)
      AND c.deleted_at IS NULL
      AND c.entity_id NOT IN (SELECT entity_id FROM excluded_entities)
      AND public.can_access_contact_row(
        c.organization_id,
        c.created_by,
        c.assigned_to,
        'contacts.view'::text
      )
  ),
  active_only AS (
    SELECT *
    FROM active_contacts
    WHERE status = 'active'
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM active_contacts),
    'active', (SELECT COUNT(*) FROM active_only),
    'inactive', (SELECT COUNT(*) FROM active_contacts WHERE status != 'active'),
    'no_contact_14d', COALESCE((
      SELECT COUNT(*)
      FROM active_only
      WHERE last_interaction_at IS NULL
         OR last_interaction_at < (now() - interval '14 days')
    ), 0),
    'no_contact_7d', COALESCE((
      SELECT COUNT(*)
      FROM active_only
      WHERE last_interaction_at IS NULL
         OR last_interaction_at < (now() - interval '7 days')
    ), 0),
    'no_deal', COALESCE((
      SELECT COUNT(*)
      FROM active_only ac2
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.deals d
        WHERE d.entity_id = ac2.entity_id
      )
    ), 0),
    'unassigned', COALESCE((
      SELECT COUNT(*)
      FROM active_only
      WHERE assigned_to IS NULL
    ), 0)
  );
$$;


REVOKE ALL ON FUNCTION public.resolve_contact_access_context(uuid, text, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_contact_access_context(uuid, text, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_access_contact_row(uuid, uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_contact_row(uuid, uuid, uuid, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.soft_delete_entity_facet(text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_entity_facet(text, uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_contact_alert_counts(uuid[])
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contact_alert_counts(uuid[])
TO authenticated, service_role;
