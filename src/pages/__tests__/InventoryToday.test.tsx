// O Hoje do Inventário contra o Hoje do 2.0 (HojeInv.tsx): o fluxo em cinco passos (3 = PO e 4 = Receção dentro do ramo
// "Não"), a bifurcação Sim/Não, o cartão "Encomendas por receber no armazém" à cabeça da fila (com as expedidas pelo
// fornecedor destacadas) e "Receber no armazém →" a abrir logo o painel quando só uma PO chega hoje/amanhã.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ReceivablePo } from "@/components/receiving/porReceber";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import { todayIsoLocal } from "@/components/purchase-orders/poListUtils";

// Leituras diretas da página (armazéns, últimos movimentos): vazias.
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "is", "order", "limit", "in", "range"]) chain[k] = () => chain;
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { supabase: { from: () => chain, rpc: vi.fn() } };
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
vi.mock("@/hooks/useMovementDocumentLinks", () => ({ useMovementDocumentLinks: () => ({ links: { poByNumber: {}, countByLineId: {} } }) }));
let todayPayload: InventoryTodayPayload | null = null;
vi.mock("@/hooks/useInventoryToday", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: todayPayload, isLoading: false, refetch: vi.fn() }),
}));
let receivable: ReceivablePo[] | undefined;
const receivableEnabled = vi.fn();
vi.mock("@/components/receiving/useReceivablePos", () => ({
  useReceivablePos: (_org: string, enabled: boolean) => {
    receivableEnabled(enabled);
    return { data: enabled ? receivable : undefined, refetch: vi.fn() };
  },
}));

import InventoryToday from "../InventoryToday";

const ALL = ["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "stocks.edit"];
const payload: InventoryTodayPayload = {
  purchases: { pending_approval: 3, late: 1, portal_unseen: 2, portal_confirmed: 1, open_delivery_notes: 4, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 1, awaiting_profile: 2, catalog_unlinked: 5 },
  client_orders: { open: 7, ready_to_ship: 2, without_preferred_supplier: 1, by_origin: { contract: 4, direct_sale: 2, manual: 1 } },
  stock: { below_reorder_point: 6, overstock: 1, reserved_units: 30, value: null },
  counts: { in_progress: 1, stalled: 0 },
  settings: { stock_deduction_trigger: "contract_signed" },
};
const today = todayIsoLocal();
const po = (id: string, over: Partial<ReceivablePo> = {}): ReceivablePo => ({
  id, orderNumber: id, status: "ordered", supplierId: "s", supplierName: "F", expectedDelivery: "2099-01-01", orderDate: null,
  contractId: null, origin: null, publication: null, emailSent: false, shipped: null,
  lines: [{ id: `${id}-l`, productId: "p", name: "P", sku: null, quantity: 2, received: 0, open: 2, uomId: null, uomCode: null, unitsPerUom: 1 }],
  ...over,
});
const shipped = { noteId: "n", noteNumber: "GR 1", shippedAt: "2026-10-01T10:00:00Z", hasFile: false, count: 1 };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
  );
  return render(<InventoryToday />, { wrapper: wrap });
}

describe("Hoje do Inventário (igual ao 2.0)", () => {
  beforeEach(() => {
    perms = new Set(ALL);
    todayPayload = payload;
    receivable = [po("PO-A", { expectedDelivery: today }), po("PO-B", { status: "partially_received", shipped }), po("PO-C", { status: "pending" })];
    receivableEnabled.mockReset();
  });

  it("fluxo em cinco passos: 1 e 2, Sim/Não, 3 = PO e 4 = Receção no ramo, 5 = Stock", () => {
    renderPage();
    const fluxo = screen.getByRole("region", { name: "Fluxo" });
    const nums = Array.from(fluxo.querySelectorAll('[aria-hidden="true"]')).map((e) => e.textContent).filter((t) => /^\d$/.test(t ?? ""));
    expect(nums).toEqual(["1", "2", "3", "4", "5"]);
    expect(within(fluxo).getByText("Sim")).toBeInTheDocument();
    expect(within(fluxo).getByText("Não")).toBeInTheDocument();
    expect(within(fluxo).getByText(/Falta → encomenda ao fornecedor preferencial/)).toBeInTheDocument();
    expect(within(fluxo).getByText(/Baixa de stock por venda:/)).toBeInTheDocument();
    // 29/10: o mesmo rótulo das definições
    expect(within(fluxo).getByText("Automático — quando a encomenda de cliente é emitida")).toBeInTheDocument();
    expect(within(fluxo).getByRole("button", { name: "3 por aprovar" })).toBeInTheDocument();
    expect(within(fluxo).getByRole("button", { name: "4 guias abertas" })).toBeInTheDocument();
    // sem products.view_cost a RPC manda value = null: "—", como o 2.0 sem permissão de preços
    expect(within(fluxo).getByText("Valor em stock (custo médio)").closest("button")!.querySelector("b")!.textContent).toBe("—");
    expect(within(fluxo).queryByText(/Transferências pendentes/)).toBeNull();
  });

  it("a fila começa por \"Encomendas por receber no armazém\" (encomendadas/parciais) com as expedidas destacadas", () => {
    renderPage();
    const fila = screen.getByRole("region", { name: "Fila de trabalho" });
    const cartoes = within(fila).getAllByRole("button");
    expect(cartoes[0]).toHaveTextContent("Encomendas por receber no armazém");
    expect(cartoes[0]).toHaveTextContent(/^2/); // PO-A + PO-B; a pendente fica de fora
    expect(within(cartoes[0]).getByText("1 expedida pelo fornecedor")).toBeInTheDocument();
    expect(cartoes.map((c) => c.textContent)).not.toEqual(expect.arrayContaining([expect.stringMatching(/Pedidos de transferência|POs automáticas/)]));
    expect(screen.queryByText("POs automáticas")).toBeNull();
    expect(cartoes).toHaveLength(11); // 1 + os 10 da RPC
  });

  it("\"Receber no armazém →\": uma só a chegar hoje/amanhã abre o painel dela; com várias abre a lista", () => {
    receivable = [po("PO-A", { expectedDelivery: today }), po("PO-Z")];
    const { unmount } = renderPage();
    expect(screen.getByRole("link", { name: /Receber no armazém →/ })).toHaveAttribute("href", "/receiving?po=PO-A");
    unmount();
    // PO-A chega hoje e PO-B está expedida: as duas contam como "a chegar"
    receivable = [po("PO-A", { expectedDelivery: today }), po("PO-B", { shipped })];
    renderPage();
    expect(screen.getByRole("link", { name: /Receber no armazém →/ })).toHaveAttribute("href", "/receiving");
  });

  it("sem purchase_orders.view não lê as POs: o cartão some e o botão abre a lista", () => {
    perms = new Set(ALL.filter((p) => p !== "purchase_orders.view"));
    renderPage();
    expect(receivableEnabled).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Encomendas por receber no armazém")).toBeNull();
    expect(screen.getByRole("link", { name: /Receber no armazém →/ })).toHaveAttribute("href", "/receiving");
  });
});
