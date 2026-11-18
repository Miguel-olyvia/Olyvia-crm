// O alternador PT | EN do portal: grupo acessível com dois botões aria-pressed, nomes fixos, alvos de 44 px,
// sem classes de sidebar, a mudar e a guardar o idioma e a repor <html lang>.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PortalLanguageProvider } from "./PortalLanguageProvider";
import { PortalSeletorIdioma } from "./PortalSeletorIdioma";
import { usePortalIdioma } from "./usePortalIdioma";
import { CHAVE_IDIOMA_PORTAL } from "./tipos";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "";
});

function Idioma() {
  return <p data-testid="idioma">{usePortalIdioma().idioma}</p>;
}

describe("PortalSeletorIdioma", () => {
  it("é um grupo com dois botões nativos chamados Português e English", () => {
    render(<PortalSeletorIdioma />);
    const grupo = screen.getByRole("group");
    expect(grupo).toHaveAccessibleName(/idioma/i);
    const botoes = within(grupo).getAllByRole("button");
    expect(botoes.map((b) => b.getAttribute("aria-label"))).toEqual(["Português", "English"]);
    for (const b of botoes) {
      expect(b.tagName).toBe("BUTTON");
      expect(b).toHaveAttribute("type", "button");
    }
    expect(screen.getByRole("button", { name: "Português" })).toHaveAttribute("lang", "pt");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("lang", "en");
  });

  it("começa em Português e marca-o com aria-pressed", () => {
    render(<PortalSeletorIdioma />);
    expect(screen.getByRole("button", { name: "Português" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
  });

  it("começa em English quando é isso que está guardado", () => {
    window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en");
    render(<PortalSeletorIdioma />);
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Português" })).toHaveAttribute("aria-pressed", "false");
  });

  it("alterna, persiste e os nomes dos botões não mudam com o idioma", () => {
    render(
      <>
        <PortalSeletorIdioma />
        <Idioma />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByTestId("idioma")).toHaveTextContent("en");
    expect(window.localStorage.getItem(CHAVE_IDIOMA_PORTAL)).toBe("en");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Português" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group")).toHaveAccessibleName(/idioma/i);

    fireEvent.click(screen.getByRole("button", { name: "Português" }));
    expect(screen.getByTestId("idioma")).toHaveTextContent("pt");
    expect(window.localStorage.getItem(CHAVE_IDIOMA_PORTAL)).toBe("pt");
  });

  it("clicar no idioma que já está ativo não o desliga", () => {
    render(<PortalSeletorIdioma />);
    fireEvent.click(screen.getByRole("button", { name: "Português" }));
    expect(screen.getByRole("button", { name: "Português" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
  });

  it("dois seletores na mesma página ficam sincronizados", () => {
    render(
      <>
        <PortalSeletorIdioma compacto />
        <PortalSeletorIdioma />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "English" })[0]);
    for (const b of screen.getAllByRole("button", { name: "English" })) expect(b).toHaveAttribute("aria-pressed", "true");
  });

  it("na variante normal mostra os nomes por extenso", () => {
    render(<PortalSeletorIdioma />);
    expect(screen.getByRole("button", { name: "Português" })).toHaveTextContent("Português");
    expect(screen.getByRole("button", { name: "English" })).toHaveTextContent("English");
  });

  it("na variante compacta mostra PT e EN, com os mesmos nomes acessíveis", () => {
    render(<PortalSeletorIdioma compacto />);
    expect(screen.getByRole("button", { name: "Português" })).toHaveTextContent(/^PT$/);
    expect(screen.getByRole("button", { name: "English" })).toHaveTextContent(/^EN$/);
  });

  it.each([false, true])("os botões têm alvo de pelo menos 44 px (compacto=%s)", (compacto) => {
    render(<PortalSeletorIdioma compacto={compacto} />);
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).toMatch(/\bmin-h-11\b/);
      expect(b.className).toMatch(/\bmin-w-11\b/);
    }
  });

  it.each([false, true])("usa tokens do tema (claro e escuro) e nenhuma classe de sidebar (compacto=%s)", (compacto) => {
    const { container } = render(<PortalSeletorIdioma compacto={compacto} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/sidebar/);
    expect(html).toMatch(/bg-primary/);
    expect(html).toMatch(/text-primary-foreground/);
    expect(html).toMatch(/text-muted-foreground/);
    expect(html).toMatch(/focus-visible:ring-ring/);
    // Nada de cores fixas que só funcionam num dos temas.
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:white|black|gray|slate|zinc)-?\d*\b/);
  });

  it("aceita uma className extra no grupo", () => {
    render(<PortalSeletorIdioma className="ml-auto" />);
    expect(screen.getByRole("group")).toHaveClass("ml-auto");
  });

  it("dentro do Provider acerta <html lang> ao alternar e repõe-no ao desmontar", () => {
    document.documentElement.lang = "de";
    const { unmount } = render(
      <PortalLanguageProvider>
        <PortalSeletorIdioma />
      </PortalLanguageProvider>,
    );
    expect(document.documentElement.lang).toBe("pt");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(document.documentElement.lang).toBe("en");
    unmount();
    expect(document.documentElement.lang).toBe("de");
  });
});
