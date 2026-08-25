-- Replicates the anew_leads "search_text" architecture on anew_clients: a
-- denormalized, trigger-maintained column + a single ILIKE, instead of the
-- 3-layer flow in src/lib/clientSearch.ts (one search_entity_ids_by_word RPC
-- call per word, AND-intersection in TypeScript, then .in("entity_id", ...)
-- in chunks of 100). Measured live, as `authenticated`, before this change:
-- search_entity_ids_by_word('mar') alone takes ~5.5s (931 rows, 2.36M buffer
-- hits) — before the client query, the JS intersection, or the chunked
-- .in() calls even run.
--
-- What goes into search_text (mirrors anew_leads_search_text_trigger, see
-- 20261111130000_sync_lead_search_text_with_entity_name.sql):
--   - anew_clients.custom_fields (jsonb_each_text values, same as leads'
--     field_values)
--   - the linked anew_entities row's display_name/first_name/last_name
--   - the linked entity's emails (anew_entity_emails) and phone numbers
--     (anew_entity_phones) — leads don't need this extra step because a
--     lead's own email/phone already live inline in its field_values, but a
--     client's don't; they live in these separate per-entity tables, which
--     is also what today's search_entity_ids_by_word RPC reads from. The
--     clients page's search placeholder ("Procurar por nome, email, NIF,
--     empresa...") promises email search, so it has to stay covered.
--
-- What deliberately does NOT go into search_text: the NIF. NIF search is
-- already handled by the search-entities Edge Function (tokenized/HMAC,
-- never exposes plaintext NIF) precisely to avoid a plaintext-searchable NIF
-- column — anew_leads_search_text_trigger never touches NIF either (leads
-- have no fiscal_entity link at all), so this keeps the same boundary.
-- src/pages/AnewClients.tsx keeps calling searchEntityIdsByNif() for the NIF
-- branch; only the name/email/phone branch moves to this column.

-- 1. Shared formula so the client's own trigger and every "something this
--    client depends on changed" sync trigger below compute search_text the
--    exact same way (DRY - one place to change the formula later).
CREATE OR REPLACE FUNCTION "public"."anew_clients_compute_search_text"(
  "p_custom_fields" "jsonb",
  "p_entity_id" "uuid"
) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  entity_text text;
  email_text text;
  phone_text text;
BEGIN
  IF p_entity_id IS NOT NULL THEN
    SELECT NULLIF(trim(
             coalesce(e.display_name, '') || ' ' ||
             coalesce(e.first_name, '') || ' ' ||
             coalesce(e.last_name, '')
           ), '')
      INTO entity_text
      FROM public.anew_entities e
     WHERE e.id = p_entity_id;

    SELECT string_agg(em.email, ' ')
      INTO email_text
      FROM public.anew_entity_emails em
     WHERE em.entity_id = p_entity_id;

    SELECT string_agg(ph.phone_number, ' ')
      INTO phone_text
      FROM public.anew_entity_phones ph
     WHERE ph.entity_id = p_entity_id;
  END IF;

  RETURN NULLIF(trim(
    coalesce((
      SELECT string_agg(value::text, ' ')
      FROM jsonb_each_text(coalesce(p_custom_fields, '{}'::jsonb))
    ), '') || ' ' || coalesce(entity_text, '') || ' ' || coalesce(email_text, '') || ' ' || coalesce(phone_text, '')
  ), '');
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_clients_compute_search_text"("jsonb", "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."anew_clients_compute_search_text"("jsonb", "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_clients_compute_search_text"("jsonb", "uuid") TO "service_role";

-- 2. Column itself, backfilled below.
ALTER TABLE "public"."anew_clients" ADD COLUMN IF NOT EXISTS "search_text" "text";

-- 3. Per-row trigger, mirrors trg_anew_leads_search_text: fires whenever a
--    client's own custom_fields or entity_id changes.
CREATE OR REPLACE FUNCTION "public"."anew_clients_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.search_text := public.anew_clients_compute_search_text(NEW.custom_fields, NEW.entity_id);
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_clients_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_clients_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_clients_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_clients_search_text" ON "public"."anew_clients";
CREATE TRIGGER "trg_anew_clients_search_text"
  BEFORE INSERT OR UPDATE OF "custom_fields", "entity_id" ON "public"."anew_clients"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_clients_search_text_trigger"();

-- 4. Keep search_text in sync when the linked entity's own name changes
--    later (renamed/merged after the client was created) — mirrors
--    trg_anew_entities_sync_leads_search_text for leads.
CREATE OR REPLACE FUNCTION "public"."anew_entities_sync_clients_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    UPDATE public.anew_clients AS c
       SET search_text = public.anew_clients_compute_search_text(c.custom_fields, c.entity_id)
     WHERE c.entity_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entities_sync_clients_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_clients_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entities_sync_clients_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entities_sync_clients_search_text" ON "public"."anew_entities";
CREATE TRIGGER "trg_anew_entities_sync_clients_search_text"
  AFTER UPDATE OF "display_name", "first_name", "last_name" ON "public"."anew_entities"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entities_sync_clients_search_text_trigger"();

-- 5. Keep search_text in sync when an email is added/changed/removed for the
--    linked entity. No equivalent needed on the leads side (a lead's email
--    lives inline in field_values, which trg_anew_leads_search_text already
--    watches); clients read email from this separate per-entity table.
CREATE OR REPLACE FUNCTION "public"."anew_entity_emails_sync_clients_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_entity_id uuid := coalesce(NEW.entity_id, OLD.entity_id);
BEGIN
  IF v_entity_id IS NOT NULL THEN
    UPDATE public.anew_clients AS c
       SET search_text = public.anew_clients_compute_search_text(c.custom_fields, c.entity_id)
     WHERE c.entity_id = v_entity_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entity_emails_sync_clients_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entity_emails_sync_clients_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entity_emails_sync_clients_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entity_emails_sync_clients_search_text" ON "public"."anew_entity_emails";
CREATE TRIGGER "trg_anew_entity_emails_sync_clients_search_text"
  AFTER INSERT OR DELETE OR UPDATE OF "email", "entity_id" ON "public"."anew_entity_emails"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entity_emails_sync_clients_search_text_trigger"();

-- 6. Same as (5) but for phone numbers.
CREATE OR REPLACE FUNCTION "public"."anew_entity_phones_sync_clients_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_entity_id uuid := coalesce(NEW.entity_id, OLD.entity_id);
BEGIN
  IF v_entity_id IS NOT NULL THEN
    UPDATE public.anew_clients AS c
       SET search_text = public.anew_clients_compute_search_text(c.custom_fields, c.entity_id)
     WHERE c.entity_id = v_entity_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entity_phones_sync_clients_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entity_phones_sync_clients_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entity_phones_sync_clients_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entity_phones_sync_clients_search_text" ON "public"."anew_entity_phones";
CREATE TRIGGER "trg_anew_entity_phones_sync_clients_search_text"
  AFTER INSERT OR DELETE OR UPDATE OF "phone_number", "entity_id" ON "public"."anew_entity_phones"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entity_phones_sync_clients_search_text_trigger"();

-- 7. Idempotent backfill for all existing clients (281 rows at the time of
--    writing — cheap, safe to re-run, converges on the same deterministic
--    value for the current data).
UPDATE public.anew_clients AS c
   SET search_text = public.anew_clients_compute_search_text(c.custom_fields, c.entity_id)
 WHERE c.search_text IS DISTINCT FROM public.anew_clients_compute_search_text(c.custom_fields, c.entity_id);

-- 8. Trigram GIN index for `ilike '%term%'`, same technique as
--    idx_anew_leads_search_text_trgm.
CREATE INDEX IF NOT EXISTS "idx_anew_clients_search_text_trgm" ON "public"."anew_clients" USING "gin" ("search_text" "extensions"."gin_trgm_ops");
