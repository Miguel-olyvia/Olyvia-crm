// 26/11: o 3D da FICHA de produto usa SÓ os modelos genéricos (decisão do dono: «so usas os modelos 3D genericos»). O ponto único de decisão é PREVIA_SO_GENERICOS
// (previaProduto3d.ts): `false` repõe os modelos do HTML (lava-loiça, placa, torneira, tampo) na ficha. Os outros ecrãs (planta, Estúdio) não passam por aqui e continuam a
// usar modeloDoProduto como sempre; o último teste fixa isso.
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
import { modeloDoProduto, temModeloHtml, type NoCat } from "./catalogo3d";
import { PREVIA_SO_GENERICOS, corDosAtributos, estadoDoModelo, fotoDosAtributos, modeloParaPrevia, tipoDaPrevia } from "./previaProduto3d";
import { zonasDosAtributos } from "./zonasGlb";

const ROUND = "Misturadoras Monocomando Extraivel ROUND Acero Cobre PVD";
const VELAR = "Lava-louças VELAR 1 CUBA 50";
const PLACA = "Placa DE INDUÇÃO INDESIT";
const TAMPO = "Bancada de Cozinha CANELA ROMA 240";
const base = { no: null, arvore: [] as NoCat[] };
const ficha = (nome: string, extra: Partial<Parameters<typeof modeloParaPrevia>[0]> = {}) => modeloParaPrevia({ nome, ...base, ...extra });
const antigo = (nome: string) => modeloParaPrevia({ nome, ...base, soGenericos: false });

describe("PREVIA_SO_GENERICOS: o interruptor único", () => {
  it("está ligado: a ficha só usa genéricos", () => { expect(PREVIA_SO_GENERICOS).toBe(true); });
});

describe("a ficha deixa de usar o modelo do HTML: o produto passa para o genérico da categoria", () => {
  it.each([
    [ROUND, "torneira_cozinha", "torneira"],
    [VELAR, "lava_loica", "lava_loica"],
    [PLACA, "placa", "fogao"],
    [TAMPO, "bancada", "tampo_wc"],
  ])("«%s»: tipo %s, genérico %s, sem geometria do HTML", (nome, tipo, generico) => {
    const m = ficha(nome);
    expect(m.tipo).toBe(tipo);
    expect(estadoDoModelo(m)).toBe("generico");
    expect(m.mockup3d.generico?.id).toBe(generico);
    expect(m.mockup3d.params).toBeUndefined(); // sem `html`, sem chapa: nada que o Visualizador desenhe do HTML
    expect(temModeloHtml(m)).toBe(false);
  });
  it("antes (soGenericos: false, o interruptor desligado) estes mesmos produtos caíam no modelo do HTML", () => {
    for (const nome of [ROUND, VELAR, PLACA, TAMPO]) expect(estadoDoModelo(antigo(nome))).toBe("html");
  });
  it("o lava-loiça que o HTML não tem («aproximado» com o modelo do HTML mais parecido) também passa para o genérico", () => {
    expect(estadoDoModelo(antigo("Lava-loiça 1 cuba inox"))).toBe("aproximado");
    expect(estadoDoModelo(ficha("Lava-loiça 1 cuba inox"))).toBe("generico");
  });
  it("a torneira Round deixa de levar as medidas do HTML (44,5 × 25,2): valem as do tipo, e o tipo não muda", () => {
    expect(antigo(ROUND).dimensoes).toMatchObject({ alturaCm: 44.5 });
    expect(ficha(ROUND).dimensoes.alturaCm).not.toBe(44.5);
    expect(tipoDaPrevia({ nome: ROUND, ...base })).toBe("torneira_cozinha");
  });
});

describe("onde não há genérico fica o desenho aproximado ou a caixa", () => {
  it("um quadro (tipo próprio, sem genérico): «aproximado»", () => { expect(estadoDoModelo(ficha("Quadro 60x40"))).toBe("aproximado"); });
  it("uma porta (tipo próprio, sem genérico): «aproximado»", () => { expect(estadoDoModelo(ficha("Porta interior 80x210"))).toBe("aproximado"); });
  it("nada reconhecido: «caixa»", () => { expect(estadoDoModelo(ficha("Parafuso"))).toBe("caixa"); });
});

describe("a escolha manual de «Modelo 3D» só vale se apontar para um genérico", () => {
  it("um genérico escolhido no produto manda, como sempre", () => {
    const m = ficha("Peça X", { modelo3d: "bide" });
    expect(m.mockup3d.generico?.id).toBe("bide");
    expect(m.escolha).toEqual({ modelo: "bide", origem: "produto" });
  });
  it("«caixa» escolhida à mão continua a ser a caixa (não é um modelo detalhado)", () => {
    expect(estadoDoModelo(ficha(ROUND, { modelo3d: "caixa" }))).toBe("caixa");
  });
  it.each(["html_torneira_cozinha", "html_lava_loica", "html_placa", "html_tampo"])("«%s» escolhido no produto não se aplica na ficha: fica o que o classificador dá", (id) => {
    const m = ficha(ROUND, { modelo3d: id });
    expect(estadoDoModelo(m)).toBe("generico");
    expect(temModeloHtml(m)).toBe(false);
    expect(m.escolha).toBeUndefined();
  });
  it("um modelo do HTML escolhido na subcategoria ou na categoria também não se aplica na ficha", () => {
    const arvore: NoCat[] = [{ id: "c", n: "Torneiras", pai: null, modelo3d: "html_torneira_cozinha" }, { id: "s", n: "Misturadoras", pai: "c" }];
    const m = modeloParaPrevia({ nome: ROUND, no: "s", arvore });
    expect(temModeloHtml(m)).toBe(false);
    expect(m.escolha).toBeUndefined();
  });
  it("com o interruptor desligado, o modelo do HTML escolhido volta a valer", () => {
    expect(estadoDoModelo(modeloParaPrevia({ nome: ROUND, ...base, modelo3d: "html_torneira_cozinha", soGenericos: false }))).toBe("html");
  });
});

describe("os outros ecrãs não mudam: modeloDoProduto (a planta, o Estúdio) continua a usar o modelo do HTML", () => {
  it("sem a opção, a torneira Round é o modelo do HTML", () => {
    expect(temModeloHtml(modeloDoProduto({ id: "p", n: ROUND, no: null }))).toBe(true);
  });
  it("com a opção, é o genérico", () => {
    expect(temModeloHtml(modeloDoProduto({ id: "p", n: ROUND, no: null }, [], {}, { soGenericos: true }))).toBe(false);
  });
});

// Os valores REAIS da base (Mudelar, 26/11, lidos por SELECT): «Acabamento da cor» = Cobre (#FFBA6B, metal, acetinada; tem hex, foto e aspeto) e «Acabamento» = PVD
// (sem hex, sem metal; o atributo não tem hex, foto nem aspeto). O produto não tem valor em «Cor». O «Acabamento» sem hex NÃO tapa o cobre: a cor e o metal chegam ao 3D.
describe("a cor deste produto (valores reais): o cobre chega ao 3D e o «Acabamento» PVD não o tapa", () => {
  const defs: AtributoDef[] = [
    { id: "d-cor", codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, temFoto: true, ordem: 1, opcoes: [] },
    { id: "d-acab", codigo: "acabamento", nome: "Acabamento", tipo: "lista", temHex: false, temFoto: false, temAspeto: false, ordem: 2, opcoes: [{ id: "o-pvd", valor: "PVD", nome: "PVD", hex: null, ordem: 1 }] },
    { id: "d-acabcor", codigo: "acabamento_cor", nome: "Acabamento da cor", tipo: "lista", temHex: true, temFoto: true, temAspeto: true, ordem: 3,
      opcoes: [{ id: "o-cobre", valor: "Cobre", nome: "Cobre", hex: "#FFBA6B", ordem: 1, foto: null, metal: true, superficie: "acetinada" }] },
  ];
  const attrs: AtributoProduto[] = [{ atributoId: "d-acab", opcaoId: "o-pvd", valor: "PVD" }, { atributoId: "d-acabcor", opcaoId: "o-cobre", valor: "Cobre" }];
  it("a cor única é o hex do cobre e não há foto", () => {
    expect(corDosAtributos(attrs, defs)).toBe("#FFBA6B");
    expect(fotoDosAtributos(attrs, defs)).toBeNull();
  });
  it("todas as zonas levam o cobre, em metal acetinado, atribuído ao «Acabamento da cor» (nunca ao PVD)", () => {
    const z = zonasDosAtributos(attrs, defs);
    expect(z).toBeDefined();
    for (const zona of Object.values(z!.zonas)) expect(zona).toMatchObject({ atributo: "Acabamento da cor", hex: "#FFBA6B", metal: true, superficie: "acetinada" });
    expect(z!.porZona).toBe(false);
  });
  it("na ficha o modelo recebe essa cor (e é o genérico, que a lê; o do HTML ignorava-a)", () => {
    const m = ficha(ROUND, { cor: "#FFBA6B" });
    expect(m.mockup3d.cor).toBe("#FFBA6B");
    expect(m.mockup3d.generico?.id).toBe("torneira");
  });
});
