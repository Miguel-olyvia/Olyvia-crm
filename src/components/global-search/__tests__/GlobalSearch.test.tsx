import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1" } }),
}));
const captureFlowErrorMock = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowErrorMock(...args),
}));

import { GlobalSearch, GLOBAL_SEARCH_PLACEHOLDER } from "../GlobalSearch";

beforeAll(() => {
  // cmdk e Radix usam APIs que o jsdom não tem.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const payload = {
  query: "zz",
  purchase_orders: [
    { id: "po-1", order_number: "PO-2026-0001", status: "ordered", order_date: null, expected_delivery: null, supplier_name: "Alfa" },
  ],
  client_orders: null,
  products: [{ id: "p-1", sku: "SKU-1", name: "Parafuso", barcode: null, matched_code: null, total_quantity: 2 }],
  suppliers: [],
  delivery_notes: null,
};

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function setup(hasPermission: (p: string) => boolean = () => true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/inicio"]}>
        <GlobalSearch hasPermission={hasPermission} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox", { name: "Pesquisa global" });
}

const type = (input: HTMLElement, value: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

beforeEach(() => {
  rpcMock.mockReset();
  captureFlowErrorMock.mockReset();
});

describe("GlobalSearch", () => {
  it("caixa acessível com o placeholder do 2.0, dentro de role=search", () => {
    const input = setup();
    expect(input).toHaveAttribute("placeholder", GLOBAL_SEARCH_PLACEHOLDER);
    expect(screen.getByRole("search", { name: "Pesquisa global" })).toBeInTheDocument();
  });

  it("1 caractere: pede mais texto e não chama a BD", async () => {
    const input = setup();
    type(input, "p");
    expect(await screen.findByText(/pelo menos 2 caracteres/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("debounce: um só pedido para o texto final, com org, texto e limite", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "pa");
    type(input, "par");
    type(input, "  para ");
    expect(screen.getByText("A pesquisar…")).toBeInTheDocument();
    expect(await screen.findByText("PO-2026-0001")).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("rpc_inventory_global_search", { p_org_id: "org-1", p_query: "para", p_limit: 8 });
  });

  it("resultados agrupados; os grupos a null ou vazios não aparecem", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "zz");
    expect(await screen.findByText("Encomendas a fornecedor")).toBeInTheDocument();
    expect(screen.getByText("Produtos")).toBeInTheDocument();
    expect(screen.queryByText("Encomendas Clientes")).not.toBeInTheDocument();
    expect(screen.queryByText("Fornecedores")).not.toBeInTheDocument();
    expect(screen.getByText("Alfa · Encomendada")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("clique num resultado navega para a ficha e limpa a caixa", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "zz");
    fireEvent.click(await screen.findByText("Parafuso"));
    expect(screen.getByTestId("where")).toHaveTextContent("/stocks?q=SKU-1");
    expect(input).toHaveValue("");
  });

  it("teclado: setas escolhem, Enter abre", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "zz");
    await screen.findByText("PO-2026-0001");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/stocks?q=SKU-1"));
  });

  it("Enter sem mexer nas setas abre o primeiro resultado", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "zz");
    await screen.findByText("PO-2026-0001");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/purchase-orders?open=po-1"));
  });

  it("Esc fecha e limpa", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "zz");
    await screen.findByText("PO-2026-0001");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    await waitFor(() => expect(screen.queryByText("PO-2026-0001")).not.toBeInTheDocument());
  });

  it("sem resultados", async () => {
    rpcMock.mockResolvedValue({
      data: { query: "xyz", purchase_orders: [], client_orders: [], products: [], suppliers: [], delivery_notes: [] },
      error: null,
      status: 200,
    });
    const input = setup();
    type(input, "xyz");
    expect(await screen.findByText("Sem resultados para “xyz”.")).toBeInTheDocument();
  });

  it("erro: mensagem, reporta e deixa tentar de novo", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "timeout" }, status: 500 });
    rpcMock.mockResolvedValueOnce({ data: payload, error: null, status: 200 });
    const input = setup();
    type(input, "zz");
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível pesquisar.");
    expect(captureFlowErrorMock).toHaveBeenCalledWith(expect.objectContaining({ code: "57014" }), "inventory-global-search");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("PO-2026-0001")).toBeInTheDocument();
  });

  it("função ainda não aplicada (PGRST202): aviso próprio, sem reportar", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" }, status: 404 });
    const input = setup();
    type(input, "zz");
    expect(await screen.findByText("A pesquisa global ainda não está disponível.")).toBeInTheDocument();
    expect(captureFlowErrorMock).not.toHaveBeenCalled();
  });

  it("sem a permissão da página de destino, o grupo não aparece", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null, status: 200 });
    const input = setup((p) => p === "inventory.view");
    type(input, "zz");
    expect(await screen.findByText("Parafuso")).toBeInTheDocument();
    expect(screen.queryByText("PO-2026-0001")).not.toBeInTheDocument();
  });
});
