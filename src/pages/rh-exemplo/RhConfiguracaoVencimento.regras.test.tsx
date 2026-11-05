/**
 * O caminho REAL (/rh-exemplo/processamento-salarial > Configuracao): o separador «Regras salariais» existe, abre a seccao ligada
 * pelo wrapper `regrasSalariaisReal`, e a seccao do subsidio antigo diz que o valor passa a vir da regra da organizacao.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
const hasPermission = vi.fn((_p: string) => false);
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission, loading: false }) }));
vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({ codigos: [], isLoading: false, isSaving: false, criar: vi.fn(), actualizar: vi.fn(), definirActivo: vi.fn() }),
}));
vi.mock("@/hooks/useRegrasSubsidioAlimentacao", () => ({
  useRegrasSubsidioAlimentacao: () => ({
    regra: { minutosMinimosDia: 300 },
    temRegraGravada: true,
    isLoading: false,
    isFetched: true,
    error: null,
    isSaving: false,
    gravar: vi.fn(),
  }),
}));
let estadoRegras: "ok" | "indisponivel" = "indisponivel";
vi.mock("@/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({
    versoes: [],
    emVigor: null,
    maisRecente: null,
    estado: estadoRegras,
    isLoading: false,
    isSaving: false,
    guardar: vi.fn(),
    recarregar: vi.fn(),
  }),
}));

async function abrir() {
  const { default: Pagina } = await import("./RhConfiguracaoVencimento");
  render(<Pagina />);
}

describe("RhConfiguracaoVencimento: regras salariais (rota real)", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(true);
    estadoRegras = "indisponivel";
  });

  it("o separador abre a seccao e, com a base por atualizar, diz-o sem erro vermelho", async () => {
    await abrir();
    const aba = screen.getByRole("tab", { name: "Regras salariais" });
    fireEvent.mouseDown(aba, { button: 0 });
    expect(await screen.findByTestId("regras-salariais-indisponivel")).toHaveTextContent("Disponível depois da próxima atualização da base");
    expect(screen.queryByRole("alert")).toBeNull();
  }, 30000);

  it("a seccao do subsidio antigo diz que o valor passa a vir da regra da organizacao", async () => {
    await abrir();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Subsídio de alimentação" }), { button: 0 });
    expect(await screen.findByTestId("subsidio-nota-regra-organizacao")).toHaveTextContent("passa a vir da regra da organização");
  }, 30000);

  it("com a base atualizada e permissao para gerir mostra o formulario com o botao de gravar", async () => {
    estadoRegras = "ok";
    await abrir();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Regras salariais" }), { button: 0 });
    expect(await screen.findByRole("button", { name: "Gravar nova versão" })).toBeInTheDocument();
  }, 30000);
});
