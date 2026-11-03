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
import { useSupplierContractDetail } from "../useSupplierContracts";

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

describe("SupplierContractDetail — proposta do fornecedor", () => {
  const proposta: Detail = {
    ...base,
    status: "proposed",
    created_via: "portal",
    proposal_state: "pending",
    proposed_by_name: "Rui Fornecedor",
    proposed_by_email: "rui@fornecedor.pt",
    created_by_portal_user_id: "pu1",
    template_id: null,
    body_html: null,
    can_accept_proposal: true,
    can_refuse_proposal: true,
  };
  const DETAIL_KEY = ["supplier-contracts", "detail", "sc1"];

  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
  });

  it("mostra quem propôs, Aceitar/Recusar e nunca Cancelar nem o editor", () => {
    renderDetail(proposta, true);
    expect(screen.getByText(/Proposto no portal por Rui Fornecedor \(rui@fornecedor\.pt\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Aceitar$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Recusar$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancelar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nova versão/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Enviar ao fornecedor/ })).toBeNull();
    expect(screen.queryByText("editor do rascunho")).toBeNull();
  });

  it("sem permissão (can_accept/can_refuse falsos): sem Aceitar, Recusar ou Cancelar", () => {
    renderDetail({ ...proposta, can_manage: false, can_accept_proposal: false, can_refuse_proposal: false }, true);
    expect(screen.queryByRole("button", { name: /^Aceitar$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Recusar$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancelar/ })).toBeNull();
    expect(screen.getByText(/Só quem gere contratos de fornecedor a pode aceitar ou recusar/)).toBeTruthy();
  });

  it("Aceitar chama rpc_supplier_contract_accept_proposal e abre o rascunho no editor", async () => {
    const aceite = { ...proposta, status: "draft" as const, proposal_state: "accepted" as const, can_accept_proposal: false, can_refuse_proposal: false };
    rpc.mockImplementation(async (fn: string) =>
      fn === "rpc_supplier_contract_accept_proposal" ? { data: { ...aceite, template_applied: true }, error: null } : { data: aceite, error: null },
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Como em SupplierContractTab: o detalhe vem de useSupplierContractDetail (react-query).
    client.setQueryData(DETAIL_KEY, proposta);
    function FromQuery() {
      const q = useSupplierContractDetail("sc1");
      return q.data ? <SupplierContractDetail contract={q.data} supplierHasOpenContract onSelect={() => {}} /> : null;
    }
    render(
      <QueryClientProvider client={client}>
        <FromQuery />
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Aceitar$/ }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Aceitar proposta/ }));
    });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_supplier_contract_accept_proposal", { p_contract_id: "sc1" }));
    await waitFor(() => expect(client.getQueryData<Detail>(DETAIL_KEY)?.status).toBe("draft"));
    expect(await screen.findByText("editor do rascunho")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Aceitar$/ })).toBeNull();
    // Já em rascunho cancela-se como qualquer rascunho.
    expect(screen.getByRole("button", { name: /Cancelar rascunho/ })).toBeTruthy();
  });

  it("Recusar exige motivo de 3 a 2000 caracteres e chama rpc_supplier_contract_refuse_proposal", async () => {
    rpc.mockImplementation(async () => ({
      data: { contract_id: "sc1", status: "refused", refused_at: "2026-11-03T10:00:00Z", refusal_reason: "Prazo curto" },
      error: null,
    }));
    renderDetail(proposta, true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Recusar$/ }));
    });
    const confirmar = (await screen.findByRole("button", { name: /Recusar proposta/ })) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo da recusa/), { target: { value: "  ok " } });
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo da recusa/), { target: { value: "x".repeat(2001) } });
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo da recusa/), { target: { value: "  Prazo curto  " } });
    expect(confirmar.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirmar);
    });
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_supplier_contract_refuse_proposal", { p_contract_id: "sc1", p_reason: "Prazo curto" }),
    );
    expect(rpc).not.toHaveBeenCalledWith("rpc_supplier_contract_cancel", expect.anything());
  });

  it("recusada pela empresa e retirada: títulos certos e rótulos dos eventos novos no histórico", () => {
    const { unmount } = renderDetail({
      ...proposta,
      status: "refused",
      proposal_state: "refused",
      refused_by: "empresa",
      refused_at: "2026-11-03T10:00:00Z",
      refusal_reason: "Prazo curto",
      can_accept_proposal: false,
      can_refuse_proposal: false,
      events: [
        { id: "e1", event_type: "proposed", description: null, created_at: "2026-11-02T10:00:00Z" },
        { id: "e2", event_type: "proposal_refused", description: null, created_at: "2026-11-03T10:00:00Z" },
      ],
    });
    expect(screen.getByText(/Proposta recusada pela empresa/, { selector: "h4" })).toBeTruthy();
    expect(screen.getByText("Prazo curto")).toBeTruthy();
    expect(screen.getByText(/Proposta recusada pela empresa$/, { selector: "li" })).toBeTruthy();
    expect(screen.getByText(/Proposta do fornecedor$/, { selector: "li" })).toBeTruthy();
    unmount();
    renderDetail({
      ...proposta,
      status: "cancelled",
      proposal_state: "withdrawn",
      cancelled_at: "2026-11-03T10:00:00Z",
      can_accept_proposal: false,
      can_refuse_proposal: false,
      events: [{ id: "e3", event_type: "proposal_withdrawn", description: null, created_at: "2026-11-03T10:00:00Z" }],
    });
    expect(screen.getByText("Proposta retirada pelo fornecedor", { selector: "h4" })).toBeTruthy();
    expect(screen.getByText(/Proposta retirada pelo fornecedor$/, { selector: "li" })).toBeTruthy();
  });
});
