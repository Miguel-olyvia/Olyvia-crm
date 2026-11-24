// A barra do polegar (fatia 2): "Precisa de ti (N)" → Hoje até ao Comando; "Ler código" → Receção no leitor; o botão principal
// com a mesma lógica e o mesmo gate do cabeçalho (que no telemóvel se esconde: hidden sm:inline-flex).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "is", "order", "limit", "in", "range", "or"]) chain[k] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { supabase: { from: () => chain, rpc: vi.fn(async () => ({ data: [], error: null })) } };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1", name: "Grupo BMLar" }, isLoading: false }) }));
let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => perms.has(p)),
    loading: false,
  }),
}));
let todayPayload: InventoryTodayPayload | null = null;
vi.mock("@/hooks/useInventoryToday", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: todayPayload, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("@/components/receiving/useReceivablePos", async (orig) => ({
  ...(await orig<typeof import("@/components/receiving/useReceivablePos")>()),
  useReceivablePos: (_org: string, enabled: boolean) => ({ data: enabled ? [] : undefined, refetch: vi.fn() }),
}));
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" data-state="open" aria-label="Diálogo de movimento">diálogo</div> : null),
}));
vi.mock("@/pages/InventoryToday", () => ({ default: () => <p>Hoje clássico</p> }));
vi.mock("@/pages/PurchaseOrders", () => ({ default: () => <p>Encomendas clássico</p> }));
vi.mock("@/pages/Suppliers", () => ({ default: () => <p>Fornecedores clássico</p> }));
vi.mock("@/pages/Receiving", () => ({ default: () => <p>Receção clássico</p> }));
vi.mock("@/pages/Stocks", () => ({ default: () => <p>Existências clássico</p> }));
vi.mock("@/pages/StockMovements", () => ({ default: () => <p>Movimentos clássico</p> }));
vi.mock("@/pages/StockCounts", () => ({ default: () => <p>Contagens clássico</p> }));
vi.mock("@/pages/Warehouses", () => ({ default: () => <p>Armazéns clássico</p> }));
vi.mock("@/pages/ClientOrders", () => ({ default: () => <p>Saídas clássico</p> }));

import InventarioNovo from "./InventarioNovo";
import { precisaDeTi } from "./contasComando";

afterEach(cleanup);

const TODAS = ["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "warehouses.view", "inventory.edit"];
const payload = (): InventoryTodayPayload => ({
  purchases: { pending_approval: 3, late: 0, portal_unseen: 0, portal_confirmed: 0, open_delivery_notes: 2, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 0, awaiting_profile: 0, catalog_unlinked: 0 },
  client_orders: { open: 5, ready_to_ship: 0, without_preferred_supplier: 0, by_origin: null },
  stock: { below_reorder_point: 0, overstock: 0, reserved_units: 0, value: null },
  counts: { in_progress: 0, stalled: 0 },
  settings: null,
});

function Onde() {
  const l = useLocation();
  return <p data-testid="onde">{l.pathname + l.search}</p>;
}
function montar(em = "/inventory/novo/hoje") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[em]}>
        <Routes>
          <Route path="/inventory/novo/:aba?" element={<InventarioNovo />} />
          <Route path="*" element={<p>outra página</p>} />
        </Routes>
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const barra = () => within(screen.getByRole("navigation", { name: "Ações rápidas" }));

describe("a barra do polegar", () => {
  const rolar = vi.fn();
  beforeEach(() => {
    perms = new Set(TODAS);
    todayPayload = payload();
    rolar.mockClear();
    Element.prototype.scrollIntoView = rolar;
  });

  it("tem os três botões, só no telemóvel, por cima da zona segura; o principal do cabeçalho esconde-se no telemóvel", async () => {
    montar();
    await screen.findByText("Hoje clássico");
    const nav = screen.getByRole("navigation", { name: "Ações rápidas" });
    expect(nav).toHaveClass("sm:hidden", "fixed", "bottom-0");
    expect(nav.className).toContain("pb-[max(0.5rem,env(safe-area-inset-bottom))]");
    const n = precisaDeTi(todayPayload, null, (p) => perms.has(p)).length;
    expect(n).toBeGreaterThan(0);
    expect(barra().getByRole("button", { name: `Precisa de ti (${n})` })).toBeInTheDocument();
    expect(barra().getByRole("button", { name: "Ler código" })).toBeInTheDocument();
    expect(barra().getByRole("button", { name: /Aprovar encomendas/ })).toBeInTheDocument();
    expect(within(document.querySelector("header") as HTMLElement).getByRole("button", { name: /Aprovar encomendas/ })).toHaveClass("hidden", "sm:inline-flex");
  });

  it("o principal tem o mesmo gate do cabeçalho: sem purchase_orders.approve fica bloqueado com o motivo", async () => {
    montar();
    await screen.findByText("Hoje clássico");
    const b = barra().getByRole("button", { name: /Aprovar encomendas/ });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAccessibleDescription(/Sem permissão/);
    fireEvent.click(b);
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/hoje$/);
  });

  it("o principal com permissão faz o mesmo que o do cabeçalho", async () => {
    perms = new Set([...TODAS, "purchase_orders.approve"]);
    montar();
    await screen.findByText("Hoje clássico");
    fireEvent.click(barra().getByRole("button", { name: /Aprovar encomendas/ }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/encomendas?status=pending");
  });

  it("sem nada pendente, o principal é Registar movimento e abre o diálogo", async () => {
    todayPayload = { ...payload(), purchases: { ...payload().purchases!, pending_approval: 0 } };
    montar();
    await screen.findByText("Hoje clássico");
    fireEvent.click(barra().getByRole("button", { name: /Registar movimento/ }));
    expect(screen.getByRole("dialog", { name: "Diálogo de movimento" })).toBeInTheDocument();
  });

  it("«Ler código» abre a Receção no leitor (?vista=leitor)", async () => {
    montar();
    await screen.findByText("Hoje clássico");
    fireEvent.click(barra().getByRole("button", { name: "Ler código" }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/rececao?vista=leitor");
    expect(await screen.findByText("Receção clássico", undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  it("«Precisa de ti» noutro separador vai ao Hoje e rola até ao Comando", async () => {
    montar("/inventory/novo/existencias");
    await screen.findByText("Existências clássico", undefined, { timeout: 8000 });
    fireEvent.click(barra().getByRole("button", { name: /Precisa de ti/ }));
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/hoje$/);
    await waitFor(() => expect(rolar).toHaveBeenCalled());
    expect(rolar.mock.contexts.some((el) => (el as HTMLElement).id === "inv-comando")).toBe(true);
  });

  it("«Precisa de ti» já no Hoje só rola até ao Comando", async () => {
    montar();
    await screen.findByText("Hoje clássico");
    rolar.mockClear();
    fireEvent.click(barra().getByRole("button", { name: /Precisa de ti/ }));
    expect(rolar.mock.contexts.some((el) => (el as HTMLElement).id === "inv-comando")).toBe(true);
  });

  it("sem a Receção, «Ler código» fica bloqueado com o motivo", async () => {
    perms = new Set(TODAS.filter((p) => p !== "receiving.view"));
    montar();
    await screen.findByText("Hoje clássico");
    const b = barra().getByRole("button", { name: "Ler código" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAccessibleDescription(/Sem permissão/);
    fireEvent.click(b);
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/hoje$/);
  });
});
