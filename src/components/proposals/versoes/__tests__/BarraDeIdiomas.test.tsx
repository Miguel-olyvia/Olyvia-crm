import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

import { BarraDeIdiomas } from "../BarraDeIdiomas";

const EN_INCOMPLETO = { codigo: "en", faltam: 3, completo: false, desatualizado: false };

function montar(extra: Partial<React.ComponentProps<typeof BarraDeIdiomas>> = {}) {
  const props = {
    resumo: [EN_INCOMPLETO],
    idiomaAtivo: "pt",
    livres: ["es", "fr"],
    idPainel: "painel-teste",
    onEscolher: vi.fn(),
    onAdicionar: vi.fn(),
    ...extra,
  };
  render(<BarraDeIdiomas {...props} />);
  return props;
}

describe("BarraDeIdiomas", () => {
  it("sem versões não mostra abas, só o botão de adicionar idioma", () => {
    montar({ resumo: [] });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: /Adicionar idioma/ })).toBeInTheDocument();
  });

  it("com versões mostra o português (base) e o inglês com o que falta traduzir", () => {
    montar();
    const lista = screen.getByRole("tablist", { name: "Idiomas do template" });
    const abas = within(lista).getAllByRole("tab");
    expect(abas.map((a) => a.textContent?.trim())).toEqual(["PT (base)", "EN · 3 por traduzir"]);
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
    expect(abas[1]).toHaveAttribute("aria-selected", "false");
  });

  it("versão completa diz «completo»", () => {
    montar({ resumo: [{ codigo: "en", faltam: 0, completo: true, desatualizado: false }] });
    expect(screen.getByRole("tab", { name: /EN · completo/ })).toBeInTheDocument();
  });

  it("cada aba liga ao painel e só a ativa está na ordem do Tab (roving tabindex)", () => {
    montar({ idiomaAtivo: "en" });
    const [pt, en] = screen.getAllByRole("tab");
    expect(pt).toHaveAttribute("aria-controls", "painel-teste");
    expect(en).toHaveAttribute("aria-controls", "painel-teste");
    expect(pt).toHaveAttribute("tabindex", "-1");
    expect(en).toHaveAttribute("tabindex", "0");
    expect(en).toHaveAttribute("id", "aba-idioma-en");
  });

  it("clicar numa aba escolhe o idioma", () => {
    const props = montar();
    fireEvent.click(screen.getByRole("tab", { name: /EN/ }));
    expect(props.onEscolher).toHaveBeenCalledWith("en");
  });

  it("setas, Home e End mudam de aba e passam o foco", () => {
    const props = montar();
    const [pt, en] = screen.getAllByRole("tab");
    pt.focus();
    fireEvent.keyDown(pt, { key: "ArrowRight" });
    expect(props.onEscolher).toHaveBeenLastCalledWith("en");
    expect(en).toHaveFocus();
    fireEvent.keyDown(en, { key: "ArrowRight" });
    expect(props.onEscolher).toHaveBeenLastCalledWith("pt"); // dá a volta
    fireEvent.keyDown(pt, { key: "End" });
    expect(props.onEscolher).toHaveBeenLastCalledWith("en");
    fireEvent.keyDown(en, { key: "Home" });
    expect(props.onEscolher).toHaveBeenLastCalledWith("pt");
    fireEvent.keyDown(pt, { key: "ArrowLeft" });
    expect(props.onEscolher).toHaveBeenLastCalledWith("en"); // para trás também dá a volta
  });

  it("assinala as versões em que o português mudou, com texto (não só com cor)", () => {
    montar({ resumo: [{ ...EN_INCOMPLETO, desatualizado: true }] });
    expect(screen.getByRole("tab", { name: /O português mudou/ })).toBeInTheDocument();
  });

  it("as abas e o botão têm alvos de pelo menos 44px", () => {
    montar();
    for (const aba of screen.getAllByRole("tab")) expect(aba.className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: /Adicionar idioma/ }).className).toContain("min-h-11");
  });

  it("sem idiomas livres o botão de adicionar desaparece", () => {
    montar({ livres: [] });
    expect(screen.queryByRole("button", { name: /Adicionar idioma/ })).toBeNull();
  });

  describe("adicionar idioma", () => {
    it("abre um diálogo com os idiomas livres e começa com cópia do português", () => {
      const props = montar();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar idioma/ }));
      const dialogo = screen.getByRole("dialog", { name: "Adicionar idioma" });
      expect(within(dialogo).getAllByRole("radio")).toHaveLength(2);
      expect(within(dialogo).getByRole("radio", { name: "Español" })).toBeChecked();
      expect(within(dialogo).getByRole("radio", { name: "Français" })).not.toBeChecked();
      expect(within(dialogo).getByRole("checkbox", { name: "Começar com uma cópia do português" })).toBeChecked();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar" }));
      expect(props.onAdicionar).toHaveBeenCalledWith("es", true);
    });

    it("permite escolher outro idioma e começar em branco", () => {
      const props = montar();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar idioma/ }));
      const dialogo = screen.getByRole("dialog");
      fireEvent.click(within(dialogo).getByRole("radio", { name: "Français" }));
      fireEvent.click(within(dialogo).getByRole("checkbox"));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar" }));
      expect(props.onAdicionar).toHaveBeenCalledWith("fr", false);
    });

    it("cancelar não adiciona nada", () => {
      const props = montar();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar idioma/ }));
      const dialogo = screen.getByRole("dialog");
      fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
      expect(props.onAdicionar).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("BarraDeIdiomas — acessibilidade e foco", () => {
  it("cada aba tem nome acessível com o texto visível e o idioma por extenso", () => {
    montar();
    expect(screen.getByRole("tab", { name: "PT (base), Português" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "EN · 3 por traduzir, English" })).toBeInTheDocument();
  });

  it("o nome da aba inclui o aviso de que o português mudou", () => {
    montar({ resumo: [{ ...EN_INCOMPLETO, desatualizado: true }] });
    expect(screen.getByRole("tab", { name: "EN · 3 por traduzir, English · O português mudou" })).toBeInTheDocument();
  });

  it("o botão de adicionar idioma anuncia o diálogo que abre e liga-se a ele", () => {
    montar();
    const botao = screen.getByRole("button", { name: /Adicionar idioma/ });
    expect(botao).toHaveAttribute("aria-haspopup", "dialog");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).toHaveAttribute("aria-controls", "dialogo-adicionar-idioma");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toHaveAttribute("id", "dialogo-adicionar-idioma");
  });

  it("quando se pede foco, vai para a aba ativa", async () => {
    const props = { resumo: [EN_INCOMPLETO], idiomaAtivo: "en", livres: ["es"], idPainel: "p", onEscolher: vi.fn(), onAdicionar: vi.fn() };
    const { rerender } = render(<BarraDeIdiomas {...props} pedidoFoco={0} />);
    expect(screen.getByRole("tab", { name: /^EN/ })).not.toHaveFocus();
    rerender(<BarraDeIdiomas {...props} pedidoFoco={1} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: /^EN/ })).toHaveFocus());
  });

  it("sem abas (última versão removida), o foco vai para «Adicionar idioma»", async () => {
    const props = { resumo: [], idiomaAtivo: "pt", livres: ["en"], idPainel: "p", onEscolher: vi.fn(), onAdicionar: vi.fn() };
    const { rerender } = render(<BarraDeIdiomas {...props} pedidoFoco={0} />);
    rerender(<BarraDeIdiomas {...props} pedidoFoco={1} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Adicionar idioma/ })).toHaveFocus());
  });

  it("depois de confirmar o diálogo, o foco não volta ao botão: fica na aba nova", async () => {
    const onAdicionar = vi.fn();
    function Estado() {
      const [versoes, setVersoes] = useState<string[]>([]);
      const [pedido, setPedido] = useState(0);
      return (
        <BarraDeIdiomas
          resumo={versoes.map((codigo) => ({ codigo, faltam: 1, completo: false, desatualizado: false }))}
          idiomaAtivo={versoes[0] ?? "pt"}
          livres={["en"]}
          idPainel="p"
          pedidoFoco={pedido}
          onEscolher={vi.fn()}
          onAdicionar={(c, copiar) => { onAdicionar(c, copiar); setVersoes([c]); setPedido((n) => n + 1); }}
        />
      );
    }
    render(<Estado />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar idioma/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /^EN/ })).toHaveFocus());
    // e continua lá depois de o Radix acabar de fechar o diálogo
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("tab", { name: /^EN/ })).toHaveFocus();
  });

  it("cancelar o diálogo devolve o foco ao botão de adicionar", async () => {
    montar();
    const botao = screen.getByRole("button", { name: /Adicionar idioma/ });
    botao.focus();
    fireEvent.click(botao);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(botao).toHaveFocus());
  });
});

