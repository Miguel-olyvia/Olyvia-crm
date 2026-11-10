// Quem paga subsidio de ferias e de Natal num periodo: funcao pura, sem base nem React.
import { describe, expect, it } from "vitest";
import { AVISO_SUBSIDIO_CHAVE, decidirSubsidios, diasDoAno, periodoPagaSubsidios, type SubsidiosConfig } from "@/lib/hr/subsidiosExtra";

const CONFIG: SubsidiosConfig = { ativoDesde: "2026-01-01", feriasMes: 6, natalMes: 11 };
const ANTIGO = { dataInicio: "2020-03-01", dataFim: null };

describe("diasDoAno", () => {
  it("365 num ano normal e 366 num bissexto", () => {
    expect(diasDoAno(2026)).toBe(365);
    expect(diasDoAno(2028)).toBe(366);
    expect(diasDoAno(2100)).toBe(365);
    expect(diasDoAno(2000)).toBe(366);
  });
});

describe("decidirSubsidios: quando se paga", () => {
  it("no mes de ferias paga so o de ferias", () => {
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toEqual({ ferias: true, natal: false, proporcao: 1 });
  });

  it("no mes de Natal paga so o de Natal", () => {
    expect(decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, ANTIGO)).toEqual({ ferias: false, natal: true, proporcao: 1 });
  });

  it("num mes errado nao paga nada", () => {
    expect(decidirSubsidios(CONFIG, { mes: 7, dataFim: "2026-07-31" }, ANTIGO)).toBeUndefined();
    expect(decidirSubsidios(CONFIG, { mes: 12, dataFim: "2026-12-31" }, ANTIGO)).toBeUndefined();
  });

  it("ferias e Natal no mesmo mes pagam os dois", () => {
    expect(decidirSubsidios({ ...CONFIG, natalMes: 6 }, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toMatchObject({ ferias: true, natal: true });
  });

  it("sem configuracao, ou desligada (ativoDesde null), nao paga nada", () => {
    expect(decidirSubsidios(null, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toBeUndefined();
    expect(decidirSubsidios(undefined, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toBeUndefined();
    expect(decidirSubsidios({ ...CONFIG, ativoDesde: null }, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toBeUndefined();
  });

  it("ativoDesde posterior ao fim do periodo: nao paga; igual ao fim: paga", () => {
    expect(decidirSubsidios({ ...CONFIG, ativoDesde: "2026-07-01" }, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toBeUndefined();
    expect(decidirSubsidios({ ...CONFIG, ativoDesde: "2026-06-30" }, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toMatchObject({ ferias: true });
  });

  it("o mes que conta e o do periodo (o do fim), nao o de um dia a meio: um periodo 21/05-20/06 e o de junho", () => {
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-20" }, ANTIGO)).toMatchObject({ ferias: true });
    expect(decidirSubsidios(CONFIG, { mes: 5, dataFim: "2026-05-20" }, ANTIGO)).toBeUndefined();
  });
});

describe("periodoPagaSubsidios", () => {
  it("diz se o periodo paga algum subsidio, sem precisar do vinculo", () => {
    expect(periodoPagaSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" })).toBe(true);
    expect(periodoPagaSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" })).toBe(true);
    expect(periodoPagaSubsidios(CONFIG, { mes: 7, dataFim: "2026-07-31" })).toBe(false);
    expect(periodoPagaSubsidios({ ...CONFIG, ativoDesde: null }, { mes: 6, dataFim: "2026-06-30" })).toBe(false);
    expect(periodoPagaSubsidios({ ...CONFIG, ativoDesde: "2026-07-01" }, { mes: 6, dataFim: "2026-06-30" })).toBe(false);
    expect(periodoPagaSubsidios(null, { mes: 6, dataFim: "2026-06-30" })).toBe(false);
  });
});

describe("decidirSubsidios: proporcao e casos sem calculo", () => {
  it("vinculo anterior ao ano: proporcao 1", () => {
    expect(decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, { dataInicio: "2025-12-31", dataFim: null })?.proporcao).toBe(1);
  });

  it("admitido no ano: dias de vinculo no ano civil / dias do ano (1 de julho = 184/365)", () => {
    const r = decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, { dataInicio: "2026-07-01", dataFim: null });
    expect(r).toMatchObject({ ferias: false, natal: true, diasNoAno: 184, diasDoAno: 365 });
    expect(r?.proporcao).toBeCloseTo(184 / 365, 10);
  });

  it("admitido a 1 de janeiro: o ano todo (proporcao 1); no ultimo dia do ano: 1 dia", () => {
    expect(decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, { dataInicio: "2026-01-01", dataFim: null })?.proporcao).toBe(1);
    expect(decidirSubsidios({ ...CONFIG, natalMes: 12 }, { mes: 12, dataFim: "2026-12-31" }, { dataInicio: "2026-12-31", dataFim: null })?.diasNoAno).toBe(1);
  });

  it("ano bissexto: o divisor e 366", () => {
    const r = decidirSubsidios({ ...CONFIG, ativoDesde: "2028-01-01" }, { mes: 11, dataFim: "2028-11-30" }, { dataInicio: "2028-07-01", dataFim: null });
    expect(r).toMatchObject({ diasNoAno: 184, diasDoAno: 366 });
  });

  it("sem vinculo conhecido: nao se paga e di-lo", () => {
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" }, null)).toEqual({ ferias: true, natal: false, proporcao: null, semVinculo: true });
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" }, undefined)).toMatchObject({ semVinculo: true });
  });

  it("contrato que termina no ano do periodo: cessacao por tratar, nao se paga", () => {
    expect(decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, { dataInicio: "2020-01-01", dataFim: "2026-12-31" })).toEqual({ ferias: false, natal: true, proporcao: null, cessacao: true });
  });

  it("contrato que termina so noutro ano: nao e cessacao", () => {
    expect(decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, { dataInicio: "2020-01-01", dataFim: "2027-01-31" })).toMatchObject({ proporcao: 1 });
    expect(decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, { dataInicio: "2020-01-01", dataFim: "2027-01-31" })?.cessacao).toBeUndefined();
  });

  it("admitido e a terminar no mesmo ano: tambem cessacao (nao se inventa proporcao)", () => {
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" }, { dataInicio: "2026-03-01", dataFim: "2026-09-30" })).toMatchObject({ cessacao: true, proporcao: null });
  });
});

describe("AVISO_SUBSIDIO_CHAVE", () => {
  it("tem uma chave de traducao para cada aviso novo", () => {
    expect(Object.keys(AVISO_SUBSIDIO_CHAVE).sort()).toEqual(["subsidio_cessacao_por_tratar", "subsidio_contratos_com_intervalo", "subsidio_sem_duodecimos", "subsidio_sem_vinculo"]);
  });
});

describe("decidirSubsidios: a decisao do mes vem da base (rpc_hr_subsidios_assinatura)", () => {
  const PERIODO = { mes: 7, dataFim: "2026-07-31" };

  it("com a decisao da base, o mes e o dela e nao o da configuracao lida", () => {
    // A configuracao diz junho/novembro e o periodo e julho, mas a base diz que este periodo paga ferias: vale a base.
    expect(decidirSubsidios(CONFIG, PERIODO, ANTIGO, { pagaFerias: true, pagaNatal: false })).toEqual({ ferias: true, natal: false, proporcao: 1 });
    expect(decidirSubsidios(CONFIG, PERIODO, ANTIGO, { pagaFerias: false, pagaNatal: true })).toMatchObject({ ferias: false, natal: true });
  });

  it("a base diz que nao paga nada: nada, mesmo que o mes coincida com a configuracao", () => {
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" }, ANTIGO, { pagaFerias: false, pagaNatal: false })).toBeUndefined();
  });

  it("a decisao da base nao precisa da configuracao (null)", () => {
    expect(decidirSubsidios(null, PERIODO, ANTIGO, { pagaFerias: true, pagaNatal: true })).toMatchObject({ ferias: true, natal: true, proporcao: 1 });
  });

  it("a proporcao, a cessacao e o vinculo em falta continuam a ser do cliente", () => {
    const d = { pagaFerias: true, pagaNatal: false };
    expect(decidirSubsidios(null, PERIODO, { dataInicio: "2026-03-01", dataFim: null }, d)).toMatchObject({ ferias: true, proporcao: 306 / 365, diasNoAno: 306, diasDoAno: 365 });
    expect(decidirSubsidios(null, PERIODO, { dataInicio: "2020-01-01", dataFim: "2026-12-31" }, d)).toMatchObject({ cessacao: true, proporcao: null });
    expect(decidirSubsidios(null, PERIODO, null, d)).toMatchObject({ semVinculo: true, proporcao: null });
  });

  it("sem decisao (quarto argumento ausente) decide pelo mes como antes", () => {
    expect(decidirSubsidios(CONFIG, { mes: 6, dataFim: "2026-06-30" }, ANTIGO)).toEqual({ ferias: true, natal: false, proporcao: 1 });
    expect(decidirSubsidios(CONFIG, PERIODO, ANTIGO)).toBeUndefined();
  });
});
