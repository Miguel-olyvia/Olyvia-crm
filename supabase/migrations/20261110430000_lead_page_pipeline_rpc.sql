-- Add get_lead_page_pipeline(): per-entity deal/proposal/quote aggregates for
-- the Leads table's new "Pipeline" column.
--
-- Context: the Contactos listing (src/pages/AnewContacts.tsx, now retired from
-- routing but kept as reference) already shows a "Pipeline" column with badges
-- for open Deals/Propostas/Orçamentos per contact, computed via raw batched
-- .from("deals"/"proposals"/"quotes") queries against entity_id. AnewLeads.tsx
-- deliberately does NOT use that raw-query pattern — a regression test
-- (src/pages/__tests__/anewLeadsAggregateRpc.test.ts) asserts the Leads page
-- loads health data via the aggregate RPC get_lead_page_health() instead of
-- raw per-row queries, for performance reasons on a much larger dataset.
--
-- This migration adds a sibling RPC, get_lead_page_pipeline(), following the
-- exact same shape/scoping as get_lead_page_health() (same visible_entities
-- CTE via get_scoped_leads_base(), same call signature convention), so the
-- new Pipeline column can be added to Leads without violating that
-- established aggregate-query pattern.
--
-- Business logic mirrors AnewContacts.tsx's dealMap/proposalMap/quoteMap
-- construction (confirmed by reading that file directly):
--   deals:     count + SUM(value), excluding deleted_at/lost_reason rows
--              (AnewContacts.tsx line ~714: .is("lost_reason", null)).
--   proposals: count + SUM(value) + SUM(value_with_iva), excluding
--              deleted_at rows and status = 'rejeitada' (line ~716), value
--              preferring the SUM of proposal_items.subtotal/total per
--              proposal when items exist, else falling back to proposals.value
--              (line ~779-782).
--   quotes:    count + SUM(value) + SUM(value_with_iva), excluding
--              deleted_at rows and estado = 'perdido' (line ~717), value
--              preferring subtotal (falling back to total), value_with_iva
--              from total (line ~791-792).
--
-- Confirmed live (information_schema.columns) that deals/proposals/quotes all
-- carry deleted_at, entity_id, organization_id; deals has lost_reason + value;
-- proposals has status + value + deal_id; quotes has estado + subtotal +
-- total; proposal_items has proposal_id + subtotal + total.

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
     AND p.status <> 'rejeitada'
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

REVOKE ALL ON FUNCTION public.get_lead_page_pipeline(uuid, uuid[], boolean, text) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.get_lead_page_pipeline(uuid, uuid[], boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_page_pipeline(uuid, uuid[], boolean, text) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. SELECT * FROM get_lead_page_pipeline(<org_id>, ARRAY[<entity_id>], false, 'ORG')
--    returns one row per requested entity_id (only for entities visible under
--    the given scope, matching get_lead_page_health's own visibility rule),
--    with zero-filled counts/values for entities with no deals/proposals/quotes.
-- 2. Counts/values match the equivalent manual aggregation used by
--    AnewContacts.tsx's dealMap/proposalMap/quoteMap for the same entity_id.
-- 3. Function is STABLE + SECURITY DEFINER, matching get_lead_page_health(),
--    so RLS on deals/proposals/quotes does not need to allow direct
--    cross-user reads — visibility is enforced entirely by the
--    get_scoped_leads_base() CTE restricting which entity_ids are considered.
