-- quote_lines / rpc_save_quote — garantir o ESTADO FINAL, entre qual das duas
-- migrações anteriores entrar.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- O PROBLEMA (MEDIUM) — não é de lógica, é de histórico de migrações
-- -------------------------------------------------------------------
-- Duas migrações fazem CREATE OR REPLACE da MESMA função rpc_save_quote:
--   · 20261203030000 — acrescenta quote_lines.source_deal_need_item_id (volátil)
--   · 20261203060000 — acrescenta quote_lines.source_deal_need_id   (estável)
-- A segunda pressupõe a primeira: reescreve a função inteira já com as duas colunas.
-- Este projeto tem histórico documentado de `db push` a saltar versões em silêncio
-- (timestamps colididos entre sessões paralelas). Se por azar só a 030000 entrasse,
-- ficava em produção uma função que persiste apenas source_deal_need_item_id — e,
-- como o frontend decide a idempotência da importação por source_deal_need_id, essa
-- coluna viria sempre vazia e a segunda importação DUPLICARIA as linhas num
-- orçamento já gravado. Silenciosamente, com o orçamento a valer o dobro.
--
-- A CORREÇÃO
-- ----------
-- Esta migração é puramente defensiva e idempotente: não introduz comportamento
-- novo nenhum, apenas afirma o estado final desejado, seja qual for o subconjunto
-- das anteriores que tenha efetivamente corrido.
--   1. ADD COLUMN IF NOT EXISTS das DUAS colunas (+ comentários + índices parciais).
--   2. CREATE OR REPLACE de rpc_save_quote na versão completa — a de 20261203060000,
--      que é a versão VIVA da função mais as duas colunas no INSERT das quote_lines,
--      e mais nada (verificado por diff contra pg_get_functiondef).
--   3. Um relatório (RAISE NOTICE) sobre a existência de um overload de 6 argumentos
--      de rpc_save_quote. NÃO o apaga — só informa. Ver a nota ao fundo.
--
-- Correr esta migração depois de 030000+060000 é um no-op semântico.
--
-- Prerequisites:
--   20260812010000_quotes_audit_bypass_and_rpcs.sql — rpc_save_quote original
--   20261203030000_quote_lines_source_deal_need_item_id.sql — (opcional; reafirmada)
--   20261203060000_quote_lines_source_deal_need_id.sql      — (opcional; reafirmada)
--
-- Só acrescenta. Nenhum DROP. Nenhuma assinatura alterada.

-- ============================================================
-- 1. quote_lines — as duas colunas de origem, reafirmadas
-- ============================================================

ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS source_deal_need_item_id uuid;

ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS source_deal_need_id uuid;

COMMENT ON COLUMN public.quote_lines.source_deal_need_item_id IS
  'deal_need_items.id de onde esta linha foi importada. Referência FRACA (sem FK) de propósito: fn_apply_deal_need() faz delete+reinsert dos itens da necessidade, logo os ids são voláteis. Serve para rastreabilidade fina — NÃO para idempotência, que se decide por source_deal_need_id.';

COMMENT ON COLUMN public.quote_lines.source_deal_need_id IS
  'deal_needs.id da necessidade de onde esta linha foi importada. CHAVE DE IDEMPOTÊNCIA da importação: é esta que se consulta para saber se uma necessidade já foi importada para o orçamento. Estável — a necessidade é atualizada no lugar, nunca recriada. Referência FRACA (sem FK) de propósito. Não confundir com source_deal_need_item_id, que é volátil.';

CREATE INDEX IF NOT EXISTS idx_quote_lines_source_deal_need_item
  ON public.quote_lines (source_deal_need_item_id)
  WHERE source_deal_need_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_lines_source_deal_need
  ON public.quote_lines (source_deal_need_id)
  WHERE source_deal_need_id IS NOT NULL;

-- ============================================================
-- 2. rpc_save_quote — versão completa (as duas colunas persistidas)
-- ============================================================
-- Corpo idêntico ao de 20261203060000. Assinatura de 7 parâmetros INALTERADA.

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
        source_deal_need_id
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
        nullif(v_line ->> 'source_deal_need_id', '')::uuid
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
          retail_price_unit, visible_to_client
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
          COALESCE((v_iq_line ->> 'visible_to_client')::boolean, true)
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

COMMENT ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) IS
  'Grava o orçamento, linhas, taxas e totais numa transação. Persiste em quote_lines a origem da importação do diagnóstico: source_deal_need_id (estável, chave de idempotência) e source_deal_need_item_id (volátil, rastreabilidade). Versão reafirmada em 20261203090000 para o estado final ficar correto entre qual das migrações 030000/060000 tenha entrado.';

GRANT EXECUTE ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================
-- 3. Relatório: existe overload de rpc_save_quote com 6 argumentos?
-- ============================================================
-- Contexto: a assinatura desta função já cresceu antes (p_diagnostic_suggestions foi
-- o 7.º parâmetro). Quando se acrescenta um parâmetro COM DEFAULT via CREATE OR
-- REPLACE, o Postgres cria uma função NOVA em vez de substituir a antiga — ficam as
-- duas, e uma chamada com 6 argumentos passa a ser AMBÍGUA (erro 42725,
-- "function is not unique") ou, pior, resolve silenciosamente para a versão velha.
--
-- Este bloco apenas RELATA. Deliberadamente NÃO faz DROP FUNCTION:
--   · esta migração tem contrato de "só acrescentar";
--   · apagar um overload é irreversível e pode partir chamadores que ainda não
--     foram atualizados — tem de ser uma decisão consciente, não um efeito lateral;
--   · o NOTICE fica no log do `db push` para quem o correr decidir.
-- Se o aviso aparecer, a limpeza faz-se numa migração própria e explícita.

DO $$
DECLARE
  v_sig text;
  v_n   integer := 0;
BEGIN
  FOR v_sig IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_save_quote'
      AND p.pronargs = 6
  LOOP
    v_n := v_n + 1;
    RAISE WARNING 'rpc_save_quote: overload de 6 argumentos ENCONTRADO -> rpc_save_quote(%). NAO foi apagado. Chamadas com 6 argumentos podem ficar ambiguas; tratar numa migracao propria.', v_sig;
  END LOOP;

  IF v_n = 0 THEN
    RAISE NOTICE 'rpc_save_quote: nenhum overload de 6 argumentos. Nada a fazer.';
  END IF;
END
$$;
