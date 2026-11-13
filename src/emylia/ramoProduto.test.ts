// 13/11: a categoria e a subcategoria de um produto, sobre a árvore do Catálogo (dois níveis: categoria → subcategorias).
import { describe, expect, it } from "vitest";
import type { No } from "./v2/catalogoModelo";
import { categoriasDe, nomesDoRamo, ramoDe, ramoParaCriar, subcategoriasDe } from "./ramoProduto";

const A: No[] = [
  { id: "c1", n: "Casa de banho", pai: null },
  { id: "s1", n: "Louças", pai: "c1" },
  { id: "s2", n: "Torneiras", pai: "c1" },
  { id: "c2", n: "Cozinha", pai: null, soProduto: true },
];

describe("ramoProduto: ler", () => {
  it("as categorias são os nós de topo; as subcategorias, os filhos da categoria", () => {
    expect(categoriasDe(A).map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(subcategoriasDe(A, "c1").map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(subcategoriasDe(A, "c2")).toEqual([]);
    expect(subcategoriasDe(A, "")).toEqual([]);
  });

  it("o ramo de um produto: categoria e subcategoria a partir do nó onde fica", () => {
    expect(ramoDe(A, "s2")).toEqual({ cat: "c1", sub: "s2" });
    expect(ramoDe(A, "c2")).toEqual({ cat: "c2", sub: "" });
    expect(ramoDe(A, null)).toEqual({ cat: "", sub: "" });
    expect(ramoDe(A, "fantasma")).toEqual({ cat: "", sub: "" });
  });

  it("os nomes do ramo (é o que a base grava)", () => {
    expect(nomesDoRamo(A, "s1")).toEqual({ categoria: "Casa de banho", subcategoria: "Louças" });
    expect(nomesDoRamo(A, "c2")).toEqual({ categoria: "Cozinha", subcategoria: null });
    expect(nomesDoRamo(A, null)).toEqual({ categoria: null, subcategoria: null });
  });
});

describe("ramoParaCriar: categoria e subcategoria novas, só quando o produto se cria", () => {
  it("só existentes: não mexe na árvore e devolve o nó mais fundo", () => {
    const r = ramoParaCriar(A, { cat: "c1", sub: "s2", catNova: null, subNova: null });
    expect(r).toEqual({ ok: true, A, no: "s2" });
    expect(ramoParaCriar(A, { cat: "c1", sub: "", catNova: null, subNova: null })).toMatchObject({ ok: true, no: "c1" });
    expect(ramoParaCriar(A, { cat: "", sub: "", catNova: null, subNova: null })).toMatchObject({ ok: true, no: null });
  });

  it("subcategoria nova numa categoria existente: nasce só de produto, debaixo dessa categoria", () => {
    const r = ramoParaCriar(A, { cat: "c1", sub: "", catNova: null, subNova: "Acessórios" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nova = r.A.find((x) => x.n === "Acessórios")!;
    expect(nova).toMatchObject({ pai: "c1", soProduto: true });
    expect(r.no).toBe(nova.id);
    expect(A).toHaveLength(4); // a árvore de partida não muda
  });

  it("categoria nova e subcategoria nova: as duas, a segunda dentro da primeira", () => {
    const r = ramoParaCriar(A, { cat: "", sub: "", catNova: "Jardim", subNova: "Rega" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.A.find((x) => x.n === "Jardim")!, s = r.A.find((x) => x.n === "Rega")!;
    expect(c).toMatchObject({ pai: null, soProduto: true });
    expect(s).toMatchObject({ pai: c.id, soProduto: true });
    expect(r.no).toBe(s.id);
  });

  it("categoria nova sem subcategoria: o nó é a categoria", () => {
    const r = ramoParaCriar(A, { cat: "", sub: "", catNova: "Jardim", subNova: null });
    expect(r.ok && r.A.find((x) => x.n === "Jardim")?.id === r.no).toBe(true);
  });

  it("um nome novo que já existe (sem acentos nem maiúsculas) reaproveita o existente em vez de duplicar", () => {
    const r = ramoParaCriar(A, { cat: "", sub: "", catNova: "casa de BANHO", subNova: "loucas" });
    expect(r).toMatchObject({ ok: true, no: "s1" });
    if (r.ok) expect(r.A).toHaveLength(4);
  });

  it("nome novo só com espaços não conta", () => {
    expect(ramoParaCriar(A, { cat: "c1", sub: "", catNova: null, subNova: "   " })).toMatchObject({ ok: true, no: "c1" });
  });
});
