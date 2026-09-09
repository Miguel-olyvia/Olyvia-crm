-- Orçamentos — o PREÇO DE VENDA DEFINIDO passa a sobreviver à gravação.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- O DEFEITO
-- ---------
-- src/utils/quotes/quoteLinePricing.ts já tem a regra certa: quando a linha traz
-- um preço de venda definido (`retail_price_unit`), é esse o preço unitário e não
-- se reconstrói nada a partir do custo. Só que `retail_price_unit` nunca existiu
-- em public.quote_lines: vivia apenas em memória no construtor de orçamentos.
--
-- Ao gravar, sobreviviam apenas `custo_material_unit` e `margem_percent`, ambos
-- DERIVADOS do preço (QuoteBuilder.tsx e ProposalCreateDialog.tsx dividem o preço
-- pela margem para fabricar um custo). `custo_material_unit` é numeric(10,2), por
-- isso o custo derivado é arredondado ao cêntimo e a viagem de volta
-- (custo × margem) perde milésimos:
--
--     soma dos preços de venda dos componentes .. 195,24
--     ÷ 1,30 -> 150,184615 -> grava 150,18
--     × 1,30 -> 195,234    -> lê 195,23   (devia ser 195,24)
--
-- Em toda a base, 2 991 de 10 526 linhas de bundle divergem da soma dos seus
-- componentes; 831 orçamentos afetados; pior caso 24,66 €.
--
-- A CORREÇÃO
-- ----------
--   1. public.quote_lines.retail_price_unit numeric(10,2) NULL — ANULÁVEL de
--      propósito. As linhas já gravadas ficam a NULL e continuam a passar pelo
--      caminho antigo (custo × markup), com exatamente os mesmos valores de hoje.
--      Esta migration NÃO faz backfill e NÃO altera nenhum valor já gravado.
--   2. As três funções que gravam linhas de orçamento passam a persistir a chave
--      `retail_price_unit` do payload quando ela vem preenchida, e NULL quando não:
--        · rpc_save_quote()                — construtor de orçamentos (2 INSERTs:
--                                            linhas principais + inline quotes)
--        · fn_proposals_persist_relations() — orçamentos em linha das propostas
--        · rpc_duplicate_quote_insert()     — duplicação de orçamento (sem isto,
--                                            duplicar perdia o preço definido)
--
-- Retrocompatibilidade: `nullif(... ->> 'retail_price_unit', '')::numeric` resolve
-- para NULL em qualquer payload que não traga a chave — frontend antigo em cache,
-- Edge Functions por atualizar, linhas sem preço de venda conhecível. Nenhum
-- payload existente deixa de funcionar e nenhum valor existente muda.
--
-- Corpos COPIADOS byte-a-byte das definições mais recentes de cada função,
-- comentários internos incluídos, com a ÚNICA alteração de acrescentar
-- `retail_price_unit` à lista de colunas e o valor correspondente à lista de
-- VALUES de cada INSERT INTO public.quote_lines. Nenhuma outra lógica,
-- assinatura, autorização ou comportamento foi alterado.
--
-- Prerequisites (definições superseded por esta migration):
--   20261113060000_fix_proposal_value_trigger_estado.sql          — rpc_save_quote()
--   20260815010000_proposals_audit_bypass_and_rpcs.sql            — fn_proposals_persist_relations()
--   20261107040000_fix_duplicate_quote_insert_missing_business_unit_id.sql
--                                                                 — rpc_duplicate_quote_insert()


-- ============================================================
-- 1. A coluna
-- ============================================================
ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS retail_price_unit numeric(10,2);

COMMENT ON COLUMN public.quote_lines.retail_price_unit IS
  'Preço de venda definido da linha (preço de catálogo, preço total do bundle, ou preço escrito à mão). Quando preenchido, manda no preço unitário e o custo/markup NÃO são usados para o reconstruir — ver getLineUnitPrice() em src/utils/quotes/quoteLinePricing.ts. NULL nas linhas gravadas antes desta coluna existir, e nas linhas cujo preço de venda não é conhecível: essas continuam a derivar o preço do custo e do markup, exatamente como antes.';


-- ============================================================
-- 2. rpc_save_quote(...) — persiste retail_price_unit nos dois INSERTs
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_save_quote(
  p_quote_id      uuid,
  p_quote_data    jsonb,
  p_lines         jsonb,
  p_fees          jsonb,
  p_totals        jsonb,
  p_inline_quotes jsonb DEFAULT '[]'::jsonb
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit
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
        nullif(v_line ->> 'retail_price_unit', '')::numeric
      );
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
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit
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
          nullif(v_iq_line ->> 'retail_price_unit', '')::numeric
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
$$;

REVOKE ALL ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================
-- 3. fn_proposals_persist_relations(...) — persiste retail_price_unit
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_proposals_persist_relations(
  p_proposal_id          uuid,
  p_organization_id      uuid,
  p_root_organization_id uuid,
  p_deal_id              uuid,
  p_entity_id            uuid,      -- proposals.entity_id (NULL when a deal is selected in the FE)
  p_actor                uuid,
  p_selected_quote_ids   uuid[],
  p_inline_quotes        jsonb,     -- [{ title, obra_notas, modelo_base, ..., lines:[{...}] }]
  p_proposal_items       jsonb,     -- [{ description, quantity, unit_price, vat_rate }]
  p_quote_entity_id      uuid       -- entity_id for the inline quotes. The FE computes this via a
                                    -- DIFFERENT cascade than proposals.entity_id (Proposals.tsx
                                    -- L1305: selectedDeal?.entity_id || selectedEntity?.entityId;
                                    -- ProposalCreateDialog.tsx L394: presetEntityId ||
                                    -- selectedDeal?.entity_id || selectedContact?.entity_id) and
                                    -- passes it explicitly. Do NOT fall back to p_entity_id here:
                                    -- p_entity_id is NULL whenever a deal is selected, which is
                                    -- exactly when the correct quote entity comes from the deal.
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit
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
          nullif(v_iq_line ->> 'retail_price_unit', '')::numeric
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
$$;

REVOKE ALL ON FUNCTION public.fn_proposals_persist_relations(uuid, uuid, uuid, uuid, uuid, uuid, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_proposals_persist_relations(uuid, uuid, uuid, uuid, uuid, uuid, uuid[], jsonb, jsonb, uuid) TO authenticated, service_role;

-- ============================================================
-- 4. rpc_duplicate_quote_insert(...) — leva retail_price_unit na cópia
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_duplicate_quote_insert(
  p_actor_id uuid,     -- anew_users.id to attribute the audit rows to; NULL => trigger fallback
  p_source   text,     -- audit source, e.g. 'web_app'
  p_quote    jsonb,    -- new quotes row payload (same shape as duplicate-quote's newQuote object)
  p_lines    jsonb,    -- array of quote_lines rows, WITHOUT quote_id (this RPC injects it)
  p_fees     jsonb     -- array of quote_fees rows, WITHOUT quote_id (this RPC injects it)
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit
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
        nullif(v_line ->> 'retail_price_unit', '')::numeric
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
$$;

-- Grants unchanged from 20261107030000_authorize_rpc_duplicate_quote_insert.sql:
-- authenticated + service_role only, no PUBLIC/anon.
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
