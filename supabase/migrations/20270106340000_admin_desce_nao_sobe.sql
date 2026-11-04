-- ============================================================
-- 20270106340000_admin_desce_nao_sobe
-- ============================================================
-- Lote D / D3. get_user_visible_org_ids inclui as organizações ACIMA da do utilizador (é bom para LER) e as escritas de
--   administração juntavam-lhe has_anew_permission, que é global (a permissão em qualquer organização). Resultado: o
--   administrador de uma organização-filha editava os papéis, as permissões dos papéis e as associações da mãe, alterava/apagava
--   a mãe, desativava os utilizadores dela, e mexia na hierarquia (desligar/mover nós, apagar a ligação diretamente em
--   anew_hierarchy). Quem tinha users.delete em qualquer organização desativava QUALQUER utilizador (anew_users_delete e
--   rpc_delete_user não tinham âmbito nenhum).
-- Regra: nas escritas de administração, a permissão tem de estar na organização-alvo ou numa ACIMA dela
--   (has_anew_permission_in_org_or_ancestor, de 20270106310000; o administrador de sistema passa). A leitura não muda: a condição
--   "organização visível" mantém-se em todas as políticas (só se acrescenta a permissão no sítio certo).
-- O que muda
--   - anew_roles INSERT/UPDATE/DELETE: roles.create/edit/delete na organização do papel ou acima.
--   - anew_role_permissions INSERT/UPDATE/DELETE: roles.edit na organização do papel ou acima.
--   - anew_memberships INSERT/UPDATE/DELETE: users.create/edit/delete na organização da associação ou acima (no UPDATE a
--     política vale para a linha antiga e para a nova, por isso mover uma associação pede-o nas duas organizações).
--   - anew_organizations UPDATE/DELETE: organizations.edit/delete nessa organização ou acima.
--   - anew_hierarchy: UPDATE/DELETE pedem organizations.edit no pai (ou acima); INSERT pede-a no pai e no filho (ou acima), ou o
--     filho ser uma organização própria ainda sem pai (org_is_own_unparented, como antes). Antes bastava a permissão global e as
--     duas pontas visíveis - um administrador da filha apagava a ligação à mãe ou pendurava uma organização associada na sua.
--   - anew_users DELETE: fn_pode_gerir_utilizador(id, 'users.delete', true). UPDATE de outra pessoa: fn_pode_gerir_utilizador(id,
--     'users.edit') (antes: users.edit global e a pessoa numa organização visível, incluindo as de cima). A própria ficha continua.
--   - move_organization_node / unlink_organization_node: organizations.edit no pai atual (ou acima) - e no novo pai, ao mover.
--   - rpc_delete_organization / rpc_restore_organization: organizations.delete na organização ou acima.
--   - rpc_delete_user / rpc_restore_user: fn_pode_gerir_utilizador(.., 'users.delete') (restaurar olha também às inativas).
--   - edge functions delete-user, restore-user, update-user-password: o mesmo âmbito via fn_pode_gerir_utilizador_por (ver commit).
-- CREATE OR REPLACE a partir do texto vivo (pg_get_functiondef na base RH a 4/11/2026, guardas md5).
-- Reversão (só como migration nova): repor as políticas com o texto anterior (comentários abaixo) e as 6 funções com o texto de
--   4/11/2026.
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.move_organization_node(uuid,uuid,uuid)'::regprocedure)) <> 'ed307961d3089745c88a9d659cb570dd'
     OR md5(pg_get_functiondef('public.unlink_organization_node(uuid,uuid)'::regprocedure)) <> 'b03a405b0e91baabefeeb14645eb92a4'
     OR md5(pg_get_functiondef('public.rpc_delete_organization(uuid)'::regprocedure)) <> 'a27cd9ed886afe1e3429f5412c4599e8'
     OR md5(pg_get_functiondef('public.rpc_restore_organization(uuid)'::regprocedure)) <> 'cd852949258a7edc75238e7372639b04'
     OR md5(pg_get_functiondef('public.rpc_delete_user(uuid)'::regprocedure)) <> '6146900fcfb16ce94f8d0de2c296a643'
     OR md5(pg_get_functiondef('public.rpc_restore_user(uuid)'::regprocedure)) <> '208dd5747e8bdfc757f739948df44922' THEN
    RAISE EXCEPTION 'GUARDA: uma das 6 funções mudou desde a leitura (4/11/2026)';
  END IF;
END $g$;

-- ── anew_roles ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: organization_id IN visíveis AND has_anew_permission(auth.uid(), 'roles.<ação>').
DROP POLICY IF EXISTS anew_roles_insert ON public.anew_roles;
CREATE POLICY anew_roles_insert ON public.anew_roles FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
              AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.create', organization_id));
DROP POLICY IF EXISTS anew_roles_update ON public.anew_roles;
CREATE POLICY anew_roles_update ON public.anew_roles FOR UPDATE TO authenticated
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', organization_id))
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
              AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', organization_id));
DROP POLICY IF EXISTS anew_roles_delete ON public.anew_roles;
CREATE POLICY anew_roles_delete ON public.anew_roles FOR DELETE TO authenticated
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.delete', organization_id));

-- ── anew_role_permissions ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: EXISTS papel com r.organization_id IN visíveis AND has_anew_permission(auth.uid(), 'roles.edit') (+ created_by no INSERT
--   e no WITH CHECK do UPDATE).
DROP POLICY IF EXISTS anew_role_permissions_insert ON public.anew_role_permissions;
CREATE POLICY anew_role_permissions_insert ON public.anew_role_permissions FOR INSERT TO authenticated
  WITH CHECK ((created_by = public.current_business_user_id())
              AND EXISTS (SELECT 1 FROM public.anew_roles r
                          WHERE r.id = anew_role_permissions.role_id
                            AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                            AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id)));
DROP POLICY IF EXISTS anew_role_permissions_update ON public.anew_role_permissions;
CREATE POLICY anew_role_permissions_update ON public.anew_role_permissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.anew_roles r
                 WHERE r.id = anew_role_permissions.role_id
                   AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                   AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id)))
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
                   AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'roles.edit', r.organization_id)));

-- ── anew_memberships ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: organization_id IN visíveis AND has_anew_permission(auth.uid(), 'users.create'|'users.edit'|'users.delete').
DROP POLICY IF EXISTS anew_memberships_insert ON public.anew_memberships;
CREATE POLICY anew_memberships_insert ON public.anew_memberships FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
              AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.create', organization_id));
DROP POLICY IF EXISTS anew_memberships_update ON public.anew_memberships;
CREATE POLICY anew_memberships_update ON public.anew_memberships FOR UPDATE TO authenticated
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.edit', organization_id));
DROP POLICY IF EXISTS anew_memberships_delete ON public.anew_memberships;
CREATE POLICY anew_memberships_delete ON public.anew_memberships FOR DELETE TO authenticated
  USING ((organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.delete', organization_id));

-- ── anew_organizations ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: id IN visíveis AND has_anew_permission(auth.uid(), 'organizations.edit'|'organizations.delete').
DROP POLICY IF EXISTS authenticated_update_anew_organizations ON public.anew_organizations;
CREATE POLICY authenticated_update_anew_organizations ON public.anew_organizations FOR UPDATE TO authenticated
  USING ((id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.edit', id));
DROP POLICY IF EXISTS authenticated_delete_anew_organizations ON public.anew_organizations;
CREATE POLICY authenticated_delete_anew_organizations ON public.anew_organizations FOR DELETE TO authenticated
  USING ((id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.delete', id));

-- ── anew_hierarchy ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes: pai e filho visíveis (ou filho próprio sem pai, no INSERT) AND has_anew_permission(auth.uid(), 'organizations.edit').
DROP POLICY IF EXISTS authenticated_insert_anew_hierarchy ON public.anew_hierarchy;
CREATE POLICY authenticated_insert_anew_hierarchy ON public.anew_hierarchy FOR INSERT TO authenticated
  WITH CHECK ((parent_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
              AND ((child_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) OR public.org_is_own_unparented(child_org_id))
              AND public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'organizations.edit', parent_org_id)
              AND (public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'organizations.edit', child_org_id)
                   OR public.org_is_own_unparented(child_org_id)));
DROP POLICY IF EXISTS authenticated_update_anew_hierarchy ON public.anew_hierarchy;
CREATE POLICY authenticated_update_anew_hierarchy ON public.anew_hierarchy FOR UPDATE TO authenticated
  USING ((parent_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         AND (child_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         AND public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'organizations.edit', parent_org_id));
DROP POLICY IF EXISTS authenticated_delete_anew_hierarchy ON public.anew_hierarchy;
CREATE POLICY authenticated_delete_anew_hierarchy ON public.anew_hierarchy FOR DELETE TO authenticated
  USING ((parent_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         AND (child_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         AND public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'organizations.edit', parent_org_id));

-- ── anew_users ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes (DELETE): has_anew_permission(auth.uid(), 'users.delete').
-- Antes (UPDATE): USING auth_user_id = auth.uid() OR has_anew_permission(auth.uid(), 'users.edit');
--                 WITH CHECK auth_user_id = auth.uid() OR (users.edit AND id IN (membros de organizações visíveis)).
DROP POLICY IF EXISTS anew_users_delete ON public.anew_users;
CREATE POLICY anew_users_delete ON public.anew_users FOR DELETE TO authenticated
  USING (public.has_anew_permission(auth.uid(), 'users.delete')
         AND public.fn_pode_gerir_utilizador(id, 'users.delete', true));
DROP POLICY IF EXISTS anew_users_update ON public.anew_users;
CREATE POLICY anew_users_update ON public.anew_users FOR UPDATE TO authenticated
  USING ((auth_user_id = auth.uid())
         OR (public.has_anew_permission(auth.uid(), 'users.edit') AND public.fn_pode_gerir_utilizador(id, 'users.edit')))
  WITH CHECK ((auth_user_id = auth.uid())
              OR (public.has_anew_permission(auth.uid(), 'users.edit')
                  AND (id IN (SELECT m.user_id FROM public.anew_memberships m
                              WHERE m.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))))
                  AND public.fn_pode_gerir_utilizador(id, 'users.edit')));

-- -- move_organization_node (texto vivo de 4/11/2026 + 20270106340000) --
CREATE OR REPLACE FUNCTION public.move_organization_node(p_child_org_id uuid, p_new_parent_org_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_child uuid;
  v_actor uuid := auth.uid();
  v_visible uuid[];
  v_parent_atual uuid;  -- 20270106340000
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_child_org_id IS NULL OR p_new_parent_org_id IS NULL THEN
    RAISE EXCEPTION 'child_org_id and new_parent_org_id are required';
  END IF;

  IF p_child_org_id = p_new_parent_org_id THEN
    RAISE EXCEPTION 'An organization cannot be its own parent';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_child_org_id) THEN
    RAISE EXCEPTION 'Child organization does not exist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_new_parent_org_id) THEN
    RAISE EXCEPTION 'Parent organization does not exist';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.edit') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Do not trust client-supplied identity: derive actor from auth.uid().
  -- p_created_by is intentionally ignored.
  v_visible := ARRAY(SELECT public.get_user_visible_org_ids(v_actor));
  IF NOT (p_child_org_id = ANY (v_visible)) OR NOT (p_new_parent_org_id = ANY (v_visible)) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270106340000: os direitos de administração descem, não sobem. Mover pede organizations.edit em quem manda no nó hoje
  -- (o pai atual ou acima; se o nó não tem pai, o próprio nó ou acima) E no novo pai (ou acima). Um administrador da
  -- organização-filha já não tira a sua organização de debaixo da mãe nem a pendura noutra árvore.
  SELECT h.parent_org_id INTO v_parent_atual
  FROM public.anew_hierarchy h WHERE h.child_org_id = p_child_org_id
  ORDER BY h.is_primary DESC NULLS LAST, h.created_at LIMIT 1;
  IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'organizations.edit', COALESCE(v_parent_atual, p_child_org_id))
     OR NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'organizations.edit', p_new_parent_org_id) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE descendants AS (
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    WHERE h.parent_org_id = p_child_org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN descendants d ON h.parent_org_id = d.child_org_id
  )
  SELECT child_org_id INTO v_existing_child
  FROM descendants
  WHERE child_org_id = p_new_parent_org_id
  LIMIT 1;

  IF v_existing_child IS NOT NULL THEN
    RAISE EXCEPTION 'Move would create a hierarchy cycle';
  END IF;

  DELETE FROM public.anew_hierarchy
  WHERE child_org_id = p_child_org_id;

  INSERT INTO public.anew_hierarchy (
    parent_org_id,
    child_org_id,
    relationship_type,
    is_primary,
    created_by
  ) VALUES (
    p_new_parent_org_id,
    p_child_org_id,
    'parent_of',
    true,
    v_actor
  );
END;
$function$;

-- -- unlink_organization_node (texto vivo de 4/11/2026 + 20270106340000) --
CREATE OR REPLACE FUNCTION public.unlink_organization_node(p_child_org_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_child_org_id IS NULL THEN
    RAISE EXCEPTION 'child_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_child_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.edit') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Do not trust client-supplied identity: p_created_by is intentionally ignored.
  IF NOT (p_child_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270106340000: desligar pede organizations.edit em cada pai do nó (ou acima) - quem manda na ligação é a mãe, não a filha.
  IF EXISTS (
    SELECT 1 FROM public.anew_hierarchy h
    WHERE h.child_org_id = p_child_org_id
      AND NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'organizations.edit', h.parent_org_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.anew_hierarchy
  WHERE child_org_id = p_child_org_id;
END;
$function$;

-- -- rpc_delete_organization (texto vivo de 4/11/2026 + 20270106340000) --
CREATE OR REPLACE FUNCTION public.rpc_delete_organization(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_deleted     uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_delete_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270106340000: organizations.delete nesta organização ou acima (um administrador de uma filha já não eliminar a mãe).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.delete', p_root_org_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar esta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_root.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Organização já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  v_deleted := public.delete_organization_subtree(p_root_org_id);

  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_root.deleted_at), 'new', to_jsonb(now()))
    ),
    'subtree', jsonb_build_object('old', v_subtree, 'new', NULL)
  );

  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'UPDATE', v_diff, 'web_app'
  );

  RETURN v_deleted;
END;
$function$;

-- -- rpc_restore_organization (texto vivo de 4/11/2026 + 20270106340000) --
CREATE OR REPLACE FUNCTION public.rpc_restore_organization(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_restored    uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270106340000: organizations.delete nesta organização ou acima (um administrador de uma filha já não restaurar a mãe).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.delete', p_root_org_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar esta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_root.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Organização já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  v_restored := public.restore_organization_subtree(p_root_org_id);

  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_root.deleted_at), 'new', NULL)
    ),
    'subtree', jsonb_build_object('old', NULL, 'new', v_subtree)
  );

  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'UPDATE', v_diff, 'web_app'
  );

  RETURN v_restored;
END;
$function$;

-- -- rpc_delete_user (texto vivo de 4/11/2026 + 20270106340000) --
CREATE OR REPLACE FUNCTION public.rpc_delete_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_before     public.anew_users;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  -- Consolidate this action into a single audit row (fn_audit_anew_users
  -- short-circuits while this GUC is 'on' — 20260720010000).
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_users_delete RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'users.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270106340000: antes bastava users.delete em qualquer organização para desativar QUALQUER utilizador da plataforma.
  -- Passa a pedir users.delete na organização de cada associação ativa da pessoa (ou acima), nunca a própria, nunca um
  -- administrador de sistema, nunca alguém com um papel com mais poder (fn_pode_gerir_utilizador).
  IF NOT public.fn_pode_gerir_utilizador(p_user_id, 'users.delete', false) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar este utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency guard: nothing to do (and nothing new to audit) if the user
  -- is already deactivated.
  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Utilizador já está inativo' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve org for the audit row exactly as fn_audit_anew_users would ───
  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  -- ── Soft-deactivate: no DELETE, ownership/created_by of every record this
  --    user created remains completely untouched. ───────────────────────────
  UPDATE public.anew_users
  SET    status     = 'inactive',
         deleted_at = now(),
         updated_at = now()
  WHERE  id = p_user_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('inactive'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
  );

  -- Skip silently when the user has no membership yet (fn_audit_anew_users
  -- does the same — an org-less user cannot be attributed to any org's log).
  IF v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;
END;
$function$;

-- -- rpc_restore_user (texto vivo de 4/11/2026 + 20270106340000) --
CREATE OR REPLACE FUNCTION public.rpc_restore_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_before     public.anew_users;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Reuses `users.delete`: restoring is the direct inverse of deactivating,
  -- reachable only from the same admin surface — see migration header note.
  IF NOT public.has_anew_permission(auth.uid(), 'users.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270106340000: como rpc_delete_user, mas olhando a todas as associações (uma conta desativada pode tê-las inativas).
  IF NOT public.fn_pode_gerir_utilizador(p_user_id, 'users.delete', true) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar este utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Utilizador já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  UPDATE public.anew_users
  SET    status     = 'active',
         deleted_at = NULL,
         updated_at = now()
  WHERE  id = p_user_id;

  v_diff := jsonb_build_object(
    'status',     jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb('active'::text)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
  );

  IF v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;
END;
$function$;

