// Um negócio na coluna «Levantamento» do grupo Negócio tem o levantamento GUARDADO (a regra da base: tem_lev). O passo do cartão é o seguinte da Emylia, «Criar o
// orçamento», e não «Fazer o levantamento»; o botão abre a ficha (que abre na fase Negócio) em vez de abrir o painel do levantamento.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { cartaoQuadro } from "@/components/pessoas-lista/fabricaQuadro";
import { ProcessoContext, type ProcessoValor } from "../processo/processoContexto";
import type { ItemProcesso } from "../processo/tiposProcesso";
import { CartaoPessoaQuadro } from "./CartaoPessoaQuadro";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
afterEach(cleanup);

const item = (fase: ItemProcesso["fase"]): ItemProcesso => ({
  id: "neg-a", pessoaId: "a", tipo: "negocio", fase, trabalho: "Trabalho a", valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false,
});
const processo = (): ProcessoValor => ({ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true });

describe("o passo do cartão na coluna Levantamento", () => {
  it("diz «Criar o orçamento» (o seguinte da Emylia), nunca «Fazer o levantamento»", () => {
    render(<CartaoPessoaQuadro cartao={cartaoQuadro("a", { coluna: "levantamento", passo: "fazerLevantamento" })} hoje="2026-10-28" item={item("levantamento")} aoAbrir={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Criar o orçamento/ })).toBeInTheDocument();
    expect(screen.queryByText(/Fazer o levantamento/)).toBeNull();
  });

  it("o botão abre a ficha (na fase Negócio) e NÃO executa o levantamento", () => {
    const p = processo();
    const aoAbrir = vi.fn();
    render(
      <ProcessoContext.Provider value={p}>
        <CartaoPessoaQuadro cartao={cartaoQuadro("a", { coluna: "levantamento", passo: "fazerLevantamento" })} hoje="2026-10-28" item={item("levantamento")} aoAbrir={aoAbrir} />
      </ProcessoContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Criar o orçamento/ }));
    expect(aoAbrir).toHaveBeenCalledWith("a", "neg-a");
    expect(p.executar).not.toHaveBeenCalled();
    expect(p.abrirVisitaLevantamento).not.toHaveBeenCalled();
  });

  it("as colunas da abordagem não mudam: Visita continua a dizer «Fazer o levantamento»", () => {
    render(<CartaoPessoaQuadro cartao={cartaoQuadro("a", { coluna: "visita", passo: "fazerLevantamento" })} hoje="2026-10-28" item={item("visita")} aoAbrir={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Fazer o levantamento/ })).toBeInTheDocument();
  });
});
