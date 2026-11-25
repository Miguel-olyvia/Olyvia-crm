// O Comando de hoje: o «Precisa de ti» é a fila de trabalho do Hoje clássico — passado o MAX há «Ver mais (N)», que
// expande, e os cartões a 0 («Nada pendente») ficam na linha «Em dia».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import type { ReceivablePo } from "@/components/receiving/porReceber";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/emylia/movimento", async (orig) => ({
  ...(await orig<typeof import("@/emylia/movimento")>()),
  useReduzir: () => true,
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => perms.has(p), loading: false }),
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

import { ComandoInventario, MAX } from "./ComandoInventario";

afterEach(cleanup);

const ALL = ["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view"];
const payload = (): InventoryTodayPayload => ({
  purchases: { pending_approval: 3, late: 1, portal_unseen: 2, portal_confirmed: 1, open_delivery_notes: 4, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 1, awaiting_profile: 2, catalog_unlinked: 5 },
  client_orders: { open: 7, ready_to_ship: 2, without_preferred_supplier: 1, by_origin: null },
  stock: { below_reorder_point: 6, overstock: 1, reserved_units: 30, value: null },
  counts: { in_progress: 1, stalled: 0 },
  settings: null,
});
const shipped = { noteId: "n", noteNumber: "GR 1", shippedAt: "2026-10-01T10:00:00Z", hasFile: false, count: 1 };
const po = (id: string, over: Partial<ReceivablePo> = {}): ReceivablePo => ({
  id, orderNumber: id, status: "ordered", supplierId: "s", supplierName: "F", expectedDelivery: "2099-01-01", orderDate: null,
  contractId: null, origin: null, publication: null, emailSent: false, shipped: null,
  lines: [{ id: `${id}-l`, productId: "p", name: "P", sku: null, quantity: 2, received: 0, open: 2, uomId: null, uomCode: null, unitsPerUom: 1 }],
  ...over,
});

function Onde() {
  const l = useLocation();
  return <p data-testid="onde">{l.pathname + l.search}</p>;
}
function montar() {
  return render(
    <MemoryRouter initialEntries={["/inventory/novo/hoje"]}>
      <Routes><Route path="*" element={<><ComandoInventario /><Onde /></>} /></Routes>
    </MemoryRouter>,
  );
}
const colunaPrecisa = () => {
  const h = screen.getByRole("heading", { name: /Precisa de ti/ });
  return within(h.parentElement as HTMLElement);
};

describe("Comando de hoje", () => {
  beforeEach(() => {
    perms = new Set(ALL);
    todayPayload = payload();
    receivable = [po("PO-B", { shipped })];
  });

  it("com mais de MAX itens no «Precisa de ti» aparece «Ver mais (N)», que expande e volta a recolher", () => {
    montar();
    const col = colunaPrecisa();
    const todos = Number(screen.getByRole("heading", { name: /Precisa de ti/ }).textContent?.replace(/\D/g, ""));
    expect(todos).toBeGreaterThan(MAX);
    expect(col.getAllByRole("button", { name: /^Abrir:/ })).toHaveLength(MAX);
    const mais = col.getByRole("button", { name: `Ver mais (${todos - MAX})` });
    expect(mais).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(mais);
    expect(col.getAllByRole("button", { name: /^Abrir:/ })).toHaveLength(todos);
    expect(col.getByRole("button", { name: "Ver menos" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(col.getByRole("button", { name: "Ver menos" }));
    expect(col.getAllByRole("button", { name: /^Abrir:/ })).toHaveLength(MAX);
  });

  it("o cartão da Receção mantém o realce das expedidas pelo fornecedor; o 1.º item tem o botão principal", () => {
    // só o cartão da Receção (info) + as ECs prontas (ok): ficam todos à vista
    todayPayload = null;
    montar();
    const col = colunaPrecisa();
    expect(col.queryByRole("button", { name: /Ver mais/ })).toBeNull();
    expect(col.getByText("1 expedida pelo fornecedor")).toBeInTheDocument();
    expect(col.getByRole("button", { name: /^Abrir: Encomendas por receber no armazém/ }).className).toContain("shadow-[0_6px_18px");
  });

  it("os cartões a 0 (\"Nada pendente\" no Hoje clássico) ficam em «Em dia» e abrem a lista", () => {
    montar();
    const col = colunaPrecisa();
    expect(col.getByText(/Em dia \(nada pendente\)/)).toBeInTheDocument();
    const b = col.getByRole("button", { name: "Contagem parada" });
    fireEvent.click(b);
    expect(screen.getByTestId("onde").textContent).toMatch(/^\/inventory\/novo\/contagens/);
  });

  it("sem nada pendente: a nota calma", () => {
    todayPayload = null;
    receivable = [];
    montar();
    expect(colunaPrecisa().getByText(/Nada à espera de ti/)).toBeInTheDocument();
  });
});
