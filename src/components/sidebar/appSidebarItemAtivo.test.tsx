// O menu lateral de RH de exemplo já não tem «Admissões»: «Pessoas» realça em todos os separadores da lista (`?tab=`) e a
// navegação não mexe nas entradas dos outros grupos. Tudo em memória; as dependências de permissões e contadores são simuladas.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AppSidebar } from "@/components/AppSidebar";

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, loading: false }),
}));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: null }) }));
vi.mock("@/contexts/SidebarContext", () => ({
  useSidebarExpand: () => ({
    openSectionId: "rh-exemplo",
    setOpenSectionId: vi.fn(),
    closeSubmenu: vi.fn(),
    isManuallyClosedRef: { current: false },
  }),
}));
vi.mock("@/hooks/useSidebarAlertCounts", () => ({ useSidebarAlertCounts: () => ({ sectionCounts: {} }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/components/inventory/ui/useInventoryCounters", () => ({ useInventoryCounters: () => () => null }));

function Endereco() {
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  return (
    <>
      <output data-testid="endereco">{`${pathname}${search}`}</output>
      <button type="button" data-testid="irParaAdmissoes" onClick={() => navegar("/rh-exemplo/pessoas?tab=admissoes")} />
    </>
  );
}

const botao = (texto: string): HTMLElement => {
  const encontrado = screen.getAllByText(texto).map((el) => el.closest("button")).find((b): b is HTMLButtonElement => b !== null);
  if (!encontrado) throw new Error(`Sem botão «${texto}»`);
  return encontrado;
};
const realcado = (el: HTMLElement): boolean => el.className.includes("border-primary");

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
});

describe("o item realçado do menu lateral acompanha o endereço", () => {
  it("o menu de RH não tem a entrada «Admissões», nem o contador «por aprovar»", () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/rh-exemplo/pessoas"]}>
          <AppSidebar userName="Teste" userRole="RH" />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.queryAllByText("Admissões")).toHaveLength(0);
    expect(screen.queryAllByText(/por aprovar/)).toHaveLength(0);
    expect(screen.getAllByText("Ver o Portal do colaborador (exemplo)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Organização").length).toBeGreaterThan(0);
  });

  it("«Pessoas» fica realçada em qualquer separador da lista, e navegar não mexe nas outras entradas", () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/rh-exemplo/pessoas"]}>
          <AppSidebar userName="Teste" userRole="RH" />
          <Endereco />
        </MemoryRouter>
      </LanguageProvider>,
    );
    const outras = [botao("Centros"), botao("Assiduidade e ausências"), botao("Organização")];
    const classesRail = () =>
      screen.getAllByRole("button").filter((b) => b.closest("[data-app-sidebar]") !== null).map((b) => b.className);

    expect(realcado(botao("Pessoas"))).toBe(true);
    const railAntes = classesRail();
    const outrasAntes = outras.map(realcado);
    expect(outrasAntes).toEqual([false, false, false]);

    // O separador «Admissões» da lista vive no endereço: «Pessoas» continua realçada e nada mais muda.
    act(() => screen.getByTestId("irParaAdmissoes").click());
    expect(screen.getByTestId("endereco").textContent).toBe("/rh-exemplo/pessoas?tab=admissoes");
    expect(realcado(botao("Pessoas"))).toBe(true);
    expect(classesRail()).toEqual(railAntes);
    expect(outras.map(realcado)).toEqual(outrasAntes);

    fireEvent.click(botao("Organização"));
    expect(screen.getByTestId("endereco").textContent).toBe("/rh-exemplo/organizacao");
    expect(realcado(botao("Organização"))).toBe(true);
    expect(realcado(botao("Pessoas"))).toBe(false);
    expect(realcado(botao("Centros"))).toBe(false);

    fireEvent.click(botao("Pessoas"));
    expect(screen.getByTestId("endereco").textContent).toBe("/rh-exemplo/pessoas");
    expect(realcado(botao("Pessoas"))).toBe(true);
    expect(realcado(botao("Organização"))).toBe(false);
    expect(classesRail()).toEqual(railAntes);
    expect(outras.map(realcado)).toEqual(outrasAntes);
  });
});
