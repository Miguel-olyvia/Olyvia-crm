import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// AssiduidadeEAusencias junta dois itens de menu que ate agora eram
// separados -- "Ausencias" (AusenciasGestao) e "Mapa de assiduidade"
// (AssiduidadeOrganizacao) -- num so ecra, com um separador de DOMINIO por
// cima dos separadores internos que cada um ja tinha (nao tocados aqui).
//
// Os dois componentes existentes tem as proprias dependencias pesadas
// (hooks de dados, sheets, o mapa em si) que nao sao o alvo deste teste --
// sao mockados para isolar so a logica de visibilidade/omissao do separador
// de dominio.

vi.mock("@/pages/AusenciasGestao", () => ({
  default: () => <div data-testid="conteudo-ausencias">Conteudo de ausencias</div>,
}));

vi.mock("@/pages/AssiduidadeOrganizacao", () => ({
  default: () => <div data-testid="conteudo-assiduidade">Conteudo de assiduidade</div>,
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

async function renderEcra(caminho = "/rh/assiduidade-e-ausencias") {
  const { default: AssiduidadeEAusencias } = await import("../AssiduidadeEAusencias");
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/rh/assiduidade-e-ausencias" element={<AssiduidadeEAusencias />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AssiduidadeEAusencias: separador de dominio por permissao", () => {
  beforeEach(() => {
    hasAnyPermission.mockReset();
    hasPermission.mockReset();
  });

  it("so hr.assiduidade.view: mostra so o separador Mapa de assiduidade", async () => {
    hasAnyPermission.mockImplementation(() => false);
    hasPermission.mockImplementation((perm: string) => perm === "hr.assiduidade.view");

    await renderEcra();

    expect(screen.getByTestId("conteudo-assiduidade")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-ausencias")).toBeNull();
    expect(screen.getByText("Mapa de assiduidade")).toBeTruthy();
    expect(screen.queryByText("Ausências")).toBeNull();
  });

  it("so permissoes de ausencias: mostra so o separador Ausencias", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) => perms.includes("hr.ausencias.view"));
    hasPermission.mockImplementation(() => false);

    await renderEcra();

    expect(screen.getByTestId("conteudo-ausencias")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-assiduidade")).toBeNull();
    expect(screen.getByText("Ausências")).toBeTruthy();
    expect(screen.queryByText("Mapa de assiduidade")).toBeNull();
  });

  it("com as duas: mostra os dois separadores, por omissao em Ausencias", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) => perms.includes("hr.ausencias.view"));
    hasPermission.mockImplementation((perm: string) => perm === "hr.assiduidade.view");

    await renderEcra();

    expect(screen.getByText("Ausências")).toBeTruthy();
    expect(screen.getByText("Mapa de assiduidade")).toBeTruthy();
    expect(screen.getByTestId("conteudo-ausencias")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-assiduidade")).toBeNull();
  });

  it("com as duas mas ?dominio=assiduidade na URL: entra em Mapa de assiduidade", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) => perms.includes("hr.ausencias.view"));
    hasPermission.mockImplementation((perm: string) => perm === "hr.assiduidade.view");

    await renderEcra("/rh/assiduidade-e-ausencias?dominio=assiduidade");

    expect(screen.getByTestId("conteudo-assiduidade")).toBeTruthy();
    expect(screen.queryByTestId("conteudo-ausencias")).toBeNull();
  });

  it("sem nenhuma das permissoes: mostra o ecra de sem acesso", async () => {
    hasAnyPermission.mockImplementation(() => false);
    hasPermission.mockImplementation(() => false);

    await renderEcra();

    expect(screen.queryByTestId("conteudo-ausencias")).toBeNull();
    expect(screen.queryByTestId("conteudo-assiduidade")).toBeNull();
  });

  it("so hr.assiduidade.view, com ?dominio=ausencias forcado na URL: nao mostra Ausencias, mostra Mapa de assiduidade", async () => {
    hasAnyPermission.mockImplementation(() => false);
    hasPermission.mockImplementation((perm: string) => perm === "hr.assiduidade.view");

    await renderEcra("/rh/assiduidade-e-ausencias?dominio=ausencias");

    expect(screen.queryByTestId("conteudo-ausencias")).toBeNull();
    expect(screen.getByTestId("conteudo-assiduidade")).toBeTruthy();
    expect(screen.queryByText("Ausências")).toBeNull();
    expect(screen.getByText("Mapa de assiduidade")).toBeTruthy();
  });

  it("so permissoes de ausencias (sem hr.assiduidade.view), com ?dominio=assiduidade forcado na URL: nao mostra Mapa de assiduidade, mostra Ausencias", async () => {
    hasAnyPermission.mockImplementation((perms: string[]) => perms.includes("hr.ausencias.view"));
    hasPermission.mockImplementation(() => false);

    await renderEcra("/rh/assiduidade-e-ausencias?dominio=assiduidade");

    expect(screen.queryByTestId("conteudo-assiduidade")).toBeNull();
    expect(screen.getByTestId("conteudo-ausencias")).toBeTruthy();
    expect(screen.queryByText("Mapa de assiduidade")).toBeNull();
    expect(screen.getByText("Ausências")).toBeTruthy();
  });
});
