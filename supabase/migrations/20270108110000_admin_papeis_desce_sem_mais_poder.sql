-- ============================================================
-- 20270108110000_admin_papeis_desce_sem_mais_poder
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D: R1 (P1.1) nos papéis, R3 e R4 (P1.3).
-- R1: rpc_create_role / rpc_update_role / rpc_delete_role / rpc_restore_role pediam a permissão em qualquer organização + papel
--   visível: o administrador de uma filha (ou de uma organização sem ligação) criava, esvaziava e desativava papéis da mãe.
--   Agora: roles.create/edit/delete na organização do papel ou acima.
-- R3: com roles.edit/roles.delete esvaziava-se ou desativava-se um papel com permissões que quem age não tem (tirava poder a quem
--   está acima). Agora, para alterar, desativar ou restaurar um papel, quem age tem de ter TODAS as permissões dele (nesta
--   organização ou acima - fn_permissoes_que_nao_posso_dar, a regra de «atribuir papéis sem ganhar poder») e, se o papel assina
--   contratos, poder assinar (fn_posso_ligar_assinatura). O administrador de sistema e o super_admin passam, como antes.
--   As mesmas regras nas escritas diretas pela API: UPDATE em anew_roles e UPDATE/DELETE em anew_role_permissions pedem também
--   fn_papel_sem_mais_poder (função nova).
-- R4: DELETE direto em anew_roles apagava o papel de vez (sem soft delete) e deixava associações e permissões órfãs (não há FK).
--   A política anew_roles_delete sai: ninguém apaga papéis pela API (o ecrã desativa com rpc_delete_role; a app não faz DELETE).
-- Criar papéis (INSERT) não muda de regra: o gatilho fn_role_permissions_sem_escalada já impede dar o que não se tem.
-- CREATE OR REPLACE a partir do texto vivo (pg_get_functiondef na base RH a 5/11/2026, guardas md5); políticas a partir de
--   pg_policies vivas.
-- Reversão (só como migration nova): repor as 4 funções com o texto de 5/11/2026; repor as políticas (texto anterior nos
--   comentários abaixo); DROP FUNCTION public.fn_papel_sem_mais_poder(uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_create_role(text,text,text,boolean,uuid,text[])'::regprocedure)) <> '04a27e9c1d3609f3f9d38d1e64e5806d'
     OR md5(pg_get_functiondef('public.rpc_update_role(uuid,text,text,text,boolean,text[])'::regprocedure)) <> '4883761bf66bf142987dc2a4a9c2aa6e'
     OR md5(pg_get_functiondef('public.rpc_delete_role(uuid)'::regprocedure)) <> '841e0e21034fafb26fceb1dedbd00a03'
     OR md5(pg_get_functiondef('public.rpc_restore_role(uuid)'::regprocedure)) <> '41872a4dfd6512d549b3470507d1de82' THEN
    RAISE EXCEPTION 'GUARDA: uma das funções mudou desde a leitura (5/11/2026)';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_papel_sem_mais_poder(p_role uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r       public.anew_roles;
  v_perms text[];
BEGIN
  -- 20270108110000: verdadeiro se quem age (a sessão) pode mexer neste papel sem tirar poder a quem está acima: o administrador
  --   de sistema; ou, num papel de organização (não de sistema), quem tem todas as permissões dele nesta organização ou acima
  --   e, se o papel assina contratos, pode assinar. A permissão da ação (roles.edit, ...) verifica-se à parte.
  IF auth.uid() IS NULL OR p_role IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_system_admin(auth.uid()) THEN
    RETURN true;
  END IF;
  SELECT * INTO r FROM public.anew_roles WHERE id = p_role;
  IF NOT FOUND OR r.organization_id IS NULL OR r.is_system IS TRUE THEN
    RETURN false;
  END IF;
  SELECT COALESCE(array_agg(rp.permission_code), ARRAY[]::text[]) INTO v_perms
  FROM public.anew_role_permissions rp WHERE rp.role_id = p_role;
  IF COALESCE(array_length(public.fn_permissoes_que_nao_posso_dar(r.organization_id, v_perms), 1), 0) > 0 THEN
    RETURN false;
  END IF;
  IF r.can_sign_contracts IS TRUE AND NOT public.fn_posso_ligar_assinatura(r.organization_id) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_papel_sem_mais_poder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_papel_sem_mais_poder(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_create_role(p_code text, p_name text, p_description text, p_can_sign_contracts boolean, p_organization_id uuid, p_permissions text[])
 RETURNS anew_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_role       public.anew_roles;
  v_perm       text;
  v_audit_org  uuid;
  v_diff       jsonb;
  v_negadas    text[];
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== createdBy in the frontend) ────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_roles_insert RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- organization_id must be one of the caller's visible orgs (matches
  -- "organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))").
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270108110000: roles.create nesta organização ou acima (já não se criam papéis na mãe nem noutra organização).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.create', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar papéis nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Sem escalada: só se dá o que se tem (20270102110000) ──────────────────
  v_negadas := public.fn_permissoes_que_nao_posso_dar(p_organization_id, p_permissions);
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Não pode atribuir permissões que não tem: %', array_to_string(v_negadas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(p_can_sign_contracts, false) AND NOT public.fn_posso_ligar_assinatura(p_organization_id) THEN
    RAISE EXCEPTION 'Só quem pode assinar contratos pode criar um papel que assina contratos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the role (identical column set to createMutation) ─────────────
  INSERT INTO public.anew_roles
    (code, name, description, can_sign_contracts, organization_id, created_by)
  VALUES
    (p_code,
     p_name,
     nullif(p_description, ''),
     COALESCE(p_can_sign_contracts, false),
     p_organization_id,
     v_actor)
  RETURNING * INTO v_role;

  -- ── INSERT permissions (only when the list is non-empty, like the FE) ────
  IF p_permissions IS NOT NULL AND array_length(p_permissions, 1) > 0 THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
      VALUES (v_role.id, v_perm, v_actor);
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot for the created row + granted perms
  v_diff := jsonb_build_object(
    'anew_roles', jsonb_build_object(
      'code',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.code)),
      'name',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.name)),
      'description',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.description)),
      'can_sign_contracts', jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.can_sign_contracts)),
      'organization_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.organization_id))
    ),
    'anew_role_permissions', jsonb_build_object(
      'permission_code', jsonb_build_object(
        'old', NULL,
        'new', to_jsonb(COALESCE(p_permissions, ARRAY[]::text[]))
      )
    )
  );

  -- Route system/global roles under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_role.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', v_role.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_role(p_id uuid, p_code text, p_name text, p_description text, p_can_sign_contracts boolean, p_permissions text[])
 RETURNS anew_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor       uuid;
  v_before      public.anew_roles;
  v_role        public.anew_roles;
  v_perm        text;
  v_audit_org   uuid;
  v_old_perms   text[];
  v_new_perms   text[];
  v_diff        jsonb;
  v_role_diff   jsonb;
  v_negadas     text[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + guards) ────────────
  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── System-role guard (mirrors the FE isSystem check; the BEFORE trigger
  --    protect_system_roles() would also block, but we fail clean & early) ──
  IF v_before.is_system = true THEN
    RAISE EXCEPTION 'Roles de sistema não são editáveis' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization parity with anew_roles_update RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270108110000: roles.edit na organização do papel ou acima, e o papel não pode ter mais poder do que quem age (todas as
  --   permissões dele têm de ser de quem age nesta organização ou acima; se assina contratos, quem age também tem de poder).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar papéis desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_negadas := public.fn_permissoes_que_nao_posso_dar(
                 v_before.organization_id,
                 ARRAY(SELECT rp.permission_code FROM public.anew_role_permissions rp WHERE rp.role_id = p_id));
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Não pode alterar um papel com permissões que não tem: %', array_to_string(v_negadas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.can_sign_contracts IS TRUE AND NOT public.fn_posso_ligar_assinatura(v_before.organization_id) THEN
    RAISE EXCEPTION 'Só quem pode assinar contratos pode alterar um papel que assina contratos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Snapshot old permissions before the delete/insert rewrite ────────────
  SELECT COALESCE(array_agg(permission_code ORDER BY permission_code), ARRAY[]::text[])
  INTO   v_old_perms
  FROM   public.anew_role_permissions
  WHERE  role_id = p_id;

  -- ── Sem escalada (20270102110000): só as permissões ACRESCENTADAS têm de
  --    ser de quem edita; ligar can_sign_contracts exige poder assinar. ─────
  v_negadas := public.fn_permissoes_que_nao_posso_dar(
                 v_before.organization_id,
                 ARRAY(SELECT unnest(COALESCE(p_permissions, ARRAY[]::text[]))
                       EXCEPT SELECT unnest(v_old_perms)));
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Não pode atribuir permissões que não tem: %', array_to_string(v_negadas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(p_can_sign_contracts, false) AND v_before.can_sign_contracts IS NOT TRUE
     AND NOT public.fn_posso_ligar_assinatura(v_before.organization_id) THEN
    RAISE EXCEPTION 'Só quem pode assinar contratos pode dar a um papel o poder de assinar contratos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the role (identical column set to updateMutation) ─────────────
  UPDATE public.anew_roles
  SET code               = p_code,
      name               = p_name,
      description        = nullif(p_description, ''),
      can_sign_contracts = COALESCE(p_can_sign_contracts, false)
  WHERE id = p_id
  RETURNING * INTO v_role;

  -- ── Rewrite permissions: delete all, then re-insert (matches the FE) ─────
  DELETE FROM public.anew_role_permissions WHERE role_id = p_id;

  IF p_permissions IS NOT NULL AND array_length(p_permissions, 1) > 0 THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
      VALUES (p_id, v_perm, v_actor);
    END LOOP;
  END IF;

  v_new_perms := COALESCE(p_permissions, ARRAY[]::text[]);

  -- ── Build the combined diff across both tables ───────────────────────────
  v_role_diff := '{}'::jsonb;
  IF v_before.code IS DISTINCT FROM v_role.code THEN
    v_role_diff := v_role_diff || jsonb_build_object('code',
      jsonb_build_object('old', to_jsonb(v_before.code), 'new', to_jsonb(v_role.code)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_role.name THEN
    v_role_diff := v_role_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_role.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_role.description THEN
    v_role_diff := v_role_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_role.description)));
  END IF;
  IF v_before.can_sign_contracts IS DISTINCT FROM v_role.can_sign_contracts THEN
    v_role_diff := v_role_diff || jsonb_build_object('can_sign_contracts',
      jsonb_build_object('old', to_jsonb(v_before.can_sign_contracts), 'new', to_jsonb(v_role.can_sign_contracts)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_role_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_roles', v_role_diff);
  END IF;

  -- Only record a permissions change when the set actually changed (order-insensitive).
  IF EXISTS (SELECT unnest(v_old_perms) EXCEPT SELECT unnest(v_new_perms))
     OR EXISTS (SELECT unnest(v_new_perms) EXCEPT SELECT unnest(v_old_perms)) THEN
    v_diff := v_diff || jsonb_build_object(
      'anew_role_permissions', jsonb_build_object(
        'permission_code', jsonb_build_object(
          'old', to_jsonb(v_old_perms),
          'new', to_jsonb(v_new_perms)
        )
      )
    );
  END IF;

  v_audit_org := COALESCE(v_role.organization_id, k_system_sentinel);

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behavior of the triggers.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_roles', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_role(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.anew_roles;
  v_audit_org  uuid;
  v_diff       jsonb;
  v_negadas    text[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── System-role guard (mirrors canDeleteRole !is_system + BEFORE trigger) ─
  IF v_before.is_system = true THEN
    RAISE EXCEPTION 'Roles de sistema não podem ser eliminadas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization parity with anew_roles_delete RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270108110000: roles.delete na organização do papel ou acima, e o papel não pode ter mais poder do que quem age (todas as
  --   permissões dele têm de ser de quem age nesta organização ou acima; se assina contratos, quem age também tem de poder).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para desativar papéis desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_negadas := public.fn_permissoes_que_nao_posso_dar(
                 v_before.organization_id,
                 ARRAY(SELECT rp.permission_code FROM public.anew_role_permissions rp WHERE rp.role_id = p_id));
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Não pode desativar um papel com permissões que não tem: %', array_to_string(v_negadas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.can_sign_contracts IS TRUE AND NOT public.fn_posso_ligar_assinatura(v_before.organization_id) THEN
    RAISE EXCEPTION 'Só quem pode assinar contratos pode desativar um papel que assina contratos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency guard: nothing to do (and nothing new to audit) if the role
  -- is already deactivated.
  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Role já está inativa' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Soft-deactivate: anew_role_permissions is left completely untouched,
  --    so the exact permission set survives for a future restore. ───────────
  UPDATE public.anew_roles
  SET status = 'inactive', deleted_at = now(), updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('inactive'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_role(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.anew_roles;
  v_audit_org  uuid;
  v_diff       jsonb;
  v_negadas    text[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Reuses `roles.delete`: restoring is the direct inverse of deactivating,
  -- reachable only from the same admin surface — see migration header note.
  IF NOT public.has_anew_permission(auth.uid(), 'roles.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270108110000: roles.delete na organização do papel ou acima, e o papel não pode ter mais poder do que quem age (todas as
  --   permissões dele têm de ser de quem age nesta organização ou acima; se assina contratos, quem age também tem de poder).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar papéis desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_negadas := public.fn_permissoes_que_nao_posso_dar(
                 v_before.organization_id,
                 ARRAY(SELECT rp.permission_code FROM public.anew_role_permissions rp WHERE rp.role_id = p_id));
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Não pode restaurar um papel com permissões que não tem: %', array_to_string(v_negadas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.can_sign_contracts IS TRUE AND NOT public.fn_posso_ligar_assinatura(v_before.organization_id) THEN
    RAISE EXCEPTION 'Só quem pode assinar contratos pode restaurar um papel que assina contratos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Role já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.anew_roles
  SET status = 'active', deleted_at = NULL, updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('active'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
  );
END;
$function$;

-- ── anew_roles ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes (DELETE): organization_id IN visíveis AND has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.delete', organization_id).
DROP POLICY IF EXISTS anew_roles_delete ON public.anew_roles;
-- Antes (UPDATE): USING e WITH CHECK = organization_id IN visíveis AND has_anew_permission_in_org_or_ancestor(.., 'roles.edit', organization_id).
DROP POLICY IF EXISTS anew_roles_update ON public.anew_roles;
CREATE POLICY anew_roles_update ON public.anew_roles FOR UPDATE TO authenticated
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', organization_id)
         AND public.fn_papel_sem_mais_poder(id))
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
              AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', organization_id));

-- ── anew_role_permissions ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes (UPDATE/DELETE USING): EXISTS papel r com r.organization_id IN visíveis AND
--   has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id). WITH CHECK do UPDATE igual ao INSERT.
DROP POLICY IF EXISTS anew_role_permissions_update ON public.anew_role_permissions;
CREATE POLICY anew_role_permissions_update ON public.anew_role_permissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.anew_roles r
                 WHERE r.id = anew_role_permissions.role_id
                   AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                   AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id))
         AND public.fn_papel_sem_mais_poder(role_id))
  WITH CHECK ((created_by = public.current_business_user_id())
              AND EXISTS (SELECT 1 FROM public.anew_roles r
                          WHERE r.id = anew_role_permissions.role_id
                            AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                            AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id)));
DROP POLICY IF EXISTS anew_role_permissions_delete ON public.anew_role_permissions;
CREATE POLICY anew_role_permissions_delete ON public.anew_role_permissions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.anew_roles r
                 WHERE r.id = anew_role_permissions.role_id
                   AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                   AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id))
         AND public.fn_papel_sem_mais_poder(role_id));
