// Catálogo do portal do fornecedor: só as palavras seguem o idioma do portal. Preços e números ficam como
// sempre nos dois idiomas (12,50 €, 1500).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const spCatalogList = vi.fn();
const spCatalogSetActive = vi.fn();
const downloadModelo = vi.fn();
const exportar = vi.fn();

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ account: { id: "acc-1", display_name: "Acme" }, canManageCatalog: true, refresh: vi.fn() }),
}));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spCatalogList: (...a: unknown[]) => spCatalogList(...a),
  spCatalogSetActive: (...a: unknown[]) => spCatalogSetActive(...a),
}));
vi.mock("@/utils/supplierPortalCatalogTemplate", async (original) => ({
  ...(await original<typeof import("@/utils/supplierPortalCatalogTemplate")>()),
  downloadSupplierCatalogTemplate: (...a: unknown[]) => downloadModelo(...a),
  exportSupplierPortalCatalogXlsx: (...a: unknown[]) => exportar(...a),
}));

import SupplierPortalCatalog from "../SupplierPortalCatalog";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const ITEM = {
  id: "i1",
  supplier_ref: "A-001",
  barcode: "5601234567890",
  name: "Parafuso inox",
  description: null,
  brand: "Acme",
  unit_label: "cx",
  units_per_pack: 12,
  base_price: 12.5,
  currency: "EUR",
  moq: 1500,
  lead_time_days: 5,
  is_active: true,
  updated_at: "2026-01-01T00:00:00Z",
};
const INATIVO = { ...ITEM, id: "i2", supplier_ref: "B-002", name: "Porca", is_active: false, lead_time_days: null, moq: null, base_price: null };

function lista(items: unknown[], total = items.length) {
  spCatalogList.mockResolvedValue({ total, limit: 50, offset: 0, can_edit: true, items });
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SupplierPortalCatalog />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  toast.mockReset();
  spCatalogList.mockReset();
  spCatalogSetActive.mockReset();
  downloadModelo.mockReset();
  exportar.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("Catálogo em português (como sempre)", () => {
  it("títulos, contagem, botões, preço e números à portuguesa", async () => {
    lista([ITEM, INATIVO]);
    montar();
    expect(await screen.findByRole("heading", { name: "Catálogo" })).toBeInTheDocument();
    expect(await screen.findByText("2 artigo(s) ativos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarregar modelo" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Pesquisar artigos" })).toHaveAttribute(
      "placeholder",
      "Pesquisar por referência, nome, código de barras ou marca",
    );
    expect(screen.getByText("Mostrar inativos")).toBeInTheDocument();
    expect(screen.getAllByText("12,50 €")[0]).toBeInTheDocument();
    expect(screen.getAllByText("1500")[0]).toBeInTheDocument();
    expect(screen.getByText("1–2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cód. barras" })).toBeInTheDocument();
    expect(screen.getAllByText("Ativo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inativo").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginação" })).toBeInTheDocument();
  });

  it("ativar/desativar: toast com o texto de sempre", async () => {
    lista([ITEM]);
    spCatalogSetActive.mockResolvedValue({ updated: 1 });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Desativar A-001" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Artigos desativados", description: "1 artigo(s) desativado(s)." });
  });

  it("vazio: mensagem de sempre", async () => {
    lista([]);
    montar();
    expect(await screen.findByText("Ainda não tem artigos no catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar Excel/CSV" })).toBeInTheDocument();
  });
});

describe("Catálogo em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("títulos, contagem e botões em inglês, sem português; preço e números no formato de sempre", async () => {
    lista([ITEM, INATIVO]);
    const { container } = montar();
    expect(await screen.findByRole("heading", { name: "Catalogue" })).toBeInTheDocument();
    expect(await screen.findByText("2 active items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download template" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New item" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search items" })).toHaveAttribute(
      "placeholder",
      "Search by reference, name, barcode or brand",
    );
    expect(screen.getByText("Show inactive")).toBeInTheDocument();
    expect(screen.getAllByText("12,50 €")[0]).toBeInTheDocument();
    expect(screen.getAllByText("1500")[0]).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Barcode" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lead time" })).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getAllByText("5 d")[0]).toBeInTheDocument();
    expect(screen.getAllByText("5 days")[0]).toBeInTheDocument();
    expect(screen.getAllByText(/12\/pack/)[0]).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/artigo|Catálogo|Descarregar|Pesquisar|Ativo|Inativo|Prazo|emb\./);
  });

  it("um único artigo: singular", async () => {
    lista([ITEM]);
    montar();
    expect(await screen.findByText("1 active item")).toBeInTheDocument();
  });

  it("em carga mostra «Loading…»", () => {
    spCatalogList.mockReturnValue(new Promise(() => {}));
    montar();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("ativar/desativar: toast em inglês, com singular e plural", async () => {
    lista([ITEM]);
    spCatalogSetActive.mockResolvedValue({ updated: 1 });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate A-001" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Items deactivated", description: "1 item deactivated." });
  });

  it("ativar vários: plural", async () => {
    lista([INATIVO, { ...INATIVO, id: "i3", supplier_ref: "C-3" }]);
    spCatalogSetActive.mockResolvedValue({ updated: 2 });
    montar();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select all items on this page" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    const lote = screen.getByRole("region", { name: "Bulk actions" });
    fireEvent.click(within(lote).getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Items activated", description: "2 items activated." });
  });

  it("vazio, sem resultados de pesquisa e catálogo vazio ao exportar", async () => {
    lista([]);
    montar();
    expect(await screen.findByText("You don't have any items in the catalogue yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import Excel/CSV" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Catalogue is empty", description: "You don't have any items to export yet." });
  });

  it("o modelo e a exportação recebem o idioma do portal", async () => {
    lista([ITEM]);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Download template" }));
    expect(downloadModelo).toHaveBeenCalledWith("en");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(exportar).toHaveBeenCalled());
    expect(exportar).toHaveBeenCalledWith([ITEM], "Acme", "en");
  });

  it("muda ao vivo quando o idioma muda", async () => {
    lista([ITEM]);
    montar();
    expect(await screen.findByRole("heading", { name: "Catalogue" })).toBeInTheDocument();
    act(() => definirIdioma("pt"));
    expect(screen.getByRole("heading", { name: "Catálogo" })).toBeInTheDocument();
    expect(screen.getAllByText("12,50 €")[0]).toBeInTheDocument();
  });

  it("erro de carregamento: botão «Try again»", async () => {
    spCatalogList.mockRejectedValue(new Error("falhou"));
    montar();
    // o pedido repete uma vez antes de falhar (retry da própria página)
    expect(await screen.findByRole("button", { name: "Try again" }, { timeout: 5000 })).toBeInTheDocument();
  });
});
