// A escolha de produtos do configurador de famílias: objetos Produto (não ids), com o teto MAX_SELECAO.
import { describe, expect, it } from "vitest";
import { MAX_SELECAO, alternarEscolha, juntarEscolha, produtoDaLinha, temPreco } from "./selecao";
import { linha, produto } from "./fixturesFamilias";

const muitos = (n: number) => Array.from({ length: n }, (_, i) => produto(`p${i}`, `Produto ${i}`));

describe("produtoDaLinha", () => {
  it("converte uma linha da página num Produto com o que o configurador lê", () => {
    const p = produtoDaLinha(linha("a", "Lava-loiça 50", { sku: "CB-1", pvp: 150, custo: 80, marca: "Cunha" }));
    expect(p).toMatchObject({ id: "a", n: "Lava-loiça 50", sku: "CB-1", pvp: 150, custo: 80, marca: "Cunha", no: "s1", sub: "Lava-loiças" });
  });
  it("sem PVP, sem SKU e sem custo: não inventa valores", () => {
    const p = produtoDaLinha(linha("b", "Sem nada", { sku: null, pvp: null, custo: null, marca: null, subcategoria: null, subcategoria_id: null, categoria_id: null }));
    expect(p.pvp).toBeUndefined();
    expect(p.sku).toBeUndefined();
    expect(p.custo).toBe(0);
    expect(p.marca).toBe("");
    expect(p.no).toBeNull();
  });
  it("o nó é a subcategoria; sem ela, a categoria", () => {
    expect(produtoDaLinha(linha("c", "x", { subcategoria_id: null })).no).toBe("c1");
  });
});

describe("temPreco (a legenda «só com preço» filtra no cliente)", () => {
  it("PVP, ou custo (preço calculado), contam; sem nenhum dos dois não", () => {
    expect(temPreco(produto("a", "a", { pvp: 10, custo: 0 }))).toBe(true);
    expect(temPreco(produto("b", "b", { pvp: undefined, custo: 40 }))).toBe(true);
    expect(temPreco(produto("c", "c", { pvp: undefined, custo: 0 }))).toBe(false);
  });
});

describe("alternarEscolha", () => {
  it("junta um produto novo e tira um que já lá está, sem mutar a lista", () => {
    const base = [produto("a", "A")];
    const com = alternarEscolha(base, produto("b", "B"));
    expect(com.lista.map((p) => p.id)).toEqual(["a", "b"]);
    expect(base).toHaveLength(1);
    expect(alternarEscolha(com.lista, produto("a", "A")).lista.map((p) => p.id)).toEqual(["b"]);
  });
  it("no teto não junta mais, diz que está cheio, mas deixa sempre tirar", () => {
    const cheia = muitos(MAX_SELECAO);
    const r = alternarEscolha(cheia, produto("novo", "Novo"));
    expect(r.cheio).toBe(true);
    expect(r.lista).toHaveLength(MAX_SELECAO);
    expect(alternarEscolha(cheia, cheia[0]).lista).toHaveLength(MAX_SELECAO - 1);
  });
});

describe("juntarEscolha («Selecionar os desta página» respeita o teto)", () => {
  it("junta os que faltam, sem repetir, pela ordem", () => {
    const r = juntarEscolha([produto("a", "A")], [produto("a", "A"), produto("b", "B"), produto("c", "C")]);
    expect(r.lista.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(r.cortados).toBe(0);
  });
  it("corta no teto e diz quantos ficaram de fora", () => {
    const r = juntarEscolha(muitos(MAX_SELECAO - 2), muitos(MAX_SELECAO).slice(MAX_SELECAO - 2).concat([produto("x1", "X1"), produto("x2", "X2")]));
    expect(r.lista).toHaveLength(MAX_SELECAO);
    expect(r.cortados).toBe(2);
  });
  it("com 60 já escolhidos, nenhum novo cabe (o teto da escolha é de 60 produtos)", () => {
    const r = juntarEscolha(Array.from({ length: 60 }, (_, i) => produto("q" + i, "Q " + i)), [produto("novo", "Novo")]);
    expect(r.lista).toHaveLength(60);
    expect(r.cortados).toBe(1);
  });
});
