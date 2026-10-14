import { describe, expect, it } from "vitest";
import { EDITOR_EXEMPLO, ORGANIZACOES_EXEMPLO, PERMISSOES, ROLES_EXEMPLO } from "./catalogoExemplo";
import {
  ambitoDe, aplicarEscolhas, contarPermissoesPorRole, contarUtilizadoresPorRole, diasDesde, ehProtegido, filtrarUtilizadores,
  haFiltros, normalizar, permissoesEfetivas, permissoesVisiveis, podeEliminarRole, resumoAmbito, rolesAtribuiveis, utilizadoresDaRole,
} from "./logica";
import { FILTROS_INICIAIS, type FiltrosUtilizadores, type Utilizador } from "./tipos";
import { UTILIZADORES_EXEMPLO as U } from "./utilizadoresExemplo";

const roles = ROLES_EXEMPLO;
const filtros = (f: Partial<FiltrosUtilizadores>): FiltrosUtilizadores => ({ ...FILTROS_INICIAIS, estado: "todos", ...f });
const utilizador = (id: string): Utilizador => U.find((u) => u.id === id)!;
const idsDe = (us: Utilizador[]) => us.map((u) => u.id);

describe("dados de exemplo", () => {
  it("têm 12 utilizadores, a lista completa de permissões e as roles pedidas", () => {
    expect(U).toHaveLength(12);
    expect(PERMISSOES.length).toBeGreaterThan(200);
    expect(roles.map((r) => r.codigo)).toEqual(
      expect.arrayContaining(["super_admin", "org_admin", "comercial", "gestor_utilizadores", "operacoes", "leitura", "parceiro_externo"]),
    );
    expect(U.some((u) => u.vinculos.length === 3)).toBe(true);
    expect(U.some((u) => !u.ativo)).toBe(true);
  });

  it("os vínculos são com organizações da plataforma, cada um numa organização distinta, e sem conceitos de RH", () => {
    const ids = new Set(ORGANIZACOES_EXEMPLO.map((o) => o.id));
    U.forEach((u) => {
      const orgs = u.vinculos.map((v) => v.organizacaoId);
      expect(orgs.every((o) => ids.has(o))).toBe(true);
      expect(new Set(orgs).size).toBe(orgs.length);
    });
    expect(ORGANIZACOES_EXEMPLO.map((o) => o.nome).join(" ")).not.toMatch(/mudelar/i);
    expect(roles.map((r) => r.codigo)).not.toContain("rh");
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
    expect(idsDe(filtrarUtilizadores(U, filtros({ roleId: "r-gestor" })))).toEqual(["u-05", "u-11"]);
    expect(idsDe(filtrarUtilizadores(U, filtros({ roleId: "r-comercial", organizacaoId: "o-remodelacoes" })))).toEqual(["u-02", "u-08"]);
    expect(filtrarUtilizadores(U, filtros({ roleId: "r-gestor", organizacaoId: "o-climatizacao" }))).toEqual([]);
  });

  it("não perde um utilizador sem vínculos quando não há filtro de role nem de organização", () => {
    const sem: Utilizador = { ...utilizador("u-03"), vinculos: [] };
    expect(filtrarUtilizadores([sem], filtros({}))).toHaveLength(1);
    expect(filtrarUtilizadores([sem], filtros({ roleId: "r-gestor" }))).toHaveLength(0);
  });

  it("haFiltros distingue o estado inicial", () => {
    expect(haFiltros(FILTROS_INICIAIS)).toBe(false);
    expect(haFiltros({ ...FILTROS_INICIAIS, estado: "todos" })).toBe(true);
    expect(haFiltros({ ...FILTROS_INICIAIS, texto: "  " })).toBe(false);
  });
});

describe("utilizadores por role", () => {
  it("conta cada utilizador uma vez, mesmo com a role em duas organizações", () => {
    const duas: Utilizador = { ...utilizador("u-01") }; // super_admin em duas organizações
    expect(utilizadoresDaRole([duas], "r-super")).toHaveLength(1);
  });

  it("conta todas as roles, incluindo as sem ninguém", () => {
    const sem = contarUtilizadoresPorRole([], roles);
    expect(Object.keys(sem)).toHaveLength(roles.length);
    expect(Object.values(sem).every((n) => n === 0)).toBe(true);
    const n = contarUtilizadoresPorRole(U, roles);
    expect(n["r-super"]).toBe(1);
    expect(n["r-gestor"]).toBe(2);
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
    expect(rui.find((e) => e.permissao.codigo === "clients.export_sensitive")).toBeUndefined();
  });

  it("ignoram vínculos inativos e roles desconhecidas", () => {
    expect(permissoesEfetivas(utilizador("u-08"), roles)).toEqual([]);
    const fantasma: Utilizador = { ...utilizador("u-03"), vinculos: [{ organizacaoId: "o-x", roleId: "r-nada", ativo: true, ambitos: {} }] };
    expect(permissoesEfetivas(fantasma, roles)).toEqual([]);
  });

  it("com a lista completa: o super administrador tem todas, o administrador da organização todas menos as perigosas", () => {
    expect(permissoesEfetivas(utilizador("u-01"), roles)).toHaveLength(PERMISSOES.length);
    const rui = permissoesEfetivas({ ...utilizador("u-02"), vinculos: [utilizador("u-02").vinculos[0]] }, roles);
    expect(rui).toHaveLength(PERMISSOES.filter((p) => !p.perigosa).length);
    expect(rui.some((e) => e.permissao.perigosa)).toBe(false);
  });

  it("com a lista completa: quem só tem uma role tem exatamente as permissões dela, e juntar roles não repete permissões", () => {
    const carla = permissoesEfetivas(utilizador("u-07"), roles);
    const leitura = roles.find((r) => r.id === "r-leitura")!;
    expect(carla.map((e) => e.permissao.codigo).sort()).toEqual([...leitura.permissoes].sort());
    const rui = permissoesEfetivas(utilizador("u-02"), roles).map((e) => e.permissao.codigo);
    expect(new Set(rui).size).toBe(rui.length);
    expect(rui.length).toBeGreaterThan(carla.length);
  });
});

describe("âmbito", () => {
  it("é o mais largo entre os vínculos ativos que dão a permissão", () => {
    expect(ambitoDe(utilizador("u-02"), roles, "clients.view")).toBe("ORG");
    expect(ambitoDe(utilizador("u-03"), roles, "clients.view")).toBe("TEAM");
    expect(ambitoDe(utilizador("u-03"), roles, "users.view")).toBe("NONE");
  });

  it("resume o utilizador pelo âmbito mais largo; sem permissões com âmbito, nenhum", () => {
    expect(resumoAmbito(utilizador("u-01"), roles)).toBe("ORG");
    expect(resumoAmbito(utilizador("u-04"), roles)).toBe("OWNED");
    expect(resumoAmbito(utilizador("u-08"), roles)).toBe("NONE");
  });

  it("o que não está definido no vínculo é só os próprios", () => {
    const u: Utilizador = { ...utilizador("u-04"), vinculos: [{ organizacaoId: "o-grupo", roleId: "r-comercial", ativo: true, ambitos: {} }] };
    expect(ambitoDe(u, roles, "deals.view")).toBe("OWNED");
  });
});

describe("aplicarEscolhas e diasDesde", () => {
  it("troca a role de uma organização sem alterar o original", () => {
    const original = utilizador("u-02");
    const novo = aplicarEscolhas(original, { "o-remodelacoes": "r-gestor" });
    expect(novo.vinculos.find((v) => v.organizacaoId === "o-remodelacoes")!.roleId).toBe("r-gestor");
    expect(original.vinculos.find((v) => v.organizacaoId === "o-remodelacoes")!.roleId).toBe("r-comercial");
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

describe("permissões por role (lista completa)", () => {
  const visiveis = permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO);

  it("um administrador de sistema vê todas; quem edita só vê as permissões que já tem", () => {
    expect(visiveis).toHaveLength(PERMISSOES.length);
    const dele = permissoesVisiveis(PERMISSOES, { administradorSistema: false, codigos: ["clients.view", "deals.edit", "nao.existe"] });
    expect(dele.map((p) => p.codigo)).toEqual(PERMISSOES.map((p) => p.codigo).filter((c) => c === "clients.view" || c === "deals.edit"));
    expect(permissoesVisiveis(PERMISSOES, { administradorSistema: false, codigos: [] })).toEqual([]);
  });

  it("conta por role as permissões que tem: super administrador todas, administrador da organização sem as perigosas", () => {
    const n = contarPermissoesPorRole(roles, visiveis);
    expect(n["r-super"]).toBe(PERMISSOES.length);
    expect(n["r-admin"]).toBe(PERMISSOES.filter((p) => !p.perigosa).length);
    expect(n["r-admin"]).toBeLessThan(n["r-super"]);
    expect(Object.keys(n)).toHaveLength(roles.length);
    roles.forEach((r) => expect(n[r.id]).toBe(r.permissoes.length));
  });

  it("as outras roles têm conjuntos plausíveis: não vazios, sem perigosas (salvo Operações) e mais pequenos que o do administrador", () => {
    const n = contarPermissoesPorRole(roles, visiveis);
    ["r-comercial", "r-gestor", "r-operacoes", "r-leitura", "r-parceiro"].forEach((id) => {
      expect(n[id]).toBeGreaterThan(0);
      expect(n[id]).toBeLessThan(n["r-admin"]);
    });
    const perigosas = (id: string) => roles.find((r) => r.id === id)!.permissoes.filter((c) => PERMISSOES.find((p) => p.codigo === c)!.perigosa);
    expect(perigosas("r-comercial")).toEqual([]);
    expect(perigosas("r-leitura")).toEqual([]);
    expect(perigosas("r-gestor")).toEqual([]);
  });

  it("só conta os códigos que existem no catálogo e não conta nada quando nada é visível", () => {
    const estranha = { ...roles[2], id: "r-x", permissoes: ["clients.view", "nao.existe"] };
    expect(contarPermissoesPorRole([estranha], visiveis)["r-x"]).toBe(1);
    expect(contarPermissoesPorRole(roles, [])["r-super"]).toBe(0);
    expect(contarPermissoesPorRole([], visiveis)).toEqual({});
  });
});
