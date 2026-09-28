-- Recuperado via 'supabase db query --linked' contra
-- supabase_migrations.schema_migrations.statements -- já aplicada
-- remotamente (drift concorrente de outra sessão), só faltava o ficheiro.
-- Mesmo padrão de recuperação já usado neste branch para 450000-520000.

-- General entity-level `search_text`, mirroring the anew_clients architecture
-- (20261113100000_anew_clients_search_text.sql) but at the anew_entities
-- level: a denormalized, trigger-maintained column + trigram GIN index,
-- covering the entity's own name fields plus its linked emails/phones.
--
-- WHY HERE AND NOT ONLY ON anew_clients: proposals.entity_id and
-- quotes.entity_id both reference anew_entities directly, not anew_clients
-- (a proposal/quote can point at a lead or a bare contact that never became
-- a client). Building search_text once here lets both
-- 20261113160000_proposals_search_text.sql and
-- 20261113170000_quotes_search_text.sql denormalize entity name/email/phone
-- into their own search_text without re-deriving it from three separate
-- tables (and without the slow search_entity_ids_by_word RPC, measured at
-- ~5.5s live as `authenticated` per the clients migration).
--
-- NIF is deliberately excluded here too, for the same reason as
-- anew_clients.search_text: NIF search stays behind the search-entities Edge
-- Function (tokenized/HMAC, never a plaintext-searchable column).

CREATE OR REPLACE FUNCTION "public"."anew_entities_compute_search_text"(
  "p_display_name" "text",
  "p_first_name" "text",
  "p_last_name" "text",
  "p_entity_id" "uuid"
) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  email_text text;
  phone_text text;
BEGIN
  IF p_entity_id IS NOT NULL THEN
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
    coalesce(p_display_name, '') || ' ' || coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '') ||
    ' ' || coalesce(email_text, '') || ' ' || coalesce(phone_text, '')
  ), '');
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entities_compute_search_text"("text", "text", "text", "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entities_compute_search_text"("text", "text", "text", "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entities_compute_search_text"("text", "text", "text", "uuid") TO "service_role";

-- Column, backfilled below.
ALTER TABLE "public"."anew_entities" ADD COLUMN IF NOT EXISTS "search_text" "text";

-- Own-row trigger: uses NEW.* directly rather than re-selecting the row by
-- id. A BEFORE UPDATE trigger's SELECT against its own table would still see
-- the pre-update (OLD) heap row, not NEW -- the row isn't written until
-- after BEFORE triggers return -- so name changes must flow through NEW.*,
-- not a self-lookup.
CREATE OR REPLACE FUNCTION "public"."anew_entities_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.search_text := public.anew_entities_compute_search_text(NEW.display_name, NEW.first_name, NEW.last_name, NEW.id);
  RETURN NEW;
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entities_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entities_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entities_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entities_search_text" ON "public"."anew_entities";
CREATE TRIGGER "trg_anew_entities_search_text"
  BEFORE INSERT OR UPDATE OF "display_name", "first_name", "last_name" ON "public"."anew_entities"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entities_search_text_trigger"();

-- Cascade from anew_entity_emails: a different table, so a fresh SELECT of
-- the target anew_entities row is safe and current.
CREATE OR REPLACE FUNCTION "public"."anew_entity_emails_sync_entities_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_entity_id uuid := coalesce(NEW.entity_id, OLD.entity_id);
  v_entity public.anew_entities%ROWTYPE;
BEGIN
  IF v_entity_id IS NOT NULL THEN
    SELECT * INTO v_entity FROM public.anew_entities WHERE id = v_entity_id;
    IF FOUND THEN
      UPDATE public.anew_entities
         SET search_text = public.anew_entities_compute_search_text(v_entity.display_name, v_entity.first_name, v_entity.last_name, v_entity_id)
       WHERE id = v_entity_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entity_emails_sync_entities_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entity_emails_sync_entities_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entity_emails_sync_entities_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entity_emails_sync_entities_search_text" ON "public"."anew_entity_emails";
CREATE TRIGGER "trg_anew_entity_emails_sync_entities_search_text"
  AFTER INSERT OR DELETE OR UPDATE OF "email", "entity_id" ON "public"."anew_entity_emails"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entity_emails_sync_entities_search_text_trigger"();

-- Same as above, for phone numbers.
CREATE OR REPLACE FUNCTION "public"."anew_entity_phones_sync_entities_search_text_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_entity_id uuid := coalesce(NEW.entity_id, OLD.entity_id);
  v_entity public.anew_entities%ROWTYPE;
BEGIN
  IF v_entity_id IS NOT NULL THEN
    SELECT * INTO v_entity FROM public.anew_entities WHERE id = v_entity_id;
    IF FOUND THEN
      UPDATE public.anew_entities
         SET search_text = public.anew_entities_compute_search_text(v_entity.display_name, v_entity.first_name, v_entity.last_name, v_entity_id)
       WHERE id = v_entity_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

GRANT ALL ON FUNCTION "public"."anew_entity_phones_sync_entities_search_text_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."anew_entity_phones_sync_entities_search_text_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anew_entity_phones_sync_entities_search_text_trigger"() TO "service_role";

DROP TRIGGER IF EXISTS "trg_anew_entity_phones_sync_entities_search_text" ON "public"."anew_entity_phones";
CREATE TRIGGER "trg_anew_entity_phones_sync_entities_search_text"
  AFTER INSERT OR DELETE OR UPDATE OF "phone_number", "entity_id" ON "public"."anew_entity_phones"
  FOR EACH ROW EXECUTE FUNCTION "public"."anew_entity_phones_sync_entities_search_text_trigger"();

-- Idempotent backfill for all existing entities.
UPDATE public.anew_entities AS e
   SET search_text = public.anew_entities_compute_search_text(e.display_name, e.first_name, e.last_name, e.id)
 WHERE e.search_text IS DISTINCT FROM public.anew_entities_compute_search_text(e.display_name, e.first_name, e.last_name, e.id);

-- Trigram GIN index for `ilike '%word%'`, same technique as
-- idx_anew_clients_search_text_trgm / idx_anew_leads_search_text_trgm.
CREATE INDEX IF NOT EXISTS "idx_anew_entities_search_text_trgm" ON "public"."anew_entities" USING "gin" ("search_text" "extensions"."gin_trgm_ops");
