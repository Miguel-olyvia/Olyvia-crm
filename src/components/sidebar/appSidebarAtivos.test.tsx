// O ícone «Ativos» no rail só aparece a quem tem ativos.view (sem a migration do registo nenhum papel a tem, por isso o menu fica
// escondido) e um clique abre /ativos direto, sem painel lateral.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const estado = vi.hoisted(() => ({ permissoes: new Set<string>() }));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.permissoes.has(p),
    hasAnyPermission: (L: string[]) => L.some((p) => estado.permissoes.has(p)),
    loading: false,
  }),
}));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: null }) }));
vi.mock("@/hooks/useSidebarAlertCounts", () => ({ useSidebarAlertCounts: () => ({ sectionCounts: {} }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/components/inventory/ui/useInventoryCounters", () => ({ useInventoryCounters: () => () => null }));
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

async function montar(permissoes: string[], rota = "/home") {
  estado.permissoes = new Set(permissoes);
  window.localStorage.setItem("language", "pt");
  const [{ AppSidebar }, { LanguageProvider }, { SidebarExpandProvider }] = await Promise.all([
    import("@/components/AppSidebar"),
    import("@/contexts/LanguageContext"),
    import("@/contexts/SidebarContext"),
  ]);
  render(
    <LanguageProvider>
      <SidebarExpandProvider>
        <MemoryRouter initialEntries={[rota]}>
          <AppSidebar userName="Teste" userRole="Admin" />
          <Endereco />
        </MemoryRouter>
      </SidebarExpandProvider>
    </LanguageProvider>,
  );
}

const iconeAtivos = () => screen.queryByRole("button", { name: "Ativos" });

afterEach(cleanup);

describe("menu lateral: Ativos", { timeout: 30_000 }, () => {
  it("sem ativos.view o ícone não aparece (nem com as permissões do Catálogo e do RH)", async () => {
    await montar(["services.view", "hr.pessoas.retribuicao.view", "ativos.edit"]);
    expect(iconeAtivos()).not.toBeInTheDocument();
  });

  it("com ativos.view o ícone aparece e um clique abre /ativos, sem painel", async () => {
    await montar(["ativos.view"]);
    const b = iconeAtivos();
    expect(b).toBeInTheDocument();
    act(() => { fireEvent.click(b!); });
    expect(screen.getByTestId("endereco").textContent).toBe("/ativos");
  });

  it("estando em /ativos o ícone fica aceso", async () => {
    await montar(["ativos.view"], "/ativos");
    expect(iconeAtivos()!.className).toContain("bg-primary");
  });
});
