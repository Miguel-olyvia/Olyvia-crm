-- Fase 3 §3/§4 — Dry-run e Recálculo em batch.
--
-- Confirmado ao vivo antes de escrever recompute_leads_v2_buckets:
-- anew_leads.workflow_stage_id já é uma coluna-cache derivada, escrita no
-- cliente sempre que o status muda (AnewLeadContactDialog.tsx linha ~950,
-- AnewLeadEditDialog.tsx linha ~273), resolvida por correspondência literal
-- de nome (lead_workflow_stages.name = status), preferindo a etapa da
-- organização e caindo para o template. Não é um campo de posicionamento
-- manual (não há Kanban drag-and-drop que a escreva de outra forma) — é
-- exactamente o mesmo conceito que compute_lead_stage_v2 resolve, só que
-- hoje sem avaliar reached_when. Persistir aqui o resultado de
-- compute_lead_stage_v2 mantém o mesmo papel da coluna, apenas mais preciso.

-- ============================================================
-- simulate_lead_v2_bucket_changes — dry-run, sem side effects
-- ============================================================
-- p_stages: array JSON com as etapas PROPOSTAS (ainda não gravadas),
-- ordenadas por stage_order ascendente, no formato
-- [{ id, label, stage_order, reached_when, matching_statuses,
--    counts_as_qualified, counts_as_negotiation, counts_as_converted,
--    counts_as_lost }, ...]. Usa jsonb_array_elements + DISTINCT ON por
-- stage_order DESC para replicar a mesma semântica "primeira etapa que bate,
-- da mais avançada para a menos avançada" de compute_lead_stage_v2, mas
-- contra o array proposto em vez da tabela real (por isso não reutiliza
-- compute_lead_stage_v2 directamente — este simula ANTES de gravar).
--
-- p_qual (mql_when/sql_when propostos) é aceite na assinatura por paridade
-- com o pedido da Fase 3, mas NÃO afecta o bucket simulado: qualification é
-- uma sugestão ortogonal ao bucket (counts_as_*), não uma condição de nova
-- etapa por si só — só entra no motor via a condição "qualification_is" já
-- avaliada dentro de reached_when. Fica como reserva para uma futura
-- simulação dedicada da sugestão MQL/SQL, não incluída nesta migração.
CREATE OR REPLACE FUNCTION public.simulate_lead_v2_bucket_changes(
  p_org uuid,
  p_stages jsonb,
  p_qual jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_result jsonb;
BEGIN
  SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org;
  END IF;

  WITH stage_defs AS (
    SELECT
      COALESCE((elem->>'stage_order')::int, -ord::int) AS stage_order,
      elem->'reached_when' AS reached_when,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(elem->'matching_statuses', '[]'::jsonb))) AS matching_statuses,
      COALESCE((elem->>'counts_as_qualified')::boolean, false) AS counts_as_qualified,
      COALESCE((elem->>'counts_as_negotiation')::boolean, false) AS counts_as_negotiation,
      COALESCE((elem->>'counts_as_converted')::boolean, false) AS counts_as_converted,
      COALESCE((elem->>'counts_as_lost')::boolean, false) AS counts_as_lost,
      COALESCE(elem->>'label', elem->>'name') AS label
    FROM jsonb_array_elements(COALESCE(p_stages, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  ),
  org_leads AS (
    SELECT id AS lead_id, status
    FROM public.anew_leads
    WHERE organization_id = p_org AND deleted_at IS NULL
  ),
  before_resolved AS (
    SELECT ol.lead_id, public.compute_lead_stage_v2(ol.lead_id) AS stage_id
    FROM org_leads ol
  ),
  before_bucketed AS (
    SELECT br.lead_id,
      CASE
        WHEN lws.counts_as_qualified THEN 'qualified'
        WHEN lws.counts_as_negotiation THEN 'negotiation'
        WHEN lws.counts_as_converted THEN 'converted'
        WHEN lws.counts_as_lost THEN 'lost'
        WHEN lws.name IS NOT NULL THEN lws.name
        ELSE 'unresolved'
      END AS bucket
    FROM before_resolved br
    LEFT JOIN public.lead_workflow_stages lws ON lws.id = br.stage_id
  ),
  lead_signals AS (
    SELECT ol.lead_id, public.evaluate_lead_signals_v2(ol.lead_id) AS signals
    FROM org_leads ol
  ),
  after_matches AS (
    SELECT DISTINCT ON (ol.lead_id)
      ol.lead_id,
      sd.label,
      sd.counts_as_qualified,
      sd.counts_as_negotiation,
      sd.counts_as_converted,
      sd.counts_as_lost
    FROM org_leads ol
    JOIN lead_signals ls ON ls.lead_id = ol.lead_id
    JOIN stage_defs sd
      ON public.stage_reached(ls.signals, sd.reached_when, ol.status, sd.matching_statuses)
    ORDER BY ol.lead_id, sd.stage_order DESC
  ),
  after_bucketed AS (
    SELECT ol.lead_id,
      CASE
        WHEN am.counts_as_qualified THEN 'qualified'
        WHEN am.counts_as_negotiation THEN 'negotiation'
        WHEN am.counts_as_converted THEN 'converted'
        WHEN am.counts_as_lost THEN 'lost'
        WHEN am.label IS NOT NULL THEN am.label
        ELSE 'unresolved'
      END AS bucket
    FROM org_leads ol
    LEFT JOIN after_matches am ON am.lead_id = ol.lead_id
  ),
  combined AS (
    SELECT bb.lead_id, bb.bucket AS before_bucket, ab.bucket AS after_bucket
    FROM before_bucketed bb
    JOIN after_bucketed ab ON ab.lead_id = bb.lead_id
  ),
  before_totals AS (
    SELECT COALESCE(jsonb_object_agg(before_bucket, cnt), '{}'::jsonb) AS value
    FROM (SELECT before_bucket, COUNT(*)::bigint AS cnt FROM combined GROUP BY before_bucket) s
  ),
  after_totals AS (
    SELECT COALESCE(jsonb_object_agg(after_bucket, cnt), '{}'::jsonb) AS value
    FROM (SELECT after_bucket, COUNT(*)::bigint AS cnt FROM combined GROUP BY after_bucket) s
  ),
  changed AS (
    SELECT * FROM combined WHERE before_bucket IS DISTINCT FROM after_bucket
  ),
  changed_examples AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('lead_id', lead_id, 'before', before_bucket, 'after', after_bucket)),
      '[]'::jsonb
    ) AS value
    FROM (SELECT * FROM changed LIMIT 20) s
  )
  SELECT jsonb_build_object(
    'total_leads', (SELECT COUNT(*) FROM combined),
    'before_totals', bt.value,
    'after_totals', at.value,
    'changed_count', (SELECT COUNT(*) FROM changed),
    'changed_examples', ce.value
  )
  INTO v_result
  FROM before_totals bt
  CROSS JOIN after_totals at
  CROSS JOIN changed_examples ce;

  RETURN v_result;
END;
$function$;

-- ============================================================
-- recompute_leads_v2_buckets — persiste o resultado, em batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_leads_v2_buckets(p_org uuid)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_count integer;
BEGIN
  SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org;
  END IF;

  WITH resolved AS (
    SELECT id, public.compute_lead_stage_v2(id) AS new_stage_id
    FROM public.anew_leads
    WHERE organization_id = p_org AND deleted_at IS NULL
  ),
  updated AS (
    UPDATE public.anew_leads al
    SET workflow_stage_id = r.new_stage_id,
        pipeline_dirty_at = NULL
    FROM resolved r
    WHERE al.id = r.id
      AND al.workflow_stage_id IS DISTINCT FROM r.new_stage_id
    RETURNING al.id
  )
  SELECT COUNT(*)::integer INTO v_count FROM updated;

  RETURN QUERY SELECT v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.simulate_lead_v2_bucket_changes(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulate_lead_v2_bucket_changes(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_lead_v2_bucket_changes(uuid, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.recompute_leads_v2_buckets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. simulate_lead_v2_bucket_changes(org, <etapas actuais da org em JSON, sem
--    alterações>) deve devolver changed_count = 0 e before_totals ==
--    after_totals byte-a-byte (simular "nenhuma mudança" com as regras
--    actuais tem de dar zero mudanças).
-- 2. recompute_leads_v2_buckets(org) deve devolver updated_count = 0 numa
--    segunda chamada consecutiva (idempotente — nada para actualizar depois
--    da primeira passagem).
-- 3. Confirmar RAISE EXCEPTION ao chamar com um p_org para o qual o utilizador
--    autenticado não tem visibilidade.
