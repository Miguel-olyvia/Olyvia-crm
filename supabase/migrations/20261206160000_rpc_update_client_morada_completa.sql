-- Morada principal do cliente com a mesma estrutura da morada de entrega
-- (rua, número, andar, fração, código postal, localidade) e o mesmo validador.
-- Forward-only. Não editar migrações já aplicadas.
--
-- Contexto: a ficha do cliente tinha uma só caixa "Morada" + código postal +
-- cidade, e a criação de cliente não tinha fração. As moradas de entrega
-- (20261204400000) já têm os campos todos e validam o código postal na base.
-- O frontend passa a usar os mesmos campos (CamposMorada) e o mesmo validador
-- (validarMorada.ts) nos dois sítios; aqui a base acompanha.
--
-- 1. rpc_update_client — recriada a partir da definição vigente
--    (20261204270000_rpc_update_client_entity_type.sql, 21 parâmetros), igual
--    tirando:
--      • 2 parâmetros opcionais novos no fim:
--          p_address_floor text DEFAULT NULL, p_address_unit text DEFAULT NULL
--        NULL = mantém o andar/fração gravados (as chamadas antigas não os
--        enviam e não apagam nada); '' = apaga; outro valor = grava (btrim).
--      • floor/unit gravados no UPDATE e no INSERT da morada principal, no
--        address_key do INSERT (só quando preenchidos — sem eles a chave fica
--        igual à de antes) e no diff de auditoria, como os outros campos.
--      • código postal validado com a regra de rpc_add_entity_delivery_address:
--        quando vem preenchido tem de ser 0000-000 e diferente de 0000-000
--        (RAISE 'Código postal inválido (formato 0000-000)').
--      • mantém-se: a morada só é gravada com rua E código postal.
-- 2. rpc_create_client_manual — recriada a partir da definição vigente
--    (20261101060000_fix_client_manual_and_update_client_fiscal_entities_insert.sql,
--    21 parâmetros), igual tirando:
--      • 1 parâmetro opcional novo no fim: p_address_unit text DEFAULT NULL;
--      • fração gravada no INSERT da morada, no address_key (só quando
--        preenchida) e no diff de auditoria (o andar também passa ao diff);
--      • a mesma validação do código postal.
-- 3. Ficha técnica do edifício das moradas de entrega: tabela 1:1
--    anew_address_building (porquê tabela e não colunas: ver secção 3) +
--    fn_piso_numerico, fn_validar_ficha_edificio, fn_gravar_ficha_edificio.
--    O piso é o anew_addresses.floor que já existe (não se duplica).
-- 4. rpc_list_entity_delivery_addresses devolve também a ficha (DROP+CREATE,
--    muda o tipo de retorno).
-- 5. rpc_add_entity_delivery_address aceita a ficha (8 parâmetros DEFAULT
--    NULL no fim; DROP da assinatura antiga).
-- 6. rpc_update_entity_delivery_address (nova): editar uma morada de entrega.
-- No fim, um bloco CONFERIR verifica sobrecargas e permissões.
--
-- Acrescentar parâmetros muda a identidade da função (nome + tipos), por isso
-- as assinaturas antigas são apagadas antes do CREATE — senão ficariam duas
-- sobrecargas e o PostgREST não as distingue. Grants/REVOKE/COMMENT repostos
-- como estavam (anon sem EXECUTE — 20261205030000_revogar_anon_rpcs.sql).
--
-- Idempotente: DROP IF EXISTS + CREATE OR REPLACE + REVOKE/GRANT podem
-- correr mais do que uma vez.

SET lock_timeout = '5s';

-- ============================================================
-- 1. rpc_update_client
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean, text
);

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
  p_clear_nif            boolean DEFAULT false,
  p_entity_type          text DEFAULT NULL::text,
  p_address_floor        text DEFAULT NULL::text,
  p_address_unit         text DEFAULT NULL::text
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
  v_new_type     text;

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

  IF p_entity_type IS NOT NULL AND p_entity_type NOT IN ('person', 'organization') THEN
    RAISE EXCEPTION 'Tipo de entidade inválido' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Código postal: mesma regra que rpc_add_entity_delivery_address
  -- (20261204400000) e que o validador do frontend (validarMorada.ts).
  IF btrim(COALESCE(p_address_postal_code, '')) <> ''
     AND (btrim(p_address_postal_code) !~ '^[0-9]{4}-[0-9]{3}$'
          OR btrim(p_address_postal_code) = '0000-000') THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;

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

  -- ── 1. anew_entities: display_name / first_name / last_name / type ────────
  SELECT * INTO v_ent_before FROM public.anew_entities WHERE id = v_before_cl.entity_id;
  v_new_type := COALESCE(p_entity_type, v_ent_before.type);

  UPDATE public.anew_entities
  SET display_name = p_display_name,
      first_name   = p_norm_first,
      last_name    = p_norm_last,
      type         = v_new_type,
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
    IF v_ent_before.type IS DISTINCT FROM v_new_type THEN
      v_sub := v_sub || jsonb_build_object('type',
        jsonb_build_object('old', to_jsonb(v_ent_before.type), 'new', to_jsonb(v_new_type)));
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
  -- The pre-update value used to build the audit diff is read as nif_hash
  -- (never plaintext) — plaintext NIF must never be written into any audit
  -- table (20261111030000).
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
          -- 20261206160000: andar e fração. NULL mantém o valor gravado
          -- (chamadas antigas não os enviam); '' apaga.
          floor        = CASE WHEN p_address_floor IS NULL THEN floor
                              ELSE NULLIF(btrim(p_address_floor), '') END,
          unit         = CASE WHEN p_address_unit IS NULL THEN unit
                              ELSE NULLIF(btrim(p_address_unit), '') END,
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
      IF v_addr_before.floor IS DISTINCT FROM v_addr_after.floor THEN
        v_sub := v_sub || jsonb_build_object('floor',
          jsonb_build_object('old', to_jsonb(v_addr_before.floor), 'new', to_jsonb(v_addr_after.floor)));
      END IF;
      IF v_addr_before.unit IS DISTINCT FROM v_addr_after.unit THEN
        v_sub := v_sub || jsonb_build_object('unit',
          jsonb_build_object('old', to_jsonb(v_addr_before.unit), 'new', to_jsonb(v_addr_after.unit)));
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
        (address_key, street, number, floor, unit, city, postal_code, country, created_by)
      VALUES
        (lower(regexp_replace(
           p_address_street
           || COALESCE('-' || NULLIF(btrim(p_address_floor), ''), '')
           || COALESCE('-' || NULLIF(btrim(p_address_unit), ''), '')
           || '-' || p_address_postal_code, '\s+', '-', 'g')),
         p_address_street, COALESCE(p_address_number, ''),
         NULLIF(btrim(p_address_floor), ''), NULLIF(btrim(p_address_unit), ''),
         p_address_city, p_address_postal_code, 'PT', v_actor)
      RETURNING id INTO v_addr_id;

      INSERT INTO public.anew_entity_addresses
        (entity_id, address_id, address_type, is_primary, created_by)
      VALUES
        (v_before_cl.entity_id, v_addr_id, 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_addresses',
        jsonb_build_object(
          'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_street)),
          'floor',       jsonb_build_object('old', NULL, 'new', to_jsonb(NULLIF(btrim(p_address_floor), ''))),
          'unit',        jsonb_build_object('old', NULL, 'new', to_jsonb(NULLIF(btrim(p_address_unit), ''))),
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
  text, text, text, text, text, text, text[], boolean, text, text, text
) IS
  'Server-side client update (Phase 2 NIF dual-write). p_vat empty/NULL is a no-op for the fiscal link (preserves the existing NIF) — removing it requires the explicit p_clear_nif = true signal. 20261204270000: added optional p_entity_type (person/organization) so an existing client can be reclassified between Person and Company; NULL preserves the current type. 20261206160000: added optional p_address_floor/p_address_unit (NULL keeps the stored value, empty string clears it) and the postal code check of rpc_add_entity_delivery_address (0000-000, not 0000-000).';

REVOKE ALL ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid,
  text, text, text, text, text, text, text[], boolean, text, text, text
) TO authenticated, service_role;

-- ============================================================
-- 2. rpc_create_client_manual
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text,
  text, text, text[]
);

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
  p_nif_tokens            text[] DEFAULT NULL,
  p_address_unit          text DEFAULT NULL
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

  -- Código postal: mesma regra que rpc_add_entity_delivery_address
  -- (20261204400000) e que o validador do frontend (validarMorada.ts).
  IF btrim(COALESCE(p_address_postal_code, '')) <> ''
     AND (btrim(p_address_postal_code) !~ '^[0-9]{4}-[0-9]{3}$'
          OR btrim(p_address_postal_code) = '0000-000') THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;

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
      -- FIX (20261101050000): two bugs fixed in this single statement:
      --   1) fiscal_entities has no "entity_type" column (never did — see
      --      the baseline CREATE TABLE). The individual/company
      --      classification now goes into metadata jsonb instead, matching
      --      resolve_fiscal_entity()'s and create_contact_with_role's
      --      convention.
      --   2) blind INSERT → atomic find-or-create via
      --      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL,
      --      so a NIF that already has a fiscal_entities row (e.g. the same
      --      person becoming a client in a second organization) resolves to
      --      the existing row instead of violating
      --      uq_fiscal_entities_nif_hash_country. Only arbitrates when
      --      p_nif_hash is supplied; legacy callers (p_nif_hash NULL) never
      --      hit the partial index and keep the exact prior behavior.
      INSERT INTO public.fiscal_entities (nif, created_by, nif_encrypted, nif_hash, metadata)
      VALUES (
        v_vat,
        v_actor,
        p_nif_encrypted,
        p_nif_hash,
        jsonb_build_object('entity_type', CASE WHEN v_entity_type = 'person' THEN 'individual' ELSE 'company' END)
      )
      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
        SET updated_at = now()
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
      p_address_street || '-' || COALESCE(p_address_number, '')
      || COALESCE('-' || NULLIF(btrim(p_address_floor), ''), '')
      || COALESCE('-' || NULLIF(btrim(p_address_unit), ''), '')
      || '-' || p_address_postal_code,
      '\s+', '-', 'g'
    ));

    INSERT INTO public.anew_addresses
      (address_key, street, number, floor, unit, city, postal_code, district, country, created_by)
    VALUES
      (v_address_key, p_address_street, COALESCE(p_address_number, ''), p_address_floor,
       NULLIF(btrim(p_address_unit), ''),
       p_address_city, p_address_postal_code, p_address_district, 'PT', v_actor)
    RETURNING id INTO v_address_id;

    INSERT INTO public.anew_entity_addresses
      (entity_id, address_id, address_type, is_primary, created_by)
    VALUES
      (p_entity_id, v_address_id, 'work', true, v_actor);

    v_diff := v_diff || jsonb_build_object('anew_addresses', jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_address_id)),
      'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_street)),
      'floor',       jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_floor)),
      'unit',        jsonb_build_object('old', NULL, 'new', to_jsonb(NULLIF(btrim(p_address_unit), ''))),
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

REVOKE ALL ON FUNCTION public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text,
  text, text, text[], text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text,
  text, text, text[], text
) TO authenticated;

-- ============================================================
-- 3. Ficha técnica do edifício: tabela 1:1 anew_address_building
-- ============================================================
-- Tabela à parte (e não colunas em anew_addresses) porque:
--   • anew_addresses é usada por todas as moradas (organizações, utilizadores,
--     contactos, clientes); a ficha só interessa às moradas de entrega e assim
--     não aparece em selects, tipos e formulários que nada têm a ver com ela;
--   • uma linha só existe quando alguém preencheu a ficha (sem NULLs em massa);
--   • não impede as outras moradas: a chave é só address_id.
-- A ficha é do edifício/morada física (anew_addresses), não da ligação ao
-- cliente: dois clientes na mesma morada partilham a mesma ficha.
-- O "piso" é o anew_addresses.floor que já existe (o andar da entrega) — não
-- se duplica; a regra piso ≤ n_andares usa fn_piso_numerico(floor).
-- Acesso só por RPC (SECURITY DEFINER): RLS ligada e sem policies.

CREATE TABLE IF NOT EXISTS public.anew_address_building (
  address_id          uuid PRIMARY KEY REFERENCES public.anew_addresses(id) ON DELETE CASCADE,
  acesso              text,
  impacto_percent     integer,
  estacionamento      text,
  zona_estacionamento text,
  tem_elevador        boolean,
  n_elevadores        integer,
  n_andares           integer,
  n_fracoes_por_andar integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT anew_address_building_acesso_chk
    CHECK (acesso IS NULL OR acesso IN ('facil', 'dificil')),
  CONSTRAINT anew_address_building_impacto_chk
    CHECK (impacto_percent IS NULL OR (impacto_percent BETWEEN 0 AND 100 AND acesso IS NOT DISTINCT FROM 'dificil')),
  CONSTRAINT anew_address_building_estacionamento_chk
    CHECK (estacionamento IS NULL OR estacionamento IN ('pago', 'nao_pago', 'sem_estacionamento')),
  CONSTRAINT anew_address_building_zona_chk
    CHECK (zona_estacionamento IS NULL OR (zona_estacionamento IN ('verde', 'amarela', 'vermelha')
           AND estacionamento IS NOT NULL AND estacionamento IN ('pago', 'nao_pago'))),
  CONSTRAINT anew_address_building_elevadores_chk
    CHECK (n_elevadores IS NULL OR (n_elevadores BETWEEN 1 AND 50 AND tem_elevador IS TRUE)),
  CONSTRAINT anew_address_building_andares_chk
    CHECK (n_andares IS NULL OR n_andares BETWEEN 0 AND 200),
  CONSTRAINT anew_address_building_fracoes_chk
    CHECK (n_fracoes_por_andar IS NULL OR n_fracoes_por_andar BETWEEN 0 AND 200)
);

COMMENT ON TABLE public.anew_address_building IS
  'Ficha técnica do edifício de uma morada (1:1 com anew_addresses; usada nas moradas de entrega). O piso é anew_addresses.floor. Escrita só por rpc_add/rpc_update_entity_delivery_address (20261206160000).';

ALTER TABLE public.anew_address_building ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.anew_address_building FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.anew_address_building TO service_role;

-- ─── Piso numérico a partir do texto do andar ────────────────────────────────
-- "3", "3º", "3.º", "3 Esq" → 3; "-1" → -1; "R/C", "rc", "rés-do-chão" → 0;
-- sem número → NULL. Igual a pisoNumerico() em fichaTecnicaEdificio.ts.
CREATE OR REPLACE FUNCTION public.fn_piso_numerico(p_floor text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN p_floor IS NULL OR btrim(p_floor) = '' THEN NULL
    WHEN regexp_replace(lower(btrim(p_floor)), '[[:space:].]', '', 'g') ~ '^(r/?c|r[eé]s-?do-?ch[aã]o)' THEN 0
    WHEN btrim(p_floor) ~ '^-?[0-9]{1,4}(?![0-9])' THEN substring(btrim(p_floor) from '^-?[0-9]{1,4}')::integer
    ELSE NULL
  END
$function$;

REVOKE ALL ON FUNCTION public.fn_piso_numerico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piso_numerico(text) TO authenticated, service_role;

-- ─── Validação da ficha técnica (RAISE em PT) ────────────────────────────────
-- Mesmas regras que validarFichaTecnica() no frontend. Interna (chamada pelas
-- RPCs SECURITY DEFINER), fechada a anon/authenticated.
CREATE OR REPLACE FUNCTION public.fn_validar_ficha_edificio(
  p_floor               text,
  p_acesso              text,
  p_impacto_percent     integer,
  p_estacionamento      text,
  p_zona_estacionamento text,
  p_tem_elevador        boolean,
  p_n_elevadores        integer,
  p_n_andares           integer,
  p_n_fracoes_por_andar integer
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_piso integer;
BEGIN
  IF p_acesso IS NOT NULL AND p_acesso NOT IN ('facil', 'dificil') THEN
    RAISE EXCEPTION 'Acesso inválido (fácil ou difícil)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_impacto_percent IS NOT NULL AND p_impacto_percent NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'O impacto tem de ser um número inteiro entre 0 e 100' USING ERRCODE = 'check_violation';
  END IF;
  IF p_impacto_percent IS NOT NULL AND p_acesso IS DISTINCT FROM 'dificil' THEN
    RAISE EXCEPTION 'O impacto só se indica com acesso difícil' USING ERRCODE = 'check_violation';
  END IF;
  IF p_estacionamento IS NOT NULL AND p_estacionamento NOT IN ('pago', 'nao_pago', 'sem_estacionamento') THEN
    RAISE EXCEPTION 'Estacionamento inválido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_zona_estacionamento IS NOT NULL AND p_zona_estacionamento NOT IN ('verde', 'amarela', 'vermelha') THEN
    RAISE EXCEPTION 'Zona de estacionamento inválida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_zona_estacionamento IS NOT NULL AND p_estacionamento IS DISTINCT FROM 'pago' AND p_estacionamento IS DISTINCT FROM 'nao_pago' THEN
    RAISE EXCEPTION 'A zona só se indica quando há estacionamento' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_elevadores IS NOT NULL AND p_n_elevadores NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'O número de elevadores tem de ser um número inteiro entre 1 e 50' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_elevadores IS NOT NULL AND p_tem_elevador IS NOT TRUE THEN
    RAISE EXCEPTION 'O número de elevadores só se indica quando há elevador' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_andares IS NOT NULL AND p_n_andares NOT BETWEEN 0 AND 200 THEN
    RAISE EXCEPTION 'O número de andares tem de ser um número inteiro entre 0 e 200' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_fracoes_por_andar IS NOT NULL AND p_n_fracoes_por_andar NOT BETWEEN 0 AND 200 THEN
    RAISE EXCEPTION 'O número de frações por andar tem de ser um número inteiro entre 0 e 200' USING ERRCODE = 'check_violation';
  END IF;
  v_piso := public.fn_piso_numerico(p_floor);
  IF v_piso IS NOT NULL AND p_n_andares IS NOT NULL AND v_piso > p_n_andares THEN
    RAISE EXCEPTION 'O piso não pode ser acima do número de andares do edifício' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer) TO service_role;

-- ─── Gravar a ficha (substitui; tudo NULL = apaga) ───────────────────────────
-- Interna. Com tudo a NULL e tem_elevador NULL apaga a linha.
CREATE OR REPLACE FUNCTION public.fn_gravar_ficha_edificio(
  p_address_id          uuid,
  p_actor               uuid,
  p_acesso              text,
  p_impacto_percent     integer,
  p_estacionamento      text,
  p_zona_estacionamento text,
  p_tem_elevador        boolean,
  p_n_elevadores        integer,
  p_n_andares           integer,
  p_n_fracoes_por_andar integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_acesso IS NULL AND p_impacto_percent IS NULL AND p_estacionamento IS NULL
     AND p_zona_estacionamento IS NULL AND p_tem_elevador IS NULL AND p_n_elevadores IS NULL
     AND p_n_andares IS NULL AND p_n_fracoes_por_andar IS NULL THEN
    DELETE FROM public.anew_address_building WHERE address_id = p_address_id;
    RETURN;
  END IF;

  INSERT INTO public.anew_address_building AS b (
    address_id, acesso, impacto_percent, estacionamento, zona_estacionamento,
    tem_elevador, n_elevadores, n_andares, n_fracoes_por_andar, created_by, updated_by
  ) VALUES (
    p_address_id, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar, p_actor, p_actor
  )
  ON CONFLICT (address_id) DO UPDATE SET
    acesso              = EXCLUDED.acesso,
    impacto_percent     = EXCLUDED.impacto_percent,
    estacionamento      = EXCLUDED.estacionamento,
    zona_estacionamento = EXCLUDED.zona_estacionamento,
    tem_elevador        = EXCLUDED.tem_elevador,
    n_elevadores        = EXCLUDED.n_elevadores,
    n_andares           = EXCLUDED.n_andares,
    n_fracoes_por_andar = EXCLUDED.n_fracoes_por_andar,
    updated_at          = now(),
    updated_by          = EXCLUDED.updated_by;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_gravar_ficha_edificio(uuid, uuid, text, integer, text, text, boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_gravar_ficha_edificio(uuid, uuid, text, integer, text, text, boolean, integer, integer, integer) TO service_role;

-- ============================================================
-- 4. rpc_list_entity_delivery_addresses — devolve também a ficha técnica
-- ============================================================
-- Muda o tipo de retorno => DROP + CREATE + GRANTs reaplicados (os de
-- 20261204400000). Resto igual.
DROP FUNCTION IF EXISTS public.rpc_list_entity_delivery_addresses(uuid);

CREATE OR REPLACE FUNCTION public.rpc_list_entity_delivery_addresses(p_entity_id uuid)
RETURNS TABLE(
  entity_address_id   uuid,
  address_id          uuid,
  street              text,
  number              text,
  floor               text,
  unit                text,
  postal_code         text,
  city                text,
  formatted           text,
  created_at          timestamptz,
  has_building        boolean,
  acesso              text,
  impacto_percent     integer,
  estacionamento      text,
  zona_estacionamento text,
  tem_elevador        boolean,
  n_elevadores        integer,
  n_andares           integer,
  n_fracoes_por_andar integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'view') THEN
    RAISE EXCEPTION 'Sem permissão para ver as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ea.id,
    a.id,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    nullif(concat_ws(', ',
      nullif(btrim(a.street), ''),
      nullif(btrim(a.number), ''),
      nullif(btrim(a.postal_code), ''),
      nullif(btrim(a.city), '')
    ), ''),
    ea.created_at,
    (b.address_id IS NOT NULL),
    b.acesso,
    b.impacto_percent,
    b.estacionamento,
    b.zona_estacionamento,
    b.tem_elevador,
    b.n_elevadores,
    b.n_andares,
    b.n_fracoes_por_andar
  FROM public.anew_entity_addresses ea
  JOIN public.anew_addresses a ON a.id = ea.address_id
  LEFT JOIN public.anew_address_building b ON b.address_id = a.id
  WHERE ea.entity_id = p_entity_id
    AND ea.address_type = 'delivery'
    AND (ea.valid_to IS NULL OR ea.valid_to > now())
  ORDER BY ea.created_at, ea.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) TO authenticated;

-- ============================================================
-- 5. rpc_add_entity_delivery_address — aceita a ficha técnica
-- ============================================================
-- Parte da definição vigente (20261204420000: permissão no modo 'add').
-- 8 parâmetros novos no fim, todos DEFAULT NULL. Com todos a NULL a ficha da
-- morada (se já existir, por a morada ser reutilizada) não é tocada; com
-- algum preenchido a ficha é substituída pela enviada.
DROP FUNCTION IF EXISTS public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_add_entity_delivery_address(
  p_entity_id           uuid,
  p_street              text,
  p_number              text DEFAULT NULL::text,
  p_postal_code         text DEFAULT NULL::text,
  p_city                text DEFAULT NULL::text,
  p_floor               text DEFAULT NULL::text,
  p_unit                text DEFAULT NULL::text,
  p_acesso              text DEFAULT NULL::text,
  p_impacto_percent     integer DEFAULT NULL::integer,
  p_estacionamento      text DEFAULT NULL::text,
  p_zona_estacionamento text DEFAULT NULL::text,
  p_tem_elevador        boolean DEFAULT NULL::boolean,
  p_n_elevadores        integer DEFAULT NULL::integer,
  p_n_andares           integer DEFAULT NULL::integer,
  p_n_fracoes_por_andar integer DEFAULT NULL::integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor      uuid;
  v_street     text := btrim(coalesce(p_street, ''));
  v_number     text := btrim(coalesce(p_number, ''));
  v_floor      text := nullif(btrim(coalesce(p_floor, '')), '');
  v_unit       text := nullif(btrim(coalesce(p_unit, '')), '');
  v_postal     text := btrim(coalesce(p_postal_code, ''));
  v_city       text := btrim(coalesce(p_city, ''));
  v_country    text := 'PT';
  v_key        text;
  v_address_id uuid;
  v_link_id    uuid;
  v_existing   boolean := false;
  v_formatted  text;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'add') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_street = '' THEN
    RAISE EXCEPTION 'A rua é obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal = '' THEN
    RAISE EXCEPTION 'O código postal é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  -- Mesmo formato da ficha (POSTAL_CODE_PT_PATTERN / sync_entity_primary_address).
  IF v_postal !~ '^[0-9]{4}-[0-9]{3}$' OR v_postal = '0000-000' THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;
  IF v_city = '' THEN
    RAISE EXCEPTION 'A localidade é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_validar_ficha_edificio(
    v_floor, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar);

  -- Mesmo cálculo de address_key que assign_address_to_org.
  v_key :=
    lower(v_street) || '|' ||
    lower(v_number) || '|' ||
    lower(coalesce(v_floor, '')) || '|' ||
    lower(coalesce(v_unit, '')) || '|' ||
    lower(v_postal) || '|' ||
    lower(v_city) || '|' ||
    lower(v_country);

  -- Reutiliza uma morada existente (nunca lhe faz UPDATE); senão cria.
  SELECT a.id INTO v_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_key
  ORDER BY a.created_at
  LIMIT 1;

  IF v_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      street, number, floor, unit, postal_code, city, country, address_key, created_by
    ) VALUES (
      v_street, v_number, v_floor, v_unit, v_postal, v_city, v_country, v_key, v_actor
    )
    RETURNING id INTO v_address_id;
  ELSE
    -- Já ligada a esta entidade como entrega ativa? Devolve a existente.
    SELECT ea.id INTO v_link_id
    FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = p_entity_id
      AND ea.address_id = v_address_id
      AND ea.address_type = 'delivery'
      AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ORDER BY ea.created_at
    LIMIT 1;
    v_existing := v_link_id IS NOT NULL;
  END IF;

  IF v_link_id IS NULL THEN
    INSERT INTO public.anew_entity_addresses (
      entity_id, address_id, address_type, is_primary, is_fiscal, valid_from, created_by
    ) VALUES (
      p_entity_id, v_address_id, 'delivery', false, false, now(), v_actor
    )
    RETURNING id INTO v_link_id;
  END IF;

  -- Ficha técnica: só quando veio alguma coisa (senão fica a que houver).
  IF p_acesso IS NOT NULL OR p_impacto_percent IS NOT NULL OR p_estacionamento IS NOT NULL
     OR p_zona_estacionamento IS NOT NULL OR p_tem_elevador IS NOT NULL OR p_n_elevadores IS NOT NULL
     OR p_n_andares IS NOT NULL OR p_n_fracoes_por_andar IS NOT NULL THEN
    PERFORM public.fn_gravar_ficha_edificio(
      v_address_id, v_actor, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
      p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar);
  END IF;

  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(btrim(a.postal_code), ''),
           nullif(btrim(a.city), '')
         ), '')
    INTO v_formatted
  FROM public.anew_addresses a
  WHERE a.id = v_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', v_link_id,
    'address_id',        v_address_id,
    'formatted',         v_formatted,
    'already_existed',   v_existing
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) IS
  'Acrescenta uma morada de entrega a uma entidade (reutiliza anew_addresses pelo address_key). 20261206160000: ficha técnica do edifício opcional (anew_address_building); tudo NULL = não mexe na ficha existente.';

-- ============================================================
-- 6. rpc_update_entity_delivery_address — editar uma morada de entrega
-- ============================================================
-- Permissão: modo 'edit' de fn_entity_delivery_address_access (a mesma regra
-- de rpc_remove_entity_delivery_address — clients.edit/leads.edit na ficha).
-- O modo 'add' também deixa quem edita encomendas criar moradas novas; editar
-- moradas existentes de um cliente fica reservado a quem edita o cliente.
-- Validações iguais às do add (rua, código postal 0000-000, localidade e a
-- ficha técnica).
--
-- Morada partilhada / address_key: as linhas de anew_addresses são
-- partilhadas entre entidades e NUNCA se lhes faz UPDATE (regra de
-- 20261204400000). Editar recalcula o address_key; se mudou, reutiliza a
-- morada com essa chave ou cria uma nova, e a ligação
-- (anew_entity_addresses) passa a apontar para ela — mantendo o mesmo
-- entity_address_id (quem o guardou, ex. um orçamento, continua válido). A
-- morada antiga fica intacta para as outras entidades que a usem.
-- A ficha técnica é substituída pela enviada (tudo NULL = apagar) e fica na
-- morada final; se essa morada for partilhada, a ficha é a do edifício e vale
-- para todos.
CREATE OR REPLACE FUNCTION public.rpc_update_entity_delivery_address(
  p_entity_address_id   uuid,
  p_street              text,
  p_number              text DEFAULT NULL::text,
  p_postal_code         text DEFAULT NULL::text,
  p_city                text DEFAULT NULL::text,
  p_floor               text DEFAULT NULL::text,
  p_unit                text DEFAULT NULL::text,
  p_acesso              text DEFAULT NULL::text,
  p_impacto_percent     integer DEFAULT NULL::integer,
  p_estacionamento      text DEFAULT NULL::text,
  p_zona_estacionamento text DEFAULT NULL::text,
  p_tem_elevador        boolean DEFAULT NULL::boolean,
  p_n_elevadores        integer DEFAULT NULL::integer,
  p_n_andares           integer DEFAULT NULL::integer,
  p_n_fracoes_por_andar integer DEFAULT NULL::integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor          uuid;
  v_street         text := btrim(coalesce(p_street, ''));
  v_number         text := btrim(coalesce(p_number, ''));
  v_floor          text := nullif(btrim(coalesce(p_floor, '')), '');
  v_unit           text := nullif(btrim(coalesce(p_unit, '')), '');
  v_postal         text := btrim(coalesce(p_postal_code, ''));
  v_city           text := btrim(coalesce(p_city, ''));
  v_country        text := 'PT';
  v_key            text;
  v_entity_id      uuid;
  v_type           text;
  v_valid_to       timestamptz;
  v_old_address_id uuid;
  v_old_key        text;
  v_address_id     uuid;
  v_formatted      text;
BEGIN
  IF p_entity_address_id IS NULL THEN
    RAISE EXCEPTION 'entity_address_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT ea.entity_id, ea.address_type, ea.valid_to, ea.address_id
    INTO v_entity_id, v_type, v_valid_to, v_old_address_id
  FROM public.anew_entity_addresses ea
  WHERE ea.id = p_entity_address_id
  FOR UPDATE;

  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'Morada não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Permissão antes de revelar o tipo/estado da linha.
  IF NOT public.fn_entity_delivery_address_access(v_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_type IS DISTINCT FROM 'delivery' THEN
    RAISE EXCEPTION 'Só é possível editar moradas de entrega' USING ERRCODE = 'check_violation';
  END IF;

  IF v_valid_to IS NOT NULL AND v_valid_to <= now() THEN
    RAISE EXCEPTION 'Esta morada de entrega foi removida' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_street = '' THEN
    RAISE EXCEPTION 'A rua é obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal = '' THEN
    RAISE EXCEPTION 'O código postal é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal !~ '^[0-9]{4}-[0-9]{3}$' OR v_postal = '0000-000' THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;
  IF v_city = '' THEN
    RAISE EXCEPTION 'A localidade é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_validar_ficha_edificio(
    v_floor, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar);

  -- Mesmo cálculo de address_key que rpc_add_entity_delivery_address.
  v_key :=
    lower(v_street) || '|' ||
    lower(v_number) || '|' ||
    lower(coalesce(v_floor, '')) || '|' ||
    lower(coalesce(v_unit, '')) || '|' ||
    lower(v_postal) || '|' ||
    lower(v_city) || '|' ||
    lower(v_country);

  SELECT a.address_key INTO v_old_key FROM public.anew_addresses a WHERE a.id = v_old_address_id;

  IF v_old_key IS NOT DISTINCT FROM v_key THEN
    v_address_id := v_old_address_id;
  ELSE
    SELECT a.id INTO v_address_id
    FROM public.anew_addresses a
    WHERE a.address_key = v_key
    ORDER BY a.created_at
    LIMIT 1;

    IF v_address_id IS NULL THEN
      INSERT INTO public.anew_addresses (
        street, number, floor, unit, postal_code, city, country, address_key, created_by
      ) VALUES (
        v_street, v_number, v_floor, v_unit, v_postal, v_city, v_country, v_key, v_actor
      )
      RETURNING id INTO v_address_id;
    ELSIF EXISTS (
      SELECT 1
      FROM public.anew_entity_addresses ea
      WHERE ea.entity_id = v_entity_id
        AND ea.address_id = v_address_id
        AND ea.address_type = 'delivery'
        AND ea.id <> p_entity_address_id
        AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ) THEN
      RAISE EXCEPTION 'Este cliente já tem esta morada de entrega' USING ERRCODE = 'unique_violation';
    END IF;

    IF v_address_id IS DISTINCT FROM v_old_address_id THEN
      UPDATE public.anew_entity_addresses
         SET address_id = v_address_id
       WHERE id = p_entity_address_id;
    END IF;
  END IF;

  PERFORM public.fn_gravar_ficha_edificio(
    v_address_id, v_actor, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar);

  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(btrim(a.postal_code), ''),
           nullif(btrim(a.city), '')
         ), '')
    INTO v_formatted
  FROM public.anew_addresses a
  WHERE a.id = v_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', p_entity_address_id,
    'address_id',        v_address_id,
    'formatted',         v_formatted,
    'address_changed',   v_address_id IS DISTINCT FROM v_old_address_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer) IS
  'Edita uma morada de entrega (20261206160000). Nunca faz UPDATE a anew_addresses: se a morada mudou, reutiliza/cria pela address_key e repõe a ligação (mesmo entity_address_id). A ficha técnica é substituída (tudo NULL = apagar).';

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_fn  text;
  v_oid oid;
BEGIN
  -- Uma só sobrecarga de cada função alterada.
  FOREACH v_fn IN ARRAY ARRAY[
    'rpc_update_client', 'rpc_create_client_manual', 'rpc_add_entity_delivery_address',
    'rpc_list_entity_delivery_addresses', 'rpc_update_entity_delivery_address'
  ] LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_fn) <> 1 THEN
      RAISE EXCEPTION 'CONFERIR: % não tem exatamente uma sobrecarga', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_update_client(uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, text, text, text[], boolean, text, text, text)',
    'public.rpc_create_client_manual(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text[], text)',
    'public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer)',
    'public.rpc_list_entity_delivery_addresses(uuid)',
    'public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer)'
  ] LOOP
    v_oid := v_fn::regprocedure;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: anon tem EXECUTE em %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: authenticated sem EXECUTE em %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer)',
    'public.fn_gravar_ficha_edificio(uuid, uuid, text, integer, text, text, boolean, integer, integer, integer)'
  ] LOOP
    IF has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE')
       OR has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: % devia ser interna', v_fn;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.anew_address_building', 'SELECT')
     OR has_table_privilege('anon', 'public.anew_address_building', 'SELECT') THEN
    RAISE EXCEPTION 'CONFERIR: anew_address_building não devia ser legível diretamente';
  END IF;

  -- fn_piso_numerico
  IF public.fn_piso_numerico('3º') IS DISTINCT FROM 3
     OR public.fn_piso_numerico('R/C') IS DISTINCT FROM 0
     OR public.fn_piso_numerico('-1') IS DISTINCT FROM -1
     OR public.fn_piso_numerico('Cave') IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: fn_piso_numerico';
  END IF;
END;
$$;
