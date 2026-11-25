// Receção na moldura do novo Inventário (InventarioEmbebido = true) vs. fora dela (o ecrã clássico, sem mudanças).
// Supabase simulado como em ReceivingDarEntrada.test.tsx: o que o ecrã lê/chama.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
type RpcHandler = (args: Record<string, unknown>) => { data: unknown; error: unknown };
const rpcHandlers: Record<string, RpcHandler> = {};
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

function builder(table: string) {
  // Só o filtro .in("order_number", …) é aplicado (a procura "esta PO já não está por receber" da barra de leitura).
  let numeros: unknown[] | null = null;
  const linhas = () => (db[table] ?? []).filter((r) => !numeros || numeros.includes(r.order_number));
  const res = () => {
    const rows = linhas();
    return { data: rows, error: null, count: rows.length };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "order", "range", "limit", "ilike", "not", "gte", "lte", "or"]) {
    q[m] = () => q;
  }
  q.in = (col: string, vals: unknown[]) => {
    if (col === "order_number") numeros = vals;
    return q;
  };
  q.maybeSingle = () => Promise.resolve({ data: linhas()[0] ?? null, error: null });
  q.single = () => Promise.resolve({ data: (db[table] ?? [])[0] ?? null, error: null });
  q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko);
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const h = rpcHandlers[name];
      return Promise.resolve(h ? h(args) : { data: null, error: null });
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "user-1" } } } }) },
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1", name: "Empresa" }, isLoading: false }),
}));

let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (l: string[]) => l.some((p) => perms.has(p)),
    loading: false,
  }),
}));

// O toast tem de ser estável (o ecrã tem efeitos que dependem dele).
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/components/inventory/ui/InventoryAreaTabs", () => ({
  InventoryAreaTabs: () => null,
  INVENTORY_AREA_LABEL: { warehouse: "Armazém", purchases: "Compras" },
  useInventoryAreaItems: () => [],
}));

import Receiving from "@/pages/Receiving";

const ALL = ["receiving.view", "receiving.receive", "purchase_orders.receive", "purchase_orders.view", "inventory.edit", "receiving.manage_delivery_notes"];

function poRow() {
  return {
    id: "po-1",
    order_number: "PO-0146",
    status: "ordered",
    supplier_id: "sup-1",
    expected_delivery: "2026-01-01",
    order_date: "2025-12-01",
    source_type: null,
    source_id: null,
    suppliers: { name: "Zeta" },
    purchase_order_items: [
      {
        id: "poi-1",
        item_type: "product",
        product_id: "prod-1",
        description: "Base duche",
        sku: "BD-1",
        quantity: 2,
        received_quantity: 0,
        uom_id: "uom-cx",
        units_per_uom: 5,
        products: { name: "Base duche", sku: "BD-1" },
        uom: { code: "cx" },
      },
    ],
  };
}

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
  db.warehouses = [{ id: "wh-1", name: "Armazém Central" }];
  db.suppliers = [{ id: "sup-1", name: "Zeta" }];
  db.purchase_orders = [poRow()];
  db.supplier_po_publications = [];
  db.scheduled_emails = [];
  db.purchase_order_receipts = [];
  db.receiving_scans = [];
  db.supplier_delivery_notes = [];
  db.anew_users = [];
}

function renderPage(embebido: boolean, path = "/receiving") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <InventarioEmbebido.Provider value={embebido}>
          <Receiving />
        </InventarioEmbebido.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function waitScreenReady() {
  await waitFor(() => expect(window.sessionStorage.getItem("olyvia.receiving.tabId")).not.toBeNull());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

/** Escreve no campo de leitura e carrega em Enter (o campo único do ReceivingReadBar). */
function ler(texto: string) {
  const campo = document.getElementById("rec-ler") as HTMLInputElement;
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.keyDown(campo, { key: "Enter" });
}

beforeAll(() => prepararRadixNoJsdom());

beforeEach(() => {
  perms = new Set(ALL);
  resetDb();
  rpcCalls.length = 0;
  for (const k of Object.keys(rpcHandlers)) delete rpcHandlers[k];
  rpcHandlers.rpc_preview_po_receipt = () => ({ data: { lines: [] }, error: null });
  rpcHandlers.rpc_delivery_note_get = () => ({ data: null, error: { code: "P0002", message: "x" } });
  rpcHandlers.rpc_receiving_lookup = () => ({ data: { candidates: [] }, error: null });
  rpcHandlers.rpc_inventory_today = () => ({ data: { purchases: { delivery_notes_with_divergences: 1 } }, error: null });
  window.localStorage.clear();
  for (const k of Object.keys(window.sessionStorage)) {
    if (/^olyvia\.receiving\.(basket|unsent|context)\./.test(k)) window.sessionStorage.removeItem(k);
  }
});

afterEach(() => cleanup());

describe("Receção fora da moldura (fica igual)", () => {
  it("cabeçalho clássico, barra de leitura clássica e a tabela Por receber; nada dos cartões", async () => {
    renderPage(false);
    expect(await screen.findByRole("heading", { level: 1, name: "Receção" })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Encomendas por receber, por ordem de chegada" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Dar entrada PO-0146" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Ler ou escrever: nº PO, guia, fornecedor, EAN/SKU")).toBeInTheDocument();
    expect(screen.queryByTestId("rec-scanbox")).toBeNull();
    expect(screen.queryByTestId("rec-barra")).toBeNull();
    expect(screen.queryAllByTestId("rec-cartao")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Tabela" })).toBeNull();
    expect(screen.queryByTestId("rec-aviso-divergencias")).toBeNull();
    // Nem pede o número das guias com divergências (só a moldura o usa).
    expect(rpcCalls.some((c) => c.name === "rpc_inventory_today")).toBe(false);
  });
});

describe("Receção dentro da moldura", () => {
  it("sem cabeçalho clássico; scanbox, aviso, barra e cartões em secções", async () => {
    renderPage(true);
    const cartao = await screen.findByTestId("rec-cartao");
    expect(screen.queryByRole("heading", { level: 1, name: "Receção" })).toBeNull();
    // Um só campo de leitura, o do ReceivingReadBar, dentro da scanbox.
    const campos = document.querySelectorAll("#rec-ler");
    expect(campos).toHaveLength(1);
    expect(screen.getByTestId("rec-scanbox").contains(campos[0])).toBe(true);
    // O CSS da scanbox prende-se ao atributo estável do ReceivingReadBar real, que tem o campo.
    expect(screen.getByTestId("rec-scanbox").querySelector("[data-rececao-leitor] #rec-ler")).toBe(campos[0]);
    expect(screen.getByTestId("rec-scanbox-pista")).toHaveTextContent("Ler código ou escrever nº PO / guia / SKU");
    expect(within(screen.getByTestId("rec-barra")).getByRole("button", { name: "Nova guia" })).toBeInTheDocument();
    expect(within(screen.getByTestId("rec-barra")).getByRole("link", { name: "Receber numa encomenda" })).toBeInTheDocument();
    expect(within(screen.getByTestId("rec-barra")).getByRole("button", { name: "Ler artigo a artigo" })).toBeInTheDocument();
    expect(await screen.findByTestId("rec-aviso-divergencias")).toHaveTextContent("1 guia aberta com divergências");
    // A PO atrasada (entrega 01/01/2026) fica na secção Atrasadas.
    const sec = screen.getByTestId("rec-seccao");
    expect(within(sec).getByRole("heading")).toHaveTextContent("Atrasadas");
    expect(cartao).toHaveTextContent("Zeta");
    expect(cartao).toHaveTextContent("PO-0146");
    expect(within(cartao).getByTestId("rec-cartao-para")).toHaveTextContent("Para: Stock · Sem envio registado · entrega 01/01");
    expect(within(cartao).getByTestId("rec-cartao-falta")).toHaveTextContent("Falta: 2 cx (= 5 un) Base duche");
    // Os separadores Recebidas / Guias continuam.
    expect(screen.getByRole("tab", { name: /Recebidas/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Guias/ })).toBeInTheDocument();
  });

  it("clicar no cartão e em Receber abrem o mesmo painel Dar entrada que a linha", async () => {
    renderPage(true);
    await waitScreenReady();
    const cartao = await screen.findByTestId("rec-cartao");
    fireEvent.click(within(cartao).getByRole("button", { name: "Abrir PO-0146 · Zeta" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Dar entrada · PO-0146");
    cleanup();

    renderPage(true);
    await waitScreenReady();
    fireEvent.click(within(await screen.findByTestId("rec-cartao")).getByRole("button", { name: "Receber PO-0146" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Dar entrada · PO-0146");
  });

  it("sem receiving.receive: Receber bloqueado com o motivo e o cartão não abre", async () => {
    perms = new Set(["receiving.view", "purchase_orders.view"]);
    renderPage(true);
    const cartao = await screen.findByTestId("rec-cartao");
    expect(within(cartao).queryByTestId("rec-cartao-abrir")).toBeNull();
    const b = within(cartao).getByRole("button", { name: "Receber PO-0146" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/receiving\.receive/);
    fireEvent.click(b);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o campo de leitura é o mesmo: o nº da PO abre o painel e um EAN vai ao rpc_receiving_lookup", async () => {
    renderPage(true);
    await waitScreenReady();
    await screen.findByTestId("rec-cartao");
    ler("PO-0146");
    expect(await screen.findByRole("dialog")).toHaveTextContent("Dar entrada · PO-0146");
    cleanup();

    renderPage(true);
    await waitScreenReady();
    await screen.findByTestId("rec-cartao");
    ler("5601234000028");
    await waitFor(() => expect(rpcCalls.some((c) => c.name === "rpc_receiving_lookup" && c.args.p_code === "5601234000028")).toBe(true));
    expect(await screen.findByText(/Não encontrei «5601234000028»/)).toBeInTheDocument();
  });

  it("Tabela mostra a lista clássica com Dar entrada", async () => {
    renderPage(true);
    await screen.findByTestId("rec-cartao");
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(await screen.findByRole("table", { name: "Encomendas por receber, por ordem de chegada" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("rec-cartao")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    expect(await screen.findByTestId("rec-cartao")).toBeInTheDocument();
  });

  it("o aviso abre as Guias com divergências", async () => {
    renderPage(true);
    const aviso = await screen.findByTestId("rec-aviso-divergencias");
    fireEvent.click(within(aviso).getByRole("button", { name: "Abrir a guia" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Guias/ })).toHaveAttribute("aria-selected", "true"));
  });

  it("no leitor (?vista=leitor) ficam as ações do cabeçalho para voltar à lista", async () => {
    renderPage(true, "/receiving?vista=leitor");
    await waitScreenReady();
    expect(screen.queryByRole("heading", { level: 1, name: "Receção" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Encomendas por receber" }));
    expect(await screen.findByTestId("rec-cartao")).toBeInTheDocument();
  });
});
