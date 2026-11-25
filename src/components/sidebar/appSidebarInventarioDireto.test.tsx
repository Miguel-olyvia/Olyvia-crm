// Com o novo Inventário ligado (INVENTARIO_NOVO_ATIVO), o ícone do Inventário no rail abre logo /inventory/novo num
// clique, sem o painel lateral (os 9 separadores vivem lá dentro); estando no Inventário o painel não abre sozinho e o
// ícone fica aceso; a bolinha mostra o contador do «Hoje» (useInventoryCounters, chave "today").
// Com o interruptor desligado (VITE_INVENTARIO_CLASSICO=1) o clique abre o painel com a lista, como antes.
// O interruptor é lido ao carregar menuConfig.ts: cada montagem recarrega os módulos do projeto (vi.resetModules).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const estado = vi.hoisted(() => ({ ativo: true, hoje: 4 as number | null, pedidos: [] as boolean[] }));

vi.mock("@/pages/inventario-novo/separadores", async (orig) => {
  const m = await orig<typeof import("@/pages/inventario-novo/separadores")>();
  return { ...m, get INVENTARIO_NOVO_ATIVO() { return estado.ativo; } };
});
const PERMS = new Set(["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "warehouses.view"]);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => PERMS.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => PERMS.has(p)),
    loading: false,
  }),
}));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: null }) }));
// A bolinha de alertas da secção (useSidebarAlertCounts) é substituída pelo «Hoje» quando o ícone abre direto.
vi.mock("@/hooks/useSidebarAlertCounts", () => ({ useSidebarAlertCounts: () => ({ sectionCounts: { inventory: 9 } }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/components/inventory/ui/useInventoryCounters", () => ({
  useInventoryCounters: (enabled = true) => {
    estado.pedidos.push(enabled);
    return (k?: string) => (enabled && k === "today" ? estado.hoje : null);
  },
}));
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({ useNegociosAtivos: () => ({ ativo: false, momentoGanho: null, isLoading: false, isError: false }) }));
vi.mock("@/components/frota/useContadoresFrota", () => ({
  DICA_CONTADOR_FROTA: { hoje: "", viaturas: "", ocorrencias: "", manutencao: "" },
  TOM_CONTADOR_FROTA: { hoje: "bad", viaturas: "default", ocorrencias: "warn", manutencao: "warn" },
  useContadoresFrota: () => () => null,
}));

function Endereco() {
  const { pathname } = useLocation();
  return <output data-testid="endereco">{pathname}</output>;
}

async function montar(ativo: boolean, rota: string) {
  estado.ativo = ativo;
  estado.pedidos = [];
  window.localStorage.setItem("language", "pt");
  vi.resetModules();
  const [{ AppSidebar }, { LanguageProvider }, { SidebarExpandProvider }] = await Promise.all([
    import("@/components/AppSidebar"),
    import("@/contexts/LanguageContext"),
    import("@/contexts/SidebarContext"),
  ]);
  render(
    <LanguageProvider>
      <SidebarExpandProvider>
        <MemoryRouter initialEntries={[rota]}>
          <AppSidebar userName="Teste" userRole="Armazém" />
          <Endereco />
        </MemoryRouter>
      </SidebarExpandProvider>
    </LanguageProvider>,
  );
}

/** O botão do Inventário no rail: o único botão do rail com o ícone do carrinho (o rótulo vive na dica). */
const iconeInventario = (): HTMLButtonElement => {
  const botoes = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-app-sidebar] button"));
  const b = botoes.find((x) => x.querySelector("svg.lucide-shopping-cart"));
  if (!b) throw new Error("Sem o ícone do Inventário no rail");
  return b;
};
/** O painel lateral do Inventário (o título e os itens da lista). */
const painelAberto = (): boolean => screen.queryAllByText("Hoje").length > 0 || screen.queryAllByText("Armazéns").length > 0;
const aceso = (b: HTMLElement): boolean => b.className.includes("bg-primary");
const endereco = () => screen.getByTestId("endereco").textContent;

// Cada montagem recarrega os módulos do projeto (a frio, com a bateria toda em paralelo pode passar dos 5 s).
afterEach(() => {
  cleanup();
  estado.hoje = 4;
});

describe("interruptor ligado: o ícone do Inventário abre o novo Inventário, sem painel", { timeout: 30_000 }, () => {
  it("um clique navega para /inventory/novo e não abre o painel", async () => {
    await montar(true, "/leads");
    expect(painelAberto()).toBe(false);
    act(() => { fireEvent.click(iconeInventario()); });
    expect(endereco()).toBe("/inventory/novo");
    expect(painelAberto()).toBe(false);
    expect(aceso(iconeInventario())).toBe(true);
    // Um segundo clique não abre o painel (nem o fecha/abre em alternância).
    act(() => { fireEvent.click(iconeInventario()); });
    expect(painelAberto()).toBe(false);
  });

  it("numa rota /inventory/novo/... o painel não abre sozinho e o ícone fica aceso", async () => {
    await montar(true, "/inventory/novo/existencias");
    expect(painelAberto()).toBe(false);
    expect(aceso(iconeInventario())).toBe(true);
    expect(endereco()).toBe("/inventory/novo/existencias");
  });

  it("a bolinha mostra o contador «Hoje» (substitui o de alertas) e o botão diz o número", async () => {
    await montar(true, "/leads");
    const b = iconeInventario();
    expect(b.querySelector("[data-testid=bolinha-rail]")?.textContent).toBe("4");
    expect(b).toHaveAccessibleName("Inventário, 4 para tratar hoje");
    expect(estado.pedidos).toContain(true);
  });

  it("sem nada no «Hoje» não há bolinha e o botão diz só «Inventário»", async () => {
    estado.hoje = null;
    await montar(true, "/leads");
    const b = iconeInventario();
    expect(b.querySelector("[data-testid=bolinha-rail]")).toBeNull();
    expect(b).toHaveAccessibleName("Inventário");
  });
});

describe("interruptor desligado: tudo como antes", { timeout: 30_000 }, () => {
  it("o clique abre o painel com a lista e não navega; a bolinha é a de alertas da secção", async () => {
    await montar(false, "/leads");
    const b = iconeInventario();
    expect(b.querySelector("[data-testid=bolinha-rail]")?.textContent).toBe("9");
    expect(b).not.toHaveAttribute("aria-label");
    // Sem abreDireto o contador do Hoje não é pedido no rail.
    expect(estado.pedidos.every((x) => x === false)).toBe(true);
    act(() => { fireEvent.click(b); });
    expect(endereco()).toBe("/leads");
    expect(painelAberto()).toBe(true);
  });

  it("numa rota do Inventário o painel abre sozinho, como antes", async () => {
    await montar(false, "/stocks");
    expect(painelAberto()).toBe(true);
    expect(aceso(iconeInventario())).toBe(true);
  });
});
