// A Receção do Inventário igual ao mockup: o telemóvel (leitura por código, cesto, pendentes), a lista de guias, a folha da guia e o modo consulta.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import type { AbaInv } from "./ctxInv";
import { esquecerInventario, executar, lerInventario } from "./loja";
import { esquecerPerfil, mudarPerfil } from "./perfil";
import { procurarCodigo } from "./rececao";

function Casa() {
  const [aba, setAba] = useState<AbaInv>("guia");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const acoesCab = (): HTMLElement => document.querySelector(".ph-actions") as HTMLElement;
/** 16/10: o telemóvel da receção abre-se em "Ler códigos" (diálogo). */
const abrirLeitor = (): void => { if (!screen.queryByLabelText("Receção no telemóvel")) fireEvent.click(within(acoesCab()).getByRole("button", { name: "Ler códigos" })); };
const telemovel = (): HTMLElement => { abrirLeitor(); return screen.getByLabelText("Receção no telemóvel"); };
const guias = (): void => { fireEvent.click(screen.getByRole("tab", { name: /^Guias/ })); };
const ler = (code: string): void => {
  abrirLeitor();
  const campo = document.getElementById("rc-scan") as HTMLInputElement;
  fireEvent.change(campo, { target: { value: code } });
  fireEvent.keyDown(campo, { key: "Enter" });
};

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => { cleanup(); esquecerPerfil(); });

describe("Receção como no mockup", () => {
  it("separadores Por receber · Recebidas · Guias; o telemóvel abre em \"Ler códigos\" e as guias no seu separador", () => {
    render(<Casa />);
    expect(within(acoesCab()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ler códigos", "Nova guia"]);
    expect(within(screen.getByRole("tablist", { name: "Receção" })).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual(["Por receber", "Recebidas", "Guias"]);
    expect(screen.getByRole("tab", { name: /^Por receber/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("Receção no telemóvel")).toBeNull();
    expect(within(telemovel()).getByText("Cesto (0)")).toBeInTheDocument();
    expect(within(telemovel()).getByText("3 pendente(s) ▸")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Ler códigos" })).toBeInTheDocument();
    cleanup();
    render(<Casa />);
    guias();
    expect(screen.getByRole("button", { name: /^Todas\s*\d+/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("ler um código conhecido põe o produto no cesto", async () => {
    render(<Casa />);
    ler("5601234000028");
    await waitFor(() => expect(lerInventario().rc.basket.map((b) => b.sku)).toEqual(["PV-450"]));
    expect(within(telemovel()).getByText("Cesto (1)")).toBeInTheDocument();
    expect(within(telemovel()).getByRole("button", { name: /Confirmar receção \(1 un\)/ })).toBeInTheDocument();
  });

  it("um código desconhecido fica nas leituras não aceites e pode ser associado a um produto", async () => {
    render(<Casa />);
    ler("999");
    await waitFor(() => expect(lerInventario().rc.rejected[0].code).toBe("999"));
    expect(await screen.findAllByText("Código não reconhecido: 999")).not.toHaveLength(0);
    act(() => { executar((d) => { d.rc.openPend = true; }); });
    const botoes = await within(telemovel()).findAllByRole("button", { name: "Associar a um produto" });
    fireEvent.click(botoes[botoes.length - 1]);
    const dlg = await screen.findByRole("dialog", { name: /Associar código/ });
    fireEvent.change(dlg.querySelector("input[list=dl-prod]") as HTMLInputElement, { target: { value: "PV-450 — Painel fotovoltaico 450 W" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Associar e adicionar ao cesto" }));
    await waitFor(() => expect(procurarCodigo(lerInventario(), "7790001112223")).toEqual(["PV-450"]));
    expect(lerInventario().rc.basket.map((b) => b.sku)).toEqual(["PV-450"]);
  });

  it("um código que serve vários produtos pede para escolher", async () => {
    render(<Casa />);
    ler("CX-10");
    const dlg = await screen.findByRole("dialog", { name: /corresponde a vários produtos/ });
    fireEvent.click(within(dlg).getAllByRole("button").find((b) => /VT-15/.test(b.textContent ?? "")) as HTMLElement);
    await waitFor(() => expect(lerInventario().rc.basket[0].sku).toBe("VT-15"));
  });

  it("sem rede a leitura fica por processar", async () => {
    render(<Casa />);
    fireEvent.click(within(telemovel()).getByRole("checkbox", { name: "Simular falha de rede" }));
    ler("PV-450");
    await waitFor(() => expect(lerInventario().rc.queued.map((q) => q.code)).toEqual(["PV-450"]));
    expect(lerInventario().rc.basket).toHaveLength(0);
  });

  it("no perfil Só consulta a Receção fica em modo consulta", () => {
    mudarPerfil("consulta");
    render(<Casa />);
    expect(within(acoesCab()).getByRole("button", { name: "Nova guia" })).toBeDisabled();
    expect(within(telemovel()).getByText("Modo consulta")).toBeInTheDocument();
    expect(document.getElementById("rc-scan")).toBeDisabled();
    expect(within(telemovel()).getByRole("button", { name: /Confirmar receção/ })).toBeDisabled();
  });

  it("a folha da guia tem os botões do mockup e desativa-os em modo consulta", async () => {
    render(<Casa />);
    guias();
    fireEvent.click(screen.getByRole("row", { name: /^Abrir a guia GR 2026\/311/ }));
    const folha = await screen.findByRole("dialog", { name: "GR 2026/311" });
    const nomes = within(folha).getAllByRole("button").map((b) => b.textContent);
    expect(nomes).toEqual(expect.arrayContaining(["PDF prova de receção", "Associar código a produto", "Editar", "Cancelar guia", "Fechar", "Usar esta guia"]));
    cleanup();
    mudarPerfil("consulta");
    render(<Casa />);
    guias();
    fireEvent.click(screen.getByRole("row", { name: /^Abrir a guia GR 2026\/311/ }));
    const f2 = await screen.findByRole("dialog", { name: "GR 2026/311" });
    expect(within(f2).getByRole("button", { name: "Editar" })).toBeDisabled();
    expect(within(f2).getByRole("button", { name: "Usar esta guia" })).toHaveAttribute("title", expect.stringContaining("inventory.receive"));
  });

  it("uma guia nova fica escolhida na receção", async () => {
    render(<Casa />);
    fireEvent.click(within(acoesCab()).getByRole("button", { name: "Nova guia" }));
    const dlg = await screen.findByRole("dialog", { name: "Nova guia do fornecedor" });
    fireEvent.change(within(dlg).getByRole("textbox", { name: /Nº da guia/ }), { target: { value: "GR 2026/400" } });
    fireEvent.change(within(dlg).getByRole("combobox", { name: /Fornecedor/ }), { target: { value: "zeta" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar guia" }));
    await waitFor(() => expect(lerInventario().rc.guia).toBe("GR 2026/400"));
  });
});
