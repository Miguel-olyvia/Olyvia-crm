/**
 * `Vencimento`: o ecra principal do dominio, com dois separadores --
 * "Visão geral" (estado vazio honesto, o relatório ainda não existe) e
 * "Configuração" (o antigo `ConfiguracaoVencimento`, importado tal como
 * estava). `ConfiguracaoVencimento` continua a decidir por si os
 * separadores internos (Códigos/Subsídio) segundo as suas próprias
 * permissões -- este teste só confirma que os dois separadores de topo
 * aparecem e que cada um mostra o conteúdo certo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const hasPermission = vi.fn((_perm: string) => false);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission, loading: false }),
}));

vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({
    codigos: [],
    isLoading: false,
    isSaving: false,
    criar: vi.fn(),
    definirActivo: vi.fn(),
  }),
}));

vi.mock("@/hooks/useRegrasSubsidioAlimentacao", () => ({
  useRegrasSubsidioAlimentacao: () => ({
    regra: { valorDiario: 0, modo: "dinheiro", minutosMinimosDia: 1 },
    temRegraGravada: false,
    isLoading: false,
    isFetched: true,
    error: null,
    isSaving: false,
    gravar: vi.fn(),
  }),
}));

async function renderPagina() {
  const { default: Vencimento } = await import("../Vencimento");
  render(
    <MemoryRouter initialEntries={["/rh/processamento-salarial"]}>
      <Vencimento />
    </MemoryRouter>,
  );
}

describe("Vencimento", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(false);
  });

  it("sem nenhuma das duas permissoes de leitura mostra o cartao de sem acesso", async () => {
    await renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
  });

  it("com permissao mostra os dois separadores de topo, Visao geral por omissao", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    expect(screen.getByRole("tab", { name: "Visão geral" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Configuração" })).toBeTruthy();
    expect(screen.getByText("Em construção")).toBeTruthy();
  });

  it("o separador Visao geral mostra o estado vazio, sem inventar conteudo", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    expect(
      screen.getByText("Esta secção ainda não está construída. Chega numa ronda seguinte do módulo de RH."),
    ).toBeTruthy();
  });

  it("trocar para o separador Configuracao mostra os codigos de processamento", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Configuração" }), { button: 0 });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Subsídio de alimentação" })).toBeTruthy(),
    );
  });
});
