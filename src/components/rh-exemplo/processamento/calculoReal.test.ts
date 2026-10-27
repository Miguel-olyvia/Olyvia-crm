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
    ...extra,
  }) as unknown as TotaisRelatorioMensal;

const dia = (estado: string, realizadoMinutos: number): DiaRelatorioMensal => ({ estado, realizadoMinutos }) as unknown as DiaRelatorioMensal;

const versao = (extra: Partial<RetribuicaoVigenteLinha> = {}): RetribuicaoVigenteLinha => ({
  pessoa_id: "p1", valor_base: 1200, periodicidade: "mensal", duodecimos_pct: 0, subsidio_alimentacao: 5,
  valido_de: "2026-01-01", valido_ate: null, ...extra,
});

const lancamento = (valor: number, anulado: string | null = null): HrProcessamentoLancamento =>
  ({ id: `l${valor}`, periodo_id: "per", pessoa_id: "p1", valor, descricao: "x", anulado_em: anulado }) as unknown as HrProcessamentoLancamento;

const entrada = (extra: Partial<EntradaCalculoReal> = {}): EntradaCalculoReal => ({
  totais: totais(),
  dias: [dia("trabalho", 480), dia("trabalho", 480), dia("trabalho", 100), dia("ausencia", 480)],
  versoes: [versao()],
  ultimoDia: "2026-10-31",
  lancamentos: [],
  codigosActivos: [],
  minutosMinimosSubsidio: 240,
  ...extra,
});

describe("calcularResultadoReal", () => {
  it("base + subsidio - desconto das faltas + pontuais, ao centimo, com o valor da hora das horas planeadas", () => {
    const r = calcularResultadoReal(entrada({ lancamentos: [lancamento(30)] }));
    // 160 h planeadas, 2 h em falta (9600 - 9480 = 120 min), base 1200 -> 7,50 EUR/h, desconto 15.
    expect(r.resultado.valorHoraReal).toBeCloseTo(7.5, 6);
    expect(r.resultado.baseMes).toBeCloseTo(1200, 6);
    expect(r.resultado.descontoFaltas).toBeCloseTo(15, 6);
    // Dois dias com pelo menos 240 min (o de 100 min nao conta e a ausencia tambem nao): 2 x 5 EUR.
    expect(r.resultado.subsidioAlimentacao).toBe(10);
    expect(r.resultado.lancamentosPontuais).toBe(30);
    expect(r.resultado.totalBrutoEstimado).toBeCloseTo(1200 - 15 + 10 + 30, 6);
    expect(r.valorBase).toBe(1200);
    expect(r.periodicidade).toBe("mensal");
    expect(r.mudouAMeioDoMes).toBe(false);
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
    // 2 h x 7,50 x 25 % = 3,75.
    expect(r.resultado.linhasAutomaticas).toHaveLength(1);
    expect(r.resultado.totalCodigosAutomaticos).toBeCloseTo(3.75, 6);
  });

  it("o total nunca e negativo mesmo que o desconto passe a base", () => {
    const r = calcularResultadoReal(entrada({ totais: totais({ realizadoMinutos: 0 }), versoes: [versao({ subsidio_alimentacao: null })], dias: [] }));
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
