// O canal de denúncias no menu lateral: UMA entrada «Denúncias» em «A minha área», «Denúncias» em «Recursos
// Humanos» com o contador de texto «N por confirmar» (só da organização ativa), e já sem o grupo próprio de antes.
// Tudo em memória; as dependências de permissões e contadores são simuladas.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { Megaphone } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AppSidebar } from "@/components/AppSidebar";
import { confirmarRececaoDe, repor } from "@/components/canal-denuncias/dados/loja";
import { canalDenunciasMinhaAreaTranslations as tr } from "@/translations/canalDenunciasMinhaArea";
import { menuSections } from "./menuConfig";

const grupoAberto = vi.hoisted(() => ({ id: "rh-exemplo" }));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, loading: false }),
}));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: null }) }));
vi.mock("@/contexts/SidebarContext", () => ({
  useSidebarExpand: () => ({
    openSectionId: grupoAberto.id,
    setOpenSectionId: vi.fn(),
    closeSubmenu: vi.fn(),
    isManuallyClosedRef: { current: false },
  }),
}));
vi.mock("@/hooks/useSidebarAlertCounts", () => ({ useSidebarAlertCounts: () => ({ sectionCounts: {} }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/components/inventory/ui/useInventoryCounters", () => ({ useInventoryCounters: () => () => null }));
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({ useNegociosAtivos: () => ({ ativo: true, momentoGanho: null, isLoading: false, isError: false }) }));
vi.mock("@/components/frota/useContadoresFrota", () => ({
  DICA_CONTADOR_FROTA: { hoje: "", viaturas: "", ocorrencias: "", manutencao: "" },
  TOM_CONTADOR_FROTA: { hoje: "bad", viaturas: "default", ocorrencias: "warn", manutencao: "warn" },
  useContadoresFrota: () => () => null,
}));

const mostrar = (grupo: string) => {
  grupoAberto.id = grupo;
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/rh-exemplo/pessoas"]}>
        <AppSidebar userName="Teste" userRole="RH" />
      </MemoryRouter>
    </LanguageProvider>,
  );
};

const botao = (texto: string): HTMLElement => {
  const encontrado = screen.getAllByText(texto).map((el) => el.closest("button")).find((b): b is HTMLButtonElement => b !== null);
  if (!encontrado) throw new Error(`Sem botão «${texto}»`);
  return encontrado;
};

const grupo = (id: string) => menuSections.find((s) => s.id === id)!;

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("o menu do canal de denúncias", () => {
  it("«Denúncias» é UMA só entrada em «A minha área», com as entradas de antes; «Denunciar» e «As minhas denúncias» já não existem", () => {
    expect(grupo("rh-exemplo-eu").items.map((i) => i.to)).toEqual([
      "/rh-exemplo/documentos", "/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/minhas-denuncias",
    ]);
    expect(grupo("rh-exemplo-eu").paths).toContain("/rh-exemplo/minhas-denuncias");
    expect(grupo("rh-exemplo-eu").paths).not.toContain("/rh-exemplo/denunciar");
    const entrada = grupo("rh-exemplo-eu").items.find((i) => i.to === "/rh-exemplo/minhas-denuncias")!;
    expect(entrada).toMatchObject({ labelKey: "sidebar.rhExemploMinhasDenuncias", permission: "users.view" });
    expect(entrada.icon).toBe(Megaphone);
    mostrar("rh-exemplo-eu");
    expect(screen.getByText("A minha área (exemplo)")).toBeInTheDocument();
    expect(botao("Denúncias")).toBeInTheDocument();
    expect(screen.queryByText("Denunciar")).not.toBeInTheDocument();
    expect(screen.queryByText("As minhas denúncias")).not.toBeInTheDocument();
    expect(tr.pt["sidebar.rhExemploMinhasDenuncias"]).toBe("Denúncias");
    expect(tr.pt["sidebar.rhExemploDenunciar"]).toBeUndefined();
    expect(tr.en["sidebar.rhExemploDenunciar"]).toBeUndefined();
  });

  it("o grupo separado «Canal de denúncias (exemplo)» desapareceu e nenhuma entrada leva às páginas públicas", () => {
    expect(menuSections.find((s) => s.id === "canal-denuncias")).toBeUndefined();
    const destinos = menuSections.flatMap((s) => [...s.items, ...(s.subSections?.flatMap((x) => x.items) ?? [])]).map((i) => i.to);
    expect(destinos.filter((to) => to.startsWith("/canal-denuncias"))).toEqual([]);
    mostrar("rh-exemplo");
    expect(screen.queryByText(/Canal de denúncias \(exemplo\)/)).not.toBeInTheDocument();
  });

  it("«Denúncias» está em «Recursos Humanos», para quem tem users.view, com o contador de texto", () => {
    const entrada = grupo("rh-exemplo").items.find((i) => i.to === "/rh-exemplo/denuncias")!;
    expect(entrada).toMatchObject({ labelKey: "sidebar.rhExemploDenuncias", permission: "users.view", textCounter: "rhDenunciasPorConfirmar" });
    expect(grupo("rh-exemplo").paths).toContain("/rh-exemplo/denuncias");
    expect(grupo("rh-exemplo").items.every((i) => i.permission === "users.view")).toBe(true);
  });

  it("o contador diz «2 por confirmar» e acompanha a gestão; as denúncias de outra organização não contam", () => {
    mostrar("rh-exemplo");
    const denuncias = botao("Denúncias");
    expect(within(denuncias).getByText("2 por confirmar")).toBeInTheDocument();
    act(() => { confirmarRececaoDe("d0041"); });
    expect(within(botao("Denúncias")).getByText("1 por confirmar")).toBeInTheDocument();
    act(() => { confirmarRececaoDe("d0040"); });
    expect(within(botao("Denúncias")).queryByText(/por confirmar/)).not.toBeInTheDocument();
  });

  it("os textos novos do menu existem em pt e en", () => {
    const chaves = [
      ...grupo("rh-exemplo-eu").items.slice(3).map((i) => i.labelKey), "sidebar.rhExemploDenuncias", "sidebar.rhExemploDenunciasPorConfirmar",
    ];
    for (const chave of chaves) {
      expect(tr.pt[chave]).toBeTruthy();
      expect(tr.en[chave]).toBeTruthy();
    }
    expect(tr.pt["sidebar.rhExemploDenunciasPorConfirmar"]).toBe("{n} por confirmar");
  });
});
