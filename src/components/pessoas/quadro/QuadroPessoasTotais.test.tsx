import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QuadroPessoas } from "./QuadroPessoas";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";
import { cartaoQuadro } from "@/components/pessoas-lista/fabricaQuadro";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const negocio = (id: string, coluna: CartaoQuadro["coluna"], valor: number | null): CartaoQuadro =>
  cartaoQuadro(id, { id, tipo: "negocio", coluna, trabalho: "Cozinha", valor, passo: "criarProposta" });

const FASES = ["Levantamento", "Orçamento", "Proposta", "Contrato"];
// Sub-fase de negócio: h4 dentro do grupo «Negócios»; as outras colunas, h3.
const coluna = (titulo: string) => screen.getByRole("heading", { level: FASES.includes(titulo) ? 4 : 3, name: new RegExp(`^${titulo}`) }).closest("section")!;
const mostrar = (extra: Partial<React.ComponentProps<typeof QuadroPessoas>> = {}) =>
  render(<QuadroPessoas cartoes={[negocio("n1", "orcamento", 100), negocio("n2", "orcamento", 50)]} hoje="2026-10-21" chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} {...extra} />);

describe("QuadroPessoas com totais da base", () => {
  it("a contagem e o valor da coluna são os da base, não os dos cartões carregados", () => {
    mostrar({ totais: { orcamento: { total: 30, valor: 4000.5, haMais: true } } });
    const c = within(coluna("Orçamento"));
    expect(c.getByRole("heading", { level: 4 })).toHaveTextContent("30 cartões");
    expect(c.getByText(/4\D?000,50/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("uma coluna sem totais conta 0 e as de negócio com valor mostram 0 €; Levantamento nunca mostra soma", () => {
    mostrar({ totais: { orcamento: { total: 2, valor: 150, haMais: false } } });
    expect(within(coluna("Proposta")).getByRole("heading", { level: 4 })).toHaveTextContent("0 cartões");
    expect(within(coluna("Levantamento")).queryByText(/€/)).toBeNull();
    expect(within(coluna("Proposta")).getByText(/€/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("«Carregar mais» só aparece nas colunas a que faltam cartões e pede essa coluna", () => {
    const aoCarregarMais = vi.fn();
    mostrar({ totais: { orcamento: { total: 30, valor: 0, haMais: true }, proposta: { total: 0, valor: 0, haMais: false } }, aoCarregarMais });
    expect(screen.getAllByRole("button", { name: /Carregar mais/ })).toHaveLength(1);
    fireEvent.click(within(coluna("Orçamento")).getByRole("button", { name: /Carregar mais \(28 em falta\)/ }));
    expect(aoCarregarMais).toHaveBeenCalledWith("orcamento");
  });

  it("o grupo «Negócios» soma os totais da base das sub-fases (sem o valor do Levantamento) e cada sub-fase pagina à parte", () => {
    mostrar({
      totais: {
        levantamento: { total: 5, valor: 999, haMais: false }, orcamento: { total: 30, valor: 4000, haMais: true },
        proposta: { total: 3, valor: 500, haMais: false }, contrato: { total: 2, valor: 100, haMais: false },
      },
    });
    const grupo = screen.getByRole("heading", { level: 3, name: /^Negócios/ });
    expect(grupo).toHaveTextContent("40 cartões");
    const cab = within(grupo.parentElement!.parentElement as HTMLElement);
    expect(cab.getByText(/4\D?600/, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("marca a coluna a carregar e a coluna com erro", () => {
    mostrar({
      totais: { orcamento: { total: 30, valor: 0, haMais: true }, proposta: { total: 9, valor: 0, haMais: true } },
      aCarregarMais: new Set(["orcamento"]), colunasComErro: new Set(["proposta"]), aoCarregarMais: vi.fn(),
    });
    expect(within(coluna("Orçamento")).getByRole("button", { name: /Carregar mais/ })).toHaveAttribute("aria-busy", "true");
    expect(within(coluna("Proposta")).getByText("Não foi possível carregar mais cartões.")).toBeInTheDocument();
  });

  it("sem as props novas faz o que fazia: conta os cartões, soma o valor e não tem «Carregar mais»", () => {
    mostrar();
    expect(within(coluna("Orçamento")).getByRole("heading", { level: 4 })).toHaveTextContent("2 cartões");
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
    const botao = within(coluna("Orçamento")).getByRole("button", { name: /Carregar mais/ });
    botao.focus();
    fireEvent.click(botao);
    expect(aoCarregarMais).toHaveBeenCalledTimes(1);
    // Mais tarde, por outro motivo (um refetch), a coluna cresce e o botão desaparece.
    ui.rerender(<QuadroPessoas {...props} cartoes={[...inicial, negocio("n2", "orcamento", 2)]} totais={{ orcamento: { total: 2, valor: 0, haMais: false } }} />);
    const abrir = within(coluna("Orçamento")).getAllByRole("button", { name: /^Abrir/ });
    expect(document.activeElement).not.toBe(abrir[1]);
  });

  it("depois de carregar tudo, o foco passa do botão que desapareceu para o primeiro cartão novo", () => {
    const aoCarregarMais = vi.fn();
    const inicial = [negocio("n1", "orcamento", 1)];
    const props = { hoje: "2026-10-21", chip: "todas" as const, aoAbrir: vi.fn(), aoLimpar: vi.fn(), aoCarregarMais };
    const ui = render(<QuadroPessoas {...props} cartoes={inicial} totais={{ orcamento: { total: 2, valor: 0, haMais: true } }} />);
    const botao = within(coluna("Orçamento")).getByRole("button", { name: /Carregar mais/ });
    botao.focus();
    fireEvent.click(botao);
    ui.rerender(<QuadroPessoas {...props} cartoes={[...inicial, negocio("n2", "orcamento", 2)]} totais={{ orcamento: { total: 2, valor: 0, haMais: false } }} />);
    const abrir = within(coluna("Orçamento")).getAllByRole("button", { name: /^Abrir/ });
    expect(document.activeElement).toBe(abrir[1]);
  });
});
