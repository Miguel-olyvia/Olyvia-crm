import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { CartaoPosContrato } from "@/hooks/pessoas/adaptarCartaoPosContrato";
import type { EstadoColunaPosContrato, QuadroPosContratoEstado } from "@/hooks/pessoas/useQuadroPosContrato";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { QuadroPosContrato } from "./QuadroPosContrato";

vi.mock("@/hooks/useTranslation", async () => (await import("../../pessoas-lista/traducaoTeste")).moduloTraducao());

const cartao = (id: string, sobre: Partial<CartaoPosContrato> = {}): CartaoPosContrato => ({
  id: `neg-${id}`, pessoaId: id, nome: `Pessoa ${id}`, papel: "cliente", coluna: "financeiro", trabalho: `Trabalho ${id}`, valor: null, passo: "pagamentoPorValidar", ...sobre,
});
const vazia = (): EstadoColunaPosContrato => ({ cartoes: [], cursor: null, haMais: false, total: 0, valor: 0 });

function estado(cartoes: CartaoPosContrato[] = [], sobre: Partial<QuadroPosContratoEstado> = {}, extras: Partial<Record<"financeiro" | "obra", Partial<EstadoColunaPosContrato>>> = {}): QuadroPosContratoEstado {
  const col = (id: "financeiro" | "obra"): EstadoColunaPosContrato => {
    const dela = cartoes.filter((c) => c.coluna === id);
    return { ...vazia(), cartoes: dela, total: dela.length, ...extras[id] };
  };
  return {
    colunas: { financeiro: col("financeiro"), obra: col("obra") }, cartoes, isLoading: false, isError: false, erro: null, indisponivel: false,
    aCarregarMais: new Set(), errosAoCarregarMais: {}, carregarMais: () => false, recarregar: () => undefined, ...sobre,
  };
}

function desenhar(q: QuadroPosContratoEstado, aoAbrir = vi.fn()) {
  render(<div><QuadroPosContrato estado={q} aoAbrir={aoAbrir} /></div>);
  return { aoAbrir };
}
const coluna = (nome: RegExp) => screen.getByRole("region", { name: nome });

describe("QuadroPosContrato: as colunas", () => {
  it("há duas regiões com nome, Financeiro e Obra, cada uma com um h3", () => {
    desenhar(estado());
    expect(screen.getAllByRole("region")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([expect.stringMatching(/^Financeiro/), expect.stringMatching(/^Obra/)]);
  });

  it("cada cartão está na sua coluna e a contagem vem em texto para o leitor de ecrã", () => {
    desenhar(estado([cartao("a"), cartao("b", { coluna: "obra", passo: "obraPorAbrir" })]));
    expect(within(coluna(/^Financeiro/)).getByText("Trabalho a")).toBeInTheDocument();
    expect(within(coluna(/^Obra/)).getByText("Trabalho b")).toBeInTheDocument();
    expect(within(coluna(/^Financeiro/)).queryByText("Trabalho b")).toBeNull();
    expect(coluna(/^Financeiro/)).toHaveTextContent(/1 cartão/);
  });

  it("o cartão de Financeiro diz «pagamento por validar» e o de Obra diz «Obra por abrir», por texto", () => {
    desenhar(estado([cartao("a"), cartao("b", { coluna: "obra", passo: "obraPorAbrir" })]));
    expect(within(coluna(/^Financeiro/)).getByText("Pagamento por validar")).toBeInTheDocument();
    expect(within(coluna(/^Obra/)).getByText("Obra por abrir")).toBeInTheDocument();
  });

  it("o valor do cartão e o da coluna mostram-se em euros", () => {
    desenhar(estado([cartao("a", { valor: 1500 })], {}, { financeiro: { valor: 4000.5, total: 3 } }));
    expect(within(coluna(/^Financeiro/)).getAllByText(formatarMeta("euro", 1500)).length).toBeGreaterThan(0);
    expect(within(coluna(/^Financeiro/)).getAllByText(formatarMeta("euro", 4000.5)).length).toBeGreaterThan(0);
    expect(formatarMeta("euro", 1500)).toMatch(/€/);
  });

  it("coluna sem cartões diz-o", () => {
    desenhar(estado());
    expect(within(coluna(/^Obra/)).getByText("Nada nesta fase")).toBeInTheDocument();
  });
});

describe("QuadroPosContrato: abrir", () => {
  it("o nome abre a pessoa já no negócio do cartão", () => {
    const { aoAbrir } = desenhar(estado([cartao("a")]));
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Pessoa a" }));
    expect(aoAbrir).toHaveBeenCalledWith("a", "neg-a");
  });

  it("o botão do nome leva as marcas dos atalhos j/k/o (pessoa e negócio)", () => {
    desenhar(estado([cartao("a")]));
    const botao = screen.getByRole("button", { name: "Abrir a ficha de Pessoa a" });
    expect(botao).toHaveAttribute("data-linha-pessoa", "a");
    expect(botao).toHaveAttribute("data-negocio-id", "neg-a");
  });

  it("um cartão sem nome mostra «Sem nome»", () => {
    desenhar(estado([cartao("a", { nome: "" })]));
    expect(screen.getByRole("button", { name: "Abrir a ficha de Sem nome" })).toHaveTextContent("Sem nome");
  });

  it("o passo não é um botão: não finge uma ação que ainda não existe", () => {
    desenhar(estado([cartao("a"), cartao("b", { coluna: "obra", passo: "obraPorAbrir" })]));
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

describe("QuadroPosContrato: estados honestos", () => {
  it("indisponível (a base ainda não tem as colunas): explica-o em ambas e não mostra «Sem cartões»", () => {
    desenhar(estado([], { indisponivel: true }));
    expect(screen.getAllByText(/ainda não está disponível/i)).toHaveLength(2);
    expect(screen.queryByText("Nada nesta fase")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a carregar: diz-o, com aria-busy, e não diz que está vazio", () => {
    desenhar(estado([], { isLoading: true }));
    expect(within(coluna(/^Financeiro/)).getByText("A carregar...")).toBeInTheDocument();
    expect(coluna(/^Financeiro/)).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Nada nesta fase")).toBeNull();
  });

  it("erro: alerta traduzido e «Repetir» refaz o pedido", () => {
    const recarregar = vi.fn();
    desenhar(estado([], { isError: true, erro: new ErroNeg(new Error("x"), "42501", "pessoasPagina.real.board.error"), recarregar }));
    // o erro diz-se nas DUAS colunas (a Obra não fica com um quadro «vazio» sem explicação); cada uma deixa repetir
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(within(coluna(/^Obra/)).getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    fireEvent.click(within(coluna(/^Financeiro/)).getByRole("button", { name: /Repetir/ }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("a carregar, em erro ou sem a coluna na base não mostra «0» como contagem", () => {
    for (const parcial of [{ isLoading: true }, { isError: true }, { indisponivel: true }]) {
      desenhar(estado([], parcial));
      const col = coluna(/^Financeiro/);
      expect(within(col).queryByText("0")).toBeNull();
      expect(within(col).getByText("–")).toBeInTheDocument();
      cleanup();
    }
  });

  it("erro com cartões já carregados mantém-nos à vista", () => {
    desenhar(estado([cartao("a")], { isError: true, erro: new ErroNeg(new Error("x"), null, "pessoasPagina.real.board.error") }));
    expect(screen.getByRole("button", { name: "Abrir a ficha de Pessoa a" })).toBeInTheDocument();
  });
});

describe("QuadroPosContrato: carregar mais", () => {
  it("«Carregar mais» de Financeiro chama carregarMais com essa coluna", () => {
    const carregarMais = vi.fn();
    desenhar(estado([cartao("a")], { carregarMais }, { financeiro: { total: 40, haMais: true } }));
    fireEvent.click(within(coluna(/^Financeiro/)).getByRole("button", { name: /Carregar mais \(39 em falta\)/ }));
    expect(carregarMais).toHaveBeenCalledWith("financeiro");
    expect(within(coluna(/^Obra/)).queryByRole("button", { name: /Carregar mais/ })).toBeNull();
  });

  it("a coluna com erro ao carregar mais mostra o erro só nessa coluna", () => {
    const erro = new ErroNeg(new Error("x"), null, "pessoasPagina.real.error");
    desenhar(estado([cartao("a")], { errosAoCarregarMais: { financeiro: erro } }, { financeiro: { total: 40, haMais: true } }));
    expect(within(coluna(/^Financeiro/)).getByText("Não foi possível carregar mais cartões.")).toBeInTheDocument();
    expect(within(coluna(/^Obra/)).queryByText("Não foi possível carregar mais cartões.")).toBeNull();
  });
});
