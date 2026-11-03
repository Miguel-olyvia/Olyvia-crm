import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

// Página «Contrato» do portal com propostas: botão «Propor contrato» só para o
// titular com uma empresa livre; explicação quando há contrato em curso;
// estados pendente / aceite em preparação / recusada pela empresa / retirada;
// «Retirar proposta» com confirmação (sp_supplier_contract_withdraw).

const rpc = vi.fn();
const toast = vi.fn();
const invalidate = vi.fn();
let listData: Record<string, unknown> | null = null;
let detailData: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args), functions: { invoke: vi.fn() } },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/contexts/SupplierPortalContext", () => ({ useSupplierPortal: () => ({ refresh: vi.fn(), user: { id: "u1" } }) }));
vi.mock("@/components/supplier-portal/contract/useSpContracts", () => ({
  useSpContractsList: () => ({ data: listData, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
  useSpContractDetail: (id: string | null) => ({
    data: id ? detailData : undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useInvalidateSpContracts: () => invalidate,
  useSpMyPhone: () => ({ data: undefined }),
}));

import SupplierPortalContract from "@/pages/SupplierPortalContract";

const conditions = {
  payment_terms_days: 30,
  payment_method: "transferencia",
  delivery_sla_days: null,
  shipping_terms: null,
  shipping_free_from: null,
  discount_percent: null,
  min_order_value: null,
  returns_accepted: null,
  returns_days: null,
  returns_notes: null,
  conditions_notes: null,
};

const contrato = (over: Record<string, unknown> = {}) => ({
  id: "sc1",
  organization_id: "org1",
  organization_name: "BM Lar",
  supplier_id: "s1",
  supplier_name: "Ferragens Lda",
  contract_number: "CF-2026-0007",
  version: 1,
  kind: "material",
  origin: "modelo",
  title: "Condições comerciais — Ferragens Lda",
  status: "proposed",
  conditions,
  valid_from: null,
  valid_until: null,
  days_to_expiry: null,
  expires_soon: false,
  sent_at: null,
  document_sha256: null,
  main_file_id: null,
  supplier_signed_at: null,
  company_signed_at: null,
  refused_at: null,
  refusal_reason: null,
  refused_by: null,
  cancelled_at: null,
  created_via: "portal",
  proposal_state: "pending",
  proposed_by_name: "Rui",
  created_at: "2026-11-02T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
  document_html: null,
  files: [],
  events: [],
  proposal_snapshot: null,
  can_sign: false,
  can_refuse: false,
  can_attach: true,
  can_attach_main: false,
  can_withdraw: true,
  is_owner: true,
  phone_set: true,
  phone_masked: null,
  ...over,
});

const target = (over: Record<string, unknown> = {}) => ({
  organization_id: "org1",
  organization_name: "BM Lar",
  supplier_id: "s1",
  supplier_name: "Ferragens Lda",
  has_open_contract: false,
  can_propose: true,
  ...over,
});

function montar() {
  return render(
    <MemoryRouter initialEntries={["/supplier-portal/contract"]}>
      <SupplierPortalContract />
    </MemoryRouter>,
  );
}

describe("SupplierPortalContract — propostas", () => {
  beforeAll(() => {
    prepararRadixNoJsdom();
  });
  beforeEach(() => {
    rpc.mockReset();
    toast.mockReset();
    invalidate.mockReset();
    listData = null;
    detailData = null;
  });

  it("titular sem contratos e com empresa livre: «Propor contrato» abre o formulário", async () => {
    listData = { is_owner: true, phone_set: true, phone_masked: null, contracts: [], proposal_targets: [target()] };
    montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Propor contrato/ }));
    });
    expect(screen.getByRole("dialog", { name: /Propor contrato/ })).toBeTruthy();
  });

  it("contrato em curso com a empresa: sem botão e explica porquê", () => {
    const c = contrato();
    listData = { is_owner: true, contracts: [c], proposal_targets: [target({ has_open_contract: true, can_propose: false })] };
    detailData = c;
    montar();
    expect(screen.queryByRole("button", { name: /Propor contrato/ })).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/já há um contrato em curso com BM Lar/);
  });

  it("não titular: só leitura (sem propor nem retirar)", () => {
    const c = contrato({ can_withdraw: false, can_attach: false, is_owner: false });
    listData = { is_owner: false, contracts: [c], proposal_targets: [target({ can_propose: false })] };
    detailData = c;
    montar();
    expect(screen.queryByRole("button", { name: /Propor contrato/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirar proposta/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Anexar documento/ })).toBeNull();
    expect(screen.getByText(/Só o responsável principal da conta pode propor um contrato/)).toBeTruthy();
  });

  it("proposta pendente: estado e «Retirar proposta» com confirmação chama sp_supplier_contract_withdraw", async () => {
    rpc.mockImplementation(async () => ({ data: { contract_id: "sc1", status: "cancelled", cancelled_at: "2026-11-03T10:00:00Z" }, error: null }));
    const c = contrato();
    listData = { is_owner: true, contracts: [c], proposal_targets: [target({ has_open_contract: true, can_propose: false })] };
    detailData = c;
    montar();
    expect(screen.getAllByText("Proposta enviada · a aguardar resposta").length).toBeGreaterThan(0);
    expect(screen.getByText("À espera de resposta")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retirar proposta/ }));
    });
    const dlg = await screen.findByRole("alertdialog");
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dlg).getByRole("button", { name: /Retirar proposta/ }));
    });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("sp_supplier_contract_withdraw", { p_contract_id: "sc1" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Proposta retirada" }));
    expect(invalidate).toHaveBeenCalled();
  });

  it("retirar quando a empresa já respondeu: mensagem clara", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "x", hint: "invalid_state" } }));
    const c = contrato();
    listData = { is_owner: true, contracts: [c], proposal_targets: [] };
    detailData = c;
    montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retirar proposta/ }));
    });
    const dlg = await screen.findByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(dlg).getByRole("button", { name: /Retirar proposta/ }));
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/a empresa já lhe respondeu/), variant: "destructive" }),
      ),
    );
  });

  it("aceite (rascunho do portal), recusada pela empresa e retirada: rótulos e textos próprios", () => {
    const aceite = contrato({ status: "draft", proposal_state: "accepted", can_withdraw: false, can_attach: false });
    listData = { is_owner: true, contracts: [aceite], proposal_targets: [] };
    detailData = aceite;
    const { unmount } = montar();
    expect(screen.getAllByText("Aceite — em preparação").length).toBeGreaterThan(0);
    expect(screen.getByText("Proposta aceite — em preparação")).toBeTruthy();
    unmount();

    const recusada = contrato({
      status: "refused",
      proposal_state: "refused",
      refused_by: "empresa",
      refused_at: "2026-11-03T10:00:00Z",
      refusal_reason: "Prazo de pagamento demasiado longo",
      can_withdraw: false,
      can_attach: false,
    });
    listData = { is_owner: true, contracts: [recusada], proposal_targets: [] };
    detailData = recusada;
    const r2 = montar();
    expect(screen.getAllByText("Proposta recusada pela empresa").length).toBeGreaterThan(1);
    expect(screen.getByText("Prazo de pagamento demasiado longo")).toBeTruthy();
    r2.unmount();

    const retirada = contrato({ status: "cancelled", proposal_state: "withdrawn", cancelled_at: "2026-11-03T10:00:00Z", can_withdraw: false, can_attach: false });
    listData = { is_owner: true, contracts: [retirada], proposal_targets: [] };
    detailData = retirada;
    montar();
    expect(screen.getAllByText("Proposta retirada").length).toBeGreaterThan(0);
    expect(screen.getByText(/Retirou esta proposta em/)).toBeTruthy();
  });

  it("proposta com o PDF do fornecedor ainda por carregar: mostra «Carregar PDF do contrato»", () => {
    const c = contrato({ origin: "pdf_fornecedor", can_attach_main: true });
    listData = { is_owner: true, contracts: [c], proposal_targets: [] };
    detailData = c;
    montar();
    expect(screen.getByRole("button", { name: /Carregar PDF do contrato/ })).toBeTruthy();
  });
});
