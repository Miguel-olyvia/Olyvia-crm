-- Fase 2 (motor de resolução de etapa) — dois ajustes pontuais, confirmados
-- por leitura directa das definições finais em vigor
-- (20261110580000/20261110600000) antes de tocar em qualquer coisa:
--
-- 1. stage_reached() nunca teve SECURITY DEFINER nem SET search_path,
--    apenas LANGUAGE plpgsql IMMUTABLE. Confirmado (grep exaustivo aos 4
--    call sites: compute_lead_stage_v2, e os LEFT JOIN ... ON
--    stage_reached(...) em 20261110540000/20261110570000/20261111090000)
--    que a função e a evaluate_condition() que ela chama nunca tocam em
--    tabelas — recebem sempre signals/rule/status/matching já
--    materializados pelo chamador. Não há portanto qualquer dependência de
--    RLS nem de privilégios do caller a preservar: acrescentar
--    SECURITY DEFINER + SET search_path TO 'public' é apenas hardening
--    (referências já totalmente qualificadas com public.), não muda
--    nenhum comportamento observável. Os GRANTs existentes
--    (20261110510000) mantêm-se automaticamente — mesma assinatura,
--    CREATE OR REPLACE não os reseta.
--
-- 2. evaluate_lead_signals_v2() fazia 4 EXISTS independentes (deals,
--    quotes, proposals, client_contracts) mais 3 idas extra a
--    entity_interactions/lead_contact_results — 7+ scans por lead.
--    Reescrito para uma única passagem com um LEFT JOIN LATERAL por
--    tabela (não um JOIN multi-tabela simples, que produziria fan-out
--    cartesiano entre tabelas não relacionadas). Cada LATERAL replica
--    exactamente o filtro EXISTS/último-contacto anterior:
--      - has_active_deal/quote/proposal/signed_contract: o WHERE
--        `<tabela>.entity_id = l.entity_id` já devolve zero linhas quando
--        l.entity_id é NULL (NULL = NULL é NULL, não true), tal como o
--        `v_entity_id IS NOT NULL AND EXISTS(...)` original.
--      - has_contact_logged: contagem simples, sem dependência de ordem.
--      - last_contact_is_negative/positive: continua a exigir o ÚLTIMO
--        contacto apenas (ORDER BY interaction_at DESC ... LIMIT 1 dentro
--        do LATERAL), não bool_or sobre todo o histórico — trocar isto por
--        um agregado simples mudaria a semântica silenciosamente.
--    Nenhuma chave do jsonb devolvido foi acrescentada, removida ou
--    renomeada; os 12 sinais do catálogo actual (20261110600000) mantêm-se
--    byte a byte: has_assignee, has_active_deal, has_active_quote,
--    has_active_proposal, has_signed_contract, has_qualification_mql,
--    has_qualification_sql, has_source, has_contact_logged,
--    has_scheduled_visit, last_contact_is_negative,
--    last_contact_is_positive.

-- ============================================================
-- stage_reached — acrescenta SECURITY DEFINER + search_path (hardening,
-- sem mudança de comportamento — ver nota 1 acima)
-- ============================================================
CREATE OR REPLACE FUNCTION public.stage_reached(
  p_signals jsonb,
  p_rule jsonb,
  p_lead_status text,
  p_matching text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
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
-- evaluate_lead_signals_v2 — reescrito para uma única passagem por lead
-- com LEFT JOIN LATERAL por tabela em vez de 4+ EXISTS separados
-- (ver nota 2 acima)
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_lead_signals_v2(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_assignee', l.assigned_to IS NOT NULL,
    'has_active_deal', COALESCE(ld.has_active_deal, false),
    'has_active_quote', COALESCE(lq.has_active_quote, false),
    'has_active_proposal', COALESCE(lp.has_active_proposal, false),
    'has_signed_contract', COALESCE(lc.has_signed_contract, false),
    'has_qualification_mql', COALESCE(l.qualification_type = 'mql', false),
    'has_qualification_sql', COALESCE(l.qualification_type = 'sql', false),
    'has_source', COALESCE(NULLIF(l.source, ''), NULL) IS NOT NULL,
    'has_contact_logged', COALESCE(lei.has_contact_logged, false),
    'has_scheduled_visit', l.scheduled_visit_id IS NOT NULL,
    'last_contact_is_negative', COALESCE(llc.last_is_negative, false),
    'last_contact_is_positive', COALESCE(llc.last_is_positive, false)
  )
  INTO v_result
  FROM public.anew_leads l
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_active_deal
    FROM public.deals d
    WHERE d.entity_id = l.entity_id
      AND d.deleted_at IS NULL
      AND d.closed_at IS NULL
      AND d.lost_reason IS NULL
  ) ld ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_active_quote
    FROM public.quotes q
    WHERE q.entity_id = l.entity_id
      AND q.deleted_at IS NULL
      AND q.estado <> 'perdido'
  ) lq ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_active_proposal
    FROM public.proposals p
    WHERE p.entity_id = l.entity_id
      AND p.deleted_at IS NULL
      AND p.status <> 'rejected'
  ) lp ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_signed_contract
    FROM public.client_contracts cc
    WHERE cc.entity_id = l.entity_id
      AND cc.deleted_at IS NULL
      AND cc.status = 'signed'
  ) lc ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) > 0 AS has_contact_logged
    FROM public.entity_interactions ei
    WHERE ei.entity_id = l.entity_id
  ) lei ON true
  LEFT JOIN LATERAL (
    -- Precisa de ser o ÚLTIMO contacto apenas (ORDER BY ... LIMIT 1),
    -- não um agregado sobre todo o histórico — ver nota 2 acima.
    SELECT
      COALESCE(lcr.is_negative, false) AS last_is_negative,
      COALESCE(lcr.is_positive, false) AS last_is_positive
    FROM public.entity_interactions ei2
    LEFT JOIN public.lead_contact_results lcr ON lcr.id::text = ei2.result
    WHERE ei2.entity_id = l.entity_id
    ORDER BY ei2.interaction_at DESC NULLS LAST, ei2.created_at DESC
    LIMIT 1
  ) llc ON true
  WHERE l.id = p_lead_id;

  IF v_result IS NULL THEN
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

  RETURN v_result;
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Para uma amostra de leads reais (com e sem entity_id, com/sem cada
--    sinal), comparar jsonb output de evaluate_lead_signals_v2 antes/depois
--    desta migração — devem ser idênticos, chave a chave.
-- 2. Confirmar compute_lead_stage_v2()/get_lead_dashboard_stats_scoped()/
--    get_leads_v2_ids_by_pipeline_status() continuam a resolver a mesma
--    etapa/paridade do dashboard já validada (730/437/225) para orgs sem
--    regras configuradas.
-- 3. Confirmar que stage_reached continua a devolver os mesmos resultados
--    dos testes já feitos em 20261110580000 (all/any/vazio) agora com
--    SECURITY DEFINER + search_path fixo.
