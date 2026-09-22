import { describe, expect, it } from "vitest";
import {
  calcularProcessamentoPessoa,
  contarDiasElegiveisSubsidio,
  type EntradaProcessamentoPessoa,
  type RetribuicaoParaCalculo,
} from "@/lib/hr/processamentoTotais";
import type { HrCodigoProcessamento, HrProcessamentoLancamento } from "@/types/hr";
import type { DiaRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

function diaBase(
  overrides: Partial<Pick<DiaRelatorioMensal, "estado" | "realizadoMinutos">> = {},
): Pick<DiaRelatorioMensal, "estado" | "realizadoMinutos"> {
  return {
    estado: "normal",
    realizadoMinutos: 0,
    ...overrides,
  };
}

function totaisBase(
  overrides: Partial<EntradaProcessamentoPessoa["totais"]> = {},
): EntradaProcessamentoPessoa["totais"] {
  return {
    // 9600 min = 160h -- um mes-tipo, escolhido para dar contas redondas com
    // a retribuicao de omissao (1300 mensal, duodecimos 100%) dos testes que
    // nao o sobrescrevem. Os poucos testes que precisam mesmo de 0 (a guarda
    // de "sem horas planeadas") passam-no explicitamente.
    planeadoMinutos: 9600,
    realizadoMinutos: 0,
    minutosExtraNormal: 0,
    minutosFeriadoTrabalhado: 0,
    minutosDescansoTrabalhado: 0,
    horasExtraNoturnasMinutos: 0,
    minutosAusenciaRemunerada: 0,
    diasFeriadoTrabalhados: 0,
    diasDescansoTrabalhado: 0,
    ...overrides,
  };
}

function entradaBase(
  overrides: Partial<EntradaProcessamentoPessoa> = {},
): EntradaProcessamentoPessoa {
  return {
    totais: totaisBase(),
    diasElegiveisSubsidio: 0,
    retribuicao: null,
    codigos: [],
    lancamentos: [],
    regraSubsidio: null,
    ...overrides,
  };
}

function retribuicao(overrides: Partial<RetribuicaoParaCalculo> = {}): RetribuicaoParaCalculo {
  return {
    valorBase: 1000,
    periodicidade: "mensal",
    duodecimosPct: 100,
    subsidioAlimentacaoPessoa: null,
    ...overrides,
  };
}

function codigo(overrides: Partial<HrCodigoProcessamento> = {}): HrCodigoProcessamento {
  return {
    id: "codigo-1",
    organization_id: "org-1",
    codigo: "COD1",
    nome: "Codigo 1",
    descricao: null,
    activo: true,
    modo_calculo: "manual",
    percentagem: null,
    valor_fixo: null,
    origem_automatica: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function lancamento(overrides: Partial<HrProcessamentoLancamento> = {}): HrProcessamentoLancamento {
  return {
    id: "lancamento-1",
    periodo_id: "periodo-1",
    pessoa_id: "pessoa-1",
    organization_id: "org-1",
    descricao: "Premio",
    valor: 0,
    codigo_processamento_id: null,
    anulado_em: null,
    anulado_por: null,
    anulado_motivo: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...overrides,
  };
}

describe("calcularProcessamentoPessoa", () => {
  describe("valor da hora real", () => {
    it("calcula a partir das horas REAIS planeadas do mes, nao de uma media anual", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ planeadoMinutos: 9600 }), // 160h
        }),
      );
      // baseMes = (1300*14)/12 = 1516.6666...; valorHoraReal = baseMes/(9600/60)
      // = 1516.6666.../160 = 9.479166666666668 (valor real produzido pelo teste).
      expect(resultado.valorHoraReal).toBeCloseTo(9.479166666666668, 6);
    });

    it("e null quando falta a retribuicao", () => {
      const resultado = calcularProcessamentoPessoa(entradaBase({ retribuicao: null }));
      expect(resultado.valorHoraReal).toBeNull();
      expect(resultado.avisos).toContain("sem_retribuicao");
    });

    it("planeadoMinutos <= 0 da valorHoraReal null com aviso, sem contaminar o total com Infinity/NaN", () => {
      for (const planeadoMinutos of [0, -60]) {
        const resultado = calcularProcessamentoPessoa(
          entradaBase({
            retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
            totais: totaisBase({ planeadoMinutos, realizadoMinutos: 0, minutosExtraNormal: 120 }),
            regraSubsidio: { valorDiario: 6 },
            diasElegiveisSubsidio: 10,
            lancamentos: [lancamento({ id: "l1", valor: 20 })],
            codigos: [
              codigo({
                id: "he",
                modo_calculo: "percentagem_hora_normal",
                origem_automatica: "horas_extra",
                percentagem: 50,
              }),
            ],
          }),
        );
        expect(resultado.valorHoraReal).toBeNull();
        expect(resultado.avisos).toContain("sem_horas_planeadas_no_mes");
        expect(resultado.descontoFaltas).toBe(0);
        expect(resultado.linhasAutomaticas[0]?.valor).toBe(0);
        expect(resultado.totalBrutoEstimado).not.toBeNull();
        expect(Number.isFinite(resultado.totalBrutoEstimado as number)).toBe(true);
      }
    });

    it("retribuicao a zero da valorHoraReal 0, sem Infinity nem NaN em lado nenhum do resultado", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 0, periodicidade: "mensal" }),
          totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9000 }),
          regraSubsidio: { valorDiario: 6 },
          diasElegiveisSubsidio: 5,
        }),
      );
      expect(resultado.baseMes).toBe(0);
      expect(resultado.valorHoraReal).toBe(0);
      expect(Number.isFinite(resultado.descontoFaltas)).toBe(true);
      expect(resultado.totalBrutoEstimado).not.toBeNull();
      expect(Number.isFinite(resultado.totalBrutoEstimado as number)).toBe(true);
    });

    it("falta parcial e codigo de horas extra usam exactamente o mesmo valorHoraReal -- uma so unidade de hora", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({
            planeadoMinutos: 9600,
            realizadoMinutos: 9000, // deficit de 600 min = 10h
            minutosExtraNormal: 120, // 2h extra
          }),
          codigos: [
            codigo({
              id: "he",
              modo_calculo: "percentagem_hora_normal",
              origem_automatica: "horas_extra",
              percentagem: 100,
            }),
          ],
        }),
      );
      expect(resultado.valorHoraReal).not.toBeNull();
      const deficitHoras = (9600 - 9000) / 60;
      const horasExtra = 120 / 60;
      const valorHoraDoDesconto = resultado.descontoFaltas / deficitHoras;
      const valorHoraDoCodigo = resultado.linhasAutomaticas[0].valor / horasExtra;
      expect(valorHoraDoDesconto).toBeCloseTo(valorHoraDoCodigo, 6);
      expect(valorHoraDoDesconto).toBeCloseTo(resultado.valorHoraReal as number, 6);
    });
  });

  describe("invariante central -- cumprir o planeado da exactamente a base, seja qual for o tamanho do mes", () => {
    it.each([9600, 11880])("mensal: planeadoMinutos = %i, sem codigos/subsidio/lancamentos", (planeadoMinutos) => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal", duodecimosPct: 100 }),
          totais: totaisBase({ planeadoMinutos, realizadoMinutos: planeadoMinutos }),
        }),
      );
      expect(resultado.baseMes).not.toBeNull();
      expect(resultado.totalBrutoEstimado).toBeCloseTo(resultado.baseMes as number, 6);
    });

    it.each([4080, 9600])("hora: planeadoMinutos = %i, sem codigos/subsidio/lancamentos", (planeadoMinutos) => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 5.4, periodicidade: "hora", duodecimosPct: 100 }),
          totais: totaisBase({ planeadoMinutos, realizadoMinutos: planeadoMinutos }),
        }),
      );
      expect(resultado.baseMes).not.toBeNull();
      expect(resultado.totalBrutoEstimado).toBeCloseTo(resultado.baseMes as number, 6);
    });
  });

  describe("regimes de duodecimos", () => {
    it("0% usa divisor 14, sem subsidios diluidos", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1400, periodicidade: "mensal", duodecimosPct: 0 }),
        }),
      );
      expect(resultado.divisorDuodecimos).toBe(14);
      expect(resultado.baseMes).toBeCloseTo((1400 * 14) / 14, 6);
      expect(resultado.avisos).not.toContain("duodecimos_por_decidir");
    });

    it("50% dilui metade de cada subsidio -- confirmado com a contabilidade, nao e interpolacao linear", () => {
      // R = 1200: metade de cada subsidio (0,5 x 1200 + 0,5 x 1200 = 1200) dilui-se
      // nos 12 meses, a par dos 12 x 1200 normais -- (12x1200 + 1200)/12 = 1300,00.
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1200, periodicidade: "mensal", duodecimosPct: 50 }),
        }),
      );
      expect(resultado.divisorDuodecimos).toBeCloseTo(168 / 13, 10);
      expect(resultado.divisorDuodecimos).not.toBe(13);
      expect(resultado.baseMes).toBeCloseTo(1300, 6);
    });

    it("100% usa divisor 12", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1200, periodicidade: "mensal", duodecimosPct: 100 }),
        }),
      );
      expect(resultado.divisorDuodecimos).toBe(12);
      expect(resultado.baseMes).toBeCloseTo((1200 * 14) / 12, 6);
    });

    it("null comporta-se como 0% e gera aviso de decisao pendente", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1400, periodicidade: "mensal", duodecimosPct: null }),
        }),
      );
      expect(resultado.divisorDuodecimos).toBe(14);
      expect(resultado.avisos).toContain("duodecimos_por_decidir");
    });
  });

  describe("periodicidades", () => {
    it("mensal usa o valor base directamente", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal", duodecimosPct: 100 }),
        }),
      );
      expect(resultado.baseMes).toBeCloseTo((1000 * 14) / 12, 6);
    });

    it("anual divide por 12", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 12000, periodicidade: "anual", duodecimosPct: 100 }),
        }),
      );
      // R = 12000/12 = 1000
      expect(resultado.baseMes).toBeCloseTo((1000 * 14) / 12, 6);
    });

    it("semanal converte por *52/12", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 230.77, periodicidade: "semanal", duodecimosPct: 100 }),
        }),
      );
      const rEsperado = (230.77 * 52) / 12;
      expect(resultado.baseMes).toBeCloseTo((rEsperado * 14) / 12, 4);
    });

    it("hora calcula directamente a partir das horas REAIS planeadas do mes, nao de uma media anual (52/12)", () => {
      // O bug: 68h a 5.40 EUR/hora tinha de dar 367.20 EUR, e dava 351.00 EUR
      // pela formula antiga 5.40 * 15 (horas semanais) * 52/12.
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 5.4, periodicidade: "hora", duodecimosPct: 0 }),
          totais: totaisBase({ planeadoMinutos: 4080 }), // 68h
        }),
      );
      expect(resultado.baseMes).toBeCloseTo(367.2, 2);
      expect(resultado.baseMes).not.toBeCloseTo(351.0, 2);
    });

    it("hora: a base varia com o mes (numero real de horas planeadas), ao contrario de mensal", () => {
      const baseMesHora = (planeadoMinutos: number) =>
        calcularProcessamentoPessoa(
          entradaBase({
            retribuicao: retribuicao({ valorBase: 5.4, periodicidade: "hora", duodecimosPct: 0 }),
            totais: totaisBase({ planeadoMinutos }),
          }),
        ).baseMes;

      expect(baseMesHora(4080)).toBeCloseTo(367.2, 2); // 68h
      expect(baseMesHora(3600)).toBeCloseTo(324.0, 2); // 60h

      const baseMesMensal = (planeadoMinutos: number) =>
        calcularProcessamentoPessoa(
          entradaBase({
            retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal", duodecimosPct: 0 }),
            totais: totaisBase({ planeadoMinutos }),
          }),
        ).baseMes;

      expect(baseMesMensal(4080)).toBe(baseMesMensal(3600));
    });

    it("hora: duodecimos continuam a aplicar-se, tal como no caso mensal", () => {
      const resultado100 = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 5.4, periodicidade: "hora", duodecimosPct: 100 }),
          totais: totaisBase({ planeadoMinutos: 4080 }), // 68h
        }),
      );
      // R = 367.20; baseMes = R*14/12 = 428.40; valorHoraReal = baseMes/68 = 6.30.
      expect(resultado100.baseMes).toBeCloseTo(428.4, 2);
      expect(resultado100.valorHoraReal).toBeCloseTo(6.3, 2);

      const resultado50 = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 5.4, periodicidade: "hora", duodecimosPct: 50 }),
          totais: totaisBase({ planeadoMinutos: 4080 }),
        }),
      );
      expect(resultado50.divisorDuodecimos).toBeCloseTo(168 / 13, 10);
    });

    it("hora sem horas planeadas no mes: baseMes 0, sem valorHoraReal, mas subsidio e lancamentos continuam a contar", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 5.4, periodicidade: "hora", duodecimosPct: 0 }),
          totais: totaisBase({ planeadoMinutos: 0 }),
          regraSubsidio: { valorDiario: 6 },
          diasElegiveisSubsidio: 10,
          lancamentos: [lancamento({ id: "l1", valor: 20 })],
        }),
      );
      expect(resultado.baseMes).toBe(0);
      expect(resultado.valorHoraReal).toBeNull();
      expect(resultado.avisos).toContain("sem_horas_planeadas_no_mes");
      expect(resultado.descontoFaltas).toBe(0);
      expect(resultado.totalBrutoEstimado).not.toBeNull();
      expect(Number.isFinite(resultado.totalBrutoEstimado as number)).toBe(true);
    });

    it.each(["mensal", "semanal", "anual"] as const)(
      "%s: baseMes nao depende de planeadoMinutos (nao ha calendario a converter)",
      (periodicidade) => {
        const baseMesPara = (planeadoMinutos: number) =>
          calcularProcessamentoPessoa(
            entradaBase({
              retribuicao: retribuicao({ valorBase: 1000, periodicidade, duodecimosPct: 100 }),
              totais: totaisBase({ planeadoMinutos }),
            }),
          ).baseMes;

        expect(baseMesPara(4080)).toBeCloseTo(baseMesPara(9600) as number, 6);
      },
    );

    it("diaria da null com aviso de nao convertivel", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 50, periodicidade: "diaria", duodecimosPct: 100 }),
        }),
      );
      expect(resultado.baseMes).toBeNull();
      expect(resultado.avisos).toContain("periodicidade_nao_convertivel");
    });
  });

  it("codigo percentagem_hora_normal com origem horas_extra isolado", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
        totais: totaisBase({ minutosExtraNormal: 120 }),
        codigos: [
          codigo({
            id: "he",
            modo_calculo: "percentagem_hora_normal",
            origem_automatica: "horas_extra",
            percentagem: 50,
          }),
        ],
      }),
    );
    // baseMes = (1300*14)/12 = 1516.6666...; valorHoraReal = baseMes/(9600/60)
    // = 9.479166666666668; horas = 2; valor = 2 * 9.479166666666668 * 0.5.
    expect(resultado.linhasAutomaticas).toHaveLength(1);
    expect(resultado.linhasAutomaticas[0].valor).toBeCloseTo(9.479166666666668, 6);
    expect(resultado.totalCodigosAutomaticos).toBeCloseTo(9.479166666666668, 6);
  });

  it("horas nocturnas empilham com feriado trabalhado -- os dois valores somam ao total", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
        totais: totaisBase({
          minutosFeriadoTrabalhado: 480,
          horasExtraNoturnasMinutos: 240,
        }),
        codigos: [
          codigo({
            id: "feriado",
            modo_calculo: "percentagem_hora_normal",
            origem_automatica: "feriado_trabalhado",
            percentagem: 200,
          }),
          codigo({
            id: "noturno",
            modo_calculo: "percentagem_hora_normal",
            origem_automatica: "horas_extra_noturnas",
            percentagem: 25,
          }),
        ],
      }),
    );

    expect(resultado.linhasAutomaticas).toHaveLength(2);
    const valorFeriado = resultado.linhasAutomaticas.find((l) => l.codigoId === "feriado")!.valor;
    const valorNoturno = resultado.linhasAutomaticas.find((l) => l.codigoId === "noturno")!.valor;
    // valorHoraReal = 9.479166666666668 (baseMes 1516.6666.../160h planeadas)
    expect(valorFeriado).toBeCloseTo((480 / 60) * 9.479166666666668 * 2, 6);
    expect(valorNoturno).toBeCloseTo((240 / 60) * 9.479166666666668 * 0.25, 6);
    expect(resultado.totalCodigosAutomaticos).toBeCloseTo(valorFeriado + valorNoturno, 6);
  });

  it("codigo valor_fixo_ocorrencia com feriado_trabalhado usa dias, nao minutos", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        totais: totaisBase({ diasFeriadoTrabalhados: 3 }),
        codigos: [
          codigo({
            id: "feriado-fixo",
            modo_calculo: "valor_fixo_ocorrencia",
            origem_automatica: "feriado_trabalhado",
            valor_fixo: 25,
          }),
        ],
      }),
    );
    expect(resultado.linhasAutomaticas).toHaveLength(1);
    expect(resultado.linhasAutomaticas[0].valor).toBe(75);
    expect(resultado.linhasAutomaticas[0].horas).toBeNull();
  });

  it("codigo valor_fixo_mensal entra sempre, uma vez, mesmo sem origem", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        codigos: [
          codigo({ id: "fixo", modo_calculo: "valor_fixo_mensal", origem_automatica: null, valor_fixo: 100 }),
        ],
      }),
    );
    expect(resultado.linhasAutomaticas).toHaveLength(1);
    expect(resultado.linhasAutomaticas[0]).toMatchObject({
      codigoId: "fixo",
      origem: null,
      horas: null,
      valor: 100,
    });
  });

  it("valor_fixo_ocorrencia com horas_extra (combinacao nao suportada) nao gera linha", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        totais: totaisBase({ minutosExtraNormal: 120 }),
        codigos: [
          codigo({
            id: "he-fixo",
            modo_calculo: "valor_fixo_ocorrencia",
            origem_automatica: "horas_extra",
            valor_fixo: 25,
          }),
        ],
      }),
    );
    expect(resultado.linhasAutomaticas).toHaveLength(0);
    expect(resultado.totalCodigosAutomaticos).toBe(0);
  });

  describe("desconto de faltas", () => {
    it("mes com deficit desconta a diferenca ao valor da hora", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9000 }),
        }),
      );
      // deficit = 600 min = 10h; valorHoraReal = 9.479166666666668 (baseMes
      // 1516.6666.../160h planeadas) -> desconto = 10 * 9.479166666666668.
      expect(resultado.descontoFaltas).toBeCloseTo(94.79166666666669, 6);
    });

    it("mes com excedente da desconto 0", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ planeadoMinutos: 9000, realizadoMinutos: 9600 }),
        }),
      );
      expect(resultado.descontoFaltas).toBe(0);
    });
  });

  describe("ausencia remunerada (ferias) neutraliza o desconto de faltas", () => {
    it("um dia de ferias sozinho no mes: 8h planeadas, 0h picadas -> 0 de desconto, total = base do dia (nao 0)", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1600, periodicidade: "mensal", duodecimosPct: 0 }),
          totais: totaisBase({
            planeadoMinutos: 480,
            realizadoMinutos: 0,
            minutosAusenciaRemunerada: 480,
          }),
        }),
      );
      expect(resultado.descontoFaltas).toBe(0);
      expect(resultado.baseMes).toBe(1600);
      expect(resultado.totalBrutoEstimado).toBe(resultado.baseMes);
    });

    it("mes de 20 dias com 1 dia de ferias: 19 dias picados cobrem o resto -> 0 de desconto", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1600, periodicidade: "mensal", duodecimosPct: 0 }),
          totais: totaisBase({
            planeadoMinutos: 9600, // 20 dias * 8h
            realizadoMinutos: 9120, // 19 dias * 8h
            minutosAusenciaRemunerada: 480, // o dia de ferias
          }),
        }),
      );
      expect(resultado.descontoFaltas).toBe(0);
      expect(resultado.totalBrutoEstimado).toBe(resultado.baseMes);
    });

    it("ferias E uma falta a serio no mesmo mes: desconta so a falta (8h), nao os dois dias (16h)", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1600, periodicidade: "mensal", duodecimosPct: 0 }),
          totais: totaisBase({
            planeadoMinutos: 9600,
            realizadoMinutos: 8640, // faltam 16h ao todo
            minutosAusenciaRemunerada: 480, // so 8h sao ferias
          }),
        }),
      );
      // valorHoraReal = 1600 / 160h = 10; defice real = 16h - 8h(ferias) = 8h.
      expect(resultado.valorHoraReal).toBeCloseTo(10, 6);
      expect(resultado.descontoFaltas).toBeCloseTo(80, 6);
    });

    it("periodicidade a hora: o dia de ferias continua pago -- nao e a opcao (a) descartada no desenho", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 10, periodicidade: "hora", duodecimosPct: 0 }),
          totais: totaisBase({
            planeadoMinutos: 9600,
            realizadoMinutos: 9120,
            minutosAusenciaRemunerada: 480,
          }),
        }),
      );
      expect(resultado.baseMes).toBe(1600);
      expect(resultado.descontoFaltas).toBe(0);
    });

    it("trabalhar durante as ferias nao gera desconto negativo", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1600, periodicidade: "mensal", duodecimosPct: 0 }),
          totais: totaisBase({
            planeadoMinutos: 9600,
            realizadoMinutos: 9200, // mais do que planeado - ferias
            minutosAusenciaRemunerada: 480,
          }),
        }),
      );
      expect(resultado.descontoFaltas).toBe(0);
    });

    it("minutosAusenciaRemunerada superior ao defice nao gera credito no total", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1600, periodicidade: "mensal", duodecimosPct: 0 }),
          totais: totaisBase({
            planeadoMinutos: 9600,
            realizadoMinutos: 9600, // sem defice nenhum
            minutosAusenciaRemunerada: 480,
          }),
        }),
      );
      expect(resultado.descontoFaltas).toBe(0);
      expect(resultado.totalBrutoEstimado).toBe(resultado.baseMes);
    });
  });

  describe("subsidio de alimentacao", () => {
    it("excepcao da pessoa ganha a regra da organizacao", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ subsidioAlimentacaoPessoa: 10 }),
          regraSubsidio: { valorDiario: 6 },
          diasElegiveisSubsidio: 20,
        }),
      );
      expect(resultado.subsidioAlimentacao).toBe(200);
    });

    it("sem excepcao usa a regra da organizacao", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ subsidioAlimentacaoPessoa: null }),
          regraSubsidio: { valorDiario: 6 },
          diasElegiveisSubsidio: 20,
        }),
      );
      expect(resultado.subsidioAlimentacao).toBe(120);
    });

    it("sem nenhuma das duas da 0 com aviso", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ subsidioAlimentacaoPessoa: null }),
          regraSubsidio: null,
          diasElegiveisSubsidio: 20,
        }),
      );
      expect(resultado.subsidioAlimentacao).toBe(0);
      expect(resultado.avisos).toContain("sem_regra_subsidio");
    });
  });

  describe("lancamentos pontuais", () => {
    it("exclui anulados e inclui negativos", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          lancamentos: [
            lancamento({ id: "l1", valor: 100, anulado_em: null }),
            lancamento({ id: "l2", valor: 50, anulado_em: "2026-01-05T00:00:00Z" }),
            lancamento({ id: "l3", valor: -30, anulado_em: null }),
          ],
        }),
      );
      expect(resultado.lancamentosPontuais).toBe(70);
    });
  });

  it("nao muta a entrada nem os arrays recebidos", () => {
    const entrada = entradaBase({
      retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
      totais: totaisBase({ minutosFeriadoTrabalhado: 60, diasFeriadoTrabalhados: 1 }),
      codigos: [
        codigo({
          id: "feriado",
          modo_calculo: "percentagem_hora_normal",
          origem_automatica: "feriado_trabalhado",
          percentagem: 200,
        }),
      ],
      lancamentos: [lancamento({ id: "l1", valor: 10 })],
    });
    const copia = JSON.parse(JSON.stringify(entrada));

    calcularProcessamentoPessoa(entrada);

    expect(entrada).toEqual(copia);
  });

  it("falta o mes inteiro: o desconto fica perto da base e o total perto de subsidio+lancamentos", () => {
    // Com a formula real, o desconto de faltar TODO o planeado nunca pode
    // ultrapassar a base -- por construcao, desconto = deficitHoras *
    // (baseMes / planeadoHoras), e quando deficitHoras == planeadoHoras o
    // desconto e exactamente baseMes (a menos de arredondamento).
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal", duodecimosPct: 100 }),
        totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 0 }),
      }),
    );
    expect(resultado.baseMes).not.toBeNull();
    expect(resultado.descontoFaltas).toBeCloseTo(resultado.baseMes as number, 6);
    expect(resultado.totalBrutoEstimado).toBeCloseTo(
      resultado.subsidioAlimentacao + resultado.lancamentosPontuais,
      6,
    );
  });

  it("o clamp a zero ainda protege contra um lancamento pontual muito negativo, mesmo sem faltas nenhumas", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal", duodecimosPct: 100 }),
        totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9600 }), // sem faltas
        lancamentos: [lancamento({ id: "l1", valor: -5000 })],
      }),
    );
    expect(resultado.descontoFaltas).toBe(0);
    expect(resultado.totalBrutoEstimado).toBe(0);
  });

  it("tudo em falta (sem retribuicao): valores derivados dela ficam null, o resto continua a calcular-se", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: null,
        totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9000 }),
        regraSubsidio: { valorDiario: 6 },
        diasElegiveisSubsidio: 20,
        lancamentos: [lancamento({ id: "l1", valor: 15 })],
      }),
    );

    expect(resultado.valorHoraReal).toBeNull();
    expect(resultado.baseMes).toBeNull();
    expect(resultado.totalBrutoEstimado).toBeNull();

    // O que nao depende da retribuicao continua a calcular-se.
    expect(resultado.descontoFaltas).toBe(0); // valorHoraReal null -> nunca null-propagar, fica 0
    expect(resultado.subsidioAlimentacao).toBe(120);
    expect(resultado.lancamentosPontuais).toBe(15);
    expect(resultado.avisos).toContain("sem_retribuicao");
  });
});

describe("contarDiasElegiveisSubsidio", () => {
  it("conta so os dias com realizadoMinutos >= minimo", () => {
    const dias = [
      diaBase({ realizadoMinutos: 500 }), // >= 300, conta
      diaBase({ realizadoMinutos: 200 }), // < 300, nao conta
      diaBase({ realizadoMinutos: 300 }), // == 300, conta (fronteira inclusiva)
      diaBase({ realizadoMinutos: 0 }), // nao conta
    ];
    expect(contarDiasElegiveisSubsidio(dias, 300)).toBe(2);
  });

  it("um dia de ausencia com realizadoMinutos alto nao conta -- mesma exclusao dos outros totais", () => {
    const dias = [
      diaBase({ estado: "ausencia", realizadoMinutos: 600 }),
      diaBase({ estado: "normal", realizadoMinutos: 600 }),
    ];
    expect(contarDiasElegiveisSubsidio(dias, 300)).toBe(1);
  });

  it("minimo a 0 conta todos os dias com qualquer minuto trabalhado", () => {
    const dias = [
      diaBase({ realizadoMinutos: 1 }),
      diaBase({ realizadoMinutos: 0 }),
      diaBase({ realizadoMinutos: 480 }),
    ];
    // realizadoMinutos >= 0 e sempre verdade -- os tres dias contam.
    expect(contarDiasElegiveisSubsidio(dias, 0)).toBe(3);
  });

  it("array vazio da 0", () => {
    expect(contarDiasElegiveisSubsidio([], 300)).toBe(0);
  });
});
