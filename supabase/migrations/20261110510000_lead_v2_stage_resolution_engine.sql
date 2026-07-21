-- Fase 2 (parte 2) / base da Fase 3 — motor de resolução de etapa.
--
-- DECISÃO DE FORMATO (pendente desde a Fase 2, resolvida agora a pedido do
-- utilizador para avançar com a Fase 3): a Fase 2 descrevia reached_when
-- como {all:[...], any:[...]}; a Fase 3 descreve-o como
-- {op:"AND"|"OR", conditions:[{type,...}]}. São incompatíveis. Adoptamos o
-- formato da Fase 3 como definitivo, porque é o que o editor de regras
-- (StageRulesEditor.tsx, ainda por construir) vai efectivamente gravar —
-- stage_reached() abaixo lê exclusivamente {op,conditions}.
--
-- Catálogo de condições suportado (mesmo catálogo enumerado na secção
-- "Condições de entrada" da Fase 3):
--   { "type": "has_assignee" }
--   { "type": "has_active_deal" }
--   { "type": "has_active_quote" }
--   { "type": "has_active_proposal" }
--   { "type": "has_signed_contract" }
--   { "type": "status_in", "values": ["qualified", ...] }
--   { "type": "qualification_is", "value": "mql" | "sql" }
--
-- Regra vazia (reached_when IS NULL, ou sem "conditions") -> comportamento
-- preservado da Fase 1: true apenas se lead_status = ANY(matching_statuses).
-- Isto é o que mantém o dashboard idêntico para orgs que não configuraram
-- nada (todas as stages de template têm reached_when NULL).

CREATE OR REPLACE FUNCTION public.stage_reached(
  p_signals jsonb,
  p_rule jsonb,
  p_lead_status text,
  p_matching text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_op text;
  v_cond jsonb;
  v_cond_result boolean;
  v_all_true boolean := true;
  v_any_true boolean := false;
  v_has_conditions boolean := false;
BEGIN
  IF p_rule IS NULL OR jsonb_typeof(p_rule) = 'null' OR NOT (p_rule ? 'conditions') THEN
    RETURN p_matching IS NOT NULL AND p_lead_status = ANY(p_matching);
  END IF;

  v_op := UPPER(COALESCE(p_rule->>'op', 'AND'));

  FOR v_cond IN SELECT * FROM jsonb_array_elements(COALESCE(p_rule->'conditions', '[]'::jsonb))
  LOOP
    v_has_conditions := true;

    v_cond_result := CASE v_cond->>'type'
      WHEN 'has_assignee' THEN COALESCE((p_signals->>'has_assignee')::boolean, false)
      WHEN 'has_active_deal' THEN COALESCE((p_signals->>'has_active_deal')::boolean, false)
      WHEN 'has_active_quote' THEN COALESCE((p_signals->>'has_active_quote')::boolean, false)
      WHEN 'has_active_proposal' THEN COALESCE((p_signals->>'has_active_proposal')::boolean, false)
      WHEN 'has_signed_contract' THEN COALESCE((p_signals->>'has_signed_contract')::boolean, false)
      WHEN 'status_in' THEN p_lead_status = ANY(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cond->'values', '[]'::jsonb)))
      )
      WHEN 'qualification_is' THEN CASE v_cond->>'value'
        WHEN 'mql' THEN COALESCE((p_signals->>'has_qualification_mql')::boolean, false)
        WHEN 'sql' THEN COALESCE((p_signals->>'has_qualification_sql')::boolean, false)
        ELSE false
      END
      ELSE false
    END;

    IF NOT v_cond_result THEN
      v_all_true := false;
    ELSE
      v_any_true := true;
    END IF;
  END LOOP;

  IF NOT v_has_conditions THEN
    RETURN p_matching IS NOT NULL AND p_lead_status = ANY(p_matching);
  END IF;

  IF v_op = 'OR' THEN
    RETURN v_any_true;
  ELSE
    RETURN v_all_true;
  END IF;
END;
$function$;

-- ============================================================
-- compute_lead_stage_v2 — resolve a etapa de uma lead
-- ============================================================
-- Usa as etapas próprias da organização se existirem; caso contrário usa as
-- etapas-template (organization_id IS NULL) — o mesmo fallback que
-- LeadWorkflowConfig.tsx já usa para decidir isUsingTemplate (loadStages +
-- loadTemplateStages, confirmado no código-fonte). Sem este fallback,
-- qualquer organização que nunca abriu o editor de Workflow (a maioria,
-- hoje) ficaria sem nenhuma etapa a avaliar.
CREATE OR REPLACE FUNCTION public.compute_lead_stage_v2(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_status text;
  v_signals jsonb;
  v_has_org_stages boolean;
  v_stage record;
BEGIN
  SELECT organization_id, status INTO v_org, v_status
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_signals := public.evaluate_lead_signals_v2(p_lead_id);

  SELECT EXISTS (
    SELECT 1 FROM public.lead_workflow_stages
    WHERE organization_id = v_org AND is_active = true
  ) INTO v_has_org_stages;

  FOR v_stage IN
    SELECT id, reached_when, matching_statuses
    FROM public.lead_workflow_stages
    WHERE is_active = true
      AND (
        (v_has_org_stages AND organization_id = v_org)
        OR (NOT v_has_org_stages AND organization_id IS NULL)
      )
    ORDER BY stage_order DESC
  LOOP
    IF public.stage_reached(v_signals, v_stage.reached_when, v_status, v_stage.matching_statuses) THEN
      RETURN v_stage.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.compute_lead_stage_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_lead_stage_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lead_stage_v2(uuid) TO service_role;

-- ============================================================
-- Trigger de "sujidade" (Fase 2 §3) — apenas anota, não recalcula aqui
-- ============================================================
ALTER TABLE public.anew_leads
  ADD COLUMN IF NOT EXISTS pipeline_dirty_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.fn_mark_lead_pipeline_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
BEGIN
  v_entity_id := COALESCE(NEW.entity_id, OLD.entity_id);
  IF v_entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.anew_leads
  SET pipeline_dirty_at = now()
  WHERE entity_id = v_entity_id
    AND deleted_at IS NULL;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_deals_mark_lead_pipeline_dirty ON public.deals;
CREATE TRIGGER trg_deals_mark_lead_pipeline_dirty
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.fn_mark_lead_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_quotes_mark_lead_pipeline_dirty ON public.quotes;
CREATE TRIGGER trg_quotes_mark_lead_pipeline_dirty
  AFTER INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_mark_lead_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_proposals_mark_lead_pipeline_dirty ON public.proposals;
CREATE TRIGGER trg_proposals_mark_lead_pipeline_dirty
  AFTER INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_mark_lead_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_client_contracts_mark_lead_pipeline_dirty ON public.client_contracts;
CREATE TRIGGER trg_client_contracts_mark_lead_pipeline_dirty
  AFTER INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_mark_lead_pipeline_dirty();

DROP TRIGGER IF EXISTS trg_entity_interactions_mark_lead_pipeline_dirty ON public.entity_interactions;
CREATE TRIGGER trg_entity_interactions_mark_lead_pipeline_dirty
  AFTER INSERT OR UPDATE ON public.entity_interactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_mark_lead_pipeline_dirty();

-- Nota: esta função faz um UPDATE directo em anew_leads (não em si própria),
-- por isso não há recursão a proteger aqui (ao contrário do que o texto da
-- Fase 2 sugere ser necessário) — os triggers estão em deals/quotes/
-- proposals/client_contracts/entity_interactions, nunca em anew_leads.

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. SELECT compute_lead_stage_v2(id), status FROM anew_leads LIMIT 20;
--    para orgs sem stages próprias (a maioria hoje), o stage devolvido deve
--    ser sempre o template cujo matching_statuses = ARRAY[status] da lead
--    (comportamento idêntico ao actual, porque reached_when é NULL em todos
--    os templates).
-- 2. UPDATE um deal/proposta/quote real e confirmar que
--    anew_leads.pipeline_dirty_at da lead correspondente mudou para now().
-- 3. Testar stage_reached com uma regra {op:"AND",conditions:[...]} a sério
--    depois de a Fase 3 (UI) gravar uma, para confirmar a leitura do JSON.
