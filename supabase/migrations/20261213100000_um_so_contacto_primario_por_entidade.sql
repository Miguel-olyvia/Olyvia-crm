-- =============================================================================
-- POR APLICAR — não foi feito db push. Rever antes de aplicar em produção.
-- =============================================================================
-- Um só email/telefone primário por entidade ao editar.
--
-- Problema: ao editar o email/telefone de um cliente, a linha antiga de
-- anew_entity_emails / anew_entity_phones ficava com is_primary=true ao lado
-- da nova (produção: 578 entidades com vários emails primários, 576 com vários
-- telefones primários). Os leitores escolhiam o antigo.
--
-- Regra: depois de uma edição fica exatamente UM primário por entidade = o
-- valor novo. As linhas antigas são despromovidas (is_primary=false), nunca
-- apagadas — o histórico fica.
--
-- 1. rpc_update_client: CREATE OR REPLACE a partir da definição VIVA
--    (pg_get_functiondef), igual exceto nos blocos 2 (email) e 3 (telefone):
--    alvo = primário mais recente (ORDER BY created_at DESC, id DESC),
--    atualizado no sítio; restantes primários da entidade despromovidos; no
--    caminho de INSERT, despromove primeiro. CREATE OR REPLACE mantém os
--    GRANTs atuais (postgres, authenticated, service_role). Só existe uma
--    assinatura (23 argumentos) na BD.
--
-- 2. rpc_set_entity_primary_email / rpc_set_entity_primary_phone: novas RPCs
--    SECURITY DEFINER para o diálogo de edição da lead (entityContactSync.ts),
--    que fazia DELETE dos primários + INSERT sem ser atómico; o DELETE podia
--    ser bloqueado em silêncio pela RLS e deixava o primário antigo.
--    Autorização = a mesma da RLS de UPDATE destas tabelas
--    (is_entity_contact_in_owner_scope com leads.edit / clients.edit), mais
--    a de INSERT (is_entity_in_user_scope), mais a política
--    system_admin_pii_default_deny (WITH CHECK). created_by =
--    current_business_user_id(), como em rpc_update_client.
--
-- Nota: não corrige os dados já duplicados em produção (só evita novos).
-- A limpeza dos 578/576 fica para uma migração de dados à parte.
-- =============================================================================

-- 1. rpc_update_client (definição viva + blocos 2 e 3 corrigidos)
CREATE OR REPLACE FUNCTION public.rpc_update_client(p_client_id uuid, p_entity_id uuid, p_display_name text, p_norm_first text, p_norm_last text, p_email text, p_phone text, p_phone_country text, p_vat text, p_status text, p_notes text, p_assigned_to uuid, p_address_street text DEFAULT NULL::text, p_address_city text DEFAULT NULL::text, p_address_postal_code text DEFAULT NULL::text, p_address_number text DEFAULT NULL::text, p_nif_encrypted text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_nif_tokens text[] DEFAULT NULL::text[], p_clear_nif boolean DEFAULT false, p_entity_type text DEFAULT NULL::text, p_address_floor text DEFAULT NULL::text, p_address_unit text DEFAULT NULL::text)
 RETURNS anew_clients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 20261213100000: o alvo é o primário MAIS RECENTE (ORDER BY created_at DESC,
  -- id DESC) e todos os outros primários da mesma entidade são despromovidos
  -- (is_primary=false, sem apagar — fica o histórico). Antes era um LIMIT 1
  -- sem ORDER BY e o primário antigo ficava ao lado do novo.
  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT id, email INTO v_email_id, v_email_before
    FROM public.anew_entity_emails
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF v_email_id IS NOT NULL THEN
      UPDATE public.anew_entity_emails
      SET is_primary = false
      WHERE entity_id = v_before_cl.entity_id
        AND is_primary = true
        AND id <> v_email_id;

      UPDATE public.anew_entity_emails SET email = p_email WHERE id = v_email_id;
      IF v_email_before IS DISTINCT FROM p_email THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_emails',
          jsonb_build_object('email',
            jsonb_build_object('old', to_jsonb(v_email_before), 'new', to_jsonb(p_email))));
      END IF;
    ELSE
      -- Defensivo (concorrência): garantir que o novo fica o único primário.
      UPDATE public.anew_entity_emails
      SET is_primary = false
      WHERE entity_id = v_before_cl.entity_id
        AND is_primary = true;

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
  -- 20261213100000: mesma regra que o email — primário mais recente atualizado
  -- no sítio, restantes primários despromovidos.
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id, phone_number, country_code
      INTO v_phone_id, v_phone_before, v_phone_cc_before
    FROM public.anew_entity_phones
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF v_phone_id IS NOT NULL THEN
      UPDATE public.anew_entity_phones
      SET is_primary = false
      WHERE entity_id = v_before_cl.entity_id
        AND is_primary = true
        AND id <> v_phone_id;

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
      -- Defensivo (concorrência): garantir que o novo fica o único primário.
      UPDATE public.anew_entity_phones
      SET is_primary = false
      WHERE entity_id = v_before_cl.entity_id
        AND is_primary = true;

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
$function$
;

-- =============================================================================
-- 2. RPCs para definir o email / telefone primário de uma entidade
-- =============================================================================

-- Autorização comum às duas RPCs. Espelha, para escrita:
--   * authenticated_update_anew_entity_* (is_entity_contact_in_owner_scope com
--     leads.edit / clients.edit) — o caso mais exigente, pois despromover é
--     um UPDATE;
--   * authenticated_insert_anew_entity_* (is_entity_in_user_scope);
--   * system_admin_pii_default_deny (WITH CHECK).
-- O ramo lead/cliente de is_entity_contact_in_owner_scope já obriga a que a
-- lead/cliente desta entidade esteja numa organização (e com dono) dentro do
-- âmbito de edição do chamador, por isso não é preciso p_organization_id.
CREATE OR REPLACE FUNCTION public.fn_assert_can_edit_entity_contacts(
  p_entity_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT public.is_entity_contact_in_owner_scope(
           p_entity_id,
           public.crm_scope_keys('leads.edit'),
           public.crm_scope_keys('clients.edit'))
     OR NOT public.is_entity_in_user_scope(p_entity_id, v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para editar os contactos desta entidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public.is_system_admin(v_uid) AND NOT EXISTS (
    SELECT 1
    FROM public.anew_entity_roles er
    WHERE er.entity_id = p_entity_id
      AND er.deleted_at IS NULL
      AND er.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar os contactos desta entidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;

-- Só para uso interno das RPCs abaixo.
REVOKE ALL ON FUNCTION public.fn_assert_can_edit_entity_contacts(uuid) FROM PUBLIC, anon, authenticated;


-- Define o email primário da entidade. Despromove os primários atuais; se já
-- existir uma linha com o mesmo email (sem distinguir maiúsculas), promove-a
-- e não mexe em mais nada; senão insere uma linha nova primária.
-- Devolve o id da linha que ficou primária.
CREATE OR REPLACE FUNCTION public.rpc_set_entity_primary_email(
  p_entity_id uuid,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_email text := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_id    uuid;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM public.fn_assert_can_edit_entity_contacts(p_entity_id);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Serializa edições concorrentes à mesma entidade (rpc_update_client já
  -- bloqueia esta linha com o UPDATE a anew_entities).
  PERFORM 1 FROM public.anew_entities WHERE id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entidade não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Reaproveita uma linha com o mesmo email (o gatilho
  -- trg_normalize_entity_email grava sempre em minúsculas).
  SELECT id INTO v_id
  FROM public.anew_entity_emails
  WHERE entity_id = p_entity_id
    AND lower(btrim(email)) = lower(v_email)
  ORDER BY is_primary DESC NULLS LAST, created_at DESC, id DESC
  LIMIT 1;

  UPDATE public.anew_entity_emails
  SET is_primary = false
  WHERE entity_id = p_entity_id
    AND is_primary = true
    AND id IS DISTINCT FROM v_id;

  IF v_id IS NOT NULL THEN
    -- Só promove; o email não muda, por isso o gatilho de unicidade
    -- (fn_trg_check_email_unique_on_email_write) não volta a correr.
    UPDATE public.anew_entity_emails
    SET is_primary = true
    WHERE id = v_id
      AND is_primary IS DISTINCT FROM true;
  ELSE
    INSERT INTO public.anew_entity_emails
      (entity_id, email, is_primary, email_type, created_by)
    VALUES
      (p_entity_id, v_email, true, 'personal', v_actor)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_set_entity_primary_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_entity_primary_email(uuid, text) TO authenticated;


-- Define o telefone primário da entidade. Mesma lógica do email; a
-- comparação é feita pelos dígitos do número e pelo indicativo (vazio/NULL
-- conta como +351, o indicativo por omissão da app).
CREATE OR REPLACE FUNCTION public.rpc_set_entity_primary_phone(
  p_entity_id uuid,
  p_phone text,
  p_country_code text DEFAULT '+351'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_phone  text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_cc     text := NULLIF(btrim(COALESCE(p_country_code, '')), '');
  v_digits text;
  v_id     uuid;
BEGIN
  v_digits := regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g');
  IF v_phone IS NULL OR v_digits = '' THEN
    RAISE EXCEPTION 'Telefone obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM public.fn_assert_can_edit_entity_contacts(p_entity_id);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM public.anew_entities WHERE id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entidade não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_id
  FROM public.anew_entity_phones
  WHERE entity_id = p_entity_id
    AND regexp_replace(phone_number, '\D', '', 'g') = v_digits
    AND COALESCE(NULLIF(btrim(country_code), ''), '+351') = COALESCE(v_cc, '+351')
  ORDER BY is_primary DESC NULLS LAST, created_at DESC, id DESC
  LIMIT 1;

  UPDATE public.anew_entity_phones
  SET is_primary = false
  WHERE entity_id = p_entity_id
    AND is_primary = true
    AND id IS DISTINCT FROM v_id;

  IF v_id IS NOT NULL THEN
    UPDATE public.anew_entity_phones
    SET is_primary = true
    WHERE id = v_id
      AND is_primary IS DISTINCT FROM true;
  ELSE
    INSERT INTO public.anew_entity_phones
      (entity_id, phone_number, country_code, is_primary, phone_type, created_by)
    VALUES
      (p_entity_id, v_phone, v_cc, true, 'mobile', v_actor)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_set_entity_primary_phone(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_entity_primary_phone(uuid, text, text) TO authenticated;
