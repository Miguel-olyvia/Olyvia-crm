-- NIF Encryption E2E fix (Bug 2): editing a client without re-typing the NIF
-- silently deletes the fiscal link (real data loss). Confirmed live against
-- org "Nike": rpc_update_client's NIF/VAT block treats "p_vat empty/NULL" as
-- an explicit "remove the NIF" instruction — it invalidates
-- (valid_to = now()) the primary anew_entity_fiscal_entities row with no
-- replacement, and no distinct signal exists for "the caller simply did not
-- touch this field". Before this fix (Bug 1, 20261103030000) the frontend
-- could never even reveal/pre-fill the current NIF, so every edit that didn't
-- manually retype it wiped the fiscal link — but the same risk remains for any
-- partial update where the NIF field legitimately arrives empty (slow reveal,
-- transient network failure, or a user editing an unrelated field).
--
-- Fix: "NIF field empty/NULL in the request" now means "do not touch the
-- existing fiscal link" (the safe default for partial-update forms). Removing
-- an existing NIF link now requires an explicit, unambiguous signal —
-- p_clear_nif boolean, default false — separate from "no NIF was sent".
--
-- Audited every other Phase-2 NIF dual-write RPC for the same pattern
-- (definitions pulled live via pg_get_functiondef, since no single migration
-- file corresponds to their current bodies):
--   - rpc_update_contact:      NIF block only runs `IF p_vat IS NOT NULL AND
--     p_vat <> ''`; there is no ELSE that touches anew_entity_fiscal_entities.
--     Not affected.
--   - rpc_update_user:         NIF block only runs `IF p_fiscal IS NOT NULL
--     AND v_fiscal_nif IS NOT NULL`; empty/absent fiscal data is a full no-op.
--     Not affected.
--   - rpc_update_organization: DOES have the same class of bug, but gated
--     differently — v_has_fiscal := p_is_fiscal AND nif IS NOT NULL, so the
--     ELSE (which deletes every anew_entity_fiscal_entities row for the org's
--     entity) also fires whenever p_is_fiscal = true but p_nif arrives empty
--     (e.g. the same reveal-failure scenario), even though the caller never
--     asked to stop treating the org as fiscal. Fixed below: deletion now only
--     happens on the explicit "not fiscal" signal (p_is_fiscal = false/NULL);
--     "is_fiscal = true but nif not supplied" is now a no-op that preserves
--     the existing link, matching the same safe-by-default rule as rpc_update_client.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) rpc_update_client: add explicit p_clear_nif, make empty p_vat a no-op.
-- Adding a parameter changes the function's identity, so the old 19-arg
-- overload must be dropped explicitly or it stays reachable (unfixed) via any
-- caller that doesn't send p_clear_nif at all under name-based PostgREST
-- dispatch quirks. Drop first, then create the new 20-arg version.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[]
);

CREATE FUNCTION public.rpc_update_client(
  p_client_id            uuid,
  p_entity_id            uuid,
  p_display_name         text,
  p_norm_first           text,
  p_norm_last            text,
  p_email                text,
  p_phone                text,
  p_phone_country        text,
  p_vat                  text,
  p_status               text,
  p_notes                text,
  p_assigned_to          uuid,
  p_address_street       text DEFAULT NULL::text,
  p_address_city         text DEFAULT NULL::text,
  p_address_postal_code  text DEFAULT NULL::text,
  p_address_number       text DEFAULT NULL::text,
  p_nif_encrypted        text DEFAULT NULL::text,
  p_nif_hash             text DEFAULT NULL::text,
  p_nif_tokens           text[] DEFAULT NULL::text[],
  p_clear_nif            boolean DEFAULT false
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor        uuid;
  v_now          timestamptz := now();

  v_before_cl    public.anew_clients;
  v_cl           public.anew_clients;

  v_audit_org    uuid;
  v_diff         jsonb := '{}'::jsonb;
  v_sub          jsonb;

  -- entity
  v_ent_before   public.anew_entities;

  -- email
  v_email_id       uuid;
  v_email_before   text;

  -- phone
  v_phone_id           uuid;
  v_phone_before       text;
  v_phone_cc_before    text;

  -- fiscal
  v_fiscal_link_id   uuid;
  v_fiscal_ent_id    uuid;
  v_nif_before       text;
  v_new_fiscal_id    uuid;
  v_nif_token        text;

  -- address
  v_addr_link_id     uuid;
  v_addr_id          uuid;
  v_addr_before      public.anew_addresses;
  v_addr_after       public.anew_addresses;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the frontend) ────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load target client (before-image + authorization subject) ─────────────
  SELECT * INTO v_before_cl FROM public.anew_clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_clients_update RLS (USING clause) ──────
  IF NOT public.has_anew_permission(auth.uid(), 'clients.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    v_before_cl.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Cliente fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Anti-tampering: p_entity_id must match the target client's OWN entity_id ─
  IF p_entity_id IS NOT NULL AND p_entity_id IS DISTINCT FROM v_before_cl.entity_id THEN
    RAISE EXCEPTION 'entity_id não corresponde ao cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before_cl.entity_id IS NULL THEN
    RETURN v_before_cl;
  END IF;

  -- ── 1. anew_entities: display_name / first_name / last_name ───────────────
  SELECT * INTO v_ent_before FROM public.anew_entities WHERE id = v_before_cl.entity_id;

  UPDATE public.anew_entities
  SET display_name = p_display_name,
      first_name   = p_norm_first,
      last_name    = p_norm_last,
      updated_at   = v_now
  WHERE id = v_before_cl.entity_id;

  IF FOUND THEN
    v_sub := '{}'::jsonb;
    IF v_ent_before.display_name IS DISTINCT FROM p_display_name THEN
      v_sub := v_sub || jsonb_build_object('display_name',
        jsonb_build_object('old', to_jsonb(v_ent_before.display_name), 'new', to_jsonb(p_display_name)));
    END IF;
    IF v_ent_before.first_name IS DISTINCT FROM p_norm_first THEN
      v_sub := v_sub || jsonb_build_object('first_name',
        jsonb_build_object('old', to_jsonb(v_ent_before.first_name), 'new', to_jsonb(p_norm_first)));
    END IF;
    IF v_ent_before.last_name IS DISTINCT FROM p_norm_last THEN
      v_sub := v_sub || jsonb_build_object('last_name',
        jsonb_build_object('old', to_jsonb(v_ent_before.last_name), 'new', to_jsonb(p_norm_last)));
    END IF;
    IF v_sub <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('anew_entities', v_sub);
    END IF;
  END IF;

  -- ── 2. anew_entity_emails: upsert primary (only when email provided) ──────
  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT id, email INTO v_email_id, v_email_before
    FROM public.anew_entity_emails
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_email_id IS NOT NULL THEN
      UPDATE public.anew_entity_emails SET email = p_email WHERE id = v_email_id;
      IF v_email_before IS DISTINCT FROM p_email THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_emails',
          jsonb_build_object('email',
            jsonb_build_object('old', to_jsonb(v_email_before), 'new', to_jsonb(p_email))));
      END IF;
    ELSE
      INSERT INTO public.anew_entity_emails
        (entity_id, email, is_primary, email_type, created_by)
      VALUES
        (v_before_cl.entity_id, p_email, true, 'personal', v_actor);
      v_diff := v_diff || jsonb_build_object('anew_entity_emails',
        jsonb_build_object('email',
          jsonb_build_object('old', NULL, 'new', to_jsonb(p_email))));
    END IF;
  END IF;

  -- ── 3. anew_entity_phones: upsert primary (only when phone provided) ──────
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id, phone_number, country_code
      INTO v_phone_id, v_phone_before, v_phone_cc_before
    FROM public.anew_entity_phones
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_phone_id IS NOT NULL THEN
      UPDATE public.anew_entity_phones
      SET phone_number = p_phone,
          country_code = p_phone_country
      WHERE id = v_phone_id;

      v_sub := '{}'::jsonb;
      IF v_phone_before IS DISTINCT FROM p_phone THEN
        v_sub := v_sub || jsonb_build_object('phone_number',
          jsonb_build_object('old', to_jsonb(v_phone_before), 'new', to_jsonb(p_phone)));
      END IF;
      IF v_phone_cc_before IS DISTINCT FROM p_phone_country THEN
        v_sub := v_sub || jsonb_build_object('country_code',
          jsonb_build_object('old', to_jsonb(v_phone_cc_before), 'new', to_jsonb(p_phone_country)));
      END IF;
      IF v_sub <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_phones', v_sub);
      END IF;
    ELSE
      INSERT INTO public.anew_entity_phones
        (entity_id, phone_number, country_code, is_primary, phone_type, created_by)
      VALUES
        (v_before_cl.entity_id, p_phone, p_phone_country, true, 'mobile', v_actor);
      v_diff := v_diff || jsonb_build_object('anew_entity_phones',
        jsonb_build_object(
          'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone)),
          'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone_country))
        ));
    END IF;
  END IF;

  -- ── 4. anew_clients: status / notes / assigned_to ─────────────────────────
  UPDATE public.anew_clients
  SET status      = p_status,
      notes       = nullif(p_notes, ''),
      assigned_to = p_assigned_to,
      updated_at  = v_now
  WHERE id = p_client_id
  RETURNING * INTO v_cl;

  v_sub := '{}'::jsonb;
  IF v_before_cl.status IS DISTINCT FROM v_cl.status THEN
    v_sub := v_sub || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_cl.status), 'new', to_jsonb(v_cl.status)));
  END IF;
  IF v_before_cl.notes IS DISTINCT FROM v_cl.notes THEN
    v_sub := v_sub || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before_cl.notes), 'new', to_jsonb(v_cl.notes)));
  END IF;
  IF v_before_cl.assigned_to IS DISTINCT FROM v_cl.assigned_to THEN
    v_sub := v_sub || jsonb_build_object('assigned_to',
      jsonb_build_object('old', to_jsonb(v_before_cl.assigned_to), 'new', to_jsonb(v_cl.assigned_to)));
  END IF;
  IF v_sub <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_clients', v_sub);
  END IF;

  -- ── 5. NIF/VAT: fiscal_entities + anew_entity_fiscal_entities ─────────────
  -- FIX (20261103040000): p_vat empty/NULL used to be treated as an implicit
  -- "remove the NIF" instruction, invalidating the primary fiscal link with no
  -- replacement — real data loss on any partial update that doesn't resend the
  -- NIF (slow/failed nif-reveal, or simply editing an unrelated field). Empty
  -- p_vat is now a no-op that preserves the existing link; removal requires
  -- the explicit p_clear_nif = true signal.
  IF p_vat IS NOT NULL AND p_vat <> '' THEN
    SELECT id, fiscal_entity_id INTO v_fiscal_link_id, v_fiscal_ent_id
    FROM public.anew_entity_fiscal_entities
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_fiscal_link_id IS NOT NULL THEN
      SELECT nif INTO v_nif_before FROM public.fiscal_entities WHERE id = v_fiscal_ent_id;
      UPDATE public.fiscal_entities
      SET nif = p_vat,
          nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash = COALESCE(p_nif_hash, nif_hash),
          updated_at = v_now
      WHERE id = v_fiscal_ent_id;
      IF v_nif_before IS DISTINCT FROM p_vat THEN
        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif',
            jsonb_build_object('old', to_jsonb(v_nif_before), 'new', to_jsonb(p_vat))));
      END IF;

      IF p_nif_tokens IS NOT NULL THEN
        DELETE FROM public.fiscal_entity_nif_tokens WHERE fiscal_entity_id = v_fiscal_ent_id;
        FOREACH v_nif_token IN ARRAY p_nif_tokens LOOP
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          VALUES (v_fiscal_ent_id, v_nif_token)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    ELSE
      INSERT INTO public.fiscal_entities (nif, country_code, created_by, nif_encrypted, nif_hash)
      VALUES (p_vat, 'PT', v_actor, p_nif_encrypted, p_nif_hash)
      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
        SET updated_at = now()
      RETURNING id INTO v_new_fiscal_id;

      IF v_new_fiscal_id IS NOT NULL THEN
        INSERT INTO public.anew_entity_fiscal_entities
          (entity_id, fiscal_entity_id, is_primary, created_by)
        VALUES
          (v_before_cl.entity_id, v_new_fiscal_id, true, v_actor);

        IF p_nif_tokens IS NOT NULL THEN
          FOREACH v_nif_token IN ARRAY p_nif_tokens LOOP
            INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
            VALUES (v_new_fiscal_id, v_nif_token)
            ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;
      END IF;

      v_diff := v_diff || jsonb_build_object('fiscal_entities',
        jsonb_build_object('nif',
          jsonb_build_object('old', NULL, 'new', to_jsonb(p_vat))));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
        jsonb_build_object('fiscal_entity_id',
          jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_fiscal_id))));
    END IF;
  ELSIF p_clear_nif THEN
    UPDATE public.anew_entity_fiscal_entities
    SET valid_to = v_now
    WHERE entity_id = v_before_cl.entity_id
      AND is_primary = true
      AND valid_to IS NULL;
    IF FOUND THEN
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
        jsonb_build_object('valid_to',
          jsonb_build_object('old', NULL, 'new', to_jsonb(v_now))));
    END IF;
  END IF;
  -- ELSE (p_vat empty/NULL AND NOT p_clear_nif): no-op — the caller did not
  -- send a NIF and did not explicitly ask to clear it, so the existing
  -- fiscal link is left untouched.

  -- ── 6. Address: anew_addresses + anew_entity_addresses (primary) [NEW] ────
  -- Only when a street AND postal code are provided (mirrors the FE's coherence
  -- guard used elsewhere for address writes). Update the existing OPEN primary
  -- link's address row when one exists (mirrors rpc_update_contact's pattern);
  -- else insert both rows.
  IF p_address_street IS NOT NULL AND p_address_street <> ''
     AND p_address_postal_code IS NOT NULL AND p_address_postal_code <> '' THEN

    SELECT ea.id, ea.address_id INTO v_addr_link_id, v_addr_id
    FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = v_before_cl.entity_id
      AND ea.is_primary = true
      AND ea.valid_to IS NULL
    LIMIT 1;

    IF v_addr_id IS NOT NULL THEN
      SELECT * INTO v_addr_before FROM public.anew_addresses WHERE id = v_addr_id;

      UPDATE public.anew_addresses
      SET street      = p_address_street,
          number      = COALESCE(p_address_number, ''),
          city         = p_address_city,
          postal_code  = p_address_postal_code,
          updated_at   = v_now
      WHERE id = v_addr_id
      RETURNING * INTO v_addr_after;

      v_sub := '{}'::jsonb;
      IF v_addr_before.street IS DISTINCT FROM v_addr_after.street THEN
        v_sub := v_sub || jsonb_build_object('street',
          jsonb_build_object('old', to_jsonb(v_addr_before.street), 'new', to_jsonb(v_addr_after.street)));
      END IF;
      IF v_addr_before.number IS DISTINCT FROM v_addr_after.number THEN
        v_sub := v_sub || jsonb_build_object('number',
          jsonb_build_object('old', to_jsonb(v_addr_before.number), 'new', to_jsonb(v_addr_after.number)));
      END IF;
      IF v_addr_before.city IS DISTINCT FROM v_addr_after.city THEN
        v_sub := v_sub || jsonb_build_object('city',
          jsonb_build_object('old', to_jsonb(v_addr_before.city), 'new', to_jsonb(v_addr_after.city)));
      END IF;
      IF v_addr_before.postal_code IS DISTINCT FROM v_addr_after.postal_code THEN
        v_sub := v_sub || jsonb_build_object('postal_code',
          jsonb_build_object('old', to_jsonb(v_addr_before.postal_code), 'new', to_jsonb(v_addr_after.postal_code)));
      END IF;
      IF v_sub <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('anew_addresses', v_sub);
      END IF;
    ELSE
      INSERT INTO public.anew_addresses
        (address_key, street, number, city, postal_code, country, created_by)
      VALUES
        (lower(regexp_replace(p_address_street || '-' || p_address_postal_code, '\s+', '-', 'g')),
         p_address_street, COALESCE(p_address_number, ''), p_address_city, p_address_postal_code, 'PT', v_actor)
      RETURNING id INTO v_addr_id;

      INSERT INTO public.anew_entity_addresses
        (entity_id, address_id, address_type, is_primary, created_by)
      VALUES
        (v_before_cl.entity_id, v_addr_id, 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_addresses',
        jsonb_build_object(
          'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_street)),
          'city',        jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_city)),
          'postal_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_postal_code))
        ));
      v_diff := v_diff || jsonb_build_object('anew_entity_addresses',
        jsonb_build_object('address_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_addr_id))));
    END IF;
  END IF;

  -- ── Resolve audit org + entity, then emit ONE consolidated audit row ──────
  -- (root_organization_id fallback kept here deliberately — this is just
  -- picking a non-null org id to attribute the audit row to, not an
  -- authorization decision, so it's unaffected by this migration's scope.)
  v_audit_org := COALESCE(v_cl.organization_id, v_cl.root_organization_id,
                          v_before_cl.organization_id, v_before_cl.root_organization_id);

  IF v_diff <> '{}'::jsonb AND v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_clients',
      v_before_cl.entity_id,
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_cl;
END;
$$;

COMMENT ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean
) IS
  'Server-side client update (Phase 2 NIF dual-write). p_vat empty/NULL is a no-op for the fiscal link (preserves the existing NIF) — removing it requires the explicit p_clear_nif = true signal. Fixed 20261103040000: previously any empty p_vat silently invalidated the primary anew_entity_fiscal_entities link with no replacement, a real data-loss bug surfaced by nif-reveal (20261103030000) being unable to pre-fill the NIF for edit forms.';

REVOKE ALL ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean
) FROM PUBLIC;

GRANT ALL ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean
) TO authenticated;

GRANT ALL ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean
) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) rpc_update_organization: same class of bug, narrower trigger. Signature
-- is unchanged (p_is_fiscal already carries an explicit boolean signal from
-- the FE's "is fiscal" checkbox), so CREATE OR REPLACE is sufficient here —
-- no DROP needed.
-- ─────────────────────────────────────────────────────────────────────────────

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
  p_nif_encrypted   text DEFAULT NULL::text,
  p_nif_hash        text DEFAULT NULL::text,
  p_nif_tokens      text[] DEFAULT NULL::text[]
)
RETURNS public.anew_organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

  -- ── Fiscal: upsert when isFiscal && nif; explicit isFiscal=false clears it;
  -- FIX (20261103040000): isFiscal=true but nif not supplied (or blank) is now
  -- a no-op that preserves the existing fiscal link instead of deleting it.
  -- Before this fix, v_has_fiscal = false covered BOTH "explicitly not fiscal"
  -- AND "still fiscal but the NIF field arrived empty" (e.g. a nif-reveal
  -- failure on the edit form), and both cases hit the same unconditional
  -- DELETE below — silently wiping the org's fiscal link even though the
  -- caller never asked to stop treating it as fiscal. Same cardinality parity
  -- as rpc_create_organization / orgFiscalEntity.ts L27-53 otherwise unchanged:
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
  ELSIF NOT COALESCE(p_is_fiscal, false) THEN
    -- Explicit signal: the org is no longer marked fiscal at all — clear the
    -- fiscal links on the org's entity (unchanged from prior behavior).
    -- Unchanged: no fiscal_entities / fiscal_entity_nif_tokens write happens here,
    -- matching the live function exactly.
    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
  END IF;
  -- ELSE (p_is_fiscal = true but v_nif is NULL/blank): no-op — the caller still
  -- wants the org treated as fiscal but didn't (re)send the NIF, so the
  -- existing fiscal link is preserved rather than silently deleted.

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

COMMENT ON FUNCTION public.rpc_update_organization(
  uuid, text, text, text, text, text, text, boolean, uuid, text, text, text, jsonb, text, text, text[]
) IS
  'Server-side organization update (Phase 2 NIF dual-write). Fiscal link is only cleared on the explicit "not fiscal" signal (p_is_fiscal = false/NULL). Fixed 20261103040000: previously p_is_fiscal = true combined with an empty/NULL p_nif (e.g. a nif-reveal failure on the edit form) also fell into the delete branch, silently wiping the org''s fiscal link even though the caller never unset "is fiscal". That combination is now a no-op that preserves the existing link.';
