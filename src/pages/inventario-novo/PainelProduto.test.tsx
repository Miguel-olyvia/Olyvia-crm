// O painel do produto (fatia 2): os números de Livre/Na prateleira/Reservado e a fila FIFO a partir das mesmas leituras do
// Stocks.tsx, o bloqueio de "Registar movimento" sem inventory.edit, o Esc e o Fechar, e o endereço (?painel=produto:<id>).
// Revisão: o ecrã embebido recarrega depois de um movimento no painel, o produto é lido só da organização ativa e o foco
// volta a quem abriu o painel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";

const LINHAS_STOCK = [
  { id: "s1", product_id: "p1", warehouse_id: "w1", quantity: 10, minimum_quantity: 2, maximum_quantity: 20, reorder_point: 5, location: "A1",
    warehouses: { name: "Central" }, products: { name: "Torneira X", sku: "TX-1", barcode: "5601234" } },
  { id: "s2", product_id: "p1", warehouse_id: "w2", quantity: 4, minimum_quantity: 0, maximum_quantity: 0, reorder_point: 0, location: null,
    warehouses: { name: "Porto" }, products: { name: "Torneira X", sku: "TX-1", barcode: "5601234" } },
];
const DADOS: Record<string, unknown> = {
  products: { id: "p1", organization_id: "org-1", name: "Torneira X", sku: "TX-1", barcode: "5601234" },
  stocks: LINHAS_STOCK,
  stock_movements: [
    { id: "m1", movement_type: "saida", quantity: 2, balance_after: 10, document_number: "EC-0042", warehouse_id: "w1", created_at: "2026-11-20T10:00:00Z" },
    { id: "m2", movement_type: "entrada", quantity: 12, balance_after: 12, document_number: "PO-0007", warehouse_id: "w1", created_at: "2026-11-18T10:00:00Z" },
  ],
  warehouses: [{ id: "w1", name: "Central" }, { id: "w2", name: "Porto" }],
};
const pedidos: Array<{ tabela: string; chamadas: Array<[string, unknown[]]> }> = [];
const rpc = vi.fn(async (_nome: string, _args: unknown) => ({
  data: [{ product_id: "p1", qty_reserved: 6, qty_missing: 3, orders_count: 2 }],
  error: null,
}));
vi.mock("@/integrations/supabase/client", () => {
  const from = (tabela: string) => {
    const registo = { tabela, chamadas: [] as Array<[string, unknown[]]> };
    pedidos.push(registo);
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit", "in", "range", "or", "not"]) {
      chain[k] = (...a: unknown[]) => { registo.chamadas.push([k, a]); return chain; };
    }
    const d = DADOS[tabela] ?? [];
    // Um registo: aplica os .eq() às colunas que o registo tem (o produto de outra organização não vem).
    chain.maybeSingle = () => {
      let v: unknown = d;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, a] of registo.chamadas) {
          const col = a[0] as string;
          if (k === "eq" && col in (v as Record<string, unknown>) && (v as Record<string, unknown>)[col] !== a[1]) v = null;
          if (v === null) break;
        }
      }
      return Promise.resolve({ data: v, error: null });
    };
    chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: d, error: null }).then(ok, ko);
    return chain;
  };
  return { supabase: { from, rpc: (nome: string, args: unknown) => rpc(nome, args) } };
});
let orgAtiva = "org-1";
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: orgAtiva, name: "Grupo BMLar" }, isLoading: false }) }));
let perms = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => perms.has(p)),
    loading: false,
  }),
}));
vi.mock("@/hooks/useInventoryToday", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("@/components/receiving/useReceivablePos", async (orig) => ({
  ...(await orig<typeof import("@/components/receiving/useReceivablePos")>()),
  useReceivablePos: () => ({ data: [], refetch: vi.fn() }),
}));
const dialogoProps = vi.fn();
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: (props: { open: boolean; defaultProductId?: string; defaultWarehouseId?: string }) => {
    dialogoProps(props);
    return props.open ? <div role="dialog" data-state="open" aria-label="Diálogo de movimento">diálogo</div> : null;
  },
}));
vi.mock("@/pages/InventoryToday", () => ({ default: () => <p>Hoje clássico</p> }));
vi.mock("@/pages/PurchaseOrders", () => ({ default: () => <p>Encomendas clássico</p> }));
vi.mock("@/pages/Suppliers", () => ({ default: () => <p>Fornecedores clássico</p> }));
vi.mock("@/pages/Receiving", () => ({ default: () => <p>Receção clássico</p> }));
// Cada montagem do ecrã clássico tem um número: muda quando a moldura o recarrega (key com a versão).
let montagensStocks = 0;
vi.mock("@/pages/Stocks", async () => {
  const { useState: usarEstado } = await import("react");
  return {
    default: () => {
      const [n] = usarEstado(() => ++montagensStocks);
      return <p data-testid="stocks-classico" data-montagem={n}>Existências clássico</p>;
    },
  };
});
vi.mock("@/pages/StockMovements", () => ({ default: () => <p>Movimentos clássico</p> }));
vi.mock("@/pages/StockCounts", () => ({ default: () => <p>Contagens clássico</p> }));
vi.mock("@/pages/Warehouses", () => ({ default: () => <p>Armazéns clássico</p> }));
vi.mock("@/pages/ClientOrders", () => ({ default: () => <p>Saídas clássico</p> }));

import { PainelProduto, numerosDoProduto, escFechaPainel } from "./PainelProduto";
import { produtoDoPainel, usePainelProduto } from "./painelUrl";
import InventarioNovo from "./InventarioNovo";

afterEach(cleanup);

const TODAS = ["inventory.view", "inventory.edit", "client_orders.view", "receiving.view", "purchase_orders.view"];

function Onde() {
  const l = useLocation();
  return <p data-testid="onde">{decodeURIComponent(l.pathname + l.search)}</p>;
}

/** Um ecrã mínimo com o painel no endereço, como na moldura. */
function Ecra() {
  const [id, abrir, fechar] = usePainelProduto();
  return (
    <div>
      <button type="button" onClick={() => abrir("p1")}>Ver Torneira X</button>
      {id && <PainelProduto produtoId={id} fechar={fechar} />}
    </div>
  );
}

let qcAtual: QueryClient;
function montar(el: ReactElement, em = "/inventory/novo/existencias") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qcAtual = qc;
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[em]}>
        <Routes>
          <Route path="/inventory/novo/:aba?" element={el} />
          <Route path="*" element={<p>outra página</p>} />
        </Routes>
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const numero = (rotulo: string) => screen.getByTestId(`numero-${rotulo}`).textContent;

describe("o painel do produto", () => {
  beforeEach(() => { perms = new Set(TODAS); orgAtiva = "org-1"; pedidos.length = 0; rpc.mockClear(); dialogoProps.mockClear(); });

  it("numerosDoProduto: livre = stock da organização − reservado (a regra do Stocks.tsx)", () => {
    const L = [
      { id: "a", warehouse_id: "w1", armazem: "A", quantity: 1.1, minimum_quantity: 0, maximum_quantity: 0, reorder_point: 0, location: null },
      { id: "b", warehouse_id: "w2", armazem: "B", quantity: 2.2, minimum_quantity: 0, maximum_quantity: 0, reorder_point: 0, location: null },
    ];
    expect(numerosDoProduto(L, { qty_reserved: 5, qty_missing: 1, orders_count: 2 })).toEqual({ prateleira: 3.3, reservado: 5, livre: -1.7, emFalta: 1, encomendas: 2 });
    expect(numerosDoProduto(L, null).livre).toBe(3.3);
  });

  it("mostra Livre, Na prateleira, Reservado, os limites por armazém, a fila FIFO e os últimos movimentos", async () => {
    montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    expect(screen.getByText("SKU TX-1 · EAN 5601234")).toBeInTheDocument();
    await waitFor(() => expect(numero("Livre")).toBe("8"));
    expect(numero("Na prateleira")).toBe("14");
    expect(numero("Reservado")).toBe("6");
    // a mesma RPC do Stocks.tsx, com o mesmo formato de parâmetros, só para este produto
    expect(rpc).toHaveBeenCalledWith("rpc_get_product_stock_reservations", { p_organization_id: "org-1", p_product_ids: ["p1"] });
    const fila = screen.getByTestId("fila-fifo");
    expect(fila).toHaveTextContent("2 encomendas de cliente à espera");
    expect(fila).toHaveTextContent(/por ordem de assinatura \(a mais antiga primeiro\): 6 reservado · 3 em falta/);
    const armazens = screen.getAllByTestId("linha-armazem");
    expect(armazens.map((a) => within(a).getByText(/^(Central|Porto)$/).textContent)).toEqual(["Central", "Porto"]);
    expect(armazens[0]).toHaveTextContent("Mín. 2 · Máx. 20 · PE 5");
    expect(armazens[1]).toHaveTextContent("Mín. — · Máx. — · PE —");
    expect(await screen.findByText("Saída")).toBeInTheDocument();
    expect(screen.getByText("−2")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    // as leituras: stocks e movimentos só deste produto, da organização ativa; movimentos com limite pequeno
    const stocks = pedidos.find((p) => p.tabela === "stocks")!;
    expect(stocks.chamadas).toEqual(expect.arrayContaining([["eq", ["organization_id", "org-1"]], ["eq", ["product_id", "p1"]], ["is", ["warehouses.deleted_at", null]]]));
    const movs = pedidos.find((p) => p.tabela === "stock_movements")!;
    expect(movs.chamadas).toEqual(expect.arrayContaining([["eq", ["product_id", "p1"]], ["limit", [5]]]));
  });

  it("sem inventory.edit, Registar movimento fica bloqueado com o motivo e não abre o diálogo", async () => {
    perms = new Set(["inventory.view"]);
    montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
    await waitFor(() => expect(numero("Livre")).toBe("8"));
    const b = screen.getByRole("button", { name: /Registar movimento/ });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAccessibleDescription(/Sem permissão/);
    fireEvent.click(b);
    expect(screen.queryByRole("dialog", { name: "Diálogo de movimento" })).toBeNull();
    expect(screen.getByRole("button", { name: "Movimento em Central" })).toHaveAttribute("aria-disabled", "true");
    // Histórico só precisa de inventory.view
    expect(screen.getByRole("button", { name: /Histórico/ })).not.toHaveAttribute("aria-disabled");
  });

  it("com inventory.edit abre o StockMovementDialog com o produto (e o armazém da linha) pré-escolhidos", async () => {
    montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
    await waitFor(() => expect(numero("Livre")).toBe("8"));
    fireEvent.click(screen.getByRole("button", { name: "Movimento em Porto" }));
    expect(screen.getByRole("dialog", { name: "Diálogo de movimento" })).toBeInTheDocument();
    expect(dialogoProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, defaultProductId: "p1", defaultWarehouseId: "w2" }));
  });

  it("Histórico abre o separador Movimentos filtrado pelo produto", async () => {
    montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
    await waitFor(() => expect(numero("Livre")).toBe("8"));
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/movimentos?product=p1");
  });

  it("o endereço: abrir põe ?painel=produto:<id>; o botão Fechar recua; o Esc fecha", async () => {
    montar(<Ecra />, "/inventory/novo/existencias?status=low");
    fireEvent.click(screen.getByRole("button", { name: "Ver Torneira X" }));
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/existencias?status=low&painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/existencias\?status=low$/);

    fireEvent.click(screen.getByRole("button", { name: "Ver Torneira X" }));
    await screen.findByRole("heading", { name: "Torneira X" });
    act(() => { fireEvent.keyDown(document.body, { key: "Escape" }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/existencias\?status=low$/);
  });

  it("aberto pelo endereço (recarregar): Fechar tira o parâmetro sem sair do separador", async () => {
    montar(<Ecra />, "/inventory/novo/existencias?painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/existencias$/));
  });

  it("Esc com um diálogo aberto ou a escrever não fecha o painel", () => {
    const doc = document.implementation.createHTMLDocument("t");
    const ev = (target: EventTarget) => ({ key: "Escape", defaultPrevented: false, target }) as unknown as KeyboardEvent;
    const painel = doc.createElement("aside");
    painel.setAttribute("data-painel-produto", "");
    const botao = doc.createElement("button");
    painel.appendChild(botao);
    doc.body.appendChild(painel);
    expect(escFechaPainel(ev(botao), doc)).toBe(true);
    expect(escFechaPainel(ev(doc.body), doc)).toBe(true);
    const fora = doc.createElement("button");
    doc.body.appendChild(fora);
    expect(escFechaPainel(ev(fora), doc)).toBe(false);
    const input = doc.createElement("input");
    painel.appendChild(input);
    expect(escFechaPainel(ev(input), doc)).toBe(false);
    const dlg = doc.createElement("div");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("data-state", "open");
    doc.body.appendChild(dlg);
    expect(escFechaPainel(ev(botao), doc)).toBe(false);
  });

  it("produtoDoPainel lê só ?painel=produto:<id>", () => {
    expect(produtoDoPainel("produto:abc")).toBe("abc");
    expect(produtoDoPainel("produto:")).toBeNull();
    expect(produtoDoPainel("po:abc")).toBeNull();
    expect(produtoDoPainel(null)).toBeNull();
  });
});

describe("o painel do produto na moldura", () => {
  beforeEach(() => { perms = new Set(TODAS); orgAtiva = "org-1"; pedidos.length = 0; rpc.mockClear(); dialogoProps.mockClear(); });

  it("abre-se pelo «Ver produto» do separador Existências e o endereço fica com ?painel=", async () => {
    montar(<InventarioNovo />);
    expect(await screen.findByText("Existências clássico", undefined, { timeout: 8000 })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Ver produto" }), { target: { value: "Torn" } });
    const r = await screen.findByRole("button", { name: /Torneira X/ }, { timeout: 3000 });
    fireEvent.click(r);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/existencias?painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    // a pesquisa usa a mesma leitura da lista: stocks com o embed products!inner filtrado por nome/SKU/EAN
    const procura = pedidos.find((p) => p.tabela === "stocks" && p.chamadas.some(([k]) => k === "or"))!;
    expect(procura.chamadas).toEqual(expect.arrayContaining([["or", ["name.ilike.%Torn%,sku.ilike.%Torn%,barcode.ilike.%Torn%", { referencedTable: "products" }]]]));
    // com o painel aberto, a barra do polegar sai (o painel tem as suas ações em baixo)
    expect(screen.queryByRole("navigation", { name: "Ações rápidas" })).toBeNull();
  });

  it("noutro separador o ?painel= não abre nada; mudar de separador fecha o painel", async () => {
    montar(<InventarioNovo />, "/inventory/novo/existencias?painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" }, { timeout: 8000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Movimentos/ }));
    expect(await screen.findByText("Movimentos clássico", undefined, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
  });

  it("Esc com o painel aberto fecha o painel e não sai do Inventário", async () => {
    montar(<InventarioNovo />, "/inventory/novo/existencias?painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" }, { timeout: 8000 })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(document.body, { key: "Escape" }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/existencias$/);
  });

  it("um movimento feito no painel recarrega a lista de Existências (a key do ecrã embebido muda)", async () => {
    montar(<InventarioNovo />, "/inventory/novo/existencias?painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" }, { timeout: 8000 })).toBeInTheDocument();
    const antes = Number((await screen.findByTestId("stocks-classico", undefined, { timeout: 8000 })).dataset.montagem);
    await waitFor(() => expect(numero("Livre")).toBe("8"));
    fireEvent.click(screen.getByRole("button", { name: "Movimento em Central" }));
    const props = dialogoProps.mock.calls.at(-1)![0] as { onSuccess: () => void };
    act(() => { props.onSuccess(); });
    await waitFor(() => expect(Number(screen.getByTestId("stocks-classico").dataset.montagem)).toBe(antes + 1));
    // o painel continua aberto
    expect(screen.getByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
  });

  it("Esc + Esc: o primeiro fecha o painel e devolve o foco ao «Ver produto»; o segundo não sai do Inventário", async () => {
    montar(<InventarioNovo />);
    expect(await screen.findByText("Existências clássico", undefined, { timeout: 8000 })).toBeInTheDocument();
    const campo = screen.getByRole("searchbox", { name: "Ver produto" });
    fireEvent.change(campo, { target: { value: "Torn" } });
    const r = await screen.findByRole("button", { name: /Torneira X/ }, { timeout: 3000 });
    r.focus();
    fireEvent.click(r);
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
    // o resultado escolhido já não existe: o foco vai para o campo "Ver produto", não para o body
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Ver produto" }));
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/existencias$/);
  });
});

describe("o painel do produto: revisão", () => {
  beforeEach(() => { perms = new Set(TODAS); orgAtiva = "org-1"; pedidos.length = 0; rpc.mockClear(); dialogoProps.mockClear(); });

  it("depois de um movimento chama aoMudarStock; as leituras refrescam-se ao voltar à janela e de 30 em 30 s", async () => {
    const aoMudarStock = vi.fn();
    montar(<PainelProduto produtoId="p1" fechar={vi.fn()} aoMudarStock={aoMudarStock} />);
    await waitFor(() => expect(numero("Livre")).toBe("8"));
    fireEvent.click(screen.getByRole("button", { name: "Movimento em Porto" }));
    const props = dialogoProps.mock.calls.at(-1)![0] as { onSuccess: () => void };
    act(() => { props.onSuccess(); });
    expect(aoMudarStock).toHaveBeenCalledTimes(1);
    const qs = qcAtual.getQueryCache().findAll({ queryKey: ["inventario-novo-produto", "org-1", "p1"] });
    expect(qs).toHaveLength(4);
    for (const q of qs) {
      expect(q.options).toEqual(expect.objectContaining({ refetchOnWindowFocus: true, refetchInterval: 30000 }));
    }
  });

  it("a ficha do produto é lida só da organização ativa: de outra empresa mostra «não encontrado» e o Fechar", async () => {
    orgAtiva = "org-2";
    const fechar = vi.fn();
    montar(<PainelProduto produtoId="p1" fechar={fechar} />);
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Produto não encontrado nesta empresa");
    const produtos = pedidos.find((p) => p.tabela === "products")!;
    expect(produtos.chamadas).toEqual(expect.arrayContaining([["eq", ["id", "p1"]], ["eq", ["organization_id", "org-2"]]]));
    // sem números nem ações de um produto que não é desta empresa
    expect(screen.queryByTestId("numero-Livre")).toBeNull();
    expect(screen.queryByRole("button", { name: /Registar movimento/ })).toBeNull();
    fireEvent.click(within(alerta).getByRole("button", { name: "Fechar" }));
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it("trocar de empresa com o painel aberto fecha-o", async () => {
    function ComTroca() {
      const [, refazer] = useState(0);
      return (
        <>
          <button type="button" onClick={() => { orgAtiva = "org-2"; refazer((x) => x + 1); }}>Trocar empresa</button>
          <Ecra />
        </>
      );
    }
    montar(<ComTroca />, "/inventory/novo/existencias?painel=produto:p1");
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trocar empresa" }));
    await waitFor(() => expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory\/novo\/existencias$/));
    expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull();
  });

  it("o foco: vai para o painel ao abrir e volta a quem o abriu ao fechar (botão Fechar e Esc)", async () => {
    montar(<Ecra />);
    const abrir = screen.getByRole("button", { name: "Ver Torneira X" });
    abrir.focus();
    fireEvent.click(abrir);
    await screen.findByRole("heading", { name: "Torneira X" });
    expect(document.activeElement).toHaveAttribute("data-painel-produto");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
    expect(document.activeElement).toBe(abrir);

    abrir.focus();
    fireEvent.click(abrir);
    await screen.findByRole("heading", { name: "Torneira X" });
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Torneira X" })).toBeNull());
    expect(document.activeElement).toBe(abrir);
  });

  it("abaixo de sm o painel é um diálogo modal com rótulo; no ecrã largo não", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("max-width: 639"), media: q, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { unmount } = montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
      const dlg = await screen.findByRole("dialog", { name: "Torneira X" });
      expect(dlg).toHaveAttribute("aria-modal", "true");
      unmount();
    } finally {
      window.matchMedia = original;
    }
    montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Torneira X" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o Livre a 0 fica neutro (só < 0 é vermelho, como na lista); os limites usam o formato das quantidades", async () => {
    rpc.mockResolvedValueOnce({ data: [{ product_id: "p1", qty_reserved: 14, qty_missing: 0, orders_count: 1 }], error: null });
    const original = DADOS.stocks;
    DADOS.stocks = [{ ...LINHAS_STOCK[0], minimum_quantity: 1.5, maximum_quantity: 20, reorder_point: 2.25 }, LINHAS_STOCK[1]];
    try {
      montar(<PainelProduto produtoId="p1" fechar={vi.fn()} />);
      await waitFor(() => expect(numero("Livre")).toBe("0"));
      expect(screen.getByTestId("numero-Livre")).not.toHaveClass("text-destructive");
      expect(screen.getAllByTestId("linha-armazem")[0]).toHaveTextContent("Mín. 1,5 · Máx. 20 · PE 2,25");
    } finally {
      DADOS.stocks = original;
    }
  });
});
