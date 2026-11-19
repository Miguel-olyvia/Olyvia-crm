import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVersoesDaProposta } from "../useVersoesDaProposta";
import type { ConfigComTextos } from "../modeloVersoes";

function config(extra: Partial<ConfigComTextos> = {}): ConfigComTextos {
  return {
    footer_text: "Rodapé em português",
    terms_conditions: "Termos em português",
    accept_button_text: "Aceitar Proposta",
    sections: [{ id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } }],
    ...extra,
  };
}

describe("useVersoesDaProposta", () => {
  it("estado inicial: sem versões, idioma base, sem barra e a mesma referência do config", () => {
    const c = config();
    const { result } = renderHook(() => useVersoesDaProposta(c));
    expect(result.current.versoes).toEqual({});
    expect(result.current.idiomaAtivo).toBe("pt");
    expect(result.current.ehBase).toBe(true);
    expect(result.current.mostrarBarra).toBe(false);
    expect(result.current.resumo).toEqual([]);
    expect(result.current.configVisivel).toBe(c);
    expect(result.current.livres).toContain("en");
  });

  it("adicionar com cópia: cria a versão, passa a ela e mostra a barra", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.adicionar("en", true));
    expect(Object.keys(result.current.versoes)).toEqual(["en"]);
    expect(result.current.idiomaAtivo).toBe("en");
    expect(result.current.ehBase).toBe(false);
    expect(result.current.mostrarBarra).toBe(true);
    expect(result.current.livres).not.toContain("en");
    expect(result.current.resumo[0]).toMatchObject({ codigo: "en", completo: false });
    expect(result.current.campos.every((x) => x.estado === "igual")).toBe(true);
  });

  it("escrever textos e títulos de secção na versão ativa; a pré-visualização segue o idioma", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.adicionar("en", false));
    act(() => result.current.escreverTexto("footer_text", "English footer"));
    act(() => result.current.escreverSeccao("terms", "sectionLabel", "GENERAL TERMS"));
    expect(result.current.valorDoTexto("footer_text")).toBe("English footer");
    expect(result.current.valorDaSeccao("terms", "sectionLabel")).toBe("GENERAL TERMS");
    expect(result.current.configVisivel.footer_text).toBe("English footer");
    expect(result.current.configVisivel.terms_conditions).toBe("Termos em português");
    act(() => result.current.escolher("pt"));
    expect(result.current.ehBase).toBe(true);
    expect(result.current.configVisivel.footer_text).toBe("Rodapé em português");
  });

  it("escrever no idioma base não faz nada às versões", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.escreverTexto("footer_text", "x"));
    expect(result.current.versoes).toEqual({});
  });

  it("escolher um idioma que não existe fica no base", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.escolher("en"));
    expect(result.current.idiomaAtivo).toBe("pt");
  });

  it("remover a versão ativa volta ao português e esconde a barra", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.adicionar("en", false));
    act(() => result.current.remover("en"));
    expect(result.current.versoes).toEqual({});
    expect(result.current.idiomaAtivo).toBe("pt");
    expect(result.current.mostrarBarra).toBe(false);
  });

  it("carregar substitui as versões e volta ao base", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.adicionar("en", false));
    act(() => result.current.carregar({ es: { footer_text: "Pie" } }));
    expect(Object.keys(result.current.versoes)).toEqual(["es"]);
    expect(result.current.idiomaAtivo).toBe("pt");
    expect(result.current.mostrarBarra).toBe(true);
  });

  it("avisa quando o português mudou e deixa marcar como atualizada", () => {
    let c = config();
    const { result, rerender } = renderHook(() => useVersoesDaProposta(c));
    act(() => result.current.adicionar("en", false));
    expect(result.current.resumoAtivo?.desatualizado).toBe(false);
    c = config({ footer_text: "Rodapé novo" });
    rerender();
    expect(result.current.resumoAtivo?.desatualizado).toBe(true);
    act(() => result.current.marcarAtualizada());
    expect(result.current.resumoAtivo?.desatualizado).toBe(false);
  });

  it("pede foco para a barra depois de adicionar e depois de remover uma versão", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    expect(result.current.pedidoFoco).toBe(0);
    act(() => result.current.adicionar("en", false));
    expect(result.current.pedidoFoco).toBe(1);
    act(() => result.current.remover("en"));
    expect(result.current.pedidoFoco).toBe(2);
  });

  it("escolher, escrever e carregar não pedem foco", () => {
    const { result } = renderHook(() => useVersoesDaProposta(config()));
    act(() => result.current.adicionar("en", false));
    act(() => result.current.escolher("pt"));
    act(() => result.current.escolher("en"));
    act(() => result.current.escreverTexto("footer_text", "x"));
    act(() => result.current.carregar({}));
    expect(result.current.pedidoFoco).toBe(1);
  });
});

