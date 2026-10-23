import { describe, expect, it } from "vitest";
import { teclaNavegacao, vizinhas } from "./navegacao";

const IDS = ["a", "b", "c"];
const CORPO = { tag: "BODY" };

describe("vizinhas", () => {
  it("dá a anterior, a seguinte e a posição", () => {
    expect(vizinhas(IDS, "b")).toEqual({ anterior: "a", seguinte: "c", posicao: 2, total: 3 });
  });
  it("não dá a volta nas pontas", () => {
    expect(vizinhas(IDS, "a").anterior).toBeNull();
    expect(vizinhas(IDS, "c").seguinte).toBeNull();
  });
  it("fora da lista não há vizinhas e a posição é 0", () => {
    expect(vizinhas(IDS, "z")).toEqual({ anterior: null, seguinte: null, posicao: 0, total: 3 });
    expect(vizinhas([], "a").total).toBe(0);
  });
});

describe("teclaNavegacao", () => {
  it("[ e ] escolhem anterior e seguinte", () => {
    expect(teclaNavegacao({ key: "[" }, CORPO)).toBe("anterior");
    expect(teclaNavegacao({ key: "]" }, CORPO)).toBe("seguinte");
    expect(teclaNavegacao({ key: "x" }, CORPO)).toBeNull();
  });
  it("não dispara a escrever, num menu ou numa lista", () => {
    expect(teclaNavegacao({ key: "[" }, { tag: "INPUT" })).toBeNull();
    expect(teclaNavegacao({ key: "[" }, { tag: "DIV", editavel: true })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "DIV", papel: "option" })).toBeNull();
    expect(teclaNavegacao({ key: "]" }, { tag: "DIV", bloqueado: true })).toBeNull();
  });
  it("ignora Ctrl, Alt ou Cmd sozinhos e teclas repetidas, mas aceita AltGr", () => {
    expect(teclaNavegacao({ key: "[", ctrl: true }, CORPO)).toBeNull();
    expect(teclaNavegacao({ key: "[", alt: true }, CORPO)).toBeNull();
    expect(teclaNavegacao({ key: "[", meta: true }, CORPO)).toBeNull();
    expect(teclaNavegacao({ key: "[", repeat: true }, CORPO)).toBeNull();
    expect(teclaNavegacao({ key: "[", ctrl: true, alt: true }, CORPO)).toBe("anterior");
    expect(teclaNavegacao({ key: "]", altGraph: true }, CORPO)).toBe("seguinte");
  });
});
