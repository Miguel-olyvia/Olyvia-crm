-- NIF Encryption — Phase 2a: dual-write in create_contact_with_role
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Context: 20261023010000_fiscal_entities_nif_encryption_targets.sql (Phase 1, additive)
-- already created fiscal_entities.nif_encrypted / fiscal_entities.nif_hash (nullable) and
-- public.fiscal_entity_nif_tokens (service_role-only RLS). public.fiscal_entities.nif
-- (text NOT NULL) remains the single source of truth for reads; this migration does NOT
-- change that. It only makes the ONE existing write path that inserts a brand-new
-- fiscal_entities row for a newly-created contact/entity (public.create_contact_with_role)
-- ALSO populate the encrypted/hash/token destinations, when the caller supplies them.
--
-- Currently vigent version being replaced: 20260902010000_contacts_clients_atomic_create_and_fixes.sql
-- (public.create_contact_with_role(jsonb), fiscal_entities INSERT around line 164).
--
-- What changes vs. the vigent version
-- ------------------------------------
-- 1. Three new OPTIONAL trailing parameters are appended AFTER p_payload:
--      p_nif_encrypted text     DEFAULT NULL
--      p_nif_hash      text     DEFAULT NULL
--      p_nif_tokens    text[]   DEFAULT NULL
--    Existing callers (positional or named) that only ever pass p_payload are entirely
--    unaffected: all three default to NULL, which reproduces byte-for-byte the previous
--    fiscal_entities INSERT (nif_encrypted/nif_hash columns are nullable and already
--    default to NULL when omitted from an INSERT's column list).
-- 2. The lone fiscal_entities write in this function is an INSERT of a brand-new row (a
--    new entity is always being created in this code path when v_vat is present — see
--    v_entity_created_here immediately above). There is therefore no prior row whose
--    nif_encrypted/nif_hash could be clobbered; p_nif_encrypted/p_nif_hash are added
--    straight to the INSERT's column list.
-- 3. Immediately after that INSERT, when p_nif_tokens IS NOT NULL, one row per element is
--    inserted into fiscal_entity_nif_tokens (fiscal_entity_id, token_hash), ON CONFLICT DO
--    NOTHING (PK is (fiscal_entity_id, token_hash)). Because this is a brand-new fiscal
--    entity, there is nothing stale to DELETE first.
-- 4. Absolutely nothing else changes: same DECLAREs, same validations, same
--    app.audit_bypass consolidation, same v_diff shape, same fn_manual_audit_log call,
--    same RETURN shape, same SECURITY DEFINER / search_path.
--
-- Self-review (backward compatibility / safety)
-- -----------------------------------------------
-- - Signature is additive-only: (jsonb) -> (jsonb, text DEFAULT NULL, text DEFAULT NULL,
--   text[] DEFAULT NULL). Every existing call site (frontend RPC calls that pass only
--   p_payload) resolves to this function with the 3 new params defaulting to NULL and
--   produces the exact same INSERT/side effects/return value as before.
-- - CREATE OR REPLACE FUNCTION cannot be used to add parameters to an existing catalog
--   entry (Postgres matches functions by name + argument type list, and appending
--   arguments — even with defaults — changes that list, so it creates a NEW, separate
--   overload rather than truly replacing the old one). Left as-is, calling with a single
--   jsonb argument would be ambiguous between the old 1-arg overload and the new 4-arg
--   overload (whose trailing 3 params all have defaults). To prevent that ambiguity and
--   guarantee exactly one create_contact_with_role stays in scope, the OLD (jsonb)
--   overload is explicitly DROPped below, AFTER the new 4-arg version has been created —
--   mirroring the exact pattern already used for rpc_update_client's Bug 3 fix in
--   20260902010000. No other overload of create_contact_with_role exists to be affected.
-- - Reapplication safety: CREATE OR REPLACE FUNCTION on the 4-arg signature is idempotent;
--   DROP FUNCTION IF EXISTS on the 1-arg signature is idempotent (no-op once already
--   dropped); REVOKE/GRANT are idempotent. Re-running this file is safe.

CREATE OR REPLACE FUNCTION public.create_contact_with_role(
  p_payload jsonb,
  p_nif_encrypted text DEFAULT NULL,
  p_nif_hash text DEFAULT NULL,
  p_nif_tokens text[] DEFAULT NULL
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
  v_entity_created_here boolean := false;
  v_fiscal_entity_id uuid;
  v_org_link_inserted boolean := false;
  v_role_before_status text;
  v_diff jsonb := '{}'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'p_payload is required';
  END IF;

  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

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

  SELECT *
  INTO v_ctx
  FROM public.resolve_contact_access_context(v_org_id, 'ORG', 'contacts.create');

  IF v_entity_id IS NULL THEN
    IF v_display_name IS NULL OR BTRIM(v_display_name) = '' THEN
      RAISE EXCEPTION 'displayName is required to create a new entity';
    END IF;

    v_entity_created_here := true;

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

    v_diff := v_diff || jsonb_build_object('anew_entities', jsonb_build_object(
      'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_id)),
      'type',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_type)),
      'display_name', jsonb_build_object('old', NULL, 'new', to_jsonb(v_display_name)),
      'first_name',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_first_name)),
      'last_name',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_last_name))
    ));

    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, is_primary, created_by)
      VALUES (v_entity_id, v_email, true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_emails', jsonb_build_object(
        'email',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_email)),
        'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
      VALUES (v_entity_id, v_phone, COALESCE(v_phone_cc, '+351'), 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_phones', jsonb_build_object(
        'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone)),
        'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(v_phone_cc, '+351'))),
        'is_primary',   jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_vat IS NOT NULL THEN
      -- Dual-write (Phase 2, additive): populate nif_encrypted/nif_hash alongside the
      -- plaintext nif when the caller supplies them. This is always a brand-new
      -- fiscal_entities row in this code path (v_entity_created_here is always true
      -- when we reach here), so there is no prior value to preserve — NULL defaults
      -- reproduce the exact previous INSERT byte-for-byte.
      INSERT INTO public.fiscal_entities (nif, entity_type, created_by, nif_encrypted, nif_hash)
      VALUES (v_vat, CASE WHEN v_entity_type = 'person' THEN 'individual' ELSE 'company' END, v_actor,
              p_nif_encrypted, p_nif_hash)
      RETURNING id INTO v_fiscal_entity_id;

      INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
      VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);

      v_diff := v_diff || jsonb_build_object('fiscal_entities', jsonb_build_object(
        'nif', jsonb_build_object('old', NULL, 'new', to_jsonb(v_vat))
      ));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities', jsonb_build_object(
        'fiscal_entity_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_fiscal_entity_id))
      ));

      -- Dual-write (Phase 2, additive): NIF trigram tokens for tokenized partial-match
      -- search. Brand-new fiscal_entities row → nothing stale to clear, just insert.
      IF p_nif_tokens IS NOT NULL THEN
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        SELECT v_fiscal_entity_id, t
        FROM unnest(p_nif_tokens) AS t
        WHERE t IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- Use WHERE NOT EXISTS instead of ON CONFLICT DO NOTHING to avoid firing
  -- the BEFORE trigger when the org link already exists (20260623140000 fix, preserved).
  INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary)
  SELECT v_entity_id, v_org_id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_entity_org_links
    WHERE entity_id = v_entity_id AND organization_id = v_org_id
  );
  GET DIAGNOSTICS v_org_link_inserted = ROW_COUNT;
  IF v_org_link_inserted THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_org_links', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_org_id)),
      'is_primary',      jsonb_build_object('old', NULL, 'new', to_jsonb(true))
    ));
  END IF;

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

  v_diff := v_diff || jsonb_build_object('anew_contacts', jsonb_build_object(
    'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_contact_id)),
    'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_status)),
    'source_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_source_type)),
    'assigned_to', jsonb_build_object('old', NULL, 'new', to_jsonb(v_assigned_to))
  ));

  SELECT er.id, er.status
  INTO v_role_id, v_role_before_status
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

    v_diff := v_diff || jsonb_build_object('anew_entity_roles', jsonb_build_object(
      'contact', jsonb_build_object('old', NULL, 'new', to_jsonb(v_status))
    ));
  ELSE
    UPDATE public.anew_entity_roles
    SET status = v_status,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = now()
    WHERE id = v_role_id;

    IF v_role_before_status IS DISTINCT FROM v_status THEN
      v_diff := v_diff || jsonb_build_object('anew_entity_roles', jsonb_build_object(
        'contact', jsonb_build_object('old', to_jsonb(v_role_before_status), 'new', to_jsonb(v_status))
      ));
    END IF;
  END IF;

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

  -- ── Emit ONE consolidated audit row keyed on entity_id ─────────────────────
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_contacts',
      v_entity_id,
      v_org_id,
      'INSERT',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'entity_id', v_entity_id,
    'role_id', v_role_id,
    'organization_id', v_org_id
  );
END;
$$;

-- New signature (3 additive trailing DEFAULT NULL params). Appending arguments changes
-- the catalog identity (name + argtypes), so CREATE OR REPLACE above added a NEW overload
-- rather than truly replacing the old (jsonb) one. Drop the old 1-arg overload explicitly
-- so exactly one create_contact_with_role stays in scope and calls with a single jsonb
-- argument are never ambiguous. Mirrors the same pattern used for rpc_update_client's
-- Bug 3 fix in 20260902010000_contacts_clients_atomic_create_and_fixes.sql.
DROP FUNCTION IF EXISTS public.create_contact_with_role(jsonb);

REVOKE ALL ON FUNCTION public.create_contact_with_role(jsonb, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact_with_role(jsonb, text, text, text[]) TO authenticated;
