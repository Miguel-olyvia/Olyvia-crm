// O item «Pessoas» do menu só aparece com a permissão pessoas.view E com o interruptor da organização ligado
// (falha fechada: a carregar ou em erro também o esconde). Leads e Clientes não são afetados. A leitura do
// interruptor só corre para quem já tem as permissões carregadas e pessoas.view.
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
  it("visível com o interruptor ligado e a permissão", () => {
    preparar(TODAS, { ativo: true });
    expect(tem("Pessoas")).toBe(true);
  });

  it("oculto quando a organização não tem o interruptor", () => {
    preparar(TODAS, { ativo: false });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto enquanto o interruptor carrega (falha fechada)", () => {
    preparar(TODAS, { ativo: false, isLoading: true });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto mesmo com ativo true se ainda carrega", () => {
    preparar(TODAS, { ativo: true, isLoading: true });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto quando a leitura do interruptor falhou", () => {
    preparar(TODAS, { ativo: false, isError: true, erroSemResposta: true });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto sem a permissão pessoas.view, mesmo com o interruptor ligado", () => {
    preparar(["leads.view", "clients.view"], { ativo: true });
    expect(tem("Pessoas")).toBe(false);
  });

  it("oculto enquanto as permissões carregam, com o interruptor desligado", () => {
    preparar(TODAS, { ativo: false }, true);
    expect(tem("Pessoas")).toBe(false);
  });

  it.each([
    [{ ativo: false }],
    [{ ativo: false, isLoading: true }],
    [{ ativo: false, isError: true, erroSemResposta: true }],
  ])("sem interruptor nem Pessoas nem Negócios, e Leads e Clientes já não existem (%j)", (negocios) => {
    preparar(TODAS, negocios);
    expect(tem("Pessoas")).toBe(false);
    expect(tem("Negócios")).toBe(false);
    expect(tem("Leads")).toBe(false);
    expect(tem("Clientes")).toBe(false);
  });

  it("com pessoas.view e o interruptor ligado aparecem Pessoas e Negócios (o da Emylia, 27/10), sem Leads nem Clientes", () => {
    preparar(TODAS, { ativo: true });
    expect(tem("Pessoas")).toBe(true);
    expect(tem("Negócios")).toBe(true);
    expect(tem("Leads")).toBe(false);
    expect(tem("Clientes")).toBe(false);
  });

  it("sem o interruptor a fila de submissões continua com a permissão dela", () => {
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

  it("a leitura do interruptor só é pedida com as permissões carregadas e pessoas.view", () => {
    preparar(TODAS, { ativo: true });
    expect(ultimaOpcao()).toEqual({ habilitado: true });
    cleanup();
    preparar(["leads.view", "clients.view"], { ativo: true });
    expect(ultimaOpcao()).toEqual({ habilitado: false });
    cleanup();
    preparar(TODAS, { ativo: false }, true);
    expect(ultimaOpcao()).toEqual({ habilitado: false });
  });

  // 28/10: o Pipeline voltou ao menu, ao lado dos Negócios da Emylia (/negocios)
  it("só os itens /pessoas, /pipeline e /negocios dependem do interruptor", () => {
    const itens = menuSections.flatMap((s) => [...s.items, ...(s.subSections?.flatMap((x) => x.items) ?? [])]);
    expect(itens.filter((i) => i.requiresNegociosAtivos).map((i) => i.to)).toEqual(["/pessoas", "/pipeline", "/negocios"]);
  });
});
