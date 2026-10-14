import { describe, expect, it } from "vitest";
import {
  MESES_EQUIPAMENTO,
  anularAvulsoErro,
  arredondar,
  custoPorHora,
  custoRepartido14em12,
  custoTotalDoMes,
  encargosDaEmpresa,
  equipamentoDoMes,
  equipamentoPorMes,
  horasPrevistasDoMes,
  mesDeContagem,
  saldoBancoEmEuros,
  salarioMensal,
  somarMeses,
  taxaEfetiva,
  validarAvulso,
  valorDeAjudaDeCusto,
  valorDeKm,
} from "./custo";

describe("custo: valores avulsos", () => {
  it("quilómetros = km x valor por km e ajudas = dias x valor diário (exemplos do fluxo 11)", () => {
    expect(valorDeKm(120, 0.4)).toBe(48);
    expect(valorDeAjudaDeCusto(2, 25)).toBe(50);
  });

  it("equipamento dividido por 36 meses (900 / 36 = 25)", () => {
    expect(MESES_EQUIPAMENTO).toBe(36);
    expect(equipamentoPorMes(900)).toBe(25);
    expect(equipamentoPorMes(1000)).toBe(27.78);
  });

  it("o equipamento conta a partir do mês da entrega, por 36 meses, até à devolução", () => {
    const e = { entrega: "2026-11-15", devolucao: null };
    expect(equipamentoDoMes(e, "2026-10")).toBe(false);
    expect(equipamentoDoMes(e, "2026-11")).toBe(true);
    expect(equipamentoDoMes(e, "2029-10")).toBe(true);
    expect(equipamentoDoMes(e, "2029-11")).toBe(false);
    expect(equipamentoDoMes({ ...e, devolucao: "2027-02-03" }, "2027-02")).toBe(true);
    expect(equipamentoDoMes({ ...e, devolucao: "2027-02-03" }, "2027-03")).toBe(false);
  });

  it("recusa descrição em branco, valor 0 ou negativo e quem não pode processar salários", () => {
    const base = { descricao: "Visita a cliente", valor: 48, podeProcessar: true };
    expect(validarAvulso(base)).toBeNull();
    expect(validarAvulso({ ...base, podeProcessar: false })).toBe("semAutorizacao");
    expect(validarAvulso({ ...base, descricao: "   " })).toBe("semDescricao");
    expect(validarAvulso({ ...base, valor: 0 })).toBe("valorZero");
    expect(validarAvulso({ ...base, valor: -3 })).toBe("valorZero");
    expect(validarAvulso({ ...base, valor: Number.NaN })).toBe("valorZero");
  });

  it("anular exige autorização e motivo com pelo menos 3 caracteres", () => {
    expect(anularAvulsoErro("Registado por engano", true)).toBeNull();
    expect(anularAvulsoErro("Registado por engano", false)).toBe("semAutorizacao");
    expect(anularAvulsoErro("  ", true)).toBe("semMotivo");
    expect(anularAvulsoErro("ab", true)).toBe("semMotivo");
  });

  it("uma data num mês já fechado conta no primeiro mês aberto, com a nota da data real", () => {
    expect(mesDeContagem("2026-10-20", "2026-11")).toEqual({ mes: "2026-11", dataReal: "2026-10-20" });
    expect(mesDeContagem("2026-11-02", "2026-11")).toEqual({ mes: "2026-11", dataReal: null });
    expect(mesDeContagem("2026-12-01", "2026-11")).toEqual({ mes: "2026-12", dataReal: null });
  });
});

describe("custo: encargos e custo do mês (exemplos do fluxo 11)", () => {
  it("Joana: 1.349,64 x 23,75 % = 320,54 e custo total 1.573,64 + 320,54 = 1.894,18", () => {
    const encargos = encargosDaEmpresa(1349.64, 23.75, 0);
    expect(encargos).toBe(320.54);
    expect(custoTotalDoMes(1573.64, encargos, 0)).toBe(1894.18);
  });

  it("a exceção por pessoa substitui a taxa da empresa e o seguro soma-se", () => {
    expect(taxaEfetiva(23.75, null)).toBe(23.75);
    expect(taxaEfetiva(23.75, 11)).toBe(11);
    expect(encargosDaEmpresa(1000, 23.75, 1.5)).toBe(252.5);
    expect(encargosDaEmpresa(0, 23.75, 0)).toBe(0);
  });

  it("Duarte: o portátil entra nos outros custos e não no bruto (1.582,82 + 25,00 = 1.607,82)", () => {
    expect(custoTotalDoMes(1301.21, 281.61, equipamentoPorMes(900))).toBe(1607.82);
  });

  it("sem bruto o custo fica sem valor", () => {
    expect(custoTotalDoMes(null, 0, 25)).toBeNull();
  });

  it("custo repartido por 14 em 12: 1.200 x 14 / 12 + 296,79 = 1.696,79", () => {
    expect(custoRepartido14em12(1200, 296.79)).toBe(1696.79);
    expect(custoRepartido14em12(null, 10)).toBeNull();
  });

  it("Eva: 3 horas a favor a 1.000 / 168 por hora valem 17,86 euros", () => {
    expect(saldoBancoEmEuros(3, 1000, 168)).toBe(17.86);
    expect(saldoBancoEmEuros(-3, 1000, 168)).toBe(-17.86);
    expect(saldoBancoEmEuros(3, null, 168)).toBeNull();
    expect(saldoBancoEmEuros(3, 1000, 0)).toBeNull();
  });

  it("custo por hora: 1.894,18 / 168 = 11,27 e / 170 = 11,14; sem horas não há valor", () => {
    expect(custoPorHora(1894.18, 168)).toBe(11.27);
    expect(custoPorHora(1894.18, 170)).toBe(11.14);
    expect(custoPorHora(1894.18, 0)).toBeNull();
    expect(custoPorHora(null, 168)).toBeNull();
  });

  it("acumulado = soma dos meses (1.820,40 + 1.776,90 + 1.894,18 = 5.491,48), ignorando meses sem valor", () => {
    expect(somarMeses([1820.4, 1776.9, 1894.18])).toBe(5491.48);
    expect(somarMeses([100, null, 50.5])).toBe(150.5);
    expect(somarMeses([])).toBe(0);
  });
});

describe("custo: base de cálculo de exemplo", () => {
  it("o salário mensal vem da periodicidade da retribuição", () => {
    expect(salarioMensal({ valor_base: 1200, periodicidade: "mensal" }, 168)).toBe(1200);
    expect(salarioMensal({ valor_base: 16800, periodicidade: "anual" }, 168)).toBe(1200);
    expect(salarioMensal({ valor_base: 10, periodicidade: "hora" }, 168)).toBe(1680);
    expect(salarioMensal({ valor_base: 50, periodicidade: "diaria" }, 168)).toBe(1050);
    expect(salarioMensal({ valor_base: 300, periodicidade: "semanal" }, 168)).toBe(1300);
    expect(salarioMensal(null, 168)).toBeNull();
  });

  it("as horas previstas do mês seguem os dias úteis (novembro de 2026 tem 21)", () => {
    expect(horasPrevistasDoMes(40, "2026-11")).toBe(168);
    expect(horasPrevistasDoMes(0, "2026-11")).toBe(0);
  });

  it("arredonda ao cêntimo", () => {
    expect(arredondar(1.005)).toBe(1.01);
    expect(arredondar(2.344)).toBe(2.34);
  });
});
