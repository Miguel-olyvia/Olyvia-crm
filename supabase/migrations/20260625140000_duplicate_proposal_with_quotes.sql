-- =============================================================================
-- duplicate_proposal — clonar quotes + lines + fees ligados à proposta
-- Problema: quotes ligados via quotes.proposal_id não eram copiados.
-- Decisão: cada duplicado fica com cópias independentes (estado=rascunho).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.duplicate_proposal(
  source_proposal_id uuid,
  new_title text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_proposal_id    uuid;
  source_proposal    public.proposals%ROWTYPE;
  default_stage_id   uuid;
  v_business_user_id uuid;
  source_quote       public.quotes%ROWTYPE;
  new_quote_id       uuid;
BEGIN
  -- Resolver utilizador de negócio actual
  v_business_user_id := public.current_business_user_id();
  IF v_business_user_id IS NULL THEN
    RAISE EXCEPTION 'Business user not found for current auth user';
  END IF;

  -- Carregar proposta original
  SELECT * INTO source_proposal
  FROM public.proposals
  WHERE id = source_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- Primeiro stage activo da org (fallback para global)
  SELECT id INTO default_stage_id
  FROM public.proposal_workflow_stages
  WHERE (company_id = source_proposal.organization_id OR company_id IS NULL)
    AND is_active = true
  ORDER BY company_id NULLS LAST, stage_order
  LIMIT 1;

  -- ── 1. Criar nova proposta ────────────────────────────────────────────────
  INSERT INTO public.proposals (
    deal_id, title, description, value, status, valid_until,
    document_url, notes, created_by, company_id, client_id,
    organization_id, root_organization_id, entity_id,
    currency, stage_id, request_date
  )
  VALUES (
    source_proposal.deal_id,
    COALESCE(new_title, source_proposal.title || ' (Cópia)'),
    source_proposal.description,
    source_proposal.value,
    'draft',
    source_proposal.valid_until,
    NULL,
    source_proposal.notes,
    v_business_user_id,
    source_proposal.company_id,
    source_proposal.client_id,
    source_proposal.organization_id,
    source_proposal.root_organization_id,
    source_proposal.entity_id,
    source_proposal.currency,
    default_stage_id,
    NULL
  )
  RETURNING id INTO new_proposal_id;

  -- ── 2. Copiar proposal_items ──────────────────────────────────────────────
  INSERT INTO public.proposal_items (
    proposal_id, description, quantity, unit_price, vat_rate,
    subtotal, vat_amount, total, sort_order
  )
  SELECT
    new_proposal_id, description, quantity, unit_price, vat_rate,
    subtotal, vat_amount, total, sort_order
  FROM public.proposal_items
  WHERE proposal_id = source_proposal_id;

  -- ── 3. Copiar proposal_manual_items ──────────────────────────────────────
  INSERT INTO public.proposal_manual_items (
    proposal_id, description, quantity, unit_price, total, sort_order, notes
  )
  SELECT
    new_proposal_id, description, quantity, unit_price, total, sort_order, notes
  FROM public.proposal_manual_items
  WHERE proposal_id = source_proposal_id;

  -- ── 4. Clonar quotes ligadas via quotes.proposal_id ───────────────────────
  FOR source_quote IN
    SELECT * FROM public.quotes
    WHERE proposal_id = source_proposal_id
  LOOP
    -- 4a. Inserir quote clonada
    -- quote_number omitido: trigger trigger_set_quote_number gera automaticamente
    INSERT INTO public.quotes (
      proposal_id, estado, created_by,
      cliente_id, business_unit_id, obra_endereco, obra_notas, modelo_base,
      desconto_global_percent, moeda,
      organization_id, root_organization_id, entity_id,
      title, template_id,
      subtotal, total_fees, total,
      assigned_to
    )
    VALUES (
      new_proposal_id,
      'rascunho',
      v_business_user_id,
      source_quote.cliente_id,
      source_quote.business_unit_id,
      source_quote.obra_endereco,
      source_quote.obra_notas,
      source_quote.modelo_base,
      source_quote.desconto_global_percent,
      source_quote.moeda,
      source_quote.organization_id,
      source_quote.root_organization_id,
      source_quote.entity_id,
      source_quote.title,
      source_quote.template_id,
      source_quote.subtotal,
      source_quote.total_fees,
      source_quote.total,
      source_quote.assigned_to
    )
    RETURNING id INTO new_quote_id;

    -- 4b. Copiar quote_lines (todos os campos funcionais)
    INSERT INTO public.quote_lines (
      quote_id,
      catalog_item_id, categoria, descricao_snapshot,
      qt, custo_material_unit, custo_mao_obra_unit,
      margem_percent, iva_percent, int_percent,
      total_sem_iva, total_com_iva, total_com_desconto,
      ordem, selected_attributes,
      section_name, item_description, unidade, cost_price
    )
    SELECT
      new_quote_id,
      catalog_item_id, categoria, descricao_snapshot,
      qt, custo_material_unit, custo_mao_obra_unit,
      margem_percent, iva_percent, int_percent,
      total_sem_iva, total_com_iva, total_com_desconto,
      ordem, selected_attributes,
      section_name, item_description, unidade, cost_price
    FROM public.quote_lines
    WHERE quote_id = source_quote.id;

    -- 4c. Copiar quote_fees
    INSERT INTO public.quote_fees (
      quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
    )
    SELECT
      new_quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
    FROM public.quote_fees
    WHERE quote_id = source_quote.id;

    -- 4d. Replicar proposal_quote_selections apontando para o novo quote_id
    IF EXISTS (
      SELECT 1 FROM public.proposal_quote_selections
      WHERE proposal_id = source_proposal_id AND quote_id = source_quote.id
    ) THEN
      INSERT INTO public.proposal_quote_selections (proposal_id, quote_id, selected, selected_at)
      VALUES (new_proposal_id, new_quote_id, true, now())
      ON CONFLICT DO NOTHING;
    END IF;

    -- 4e. Log do quote clonado
    INSERT INTO public.entity_change_log (
      entity_type, entity_id, company_id, action, changed_by, metadata
    )
    VALUES (
      'quote', new_quote_id, source_quote.organization_id, 'duplicate',
      v_business_user_id,
      jsonb_build_object('source_id', source_quote.id, 'source_proposal_id', source_proposal_id)
    );
  END LOOP;

  -- ── 5. Log da proposta duplicada ─────────────────────────────────────────
  INSERT INTO public.entity_change_log (
    entity_type, entity_id, company_id, action, changed_by, metadata
  )
  VALUES (
    'proposal', new_proposal_id, source_proposal.organization_id, 'duplicate',
    v_business_user_id,
    jsonb_build_object('source_id', source_proposal_id)
  );

  RETURN new_proposal_id;
END;
$$;
