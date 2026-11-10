/**
 * O detalhe do subsidio de alimentacao (dias pelo valor do dia / dias pelo valor da hora) e do desconto de faltas (dias e minutos),
 * que o motor devolve para o ecra mostrar QUANTOS dias ou horas originaram o valor e QUAIS. O detalhe so se pede com `diasComData`;
 * nenhum valor existente muda.
 */
import { describe, expect, it } from "vitest";
import { descontoDasFaltas, detalheDasFaltas, type FaltaDoPeriodo } from "@/lib/hr/descontoFalta";
import {
  calcularProcessamentoPessoa,
  minutosTrabalhadosPorDia,
  minutosTrabalhadosPorDiaComData,
  type EntradaProcessamentoPessoa,
  type RegraParaCalculo,
} from "@/lib/hr/processamentoTotais";

const REGRA: RegraParaCalculo = {
  subsidio_limite_min: 300,
  subsidio_valor_hora: 0.76,
  subsidio_valor_dia: 6.15,
  he_pct_dia_util: 50,
  he_pct_feriado: 75,
  he_pct_descanso: 100,
  iht_pct: 25,
  noturnas: [],
};

const totais = (faltas: EntradaProcessamentoPessoa["totais"]["faltas"] = []): EntradaProcessamentoPessoa["totais"] => ({
  planeadoMinutos: 9600,
  realizadoMinutos: 0,
  minutosExtraNormal: 0,
  minutosFeriadoTrabalhado: 0,
  minutosDescansoTrabalhado: 0,
  horasExtraNoturnasMinutos: 0,
  minutosAusenciaRemunerada: 0,
  diasFeriadoTrabalhados: 0,
  diasDescansoTrabalhado: 0,
  faltas,
});

const entrada = (parcial: Partial<EntradaProcessamentoPessoa> = {}): EntradaProcessamentoPessoa => ({
  totais: totais(),
  minutosPorDia: [],
  minutosNoturnosPorFaixa: [],
  regra: REGRA,
  direitoIht: false,
  retribuicao: { valorBase: 1600, periodicidade: "mensal", duodecimosPct: 100 },
  codigos: [],
  lancamentos: [],
  ...parcial,
});

const dia = (iso: string, intervalos: [string, string][]) => {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return {
    iso,
    estado: "normal" as const,
    realizadoMinutos: intervalos.reduce((s, [i, f]) => s + m(f) - m(i), 0),
    realizadoIntervalos: intervalos.map(([hora_inicio, hora_fim]) => ({ hora_inicio, hora_fim })),
  };
};

describe("minutosTrabalhadosPorDiaComData", () => {
  it("devolve a data e os minutos de cada dia; a antiga lista de minutos e a mesma sem as datas", () => {
    const dias = [
      { iso: "2026-03-02", estado: "normal" as const, realizadoMinutos: 500 },
      { iso: "2026-03-03", estado: "ausencia" as const, realizadoMinutos: 480 },
      { iso: "2026-03-04", estado: "normal" as const, realizadoMinutos: 0 },
      { iso: "2026-03-05", estado: "normal" as const, realizadoMinutos: 200 },
    ];
    expect(minutosTrabalhadosPorDiaComData(dias)).toEqual([
      { iso: "2026-03-02", minutos: 500 },
      { iso: "2026-03-05", minutos: 200 },
    ]);
    expect(minutosTrabalhadosPorDia(dias)).toEqual([500, 200]);
  });

  it("turno que atravessa a meia-noite conta como UM dia, na data em que o turno comecou", () => {
    const dias = [dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["00:00", "06:00"]])];
    expect(minutosTrabalhadosPorDiaComData(dias)).toEqual([{ iso: "2026-03-10", minutos: 479 }]);
  });

  it("o resto do dia seguinte fica como dia seu, com a data dele", () => {
    const dias = [dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["00:00", "06:00"], ["14:00", "17:00"]])];
    expect(minutosTrabalhadosPorDiaComData(dias)).toEqual([
      { iso: "2026-03-10", minutos: 479 },
      { iso: "2026-03-11", minutos: 180 },
    ]);
  });

  it("sem data (fixture antigo) a data fica a null", () => {
    expect(minutosTrabalhadosPorDiaComData([{ estado: "normal", realizadoMinutos: 90 }])).toEqual([{ iso: null, minutos: 90 }]);
  });
});

describe("subsidioDetalhe: o total fica exactamente igual", () => {
  // Valores ESPERADOS FIXOS, calculados a mao (regra: 6,15 EUR/dia a partir de 300 min; abaixo, 0,76 EUR/h = 76 centimos/h,
  // arredondado ao centimo POR DIA). Protegem de regressoes: nao dependem do codigo que testam.
  const CASOS: Record<string, { minutos: number[]; esperado: number }> = {
    // 300 >= 300 -> 1 dia x 6,15
    "exactamente 300 min conta como dia": { minutos: [300], esperado: 6.15 },
    // 299 x 76 / 60 = 378,73 -> 379 centimos = 3,79
    "299 min conta pela hora": { minutos: [299], esperado: 3.79 },
    // so o de 300 conta: 6,15
    "dia sem minutos nao conta": { minutos: [0, 300, 0], esperado: 6.15 },
    // dias: 480, 300, 600 = 3 x 615 = 1845; horas: 120 -> 152, 299 -> 379, 45 -> 57 = 588; 1845 + 588 = 2433 = 24,33
    "mistura de dias e de horas": { minutos: [480, 120, 300, 299, 45, 600], esperado: 24.33 },
    // 20 min x 76 / 60 = 25,33 -> 25 (x3 = 75); 7 min x 76 / 60 = 8,87 -> 9 (x4 = 36); 75 + 36 = 111 = 1,11
    "arredondamento por dia (20 min = 0,2533 por dia)": { minutos: [20, 20, 20, 7, 7, 7, 7], esperado: 1.11 },
    "sem dias": { minutos: [], esperado: 0 },
  };

  for (const [nome, { minutos, esperado }] of Object.entries(CASOS)) {
    it(`${nome}: ${esperado} EUR, e total de antes === total pelo dia + total pela hora`, () => {
      const dias = minutos.map((m, i) => ({ iso: `2026-03-${String(i + 1).padStart(2, "0")}`, minutos: m }));
      const antes = calcularProcessamentoPessoa(entrada({ minutosPorDia: minutos })).subsidioAlimentacao;
      const depois = calcularProcessamentoPessoa(entrada({ minutosPorDia: minutos, diasComData: dias }));
      expect(antes).toBe(esperado);
      expect(depois.subsidioAlimentacao).toBe(esperado);
      const d = depois.subsidioDetalhe;
      expect(d).toBeDefined();
      expect(Math.round((d!.totalPeloDia + d!.totalPelaHora) * 100)).toBe(Math.round(antes * 100));
    });
  }

  it("separa os dias pelas duas regras, com a data e os minutos, e traz os valores da regra", () => {
    const dias = [
      { iso: "2026-03-02", minutos: 480 },
      { iso: "2026-03-03", minutos: 299 },
      { iso: "2026-03-04", minutos: 300 },
      { iso: "2026-03-05", minutos: 0 },
      { iso: "2026-03-06", minutos: 120 },
    ];
    const d = calcularProcessamentoPessoa(entrada({ minutosPorDia: dias.map((x) => x.minutos), diasComData: dias })).subsidioDetalhe;
    expect(d).toMatchObject({ limiteMin: 300, valorDia: 6.15, valorHora: 0.76 });
    expect(d?.diasPeloDia).toEqual([
      { data: "2026-03-02", minutos: 480 },
      { data: "2026-03-04", minutos: 300 },
    ]);
    expect(d?.diasPelaHora).toEqual([
      { data: "2026-03-03", minutos: 299 },
      { data: "2026-03-06", minutos: 120 },
    ]);
    expect(d?.totalPeloDia).toBeCloseTo(12.3, 10);
    // 299 min x 0,76 / 60 = 3,787 -> 3,79; 120 min -> 1,52
    expect(d?.totalPelaHora).toBeCloseTo(5.31, 10);
  });

  it("turno que atravessa a meia-noite: um so dia, na data do inicio", () => {
    const dias = minutosTrabalhadosPorDiaComData([dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["00:00", "06:00"]])]);
    const r = calcularProcessamentoPessoa(entrada({ minutosPorDia: dias.map((x) => x.minutos), diasComData: dias }));
    expect(r.subsidioDetalhe?.diasPeloDia).toEqual([{ data: "2026-03-10", minutos: 479 }]);
    expect(r.subsidioDetalhe?.diasPelaHora).toEqual([]);
    expect(r.subsidioAlimentacao).toBe(6.15);
  });

  it("valor/hora de 3 casas (0,754 -> 75 centimos/h), arredondado por dia: 3 dias de 29 min = 1,08 EUR", () => {
    // 29 x 75 / 60 = 36,25 -> 36 centimos por dia; 3 x 36 = 108 = 1,08 (somar os minutos antes daria 87 x 75 / 60 = 108,75 -> 1,09)
    const regra = { ...REGRA, subsidio_valor_hora: 0.754 };
    const dias = [29, 29, 29].map((minutos, i) => ({ iso: `2026-03-0${i + 2}`, minutos }));
    expect(calcularProcessamentoPessoa(entrada({ regra, minutosPorDia: [29, 29, 29] })).subsidioAlimentacao).toBe(1.08);
    expect(calcularProcessamentoPessoa(entrada({ regra, minutosPorDia: [29, 29, 29], diasComData: dias })).subsidioAlimentacao).toBe(1.08);
  });

  it("turno que atravessa a meia-noite: 22:00-23:59 + 00:00-06:00 = 479 min, um dia, 6,15 EUR (sem e com detalhe)", () => {
    const dias = minutosTrabalhadosPorDiaComData([dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["00:00", "06:00"]])]);
    const minutos = dias.map((x) => x.minutos);
    expect(calcularProcessamentoPessoa(entrada({ minutosPorDia: minutos })).subsidioAlimentacao).toBe(6.15);
    expect(calcularProcessamentoPessoa(entrada({ minutosPorDia: minutos, diasComData: dias })).subsidioAlimentacao).toBe(6.15);
  });

  it("sem regra salarial: o subsidio e 0 EUR com ou sem detalhe", () => {
    expect(calcularProcessamentoPessoa(entrada({ regra: null, minutosPorDia: [480] })).subsidioAlimentacao).toBe(0);
    expect(calcularProcessamentoPessoa(entrada({ regra: null, minutosPorDia: [480], diasComData: [{ iso: "2026-03-02", minutos: 480 }] })).subsidioAlimentacao).toBe(0);
  });

  it("minutosPorDia e diasComData divergem: o calculo usa diasComData (nenhum valor muda, nenhum aviso novo)", () => {
    // diasComData: 480 (6,15) + 120 (120 x 76 / 60 = 152 centimos = 1,52) = 7,67; minutosPorDia sozinho daria 3 x 6,15 = 18,45
    const dias = [{ iso: "2026-03-02", minutos: 480 }, { iso: "2026-03-03", minutos: 120 }];
    const so = calcularProcessamentoPessoa(entrada({ minutosPorDia: [480, 120], diasComData: dias }));
    const divergente = calcularProcessamentoPessoa(entrada({ minutosPorDia: [480, 480, 480], diasComData: dias }));
    expect(divergente.subsidioAlimentacao).toBe(7.67);
    expect(divergente.subsidioAlimentacao).toBe(so.subsidioAlimentacao);
    expect(divergente.totalBrutoEstimado).toBe(so.totalBrutoEstimado);
    expect(divergente.avisos).toEqual(so.avisos);
  });

  it("sem regra salarial: subsidio 0, aviso, e sem detalhe", () => {
    const r = calcularProcessamentoPessoa(entrada({ regra: null, diasComData: [{ iso: "2026-03-02", minutos: 480 }] }));
    expect(r.subsidioAlimentacao).toBe(0);
    expect(r.avisos).toContain("sem_regra_salarial");
    expect(r.subsidioDetalhe).toBeUndefined();
  });

  it("sem pedir o detalhe (sem diasComData) o resultado fica identico ao de sempre, sem campos novos", () => {
    const r = calcularProcessamentoPessoa(entrada({ minutosPorDia: [480, 100] }));
    expect(r).not.toHaveProperty("subsidioDetalhe");
    expect(r).not.toHaveProperty("faltasDetalhe");
  });
});

const falta = (data: string, minutos: number, extra: Partial<FaltaDoPeriodo> = {}): FaltaDoPeriodo => ({
  data,
  minutos,
  estado: "activa",
  justificacao_estado: "sem_justificacao",
  remunerada: false,
  motivo_codigo: "ausencia_nao_comunicada",
  ...extra,
});

describe("detalheDasFaltas", () => {
  it("o valor e o provisorio sao os de descontoDasFaltas; acrescenta os minutos descontados e os dias distintos", () => {
    const faltas = [
      falta("2026-03-05", 480),
      falta("2026-03-05", 60),
      falta("2026-03-09", 120, { justificacao_estado: "pendente_documento" }),
      falta("2026-03-10", 480, { justificacao_estado: "justificada", remunerada: true }),
      falta("2026-03-11", 480, { estado: "anulada" }),
      falta("2026-03-12", 4, { motivo_codigo: "atraso" }),
    ];
    const d = detalheDasFaltas(faltas, 10);
    const base = descontoDasFaltas(faltas, 10);
    expect(d.valor).toBe(base.valor);
    expect(d.provisorio).toBe(base.provisorio);
    expect(d.minutosDescontados).toBe(660);
    expect(d.dias).toEqual(["2026-03-05", "2026-03-09"]);
  });

  it("o limite por dia corta os minutos e um dia sem minutos que descontem nao conta", () => {
    const faltas = [falta("2026-03-05", 480), falta("2026-03-06", 480)];
    const d = detalheDasFaltas(faltas, 10, { "2026-03-05": 120, "2026-03-06": 0 });
    expect(d.minutosDescontados).toBe(120);
    expect(d.dias).toEqual(["2026-03-05"]);
    expect(d.valor).toBe(descontoDasFaltas(faltas, 10, { "2026-03-05": 120, "2026-03-06": 0 }).valor);
  });

  it("descontoDasFaltas continua a devolver so valor e provisorio", () => {
    expect(Object.keys(descontoDasFaltas([falta("2026-03-05", 60)], 10)).sort()).toEqual(["provisorio", "valor"]);
  });
});

describe("faltasDetalhe no processamento", () => {
  const diasVazios = [] as { iso: string | null; minutos: number }[];
  it("traz os dias, os minutos, o valor da hora real e o valor, sem mudar o desconto", () => {
    const faltas = [falta("2026-03-05", 480), falta("2026-03-09", 120)];
    const sem = calcularProcessamentoPessoa(entrada({ totais: totais(faltas) }));
    const com = calcularProcessamentoPessoa(entrada({ totais: totais(faltas), diasComData: diasVazios }));
    expect(com.descontoFaltas).toBe(sem.descontoFaltas);
    expect(com.totalBrutoEstimado).toBe(sem.totalBrutoEstimado);
    expect(com.faltasDetalhe).toEqual({
      dias: ["2026-03-05", "2026-03-09"],
      minutosDescontados: 600,
      valorHoraReal: com.valorHoraReal,
      valor: com.descontoFaltas,
    });
  });

  it("sem valor da hora (sem retribuicao) nao ha desconto nem detalhe", () => {
    const r = calcularProcessamentoPessoa(entrada({ retribuicao: null, totais: totais([falta("2026-03-05", 480)]), diasComData: diasVazios }));
    expect(r.descontoFaltas).toBe(0);
    expect(r.faltasDetalhe).toBeUndefined();
  });
});
