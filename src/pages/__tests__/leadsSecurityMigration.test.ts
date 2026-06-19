/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260618030000_leads_security_scope_integrity.sql",
);
const validationMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260618113000_validate_leads_source_fk.sql",
);
const scopedRpcFixMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260618150000_fix_leads_scoped_rpc_types_and_legacy_owner.sql",
);
const superAdminScopeFixMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260618163000_fix_super_admin_lead_org_scope.sql",
);

function normalizedSql() {
  return readFileSync(migrationPath, "utf8")
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("leads security scope integrity migration", () => {
  it("adds scoped dashboard/status RPC contracts with source filters and internal scope derivation", () => {
    const sql = normalizedSql();

    expect(sql).toContain("function public.resolve_root_organization_id");
    expect(sql).toContain("with recursive walk");

    expect(sql).toContain("create function public.get_lead_dashboard_stats_scoped");
    expect(sql).toContain("p_scope text default 'org'");
    expect(sql).toContain("p_anew_user_id uuid default null::uuid");
    expect(sql).toContain("p_auth_user_id uuid default null::uuid");
    expect(sql).toContain("p_source text default null::text");
    expect(sql).toContain("p_source_is_null boolean default false");
    expect(sql).toContain("p_compare_previous boolean default true");
    expect(sql).toContain("scope_applied");
    expect(sql).toContain("return coalesce(v_current, '{}'::jsonb) || jsonb_build_object");
    expect(sql).toContain("previous");
    expect(sql).toContain("contact_attempts_in_period");
    expect(sql).toContain("deal_counts");

    expect(sql).toContain("create function public.get_lead_status_counts( p_org_id uuid, p_is_root boolean default false, p_scope text default 'all'::text");
    expect(sql).toContain("p_search text default null::text, p_source text default null::text, p_source_is_null boolean default false ) returns table(status text, count bigint)");
    expect(sql).toContain("create or replace function public.get_lead_status_counts( p_org_id uuid, p_is_root boolean default false, p_scope text default 'all'::text");
    expect(sql).toContain("organization_teams");
    expect(sql).toContain("organization_team_members");
    expect(sql).toContain("raise exception 'permission denied: % required', p_permission_code");
  });

  it("hardens lead RLS, identity upsert and legacy RPC exposure", () => {
    const sql = normalizedSql();

    expect(sql).toContain("drop policy if exists anew_leads_select on public.anew_leads");
    expect(sql).toContain("create policy anew_leads_select on public.anew_leads for select to authenticated using");
    expect(sql).toContain("has_anew_permission(auth.uid(), 'leads.view'::text)");
    expect(sql).toContain("create policy anew_leads_insert on public.anew_leads for insert to authenticated with check");
    expect(sql).toContain("has_anew_permission(auth.uid(), 'leads.create'::text)");
    expect(sql).toContain("create policy anew_leads_update on public.anew_leads for update to authenticated using");
    expect(sql).toContain("has_anew_permission(auth.uid(), 'leads.edit'::text)");
    expect(sql).toContain("create policy anew_leads_delete on public.anew_leads for delete to authenticated using");
    expect(sql).toContain("has_anew_permission(auth.uid(), 'leads.delete'::text)");
    expect(sql).toContain("resolve_root_organization_id(organization_id)");

    expect(sql).toContain("create or replace function public.upsert_entity_identity");
    expect(sql).toContain("p_emails jsonb default null::jsonb");
    expect(sql).toContain("p_phones jsonb default null::jsonb");
    expect(sql).toContain("p_addresses jsonb default null::jsonb");
    expect(sql).toContain("jsonb_typeof(p_emails)");
    expect(sql).toContain("jsonb_typeof(p_phones)");
    expect(sql).toContain("jsonb_typeof(p_addresses)");
    expect(sql).toContain("public.can_see_entity(p_entity_id, auth.uid())");

    expect(sql).toContain("create or replace function public.can_see_entity");
    expect(sql).toContain("coalesce( public.current_business_user_id()");

    expect(sql).toContain("create or replace function public.revert_lead_to_contact");
    expect(sql).toContain("permission denied: leads.edit required");
    expect(sql).toContain("for update");

    expect(sql).toContain("revoke all on function public.revert_lead_to_contact_conversion(uuid) from public, anon, authenticated, service_role");
    expect(sql).toContain("revoke all on function public.create_entity_with_contacts_and_roles(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated, service_role");
    expect(sql).toContain("grant all on function public.create_entity_with_contacts_and_roles(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) to service_role");
    expect(sql).toContain("revoke all on function public.get_lead_dashboard_stats(uuid, timestamp with time zone, timestamp with time zone) from public, anon, authenticated");
    expect(sql).toContain("grant all on function public.get_lead_dashboard_stats(uuid, timestamp with time zone, timestamp with time zone) to service_role");
    expect(sql).toContain("revoke all on function public.get_lead_dashboard_stats_scoped");
    expect(sql).toContain("grant all on function public.get_lead_dashboard_stats_scoped");
    expect(sql).toContain("revoke all on function public.get_lead_status_counts");
    expect(sql).toContain("grant all on function public.get_lead_status_counts");
    expect(sql).toContain("grant all on function public.resolve_root_organization_id(uuid) to service_role");
  });

  it("adds the source lead integrity and transactional duplicate helper safely", () => {
    const sql = normalizedSql();

    expect(sql).toContain("alter table public.anew_contacts");
    expect(sql).toContain("add constraint anew_contacts_source_lead_id_fkey");
    expect(sql).toContain("foreign key (source_lead_id) references public.anew_leads(id) on delete set null not valid");

    expect(sql).toContain("create function public.assert_lead_dynamic_uniqueness");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("duplicate lead detected for");
    expect(sql).toContain("create or replace function public.enforce_lead_dynamic_uniqueness");
    expect(sql).toContain("create trigger enforce_lead_dynamic_uniqueness");
    expect(sql).toContain("before insert or update of field_values, campaign_id, organization_id, root_organization_id");
  });

  it("provides bounded aggregate RPCs for page health and source options", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create function public.get_lead_page_health");
    expect(sql).toContain("count(ei.id) filter");
    expect(sql).toContain("bool_or(d.id is not null)");
    expect(sql).toContain("d.closed_at is null");
    expect(sql).not.toContain("d.status not in ('won', 'lost')");
    expect(sql).toContain("create function public.get_lead_source_options");
    expect(sql).toContain("select distinct btrim(l.source)");
    expect(sql).toContain("grant all on function public.get_lead_page_health");
    expect(sql).toContain("grant all on function public.get_lead_source_options");
  });

  it("declares each scoped-lead date parameter only once", () => {
    const sql = normalizedSql();
    const signature = sql.match(
      /create or replace function public\.get_scoped_leads_base\((.*?)\) returns table/,
    )?.[1] ?? "";

    expect(signature.match(/p_date_from/g)).toHaveLength(1);
    expect(signature.match(/p_date_to/g)).toHaveLength(1);
  });

  it("validates the source lead foreign key in a follow-up migration", () => {
    const sql = readFileSync(validationMigrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain(
      "alter table public.anew_contacts validate constraint anew_contacts_source_lead_id_fkey",
    );
  });

  it("fixes scoped RPC result types and legacy auth ownership forward-only", () => {
    const sql = readFileSync(scopedRpcFixMigrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain("l.source::text as source");
    expect(sql).toContain("v_ctx.auth_user_id");
    expect(sql).toContain("cl.lead_id, cl.organization_id");
    expect(sql).not.toContain("select * from candidate_leads");
  });

  it("gives super admins ORG scope only inside their governed organization graph", () => {
    const sql = readFileSync(superAdminScopeFixMigrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain("role_code = 'system_admin'");
    expect(sql).toContain("role_code = 'super_admin'");
    expect(sql).toContain("super_descendants");
    expect(sql).toContain("super_ancestors");
    expect(sql).toContain("anew_org_associations");
    expect(sql).toContain("v_permitted_scope := 'org'");
  });
});
