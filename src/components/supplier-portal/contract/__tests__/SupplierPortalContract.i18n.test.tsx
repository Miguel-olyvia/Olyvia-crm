import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

// Página «Contrato» do portal do fornecedor nos dois idiomas: títulos, estado, condições, avisos, secções, histórico
// e a confirmação de retirar. Em português fica como sempre; em inglês não sobra português do que é da aplicação;
// o que o servidor escreve (descrição de um evento, motivo de recusa, texto do contrato, título) fica como vem.

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
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const conditions = {
  payment_terms_days: 30,
  payment_method: "transferencia",
  delivery_sla_days: 5,
  shipping_terms: "incluidos",
  shipping_free_from: null,
  discount_percent: 7.5,
  min_order_value: null,
  returns_accepted: false,
  returns_days: null,
  returns_notes: null,
  conditions_notes: "Notas do fornecedor",
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

function abrir(c: Record<string, unknown>, targets: Record<string, unknown>[] = []) {
  listData = { is_owner: c.is_owner ?? true, contracts: [c], proposal_targets: targets };
  detailData = c;
  return montar();
}

describe("SupplierPortalContract — idioma", () => {
  beforeAll(() => {
    prepararRadixNoJsdom();
  });
  beforeEach(() => {
    rpc.mockReset();
    toast.mockReset();
    invalidate.mockReset();
    listData = null;
    detailData = null;
    window.localStorage.clear();
    definirIdioma("pt");
  });

  it("português: cabeçalho, versões, estado, condições e secções como sempre", () => {
    abrir(contrato());
    expect(screen.getByRole("heading", { name: "Contrato" })).toBeTruthy();
    expect(screen.getByText(/As condições comerciais acordadas com as empresas com que trabalha/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Versões do contrato" })).toBeTruthy();
    expect(screen.getAllByText("Proposta enviada · a aguardar resposta").length).toBeGreaterThan(0);
    expect(screen.getByText(/Fornecimento de material · proposto em 02\/11\/2026 por Rui/)).toBeTruthy();
    expect(screen.getByText("À espera de resposta")).toBeTruthy();
    expect(screen.getByText(/Enviou esta proposta a BM Lar\. A empresa aceita-a e prepara o contrato para assinar, ou recusa-a com um motivo\. Enquanto não responder, pode retirá-la\./)).toBeTruthy();
    expect(screen.getByText("Condições comerciais")).toBeTruthy();
    expect(screen.getByText("Prazo de pagamento")).toBeTruthy();
    expect(screen.getByText("30 dias")).toBeTruthy();
    expect(screen.getByText("Transferência bancária")).toBeTruthy();
    expect(screen.getByText("Desde a assinatura · sem termo")).toBeTruthy();
    expect(screen.getByText("Anexos")).toBeTruthy();
    expect(screen.getByText("Sem anexos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Anexar documento/ })).toBeTruthy();
  });

  it("inglês: cabeçalho, versões, estado, condições e secções, sem português da aplicação", () => {
    definirIdioma("en");
    const { container } = abrir(contrato());
    expect(screen.getByRole("heading", { name: "Contract" })).toBeTruthy();
    expect(screen.getByText(/The commercial terms agreed with the companies you work with/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Contract versions" })).toBeTruthy();
    expect(screen.getAllByText("Proposal sent · awaiting reply").length).toBeGreaterThan(0);
    expect(screen.getByText(/Supply of materials · proposed on 02\/11\/2026 by Rui/)).toBeTruthy();
    expect(screen.getByText("Awaiting a reply")).toBeTruthy();
    expect(screen.getByText(/You sent this proposal to BM Lar\. The company accepts it/)).toBeTruthy();
    expect(screen.getByText(/You can withdraw it until they reply\./)).toBeTruthy();
    expect(screen.getByText("Commercial terms")).toBeTruthy();
    expect(screen.getByText("Payment terms")).toBeTruthy();
    expect(screen.getByText("30 days")).toBeTruthy();
    expect(screen.getByText("Bank transfer")).toBeTruthy();
    expect(screen.getByText("7,5 %")).toBeTruthy(); // o formato dos números não muda
    expect(screen.getByText("No")).toBeTruthy();
    expect(screen.getByText("From signing · no end date")).toBeTruthy();
    expect(screen.getByText("Attachments")).toBeTruthy();
    expect(screen.getByText("No attachments.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Attach document/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Withdraw proposal/ })).toBeTruthy();
    // o que é do servidor ou da pessoa fica como vem
    expect(screen.getByText("Condições comerciais — Ferragens Lda")).toBeTruthy();
    expect(screen.getByText("Notas do fornecedor")).toBeTruthy();
    // nada da aplicação em português (o título e as notas acima são dados)
    const texto = (container.textContent ?? "").replace("Condições comerciais — Ferragens Lda", "").replace("Notas do fornecedor", "");
    expect(texto).not.toMatch(/Anexar|Retirar|Documento|Assinaturas|Versões|Prazo de|Forma de|Enviou|À espera|Fornecimento/);
  });

  it("muda ao vivo, com o contrato aberto", () => {
    abrir(contrato());
    expect(screen.getByRole("heading", { name: "Contrato" })).toBeTruthy();
    act(() => definirIdioma("en"));
    expect(screen.getByRole("heading", { name: "Contract" })).toBeTruthy();
    expect(screen.getByText("Payment terms")).toBeTruthy();
    act(() => definirIdioma("pt"));
    expect(screen.getByText("Prazo de pagamento")).toBeTruthy();
  });

  it("sem contratos: títulos e o convite a propor nos dois idiomas", () => {
    listData = { is_owner: true, phone_set: true, phone_masked: null, contracts: [], proposal_targets: [target()] };
    montar();
    expect(screen.getByText("Ainda não tem nenhum contrato")).toBeTruthy();
    expect(screen.getByText(/Também pode ser o primeiro a propor as suas condições\./)).toBeTruthy();
    act(() => definirIdioma("en"));
    expect(screen.getByText("You don't have any contracts yet")).toBeTruthy();
    expect(screen.getByText(/You can also be the first to propose your own terms\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Propose contract/ })).toBeTruthy();
  });

  it("contrato em curso com a empresa: a nota segue o idioma (em português mantém-se a frase de sempre)", () => {
    listData = { is_owner: true, contracts: [contrato()], proposal_targets: [target({ has_open_contract: true, can_propose: false })] };
    detailData = contrato();
    montar();
    expect(screen.getByRole("note").textContent).toMatch(/Não pode propor um contrato agora: já há um contrato em curso com BM Lar/);
    act(() => definirIdioma("en"));
    expect(screen.getByRole("note").textContent).toMatch(/You cannot propose a contract right now: there is already a contract in progress with BM Lar/);
  });

  it("membro (só leitura) e aviso de fim de validade em inglês", () => {
    definirIdioma("en");
    const c = contrato({ is_owner: false, can_attach: false, can_withdraw: false, status: "signed", proposal_state: "accepted", expires_soon: true, days_to_expiry: 1, valid_until: "2026-12-31" });
    listData = { is_owner: false, contracts: [c], proposal_targets: [target()] };
    detailData = c;
    montar();
    expect(screen.getByText("Only the account's main user can propose a contract.")).toBeTruthy();
    expect(screen.getByText("Contract CF-2026-0007 · v1 expires in 1 day")).toBeTruthy();
    expect(screen.getByText(/Valid until 31\/12\/2026\. Talk to BM Lar to prepare the renewal/)).toBeTruthy();
  });

  it("proposta aceite, retirada e recusada pela empresa: avisos e estado em inglês", () => {
    definirIdioma("en");
    abrir(contrato({ status: "draft", proposal_state: "accepted", can_withdraw: false }));
    expect(screen.getByText("Proposal accepted — being prepared")).toBeTruthy();
    expect(screen.getByText(/BM Lar accepted your proposal and is preparing the contract/)).toBeTruthy();
  });

  it("retirada: «You withdrew this proposal on …»", () => {
    definirIdioma("en");
    abrir(contrato({ status: "cancelled", proposal_state: "withdrawn", can_withdraw: false, can_attach: false, cancelled_at: "2026-11-03T09:30:00Z" }));
    expect(screen.getAllByText("Proposal withdrawn").length).toBeGreaterThan(0);
    expect(screen.getByText(/You withdrew this proposal on 03\/11\/2026 \d\d:\d\d\. You can propose another one whenever you like\./)).toBeTruthy();
  });

  it("recusada pela empresa: título da secção em inglês e o motivo fica como vem", () => {
    definirIdioma("en");
    abrir(contrato({ status: "refused", proposal_state: "refused", refused_by: "empresa", can_withdraw: false, refused_at: "2026-11-04T10:00:00Z", refusal_reason: "Preço acima do orçamento" }));
    expect(screen.getAllByText("Proposal refused by the company").length).toBeGreaterThan(0);
    expect(screen.getByText("When")).toBeTruthy();
    expect(screen.getByText("Reason")).toBeTruthy();
    expect(screen.getByText("Preço acima do orçamento")).toBeTruthy();
  });

  it("histórico: rótulos de reserva em inglês e descrição do servidor como vem", () => {
    definirIdioma("en");
    abrir(
      contrato({
        events: [
          { id: "e1", event_type: "proposed", description: null, created_at: "2026-11-02T10:00:00Z" },
          { id: "e2", event_type: "proposal_accepted", description: "A BM Lar aceitou (texto do servidor)", created_at: "2026-11-03T10:00:00Z" },
        ],
      }),
    );
    expect(screen.getByText("History (2)")).toBeTruthy();
    expect(screen.getByText(/Supplier proposal/)).toBeTruthy();
    expect(screen.getByText(/A BM Lar aceitou \(texto do servidor\)/)).toBeTruthy();
  });

  it("documento: PDF em falta, texto do modelo e SHA nos dois idiomas", () => {
    definirIdioma("en");
    abrir(contrato({ origin: "pdf_fornecedor", can_attach_main: true, document_sha256: "a".repeat(64) }));
    expect(screen.getByText(/Your contract PDF is missing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Upload contract PDF/ })).toBeTruthy();
    expect(screen.getByText(/Document fingerprint \(SHA-256\):/)).toBeTruthy();
  });

  it("retirar a proposta: confirmação e toast em inglês", async () => {
    definirIdioma("en");
    rpc.mockResolvedValue({ data: { contract_id: "sc1", status: "cancelled", cancelled_at: "x" }, error: null });
    abrir(contrato());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Withdraw proposal/ }));
    });
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText("Withdraw proposal CF-2026-0007 · v1?")).toBeTruthy();
    expect(within(dlg).getByText(/BM Lar will no longer be able to accept it\./)).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "Back" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dlg).getByRole("button", { name: /Withdraw proposal/ }));
    });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Proposal withdrawn", description: "BM Lar has been notified." });
  });

  it("anexo recusado (tipo errado): o motivo vem no idioma", async () => {
    definirIdioma("en");
    abrir(contrato());
    const input = document.getElementById("sp-contract-annex-sc1") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "doc.txt", { type: "text/plain" })] } });
    });
    expect(toast).toHaveBeenCalledWith({
      title: "File not accepted",
      description: "Only PDF, JPEG or PNG attachments are accepted.",
      variant: "destructive",
    });
  });
});
