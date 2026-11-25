// 25/11: o resumo do negócio num ecrã largo (resumoDoNegocio.ts).
import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "./motor";
import { dataCurtaResumo, disposicaoNegocio, documentosDoNegocio, entrouNaFase, fasesDoNegocio } from "./resumoDoNegocio";

const comOrc = (): Negocio => {
  const S = seed();
  const d = structuredClone(S.deals.find((x) => x.orc)!);
  d.orc!.enviada = null; d.orc!.aceite = null; d.orc!.contrato = null; d.orc!.vendaDireta = false; d.orc!.verif = false; d.orc!.versoes = [];
  d.fase = 3;
  return d;
};

describe("disposição pela largura da página", () => {
  it("só com 1360 px ou mais é ampla (o menu da app come largura: conta a da página, não a do ecrã)", () => {
    expect(disposicaoNegocio(0)).toBe("normal");
    expect(disposicaoNegocio(1280)).toBe("normal");
    expect(disposicaoNegocio(1359)).toBe("normal");
    expect(disposicaoNegocio(1360)).toBe("amplo");
    expect(disposicaoNegocio(1899)).toBe("amplo");
    expect(disposicaoNegocio(1900)).toBe("muitoAmplo");
    expect(disposicaoNegocio(2240)).toBe("muitoAmplo");
  });
});

describe("datas curtas", () => {
  it("ISO passa a dia/mês; o resto perde a hora", () => {
    expect(dataCurtaResumo("2026-11-24T09:08:00Z")).toBe("24/11");
    expect(dataCurtaResumo("24/11 09:08")).toBe("24/11");
    expect(dataCurtaResumo("05/10")).toBe("05/10");
    expect(dataCurtaResumo(null)).toBe("");
  });
});

describe("documentos do negócio", () => {
  it("sem orçamento, nada", () => {
    const d = comOrc(); d.orc = null;
    expect(documentosDoNegocio(d)).toEqual([]);
  });
  it("a proposta segue o estado: por verificar, por enviar, à espera, aceite (com a versão)", () => {
    const d = comOrc();
    expect(documentosDoNegocio(d)[0]).toMatchObject({ l: "Proposta", v: "por verificar", estado: "falta" });
    d.orc!.verif = true;
    expect(documentosDoNegocio(d)[0].v).toBe("verificada, por enviar");
    d.orc!.enviada = "2026-11-24T09:08:00Z";
    expect(documentosDoNegocio(d)[0]).toMatchObject({ v: "enviada a 24/11, à espera do cliente", estado: "espera" });
    d.orc!.aceite = "24/11 10:00";
    d.orc!.versoes = [{ n: 1, enviada: "20/11", substituida: "22/11", total: 100, motivos: [], onde: "orcamento" }];
    expect(documentosDoNegocio(d)[0]).toMatchObject({ l: "Proposta (versão 2)", v: "aceite a 24/11", estado: "ok" });
  });
  it("o contrato aparece com a proposta aceite (não na venda direta)", () => {
    const d = comOrc();
    expect(documentosDoNegocio(d).map((x) => x.id)).toEqual(["proposta"]);
    d.orc!.aceite = "24/11";
    expect(documentosDoNegocio(d).find((x) => x.id === "contrato")).toMatchObject({ v: "por gerar", estado: "falta" });
    d.orc!.contrato = "enviado";
    expect(documentosDoNegocio(d).find((x) => x.id === "contrato")).toMatchObject({ v: "à espera da assinatura", estado: "espera" });
    d.orc!.contrato = "assinado";
    expect(documentosDoNegocio(d).find((x) => x.id === "contrato")?.estado).toBe("ok");
    d.orc!.vendaDireta = true;
    expect(documentosDoNegocio(d).some((x) => x.id === "contrato")).toBe(false);
  });
  it("no Financeiro: fatura, pagamento e plano da obra; na Obra, o auto", () => {
    const d = comOrc();
    d.orc!.aceite = "24/11"; d.orc!.contrato = "assinado"; d.fase = 4;
    d.fin = { fatura: null, pago: false, recibo: null };
    d.obra = { ...d.obra, plano: null, auto: null };
    const ids = documentosDoNegocio(d);
    expect(ids.map((x) => x.id)).toEqual(["proposta", "contrato", "fatura", "pagamento", "plano"]);
    expect(ids.find((x) => x.id === "fatura")?.v).toBe("por registar");
    expect(ids.find((x) => x.id === "pagamento")?.estado).toBe("espera");
    d.fin = { fatura: { n: "FT 2026/12", q: "2026-11-25" }, pago: true, recibo: { n: "RC 7", q: "2026-11-25" } };
    const pagos = documentosDoNegocio(d);
    expect(pagos.find((x) => x.id === "fatura")?.v).toBe("FT 2026/12 · 25/11");
    expect(pagos.find((x) => x.id === "pagamento")?.v).toBe("validado · recibo RC 7");
    d.fase = 5; d.obra.auto = { n: "A1", q: "25/11", estado: "por assinar" };
    expect(documentosDoNegocio(d).at(-1)).toMatchObject({ id: "auto", estado: "espera" });
  });
});

describe("fases do negócio", () => {
  it("as feitas dizem quando acabaram, a de agora os passos e o que falta, as de depois nada", () => {
    const d = comOrc();
    d.fase = 2;
    d.hist = [
      { t: "Passou a Visita · sozinho", q: "20/11 10:00", k: "a" },
      { t: "Passou a Contacto", q: "18/11 09:00", k: "a" },
    ];
    const f = fasesDoNegocio(d, [{ feito: true, falta: 0 }, { feito: false, falta: 2 }, { feito: false, falta: 1 }]);
    expect(f.map((x) => x.estado)).toEqual(["feita", "feita", "agora", "depois", "depois", "depois"]);
    expect(f[0].v).toBe("feita · 18/11");
    expect(f[1].v).toBe("feita · 20/11");
    expect(f[2].v).toBe("1 de 3 passos · faltam 3");
    expect(f[3].v).toBe("");
    expect(fasesDoNegocio(d)[2].v).toBe("agora");
  });
  it("«Passou a Obra» não se confunde com outra fase; sem entrada, fica só «feita»", () => {
    const hist = [{ t: "Passou a Obra", q: "25/11 08:00", k: "a" as const }];
    expect(entrouNaFase(hist, 5)).toBe("25/11");
    expect(entrouNaFase(hist, 4)).toBe("");
  });
});
