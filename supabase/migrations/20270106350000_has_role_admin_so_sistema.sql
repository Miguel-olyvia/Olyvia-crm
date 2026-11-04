-- ============================================================
-- 20270106350000_has_role_admin_so_sistema
-- ============================================================
-- has_role(_user_id, 'admin') dava verdadeiro a qualquer papel cujo código OU nome contivesse "admin" (LIKE '%admin%'), e ainda
--   a qualquer papel chamado exatamente "admin". Os papéis de organização são criados pelos administradores das organizações, por
--   isso bastava criar um papel "Admin vendas" (ou com código 'system_admin' numa organização) para passar a "admin".
-- Quem usa has_role (verificado a 4/11/2026 na base RH):
--   - funções/políticas/vistas: nenhuma. fn_protect_created_by e storage.protect_bucket_control_columns usam pg_has_role (pertença
--     a papéis do Postgres - postgres/service_role/papel do Storage), NÃO esta função; não mudam e continuam a funcionar.
--   - frontend: só src/pages/Settings.tsx (supabase.rpc('has_role', {_role: 'admin'})) para mostrar a área de administrador de
--     sistema. O administrador da empresa é detetado à parte (org_admin/super_admin/system_admin nas associações) e não muda.
-- Regra: has_role(.., 'admin') = is_system_admin(_user_id) (o papel GLOBAL de sistema verdadeiro, como fixado em 20270106300000).
--   Os outros valores ('manager', 'sales_rep', 'viewer') ficam exatamente como estavam.
-- CREATE OR REPLACE a partir do texto vivo (pg_get_functiondef na base RH a 4/11/2026, guarda md5).
-- Reversão (só como migration nova): repor o texto anterior (o ramo 'admin' com LIKE '%admin%' dentro do EXISTS).
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.has_role(uuid,app_role)'::regprocedure)) <> '0db7f48750f4d601c7b74adb8c2b9cb0' THEN
    RAISE EXCEPTION 'GUARDA: has_role mudou desde a leitura (4/11/2026)';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270106350000: 'admin' = administrador de sistema verdadeiro (is_system_admin). Antes: qualquer papel com "admin" no
  -- código ou no nome, incluindo papéis criados numa organização.
  SELECT CASE
    WHEN LOWER(_role::text) = 'admin' THEN COALESCE(public.is_system_admin(_user_id), false)
    ELSE EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id AND am.status = 'active'
      JOIN public.anew_roles ar
        ON ar.id = am.role_id
      WHERE au.auth_user_id = _user_id
        AND (
          (LOWER(_role::text) = 'manager'
             AND (ar.code IN ('system_admin', 'super_admin')
                  OR LOWER(ar.code) LIKE '%admin%'
                  OR LOWER(ar.code) LIKE '%manager%'
                  OR LOWER(ar.name) LIKE '%admin%'
                  OR LOWER(ar.name) LIKE '%manager%'))
          OR
          (LOWER(_role::text) = 'sales_rep'
             AND (LOWER(ar.code) LIKE 'sales%' OR LOWER(ar.name) LIKE 'sales%'))
          OR
          (LOWER(_role::text) = 'viewer'
             AND (LOWER(ar.code) LIKE '%view%' OR LOWER(ar.name) LIKE '%view%'))
          OR
          LOWER(ar.code) = LOWER(_role::text)
          OR
          LOWER(ar.name) = LOWER(_role::text)
        )
    )
  END;
$function$;
