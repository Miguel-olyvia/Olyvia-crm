/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260619090000_contacts_security_scope_integrity.sql",
);

function migrationExists() {
  return existsSync(migrationPath);
}

function normalizedSql() {
  if (!migrationExists()) {
    return "";
  }

  return readFileSync(migrationPath, "utf8")
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("contacts security scope integrity migration", () => {
  it("creates the forward-only migration file", () => {
    expect(migrationExists()).toBe(true);
  });

  it("defines a scoped contact access resolver with hardened execution grants", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.resolve_contact_access_context");
    expect(sql).toContain("p_org_id uuid");
    expect(sql).toContain("p_requested_scope text default 'org'");
    expect(sql).toContain("p_permission_code text default 'contacts.view'");
    expect(sql).toContain("returns table ( auth_user_id uuid, anew_user_id uuid, visible_org_ids uuid[], requested_scope text, permitted_scope text, applied_scope text, team_user_ids uuid[] )");
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("stable");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path to 'public'");
    expect(sql).toContain("authentication required");
    expect(sql).toContain("business user not found for auth user");
    expect(sql).toContain("permission denied: organization not visible");
    expect(sql).toContain("role_code = 'system_admin'");
    expect(sql).toContain("role_code = 'super_admin'");
    expect(sql).toContain("super_descendants");
    expect(sql).toContain("super_ancestors");
    expect(sql).toContain("anew_org_associations");
    expect(sql).toContain("organization_teams");
    expect(sql).toContain("organization_team_members");
    expect(sql).toContain("raise exception 'permission denied: % required', p_permission_code");
    expect(sql).toContain("revoke all on function public.resolve_contact_access_context(uuid, text, text) from public, anon");
    expect(sql).toContain("grant execute on function public.resolve_contact_access_context(uuid, text, text) to authenticated, service_role");
  });

  it("defines a fail-closed helper that derives org team and owned scopes on the server", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.can_access_contact_row");
    expect(sql).toContain("p_org_id uuid");
    expect(sql).toContain("p_created_by uuid");
    expect(sql).toContain("p_assigned_to uuid");
    expect(sql).toContain("p_permission_code text");
    expect(sql).toContain("returns boolean");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path to 'public'");
    expect(sql).toContain("from public.resolve_contact_access_context(p_org_id, 'org', p_permission_code)");
    expect(sql).toContain("v_ctx.applied_scope = 'org'");
    expect(sql).toContain("v_ctx.applied_scope = 'team'");
    expect(sql).toContain("v_ctx.applied_scope = 'owned'");
    expect(sql).toContain("p_assigned_to = v_ctx.anew_user_id");
    expect(sql).toContain("p_created_by = v_ctx.anew_user_id");
    expect(sql).toContain("p_assigned_to = any");
    expect(sql).toContain("p_created_by = any");
    expect(sql).toContain("exception when others then return false");
    expect(sql).toContain("revoke all on function public.can_access_contact_row(uuid, uuid, uuid, text) from public, anon");
    expect(sql).toContain("grant execute on function public.can_access_contact_row(uuid, uuid, uuid, text) to authenticated, service_role");
  });

  it("replaces contact policies with permissioned scoped RLS and no root-org bypass", () => {
    const sql = normalizedSql();

    expect(sql).toContain("drop policy if exists anew_contacts_select on public.anew_contacts");
    expect(sql).toContain("drop policy if exists anew_contacts_insert on public.anew_contacts");
    expect(sql).toContain("drop policy if exists anew_contacts_update on public.anew_contacts");
    expect(sql).toContain("drop policy if exists anew_contacts_delete on public.anew_contacts");

    expect(sql).toContain("create policy anew_contacts_select on public.anew_contacts for select to authenticated using");
    expect(sql).toContain("public.has_anew_permission(auth.uid(), 'contacts.view'::text)");
    expect(sql).toContain("public.can_access_contact_row(");
    expect(sql).toContain("'contacts.view'::text");

    expect(sql).toContain("create policy anew_contacts_update on public.anew_contacts for update to authenticated using");
    expect(sql).toContain("public.has_anew_permission(auth.uid(), 'contacts.edit'::text)");
    expect(sql).toContain("'contacts.edit'::text");
    expect(sql).toContain("with check");

    expect(sql).toContain("create policy anew_contacts_delete on public.anew_contacts for delete to authenticated using");
    expect(sql).toContain("public.has_anew_permission(auth.uid(), 'contacts.delete'::text)");
    expect(sql).toContain("'contacts.delete'::text");

    expect(sql).toContain("create policy anew_contacts_insert on public.anew_contacts for insert to authenticated with check");
    expect(sql).toContain("public.has_anew_permission(auth.uid(), 'contacts.create'::text)");
    expect(sql).toContain("created_by = public.current_business_user_id()");
    expect(sql).toContain("organization_id in (select public.get_user_visible_org_ids(auth.uid()))");

    expect(sql).not.toContain("root_organization_id in ( select public.get_user_visible_org_ids(auth.uid())");
  });

  it("recreates soft_delete_entity_facet with transactional authorization before mutations", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.soft_delete_entity_facet( p_kind text, p_id uuid )");
    expect(sql).toContain("returns boolean");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path to 'public'");
    expect(sql).toContain("for update");
    expect(sql).toContain("when 'lead' then 'leads.delete'");
    expect(sql).toContain("when 'contact' then 'contacts.delete'");
    expect(sql).toContain("when 'client' then 'clients.delete'");
    expect(sql).toContain("from public.resolve_lead_access_context");
    expect(sql).toContain("from public.resolve_contact_access_context");
    expect(sql).toContain("permission denied");
    expect(sql).toContain("before any update");
    expect(sql).toContain("update public.anew_entity_roles");
    expect(sql).toContain("update public.deals set deleted_at = v_deleted_at");
    expect(sql).toContain("update public.quotes set deleted_at = v_deleted_at");
    expect(sql).toContain("update public.client_contracts set deleted_at = v_deleted_at");
    expect(sql).toContain("update public.proposals set deleted_at = v_deleted_at");
    expect(sql).toContain("insert into public.anew_entity_history");
    expect(sql).toContain("revoke all on function public.soft_delete_entity_facet(text, uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.soft_delete_entity_facet(text, uuid) to authenticated, service_role");
  });

  it("hardens contact alert counts by intersecting requested orgs with server-visible orgs and row scope", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.get_contact_alert_counts( p_org_ids uuid[] )");
    expect(sql).toContain("returns jsonb");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path to 'public'");
    expect(sql).toContain("contacts.view");
    expect(sql).toContain("visible_org_ids");
    expect(sql).toContain("requested_orgs");
    expect(sql).toContain("intersect");
    expect(sql).toContain("public.can_access_contact_row(");
    expect(sql).toContain("c.organization_id");
    expect(sql).toContain("c.created_by");
    expect(sql).toContain("c.assigned_to");
    expect(sql).not.toContain("where c.organization_id = any(p_org_ids) and true");
    expect(sql).toContain("revoke all on function public.get_contact_alert_counts(uuid[]) from public, anon");
    expect(sql).toContain("grant execute on function public.get_contact_alert_counts(uuid[]) to authenticated, service_role");
  });
});
