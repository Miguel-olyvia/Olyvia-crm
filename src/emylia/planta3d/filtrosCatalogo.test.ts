// Filtros do passo «Escolher produtos»: lógica pura (facetas com contagem, filtros combinados, «parecidos», estado vazio), sem DOM.
import { describe, expect, it } from "vitest";
import { catalogo0, type No, type Produto } from "../v2/catalogoModelo";
import {
  MAX_SELECAO, aplicarFiltros, chipsDe, comParecidos, contarFiltrosAtivos, facetasDe, filtrosIniciais, idsEmFamilias, indexarCatalogo, nomeBase, semChip,
  type ContextoFiltros, type FiltrosCatalogo,
} from "./filtrosCatalogo";
import { criarFamiliaVazia, type FamiliaCfg } from "./configurador";

const ARVORE: No[] = [
  { id: "o1", n: "Canalização", pai: null }, { id: "n1", n: "Louças e torneiras", pai: "o1" }, { id: "n2", n: "Lava-loiças", pai: "o1" },
  { id: "o2", n: "Carpintaria", pai: null }, { id: "n3", n: "Móveis", pai: "o2" },
];
const prod = (id: string, n: string, marca: string, no: string | null, extra: Partial<Produto> = {}): Produto => ({ id, n, custo: 50, un: "un", marca, fornecedor: "F", data: "2026-10-01", no, sku: `REF-${id}`, pvp: 100, ...extra });
const PRODUTOS: Produto[] = [
  prod("a1", "Lava-loiça Lody 40 - Cobre", "FRASA", "n2"),
  prod("a2", "Lava-loiça Lody 50 - Gold", "FRASA", "n2"),
  prod("a3", "Lava-loiça Velar 1 CUBA 70", "Blanco", "n2", { sub: "Cubas inox" }),
  prod("b1", "Misturadora Rodi X", "Rodi", "n1"),
  prod("b2", "Misturadora Rodi Y", "rodi", "n1", { custo: 0, pvp: undefined }),
  prod("c1", "Móvel de lavatório 80", "Roca", "n3"),
  prod("d1", "Peça solta", "", null),
];
const SEM: ContextoFiltros = { ocupados: new Set(), escolhidos: new Set() };
const indice = () => indexarCatalogo(PRODUTOS, ARVORE);
const com = (p: Partial<FiltrosCatalogo>): FiltrosCatalogo => ({ ...filtrosIniciais(), ...p });
const ids = (f: FiltrosCatalogo, ctx = SEM) => aplicarFiltros(indice(), f, ctx).map((x) => x.p.id);
const contagens = (l: { valor: string; n: number }[]) => Object.fromEntries(l.map((x) => [x.valor, x.n]));

describe("filtrosCatalogo: estado inicial e índice", () => {
  it("sem filtros devolve todos os produtos, pela ordem do catálogo", () => {
    expect(ids(filtrosIniciais())).toEqual(PRODUTOS.map((p) => p.id));
    expect(contarFiltrosAtivos(filtrosIniciais())).toBe(0);
    expect(chipsDe(indice(), filtrosIniciais())).toEqual([]);
  });
  it("o estado inicial é novo de cada vez (nada partilhado)", () => {
    expect(filtrosIniciais()).not.toBe(filtrosIniciais());
    expect(filtrosIniciais().marcas).not.toBe(filtrosIniciais().marcas);
  });
  it("catálogo vazio não rebenta", () => {
    const v = indexarCatalogo([], []);
    expect(aplicarFiltros(v, filtrosIniciais(), SEM)).toEqual([]);
    expect(facetasDe(v, filtrosIniciais(), SEM)).toEqual({ marcas: [], categorias: [] });
  });
});

describe("filtrosCatalogo: pesquisa e filtros combinados (E)", () => {
  it("a pesquisa vê nome, marca, referência, subtipo e categoria, sem acentos nem maiúsculas", () => {
    expect(ids(com({ q: "LODY" }))).toEqual(["a1", "a2"]);
    expect(ids(com({ q: "blanco" }))).toEqual(["a3"]);
    expect(ids(com({ q: "ref-c1" }))).toEqual(["c1"]);
    expect(ids(com({ q: "cubas inox" }))).toEqual(["a3"]);
    expect(ids(com({ q: "moveis" }))).toEqual(["c1"]);
    expect(ids(com({ q: "  lody   cobre " }))).toEqual(["a1"]);
  });
  it("marca + categoria + pesquisa combinam-se", () => {
    expect(ids(com({ marcas: ["frasa"] }))).toEqual(["a1", "a2"]);
    expect(ids(com({ marcas: ["frasa", "blanco"], categorias: ["n2"] }))).toEqual(["a1", "a2", "a3"]);
    expect(ids(com({ marcas: ["frasa", "blanco"], categorias: ["n2"], q: "gold" }))).toEqual(["a2"]);
    expect(ids(com({ marcas: ["roca"], categorias: ["n2"] }))).toEqual([]);
  });
  it("a marca ignora maiúsculas («Rodi» e «rodi» são a mesma) e «sem marca» é um valor", () => {
    expect(ids(com({ marcas: ["rodi"] }))).toEqual(["b1", "b2"]);
    expect(ids(com({ marcas: [""] }))).toEqual(["d1"]);
  });
  it("sem categoria agrupa os que não têm nó (ou o nó não existe na árvore)", () => {
    const i = indexarCatalogo([...PRODUTOS, prod("z1", "Órfão", "X", "nao-existe")], ARVORE);
    expect(aplicarFiltros(i, com({ categorias: [""] }), SEM).map((x) => x.p.id)).toEqual(["d1", "z1"]);
  });
  it("«só com preço de venda» tira os que não têm PVP nem custo", () => {
    expect(ids(com({ soComPreco: true }))).not.toContain("b2");
    expect(ids(com({ soComPreco: true })).length).toBe(PRODUTOS.length - 1);
  });
  it("«ainda sem família» tira os que já estão noutra família; «só os escolhidos» deixa só os escolhidos", () => {
    const ctx: ContextoFiltros = { ocupados: new Set(["a1", "b1"]), escolhidos: new Set(["a2", "a1"]) };
    expect(ids(com({ semFamilia: true }), ctx)).not.toContain("a1");
    expect(ids(com({ semFamilia: true }), ctx)).not.toContain("b1");
    expect(ids(com({ soEscolhidos: true }), ctx)).toEqual(["a1", "a2"]);
    expect(ids(com({ soEscolhidos: true, semFamilia: true }), ctx)).toEqual(["a2"]);
  });
});

describe("filtrosCatalogo: facetas com contagem", () => {
  it("sem filtros: contagem por marca e por categoria, ordenadas por contagem e depois por nome", () => {
    const f = facetasDe(indice(), filtrosIniciais(), SEM);
    expect(f.marcas.map((x) => [x.rotulo, x.n])).toEqual([["FRASA", 2], ["Rodi", 2], ["Blanco", 1], ["Roca", 1], ["Sem marca", 1]]);
    expect(f.categorias.map((x) => [x.rotulo, x.n])).toEqual([["Canalização › Lava-loiças", 3], ["Canalização › Louças e torneiras", 2], ["Carpintaria › Móveis", 1], ["Sem categoria", 1]]);
  });
  it("as contagens de uma faceta respeitam os OUTROS filtros, não o dela própria", () => {
    const f = facetasDe(indice(), com({ categorias: ["n2"] }), SEM);
    expect(contagens(f.marcas)).toEqual({ frasa: 2, blanco: 1 });
    expect(contagens(f.categorias)).toMatchObject({ n2: 3, n1: 2, n3: 1 });
  });
  it("marca + pesquisa actualizam as contagens de categoria", () => {
    const f = facetasDe(indice(), com({ marcas: ["frasa"], q: "cobre" }), SEM);
    expect(contagens(f.categorias)).toEqual({ n2: 1 });
    expect(contagens(f.marcas)).toEqual({ frasa: 1 });
  });
  it("só com preço e ainda sem família actualizam as contagens", () => {
    const f = facetasDe(indice(), com({ soComPreco: true, semFamilia: true }), { ocupados: new Set(["b1"]), escolhidos: new Set() });
    expect(contagens(f.marcas).rodi).toBeUndefined();
    expect(contagens(f.categorias).n1).toBeUndefined();
  });
  it("um valor marcado fica na lista mesmo com contagem 0, para se poder desmarcar", () => {
    const f = facetasDe(indice(), com({ marcas: ["roca"], categorias: ["n2"] }), SEM);
    expect(f.marcas.find((x) => x.valor === "roca")).toMatchObject({ n: 0, marcada: true });
  });
});

describe("filtrosCatalogo: chips dos filtros ativos", () => {
  it("há um chip por filtro ativo, com o grupo e o valor em texto, e cada um remove-se sozinho", () => {
    const f = com({ q: "lody", marcas: ["frasa"], categorias: ["n2"], soComPreco: true, semFamilia: true, soEscolhidos: true });
    const chips = chipsDe(indice(), f);
    expect(chips.map((c) => c.texto)).toEqual(["Pesquisa: lody", "Marca: FRASA", "Categoria: Canalização › Lava-loiças", "Só com preço de venda", "Ainda sem família", "Só os escolhidos"]);
    expect(contarFiltrosAtivos(f)).toBe(6);
    for (const c of chips) expect(contarFiltrosAtivos(semChip(f, c.id))).toBe(5);
    expect(semChip(f, "marca:frasa").marcas).toEqual([]);
    expect(semChip(f, "marca:frasa").categorias).toEqual(["n2"]);
    expect(f.marcas).toEqual(["frasa"]);
  });
  it("uma pesquisa só de espaços não conta como filtro", () => { expect(contarFiltrosAtivos(com({ q: "   " }))).toBe(0); });
});

describe("filtrosCatalogo: «ver parecidos» e famílias da sessão", () => {
  it("o nome-base tira a medida, as dimensões, as cubas e o acabamento do fim", () => {
    expect(nomeBase("Lava-loiça Lody 40 - Cobre")).toBe("Lava-loiça Lody");
    expect(nomeBase("Lava-louças VELAR 1 CUBA 34")).toBe("Lava-louças VELAR");
    expect(nomeBase("Móvel 60x45x80 cm Carvalho")).toBe("Móvel Carvalho");
    expect(nomeBase("86CM")).toBe("86CM");
    expect(nomeBase("   ")).toBe("");
  });
  it("«parecidos» limpa os outros filtros e pesquisa pelo nome-base: apanha a família toda", () => {
    expect(comParecidos("Lava-loiça Lody 40 - Cobre")).toEqual({ ...filtrosIniciais(), q: "Lava-loiça Lody" });
    expect(ids(comParecidos("Lava-loiça Lody 40 - Cobre"))).toEqual(["a1", "a2"]);
  });
  it("os produtos já noutras famílias da sessão (menos a que se edita)", () => {
    const fam = (id: string, pids: string[]): FamiliaCfg => ({ ...criarFamiliaVazia(), id, celulas: Object.fromEntries(pids.map((p, i) => [`m${i}|a1`, { ativo: true, produtoId: p }])) });
    const lista = [fam("x", ["a1", "a2"]), fam("y", ["b1"])];
    expect([...idsEmFamilias(lista)].sort()).toEqual(["a1", "a2", "b1"]);
    expect([...idsEmFamilias(lista, "x")]).toEqual(["b1"]);
    expect(idsEmFamilias([]).size).toBe(0);
  });
});

describe("filtrosCatalogo: catálogo de exemplo real", () => {
  const c = catalogo0();
  it("a forma dos campos: marca em texto, categoria no nó da árvore (ofício › sub)", () => {
    expect(c.produtos).toHaveLength(2167);
    expect(c.produtos.every((p) => typeof p.marca === "string" && (p.no === null || typeof p.no === "string"))).toBe(true);
    const f = facetasDe(indexarCatalogo(c.produtos, c.arvore), filtrosIniciais(), SEM);
    expect(f.marcas.length).toBeGreaterThan(12);
    expect(f.marcas.reduce((s, x) => s + x.n, 0)).toBe(2167);
    expect(f.categorias.reduce((s, x) => s + x.n, 0)).toBe(2167);
    expect(f.categorias.some((x) => x.rotulo.includes(" › "))).toBe(true);
  });
  it("filtrar 2167 produtos com facetas fica abaixo de 50 ms (jsdom)", () => {
    const i = indexarCatalogo(c.produtos, c.arvore);
    const f = com({ q: "lava", marcas: [facetasDe(i, filtrosIniciais(), SEM).marcas[0].valor], soComPreco: true });
    aplicarFiltros(i, f, SEM); facetasDe(i, f, SEM);
    const t0 = performance.now();
    aplicarFiltros(i, f, SEM); facetasDe(i, f, SEM);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it("o limite de seleção em massa é 200", () => { expect(MAX_SELECAO).toBe(200); });
});
