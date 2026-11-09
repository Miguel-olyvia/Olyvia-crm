-- ============================================================
-- 20270112220000 leads_assign_na_org (correções do bloco B da auditoria de permissões, B3 / Negócios F10)
-- ============================================================
-- Problema: neg_atribuir_pessoa pedia leads.assign com has_anew_permission(uid, 'leads.assign'), que não olha à organização: com
--   várias organizações (produção), quem tem leads.assign numa organização atribuía o comercial das leads de outra onde só tem
--   pessoas.edit. Na BD do ramo só há uma organização: risco pelo código.
-- Correção: fn_neg_tem_permissao_org(p_organization_id, 'leads.assign') (a permissão nesta organização ou numa acima), o mesmo que
--   o gatilho fn_negocios_dono_para_pessoa já usa para a mesma permissão. O resto da função fica igual (texto vivo de 9/11/2026,
--   incluindo as quebras de linha CRLF do corpo).
-- Sem tabelas nem colunas novas. Grants, SECURITY DEFINER e search_path iguais.
-- Reversão (só como migration nova): repor has_anew_permission(v_uid, 'leads.assign').
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.neg_atribuir_pessoa(uuid,uuid,uuid)'::regprocedure)) <> '87fc2a837ad5e35da7d813542613f55b' THEN
    RAISE EXCEPTION 'neg_atribuir_pessoa mudou desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_neg_tem_permissao_org(uuid,text)'::regprocedure)) <> '951421b6f7b3b06fa47f3b290f6477ef' THEN
    RAISE EXCEPTION 'fn_neg_tem_permissao_org mudou desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.neg_atribuir_pessoa(p_organization_id uuid, p_entity_id uuid, p_assigned_to uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_cliente boolean;
  v_atual   uuid;
  v_outras  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: organização ou pessoa.' USING ERRCODE = 'NG009';
  END IF;
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = p_assigned_to
         AND m.organization_id = p_organization_id
         AND m.status = 'active'
         AND m.role_is_client IS NOT TRUE) THEN
    RAISE EXCEPTION 'O responsável tem de ser membro activo da organização.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT e.client_since IS NOT NULL, e.assigned_to
    INTO v_cliente, v_atual
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 20270112220000: leads.assign nesta organização (ou numa acima), como fn_negocios_dono_para_pessoa; antes contava em qualquer uma
  IF NOT v_cliente AND NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.assign') THEN
    RAISE EXCEPTION 'Sem permissão para atribuir esta lead.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_atual IS NOT DISTINCT FROM p_assigned_to THEN
    RETURN jsonb_build_object('mudou', false, 'assigned_to', v_atual, 'outras_visitas', '[]'::jsonb);
  END IF;

  UPDATE public.anew_entities e
  SET assigned_to = p_assigned_to,
      updated_at  = now()
  WHERE e.id = p_entity_id;

  IF p_assigned_to IS NOT NULL THEN
    v_outras := public.fn_owner_sync_apply('entity', p_entity_id, p_organization_id,
                                           v_atual, p_assigned_to, NULL::uuid);
  END IF;

  RETURN jsonb_build_object('mudou', true, 'assigned_to', p_assigned_to,
                            'outras_visitas', to_jsonb(COALESCE(v_outras, ARRAY[]::uuid[])));
END;
$function$;
