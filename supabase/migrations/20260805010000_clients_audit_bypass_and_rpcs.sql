-- Clientes — single-log RPC (reuses the shared audit-bypass foundation)
-- 2026-08-05 | Module: Clientes
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one "save client" action (handleUpdateClient in
-- src/components/clients/ClientDetailsDialog.tsx, lines ~594-663) is issued from
-- the frontend as up to 6 independent Supabase calls, each its own Postgres
-- transaction (all wrapped in withAuditContext, which only sets the audit actor
-- GUC — it does NOT consolidate the writes):
--   1. UPDATE anew_entities (display_name, first_name, last_name, updated_at)
--   2. UPSERT anew_entity_emails (primary)      — only when email provided
--   3. UPSERT anew_entity_phones (primary)      — only when phone provided
--   4. UPDATE anew_clients (status, notes, assigned_to, updated_at)
--   5. NIF/VAT: either
--        · UPDATE fiscal_entities.nif on the existing primary fiscal link, or
--        · INSERT fiscal_entities + INSERT anew_entity_fiscal_entities (new link)
--      when p_vat is provided; OR, when p_vat is empty, close the existing
--      primary fiscal link (anew_entity_fiscal_entities.valid_to = now()).
-- Every one of those tables carries an AFTER trigger (fn_generic_entity_audit)
-- that writes to entity_audit_log, so a single user action produces N audit rows
-- when the business intent is exactly ONE.
--
-- Solution
-- --------
-- rpc_update_client(...) reproduces, field-for-field and condition-for-condition,
-- exactly what handleUpdateClient does today, inside ONE transaction with
-- app.audit_bypass = 'on', accumulates a combined diff across ALL touched tables
-- ({table:{col:{old,new}}}), and calls fn_manual_audit_log ONCE.
--
-- entity_id NEVER changes for the same client: anew_entities is the shared
-- identity and is the entity_id used for the single audit row, regardless of how
-- many satellite facets (emails/phones/fiscal) are touched.
--
-- The frontend only takes the "has entity_id" path (all writes are guarded by
-- `if (entityId) { ... }`); when entity_id is absent it performs no writes at all.
-- The RPC mirrors that: with no entity_id it is a no-op that returns the client
-- row unchanged. There is therefore no legacy fallback branch (unlike Contactos).
--
-- Foundation
-- ----------
-- The audit-bypass foundation (app.audit_bypass guard at the top of
-- fn_generic_entity_audit() + reusable fn_manual_audit_log(...)) already exists;
-- it was introduced by 20260719010000_roles_audit_bypass_and_rpcs.sql. This
-- migration REUSES it and does NOT recreate it.
--
-- Satellite tables touched here (anew_entities, anew_entity_emails,
-- anew_entity_phones, fiscal_entities, anew_entity_fiscal_entities) are all
-- audited by the generic fn_generic_entity_audit(), which already carries the
-- app.audit_bypass guard as of 20260719010000. No trigger function needs a new
-- guard for this module.
--
-- Authorization / RLS parity
-- --------------------------
-- rpc_update_client is SECURITY DEFINER, so RLS on the underlying tables does NOT
-- self-enforce inside it. It therefore re-checks, explicitly, the SAME predicate
-- the active anew_clients_update policy enforces today
-- (20260623200000_fix_anew_clients_rls_org_visibility.sql, lines ~46-60):
--     USING:      has_anew_permission(auth.uid(),'clients.edit')
--                 AND (organization_id IN visible_orgs
--                      OR root_organization_id IN visible_orgs)
--     WITH CHECK: has_anew_permission(auth.uid(),'clients.edit')
--                 AND organization_id IN visible_orgs
-- The USING predicate is evaluated against the TARGET anew_clients row (its own
-- organization_id / root_organization_id — the before-image) before any write,
-- exactly as the RLS USING clause would. A caller who cannot edit this client
-- under RLS is rejected here with the same effect. Because this RPC never changes
-- anew_clients.organization_id (handleUpdateClient only touches status / notes /
-- assigned_to), the WITH CHECK org predicate is re-evaluated against the AFTER
-- image (its unchanged organization_id) after the UPDATE, mirroring the RLS
-- WITH CHECK on every real UPDATE. The client module has no per-row owner/team
-- scoping function (unlike contacts' can_access_contact_row); org visibility IS
-- the row-scope predicate here, so we replicate precisely that and nothing more.
--
-- The satellite writes (anew_entities / emails / phones / fiscal) are all keyed
-- to the SAME entity_id that belongs to this authorized client, so authorizing
-- the client row authorizes the whole atomic unit, exactly as the frontend does
-- today (it performs all writes for one client the user already opened and can
-- edit).
--
-- Anti-tampering: p_entity_id and p_client_id are independent caller-supplied
-- parameters. Authorizing p_client_id says nothing about p_entity_id, so a caller
-- could otherwise pass a client they can edit but an entity_id pointing at an
-- unrelated entity, letting the satellite writes overwrite that entity's
-- identity/email/phone/fiscal. anew_clients.entity_id is fixed per client, so the
-- only legitimate value is the one already stored on the authorized row. All
-- entity-scoped writes use v_before_cl.entity_id, never the raw p_entity_id, and
-- a mismatch is rejected up front with insufficient_privilege.
--
-- Actor resolution parity
-- -----------------------
-- The frontend computes businessUserId = resolveCurrentBusinessUserId() and uses
-- it for created_by on every INSERT. The RPC uses public.current_business_user_id()
-- (the same server-side identity) and RAISES 'Perfil de utilizador não encontrado'
-- when it is NULL — matching the frontend's "Business user not found" guard.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql                    — entity_audit_log + fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql         — app.audit_bypass guard + fn_manual_audit_log(...)
--   20260623200000_fix_anew_clients_rls_org_visibility.sql — anew_clients_update RLS
--   20260615130000_baseline_new_database.sql               — has_anew_permission(), current_business_user_id(),
--                                                             get_user_visible_org_ids(), anew_* tables + RLS


-- ============================================================
-- rpc_update_client(...)
-- ============================================================
-- Mirrors handleUpdateClient in src/components/clients/ClientDetailsDialog.tsx.
--
-- Parameters carry exactly what the frontend form (editFormData) sends plus the
-- pre-composed / pre-normalized name pieces (the FE composes displayName via
-- composeDisplayName over normalizeFirstLast(first,last); we pass them in to keep
-- the exact same normalization/composition the FE uses).
--
--   p_client_id      — anew_clients.id (client.id)
--   p_entity_id      — anew_entities.id (client.entity_id). NULL => no-op (the FE
--                      performs no writes when entity_id is absent). Validated
--                      against the target client's own entity_id and rejected on
--                      mismatch — never trusted as-is.
--   p_display_name   — composed display name (FE composeDisplayName)
--   p_norm_first     — normalized first (FE normalizeFirstLast().first)
--   p_norm_last      — normalized last  (FE normalizeFirstLast().last)
--   p_email          — editFormData.email
--   p_phone          — editFormData.phone
--   p_phone_country  — editFormData.phone_country_code
--   p_vat            — editFormData.vat
--   p_status         — editFormData.status
--   p_notes          — editFormData.notes
--   p_assigned_to    — editFormData.assigned_to (uuid | NULL)
--
-- Returns the updated anew_clients row.

CREATE OR REPLACE FUNCTION public.rpc_update_client(
  p_client_id      uuid,
  p_entity_id      uuid,
  p_display_name   text,
  p_norm_first     text,
  p_norm_last      text,
  p_email          text,
  p_phone          text,
  p_phone_country  text,
  p_vat            text,
  p_status         text,
  p_notes          text,
  p_assigned_to    uuid
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- has_anew_permission('clients.edit') AND (organization_id IN visible_orgs OR
  -- root_organization_id IN visible_orgs), evaluated against the target row.
  IF NOT public.has_anew_permission(auth.uid(), 'clients.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
       v_before_cl.organization_id      IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR v_before_cl.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Cliente fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Anti-tampering: p_entity_id must match the target client's OWN entity_id ─
  -- From here on the entity_id actually used is ALWAYS v_before_cl.entity_id.
  IF p_entity_id IS NOT NULL AND p_entity_id IS DISTINCT FROM v_before_cl.entity_id THEN
    RAISE EXCEPTION 'entity_id não corresponde ao cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- The FE guards ALL writes with `if (entityId) { ... }`; with no entity_id it
  -- performs nothing. Mirror that exactly: no-op return when entity_id is absent.
  -- ══════════════════════════════════════════════════════════════════════════
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
  -- FE: if (editFormData.email) { find primary -> UPDATE else INSERT }.
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
  -- FE: if (editFormData.phone) { find primary -> UPDATE else INSERT }.
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
  -- FE: UPDATE { status, notes: notes || null, assigned_to: assigned_to || null,
  --             updated_at } WHERE id = client.id.
  UPDATE public.anew_clients
  SET status      = p_status,
      notes       = nullif(p_notes, ''),
      assigned_to = p_assigned_to,
      updated_at  = v_now
  WHERE id = p_client_id
  RETURNING * INTO v_cl;

  -- ── Post-mutation reauthorization (mirrors anew_clients_update WITH CHECK) ─
  -- WITH CHECK requires clients.edit AND organization_id IN visible_orgs against
  -- the AFTER image. organization_id is not modified here, but we re-assert the
  -- predicate exactly as RLS WITH CHECK would on every real UPDATE.
  IF NOT public.has_anew_permission(auth.uid(), 'clients.edit')
     OR NOT (v_cl.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Alteração fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  -- FE lookup keys on is_primary = true (NOT valid_to). Two paths:
  --   · p_vat provided:  existing primary link -> UPDATE fiscal_entities.nif;
  --                      else INSERT fiscal_entities {nif, country_code:'PT',
  --                      created_by} + INSERT anew_entity_fiscal_entities link.
  --   · p_vat empty:     close the existing OPEN primary link
  --                      (anew_entity_fiscal_entities.valid_to = now()) where
  --                      valid_to IS NULL — exactly the FE's clear branch.
  IF p_vat IS NOT NULL AND p_vat <> '' THEN
    SELECT id, fiscal_entity_id INTO v_fiscal_link_id, v_fiscal_ent_id
    FROM public.anew_entity_fiscal_entities
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_fiscal_link_id IS NOT NULL THEN
      SELECT nif INTO v_nif_before FROM public.fiscal_entities WHERE id = v_fiscal_ent_id;
      UPDATE public.fiscal_entities
      SET nif = p_vat, updated_at = v_now
      WHERE id = v_fiscal_ent_id;
      IF v_nif_before IS DISTINCT FROM p_vat THEN
        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif',
            jsonb_build_object('old', to_jsonb(v_nif_before), 'new', to_jsonb(p_vat))));
      END IF;
    ELSE
      -- FE INSERT: { nif, country_code: 'PT', created_by } (no entity_type).
      INSERT INTO public.fiscal_entities (nif, country_code, created_by)
      VALUES (p_vat, 'PT', v_actor)
      RETURNING id INTO v_new_fiscal_id;

      IF v_new_fiscal_id IS NOT NULL THEN
        INSERT INTO public.anew_entity_fiscal_entities
          (entity_id, fiscal_entity_id, is_primary, created_by)
        VALUES
          (v_before_cl.entity_id, v_new_fiscal_id, true, v_actor);
      END IF;

      v_diff := v_diff || jsonb_build_object('fiscal_entities',
        jsonb_build_object('nif',
          jsonb_build_object('old', NULL, 'new', to_jsonb(p_vat))));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
        jsonb_build_object('fiscal_entity_id',
          jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_fiscal_id))));
    END IF;
  ELSE
    -- VAT cleared: close the open primary fiscal link (matches the FE else branch).
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

  -- ── Resolve audit org + entity, then emit ONE consolidated audit row ──────
  -- The generic trigger resolves org for anew_clients directly from the row's
  -- organization_id; we replicate that, falling back to root_organization_id.
  v_audit_org := COALESCE(v_cl.organization_id, v_cl.root_organization_id,
                          v_before_cl.organization_id, v_before_cl.root_organization_id);

  -- Emit only when something meaningful changed, matching the "skip on no-op"
  -- behavior of the triggers. entity_id is the shared identity (anew_entities.id).
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

REVOKE ALL ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass foundation is reused (not recreated) — the guard already exists on
--    the generic trigger that audits every table this RPC writes:
--   SELECT proname FROM pg_proc
--   WHERE proname = 'fn_generic_entity_audit'
--     AND prosrc LIKE '%app.audit_bypass%';   -- present (20260719010000)
--
-- 2. One "save client" touching entities+email+phone+clients+fiscal produces
--    EXACTLY ONE audit row:
--   SELECT public.rpc_update_client('<client>','<entity>','Ana Silva','Ana','Silva',
--          'ana@x.pt','912345678','+351','PT123456789','customer','nota', '<user>');
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE entity_id = '<entity>' AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not up to 6), with changed_fields namespaced per table.
--
-- 3. A caller lacking clients.edit, or whose visible orgs exclude the target
--    client's organization_id/root_organization_id, raises insufficient_privilege
--    — matching the anew_clients_update RLS policy exactly.
--
-- 4. No-op save (nothing changed) writes zero audit rows, mirroring the triggers'
--    "skip when changed_fields is empty" behavior.
--
-- 5. IDOR / parameter-tampering guard: a caller authorized to edit <client-A>
--    (own scope) but supplying p_entity_id belonging to an unrelated entity must
--    be rejected BEFORE any write:
--   SELECT public.rpc_update_client('<client-A-id>','<UNRELATED-entity-id>',
--          'X','X','X', NULL,NULL,NULL,NULL,'customer',NULL, NULL);
--   -- Expected: raises insufficient_privilege ('entity_id não corresponde ao
--   -- cliente'). No satellite row for the unrelated entity is touched, no audit row.
--
-- 6. Clearing the NIF (p_vat = '') closes the open primary fiscal link
--    (valid_to = now()) exactly as the FE else-branch does, and contributes a
--    single anew_entity_fiscal_entities.valid_to diff to the one audit row.
