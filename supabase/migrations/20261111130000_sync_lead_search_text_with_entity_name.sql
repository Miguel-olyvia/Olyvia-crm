-- Leads whose displayed "Nome" comes from the linked anew_entities row (via
-- getIdentity()/first_name/last_name/display_name) instead of from the lead's
-- own field_values were unsearchable by name: anew_leads.search_text is only
-- populated by trg_anew_leads_search_text, which aggregates field_values and
-- never looks at the linked entity. Confirmed live (org Nike,
-- b6ffce4f-f630-4933-833a-008649757a33): leads named "DIAG TestLead" have
-- field_values = '{}' and search_text = null, but a real linked anew_entities
-- row with first_name/last_name populated — 368 leads across the DB are
-- affected the same way.
--
-- Fix:
--   1. Extend anew_leads_search_text_trigger() to also fold in the linked
--      entity's display_name/first_name/last_name, and make the trigger fire
--      on UPDATE OF entity_id too (not just field_values).
--   2. Add a trigger on anew_entities that re-syncs search_text on every lead
--      pointing to an entity whenever that entity's name fields change.
--   3. Backfill search_text for all existing leads with an entity_id, using
--      the exact same computation as the trigger, so already-broken rows
--      (e.g. "DIAG TestLead") become searchable immediately. The backfill is
--      a pure function of current field_values/entity name data, so it is
--      idempotent and safe to re-run.

-- 1. Extend the per-lead trigger function to include the linked entity's name.
CREATE OR REPLACE FUNCTION "public"."anew_leads_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  entity_text text;
BEGIN
  IF NEW.entity_id IS NOT NULL THEN
    SELECT NULLIF(trim(
             coalesce(e.display_name, '') || ' ' ||
             coalesce(e.first_name, '') || ' ' ||
             coalesce(e.last_name, '')
           ), '')
      INTO entity_text
      FROM public.anew_entities e
     WHERE e.id = NEW.entity_id;
  END IF;

  NEW.search_text := NULLIF(trim(
    coalesce((
      SELECT string_agg(value::text, ' ')
      FROM jsonb_each_text(coalesce(NEW.field_values, '{}'::jsonb))
    ), '') || ' ' || coalesce(entity_text, '')
  ), '');

  RETURN NEW;
END;
$$;

-- Re-fire the lead trigger when entity_id changes (linking/relinking a lead to
-- an entity), not only when field_values changes.
DROP TRIGGER IF EXISTS "trg_anew_leads_search_text" ON "public"."anew_leads";
CREATE TRIGGER "trg_anew_leads_search_text"
  BEFORE INSERT OR UPDATE OF "field_values", "entity_id" ON "public"."anew_leads"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_leads_search_text_trigger"();

-- 2. Keep search_text in sync when the linked entity's own name changes later
--    (e.g. entity gets renamed/merged after the lead was created).
CREATE OR REPLACE FUNCTION "public"."anew_entities_sync_leads_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    UPDATE public.anew_leads AS l
       SET search_text = NULLIF(trim(
             coalesce((
               SELECT string_agg(value::text, ' ')
               FROM jsonb_each_text(coalesce(l.field_values, '{}'::jsonb))
             ), '') || ' ' || coalesce(trim(
               coalesce(NEW.display_name, '') || ' ' ||
               coalesce(NEW.first_name, '') || ' ' ||
               coalesce(NEW.last_name, '')
             ), '')
           ), '')
     WHERE l.entity_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_anew_entities_sync_leads_search_text" ON "public"."anew_entities";
CREATE TRIGGER "trg_anew_entities_sync_leads_search_text"
  AFTER UPDATE OF "display_name", "first_name", "last_name" ON "public"."anew_entities"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entities_sync_leads_search_text_trigger"();

GRANT ALL ON FUNCTION "public"."anew_entities_sync_leads_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_leads_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_leads_search_text_trigger"() TO "service_role";

-- 3. Idempotent backfill: recompute search_text for every existing lead that
--    has a linked entity, using the same formula as the trigger above. Safe
--    to re-run — it always converges on the same deterministic value for the
--    current data, and is a no-op once search_text already reflects it.
UPDATE public.anew_leads AS l
   SET search_text = NULLIF(trim(
         coalesce((
           SELECT string_agg(value::text, ' ')
           FROM jsonb_each_text(coalesce(l.field_values, '{}'::jsonb))
         ), '') || ' ' || coalesce((
           SELECT trim(
                    coalesce(e.display_name, '') || ' ' ||
                    coalesce(e.first_name, '') || ' ' ||
                    coalesce(e.last_name, '')
                  )
             FROM public.anew_entities e
            WHERE e.id = l.entity_id
         ), '')
       ), '')
 WHERE l.entity_id IS NOT NULL
   AND l.search_text IS DISTINCT FROM NULLIF(trim(
         coalesce((
           SELECT string_agg(value::text, ' ')
           FROM jsonb_each_text(coalesce(l.field_values, '{}'::jsonb))
         ), '') || ' ' || coalesce((
           SELECT trim(
                    coalesce(e.display_name, '') || ' ' ||
                    coalesce(e.first_name, '') || ' ' ||
                    coalesce(e.last_name, '')
                  )
             FROM public.anew_entities e
            WHERE e.id = l.entity_id
         ), '')
       ), '');
