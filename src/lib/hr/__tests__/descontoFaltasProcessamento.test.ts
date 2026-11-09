import { describe, expect, it, vi } from "vitest";
import {
  calcularProcessamentoPessoa,
  type EntradaProcessamentoPessoa,
} from "@/lib/hr/processamentoTotais";
import {
  TOLERANCIA_ATRASO_MINUTOS,
  assinaturaDeFaltas,
  descontoDaFalta,
  type FaltaDoPeriodo,
} from "@/lib/hr/descontoFalta";
import { descontoDaFalta as descontoDoCartao } from "@/components/rh-exemplo/lib/faltasB";
import { TOLERANCIA_ATRASO_MINUTOS as TOLERANCIA_DO_EXEMPLO } from "@/components/rh-exemplo/lib/horarioTipos";
import { MAX_AVISOS_POR_PESSOA, avisosParaGravar } from "@/lib/hr/resultadosFecho";

vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: vi.fn(), isPermissionError: () => false }));

const cent = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

const DIA = "2026-03-10";
const OUTRO_DIA = "2026-03-11";

function falta(overrides: Partial<FaltaDoPeriodo & { semRegisto?: boolean }> = {}): FaltaDoPeriodo & { semRegisto?: boolean } {
  return {
    data: DIA,
    minutos: 480,
    estado: "activa",
    justificacao_estado: "sem_justificacao",
    remunerada: false,
    motivo_codigo: "ausencia_nao_comunicada",
    ...overrides,
  };
}

/** Um mes de 160 h planeadas (20 dias de 8 h), mensal 1000 EUR; o desconto depende so das faltas. */
function entrada(
  faltas: EntradaProcessamentoPessoa["totais"]["faltas"],
  totais: Partial<EntradaProcessamentoPessoa["totais"]> = {},
): EntradaProcessamentoPessoa {
  return {
    totais: {
      planeadoMinutos: 9600,
      realizadoMinutos: 9120,
      minutosExtraNormal: 0,
      minutosFeriadoTrabalhado: 0,
      minutosDescansoTrabalhado: 0,
      horasExtraNoturnasMinutos: 0,
      minutosAusenciaRemunerada: 0,
      diasFeriadoTrabalhados: 0,
      diasDescansoTrabalhado: 0,
      faltas,
      ...totais,
    },
    minutosPorDia: [],
    minutosNoturnosPorFaixa: [],
    regra: null,
    direitoIht: false,
    retribuicao: { valorBase: 1000, periodicidade: "mensal", duodecimosPct: 100 },
    codigos: [],
    lancamentos: [],
  };
}

function calcular(faltas: EntradaProcessamentoPessoa["totais"]["faltas"], totais: Partial<EntradaProcessamentoPessoa["totais"]> = {}) {
  const resultado = calcularProcessamentoPessoa(entrada(faltas, totais));
  const valorHora = resultado.valorHoraReal as number;
  return { resultado, valorHora, oito: cent(8 * valorHora), quatro: cent(4 * valorHora) };
}

describe("desconto de faltas no processamento: por falta, nao pelo defice do mes", () => {
  it("falta nao justificada de um dia de 8 h desconta 8 horas", () => {
    const { resultado, oito } = calcular([falta()], { realizadoMinutos: 9120 });
    expect(oito).toBeGreaterThan(0);
    expect(resultado.descontoFaltas).toBe(oito);
  });

  it("falta justificada e paga nao desconta, mesmo com o dia sem picagem", () => {
    const { resultado } = calcular([falta({ justificacao_estado: "justificada", remunerada: true })]);
    expect(resultado.descontoFaltas).toBe(0);
  });

  it("falta justificada e NAO paga desconta 8 horas", () => {
    const { resultado, oito } = calcular([falta({ justificacao_estado: "justificada", remunerada: false })]);
    expect(resultado.descontoFaltas).toBe(oito);
  });

  it("falta anulada ou corrigida nao desconta", () => {
    expect(calcular([falta({ estado: "anulada" })]).resultado.descontoFaltas).toBe(0);
    expect(calcular([falta({ estado: "corrigida" })]).resultado.descontoFaltas).toBe(0);
  });

  it("justificacao recusada desconta 8 horas", () => {
    const { resultado, oito } = calcular([falta({ justificacao_estado: "recusada" })]);
    expect(resultado.descontoFaltas).toBe(oito);
  });

  it("dia planeado sem falta e sem picagem desconta 8 horas, como falta nao justificada, e avisa", () => {
    const { resultado, oito } = calcular([falta({ semRegisto: true, motivo_codigo: "ausencia_nao_comunicada" })]);
    expect(resultado.descontoFaltas).toBe(oito);
    expect(resultado.avisos).toContain("dias_sem_picagem_descontados");
    expect(resultado.avisos).not.toContain("faltas_provisorias");
  });

  it("dia com falta anulada e sem picagem = 0 e sem aviso de dias sem picagem; sem falta nenhuma e sem picagem = 8 h", () => {
    const tratado = calcular([falta({ estado: "anulada" })]);
    expect(tratado.resultado.descontoFaltas).toBe(0);
    expect(tratado.resultado.avisos).not.toContain("dias_sem_picagem_descontados");
    const semNada = calcular([falta({ semRegisto: true })]);
    expect(semNada.resultado.descontoFaltas).toBe(semNada.oito);
    expect(semNada.resultado.avisos).toContain("dias_sem_picagem_descontados");
  });

  it("com a justificacao do dia aprovada (falta justificada e paga) o dia deixa de descontar e o aviso desaparece", () => {
    const { resultado } = calcular([falta({ justificacao_estado: "justificada", remunerada: true })]);
    expect(resultado.descontoFaltas).toBe(0);
    expect(resultado.avisos).not.toContain("dias_sem_picagem_descontados");
  });

  it("meio dia de ausencia paga com 4 h picadas: sem falta, desconto 0", () => {
    const { resultado } = calcular([], { realizadoMinutos: 9600 - 240, minutosAusenciaRemunerada: 240 });
    expect(resultado.descontoFaltas).toBe(0);
  });

  it("meio dia de ausencia paga: so as 4 h que a ausencia nao cobre podem descontar", () => {
    const { resultado, quatro } = calcular([falta({ minutos: 480 })], { limiteFaltaPorDia: { [DIA]: 240 } });
    expect(resultado.descontoFaltas).toBe(quatro);
  });

  it("o limite diario so o consomem as faltas que descontam: uma justificada e paga nao gasta o limite das outras", () => {
    const paga = falta({ minutos: 240, justificacao_estado: "justificada", remunerada: true });
    const { resultado, quatro } = calcular([paga, falta({ minutos: 480 })], { limiteFaltaPorDia: { [DIA]: 240 } });
    expect(resultado.descontoFaltas).toBe(quatro);
  });

  describe("ausencia NAO remunerada (licenca sem vencimento) desconta o planeado coberto", () => {
    const naoPaga = (minutos: number) => falta({ minutos, ausenciaNaoPaga: true, motivo_codigo: "outro" });

    it("dia inteiro = 8 h; meio dia nao pago = 4 h; meio dia pago (sem falta) = 0", () => {
      expect(calcular([naoPaga(480)], { limiteFaltaPorDia: { [DIA]: 480 } }).resultado.descontoFaltas).toBe(calcular([naoPaga(480)]).oito);
      const meio = calcular([naoPaga(240)], { limiteFaltaPorDia: { [DIA]: 480 } });
      expect(meio.resultado.descontoFaltas).toBe(meio.quatro);
      expect(calcular([]).resultado.descontoFaltas).toBe(0);
    });

    it("uma falta marcada no mesmo dia nao soma a dobrar: o dia nunca desconta mais do que o planeado", () => {
      const { resultado, oito } = calcular([naoPaga(480), falta({ minutos: 480 })], { limiteFaltaPorDia: { [DIA]: 480 } });
      expect(resultado.descontoFaltas).toBe(oito);
    });

    it("meio dia pago + outra metade sem picagem: desconta so a outra metade", () => {
      const { resultado, quatro } = calcular([falta({ minutos: 240, semRegisto: true })], { limiteFaltaPorDia: { [DIA]: 240 } });
      expect(resultado.descontoFaltas).toBe(quatro);
    });
  });

  it("picagem parcial (semRegisto false) nao conta no aviso de dias sem picagem e a tolerancia aplica-se", () => {
    const { resultado } = calcular([falta({ minutos: 3, motivo_codigo: "atraso", semRegisto: false })]);
    expect(resultado.descontoFaltas).toBe(0);
    expect(resultado.avisos).not.toContain("dias_sem_picagem_descontados");
  });

  it("dia inteiro de ausencia paga (limite 0): uma falta marcada nesse dia nao desconta", () => {
    expect(calcular([falta()], { limiteFaltaPorDia: { [DIA]: 0 } }).resultado.descontoFaltas).toBe(0);
  });

  it("as horas extra de um dia nao compensam a falta de outro", () => {
    // Um dia com 3 h extra e outro com falta de 8 h: o saldo agregado seria 5 h, mas o desconto e as 8 h da falta.
    const { resultado, oito } = calcular([falta({ data: OUTRO_DIA })], {
      planeadoMinutos: 9600,
      realizadoMinutos: 9600 - 480 + 180,
      minutosExtraNormal: 180,
    });
    expect(resultado.descontoFaltas).toBe(oito);
  });

  it("falta pendente de documento desconta provisoriamente e avisa", () => {
    const { resultado, oito } = calcular([falta({ justificacao_estado: "pendente_documento" })]);
    expect(resultado.descontoFaltas).toBe(oito);
    expect(resultado.avisos).toContain("faltas_provisorias");
  });

  it("atraso dentro da tolerancia nao desconta; acima desconta", () => {
    expect(calcular([falta({ motivo_codigo: "atraso", minutos: TOLERANCIA_ATRASO_MINUTOS })]).resultado.descontoFaltas).toBe(0);
    expect(calcular([falta({ motivo_codigo: "atraso", minutos: TOLERANCIA_ATRASO_MINUTOS + 1 })]).resultado.descontoFaltas).toBeGreaterThan(0);
  });

  it("cada falta arredonda-se ao centimo ANTES de somar", () => {
    const faltas = [falta({ minutos: 7 }), falta({ data: OUTRO_DIA, minutos: 7 }), falta({ data: "2026-03-12", minutos: 7 })];
    const { resultado, valorHora } = calcular(faltas);
    const porFalta = cent((7 / 60) * valorHora);
    expect(resultado.descontoFaltas).toBe(cent(porFalta * 3));
  });

  it("sem valor hora (sem retribuicao) o desconto fica 0", () => {
    const resultado = calcularProcessamentoPessoa({ ...entrada([falta()]), retribuicao: null });
    expect(resultado.descontoFaltas).toBe(0);
  });

  it("o cartao da falta e o processamento dao o mesmo numero para a mesma falta", () => {
    const casos = [
      falta(),
      falta({ justificacao_estado: "justificada", remunerada: true }),
      falta({ justificacao_estado: "justificada", remunerada: false }),
      falta({ justificacao_estado: "recusada" }),
      falta({ justificacao_estado: "pendente_documento" }),
      falta({ estado: "anulada" }),
      falta({ minutos: 90 }),
    ];
    for (const caso of casos) {
      const { resultado, valorHora } = calcular([caso]);
      expect(descontoDoCartao(caso, valorHora).valor).toBe(resultado.descontoFaltas);
      expect(descontoDaFalta(caso, valorHora).valor).toBe(resultado.descontoFaltas);
    }
  });

  it("a tolerancia da regra partilhada e a do exemplo", () => {
    expect(TOLERANCIA_ATRASO_MINUTOS).toBe(TOLERANCIA_DO_EXEMPLO);
  });
});

describe("assinatura das faltas e avisos gravados", () => {
  it("a assinatura muda quando uma falta e justificada, anulada ou mudada, e nao depende da ordem", () => {
    const a = falta();
    const b = falta({ data: OUTRO_DIA, minutos: 60 });
    const base = assinaturaDeFaltas([a, b]);
    expect(assinaturaDeFaltas([b, a])).toBe(base);
    expect(assinaturaDeFaltas([{ ...a, justificacao_estado: "justificada", remunerada: true }, b])).not.toBe(base);
    expect(assinaturaDeFaltas([{ ...a, estado: "anulada" }, b])).not.toBe(base);
    expect(assinaturaDeFaltas([a])).not.toBe(base);
  });

  it("os avisos novos passam pelo filtro do fecho (sao gravados)", () => {
    expect(avisosParaGravar(["faltas_provisorias", "dias_sem_picagem_descontados"])).toEqual([
      "faltas_provisorias",
      "dias_sem_picagem_descontados",
    ]);
    expect(MAX_AVISOS_POR_PESSOA).toBeGreaterThanOrEqual(2);
  });
});
