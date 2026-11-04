-- ============================================================
-- 20270106330000_fechar_leituras_e_escritas_soltas
-- ============================================================
-- Lote D / D4. Políticas que deixavam ler/escrever fora do sítio:
--   1. api_keys: "Users can view org API keys" deixava QUALQUER associação ativa (também a de cliente do portal) ler a chave em
--      claro; "Admins can manage API keys" pedia settings.update em QUALQUER organização (has_anew_permission global) e uma
--      associação qualquer (incluindo cliente) na organização da chave. Passa a:
--        ver   = settings.update OU api_keys.view nessa organização ou acima (has_anew_permission_in_org_or_ancestor:
--                associações ativas não-cliente; o administrador de sistema passa);
--        gerir = settings.update nessa organização ou acima.
--   2. contact_custom_fields "Admins can manage custom fields" (ALL) só pedia settings.update, sem filtro de organização: quem a
--      tinha em qualquer organização mexia nos campos de todas. Passa a settings.update na organização do campo ou acima.
--      (0 linhas hoje; nenhuma com organization_id nulo. Campos sem organização ficam só para o administrador de sistema.)
--   3. notifications "Active members can insert notifications": qualquer membro ativo criava notificações para QUALQUER user_id
--      (auth uid) de qualquer organização, com qualquer link. Quem insere legitimamente pela API: só o comentário do Team Hub
--      (EntryComments.tsx: notifica o autor e os mencionados, link '/team-hub'). Os gatilhos/RPCs que notificam são todos
--      SECURITY DEFINER (dono postgres, BYPASSRLS) e não passam pela política. Passa a:
--        - quem insere tem uma associação ativa não-cliente;
--        - o destinatário é o próprio, ou tem uma associação ativa numa organização visível a quem insere
--          (fn_notificacao_destino_permitido);
--        - organization_id nulo ou de uma organização visível a quem insere;
--        - link nulo ou um caminho relativo da app ('/...', não '//...' nem '/\...').
--   4. invoices, organization_subscriptions, organization_usage_counters: a leitura aceitava qualquer associação ativa, também a de
--      cliente do portal. Passa a excluir role_is_client (o resto da condição fica igual).
--   5. Permissão system.manage: as políticas de anew_permissions / anew_org_templates / anew_org_template_nodes pediam-na mas não
--      existia no catálogo. Cria-se (categoria 'platform', âmbito 'platform', perigosa) e dá-se ao papel GLOBAL system_admin.
--      NÃO se dá ao super_admin: o super_admin é o papel do dono de cada empresa (3 membros nesta base); com system.manage, qualquer
--      dono passava a editar o catálogo de permissões e os modelos de organização de TODA a plataforma - hoje ninguém o faz pela
--      API, seria abrir. E fica reservada: trigger trg_role_permissions_reservadas impede que system.manage seja dada a qualquer
--      papel que não seja o system_admin global (senão o super_admin, que pode dar todas as permissões a papéis da sua empresa,
--      passava-a a um papel de organização).
-- Funções novas: fn_notificacao_destino_permitido, fn_role_permissions_reservadas.
-- Reversão (só como migration nova): repor as políticas com o texto anterior (nos comentários de cada bloco), DROP do trigger e
--   das funções, apagar a linha system.manage do system_admin (com a claim service_role) e do catálogo.
-- ============================================================
SET lock_timeout = '5s';

-- ── 1. api_keys ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Antes (SELECT): organization_id IN (membros ativos da sessão, qualquer papel).
-- Antes (ALL):    organization_id IN (membros ativos da sessão) AND has_anew_permission(auth.uid(), 'settings.update').
DROP POLICY IF EXISTS "Users can view org API keys" ON public.api_keys;
CREATE POLICY "Users can view org API keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (
    public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id)
    OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'api_keys.view', organization_id)
  );

DROP POLICY IF EXISTS "Admins can manage API keys" ON public.api_keys;
CREATE POLICY "Admins can manage API keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id))
  WITH CHECK (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id));

-- ── 2. contact_custom_fields ──────────────────────────────────────────────────────────────────────────────────────────────
-- Antes (ALL): has_anew_permission(auth.uid(), 'settings.update') nos dois lados.
DROP POLICY IF EXISTS "Admins can manage custom fields" ON public.contact_custom_fields;
CREATE POLICY "Admins can manage custom fields" ON public.contact_custom_fields
  FOR ALL TO authenticated
  USING (
    public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id)
    OR (organization_id IS NULL AND public.is_system_admin_user(auth.uid()))
  )
  WITH CHECK (
    public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.update', organization_id)
    OR (organization_id IS NULL AND public.is_system_admin_user(auth.uid()))
  );

-- ── 3. notifications ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notificacao_destino_permitido(p_destino_auth uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270106330000: a sessão (membro ativo não-cliente) pode notificar p_destino_auth se for ela própria ou se o destinatário
  -- tem uma associação ativa numa organização visível à sessão.
  SELECT auth.uid() IS NOT NULL AND p_destino_auth IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.anew_users u
      JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active' AND m.role_is_client IS NOT TRUE
      WHERE u.auth_user_id = auth.uid() AND u.deleted_at IS NULL
    )
    AND (
      p_destino_auth = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.anew_users d
        JOIN public.anew_memberships dm ON dm.user_id = d.id AND dm.status = 'active'
        WHERE d.auth_user_id = p_destino_auth
          AND dm.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
      )
    )
$function$;

REVOKE ALL ON FUNCTION public.fn_notificacao_destino_permitido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_notificacao_destino_permitido(uuid) TO authenticated, service_role;

-- Antes (INSERT): EXISTS (membership ativa da sessão) - para qualquer user_id/organization_id/link.
DROP POLICY IF EXISTS "Active members can insert notifications" ON public.notifications;
CREATE POLICY "Active members can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_notificacao_destino_permitido(user_id)
    AND (organization_id IS NULL
         OR organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
    AND (link IS NULL
         OR (left(link, 1) = '/' AND left(link, 2) NOT IN ('//', '/\')))
  );

-- ── 4. Faturação: fora as associações de cliente do portal ────────────────────────────────────────────────────────────────
-- Antes: EXISTS (m.organization_id = <tabela>.organization_id AND m.user_id = <sessão> AND m.status = 'active').
DROP POLICY IF EXISTS "Org members can view their own invoices" ON public.invoices;
CREATE POLICY "Org members can view their own invoices" ON public.invoices
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid())
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ));

DROP POLICY IF EXISTS organization_subscriptions_select ON public.organization_subscriptions;
CREATE POLICY organization_subscriptions_select ON public.organization_subscriptions
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.organization_id = organization_subscriptions.organization_id
      AND m.user_id = (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid())
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ));

DROP POLICY IF EXISTS "Org members can view their own usage counters" ON public.organization_usage_counters;
CREATE POLICY "Org members can view their own usage counters" ON public.organization_usage_counters
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.organization_id = organization_usage_counters.organization_id
      AND m.user_id = (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid())
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ));

-- ── 5. system.manage ──────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.anew_permissions (code, name, description, category, scope, is_dangerous)
SELECT 'system.manage', 'Gerir a plataforma',
       'Editar o catálogo de permissões e os modelos de organização de toda a plataforma (só administrador de sistema)',
       'platform', 'platform', true
WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'system.manage');

CREATE OR REPLACE FUNCTION public.fn_role_permissions_reservadas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270106330000: system.manage só no papel GLOBAL system_admin (vale para todos, também service_role).
  IF NEW.permission_code = 'system.manage' AND NOT EXISTS (
       SELECT 1 FROM public.anew_roles r
       WHERE r.id = NEW.role_id AND r.code = 'system_admin' AND r.is_system = true AND r.organization_id IS NULL
     ) THEN
    RAISE EXCEPTION 'A permissão system.manage é reservada ao administrador de sistema'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_role_permissions_reservadas() FROM PUBLIC, anon;

CREATE TRIGGER trg_role_permissions_reservadas
  BEFORE INSERT OR UPDATE OF permission_code, role_id ON public.anew_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_role_permissions_reservadas();

DO $do$
DECLARE
  v_role       uuid;
  v_n          int;
  v_prev_claim text;
BEGIN
  SELECT count(*) INTO v_n FROM public.anew_role_permissions WHERE permission_code = 'system.manage';
  IF v_n > 0 AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions rp JOIN public.anew_roles r ON r.id = rp.role_id
       WHERE rp.permission_code = 'system.manage' AND r.code = 'system_admin' AND r.is_system AND r.organization_id IS NULL) THEN
    RAISE EXCEPTION 'GUARDA: system.manage já está dada a papéis que não são o system_admin global';
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_roles r WHERE r.code = 'system_admin' AND r.is_system = true AND r.organization_id IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'Papel system_admin global não existe nesta base: system.manage fica só no catálogo.';
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papéis system_admin globais de sistema (esperado 1)', v_n;
  END IF;
  SELECT r.id INTO v_role FROM public.anew_roles r WHERE r.code = 'system_admin' AND r.is_system = true AND r.organization_id IS NULL;

  -- protect_system_role_permissions só deixa escrever em papéis de sistema com a claim service_role (LOCAL, reposta a seguir;
  -- como em 20270105600000).
  v_prev_claim := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role, 'system.manage'
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_role_permissions WHERE role_id = v_role AND permission_code = 'system.manage');
  PERFORM set_config('request.jwt.claims', COALESCE(NULLIF(v_prev_claim, ''), '{}'), true);  -- '' partia o ::jsonb dos triggers
END $do$;
