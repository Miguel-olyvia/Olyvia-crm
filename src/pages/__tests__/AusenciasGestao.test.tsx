import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// AusenciasGestao junta visualmente "Aprovacoes" e "Organizacao" num so ecra,
// com separadores por PERMISSAO -- e o ponto central deste teste: as
// permissoes por separador nao mudam com a fusao, so a apresentacao.
//
// Os conteudos de cada separador (AprovacoesConteudo/OrganizacaoConteudo) tem
// as proprias dependencias pesadas (hooks de dados, sheets, etc.) que ja
// existiam antes desta fusao e nao sao o alvo deste teste -- sao mockados
// para isolar so a logica de visibilidade/omissao dos separadores.

vi.mock("@/pages/AusenciasAprovacoes", () => ({
  AprovacoesConteudo: () => <div data-testid="conteudo-aprovacoes">Conteudo de aprovacoes</div>,
}));

vi.mock("@/pages/AusenciasOrganizacao", () => ({
  OrganizacaoConteudo: () => <div data-testid="conteudo-organizacao">Conteudo de organizacao</div>,
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const hasAnyPermission = vi.fn((perms: string[]) => false);
const hasPermission = vi.fn((perm: string) => false);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasAnyPermission, hasPermission, loading: false }),
}));

async function renderGestao(caminho = "/rh/ausencias/organizacao") {
  const { default: AusenciasGestao } = await import("../AusenciasGestao");
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/rh/ausencias/organizacao" element={<AusenciasGestao />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AusenciasGestao: separadores por permissao", () => {
  beforeEach(() => {
    hasAnyPermission.mockReset();
    hasPermission.mockReset();
  });

  it("so aprovar.chefia/aprovar.rh: mostra Aprovacoes e nao mostra Organizacao", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.includes("hr.ausencias.aprovar.chefia"),
    );
    hasPermission.mockImplementation(() => false);

    await renderGestao();

    expect(screen.getByTestId("conteudo-aprovacoes")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-organizacao")).toBeNull();
    expect(screen.getByText("Aprovações")).toBeTruthy();
    expect(screen.queryByText("Organização")).toBeNull();
  });

  it("so hr.ausencias.view: mostra Organizacao e nao mostra Aprovacoes", async () => {
    hasAnyPermission.mockImplementation(() => false);
    hasPermission.mockImplementation((perm: string) => perm === "hr.ausencias.view");

    await renderGestao();

    expect(screen.getByTestId("conteudo-organizacao")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-aprovacoes")).toBeNull();
    expect(screen.getByText("Organização")).toBeTruthy();
    expect(screen.queryByText("Aprovações")).toBeNull();
  });

  it("com as duas permissoes: mostra os dois separadores, por omissao em Aprovacoes", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.includes("hr.ausencias.aprovar.chefia"),
    );
    hasPermission.mockImplementation((perm: string) => perm === "hr.ausencias.view");

    await renderGestao();

    expect(screen.getByText("Aprovações")).toBeTruthy();
    expect(screen.getByText("Organização")).toBeTruthy();
    // Por omissao entra em Aprovacoes (accao mais urgente).
    expect(screen.getByTestId("conteudo-aprovacoes")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-organizacao")).toBeNull();
  });

  it("com as duas permissoes mas ?tab=organizacao na URL: entra em Organizacao", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.includes("hr.ausencias.aprovar.chefia"),
    );
    hasPermission.mockImplementation((perm: string) => perm === "hr.ausencias.view");

    await renderGestao("/rh/ausencias/organizacao?tab=organizacao");

    expect(screen.getByTestId("conteudo-organizacao")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-aprovacoes")).toBeNull();
  });

  it("sem nenhuma das duas permissoes: mostra o ecra de sem acesso", async () => {
    hasAnyPermission.mockImplementation(() => false);
    hasPermission.mockImplementation(() => false);

    await renderGestao();

    expect(screen.queryByTestId("conteudo-aprovacoes")).toBeNull();
    expect(screen.queryByTestId("conteudo-organizacao")).toBeNull();
  });

  it("so hr.ausencias.view, com ?tab=aprovacoes forcado na URL: nao mostra Aprovacoes, mostra Organizacao", async () => {
    hasAnyPermission.mockImplementation(() => false);
    hasPermission.mockImplementation((perm: string) => perm === "hr.ausencias.view");

    await renderGestao("/rh/ausencias/organizacao?tab=aprovacoes");

    expect(screen.queryByTestId("conteudo-aprovacoes")).toBeNull();
    expect(screen.getByTestId("conteudo-organizacao")).toBeTruthy();
    expect(screen.queryByText("Aprovações")).toBeNull();
    expect(screen.getByText("Organização")).toBeTruthy();
  });

  it("so aprovar.chefia/aprovar.rh (sem hr.ausencias.view), com ?tab=organizacao forcado na URL: nao mostra Organizacao, mostra Aprovacoes", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.includes("hr.ausencias.aprovar.chefia"),
    );
    hasPermission.mockImplementation(() => false);

    await renderGestao("/rh/ausencias/organizacao?tab=organizacao");

    expect(screen.queryByTestId("conteudo-organizacao")).toBeNull();
    expect(screen.getByTestId("conteudo-aprovacoes")).toBeTruthy();
    expect(screen.queryByText("Organização")).toBeNull();
    expect(screen.getByText("Aprovações")).toBeTruthy();
  });
});
