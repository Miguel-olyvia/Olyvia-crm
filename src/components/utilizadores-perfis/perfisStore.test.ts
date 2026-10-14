// O store em memória de roles e utilizadores: parte dos dados de exemplo, que nunca se alteram.
import { beforeEach, describe, expect, it } from "vitest";
import { ROLES_EXEMPLO } from "./catalogoExemplo";
import { contarPermissoesPorRole, contarUtilizadoresPorRole, filtrarUtilizadores } from "./logica";
import {
  criarRole, criarUtilizador, definirAtivo, estadoDe, guardarRole, guardarUtilizador, mudarRoleVinculo, repor,
  rolesAtuais, utilizadoresAtuais, type DadosRole, type DadosUtilizador,
} from "./perfisStore";
import { FILTROS_INICIAIS } from "./tipos";
import { UTILIZADORES_EXEMPLO } from "./utilizadoresExemplo";

const ROLE: DadosRole = { nome: "Parceiros", codigo: "parceiros", descricao: "d", podeAssinar: true, permissoes: ["leads.view"] };
const UTIL: DadosUtilizador = {
  nome: " Ana Prata ", email: "ana@exemplo.pt", telefone: "", morada: "", posicao: "", estado: "convidado",
  vinculos: [{ organizacaoId: "o-grupo", roleId: "r-comercial", ativo: true, ambitos: {} }],
};

beforeEach(repor);

describe("perfisStore: sem alterações", () => {
  it("é igual aos dados de exemplo (12 utilizadores, 7 roles)", () => {
    expect(utilizadoresAtuais()).toBe(UTILIZADORES_EXEMPLO);
    expect(rolesAtuais()).toBe(ROLES_EXEMPLO);
    expect(utilizadoresAtuais()).toHaveLength(12);
    expect(rolesAtuais()).toHaveLength(7);
  });
});

describe("perfisStore: roles", () => {
  it("criar acrescenta uma role personalizada, com 0 utilizadores, sem tocar nos dados de exemplo", () => {
    const criada = criarRole(ROLE);
    expect(criada).toMatchObject({ id: "r-nova-1", sistema: false, codigo: "parceiros" });
    expect(rolesAtuais()).toHaveLength(8);
    expect(ROLES_EXEMPLO).toHaveLength(7);
    expect(contarUtilizadoresPorRole(utilizadoresAtuais(), rolesAtuais())[criada.id]).toBe(0);
    expect(contarPermissoesPorRole(rolesAtuais(), [])[criada.id]).toBe(0);
  });

  it("guardar altera a role e mantém o id, o tipo e a ordem; copia as permissões", () => {
    const comercial = rolesAtuais().find((r) => r.id === "r-comercial");
    const dados = { ...ROLE, permissoes: ["a.view"] };
    const guardada = guardarRole("r-comercial", dados);
    expect(guardada).toMatchObject({ id: "r-comercial", nome: "Parceiros", sistema: false });
    expect(guardada?.permissoes).not.toBe(dados.permissoes);
    expect(rolesAtuais().map((r) => r.id)).toEqual(ROLES_EXEMPLO.map((r) => r.id));
    expect(comercial?.nome).toBe("Comercial");
  });

  it("uma role de sistema ou inexistente não se guarda", () => {
    expect(guardarRole("r-admin", ROLE)).toBeNull();
    expect(guardarRole("nao-existe", ROLE)).toBeNull();
    expect(rolesAtuais()).toBe(ROLES_EXEMPLO);
  });

  it("os ids não se repetem", () => {
    expect(criarRole(ROLE).id).not.toBe(criarRole({ ...ROLE, codigo: "outra" }).id);
  });
});

describe("perfisStore: utilizadores", () => {
  it("criar acrescenta o 13.º, convidado, sem último acesso, e aparece na lista de todos e na de ativos", () => {
    const criado = criarUtilizador(UTIL);
    expect(criado).toMatchObject({ id: "u-13", nome: "Ana Prata", ativo: true, convidado: true, ultimoAcesso: null });
    expect(utilizadoresAtuais()).toHaveLength(13);
    expect(estadoDe(criado)).toBe("convidado");
    expect(filtrarUtilizadores(utilizadoresAtuais(), FILTROS_INICIAIS)).toHaveLength(12);
    expect(UTILIZADORES_EXEMPLO).toHaveLength(12);
  });

  it("criado como ativo não é convidado; criado como inativo só aparece com o filtro Inativos", () => {
    expect(estadoDe(criarUtilizador({ ...UTIL, estado: "ativo" }))).toBe("ativo");
    criarUtilizador({ ...UTIL, email: "b@exemplo.pt", estado: "inativo" });
    const inativos = filtrarUtilizadores(utilizadoresAtuais(), { ...FILTROS_INICIAIS, estado: "inativos" });
    expect(inativos.map((u) => u.email)).toEqual(["duarte.lopes@exemplo.pt", "b@exemplo.pt"]);
  });

  it("nunca guarda a palavra-passe", () => {
    const criado = criarUtilizador({ ...UTIL, palavraPasse: "segredo123" } as DadosUtilizador);
    expect(JSON.stringify(criado)).not.toContain("segredo123");
  });

  it("guardar atualiza os dados e o estado, e protege o super administrador", () => {
    const novo = guardarUtilizador("u-03", { ...UTIL, nome: "Marta S.", estado: "inativo" });
    expect(novo).toMatchObject({ id: "u-03", nome: "Marta S.", ativo: false });
    expect(guardarUtilizador("u-01", UTIL)).toBeNull();
    expect(guardarUtilizador("nao-existe", UTIL)).toBeNull();
    expect(UTILIZADORES_EXEMPLO.find((u) => u.id === "u-03")?.nome).toBe("Marta Silveira");
  });

  it("desativar e reativar mudam o estado (e os vínculos) e fazem o filtro reagir", () => {
    definirAtivo("u-04", false);
    const ativos = filtrarUtilizadores(utilizadoresAtuais(), FILTROS_INICIAIS).map((u) => u.id);
    expect(ativos).not.toContain("u-04");
    expect(utilizadoresAtuais().find((u) => u.id === "u-04")?.vinculos.every((v) => !v.ativo)).toBe(true);
    definirAtivo("u-04", true);
    expect(filtrarUtilizadores(utilizadoresAtuais(), FILTROS_INICIAIS).map((u) => u.id)).toContain("u-04");
    expect(definirAtivo("u-01", false)).toBeNull();
  });

  it("mudar a role de um vínculo só mexe nessa organização", () => {
    const novo = mudarRoleVinculo("u-02", "o-grupo", "r-leitura");
    expect(novo?.vinculos.map((v) => v.roleId)).toEqual(["r-leitura", "r-comercial", "r-leitura"]);
    expect(mudarRoleVinculo("u-01", "o-grupo", "r-leitura")).toBeNull();
  });

  it("repor volta aos dados de exemplo e recomeça a numeração", () => {
    criarUtilizador(UTIL);
    repor();
    expect(utilizadoresAtuais()).toBe(UTILIZADORES_EXEMPLO);
    expect(criarUtilizador(UTIL).id).toBe("u-13");
  });
});
