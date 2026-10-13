/**
 * Ecrã /financeiro: as duas listas, registar na linha, validar o pagamento
 * (o 1.º avisa a obra) e o que cada permissão deixa fazer. A base é simulada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ORG = "11111111-1111-1111-1111-111111111111";
const CTR = "88880000-0000-0000-0000-000000000001";

const permissoes = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (c: string) => permissoes.has(c), loading: false }),
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG, name: "Org A" }, isLoading: false }),
}));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => <p>Sem organização</p> }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

const FILA = {
  por_faturar: [
    {
      contract_id: CTR,
      contrato_numero: "CT-001",
      cliente_nome: "Maria Silva",
      contrato_valor: "10000.01",
      condicoes_pagamento: "50% + 50%",
      assinado_em: "2026-10-01T10:00:00Z",
      tranche_ordem: 1,
      tranche_descricao: "Adiantamento 50%",
      percentagem: "50",
      valor_sugerido: "5000.00",
      n_tranches: 2,
      dispara_obra: true,
    },
  ],
  por_validar: [
    {
      invoice_id: "inv-1",
      numero: "FT 2026/9",
      data: "2026-10-10",
      valor: "2500",
      origem: "Moloni",
      atcud: null,
      pdf_path: null,
      contract_id: "c2",
      contrato_numero: "CT-002",
      cliente_nome: "João Costa",
      tranche_descricao: "Única 100%",
      dispara_obra: true,
    },
  ],
  faturar_desde: "2026-09-13",
};

const rpc = vi.fn(async (nome: string, _args?: unknown) => {
  if (nome === "rpc_fin_fila") return { data: FILA, error: null };
  if (nome === "rpc_fin_validar_pagamento") return { data: { receipt_id: "r1", primeiro_pagamento: true, avisos: 2 }, error: null };
  return { data: {}, error: null };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => rpc(nome, args),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
  },
}));

import Financeiro from "../Financeiro";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Financeiro />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  permissoes.clear();
  rpc.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("/financeiro", () => {
  it("mostra as duas listas com o corte faturar_desde e o aviso da obra", async () => {
    permissoes.add("finance.view");
    montar();
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText(/Por faturar/)).toHaveTextContent("(1)");
    expect(screen.getByText(/Só contratos assinados desde 13\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Adiantamento 50% · 1 de 2/)).toBeInTheDocument();
    expect(screen.getByText("o 1.º pagamento cria a obra")).toBeInTheDocument();
    expect(screen.getByText(/FT 2026\/9/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("rpc_fin_fila", { p_org: ORG });
    // Só ver: sem botões de ação.
    expect(screen.queryByRole("button", { name: /Registar fatura:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Validar pagamento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
  });

  it("registar na linha: valor sugerido preenchido, programa obrigatório, chama a RPC", async () => {
    permissoes.add("finance.view").add("finance.register");
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Registar fatura: Maria Silva, Adiantamento 50%" }));
    const form = screen.getByRole("form", { name: /Registar fatura de Maria Silva/ });
    expect(within(form).getByLabelText(/Valor/)).toHaveValue("5000,00");

    fireEvent.change(within(form).getByLabelText(/N.º da fatura/), { target: { value: "FT 2026/1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Registar fatura" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/programa/);
    expect(rpc).not.toHaveBeenCalledWith("rpc_fin_registar_fatura", expect.anything());

    fireEvent.change(within(form).getByLabelText(/Emitida no/), { target: { value: "PHC" } });
    fireEvent.click(within(form).getByRole("button", { name: "Registar fatura" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_fin_registar_fatura", expect.objectContaining({
        p_contract_id: CTR, p_tranche_ordem: 1, p_numero: "FT 2026/1", p_valor: 5000, p_origem: "PHC", p_pdf_path: null,
      }))
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Fatura FT 2026/1 registada"));
    // O programa fica lembrado para a próxima.
    expect(localStorage.getItem("financeiro.origem")).toBe("PHC");
  });

  it("validar o 1.º pagamento avisa que as Operações vão criar a obra", async () => {
    permissoes.add("finance.view").add("finance.validate");
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Validar pagamento/ }));
    expect(screen.getByText(/É o 1.º pagamento deste contrato/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pagamento" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_fin_validar_pagamento", expect.objectContaining({ p_invoice_id: "inv-1" }))
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/criar a obra de João Costa/)));
    // Só validar: não anula.
    expect(screen.queryByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
  });

  it("anular exige motivo e chama a RPC", async () => {
    permissoes.add("finance.view").add("finance.register");
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Anular/ }));
    const botao = screen.getByRole("button", { name: "Anular registo" });
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo da anulação"), { target: { value: "Número trocado" } });
    fireEvent.click(botao);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_fin_anular_fatura", { p_invoice_id: "inv-1", p_motivo: "Número trocado" })
    );
  });

  it("um erro da base aparece com a mensagem dela e deixa tentar outra vez", async () => {
    permissoes.add("finance.view");
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "Sem permissão para ver o Financeiro" } } as never));
    montar();
    expect(await screen.findByText("Sem permissão para ver o Financeiro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
  });
});
