// A ponte entre a escolha (Produto + atributos lidos) e o núcleo: itens, eixos por omissão, família derivada e problemas por passo.
import { describe, expect, it } from "vitest";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { bloqueiaPasso, categoriaDoNo, derivarFamilia, itensDosEscolhidos, problemasDoPasso } from "./derivarFamilia";
import { DEFS, K_LEVE, attrs, produto } from "./fixturesFamilias";

const p50 = produto("p50", "Lava-loiça Velar 50", { pvp: 150 }), p60 = produto("p60", "Lava-loiça Velar 60", { pvp: 180 }), p60p = produto("p60p", "Lava-loiça Velar 60 preta", { pvp: 190 });
const lidos = new Map<string, AtributoProduto[]>([["p50", attrs(50, "o-branco")], ["p60", attrs(60, "o-branco")], ["p60p", attrs(60, "o-preto")]]);
const itens = () => itensDosEscolhidos([p50, p60, p60p], lidos, DEFS, () => "Louças");

describe("categoriaDoNo", () => {
  it("devolve o nome da categoria de topo, mesmo partindo de uma subcategoria", () => {
    expect(categoriaDoNo(K_LEVE, "s1")).toBe("Louças");
    expect(categoriaDoNo(K_LEVE, "c2")).toBe("Torneiras");
  });
  it("sem nó, ou com um nó que não existe, não há categoria", () => {
    expect(categoriaDoNo(K_LEVE, null)).toBeUndefined();
    expect(categoriaDoNo(K_LEVE, "nada")).toBeUndefined();
    expect(categoriaDoNo({}, "s1")).toBeUndefined();
  });
});

describe("itensDosEscolhidos", () => {
  it("só entram os produtos cujos atributos já foram lidos, com SKU, preço e categoria", () => {
    const r = itensDosEscolhidos([p50, p60], new Map([["p50", attrs(50, "o-branco")]]), DEFS, () => "Louças");
    expect(r).toHaveLength(1);
    expect(r[0].ref).toMatchObject({ id: "p50", sku: "SKU-p50", preco: 150, categoria: "Louças" });
    expect(r[0].atributos).toEqual({ Medida: "Largura 50 cm", Cor: "Branco" });
    expect(r[0].hex).toEqual({ Cor: ["#F5F5F0"] });
  });
  it("um produto lido sem atributos entra com atributos vazios (o núcleo diz que lhe falta valor)", () => {
    const r = itensDosEscolhidos([p50], new Map([["p50", []]]), DEFS, () => undefined);
    expect(r[0].atributos).toEqual({});
  });
});

describe("derivarFamilia", () => {
  it("por omissão: cor = Cor, medida = Medida; N produtos = N variantes, com o hex da opção", () => {
    const d = derivarFamilia(itens(), null);
    expect(d.eixos).toEqual({ cor: "Cor", medida: ["Medida"] });
    expect(d.nomes).toEqual(["Medida", "Cor"]);
    expect(d.familia.variantes).toHaveLength(3);
    expect(d.familia.medidas.map((m) => m.rotulo)).toEqual(["Largura 50 cm", "Largura 60 cm"]);
    expect(d.familia.cores.map((c) => [c.nome, c.hex])).toEqual([["Branco", ["#F5F5F0"]], ["Preto", ["#000000"]]]);
    expect(d.problemas.filter((x) => x.gravidade === "erro")).toEqual([]);
    expect(d.familia.nome).toBe("Lava-loiça Velar");
  });
  it("sem atributo de cor (cor = nenhum) dois produtos da mesma medida repetem-se: erro «repetido» que bloqueia", () => {
    const d = derivarFamilia(itens(), { cor: null, medida: ["Medida"] });
    expect(d.problemas.some((x) => x.tipo === "repetido" && x.gravidade === "erro")).toBe(true);
    expect(d.familia.variantes).toHaveLength(2);
  });
  it("uma cor sem hex é um aviso (não bloqueia) e uma medida mista também", () => {
    const pedra = produto("pp", "Lava-loiça Velar pedra", { pvp: 120 });
    const comPedra = new Map(lidos).set("pp", [...attrs(70, "o-pedra")]);
    const ii = itensDosEscolhidos([p50, pedra], comPedra, DEFS, () => "Louças");
    const d = derivarFamilia(ii, null);
    expect(d.problemas.filter((x) => x.tipo === "cor_sem_hex")).toHaveLength(1);
    expect(d.problemas.filter((x) => x.gravidade === "erro")).toEqual([]);
    const mista = new Map<string, AtributoProduto[]>([["p50", attrs(50, "o-branco")], ["pm", [{ atributoId: "a-medida", medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } }, { atributoId: "a-cor", opcaoId: "o-preto" }]]]);
    const dm = derivarFamilia(itensDosEscolhidos([p50, produto("pm", "Lava-loiça Velar 60x60", { pvp: 99 })], mista, DEFS, () => undefined), null);
    expect(dm.problemas.some((x) => x.tipo === "medida_mista" && x.gravidade === "aviso")).toBe(true);
  });
  it("uma medida em faixa, escolhida como eixo, é uma variante válida: o rótulo é a medida e não há erros", () => {
    const iv = new Map<string, AtributoProduto[]>([["p50", attrs(50, "o-branco")], ["pi", [{ atributoId: "a-medida", medida: { tipo: "1D", dimensao: "largura", valor: { de: 90, ate: 100 }, unidade: "cm" } }, { atributoId: "a-cor", opcaoId: "o-preto" }]]]);
    const d = derivarFamilia(itensDosEscolhidos([p50, produto("pi", "Lava-loiça Velar faixa")], iv, DEFS, () => undefined), null);
    expect(d.problemas.filter((x) => x.gravidade === "erro")).toEqual([]);
    expect(d.familia.variantes.map((v) => v.produtoId)).toEqual(["p50", "pi"]);
    expect(d.familia.medidas.map((m) => m.rotulo)).toEqual(["Largura 50 cm", "Largura 90–100 cm"]);
  });
  it("sem produtos: erros de nome e de «sem variantes»", () => {
    const d = derivarFamilia([], null);
    expect(d.problemas.map((x) => x.tipo)).toEqual(expect.arrayContaining(["nome", "sem_variantes"]));
  });
  it("um identificador que já existe noutra família da sessão é erro", () => {
    const d = derivarFamilia(itens(), null, ["fam:lava-loica-velar"]);
    expect(d.problemas.some((x) => x.tipo === "id" && x.gravidade === "erro")).toBe(true);
  });
  it("os eixos escolhidos valem; atributos que já não existem saem; a ordem da escolha mantém-se", () => {
    const d = derivarFamilia(itens(), { cor: "Cor", medida: ["Nº de cubas", "Medida"] });
    expect(d.eixos).toEqual({ cor: "Cor", medida: ["Medida"] });
  });
  it("um produto sem preço é erro «preco»", () => {
    const semPreco = produto("sp", "Lava-loiça Velar sem preço", { pvp: undefined, custo: 0 });
    const d = derivarFamilia(itensDosEscolhidos([p50, semPreco], new Map([["p50", attrs(50, "o-branco")], ["sp", attrs(80, "o-preto")]]), DEFS, () => undefined), null);
    expect(d.problemas.some((x) => x.tipo === "preco" && x.produtoId === "sp")).toBe(true);
  });
});

describe("a categoria da família (R2: o id da base é diferente do id do nó)", () => {
  const cat = (no: string | null) => categoriaDoNo(K_LEVE, no);
  it("sai pelo nome da categoria de topo, a partir do id da base que a linha traz", () => {
    expect(derivarFamilia(itensDosEscolhidos([p50, p60, p60p], lidos, DEFS, cat), null).familia.categoria).toBe("Louças");
  });
  it("produtos de categorias de topo diferentes dão «Várias categorias»", () => {
    const torneira = produto("t", "Lava-loiça Velar 70 torneira", { no: "c2", pvp: 90 });
    const l = new Map(lidos).set("t", attrs(70, "o-preto"));
    expect(derivarFamilia(itensDosEscolhidos([p50, torneira], l, DEFS, cat), null).familia.categoria).toBe("Várias categorias");
  });
});

describe("problemas por passo", () => {
  const todos = derivarFamilia([], null).problemas;
  it("o passo 2 mostra o que se corrige nos atributos; nome, id e marcas ficam para o resumo", () => {
    expect(problemasDoPasso(todos, 2).map((x) => x.tipo)).toEqual(["sem_variantes"]);
    expect(problemasDoPasso(todos, 3).map((x) => x.tipo)).toEqual(["nome"]);
  });
  it("só os ERROS do passo bloqueiam; um aviso nunca", () => {
    const d = derivarFamilia(itens(), { cor: null, medida: ["Medida"] });
    expect(bloqueiaPasso(d.problemas, 2)).toBe(true);
    expect(bloqueiaPasso(derivarFamilia(itens(), null).problemas, 2)).toBe(false);
  });
});
