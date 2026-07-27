-- Registo (record-only): fix de identidade em 3 funcoes SECURITY DEFINER que confiavam num
-- p_created_by vindo do cliente. Agora derivam a identidade internamente: auth.uid() tem
-- prioridade absoluta (ignora p_created_by), so service_role server-to-server pode fornecer
-- p_created_by; caso contrario RAISE EXCEPTION 'Autenticacao necessaria'.
-- Ja aplicado diretamente na BD nesta sessao; este ficheiro so evita schema drift num futuro supabase db reset.

-- === create_entity_with_contacts_and_roles ===
CREATE OR REPLACE FUNCTION public.create_entity_with_contacts_and_roles(p_organization_id uuid, p_entity jsonb, p_emails jsonb DEFAULT '[]'::jsonb, p_phones jsonb DEFAULT '[]'::jsonb, p_addresses jsonb DEFAULT '[]'::jsonb, p_roles jsonb DEFAULT '[]'::jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_email jsonb;
  v_phone jsonb;
  v_address jsonb;
  v_role jsonb;
  v_address_id uuid;
  v_address_key text;
  v_street text;
  v_postal text;
  v_city text;
  v_auth_user_id uuid := auth.uid();
  v_request_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  v_created_by uuid;
BEGIN
  -- Identity is derived internally; never trust a client-supplied p_created_by
  -- when the caller is an authenticated user.
  IF v_auth_user_id IS NOT NULL THEN
    v_created_by := public.current_business_user_id();
  ELSIF v_request_role = 'service_role' AND p_created_by IS NOT NULL THEN
    v_created_by := p_created_by;
  ELSE
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_entity IS NULL OR p_entity = 'null'::jsonb THEN
    RAISE EXCEPTION 'p_entity is required';
  END IF;

  -- 1. Create the entity (cross-org, no organization_id column on this table)
  INSERT INTO public.anew_entities (
    type,
    status,
    display_name,
    first_name,
    last_name,
    created_by
  )
  VALUES (
    COALESCE(p_entity->>'type', 'person'),
    COALESCE(p_entity->>'status', 'active'),
    COALESCE(p_entity->>'display_name', 'Entity'),
    NULLIF(p_entity->>'first_name', ''),
    NULLIF(p_entity->>'last_name', ''),
    v_created_by
  )
  RETURNING id INTO v_entity_id;

  -- 2. Emails
  FOR v_email IN SELECT * FROM jsonb_array_elements(COALESCE(p_emails, '[]'::jsonb))
  LOOP
    IF COALESCE(v_email->>'email', '') <> '' THEN
      INSERT INTO public.anew_entity_emails (
        entity_id, email, email_type, is_primary, created_by
      ) VALUES (
        v_entity_id,
        lower(trim(v_email->>'email')),
        COALESCE(v_email->>'email_type', 'personal'),
        COALESCE((v_email->>'is_primary')::boolean, false),
        v_created_by
      );
    END IF;
  END LOOP;

  -- 3. Phones
  FOR v_phone IN SELECT * FROM jsonb_array_elements(COALESCE(p_phones, '[]'::jsonb))
  LOOP
    IF COALESCE(v_phone->>'phone_number', '') <> '' THEN
      INSERT INTO public.anew_entity_phones (
        entity_id, phone_number, phone_type, is_primary, created_by
      ) VALUES (
        v_entity_id,
        trim(v_phone->>'phone_number'),
        COALESCE(v_phone->>'phone_type', 'mobile'),
        COALESCE((v_phone->>'is_primary')::boolean, false),
        v_created_by
      );
    END IF;
  END LOOP;

  -- 4. Addresses
  FOR v_address IN SELECT * FROM jsonb_array_elements(COALESCE(p_addresses, '[]'::jsonb))
  LOOP
    v_street := NULLIF(trim(COALESCE(v_address->>'street', '')), '');
    v_postal := NULLIF(trim(COALESCE(v_address->>'postal_code', '')), '');
    v_city   := NULLIF(trim(COALESCE(v_address->>'city', '')), '');

    -- Defensive: skip placeholder/empty addresses inside the RPC too.
    IF v_street IS NULL OR v_postal IS NULL THEN
      CONTINUE;
    END IF;

    v_address_key := lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, '')));

    INSERT INTO public.anew_addresses (
      address_key, street, number, postal_code, city, district, country, created_by
    ) VALUES (
      v_address_key,
      v_street,
      COALESCE(v_address->>'number', ''),
      v_postal,
      COALESCE(v_city, ''),
      v_address->>'district',
      COALESCE(v_address->>'country', 'PT'),
      v_created_by
    )
    RETURNING id INTO v_address_id;

    INSERT INTO public.anew_entity_addresses (
      entity_id, address_id, address_type, is_primary, created_by
    ) VALUES (
      v_entity_id,
      v_address_id,
      COALESCE(v_address->>'address_type', 'primary'),
      COALESCE((v_address->>'is_primary')::boolean, true),
      v_created_by
    );
  END LOOP;

  -- 5. Roles (require organization_id)
  IF p_organization_id IS NOT NULL THEN
    FOR v_role IN SELECT * FROM jsonb_array_elements(COALESCE(p_roles, '[]'::jsonb))
    LOOP
      IF COALESCE(v_role->>'role', '') <> '' THEN
        INSERT INTO public.anew_entity_roles (
          organization_id, entity_id, role, status,
          source_type, source_id, created_by
        ) VALUES (
          p_organization_id,
          v_entity_id,
          v_role->>'role',
          COALESCE(v_role->>'status', 'active'),
          v_role->>'source_type',
          NULLIF(v_role->>'source_id', '')::uuid,
          v_created_by
        )
        ON CONFLICT (organization_id, entity_id, role) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_entity_id;
END;
$function$
;

-- === assign_address_to_org ===
CREATE OR REPLACE FUNCTION public.assign_address_to_org(p_org_id uuid, p_street text, p_number text, p_floor text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_country text DEFAULT 'PT'::text, p_extra text DEFAULT NULL::text, p_is_fiscal boolean DEFAULT false, p_created_by uuid DEFAULT NULL::uuid, p_existing_address_id uuid DEFAULT NULL::uuid, p_existing_link_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_request_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  v_business_user_id uuid;
  v_created_by uuid;
  v_normalized_street text := btrim(coalesce(p_street, ''));
  v_normalized_number text := btrim(coalesce(p_number, ''));
  v_normalized_floor text := nullif(btrim(coalesce(p_floor, '')), '');
  v_normalized_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_normalized_postal_code text := btrim(coalesce(p_postal_code, ''));
  v_normalized_city text := btrim(coalesce(p_city, ''));
  v_normalized_district text := nullif(btrim(coalesce(p_district, '')), '');
  v_normalized_country text := coalesce(nullif(btrim(coalesce(p_country, '')), ''), 'PT');
  v_normalized_extra text := nullif(btrim(coalesce(p_extra, '')), '');
  v_address_key text;
  v_target_address_id uuid;
  v_duplicate_link_id uuid;
  v_existing_link record;
BEGIN
  -- Identity is derived internally; never trust a client-supplied p_created_by
  -- when the caller is an authenticated user.
  IF v_auth_user_id IS NOT NULL THEN
    SELECT public.current_business_user_id() INTO v_business_user_id;
    v_created_by := v_business_user_id;
  ELSIF v_request_role = 'service_role' AND p_created_by IS NOT NULL THEN
    v_created_by := p_created_by;
  ELSE
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  IF v_normalized_street = '' OR v_normalized_number = '' OR v_normalized_postal_code = '' OR v_normalized_city = '' THEN
    RAISE EXCEPTION 'Street, number, postal code and city are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.anew_organizations o
    WHERE o.id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Org visibility is only enforceable for interactive (auth.uid) callers.
  IF v_auth_user_id IS NOT NULL AND p_org_id NOT IN (
    SELECT public.get_user_visible_org_ids(v_auth_user_id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this organization';
  END IF;

  IF p_existing_link_id IS NOT NULL THEN
    SELECT id, org_id, address_id, valid_to
    INTO v_existing_link
    FROM public.anew_org_addresses
    WHERE id = p_existing_link_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Address link not found';
    END IF;

    IF v_existing_link.org_id <> p_org_id THEN
      RAISE EXCEPTION 'Address link does not belong to this organization';
    END IF;

    IF v_existing_link.valid_to IS NOT NULL THEN
      RAISE EXCEPTION 'Address link is no longer active';
    END IF;
  END IF;

  v_address_key :=
    lower(v_normalized_street) || '|' ||
    lower(v_normalized_number) || '|' ||
    lower(coalesce(v_normalized_floor, '')) || '|' ||
    lower(coalesce(v_normalized_unit, '')) || '|' ||
    lower(v_normalized_postal_code) || '|' ||
    lower(v_normalized_city) || '|' ||
    lower(v_normalized_country);

  SELECT a.id
  INTO v_target_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_address_key
  LIMIT 1;

  IF v_target_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      street,
      number,
      floor,
      unit,
      postal_code,
      city,
      district,
      country,
      extra,
      address_key,
      created_by
    ) VALUES (
      v_normalized_street,
      v_normalized_number,
      v_normalized_floor,
      v_normalized_unit,
      v_normalized_postal_code,
      v_normalized_city,
      v_normalized_district,
      v_normalized_country,
      v_normalized_extra,
      v_address_key,
      v_created_by
    )
    RETURNING id INTO v_target_address_id;
  END IF;

  IF coalesce(p_is_fiscal, false) THEN
    UPDATE public.anew_org_addresses
    SET is_fiscal = false
    WHERE org_id = p_org_id
      AND valid_to IS NULL
      AND (p_existing_link_id IS NULL OR id <> p_existing_link_id);
  END IF;

  SELECT oa.id
  INTO v_duplicate_link_id
  FROM public.anew_org_addresses oa
  WHERE oa.org_id = p_org_id
    AND oa.address_id = v_target_address_id
    AND oa.valid_to IS NULL
    AND (p_existing_link_id IS NULL OR oa.id <> p_existing_link_id)
  LIMIT 1;

  IF p_existing_link_id IS NOT NULL THEN
    IF v_duplicate_link_id IS NOT NULL THEN
      UPDATE public.anew_org_addresses
      SET is_fiscal = coalesce(p_is_fiscal, false)
      WHERE id = v_duplicate_link_id;

      UPDATE public.anew_org_addresses
      SET valid_to = now()
      WHERE id = p_existing_link_id;

      RETURN v_target_address_id;
    END IF;

    UPDATE public.anew_org_addresses
    SET address_id = v_target_address_id,
        is_fiscal = coalesce(p_is_fiscal, false)
    WHERE id = p_existing_link_id;

    RETURN v_target_address_id;
  END IF;

  IF v_duplicate_link_id IS NOT NULL THEN
    UPDATE public.anew_org_addresses
    SET is_fiscal = coalesce(p_is_fiscal, false)
    WHERE id = v_duplicate_link_id;

    RETURN v_target_address_id;
  END IF;

  INSERT INTO public.anew_org_addresses (
    org_id,
    address_id,
    is_fiscal,
    created_by
  ) VALUES (
    p_org_id,
    v_target_address_id,
    coalesce(p_is_fiscal, false),
    v_created_by
  );

  RETURN v_target_address_id;
END;
$function$
;

-- === resolve_proposal_commercial ===
CREATE OR REPLACE FUNCTION public.resolve_proposal_commercial(p_entity_id uuid, p_deal_id uuid, p_org_id uuid, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid := p_entity_id;
  v_result uuid;
  v_auth_user_id uuid := auth.uid();
  v_request_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  v_fallback uuid;
BEGIN
  -- The commercial fallback identity is derived internally; a client-supplied
  -- p_created_by is only trusted for server-to-server (service_role) calls.
  IF v_auth_user_id IS NOT NULL THEN
    v_fallback := public.current_business_user_id();
  ELSIF v_request_role = 'service_role' AND p_created_by IS NOT NULL THEN
    v_fallback := p_created_by;
  ELSE
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_org_id IS NULL THEN
    RETURN v_fallback;
  END IF;

  -- If entity_id is not provided, try to derive it from the deal
  IF v_entity_id IS NULL AND p_deal_id IS NOT NULL THEN
    SELECT d.entity_id
      INTO v_entity_id
      FROM public.deals d
     WHERE d.id = p_deal_id
       AND d.organization_id = p_org_id
       AND d.deleted_at IS NULL
     LIMIT 1;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    -- 1) Client of the same org
    SELECT COALESCE(c.assigned_to, c.created_by)
      INTO v_result
      FROM public.anew_clients c
     WHERE c.entity_id = v_entity_id
       AND c.organization_id = p_org_id
       AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC
     LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;

    -- 2) Contact of the same org
    SELECT COALESCE(co.assigned_to, co.created_by)
      INTO v_result
      FROM public.anew_contacts co
     WHERE co.entity_id = v_entity_id
       AND co.organization_id = p_org_id
       AND co.deleted_at IS NULL
     ORDER BY co.created_at DESC
     LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;

    -- 3) Most recent Lead of the same org
    SELECT COALESCE(l.assigned_to, l.created_by)
      INTO v_result
      FROM public.anew_leads l
     WHERE l.entity_id = v_entity_id
       AND l.organization_id = p_org_id
       AND l.deleted_at IS NULL
     ORDER BY l.created_at DESC
     LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- 4) Final fallback: derived caller identity
  RETURN v_fallback;
END;
$function$
;
