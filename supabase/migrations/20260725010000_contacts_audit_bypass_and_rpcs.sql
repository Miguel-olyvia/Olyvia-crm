-- Contactos — single-log RPC (reuses the shared audit-bypass foundation)
-- 2026-07-25 | Module: Contactos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one "save contact" action (handleUpdateContact in
-- src/components/ContactDetailsDialog.tsx, lines ~500-641) is issued from the
-- frontend as up to 8 independent Supabase calls, each its own Postgres
-- transaction:
--   1. UPDATE anew_entities (display_name, first_name, last_name)
--   2. UPSERT anew_entity_emails (primary)
--   3. UPSERT anew_entity_phones (primary)
--   4. UPSERT fiscal_entities + anew_entity_fiscal_entities (NIF/VAT link)
--      (the FE names the column tax_id via PostgREST; the real, schema-correct
--       column is fiscal_entities.nif — see the fiscal section for the note)
--   5. UPSERT anew_addresses + anew_entity_addresses (primary address)
--   6. UPDATE anew_contacts (status, notes, position, assigned_to)
--   7. UPDATE anew_entity_roles (status sync for role='contact')
-- Every one of those tables carries an AFTER trigger (fn_generic_entity_audit)
-- that writes to entity_audit_log, so a single user action produces N audit rows
-- when the business intent is exactly ONE.
--
-- Solution
-- --------
-- rpc_update_contact(...) reproduces, field-for-field and condition-for-condition,
-- what handleUpdateContact does today — BOTH the "has entity_id" branch (the 8
-- calls above) and the "no entity_id" fallback branch (a single anew_contacts
-- UPDATE with a different column set) — inside ONE transaction with
-- app.audit_bypass = 'on', accumulates a combined diff across ALL touched tables
-- ({table:{col:{old,new}}}), and calls fn_manual_audit_log ONCE.
--
-- entity_id NEVER changes for the same contact: anew_entities is the shared
-- identity and is the entity_id used for the single audit row, regardless of how
-- many satellite facets (emails/phones/fiscal/addresses/roles) are touched.
--
-- Foundation
-- ----------
-- The audit-bypass foundation (app.audit_bypass guard at the top of
-- fn_generic_entity_audit() + reusable fn_manual_audit_log(...)) already exists;
-- it was introduced by 20260719010000_roles_audit_bypass_and_rpcs.sql. This
-- migration REUSES it and does NOT recreate it.
--
-- Authorization / RLS parity
-- --------------------------
-- rpc_update_contact is SECURITY DEFINER, so RLS on the underlying tables does NOT
-- self-enforce inside it. It therefore re-checks, explicitly, the SAME predicate
-- the active anew_contacts_update policy enforces today
-- (20260619090000_contacts_security_scope_integrity.sql, lines ~312-333):
--     has_anew_permission(auth.uid(), 'contacts.edit')
--       AND can_access_contact_row(organization_id, created_by, assigned_to, 'contacts.edit')
-- evaluated against the TARGET anew_contacts row (its own organization_id,
-- created_by, assigned_to — the before-image), exactly as the RLS USING clause
-- would. A caller who cannot edit this contact under RLS is rejected here with the
-- same effect. This mirrors the frontend's own canEditContact gate
-- (usePermissionScope + canActOnEntity) but is enforced server-side.
--
-- The anew_contacts_update policy also carries a WITH CHECK clause that Postgres
-- RLS reevaluates against the AFTER-image on every real UPDATE via PostgREST. A
-- SECURITY DEFINER function bypasses RLS entirely, so it must reproduce WITH CHECK
-- itself: after EACH anew_contacts UPDATE (both branches) the RPC re-runs
-- can_access_contact_row against the row AS WRITTEN (its new organization_id /
-- assigned_to) and RAISES insufficient_privilege on failure. This blocks reassigning
-- a contact the user can edit to an owner/team/org outside their scope — the exact
-- guarantee the WITH CHECK provides. Additionally, Branch B (which can move the
-- contact to a caller-supplied p_organization_id) validates that target org is in
-- get_user_visible_org_ids(auth.uid()) before writing, mirroring the org restriction
-- the INSERT/UPDATE RLS enforces implicitly.
--
-- The satellite writes (anew_entities / emails / phones / fiscal / addresses /
-- roles) are all keyed to the SAME entity_id that belongs to this authorized
-- contact, so authorizing the contact row authorizes the whole atomic unit,
-- exactly as the frontend does today (it performs all writes for one contact the
-- user already opened and can edit).
--
-- Actor resolution parity
-- -----------------------
-- The frontend computes businessUserId = resolveCurrentBusinessUserId() and uses
-- it for created_by on every INSERT. The RPC uses public.current_business_user_id()
-- (the same server-side identity) and RAISES 'Perfil de utilizador não encontrado'
-- when it is NULL — matching the frontend's "Business user not found" guard.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log + fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass guard + fn_manual_audit_log(...)
--   20260619090000_contacts_security_scope_integrity.sql — can_access_contact_row(), anew_contacts_update RLS
--   20260615130000_baseline_new_database.sql        — has_anew_permission(), current_business_user_id(),
--                                                      anew_* tables + RLS


-- ============================================================
-- rpc_update_contact(...)
-- ============================================================
-- Mirrors handleUpdateContact in src/components/ContactDetailsDialog.tsx.
--
-- Parameters carry exactly what the frontend form (editFormData) sends plus the
-- entity type (needed for fiscal_entities.entity_type when a new fiscal entity is
-- created, matching entityType === "organization" ? "company" : "individual").
--
--   p_contact_id        — anew_contacts.id (contact.id)
--   p_entity_id         — anew_entities.id (contact.entity_id); NULL routes to the
--                         legacy no-entity fallback branch. SECURITY: this value
--                         is validated against the target contact's own
--                         entity_id (loaded server-side from p_contact_id) and
--                         rejected on mismatch — it is NEVER trusted as-is for
--                         any write. All entity-scoped writes in Branch A use
--                         v_before_ct.entity_id, not this parameter directly.
--   p_first_name        — editFormData.first_name (raw; normalized in-RPC)
--   p_last_name         — editFormData.last_name  (raw; normalized in-RPC)
--   p_display_name      — composed display name (FE composes via composeDisplayName
--                         over the normalized first/last; passed in to keep the
--                         exact same normalization/composition the FE uses)
--   p_norm_first        — normalized first (FE: normalizeFirstLast().first)
--   p_norm_last         — normalized last  (FE: normalizeFirstLast().last)
--   p_email             — editFormData.email
--   p_phone             — editFormData.phone
--   p_phone_country     — editFormData.phone_country_code
--   p_vat               — editFormData.vat
--   p_position          — editFormData.position
--   p_status            — editFormData.status
--   p_notes             — editFormData.notes
--   p_organization_id   — editFormData.organization_id (only used in fallback branch)
--   p_assigned_to       — editFormData.assigned_to (uuid | NULL)
--   p_address           — editFormData.address (street)
--   p_city              — editFormData.city
--   p_postal_code       — editFormData.postal_code
--   p_entity_type       — 'organization' | 'person' (contact/entity type)
--
-- Returns the updated anew_contacts row.

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
  p_entity_type      text
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
        UPDATE public.fiscal_entities
        SET nif = p_vat, updated_at = v_now
        WHERE id = v_fiscal_ent_id;
        IF v_tax_before IS DISTINCT FROM p_vat THEN
          v_diff := v_diff || jsonb_build_object('fiscal_entities',
            jsonb_build_object('nif',
              jsonb_build_object('old', to_jsonb(v_tax_before), 'new', to_jsonb(p_vat))));
        END IF;
      ELSE
        -- entity_type mapping identical to the existing server RPCs:
        -- 'person' → 'individual', otherwise 'company'. The FE passes 'organization'
        -- for companies; anything else (incl. 'person') maps to 'individual'.
        INSERT INTO public.fiscal_entities (nif, entity_type, created_by)
        VALUES (p_vat,
                CASE WHEN p_entity_type = 'organization' THEN 'company' ELSE 'individual' END,
                v_actor)
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

REVOKE ALL ON FUNCTION public.rpc_update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass foundation is reused (not recreated) — the guard already exists:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_generic_entity_audit', 'fn_manual_audit_log')
--     AND prosrc LIKE '%app.audit_bypass%';   -- fn_generic_entity_audit present
--
-- 2. One "save contact" touching entities+email+phone+fiscal+address+contacts+roles
--    produces EXACTLY ONE audit row:
--   SELECT public.rpc_update_contact('<contact>','<entity>', 'Ana Silva','Ana','Silva',
--          'ana@x.pt','912345678','+351','PT123456789','CEO','active','n', NULL,
--          '<user>','Rua A','Lisboa','1000-001','person');
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE entity_id = '<entity>' AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not up to 8), with changed_fields namespaced per table.
--
-- 3. A caller lacking contacts.edit, or whose scope excludes the target contact
--    (can_access_contact_row = false), raises insufficient_privilege — matching
--    the anew_contacts_update RLS policy exactly.
--
-- 4. No-op save (nothing changed) writes zero audit rows, mirroring the triggers'
--    "skip when changed_fields is empty" behavior.
--
-- 5. IDOR / parameter-tampering guard: a caller who is authorized to edit
--    <contact-A> (own scope) but supplies p_entity_id belonging to an
--    unrelated entity (e.g. another organization's contact) must be rejected
--    BEFORE any write happens, not merely produce a wrong-but-successful result:
--   SELECT public.rpc_update_contact('<contact-A-id>', '<UNRELATED-entity-id>',
--          'X','X','X', NULL,NULL,NULL,NULL,NULL,'active',NULL, NULL,
--          NULL, NULL,NULL,NULL,'person');
--   -- Expected: raises insufficient_privilege ('entity_id não corresponde ao
--   -- contacto'). No row in anew_entities/anew_entity_emails/anew_entity_phones/
--   -- fiscal_entities/anew_entity_addresses/anew_entity_roles for the unrelated
--   -- entity_id is touched, and no audit row is written.
