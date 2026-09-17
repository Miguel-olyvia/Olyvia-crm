import { describe, expect, it } from "vitest";
import {
  calcularProcessamentoPessoa,
  type EntradaProcessamentoPessoa,
  type RetribuicaoParaCalculo,
} from "@/lib/hr/processamentoTotais";
import type { HrCodigoProcessamento, HrProcessamentoLancamento } from "@/types/hr";

function totaisBase(
  overrides: Partial<EntradaProcessamentoPessoa["totais"]> = {},
): EntradaProcessamentoPessoa["totais"] {
  return {
    planeadoMinutos: 0,
    realizadoMinutos: 0,
    minutosExtraNormal: 0,
    minutosFeriadoTrabalhado: 0,
    minutosDescansoTrabalhado: 0,
    horasExtraNoturnasMinutos: 0,
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
    horasSemanaisEquivalentes: null,
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
  describe("valor da hora normal", () => {
    it("calcula com retribuicao mensal e horas semanais normais", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      // valorHoraNormal = (R*12)/(52*40) = (1300*12)/2080 = 7.5
      expect(resultado.valorHoraNormal).toBeCloseTo(7.5, 6);
    });

    it("e null quando falta a retribuicao", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({ retribuicao: null, horasSemanaisEquivalentes: 40 }),
      );
      expect(resultado.valorHoraNormal).toBeNull();
      expect(resultado.avisos).toContain("sem_retribuicao");
    });

    it("e null quando faltam as horas semanais", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ periodicidade: "mensal" }),
          horasSemanaisEquivalentes: null,
        }),
      );
      expect(resultado.valorHoraNormal).toBeNull();
    });

    it("periodicidade mensal com horasSemanaisEquivalentes 0 da null com aviso sem_horas_semanais", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          horasSemanaisEquivalentes: 0,
        }),
      );
      expect(resultado.valorHoraNormal).toBeNull();
      expect(resultado.avisos).toContain("sem_horas_semanais");
    });
  });

  describe("regimes de duodecimos", () => {
    it("0% usa divisor 14 e nao gera aviso de aproximacao", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1400, periodicidade: "mensal", duodecimosPct: 0 }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      expect(resultado.divisorDuodecimos).toBe(14);
      expect(resultado.baseMes).toBeCloseTo((1400 * 14) / 14, 6);
      expect(resultado.avisos).not.toContain("duodecimos_50_aproximado");
      expect(resultado.avisos).not.toContain("duodecimos_por_decidir");
    });

    it("50% usa divisor 13 com aviso de aproximacao", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal", duodecimosPct: 50 }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      expect(resultado.divisorDuodecimos).toBe(13);
      expect(resultado.baseMes).toBeCloseTo((1300 * 14) / 13, 6);
      expect(resultado.avisos).toContain("duodecimos_50_aproximado");
    });

    it("100% usa divisor 12", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1200, periodicidade: "mensal", duodecimosPct: 100 }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      expect(resultado.divisorDuodecimos).toBe(12);
      expect(resultado.baseMes).toBeCloseTo((1200 * 14) / 12, 6);
    });

    it("null comporta-se como 0% e gera aviso de decisao pendente", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1400, periodicidade: "mensal", duodecimosPct: null }),
          horasSemanaisEquivalentes: 40,
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
          horasSemanaisEquivalentes: 40,
        }),
      );
      expect(resultado.baseMes).toBeCloseTo((1000 * 14) / 12, 6);
    });

    it("anual divide por 12", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 12000, periodicidade: "anual", duodecimosPct: 100 }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      // R = 12000/12 = 1000
      expect(resultado.baseMes).toBeCloseTo((1000 * 14) / 12, 6);
    });

    it("semanal converte por *52/12", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 230.77, periodicidade: "semanal", duodecimosPct: 100 }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      const rEsperado = (230.77 * 52) / 12;
      expect(resultado.baseMes).toBeCloseTo((rEsperado * 14) / 12, 4);
    });

    it("hora converte usando horasSemanaisEquivalentes", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 7.5, periodicidade: "hora", duodecimosPct: 100 }),
          horasSemanaisEquivalentes: 40,
        }),
      );
      const rEsperado = (7.5 * 40 * 52) / 12;
      expect(resultado.baseMes).toBeCloseTo((rEsperado * 14) / 12, 4);
    });

    it("hora sem horasSemanaisEquivalentes da null com aviso", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 7.5, periodicidade: "hora", duodecimosPct: 100 }),
          horasSemanaisEquivalentes: null,
        }),
      );
      expect(resultado.baseMes).toBeNull();
      expect(resultado.avisos).toContain("sem_horas_semanais");
    });

    it("diaria da null com aviso de nao convertivel", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 50, periodicidade: "diaria", duodecimosPct: 100 }),
          horasSemanaisEquivalentes: 40,
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
        horasSemanaisEquivalentes: 40,
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
    // valorHoraNormal = 7.5; horas = 2; valor = 2 * 7.5 * 0.5 = 7.5
    expect(resultado.linhasAutomaticas).toHaveLength(1);
    expect(resultado.linhasAutomaticas[0].valor).toBeCloseTo(7.5, 6);
    expect(resultado.totalCodigosAutomaticos).toBeCloseTo(7.5, 6);
  });

  it("horas nocturnas empilham com feriado trabalhado -- os dois valores somam ao total", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
        horasSemanaisEquivalentes: 40,
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
    // valorHoraNormal = 7.5
    expect(valorFeriado).toBeCloseTo((480 / 60) * 7.5 * 2, 6);
    expect(valorNoturno).toBeCloseTo((240 / 60) * 7.5 * 0.25, 6);
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
          horasSemanaisEquivalentes: 40,
          totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9000 }),
        }),
      );
      // deficit = 600 min = 10h; valorHoraNormal = 7.5 -> desconto = 75
      expect(resultado.descontoFaltas).toBeCloseTo(75, 6);
    });

    it("mes com excedente da desconto 0", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          horasSemanaisEquivalentes: 40,
          totais: totaisBase({ planeadoMinutos: 9000, realizadoMinutos: 9600 }),
        }),
      );
      expect(resultado.descontoFaltas).toBe(0);
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
      horasSemanaisEquivalentes: 40,
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

  it("total bruto estimado nunca fica negativo -- zero dias trabalhados desconta mais do que a base", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: retribuicao({ valorBase: 200, periodicidade: "mensal", duodecimosPct: 100 }),
        // Horas semanais baixas -> valorHoraNormal alto (200*12/(52*1) ~ 46.15
        // €/h), para que o desconto de um mes inteiro sem trabalhar (160h)
        // ultrapasse largamente a base de ~233.33 €.
        horasSemanaisEquivalentes: 1,
        totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 0 }),
      }),
    );
    expect(resultado.descontoFaltas).toBeGreaterThan(resultado.baseMes ?? 0);
    expect(resultado.totalBrutoEstimado).toBe(0);
  });

  it("tudo em falta (sem retribuicao): valores derivados dela ficam null, o resto continua a calcular-se", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        retribuicao: null,
        horasSemanaisEquivalentes: 40,
        totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9000 }),
        regraSubsidio: { valorDiario: 6 },
        diasElegiveisSubsidio: 20,
        lancamentos: [lancamento({ id: "l1", valor: 15 })],
      }),
    );

    expect(resultado.valorHoraNormal).toBeNull();
    expect(resultado.baseMes).toBeNull();
    expect(resultado.totalBrutoEstimado).toBeNull();

    // O que nao depende da retribuicao continua a calcular-se.
    expect(resultado.descontoFaltas).toBe(0); // valorHoraNormal null -> nunca null-propagar, fica 0
    expect(resultado.subsidioAlimentacao).toBe(120);
    expect(resultado.lancamentosPontuais).toBe(15);
    expect(resultado.avisos).toContain("sem_retribuicao");
  });
});
