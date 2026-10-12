// O menu lateral, o topo, e o Hoje do Inventário contra o mockup (renderSidebar, renderTop, gSearch, scrHoje).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import PerfilSimulado from "./PerfilSimulado";
import type { AbaInv } from "./ctxInv";
import { esquecerInventario } from "./loja";
import { esquecerPerfil, mudarPerfil } from "./perfil";

function Casa() {
  const [aba, setAba] = useState<AbaInv>("hoje");
  return <><MenuInventario aba={aba} aoIr={setAba} /><PerfilSimulado /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const menu = (): HTMLElement => screen.getByTestId("menu-inventario");
const painel = (): HTMLElement => document.getElementById("inv-painel") as HTMLElement;

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => cleanup());

describe("menu lateral", () => {
  it("não tem o ecrã de cobertura: o último subitem é Armazéns e não há secção própria", () => {
    render(<Casa />);
    expect(menu().querySelectorAll(".sb-sec")).toHaveLength(0);
    const botoes = within(menu()).getAllByRole("button");
    expect(botoes[botoes.length - 1].textContent).toBe("Armazéns");
    expect(menu().textContent).not.toMatch(/cobertura/i);
  });

  it("o item Inventário está expandido dentro do inventário, o grupo leva ao primeiro ecrã e o seletor de perfil traz a fonte", () => {
    render(<Casa />);
    expect(within(menu()).getByRole("button", { name: "Inventário" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(menu()).getByRole("button", { name: /^Compras/ }));
    expect(painel().querySelector(".crumbs")?.textContent).toBe("Inventário › Compras");
    expect(screen.getByTestId("perfil-simulado").querySelector(".src")?.textContent).toBe("has_permission() · anew_role_permissions");
  });
});

describe("topo e pesquisa global", () => {
  it("Esc limpa, mostra no máximo 10 resultados e a mensagem de vazio", () => {
    render(<Casa />);
    const gs = screen.getByLabelText("Pesquisa global") as HTMLInputElement;
    fireEvent.change(gs, { target: { value: "zzzzqq" } });
    expect(screen.getByText("Sem resultados para “zzzzqq”.")).toBeTruthy();
    fireEvent.keyDown(gs, { key: "Escape" });
    expect(gs.value).toBe("");
    expect(document.querySelector(".gres")).toBeNull();
    fireEvent.change(gs, { target: { value: "a" } });
    expect(document.querySelectorAll(".gres button").length).toBeLessThanOrEqual(10);
    expect(document.querySelector(".gres .src")).not.toBeNull();
  });

  it("o botão de repor leva os dois textos do mockup", () => {
    render(<Casa />);
    const b = screen.getByTitle("Apaga as alterações feitas no mockup");
    expect(b.querySelector(".hide-sm")?.textContent).toBe("Repor dados de demonstração");
    expect(b.querySelector(".sr")?.textContent).toBe("Repor dados");
  });
});

describe("Hoje", () => {
  it("o valor em stock fica em — sem purchase_orders.view_prices", () => {
    render(<Casa />);
    const valor = (): string => within(painel()).getByText("Valor em stock (custo médio)").closest("button")!.querySelector("b")!.textContent ?? "";
    expect(valor()).not.toBe("—");
    mudarPerfil("armazem");
    cleanup();
    render(<Casa />);
    expect(valor()).toBe("—");
  });

  it("tem as 11 cartas da fila e as três ações do cabeçalho", () => {
    render(<Casa />);
    expect(painel().querySelectorAll(".queue .qcard")).toHaveLength(11);
    const acoes = painel().querySelector(".ph-actions")!;
    expect(Array.from(acoes.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Registar movimento", "Receber", "Simular venda assinada"]);
  });
});
