-- P5: Rejeicao de proposta atomica com cascata condicional
-- Cobre os 3 caminhos: portal publico, OTP e portal autenticado
-- SECURITY DEFINER necessario para escrever em deals/leads a partir do portal publico

CREATE OR REPLACE FUNCTION reject_proposal_atomic(
  p_proposal_id           uuid,
  p_public_token          text,
  p_rejection_reason_code text,
  p_rejection_reason      text,
  p_rejection_notes       text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal         proposals%ROWTYPE;
  v_deal_id          uuid;
  v_lost_stage_id    uuid;
  v_active_proposals integer;
  v_accepted_quote   boolean;
  v_active_contract  boolean;
  v_lead_id          uuid;
BEGIN
  -- 1. Buscar proposta
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta nao encontrada';
  END IF;

  -- 2. Validar token publico (se fornecido; NULL = chamada autenticada)
  IF p_public_token IS NOT NULL AND v_proposal.public_token != p_public_token THEN
    RAISE EXCEPTION 'Token invalido';
  END IF;

  -- 3. Idempotencia: se ja processada, retornar sem erro
  IF v_proposal.status IN ('rejected', 'accepted') THEN
    RETURN json_build_object(
      'success',  true,
      'cascaded', false,
      'reason',   'already_processed'
    );
  END IF;

  -- 4. Rejeitar a proposta
  UPDATE proposals SET
    status                = 'rejected',
    rejected_at           = now(),
    rejection_reason_code = p_rejection_reason_code,
    rejection_reason      = p_rejection_reason,
    rejection_notes       = p_rejection_notes
  WHERE id = p_proposal_id;

  -- 5. Avaliar cascata ao deal
  v_deal_id := v_proposal.deal_id;
  IF v_deal_id IS NULL THEN
    RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'no_deal');
  END IF;

  -- 5a. Existem outras propostas activas para este deal?
  SELECT COUNT(*) INTO v_active_proposals
  FROM proposals
  WHERE deal_id  = v_deal_id
    AND id      != p_proposal_id
    AND status  NOT IN ('rejected', 'expired', 'cancelled')
    AND deleted_at IS NULL;

  IF v_active_proposals > 0 THEN
    RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'active_proposals_exist');
  END IF;

  -- 5b. Existe orcamento aceite para este deal?
  SELECT EXISTS(
    SELECT 1 FROM quotes
    WHERE deal_id = v_deal_id AND estado = 'aceite' AND deleted_at IS NULL
  ) INTO v_accepted_quote;

  IF v_accepted_quote THEN
    RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'accepted_quote_exists');
  END IF;

  -- 5c. Existe contrato activo ligado directamente a esta proposta?
  SELECT EXISTS(
    SELECT 1 FROM client_contracts
    WHERE proposal_id = p_proposal_id
      AND status NOT IN ('cancelled', 'expired', 'terminated')
  ) INTO v_active_contract;

  IF v_active_contract THEN
    RETURN json_build_object('success', true, 'cascaded', false, 'reason', 'active_contract_exists');
  END IF;

  -- 6. Desqualificar o deal (usar is_lost=true, robusto a nomes customizados)
  SELECT id INTO v_lost_stage_id
  FROM deal_stages
  WHERE is_lost = true AND is_final = true
  LIMIT 1;

  IF v_lost_stage_id IS NOT NULL THEN
    UPDATE deals SET
      stage_id   = v_lost_stage_id,
      closed_at  = now(),
      updated_at = now()
    WHERE id = v_deal_id;
  END IF;

  -- 7. Marcar lead como perdida via pipeline_links
  SELECT lead_id INTO v_lead_id
  FROM pipeline_links
  WHERE deal_id = v_deal_id
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    UPDATE anew_leads SET
      status     = 'lost',
      updated_at = now()
    WHERE id = v_lead_id;
  END IF;

  RETURN json_build_object(
    'success',  true,
    'cascaded', true,
    'deal_id',  v_deal_id,
    'lead_id',  v_lead_id
  );
END;
$$;
