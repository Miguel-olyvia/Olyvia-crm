import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { SpProposalTarget } from "@/lib/supplierContracts/portal";

// «Propor contrato» no portal: valida como o servidor (prazo e forma de
// pagamento obrigatórios, PDF se a origem for o do fornecedor), chama
// sp_supplier_contract_propose com o alvo escolhido e só DEPOIS carrega os
// ficheiros pela Edge (upload). Um upload falhado não desfaz a proposta.

const rpc = vi.fn();
const invoke = vi.fn();
const toast = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { SpContractProposeDialog } from "../SpContractProposeDialog";

const targets: SpProposalTarget[] = [
  { organization_id: "org1", organization_name: "BM Lar", supplier_id: "s1", supplier_name: "Ferragens Lda", has_open_contract: false, can_propose: true },
  { organization_id: "org2", organization_name: "Outra Empresa", supplier_id: "s2", supplier_name: "Ferragens Norte", has_open_contract: false, can_propose: true },
];

const painel = () => screen.getByRole("dialog");

function montar(ts: SpProposalTarget[] = targets) {
  const onProposed = vi.fn();
  const onStale = vi.fn();
  const onOpenChange = vi.fn();
  render(<SpContractProposeDialog open onOpenChange={onOpenChange} targets={ts} onProposed={onProposed} onStale={onStale} />);
  return { onProposed, onStale, onOpenChange };
}

function escolher(rotulo: RegExp, opcao: RegExp) {
  const gatilho = within(painel()).getByRole("combobox", { name: rotulo });
  fireEvent.keyDown(gatilho, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

function preencherPagamento() {
  fireEvent.change(within(painel()).getByLabelText(/Prazo de pagamento/), { target: { value: "45" } });
  escolher(/Forma de pagamento/, /Transferência bancária/);
}

async function enviar() {
  await act(async () => {
    fireEvent.click(within(painel()).getByRole("button", { name: /Enviar proposta/ }));
  });
}

const pdf = (name = "contrato.pdf") => new File(["%PDF-1.4 teste"], name, { type: "application/pdf" });

describe("SpContractProposeDialog", () => {
  beforeAll(() => {
    prepararRadixNoJsdom();
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    toast.mockReset();
    rpc.mockImplementation(async () => ({ data: { id: "sc9", status: "proposed" }, error: null }));
    invoke.mockImplementation(async () => ({
      data: { success: true, file_id: "f1", is_main: true, already_registered: false, file_name: "contrato.pdf" },
      error: null,
    }));
  });

  it("sem prazo e forma de pagamento não chama o servidor e diz o que falta", async () => {
    montar();
    await enviar();
    expect(rpc).not.toHaveBeenCalled();
    expect(within(painel()).getByText("Indique o prazo de pagamento.")).toBeTruthy();
    expect(within(painel()).getByText(/Escolha a forma de pagamento/)).toBeTruthy();
  });

  it("modelo da empresa: propõe à empresa escolhida com as condições e o título dela", async () => {
    const { onProposed, onOpenChange } = montar();
    fireEvent.click(within(painel()).getByRole("radio", { name: /Outra Empresa/ }));
    expect((within(painel()).getByLabelText(/Título/) as HTMLInputElement).value).toBe("Condições comerciais — Ferragens Norte");
    fireEvent.click(within(painel()).getByRole("radio", { name: /Subempreitada/ }));
    preencherPagamento();
    await enviar();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("sp_supplier_contract_propose");
    expect(args.p_organization_id).toBe("org2");
    expect(args.p_supplier_id).toBe("s2");
    expect(args.p_data).toMatchObject({
      origin: "modelo",
      kind: "servico",
      title: "Condições comerciais — Ferragens Norte",
      valid_from: null,
      valid_until: null,
      conditions: { payment_terms_days: 45, payment_method: "transferencia", shipping_free_from: null },
    });
    // Só as chaves que fn_sc_aplicar_condicoes aceita.
    expect(Object.keys((args.p_data as { conditions: object }).conditions).sort()).toEqual(
      [
        "conditions_notes",
        "delivery_sla_days",
        "discount_percent",
        "min_order_value",
        "payment_method",
        "payment_terms_days",
        "returns_accepted",
        "returns_days",
        "returns_notes",
        "shipping_free_from",
        "shipping_terms",
      ].sort(),
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(onProposed).toHaveBeenCalledWith("sc9");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Proposta enviada" }));
  });

  it("o meu PDF: exige o PDF e carrega-o depois de criar a proposta (kind contrato_fornecedor)", async () => {
    const { onProposed } = montar([targets[0]]);
    fireEvent.click(within(painel()).getByRole("radio", { name: /O meu PDF/ }));
    preencherPagamento();
    await enviar();
    expect(rpc).not.toHaveBeenCalled();
    expect(within(painel()).getByText("Escolha o PDF do seu contrato.")).toBeTruthy();

    await act(async () => {
      fireEvent.change(within(painel()).getByLabelText(/PDF do contrato/), { target: { files: [pdf()] } });
    });
    expect(within(painel()).getByText(/contrato\.pdf/)).toBeTruthy();
    await enviar();
    await waitFor(() => expect(onProposed).toHaveBeenCalledWith("sc9"));
    expect(rpc).toHaveBeenCalledWith("sp_supplier_contract_propose", expect.objectContaining({ p_organization_id: "org1", p_supplier_id: "s1" }));
    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = invoke.mock.calls[0] as [string, { body: FormData }];
    expect(fn).toBe("supplier-contract-action");
    expect(opts.body.get("action")).toBe("upload");
    expect(opts.body.get("contract_id")).toBe("sc9");
    expect(opts.body.get("kind")).toBe("contrato_fornecedor");
    // O upload vem depois da proposta.
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
  });

  it("upload falhado: a proposta fica criada e avisa para voltar a carregar", async () => {
    invoke.mockImplementation(async () => ({ data: { error: "upload_failed", message: "Falhou o armazenamento." }, error: null }));
    const { onProposed } = montar([targets[0]]);
    fireEvent.click(within(painel()).getByRole("radio", { name: /O meu PDF/ }));
    preencherPagamento();
    await act(async () => {
      fireEvent.change(within(painel()).getByLabelText(/PDF do contrato/), { target: { files: [pdf()] } });
    });
    await enviar();
    await waitFor(() => expect(onProposed).toHaveBeenCalledWith("sc9"));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Proposta enviada, mas faltam ficheiros", variant: "destructive" }),
    );
  });

  it("PDF recusado no cliente (não é PDF) não fica escolhido", async () => {
    montar([targets[0]]);
    fireEvent.click(within(painel()).getByRole("radio", { name: /O meu PDF/ }));
    await act(async () => {
      fireEvent.change(within(painel()).getByLabelText(/PDF do contrato/), {
        target: { files: [new File(["x"], "foto.png", { type: "image/png" })] },
      });
    });
    expect(within(painel()).getByText("O contrato do fornecedor tem de ser um PDF.")).toBeTruthy();
    expect(within(painel()).queryByText(/foto\.png/)).toBeNull();
  });

  it.each([
    ["open_contract_exists", /Já há um contrato em curso com esta empresa/, true],
    ["not_owner", /Só o responsável principal da conta pode propor/, true],
    ["not_found", /Esta empresa já não está ligada à sua conta/, true],
    ["supplier_required", /mais de um fornecedor nesta empresa/, false],
    ["validation", /O fim da validade já passou/, false],
  ])("erro %s: mensagem clara e a proposta não fecha", async (hint, texto, stale) => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "O fim da validade já passou", hint, code: "P0001" } }));
    const { onProposed, onStale } = montar([targets[0]]);
    preencherPagamento();
    await enviar();
    expect(await within(painel()).findByText(texto)).toBeTruthy();
    expect(onProposed).not.toHaveBeenCalled();
    expect(onStale).toHaveBeenCalledTimes(stale ? 1 : 0);
  });
});
