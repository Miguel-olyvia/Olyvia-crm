-- ============================================================================
-- Gravação das linhas passa a persistir a unidade (uom_id)
--
-- Redefine (a partir da versão VIVA, pg_get_functiondef de 23/09/2026; só se
-- acrescenta a coluna uom_id aos INSERTs, sem mudar assinaturas):
--   public.rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
--       p_lines[].uom_id e p_inline_quotes[].lines[].uom_id
--   public.rpc_create_purchase_order(uuid,jsonb,jsonb)
--   public.rpc_update_purchase_order(uuid,jsonb,jsonb)
--       p_items[].uom_id, p_items[].supplier_sku (se vier vazio, snapshot da
--       ligação item_suppliers do fornecedor da encomenda na mesma unidade)
--   public.rpc_create_manual_client_order(uuid,jsonb,jsonb)   p_items[].uom_id
--   public.rpc_duplicate_quote_insert(uuid,text,jsonb,jsonb,jsonb) p_lines[].uom_id
--       (a edge function duplicate-quote já envia as linhas com select('*'))
--   public.fn_proposals_persist_relations(...)  linhas de orçamentos inline
--   public.rpc_create_direct_sale_order(uuid)   copia direct_sale_lines.uom_id
--
-- units_per_uom NUNCA é lido do payload: é calculado no servidor pelos
-- gatilhos trg_*_units_per_uom (20261204202500) e fica como snapshot.
-- `unidade` (texto) é alinhada com o código da uom quando há uom_id.
--
-- NÃO altera: public.duplicate_quote(uuid) — função legada, já hoje partida
-- (referencia colunas inexistentes: produto_id, qty, preco_unitario_*...) e
-- sem uso em src/ nem em edge functions; fica como está.
-- direct_sale_lines é escrita DIRETAMENTE pelo frontend (DirectSaleEditor.tsx,
-- insert/delete sem RPC): basta enviar uom_id no insert; o gatilho trata do resto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_save_quote(p_quote_id uuid, p_quote_data jsonb, p_lines jsonb, p_fees jsonb, p_totals jsonb, p_inline_quotes jsonb DEFAULT '[]'::jsonb, p_diagnostic_suggestions jsonb DEFAULT '[]'::jsonb)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_saved_id     uuid;
  v_org_id       uuid;
  v_before       public.quotes;
  v_after        public.quotes;
  v_quote        public.quotes;
  v_entity_id    uuid;
  v_proposal_id  uuid;
  v_deal_id      uuid;
  v_root_org_id  uuid;
  v_line         jsonb;
  v_line_idx     bigint;
  v_line_id      uuid;
  v_suggestion   jsonb;
  v_fee          jsonb;
  v_existing_link uuid;
  v_link_op      text;           -- 'update' | 'insert' | NULL
  v_link_id      uuid;
  v_proposal_val numeric;
  v_proposal_old numeric;

  -- inline-quote locals
  v_iq           jsonb;
  v_iq_data      jsonb;
  v_iq_line      jsonb;
  v_iq_id        uuid;
  v_iq_ids       uuid[] := ARRAY[]::uuid[];

  -- diff accumulators
  v_diff         jsonb := '{}'::jsonb;
  v_quote_diff   jsonb := '{}'::jsonb;
  v_key          text;
  v_new_json     jsonb;
  v_old_json     jsonb;
  v_editable_cols text[] := ARRAY[
    'deal_id','cliente_id','organization_id','root_organization_id','entity_id',
    'title','obra_notas','modelo_base','desconto_global_percent','estado',
    'validade_dias','iva_rate','client_notes','conditions','proposal_id',
    'assigned_to','template_id'
  ];
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve target org from the incoming payload ──────────────────────────
  v_org_id      := nullif(p_quote_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_quote_data ->> 'root_organization_id', '')::uuid;
  v_entity_id   := nullif(p_quote_data ->> 'entity_id', '')::uuid;
  v_proposal_id := nullif(p_quote_data ->> 'proposal_id', '')::uuid;
  v_deal_id     := nullif(p_quote_data ->> 'deal_id', '')::uuid;

  -- ── Authorization parity with quotes RLS: org must be in caller's scope ───
  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. quotes: INSERT (new) or UPDATE metadata (edit)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    INSERT INTO public.quotes (
      deal_id, cliente_id, organization_id, root_organization_id, entity_id,
      title, obra_notas, modelo_base, desconto_global_percent, estado,
      validade_dias, iva_rate, client_notes, conditions, proposal_id,
      assigned_to, template_id, created_by
    )
    VALUES (
      v_deal_id,
      nullif(p_quote_data ->> 'cliente_id', '')::uuid,
      v_org_id,
      v_root_org_id,
      v_entity_id,
      nullif(p_quote_data ->> 'title', ''),
      p_quote_data ->> 'obra_notas',
      p_quote_data ->> 'modelo_base',
      COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
      COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
      (p_quote_data ->> 'validade_dias')::integer,
      (p_quote_data ->> 'iva_rate')::numeric,
      nullif(p_quote_data ->> 'client_notes', ''),
      nullif(p_quote_data ->> 'conditions', ''),
      v_proposal_id,
      nullif(p_quote_data ->> 'assigned_to', '')::uuid,
      nullif(p_quote_data ->> 'template_id', '')::uuid,
      v_actor
    )
    RETURNING * INTO v_after;

    v_saved_id := v_after.id;

  ELSE
    -- Load the before-image and enforce org scope on the existing row too.
    SELECT * INTO v_before FROM public.quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
      RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.quotes
    SET deal_id                 = v_deal_id,
        cliente_id              = nullif(p_quote_data ->> 'cliente_id', '')::uuid,
        organization_id         = v_org_id,
        root_organization_id    = v_root_org_id,
        entity_id               = v_entity_id,
        title                   = nullif(p_quote_data ->> 'title', ''),
        obra_notas              = p_quote_data ->> 'obra_notas',
        modelo_base             = p_quote_data ->> 'modelo_base',
        desconto_global_percent = COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
        estado                  = COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
        validade_dias           = (p_quote_data ->> 'validade_dias')::integer,
        iva_rate                = (p_quote_data ->> 'iva_rate')::numeric,
        client_notes            = nullif(p_quote_data ->> 'client_notes', ''),
        conditions              = nullif(p_quote_data ->> 'conditions', ''),
        proposal_id             = v_proposal_id,
        assigned_to             = nullif(p_quote_data ->> 'assigned_to', '')::uuid,
        template_id             = nullif(p_quote_data ->> 'template_id', '')::uuid
    WHERE id = p_quote_id
    RETURNING * INTO v_after;

    v_saved_id := p_quote_id;

    -- delete-all children (mirrors handleSave: delete quote_lines on edit; fees below)
    DELETE FROM public.quote_lines WHERE quote_id = p_quote_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. quote_lines: insert the full computed set (both new and edit paths)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line, v_line_idx IN
      SELECT value, ordinality - 1
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(value, ordinality)
    LOOP
      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
        retail_price_unit, visible_to_client, source_deal_need_item_id,
        source_deal_need_id,
        uom_id
      )
      VALUES (
        v_saved_id,
        nullif(v_line ->> 'catalog_item_id', '')::uuid,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'service_id', '')::uuid,
        nullif(v_line ->> 'bundle_id', '')::uuid,
        nullif(v_line ->> 'item_supplier_id', '')::uuid,
        COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
        v_line ->> 'categoria',
        v_line ->> 'descricao_snapshot',
        (v_line ->> 'qt')::numeric,
        (v_line ->> 'custo_material_unit')::numeric,
        (v_line ->> 'custo_mao_obra_unit')::numeric,
        (v_line ->> 'margem_percent')::numeric,
        (v_line ->> 'iva_percent')::numeric,
        (v_line ->> 'int_percent')::numeric,
        (v_line ->> 'discount_percent')::numeric,
        (v_line ->> 'total_sem_iva')::numeric,
        (v_line ->> 'total_com_iva')::numeric,
        (v_line ->> 'total_com_desconto')::numeric,
        (v_line ->> 'ordem')::integer,
        COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
        nullif(v_line ->> 'unidade', ''),
        nullif(v_line ->> 'item_description', ''),
        COALESCE((v_line ->> 'cost_price')::numeric, 0),
        nullif(v_line ->> 'retail_price_unit', '')::numeric,
        COALESCE((v_line ->> 'visible_to_client')::boolean, true),
        -- NOVO (20261203030000): origem da linha. Ausente/'' => NULL, exatamente
        -- como todas as outras referências opcionais desta função.
        nullif(v_line ->> 'source_deal_need_item_id', '')::uuid,
        -- NOVO (20261203060000): a origem ESTÁVEL — é esta que serve de chave à
        -- idempotência da importação; a de cima é volátil (delete+reinsert).
        nullif(v_line ->> 'source_deal_need_id', '')::uuid,
        -- NOVO (20261204204500): unidade da linha; units_per_uom é calculado
        -- no servidor pelo gatilho trg_quote_lines_units_per_uom.
        nullif(v_line ->> 'uom_id', '')::uuid
      )
      RETURNING id INTO v_line_id;

      -- Fecha o gap de quote_diagnostic_area_suggestions nunca ser escrita:
      -- para cada sugestão da Fase 1 cujo line_index aponta para a posição
      -- (0-based) desta linha dentro de p_lines, grava a auditoria de origem
      -- (regra ou IA) já ligada ao id real da linha que acabou de ser inserida.
      -- Nunca se aplica a p_inline_quotes — essas sugestões só se tornam
      -- linhas "principais" (ver 7º parâmetro, comentário acima da função).
      IF p_diagnostic_suggestions IS NOT NULL AND jsonb_typeof(p_diagnostic_suggestions) = 'array' THEN
        FOR v_suggestion IN
          SELECT * FROM jsonb_array_elements(p_diagnostic_suggestions)
          WHERE (value ->> 'line_index')::integer = v_line_idx
        LOOP
          INSERT INTO public.quote_diagnostic_area_suggestions (
            diagnostic_area_id, quote_line_id, source, rule_id, ai_rationale,
            ai_confidence, source_field, suggested_qty, was_edited_by_user
          )
          VALUES (
            nullif(v_suggestion ->> 'diagnostic_area_id', '')::uuid,
            v_line_id,
            v_suggestion ->> 'source',
            nullif(v_suggestion ->> 'rule_id', '')::uuid,
            v_suggestion ->> 'ai_rationale',
            (v_suggestion ->> 'ai_confidence')::numeric,
            v_suggestion ->> 'source_field',
            (v_suggestion ->> 'suggested_qty')::numeric,
            COALESCE((v_suggestion ->> 'was_edited_by_user')::boolean, false)
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. quote_fees: delete-all (edit) then insert full set
  -- ══════════════════════════════════════════════════════════════════════════
  -- handleSave() only deletes existing fees in edit mode (a fresh quote has none).
  IF p_quote_id IS NOT NULL THEN
    DELETE FROM public.quote_fees WHERE quote_id = v_saved_id;
  END IF;

  IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
    LOOP
      INSERT INTO public.quote_fees (
        quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
      )
      VALUES (
        v_saved_id,
        nullif(v_fee ->> 'fee_type_id', '')::uuid,
        (v_fee ->> 'base_amount')::numeric,
        (v_fee ->> 'calculated_value')::numeric,
        (v_fee ->> 'vat_rate')::numeric,
        (v_fee ->> 'vat_amount')::numeric
      );
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. quotes totals UPDATE (folded into the same tx — was a separate call in FE)
  -- ══════════════════════════════════════════════════════════════════════════
  UPDATE public.quotes
  SET subtotal   = (p_totals ->> 'subtotal')::numeric,
      total_fees = (p_totals ->> 'total_fees')::numeric,
      total      = (p_totals ->> 'total')::numeric
  WHERE id = v_saved_id
  RETURNING * INTO v_quote;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. proposals value sync (conditional) — regra de negócio real, via
  --    calculate_proposal_value_from_quotes() (FIX: substitui a soma manual
  --    ingénua que ignorava `estado`, sobrepondo-se ao valor correto que o
  --    trigger do passo 4 acabou de calcular)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Written in THIS transaction together with quotes.proposal_id + pipeline_links
  -- so the FK linkage and the aggregate can never desynchronize.
  IF v_saved_id IS NOT NULL AND v_proposal_id IS NOT NULL THEN
    SELECT value INTO v_proposal_old FROM public.proposals WHERE id = v_proposal_id;

    v_proposal_val := public.calculate_proposal_value_from_quotes(v_proposal_id);

    UPDATE public.proposals
    SET value         = v_proposal_val,
        value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(v_proposal_id)
    WHERE id = v_proposal_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. pipeline_links UPDATE/INSERT (conditional on deal_id)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_saved_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
    SELECT id INTO v_existing_link
    FROM   public.pipeline_links
    WHERE  deal_id = v_deal_id
      AND  status  = 'active'
    LIMIT  1;

    IF v_existing_link IS NOT NULL THEN
      UPDATE public.pipeline_links
      SET quote_id   = v_saved_id,
          updated_at = now()
      WHERE id = v_existing_link;
      v_link_op := 'update';
      v_link_id := v_existing_link;
    ELSE
      INSERT INTO public.pipeline_links
        (deal_id, quote_id, organization_id, root_organization_id, status)
      VALUES
        (v_deal_id, v_saved_id, v_org_id, COALESCE(v_root_org_id, v_org_id), 'active')
      RETURNING id INTO v_link_id;
      v_link_op := 'insert';
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. inline quotes: each is a full standalone quote (INSERT + lines + totals)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
    FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
    LOOP
      v_iq_data := v_iq -> 'data';
      -- FE skips inline quotes with no qt>0 lines.
      IF v_iq_data IS NULL
         OR jsonb_typeof(v_iq -> 'lines') <> 'array'
         OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.quotes (
        deal_id, organization_id, root_organization_id, title, obra_notas,
        modelo_base, desconto_global_percent, estado, validade_dias, iva_rate,
        client_notes, conditions, created_by
      )
      VALUES (
        nullif(v_iq_data ->> 'deal_id', '')::uuid,
        v_org_id,
        COALESCE(v_root_org_id, v_org_id),
        nullif(v_iq_data ->> 'title', ''),
        nullif(v_iq_data ->> 'obra_notas', ''),
        COALESCE(nullif(v_iq_data ->> 'modelo_base', ''), 'default'),
        COALESCE((v_iq_data ->> 'desconto_global_percent')::numeric, 0),
        COALESCE(nullif(v_iq_data ->> 'estado', ''), 'rascunho'),
        (v_iq_data ->> 'validade_dias')::integer,
        (v_iq_data ->> 'iva_rate')::numeric,
        nullif(v_iq_data ->> 'client_notes', ''),
        nullif(v_iq_data ->> 'conditions', ''),
        v_actor
      )
      RETURNING id INTO v_iq_id;

      -- FIX 1: filter qt > 0 here (mirrors handleSave iq.lines.filter(l => l.qt > 0)),
      -- rather than trusting the caller to pre-filter. Lines with qt <= 0 (or null) are
      -- skipped exactly as the current FE code does.
      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_iq -> 'lines')
      LOOP
        CONTINUE WHEN COALESCE((v_iq_line ->> 'qt')::numeric, 0) <= 0;

        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
          retail_price_unit, visible_to_client, uom_id
        )
        VALUES (
          v_iq_id,
          nullif(v_iq_line ->> 'catalog_item_id', '')::uuid,
          nullif(v_iq_line ->> 'product_id', '')::uuid,
          nullif(v_iq_line ->> 'service_id', '')::uuid,
          nullif(v_iq_line ->> 'bundle_id', '')::uuid,
          nullif(v_iq_line ->> 'item_supplier_id', '')::uuid,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          -- FIX 2: inline quote lines always persist categoria = '' to match handleSave
          -- (QuoteBuilder.tsx:2087), which never forwards l.categoria for inline lines.
          '',
          v_iq_line ->> 'descricao_snapshot',
          (v_iq_line ->> 'qt')::numeric,
          (v_iq_line ->> 'custo_material_unit')::numeric,
          (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
          (v_iq_line ->> 'margem_percent')::numeric,
          (v_iq_line ->> 'iva_percent')::numeric,
          (v_iq_line ->> 'int_percent')::numeric,
          (v_iq_line ->> 'discount_percent')::numeric,
          (v_iq_line ->> 'total_sem_iva')::numeric,
          (v_iq_line ->> 'total_com_iva')::numeric,
          (v_iq_line ->> 'total_com_desconto')::numeric,
          (v_iq_line ->> 'ordem')::integer,
          COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
          nullif(v_iq_line ->> 'unidade', ''),
          nullif(v_iq_line ->> 'item_description', ''),
          COALESCE((v_iq_line ->> 'cost_price')::numeric, 0),
          nullif(v_iq_line ->> 'retail_price_unit', '')::numeric,
          COALESCE((v_iq_line ->> 'visible_to_client')::boolean, true),
          nullif(v_iq_line ->> 'uom_id', '')::uuid  -- NOVO (20261204204500)
        );
      END LOOP;

      UPDATE public.quotes
      SET subtotal = (v_iq -> 'totals' ->> 'subtotal')::numeric,
          total    = (v_iq -> 'totals' ->> 'total')::numeric
      WHERE id = v_iq_id;

      v_iq_ids := v_iq_ids || v_iq_id;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. Build ONE combined diff and write ONE audit row
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    -- INSERT: snapshot the editable columns of the created quote.
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY v_editable_cols LOOP
      v_quote_diff := v_quote_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
      );
    END LOOP;
  ELSE
    -- UPDATE: diff before-image vs. metadata after-image (v_after captured the
    -- metadata UPDATE; totals were applied afterwards into v_quote — include those too).
    v_old_json := to_jsonb(v_before);
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY (v_editable_cols || ARRAY['subtotal','total_fees','total']) LOOP
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_quote_diff := v_quote_diff || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;
  END IF;

  IF v_quote_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('quotes', v_quote_diff);
  END IF;

  -- quote_lines / quote_fees are rewritten wholesale (delete-all + reinsert). Record
  -- the resulting sets so the single log row still reflects what the save produced.
  v_diff := v_diff || jsonb_build_object(
    'quote_lines', jsonb_build_object('new', COALESCE(p_lines, '[]'::jsonb)),
    'quote_fees',  jsonb_build_object('new', COALESCE(p_fees,  '[]'::jsonb))
  );

  IF v_proposal_id IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'proposals', jsonb_build_object(
        'value', jsonb_build_object('old', to_jsonb(v_proposal_old), 'new', to_jsonb(v_proposal_val))
      )
    );
  END IF;

  IF v_link_op IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'pipeline_links', jsonb_build_object(
        'op',       to_jsonb(v_link_op),
        'id',       to_jsonb(v_link_id),
        'deal_id',  to_jsonb(v_deal_id),
        'quote_id', to_jsonb(v_saved_id)
      )
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  -- Single consolidated audit row for the primary quote.
  PERFORM public.fn_manual_audit_log(
    'quotes',
    v_saved_id,
    v_org_id,
    CASE WHEN p_quote_id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_diff,
    'web_app'
  );

  -- Each inline quote is an independent creation — one INSERT row apiece so the log
  -- does not hide the fact that extra quotes were created.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_org_id, 'INSERT',
        jsonb_build_object('inline_of', to_jsonb(v_saved_id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_quote;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_order       public.purchase_orders;
  v_item        jsonb;
  v_diff        jsonb;
  v_new         jsonb;
  v_source_type text;
  v_source_id   uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS ─────────────────
  -- Predicate (2): the create permission (checked first — fail before any write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Predicate (1): the target org must be in the caller's visible-org scope.
  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ligação opcional a uma Encomenda Cliente (novo, 20261115200000) ───────
  v_source_type := nullif(p_order ->> 'source_type', '');
  v_source_id   := nullif(p_order ->> 'source_id', '')::uuid;
  IF v_source_type IS NOT NULL THEN
    IF v_source_type NOT IN ('contract', 'proposal') THEN
      RAISE EXCEPTION 'source_type inválido: %', v_source_type USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_id IS NULL THEN
      RAISE EXCEPTION 'source_id é obrigatório quando source_type é indicado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_type = 'contract' AND NOT EXISTS (
      SELECT 1 FROM public.client_contracts
      WHERE id = v_source_id AND organization_id = p_organization_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── INSERT the order (identical column set to handleSubmit, order_number ''
  --    so trigger_set_po_number auto-generates it) ───────────────────────────
  INSERT INTO public.purchase_orders (
    order_number, supplier_id, order_date, expected_delivery, status,
    total_value, notes, organization_id, created_by, source_type, source_id
  )
  VALUES (
    '',
    nullif(p_order ->> 'supplier_id', '')::uuid,
    (p_order ->> 'order_date')::date,
    nullif(p_order ->> 'expected_delivery', '')::date,
    COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
    COALESCE((p_order ->> 'total_value')::numeric, 0),
    nullif(p_order ->> 'notes', ''),
    p_organization_id,
    v_actor,
    v_source_type,
    v_source_id
  )
  RETURNING * INTO v_order;

  -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
      )
      VALUES (
        v_order.id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', ''),
        nullif(v_item ->> 'uom_id', '')::uuid,
        -- Snapshot da referência do fornecedor: a enviada, senão a da ligação
        -- item_suppliers deste fornecedor na mesma unidade.
        COALESCE(
          nullif(btrim(v_item ->> 'supplier_sku'), ''),
          (SELECT isup.supplier_sku
             FROM public.item_suppliers isup
            WHERE isup.product_id = nullif(v_item ->> 'product_id', '')::uuid
              AND isup.supplier_id = v_order.supplier_id
              AND isup.uom_id IS NOT DISTINCT FROM nullif(v_item ->> 'uom_id', '')::uuid
              AND isup.deleted_at IS NULL
            LIMIT 1)
        )
      );
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot of the created PO + item set ───────
  v_new := to_jsonb(v_order);
  v_diff := jsonb_build_object(
    'purchase_orders', jsonb_build_object(
      'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
      'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
      'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
      'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
      'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
      'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
      'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
      'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id'),
      'source_type',       jsonb_build_object('old', NULL, 'new', v_new -> 'source_type'),
      'source_id',         jsonb_build_object('old', NULL, 'new', v_new -> 'source_id')
    ),
    'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
  );

  -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(p_purchase_order_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_before     public.purchase_orders;
  v_order      public.purchase_orders;
  v_item       jsonb;
  v_diff       jsonb := '{}'::jsonb;
  v_po_diff    jsonb := '{}'::jsonb;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_key        text;
  v_new_status text;
  v_editable_cols text[] := ARRAY[
    'supplier_id','order_date','expected_delivery','status','total_value','notes'
  ];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_update RLS ──────────────────
  -- Predicate (2): the edit permission (checked first — fail before any read/write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load the before-image (for the diff + org-scope guard) ────────────────
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
    RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261114040000): impede editar (DELETE+INSERT de itens) uma
  --    encomenda com progresso de receção — apagaria received_quantity sem
  --    deixar rasto. Isto bloqueia também, de facto, status='cancelled'
  --    (a chamada inteira falha antes de qualquer escrita): não se cancela
  --    uma encomenda já parcial/totalmente recebida, o caminho correto é
  --    rpc_register_supplier_return.
  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND received_quantity > 0
  ) THEN
    RAISE EXCEPTION 'Esta encomenda já tem linhas recebidas (parcial ou totalmente) — não é possível editá-la nem cancelá-la. Para devolver mercadoria já recebida, usa rpc_register_supplier_return.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── NOVO (20261113290000): exige purchase_orders.approve ADICIONALMENTE a
  --    .edit, só quando esta chamada está mesmo a transitar o status para
  --    'ordered' (não em updates que já estavam em 'ordered' e mantêm o
  --    estado, nem em updates que mudam outros campos sem tocar no status).
  v_new_status := COALESCE(nullif(p_order ->> 'status', ''), 'pending');
  IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
    IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.approve') THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = v_new_status,
      total_value       = COALESCE((p_order ->> 'total_value')::numeric, 0),
      notes             = nullif(p_order ->> 'notes', '')
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
      )
      VALUES (
        p_purchase_order_id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', ''),
        nullif(v_item ->> 'uom_id', '')::uuid,
        -- Snapshot da referência do fornecedor: a enviada, senão a da ligação
        -- item_suppliers deste fornecedor na mesma unidade.
        COALESCE(
          nullif(btrim(v_item ->> 'supplier_sku'), ''),
          (SELECT isup.supplier_sku
             FROM public.item_suppliers isup
            WHERE isup.product_id = nullif(v_item ->> 'product_id', '')::uuid
              AND isup.supplier_id = v_order.supplier_id
              AND isup.uom_id IS NOT DISTINCT FROM nullif(v_item ->> 'uom_id', '')::uuid
              AND isup.deleted_at IS NULL
            LIMIT 1)
        )
      );
    END LOOP;
  END IF;

  -- ── Build the combined diff across both tables ────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_order);
  FOREACH v_key IN ARRAY v_editable_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_po_diff := v_po_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  -- ── Emit the single consolidated UPDATE audit row only when the PO itself
  --    actually changed — same pattern as rpc_update_deal (20260730010000), which
  --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
  --    (no real change in purchase_orders) every time the user re-submits the form
  --    without editing any field. When there IS a real PO change we also attach the
  --    resulting item set so the single row reflects the full save. ───────────
  IF v_po_diff <> '{}'::jsonb THEN
    v_diff := v_diff
      || jsonb_build_object('purchase_orders', v_po_diff)
      || jsonb_build_object(
           'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_entity_id    uuid;
  v_root_org_id  uuid;
  v_client_id    uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_contract     public.client_contracts;
  v_item         jsonb;
  v_ordem        integer := 0;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_product_id   uuid;
  v_service_id   uuid;
  v_sem_iva      numeric;
  v_total_sem    numeric := 0;
  v_total_com    numeric := 0;
  v_start_date   date;
BEGIN
  -- ── Ator de negócio (== created_by no frontend) ──────────────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização: mesma permissão de criar um contrato, porque é
  --    literalmente isso que esta função cria ────────────────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Cliente (entidade) ───────────────────────────────────────────────────
  v_entity_id := nullif(p_order ->> 'entity_id', '')::uuid;
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar o cliente da encomenda' USING ERRCODE = 'check_violation';
  END IF;

  -- `anew_entities` é agnóstica à organização (id, type, display_name, ...):
  -- quem carrega o âmbito organizacional é a ficha de cliente `anew_clients`.
  -- Exigir essa ficha é também a validação de âmbito: uma Encomenda Cliente só
  -- pode existir para um cliente real desta organização.
  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_entity_id
     AND c.organization_id = p_organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_entity_id;

  -- ── Linhas ───────────────────────────────────────────────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;

    IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
      RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
    END IF;

    v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
    IF v_qt IS NULL OR v_qt <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.services s WHERE s.id = v_service_id
    ) THEN
      RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
    END IF;

    v_preco   := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva     := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva := round(v_qt * v_preco, 2);

    v_total_sem := v_total_sem + v_sem_iva;
    v_total_com := v_total_com + round(v_sem_iva * (1 + v_iva / 100), 2);
  END LOOP;

  -- ── 1. Orçamento sintético (nunca aparece em Quotes.tsx / Proposals.tsx) ──
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas
  )
  VALUES (
    v_entity_id, v_client_id, p_organization_id, v_root_org_id,
    v_actor, 'aceite', true, 'EUR',
    v_total_sem, v_total_com, 23, now(),
    'Encomenda manual — ' || COALESCE(v_entity_name, 'cliente'),
    nullif(p_order ->> 'notes', '')
  )
  RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_ordem      := v_ordem + 1;

    INSERT INTO public.quote_lines (
      quote_id, categoria, descricao_snapshot,
      qt, product_id, service_id,
      custo_material_unit, margem_percent, iva_percent,
      total_sem_iva, total_com_iva, total_com_desconto,
      ordem, section_name,
      uom_id  -- NOVO (20261204204500)
    )
    VALUES (
      v_quote_id,
      COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral'),
      COALESCE(nullif(v_item ->> 'descricao', ''), 'Item'),
      v_qt, v_product_id, v_service_id,
      v_preco, 0, v_iva,
      v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
      v_ordem, 'Geral',
      nullif(v_item ->> 'uom_id', '')::uuid
    );
  END LOOP;

  -- ── 2. Contrato em rascunho (contract_number é gerado pelo trigger
  --       trigger_set_client_contract_number, BEFORE INSERT) ────────────────
  v_start_date := COALESCE(nullif(p_order ->> 'start_date', '')::date, current_date);

  -- contract_number fica NULL de propósito: o trigger set_client_contract_number
  -- só gera o número quando o valor vem NULL (um '' passaria incólume e a
  -- encomenda ficaria sem número).
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_entity_id, v_quote_id,
    p_organization_id, v_root_org_id, v_actor,
    'draft', v_total_com, 'EUR', v_start_date,
    nullif(p_order ->> 'notes', ''),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 3. Promover a assinado: é este UPDATE que dispara a dedução de stock e
  --       os pedidos a fornecedor (AFTER UPDATE OF status) ──────────────────
  UPDATE public.client_contracts
     SET status          = 'signed',
         signature_date  = now(),
         accepted_at     = now(),
         signed_by_name  = COALESCE(v_entity_name, 'Encomenda manual'),
         status_changed_by = v_actor,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_duplicate_quote_insert(p_actor_id uuid, p_source text, p_quote jsonb, p_lines jsonb, p_fees jsonb)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new             public.quotes;
  v_line            jsonb;
  v_fee             jsonb;
  v_org_id          uuid;
  v_caller_anew_id  uuid;
BEGIN
  -- ── Authorization (skipped only for genuine service_role/no-JWT callers) ──
  IF auth.uid() IS NOT NULL THEN
    v_org_id := nullif(p_quote ->> 'organization_id', '')::uuid;

    IF v_org_id IS NULL
       OR v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    THEN
      RAISE EXCEPTION 'Not authorized for this organization'
        USING ERRCODE = '42501';
    END IF;

    SELECT au.id INTO v_caller_anew_id
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid();

    IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_caller_anew_id THEN
      RAISE EXCEPTION 'Actor mismatch'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Attribute every DML below to the acting user, for the lifetime of this
  -- single transaction — this is the fix: set_audit_context() and the INSERTs
  -- that follow now share one PostgREST call / one transaction, so SET LOCAL
  -- survives until the AFTER triggers fire.
  IF p_actor_id IS NOT NULL THEN
    PERFORM public.set_audit_context(p_actor_id, COALESCE(p_source, 'web_app'));
  END IF;

  INSERT INTO public.quotes (
    cliente_id, obra_endereco, obra_notas, modelo_base,
    desconto_global_percent, moeda, estado, created_by, quote_number,
    validade_dias, site_address_id, deal_id, organization_id, entity_id,
    root_organization_id, title, template_id, client_notes, conditions,
    iva_rate, assigned_to, subtotal, total_fees, total
  )
  VALUES (
    nullif(p_quote ->> 'cliente_id', '')::uuid,
    p_quote ->> 'obra_endereco',
    p_quote ->> 'obra_notas',
    p_quote ->> 'modelo_base',
    (p_quote ->> 'desconto_global_percent')::numeric,
    p_quote ->> 'moeda',
    COALESCE(nullif(p_quote ->> 'estado', ''), 'rascunho'),
    nullif(p_quote ->> 'created_by', '')::uuid,
    nullif(p_quote ->> 'quote_number', ''),
    (p_quote ->> 'validade_dias')::integer,
    nullif(p_quote ->> 'site_address_id', '')::uuid,
    nullif(p_quote ->> 'deal_id', '')::uuid,
    nullif(p_quote ->> 'organization_id', '')::uuid,
    nullif(p_quote ->> 'entity_id', '')::uuid,
    nullif(p_quote ->> 'root_organization_id', '')::uuid,
    p_quote ->> 'title',
    nullif(p_quote ->> 'template_id', '')::uuid,
    p_quote ->> 'client_notes',
    p_quote ->> 'conditions',
    (p_quote ->> 'iva_rate')::numeric,
    nullif(p_quote ->> 'assigned_to', '')::uuid,
    (p_quote ->> 'subtotal')::numeric,
    (p_quote ->> 'total_fees')::numeric,
    (p_quote ->> 'total')::numeric
  )
  RETURNING * INTO v_new;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit,
        uom_id  -- NOVO (20261204204500)
      )
      VALUES (
        v_new.id,
        nullif(v_line ->> 'catalog_item_id', '')::uuid,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'service_id', '')::uuid,
        nullif(v_line ->> 'bundle_id', '')::uuid,
        COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
        v_line ->> 'categoria',
        v_line ->> 'descricao_snapshot',
        (v_line ->> 'qt')::numeric,
        (v_line ->> 'custo_material_unit')::numeric,
        (v_line ->> 'custo_mao_obra_unit')::numeric,
        (v_line ->> 'margem_percent')::numeric,
        (v_line ->> 'iva_percent')::numeric,
        (v_line ->> 'int_percent')::numeric,
        (v_line ->> 'discount_percent')::numeric,
        (v_line ->> 'total_sem_iva')::numeric,
        (v_line ->> 'total_com_iva')::numeric,
        (v_line ->> 'total_com_desconto')::numeric,
        (v_line ->> 'ordem')::integer,
        COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
        nullif(v_line ->> 'unidade', ''),
        nullif(v_line ->> 'item_description', ''),
        COALESCE((v_line ->> 'cost_price')::numeric, 0),
        nullif(v_line ->> 'retail_price_unit', '')::numeric,
        nullif(v_line ->> 'uom_id', '')::uuid
      );
    END LOOP;
  END IF;

  IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
    LOOP
      INSERT INTO public.quote_fees (
        quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
      )
      VALUES (
        v_new.id,
        nullif(v_fee ->> 'fee_type_id', '')::uuid,
        (v_fee ->> 'base_amount')::numeric,
        (v_fee ->> 'calculated_value')::numeric,
        (v_fee ->> 'vat_rate')::numeric,
        (v_fee ->> 'vat_amount')::numeric
      );
    END LOOP;
  END IF;

  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_proposals_persist_relations(p_proposal_id uuid, p_organization_id uuid, p_root_organization_id uuid, p_deal_id uuid, p_entity_id uuid, p_actor uuid, p_selected_quote_ids uuid[], p_inline_quotes jsonb, p_proposal_items jsonb, p_quote_entity_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_iq             jsonb;
  v_iq_line        jsonb;
  v_iq_id          uuid;
  v_iq_ids         uuid[] := ARRAY[]::uuid[];
  v_item           jsonb;
  v_idx            integer := 0;
  v_valid_lines    jsonb;
  v_subtotal       numeric;
  v_total          numeric;
  v_line_product   uuid;
  v_line_service   uuid;
  v_line_catalog   uuid;
  v_line_valid_p   uuid;
  v_line_valid_s   uuid;
  v_line_valid_c   uuid;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════════
  -- a) Relink selected quotes (mirrors FE steps 2/3)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
    -- Unlink quotes previously on this proposal that are NOT in the selected set.
    UPDATE public.quotes
    SET proposal_id = NULL
    WHERE proposal_id     = p_proposal_id
      AND organization_id = p_organization_id
      AND id <> ALL (p_selected_quote_ids);

    -- Link the selected set to this proposal.
    UPDATE public.quotes
    SET proposal_id = p_proposal_id
    WHERE id = ANY (p_selected_quote_ids)
      AND organization_id = p_organization_id;
  ELSE
    -- No selection — unlink everything from this proposal.
    UPDATE public.quotes
    SET proposal_id = NULL
    WHERE proposal_id     = p_proposal_id
      AND organization_id = p_organization_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- b) Inline quotes: each is a standalone finalized quote + its lines
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
    FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
    LOOP
      -- FE skips inline quotes whose lines are all qt <= 0 (validLines empty).
      IF v_iq IS NULL
         OR jsonb_typeof(v_iq -> 'lines') <> 'array'
         OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
        CONTINUE;
      END IF;

      -- Keep only lines with qt > 0 (FE: validLines = lines.filter(l => l.qt > 0)).
      v_valid_lines := (
        SELECT COALESCE(jsonb_agg(l), '[]'::jsonb)
        FROM jsonb_array_elements(v_iq -> 'lines') AS l
        WHERE COALESCE((l ->> 'qt')::numeric, 0) > 0
      );
      IF jsonb_array_length(v_valid_lines) = 0 THEN
        CONTINUE;
      END IF;

      -- Compute quote totals from the (already fully-computed) line values, exactly
      -- as the FE does: subtotal = sum(total_sem_iva), total = sum(total_com_desconto).
      SELECT
        COALESCE(sum((l ->> 'total_sem_iva')::numeric), 0),
        COALESCE(sum((l ->> 'total_com_desconto')::numeric), 0)
      INTO v_subtotal, v_total
      FROM jsonb_array_elements(v_valid_lines) AS l;

      INSERT INTO public.quotes (
        deal_id, entity_id, organization_id, root_organization_id,
        title, obra_notas, modelo_base, desconto_global_percent, estado,
        validade_dias, iva_rate, client_notes, conditions, proposal_id,
        created_by, subtotal, total
      )
      VALUES (
        p_deal_id,
        p_quote_entity_id,   -- inline-quote entity from the FE cascade, NOT the proposal's entity_id
        p_organization_id,
        COALESCE(p_root_organization_id, p_organization_id),
        nullif(v_iq ->> 'title', ''),
        nullif(v_iq ->> 'obra_notas', ''),
        CASE WHEN nullif(v_iq ->> 'modelo_base', '') IS NOT NULL
                  AND (v_iq ->> 'modelo_base') <> '0'
             THEN v_iq ->> 'modelo_base'
             ELSE 'default'
        END,
        COALESCE((v_iq ->> 'desconto_global_percent')::numeric, 0),
        'finalizado',
        (v_iq ->> 'validade_dias')::integer,
        (v_iq ->> 'iva_rate')::numeric,
        nullif(v_iq ->> 'client_notes', ''),
        nullif(v_iq ->> 'conditions', ''),
        p_proposal_id,
        p_actor,
        v_subtotal,
        v_total
      )
      RETURNING id INTO v_iq_id;

      -- Insert the quote lines, sanitising FKs the way the FE does (drop ids that
      -- no longer exist in products/services/catalog_items).
      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_valid_lines)
      LOOP
        v_line_product := nullif(v_iq_line ->> 'product_id', '')::uuid;
        v_line_service := nullif(v_iq_line ->> 'service_id', '')::uuid;
        v_line_catalog := nullif(v_iq_line ->> 'catalog_item_id', '')::uuid;

        v_line_valid_p := NULL;
        v_line_valid_s := NULL;
        v_line_valid_c := NULL;

        IF v_line_product IS NOT NULL THEN
          SELECT id INTO v_line_valid_p FROM public.products WHERE id = v_line_product;
        END IF;
        IF v_line_service IS NOT NULL THEN
          SELECT id INTO v_line_valid_s FROM public.services WHERE id = v_line_service;
        END IF;
        IF v_line_catalog IS NOT NULL THEN
          SELECT id INTO v_line_valid_c FROM public.catalog_items WHERE id = v_line_catalog;
        END IF;

        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit,
          uom_id  -- NOVO (20261204204500)
        )
        VALUES (
          v_iq_id,
          v_line_valid_c,
          v_line_valid_p,
          v_line_valid_s,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          '',
          v_iq_line ->> 'descricao_snapshot',
          (v_iq_line ->> 'qt')::numeric,
          (v_iq_line ->> 'custo_material_unit')::numeric,
          (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
          (v_iq_line ->> 'margem_percent')::numeric,
          (v_iq_line ->> 'iva_percent')::numeric,
          (v_iq_line ->> 'int_percent')::numeric,
          COALESCE((v_iq_line ->> 'discount_percent')::numeric, 0),
          (v_iq_line ->> 'total_sem_iva')::numeric,
          (v_iq_line ->> 'total_com_iva')::numeric,
          (v_iq_line ->> 'total_com_desconto')::numeric,
          (v_iq_line ->> 'ordem')::integer,
          COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
          nullif(v_iq_line ->> 'unidade', ''),
          nullif(v_iq_line ->> 'item_description', ''),
          COALESCE((v_iq_line ->> 'cost_price')::numeric, 0),
          nullif(v_iq_line ->> 'retail_price_unit', '')::numeric,
          nullif(v_iq_line ->> 'uom_id', '')::uuid
        );
      END LOOP;

      v_iq_ids := v_iq_ids || v_iq_id;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- c) proposal_items: delete-all then reinsert (scoped by proposal_id only)
  -- ══════════════════════════════════════════════════════════════════════════
  DELETE FROM public.proposal_items WHERE proposal_id = p_proposal_id;

  IF p_proposal_items IS NOT NULL AND jsonb_typeof(p_proposal_items) = 'array' THEN
    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_proposal_items)
    LOOP
      INSERT INTO public.proposal_items (
        proposal_id, description, quantity, unit_price, vat_rate, sort_order
      )
      VALUES (
        p_proposal_id,
        v_item ->> 'description',
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        v_idx
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  RETURN v_iq_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_direct_sale_order(p_direct_sale_id uuid)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale         public.direct_sales;
  v_contract     public.client_contracts;
  v_client_id    uuid;
  v_root_org_id  uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_line_count   integer;
BEGIN
  IF p_direct_sale_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serializa aceitações concorrentes da mesma venda: sem isto,
  -- dois pedidos simultâneos passariam os dois pela guarda de idempotência
  -- abaixo e criariam duas encomendas (com dedução de stock a dobrar).
  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Idempotência ─────────────────────────────────────────────────────────
  -- Reaceitação não cria uma segunda encomenda, pela mesma razão por que não
  -- gera um segundo número de proforma: um documento emitido não se duplica.
  IF v_sale.client_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
      FROM public.client_contracts
     WHERE id = v_sale.client_contract_id;

    IF v_contract.id IS NOT NULL THEN
      RETURN v_contract;
    END IF;
    -- Ponteiro pendurado (contrato apagado à mão): cai para a criação normal.
  END IF;

  IF v_sale.status IS DISTINCT FROM 'aceite' THEN
    RAISE EXCEPTION 'A encomenda só é criada depois de a venda direta ser aceite (estado actual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sale.created_by IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem autor; não é possível atribuir a encomenda' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Cliente ──────────────────────────────────────────────────────────────
  -- Exigir a ficha em anew_clients é também a validação de âmbito: a
  -- encomenda só pode existir para um cliente real desta organização.
  -- Mesma regra de rpc_create_manual_client_order.
  IF v_sale.entity_id IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem cliente associado' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_sale.entity_id
     AND c.organization_id = v_sale.organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  v_root_org_id := COALESCE(v_sale.root_organization_id, v_root_org_id, v_sale.organization_id);

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_sale.entity_id;

  SELECT count(*) INTO v_line_count
    FROM public.direct_sale_lines l
   WHERE l.direct_sale_id = v_sale.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'A venda direta não tem linhas' USING ERRCODE = 'check_violation';
  END IF;

  -- Dentro da função de propósito: set_audit_context usa set_config(..., true),
  -- ou seja é LOCAL à transação. Chamada antes, de fora, não chegaria aqui.
  PERFORM public.set_audit_context(v_sale.created_by, 'portal_direct_sale');

  -- ── 1. Orçamento sintético (is_internal: nunca aparece em Quotes.tsx) ─────
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, assigned_to, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas
  )
  VALUES (
    v_sale.entity_id, v_client_id, v_sale.organization_id, v_root_org_id,
    v_sale.created_by, COALESCE(v_sale.assigned_to, v_sale.created_by),
    'aceite', true, COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.subtotal, 0), COALESCE(v_sale.total, 0),
    COALESCE(v_sale.iva_rate, 23), COALESCE(v_sale.accepted_at, now()),
    'Venda Direta — ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    v_sale.notes
  )
  RETURNING id INTO v_quote_id;

  -- ── 2. Linhas, incluindo as internas (ver cabeçalho) ─────────────────────
  INSERT INTO public.quote_lines (
    quote_id, categoria, descricao_snapshot,
    qt, unidade, product_id, service_id,
    cost_price, custo_material_unit, retail_price_unit,
    margem_percent, iva_percent, discount_percent,
    total_sem_iva, total_com_iva, total_com_desconto,
    ordem, section_name, visible_to_client,
    uom_id  -- NOVO (20261204204500)
  )
  SELECT
    v_quote_id, 'Geral', l.descricao_snapshot,
    COALESCE(l.qt, 0), l.unidade, l.product_id, l.service_id,
    COALESCE(l.cost_price, 0), COALESCE(l.cost_price, 0), l.retail_price_unit,
    COALESCE(l.margem_percent, 0), COALESCE(l.iva_percent, 23), COALESCE(l.discount_percent, 0),
    COALESCE(l.total_sem_iva, 0), COALESCE(l.total_com_iva, 0), COALESCE(l.total_com_desconto, 0),
    COALESCE(l.ordem, 0), 'Geral', l.visible_to_client,
    l.uom_id
  FROM public.direct_sale_lines l
  WHERE l.direct_sale_id = v_sale.id
  ORDER BY COALESCE(l.ordem, 0), l.created_at;

  -- ── 3. Contrato em rascunho ──────────────────────────────────────────────
  -- contract_number fica NULL de propósito: trigger_set_client_contract_number
  -- (BEFORE INSERT) só gera o número quando o valor vem NULL — um '' passaria
  -- incólume e a encomenda ficaria sem número.
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_sale.entity_id, v_quote_id,
    v_sale.organization_id, v_root_org_id, v_sale.created_by,
    'draft', COALESCE(v_sale.total, 0), COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.accepted_at::date, current_date),
    'Gerada automaticamente a partir da venda direta ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 4. Promover a assinado: é ESTE UPDATE que dispara stock e fornecedor ──
  UPDATE public.client_contracts
     SET status            = 'signed',
         signature_date    = COALESCE(v_sale.accepted_at, now()),
         accepted_at       = COALESCE(v_sale.accepted_at, now()),
         signed_by_name    = COALESCE(v_entity_name, 'Cliente'),
         status_changed_by = v_sale.created_by,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  -- ── 5. Ligação de volta (a coluna estava reservada desde 20261130230000) ──
  UPDATE public.direct_sales
     SET client_contract_id = v_contract.id
   WHERE id = v_sale.id;

  RETURN v_contract;
END;
$function$;


-- ============================================================================
-- REVERSÃO (manual): repor as definições anteriores, copiadas abaixo tal como
-- estavam vivas em 23/09/2026 (pg_get_functiondef). Retirar o prefixo "-- ".
-- Reverter ANTES de 20261204202500 (as versões anteriores não referem uom_id).
-- ============================================================================
-- ---- rpc_save_quote (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_save_quote(p_quote_id uuid, p_quote_data jsonb, p_lines jsonb, p_fees jsonb, p_totals jsonb, p_inline_quotes jsonb DEFAULT '[]'::jsonb, p_diagnostic_suggestions jsonb DEFAULT '[]'::jsonb)
--  RETURNS quotes
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor        uuid;
--   v_saved_id     uuid;
--   v_org_id       uuid;
--   v_before       public.quotes;
--   v_after        public.quotes;
--   v_quote        public.quotes;
--   v_entity_id    uuid;
--   v_proposal_id  uuid;
--   v_deal_id      uuid;
--   v_root_org_id  uuid;
--   v_line         jsonb;
--   v_line_idx     bigint;
--   v_line_id      uuid;
--   v_suggestion   jsonb;
--   v_fee          jsonb;
--   v_existing_link uuid;
--   v_link_op      text;           -- 'update' | 'insert' | NULL
--   v_link_id      uuid;
--   v_proposal_val numeric;
--   v_proposal_old numeric;
--
--   -- inline-quote locals
--   v_iq           jsonb;
--   v_iq_data      jsonb;
--   v_iq_line      jsonb;
--   v_iq_id        uuid;
--   v_iq_ids       uuid[] := ARRAY[]::uuid[];
--
--   -- diff accumulators
--   v_diff         jsonb := '{}'::jsonb;
--   v_quote_diff   jsonb := '{}'::jsonb;
--   v_key          text;
--   v_new_json     jsonb;
--   v_old_json     jsonb;
--   v_editable_cols text[] := ARRAY[
--     'deal_id','cliente_id','organization_id','root_organization_id','entity_id',
--     'title','obra_notas','modelo_base','desconto_global_percent','estado',
--     'validade_dias','iva_rate','client_notes','conditions','proposal_id',
--     'assigned_to','template_id'
--   ];
-- BEGIN
--   -- Consolidate every write below into a single audit row.
--   PERFORM set_config('app.audit_bypass', 'on', true);
--
--   -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- ── Resolve target org from the incoming payload ──────────────────────────
--   v_org_id      := nullif(p_quote_data ->> 'organization_id', '')::uuid;
--   v_root_org_id := nullif(p_quote_data ->> 'root_organization_id', '')::uuid;
--   v_entity_id   := nullif(p_quote_data ->> 'entity_id', '')::uuid;
--   v_proposal_id := nullif(p_quote_data ->> 'proposal_id', '')::uuid;
--   v_deal_id     := nullif(p_quote_data ->> 'deal_id', '')::uuid;
--
--   -- ── Authorization parity with quotes RLS: org must be in caller's scope ───
--   IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
--     RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 1. quotes: INSERT (new) or UPDATE metadata (edit)
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF p_quote_id IS NULL THEN
--     INSERT INTO public.quotes (
--       deal_id, cliente_id, organization_id, root_organization_id, entity_id,
--       title, obra_notas, modelo_base, desconto_global_percent, estado,
--       validade_dias, iva_rate, client_notes, conditions, proposal_id,
--       assigned_to, template_id, created_by
--     )
--     VALUES (
--       v_deal_id,
--       nullif(p_quote_data ->> 'cliente_id', '')::uuid,
--       v_org_id,
--       v_root_org_id,
--       v_entity_id,
--       nullif(p_quote_data ->> 'title', ''),
--       p_quote_data ->> 'obra_notas',
--       p_quote_data ->> 'modelo_base',
--       COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
--       COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
--       (p_quote_data ->> 'validade_dias')::integer,
--       (p_quote_data ->> 'iva_rate')::numeric,
--       nullif(p_quote_data ->> 'client_notes', ''),
--       nullif(p_quote_data ->> 'conditions', ''),
--       v_proposal_id,
--       nullif(p_quote_data ->> 'assigned_to', '')::uuid,
--       nullif(p_quote_data ->> 'template_id', '')::uuid,
--       v_actor
--     )
--     RETURNING * INTO v_after;
--
--     v_saved_id := v_after.id;
--
--   ELSE
--     -- Load the before-image and enforce org scope on the existing row too.
--     SELECT * INTO v_before FROM public.quotes WHERE id = p_quote_id;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
--       RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--
--     UPDATE public.quotes
--     SET deal_id                 = v_deal_id,
--         cliente_id              = nullif(p_quote_data ->> 'cliente_id', '')::uuid,
--         organization_id         = v_org_id,
--         root_organization_id    = v_root_org_id,
--         entity_id               = v_entity_id,
--         title                   = nullif(p_quote_data ->> 'title', ''),
--         obra_notas              = p_quote_data ->> 'obra_notas',
--         modelo_base             = p_quote_data ->> 'modelo_base',
--         desconto_global_percent = COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
--         estado                  = COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
--         validade_dias           = (p_quote_data ->> 'validade_dias')::integer,
--         iva_rate                = (p_quote_data ->> 'iva_rate')::numeric,
--         client_notes            = nullif(p_quote_data ->> 'client_notes', ''),
--         conditions              = nullif(p_quote_data ->> 'conditions', ''),
--         proposal_id             = v_proposal_id,
--         assigned_to             = nullif(p_quote_data ->> 'assigned_to', '')::uuid,
--         template_id             = nullif(p_quote_data ->> 'template_id', '')::uuid
--     WHERE id = p_quote_id
--     RETURNING * INTO v_after;
--
--     v_saved_id := p_quote_id;
--
--     -- delete-all children (mirrors handleSave: delete quote_lines on edit; fees below)
--     DELETE FROM public.quote_lines WHERE quote_id = p_quote_id;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 2. quote_lines: insert the full computed set (both new and edit paths)
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
--     FOR v_line, v_line_idx IN
--       SELECT value, ordinality - 1
--       FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(value, ordinality)
--     LOOP
--       INSERT INTO public.quote_lines (
--         quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
--         selected_attributes, categoria, descricao_snapshot, qt,
--         custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
--         int_percent, discount_percent, total_sem_iva, total_com_iva,
--         total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
--         retail_price_unit, visible_to_client, source_deal_need_item_id,
--         source_deal_need_id
--       )
--       VALUES (
--         v_saved_id,
--         nullif(v_line ->> 'catalog_item_id', '')::uuid,
--         nullif(v_line ->> 'product_id', '')::uuid,
--         nullif(v_line ->> 'service_id', '')::uuid,
--         nullif(v_line ->> 'bundle_id', '')::uuid,
--         nullif(v_line ->> 'item_supplier_id', '')::uuid,
--         COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
--         v_line ->> 'categoria',
--         v_line ->> 'descricao_snapshot',
--         (v_line ->> 'qt')::numeric,
--         (v_line ->> 'custo_material_unit')::numeric,
--         (v_line ->> 'custo_mao_obra_unit')::numeric,
--         (v_line ->> 'margem_percent')::numeric,
--         (v_line ->> 'iva_percent')::numeric,
--         (v_line ->> 'int_percent')::numeric,
--         (v_line ->> 'discount_percent')::numeric,
--         (v_line ->> 'total_sem_iva')::numeric,
--         (v_line ->> 'total_com_iva')::numeric,
--         (v_line ->> 'total_com_desconto')::numeric,
--         (v_line ->> 'ordem')::integer,
--         COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
--         nullif(v_line ->> 'unidade', ''),
--         nullif(v_line ->> 'item_description', ''),
--         COALESCE((v_line ->> 'cost_price')::numeric, 0),
--         nullif(v_line ->> 'retail_price_unit', '')::numeric,
--         COALESCE((v_line ->> 'visible_to_client')::boolean, true),
--         -- NOVO (20261203030000): origem da linha. Ausente/'' => NULL, exatamente
--         -- como todas as outras referências opcionais desta função.
--         nullif(v_line ->> 'source_deal_need_item_id', '')::uuid,
--         -- NOVO (20261203060000): a origem ESTÁVEL — é esta que serve de chave à
--         -- idempotência da importação; a de cima é volátil (delete+reinsert).
--         nullif(v_line ->> 'source_deal_need_id', '')::uuid
--       )
--       RETURNING id INTO v_line_id;
--
--       -- Fecha o gap de quote_diagnostic_area_suggestions nunca ser escrita:
--       -- para cada sugestão da Fase 1 cujo line_index aponta para a posição
--       -- (0-based) desta linha dentro de p_lines, grava a auditoria de origem
--       -- (regra ou IA) já ligada ao id real da linha que acabou de ser inserida.
--       -- Nunca se aplica a p_inline_quotes — essas sugestões só se tornam
--       -- linhas "principais" (ver 7º parâmetro, comentário acima da função).
--       IF p_diagnostic_suggestions IS NOT NULL AND jsonb_typeof(p_diagnostic_suggestions) = 'array' THEN
--         FOR v_suggestion IN
--           SELECT * FROM jsonb_array_elements(p_diagnostic_suggestions)
--           WHERE (value ->> 'line_index')::integer = v_line_idx
--         LOOP
--           INSERT INTO public.quote_diagnostic_area_suggestions (
--             diagnostic_area_id, quote_line_id, source, rule_id, ai_rationale,
--             ai_confidence, source_field, suggested_qty, was_edited_by_user
--           )
--           VALUES (
--             nullif(v_suggestion ->> 'diagnostic_area_id', '')::uuid,
--             v_line_id,
--             v_suggestion ->> 'source',
--             nullif(v_suggestion ->> 'rule_id', '')::uuid,
--             v_suggestion ->> 'ai_rationale',
--             (v_suggestion ->> 'ai_confidence')::numeric,
--             v_suggestion ->> 'source_field',
--             (v_suggestion ->> 'suggested_qty')::numeric,
--             COALESCE((v_suggestion ->> 'was_edited_by_user')::boolean, false)
--           );
--         END LOOP;
--       END IF;
--     END LOOP;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 3. quote_fees: delete-all (edit) then insert full set
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- handleSave() only deletes existing fees in edit mode (a fresh quote has none).
--   IF p_quote_id IS NOT NULL THEN
--     DELETE FROM public.quote_fees WHERE quote_id = v_saved_id;
--   END IF;
--
--   IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
--     FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
--     LOOP
--       INSERT INTO public.quote_fees (
--         quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
--       )
--       VALUES (
--         v_saved_id,
--         nullif(v_fee ->> 'fee_type_id', '')::uuid,
--         (v_fee ->> 'base_amount')::numeric,
--         (v_fee ->> 'calculated_value')::numeric,
--         (v_fee ->> 'vat_rate')::numeric,
--         (v_fee ->> 'vat_amount')::numeric
--       );
--     END LOOP;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 4. quotes totals UPDATE (folded into the same tx — was a separate call in FE)
--   -- ══════════════════════════════════════════════════════════════════════════
--   UPDATE public.quotes
--   SET subtotal   = (p_totals ->> 'subtotal')::numeric,
--       total_fees = (p_totals ->> 'total_fees')::numeric,
--       total      = (p_totals ->> 'total')::numeric
--   WHERE id = v_saved_id
--   RETURNING * INTO v_quote;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 5. proposals value sync (conditional) — regra de negócio real, via
--   --    calculate_proposal_value_from_quotes() (FIX: substitui a soma manual
--   --    ingénua que ignorava `estado`, sobrepondo-se ao valor correto que o
--   --    trigger do passo 4 acabou de calcular)
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- Written in THIS transaction together with quotes.proposal_id + pipeline_links
--   -- so the FK linkage and the aggregate can never desynchronize.
--   IF v_saved_id IS NOT NULL AND v_proposal_id IS NOT NULL THEN
--     SELECT value INTO v_proposal_old FROM public.proposals WHERE id = v_proposal_id;
--
--     v_proposal_val := public.calculate_proposal_value_from_quotes(v_proposal_id);
--
--     UPDATE public.proposals
--     SET value         = v_proposal_val,
--         value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(v_proposal_id)
--     WHERE id = v_proposal_id;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 6. pipeline_links UPDATE/INSERT (conditional on deal_id)
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF v_saved_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
--     SELECT id INTO v_existing_link
--     FROM   public.pipeline_links
--     WHERE  deal_id = v_deal_id
--       AND  status  = 'active'
--     LIMIT  1;
--
--     IF v_existing_link IS NOT NULL THEN
--       UPDATE public.pipeline_links
--       SET quote_id   = v_saved_id,
--           updated_at = now()
--       WHERE id = v_existing_link;
--       v_link_op := 'update';
--       v_link_id := v_existing_link;
--     ELSE
--       INSERT INTO public.pipeline_links
--         (deal_id, quote_id, organization_id, root_organization_id, status)
--       VALUES
--         (v_deal_id, v_saved_id, v_org_id, COALESCE(v_root_org_id, v_org_id), 'active')
--       RETURNING id INTO v_link_id;
--       v_link_op := 'insert';
--     END IF;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 7. inline quotes: each is a full standalone quote (INSERT + lines + totals)
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
--     FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
--     LOOP
--       v_iq_data := v_iq -> 'data';
--       -- FE skips inline quotes with no qt>0 lines.
--       IF v_iq_data IS NULL
--          OR jsonb_typeof(v_iq -> 'lines') <> 'array'
--          OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
--         CONTINUE;
--       END IF;
--
--       INSERT INTO public.quotes (
--         deal_id, organization_id, root_organization_id, title, obra_notas,
--         modelo_base, desconto_global_percent, estado, validade_dias, iva_rate,
--         client_notes, conditions, created_by
--       )
--       VALUES (
--         nullif(v_iq_data ->> 'deal_id', '')::uuid,
--         v_org_id,
--         COALESCE(v_root_org_id, v_org_id),
--         nullif(v_iq_data ->> 'title', ''),
--         nullif(v_iq_data ->> 'obra_notas', ''),
--         COALESCE(nullif(v_iq_data ->> 'modelo_base', ''), 'default'),
--         COALESCE((v_iq_data ->> 'desconto_global_percent')::numeric, 0),
--         COALESCE(nullif(v_iq_data ->> 'estado', ''), 'rascunho'),
--         (v_iq_data ->> 'validade_dias')::integer,
--         (v_iq_data ->> 'iva_rate')::numeric,
--         nullif(v_iq_data ->> 'client_notes', ''),
--         nullif(v_iq_data ->> 'conditions', ''),
--         v_actor
--       )
--       RETURNING id INTO v_iq_id;
--
--       -- FIX 1: filter qt > 0 here (mirrors handleSave iq.lines.filter(l => l.qt > 0)),
--       -- rather than trusting the caller to pre-filter. Lines with qt <= 0 (or null) are
--       -- skipped exactly as the current FE code does.
--       FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_iq -> 'lines')
--       LOOP
--         CONTINUE WHEN COALESCE((v_iq_line ->> 'qt')::numeric, 0) <= 0;
--
--         INSERT INTO public.quote_lines (
--           quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
--           selected_attributes, categoria, descricao_snapshot, qt,
--           custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
--           int_percent, discount_percent, total_sem_iva, total_com_iva,
--           total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
--           retail_price_unit, visible_to_client
--         )
--         VALUES (
--           v_iq_id,
--           nullif(v_iq_line ->> 'catalog_item_id', '')::uuid,
--           nullif(v_iq_line ->> 'product_id', '')::uuid,
--           nullif(v_iq_line ->> 'service_id', '')::uuid,
--           nullif(v_iq_line ->> 'bundle_id', '')::uuid,
--           nullif(v_iq_line ->> 'item_supplier_id', '')::uuid,
--           COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
--           -- FIX 2: inline quote lines always persist categoria = '' to match handleSave
--           -- (QuoteBuilder.tsx:2087), which never forwards l.categoria for inline lines.
--           '',
--           v_iq_line ->> 'descricao_snapshot',
--           (v_iq_line ->> 'qt')::numeric,
--           (v_iq_line ->> 'custo_material_unit')::numeric,
--           (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
--           (v_iq_line ->> 'margem_percent')::numeric,
--           (v_iq_line ->> 'iva_percent')::numeric,
--           (v_iq_line ->> 'int_percent')::numeric,
--           (v_iq_line ->> 'discount_percent')::numeric,
--           (v_iq_line ->> 'total_sem_iva')::numeric,
--           (v_iq_line ->> 'total_com_iva')::numeric,
--           (v_iq_line ->> 'total_com_desconto')::numeric,
--           (v_iq_line ->> 'ordem')::integer,
--           COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
--           nullif(v_iq_line ->> 'unidade', ''),
--           nullif(v_iq_line ->> 'item_description', ''),
--           COALESCE((v_iq_line ->> 'cost_price')::numeric, 0),
--           nullif(v_iq_line ->> 'retail_price_unit', '')::numeric,
--           COALESCE((v_iq_line ->> 'visible_to_client')::boolean, true)
--         );
--       END LOOP;
--
--       UPDATE public.quotes
--       SET subtotal = (v_iq -> 'totals' ->> 'subtotal')::numeric,
--           total    = (v_iq -> 'totals' ->> 'total')::numeric
--       WHERE id = v_iq_id;
--
--       v_iq_ids := v_iq_ids || v_iq_id;
--     END LOOP;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- 8. Build ONE combined diff and write ONE audit row
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF p_quote_id IS NULL THEN
--     -- INSERT: snapshot the editable columns of the created quote.
--     v_new_json := to_jsonb(v_quote);
--     FOREACH v_key IN ARRAY v_editable_cols LOOP
--       v_quote_diff := v_quote_diff || jsonb_build_object(
--         v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
--       );
--     END LOOP;
--   ELSE
--     -- UPDATE: diff before-image vs. metadata after-image (v_after captured the
--     -- metadata UPDATE; totals were applied afterwards into v_quote — include those too).
--     v_old_json := to_jsonb(v_before);
--     v_new_json := to_jsonb(v_quote);
--     FOREACH v_key IN ARRAY (v_editable_cols || ARRAY['subtotal','total_fees','total']) LOOP
--       IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
--         v_quote_diff := v_quote_diff || jsonb_build_object(
--           v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
--         );
--       END IF;
--     END LOOP;
--   END IF;
--
--   IF v_quote_diff <> '{}'::jsonb THEN
--     v_diff := v_diff || jsonb_build_object('quotes', v_quote_diff);
--   END IF;
--
--   -- quote_lines / quote_fees are rewritten wholesale (delete-all + reinsert). Record
--   -- the resulting sets so the single log row still reflects what the save produced.
--   v_diff := v_diff || jsonb_build_object(
--     'quote_lines', jsonb_build_object('new', COALESCE(p_lines, '[]'::jsonb)),
--     'quote_fees',  jsonb_build_object('new', COALESCE(p_fees,  '[]'::jsonb))
--   );
--
--   IF v_proposal_id IS NOT NULL THEN
--     v_diff := v_diff || jsonb_build_object(
--       'proposals', jsonb_build_object(
--         'value', jsonb_build_object('old', to_jsonb(v_proposal_old), 'new', to_jsonb(v_proposal_val))
--       )
--     );
--   END IF;
--
--   IF v_link_op IS NOT NULL THEN
--     v_diff := v_diff || jsonb_build_object(
--       'pipeline_links', jsonb_build_object(
--         'op',       to_jsonb(v_link_op),
--         'id',       to_jsonb(v_link_id),
--         'deal_id',  to_jsonb(v_deal_id),
--         'quote_id', to_jsonb(v_saved_id)
--       )
--     );
--   END IF;
--
--   IF array_length(v_iq_ids, 1) > 0 THEN
--     v_diff := v_diff || jsonb_build_object(
--       'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
--     );
--   END IF;
--
--   -- Single consolidated audit row for the primary quote.
--   PERFORM public.fn_manual_audit_log(
--     'quotes',
--     v_saved_id,
--     v_org_id,
--     CASE WHEN p_quote_id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
--     v_diff,
--     'web_app'
--   );
--
--   -- Each inline quote is an independent creation — one INSERT row apiece so the log
--   -- does not hide the fact that extra quotes were created.
--   IF array_length(v_iq_ids, 1) > 0 THEN
--     FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
--       PERFORM public.fn_manual_audit_log(
--         'quotes', v_iq_id, v_org_id, 'INSERT',
--         jsonb_build_object('inline_of', to_jsonb(v_saved_id)),
--         'web_app'
--       );
--     END LOOP;
--   END IF;
--
--   RETURN v_quote;
-- END;
-- $function$;
-- ---- rpc_create_purchase_order (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
--  RETURNS purchase_orders
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor       uuid;
--   v_order       public.purchase_orders;
--   v_item        jsonb;
--   v_diff        jsonb;
--   v_new         jsonb;
--   v_source_type text;
--   v_source_id   uuid;
-- BEGIN
--   -- Consolidate every write below into a single audit row.
--   PERFORM set_config('app.audit_bypass', 'on', true);
--
--   -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- ── Authorization parity with purchase_orders_insert RLS ─────────────────
--   -- Predicate (2): the create permission (checked first — fail before any write).
--   IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create') THEN
--     RAISE EXCEPTION 'Sem permissão para criar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--   -- Predicate (1): the target org must be in the caller's visible-org scope.
--   IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
--     RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- ── Ligação opcional a uma Encomenda Cliente (novo, 20261115200000) ───────
--   v_source_type := nullif(p_order ->> 'source_type', '');
--   v_source_id   := nullif(p_order ->> 'source_id', '')::uuid;
--   IF v_source_type IS NOT NULL THEN
--     IF v_source_type NOT IN ('contract', 'proposal') THEN
--       RAISE EXCEPTION 'source_type inválido: %', v_source_type USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_source_id IS NULL THEN
--       RAISE EXCEPTION 'source_id é obrigatório quando source_type é indicado' USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_source_type = 'contract' AND NOT EXISTS (
--       SELECT 1 FROM public.client_contracts
--       WHERE id = v_source_id AND organization_id = p_organization_id AND deleted_at IS NULL
--     ) THEN
--       RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--     END IF;
--   END IF;
--
--   -- ── INSERT the order (identical column set to handleSubmit, order_number ''
--   --    so trigger_set_po_number auto-generates it) ───────────────────────────
--   INSERT INTO public.purchase_orders (
--     order_number, supplier_id, order_date, expected_delivery, status,
--     total_value, notes, organization_id, created_by, source_type, source_id
--   )
--   VALUES (
--     '',
--     nullif(p_order ->> 'supplier_id', '')::uuid,
--     (p_order ->> 'order_date')::date,
--     nullif(p_order ->> 'expected_delivery', '')::date,
--     COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
--     COALESCE((p_order ->> 'total_value')::numeric, 0),
--     nullif(p_order ->> 'notes', ''),
--     p_organization_id,
--     v_actor,
--     v_source_type,
--     v_source_id
--   )
--   RETURNING * INTO v_order;
--
--   -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
--   IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
--     FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
--     LOOP
--       INSERT INTO public.purchase_order_items (
--         purchase_order_id, item_type, product_id, service_id, description, sku,
--         quantity, unit_price, vat_rate, vat_amount, total_price,
--         selected_attributes, notes
--       )
--       VALUES (
--         v_order.id,
--         v_item ->> 'item_type',
--         nullif(v_item ->> 'product_id', '')::uuid,
--         nullif(v_item ->> 'service_id', '')::uuid,
--         v_item ->> 'description',
--         nullif(v_item ->> 'sku', ''),
--         (v_item ->> 'quantity')::numeric,
--         (v_item ->> 'unit_price')::numeric,
--         (v_item ->> 'vat_rate')::numeric,
--         (v_item ->> 'vat_amount')::numeric,
--         (v_item ->> 'total_price')::numeric,
--         COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
--         nullif(v_item ->> 'notes', '')
--       );
--     END LOOP;
--   END IF;
--
--   -- ── Build combined diff: full snapshot of the created PO + item set ───────
--   v_new := to_jsonb(v_order);
--   v_diff := jsonb_build_object(
--     'purchase_orders', jsonb_build_object(
--       'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
--       'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
--       'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
--       'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
--       'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
--       'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
--       'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
--       'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id'),
--       'source_type',       jsonb_build_object('old', NULL, 'new', v_new -> 'source_type'),
--       'source_id',         jsonb_build_object('old', NULL, 'new', v_new -> 'source_id')
--     ),
--     'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
--   );
--
--   -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
--   PERFORM public.fn_manual_audit_log(
--     'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
--   );
--
--   RETURN v_order;
-- END;
-- $function$;
-- ---- rpc_update_purchase_order (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(p_purchase_order_id uuid, p_order jsonb, p_items jsonb)
--  RETURNS purchase_orders
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor      uuid;
--   v_before     public.purchase_orders;
--   v_order      public.purchase_orders;
--   v_item       jsonb;
--   v_diff       jsonb := '{}'::jsonb;
--   v_po_diff    jsonb := '{}'::jsonb;
--   v_old_json   jsonb;
--   v_new_json   jsonb;
--   v_key        text;
--   v_new_status text;
--   v_editable_cols text[] := ARRAY[
--     'supplier_id','order_date','expected_delivery','status','total_value','notes'
--   ];
-- BEGIN
--   PERFORM set_config('app.audit_bypass', 'on', true);
--
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- ── Authorization parity with purchase_orders_update RLS ──────────────────
--   -- Predicate (2): the edit permission (checked first — fail before any read/write).
--   IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- ── Load the before-image (for the diff + org-scope guard) ────────────────
--   SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
--   IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
--     RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- ── NOVO (20261114040000): impede editar (DELETE+INSERT de itens) uma
--   --    encomenda com progresso de receção — apagaria received_quantity sem
--   --    deixar rasto. Isto bloqueia também, de facto, status='cancelled'
--   --    (a chamada inteira falha antes de qualquer escrita): não se cancela
--   --    uma encomenda já parcial/totalmente recebida, o caminho correto é
--   --    rpc_register_supplier_return.
--   IF EXISTS (
--     SELECT 1 FROM public.purchase_order_items
--     WHERE purchase_order_id = p_purchase_order_id AND received_quantity > 0
--   ) THEN
--     RAISE EXCEPTION 'Esta encomenda já tem linhas recebidas (parcial ou totalmente) — não é possível editá-la nem cancelá-la. Para devolver mercadoria já recebida, usa rpc_register_supplier_return.'
--       USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- ── NOVO (20261113290000): exige purchase_orders.approve ADICIONALMENTE a
--   --    .edit, só quando esta chamada está mesmo a transitar o status para
--   --    'ordered' (não em updates que já estavam em 'ordered' e mantêm o
--   --    estado, nem em updates que mudam outros campos sem tocar no status).
--   v_new_status := COALESCE(nullif(p_order ->> 'status', ''), 'pending');
--   IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
--     IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.approve') THEN
--       RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--   END IF;
--
--   -- ── UPDATE the order (identical column set to the FE update) ──────────────
--   UPDATE public.purchase_orders
--   SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
--       order_date        = (p_order ->> 'order_date')::date,
--       expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
--       status            = v_new_status,
--       total_value       = COALESCE((p_order ->> 'total_value')::numeric, 0),
--       notes             = nullif(p_order ->> 'notes', '')
--   WHERE id = p_purchase_order_id
--   RETURNING * INTO v_order;
--
--   -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
--   DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;
--
--   IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
--     FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
--     LOOP
--       INSERT INTO public.purchase_order_items (
--         purchase_order_id, item_type, product_id, service_id, description, sku,
--         quantity, unit_price, vat_rate, vat_amount, total_price,
--         selected_attributes, notes
--       )
--       VALUES (
--         p_purchase_order_id,
--         v_item ->> 'item_type',
--         nullif(v_item ->> 'product_id', '')::uuid,
--         nullif(v_item ->> 'service_id', '')::uuid,
--         v_item ->> 'description',
--         nullif(v_item ->> 'sku', ''),
--         (v_item ->> 'quantity')::numeric,
--         (v_item ->> 'unit_price')::numeric,
--         (v_item ->> 'vat_rate')::numeric,
--         (v_item ->> 'vat_amount')::numeric,
--         (v_item ->> 'total_price')::numeric,
--         COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
--         nullif(v_item ->> 'notes', '')
--       );
--     END LOOP;
--   END IF;
--
--   -- ── Build the combined diff across both tables ────────────────────────────
--   v_old_json := to_jsonb(v_before);
--   v_new_json := to_jsonb(v_order);
--   FOREACH v_key IN ARRAY v_editable_cols LOOP
--     IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
--       v_po_diff := v_po_diff || jsonb_build_object(
--         v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
--       );
--     END IF;
--   END LOOP;
--
--   -- ── Emit the single consolidated UPDATE audit row only when the PO itself
--   --    actually changed — same pattern as rpc_update_deal (20260730010000), which
--   --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
--   --    (no real change in purchase_orders) every time the user re-submits the form
--   --    without editing any field. When there IS a real PO change we also attach the
--   --    resulting item set so the single row reflects the full save. ───────────
--   IF v_po_diff <> '{}'::jsonb THEN
--     v_diff := v_diff
--       || jsonb_build_object('purchase_orders', v_po_diff)
--       || jsonb_build_object(
--            'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
--          );
--
--     PERFORM public.fn_manual_audit_log(
--       'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
--     );
--   END IF;
--
--   RETURN v_order;
-- END;
-- $function$;
-- ---- rpc_create_manual_client_order (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
--  RETURNS client_contracts
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
--
-- DECLARE
--
--   v_actor        uuid;
--
--   v_entity_id    uuid;
--
--   v_root_org_id  uuid;
--
--   v_client_id    uuid;
--
--   v_entity_name  text;
--
--   v_quote_id     uuid;
--
--   v_contract     public.client_contracts;
--
--   v_item         jsonb;
--
--   v_ordem        integer := 0;
--
--   v_qt           numeric;
--
--   v_preco        numeric;
--
--   v_iva          numeric;
--
--   v_product_id   uuid;
--
--   v_service_id   uuid;
--
--   v_sem_iva      numeric;
--
--   v_total_sem    numeric := 0;
--
--   v_total_com    numeric := 0;
--
--   v_start_date   date;
--
-- BEGIN
--
--   -- ── Ator de negócio (== created_by no frontend) ──────────────────────────
--
--   v_actor := public.current_business_user_id();
--
--   IF v_actor IS NULL THEN
--
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--
--   END IF;
--
--
--
--   -- ── Autorização: mesma permissão de criar um contrato, porque é
--
--   --    literalmente isso que esta função cria ────────────────────────────────
--
--   IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.create') THEN
--
--     RAISE EXCEPTION 'Sem permissão para criar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
--
--   END IF;
--
--
--
--   IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
--
--     RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
--
--   END IF;
--
--
--
--   -- ── Cliente (entidade) ───────────────────────────────────────────────────
--
--   v_entity_id := nullif(p_order ->> 'entity_id', '')::uuid;
--
--   IF v_entity_id IS NULL THEN
--
--     RAISE EXCEPTION 'É obrigatório indicar o cliente da encomenda' USING ERRCODE = 'check_violation';
--
--   END IF;
--
--
--
--   -- `anew_entities` é agnóstica à organização (id, type, display_name, ...):
--
--   -- quem carrega o âmbito organizacional é a ficha de cliente `anew_clients`.
--
--   -- Exigir essa ficha é também a validação de âmbito: uma Encomenda Cliente só
--
--   -- pode existir para um cliente real desta organização.
--
--   SELECT c.id, c.root_organization_id
--
--     INTO v_client_id, v_root_org_id
--
--     FROM public.anew_clients c
--
--    WHERE c.entity_id = v_entity_id
--
--      AND c.organization_id = p_organization_id
--
--      AND c.deleted_at IS NULL
--
--    LIMIT 1;
--
--
--
--   IF v_client_id IS NULL THEN
--
--     RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
--
--   END IF;
--
--
--
--   SELECT e.display_name INTO v_entity_name
--
--     FROM public.anew_entities e
--
--    WHERE e.id = v_entity_id;
--
--
--
--   -- ── Linhas ───────────────────────────────────────────────────────────────
--
--   IF p_items IS NULL
--
--      OR jsonb_typeof(p_items) <> 'array'
--
--      OR jsonb_array_length(p_items) = 0 THEN
--
--     RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
--
--   END IF;
--
--
--
--   FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
--
--     v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
--
--     v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
--
--
--
--     IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
--
--       RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
--
--     END IF;
--
--
--
--     v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
--
--     IF v_qt IS NULL OR v_qt <= 0 THEN
--
--       RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
--
--     END IF;
--
--
--
--     IF v_product_id IS NOT NULL AND NOT EXISTS (
--
--       SELECT 1 FROM public.products p WHERE p.id = v_product_id
--
--     ) THEN
--
--       RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
--
--     END IF;
--
--
--
--     IF v_service_id IS NOT NULL AND NOT EXISTS (
--
--       SELECT 1 FROM public.services s WHERE s.id = v_service_id
--
--     ) THEN
--
--       RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
--
--     END IF;
--
--
--
--     v_preco   := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
--
--     v_iva     := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
--
--     v_sem_iva := round(v_qt * v_preco, 2);
--
--
--
--     v_total_sem := v_total_sem + v_sem_iva;
--
--     v_total_com := v_total_com + round(v_sem_iva * (1 + v_iva / 100), 2);
--
--   END LOOP;
--
--
--
--   -- ── 1. Orçamento sintético (nunca aparece em Quotes.tsx / Proposals.tsx) ──
--
--   INSERT INTO public.quotes (
--
--     entity_id, cliente_id, organization_id, root_organization_id,
--
--     created_by, estado, is_internal, moeda,
--
--     subtotal, total, iva_rate, accepted_at,
--
--     title, obra_notas
--
--   )
--
--   VALUES (
--
--     v_entity_id, v_client_id, p_organization_id, v_root_org_id,
--
--     v_actor, 'aceite', true, 'EUR',
--
--     v_total_sem, v_total_com, 23, now(),
--
--     'Encomenda manual — ' || COALESCE(v_entity_name, 'cliente'),
--
--     nullif(p_order ->> 'notes', '')
--
--   )
--
--   RETURNING id INTO v_quote_id;
--
--
--
--   FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
--
--     v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
--
--     v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
--
--     v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
--
--     v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
--
--     v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
--
--     v_sem_iva    := round(v_qt * v_preco, 2);
--
--     v_ordem      := v_ordem + 1;
--
--
--
--     INSERT INTO public.quote_lines (
--
--       quote_id, categoria, descricao_snapshot,
--
--       qt, product_id, service_id,
--
--       custo_material_unit, margem_percent, iva_percent,
--
--       total_sem_iva, total_com_iva, total_com_desconto,
--
--       ordem, section_name
--
--     )
--
--     VALUES (
--
--       v_quote_id,
--
--       COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral'),
--
--       COALESCE(nullif(v_item ->> 'descricao', ''), 'Item'),
--
--       v_qt, v_product_id, v_service_id,
--
--       v_preco, 0, v_iva,
--
--       v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
--
--       v_ordem, 'Geral'
--
--     );
--
--   END LOOP;
--
--
--
--   -- ── 2. Contrato em rascunho (contract_number é gerado pelo trigger
--
--   --       trigger_set_client_contract_number, BEFORE INSERT) ────────────────
--
--   v_start_date := COALESCE(nullif(p_order ->> 'start_date', '')::date, current_date);
--
--
--
--   -- contract_number fica NULL de propósito: o trigger set_client_contract_number
--
--   -- só gera o número quando o valor vem NULL (um '' passaria incólume e a
--
--   -- encomenda ficaria sem número).
--
--   INSERT INTO public.client_contracts (
--
--     contract_number, client_id, entity_id, quote_id,
--
--     organization_id, root_organization_id, created_by,
--
--     status, total_value, currency, start_date, notes,
--
--     is_manual_order
--
--   )
--
--   VALUES (
--
--     NULL, v_client_id, v_entity_id, v_quote_id,
--
--     p_organization_id, v_root_org_id, v_actor,
--
--     'draft', v_total_com, 'EUR', v_start_date,
--
--     nullif(p_order ->> 'notes', ''),
--
--     true
--
--   )
--
--   RETURNING * INTO v_contract;
--
--
--
--   -- ── 3. Promover a assinado: é este UPDATE que dispara a dedução de stock e
--
--   --       os pedidos a fornecedor (AFTER UPDATE OF status) ──────────────────
--
--   UPDATE public.client_contracts
--
--      SET status          = 'signed',
--
--          signature_date  = now(),
--
--          accepted_at     = now(),
--
--          signed_by_name  = COALESCE(v_entity_name, 'Encomenda manual'),
--
--          status_changed_by = v_actor,
--
--          status_changed_at = now()
--
--    WHERE id = v_contract.id
--
--   RETURNING * INTO v_contract;
--
--
--
--   RETURN v_contract;
--
-- END;
--
-- $function$;
-- ---- rpc_duplicate_quote_insert (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_duplicate_quote_insert(p_actor_id uuid, p_source text, p_quote jsonb, p_lines jsonb, p_fees jsonb)
--  RETURNS quotes
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_new             public.quotes;
--   v_line            jsonb;
--   v_fee             jsonb;
--   v_org_id          uuid;
--   v_caller_anew_id  uuid;
-- BEGIN
--   -- ── Authorization (skipped only for genuine service_role/no-JWT callers) ──
--   IF auth.uid() IS NOT NULL THEN
--     v_org_id := nullif(p_quote ->> 'organization_id', '')::uuid;
--
--     IF v_org_id IS NULL
--        OR v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--     THEN
--       RAISE EXCEPTION 'Not authorized for this organization'
--         USING ERRCODE = '42501';
--     END IF;
--
--     SELECT au.id INTO v_caller_anew_id
--     FROM public.anew_users au
--     WHERE au.auth_user_id = auth.uid();
--
--     IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_caller_anew_id THEN
--       RAISE EXCEPTION 'Actor mismatch'
--         USING ERRCODE = '42501';
--     END IF;
--   END IF;
--
--   -- Attribute every DML below to the acting user, for the lifetime of this
--   -- single transaction — this is the fix: set_audit_context() and the INSERTs
--   -- that follow now share one PostgREST call / one transaction, so SET LOCAL
--   -- survives until the AFTER triggers fire.
--   IF p_actor_id IS NOT NULL THEN
--     PERFORM public.set_audit_context(p_actor_id, COALESCE(p_source, 'web_app'));
--   END IF;
--
--   INSERT INTO public.quotes (
--     cliente_id, obra_endereco, obra_notas, modelo_base,
--     desconto_global_percent, moeda, estado, created_by, quote_number,
--     validade_dias, site_address_id, deal_id, organization_id, entity_id,
--     root_organization_id, title, template_id, client_notes, conditions,
--     iva_rate, assigned_to, subtotal, total_fees, total
--   )
--   VALUES (
--     nullif(p_quote ->> 'cliente_id', '')::uuid,
--     p_quote ->> 'obra_endereco',
--     p_quote ->> 'obra_notas',
--     p_quote ->> 'modelo_base',
--     (p_quote ->> 'desconto_global_percent')::numeric,
--     p_quote ->> 'moeda',
--     COALESCE(nullif(p_quote ->> 'estado', ''), 'rascunho'),
--     nullif(p_quote ->> 'created_by', '')::uuid,
--     nullif(p_quote ->> 'quote_number', ''),
--     (p_quote ->> 'validade_dias')::integer,
--     nullif(p_quote ->> 'site_address_id', '')::uuid,
--     nullif(p_quote ->> 'deal_id', '')::uuid,
--     nullif(p_quote ->> 'organization_id', '')::uuid,
--     nullif(p_quote ->> 'entity_id', '')::uuid,
--     nullif(p_quote ->> 'root_organization_id', '')::uuid,
--     p_quote ->> 'title',
--     nullif(p_quote ->> 'template_id', '')::uuid,
--     p_quote ->> 'client_notes',
--     p_quote ->> 'conditions',
--     (p_quote ->> 'iva_rate')::numeric,
--     nullif(p_quote ->> 'assigned_to', '')::uuid,
--     (p_quote ->> 'subtotal')::numeric,
--     (p_quote ->> 'total_fees')::numeric,
--     (p_quote ->> 'total')::numeric
--   )
--   RETURNING * INTO v_new;
--
--   IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
--     FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
--     LOOP
--       INSERT INTO public.quote_lines (
--         quote_id, catalog_item_id, product_id, service_id, bundle_id,
--         selected_attributes, categoria, descricao_snapshot, qt,
--         custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
--         int_percent, discount_percent, total_sem_iva, total_com_iva,
--         total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit
--       )
--       VALUES (
--         v_new.id,
--         nullif(v_line ->> 'catalog_item_id', '')::uuid,
--         nullif(v_line ->> 'product_id', '')::uuid,
--         nullif(v_line ->> 'service_id', '')::uuid,
--         nullif(v_line ->> 'bundle_id', '')::uuid,
--         COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
--         v_line ->> 'categoria',
--         v_line ->> 'descricao_snapshot',
--         (v_line ->> 'qt')::numeric,
--         (v_line ->> 'custo_material_unit')::numeric,
--         (v_line ->> 'custo_mao_obra_unit')::numeric,
--         (v_line ->> 'margem_percent')::numeric,
--         (v_line ->> 'iva_percent')::numeric,
--         (v_line ->> 'int_percent')::numeric,
--         (v_line ->> 'discount_percent')::numeric,
--         (v_line ->> 'total_sem_iva')::numeric,
--         (v_line ->> 'total_com_iva')::numeric,
--         (v_line ->> 'total_com_desconto')::numeric,
--         (v_line ->> 'ordem')::integer,
--         COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
--         nullif(v_line ->> 'unidade', ''),
--         nullif(v_line ->> 'item_description', ''),
--         COALESCE((v_line ->> 'cost_price')::numeric, 0),
--         nullif(v_line ->> 'retail_price_unit', '')::numeric
--       );
--     END LOOP;
--   END IF;
--
--   IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
--     FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
--     LOOP
--       INSERT INTO public.quote_fees (
--         quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
--       )
--       VALUES (
--         v_new.id,
--         nullif(v_fee ->> 'fee_type_id', '')::uuid,
--         (v_fee ->> 'base_amount')::numeric,
--         (v_fee ->> 'calculated_value')::numeric,
--         (v_fee ->> 'vat_rate')::numeric,
--         (v_fee ->> 'vat_amount')::numeric
--       );
--     END LOOP;
--   END IF;
--
--   RETURN v_new;
-- END;
-- $function$;
-- ---- fn_proposals_persist_relations (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.fn_proposals_persist_relations(p_proposal_id uuid, p_organization_id uuid, p_root_organization_id uuid, p_deal_id uuid, p_entity_id uuid, p_actor uuid, p_selected_quote_ids uuid[], p_inline_quotes jsonb, p_proposal_items jsonb, p_quote_entity_id uuid)
--  RETURNS uuid[]
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_iq             jsonb;
--   v_iq_line        jsonb;
--   v_iq_id          uuid;
--   v_iq_ids         uuid[] := ARRAY[]::uuid[];
--   v_item           jsonb;
--   v_idx            integer := 0;
--   v_valid_lines    jsonb;
--   v_subtotal       numeric;
--   v_total          numeric;
--   v_line_product   uuid;
--   v_line_service   uuid;
--   v_line_catalog   uuid;
--   v_line_valid_p   uuid;
--   v_line_valid_s   uuid;
--   v_line_valid_c   uuid;
-- BEGIN
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- a) Relink selected quotes (mirrors FE steps 2/3)
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
--     -- Unlink quotes previously on this proposal that are NOT in the selected set.
--     UPDATE public.quotes
--     SET proposal_id = NULL
--     WHERE proposal_id     = p_proposal_id
--       AND organization_id = p_organization_id
--       AND id <> ALL (p_selected_quote_ids);
--
--     -- Link the selected set to this proposal.
--     UPDATE public.quotes
--     SET proposal_id = p_proposal_id
--     WHERE id = ANY (p_selected_quote_ids)
--       AND organization_id = p_organization_id;
--   ELSE
--     -- No selection — unlink everything from this proposal.
--     UPDATE public.quotes
--     SET proposal_id = NULL
--     WHERE proposal_id     = p_proposal_id
--       AND organization_id = p_organization_id;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- b) Inline quotes: each is a standalone finalized quote + its lines
--   -- ══════════════════════════════════════════════════════════════════════════
--   IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
--     FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
--     LOOP
--       -- FE skips inline quotes whose lines are all qt <= 0 (validLines empty).
--       IF v_iq IS NULL
--          OR jsonb_typeof(v_iq -> 'lines') <> 'array'
--          OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
--         CONTINUE;
--       END IF;
--
--       -- Keep only lines with qt > 0 (FE: validLines = lines.filter(l => l.qt > 0)).
--       v_valid_lines := (
--         SELECT COALESCE(jsonb_agg(l), '[]'::jsonb)
--         FROM jsonb_array_elements(v_iq -> 'lines') AS l
--         WHERE COALESCE((l ->> 'qt')::numeric, 0) > 0
--       );
--       IF jsonb_array_length(v_valid_lines) = 0 THEN
--         CONTINUE;
--       END IF;
--
--       -- Compute quote totals from the (already fully-computed) line values, exactly
--       -- as the FE does: subtotal = sum(total_sem_iva), total = sum(total_com_desconto).
--       SELECT
--         COALESCE(sum((l ->> 'total_sem_iva')::numeric), 0),
--         COALESCE(sum((l ->> 'total_com_desconto')::numeric), 0)
--       INTO v_subtotal, v_total
--       FROM jsonb_array_elements(v_valid_lines) AS l;
--
--       INSERT INTO public.quotes (
--         deal_id, entity_id, organization_id, root_organization_id,
--         title, obra_notas, modelo_base, desconto_global_percent, estado,
--         validade_dias, iva_rate, client_notes, conditions, proposal_id,
--         created_by, subtotal, total
--       )
--       VALUES (
--         p_deal_id,
--         p_quote_entity_id,   -- inline-quote entity from the FE cascade, NOT the proposal's entity_id
--         p_organization_id,
--         COALESCE(p_root_organization_id, p_organization_id),
--         nullif(v_iq ->> 'title', ''),
--         nullif(v_iq ->> 'obra_notas', ''),
--         CASE WHEN nullif(v_iq ->> 'modelo_base', '') IS NOT NULL
--                   AND (v_iq ->> 'modelo_base') <> '0'
--              THEN v_iq ->> 'modelo_base'
--              ELSE 'default'
--         END,
--         COALESCE((v_iq ->> 'desconto_global_percent')::numeric, 0),
--         'finalizado',
--         (v_iq ->> 'validade_dias')::integer,
--         (v_iq ->> 'iva_rate')::numeric,
--         nullif(v_iq ->> 'client_notes', ''),
--         nullif(v_iq ->> 'conditions', ''),
--         p_proposal_id,
--         p_actor,
--         v_subtotal,
--         v_total
--       )
--       RETURNING id INTO v_iq_id;
--
--       -- Insert the quote lines, sanitising FKs the way the FE does (drop ids that
--       -- no longer exist in products/services/catalog_items).
--       FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_valid_lines)
--       LOOP
--         v_line_product := nullif(v_iq_line ->> 'product_id', '')::uuid;
--         v_line_service := nullif(v_iq_line ->> 'service_id', '')::uuid;
--         v_line_catalog := nullif(v_iq_line ->> 'catalog_item_id', '')::uuid;
--
--         v_line_valid_p := NULL;
--         v_line_valid_s := NULL;
--         v_line_valid_c := NULL;
--
--         IF v_line_product IS NOT NULL THEN
--           SELECT id INTO v_line_valid_p FROM public.products WHERE id = v_line_product;
--         END IF;
--         IF v_line_service IS NOT NULL THEN
--           SELECT id INTO v_line_valid_s FROM public.services WHERE id = v_line_service;
--         END IF;
--         IF v_line_catalog IS NOT NULL THEN
--           SELECT id INTO v_line_valid_c FROM public.catalog_items WHERE id = v_line_catalog;
--         END IF;
--
--         INSERT INTO public.quote_lines (
--           quote_id, catalog_item_id, product_id, service_id,
--           selected_attributes, categoria, descricao_snapshot, qt,
--           custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
--           int_percent, discount_percent, total_sem_iva, total_com_iva,
--           total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit
--         )
--         VALUES (
--           v_iq_id,
--           v_line_valid_c,
--           v_line_valid_p,
--           v_line_valid_s,
--           COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
--           '',
--           v_iq_line ->> 'descricao_snapshot',
--           (v_iq_line ->> 'qt')::numeric,
--           (v_iq_line ->> 'custo_material_unit')::numeric,
--           (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
--           (v_iq_line ->> 'margem_percent')::numeric,
--           (v_iq_line ->> 'iva_percent')::numeric,
--           (v_iq_line ->> 'int_percent')::numeric,
--           COALESCE((v_iq_line ->> 'discount_percent')::numeric, 0),
--           (v_iq_line ->> 'total_sem_iva')::numeric,
--           (v_iq_line ->> 'total_com_iva')::numeric,
--           (v_iq_line ->> 'total_com_desconto')::numeric,
--           (v_iq_line ->> 'ordem')::integer,
--           COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
--           nullif(v_iq_line ->> 'unidade', ''),
--           nullif(v_iq_line ->> 'item_description', ''),
--           COALESCE((v_iq_line ->> 'cost_price')::numeric, 0),
--           nullif(v_iq_line ->> 'retail_price_unit', '')::numeric
--         );
--       END LOOP;
--
--       v_iq_ids := v_iq_ids || v_iq_id;
--     END LOOP;
--   END IF;
--
--   -- ══════════════════════════════════════════════════════════════════════════
--   -- c) proposal_items: delete-all then reinsert (scoped by proposal_id only)
--   -- ══════════════════════════════════════════════════════════════════════════
--   DELETE FROM public.proposal_items WHERE proposal_id = p_proposal_id;
--
--   IF p_proposal_items IS NOT NULL AND jsonb_typeof(p_proposal_items) = 'array' THEN
--     v_idx := 0;
--     FOR v_item IN SELECT * FROM jsonb_array_elements(p_proposal_items)
--     LOOP
--       INSERT INTO public.proposal_items (
--         proposal_id, description, quantity, unit_price, vat_rate, sort_order
--       )
--       VALUES (
--         p_proposal_id,
--         v_item ->> 'description',
--         (v_item ->> 'quantity')::numeric,
--         (v_item ->> 'unit_price')::numeric,
--         (v_item ->> 'vat_rate')::numeric,
--         v_idx
--       );
--       v_idx := v_idx + 1;
--     END LOOP;
--   END IF;
--
--   RETURN v_iq_ids;
-- END;
-- $function$;
-- ---- rpc_create_direct_sale_order (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_create_direct_sale_order(p_direct_sale_id uuid)
--  RETURNS client_contracts
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_sale         public.direct_sales;
--   v_contract     public.client_contracts;
--   v_client_id    uuid;
--   v_root_org_id  uuid;
--   v_entity_name  text;
--   v_quote_id     uuid;
--   v_line_count   integer;
-- BEGIN
--   IF p_direct_sale_id IS NULL THEN
--     RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- FOR UPDATE serializa aceitações concorrentes da mesma venda: sem isto,
--   -- dois pedidos simultâneos passariam os dois pela guarda de idempotência
--   -- abaixo e criariam duas encomendas (com dedução de stock a dobrar).
--   SELECT * INTO v_sale
--     FROM public.direct_sales
--    WHERE id = p_direct_sale_id
--      AND deleted_at IS NULL
--      FOR UPDATE;
--
--   IF v_sale.id IS NULL THEN
--     RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- ── Idempotência ─────────────────────────────────────────────────────────
--   -- Reaceitação não cria uma segunda encomenda, pela mesma razão por que não
--   -- gera um segundo número de proforma: um documento emitido não se duplica.
--   IF v_sale.client_contract_id IS NOT NULL THEN
--     SELECT * INTO v_contract
--       FROM public.client_contracts
--      WHERE id = v_sale.client_contract_id;
--
--     IF v_contract.id IS NOT NULL THEN
--       RETURN v_contract;
--     END IF;
--     -- Ponteiro pendurado (contrato apagado à mão): cai para a criação normal.
--   END IF;
--
--   IF v_sale.status IS DISTINCT FROM 'aceite' THEN
--     RAISE EXCEPTION 'A encomenda só é criada depois de a venda direta ser aceite (estado actual: %)', v_sale.status
--       USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF v_sale.created_by IS NULL THEN
--     RAISE EXCEPTION 'Venda direta sem autor; não é possível atribuir a encomenda' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- ── Cliente ──────────────────────────────────────────────────────────────
--   -- Exigir a ficha em anew_clients é também a validação de âmbito: a
--   -- encomenda só pode existir para um cliente real desta organização.
--   -- Mesma regra de rpc_create_manual_client_order.
--   IF v_sale.entity_id IS NULL THEN
--     RAISE EXCEPTION 'Venda direta sem cliente associado' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT c.id, c.root_organization_id
--     INTO v_client_id, v_root_org_id
--     FROM public.anew_clients c
--    WHERE c.entity_id = v_sale.entity_id
--      AND c.organization_id = v_sale.organization_id
--      AND c.deleted_at IS NULL
--    LIMIT 1;
--
--   IF v_client_id IS NULL THEN
--     RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   v_root_org_id := COALESCE(v_sale.root_organization_id, v_root_org_id, v_sale.organization_id);
--
--   SELECT e.display_name INTO v_entity_name
--     FROM public.anew_entities e
--    WHERE e.id = v_sale.entity_id;
--
--   SELECT count(*) INTO v_line_count
--     FROM public.direct_sale_lines l
--    WHERE l.direct_sale_id = v_sale.id;
--
--   IF v_line_count = 0 THEN
--     RAISE EXCEPTION 'A venda direta não tem linhas' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Dentro da função de propósito: set_audit_context usa set_config(..., true),
--   -- ou seja é LOCAL à transação. Chamada antes, de fora, não chegaria aqui.
--   PERFORM public.set_audit_context(v_sale.created_by, 'portal_direct_sale');
--
--   -- ── 1. Orçamento sintético (is_internal: nunca aparece em Quotes.tsx) ─────
--   INSERT INTO public.quotes (
--     entity_id, cliente_id, organization_id, root_organization_id,
--     created_by, assigned_to, estado, is_internal, moeda,
--     subtotal, total, iva_rate, accepted_at,
--     title, obra_notas
--   )
--   VALUES (
--     v_sale.entity_id, v_client_id, v_sale.organization_id, v_root_org_id,
--     v_sale.created_by, COALESCE(v_sale.assigned_to, v_sale.created_by),
--     'aceite', true, COALESCE(v_sale.currency, 'EUR'),
--     COALESCE(v_sale.subtotal, 0), COALESCE(v_sale.total, 0),
--     COALESCE(v_sale.iva_rate, 23), COALESCE(v_sale.accepted_at, now()),
--     'Venda Direta — ' || COALESCE(v_sale.sale_number, v_sale.id::text),
--     v_sale.notes
--   )
--   RETURNING id INTO v_quote_id;
--
--   -- ── 2. Linhas, incluindo as internas (ver cabeçalho) ─────────────────────
--   INSERT INTO public.quote_lines (
--     quote_id, categoria, descricao_snapshot,
--     qt, unidade, product_id, service_id,
--     cost_price, custo_material_unit, retail_price_unit,
--     margem_percent, iva_percent, discount_percent,
--     total_sem_iva, total_com_iva, total_com_desconto,
--     ordem, section_name, visible_to_client
--   )
--   SELECT
--     v_quote_id, 'Geral', l.descricao_snapshot,
--     COALESCE(l.qt, 0), l.unidade, l.product_id, l.service_id,
--     COALESCE(l.cost_price, 0), COALESCE(l.cost_price, 0), l.retail_price_unit,
--     COALESCE(l.margem_percent, 0), COALESCE(l.iva_percent, 23), COALESCE(l.discount_percent, 0),
--     COALESCE(l.total_sem_iva, 0), COALESCE(l.total_com_iva, 0), COALESCE(l.total_com_desconto, 0),
--     COALESCE(l.ordem, 0), 'Geral', l.visible_to_client
--   FROM public.direct_sale_lines l
--   WHERE l.direct_sale_id = v_sale.id
--   ORDER BY COALESCE(l.ordem, 0), l.created_at;
--
--   -- ── 3. Contrato em rascunho ──────────────────────────────────────────────
--   -- contract_number fica NULL de propósito: trigger_set_client_contract_number
--   -- (BEFORE INSERT) só gera o número quando o valor vem NULL — um '' passaria
--   -- incólume e a encomenda ficaria sem número.
--   INSERT INTO public.client_contracts (
--     contract_number, client_id, entity_id, quote_id,
--     organization_id, root_organization_id, created_by,
--     status, total_value, currency, start_date, notes,
--     is_manual_order
--   )
--   VALUES (
--     NULL, v_client_id, v_sale.entity_id, v_quote_id,
--     v_sale.organization_id, v_root_org_id, v_sale.created_by,
--     'draft', COALESCE(v_sale.total, 0), COALESCE(v_sale.currency, 'EUR'),
--     COALESCE(v_sale.accepted_at::date, current_date),
--     'Gerada automaticamente a partir da venda direta ' || COALESCE(v_sale.sale_number, v_sale.id::text),
--     true
--   )
--   RETURNING * INTO v_contract;
--
--   -- ── 4. Promover a assinado: é ESTE UPDATE que dispara stock e fornecedor ──
--   UPDATE public.client_contracts
--      SET status            = 'signed',
--          signature_date    = COALESCE(v_sale.accepted_at, now()),
--          accepted_at       = COALESCE(v_sale.accepted_at, now()),
--          signed_by_name    = COALESCE(v_entity_name, 'Cliente'),
--          status_changed_by = v_sale.created_by,
--          status_changed_at = now()
--    WHERE id = v_contract.id
--   RETURNING * INTO v_contract;
--
--   -- ── 5. Ligação de volta (a coluna estava reservada desde 20261130230000) ──
--   UPDATE public.direct_sales
--      SET client_contract_id = v_contract.id
--    WHERE id = v_sale.id;
--
--   RETURN v_contract;
-- END;
-- $function$;
