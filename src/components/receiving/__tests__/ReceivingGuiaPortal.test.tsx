// Receção com guias de remessa expedidas pelo fornecedor no portal (supplier_delivery_notes com history 'shipped' /
// supplier_portal): "Expedida · GR …" na lista, guia pré-escolhida no "Dar entrada" com as quantidades da guia, envio
// pelo rpc_receive_by_code de sempre com p_delivery_note_id, "Ver guia" por URL assinado e "Enviada pelo fornecedor"
// no separador Guias com o filtro de origem. Supabase simulado (as leituras devolvem a tabela toda, sem filtros).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
type RpcHandler = (args: Record<string, unknown>) => { data: unknown; error: unknown };
const rpcHandlers: Record<string, RpcHandler> = {};
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const signed: { bucket: string; path: string }[] = [];
let signedResult: { data: { signedUrl: string } | null; error: { message: string } | null } = {
  data: { signedUrl: "https://storage.test/gr77.pdf?token=1" },
  error: null,
};

function builder(table: string) {
  const res = () => {
    const rows = db[table] ?? [];
    return { data: rows, error: null, count: rows.length };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "in", "order", "range", "limit", "ilike", "not", "gte", "lte", "or"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: (db[table] ?? [])[0] ?? null, error: null });
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
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string) => {
          signed.push({ bucket, path });
          return Promise.resolve(signedResult);
        },
      }),
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

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/components/inventory/ui/InventoryAreaTabs", () => ({
  InventoryAreaTabs: () => null,
  INVENTORY_AREA_LABEL: { warehouse: "Armazém", purchases: "Compras" },
  useInventoryAreaItems: () => [],
}));

import Receiving from "@/pages/Receiving";

const ALL = ["receiving.view", "receiving.receive", "purchase_orders.receive", "purchase_orders.view", "inventory.edit", "receiving.manage_delivery_notes"];

const PORTAL_HISTORY = [
  {
    action: "shipped",
    origin: "supplier_portal",
    at: "2026-10-20T10:00:00Z",
    by_portal_user: "pu-1",
    by_name: "Ana Fornecedora",
    carrier: "CTT Expresso",
    purchase_order_id: "po-1",
    revision: 1,
  },
  { action: "attachment", path: "org-1/guias/gr77.pdf", name: "gr77.pdf", mime: "application/pdf", size: 2048, at: "2026-10-20T10:01:00Z" },
];

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
        quantity: 3,
        received_quantity: 0,
        uom_id: "uom-cx",
        units_per_uom: 5,
        products: { name: "Base duche", sku: "BD-1" },
        uom: { code: "cx" },
      },
    ],
  };
}

function receiveResult(args: Record<string, unknown>) {
  const units = Number(args.p_quantity) * 5;
  return {
    request_id: args.p_request_id,
    replayed: false,
    dry_run: !!args.p_dry_run,
    quantity: args.p_quantity,
    units,
    uom_code: "cx",
    units_per_uom: 5,
    allocations: [
      {
        purchase_order_id: "po-1",
        order_number: "PO-0146",
        units_to_order_total: 0,
        units_to_stock_total: units,
        lines: [
          { purchase_order_item_id: "poi-1", destination: "stock", qty_to_order: 0, qty_to_stock: args.p_quantity, units_to_order: 0, units_to_stock: units, contract_order_number: null, contract_active: null },
        ],
      },
    ],
    units_to_order_total: 0,
    units_to_stock_total: units,
    warnings: [],
    ...(args.p_delivery_note_id ? { delivery_note_id: args.p_delivery_note_id, delivery_note_number: "GR 77" } : {}),
  };
}

function resetDb(portal = true) {
  for (const k of Object.keys(db)) delete db[k];
  db.warehouses = [{ id: "wh-1", name: "Armazém Central" }];
  db.suppliers = [{ id: "sup-1", name: "Zeta" }];
  db.purchase_orders = [poRow()];
  db.supplier_po_publications = [];
  db.scheduled_emails = [];
  db.purchase_order_receipts = [];
  db.receiving_scans = [];
  db.anew_users = [];
  db.supplier_delivery_notes = portal
    ? [
        {
          id: "gr-p",
          note_number: "77",
          document_date: "2026-10-20",
          created_at: "2026-10-20T10:00:00Z",
          status: "open",
          supplier_id: "sup-1",
          history: PORTAL_HISTORY,
          supplier: { name: "Zeta" },
        },
      ]
    : [];
  db.supplier_delivery_note_orders = portal ? [{ delivery_note_id: "gr-p", purchase_order_id: "po-1", po: { order_number: "PO-0146", deleted_at: null } }] : [];
  // A guia anuncia 2 cx de 3 por receber (10 un).
  db.supplier_delivery_note_lines = portal
    ? [{ delivery_note_id: "gr-p", product_id: "prod-1", purchase_order_item_id: "poi-1", quantity: 2, units_per_uom: 5 }]
    : [];
}

const realCalls = () => rpcCalls.filter((c) => c.name === "rpc_receive_by_code" && c.args.p_dry_run === false);

function renderPage(path = "/receiving") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Receiving />
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

async function openPanel() {
  const btn = await screen.findAllByRole("button", { name: "Dar entrada PO-0146" });
  fireEvent.click(btn[0]);
  return screen.findByRole("dialog");
}

beforeAll(() => {
  prepararRadixNoJsdom();
});

beforeEach(() => {
  perms = new Set(ALL);
  resetDb();
  rpcCalls.length = 0;
  signed.length = 0;
  signedResult = { data: { signedUrl: "https://storage.test/gr77.pdf?token=1" }, error: null };
  for (const k of Object.keys(rpcHandlers)) delete rpcHandlers[k];
  rpcHandlers.rpc_receive_by_code = (a) => ({ data: receiveResult(a), error: null });
  rpcHandlers.rpc_preview_po_receipt = () => ({ data: { lines: [] }, error: null });
  rpcHandlers.rpc_delivery_note_get = () => ({ data: null, error: { code: "P0002", message: "x" } });
  window.localStorage.clear();
  for (const k of Object.keys(window.sessionStorage)) {
    if (/^olyvia\.receiving\.(basket|unsent|context)\./.test(k)) window.sessionStorage.removeItem(k);
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Receção · guias expedidas pelo fornecedor no portal", () => {
  it("a lista mostra 'Expedida · GR 77' e o painel pré-escolhe a guia com as quantidades dela", async () => {
    renderPage();
    await waitScreenReady();
    expect((await screen.findAllByText(/Expedida · GR 77/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expedidas · a caminho").length).toBeGreaterThan(0);

    const dlg = await openPanel();
    const guia = within(dlg).getByLabelText("Guia do fornecedor (opcional)") as HTMLSelectElement;
    await waitFor(() => expect(guia.value).toBe("gr-p"));
    expect(within(guia).getByRole("option", { name: "GR 77 · enviada pelo fornecedor" })).toBeInTheDocument();
    const lista = within(dlg).getByRole("list", { name: "Guias enviadas pelo fornecedor" });
    expect(within(lista).getByText(/CTT Expresso/)).toBeInTheDocument();
    expect(within(lista).getByText(/por Ana Fornecedora/)).toBeInTheDocument();
    // 2 cx da guia (10 un), não as 3 cx que faltam (15 un).
    const receber = await within(dlg).findByRole("button", { name: /Receber tudo · 10 un/ });

    // Conferir: o valor pré-preenchido é o da guia e pode mudar-se até ao que falta.
    fireEvent.click(within(dlg).getByRole("button", { name: "Veio diferente? Conferir linha a linha" }));
    const campo = within(dlg).getByLabelText("Dar entrada: Base duche");
    expect(campo).toHaveValue("2");
    fireEvent.change(campo, { target: { value: "9" } });
    expect(campo).toHaveValue("3");
    fireEvent.change(campo, { target: { value: "2" } });
    expect(receber).toBeInTheDocument();

    fireEvent.click(within(dlg).getByRole("button", { name: /Confirmar entrada · 10 un/ }));
    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    expect(realCalls()[0].args).toMatchObject({ p_delivery_note_id: "gr-p", p_purchase_order_item_id: "poi-1", p_quantity: 2, p_supplier_id: "sup-1" });
  });

  it("desconta o já recebido com a guia; 'Sem guia' volta ao que falta", async () => {
    db.purchase_orders = [{ ...poRow(), status: "partially_received", purchase_order_items: [{ ...poRow().purchase_order_items[0], received_quantity: 1 }] }];
    db.purchase_order_receipts = [
      { delivery_note_id: "gr-p", purchase_order_item_id: "poi-1", quantity: 1, units_per_uom: 5, kind: "receipt", reverted_at: null },
    ];
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    const guia = within(dlg).getByLabelText("Guia do fornecedor (opcional)") as HTMLSelectElement;
    await waitFor(() => expect(guia.value).toBe("gr-p"));
    // Guia: 2 cx − 1 cx já recebida com ela = 1 cx (5 un); faltam 2 cx na PO.
    expect(await within(dlg).findByRole("button", { name: /Receber tudo · 5 un/ })).toBeInTheDocument();
    fireEvent.change(guia, { target: { value: "" } });
    expect(await within(dlg).findByRole("button", { name: /Receber tudo · 10 un/ })).toBeInTheDocument();
  });

  it("Ver guia abre o URL assinado do bucket documents; erro fica à vista e fecha o separador", async () => {
    const win = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockImplementation(() => win as unknown as Window);
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    const lista = await within(dlg).findByRole("list", { name: "Guias enviadas pelo fornecedor" });
    fireEvent.click(within(lista).getByRole("button", { name: /Ver guia/ }));
    await waitFor(() => expect(win.location.href).toBe("https://storage.test/gr77.pdf?token=1"));
    expect(signed).toEqual([{ bucket: "documents", path: "org-1/guias/gr77.pdf" }]);
    expect(win.opener).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);

    signedResult = { data: null, error: { message: "Object not found" } };
    fireEvent.click(within(lista).getByRole("button", { name: /Ver guia/ }));
    expect(await within(lista).findByText("Object not found")).toBeInTheDocument();
    expect(win.close).toHaveBeenCalled();
  });

  it("sem guias do portal: nada pré-escolhido e vale o que falta", async () => {
    resetDb(false);
    db.supplier_delivery_notes = [{ id: "nota-1", note_number: "GR 1", document_date: null, supplier_id: "sup-1", status: "open", history: [] }];
    renderPage();
    await waitScreenReady();
    expect(screen.queryByText(/Expedida · /)).toBeNull();
    const dlg = await openPanel();
    const guia = within(dlg).getByLabelText("Guia do fornecedor (opcional)") as HTMLSelectElement;
    await waitFor(() => expect(within(guia).getByRole("option", { name: "GR 1" })).toBeInTheDocument());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(guia.value).toBe("");
    expect(within(dlg).queryByRole("list", { name: "Guias enviadas pelo fornecedor" })).toBeNull();
    expect(within(dlg).getByRole("button", { name: /Receber tudo · 15 un/ })).toBeInTheDocument();
  });

  it("separador Guias: 'Enviada pelo fornecedor', 'com ficheiro' e filtro de origem", async () => {
    db.supplier_delivery_notes = [
      ...db.supplier_delivery_notes,
      { id: "eq-1", note_number: "GR 5", document_date: "2026-10-19", created_at: "2026-10-19T10:00:00Z", status: "open", supplier_id: "sup-1", history: [], supplier: { name: "Zeta" } },
    ];
    renderPage("/receiving?tab=guias");
    await waitScreenReady();
    const painel = (await screen.findAllByRole("heading", { name: "Guias" }))[0].closest("section") as HTMLElement;
    await within(painel).findByText("GR 77");
    expect(within(painel).getByText("GR 5")).toBeInTheDocument();
    expect(within(painel).getByText("Enviada pelo fornecedor")).toBeInTheDocument();
    expect(within(painel).getByText("com ficheiro")).toBeInTheDocument();

    const origem = within(painel).getByRole("group", { name: "Origem da guia" });
    fireEvent.click(within(origem).getByRole("button", { name: /Fornecedor/ }));
    expect(within(painel).getByText("GR 77")).toBeInTheDocument();
    expect(within(painel).queryByText("GR 5")).toBeNull();
    fireEvent.click(within(origem).getByRole("button", { name: /Equipa/ }));
    expect(within(painel).queryByText("GR 77")).toBeNull();
    expect(within(painel).getByText("GR 5")).toBeInTheDocument();
  });
});
