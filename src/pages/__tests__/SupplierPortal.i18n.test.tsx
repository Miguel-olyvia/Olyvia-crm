// Início do portal do fornecedor: o português fica igual ao de sempre e o inglês traduz tudo o que é do ecrã.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const mocks = vi.hoisted(() => ({
  portal: {} as Record<string, unknown>,
  aConfirmar: { count: 0 as number | null, isError: false },
  catalogo: vi.fn(),
}));

vi.mock("@/contexts/SupplierPortalContext", () => ({ useSupplierPortal: () => mocks.portal }));
vi.mock("@/components/supplier-portal/useSpOrdersToConfirm", () => ({ useSpOrdersToConfirm: () => mocks.aConfirmar }));
vi.mock("@/lib/supplierPortal/spRpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supplierPortal/spRpc")>()),
  spCatalogList: mocks.catalogo,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import SupplierPortal from "../SupplierPortal";

const base = {
  user: { name: "Ana Silva", email: "ana@forn.pt" },
  account: { display_name: "Fornecedor Lda" },
  companies: [{ organization_id: "o1", name: "Empresa A", logo_url: null, granted_at: "2026-05-08T12:00:00Z" }],
  companiesError: false,
  canManageCatalog: true,
  refresh: vi.fn(),
};

function montar() {
  return render(
    <MemoryRouter>
      <SupplierPortal />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  mocks.portal = { ...base };
  mocks.aConfirmar = { count: 1500, isError: false };
  mocks.catalogo.mockReset();
  mocks.catalogo.mockResolvedValue({ total: 1 });
});

describe("SupplierPortal (início)", () => {
  it("português: boas-vindas, plural e artigos", async () => {
    montar();
    expect(screen.getByRole("heading", { level: 1, name: "Olá, Ana" })).toBeInTheDocument();
    expect(screen.getByText(/Portal do Fornecedor de/)).toHaveTextContent(
      "Portal do Fornecedor de Fornecedor Lda. Aqui recebe e confirma as encomendas e mantém o seu catálogo atualizado para as empresas com quem trabalha.",
    );
    expect(screen.getByText("1500 encomendas por confirmar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver encomendas por confirmar" })).toHaveAttribute(
      "href",
      "/supplier-portal/orders?estado=to_confirm",
    );
    expect(await screen.findByText("1 artigo ativo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gerir catálogo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Empresas com acesso" })).toBeInTheDocument();
    expect(screen.getByText("Desde 08/05/2026")).toBeInTheDocument();
  });

  it("inglês: tudo traduzido; números e datas no formato de sempre", async () => {
    definirIdioma("en");
    montar();
    expect(screen.getByRole("heading", { level: 1, name: "Hello, Ana" })).toBeInTheDocument();
    expect(screen.getByText(/Supplier Portal for/)).toHaveTextContent(
      "Supplier Portal for Fornecedor Lda. Here you receive and confirm orders and keep your catalogue up to date for the companies you work with.",
    );
    expect(screen.getByText("1500 orders to confirm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View orders to confirm" })).toBeInTheDocument();
    expect(await screen.findByText("1 active item")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage catalogue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Companies with access" })).toBeInTheDocument();
    expect(screen.getByText("Since 08/05/2026")).toBeInTheDocument();
  });

  it("sem nome: Bem-vindo / Welcome; sem encomendas por confirmar", () => {
    mocks.portal = { ...base, user: { name: "", email: "a@b.pt" } };
    mocks.aConfirmar = { count: 0, isError: false };
    const { unmount } = montar();
    expect(screen.getByRole("heading", { level: 1, name: "Bem-vindo" })).toBeInTheDocument();
    expect(screen.getByText("Não tem encomendas por confirmar.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver encomendas" })).toBeInTheDocument();
    unmount();
    definirIdioma("en");
    montar();
    expect(screen.getByRole("heading", { level: 1, name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("You have no orders to confirm.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View orders" })).toBeInTheDocument();
  });

  it("estados de contagem e de erro em inglês", async () => {
    definirIdioma("en");
    mocks.aConfirmar = { count: null, isError: true };
    mocks.catalogo.mockRejectedValue(new Error("falhou"));
    mocks.portal = { ...base, canManageCatalog: false, companiesError: true, companies: [] };
    montar();
    expect(screen.getByText("Could not count the orders.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Could not count the items.")).toBeInTheDocument());
    expect(screen.getByText("You can view the catalogue. Only the primary user of the account can change it.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View catalogue" })).toBeInTheDocument();
    expect(screen.getByText("Could not load the list of companies. Reload the page.")).toBeInTheDocument();
  });

  it("a contar e sem empresas, nos dois idiomas", () => {
    mocks.aConfirmar = { count: null, isError: false };
    mocks.catalogo.mockReturnValue(new Promise(() => undefined));
    mocks.portal = { ...base, companies: [] };
    const { unmount } = montar();
    expect(screen.getByText("A contar encomendas…")).toBeInTheDocument();
    expect(screen.getByText("A contar artigos…")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma empresa com acesso ativo.")).toBeInTheDocument();
    unmount();
    definirIdioma("en");
    montar();
    expect(screen.getByText("Counting orders…")).toBeInTheDocument();
    expect(screen.getByText("Counting items…")).toBeInTheDocument();
    expect(screen.getByText("No companies with active access.")).toBeInTheDocument();
  });
});
