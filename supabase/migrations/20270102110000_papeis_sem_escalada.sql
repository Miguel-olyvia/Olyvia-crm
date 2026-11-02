-- ============================================================
-- 20270102110000_papeis_sem_escalada
-- ============================================================
-- O que faz
--   Impede a escalada de privilégios pelos papéis (anew_roles /
--   anew_role_permissions):
--   1. fn_sou_admin_global(): quem chama tem membership ativa no papel de
--      sistema global super_admin ou system_admin (estes não têm limite).
--   2. fn_permissoes_que_nao_posso_dar(org, perms[]): das permissões pedidas,
--      as que quem chama NÃO tem (membership ativa, não-cliente) na
--      organização do papel ou numa ascendente (anew_hierarchy). Vazio para
--      admins globais.
--   3. fn_posso_ligar_assinatura(org): quem chama é admin global ou tem um
--      papel com can_sign_contracts na org (ou ascendente)
--      (fn_pode_assinar_contratos, de 20270102100000).
--   4. rpc_create_role / rpc_update_role (partindo das versões VIVAS, só se
--      acrescenta a verificação antes de escrever):
--        create: todas as permissões pedidas têm de ser "dáveis";
--                can_sign_contracts = true exige fn_posso_ligar_assinatura.
--        update: só as permissões ACRESCENTADAS (as que o papel ainda não
--                tinha) têm de ser dáveis -- quem edita pode manter ou tirar
--                permissões que não tem; ligar can_sign_contracts (false ->
--                true) exige fn_posso_ligar_assinatura.
--   5. Escrita direta pelas policies (anew_roles_insert/update e
--      anew_role_permissions_insert/update deixam authenticated escrever com
--      roles.create/roles.edit): triggers BEFORE que aplicam a mesma regra
--      quando current_user é authenticated/anon. Funções SECURITY DEFINER
--      (as RPCs acima, create_initial_organization, bootstrap_org_creator)
--      correm como o dono e não são afetadas.
--
-- Outras funções que escrevem papéis/permissões (lidas na base):
--   bootstrap_org_creator (só service_role), create_initial_organization
--   (cria a primeira org do próprio utilizador: papéis base com tudo -- é o
--   arranque da organização, fica como está), rpc_delete_role /
--   rpc_restore_role (não dão permissões), create_company_base_roles e
--   clone_template_roles_for_company (fecham-se em 20270102120000).
--
-- Sem tabelas nem colunas novas.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Admin global ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sou_admin_global()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.anew_users u
    JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active'
    JOIN public.anew_roles r ON r.id = m.role_id
    WHERE u.auth_user_id = auth.uid()
      AND u.deleted_at IS NULL
      AND r.code IN ('super_admin', 'system_admin')
      AND r.is_system = true
      AND r.organization_id IS NULL
      AND r.deleted_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.fn_sou_admin_global() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sou_admin_global() TO authenticated;

-- 2. Permissões que quem chama não pode dar ----------------------------------
CREATE OR REPLACE FUNCTION public.fn_permissoes_que_nao_posso_dar(p_org uuid, p_perms text[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE orgs(org) AS (
    SELECT p_org
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN orgs o ON h.child_org_id = o.org
  ),
  minhas AS (
    SELECT DISTINCT rp.permission_code
    FROM public.anew_users u
    JOIN public.anew_memberships m
      ON m.user_id = u.id
     AND m.status = 'active'
     AND m.role_is_client IS NOT TRUE
    JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id
    WHERE u.auth_user_id = auth.uid()
      AND u.deleted_at IS NULL
      AND m.organization_id IN (SELECT org FROM orgs WHERE org IS NOT NULL)
  )
  SELECT CASE
           WHEN public.fn_sou_admin_global() THEN ARRAY[]::text[]
           ELSE COALESCE(
                  (SELECT array_agg(DISTINCT p ORDER BY p)
                   FROM unnest(COALESCE(p_perms, ARRAY[]::text[])) AS p
                   WHERE p IS NOT NULL
                     AND p NOT IN (SELECT permission_code FROM minhas)),
                  ARRAY[]::text[])
         END
$$;

REVOKE ALL ON FUNCTION public.fn_permissoes_que_nao_posso_dar(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_que_nao_posso_dar(uuid, text[]) TO authenticated;

-- 3. Pode ligar can_sign_contracts --------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_posso_ligar_assinatura(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_sou_admin_global()
      OR public.fn_pode_assinar_contratos(
           (SELECT u.id FROM public.anew_users u
            WHERE u.auth_user_id = auth.uid() AND u.deleted_at IS NULL
            LIMIT 1),
           p_org)
$$;

REVOKE ALL ON FUNCTION public.fn_posso_ligar_assinatura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_posso_ligar_assinatura(uuid) TO authenticated;

-- 4a. rpc_create_role (versão viva + verificação de escalada) -----------------
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

-- 4b. rpc_update_role (versão viva + verificação de escalada) -----------------
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

-- 5a. Escrita direta em anew_role_permissions --------------------------------
-- SECURITY INVOKER: current_user distingue o PostgREST (authenticated) de uma
-- função SECURITY DEFINER (dono).
CREATE OR REPLACE FUNCTION public.fn_role_permissions_sem_escalada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org     uuid;
  v_negadas text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.permission_code IS NOT DISTINCT FROM OLD.permission_code
     AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN
    RETURN NEW;
  END IF;
  SELECT r.organization_id INTO v_org FROM public.anew_roles r WHERE r.id = NEW.role_id;
  v_negadas := public.fn_permissoes_que_nao_posso_dar(v_org, ARRAY[NEW.permission_code]);
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Não pode atribuir permissões que não tem: %', array_to_string(v_negadas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_role_permissions_sem_escalada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_role_permissions_sem_escalada ON public.anew_role_permissions;
CREATE TRIGGER trg_role_permissions_sem_escalada
  BEFORE INSERT OR UPDATE ON public.anew_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_role_permissions_sem_escalada();

-- 5b. Escrita direta de can_sign_contracts em anew_roles ----------------------
CREATE OR REPLACE FUNCTION public.fn_roles_assinatura_sem_escalada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.can_sign_contracts IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.can_sign_contracts IS NOT TRUE)
     AND NOT public.fn_posso_ligar_assinatura(NEW.organization_id) THEN
    RAISE EXCEPTION 'Só quem pode assinar contratos pode dar a um papel o poder de assinar contratos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_roles_assinatura_sem_escalada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_roles_assinatura_sem_escalada ON public.anew_roles;
CREATE TRIGGER trg_roles_assinatura_sem_escalada
  BEFORE INSERT OR UPDATE ON public.anew_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_roles_assinatura_sem_escalada();

COMMIT;
