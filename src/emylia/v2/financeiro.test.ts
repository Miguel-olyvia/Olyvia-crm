// As regras do Financeiro da V2: tranches do contrato, registar faturas (não emitir), validar pagamentos e o disparo da obra.
import { describe, expect, it } from "vitest";
import {
  DISPARO, daFaturaUnica, dataPT, disparaObra, errosPagamento, errosRegisto, isoDe, registarFatura, resumoFin, trancheDoDisparo,
  tranchesDoPlano, validarPagamento, valorTranche, type FaturaReg,
} from "./financeiro";

const T50 = tranchesDoPlano("50% + 50% no fim");
const PAG = { data: "2026-10-13", conta: "Banco B · conta obras", ref: "TRF 1" };

describe("tranches do plano de pagamento", () => {
  it("50% + 50% dá Adiantamento e Final", () => {
    expect(T50.map((t) => t.nome)).toEqual(["Adiantamento 50%", "Final 50%"]);
    expect(T50.map((t) => t.pct)).toEqual([50, 50]);
  });
  it("30% + 40% + 30% dá Adiantamento, A meio e Final", () => {
    expect(tranchesDoPlano("30% + 40% + 30%").map((t) => t.nome)).toEqual(["Adiantamento 30%", "A meio 40%", "Final 30%"]);
  });
  it("100% na adjudicação: uma só tranche", () => {
    expect(tranchesDoPlano("100% na adjudicação")).toEqual([{ id: "unica", nome: "Única 100%", pct: 100 }]);
  });
  it("19/10: vazio ou desconhecido dá 50% + 50% no fim, como a proposta e o portal (prestacoes)", () => {
    for (const p of ["", undefined, "à vista"]) expect(tranchesDoPlano(p)).toEqual(T50);
  });
  it("19/10: \"Por fases\" usa as prestações guardadas, com o nome da fase nas do meio; sem elas, 50% + 50%", () => {
    const fases = [{ l: "Na adjudicação", p: 0.3, fase: 0 as const }, { l: "No fim da fase 2 (canalização)", p: 0.45, fase: 2 as const }, { l: "No fim da obra", p: 0.25, fase: "fim" as const }];
    expect(tranchesDoPlano("Por fases", fases).map((t) => [t.nome, t.pct])).toEqual([["Adiantamento 30%", 30], ["Fim da fase 2 (canalização) 45%", 45], ["Final 25%", 25]]);
    expect(tranchesDoPlano("Por fases")).toEqual(T50);
  });
  it("os valores das tranches somam o total ao cêntimo (a última leva o resto)", () => {
    const T = tranchesDoPlano("30% + 40% + 30%"), total = 1000.01;
    const soma = T.reduce((a, t) => a + valorTranche(total, T, t.id), 0);
    expect(Math.round(soma * 100) / 100).toBe(total);
    expect(valorTranche(total, T, "t1")).toBe(300);
    expect(valorTranche(total, T, "nao-existe")).toBe(0);
  });
});

describe("registar fatura", () => {
  const nova = { numero: "FT 2026/500", data: "2026-10-13", valor: 1500, tranche: "t1" };
  it("sem erros, entra na lista com o número e a tranche, sem pagamento", () => {
    expect(errosRegisto(nova, [], T50)).toEqual([]);
    const fs = registarFatura([], { ...nova, numero: "  FT 2026/500 ", pdf: "ft500.pdf" });
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ numero: "FT 2026/500", tranche: "t1", valor: 1500, pdf: "ft500.pdf" });
    expect(fs[0].pagamento).toBeUndefined();
  });
  it("pede número, data, tranche e valor", () => {
    expect(errosRegisto({ numero: " ", data: "", valor: 0, tranche: "" }, [], T50)).toEqual([
      "Falta o número da fatura.", "Falta a data da fatura.", "Falta escolher a tranche.", "O valor tem de ser maior do que zero.",
    ]);
  });
  it("não deixa repetir o número nem faturar duas vezes a mesma tranche", () => {
    const fs = registarFatura([], nova);
    expect(errosRegisto({ ...nova, tranche: "t2" }, fs, T50)).toEqual(["A fatura FT 2026/500 já está registada."]);
    expect(errosRegisto({ ...nova, numero: "FT 2026/501" }, fs, T50)).toEqual(["Essa tranche já tem fatura."]);
    expect(errosRegisto({ ...nova, numero: "FT 2026/501", tranche: "t9" }, fs, T50)).toEqual(["Essa tranche não está no plano de pagamento."]);
  });
});

describe("validar pagamento e o recibo", () => {
  it("pede data, conta e referência", () => {
    expect(errosPagamento({ data: "", conta: "", ref: " " })).toHaveLength(3);
    expect(errosPagamento(PAG)).toEqual([]);
  });
  it("marca a fatura como paga com o recibo e não mexe numa já paga", () => {
    let fs = registarFatura([], { numero: "FT 1", data: "2026-10-13", valor: 10, tranche: "t1" });
    fs = validarPagamento(fs, fs[0].id, PAG, "RC 1");
    expect(fs[0]).toMatchObject({ recibo: "RC 1", pagamento: PAG });
    expect(validarPagamento(fs, fs[0].id, PAG, "RC 2")[0].recibo).toBe("RC 1");
  });
  it("o resumo conta faturado, pago, por faturar e por pagar", () => {
    let fs: FaturaReg[] = registarFatura([], { numero: "FT 1", data: "2026-10-13", valor: 500, tranche: "t1" });
    let R = resumoFin(1000, T50, fs);
    expect(R).toMatchObject({ faturado: 500, pago: 0, completo: false });
    expect(R.porFaturar.map((t) => t.id)).toEqual(["t2"]);
    expect(R.porPagar).toHaveLength(1);
    fs = validarPagamento(fs, fs[0].id, PAG, "RC 1");
    fs = registarFatura(fs, { numero: "FT 2", data: "2026-10-20", valor: 500, tranche: "t2" });
    fs = validarPagamento(fs, fs[1].id, PAG, "RC 2");
    R = resumoFin(1000, T50, fs);
    expect(R).toMatchObject({ faturado: 1000, pago: 1000, completo: true });
  });
});

describe("o disparo da obra (Inventário + plano)", () => {
  const pagaT1 = validarPagamento(registarFatura([], { numero: "FT 1", data: "x", valor: 1, tranche: "t1" }), "f1-t1", PAG, "RC 1");
  it("a decisão em aberto está numa constante: hoje é a primeira tranche", () => {
    expect(DISPARO).toBe("primeira");
    expect(trancheDoDisparo(T50)?.id).toBe("t1");
    expect(trancheDoDisparo(T50, "ultima")?.id).toBe("t2");
  });
  it("com 'primeira', basta o adiantamento pago; com 'ultima', têm de estar todas pagas", () => {
    expect(disparaObra(T50, [])).toBe(false);
    expect(disparaObra(T50, pagaT1, "primeira")).toBe(true);
    expect(disparaObra(T50, pagaT1, "ultima")).toBe(false);
    const fatSemPagar = registarFatura([], { numero: "FT 1", data: "x", valor: 1, tranche: "t1" });
    expect(disparaObra(T50, fatSemPagar, "primeira")).toBe(false);
    expect(disparaObra([], pagaT1)).toBe(false);
  });
});

describe("a fatura única do motor passa a 1.ª tranche", () => {
  it("a da demonstração (paga) e a por pagar", () => {
    const paga = daFaturaUnica({ fatura: { n: "FT 2026/380", q: "22/09" }, pago: true, recibo: { n: "RC 2026/270", q: "24/09" } }, T50, 2000, "2026-10-13", "2026-09-24", "Banco B", "TRF");
    expect(paga).toEqual([{ id: "demo-t1", numero: "FT 2026/380", data: "2026-09-22", valor: 1000, tranche: "t1", daDemo: true,
      pagamento: { data: "2026-09-24", conta: "Banco B", ref: "TRF" }, recibo: "RC 2026/270" }]);
    const porPagar = daFaturaUnica({ fatura: { n: "FT 9", q: "hoje" }, pago: false, recibo: null }, T50, 2000, "2026-10-13");
    expect(porPagar[0]).toMatchObject({ data: "2026-10-13", valor: 1000 });
    expect(porPagar[0].pagamento).toBeUndefined();
    expect(daFaturaUnica({ fatura: null, pago: false, recibo: null }, T50, 2000, "2026-10-13")).toEqual([]);
  });
  it("as datas", () => {
    expect(isoDe("5/9", "2026-10-13")).toBe("2026-09-05");
    expect(dataPT("2026-09-05")).toBe("05/09/2026");
    expect(dataPT("")).toBe("");
  });
});
