// O menu lateral, o topo, o Hoje e o ecrã "Mockup · cobertura" do Inventário contra o mockup (renderSidebar, renderTop, gSearch, scrHoje, scrCov).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import { COBERTURA, PROBLEMAS, REGRAS } from "./coberturaDados";
import type { AbaInv } from "./ctxInv";
import { esquecerInventario } from "./loja";
import { esquecerPerfil, mudarPerfil } from "./perfil";

function Casa() {
  const [aba, setAba] = useState<AbaInv>("hoje");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const menu = (): HTMLElement => screen.getByTestId("menu-inventario");
const painel = (): HTMLElement => document.getElementById("inv-painel") as HTMLElement;

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => cleanup());

describe("menu lateral", () => {
  it("tem a secção MOCKUP com o item Mockup · cobertura, por baixo do Inventário", () => {
    render(<Casa />);
    const seccoes = Array.from(menu().querySelectorAll(".sb-sec")).map((e) => e.textContent);
    expect(seccoes).toEqual(["Inventário", "Mockup"]);
    fireEvent.click(within(menu()).getByRole("button", { name: "Mockup · cobertura" }));
    expect(within(painel()).getByRole("heading", { level: 1, name: "Mockup · cobertura" })).toBeTruthy();
    expect(painel().querySelector(".crumbs")?.textContent).toBe("Mockup");
    expect(within(menu()).getByRole("button", { name: "Mockup · cobertura" }).getAttribute("aria-current")).toBe("page");
  });

  it("os grupos são botões expandidos e o rodapé traz o perfil e a fonte", () => {
    render(<Casa />);
    const compras = within(menu()).getByRole("button", { name: /^Compras/ });
    expect(compras.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(compras);
    expect(painel().querySelector(".crumbs")?.textContent).toBe("Inventário › Compras");
    expect(menu().querySelector(".sb-foot .src")?.textContent).toBe("has_permission() · anew_role_permissions");
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

describe("Mockup · cobertura", () => {
  it("mostra os números e filtra pela pesquisa", () => {
    render(<Casa />);
    fireEvent.click(within(menu()).getByRole("button", { name: "Mockup · cobertura" }));
    const kpis = Array.from(painel().querySelectorAll(".kpi .kv")).map((e) => e.textContent);
    expect(kpis).toEqual([String(COBERTURA.length), String(COBERTURA.filter((r) => r[5]).length), "0", "7 → 2"]);
    expect(painel().querySelectorAll("tr.grp").length).toBeGreaterThan(3);
    expect(painel().querySelectorAll("ol li")).toHaveLength(REGRAS.length);
    expect(painel().textContent).toContain(PROBLEMAS[0][0]);
    fireEvent.change(screen.getByLabelText("Filtrar cobertura"), { target: { value: "pesquisa global" } });
    expect(painel().querySelectorAll("tbody tr:not(.grp)").length).toBeGreaterThan(0);
    expect(painel().querySelectorAll("tbody tr:not(.grp)").length).toBeLessThan(COBERTURA.length);
  });

  it("uma funcionalidade leva ao ecrã indicado", () => {
    render(<Casa />);
    fireEvent.click(within(menu()).getByRole("button", { name: "Mockup · cobertura" }));
    fireEvent.click(within(painel()).getByRole("button", { name: "Compras › Fornecedores" }));
    expect(within(painel()).getByRole("heading", { level: 1, name: "Fornecedores" })).toBeTruthy();
  });
});
