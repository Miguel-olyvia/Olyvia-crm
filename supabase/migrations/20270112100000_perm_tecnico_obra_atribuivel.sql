-- ============================================================
-- 20270112100000 — perm_tecnico_obra_atribuivel
-- ============================================================
-- O que faz: o perfil com «Ser técnico de obra» (negocios.obra.tecnico) passa a poder ser atribuído. Hoje ninguém o consegue dar
--   (nem o super_admin): fn_permissoes_que_nao_posso_dar já tem a exceção desde 20270110600000, mas fn_motivo_papel_nao_atribuivel
--   (usada pelo trigger tg_anew_memberships_sem_escalada, rpc_update_user, rpc_finalize_user_profile_full e
--   fn_pode_gerir_utilizador_por) não, e só isentava is_system_admin, não o administrador global (super_admin).
--
-- CREATE OR REPLACE de fn_motivo_papel_nao_atribuivel a partir do pg_get_functiondef vivo (base RH uetjghdkwbywbftedtth, 9/11/2026;
--   guarda md5 abaixo), com duas mudanças, ambas iguais às de fn_permissoes_que_nao_posso_dar:
--     1. o administrador global (papel de sistema global super_admin/system_admin ativo de p_actor_auth — a condição de
--        fn_sou_admin_global, mas para quem age e não para auth.uid()) fica isento da verificação das permissões e da de assinar
--        contratos. As regras do papel de sistema (só quem já o tem o dá) e da organização do papel continuam para ele: um
--        super_admin continua sem poder dar system_admin;
--     2. negocios.obra.tecnico não conta como «permissão que não tem» se quem dá já tem todas as permissões que o papel 'tecnico'
--        do Negócio dá (neg_papeis_permissoes) nesta organização ou acima.
--   Nada mais muda. A permissão NÃO é dada a nenhum papel (nem a super_admin/system_admin). Grants/SECURITY/search_path iguais.
--
-- Reversão (só como migration nova): repor o texto vivo de 9/11 (md5 38b9caa0068cbbb0bef135ac155fcc09).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.fn_motivo_papel_nao_atribuivel(uuid,uuid,uuid)'::regprocedure)) <> '38b9caa0068cbbb0bef135ac155fcc09' THEN
    RAISE EXCEPTION 'Guarda: fn_motivo_papel_nao_atribuivel mudou desde 9/11/2026. Rever esta migration (refazer a partir do pg_get_functiondef vivo).';
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.fn_motivo_papel_nao_atribuivel(p_actor_auth uuid, p_org uuid, p_role uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r         public.anew_roles;
  v_actor   uuid;
  v_negadas text[];
  v_global  boolean;
BEGIN
  -- 20270106310000: NULL = pode; senão devolve o motivo (texto para o ecrã).
  IF p_actor_auth IS NULL THEN
    RETURN 'Sessão necessária para atribuir papéis';
  END IF;
  IF p_org IS NULL OR p_role IS NULL THEN
    RETURN 'A organização e o papel são obrigatórios';
  END IF;
  IF public.is_system_admin(p_actor_auth) THEN
    RETURN NULL;
  END IF;
  -- 20270112100000: administrador global (a regra de fn_sou_admin_global, para quem age). Fica isento da verificação das
  --   permissões e da de assinar contratos (como em fn_permissoes_que_nao_posso_dar), mas não das regras do papel de sistema
  --   nem da organização do papel (um super_admin continua a não poder dar system_admin).
  v_global := EXISTS (
    SELECT 1
    FROM public.anew_users u
    JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active'
    JOIN public.anew_roles gr ON gr.id = m.role_id
    WHERE u.auth_user_id = p_actor_auth
      AND u.deleted_at IS NULL
      AND gr.code IN ('super_admin', 'system_admin')
      AND gr.is_system = true
      AND gr.organization_id IS NULL
      AND gr.deleted_at IS NULL
  );

  SELECT * INTO r FROM public.anew_roles WHERE id = p_role;
  IF NOT FOUND OR r.deleted_at IS NOT NULL THEN
    RETURN 'Papel inexistente';
  END IF;

  SELECT u.id INTO v_actor
  FROM public.anew_users u
  WHERE u.auth_user_id = p_actor_auth AND u.deleted_at IS NULL
  LIMIT 1;
  IF v_actor IS NULL THEN
    RETURN 'Perfil de utilizador não encontrado';
  END IF;

  IF r.is_system IS TRUE OR r.organization_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.user_id = v_actor
        AND m.status = 'active'
        AND m.role_is_client IS NOT TRUE
        AND m.role_id = r.id
        AND m.organization_id IN (SELECT public.fn_org_e_ascendentes(p_org))
    ) THEN
      RETURN format('Só um administrador de sistema (ou quem já tem o papel %s nesta organização) pode atribuir este papel de sistema', r.code);
    END IF;
  ELSIF NOT (r.organization_id IN (SELECT public.fn_org_e_ascendentes(p_org))) THEN
    RETURN 'O papel pertence a outra organização';
  END IF;

  IF v_global THEN
    RETURN NULL;
  END IF;

  WITH minhas AS (
    SELECT DISTINCT rp2.permission_code
    FROM public.anew_memberships m
    JOIN public.anew_role_permissions rp2 ON rp2.role_id = m.role_id
    WHERE m.user_id = v_actor
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
      AND m.organization_id IN (SELECT public.fn_org_e_ascendentes(p_org))
  )
  SELECT COALESCE(array_agg(DISTINCT rp.permission_code ORDER BY rp.permission_code), ARRAY[]::text[])
  INTO v_negadas
  FROM public.anew_role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission_code NOT IN (SELECT permission_code FROM minhas)
    -- 20270112100000: como em fn_permissoes_que_nao_posso_dar (20270110600000) — o perfil de técnico de obra dá-se se quem dá
    --   já tem tudo o que o papel técnico do Negócio dá
    AND NOT (rp.permission_code = 'negocios.obra.tecnico'
             AND EXISTS (SELECT 1 FROM public.neg_papeis_permissoes t WHERE t.papel = 'tecnico')
             AND NOT EXISTS (SELECT 1 FROM public.neg_papeis_permissoes t
                             WHERE t.papel = 'tecnico'
                               AND NOT EXISTS (SELECT 1 FROM minhas mm WHERE mm.permission_code = t.permission_code)));
  IF COALESCE(array_length(v_negadas, 1), 0) > 0 THEN
    RETURN 'Não pode atribuir um papel com permissões que não tem: ' || array_to_string(v_negadas, ', ');
  END IF;

  IF r.can_sign_contracts IS TRUE AND NOT public.fn_pode_assinar_contratos(v_actor, p_org) THEN
    RETURN 'Só quem pode assinar contratos pode atribuir um papel que assina contratos';
  END IF;

  RETURN NULL;
END;
$function$;
