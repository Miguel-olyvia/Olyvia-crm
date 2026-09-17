/**
 * `Vencimento`: o ecra principal do dominio, com dois separadores --
 * "Visão geral" (FASE 1 do processamento salarial, `ProcessamentoVisaoGeralTab`
 * -- ciclo de vida do período, resumo por pessoa e lançamentos pontuais) e
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

let permissoes: Record<string, boolean> = {};
const hasPermission = vi.fn((perm: string) => !!permissoes[perm]);
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

vi.mock("@/hooks/usePessoas", () => ({
  usePessoas: () => ({ pessoas: [], loading: false }),
}));

vi.mock("@/hooks/useProcessamentoPeriodo", () => ({
  useProcessamentoPeriodo: () => ({
    periodo: null,
    loading: false,
    saving: false,
    recusado: false,
    abrir: vi.fn(async () => null),
    fechar: vi.fn(async () => null),
  }),
}));

vi.mock("@/hooks/useProcessamentoLancamentos", () => ({
  useProcessamentoLancamentos: () => ({
    lancamentos: [],
    loading: false,
    saving: false,
    recusado: false,
    criar: vi.fn(async () => null),
    anular: vi.fn(async () => null),
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
    hasPermission.mockClear();
    permissoes = {};
  });

  it("sem nenhuma das duas permissoes de leitura mostra o cartao de sem acesso", async () => {
    await renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
  });

  it("com permissao mostra os dois separadores de topo, Visao geral por omissao", async () => {
    permissoes = {
      "hr.vencimento.codigos.view": true,
      "hr.vencimento.subsidio.view": true,
      "hr.processamento.periodo.view": true,
      "hr.processamento.periodo.gerir": true,
      "hr.processamento.lancamentos.gerir": true,
    };

    await renderPagina();

    expect(screen.getByRole("tab", { name: "Visão geral" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Configuração" })).toBeTruthy();
    // Conteudo real do ProcessamentoVisaoGeralTab, nao o antigo placeholder.
    expect(
      screen.getByText("Ainda não existe periodo de processamento aberto para este mês."),
    ).toBeTruthy();
    expect(screen.getByText("Abrir período")).toBeTruthy();
    expect(screen.queryByText("Em construção")).toBeNull();
  });

  it("o separador Visao geral mostra o cartao de sem acesso quando falta a permissao de periodo, mesmo com as outras permissoes", async () => {
    permissoes = {
      "hr.vencimento.codigos.view": true,
      "hr.vencimento.subsidio.view": true,
      "hr.processamento.periodo.view": false,
    };

    await renderPagina();

    expect(screen.getByRole("tab", { name: "Visão geral" })).toBeTruthy();
    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
  });

  it("trocar para o separador Configuracao mostra os codigos de processamento", async () => {
    permissoes = {
      "hr.vencimento.codigos.view": true,
      "hr.vencimento.subsidio.view": true,
      "hr.processamento.periodo.view": true,
      "hr.processamento.periodo.gerir": true,
      "hr.processamento.lancamentos.gerir": true,
    };

    await renderPagina();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Configuração" }), { button: 0 });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Subsídio de alimentação" })).toBeTruthy(),
    );
  });
});
