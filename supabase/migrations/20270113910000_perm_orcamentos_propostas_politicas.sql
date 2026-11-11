-- 11/11/2026 — Correções da auditoria «campos sem permissão» (Área 2, políticas).
-- Só aperta a escrita em falta. As leituras não mudam (cada tabela tem a sua política de SELECT própria).
--  1. proposal_workflow_stages: criar/editar/desativar etapas → proposals.manage na organização (o ecrã já pede proposals.manage).
--  2. proposal_stage_actions: criar/editar/apagar ações por etapa → proposals.manage (o mesmo do ecrã).
--     neg_guardar_cadeia (SECURITY DEFINER) não passa pela RLS e continua igual.
--  3. proposal_rejection_reasons: criar motivo → quem pode recusar (proposals.edit, proposals.manage ou, numa organização com
--     negócios, negocios.proposta.decidir por perfil/Papel); editar/apagar motivos → proposals.manage.
--  4. proposal_sends (INSERT): registar um envio → quem pode enviar a proposta (fn_pode_enviar_documento, migração 20270113900000).
--     O registo do WhatsApp (channel = 'whatsapp', useWhatsApp.ts) continua aberto a quem vê a organização, como hoje.
-- Partiu das políticas vivas (md5 de USING|WITH CHECK abaixo); aborta se mudaram entretanto.
DO $g$
DECLARE
  v_esperado jsonb := jsonb_build_object(
    'proposal_workflow_stages|Company admins can manage proposal workflow stages', '3ba3c5a26253c35b3cb21e1ebcb881fa',
    'proposal_stage_actions|anew_insert_proposal_stage_actions', '1cf68257d36113bd2b81dc79a8e3798d',
    'proposal_stage_actions|anew_update_proposal_stage_actions', 'f2dbafe54f6168753d05035ba797f9b3',
    'proposal_stage_actions|anew_delete_proposal_stage_actions', 'f2dbafe54f6168753d05035ba797f9b3',
    'proposal_rejection_reasons|auth_insert_proposal_rejection_reasons', '1cf68257d36113bd2b81dc79a8e3798d',
    'proposal_rejection_reasons|auth_update_proposal_rejection_reasons', 'f2dbafe54f6168753d05035ba797f9b3',
    'proposal_rejection_reasons|auth_delete_proposal_rejection_reasons', 'f2dbafe54f6168753d05035ba797f9b3',
    'proposal_sends|org_insert_proposal_sends', '1cf68257d36113bd2b81dc79a8e3798d');
  k text; v_md5 text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(v_esperado) LOOP
    SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
    FROM pg_policies WHERE schemaname = 'public' AND tablename = split_part(k, '|', 1) AND policyname = split_part(k, '|', 2);
    IF v_md5 IS DISTINCT FROM v_esperado ->> k THEN
      RAISE EXCEPTION 'Política % mudou desde a leitura; rever antes de aplicar', k;
    END IF;
  END LOOP;
END $g$;

-- 1. Etapas do workflow de propostas
ALTER POLICY "Company admins can manage proposal workflow stages" ON public.proposal_workflow_stages
  USING ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id))
  WITH CHECK ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id));

-- 2. Ações por etapa
ALTER POLICY anew_insert_proposal_stage_actions ON public.proposal_stage_actions
  WITH CHECK ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id));
ALTER POLICY anew_update_proposal_stage_actions ON public.proposal_stage_actions
  USING ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id));
ALTER POLICY anew_delete_proposal_stage_actions ON public.proposal_stage_actions
  USING ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id));

-- 3. Motivos de recusa
ALTER POLICY auth_insert_proposal_rejection_reasons ON public.proposal_rejection_reasons
  WITH CHECK ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND (public.has_anew_permission_for_org(auth.uid(), 'proposals.edit', organization_id)
              OR public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id)
              OR public.fn_cat_pode(organization_id, 'negocios.proposta.decidir')));
ALTER POLICY auth_update_proposal_rejection_reasons ON public.proposal_rejection_reasons
  USING ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id));
ALTER POLICY auth_delete_proposal_rejection_reasons ON public.proposal_rejection_reasons
  USING ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND public.has_anew_permission_for_org(auth.uid(), 'proposals.manage', organization_id));

-- 4. Registo de envios de propostas
ALTER POLICY org_insert_proposal_sends ON public.proposal_sends
  WITH CHECK ((organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
         AND (channel = 'whatsapp' OR public.fn_pode_enviar_documento('proposal', proposal_id)));
