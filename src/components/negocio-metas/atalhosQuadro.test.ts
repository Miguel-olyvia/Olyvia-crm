import { describe, expect, it } from "vitest";
import { acaoDaTecla, proximoFoco, type AlvoTecla } from "./atalhosQuadro";

const corpo: AlvoTecla = { tag: "BODY" };

describe("acaoDaTecla", () => {
  it("mapeia as teclas do Quadro", () => {
    expect(acaoDaTecla({ key: "ArrowDown" }, corpo)).toBe("seguinte");
    expect(acaoDaTecla({ key: "j" }, corpo)).toBe("seguinte");
    expect(acaoDaTecla({ key: "ArrowUp" }, corpo)).toBe("anterior");
    expect(acaoDaTecla({ key: "k" }, corpo)).toBe("anterior");
    expect(acaoDaTecla({ key: "ArrowLeft" }, corpo)).toBe("esquerda");
    expect(acaoDaTecla({ key: "ArrowRight" }, corpo)).toBe("direita");
    expect(acaoDaTecla({ key: "/" }, corpo)).toBe("pesquisa");
    expect(acaoDaTecla({ key: "?" }, corpo)).toBe("ajuda");
    expect(acaoDaTecla({ key: "x" }, corpo)).toBeNull();
  });
  it("não dispara em campos, selects, separadores nem diálogos", () => {
    expect(acaoDaTecla({ key: "/" }, { tag: "INPUT", tipo: "search" })).toBeNull();
    expect(acaoDaTecla({ key: "j" }, { tag: "TEXTAREA" })).toBeNull();
    expect(acaoDaTecla({ key: "ArrowDown" }, { tag: "SELECT" })).toBeNull();
    expect(acaoDaTecla({ key: "ArrowRight" }, { tag: "BUTTON", papel: "tab" })).toBeNull();
    expect(acaoDaTecla({ key: "ArrowDown" }, { tag: "BUTTON", bloqueado: true })).toBeNull();
  });
  it("não dispara com Ctrl, Cmd ou Alt", () => {
    expect(acaoDaTecla({ key: "/", ctrl: true }, corpo)).toBeNull();
    expect(acaoDaTecla({ key: "j", meta: true }, corpo)).toBeNull();
    expect(acaoDaTecla({ key: "ArrowDown", alt: true }, corpo)).toBeNull();
  });
});

describe("proximoFoco", () => {
  // três colunas: 2 cartões, 0 cartões, 1 cartão
  const itens = [
    { coluna: 0, pos: 0 }, { coluna: 0, pos: 1 }, { coluna: 2, pos: 0 },
  ];
  it("sem foco, desce para o primeiro e sobe para o último", () => {
    expect(proximoFoco(itens, -1, "seguinte")).toBe(0);
    expect(proximoFoco(itens, -1, "anterior")).toBe(2);
    expect(proximoFoco(itens, -1, "direita")).toBe(0);
  });
  it("desce e sobe dentro da coluna, sem dar a volta", () => {
    expect(proximoFoco(itens, 0, "seguinte")).toBe(1);
    expect(proximoFoco(itens, 1, "seguinte")).toBe(1);
    expect(proximoFoco(itens, 1, "anterior")).toBe(0);
    expect(proximoFoco(itens, 0, "anterior")).toBe(0);
  });
  it("salta as colunas vazias ao ir para os lados e mantém a posição o mais possível", () => {
    expect(proximoFoco(itens, 1, "direita")).toBe(2);
    expect(proximoFoco(itens, 2, "esquerda")).toBe(0);
    expect(proximoFoco(itens, 2, "direita")).toBe(2);
    expect(proximoFoco(itens, 0, "esquerda")).toBe(0);
  });
  it("sem itens não há para onde ir", () => {
    expect(proximoFoco([], -1, "seguinte")).toBe(-1);
  });
});
