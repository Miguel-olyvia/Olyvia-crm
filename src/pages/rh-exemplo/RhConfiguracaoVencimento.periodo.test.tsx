/**
 * O separador «Período da folha» de /rh-exemplo/processamento-salarial > Configuração: aparece com a mesma porta da página,
 * abre o ecrã do período e só deixa alterar a quem tem `hr.processamento.periodo.gerir`.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/hr/hrDb", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return { ...real, hrRpc: (...a: unknown[]) => m.rpc(...a) };
});
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
const hasPermission = vi.fn((_p: string) => false);
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission, loading: false }) }));
vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({ codigos: [], isLoading: false, isSaving: false, criar: vi.fn(), actualizar: vi.fn(), definirActivo: vi.fn() }),
}));
vi.mock("@/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({ versoes: [], emVigor: null, maisRecente: null, estado: "indisponivel", isLoading: false, isSaving: false, guardar: vi.fn(), recarregar: vi.fn() }),
}));

async function abrir() {
  const { default: Pagina } = await import("./RhConfiguracaoVencimento");
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Pagina />
    </QueryClientProvider>,
  );
}
const permitir = (...permitidas: string[]) => hasPermission.mockImplementation((p: string) => permitidas.includes(p));
const abrirAba = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Período da folha" }), { button: 0 });

describe("RhConfiguracaoVencimento: separador do período da folha", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    m.rpc.mockReset();
    m.rpc.mockImplementation(async () => ({
      data: [{ id: "r1", dia_inicio: 22, valido_de: "2026-01-01", em_vigor: true, criada_em: "2025-12-01T10:00:00Z", criada_por_nome: null, substituida_em: null }],
      error: null,
    }));
  });

  it("quem pode gerir o período vê o separador e o seletor do dia", async () => {
    permitir("hr.vencimento.codigos.view", "hr.processamento.periodo.view", "hr.processamento.periodo.gerir");
    await abrir();
    abrirAba();
    expect(await screen.findByTestId("periodo-folha-em-vigor")).toHaveTextContent("A folha começa no dia 22 de cada mês");
    expect(screen.getByLabelText("Dia em que a folha começa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar regra" })).toBeInTheDocument();
  }, 30000);

  it("quem só pode ver (sem periodo.gerir) vê o separador em só leitura, com o motivo", async () => {
    permitir("hr.vencimento.codigos.view", "hr.processamento.periodo.view");
    await abrir();
    abrirAba();
    expect(await screen.findByTestId("periodo-folha-em-vigor")).toBeInTheDocument();
    expect(screen.getByText("Só quem gere o período da folha pode alterar esta regra.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dia em que a folha começa")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar regra" })).toBeNull();
  }, 30000);

  it("sem periodo.view não há separador do período, mesmo com codigos.gerir (4 separadores)", async () => {
    permitir("hr.vencimento.codigos.view", "hr.vencimento.codigos.gerir");
    await abrir();
    expect(screen.queryByRole("tab", { name: "Período da folha" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(m.rpc).not.toHaveBeenCalled();
  }, 30000);

  it("quem só tem subsidio.view não vê o separador do período", async () => {
    permitir("hr.vencimento.subsidio.view");
    await abrir();
    expect(screen.queryByRole("tab", { name: "Período da folha" })).toBeNull();
  }, 30000);

  it("só com periodo.view entra na página e vê apenas o separador do período, em só leitura", async () => {
    permitir("hr.processamento.periodo.view");
    await abrir();
    const separadores = screen.getAllByRole("tab");
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toHaveTextContent("Período da folha");
    expect(await screen.findByTestId("periodo-folha-em-vigor")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dia em que a folha começa")).toBeNull();
  }, 30000);

  it("sem nenhuma das permissões de entrar não há ecrã nem separador", async () => {
    permitir();
    await abrir();
    expect(screen.queryByRole("tab", { name: "Período da folha" })).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  }, 30000);
});
