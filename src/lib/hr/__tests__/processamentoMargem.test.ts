/**
 * Margem de tempo no processamento: `contadoMinutos` manda no desconto de faltas e no subsidio; SEM ele (ou igual ao realizado)
 * o resultado e IDENTICO ao de sempre. As duas copias do modulo (`@/lib/hr` e `rh-exemplo/lib`) tem de dar o mesmo.
 */
import { describe, expect, it } from "vitest";
import * as real from "@/lib/hr/processamentoTotais";
import * as exemplo from "@/components/rh-exemplo/lib/processamentoTotais";
import type { EntradaProcessamentoPessoa, RegraParaCalculo } from "@/lib/hr/processamentoTotais";

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

const faltaDoDefice = (minutos: number): EntradaProcessamentoPessoa["totais"]["faltas"] =>
  minutos > 0
    ? [{ data: "2026-01-15", minutos, estado: "activa", justificacao_estado: "sem_justificacao", remunerada: false, motivo_codigo: "ausencia_nao_comunicada", semRegisto: true }]
    : [];

const entrada = (totais: Partial<EntradaProcessamentoPessoa["totais"]>, minutosPorDia: number[]): EntradaProcessamentoPessoa => ({
  totais: {
    planeadoMinutos: 9600,
    realizadoMinutos: 9600,
    minutosExtraNormal: 0,
    minutosFeriadoTrabalhado: 0,
    minutosDescansoTrabalhado: 0,
    horasExtraNoturnasMinutos: 0,
    minutosAusenciaRemunerada: 0,
    diasFeriadoTrabalhados: 0,
    diasDescansoTrabalhado: 0,
    ...totais,
    // O desconto e por falta: o defice do mes vira uma falta nao justificada (o dia sem registo), como faz o hook do relatorio.
    faltas: totais.faltas ?? faltaDoDefice((totais.planeadoMinutos ?? 9600) - (totais.contadoMinutos ?? totais.realizadoMinutos ?? 9600)),
  },
  minutosPorDia,
  minutosNoturnosPorFaixa: [],
  regra: REGRA,
  direitoIht: false,
  retribuicao: { valorBase: 1300, periodicidade: "mensal", duodecimosPct: 100 },
  codigos: [],
  lancamentos: [],
});

const MODULOS = [
  ["@/lib/hr", real],
  ["rh-exemplo/lib", exemplo],
] as const;

describe.each(MODULOS)("margem de tempo no processamento (%s)", (_nome, modulo) => {
  it("sem contadoMinutos o desconto de faltas e o de sempre (planeado - realizado)", () => {
    const r = modulo.calcularProcessamentoPessoa(entrada({ realizadoMinutos: 9540 }, []));
    expect(r.descontoFaltas).toBeCloseTo((60 / 60) * (r.valorHoraReal as number), 2);
    expect(r.descontoFaltas).toBeGreaterThan(0);
  });

  it("contadoMinutos igual ao realizado da exactamente o mesmo resultado que sem ele", () => {
    const sem = modulo.calcularProcessamentoPessoa(entrada({ realizadoMinutos: 9540 }, [540, 480]));
    const com = modulo.calcularProcessamentoPessoa(entrada({ realizadoMinutos: 9540, contadoMinutos: 9540 }, [540, 480]));
    expect(com).toEqual(sem);
  });

  it("o caso 9:30-18:30 (540 min picados contra 540 planeados) nao muda nada com contado = realizado", () => {
    const sem = modulo.calcularProcessamentoPessoa(entrada({ planeadoMinutos: 540, realizadoMinutos: 540 }, [540]));
    const com = modulo.calcularProcessamentoPessoa(entrada({ planeadoMinutos: 540, realizadoMinutos: 540, contadoMinutos: 540 }, [540]));
    expect(com).toEqual(sem);
    expect(sem.descontoFaltas).toBe(0);
  });

  it("dentro da margem (contado = planeado) nao ha desconto, embora se tenha picado menos", () => {
    const r = modulo.calcularProcessamentoPessoa(entrada({ realizadoMinutos: 9590, contadoMinutos: 9600 }, []));
    expect(r.descontoFaltas).toBe(0);
  });

  it("aceitar o desvio de tempo a menos conta o realizado: o defice desconta", () => {
    const r = modulo.calcularProcessamentoPessoa(entrada({ realizadoMinutos: 9120, contadoMinutos: 9120 }, []));
    expect(r.descontoFaltas).toBeCloseTo((480 / 60) * (r.valorHoraReal as number), 2);
  });

  it("o subsidio usa os minutos contados do dia (sem eles, os realizados)", () => {
    const dias = [
      { estado: "normal" as const, realizadoMinutos: 290, contadoMinutos: 300 },
      { estado: "normal" as const, realizadoMinutos: 290 },
    ];
    // 290 min contados como 300 passam o limite (valor do dia); sem contado ficam abaixo (proporcional).
    expect(modulo.minutosTrabalhadosPorDia(dias)).toEqual([300, 290]);
    expect(modulo.minutosTrabalhadosPorDia(dias.map(({ contadoMinutos: _c, ...d }) => d))).toEqual([290, 290]);
  });

  it("um dia de ausencia continua fora do subsidio e um dia sem realizado tambem", () => {
    expect(
      modulo.minutosTrabalhadosPorDia([
        { estado: "ausencia", realizadoMinutos: 100, contadoMinutos: 500 },
        { estado: "normal", realizadoMinutos: 0, contadoMinutos: 500 },
      ]),
    ).toEqual([]);
  });
});
