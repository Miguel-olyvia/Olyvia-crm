// A moldura do portal de cliente: seletor PT | EN no cabeçalho, <html lang> a acompanhar o idioma, menu, papel,
// botões, rodapé e toasts traduzidos. O português fica como estava.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const getUser = vi.fn();
const updateEq = vi.fn();
let supplierAvailable = false;
let contexto: Record<string, unknown> = {};

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "update", "order"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: { id: "u1", email: "a@b.pt", user_metadata: { full_name: "Ana Silva" } } } } }),
      getUser: (...a: unknown[]) => getUser(...a),
      signOut: vi.fn(),
    },
    from: () => ({ ...chain({ data: [] }), update: () => ({ eq: (...a: unknown[]) => updateEq(...a) }) }),
  },
}));
vi.mock("@/hooks/useClientRole", () => ({
  useClientSupplierSwitch: () => ({ available: supplierAvailable, switchTo: () => "/supplier-portal" }),
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({
  PORTAL_ORGS_QUERY_KEY: "portal-orgs",
  usePortalCompany: () => contexto,
}));
vi.mock("@/components/portal/FirstLoginModal", () => ({
  FirstLoginModal: ({ open, onPasswordChanged }: { open: boolean; onPasswordChanged: () => void }) =>
    open ? <button onClick={onPasswordChanged}>modal-primeiro-login</button> : null,
}));
vi.mock("@/components/portal/PortalCompanySwitcher", () => ({ PortalCompanySwitcher: () => null }));

import { ClientPortalLayout } from "../ClientPortalLayout";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const ORG = {
  portalUserId: "pu1", organizationId: "o1", entityId: null, clientId: null, name: "Alfa Lda", logoUrl: null,
  createdAt: "2026-01-01", firstLogin: false, proposalId: null, contractId: null, quoteId: null, directSaleId: null,
};

function renderLayout(rota = "/client-portal/negocios") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <ClientPortalLayout>
          <p>conteudo da pagina</p>
        </ClientPortalLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  document.documentElement.lang = "";
  toast.mockReset();
  getUser.mockReset();
  updateEq.mockReset();
  supplierAvailable = false;
  contexto = { activeOrg: ORG, portalOrgs: [ORG], hasMultiple: false, isLoading: false };
});
afterEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
});

describe("ClientPortalLayout: idioma", () => {
  it("português por omissão: menu, papel, Sair e rodapé como hoje", async () => {
    renderLayout();
    const menu = screen.getByRole("navigation");
    for (const rotulo of ["Início", "Negócios", "Documentos"]) {
      expect(within(menu).getByRole("button", { name: new RegExp(rotulo) })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText("Cliente")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Sair/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Portal do Cliente/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("conteudo da pagina")).toBeInTheDocument();
  });

  it("A6: o botão Sair tem nome próprio (aria-label traduzido) mesmo sem o texto visível, e o ícone é decorativo", () => {
    renderLayout();
    const sair = screen.getByRole("button", { name: "Sair" });
    expect(sair).toHaveAttribute("aria-label", "Sair");
    expect(sair.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute("aria-label", "Sign out");
  });

  it("tem o seletor compacto PT | EN no cabeçalho", () => {
    renderLayout();
    const cabecalho = screen.getByRole("banner");
    const grupo = within(cabecalho).getByRole("group", { name: /idioma/i });
    expect(within(grupo).getByRole("button", { name: "PT, Português" })).toHaveAttribute("aria-pressed", "true");
    expect(within(grupo).getByText("PT")).toBeInTheDocument();
    expect(within(grupo).getByText("EN")).toBeInTheDocument();
  });

  it("ao escolher English tudo muda para inglês, o <html lang> acompanha e o conteúdo da página fica", async () => {
    renderLayout();
    expect(document.documentElement.lang).toBe("pt");
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    const menu = screen.getByRole("navigation");
    for (const rotulo of ["Home", "Projects", "Documents"]) {
      expect(within(menu).getByRole("button", { name: new RegExp(rotulo) })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText("Customer")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Customer Portal/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Portal do Cliente")).toBeNull();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByText("conteudo da pagina")).toBeInTheDocument();
  });

  it("a proposta e o contrato abrem-se por Negócios: o separador fica ativo nessas rotas, nos dois idiomas", () => {
    renderLayout("/client-portal/contracts/c1");
    const menu = screen.getByRole("navigation");
    expect(within(menu).getByRole("button", { name: /Negócios/ }).className).toMatch(/border-\[#7C3AED\]/);
    expect(within(menu).getByRole("button", { name: /Início/ }).className).not.toMatch(/border-\[#7C3AED\]/);
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(within(menu).getByRole("button", { name: /Projects/ }).className).toMatch(/border-\[#7C3AED\]/);
  });

  it("o botão para o Portal do Fornecedor traduz texto, aria-label e title", () => {
    supplierAvailable = true;
    renderLayout();
    expect(screen.getByRole("button", { name: "Mudar para Portal do Fornecedor" })).toHaveAttribute(
      "title",
      "Mudar para Portal do Fornecedor",
    );
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    const botao = screen.getByRole("button", { name: "Switch to Supplier Portal" });
    expect(botao).toHaveAttribute("title", "Switch to Supplier Portal");
  });

  it("ao desmontar, o <html lang> volta ao que estava", () => {
    document.documentElement.lang = "fr";
    const { unmount } = renderLayout();
    expect(document.documentElement.lang).toBe("pt");
    unmount();
    expect(document.documentElement.lang).toBe("fr");
  });
});

describe("ClientPortalLayout: toasts da mudança de palavra-passe", () => {
  const abrirModal = async () => {
    contexto = { ...contexto, portalOrgs: [{ ...ORG, firstLogin: true }] };
    renderLayout();
    await act(async () => { fireEvent.click(await screen.findByText("modal-primeiro-login")); });
  };

  it("sessão expirada: português e inglês", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await abrirModal();
    expect(toast).toHaveBeenCalledWith({ title: "Sessão expirada", description: "Volte a iniciar sessão.", variant: "destructive" });
    toast.mockReset();
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    await act(async () => { fireEvent.click(screen.getByText("modal-primeiro-login")); });
    expect(toast).toHaveBeenCalledWith({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
  });

  it("falha ao confirmar a alteração: português e inglês", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateEq.mockResolvedValue({ error: { message: "x" } });
    await abrirModal();
    expect(toast).toHaveBeenCalledWith({
      title: "Erro",
      description: "Não foi possível confirmar a alteração da palavra-passe. Tente novamente.",
      variant: "destructive",
    });
    toast.mockReset();
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    await act(async () => { fireEvent.click(screen.getByText("modal-primeiro-login")); });
    expect(toast).toHaveBeenCalledWith({
      title: "Error",
      description: "We could not confirm the password change. Please try again.",
      variant: "destructive",
    });
  });
});
