-- ============================================================
-- 20270108150000_auth_audit_log_permissao
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D, P2 «platform.auth_audit_log.view dá erro para todos».
-- get_login_attempts_audit_log / get_account_changes_audit_log só aceitavam o administrador de sistema (não há nenhum ativo no
--   ramo), por isso a página /platform/auth-audit-log abria com a permissão e dava erro.
-- Agora: o administrador de sistema vê tudo (igual); quem tem platform.auth_audit_log.view vê só as linhas de contas que são
--   membros ativos de uma organização onde tem a permissão (nela ou acima) - a administração desce, não atravessa organizações.
--   Tentativas sem conta (auth_user_id nulo, p.ex. email desconhecido) só o administrador de sistema as vê.
-- Fica como estava: terminar sessões (edge revoke-user-sessions) continua só para o administrador de sistema.
-- Função nova fn_auth_audit_log_visivel (só usada dentro das duas RPCs; sem EXECUTE para authenticated/anon).
-- Reversão (só como migration nova): repor as 2 funções com o texto de 5/11/2026; DROP FUNCTION public.fn_auth_audit_log_visivel(uuid,uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.get_login_attempts_audit_log(integer,integer,text,boolean)'::regprocedure)) <> '7f03bc34345d74029177db259d8592f5'
     OR md5(pg_get_functiondef('public.get_account_changes_audit_log(integer,integer,uuid)'::regprocedure)) <> '4d0207629aa54ffac598f4b47e84ce9c' THEN
    RAISE EXCEPTION 'GUARDA: uma das funções mudou desde a leitura (5/11/2026)';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_auth_audit_log_visivel(p_actor_auth uuid, p_target_auth uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270108150000: a conta p_target_auth é membro ativo de uma organização onde quem age tem platform.auth_audit_log.view
  --   (nela ou acima).
  SELECT p_actor_auth IS NOT NULL AND p_target_auth IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.anew_users tu
    JOIN public.anew_memberships tm ON tm.user_id = tu.id AND tm.status = 'active'
    WHERE tu.auth_user_id = p_target_auth
      AND public.has_anew_permission_in_org_or_ancestor(p_actor_auth, 'platform.auth_audit_log.view', tm.organization_id)
  )
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_auth_audit_log_visivel(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_auth_audit_log_visivel(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_login_attempts_audit_log(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_identifier text DEFAULT NULL::text, p_success boolean DEFAULT NULL::boolean)
 RETURNS TABLE(id uuid, identifier text, auth_user_id uuid, user_display_name text, success boolean, ip_address text, user_agent text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sys boolean;  -- 20270108150000
BEGIN
  -- 20270108150000: o administrador de sistema vê tudo, como antes; quem tem platform.auth_audit_log.view vê só as tentativas das
  --   contas que são membros das organizações onde tem a permissão (nelas ou acima). Antes a permissão não abria nada.
  v_sys := v_uid IS NOT NULL AND public.is_system_admin(v_uid);
  IF v_uid IS NULL OR NOT (v_sys OR public.has_anew_permission(v_uid, 'platform.auth_audit_log.view')) THEN
    RAISE EXCEPTION 'permission denied: system_admin required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.identifier,
    a.auth_user_id,
    u.name AS user_display_name,
    a.success,
    a.ip_address,
    a.user_agent,
    a.created_at
  FROM public.auth_login_attempts a
  LEFT JOIN public.anew_users u ON u.auth_user_id = a.auth_user_id
  WHERE (p_identifier IS NULL OR a.identifier ILIKE p_identifier)
    AND (p_success IS NULL OR a.success = p_success)
    AND (v_sys OR public.fn_auth_audit_log_visivel(v_uid, a.auth_user_id))
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_account_changes_audit_log(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_auth_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, auth_user_id uuid, user_display_name text, change_type text, old_email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sys boolean;  -- 20270108150000
begin
  -- 20270108150000: como em get_login_attempts_audit_log.
  v_sys := v_uid is not null and public.is_system_admin(v_uid);
  if v_uid is null or not (v_sys or public.has_anew_permission(v_uid, 'platform.auth_audit_log.view')) then
    raise exception 'permission denied: system_admin required';
  end if;

  return query
  select
    c.id,
    c.auth_user_id,
    u.name as user_display_name,
    c.change_type,
    c.old_email,
    c.created_at
  from public.auth_account_changes c
  left join public.anew_users u on u.auth_user_id = c.auth_user_id
  where (p_auth_user_id is null or c.auth_user_id = p_auth_user_id)
    and (v_sys or public.fn_auth_audit_log_visivel(v_uid, c.auth_user_id))
  order by c.created_at desc
  limit p_limit
  offset p_offset;
end;
$function$;
