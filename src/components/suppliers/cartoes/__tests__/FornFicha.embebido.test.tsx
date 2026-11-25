// @vitest-environment jsdom
// A ficha do fornecedor (SupplierSheet) dentro da moldura do novo Inventário: separadores em pílula
// Resumo · Dados · Artigos · Preços · Portal · Contrato (com os contadores), pílulas de estado no cabeçalho e as MESMAS
// permissões de fora (Guardar só com editar, Portal só com portal_manage, Preços só com view_pricing/view_cost).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const perms = vi.hoisted(() => ({ granted: new Set<string>(["suppliers.view"]) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => perms.granted.has(p), loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/components/supplier-portal-crm/SupplierPortalCatalogSection", () => ({ default: () => <div>CATALOGO-PORTAL</div> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/supplier-portal-crm/types", () => ({ describeAccessError: () => "", invokePortalAccess: vi.fn() }));
vi.mock("@/components/supplier-portal-crm/SupplierPortalTab", () => ({ default: () => <div>PORTAL-TAB</div> }));
vi.mock("@/components/supplier-portal-crm/SupplierPriceChangesSection", () => ({ default: () => <div>PRECOS</div> }));
vi.mock("@/components/suppliers/useSupplierListStats", () => ({
  useSupplierOrgStats: () => ({
    data: { portal: new Map([["s1", "active"]]), awaiting: [], pricesPending: new Map([["s1", 2]]), catalogUnlinked: new Map() },
  }),
}));
vi.mock("@/components/suppliers/SupplierSummaryTab", () => ({ SupplierSummaryTab: () => <div>RESUMO</div> }));
vi.mock("@/components/suppliers/contract/SupplierContractTab", () => ({ SupplierContractTab: () => <div>CONTRATO-TAB</div> }));
vi.mock("@/components/suppliers/contract/useSupplierContracts", () => ({
  useSupplierContractOrgStatuses: () => ({
    data: new Map([["s1", { status: "signed", contractNumber: "CF-1", version: 1, validUntil: null, daysLeft: null, openVersion: null }]]),
  }),
}));
vi.mock("@/components/suppliers/useSupplierSheetData", () => ({
  supplierItemsKey: (id: string) => ["items", id],
  supplierPortalInviteKey: (id: string | null) => ["invite", id],
  useSupplierItems: () => ({ rows: [], isLoading: false, isError: false, hasNextPage: false }),
  useSupplierPortalInvite: () => ({ data: null }),
}));

import { InventarioEmbebido } from "@/components/inventory/ui/embebido";
import { SupplierSheet, type SupplierSheetTab } from "@/components/suppliers/SupplierSheet";

const FORNECEDOR = {
  id: "s1", name: "Forn Lda", organization_id: "o1", is_active: true, code: "FOR-0012", city: "Leiria", email: null,
  contact_person: null, deleted_at: null,
} as never;

const onTabChange = vi.fn();
function setup(over: { canEdit?: boolean; canManagePortal?: boolean; tab?: SupplierSheetTab; embebido?: boolean } = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InventarioEmbebido.Provider value={over.embebido ?? true}>
        <SupplierSheet
          open onClose={vi.fn()} supplier={FORNECEDOR} tab={over.tab ?? "dados"} onTabChange={onTabChange}
          dataForm={<form id="f" />} formId="f" cancelLabel="Cancelar" submitLabel="Guardar" focusPriceChanges={false}
          canManagePortal={over.canManagePortal ?? false} canEdit={over.canEdit ?? false} fallbackOrganizationId="o1"
        />
      </InventarioEmbebido.Provider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  perms.granted = new Set(["suppliers.view"]);
  onTabChange.mockClear();
});

describe("SupplierSheet embebido", () => {
  it("os 6 separadores em pílula, pela ordem do artefacto, com o contador dos preços", () => {
    perms.granted = new Set(["suppliers.view", "suppliers.view_pricing"]);
    setup();
    const tabs = within(screen.getByRole("tablist", { name: "Partes da ficha" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Resumo", "Dados", "Artigos", "Preços2", "Portal", "Contrato"]);
    expect(tabs[0].className).toMatch(/rounded-full/);
    fireEvent.click(tabs[4]);
    expect(onTabChange).toHaveBeenCalledWith("portal");
  });

  it("cabeçalho: «Fornecedor», código · cidade e as pílulas Ativo · Portal · Contrato", () => {
    setup();
    expect(screen.getByText("Fornecedor")).toBeTruthy();
    expect(screen.getByTestId("forn-ficha-subtitulo").textContent).toBe("FOR-0012 · Leiria");
    const pilulas = screen.getByTestId("forn-ficha-pilulas");
    expect(pilulas.textContent).toContain("Ativo");
    expect(pilulas.textContent).toContain("Portal: Ativo");
    expect(pilulas.textContent).toContain("Contrato: Assinado");
  });

  it("Dados sem editar: sem «Guardar»; com editar: «Guardar» e «Cancelar»", () => {
    setup({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    cleanup();
    setup({ canEdit: true });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("Portal: com portal_manage mostra o portal; sem, diz que falta a permissão", () => {
    setup({ tab: "portal", canManagePortal: true });
    expect(screen.getByText("PORTAL-TAB")).toBeTruthy();
    cleanup();
    setup({ tab: "portal", canManagePortal: false });
    expect(screen.queryByText("PORTAL-TAB")).toBeNull();
    expect(screen.getByText(/Sem permissão para gerir o acesso/)).toBeTruthy();
  });

  it("Preços: sem view_pricing/view_cost diz que falta a permissão; com, mostra a secção", () => {
    setup({ tab: "precos" });
    expect(screen.queryByText("PRECOS")).toBeNull();
    expect(screen.getByText(/ver os preços por aprovar requer suppliers.view_pricing/)).toBeTruthy();
    cleanup();
    perms.granted = new Set(["suppliers.view", "products.view_cost"]);
    setup({ tab: "precos" });
    expect(screen.getByText("PRECOS")).toBeTruthy();
  });

  it("Resumo e Contrato mantêm o conteúdo", () => {
    setup({ tab: "resumo" });
    expect(screen.getByText("RESUMO")).toBeTruthy();
    cleanup();
    setup({ tab: "contrato" });
    expect(screen.getByText("CONTRATO-TAB")).toBeTruthy();
  });

  it("fora da moldura: separadores e cabeçalho de sempre", () => {
    setup({ embebido: false });
    const tabs = within(screen.getByRole("tablist", { name: "Partes da ficha" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Resumo", "Dados", "Artigos e preços", "Preços por aprovar", "Portal", "Contrato"]);
    expect(screen.getByText("Compras › Fornecedor")).toBeTruthy();
    expect(screen.queryByTestId("forn-ficha-pilulas")).toBeNull();
  });
});
