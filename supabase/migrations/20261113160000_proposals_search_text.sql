-- Recuperado via 'supabase db query --linked' contra
-- supabase_migrations.schema_migrations.statements -- já aplicada
-- remotamente (drift concorrente de outra sessão), só faltava o ficheiro.
-- Mesmo padrão de recuperação já usado neste branch para 450000-520000.

-- Fixes two measured defects in the Propostas search
-- (src/pages/Proposals.tsx / proposals_list_filtered, see
-- 20261113070000_proposals_list_pagination_and_metrics_rpcs.sql):
--
-- 1. SINGLE-PHRASE MATCH: the title search was
--    `strpos(lower(d.title), lower(_search)) > 0` -- a literal substring
--    match. Searching "proposta cliente X" never found "Proposta para o
--    cliente X": the words are there, but not contiguous and in that exact
--    order. Confirmed by reading the predicate; there is no word split
--    anywhere in this function.
-- 2. SLOW CLIENT-NAME RESOLUTION: the client name/email/phone branch of the
--    search went through src/lib/clientSearch.ts's searchEntityIds(), which
--    calls search_entity_ids_by_word() once per word -- measured at ~5.5s
--    live as `authenticated` for a single common word (see
--    20261113100000_anew_clients_search_text.sql's own measurement of that
--    same RPC). Proposals.tsx awaited that before the list query could even
--    start.
--
-- FIX: same pattern as anew_clients/anew_leads -- a denormalized
-- `proposals.search_text` (own title + linked deal's title + linked
-- entity's search_text, resolved entity_id ?? deal.entity_id), trigger-
-- maintained, with a trigram GIN index. proposals_list_filtered() matches
-- each word of the search term against it independently (AND across words,
-- order-agnostic), instead of the old single-phrase strpos and instead of
-- requiring the client to pre-resolve entity ids for name/email/phone.
--
-- NIF stays OUT of search_text (same boundary as clients/leads) and keeps
-- flowing through _search_entity_ids, resolved client-side via
-- searchEntityIdsByNif() (src/lib/clientSearch.ts, unchanged) -- OR'd on top
-- of the word match, exactly as before.

-- 1. Compute function. Takes the proposal's own fields as params (not a
--    self-lookup by id) for the same reason as anew_entities_search_text_trigger:
--    a BEFORE UPDATE trigger's own-table SELECT would see the pre-update row.
CREATE OR REPLACE FUNCTION "public"."proposals_compute_search_text"(
  "p_title" "text",
  "p_entity_id" "uuid",
  "p_deal_id" "uuid"
) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_deal_title text;
  v_deal_entity_id uuid;
  v_entity_search_text text;
  v_resolved_entity_id uuid;
BEGIN
  IF p_deal_id IS NOT NULL THEN
    SELECT d.title, d.entity_id INTO v_deal_title, v_deal_entity_id
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
    coalesce(p_title, '') || ' ' || coalesce(v_deal_title, '') || ' ' || coalesce(v_entity_search_text, '')
  ), '');
END;
$$;

GRANT ALL ON FUNCTION "public"."proposals_compute_search_text"("text", "uuid", "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."proposals_compute_search_text"("text", "uuid", "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."proposals_compute_search_text"("text", "uuid", "uuid") TO "service_role";

-- 2. Column, backfilled below.
ALTER TABLE "public"."proposals" ADD COLUMN IF NOT EXISTS "search_text" "text";

-- 3. Own-row trigger.
CREATE OR REPLACE FUNCTION "public"."proposals_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.search_text := public.proposals_compute_search_text(NEW.title, NEW.entity_id, NEW.deal_id);
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."proposals_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."proposals_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."proposals_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_proposals_search_text" ON "public"."proposals";
CREATE TRIGGER "trg_proposals_search_text"
  BEFORE INSERT OR UPDATE OF "title", "entity_id", "deal_id" ON "public"."proposals"
  FOR EACH ROW EXECUTE FUNCTION "public"."proposals_search_text_trigger"();

-- 4. Cascade when the linked deal's own title or entity_id changes later.
CREATE OR REPLACE FUNCTION "public"."deals_sync_proposals_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.proposals AS p
     SET search_text = public.proposals_compute_search_text(p.title, p.entity_id, p.deal_id)
   WHERE p.deal_id = NEW.id;
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."deals_sync_proposals_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."deals_sync_proposals_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deals_sync_proposals_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_deals_sync_proposals_search_text" ON "public"."deals";
CREATE TRIGGER "trg_deals_sync_proposals_search_text"
  AFTER UPDATE OF "title", "entity_id" ON "public"."deals"
  FOR EACH ROW EXECUTE FUNCTION "public"."deals_sync_proposals_search_text_trigger"();

-- 5. Cascade when the linked entity's own search_text changes (rename,
--    merge, new email/phone -- all already collapse into one search_text
--    write by 20261113150000_anew_entities_search_text.sql).
CREATE OR REPLACE FUNCTION "public"."anew_entities_sync_proposals_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.proposals AS p
     SET search_text = public.proposals_compute_search_text(p.title, p.entity_id, p.deal_id)
   WHERE p.entity_id = NEW.id
      OR p.deal_id IN (SELECT d.id FROM public.deals d WHERE d.entity_id = NEW.id);
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entities_sync_proposals_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_proposals_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_proposals_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entities_sync_proposals_search_text" ON "public"."anew_entities";
CREATE TRIGGER "trg_anew_entities_sync_proposals_search_text"
  AFTER UPDATE OF "search_text" ON "public"."anew_entities"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entities_sync_proposals_search_text_trigger"();

-- 6. Idempotent backfill.
UPDATE public.proposals AS p
   SET search_text = public.proposals_compute_search_text(p.title, p.entity_id, p.deal_id)
 WHERE p.search_text IS DISTINCT FROM public.proposals_compute_search_text(p.title, p.entity_id, p.deal_id);

-- 7. Trigram GIN index.
CREATE INDEX IF NOT EXISTS "idx_proposals_search_text_trgm" ON "public"."proposals" USING "gin" ("search_text" "extensions"."gin_trgm_ops");

-- 8. proposals_list_filtered(): swap the single-phrase strpos title/deal-title
--    match for a word-AND, order-agnostic match against the new search_text
--    column. Same function signature (no client-side changes needed to call
--    it) -- only the body's search predicate changes. _search_entity_ids
--    (NIF matches) stays OR'd on top, unchanged.
CREATE OR REPLACE FUNCTION public.proposals_list_filtered(
  _organization_id          uuid,
  _scope_mode               text,
  _scope_deal_ids           uuid[],
  _scope_created_by_ids     uuid[],
  _created_by_fallback_only boolean,
  _workflow_stage_ids       uuid[],
  _stage_filter             text,
  _search                   text,
  _search_entity_ids        uuid[],
  _date_from                timestamptz,
  _date_to                  timestamptz,
  _only_mine                uuid,
  _comercial                uuid,
  _comercial_none           boolean,
  _no_response              boolean,
  _expired                  boolean,
  _no_validity              boolean,
  _follow_up_days           integer,
  _now                      timestamptz,
  _tz                       text
)
RETURNS TABLE (
  id               uuid,
  created_at       timestamptz,
  title            text,
  value            numeric,
  value_sem_iva    numeric,
  valid_until      date,
  accepted_at      timestamptz,
  stage_id         uuid,
  stage_order      integer,
  stage_name       text,
  is_won           boolean,
  is_lost          boolean,
  is_no_response   boolean,
  is_past_validity boolean,
  has_no_validity  boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH derived AS (
    SELECT
      p.id,
      p.created_at,
      p.title,
      p.value,
      p.value_sem_iva,
      p.valid_until,
      p.accepted_at,
      p.status,
      p.deal_id,
      p.entity_id,
      p.assigned_to,
      p.search_text,
      COALESCE(p.entity_id, dl.entity_id)       AS resolved_entity_id,
      COALESCE(emb.id, fb.id)                   AS r_stage_id,
      COALESCE(emb.stage_order, fb.stage_order) AS r_stage_order,
      COALESCE(emb.name, fb.name)               AS r_stage_name,
      COALESCE(emb.is_won, fb.is_won, false)    AS r_is_won,
      COALESCE(emb.is_lost, fb.is_lost, false)  AS r_is_lost,
      -- "sem resposta ha N dias": dias desde o mais recente entre o envio da
      -- proposta e a ultima atividade registada para a entidade. Usar so
      -- created_at fazia o indicador piscar para sempre por muitos contactos
      -- que se registassem -- e a mesma regra do cliente.
      public.difference_in_days_local(
        _now,
        CASE
          WHEN li.interaction_at IS NOT NULL
           AND li.interaction_at > COALESCE(p.sent_at, p.created_at)
            THEN li.interaction_at
          ELSE COALESCE(p.sent_at, p.created_at)
        END,
        _tz
      ) AS follow_up_days
    FROM public.proposals_in_scope(
           _organization_id, _scope_mode, _scope_deal_ids,
           _scope_created_by_ids, _created_by_fallback_only
         ) p
    LEFT JOIN public.proposal_workflow_stages emb
      ON emb.id = p.stage_id
    LEFT JOIN LATERAL (
      SELECT w.id, w.name, w.stage_order, w.is_won, w.is_lost
      FROM public.proposal_workflow_stages w
      WHERE emb.id IS NULL
        AND w.id = ANY (_workflow_stage_ids)
        AND w.name = p.status
      ORDER BY w.stage_order, w.id
      LIMIT 1
    ) fb ON true
    LEFT JOIN LATERAL (
      SELECT d.entity_id
      FROM public.deals d
      WHERE d.id = p.deal_id
    ) dl ON true
    LEFT JOIN LATERAL (
      SELECT i.interaction_at
      FROM public.entity_interactions i
      WHERE i.entity_id = COALESCE(p.entity_id, dl.entity_id)
        AND EXISTS (
          SELECT 1 FROM public.anew_entities e WHERE e.id = i.entity_id
        )
      ORDER BY i.interaction_at DESC
      LIMIT 1
    ) li ON true
  )
  SELECT
    d.id,
    d.created_at,
    d.title,
    d.value,
    d.value_sem_iva,
    d.valid_until,
    d.accepted_at,
    d.r_stage_id                          AS stage_id,
    d.r_stage_order                       AS stage_order,
    COALESCE(d.r_stage_name, d.status, '') AS stage_name,
    d.r_is_won                            AS is_won,
    d.r_is_lost                           AS is_lost,
    (COALESCE(d.r_stage_name, d.status, '') IN ('sent', 'enviada')
       AND d.follow_up_days > _follow_up_days) AS is_no_response,
    (d.valid_until IS NOT NULL
       AND (d.valid_until::timestamp AT TIME ZONE _tz) < _now) AS is_past_validity,
    (d.valid_until IS NULL)               AS has_no_validity
  FROM derived d
  WHERE (_only_mine IS NULL OR d.assigned_to = _only_mine)
    AND (
      _stage_filter IS NULL
      OR _stage_filter = 'all'
      OR d.r_stage_id::text = _stage_filter
      OR d.status = _stage_filter
    )
    AND (_date_from IS NULL OR d.created_at >= _date_from)
    AND (_date_to   IS NULL OR d.created_at <= _date_to)
    AND (
      _search IS NULL
      OR NOT EXISTS (
        -- Every word of the trimmed, lower-cased search term must appear
        -- SOMEWHERE in search_text (proposal title + deal title + linked
        -- entity's name/email/phone) -- order-agnostic, unlike the old
        -- single-phrase strpos this replaces.
        SELECT 1
        FROM unnest(regexp_split_to_array(lower(trim(_search)), '\s+')) AS w
        WHERE w <> '' AND COALESCE(d.search_text, '') NOT ILIKE '%' || w || '%'
      )
      OR (_search_entity_ids IS NOT NULL AND d.resolved_entity_id = ANY (_search_entity_ids))
    )
    AND (
      CASE
        WHEN _comercial_none        THEN d.assigned_to IS NULL
        WHEN _comercial IS NOT NULL THEN d.assigned_to = _comercial
        ELSE true
      END
    )
    AND (
      NOT _no_response
      OR (COALESCE(d.r_stage_name, d.status, '') IN ('sent', 'enviada')
          AND d.follow_up_days > _follow_up_days)
    )
    AND (
      NOT _expired
      OR (d.valid_until IS NOT NULL
          AND (d.valid_until::timestamp AT TIME ZONE _tz) < _now)
    )
    AND (NOT _no_validity OR d.valid_until IS NULL)
$function$;

COMMENT ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) IS
  'Ambito resolvido + filtros da UI da listagem de Propostas, com o estado '
  'resolvido e as flags derivadas. Base unica da pagina e das metricas para '
  'que nao possam divergir. Pesquisa por search_text (word-AND, ver '
  '20261113160000_proposals_search_text.sql), nao por strpos de frase unica. '
  'SECURITY INVOKER.';
