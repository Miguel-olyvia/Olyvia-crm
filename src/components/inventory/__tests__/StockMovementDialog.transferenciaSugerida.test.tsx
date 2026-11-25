// Diálogo de movimento aberto a partir de uma transferência sugerida (defaultToWarehouseId / defaultQuantity /
// defaultNotes): origem, destino, produto, quantidade e notas já preenchidos, e o registo chama a transferência de
// sempre. Sem esses props, o diálogo fica exatamente como era (destino, quantidade e notas vazios).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit", "in", "range", "or", "gt", "ilike"]) chain[k] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "p1", name: "Torneira", sku: "TOR-1", barcode: null }], error: null }).then(ok);
    return chain;
  };
  return { supabase: { from, rpc } };
});
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, loading: false, permissions: [] }),
}));
vi.mock("@/hooks/useProductBaseUomCodes", () => ({ useProductBaseUomCodes: () => ({ getBaseCode: () => null }) }));

import StockMovementDialog from "../StockMovementDialog";

const WAREHOUSES = [
  { id: "w-lisboa", name: "Lisboa" },
  { id: "w-porto", name: "Porto" },
];

function montar(props: Partial<ComponentProps<typeof StockMovementDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSuccess = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <StockMovementDialog
        open
        onOpenChange={vi.fn()}
        organizationId="org-1"
        warehouses={WAREHOUSES}
        onSuccess={onSuccess}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSuccess };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  toast.mockReset();
});
afterEach(cleanup);

describe("StockMovementDialog — transferência sugerida", () => {
  it("abre já preenchido e regista a transferência com origem, destino, quantidade e notas", async () => {
    const { onSuccess } = montar({
      defaultMovementType: "transferencia",
      defaultProductId: "p1",
      defaultWarehouseId: "w-porto",
      defaultToWarehouseId: "w-lisboa",
      defaultQuantity: 2.5,
      defaultNotes: "Transferência sugerida para EC-2026-0025",
    });
    expect(screen.getByText(/Registar movimento · 2 de 2/)).toBeInTheDocument();
    expect(screen.getByLabelText("Quantidade")).toHaveValue(2.5);
    expect(screen.getByLabelText("Notas")).toHaveValue("Transferência sugerida para EC-2026-0025");
    // origem e destino nos seletores
    expect(screen.getByRole("combobox", { name: /Origem/ })).toHaveTextContent("Porto");
    expect(screen.getByRole("combobox", { name: /Destino/ })).toHaveTextContent("Lisboa");
    // a quantidade continua editável
    expect(screen.getByLabelText("Quantidade")).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Registar 1 linha(s)" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("rpc_register_stock_transfer", {
      p_product_id: "p1",
      p_from_warehouse_id: "w-porto",
      p_to_warehouse_id: "w-lisboa",
      p_qty: 2.5,
      p_notes: "Transferência sugerida para EC-2026-0025",
    });
  });

  it("sem os props novos fica como antes: destino, quantidade e notas vazios", async () => {
    const { onSuccess } = montar({ defaultMovementType: "transferencia", defaultProductId: "p1", defaultWarehouseId: "w-porto" });
    expect(screen.getByLabelText("Quantidade")).toHaveValue(null);
    expect(screen.getByLabelText("Notas")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /Origem/ })).toHaveTextContent("Porto");
    expect(screen.getByRole("combobox", { name: /Destino/ })).toHaveTextContent("Escolher…");
    fireEvent.click(screen.getByRole("button", { name: "Registar 1 linha(s)" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Escolhe o armazém de destino." }));
    expect(rpc).not.toHaveBeenCalledWith("rpc_register_stock_transfer", expect.anything());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("sem tipo indicado continua a começar pelos cartões de tipo", () => {
    montar();
    expect(screen.getByText("Registar movimento · 1 de 2")).toBeInTheDocument();
  });
});
