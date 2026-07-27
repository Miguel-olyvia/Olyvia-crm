-- Start a 14-day, no-card-required trial when a self-registered user creates
-- their first (root) organization — the real, live signup path confirmed via
-- src/pages/Organizations.tsx's isInitialOrganizationCreation branch, which
-- calls this RPC. The register-company Edge Function is a separate, unused
-- all-in-one bootstrap path with zero callers and is intentionally left
-- untouched here.
CREATE OR REPLACE FUNCTION public.create_initial_organization(p_name text, p_type text, p_description text DEFAULT NULL::text, p_status text DEFAULT 'active'::text, p_sector text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_is_fiscal boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_business_user_id uuid;
  v_organization_id uuid := gen_random_uuid();
  v_entity_id uuid := gen_random_uuid();
  v_super_admin_role_id uuid;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF nullif(btrim(p_name), '') IS NULL OR nullif(btrim(p_type), '') IS NULL THEN
    RAISE EXCEPTION 'Organization name and type are required';
  END IF;

  SELECT u.id
  INTO v_business_user_id
  FROM public.anew_users u
  WHERE u.auth_user_id = v_auth_uid
    AND u.registration_origin = 'self_registration'
    AND u.status = 'active';

  IF v_business_user_id IS NULL THEN
    RAISE EXCEPTION 'Only active self-registered users can create their first organization';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_user_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.anew_memberships m
    WHERE m.user_id = v_business_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already has an active organization membership';
  END IF;

  -- Serialize global role creation because anew_roles has no uniqueness constraint.
  PERFORM pg_advisory_xact_lock(hashtextextended('global-role:super_admin', 0));

  SELECT ar.id
  INTO v_super_admin_role_id
  FROM public.anew_roles ar
  WHERE ar.code = 'super_admin'
    AND ar.organization_id IS NULL
    AND ar.is_system = true
  LIMIT 1;

  IF v_super_admin_role_id IS NULL THEN
    INSERT INTO public.anew_roles (
      code,
      name,
      description,
      organization_id,
      is_system,
      is_default,
      can_sign_contracts,
      created_by
    )
    VALUES (
      'super_admin',
      'Super Admin',
      'Dono da organização - acesso total nas suas organizações',
      NULL,
      true,
      false,
      true,
      v_business_user_id
    )
    RETURNING id INTO v_super_admin_role_id;
  END IF;

  INSERT INTO public.anew_entities (
    id, display_name, type, status, created_by
  )
  VALUES (
    v_entity_id, btrim(p_name), 'organization', 'active', v_business_user_id
  );

  INSERT INTO public.anew_organizations (
    id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by, is_work_org
  )
  VALUES (
    v_organization_id,
    btrim(p_name),
    btrim(p_type),
    nullif(btrim(p_description), ''),
    coalesce(nullif(btrim(p_status), ''), 'active'),
    nullif(btrim(p_sector), ''),
    nullif(btrim(p_phone), ''),
    coalesce(p_is_fiscal, false),
    v_entity_id,
    v_business_user_id,
    btrim(p_type) IN ('holding', 'empresa')
  );

  INSERT INTO public.organization_subscriptions (
    organization_id, plan, status, trial_ends_at, created_by
  )
  VALUES (
    v_organization_id, 'trial', 'trialing', now() + interval '14 days', v_business_user_id
  );

  PERFORM public.bootstrap_org_creator(v_organization_id, btrim(p_name));

  IF NOT EXISTS (
    SELECT 1
    FROM public.anew_memberships m
    JOIN public.anew_roles ar ON ar.id = m.role_id
    WHERE m.user_id = v_business_user_id
      AND m.organization_id = v_organization_id
      AND m.status = 'active'
      AND ar.code = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Organization bootstrap did not assign super_admin membership';
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_organization_id,
    'entity_id', v_entity_id
  );
END;
$function$;
