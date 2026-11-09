import { describe, expect, it } from "vitest";
import { BANCADA_OMISSAO, SERIES_BANCADA, acabamentosDoEquipamento, aplicarConfig, colocacao, distribuir, linhasDaBancada, modeloDaBancada, montagensPermitidas, mudarChapa, pecaBancada, selecaoChapa, trocarEquipamento, trocarLados, validarBancada } from "./bancada";
import { construirBancada } from "./modelosHtml/bancada3d";
import { deLegado } from "./ligacao";
import { retangulo } from "../planta";

describe("as chapas e a composição de exemplo (copiadas do HTML)", () => {
  it("oito séries, com os tons, acabamentos, desenhos e referências do HTML", () => {
    expect(Object.keys(SERIES_BANCADA)).toEqual(["canela-roma", "nero-ardi", "blue-roma", "camargue", "capraia", "calacata-vaglie", "jungla", "moma"]);
    expect(Object.keys(SERIES_BANCADA.jungla.tones)).toEqual(["abeto", "cipres", "iroko", "roble"]);
    expect(SERIES_BANCADA["calacata-vaglie"].tones.blanco.finishes.seda).toMatchObject({ label: "Polido Seda", roughness: 0.27, clearcoat: 0.18, refs: { A: "88CV2PA", B: "88CV2PB" } });
    expect(SERIES_BANCADA["canela-roma"].slab).toEqual([1620, 3240]);
  });
  it("a composição de exemplo é a do HTML e é válida", () => {
    expect(BANCADA_OMISSAO).toMatchObject({ length: 2400, depth: 650, sink: "velar50", hob: "ib65b60", tap: "round", mount: "under", sinkX: 650, hobX: 1800, upstand: 40, book: "A", direction: 0, textureOffset: 45 });
    expect(validarBancada(BANCADA_OMISSAO)).toBe("");
    expect(selecaoChapa(BANCADA_OMISSAO).finish?.refs.A).toBe("88C772A");
  });
  it("mudar de série cai no primeiro tom, acabamento e desenho que existem", () => {
    expect(mudarChapa(BANCADA_OMISSAO, "series", "jungla")).toMatchObject({ series: "jungla", tone: "abeto", surface: "escovado", book: "A" });
    expect(mudarChapa(BANCADA_OMISSAO, "series", "nao-existe")).toBe(BANCADA_OMISSAO);
  });
});

describe("regras do compositor (as do HTML)", () => {
  it("montagem: Duo só por baixo; Keran, as de escorredor e a Ambar 57 só por cima; as outras as duas", () => {
    expect(montagensPermitidas("duo60")).toEqual(["under"]);
    expect(montagensPermitidas("keran100")).toEqual(["top"]);
    expect(montagensPermitidas("ambar86")).toEqual(["top"]);
    expect(montagensPermitidas("ambar57")).toEqual(["top"]);
    expect(montagensPermitidas("velar50")).toEqual(["under", "top"]);
  });
  it("recortes: lava-loiça a 65 cm da esquerda, placa a 180 cm, torneira 7 cm atrás", () => {
    const p = colocacao(BANCADA_OMISSAO)!;
    expect([p.sx, p.hx, p.sz, p.tx, p.tz]).toEqual([-550, 600, 25, -550, -255]);
    expect(p.holes).toHaveLength(3);
  });
  it("as mensagens do HTML quando a composição não serve", () => {
    expect(validarBancada({ ...BANCADA_OMISSAO, length: 1500 })).toMatch(/entre 160 e 320 cm/);
    expect(validarBancada({ ...BANCADA_OMISSAO, hobX: 900 })).toMatch(/Afasta o lava-loiça e a placa/);
    expect(validarBancada({ ...BANCADA_OMISSAO, sinkX: 100 })).toMatch(/5 cm entre os recortes/);
    expect(validarBancada({ ...BANCADA_OMISSAO, sink: "keran100" })).toMatch(/montagem não está prevista/);
    expect(validarBancada({ ...BANCADA_OMISSAO, tapFinish: "inexistente" })).toMatch(/acabamento disponível/);
  });
  it("Distribuir e Trocar lados dão composições válidas", () => {
    const d = distribuir({ ...BANCADA_OMISSAO, sinkX: 900, hobX: 1300 });
    expect(validarBancada(d)).toBe("");
    const t = trocarLados(BANCADA_OMISSAO);
    expect(t.sinkX).toBeGreaterThan(t.hobX);
    expect(validarBancada(t)).toBe("");
  });
  it("trocar o lava-loiça para um Keran passa a montagem por cima e alarga a bancada se for preciso", () => {
    const k = trocarEquipamento(BANCADA_OMISSAO, "sink", "keran116");
    expect(k.mount).toBe("top");
    expect(validarBancada(k)).toBe("");
    expect(acabamentosDoEquipamento("tap", "round").map((a) => a.id)).toContain("oro");
  });
});

describe("a bancada como peça da planta, no 3D e na venda", () => {
  it("a peça tem o comprimento e a profundidade da composição, e muda com ela mantendo o centro", () => {
    const p = pecaBancada("b1", { x: 40, y: 0 });
    expect(p).toMatchObject({ w: 240, h: 65, banc: BANCADA_OMISSAO });
    const q = aplicarConfig(p, { ...BANCADA_OMISSAO, length: 3000 });
    expect([q.w, q.x + q.w / 2]).toEqual([300, 160]);
  });
  it("o 3D recebe a composição inteira (o produto é a bancada, com os seus parâmetros)", () => {
    const r = deLegado({ o: { x: 0, y: 0 }, paredes: retangulo(400, 300), pecas: [pecaBancada("b1", { x: 40, y: 0 })] }, { tipo: "cozinha", nome: "C", peDireito: 2.6, produtos: {} });
    expect(r.ok && r.modelos["bancada|b1"].mockup3d.params).toMatchObject({ k: "bancada", cfg: { sink: "velar50" } });
    expect(modeloDaBancada("b1", BANCADA_OMISSAO).mockup3d.altura).toBeCloseTo(0.94, 3);
  });
  it("a geometria: chapa furada, rodatampo, os três equipamentos detalhados e os móveis", () => {
    const b = construirBancada(BANCADA_OMISSAO, null)!;
    const nomes = b.grupo.children.map((o) => o.name);
    expect(nomes.slice(0, 7)).toEqual(["Bancada · 12 mm · recortes abertos", "Rodatampo · traseiro · 40 mm", "Rodatampo · esquerdo · 40 mm", "Rodatampo · direito · 40 mm", "Frasa Velar 50 U/F", "Indesit IB 65B60 NE", "GME IO Round Extraível"]);
    expect(b.grupo.position.y).toBe(900);
    b.libertar();
  });
  it("as linhas de venda: a chapa com a referência do fabricante, e cada equipamento com SKU e preço", () => {
    const l = linhasDaBancada(BANCADA_OMISSAO);
    expect(l[0].nome).toMatch(/Canela Roma · Beige · Natural · acetinado · Book A · 240 × 65 cm · rodatampo 4 cm/);
    expect(l.slice(1).map((x) => x.sku)).toEqual(["FS200262-IX", "IND-IB65B60-NE", "GME-RND-AC", "MOV-BASE-BL"]);
  });
});
