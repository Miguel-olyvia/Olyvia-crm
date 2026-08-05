-- Fix: trg_auto_proposal_from_quote's idempotency check only looked at
-- pipeline_links to decide whether a quote already has a proposal. A quote
-- can also be linked to a proposal directly via quotes.proposal_id (e.g. set
-- by rpc_create_proposal/rpc_update_proposal) without a matching
-- pipeline_links row. When such a quote was accepted, the trigger wrongly
-- concluded "no proposal yet" and created a brand-new duplicate proposal +
-- proposal_items, then pointed pipeline_links.proposal_id at the new one —
-- which trg_sync_quote_proposal_id (20261016010000) then propagated back onto
-- quotes.proposal_id, silently re-parenting the quote away from the real,
-- just-signed proposal (observed 2026-08-05 on proposal "teste olyvia").
--
-- Fix: also treat an already-set quotes.proposal_id as "already has a
-- proposal" and skip creation.

CREATE OR REPLACE FUNCTION auto_create_proposal_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage_id       uuid;
  v_entity_name    text;
  v_proposal_id    uuid;
  v_existing_link  uuid;
BEGIN
  -- Só dispara quando estado muda DE outro valor PARA 'aceite'
  IF NEW.estado IS DISTINCT FROM 'aceite' OR OLD.estado = 'aceite' THEN
    RETURN NEW;
  END IF;

  -- Idempotência: o próprio orçamento já está ligado a uma proposta?
  -- (quotes.proposal_id é a coluna dedicada/indexada — fonte de verdade
  -- mais direta; pipeline_links pode não ter sido criado por todos os
  -- caminhos que ligam um orçamento a uma proposta.)
  IF NEW.proposal_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotência: já existe proposta ligada a este orçamento via pipeline_links?
  SELECT proposal_id INTO v_existing_link
  FROM pipeline_links
  WHERE quote_id = NEW.id
    AND proposal_id IS NOT NULL
  LIMIT 1;

  IF v_existing_link IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Obter stage 'rascunho' das propostas
  SELECT id INTO v_stage_id
  FROM proposal_workflow_stages
  WHERE name IN ('rascunho', 'draft')
  ORDER BY CASE WHEN name = 'rascunho' THEN 0 ELSE 1 END
  LIMIT 1;

  -- Obter nome da entidade (via entity_id do orçamento, ou via deal se não tiver)
  IF NEW.entity_id IS NOT NULL THEN
    SELECT display_name INTO v_entity_name
    FROM anew_entities WHERE id = NEW.entity_id;
  END IF;

  IF v_entity_name IS NULL AND NEW.deal_id IS NOT NULL THEN
    SELECT e.display_name INTO v_entity_name
    FROM deals d
    JOIN anew_entities e ON e.id = d.entity_id
    WHERE d.id = NEW.deal_id AND d.deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Criar proposta
  INSERT INTO proposals (
    title,
    deal_id,
    organization_id,
    root_organization_id,
    created_by,
    entity_id,
    stage_id,
    status,
    value
  )
  VALUES (
    'Proposta - ' || COALESCE(v_entity_name, NEW.quote_number, 'Orçamento'),
    NEW.deal_id,
    NEW.organization_id,
    COALESCE(NEW.root_organization_id, NEW.organization_id),
    NEW.created_by,
    NEW.entity_id,
    v_stage_id,
    'draft',
    COALESCE(NEW.total, 0)
  )
  RETURNING id INTO v_proposal_id;

  -- Copiar linhas do orçamento para itens da proposta
  -- subtotal, vat_amount, total são colunas GERADAS (quantity*unit_price) — não inserir
  -- unit_price = total_sem_iva / qt para que os totais gerados coincidam com o orçamento
  INSERT INTO proposal_items (
    proposal_id,
    description,
    quantity,
    unit_price,
    vat_rate,
    sort_order
  )
  SELECT
    v_proposal_id,
    COALESCE(ql.descricao_snapshot, ''),
    COALESCE(ql.qt, 1),
    CASE
      WHEN COALESCE(ql.qt, 0) > 0 THEN COALESCE(ql.total_sem_iva, 0) / ql.qt
      ELSE COALESCE(ql.custo_material_unit, 0)
    END,
    COALESCE(ql.iva_percent, 23),
    COALESCE(ql.ordem, 0)
  FROM quote_lines ql
  WHERE ql.quote_id = NEW.id
  ORDER BY ql.ordem;

  -- Actualizar pipeline_links: tentar ligar à entrada existente, senão criar nova
  UPDATE pipeline_links
  SET proposal_id = v_proposal_id
  WHERE quote_id = NEW.id AND status = 'active';

  IF NOT FOUND THEN
    INSERT INTO pipeline_links (quote_id, deal_id, proposal_id, organization_id, root_organization_id, status)
    VALUES (NEW.id, NEW.deal_id, v_proposal_id, NEW.organization_id, COALESCE(NEW.root_organization_id, NEW.organization_id), 'active');
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[auto_create_proposal_from_quote] falhou para orçamento %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
