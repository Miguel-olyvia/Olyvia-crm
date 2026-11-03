import { describe, expect, it } from "vitest";
import { agruparPorMenu, type BlocoCategoria } from "./gruposPermissoes";
import { estadoConjunto, linhasDosBlocos, permissoesDaColuna, permissoesOutras, separarCodigo } from "./grelhaPermissoes";
import { definirConjunto, alternarPermissao } from "./matriz";
import { permissoesDoMenu } from "./rolesReais";
import { PERMISSOES_EM_USO } from "./permissoesEmUso";
import type { Permissao } from "./tipos";

const p = (codigo: string, nome = codigo, categoria = codigo.split(".")[0] ?? ""): Permissao =>
  ({ codigo, categoria, nome, perigosa: false, comAmbito: false });
const bloco = (categoria: string, rotulo: string, codigos: string[]): BlocoCategoria =>
  ({ categoria, rotulo, permissoes: codigos.map((c) => p(c)) });

describe("separarCodigo", () => {
  it("tira a ação do fim e reconhece as variantes", () => {
    expect(separarCodigo("leads.edit")).toEqual({ recurso: "leads", acao: "edit", variante: null });
    expect(separarCodigo("hr.pessoas.saude.view")).toEqual({ recurso: "hr.pessoas.saude", acao: "view", variante: null });
    expect(separarCodigo("hr.pessoas.view.own")).toEqual({ recurso: "hr.pessoas", acao: "view", variante: "own" });
    expect(separarCodigo("hr.ausencias.aprovar.chefia")).toEqual({ recurso: "hr.ausencias", acao: "aprovar", variante: "chefia" });
  });
});

describe("linhasDosBlocos", () => {
  it("um bloco de um só recurso dá uma linha com o rótulo do bloco, colunas fixas e o resto em Outras", () => {
    const [l] = linhasDosBlocos([bloco("negocios_visita", "Visita", ["negocios.visita.gerir"])]);
    expect(l.rotulo).toBe("Visita");
    expect(l.fixas).toEqual({});
    expect(l.outras.map((c) => c.rotulo)).toEqual(["Gerir"]);
  });

  it("um bloco que mistura recursos dá uma linha por recurso", () => {
    const linhas = linhasDosBlocos([bloco("negocios_pessoas", "Pessoas", [
      "leads.edit", "leads.convert", "clients.view", "clients.create", "clients.edit", "contacts.view",
    ])]);
    expect(linhas.map((l) => l.rotulo)).toEqual(["Leads", "Clientes", "Contactos"]);
    expect(linhas[0].fixas.editar?.codigo).toBe("leads.edit");
    expect(linhas[0].outras.map((c) => c.rotulo)).toEqual(["Converter"]);
    expect(Object.keys(linhas[1].fixas)).toEqual(["ver", "criar", "editar"]);
  });

  it(".own e outras variantes vão para Outras com a variante no rótulo; Ver fica o 'ver tudo'", () => {
    const [l] = linhasDosBlocos([bloco("hr_ausencias", "Ausências", [
      "hr.ausencias.view", "hr.ausencias.view.own", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh", "hr.ausencias.pedir.outros",
    ])]);
    expect(l.fixas.ver?.codigo).toBe("hr.ausencias.view");
    expect(l.outras.map((c) => c.rotulo)).toEqual(["Ver (só as suas)", "Aprovar (chefia)", "Aprovar (RH)", "Pedir (por outros)"]);
  });

  it("ação sem rótulo próprio ou rótulos repetidos usam o nome da base; edit e update na mesma linha: o segundo vai para Outras", () => {
    const b: BlocoCategoria = { categoria: "x", rotulo: "X", permissoes: [
      p("x.edit"), p("x.update", "Atualizar X"), p("x.view_costs", "Ver custos de X"),
    ] };
    const [l] = linhasDosBlocos([b]);
    expect(l.fixas.editar?.codigo).toBe("x.edit");
    expect(l.outras.map((c) => c.rotulo)).toEqual(["Editar", "Ver custos de X"]);
    const [d] = linhasDosBlocos([{ categoria: "y", rotulo: "Y", permissoes: [p("y.manage", "Gerir A"), p("y.gerir", "Gerir B")] }]);
    expect(d.outras.map((c) => c.rotulo)).toEqual(["Gerir A", "Gerir B"]);
  });

  it("com o catálogo em uso, nenhuma permissão se perde nem se repete na grelha", () => {
    const catalogo = permissoesDoMenu(Object.entries(PERMISSOES_EM_USO).flatMap(([category, codigos]) =>
      codigos.map((code) => ({ code, name: code, category, is_dangerous: false }))));
    const naGrelha = agruparPorMenu(catalogo).flatMap((g) => [
      ...linhasDosBlocos(g.blocos), ...g.subgrupos.flatMap((s) => linhasDosBlocos(s.blocos)),
    ]).flatMap((l) => [...Object.values(l.fixas), ...l.outras.map((c) => c.permissao)].map((x) => x?.codigo));
    const doMenu = agruparPorMenu(catalogo).flatMap((g) => g.permissoes.map((x) => x.codigo));
    expect([...naGrelha].sort()).toEqual([...doMenu].sort());
    expect(new Set(naGrelha).size).toBe(naGrelha.length);
  });

  it("colunas e estado de conjunto (indeterminado)", () => {
    const linhas = linhasDosBlocos([bloco("a", "A", ["a.view", "a.edit", "a.convert"]), bloco("b", "B", ["b.view"])]);
    expect(permissoesDaColuna(linhas, "ver").map((x) => x.codigo)).toEqual(["a.view", "b.view"]);
    expect(permissoesDaColuna(linhas, "eliminar")).toEqual([]);
    expect(permissoesOutras(linhas).map((x) => x.codigo)).toEqual(["a.convert"]);
    const ver = permissoesDaColuna(linhas, "ver");
    expect(estadoConjunto(ver, (c) => c === "a.view")).toBe("indeterminate");
    expect(estadoConjunto(ver, () => true)).toBe(true);
    expect(estadoConjunto(ver, () => false)).toBe(false);
  });
});

describe("definirConjunto (linha/coluna) com as regras de 'ver'", () => {
  const CAT = ["leads.view", "leads.create", "leads.edit", "clients.view", "clients.edit", "hr.pessoas.view", "hr.pessoas.edit"].map((c) => p(c));
  const de = (...c: string[]) => CAT.filter((x) => c.includes(x.codigo));

  it("marcar uma linha com o 'ver' do módulo concede tudo; uma coluna sem o 'ver' deixa as bloqueadas por marcar", () => {
    expect(definirConjunto([], de("leads.view", "leads.create", "leads.edit"), true, CAT)).toEqual(["leads.view", "leads.create", "leads.edit"]);
    expect(definirConjunto(["clients.view"], de("leads.edit", "clients.edit"), true, CAT)).toEqual(["clients.view", "clients.edit"]);
  });

  it("desmarcar a coluna Ver tira as dependentes do módulo; não toca nas outras", () => {
    expect(definirConjunto(["leads.view", "leads.edit", "clients.view"], de("leads.view"), false, CAT)).toEqual(["clients.view"]);
  });

  it("só o 'ver' DO MÓDULO arrasta as outras: hr.pessoas.view não é hr.view", () => {
    expect(alternarPermissao(["hr.pessoas.view", "hr.pessoas.edit"], "hr.pessoas.view", CAT)).toEqual(["hr.pessoas.edit"]);
  });
});
