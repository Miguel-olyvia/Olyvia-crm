// O calculo REAL partilhado (organizacao e pessoa). Os hooks reais entram por argumento, ao nivel dos wrappers de
// rh-exemplo/hooks: nao ha Supabase. So a base (hrDb) e a observabilidade sao simuladas para o modulo das retribuicoes
// carregar com as suas funcoes puras verdadeiras (`escolherRetribuicaoVigente`, `limitesDoMes`).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";

vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: vi.fn(), hrRpc: vi.fn(), isPermissionError: () => false }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const estado = vi.hoisted(() => ({
  pessoas: [] as unknown[],
  pessoasACarregar: false,
  pessoasErro: null as string | null,
  periodo: null as unknown,
  lancamentos: [] as unknown[],
  retribuicoes: new Map<string, unknown[]>(),
  retribuicoesRecusadas: false,
  relatorio: {
    loading: false,
    totais: { planeadoMinutos: 9600, realizadoMinutos: 9600, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0, horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, diasFeriadoTrabalhados: 0 },
    dias: [] as unknown[],
    realizadoRecusado: false,
    faltasRecusadas: false,
    planeadoRecusado: false,
  },
}));

vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({
  usePessoas: () => ({ pessoas: estado.pessoas, loading: estado.pessoasACarregar, error: estado.pessoasErro }),
}));
vi.mock("@/components/rh-exemplo/hooks/useCodigosProcessamento", () => ({ useCodigosProcessamento: () => ({ codigos: [], isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoPeriodo", () => ({
  useProcessamentoPeriodo: () => ({ periodo: estado.periodo, loading: false, saving: false, recusado: false, abrir: vi.fn(), fechar: vi.fn() }),
}));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoLancamentos", () => ({
  useProcessamentoLancamentos: () => ({ lancamentos: estado.lancamentos, loading: false, saving: false, recusado: false, criar: vi.fn(), anular: vi.fn() }),
}));
vi.mock("@/components/rh-exemplo/hooks/useRegrasSubsidioAlimentacao", () => ({
  useRegrasSubsidioAlimentacao: () => ({ regra: { minutosMinimosDia: 240 }, isLoading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal", () => ({ useRelatorioAssiduidadeMensal: () => estado.relatorio }));
vi.mock("@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useRetribuicoesVigentesDaOrganizacao: () => ({
    porPessoa: estado.retribuicoes, loading: false, recusado: estado.retribuicoesRecusadas, recarregar: vi.fn(),
  }),
}));

import { RecolhaDeAssiduidade, useCalculoRealDaPessoa, useCalculoRealDoMes, type RecolhaAssiduidade } from "./useCalculoReal";

const pessoa = (id: string, estadoRegisto = "activo") => ({ id, nome_completo: `Pessoa ${id}`, estado_registo: estadoRegisto });
const retribuicao = (pessoaId: string, valor = 1200) => ({
  pessoa_id: pessoaId, valor_base: valor, periodicidade: "mensal", duodecimos_pct: 0, subsidio_alimentacao: 5, valido_de: "2026-01-01", valido_ate: null,
});
const recolha = (extra: Partial<RecolhaAssiduidade> = {}): RecolhaAssiduidade =>
  ({ totais: estado.relatorio.totais, dias: [], incompleta: false, ...extra }) as unknown as RecolhaAssiduidade;

beforeEach(() => {
  cleanup();
  estado.pessoas = [pessoa("p1"), pessoa("p2", "inactivo")];
  estado.pessoasACarregar = false;
  estado.pessoasErro = null;
  estado.periodo = { id: "per-out", estado: "aberto" };
  estado.lancamentos = [];
  estado.retribuicoes = new Map([["p1", [retribuicao("p1")]], ["p2", [retribuicao("p2", 9999)]]]);
  estado.retribuicoesRecusadas = false;
  estado.relatorio.loading = false;
  estado.relatorio.realizadoRecusado = false;
  estado.relatorio.faltasRecusadas = false;
  estado.relatorio.planeadoRecusado = false;
});

describe("useCalculoRealDoMes", () => {
  it("so conta as pessoas activas e comeca com todas por calcular, sem inventar valores", () => {
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    expect(result.current.pessoasActivas.map((p) => p.id)).toEqual(["p1"]);
    expect(result.current.pendentes).toBe(1);
    expect(result.current.resultados.size).toBe(0);
  });

  it("depois de a assiduidade chegar, calcula o total com a retribuicao da propria pessoa", () => {
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => result.current.registar("p1", recolha()));
    expect(result.current.pendentes).toBe(0);
    // 1200 de base, sem faltas, sem dias para o subsidio: 1200. A retribuicao de p2 (9999) nunca entra em p1.
    expect(result.current.resultados.get("p1")?.resultado.totalBrutoEstimado).toBeCloseTo(1200, 6);
  });

  it("os valores pontuais so contam os do periodo deste mes e os da pessoa, e os anulados ficam de fora", () => {
    estado.lancamentos = [
      { id: "l1", periodo_id: "per-out", pessoa_id: "p1", valor: 30, anulado_em: null },
      { id: "l2", periodo_id: "per-set", pessoa_id: "p1", valor: 999, anulado_em: null },
      { id: "l3", periodo_id: "per-out", pessoa_id: "p1", valor: 100, anulado_em: "2026-10-05T10:00:00Z" },
      { id: "l4", periodo_id: "per-out", pessoa_id: "p2", valor: 500, anulado_em: null },
    ];
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => result.current.registar("p1", recolha()));
    expect(result.current.resultados.get("p1")?.resultado.lancamentosPontuais).toBe(30);
    expect(result.current.resultados.get("p1")?.resultado.totalBrutoEstimado).toBeCloseTo(1230, 6);
    expect(result.current.lancamentosPorPessoa.get("p1")?.map((l) => l.id)).toEqual(["l1", "l3"]);
  });

  it("ao mudar de mes os totais do mes anterior nao se reaproveitam", () => {
    const { result, rerender } = renderHook(({ mes }) => useCalculoRealDoMes(2026, mes), { initialProps: { mes: 10 } });
    act(() => result.current.registar("p1", recolha()));
    expect(result.current.resultados.size).toBe(1);
    rerender({ mes: 11 });
    expect(result.current.resultados.size).toBe(0);
    expect(result.current.pendentes).toBe(1);
    rerender({ mes: 10 });
    expect(result.current.resultados.size).toBe(1);
  });

  it("conta as pessoas cuja assiduidade so se leu em parte", () => {
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => result.current.registar("p1", recolha({ incompleta: true })));
    expect(result.current.incompletas).toBe(1);
  });

  it("sem retribuicao registada a pessoa fica sem total (nao zero)", () => {
    estado.retribuicoes = new Map();
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => result.current.registar("p1", recolha()));
    expect(result.current.resultados.get("p1")?.resultado.totalBrutoEstimado).toBeNull();
  });

  it("devolve o erro de carregar as pessoas em vez de uma lista vazia calada", () => {
    estado.pessoas = [];
    estado.pessoasErro = "falha ao ler";
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    expect(result.current.pessoasErro).toBe("falha ao ler");
    expect(result.current.pessoasActivas).toEqual([]);
  });
});

describe("RecolhaDeAssiduidade", () => {
  const calculoFalso = (registar: (id: string, r: RecolhaAssiduidade) => void) =>
    ({ pessoasActivas: [pessoa("p1")], registar }) as unknown as Parameters<typeof RecolhaDeAssiduidade>[0]["calculo"];

  it("entrega a assiduidade de cada pessoa quando acaba de carregar", () => {
    const registar = vi.fn();
    render(<RecolhaDeAssiduidade calculo={calculoFalso(registar)} ano={2026} mes={10} />);
    expect(registar).toHaveBeenCalledTimes(1);
    expect(registar).toHaveBeenCalledWith("p1", expect.objectContaining({ incompleta: false }));
  });

  it("enquanto carrega nao entrega nada", () => {
    estado.relatorio.loading = true;
    const registar = vi.fn();
    render(<RecolhaDeAssiduidade calculo={calculoFalso(registar)} ano={2026} mes={10} />);
    expect(registar).not.toHaveBeenCalled();
  });

  it("uma parte recusada por falta de permissao chega marcada como incompleta", () => {
    estado.relatorio.faltasRecusadas = true;
    const registar = vi.fn();
    render(<RecolhaDeAssiduidade calculo={calculoFalso(registar)} ano={2026} mes={10} />);
    expect(registar).toHaveBeenCalledWith("p1", expect.objectContaining({ incompleta: true }));
  });
});

describe("useCalculoRealDaPessoa", () => {
  it("calcula o total da pessoa quando tudo chegou", () => {
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
    expect(result.current.aCarregar).toBe(false);
    expect(result.current.resultado?.resultado.totalBrutoEstimado).toBeCloseTo(1200, 6);
    expect(result.current.temPeriodo).toBe(true);
    expect(result.current.periodoAberto).toBe(true);
  });

  it("enquanto a assiduidade carrega nao ha resultado", () => {
    estado.relatorio.loading = true;
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
    expect(result.current.aCarregar).toBe(true);
    expect(result.current.resultado).toBeNull();
  });

  it("sem pessoa nao ha resultado", () => {
    const { result } = renderHook(() => useCalculoRealDaPessoa(undefined, 2026, 10));
    expect(result.current.resultado).toBeNull();
  });

  it("diz quando as retribuicoes foram recusadas e quando a assiduidade so se leu em parte", () => {
    estado.retribuicoesRecusadas = true;
    estado.relatorio.planeadoRecusado = true;
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
    expect(result.current.retribuicaoRecusada).toBe(true);
    expect(result.current.incompleta).toBe(true);
  });

  it("sem periodo no mes o calculo faz-se na mesma, mas diz que nao ha periodo", () => {
    estado.periodo = null;
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
    expect(result.current.temPeriodo).toBe(false);
    expect(result.current.periodoAberto).toBe(false);
    expect(result.current.resultado?.resultado.totalBrutoEstimado).toBeCloseTo(1200, 6);
  });
});
