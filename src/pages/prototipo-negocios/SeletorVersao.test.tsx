// O seletor de versão no protótipo inteiro: Atual, V2 e V2 funcional, a persistência (compatível com o valor antigo), a vista equivalente
// e "Repor a demonstração" (apaga os registos do dia a dia, mas não a versão escolhida).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrototipoNegocios from "./PrototipoNegocios";
import { esquecerPessoas } from "./PessoasSimples";
import { esquecerPessoasFunc } from "./PessoasFunc";
import { esquecerNegociosFunc } from "./NegociosFunc";
import { esquecerDiaADia, lerRegistos, registar } from "./diaADia";

const CHAVE = "olyvia-prototipo-v2";
const app = (guardado: string | null): void => {
  localStorage.clear();
  if (guardado !== null) localStorage.setItem(CHAVE, guardado);
  localStorage.setItem("olyvia-prototipo-v1-proposta", "0"); // estes testes comparam as versões com o V1 de antes (Leads e Clientes); a proposta de 16/10 testa-se em PessoasV1.test.tsx
  render(<PrototipoNegocios />);
};
const seletor = (): HTMLElement => screen.getAllByRole("group", { name: "Versão" })[0];
const versao = (nome: string): HTMLElement => within(seletor()).getByRole("button", { name: nome });
const menu = (nome: string): void => { fireEvent.click(within(screen.getAllByRole("navigation", { name: "Menu" })[0]).getByRole("button", { name: nome })); };
const titulo = (): string => screen.getAllByRole("heading", { level: 1 })[0].textContent ?? "";

beforeEach(() => { esquecerPessoas(); esquecerPessoasFunc(); esquecerNegociosFunc(); esquecerDiaADia(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Seletor de versão", () => {
  it("três botões com aria-pressed e a versão ativa em texto; o interruptor antigo já não existe", () => {
    app(null);
    expect(within(seletor()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Atual", "V2", "V2 funcional"]);
    expect(versao("Atual")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("A comparar: Atual")[0]).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Ver a V2/ })).toBeNull();
  });
  it("lê o valor antigo do interruptor: '1' é a V2 (Pessoas no menu, Negócios por documento)", () => {
    app("1");
    expect(versao("V2")).toHaveAttribute("aria-pressed", "true");
    expect(titulo()).toBe("Negócios");
    expect(screen.getByRole("tab", { name: "Quadro" })).toBeInTheDocument();
    expect(within(screen.getAllByRole("navigation", { name: "Menu" })[0]).getByRole("button", { name: "Pessoas" })).toBeInTheDocument();
  });
  it("'0' é a Atual: Leads e Clientes no menu e a lista de Negócios de sempre", () => {
    app("0");
    expect(versao("Atual")).toHaveAttribute("aria-pressed", "true");
    const nav = within(screen.getAllByRole("navigation", { name: "Menu" })[0]);
    expect(nav.getByRole("button", { name: "Leads" })).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Quadro" })).toBeNull();
  });
  it("escolher V2 funcional grava 'funcional' e troca Negócios e Pessoas pelas versões do dia a dia", () => {
    app("1");
    fireEvent.click(versao("V2 funcional"));
    expect(localStorage.getItem(CHAVE)).toBe("funcional");
    expect(screen.getAllByText("A comparar: V2 funcional")[0]).toBeInTheDocument();
    expect(titulo()).toBe("Negócios · dia a dia");
    menu("Pessoas");
    expect(titulo()).toBe("Pessoas · dia a dia");
  });
  it("mudar de versão com Pessoas aberta mantém a vista equivalente (V2 funcional para V2 fica em Pessoas; para Atual passa a Leads)", () => {
    app("funcional");
    menu("Pessoas");
    fireEvent.click(versao("V2"));
    expect(localStorage.getItem(CHAVE)).toBe("1");
    expect(titulo()).toBe("Pessoas");
    fireEvent.click(versao("Atual"));
    expect(localStorage.getItem(CHAVE)).toBe("0");
    expect(titulo()).toBe("Leads");
    fireEvent.click(versao("V2 funcional"));
    expect(titulo()).toBe("Pessoas · dia a dia");
  });
  it("Repor a demonstração apaga os registos do dia a dia mas não a versão escolhida", () => {
    app("funcional");
    registar({ nome: "Ana Martins", tipo: "nota", texto: "Teste" });
    expect(lerRegistos()).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Definições" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Repor a demonstração" }));
    expect(lerRegistos()).toHaveLength(0);
    expect(localStorage.getItem(CHAVE)).toBe("funcional");
    expect(versao("V2 funcional")).toHaveAttribute("aria-pressed", "true");
  });
});
