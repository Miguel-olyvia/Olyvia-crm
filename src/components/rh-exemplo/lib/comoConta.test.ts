import { describe, expect, it } from "vitest";
import {
  contaRepartida,
  contaTodosMeses,
  contaUmaVez,
  ehErroConta,
  fraseDaConta,
  normalizarConta,
  primeiroMes,
  quotaMensal,
  situacaoDoItem,
  somarMesesAoMes,
  validarConta,
  valorNoMes,
  type ItemParaConta,
} from "./comoConta";
import { mesesEntre } from "./custoMes";

const item = (parcial: Partial<ItemParaConta> = {}): ItemParaConta => ({
  valor: 900, data: "2026-11-15", conta: contaRepartida(), devolucao: null, ...parcial,
});
const somaDe = (i: ItemParaConta, de: string, ate: string): number =>
  Math.round(mesesEntre(de, ate).reduce((s, m) => s + valorNoMes(i, m), 0) * 100) / 100;

describe("pago de uma vez: conta só no mês da data", () => {
  const i = item({ conta: contaUmaVez() });

  it("o valor todo no mês da data e nada antes nem depois (não salta de mês)", () => {
    expect(valorNoMes(i, "2026-10")).toBe(0);
    expect(valorNoMes(i, "2026-11")).toBe(900);
    expect(valorNoMes(i, "2026-12")).toBe(0);
    expect(valorNoMes(i, "2030-11")).toBe(0);
  });

  it("um avulso de Setembro conta em Setembro e não em Outubro", () => {
    const km = item({ valor: 48, data: "2026-09-09", conta: contaUmaVez() });
    expect(valorNoMes(km, "2026-09")).toBe(48);
    expect(valorNoMes(km, "2026-10")).toBe(0);
  });

  it("a devolução no mesmo mês não tira o que já foi pago, e uma devolução posterior também não", () => {
    expect(valorNoMes(item({ conta: contaUmaVez(), devolucao: "2026-11-20" }), "2026-11")).toBe(900);
    expect(valorNoMes(item({ conta: contaUmaVez(), devolucao: "2027-03-01" }), "2026-11")).toBe(900);
  });
});

describe("repartido por N meses", () => {
  it("900 / 36 = 25 por mês, do mês da entrega até ao 36.º mês (inclusive)", () => {
    const i = item();
    expect(valorNoMes(i, "2026-10")).toBe(0);
    expect(valorNoMes(i, "2026-11")).toBe(25);
    expect(valorNoMes(i, "2029-10")).toBe(25);
    expect(valorNoMes(i, "2029-11")).toBe(0);
  });

  it("N editável: 12 meses dão 75 por mês; 120 meses é o máximo e dá 7,50", () => {
    expect(valorNoMes(item({ conta: contaRepartida(12) }), "2027-10")).toBe(75);
    expect(valorNoMes(item({ conta: contaRepartida(12) }), "2027-11")).toBe(0);
    expect(valorNoMes(item({ conta: contaRepartida(120) }), "2036-10")).toBe(7.5);
  });

  it("N = 1 equivale a pago de uma vez, em todos os meses", () => {
    const um = item({ conta: contaRepartida(1) });
    const uma = item({ conta: contaUmaVez() });
    for (const m of mesesEntre("2026-09", "2027-03")) expect(valorNoMes(um, m)).toBe(valorNoMes(uma, m));
    expect(situacaoDoItem(um, "2026-11")).toEqual(situacaoDoItem(uma, "2026-11"));
  });

  it("a soma dos meses é exatamente o valor (o resto fica no último mês): 1000 / 36", () => {
    const i = item({ valor: 1000 });
    expect(quotaMensal(1000, 36)).toBe(27.78);
    expect(valorNoMes(i, "2029-10")).toBe(27.7);
    expect(somaDe(i, "2026-11", "2029-10")).toBe(1000);
    expect(somaDe(item({ valor: 100, conta: contaRepartida(3) }), "2026-11", "2027-01")).toBe(100);
  });

  it("a devolução pára no mês dela (inclusive) e deixa de contar a partir do mês seguinte", () => {
    const i = item({ devolucao: "2027-02-03" });
    expect(valorNoMes(i, "2027-02")).toBe(25);
    expect(valorNoMes(i, "2027-03")).toBe(0);
    expect(somaDe(i, "2026-11", "2030-01")).toBe(100);
  });

  it("o resumo diz o que já contou, o que falta e quantos meses faltam", () => {
    expect(situacaoDoItem(item(), "2027-01")).toEqual({ doMes: 25, contado: 75, falta: 825, mesesContados: 3, mesesFalta: 33, completo: false });
    expect(situacaoDoItem(item({ devolucao: "2027-02-03" }), "2027-02")).toMatchObject({ contado: 100, falta: 0, mesesFalta: 0, completo: false });
    expect(situacaoDoItem(item(), "2029-10")).toMatchObject({ contado: 900, falta: 0, completo: true });
  });
});

describe("todos os meses", () => {
  const i = item({ valor: 40, conta: contaTodosMeses("2026-09") });

  it("conta o valor mensal desde o mês de início, sem fim", () => {
    expect(valorNoMes(i, "2026-08")).toBe(0);
    expect(valorNoMes(i, "2026-09")).toBe(40);
    expect(valorNoMes(i, "2031-01")).toBe(40);
  });

  it("com mês de fim conta até lá (inclusive) e depois nada; a devolução também corta", () => {
    const comFim = item({ valor: 40, conta: contaTodosMeses("2026-09", "2027-02") });
    expect(valorNoMes(comFim, "2027-02")).toBe(40);
    expect(valorNoMes(comFim, "2027-03")).toBe(0);
    expect(somaDe(comFim, "2026-09", "2027-12")).toBe(240);
    expect(valorNoMes({ ...i, devolucao: "2027-01-10" }, "2027-02")).toBe(0);
  });

  it("o mês de início manda: é ele, e não a data, que decide o primeiro mês", () => {
    expect(primeiroMes(item({ data: "2026-11-15", conta: contaTodosMeses("2026-09") }))).toBe("2026-09");
    expect(primeiroMes(item({ data: "2026-11-15", conta: contaRepartida() }))).toBe("2026-11");
  });

  it("não tem total: falta e meses por contar ficam sem valor", () => {
    expect(situacaoDoItem(i, "2026-11")).toEqual({ doMes: 40, contado: 120, falta: null, mesesContados: 3, mesesFalta: null, completo: false });
  });
});

describe("validar e normalizar a conta", () => {
  it("o repartido pede um número inteiro de meses entre 1 e 120", () => {
    expect(validarConta(contaRepartida(36))).toBeNull();
    expect(validarConta(contaRepartida(1))).toBeNull();
    expect(validarConta(contaRepartida(120))).toBeNull();
    for (const mau of [0, 121, -3, 2.5, Number.NaN]) expect(validarConta(contaRepartida(mau))).toBe("mesesInvalidos");
  });

  it("o todos os meses pede o mês de início, e o fim não pode ser antes dele", () => {
    expect(validarConta(contaTodosMeses("2026-09"))).toBeNull();
    expect(validarConta(contaTodosMeses("2026-09", "2026-09"))).toBeNull();
    expect(validarConta(contaTodosMeses(""))).toBe("semInicio");
    expect(validarConta(contaTodosMeses("2026-13"))).toBe("semInicio");
    expect(validarConta(contaTodosMeses("2026-09", "2026-08"))).toBe("fimAntesInicio");
  });

  it("um pago de uma vez não tem restos de outro modo, e reconhece-se um erro da conta", () => {
    expect(normalizarConta({ modo: "umaVez", meses: 36, inicio: "2026-01", fim: "2027-01" })).toEqual(contaUmaVez());
    expect(normalizarConta({ modo: "repartido", meses: 12, inicio: "2026-01", fim: null })).toEqual(contaRepartida(12));
    expect(ehErroConta("semInicio")).toBe(true);
    expect(ehErroConta("semData")).toBe(false);
    expect(ehErroConta(null)).toBe(false);
  });

  it("somar meses atravessa o ano", () => {
    expect(somarMesesAoMes("2026-11", 0)).toBe("2026-11");
    expect(somarMesesAoMes("2026-11", 35)).toBe("2029-10");
    expect(somarMesesAoMes("2026-12", 1)).toBe("2027-01");
  });
});

describe("a frase do efeito", () => {
  it("repartido: 900 € por 36 meses = 25 € por mês, do mês da entrega até à devolução", () => {
    expect(fraseDaConta(item(), true)).toMatchObject({ chave: "repartidoDevolucao", valor: 900, n: 36, quota: 25, inicio: "2026-11" });
  });

  it("repartido sem devolução diz o mês em que acaba", () => {
    expect(fraseDaConta(item({ conta: contaRepartida(12) }), false)).toMatchObject({ chave: "repartidoFim", n: 12, quota: 75, fim: "2027-10" });
  });

  it("pago de uma vez (e repartido por 1 mês) conta tudo no mês da data", () => {
    expect(fraseDaConta(item({ conta: contaUmaVez() }), true)).toMatchObject({ chave: "umaVez", valor: 900, inicio: "2026-11" });
    expect(fraseDaConta(item({ conta: contaRepartida(1) }), true).chave).toBe("umaVez");
  });

  it("todos os meses: desde o início, com fim ou até à devolução", () => {
    const base = item({ valor: 40, conta: contaTodosMeses("2026-09") });
    expect(fraseDaConta(base, false)).toMatchObject({ chave: "todosMeses", valor: 40, inicio: "2026-09", fim: null });
    expect(fraseDaConta(base, true).chave).toBe("todosMesesDevolucao");
    expect(fraseDaConta({ ...base, conta: contaTodosMeses("2026-09", "2027-02") }, true)).toMatchObject({ chave: "todosMesesFim", fim: "2027-02" });
  });
});
