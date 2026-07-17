-- RGPD Art. 32 authentication audit trail, part 2: WHEN did a user's email or
-- password change?
--
-- Context: part 1 (20261110190000_auth_audit_log_rpc.sql) exposed
-- auth_login_attempts (WHO tried to sign in, and whether it succeeded) via
-- public.get_login_attempts_audit_log, gated to system_admin. That table says
-- nothing about credential changes themselves: there is no record today of
-- when a user's email or password was changed. This migration adds that
-- record.
--
-- Pattern followed: same trigger-on-auth.users approach already used by
-- public.handle_new_user() / on_auth_user_created (AFTER INSERT ON
-- auth.users -- see 20260615130000_baseline_new_database.sql and
-- 20260909010000_handle_new_user_skip_admin_created.sql): a SECURITY DEFINER
-- plpgsql function, owned in the public schema, SET search_path TO 'public',
-- fired by a trigger on auth.users. We mirror that exactly here, but AFTER
-- UPDATE instead of AFTER INSERT.
--
-- The new table follows the same lockdown pattern as
-- "public"."auth_login_attempts" (20261103010000_add_login_rate_limiting.sql):
-- RLS enabled, no policies (default deny), and grants explicitly revoked from
-- anon/authenticated. It is populated exclusively by the trigger (SECURITY
-- DEFINER, runs as its owner) and read exclusively via the SECURITY DEFINER
-- RPC below, gated the same way as get_login_attempts_audit_log.
--
-- Note on retention scheduling: this migration deliberately does NOT wire a
-- purge function for this table into pg_cron, nor does it touch
-- purge_old_login_attempts() (that function/job is scoped to
-- auth_login_attempts only, per 20261105020000_data_retention_policy.sql).
-- Whether auth_account_changes needs its own retention window is a policy
-- decision left for a separate migration.

-- ============================================================
-- 1. auth_account_changes — one row per email/password change
-- ============================================================

create table if not exists "public"."auth_account_changes" (
    "id" uuid default gen_random_uuid() not null,
    "auth_user_id" uuid references auth.users(id) on delete cascade,
    "change_type" text not null,
    "old_email" text,
    "created_at" timestamp with time zone default now() not null,
    constraint "auth_account_changes_change_type_check"
        check ("change_type" in ('email', 'password'))
);

alter table only "public"."auth_account_changes"
    add constraint "auth_account_changes_pkey" primary key ("id");

comment on table "public"."auth_account_changes" is
    'RGPD Art. 32 audit trail of auth.users credential changes (email/password). Populated exclusively by the on_auth_account_changed trigger via SECURITY DEFINER; not accessible to anon/authenticated roles. Never stores password values -- only records that a password changed and when.';

comment on column "public"."auth_account_changes"."old_email" is
    'Previous email value, populated only when change_type=''email'' (shows what it changed FROM). Always NULL for change_type=''password''.';

create index if not exists "idx_auth_account_changes_auth_user_id"
    on "public"."auth_account_changes" using btree ("auth_user_id");

create index if not exists "idx_auth_account_changes_created_at"
    on "public"."auth_account_changes" using btree ("created_at");

alter table "public"."auth_account_changes" enable row level security;

-- Default deny: no policies are defined, so anon/authenticated cannot read or
-- write this table under RLS. Explicitly revoke table grants too, since RLS
-- alone does not stop default grants from lingering on the underlying table
-- privileges for other roles (same reasoning as auth_login_attempts above).
revoke all on "public"."auth_account_changes" from "anon", "authenticated";

-- ============================================================
-- 2. on_auth_account_changed — AFTER UPDATE ON auth.users trigger
-- ============================================================
-- Mirrors public.handle_new_user()'s ownership/security setup exactly:
-- plpgsql, SECURITY DEFINER, SET search_path TO 'public'. A single UPDATE
-- statement can change both email and encrypted_password at once (e.g. an
-- admin resetting both fields together), so we insert one row per change
-- type that actually changed rather than assuming they're mutually exclusive.

create or replace function "public"."handle_auth_account_changed"()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if OLD.email is distinct from NEW.email then
    insert into public.auth_account_changes (auth_user_id, change_type, old_email)
    values (NEW.id, 'email', OLD.email);
  end if;

  if OLD.encrypted_password is distinct from NEW.encrypted_password then
    insert into public.auth_account_changes (auth_user_id, change_type, old_email)
    values (NEW.id, 'password', NULL);
  end if;

  return NEW;
end;
$$;

drop trigger if exists "on_auth_account_changed" on "auth"."users";

create trigger "on_auth_account_changed"
    after update on "auth"."users"
    for each row
    execute function "public"."handle_auth_account_changed"();

-- ============================================================
-- 3. get_account_changes_audit_log — system-admin read-only access
-- ============================================================
-- Same permission gate as public.get_login_attempts_audit_log: resolve
-- auth.uid(), require public.is_system_admin(v_uid). Joins auth_user_id
-- against anew_users.auth_user_id to surface a human-readable display name,
-- null when auth_user_id has no match. Unlike auth_login_attempts, this
-- table has no email-at-time-of-change column to filter by identifier --
-- only auth_user_id, so filtering is by p_auth_user_id instead.

create or replace function public.get_account_changes_audit_log(
  p_limit int default 50,
  p_offset int default 0,
  p_auth_user_id uuid default null
)
returns table (
  id uuid,
  auth_user_id uuid,
  user_display_name text,
  change_type text,
  old_email text,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_system_admin(v_uid) then
    raise exception 'permission denied: system_admin required';
  end if;

  return query
  select
    c.id,
    c.auth_user_id,
    u.name as user_display_name,
    c.change_type,
    c.old_email,
    c.created_at
  from public.auth_account_changes c
  left join public.anew_users u on u.auth_user_id = c.auth_user_id
  where (p_auth_user_id is null or c.auth_user_id = p_auth_user_id)
  order by c.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.get_account_changes_audit_log(int, int, uuid) from public, anon;
grant execute on function public.get_account_changes_audit_log(int, int, uuid) to authenticated, service_role;
