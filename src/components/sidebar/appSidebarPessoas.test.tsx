// O item «Pessoas» do menu só aparece com a permissão pessoas.view E com organização ativa (`ativo` do useNegociosAtivos).
// 13/11: já não há interruptor por organização; a leitura da configuração do fecho (a carregar ou em erro) não esconde o
// item. Essa leitura só corre para quem já tem as permissões carregadas e pessoas.view.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AppSidebar } from "@/components/AppSidebar";
import type { NegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";
import { menuSections } from "./menuConfig";

const estado = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  permissoesACarregar: false,
  negocios: { ativo: false, momentoGanho: null, isLoading: false, isError: false, erroSemResposta: false, aRepetir: false },
  opcoes: [] as unknown[],
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.permissoes.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => estado.permissoes.has(p)),
    loading: estado.permissoesACarregar,
  }),
}));
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({
  useNegociosAtivos: (opcoes?: unknown) => { estado.opcoes.push(opcoes); return estado.negocios; },
}));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: null }) }));
vi.mock("@/contexts/SidebarContext", () => ({
  useSidebarExpand: () => ({
    openSectionId: "crm", setOpenSectionId: vi.fn(), closeSubmenu: vi.fn(), isManuallyClosedRef: { current: false },
  }),
}));
vi.mock("@/hooks/useSidebarAlertCounts", () => ({ useSidebarAlertCounts: () => ({ sectionCounts: {} }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/components/inventory/ui/useInventoryCounters", () => ({ useInventoryCounters: () => () => null }));
vi.mock("@/components/frota/useContadoresFrota", () => ({
  DICA_CONTADOR_FROTA: { hoje: "", viaturas: "", ocorrencias: "", manutencao: "" },
  TOM_CONTADOR_FROTA: { hoje: "bad", viaturas: "default", ocorrencias: "warn", manutencao: "warn" },
  useContadoresFrota: () => () => null,
}));

const TODAS = ["leads.view", "clients.view", "pessoas.view"];
function preparar(permissoes: string[], negocios: Partial<NegociosAtivos>, aCarregar = false) {
  estado.permissoes = new Set(permissoes);
  estado.permissoesACarregar = aCarregar;
  estado.opcoes = [];
  estado.negocios = { ativo: false, momentoGanho: null, isLoading: false, isError: false, erroSemResposta: false, aRepetir: false, ...negocios };
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/leads"]}>
        <AppSidebar userName="Teste" userRole="Admin" />
      </MemoryRouter>
    </LanguageProvider>,
  );
}
// Os itens do menu são botões (navegam com navigate), não ligações com href.
const tem = (nome: string): boolean => screen.queryAllByRole("button", { name: new RegExp(`^${nome}`) }).length > 0;
const ultimaOpcao = () => estado.opcoes[estado.opcoes.length - 1];

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
});

describe("menu: o item «Pessoas»", () => {
  it("visível com organização ativa e a permissão", () => {
    preparar(TODAS, { ativo: true });
    expect(tem("Pessoas")).toBe(true);
  });

  it("oculto sem organização ativa (ativo false)", () => {
    preparar(TODAS, { ativo: false });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto enquanto a organização carrega (ativo false)", () => {
    preparar(TODAS, { ativo: false, isLoading: true });
    expect(tem("Pessoas")).toBe(false);
  });

  it("visível enquanto a configuração do fecho ainda carrega: já não espera por ela", () => {
    preparar(TODAS, { ativo: true, isLoading: true });
    expect(tem("Pessoas")).toBe(true);
    expect(tem("Negócios")).toBe(true);
  });

  it("visível quando a leitura da configuração do fecho falhou", () => {
    preparar(TODAS, { ativo: true, isError: true, erroSemResposta: true });
    expect(tem("Pessoas")).toBe(true);
    expect(tem("Negócios")).toBe(true);
  });

  it("oculto sem a permissão pessoas.view, mesmo com organização ativa", () => {
    preparar(["leads.view", "clients.view"], { ativo: true });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto enquanto as permissões carregam (hook desabilitado, ativo false)", () => {
    preparar(TODAS, { ativo: false }, true);
    expect(tem("Pessoas")).toBe(false);
  });

  it.each([
    [{ ativo: false }],
    [{ ativo: false, isLoading: true }],
  ])("sem organização ativa nem Pessoas nem Negócios, e Leads e Clientes já não existem (%j)", (negocios) => {
    preparar(TODAS, negocios);
    expect(tem("Pessoas")).toBe(false);
    expect(tem("Negócios")).toBe(false);
    expect(tem("Leads")).toBe(false);
    expect(tem("Clientes")).toBe(false);
  });

  it("com pessoas.view e organização ativa aparecem Pessoas e Negócios (o da Emylia, 27/10), sem Leads nem Clientes", () => {
    preparar(TODAS, { ativo: true });
    expect(tem("Pessoas")).toBe(true);
    expect(tem("Negócios")).toBe(true);
    expect(tem("Leads")).toBe(false);
    expect(tem("Clientes")).toBe(false);
  });

  it("sem organização ativa a fila de submissões continua com a permissão dela", () => {
    preparar(["platform.pending_submissions.view"], { ativo: false });
    expect(tem("Pessoas")).toBe(false);
    expect(screen.queryAllByRole("button", { name: /submiss/i }).length).toBeGreaterThan(0);
  });

  it("leads.view e clients.view sozinhos não mostram nada do CRM", () => {
    preparar(["leads.view", "clients.view"], { ativo: true });
    expect(tem("Pessoas")).toBe(false);
    expect(tem("Negócios")).toBe(false);
    expect(tem("Leads")).toBe(false);
    expect(tem("Clientes")).toBe(false);
  });

  it("a leitura da configuração só é pedida com as permissões carregadas e pessoas.view", () => {
    preparar(TODAS, { ativo: true });
    expect(ultimaOpcao()).toEqual({ habilitado: true });
    cleanup();
    preparar(["leads.view", "clients.view"], { ativo: true });
    expect(ultimaOpcao()).toEqual({ habilitado: false });
    cleanup();
    preparar(TODAS, { ativo: false }, true);
    expect(ultimaOpcao()).toEqual({ habilitado: false });
  });

  // 28/10 (noite, Rúben): o Pipeline sai do menu
  it("só os itens /pessoas e /negocios dependem de useNegociosAtivos", () => {
    const itens = menuSections.flatMap((s) => [...s.items, ...(s.subSections?.flatMap((x) => x.items) ?? [])]);
    expect(itens.filter((i) => i.requiresNegociosAtivos).map((i) => i.to)).toEqual(["/pessoas", "/negocios"]);
  });
});
