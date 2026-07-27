-- Corrige um bug real encontrado ao verificar a migração anterior
-- (20261110580000) contra leads reais: last_contact_is_negative/positive
-- devolviam NULL em vez de false quando o último resultado de contacto não
-- corresponde a nenhuma linha real de lead_contact_results (ex.: literais
-- legados como 'answered'). Causa: `SELECT ... INTO var FROM ... WHERE
-- <sem correspondência>` deixa `var` NULL — o COALESCE nunca chega a
-- executar porque não há nenhuma linha para o aplicar. Corrigido usando
-- bool_or(...), que garante sempre uma linha (mesmo com zero
-- correspondências, um agregado devolve uma linha com NULL, que o COALESCE
-- então resolve para false correctamente).

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

  -- FIX: bool_or() over an aggregate always returns exactly one row (NULL
  -- when zero matches), so COALESCE correctly resolves to false instead of
  -- the whole SELECT INTO silently leaving the variables NULL.
  SELECT
    COALESCE(bool_or(lcr.is_negative), false),
    COALESCE(bool_or(lcr.is_positive), false)
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
-- Verification notes (not executed)
-- ============================================================
-- 1. Repetir o teste que encontrou o bug (leads cujo último contacto é o
--    literal legado 'answered') e confirmar last_contact_is_negative/
--    positive = false (não NULL).
