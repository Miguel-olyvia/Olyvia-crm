/**
 * O carregamento anuncia-se a quem usa leitor de ecrã: `role="status"` com texto só para leitores (a imagem é decorativa,
 * para não se ouvir duas vezes).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

describe("OlyviaLoader: acessibilidade", () => {
  it("é uma região de estado com o texto «A carregar...» só para leitores de ecrã", () => {
    render(<OlyviaLoader />);
    const estado = screen.getByRole("status");
    expect(estado).toHaveTextContent("A carregar...");
    expect(estado.querySelector(".sr-only")).not.toBeNull();
  });

  it("a imagem é decorativa (alt vazio): o texto não se repete", () => {
    const { container } = render(<OlyviaLoader />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("com texto visível, é esse o texto da região de estado", () => {
    render(<OlyviaLoader text="A ler a ficha" />);
    expect(screen.getByRole("status")).toHaveTextContent("A ler a ficha");
  });

  it("no modo inline também é uma região de estado", () => {
    render(<OlyviaLoader inline />);
    expect(screen.getByRole("status")).toHaveTextContent("A carregar...");
  });
});
