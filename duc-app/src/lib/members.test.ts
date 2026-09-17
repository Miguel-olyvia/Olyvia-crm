import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock encadeável do supabase: cada `.from(table)` devolve um builder cujos
// métodos (select/eq/in) devolvem o próprio builder, e que é "awaitable"
// resolvendo para os dados configurados por tabela em `tableData`.
const tableData: Record<string, unknown[]> = {};

function makeBuilder(table: string) {
  const result = { data: tableData[table] ?? [], error: null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: typeof result) => unknown) => resolve(result),
  };
  return builder;
}

vi.mock("./supabase", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

import { fetchOrgMembers } from "./members";

beforeEach(() => {
  for (const k of Object.keys(tableData)) delete tableData[k];
});

describe("fetchOrgMembers", () => {
  it("exclui contas de portal (role 'client') e mantém os business users", async () => {
    tableData["anew_memberships"] = [
      { user_id: "u-user", role_id: "r-admin" },
      { user_id: "u-client", role_id: "r-client" },
    ];
    tableData["anew_roles"] = [
      { id: "r-admin", code: "org_admin" },
      { id: "r-client", code: "client" },
    ];
    tableData["anew_users"] = [{ id: "u-user", name: "Ana User" }];

    const members = await fetchOrgMembers("org-1");
    expect(members).toEqual([{ id: "u-user", name: "Ana User" }]);
  });

  it("mantém um user que acumula role de cliente e role de sistema", async () => {
    tableData["anew_memberships"] = [
      { user_id: "u-dual", role_id: "r-client" },
      { user_id: "u-dual", role_id: "r-admin" },
    ];
    tableData["anew_roles"] = [
      { id: "r-admin", code: "org_admin" },
      { id: "r-client", code: "client" },
    ];
    tableData["anew_users"] = [{ id: "u-dual", name: "Dual" }];

    const members = await fetchOrgMembers("org-1");
    expect(members).toEqual([{ id: "u-dual", name: "Dual" }]);
  });

  it("devolve vazio quando só existem contas de portal", async () => {
    tableData["anew_memberships"] = [{ user_id: "u-client", role_id: "r-client" }];
    tableData["anew_roles"] = [{ id: "r-client", code: "client" }];

    const members = await fetchOrgMembers("org-1");
    expect(members).toEqual([]);
  });
});
