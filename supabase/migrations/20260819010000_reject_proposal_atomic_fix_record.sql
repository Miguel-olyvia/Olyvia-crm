-- Registo (record-only): fix do bypass de token nulo em reject_proposal_atomic (Slide 30) e search_path em ambas (Slide 31).
-- Ja aplicado diretamente na BD nesta sessao; este ficheiro so evita schema drift num futuro supabase db reset.

-- === auto_create_proposal_from_quote ===
CREATE OR REPLACE FUNCTION public.auto_create_proposal_from_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stage_id uuid; v_entity_name text; v_proposal_id uuid; v_existing_link uuid;
BEGIN
  IF NEW.estado IS DISTINCT FROM 'aceite' OR OLD.estado = 'aceite' THEN RETURN NEW; END IF;
  SELECT proposal_id INTO v_existing_link FROM pipeline_links WHERE quote_id=NEW.id AND proposal_id IS NOT NULL LIMIT 1;
  IF v_existing_link IS NOT NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_stage_id FROM proposal_workflow_stages WHERE name IN ('rascunho','draft') ORDER BY CASE WHEN name='rascunho' THEN 0 ELSE 1 END LIMIT 1;
  IF NEW.entity_id IS NOT NULL THEN SELECT display_name INTO v_entity_name FROM anew_entities WHERE id=NEW.entity_id; END IF;
  IF v_entity_name IS NULL AND NEW.deal_id IS NOT NULL THEN
    SELECT e.display_name INTO v_entity_name FROM deals d JOIN anew_entities e ON e.id=d.entity_id WHERE d.id=NEW.deal_id AND d.deleted_at IS NULL LIMIT 1;
  END IF;
  INSERT INTO proposals (title, deal_id, organization_id, root_organization_id, created_by, entity_id, stage_id, status, value)
  VALUES ('Proposta - ' || COALESCE(v_entity_name, NEW.quote_number, 'Orçamento'), NEW.deal_id, NEW.organization_id, COALESCE(NEW.root_organization_id, NEW.organization_id), NEW.created_by, NEW.entity_id, v_stage_id, 'draft', COALESCE(NEW.total,0))
  RETURNING id INTO v_proposal_id;
  INSERT INTO proposal_items (proposal_id, description, quantity, unit_price, vat_rate, sort_order)
  SELECT v_proposal_id, COALESCE(ql.descricao_snapshot,''), COALESCE(ql.qt,1),
    CASE WHEN COALESCE(ql.qt,0)>0 THEN COALESCE(ql.total_sem_iva,0)/ql.qt ELSE COALESCE(ql.custo_material_unit,0) END,
    COALESCE(ql.iva_percent,23), COALESCE(ql.ordem,0)
  FROM quote_lines ql WHERE ql.quote_id=NEW.id ORDER BY ql.ordem;
  INSERT INTO proposal_items (proposal_id, description, quantity, unit_price, vat_rate, sort_order)
  SELECT v_proposal_id, COALESCE(sft.name,'Taxa de Serviço'), 1, qf.calculated_value, COALESCE(qf.vat_rate,23), 1000 + ROW_NUMBER() OVER (ORDER BY qf.created_at)
  FROM quote_fees qf LEFT JOIN service_fee_types sft ON sft.id=qf.fee_type_id WHERE qf.quote_id=NEW.id;
  UPDATE pipeline_links SET proposal_id=v_proposal_id WHERE quote_id=NEW.id AND status='active';
  IF NOT FOUND THEN
    INSERT INTO pipeline_links (quote_id, deal_id, proposal_id, organization_id, root_organization_id, status)
    VALUES (NEW.id, NEW.deal_id, v_proposal_id, NEW.organization_id, COALESCE(NEW.root_organization_id, NEW.organization_id), 'active');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[auto_create_proposal_from_quote] falhou para orçamento %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$
;

-- === reject_proposal_atomic ===
CREATE OR REPLACE FUNCTION public.reject_proposal_atomic(p_proposal_id uuid, p_public_token text, p_rejection_reason_code text, p_rejection_reason text, p_rejection_notes text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_proposal         proposals%ROWTYPE;
  v_deal_id          uuid;
  v_lost_stage_id    uuid;
  v_active_proposals integer;
  v_accepted_quote   boolean;
  v_active_contract  boolean;
  v_lead_id          uuid;
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

  UPDATE proposals SET status='rejected', rejected_at=now(), rejection_reason_code=p_rejection_reason_code, rejection_reason=p_rejection_reason, rejection_notes=p_rejection_notes WHERE id = p_proposal_id;

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

REVOKE ALL ON FUNCTION public.reject_proposal_atomic(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_proposal_atomic(uuid, text, text, text, text) TO anon, authenticated, service_role;
