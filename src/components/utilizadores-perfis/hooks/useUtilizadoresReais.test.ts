// A leitura real de utilizadores (Supabase simulado): o que lê, o filtro por organização e a falha que não se esconde.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseFalso } from "./supabaseFalso";

const estado = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: (_t, k) => (estado.cliente as Record<string | symbol, unknown>)[k] }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: vi.fn() }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: vi.fn() }));

import { lerUtilizadoresDaBase, type ParametrosLeitura } from "./useUtilizadoresReais";

const tabelas = {
  anew_hierarchy: [{ parent_org_id: "grupo", child_org_id: "empresa" }],
  anew_organizations: [
    { id: "grupo", name: "Grupo", type: "holding" }, { id: "empresa", name: "Empresa", type: "company" },
    { id: "velha", name: "Velha", type: "inactive" }, { id: "outra", name: "Outra", type: "company" },
  ],
  anew_users: [
    { id: "u1", email: "ana@x.pt", name: "Ana", phone: null, auth_user_id: "a1", status: "active", entity_id: "e1", position: "Chefe", created_by: null },
    { id: "u2", email: "rui@x.pt", name: "Rui", phone: null, auth_user_id: "a2", status: "active", entity_id: null, position: null, created_by: null },
  ],
  anew_memberships: [
    { id: "m1", user_id: "u1", organization_id: "empresa", relationship_type: "BELONGS_TO", role_id: "r1", status: "active", join_method: null },
    { id: "m2", user_id: "u2", organization_id: "outra", relationship_type: "BELONGS_TO", role_id: "r1", status: "active", join_method: null },
  ],
  anew_roles: [{ id: "r1", code: "comercial", name: "Comercial", description: null, organization_id: "empresa", is_system: false, can_sign_contracts: false }],
  anew_role_permissions: [{ role_id: "r1", permission_code: "leads.view" }],
  anew_entity_phones: [{ entity_id: "e1", phone_number: "920000000", country_code: "+351", is_primary: true }],
  anew_membership_permission_scopes: [{ membership_id: "m1", permission_code: "leads.view", scope_level: "ORG" }],
};

const parametros = (extra: Partial<ParametrosLeitura> = {}): ParametrosLeitura => ({
  orgAtivaId: "empresa", tipoSistema: false, escopoOrganizacoes: "ORG", anewUserId: "ub", idsEmpresasDoUtilizador: ["empresa"], ...extra,
});

beforeEach(() => { estado.cliente = criarSupabaseFalso({ tabelas }).cliente; });

describe("lerUtilizadoresDaBase", () => {
  it("devolve só os utilizadores com vínculo ativo na organização ativa e arredores, com telefone, role e âmbitos", async () => {
    const r = await lerUtilizadoresDaBase(parametros());
    expect(r.todos.map((u) => u.id)).toEqual(["u1"]);
    expect(r.todos[0]).toMatchObject({ telefone: "+351 920000000", posicao: "Chefe" });
    expect(r.todos[0].vinculos[0]).toMatchObject({ roleCodigo: "comercial", ambitos: { "leads.view": "ORG" } });
  });

  it("as organizações vêm sem as inativas e com o nome da organização-pai; as dos vínculos fora do âmbito entram também", async () => {
    const r = await lerUtilizadoresDaBase(parametros());
    expect(r.organizacoes.map((o) => o.id).sort()).toEqual(["empresa", "grupo", "outra"]);
    expect(r.organizacoes.find((o) => o.id === "empresa")).toMatchObject({ pai: "Grupo", paiId: "grupo" });
  });

  it("devolve as roles dos vínculos com as suas permissões", async () => {
    const r = await lerUtilizadoresDaBase(parametros());
    expect(r.rolesDosVinculos).toEqual([expect.objectContaining({ id: "r1", codigo: "comercial", permissoes: ["leads.view"] })]);
  });

  it("com âmbito NONE só lê as organizações a que quem vê pertence", async () => {
    const falso = criarSupabaseFalso({ tabelas });
    estado.cliente = falso.cliente;
    await lerUtilizadoresDaBase(parametros({ escopoOrganizacoes: "NONE", idsEmpresasDoUtilizador: ["empresa"] }));
    const pedido = falso.chamadas.find((c) => c.tabela === "anew_organizations" && c.filtros.some(([f]) => f === "in:id"));
    expect(pedido?.filtros).toContainEqual(["in:id", ["empresa"]]);
  });

  it("uma falha numa leitura sobe como erro e não vira lista vazia", async () => {
    estado.cliente = criarSupabaseFalso({ tabelas, erros: { anew_memberships: "permission denied" } }).cliente;
    await expect(lerUtilizadoresDaBase(parametros())).rejects.toThrow("permission denied");
  });

  it("sem utilizadores devolve listas vazias sem pedir memberships", async () => {
    const falso = criarSupabaseFalso({ tabelas: { ...tabelas, anew_users: [] } });
    estado.cliente = falso.cliente;
    const r = await lerUtilizadoresDaBase(parametros());
    expect(r.todos).toEqual([]);
    expect(falso.chamadas.some((c) => c.tabela === "anew_memberships")).toBe(false);
  });
});
