-- Resultados de contacto como sinais configuráveis nas regras de estágio.
--
-- Pedido do utilizador: em vez de um flag `triggers_lost` hardcoded, todos
-- os resultados de lead_contact_results (globais + da organização) devem
-- aparecer como sinais seleccionáveis no editor de regras de qualquer
-- estágio, para cada empresa escolher livremente que resultados marcam
-- Lost, Qualificado, etc.
--
-- IMPORTANTE (clarificado pelo utilizador): isto NÃO é sobre uma tabela
-- "v2" paralela — é o motor REAL já construído nesta sessão
-- (evaluate_lead_signals_v2/stage_reached/compute_lead_stage_v2). A fonte
-- de dados tem de ser entity_interactions, confirmado ao vivo como a
-- tabela real onde as interacções/contactos ficam registadas — a tabela
-- lead_contact_history mencionada num documento anterior NÃO existe ao
-- vivo (estava na baseline mas foi removida por uma migração posterior;
-- confirmado via information_schema.tables antes de escrever esta
-- migração). entity_interactions.result é texto: por vezes um uuid (FK
-- textual para lead_contact_results.id), por vezes um literal legado
-- ('answered'/'no_answer'/'busy') de antes de lead_contact_results
-- existir — comparações usam lcr.id::text = ei.result (nunca um cast de
-- ei.result para uuid, que rebentaria nos literais legados).
--
-- Também confirmado ao vivo: NENHUM estágio Lost, em nenhuma organização,
-- tem hoje qualquer reached_when (todos NULL) — não existe nenhum
-- fallback automático "has_negative_result → Lost" a remover ou a
-- reverter (o "turno anterior" referido num documento colado pelo
-- utilizador não corresponde a nada gravado nesta base de dados). Por
-- isso esta migração não inclui remoção nem migração de dados — constrói
-- a capacidade de raiz.

-- ============================================================
-- evaluate_lead_signals_v2 — acrescenta sinais de resultado de contacto
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
  v_last_contact_result_id text;
  v_has_negative_result boolean;
  v_has_positive_result boolean;
BEGIN
  SELECT entity_id, assigned_to, qualification_type
  INTO v_entity_id, v_assigned_to, v_qualification_type
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
      'has_positive_result', false
    );
  END IF;

  IF v_entity_id IS NOT NULL THEN
    SELECT ei.result
    INTO v_last_contact_result_id
    FROM public.entity_interactions ei
    WHERE ei.entity_id = v_entity_id
    ORDER BY ei.interaction_at DESC NULLS LAST, ei.created_at DESC
    LIMIT 1;

    SELECT
      EXISTS (
        SELECT 1
        FROM public.entity_interactions ei
        JOIN public.lead_contact_results lcr ON lcr.id::text = ei.result
        WHERE ei.entity_id = v_entity_id AND lcr.is_negative = true
      ),
      EXISTS (
        SELECT 1
        FROM public.entity_interactions ei
        JOIN public.lead_contact_results lcr ON lcr.id::text = ei.result
        WHERE ei.entity_id = v_entity_id AND lcr.is_positive = true
      )
    INTO v_has_negative_result, v_has_positive_result;
  ELSE
    v_last_contact_result_id := NULL;
    v_has_negative_result := false;
    v_has_positive_result := false;
  END IF;

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
    'has_positive_result', v_has_positive_result
  );
END;
$function$;

-- ============================================================
-- stage_reached — novos tipos de condição
-- ============================================================
-- last_contact_result: { "type": "last_contact_result", "result_id": "<uuid>", "is": true|false }
--   "is" omitido == true (comportamento "é"); "is": false == "não é".
-- has_negative_result / has_positive_result: sem parâmetros, agregados
-- (qualquer interacção da lead, não só a última).
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
      WHEN 'last_contact_result' THEN (
        CASE WHEN COALESCE((v_cond->>'is')::boolean, true)
          THEN p_signals->>'last_contact_result_id' = v_cond->>'result_id'
          ELSE COALESCE(p_signals->>'last_contact_result_id' <> v_cond->>'result_id', true)
        END
      )
      WHEN 'has_negative_result' THEN COALESCE((p_signals->>'has_negative_result')::boolean, false)
      WHEN 'has_positive_result' THEN COALESCE((p_signals->>'has_positive_result')::boolean, false)
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
-- Verification notes (not executed)
-- ============================================================
-- 1. Escolher uma lead com uma entity_interactions.result real (uuid de
--    lead_contact_results) e confirmar que evaluate_lead_signals_v2 devolve
--    last_contact_result_id igual a esse uuid, e has_negative_result/
--    has_positive_result batem com lcr.is_negative/is_positive dessa lead.
-- 2. stage_reached com {"type":"last_contact_result","result_id":"<uuid>"}
--    deve devolver true só para leads cujo ÚLTIMO contacto tem esse result.
-- 3. Confirmar que leads sem qualquer entity_interactions devolvem
--    last_contact_result_id=NULL e ambos os agregados false, sem excepção.
