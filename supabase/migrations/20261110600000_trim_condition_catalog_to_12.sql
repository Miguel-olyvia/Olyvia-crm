-- Corta o catálogo de condições para exactamente as 12 opções pedidas pelo
-- utilizador (as mesmas mostradas nas duas imagens do equivalente já
-- construído no Lovable): has_assignee, has_source, has_contact_logged,
-- has_scheduled_visit, has_active_deal, has_active_quote,
-- has_active_proposal, has_signed_contract, qualification_is (mql/sql),
-- last_contact_is_negative, last_contact_is_positive.
--
-- Removidos por deixarem de ser alcançáveis a partir da UI (o catálogo do
-- frontend já não os constrói): status_in (redundante com "Status literais
-- associados", que é um campo dedicado à parte, não uma condição),
-- last_contact_result por nome específico (substituído pela versão mais
-- simples last_contact_is_negative/positive), has_negative_result/
-- has_positive_result agregados sobre TODO o histórico (substituídos pela
-- versão "último contacto" apenas). Limpeza de código morto — nada na app
-- consegue construir estes tipos de condição depois desta migração.

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
  ELSE
    v_last_contact_result_id := NULL;
    v_has_contact_logged := false;
  END IF;

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
    'has_source', COALESCE(NULLIF(v_source, ''), NULL) IS NOT NULL,
    'has_contact_logged', v_has_contact_logged,
    'has_scheduled_visit', v_scheduled_visit_id IS NOT NULL,
    'last_contact_is_negative', v_last_is_negative,
    'last_contact_is_positive', v_last_is_positive
  );
END;
$function$;

-- ============================================================
-- evaluate_condition — só os 8 tipos de condição usados pelas 12 opções
-- (qualification_is cobre 2 delas com "value")
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
    WHEN 'has_source' THEN COALESCE((p_signals->>'has_source')::boolean, false)
    WHEN 'has_contact_logged' THEN COALESCE((p_signals->>'has_contact_logged')::boolean, false)
    WHEN 'has_scheduled_visit' THEN COALESCE((p_signals->>'has_scheduled_visit')::boolean, false)
    WHEN 'has_active_deal' THEN COALESCE((p_signals->>'has_active_deal')::boolean, false)
    WHEN 'has_active_quote' THEN COALESCE((p_signals->>'has_active_quote')::boolean, false)
    WHEN 'has_active_proposal' THEN COALESCE((p_signals->>'has_active_proposal')::boolean, false)
    WHEN 'has_signed_contract' THEN COALESCE((p_signals->>'has_signed_contract')::boolean, false)
    WHEN 'qualification_is' THEN CASE p_condition->>'value'
      WHEN 'mql' THEN COALESCE((p_signals->>'has_qualification_mql')::boolean, false)
      WHEN 'sql' THEN COALESCE((p_signals->>'has_qualification_sql')::boolean, false)
      ELSE false
    END
    WHEN 'last_contact_is_negative' THEN COALESCE((p_signals->>'last_contact_is_negative')::boolean, false)
    WHEN 'last_contact_is_positive' THEN COALESCE((p_signals->>'last_contact_is_positive')::boolean, false)
    ELSE false
  END;
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Confirmar que os 8 tipos de condição continuam a avaliar
--    correctamente contra leads reais (repetir os testes já feitos com
--    has_assignee/last_contact_is_negative/has_source/etc.).
-- 2. Confirmar paridade do dashboard inalterada (730/437/225) para orgs sem
--    regras configuradas.
