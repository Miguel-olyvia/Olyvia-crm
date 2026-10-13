import { describe, expect, it } from "vitest";
import { teclaNavegacao, vizinhas } from "./navegacaoFicha";

describe("vizinhas", () => {
  const ids = ["a", "b", "c"];
  it("no meio tem anterior e seguinte e a posição a partir de 1", () => {
    expect(vizinhas(ids, "b")).toEqual({ anterior: "a", seguinte: "c", posicao: 2, total: 3 });
  });
  it("nos extremos falta um dos lados (não dá a volta)", () => {
    expect(vizinhas(ids, "a")).toEqual({ anterior: null, seguinte: "b", posicao: 1, total: 3 });
    expect(vizinhas(ids, "c")).toEqual({ anterior: "b", seguinte: null, posicao: 3, total: 3 });
  });
  it("fora da lista: posição 0 e os dois botões desativados", () => {
    expect(vizinhas(ids, "x")).toEqual({ anterior: null, seguinte: null, posicao: 0, total: 3 });
    expect(vizinhas([], "x")).toEqual({ anterior: null, seguinte: null, posicao: 0, total: 0 });
  });
  it("uma só pessoa na lista", () => {
    expect(vizinhas(["a"], "a")).toEqual({ anterior: null, seguinte: null, posicao: 1, total: 1 });
  });
});

describe("teclaNavegacao", () => {
  const corpo = { tag: "DIV" };
  it("[ e ] navegam", () => {
    expect(teclaNavegacao({ key: "[" }, corpo)).toBe("anterior");
    expect(teclaNavegacao({ key: "]" }, corpo)).toBe("seguinte");
    expect(teclaNavegacao({ key: "j" }, corpo)).toBeNull();
  });
  it("ignora campos de texto, contenteditable, menus e listas", () => {
    expect(teclaNavegacao({ key: "]" }, { tag: "INPUT", tipo: "text" })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "TEXTAREA" })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "DIV", editavel: true })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "DIV", papel: "menuitem" })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "UL", papel: "listbox" })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "DIV", bloqueado: true })).toBeNull();
  });
  it("ignora modificadores e repetição", () => {
    expect(teclaNavegacao({ key: "]", ctrl: true }, corpo)).toBeNull();
    expect(teclaNavegacao({ key: "]", meta: true }, corpo)).toBeNull();
    expect(teclaNavegacao({ key: "]", alt: true }, corpo)).toBeNull();
    expect(teclaNavegacao({ key: "]", repeat: true }, corpo)).toBeNull();
  });
  it("AltGr (Ctrl mais Alt no Windows, ou AltGraph) escreve [ e ] em teclado português e navega", () => {
    expect(teclaNavegacao({ key: "[", ctrl: true, alt: true }, corpo)).toBe("anterior");
    expect(teclaNavegacao({ key: "]", ctrl: true, alt: true }, corpo)).toBe("seguinte");
    expect(teclaNavegacao({ key: "]", altGraph: true }, corpo)).toBe("seguinte");
  });
  it("AltGr não passa em campos de texto, com Cmd ou repetido", () => {
    expect(teclaNavegacao({ key: "[", ctrl: true, alt: true }, { tag: "INPUT", tipo: "text" })).toBeNull();
    expect(teclaNavegacao({ key: "[", ctrl: true, alt: true, meta: true }, corpo)).toBeNull();
    expect(teclaNavegacao({ key: "[", ctrl: true, alt: true, repeat: true }, corpo)).toBeNull();
  });
});
