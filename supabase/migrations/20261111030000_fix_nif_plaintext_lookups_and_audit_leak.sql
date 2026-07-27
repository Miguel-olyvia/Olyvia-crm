-- NIF Encryption — Phase 2 follow-up: three RPCs still MATCH existing
-- fiscal_entities rows by plaintext `nif` (or embed plaintext `nif` in their
-- audit-log diff payloads), even though every real caller already dual-writes
-- nif_encrypted/nif_hash and the nif-write-proxy Edge Function
-- (supabase/functions/nif-write-proxy/handler.ts) already computes p_nif_hash
-- server-side (hashNif(trimmedNif, hmacKey)) and injects it into every one of
-- these RPC calls today. Confirmed by reading every real caller before writing
-- this migration:
--   - src/pages/Organizations.tsx        → callNifWriteProxy("rpc_update_organization", ...)
--   - src/components/clients/ClientDetailsDialog.tsx → callNifWriteProxy("rpc_update_client", ...)
--   - src/pages/UsersNew.tsx              → callNifWriteProxy("rpc_update_user", ...)
-- No caller invokes any of these three RPCs directly via supabase.rpc(...);
-- nif-write-proxy is the only path, and its ALLOWED_RPCS allowlist already
-- covers all three. So this migration only changes what each RPC does with
-- the p_nif_hash it already receives — no Edge Function change is needed.
--
-- Two separate problems, verified by reading each function's live definition
-- (pulled from its most recent migration, not just static reasoning):
--
-- 1) PLAINTEXT LOOKUP TO FIND AN EXISTING ROW
--    rpc_update_organization (20261103040000, both the entity-backfill match
--    and the fiscal-entity upsert match) and rpc_update_user (20261101070000)
--    each do `WHERE nif = <value> AND country_code = <value>` to find a
--    reusable fiscal_entities row. Because two differently-formatted strings
--    that are the SAME NIF can already coexist with different `nif` text but
--    the SAME nif_hash, this plaintext comparison is both a data-exposure
--    concern (comparing on the cleartext column) and a correctness gap
--    (misses hash-equivalent rows the ON CONFLICT (nif_hash, country_code)
--    index would otherwise catch). Fixed below: every such MATCH now keys off
--    nif_hash. When the caller does not supply p_nif_hash (should not happen
--    for any real caller — see above — but is defensively handled), the match
--    is skipped entirely (treated as "no existing row"), never silently
--    falling back to a plaintext WHERE nif = ... comparison. The actual
--    dual-write of the plaintext `nif` column on INSERT is untouched.
--
--    rpc_update_client was audited too: its fiscal-link resolution keys off
--    entity_id (`WHERE entity_id = ... AND is_primary = true`) and then
--    updates fiscal_entities by `id`, and its brand-new-row path already
--    upserts via `ON CONFLICT (nif_hash, country_code)` — neither is a
--    plaintext nif lookup, so no change is needed there.
--
-- 2) PLAINTEXT NIF WRITTEN INTO AUDIT LOG PAYLOADS
--    rpc_update_client reads the pre-update plaintext NIF purely to build an
--    audit diff (`SELECT nif INTO v_nif_before ...`) and then embeds both the
--    old and new plaintext NIF values in the JSON handed to
--    fn_manual_audit_log. rpc_update_organization and rpc_update_user do the
--    same thing implicitly: their old/new "fiscal" snapshots
--    (v_old_fiscal/v_new_fiscal) jsonb_agg a `'nif', fe.nif` field straight
--    into the same audit payload. Plaintext NIF must never be written into
--    entity_audit_log (or any audit table) — fixed below by logging nif_hash
--    (not the raw NIF) in all three places. No other diff fields, gates, or
--    write logic changes.
--
-- All three functions keep their exact current signature (each already has
-- p_nif_hash as an existing optional parameter), so CREATE OR REPLACE is
-- sufficient — no DROP FUNCTION / re-GRANT needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) rpc_update_client — audit-diff fix only (no plaintext lookup to fix; see
--    note above). Replace the plaintext-NIF "old" snapshot used purely for
--    audit diffing with a nif_hash-based one, and log nif_hash instead of the
--    raw NIF in both the update-existing-link and create-new-link branches.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_update_client(
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
  v_nif_hash_before  text;
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
  -- p_vat empty/NULL is a no-op that preserves the existing link; removal
  -- requires the explicit p_clear_nif = true signal (20261103040000).
  --
  -- SECURITY FIX (20261111030000): the pre-update value used to build the
  -- audit diff was read as PLAINTEXT (`SELECT nif INTO v_nif_before ...`) and
  -- then embedded, both old and new, straight into the JSON handed to
  -- fn_manual_audit_log — writing the raw NIF into the audit trail. Plaintext
  -- NIF must never be written into any audit table. The diff now compares and
  -- logs nif_hash instead of nif; the underlying dual-write of the plaintext
  -- `nif` column on fiscal_entities itself is unchanged.
  IF p_vat IS NOT NULL AND p_vat <> '' THEN
    SELECT id, fiscal_entity_id INTO v_fiscal_link_id, v_fiscal_ent_id
    FROM public.anew_entity_fiscal_entities
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_fiscal_link_id IS NOT NULL THEN
      SELECT nif_hash INTO v_nif_hash_before FROM public.fiscal_entities WHERE id = v_fiscal_ent_id;
      UPDATE public.fiscal_entities
      SET nif = p_vat,
          nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash = COALESCE(p_nif_hash, nif_hash),
          updated_at = v_now
      WHERE id = v_fiscal_ent_id;
      IF v_nif_hash_before IS DISTINCT FROM p_nif_hash THEN
        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif_hash',
            jsonb_build_object('old', to_jsonb(v_nif_hash_before), 'new', to_jsonb(p_nif_hash))));
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
        jsonb_build_object('nif_hash',
          jsonb_build_object('old', NULL, 'new', to_jsonb(p_nif_hash))));
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

  -- ── 6. Address: anew_addresses + anew_entity_addresses (primary) ─────────
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
  'Server-side client update (Phase 2 NIF dual-write). p_vat empty/NULL is a no-op for the fiscal link (preserves the existing NIF) — removing it requires the explicit p_clear_nif = true signal. Fixed 20261111030000: the audit diff for the fiscal_entities NIF change now compares/logs nif_hash instead of the plaintext nif — plaintext NIF must never be written into entity_audit_log.';

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
-- 2) rpc_update_organization — fix both plaintext `WHERE nif = ...` matches
--    (entity-backfill match + fiscal-entity upsert match) to key off nif_hash,
--    and fix the audit-snapshot fiscal diff to log nif_hash instead of nif.
--    Signature unchanged, so CREATE OR REPLACE is sufficient.
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
    --
    -- SECURITY FIX (20261111030000): this match used to be a plaintext
    -- `WHERE fe.nif = v_nif`. It now keys off nif_hash — the same hash the
    -- nif-write-proxy Edge Function already computes and sends as p_nif_hash
    -- for every real caller. When p_nif_hash is not supplied, this match is
    -- skipped entirely (treated as "no match", never a plaintext fallback).
    v_matched_entity := NULL;
    IF v_has_fiscal AND p_nif_hash IS NOT NULL THEN
      -- Step 1: exactly one fiscal_entities row for this (nif_hash, country)?
      SELECT count(*) INTO v_match_fe_count
      FROM (
        SELECT fe.id
        FROM public.fiscal_entities fe
        WHERE fe.nif_hash = p_nif_hash AND fe.country_code = v_country
        LIMIT 2
      ) s;

      IF v_match_fe_count = 1 THEN
        SELECT fe.id INTO v_match_fe_id
        FROM public.fiscal_entities fe
        WHERE fe.nif_hash = p_nif_hash AND fe.country_code = v_country
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
  -- SECURITY FIX (20261111030000): this snapshot used to embed the plaintext
  -- `nif` in the audit-diff payload (fed to fn_manual_audit_log below). It now
  -- carries nif_hash instead — plaintext NIF must never reach the audit log.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
           'nif_hash', fe.nif_hash, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
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
  -- isFiscal=true but nif not supplied (or blank) is a no-op that preserves
  -- the existing fiscal link instead of deleting it (20261103040000).
  --
  -- SECURITY FIX (20261111030000): the reuse-match below used to be a
  -- plaintext `WHERE nif = v_nif`. It now keys off p_nif_hash — the hash the
  -- nif-write-proxy Edge Function already computes for every real caller.
  -- When p_nif_hash is not supplied, the match is skipped entirely (treated
  -- as "no existing row"), never falling back to a plaintext comparison. The
  -- INSERT/UPDATE branches below are unchanged: they still dual-write the
  -- plaintext `nif` column exactly as before.
  IF v_has_fiscal THEN
    IF p_nif_hash IS NOT NULL THEN
      SELECT count(*) INTO v_match_fe_count
      FROM (
        SELECT fe.id
        FROM public.fiscal_entities fe
        WHERE fe.nif_hash = p_nif_hash AND fe.country_code = v_country
        LIMIT 2
      ) s;
    ELSE
      v_match_fe_count := 0;
    END IF;

    IF v_match_fe_count > 1 THEN
      RAISE EXCEPTION 'Fiscal entity match is ambiguous' USING ERRCODE = 'cardinality_violation';
    END IF;

    IF v_match_fe_count = 1 THEN
      SELECT id INTO v_fiscal_entity_id
      FROM public.fiscal_entities
      WHERE nif_hash = p_nif_hash AND country_code = v_country
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
      -- Existing fiscal_entities row reused (matched by nif_hash/country_code):
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
    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
  END IF;
  -- ELSE (p_is_fiscal = true but v_nif is NULL/blank): no-op — the caller still
  -- wants the org treated as fiscal but didn't (re)send the NIF, so the
  -- existing fiscal link is preserved rather than silently deleted.

  -- ── Hierarchy: unlink current parent, then move under the chosen parent ──
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
           'nif_hash', fe.nif_hash, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
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
  'Server-side organization update (Phase 2 NIF dual-write). Fiscal link is only cleared on the explicit "not fiscal" signal (p_is_fiscal = false/NULL). Fixed 20261111030000: both fiscal_entities reuse-matches (entity-backfill and fiscal upsert) now key off nif_hash instead of plaintext nif — no hash supplied means no match, never a plaintext fallback — and the audit-diff fiscal snapshot logs nif_hash instead of the plaintext nif.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) rpc_update_user — fix the plaintext `WHERE nif = ...` reuse-match to key
--    off nif_hash, and fix the audit-snapshot fiscal diff to log nif_hash
--    instead of nif. Signature unchanged, so CREATE OR REPLACE is sufficient.
--    rpc_finalize_user_profile_full (defined further down in the same prior
--    migration) is untouched — it has no reuse-match at all (see
--    20261101070000's own header), so it is out of scope for this fix.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_update_user(
  p_user_id              uuid,
  p_entity_id            uuid,
  p_name                 text,
  p_email                text,
  p_phone                text,
  p_status               text,
  p_description          text,
  p_position             text,
  p_location             text,
  p_template_id          uuid,
  p_custom_attributes    jsonb,
  p_emails               jsonb,
  p_phones               jsonb,
  p_memberships          jsonb,
  p_existing_membership_ids uuid[],
  p_pending_scopes       jsonb,
  p_addresses            jsonb,
  p_fiscal               jsonb,
  p_nif_encrypted        text DEFAULT NULL,
  p_nif_hash             text DEFAULT NULL,
  p_nif_tokens           text[] DEFAULT NULL
)
RETURNS public.anew_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor            uuid;
  v_before_user      public.anew_users;
  v_user             public.anew_users;
  v_effective_entity uuid;
  v_entity_before    jsonb;

  v_can_edit_self    boolean;
  v_has_edit_perm    boolean;
  v_has_create_perm  boolean;
  v_has_delete_perm  boolean;
  v_target_in_scope  boolean;
  v_visible_orgs     uuid[];

  v_membership       jsonb;
  v_membership_id    uuid;
  v_membership_org   uuid;
  v_to_delete        uuid[];
  v_form_membership_ids uuid[];

  v_is_update        boolean;

  v_scope_membership text;
  v_scopes           jsonb;
  v_scope            jsonb;

  v_addr             jsonb;
  v_new_address_id   uuid;

  v_fiscal_nif       text;
  v_fiscal_country   text;
  v_fiscal_commercial text;
  v_fiscal_entity_id uuid;
  v_fiscal_is_new    boolean;
  v_fiscal_row_existed boolean;
  v_nif_token        text;

  -- before/after snapshots for the combined diff
  v_old_memberships  jsonb;
  v_new_memberships  jsonb;
  v_old_emails       jsonb;
  v_new_emails       jsonb;
  v_old_phones       jsonb;
  v_new_phones       jsonb;
  v_old_addresses    jsonb;
  v_new_addresses    jsonb;
  v_old_fiscal       jsonb;
  v_new_fiscal       jsonb;

  v_user_diff        jsonb;
  v_diff             jsonb;
  v_audit_org        uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== createdBy in the frontend) ────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current user row (before-image + guards) ────────────────────
  SELECT * INTO v_before_user FROM public.anew_users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Two-level authorization, replicating the DISTINCT RLS on each table ───
  v_can_edit_self   := (v_before_user.auth_user_id = auth.uid());
  v_has_edit_perm   := public.has_anew_permission(auth.uid(), 'users.edit');
  v_has_create_perm := public.has_anew_permission(auth.uid(), 'users.create');
  v_has_delete_perm := public.has_anew_permission(auth.uid(), 'users.delete');

  -- Snapshot the caller's visible organisations once (used by every gate).
  SELECT COALESCE(array_agg(o), ARRAY[]::uuid[])
  INTO   v_visible_orgs
  FROM   public.get_user_visible_org_ids(auth.uid()) AS o;

  -- Level-1 gate (anew_users_update parity).
  IF NOT v_can_edit_self THEN
    IF NOT v_has_edit_perm THEN
      RAISE EXCEPTION 'Sem permissão para editar utilizadores' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.anew_memberships m
      WHERE m.user_id = p_user_id
        AND m.organization_id = ANY(v_visible_orgs)
    ) INTO v_target_in_scope;
    IF NOT v_target_in_scope THEN
      RAISE EXCEPTION 'Utilizador fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── 1. UPDATE anew_users (identical column set to the FE update) ─────────
  UPDATE public.anew_users
  SET name              = p_name,
      email             = p_email,
      phone             = p_phone,
      status            = p_status,
      description       = p_description,
      position          = p_position,
      location          = p_location,
      template_id       = p_template_id,
      custom_attributes = p_custom_attributes
  WHERE id = p_user_id
  RETURNING * INTO v_user;

  -- ── 2. Backfill entity when the user had none, exactly like the FE ───────
  v_effective_entity := v_before_user.entity_id;
  IF v_effective_entity IS NULL THEN
    INSERT INTO public.anew_entities (type, display_name, created_by)
    VALUES ('person', p_name, v_actor)
    RETURNING id INTO v_effective_entity;

    UPDATE public.anew_users SET entity_id = v_effective_entity WHERE id = p_user_id;
    -- keep the returned row in sync with the backfilled entity_id
    v_user.entity_id := v_effective_entity;
  END IF;

  -- ── 3. UPDATE anew_entities display_name (before-image for the diff) ─────
  SELECT to_jsonb(e) INTO v_entity_before FROM public.anew_entities e WHERE e.id = v_effective_entity;

  UPDATE public.anew_entities
  SET display_name = p_name,
      updated_at   = now()
  WHERE id = v_effective_entity;

  -- ── 4. Identity (emails + phones) via the existing atomic RPC ────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'email', email, 'email_type', email_type, 'is_primary', is_primary) ORDER BY email), '[]'::jsonb)
  INTO v_old_emails FROM public.anew_entity_emails WHERE entity_id = v_effective_entity;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'phone_number', phone_number, 'country_code', country_code,
           'phone_type', phone_type, 'is_primary', is_primary) ORDER BY phone_number), '[]'::jsonb)
  INTO v_old_phones FROM public.anew_entity_phones WHERE entity_id = v_effective_entity;

  PERFORM public.upsert_entity_identity(
    v_effective_entity,
    COALESCE(p_emails, '[]'::jsonb),
    COALESCE(p_phones, '[]'::jsonb),
    NULL,          -- addresses handled separately below, matching the FE
    v_actor
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'email', email, 'email_type', email_type, 'is_primary', is_primary) ORDER BY email), '[]'::jsonb)
  INTO v_new_emails FROM public.anew_entity_emails WHERE entity_id = v_effective_entity;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'phone_number', phone_number, 'country_code', country_code,
           'phone_type', phone_type, 'is_primary', is_primary) ORDER BY phone_number), '[]'::jsonb)
  INTO v_new_phones FROM public.anew_entity_phones WHERE entity_id = v_effective_entity;

  -- ── 5-7. Memberships — snapshot old, delete removed, upsert form rows ─────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'organization_id', organization_id,
           'relationship_type', relationship_type, 'role_id', role_id, 'status', status
         ) ORDER BY organization_id), '[]'::jsonb)
  INTO v_old_memberships
  FROM public.anew_memberships WHERE user_id = p_user_id;

  SELECT COALESCE(array_agg((m ->> 'id')::uuid) FILTER (WHERE (m ->> 'id') IS NOT NULL), ARRAY[]::uuid[])
  INTO v_form_membership_ids
  FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb)) AS m;

  SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
  INTO v_to_delete
  FROM unnest(COALESCE(p_existing_membership_ids, ARRAY[]::uuid[])) AS x
  WHERE NOT (x = ANY(v_form_membership_ids));

  IF array_length(v_to_delete, 1) > 0 THEN
    IF NOT v_has_delete_perm THEN
      RAISE EXCEPTION 'Sem permissão para remover associações de utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT v_has_edit_perm THEN
      RAISE EXCEPTION 'Sem permissão para alterar âmbitos de permissão'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_to_delete) AS del_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.id = del_id AND m.user_id = p_user_id
      )
    ) THEN
      RAISE EXCEPTION 'Associação não pertence ao utilizador a editar'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.id = ANY(v_to_delete)
        AND m.user_id = p_user_id
        AND NOT (m.organization_id = ANY(v_visible_orgs))
    ) THEN
      RAISE EXCEPTION 'Associação fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    DELETE FROM public.anew_membership_permission_scopes
    WHERE membership_id = ANY(v_to_delete)
      AND membership_id IN (
        SELECT id FROM public.anew_memberships WHERE user_id = p_user_id
      );
    DELETE FROM public.anew_memberships
    WHERE id = ANY(v_to_delete) AND user_id = p_user_id;
  END IF;

  FOR v_membership IN SELECT * FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb))
  LOOP
    CONTINUE WHEN NULLIF(v_membership ->> 'organization_id', '') IS NULL;

    v_membership_id := NULLIF(v_membership ->> 'id', '')::uuid;
    v_membership_org := (v_membership ->> 'organization_id')::uuid;
    v_is_update := v_membership_id IS NOT NULL
                   AND v_membership_id = ANY(COALESCE(p_existing_membership_ids, ARRAY[]::uuid[]));

    IF v_is_update THEN
      IF NOT v_has_edit_perm THEN
        RAISE EXCEPTION 'Sem permissão para editar associações de utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT (v_membership_org = ANY(v_visible_orgs)) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.id = v_membership_id
          AND m.user_id = p_user_id
          AND m.organization_id = ANY(v_visible_orgs)
      ) THEN
        RAISE EXCEPTION 'Associação não pertence ao utilizador a editar ou está fora do âmbito'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      UPDATE public.anew_memberships
      SET organization_id   = v_membership_org,
          relationship_type = v_membership ->> 'relationship_type',
          role_id           = (v_membership ->> 'role_id')::uuid,
          status            = 'active'
      WHERE id = v_membership_id AND user_id = p_user_id;
    ELSE
      IF NOT v_has_create_perm THEN
        RAISE EXCEPTION 'Sem permissão para criar associações de utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT (v_membership_org = ANY(v_visible_orgs)) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.anew_memberships
        (user_id, organization_id, relationship_type, role_id, status, created_by)
      VALUES
        (p_user_id,
         v_membership_org,
         v_membership ->> 'relationship_type',
         (v_membership ->> 'role_id')::uuid,
         'active',
         v_actor);
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'organization_id', organization_id,
           'relationship_type', relationship_type, 'role_id', role_id, 'status', status
         ) ORDER BY organization_id), '[]'::jsonb)
  INTO v_new_memberships
  FROM public.anew_memberships WHERE user_id = p_user_id;

  -- ── 8. Pending permission-scope overrides (per membership) ───────────────
  IF p_pending_scopes IS NOT NULL AND jsonb_typeof(p_pending_scopes) = 'object'
     AND p_pending_scopes <> '{}'::jsonb THEN
    IF NOT v_has_edit_perm THEN
      RAISE EXCEPTION 'Sem permissão para alterar âmbitos de permissão'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    FOR v_scope_membership IN SELECT jsonb_object_keys(p_pending_scopes)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.id = v_scope_membership::uuid
          AND m.user_id = p_user_id
          AND m.organization_id = ANY(v_visible_orgs)
      ) THEN
        RAISE EXCEPTION 'Âmbito de permissão não pertence ao utilizador a editar ou está fora do âmbito'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      DELETE FROM public.anew_membership_permission_scopes
      WHERE membership_id = v_scope_membership::uuid
        AND membership_id IN (
          SELECT id FROM public.anew_memberships WHERE user_id = p_user_id
        );

      v_scopes := p_pending_scopes -> v_scope_membership;
      IF v_scopes IS NOT NULL AND jsonb_typeof(v_scopes) = 'array' THEN
        FOR v_scope IN SELECT * FROM jsonb_array_elements(v_scopes)
        LOOP
          CONTINUE WHEN (v_scope ->> 'scope_level') = 'OWNED';
          INSERT INTO public.anew_membership_permission_scopes
            (membership_id, permission_code, scope_level)
          VALUES
            (v_scope_membership::uuid,
             v_scope ->> 'permission_code',
             (v_scope ->> 'scope_level')::public.anew_scope_level);
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ── 9-10. Addresses — only when the FE passed a non-NULL array ───────────
  IF p_addresses IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'address_id', ea.address_id, 'address_type', ea.address_type,
             'is_primary', ea.is_primary,
             'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
             'city', a.city, 'country', a.country
           ) ORDER BY ea.address_id), '[]'::jsonb)
    INTO v_old_addresses
    FROM public.anew_entity_addresses ea
    LEFT JOIN public.anew_addresses a ON a.id = ea.address_id
    WHERE ea.entity_id = v_effective_entity AND ea.valid_to IS NULL;

    UPDATE public.anew_entity_addresses
    SET valid_to = now()
    WHERE entity_id = v_effective_entity AND valid_to IS NULL;

    FOR v_addr IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      INSERT INTO public.anew_addresses
        (address_key, street, number, floor, unit, postal_code, city, district, country, extra, created_by)
      VALUES
        (v_addr ->> 'address_key',
         v_addr ->> 'street',
         v_addr ->> 'number',
         NULLIF(v_addr ->> 'floor', ''),
         NULLIF(v_addr ->> 'unit', ''),
         v_addr ->> 'postal_code',
         v_addr ->> 'city',
         NULLIF(v_addr ->> 'district', ''),
         COALESCE(NULLIF(v_addr ->> 'country', ''), 'PT'),
         NULLIF(v_addr ->> 'extra', ''),
         v_actor)
      RETURNING id INTO v_new_address_id;

      INSERT INTO public.anew_entity_addresses
        (entity_id, address_id, address_type, is_primary, valid_from, created_by)
      VALUES
        (v_effective_entity,
         v_new_address_id,
         COALESCE(NULLIF(v_addr ->> 'address_type', ''), 'home'),
         COALESCE((v_addr ->> 'is_primary')::boolean, false),
         now(),
         v_actor);
    END LOOP;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'address_id', ea.address_id, 'address_type', ea.address_type,
             'is_primary', ea.is_primary,
             'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
             'city', a.city, 'country', a.country
           ) ORDER BY ea.address_id), '[]'::jsonb)
    INTO v_new_addresses
    FROM public.anew_entity_addresses ea
    LEFT JOIN public.anew_addresses a ON a.id = ea.address_id
    WHERE ea.entity_id = v_effective_entity AND ea.valid_to IS NULL;
  END IF;

  -- ── 11-12. Fiscal entity — only when a NIF was supplied ──────────────────
  -- SECURITY FIX (20261111030000): the reuse-match below used to be a
  -- plaintext `WHERE nif = v_fiscal_nif`. It now keys off p_nif_hash — the
  -- same hash the nif-write-proxy Edge Function already computes and sends
  -- for every real caller. When p_nif_hash is not supplied, the match is
  -- skipped entirely (treated as "no existing row"), never a plaintext
  -- fallback; the INSERT ... ON CONFLICT (nif_hash, country_code) branch
  -- below (already hash-based) remains the safety net for a hash-equivalent
  -- row this skipped match didn't find. The old/new fiscal snapshots used for
  -- the audit diff now carry nif_hash instead of the plaintext nif.
  v_fiscal_nif := NULLIF(p_fiscal ->> 'nif', '');
  IF p_fiscal IS NOT NULL AND v_fiscal_nif IS NOT NULL THEN
    v_fiscal_country    := COALESCE(NULLIF(p_fiscal ->> 'country_code', ''), 'PT');
    v_fiscal_commercial := NULLIF(p_fiscal ->> 'commercial_name', '');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
             'nif_hash', fe.nif_hash, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name
           )), '[]'::jsonb)
    INTO v_old_fiscal
    FROM public.anew_entity_fiscal_entities efe
    LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
    WHERE efe.entity_id = v_effective_entity AND efe.valid_to IS NULL;

    -- Close current fiscal links.
    UPDATE public.anew_entity_fiscal_entities
    SET valid_to = now()
    WHERE entity_id = v_effective_entity AND valid_to IS NULL;

    -- Reuse an existing fiscal_entity for this nif_hash/country, or create one.
    IF p_nif_hash IS NOT NULL THEN
      SELECT id INTO v_fiscal_entity_id
      FROM public.fiscal_entities
      WHERE nif_hash = p_nif_hash AND country_code = v_fiscal_country
      LIMIT 1;
    ELSE
      v_fiscal_entity_id := NULL;
    END IF;

    v_fiscal_is_new := (v_fiscal_entity_id IS NULL);

    IF v_fiscal_entity_id IS NULL THEN
      -- NIF ENCRYPTION DUAL-WRITE (Phase 2, additive/optional): when the
      -- caller supplies p_nif_encrypted/p_nif_hash alongside the plaintext
      -- nif, persist them on the same row. COALESCE keeps this a no-op
      -- (columns stay NULL) when the new parameters are not supplied, so
      -- pre-existing callers are unaffected.
      --
      -- The plaintext lookup above no longer runs, so this INSERT can still
      -- hit uq_fiscal_entities_nif_hash_country
      -- (20261029010000_fiscal_entities_nif_hash_country_unique.sql, a
      -- partial unique index on (nif_hash, country_code) WHERE nif_hash IS
      -- NOT NULL) whenever a hash-equivalent row already exists. ON CONFLICT
      -- here repeats that exact predicate (required for Postgres to accept it
      -- as the arbiter of a partial index, same fix already applied to
      -- resolve_fiscal_entity in 20261101030000) and reuses the existing row
      -- instead of erroring. RETURNING xmax detects whether the row was
      -- reused so v_fiscal_is_new (used below by the token-sync block)
      -- reflects reality. This ON CONFLICT clause only ever arbitrates when
      -- p_nif_hash is supplied — legacy callers that omit it insert a row
      -- with nif_hash = NULL, which the partial index never constrains, so
      -- their behavior is unchanged.
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by, nif_encrypted, nif_hash)
      VALUES (v_fiscal_nif, v_fiscal_commercial, v_fiscal_country, v_actor,
              COALESCE(p_nif_encrypted, NULL), COALESCE(p_nif_hash, NULL))
      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
        SET commercial_name = COALESCE(EXCLUDED.commercial_name, public.fiscal_entities.commercial_name),
            nif_encrypted    = COALESCE(EXCLUDED.nif_encrypted, public.fiscal_entities.nif_encrypted),
            nif_hash         = COALESCE(EXCLUDED.nif_hash, public.fiscal_entities.nif_hash),
            updated_at       = now()
      RETURNING id, (xmax <> 0) INTO v_fiscal_entity_id, v_fiscal_row_existed;

      v_fiscal_is_new := NOT COALESCE(v_fiscal_row_existed, false);
    ELSE
      -- Existing fiscal_entity matched by (nif_hash, country_code): dual-write
      -- the encrypted material onto it too, without clobbering an existing
      -- value with NULL when the caller did not supply the new parameters.
      UPDATE public.fiscal_entities
      SET nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash       = COALESCE(p_nif_hash, nif_hash)
      WHERE id = v_fiscal_entity_id;
    END IF;

    IF p_nif_tokens IS NOT NULL THEN
      IF NOT v_fiscal_is_new THEN
        DELETE FROM public.fiscal_entity_nif_tokens
        WHERE fiscal_entity_id = v_fiscal_entity_id;
      END IF;

      FOREACH v_nif_token IN ARRAY p_nif_tokens
      LOOP
        CONTINUE WHEN v_nif_token IS NULL;
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        VALUES (v_fiscal_entity_id, v_nif_token)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    IF v_fiscal_entity_id IS NOT NULL THEN
      INSERT INTO public.anew_entity_fiscal_entities
        (entity_id, fiscal_entity_id, is_primary, valid_from, created_by)
      VALUES
        (v_effective_entity, v_fiscal_entity_id, true, now(), v_actor);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
             'nif_hash', fe.nif_hash, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name
           )), '[]'::jsonb)
    INTO v_new_fiscal
    FROM public.anew_entity_fiscal_entities efe
    LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
    WHERE efe.entity_id = v_effective_entity AND efe.valid_to IS NULL;
  END IF;

  -- ── Build the combined diff across every touched table ────────────────────
  v_diff := '{}'::jsonb;

  v_user_diff := '{}'::jsonb;
  IF v_before_user.name IS DISTINCT FROM v_user.name THEN
    v_user_diff := v_user_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before_user.name), 'new', to_jsonb(v_user.name)));
  END IF;
  IF v_before_user.email IS DISTINCT FROM v_user.email THEN
    v_user_diff := v_user_diff || jsonb_build_object('email',
      jsonb_build_object('old', to_jsonb(v_before_user.email), 'new', to_jsonb(v_user.email)));
  END IF;
  IF v_before_user.phone IS DISTINCT FROM v_user.phone THEN
    v_user_diff := v_user_diff || jsonb_build_object('phone',
      jsonb_build_object('old', to_jsonb(v_before_user.phone), 'new', to_jsonb(v_user.phone)));
  END IF;
  IF v_before_user.status IS DISTINCT FROM v_user.status THEN
    v_user_diff := v_user_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_user.status), 'new', to_jsonb(v_user.status)));
  END IF;
  IF v_before_user.description IS DISTINCT FROM v_user.description THEN
    v_user_diff := v_user_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before_user.description), 'new', to_jsonb(v_user.description)));
  END IF;
  IF v_before_user.position IS DISTINCT FROM v_user.position THEN
    v_user_diff := v_user_diff || jsonb_build_object('position',
      jsonb_build_object('old', to_jsonb(v_before_user.position), 'new', to_jsonb(v_user.position)));
  END IF;
  IF v_before_user.location IS DISTINCT FROM v_user.location THEN
    v_user_diff := v_user_diff || jsonb_build_object('location',
      jsonb_build_object('old', to_jsonb(v_before_user.location), 'new', to_jsonb(v_user.location)));
  END IF;
  IF v_before_user.template_id IS DISTINCT FROM v_user.template_id THEN
    v_user_diff := v_user_diff || jsonb_build_object('template_id',
      jsonb_build_object('old', to_jsonb(v_before_user.template_id), 'new', to_jsonb(v_user.template_id)));
  END IF;
  IF v_before_user.custom_attributes IS DISTINCT FROM v_user.custom_attributes THEN
    v_user_diff := v_user_diff || jsonb_build_object('custom_attributes',
      jsonb_build_object('old', v_before_user.custom_attributes, 'new', v_user.custom_attributes));
  END IF;
  IF v_before_user.entity_id IS DISTINCT FROM v_user.entity_id THEN
    v_user_diff := v_user_diff || jsonb_build_object('entity_id',
      jsonb_build_object('old', to_jsonb(v_before_user.entity_id), 'new', to_jsonb(v_user.entity_id)));
  END IF;
  IF v_user_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_users', v_user_diff);
  END IF;

  IF (v_entity_before ->> 'display_name') IS DISTINCT FROM p_name THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', jsonb_build_object(
      'display_name', jsonb_build_object('old', v_entity_before -> 'display_name', 'new', to_jsonb(p_name))));
  END IF;

  IF v_old_emails IS DISTINCT FROM v_new_emails THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_emails',
      jsonb_build_object('old', v_old_emails, 'new', v_new_emails));
  END IF;
  IF v_old_phones IS DISTINCT FROM v_new_phones THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_phones',
      jsonb_build_object('old', v_old_phones, 'new', v_new_phones));
  END IF;

  IF v_old_memberships IS DISTINCT FROM v_new_memberships THEN
    v_diff := v_diff || jsonb_build_object('anew_memberships',
      jsonb_build_object('old', v_old_memberships, 'new', v_new_memberships));
  END IF;

  IF p_addresses IS NOT NULL AND v_old_addresses IS DISTINCT FROM v_new_addresses THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_addresses',
      jsonb_build_object('old', v_old_addresses, 'new', v_new_addresses));
  END IF;

  IF p_fiscal IS NOT NULL AND v_fiscal_nif IS NOT NULL
     AND v_old_fiscal IS DISTINCT FROM v_new_fiscal THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
      jsonb_build_object('old', v_old_fiscal, 'new', v_new_fiscal));
  END IF;

  -- ── Resolve the audit org exactly as fn_audit_anew_users would ────────────
  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  -- ── Emit a single consolidated audit row (only when something changed) ────
  IF v_diff <> '{}'::jsonb AND v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_user;
END;
$$;

COMMENT ON FUNCTION public.rpc_update_user(
  uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb, jsonb,
  jsonb, jsonb, uuid[], jsonb, jsonb, jsonb, text, text, text[]
) IS
  'Server-side user update (Phase 2 NIF dual-write). Fixed 20261111030000: the fiscal_entities reuse-match now keys off nif_hash instead of plaintext nif — no hash supplied means no match, never a plaintext fallback (the ON CONFLICT (nif_hash, country_code) insert branch remains the hash-based safety net) — and the audit-diff fiscal snapshot logs nif_hash instead of the plaintext nif.';
