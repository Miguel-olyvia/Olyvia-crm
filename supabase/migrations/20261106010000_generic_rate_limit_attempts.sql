-- Generic, reusable rate-limit attempt log for public Edge Functions.
--
-- Context: "public"."auth_login_attempts" (see
-- 20261103010000_add_login_rate_limiting.sql) is specific to the login flow.
-- Several other public Edge Functions (no session / anon-callable) still
-- rely on in-memory per-isolate counters, which reset on every cold start
-- and are not shared across concurrent isolates/regions. This table gives
-- the shared `_shared/rateLimit.ts` helper a persistent, cross-isolate
-- counter that any Edge Function can use by picking its own `bucket` name.
--
-- "bucket" identifies the caller/function + rule (e.g. "get-campaign-form",
-- "api-proxy"); "identifier" is whatever the function rate-limits on (IP
-- address, email, phone, api key, etc). Same access model as
-- auth_login_attempts: service-role only, RLS default-deny, grants revoked.

create table if not exists "public"."rate_limit_attempts" (
    "id" uuid default gen_random_uuid() not null,
    "bucket" text not null,
    "identifier" text not null,
    "success" boolean not null default true,
    "created_at" timestamp with time zone default now() not null
);

alter table only "public"."rate_limit_attempts"
    add constraint "rate_limit_attempts_pkey" primary key ("id");

comment on table "public"."rate_limit_attempts" is
    'Generic server-side counter used to rate-limit public Edge Functions (per bucket/identifier). Populated exclusively via service role from supabase/functions/_shared/rateLimit.ts; not accessible to anon/authenticated roles.';

-- Composite index, equality columns first (bucket, identifier), then range
-- (created_at desc), matching the read pattern in rateLimit.ts (count rows
-- for a given bucket+identifier within a sliding window).
create index if not exists "idx_rate_limit_attempts_bucket_identifier_created"
    on "public"."rate_limit_attempts" using btree ("bucket", "identifier", "created_at" desc);

-- Housekeeping: supports a future purge job without a full table scan.
create index if not exists "idx_rate_limit_attempts_created_at"
    on "public"."rate_limit_attempts" using btree ("created_at");

alter table "public"."rate_limit_attempts" enable row level security;

-- Default deny: no policies defined, anon/authenticated get nothing under
-- RLS. Grants revoked explicitly too, same pattern as auth_login_attempts.
revoke all on "public"."rate_limit_attempts" from "anon", "authenticated";

create or replace function "public"."purge_old_rate_limit_attempts"()
returns void
language sql
security definer
set search_path = 'public'
as $$
  delete from "public"."rate_limit_attempts"
  where "created_at" < now() - interval '7 days';
$$;

revoke all on function "public"."purge_old_rate_limit_attempts"() from "public", "anon", "authenticated";
