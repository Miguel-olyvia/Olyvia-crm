// 19/11/2026 (auditoria, ponto 2): o IVA das adendas por linha. Antes, totaisLinhas contava todas as linhas q × pu como mão de obra a 6%:
// a linha «Materiais e outros valores» da adenda do acerto (os produtos que as medidas mudam) ia a 6%. Agora cada linha tem a sua taxa
// (`iva`): os serviços a do orçamento (ivaDaLinha), os produtos 23%. As adendas antigas, sem `iva`, ficam como estavam.
import { describe, expect, it } from "vitest";
import { LINHAS, acoes, adendaDoAcerto, camposMedida, medida, seed, type Estado } from "./motor";
import { LINHA_ACERTO_PRODUTOS, linhaAdenda, previsaoLinha, textoIvaPorTaxa, totaisLinhas, type LinhaAdenda } from "./adendas";
import { adendaDeLinhas, adendaParaLinhas } from "./real/negocioReal";

const linha = (pu: number, iva?: 6 | 23, extra: Partial<LinhaAdenda> = {}): LinhaAdenda => ({ sid: "x", n: "x", un: "vg", q: 1, pu, h: 0, perfil: "", ...(iva ? { iva } : {}), ...extra });

describe("totaisLinhas: cada linha pela sua taxa", () => {
  it("as linhas antigas (sem iva) contam a 6%, como antes: o total dos documentos já assinados não muda", () => {
    const T = totaisLinhas([linha(100), linha(50)]);
    expect(T).toMatchObject({ mo: 150, mat: 0, base: 150 });
    expect(T.total).toBeCloseTo(159, 6);
  });
  it("uma linha a 23% soma ao IVA a 23%; a 6% ao de 6%; os materiais das linhas livres a 23%; o desconto reparte-se", () => {
    const L = [linha(100, 6), linha(200, 23), linha(50, 6, { livre: true, mats: [{ n: "Tubo", q: 2, un: "un", preco: 10 }] })];
    const T = totaisLinhas(L);
    expect(T.mo).toBeCloseTo(150, 6);
    expect(T.mat).toBeCloseTo(220, 6);
    expect(T.iva).toBeCloseTo(150 * 0.06 + 220 * 0.23, 6);
    const D = totaisLinhas(L, 10);
    expect(D.mo).toBeCloseTo(135, 6);
    expect(D.mat).toBeCloseTo(198, 6);
  });
  it("o texto do IVA por taxa mostra só as taxas que existem", () => {
    expect(textoIvaPorTaxa(totaisLinhas([linha(100, 6)]))).toBe("100,00 € a 6% + 6,00 € de IVA");
    expect(textoIvaPorTaxa(totaisLinhas([linha(100, 6), linha(100, 23)]))).toBe("100,00 € a 6% + 6,00 € de IVA · 100,00 € a 23% + 23,00 € de IVA");
  });
});

describe("a taxa nas linhas novas", () => {
  it("o serviço leva a taxa do Catálogo, como no orçamento (23% nas subempreitadas de materiais)", () => {
    const S: Estado = seed();
    const sid = Object.keys(S.svc)[0];
    expect(linhaAdenda(S, sid, 1)?.iva).toBe(6);
    expect(previsaoLinha(S, sid, 1)?.iva).toBe(6);
    S.svc[sid].iva = 23;
    expect(linhaAdenda(S, sid, 1)?.iva).toBe(23);
    expect(previsaoLinha(S, sid, 1)?.iva).toBe(23);
  });

  it("a adenda do acerto: os serviços com a taxa da proposta, a linha dos produtos a 23%", () => {
    const S: Estado = seed(), d = S.deals.find((x) => x.id === 1031)!;
    const A = acoes(S, () => {}, (fn) => fn());
    A.aceitar(d.id); S.role = "comercial"; A.enviarContrato(d.id); A.assinar(d.id);
    S.role = "financeiro"; d.fin.fatura = { n: "FT TESTE/1031", q: "hoje" }; A.validar(d.id);
    const med: Record<string, number> = {};
    for (const [k] of camposMedida(LINHAS[d.linha])) med[k] = medida(d.visita.med, k) + 3;
    S.role = "operacoes"; A.supervisorMedidas(d.id, "hn"), A.retificarMedidas(d.id, med);
    S.role = "comercial"; expect(A.adendaDoValor(d.id)).toBeTruthy();
    const a = adendaDoAcerto(d)!;
    const prods = a.linhas.find((l) => l.n.startsWith(LINHA_ACERTO_PRODUTOS))!;
    expect(prods).toMatchObject({ livre: true, iva: 23 });
    expect(a.linhas.filter((l) => !l.livre).every((l) => l.iva === 6)).toBe(true);
    // o total: os produtos a 23% (antes, tudo a 6%)
    const T = totaisLinhas(a.linhas, a.desconto), k = 1 - (a.desconto || 0) / 100;
    expect(T.mat).toBeCloseTo(prods.pu * k, 2);
    expect(T.ivaMat).toBeCloseTo(prods.pu * k * 0.23, 2);
  });
});

describe("a taxa vai e volta da base (adenda_linhas.taxa_iva)", () => {
  it("as linhas com taxa mandam taxa_iva e voltam com ela; as antigas não mandam nada e voltam sem ela", () => {
    const S: Estado = seed(), d = S.deals.find((x) => x.id === 1031)!;
    void d;
    const a = { n: "AD 2026/1031-1", estado: "rascunho" as const, criada: "19/11", motivo: "O cliente pediu", linhas: [linha(100, 23), linha(50)], enviada: null, aceite: null };
    const L = adendaParaLinhas(a, 1, () => null);
    const ls = L.versoes.at(-1)!.linhas;
    expect(ls[0].taxa_iva).toBe(23);
    expect("taxa_iva" in ls[1]).toBe(false);
    const b = adendaDeLinhas(L);
    expect(b.linhas.map((x) => x.iva)).toEqual([23, undefined]);
    expect(L.total_com_iva).toBeCloseTo(100 * 1.23 + 50 * 1.06, 2);
  });
});
