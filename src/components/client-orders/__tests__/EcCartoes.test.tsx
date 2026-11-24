// "Saídas para clientes" (ClientOrders.tsx) dentro e fora da moldura do novo Inventário: fora, a tabela clássica e o
// cabeçalho de sempre; dentro (InventarioEmbebido = true), os cartões por secção de urgência do artefacto, com os
// mesmos dados, a mesma folha, o mesmo ⋯ (permissões), os chips a filtrar no servidor e o alternador para a tabela.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";
import { ecSeccaoDe } from "../EcCartoes";

// ── Supabase: as RPCs que o ecrã já chama; o resto vem vazio ───────────────
const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  readiness: [] as Array<Record<string, unknown>>,
  deletable: [] as string[],
  detail: null as Record<string, unknown> | null,
  calls: [] as Array<{ nome: string; args: Record<string, unknown> }>,
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (): unknown => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "is", "in", "order", "limit", "range", "gte", "lte", "not", "or", "ilike", "filter"]) c[k] = () => c;
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.single = () => Promise.resolve({ data: null, error: null });
    c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
    return c;
  };
  const rpc = (nome: string, args: Record<string, unknown> = {}) => {
    db.calls.push({ nome, args });
    if (nome === "rpc_list_client_order_documents") {
      const st = args.p_status_filter as string | null;
      const off = Number(args.p_offset ?? 0);
      const data = off > 0 ? [] : db.rows.filter((r) => !st || r.overall_status === st);
      return Promise.resolve({ data, error: null });
    }
    if (nome === "rpc_client_order_list_readiness") return Promise.resolve({ data: db.readiness, error: null });
    if (nome === "rpc_client_orders_can_delete") return Promise.resolve({ data: db.deletable, error: null });
    if (nome === "rpc_get_client_order_document") return Promise.resolve({ data: db.detail, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  return { supabase: { from: () => chain(), rpc } };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1", name: "Mudelar" }, isLoading: false }) }));
const perms = vi.hoisted(() => ({ codes: new Set<string>() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    loading: false,
    permissions: [...perms.codes],
    hasPermission: (c: string) => perms.codes.has(c),
    hasAnyPermission: (l: string[]) => l.some((c) => perms.codes.has(c)),
  }),
}));
const PT: Record<string, string> = {
  "clientOrders.status.totallyServed": "Totalmente servido",
  "clientOrders.status.partiallyPending": "Parcialmente pendente",
  "clientOrders.status.awaitingOrder": "A aguardar encomenda",
  "clientOrders.status.noSupplier": "Sem fornecedor",
  "clientOrders.loading": "A carregar…",
  "clientOrders.dialog.noLines": "Sem linhas",
};
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => PT[k] ?? k, language: "pt" }) }));
vi.mock("@/hooks/useInventoryToday", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: null, isLoading: false }),
}));
vi.mock("@/components/client-orders/useClientOrderLinePhases", () => ({ useClientOrderLinePhases: () => null }));
vi.mock("@/components/client-orders/useClientOrderPoStates", () => ({ useClientOrderPoStates: () => ({}) }));
vi.mock("@/components/client-orders/ClientOrderHistorySection", () => ({ ClientOrderHistorySection: () => null }));
// Peças pesadas que estes testes não abrem.
vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: async () => new Blob() }) }));
vi.mock("@/components/ClientOrderDocumentPDF", () => ({ ClientOrderDocumentPDF: () => null }));
vi.mock("@/components/quote/AddItemsDialog", () => ({ AddItemsDialog: () => null }));
vi.mock("@/components/EntitySearchInput", () => ({ EntitySearchInput: () => null }));
vi.mock("@/utils/generateProformaPdfBlob", () => ({ generateProformaPdfBlob: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/components/clients/DeliveryAddressForm", () => ({ DeliveryAddressForm: () => null }));

import ClientOrders from "@/pages/ClientOrders";

const row = (id: string, n: string, cliente: string, status: string, extra: Record<string, unknown> = {}) => ({
  contract_id: id,
  contract_number: `CT-${n}`,
  order_number: `EC-000${n}`,
  origin_type: "contract",
  origin_number: `CT-${n}`,
  client_name: cliente,
  signature_date: `2026-11-${10 + Number(n)}T10:00:00Z`,
  total_lines: 3,
  lines_from_stock: 0,
  lines_awaiting_order: 0,
  lines_received: 0,
  lines_no_supplier: 0,
  lines_service: 0,
  overall_status: status,
  delivery_address: `Rua ${n}, Coimbra`,
  ...extra,
});
const ready = (id: string, extra: Record<string, unknown> = {}) => ({
  contract_id: id,
  lines_ready: 0,
  units_ready: 0,
  units_in_stock_reserved: 0,
  units_on_po: 0,
  units_missing: 0,
  units_served: 0,
  units_received: 0,
  units_needed: 0,
  is_ready: false,
  ec_warehouse_id: null,
  ec_plan: null,
  reserved_warehouse_ids: [],
  ...extra,
});

function Local() {
  const l = useLocation();
  return <output data-testid="local">{l.pathname + l.search}</output>;
}

function montar(embebido: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/inventory/novo/saidas"]}>
        <InventarioEmbebido.Provider value={embebido}>
          <Routes>
            <Route path="*" element={<><ClientOrders /><Local /></>} />
          </Routes>
        </InventarioEmbebido.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  prepararRadixNoJsdom();
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
});

beforeEach(() => {
  db.calls = [];
  db.deletable = [];
  perms.codes = new Set(["client_orders.view", "client_orders.create", "client_contracts.view"]);
  // A RPC devolve a mais recente primeiro: as secções têm de reordenar por urgência.
  db.rows = [
    row("c5", "5", "Sara Lopes", "totalmente_servido", { origin_type: "direct_sale", origin_number: "VD-0009", lines_from_stock: 3 }),
    row("c4", "4", "Rui Mota", "a_aguardar_encomenda", { origin_type: "manual", origin_number: null, lines_awaiting_order: 3 }),
    row("c3", "3", "Ana Costa", "totalmente_servido", { lines_from_stock: 1, lines_received: 0 }),
    row("c2", "2", "João Ferreira", "parcialmente_pendente", { lines_from_stock: 1, lines_awaiting_order: 2 }),
    row("c1", "1", "Maria Silva", "sem_fornecedor", { lines_no_supplier: 1, lines_awaiting_order: 1, lines_from_stock: 1 }),
  ];
  db.readiness = [
    ready("c3", { is_ready: true, lines_ready: 2, ec_plan: "single", units_served: 1, units_in_stock_reserved: 3 }),
    ready("c2", { lines_ready: 1, ec_plan: "split", units_served: 2, units_on_po: 2 }),
    ready("c1", { ec_plan: "partial", units_missing: 4 }),
  ];
  db.detail = {
    contract_id: "c1",
    contract_number: "CT-1",
    order_number: "EC-0001",
    origin_type: "contract",
    origin_number: "CT-1",
    client_name: "Maria Silva",
    signature_date: "2026-11-11T10:00:00Z",
    total_value: 1234.5,
    delivery_address: "Rua 1, Coimbra",
    notes: "Entregar de manhã",
    ec_warehouse_name: "Coimbra",
    ec_plan: "partial",
    is_editable: false,
    can_edit_header: true,
    can_request_missing: false,
    missing_lines_count: 0,
    lines: [
      {
        quote_line_id: "q1", item_type: "product", product_id: "p1", product_name: "Base de duche 120×80", product_sku: "BDU-12080",
        service_id: null, service_name: null, service_sku: null, quantity: 1, line_status: "a_aguardar_encomenda",
        stock_movement_id: null, purchase_order_id: "po-77", purchase_order_number: "PO-2026-0077", available_warehouses: [],
        qty_ordered: 1, qty_served: 0, qty_reserved: 0,
      },
      {
        quote_line_id: "q2", item_type: "service", product_id: null, product_name: null, product_sku: null,
        service_id: "s1", service_name: "Montagem", service_sku: "SRV-1", quantity: 2, line_status: "servico",
        stock_movement_id: null, purchase_order_id: null, purchase_order_number: null, available_warehouses: null,
      },
    ],
  };
});
afterEach(cleanup);

const secoes = () => screen.getAllByRole("region").map((s) => s.getAttribute("aria-label"));

describe("ecSeccaoDe", () => {
  it("pronta a expedir passa à frente do estado geral; com filtro, vale o filtro", () => {
    expect(ecSeccaoDe({ overall_status: "totalmente_servido" }, { is_ready: true })).toBe("ready");
    expect(ecSeccaoDe({ overall_status: "sem_fornecedor" }, { is_ready: false })).toBe("sem_fornecedor");
    expect(ecSeccaoDe({ overall_status: "x" }, null)).toBe("parcialmente_pendente");
    expect(ecSeccaoDe({ overall_status: "totalmente_servido" }, { is_ready: true }, { statusFilter: "totalmente_servido", readyActive: false })).toBe("totalmente_servido");
    expect(ecSeccaoDe({ overall_status: "sem_fornecedor" }, null, { statusFilter: "all", readyActive: true })).toBe("ready");
  });
});

describe("Saídas para clientes · fora da moldura", () => {
  it("fica a tabela clássica e o cabeçalho, sem cartões nem barra nova", async () => {
    montar(false);
    expect(await screen.findByRole("cell", { name: "Maria Silva" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Saídas para clientes" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("ec-cartao")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Vista" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filtros/ })).not.toBeInTheDocument();
  });
});

describe("Saídas para clientes · dentro da moldura", () => {
  it("sem o cabeçalho clássico nem a tabela; secções pela ordem de urgência", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    expect(screen.queryByRole("heading", { name: "Saídas para clientes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(secoes()).toEqual([
      "Sem fornecedor (1)",
      "Parcialmente pendente (1)",
      "Prontas a expedir (1)",
      "A aguardar encomenda (1)",
      "Totalmente servido (1)",
    ]);
    // Pesquisa, Filtros, Exportar e Nova encomenda manual na barra.
    expect(screen.getByRole("searchbox", { name: "Pesquisar encomendas clientes" })).toHaveAttribute("placeholder", "Nº EC, contrato, VD ou cliente");
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nova encomenda manual/ })).toBeInTheDocument();
  });

  it("cada cartão mostra cliente, EC · origem, pílula, morada, plano, progresso e contagens", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    const prontas = screen.getByRole("region", { name: "Prontas a expedir (1)" });
    const cartao = within(prontas).getByTestId("ec-cartao");
    expect(within(cartao).getByRole("button", { name: "Abrir EC-0003 · Ana Costa" })).toHaveTextContent("Ana Costa");
    expect(cartao).toHaveTextContent("EC-0003 · Contrato CT-3");
    expect(cartao).toHaveTextContent("Pronta a sair");
    expect(cartao).toHaveTextContent("Rua 3, Coimbra");
    expect(cartao).toHaveTextContent("Tudo de um só armazém");
    expect(within(cartao).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(cartao).toHaveTextContent("2 prontos · 1 servidos · 3 linhas");

    const vd = within(screen.getByRole("region", { name: "Totalmente servido (1)" })).getByTestId("ec-cartao");
    expect(vd).toHaveTextContent("EC-0005 · Venda direta VD-0009");
    expect(vd).toHaveTextContent("Entregue");
    const manual = within(screen.getByRole("region", { name: "A aguardar encomenda (1)" })).getByTestId("ec-cartao");
    expect(manual).toHaveTextContent("EC-0004 · Manual");
    expect(manual).toHaveTextContent("À espera do fornecedor");
    const parcial = within(screen.getByRole("region", { name: "Parcialmente pendente (1)" })).getByTestId("ec-cartao");
    expect(parcial).toHaveTextContent("1 pronta(s) a sair");
    expect(parcial).toHaveTextContent("Repartida por armazéns");
  });

  it("o estado geral real fica à vista no cartão quando a pílula não o diz (sem title debaixo do botão do cartão)", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    const pronta = within(screen.getByRole("region", { name: "Prontas a expedir (1)" })).getByTestId("ec-cartao");
    expect(within(pronta).getByTestId("ec-cartao-estado-geral")).toHaveTextContent("Estado geral: Totalmente servido");
    const parcial = within(screen.getByRole("region", { name: "Parcialmente pendente (1)" })).getByTestId("ec-cartao");
    expect(within(parcial).getByTestId("ec-cartao-estado-geral")).toHaveTextContent("Estado geral: Parcialmente pendente");
    // A pílula já diz o estado: sem a linha.
    const semForn = within(screen.getByRole("region", { name: "Sem fornecedor (1)" })).getByTestId("ec-cartao");
    expect(within(semForn).queryByTestId("ec-cartao-estado-geral")).toBeNull();
    for (const c of screen.getAllByTestId("ec-cartao")) expect(c.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("as prontas que vivem noutra secção têm nota, para as contagens baterem com os chips", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    // Sem filtro: a c3 (Totalmente servido) passou para Prontas a expedir.
    const servido = screen.getByRole("region", { name: "Totalmente servido (1)" });
    expect(within(servido).getByTestId("ec-seccao-nota")).toHaveTextContent("· mais 1 em Prontas a expedir");
    expect(within(screen.getByRole("region", { name: "Prontas a expedir (1)" })).queryByTestId("ec-seccao-nota")).toBeNull();
    cleanup();

    // Com o filtro "Totalmente servido": a c3 fica nessa secção e a nota diz que está pronta a expedir.
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    fireEvent.click(await within(screen.getByRole("group", { name: "Estado" })).findByRole("button", { name: /^Totalmente servido/ }));
    await waitFor(() => expect(secoes()).toEqual(["Totalmente servido (2)"]));
    expect(within(screen.getByRole("region", { name: "Totalmente servido (2)" })).getByTestId("ec-seccao-nota")).toHaveTextContent("· 1 pronta a expedir");
  });

  it("clicar no cartão abre a folha clássica da EC, com os pares e as linhas em cartões; À espera · PO leva à PO", async () => {
    montar(true);
    const abrir = await screen.findByRole("button", { name: "Abrir EC-0001 · Maria Silva" });
    fireEvent.click(abrir);
    await waitFor(() => expect(db.calls.some((c) => c.nome === "rpc_get_client_order_document" && c.args.p_contract_id === "c1")).toBe(true));
    const folha = await screen.findByRole("dialog");
    await within(folha).findByText("Base de duche 120×80");
    const kv = within(folha).getAllByRole("term").map((d) => d.textContent);
    expect(kv).toEqual(["Cliente", "Morada", "Armazém", "Data", "Valor", "Notas"]);
    expect(folha).toHaveTextContent("Entregar de manhã");
    expect(within(folha).getByRole("region", { name: "Produtos (1)" })).toBeInTheDocument();
    expect(within(folha).getByRole("region", { name: "Serviços (1)" })).toBeInTheDocument();
    expect(within(folha).getAllByTestId("ec-folha-linha")).toHaveLength(2);
    // As ações da folha continuam: Confirmar saída no rodapé, bloqueado com o motivo (sem permissões de saída).
    expect(within(folha).getByRole("button", { name: /Confirmar saída \(0\)/ })).toBeInTheDocument();
    fireEvent.click(within(folha).getByRole("button", { name: /À espera · PO-2026-0077/ }));
    // (o ?open= é lido e limpo pelo próprio ClientOrders, que neste teste continua montado na rota "*").
    await waitFor(() => expect(screen.getByTestId("local").textContent).toMatch(/^\/purchase-orders\?.*product=p1&quote_line=q1/));
  });

  it("o ⋯ do cartão tem as mesmas ações e respeita as permissões", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    const manual = within(screen.getByRole("region", { name: "A aguardar encomenda (1)" })).getByTestId("ec-cartao");
    fireEvent.keyDown(within(manual).getByRole("button", { name: "Mais ações para EC-0004" }), { key: "Enter" });
    let menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /^Abrir detalhe/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^PDF/ })).toBeInTheDocument();
    // Compacto: "Ver" e "PDF" diretos não são renderizados no cartão (nem escondidos por CSS).
    expect(within(manual).queryByRole("button", { name: "Ver EC-0004", hidden: true })).toBeNull();
    expect(within(manual).queryByRole("button", { name: "PDF de EC-0004", hidden: true })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: /^Editar/ })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: /^Eliminar/ })).toHaveAttribute("aria-disabled", "true");
    expect(db.calls.some((c) => c.nome === "rpc_get_client_order_document")).toBe(false);
    cleanup();

    perms.codes = new Set(["client_orders.view", "client_orders.edit", "client_orders.delete"]);
    db.deletable = ["c4"];
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    const manual2 = within(screen.getByRole("region", { name: "A aguardar encomenda (1)" })).getByTestId("ec-cartao");
    await waitFor(() => expect(db.calls.some((c) => c.nome === "rpc_client_orders_can_delete")).toBe(true));
    fireEvent.keyDown(within(manual2).getByRole("button", { name: "Mais ações para EC-0004" }), { key: "Enter" });
    menu = await screen.findByRole("menu");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /^Eliminar/ })).not.toHaveAttribute("aria-disabled", "true"));
    expect(within(menu).getByRole("menuitem", { name: /^Editar/ })).not.toHaveAttribute("aria-disabled", "true");
    // Sem client_orders.create não há "Nova encomenda manual" (o mesmo PermissionGate).
    expect(screen.queryByRole("button", { name: /Nova encomenda manual/ })).not.toBeInTheDocument();
  });

  it("os chips filtram pelo servidor e mostram a contagem", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    const estado = screen.getByRole("group", { name: "Estado" });
    const chip = await within(estado).findByRole("button", { name: /^Sem fornecedor\s*1$/ });
    expect(within(estado).getByRole("button", { name: /^Todas\s*5$/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    await waitFor(() =>
      expect(db.calls.some((c) => c.nome === "rpc_list_client_order_documents" && c.args.p_status_filter === "sem_fornecedor" && c.args.p_limit === 30)).toBe(true),
    );
    await waitFor(() => expect(screen.getAllByTestId("ec-cartao")).toHaveLength(1));
    expect(secoes()).toEqual(["Sem fornecedor (1)"]);
    expect(within(estado).getByRole("button", { name: /^Sem fornecedor/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("Tabela mostra a tabela clássica tal como está; Cartões volta", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Maria Silva" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("ec-cartao")).toHaveLength(0);
    // Na tabela, "Ver" e "PDF" diretos continuam (compact só nos cartões).
    expect(screen.getByRole("button", { name: "Ver EC-0004" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF de EC-0004" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("ec-cartao")).toHaveLength(5);
  });

  it("Filtros tem De/Até, Ver eliminadas e Origem", async () => {
    montar(true);
    await screen.findAllByTestId("ec-cartao");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByLabelText("clientOrders.filters.dateFrom")).toBeInTheDocument();
    expect(within(dlg).getByLabelText("clientOrders.filters.dateTo")).toBeInTheDocument();
    expect(within(dlg).getByRole("checkbox")).not.toBeDisabled();
    fireEvent.click(within(dlg).getByRole("button", { name: "Encomendas manuais" }));
    await waitFor(() => expect(screen.getByTestId("local").textContent).toContain("origin=manual"));
  });

  it("estado vazio igual ao da tabela", async () => {
    db.rows = [];
    db.readiness = [];
    montar(true);
    expect(await screen.findByText("Sem encomendas com estes filtros")).toBeInTheDocument();
  });
});
