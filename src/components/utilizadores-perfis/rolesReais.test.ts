import { describe, expect, it } from "vitest";
import {
  agruparPermissoesPorRole, autorizacoesRole, contarPorRole, dadosParaRpc, filtrarRoles, mensagemDeErro, permissaoDaBase,
  permissoesDoMenu, roleDaBase, rolesVisiveis, tiraPermissoesDoEditor, type LinhaPermissao, type LinhaRole,
} from "./rolesReais";

const linha = (p: Partial<LinhaRole>): LinhaRole => ({
  id: "r", code: "x", name: "X", description: null, organization_id: "org-a", is_system: false,
  can_sign_contracts: false, created_by: null, deleted_at: null, ...p,
});

describe("rolesVisiveis (regras de Roles.tsx)", () => {
  const todas = [
    linha({ id: "1", code: "system_admin", organization_id: null }),
    linha({ id: "2", code: "super_admin", organization_id: null }),
    linha({ id: "3", code: "org_admin", organization_id: null }),
    linha({ id: "4", code: "org_viewer", organization_id: null }),
    linha({ id: "5", code: "org_viewer", organization_id: null }),
    linha({ id: "6", code: "comercial", organization_id: "org-a" }),
    linha({ id: "7", code: "comercial", organization_id: "org-pai" }),
    linha({ id: "8", code: "outra", organization_id: "org-estranha" }),
  ];
  const orgs = new Set(["org-a", "org-pai"]);
  const ids = (papel: string | null) => rolesVisiveis(todas, papel, orgs).map((r) => r.id);

  it("só o system_admin vê a role system_admin", () => {
    expect(ids("system_admin")).toContain("1");
    expect(ids("super_admin")).not.toContain("1");
    expect(ids("org_admin")).not.toContain("1");
  });
  it("super_admin e org_admin de sistema só para super_admin ou acima", () => {
    expect(ids("super_admin")).toEqual(expect.arrayContaining(["2", "3"]));
    expect(ids("org_admin")).not.toContain("2");
    expect(ids("org_admin")).not.toContain("3");
    expect(ids(null)).not.toContain("3");
  });
  it("roles de sistema repetidas por código aparecem uma vez; as da organização e das ascendentes ficam todas", () => {
    const v = ids("org_admin");
    expect(v.filter((i) => i === "4" || i === "5")).toEqual(["4"]);
    expect(v).toEqual(expect.arrayContaining(["6", "7"]));
  });
  it("esconde as de organizações que não são a ativa nem ascendentes", () => {
    expect(ids("system_admin")).not.toContain("8");
  });
});

describe("mapeamento base -> maquete", () => {
  it("roleDaBase leva as permissões, os campos de âmbito e o estado eliminada", () => {
    const r = roleDaBase(linha({ id: "9", code: "c", name: "C", description: null, is_system: true, can_sign_contracts: true, created_by: "u1", deleted_at: "2026-01-01" }), ["a.view"]);
    expect(r).toMatchObject({ id: "9", codigo: "c", nome: "C", descricao: "", sistema: true, podeAssinar: true, permissoes: ["a.view"], eliminada: true, criadoPor: "u1", organizacaoId: "org-a" });
    expect(roleDaBase(linha({}), []).eliminada).toBe(false);
  });
  it("agruparPermissoesPorRole junta por role", () => {
    expect(agruparPermissoesPorRole([{ role_id: "a", permission_code: "x.view" }, { role_id: "a", permission_code: "x.edit" }, { role_id: "b", permission_code: "y.view" }]))
      .toEqual({ a: ["x.view", "x.edit"], b: ["y.view"] });
  });
  it("permissaoDaBase usa as marcas reais e traduz os nomes conhecidos", () => {
    const l: LinhaPermissao = { code: "scheduling.boards.view", name: "View scheduling boards", category: "scheduling", is_dangerous: false, supports_scope: true };
    expect(permissaoDaBase(l)).toMatchObject({ codigo: "scheduling.boards.view", categoria: "scheduling", nome: "Ver quadros de agendamento", perigosa: false, comAmbito: true });
    expect(permissaoDaBase({ ...l, name: "Algo", is_dangerous: true, supports_scope: null })).toMatchObject({ nome: "Algo", perigosa: true, comAmbito: false });
  });
  it("permissoesDoMenu só deixa as categorias do menu (incluindo hr)", () => {
    const l = (code: string, category: string): LinhaPermissao => ({ code, name: code, category, is_dangerous: false });
    const r = permissoesDoMenu([l("leads.view", "leads"), l("hr.people.view", "hr"), l("zzz.view", "zzz"), l("a.b", "")]);
    expect(r.map((p) => p.codigo)).toEqual(["leads.view", "hr.people.view"]);
  });
  it("tiraPermissoesDoEditor deixa a um não administrador só as permissões que ele tem", () => {
    expect(tiraPermissoesDoEditor(["a", "b"], { administradorSistema: false, codigos: ["b"] })).toEqual(["b"]);
    expect(tiraPermissoesDoEditor(["a", "b"], { administradorSistema: true, codigos: [] })).toEqual(["a", "b"]);
  });
  it("contarPorRole conta utilizadores distintos", () => {
    expect(contarPorRole([{ role_id: "a", user_id: "u1" }, { role_id: "a", user_id: "u1" }, { role_id: "a", user_id: "u2" }, { role_id: "b", user_id: "u1" }], ["a", "b", "c"]))
      .toEqual({ a: 2, b: 1, c: 0 });
  });
});

describe("autorizacoesRole", () => {
  const base = { podeCriar: true, podeEditar: true, podeEliminar: true, ambitoEditar: "ORG" as const, ambitoEliminar: "ORG" as const, anewUserId: "u1" };
  const agir = (escopo: "NONE" | "OWNED" | "TEAM" | "ORG", entidade: { created_by?: string | null }, utilizador: string | null) =>
    escopo === "ORG" ? true : escopo === "NONE" ? false : entidade.created_by === utilizador;
  const aut = (p: Partial<typeof base>) => autorizacoesRole({ ...base, ...p }, agir);
  const custom = roleDaBase(linha({ created_by: "u1" }), []);
  const sistema = roleDaBase(linha({ is_system: true }), []);

  it("edita uma role personalizada com roles.edit e âmbito", () => {
    expect(aut({}).podeEditar(custom)).toBe(true);
    expect(aut({ podeEditar: false }).podeEditar(custom)).toBe(false);
    expect(aut({ ambitoEditar: "NONE" }).podeEditar(custom)).toBe(false);
  });
  it("respeita o âmbito OWNED pelo criador", () => {
    expect(aut({ ambitoEditar: "OWNED" }).podeEditar(roleDaBase(linha({ created_by: "outro" }), []))).toBe(false);
    expect(aut({ ambitoEditar: "OWNED" }).podeEditar(custom)).toBe(true);
  });
  it("uma role de sistema nunca se elimina nem restaura", () => {
    expect(aut({}).podeEliminar(sistema)).toBe(false);
    expect(aut({}).podeRestaurar(sistema)).toBe(false);
  });
  it("eliminar pede roles.delete; restaurar também; uma eliminada não se edita", () => {
    expect(aut({ podeEliminar: false }).podeEliminar(custom)).toBe(false);
    const eliminada = roleDaBase(linha({ deleted_at: "x" }), []);
    expect(aut({}).podeRestaurar(eliminada)).toBe(true);
    expect(aut({ podeEliminar: false }).podeRestaurar(eliminada)).toBe(false);
    expect(aut({}).podeRestaurar(custom)).toBe(false);
    expect(aut({}).podeEliminar(eliminada)).toBe(false);
    expect(aut({}).podeEditar(eliminada)).toBe(false);
  });
});

describe("filtrarRoles", () => {
  const roles = [roleDaBase(linha({ id: "1", code: "gestor_vendas", name: "Gestor de Vendas" }), []), roleDaBase(linha({ id: "2", code: "leitura", name: "Consulta" }), [])];
  it("procura no nome e no código, sem acentos nem maiúsculas", () => {
    expect(filtrarRoles(roles, "VENDAS").map((r) => r.id)).toEqual(["1"]);
    expect(filtrarRoles(roles, "leit").map((r) => r.id)).toEqual(["2"]);
    expect(filtrarRoles(roles, "  ").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filtrarRoles(roles, "zzz")).toEqual([]);
  });
});

describe("dadosParaRpc e mensagemDeErro", () => {
  it("dadosParaRpc apara texto, gera código se faltar e rejeita nome vazio", () => {
    const ok = dadosParaRpc({ nome: "  Gestor de Vendas ", codigo: "", descricao: " d ", podeAssinar: true, permissoes: ["a"] });
    expect(ok).toEqual({ ok: true, valor: { code: "gestor_de_vendas", name: "Gestor de Vendas", description: "d", can_sign_contracts: true, permissions: ["a"] } });
    const mau = dadosParaRpc({ nome: "  ", codigo: "x", descricao: "", podeAssinar: false, permissoes: [] });
    expect(mau.ok).toBe(false);
  });
  it("mensagemDeErro lê Error, objectos do Supabase e valores estranhos", () => {
    expect(mensagemDeErro(new Error("boom"))).toBe("boom");
    expect(mensagemDeErro({ message: "rls" })).toBe("rls");
    expect(mensagemDeErro(null)).toMatch(/erro/i);
  });
});
