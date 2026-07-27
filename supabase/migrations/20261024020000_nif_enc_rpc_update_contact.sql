-- NIF Encryption — Phase 2b: dual-write in rpc_update_contact
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Context: 20261023010000_fiscal_entities_nif_encryption_targets.sql (Phase 1, additive)
-- already created fiscal_entities.nif_encrypted / fiscal_entities.nif_hash (nullable) and
-- public.fiscal_entity_nif_tokens (service_role-only RLS). 20261024010000 (Phase 2a) made
-- create_contact_with_role dual-write on entity creation. This migration does the same for
-- the ONE remaining write path that touches fiscal_entities.nif on UPDATE:
-- public.rpc_update_contact — both the "existing fiscal link" branch (UPDATE) and the
-- "no fiscal link yet" branch (INSERT) inside its Branch A (section 4, "NIF/VAT").
-- public.fiscal_entities.nif (text NOT NULL) remains the single source of truth for reads;
-- nothing about read behavior changes here.
--
-- Currently vigent version being replaced: 20260725010000_contacts_audit_bypass_and_rpcs.sql
-- (public.rpc_update_contact(...), fiscal_entities read/write around lines 341-387).
--
-- What changes vs. the vigent version
-- ------------------------------------
-- 1. Three new OPTIONAL trailing parameters are appended AFTER the existing 18 (so
--    p_entity_type stays the LAST of the original params, unaffected):
--      p_nif_encrypted text     DEFAULT NULL
--      p_nif_hash      text     DEFAULT NULL
--      p_nif_tokens    text[]   DEFAULT NULL
--    Existing callers using the original 18-argument call (positional or named) are
--    entirely unaffected: all three default to NULL.
-- 2. Existing fiscal link (UPDATE fiscal_entities ... WHERE id = v_fiscal_ent_id): adds
--    nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted) and
--    nif_hash      = COALESCE(p_nif_hash, nif_hash)
--    to the SET clause. COALESCE keeps the PRE-UPDATE column value whenever the caller
--    does not supply the corresponding new parameter (NULL), so a call that omits the 3
--    new params leaves nif_encrypted/nif_hash completely untouched — identical to the
--    prior UPDATE, which never referenced those columns at all.
-- 3. No fiscal link yet (INSERT INTO fiscal_entities ...): this is always a brand-new row,
--    so p_nif_encrypted/p_nif_hash are added straight to the INSERT's column list — no
--    COALESCE needed (nothing pre-existing to preserve; NULL defaults reproduce the exact
--    previous INSERT byte-for-byte when the 3 new params are omitted).
-- 4. Immediately after each of those two writes, when p_nif_tokens IS NOT NULL:
--      - UPDATE branch: DELETE FROM fiscal_entity_nif_tokens WHERE fiscal_entity_id = <id>
--        first (clears tokens for whatever the NIF used to be), THEN INSERT one row per
--        array element, ON CONFLICT DO NOTHING (PK is (fiscal_entity_id, token_hash)).
--      - INSERT branch: brand-new fiscal entity → nothing stale to clear, just INSERT.
-- 5. Absolutely nothing else changes: same DECLAREs, same authorization / anti-tampering /
--    post-mutation reauthorization checks, same Branch A / Branch B structure, same v_diff
--    shape, same fn_manual_audit_log call, same RETURN shape, same SECURITY DEFINER /
--    search_path.
--
-- Self-review (backward compatibility / safety)
-- -----------------------------------------------
-- - Signature is additive-only: 18 params -> 18 + 3 trailing DEFAULT NULL params (21
--   total). Every existing call site that passes exactly the original 18 arguments
--   resolves to this function with the 3 new params defaulting to NULL, and produces the
--   exact same reads/writes/return value as before — the COALESCE guards on the UPDATE
--   path and the "only insert if p_nif_tokens IS NOT NULL" guards on both paths guarantee
--   this: with all three new params NULL, no nif_encrypted/nif_hash column is modified
--   from its prior value, and no fiscal_entity_nif_tokens row is ever inserted or deleted.
-- - CREATE OR REPLACE FUNCTION cannot add parameters to an existing catalog entry (Postgres
--   matches functions by name + argument type list; appending arguments — even with
--   defaults — changes that list, producing a NEW, separate overload rather than replacing
--   the old one). Left as two overloads, a call with the original 18 arguments would be
--   ambiguous between the old 18-arg overload and the new 21-arg overload (whose trailing 3
--   params all have defaults). To prevent that ambiguity and keep exactly one
--   rpc_update_contact in scope, the OLD 18-arg overload is explicitly DROPped below, AFTER
--   the new 21-arg version has been created — the same pattern already used for
--   rpc_update_client's Bug 3 fix in 20260902010000. No other overload of
--   rpc_update_contact exists to be affected.
-- - Reapplication safety: CREATE OR REPLACE FUNCTION on the 21-arg signature is idempotent;
--   DROP FUNCTION IF EXISTS on the 18-arg signature is idempotent (no-op once already
--   dropped); REVOKE/GRANT are idempotent. Re-running this file is safe.

CREATE OR REPLACE FUNCTION public.rpc_update_contact(
  p_contact_id       uuid,
  p_entity_id        uuid,
  p_display_name     text,
  p_norm_first       text,
  p_norm_last        text,
  p_email            text,
  p_phone            text,
  p_phone_country    text,
  p_vat              text,
  p_position         text,
  p_status           text,
  p_notes            text,
  p_organization_id  text,
  p_assigned_to      uuid,
  p_address          text,
  p_city             text,
  p_postal_code      text,
  p_entity_type      text,
  p_nif_encrypted    text DEFAULT NULL,
  p_nif_hash         text DEFAULT NULL,
  p_nif_tokens       text[] DEFAULT NULL
)
RETURNS public.anew_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_now          timestamptz := now();

  v_before_ct    public.anew_contacts;
  v_ct           public.anew_contacts;

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
  v_tax_before       text;
  v_new_fiscal_id    uuid;

  -- address
  v_addr_link_id     uuid;
  v_addr_id          uuid;
  v_addr_before      public.anew_addresses;
  v_new_addr_id      uuid;
  v_street           text;
  v_postal           text;
  v_city             text;
  v_addr_key         text;

  -- entity role sync
  v_org_for_role     uuid;
  v_role_status_before text;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the frontend) ────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load target contact (before-image + authorization subject) ────────────
  SELECT * INTO v_before_ct FROM public.anew_contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contacto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_contacts_update RLS ────────────────────
  -- has_anew_permission('contacts.edit') AND can_access_contact_row(...) against
  -- the target row (its own org/created_by/assigned_to). Identical to the RLS
  -- USING/WITH CHECK predicate on anew_contacts_update.
  IF NOT public.has_anew_permission(auth.uid(), 'contacts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contactos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.can_access_contact_row(
           v_before_ct.organization_id,
           v_before_ct.created_by,
           v_before_ct.assigned_to,
           'contacts.edit') THEN
    RAISE EXCEPTION 'Contacto fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Anti-tampering: p_entity_id must match the target contact's OWN entity_id ─
  -- p_entity_id and p_contact_id are independent parameters supplied by the
  -- caller. Authorizing p_contact_id above says nothing about p_entity_id — a
  -- caller could otherwise pass p_contact_id for a contact they can edit but
  -- p_entity_id pointing at an unrelated entity (any org), letting Branch A
  -- overwrite that entity's identity/email/phone/fiscal/address and its
  -- entity_roles row. anew_contacts.entity_id is fixed per contact, so the only
  -- legitimate value is the one already stored on the authorized row. From here
  -- on, the entity_id actually used is ALWAYS v_before_ct.entity_id — never the
  -- raw p_entity_id parameter.
  IF p_entity_id IS NOT NULL AND p_entity_id IS DISTINCT FROM v_before_ct.entity_id THEN
    RAISE EXCEPTION 'entity_id não corresponde ao contacto' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- BRANCH A: contact HAS an entity_id (the 8-call path)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_before_ct.entity_id IS NOT NULL THEN

    -- ── 1. anew_entities: display_name / first_name / last_name ─────────────
    SELECT * INTO v_ent_before FROM public.anew_entities WHERE id = v_before_ct.entity_id;

    UPDATE public.anew_entities
    SET display_name = p_display_name,
        first_name   = p_norm_first,
        last_name    = p_norm_last,
        updated_at   = v_now
    WHERE id = v_before_ct.entity_id;

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

    -- ── 2. anew_entity_emails: upsert primary (only when email provided) ────
    IF p_email IS NOT NULL AND p_email <> '' THEN
      SELECT id, email INTO v_email_id, v_email_before
      FROM public.anew_entity_emails
      WHERE entity_id = v_before_ct.entity_id AND is_primary = true
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
          (v_before_ct.entity_id, p_email, true, 'personal', v_actor);
        v_diff := v_diff || jsonb_build_object('anew_entity_emails',
          jsonb_build_object('email',
            jsonb_build_object('old', NULL, 'new', to_jsonb(p_email))));
      END IF;
    END IF;

    -- ── 3. anew_entity_phones: upsert primary (only when phone provided) ────
    IF p_phone IS NOT NULL AND p_phone <> '' THEN
      SELECT id, phone_number, country_code
        INTO v_phone_id, v_phone_before, v_phone_cc_before
      FROM public.anew_entity_phones
      WHERE entity_id = v_before_ct.entity_id AND is_primary = true
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
          (v_before_ct.entity_id, p_phone, p_phone_country, true, 'mobile', v_actor);
        v_diff := v_diff || jsonb_build_object('anew_entity_phones',
          jsonb_build_object(
            'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone)),
            'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone_country))
          ));
      END IF;
    END IF;

    -- ── 4. NIF/VAT: fiscal_entities + anew_entity_fiscal_entities ───────────
    IF p_vat IS NOT NULL AND p_vat <> '' THEN
      SELECT id, fiscal_entity_id INTO v_fiscal_link_id, v_fiscal_ent_id
      FROM public.anew_entity_fiscal_entities
      WHERE entity_id = v_before_ct.entity_id AND valid_to IS NULL
      LIMIT 1;

      IF v_fiscal_link_id IS NOT NULL THEN
        -- Real column is `nif` (baseline fiscal_entities.nif). The frontend's
        -- PostgREST call names it `tax_id`, but the authoritative server-side
        -- contact RPCs (20260619100000 / 20260623140000) write `nif` — the actual
        -- VAT/NIF column. We use `nif` so the write is schema-correct and matches
        -- those established RPCs (writing `tax_id` would fail: no such column).
        SELECT nif INTO v_tax_before FROM public.fiscal_entities WHERE id = v_fiscal_ent_id;

        -- Dual-write (Phase 2, additive): COALESCE keeps the PRE-UPDATE column
        -- value whenever the caller does not supply the corresponding new param
        -- (NULL) — a call omitting p_nif_encrypted/p_nif_hash leaves both columns
        -- byte-for-byte untouched, reproducing the previous UPDATE exactly.
        UPDATE public.fiscal_entities
        SET nif = p_vat,
            updated_at = v_now,
            nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
            nif_hash = COALESCE(p_nif_hash, nif_hash)
        WHERE id = v_fiscal_ent_id;
        IF v_tax_before IS DISTINCT FROM p_vat THEN
          v_diff := v_diff || jsonb_build_object('fiscal_entities',
            jsonb_build_object('nif',
              jsonb_build_object('old', to_jsonb(v_tax_before), 'new', to_jsonb(p_vat))));
        END IF;

        -- Dual-write (Phase 2, additive): refresh NIF trigram tokens for this
        -- existing fiscal entity. Clear stale tokens from whatever NIF this row
        -- previously held before inserting the new set.
        IF p_nif_tokens IS NOT NULL THEN
          DELETE FROM public.fiscal_entity_nif_tokens WHERE fiscal_entity_id = v_fiscal_ent_id;
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          SELECT v_fiscal_ent_id, t
          FROM unnest(p_nif_tokens) AS t
          WHERE t IS NOT NULL
          ON CONFLICT DO NOTHING;
        END IF;
      ELSE
        -- entity_type mapping identical to the existing server RPCs:
        -- 'person' → 'individual', otherwise 'company'. The FE passes 'organization'
        -- for companies; anything else (incl. 'person') maps to 'individual'.
        -- Dual-write (Phase 2, additive): brand-new row → no prior value to
        -- preserve, so p_nif_encrypted/p_nif_hash are added straight to the
        -- INSERT's column list (NULL defaults reproduce the prior INSERT exactly).
        INSERT INTO public.fiscal_entities (nif, entity_type, created_by, nif_encrypted, nif_hash)
        VALUES (p_vat,
                CASE WHEN p_entity_type = 'organization' THEN 'company' ELSE 'individual' END,
                v_actor, p_nif_encrypted, p_nif_hash)
        RETURNING id INTO v_new_fiscal_id;

        IF v_new_fiscal_id IS NOT NULL THEN
          INSERT INTO public.anew_entity_fiscal_entities
            (entity_id, fiscal_entity_id, is_primary, created_by)
          VALUES
            (v_before_ct.entity_id, v_new_fiscal_id, true, v_actor);
        END IF;

        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif',
            jsonb_build_object('old', NULL, 'new', to_jsonb(p_vat))));
        v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
          jsonb_build_object('fiscal_entity_id',
            jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_fiscal_id))));

        -- Dual-write (Phase 2, additive): brand-new fiscal entity → nothing stale
        -- to clear, just insert.
        IF v_new_fiscal_id IS NOT NULL AND p_nif_tokens IS NOT NULL THEN
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          SELECT v_new_fiscal_id, t
          FROM unnest(p_nif_tokens) AS t
          WHERE t IS NOT NULL
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;

    -- ── 5. Address: anew_addresses + anew_entity_addresses (primary) ────────
    -- Runs only when any address field is provided (matches the FE condition).
    IF (p_address IS NOT NULL AND p_address <> '')
       OR (p_city IS NOT NULL AND p_city <> '')
       OR (p_postal_code IS NOT NULL AND p_postal_code <> '') THEN

      v_street := COALESCE(p_address, '');
      v_postal := COALESCE(p_postal_code, '');
      v_city   := COALESCE(p_city, '');
      -- address_key: `${street}-${postal}-${city}`.toLowerCase().replace(/\s+/g,'-')
      v_addr_key := regexp_replace(lower(v_street || '-' || v_postal || '-' || v_city), '\s+', '-', 'g');

      SELECT id, address_id INTO v_addr_link_id, v_addr_id
      FROM public.anew_entity_addresses
      WHERE entity_id = v_before_ct.entity_id AND is_primary = true AND valid_to IS NULL
      LIMIT 1;

      IF v_addr_link_id IS NOT NULL THEN
        SELECT * INTO v_addr_before FROM public.anew_addresses WHERE id = v_addr_id;

        UPDATE public.anew_addresses
        SET street      = v_street,
            number      = '',
            city        = v_city,
            postal_code = v_postal,
            country     = 'PT',
            address_key = v_addr_key,
            updated_at  = v_now
        WHERE id = v_addr_id;

        v_sub := '{}'::jsonb;
        IF v_addr_before.street IS DISTINCT FROM v_street THEN
          v_sub := v_sub || jsonb_build_object('street',
            jsonb_build_object('old', to_jsonb(v_addr_before.street), 'new', to_jsonb(v_street)));
        END IF;
        IF v_addr_before.city IS DISTINCT FROM v_city THEN
          v_sub := v_sub || jsonb_build_object('city',
            jsonb_build_object('old', to_jsonb(v_addr_before.city), 'new', to_jsonb(v_city)));
        END IF;
        IF v_addr_before.postal_code IS DISTINCT FROM v_postal THEN
          v_sub := v_sub || jsonb_build_object('postal_code',
            jsonb_build_object('old', to_jsonb(v_addr_before.postal_code), 'new', to_jsonb(v_postal)));
        END IF;
        IF v_sub <> '{}'::jsonb THEN
          v_diff := v_diff || jsonb_build_object('anew_addresses', v_sub);
        END IF;
      ELSE
        v_new_addr_id := gen_random_uuid();
        INSERT INTO public.anew_addresses
          (id, street, number, city, postal_code, country, address_key, updated_at, created_by)
        VALUES
          (v_new_addr_id, v_street, '', v_city, v_postal, 'PT', v_addr_key, v_now, v_actor);

        INSERT INTO public.anew_entity_addresses
          (entity_id, address_id, is_primary, address_type, created_by)
        VALUES
          (v_before_ct.entity_id, v_new_addr_id, true, 'main', v_actor);

        v_diff := v_diff || jsonb_build_object('anew_addresses',
          jsonb_build_object(
            'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_street)),
            'city',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_city)),
            'postal_code', jsonb_build_object('old', NULL, 'new', to_jsonb(v_postal))
          ));
        v_diff := v_diff || jsonb_build_object('anew_entity_addresses',
          jsonb_build_object('address_id',
            jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_addr_id))));
      END IF;
    END IF;

    -- ── 6. anew_contacts: status / notes / position / assigned_to ───────────
    UPDATE public.anew_contacts
    SET status      = p_status,
        notes       = nullif(p_notes, ''),
        position    = nullif(p_position, ''),
        assigned_to = p_assigned_to,
        updated_at  = v_now
    WHERE id = p_contact_id
    RETURNING * INTO v_ct;

    -- ── Post-mutation reauthorization (mirrors anew_contacts_update WITH CHECK) ─
    -- RLS reevaluates WITH CHECK against the AFTER-image on every real UPDATE. A
    -- SECURITY DEFINER function does not, so we replicate it explicitly here:
    -- re-check can_access_contact_row against the row AS WRITTEN (its new
    -- assigned_to). This prevents reassigning a contact this user can edit to an
    -- owner/team outside their scope — exactly what the WITH CHECK would block.
    IF NOT public.can_access_contact_row(
             v_ct.organization_id,
             v_ct.created_by,
             v_ct.assigned_to,
             'contacts.edit') THEN
      RAISE EXCEPTION 'Alteração fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_sub := '{}'::jsonb;
    IF v_before_ct.status IS DISTINCT FROM v_ct.status THEN
      v_sub := v_sub || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_before_ct.status), 'new', to_jsonb(v_ct.status)));
    END IF;
    IF v_before_ct.notes IS DISTINCT FROM v_ct.notes THEN
      v_sub := v_sub || jsonb_build_object('notes',
        jsonb_build_object('old', to_jsonb(v_before_ct.notes), 'new', to_jsonb(v_ct.notes)));
    END IF;
    IF v_before_ct.position IS DISTINCT FROM v_ct.position THEN
      v_sub := v_sub || jsonb_build_object('position',
        jsonb_build_object('old', to_jsonb(v_before_ct.position), 'new', to_jsonb(v_ct.position)));
    END IF;
    IF v_before_ct.assigned_to IS DISTINCT FROM v_ct.assigned_to THEN
      v_sub := v_sub || jsonb_build_object('assigned_to',
        jsonb_build_object('old', to_jsonb(v_before_ct.assigned_to), 'new', to_jsonb(v_ct.assigned_to)));
    END IF;
    IF v_sub <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('anew_contacts', v_sub);
    END IF;

    -- ── 7. anew_entity_roles: sync status for role='contact' in the org ─────
    -- FE: orgId = contact.root_organization_id || contact.organization_id, then
    -- UPDATE ... WHERE entity_id AND role='contact' AND organization_id = orgId.
    v_org_for_role := COALESCE(v_before_ct.root_organization_id, v_before_ct.organization_id);
    IF v_org_for_role IS NOT NULL THEN
      SELECT status INTO v_role_status_before
      FROM public.anew_entity_roles
      WHERE entity_id = v_before_ct.entity_id AND role = 'contact' AND organization_id = v_org_for_role
      LIMIT 1;

      UPDATE public.anew_entity_roles
      SET status = p_status, updated_at = v_now
      WHERE entity_id = v_before_ct.entity_id AND role = 'contact' AND organization_id = v_org_for_role;

      IF FOUND AND v_role_status_before IS DISTINCT FROM p_status THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_roles',
          jsonb_build_object('status',
            jsonb_build_object('old', to_jsonb(v_role_status_before), 'new', to_jsonb(p_status))));
      END IF;
    END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- BRANCH B: no entity_id (legacy fallback — single anew_contacts UPDATE)
  -- ══════════════════════════════════════════════════════════════════════════
  ELSE
    -- ── Reassignment scope guard (mirrors the INSERT/UPDATE RLS org restriction) ─
    -- Branch B can move the contact to p_organization_id (a caller-controlled
    -- parameter). PostgREST would never let a user move a row to an org outside
    -- their visible scope (anew_contacts_insert requires
    -- organization_id IN get_user_visible_org_ids, and the UPDATE WITH CHECK
    -- re-runs can_access_contact_row against the new org). We replicate the org
    -- gate here: when a target org is supplied, it must be visible to the caller.
    IF nullif(p_organization_id, '') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.get_user_visible_org_ids(auth.uid()) AS g(id)
        WHERE g.id = nullif(p_organization_id, '')::uuid
      ) THEN
        RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    UPDATE public.anew_contacts
    SET position        = nullif(p_position, ''),
        status          = p_status,
        notes           = nullif(p_notes, ''),
        organization_id = nullif(p_organization_id, '')::uuid,
        assigned_to     = p_assigned_to,
        updated_at      = v_now
    WHERE id = p_contact_id
    RETURNING * INTO v_ct;

    -- ── Post-mutation reauthorization (mirrors anew_contacts_update WITH CHECK) ─
    -- Re-check the row AS WRITTEN (new organization_id / assigned_to) against the
    -- caller's scope, exactly as RLS WITH CHECK would after a PostgREST UPDATE.
    IF NOT public.can_access_contact_row(
             v_ct.organization_id,
             v_ct.created_by,
             v_ct.assigned_to,
             'contacts.edit') THEN
      RAISE EXCEPTION 'Alteração fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_sub := '{}'::jsonb;
    IF v_before_ct.position IS DISTINCT FROM v_ct.position THEN
      v_sub := v_sub || jsonb_build_object('position',
        jsonb_build_object('old', to_jsonb(v_before_ct.position), 'new', to_jsonb(v_ct.position)));
    END IF;
    IF v_before_ct.status IS DISTINCT FROM v_ct.status THEN
      v_sub := v_sub || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_before_ct.status), 'new', to_jsonb(v_ct.status)));
    END IF;
    IF v_before_ct.notes IS DISTINCT FROM v_ct.notes THEN
      v_sub := v_sub || jsonb_build_object('notes',
        jsonb_build_object('old', to_jsonb(v_before_ct.notes), 'new', to_jsonb(v_ct.notes)));
    END IF;
    IF v_before_ct.organization_id IS DISTINCT FROM v_ct.organization_id THEN
      v_sub := v_sub || jsonb_build_object('organization_id',
        jsonb_build_object('old', to_jsonb(v_before_ct.organization_id), 'new', to_jsonb(v_ct.organization_id)));
    END IF;
    IF v_before_ct.assigned_to IS DISTINCT FROM v_ct.assigned_to THEN
      v_sub := v_sub || jsonb_build_object('assigned_to',
        jsonb_build_object('old', to_jsonb(v_before_ct.assigned_to), 'new', to_jsonb(v_ct.assigned_to)));
    END IF;
    IF v_sub <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('anew_contacts', v_sub);
    END IF;
  END IF;

  -- ── Resolve audit org + entity, then emit ONE consolidated audit row ──────
  -- The generic trigger resolves org for anew_contacts directly from the row's
  -- organization_id; we replicate that, falling back to root_organization_id.
  v_audit_org := COALESCE(v_ct.organization_id, v_ct.root_organization_id,
                          v_before_ct.organization_id, v_before_ct.root_organization_id);

  -- Emit only when something meaningful changed, matching the "skip on no-op"
  -- behavior of the triggers. entity_id is the shared identity (anew_entities.id)
  -- when present, else the contact id — the stable key for this contact's history.
  IF v_diff <> '{}'::jsonb AND v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_contacts',
      COALESCE(v_before_ct.entity_id, p_contact_id),
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_ct;
END;
$$;

-- New signature (3 additive trailing DEFAULT NULL params). Appending arguments changes
-- the catalog identity (name + argtypes), so CREATE OR REPLACE above added a NEW overload
-- rather than truly replacing the old 18-arg one. Drop the old overload explicitly so
-- exactly one rpc_update_contact stays in scope and calls with the original 18 arguments
-- are never ambiguous. Mirrors the same pattern already used for rpc_update_client's Bug 3
-- fix in 20260902010000_contacts_clients_atomic_create_and_fixes.sql.
DROP FUNCTION IF EXISTS public.rpc_update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
);

REVOKE ALL ON FUNCTION public.rpc_update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text,
  text, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text,
  text, text, text[]
) TO authenticated;
