// Os comerciais da «Nova lead»: cópia da leitura de Leads. O Supabase é simulado (as tabelas devolvem-se tal como estão, sem filtros).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseFalso } from "./supabaseFalso";
import { lerComerciais, resolverOrgRaiz } from "./comerciaisNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));

const ORG = "loja";

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = {
    anew_hierarchy: [{ parent_org_id: "loja", child_org_id: "comercial" }, { parent_org_id: "loja", child_org_id: "oficina" }],
    anew_organizations: (c) => (c.colunas?.includes("entity_id")
      ? { data: [{ id: "comercial", entity_id: "e-dep" }], error: null }
      : { data: [
        { id: "loja", name: "Loja", type: "empresa" }, { id: "comercial", name: "Comercial", type: "departamento" },
        { id: "oficina", name: "Oficina", type: "departamento" },
      ], error: null }),
    anew_memberships: [
      { user_id: "u1", organization_id: "comercial", role_id: "r1" }, { user_id: "u2", organization_id: "comercial", role_id: "r2" },
      { user_id: "u3", organization_id: "comercial", role_id: "r-cliente" },
    ],
    anew_roles: [{ id: "r1", code: "vendedor" }, { id: "r2", code: "vendedor" }, { id: "r-cliente", code: "client" }],
    anew_users: [{ id: "u1", name: "Rui", entity_id: "e1", status: "active" }, { id: "u2", name: "Sofia", entity_id: null, status: "active" }],
    anew_entity_addresses: (c) => (valorEntidades(c).includes("e1")
      ? { data: [{ entity_id: "e1", address: { district: "Porto", city: "Porto" } }], error: null }
      : { data: [{ entity_id: "e-dep", address: { district: "Lisboa", city: "Lisboa" } }], error: null }),
  };
});

const valorEntidades = (c: { filtros: Array<[string, unknown[]]> }): string[] =>
  (c.filtros.find(([m, a]) => m === "in" && a[0] === "entity_id")?.[1][1] as string[]) ?? [];

describe("lerComerciais", () => {
  it("usa o departamento «Comercial», tira clientes e põe o concelho: o pessoal, ou o do departamento", async () => {
    const r = await lerComerciais(ORG);
    expect(r.users).toEqual([
      { id: "u1", name: "Rui", districts: ["Porto"], org_ids: ["loja", "comercial"] },
      { id: "u2", name: "Sofia", districts: ["Lisboa"], org_ids: ["loja", "comercial"] },
    ]);
    expect(r.tree).toEqual([
      { id: "loja", name: "Loja", type: "empresa", depth: 0 },
      { id: "comercial", name: "Comercial", type: "departamento", depth: 1 },
      { id: "oficina", name: "Oficina", type: "departamento", depth: 1 },
    ]);
  });

  it("sem departamento «Comercial» usa todas as organizações da árvore", async () => {
    supabaseFalso.estado.tabelas.anew_organizations = [{ id: "loja", name: "Loja", type: "empresa" }];
    await lerComerciais(ORG);
    const membros = supabaseFalso.chamadasA("anew_memberships", "select")[0];
    expect(membros.filtros.find(([m, a]) => m === "in" && a[0] === "organization_id")?.[1][1]).toEqual(["loja", "comercial", "oficina"]);
  });

  it("sem membros devolve a árvore e nenhum utilizador", async () => {
    supabaseFalso.estado.tabelas.anew_memberships = [];
    const r = await lerComerciais(ORG);
    expect(r.users).toEqual([]);
    expect(r.tree).toHaveLength(3);
  });
});

describe("resolverOrgRaiz", () => {
  it("sobe a hierarquia até à raiz", async () => {
    supabaseFalso.estado.tabelas.anew_hierarchy = (c) => {
      const filha = c.filtros.find(([m, a]) => m === "eq" && a[0] === "child_org_id")?.[1][1];
      return { data: filha === "loja" ? [{ parent_org_id: "grupo" }] : [], error: null };
    };
    expect(await resolverOrgRaiz("loja")).toBe("grupo");
  });
});
