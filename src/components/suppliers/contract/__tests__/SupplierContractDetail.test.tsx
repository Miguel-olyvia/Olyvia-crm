import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierContractDetail as Detail } from "@/lib/supplierContracts/tipos";

const rpc = vi.fn();
const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) }, rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("../SupplierContractDraftEditor", () => ({ SupplierContractDraftEditor: () => <div>editor do rascunho</div> }));

import { SupplierContractDetail } from "../SupplierContractDetail";

const base: Detail = {
  id: "sc1",
  organization_id: "org1",
  organization_name: "Empresa",
  supplier_id: "s1",
  supplier_name: "Fornecedor",
  contract_number: "CF-2026-0001",
  version: 1,
  previous_contract_id: null,
  superseded_by_id: null,
  kind: "material",
  origin: "modelo",
  title: "Condições comerciais",
  status: "draft",
  conditions: {
    payment_terms_days: 30,
    payment_method: "transferencia",
    delivery_sla_days: 5,
    shipping_terms: null,
    shipping_free_from: null,
    discount_percent: null,
    min_order_value: null,
    returns_accepted: null,
    returns_days: null,
    returns_notes: null,
    conditions_notes: null,
  },
  valid_from: null,
  valid_until: null,
  days_to_expiry: null,
  expires_soon: false,
  sent_at: null,
  document_sha256: null,
  document_frozen_at: null,
  main_file_id: null,
  supplier_signed_at: null,
  supplier_signed_by_name: null,
  supplier_signed_phone_masked: null,
  supplier_signature_sha256: null,
  company_signed_at: null,
  company_signed_by_name: null,
  refused_at: null,
  refusal_reason: null,
  refused_by: null,
  cancelled_at: null,
  superseded_at: null,
  expired_at: null,
  created_via: "crm",
  proposal_state: null,
  proposed_by_name: null,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  template_id: "t1",
  created_by_portal_user_id: null,
  proposed_by_email: null,
  supplier_signed_by_email: null,
  supplier_signed_ip: null,
  supplier_signed_user_agent: null,
  supplier_signed_document_sha256: null,
  company_signature_mode: null,
  company_signed_ip: null,
  cancel_reason: null,
  document_html: null,
  body_html: "<p>{{titulo}}</p>",
  files: [],
  events: [],
  can_manage: true,
  can_countersign: false,
  proposal_snapshot: null,
  can_accept_proposal: false,
  can_refuse_proposal: false,
};

function renderDetail(c: Detail, hasOpen = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SupplierContractDetail contract={c} supplierHasOpenContract={hasOpen} onSelect={() => {}} />
    </QueryClientProvider>,
  );
}

describe("SupplierContractDetail — ações por estado e permissão", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(async () => ({ data: { contract_id: "sc1", status: "sent" }, error: null }));
    invoke.mockReset();
    invoke.mockImplementation(async () => ({ data: { success: true, smtp_status: "sent", recipients: ["a***@f.pt"] }, error: null }));
  });

  it("rascunho completo de quem gere: editor e Enviar, que chama rpc_supplier_contract_send", async () => {
    renderDetail(base);
    expect(screen.getByText("editor do rascunho")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar ao fornecedor/ }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /^Enviar$/ }));
    });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_supplier_contract_send", { p_contract_id: "sc1" }));
    // Depois do envio, o pedido de assinatura segue por e-mail pela Edge.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("supplier-contract-action", {
        body: { action: "resend_signature_request", contract_id: "sc1" },
      }),
    );
  });

  it("rascunho sem forma de pagamento: Enviar desativado e diz o que falta", () => {
    renderDetail({ ...base, conditions: { ...base.conditions, payment_method: null } });
    expect((screen.getByRole("button", { name: /Enviar ao fornecedor/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Para enviar falta: forma de pagamento/)).toBeTruthy();
  });

  it("sem can_manage: só leitura (sem editor, Enviar ou Cancelar)", () => {
    renderDetail({ ...base, can_manage: false });
    expect(screen.queryByText("editor do rascunho")).toBeNull();
    expect(screen.queryByRole("button", { name: /Enviar ao fornecedor/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancelar/ })).toBeNull();
  });

  it("assinado pelo fornecedor: mostra quem/telemóvel mascarado/hash e Contra-assinar só com can_countersign", () => {
    const assinado: Detail = {
      ...base,
      status: "signed_supplier",
      sent_at: "2026-11-01T11:00:00Z",
      document_sha256: "a".repeat(64),
      supplier_signed_at: "2026-11-02T09:00:00Z",
      supplier_signed_by_name: "Ana Fornecedora",
      supplier_signed_phone_masked: "+351 9** *** 789",
      supplier_signature_sha256: "b".repeat(64),
    };
    const { unmount } = renderDetail(assinado);
    expect(screen.getByText("Ana Fornecedora")).toBeTruthy();
    expect(screen.getByText("+351 9** *** 789")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Contra-assinar/ })).toBeNull();
    unmount();
    renderDetail({ ...assinado, can_countersign: true });
    expect(screen.getByRole("button", { name: /Contra-assinar/ })).toBeTruthy();
  });

  it("recusado: mostra o motivo e permite nova versão (rpc_supplier_contract_new_version)", async () => {
    rpc.mockImplementation(async () => ({ data: { ...base, id: "sc2", version: 2 }, error: null }));
    renderDetail({
      ...base,
      status: "refused",
      sent_at: "2026-11-01T11:00:00Z",
      refused_at: "2026-11-02T09:00:00Z",
      refusal_reason: "Prazo de pagamento curto",
    });
    expect(screen.getByText("Prazo de pagamento curto")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Nova versão/ }));
    });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_supplier_contract_new_version", { p_contract_id: "sc1" }));
  });

  it("enviado: cancelar exige motivo", async () => {
    renderDetail({ ...base, status: "sent", sent_at: "2026-11-01T11:00:00Z", document_sha256: "a".repeat(64) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/ }));
    });
    const confirmar = await screen.findByRole("button", { name: /Cancelar contrato/ });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Condições erradas" } });
    expect((confirmar as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirmar);
    });
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_supplier_contract_cancel", { p_contract_id: "sc1", p_reason: "Condições erradas" }),
    );
  });
});
