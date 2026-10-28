// A edição da matriz de permissões, as regras de atribuição e o âmbito por vínculo.
import { describe, expect, it } from "vitest";
import { EDITOR_EXEMPLO, PERMISSOES, ROLES_EXEMPLO } from "./catalogoExemplo";
import {
  alternarPermissao, contarConcedidas, definirModulo, fundirPermissoes, moduloDe, perigosasNovas, podeAlterar,
} from "./matriz";
import { aplicarOrigem, ROLE_EM_BRANCO, valoresIniciaisRole } from "./modelosRole";
import {
  ajustarAmbito, haOrganizacaoLivre, organizacoesLivres, permissoesComAmbito, podeAtribuirRole, rolesOferecidas,
} from "./regrasVinculos";
import { ORGANIZACOES_EXEMPLO } from "./catalogoExemplo";
import type { Permissao } from "./tipos";

const p = (codigo: string, perigosa = false, comAmbito = true): Permissao =>
  ({ codigo, categoria: moduloDe(codigo), nome: codigo, fonte: "migration", perigosa, comAmbito });
const CATALOGO = [p("leads.view"), p("leads.create"), p("leads.edit"), p("leads.delete", true), p("clients.view"), p("clients.edit")];

describe("matriz: alternar uma permissão", () => {
  it("concede e tira, sem alterar a lista original", () => {
    const inicial = ["leads.view"];
    const com = alternarPermissao(inicial, "leads.create", CATALOGO);
    expect(com).toEqual(["leads.view", "leads.create"]);
    expect(inicial).toEqual(["leads.view"]);
    expect(alternarPermissao(com, "leads.create", CATALOGO)).toEqual(["leads.view"]);
  });

  it("uma permissão que não é de ver está bloqueada enquanto a de ver do módulo não estiver concedida", () => {
    expect(podeAlterar("leads.edit", [], CATALOGO)).toBe(false);
    expect(alternarPermissao([], "leads.edit", CATALOGO)).toEqual([]);
    expect(podeAlterar("leads.edit", ["leads.view"], CATALOGO)).toBe(true);
    expect(podeAlterar("leads.view", [], CATALOGO)).toBe(true);
  });

  it("tirar 'ver' tira as outras do mesmo módulo e só essas", () => {
    const tudo = ["leads.view", "leads.create", "leads.edit", "clients.view", "clients.edit"];
    expect(alternarPermissao(tudo, "leads.view", CATALOGO)).toEqual(["clients.view", "clients.edit"]);
  });

  it("sem permissão de ver no catálogo (módulo sem 'ver'), nada fica bloqueado", () => {
    expect(podeAlterar("x.edit", [], [p("x.edit")])).toBe(true);
  });
});

describe("matriz: módulo, contagens e perigosas", () => {
  const modulo = CATALOGO.filter((c) => c.codigo.startsWith("leads."));

  it("marcar tudo acrescenta o módulo sem repetir nem tocar nas restantes; limpar tira só o módulo", () => {
    const marcado = definirModulo(["clients.view", "leads.view"], modulo, true);
    expect(new Set(marcado)).toEqual(new Set(["clients.view", ...modulo.map((m) => m.codigo)]));
    expect(marcado.length).toBe(new Set(marcado).size);
    expect(definirModulo(marcado, modulo, false)).toEqual(["clients.view"]);
  });

  it("conta as concedidas de uma lista, ignorando códigos fora dela", () => {
    expect(contarConcedidas(["leads.view", "leads.edit", "outra.coisa"], modulo)).toBe(2);
    expect(contarConcedidas([], CATALOGO)).toBe(0);
  });

  it("as perigosas novas são só as que ainda não estão concedidas", () => {
    expect(perigosasNovas([], modulo).map((x) => x.codigo)).toEqual(["leads.delete"]);
    expect(perigosasNovas(["leads.delete"], modulo)).toEqual([]);
    expect(perigosasNovas([], [p("leads.view")])).toEqual([]);
  });

  it("funciona com o catálogo completo: 229 permissões, e marcar tudo concede-as todas", () => {
    expect(PERMISSOES.length).toBe(229);
    expect(contarConcedidas(definirModulo([], PERMISSOES, true), PERMISSOES)).toBe(229);
  });
});

describe("matriz: o que se guarda quando quem edita não vê tudo", () => {
  it("mantém o que a role tinha e o editor não vê, e aplica só as edições do que ele vê", () => {
    const visiveis = CATALOGO.slice(0, 3);
    const guardado = fundirPermissoes(["leads.view", "clients.view"], ["leads.view", "leads.create", "clients.edit"], visiveis);
    expect(new Set(guardado)).toEqual(new Set(["clients.view", "leads.view", "leads.create"]));
  });

  it("um editor que vê tudo guarda exatamente o que editou", () => {
    expect(fundirPermissoes(["a.view"], ["b.view"], [p("a.view"), p("b.view")])).toEqual(["b.view"]);
  });
});

describe("regras de atribuição", () => {
  const editorLimitado = { administradorSistema: false, codigos: ["leads.view", "leads.edit"] };

  it("podeAtribuirRole: só se todas as permissões da role já se têm; o administrador de sistema passa sempre", () => {
    expect(podeAtribuirRole({ permissoes: ["leads.view"] }, editorLimitado)).toBe(true);
    expect(podeAtribuirRole({ permissoes: ["leads.view", "leads.delete"] }, editorLimitado)).toBe(false);
    expect(podeAtribuirRole({ permissoes: [] }, editorLimitado)).toBe(true);
    expect(podeAtribuirRole({ permissoes: ["qualquer.coisa"] }, EDITOR_EXEMPLO)).toBe(true);
  });

  it("rolesOferecidas nunca inclui a de super administrador e respeita o subconjunto", () => {
    expect(rolesOferecidas(ROLES_EXEMPLO, EDITOR_EXEMPLO).map((r) => r.codigo)).not.toContain("super_admin");
    expect(rolesOferecidas(ROLES_EXEMPLO, EDITOR_EXEMPLO)).toHaveLength(ROLES_EXEMPLO.length - 1);
    expect(rolesOferecidas(ROLES_EXEMPLO, { administradorSistema: false, codigos: [] }).map((r) => r.id)).toEqual([]);
  });

  it("organizações livres: não repete as dos outros vínculos mas deixa a da própria linha", () => {
    const vinculos = [{ organizacaoId: "o-grupo" }, { organizacaoId: "o-remodelacoes" }];
    expect(organizacoesLivres(ORGANIZACOES_EXEMPLO, vinculos, 0).map((o) => o.id)).toEqual(["o-grupo", "o-climatizacao"]);
    expect(organizacoesLivres(ORGANIZACOES_EXEMPLO, [{ organizacaoId: "" }], 0)).toHaveLength(3);
    expect(haOrganizacaoLivre(ORGANIZACOES_EXEMPLO, vinculos)).toBe(true);
    expect(haOrganizacaoLivre(ORGANIZACOES_EXEMPLO, ORGANIZACOES_EXEMPLO.map((o) => ({ organizacaoId: o.id })))).toBe(false);
  });
});

describe("âmbito por vínculo", () => {
  it("só mostra as permissões com âmbito que a role dá", () => {
    const comercial = ROLES_EXEMPLO.find((r) => r.id === "r-comercial");
    const lista = permissoesComAmbito(comercial, PERMISSOES);
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((x) => x.comAmbito && comercial?.permissoes.includes(x.codigo))).toBe(true);
    expect(permissoesComAmbito(undefined, PERMISSOES)).toEqual([]);
  });

  it("subir uma permissão sobe a de ver do módulo até esse nível", () => {
    expect(ajustarAmbito({}, "leads.edit", "ORG", CATALOGO)).toEqual({ "leads.edit": "ORG", "leads.view": "ORG" });
    expect(ajustarAmbito({ "leads.view": "ORG" }, "leads.edit", "TEAM", CATALOGO)).toEqual({ "leads.view": "ORG", "leads.edit": "TEAM" });
  });

  it("baixar a de ver limita as outras do módulo e não mexe noutros módulos", () => {
    const antes = { "leads.view": "ORG", "leads.edit": "ORG", "leads.create": "TEAM", "clients.view": "ORG" } as const;
    expect(ajustarAmbito(antes, "leads.view", "OWNED", CATALOGO)).toEqual({
      "leads.view": "OWNED", "leads.edit": "OWNED", "leads.create": "OWNED", "clients.view": "ORG",
    });
  });

  it("não altera o objeto original", () => {
    const antes = { "leads.view": "ORG" } as const;
    ajustarAmbito(antes, "leads.view", "NONE", CATALOGO);
    expect(antes).toEqual({ "leads.view": "ORG" });
  });
});

describe("modelos de role", () => {
  it("abre em branco ao criar, com os dados ao editar e com '(cópia)' ao duplicar", () => {
    const comercial = ROLES_EXEMPLO.find((r) => r.id === "r-comercial");
    expect(valoresIniciaisRole("criar", comercial, "(cópia)")).toEqual(ROLE_EM_BRANCO);
    expect(valoresIniciaisRole("editar", comercial, "(cópia)")).toMatchObject({ nome: "Comercial", codigo: "comercial" });
    const copia = valoresIniciaisRole("duplicar", comercial, "(cópia)");
    expect(copia).toMatchObject({ nome: "Comercial (cópia)", codigo: "comercial_copia", permissoes: comercial?.permissoes });
    expect(copia.permissoes).not.toBe(comercial?.permissoes);
  });

  it("aplicar um modelo leva descrição e permissões, e só dá nome se estiver vazio", () => {
    const modelo = { id: "m", nome: "Gestor de vendas", descricao: "Trabalha leads.", permissoes: ["leads.view", "leads.edit"] };
    expect(aplicarOrigem(ROLE_EM_BRANCO, modelo).nome).toBe(modelo.nome);
    expect(aplicarOrigem({ ...ROLE_EM_BRANCO, nome: "O meu" }, modelo)).toMatchObject({ nome: "O meu", permissoes: modelo.permissoes });
    expect(aplicarOrigem(ROLE_EM_BRANCO, null)).toEqual(ROLE_EM_BRANCO);
    expect(modelo.permissoes.length).toBeGreaterThan(0);
  });
});
