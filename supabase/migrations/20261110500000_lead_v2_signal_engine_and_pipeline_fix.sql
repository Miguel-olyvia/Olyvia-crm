-- Fase 2 (parte 1) — Motor de sinais para o funil de Leads configurável.
--
-- IMPORTANTE (clarificado pelo utilizador): "v2"/"anew_leads_v2" nos
-- documentos originais desta feature ("Fase 2"/"Fase 3") referem-se ao
-- módulo REAL de Leads deste repositório (anew_leads, dashboard
-- get_lead_dashboard_stats_scoped, página AnewLeads.tsx) — não a uma tabela
-- paralela. Todas as funções desta migração usam o sufixo "_v2" apenas para
-- deixar explícito que pertencem a este motor novo, mas operam sobre as
-- tabelas reais (anew_leads, deals, quotes, proposals, client_contracts).
--
-- Esta migração cobre apenas evaluate_lead_signals_v2() — a parte do motor
-- que NÃO depende da decisão pendente sobre o formato de reached_when/
-- mql_when/sql_when (Fase 2 usa {all:[...],any:[...]}, Fase 3 usa
-- {op,conditions:[...]} — formatos incompatíveis, ainda por decidir).
-- stage_reached()/compute_lead_stage_v2() ficam para a próxima migração,
-- após essa decisão.
--
-- Catálogo de sinais implementado (o mesmo enumerado na secção "Condições de
-- entrada" da Fase 3, único sítio onde os documentos listam a lista
-- completa): has_assignee, has_active_deal, has_active_quote,
-- has_active_proposal, has_signed_contract, has_qualification_mql,
-- has_qualification_sql.
--
-- Confirmado ao vivo antes de escrever esta função:
--   - anew_leads: entity_id uuid, assigned_to uuid, qualification_type text.
--   - deals: entity_id, deleted_at, closed_at, lost_reason (padrão de
--     "activo" já usado em get_lead_page_pipeline/get_lead_page_health).
--   - quotes: entity_id, deleted_at, estado (valores reais confirmados:
--     aceite/rascunho/rejeitado/perdido/enviado — "activo" exclui apenas
--     'perdido', mesmo padrão já usado em get_lead_page_pipeline).
--   - proposals: entity_id, deleted_at, status (valores reais confirmados:
--     draft/rejected/accepted — EM INGLÊS).
--   - client_contracts: entity_id, deleted_at, status (valores reais
--     confirmados: draft/signed/pending_signature).
--
-- ============================================================
-- BUG FIX (achado ao investigar o catálogo de sinais, não relacionado à Fase
-- 2 em si): get_lead_page_pipeline (migração 20261110430000) filtra
-- propostas via `p.status <> 'rejeitada'`, mas o valor real e confirmado ao
-- vivo em proposals.status é 'rejected' (inglês), nunca 'rejeitada'. Este
-- filtro nunca excluía nada na prática — propostas rejeitadas eram contadas
-- como "activas" na coluna Pipeline de Leads. Corrigido abaixo via
-- CREATE OR REPLACE, byte-a-byte igual ao original excepto o literal.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_lead_page_pipeline(
  p_org_id uuid,
  p_entity_ids uuid[],
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG'::text
)
RETURNS TABLE(
  entity_id uuid,
  deal_count bigint,
  deal_value numeric,
  proposal_count bigint,
  proposal_value numeric,
  proposal_value_with_iva numeric,
  quote_count bigint,
  quote_value numeric,
  quote_value_with_iva numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH visible_entities AS (
    SELECT DISTINCT l.entity_id
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope
    ) l
    WHERE l.entity_id = ANY(COALESCE(p_entity_ids, ARRAY[]::uuid[]))
  ),
  deal_agg AS (
    SELECT
      ve.entity_id,
      COUNT(d.id)::bigint AS deal_count,
      COALESCE(SUM(d.value), 0)::numeric AS deal_value
    FROM visible_entities ve
    LEFT JOIN public.deals d
      ON d.entity_id = ve.entity_id
     AND d.deleted_at IS NULL
     AND d.lost_reason IS NULL
    GROUP BY ve.entity_id
  ),
  proposal_line_totals AS (
    SELECT
      pi.proposal_id,
      SUM(COALESCE(pi.subtotal, 0)) AS items_subtotal,
      SUM(COALESCE(pi.total, 0))    AS items_total
    FROM public.proposal_items pi
    GROUP BY pi.proposal_id
  ),
  proposal_agg AS (
    SELECT
      ve.entity_id,
      COUNT(p.id)::bigint AS proposal_count,
      COALESCE(SUM(
        CASE WHEN COALESCE(plt.items_subtotal, 0) > 0
             THEN plt.items_subtotal
             ELSE COALESCE(p.value, 0)
        END
      ), 0)::numeric AS proposal_value,
      COALESCE(SUM(
        CASE WHEN COALESCE(plt.items_total, 0) > 0
             THEN plt.items_total
             ELSE COALESCE(p.value, 0)
        END
      ), 0)::numeric AS proposal_value_with_iva
    FROM visible_entities ve
    LEFT JOIN public.proposals p
      ON p.entity_id = ve.entity_id
     AND p.deleted_at IS NULL
     AND p.status <> 'rejected'
    LEFT JOIN proposal_line_totals plt ON plt.proposal_id = p.id
    GROUP BY ve.entity_id
  ),
  quote_agg AS (
    SELECT
      ve.entity_id,
      COUNT(q.id)::bigint AS quote_count,
      COALESCE(SUM(COALESCE(q.subtotal, q.total, 0)), 0)::numeric AS quote_value,
      COALESCE(SUM(COALESCE(q.total, 0)), 0)::numeric AS quote_value_with_iva
    FROM visible_entities ve
    LEFT JOIN public.quotes q
      ON q.entity_id = ve.entity_id
     AND q.deleted_at IS NULL
     AND q.estado <> 'perdido'
    GROUP BY ve.entity_id
  )
  SELECT
    ve.entity_id,
    COALESCE(da.deal_count, 0),
    COALESCE(da.deal_value, 0),
    COALESCE(pa.proposal_count, 0),
    COALESCE(pa.proposal_value, 0),
    COALESCE(pa.proposal_value_with_iva, 0),
    COALESCE(qa.quote_count, 0),
    COALESCE(qa.quote_value, 0),
    COALESCE(qa.quote_value_with_iva, 0)
  FROM visible_entities ve
  LEFT JOIN deal_agg da USING (entity_id)
  LEFT JOIN proposal_agg pa USING (entity_id)
  LEFT JOIN quote_agg qa USING (entity_id);
$function$;

-- ============================================================
-- evaluate_lead_signals_v2 — sinais booleanos numa única passagem por lead
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
      'has_qualification_sql', false
    );
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
    'has_qualification_sql', COALESCE(v_qualification_type = 'sql', false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_lead_signals_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_lead_signals_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_lead_signals_v2(uuid) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. SELECT evaluate_lead_signals_v2(id) FROM anew_leads LIMIT 20; deve
--    devolver jsonb com as 7 chaves acima para cada lead, sem excepções.
-- 2. Escolher uma lead com deal aberto/proposta aceite/contrato assinado
--    conhecidos e confirmar manualmente que os booleanos batem certo.
-- 3. get_lead_page_pipeline: confirmar que uma organização com propostas
--    'rejected' reais agora vê proposal_count/value mais baixos (a excluir
--    essas propostas) do que antes desta migração.
