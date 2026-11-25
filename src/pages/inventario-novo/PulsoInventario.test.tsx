// O pulso do novo Inventário: o herói (o total da fila) e os números tocáveis — um campo a null não aparece e cada número
// só aparece com a permissão do cartão correspondente no Hoje.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
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

import { PulsoInventario, numerosDoPulso } from "./PulsoInventario";

afterEach(cleanup);

const TODAS = ["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view"];
const payload = (): InventoryTodayPayload => ({
  purchases: { pending_approval: 3, late: 1, portal_unseen: 0, portal_confirmed: 0, open_delivery_notes: 2, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 0, awaiting_profile: 0, catalog_unlinked: 0 },
  client_orders: { open: 5, ready_to_ship: 2, without_preferred_supplier: 1, by_origin: null },
  stock: { below_reorder_point: 4, overstock: 0, reserved_units: 0, value: null },
  counts: { in_progress: 0, stalled: 0 },
  settings: null,
});

function Onde() {
  const l = useLocation();
  return <p data-testid="onde">{l.pathname + l.search}</p>;
}
function montar() {
  return render(
    <MemoryRouter initialEntries={["/inventory/novo/hoje"]}>
      <Routes><Route path="*" element={<><PulsoInventario /><Onde /></>} /></Routes>
    </MemoryRouter>,
  );
}

describe("o pulso do inventário", () => {
  beforeEach(() => { perms = new Set(TODAS); todayPayload = payload(); });

  it("o herói é o total da fila de trabalho e os números levam ao separador filtrado", () => {
    montar();
    const pulso = screen.getByRole("region", { name: "O pulso do inventário" });
    expect(pulso).toBeInTheDocument();
    // 3 + 1 + 2 + 1 + 4 (os da RPC > 0 que a fila conta) = 11
    expect(screen.getByRole("button", { name: /Precisam de ti hoje: 11 coisas/ })).toBeInTheDocument();
    for (const n of ["Entregas atrasadas: 1", "POs por aprovar: 3", "Prontas a sair: 2", "Produtos a acabar: 4", "Guias abertas: 2", "Sem fornecedor: 1"]) {
      expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Entregas atrasadas: 1" }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/encomendas?status=late");
    fireEvent.click(screen.getByRole("button", { name: "Produtos a acabar: 4" }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/existencias?status=low");
    fireEvent.click(screen.getByRole("button", { name: "Guias abertas: 2" }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/rececao?notes=open");
  });

  it("um campo a null não aparece (nunca um 0 falso); o 0 aparece", () => {
    const p = payload();
    p.purchases = { ...p.purchases!, late: null, pending_approval: 0 };
    p.stock = null;
    todayPayload = p;
    montar();
    expect(screen.queryByRole("button", { name: /Entregas atrasadas/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Produtos a acabar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "POs por aprovar: 0" })).toBeInTheDocument();
  });

  it("cada número só com a permissão do cartão do Hoje", () => {
    perms = new Set(["inventory.view"]);
    montar();
    expect(screen.getByRole("button", { name: "Produtos a acabar: 4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Entregas atrasadas|POs por aprovar|Prontas a sair|Guias abertas|Sem fornecedor/ })).toBeNull();
    expect(numerosDoPulso(payload(), (x) => x === "receiving.view").map((n) => n.chave)).toEqual(["guias"]);
    expect(numerosDoPulso(payload(), (x) => x === "client_orders.view").map((n) => n.chave)).toEqual(["prontas", "sem-fornecedor"]);
  });

  it("sem dados (RPC por aplicar) ou sem permissões: não aparece", () => {
    todayPayload = null;
    const { unmount } = montar();
    expect(screen.queryByRole("region", { name: "O pulso do inventário" })).toBeNull();
    unmount();
    todayPayload = payload();
    perms = new Set();
    montar();
    expect(screen.queryByRole("region", { name: "O pulso do inventário" })).toBeNull();
  });
});
