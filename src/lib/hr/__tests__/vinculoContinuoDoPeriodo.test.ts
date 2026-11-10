// A cadeia continua de vinculos de uma pessoa (contratos renovados sem interrupcao) e o que ela da aos subsidios: funcao pura.
import { describe, expect, it } from "vitest";
import { vinculoContinuoDoPeriodo, type VinculoLido } from "@/lib/hr/vinculosDoMes";
import { decidirSubsidios, type SubsidiosConfig } from "@/lib/hr/subsidiosExtra";

const CONFIG: SubsidiosConfig = { ativoDesde: "2026-01-01", feriasMes: 6, natalMes: 11 };

const v = (dataInicio: string, dataFim: string | null): VinculoLido => ({
  tipoContrato: "termo_certo",
  estado: "ativo",
  dataInicio,
  dataFim,
  horasSemanais: 40,
});

/** Junho de 2026, o periodo mais pedido nos testes (ferias). */
const decidir = (vinculos: VinculoLido[] | undefined, mes = 6, dataFim = "2026-06-30") =>
  decidirSubsidios({ ...CONFIG, feriasMes: mes }, { mes, dataFim }, vinculoContinuoDoPeriodo(vinculos, dataFim));

describe("vinculoContinuoDoPeriodo", () => {
  it("sem vinculos, ou sem nenhum que cubra o mes: null", () => {
    expect(vinculoContinuoDoPeriodo(undefined, "2026-06-30")).toBeNull();
    expect(vinculoContinuoDoPeriodo([], "2026-06-30")).toBeNull();
    expect(vinculoContinuoDoPeriodo([v("2020-01-01", "2026-05-31")], "2026-06-30")).toBeNull();
    expect(vinculoContinuoDoPeriodo([v("2026-07-01", null)], "2026-06-30")).toBeNull();
  });

  it("um so vinculo: devolve o inicio e o fim dele, sem intervalo", () => {
    expect(vinculoContinuoDoPeriodo([v("2020-03-01", null)], "2026-06-30")).toEqual({ dataInicio: "2020-03-01", dataFim: null, comIntervalo: false });
  });

  it("renovacao no dia seguinte: o inicio e o do primeiro da cadeia e o fim o do ultimo", () => {
    const r = vinculoContinuoDoPeriodo([v("2020-03-01", "2026-02-28"), v("2026-03-01", null)], "2026-06-30");
    expect(r).toEqual({ dataInicio: "2020-03-01", dataFim: null, comIntervalo: false });
  });

  it("a ordem de entrada nao conta", () => {
    const r = vinculoContinuoDoPeriodo([v("2026-03-01", null), v("2020-03-01", "2026-02-28")], "2026-06-30");
    expect(r?.dataInicio).toBe("2020-03-01");
  });

  it("vinculos sobrepostos sao contiguos", () => {
    const r = vinculoContinuoDoPeriodo([v("2025-01-01", "2026-03-15"), v("2026-03-01", null)], "2026-06-30");
    expect(r).toEqual({ dataInicio: "2025-01-01", dataFim: null, comIntervalo: false });
  });

  it("um vinculo contido noutro nao encurta a cadeia (o fim e o maior)", () => {
    const r = vinculoContinuoDoPeriodo([v("2025-01-01", "2026-12-31"), v("2025-06-01", "2025-08-31")], "2026-06-30");
    expect(r?.dataFim).toBe("2026-12-31");
  });

  it("intervalo ANTES do ano do periodo: a cadeia comeca depois dele e nao ha aviso", () => {
    const r = vinculoContinuoDoPeriodo([v("2020-01-01", "2022-05-31"), v("2024-02-01", null)], "2026-06-30");
    expect(r).toEqual({ dataInicio: "2024-02-01", dataFim: null, comIntervalo: false });
  });

  it("intervalo de 10 dias DENTRO do ano: comIntervalo", () => {
    const r = vinculoContinuoDoPeriodo([v("2020-01-01", "2026-02-28"), v("2026-03-11", null)], "2026-06-30");
    expect(r).toMatchObject({ dataInicio: "2026-03-11", comIntervalo: true });
  });

  it("intervalo no ano mas DEPOIS do mes do periodo tambem conta (a pessoa nao esta o ano inteiro)", () => {
    const r = vinculoContinuoDoPeriodo([v("2020-01-01", "2026-09-30"), v("2026-10-15", null)], "2026-06-30");
    expect(r?.comIntervalo).toBe(true);
  });

  it("um dia sem contrato entre dois vinculos ja e intervalo (so o dia seguinte e contiguo)", () => {
    expect(vinculoContinuoDoPeriodo([v("2020-01-01", "2026-02-27"), v("2026-03-01", null)], "2026-06-30")?.comIntervalo).toBe(true);
    expect(vinculoContinuoDoPeriodo([v("2020-01-01", "2026-02-28"), v("2026-03-01", null)], "2026-06-30")?.comIntervalo).toBe(false);
  });

  it("fim de ano: vinculo a acabar em 31/12 e outro a comecar em 1/1 do ano seguinte sao contiguos (entre anos)", () => {
    const r = vinculoContinuoDoPeriodo([v("2025-01-01", "2025-12-31"), v("2026-01-01", null)], "2026-06-30");
    expect(r).toEqual({ dataInicio: "2025-01-01", dataFim: null, comIntervalo: false });
  });

  it("ano bissexto: 29/2 e o dia antes de 1/3", () => {
    const r = vinculoContinuoDoPeriodo([v("2027-01-01", "2028-02-29"), v("2028-03-01", null)], "2028-06-30");
    expect(r?.comIntervalo).toBe(false);
  });

  it("aceita datas com hora (timestamp) sem partir", () => {
    const r = vinculoContinuoDoPeriodo([v("2020-03-01T00:00:00Z", "2026-02-28T00:00:00Z"), v("2026-03-01T00:00:00Z", null)], "2026-06-30");
    expect(r?.dataInicio.slice(0, 10)).toBe("2020-03-01");
    expect(r?.comIntervalo).toBe(false);
  });
});

describe("decidirSubsidios com a cadeia continua", () => {
  it("contrato de 2020 renovado em 1/3/2026: proporcao 1, sem diasNoAno", () => {
    const r = decidir([v("2020-03-01", "2026-02-28"), v("2026-03-01", null)]);
    expect(r).toEqual({ ferias: true, natal: false, proporcao: 1 });
  });

  it("admitido em 1/3/2026 sem vinculo anterior: 306/365", () => {
    const r = decidir([v("2026-03-01", null)]);
    expect(r).toMatchObject({ proporcao: 306 / 365, diasNoAno: 306, diasDoAno: 365 });
  });

  it("renovacao a termo a acabar em 31/12 com novo vinculo a comecar em 1/1: sem cessacao", () => {
    const r = decidirSubsidios(CONFIG, { mes: 11, dataFim: "2026-11-30" }, vinculoContinuoDoPeriodo([v("2026-01-01", "2026-12-31"), v("2027-01-01", "2027-12-31")], "2026-11-30"));
    expect(r?.cessacao).toBeUndefined();
    expect(r).toMatchObject({ natal: true, proporcao: 1 });
  });

  it("vinculo a acabar em 15/6 sem seguinte: cessacao", () => {
    const r = decidir([v("2020-01-01", "2026-06-15")]);
    expect(r).toEqual({ ferias: true, natal: false, proporcao: null, cessacao: true });
  });

  it("intervalo de 10 dias entre contratos no ano: nao se paga e avisa", () => {
    const r = decidir([v("2020-01-01", "2026-02-28"), v("2026-03-11", null)]);
    expect(r).toEqual({ ferias: true, natal: false, proporcao: null, comIntervalo: true });
  });

  it("intervalo tem prioridade sobre a cessacao (nao se paga em nenhum dos casos)", () => {
    const r = decidir([v("2020-01-01", "2026-02-28"), v("2026-03-11", "2026-12-31")]);
    expect(r).toMatchObject({ proporcao: null, comIntervalo: true });
    expect(r?.cessacao).toBeUndefined();
  });

  it("ano bissexto: admitido em 1/3/2028 tem 306/366 (1/3 a 31/12)", () => {
    const r = decidirSubsidios({ ...CONFIG, ativoDesde: "2028-01-01" }, { mes: 6, dataFim: "2028-06-30" }, vinculoContinuoDoPeriodo([v("2028-03-01", null)], "2028-06-30"));
    expect(r).toMatchObject({ diasNoAno: 306, diasDoAno: 366 });
  });

  it("pessoa sem vinculo: o aviso que ja existia", () => {
    expect(decidir(undefined)).toEqual({ ferias: true, natal: false, proporcao: null, semVinculo: true });
    expect(decidir([v("2020-01-01", "2025-12-31")])).toMatchObject({ semVinculo: true });
  });
});
