// O calculo real decide, por periodo, se paga o subsidio de ferias e o de Natal (config + mes do periodo + vinculo) e o motor paga-o.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: vi.fn(), hrRpc: vi.fn(), isPermissionError: () => false }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import type { TotaisRelatorioMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import type { RetribuicaoVigenteLinha } from "@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao";
import { calcularResultadoReal, type EntradaCalculoReal } from "./calculoReal";

const totais = {
  planeadoMinutos: 9600, realizadoMinutos: 9600, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0,
  horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, diasFeriadoTrabalhados: 0, faltasParaDesconto: [],
} as unknown as TotaisRelatorioMensal;

const versao = (duodecimosPct: 0 | 50 | 100 | null): RetribuicaoVigenteLinha =>
  ({ pessoa_id: "p1", valor_base: 1500, periodicidade: "mensal", duodecimos_pct: duodecimosPct, valido_de: "2020-01-01", valido_ate: null }) as RetribuicaoVigenteLinha;

const CONFIG = { ativoDesde: "2026-01-01", feriasMes: 6, natalMes: 11 };
const ANTIGO = { dataInicio: "2020-03-01", dataFim: null };

const entrada = (extra: Partial<EntradaCalculoReal> = {}): EntradaCalculoReal => ({
  totais, dias: [], versoes: [versao(0)], ultimoDia: "2026-06-30", lancamentos: [], codigosActivos: [], regra: null, direitoIht: false, ...extra,
});

describe("calcularResultadoReal com a configuracao dos subsidios", () => {
  it("no mes de ferias, ligada: paga o subsidio de ferias e entra no total", () => {
    const sem = calcularResultadoReal(entrada());
    const r = calcularResultadoReal(entrada({ subsidios: { config: CONFIG, mes: 6, vinculo: ANTIGO } }));
    expect(r.resultado.subsidioFerias).toBe(1500);
    expect(r.resultado.subsidioNatal).toBe(0);
    expect(r.resultado.totalBrutoEstimado).toBeCloseTo((sem.resultado.totalBrutoEstimado ?? 0) + 1500, 6);
  });

  it("num mes errado, ou sem configuracao, ou desligada: nada se paga", () => {
    expect(calcularResultadoReal(entrada({ subsidios: { config: CONFIG, mes: 7, vinculo: ANTIGO } })).resultado.subsidioFerias).toBe(0);
    expect(calcularResultadoReal(entrada({ subsidios: { config: null, mes: 6, vinculo: ANTIGO } })).resultado.subsidioFerias).toBe(0);
    expect(calcularResultadoReal(entrada({ subsidios: { config: { ...CONFIG, ativoDesde: null }, mes: 6, vinculo: ANTIGO } })).resultado.subsidioFerias).toBe(0);
    expect(calcularResultadoReal(entrada()).resultado.subsidioFerias).toBe(0);
  });

  it("o fim do periodo (ultimoDia) conta contra «ativo desde»", () => {
    const r = calcularResultadoReal(entrada({ ultimoDia: "2026-06-30", subsidios: { config: { ...CONFIG, ativoDesde: "2026-07-01" }, mes: 6, vinculo: ANTIGO } }));
    expect(r.resultado.subsidioFerias).toBe(0);
  });

  it("admitido no ano: proporcao por dias; com detalhe para as contas", () => {
    const r = calcularResultadoReal(entrada({ ultimoDia: "2026-11-30", subsidios: { config: CONFIG, mes: 11, vinculo: { dataInicio: "2026-07-01", dataFim: null } } }));
    expect(r.resultado.subsidioNatal).toBe(756.16);
    expect(r.resultado.subsidiosDetalhe).toMatchObject({ r: 1500, proporcao: 184 / 365, diasNoAno: 184, diasDoAno: 365 });
  });

  it("sem vinculo, ou com cessacao no ano: nao paga e avisa", () => {
    const semVinculo = calcularResultadoReal(entrada({ subsidios: { config: CONFIG, mes: 6, vinculo: null } }));
    expect(semVinculo.resultado.subsidioFerias).toBe(0);
    expect(semVinculo.resultado.avisosSubsidios).toEqual(["subsidio_sem_vinculo"]);
    const cessa = calcularResultadoReal(entrada({ subsidios: { config: CONFIG, mes: 6, vinculo: { dataInicio: "2020-01-01", dataFim: "2026-12-31" } } }));
    expect(cessa.resultado.avisosSubsidios).toEqual(["subsidio_cessacao_por_tratar"]);
  });

  it("duodecimos por definir: nao paga e avisa", () => {
    const r = calcularResultadoReal(entrada({ versoes: [versao(null)], subsidios: { config: CONFIG, mes: 6, vinculo: ANTIGO } }));
    expect(r.resultado.subsidioFerias).toBe(0);
    expect(r.resultado.avisosSubsidios).toEqual(["subsidio_sem_duodecimos"]);
  });
});
