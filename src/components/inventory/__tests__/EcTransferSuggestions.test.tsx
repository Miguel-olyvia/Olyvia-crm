// Transferências sugeridas das EC (rpc_ec_transfer_suggestions): agrupadas por EC no Hoje, filtradas por EC na
// folha da EC, escondidas sem sugestões / sem permissão de ver, «Transferir» só com inventory.edit e a abrir o
// diálogo de movimento já preenchido; depois de transferir a lista volta a ser pedida.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: capture }));
let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => perms.has(p)),
    loading: false,
    permissions: [...perms],
  }),
}));
const dialogoProps = vi.fn();
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: (props: { open: boolean; onSuccess: () => void; onOpenChange: (o: boolean) => void }) => {
    dialogoProps(props);
    return props.open ? (
      <div role="dialog" aria-label="Diálogo de movimento">
        <button type="button" onClick={() => { props.onOpenChange(false); props.onSuccess(); }}>Registar (simulado)</button>
      </div>
    ) : null;
  },
}));

import { EcTransferSuggestions } from "../EcTransferSuggestions";
import { groupEcTransferSuggestions, type EcTransferSuggestion } from "@/hooks/useEcTransferSuggestions";

const row = (over: Partial<EcTransferSuggestion> = {}): EcTransferSuggestion => ({
  contract_id: "c1",
  order_number: "EC-2026-0025",
  client_name: "Ana Silva",
  product_id: "p1",
  product_name: "Torneira",
  product_sku: "TOR-1",
  from_warehouse_id: "w-porto",
  from_warehouse_name: "Porto",
  to_warehouse_id: "w-lisboa",
  to_warehouse_name: "Lisboa",
  qty: 2.5,
  distance_km: 12,
  ...over,
});
const ROWS = [
  row(),
  row({ product_id: "p2", product_name: "Tijoleira", product_sku: null, qty: 10, distance_km: null }),
  row({ contract_id: "c2", order_number: "EC-2026-0030", client_name: null, product_id: "p3", product_name: "Lavatório", qty: 1 }),
];

let qc: QueryClient;
function montar(ui: ReactNode) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  perms = new Set(["inventory.view", "inventory.edit", "client_orders.view"]);
  rpc.mockReset();
  rpc.mockResolvedValue({ data: ROWS, error: null, status: 200 });
  capture.mockReset();
  dialogoProps.mockReset();
});
afterEach(cleanup);

describe("groupEcTransferSuggestions", () => {
  it("agrupa por EC mantendo a ordem da RPC", () => {
    const g = groupEcTransferSuggestions(ROWS);
    expect(g.map((x) => [x.order_number, x.rows.length])).toEqual([["EC-2026-0025", 2], ["EC-2026-0030", 1]]);
  });
});

describe("EcTransferSuggestions no Hoje", () => {
  it("um cartão por EC, com produto · SKU, quantidade e origem → destino", async () => {
    montar(<EcTransferSuggestions organizationId="org-1" />);
    const regiao = await screen.findByRole("region", { name: "Transferências sugeridas" });
    expect(rpc).toHaveBeenCalledWith("rpc_ec_transfer_suggestions", { p_organization_id: "org-1" });
    const lista = within(regiao).getByRole("list", { name: "Transferências sugeridas" });
    const cartoes = within(lista).getAllByRole("listitem").filter((li) => li.parentElement === lista);
    expect(cartoes.map((c) => c.getAttribute("aria-label"))).toEqual(["EC-2026-0025 · Ana Silva", "EC-2026-0030"]);
    const primeiro = within(cartoes[0]);
    expect(primeiro.getByRole("link", { name: "EC-2026-0025" })).toHaveAttribute("href", "/client-orders?open=c1");
    expect(primeiro.getByText("Torneira")).toBeInTheDocument();
    expect(primeiro.getByText("· TOR-1")).toBeInTheDocument();
    expect(primeiro.getByText("2,5")).toBeInTheDocument();
    expect(primeiro.getAllByText("Porto")).toHaveLength(2);
    expect(primeiro.getAllByText("Lisboa")).toHaveLength(2);
    expect(primeiro.getByText("(12 km da obra)")).toBeInTheDocument();
    expect(primeiro.getAllByRole("button", { name: /^Transferir/ })).toHaveLength(2);
    expect(within(cartoes[1]).getAllByRole("button", { name: /^Transferir/ })).toHaveLength(1);
  });

  it("sem sugestões a secção não aparece", async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 });
    const { container } = montar(<EcTransferSuggestions organizationId="org-1" />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("sem inventory.view não pede nada e não aparece", async () => {
    perms = new Set(["inventory.edit"]);
    const { container } = montar(<EcTransferSuggestions organizationId="org-1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("42501 (sem permissão no servidor) = sem dados, em silêncio", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Sem permissão" }, status: 403 });
    const { container } = montar(<EcTransferSuggestions organizationId="org-1" />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
    expect(capture).not.toHaveBeenCalled();
  });

  it("outra falha é reportada e a secção fica escondida", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" }, status: 500 });
    const { container } = montar(<EcTransferSuggestions organizationId="org-1" />);
    await waitFor(() => expect(capture).toHaveBeenCalledWith(expect.anything(), "ec-transfer-suggestions-load"));
    expect(container).toBeEmptyDOMElement();
  });

  it("sem inventory.edit mostra as sugestões mas sem «Transferir»", async () => {
    perms = new Set(["inventory.view"]);
    montar(<EcTransferSuggestions organizationId="org-1" />);
    await screen.findByText("Torneira");
    expect(screen.queryByRole("button", { name: /Transferir/ })).toBeNull();
    // sem client_orders.view o nº da EC fica em texto
    expect(screen.queryByRole("link", { name: "EC-2026-0025" })).toBeNull();
    expect(screen.getByText("EC-2026-0025")).toBeInTheDocument();
  });

  it("«Transferir» abre o diálogo de transferência já preenchido; depois de registar a lista volta a ser pedida", async () => {
    const depois = vi.fn();
    montar(<EcTransferSuggestions organizationId="org-1" warehouses={[{ id: "w-faro", name: "Faro" }]} onTransferred={depois} />);
    fireEvent.click(await screen.findByRole("button", { name: "Transferir 2,5 de Torneira de Porto para Lisboa" }));
    expect(screen.getByRole("dialog", { name: "Diálogo de movimento" })).toBeInTheDocument();
    expect(dialogoProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        organizationId: "org-1",
        defaultMovementType: "transferencia",
        defaultProductId: "p1",
        defaultWarehouseId: "w-porto",
        defaultToWarehouseId: "w-lisboa",
        defaultQuantity: 2.5,
        defaultNotes: "Transferência sugerida para EC-2026-0025",
        warehouses: [
          { id: "w-faro", name: "Faro" },
          { id: "w-lisboa", name: "Lisboa" },
          { id: "w-porto", name: "Porto" },
        ],
      }),
    );
    const pedidos = rpc.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Registar (simulado)" }));
    expect(depois).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(pedidos));
    expect(screen.queryByRole("dialog", { name: "Diálogo de movimento" })).toBeNull();
  });
});

describe("EcTransferSuggestions na folha da EC", () => {
  it("só as sugestões dessa EC, em aviso", async () => {
    montar(<EcTransferSuggestions organizationId="org-1" contractId="c2" />);
    const aviso = await screen.findByRole("region", { name: "Transferências sugeridas" });
    expect(within(aviso).getByText("Lavatório")).toBeInTheDocument();
    expect(within(aviso).queryByText("Torneira")).toBeNull();
    expect(within(aviso).getByText(/não é o mais próximo da obra/)).toBeInTheDocument();
    fireEvent.click(within(aviso).getByRole("button", { name: /^Transferir/ }));
    expect(dialogoProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultProductId: "p3", defaultQuantity: 1, defaultNotes: "Transferência sugerida para EC-2026-0030" }),
    );
  });

  it("EC sem sugestões: nada", async () => {
    const { container } = montar(<EcTransferSuggestions organizationId="org-1" contractId="c-outra" />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
