import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { QuadroPessoasEstado } from "@/hooks/pessoas/useQuadroPessoas";
import { cartaoQuadro, quadroBase } from "./fabricaQuadro";
import { QuadroReal, textoEstadoQuadro } from "./QuadroReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const CARTOES = [
  cartaoQuadro("a", { nome: "Ana Lopes" }),
  cartaoQuadro("b", { nome: "Bruno Reis", coluna: "visita", passo: "fecharLevantamento" }),
  cartaoQuadro("n1", { id: "neg-1", pessoaId: "dono-1", nome: "Carla Dias", coluna: "orcamento", trabalho: "Cozinha", valor: 900, passo: "criarProposta" }),
];

function desenhar(quadro: QuadroPessoasEstado, extra: { temFiltros?: boolean; aoAbrir?: () => void; aoLimpar?: () => void } = {}) {
  const props = { temFiltros: false, aoAbrir: vi.fn(), aoLimpar: vi.fn(), ...extra };
  const ui = render(<QuadroReal quadro={quadro} {...props} />);
  return { ...props, ...ui, reenviar: (q: QuadroPessoasEstado) => ui.rerender(<QuadroReal quadro={q} {...props} />) };
}
const coluna = (nome: RegExp) => screen.getByRole("region", { name: nome });

describe("QuadroReal: estados", () => {
  it("a carregar: diz-o e não desenha colunas", () => {
    desenhar(quadroBase({ isLoading: true }));
    expect(screen.getByText("A carregar o quadro...")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("erro sem dados: alerta traduzido e «Repetir» refaz", () => {
    const recarregar = vi.fn();
    const erro = new ErroNeg(new Error("x"), "NG009", "pessoasPagina.real.board.error");
    desenhar(quadroBase({ isError: true, erroSemDados: true, erro, recarregar }));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o quadro.");
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("erro com cartões retidos: aviso não bloqueante, cartões à vista e «Repetir»", () => {
    const recarregar = vi.fn();
    desenhar(quadroBase({ isError: true, recarregar }, CARTOES));
    expect(screen.getByText(/Não foi possível atualizar o quadro/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("vazio sem filtros: diz que não há cartões e não oferece limpar", () => {
    desenhar(quadroBase());
    expect(screen.getByText("Ainda não há cartões no quadro.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Limpar filtros/ })).toBeNull();
  });

  it("vazio com filtros: diz que nada corresponde e «Limpar filtros» limpa", () => {
    const { aoLimpar } = desenhar(quadroBase(), { temFiltros: true });
    expect(screen.getByText("Nenhum cartão corresponde aos filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(aoLimpar).toHaveBeenCalledTimes(1);
  });

  it("a mostrar os de um filtro anterior não afirma que está vazio", () => {
    desenhar(quadroBase({ aMostrarAnterior: true }));
    expect(screen.queryByText("Ainda não há cartões no quadro.")).toBeNull();
    expect(screen.queryByText("Nenhum cartão corresponde aos filtros.")).toBeNull();
  });
});

describe("QuadroReal: colunas e cartões", () => {
  it("as 3 colunas da abordagem e a coluna Negócio são regiões com nome (sem sub-fases); a primeira chama-se «Novo»", () => {
    desenhar(quadroBase({}, CARTOES));
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
    expect(coluna(/^Novo/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Por contactar/ })).toBeNull();
    expect(within(coluna(/^Negócio/)).getByText("Cozinha")).toBeInTheDocument();
  });

  it("o nome de qualquer cartão (também na abordagem) abre a pessoa com o negócio dele", () => {
    const { aoAbrir } = desenhar(quadroBase({}, CARTOES));
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" }));
    expect(aoAbrir).toHaveBeenLastCalledWith("a", "neg-a");
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Carla Dias" }));
    expect(aoAbrir).toHaveBeenLastCalledWith("dono-1", "neg-1");
  });

  it("o botão do passo (sem processo) abre a ficha, como o nome", () => {
    const { aoAbrir } = desenhar(quadroBase({}, CARTOES));
    fireEvent.click(within(coluna(/^Negócio/)).getAllByRole("button").find((b) => /abre a ficha/.test(b.getAttribute("aria-label") ?? ""))!);
    expect(aoAbrir).toHaveBeenLastCalledWith("dono-1", "neg-1");
  });

  it("o botão do passo de um cartão da abordagem também abre a pessoa com o negócio", () => {
    const { aoAbrir } = desenhar(quadroBase({}, CARTOES));
    fireEvent.click(within(coluna(/^Novo/)).getAllByRole("button").find((b) => /abre a ficha/.test(b.getAttribute("aria-label") ?? ""))!);
    expect(aoAbrir).toHaveBeenLastCalledWith("a", "neg-a");
  });

  it("um cartão sem negócio (tipo pessoa, que a base já não devolve) não abre nada: o assistente nunca recebe só a pessoa", () => {
    const { aoAbrir } = desenhar(quadroBase({}, [cartaoQuadro("z", { nome: "Zé Antigo", tipo: "pessoa", id: "pessoa-z", trabalho: null })]));
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Zé Antigo" }));
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it("um cartão sem nome mostra «Sem nome»", () => {
    desenhar(quadroBase({}, [cartaoQuadro("z", { nome: "" })]));
    expect(screen.getByRole("button", { name: "Abrir a ficha de Sem nome" })).toHaveTextContent("Sem nome");
  });

  it("«Carregar mais» de uma coluna chama carregarMais com essa coluna", () => {
    const carregarMais = vi.fn();
    desenhar(quadroBase({ carregarMais }, CARTOES, { orcamento: { total: 40, haMais: true } }));
    fireEvent.click(within(coluna(/^Negócio/)).getByRole("button", { name: /Carregar mais \(39 em falta\)/ }));
    expect(carregarMais).toHaveBeenCalledWith("orcamento");
  });

  it("enquanto mostra os cartões de um filtro anterior, «Carregar mais» fica desativado e não chama a base", () => {
    const carregarMais = vi.fn();
    desenhar(quadroBase({ carregarMais, aMostrarAnterior: true }, CARTOES, { orcamento: { total: 40, haMais: true } }));
    const botao = within(coluna(/^Negócio/)).getByRole("button", { name: /Carregar mais \(39 em falta\)/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(carregarMais).not.toHaveBeenCalled();
  });

  it("a coluna com erro ao carregar mais mostra o erro nessa coluna", () => {
    const erro = new ErroNeg(new Error("x"), null, "pessoasPagina.real.error");
    desenhar(quadroBase({ errosAoCarregarMais: { orcamento: erro } }, CARTOES, { orcamento: { total: 40, haMais: true } }));
    expect(within(coluna(/^Negócio/)).getByText("Não foi possível carregar mais cartões.")).toBeInTheDocument();
    expect(within(coluna(/^Visita/)).queryByText("Não foi possível carregar mais cartões.")).toBeNull();
  });
});

describe("QuadroReal: teclado e anúncios", () => {
  it("j e k movem o foco entre os cartões pela ordem do DOM e o abre a ficha do focado", () => {
    const { aoAbrir } = desenhar(quadroBase({}, CARTOES));
    const a = screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" });
    a.focus();
    fireEvent.keyDown(a, { key: "j" });
    expect(screen.getByRole("button", { name: "Abrir a ficha de Bruno Reis" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "j" });
    expect(screen.getByRole("button", { name: "Abrir a ficha de Carla Dias" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "k" });
    expect(screen.getByRole("button", { name: "Abrir a ficha de Bruno Reis" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "o" });
    expect(aoAbrir).toHaveBeenLastCalledWith("b", "neg-b");
  });

  it("a região live anuncia que está a carregar mais numa coluna e, depois, quantos chegaram", () => {
    const base = quadroBase({}, CARTOES, { orcamento: { total: 40, haMais: true } });
    const ui = desenhar(base);
    const viva = () => screen.getByRole("status");
    expect(viva()).toBeEmptyDOMElement();
    ui.reenviar({ ...base, aCarregarMais: new Set(["orcamento"]) });
    expect(viva()).toHaveTextContent("A carregar mais cartões em Orçamento...");
    const mais = [...CARTOES, cartaoQuadro("n2", { id: "neg-2", coluna: "orcamento", trabalho: "Sala", valor: 1 })];
    ui.reenviar(quadroBase({}, mais, { orcamento: { total: 40, haMais: true } }));
    expect(viva()).toHaveTextContent("Carregados mais 1 em Orçamento. A mostrar 2 de 40.");
  });

  it("o erro de «Carregar mais» anuncia-se uma só vez: na região do Quadro, não na da página", () => {
    const erro = new ErroNeg(new Error("x"), null, "pessoasPagina.real.error");
    desenhar(quadroBase({ errosAoCarregarMais: { orcamento: erro } }, CARTOES, { orcamento: { total: 40, haMais: true } }));
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível carregar mais cartões.");
    expect(textoEstadoQuadro(((chave: string) => chave) as never, quadroBase({ errosAoCarregarMais: { orcamento: erro } }))).toBe("");
  });

  it("a região live está sempre montada, também vazia", () => {
    desenhar(quadroBase({ isLoading: true }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
