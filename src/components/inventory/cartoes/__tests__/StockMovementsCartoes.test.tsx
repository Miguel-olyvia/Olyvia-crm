// @vitest-environment jsdom
// Movimentos no novo Inventário: dentro da moldura (InventarioEmbebido = true) o StockMovements.tsx mostra a barra e a
// grelha de cartões do artefacto (V.mov / movCard); fora, o ecrã clássico, igual (cabeçalho, cartão de filtros, tabela).
// O StockMovements.tsx real, com o Supabase e os filhos pesados simulados.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const espias = vi.hoisted(() => ({ chamadas: [] as Array<{ tabela: string; metodo: string; args: unknown[] }>, dialogo: [] as boolean[] }));

const LINHAS = vi.hoisted(() => [
  {
    id: "m1", movement_type: "entrada", quantity: 5, balance_after: 12, document_number: "PO-2026-0001", document_type: "compra",
    reference_id: null, sale_source_type: null, sale_source_id: null, transfer_group_id: null, counterparty: "Forn Lda", notes: "Palete 2",
    created_at: "2026-11-20T09:12:00Z", product_id: "p1", warehouse_id: "w1",
    products: { name: "Base de duche", sku: "BD-1" }, warehouses: { name: "Leiria" }, created_by_user: { name: "Ana" },
  },
  {
    id: "m2", movement_type: "venda", quantity: 1, balance_after: 11, document_number: "EC-2026-0084", document_type: "venda",
    reference_id: null, sale_source_type: "contract", sale_source_id: "c1", transfer_group_id: null, counterparty: null, notes: null,
    created_at: "2026-11-20T10:00:00Z", product_id: "p1", warehouse_id: "w1",
    products: { name: "Base de duche", sku: "BD-1" }, warehouses: { name: "Leiria" }, created_by_user: null,
  },
  {
    id: "m3", movement_type: "transferencia_saida", quantity: 2, balance_after: 9, document_number: "TR-0001", document_type: "transferencia",
    reference_id: null, sale_source_type: null, sale_source_id: null, transfer_group_id: "g1", counterparty: null, notes: null,
    created_at: "2026-11-21T08:00:00Z", product_id: "p2", warehouse_id: "w1",
    products: { name: "Torneira", sku: null }, warehouses: null, created_by_user: { name: "Rui" },
  },
]);

vi.mock("@/integrations/supabase/client", () => {
  const chain = (tabela: string, result: unknown): unknown => {
    const p: unknown = new Proxy(function () {}, {
      get: (_t, key) => {
        if (key === "then") return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
        return (...args: unknown[]) => {
          espias.chamadas.push({ tabela, metodo: String(key), args });
          return p;
        };
      },
      apply: () => p,
    });
    return p;
  };
  return {
    supabase: {
      from: (tabela: string) =>
        chain(
          tabela,
          tabela === "stock_movements" ? { data: LINHAS, count: LINHAS.length, error: null }
          : tabela === "warehouses" ? { data: [{ id: "w1", name: "Leiria" }], error: null }
          : { data: [], error: null },
        ),
      rpc: () => chain("rpc", { data: [], error: null }),
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
  useCompany: () => ({ activeCompany: { id: "o1", name: "Nike" }, isLoading: false }),
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/custosStock", () => ({
  juntarCustosMovimentos: async (rows: Array<Record<string, unknown>>) => rows.map((r) => ({ ...r, unit_cost_at_time: r.id === "m1" ? 3.5 : null })),
}));
vi.mock("@/hooks/useMovementDocumentLinks", () => ({
  useMovementDocumentLinks: () => ({ links: { poByNumber: { "PO-2026-0001": "po1" }, noteByMovementId: {}, countByLineId: {} } }),
}));
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: ({ open }: { open: boolean }) => {
    espias.dialogo.push(open);
    return open ? <div data-testid="dialogo-movimento" /> : null;
  },
}));
vi.mock("@/components/receiving/DeliveryNoteDetail", () => ({ DeliveryNoteDetail: () => null }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));

import StockMovements from "@/pages/StockMovements";

const montar = (embebido: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/stock-movements"]}>
          <InventarioEmbebido.Provider value={embebido}>
            <StockMovements />
          </InventarioEmbebido.Provider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );

const cartoes = () => screen.findAllByTestId("mov-cartao");

beforeEach(() => {
  perms.granted = new Set(["inventory.view", "inventory.edit", "inventory.export", "products.view_cost", "purchase_orders.view", "client_orders.view"]);
  espias.chamadas = [];
  espias.dialogo = [];
});

describe("Movimentos fora da moldura", () => {
  it("fica igual: cabeçalho, cartão de filtros e a tabela clássica, sem barra nem cartões", async () => {
    montar(false);
    expect(await screen.findByRole("heading", { name: "sidebar.stockMovements" })).toBeTruthy();
    expect(await screen.findByText("Livro de movimentos")).toBeTruthy(); // caption da tabela
    expect(screen.getByRole("searchbox", { name: "Documento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Registar movimento/ })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(4));
    expect(screen.queryByTestId("movimentos-barra")).toBeNull();
    expect(screen.queryByTestId("mov-cartao")).toBeNull();
    expect(screen.queryByRole("group", { name: "Mostrar como" })).toBeNull();
  });
});

describe("Movimentos dentro da moldura", () => {
  it("sem o cabeçalho clássico: a barra (pesquisa, Filtros, Exportar, Registar, Cartões/Tabela) e um cartão por movimento", async () => {
    montar(true);
    expect((await cartoes()).length).toBe(3);
    expect(screen.queryByRole("heading", { name: "sidebar.stockMovements" })).toBeNull();
    expect(screen.queryByText("Livro de movimentos")).toBeNull();
    const barra = screen.getByTestId("movimentos-barra");
    expect(within(barra).getByPlaceholderText("Produto, SKU ou EAN")).toBeTruthy();
    expect(within(barra).getByRole("button", { name: /Filtros/ })).toBeTruthy();
    expect(within(barra).getByRole("button", { name: /Exportar/ })).toBeTruthy();
    expect(within(barra).getByRole("button", { name: /^Registar$/ })).toBeTruthy();
    expect(within(barra).getByRole("button", { name: /Cartões/, pressed: true })).toBeTruthy();
    // A regra do livro continua visível.
    expect(screen.getByText(/O livro nunca se edita nem apaga/)).toBeTruthy();
  });

  it("cada cartão: data · armazém, quantidade com sinal (verde a entrar), a frase com o utilizador, as notas e o mono", async () => {
    montar(true);
    const [c1, c2, c3] = await cartoes();
    // 1 — entrada
    expect(within(c1).getByTestId("mov-cartao-quando").textContent).toMatch(/· Leiria$/);
    const q1 = within(c1).getByTestId("mov-cartao-qtd");
    expect(q1.textContent).toBe("+5");
    expect(q1.className).toMatch(/text-green-700/);
    expect(within(c1).getByTestId("mov-cartao-frase").textContent).toBe("Ana recebeu 5 de Base de duche(BD-1)");
    await waitFor(() => expect(within(c1).getByTestId("mov-cartao-notas").textContent).toMatch(/^Forn Lda · Palete 2 · custo 3,50\s€\/un$/));
    expect(within(c1).getByTestId("mov-cartao-mono").textContent).toBe("Entrada·PO-2026-0001·fica 12");
    // A ligação ao documento é a mesma da coluna Documento (purchase_orders.view).
    expect(within(c1).getByRole("link", { name: "PO-2026-0001" }).getAttribute("href")).toMatch(/open=po1/);
    // 2 — venda, sem utilizador
    const q2 = within(c2).getByTestId("mov-cartao-qtd");
    expect(q2.textContent).toBe("−1");
    expect(q2.className).not.toMatch(/text-green/);
    expect(within(c2).getByTestId("mov-cartao-frase").textContent).toMatch(/^Utilizador desconhecido deu saída de 1 de Base de duche/);
    expect(within(c2).queryByTestId("mov-cartao-notas")).toBeNull();
    expect(within(c2).getByRole("link", { name: "EC-2026-0084" }).getAttribute("href")).toMatch(/open=c1/);
    // 3 — transferência; armazém pelo nome da lista (warehouses null na linha)
    expect(within(c3).getByTestId("mov-cartao-quando").textContent).toMatch(/· Leiria$/);
    expect(within(c3).getByTestId("mov-cartao-frase").textContent).toBe("Rui transferiu (saída) 2 de Torneira");
    expect(within(c3).getByTestId("mov-cartao-mono").textContent).toBe("Transferência (saída)·TR-0001·fica 9");
    // Rodapé de sempre.
    expect(screen.getByText(/A mostrar 3 de 3 movimentos/)).toBeTruthy();
  });

  it("o custo segue products.view_cost e as ligações seguem as permissões do destino", async () => {
    perms.granted.delete("products.view_cost");
    perms.granted.delete("client_orders.view");
    montar(true);
    const [c1, c2] = await cartoes();
    expect(within(c1).getByTestId("mov-cartao-notas").textContent).toBe("Forn Lda · Palete 2");
    expect(within(c2).queryByRole("link", { name: "EC-2026-0084" })).toBeNull();
    expect(within(c2).getByText("EC-2026-0084")).toBeTruthy();
  });

  it("Registar abre o diálogo de movimento; sem inventory.edit / inventory.export os botões não aparecem (como hoje)", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /^Registar$/ }));
    expect(await screen.findByTestId("dialogo-movimento")).toBeTruthy();
  });

  it("sem inventory.edit nem inventory.export: sem Registar nem Exportar", async () => {
    perms.granted.delete("inventory.edit");
    perms.granted.delete("inventory.export");
    montar(true);
    await cartoes();
    const barra = screen.getByTestId("movimentos-barra");
    expect(within(barra).queryByRole("button", { name: /^Registar$/ })).toBeNull();
    expect(within(barra).queryByRole("button", { name: /Exportar/ })).toBeNull();
  });

  it("Filtros: o Documento filtra o livro (a mesma consulta) e o botão conta os filtros ativos", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const painel = await screen.findByRole("dialog", { name: "Filtros" });
    expect(within(painel).getByRole("combobox", { name: "Tipo" })).toBeTruthy();
    expect(within(painel).getByRole("combobox", { name: "Armazém" })).toBeTruthy();
    espias.chamadas = [];
    fireEvent.change(within(painel).getByLabelText("Documento"), { target: { value: "TR-0001" } });
    await waitFor(() =>
      expect(espias.chamadas.some((c) => c.tabela === "stock_movements" && c.metodo === "or" && String(c.args[0]).includes("document_number.ilike.%TR-0001%"))).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Filtros/, hidden: true }).textContent).toMatch(/Filtros\s*1 ativos/));
    fireEvent.click(within(painel).getByRole("button", { name: /Limpar filtros/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Filtros/, hidden: true }).textContent?.trim()).toBe("Filtros"));
  });

  it("o documento da transferência no cartão filtra as duas pernas (como na tabela)", async () => {
    montar(true);
    const [, , c3] = await cartoes();
    espias.chamadas = [];
    fireEvent.click(within(c3).getByRole("button", { name: "TR-0001" }));
    await waitFor(() =>
      expect(espias.chamadas.some((c) => c.metodo === "or" && String(c.args[0]).includes("document_number.ilike.%TR-0001%"))).toBe(true),
    );
  });

  it("Tabela mostra a tabela clássica e o cartão de filtros, sem o cabeçalho clássico; Cartões volta", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /Tabela/ }));
    expect(await screen.findByText("Livro de movimentos")).toBeTruthy();
    expect(screen.queryByTestId("mov-cartao")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Documento" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "sidebar.stockMovements" })).toBeNull();
    // Na Tabela a pesquisa e os Filtros são os clássicos (a barra fica com as ações e o alternador).
    expect(within(screen.getByTestId("movimentos-barra")).queryByRole("button", { name: /Filtros/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Cartões/ }));
    expect((await cartoes()).length).toBe(3);
  });
});
