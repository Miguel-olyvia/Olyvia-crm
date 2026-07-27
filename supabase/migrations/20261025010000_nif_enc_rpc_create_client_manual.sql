-- NIF Encryption — Phase 2: dual-write from rpc_create_client_manual
-- Forward-only migration. Do not fold into the baseline.
--
-- `public.fiscal_entities.nif` (text NOT NULL) remains the single source of
-- truth for reads. This migration only adds the ability for callers to ALSO
-- supply the pre-computed encrypted/hashed/tokenized representations so they
-- get written alongside `nif` in the same INSERT. It changes nothing about
-- existing behavior when the 3 new trailing parameters are omitted.
--
-- Base signature/body carried forward verbatim from the currently live
-- definition in 20260903010000_rpc_create_client_manual_entity_creation.sql
-- (no later migration has touched rpc_create_client_manual). Only the
-- `IF v_vat IS NOT NULL THEN ... INSERT INTO public.fiscal_entities (...)`
-- branch gains the 3 new columns/values plus the token fan-out insert; every
-- other line is byte-identical.

CREATE OR REPLACE FUNCTION public.rpc_create_client_manual(
  p_entity_id             uuid,
  p_organization_id       uuid,
  p_root_organization_id  uuid,
  p_status                text,
  p_client_type           text,
  p_address_street        text,
  p_address_number        text,
  p_address_floor         text,
  p_address_city          text,
  p_address_postal_code   text,
  p_address_district      text,
  p_display_name          text DEFAULT NULL,
  p_first_name            text DEFAULT NULL,
  p_last_name             text DEFAULT NULL,
  p_email                 text DEFAULT NULL,
  p_phone                 text DEFAULT NULL,
  p_phone_country_code    text DEFAULT NULL,
  p_vat                   text DEFAULT NULL,
  p_nif_encrypted         text DEFAULT NULL,
  p_nif_hash              text DEFAULT NULL,
  p_nif_tokens            text[] DEFAULT NULL
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor         uuid;
  v_client        public.anew_clients;
  v_existing      public.anew_clients;
  v_role_id       uuid;
  v_role_before   text;
  v_address_id    uuid;
  v_address_key   text;
  v_diff          jsonb := '{}'::jsonb;
  v_client_diff   jsonb := '{}'::jsonb;
  v_entity_type   text;
  v_email         text;
  v_phone         text;
  v_vat           text;
  v_fiscal_entity_id uuid;
  v_nif_token     text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'clients.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── 0. Create the entity itself when none was resolved (mirrors
  --      create_contact_with_role's entity-creation branch, 20260902010000) ─────
  IF p_entity_id IS NULL THEN
    IF p_display_name IS NULL OR BTRIM(p_display_name) = '' THEN
      RAISE EXCEPTION 'displayName is required to create a new entity';
    END IF;

    v_entity_type := 'person';
    v_email := NULLIF(BTRIM(COALESCE(p_email, '')), '');
    v_phone := NULLIF(BTRIM(COALESCE(p_phone, '')), '');
    v_vat := NULLIF(BTRIM(COALESCE(p_vat, '')), '');

    INSERT INTO public.anew_entities (
      type,
      display_name,
      created_by,
      first_name,
      last_name
    )
    VALUES (
      v_entity_type,
      p_display_name,
      v_actor,
      p_first_name,
      p_last_name
    )
    RETURNING id INTO p_entity_id;

    v_diff := v_diff || jsonb_build_object('anew_entities', jsonb_build_object(
      'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(p_entity_id)),
      'type',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_type)),
      'display_name', jsonb_build_object('old', NULL, 'new', to_jsonb(p_display_name)),
      'first_name',   jsonb_build_object('old', NULL, 'new', to_jsonb(p_first_name)),
      'last_name',    jsonb_build_object('old', NULL, 'new', to_jsonb(p_last_name))
    ));

    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, is_primary, created_by)
      VALUES (p_entity_id, v_email, true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_emails', jsonb_build_object(
        'email',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_email)),
        'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
      VALUES (p_entity_id, v_phone, COALESCE(p_phone_country_code, '+351'), 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_phones', jsonb_build_object(
        'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone)),
        'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_phone_country_code, '+351'))),
        'is_primary',   jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_vat IS NOT NULL THEN
      INSERT INTO public.fiscal_entities (nif, entity_type, created_by, nif_encrypted, nif_hash)
      VALUES (v_vat, CASE WHEN v_entity_type = 'person' THEN 'individual' ELSE 'company' END, v_actor,
              p_nif_encrypted, p_nif_hash)
      RETURNING id INTO v_fiscal_entity_id;

      INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
      VALUES (p_entity_id, v_fiscal_entity_id, true, v_actor);

      IF p_nif_tokens IS NOT NULL THEN
        FOREACH v_nif_token IN ARRAY p_nif_tokens LOOP
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          VALUES (v_fiscal_entity_id, v_nif_token)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;

      v_diff := v_diff || jsonb_build_object('fiscal_entities', jsonb_build_object(
        'nif', jsonb_build_object('old', NULL, 'new', to_jsonb(v_vat))
      ));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities', jsonb_build_object(
        'fiscal_entity_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_fiscal_entity_id))
      ));
    END IF;
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entidade obrigatória para criar cliente' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── 1. anew_clients: reuse existing non-deleted row (reactivate) or insert ──
  SELECT * INTO v_existing
  FROM public.anew_clients
  WHERE entity_id = p_entity_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.anew_clients
    SET status = COALESCE(p_status, 'active'),
        deleted_at = NULL,
        source_type = 'manual',
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_client;

    IF v_existing.status IS DISTINCT FROM v_client.status THEN
      v_client_diff := v_client_diff || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_existing.status), 'new', to_jsonb(v_client.status)));
    END IF;
  ELSE
    INSERT INTO public.anew_clients
      (entity_id, root_organization_id, organization_id, status, client_type,
       source_type, created_by)
    VALUES
      (p_entity_id, COALESCE(p_root_organization_id, p_organization_id), p_organization_id,
       COALESCE(p_status, 'active'), p_client_type, 'manual', v_actor)
    RETURNING * INTO v_client;

    v_client_diff := jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.id)),
      'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.status)),
      'client_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.client_type))
    );
  END IF;

  IF v_client_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_clients', v_client_diff);
  END IF;

  -- ── 2. anew_entity_roles: role='client' ─────────────────────────────────────
  SELECT id, status INTO v_role_id, v_role_before
  FROM public.anew_entity_roles
  WHERE entity_id = p_entity_id AND role = 'client' AND organization_id = p_organization_id
  LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.anew_entity_roles
      (entity_id, role, status, organization_id, source_type, created_by)
    VALUES
      (p_entity_id, 'client', 'active', p_organization_id, 'manual', v_actor);

    v_diff := v_diff || jsonb_build_object('anew_entity_roles',
      jsonb_build_object('client', jsonb_build_object('old', NULL, 'new', to_jsonb('active'::text))));
  ELSIF v_role_before IS DISTINCT FROM 'active' THEN
    UPDATE public.anew_entity_roles SET status = 'active', updated_at = now() WHERE id = v_role_id;
    v_diff := v_diff || jsonb_build_object('anew_entity_roles',
      jsonb_build_object('client', jsonb_build_object('old', to_jsonb(v_role_before), 'new', to_jsonb('active'::text))));
  END IF;

  -- ── 3. Primary address (only when street + postal code provided) ───────────
  -- Mirrors createClientRecord()'s addr.postal_code && addr.street guard exactly.
  IF p_address_postal_code IS NOT NULL AND p_address_postal_code <> ''
     AND p_address_street IS NOT NULL AND p_address_street <> '' THEN
    v_address_key := lower(regexp_replace(
      p_address_street || '-' || COALESCE(p_address_number, '') || '-' || p_address_postal_code,
      '\s+', '-', 'g'
    ));

    INSERT INTO public.anew_addresses
      (address_key, street, number, floor, city, postal_code, district, country, created_by)
    VALUES
      (v_address_key, p_address_street, COALESCE(p_address_number, ''), p_address_floor,
       p_address_city, p_address_postal_code, p_address_district, 'PT', v_actor)
    RETURNING id INTO v_address_id;

    INSERT INTO public.anew_entity_addresses
      (entity_id, address_id, address_type, is_primary, created_by)
    VALUES
      (p_entity_id, v_address_id, 'work', true, v_actor);

    v_diff := v_diff || jsonb_build_object('anew_addresses', jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_address_id)),
      'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_street)),
      'city',        jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_city)),
      'postal_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_postal_code))
    ));
    v_diff := v_diff || jsonb_build_object('anew_entity_addresses', jsonb_build_object(
      'address_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_address_id)),
      'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(true))
    ));
  END IF;

  -- ── Emit ONE consolidated audit row keyed on entity_id ─────────────────────
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_clients',
      p_entity_id,
      p_organization_id,
      'INSERT',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_client;
END;
$$;

-- Old 18-arg signature (through p_vat) is superseded by this 21-arg overload
-- (3 new trailing DEFAULT NULL params) — drop it so PostgREST/PostgreSQL
-- don't have to disambiguate two overloads with the same leading parameters.
DROP FUNCTION IF EXISTS public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
);

REVOKE ALL ON FUNCTION public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text,
  text, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text,
  text, text, text[]
) TO authenticated;
