// 23/11: a pré-visualização 3D de um produto no formulário de criar e na ficha: o conversor das medidas e da cor dos atributos, o estado do modelo
// (3D do HTML, genérico, aproximado ou caixa) e a cena mínima (um espaço pequeno com a peça ao centro).
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
import { cenaDoProduto, corDosAtributos, estadoDoModelo, medidasDosAtributos, modeloParaPrevia } from "./previaProduto3d";

const med = (m: AtributoProduto["medida"]): AtributoProduto[] => [{ atributoId: "a-med", medida: m }];

describe("medidasDosAtributos: a medida do produto em centímetros", () => {
  it("2D em cm: largura e comprimento (que é a profundidade); sem altura", () => {
    expect(medidasDosAtributos(med({ tipo: "2D", largura: 60, comprimento: 45, espessura: null, unidade: "cm" }))).toEqual({ larguraCm: 60, profundidadeCm: 45 });
  });
  it("3D em mm passa a cm e a espessura é a altura", () => {
    expect(medidasDosAtributos(med({ tipo: "3D", largura: 600, comprimento: 450, espessura: 800, unidade: "mm" }))).toEqual({ larguraCm: 60, profundidadeCm: 45, alturaCm: 80 });
  });
  it("um intervalo usa o limite superior (`ate`)", () => {
    expect(medidasDosAtributos(med({ tipo: "2D", largura: { de: 50, ate: 70 }, comprimento: { de: 30, ate: 40 }, espessura: null, unidade: "cm" }))).toEqual({ larguraCm: 70, profundidadeCm: 40 });
  });
  it("um intervalo em mm também passa a cm", () => {
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: { de: 500, ate: 800 }, unidade: "mm" }))).toEqual({ larguraCm: 80 });
  });
  it("1D: a largura (ou o comprimento) dá só a largura; a altura dá só a altura; a espessura não diz nada", () => {
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 80, unidade: "cm" }))).toEqual({ larguraCm: 80 });
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "comprimento", valor: 120, unidade: "cm" }))).toEqual({ larguraCm: 120 });
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "altura", valor: 200, unidade: "cm" }))).toEqual({ alturaCm: 200 });
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "espessura", valor: 2, unidade: "cm" }))).toBeNull();
  });
  it("arredonda ao milímetro (uma casa decimal em cm)", () => {
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 7.5, unidade: "mm" }))).toEqual({ larguraCm: 0.8 });
  });
  it("sem medida legível devolve null: sem atributos, vazios, sem medida, zero, negativo, NaN ou fora do possível", () => {
    expect(medidasDosAtributos(undefined)).toBeNull();
    expect(medidasDosAtributos([])).toBeNull();
    expect(medidasDosAtributos([{ atributoId: "a-cor", opcaoId: "o1", valor: "Preto" }])).toBeNull();
    expect(medidasDosAtributos(med({ tipo: "2D", largura: 0, comprimento: -5, espessura: null, unidade: "cm" }))).toBeNull();
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: Number.NaN, unidade: "cm" }))).toBeNull();
    expect(medidasDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 5000, unidade: "cm" }))).toBeNull();
  });
  it("com uma dimensão ilegível e outra legível, fica a legível", () => {
    expect(medidasDosAtributos(med({ tipo: "3D", largura: 0, comprimento: 45, espessura: 80, unidade: "cm" }))).toEqual({ profundidadeCm: 45, alturaCm: 80 });
  });
  it("ignora os atributos de lista e usa a primeira medida", () => {
    const attrs: AtributoProduto[] = [{ atributoId: "a-cor", opcaoId: "o1" }, ...med({ tipo: "1D", dimensao: "largura", valor: 90, unidade: "cm" }), ...med({ tipo: "1D", dimensao: "largura", valor: 10, unidade: "cm" })];
    expect(medidasDosAtributos(attrs)).toEqual({ larguraCm: 90 });
  });
});

const COR: AtributoDef = { id: "a-cor", codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2, opcoes: [
  { id: "o-preto", valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1 }, { id: "o-sem", valor: "Sem", nome: "Sem amostra", hex: null, ordem: 2 }, { id: "o-mau", valor: "Mau", nome: "Mau", hex: "azul", ordem: 3 },
] };
const BRILHO: AtributoDef = { id: "a-bri", codigo: "brilho", nome: "Brilho", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: "o-fosco", valor: "FOSCO", nome: "Fosco", hex: "#111111", ordem: 1 }] };

describe("corDosAtributos: a cor (hex) da opção escolhida no atributo Cor", () => {
  it("devolve o hex da opção escolhida", () => {
    expect(corDosAtributos([{ atributoId: "a-cor", opcaoId: "o-preto", valor: "Preto" }], [BRILHO, COR])).toBe("#000000");
  });
  it("sem atributo Cor no produto, sem definição, sem hex ou com hex inválido: undefined", () => {
    expect(corDosAtributos(undefined, [COR])).toBeUndefined();
    expect(corDosAtributos([], [COR])).toBeUndefined();
    expect(corDosAtributos([{ atributoId: "a-cor", opcaoId: "o-preto" }], undefined)).toBeUndefined();
    expect(corDosAtributos([{ atributoId: "a-cor", opcaoId: "o-preto" }], [BRILHO])).toBeUndefined();
    expect(corDosAtributos([{ atributoId: "a-cor", opcaoId: "o-sem" }], [COR])).toBeUndefined();
    expect(corDosAtributos([{ atributoId: "a-cor", opcaoId: "o-mau" }], [COR])).toBeUndefined();
    expect(corDosAtributos([{ atributoId: "a-cor", opcaoId: "nao-existe" }], [COR])).toBeUndefined();
  });
  it("só o atributo com código «cor» conta: outro atributo com hex não dá cor", () => {
    expect(corDosAtributos([{ atributoId: "a-bri", opcaoId: "o-fosco" }], [COR, BRILHO])).toBeUndefined();
  });
});

describe("modeloParaPrevia: o classificador do catálogo com as medidas e a cor do formulário", () => {
  const base = { sub: undefined, no: null, arvore: [] };
  it("sem medidas, as do nome (o classificador de sempre)", () => {
    const m = modeloParaPrevia({ ...base, nome: "Espelho LED 80x70" });
    expect(m.dimensoes.larguraCm).toBe(80);
    expect(m.dimensoes.alturaCm).toBe(70);
  });
  it("as medidas completas dos atributos mandam sobre o nome", () => {
    const m = modeloParaPrevia({ ...base, nome: "Espelho LED 80x70", medidas: { larguraCm: 100, profundidadeCm: 4, alturaCm: 90 } });
    expect([m.dimensoes.larguraCm, m.dimensoes.profundidadeCm, m.dimensoes.alturaCm]).toEqual([100, 4, 90]);
  });
  it("medidas parciais: o que falta vem do classificador (nome ou omissões do tipo)", () => {
    const sem = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless" });
    const m = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless", medidas: { larguraCm: 40 } });
    expect(m.dimensoes.larguraCm).toBe(40);
    expect(m.dimensoes.profundidadeCm).toBe(sem.dimensoes.profundidadeCm);
    expect(m.dimensoes.alturaCm).toBe(sem.dimensoes.alturaCm);
  });
  it("a cor dos atributos pinta o mockup; sem cor, a do tipo", () => {
    const sem = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless" });
    const com = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless", cor: "#112233" });
    expect(com.mockup3d.cor).toBe("#112233");
    expect(sem.mockup3d.cor).not.toBe("#112233");
  });
  it("nome vazio não rebenta: cai na caixa", () => {
    expect(modeloParaPrevia({ ...base, nome: "" }).tipo).toBe("caixa");
  });
  it("a subcategoria decide o tipo quando o nome não diz", () => {
    expect(modeloParaPrevia({ nome: "Modelo X", sub: "Sanitas", no: null, arvore: [] }).tipo).toBe("sanita");
  });
});

describe("estadoDoModelo: o que a pré-visualização mostra", () => {
  it("genérico por categoria: «generico»", () => {
    expect(estadoDoModelo(modeloParaPrevia({ nome: "Sanita suspensa Rimless", no: null, arvore: [] }))).toBe("generico");
  });
  it("sem genérico nem modelo do HTML, mas com tipo próprio: «aproximado»", () => {
    expect(estadoDoModelo(modeloParaPrevia({ nome: "Lava-loiça 1 cuba inox", no: null, arvore: [] }))).toBe("aproximado");
  });
  it("sem nenhum, a caixa cinzenta: «caixa»", () => {
    expect(estadoDoModelo(modeloParaPrevia({ nome: "Parafuso", no: null, arvore: [] }))).toBe("caixa");
  });
});

describe("cenaDoProduto: um espaço mínimo com a peça ao centro", () => {
  const cena = (nome: string, medidas?: Parameters<typeof modeloParaPrevia>[0]["medidas"]) => cenaDoProduto(modeloParaPrevia({ nome, no: null, arvore: [], medidas }));
  it("tem quatro paredes fechadas (o visualizador precisa delas) e uma só peça, para o modelo dado", () => {
    const { espaco, modelos } = cena("Sanita suspensa Rimless");
    expect(espaco.paredes).toHaveLength(4);
    expect(espaco.pecas).toHaveLength(1);
    expect(espaco.aberturas).toEqual([]);
    expect(Object.keys(modelos)).toEqual([espaco.pecas[0].produtoId]);
    for (const [i, p] of espaco.paredes.entries()) expect(p.b).toEqual(espaco.paredes[(i + 1) % 4].a);
  });
  it("a peça fica no centro da divisão, com as dimensões do modelo em metros", () => {
    const { espaco } = cena("Espelho LED 80x70");
    const xs = espaco.paredes.map((p) => p.a.x), ys = espaco.paredes.map((p) => p.a.y);
    const peca = espaco.pecas[0];
    expect(peca.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2);
    expect(peca.y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2);
    expect(peca.largura).toBeCloseTo(0.8);
  });
  it("a divisão cresce com o produto e o pé-direito passa sempre o topo da peça", () => {
    const pequena = cena("Torneira Teste"), grande = cena("Roupeiro", { larguraCm: 300, profundidadeCm: 60, alturaCm: 260 });
    const lado = (c: ReturnType<typeof cena>) => Math.max(...c.espaco.paredes.map((p) => p.a.x)) - Math.min(...c.espaco.paredes.map((p) => p.a.x));
    expect(lado(grande)).toBeGreaterThan(lado(pequena));
    expect(grande.espaco.peDireito).toBeGreaterThan(2.6);
  });
  it("a câmara aponta ao meio da peça e a chave muda com as medidas (para a câmara se refazer só quando o tamanho muda)", () => {
    const a = cena("Roupeiro", { larguraCm: 100, profundidadeCm: 60, alturaCm: 200 }), b = cena("Roupeiro", { larguraCm: 100, profundidadeCm: 60, alturaCm: 200 }), c = cena("Roupeiro", { larguraCm: 120, profundidadeCm: 60, alturaCm: 200 });
    expect(a.camara.alvo[1]).toBeCloseTo(1);
    expect(a.camara.chave).toBe(b.camara.chave);
    expect(a.camara.chave).not.toBe(c.camara.chave);
    expect(a.camara.pos.every(Number.isFinite)).toBe(true);
  });
  it("uma peça de parede fica à altura de omissão e a câmara sobe com ela", () => {
    const { espaco, camara } = cena("Sanita suspensa Rimless");
    const peca = espaco.pecas[0];
    expect(peca.montagem).toBe("parede");
    expect(peca.altura).toBeGreaterThanOrEqual(0);
    expect(camara.alvo[1]).toBeGreaterThan(peca.altura);
  });
});
