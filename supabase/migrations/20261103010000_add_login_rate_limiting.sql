-- Server-side login rate limiting.
--
-- Context: the portal/CRM login form (src/pages/Auth.tsx) previously tracked
-- failed attempts and lockout only in sessionStorage, which is trivially
-- bypassed by clearing storage or opening a private/anonymous browser tab.
-- This migration adds a server-side attempt log used by the new
-- `portal-login` Edge Function, which now brokers every password sign-in
-- (see supabase/functions/portal-login/index.ts). The Edge Function checks
-- this table BEFORE calling GoTrue's password grant and records the outcome
-- AFTER, so lockout state cannot be reset by clearing client-side storage.
--
-- The table is intentionally not exposed to anon/authenticated roles: RLS is
-- enabled with no policies (default deny), and grants are revoked. Only the
-- service role (used by the Edge Function) can read/write it, mirroring the
-- pattern already used for "public"."sms_otp_codes".

create table if not exists "public"."auth_login_attempts" (
    "id" uuid default gen_random_uuid() not null,
    "identifier" text not null,
    "success" boolean not null,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp with time zone default now() not null
);

alter table only "public"."auth_login_attempts"
    add constraint "auth_login_attempts_pkey" primary key ("id");

comment on table "public"."auth_login_attempts" is
    'Server-side login attempt log used to rate-limit password sign-ins. Populated exclusively by the portal-login Edge Function via the service role; not accessible to anon/authenticated roles.';

-- Composite index, equality column (identifier) first, then range (created_at),
-- restricted to failed attempts (the only rows the lockout check reads).
create index if not exists "idx_auth_login_attempts_identifier_created"
    on "public"."auth_login_attempts" using btree ("identifier", "created_at" desc)
    where ("success" = false);

-- Housekeeping: avoid unbounded growth of the attempt log.
create index if not exists "idx_auth_login_attempts_created_at"
    on "public"."auth_login_attempts" using btree ("created_at");

alter table "public"."auth_login_attempts" enable row level security;

-- Default deny: no policies are defined, so anon/authenticated cannot read or
-- write this table under RLS. Explicitly revoke table grants too, since RLS
-- alone does not stop the service role's own default grants from lingering
-- on the underlying table privileges for other roles.
revoke all on "public"."auth_login_attempts" from "anon", "authenticated";

-- Retention: periodically purge attempts older than 7 days. Not scheduled by
-- this migration (no pg_cron dependency assumed here); call manually or wire
-- into an existing scheduled job if/when one exists for this project.
create or replace function "public"."purge_old_login_attempts"()
returns void
language sql
security definer
set search_path = 'public'
as $$
  delete from "public"."auth_login_attempts"
  where "created_at" < now() - interval '7 days';
$$;

revoke all on function "public"."purge_old_login_attempts"() from "public", "anon", "authenticated";
