-- Fix: reject_proposal_atomic so atualizava proposals.status='rejected', nunca proposals.stage_id.
-- Como a lista interna de propostas (src/pages/Proposals.tsx, getProposalStage) prioriza o estagio
-- ligado por stage_id sobre o campo status, uma proposta rejeitada pelo portal publico ficava
-- visualmente presa no estagio antigo (normalmente "Rascunho"). Esta migracao resolve o estagio
-- "rejected"/"rejeitada" da organizacao (com fallback para o estagio global) e atualiza stage_id
-- a par de status, tal como ja acontece nas acoes manuais dentro da app (handleRejectProposal).
--
-- NAO APLICADA AINDA — aguarda "supabase db push" com aprovacao explicita do utilizador.

CREATE OR REPLACE FUNCTION public.reject_proposal_atomic(p_proposal_id uuid, p_public_token text, p_rejection_reason_code text, p_rejection_reason text, p_rejection_notes text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_proposal          proposals%ROWTYPE;
  v_deal_id           uuid;
  v_lost_stage_id     uuid;
  v_rejected_stage_id uuid;
  v_active_proposals  integer;
  v_accepted_quote    boolean;
  v_active_contract   boolean;
  v_lead_id           uuid;
BEGIN
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta nao encontrada'; END IF;

  IF p_public_token IS NOT NULL THEN
    IF v_proposal.public_token != p_public_token THEN
      RAISE EXCEPTION 'Token invalido';
    END IF;
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal.organization_id IS NOT NULL
       AND v_proposal.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
      RAISE EXCEPTION 'Sem permissao sobre esta proposta' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_proposal.status IN ('rejected', 'accepted') THEN
    RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'already_processed');
  END IF;

  SELECT id INTO v_rejected_stage_id FROM proposal_workflow_stages
    WHERE organization_id = v_proposal.organization_id AND is_active = true AND name IN ('rejected', 'rejeitada')
    LIMIT 1;
  IF v_rejected_stage_id IS NULL THEN
    SELECT id INTO v_rejected_stage_id FROM proposal_workflow_stages
      WHERE organization_id IS NULL AND is_active = true AND name IN ('rejected', 'rejeitada')
      LIMIT 1;
  END IF;

  UPDATE proposals SET status='rejected', stage_id=COALESCE(v_rejected_stage_id, stage_id), rejected_at=now(), rejection_reason_code=p_rejection_reason_code, rejection_reason=p_rejection_reason, rejection_notes=p_rejection_notes WHERE id = p_proposal_id;

  v_deal_id := v_proposal.deal_id;
  IF v_deal_id IS NULL THEN RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'no_deal'); END IF;

  SELECT COUNT(*) INTO v_active_proposals FROM proposals WHERE deal_id=v_deal_id AND id != p_proposal_id AND status NOT IN ('rejected','expired','cancelled') AND deleted_at IS NULL;
  IF v_active_proposals > 0 THEN RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'active_proposals_exist'); END IF;

  SELECT EXISTS(SELECT 1 FROM quotes WHERE deal_id=v_deal_id AND estado='aceite' AND deleted_at IS NULL) INTO v_accepted_quote;
  IF v_accepted_quote THEN RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'accepted_quote_exists'); END IF;

  SELECT EXISTS(SELECT 1 FROM client_contracts WHERE proposal_id=p_proposal_id AND status NOT IN ('cancelled','expired','terminated')) INTO v_active_contract;
  IF v_active_contract THEN RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'active_contract_exists'); END IF;

  SELECT id INTO v_lost_stage_id FROM deal_stages WHERE is_lost=true AND is_final=true LIMIT 1;
  IF v_lost_stage_id IS NOT NULL THEN
    UPDATE deals SET stage_id=v_lost_stage_id, closed_at=now(), updated_at=now() WHERE id = v_deal_id;
  END IF;

  SELECT lead_id INTO v_lead_id FROM pipeline_links WHERE deal_id=v_deal_id LIMIT 1;
  IF v_lead_id IS NOT NULL THEN
    UPDATE anew_leads SET status='lost', updated_at=now() WHERE id = v_lead_id;
  END IF;

  RETURN json_build_object('success', true, 'cascaded', true, 'deal_id', v_deal_id, 'lead_id', v_lead_id);
END;
$function$
;
