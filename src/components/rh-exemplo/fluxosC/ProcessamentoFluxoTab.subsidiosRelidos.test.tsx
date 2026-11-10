// O fecho com a configuracao dos subsidios a mudar depois do calculo, de ponta a ponta: o ecra REAL («Calculo do mes»), o calculo REAL
// (`useCalculoRealDoMes`) e a leitura REAL da assinatura (`useSubsidiosAssinatura`, com o `useQuery` verdadeiro e um QueryClient de
// teste). So a base e os hooks de dados que nao interessam aqui entram simulados; a RPC `rpc_hr_subsidios_assinatura` devolve duas
// respostas sucessivas (a configuracao antiga e a nova). Prova que, depois de `reler()`, os resultados e a assinatura enviada mudam
// JUNTOS, e que a assinatura que segue no fecho e a do calculo e nunca a de uma leitura posterior.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";

const SEM_REGRAS_PERIODO: never[] = [];
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => ({ regras: SEM_REGRAS_PERIODO, estado: "ok", isLoading: false }) }));

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  fechar: vi.fn(),
  erro: vi.fn(),
  relatorio: {
    loading: false,
    totais: { planeadoMinutos: 9600, realizadoMinutos: 9600, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0, horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, diasFeriadoTrabalhados: 0 },
    dias: [] as unknown[],
    realizadoRecusado: false,
    faltasRecusadas: false,
    planeadoRecusado: false,
    erro: false,
  },
  pessoas: [{ id: "p1", nome_completo: "Ana Real", estado_registo: "activo" }],
  retribuicoes: new Map<string, unknown[]>(),
  vinculos: new Map<string, unknown[]>(),
}));

vi.mock("@/lib/hr/hrDb", () => ({ hrFrom: vi.fn(), hrRpc: (...a: unknown[]) => m.rpc(...a), isPermissionError: () => false }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => m.erro(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));

vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({ usePessoas: () => ({ pessoas: m.pessoas, loading: false, error: null }) }));
vi.mock("@/components/rh-exemplo/hooks/useCodigosProcessamento", () => ({ useCodigosProcessamento: () => ({ codigos: [], isLoading: false, estado: "ok" }) }));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoPeriodo", () => ({
  useProcessamentoPeriodo: () => ({ periodo: PERIODO, loading: false, saving: false, recusado: false, abrir: vi.fn(), fechar: (...a: unknown[]) => m.fechar(...a) }),
}));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoLancamentos", () => ({
  useProcessamentoLancamentos: () => ({ lancamentos: [], loading: false, saving: false, recusado: false, criar: vi.fn(), criarPorQuantidade: vi.fn(), anular: vi.fn() }),
}));
vi.mock("@/components/rh-exemplo/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({ versoes: [], emVigor: null, estado: "ok", isLoading: false }),
  regraEmVigorNoDia: () => null,
}));
vi.mock("@/components/rh-exemplo/hooks/useDireitosSalariaisDaOrganizacao", () => ({
  useDireitosSalariaisDaOrganizacao: () => ({ porPessoa: new Map(), estado: "ok", isLoading: false }),
  direitosDaPessoa: () => ({ iht: false, km: false, ajudas: false }),
  SEM_DIREITOS_SALARIAIS: { iht: false, km: false, ajudas: false },
}));
vi.mock("@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal", () => ({ useRelatorioAssiduidadeMensal: () => m.relatorio }));
vi.mock("@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useRetribuicoesVigentesDaOrganizacao: () => ({ porPessoa: m.retribuicoes, loading: false, recusado: false, estado: "ok", recarregar: vi.fn() }),
}));
// Na pasta do periodo a configuracao nao se le a parte (uma so fonte); o hook entra simulado como em `useCalculoReal.test`.
vi.mock("@/components/rh-exemplo/hooks/useSubsidiosConfig", () => ({ useSubsidiosConfig: () => ({ estado: "ok", config: null, aGuardar: false, guardar: vi.fn() }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoasVinculosVigentes", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  usePessoasVinculosVigentes: () => ({ vinculos: m.vinculos, loading: false, carregado: true, recusado: false, error: null, recarregar: vi.fn() }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true, loading: false }) }));
vi.mock("@/lib/hr/faltasFecho", () => ({ conferirFaltasDoFecho: async () => ({ ok: true }) }));
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", () => ({
  prepararFechoComDesvios: async () => ({ ok: true, assinaturas: new Map() }),
  prepararFechoComHorasExtra: async () => ({ ok: true, assinaturas: new Map() }),
  useHorasExtraAcoes: () => ({ detetar: vi.fn(), aExecutar: false }),
  hojeLisboa: () => "2026-10-20",
}));
vi.mock("@/components/rh-exemplo/hooks/useProcessamentoResultados", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/resultadosFecho")>("@/lib/hr/resultadosFecho");
  return {
    construirResultadosDoFecho: real.construirResultadosDoFecho,
    motivoDeBloqueioDoFecho: real.motivoDeBloqueioDoFecho,
    MAX_DESCRICAO_LANCAMENTO: real.MAX_DESCRICAO_LANCAMENTO,
    resultadoDeLinhaGravada: real.resultadoDeLinhaGravada,
    usePessoasObrigatoriasDoFecho: () => OBRIGATORIAS,
    useProcessamentoResultados: () => ({ estado: "inactivo", porPessoa: new Map(), fechadoEm: null, fechadoPorNome: null, antesDoRegisto: false, recarregar: vi.fn() }),
  };
});

import { ProcessamentoFluxoTab } from "./ProcessamentoFluxoTab";

const PERIODO = { id: "per-1", estado: "aberto", fechado_em: null };
const OBRIGATORIAS = { obrigatorias: ["p1"], estado: "ok" };
const MD5_A = "a".repeat(32);
const MD5_B = "b".repeat(32);
/** A resposta da base: configuracao antiga (este periodo paga ferias) e nova (o mes de ferias passou a julho: este periodo ja nao paga). */
const RESPOSTA_ANTIGA = { aplica: true, ano: 2026, mes: 6, ativo_desde: "2026-01-01", ferias_mes: 6, natal_mes: 11, paga_ferias: true, paga_natal: false, assinatura: MD5_A };
const RESPOSTA_NOVA = { ...RESPOSTA_ANTIGA, ferias_mes: 7, paga_ferias: false, assinatura: MD5_B };

type Enviado = { pessoa_id: string; subsidios_assinatura?: string; total_bruto: number; totais: Record<string, number> };
const enviadoNoFecho = (chamada: number): Enviado => (m.fechar.mock.calls[chamada][0] as Enviado[])[0];

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.rpc.mockReset();
  m.fechar.mockReset();
  m.erro.mockReset();
  m.retribuicoes = new Map([["p1", [{ id: "ret-p1", pessoa_id: "p1", valor_base: 1200, periodicidade: "mensal", duodecimos_pct: 0, valido_de: "2020-01-01", valido_ate: null }]]]);
  m.vinculos = new Map([["p1", [{ tipoContrato: "sem_termo", estado: "activo", dataInicio: "2020-01-01", dataFim: null, horasSemanais: 40 }]]]);
});
afterEach(cleanup);

const abrir = () => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <LanguageProvider><ProcessamentoFluxoTab /></LanguageProvider>
    </QueryClientProvider>,
  );
};
/** O total bruto da Ana (a ultima coluna numerica da linha). */
const totalDaAna = (): string => within(screen.getByRole("rowheader", { name: /Ana Real/ }).closest("tr") as HTMLElement).getAllByRole("cell")[6].textContent ?? "";
const botaoFechar = () => screen.getByRole("button", { name: "Fechar o mês" });
const confirmarFecho = () => {
  fireEvent.click(botaoFechar());
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Fechar o mês" }));
};

describe("o fecho depois de a configuracao dos subsidios mudar (useQuery real)", () => {
  it("depois de reler, os resultados e a assinatura enviada mudam JUNTOS; a assinatura enviada no fecho e a do calculo", async () => {
    let entregarNova: (v: unknown) => void = () => undefined;
    m.rpc
      .mockResolvedValueOnce({ data: RESPOSTA_ANTIGA, error: null })
      .mockReturnValueOnce(new Promise((resolve) => { entregarNova = resolve; }));
    m.fechar.mockResolvedValueOnce("A configuração dos subsídios mudou depois do cálculo. Atualize a página e feche de novo.").mockResolvedValue(null);
    abrir();

    // 1. O calculo com a configuracao antiga: o subsidio de ferias entra (1200) e o total e 2400.
    await waitFor(() => expect(totalDaAna()).toMatch(/2.?400,00/));
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_subsidios_assinatura", { p_periodo_id: "per-1" });

    // 2. Fecho: segue a assinatura DA LEITURA DO CALCULO (A) com o subsidio desse calculo; a base recusa (a configuracao mudou).
    confirmarFecho();
    await waitFor(() => expect(m.fechar).toHaveBeenCalledTimes(1));
    expect(enviadoNoFecho(0)).toMatchObject({ pessoa_id: "p1", subsidios_assinatura: MD5_A, total_bruto: 2400 });
    expect(enviadoNoFecho(0).totais.subsidio_ferias).toBe(1200);
    await waitFor(() => expect(m.erro).toHaveBeenCalledWith(expect.stringContaining("mudou depois do cálculo")));

    // 3. A releitura decorre: o botao fica desactivado e di-lo em texto; os dados antigos ainda aparecem mas nao se pode fechar com eles.
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(botaoFechar()).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByText(/a reler a configuração dos subsídios/i)).toBeInTheDocument();
    fireEvent.click(botaoFechar());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.fechar).toHaveBeenCalledTimes(1);

    // 4. A releitura acaba: resultados e assinatura mudam juntos.
    entregarNova({ data: RESPOSTA_NOVA, error: null });
    await waitFor(() => expect(totalDaAna()).toMatch(/^1.?200,00/));
    await waitFor(() => expect(botaoFechar()).toHaveAttribute("aria-disabled", "false"));

    // 5. O fecho seguinte leva a assinatura NOVA (B) com o resultado SEM subsidio: nunca A com o valor novo, nem B com o valor antigo.
    confirmarFecho();
    await waitFor(() => expect(m.fechar).toHaveBeenCalledTimes(2));
    expect(enviadoNoFecho(1)).toMatchObject({ pessoa_id: "p1", subsidios_assinatura: MD5_B, total_bruto: 1200 });
    expect(enviadoNoFecho(1).totais.subsidio_ferias).toBe(0);
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });
});
