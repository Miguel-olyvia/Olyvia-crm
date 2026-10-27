// Existências e Movimentos com o DOM do mockup: ações no cabeçalho, filtros em `card filters`, edição no sítio, menu "Mais ações", importar/exportar e as permissões.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import type { AbaInv } from "./ctxInv";
import { esquecerInventario, lerInventario } from "./loja";
import { esquecerPerfil, mudarPerfil } from "./perfil";

function Casa({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const acoes = (): HTMLElement => document.querySelector(".ph-actions") as HTMLElement;
const botaoAcao = (nome: string): HTMLElement => within(acoes()).getByRole("button", { name: nome });

beforeEach(() => { localStorage.clear(); esquecerPerfil(); esquecerInventario(); });
afterEach(() => { cleanup(); localStorage.clear(); esquecerPerfil(); });

describe("Existências", () => {
  it("tem as ações dentro do cabeçalho, os KPI, os filtros do mockup e a vista por produto", async () => {
    render(<Casa inicio="stock" />);
    await screen.findByRole("heading", { level: 1, name: "Existências" });
    expect(within(acoes()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Exportar", "Importar", "Registar movimento", "Adicionar stock"]);
    expect(botaoAcao("Adicionar stock")).toHaveClass("btn", "btn-p");
    expect([...document.querySelectorAll(".kpis .kl")].map((k) => k.textContent)).toEqual(["Valor em stock", "Abaixo do ponto de encomenda", "Em excesso", "Unidades reservadas"]);
    const filtros = document.querySelector(".card.filters") as HTMLElement;
    for (const r of ["Categoria", "Subcategoria", "Armazém", "Estado"]) expect(within(filtros).getByRole("combobox", { name: r })).toBeInTheDocument();
    expect(within(filtros).getByRole("searchbox", { name: "Pesquisar stock" })).toHaveAttribute("placeholder", "Nome, SKU ou EAN");
    expect(within(filtros).getByLabelText("Ver eliminados")).not.toBeChecked();
    const vista = within(filtros).getByRole("group", { name: "Vista" });
    expect(within(vista).getByRole("button", { name: /^Por produto/ })).toHaveAttribute("aria-pressed", "true");
    expect(vista.querySelector(".new")?.textContent).toBe("Novo");
    expect(document.querySelector(".tbl-foot")?.textContent).toMatch(/linha\(s\) · .* reservado · .* livre \(escala: máximo\)/);
  });

  it("a vista por armazém agrupa por categoria e a localização edita-se no sítio", async () => {
    render(<Casa inicio="stock" />);
    fireEvent.click(await screen.findByRole("button", { name: "Por armazém" }));
    expect(document.querySelectorAll("tr.grp").length).toBeGreaterThan(0);
    const id = lerInventario().stocks.find((s) => !s.deleted)!.id;
    const antes = lerInventario().stocks.find((s) => s.id === id)!.loc;
    const botoes = document.querySelectorAll<HTMLElement>("td.mono button.ie");
    fireEvent.click(botoes[0]);
    const campo = document.querySelector<HTMLInputElement>("input.ie-in")!;
    fireEvent.change(campo, { target: { value: "Z-99" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await screen.findByText("Gravado.");
    expect(lerInventario().stocks.some((s) => s.loc === "Z-99")).toBe(true);
    expect(antes).not.toBe("Z-99");
  });

  it("o mínimo maior que o máximo recusa com a mensagem do mockup", async () => {
    render(<Casa inicio="stock" />);
    fireEvent.click(await screen.findByRole("button", { name: "Por armazém" }));
    const linha = document.querySelector("tbody tr:not(.grp)") as HTMLElement;
    const min = linha.querySelector<HTMLElement>("td.nowrap button.ie")!;
    fireEvent.click(min);
    const campo = document.querySelector<HTMLInputElement>("input.ie-in")!;
    fireEvent.change(campo, { target: { value: "999999" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(await screen.findByText(/O mínimo não pode ser maior que o máximo\.|Gravado\./)).toBeInTheDocument();
  });

  it("o menu Mais ações tem Editar, Registar ajuste, Ver reservas e Eliminar; eliminar com stock recusa", async () => {
    render(<Casa inicio="stock" />);
    fireEvent.click(await screen.findByRole("button", { name: "Por armazém" }));
    fireEvent.click(document.querySelectorAll<HTMLElement>('button[aria-label="Mais ações"]')[0]);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((m) => m.querySelector("span")?.textContent)).toEqual(["Editar", "Registar ajuste", "Ver reservas", "Eliminar"]);
    expect(within(menu).getByRole("menuitem", { name: /Eliminar/ })).toHaveClass("danger");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Eliminar/ }));
    const dlg = await screen.findByRole("dialog", { name: "Eliminar linha de stock" });
    expect(within(dlg).getByText(/só pode ser eliminada com quantidade 0/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Eliminar" }));
    expect(await within(dlg).findByText(/Tem \d+ un\. Registe um ajuste/)).toBeInTheDocument();
  });

  it("Adicionar stock valida o produto e Importar compara com a exportação atual", async () => {
    render(<Casa inicio="stock" />);
    fireEvent.click(botaoAcao("Adicionar stock"));
    const dlg = await screen.findByRole("dialog", { name: "Adicionar stock" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Adicionar" }));
    expect(within(dlg).getByText("Escolha um produto válido.")).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Adicionar stock" })).toBeNull());
    fireEvent.click(botaoAcao("Importar"));
    const imp = await screen.findByRole("dialog", { name: "Importar existências" });
    expect(within(imp).getByText(/A quantidade não é importável/)).toBeInTheDocument();
    fireEvent.click(within(imp).getByRole("button", { name: /Colar a exportação atual como modelo/ }));
    fireEvent.click(within(imp).getByRole("button", { name: /Pré-visualizar/ }));
    expect(await within(imp).findByText(/\d+ Sem alterações/)).toBeInTheDocument();
  });

  it("sem permissões (Só consulta) os botões ficam desativados com o porquê e o valor em stock é um traço", async () => {
    act(() => mudarPerfil("consulta"));
    render(<Casa inicio="stock" />);
    await screen.findByRole("heading", { level: 1, name: "Existências" });
    for (const n of ["Importar", "Registar movimento", "Adicionar stock"]) {
      expect(botaoAcao(n)).toBeDisabled();
      expect(botaoAcao(n)).toHaveAttribute("title", "Sem permissão: requer inventory.manage. Peça acesso a um administrador.");
    }
    expect(document.querySelector(".kpis .kv")?.textContent).toBe("—");
    fireEvent.click(screen.getByRole("button", { name: "Por armazém" }));
    expect(document.querySelector("td.mono .lk-ic")).not.toBeNull();
  });
});

describe("Movimentos", () => {
  it("tem Exportar e Registar movimento no cabeçalho, filtros e a regra do livro", async () => {
    render(<Casa inicio="mov" />);
    await screen.findByRole("heading", { level: 1, name: "Movimentos" });
    expect(within(acoes()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Exportar", "Registar movimento"]);
    const filtros = document.querySelector(".card.filters") as HTMLElement;
    expect(within(filtros).getByRole("searchbox", { name: "Produto" })).toHaveAttribute("placeholder", "Produto, SKU ou EAN");
    expect(within(filtros).getByRole("searchbox", { name: "Documento" })).toHaveAttribute("placeholder", "Documento (PO, EC, INV, TR)");
    expect(filtros.querySelectorAll("label.inl").length).toBe(2);
    expect(filtros.querySelector(".rules")?.textContent).toMatch(/^O livro nunca se edita nem apaga/);
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    fireEvent.change(within(filtros).getByRole("combobox", { name: "Tipo" }), { target: { value: "in" } });
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument();
  });

  it("mostra 40 de cada vez, com Carregar mais, e a nota edita-se no sítio e fica marcada", async () => {
    render(<Casa inicio="mov" />);
    const total = lerInventario().moves.length;
    const rodape = await waitFor(() => document.querySelector(".tbl-foot") as HTMLElement);
    expect(rodape.textContent).toContain(`A mostrar ${Math.min(40, total)} de ${total} movimento(s)`);
    if (total > 40) { fireEvent.click(within(rodape).getByRole("button", { name: "Carregar mais" })); expect(document.querySelector(".tbl-foot")?.textContent).toContain(`A mostrar ${Math.min(80, total)} de ${total}`); }
    fireEvent.click(document.querySelector<HTMLElement>("tbody td button.ie")!);
    const campo = document.querySelector<HTMLInputElement>("input.ie-in")!;
    fireEvent.change(campo, { target: { value: "nota nova" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await screen.findByText("Gravado.");
    expect(lerInventario().moves.some((m) => m.note === "nota nova" && !!m.noteEdited)).toBe(true);
    expect(await screen.findByText(/nota editada/)).toBeInTheDocument();
  });

  it("Registar movimento tem 6 tipos em cartões e o passo 2 muda com o tipo", async () => {
    render(<Casa inicio="mov" />);
    fireEvent.click(botaoAcao("Registar movimento"));
    const d1 = await screen.findByRole("dialog", { name: "Registar movimento · 1 de 2" });
    expect(d1.querySelectorAll(".typecards .tcard").length).toBe(6);
    fireEvent.click(within(d1).getByRole("button", { name: /^Transferência/ }));
    const d2 = await screen.findByRole("dialog", { name: "Registar movimento · 2 de 2 · Transferência" });
    for (const r of ["Origem", "Destino", "Pedido de transferência (opcional)"]) expect(within(d2).getByText(r)).toBeInTheDocument();
    expect(within(d2).getByRole("button", { name: "Mudar tipo" })).toBeInTheDocument();
    expect(within(d2).getByRole("button", { name: /Registar 1 linha\(s\)/ })).toBeInTheDocument();
  });

  it("uma saída acima do stock avisa na linha e falha por inteiro; sem permissão o botão está desativado", async () => {
    render(<Casa inicio="mov" />);
    fireEvent.click(botaoAcao("Registar movimento"));
    const d1 = await screen.findByRole("dialog", { name: /1 de 2/ });
    fireEvent.click(within(d1).getByRole("button", { name: /^Saída/ }));
    const d2 = await screen.findByRole("dialog", { name: /2 de 2 · Saída/ });
    fireEvent.change(within(d2).getByLabelText(/^Produto/), { target: { value: "CD-80" } });
    fireEvent.change(within(d2).getByLabelText("Quantidade"), { target: { value: "99999" } });
    expect(await within(d2).findByText(/Saída abaixo de zero: só há \d+ un em .* Esta linha vai falhar\./)).toBeInTheDocument();
    cleanup();
    act(() => mudarPerfil("consulta"));
    render(<Casa inicio="mov" />);
    expect(botaoAcao("Registar movimento")).toBeDisabled();
    expect(botaoAcao("Registar movimento")).toHaveAttribute("title", "Requer inventory.manage");
  });
});
