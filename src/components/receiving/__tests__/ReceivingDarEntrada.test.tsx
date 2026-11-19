// "Dar entrada" na vista lista da Receção: tem de passar pelo envio do cesto de sempre (rpc_receive_by_code com
// p_purchase_order_item_id, request_id, pendente em localStorage antes da chamada, recuperação, avisos da guia) e o
// leitor artigo a artigo continua a funcionar. Supabase simulado (só o que o ecrã lê/chama).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

const USER = "user-1";
const ORG = "org-1";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
type RpcHandler = (args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> | { data: unknown; error: unknown };
const rpcHandlers: Record<string, RpcHandler> = {};
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
/** Leituras de uma tabela presas até a promessa resolver (simula a lista a recarregar). */
const gates: Record<string, Promise<void> | undefined> = {};

function builder(table: string) {
  const res = () => {
    const rows = db[table] ?? [];
    return { data: rows, error: null, count: rows.length };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "in", "order", "range", "limit", "ilike", "not", "gte", "lte", "or"]) {
    q[m] = () => q;
  }
  q.maybeSingle = () => Promise.resolve({ data: (db[table] ?? [])[0] ?? null, error: null });
  q.single = () => Promise.resolve({ data: (db[table] ?? [])[0] ?? null, error: null });
  q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    const gate = gates[table];
    return (gate ? gate.then(() => res()) : Promise.resolve(res())).then(ok, ko);
  };
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

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/components/inventory/ui/InventoryAreaTabs", () => ({
  InventoryAreaTabs: () => null,
  INVENTORY_AREA_LABEL: { warehouse: "Armazém", purchases: "Compras" },
  useInventoryAreaItems: () => [],
}));

import Receiving from "@/pages/Receiving";

const ALL = ["receiving.view", "receiving.receive", "purchase_orders.receive", "purchase_orders.view", "inventory.edit", "receiving.manage_delivery_notes"];

function poRow(over: { quantity?: number; received?: number; extraLine?: boolean } = {}) {
  const extra = over.extraLine
    ? [
        {
          id: "poi-2",
          item_type: "product",
          product_id: "prod-2",
          description: "Torneira",
          sku: "T-2",
          quantity: 3,
          received_quantity: 0,
          uom_id: null,
          units_per_uom: 1,
          products: { name: "Torneira", sku: "T-2" },
          uom: null,
        },
      ]
    : [];
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
        quantity: over.quantity ?? 2,
        received_quantity: over.received ?? 0,
        uom_id: "uom-cx",
        units_per_uom: 5,
        products: { name: "Base duche", sku: "BD-1" },
        uom: { code: "cx" },
      },
      ...extra,
    ],
  };
}

function receiveResult(args: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    request_id: args.p_request_id,
    replayed: false,
    dry_run: !!args.p_dry_run,
    quantity: args.p_quantity,
    units: Number(args.p_quantity) * 5,
    uom_code: "cx",
    units_per_uom: 5,
    allocations: [
      {
        purchase_order_id: "po-1",
        order_number: "PO-0146",
        units_to_order_total: 0,
        units_to_stock_total: 10,
        lines: [{ purchase_order_item_id: "poi-1", destination: "stock", qty_to_order: 0, qty_to_stock: 2, units_to_order: 0, units_to_stock: 10, contract_order_number: null, contract_active: null }],
      },
    ],
    units_to_order_total: 0,
    units_to_stock_total: 10,
    warnings: [],
    ...(args.p_delivery_note_id ? { delivery_note_id: args.p_delivery_note_id, delivery_note_number: "GR 1" } : {}),
    ...extra,
  };
}

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
  db.warehouses = [{ id: "wh-1", name: "Armazém Central" }];
  db.suppliers = [
    { id: "sup-1", name: "Zeta" },
    { id: "sup-2", name: "Alfa" },
  ];
  db.purchase_orders = [poRow()];
  db.supplier_po_publications = [];
  db.scheduled_emails = [];
  db.purchase_order_receipts = [];
  db.receiving_scans = [];
  db.supplier_delivery_notes = [];
  db.anew_users = [];
}

const realCalls = () => rpcCalls.filter((c) => c.name === "rpc_receive_by_code" && c.args.p_dry_run === false);
const dryCalls = () => rpcCalls.filter((c) => c.name === "rpc_receive_by_code" && c.args.p_dry_run === true);
const pendingKey = `olyvia.receiving.pending.${USER}`;

function renderPage(path = "/receiving", strict = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Receiving />
      </QueryClientProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** O cesto só aceita entradas depois da verificação do separador e da reposição. */
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
  for (const k of Object.keys(rpcHandlers)) delete rpcHandlers[k];
  rpcHandlers.rpc_receive_by_code = (a) => ({ data: receiveResult(a), error: null });
  rpcHandlers.rpc_preview_po_receipt = () => ({ data: { lines: [] }, error: null });
  rpcHandlers.rpc_delivery_note_get = () => ({ data: null, error: { code: "P0002", message: "x" } });
  window.localStorage.clear();
  // O cesto/contexto de um teste anterior não pode ser reposto no seguinte (fica a marca do separador).
  for (const k of Object.keys(window.sessionStorage)) {
    if (/^olyvia\.receiving\.(basket|unsent|context)\./.test(k)) window.sessionStorage.removeItem(k);
  }
  toast.mockReset();
  for (const k of Object.keys(gates)) delete gates[k];
});

afterEach(() => {
  cleanup();
});

describe("Receção · Dar entrada pelo cesto", () => {
  it("Receber tudo: dry-run e depois rpc_receive_by_code presa à linha, com a pendente gravada antes", async () => {
    let pendingAtCall: string | null = null;
    rpcHandlers.rpc_receive_by_code = (a) => {
      if (a.p_dry_run === false) pendingAtCall = window.localStorage.getItem(pendingKey);
      return { data: receiveResult(a), error: null };
    };
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    expect(within(dlg).getByText("Dar entrada · PO-0146")).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: /Receber tudo · 10 un/ }));

    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    const dry = dryCalls()[0].args;
    const real = realCalls()[0].args;
    expect(dry).toMatchObject({ p_purchase_order_item_id: "poi-1", p_uom_id: "uom-cx", p_quantity: 2, p_supplier_id: "sup-1", p_warehouse_id: "wh-1" });
    expect(real).toMatchObject({ p_purchase_order_item_id: "poi-1", p_uom_id: "uom-cx", p_quantity: 2, p_supplier_id: "sup-1", p_warehouse_id: "wh-1" });
    expect(real.p_delivery_note_id).toBeUndefined();
    // Idempotência: a pendente (com o mesmo request_id) já estava no localStorage quando a RPC foi chamada.
    expect(pendingAtCall).toContain(String(real.p_request_id));
    expect(await within(dlg).findByText(/Entrou no Armazém Central · 10 un para stock\./)).toBeInTheDocument();
    // Resposta definitiva: a pendente sai.
    await waitFor(() => expect(window.localStorage.getItem(pendingKey)).toBeNull());
  });

  it("erro de rede: fica 'Receção por confirmar' e Tentar de novo usa o MESMO request_id", async () => {
    rpcHandlers.rpc_receive_by_code = (a) =>
      a.p_dry_run === false ? { data: null, error: { message: "Failed to fetch" } } : { data: receiveResult(a), error: null };
    const first = renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: /Receber tudo/ }));
    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    const reqId = String(realCalls()[0].args.p_request_id);
    expect(await within(dlg).findByText(/sem resposta do servidor/)).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(pendingKey) ?? "[]") as { requestId: string; state: string }[];
      expect(saved).toEqual([expect.objectContaining({ requestId: reqId, state: "unknown" })]);
    });

    // Voltar ao ecrã (nova montagem): a pendente aparece em "Receção por confirmar".
    // Uma só chamada real (a recuperação é que repete, com o mesmo id).
    expect(realCalls()).toHaveLength(1);
    first.unmount();
    rpcHandlers.rpc_receive_by_code = (a) => ({ data: receiveResult(a), error: null });
    renderPage();
    const card = await screen.findByText("Receção por confirmar (1)", {}, { timeout: 4000 });
    const cardRoot = card.closest("div.rounded-lg, .border-amber-500\\/60") ?? document.body;
    fireEvent.click(within(cardRoot as HTMLElement).getAllByRole("button", { name: /Tentar de novo/ })[0]);
    await waitFor(() => expect(realCalls()).toHaveLength(2));
    expect(realCalls()[1].args.p_request_id).toBe(reqId);
    await waitFor(() => expect(window.localStorage.getItem(pendingKey)).toBeNull());
  });

  it("guia com avisos: pede 'Confirmo que recebo mesmo assim' antes de enviar, com p_delivery_note_id", async () => {
    db.supplier_delivery_notes = [{ id: "nota-1", note_number: "GR 1", document_date: null, supplier_id: "sup-1", status: "open" }];
    rpcHandlers.rpc_receive_by_code = (a) => ({
      data: receiveResult(a, a.p_delivery_note_id ? { delivery_note_checks: ["nao_consta_da_guia"] } : {}),
      error: null,
    });
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    const guia = within(dlg).getByLabelText("Guia do fornecedor (opcional)");
    await waitFor(() => expect(within(guia).getByRole("option", { name: "GR 1" })).toBeInTheDocument());
    fireEvent.change(guia, { target: { value: "nota-1" } });
    fireEvent.click(within(dlg).getByRole("button", { name: /Receber tudo/ }));

    const ack = await within(dlg).findByRole("checkbox", {}, { timeout: 4000 });
    expect(within(dlg).getByText(/Não consta da guia/)).toBeInTheDocument();
    expect(within(dlg).getByRole("button", { name: "Confirme os avisos da guia" })).toBeDisabled();
    expect(realCalls()).toHaveLength(0);
    fireEvent.click(ack);
    fireEvent.click(await within(dlg).findByRole("button", { name: "Confirmar entrada" }));
    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    expect(realCalls()[0].args).toMatchObject({ p_delivery_note_id: "nota-1", p_purchase_order_item_id: "poi-1" });
  });

  it("cesto do leitor com outro fornecedor: o Dar entrada recusa e não chama a RPC", async () => {
    rpcHandlers.rpc_receiving_lookup = () => ({
      data: {
        found: true,
        code: "ABC",
        can_receive: true,
        warnings: [],
        candidates: [
          {
            product_id: "prod-9",
            name: "Torneira",
            sku: "T-9",
            barcode: null,
            matched_by: "sku",
            uom_id: null,
            uom_code: null,
            units_per_uom: 1,
            open_lines: [
              { purchase_order_id: "po-9", order_number: "PO-0900", po_status: "ordered", confirmed: true, supplier_id: "sup-2", supplier_name: "Alfa", expected_delivery: null, purchase_order_item_id: "poi-9", description: "Torneira", quantity: 3, received_quantity: 0, open_quantity: 3, uom_id: null, units_per_uom: 1, same_unit: true, contract_id: null, contract_order_number: null, contract_active: false, allocation_rank: 1 },
            ],
          },
        ],
      },
      error: null,
    });
    renderPage("/receiving?vista=leitor");
    await waitScreenReady();
    // Regressão do leitor: ler um código mete-o no cesto.
    const campo = await screen.findByLabelText("Código lido");
    await waitFor(() => expect(campo).not.toBeDisabled());
    fireEvent.change(campo, { target: { value: "ABC" } });
    fireEvent.submit(campo.closest("form") as HTMLFormElement);
    expect((await screen.findAllByText("Torneira")).length).toBeGreaterThan(0);
    expect(rpcCalls.some((c) => c.name === "rpc_receiving_lookup" && c.args.p_code === "ABC")).toBe(true);

    // Para a lista e Dar entrada numa PO de outro fornecedor.
    fireEvent.click(screen.getByRole("button", { name: "Encomendas por receber" }));
    expect(await screen.findByText(/O cesto do leitor tem 1 entrada por confirmar/)).toBeInTheDocument();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: /Receber tudo/ }));
    expect(await within(dlg).findByText(/O cesto do leitor tem entradas de outro fornecedor/)).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(rpcCalls.filter((c) => c.name === "rpc_receive_by_code" && c.args.p_purchase_order_item_id === "poi-1")).toHaveLength(0);
  });

  it("modo consulta: sem as permissões de receção o painel não recebe", async () => {
    perms = new Set(["receiving.view", "purchase_orders.view"]);
    renderPage();
    const btn = await screen.findAllByRole("button", { name: "Dar entrada PO-0146" });
    expect(btn[0]).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(btn[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("não vou receber o resto: chama rpc_cancel_po_remainder com o motivo", async () => {
    rpcHandlers.rpc_cancel_po_remainder = () => ({ data: { status: "partially_received", lines_cancelled: 1 }, error: null });
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: "Veio diferente? Conferir linha a linha" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Não vou receber o resto" }));
    const cancel = await screen.findByRole("dialog", { name: /Não vou receber o resto — PO-0146/ });
    fireEvent.click(within(cancel).getByLabelText("Fornecedor sem produto"));
    fireEvent.click(within(cancel).getByRole("button", { name: "Anular resto" }));
    await waitFor(() =>
      expect(rpcCalls.find((c) => c.name === "rpc_cancel_po_remainder")?.args).toEqual({
        p_purchase_order_id: "po-1",
        p_reason: "supplier_unavailable",
        p_notes: null,
      }),
    );
  });
});

describe("Receção · Dar entrada: robustez (revisão)", () => {
  it("em StrictMode cada linha tem uma só chamada real (p_dry_run:false)", async () => {
    db.purchase_orders = [poRow({ extraLine: true })];
    renderPage("/receiving", true);
    await waitScreenReady();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: /Receber tudo · 13 un/ }));
    await waitFor(() => expect(realCalls()).toHaveLength(2), { timeout: 4000 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    const porLinha = realCalls().map((c) => c.args.p_purchase_order_item_id).sort();
    expect(porLinha).toEqual(["poi-1", "poi-2"]);
    expect(new Set(realCalls().map((c) => c.args.p_request_id)).size).toBe(2);
  });

  it("duplo clique em Receber tudo: uma só entrada no cesto e uma só chamada real", async () => {
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    const b = within(dlg).getByRole("button", { name: /Receber tudo/ });
    fireEvent.click(b);
    fireEvent.click(b);
    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(realCalls()).toHaveLength(1);
  });

  it("uma exceção dentro do envio não prende o painel em 'A receber…'", async () => {
    toast.mockImplementation((t: { title?: string }) => {
      if (t?.title === "Receção registada") throw new Error("toast partiu");
    });
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: /Receber tudo/ }));
    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    expect(await within(dlg).findByText(/Entrou no Armazém Central/)).toBeInTheDocument();
    expect(within(dlg).queryByText("A receber…")).toBeNull();
    expect(within(dlg).getByRole("button", { name: "Concluir" })).toBeInTheDocument();
  });

  it("logo depois de receber, 'Ainda falta' desconta o que entrou (antes de a lista recarregar)", async () => {
    db.purchase_orders = [poRow({ quantity: 3 })];
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: "Veio diferente? Conferir linha a linha" }));
    fireEvent.change(within(dlg).getByLabelText("Dar entrada: Base duche"), { target: { value: "2" } });
    // A lista fica a recarregar (presa) a partir daqui.
    let soltar: () => void = () => {};
    gates.purchase_orders = new Promise<void>((r) => {
      soltar = r;
    });
    fireEvent.click(within(dlg).getByRole("button", { name: /Confirmar entrada · 10 un/ }));
    await waitFor(() => expect(realCalls()).toHaveLength(1), { timeout: 4000 });
    expect(await within(dlg).findByText(/Ainda falta 5 un · 1 linha nesta encomenda\./)).toBeInTheDocument();
    expect(within(dlg).queryByText(/Ainda falta 15 un/)).toBeNull();
    // Chega a lista nova: continua certo.
    db.purchase_orders = [poRow({ quantity: 3, received: 2 })];
    await act(async () => {
      soltar();
      gates.purchase_orders = undefined;
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await within(dlg).findByText(/Ainda falta 5 un · 1 linha nesta encomenda\./)).toBeInTheDocument();
  });

  it("decimais: '1,5' não vira '15' e a receção pelo cesto pede inteiros", async () => {
    renderPage();
    await waitScreenReady();
    const dlg = await openPanel();
    fireEvent.click(within(dlg).getByRole("button", { name: "Veio diferente? Conferir linha a linha" }));
    const campo = within(dlg).getByLabelText("Dar entrada: Base duche");
    fireEvent.change(campo, { target: { value: "1,5" } });
    expect(campo).toHaveValue("1,5");
    fireEvent.click(within(dlg).getByRole("button", { name: /Confirmar entrada/ }));
    expect(await within(dlg).findByText(/Quantidades inteiras: Base duche/)).toBeInTheDocument();
    expect(rpcCalls.filter((c) => c.name === "rpc_receive_by_code")).toHaveLength(0);
  });

  it("sem purchase_orders.view abre no leitor (não numa lista vazia)", async () => {
    perms = new Set(["receiving.view", "receiving.receive", "purchase_orders.receive", "inventory.edit"]);
    renderPage();
    expect(await screen.findByLabelText("Código lido")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ler ou escrever: nº PO, guia, fornecedor, EAN/SKU")).toBeNull();
  });

  it("na lista, uma leitura de pistola fora da barra vai para a barra de leitura (não se perde)", async () => {
    renderPage();
    await waitScreenReady();
    await screen.findAllByRole("button", { name: "Dar entrada PO-0146" });
    // No jsdom o campo escondido do leitor pode ter o foco (num browser, display:none não o recebe).
    (document.activeElement as HTMLElement | null)?.blur();
    for (const ch of "PO-0146") fireEvent.keyDown(document.body, { key: ch });
    fireEvent.keyDown(document.body, { key: "Enter" });
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Dar entrada · PO-0146")).toBeInTheDocument();
    expect(rpcCalls.some((c) => c.name === "rpc_receiving_lookup")).toBe(false);
  });
});
