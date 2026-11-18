// O núcleo puro das famílias (configurador): eixos, família por eixos, problemas, marca/categoria derivadas.
// Os atributos são ESTRUTURADOS (Produto.attrs + AtributoDef); aqui testam-se com o texto que o adaptador produz.
import { describe, expect, it } from "vitest";
import type { AtributoDef, Produto } from "../v2/catalogoModelo";
import {
  ALVO_PROTO, categoriaDaFamilia, eixosPorOmissao, eixosValidos, familiaPorEixos, idsDaFamilia, itemDoCatalogo, marcaDaFamilia, nomesDosAtributos, problemas,
  produtosEmIntervalo, produtosSemValor, refDoProduto, slug, sugerirFamilia, textoSemValor, type EixosCfg, type FamiliaCfg, type ItemEixos, type ProdutoRef,
} from "./nucleo";

const item = (id: string, n: string, atributos: Record<string, string>, extra: { hex?: Record<string, string[]>; preco?: number; marca?: string; sku?: string; categoria?: string; intervalos?: string[] } = {}): ItemEixos => ({
  ref: { id, n, marca: extra.marca ?? "FRASA", sku: extra.sku ?? id.toUpperCase(), preco: extra.preco ?? 100, semPvp: false, ...(extra.categoria ? { categoria: extra.categoria } : {}) },
  atributos, ...(extra.hex ? { hex: extra.hex } : {}), ...(extra.intervalos ? { intervalos: extra.intervalos } : {}),
});
const erros = (f: FamiliaCfg, outros: readonly string[] = []) => problemas(f, outros).filter((p) => p.gravidade === "erro");

describe("refDoProduto: o preço de venda é o do catálogo", () => {
  const prod = { id: "p1", n: "X", marca: "M", sku: " S1 ", sub: "Cubas inox", custo: 65 };
  it("com PVP usa o PVP; sem PVP, custo ÷ (1 − margem-alvo), como o catálogo", () => {
    expect(refDoProduto({ ...prod, pvp: 149 })).toMatchObject({ preco: 149, semPvp: false, sku: "S1" });
    expect(ALVO_PROTO).toBe(35);
    expect(refDoProduto(prod)).toMatchObject({ preco: 100, semPvp: true });
  });
  it("sem PVP e sem custo: preço 0; sem referência o id serve de SKU; a categoria passa", () => {
    expect(refDoProduto({ id: "p9", n: "Y", custo: 0 })).toMatchObject({ preco: 0, semPvp: true, sku: "p9" });
    expect(refDoProduto({ ...prod, categoria: "Cozinha › Lava-louças" }).categoria).toBe("Cozinha › Lava-louças");
    expect(refDoProduto({ id: "p9", n: "Y", custo: 0 })).not.toHaveProperty("categoria");
  });
  it("PVP negativo ou NaN no custo não dá preço negativo nem NaN", () => {
    expect(refDoProduto({ id: "a", n: "A", custo: Number.NaN }).preco).toBe(0);
  });
});

describe("itemDoCatalogo: do produto estruturado ao item do configurador", () => {
  const DEFS: AtributoDef[] = [
    { id: "m", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
    { id: "c", codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: "oc", valor: "BRANCO", nome: "Branco", hex: "#F5F5F0", ordem: 1 }] },
  ];
  const produto = { id: "p1", n: "Pavimento", custo: 10, pvp: 50, marca: "Alfa", sku: "PAV1", un: "m2", fornecedor: "", data: "", no: null, ex: undefined,
    attrs: [{ atributoId: "m", medida: { tipo: "2D", largura: 60, comprimento: { de: 60, ate: 62 }, espessura: null, unidade: "cm" } }, { atributoId: "c", opcaoId: "oc" }] } as unknown as Produto;
  it("junta o preço/SKU, os atributos, o hex e os intervalos", () => {
    const i = itemDoCatalogo(produto, DEFS, { categoria: "Pavimentos" });
    expect(i.ref).toMatchObject({ id: "p1", sku: "PAV1", preco: 50, marca: "Alfa", categoria: "Pavimentos" });
    expect(i.atributos).toEqual({ Medida: "60 × 60–62 cm", Cor: "Branco" });
    expect(i.hex).toEqual({ Cor: ["#F5F5F0"] });
    expect(i.intervalos).toEqual(["Medida"]);
  });
  it("produto sem attrs: item sem atributos", () => {
    expect(itemDoCatalogo({ ...produto, attrs: undefined } as Produto, DEFS).atributos).toEqual({});
  });
});

describe("slug", () => {
  it("sem acentos, minúsculas, hífens; só símbolos dão vazio", () => {
    expect(slug("Lava-louças  VELAR (50)")).toBe("lava-loucas-velar-50");
    expect(slug("Ação ✨ 😀")).toBe("acao");
    expect(slug("***")).toBe("");
    expect(slug("")).toBe("");
  });
});

describe("eixos: o que se escolhe entre os atributos dos produtos", () => {
  const cubas = (c: string, m: string, cor = "Inox") => ({ Medida: m, Cor: cor, "Nº de cubas": c, Material: "Inox" });
  const BETAS = [item("a", "Beta 1 CUBA 50", cubas("1 cuba", "Largura 50 cm")), item("b", "Beta 2 CUBAS 50", cubas("2 cubas", "Largura 50 cm")), item("c", "Beta 2 CUBAS 70", cubas("2 cubas", "Largura 70 cm"))];

  it("nomesDosAtributos: Medida e Cor primeiro, os outros pela ordem em que aparecem; sem repetir", () => {
    expect(nomesDosAtributos([{ Material: "Inox", "Nº de cubas": "1 cuba" }, { Cor: "Cobre", Medida: "40×40 cm" }])).toEqual(["Medida", "Cor", "Material", "Nº de cubas"]);
    expect(nomesDosAtributos([])).toEqual([]);
  });
  it("eixosPorOmissao: a cor é «Cor» (ou «Acabamento»); a medida junta Medida e os atributos que variam", () => {
    expect(eixosPorOmissao(BETAS.map((x) => x.atributos))).toEqual({ cor: "Cor", medida: ["Medida", "Nº de cubas"] });
    expect(eixosPorOmissao([{ Cor: "Cromo" }, { Cor: "Preto" }])).toEqual({ cor: "Cor", medida: [] });
    expect(eixosPorOmissao([{ Acabamento: "Cobre", Medida: "40×40 cm" }])).toEqual({ cor: "Acabamento", medida: ["Medida"] });
    expect(eixosPorOmissao([{}])).toEqual({ cor: null, medida: [] });
    expect(eixosPorOmissao([])).toEqual({ cor: null, medida: [] });
  });
  it("eixosValidos: sem escolha a omissão (null e undefined); o que já não existe sai; a cor não fica na medida", () => {
    const lista = BETAS.map((x) => x.atributos);
    expect(eixosValidos(undefined, lista)).toEqual(eixosPorOmissao(lista));
    expect(eixosValidos(null, lista)).toEqual(eixosPorOmissao(lista));
    expect(eixosValidos({ cor: "Brilho", medida: ["Medida", "Cor", "Brilho", "Material"] }, lista)).toEqual({ cor: null, medida: ["Medida", "Cor", "Material"] });
    expect(eixosValidos({ cor: "Cor", medida: ["Cor", "Medida", "Medida"] }, lista)).toEqual({ cor: "Cor", medida: ["Medida"] });
  });
});

describe("familiaPorEixos: variantes, medidas e cores", () => {
  const BETAS = [
    item("c", "Beta 2 CUBAS 70", { Medida: "Largura 70 cm", Cor: "Inox", "Nº de cubas": "2 cubas" }, { preco: 130 }),
    item("a", "Beta 1 CUBA 50", { Medida: "Largura 50 cm", Cor: "Inox", "Nº de cubas": "1 cuba" }, { preco: 100 }),
    item("b", "Beta 2 CUBAS 50", { Medida: "Largura 50 cm", Cor: "Inox", "Nº de cubas": "2 cubas" }, { preco: 110 }),
  ];
  const EIXOS: EixosCfg = { cor: "Cor", medida: ["Medida", "Nº de cubas"] };

  it("o rótulo junta os valores dos eixos, a ordem dos eixos conta e as medidas ordenam-se pelos valores (não pela ordem dos produtos)", () => {
    const { familia: f, conflitos } = familiaPorEixos("Beta", BETAS, EIXOS);
    expect(conflitos).toEqual([]);
    expect(f.medidas.map((m) => m.rotulo)).toEqual(["Largura 50 cm · 1 cuba", "Largura 50 cm · 2 cubas", "Largura 70 cm · 2 cubas"]);
    expect(f.cores.map((c) => c.nome)).toEqual(["Inox"]);
    expect(f.eixos).toEqual(EIXOS);
    expect(f.nome).toBe("Beta");
    expect(f.id).toBe("fam:beta");
    expect(erros(f)).toEqual([]);
    const inv = familiaPorEixos("Beta", BETAS, { cor: "Cor", medida: ["Nº de cubas", "Medida"] }).familia;
    expect(inv.medidas.map((m) => m.rotulo)).toEqual(["1 cuba · Largura 50 cm", "2 cubas · Largura 50 cm", "2 cubas · Largura 70 cm"]);
    expect(familiaPorEixos("Beta", BETAS, { cor: "Cor", medida: ["Nº de cubas"] }).familia.medidas.map((m) => m.rotulo)).toEqual(["1 cuba", "2 cubas"]);
  });

  it("as variantes são os produtos (SKU e preço deles), pela ordem das medidas; o resultado não depende da ordem de entrada", () => {
    const { familia: f } = familiaPorEixos("Beta", BETAS, EIXOS);
    expect(f.variantes.map((v) => [v.produtoId, v.sku, v.preco, v.produtoNome])).toEqual([["a", "A", 100, "Beta 1 CUBA 50"], ["b", "B", 110, "Beta 2 CUBAS 50"], ["c", "C", 130, "Beta 2 CUBAS 70"]]);
    const outra = familiaPorEixos("Beta", [...BETAS].reverse(), EIXOS).familia;
    expect(outra).toEqual(f);
    expect(idsDaFamilia(f)).toEqual(["a", "b", "c"]);
  });

  it("matriz 2D: 3 medidas (por área) × 2 cores = 6 variantes, cada uma com o SKU do seu produto", () => {
    const itens: ItemEixos[] = [];
    for (const m of ["60×120 cm", "30×60 cm", "60×60 cm"]) for (const c of ["Branco", "Preto"]) itens.push(item(`${m}-${c}`, `Pav ${m} ${c}`, { Medida: m, Cor: c }, { sku: `SKU ${m} ${c}` }));
    const { familia: f, conflitos } = familiaPorEixos("Pav", itens, { cor: "Cor", medida: ["Medida"] });
    expect(conflitos).toEqual([]);
    expect(f.medidas.map((m) => m.rotulo)).toEqual(["30×60 cm", "60×60 cm", "60×120 cm"]);
    expect(f.cores.map((c) => c.nome)).toEqual(["Branco", "Preto"]);
    expect(f.variantes).toHaveLength(6);
    expect(new Set(f.variantes.map((v) => `${v.medidaId}|${v.corId}`)).size).toBe(6);
    expect(f.variantes[0].sku).toBe("SKU 30×60 cm Branco");
    expect(erros(f)).toEqual([]);
  });

  it("intervalos/texto/1D/2D juntos: sem formato conhecido ordena por texto, e a ordem não depende da entrada", () => {
    const a = familiaPorEixos("X", [item("a", "A", { Medida: "Grande" }), item("b", "B", { Medida: "Cabe" })], { cor: null, medida: ["Medida"] }).familia;
    expect(a.medidas.map((m) => m.rotulo)).toEqual(["Cabe", "Grande"]);
    const b = familiaPorEixos("X", [item("a", "A", { Tonalidade: "Z" }), item("b", "B", { Tonalidade: "A" })], { cor: null, medida: ["Tonalidade"] }).familia;
    expect(b.medidas.map((m) => m.rotulo)).toEqual(["A", "Z"]);
  });

  it("hex por opção: a cor leva a lista de hex do produto; cor dupla guarda os dois; sem hex fica assinalado (aviso, não bloqueia)", () => {
    const itens = [
      item("a", "P1", { Cor: "Branco", Medida: "60×60 cm" }, { hex: { Cor: ["#F5F5F0"] } }),
      item("b", "P2", { Cor: "Branco/Preto", Medida: "60×60 cm" }, { hex: { Cor: ["#FFFFFF", "#000000"] } }),
      item("c", "P3", { Cor: "Pedra", Medida: "60×60 cm" }),
    ];
    const f = familiaPorEixos("P", itens, { cor: "Cor", medida: ["Medida"] }).familia;
    expect(f.cores.map((c) => [c.nome, c.hex, c.semHex])).toEqual([["Branco", ["#F5F5F0"], false], ["Branco/Preto", ["#FFFFFF", "#000000"], false], ["Pedra", [], true]]);
    expect(erros(f)).toEqual([]);
    const aviso = problemas(f).filter((p) => p.tipo === "cor_sem_hex");
    expect(aviso).toHaveLength(1);
    expect(aviso[0]).toMatchObject({ gravidade: "aviso" });
    expect(aviso[0].msg).toMatch(/Pedra/);
  });

  it("o hex só conta no atributo escolhido como cor; duas cores com o mesmo nome mas hex diferentes avisam", () => {
    const f = familiaPorEixos("P", [
      item("a", "P1", { Cor: "Branco", Medida: "60×60 cm", Tonalidade: "Claro" }, { hex: { Tonalidade: ["#EEEEEE"] } }),
      item("b", "P2", { Cor: "Branco", Medida: "60×120 cm" }, { hex: { Cor: ["#F5F5F0"] } }),
      item("c", "P3", { Cor: "branco", Medida: "30×60 cm" }, { hex: { Cor: ["#FFFFFF"] } }),
    ], { cor: "Cor", medida: ["Medida"] }).familia;
    expect(f.cores).toHaveLength(1);
    expect(problemas(f).some((p) => p.tipo === "cor_hex_diferente")).toBe(true);
  });

  it("sem atributo de cor há uma só cor «Padrão», sem aviso de hex", () => {
    const f = familiaPorEixos("X", [item("a", "X 40", { Medida: "40×40 cm", Material: "Inox" }), item("b", "X 50", { Medida: "50×50 cm", Material: "Latão" })], { cor: null, medida: ["Medida"] }).familia;
    expect(f.cores.map((c) => c.nome)).toEqual(["Padrão"]);
    expect(problemas(f).some((p) => p.tipo === "cor_sem_hex")).toBe(false);
    const porMaterial = familiaPorEixos("X", [item("a", "X 40", { Medida: "40×40 cm", Material: "Inox" }), item("b", "X 50", { Medida: "50×50 cm", Material: "Latão" })], { cor: "Material", medida: ["Medida"] }).familia;
    expect(porMaterial.cores.map((c) => c.nome)).toEqual(["Inox", "Latão"]);
  });

  it("combinação repetida: o segundo fica de fora, o aviso diz como corrigir e há um erro", () => {
    const duas = [item("a", "Beta 40", { Medida: "Largura 50 cm", "Nº de cubas": "1 cuba", Cor: "Inox" }), item("b", "Beta 40 N", { Medida: "Largura 50 cm", "Nº de cubas": "1 cuba", Cor: "inox" })];
    const r = familiaPorEixos("Beta", duas, EIXOS);
    expect(r.conflitos).toHaveLength(1);
    expect(r.conflitos[0]).toMatch(/«Beta 40» e «Beta 40 N» têm os mesmos valores em todos os atributos \(Medida: Largura 50 cm; Nº de cubas: 1 cuba; Cor: Inox\)/);
    expect(r.conflitos[0]).toMatch(/corrija no produto do catálogo ou exclua um dos produtos/);
    expect(r.familia.variantes.map((v) => v.produtoId)).toEqual(["a"]);
    expect(erros(r.familia).map((p) => p.tipo)).toEqual(["repetido"]);
    expect(r.familia.excluidos).toEqual([expect.objectContaining({ produtoId: "b", motivo: "repetido" })]);
  });

  it("o mesmo produto duas vezes: a segunda é ignorada e é erro", () => {
    const x = item("a", "Beta", { Medida: "40×40 cm", Cor: "Preto" });
    const f = familiaPorEixos("Beta", [x, x], { cor: "Cor", medida: ["Medida"] }).familia;
    expect(f.variantes).toHaveLength(1);
    expect(erros(f).map((p) => p.tipo)).toEqual(["produto_duplicado"]);
  });

  it("produto sem valor num eixo: fica de fora e bloqueia; um atributo fora dos eixos não", () => {
    const itens = [...BETAS_SIMPLES(), item("d", "Beta sem cubas", { Medida: "Largura 80 cm", Cor: "Inox" })];
    const eixos = { cor: "Cor", medida: ["Medida", "Nº de cubas"] };
    const faltas = produtosSemValor(itens, eixos);
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toMatchObject({ produtoId: "d", atributo: "Nº de cubas" });
    expect(faltas[0].msg).toBe(`«Beta sem cubas»: ${textoSemValor("Nº de cubas")}`);
    expect(textoSemValor("Nº de cubas")).toBe("Este produto não tem Nº de cubas: corrija no produto do catálogo.");
    expect(produtosSemValor(itens, { cor: "Cor", medida: ["Medida"] })).toEqual([]);
    expect(produtosSemValor([item("e", "Sem nada", {})], { cor: "Cor", medida: ["Medida"] }).map((x) => x.atributo)).toEqual(["Medida", "Cor"]);
    expect(produtosSemValor([item("e", "Sem nada", {})], { cor: null, medida: [] })).toEqual([]);
    expect(produtosSemValor([item("e", "X", { Medida: "  " })], { cor: null, medida: ["Medida"] })).toHaveLength(1);
    const f = familiaPorEixos("Beta", itens, eixos).familia;
    expect(f.variantes.map((v) => v.produtoId)).toEqual(["a", "b"]);
    expect(erros(f).map((p) => [p.tipo, p.produtoId])).toEqual([["sem_valor", "d"]]);
    expect(erros(f)[0].msg).toBe(faltas[0].msg);
    expect(produtosSemValor([], eixos)).toEqual([]);
  });

  it("medida em intervalo: não é uma variante, é problema «medida em intervalo»; fora dos eixos não conta", () => {
    const iv = item("i", "Pav 91-100", { Medida: "91–100 × 90 cm", Cor: "Branco" }, { intervalos: ["Medida"] });
    const normal = item("n", "Pav 60", { Medida: "60×90 cm", Cor: "Branco" });
    const eixos = { cor: "Cor", medida: ["Medida"] };
    expect(produtosEmIntervalo([iv, normal], eixos)).toEqual([expect.objectContaining({ produtoId: "i", atributo: "Medida" })]);
    const f = familiaPorEixos("Pav", [iv, normal], eixos).familia;
    expect(f.variantes.map((v) => v.produtoId)).toEqual(["n"]);
    const p = erros(f);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ tipo: "intervalo", produtoId: "i" });
    expect(p[0].msg).toMatch(/medida em intervalo/);
    expect(p[0].msg).toMatch(/91–100 × 90 cm/);
    // o mesmo intervalo num atributo que não é eixo não bloqueia
    expect(produtosEmIntervalo([iv], { cor: "Cor", medida: [] })).toEqual([]);
    expect(familiaPorEixos("Pav", [iv], { cor: "Cor", medida: [] }).familia.variantes).toHaveLength(1);
  });

  it("mistura de 1D e 2D no atributo Medida: aviso (não bloqueia) e ordem 2D → 1D", () => {
    const f = familiaPorEixos("Mix", [item("a", "A", { Medida: "Largura 70 cm" }), item("b", "B", { Medida: "60×60 cm" })], { cor: null, medida: ["Medida"] }).familia;
    expect(f.medidas.map((m) => m.rotulo)).toEqual(["60×60 cm", "Largura 70 cm"]);
    expect(erros(f)).toEqual([]);
    expect(problemas(f).filter((p) => p.tipo === "medida_mista")).toEqual([expect.objectContaining({ gravidade: "aviso" })]);
    const so1d = familiaPorEixos("Mix", [item("a", "A", { Medida: "Largura 70 cm" }), item("b", "B", { Medida: "Altura 70 cm" })], { cor: null, medida: ["Medida"] }).familia;
    expect(problemas(so1d).some((p) => p.tipo === "medida_mista")).toBe(false);
  });

  it("marcas diferentes: «Várias marcas» (aviso); categoria derivada igual", () => {
    const f = familiaPorEixos("X", [item("a", "A", { Medida: "40×40 cm" }, { marca: "FRASA", categoria: "Cozinha" }), item("b", "B", { Medida: "50×50 cm" }, { marca: "Rodi", categoria: "Cozinha" })], { cor: null, medida: ["Medida"] }).familia;
    expect(f).toMatchObject({ marca: "Várias marcas", marcasVarias: true, categoria: "Cozinha" });
    expect(problemas(f).filter((p) => p.gravidade === "aviso").map((p) => p.tipo)).toEqual(["marcas"]);
    expect(erros(f)).toEqual([]);
  });

  it("não muta os itens nem os eixos", () => {
    const itens = BETAS_SIMPLES(), eixos: EixosCfg = { cor: "Cor", medida: ["Medida"] }, antes = JSON.stringify([itens, eixos]);
    const f = familiaPorEixos("B", itens, eixos).familia;
    expect(JSON.stringify([itens, eixos])).toBe(antes);
    expect(f.eixos).not.toBe(eixos);
    expect(f.eixos.medida).not.toBe(eixos.medida);
  });

  it("sem produtos: família vazia, sem rebentar, e pede produtos", () => {
    const f = familiaPorEixos("", [], { cor: null, medida: [] }).familia;
    expect(f.variantes).toEqual([]);
    expect(erros(f).map((p) => p.tipo)).toEqual(expect.arrayContaining(["nome", "sem_variantes"]));
  });

  it("caracteres especiais (acentos, emoji, aspas) nos nomes, cores e SKUs passam intactos", () => {
    const f = familiaPorEixos("Lava-louças «Ação» 😀", [
      item("a", "Lava'loiça \"X\" 😀", { Cor: "Preto ✨", Medida: "40×40 cm" }, { sku: "A/1;DROP TABLE" }),
    ], { cor: "Cor", medida: ["Medida"] }).familia;
    expect(f.cores[0].nome).toBe("Preto ✨");
    expect(f.variantes[0]).toMatchObject({ sku: "A/1;DROP TABLE", produtoNome: "Lava'loiça \"X\" 😀" });
    expect(f.id).toBe("fam:lava-loucas-acao");
  });

  it("10 000 produtos (100 medidas × 100 cores) montam-se em tempo razoável e sem perder variantes", () => {
    const itens: ItemEixos[] = [];
    for (let m = 1; m <= 100; m++) for (let c = 1; c <= 100; c++) itens.push(item(`p${m}-${c}`, `P ${m} ${c}`, { Medida: `${m}×${m + 1} cm`, Cor: `Cor ${c}` }, { hex: { Cor: ["#112233"] } }));
    const t0 = Date.now();
    const f = familiaPorEixos("Grande", itens, { cor: "Cor", medida: ["Medida"] }).familia;
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(f.variantes).toHaveLength(10000);
    expect(f.medidas).toHaveLength(100);
    expect(f.cores).toHaveLength(100);
    expect(f.medidas[0].rotulo).toBe("1×2 cm");
    expect(f.medidas[99].rotulo).toBe("100×101 cm");
  });
});

function BETAS_SIMPLES(): ItemEixos[] {
  return [
    item("a", "Beta 1", { Medida: "Largura 50 cm", Cor: "Inox", "Nº de cubas": "1 cuba" }),
    item("b", "Beta 2", { Medida: "Largura 70 cm", Cor: "Inox", "Nº de cubas": "2 cubas" }),
  ];
}

describe("problemas: o que bloqueia e o que só avisa", () => {
  const ok = (): FamiliaCfg => familiaPorEixos("Beta", BETAS_SIMPLES(), { cor: "Cor", medida: ["Medida"] }).familia;
  it("uma família certa não tem erros (a cor sem hex só avisa)", () => {
    expect(erros(ok())).toEqual([]);
  });
  it("sem nome, ou nome sem letras nem números: erro a pedir produtos, não um nome escrito", () => {
    expect(erros({ ...ok(), nome: "" }).map((p) => p.tipo)).toEqual(["nome"]);
    expect(erros({ ...ok(), nome: "  " })[0].msg).toMatch(/nome da família/i);
    expect(erros({ ...ok(), nome: "😀" })[0].msg).toMatch(/letras ou números/);
    expect(erros({ ...ok(), nome: "" })[0].msg).not.toMatch(/Escreva o nome/);
  });
  it("id já usado por outra família da sessão", () => {
    const f = ok();
    expect(erros(f, [f.id]).map((p) => p.tipo)).toEqual(["id"]);
    expect(erros(f, ["fam:outra"])).toEqual([]);
  });
  it("SKU repetido entre variantes e produto sem preço de venda", () => {
    const f = familiaPorEixos("Beta", [item("a", "A", { Medida: "40×40 cm" }, { sku: "IGUAL" }), item("b", "B", { Medida: "50×50 cm" }, { sku: "IGUAL", preco: 0 })], { cor: null, medida: ["Medida"] }).familia;
    const p = erros(f);
    expect(p.map((x) => x.tipo).sort()).toEqual(["preco", "sku"]);
    expect(p.find((x) => x.tipo === "sku")?.msg).toMatch(/SKU «IGUAL» repete-se \(A; B\)/);
    expect(p.find((x) => x.tipo === "preco")).toMatchObject({ produtoId: "b" });
    expect(p.find((x) => x.tipo === "preco")?.msg).toMatch(/«B».*preço de venda/);
  });
});

describe("sugerirFamilia, marcaDaFamilia e categoriaDaFamilia", () => {
  const ref = (id: string, n: string, extra: Partial<ProdutoRef> = {}): ProdutoRef => ({ id, n, marca: "FRASA", sku: id.toUpperCase(), preco: 100, semPvp: false, ...extra });
  it("o nome é o começo comum dos nomes, sem números nem «CUBA» no fim; a marca é a mais frequente", () => {
    const s = sugerirFamilia([ref("a", "Lava-louças VELAR 1 CUBA 34"), ref("b", "Lava-louças VELAR 1 CUBA 40"), ref("c", "Lava-louças VELAR 1 CUBA 50", { marca: "Rodi" }), ref("d", "Lava-louças VELAR 1 CUBA 70")]);
    expect(s).toEqual({ nome: "Lava-louças VELAR", marca: "FRASA" });
  });
  it("um só produto: o nome dele sem a medida; sem produtos: vazio", () => {
    expect(sugerirFamilia([ref("a", "Lody 40 U-F - Cobre")]).nome).toBe("Lody U-F");
    expect(sugerirFamilia([])).toEqual({ nome: "", marca: "" });
  });
  it("nomes sem nada em comum: cai no primeiro nome sem números", () => {
    expect(sugerirFamilia([ref("a", "Alfa 40"), ref("b", "Beta 50")]).nome).toBe("Alfa");
  });
  it("marcaDaFamilia: a marca comum; «Várias marcas» se diferem; vazio sem marcas", () => {
    const r = (marca?: string) => ref("x", "X", { marca });
    expect(marcaDaFamilia([r("FRASA"), r("FRASA")])).toEqual({ marca: "FRASA", varias: false });
    expect(marcaDaFamilia([r("FRASA"), r("Rodi")])).toEqual({ marca: "Várias marcas", varias: true });
    expect(marcaDaFamilia([r(), r()])).toEqual({ marca: "", varias: false });
    expect(marcaDaFamilia([r(" FRASA "), r("FRASA"), r("")])).toEqual({ marca: "FRASA", varias: false });
    expect(marcaDaFamilia([])).toEqual({ marca: "", varias: false });
  });
  it("categoriaDaFamilia: a comum, «Várias categorias» se diferem, vazio sem categorias", () => {
    const r = (categoria?: string) => ref("x", "X", { categoria });
    expect(categoriaDaFamilia([r("Cozinha"), r("Cozinha")])).toEqual({ categoria: "Cozinha", varias: false });
    expect(categoriaDaFamilia([r("Cozinha"), r("Banho")])).toEqual({ categoria: "Várias categorias", varias: true });
    expect(categoriaDaFamilia([r(), r()])).toEqual({ categoria: "", varias: false });
  });
});
