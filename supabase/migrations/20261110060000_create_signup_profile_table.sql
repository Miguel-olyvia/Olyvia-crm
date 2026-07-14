-- Create signup_profile table + rpc_upsert_signup_profile.
--
-- Problem: the current signup flow (Auth.tsx -> supabase.auth.signUp()) only
-- collects full name, email and password. Olyvia's own marketing/sales team
-- has no company/firmographic profile of who is signing up (industry,
-- headcount band, job title, acquisition source) to qualify and segment
-- accounts.
--
-- This is deliberately NOT stored on anew_organizations: that table is the
-- tenant's own freely-editable business-org hierarchy (departments, teams,
-- branches...), exposed and mutable by the tenant via OrganizationForm.
-- signup_profile is the opposite: self-reported data about the account
-- holder, owned by Olyvia for internal segmentation, scoped 1:1 to the user
-- who signed up (anew_users), independent of any org hierarchy the tenant
-- later builds. Filling it in is optional (skippable onboarding step), so
-- every business field except signup_source is nullable.

CREATE TABLE "public"."signup_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" "text",
    "industry" "text",
    "employee_count_range" "text",
    "job_title" "text",
    "signup_source" "text" DEFAULT 'direct'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",

    CONSTRAINT "signup_profile_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "signup_profile_user_id_key" UNIQUE ("user_id"),

    CONSTRAINT "signup_profile_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "public"."anew_users"("id") ON DELETE CASCADE,

    CONSTRAINT "signup_profile_deleted_by_fkey"
        FOREIGN KEY ("deleted_by") REFERENCES "public"."anew_users"("id"),

    CONSTRAINT "signup_profile_company_name_len_check"
        CHECK ("company_name" IS NULL OR "char_length"("btrim"("company_name")) BETWEEN 1 AND 200),
    CONSTRAINT "signup_profile_job_title_len_check"
        CHECK ("job_title" IS NULL OR "char_length"("btrim"("job_title")) BETWEEN 1 AND 150),

    CONSTRAINT "signup_profile_industry_check"
        CHECK ("industry" IS NULL OR "industry" = ANY (ARRAY[
            'technology'::"text",
            'financial_services'::"text",
            'real_estate'::"text",
            'healthcare'::"text",
            'education'::"text",
            'retail_ecommerce'::"text",
            'manufacturing'::"text",
            'construction'::"text",
            'professional_services'::"text",
            'media_marketing'::"text",
            'hospitality_tourism'::"text",
            'nonprofit'::"text",
            'government'::"text",
            'other'::"text"
        ])),

    CONSTRAINT "signup_profile_employee_count_range_check"
        CHECK ("employee_count_range" IS NULL OR "employee_count_range" = ANY (ARRAY[
            '1'::"text",
            '2-10'::"text",
            '11-50'::"text",
            '51-200'::"text",
            '201-500'::"text",
            '501-1000'::"text",
            '1000+'::"text"
        ])),

    CONSTRAINT "signup_profile_signup_source_check"
        CHECK ("signup_source" = ANY (ARRAY[
            'organic'::"text",
            'referral'::"text",
            'campaign'::"text",
            'invite'::"text",
            'direct'::"text",
            'other'::"text"
        ]))
);

COMMENT ON TABLE "public"."signup_profile" IS
  'Self-reported firmographic/marketing profile collected from a user during onboarding (company_name, industry, employee_count_range, job_title, signup_source). 1:1 with anew_users via user_id. Owned by Olyvia for internal segmentation; distinct from anew_organizations, which is tenant-managed business data. Written only via rpc_upsert_signup_profile (SECURITY DEFINER), never directly by client INSERT/UPDATE.';

-- No separate index on user_id: signup_profile_user_id_key (UNIQUE) already
-- creates a btree index covering both the RLS subquery lookup and the
-- ON CONFLICT (user_id) upsert path.

CREATE INDEX "idx_signup_profile_industry"
  ON "public"."signup_profile" USING "btree" ("industry");

CREATE INDEX "idx_signup_profile_employee_count_range"
  ON "public"."signup_profile" USING "btree" ("employee_count_range");

CREATE INDEX "idx_signup_profile_deleted_by"
  ON "public"."signup_profile" USING "btree" ("deleted_by");

-- updated_at maintenance, consistent with other anew_*/form_submissions tables.
CREATE OR REPLACE FUNCTION "public"."set_signup_profile_updated_at"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "signup_profile_set_updated_at"
  BEFORE UPDATE ON "public"."signup_profile"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."set_signup_profile_updated_at"();

ALTER TABLE "public"."signup_profile" ENABLE ROW LEVEL SECURITY;

-- Read: the owning user (joined via anew_users.auth_user_id, since
-- anew_users.id != auth.uid()) or system admins (internal marketing/support
-- visibility). auth.uid() wrapped in (SELECT ...) to evaluate once per
-- statement rather than per row (see 20260623150000_fix_rls_auth_uid_correlated_subquery.sql).
CREATE POLICY "signup_profile_select" ON "public"."signup_profile"
  FOR SELECT TO "authenticated"
  USING (
    "deleted_at" IS NULL
    AND (
      "public"."is_system_admin"((SELECT "auth"."uid"()))
      OR "user_id" IN (
        SELECT "anew_users"."id" FROM "public"."anew_users"
        WHERE "anew_users"."auth_user_id" = (SELECT "auth"."uid"())
      )
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated or anon: all writes go
-- through rpc_upsert_signup_profile (SECURITY DEFINER, bypasses RLS), which
-- resolves the caller's own anew_users.id from auth.uid() internally and
-- never accepts a user_id argument from the client - preventing a caller
-- from upserting another user's profile.

REVOKE ALL ON TABLE "public"."signup_profile" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."signup_profile" FROM "anon";
GRANT SELECT ON TABLE "public"."signup_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_profile" TO "service_role";

-- rpc_upsert_signup_profile: self-service upsert of the caller's own
-- onboarding profile. Called from the frontend onboarding step after
-- signup, and skippable (never required for account access).
CREATE OR REPLACE FUNCTION "public"."rpc_upsert_signup_profile"(
  "p_company_name" "text" DEFAULT NULL,
  "p_industry" "text" DEFAULT NULL,
  "p_employee_count_range" "text" DEFAULT NULL,
  "p_job_title" "text" DEFAULT NULL,
  "p_signup_source" "text" DEFAULT NULL
)
RETURNS "public"."signup_profile"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public", "pg_temp"
AS $$
DECLARE
  v_user_id uuid;
  v_result public.signup_profile;
BEGIN
  SELECT id INTO v_user_id
  FROM public.anew_users
  WHERE auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No anew_users row found for the authenticated caller';
  END IF;

  INSERT INTO public.signup_profile (
    user_id, company_name, industry, employee_count_range, job_title, signup_source
  )
  VALUES (
    v_user_id,
    p_company_name,
    p_industry,
    p_employee_count_range,
    p_job_title,
    COALESCE(p_signup_source, 'direct')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    company_name = COALESCE(EXCLUDED.company_name, public.signup_profile.company_name),
    industry = COALESCE(EXCLUDED.industry, public.signup_profile.industry),
    employee_count_range = COALESCE(EXCLUDED.employee_count_range, public.signup_profile.employee_count_range),
    job_title = COALESCE(EXCLUDED.job_title, public.signup_profile.job_title),
    signup_source = COALESCE(p_signup_source, public.signup_profile.signup_source),
    deleted_at = NULL,
    deleted_by = NULL
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION "public"."rpc_upsert_signup_profile" IS
  'Self-service upsert of the calling user''s own signup_profile row. Resolves anew_users.id from auth.uid() internally; never trusts a client-supplied user_id, so a caller cannot write another user''s profile.';

REVOKE ALL ON FUNCTION "public"."rpc_upsert_signup_profile"(
  "text", "text", "text", "text", "text"
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."rpc_upsert_signup_profile"(
  "text", "text", "text", "text", "text"
) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."rpc_upsert_signup_profile"(
  "text", "text", "text", "text", "text"
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rpc_upsert_signup_profile"(
  "text", "text", "text", "text", "text"
) TO "service_role";
