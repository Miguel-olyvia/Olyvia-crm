// O separador «Pessoas» do Lixo: lista as pessoas apagadas (nome, lead/cliente, quando, por quem), «Restaurar» só com a permissão do papel,
// confirmação simples e neg_apagar_pessoa(org, id, false); um «não» da base fica dentro do diálogo.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { PessoaApagada } from "@/hooks/pessoas/useApagarPessoa";
import { LixoPessoas } from "./LixoPessoas";

const rpc = vi.fn();
const sucesso = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => sucesso(...a), error: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  sucesso.mockReset();
  rpc.mockResolvedValue({ data: { mudou: true, apagada: false }, error: null });
});

const PESSOAS: PessoaApagada[] = [
  { id: "p1", nome: "Ana Silva", cliente: false, apagadaEm: "2026-11-05T10:00:00Z", apagadaPor: "Rúben" },
  { id: "p2", nome: "Rui Costa", cliente: true, apagadaEm: "2026-11-04T09:30:00Z", apagadaPor: null },
];

function montar(opcoes: { pessoas?: PessoaApagada[]; pode?: { lead: boolean; cliente: boolean }; erro?: boolean; aCarregar?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const aoTentarDeNovo = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LixoPessoas
        organizationId="org-1" pessoas={opcoes.pessoas ?? PESSOAS} aCarregar={opcoes.aCarregar ?? false} erro={opcoes.erro ?? false}
        aoTentarDeNovo={aoTentarDeNovo} pode={opcoes.pode ?? { lead: true, cliente: true }}
      />
    </QueryClientProvider>,
  );
  return { aoTentarDeNovo, client };
}

describe("Lixo: separador Pessoas", () => {
  it("lista o nome, o tipo e quem apagou", () => {
    montar();
    const linhas = screen.getAllByRole("row");
    expect(linhas).toHaveLength(3);
    expect(within(linhas[1] as HTMLElement).getByText("Ana Silva")).toBeInTheDocument();
    expect(within(linhas[1] as HTMLElement).getByText("Lead")).toBeInTheDocument();
    expect(within(linhas[1] as HTMLElement).getByText("Rúben")).toBeInTheDocument();
    expect(within(linhas[2] as HTMLElement).getByText("Cliente")).toBeInTheDocument();
  });

  it("vazio diz que não há pessoas no lixo", () => {
    montar({ pessoas: [] });
    expect(screen.getByText("Sem pessoas no lixo.")).toBeInTheDocument();
  });

  it("«Restaurar» só aparece para o papel que se pode apagar", () => {
    montar({ pode: { lead: true, cliente: false } });
    expect(screen.getByRole("button", { name: "Restaurar Ana Silva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restaurar Rui Costa" })).toBeNull();
  });

  it("sem permissões não há botões de restaurar", () => {
    montar({ pode: { lead: false, cliente: false } });
    expect(screen.queryByRole("button", { name: /Restaurar/ })).toBeNull();
  });

  it("restaurar pede confirmação e chama neg_apagar_pessoa com p_apagar=false", async () => {
    const { client } = montar();
    const invalidar = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Restaurar Ana Silva" }));
    const d = screen.getByRole("dialog", { name: "Restaurar Ana Silva?" });
    expect(within(d).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: "Restaurar" }));
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana Silva foi restaurada."));
    expect(rpc).toHaveBeenCalledWith("neg_apagar_pessoa", { p_organization_id: "org-1", p_entity_id: "p1", p_apagar: false });
    expect(invalidar).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("um «não» da base (42501) fica dentro do diálogo", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Sem permissão" } });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar Ana Silva" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restaurar" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Não tem permissão para restaurar esta pessoa.");
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("a leitura falhada mostra o erro com «Tentar de novo»", () => {
    const { aoTentarDeNovo } = montar({ erro: true });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });
});
