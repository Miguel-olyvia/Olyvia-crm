import { describe, expect, it } from "vitest";
import {
  calcularProcessamentoPessoa,
  minutosTrabalhadosPorDia,
  type EntradaProcessamentoPessoa,
  type RegraParaCalculo,
  type RetribuicaoParaCalculo,
} from "@/lib/hr/processamentoTotais";
import type { HrCodigoProcessamento, HrProcessamentoLancamento } from "@/types/hr";
import type { DiaRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

/** Arredonda ao centimo, como cada linha monetaria do calculo. */
const cent = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

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

/** A regra de exemplo da tabela BMClean: subsidio 0,76/h e 6,15/dia a partir de 5 h; extra 50/75/100; IHT 25 %; faixas 21-24 a 25 % e 00-06 a 30 %. */
const REGRA: RegraParaCalculo = {
  subsidio_limite_min: 300,
  subsidio_valor_hora: 0.76,
  subsidio_valor_dia: 6.15,
  he_pct_dia_util: 50,
  he_pct_feriado: 75,
  he_pct_descanso: 100,
  iht_pct: 25,
  noturnas: [
    { percentagem: 25, preco_hora: null },
    { percentagem: 30, preco_hora: null },
  ],
};

function entradaBase(
  overrides: Partial<EntradaProcessamentoPessoa> = {},
): EntradaProcessamentoPessoa {
  return {
    totais: totaisBase(),
    minutosPorDia: [],
    minutosNoturnosPorFaixa: [],
    regra: REGRA,
    direitoIht: false,
    retribuicao: null,
    codigos: [],
    lancamentos: [],
    ...overrides,
  };
}

function retribuicao(overrides: Partial<RetribuicaoParaCalculo> = {}): RetribuicaoParaCalculo {
  return {
    valorBase: 1000,
    periodicidade: "mensal",
    duodecimosPct: 100,
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
            retribuicao: retribuicao({
              valorBase: 1300,
              periodicidade: "mensal",
            }),
            totais: totaisBase({ planeadoMinutos, realizadoMinutos: 0, minutosExtraNormal: 120 }),
            minutosPorDia: Array(10).fill(480),
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
          retribuicao: retribuicao({
            valorBase: 0,
            periodicidade: "mensal",
          }),
          totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9000 }),
          minutosPorDia: Array(5).fill(480),
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
          regra: { ...REGRA, he_pct_dia_util: 100 },
          codigos: [
            codigo({
              id: "he",
              modo_calculo: "percentagem_hora_normal",
              origem_automatica: "horas_extra",
              percentagem: 7, // a percentagem do codigo ja nao conta: vale a da regra
            }),
          ],
        }),
      );
      expect(resultado.valorHoraReal).not.toBeNull();
      const deficitHoras = (9600 - 9000) / 60;
      const horasExtra = 120 / 60;
      const valorHoraDoDesconto = resultado.descontoFaltas / deficitHoras;
      const valorHoraDoCodigo = resultado.linhasAutomaticas[0].valor / horasExtra;
      // Cada linha arredonda ao centimo, por isso a hora implicita so coincide ao centimo.
      expect(valorHoraDoDesconto).toBeCloseTo(valorHoraDoCodigo, 2);
      expect(valorHoraDoDesconto).toBeCloseTo(resultado.valorHoraReal as number, 2);
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
          retribuicao: retribuicao({
            valorBase: 5.4,
            periodicidade: "hora",
            duodecimosPct: 0,
          }),
          totais: totaisBase({ planeadoMinutos: 0 }),
          minutosPorDia: Array(10).fill(480),
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
    expect(resultado.linhasAutomaticas[0].valor).toBe(9.48);
    expect(resultado.totalCodigosAutomaticos).toBe(9.48);
  });

  describe("horas extra com as percentagens da regra", () => {
    const he = (origem: "horas_extra" | "feriado_trabalhado" | "descanso_trabalhado", percentagemDoCodigo: number) =>
      codigo({ id: origem, modo_calculo: "percentagem_hora_normal", origem_automatica: origem, percentagem: percentagemDoCodigo });
    const VALOR_HORA = 9.479166666666668; // baseMes 1516,666.../160 h planeadas

    it("dia de trabalho +50 %, feriado +75 %, descanso +100 %: a percentagem do codigo e ignorada", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ minutosExtraNormal: 120, minutosFeriadoTrabalhado: 480, minutosDescansoTrabalhado: 240 }),
          codigos: [he("horas_extra", 999), he("feriado_trabalhado", 200), he("descanso_trabalhado", 5)],
        }),
      );
      const valor = (id: string) => resultado.linhasAutomaticas.find((l) => l.codigoId === id)!.valor;
      expect(valor("horas_extra")).toBe(cent(2 * VALOR_HORA * 0.5));
      expect(valor("feriado_trabalhado")).toBe(cent(8 * VALOR_HORA * 0.75));
      expect(valor("descanso_trabalhado")).toBe(cent(4 * VALOR_HORA * 1));
    });

    it("sem regra a linha existe mas vale 0 (nao se inventa a percentagem do codigo)", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ minutosExtraNormal: 120 }),
          regra: null,
          codigos: [he("horas_extra", 50)],
        }),
      );
      expect(resultado.linhasAutomaticas).toHaveLength(1);
      expect(resultado.linhasAutomaticas[0].valor).toBe(0);
      expect(resultado.avisos).toContain("sem_regra_salarial");
    });

    it("um codigo antigo de horas noturnas nao paga uma segunda vez: as noturnas pagam-se por faixa", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ horasExtraNoturnasMinutos: 240 }),
          codigos: [
            codigo({ id: "noturno", modo_calculo: "percentagem_hora_normal", origem_automatica: "horas_extra_noturnas", percentagem: 25 }),
          ],
        }),
      );
      expect(resultado.linhasAutomaticas).toHaveLength(0);
    });
  });

  describe("horas noturnas por faixa", () => {
    const VALOR_HORA = 9.479166666666668;

    it("faixa a percentagem: horas x valor hora x percentagem, e as faixas somam-se ao total", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          totais: totaisBase({ planeadoMinutos: 9600, realizadoMinutos: 9600 }),
          minutosNoturnosPorFaixa: [180, 360], // 3 h a 25 % e 6 h a 30 %
        }),
      );
      const noturnas = resultado.linhasRegra.filter((l) => l.tipo === "noturnas");
      expect(noturnas).toHaveLength(2);
      expect(noturnas[0].valor).toBe(cent(3 * VALOR_HORA * 0.25));
      expect(noturnas[1].valor).toBe(cent(6 * VALOR_HORA * 0.3));
      expect(resultado.totalRegras).toBe(cent(cent(3 * VALOR_HORA * 0.25) + cent(6 * VALOR_HORA * 0.3)));
      expect(resultado.totalBrutoEstimado).toBeCloseTo((resultado.baseMes as number) + resultado.totalRegras, 6);
    });

    it("faixa a preco fixo por hora: horas x preco, sem depender do valor hora", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          regra: { ...REGRA, noturnas: [{ percentagem: null, preco_hora: 2.5 }] },
          minutosNoturnosPorFaixa: [270], // 4 h 30
        }),
      );
      expect(resultado.linhasRegra).toEqual([{ tipo: "noturnas", faixa: 0, quantidade: 4.5, valor: 11.25 }]);
    });

    it("faixa sem minutos nao gera linha, e a ordem dos minutos segue a das faixas", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1300, periodicidade: "mensal" }),
          minutosNoturnosPorFaixa: [0, 60],
        }),
      );
      expect(resultado.linhasRegra.map((l) => l.faixa)).toEqual([1]);
    });
  });

  describe("IHT", () => {
    it("com direito: percentagem do ordenado base (1 000 x 25 % = 250,00)", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({ retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal" }), totais: totaisBase({ realizadoMinutos: 9600 }), direitoIht: true }),
      );
      expect(resultado.linhasRegra).toEqual([{ tipo: "iht", faixa: null, quantidade: null, valor: 250 }]);
      expect(resultado.totalBrutoEstimado).toBeCloseTo((resultado.baseMes as number) + 250, 6);
    });

    it("sem direito: nao ha linha de IHT", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({ retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal" }), direitoIht: false }),
      );
      expect(resultado.linhasRegra.filter((l) => l.tipo === "iht")).toHaveLength(0);
    });

    it("com direito mas sem regra nao inventa percentagem", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({ retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal" }), direitoIht: true, regra: null }),
      );
      expect(resultado.linhasRegra).toHaveLength(0);
    });
  });

  describe("km e ajudas de custo a partir dos lancamentos", () => {
    it("100 km a 0,40 = 40,00 EUR: o valor ja vem gravado e entra no total, fora dos pontuais", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal" }),
          totais: totaisBase({ realizadoMinutos: 9600 }),
          lancamentos: [lancamento({ id: "km", tipo: "km", quantidade: 100, valor: 40 })],
        }),
      );
      expect(resultado.linhasRegra).toEqual([{ tipo: "km", faixa: null, quantidade: 100, valor: 40 }]);
      expect(resultado.lancamentosPontuais).toBe(0);
      expect(resultado.totalBrutoEstimado).toBeCloseTo((resultado.baseMes as number) + 40, 6);
    });

    it("ajudas de custo somam os lancamentos nao anulados; os anulados nao contam", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({
          retribuicao: retribuicao({ valorBase: 1000, periodicidade: "mensal" }),
          lancamentos: [
            lancamento({ id: "a1", tipo: "ajudas", quantidade: 2, valor: 131.78 }),
            lancamento({ id: "a2", tipo: "ajudas", quantidade: 1, valor: 65.89 }),
            lancamento({ id: "a3", tipo: "ajudas", quantidade: 5, valor: 329.45, anulado_em: "2026-01-05T00:00:00Z" }),
          ],
        }),
      );
      const ajudas = resultado.linhasRegra.find((l) => l.tipo === "ajudas")!;
      expect(ajudas.quantidade).toBe(3);
      expect(ajudas.valor).toBeCloseTo(197.67, 6);
    });
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
      expect(resultado.descontoFaltas).toBe(94.79);
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

  describe("subsidio de alimentacao (dia a dia, pela regra)", () => {
    const subsidio = (minutosPorDia: number[], regra: RegraParaCalculo | null = REGRA) =>
      calcularProcessamentoPessoa(entradaBase({ minutosPorDia, regra })).subsidioAlimentacao;

    it("4 h 30 trabalhadas = 4,5 x 0,76 = 3,42 EUR (minutos proporcionais)", () => {
      expect(subsidio([270])).toBe(3.42);
    });

    it("5 h trabalhadas = 6,15 EUR: exactamente 5 h conta como a partir de 5 h", () => {
      expect(subsidio([300])).toBe(6.15);
    });

    it("4 h 59 ainda e por hora (3,79 EUR); 5 h 01 ja e o valor por dia", () => {
      expect(subsidio([299])).toBe(3.79); // 299 x 0,76 / 60 = 3,7873
      expect(subsidio([301])).toBe(6.15);
    });

    it("um dia de 8 h nao paga mais que o valor por dia", () => {
      expect(subsidio([480])).toBe(6.15);
    });

    it("arredonda ao centimo POR DIA antes de somar o mes (3 dias de 1 h 20 = 3 x 1,01, nao 3,04)", () => {
      // 80 min x 0,76 / 60 = 1,0133 -> 1,01 por dia; somar antes de arredondar daria 3,04.
      expect(subsidio([80, 80, 80])).toBe(3.03);
    });

    it("soma o mes: 10 dias de 8 h + um de 4 h 30", () => {
      expect(subsidio([...Array(10).fill(480), 270])).toBeCloseTo(61.5 + 3.42, 6);
    });

    it("dias sem trabalho nao contam", () => {
      expect(subsidio([0, 480, 0])).toBe(6.15);
    });

    it("o limite e os valores sao os da regra, nao fixos no codigo", () => {
      const regra = { ...REGRA, subsidio_limite_min: 240, subsidio_valor_hora: 1, subsidio_valor_dia: 5 };
      expect(subsidio([180], regra)).toBe(3); // 3 h x 1,00
      expect(subsidio([240], regra)).toBe(5);
    });

    it("sem regra da 0 com aviso, mesmo com retribuicao", () => {
      const resultado = calcularProcessamentoPessoa(
        entradaBase({ retribuicao: retribuicao(), regra: null, minutosPorDia: [480] }),
      );
      expect(resultado.subsidioAlimentacao).toBe(0);
      expect(resultado.avisos).toContain("sem_regra_salarial");
    });

    it("com regra nao ha aviso", () => {
      const resultado = calcularProcessamentoPessoa(entradaBase({ retribuicao: retribuicao(), minutosPorDia: [480] }));
      expect(resultado.avisos).not.toContain("sem_regra_salarial");
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
    expect(resultado.descontoFaltas).toBeCloseTo(resultado.baseMes as number, 2);
    expect(resultado.totalBrutoEstimado).toBeCloseTo(
      resultado.subsidioAlimentacao + resultado.lancamentosPontuais,
      2,
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
        minutosPorDia: Array(20).fill(480),
        lancamentos: [lancamento({ id: "l1", valor: 15 })],
      }),
    );

    expect(resultado.valorHoraReal).toBeNull();
    expect(resultado.baseMes).toBeNull();
    expect(resultado.totalBrutoEstimado).toBeNull();

    // O que nao depende da retribuicao continua a calcular-se.
    expect(resultado.descontoFaltas).toBe(0); // valorHoraReal null -> nunca null-propagar, fica 0
    // O subsidio vem da regra, nao da retribuicao: 20 dias de 8 h x 6,15 mesmo sem retribuicao.
    expect(resultado.subsidioAlimentacao).toBeCloseTo(123, 6);
    expect(resultado.avisos).not.toContain("sem_regra_salarial");
    expect(resultado.lancamentosPontuais).toBe(15);
    expect(resultado.avisos).toContain("sem_retribuicao");
  });
});

describe("minutosTrabalhadosPorDia", () => {
  it("devolve o realizado de cada dia com trabalho, pela ordem dos dias", () => {
    const dias = [
      diaBase({ realizadoMinutos: 500 }),
      diaBase({ realizadoMinutos: 200 }),
      diaBase({ realizadoMinutos: 0 }), // sem trabalho: fora
      diaBase({ realizadoMinutos: 300 }),
    ];
    expect(minutosTrabalhadosPorDia(dias)).toEqual([500, 200, 300]);
  });

  it("um dia de ausencia com realizadoMinutos alto nao conta -- mesma exclusao dos outros totais", () => {
    const dias = [
      diaBase({ estado: "ausencia", realizadoMinutos: 600 }),
      diaBase({ estado: "normal", realizadoMinutos: 600 }),
    ];
    expect(minutosTrabalhadosPorDia(dias)).toEqual([600]);
  });

  it("array vazio da lista vazia", () => {
    expect(minutosTrabalhadosPorDia([])).toEqual([]);
  });
});

describe("arredondamento ao centimo de cada linha antes de somar", () => {
  // 1 000 x 14 / 12 = 1 166,67 de base; / 150 h = 7,7778 EUR por hora: nenhuma conta dá cêntimos exactos.
  const base = { retribuicao: retribuicao({ valorBase: 1000 }), totais: totaisBase({ planeadoMinutos: 9000, realizadoMinutos: 9000 }) };

  it("horas extra: 1 h a 50 % = 3,89 (linha arredondada)", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        ...base,
        totais: totaisBase({ planeadoMinutos: 9000, realizadoMinutos: 9000, minutosExtraNormal: 60 }),
        codigos: [codigo({ id: "he", modo_calculo: "percentagem_hora_normal", origem_automatica: "horas_extra" })],
      }),
    );
    expect(resultado.linhasAutomaticas[0].valor).toBe(3.89);
    expect(resultado.totalCodigosAutomaticos).toBe(3.89);
  });

  it("noturnas: cada faixa arredonda antes de somar (1,94 + 1,94 = 3,88, nao 3,89)", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({
        ...base,
        regra: { ...REGRA, noturnas: [{ percentagem: 25, preco_hora: null }, { percentagem: 25, preco_hora: null }] },
        minutosNoturnosPorFaixa: [60, 60],
      }),
    );
    expect(resultado.linhasRegra.map((l) => l.valor)).toEqual([1.94, 1.94]);
    expect(resultado.totalRegras).toBe(3.88);
  });

  it("faltas: 20 min = 2,59", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({ ...base, totais: totaisBase({ planeadoMinutos: 9000, realizadoMinutos: 8980 }) }),
    );
    expect(resultado.descontoFaltas).toBe(2.59);
  });

  it("IHT: 333,33 x 25 % = 83,33", () => {
    const resultado = calcularProcessamentoPessoa(
      entradaBase({ ...base, retribuicao: retribuicao({ valorBase: 333.33 }), direitoIht: true }),
    );
    expect(resultado.linhasRegra.find((l) => l.tipo === "iht")?.valor).toBe(83.33);
  });
});

describe("minutosTrabalhadosPorDia: turno que atravessa a meia-noite", () => {
  const dia = (iso: string, intervalos: [string, string][]) => ({
    iso,
    estado: "normal" as const,
    realizadoMinutos: intervalos.reduce((s, [i, f]) => {
      const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
      return s + m(f) - m(i);
    }, 0),
    realizadoIntervalos: intervalos.map(([hora_inicio, hora_fim]) => ({ hora_inicio, hora_fim })),
  });

  it("22:00-06:00 partido em dois dias conta como UM dia: 479 min e subsidio do dia (6,15)", () => {
    const dias = [dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["00:00", "06:00"]])];
    const minutos = minutosTrabalhadosPorDia(dias);
    expect(minutos).toEqual([479]);
    expect(calcularProcessamentoPessoa(entradaBase({ minutosPorDia: minutos })).subsidioAlimentacao).toBe(6.15);
  });

  it("o resto do dia seguinte fica como dia seu", () => {
    const dias = [dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["00:00", "06:00"], ["14:00", "17:00"]])];
    expect(minutosTrabalhadosPorDia(dias)).toEqual([479, 180]);
  });

  it("nao junta dias que nao sao seguidos, nem um dia que nao comeca as 00:00", () => {
    expect(minutosTrabalhadosPorDia([dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-12", [["00:00", "06:00"]])])).toEqual([119, 360]);
    expect(minutosTrabalhadosPorDia([dia("2026-03-10", [["22:00", "23:59"]]), dia("2026-03-11", [["08:00", "16:00"]])])).toEqual([119, 480]);
  });

  it("sem intervalos (fixtures antigos) cada dia conta por si", () => {
    expect(minutosTrabalhadosPorDia([{ estado: "normal", realizadoMinutos: 119 }, { estado: "normal", realizadoMinutos: 360 }])).toEqual([119, 360]);
  });
});