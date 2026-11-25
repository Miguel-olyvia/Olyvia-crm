// 24/11/2026 (Rúben, contrato MD 1600, Enigma da Avenida, cliente empresa): o IVA a 0% por linha (a autoliquidação), além de 6% e 23%.
// A proposta real P-2026-1081 tem todas as linhas a «IVA 0 %», o total igual ao subtotal (7 437,48 €) e a menção «IVA AUTOLIQUIDAÇÃO».
import { beforeEach, describe, expect, it } from "vitest";
import { MENCAO_AUTOLIQUIDACAO, acoes, ivaDaLinha, ivaPadraoDaLinha, linhaCalc, partesPorTaxa, seed, taxaIvaDe, totaisIva, type Estado } from "./motor";
import { textoIvaPorTaxa, totaisLinhas, type LinhaAdenda } from "./adendas";
import { textoPrecoContrato } from "./DocsCliente";
import { adendaDeLinhas, adendaParaLinhas, deLinhas, ivaDaLinhaLida, paraLinhas } from "./real/negocioReal";
import { ligarCatalogo } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";

function preparar() {
  const S: Estado = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1031)!;
  d.orc!.enviada = null;
  return { S, A, d };
}
beforeEach(() => { localStorage.clear(); ligarCatalogo(() => catalogo0()); });

describe("a taxa 0% numa linha", () => {
  it("escrita na linha, manda (antes, `if (l.iva)` deitava o 0 fora e a linha voltava aos 6% ou 23%)", () => {
    const { S, A, d } = preparar();
    const iS = d.orc!.linhas.findIndex((l) => l.t === "svc");
    A.ivaLinha(d.id, iS, 0);
    expect(d.orc!.linhas[iS].iva).toBe(0);
    expect(ivaDaLinha(d.orc!.linhas[iS], S)).toBe(0);
    A.ivaLinha(d.id, iS, null);
    expect(ivaDaLinha(d.orc!.linhas[iS], S)).toBe(6);
  });

  it("o orçamento todo a 0%: o total com IVA é o sem IVA, e o IVA é zero; repor volta cada linha à sua taxa", () => {
    const { S, A, d } = preparar();
    const antes = totaisIva(d, S);
    expect(antes.iva).toBeGreaterThan(0);
    A.ivaTodasLinhas(d.id, 0);
    expect(d.orc!.linhas.every((l) => ivaDaLinha(l, S) === 0)).toBe(true);
    const T = totaisIva(d, S);
    expect(T).toMatchObject({ mo: 0, mat: 0, ivaMo: 0, ivaMat: 0, iva: 0 });
    expect(T.isento).toBeCloseTo(antes.base, 6);
    expect(T.base).toBeCloseTo(antes.base, 6);
    expect(T.total).toBeCloseTo(antes.base, 6);
    A.ivaTodasLinhas(d.id, null);
    expect(totaisIva(d, S).total).toBeCloseTo(antes.total, 6);
  });

  it("uma linha a 0% no meio das outras: só ela sai do IVA; o desconto reparte-se pelas três partes", () => {
    const { S, A, d } = preparar();
    const iS = d.orc!.linhas.findIndex((l) => l.t === "svc");
    const antes = totaisIva(d, S);
    A.ivaLinha(d.id, iS, 0);
    const T = totaisIva(d, S), v = d.orc!.linhas[iS].t === "svc" ? (d.orc!.linhas[iS] as { q: number; pu: number }).q * (d.orc!.linhas[iS] as { pu: number }).pu : 0;
    expect(T.isento).toBeCloseTo(v, 6);
    expect(T.mo).toBeCloseTo(antes.mo - v, 6);
    expect(T.base).toBeCloseTo(antes.base, 6);
    expect(T.total).toBeCloseTo(antes.total - v * 0.06, 6);
    d.orc!.desconto = 10;
    const D = totaisIva(d, S);
    expect(D.isento).toBeCloseTo(v * 0.9, 6);
    expect(D.base).toBeCloseTo(D.mo + D.mat + D.isento, 6);
  });

  it("com a proposta enviada, já não se muda", () => {
    const { S, A, d } = preparar();
    d.orc!.enviada = "hoje";
    A.ivaTodasLinhas(d.id, 0);
    expect(d.orc!.linhas.some((l) => ivaDaLinha(l, S) === 0)).toBe(false);
  });
});

describe("a base: grava e lê o 0%", () => {
  it("o 0% vai em taxa_iva e volta à linha (e o 6 e o 23 continuam)", () => {
    const { S, A, d } = preparar();
    A.ivaTodasLinhas(d.id, 0);
    const atual = paraLinhas(d, new Date(), S).orcamentos.at(-1)!;
    expect(atual.linhas!.filter((l) => l.tipo !== "material_modelo").every((l) => l.taxa_iva === 0)).toBe(true);
    const volta = deLinhas(paraLinhas(d, new Date(), S));
    expect(volta.orc!.linhas.every((l) => l.iva === 0)).toBe(true);
    expect(totaisIva(volta, S).iva).toBe(0);
  });

  it("a taxa lida da base (numeric) normaliza-se; o que não é 0, 6 ou 23 não se inventa", () => {
    expect(taxaIvaDe(0)).toBe(0);
    expect(taxaIvaDe("0.00")).toBe(0);
    expect(taxaIvaDe("6.00")).toBe(6);
    expect(taxaIvaDe(23)).toBe(23);
    expect(taxaIvaDe(13)).toBeUndefined();
    expect(taxaIvaDe(null)).toBeUndefined();
    expect(taxaIvaDe("")).toBeUndefined();
    expect(ivaDaLinhaLida({ taxa_iva: 0, livre: false, descricao: "x", chave: "x" })).toEqual({ iva: 0 });
  });
});

describe("as adendas a 0%", () => {
  const linha = (pu: number, iva?: 0 | 6 | 23, extra: Partial<LinhaAdenda> = {}): LinhaAdenda => ({ sid: "x", n: "x", un: "vg", q: 1, pu, h: 0, perfil: "", ...(iva != null ? { iva } : {}), ...extra });
  it("a linha a 0% (e os materiais dela) fica sem IVA; as outras como antes", () => {
    const T = totaisLinhas([linha(100, 0, { livre: true, mats: [{ n: "Tubo", q: 2, un: "un", preco: 10 }] }), linha(50, 6), linha(10, 23)]);
    expect(T.isento).toBeCloseTo(120, 6);
    expect(T.mo).toBeCloseTo(50, 6);
    expect(T.mat).toBeCloseTo(10, 6);
    expect(T.iva).toBeCloseTo(50 * 0.06 + 10 * 0.23, 6);
    expect(T.total).toBeCloseTo(180 + 3 + 2.3, 6);
    expect(textoIvaPorTaxa(T)).toBe("50,00 € a 6% + 3,00 € de IVA · 10,00 € a 23% + 2,30 € de IVA · 120,00 € a 0% (IVA autoliquidação)");
  });
  it("a taxa 0 vai para a base e volta", () => {
    const L = [linha(100, 0), linha(50, 6)];
    const ida = adendaParaLinhas({ n: 1, motivo: "x", estado: "rascunho", linhas: L, q: "hoje" } as never, 1, () => null);
    expect(ida.versoes.at(-1)!.linhas!.map((l) => l.taxa_iva)).toEqual([0, 6]);
    expect(adendaDeLinhas(ida).linhas.map((l) => l.iva)).toEqual([0, 6]);
  });
});

describe("os textos", () => {
  it("sem nada a 0%, a cláusula do preço fica a de sempre", () => {
    const T = { mo: 100, mat: 200, isento: 0, ivaMo: 6, ivaMat: 46, base: 300, iva: 52, total: 352, prod6: 0 };
    expect(textoPrecoContrato(T)).toBe("300,00 € sem IVA: 100,00 € de mão de obra, com IVA a 6% (6,00 €), e 200,00 € de materiais, com IVA a 23% (46,00 €). Total com IVA: 352,00 €.");
  });
  it("tudo a 0% (o MD 1600): o total é o sem IVA, com a menção da autoliquidação", () => {
    const T = { mo: 0, mat: 0, isento: 7437.48, ivaMo: 0, ivaMat: 0, base: 7437.48, iva: 0, total: 7437.48, prod6: 0 };
    expect(textoPrecoContrato(T)).toBe(`7.437,48 € sem IVA: 7.437,48 € com IVA a 0%. Total com IVA: 7.437,48 €. ${MENCAO_AUTOLIQUIDACAO}`);
  });
  it("misto: só as partes com valor", () => {
    const T = { mo: 100, mat: 0, isento: 50, ivaMo: 6, ivaMat: 0, base: 150, iva: 6, total: 156, prod6: 0 };
    expect(textoPrecoContrato(T)).toBe(`150,00 € sem IVA: 100,00 € com IVA a 6% (6,00 €) e 50,00 € com IVA a 0%. Total com IVA: 156,00 €. ${MENCAO_AUTOLIQUIDACAO}`);
  });
});

// 24/11 (contrato MD 1594, P-2026-0088): todas as linhas a 6%, incluindo 46 produtos (15 057 € sem IVA). Os produtos também escolhem a taxa.
describe("produtos a 6%", () => {
  it("uma linha de produto a 6%: sai dos 23% e entra na parte a 6%, contada em prod6; repor volta aos 23%", () => {
    const { S, A, d } = preparar();
    const iM = d.orc!.linhas.findIndex((l) => l.t === "mat");
    const l = d.orc!.linhas[iM], v = linhaCalc(l, S).preco;
    expect(ivaPadraoDaLinha(l, S)).toBe(23);
    const antes = totaisIva(d, S);
    A.ivaLinha(d.id, iM, 6);
    const T = totaisIva(d, S);
    expect(T.mat).toBeCloseTo(antes.mat - v, 6);
    expect(T.mo).toBeCloseTo(antes.mo + v, 6);
    expect(T.prod6).toBeCloseTo(v, 6);
    expect(T.total).toBeCloseTo(antes.total - v * 0.17, 6);
    expect(partesPorTaxa(T)).toBe(v > 0.004);
    A.ivaLinha(d.id, iM, null);
    expect(totaisIva(d, S).total).toBeCloseTo(antes.total, 6);
  });

  it("«Pôr todas a 6%»: sem nada a 23%, o total é o sem IVA × 1,06; e grava-se e lê-se de volta", () => {
    const { S, A, d } = preparar();
    A.ivaTodasLinhas(d.id, 6);
    const T = totaisIva(d, S);
    expect(T.mat).toBe(0);
    expect(T.isento).toBe(0);
    expect(T.total).toBeCloseTo(T.base * 1.06, 6);
    const volta = deLinhas(paraLinhas(d, new Date(), S));
    expect(volta.orc!.linhas.every((l) => l.iva === 6)).toBe(true);
    expect(totaisIva(volta, S).total).toBeCloseTo(T.total, 6);
  });

  it("a cláusula do preço diz as partes pela taxa (não «mão de obra»), sem a menção da autoliquidação", () => {
    const T = { mo: 15057, mat: 0, isento: 0, ivaMo: 903.42, ivaMat: 0, base: 15057, iva: 903.42, total: 15960.42, prod6: 15057 };
    expect(textoPrecoContrato(T)).toBe("15.057,00 € sem IVA: 15.057,00 € com IVA a 6% (903,42 €). Total com IVA: 15.960,42 €.");
  });
});
