-- ============================================================
-- 20270112400000 — criar_acesso_conta_existente_sem_reescrever_perfil
-- ============================================================
-- O que faz (auditoria RH F4): quando o e-mail da ficha já tem conta com perfil (anew_users), a edge function
--   criar-acesso-pessoa chamava rpc_finalize_user_profile_full, cujo ON CONFLICT DO UPDATE reescrevia o perfil GLOBAL
--   (name, email, phone, description, position, location, template_id, custom_attributes, status) com o nome da ficha e
--   nulos — o perfil de alguém que pode ser de outra organização.
--   Cria public.rpc_hr_associar_conta_existente: só garante a associação (organização + papel) e a ligação da entidade à
--   organização. Nunca toca no anew_users, na entidade, nos e-mails/telefones, nem no estado da conta.
--
-- Verificações (as de rpc_finalize_user_profile_full, pela mesma ordem, mais a de A5):
--   · ator obrigatório e com users.create (has_anew_permission, como a finalize);
--   · a conta alvo tem de ter perfil ativo e não apagado (senão: conta_existente_inativa — a finalize reativava-a);
--   · a organização tem de ser visível ao ator (get_user_visible_org_ids);
--   · papel super_admin/system_admin recusado sempre (a regra PAPEIS_PROIBIDOS da edge function, aqui também no servidor);
--   · se o ator não é administrador de sistema (is_system_admin): papel nunca system_admin/org_admin, nunca a si próprio,
--     users.create na organização ou acima, fn_motivo_papel_nao_atribuivel (papel atribuível e contido nas permissões do
--     ator) e — porque a conta JÁ existe, isto é dar um papel a um utilizador existente — users.manage_roles na
--     organização ou acima (mesma regra do INSERT direto em 20270112130000 e de rpc_update_user). O papel de cliente do
--     portal (role_is_client, code = 'client') fica isento de manage_roles, como no gatilho.
-- Associação: mesma semântica da finalize (salta se já há uma ativa com o mesmo papel; senão INSERT ... ON CONFLICT DO
--   NOTHING com join_method 'admin_created'); ligação da entidade à organização idempotente, primária só se a entidade
--   não tiver nenhuma (não muda a primária de quem já a tem). Uma linha de auditoria, como a finalize.
-- Só service_role (como rpc_finalize_user_profile_full e rpc_hr_ligar_conta_por_servico).
-- Função nova: sem guarda md5 (não substitui nada). Reversão: DROP FUNCTION public.rpc_hr_associar_conta_existente(uuid,uuid,uuid,uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF to_regprocedure('public.rpc_hr_associar_conta_existente(uuid,uuid,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_associar_conta_existente já existe. Rever esta migration.';
  END IF;
END $do$;

CREATE FUNCTION public.rpc_hr_associar_conta_existente(
  p_auth_user_id    uuid,
  p_actor_id        uuid,
  p_organization_id uuid,
  p_role_id         uuid
)
 RETURNS anew_users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user              public.anew_users;
  v_actor_auth_uid    uuid;
  v_actor_is_sysadmin boolean;
  v_visible_orgs      uuid[];
  v_role_code         text;
  v_role_is_client    boolean;
  v_motivo            text;
  v_existing_member   uuid;
  v_membership_id     uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_auth_user_id IS NULL OR p_organization_id IS NULL OR p_role_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id, organization_id e role_id são obrigatórios' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT au.auth_user_id INTO v_actor_auth_uid
  FROM public.anew_users au
  WHERE au.id = p_actor_id;

  -- Igual a rpc_finalize_user_profile_full.
  IF v_actor_auth_uid IS NULL OR NOT public.has_anew_permission(v_actor_auth_uid, 'users.create') THEN
    RAISE EXCEPTION 'Actor não tem permissão para criar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A conta alvo: tem de ter perfil (o ramo sem perfil continua na finalize). Bloqueia-se a linha para a associação
  -- não correr em paralelo com outra alteração, mas nada nela é escrito.
  SELECT * INTO v_user
  FROM public.anew_users
  WHERE auth_user_id = p_auth_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conta_existente_sem_perfil' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_user.deleted_at IS NOT NULL OR v_user.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'conta_existente_inativa' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT COALESCE(array_agg(o), ARRAY[]::uuid[])
  INTO   v_visible_orgs
  FROM   public.get_user_visible_org_ids(v_actor_auth_uid) AS o;

  IF NOT (p_organization_id = ANY(v_visible_orgs)) THEN
    RAISE EXCEPTION 'Associação fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT ar.code INTO v_role_code
  FROM public.anew_roles ar
  WHERE ar.id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'papel_nao_encontrado' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_role_is_client := COALESCE(v_role_code = 'client', false);  -- como tg_anew_memberships_set_role_is_client
  -- Como a edge function (PAPEIS_PROIBIDOS): esta via nunca dá papéis de administração da plataforma, seja quem for o ator.
  IF v_role_code IN ('super_admin', 'system_admin') THEN
    RAISE EXCEPTION 'papel_nao_permitido' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor_is_sysadmin := public.is_system_admin(v_actor_auth_uid);

  IF NOT v_actor_is_sysadmin THEN
    IF v_role_code IN ('system_admin', 'org_admin') THEN
      RAISE EXCEPTION 'Sem permissão para atribuir este perfil' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_auth_user_id = v_actor_auth_uid THEN
      RAISE EXCEPTION 'Não pode atribuir papéis a si próprio' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor_auth_uid, 'users.create', p_organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para criar utilizadores nesta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- A conta já existe: dar-lhe um papel interno é gerir papéis (20270112130000 / rpc_update_user).
    IF v_role_is_client IS NOT TRUE
       AND NOT public.has_anew_permission_in_org_or_ancestor(v_actor_auth_uid, 'users.manage_roles', p_organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para atribuir papéis nesta organização (falta users.manage_roles)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_motivo := public.fn_motivo_papel_nao_atribuivel(v_actor_auth_uid, p_organization_id, p_role_id);
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  -- Associação: mesma semântica de rpc_finalize_user_profile_full (passo 3).
  SELECT id INTO v_existing_member
  FROM public.anew_memberships
  WHERE user_id = v_user.id
    AND organization_id = p_organization_id
    AND role_id = p_role_id
    AND status = 'active'
  LIMIT 1;

  IF v_existing_member IS NULL THEN
    INSERT INTO public.anew_memberships (
      user_id, organization_id, role_id, status, relationship_type, join_method, created_by
    )
    VALUES (
      v_user.id, p_organization_id, p_role_id, 'active', 'member', 'admin_created', p_actor_id
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_membership_id;
  END IF;

  -- Ligação da entidade à organização (idempotente). Primária só se a entidade ainda não tiver nenhuma ligação.
  IF v_user.entity_id IS NOT NULL THEN
    INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary)
    SELECT v_user.entity_id, p_organization_id,
           NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links l WHERE l.entity_id = v_user.entity_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.anew_entity_org_links
      WHERE entity_id = v_user.entity_id
        AND organization_id = p_organization_id
    );
  END IF;

  IF v_membership_id IS NOT NULL THEN
    PERFORM set_config('app.audit_user_id', p_actor_id::text, true);
    PERFORM public.fn_manual_audit_log(
      'anew_users', v_user.id, p_organization_id, 'UPDATE',
      jsonb_build_object('anew_memberships', jsonb_build_object(
        p_organization_id::text, jsonb_build_object('old', NULL, 'new', p_role_id::text))),
      'web_app'
    );
  END IF;

  RETURN v_user;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_hr_associar_conta_existente(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_associar_conta_existente(uuid, uuid, uuid, uuid) TO service_role;
