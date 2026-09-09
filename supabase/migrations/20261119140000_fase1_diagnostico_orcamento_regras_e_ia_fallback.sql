-- Diagnóstico de obra — Fase 1 do orçamento: áreas/divisões, regras determinísticas
-- de sugestão de item e fallback de IA (implementado na edge function
-- quote-ai-assistant, mode=diagnostic_suggestions).
-- Origem: pedido "Fase 1 — diagnóstico + regras + IA fallback" (backend-developer).
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- --------------------------
-- Antes de um orçamento ter linhas (quote_lines), a equipa preenche um "diagnóstico"
-- por área/divisão da obra (área em m2, o que demolir, o que proteger, tipo e
-- descrição da intervenção). Cada um desses 4 campos pode gerar sugestões de
-- produtos/serviços do catálogo:
--   1ª via — regras determinísticas configuráveis pela equipa (quote_suggestion_rules),
--            resolvidas por rpc_preview_diagnostic_suggestions();
--   2ª via — fallback de IA (quote-ai-assistant, mode=diagnostic_suggestions), quando
--            nenhuma regra casa.
-- quote_diagnostic_area_suggestions guarda a origem de cada sugestão (regra ou IA)
-- para auditoria/qualidade, incluindo quando o utilizador editou o valor sugerido.
--
-- Esta migration também acrescenta quote_lines.visible_to_client, para permitir que
-- uma linha exista no orçamento interno mas não seja mostrada ao cliente (ex.: notas
-- de trabalho interno, alternativas em avaliação) — e propaga essa flag às duas
-- policies de leitura pública/portal já existentes, e à rpc_save_quote().
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql          — quotes, quote_lines, products,
--                                                        services, catalog_items,
--                                                        anew_organizations, anew_users,
--                                                        get_user_visible_org_ids(),
--                                                        current_business_user_id(),
--                                                        policies anon_quote_lines_read /
--                                                        "Client can view own quote lines"
--   20261113030000_rpc_save_quote_item_supplier_reference.sql — definição atual (mais
--                                                        recente) de rpc_save_quote(),
--                                                        integralmente copiada aqui com
--                                                        a única alteração de
--                                                        visible_to_client.
--
-- Nota de segurança (RLS): as 3 tabelas novas são estritamente internas — sem policy
-- "anon_*" nem baseada em portal_user_can_see_document(). O diagnóstico de obra nunca é
-- exposto ao portal do cliente nem ao link público de proposta.

-- ============================================================
-- 1. quote_suggestion_rules — regras determinísticas configuráveis pela equipa
-- ============================================================

CREATE TABLE quote_suggestion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES anew_organizations(id),
  phase text NOT NULL DEFAULT 'fase_1' CHECK (phase IN ('fase_1','fase_2')),
  name text NOT NULL,
  source_field text NOT NULL CHECK (source_field IN ('area_m2','demolir','proteger','intervencao')),
  intervention_type text,
  match_keyword text,
  quantity_formula_type text NOT NULL DEFAULT 'multiplier' CHECK (quantity_formula_type IN ('multiplier','fixed','per_unit_area')),
  quantity_multiplier numeric(12,4),
  quantity_fixed numeric(12,4),
  rounding text NOT NULL DEFAULT 'ceil' CHECK (rounding IN ('ceil','floor','round','none')),
  target_type text NOT NULL CHECK (target_type IN ('product','service','catalog_item')),
  product_id uuid REFERENCES products(id),
  service_id uuid REFERENCES services(id),
  catalog_item_id uuid REFERENCES catalog_items(id),
  default_qt_unit text,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES anew_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_suggestion_rules_target_check CHECK (
    (target_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL AND catalog_item_id IS NULL) OR
    (target_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL AND catalog_item_id IS NULL) OR
    (target_type = 'catalog_item' AND catalog_item_id IS NOT NULL AND product_id IS NULL AND service_id IS NULL)
  )
);

COMMENT ON TABLE quote_suggestion_rules IS
  'Regras determinísticas (1ª via) que geram sugestões de produto/serviço a partir dos campos do diagnóstico de obra (quote_diagnostic_areas). Resolvidas por rpc_preview_diagnostic_suggestions(). Sem RLS anon/portal — gestão interna da equipa.';

-- ============================================================
-- 2. quote_diagnostic_areas — uma linha por área/divisão dentro do orçamento
-- ============================================================

CREATE TABLE quote_diagnostic_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES anew_organizations(id),
  phase text NOT NULL DEFAULT 'fase_1' CHECK (phase IN ('fase_1','fase_2')),
  nome_area text NOT NULL,
  area_m2 numeric(10,2),
  demolir_descricao text,
  demolir_m2 numeric(10,2),
  proteger_descricao text,
  intervencao_tipo text,
  intervencao_descricao text,
  status text NOT NULL DEFAULT 'em_preenchimento' CHECK (status IN ('em_preenchimento','completo')),
  sort_order integer DEFAULT 0,
  created_by uuid REFERENCES anew_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE quote_diagnostic_areas IS
  'Diagnóstico de obra por área/divisão, preenchido antes das linhas do orçamento (quote_lines). status=completo exige area_m2, demolir_descricao, proteger_descricao e intervencao_tipo preenchidos (calculado por rpc_save_diagnostic_area). Gate de avanço de fase em rpc_complete_diagnostic_phase1(). Sem RLS anon/portal.';

-- ============================================================
-- 3. quote_diagnostic_area_suggestions — rastreio da origem de cada sugestão
-- ============================================================

CREATE TABLE quote_diagnostic_area_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostic_area_id uuid NOT NULL REFERENCES quote_diagnostic_areas(id) ON DELETE CASCADE,
  quote_line_id uuid REFERENCES quote_lines(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('rule','ai')),
  rule_id uuid REFERENCES quote_suggestion_rules(id),
  ai_rationale text,
  ai_confidence numeric(3,2),
  source_field text NOT NULL CHECK (source_field IN ('area_m2','demolir','proteger','intervencao')),
  suggested_qty numeric(12,4) NOT NULL,
  was_edited_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_diagnostic_area_suggestions_source_check CHECK (
    (source = 'rule' AND rule_id IS NOT NULL AND ai_rationale IS NULL) OR
    (source = 'ai' AND rule_id IS NULL AND ai_rationale IS NOT NULL)
  )
);

COMMENT ON TABLE quote_diagnostic_area_suggestions IS
  'Auditoria/qualidade: regista se cada sugestão aceite veio de uma regra determinística (source=rule) ou da IA (source=ai, quote-ai-assistant mode=diagnostic_suggestions), e se o utilizador editou a quantidade sugerida antes de gravar a linha (was_edited_by_user). Sem organization_id próprio — âmbito derivado de quote_diagnostic_areas.organization_id. Sem RLS anon/portal.';

-- ============================================================
-- 4. quotes.diagnostic_phase1_completed_at
-- ============================================================

ALTER TABLE quotes ADD COLUMN diagnostic_phase1_completed_at timestamptz;

COMMENT ON COLUMN quotes.diagnostic_phase1_completed_at IS
  'Marca quando a Fase 1 do diagnóstico de obra (quote_diagnostic_areas, phase=fase_1) foi concluída para este orçamento — escrito só por rpc_complete_diagnostic_phase1(), que valida que todas as áreas dessa fase estão status=completo.';

-- ============================================================
-- 5. quote_lines.visible_to_client
-- ============================================================

ALTER TABLE quote_lines ADD COLUMN visible_to_client boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN quote_lines.visible_to_client IS
  'Quando false, a linha existe no orçamento interno mas é ocultada das vias de leitura do cliente (link público anon_quote_lines_read e portal "Client can view own quote lines"). Default true preserva o comportamento anterior a esta migration para todas as linhas já existentes.';

-- ============================================================
-- 6. Índices
-- ============================================================

CREATE INDEX idx_quote_diagnostic_areas_quote_id ON quote_diagnostic_areas(quote_id);
CREATE INDEX idx_quote_diagnostic_areas_org ON quote_diagnostic_areas(organization_id);
CREATE INDEX idx_quote_suggestion_rules_org_active ON quote_suggestion_rules(organization_id) WHERE is_active = true;
CREATE INDEX idx_quote_diagnostic_area_suggestions_area ON quote_diagnostic_area_suggestions(diagnostic_area_id);
CREATE INDEX idx_quote_diagnostic_area_suggestions_line ON quote_diagnostic_area_suggestions(quote_line_id);
CREATE INDEX idx_quote_lines_visible_to_client ON quote_lines(quote_id) WHERE visible_to_client = false;

-- ============================================================
-- 7. RLS — estritamente interno (sem anon, sem portal) nas 3 tabelas novas
-- ============================================================

ALTER TABLE quote_suggestion_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_suggestion_rules_select_policy ON quote_suggestion_rules
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

CREATE POLICY quote_suggestion_rules_insert_policy ON quote_suggestion_rules
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

CREATE POLICY quote_suggestion_rules_update_policy ON quote_suggestion_rules
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

CREATE POLICY quote_suggestion_rules_delete_policy ON quote_suggestion_rules
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON quote_suggestion_rules TO authenticated;
GRANT ALL ON quote_suggestion_rules TO service_role;

ALTER TABLE quote_diagnostic_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_diagnostic_areas_select_policy ON quote_diagnostic_areas
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

CREATE POLICY quote_diagnostic_areas_insert_policy ON quote_diagnostic_areas
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

CREATE POLICY quote_diagnostic_areas_update_policy ON quote_diagnostic_areas
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

CREATE POLICY quote_diagnostic_areas_delete_policy ON quote_diagnostic_areas
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON quote_diagnostic_areas TO authenticated;
GRANT ALL ON quote_diagnostic_areas TO service_role;

ALTER TABLE quote_diagnostic_area_suggestions ENABLE ROW LEVEL SECURITY;

-- Sem organization_id próprio: âmbito derivado via subquery a quote_diagnostic_areas.
CREATE POLICY quote_diagnostic_area_suggestions_select_policy ON quote_diagnostic_area_suggestions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quote_diagnostic_areas qda
      WHERE qda.id = quote_diagnostic_area_suggestions.diagnostic_area_id
        AND qda.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY quote_diagnostic_area_suggestions_insert_policy ON quote_diagnostic_area_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quote_diagnostic_areas qda
      WHERE qda.id = quote_diagnostic_area_suggestions.diagnostic_area_id
        AND qda.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY quote_diagnostic_area_suggestions_update_policy ON quote_diagnostic_area_suggestions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quote_diagnostic_areas qda
      WHERE qda.id = quote_diagnostic_area_suggestions.diagnostic_area_id
        AND qda.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quote_diagnostic_areas qda
      WHERE qda.id = quote_diagnostic_area_suggestions.diagnostic_area_id
        AND qda.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY quote_diagnostic_area_suggestions_delete_policy ON quote_diagnostic_area_suggestions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quote_diagnostic_areas qda
      WHERE qda.id = quote_diagnostic_area_suggestions.diagnostic_area_id
        AND qda.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON quote_diagnostic_area_suggestions TO authenticated;
GRANT ALL ON quote_diagnostic_area_suggestions TO service_role;

-- ============================================================
-- 8. Propagar visible_to_client às policies públicas/portal existentes
-- ============================================================

-- 8a. anon_quote_lines_read (baseline, linha ~23839) — mesma condição EXISTS,
--     com "AND quote_lines.visible_to_client = true" acrescentado.
DROP POLICY IF EXISTS "anon_quote_lines_read" ON quote_lines;

CREATE POLICY "anon_quote_lines_read" ON quote_lines FOR SELECT TO anon USING (
  (EXISTS ( SELECT 1
     FROM (quotes q
       JOIN proposals p ON (p.id = q.proposal_id))
    WHERE ((q.id = quote_lines.quote_id) AND (p.public_link_enabled = true))))
  AND quote_lines.visible_to_client = true
);

-- 8b. "Client can view own quote lines" (baseline, linha ~21408) — mesma
--     condição via portal_user_can_see_document(), com o mesmo AND acrescentado.
DROP POLICY IF EXISTS "Client can view own quote lines" ON quote_lines;

CREATE POLICY "Client can view own quote lines" ON quote_lines FOR SELECT USING (
  portal_user_can_see_document('quote'::portal_document_type, quote_id)
  AND quote_lines.visible_to_client = true
);

-- ============================================================
-- 9. rpc_save_quote() — re-asserted, com visible_to_client nos dois INSERTs
-- ============================================================
-- Corpo COPIADO integralmente de 20261113030000_rpc_save_quote_item_supplier_reference.sql
-- (a definição mais recente — confirmado por
-- `grep -rl "FUNCTION public.rpc_save_quote" supabase/migrations/`), com UMA
-- alteração cirúrgica em cada um dos dois INSERT INTO quote_lines: coluna
-- `visible_to_client` acrescentada, com
-- `COALESCE((v_line ->> 'visible_to_client')::boolean, true)` /
-- `COALESCE((v_iq_line ->> 'visible_to_client')::boolean, true)` — payloads
-- antigos sem essa chave continuam a gravar true, exatamente o comportamento
-- anterior a esta migration. Nenhuma outra lógica, assinatura ou comportamento
-- foi alterado.

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
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
        visible_to_client
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
        COALESCE((v_line ->> 'visible_to_client')::boolean, true)
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
          visible_to_client
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
$$;

REVOKE ALL ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================
-- 10. rpc_preview_diagnostic_suggestions() — 1ª via (regras determinísticas)
-- ============================================================
-- Devolve SEMPRE um array jsonb ('[]'::jsonb quando nenhuma regra casa) — nunca
-- erro por ausência de match. Erra apenas em falha de autorização/parâmetro
-- inválido/área inexistente, tal como as restantes RPCs deste ficheiro.

CREATE OR REPLACE FUNCTION public.rpc_preview_diagnostic_suggestions(
  p_diagnostic_area_id uuid,
  p_source_field       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_area       public.quote_diagnostic_areas;
  v_text_field text;
  v_base_area  numeric;
  v_qty        numeric;
  v_result     jsonb := '[]'::jsonb;
  v_rule       record;
BEGIN
  IF p_source_field NOT IN ('area_m2','demolir','proteger','intervencao') THEN
    RAISE EXCEPTION 'Campo de origem inválido: %', p_source_field USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_area FROM public.quote_diagnostic_areas WHERE id = p_diagnostic_area_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Área de diagnóstico não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_area.organization_id IS NULL
     OR v_area.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Área fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_text_field := CASE p_source_field
    WHEN 'demolir'     THEN v_area.demolir_descricao
    WHEN 'proteger'    THEN v_area.proteger_descricao
    WHEN 'intervencao' THEN v_area.intervencao_descricao
    ELSE NULL
  END;

  -- Nota: filtra também por qsr.phase = v_area.phase (não pedido literalmente no
  -- enunciado, mas necessário para que regras de fase_2 não se apliquem a áreas
  -- de fase_1 e vice-versa — sinalizado no relatório final).
  FOR v_rule IN
    SELECT *
    FROM public.quote_suggestion_rules qsr
    WHERE qsr.organization_id = v_area.organization_id
      AND qsr.is_active = true
      AND qsr.phase = v_area.phase
      AND qsr.source_field = p_source_field
      AND (qsr.intervention_type IS NULL OR qsr.intervention_type = v_area.intervencao_tipo)
      AND (qsr.match_keyword IS NULL OR v_text_field ILIKE ('%' || qsr.match_keyword || '%'))
    ORDER BY qsr.priority DESC
  LOOP
    v_base_area := CASE
      WHEN p_source_field = 'demolir' AND v_area.demolir_m2 IS NOT NULL THEN v_area.demolir_m2
      ELSE v_area.area_m2
    END;

    v_qty := CASE v_rule.quantity_formula_type
      WHEN 'fixed'         THEN v_rule.quantity_fixed
      WHEN 'per_unit_area' THEN COALESCE(v_rule.quantity_multiplier, 0) * COALESCE(v_base_area, 0)
      WHEN 'multiplier'    THEN COALESCE(v_rule.quantity_multiplier, 0) * 1
      ELSE NULL
    END;

    CONTINUE WHEN v_qty IS NULL;

    v_qty := CASE v_rule.rounding
      WHEN 'ceil'  THEN ceil(v_qty)
      WHEN 'floor' THEN floor(v_qty)
      WHEN 'round' THEN round(v_qty)
      ELSE v_qty
    END;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'source',          'rule',
      'rule_id',         v_rule.id,
      'target_type',     v_rule.target_type,
      'product_id',      v_rule.product_id,
      'service_id',      v_rule.service_id,
      'catalog_item_id', v_rule.catalog_item_id,
      'descricao',       v_rule.name,
      'qty',             v_qty,
      'unidade',         v_rule.default_qt_unit
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_preview_diagnostic_suggestions(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_preview_diagnostic_suggestions(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_preview_diagnostic_suggestions(uuid, text) IS
  'Resolve as regras determinísticas (quote_suggestion_rules) que casam com um campo do diagnóstico de obra (quote_diagnostic_areas), calcula a quantidade sugerida e devolve um array jsonb ordenado por priority DESC. Devolve [] quando nada casa — nunca erro por ausência de match.';

-- ============================================================
-- 11. rpc_save_diagnostic_area() — cria/atualiza uma área de diagnóstico
-- ============================================================
-- Nota: o enunciado descreve a assinatura como
-- (p_quote_id uuid, p_area_id uuid DEFAULT NULL, p_area_data jsonb) — inválida em
-- PostgreSQL, que exige que todo o parâmetro a seguir a um com DEFAULT tenha
-- também DEFAULT. p_area_data recebe aqui DEFAULT NULL, com validação explícita
-- no corpo da função (RAISE EXCEPTION se vier NULL) — sinalizado no relatório final.

CREATE OR REPLACE FUNCTION public.rpc_save_diagnostic_area(
  p_quote_id  uuid,
  p_area_id   uuid DEFAULT NULL,
  p_area_data jsonb DEFAULT NULL
)
RETURNS public.quote_diagnostic_areas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id                uuid;
  v_actor                 uuid;
  v_area                  public.quote_diagnostic_areas;
  v_nome_area             text;
  v_area_m2               numeric;
  v_demolir_descricao     text;
  v_demolir_m2            numeric;
  v_proteger_descricao    text;
  v_intervencao_tipo      text;
  v_intervencao_descricao text;
  v_phase                 text;
  v_sort_order            integer;
  v_status                text;
BEGIN
  IF p_area_data IS NULL THEN
    RAISE EXCEPTION 'p_area_data é obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org_id IS NULL
     OR v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();

  v_nome_area              := nullif(p_area_data ->> 'nome_area', '');
  v_area_m2                := (p_area_data ->> 'area_m2')::numeric;
  v_demolir_descricao      := nullif(p_area_data ->> 'demolir_descricao', '');
  v_demolir_m2             := (p_area_data ->> 'demolir_m2')::numeric;
  v_proteger_descricao     := nullif(p_area_data ->> 'proteger_descricao', '');
  v_intervencao_tipo       := nullif(p_area_data ->> 'intervencao_tipo', '');
  v_intervencao_descricao  := nullif(p_area_data ->> 'intervencao_descricao', '');
  v_phase                  := COALESCE(nullif(p_area_data ->> 'phase', ''), 'fase_1');
  v_sort_order             := COALESCE((p_area_data ->> 'sort_order')::integer, 0);

  -- Todos os 4 campos obrigatórios têm de estar preenchidos e não vazios.
  v_status := CASE
    WHEN v_area_m2 IS NOT NULL
     AND v_demolir_descricao IS NOT NULL
     AND v_proteger_descricao IS NOT NULL
     AND v_intervencao_tipo IS NOT NULL
    THEN 'completo'
    ELSE 'em_preenchimento'
  END;

  IF p_area_id IS NULL THEN
    INSERT INTO public.quote_diagnostic_areas (
      quote_id, organization_id, phase, nome_area, area_m2,
      demolir_descricao, demolir_m2, proteger_descricao,
      intervencao_tipo, intervencao_descricao, status, sort_order, created_by
    ) VALUES (
      p_quote_id, v_org_id, v_phase, v_nome_area, v_area_m2,
      v_demolir_descricao, v_demolir_m2, v_proteger_descricao,
      v_intervencao_tipo, v_intervencao_descricao, v_status, v_sort_order, v_actor
    )
    RETURNING * INTO v_area;
  ELSE
    UPDATE public.quote_diagnostic_areas
    SET nome_area              = v_nome_area,
        area_m2                = v_area_m2,
        demolir_descricao      = v_demolir_descricao,
        demolir_m2             = v_demolir_m2,
        proteger_descricao     = v_proteger_descricao,
        intervencao_tipo       = v_intervencao_tipo,
        intervencao_descricao  = v_intervencao_descricao,
        status                 = v_status,
        sort_order             = v_sort_order,
        phase                  = v_phase,
        updated_at             = now()
    WHERE id = p_area_id AND quote_id = p_quote_id
    RETURNING * INTO v_area;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Área de diagnóstico não encontrada para este orçamento' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN v_area;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_diagnostic_area(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_diagnostic_area(uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.rpc_save_diagnostic_area(uuid, uuid, jsonb) IS
  'Cria (p_area_id NULL) ou atualiza uma linha de quote_diagnostic_areas. Calcula status=completo quando area_m2, demolir_descricao, proteger_descricao e intervencao_tipo estão todos preenchidos; caso contrário em_preenchimento.';

-- ============================================================
-- 12. rpc_complete_diagnostic_phase1() — gate de avanço da Fase 1
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_complete_diagnostic_phase1(
  p_quote_id uuid
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id            uuid;
  v_total_areas       integer;
  v_incomplete_areas  integer;
  v_quote             public.quotes;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org_id IS NULL
     OR v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status <> 'completo')
  INTO   v_total_areas, v_incomplete_areas
  FROM   public.quote_diagnostic_areas
  WHERE  quote_id = p_quote_id AND phase = 'fase_1';

  IF v_total_areas = 0 OR v_incomplete_areas > 0 THEN
    RAISE EXCEPTION 'Todas as áreas de diagnóstico têm de estar completas antes de avançar.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.quotes
  SET diagnostic_phase1_completed_at = now()
  WHERE id = p_quote_id
  RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_complete_diagnostic_phase1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_complete_diagnostic_phase1(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_complete_diagnostic_phase1(uuid) IS
  'Marca quotes.diagnostic_phase1_completed_at = now() quando existe pelo menos uma quote_diagnostic_areas de phase=fase_1 para o orçamento e TODAS estão status=completo. Erra com mensagem em português caso contrário.';

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. quote_lines.visible_to_client existe, default true, NOT NULL:
--      SELECT column_default, is_nullable FROM information_schema.columns
--      WHERE table_name = 'quote_lines' AND column_name = 'visible_to_client';
--
-- 2. rpc_save_quote grava visible_to_client nas duas listas de INSERT:
--      SELECT pg_get_functiondef('public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure)
--        LIKE '%visible_to_client%';
--      -- Esperado: true.
--
-- 3. anon_quote_lines_read / "Client can view own quote lines" continuam a
--    respeitar as condições anteriores (public_link_enabled / portal_user_can_see_document)
--    e agora também visible_to_client = true.
--
-- 4. rpc_preview_diagnostic_suggestions devolve '[]'::jsonb (nunca erro) quando
--    nenhuma quote_suggestion_rules casa com o source_field/keyword/intervention_type.
--
-- 5. rpc_complete_diagnostic_phase1 rejeita quando existem 0 áreas de fase_1 ou
--    pelo menos uma não está status=completo.
