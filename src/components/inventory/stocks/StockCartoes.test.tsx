// @vitest-environment jsdom
// Existências no novo Inventário: dentro da moldura (InventarioEmbebido = true) o Stocks.tsx mostra a barra, os chips e
// a grelha de cartões do artefacto (StockCartoes); fora, a página clássica com a tabela, sem cartões.
// O Stocks.tsx real, com o Supabase e os filhos pesados simulados (o mesmo arnês do Suppliers.avisos.test.tsx).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const espias = vi.hoisted(() => ({ movimento: [] as unknown[], rpc: [] as Array<{ nome: string; args: unknown }> }));

const DADOS = vi.hoisted(() => {
  const linha = (id: string, product_id: string, nome: string, sku: string, barcode: string | null, q: number, mn: number, mx: number, pe: number, loc: string | null) => ({
    id, product_id, warehouse_id: "w1", quantity: q, minimum_quantity: mn, maximum_quantity: mx, reorder_point: pe, location: loc,
    last_counted: null, created_by: null, created_at: "2026-11-01", updated_at: "2026-11-01", organization_id: "o1",
    deleted_at: null, deleted_by: null,
    products: { name: nome, sku, barcode, category_id: null, subcategory_id: null, product_categories: { name: "Argamassas" } },
    warehouses: { name: "Central" },
  });
  const base = [
      // Normal, com decimais: 12,5 em stock, 3,25 reservados → 9,25 livres.
      linha("s1", "p1", "Cimento Cola", "CC-1", "5601234", 12.5, 2, 40, 10, "A-01"),
      // Sem limites; reservas acima do stock → livre −1 (a vermelho).
      linha("s2", "p2", "Tinta Branca", "TB-1", null, 1, 0, 0, 0, null),
      // Abaixo do ponto de encomenda → "A acabar".
      linha("s3", "p3", "Placa Gesso", "PG-1", null, 5, 1, 50, 8, "B-02"),
  ];
  return {
    base,
    stocks: base.map((l) => ({ ...l })) as Array<ReturnType<typeof linha>>,
    armazens: [{ id: "w1", name: "Central", is_vehicle: false }],
    reservas: [
      { product_id: "p1", qty_reserved: 3.25, qty_missing: 0, orders_count: 2 },
      { product_id: "p2", qty_reserved: 2, qty_missing: 1, orders_count: 1 },
    ],
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const chain = (result: unknown): unknown => {
    const p: unknown = new Proxy(function () {}, {
      get: (_t, key) => {
        if (key === "then") return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
        return () => p;
      },
      apply: () => p,
    });
    return p;
  };
  return {
    supabase: {
      from: (tabela: string) =>
        chain(
          tabela === "stocks" ? { data: DADOS.stocks, error: null }
          : tabela === "warehouses" ? { data: DADOS.armazens, error: null }
          : { data: [], error: null },
        ),
      rpc: (nome: string, args?: unknown) => {
        espias.rpc.push({ nome, args });
        return chain(nome === "rpc_get_product_stock_reservations" ? { data: DADOS.reservas, error: null } : { data: null, error: null });
      },
    },
  };
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.granted.has(p),
    hasAnyPermission: (l: string[]) => l.some((p) => perms.granted.has(p)),
    permissions: [...perms.granted],
    loading: false,
  }),
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "o1", name: "Nike" }, userType: "user", companies: [{ id: "o1", name: "Nike" }], isLoading: false }),
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/hooks/useInventoryToday", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useInventoryToday")>()),
  useInventoryToday: () => ({ data: { stock: { value: 48312.4, below_reorder_point: 1, overstock: 0, reserved_units: 5.25 } } }),
  inventoryTodayQueryKey: (id: string) => ["inventory-today", id],
}));
vi.mock("@/hooks/useProductCategories", () => ({ useProductCategories: () => ({ resolveFilterIds: () => null }) }));
vi.mock("@/components/inventory/CategorySubcategoryFilter", () => ({
  default: () => null,
  UNCATEGORIZED_CATEGORY_VALUE: "__uncategorized__",
}));
vi.mock("@/components/frota/PedidosCarrinha", () => ({ PedidosCarrinhasPainel: () => null }));
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: (p: { open: boolean; defaultProductId?: string; defaultWarehouseId?: string; defaultMovementType?: string }) => {
    if (p.open) espias.movimento.push({ produto: p.defaultProductId, armazem: p.defaultWarehouseId, tipo: p.defaultMovementType });
    return p.open ? <div data-testid="dialogo-movimento" /> : null;
  },
}));
vi.mock("@/components/inventory/StockMovementsHistoryDialog", () => ({ default: () => null }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn() }));
vi.mock("@/utils/auditContext", () => ({ withAuditContext: vi.fn() }));
vi.mock("@/lib/exports/xlsxExport", () => ({ downloadStandardXlsx: vi.fn() }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));

import Stocks from "@/pages/Stocks";

function Endereco() {
  const l = useLocation();
  return <output data-testid="endereco">{l.search}</output>;
}

const montar = (embebido: boolean, inicial = "/inventory/novo/existencias") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[inicial]}>
          <InventarioEmbebido.Provider value={embebido}>
            <Stocks />
          </InventarioEmbebido.Provider>
          <Endereco />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );

const cartao = async (nome: string) => screen.findByRole("article", { name: nome });

beforeEach(() => {
  perms.granted = new Set(["inventory.view", "inventory.edit", "inventory.delete", "inventory.create", "inventory.export", "inventory.import"]);
  espias.movimento = [];
  espias.rpc = [];
  DADOS.stocks = DADOS.base.map((l) => ({ ...l }));
  DADOS.armazens = [{ id: "w1", name: "Central", is_vehicle: false }];
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("Existências fora da moldura", () => {
  it("é a página clássica: a tabela, sem cartões nem a barra nova", async () => {
    montar(false, "/stocks");
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await screen.findByText("Cimento Cola");
    expect(screen.queryByTestId("cartao-stock")).toBeNull();
    expect(screen.queryByTestId("existencias-barra")).toBeNull();
    expect(screen.queryByRole("button", { name: /Cartões/ })).toBeNull();
    // O cabeçalho e os KPIs clássicos continuam lá.
    expect(screen.getByRole("heading", { name: "sidebar.inventoryStocks" })).toBeInTheDocument();
    expect(screen.getByText("Abaixo do ponto de encomenda")).toBeInTheDocument();
  });
});

describe("Existências dentro do novo Inventário", () => {
  it("mostra a barra, os chips com contagem e a linha de resumo, sem o cabeçalho clássico nem a tabela", async () => {
    montar(true);
    await cartao("Cimento Cola");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: "sidebar.inventoryStocks" })).toBeNull();
    expect(screen.getByPlaceholderText("Nome, SKU ou EAN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Importar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar stock/ })).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Estado do stock" });
    expect(within(chips).getByRole("button", { name: "Todos 3" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getByRole("button", { name: "Stock Baixo 1" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Excesso de Stock 0" })).toBeInTheDocument();
    const resumo = screen.getByTestId("existencias-resumo");
    expect(resumo).toHaveTextContent(/Valor em stock\s*48\s?312\s?€/);
    expect(resumo).toHaveTextContent("5,25 unidades reservadas para ECs");
  });

  it("Livre e Reservado certos, com decimais; livre negativo a vermelho", async () => {
    montar(true);
    const cc = await cartao("Cimento Cola");
    expect(within(cc).getByText("CC-1 · EAN 5601234")).toBeInTheDocument();
    await waitFor(() => expect(within(cc).getByTestId("cartao-livre")).toHaveTextContent("9,25un livres"));
    expect(within(cc).getByTestId("cartao-livre").className).not.toMatch(/text-red/);
    expect(within(cc).getByTestId("cartao-linha")).toHaveTextContent("12,5 un em Central · A-01 · 3,25 reservados");
    // Normal: sem pílula de estado.
    expect(within(cc).queryByText("A acabar")).toBeNull();
    expect(within(cc).queryByText("Excesso")).toBeNull();

    const tinta = await cartao("Tinta Branca");
    await waitFor(() => expect(within(tinta).getByTestId("cartao-livre")).toHaveTextContent("-1un livres"));
    expect(within(tinta).getByTestId("cartao-livre").className).toMatch(/text-red-700/);

    const placa = await cartao("Placa Gesso");
    expect(within(placa).getByText("A acabar")).toBeInTheDocument();
  });

  it("o nº de EC e o que falta ficam à vista (não num title debaixo do botão do cartão)", async () => {
    montar(true);
    const cc = await cartao("Cimento Cola");
    await waitFor(() => expect(within(cc).getByTestId("cartao-linha")).toHaveTextContent("3,25 reservados · 2 EC"));
    expect(within(cc).getByTestId("cartao-linha")).not.toHaveTextContent("faltam");
    const tinta = await cartao("Tinta Branca");
    await waitFor(() => expect(within(tinta).getByTestId("cartao-linha")).toHaveTextContent("2 reservados · 1 EC · faltam 1"));
    // Um só armazém: sem a nota da organização; nenhum title com informação no cartão.
    expect(cc).not.toHaveTextContent("(organização)");
    expect(cc.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("vários armazéns: Livre e Reservado com (organização) e limites (somados)", async () => {
    DADOS.armazens = [{ id: "w1", name: "Central", is_vehicle: false }, { id: "w2", name: "Porto", is_vehicle: false }];
    DADOS.stocks.push({ ...DADOS.base[0], id: "s4", warehouse_id: "w2", quantity: 3, minimum_quantity: 1, maximum_quantity: 10, reorder_point: 2, location: null, warehouses: { name: "Porto" } });
    montar(true);
    const cc = await cartao("Cimento Cola");
    await waitFor(() => expect(within(cc).getByTestId("cartao-livre")).toHaveTextContent("un livres (organização)"));
    expect(within(cc).getByTestId("cartao-linha")).toHaveTextContent("reservados (organização) · 2 EC");
    expect(within(cc).getByText("Mín. 3 · PE 12 · Máx. 50 (somados)")).toBeInTheDocument();
  });

  it("vários armazéns com uma carrinha: os limites ficam — (como a linha do produto na tabela)", async () => {
    DADOS.armazens = [{ id: "w1", name: "Central", is_vehicle: false }, { id: "w2", name: "Carrinha 1", is_vehicle: true }];
    DADOS.stocks.push({ ...DADOS.base[0], id: "s4", warehouse_id: "w2", quantity: 3, minimum_quantity: 1, maximum_quantity: 0, reorder_point: 0, location: null, warehouses: { name: "Carrinha 1" } });
    montar(true);
    const cc = await cartao("Cimento Cola");
    await waitFor(() => expect(within(cc).getByText(/^Mín\. \/ PE \/ Máx\.: — \(inclui carrinha/)).toBeInTheDocument());
    expect(within(cc).queryByText(/somados/)).toBeNull();
    expect(within(cc).queryByTestId("barra-limites")).toBeNull();
  });

  it("o indicador de Filtros conta o mesmo que o Limpar filtros (não fica 1 depois de limpar)", async () => {
    montar(true);
    await cartao("Cimento Cola");
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Por armazém" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Filtros\s*1$/, hidden: true })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Ver eliminados" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Filtros\s*2$/, hidden: true })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Filtros$/, hidden: true })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    expect(screen.getByRole("button", { name: "Por produto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: "Ver eliminados" })).not.toBeChecked();
  });

  it("a barra dos limites tem a marca do ponto de encomenda; sem limites mostra — / — / —", async () => {
    montar(true);
    const cc = await cartao("Cimento Cola");
    expect(within(cc).getByTestId("barra-limites-qtd")).toHaveStyle({ width: "31.25%" }); // 12,5 / 40
    expect(within(cc).getByTestId("barra-limites-pe")).toHaveStyle({ left: "25%" }); // 10 / 40
    expect(within(cc).getByText("Mín. 2 · PE 10 · Máx. 40")).toBeInTheDocument();

    const tinta = await cartao("Tinta Branca");
    expect(within(tinta).queryByTestId("barra-limites")).toBeNull();
    expect(within(tinta).getByText("Mín. / Máx. / PE: — / — / —")).toBeInTheDocument();
  });

  it("o ⋯ e o Movimento respeitam as permissões", async () => {
    perms.granted = new Set(["inventory.view"]);
    montar(true);
    const cc = await cartao("Cimento Cola");
    const movimento = within(cc).getByRole("button", { name: /Movimento/ });
    expect(movimento).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(movimento);
    expect(screen.queryByTestId("dialogo-movimento")).toBeNull();

    fireEvent.keyDown(within(cc).getByRole("button", { name: "Mais ações — Cimento Cola" }), { key: "Enter" });
    const editar = await screen.findByRole("menuitem", { name: /^Editar · Central/ });
    expect(editar).toHaveAttribute("data-disabled");
    expect(editar).toHaveTextContent(/Sem permissão/);
    expect(screen.getByRole("menuitem", { name: /^Eliminar · Central/ })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: /^Histórico do produto/ })).not.toHaveAttribute("data-disabled");
    // Abrir o menu não abre o painel.
    expect(screen.getByTestId("endereco").textContent).not.toMatch(/painel=/);
  });

  it("com permissão, o Movimento e o Registar ajuste do ⋯ abrem o diálogo com o produto e o armazém", async () => {
    montar(true);
    const cc = await cartao("Cimento Cola");
    fireEvent.click(within(cc).getByRole("button", { name: /Movimento/ }));
    expect(await screen.findByTestId("dialogo-movimento")).toBeInTheDocument();
    expect(espias.movimento.at(-1)).toEqual({ produto: "p1", armazem: "w1", tipo: undefined });
    expect(screen.getByTestId("endereco").textContent).not.toMatch(/painel=/);
  });

  it("os chips filtram (Stock Baixo → só a Placa)", async () => {
    montar(true);
    await cartao("Cimento Cola");
    fireEvent.click(screen.getByRole("button", { name: "Stock Baixo 1" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Cimento Cola" })).toBeNull());
    expect(await cartao("Placa Gesso")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Tinta Branca" })).toBeNull();
    expect(screen.getByRole("button", { name: "Stock Baixo 1" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("endereco").textContent).toMatch(/status=low/));
  });

  it('"Tabela" mostra a tabela clássica e "Cartões" volta aos cartões', async () => {
    montar(true);
    await cartao("Cimento Cola");
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("cartao-stock")).toBeNull();
    expect(screen.getByRole("button", { name: "Tabela" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    expect(await cartao("Cimento Cola")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("clicar no cartão define ?painel=produto:<id> (e realça o cartão)", async () => {
    montar(true, "/inventory/novo/existencias?status=");
    const cc = await cartao("Cimento Cola");
    await act(async () => {
      fireEvent.click(within(cc).getByRole("button", { name: "Cimento Cola" }));
    });
    await waitFor(() => expect(new URLSearchParams(screen.getByTestId("endereco").textContent ?? "").get("painel")).toBe("produto:p1"));
    expect(within(await cartao("Cimento Cola")).getByRole("button", { name: "Cimento Cola" })).toHaveAttribute("aria-current", "true");
  });

  it('a vista "Por armazém" fica no botão Filtros e mostra um cartão por linha, com a categoria', async () => {
    montar(true);
    await cartao("Cimento Cola");
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Por armazém" }));
    expect(await screen.findByRole("region", { name: "Argamassas" })).toBeInTheDocument();
    const cc = await cartao("Cimento Cola");
    // Na vista por armazém o ⋯ é o da linha (sem sufixo do armazém).
    fireEvent.keyDown(within(cc).getByRole("button", { name: "Mais ações — Cimento Cola" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /^Editar$/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Últimos movimentos \(rápido\)$/ })).toBeInTheDocument();
  });
});

describe("Existências dentro do novo Inventário · Restaurar (eliminados)", () => {
  const verEliminados = async (vista: "Por produto" | "Por armazém") => {
    DADOS.stocks = DADOS.base.map((l) => ({ ...l, deleted_at: "2026-11-20" })) as typeof DADOS.stocks;
    montar(true);
    await cartao("Cimento Cola");
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ver eliminados" }));
    if (vista === "Por armazém") fireEvent.click(screen.getByRole("button", { name: "Por armazém" }));
    await waitFor(async () => expect(within(await cartao("Cimento Cola")).getByText("Eliminado")).toBeInTheDocument());
    if (vista === "Por armazém") await screen.findByRole("region", { name: "Argamassas" });
    return cartao("Cimento Cola");
  };
  const restaurou = () => espias.rpc.filter((c) => c.nome === "rpc_restore_stock").map((c) => c.args);

  it("Por produto: com inventory.delete, o Restaurar · <armazém> do ⋯ chama rpc_restore_stock", async () => {
    const cc = await verEliminados("Por produto");
    fireEvent.keyDown(within(cc).getByRole("button", { name: "Mais ações — Cimento Cola" }), { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: /^stocks\.restore · Central/ });
    expect(item).not.toHaveAttribute("data-disabled");
    fireEvent.click(item);
    await waitFor(() => expect(restaurou()).toEqual([{ p_id: "s1" }]));
  });

  it("Por produto: sem inventory.delete, o Restaurar fica desativado", async () => {
    perms.granted = new Set(["inventory.view", "inventory.edit"]);
    const cc = await verEliminados("Por produto");
    fireEvent.keyDown(within(cc).getByRole("button", { name: "Mais ações — Cimento Cola" }), { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: /^stocks\.restore · Central/ });
    expect(item).toHaveAttribute("data-disabled");
    fireEvent.click(item);
    expect(restaurou()).toEqual([]);
  });

  it("Por armazém: com inventory.delete, o botão Restaurar do cartão chama rpc_restore_stock", async () => {
    const cc = await verEliminados("Por armazém");
    const botao = within(cc).getByRole("button", { name: /stocks\.restore/ });
    expect(botao).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    await waitFor(() => expect(restaurou()).toEqual([{ p_id: "s1" }]));
    // O Restaurar não abre o painel.
    expect(screen.getByTestId("endereco").textContent).not.toMatch(/painel=/);
  });

  it("Por armazém: sem inventory.delete, o botão Restaurar fica desativado", async () => {
    perms.granted = new Set(["inventory.view", "inventory.edit"]);
    const cc = await verEliminados("Por armazém");
    const botao = within(cc).getByRole("button", { name: /stocks\.restore/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(restaurou()).toEqual([]);
  });
});
