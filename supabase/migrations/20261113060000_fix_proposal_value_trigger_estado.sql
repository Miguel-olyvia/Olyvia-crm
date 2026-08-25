-- Fix estrutural: proposals.value ficava dessincronizado do somatório real de
-- quotes em vários pontos de mudança de estado, causando o cenário reportado
-- (rejeitar proposta -> reabrir -> associar novo orçamento -> proposals.value
-- fica a 0 na BD, apesar de o orçamento ligado ter valor correto).
--
-- Causa raiz (várias, todas corrigidas nesta migration):
--
--   1. trg_sync_proposal_value_from_quote (baseline_new_database.sql:17775)
--      só disparava em "AFTER INSERT OR UPDATE OF total, proposal_id ON
--      quotes". Uma mudança de `estado` (ex.: rejeitar um orçamento, ou o
--      `soft_delete_business_entity('quote', id)` que só toca `deleted_at`)
--      NUNCA recalculava proposals.value, apesar de
--      calculate_proposal_value_from_quotes() (20261112130000) depender
--      diretamente de `estado` e de `deleted_at IS NULL` para decidir o que
--      somar. proposals.value ficava então a refletir uma composição de
--      quotes que já não corresponde à realidade.
--
--   2. rpc_save_quote() (secção "5. proposals value sync",
--      20261113030000_rpc_save_quote_item_supplier_reference.sql linhas
--      ~304-320) recalculava proposals.value com uma soma manual ingénua
--      (sum(total) WHERE proposal_id=... AND deleted_at IS NULL), SEM filtrar
--      por estado — nem excluía quotes rejeitados, nem aplicava a regra "se
--      houver um aceite, soma só os aceites". Esta soma corria DEPOIS do
--      UPDATE de quotes.total (passo 4), pelo que sobrepunha-se ao valor
--      correto que o trigger (já correto desde 20261112130000) acabava de
--      calcular no mesmo passo.
--
--   3. rpc_bulk_delete_quote() (20260817020000_quotes_bulk_rpcs.sql, secção
--      "Re-sync proposals.value") tinha o mesmo problema: soma manual sem
--      filtrar por estado, sobrepondo-se ao valor correto.
--
--   4. rpc_update_proposal() (20261005010000) confiava cegamente no `value`
--      vindo do payload do frontend (COALESCE((p_proposal_data->>'value')::
--      numeric, 0)) para propostas que TÊM orçamentos ligados — nenhuma
--      validação contra o somatório real. Esta é a causa mais provável do "0"
--      relatado: depois de reabrir uma proposta e associar um orçamento via
--      esta RPC, se o frontend enviar `value` desatualizado (ex.: 0, herdado
--      do estado da proposta rejeitada), esse 0 é persistido tal-e-qual,
--      mesmo que o orçamento ligado tenha total > 0.
--
-- Esta migration:
--   (a) alarga o trigger para também disparar em UPDATE OF estado, deleted_at;
--   (b) expõe recalculate_proposal_value(uuid) como RPC callable pelo
--       frontend, para os fluxos (rejeitar/reabrir proposta) que só tocam
--       `quotes.estado` OU só tocam `proposals` e precisam de forçar o
--       recálculo de forma explícita e imediata;
--   (c) corrige rpc_save_quote() e rpc_bulk_delete_quote() para usarem
--       calculate_proposal_value_from_quotes() em vez da soma manual;
--   (d) corrige rpc_update_proposal() para recalcular value a partir dos
--       quotes reais sempre que a proposta tiver pelo menos um quote
--       associado, ignorando o valor vindo do payload nesse caso (mantém o
--       valor do payload apenas quando a proposta não tem nenhum quote
--       ligado — propostas com itens manuais, sem orçamento).
--
-- Forward-only migration. Não edita nenhuma migration já aplicada.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql                              — trg_sync_proposal_value_from_quote original
--   20261112130000_fix_sync_proposal_value_from_quote_sum.sql             — calculate_proposal_value_from_quotes()
--   20261112280000_add_proposal_value_sem_iva.sql                         — calculate_proposal_value_sem_iva_from_quotes(), sync_proposal_value_from_quote() atual
--   20260730010000_deals_audit_bypass_and_rpcs.sql                        — fn_deal_org_in_scope()
--   20261113030000_rpc_save_quote_item_supplier_reference.sql             — definição atual de rpc_save_quote()
--   20260817020000_quotes_bulk_rpcs.sql                                   — definição atual de rpc_bulk_delete_quote()
--   20261005010000_scope_aware_proposal_edit_authorization.sql            — definição atual de rpc_update_proposal()


-- ============================================================
-- (a) Alargar o trigger de sincronização de proposals.value
-- ============================================================
-- Reutiliza a MESMA função sync_proposal_value_from_quote() já existente
-- (redefinida pela última vez em 20261112280000, que já cobre value E
-- value_sem_iva) — só o conjunto de eventos que despoletam o trigger muda.
DROP TRIGGER IF EXISTS "trg_sync_proposal_value_from_quote" ON "public"."quotes";

CREATE TRIGGER "trg_sync_proposal_value_from_quote"
  AFTER INSERT OR UPDATE OF "total", "proposal_id", "estado", "deleted_at"
  ON "public"."quotes"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."sync_proposal_value_from_quote"();


-- ============================================================
-- (b) recalculate_proposal_value(uuid) — RPC callable pelo frontend
-- ============================================================
-- Recalcula e persiste proposals.value (e value_sem_iva, para não os deixar
-- dessincronizados entre si) a partir do somatório real dos quotes ligados,
-- usando as mesmas funções que o trigger já usa. Autorização espelha
-- fn_save_quote / fn_bulk_*_quote: a organização da proposta tem de estar no
-- âmbito visível do utilizador (fn_deal_org_in_scope).
CREATE OR REPLACE FUNCTION public.recalculate_proposal_value(p_proposal_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_value  numeric;
BEGIN
  IF p_proposal_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_value := public.calculate_proposal_value_from_quotes(p_proposal_id);

  UPDATE public.proposals
  SET value         = v_value,
      value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(p_proposal_id),
      updated_at    = now()
  WHERE id = p_proposal_id;

  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_proposal_value(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_proposal_value(uuid) TO authenticated;


-- ============================================================
-- (c.1) rpc_save_quote(...) — passo 5 corrigido (mesma assinatura exata)
-- ============================================================
-- Corpo IDÊNTICO ao de 20261113030000_rpc_save_quote_item_supplier_reference.sql,
-- exceto a secção "5. proposals value sync": a soma manual ingénua (sem
-- filtro de estado) é substituída pela chamada a
-- calculate_proposal_value_from_quotes(), que já aplica a regra de negócio
-- correta (soma só os aceites se houver algum aceite; senão soma os
-- não-rejeitados). Nenhuma outra lógica, coluna, autorização ou
-- comportamento foi alterado.
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
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price
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
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price
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
-- (c.2) rpc_bulk_delete_quote(...) — re-sync corrigido (mesma assinatura exata)
-- ============================================================
-- Corpo IDÊNTICO ao de 20260817020000_quotes_bulk_rpcs.sql, exceto o passo
-- final "Re-sync proposals.value", que passa a usar
-- calculate_proposal_value_from_quotes() em vez da soma manual sem filtro de
-- estado. Nenhuma outra lógica, coluna, autorização ou comportamento foi
-- alterado.
CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_quote(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_ids         uuid[];
  v_deleted_at  timestamptz := now();
  v_before      public.quotes;
  v_count       integer := 0;
  v_proposal    uuid;
  v_prop_ids    uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- ── Authorization parity with quotes_delete_policy (org in caller's scope) ──
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Defense-in-depth: server-side write permission (see header) ─────────────
  -- 'quotes.manage' is the real DB write gate for the quotes domain (matching archive_quote);
  -- admin roles pass implicitly via has_anew_permission. This closes the direct-PostgREST bypass
  -- of the client-side BulkActionsBar deletePermission="quotes.delete" gate.
  IF NOT public.has_anew_permission(auth.uid(), 'quotes.manage') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar orçamentos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Iterate the in-scope, not-yet-deleted rows; soft-delete + audit once each ──
  FOR v_before IN
    SELECT * FROM public.quotes
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  LOOP
    UPDATE public.quotes
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE id = v_before.id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    -- Collect distinct affected proposals for the value re-sync below.
    IF v_before.proposal_id IS NOT NULL
       AND NOT (v_before.proposal_id = ANY (v_prop_ids)) THEN
      v_prop_ids := v_prop_ids || v_before.proposal_id;
    END IF;

    -- Consolidated DELETE audit row: record the soft-delete transition explicitly so the log
    -- is truthful (the row is not physically removed).
    PERFORM public.fn_manual_audit_log(
      'quotes',
      v_before.id,
      v_before.organization_id,
      'DELETE',
      jsonb_build_object('quotes', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at)),
        'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
      )),
      'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  -- ── Re-sync proposals.value/value_sem_iva for affected proposals (FIX: usa
  --    calculate_proposal_value_from_quotes(), a mesma regra de negócio do
  --    trigger, em vez da soma manual sem filtro de estado) ──────────────────
  -- Written in this transaction so the aggregate can never lag the soft-delete.
  IF array_length(v_prop_ids, 1) IS NOT NULL AND array_length(v_prop_ids, 1) > 0 THEN
    FOREACH v_proposal IN ARRAY v_prop_ids LOOP
      UPDATE public.proposals p
      SET value         = public.calculate_proposal_value_from_quotes(v_proposal),
          value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(v_proposal)
      WHERE p.id = v_proposal;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_quote(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_quote(uuid[], uuid) TO authenticated;


-- ============================================================
-- (d) rpc_update_proposal(...) — value recalculado a partir dos quotes reais
-- ============================================================
-- Corpo IDÊNTICO ao de 20261005010000_scope_aware_proposal_edit_authorization.sql
-- (mesma assinatura, mesma autorização Gate 1/Gate 2, mesmas relações/diff/
-- auditoria), exceto que, depois do UPDATE inicial e de
-- fn_proposals_persist_relations() ligar/desligar quotes, o `value`
-- persistido deixa de confiar cegamente no payload do frontend quando a
-- proposta TEM pelo menos um quote associado (não eliminado): nesse caso é
-- recalculado a partir de calculate_proposal_value_from_quotes(), a mesma
-- regra de negócio usada pelo trigger e pelas restantes RPCs. Quando a
-- proposta não tem NENHUM quote ligado (proposta com itens manuais, sem
-- orçamento), mantém-se o valor vindo do payload, tal como antes.
CREATE OR REPLACE FUNCTION public.rpc_update_proposal(
  p_id                 uuid,
  p_proposal_data      jsonb,
  p_selected_quote_ids uuid[]  DEFAULT ARRAY[]::uuid[],
  p_inline_quotes      jsonb   DEFAULT '[]'::jsonb,
  p_proposal_items     jsonb   DEFAULT '[]'::jsonb,
  p_quote_entity_id    uuid    DEFAULT NULL   -- inline-quote entity from the FE cascade
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_org_id       uuid;
  v_root_org_id  uuid;
  v_entity_id    uuid;
  v_deal_id      uuid;
  v_before       public.proposals;
  v_proposal     public.proposals;
  v_iq_ids       uuid[];
  v_diff         jsonb := '{}'::jsonb;
  v_prop_diff    jsonb := '{}'::jsonb;
  v_old_json     jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_diff_cols    text[] := ARRAY[
    'title','description','value','probability','deal_id','entity_id','valid_until',
    'notes','stage_id','status','organization_id','root_organization_id',
    'template_id','assigned_to'
  ];
  v_iq_id        uuid;
  v_has_quotes   boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + guards) ─────────────
  SELECT * INTO v_before FROM public.proposals WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id      := nullif(p_proposal_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_proposal_data ->> 'root_organization_id', '')::uuid;
  v_deal_id     := nullif(p_proposal_data ->> 'deal_id', '')::uuid;
  v_entity_id   := nullif(p_proposal_data ->> 'entity_id', '')::uuid;

  -- ── Authorization parity with proposals UPDATE RLS ────────────────────────
  --   USING (row must be visible to update, unchanged from before this fix):
  --       created_by = current_business_user_id()
  --       OR (has proposals.edit AND organization_id IN visible orgs)
  --
  --   WITH CHECK (write is only allowed at all) — scope-aware as of
  --   20261005010000, mirroring can_write_proposal_row() used in the live RLS
  --   policy:
  --       proposals.edit scope ORG   -> any visible-org proposal
  --       proposals.edit scope TEAM  -> created_by is self or a team member
  --                                     of a team the caller leads
  --       proposals.edit scope OWNED
  --         (or no scope row at all) -> created_by = self only
  --       proposals.edit not granted -> never, even for the row's own creator

  -- Gate 1 — USING: evaluated against the EXISTING row (v_before). Unchanged.
  IF NOT (
       v_before.created_by = v_actor
       OR (
         public.has_anew_permission(auth.uid(), 'proposals.edit')
         AND v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       )
     ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 — WITH CHECK: scope-aware. No proposals.edit at all is always
  -- denied, even for the proposal's own creator.
  IF NOT public.can_write_proposal_row(v_before.created_by, v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 (org-scope half of WITH CHECK): the resulting organization_id must be
  -- NULL or within the caller's visible orgs. Applied to the INCOMING org.
  IF v_org_id IS NOT NULL
     AND NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the proposal (identical column set to proposalData in the FE) ──
  UPDATE public.proposals
  SET title                = p_proposal_data ->> 'title',
      description          = nullif(p_proposal_data ->> 'description', ''),
      value                = COALESCE((p_proposal_data ->> 'value')::numeric, 0),
      probability          = COALESCE((p_proposal_data ->> 'probability')::numeric, 50),
      deal_id              = v_deal_id,
      entity_id            = v_entity_id,
      valid_until          = nullif(p_proposal_data ->> 'valid_until', '')::date,
      notes                = nullif(p_proposal_data ->> 'notes', ''),
      stage_id             = nullif(p_proposal_data ->> 'stage_id', '')::uuid,
      status               = COALESCE(nullif(p_proposal_data ->> 'status', ''), 'draft'),
      organization_id      = v_org_id,
      root_organization_id = COALESCE(v_root_org_id, v_org_id),
      template_id          = nullif(p_proposal_data ->> 'template_id', '')::uuid,
      assigned_to          = nullif(p_proposal_data ->> 'assigned_to', '')::uuid
  WHERE id = p_id
  RETURNING * INTO v_proposal;

  -- ── Relations (quotes relink + inline quotes + proposal_items) ────────────
  v_iq_ids := public.fn_proposals_persist_relations(
    v_proposal.id,
    v_proposal.organization_id,
    COALESCE(v_root_org_id, v_proposal.organization_id),
    v_deal_id,
    v_proposal.entity_id,
    v_actor,
    p_selected_quote_ids,
    p_inline_quotes,
    p_proposal_items,
    p_quote_entity_id
  );

  -- ── FIX: value real a partir dos quotes ligados, não do payload ───────────
  -- fn_proposals_persist_relations() já ligou/desligou quotes (incluindo
  -- quaisquer inline quotes criados agora); só depois disso é seguro verificar
  -- se a proposta ficou com algum quote associado. Se ficou, o `value` acima
  -- (vindo diretamente do payload do frontend) é substituído pelo somatório
  -- real — a mesma regra usada pelo trigger e pelas restantes RPCs — em vez
  -- de confiar cegamente no que o frontend enviou (a causa raiz do valor a 0
  -- reportado depois de reabrir uma proposta e associar um novo orçamento).
  -- Só quando a proposta NÃO tem nenhum quote ligado (proposta com itens
  -- manuais, sem orçamento) é que o valor do payload é mantido.
  SELECT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE proposal_id = v_proposal.id AND deleted_at IS NULL
  ) INTO v_has_quotes;

  IF v_has_quotes THEN
    UPDATE public.proposals
    SET value         = public.calculate_proposal_value_from_quotes(v_proposal.id),
        value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(v_proposal.id)
    WHERE id = v_proposal.id
    RETURNING * INTO v_proposal;
  END IF;

  -- ── Build the combined diff (only changed proposal columns) ───────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_proposal);
  FOREACH v_key IN ARRAY v_diff_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_prop_diff := v_prop_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  IF v_prop_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('proposals', v_prop_diff);
  END IF;

  IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'quotes', jsonb_build_object('linked', to_jsonb(p_selected_quote_ids))
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  v_diff := v_diff || jsonb_build_object(
    'proposal_items', jsonb_build_object('new', COALESCE(p_proposal_items, '[]'::jsonb))
  );

  -- ── One consolidated audit row for the proposal ───────────────────────────
  PERFORM public.fn_manual_audit_log(
    'proposals',
    v_proposal.entity_id,
    v_proposal.organization_id,
    'UPDATE',
    v_diff,
    'web_app'
  );

  -- Each inline quote created during this save is an independent creation.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_proposal.organization_id, 'INSERT',
        jsonb_build_object('inline_of_proposal', to_jsonb(v_proposal.id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_proposal;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_proposal(uuid, jsonb, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_proposal(uuid, jsonb, uuid[], jsonb, jsonb, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Trigger alargado para os 4 eventos:
--      SELECT pg_get_triggerdef(oid) FROM pg_trigger
--      WHERE tgname = 'trg_sync_proposal_value_from_quote';
--      -- Esperado: "... AFTER INSERT OR UPDATE OF total, proposal_id, estado, deleted_at ON quotes ..."
--
-- 2. recalculate_proposal_value(uuid) existe, é STABLE/SECURITY DEFINER e
--    devolve o mesmo valor que calculate_proposal_value_from_quotes():
--      SELECT public.recalculate_proposal_value('<proposal_id>');
--
-- 3. rpc_save_quote / rpc_bulk_delete_quote deixam de conter a soma manual
--    ingénua (sum(...) sem filtro de estado) no passo de sync de
--    proposals.value:
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('rpc_save_quote','rpc_bulk_delete_quote')
--        AND prosrc LIKE '%calculate_proposal_value_from_quotes%';
--      -- Esperado: ambas as linhas.
--
-- 4. rpc_update_proposal chama calculate_proposal_value_from_quotes quando a
--    proposta tem quotes ligados:
--      SELECT prosrc LIKE '%calculate_proposal_value_from_quotes%'
--      FROM pg_proc WHERE proname = 'rpc_update_proposal';
--      -- Esperado: true.
--
-- 5. Cenário do bug reportado deixa de reproduzir: rejeitar proposta (quotes
--    passam a 'rejeitado' -> trigger recalcula value/value_sem_iva) -> reabrir
--    (chamada explícita a recalculate_proposal_value do frontend) -> associar
--    novo orçamento via rpc_update_proposal ou rpc_save_quote -> value reflete
--    o somatório real (não fica a 0 nem herda o total de um quote já
--    rejeitado).
