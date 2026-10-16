import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErroDoCampo } from "./PecasNovoNegocio";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return { useTranslation: () => ({ language: "pt", t: (key: string) => negocioMetasTranslations.pt[key] ?? key }) };
});

describe("ErroDoCampo", () => {
  it("sem chave não desenha nada", () => {
    const { container } = render(<ErroDoCampo id="e1" chave={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("diz o erro em texto, ligado ao campo pelo id", () => {
    render(<ErroDoCampo id="e1" chave="error.person.obrigatorio" />);
    const erro = screen.getByText("Escolhe a pessoa do negócio.");
    expect(erro).toHaveAttribute("id", "e1");
  });

  it("o texto não usa a cor destrutiva (contraste abaixo de 4,5:1): fica só no ícone, escondido do leitor de ecrã", () => {
    render(<ErroDoCampo id="e1" chave="error.person.obrigatorio" />);
    const erro = screen.getByText("Escolhe a pessoa do negócio.");
    expect(erro.className).toContain("text-foreground");
    expect(erro.className).not.toContain("text-destructive");
    const icone = erro.querySelector("svg");
    expect(icone?.getAttribute("class")).toContain("text-destructive");
    expect(icone).toHaveAttribute("aria-hidden", "true");
  });
});
