// 23/11: a altura da sanita de chão COM depósito. A receita genérica `sanita` (categoriasGlb.ts) usa a altura h do produto como altura TOTAL:
// o assento fica em min(0.4, h) e o depósito ocupa de aí até h (no mínimo 10 cm). Um produto cujo nome, medida ou atributo traz uma altura de ~40-50 cm
// (a altura do assento ou da taça, não a total) dava um depósito achatado de 10 cm e, abaixo de 40 cm, a taça inteira encolhia. O dono viu os dois
// resultados do mesmo modelo: depósito alto (78 cm de omissão) e depósito baixo e achatado.
// Regra (uma só função, `alturaDeSanitaDeChao`, em catalogo3d.ts): sanita de chão COM depósito (a omissão da opção `deposito`: a BTW sem a palavra
// depósito NÃO conta) com altura vinda do produto abaixo de 60 cm passa a 78 cm; de 60 cm para cima mantém-se; BTW sem depósito e sanita suspensa não mudam.
// As TRÊS vias dão o mesmo: a planta e o catálogo (modeloDoProduto) e a pré-visualização do formulário (dimensoesDaMedida + modeloParaPrevia).
// Os nomes reais vêm do quadro (vault/ficheiros/produtos-servicos/quadro-subcategoria-modelo-generico.csv, «Loiças Sanitárias;Sanitas»: 38 produtos, todos
// sem medida nos atributos e sem medida no nome, por isso hoje já ficam com a omissão de 78 cm: a regra não os altera). O que está gravado numa peça
// (`opc.gen`: só as opções) não leva altura: a altura vem sempre do modelo, recalculado a partir do produto.
import { describe, expect, it } from "vitest";
import {
  ALTURA_MIN_SANITA_COM_DEPOSITO_CM, ALTURA_SANITA_COM_DEPOSITO_CM, ESPEC, alturaDeSanitaDeChao, extrairDimensoes, modeloDoProduto, tipoMockupDe, type ProdutoCat,
} from "./catalogo3d";
import { CATEGORIAS_GLB } from "./categoriasGlb";
import { dimensoesDaMedida, modeloParaPrevia } from "./previaProduto3d";

const prod = (n: string, extra: Partial<ProdutoCat> = {}): ProdutoCat => ({ id: "x", n, no: null, sub: "Sanitas", ...extra });
const alturaCm = (p: ProdutoCat) => modeloDoProduto(p).dimensoes.alturaCm;
const receita = CATEGORIAS_GLB.find((c) => c.id === "sanita")!;
/** Onde a receita põe uma parte, para a altura h (m) e as opções dadas. */
const parte = (nome: string, h: number, o: Record<string, string | boolean> = { deposito: true }) => {
  const pt = receita.partes.find((x) => x.nome === nome)!;
  return pt.colocar({ w: 0.37, d: 0.65, h, o });
};

describe("a constante e a omissão", () => {
  it("o limite é 60 cm e a altura-padrão 78 cm, a mesma da tabela de omissões do tipo", () => {
    expect(ALTURA_MIN_SANITA_COM_DEPOSITO_CM).toBe(60);
    expect(ALTURA_SANITA_COM_DEPOSITO_CM).toBe(78);
    expect(ESPEC.sanita.dim[2]).toBe(ALTURA_SANITA_COM_DEPOSITO_CM);
  });
});

describe("alturaDeSanitaDeChao: a função única", () => {
  it("sanita de chão com depósito abaixo de 60 cm passa a 78", () => {
    expect(alturaDeSanitaDeChao("sanita", "Sanita Roca", 45)).toBe(78);
    expect(alturaDeSanitaDeChao("sanita", "Sanita Roca", 30)).toBe(78);
    expect(alturaDeSanitaDeChao("sanita", "Sanita Roca", 59.9)).toBe(78);
  });
  it("de 60 cm para cima mantém-se", () => {
    expect(alturaDeSanitaDeChao("sanita", "Sanita Roca", 60)).toBe(60);
    expect(alturaDeSanitaDeChao("sanita", "Sanita Roca", 80)).toBe(80);
    expect(alturaDeSanitaDeChao("sanita", "Sanita Roca", 95)).toBe(95);
  });
  it("a BTW sem a palavra depósito não conta como com depósito; com a palavra, conta", () => {
    expect(alturaDeSanitaDeChao("sanita", "SANITA MAX BTW BRANCO BRILHO", 45)).toBe(45);
    expect(alturaDeSanitaDeChao("sanita", "Sanita Back to Wall", 45)).toBe(45);
    expect(alturaDeSanitaDeChao("sanita", "Sanita BTW com depósito", 45)).toBe(78);
    expect(alturaDeSanitaDeChao("sanita", "Sanita BTW com cisterna", 45)).toBe(78);
  });
  it("os outros tipos não mudam, nem a suspensa", () => {
    expect(alturaDeSanitaDeChao("sanita_suspensa", "Sanita suspensa", 40)).toBe(40);
    expect(alturaDeSanitaDeChao("bide", "Bidé", 40)).toBe(40);
    expect(alturaDeSanitaDeChao("movel", "Móvel", 45)).toBe(45);
  });
});

describe("planta e catálogo (modeloDoProduto)", () => {
  it("altura de 45 cm no nome, com depósito: 78 (as outras duas dimensões ficam)", () => {
    expect(modeloDoProduto(prod("Sanita Roca 38x66x45")).dimensoes).toEqual({ larguraCm: 38, profundidadeCm: 66, alturaCm: 78, deNome: true });
  });
  it("altura de 30 cm: 78", () => {
    expect(alturaCm(prod("Sanita Roca 38x66x30"))).toBe(78);
  });
  it("altura de 80 cm: fica 80; de 60 cm: fica 60", () => {
    expect(alturaCm(prod("Sanita Roca 38x66x80"))).toBe(80);
    expect(alturaCm(prod("Sanita Roca 38x66x60"))).toBe(60);
  });
  it("BTW sem depósito com 45 cm: fica 45", () => {
    expect(alturaCm(prod("SANITA MAX BTW 38x66x45"))).toBe(45);
  });
  it("sanita suspensa não muda", () => {
    const m = modeloDoProduto(prod("SANITA FLY SUSPENSO PRETO MATE 36x53x45"));
    expect(m.tipo).toBe("sanita_suspensa");
    expect(m.dimensoes.alturaCm).toBe(45);
  });
  it("a medida que o produto traz em `dim` (o que a pré-visualização e os demos usam) também se corrige", () => {
    expect(alturaCm(prod("Sanita Roca", { dim: [37, 65, 45] }))).toBe(78);
    expect(alturaCm(prod("Sanita BTW", { dim: [37, 65, 45] }))).toBe(45);
    expect(alturaCm(prod("Sanita Roca", { dim: [37, 65, 80] }))).toBe(80);
  });
  it("sem altura no nome (os nomes do quadro) continua a omissão de 78, e dois números no nome não mexem na profundidade", () => {
    for (const n of ["SANITA MAX BTW BRANCO BRILHO", "SANITA GLAMIC", "Sanita Roca"]) expect(alturaCm(prod(n))).toBe(78);
    expect(modeloDoProduto(prod("Sanita Roca 38x66")).dimensoes).toMatchObject({ larguraCm: 38, profundidadeCm: 66, alturaCm: 78 });
  });
  it("extrairDimensoes (a leitura do nome) dá o mesmo que o modelo", () => {
    expect(extrairDimensoes("Sanita Roca 38x66x45", "sanita")).toMatchObject({ larguraCm: 38, profundidadeCm: 66, alturaCm: 78 });
    expect(extrairDimensoes("Sanita BTW 38x66x45", "sanita")).toMatchObject({ alturaCm: 45 });
    expect(extrairDimensoes("Sanita suspensa 36x53x45", "sanita_suspensa")).toMatchObject({ alturaCm: 45 });
  });
  it("o mockup guarda a mesma altura, em metros, e a opção do depósito continua a vir do nome", () => {
    const m = modeloDoProduto(prod("Sanita Roca 38x66x45"));
    expect(m.mockup3d.altura).toBeCloseTo(0.78, 5);
    expect(m.mockup3d.generico).toEqual({ id: "sanita", o: { deposito: true } });
    expect(modeloDoProduto(prod("SANITA MAX BTW 38x66x45")).mockup3d.generico?.o.deposito).toBe(false);
  });
});

describe("a receita: taça e depósito coerentes com 78 cm", () => {
  it("com h = 0,78 a taça fica à altura do assento (0,4) e o depósito vai de aí ao topo (0,78)", () => {
    const h = modeloDoProduto(prod("Sanita Roca 38x66x45")).mockup3d.altura;
    const cuvete = parte("cuvete", h), assento = parte("assento", h), dep = parte("deposito", h);
    expect(cuvete.pos[1]).toBeCloseTo(0.32, 5);
    expect(assento.pos[1]).toBeCloseTo(0.41, 5);
    expect(dep.esc[1]).toBeCloseTo(0.38, 5);
    expect(dep.pos[1] + dep.esc[1] / 2).toBeCloseTo(0.78, 5);
  });
  it("sem a correcção, com h = 0,45 o depósito era uma tira de 10 cm (o que o dono viu), e abaixo de 0,40 a taça encolhia", () => {
    expect(parte("deposito", 0.45).esc[1]).toBeCloseTo(0.1, 5);
    expect(parte("cuvete", 0.3).pos[1]).toBeCloseTo(0.22, 5);
  });
});

describe("pré-visualização do formulário: o conversor e o classificador concordam", () => {
  const medida = { largura: 37, comprimento: 65, espessura: 45 };
  it("dimensoesDaMedida com o nome corrige como o classificador", () => {
    expect(dimensoesDaMedida("sanita", medida, "Sanita Roca")).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 78 });
    expect(dimensoesDaMedida("sanita", { ...medida, espessura: 80 }, "Sanita Roca")).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 80 });
    expect(dimensoesDaMedida("sanita", medida, "SANITA MAX BTW")).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 45 });
    expect(dimensoesDaMedida("sanita_suspensa", medida, "Sanita suspensa")).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 45 });
  });
  it("a altura 1D (atributo «altura») também se corrige; sem altura, nada se acrescenta", () => {
    expect(dimensoesDaMedida("sanita", { altura: 40 }, "Sanita Roca")).toEqual({ alturaCm: 78 });
    expect(dimensoesDaMedida("sanita", { largura: 40, comprimento: 55 }, "Sanita Roca")).toEqual({ larguraCm: 40, profundidadeCm: 55 });
  });
  it("sem o nome (quem não o sabe) o conversor devolve a medida tal como vem", () => {
    expect(dimensoesDaMedida("sanita", medida)).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 45 });
  });
  it("modeloParaPrevia dá as mesmas dimensões que o catálogo com a mesma medida e o mesmo nome", () => {
    const previa = modeloParaPrevia({ nome: "Sanita Roca", sub: "Sanitas", no: null, arvore: [], medida });
    const catalogo = modeloDoProduto(prod("Sanita Roca"), [], {});
    const doNome = modeloDoProduto(prod("Sanita Roca 37x65x45"));
    expect(previa.dimensoes.alturaCm).toBe(78);
    expect(previa.dimensoes).toMatchObject({ larguraCm: 37, profundidadeCm: 65 });
    expect(previa.dimensoes.alturaCm).toBe(catalogo.dimensoes.alturaCm);
    expect(previa.dimensoes.alturaCm).toBe(doNome.dimensoes.alturaCm);
    expect(previa.mockup3d.altura).toBeCloseTo(0.78, 5);
  });
  it("na pré-visualização a BTW sem depósito e a suspensa ficam como vêm", () => {
    expect(modeloParaPrevia({ nome: "SANITA MAX BTW", sub: "Sanitas", no: null, arvore: [], medida }).dimensoes.alturaCm).toBe(45);
    const susp = modeloParaPrevia({ nome: "Sanita suspensa", sub: "Sanitas", no: null, arvore: [], medida });
    expect(tipoMockupDe(prod("Sanita suspensa"))).toBe("sanita_suspensa");
    expect(susp.dimensoes.alturaCm).toBe(45);
  });
  it("uma medida de 80 cm na pré-visualização mantém-se", () => {
    expect(modeloParaPrevia({ nome: "Sanita Roca", sub: "Sanitas", no: null, arvore: [], medida: { ...medida, espessura: 80 } }).dimensoes.alturaCm).toBe(80);
  });
});
