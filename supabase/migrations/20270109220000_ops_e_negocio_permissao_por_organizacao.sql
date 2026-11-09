-- =============================================================================
-- 20270109220000 — Operações e Negócio: a permissão conta por organização
-- =============================================================================
-- ops_pode(org, código) e fn_neg_tem_permissao_org(org, código) ainda usavam
-- has_anew_permission(uid, código) — global: chega ter a permissão em QUALQUER
-- organização. Passam a has_anew_permission_for_org(uid, código, org): a
-- permissão tem de estar na organização ou numa acima dela (desce, não sobe —
-- 20270109200000). O papel global system_admin mantém-se.
--
-- ops_pode — usada por 35 funções ops_* / rpc_ops_* / rpc_fleet_link_order e por
--   49 policies das tabelas ops_* (inventário de 05/11/2026). Antes:
--     visível + permissão em qualquer org + (sem associação direta na org OU a
--     associação direta tem a permissão) + perfil de operações ativo na org.
--   O ramo «sem associação direta» deixava quem tem a permissão numa FILHA
--   agir na MÃE (visível pela hierarquia). Agora: visível + permissão nesta
--   organização ou acima + perfil de operações (igual, incluindo a regra de
--   admin/gestor para operations.settings.manage e operations.costs.view).
-- fn_neg_tem_permissao_org — usada por 26 funções do Negócio (neg_*,
--   fn_neg_*, rpc_resolve_form_submission). As chaves de âmbito
--   (crm_scope_keys) já exigiam a permissão na org ou acima, EXCETO para
--   super_admin da org (ou de uma acima), que recebe chaves sem a permissão;
--   bastava então ter o código noutra organização. Agora a permissão tem de
--   contar nesta organização.
-- Impacto nos dados de 05/11/2026: uma só organização e 0 perfis de operações —
-- comparação antes/depois de todos os utilizadores × códigos = 0 diferenças.
-- Partem de pg_get_functiondef vivo (05/11/2026); a guarda pára se mudou.
-- Reversão (só como migração nova): repor os dois textos de 05/11/2026.
-- =============================================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.ops_pode(uuid,text)'::regprocedure)) <> '029b97c8317e8a1c2c0271d6523f754a'
     OR md5(pg_get_functiondef('public.fn_neg_tem_permissao_org(uuid,text)'::regprocedure)) <> '05943a6cfb0382a07322870262170c8d' THEN
    RAISE EXCEPTION 'GUARDA: ops_pode ou fn_neg_tem_permissao_org mudou desde a leitura (05/11/2026)';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.ops_pode(_org_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      _org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      -- 20270109220000: a permissão tem de contar NESTA organização (associação aqui ou numa acima); antes bastava tê-la
      --   em qualquer organização quando não havia associação direta nesta.
      AND public.has_anew_permission_for_org((SELECT auth.uid()), _perm, _org_id)
      AND EXISTS (
        SELECT 1 FROM public.ops_utilizador_perfil p
         WHERE p.organization_id = _org_id
           AND p.utilizador_id = public.current_business_user_id()
           AND p.ativo
           -- Para as duas que mexem em gente e em dinheiro, é a função de
           -- operações NESTA organização que decide.
           AND (_perm NOT IN ('operations.settings.manage','operations.costs.view')
                OR p.funcao IN ('admin','gestor'))
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_tem_permissao_org(p_organization_id uuid, p_codigo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270109220000: a permissão conta nesta organização (ou numa acima), não em qualquer uma.
  SELECT p_organization_id IS NOT NULL
     AND public.has_anew_permission_for_org(auth.uid(), p_codigo, p_organization_id)
     AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys(p_codigo)) AS k(scope_key)
                 WHERE starts_with(k.scope_key, p_organization_id::text || ':'));
$function$;
