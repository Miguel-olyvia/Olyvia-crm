// Que roles cada organização oferece num vínculo (como UserFormEnhanced): as dela e as da holding, nunca as eliminadas.
import { describe, expect, it } from "vitest";
import { rolesDaOrganizacao, rolesDoVinculo } from "./regrasVinculos";
import type { Organizacao, Role } from "./tipos";

const role = (id: string, organizacaoId: string | null, extra: Partial<Role> = {}): Role => ({
  id, codigo: id, nome: id, descricao: "", sistema: organizacaoId === null, podeAssinar: false, permissoes: ["a.view"], organizacaoId, ...extra,
});
const orgs: Organizacao[] = [{ id: "grupo", nome: "Grupo" }, { id: "empresa", nome: "Empresa", paiId: "grupo" }, { id: "outra", nome: "Outra" }];
const roles = [role("rg", "grupo"), role("re", "empresa"), role("ro", "outra"), role("sys", null), role("velha", "empresa", { eliminada: true })];
const editorTudo = { administradorSistema: true, codigos: [] as string[] };

describe("rolesDaOrganizacao", () => {
  it("devolve as da organização e as das ascendentes", () => {
    expect(rolesDaOrganizacao(roles, "empresa", orgs).map((r) => r.id).sort()).toEqual(["re", "rg"]);
    expect(rolesDaOrganizacao(roles, "grupo", orgs).map((r) => r.id)).toEqual(["rg"]);
  });
  it("sem organização escolhida não oferece nada; roles de sistema e eliminadas ficam de fora", () => {
    expect(rolesDaOrganizacao(roles, "", orgs)).toEqual([]);
    expect(rolesDaOrganizacao(roles, "empresa", orgs).map((r) => r.id)).not.toContain("sys");
    expect(rolesDaOrganizacao(roles, "empresa", orgs).map((r) => r.id)).not.toContain("velha");
  });
  it("uma hierarquia com ciclo não prende", () => {
    const ciclo: Organizacao[] = [{ id: "a", nome: "A", paiId: "b" }, { id: "b", nome: "B", paiId: "a" }];
    expect(rolesDaOrganizacao([role("ra", "a")], "a", ciclo)).toHaveLength(1);
  });
});

describe("rolesDoVinculo", () => {
  it("aplica a regra do subconjunto de permissões de quem atribui", () => {
    const poucas = { administradorSistema: false, codigos: [] as string[] };
    expect(rolesDoVinculo(roles, { organizacaoId: "empresa", roleId: "" }, orgs, poucas)).toEqual([]);
    expect(rolesDoVinculo(roles, { organizacaoId: "empresa", roleId: "" }, orgs, { administradorSistema: false, codigos: ["a.view"] })).toHaveLength(2);
  });
  it("a role que o vínculo já tem aparece sempre, mesmo de sistema ou fora do que se pode atribuir", () => {
    const r = rolesDoVinculo(roles, { organizacaoId: "empresa", roleId: "sys" }, orgs, editorTudo);
    expect(r[0].id).toBe("sys");
    expect(r).toHaveLength(3);
  });
  it("nunca oferece super_admin para atribuir de novo", () => {
    const comSuper = [...roles, role("su", "empresa", { codigo: "super_admin" })];
    expect(rolesDoVinculo(comSuper, { organizacaoId: "empresa", roleId: "" }, orgs, editorTudo).map((r) => r.id)).not.toContain("su");
  });
});
