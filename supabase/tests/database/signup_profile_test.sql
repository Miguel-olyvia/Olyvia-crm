-- pgTAP integration tests for:
--   supabase/migrations/20261110060000_create_signup_profile_table.sql
--
-- Covers:
--   1. A user can upsert their own signup_profile (first insert).
--   2. A later call with only some params set does not clobber previously
--      set fields (in particular signup_source, per the fix in the
--      migration under test: `signup_source = COALESCE(p_signup_source,
--      public.signup_profile.signup_source)`).
--   3. A different authenticated user cannot SELECT another user's
--      signup_profile row (RLS).
--   4. Invalid CHECK-constrained values (industry, employee_count_range,
--      signup_source) are rejected at the database level.
--   5. A system_admin can see all signup_profile rows.
--
-- How to run (once local Postgres/pgTAP infra is available):
--   supabase start
--   supabase db reset      -- applies all migrations, including this table
--   supabase test db       -- runs every *_test.sql file under supabase/tests
--
-- Test-user simulation follows the standard Supabase pgTAP pattern: RLS
-- policies here read auth.uid(), which resolves from the
-- `request.jwt.claim.sub` GUC. We set that GUC (and `role`) per test block
-- to simulate "logged in as user X" without a real auth.users/JWT round
-- trip. anew_users.auth_user_id has no FK to auth.users in this schema, so
-- arbitrary uuids are valid fixtures here.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------

-- Two ordinary end users, plus one system_admin, all with deterministic
-- auth_user_id values we can impersonate via request.jwt.claim.sub.
DO $$
DECLARE
  v_org_id uuid;
  v_admin_role_id uuid;
BEGIN
  INSERT INTO public.anew_organizations (id, name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Test Org')
  RETURNING id INTO v_org_id;

  INSERT INTO public.anew_users (id, email, name, auth_user_id)
  VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, 'user-a@example.test', 'User A', '21111111-1111-1111-1111-111111111111'::uuid),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'user-b@example.test', 'User B', '22222222-2222-2222-2222-222222222222'::uuid),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'admin@example.test', 'Admin User', '23333333-3333-3333-3333-333333333333'::uuid);

  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000099'::uuid, 'system_admin', 'System Admin', v_org_id, true)
  RETURNING id INTO v_admin_role_id;

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
  VALUES ('33333333-3333-3333-3333-333333333333'::uuid, v_org_id, v_admin_role_id, 'active');
END $$;

-- ---------------------------------------------------------------------
-- 1. User A upserts their own profile for the first time.
-- ---------------------------------------------------------------------

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '21111111-1111-1111-1111-111111111111';

SELECT is(
  auth.uid(),
  '21111111-1111-1111-1111-111111111111'::uuid,
  'sanity check: auth.uid() resolves to impersonated User A'
);

SELECT lives_ok(
  $$ SELECT public.rpc_upsert_signup_profile(
       'Acme Corp', 'technology', '11-50', 'CTO', 'campaign'
     ) $$,
  'User A can upsert their own signup_profile (first insert)'
);

SELECT results_eq(
  $$ SELECT company_name, industry, employee_count_range, job_title, signup_source
       FROM public.signup_profile
      WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ VALUES ('Acme Corp'::text, 'technology'::text, '11-50'::text, 'CTO'::text, 'campaign'::text) $$,
  'first insert stores all provided fields correctly'
);

-- ---------------------------------------------------------------------
-- 2. A later call with only some params set must not clobber the rest,
--    in particular signup_source (the bug this migration just fixed).
-- ---------------------------------------------------------------------

SELECT lives_ok(
  $$ SELECT public.rpc_upsert_signup_profile(p_job_title => 'VP Engineering') $$,
  'User A can call the RPC again supplying only job_title'
);

SELECT is(
  (SELECT job_title FROM public.signup_profile WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  'VP Engineering',
  'job_title is updated by the partial call'
);

SELECT is(
  (SELECT company_name FROM public.signup_profile WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  'Acme Corp',
  'company_name is NOT clobbered by the partial call'
);

SELECT is(
  (SELECT industry FROM public.signup_profile WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  'technology',
  'industry is NOT clobbered by the partial call'
);

SELECT is(
  (SELECT employee_count_range FROM public.signup_profile WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  '11-50',
  'employee_count_range is NOT clobbered by the partial call'
);

SELECT is(
  (SELECT signup_source FROM public.signup_profile WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  'campaign',
  'signup_source is NOT reset to the ''direct'' default by the partial call (regression test for the fix under review)'
);

-- ---------------------------------------------------------------------
-- 3. RLS: a different authenticated user cannot see User A's row.
-- ---------------------------------------------------------------------

-- User B upserts their own row too, so we can assert both isolation and
-- self-visibility in the same block.
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

SELECT lives_ok(
  $$ SELECT public.rpc_upsert_signup_profile('Beta LLC', 'retail_ecommerce', '1', 'Founder', 'referral') $$,
  'User B can upsert their own signup_profile'
);

SELECT is(
  (SELECT count(*)::int FROM public.signup_profile WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0,
  'User B cannot see User A''s signup_profile row (RLS blocks cross-user SELECT)'
);

SELECT is(
  (SELECT count(*)::int FROM public.signup_profile WHERE user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  1,
  'User B can see their own signup_profile row'
);

SELECT is(
  (SELECT count(*)::int FROM public.signup_profile),
  1,
  'as User B, an unfiltered SELECT only ever returns User B''s own row'
);

-- Back to User A: confirm the symmetric case holds too.
SET LOCAL request.jwt.claim.sub = '21111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::int FROM public.signup_profile WHERE user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'User A cannot see User B''s signup_profile row (RLS blocks cross-user SELECT)'
);

-- ---------------------------------------------------------------------
-- 4. Invalid CHECK-constrained values are rejected.
-- ---------------------------------------------------------------------
-- These CHECK constraints apply regardless of caller; exercised here via
-- direct INSERT as the table owner (RESET ROLE) since there is no INSERT
-- policy for `authenticated` to route through -- all client writes go
-- through the RPC, so the constraint is what protects the RPC path too.

RESET ROLE;

SELECT throws_like(
  $$ INSERT INTO public.signup_profile (user_id, industry)
     VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'not_a_real_industry') $$,
  '%signup_profile_industry_check%',
  'an invalid industry value is rejected by the CHECK constraint'
);

SELECT throws_like(
  $$ INSERT INTO public.signup_profile (user_id, employee_count_range)
     VALUES ('11111111-1111-1111-1111-111111111111'::uuid, '9999-not-a-range') $$,
  '%signup_profile_employee_count_range_check%',
  'an invalid employee_count_range value is rejected by the CHECK constraint'
);

SELECT throws_like(
  $$ INSERT INTO public.signup_profile (user_id, signup_source)
     VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'not_a_real_source') $$,
  '%signup_profile_signup_source_check%',
  'an invalid signup_source value is rejected by the CHECK constraint'
);

-- Same invalid values must also be rejected through the RPC path (this is
-- the path real clients actually use).
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '21111111-1111-1111-1111-111111111111';

SELECT throws_like(
  $$ SELECT public.rpc_upsert_signup_profile(p_industry => 'not_a_real_industry') $$,
  '%signup_profile_industry_check%',
  'the RPC also rejects an invalid industry value via the underlying CHECK constraint'
);

-- ---------------------------------------------------------------------
-- 5. system_admin can see all signup_profile rows.
-- ---------------------------------------------------------------------

SET LOCAL request.jwt.claim.sub = '23333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT count(*)::int FROM public.signup_profile),
  2,
  'a system_admin can see every user''s signup_profile row'
);

SELECT set_eq(
  $$ SELECT user_id FROM public.signup_profile $$,
  ARRAY[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid
  ],
  'system_admin sees exactly User A and User B''s rows, no more no less'
);

SELECT * FROM finish();

ROLLBACK;
