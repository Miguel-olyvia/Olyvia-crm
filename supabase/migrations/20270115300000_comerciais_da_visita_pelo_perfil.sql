-- Comerciais da visita pelo perfil (12/11/2026, decisão do utilizador).
--
-- A lista «Comerciais a <dia>» ao marcar a visita (QuemPodeIrVisita.tsx) filtra os
-- recursos da agenda cujo papel inclui 'comercial'. Até aqui esse 'comercial' vinha do
-- Papel no Negócio (pessoas_papeis_negocio), que também mexia nas permissões; a lista
-- passa a seguir o PERFIL: um recurso é 'comercial' quando o perfil do utilizador na
-- organização (anew_memberships -> anew_role_permissions) tem negocios.visita.preencher.
--
-- - 'comercial' vindo de pessoas_papeis_negocio deixa de contar.
-- - Os outros papéis do Papel no Negócio (operacoes, armazem, financeiro, ...) continuam a
--   ser devolvidos como antes (o frontend só usa 'comercial' e 'tecnico').
-- - 'tecnico' fica igual (fn_rh_pessoa_tecnico_obra: cargo técnico de obra ou perfil).
-- - Continua a devolver só recursos com ficha RH ativa (pessoas_contas), como antes.
-- - schedule_resources.user_id é anew_users.id; a permissão é verificada pelo auth uid
--   desse utilizador (has_anew_permission_in_org), não por quem chama a função.
-- Mantém SECURITY DEFINER, search_path, a exigência de pessoas.view e os grants.

CREATE OR REPLACE FUNCTION public.neg_papeis_dos_recursos(p_org uuid)
 RETURNS TABLE(resource_id uuid, papeis text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN QUERY
    WITH contas AS (
      SELECT DISTINCT ON (r.id) r.id AS recurso, r.user_id AS utilizador, pc.pessoa_id AS pessoa
        FROM schedule_resources r
        JOIN pessoas_contas pc ON pc.anew_user_id = r.user_id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
        JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
       WHERE r.organization_id = p_org AND r.resource_type = 'user' AND r.user_id IS NOT NULL AND r.is_active IS NOT FALSE
       ORDER BY r.id, pc.ligada_em DESC NULLS LAST
    )
    SELECT c.recurso, coalesce((
      SELECT array_agg(DISTINCT x ORDER BY x) FROM (
        SELECT pp.papel AS x FROM pessoas_papeis_negocio pp
         WHERE pp.pessoa_id = c.pessoa AND pp.organization_id = p_org AND pp.papel <> 'comercial' -- 20270115300000: comercial vem do perfil
        UNION
        SELECT 'comercial' FROM anew_users u
         WHERE u.id = c.utilizador AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.visita.preencher', p_org)
        UNION
        SELECT 'tecnico' WHERE public.fn_rh_pessoa_tecnico_obra(p_org, c.pessoa) -- 20270110600000: cargo ou perfil
      ) s), '{}')
      FROM contas c;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_papeis_dos_recursos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_papeis_dos_recursos(uuid) TO authenticated, service_role;
