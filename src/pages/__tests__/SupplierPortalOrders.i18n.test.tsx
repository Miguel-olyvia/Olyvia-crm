// Lista de encomendas do portal do fornecedor: português igual ao de sempre; inglês traduz o ecrã (não os dados).
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const mocks = vi.hoisted(() => ({ lista: vi.fn() }));

vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({
    account: { id: "a1" },
    companies: [
      { organization_id: "o1", name: "Empresa A" },
      { organization_id: "o2", name: "Empresa B" },
    ],
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/supplierPortal/spRpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supplierPortal/spRpc")>()),
  spListOrders: mocks.lista,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import SupplierPortalOrders from "../SupplierPortalOrders";

const item = {
  purchase_order_id: "p1",
  order_number: "PO-001",
  organization: { id: "o1", name: "Empresa A", logo_url: null },
  order_date: "2026-03-05",
  expected_delivery: "2026-03-20",
  order_status: "ordered",
  publication_status: "sent",
  revision: 1,
  sent_at: "2026-03-05T10:00:00Z",
  viewed_at: null,
  confirmed_at: null,
  promised_date: "2026-03-18",
  lines: 3,
  subtotal: 1000,
  vat_total: 230,
  total: 1234.5,
  currency: "EUR",
  can_confirm: true,
};
const resultado = (items: unknown[], total = items.length) => ({
  total,
  limit: 25,
  offset: 0,
  items,
  counts: { all: 40, to_confirm: 1, confirmed: 0, open: 1, received: 0, cancelled: 0 },
});

function montar(url = "/supplier-portal/orders") {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<SupplierPortalOrders />, { wrapper: Envolver });
}

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  mocks.lista.mockReset();
  mocks.lista.mockResolvedValue(resultado([item]));
});

describe("SupplierPortalOrders", () => {
  it("português: títulos, separadores, colunas, datas e moeda", async () => {
    montar();
    const tabela = await screen.findByRole("table");
    expect(screen.getByRole("heading", { level: 1, name: "Encomendas" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Estado das encomendas" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Por confirmar1",
      "Confirmadas0",
      "Em curso1",
      "Recebidas0",
      "Canceladas0",
      "Todas40",
    ]);
    expect(screen.getByPlaceholderText("Número da encomenda ou empresa")).toBeInTheDocument();
    expect(screen.getByLabelText("Pesquisar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeInTheDocument();

    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Encomenda",
      "Empresa",
      "Data",
      "Entrega pedida",
      "Entrega prevista",
      "Linhas",
      "Total",
      "Estado",
    ]);
    expect(within(tabela).getByText("05/03/2026")).toBeInTheDocument();
    expect(within(tabela).getByText("20/03/2026")).toBeInTheDocument();
    expect(within(tabela).getByText("Nova")).toBeInTheDocument();
    expect(within(tabela).getByText(/1234,50/)).toBeInTheDocument();
    expect(screen.getByText("3 linha(s)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Entrega prevista: 18/03/2026")).toBeInTheDocument();
    expect(screen.getByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página seguinte" })).toBeInTheDocument();
    expect(screen.getByLabelText("Empresa", { selector: "button" })).toBeInTheDocument();
  });

  it("inglês: tudo traduzido; moeda e datas no formato de sempre", async () => {
    definirIdioma("en");
    montar();
    const tabela = await screen.findByRole("table");
    expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Order status" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "To confirm1",
      "Confirmed0",
      "In progress1",
      "Received0",
      "Cancelled0",
      "All40",
    ]);
    expect(screen.getByPlaceholderText("Order number or company")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();

    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Order",
      "Company",
      "Date",
      "Requested delivery",
      "Promised delivery",
      "Lines",
      "Total",
      "Status",
    ]);
    expect(within(tabela).getByText("New")).toBeInTheDocument();
    expect(within(tabela).getByText(/1234,50/)).toBeInTheDocument();
    expect(screen.getByText("3 line(s)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Promised delivery: 18/03/2026")).toBeInTheDocument();
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
  });

  it("vazio: três mensagens e o atalho para ver todas, nos dois idiomas", async () => {
    mocks.lista.mockResolvedValue(resultado([]));
    const { unmount } = montar();
    expect(await screen.findByText("Não tem encomendas por confirmar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver todas as encomendas" })).toBeInTheDocument();
    unmount();

    definirIdioma("en");
    const outra = montar();
    expect(await screen.findByText("You have no orders to confirm.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all orders" })).toBeInTheDocument();
    outra.unmount();

    montar("/supplier-portal/orders?estado=all");
    expect(await screen.findByText("No orders.")).toBeInTheDocument();
  });

  it("vazio com pesquisa, em inglês", async () => {
    definirIdioma("en");
    mocks.lista.mockResolvedValue(resultado([]));
    montar("/supplier-portal/orders?q=zzz");
    expect(await screen.findByText("No orders match these filters.")).toBeInTheDocument();
  });

  it("erro: usa a mensagem por hint no idioma do portal e o botão de repetir", async () => {
    definirIdioma("en");
    const { SupplierPortalRpcError } = await import("@/lib/supplierPortal/spRpc");
    mocks.lista.mockRejectedValue(new SupplierPortalRpcError({ message: "x", code: "57014" }));
    montar();
    expect(await screen.findByText(/The operation took too long/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("a carregar", () => {
    definirIdioma("en");
    mocks.lista.mockReturnValue(new Promise(() => undefined));
    montar();
    expect(screen.getByText("Loading orders…")).toBeInTheDocument();
  });
});
