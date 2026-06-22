/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260622114000_system_admin_least_privilege.sql",
);

function sql() {
  return existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8")
        .toLowerCase()
        .replaceAll('"', "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

describe("system admin least privilege migration", () => {
  it("exists as a forward-only migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("separates system_admin from super_admin and removes wildcard permissions", () => {
    const migration = sql();

    expect(migration).toContain("v_is_system_admin := 'system_admin' = any");
    expect(migration).not.toContain("array['system_admin','super_admin']");
    expect(migration).not.toContain("v_permissions := array['*']");
    expect(migration).toContain("from public.anew_role_permissions");
    expect(migration).toContain(
      "create or replace function public.has_anew_permission",
    );
    expect(migration).not.toContain(
      "admin roles bypass all permission checks",
    );
    expect(migration).toContain(
      "revoke all on function public.get_user_context(uuid) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.get_user_context(uuid) to authenticated, service_role",
    );
  });

  it("removes global organization visibility from system_admin", () => {
    const migration = sql();

    expect(migration).toContain(
      "create or replace function public.get_user_visible_org_ids",
    );
    expect(migration).not.toContain(
      "if user is system_admin, return all organizations",
    );
  });

  it("adds an aggregate-only system admin dashboard RPC", () => {
    const migration = sql();

    expect(migration).toContain(
      "create or replace function public.get_system_admin_dashboard_stats()",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path to 'public'");
    expect(migration).toContain("jsonb_build_object");
    expect(migration).toContain(
      "revoke all on function public.get_system_admin_dashboard_stats() from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.get_system_admin_dashboard_stats() to authenticated, service_role",
    );
  });

  it("adds restrictive PII policies for system admins", () => {
    const migration = sql();

    expect(migration).toContain("as restrictive");
    expect(migration).toContain("system_admin_pii_default_deny");
    expect(migration).toContain("not public.is_system_admin(auth.uid())");
  });
});
