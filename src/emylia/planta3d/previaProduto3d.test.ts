// 23/11: a pré-visualização 3D de um produto no formulário de criar e na ficha: o conversor das medidas e da cor dos atributos (a medida reparte-se por
// largura, profundidade e altura conforme o TIPO, como o classificador faz com o nome), o estado do modelo (3D do HTML, genérico, aproximado ou caixa)
// e a cena mínima (um espaço pequeno com a peça ao centro). Aqui não há mocks: é a lógica real; o desenho em WebGL só se verifica ao vivo.
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
import { cenaDoProduto, corDosAtributos, dimensoesDaMedida, estadoDoModelo, fotoDosAtributos, medidaDosAtributos, modeloParaPrevia, type MedidaCm } from "./previaProduto3d";

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

// 24/11, lido na base RH (Mudelar, só leitura): nos móveis, colunas e armários o atributo 3D é largura × COMPRIMENTO = ALTURA × ESPESSURA = PROFUNDIDADE
// (Colunas, 940 produtos: comprimento 35 a 170 cm, espessura 20 a 32; Móveis de lavatório, 9496: comprimento 50 a 81, espessura 36 a 45). Nos tampos, bancadas
// e lavabos de pousar o comprimento é a profundidade e a espessura a altura (Tampos e Bancadas WC: 8 cm de espessura); nas bases, banheiras e bancadas ficam como estavam.
describe("dimensoesDaMedida: móveis, colunas e armários têm o comprimento na ALTURA e a espessura na PROFUNDIDADE", () => {
  it("a coluna suspensa AXIS 40 × 160 × 25 cm: 0,40 m de largura, 1,60 m de altura e 0,25 m de profundidade", () => {
    expect(dimensoesDaMedida("coluna", { largura: 40, comprimento: 160, espessura: 25 })).toEqual({ larguraCm: 40, alturaCm: 160, profundidadeCm: 25 });
  });
  it("o móvel de lavatório 80 × 50 × 45: 50 é a altura e 45 a profundidade", () => {
    expect(dimensoesDaMedida("movel_lavatorio", { largura: 80, comprimento: 50, espessura: 45 })).toEqual({ larguraCm: 80, alturaCm: 50, profundidadeCm: 45 });
  });
  it("armário alto, armário de espelho, coluna de duche e móvel: a mesma regra", () => {
    for (const t of ["armario_alto", "armario_espelho", "coluna_duche", "movel"] as const) {
      expect(dimensoesDaMedida(t, { largura: 60, comprimento: 70, espessura: 30 })).toEqual({ larguraCm: 60, alturaCm: 70, profundidadeCm: 30 });
    }
  });
  it("a coluna sai mais ALTA do que larga e do que funda (a medida real do dono, pelo classificador inteiro)", () => {
    const m = modeloParaPrevia({ nome: "Coluna Suspensa AXIS 40x160x25 - Corpo e Frente Artisan", sub: "Colunas", no: null, arvore: [], medida: { largura: 40, comprimento: 160, espessura: 25 } });
    expect(m.tipo).toBe("coluna");
    expect(m.dimensoes).toMatchObject({ larguraCm: 40, alturaCm: 160, profundidadeCm: 25 });
    expect(m.dimensoes.alturaCm).toBeGreaterThan(m.dimensoes.larguraCm);
    expect(m.dimensoes.alturaCm).toBeGreaterThan(m.dimensoes.profundidadeCm);
    const cena = cenaDoProduto(m).espaco.pecas[0];
    expect([cena.largura, cena.profundidade]).toEqual([0.4, 0.25]);
  });
  it("o móvel de lavatório da Mudelar (Móvel COIMBRA c/lavatório 80x50x45) sai com 50 de altura e 45 de profundidade", () => {
    const m = modeloParaPrevia({ nome: "Móvel COIMBRA c/lavatório 80x50x45", sub: "Móveis de lavatório", no: null, arvore: [], medida: { largura: 80, comprimento: 50, espessura: 45 } });
    expect(m.tipo).toBe("movel_lavatorio");
    expect([m.dimensoes.larguraCm, m.dimensoes.alturaCm, m.dimensoes.profundidadeCm]).toEqual([80, 50, 45]);
  });
  it("o que já estava certo não muda: base de duche, banheira, resguardo, e o tampo e o lavabo de pousar (comprimento = profundidade, espessura = altura)", () => {
    expect(dimensoesDaMedida("base_duche", { largura: 80, comprimento: 120, espessura: 3 })).toEqual({ larguraCm: 120, profundidadeCm: 80, alturaCm: 3 });
    expect(dimensoesDaMedida("banheira", { largura: 70, comprimento: 170, espessura: 55 })).toEqual({ larguraCm: 170, profundidadeCm: 70, alturaCm: 55 });
    expect(dimensoesDaMedida("resguardo", { largura: 80, comprimento: 195, espessura: 4 })).toEqual({ larguraCm: 80, alturaCm: 195, profundidadeCm: 4 });
    expect(dimensoesDaMedida("bancada", { largura: 80, comprimento: 46, espessura: 8 })).toEqual({ larguraCm: 80, profundidadeCm: 46, alturaCm: 8 });
    expect(dimensoesDaMedida("lavatorio", { largura: 60, comprimento: 46, espessura: 8 })).toEqual({ larguraCm: 60, profundidadeCm: 46, alturaCm: 8 });
    expect(dimensoesDaMedida("caixa", { largura: 100, comprimento: 360, espessura: 8 })).toEqual({ larguraCm: 100, profundidadeCm: 360, alturaCm: 8 });
  });
  it("sem a espessura (2D), a altura do móvel vem do comprimento e a profundidade fica a do tipo", () => {
    expect(dimensoesDaMedida("coluna", { largura: 40, comprimento: 160 })).toEqual({ larguraCm: 40, alturaCm: 160 });
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

// A foto da opção de cor: a prioridade é «Cor do corpo», depois «Cor da frente», depois «Cor» (ou o único atributo de cor); a foto é a da OPÇÃO escolhida; sem foto, sem textura.
const cor = (id: string, nome: string, opcoes: { id: string; foto?: string | null; hex?: string | null }[], extra: Partial<AtributoDef> = {}): AtributoDef =>
  ({ id, codigo: nome.toLowerCase().replace(/ /g, "_"), nome, tipo: "lista", temHex: true, ordem: 1, opcoes: opcoes.map((o, i) => ({ id: o.id, valor: o.id, nome: o.id, hex: o.hex ?? null, foto: o.foto ?? null, ordem: i })), ...extra });
const escolha = (atributoId: string, opcaoId: string): AtributoProduto => ({ atributoId, opcaoId });
const NOGAL = "org/nogal.webp", ARTISAN = "org/artisan.webp", FRENTE = "org/frente.webp";

describe("fotoDosAtributos: o caminho da foto da opção de cor escolhida (corpo > frente > cor)", () => {
  const corpo = cor("a-corpo", "Cor do corpo", [{ id: "o-artisan", foto: ARTISAN }, { id: "o-liso", foto: null, hex: "#fff" }]);
  const frente = cor("a-frente", "Cor da frente", [{ id: "o-frente", foto: FRENTE }]);
  const simples = cor("a-cor", "Cor", [{ id: "o-nogal", foto: NOGAL }]);
  it("um só atributo «Cor», com a opção Nogal que tem foto: dá a foto do Nogal (o Revestimento Porcelânico Sajónia Nogal)", () => {
    expect(fotoDosAtributos([escolha("a-cor", "o-nogal")], [simples])).toBe(NOGAL);
  });
  it("o corpo tem prioridade sobre a frente e sobre a cor", () => {
    expect(fotoDosAtributos([escolha("a-cor", "o-nogal"), escolha("a-frente", "o-frente"), escolha("a-corpo", "o-artisan")], [simples, frente, corpo])).toBe(ARTISAN);
  });
  it("sem corpo escolhido, a frente tem prioridade sobre a cor", () => {
    expect(fotoDosAtributos([escolha("a-cor", "o-nogal"), escolha("a-frente", "o-frente")], [simples, frente, corpo])).toBe(FRENTE);
  });
  it("o atributo de prioridade mais alta que tem opção escolhida manda, mesmo que a opção não tenha foto (continua a cor, não vai buscar a foto de outro atributo)", () => {
    expect(fotoDosAtributos([escolha("a-corpo", "o-liso"), escolha("a-cor", "o-nogal")], [simples, corpo])).toBeNull();
  });
  it("sem foto na opção, sem atributos, sem escolha, sem definições ou opção que não existe: null", () => {
    expect(fotoDosAtributos([escolha("a-corpo", "o-liso")], [corpo])).toBeNull();
    expect(fotoDosAtributos(undefined, [simples])).toBeNull();
    expect(fotoDosAtributos([], [simples])).toBeNull();
    expect(fotoDosAtributos([escolha("a-cor", "o-nogal")], undefined)).toBeNull();
    expect(fotoDosAtributos([{ atributoId: "a-cor" }], [simples])).toBeNull();
    expect(fotoDosAtributos([escolha("a-cor", "nao-existe")], [simples])).toBeNull();
  });
  it("sem atributo com o nome «Cor», o único atributo de cor (com hex ou foto) conta; vários sem nome certo: null (não se adivinha)", () => {
    const tom = cor("a-tom", "Tonalidade", [{ id: "o-t", foto: NOGAL }]);
    const outra = cor("a-outra", "Outra cor", [{ id: "o-o", foto: ARTISAN }]);
    expect(fotoDosAtributos([escolha("a-tom", "o-t")], [tom])).toBe(NOGAL);
    expect(fotoDosAtributos([escolha("a-tom", "o-t"), escolha("a-outra", "o-o")], [tom, outra])).toBeNull();
  });
  it("um atributo que não é de cor (sem hex nem foto) nunca dá foto", () => {
    const brilho = cor("a-bri", "Brilho", [{ id: "o-b", foto: NOGAL }], { temHex: false, temFoto: false });
    expect(fotoDosAtributos([escolha("a-bri", "o-b")], [brilho])).toBeNull();
  });
  it("«Cor do corpo» e «Cor da frente» reconhecem-se sem acentos nem maiúsculas", () => {
    const c = cor("a-c", "COR DO CORPO", [{ id: "o-1", foto: ARTISAN }]);
    expect(fotoDosAtributos([escolha("a-c", "o-1")], [c])).toBe(ARTISAN);
  });
});

describe("modeloParaPrevia: o classificador do catálogo com a medida e a cor do formulário", () => {
  const base = { sub: undefined, no: null, arvore: [] };
  const d = (m: ReturnType<typeof modeloParaPrevia>) => [m.dimensoes.larguraCm, m.dimensoes.profundidadeCm, m.dimensoes.alturaCm];
  it("a textura entra no mockup3d do modelo (e a cor lisa continua lá, de base)", () => {
    const textura = { url: "https://x/nogal.webp", ladoCm: 40 };
    const m = modeloParaPrevia({ nome: "Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120", no: null, arvore: [], cor: "#aa8844", textura });
    expect(m.mockup3d.textura).toEqual(textura);
    expect(m.mockup3d.cor).toBe("#aa8844");
  });
  it("sem textura, o modelo não leva o campo (o das plantas e dos outros usos fica como estava)", () => {
    expect("textura" in modeloParaPrevia({ nome: "Coluna", no: null, arvore: [] }).mockup3d).toBe(false);
  });
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
    // 26/11: era «Lava-loiça 1 cuba inox» (tipo com o modelo do HTML mais parecido); a ficha só usa genéricos, e o lava-loiça tem o seu: passa a «generico» (previaSoGenericos.test.ts). O quadro não tem genérico.
    expect(estadoDoModelo(modeloParaPrevia({ nome: "Quadro 60x40", no: null, arvore: [] }))).toBe("aproximado");
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
  it("o zoom tem limites à medida da peça: não entra no objecto (mais que o raio) nem se afasta demais, e a câmara de partida cabe lá dentro", () => {
    for (const [nome, medida] of [["Torneira Teste", undefined], ["Roupeiro", { largura: 300, comprimento: 260 }], ["Coluna", { largura: 40, comprimento: 160, espessura: 25 }]] as [string, MedidaCm | undefined][]) {
      const { camara, modelos } = cena(nome, medida), d = Object.values(modelos)[0].dimensoes;
      const raio = Math.hypot(d.larguraCm, d.profundidadeCm, d.alturaCm) / 200;
      const dist = Math.hypot(camara.pos[0] - camara.alvo[0], camara.pos[1] - camara.alvo[1], camara.pos[2] - camara.alvo[2]);
      expect(camara.distMin).toBeGreaterThanOrEqual(raio);
      expect(camara.distMax).toBeGreaterThan(camara.distMin);
      expect(dist).toBeGreaterThanOrEqual(camara.distMin);
      expect(dist).toBeLessThanOrEqual(camara.distMax);
      expect(camara.distMax).toBeLessThanOrEqual(dist * 3 + 0.001); // não se afasta demais: no máximo umas 3 vezes a distância de partida
    }
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
