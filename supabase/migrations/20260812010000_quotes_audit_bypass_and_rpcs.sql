-- Orçamentos (Quotes) — single-log save RPC on top of the audit-bypass foundation
-- 2026-08-12 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- QuoteBuilder.tsx handleSave() issues up to EIGHT+ independent Supabase calls, each
-- its own Postgres transaction, and each firing an AFTER audit trigger:
--   1. quotes UPDATE (metadata)              -> trg_audit_quotes
--   2. quote_lines DELETE all                -> trg_audit_quote_lines (N DELETE rows)
--   2b. quote_lines INSERT all               -> trg_audit_quote_lines (N INSERT rows)
--   3. quote_fees DELETE all                 -> trg_audit_quote_fees
--   3b. quote_fees INSERT all                -> trg_audit_quote_fees
--   4. quotes UPDATE (totals)                -> trg_audit_quotes (second row!)
--   5. proposals UPDATE value (conditional)  -> proposals audit trigger
--   6. pipeline_links UPDATE/INSERT (cond.)  -> pipeline_links audit trigger
--   7. inline quotes: quotes INSERT + quote_lines INSERT + quotes UPDATE (each)
-- One user "save" therefore explodes into many audit rows when the business intent
-- is exactly ONE consolidated log entry for the quote.
--
-- Solution
-- --------
-- The audit-bypass foundation (app.audit_bypass GUC guard + fn_manual_audit_log)
-- was created earlier in the Roles module (20260719010000_roles_audit_bypass_and_rpcs.sql)
-- and fn_generic_entity_audit() already short-circuits on app.audit_bypass='on'.
-- The quote-child / quote-send / proposals / pipeline_links audit trigger functions
-- created for those modules follow the same "actor via app.audit_user_id GUC → fallback"
-- convention. This migration reuses that foundation UNCHANGED (foundation NOT recreated
-- here) and adds ONE RPC, rpc_save_quote, that reproduces handleSave() field-for-field
-- inside a single transaction with app.audit_bypass='on', accumulates one combined diff
-- across ALL touched tables, and calls fn_manual_audit_log() exactly ONCE.
--
-- IMPORTANT — quotes.proposal_id (FK) and pipeline_links must stay in sync
-- ------------------------------------------------------------------------
-- quotes.proposal_id is a direct FK and pipeline_links carries the same linkage via a
-- row (deal_id, quote_id). There is NO unique constraint on pipeline_links.proposal_id —
-- multiple quotes per proposal are represented by multiple pipeline_links rows. This RPC
-- writes quotes.proposal_id AND the corresponding pipeline_links row in the SAME
-- transaction (both, or the whole RPC rolls back). They can never desynchronize.
--
-- Business-math parity
-- --------------------
-- QuoteBuilder computes every line/fee/total value in JS (custoUnit, margem, int, IVA,
-- desconto_global, fee base/vat, grand totals). Re-deriving that math in PL/pgSQL would
-- risk drift from the frontend. Following the same contract the frontend/Zod validation
-- boundary already establishes, the RPC receives the FULLY-COMPUTED line and fee rows as
-- jsonb (exactly the objects handleSave() builds today) and persists them verbatim. The
-- RPC owns transactionality, ordering, org/entity resolution, sync guarantees and the
-- single audit row — NOT the pricing arithmetic.
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER, so RLS on quotes/quote_lines/quote_fees/proposals/pipeline_links does
-- NOT self-enforce inside the function. The RPC therefore re-checks explicitly, up front,
-- the SAME organization-scope predicate those RLS policies enforce: the target
-- organization_id must be one of the caller's visible orgs. This is exactly the check the
-- Deals module extracted as fn_deal_org_in_scope(org) (20260730010000), which evaluates
-- "org IN get_user_visible_org_ids(auth.uid())". We reuse that helper unchanged. On EDIT
-- the before-image's own organization_id is additionally required to be in scope, so a
-- caller cannot touch a quote outside their org even by passing a different org id.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql              — entity_audit_log, fn_generic_entity_audit(), set_audit_context()
--   20260627100000_quotes_audit_triggers.sql         — quote/quote_child/quote_send triggers
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — app.audit_bypass guard + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql   — fn_deal_org_in_scope()
--   20260615130000_baseline_new_database.sql         — current_business_user_id(), get_user_visible_org_ids()


-- ============================================================
-- rpc_save_quote(...)
-- ============================================================
-- Mirrors QuoteBuilder.tsx handleSave() end to end:
--
--   p_quote_id            NULL  -> INSERT new quote (created_by = business user)
--                         set   -> UPDATE existing quote + delete-all-and-reinsert children
--   p_quote_data          jsonb — the exact `quoteData` object handleSave() builds
--                                  (deal_id, cliente_id, organization_id, root_organization_id,
--                                   entity_id, title, obra_notas, modelo_base,
--                                   desconto_global_percent, estado, validade_dias, iva_rate,
--                                   client_notes, conditions, proposal_id, assigned_to, template_id)
--   p_lines               jsonb — array of fully-computed quote_lines rows (WITHOUT quote_id;
--                                  the RPC injects savedQuoteId). Already filtered to qt > 0 by FE.
--   p_fees                jsonb — array of fully-computed quote_fees rows (WITHOUT quote_id).
--   p_totals              jsonb — { subtotal, total_fees, total } for the quotes totals UPDATE.
--   p_inline_quotes       jsonb — array of { data: {…quote cols…}, lines: [ {…quote_lines…} ],
--                                  totals: { subtotal, total } }, one per inline quote with qt>0 lines.
--
-- Returns the saved quote row (so the FE can read id / quote_number etc.).
--
-- Everything below happens in ONE transaction with app.audit_bypass = 'on', producing
-- exactly ONE audit row for the primary quote (each inline quote also gets its own single
-- INSERT row so the log stays truthful about the additional quotes created).

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
        quote_id, catalog_item_id, product_id, service_id, bundle_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price
      )
      VALUES (
        v_saved_id,
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
        COALESCE((v_line ->> 'cost_price')::numeric, 0)
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
  -- 5. proposals value sync (conditional) — sum of ALL quotes on the proposal
  -- ══════════════════════════════════════════════════════════════════════════
  -- Written in THIS transaction together with quotes.proposal_id + pipeline_links
  -- so the FK linkage and the aggregate can never desynchronize.
  IF v_saved_id IS NOT NULL AND v_proposal_id IS NOT NULL THEN
    SELECT COALESCE(sum(COALESCE(q.total, 0)), 0)
    INTO   v_proposal_val
    FROM   public.quotes q
    WHERE  q.proposal_id = v_proposal_id
      AND  q.deleted_at IS NULL;

    SELECT value INTO v_proposal_old FROM public.proposals WHERE id = v_proposal_id;

    UPDATE public.proposals
    SET value = v_proposal_val
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

      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_iq -> 'lines')
      LOOP
        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id, bundle_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price
        )
        VALUES (
          v_iq_id,
          nullif(v_iq_line ->> 'catalog_item_id', '')::uuid,
          nullif(v_iq_line ->> 'product_id', '')::uuid,
          nullif(v_iq_line ->> 'service_id', '')::uuid,
          nullif(v_iq_line ->> 'bundle_id', '')::uuid,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          COALESCE(v_iq_line ->> 'categoria', ''),
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
          COALESCE((v_iq_line ->> 'cost_price')::numeric, 0)
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
-- Verification notes (not executed)
-- ============================================================
-- 1. Foundation reused, not recreated:
--    grep in this file — no CREATE for fn_generic_entity_audit / fn_manual_audit_log.
--
-- 2. A save that touches quotes + N lines + M fees + proposal + pipeline_links
--    yields exactly ONE entity_audit_log row with table_name='quotes':
--      SELECT count(*) FROM public.entity_audit_log
--      WHERE table_name='quotes' AND entity_id=<saved-quote-entity>
--        AND created_at > now() - interval '1 minute';
--      -- Expected: 1 (+1 per inline quote created).
--
-- 3. proposal_id + pipeline_links are written in the same tx: rolling back the RPC
--    (e.g. a bad line cast) leaves neither written — they never desync.
--
-- 4. Calling with an org outside get_user_visible_org_ids(auth.uid()) raises
--    insufficient_privilege, matching the quotes RLS policies.
