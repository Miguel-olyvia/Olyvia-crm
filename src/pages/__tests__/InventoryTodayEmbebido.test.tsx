// O Hoje do Inventário DENTRO do novo Inventário (InventarioEmbebido = true): a versão compacta do artefacto aprovado
// (vault/inventario-redesenho-completo.html) — sem cabeçalho próprio nem Fila de trabalho (é o «Precisa de ti» do
// Comando), o Fluxo de hoje em 5 cartões com os números do Hoje clássico e os últimos movimentos em cartões.
// Fora da moldura o ecrã fica igual (InventoryToday.test.tsx).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ReceivablePo } from "@/components/receiving/porReceber";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import { todayIsoLocal } from "@/components/purchase-orders/poListUtils";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";

const linhas = vi.hoisted(() => ({ porTabela: {} as Record<string, unknown[]> }));
vi.mock("@/integrations/supabase/client", () => {
  const from = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit", "in", "range"]) chain[k] = () => chain;
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas.porTabela[tabela] ?? [], error: null }).then(ok);
    return chain;
  };
  return { supabase: { from, rpc: vi.fn() } };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => perms.has(p)),
    loading: false,
    permissions: [...perms],
  }),
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => (k === "sidebar.inventoryToday" ? "Hoje" : k) }) }));
vi.mock("@/components/inventory/StockMovementDialog", () => ({ default: () => null }));
vi.mock("@/hooks/useMovementDocumentLinks", () => ({
  useMovementDocumentLinks: () => ({ links: { poByNumber: { "PO-1": "po-1" }, countByLineId: {} } }),
}));
let todayPayload: InventoryTodayPayload | null = null;
vi.mock("@/hooks/useInventoryToday", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: todayPayload, isLoading: false, refetch: vi.fn() }),
}));
let receivable: ReceivablePo[] | undefined;
vi.mock("@/components/receiving/useReceivablePos", () => ({
  useReceivablePos: (_org: string, enabled: boolean) => ({ data: enabled ? receivable : undefined, refetch: vi.fn() }),
}));

import InventoryToday from "../InventoryToday";

const ALL = ["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "inventory.edit"];
const payload = (): InventoryTodayPayload => ({
  purchases: { pending_approval: 3, late: 1, portal_unseen: 2, portal_confirmed: 1, open_delivery_notes: 4, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 1, awaiting_profile: 2, catalog_unlinked: 5 },
  client_orders: { open: 7, ready_to_ship: 2, without_preferred_supplier: 1, by_origin: { contract: 4, direct_sale: 2, manual: 1 } },
  stock: { below_reorder_point: 6, overstock: 1, reserved_units: 30, value: null },
  counts: { in_progress: 1, stalled: 0 },
  settings: { stock_deduction_trigger: "contract_signed" },
});
const today = todayIsoLocal();
const po = (id: string, over: Partial<ReceivablePo> = {}): ReceivablePo => ({
  id, orderNumber: id, status: "ordered", supplierId: "s", supplierName: "F", expectedDelivery: "2099-01-01", orderDate: null,
  contractId: null, origin: null, publication: null, emailSent: false, shipped: null,
  lines: [{ id: `${id}-l`, productId: "p", name: "P", sku: null, quantity: 2, received: 0, open: 2, uomId: null, uomCode: null, unitsPerUom: 1 }],
  ...over,
});
const movimentos = [
  { id: "m1", movement_type: "entrada", quantity: 4, created_at: "2026-11-24T10:00:00Z", warehouse_id: "w1", document_number: "PO-1",
    document_type: "compra", reference_id: null, sale_source_type: null, sale_source_id: null,
    products: { name: "Tijoleira", sku: null }, warehouses: { name: "Leiria" } },
  { id: "m2", movement_type: "venda", quantity: 1, created_at: "2026-11-24T09:00:00Z", warehouse_id: "w2", document_number: "",
    document_type: "venda", reference_id: null, sale_source_type: null, sale_source_id: null,
    products: { name: "Torneira", sku: null }, warehouses: null },
];

function renderEmbebido() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <InventarioEmbebido.Provider value={true}>{children}</InventarioEmbebido.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<InventoryToday />, { wrapper: wrap });
}

describe("Hoje do Inventário dentro do novo Inventário (artefacto)", () => {
  beforeEach(() => {
    perms = new Set(ALL);
    todayPayload = payload();
    receivable = [po("PO-A", { expectedDelivery: today }), po("PO-B"), po("PO-C", { status: "pending" })];
    linhas.porTabela = { stock_movements: movimentos, warehouses: [{ id: "w2", name: "Pombal" }] };
  });

  it("sem o cabeçalho próprio nem a Fila de trabalho", async () => {
    renderEmbebido();
    await screen.findByText(/Tijoleira/);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("inventory.today.description")).toBeNull();
    expect(screen.queryByText("Fila de trabalho")).toBeNull();
    expect(screen.queryByText("Encomendas por receber no armazém")).toBeNull();
    // o Fluxo clássico em blocos grandes também não
    expect(screen.queryByRole("region", { name: "Fluxo" })).toBeNull();
  });

  it("o Fluxo de hoje em 5 cartões, com os números (e as ligações) do Hoje clássico", async () => {
    renderEmbebido();
    const fluxo = screen.getByRole("region", { name: "Fluxo de hoje" });
    const cartoes = within(fluxo).getAllByRole("article");
    expect(cartoes.map((c) => c.getAttribute("aria-label"))).toEqual([
      "1 · Vendas assinadas",
      "2 · Encomendas Clientes",
      "Há stock → serve do stock",
      "Falta → encomenda ao fornecedor preferencial",
      "5 · Stock",
    ]);
    const [vendas, ec, sim, falta, stock] = cartoes.map((c) => within(c));
    for (const n of ["Contratos: 4", "Vendas diretas: 2", "Encomendas manuais: 1"]) expect(vendas.getByRole("button", { name: n })).toBeInTheDocument();
    expect(vendas.getByText(/Baixa de stock por venda:/)).toBeInTheDocument();
    expect(vendas.getByText("Automático — quando a encomenda de cliente é emitida")).toBeInTheDocument();
    for (const n of ["Em aberto: 7", "Prontas a expedir: 2", "Sem fornecedor: 1"]) expect(ec.getByRole("button", { name: n })).toBeInTheDocument();
    expect(ec.getByText(/há stock livre/)).toBeInTheDocument();
    expect(ec.getByRole("link", { name: "2 · Encomendas Clientes" })).toHaveAttribute("href", "/client-orders");
    expect(sim.getByText("Sim")).toBeInTheDocument();
    expect(sim.getByRole("button", { name: "Reserva FIFO (un): 30 un" })).toBeInTheDocument();
    expect(sim.getByRole("button", { name: "Saída (EC): 2 EC" })).toBeInTheDocument();
    expect(sim.getByText(/Encomenda servida/)).toBeInTheDocument();
    expect(falta.getByText("Não")).toBeInTheDocument();
    for (const n of ["PO por aprovar: 3", "Publicada no portal, por ver: 2", "Fornecedor confirma: 1", "Receção, guias abertas: 4"]) {
      expect(falta.getByRole("button", { name: n })).toBeInTheDocument();
    }
    expect(falta.getByRole("button", { name: "1 atrasada" })).toBeInTheDocument();
    expect(falta.getByRole("link", { name: /Receber/ })).toHaveAttribute("href", "/receiving");
    expect(falta.getByRole("link", { name: "Falta → encomenda ao fornecedor preferencial" })).toHaveAttribute("href", "/purchase-orders");
    for (const n of ["Abaixo do ponto de encomenda: 6", "Contagens em curso: 1", "Valor em stock (custo médio): —"]) {
      expect(stock.getByRole("button", { name: n })).toBeInTheDocument();
    }
    expect(stock.getByText(/A receção fecha o ciclo/)).toBeInTheDocument();
    expect(stock.getByRole("link", { name: "5 · Stock" })).toHaveAttribute("href", "/stocks");
  });

  it("os últimos movimentos em cartões, com a ligação ao documento e ao livro completo", async () => {
    renderEmbebido();
    const lista = await screen.findByRole("list", { name: "Últimos movimentos" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent("Leiria");
    expect(itens[0]).toHaveTextContent("+4");
    expect(itens[0]).toHaveTextContent("Entraram 4 de Tijoleira");
    expect(within(itens[0]).getByRole("link", { name: "PO-1" })).toHaveAttribute("href", "/purchase-orders?open=po-1");
    expect(itens[1]).toHaveTextContent("−1");
    expect(itens[1]).toHaveTextContent("Saiu por venda 1 de Torneira");
    expect(screen.getByRole("link", { name: "Ver livro completo" })).toHaveAttribute("href", "/stock-movements");
    expect(screen.getByRole("link", { name: /Receber no armazém →/ })).toHaveAttribute("href", "/receiving?po=PO-A");
  });

  it("«Registar movimento» só quando não é o botão principal da moldura", async () => {
    // principal = Dar saída (há prontas): o Hoje embebido oferece o movimento
    const { unmount } = renderEmbebido();
    await screen.findByText(/Tijoleira/);
    expect(screen.getByRole("button", { name: /Registar movimento/ })).toBeInTheDocument();
    unmount();
    // nada pendente: o principal da moldura já é «Registar movimento», aqui não se repete
    const p = payload();
    todayPayload = { ...p, purchases: { ...p.purchases!, pending_approval: 0 }, client_orders: { ...p.client_orders!, ready_to_ship: 0 } };
    renderEmbebido();
    await screen.findByText(/Tijoleira/);
    expect(screen.queryByRole("button", { name: /Registar movimento/ })).toBeNull();
  });
});

describe("Hoje (novo Inventário): Transferências sugeridas das EC", () => {
  const sugestao = {
    contract_id: "c1", order_number: "EC-2026-0025", client_name: "Ana Silva",
    product_id: "p1", product_name: "Torneira", product_sku: "TOR-1",
    from_warehouse_id: "w1", from_warehouse_name: "Porto", to_warehouse_id: "w2", to_warehouse_name: "Lisboa",
    qty: 3, distance_km: 8,
  };
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    perms = new Set(ALL);
    todayPayload = payload();
    receivable = [];
    linhas.porTabela = { stock_movements: movimentos, warehouses: [{ id: "w2", name: "Pombal" }] };
    rpc = (await import("@/integrations/supabase/client")).supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockReset();
  });

  it("com sugestões mostra a secção, agrupada por EC, com «Transferir»", async () => {
    rpc.mockImplementation((nome: string) =>
      Promise.resolve(nome === "rpc_ec_transfer_suggestions" ? { data: [sugestao], error: null, status: 200 } : { data: null, error: null }),
    );
    renderEmbebido();
    const sec = await screen.findByRole("region", { name: "Transferências sugeridas" });
    expect(within(sec).getByRole("listitem", { name: "EC-2026-0025 · Ana Silva" })).toBeInTheDocument();
    expect(within(sec).getByRole("button", { name: "Transferir 3 de Torneira de Porto para Lisboa" })).toBeInTheDocument();
  });

  it("sem sugestões a secção não aparece", async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 });
    renderEmbebido();
    await screen.findByText(/Tijoleira/);
    expect(rpc).toHaveBeenCalledWith("rpc_ec_transfer_suggestions", { p_organization_id: "org-1" });
    expect(screen.queryByRole("region", { name: "Transferências sugeridas" })).toBeNull();
  });
});
