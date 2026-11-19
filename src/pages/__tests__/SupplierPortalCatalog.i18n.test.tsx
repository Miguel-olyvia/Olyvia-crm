import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Página do catálogo do portal do fornecedor nos dois idiomas: título, contagens (com plural), filtros, tabela, cartões,
// ações em lote, paginação, avisos e a exportação/modelo. Em português fica como sempre; o formato dos números e do
// dinheiro é pt-PT nos dois idiomas; os dados do fornecedor (nomes, marcas, distritos) ficam como vêm.

const spCatalogList = vi.fn();
const spCatalogSetActive = vi.fn();
const toast = vi.fn();
const downloadModelo = vi.fn();
const exportar = vi.fn();
let contas: { account: { id: string; display_name: string } | null; canManageCatalog: boolean };

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ ...contas, refresh: vi.fn() }),
}));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spCatalogList: (...a: unknown[]) => spCatalogList(...a),
  spCatalogSetActive: (...a: unknown[]) => spCatalogSetActive(...a),
}));
vi.mock("@/lib/supplierPortal/servicoCatalogo", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/servicoCatalogo")>()),
  useDistritos: () => ({ distritos: [{ code: "PT-11", name: "Lisboa" }], erro: null }),
  carregarDistritos: async () => [{ code: "PT-11", name: "Lisboa" }],
}));
vi.mock("@/components/catalog-images/CatalogItemPhotos", () => ({
  CatalogThumb: () => null,
  CatalogPhotosViewer: () => null,
}));
vi.mock("@/utils/supplierPortalCatalogTemplate", async (original) => ({
  ...(await original<typeof import("@/utils/supplierPortalCatalogTemplate")>()),
  downloadSupplierCatalogTemplate: (...a: unknown[]) => downloadModelo(...a),
  exportSupplierPortalCatalogXlsx: (...a: unknown[]) => exportar(...a),
}));

import SupplierPortalCatalog from "../SupplierPortalCatalog";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const PRODUTO = {
  id: "p1", supplier_ref: "A-1", name: "Parafuso", barcode: "5601234567890", description: null, brand: "Acme", unit_label: "cx",
  units_per_pack: 12, base_price: 1234.5, currency: "EUR", moq: 10, lead_time_days: 1, is_active: true, updated_at: "x",
  item_kind: "produto", sku: null, image_paths: [], service_districts: null, mobilization_days: null,
};
const SERVICO = {
  ...PRODUTO, id: "s1", supplier_ref: "S-1", name: "Eletricista", brand: null, barcode: null, item_kind: "servico", unit_label: "vg",
  units_per_pack: null, moq: null, lead_time_days: null, service_districts: ["PT-11"], mobilization_days: 7, is_active: false,
};

function resposta(items: unknown[], over: Record<string, unknown> = {}) {
  return { items, total: items.length, can_edit: true, kind_counts: { produto: 1, servico: 1 }, ...over };
}

function montar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
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
  [spCatalogList, spCatalogSetActive, toast, downloadModelo, exportar].forEach((f) => f.mockReset());
  contas = { account: { id: "a1", display_name: "Ferragens Lda" }, canManageCatalog: true };
  spCatalogList.mockResolvedValue(resposta([PRODUTO, SERVICO]));
});

describe("catálogo em português (como sempre)", () => {
  it("título, contagem, filtros, tabela e cartões", async () => {
    montar();
    expect(screen.getByRole("heading", { name: "Catálogo" })).toBeInTheDocument();
    expect(await screen.findByText("2 artigo(s) ativos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarregar modelo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo artigo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Produtos (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Serviços (1)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar inativos")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cód. barras" })).toBeInTheDocument();
    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
    expect(screen.getByText("Zona: Lisboa")).toBeInTheDocument();
    expect(screen.getAllByText("empreitada (valor global)").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12\/emb\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 dias").length).toBeGreaterThan(0); // o português mantém «1 dias»
    expect(screen.getAllByText("7 dias").length).toBeGreaterThan(0);
    expect(screen.getByText("7 d mob.")).toBeInTheDocument();
    expect(screen.getByText("1–2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginação" })).toBeInTheDocument();
  });

  it("o preço fica em pt-PT", async () => {
    montar();
    await screen.findByText("2 artigo(s) ativos");
    expect(screen.getAllByText(/1234,50|1 234,50/).length).toBeGreaterThan(0);
  });
});

describe("catálogo em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("título, contagem, filtros, tabela e cartões, sem português da aplicação", async () => {
    const { container } = montar();
    expect(screen.getByRole("heading", { name: "Catalogue" })).toBeInTheDocument();
    expect(await screen.findByText("2 active items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download template" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New item" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Products (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Services (1)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search items")).toHaveAttribute("placeholder", "Search by reference, name, barcode or brand");
    expect(screen.getByLabelText("Show inactive")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Barcode" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lead time" })).toBeInTheDocument();
    expect(screen.getByText("No category")).toBeInTheDocument();
    expect(screen.getByText("Area: Lisboa")).toBeInTheDocument();
    expect(screen.getAllByText("lump sum (fixed price)").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12\/pack/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 day").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7 days").length).toBeGreaterThan(0);
    expect(screen.getByText("7 d mob.")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    // dados do fornecedor: ficam como vêm
    expect(screen.getAllByText("Parafuso").length).toBeGreaterThan(0);
    // o dinheiro continua em pt-PT
    expect(screen.getAllByText(/1234,50|1 234,50/).length).toBeGreaterThan(0);
    const texto = container.textContent ?? "";
    expect(texto).not.toMatch(/Catálogo|artigo|Descarregar|Exportar|Importar|inativos|Ações|Preço|Unidade|Serviço|Produto/);
  });

  it("plural da contagem e filtro por tipo", async () => {
    spCatalogList.mockResolvedValue(resposta([PRODUTO], { total: 1 }));
    montar();
    expect(await screen.findByText("1 active item")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show inactive"));
    expect(await screen.findByText("1 item")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Services (1)" }));
    expect(await screen.findByText("1 service")).toBeInTheDocument();
  });

  it("sem artigos: mensagens e botões vazios em inglês", async () => {
    spCatalogList.mockResolvedValue(resposta([], { total: 0 }));
    montar();
    expect(await screen.findByText("You don't have any items in the catalogue yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import Excel/CSV" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Services (1)" }));
    expect(await screen.findByText("You don't have any services in the catalogue yet.")).toBeInTheDocument();
  });

  it("modo de consulta (sem permissão de editar)", async () => {
    contas = { ...contas, canManageCatalog: false };
    montar();
    expect(
      await screen.findByText("You are in view-only mode. Only the account's main user can create, edit, import or deactivate items."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New item" })).toBeNull();
  });

  it("ações em lote e avisos", async () => {
    spCatalogSetActive.mockResolvedValue({ updated: 1 });
    montar();
    await screen.findByText("2 active items");
    fireEvent.click(screen.getAllByLabelText("Select A-1")[0]);
    const lote = await screen.findByRole("region", { name: "Bulk actions" });
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(within(lote).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Items deactivated", description: "1 item deactivated." });
  });

  it("o modelo e a exportação recebem o idioma", async () => {
    montar();
    await screen.findByText("2 active items");
    fireEvent.click(screen.getByRole("button", { name: "Download template" }));
    expect(downloadModelo).toHaveBeenCalledWith("en");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(exportar).toHaveBeenCalled());
    // (itens, nome da conta, nomes dos distritos, idioma)
    expect(exportar.mock.calls[0][1]).toBe("Ferragens Lda");
    expect(exportar.mock.calls[0][3]).toBe("en");
  });

  it("catálogo vazio ao exportar: aviso em inglês", async () => {
    spCatalogList.mockResolvedValue(resposta([], { total: 0 }));
    montar();
    await screen.findByText("You don't have any items in the catalogue yet.");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Catalogue is empty", description: "You don't have any items to export yet." });
  });
});

describe("muda ao vivo", () => {
  it("pt -> en -> pt com a lista aberta", async () => {
    montar();
    expect(await screen.findByText("2 artigo(s) ativos")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(screen.getByText("2 active items")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Catalogue" })).toBeInTheDocument();
    act(() => definirIdioma("pt"));
    expect(screen.getByText("2 artigo(s) ativos")).toBeInTheDocument();
  });
});
