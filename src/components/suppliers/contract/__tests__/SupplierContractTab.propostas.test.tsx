import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Separador «Contrato» com uma proposta do fornecedor por responder: «Novo
// contrato» fica bloqueado com a explicação (só um contrato em curso).

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() }, rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("../SupplierContractDetail", () => ({ SupplierContractDetail: () => <div>detalhe</div> }));
vi.mock("../SupplierContractTemplatesDialog", () => ({ SupplierContractTemplatesDialog: () => null }));

import { SupplierContractTab } from "../SupplierContractTab";

const proposta = {
  id: "sc1",
  organization_id: "org1",
  supplier_id: "s1",
  contract_number: "CF-2026-0007",
  version: 1,
  title: "Condições comerciais",
  status: "proposed",
  created_via: "portal",
  proposal_state: "pending",
  proposed_by_name: "Rui Fornecedor",
  conditions: {},
  created_at: "2026-11-02T10:00:00Z",
  company_signed_at: null,
  supplier_signed_at: null,
  sent_at: null,
};

describe("SupplierContractTab — proposta pendente", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  it("bloqueia «Novo contrato» e explica porquê", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "rpc_supplier_contracts_list"
        ? {
            data: { supplier_id: "s1", conditions_locked: false, active_contract_id: null, can_manage: true, can_countersign: false, contracts: [proposta] },
            error: null,
          }
        : { data: { ...proposta, files: [], events: [] }, error: null },
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SupplierContractTab supplierId="s1" supplierName="Ferragens Lda" organizationId="org1" />
      </QueryClientProvider>,
    );
    const botao = (await screen.findByRole("button", { name: /Novo contrato/ })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByRole("note").textContent).toMatch(/Ferragens Lda propôs um contrato no portal \(CF-2026-0007 · v1, por Rui Fornecedor\)/);
    expect(screen.getByRole("note").textContent).toMatch(/aceite ou recuse a proposta antes de criar outro/);
    expect(screen.queryByRole("button", { name: /Novo rascunho em branco/ })).toBeNull();
    await waitFor(() => expect(screen.getByText("detalhe")).toBeTruthy());
  });
});
