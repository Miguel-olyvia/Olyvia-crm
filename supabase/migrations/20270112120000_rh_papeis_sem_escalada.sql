-- ============================================================
-- 20270112120000 — rh_papeis_sem_escalada
-- ============================================================
-- O que faz: rh_guardar_papeis_pessoa só pedia hr.pessoas.laborais.edit. Quem gere pessoas no RH (ex.: Helena, teste_rh_gestao)
--   dava a si própria o papel 'direcao' no Negócio e ganhava negocios.margem.aprovar, client_contracts.cancel, purchase_orders.approve…
--   (auditoria rh/24 e admin/10 T1). O Papel no Negócio continua a dar permissões (decisão do utilizador); só se fecha a escalada:
--     (a) não se pode mudar os papéis da pessoa ligada à própria conta (pessoas_contas não revogada), como
--         rpc_finalize_user_profile_full faz («Não pode atribuir papéis a si próprio»). Gravar a lista sem mudanças continua a passar;
--     (b) para cada papel ACRESCENTADO (não os que a pessoa já tinha, nem as remoções), quem dá tem de ter pelo PERFIL
--         (has_anew_permission_in_org_or_ancestor — associações ativas não-cliente nesta organização ou acima, a mesma base de
--         fn_permissoes_que_nao_posso_dar; não conta o que vem dos próprios papéis no Negócio) todas as permissões que esse papel dá
--         em neg_papeis_permissoes. A mensagem lista as permissões em falta por papel.
--   Administrador de sistema (is_system_admin_user) e administrador global (fn_sou_admin_global) ficam isentos de (a) e (b).
--   A verificação de hr.pessoas.laborais.edit, a validação dos papéis e a escrita ficam iguais.
--
-- CREATE OR REPLACE a partir do pg_get_functiondef vivo (base RH uetjghdkwbywbftedtth, 9/11/2026; guarda md5 abaixo).
--   Grants/SECURITY DEFINER/search_path iguais. Reversão (só como migration nova): repor o texto vivo (md5 5f79fde9…).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.rh_guardar_papeis_pessoa(uuid,uuid,text[])'::regprocedure)) <> '5f79fde9a28130c434021c22ee3517e8' THEN
    RAISE EXCEPTION 'Guarda: rh_guardar_papeis_pessoa mudou desde 9/11/2026. Rever esta migration (refazer a partir do pg_get_functiondef vivo).';
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.rh_guardar_papeis_pessoa(p_org uuid, p_pessoa uuid, p_papeis text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid; v_papeis text[] := coalesce(p_papeis, '{}');
  v_isento boolean; v_mudou boolean; v_falta text;
BEGIN
  v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_papeis) k WHERE k NOT IN ('comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico')) THEN
    RAISE EXCEPTION 'Papel inválido.' USING ERRCODE = 'CT002';
  END IF;

  -- 20270112120000: sem escalada pelo Papel no Negócio (ver cabeçalho da migration)
  v_isento := public.is_system_admin_user(auth.uid()) OR public.fn_sou_admin_global();
  IF NOT v_isento THEN
    v_mudou := EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp
                       WHERE pp.pessoa_id = p_pessoa AND pp.organization_id = p_org AND NOT (pp.papel = ANY (v_papeis)))
            OR EXISTS (SELECT 1 FROM unnest(v_papeis) k
                       WHERE NOT EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp
                                         WHERE pp.pessoa_id = p_pessoa AND pp.organization_id = p_org AND pp.papel = k));
    IF v_mudou AND EXISTS (
         SELECT 1 FROM pessoas_contas pc
         JOIN anew_users u ON u.id = pc.anew_user_id
         WHERE pc.pessoa_id = p_pessoa AND pc.revogada_em IS NULL AND u.auth_user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Não pode alterar os seus próprios papéis no Negócio.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT string_agg(f.papel || ' (' || f.perms || ')', '; ' ORDER BY f.papel) INTO v_falta
    FROM (
      SELECT k AS papel, string_agg(npp.permission_code, ', ' ORDER BY npp.permission_code) AS perms
      FROM (SELECT DISTINCT k FROM unnest(v_papeis) k) n
      JOIN neg_papeis_permissoes npp ON npp.papel = n.k
      WHERE NOT EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp
                        WHERE pp.pessoa_id = p_pessoa AND pp.organization_id = p_org AND pp.papel = n.k)
        AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), npp.permission_code, p_org)
      GROUP BY k
    ) f;
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Não pode dar um papel no Negócio com permissões que o seu perfil não tem: %.', v_falta
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  DELETE FROM pessoas_papeis_negocio WHERE pessoa_id = p_pessoa AND organization_id = p_org AND NOT (papel = ANY (v_papeis));
  INSERT INTO pessoas_papeis_negocio (organization_id, pessoa_id, papel, created_by)
    SELECT DISTINCT p_org, p_pessoa, k, v_user FROM unnest(v_papeis) k
  ON CONFLICT (pessoa_id, papel) DO NOTHING;
END $function$;
