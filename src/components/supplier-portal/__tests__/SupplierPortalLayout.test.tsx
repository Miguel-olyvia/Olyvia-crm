// A moldura do portal do fornecedor: monta o idioma (Provider + seletor no cabeçalho) e traduz menu, papéis,
// rodapé e ecrãs de erro. O português fica igual ao de sempre.
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const portal = vi.hoisted(() => ({ estado: {} as Record<string, unknown>, aConfirmar: 3 as number | null }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/hooks/useClientRole", () => ({ useClientSupplierSwitch: () => ({ available: true, switchTo: () => "/client-portal" }) }));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  SupplierPortalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSupplierPortal: () => portal.estado,
}));
vi.mock("@/components/supplier-portal/useSpOrdersToConfirm", () => ({
  useSpOrdersToConfirm: () => ({ count: portal.aConfirmar, isError: false }),
}));
vi.mock("@/components/supplier-portal/SupplierFirstLoginModal", () => ({ SupplierFirstLoginModal: () => null }));
vi.mock("@/components/supplier-portal/SupplierConfirmDataModal", () => ({ SupplierConfirmDataModal: () => null }));

import SupplierPortalShell from "../SupplierPortalLayout";

const ativo = {
  loading: false,
  loadError: false,
  active: true,
  account: { id: "a1", display_name: "Fornecedor Lda", nif_key: "1" },
  user: { id: "u1", email: "ana@forn.pt", name: "Ana Silva", role: "owner" },
  companies: [{ organization_id: "o1", name: "Empresa A" }, { organization_id: "o2", name: "Empresa B" }],
  firstLogin: false,
  profileConfirmed: true,
  markPasswordChanged: vi.fn(),
  refresh: vi.fn(),
};

function montar() {
  return render(
    <MemoryRouter initialEntries={["/supplier-portal"]}>
      <Routes>
        <Route element={<SupplierPortalShell />}>
          <Route path="/supplier-portal" element={<p>conteúdo da página</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  document.documentElement.lang = "";
  portal.estado = { ...ativo };
  portal.aConfirmar = 3;
});

describe("SupplierPortalLayout em português (igual ao de sempre)", () => {
  it("menu, cabeçalho, papel e rodapé", () => {
    montar();
    const menu = screen.getByRole("navigation", { name: "Portal do Fornecedor" });
    expect(within(menu).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Início",
      "Encomendas3",
      "Catálogo",
      "Os meus dados",
    ]);
    expect(screen.getByLabelText("3 por confirmar")).toBeInTheDocument();
    expect(screen.getByText("Clientes: Empresa A, Empresa B")).toBeInTheDocument();
    expect(screen.getByText("Utilizador principal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mudar para Portal do Cliente" })).toBeInTheDocument();
    expect(screen.getByText("conteúdo da página")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("pt");
  });

  it("utilizador de consulta", () => {
    portal.estado = { ...ativo, user: { ...ativo.user, role: "member" } };
    montar();
    expect(screen.getByText("Consulta")).toBeInTheDocument();
  });
});

describe("SupplierPortalLayout em inglês", () => {
  it("o seletor está no cabeçalho, em modo compacto, e muda tudo ao vivo", () => {
    montar();
    const cabecalho = screen.getByRole("banner");
    const seletor = within(cabecalho).getByRole("group", { name: /idioma/i });
    expect(within(seletor).getByText("EN")).toBeInTheDocument();

    fireEvent.click(within(seletor).getByRole("button", { name: "EN, English" }));

    const menu = screen.getByRole("navigation", { name: "Supplier Portal" });
    expect(within(menu).getAllByRole("link").map((l) => l.textContent)).toEqual(["Home", "Orders3", "Catalogue", "My details"]);
    expect(screen.getByLabelText("3 to confirm")).toBeInTheDocument();
    expect(screen.getByText("Customers: Empresa A, Empresa B")).toBeInTheDocument();
    expect(screen.getByText("Primary user")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to Client Portal" })).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByText(/Supplier Portal/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("utilizador de consulta e contagem acima de 99", () => {
    definirIdioma("en");
    portal.estado = { ...ativo, user: { ...ativo.user, role: "member" } };
    portal.aConfirmar = 120;
    montar();
    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.getByLabelText("120 to confirm")).toBeInTheDocument();
  });

  it("repõe <html lang> ao sair do portal", () => {
    document.documentElement.lang = "pt-PT";
    const { unmount } = montar();
    unmount();
    expect(document.documentElement.lang).toBe("pt-PT");
  });
});

describe("ecrãs sem moldura", () => {
  it("sem acesso ativo, em inglês e com seletor", () => {
    definirIdioma("en");
    portal.estado = { ...ativo, active: false };
    montar();
    expect(screen.getByRole("heading", { name: "No active access" })).toBeInTheDocument();
    expect(screen.getByText(/does not have any active access to the portal/)).toBeInTheDocument();
    expect(screen.getByText("Signed in as ana@forn.pt")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /idioma/i })).toBeInTheDocument();
  });

  it("sem acesso ativo, em português", () => {
    portal.estado = { ...ativo, active: false };
    montar();
    expect(screen.getByRole("heading", { name: "Sem acesso ativo" })).toBeInTheDocument();
    expect(screen.getByText("Sessão iniciada como ana@forn.pt")).toBeInTheDocument();
  });

  it("falha ao carregar: tentar de novo, nos dois idiomas", () => {
    portal.estado = { ...ativo, loadError: true };
    montar();
    expect(screen.getByRole("heading", { name: "Não foi possível carregar o portal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(screen.getByRole("heading", { name: "Could not load the portal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("a carregar: texto só para leitores de ecrã", () => {
    definirIdioma("en");
    portal.estado = { ...ativo, loading: true };
    montar();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
