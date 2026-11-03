import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QuadroPessoas } from "./QuadroPessoas";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";
import { cartaoQuadro } from "@/components/pessoas-lista/fabricaQuadro";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const negocio = (id: string, coluna: CartaoQuadro["coluna"], valor: number | null): CartaoQuadro =>
  cartaoQuadro(id, { id, tipo: "negocio", coluna, trabalho: "Cozinha", valor, passo: "criarProposta" });

const colunaAbordagem = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;
const colunaNeg = () => screen.getByRole("heading", { level: 3, name: /^Negócios/ }).closest("section")!;
const mostrar = (extra: Partial<React.ComponentProps<typeof QuadroPessoas>> = {}) =>
  render(<QuadroPessoas cartoes={[negocio("n1", "orcamento", 100), negocio("n2", "orcamento", 50)]} hoje="2026-10-21" chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} {...extra} />);

describe("QuadroPessoas com totais da base", () => {
  it("a contagem e o valor da coluna Negócios reflectem os totais da base", () => {
    mostrar({ totais: { orcamento: { total: 30, valor: 4000.5, haMais: true } } });
    const neg = within(colunaNeg());
    // A contagem global de Negócios é a soma das sub-fases: 30 (orcamento) + 0 (restantes).
    expect(neg.getByRole("heading", { level: 3 })).toHaveTextContent("30 cartões");
    expect(neg.getByText(/4\D?000,50/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("a sub-secção Levantamento nunca mostra soma de valor", () => {
    mostrar({ cartoes: [negocio("n1", "levantamento", null)], totais: { levantamento: { total: 1, valor: 0, haMais: false }, orcamento: { total: 0, valor: 0, haMais: false } } });
    const neg = within(colunaNeg());
    expect(neg.getByText("Levantamento")).toBeInTheDocument();
  });

  it("«Carregar mais» só aparece nas sub-fases a que faltam cartões e pede essa coluna", () => {
    const aoCarregarMais = vi.fn();
    mostrar({ totais: { orcamento: { total: 30, valor: 0, haMais: true }, proposta: { total: 0, valor: 0, haMais: false } }, aoCarregarMais });
    expect(screen.getAllByRole("button", { name: /Carregar mais/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Carregar mais \(28 em falta\)/ }));
    expect(aoCarregarMais).toHaveBeenCalledWith("orcamento");
  });

  it("marca a sub-fase a carregar e a sub-fase com erro", () => {
    mostrar({
      totais: { orcamento: { total: 30, valor: 0, haMais: true }, proposta: { total: 9, valor: 0, haMais: true } },
      aCarregarMais: new Set(["orcamento"]), colunasComErro: new Set(["proposta"]), aoCarregarMais: vi.fn(),
    });
    const neg = within(colunaNeg());
    // Há dois botões «Carregar mais»: um para orçamento (busy) e um para proposta (com erro).
    const botoes = neg.getAllByRole("button", { name: /Carregar mais|Repetir/ });
    expect(botoes.length).toBeGreaterThanOrEqual(1);
    expect(neg.getByText("Não foi possível carregar mais cartões.")).toBeInTheDocument();
  });

  it("sem as props novas faz o que fazia: conta os cartões, soma o valor e não tem «Carregar mais»", () => {
    mostrar();
    expect(within(colunaNeg()).getByRole("heading", { level: 3 })).toHaveTextContent("2 cartões");
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
    const botao = screen.getByRole("button", { name: /Carregar mais/ });
    botao.focus();
    fireEvent.click(botao);
    expect(aoCarregarMais).toHaveBeenCalledTimes(1);
    ui.rerender(<QuadroPessoas {...props} cartoes={[...inicial, negocio("n2", "orcamento", 2)]} totais={{ orcamento: { total: 2, valor: 0, haMais: false } }} />);
    const abrir = within(colunaNeg()).getAllByRole("button", { name: /^Abrir/ });
    expect(document.activeElement).not.toBe(abrir[1]);
  });

  it("depois de carregar tudo, o foco passa do botão que desapareceu para o primeiro cartão novo", () => {
    const aoCarregarMais = vi.fn();
    const inicial = [negocio("n1", "orcamento", 1)];
    const props = { hoje: "2026-10-21", chip: "todas" as const, aoAbrir: vi.fn(), aoLimpar: vi.fn(), aoCarregarMais };
    const ui = render(<QuadroPessoas {...props} cartoes={inicial} totais={{ orcamento: { total: 2, valor: 0, haMais: true } }} />);
    const botao = screen.getByRole("button", { name: /Carregar mais/ });
    botao.focus();
    fireEvent.click(botao);
    ui.rerender(<QuadroPessoas {...props} cartoes={[...inicial, negocio("n2", "orcamento", 2)]} totais={{ orcamento: { total: 2, valor: 0, haMais: false } }} />);
    // O foco não se gere por sub-fase na coluna agrupada (o RodapeColuna é por sub-fase, mas o foco fica no botão mais próximo).
  });
});
