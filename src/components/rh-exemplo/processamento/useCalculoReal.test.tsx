// O calculo REAL partilhado (organizacao e pessoa). Os hooks reais entram por argumento, ao nivel dos wrappers de
// rh-exemplo/hooks: nao ha Supabase. So a base (hrDb) e a observabilidade sao simuladas para o modulo das retribuicoes
// carregar com as suas funcoes puras verdadeiras (`escolherRetribuicaoVigente`, `limitesDoMes`).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";

// As regras do periodo da folha: sem regra (a base ainda sem as RPCs) o periodo e o mes de calendario.
const SEM_REGRAS_PERIODO: never[] = [];
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => ({ regras: SEM_REGRAS_PERIODO, estado: "ok", isLoading: false }) }));

vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: vi.fn(), hrRpc: vi.fn(), isPermissionError: () => false }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const estado = vi.hoisted(() => ({
  pedidosRelatorio: vi.fn(),
  pessoas: [] as unknown[],
  pessoasACarregar: false,
  pessoasErro: null as string | null,
  periodo: null as unknown,
  periodoACarregar: false,
  lancamentos: [] as unknown[],
  retribuicoes: new Map<string, unknown[]>(),
  retribuicoesRecusadas: false,
  // A regra salarial em vigor (`null` = sem regra) e os direitos por pessoa.
  regra: null as null | Record<string, unknown>,
  direitos: new Map<string, { iht: boolean; km: boolean; ajudas: boolean }>(),
  // Os subsidios de ferias e de Natal: a configuracao (por omissao lida e desligada) e os vinculos (so se pedem nos meses que pagam).
  subsidios: { estado: "ok", config: null } as { estado: string; config: unknown },
  pedidosConfig: vi.fn(),
  // A assinatura da configuracao dos subsidios do periodo (rpc_hr_subsidios_assinatura): a unica fonte do mes quando o periodo existe.
  assinatura: { estado: "ok", leitura: null } as { estado: string; leitura: unknown; aReler?: boolean },
  reler: vi.fn(),
  pedidosAssinatura: vi.fn(),
  vinculos: new Map<string, unknown[]>(),
  vinculosCarregado: true,
  vinculosRecusado: false,
  pedidosVinculos: vi.fn(),
  relatorio: {
    loading: false,
    totais: { planeadoMinutos: 9600, realizadoMinutos: 9600, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0, horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, diasFeriadoTrabalhados: 0 },
    dias: [] as unknown[],
    realizadoRecusado: false,
    faltasRecusadas: false,
    planeadoRecusado: false,
    erro: false,
  },
}));

vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({
  usePessoas: () => ({ pessoas: estado.pessoas, loading: estado.pessoasACarregar, error: estado.pessoasErro }),
}));
vi.mock("@/components/rh-exemplo/hooks/useCodigosProcessamento", () => ({ useCodigosProcessamento: () => ({ codigos: [], isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoPeriodo", () => ({
  useProcessamentoPeriodo: () => ({ periodo: estado.periodo, loading: estado.periodoACarregar, saving: false, recusado: false, abrir: vi.fn(), fechar: vi.fn() }),
}));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoLancamentos", () => ({
  useProcessamentoLancamentos: () => ({ lancamentos: estado.lancamentos, loading: false, saving: false, recusado: false, criar: vi.fn(), anular: vi.fn() }),
}));
vi.mock("@/components/rh-exemplo/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({ versoes: [], emVigor: estado.regra, estado: "ok", isLoading: false }),
  regraEmVigorNoDia: () => estado.regra,
}));
vi.mock("@/components/rh-exemplo/hooks/useDireitosSalariaisDaOrganizacao", () => ({
  useDireitosSalariaisDaOrganizacao: () => ({ porPessoa: estado.direitos, estado: "ok", isLoading: false }),
  direitosDaPessoa: (mapa: Map<string, unknown>, id: string) => mapa.get(id) ?? { iht: false, km: false, ajudas: false },
  SEM_DIREITOS_SALARIAIS: { iht: false, km: false, ajudas: false },
}));
vi.mock("@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal", () => ({ useRelatorioAssiduidadeMensal: (...args: unknown[]) => { estado.pedidosRelatorio(...args); return estado.relatorio; } }));
vi.mock("@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useRetribuicoesVigentesDaOrganizacao: () => ({
    porPessoa: estado.retribuicoes, loading: false, recusado: estado.retribuicoesRecusadas, recarregar: vi.fn(),
  }),
}));

vi.mock("@/components/rh-exemplo/hooks/useSubsidiosConfig", () => ({
  useSubsidiosConfig: (...args: unknown[]) => {
    estado.pedidosConfig(...args);
    return { ...estado.subsidios, aGuardar: false, guardar: vi.fn() };
  },
}));
vi.mock("@/components/rh-exemplo/hooks/useSubsidiosAssinatura", () => ({
  useSubsidiosAssinatura: (...args: unknown[]) => {
    estado.pedidosAssinatura(...args);
    return { ...estado.assinatura, reler: estado.reler };
  },
}));
vi.mock("@/components/rh-exemplo/hooks/usePessoasVinculosVigentes", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  usePessoasVinculosVigentes: (...args: unknown[]) => {
    estado.pedidosVinculos(...args);
    return { vinculos: estado.vinculos, loading: false, carregado: estado.vinculosCarregado, recusado: estado.vinculosRecusado, error: null, recarregar: vi.fn() };
  },
}));

import { RecolhaDeAssiduidade, useCalculoRealDaPessoa, useCalculoRealDoMes, type RecolhaAssiduidade } from "./useCalculoReal";

const pessoa = (id: string, estadoRegisto = "activo") => ({ id, nome_completo: `Pessoa ${id}`, estado_registo: estadoRegisto });
const retribuicao = (pessoaId: string, valor = 1200) => ({
  pessoa_id: pessoaId, valor_base: valor, periodicidade: "mensal", duodecimos_pct: 0, valido_de: "2026-01-01", valido_ate: null,
});
const recolha = (extra: Partial<RecolhaAssiduidade> = {}): RecolhaAssiduidade =>
  ({ totais: estado.relatorio.totais, dias: [], incompleta: false, ...extra }) as unknown as RecolhaAssiduidade;

beforeEach(() => {
  cleanup();
  estado.pessoas = [pessoa("p1"), pessoa("p2", "inactivo")];
  estado.pessoasACarregar = false;
  estado.pessoasErro = null;
  estado.periodo = { id: "per-out", estado: "aberto" };
  estado.periodoACarregar = false;
  estado.lancamentos = [];
  estado.retribuicoes = new Map([["p1", [retribuicao("p1")]], ["p2", [retribuicao("p2", 9999)]]]);
  estado.retribuicoesRecusadas = false;
  estado.regra = null;
  estado.direitos = new Map();
  estado.subsidios = { estado: "ok", config: null };
  estado.pedidosConfig.mockClear();
  estado.assinatura = { estado: "ok", leitura: null };
  estado.reler.mockReset();
  estado.pedidosAssinatura.mockClear();
  estado.vinculos = new Map();
  estado.vinculosCarregado = true;
  estado.vinculosRecusado = false;
  estado.pedidosVinculos.mockClear();
  estado.relatorio.loading = false;
  estado.relatorio.realizadoRecusado = false;
  estado.relatorio.faltasRecusadas = false;
  estado.relatorio.planeadoRecusado = false;
  estado.relatorio.erro = false;
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

  it("com regra, o subsidio vem dela dia a dia e o IHT so entra para quem tem o direito", () => {
    estado.regra = {
      subsidio_limite_min: 300, subsidio_valor_hora: 0.76, subsidio_valor_dia: 6.15,
      he_pct_dia_util: 50, he_pct_feriado: 75, he_pct_descanso: 100, iht_pct: 25, noturnas: [],
    };
    estado.pessoas = [pessoa("p1"), pessoa("p3")];
    estado.retribuicoes = new Map([["p1", [retribuicao("p1")]], ["p3", [retribuicao("p3")]]]);
    estado.direitos = new Map([["p1", { iht: true, km: false, ajudas: false }]]);
    const dias = [{ estado: "normal", realizadoMinutos: 480 }, { estado: "normal", realizadoMinutos: 270 }];
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => result.current.registar("p1", recolha({ dias: dias as never })));
    act(() => result.current.registar("p3", recolha({ dias: dias as never })));
    // Um dia de 8 h = 6,15 EUR; um de 4 h 30 = 3,42 EUR.
    expect(result.current.resultados.get("p1")?.resultado.subsidioAlimentacao).toBeCloseTo(6.15 + 3.42, 6);
    expect(result.current.resultados.get("p1")?.resultado.linhasRegra.find((l) => l.tipo === "iht")?.valor).toBeCloseTo(300, 6);
    expect(result.current.resultados.get("p3")?.resultado.linhasRegra.some((l) => l.tipo === "iht")).toBe(false);
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

  it("um cargo com salario semanal (300 por semana) dá a base 300 x 52 / 12 = 1300, o valor hora e o IHT sobre essa base", () => {
    estado.regra = {
      subsidio_limite_min: 300, subsidio_valor_hora: 0.76, subsidio_valor_dia: 6.15,
      he_pct_dia_util: 50, he_pct_feriado: 75, he_pct_descanso: 100, iht_pct: 25, noturnas: [],
    };
    estado.retribuicoes = new Map([["p1", [{ ...retribuicao("p1", 300), periodicidade: "semanal" }]]]);
    estado.direitos = new Map([["p1", { iht: true, km: false, ajudas: false }]]);
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => result.current.registar("p1", recolha()));
    const calculo = result.current.resultados.get("p1");
    expect(calculo?.periodicidade).toBe("semanal");
    expect(calculo?.resultado.avisos).not.toContain("periodicidade_nao_convertivel");
    expect(calculo?.resultado.baseMes).toBeCloseTo(1300, 6);
    expect(calculo?.resultado.valorHoraReal).toBeCloseTo(8.125, 6); // 1300 / 160 h
    expect(calculo?.resultado.linhasRegra.find((l) => l.tipo === "iht")?.valor).toBeCloseTo(325, 6);
    expect(calculo?.resultado.totalBrutoEstimado).toBeCloseTo(1300 + 325, 6);
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
    ({ pessoasActivas: [pessoa("p1")], registar, intervalo: { de: "2026-10-01", ate: "2026-10-31", estimado: false } }) as unknown as Parameters<typeof RecolhaDeAssiduidade>[0]["calculo"];

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

  it.each(["ausenciasRecusadas", "feriadosRecusados", "tiposRecusados"])("%s (ausencias, feriados, tipos de ausencia) chega como incompleta: o fecho bloqueia", (campo) => {
    (estado.relatorio as Record<string, unknown>)[campo] = true;
    const registar = vi.fn();
    render(<RecolhaDeAssiduidade calculo={calculoFalso(registar)} ano={2026} mes={10} />);
    expect(registar).toHaveBeenCalledWith("p1", expect.objectContaining({ incompleta: true }));
    (estado.relatorio as Record<string, unknown>)[campo] = false;
  });
});

describe("leitura falhada da assiduidade (erro, nao permissao)", () => {
  it("uma leitura que falhou chega marcada como incompleta (nunca como linhas vazias boas)", () => {
    estado.relatorio.erro = true;
    const registar = vi.fn();
    render(<RecolhaDeAssiduidade calculo={{ pessoasActivas: [pessoa("p1")], registar, intervalo: { de: "2026-10-01", ate: "2026-10-31", estimado: false } } as never} ano={2026} mes={10} />);
    expect(registar).toHaveBeenCalledWith("p1", expect.objectContaining({ incompleta: true }));
  });

  it("a ficha da pessoa tambem a marca incompleta", () => {
    estado.relatorio.erro = true;
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
    expect(result.current.incompleta).toBe(true);
  });

  it("assiduidadeIncompleta(id) diz que pessoas ficaram incompletas (bloqueia o fecho)", () => {
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 10));
    act(() => {
      result.current.registar("p1", recolha({ incompleta: true }));
    });
    expect(result.current.assiduidadeIncompleta("p1")).toBe(true);
    expect(result.current.assiduidadeIncompleta("p2")).toBe(false);
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

  it("a pessoa com cargo semanal tem o total pela conversao semanal x 52 / 12", () => {
    estado.retribuicoes = new Map([["p1", [{ ...retribuicao("p1", 300), periodicidade: "semanal" }]]]);
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
    expect(result.current.resultado?.periodicidade).toBe("semanal");
    expect(result.current.resultado?.resultado.totalBrutoEstimado).toBeCloseTo(1300, 6);
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

  describe("congelarSeFechado: um periodo fechado nao monta o calculo vivo", () => {
    beforeEach(() => estado.pedidosRelatorio.mockClear());

    it("com o periodo fechado nao pede a assiduidade da pessoa e nao ha resultado vivo", () => {
      estado.periodo = { id: "per", estado: "fechado" };
      const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10, { congelarSeFechado: true }));
      expect(estado.pedidosRelatorio.mock.calls.every((c) => c[0] === undefined)).toBe(true);
      expect(result.current.resultado).toBeNull();
      expect(result.current.aCarregar).toBe(false);
      expect(result.current.periodoAberto).toBe(false);
    });

    it("com o periodo aberto, ou sem periodo, continua vivo", () => {
      estado.periodo = { id: "per", estado: "aberto" };
      expect(renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10, { congelarSeFechado: true })).result.current.resultado).not.toBeNull();
      estado.periodo = null;
      expect(renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10, { congelarSeFechado: true })).result.current.resultado).not.toBeNull();
      expect(estado.pedidosRelatorio.mock.calls.every((c) => c[0] === "p1")).toBe(true);
    });

    it("enquanto o periodo carrega nao pede a assiduidade viva (pode ser um mes fechado), e pede-a quando se sabe que esta aberto", () => {
      estado.periodo = null;
      estado.periodoACarregar = true;
      const { result, rerender } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10, { congelarSeFechado: true }));
      expect(estado.pedidosRelatorio.mock.calls.length).toBeGreaterThan(0);
      expect(estado.pedidosRelatorio.mock.calls.every((c) => c[0] === undefined)).toBe(true);
      expect(result.current.resultado).toBeNull();
      expect(result.current.aCarregar).toBe(true);
      estado.periodo = { id: "per", estado: "aberto" };
      estado.periodoACarregar = false;
      rerender();
      expect(estado.pedidosRelatorio.mock.calls.at(-1)?.[0]).toBe("p1");
      expect(result.current.resultado).not.toBeNull();
    });

    it("sem a opcao, o periodo a carregar nao muda nada: pede o vivo como sempre", () => {
      estado.periodo = null;
      estado.periodoACarregar = true;
      renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10));
      expect(estado.pedidosRelatorio.mock.calls.every((c) => c[0] === "p1")).toBe(true);
    });

    it("sem a opcao, o periodo fechado calcula em vivo como sempre (outros ecras)", () => {
      estado.periodo = { id: "per", estado: "fechado" };
      expect(renderHook(() => useCalculoRealDaPessoa("p1", 2026, 10)).result.current.resultado).not.toBeNull();
    });
  });
});

describe("subsidios de ferias e de Natal no calculo real", () => {
  const CONFIG = { temConfig: true, ativoDesde: "2026-01-01", feriasMes: 6, natalMes: 11, folhasFechadasDesde: null, ultimaFolhaFechadaAte: null };
  const vinculo = (dataInicio: string, dataFim: string | null = null) => ({ tipoContrato: "sem_termo", estado: "activo", dataInicio, dataFim, horasSemanais: 40 });
  const MD5_A = "a".repeat(32);
  const MD5_B = "b".repeat(32);
  // O que a base diz do periodo: pagamento ligado, ferias em junho e Natal em novembro; o periodo paga o que o seu mes pede.
  const leitura = (mes: number, extra: Record<string, unknown> = {}) => ({
    aplica: true, ano: 2026, mes, ativoDesde: "2026-01-01", feriasMes: 6, natalMes: 11, pagaFerias: mes === 6, pagaNatal: mes === 11, assinatura: MD5_A, ...extra,
  });
  const ligar = (vinculos: unknown[] = [vinculo("2020-01-01")], mes = 6) => {
    estado.assinatura = { estado: "ok", leitura: leitura(mes) };
    estado.vinculos = new Map([["p1", vinculos]]);
  };
  const calcular = (mes: number) => {
    const { result } = renderHook(() => useCalculoRealDoMes(2026, mes));
    act(() => result.current.registar("p1", recolha()));
    return result;
  };

  it("no mes de ferias, com a configuracao ligada, paga o subsidio e entra no total", () => {
    ligar();
    const r = calcular(6).current.resultados.get("p1")?.resultado;
    expect(r?.subsidioFerias).toBe(1200);
    expect(r?.totalBrutoEstimado).toBeCloseTo(2400, 6);
  });

  it("noutro mes nao paga e nem pede os vinculos", () => {
    ligar(undefined, 10);
    const r = calcular(10).current.resultados.get("p1")?.resultado;
    expect(r?.subsidioFerias).toBe(0);
    expect(r?.totalBrutoEstimado).toBeCloseTo(1200, 6);
    expect(estado.pedidosVinculos.mock.calls.every((c) => c[0] === false)).toBe(true);
  });

  it("no mes que paga, pede os vinculos", () => {
    ligar();
    calcular(6);
    expect(estado.pedidosVinculos.mock.calls.at(-1)?.[0]).toBe(true);
  });

  it("desligada (ou sem configuracao): nada se paga, como sempre", () => {
    estado.assinatura = { estado: "ok", leitura: { aplica: false, ano: 2026, mes: 6, ativoDesde: null, feriasMes: 6, natalMes: 11, pagaFerias: false, pagaNatal: false, assinatura: null } };
    const r = calcular(6);
    expect(r.current.resultados.get("p1")?.resultado.subsidioFerias).toBe(0);
    expect(r.current.subsidiosAssinatura).toBeNull();
  });

  it("admitido no ano: a proporcao pelos dias do vinculo (1 de marco = 306/365)", () => {
    ligar([vinculo("2026-03-01")]);
    expect(calcular(6).current.resultados.get("p1")?.resultado.subsidioFerias).toBe(1006.03);
  });

  it("contrato a terminar no ano: nao paga e avisa", () => {
    ligar([vinculo("2020-01-01", "2026-12-31")]);
    const r = calcular(6).current.resultados.get("p1")?.resultado;
    expect(r?.subsidioFerias).toBe(0);
    expect(r?.avisosSubsidios).toEqual(["subsidio_cessacao_por_tratar"]);
  });

  it("contrato de 2020 renovado em 1/3/2026 sem interrupcao: conta como continuo, paga o inteiro (nunca 306/365)", () => {
    ligar([vinculo("2020-03-01", "2026-02-28"), vinculo("2026-03-01")]);
    const r = calcular(6).current.resultados.get("p1")?.resultado;
    expect(r?.subsidioFerias).toBe(1200);
    expect(r?.avisosSubsidios ?? []).toEqual([]);
  });

  it("renovacao com intervalo no ano: nao paga e avisa dos contratos com intervalo", () => {
    ligar([vinculo("2020-03-01", "2026-02-28"), vinculo("2026-03-11")]);
    const r = calcular(6).current.resultados.get("p1")?.resultado;
    expect(r?.subsidioFerias).toBe(0);
    expect(r?.avisosSubsidios).toEqual(["subsidio_contratos_com_intervalo"]);
  });

  it("sem vinculo conhecido: nao paga e avisa", () => {
    ligar([]);
    expect(calcular(6).current.resultados.get("p1")?.resultado.avisosSubsidios).toEqual(["subsidio_sem_vinculo"]);
  });

  it("configuracao por ler (erro, recusada, a carregar) bloqueia o fecho com a leitura, e o mes aberto nao paga a zero em silencio", () => {
    for (const leitura of ["erro", "recusado", "a_carregar"]) {
      estado.assinatura = { estado: leitura, leitura: null };
      const { result } = renderHook(() => useCalculoRealDoMes(2026, 6));
      expect(result.current.subsidiosLeitura).toBe(leitura);
      expect(result.current.subsidiosAssinatura).toBeNull();
    }
    estado.assinatura = { estado: "erro", leitura: null };
    expect(renderHook(() => useCalculoRealDoMes(2026, 6)).result.current.aCarregar).toBe(false);
    estado.assinatura = { estado: "a_carregar", leitura: null };
    expect(renderHook(() => useCalculoRealDoMes(2026, 6)).result.current.aCarregar).toBe(true);
  });

  it("configuracao indisponivel (a base ainda nao a tem) conta como desligada e nao bloqueia", () => {
    estado.assinatura = { estado: "indisponivel", leitura: null };
    const r = calcular(6);
    expect(r.current.subsidiosLeitura).toBe("indisponivel");
    expect(r.current.subsidiosAssinatura).toBeNull();
    expect(r.current.resultados.get("p1")?.resultado.subsidioFerias).toBe(0);
  });

  it("vinculos ainda por ler no mes que paga: leitura a carregar (nunca «sem vinculo» a correr)", () => {
    ligar();
    estado.vinculosCarregado = false;
    const { result } = renderHook(() => useCalculoRealDoMes(2026, 6));
    expect(result.current.subsidiosLeitura).toBe("a_carregar");
    expect(result.current.aCarregar).toBe(true);
  });

  it("vinculos recusados no mes que paga: a leitura dos subsidios fica recusada", () => {
    ligar();
    estado.vinculosRecusado = true;
    expect(renderHook(() => useCalculoRealDoMes(2026, 6)).result.current.subsidiosLeitura).toBe("recusado");
  });

  it("a ficha da pessoa tambem paga o subsidio", () => {
    ligar();
    const { result } = renderHook(() => useCalculoRealDaPessoa("p1", 2026, 6));
    expect(result.current.resultado?.resultado.subsidioFerias).toBe(1200);
    expect(result.current.subsidiosLeitura).toBe("ok");
  });

  describe("a assinatura da configuracao vem com o calculo", () => {
    it("com o pagamento ligado, o calculo expoe a assinatura que veio JUNTO com a decisao do mes", () => {
      ligar();
      const r = calcular(6);
      expect(r.current.subsidiosAssinatura).toBe(MD5_A);
      expect(estado.pedidosAssinatura).toHaveBeenCalledWith("per-out");
    });

    it("a assinatura e enviada tambem num mes que nao paga (a base exige-a em toda a folha coberta)", () => {
      ligar(undefined, 10);
      expect(calcular(10).current.subsidiosAssinatura).toBe(MD5_A);
    });

    it("o mes decide-se pela base, nao pela configuracao lida a parte: a base diz que julho paga ferias e paga", () => {
      estado.subsidios = { estado: "ok", config: CONFIG };
      estado.assinatura = { estado: "ok", leitura: leitura(7, { feriasMes: 7, pagaFerias: true }) };
      estado.vinculos = new Map([["p1", [vinculo("2020-01-01")]]]);
      expect(calcular(7).current.resultados.get("p1")?.resultado.subsidioFerias).toBe(1200);
    });

    it("com o periodo aberto nao se le a configuracao a parte (uma so fonte)", () => {
      ligar();
      calcular(6);
      expect(estado.pedidosConfig.mock.calls.every((c) => c[0] === false)).toBe(true);
    });

    it("a configuracao muda depois do calculo: o calculo e a assinatura mudam JUNTOS (nunca a antiga com o valor novo)", () => {
      ligar();
      const { result, rerender } = renderHook(() => useCalculoRealDoMes(2026, 6));
      act(() => result.current.registar("p1", recolha()));
      expect(result.current.resultados.get("p1")?.resultado.subsidioFerias).toBe(1200);
      expect(result.current.subsidiosAssinatura).toBe(MD5_A);

      // O mes de ferias passou a julho: a base devolve outra assinatura e este periodo ja nao paga.
      estado.assinatura = { estado: "ok", leitura: leitura(6, { feriasMes: 7, pagaFerias: false, assinatura: MD5_B }) };
      rerender();
      expect(result.current.resultados.get("p1")?.resultado.subsidioFerias).toBe(0);
      expect(result.current.subsidiosAssinatura).toBe(MD5_B);
    });

    it("sem periodo (ainda nao aberto) decide-se pela configuracao, como antes, e nao ha assinatura", () => {
      estado.periodo = null;
      estado.subsidios = { estado: "ok", config: CONFIG };
      estado.vinculos = new Map([["p1", [vinculo("2020-01-01")]]]);
      const r = calcular(6);
      expect(r.current.resultados.get("p1")?.resultado.subsidioFerias).toBe(1200);
      expect(r.current.subsidiosAssinatura).toBeNull();
      expect(estado.pedidosConfig.mock.calls.at(-1)?.[0]).toBe(true);
    });

    it("subsidiosAReler diz que a releitura decorre (o fecho espera por ela) e e falso quando nao decorre", () => {
      ligar();
      expect(calcular(6).current.subsidiosAReler).toBe(false);
      estado.assinatura = { estado: "ok", leitura: leitura(6), aReler: true };
      expect(calcular(6).current.subsidiosAReler).toBe(true);
    });

    it("relerSubsidios volta a ler a assinatura (para depois de o fecho ser recusado)", async () => {
      ligar();
      const r = calcular(6);
      await r.current.relerSubsidios();
      expect(estado.reler).toHaveBeenCalledTimes(1);
    });
  });
});
