-- Fase 2 §2 — get_leads_v2_ids_by_pipeline_status
--
-- Devolve os lead_id cuja etapa resolvida (compute_lead_stage_v2) bate o
-- filtro pedido. Card do dashboard e chip da lista devem chamar esta MESMA
-- função para garantir coerência por construção (o que o card conta é
-- exactamente o que a lista mostra ao clicar).
--
-- p_filter aceita: 'qualified' | 'negotiation' | 'converted' | 'lost' |
-- 'stage:<uuid>' (etapa específica, para o caso de uma organização com
-- etapas próprias além das 4 categorias fixas).

CREATE OR REPLACE FUNCTION public.get_leads_v2_ids_by_pipeline_status(
  p_org_id uuid,
  p_filter text,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG'::text
)
RETURNS TABLE(lead_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH visible_leads AS (
    SELECT l.lead_id
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope
    ) l
  ),
  resolved AS (
    SELECT v.lead_id, public.compute_lead_stage_v2(v.lead_id) AS stage_id
    FROM visible_leads v
  )
  SELECT r.lead_id
  FROM resolved r
  JOIN public.lead_workflow_stages lws ON lws.id = r.stage_id
  WHERE
    (p_filter = 'qualified' AND lws.counts_as_qualified)
    OR (p_filter = 'negotiation' AND lws.counts_as_negotiation)
    OR (p_filter = 'converted' AND lws.counts_as_converted)
    OR (p_filter = 'lost' AND lws.counts_as_lost)
    OR (p_filter LIKE 'stage:%' AND lws.id = substring(p_filter FROM 7)::uuid);
$function$;

REVOKE ALL ON FUNCTION public.get_leads_v2_ids_by_pipeline_status(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leads_v2_ids_by_pipeline_status(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leads_v2_ids_by_pipeline_status(uuid, text, boolean, text) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Para uma org sem stages próprias, SELECT COUNT(*) FROM
--    get_leads_v2_ids_by_pipeline_status(org, 'negotiation') deve devolver
--    o mesmo número que resolved_stage_counts.negotiation do dashboard e
--    que uma query raw status='negotiation' faria hoje.
-- 2. p_filter = 'stage:<uuid>' com um uuid de uma etapa custom deve devolver
--    apenas leads resolvidas exactamente para essa etapa.
