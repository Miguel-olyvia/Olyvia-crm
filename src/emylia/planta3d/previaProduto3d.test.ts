// 23/11: a pré-visualização 3D de um produto no formulário de criar e na ficha: o conversor das medidas e da cor dos atributos (a medida reparte-se por
// largura, profundidade e altura conforme o TIPO, como o classificador faz com o nome), o estado do modelo (3D do HTML, genérico, aproximado ou caixa)
// e a cena mínima (um espaço pequeno com a peça ao centro). Aqui não há mocks: é a lógica real; o desenho em WebGL só se verifica ao vivo.
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
import { cenaDoProduto, corDosAtributos, dimensoesDaMedida, estadoDoModelo, medidaDosAtributos, modeloParaPrevia, type MedidaCm } from "./previaProduto3d";

const med = (m: AtributoProduto["medida"]): AtributoProduto[] => [{ atributoId: "a-med", medida: m }];

describe("medidaDosAtributos: a medida do produto em centímetros, como está nos atributos", () => {
  it("2D em cm: largura e comprimento", () => {
    expect(medidaDosAtributos(med({ tipo: "2D", largura: 60, comprimento: 45, espessura: null, unidade: "cm" }))).toEqual({ largura: 60, comprimento: 45 });
  });
  it("3D em mm passa a cm e leva a espessura", () => {
    expect(medidaDosAtributos(med({ tipo: "3D", largura: 600, comprimento: 450, espessura: 800, unidade: "mm" }))).toEqual({ largura: 60, comprimento: 45, espessura: 80 });
  });
  it("um intervalo usa o limite superior (`ate`)", () => {
    expect(medidaDosAtributos(med({ tipo: "2D", largura: { de: 50, ate: 70 }, comprimento: { de: 30, ate: 40 }, espessura: null, unidade: "cm" }))).toEqual({ largura: 70, comprimento: 40 });
  });
  it("um intervalo em mm também passa a cm", () => {
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: { de: 500, ate: 800 }, unidade: "mm" }))).toEqual({ largura: 80 });
  });
  it("1D: a largura (ou o comprimento) dá a largura; a altura dá a altura; a espessura não diz nada", () => {
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 80, unidade: "cm" }))).toEqual({ largura: 80 });
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "comprimento", valor: 120, unidade: "cm" }))).toEqual({ largura: 120 });
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "altura", valor: 200, unidade: "cm" }))).toEqual({ altura: 200 });
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "espessura", valor: 20, unidade: "cm" }))).toBeNull();
  });
  it("arredonda ao milímetro (uma casa decimal em cm)", () => {
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 87.5, unidade: "mm" }))).toEqual({ largura: 8.8 });
  });
  it("só conta o que um produto do catálogo pode medir: de 5 a 400 cm (os limites do nome)", () => {
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 5, unidade: "cm" }))).toEqual({ largura: 5 });
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 400, unidade: "cm" }))).toEqual({ largura: 400 });
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 4.9, unidade: "cm" }))).toBeNull();
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 401, unidade: "cm" }))).toBeNull();
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 30, unidade: "mm" }))).toBeNull(); // 3 cm
  });
  it("sem medida legível devolve null: sem atributos, vazios, sem medida, zero, negativo, NaN ou fora do possível", () => {
    expect(medidaDosAtributos(undefined)).toBeNull();
    expect(medidaDosAtributos([])).toBeNull();
    expect(medidaDosAtributos([{ atributoId: "a-cor", opcaoId: "o1", valor: "Preto" }])).toBeNull();
    expect(medidaDosAtributos(med({ tipo: "2D", largura: 0, comprimento: -5, espessura: null, unidade: "cm" }))).toBeNull();
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: Number.NaN, unidade: "cm" }))).toBeNull();
    expect(medidaDosAtributos(med({ tipo: "1D", dimensao: "largura", valor: 5000, unidade: "cm" }))).toBeNull();
  });
  it("com uma dimensão ilegível e outra legível, fica a legível", () => {
    expect(medidaDosAtributos(med({ tipo: "3D", largura: 0, comprimento: 45, espessura: 80, unidade: "cm" }))).toEqual({ comprimento: 45, espessura: 80 });
  });
  it("ignora os atributos de lista e usa a primeira medida", () => {
    const attrs: AtributoProduto[] = [{ atributoId: "a-cor", opcaoId: "o1" }, ...med({ tipo: "1D", dimensao: "largura", valor: 90, unidade: "cm" }), ...med({ tipo: "1D", dimensao: "largura", valor: 10, unidade: "cm" })];
    expect(medidaDosAtributos(attrs)).toEqual({ largura: 90 });
  });
});

describe("dimensoesDaMedida: a medida reparte-se por largura, profundidade e altura conforme o tipo (como o classificador faz com o nome)", () => {
  it("um tipo comum: largura × comprimento (profundidade) × espessura (altura)", () => {
    expect(dimensoesDaMedida("sanita", { largura: 40, comprimento: 55, espessura: 42 })).toEqual({ larguraCm: 40, profundidadeCm: 55, alturaCm: 42 });
    expect(dimensoesDaMedida("sanita", { largura: 40, comprimento: 55 })).toEqual({ larguraCm: 40, profundidadeCm: 55 });
  });
  it("banheira e base de duche: o maior é a largura e o menor a profundidade, em qualquer ordem; a espessura é a altura", () => {
    expect(dimensoesDaMedida("banheira", { largura: 70, comprimento: 170 })).toEqual({ larguraCm: 170, profundidadeCm: 70 });
    expect(dimensoesDaMedida("banheira", { largura: 170, comprimento: 70 })).toEqual({ larguraCm: 170, profundidadeCm: 70 });
    expect(dimensoesDaMedida("banheira", { largura: 70, comprimento: 170, espessura: 55 })).toEqual({ larguraCm: 170, profundidadeCm: 70, alturaCm: 55 });
    expect(dimensoesDaMedida("base_duche", { largura: 80, comprimento: 120 })).toEqual({ larguraCm: 120, profundidadeCm: 80 });
  });
  it("banheira com uma só dimensão: fica a largura", () => {
    expect(dimensoesDaMedida("banheira", { largura: 70 })).toEqual({ larguraCm: 70 });
    expect(dimensoesDaMedida("banheira", { largura: 170 })).toEqual({ larguraCm: 170 });
  });
  it("resguardo, espelho, quadro, radiador, toalheiro e roupeiro: o comprimento é a altura e a espessura a profundidade", () => {
    expect(dimensoesDaMedida("resguardo", { largura: 80, comprimento: 195 })).toEqual({ larguraCm: 80, alturaCm: 195 });
    expect(dimensoesDaMedida("espelho", { largura: 80, comprimento: 70, espessura: 6 })).toEqual({ larguraCm: 80, alturaCm: 70, profundidadeCm: 6 });
    for (const t of ["quadro", "radiador", "toalheiro", "roupeiro"] as const) expect(dimensoesDaMedida(t, { largura: 50, comprimento: 120 })).toEqual({ larguraCm: 50, alturaCm: 120 });
  });
  it("a altura de um 1D vai para a altura em qualquer tipo", () => {
    expect(dimensoesDaMedida("roupeiro", { altura: 200 })).toEqual({ alturaCm: 200 });
    expect(dimensoesDaMedida("banheira", { altura: 55 })).toEqual({ alturaCm: 55 });
    expect(dimensoesDaMedida("sanita", { altura: 40 })).toEqual({ alturaCm: 40 });
  });
  it("sem nada que servir devolve null", () => {
    expect(dimensoesDaMedida("sanita", {})).toBeNull();
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

describe("modeloParaPrevia: o classificador do catálogo com a medida e a cor do formulário", () => {
  const base = { sub: undefined, no: null, arvore: [] };
  const d = (m: ReturnType<typeof modeloParaPrevia>) => [m.dimensoes.larguraCm, m.dimensoes.profundidadeCm, m.dimensoes.alturaCm];
  it("sem medida, as do nome (o classificador de sempre)", () => {
    const m = modeloParaPrevia({ ...base, nome: "Espelho LED 80x70" });
    expect(m.dimensoes.larguraCm).toBe(80);
    expect(m.dimensoes.alturaCm).toBe(70);
  });
  it("a medida completa dos atributos manda sobre o nome", () => {
    const m = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless 99x99x99", medida: { largura: 40, comprimento: 55, espessura: 42 } });
    expect(d(m)).toEqual([40, 55, 42]);
  });
  it("espelho: a medida largura × comprimento × espessura dá largura × altura × profundidade, e não a espessura como altura", () => {
    const m = modeloParaPrevia({ ...base, nome: "Espelho LED 80x70", medida: { largura: 100, comprimento: 90, espessura: 6 } });
    expect(m.tipo).toBe("espelho");
    expect(d(m)).toEqual([100, 6, 90]);
  });
  it("banheira 2D 70 × 170: a largura é o maior e a profundidade o menor", () => {
    const m = modeloParaPrevia({ ...base, nome: "Banheira Oval", medida: { largura: 70, comprimento: 170 } });
    expect(m.tipo).toBe("banheira");
    expect(m.dimensoes.larguraCm).toBe(170);
    expect(m.dimensoes.profundidadeCm).toBe(70);
  });
  it("resguardo 2D 80 × 195: 195 é a altura, e a profundidade fica a do tipo", () => {
    const sem = modeloParaPrevia({ ...base, nome: "Resguardo de duche" });
    const m = modeloParaPrevia({ ...base, nome: "Resguardo de duche", medida: { largura: 80, comprimento: 195 } });
    expect(m.tipo).toBe("resguardo");
    expect(m.dimensoes.larguraCm).toBe(80);
    expect(m.dimensoes.alturaCm).toBe(195);
    expect(m.dimensoes.profundidadeCm).toBe(sem.dimensoes.profundidadeCm);
  });
  it("medida parcial: o que falta vem do classificador (nome ou omissões do tipo)", () => {
    const sem = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless" });
    const m = modeloParaPrevia({ ...base, nome: "Sanita suspensa Rimless", medida: { largura: 40 } });
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
  const cena = (nome: string, medida?: MedidaCm) => cenaDoProduto(modeloParaPrevia({ nome, no: null, arvore: [], medida }));
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
    const pequena = cena("Torneira Teste"), grande = cena("Roupeiro", { largura: 300, comprimento: 260 });
    const lado = (c: ReturnType<typeof cena>) => Math.max(...c.espaco.paredes.map((p) => p.a.x)) - Math.min(...c.espaco.paredes.map((p) => p.a.x));
    expect(lado(grande)).toBeGreaterThan(lado(pequena));
    expect(grande.espaco.peDireito).toBeGreaterThan(2.6);
  });
  it("a câmara aponta ao meio da peça e a chave muda com as medidas (para a câmara se refazer só quando o tamanho muda)", () => {
    const a = cena("Roupeiro", { largura: 100, comprimento: 200 }), b = cena("Roupeiro", { largura: 100, comprimento: 200 }), c = cena("Roupeiro", { largura: 120, comprimento: 200 });
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

// O que o Visualizador3D exige da cena (Camaras e SombraDeContacto em Visualizador3D.tsx): as paredes dão a caixa (sem elas, Math.min([]) é Infinity e a câmara,
// a sombra e a luz ficam com NaN), a câmara explícita tem de ficar entre o minDistance (0,2) e o maxDistance (maior × 4 + 6) dos controlos, e a peça cabe na divisão.
// Isto corre sem mocks, com a lógica real; o que o WebGL desenha só se vê ao vivo.
describe("cenaDoProduto cumpre as pré-condições do visualizador, sem mocks", () => {
  const CASOS: [string, MedidaCm | undefined][] = [
    ["", undefined], ["Parafuso", undefined], ["Sanita suspensa Rimless", undefined], ["Torneira Teste", { largura: 5, comprimento: 5, espessura: 5 }],
    ["Roupeiro", { largura: 400, comprimento: 400, espessura: 400 }], ["Banheira Oval", { largura: 80, comprimento: 190, espessura: 60 }], ["Espelho LED 80x70", { largura: 150, comprimento: 100, espessura: 6 }],
    ["Resguardo de duche", { largura: 90, comprimento: 200 }], ["Radiador toalheiro 50x120", undefined], ["Lava-loiça 1 cuba inox", undefined],
  ];
  it.each(CASOS)("%j", (nome, medida) => {
    const { espaco, modelos, camara } = cenaDoProduto(modeloParaPrevia({ nome, no: null, arvore: [], medida }));
    expect(espaco.paredes).toHaveLength(4);
    const xs = espaco.paredes.map((p) => p.a.x), ys = espaco.paredes.map((p) => p.a.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const maior = Math.max(x1 - x0, y1 - y0, 1);
    for (const v of [x0, x1, y0, y1, maior, espaco.peDireito, ...camara.pos, ...camara.alvo]) expect(Number.isFinite(v)).toBe(true);
    const dist = Math.hypot(camara.pos[0] - camara.alvo[0], camara.pos[1] - camara.alvo[1], camara.pos[2] - camara.alvo[2]);
    expect(dist).toBeGreaterThanOrEqual(0.2);
    expect(dist).toBeLessThanOrEqual(maior * 4 + 6);
    const peca = espaco.pecas[0], m = modelos[peca.produtoId];
    expect(m).toBeDefined();
    expect(peca.x - peca.largura / 2).toBeGreaterThanOrEqual(x0);
    expect(peca.x + peca.largura / 2).toBeLessThanOrEqual(x1);
    expect(peca.y - peca.profundidade / 2).toBeGreaterThanOrEqual(y0);
    expect(peca.y + peca.profundidade / 2).toBeLessThanOrEqual(y1);
    expect(peca.altura + m.dimensoes.alturaCm / 100).toBeLessThanOrEqual(espaco.peDireito);
    for (const v of [peca.x, peca.y, peca.largura, peca.profundidade, peca.altura, ...espaco.paredes.flatMap((p) => [p.a.x, p.a.y, p.b.x, p.b.y])]) expect(Number.isFinite(v)).toBe(true);
  });
});
