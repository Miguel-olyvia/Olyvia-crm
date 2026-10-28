// Mapeamento das linhas da base para os utilizadores da página (puro, sem base).
import { describe, expect, it } from "vitest";
import {
  ambitosPorMembership, clientesDoPortal, idsOrganizacoesVisiveis, montarUtilizadores, telefonePrincipal, utilizadoresDaLista,
} from "./mapeamentoUtilizadores";

const hierarquia = [
  { parent_org_id: "grupo", child_org_id: "empresa" },
  { parent_org_id: "empresa", child_org_id: "filial" },
];

const base = {
  users: [
    { id: "u1", email: "ana@x.pt", name: "Ana", phone: null, auth_user_id: "a1", status: "active", created_by: "u9", position: "Chefe", entity_id: "e1" },
    { id: "u2", email: "rui@x.pt", name: "Rui", phone: "+351 900", auth_user_id: "a2", status: "inactive", created_by: null, position: null, entity_id: null },
    { id: "u3", email: "cli@x.pt", name: "Cliente", phone: null, auth_user_id: "a3", status: "active", created_by: null, position: null, entity_id: null },
    { id: "u4", email: "fora@x.pt", name: "Fora", phone: null, auth_user_id: "a4", status: "active", created_by: null, position: null, entity_id: null },
  ],
  memberships: [
    { id: "m1", user_id: "u1", organization_id: "empresa", relationship_type: "employee", role_id: "r1", status: "active", join_method: "created_org" },
    { id: "m2", user_id: "u2", organization_id: "filial", relationship_type: "employee", role_id: "r2", status: "active", join_method: null },
    { id: "m3", user_id: "u3", organization_id: "empresa", relationship_type: "client", role_id: "rc", status: "active", join_method: null },
    { id: "m4", user_id: "u4", organization_id: "outra", relationship_type: "employee", role_id: "r2", status: "active", join_method: null },
  ],
  roles: [
    { id: "r1", code: "super_admin", name: "Super" }, { id: "r2", code: "comercial", name: "Comercial" }, { id: "rc", code: "client", name: "Cliente" },
  ],
  phones: [
    { entity_id: "e1", phone_number: "910000000", country_code: "+351", is_primary: false },
    { entity_id: "e1", phone_number: "920000000", country_code: "+351", is_primary: true },
  ],
  scopes: [
    { membership_id: "m1", permission_code: "leads.view", scope_level: "ORG" },
    { membership_id: "m1", permission_code: "leads.edit", scope_level: "OWNED" },
  ],
};

const entrada = (extra: Partial<Parameters<typeof montarUtilizadores>[0]> = {}) => ({
  ...base, authUserId: "a-outro", tipoSistema: false, orgAtivaId: "empresa", orgsVisiveis: idsOrganizacoesVisiveis(hierarquia, "empresa"), ...extra,
});

describe("idsOrganizacoesVisiveis", () => {
  it("junta a organização ativa, as descendentes e as ascendentes", () => {
    expect([...idsOrganizacoesVisiveis(hierarquia, "empresa")].sort()).toEqual(["empresa", "filial", "grupo"]);
  });
  it("sem organização ativa devolve vazio", () => {
    expect(idsOrganizacoesVisiveis(hierarquia, undefined).size).toBe(0);
  });
});

describe("telefonePrincipal", () => {
  it("prefere o principal e junta indicativo e número", () => {
    expect(telefonePrincipal(base.phones)).toBe("+351 920000000");
  });
  it("sem telefones é null", () => {
    expect(telefonePrincipal([])).toBeNull();
    expect(telefonePrincipal(undefined)).toBeNull();
  });
});

describe("ambitosPorMembership", () => {
  it("só guarda o que difere de OWNED", () => {
    expect(ambitosPorMembership(base.scopes)).toEqual({ m1: { "leads.view": "ORG" } });
  });
});

describe("montarUtilizadores", () => {
  it("mapeia estado, vínculos, telefone e âmbitos e esconde quem não tem vínculo ativo na organização visível", () => {
    const lista = montarUtilizadores(entrada());
    expect(lista.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
    const ana = lista[0];
    expect(ana).toMatchObject({ nome: "Ana", ativo: true, telefone: "+351 920000000", posicao: "Chefe", authUserId: "a1", entityId: "e1", criadoPor: "u9", ultimoAcesso: null });
    expect(ana.vinculos[0]).toMatchObject({
      organizacaoId: "empresa", roleId: "r1", ativo: true, membershipId: "m1", relationshipType: "employee", roleCodigo: "super_admin", criador: true,
      ambitos: { "leads.view": "ORG" },
    });
    expect(lista[1].ativo).toBe(false);
    expect(lista[1].telefone).toBe("+351 900");
  });
  it("mostra sempre o próprio utilizador, mesmo sem vínculo visível", () => {
    const lista = montarUtilizadores(entrada({ authUserId: "a4" }));
    expect(lista.map((u) => u.id)).toContain("u4");
  });
  it("administrador de sistema sem organização ativa vê todos", () => {
    const lista = montarUtilizadores(entrada({ tipoSistema: true, orgAtivaId: undefined, orgsVisiveis: new Set<string>() }));
    expect(lista).toHaveLength(4);
  });
  it("um membership inativo fica como vínculo inativo e não torna o utilizador visível", () => {
    const lista = montarUtilizadores(entrada({ memberships: [{ ...base.memberships[3], status: "inactive" }] }));
    expect(lista.map((u) => u.id)).toEqual([]);
  });
});

describe("lista e portal", () => {
  const todos = montarUtilizadores(entrada());
  it("a lista exclui quem só tem a role client", () => {
    expect(utilizadoresDaLista(todos).map((u) => u.id)).toEqual(["u1", "u2"]);
  });
  it("o portal só tem quem tem vínculo ativo de client, com a organização desse vínculo", () => {
    expect(clientesDoPortal(todos)).toEqual([{ id: "u3", nome: "Cliente", organizacaoId: "empresa", ativo: true, ultimoAcesso: null }]);
  });
  it("quem tem client e outra role fica na lista e no portal", () => {
    const misto = montarUtilizadores(entrada({ memberships: [...base.memberships, { id: "m5", user_id: "u1", organization_id: "filial", relationship_type: "client", role_id: "rc", status: "active", join_method: null }] }));
    expect(utilizadoresDaLista(misto).map((u) => u.id)).toContain("u1");
    expect(clientesDoPortal(misto).map((c) => c.id)).toContain("u1");
  });
});
