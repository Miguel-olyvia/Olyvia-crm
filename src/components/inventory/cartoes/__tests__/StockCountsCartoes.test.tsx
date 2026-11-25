// @vitest-environment jsdom
// Contagens no novo Inventário: dentro da moldura o StockCounts.tsx mostra a barra (chips + Filtros + Cartões/Tabela +
// "+ Nova contagem") e a grelha de cartões do artefacto (V.cnt); fora, o ecrã clássico igual (cabeçalho, pílulas, filtros,
// tabela). O StockCounts.tsx real, com o Supabase e os filhos pesados simulados.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const espias = vi.hoisted(() => ({ chamadas: [] as Array<{ tabela: string; metodo: string; args: unknown[] }> }));

const DADOS = vi.hoisted(() => ({
  contagens: [
    {
      id: "k1", document_number: "INV-2026-0011", status: "em_contagem", started_at: "2026-01-02T10:00:00Z", updated_at: "2026-01-02T10:00:00Z",
      finalized_at: null, warehouse_id: "w1", category_id: "cat1", warehouses: { name: "Leiria" }, product_categories: { name: "Canalização" },
    },
    {
      id: "k2", document_number: "INV-2026-0012", status: "finalizada", started_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-11T10:00:00Z",
      finalized_at: "2026-11-11T10:00:00Z", warehouse_id: "w2", category_id: null, warehouses: { name: "Pombal" }, product_categories: null,
    },
    {
      id: "k3", document_number: "INV-2026-0013", status: "cancelada", started_at: "2026-11-12T10:00:00Z", updated_at: "2026-11-12T10:00:00Z",
      finalized_at: null, warehouse_id: "w1", category_id: null, warehouses: { name: "Leiria" }, product_categories: null,
    },
  ],
  linhas: [
    { inventory_count_id: "k1", counted_quantity: 58, system_quantity_at_start: 58, discrepancy_resolution: null, updated_at: "2026-01-02T10:00:00Z", counted_at: null },
    { inventory_count_id: "k1", counted_quantity: 1, system_quantity_at_start: 2, discrepancy_resolution: null, updated_at: "2026-01-02T10:00:00Z", counted_at: null },
    { inventory_count_id: "k1", counted_quantity: null, system_quantity_at_start: 9, discrepancy_resolution: null, updated_at: "2026-01-02T10:00:00Z", counted_at: null },
    { inventory_count_id: "k2", counted_quantity: 4, system_quantity_at_start: 4, discrepancy_resolution: null, updated_at: "2026-11-11T10:00:00Z", counted_at: null },
    { inventory_count_id: "k2", counted_quantity: 3, system_quantity_at_start: 3, discrepancy_resolution: null, updated_at: "2026-11-11T10:00:00Z", counted_at: null },
  ],
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (tabela: string, result: unknown): unknown => {
    const p: unknown = new Proxy(function () {}, {
      get: (_t, key) => {
        if (key === "then") return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
        // ?open=<id>: a página confirma que a contagem é da organização ativa.
        if (key === "maybeSingle") return () => chain(tabela, { data: { id: "k1", organization_id: "o1" }, error: null });
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
          tabela === "inventory_counts" ? { data: DADOS.contagens, count: DADOS.contagens.length, error: null }
          : tabela === "inventory_count_lines" ? { data: DADOS.linhas, error: null }
          : tabela === "warehouses" ? { data: [{ id: "w1", name: "Leiria" }, { id: "w2", name: "Pombal" }], error: null }
          : { data: [], count: 0, error: null },
        ),
      rpc: () => chain("rpc", { data: null, error: null }),
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
// t e toast estáveis (como na app): o StockCounts tem efeitos que dependem deles.
const estaveis = vi.hoisted(() => ({
  t: (k: string, v?: { count?: number }) => (v?.count != null ? `${k}:${v.count}` : k),
  toast: () => {},
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: estaveis.t }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: estaveis.toast }) }));
vi.mock("@/hooks/useProductCategories", () => ({
  useProductCategories: () => ({ topLevelCategories: [{ id: "cat1", name: "Canalização" }], resolveFilterIds: () => null, error: null }),
}));
vi.mock("@/components/inventory/InventoryCountDetailDialog", () => ({
  default: ({ open, countId }: { open: boolean; countId: string | null }) => (open ? <div data-testid="detalhe-contagem">{countId}</div> : null),
}));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));

import StockCounts from "@/pages/StockCounts";

const montar = (embebido: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/stock-counts"]}>
          <InventarioEmbebido.Provider value={embebido}>
            <StockCounts />
          </InventarioEmbebido.Provider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );

const cartoes = () => screen.findAllByTestId("contagem-cartao");

beforeEach(() => {
  perms.granted = new Set(["inventory.view", "inventory.count"]);
  espias.chamadas = [];
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("Contagens fora da moldura", () => {
  it("fica igual: cabeçalho, pílulas, filtros e a tabela clássica, sem barra nem cartões", async () => {
    montar(false);
    expect(await screen.findByRole("heading", { name: "Contagens" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Estado das contagens" })).toBeTruthy();
    expect(await screen.findByRole("columnheader", { name: "Discrepâncias" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(4));
    expect(screen.queryByTestId("contagens-barra")).toBeNull();
    expect(screen.queryByTestId("contagem-cartao")).toBeNull();
    expect(screen.queryByRole("group", { name: "Mostrar como" })).toBeNull();
  });
});

describe("Contagens dentro da moldura", () => {
  it("sem o cabeçalho clássico: chips Todas · Em contagem · Finalizadas · Canceladas, + Nova contagem e um cartão por contagem", async () => {
    montar(true);
    expect((await cartoes()).length).toBe(3);
    expect(screen.queryByRole("heading", { name: "Contagens" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Discrepâncias" })).toBeNull();
    const chips = within(screen.getByRole("group", { name: "Estado das contagens" })).getAllByRole("button");
    expect(chips.map((b) => b.textContent)).toEqual(["Todas3", "Em contagem3", "Finalizadas3", "Canceladas3"]);
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Nova contagem/ })).toBeTruthy();
  });

  it("cada cartão: Armazém · Categoria, documento, pílula (Parada há N dias a âmbar), % grande, progresso e discrepâncias", async () => {
    montar(true);
    const [c1, c2, c3] = await cartoes();
    expect(within(c1).getByText("Leiria · Canalização")).toBeTruthy();
    expect(within(c1).getByText("INV-2026-0011")).toBeTruthy();
    const parada = within(c1).getByText(/^Parada há \d+ dias$/);
    expect(parada.closest("span")?.className).toMatch(/amber/);
    expect(within(c1).getByTestId("contagem-cartao-pct").textContent).toBe("67% contado");
    expect(within(c1).getByRole("progressbar", { name: "2 de 3 contadas" }).getAttribute("aria-valuenow")).toBe("2");
    expect(within(c1).getByTestId("contagem-cartao-disc").textContent).toBe(
      "1 discrepância · 1 por resolver · stockCounts.uncountedWithStockBadge:1",
    );

    expect(within(c2).getByText("Pombal · Todas")).toBeTruthy();
    expect(within(c2).getByText("Finalizada")).toBeTruthy();
    expect(within(c2).getByTestId("contagem-cartao-pct").textContent).toBe("100% contado");
    expect(within(c2).getByTestId("contagem-cartao-disc").textContent).toBe("Sem discrepâncias");

    expect(within(c3).getByText("Cancelada")).toBeTruthy();
    expect(within(c3).getByTestId("contagem-cartao-pct").textContent).toBe("0% contado");
  });

  it("clicar no cartão abre o mesmo diálogo de contagem (InventoryCountDetailDialog)", async () => {
    montar(true);
    const [c1] = await cartoes();
    fireEvent.click(within(c1).getByRole("button", { name: /Abrir a contagem INV-2026-0011/ }));
    expect((await screen.findByTestId("detalhe-contagem")).textContent).toBe("k1");
  });

  it("o ⋯ tem as ações da tabela: Ver movimentos de ajuste só nas finalizadas", async () => {
    montar(true);
    const [c1, c2] = await cartoes();
    fireEvent.keyDown(within(c2).getByRole("button", { name: "Mais ações para INV-2026-0012" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Ver movimentos de ajuste/ })).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    fireEvent.keyDown(within(c1).getByRole("button", { name: "Mais ações para INV-2026-0011" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Abrir detalhe/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Ver movimentos de ajuste/ })).toBeNull();
  });

  it("os chips filtram pelo estado (a mesma consulta, com ?status=)", async () => {
    montar(true);
    await cartoes();
    espias.chamadas = [];
    fireEvent.click(screen.getByRole("button", { name: /^Em contagem/ }));
    await waitFor(() =>
      expect(espias.chamadas.some((c) => c.tabela === "inventory_counts" && c.metodo === "eq" && c.args[0] === "status" && c.args[1] === "em_contagem")).toBe(true),
    );
    expect(screen.getByRole("button", { name: /^Em contagem/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Filtros: a pesquisa do documento entra na consulta e o botão conta o filtro", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const painel = await screen.findByRole("dialog", { name: "Filtros" });
    expect(within(painel).getByRole("combobox", { name: "Armazém" })).toBeTruthy();
    expect(within(painel).getByRole("combobox", { name: "Categoria" })).toBeTruthy();
    espias.chamadas = [];
    fireEvent.change(within(painel).getByLabelText("Documento"), { target: { value: "0012" } });
    await waitFor(() =>
      expect(espias.chamadas.some((c) => c.metodo === "ilike" && c.args[0] === "document_number" && c.args[1] === "%0012%")).toBe(true),
    );
    expect(screen.getByRole("button", { name: /Filtros/, hidden: true }).textContent).toMatch(/Filtros\s*1 ativos/);
  });

  it("+ Nova contagem abre o diálogo de criação; sem inventory.count/edit fica bloqueada com o motivo", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /Nova contagem/ }));
    expect(await screen.findByText("stockCounts.create.title")).toBeTruthy();
  });

  it("sem permissão de criar: bloqueada (aria-disabled), não abre e diz porquê", async () => {
    perms.granted = new Set(["inventory.view"]);
    montar(true);
    await cartoes();
    const botao = screen.getByRole("button", { name: /Nova contagem/ });
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(botao);
    expect(screen.queryByText("stockCounts.create.title")).toBeNull();
    expect(screen.getAllByText(/Sem permissão/).length).toBeGreaterThan(0);
  });

  it("Tabela mostra as pílulas, os filtros e a tabela clássicos, sem o cabeçalho; Cartões volta", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /Tabela/ }));
    expect(await screen.findByRole("columnheader", { name: "Discrepâncias" })).toBeTruthy();
    expect(screen.queryByTestId("contagem-cartao")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Contagens" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "stockCounts.searchPlaceholder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Cartões/ }));
    expect((await cartoes()).length).toBe(3);
  });
});
