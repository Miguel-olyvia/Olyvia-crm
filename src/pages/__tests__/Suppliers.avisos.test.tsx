// @vitest-environment jsdom
// Fatia 4 do novo Inventário: o handleDelete do Fornecedores ganhou UMA linha no ramo de sucesso —
// avisos?.("eliminado", { tipo, id, rotulo }). Fora da moldura (sem AvisosInventario) faz exatamente o mesmo de antes:
// a mesma RPC, o mesmo toast, a lista relida. Dentro, avisa a moldura com o fornecedor eliminado.
// (O mesmo arnês do Suppliers.permissoes.test.tsx: Supabase e filhos pesados simulados.)
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AvisosInventario, type AvisarInventario } from "@/components/inventory/ui/embebido";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const espias = vi.hoisted(() => ({ rpc: [] as Array<[string, unknown]>, toast: [] as unknown[] }));
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
  return {
    supabase: {
      from: () => chain({ data: [SUPPLIER], count: 1, error: null }),
      rpc: (nome: string, args: unknown) => { espias.rpc.push([nome, args]); return chain({ data: null, error: null }); },
    },
  };
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
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (x: unknown) => { espias.toast.push(x); } }) }));
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
  SupplierSheet: () => null,
}));

import Suppliers from "../Suppliers";

const render_ = (avisar?: AvisarInventario) => {
  const ecra = <Suppliers />;
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter>{avisar ? <AvisosInventario.Provider value={avisar}>{ecra}</AvisosInventario.Provider> : ecra}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

/** Mais ações → Eliminar → confirmar (o AlertDialog do ecrã). Devolve quando a RPC de eliminar foi chamada. */
const eliminar = async () => {
  await screen.findByText("Forn Lda");
  fireEvent.keyDown(screen.getByRole("button", { name: /Mais ações para Forn Lda/ }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: /common\.delete/ }));
  const dialogo = await screen.findByRole("alertdialog");
  fireEvent.click(screen.getAllByRole("button", { name: "common.delete" }).find((b) => dialogo.contains(b)) as HTMLElement);
  await waitFor(() => expect(espias.rpc.map(([n]) => n)).toContain("rpc_delete_supplier"));
};

beforeEach(() => {
  perms.granted = new Set(["suppliers.view", "suppliers.delete"]);
  espias.rpc = [];
  espias.toast = [];
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("Suppliers.handleDelete e o novo Inventário (fatia 4)", () => {
  it("fora da moldura faz o mesmo de antes: a mesma RPC, o mesmo toast, nada mais", async () => {
    render_();
    await eliminar();
    expect(espias.rpc.filter(([n]) => n.startsWith("rpc_delete") || n.startsWith("rpc_restore"))).toEqual([["rpc_delete_supplier", { p_id: "s1" }]]);
    await waitFor(() => expect(espias.toast).toContainEqual({ title: "suppliers.toast.deleteSuccess" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("dentro da moldura faz o mesmo e avisa: eliminado { tipo: fornecedor, id, rotulo }", async () => {
    const avisar = vi.fn();
    render_(avisar);
    await eliminar();
    expect(espias.rpc.filter(([n]) => n.startsWith("rpc_delete") || n.startsWith("rpc_restore"))).toEqual([["rpc_delete_supplier", { p_id: "s1" }]]);
    await waitFor(() => expect(avisar).toHaveBeenCalledWith("eliminado", { tipo: "fornecedor", id: "s1", rotulo: "Forn Lda" }));
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(espias.toast).toContainEqual({ title: "suppliers.toast.deleteSuccess" });
  });
});
