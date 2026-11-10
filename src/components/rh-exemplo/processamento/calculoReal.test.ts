// A conta REAL do processamento de uma pessoa (a da «Visao geral», partilhada com o «Calculo do mes», os «Custos» e o
// valor da hora do desconto de uma falta). Funcao pura: nada de Supabase. O hook real das retribuicoes importa a base,
// por isso a base e a observabilidade sao simuladas só para o modulo carregar.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: vi.fn(), hrRpc: vi.fn(), isPermissionError: () => false }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import type { RetribuicaoVigenteLinha } from "@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao";
import type { HrCodigoProcessamento, HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import { calcularResultadoReal, totalDoMes, type EntradaCalculoReal } from "./calculoReal";

const totais = (extra: Partial<TotaisRelatorioMensal> = {}): TotaisRelatorioMensal =>
  ({
    diasPlaneados: 20, planeadoMinutos: 9600, realizadoMinutos: 9480, diasTrabalhados: 20, diasComFaltaCompleta: 0,
    diasComFaltaIncompleta: 1, horasExtraMinutos: 0, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0,
    minutosDescansoTrabalhado: 0, horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, diasFeriadoTrabalhados: 0,
    // O defice de 2 h e um dia sem registo: o hook do relatorio expoe-o como falta nao justificada (desconto por falta).
    faltasParaDesconto: [{ data: "2026-10-15", minutos: 120, estado: "activa", justificacao_estado: "sem_justificacao", remunerada: false, motivo_codigo: "ausencia_nao_comunicada", semRegisto: true }],
    ...extra,
  }) as unknown as TotaisRelatorioMensal;

const dia = (estado: string, realizadoMinutos: number): DiaRelatorioMensal => ({ estado, realizadoMinutos }) as unknown as DiaRelatorioMensal;

const versao = (extra: Partial<RetribuicaoVigenteLinha> = {}): RetribuicaoVigenteLinha => ({
  pessoa_id: "p1", valor_base: 1200, periodicidade: "mensal", duodecimos_pct: 0,
  valido_de: "2026-01-01", valido_ate: null, ...extra,
});

// A regra salarial em vigor: subsidio 0,76 EUR/h abaixo de 5 h e 6,15 EUR/dia a partir de 5 h; extra 50/75/100; IHT 25 %.
const REGRA: NonNullable<EntradaCalculoReal["regra"]> = {
  subsidio_limite_min: 300, subsidio_valor_hora: 0.76, subsidio_valor_dia: 6.15,
  he_pct_dia_util: 50, he_pct_feriado: 75, he_pct_descanso: 100, iht_pct: 25,
  noturnas: [{ percentagem: 25, preco_hora: null }, { percentagem: null, preco_hora: 3 }],
};

const lancamento = (valor: number, anulado: string | null = null): HrProcessamentoLancamento =>
  ({ id: `l${valor}`, periodo_id: "per", pessoa_id: "p1", valor, descricao: "x", anulado_em: anulado }) as unknown as HrProcessamentoLancamento;

const entrada = (extra: Partial<EntradaCalculoReal> = {}): EntradaCalculoReal => ({
  totais: totais(),
  dias: [dia("trabalho", 480), dia("trabalho", 480), dia("trabalho", 100), dia("ausencia", 480)],
  versoes: [versao()],
  ultimoDia: "2026-10-31",
  lancamentos: [],
  codigosActivos: [],
  regra: REGRA,
  direitoIht: false,
  ...extra,
});

describe("calcularResultadoReal", () => {
  it("base + subsidio - desconto das faltas + pontuais, ao centimo, com o valor da hora das horas planeadas", () => {
    const r = calcularResultadoReal(entrada({ lancamentos: [lancamento(30)] }));
    // 160 h planeadas, 2 h em falta (9600 - 9480 = 120 min), base 1200 -> 7,50 EUR/h, desconto 15.
    expect(r.resultado.valorHoraReal).toBeCloseTo(7.5, 6);
    expect(r.resultado.baseMes).toBeCloseTo(1200, 6);
    expect(r.resultado.descontoFaltas).toBeCloseTo(15, 6);
    // Subsidio dia a dia pela regra: dois dias de 8 h = 2 x 6,15; o de 100 min = 100 x 0,76 / 60 = 1,27; a ausencia nao conta.
    expect(r.resultado.subsidioAlimentacao).toBeCloseTo(2 * 6.15 + 1.27, 6);
    expect(r.resultado.lancamentosPontuais).toBe(30);
    expect(r.resultado.totalBrutoEstimado).toBeCloseTo(1200 - 15 + (2 * 6.15 + 1.27) + 30, 6);
    expect(r.valorBase).toBe(1200);
    expect(r.periodicidade).toBe("mensal");
    expect(r.mudouAMeioDoMes).toBe(false);
  });

  describe("margem de tempo (contadoMinutos)", () => {
    it("SEM contadoMinutos (sem margem) o resultado e o de sempre; contado = realizado da o mesmo resultado", () => {
      const sem = calcularResultadoReal(entrada());
      const igual = calcularResultadoReal(entrada({ totais: totais({ contadoMinutos: 9480 }), dias: entrada().dias.map((d) => ({ ...d, contadoMinutos: d.realizadoMinutos })) }));
      expect(igual.resultado).toEqual(sem.resultado);
      expect(sem.resultado.descontoFaltas).toBeCloseTo(15, 6);
    });

    it("o desconto de faltas sai do que CONTA: dentro da margem (contado = planeado) nao ha desconto, mesmo com menos picado", () => {
      const r = calcularResultadoReal(entrada({ totais: totais({ contadoMinutos: 9600, faltasParaDesconto: [] }) }));
      expect(r.resultado.descontoFaltas).toBe(0);
    });

    it("o realizado do dia fica intacto e o subsidio usa os minutos contados do dia", () => {
      const dias = [{ ...dia("trabalho", 290), contadoMinutos: 300 }, dia("trabalho", 290)] as DiaRelatorioMensal[];
      const r = calcularResultadoReal(entrada({ dias }));
      // 290 min contados como 300 (o limite) pagam o valor do dia; o outro dia, sem contado, 290 x 0,76 / 60.
      expect(r.resultado.subsidioAlimentacao).toBeCloseTo(6.15 + 3.67, 6);
      expect(r.totais.realizadoMinutos).toBe(9480);
    });
  });

  it("um valor pontual anulado nao entra no total", () => {
    const r = calcularResultadoReal(entrada({ lancamentos: [lancamento(30), lancamento(100, "2026-10-05T10:00:00Z")] }));
    expect(r.resultado.lancamentosPontuais).toBe(30);
  });

  it("sem retribuicao nao ha total: fica sem valor e com o aviso, nunca zero", () => {
    const r = calcularResultadoReal(entrada({ versoes: [] }));
    expect(r.resultado.totalBrutoEstimado).toBeNull();
    expect(r.resultado.baseMes).toBeNull();
    expect(r.resultado.avisos).toContain("sem_retribuicao");
    expect(r.valorBase).toBeNull();
  });

  it("duas versoes no mes: vale a que cobre o ultimo dia e avisa que mudou a meio", () => {
    const antiga = versao({ valor_base: 1000, valido_ate: "2026-10-15" });
    const nova = versao({ valor_base: 1500, valido_de: "2026-10-15", valido_ate: null });
    const r = calcularResultadoReal(entrada({ versoes: [antiga, nova] }));
    expect(r.valorBase).toBe(1500);
    expect(r.mudouAMeioDoMes).toBe(true);
  });

  it("sem horas planeadas no mes nao ha valor da hora (nada de Infinity) e o desconto vale zero", () => {
    const r = calcularResultadoReal(entrada({ totais: totais({ planeadoMinutos: 0, realizadoMinutos: 0 }) }));
    expect(r.resultado.valorHoraReal).toBeNull();
    expect(r.resultado.descontoFaltas).toBe(0);
    expect(r.resultado.avisos).toContain("sem_horas_planeadas_no_mes");
    expect(Number.isFinite(r.resultado.totalBrutoEstimado ?? 0)).toBe(true);
  });

  it("um codigo activo de horas extra a 25 % soma ao total; um codigo manual nao gera linha", () => {
    const codigos = [
      { id: "c1", codigo: "100", nome: "Hora extra", activo: true, modo_calculo: "percentagem_hora_normal", percentagem: 25, valor_fixo: null, origem_automatica: "horas_extra" },
      { id: "c2", codigo: "900", nome: "Manual", activo: true, modo_calculo: "manual", percentagem: null, valor_fixo: null, origem_automatica: null },
    ] as unknown as HrCodigoProcessamento[];
    const r = calcularResultadoReal(entrada({ codigosActivos: codigos, totais: totais({ minutosExtraNormal: 120 }) }));
    // A percentagem vem da regra (50 % em dia de trabalho), nao do codigo (25 %): 2 h x 7,50 x 50 % = 7,50.
    expect(r.resultado.linhasAutomaticas).toHaveLength(1);
    expect(r.resultado.totalCodigosAutomaticos).toBeCloseTo(7.5, 6);
  });

  it("sem regra o subsidio fica a 0 com aviso e as extra valem 0", () => {
    const codigos = [
      { id: "c1", codigo: "100", nome: "Hora extra", activo: true, modo_calculo: "percentagem_hora_normal", percentagem: 25, valor_fixo: null, origem_automatica: "horas_extra" },
    ] as unknown as HrCodigoProcessamento[];
    const r = calcularResultadoReal(entrada({ regra: null, codigosActivos: codigos, totais: totais({ minutosExtraNormal: 120 }) }));
    expect(r.resultado.subsidioAlimentacao).toBe(0);
    expect(r.resultado.totalCodigosAutomaticos).toBe(0);
    expect(r.resultado.avisos).toContain("sem_regra_salarial");
  });

  it("as noturnas pagam-se por faixa: 3 h a 25 % do valor hora e 2 h a preco fixo de 3 EUR", () => {
    const r = calcularResultadoReal(entrada({ totais: totais({ minutosNoturnosPorFaixa: [180, 120] }) }));
    const noturnas = r.resultado.linhasRegra.filter((l) => l.tipo === "noturnas");
    expect(noturnas.map((l) => l.faixa)).toEqual([0, 1]);
    expect(noturnas[0].valor).toBeCloseTo(3 * 7.5 * 0.25, 6);
    expect(noturnas[1].valor).toBeCloseTo(2 * 3, 6);
  });

  it("o IHT so entra para quem tem o direito: 25 % do ordenado base", () => {
    const sem = calcularResultadoReal(entrada());
    const com = calcularResultadoReal(entrada({ direitoIht: true }));
    expect(sem.resultado.linhasRegra.some((l) => l.tipo === "iht")).toBe(false);
    expect(com.resultado.linhasRegra.find((l) => l.tipo === "iht")?.valor).toBeCloseTo(300, 6);
    expect((com.resultado.totalBrutoEstimado ?? 0) - (sem.resultado.totalBrutoEstimado ?? 0)).toBeCloseTo(300, 6);
  });

  it("o total nunca e negativo mesmo que o desconto passe a base", () => {
    const r = calcularResultadoReal(entrada({ totais: totais({ realizadoMinutos: 0, faltasParaDesconto: [{ data: "2026-10-15", minutos: 9600, estado: "activa", justificacao_estado: "sem_justificacao", remunerada: false, motivo_codigo: "ausencia_nao_comunicada", semRegisto: true }] }), versoes: [versao()], dias: [] }));
    expect(r.resultado.totalBrutoEstimado).toBeGreaterThanOrEqual(0);
  });
});

describe("totalDoMes", () => {
  it("soma so quem tem valor e diz quantos ficaram de fora", () => {
    const comValor = calcularResultadoReal(entrada());
    const semValor = calcularResultadoReal(entrada({ versoes: [] }));
    const t = totalDoMes([comValor, semValor, comValor]);
    expect(t.semValor).toBe(1);
    expect(t.total).toBeCloseTo((comValor.resultado.totalBrutoEstimado ?? 0) * 2, 6);
  });

  it("sem ninguem: zero e ninguem de fora", () => {
    expect(totalDoMes([])).toEqual({ total: 0, semValor: 0 });
  });
});

describe("calcularResultadoReal: detalhe do subsidio e das faltas", () => {
  const diaComData = (iso: string, realizadoMinutos: number): DiaRelatorioMensal => ({ iso, estado: "normal", realizadoMinutos }) as unknown as DiaRelatorioMensal;

  it("passa as datas dos dias ao motor e devolve o detalhe, sem mudar nenhum valor", () => {
    const dias = [diaComData("2026-10-01", 480), diaComData("2026-10-02", 100), diaComData("2026-10-05", 300)];
    const r = calcularResultadoReal(entrada({ dias })).resultado;
    expect(r.subsidioDetalhe?.diasPeloDia).toEqual([{ data: "2026-10-01", minutos: 480 }, { data: "2026-10-05", minutos: 300 }]);
    expect(r.subsidioDetalhe?.diasPelaHora).toEqual([{ data: "2026-10-02", minutos: 100 }]);
    expect(Math.round(((r.subsidioDetalhe?.totalPeloDia ?? 0) + (r.subsidioDetalhe?.totalPelaHora ?? 0)) * 100) / 100).toBe(r.subsidioAlimentacao);
    expect(r.faltasDetalhe).toMatchObject({ dias: ["2026-10-15"], minutosDescontados: 120, valor: r.descontoFaltas });
  });
});
