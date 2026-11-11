// @vitest-environment jsdom
// F9: a ficha do fornecedor abre com suppliers.view. Sem suppliers.edit o separador Dados não tem «Guardar»; os separadores
// Portal e Contrato seguem as suas permissões (portal_manage; o contrato decide pelo can_manage da RPC).
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const perms = vi.hoisted(() => ({ granted: new Set<string>(["suppliers.view"]) }));
const linhas = vi.hoisted(() => ({
  rows: [{ id: "i1", item_type: "product", products: { name: "Parafuso", sku: "P1" }, services: null, is_preferred: false,
    supplier_sku: "X", purchase_price: 1, currency: "EUR", lead_time_days: 2, is_active: true }] as unknown[],
}));
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
vi.mock("../useSupplierListStats", () => ({ useSupplierOrgStats: () => ({ data: null }) }));
vi.mock("../SupplierSummaryTab", () => ({ SupplierSummaryTab: () => <div>RESUMO</div> }));
vi.mock("../contract/SupplierContractTab", () => ({ SupplierContractTab: () => <div>CONTRATO-TAB</div> }));
vi.mock("../contract/SupplierContractBadge", () => ({ SupplierContractBadge: () => null }));
vi.mock("../contract/useSupplierContracts", () => ({ useSupplierContractOrgStatuses: () => ({ data: null }) }));
vi.mock("../useSupplierSheetData", () => ({
  supplierItemsKey: (id: string) => ["items", id],
  supplierPortalInviteKey: (id: string | null) => ["invite", id],
  useSupplierItems: () => ({ data: linhas.rows, isLoading: false, isError: false }),
  useSupplierPortalInvite: () => ({ data: null }),
}));

import { SupplierSheet, type SupplierSheetTab } from "../SupplierSheet";

beforeEach(() => {
  perms.granted = new Set(["suppliers.view"]);
});

const FORNECEDOR = { id: "s1", name: "Forn Lda", organization_id: "o1", is_active: true, code: "F1", email: null, contact_person: null } as never;

function setup(over: { canEdit?: boolean; canManagePortal?: boolean; tab?: SupplierSheetTab } = {}) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SupplierSheet
        open onClose={vi.fn()} supplier={FORNECEDOR} tab={over.tab ?? "dados"} onTabChange={vi.fn()}
        dataForm={<form id="f" />} formId="f" cancelLabel="Cancelar" submitLabel="Guardar" focusPriceChanges={false}
        canManagePortal={over.canManagePortal ?? false} canEdit={over.canEdit ?? false} fallbackOrganizationId="o1"
      />
    </QueryClientProvider>,
  );
}

describe("SupplierSheet com só suppliers.view (F9)", () => {
  it("em Dados sem editar: sem «Guardar» nem «Cancelar», só «Fechar»", () => {
    setup({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Fechar" }).length).toBeGreaterThan(0);
  });

  it("em Dados com editar: «Guardar» e «Cancelar» como hoje", () => {
    setup({ canEdit: true });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("o separador Portal mostra o portal com portal_manage, mesmo sem editar", () => {
    setup({ canEdit: false, canManagePortal: true, tab: "portal" });
    expect(screen.getByText("PORTAL-TAB")).toBeTruthy();
  });

  it("o separador Portal sem portal_manage diz que falta a permissão", () => {
    setup({ canEdit: false, canManagePortal: false, tab: "portal" });
    expect(screen.queryByText("PORTAL-TAB")).toBeNull();
    expect(screen.getByText(/Sem permissão para gerir o acesso/)).toBeTruthy();
  });

  it("o separador Contrato abre sem suppliers.edit (decide o can_manage da RPC)", () => {
    setup({ canEdit: false, tab: "contrato" });
    expect(screen.getByText("CONTRATO-TAB")).toBeTruthy();
  });

  it("os separadores continuam todos disponíveis", () => {
    setup({ canEdit: false });
    for (const nome of ["Resumo", "Dados", "Portal", "Contrato"]) {
      expect(screen.getByRole("tab", { name: new RegExp(nome) })).toBeTruthy();
    }
    fireEvent.keyDown(screen.getByRole("tab", { name: /Dados/ }), { key: "End" });
  });
});

describe("separador Artigos e preços só de leitura (F9, revisão)", () => {
  const remover = () => screen.queryByRole("button", { name: /Remover associação a Parafuso/ });

  it("com suppliers.view + view_pricing, sem products.edit nem services.edit: vê o artigo mas não o botão de remover", () => {
    perms.granted = new Set(["suppliers.view", "suppliers.view_pricing"]);
    setup({ tab: "artigos" });
    expect(screen.getByText("Parafuso")).toBeTruthy();
    expect(remover()).toBeNull();
  });

  it.each(["products.edit", "services.edit"])("com %s: o botão aparece (a base aceita qualquer das duas)", (p) => {
    perms.granted = new Set(["suppliers.view", p]);
    setup({ tab: "artigos" });
    expect(remover()).toBeTruthy();
  });
});
