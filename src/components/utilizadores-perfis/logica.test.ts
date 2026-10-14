import { describe, expect, it } from "vitest";
import { PERMISSOES, ROLES_EXEMPLO } from "./catalogoExemplo";
import {
  agruparPorModulo, ambitoDe, aplicarEscolhas, contarPessoasPorRole, diasDesde, ehProtegido, filtrarUtilizadores,
  haFiltros, normalizar, permissoesEfetivas, pessoasDaRole, podeEliminarRole, resumoAmbito, rolesAtribuiveis,
} from "./logica";
import { FILTROS_INICIAIS, type FiltrosUtilizadores, type Utilizador } from "./tipos";
import { UTILIZADORES_EXEMPLO as U } from "./utilizadoresExemplo";

const roles = ROLES_EXEMPLO;
const filtros = (f: Partial<FiltrosUtilizadores>): FiltrosUtilizadores => ({ ...FILTROS_INICIAIS, estado: "todos", ...f });
const utilizador = (id: string): Utilizador => U.find((u) => u.id === id)!;
const idsDe = (us: Utilizador[]) => us.map((u) => u.id);

describe("dados de exemplo", () => {
  it("têm 12 utilizadores, 30 permissões em 6 módulos e as roles pedidas", () => {
    expect(U).toHaveLength(12);
    expect(PERMISSOES).toHaveLength(30);
    expect(new Set(PERMISSOES.map((p) => p.modulo)).size).toBe(6);
    expect(roles.map((r) => r.codigo)).toEqual(expect.arrayContaining(["super_admin", "org_admin", "comercial", "rh", "operacoes", "leitura"]));
    expect(U.some((u) => u.vinculos.length === 3)).toBe(true);
    expect(U.some((u) => !u.ativo)).toBe(true);
  });
});

describe("filtrarUtilizadores", () => {
  it("por omissão mostra só os ativos", () => {
    expect(filtrarUtilizadores(U, FILTROS_INICIAIS)).toHaveLength(11);
    expect(idsDe(filtrarUtilizadores(U, filtros({ estado: "inativos" })))).toEqual(["u-08"]);
    expect(filtrarUtilizadores(U, filtros({}))).toHaveLength(12);
  });

  it("pesquisa por nome ou email sem depender de acentos nem de maiúsculas", () => {
    expect(idsDe(filtrarUtilizadores(U, filtros({ texto: "INES carvalhal" })))).toEqual(["u-05"]);
    expect(idsDe(filtrarUtilizadores(U, filtros({ texto: "brandao@" })))).toEqual(["u-09"]);
    expect(filtrarUtilizadores(U, filtros({ texto: "zzz" }))).toEqual([]);
  });

  it("filtra por role e por organização no mesmo vínculo", () => {
    expect(idsDe(filtrarUtilizadores(U, filtros({ roleId: "r-rh" })))).toEqual(["u-05", "u-11"]);
    expect(idsDe(filtrarUtilizadores(U, filtros({ roleId: "r-comercial", organizacaoId: "o-norte" })))).toEqual(["u-02", "u-08"]);
    expect(filtrarUtilizadores(U, filtros({ roleId: "r-rh", organizacaoId: "o-sul" }))).toEqual([]);
  });

  it("não perde um utilizador sem vínculos quando não há filtro de role nem de organização", () => {
    const sem: Utilizador = { ...utilizador("u-03"), vinculos: [] };
    expect(filtrarUtilizadores([sem], filtros({}))).toHaveLength(1);
    expect(filtrarUtilizadores([sem], filtros({ roleId: "r-rh" }))).toHaveLength(0);
  });

  it("haFiltros distingue o estado inicial", () => {
    expect(haFiltros(FILTROS_INICIAIS)).toBe(false);
    expect(haFiltros({ ...FILTROS_INICIAIS, estado: "todos" })).toBe(true);
    expect(haFiltros({ ...FILTROS_INICIAIS, texto: "  " })).toBe(false);
  });
});

describe("pessoas por role", () => {
  it("conta cada pessoa uma vez, mesmo com a role em duas organizações", () => {
    const duas: Utilizador = { ...utilizador("u-01") }; // super_admin em duas organizações
    expect(pessoasDaRole([duas], "r-super")).toHaveLength(1);
  });

  it("conta todas as roles, incluindo as sem ninguém", () => {
    const sem = contarPessoasPorRole([], roles);
    expect(Object.keys(sem)).toHaveLength(roles.length);
    expect(Object.values(sem).every((n) => n === 0)).toBe(true);
    const n = contarPessoasPorRole(U, roles);
    expect(n["r-super"]).toBe(1);
    expect(n["r-rh"]).toBe(2);
    expect(n["r-leitura"]).toBe(3);
  });
});

describe("proteção", () => {
  it("o super administrador está protegido e não se atribui por aqui", () => {
    expect(ehProtegido(utilizador("u-01"), roles)).toBe(true);
    expect(ehProtegido(utilizador("u-03"), roles)).toBe(false);
    expect(rolesAtribuiveis(roles).some((r) => r.codigo === "super_admin")).toBe(false);
    expect(rolesAtribuiveis(roles)).toHaveLength(roles.length - 1);
  });

  it("as roles de sistema não se eliminam", () => {
    expect(podeEliminarRole(roles.find((r) => r.codigo === "org_admin")!)).toBe(false);
    expect(podeEliminarRole(roles.find((r) => r.codigo === "comercial")!)).toBe(true);
  });
});

describe("permissões efetivas", () => {
  it("juntam as roles dos vínculos ativos e dizem de onde vem cada permissão", () => {
    const rui = permissoesEfetivas(utilizador("u-02"), roles);
    const verClientes = rui.find((e) => e.permissao.codigo === "clients.view")!;
    expect(verClientes.origens.map((r) => r.codigo).sort()).toEqual(["comercial", "leitura", "org_admin"]);
    expect(rui.find((e) => e.permissao.codigo === "hr.sensitive")).toBeUndefined();
  });

  it("ignoram vínculos inativos e roles desconhecidas", () => {
    expect(permissoesEfetivas(utilizador("u-08"), roles)).toEqual([]);
    const fantasma: Utilizador = { ...utilizador("u-03"), vinculos: [{ organizacaoId: "o-x", roleId: "r-nada", ativo: true, ambitos: {} }] };
    expect(permissoesEfetivas(fantasma, roles)).toEqual([]);
  });

  it("agrupam por módulo e omitem módulos sem permissões", () => {
    const grupos = agruparPorModulo(permissoesEfetivas(utilizador("u-07"), roles));
    expect(grupos.map((g) => g.modulo)).toEqual(["clients", "deals", "contracts"]);
    expect(grupos.every((g) => g.itens.length === 1)).toBe(true);
    expect(agruparPorModulo([])).toEqual([]);
  });
});

describe("âmbito", () => {
  it("é o mais largo entre os vínculos ativos que dão a permissão", () => {
    expect(ambitoDe(utilizador("u-02"), roles, "clients.view")).toBe("ORG");
    expect(ambitoDe(utilizador("u-03"), roles, "clients.view")).toBe("TEAM");
    expect(ambitoDe(utilizador("u-03"), roles, "hr.view")).toBe("NONE");
  });

  it("resume o utilizador pelo âmbito mais largo; sem permissões com âmbito, nenhum", () => {
    expect(resumoAmbito(utilizador("u-01"), roles)).toBe("ORG");
    expect(resumoAmbito(utilizador("u-04"), roles)).toBe("OWNED");
    expect(resumoAmbito(utilizador("u-08"), roles)).toBe("NONE");
  });

  it("o que não está definido no vínculo é só os próprios", () => {
    const u: Utilizador = { ...utilizador("u-04"), vinculos: [{ organizacaoId: "o-aurora", roleId: "r-comercial", ativo: true, ambitos: {} }] };
    expect(ambitoDe(u, roles, "deals.view")).toBe("OWNED");
  });
});

describe("aplicarEscolhas e diasDesde", () => {
  it("troca a role de uma organização sem alterar o original", () => {
    const original = utilizador("u-02");
    const novo = aplicarEscolhas(original, { "o-norte": "r-rh" });
    expect(novo.vinculos.find((v) => v.organizacaoId === "o-norte")!.roleId).toBe("r-rh");
    expect(original.vinculos.find((v) => v.organizacaoId === "o-norte")!.roleId).toBe("r-comercial");
    expect(aplicarEscolhas(original, {})).toEqual(original);
  });

  it("conta dias e trata o nunca como null", () => {
    expect(diasDesde("2026-10-14", "2026-10-14")).toBe(0);
    expect(diasDesde("2026-10-04", "2026-10-14")).toBe(10);
    expect(diasDesde(null, "2026-10-14")).toBeNull();
  });

  it("normalizar tira acentos", () => {
    expect(normalizar("  Inês Brandão ")).toBe("ines brandao");
  });
});
