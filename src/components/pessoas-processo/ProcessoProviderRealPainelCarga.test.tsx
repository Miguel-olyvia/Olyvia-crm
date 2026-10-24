// A primeira abertura do painel «Visita e levantamento» carrega o painel à parte (lazy): enquanto não chega, diz-o numa região de estado em vez de
// deixar o clique no menu parecer morto. O módulo do painel é simulado com uma chegada lenta, para a espera se ver sempre (num ficheiro à parte: o
// `lazy` guarda o módulo depois da primeira vez, e noutro teste a espera já não existiria).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, PESSOA_ID } from "@/hooks/pessoas/fichaFabrica";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useProcesso } from "@/components/pessoas/processo/processoContexto";
import { ProcessoProviderReal } from "./ProcessoProviderReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("react-router-dom", async (importar) => ({ ...(await importar<typeof import("react-router-dom")>()), useNavigate: () => vi.fn() }));
vi.mock("./PainelVisitaLevantamentoReal", async () => {
  await new Promise((resolver) => setTimeout(resolver, 150));
  return { PainelVisitaLevantamentoReal: () => <div role="dialog" aria-label="painel carregado" /> };
});

afterEach(cleanup);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };

function Consumidor() {
  const processo = useProcesso();
  return <button type="button" onClick={(e) => processo?.abrirVisitaLevantamento(PESSOA_ID, e.currentTarget)}>abrir painel</button>;
}

describe("primeira abertura do painel «Visita e levantamento»", () => {
  it("diz que está a abrir (região de estado) até o painel chegar, e depois mostra-o", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FontePessoasContext.Provider value={REAL}>
          <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}>
            <ProcessoProviderReal ficha={fichaDb()}><Consumidor /></ProcessoProviderReal>
          </ComCostura>
        </FontePessoasContext.Provider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "abrir painel" }));
    expect(screen.getByRole("status")).toHaveTextContent("A abrir o painel");
    await screen.findByRole("dialog", { name: "painel carregado" }, { timeout: 5000 });
    await waitFor(() => expect(screen.queryByText("A abrir o painel…")).toBeNull());
  });
});
