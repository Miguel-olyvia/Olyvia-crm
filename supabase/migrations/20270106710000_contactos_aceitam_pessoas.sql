-- ============================================================
-- 20270106710000_contactos_aceitam_pessoas
-- ============================================================
-- O que faz (aprovado pelo utilizador, 04/11/2026): não há ecrã de Contactos na app viva — as pessoas vivem em Pessoas
--   (pessoas.view/create/edit/delete). As funções e policies dos contactos (tabela anew_contacts) passam a aceitar o pessoas.*
--   equivalente ALÉM do código antigo (OU): contacts.view→pessoas.view, contacts.create→pessoas.create, contacts.edit→pessoas.edit,
--   contacts.delete→pessoas.delete. Ninguém perde acesso; quem tem o código antigo fica exatamente como estava.
--   - resolve_contact_access_context: sem o código antigo, aceita o pessoas.* equivalente e usa o âmbito (own/team/org) do pessoas.*.
--     Por ela passam can_access_contact_row, get_contact_alert_counts, get_contact_dashboard_kpis, create_contact_with_role,
--     convert_contact_to_client (contacts.edit; clients.create continua igual) e soft_delete_entity_facet (contacto).
--   - rpc_manage_contact_tag e rpc_update_contact: has_anew_permission(contacts.edit) OU has_anew_permission(pessoas.edit).
--   - policies anew_contacts_select/insert/update/delete: has_anew_permission(contacts.X) OU has_anew_permission(pessoas.X).
--   - As policies de anew_entity_roles / anew_entity_relationships já aceitavam pessoas.* (não mudam).
--   - Papéis com contacts.X sem pessoas.X recebem pessoas.X; âmbitos contacts.X em anew_membership_permission_scopes são
--     espelhados para pessoas.X quando o membro ainda não tem âmbito para pessoas.X (no ramo uetjghdkwbywbftedtth: 0 e 0).
-- Só muda a expressão da permissão; o resto é o texto vivo (pg_get_functiondef / pg_policies, 04/11/2026). Não se apaga nenhum
-- código nem se retira nenhuma concessão. Sem tabelas nem colunas novas.
-- Reversão (só como migration nova): repor as funções/policies só com o código antigo; as concessões pessoas.* ficam.
-- ============================================================

SET lock_timeout = '5s';

-- 1) resolve_contact_access_context (texto vivo, 04/11/2026)
CREATE OR REPLACE FUNCTION public.resolve_contact_access_context(p_org_id uuid, p_requested_scope text DEFAULT 'ORG'::text, p_permission_code text DEFAULT 'contacts.view'::text)
 RETURNS TABLE(auth_user_id uuid, anew_user_id uuid, visible_org_ids uuid[], requested_scope text, permitted_scope text, applied_scope text, team_user_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_visible_org_ids uuid[];
  v_requested_scope text;
  v_permitted_scope text := 'OWNED';
  v_applied_scope text := 'OWNED';
  v_team_user_ids uuid[] := ARRAY[]::uuid[];
  v_is_admin boolean := false;
  v_has_permission boolean := false;
  -- 20270106710000: os contactos vivem em Pessoas. Sem o código antigo, serve o pessoas.* equivalente.
  v_codigo_pessoas text := CASE p_permission_code
    WHEN 'contacts.view' THEN 'pessoas.view'
    WHEN 'contacts.create' THEN 'pessoas.create'
    WHEN 'contacts.edit' THEN 'pessoas.edit'
    WHEN 'contacts.delete' THEN 'pessoas.delete'
  END;
  v_codigo_ambito text := p_permission_code;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  SELECT au.id
  INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'business user not found for auth user';
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_crm_org_ids(v_auth_uid)
  )
  INTO v_visible_org_ids;

  IF NOT (p_org_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'permission denied: organization not visible';
  END IF;

  v_requested_scope := UPPER(COALESCE(NULLIF(BTRIM(p_requested_scope), ''), 'ORG'));
  IF v_requested_scope = 'ALL' THEN
    v_requested_scope := 'ORG';
  END IF;
  IF v_requested_scope NOT IN ('ORG', 'TEAM', 'OWNED') THEN
    v_requested_scope := 'ORG';
  END IF;

  WITH RECURSIVE
  admin_memberships AS (
    SELECT m.id, m.organization_id, r.code AS role_code
    FROM public.anew_memberships m
    JOIN public.anew_roles r
      ON r.id = m.role_id
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND r.code IN ('system_admin', 'super_admin')
  ),
  super_roots AS (
    SELECT organization_id
    FROM admin_memberships
    WHERE role_code = 'super_admin'
  ),
  super_descendants AS (
    SELECT organization_id FROM super_roots
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN super_descendants d
      ON d.organization_id = h.parent_org_id
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM admin_memberships
      WHERE role_code = 'system_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM super_descendants
      WHERE organization_id = p_org_id
    )
  INTO v_is_admin;

  WITH RECURSIVE org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc
      ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped_memberships sm
    JOIN public.anew_role_permissions arp
      ON arp.role_id = sm.role_id
     AND arp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  -- 20270106710000: quem tem o código antigo fica exatamente como estava (âmbito do código antigo); quem só tem o pessoas.*
  -- equivalente passa, com o âmbito do pessoas.*.
  IF NOT v_has_permission AND v_codigo_pessoas IS NOT NULL THEN
    WITH RECURSIVE org_chain AS (
      SELECT p_org_id AS org_id
      UNION
      SELECT h.parent_org_id
      FROM public.anew_hierarchy h
      JOIN org_chain oc
        ON oc.org_id = h.child_org_id
      WHERE h.parent_org_id IS NOT NULL
    )
    SELECT EXISTS (
      SELECT 1
      FROM public.anew_memberships m
      JOIN public.anew_role_permissions arp
        ON arp.role_id = m.role_id
       AND arp.permission_code = v_codigo_pessoas
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id IN (SELECT org_id FROM org_chain)
    )
    INTO v_has_permission;
    IF v_has_permission THEN
      v_codigo_ambito := v_codigo_pessoas;
    END IF;
  END IF;

  IF NOT v_is_admin AND NOT v_has_permission THEN
    RAISE EXCEPTION 'permission denied: % required', p_permission_code;
  END IF;

  IF v_is_admin THEN
    v_permitted_scope := 'ORG';
  ELSE
    -- Scope comes ONLY from memberships in this organization.
    WITH own_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id = p_org_id
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om
          ON om.id = s.membership_id
        WHERE s.permission_code = v_codigo_ambito
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om
          ON om.id = s.membership_id
        WHERE s.permission_code = v_codigo_ambito
          AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      ELSE 'OWNED'
    END
    INTO v_permitted_scope;
  END IF;

  IF v_requested_scope = 'ORG' THEN
    v_applied_scope := v_permitted_scope;
  ELSIF v_requested_scope = 'TEAM' THEN
    v_applied_scope := CASE
      WHEN v_permitted_scope IN ('ORG', 'TEAM') THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSE
    v_applied_scope := 'OWNED';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
  INTO v_team_user_ids
  FROM public.organization_teams t
  JOIN public.organization_team_members tm
    ON tm.team_id = t.id
  WHERE t.organization_id = p_org_id
    AND t.leader_id = v_anew_user_id;

  RETURN QUERY
  SELECT
    v_auth_uid,
    v_anew_user_id,
    COALESCE(v_visible_org_ids, ARRAY[]::uuid[]),
    v_requested_scope,
    v_permitted_scope,
    v_applied_scope,
    COALESCE(v_team_user_ids, ARRAY[]::uuid[]);
END;
$function$;

-- 2) rpc_manage_contact_tag (texto vivo, 04/11/2026)
CREATE OR REPLACE FUNCTION public.rpc_manage_contact_tag(p_action text, p_entity_id uuid, p_organization_id uuid, p_tag_id uuid, p_tag text, p_color text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_tag_id     uuid;
  v_tag_before RECORD;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_entity_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'entity_id e organization_id são obrigatórios' USING ERRCODE = 'not_null_violation';
  END IF;

  -- 20270106710000: aceita também pessoas.edit (os contactos vivem em Pessoas).
  IF NOT (public.has_anew_permission(auth.uid(), 'contacts.edit') OR public.has_anew_permission(auth.uid(), 'pessoas.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para gerir tags' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action = 'add' THEN
    IF p_tag IS NULL OR btrim(p_tag) = '' THEN
      RAISE EXCEPTION 'Tag obrigatória' USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO public.contact_tags (entity_id, organization_id, tag, color, created_by)
    VALUES (p_entity_id, p_organization_id, btrim(p_tag), COALESCE(p_color, 'blue'), v_actor::text)
    RETURNING id INTO v_tag_id;

    v_diff := jsonb_build_object('contact_tags', jsonb_build_object(
      'id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_tag_id)),
      'tag',   jsonb_build_object('old', NULL, 'new', to_jsonb(btrim(p_tag))),
      'color', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_color, 'blue')))
    ));

    PERFORM public.fn_manual_audit_log(
      'contact_tags', p_entity_id, p_organization_id, 'INSERT', v_diff, 'web_app'
    );

    RETURN jsonb_build_object('tag_id', v_tag_id);

  ELSIF p_action = 'remove' THEN
    IF p_tag_id IS NULL THEN
      RAISE EXCEPTION 'tag_id obrigatório para remover' USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT tag, color INTO v_tag_before
    FROM public.contact_tags
    WHERE id = p_tag_id AND entity_id = p_entity_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('tag_id', p_tag_id, 'removed', false);
    END IF;

    DELETE FROM public.contact_tags
    WHERE id = p_tag_id AND entity_id = p_entity_id AND organization_id = p_organization_id;

    v_diff := jsonb_build_object('contact_tags', jsonb_build_object(
      'id',  jsonb_build_object('old', to_jsonb(p_tag_id), 'new', NULL),
      'tag', jsonb_build_object('old', to_jsonb(v_tag_before.tag), 'new', NULL)
    ));

    PERFORM public.fn_manual_audit_log(
      'contact_tags', p_entity_id, p_organization_id, 'DELETE', v_diff, 'web_app'
    );

    RETURN jsonb_build_object('tag_id', p_tag_id, 'removed', true);

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;
END;
$function$;

-- 3) rpc_update_contact (texto vivo, 04/11/2026)
CREATE OR REPLACE FUNCTION public.rpc_update_contact(p_contact_id uuid, p_entity_id uuid, p_display_name text, p_norm_first text, p_norm_last text, p_email text, p_phone text, p_phone_country text, p_vat text, p_position text, p_status text, p_notes text, p_organization_id text, p_assigned_to uuid, p_address text, p_city text, p_postal_code text, p_entity_type text, p_nif_encrypted text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_nif_tokens text[] DEFAULT NULL::text[])
 RETURNS anew_contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 20270106710000: aceita também pessoas.edit (os contactos vivem em Pessoas); o âmbito vem de can_access_contact_row.
  IF NOT (public.has_anew_permission(auth.uid(), 'contacts.edit') OR public.has_anew_permission(auth.uid(), 'pessoas.edit')) THEN
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
        --
        -- FIX (20261101050000, bundled): fiscal_entities has no entity_type
        -- column — it never did (same pre-existing bug already fixed for
        -- create_contact_with_role in 20261101040000; this INSERT had it too,
        -- undetected until now). The individual/company classification goes
        -- into metadata jsonb instead of the nonexistent column, matching
        -- resolve_fiscal_entity()'s and create_contact_with_role's convention.
        --
        -- FIX (20261101050000): ON CONFLICT (nif_hash, country_code) WHERE
        -- nif_hash IS NOT NULL — arbitrated by uq_fiscal_entities_nif_hash_country
        -- (20261029010000). Without this, updating a contact to a NIF that
        -- already exists on another fiscal_entities row (e.g. the same NIF now
        -- shared across two org contacts) hit "duplicate key value violates
        -- unique constraint" instead of linking to the existing row. Only
        -- arbitrates when p_nif_hash is supplied (partial index); callers still
        -- passing p_nif_hash = NULL keep the prior always-insert behavior
        -- unchanged.
        INSERT INTO public.fiscal_entities (nif, created_by, nif_encrypted, nif_hash, metadata)
        VALUES (p_vat,
                v_actor, p_nif_encrypted, p_nif_hash,
                jsonb_build_object('entity_type', CASE WHEN p_entity_type = 'organization' THEN 'company' ELSE 'individual' END))
        ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
          SET updated_at = now()
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
$function$;

-- 4) Policies de anew_contacts (texto vivo de pg_policies; só se acrescenta o OU pessoas.*)
ALTER POLICY anew_contacts_select ON public.anew_contacts
  USING ((has_anew_permission(auth.uid(), 'contacts.view'::text) OR has_anew_permission(auth.uid(), 'pessoas.view'::text))
         AND can_access_contact_row(organization_id, created_by, assigned_to, 'contacts.view'::text));

ALTER POLICY anew_contacts_insert ON public.anew_contacts
  WITH CHECK ((has_anew_permission(auth.uid(), 'contacts.create'::text) OR has_anew_permission(auth.uid(), 'pessoas.create'::text))
              AND (created_by = current_business_user_id())
              AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)));

ALTER POLICY anew_contacts_update ON public.anew_contacts
  USING ((has_anew_permission(auth.uid(), 'contacts.edit'::text) OR has_anew_permission(auth.uid(), 'pessoas.edit'::text))
         AND can_access_contact_row(organization_id, created_by, assigned_to, 'contacts.edit'::text))
  WITH CHECK ((has_anew_permission(auth.uid(), 'contacts.edit'::text) OR has_anew_permission(auth.uid(), 'pessoas.edit'::text))
              AND can_access_contact_row(organization_id, created_by, assigned_to, 'contacts.edit'::text));

ALTER POLICY anew_contacts_delete ON public.anew_contacts
  USING ((has_anew_permission(auth.uid(), 'contacts.delete'::text) OR has_anew_permission(auth.uid(), 'pessoas.delete'::text))
         AND can_access_contact_row(organization_id, created_by, assigned_to, 'contacts.delete'::text));

-- 5) Papéis: quem tem contacts.X e não tem pessoas.X recebe pessoas.X (idempotente). Os papéis de sistema ficam de fora (o gatilho
--    protect_system_role_permissions não deixa mexer-lhes; system_admin/super_admin já passam como administradores nas funções acima):
--    se algum não tiver o pessoas.X, sai um aviso (NOTICE) para se tratar à parte.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, m.pessoas
FROM public.anew_role_permissions rp
JOIN public.anew_roles r ON r.id = rp.role_id
JOIN (VALUES ('contacts.view', 'pessoas.view'), ('contacts.create', 'pessoas.create'),
             ('contacts.edit', 'pessoas.edit'), ('contacts.delete', 'pessoas.delete')) AS m(contacts, pessoas)
  ON m.contacts = rp.permission_code
WHERE r.is_system IS NOT TRUE
  AND EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = m.pessoas)
  AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions x WHERE x.role_id = rp.role_id AND x.permission_code = m.pessoas);

DO $aviso$
DECLARE v text;
BEGIN
  SELECT string_agg(DISTINCT r.code || ':' || m.pessoas, ', ') INTO v
  FROM public.anew_role_permissions rp
  JOIN public.anew_roles r ON r.id = rp.role_id AND r.is_system IS TRUE
  JOIN (VALUES ('contacts.view', 'pessoas.view'), ('contacts.create', 'pessoas.create'),
               ('contacts.edit', 'pessoas.edit'), ('contacts.delete', 'pessoas.delete')) AS m(contacts, pessoas)
    ON m.contacts = rp.permission_code
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_role_permissions x WHERE x.role_id = rp.role_id AND x.permission_code = m.pessoas);
  IF v IS NOT NULL THEN
    RAISE NOTICE '20270106710000: papéis de sistema com contacts.* sem o pessoas.* equivalente (não alterados): %', v;
  END IF;
END
$aviso$;

-- 6) Âmbitos: espelhar contacts.X → pessoas.X por membro, só quando o membro ainda não tem âmbito para pessoas.X
--    (se tiver vários níveis para contacts.X, fica o mais largo, como resolve_contact_access_context lê).
INSERT INTO public.anew_membership_permission_scopes (membership_id, permission_code, scope_level)
SELECT s.membership_id, m.pessoas,
       (ARRAY_AGG(s.scope_level ORDER BY CASE s.scope_level::text WHEN 'ORG' THEN 1 WHEN 'TEAM' THEN 2 ELSE 3 END))[1]
FROM public.anew_membership_permission_scopes s
JOIN (VALUES ('contacts.view', 'pessoas.view'), ('contacts.create', 'pessoas.create'),
             ('contacts.edit', 'pessoas.edit'), ('contacts.delete', 'pessoas.delete')) AS m(contacts, pessoas)
  ON m.contacts = s.permission_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.anew_membership_permission_scopes x
  WHERE x.membership_id = s.membership_id AND x.permission_code = m.pessoas
)
GROUP BY s.membership_id, m.pessoas;
