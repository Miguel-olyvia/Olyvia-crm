import { describe, expect, it } from "vitest";
import { acaoDaTecla, emCampo, indiceSeguinte, type Alvo } from "./funcAtalhos";
import { alvoDe } from "./useAtalhos";

const botao: Alvo = { tag: "BUTTON" }, linha: Alvo = { tag: "BUTTON", linha: true }, corpo: Alvo = { tag: "BODY" };
const t = (key: string) => ({ key });

describe("atalhos · na lista (Hoje, Lista e Quadro)", () => {
  it("setas e j/k movem entre linhas", () => {
    expect(acaoDaTecla(t("ArrowDown"), botao, "lista")).toBe("seguinte");
    expect(acaoDaTecla(t("j"), corpo, "lista")).toBe("seguinte");
    expect(acaoDaTecla(t("ArrowUp"), linha, "lista")).toBe("anterior");
    expect(acaoDaTecla(t("k"), linha, "lista")).toBe("anterior");
  });
  it("Enter só abre numa linha", () => {
    expect(acaoDaTecla(t("Enter"), linha, "lista")).toBe("abrir");
    expect(acaoDaTecla(t("Enter"), botao, "lista")).toBeNull();
  });
  it("'/' vai para a pesquisa, '?' abre a ajuda e Esc fecha ou limpa", () => {
    expect(acaoDaTecla(t("/"), linha, "lista")).toBe("pesquisa");
    expect(acaoDaTecla(t("?"), corpo, "lista")).toBe("ajuda");
    expect(acaoDaTecla(t("Escape"), botao, "lista")).toBe("esc");
  });
  it("as setas laterais não fazem nada na lista; as outras teclas também não", () => {
    expect(acaoDaTecla(t("ArrowLeft"), linha, "lista")).toBeNull();
    expect(acaoDaTecla(t("a"), linha, "lista")).toBeNull();
  });
  it("com Ctrl, Cmd ou Alt nada dispara", () => {
    expect(acaoDaTecla({ key: "j", ctrl: true }, linha, "lista")).toBeNull();
    expect(acaoDaTecla({ key: "/", meta: true }, linha, "lista")).toBeNull();
    expect(acaoDaTecla({ key: "ArrowDown", alt: true }, linha, "lista")).toBeNull();
  });
});

describe("atalhos · no painel", () => {
  it("setas laterais e [ ] passam à pessoa anterior e seguinte", () => {
    expect(acaoDaTecla(t("ArrowLeft"), botao, "painel")).toBe("pessoaAnterior");
    expect(acaoDaTecla(t("["), corpo, "painel")).toBe("pessoaAnterior");
    expect(acaoDaTecla(t("ArrowRight"), botao, "painel")).toBe("pessoaSeguinte");
    expect(acaoDaTecla(t("]"), botao, "painel")).toBe("pessoaSeguinte");
    expect(acaoDaTecla(t("j"), botao, "painel")).toBeNull();
  });
});

describe("atalhos · nunca num campo", () => {
  const campos: Alvo[] = [
    { tag: "INPUT", tipo: "text" }, { tag: "INPUT", tipo: "search" }, { tag: "INPUT" }, { tag: "TEXTAREA" }, { tag: "SELECT" },
    { tag: "DIV", editavel: true }, { tag: "BUTTON", papel: "tab" }, { tag: "BUTTON", bloqueado: true },
  ];
  it.each(campos)("nenhuma tecla dispara em %o", (a) => {
    for (const k of ["ArrowDown", "j", "k", "/", "?", "Escape", "Enter"]) expect(acaoDaTecla(t(k), a, "lista")).toBeNull();
    for (const k of ["ArrowLeft", "ArrowRight", "[", "]"]) expect(acaoDaTecla(t(k), a, "painel")).toBeNull();
  });
  it("uma caixa de escolha não é um campo de escrever", () => {
    expect(emCampo({ tag: "INPUT", tipo: "checkbox" })).toBe(false);
    expect(acaoDaTecla(t("j"), { tag: "INPUT", tipo: "checkbox" }, "lista")).toBe("seguinte");
  });
  it("radio e range usam as setas: contam como campo; os itens de menu com escolha também", () => {
    expect(emCampo({ tag: "INPUT", tipo: "radio" })).toBe(true);
    expect(emCampo({ tag: "INPUT", tipo: "range" })).toBe(true);
    expect(emCampo({ tag: "DIV", papel: "menuitemcheckbox" })).toBe(true);
    expect(emCampo({ tag: "DIV", papel: "menuitemradio" })).toBe(true);
    expect(emCampo({ tag: "INPUT", tipo: "button" })).toBe(false);
  });
  it.each(["dialog", "menu", "listbox", "alertdialog"])("alvoDe: dentro de [role=%s] as teclas são de quem lá está", (papel) => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<div role="${papel}"><button id="dentro">x</button></div><button id="fora">y</button>`;
    document.body.appendChild(raiz);
    expect(emCampo(alvoDe(raiz.querySelector("#dentro")))).toBe(true);
    expect(emCampo(alvoDe(raiz.querySelector("#fora")))).toBe(false);
    raiz.remove();
  });
  it("alvoDe: o painel da ficha (data-ficha-painel) continua a aceitar as setas, mas um popover lá dentro não", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = '<div role="dialog" data-ficha-painel><button id="painel">p</button><div role="menu"><button id="menu">m</button></div></div>';
    document.body.appendChild(raiz);
    expect(emCampo(alvoDe(raiz.querySelector("#painel")))).toBe(false);
    expect(acaoDaTecla(t("ArrowRight"), alvoDe(raiz.querySelector("#painel")), "painel")).toBe("pessoaSeguinte");
    expect(emCampo(alvoDe(raiz.querySelector("#menu")))).toBe(true);
    raiz.remove();
  });
  it("alvoDe lê o foco do DOM (input, separador, popover sem atalhos e linha)", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = '<input type="search"><button role="tab">T</button><div data-func-sem-atalhos><button id="dentro">x</button></div><button data-linha-func>L</button>';
    document.body.appendChild(raiz);
    expect(emCampo(alvoDe(raiz.querySelector("input")))).toBe(true);
    expect(emCampo(alvoDe(raiz.querySelector('[role="tab"]')))).toBe(true);
    expect(emCampo(alvoDe(raiz.querySelector("#dentro")))).toBe(true);
    expect(alvoDe(raiz.querySelector("[data-linha-func]")).linha).toBe(true);
    expect(alvoDe(null)).toEqual({ tag: "BODY" });
    raiz.remove();
  });
});

describe("indiceSeguinte", () => {
  it("anda sem dar a volta; sem foco começa no início (ou no fim, a subir)", () => {
    expect(indiceSeguinte(-1, 5, 1)).toBe(0);
    expect(indiceSeguinte(-1, 5, -1)).toBe(4);
    expect(indiceSeguinte(2, 5, 1)).toBe(3);
    expect(indiceSeguinte(4, 5, 1)).toBe(4);
    expect(indiceSeguinte(0, 5, -1)).toBe(0);
    expect(indiceSeguinte(0, 0, 1)).toBe(-1);
  });
});
