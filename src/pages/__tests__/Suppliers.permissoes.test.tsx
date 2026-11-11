// @vitest-environment jsdom
// F9: a ficha do fornecedor abre com suppliers.view (a base nunca pede suppliers.edit). Só se muda o que a ficha deixa fazer:
// sem suppliers.edit o separador Dados fica só de leitura (canEdit=false). Supabase e filhos pesados simulados.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const SUPPLIER = vi.hoisted(() => ({
  id: "s1", name: "Forn Lda", organization_id: "o1", is_active: true, deleted_at: null, code: "F1", email: null, contact_person: null,
  phone: null, address: null, city: null, postal_code: null, country: null, tax_id: null, delivery_sla_days: null, website: null,
  notes: null, created_at: "2027-01-01", anew_organizations: { id: "o1", name: "Nike" },
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
vi.mock("@/components/BulkActionsBar", () => ({ BulkActionsBar: () => null }));
vi.mock("@/components/SupplierCatalogDialog", () => ({ default: () => null }));
vi.mock("@/components/SupplierSlaReportDialog", () => ({ default: () => null }));
vi.mock("@/components/suppliers/NewSupplierDialog", () => ({ NewSupplierDialog: () => null }));
vi.mock("@/components/suppliers/SupplierDataForm", () => ({ SupplierDataForm: () => null }));
vi.mock("@/components/suppliers/useSupplierListStats", () => ({
  useSupplierOrgStats: () => ({ data: null }),
  useSupplierRowStats: () => ({ data: null }),
}));
vi.mock("@/components/suppliers/SupplierRowStats", () => ({
  SupplierOpenPos: () => null, SupplierPortalBadge: () => null, SupplierPricesPending: () => null, SupplierSla: () => null,
}));
vi.mock("@/components/suppliers/contract/SupplierContractBadge", () => ({ SupplierContractBadge: () => null }));
vi.mock("@/components/suppliers/contract/useSupplierContracts", () => ({
  useSupplierContractOrgStatuses: () => ({ data: null }),
  useSupplierContractsList: () => ({ data: null }),
}));
vi.mock("@/components/suppliers/SupplierSheet", () => ({
  supplierSheetTabFromParams: () => "resumo",
  SupplierSheet: (p: { open: boolean; canEdit: boolean }) =>
    p.open ? <div data-testid="folha" data-can-edit={String(p.canEdit)} /> : null,
}));

import Suppliers from "../Suppliers";

const render_ = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TooltipProvider><MemoryRouter><Suppliers /></MemoryRouter></TooltipProvider>
  </QueryClientProvider>,
);

beforeEach(() => {
  perms.granted = new Set();
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("Suppliers: a ficha abre com suppliers.view (F9)", () => {
  it("só com suppliers.view: clicar na linha abre a ficha, em modo só de leitura", async () => {
    perms.granted = new Set(["suppliers.view", "suppliers.portal_manage"]);
    render_();
    fireEvent.click(await screen.findByText("Forn Lda"));
    const folha = await screen.findByTestId("folha");
    expect(folha.getAttribute("data-can-edit")).toBe("false");
  });

  it("o botão «Abrir» da linha está ativo só com suppliers.view", async () => {
    perms.granted = new Set(["suppliers.view"]);
    render_();
    await screen.findByText("Forn Lda");
    const abrir = screen.getByRole("button", { name: "Abrir" }) as HTMLButtonElement;
    expect(abrir.disabled).toBe(false);
    fireEvent.click(abrir);
    expect((await screen.findByTestId("folha")).getAttribute("data-can-edit")).toBe("false");
  });

  it("com suppliers.edit a ficha abre editável, como hoje", async () => {
    perms.granted = new Set(["suppliers.view", "suppliers.edit"]);
    render_();
    fireEvent.click(await screen.findByText("Forn Lda"));
    await waitFor(() => expect(screen.getByTestId("folha").getAttribute("data-can-edit")).toBe("true"));
  });

  const abrirMenu = async () => {
    await screen.findByText("Forn Lda");
    const gatilho = screen.getByRole("button", { name: /Mais ações para Forn Lda/ });
    fireEvent.keyDown(gatilho, { key: "Enter" });
  };

  it("o menu «Portal do fornecedor» só aparece com suppliers.view E suppliers.portal_manage", async () => {
    perms.granted = new Set(["suppliers.view"]);
    render_();
    await abrirMenu();
    expect(await screen.findByRole("menuitem", { name: /Abrir ficha/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Portal do fornecedor/ })).toBeNull();
  });

  it("com portal_manage o item «Portal do fornecedor» aparece", async () => {
    perms.granted = new Set(["suppliers.view", "suppliers.portal_manage"]);
    render_();
    await abrirMenu();
    expect(await screen.findByRole("menuitem", { name: /Portal do fornecedor/ })).toBeTruthy();
  });
});
