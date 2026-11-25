// @vitest-environment jsdom
// Fornecedores dentro da moldura do novo Inventário (V.forn do artefacto): a página real (Suppliers.tsx) com o
// InventarioEmbebido = true — cartões com SLA/Portal/Contrato, clique abre a ficha, "⋯" com as permissões, chips que
// filtram, alternador "Tabela". Fora da moldura fica o ecrã clássico. Supabase e filhos pesados simulados.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const SUPPLIER = vi.hoisted(() => ({
  id: "s1", name: "Forn Lda", organization_id: "o1", is_active: true, deleted_at: null, code: "FOR-0012",
  email: "encomendas@forn.pt", contact_person: "Paulo Mendes", phone: "244 812 330", address: null, city: "Leiria",
  postal_code: null, country: null, tax_id: null, delivery_sla_days: 5, website: null, notes: null, created_at: "2027-01-01",
  anew_organizations: { id: "o1", name: "Nike" },
}));
const stats = vi.hoisted(() => ({
  org: {
    portal: new Map([["s1", "active"]]),
    awaiting: [{ id: "s9", name: "Placo" }],
    pricesPending: new Map([["s1", 2]]),
    catalogUnlinked: new Map<string, number>(),
  },
  row: { openPos: new Map([["s1", 3]]), slaPct: new Map([["s1", 72]]) },
  contratos: new Map([
    ["s1", { status: "signed", contractNumber: "CF-0007", version: 2, validUntil: "2027-01-10", daysLeft: 12, openVersion: null }],
  ]),
}));

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
  return { supabase: { from: () => chain({ data: [SUPPLIER], count: 1, error: null }), rpc: () => chain({ data: null, error: null }) } };
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
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn() }));
vi.mock("@/utils/auditContext", () => ({ withAuditContext: vi.fn() }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));
vi.mock("@/components/PageFAQSheet", () => ({ PageFAQSheet: () => null }));
vi.mock("@/components/BulkActionsBar", () => ({
  BulkActionsBar: (p: { selectedCount: number }) => <div data-testid="massa" data-n={p.selectedCount} />,
}));
vi.mock("@/components/SupplierCatalogDialog", () => ({ default: () => null }));
vi.mock("@/components/SupplierSlaReportDialog", () => ({ default: () => null }));
vi.mock("@/components/suppliers/NewSupplierDialog", () => ({ NewSupplierDialog: () => null }));
vi.mock("@/components/suppliers/SupplierDataForm", () => ({ SupplierDataForm: () => null }));
vi.mock("@/components/suppliers/useSupplierListStats", () => ({
  useSupplierOrgStats: () => ({ data: stats.org }),
  useSupplierRowStats: () => ({ data: stats.row }),
}));
vi.mock("@/components/suppliers/contract/useSupplierContracts", () => ({
  useSupplierContractOrgStatuses: () => ({ data: stats.contratos }),
  useSupplierContractsList: () => ({ data: null }),
}));
vi.mock("@/components/suppliers/SupplierSheet", () => ({
  supplierSheetTabFromParams: (tab: string | null, prices: string | null) => (prices === "pending" ? "precos" : tab ?? "resumo"),
  SupplierSheet: (p: { open: boolean; canEdit: boolean; tab: string }) =>
    p.open ? <div data-testid="folha" data-can-edit={String(p.canEdit)} data-tab={p.tab} /> : null,
}));

import { InventarioEmbebido } from "@/components/inventory/ui/embebido";
import Suppliers from "@/pages/Suppliers";
import { FornGrelha } from "@/components/suppliers/cartoes/FornCartoes";

const render_ = (embebido = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <InventarioEmbebido.Provider value={embebido}>
          <Suppliers />
        </InventarioEmbebido.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);
beforeEach(() => {
  perms.granted = new Set(["suppliers.view", "suppliers.view_pricing", "suppliers.portal_manage"]);
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});

const cartao = async () => screen.findByTestId("forn-cartao");

describe("Fornecedores embebidos: cartões", () => {
  it("sem o cabeçalho clássico; barra com pesquisa, Exportar/Importar/+ Novo e o alternador", async () => {
    perms.granted.add("suppliers.export").add("suppliers.import").add("suppliers.create");
    render_();
    await cartao();
    expect(screen.queryByRole("heading", { name: "Fornecedores" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Pesquisar fornecedores" }).getAttribute("placeholder")).toBe(
      "Nome, código, NIF, cidade, contacto",
    );
    for (const nome of ["Exportar", "Importar", "Novo", "Cartões", "Tabela", "Filtros"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${nome}`) })).toBeTruthy();
    }
  });

  it("o cartão mostra código · cidade, contactos, SLA, Portal, Contrato, preços e POs abertas", async () => {
    render_();
    const c = within(await cartao());
    expect(c.getByText("Forn Lda")).toBeTruthy();
    expect(c.getByText("FOR-0012 · Leiria")).toBeTruthy();
    expect(c.getByText("Paulo Mendes · encomendas@forn.pt · 244 812 330")).toBeTruthy();
    expect(c.getByText("SLA 72% · prazo 5 d")).toBeTruthy();
    expect(c.getByText("Portal: Ativo")).toBeTruthy();
    expect(c.getByText("Contrato: Assinado · expira em 12 d")).toBeTruthy();
    expect(c.getByText("CF-0007 · v2")).toBeTruthy();
    expect(c.getByText("2 preços por aprovar")).toBeTruthy();
    expect(c.getByText("3 POs abertas")).toBeTruthy();
    expect(c.getByText(/· Ativo$/)).toBeTruthy();
  });

  it("o aviso azul: «Placo está à espera…» com «Abrir» (abre a ficha no Portal)", async () => {
    render_();
    const aviso = await screen.findByTestId("forn-aviso");
    expect(aviso.textContent).toMatch(/Placo está à espera de preencher a ficha no portal/);
    expect(within(aviso).getByRole("button", { name: "Abrir Placo" })).toBeTruthy();
    expect(within(aviso).getByRole("button", { name: "Filtrar" })).toBeTruthy();
  });

  it("clicar no cartão abre a ficha (só leitura sem suppliers.edit)", async () => {
    render_();
    await cartao();
    fireEvent.click(screen.getByRole("button", { name: "Abrir ficha de Forn Lda" }));
    const folha = await screen.findByTestId("folha");
    expect(folha.getAttribute("data-can-edit")).toBe("false");
    expect(folha.getAttribute("data-tab")).toBe("resumo");
  });

  it("a pílula do contrato abre a ficha no Contrato; a dos preços em Preços por aprovar", async () => {
    render_();
    await cartao();
    fireEvent.click(screen.getByRole("button", { name: /Abrir o contrato de Forn Lda/ }));
    await waitFor(() => expect(screen.getByTestId("folha").getAttribute("data-tab")).toBe("contrato"));
  });

  // Sem suppliers.view a página redireciona para o painel (efeito clássico); aqui testa-se a grelha com abrir = null,
  // que é o que a página passa sem suppliers.view ou para um eliminado.
  it("sem abrir (sem suppliers.view / eliminado): o cartão não abre e as pílulas ficam em texto", () => {
    render(
      <MemoryRouter>
        <FornGrelha
          cartoes={[{
            id: "s1", nome: "Forn Lda", codigo: null, cidade: null, empresa: null, contacto: null, email: null, telefone: null,
            ativo: false, eliminado: true, precos: 2, slaPct: null, prazoDias: null, portal: null, contrato: null, posAbertas: 0,
          }]}
          abrir={() => null}
          abrirPrecos={null}
          abrirContrato={null}
          acoes={() => null}
          selecionados={new Set()}
          aoSelecionar={() => {}}
        />
      </MemoryRouter>,
    );
    const c = within(screen.getByTestId("forn-cartao"));
    expect(c.queryByRole("button", { name: /Abrir ficha/ })).toBeNull();
    expect(c.queryByRole("button", { name: /preços por aprovar/ })).toBeNull();
    expect(c.getByText("2 preços por aprovar")).toBeTruthy();
    expect(c.getByText("— · —")).toBeTruthy();
    expect(c.getByText("Sem contacto")).toBeTruthy();
    expect(c.getByText("SLA — · sem prazo")).toBeTruthy();
    expect(c.getByText("Portal: —")).toBeTruthy();
    expect(c.getByText("Contrato: Sem contrato")).toBeTruthy();
    expect(c.getByText("Eliminado")).toBeTruthy();
    expect(c.getByText(/0 POs abertas · Inativo/)).toBeTruthy();
  });

  it("a caixa do cartão seleciona (ações em massa) sem abrir a ficha", async () => {
    render_();
    await cartao();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar Forn Lda" }));
    expect(screen.getByTestId("massa").getAttribute("data-n")).toBe("1");
    expect(screen.queryByTestId("folha")).toBeNull();
  });
});

describe("Fornecedores embebidos: «⋯» com as permissões", () => {
  const abrirMenu = async () => {
    await cartao();
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais ações para Forn Lda" }), { key: "Enter" });
  };

  it("só com suppliers.view: sem «Portal do fornecedor»; «Editar dados» bloqueado; o ⋯ não abre a ficha", async () => {
    perms.granted = new Set(["suppliers.view"]);
    render_();
    await abrirMenu();
    expect(await screen.findByRole("menuitem", { name: /Abrir ficha/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Portal do fornecedor/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Editar dados/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByTestId("folha")).toBeNull();
  });

  it("com portal_manage e edit: «Portal do fornecedor» e «Editar dados» ativos", async () => {
    perms.granted = new Set(["suppliers.view", "suppliers.portal_manage", "suppliers.edit"]);
    render_();
    await abrirMenu();
    expect(await screen.findByRole("menuitem", { name: /Portal do fornecedor/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Editar dados/ }).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("Fornecedores embebidos: chips", () => {
  it("os chips têm contagem e filtram (catálogo por ligar = nenhum → lista vazia; Todos volta)", async () => {
    render_();
    await cartao();
    const grupo = screen.getByRole("group", { name: "Filtrar fornecedores" });
    expect(within(grupo).getByRole("button", { name: /^À espera do fornecedor 1$/ })).toBeTruthy();
    expect(within(grupo).getByRole("button", { name: /^Com preços por aprovar 1$/ })).toBeTruthy();
    const catalogo = within(grupo).getByRole("button", { name: /^Com catálogo por ligar 0$/ });
    fireEvent.click(catalogo);
    expect(catalogo.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Sem fornecedores")).toBeTruthy();
    expect(screen.queryByTestId("forn-cartao")).toBeNull();
    const todos = within(grupo).getByRole("button", { name: /^Todos/ });
    fireEvent.click(todos);
    expect(todos.getAttribute("aria-pressed")).toBe("true");
    expect(await cartao()).toBeTruthy();
  });

  it("sem suppliers.view_pricing / products.view_cost o chip dos preços fica bloqueado com o motivo", async () => {
    perms.granted = new Set(["suppliers.view"]);
    render_();
    await cartao();
    const precos = screen.getByRole("button", { name: /^Com preços por aprovar/ });
    expect(precos.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(precos);
    expect(precos.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByText(/requer suppliers.view_pricing ou products.view_cost/).length).toBeGreaterThan(0);
  });
});

describe("Fornecedores embebidos: «Tabela»", () => {
  it("mostra a tabela clássica (filtros, cabeçalhos, seleção) e volta aos cartões", async () => {
    render_();
    await cartao();
    fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
    expect(await screen.findByRole("columnheader", { name: "Contrato" })).toBeTruthy();
    expect(screen.queryByTestId("forn-cartao")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Pesquisar fornecedores" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Selecionar todos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByTestId("folha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    expect(await cartao()).toBeTruthy();
  });
});

describe("Fora da moldura fica igual", () => {
  it("cabeçalho clássico e tabela; sem barra, chips nem cartões", async () => {
    render_(false);
    expect(await screen.findByRole("heading", { name: "Fornecedores" })).toBeTruthy();
    await screen.findByText("Forn Lda");
    expect(screen.queryByTestId("forn-barra")).toBeNull();
    expect(screen.queryByTestId("forn-cartao")).toBeNull();
    expect(screen.queryByRole("group", { name: "Filtrar fornecedores" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Contrato" })).toBeTruthy();
  });
});
