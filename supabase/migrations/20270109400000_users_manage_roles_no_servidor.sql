-- 20270109400000 — users.manage_roles passa a ter uso real no servidor.
-- Antes: o ecrã escondia o seletor de papel sem users.manage_roles, mas o servidor deixava mudar o papel só com users.edit
-- (auditoria 05/11, grupo D, T2#52). Agora, além das regras do Lote D (organização ou acima, nunca mais poder do que o seu):
--   · rpc_update_user: mudar o papel de uma associação, dar uma associação nova a quem já existe e retirar uma associação ativa
--     pedem também users.manage_roles na organização (ou acima);
--   · escrita direta em anew_memberships (gatilho tg_anew_memberships_sem_escalada): mudar role_id pede users.manage_roles.
-- Criar utilizadores (create-user, users.create) e acrescentar/remover membros pelos ecrãs da organização ficam como estão.
-- Antes de restringir: users.manage_roles a todos os papéis que hoje atribuem papéis (têm users.edit ou users.create).
-- Partiu de pg_get_functiondef das versões vivas (md5 confirmado abaixo).

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_update_user'::regproc)) <> '4079170cc1ce97709e9787d3efbc122b' THEN
    RAISE EXCEPTION 'rpc_update_user mudou desde a leitura - parar e reler';
  END IF;
  IF md5(pg_get_functiondef('public.tg_anew_memberships_sem_escalada'::regproc)) <> 'bfd832d56243855728f18c8c8bfa8ec3' THEN
    RAISE EXCEPTION 'tg_anew_memberships_sem_escalada mudou desde a leitura - parar e reler';
  END IF;
END
$guard$;

-- Ninguém perde acesso: quem hoje atribui papéis recebe users.manage_roles.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, 'users.manage_roles'
FROM public.anew_role_permissions rp
WHERE rp.permission_code IN ('users.edit', 'users.create')
  AND NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions x
    WHERE x.role_id = rp.role_id AND x.permission_code = 'users.manage_roles'
  );

CREATE OR REPLACE FUNCTION public.rpc_update_user(p_user_id uuid, p_entity_id uuid, p_name text, p_email text, p_phone text, p_status text, p_description text, p_position text, p_location text, p_template_id uuid, p_custom_attributes jsonb, p_emails jsonb, p_phones jsonb, p_memberships jsonb, p_existing_membership_ids uuid[], p_pending_scopes jsonb, p_addresses jsonb, p_fiscal jsonb, p_nif_encrypted text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_nif_tokens text[] DEFAULT NULL::text[])
 RETURNS anew_users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_before_user      public.anew_users;
  v_user             public.anew_users;
  v_effective_entity uuid;
  v_entity_before    jsonb;

  v_can_edit_self    boolean;
  v_target_is_self   boolean;
  v_has_edit_perm    boolean;
  v_has_create_perm  boolean;
  v_has_delete_perm  boolean;
  v_target_in_scope  boolean;
  v_visible_orgs     uuid[];
  v_is_system_admin  boolean;

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
  v_motivo           text;   -- 20270106310000
  v_old_m            record; -- 20270106310000
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

  -- SECURITY FIX (20261112080000): System Admin gets full cross-tenant reach
  -- here specifically — get_user_visible_org_ids() is membership-based only
  -- by design (20260622150000) and has no system_admin bypass, so without
  -- this a System Admin with no personal membership in the target user's
  -- organization was wrongly blocked below with "insufficient_privilege".
  v_is_system_admin := public.is_system_admin(auth.uid());
  IF v_is_system_admin THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO   v_visible_orgs
    FROM   public.anew_organizations;
  END IF;

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
    -- 20270106310000: só se gere a ficha de quem se consegue gerir - users.edit na organização de cada associação
    -- (ou acima dela) e nenhuma associação com um papel que quem edita não poderia atribuir (mais poder do que o seu).
    IF NOT public.fn_pode_gerir_utilizador_por(auth.uid(), p_user_id, 'users.edit') THEN
      RAISE EXCEPTION 'Sem permissão para gerir este utilizador (tem um papel com mais poder ou está numa organização que não administra)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Ninguém se promove a si próprio (20261118010000) ─────────────────
  -- Editar a própria ficha é sempre permitido (portão acima). Mudar o próprio
  -- cargo, ambitos, ligações a organizações ou estado nunca é -- nem para um
  -- administrador. Quem precisa de mudar de cargo pede a outro administrador.
  v_target_is_self := v_can_edit_self
                      OR (p_user_id = ANY(public.anew_current_user_ids()));

  IF v_target_is_self THEN
    IF COALESCE(p_status, '') IS DISTINCT FROM COALESCE(v_before_user.status, '') THEN
      RAISE EXCEPTION 'Não pode alterar o seu próprio estado'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_pending_scopes IS NOT NULL
       AND jsonb_typeof(p_pending_scopes) = 'object'
       AND p_pending_scopes <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Não pode alterar os seus próprios âmbitos de permissão'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Qualquer associação enviada que não seja exactamente igual à que já está
    -- gravada (cargo, organização, tipo) -- ou que seja nova -- é recusada.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb)) AS m
      WHERE NULLIF(m ->> 'organization_id', '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.anew_memberships am
          WHERE am.id = NULLIF(m ->> 'id', '')::uuid
            AND am.user_id = p_user_id
            AND am.organization_id = (m ->> 'organization_id')::uuid
            AND am.role_id IS NOT DISTINCT FROM NULLIF(m ->> 'role_id', '')::uuid
            AND am.relationship_type IS NOT DISTINCT FROM NULLIF(m ->> 'relationship_type', '')
        )
    ) THEN
      RAISE EXCEPTION 'Não pode alterar o seu próprio cargo nem as suas organizações'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Nada de escritas de poder no caminho da própria ficha. Assim quem só tem
    -- users.view grava os seus dados pessoais sem bater nos portões de
    -- users.edit/create/delete mais abaixo, e a lista do ecrã -- que só traz as
    -- associações activas -- nunca apaga por engano as inactivas.
    p_status                  := v_before_user.status;
    p_memberships             := '[]'::jsonb;
    p_existing_membership_ids := ARRAY[]::uuid[];
    p_pending_scopes          := NULL;
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

    -- 20270106310000: remover pede users.delete na organização da associação ou acima (não basta tê-la noutra).
    IF EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.id = ANY(v_to_delete)
        AND m.user_id = p_user_id
        AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.delete', m.organization_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para remover associações nesta organização'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 20270109400000: retirar um papel (remover uma associação ATIVA) pede também users.manage_roles na organização da
    -- associação ou acima. As inativas já não dão poder: removê-las continua só com users.delete.
    IF EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.id = ANY(v_to_delete)
        AND m.user_id = p_user_id
        AND m.status = 'active'
        AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', m.organization_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para retirar papéis nesta organização (falta users.manage_roles)'
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

      -- 20270106310000: editar pede users.edit na organização (antiga e nova) ou acima; mudar o papel, a organização
      -- ou reativar só com um papel que quem edita pode atribuir (nunca mais permissões do que as suas).
      SELECT m.organization_id, m.role_id, m.status INTO v_old_m
      FROM public.anew_memberships m WHERE m.id = v_membership_id AND m.user_id = p_user_id;
      IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.edit', v_old_m.organization_id)
         OR NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.edit', v_membership_org) THEN
        RAISE EXCEPTION 'Sem permissão para editar associações nesta organização'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_old_m.role_id IS DISTINCT FROM NULLIF(v_membership ->> 'role_id', '')::uuid
         OR v_old_m.organization_id IS DISTINCT FROM v_membership_org
         OR v_old_m.status IS DISTINCT FROM 'active' THEN
        v_motivo := public.fn_motivo_papel_nao_atribuivel(auth.uid(), v_membership_org, NULLIF(v_membership ->> 'role_id', '')::uuid);
        IF v_motivo IS NOT NULL THEN
          RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      -- 20270109400000: mudar o papel pede também users.manage_roles na organização antiga e na nova (ou acima).
      IF v_old_m.role_id IS DISTINCT FROM NULLIF(v_membership ->> 'role_id', '')::uuid
         AND NOT (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', v_old_m.organization_id)
                  AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', v_membership_org)) THEN
        RAISE EXCEPTION 'Sem permissão para mudar o papel nesta organização (falta users.manage_roles)'
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

      -- 20270106310000: criar pede users.create na organização ou acima e um papel que quem cria pode atribuir.
      IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.create', v_membership_org) THEN
        RAISE EXCEPTION 'Sem permissão para criar associações nesta organização'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- 20270109400000: dar um papel numa nova associação a quem já existe pede também users.manage_roles.
      IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', v_membership_org) THEN
        RAISE EXCEPTION 'Sem permissão para atribuir papéis nesta organização (falta users.manage_roles)'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_motivo := public.fn_motivo_papel_nao_atribuivel(auth.uid(), v_membership_org, NULLIF(v_membership ->> 'role_id', '')::uuid);
      IF v_motivo IS NOT NULL THEN
        RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'insufficient_privilege';
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
$function$;

CREATE OR REPLACE FUNCTION public.tg_anew_memberships_sem_escalada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_motivo text;
BEGIN
  -- 20270106310000: INVOKER de propósito - current_user diz se é escrita direta pela API. RPCs DEFINER (rpc_update_user,
  -- bootstrap_org_creator, rpc_finalize_user_profile_full) e a service_role validam do seu lado.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NOT (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária para atribuir papéis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF public.is_system_admin_user(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = ANY (public.anew_current_user_ids())
     AND (TG_OP = 'UPDATE' OR NOT public.fn_sou_membro_de_ascendente(NEW.organization_id)) THEN
    RAISE EXCEPTION 'Não pode atribuir um papel a si próprio' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270109400000: mudar o papel de uma associação (escrita direta pela API) pede também users.manage_roles na
  -- organização antiga e na nova (ou acima). Inserir/apagar associações continua com users.create/users.delete.
  IF TG_OP = 'UPDATE' AND NEW.role_id IS DISTINCT FROM OLD.role_id
     AND NOT (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', OLD.organization_id)
              AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', NEW.organization_id)) THEN
    RAISE EXCEPTION 'Sem permissão para mudar o papel nesta organização (falta users.manage_roles)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_motivo := public.fn_motivo_papel_nao_atribuivel_eu(NEW.organization_id, NEW.role_id);
  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;
