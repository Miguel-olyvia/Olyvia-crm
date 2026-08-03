-- O separador "Percurso" (LeadJourneyTab.tsx) usava get_lead_resolved_stage,
-- a mesma RPC que alimenta o Funil (LeadPipelineBar.tsx via AnewLeads.tsx) --
-- ambos leem as etapas activas de lead_workflow_stages (próprias da org, ou o
-- template global). Como nenhuma etapa tem reached_when configurado
-- (confirmado ao vivo: as 9 linhas do template global têm reached_when NULL),
-- o Percurso acabava por espelhar 1:1 as etapas do Funil em vez de mostrar
-- uma visão de qualificação mais grosseira.
--
-- Pedido do utilizador: o Percurso deve ter sempre estas 5 etapas fixas --
-- Lead / Contactado / Qualificado / Negociação / Cliente -- com regras
-- próprias, independentes de como cada organização configura o Funil:
--   - Qualificado: visita confirmada (has_visit_done) OU status 'qualified'
--     OU já classificado como SQL -- não basta ter a visita AGENDADA.
--   - Negociação: status 'proposal'/'negotiation' E TEM mesmo proposta em
--     curso (has_active_proposal) -- caso contrário fica em Qualificado.
--
-- get_lead_resolved_stage NÃO é alterada nem removida: continua a ser usada
-- por AnewLeads.tsx (linha ~1611) para o furthestProgressStageId do Funil em
-- leads rejeitados. Esta migração só acrescenta uma RPC nova e independente.

-- ============================================================
-- journey_bucket_for_status — mapeia um status "cru" de lead (o texto de
-- anew_leads.status, ou o `name` de uma lead_workflow_stages, ambos usam o
-- mesmo vocabulário: new/contacted/callback_scheduled/visit_scheduled/
-- qualified/proposal/negotiation/converted/rejected) para uma das 5 etapas
-- fixas do Percurso. Função pura, sem I/O, para poder ser reutilizada tanto
-- para o estado actual como para o "furthest stage before terminal" de um
-- lead perdido.
-- ============================================================
CREATE OR REPLACE FUNCTION public.journey_bucket_for_status(p_status text, p_signals jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_status = 'converted' THEN 'client'
    WHEN p_status IN ('proposal', 'negotiation')
      AND COALESCE((p_signals->>'has_active_proposal')::boolean, false) THEN 'negotiation'
    WHEN COALESCE((p_signals->>'has_visit_done')::boolean, false)
      OR p_status = 'qualified'
      OR COALESCE((p_signals->>'has_qualification_sql')::boolean, false) THEN 'qualified'
    WHEN p_status IN ('contacted', 'callback_scheduled')
      OR COALESCE((p_signals->>'has_call_answered')::boolean, false)
      OR COALESCE((p_signals->>'has_email_sent')::boolean, false) THEN 'contacted'
    ELSE 'lead'
  END;
$function$;

-- ============================================================
-- get_lead_journey_stage — versão do Percurso com 5 etapas fixas. Reutiliza
-- evaluate_lead_signals_v2 (sinais já calculados para o motor de regras do
-- Funil) e get_lead_last_stage_before_terminal (já resolve, via
-- entity_audit_log, a etapa do Funil imediatamente antes da rejeição) --
-- não duplica nenhuma dessas lógicas, só as combina com o novo mapeamento
-- de 5 buckets.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lead_journey_stage(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead record;
  v_authorized boolean;
  v_signals jsonb;
  v_resolved_key text;
  v_furthest_key text;
  v_furthest_terminal_stage_id uuid;
  v_is_lost boolean;
  v_stages jsonb;
BEGIN
  SELECT organization_id, status
  INTO v_lead
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead % not found', p_lead_id;
  END IF;

  SELECT v_lead.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', v_lead.organization_id;
  END IF;

  v_signals := public.evaluate_lead_signals_v2(p_lead_id);
  v_is_lost := v_lead.status = 'rejected';
  v_resolved_key := public.journey_bucket_for_status(v_lead.status, v_signals);

  IF v_is_lost THEN
    v_furthest_terminal_stage_id := public.get_lead_last_stage_before_terminal(p_lead_id);
    SELECT public.journey_bucket_for_status(lws.name, v_signals)
    INTO v_furthest_key
    FROM public.lead_workflow_stages lws
    WHERE lws.id = v_furthest_terminal_stage_id;
  ELSE
    v_furthest_key := v_resolved_key;
  END IF;

  WITH catalog(key, label, stage_order, counts_as_qualified, counts_as_negotiation, counts_as_converted) AS (
    VALUES
      ('lead', 'Lead', 1, false, false, false),
      ('contacted', 'Contactado', 2, false, false, false),
      ('qualified', 'Qualificado', 3, true, false, false),
      ('negotiation', 'Negociação', 4, false, true, false),
      ('client', 'Cliente', 5, false, false, true)
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.key,
      'label', c.label,
      'color', NULL,
      'stage_order', c.stage_order,
      'qualification_hint', 'none',
      'counts_as_qualified', c.counts_as_qualified,
      'counts_as_negotiation', c.counts_as_negotiation,
      'counts_as_converted', c.counts_as_converted,
      'counts_as_lost', false
    ) ORDER BY c.stage_order
  )
  INTO v_stages
  FROM catalog c;

  RETURN jsonb_build_object(
    'resolved_stage_id', CASE WHEN v_is_lost THEN NULL ELSE v_resolved_key END,
    'resolved_stage', CASE WHEN v_is_lost THEN NULL
      ELSE (SELECT s FROM jsonb_array_elements(v_stages) s WHERE s->>'id' = v_resolved_key LIMIT 1) END,
    'stages', COALESCE(v_stages, '[]'::jsonb),
    'is_lost', v_is_lost,
    'furthest_progress_stage_id', v_furthest_key,
    'furthest_progress_stage', (SELECT s FROM jsonb_array_elements(v_stages) s WHERE s->>'id' = v_furthest_key LIMIT 1)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_lead_journey_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_journey_stage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_journey_stage(uuid) TO service_role;
