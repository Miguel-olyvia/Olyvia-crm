/**
 * O formulario de codigos (/rh-exemplo/processamento-salarial > Configuracao > Codigos): `percentagem_hora_normal` ja nao pede
 * percentagem (o calculo paga ao valor da regra salarial da origem). A base ainda exige um valor NAO nulo nesse modo, por isso
 * ao criar vai o neutro (100) e ao editar mantem-se o que o codigo ja tinha; as nocturnas ja nao se oferecem como origem.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

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

const m = vi.hoisted(() => ({
  criar: vi.fn(),
  actualizar: vi.fn(),
  codigos: [] as unknown[],
}));

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true, loading: false }) }));
vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({
    codigos: m.codigos, isLoading: false, isSaving: false, error: null, criar: m.criar, actualizar: m.actualizar, definirActivo: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({
    versoes: [], emVigor: null, maisRecente: null, estado: "indisponivel", isLoading: false, isSaving: false, guardar: vi.fn(), recarregar: vi.fn(),
  }),
}));

async function abrir() {
  const { default: Pagina } = await import("./RhConfiguracaoVencimento");
  render(<Pagina />);
}

async function escolherModoRegra() {
  fireEvent.click(screen.getByRole("button", { name: /Novo código/ }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.change(within(dialogo).getByLabelText("Código"), { target: { value: "300" } });
  fireEvent.change(within(dialogo).getByLabelText("Nome"), { target: { value: "Horas extra" } });
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /modo/i }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /regra salarial da origem|salary rule value of the source/ }));
  return dialogo;
}

describe("RhConfiguracaoVencimento: codigos sem percentagem", () => {
  beforeEach(() => {
    m.criar.mockReset().mockResolvedValue(undefined);
    m.actualizar.mockReset().mockResolvedValue(undefined);
    m.codigos = [];
  });

  it("ao criar no modo «ao valor da regra» nao ha campo de percentagem e vai o valor neutro (100)", async () => {
    await abrir();
    const dialogo = await escolherModoRegra();
    expect(within(dialogo).queryByLabelText("Percentagem")).toBeNull();
    expect(within(dialogo).queryByRole("spinbutton")).toBeNull();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Novo código" }));
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith(expect.objectContaining({ codigo: "300", modo_calculo: "percentagem_hora_normal", percentagem: 100, valor_fixo: null }));
  }, 30000);

  it("a origem nocturna ja nao se oferece", async () => {
    await abrir();
    const dialogo = await escolherModoRegra();
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Aplicar automaticamente/i }), { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Horas extra" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Horas extra nocturnas" })).toBeNull();
  }, 30000);

  it("ao editar mantem a percentagem que o codigo ja tinha (nao a muda em silencio)", async () => {
    m.codigos = [{
      id: "c1", organization_id: "org-nike", codigo: "300", nome: "Horas extra", descricao: null, activo: true,
      modo_calculo: "percentagem_hora_normal", percentagem: 150, valor_fixo: null, origem_automatica: "horas_extra",
    }];
    await abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Editar código" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar alterações" }));
    await waitFor(() => expect(m.actualizar).toHaveBeenCalledTimes(1));
    expect(m.actualizar).toHaveBeenCalledWith("c1", expect.objectContaining({ modo_calculo: "percentagem_hora_normal", percentagem: 150 }));
  }, 30000);
});
