import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { BarraDeIdiomasDoTemplate, type BarraDeIdiomasProps } from "../BarraDeIdiomasDoTemplate";
import { ID_PAINEL_IDIOMA, idDaAbaDeIdioma } from "../idsDeIdioma";

function propsBase(extra: Partial<BarraDeIdiomasProps> = {}): BarraDeIdiomasProps {
  return {
    base: "pt",
    ativo: "pt",
    versoes: ["en"],
    completudes: { en: { porTraduzir: 3, completo: false, desatualizado: false } },
    faltamAdicionar: ["es", "fr"],
    adicionando: false,
    onSelecionar: vi.fn(),
    onAbrirAdicionar: vi.fn(),
    onFecharAdicionar: vi.fn(),
    onAdicionar: vi.fn(),
    onRemover: vi.fn(),
    onMarcarRevisto: vi.fn(),
    ...extra,
  };
}

function montar(p: BarraDeIdiomasProps, lingua: "pt" | "en" = "pt") {
  localStorage.setItem("language", lingua);
  return render(<LanguageProvider><BarraDeIdiomasDoTemplate {...p} /></LanguageProvider>);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("sem versões e sem painel aberto", () => {
  it("mostra só o botão «Adicionar idioma» (sem separadores)", () => {
    const p = propsBase({ versoes: [], completudes: {} });
    montar(p);
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar idioma" }));
    expect(p.onAbrirAdicionar).toHaveBeenCalledTimes(1);
  });

  it("só leitura: não mostra o botão de adicionar", () => {
    const { container } = montar(propsBase({ versoes: [], completudes: {}, somenteLeitura: true }));
    expect(container.textContent).toBe("");
  });
});

describe("separadores de idioma", () => {
  it("[PT (base)] [EN · n por traduzir] com aria-selected no ativo e ligação ao painel", () => {
    montar(propsBase());
    const lista = screen.getByRole("tablist", { name: "Idiomas da minuta" });
    const abas = within(lista).getAllByRole("tab");
    expect(abas.map((a) => a.textContent?.replace(/\s+/g, " ").trim())).toEqual(["PT (base)", "EN · 3 por traduzir"]);
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
    expect(abas[1]).toHaveAttribute("aria-selected", "false");
    expect(abas[0]).toHaveAttribute("tabindex", "0");
    expect(abas[1]).toHaveAttribute("tabindex", "-1");
    expect(abas[0]).toHaveAttribute("id", idDaAbaDeIdioma("pt"));
    expect(abas[0]).toHaveAttribute("aria-controls", ID_PAINEL_IDIOMA);
  });

  it("uma versão completa mostra só o código", () => {
    montar(propsBase({ ativo: "en", completudes: { en: { porTraduzir: 0, completo: true, desatualizado: false } } }));
    const abas = screen.getAllByRole("tab");
    expect(abas[1].textContent?.trim()).toBe("EN");
    expect(abas[1]).toHaveAttribute("aria-selected", "true");
    expect(abas[0]).toHaveAttribute("aria-selected", "false");
  });

  it("em inglês os textos da barra mudam de língua", () => {
    montar(propsBase(), "en");
    expect(screen.getByRole("tablist", { name: "Template languages" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")[1].textContent).toContain("3 to translate");
    expect(screen.getByRole("button", { name: "Add language" })).toBeInTheDocument();
  });

  it("clicar escolhe o idioma; as setas, Home e End movem e escolhem", () => {
    const p = propsBase({ versoes: ["en", "es"], completudes: { en: { porTraduzir: 0, completo: true, desatualizado: false }, es: { porTraduzir: 1, completo: false, desatualizado: false } } });
    montar(p);
    const abas = screen.getAllByRole("tab");
    fireEvent.click(abas[1]);
    expect(p.onSelecionar).toHaveBeenLastCalledWith("en");
    fireEvent.keyDown(abas[0], { key: "ArrowRight" });
    expect(p.onSelecionar).toHaveBeenLastCalledWith("en");
    fireEvent.keyDown(abas[0], { key: "ArrowLeft" });
    expect(p.onSelecionar).toHaveBeenLastCalledWith("es");
    fireEvent.keyDown(abas[1], { key: "End" });
    expect(p.onSelecionar).toHaveBeenLastCalledWith("es");
    fireEvent.keyDown(abas[2], { key: "Home" });
    expect(p.onSelecionar).toHaveBeenLastCalledWith("pt");
    expect(document.activeElement).toBe(abas[0]);
  });

  it("todos os alvos têm pelo menos 44px (min-h-11)", () => {
    montar(propsBase());
    for (const el of [...screen.getAllByRole("tab"), screen.getByRole("button", { name: "Adicionar idioma" })]) {
      expect(el.className).toContain("min-h-11");
    }
  });

  it("uma versão desatualizada avisa também na aba (texto para leitores de ecrã)", () => {
    montar(propsBase({ completudes: { en: { porTraduzir: 0, completo: true, desatualizado: true } } }));
    expect(screen.getAllByRole("tab")[1].textContent).toContain("texto base mudou");
  });
});

describe("adicionar idioma", () => {
  it("o painel oferece só os idiomas que faltam, com a cópia do base marcada por omissão", () => {
    const p = propsBase({ adicionando: true });
    montar(p);
    const painel = screen.getByRole("group", { name: "Adicionar uma versão de idioma" });
    const radios = within(painel).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Español", "Français"]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    const copiar = within(painel).getByRole("checkbox", { name: "Começar com uma cópia do texto em Português" });
    expect(copiar).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar versão" }));
    expect(p.onAdicionar).toHaveBeenCalledWith("es", true);
  });

  it("escolher outro idioma e desmarcar a cópia", () => {
    const p = propsBase({ adicionando: true });
    montar(p);
    fireEvent.click(screen.getByRole("radio", { name: "Français" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Começar com uma cópia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar versão" }));
    expect(p.onAdicionar).toHaveBeenCalledWith("fr", false);
  });

  it("cancelar fecha o painel", () => {
    const p = propsBase({ adicionando: true });
    montar(p);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(p.onFecharAdicionar).toHaveBeenCalled();
  });

  it("com o painel aberto e sem versões, a barra mostra o base", () => {
    montar(propsBase({ versoes: [], completudes: {}, adicionando: true }));
    expect(screen.getAllByRole("tab").map((a) => a.textContent)).toEqual(["PT (base)"]);
  });

  it("sem idiomas por adicionar, diz-o e não oferece o botão de adicionar versão", () => {
    montar(propsBase({ adicionando: true, faltamAdicionar: [] }));
    expect(screen.getByText("Já foram adicionados todos os idiomas disponíveis.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar versão" })).toBeNull();
  });

  it("o botão «Adicionar idioma» indica se o painel está aberto", () => {
    const { rerender } = montar(propsBase());
    expect(screen.getByRole("button", { name: "Adicionar idioma" })).toHaveAttribute("aria-expanded", "false");
    rerender(<LanguageProvider><BarraDeIdiomasDoTemplate {...propsBase({ adicionando: true })} /></LanguageProvider>);
    expect(screen.getByRole("button", { name: "Adicionar idioma" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("remover versão", () => {
  it("só se oferece numa versão (não no base) e pede confirmação", () => {
    const p = propsBase({ ativo: "en" });
    montar(p);
    fireEvent.click(screen.getByRole("button", { name: "Remover esta versão" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(within(dialogo).getByText("Remover a versão English?")).toBeInTheDocument();
    expect(p.onRemover).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Remover" }));
    expect(p.onRemover).toHaveBeenCalledWith("en");
  });

  it("cancelar não remove", () => {
    const p = propsBase({ ativo: "en" });
    montar(p);
    fireEvent.click(screen.getByRole("button", { name: "Remover esta versão" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(p.onRemover).not.toHaveBeenCalled();
  });

  it("no idioma base não há botão de remover", () => {
    montar(propsBase());
    expect(screen.queryByRole("button", { name: "Remover esta versão" })).toBeNull();
  });
});

describe("o português mudou desde esta versão", () => {
  it("aviso só na versão ativa desatualizada, com «Marcar como revisto»", () => {
    const p = propsBase({ ativo: "en", completudes: { en: { porTraduzir: 0, completo: true, desatualizado: true } } });
    montar(p);
    const aviso = screen.getByRole("status");
    expect(aviso.textContent).toContain("O texto em Português mudou desde que esta versão foi escrita");
    fireEvent.click(within(aviso).getByRole("button", { name: "Marcar como revisto" }));
    expect(p.onMarcarRevisto).toHaveBeenCalledWith("en");
  });

  it("sem desatualização, ou no base, não há aviso", () => {
    montar(propsBase({ ativo: "en" }));
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    montar(propsBase({ ativo: "pt", completudes: { en: { porTraduzir: 0, completo: true, desatualizado: true } } }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
