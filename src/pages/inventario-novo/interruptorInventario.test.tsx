// O novo Inventário substitui as rotas clássicas (interruptor INVENTARIO_NOVO_ATIVO; VITE_INVENTARIO_CLASSICO=1 desliga-o):
// · as 9 rotas clássicas levam ao separador certo, com o mesmo ?search e #hash (RedirecionarParaSeparador em App.tsx);
// · o menu lateral aponta para os separadores (mesmos rótulos, ícones, permissões e contadores) e a secção/item ficam ativos;
// · o ícone do Inventário no rail abre logo /inventory/novo (abreDireto), sem o painel;
// · o Hoje clássico deixa de mostrar «Experimentar o novo Inventário»;
// · com o interruptor desligado fica tudo como antes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appSource from "@/App.tsx?raw";
import type { InventoryTodayPayload } from "@/hooks/useInventoryToday";
import { itemAtivo } from "@/components/sidebar/itemAtivo";
import { INVENTORY_PATHS } from "@/components/inventory/ui/inventoryLinks";

// O interruptor, lido a cada acesso: um getter controlado por teste (o valor real vem do import.meta.env, ver o fim).
const interruptor = vi.hoisted(() => ({ ativo: true }));
vi.mock("./separadores", async (orig) => {
  const m = await orig<typeof import("./separadores")>();
  return { ...m, get INVENTARIO_NOVO_ATIVO() { return interruptor.ativo; } };
});

// O que o Hoje clássico precisa para montar (o mesmo que InventoryTodayEmbebido.test.tsx).
vi.mock("@/integrations/supabase/client", () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit", "in", "range"]) chain[k] = () => chain;
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return chain;
  };
  return { supabase: { from, rpc: vi.fn() } };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
const PERMS = new Set(["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "inventory.edit"]);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => PERMS.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => PERMS.has(p)),
    loading: false,
    permissions: [...PERMS],
  }),
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/components/inventory/StockMovementDialog", () => ({ default: () => null }));
vi.mock("@/hooks/useMovementDocumentLinks", () => ({ useMovementDocumentLinks: () => ({ links: { poByNumber: {}, countByLineId: {} } }) }));
const payload: InventoryTodayPayload = {
  purchases: { pending_approval: 0, late: 0, portal_unseen: 0, portal_confirmed: 0, open_delivery_notes: 0, delivery_notes_with_divergences: 0 },
  suppliers: { price_changes_pending: 0, awaiting_profile: 0, catalog_unlinked: 0 },
  client_orders: { open: 0, ready_to_ship: 0, without_preferred_supplier: 0, by_origin: null },
  stock: { below_reorder_point: 0, overstock: 0, reserved_units: 0, value: null },
  counts: { in_progress: 0, stalled: 0 },
  settings: null,
};
vi.mock("@/hooks/useInventoryToday", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: payload, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("@/components/receiving/useReceivablePos", () => ({ useReceivablePos: () => ({ data: [], refetch: vi.fn() }) }));

import { RedirecionarParaSeparador } from "./RedirecionarParaSeparador";
import InventoryToday from "@/pages/InventoryToday";

afterEach(cleanup);
beforeEach(() => { interruptor.ativo = true; });

/** [rota clássica, separador, permissão da rota clássica, componente da rota clássica] */
const ROTAS = [
  ["/inventory", "hoje", "inventory.view", "InventoryToday"],
  ["/purchase-orders", "encomendas", "purchase_orders.view", "PurchaseOrders"],
  ["/suppliers", "fornecedores", "suppliers.view", "Suppliers"],
  ["/client-orders", "saidas", "client_orders.view", "ClientOrders"],
  ["/receiving", "rececao", "receiving.view", "Receiving"],
  ["/stocks", "existencias", "inventory.view", "Stocks"],
  ["/stock-movements", "movimentos", "inventory.view", "StockMovements"],
  ["/stock-counts", "contagens", "inventory.view", "StockCounts"],
  ["/warehouses", "armazens", "warehouses.view", "Warehouses"],
] as const;

function Destino() {
  const l = useLocation();
  return <p data-testid="destino">{`${l.pathname}|${l.search}|${l.hash}`}</p>;
}
function abrir(entrada: string, rota: string) {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path={rota} element={<RedirecionarParaSeparador />} />
        <Route path="/inventory/novo/:aba?" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("destino").textContent;
}

describe("as rotas clássicas levam ao separador do novo Inventário", () => {
  it.each(ROTAS)("%s → /inventory/novo/%s, com o ?search e o #hash", (rota, aba) => {
    expect(abrir(`${rota}?open=abc-1&status=late#linhas`, rota)).toBe(`/inventory/novo/${aba}|?open=abc-1&status=late|#linhas`);
    cleanup();
    expect(abrir(rota, rota)).toBe(`/inventory/novo/${aba}||`);
  });

  it("a barra final e as maiúsculas (o react-router aceita-as) não fazem um ciclo", () => {
    expect(abrir("/stocks/?q=x", "/stocks")).toBe("/inventory/novo/existencias|?q=x|");
    cleanup();
    expect(abrir("/Purchase-Orders?open=1", "/purchase-orders")).toBe("/inventory/novo/encomendas|?open=1|");
  });

  const linhaDe = (p: string) => appSource.split(/\r?\n/).find((l) => l.includes(`path="${p}"`)) ?? "";
  it.each(ROTAS)("App.tsx: %s redireciona com o interruptor ligado e, desligado, mantém a guarda e o ecrã clássico", (rota, _aba, permissao, pagina) => {
    expect(linhaDe(rota)).toContain(
      `element={INVENTARIO_NOVO_ATIVO ? <RedirecionarParaSeparador /> : <ProtectedRoute permission="${permissao}"><${pagina} /></ProtectedRoute>} />`,
    );
  });

  it("App.tsx: a rota do novo Inventário fica igual (guarda OR do menu) e o interruptor vem de separadores.ts", () => {
    expect(linhaDe("/inventory/novo/:aba?")).toContain(
      '<ProtectedRoute permissions={["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "warehouses.view"]}><InventarioNovo /></ProtectedRoute>',
    );
    expect(appSource).toContain('import { INVENTARIO_NOVO_ATIVO } from "./pages/inventario-novo/separadores";');
  });
});

describe("o menu lateral do Inventário", () => {
  type Menu = typeof import("@/components/sidebar/menuConfig");
  const carregarMenu = async (ativo: boolean): Promise<Menu> => {
    interruptor.ativo = ativo;
    vi.resetModules();
    return import("@/components/sidebar/menuConfig");
  };
  const itensDe = (m: Menu) => {
    const s = m.menuSections.find((x) => x.id === "inventory")!;
    return { secao: s, itens: [...s.items, ...(s.subSections ?? []).flatMap((x) => x.items)] };
  };
  /** O que cada item tinha antes (rota clássica, rótulo, permissão, contador). */
  const ANTES = [
    ["/inventory", "sidebar.inventoryToday", "inventory.view", "today"],
    ["/purchase-orders", "sidebar.inventoryPurchaseOrders", "purchase_orders.view", "purchaseOrders"],
    ["/suppliers", "sidebar.suppliers", "suppliers.view", "suppliers"],
    ["/stocks", "sidebar.inventoryStocks", "inventory.view", "stocks"],
    ["/stock-movements", "sidebar.stockMovements", "inventory.view", undefined],
    ["/client-orders", "sidebar.inventoryClientOrders", "client_orders.view", "clientOrders"],
    ["/receiving", "sidebar.inventoryReceiving", "receiving.view", "receiving"],
    ["/stock-counts", "sidebar.inventoryStockCounts", "inventory.view", "stockCounts"],
    ["/warehouses", "sidebar.warehouses", "warehouses.view", undefined],
  ] as const;
  const abaDe = (classico: string) => ROTAS.find(([r]) => r === classico)![1];

  it("interruptor ligado: cada item aponta para o seu separador, com o mesmo rótulo, ícone, permissão e contador", async () => {
    const ligado = itensDe(await carregarMenu(true));
    const desligado = itensDe(await carregarMenu(false));
    expect(ligado.itens.map((i) => [i.to, i.labelKey, i.permission, i.counterKey])).toEqual(
      ANTES.map(([r, l, p, c]) => [`/inventory/novo/${abaDe(r)}`, l, p, c]),
    );
    ligado.itens.forEach((i, n) => expect(i.icon, i.to).toBe(desligado.itens[n].icon));
    expect(ligado.secao.permissions).toEqual(desligado.secao.permissions);
    expect(ligado.secao.subSections?.map((x) => x.key)).toEqual(["inventory-purchases", "inventory-warehouse"]);
    // O ícone do rail abre logo o novo Inventário, sem o painel (os itens ficam para a visibilidade da secção).
    expect(ligado.secao.abreDireto).toBe("/inventory/novo");
  });

  it("interruptor ligado: a secção é reconhecida em /inventory/novo/* e só o item do separador aberto fica ativo", async () => {
    const { secao, itens } = itensDe(await carregarMenu(true));
    for (const i of itens) {
      const aqui = i.to;
      // a regra do AppSidebar (activeSectionId): algum caminho da secção é prefixo do endereço
      expect(secao.paths.some((p) => aqui.startsWith(p)), aqui).toBe(true);
      expect(itens.filter((x) => itemAtivo(x, aqui, "?open=1")).map((x) => x.to)).toEqual([aqui]);
    }
    expect(secao.paths.some((p) => "/inventory/novo".startsWith(p))).toBe(true);
  });

  it("interruptor desligado: o menu fica como antes (rotas clássicas)", async () => {
    const { secao, itens } = itensDe(await carregarMenu(false));
    expect(itens.map((i) => [i.to, i.labelKey, i.permission, i.counterKey])).toEqual(ANTES.map((x) => [...x]));
    expect(secao.paths).toEqual(["/inventory", "/purchase-orders", "/suppliers", "/stocks", "/stock-movements", "/client-orders", "/receiving", "/stock-counts", "/warehouses"]);
    expect(Object.values(INVENTORY_PATHS).every((p) => itens.some((i) => i.to === p))).toBe(true);
    // Sem abreDireto: o ícone abre o painel com a lista.
    expect(secao.abreDireto).toBeUndefined();
  });
});

describe("o Hoje clássico: «Experimentar o novo Inventário»", () => {
  const montarHoje = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <InventoryToday />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("interruptor ligado: não aparece", async () => {
    montarHoje();
    expect(await screen.findByRole("button", { name: /Registar movimento/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Experimentar o novo Inventário/ })).toBeNull();
  });

  it("interruptor desligado: aparece como antes e leva a /inventory/novo", async () => {
    interruptor.ativo = false;
    montarHoje();
    expect(await screen.findByRole("link", { name: /Experimentar o novo Inventário/ })).toHaveAttribute("href", "/inventory/novo");
  });
});

describe("o interruptor lê VITE_INVENTARIO_CLASSICO", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const real = async () => {
    vi.resetModules();
    return (await vi.importActual<typeof import("./separadores")>("./separadores")).INVENTARIO_NOVO_ATIVO;
  };
  it("sem a variável (ou com outro valor) está ligado; com \"1\" está desligado", async () => {
    vi.stubEnv("VITE_INVENTARIO_CLASSICO", "");
    expect(await real()).toBe(true);
    vi.stubEnv("VITE_INVENTARIO_CLASSICO", "0");
    expect(await real()).toBe(true);
    vi.stubEnv("VITE_INVENTARIO_CLASSICO", "1");
    expect(await real()).toBe(false);
  });
});
