import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RodapeColuna } from "./RodapeColuna";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const base = { coluna: "Orçamento", carregados: 25, total: 30, aCarregar: false, comErro: false, aoCarregarMais: vi.fn() };

describe("RodapeColuna", () => {
  it("não desenha nada quando não falta nada", () => {
    const { container } = render(<RodapeColuna {...base} total={25} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("diz quantos faltam e quantos se mostram, e o botão pede mais", () => {
    const aoCarregarMais = vi.fn();
    render(<RodapeColuna {...base} aoCarregarMais={aoCarregarMais} />);
    expect(screen.getByText("A mostrar 25 de 30")).toBeInTheDocument();
    const botao = screen.getByRole("button", { name: /^Carregar mais \(5 em falta\)/ });
    expect(botao).toHaveTextContent("Carregar mais (5 em falta)");
    expect(botao.getAttribute("aria-label")).toContain("Orçamento");
    expect(botao.className).toContain("min-h-11");
    fireEvent.click(botao);
    expect(aoCarregarMais).toHaveBeenCalledTimes(1);
  });

  it("a carregar: aria-busy e o clique é ignorado", () => {
    const aoCarregarMais = vi.fn();
    render(<RodapeColuna {...base} aCarregar aoCarregarMais={aoCarregarMais} />);
    const botao = screen.getByRole("button", { name: /Carregar mais/ });
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(aoCarregarMais).not.toHaveBeenCalled();
  });

  it("desativado (os cartões são de um filtro anterior): aria-disabled e o clique é ignorado, sem parecer carregado", () => {
    const aoCarregarMais = vi.fn();
    render(<RodapeColuna {...base} desativado aoCarregarMais={aoCarregarMais} />);
    const botao = screen.getByRole("button", { name: /Carregar mais/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    expect(aoCarregarMais).not.toHaveBeenCalled();
  });

  it("com erro: diz-o e o botão passa a «Repetir», que volta a pedir", () => {
    const aoCarregarMais = vi.fn();
    render(<RodapeColuna {...base} comErro aoCarregarMais={aoCarregarMais} />);
    expect(screen.getByText("Não foi possível carregar mais cartões.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Repetir/ }));
    expect(aoCarregarMais).toHaveBeenCalledTimes(1);
  });

  it("o total nunca dá número em falta negativo", () => {
    render(<RodapeColuna {...base} carregados={30} total={25} comErro />);
    expect(screen.queryByText(/-\d/)).toBeNull();
  });
});
