// @vitest-environment jsdom
// Armazéns no novo Inventário: dentro da moldura o Warehouses.tsx mostra a barra (Ver eliminados, Exportar, Importar,
// "+ Novo armazém", Cartões/Detalhe) e a grelha de cartões do artefacto (V.arm); fora, o ecrã clássico igual.
// O Warehouses.tsx real, com o Supabase e os filhos pesados simulados.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const espias = vi.hoisted(() => ({ rpc: [] as Array<[string, unknown]>, exportar: 0, movimento: [] as Array<string | undefined> }));

const DADOS = vi.hoisted(() => {
  const armazem = (id: string, name: string, code: string, extra: Record<string, unknown>) => ({
    id, name, code, address: null, city: null, postal_code: null, country: null, manager_name: null, phone: null, email: null,
    capacity: null, is_active: true, serves_customers: true, latitude: null, longitude: null, deleted_at: null, is_vehicle: false,
    organization_id: "o1", created_at: "2026-01-01", updated_at: "2026-01-01", created_by: null, ...extra,
  });
  return {
    armazens: [
      armazem("w1", "Leiria", "LEI", { address: "Rua da Zona Industrial 4", postal_code: "2400-001", city: "Leiria" }),
      armazem("w2", "Coimbra", "COI", { city: "Coimbra", serves_customers: false }),
    ],
    stocks: [
      { id: "s1", warehouse_id: "w1", quantity: 10, reorder_point: 2 },
      { id: "s2", warehouse_id: "w1", quantity: 1, reorder_point: 5 },
      { id: "s3", warehouse_id: "w2", quantity: 3, reorder_point: 0 },
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
          tabela === "warehouses" ? { data: DADOS.armazens, error: null }
          : tabela === "stocks" ? { data: DADOS.stocks, error: null }
          : { data: [], error: null },
        ),
      rpc: (nome: string, args: unknown) => {
        espias.rpc.push([nome, args]);
        return chain({ data: null, error: null });
      },
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    },
  };
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => perms.granted.has(p),
    hasAnyPermission: (l: string[]) => l.some((p) => perms.granted.has(p)),
    hasModuleAccess: () => true,
    permissions: [...perms.granted],
    loading: false,
  }),
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "o1", name: "Nike" }, isLoading: false }),
}));
// t e toast estáveis (como na app).
const estaveis = vi.hoisted(() => ({ t: (k: string) => k, toast: () => {} }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: estaveis.t }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: estaveis.toast }) }));
vi.mock("@/lib/custosStock", () => ({ valorStockPorArmazem: async () => ({ w1: 18960.1, w2: 8347.5 }) }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => "bu1") }));
vi.mock("@/utils/auditContext", () => ({ withAuditContext: vi.fn() }));
vi.mock("@/utils/warehousesExportImport", () => ({
  exportWarehousesToCSV: () => {
    espias.exportar += 1;
  },
  parseWarehousesCSV: () => [],
}));
vi.mock("@/components/inventory/InventorySettingsCard", () => ({
  useInventorySettings: () => ({ data: { default_warehouse_id: "w1" } }),
  InventorySettingsCard: () => <div data-testid="definicoes-inventario" />,
}));
vi.mock("@/components/inventory/StockMovementDialog", () => ({
  default: ({ open, defaultWarehouseId }: { open: boolean; defaultWarehouseId?: string }) => {
    if (open) espias.movimento.push(defaultWarehouseId);
    return open ? <div data-testid="dialogo-movimento">{defaultWarehouseId}</div> : null;
  },
}));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));

import Warehouses from "@/pages/Warehouses";

const montar = (embebido: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/warehouses"]}>
          <InventarioEmbebido.Provider value={embebido}>
            <Warehouses />
          </InventarioEmbebido.Provider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );

const cartoes = () => screen.findAllByTestId("armazem-cartao");
const abrirMenu = async (nome: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: `Mais ações para ${nome}` }), { key: "Enter" });
  return screen.findByRole("menu");
};

beforeEach(() => {
  perms.granted = new Set([
    "warehouses.view", "warehouses.edit", "warehouses.create", "warehouses.delete", "warehouses.export", "warehouses.import",
    "inventory.edit", "products.view_cost",
  ]);
  espias.rpc = [];
  espias.exportar = 0;
  espias.movimento = [];
  // Os Switch do Radix (formulário do armazém) medem-se com o ResizeObserver, que o jsdom não tem.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("Armazéns fora da moldura", () => {
  it("fica igual: cabeçalho, definições, a grelha clássica com todos os campos e botões, sem barra nem cartões novos", async () => {
    montar(false);
    expect(await screen.findByRole("heading", { name: "Armazéns" })).toBeTruthy();
    expect(screen.getByTestId("definicoes-inventario")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Ver existências" }).length).toBe(2);
    expect(screen.getAllByText("abaixo do ponto de encomenda").length).toBe(2);
    expect(screen.getByRole("button", { name: /warehouses.actions.import/ })).toBeTruthy();
    expect(screen.queryByTestId("armazens-barra")).toBeNull();
    expect(screen.queryByTestId("armazem-cartao")).toBeNull();
  });
});

describe("Armazéns dentro da moldura", () => {
  it("sem o cabeçalho clássico: a barra (Ver eliminados, Exportar, Importar, + Novo armazém, Cartões/Detalhe) e um cartão por armazém", async () => {
    montar(true);
    expect((await cartoes()).length).toBe(2);
    expect(screen.queryByRole("heading", { name: "Armazéns" })).toBeNull();
    const barra = screen.getByTestId("armazens-barra");
    for (const nome of [/warehouses.showDeleted/, /warehouses.actions.export/, /warehouses.actions.import/, /warehouses.addWarehouse/, /Cartões/, /Detalhe/]) {
      expect(within(barra).getByRole("button", { name: nome })).toBeTruthy();
    }
    // As definições do inventário continuam no ecrã (por baixo da grelha).
    expect(screen.getByTestId("definicoes-inventario")).toBeTruthy();
  });

  it("cada cartão: nome, pílula Serve / Não serve clientes, morada, valor em grande e N produtos", async () => {
    montar(true);
    const [c1, c2] = await cartoes();
    expect(within(c1).getByRole("heading", { name: "Leiria" })).toBeTruthy();
    expect(within(c1).getByText("Serve clientes", { selector: "span" })).toBeTruthy();
    expect(within(c1).getByText("Rua da Zona Industrial 4, 2400-001 Leiria")).toBeTruthy();
    await waitFor(() => expect(within(c1).getByTestId("armazem-cartao-valor").textContent).toMatch(/^18\s960\s€$/));
    expect(within(c1).getByTestId("armazem-cartao-produtos").textContent).toBe("2 produtos · 1 abaixo do ponto de encomenda");
    expect(within(c1).getByText("Por defeito")).toBeTruthy();
    expect(within(c2).getByText("Não serve clientes")).toBeTruthy();
    expect(within(c2).getByText("Coimbra", { selector: "span" })).toBeTruthy();
    expect(within(c2).getByTestId("armazem-cartao-produtos").textContent).toBe("1 produtos · 0 abaixo do ponto de encomenda");
    // O cartão abre as Existências do armazém.
    expect(within(c1).getByRole("link", { name: "Ver existências de Leiria" }).getAttribute("href")).toMatch(/warehouse=w1/);
  });

  it("o valor segue products.view_cost (como hoje)", async () => {
    perms.granted.delete("products.view_cost");
    montar(true);
    const [c1] = await cartoes();
    await waitFor(() => expect(within(c1).getByTestId("armazem-cartao-produtos").textContent).toMatch(/^2 produtos/));
    expect(within(c1).getByTestId("armazem-cartao-valor").textContent).toBe("—sem acesso aos custos");
  });

  it("o ⋯: Editar abre o formulário, Movimentos recentes e Registar movimento abrem os diálogos, Eliminar confirma e chama a RPC", async () => {
    montar(true);
    await cartoes();
    let menu = await abrirMenu("Leiria");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent?.trim())).toEqual([
      "Editar", "Movimentos recentes", "Registar movimento", "Ver no livro de movimentos", "Eliminar",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Editar/ }));
    expect(await screen.findByRole("heading", { name: "warehouses.editWarehouse" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "warehouses.editWarehouse" })).toBeNull());

    menu = await abrirMenu("Leiria");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Registar movimento/ }));
    expect((await screen.findByTestId("dialogo-movimento")).textContent).toBe("w1");

    menu = await abrirMenu("Coimbra");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Eliminar/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Eliminar Coimbra")).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(espias.rpc).toContainEqual(["rpc_delete_warehouse", { p_id: "w2" }]));
  });

  it("sem warehouses.edit/delete: Editar e Eliminar ficam bloqueados no ⋯ e os interruptores mostram o «i» com o motivo", async () => {
    perms.granted.delete("warehouses.edit");
    perms.granted.delete("warehouses.delete");
    montar(true);
    const [c1] = await cartoes();
    const interruptores = within(c1).getAllByRole("switch");
    expect(interruptores.length).toBe(2);
    for (const s of interruptores) expect(s.hasAttribute("disabled")).toBe(true);
    expect(within(c1).getByRole("button", { name: "Porque está bloqueado: warehouses.form.active" })).toBeTruthy();
    expect(within(c1).getByRole("button", { name: "Porque está bloqueado: Serve clientes" })).toBeTruthy();
    const menu = await abrirMenu("Leiria");
    expect(within(menu).getByRole("menuitem", { name: /Editar/ }).getAttribute("aria-disabled")).toBe("true");
    expect(within(menu).getByRole("menuitem", { name: /Eliminar/ }).getAttribute("aria-disabled")).toBe("true");
    expect(within(menu).getAllByText(/Sem permissão/).length).toBeGreaterThan(0);
  });

  it("Exportar, Importar e + Novo armazém usam os mesmos handlers e diálogos; sem as permissões não aparecem", async () => {
    montar(true);
    await cartoes();
    const barra = screen.getByTestId("armazens-barra");
    fireEvent.click(within(barra).getByRole("button", { name: /warehouses.actions.export/ }));
    expect(espias.exportar).toBe(1);
    fireEvent.click(within(barra).getByRole("button", { name: /warehouses.actions.import/ }));
    expect(await screen.findByText("warehouses.import.title")).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("warehouses.import.title")).toBeNull());
    fireEvent.click(within(barra).getByRole("button", { name: /warehouses.addWarehouse/ }));
    expect(await screen.findByRole("heading", { name: "warehouses.addWarehouse" })).toBeTruthy();
  });

  it("sem export/import/create: a barra não tem esses botões", async () => {
    for (const p of ["warehouses.export", "warehouses.import", "warehouses.create"]) perms.granted.delete(p);
    montar(true);
    await cartoes();
    const barra = screen.getByTestId("armazens-barra");
    expect(within(barra).queryByRole("button", { name: /warehouses.actions.export/ })).toBeNull();
    expect(within(barra).queryByRole("button", { name: /warehouses.actions.import/ })).toBeNull();
    expect(within(barra).queryByRole("button", { name: /warehouses.addWarehouse/ })).toBeNull();
  });

  it("Detalhe mostra a grelha clássica (o Armazéns não tem tabela), sem o cabeçalho; Cartões volta", async () => {
    montar(true);
    await cartoes();
    fireEvent.click(screen.getByRole("button", { name: /Detalhe/ }));
    expect((await screen.findAllByRole("link", { name: "Ver existências" })).length).toBe(2);
    expect(screen.queryByTestId("armazem-cartao")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Armazéns" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Cartões/ }));
    expect((await cartoes()).length).toBe(2);
  });
});
