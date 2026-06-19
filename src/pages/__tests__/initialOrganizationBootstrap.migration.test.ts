/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260615130000_baseline_new_database.sql",
);
const organizationsPagePath = resolve(process.cwd(), "src/pages/Organizations.tsx");
const orgEntityHelperPath = resolve(process.cwd(), "src/utils/orgEntity.ts");

describe("create_initial_organization migration contract", () => {
  it("keeps first-organization creation atomic and restricted to eligible self-registered users", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase().replaceAll('"', "");
    const functionStart = sql.indexOf("create function public.create_initial_organization");
    const functionEnd = sql.indexOf("create function public.create_lead_entity_for_org", functionStart);
    const functionSql = sql.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("registration_origin = 'self_registration'");
    expect(functionSql).toContain("m.status = 'active'");
    expect(functionSql).toContain("already has an active organization membership");
    expect(functionSql).toContain("insert into public.anew_entities");
    expect(functionSql).toContain("insert into public.anew_organizations");
    expect(functionSql).toContain("insert into public.anew_roles");
    expect(functionSql).toContain("global-role:super_admin");
    expect(functionSql).toContain("perform public.bootstrap_org_creator");
    expect(functionSql).toContain("ar.code = 'super_admin'");
    expect(functionSql).not.toContain("ar.code = 'system_admin'");
    expect(functionSql).toContain("organization bootstrap did not assign super_admin membership");
    expect(sql).toContain("revoke all on function public.create_initial_organization");
    expect(sql).toContain("grant all on function public.create_initial_organization");
  });

  it("routes only the no-organization and no-create-permission branch through the bootstrap RPC", () => {
    const source = readFileSync(organizationsPagePath, "utf8");

    expect(source).toContain(
      'const isInitialOrganizationCreation = organizations.length === 0 && !hasPermission("organizations.create")',
    );
    expect(source).toContain('"create_initial_organization"');
    expect(source.indexOf("if (selectedTemplateId)")).toBeLessThan(
      source.indexOf("if (isInitialOrganizationCreation)"),
    );
  });

  it("creates normal organization entities without requesting the row before it is visible", () => {
    const source = readFileSync(orgEntityHelperPath, "utf8");
    const functionStart = source.indexOf("export async function createOrganizationEntity");
    const functionEnd = source.indexOf("\nexport async function resolveOrganizationEntityId", functionStart);
    const functionSource = source.slice(functionStart, functionEnd);

    expect(functionSource).toContain("crypto.randomUUID()");
    expect(functionSource).toContain("id: entityId");
    expect(functionSource).not.toContain('.select("id")');
    expect(functionSource).toContain("return entityId");
  });
});
