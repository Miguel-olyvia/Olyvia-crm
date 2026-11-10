/**
 * O separador «Subsídios» de /rh-exemplo/processamento-salarial > Configuração: aparece, abre o ecrã da configuração do pagamento
 * dos subsídios de férias e de Natal, e respeita as permissões (só leitura sem `hr.vencimento.codigos.gerir`).
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
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
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
const abrirAba = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Subsídios" }), { button: 0 });

describe("RhConfiguracaoVencimento: separador dos subsídios", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    m.rpc.mockReset();
    m.rpc.mockResolvedValue({
      data: { tem_config: true, ativo_desde: "2026-01-01", ferias_mes: 6, natal_mes: 11, folhas_fechadas_desde: null, ultima_folha_fechada_ate: null },
      error: null,
    });
  });

  it("quem gere os códigos vê o separador e edita a configuração", async () => {
    permitir("hr.vencimento.codigos.view", "hr.vencimento.codigos.gerir");
    await abrir();
    abrirAba();
    expect(await screen.findByTestId("subs-cfg")).toBeInTheDocument();
    expect(await screen.findByRole("switch", { name: "Pagar os subsídios de férias e de Natal" })).toBeInTheDocument();
    expect(screen.getByText("Subsídios de férias e de Natal")).toBeInTheDocument();
  }, 30000);

  it("quem só vê (codigos.view) vê o separador em só leitura, com o motivo", async () => {
    permitir("hr.vencimento.codigos.view");
    await abrir();
    abrirAba();
    expect(await screen.findByTestId("subs-cfg-so-leitura")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  }, 30000);

  it("quem só tem subsidio.view também vê o separador (só leitura)", async () => {
    permitir("hr.vencimento.subsidio.view");
    await abrir();
    abrirAba();
    expect(await screen.findByTestId("subs-cfg-so-leitura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  }, 30000);

  it("sem nenhuma das permissões de ver não há ecrã nem separador", async () => {
    permitir();
    await abrir();
    expect(screen.queryByRole("tab", { name: "Subsídios" })).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  }, 30000);

  it("os separadores que já existiam continuam lá", async () => {
    permitir("hr.vencimento.codigos.view", "hr.vencimento.codigos.gerir");
    await abrir();
    for (const nome of ["Regras salariais"]) expect(screen.getByRole("tab", { name: nome })).toBeInTheDocument();
    // Sem periodo.view o separador do período não aparece: códigos, regras salariais, horas extra e subsídios.
    expect(screen.getAllByRole("tab").length).toBe(4);
  }, 30000);
});
