import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QuadroPessoas } from "./QuadroPessoas";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";
import { cartaoQuadro } from "@/components/pessoas-lista/fabricaQuadro";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const negocio = (id: string, coluna: CartaoQuadro["coluna"], valor: number | null): CartaoQuadro =>
  cartaoQuadro(id, { id, tipo: "negocio", coluna, trabalho: "Cozinha", valor, passo: "criarProposta" });

// Cada coluna é um h3; os negócios de todas as fases vivem na coluna única «Negócio».
const coluna = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;
const mostrar = (extra: Partial<React.ComponentProps<typeof QuadroPessoas>> = {}) =>
  render(<QuadroPessoas cartoes={[negocio("n1", "orcamento", 100), negocio("n2", "orcamento", 50)]} hoje="2026-10-21" chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} {...extra} />);

describe("QuadroPessoas com totais da base", () => {
  it("a contagem e o valor da coluna são os da base, não os dos cartões carregados", () => {
    mostrar({ totais: { orcamento: { total: 30, valor: 4000.5, haMais: true } } });
    const c = within(coluna("Negócio"));
    expect(c.getByRole("heading", { level: 3 })).toHaveTextContent("30 cartões");
    expect(c.getByText(/4\D?000,50/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("sem totais de uma fase ela conta 0; o Levantamento nunca soma valor e uma coluna sem negócios mostra 0 €", () => {
    mostrar({ cartoes: [], totais: { levantamento: { total: 4, valor: 999, haMais: false } } });
    const c = within(coluna("Negócio"));
    expect(c.getByRole("heading", { level: 3 })).toHaveTextContent("4 cartões");
    expect(c.getByText(/0\D?€|€\D?0/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("UM só «Carregar mais» na coluna «Negócio», que pede cada fase a que faltam cartões e só essas", () => {
    const aoCarregarMais = vi.fn();
    mostrar({
      totais: { orcamento: { total: 30, valor: 0, haMais: true }, proposta: { total: 9, valor: 0, haMais: true }, contrato: { total: 0, valor: 0, haMais: false } },
      aoCarregarMais,
    });
    const botoes = within(coluna("Negócio")).getAllByRole("button", { name: /Carregar mais/ });
    expect(botoes).toHaveLength(1);
    expect(botoes[0]).toHaveAccessibleName(/Negócio/);
    fireEvent.click(botoes[0]);
    expect(aoCarregarMais).toHaveBeenCalledTimes(2);
    expect(aoCarregarMais).toHaveBeenCalledWith("orcamento");
    expect(aoCarregarMais).toHaveBeenCalledWith("proposta");
  });

  it("a coluna «Negócio» soma os totais da base das fases (sem o valor do Levantamento)", () => {
    mostrar({
      totais: {
        levantamento: { total: 5, valor: 999, haMais: false }, orcamento: { total: 30, valor: 4000, haMais: true },
        proposta: { total: 3, valor: 500, haMais: false }, contrato: { total: 2, valor: 100, haMais: false },
      },
    });
    const grupo = screen.getByRole("heading", { level: 3, name: /^Negócio/ });
    expect(grupo).toHaveTextContent("40 cartões");
    const cab = within(grupo.parentElement!.parentElement as HTMLElement);
    expect(cab.getByText(/4\D?600/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("o estado a carregar de qualquer fase do grupo marca o botão único; o erro de qualquer fase mostra o erro e «Repetir»", () => {
    const totais = { orcamento: { total: 30, valor: 0, haMais: true }, proposta: { total: 9, valor: 0, haMais: true } };
    const ui = render(
      <QuadroPessoas cartoes={[negocio("n1", "orcamento", 1)]} hoje="2026-10-21" chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} totais={totais}
        aCarregarMais={new Set(["orcamento"])} aoCarregarMais={vi.fn()} />,
    );
    expect(within(coluna("Negócio")).getByRole("button", { name: /Carregar mais/ })).toHaveAttribute("aria-busy", "true");
    ui.rerender(
      <QuadroPessoas cartoes={[negocio("n1", "orcamento", 1)]} hoje="2026-10-21" chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} totais={totais}
        colunasComErro={new Set(["proposta"])} aoCarregarMais={vi.fn()} />,
    );
    expect(within(coluna("Negócio")).getByText("Não foi possível carregar mais cartões.")).toBeInTheDocument();
    expect(within(coluna("Negócio")).getByRole("button", { name: /Repetir/ })).toBeInTheDocument();
  });

  it("com «Carregar mais» desativado (cartões de um filtro anterior) o botão único não chama a base", () => {
    const aoCarregarMais = vi.fn();
    mostrar({ totais: { orcamento: { total: 30, valor: 0, haMais: true } }, aoCarregarMais, carregarMaisDesativado: true });
    const botao = within(coluna("Negócio")).getByRole("button", { name: /Carregar mais/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(aoCarregarMais).not.toHaveBeenCalled();
  });

  it("sem as props novas faz o que fazia: conta os cartões, soma o valor e não tem «Carregar mais»", () => {
    mostrar();
    expect(within(coluna("Negócio")).getByRole("heading", { level: 3 })).toHaveTextContent("2 cartões");
    expect(screen.queryByRole("button", { name: /Carregar mais/ })).toBeNull();
    expect(screen.getByText("Por contactar", { selector: "h3" })).toBeInTheDocument();
  });

  it("rotulosColuna troca o título (a coluna «Novo» do modo real)", () => {
    mostrar({ rotulosColuna: { porContactar: "Novo" } });
    expect(screen.getByRole("heading", { level: 3, name: /^Novo/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: /^Por contactar/ })).toBeNull();
  });

  it("semAvisoVazio esconde o aviso de quadro vazio", () => {
    render(<QuadroPessoas cartoes={[]} hoje="2026-10-21" chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} semAvisoVazio />);
    expect(screen.queryByRole("button", { name: /Limpar/ })).toBeNull();
  });

  it("se o pedido não saiu (sem cursor, ou nada a pedir), um refetch posterior não rouba o foco para um cartão", () => {
    const aoCarregarMais = vi.fn(() => false);
    const inicial = [negocio("n1", "orcamento", 1)];
    const props = { hoje: "2026-10-21", chip: "todas" as const, aoAbrir: vi.fn(), aoLimpar: vi.fn(), aoCarregarMais };
    const ui = render(<QuadroPessoas {...props} cartoes={inicial} totais={{ orcamento: { total: 2, valor: 0, haMais: true } }} />);
    const botao = within(coluna("Negócio")).getByRole("button", { name: /Carregar mais/ });
    botao.focus();
    fireEvent.click(botao);
    expect(aoCarregarMais).toHaveBeenCalledTimes(1);
    // Mais tarde, por outro motivo (um refetch), a coluna cresce e o botão desaparece.
    ui.rerender(<QuadroPessoas {...props} cartoes={[...inicial, negocio("n2", "orcamento", 2)]} totais={{ orcamento: { total: 2, valor: 0, haMais: false } }} />);
    const abrir = within(coluna("Negócio")).getAllByRole("button", { name: /^Abrir/ });
    expect(document.activeElement).not.toBe(abrir[1]);
  });

  it("depois de carregar tudo, o foco passa do botão que desapareceu para o primeiro cartão novo", () => {
    const aoCarregarMais = vi.fn();
    const inicial = [negocio("n1", "orcamento", 1)];
    const props = { hoje: "2026-10-21", chip: "todas" as const, aoAbrir: vi.fn(), aoLimpar: vi.fn(), aoCarregarMais };
    const ui = render(<QuadroPessoas {...props} cartoes={inicial} totais={{ orcamento: { total: 2, valor: 0, haMais: true } }} />);
    const botao = within(coluna("Negócio")).getByRole("button", { name: /Carregar mais/ });
    botao.focus();
    fireEvent.click(botao);
    ui.rerender(<QuadroPessoas {...props} cartoes={[...inicial, negocio("n2", "orcamento", 2)]} totais={{ orcamento: { total: 2, valor: 0, haMais: false } }} />);
    const abrir = within(coluna("Negócio")).getAllByRole("button", { name: /^Abrir/ });
    expect(document.activeElement).toBe(abrir[1]);
  });
});
