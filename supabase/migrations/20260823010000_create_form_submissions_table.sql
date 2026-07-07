-- Create form_submissions table.
--
-- Problem: the public multi-step lead-capture form (create-lead / update-lead
-- Edge Functions) unconditionally inserted a new anew_leads row even when the
-- resolved entity was already an active client/contact in the receiving org.
-- A real client/contact resubmitting the public form got a bogus new "Lead"
-- dumped into the sales pipeline.
--
-- Fix (schema side): give the Edge Functions a place to accumulate multi-step
-- public-form field values for entities that classify as "client" or
-- "contact", without touching anew_leads or the client/contact row itself
-- (beyond the one-time non-destructive custom_fields merge already done at
-- step 1). anew_leads / anew_contacts / anew_clients remain untouched by this
-- migration.
--
-- Keyed by (organization_id, entity_id, form_id, campaign_id) so that:
--   * the same entity resubmitting the same form/campaign in the same org
--     reuses (upserts) the same row across all steps of the multi-step flow;
--   * a different form or campaign for the same entity gets its own row.
--
-- Access model: only the service-role Edge Functions (create-lead,
-- update-lead) write to this table, using the SECURITY DEFINER / service_role
-- bypass — service_role bypasses RLS entirely, so INSERT/UPDATE policies are
-- not the security boundary here. What RLS *does* need to guarantee is that
-- no anon/public direct table access is possible, and that authenticated
-- internal users can only SELECT rows for orgs they can already see (for
-- visibility/debugging), matching the pattern used by anew_contacts /
-- anew_clients via get_user_visible_org_ids().

CREATE TABLE "public"."form_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "root_organization_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "form_id" "uuid",
    "campaign_id" "uuid",
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "field_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    "current_step" integer DEFAULT 1,
    "total_steps" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "form_submissions_target_type_check"
        CHECK (("target_type" = ANY (ARRAY['contact'::"text", 'client'::"text"]))),
    CONSTRAINT "form_submissions_status_check"
        CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'complete'::"text", 'abandoned'::"text"]))),
    CONSTRAINT "form_submissions_current_step_check"
        CHECK (("current_step" > 0)),
    CONSTRAINT "form_submissions_total_steps_check"
        CHECK (("total_steps" IS NULL) OR ("total_steps" >= "current_step")),
    CONSTRAINT "form_submissions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "public"."anew_organizations"("id"),
    CONSTRAINT "form_submissions_root_organization_id_fkey"
        FOREIGN KEY ("root_organization_id") REFERENCES "public"."anew_organizations"("id"),
    CONSTRAINT "form_submissions_entity_id_fkey"
        FOREIGN KEY ("entity_id") REFERENCES "public"."anew_entities"("id"),
    CONSTRAINT "form_submissions_form_id_fkey"
        FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id"),
    CONSTRAINT "form_submissions_campaign_id_fkey"
        FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id")
);

COMMENT ON TABLE "public"."form_submissions" IS
  'Accumulates multi-step public lead-capture form field_values for entities that resolve (via classifyEntityInOrg) to an existing active client/contact in the receiving org, instead of polluting anew_leads with a bogus new lead. Written only by create-lead / update-lead Edge Functions via the service_role key.';

-- Upsert-friendly identity: one in-flight submission per
-- (org, entity, form, campaign). NULLs in form_id/campaign_id are collapsed
-- via COALESCE to a sentinel uuid so the uniqueness still holds when a form
-- is submitted without a campaign (or vice versa) — Postgres unique indexes
-- otherwise treat NULL as distinct on every row, which would defeat the
-- upsert-by-key behaviour the Edge Functions rely on.
CREATE UNIQUE INDEX "uniq_form_submissions_org_entity_form_campaign"
  ON "public"."form_submissions" ("organization_id", "entity_id",
    COALESCE("form_id", '00000000-0000-0000-0000-000000000000'::"uuid"),
    COALESCE("campaign_id", '00000000-0000-0000-0000-000000000000'::"uuid"));

CREATE INDEX "idx_form_submissions_organization_id"
  ON "public"."form_submissions" USING "btree" ("organization_id");

CREATE INDEX "idx_form_submissions_entity_id"
  ON "public"."form_submissions" USING "btree" ("entity_id");

CREATE INDEX "idx_form_submissions_target"
  ON "public"."form_submissions" USING "btree" ("target_type", "target_id");

CREATE INDEX "idx_form_submissions_root_organization_id"
  ON "public"."form_submissions" USING "btree" ("root_organization_id");

-- updated_at maintenance, consistent with other anew_* tables.
CREATE OR REPLACE FUNCTION "public"."set_form_submissions_updated_at"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "form_submissions_set_updated_at"
  BEFORE UPDATE ON "public"."form_submissions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."set_form_submissions_updated_at"();

-- Polymorphic integrity check: target_id must exist in the table implied by
-- target_type. There is no single FK that can express this (target_type
-- picks between anew_contacts and anew_clients), so enforce it with a
-- trigger instead, guarding against a bug in the Edge Function writing an
-- orphaned/mismatched target_id.
CREATE OR REPLACE FUNCTION "public"."check_form_submissions_target"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
  IF NEW."target_type" = 'contact' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_contacts" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_contacts', NEW."target_id";
    END IF;
  ELSIF NEW."target_type" = 'client' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_clients" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_clients', NEW."target_id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "form_submissions_check_target"
  BEFORE INSERT OR UPDATE OF "target_type", "target_id" ON "public"."form_submissions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."check_form_submissions_target"();

ALTER TABLE "public"."form_submissions" ENABLE ROW LEVEL SECURITY;

-- No anon/public policies at all: default-deny for the anon role, and the
-- Edge Functions never authenticate as anon against this table (they use the
-- service_role key, which bypasses RLS regardless of policies present).

CREATE POLICY "form_submissions_select" ON "public"."form_submissions"
  FOR SELECT TO "authenticated"
  USING (
    "public"."is_system_admin"("auth"."uid"())
    OR ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
    OR ("root_organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  );

-- No INSERT/UPDATE/DELETE policies for authenticated or anon: all writes to
-- this table happen exclusively via the service_role key inside the
-- create-lead / update-lead Edge Functions, which bypasses RLS. Internal
-- users get read-only visibility for debugging/support.

REVOKE ALL ON TABLE "public"."form_submissions" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."form_submissions" FROM "anon";
GRANT SELECT ON TABLE "public"."form_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."form_submissions" TO "service_role";
