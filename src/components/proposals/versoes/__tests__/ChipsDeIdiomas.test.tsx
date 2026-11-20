import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

import { ChipsDeIdiomas } from "../ChipsDeIdiomas";

const LINHA = {
  footer_text: "Rodapé",
  sections: [],
  design_settings: { accept_button_text: "Aceitar" } as Record<string, unknown>,
};

describe("ChipsDeIdiomas", () => {
  it("template sem versões: não desenha nada (a lista fica como hoje)", () => {
    const { container } = render(<ChipsDeIdiomas template={LINHA} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem design_settings ou nulo: não desenha nada", () => {
    const { container, rerender } = render(<ChipsDeIdiomas template={{ ...LINHA, design_settings: null }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ChipsDeIdiomas template={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com versões mostra «PT · EN» e assinala o que está incompleto", () => {
    render(<ChipsDeIdiomas template={{ ...LINHA, design_settings: { ...LINHA.design_settings, versions: { en: { base_hash: "x" } } } }} />);
    expect(screen.getByText("PT · EN")).toBeInTheDocument();
    const incompleto = screen.getByText("EN incompleto");
    expect(incompleto).toBeInTheDocument();
    expect(incompleto).toHaveAttribute("title", "2 por traduzir em inglês");
  });

  it("versão completa: só a lista de idiomas, sem «incompleto»", () => {
    render(
      <ChipsDeIdiomas
        template={{ ...LINHA, design_settings: { ...LINHA.design_settings, versions: { en: { footer_text: "Footer", accept_button_text: "Accept" } } } }}
      />,
    );
    expect(screen.getByText("PT · EN")).toBeInTheDocument();
    expect(screen.queryByText(/incompleto/)).toBeNull();
  });

  it("o chip dos idiomas tem nome acessível com os idiomas por extenso", () => {
    render(<ChipsDeIdiomas template={{ ...LINHA, design_settings: { versions: { en: { footer_text: "F", accept_button_text: "A" } } } }} />);
    expect(screen.getByLabelText("Idiomas: português, inglês")).toBeInTheDocument();
  });
});
