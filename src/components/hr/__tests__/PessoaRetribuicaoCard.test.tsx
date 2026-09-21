/**
 * `PessoaRetribuicaoCard` e o UNICO caminho de escrita de retribuicao depois
 * da admissao (ver o cabecalho do componente). Tres coisas fecham o
 * comportamento minimo: o botao "Alterar" respeita `podeAlterar`, o botao
 * "Corrigir" so aparece nas linhas do historico quando `podeCorrigir`, e a
 * validacao do lado do cliente recusa gravar um valor base vazio ou
 * negativo -- mesmo estilo de
 * `PessoaContratoTab.estadoVinculo.test.tsx`.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const VERSAO_ABERTA = {
  id: "r-aberta",
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: "v1",
  valor_base: 1500,
  moeda: "EUR",
  periodicidade: "mensal",
  subsidio_alimentacao: null,
  subsidio_alimentacao_modo: null,
  duodecimos_pct: 100,
  valido_de: "2024-06-01",
  valido_ate: null,
  motivo: null,
};

const VERSAO_HISTORICA = {
  id: "r-historica",
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: "v1",
  valor_base: 1300,
  moeda: "EUR",
  periodicidade: "mensal",
  subsidio_alimentacao: null,
  subsidio_alimentacao_modo: null,
  duodecimos_pct: 100,
  valido_de: "2023-01-01",
  valido_ate: "2024-06-01",
  motivo: null,
};

// A leitura de `pessoas_retribuicoes` ao montar o cartao -- mesmo padrao de
// `PessoaLaboraisTab.estadoDerivado.test.tsx` para `pessoas_afectacoes`.
function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => chain,
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve({ data: [VERSAO_ABERTA, VERSAO_HISTORICA], error: null }).then(
        onFulfilled,
        onRejected,
      );
    },
  };
  return chain;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => buildChain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));

import { PessoaRetribuicaoCard } from "@/components/hr/PessoaRetribuicaoCard";
import type { HrCargo } from "@/hooks/useCargos";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function montar(
  overrides: {
    podeAlterar?: boolean;
    podeCorrigir?: boolean;
    cargo?: HrCargo | null;
  } = {},
) {
  render(
    <PessoaRetribuicaoCard
      pessoaId="p1"
      organizationId="org"
      vinculoActivoId="v1"
      podeAlterar={overrides.podeAlterar ?? true}
      podeCorrigir={overrides.podeCorrigir ?? true}
      cargo={overrides.cargo ?? null}
    />,
  );
}

describe("PessoaRetribuicaoCard", () => {
  it("o botao Alterar so aparece com podeAlterar", async () => {
    montar({ podeAlterar: false });
    await screen.findByText("1500 EUR");

    expect(screen.queryByText("hr.retribuicaoCartao.alterar")).not.toBeInTheDocument();
  });

  it("o botao Alterar aparece com podeAlterar", async () => {
    montar({ podeAlterar: true });
    await screen.findByText("1500 EUR");

    expect(screen.getByText("hr.retribuicaoCartao.alterar")).toBeInTheDocument();
  });

  it("o botao Corrigir so aparece nas linhas do historico com podeCorrigir", async () => {
    montar({ podeCorrigir: false });

    const linhaHistorico = await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    const linha = linhaHistorico.closest("tr");
    expect(linha).not.toBeNull();
    expect(within(linha as HTMLElement).queryByText("hr.retribuicaoCartao.corrigir")).not.toBeInTheDocument();
  });

  it("mostra Corrigir na linha do historico quando podeCorrigir", async () => {
    montar({ podeCorrigir: true });

    const linhaHistorico = await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    const linha = linhaHistorico.closest("tr");
    expect(linha).not.toBeNull();
    expect(within(linha as HTMLElement).getByText("hr.retribuicaoCartao.corrigir")).toBeInTheDocument();
  });

  it("bloqueia gravar com valor base vazio", async () => {
    montar({ podeAlterar: true });
    await screen.findByText("1500 EUR");

    fireEvent.click(screen.getByText("hr.retribuicaoCartao.alterar"));
    const campoValor = await screen.findByLabelText("hr.retribuicaoCartao.valor");
    fireEvent.change(campoValor, { target: { value: "" } });

    fireEvent.click(screen.getByText("employees.form.update"));

    expect(toastError).toHaveBeenCalledWith("hr.retribuicaoCartao.erroValorInvalido");
  });

  it("bloqueia gravar com valor base negativo", async () => {
    montar({ podeAlterar: true });
    await screen.findByText("1500 EUR");

    fireEvent.click(screen.getByText("hr.retribuicaoCartao.alterar"));
    const campoValor = await screen.findByLabelText("hr.retribuicaoCartao.valor");
    fireEvent.change(campoValor, { target: { value: "-100" } });

    fireEvent.click(screen.getByText("employees.form.update"));

    expect(toastError).toHaveBeenCalledWith("hr.retribuicaoCartao.erroValorInvalido");
  });
});
