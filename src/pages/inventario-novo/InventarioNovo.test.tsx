// A moldura do novo Inventário: os separadores com a permissão da rota clássica, o ecrã clássico embebido (sem os
// separadores antigos, com as ligações a ficarem cá dentro), o botão principal e o Esc.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Route, Routes, Link, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useContext } from "react";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import type { ReceivablePo } from "@/components/receiving/porReceber";

// As linhas que cada tabela devolve (o livro da sessão: stock_movements + purchase_order_receipts); o resto vem vazio.
const linhas = vi.hoisted(() => ({ porTabela: {} as Record<string, unknown[]> }));
const rpc = vi.hoisted(() => ({ fn: null as null | ((nome: string, args?: unknown) => unknown) }));
vi.mock("@/integrations/supabase/client", () => {
  const from = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit", "in", "range", "gte", "not"]) chain[k] = () => chain;
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas.porTabela[tabela] ?? [], error: null }).then(ok);
    return chain;
  };
  return { supabase: { from, rpc: (nome: string, args?: unknown) => Promise.resolve(rpc.fn ? rpc.fn(nome, args) : { data: null, error: null }) } };
});
// O movimento reduzido (prefers-reduced-motion), controlado por teste.
const movimento = vi.hoisted(() => ({ reduzir: false }));
vi.mock("@/emylia/movimento", async (orig) => ({
  ...(await orig<typeof import("@/emylia/movimento")>()),
  useReduzir: () => movimento.reduzir,
}));
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
// O Armazéns de exemplo elimina como o handleDelete clássico: no ramo de sucesso, uma linha avisos?.("eliminado", …).
vi.mock("@/pages/Warehouses", async () => {
  const { useAvisosInventario } = await import("@/components/inventory/ui/embebido");
  return {
    default: function ArmazensExemplo() {
      const avisos = useAvisosInventario();
      return (
        <div>
          <p>Armazéns clássico</p>
          <button type="button" onClick={() => avisos?.("eliminado", { tipo: "armazem", id: "w-1", rotulo: "Central" })}>Eliminar armazém</button>
        </div>
      );
    },
  };
});
vi.mock("@/pages/ClientOrders", () => ({ default: () => <p>Saídas clássico</p> }));
// O interruptor do novo Inventário (VITE_INVENTARIO_CLASSICO), lido a cada render: um getter controlado por teste.
const interruptor = vi.hoisted(() => ({ ativo: true }));
vi.mock("./separadores", async (orig) => {
  const m = await orig<typeof import("./separadores")>();
  return { ...m, get INVENTARIO_NOVO_ATIVO() { return interruptor.ativo; } };
});

import InventarioNovo, { escDeveSair, indiceHistorico, passosParaSair } from "./InventarioNovo";
import { RedirecionarParaSeparador } from "./RedirecionarParaSeparador";

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
  beforeEach(() => {
    perms = new Set(TODAS); todayPayload = payload(); receivable = [];
    linhas.porTabela = {}; rpc.fn = null; movimento.reduzir = false; interruptor.ativo = true;
  });

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
    // Fatia 5: no Hoje o cabeçalho não repete o «Registar movimento» do Hoje clássico; noutro separador continua lá.
    todayPayload = { ...payload(), purchases: { ...payload().purchases!, pending_approval: 0 } };
    montar("/inventory/novo/movimentos");
    await screen.findByText("Movimentos clássico", undefined, { timeout: 8000 });
    fireEvent.click(cabecalho().getByRole("button", { name: /Registar movimento/ }));
    expect(screen.getByRole("dialog", { name: "Registar movimento" })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/movimentos");
  });

  it("no Hoje o botão principal é sempre o do cabeçalho (o Hoje embebido já não tem cabeçalho próprio)", async () => {
    todayPayload = { ...payload(), purchases: { ...payload().purchases!, pending_approval: 0 } };
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    fireEvent.click(cabecalho().getByRole("button", { name: /Registar movimento/ }));
    expect(screen.getByRole("dialog", { name: "Registar movimento" })).toBeInTheDocument();
    // sem inventory.edit: o cabeçalho mantém-no, bloqueado com o motivo
    cleanup();
    perms = new Set(TODAS.filter((p) => p !== "inventory.edit"));
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    expect(cabecalho().getByRole("button", { name: /Registar movimento/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("fatia 5: os separadores — tablist/tab/tabpanel ligados, roving tabindex e as setas ←/→ (Home/End) mudam de separador com o foco", async () => {
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    const hoje = screen.getByRole("tab", { name: /^Hoje/ });
    const painel = screen.getByRole("tabpanel");
    expect(hoje).toHaveAttribute("aria-selected", "true");
    expect(hoje).toHaveAttribute("aria-controls", painel.id);
    expect(painel).toHaveAttribute("aria-labelledby", hoje.id);
    expect(hoje).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /^Encomendas/ })).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);

    hoje.focus();
    fireEvent.keyDown(hoje, { key: "ArrowRight" });
    const encomendas = screen.getByRole("tab", { name: /^Encomendas/ });
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/encomendas");
    expect(document.activeElement).toBe(encomendas);
    expect(encomendas).toHaveAttribute("aria-selected", "true");
    expect(encomendas).toHaveAttribute("tabindex", "0");
    expect(hoje).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(encomendas, { key: "ArrowLeft" });
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
    expect(document.activeElement).toBe(hoje);

    // ← no primeiro dá a volta ao último; Home volta ao primeiro
    fireEvent.keyDown(hoje, { key: "ArrowLeft" });
    const ultima = screen.getAllByRole("tab").at(-1) as HTMLElement;
    expect(document.activeElement).toBe(ultima);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/saidas");
    fireEvent.keyDown(ultima, { key: "Home" });
    expect(document.activeElement).toBe(hoje);
    expect(screen.getByTestId("onde")).toHaveTextContent("/inventory/novo/hoje");
  });

  it("fatia 5: a moldura não é um diálogo modal (os diálogos/popovers dos ecrãs ficam fora dela) e não força a paleta clara (.calma)", async () => {
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    const titulo = screen.getByRole("heading", { level: 1 });
    const moldura = screen.getByRole("region", { name: titulo.textContent ?? "" });
    expect(moldura).not.toHaveAttribute("aria-modal");
    expect(moldura.closest(".calma")).toBeNull();
    expect(moldura.closest("[data-camada-inventario]")).not.toBeNull();
  });

  it("fatia 4: eliminar num ecrã embebido → o toast oferece «Restaurar» (warehouses.delete), que chama a mesma RPC do ecrã", async () => {
    perms = new Set([...TODAS, "warehouses.delete"]);
    const chamadas: Array<[string, unknown]> = [];
    rpc.fn = (nome, args) => { chamadas.push([nome, args]); return { data: null, error: null }; };
    montar("/inventory/novo/armazens");
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar armazém" }, { timeout: 8000 }));
    const toast = screen.getByTestId("toast-escuro");
    expect(toast).toHaveTextContent("Armazém Central eliminado.");
    expect(toast.closest("[aria-live=polite]")).not.toBeNull();
    fireEvent.click(within(toast).getByRole("button", { name: "Restaurar" }));
    await vi.waitFor(() => expect(chamadas).toContainEqual(["rpc_restore_warehouse", { p_id: "w-1" }]));
    expect(screen.queryByTestId("toast-escuro")).toBeNull();
  });

  it("fatia 4: sem a permissão do «Restaurar» do ecrã (warehouses.delete) não há toast nem RPC", async () => {
    const chamadas: string[] = [];
    rpc.fn = (nome) => { chamadas.push(nome); return { data: null, error: null }; };
    montar("/inventory/novo/armazens");
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar armazém" }, { timeout: 8000 }));
    expect(screen.queryByTestId("toast-escuro")).toBeNull();
    expect(chamadas.filter((n) => n.startsWith("rpc_restore"))).toEqual([]);
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

  it("interruptor desligado: Esc sem diálogo aberto volta ao clássico; «Voltar ao clássico» também (como antes)", async () => {
    interruptor.ativo = false;
    const { unmount } = montar();
    await screen.findByText("Hoje clássico (embebido)");
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory$/);
    unmount();
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao clássico" }));
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/inventory$/);
  });

  it("interruptor ligado: «Voltar» (texto e aria-label) e Esc, sem histórico na app, vão para /home e nunca para /inventory", async () => {
    window.history.replaceState(null, "");
    const { unmount } = montar();
    await screen.findByText("Hoje clássico (embebido)");
    expect(screen.queryByRole("button", { name: "Voltar ao clássico" })).toBeNull();
    expect(screen.queryByText("Voltar ao clássico")).toBeNull();
    const botao = screen.getByRole("button", { name: "Voltar" });
    expect(botao).toHaveTextContent("Voltar");
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/home$/);
    unmount();
    montar();
    await screen.findByText("Hoje clássico (embebido)");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/home$/);
  });

  describe("interruptor ligado: «Voltar» com histórico na app (BrowserRouter, history.state.idx)", () => {
    function Ir() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/purchase-orders?status=late#x")}>ir às encomendas</button>;
    }
    function montarNoBrowser() {
      window.history.replaceState(null, "", "/pessoas");
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <Routes>
              <Route path="/inventory/novo/:aba?" element={<InventarioNovo />} />
              <Route path="/purchase-orders" element={<RedirecionarParaSeparador />} />
              <Route path="/inventory" element={<RedirecionarParaSeparador />} />
              <Route path="/pessoas" element={<Ir />} />
              <Route path="*" element={<p>outra página</p>} />
            </Routes>
            <Onde />
          </BrowserRouter>
        </QueryClientProvider>,
      );
    }
    afterEach(() => { window.history.replaceState(null, "", "/"); });

    const ondeCompleto = () => window.location.pathname + window.location.search + window.location.hash;

    it("a rota clássica leva ao separador (substitui a entrada) e «Voltar» sai para a página de antes, saltando os separadores abertos", async () => {
      montarNoBrowser();
      fireEvent.click(screen.getByRole("button", { name: "ir às encomendas" }));
      expect(await screen.findByText("Encomendas a fornecedor", undefined, { timeout: 8000 })).toBeInTheDocument();
      expect(ondeCompleto()).toBe("/inventory/novo/encomendas?status=late#x");
      expect(indiceHistorico()).toBe(1);
      // dois separadores abertos depois: o histórico cresce
      fireEvent.click(screen.getByRole("tab", { name: /^Fornecedores/ }));
      fireEvent.click(screen.getByRole("tab", { name: /^Hoje/ }));
      expect(indiceHistorico()).toBe(3);
      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      await vi.waitFor(() => expect(screen.getByTestId("onde")).toHaveTextContent(/^\/pessoas$/));
      expect(screen.getByRole("button", { name: "ir às encomendas" })).toBeInTheDocument();
    });

    it("Esc faz o mesmo que «Voltar»", async () => {
      montarNoBrowser();
      fireEvent.click(screen.getByRole("button", { name: "ir às encomendas" }));
      await screen.findByText("Encomendas a fornecedor", undefined, { timeout: 8000 });
      act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
      await vi.waitFor(() => expect(screen.getByTestId("onde")).toHaveTextContent(/^\/pessoas$/));
    });
  });

  it("passosParaSair: sem histórico na app → null (vai para /); senão recua até antes da moldura", () => {
    expect(passosParaSair(null, null)).toBeNull();
    expect(passosParaSair(0, 3)).toBeNull();
    expect(passosParaSair(1, 1)).toBe(1);
    expect(passosParaSair(2, 5)).toBe(4);
    expect(passosParaSair(4, 2)).toBe(1);
    expect(passosParaSair(3, null)).toBe(1);
    expect(indiceHistorico({ idx: 2 })).toBe(2);
    expect(indiceHistorico({ usr: null })).toBeNull();
    expect(indiceHistorico(null)).toBeNull();
  });

  describe("fatia 4: a festa", () => {
    const rececao = (id: string) => ({
      id, movement_type: "entrada", document_type: "compra", document_number: "PO-2026-0007", quantity: 6, product_id: "p-1",
      warehouse_id: "w-1", reference_id: "poi-1", sale_source_type: null, sale_source_id: null, reversal_of_movement_id: null,
      created_at: new Date().toISOString(), products: { name: "Torneira" }, warehouses: { name: "Central" },
    });
    const comLivro = (ids: string[]) => {
      linhas.porTabela = {
        stock_movements: ids.map(rececao),
        purchase_order_receipts: ids.map((id) => ({ purchase_order_id: "po-7", purchase_order_item_id: "poi-1", stock_movement_id: id })),
      };
    };
    const reler = async () => { await act(async () => { window.dispatchEvent(new Event("focus")); await new Promise((r) => setTimeout(r, 700)); }); };
    let vibracoes: unknown[];
    beforeEach(() => {
      perms = new Set([...TODAS, "purchase_orders.revert_receipt"]);
      rpc.fn = (nome) => ({ data: nome === "current_business_user_id" ? "u-1" : null, error: null });
      vibracoes = [];
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: (p: unknown) => { vibracoes.push(p); return true; } });
    });

    it("não dispara na primeira leitura (o que já lá estava ao abrir)", async () => {
      comLivro(["m-antes"]);
      montar();
      await screen.findByText("Hoje clássico (embebido)");
      await reler();
      expect(screen.queryByTestId("festa")).toBeNull();
      expect(vibracoes).toEqual([]);
    });

    it("dispara com uma receção nova no livro (e vibra)", async () => {
      comLivro(["m-antes"]);
      montar();
      await screen.findByText("Hoje clássico (embebido)");
      await reler();
      comLivro(["m-nova", "m-antes"]);
      await reler();
      expect(await screen.findByTestId("festa")).toBeInTheDocument();
      expect(vibracoes).toEqual([[10, 30, 10]]);
      expect(screen.getByTestId("toast-escuro")).toHaveTextContent("Receção de PO-2026-0007");
    });

    it("com prefers-reduced-motion não há festa nem vibração: fica só o toast", async () => {
      movimento.reduzir = true;
      comLivro([]);
      montar();
      await screen.findByText("Hoje clássico (embebido)");
      await reler();
      comLivro(["m-nova"]);
      await reler();
      expect(await screen.findByTestId("toast-escuro")).toHaveTextContent("Receção de PO-2026-0007");
      expect(screen.queryByTestId("festa")).toBeNull();
      expect(vibracoes).toEqual([]);
    });
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
