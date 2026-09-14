-- Recuperado via 'supabase db query --linked' contra
-- supabase_migrations.schema_migrations.statements -- já aplicada
-- remotamente (drift concorrente de outra sessão), só faltava o ficheiro.
-- Mesmo padrão de recuperação já usado neste branch para 450000-520000.

-- Fixes measured defects in the Orcamentos (Quotes) search
-- (src/pages/Quotes.tsx: fetchQuotes' `applyServerFilters`, the separate
-- "server-side search" useEffect, and get_quotes_kpi_stats):
--
-- 1. SINGLE-PHRASE CLIENT-NAME MATCH: `display_name.ilike.%term%` on the raw
--    (space-including) term -- same defect class as the old Proposals title
--    search, confirmed by reading the query: no word split anywhere.
-- 2. SILENT TRUNCATION: the entity/email/phone lookups used
--    `.limit(200)` with no ORDER BY -- the exact anti-pattern already fixed
--    on anew_clients (20261113100000), reintroduced here independently.
-- 3. SLOW RLS-BOUND ILIKE: three round-trip ILIKE queries against
--    anew_entities / anew_entity_emails / anew_entity_phones under RLS,
--    measured live as `authenticated` at 1-2s per search (RLS defeats the
--    trigram index on a plain ILIKE the same way documented in
--    20261113080000_search_entity_ids_by_word_rpc.sql).
-- 4. KPI/list DIVERGENCE: get_quotes_kpi_stats' search only ever matched
--    `quote_number ILIKE`, never client name/email/phone -- while the list's
--    separate search effect matched quotes by client name too. Searching a
--    client name could show rows in the list with KPI cards computed over a
--    different (emptier) set. Root cause confirmed by reading both
--    predicates side by side; not the same class of bug as 1-3, but the
--    same fix (a single shared `search_text` predicate) closes it, because
--    the list and the KPI RPC now filter on the exact same column.
--
-- FIX: same anew_clients/anew_leads/proposals pattern -- a denormalized
-- `quotes.search_text` (quote_number + own title + linked entity's
-- search_text, resolved entity_id ?? deal.entity_id), trigger-maintained,
-- trigram GIN index. Both the list query (src/pages/Quotes.tsx) and
-- get_quotes_kpi_stats match words against it (AND across words,
-- order-agnostic) instead of the old phrase ILIKE / quote_number-only match.

-- 1. Compute function.
CREATE OR REPLACE FUNCTION "public"."quotes_compute_search_text"(
  "p_quote_number" "text",
  "p_title" "text",
  "p_entity_id" "uuid",
  "p_deal_id" "uuid"
) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_deal_entity_id uuid;
  v_entity_search_text text;
  v_resolved_entity_id uuid;
BEGIN
  IF p_deal_id IS NOT NULL THEN
    SELECT d.entity_id INTO v_deal_entity_id
      FROM public.deals d
     WHERE d.id = p_deal_id;
  END IF;

  v_resolved_entity_id := COALESCE(p_entity_id, v_deal_entity_id);

  IF v_resolved_entity_id IS NOT NULL THEN
    SELECT e.search_text INTO v_entity_search_text
      FROM public.anew_entities e
     WHERE e.id = v_resolved_entity_id;
  END IF;

  RETURN NULLIF(trim(
    coalesce(p_quote_number, '') || ' ' || coalesce(p_title, '') || ' ' || coalesce(v_entity_search_text, '')
  ), '');
END;
$$;

GRANT ALL ON FUNCTION "public"."quotes_compute_search_text"("text", "text", "uuid", "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."quotes_compute_search_text"("text", "text", "uuid", "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."quotes_compute_search_text"("text", "text", "uuid", "uuid") TO "service_role";

-- 2. Column, backfilled below.
ALTER TABLE "public"."quotes" ADD COLUMN IF NOT EXISTS "search_text" "text";

-- 3. Own-row trigger.
CREATE OR REPLACE FUNCTION "public"."quotes_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.search_text := public.quotes_compute_search_text(NEW.quote_number, NEW.title, NEW.entity_id, NEW.deal_id);
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."quotes_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."quotes_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."quotes_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_quotes_search_text" ON "public"."quotes";
CREATE TRIGGER "trg_quotes_search_text"
  BEFORE INSERT OR UPDATE OF "quote_number", "title", "entity_id", "deal_id" ON "public"."quotes"
  FOR EACH ROW EXECUTE FUNCTION "public"."quotes_search_text_trigger"();

-- 4. Cascade when the linked deal's entity_id changes later.
CREATE OR REPLACE FUNCTION "public"."deals_sync_quotes_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.quotes AS q
     SET search_text = public.quotes_compute_search_text(q.quote_number, q.title, q.entity_id, q.deal_id)
   WHERE q.deal_id = NEW.id;
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."deals_sync_quotes_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."deals_sync_quotes_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deals_sync_quotes_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_deals_sync_quotes_search_text" ON "public"."deals";
CREATE TRIGGER "trg_deals_sync_quotes_search_text"
  AFTER UPDATE OF "entity_id" ON "public"."deals"
  FOR EACH ROW EXECUTE FUNCTION "public"."deals_sync_quotes_search_text_trigger"();

-- 5. Cascade when the linked entity's own search_text changes.
CREATE OR REPLACE FUNCTION "public"."anew_entities_sync_quotes_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.quotes AS q
     SET search_text = public.quotes_compute_search_text(q.quote_number, q.title, q.entity_id, q.deal_id)
   WHERE q.entity_id = NEW.id
      OR q.deal_id IN (SELECT d.id FROM public.deals d WHERE d.entity_id = NEW.id);
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entities_sync_quotes_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_quotes_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_quotes_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entities_sync_quotes_search_text" ON "public"."anew_entities";
CREATE TRIGGER "trg_anew_entities_sync_quotes_search_text"
  AFTER UPDATE OF "search_text" ON "public"."anew_entities"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entities_sync_quotes_search_text_trigger"();

-- 6. Idempotent backfill.
UPDATE public.quotes AS q
   SET search_text = public.quotes_compute_search_text(q.quote_number, q.title, q.entity_id, q.deal_id)
 WHERE q.search_text IS DISTINCT FROM public.quotes_compute_search_text(q.quote_number, q.title, q.entity_id, q.deal_id);

-- 7. Trigram GIN index.
CREATE INDEX IF NOT EXISTS "idx_quotes_search_text_trgm" ON "public"."quotes" USING "gin" ("search_text" "extensions"."gin_trgm_ops");

-- 8. get_quotes_kpi_stats(): match search_text word-AND instead of
--    `quote_number ILIKE` only, so the KPI cards count exactly the same set
--    the list shows. Function body only -- signature unchanged, so
--    src/pages/Quotes.tsx's existing rpc() call needs no change.
CREATE OR REPLACE FUNCTION public.get_quotes_kpi_stats(p_org_id uuid, p_is_parent_org boolean DEFAULT false, p_root_org_id uuid DEFAULT NULL::uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_filters     jsonb       := COALESCE(p_filters, '{}'::jsonb);
  v_visible_ids jsonb       := v_filters->'visible_ids';
  v_search      text        := NULLIF(v_filters->>'search', '');
  v_date_from   timestamptz := NULLIF(v_filters->>'date_from', '')::timestamptz;
  v_date_to     timestamptz := NULLIF(v_filters->>'date_to', '')::timestamptz;
  v_comercial   text        := NULLIF(v_filters->>'comercial_id', '');
  v_status      text        := COALESCE(NULLIF(v_filters->>'status', ''), NULLIF(v_filters->>'estado', ''));
BEGIN
  RETURN (
    WITH base AS (
      SELECT estado, (subtotal + COALESCE(total_fees, 0)) AS total, total AS total_com_iva, created_at, accepted_at
      FROM quotes
      WHERE deleted_at IS NULL
        AND CASE
              WHEN p_is_parent_org THEN root_organization_id = p_root_org_id
              ELSE organization_id = p_org_id
            END
        -- permission scope: visible_ids (NULL / json null / absent => unrestricted)
        AND (
          v_visible_ids IS NULL
          OR jsonb_typeof(v_visible_ids) = 'null'
          OR id IN (SELECT (jsonb_array_elements_text(v_visible_ids))::uuid)
        )
        -- search: every word of v_search must appear somewhere in
        -- search_text (quote_number + title + linked entity's
        -- name/email/phone) -- the same predicate the list query applies,
        -- so KPI counts and the visible list never diverge.
        AND (
          v_search IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM unnest(regexp_split_to_array(lower(trim(v_search)), '\s+')) AS w
            WHERE w <> '' AND COALESCE(search_text, '') NOT ILIKE '%' || w || '%'
          )
        )
        -- created_at range
        AND (v_date_from IS NULL OR created_at >= v_date_from)
        AND (v_date_to   IS NULL OR created_at <= v_date_to)
        -- commercial owner (assigned_to); 'none' sentinel => unassigned
        AND (
          v_comercial IS NULL
          OR (v_comercial = 'none' AND assigned_to IS NULL)
          OR (v_comercial <> 'none' AND assigned_to = v_comercial::uuid)
        )
        -- status / estado exact match
        AND (v_status IS NULL OR estado = v_status)
    ),
    agg AS (
      SELECT
        COUNT(*)::int                                                                    AS total,
        COUNT(*) FILTER (WHERE estado = 'rascunho')::int                                AS rascunho,
        COUNT(*) FILTER (WHERE estado = 'enviado')::int                                 AS enviado,
        COUNT(*) FILTER (WHERE estado = 'aceite')::int                                  AS aceite,
        COUNT(*) FILTER (WHERE estado = 'perdido')::int                                 AS perdido,
        COUNT(*) FILTER (WHERE estado = 'finalizado')::int                              AS finalizado,
        COUNT(*) FILTER (WHERE estado = 'rejeitado')::int                               AS rejeitado,
        COUNT(*) FILTER (WHERE estado NOT IN
          ('rascunho','enviado','aceite','perdido','finalizado','rejeitado'))::int       AS outros,
        COALESCE(SUM(total), 0)                                                         AS total_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'rascunho'), 0)                      AS rascunho_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'enviado'), 0)                       AS enviado_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'aceite'), 0)                        AS aceite_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'perdido'), 0)                       AS perdido_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'finalizado'), 0)                    AS finalizado_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'rejeitado'), 0)                     AS rejeitado_value,
        COALESCE(SUM(total) FILTER (WHERE estado NOT IN
          ('rascunho','enviado','aceite','perdido','finalizado','rejeitado')), 0)        AS outros_value,
        COALESCE(SUM(total_com_iva), 0)                                                 AS total_value_with_vat,
        COALESCE(SUM(total_com_iva) FILTER (WHERE estado = 'aceite'), 0)                AS aceite_value_with_vat
      FROM base
    ),
    accept_time AS (
      SELECT ROUND(AVG(
        EXTRACT(EPOCH FROM (accepted_at::timestamptz - created_at::timestamptz)) / 86400
      ))::int AS avg_days
      FROM base
      WHERE estado IN ('aceite', 'finalizado') AND accepted_at IS NOT NULL
    )
    SELECT json_build_object(
      'total',              a.total,
      'rascunho',           a.rascunho,
      'enviado',            a.enviado,
      'aceite',             a.aceite,
      'perdido',            a.perdido,
      'finalizado',         a.finalizado,
      'rejeitado',          a.rejeitado,
      'outros',             a.outros,
      'totalValue',         a.total_value,
      'rascunhoValue',      a.rascunho_value,
      'enviadoValue',       a.enviado_value,
      'aceiteValue',        a.aceite_value,
      'perdidoValue',       a.perdido_value,
      'finalizadoValue',    a.finalizado_value,
      'rejeitadoValue',     a.rejeitado_value,
      'outrosValue',        a.outros_value,
      'avgValue',           CASE WHEN a.total > 0 THEN a.total_value / a.total ELSE 0 END,
      'taxaAceitacao',      CASE WHEN a.total > 0
                              THEN ROUND((a.aceite::numeric / a.total) * 100)
                              ELSE 0 END,
      'avgAcceptTime',      COALESCE((SELECT avg_days FROM accept_time), 0),
      'totalValueWithVat',  a.total_value_with_vat,
      'aceiteValueWithVat', a.aceite_value_with_vat
    )
    FROM agg a
  );
END;
$function$;
