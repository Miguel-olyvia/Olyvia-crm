-- ============================================================
-- 20270112130000 — utilizadores_sem_escalada
-- ============================================================
-- O que faz: fecha três escaladas na gestão de utilizadores por escrita direta pela API (auditoria admin/10 T3/T4 e admin/13 T6).
--   1. anew_memberships_delete (política): só pedia users.delete na organização → a Helena apagou a associação do super_admin Miguel.
--      Passa a pedir também fn_pode_gerir_utilizador(user_id, 'users.delete', true) (não a própria pessoa, não um administrador de
--      sistema, users.delete em cada organização da pessoa e poder atribuir cada um dos papéis dela) e, se a associação estiver
--      ativa, users.manage_roles na organização ou acima — a mesma regra de rpc_update_user ao remover associações.
--   2. tg_anew_scopes_no_self_grant (âmbitos): com users.edit a Helena deu âmbito ORG de leads.view ao Sérgio sem ter leads.view.
--      Ao inserir/alterar uma linha, quem dá tem de ter a permissão com âmbito igual ou superior (NONE < OWNED < TEAM < ORG) na
--      organização da associação, calculado como o servidor o calcula hoje (resolve_lead_access_context):
--        · sem a permissão (has_anew_permission_in_org_or_ancestor) → não dá nenhum âmbito;
--        · super_admin nessa organização ou acima → ORG; permissão sem âmbito (supports_scope = false) → ORG;
--        · senão, o mais alto das suas próprias linhas nas associações ativas dessa organização (sem linha = OWNED; só NONE = NONE).
--      Administrador global (fn_sou_admin_global) e de sistema isentos. Baixar um âmbito passa sempre. rpc_update_user grava os
--      âmbitos apagando e voltando a inserir as linhas da associação: repor uma linha que foi retirada na mesma transação (mesma
--      associação e permissão, nível igual ou inferior) não é dar nada e passa (lista na definição local olyvia.ambitos_retirados).
--      Retirar linhas não muda (as políticas já pedem users.edit e fn_pode_gerir_utilizador). A regra «não aos próprios» fica igual.
--   3. tg_anew_memberships_sem_escalada: o INSERT direto só pedia users.create (política) → um cliente do portal ganhou um papel
--      interno sem users.manage_roles. Passa a pedir também users.manage_roles na organização ou acima quando o papel dado não é de
--      cliente do portal (role_is_client). Dar o papel de cliente continua só com users.create.
--   Fluxos legítimos que não mudam: edge functions (create-user, criar-acesso-pessoa, create-client-portal-access,
--   create-supplier-portal-access, register-company, delete-user, restore-user) escrevem com service_role (current_user/auth.uid()
--   sem utilizador) ou por rpc_finalize_user_profile_full/rpc_update_user (SECURITY DEFINER, validam do seu lado).
--
-- Funções a partir do pg_get_functiondef vivo (base RH uetjghdkwbywbftedtth, 9/11/2026; guarda md5 abaixo). Grants/SECURITY/search_path
--   iguais. Reversão (só como migration nova): repor as duas funções (md5 na guarda) e a política com o texto antigo (na guarda).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.tg_anew_memberships_sem_escalada()'::regprocedure)) <> '2f0c3375d4118c3216baced5eeb49e48'
     OR md5(pg_get_functiondef('public.tg_anew_scopes_no_self_grant()'::regprocedure)) <> '8c9c445fdfe3f68b7e17c2c164a090e0' THEN
    RAISE EXCEPTION 'Guarda: tg_anew_memberships_sem_escalada ou tg_anew_scopes_no_self_grant mudou desde 9/11/2026. Rever esta migration.';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anew_memberships'
        AND policyname = 'anew_memberships_delete' AND cmd = 'DELETE' AND permissive = 'PERMISSIVE') IS DISTINCT FROM '9756d29e7b6e4e07e92cb2916ffe1700' THEN
    RAISE EXCEPTION 'Guarda: a política anew_memberships_delete mudou desde 9/11/2026. Rever esta migration.';
  END IF;
END $do$;

-- 1. Apagar associações: como rpc_update_user (texto antigo: organization_id IN (get_user_visible_org_ids(auth.uid())) AND
--    has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.delete', organization_id))
DROP POLICY anew_memberships_delete ON public.anew_memberships;
CREATE POLICY anew_memberships_delete ON public.anew_memberships
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)
    AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.delete'::text, organization_id)
    -- 20270112130000
    AND public.fn_pode_gerir_utilizador(user_id, 'users.delete'::text, true)
    AND (status IS DISTINCT FROM 'active'
         OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles'::text, organization_id))
  );

-- 2. Âmbitos
CREATE OR REPLACE FUNCTION public.tg_anew_scopes_no_self_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_membership uuid;
  v_owner      uuid;
  v_org        uuid;
  v_nivel_novo int;
  v_nivel_meu  int;
  v_retirados  text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_membership := OLD.membership_id;
  ELSE
    v_membership := NEW.membership_id;
  END IF;

  SELECT m.user_id INTO v_owner
  FROM public.anew_memberships m
  WHERE m.id = v_membership;

  IF v_owner IS NOT NULL AND v_owner = ANY(public.anew_current_user_ids()) THEN
    RAISE EXCEPTION 'Nao pode alterar os seus proprios ambitos de permissao'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270112130000: só se dá um âmbito até ao que se tem (ver cabeçalho da migration)
  IF public.is_system_admin_user(auth.uid()) OR public.fn_sou_admin_global() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- guardar o que se retira nesta transação (rpc_update_user apaga e volta a inserir as linhas da associação)
    PERFORM set_config('olyvia.ambitos_retirados',
      coalesce(current_setting('olyvia.ambitos_retirados', true), '') || '|' || OLD.membership_id::text || ':' || OLD.permission_code
        || ':' || (CASE OLD.scope_level::text WHEN 'NONE' THEN 0 WHEN 'OWNED' THEN 1 WHEN 'TEAM' THEN 2 WHEN 'ORG' THEN 3 END)::text,
      true);
    RETURN OLD;
  END IF;

  v_nivel_novo := CASE NEW.scope_level::text WHEN 'NONE' THEN 0 WHEN 'OWNED' THEN 1 WHEN 'TEAM' THEN 2 WHEN 'ORG' THEN 3 ELSE 3 END;

  -- baixar (mesma associação e permissão) passa sempre
  IF TG_OP = 'UPDATE'
     AND NEW.membership_id = OLD.membership_id AND NEW.permission_code = OLD.permission_code
     AND v_nivel_novo <= (CASE OLD.scope_level::text WHEN 'NONE' THEN 0 WHEN 'OWNED' THEN 1 WHEN 'TEAM' THEN 2 WHEN 'ORG' THEN 3 END) THEN
    RETURN NEW;
  END IF;

  -- repor o que foi retirado nesta transação (nível igual ou inferior)
  v_retirados := current_setting('olyvia.ambitos_retirados', true);
  IF v_retirados IS NOT NULL AND v_retirados <> '' AND EXISTS (
       SELECT 1 FROM unnest(string_to_array(v_retirados, '|')) x
       WHERE split_part(x, ':', 1) = NEW.membership_id::text
         AND split_part(x, ':', 2) = NEW.permission_code
         AND split_part(x, ':', 3) ~ '^[0-3]$'
         AND split_part(x, ':', 3)::int >= v_nivel_novo) THEN
    RETURN NEW;
  END IF;

  SELECT m.organization_id INTO v_org FROM public.anew_memberships m WHERE m.id = NEW.membership_id;

  IF v_org IS NULL OR NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), NEW.permission_code, v_org) THEN
    v_nivel_meu := -1;
  ELSIF EXISTS (
          SELECT 1
          FROM public.anew_users u
          JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active'
          JOIN public.anew_roles r ON r.id = m.role_id
          WHERE u.auth_user_id = auth.uid() AND r.code = 'super_admin'
            AND m.organization_id IN (SELECT public.fn_org_e_ascendentes(v_org)))
        OR EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = NEW.permission_code AND p.supports_scope IS NOT TRUE) THEN
    v_nivel_meu := 3;
  ELSE
    SELECT CASE
             WHEN bool_or(s.scope_level::text = 'ORG') THEN 3
             WHEN bool_or(s.scope_level::text = 'TEAM') THEN 2
             WHEN bool_or(s.scope_level::text = 'NONE') AND NOT coalesce(bool_or(s.scope_level::text = 'OWNED'), false) THEN 0
             ELSE 1
           END
    INTO v_nivel_meu
    FROM public.anew_users u
    JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active' AND m.organization_id = v_org
    JOIN public.anew_membership_permission_scopes s ON s.membership_id = m.id AND s.permission_code = NEW.permission_code
    WHERE u.auth_user_id = auth.uid();
    v_nivel_meu := coalesce(v_nivel_meu, 1);
  END IF;

  IF v_nivel_novo > v_nivel_meu THEN
    RAISE EXCEPTION 'Não pode dar o âmbito % em % (%)', NEW.scope_level, NEW.permission_code,
      (CASE WHEN v_nivel_meu < 0 THEN 'não tem esta permissão'
            ELSE 'o seu âmbito é ' || (ARRAY['NONE','OWNED','TEAM','ORG'])[v_nivel_meu + 1] END)
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Associações: o INSERT direto de um papel interno pede users.manage_roles
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

  -- 20270112130000: inserir uma associação com um papel interno (não de cliente do portal) é dar um papel: pede também
  -- users.manage_roles na organização ou acima, como rpc_update_user. O papel de cliente continua só com users.create.
  IF TG_OP = 'INSERT' AND NEW.role_is_client IS NOT TRUE
     AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.manage_roles', NEW.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir papéis nesta organização (falta users.manage_roles)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_motivo := public.fn_motivo_papel_nao_atribuivel_eu(NEW.organization_id, NEW.role_id);
  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;
