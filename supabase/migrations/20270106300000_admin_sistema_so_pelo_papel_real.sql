-- ============================================================
-- 20270106300000_admin_sistema_so_pelo_papel_real
-- ============================================================
-- Lote D / D1 (crítico). O "administrador de sistema" era reconhecido só pelo CÓDIGO do papel (ar.code = 'system_admin'), e
--   anew_roles não tinha nenhuma regra sobre o código. Um administrador de uma organização (roles.create + users.edit) criava um
--   papel da sua organização com o código 'system_admin', atribuía-o a outra conta e essa conta passava a administradora da
--   plataforma (is_system_admin / is_system_admin_user em ~119 funções e ~258 políticas, get_user_context, edge functions).
--   Provado na base RH (transação desfeita): is_system_admin(<conta>) = true e get_user_context->is_system_admin = true.
-- O que muda
--   1. CHECK anew_roles_codigos_reservados: os códigos que marcam privilégio ou a natureza da conta - system_admin, super_admin
--      (verificações por código em RPCs/edge functions: rpc_delete_client_order, _soft_delete_business_entity_impl,
--      resolve_*_access_context, decide-data-erasure, export-data, ...) e client (role_is_client, fn_billing_client_role_id) -
--      só podem existir no papel GLOBAL de sistema (organization_id nulo e is_system = true). Comparação sem maiúsculas e sem
--      espaços nas pontas. Vale para todos (também service_role). Antes de criar, uma guarda confirma que nenhum papel de
--      organização usa já um destes códigos (se usasse, a migração pára e nada é apagado).
--      org_admin / org_editor / org_viewer / viewer NÃO são reservados: são códigos normais de papéis de organização
--      (bootstrap_org_creator e o ecrã criam-nos por organização); as verificações por esses códigos passam a permissões nas
--      edge functions (ver o commit) e na política de team_hub_entries (ponto 5).
--   2. Trigger trg_anew_roles_sem_marcar_sistema (INVOKER, só authenticated/anon): ninguém pela API cria um papel com
--      is_system = true nem muda is_system num papel existente (os papéis de sistema só se criam por migração/service_role).
--   3. is_system_admin(uuid) exige o papel de sistema verdadeiro: code = 'system_admin' E is_system E organization_id nulo E não
--      apagado (é a mesma condição de fn_sou_admin_global). is_system_admin_user chama esta, por isso as políticas/funções que
--      a usam ficam todas corrigidas.
--   4. get_user_context: is_system_admin passa a vir de public.is_system_admin(_auth_user_id) (antes: 'system_admin' = ANY(códigos)).
--   5. team_hub_entries (UPDATE/DELETE): o ramo "administrador" aceitava qualquer papel com code system_admin/super_admin/org_admin/
--      tenant_admin/company_admin de QUALQUER organização (o Team Hub é global, sem organização). Passa a ser só o administrador
--      de sistema verdadeiro (is_system_admin_user); o autor continua a poder editar/apagar as suas entradas. 0 linhas hoje.
--   6. role_calendar_permissions (tabela global, 0 linhas): a política ALL usava has_role(.., 'admin'), que aceita qualquer papel
--      cujo NOME contenha "admin" (o papel base "Admin" de qualquer organização). Passa a ser só o administrador de sistema.
-- As restantes verificações por código (ar.code IN ('system_admin','super_admin') em resolve_contact_access_context,
--   resolve_lead_access_context, fn_lead_org_in_scope, get_permission_scope_context, get_schedule_item_scope_context,
--   _client_contracts_effective_edit_scope, _soft_delete_business_entity_impl, rpc_delete_client_order, has_role) ficam corretas
--   pelo ponto 1: com o CHECK, só o papel global de sistema pode ter esses códigos.
-- Texto vivo: is_system_admin e get_user_context lidos com pg_get_functiondef na base RH a 4/11/2026 (guardas md5 abaixo).
-- Reversão (só como migration nova): DROP CONSTRAINT anew_roles_codigos_reservados; DROP TRIGGER trg_anew_roles_sem_marcar_sistema;
--   repor as duas funções e as 3 políticas com o texto anterior (está nos comentários de cada bloco / no histórico do git).
-- ============================================================
SET lock_timeout = '5s';

-- ── Guardas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_n int; v_lista text;
BEGIN
  IF md5(pg_get_functiondef('public.is_system_admin(uuid)'::regprocedure)) <> '159035010036f0045b091808cf9f77ef' THEN
    RAISE EXCEPTION 'GUARDA: is_system_admin mudou desde a leitura (4/11/2026)';
  END IF;
  IF md5(pg_get_functiondef('public.get_user_context(uuid)'::regprocedure)) <> '5c4aae6fc1b2c6ccc2f2f16b51e2db0d' THEN
    RAISE EXCEPTION 'GUARDA: get_user_context mudou desde a leitura (4/11/2026)';
  END IF;
  SELECT count(*), string_agg(r.id::text || ':' || r.code, ', ') INTO v_n, v_lista
  FROM public.anew_roles r
  WHERE lower(btrim(r.code)) IN ('system_admin', 'super_admin', 'client')
    AND (r.organization_id IS NOT NULL OR r.is_system IS NOT TRUE);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % papel(is) de organização já usam um código reservado (não se apaga nada): %', v_n, v_lista;
  END IF;
END $g$;

-- ── 1. Códigos reservados só no papel global de sistema ──────────────────────────────────────────────────────────────────
ALTER TABLE public.anew_roles
  ADD CONSTRAINT anew_roles_codigos_reservados
  CHECK (lower(btrim(code)) NOT IN ('system_admin', 'super_admin', 'client')
         OR (organization_id IS NULL AND is_system IS TRUE));

COMMENT ON CONSTRAINT anew_roles_codigos_reservados ON public.anew_roles IS
  '20270106300000: system_admin, super_admin e client marcam privilégio/natureza da conta e há verificações por código; só o papel global de sistema os pode usar.';

-- ── 2. Pela API ninguém marca nem desmarca um papel como de sistema ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_anew_roles_sem_marcar_sistema()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 20270106300000: só escritas diretas pela API (RLS). Migrações, service_role e RPCs DEFINER não passam aqui.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.is_system IS TRUE OR NEW.organization_id IS NULL) THEN
    RAISE EXCEPTION 'Não pode criar papéis de sistema'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION 'Não pode marcar nem desmarcar um papel como de sistema'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_anew_roles_sem_marcar_sistema() FROM PUBLIC, anon;

CREATE TRIGGER trg_anew_roles_sem_marcar_sistema
  BEFORE INSERT OR UPDATE ON public.anew_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_anew_roles_sem_marcar_sistema();

-- ── 3. is_system_admin: só o papel de sistema verdadeiro ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270106300000: o código sozinho não chega - tem de ser o papel GLOBAL de sistema (como fn_sou_admin_global).
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    JOIN public.anew_roles ar ON ar.id = am.role_id
    WHERE au.auth_user_id = _user_id
      AND ar.code = 'system_admin'
      AND ar.is_system = true
      AND ar.organization_id IS NULL
      AND ar.deleted_at IS NULL
  )
$function$;

-- ── 4. get_user_context: is_system_admin pela função canónica ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_context(_auth_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_business_user_id uuid;
  v_is_system_admin boolean := false;
  v_org_ids uuid[] := ARRAY[]::uuid[];
  v_memberships jsonb := '[]'::jsonb;
  v_permissions text[] := ARRAY[]::text[];
  v_role_codes text[] := ARRAY[]::text[];
BEGIN
  IF _auth_user_id IS NULL THEN
    RETURN jsonb_build_object('business_user_id', NULL, 'is_system_admin', false, 'org_ids', '[]'::jsonb, 'memberships', '[]'::jsonb, 'permissions', '[]'::jsonb);
  END IF;

  IF v_caller_uid IS NOT NULL AND _auth_user_id <> v_caller_uid THEN
    RAISE EXCEPTION 'permission denied: user context identity mismatch';
  END IF;

  SELECT id INTO v_business_user_id
  FROM public.anew_users
  WHERE auth_user_id = _auth_user_id
  LIMIT 1;

  IF v_business_user_id IS NULL THEN
    RETURN jsonb_build_object('business_user_id', NULL, 'is_system_admin', false, 'org_ids', '[]'::jsonb, 'memberships', '[]'::jsonb, 'permissions', '[]'::jsonb);
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('organization_id', m.organization_id, 'role_id', m.role_id, 'role_code', r.code)), '[]'::jsonb),
    COALESCE(array_agg(DISTINCT r.code), ARRAY[]::text[])
  INTO v_memberships, v_role_codes
  FROM public.anew_memberships m
  JOIN public.anew_roles r ON r.id = m.role_id
  WHERE m.user_id = v_business_user_id
    AND m.status = 'active';

  -- 20270106300000: o código 'system_admin' sozinho não chega (podia ser um papel de organização com esse código).
  v_is_system_admin := public.is_system_admin(_auth_user_id);

  SELECT COALESCE(array_agg(DISTINCT visible.organization_id), ARRAY[]::uuid[])
  INTO v_org_ids
  FROM public.get_user_visible_org_ids(_auth_user_id) AS visible(organization_id);

  SELECT COALESCE(array_agg(DISTINCT rp.permission_code), ARRAY[]::text[])
  INTO v_permissions
  FROM public.anew_role_permissions rp
  WHERE rp.role_id IN (
    SELECT DISTINCT m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_business_user_id
      AND m.status = 'active'
  );

  RETURN jsonb_build_object(
    'business_user_id', v_business_user_id,
    'is_system_admin', v_is_system_admin,
    'org_ids', to_jsonb(v_org_ids),
    'memberships', v_memberships,
    'permissions', to_jsonb(v_permissions)
  );
END;
$function$;

-- ── 5. team_hub_entries: o ramo de administrador é só o administrador de sistema ───────────────────────────────────────
-- Antes: author_id do próprio OR existe membership ativa com r.code IN ('system_admin','super_admin','org_admin','tenant_admin','company_admin').
DROP POLICY IF EXISTS "Authors and admins can update team hub entries" ON public.team_hub_entries;
CREATE POLICY "Authors and admins can update team hub entries" ON public.team_hub_entries
  FOR UPDATE TO authenticated
  USING (
    (author_id IN (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid()))
    OR public.is_system_admin_user(auth.uid())
  )
  WITH CHECK (
    (author_id IN (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid()))
    OR public.is_system_admin_user(auth.uid())
  );

DROP POLICY IF EXISTS "Authors and admins can delete team hub entries" ON public.team_hub_entries;
CREATE POLICY "Authors and admins can delete team hub entries" ON public.team_hub_entries
  FOR DELETE TO authenticated
  USING (
    (author_id IN (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid()))
    OR public.is_system_admin_user(auth.uid())
  );

-- ── 6. role_calendar_permissions (global): só o administrador de sistema gere ───────────────────────────────────────────
-- Antes: USING has_role(auth.uid(), 'admin'::app_role) (aceita qualquer papel com "admin" no nome).
DROP POLICY IF EXISTS "Admins can manage calendar permissions" ON public.role_calendar_permissions;
CREATE POLICY "Admins can manage calendar permissions" ON public.role_calendar_permissions
  FOR ALL TO authenticated
  USING (public.is_system_admin_user(auth.uid()))
  WITH CHECK (public.is_system_admin_user(auth.uid()));
