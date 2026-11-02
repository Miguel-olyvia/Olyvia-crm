import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A contra-assinatura da empresa passa a ser gravada no servidor
// (rpc_contra_assinar_contrato). O ecrã nunca escreve company_* direto.

const invoke = vi.fn();
const rpc = vi.fn();
const updates: unknown[] = [];
let permissoes: string[] = [];

const TEMPLATE = { id: "t1", name: "Minuta", body_html: "", doc_settings: null, is_default: true, signatory_user_id: "u-sig" };

function cadeia(tabela: string) {
  const resultado = () => {
    if (tabela === "client_contract_templates") return { data: [TEMPLATE], error: null };
    if (tabela === "anew_users") return { data: { id: "u-sig", name: "Signatária" }, error: null };
    return { data: null, error: null };
  };
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => Promise.resolve(resultado()),
    maybeSingle: () => Promise.resolve(resultado()),
    update: (v: unknown) => { updates.push({ tabela, v }); return q; },
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resultado()).then(ok),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
    from: (t: string) => cadeia(t),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => "u-actor") }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.includes(p) }),
}));
vi.mock("@/hooks/useDocumentSettings", () => ({ useDocumentSettings: () => ({ settings: {} }) }));
vi.mock("@/components/RichTextEditor", () => ({ RichTextEditor: () => null }));
vi.mock("@/components/contracts/GenerateFromTemplateDialog", () => ({ GenerateFromTemplateDialog: () => null }));
vi.mock("@/components/contracts/FillPromptVariablesDialog", () => ({ FillPromptVariablesDialog: () => null }));
vi.mock("@/components/contracts/contractHeader", () => ({ renderContractHeaderHtml: () => "" }));
vi.mock("@/components/contracts/contractDocument", () => ({
  gatherContractData: vi.fn(async () => null),
  applyQuoteItemsToken: (h: string) => h,
  applyFormulaChips: (h: string) => h,
  stripVariableChips: (h: string) => h,
  injectSignaturesIntoBlock: (h: string) => h,
  isContractInForce: () => false,
  UNFREEZE_CONTRACT_COLUMNS: {},
}));

import { ContractBodyTab } from "../ContractBodyTab";

const contract = { id: "c1", status: "draft", contract_body_html: "<p>Corpo</p>", contract_template_id: "t1" };

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContractBodyTab contract={contract} />
    </QueryClientProvider>,
  );
}

async function abrirDialogo() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Assinar \(Empresa\)/ })); });
}

const companyWrites = () =>
  updates.filter((u: any) => u.tabela === "client_contracts" && JSON.stringify(u.v).includes("company_"));

describe("ContractBodyTab - contra-assinatura no servidor", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
    updates.length = 0;
    permissoes = [];
    invoke.mockImplementation(async (_fn: string, opts: any) =>
      opts?.body?.action === "verify_otp"
        ? { data: { success: true, verified: true }, error: null }
        : { data: { masked_phone: "9*****123" }, error: null });
    rpc.mockImplementation(async () => ({ data: {}, error: null }));
  });

  it("com OTP verificado chama a RPC em modo 'proprio' e não escreve company_* direto", async () => {
    renderTab();
    await abrirDialogo();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Enviar código SMS/ })); });
    const input = document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "123456" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Verificar e Assinar/ })); });

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_contra_assinar_contrato", { p_contract_id: "c1", p_modo: "proprio" }));
    expect(companyWrites()).toHaveLength(0);
  });

  it("sem client_contracts.send_signature não mostra a assinatura pelo signatário da minuta", async () => {
    renderTab();
    await abrirDialogo();
    expect(await screen.findByRole("button", { name: /Enviar código SMS/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirmar assinatura/ })).toBeNull();
  });

  it("com client_contracts.send_signature assina pelo signatário da minuta via RPC", async () => {
    permissoes = ["client_contracts.send_signature"];
    renderTab();
    await abrirDialogo();
    const confirmar = await screen.findByRole("button", { name: /Confirmar assinatura/ });
    await waitFor(() => expect((confirmar as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(confirmar); });

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_contra_assinar_contrato", { p_contract_id: "c1", p_modo: "signatario_minuta" }));
    expect(invoke).not.toHaveBeenCalled();
    expect(companyWrites()).toHaveLength(0);
  });
});
