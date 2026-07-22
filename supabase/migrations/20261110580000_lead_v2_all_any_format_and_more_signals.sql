-- Muda o formato de reached_when/mql_when/sql_when de {op,conditions} para
-- {all:[...], any:[...]} — o formato original da Fase 2, agora escolhido em
-- definitivo depois de comparar com a UI equivalente no Lovable (duas
-- colunas TODAS/QUALQUER) e decidir por uma lista única com um selector por
-- linha (Obrigatória/Qualquer/Nenhuma) em vez de duas colunas duplicadas.
--
-- Confirmado ao vivo antes desta migração: 0 organizações têm mql_when/
-- sql_when persistidos; os 9 estágios que pareciam ter reached_when
-- "não nulo" tinham apenas o literal JSON `null` (jsonb 'null' ≠ SQL NULL),
-- resíduo inofensivo do formulário a enviar `reached_when: null` — nenhuma
-- regra real persistida em lado nenhum. Seguro substituir sem migração de
-- dados.
--
-- Também acrescenta 5 sinais em falta, encontrados ao comparar o catálogo
-- de condições com o equivalente já construído no Lovable:
--   has_source            -- anew_leads.source preenchido
--   has_contact_logged    -- alguma vez existiu uma entity_interactions
--   has_scheduled_visit   -- anew_leads.scheduled_visit_id preenchido
--   last_contact_is_negative / last_contact_is_positive
--     -- classificação do ÚLTIMO contacto (distinto de has_negative_result/
--     -- has_positive_result, que são agregados sobre TODO o histórico)

-- ============================================================
-- evaluate_lead_signals_v2 — 5 sinais novos
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_lead_signals_v2(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_assigned_to uuid;
  v_qualification_type text;
  v_source text;
  v_scheduled_visit_id uuid;
  v_last_contact_result_id text;
  v_has_negative_result boolean;
  v_has_positive_result boolean;
  v_has_contact_logged boolean;
  v_last_is_negative boolean;
  v_last_is_positive boolean;
BEGIN
  SELECT entity_id, assigned_to, qualification_type, source, scheduled_visit_id
  INTO v_entity_id, v_assigned_to, v_qualification_type, v_source, v_scheduled_visit_id
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_assignee', false,
      'has_active_deal', false,
      'has_active_quote', false,
      'has_active_proposal', false,
      'has_signed_contract', false,
      'has_qualification_mql', false,
      'has_qualification_sql', false,
      'last_contact_result_id', NULL,
      'has_negative_result', false,
      'has_positive_result', false,
      'has_source', false,
      'has_contact_logged', false,
      'has_scheduled_visit', false,
      'last_contact_is_negative', false,
      'last_contact_is_positive', false
    );
  END IF;

  IF v_entity_id IS NOT NULL THEN
    SELECT ei.result
    INTO v_last_contact_result_id
    FROM public.entity_interactions ei
    WHERE ei.entity_id = v_entity_id
    ORDER BY ei.interaction_at DESC NULLS LAST, ei.created_at DESC
    LIMIT 1;

    SELECT EXISTS (SELECT 1 FROM public.entity_interactions ei WHERE ei.entity_id = v_entity_id)
    INTO v_has_contact_logged;

    SELECT
      EXISTS (
        SELECT 1 FROM public.entity_interactions ei
        JOIN public.lead_contact_results lcr ON lcr.id::text = ei.result
        WHERE ei.entity_id = v_entity_id AND lcr.is_negative = true
      ),
      EXISTS (
        SELECT 1 FROM public.entity_interactions ei
        JOIN public.lead_contact_results lcr ON lcr.id::text = ei.result
        WHERE ei.entity_id = v_entity_id AND lcr.is_positive = true
      )
    INTO v_has_negative_result, v_has_positive_result;
  ELSE
    v_last_contact_result_id := NULL;
    v_has_negative_result := false;
    v_has_positive_result := false;
    v_has_contact_logged := false;
  END IF;

  SELECT
    COALESCE(lcr.is_negative, false),
    COALESCE(lcr.is_positive, false)
  INTO v_last_is_negative, v_last_is_positive
  FROM public.lead_contact_results lcr
  WHERE lcr.id::text = v_last_contact_result_id;

  RETURN jsonb_build_object(
    'has_assignee', v_assigned_to IS NOT NULL,
    'has_active_deal', v_entity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.entity_id = v_entity_id
        AND d.deleted_at IS NULL
        AND d.closed_at IS NULL
        AND d.lost_reason IS NULL
    ),
    'has_active_quote', v_entity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.entity_id = v_entity_id
        AND q.deleted_at IS NULL
        AND q.estado <> 'perdido'
    ),
    'has_active_proposal', v_entity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.entity_id = v_entity_id
        AND p.deleted_at IS NULL
        AND p.status <> 'rejected'
    ),
    'has_signed_contract', v_entity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.client_contracts cc
      WHERE cc.entity_id = v_entity_id
        AND cc.deleted_at IS NULL
        AND cc.status = 'signed'
    ),
    'has_qualification_mql', COALESCE(v_qualification_type = 'mql', false),
    'has_qualification_sql', COALESCE(v_qualification_type = 'sql', false),
    'last_contact_result_id', v_last_contact_result_id,
    'has_negative_result', v_has_negative_result,
    'has_positive_result', v_has_positive_result,
    'has_source', COALESCE(NULLIF(v_source, ''), NULL) IS NOT NULL,
    'has_contact_logged', v_has_contact_logged,
    'has_scheduled_visit', v_scheduled_visit_id IS NOT NULL,
    'last_contact_is_negative', v_last_is_negative,
    'last_contact_is_positive', v_last_is_positive
  );
END;
$function$;

-- ============================================================
-- evaluate_condition — avalia uma única condição (partilhado entre "all" e
-- "any" dentro de stage_reached)
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_condition(
  p_condition jsonb,
  p_signals jsonb,
  p_lead_status text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  RETURN CASE p_condition->>'type'
    WHEN 'has_assignee' THEN COALESCE((p_signals->>'has_assignee')::boolean, false)
    WHEN 'has_active_deal' THEN COALESCE((p_signals->>'has_active_deal')::boolean, false)
    WHEN 'has_active_quote' THEN COALESCE((p_signals->>'has_active_quote')::boolean, false)
    WHEN 'has_active_proposal' THEN COALESCE((p_signals->>'has_active_proposal')::boolean, false)
    WHEN 'has_signed_contract' THEN COALESCE((p_signals->>'has_signed_contract')::boolean, false)
    WHEN 'has_source' THEN COALESCE((p_signals->>'has_source')::boolean, false)
    WHEN 'has_contact_logged' THEN COALESCE((p_signals->>'has_contact_logged')::boolean, false)
    WHEN 'has_scheduled_visit' THEN COALESCE((p_signals->>'has_scheduled_visit')::boolean, false)
    WHEN 'has_negative_result' THEN COALESCE((p_signals->>'has_negative_result')::boolean, false)
    WHEN 'has_positive_result' THEN COALESCE((p_signals->>'has_positive_result')::boolean, false)
    WHEN 'last_contact_is_negative' THEN COALESCE((p_signals->>'last_contact_is_negative')::boolean, false)
    WHEN 'last_contact_is_positive' THEN COALESCE((p_signals->>'last_contact_is_positive')::boolean, false)
    WHEN 'status_in' THEN p_lead_status = ANY(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_condition->'values', '[]'::jsonb)))
    )
    WHEN 'qualification_is' THEN CASE p_condition->>'value'
      WHEN 'mql' THEN COALESCE((p_signals->>'has_qualification_mql')::boolean, false)
      WHEN 'sql' THEN COALESCE((p_signals->>'has_qualification_sql')::boolean, false)
      ELSE false
    END
    WHEN 'last_contact_result' THEN (
      CASE WHEN COALESCE((p_condition->>'is')::boolean, true)
        THEN p_signals->>'last_contact_result_id' = p_condition->>'result_id'
        ELSE COALESCE(p_signals->>'last_contact_result_id' <> p_condition->>'result_id', true)
      END
    )
    ELSE false
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_condition(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_condition(jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_condition(jsonb, jsonb, text) TO service_role;

-- ============================================================
-- stage_reached — agora lê {all:[...], any:[...]}
-- ============================================================
-- all: todas têm de ser verdadeiras (vazio = sem obrigatórias).
-- any: pelo menos uma tem de ser verdadeira (vazio = sem "qualquer uma").
-- Regra vazia (all e any ambos vazios/ausentes) -> comportamento da Fase 1
-- preservado: true apenas se lead_status = ANY(matching_statuses).
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
  v_all jsonb;
  v_any jsonb;
  v_cond jsonb;
  v_all_true boolean := true;
  v_any_true boolean := false;
  v_has_all boolean := false;
  v_has_any boolean := false;
BEGIN
  v_all := COALESCE(p_rule->'all', '[]'::jsonb);
  v_any := COALESCE(p_rule->'any', '[]'::jsonb);

  IF jsonb_array_length(v_all) = 0 AND jsonb_array_length(v_any) = 0 THEN
    RETURN p_matching IS NOT NULL AND p_lead_status = ANY(p_matching);
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(v_all)
  LOOP
    v_has_all := true;
    IF NOT public.evaluate_condition(v_cond, p_signals, p_lead_status) THEN
      v_all_true := false;
    END IF;
  END LOOP;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(v_any)
  LOOP
    v_has_any := true;
    IF public.evaluate_condition(v_cond, p_signals, p_lead_status) THEN
      v_any_true := true;
    END IF;
  END LOOP;

  RETURN (NOT v_has_all OR v_all_true) AND (NOT v_has_any OR v_any_true);
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. stage_reached com {"all":[{"type":"has_assignee"}],"any":[]} deve
--    devolver o mesmo que antes (AND puro, agora expresso como "all").
-- 2. stage_reached com {"all":[],"any":[{"type":"has_negative_result"},
--    {"type":"has_positive_result"}]} deve devolver o mesmo que o OR puro
--    testado antes com o formato antigo.
-- 3. stage_reached com AMBOS all e any preenchidos deve exigir os dois
--    simultaneamente (obrigatórias E pelo menos uma das opcionais).
-- 4. evaluate_lead_signals_v2 deve devolver has_source/has_contact_logged/
--    has_scheduled_visit/last_contact_is_negative/last_contact_is_positive
--    correctos para leads reais com/sem cada uma destas características.
