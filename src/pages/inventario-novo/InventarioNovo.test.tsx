// A moldura do novo Inventário: os separadores com a permissão da rota clássica, o ecrã clássico embebido (sem os
// separadores antigos, com as ligações a ficarem cá dentro), o botão principal e o Esc.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useContext } from "react";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import type { ReceivablePo } from "@/components/receiving/porReceber";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "is", "order", "limit", "in", "range"]) chain[k] = () => chain;
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { supabase: { from: () => chain, rpc: vi.fn() } };
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
let receivable: ReceivablePo[] | undefined;
vi.mock("@/components/receiving/useReceivablePos", async (orig) => ({
  ...(await orig<typeof import("@/components/receiving/useReceivablePos")>()),
  useReceivablePos: (_org: string, enabled: boolean) => ({ data: enabled ? receivable : undefined, refetch: vi.fn() }),
}));
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" data-state="open" aria-label="Registar movimento">diálogo</div> : null),
}));

// Os ecrãs clássicos: uns de exemplo, para não carregar as páginas inteiras. O das Encomendas usa o cabeçalho
// real (InventoryPageHeader) e uma ligação clássica, para provar que os separadores antigos somem e a ligação fica cá dentro.
vi.mock("@/pages/InventoryToday", async () => {
  const { InventarioEmbebido } = await import("@/components/inventory/ui/embebido");
  return { default: () => <p>Hoje clássico{useContext(InventarioEmbebido) ? " (embebido)" : ""}</p> };
});
vi.mock("@/pages/PurchaseOrders", async () => {
  const { InventoryPageHeader } = await import("@/components/inventory/ui/InventoryPageHeader");
  return {
    default: () => (
      <div>
        <InventoryPageHeader area="purchases" title="Encomendas a fornecedor" />
        <Link to="/suppliers?filter=prices">Ver fornecedores</Link>
      </div>
    ),
  };
});
vi.mock("@/components/inventory/ui/InventoryAreaTabs", async (orig) => ({
  ...(await orig<typeof import("@/components/inventory/ui/InventoryAreaTabs")>()),
  InventoryAreaTabs: () => <nav aria-label="Separadores antigos" />,
}));
vi.mock("@/pages/Suppliers", () => ({ default: () => <p>Fornecedores clássico</p> }));
vi.mock("@/pages/Receiving", () => ({ default: () => <p>Receção clássico</p> }));
vi.mock("@/pages/Stocks", () => ({ default: () => <p>Existências clássico</p> }));
vi.mock("@/pages/StockMovements", () => ({ default: () => <p>Movimentos clássico</p> }));
vi.mock("@/pages/StockCounts", () => ({ default: () => <p>Contagens clássico</p> }));
vi.mock("@/pages/Warehouses", () => ({ default: () => <p>Armazéns clássico</p> }));
vi.mock("@/pages/ClientOrders", () => ({ default: () => <p>Saídas clássico</p> }));

import InventarioNovo, { escDeveSair } from "./InventarioNovo";

afterEach(cleanup);

// Fatia 2: o botão principal também está na barra do polegar (só no telemóvel); estes testes são os do cabeçalho.
const cabecalho = () => within(document.querySelector("header") as HTMLElement);

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
          <Route path="/inventory" element={<p>Inventário clássico</p>} />
          <Route path="*" element={<p>outra página</p>} />
        </Routes>
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("o novo Inventário", () => {
  beforeEach(() => { perms = new Set(TODAS); todayPayload = payload(); receivable = []; });

  it("os separadores seguem as permissões das rotas clássicas: sem permissão, o separador não aparece", async () => {
    perms = new Set(["inventory.view", "client_orders.view"]);
    montar();
    expect(await screen.findByText("Hoje clássico (embebido)")).toBeInTheDocument();
    const abas = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""));
    expect(abas).toEqual(["Hoje", "Existências", "Movimentos", "Contagens", "Saídas para clientes"]);
    expect(screen.queryByRole("tab", { name: /Encomendas/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Armazéns/ })).toBeNull();
  });

  it("um separador sem permissão pedido no endereço mostra «Sem acesso» (como a rota clássica)", async () => {
    perms = new Set(["inventory.view"]);
    montar("/inventory/novo/fornecedores");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem acesso");
    expect(screen.queryByText("Fornecedores clássico")).toBeNull();
  });

  it("sem separador no endereço, abre o Hoje; o Hoje tem o Pulso e o Comando por cima do Hoje clássico", async () => {
    montar("/inventory/novo?x=1");
    expect(await screen.findByText("Hoje clássico (embebido)")).toBeInTheDocument();
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje?x=1");
    expect(screen.getByRole("region", { name: "O pulso do inventário" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Comando de hoje" })).toBeInTheDocument();
    expect(screen.getByText(/Precisam de ti hoje/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Grupo BMLar");
  });

  it("o ecrã embebido não mostra os separadores antigos e as ligações abrem o separador", async () => {
    montar("/inventory/novo/encomendas");
    expect(await screen.findByText("Encomendas a fornecedor", undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Separadores antigos" })).toBeNull();
    const link = screen.getByRole("link", { name: "Ver fornecedores" });
    expect(link).toHaveAttribute("href", "/inventory/novo/fornecedores?filter=prices");
    fireEvent.click(link);
    expect(await screen.findByText("Fornecedores clássico", undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/fornecedores?filter=prices");
    expect(screen.getByRole("tab", { name: /Fornecedores/ })).toHaveAttribute("aria-selected", "true");
  });

  it("o botão principal: POs por aprovar → Aprovar encomendas, bloqueado sem purchase_orders.approve", async () => {
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    const b = cabecalho().getByRole("button", { name: /Aprovar encomendas/ });
    expect(b).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(b);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("o botão principal com permissão navega para o separador filtrado", async () => {
    perms = new Set([...TODAS, "purchase_orders.approve"]);
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    fireEvent.click(cabecalho().getByRole("button", { name: /Aprovar encomendas/ }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/encomendas?status=pending");
  });

  it("sem nada pendente: Registar movimento abre o diálogo; Esc com o diálogo aberto não fecha o Inventário", async () => {
    todayPayload = { ...payload(), purchases: { ...payload().purchases!, pending_approval: 0 } };
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    fireEvent.click(cabecalho().getByRole("button", { name: /Registar movimento/ }));
    expect(screen.getByRole("dialog", { name: "Registar movimento" })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("fatia 3: o «E se…?» do botão principal no Hoje (fechado não lê nada) e o Anular/Refazer no cabeçalho", async () => {
    perms = new Set([...TODAS, "client_orders.confirm_stock_exit"]);
    todayPayload = { ...payload(), client_orders: { ...payload().client_orders!, ready_to_ship: 2 } };
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    expect(cabecalho().getByRole("group", { name: "Anular e refazer" })).toBeInTheDocument();
    expect(cabecalho().getByRole("button", { name: /Dar saída/ })).toBeInTheDocument();
    const abrir = screen.getByRole("button", { name: "E se… Dar saída?" });
    expect(abrir).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "E se confirmares a saída?" })).toBeNull();
    fireEvent.click(abrir);
    expect(await screen.findByRole("region", { name: "E se confirmares a saída?" })).toBeInTheDocument();
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("Esc sem diálogo aberto volta ao clássico; «Voltar ao clássico» também", async () => {
    const { unmount } = montar();
    await screen.findByText("Hoje clássico (embebido)");
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory$/);
    unmount();
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao clássico" }));
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory$/);
  });

  it("escDeveSair: não com uma folha aberta, nem já tratado, nem dentro de uma caixa de texto", () => {
    const doc = document.implementation.createHTMLDocument("t");
    const ev = (over: Partial<KeyboardEvent> = {}) => ({ key: "Escape", defaultPrevented: false, target: doc.body, ...over }) as KeyboardEvent;
    expect(escDeveSair(ev(), doc)).toBe(true);
    expect(escDeveSair(ev({ key: "Enter" }), doc)).toBe(false);
    expect(escDeveSair(ev({ defaultPrevented: true }), doc)).toBe(false);
    const input = doc.createElement("input");
    doc.body.appendChild(input);
    expect(escDeveSair(ev({ target: input }), doc)).toBe(false);
    const folha = doc.createElement("div");
    folha.setAttribute("role", "dialog");
    folha.setAttribute("data-state", "open");
    doc.body.appendChild(folha);
    expect(escDeveSair(ev(), doc)).toBe(false);
  });

  it("escDeveSair: dentro de um ecrã clássico não sai; no cabeçalho/separadores da moldura sai", () => {
    const doc = document.implementation.createHTMLDocument("t");
    const ev = (target: EventTarget) => ({ key: "Escape", defaultPrevented: false, target }) as unknown as KeyboardEvent;
    const botaoDoEcra = doc.createElement("button");
    doc.body.appendChild(botaoDoEcra);
    expect(escDeveSair(ev(botaoDoEcra), doc)).toBe(false);
    const moldura = doc.createElement("div");
    moldura.setAttribute("data-moldura-inventario", "");
    const aba = doc.createElement("button");
    moldura.appendChild(aba);
    doc.body.appendChild(moldura);
    expect(escDeveSair(ev(aba), doc)).toBe(true);
  });
});
