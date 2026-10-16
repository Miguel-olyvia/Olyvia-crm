// Encomendas com o DOM do mockup: ações no cabeçalho, filtros em `card filters`, vista agrupada, folha com linha temporal, edição na própria célula, duplicar,
// importar e as permissões por perfil (aprovar, anular e receber).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fresca, recusa } from "./ajudaTestes";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import type { AbaInv } from "./ctxInv";
import { esquecerInventario, lerInventario } from "./loja";
import { esquecerPerfil, mudarPerfil } from "./perfil";
import { defPos } from "./poCsv";
import { enviarPo } from "./po";
import { anularResto } from "./receber";

function Casa({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const acoes = (): HTMLElement => document.querySelector(".ph-actions") as HTMLElement;
const linha = (id: string): HTMLElement => screen.getByRole("row", { name: new RegExp("^Abrir " + id) });
const abrirPo = async (id: string): Promise<HTMLElement> => { fireEvent.click(linha(id)); return screen.findByRole("dialog", { name: id }); };
const pos = () => lerInventario().pos;

beforeEach(() => { localStorage.clear(); esquecerPerfil(); esquecerInventario(); });
afterEach(() => { cleanup(); localStorage.clear(); esquecerPerfil(); });

describe("Encomendas · cabeçalho, filtros e lista", () => {
  it("tem as ações dentro do cabeçalho (Nova encomenda é a primária), os KPI e o cartão de filtros do mockup", async () => {
    render(<Casa inicio="po" />);
    await screen.findByRole("heading", { level: 1, name: "Encomendas a fornecedor" });
    expect(within(acoes()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Exportar", "Importar", "Nova encomenda"]);
    expect(within(acoes()).getByRole("button", { name: "Nova encomenda" })).toHaveClass("btn", "btn-p");
    expect([...document.querySelectorAll(".kpis .kl")].map((k) => k.textContent)).toEqual(["Por aprovar", "Encomendadas", "Atrasadas", "Valor por receber"]);
    const filtros = document.querySelector(".card.filters") as HTMLElement;
    expect(within(filtros).getByRole("searchbox", { name: "Pesquisar encomendas" })).toHaveAttribute("placeholder", "Nº PO, produto, SKU/EAN ou cliente");
    expect(within(filtros).getByRole("combobox", { name: "Fornecedor" })).toBeInTheDocument();
    expect(within(filtros).getByRole("combobox", { name: "Campo de data" })).toBeInTheDocument();
    expect(within(filtros).getByLabelText("Ver eliminados")).not.toBeChecked();
    expect(within(filtros).getByLabelText("Agrupar por fornecedor")).not.toBeChecked();
    const chips = within(within(filtros).getByRole("group", { name: "Estado" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips.map((c) => c?.replace(/\d+$/, "").trim())).toEqual(["Todas", "Pendente", "Encomendado", "Parcialmente recebida", "Recebida", "Cancelada", "Atrasadas", "No portal", "Por receber"]);
    expect(chips[0]).toBe("Todas 13");
    expect(chips[1]).toBe("Pendente 3");
    expect(document.querySelector(".tbl-foot")?.textContent).toMatch(/^13 encomenda\(s\)/);
  });

  it("Agrupar por fornecedor mostra a vista expansível com os cabeçalhos do mockup", async () => {
    render(<Casa inicio="po" />);
    fireEvent.click(await screen.findByLabelText("Agrupar por fornecedor"));
    const cab = [...document.querySelectorAll("#po-list thead th")].map((t) => t.textContent);
    expect(cab).toEqual(["Fornecedor", "Nº encomendas", "Por receber", "Recebidas", "Última", "Valor total"]);
    expect(document.querySelector(".tbl-foot")).toBeNull();
    expect(screen.queryAllByRole("row", { name: /^Abrir PO-/ })).toHaveLength(0);
    const grupos = document.querySelectorAll<HTMLElement>("tr.grp button.link[aria-expanded]");
    expect(grupos.length).toBeGreaterThan(1);
    expect(grupos[0]).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(grupos[0]);
    expect(grupos[0]).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelectorAll("tr.sub").length).toBe(1);
    expect(screen.getAllByRole("row", { name: /^Abrir PO-/ }).length).toBeGreaterThan(0);
  });
});

describe("Encomendas · folha, edição na célula e duplicar", () => {
  it("a folha tem a linha temporal, os separadores com contagens e o rodapé do estado", async () => {
    render(<Casa inicio="po" />);
    const folha = await abrirPo("PO-2026-0143");
    expect(within(folha).getByRole("list", { name: "Linha temporal" }).querySelectorAll("li")).toHaveLength(6);
    const abas = within(folha).getAllByRole("tab").map((t) => t.textContent);
    expect(abas[0]).toMatch(/^Linhas/);
    expect(abas.map((t) => t?.replace(/\d+$/, ""))).toEqual(["Linhas", "Receções", "Guias", "Portal", "Anulações", "Notas", "Histórico"]);
    const rodape = folha.querySelector(".sh-foot") as HTMLElement;
    expect(within(rodape).getAllByRole("button").map((b) => b.textContent)).toEqual(["Eliminar", "Gravar", "Gravar e encomendar"]);
    expect(folha.querySelector(".sh-info")).not.toBeNull();
  });

  it("editar a quantidade na própria célula grava logo; um valor inválido recusa com a regra e não muda nada", async () => {
    render(<Casa inicio="po" />);
    const folha = await abrirPo("PO-2026-0143");
    const antes = pos().find((p) => p.id === "PO-2026-0143")!.lines[0].packs;
    fireEvent.click(folha.querySelector("tbody tr td:nth-child(3) button.ie") as HTMLElement);
    let campo = folha.querySelector<HTMLInputElement>("input.ie-in") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "0" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect((await screen.findAllByText("Quantidade inteira (embalagens) ≥ 1.")).length).toBeGreaterThan(0);
    expect(pos().find((p) => p.id === "PO-2026-0143")!.lines[0].packs).toBe(antes);
    fireEvent.click(folha.querySelector("tbody tr td:nth-child(3) button.ie") as HTMLElement);
    campo = folha.querySelector<HTMLInputElement>("input.ie-in") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: String(antes + 3) } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect((await screen.findAllByText("Gravado.")).length).toBeGreaterThan(0);
    expect(pos().find((p) => p.id === "PO-2026-0143")!.lines[0].packs).toBe(antes + 3);
  });

  it("uma PO cancelada bloqueia as linhas e oferece 'Duplicar como nova encomenda', que cria um rascunho com as mesmas linhas", async () => {
    render(<Casa inicio="po" />);
    const folha = await abrirPo("PO-2026-0134");
    expect(within(folha).getAllByText(/Encomenda cancelada/).length).toBeGreaterThan(0);
    const antes = pos().length;
    const orig = pos().find((p) => p.id === "PO-2026-0134")!;
    fireEvent.click(within(folha).getAllByRole("button", { name: /Duplicar como nova encomenda/ })[0]);
    await screen.findByRole("dialog", { name: /^PO-2026-\d+$/ });
    expect(pos()).toHaveLength(antes + 1);
    const nova = pos()[pos().length - 1];
    expect(nova.status).toBe("pending");
    expect(nova.lines.map((l) => [l.sku, l.packs])).toEqual(orig.lines.map((l) => [l.sku, l.packs]));
    expect(nova.log.some((l) => l.t === "Duplicada de PO-2026-0134")).toBe(true);
  });
});

describe("Encomendas · importar", () => {
  it("importar cria rascunhos pelas linhas válidas e deixa as referências que já existem como 'Sem alterações'", async () => {
    render(<Casa inicio="po" />);
    const db = lerInventario();
    const p = db.pos.find((x) => x.id === "PO-2026-0143")!;
    const s = db.suppliers.find((x) => x.id === p.sup)!, w = db.warehouses.find((x) => x.id === p.wh)!, sku = p.lines[0].sku;
    const csv = ["referencia;fornecedor;armazem;sku;embalagens;preco;estado", `IMP-1;${s.code};${w.code};${sku};3;;Pendente`, `${p.id};${s.code};${w.code};${sku};1;;Pendente`, `IMP-2;XX;${w.code};${sku};1;;Pendente`].join("\n");
    fireEvent.click(within(acoes()).getByRole("button", { name: "Importar" }));
    const dlg = await screen.findByRole("dialog", { name: "Importar encomendas a fornecedor" });
    fireEvent.change(within(dlg).getByLabelText("Conteúdo CSV"), { target: { value: csv } });
    fireEvent.click(within(dlg).getByRole("button", { name: /Pré-visualizar/ }));
    expect(within(dlg).getByText("1 Novo")).toBeInTheDocument();
    expect(within(dlg).getByText("1 Sem alterações")).toBeInTheDocument();
    expect(within(dlg).getByText("1 Erro")).toBeInTheDocument();
    expect(within(dlg).getByText("Fornecedor desconhecido: XX")).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Importar 1 linha(s)" }));
    await screen.findAllByText("1 linha(s) importadas.");
    const nova = pos().find((x) => x.importRef === "IMP-1")!;
    expect(nova.status).toBe("pending");
    expect(nova.lines).toHaveLength(1);
    expect(nova.lines[0]).toMatchObject({ sku, packs: 3 });
  });

  it("exportar usa as colunas do mockup e só as linhas das encomendas filtradas", () => {
    const db = fresca();
    const def = defPos(db, () => db.pos.filter((x) => x.id === "PO-2026-0143"));
    expect(def.cols.map((c) => c[0])).toEqual(["referencia", "fornecedor", "armazem", "sku", "embalagens", "preco", "estado"]);
    const linhas = def.linhas();
    expect(linhas).toHaveLength(db.pos.find((x) => x.id === "PO-2026-0143")!.lines.length);
    expect(def.cols.map((c) => c[1](linhas[0])).slice(-1)).toEqual(["Pendente"]);
  });
});

describe("Encomendas · permissões por perfil", () => {
  it("um perfil sem purchase_orders.approve/manage tem Aprovar, Importar e Nova encomenda desativados, com o motivo", async () => {
    render(<Casa inicio="po" />);
    act(() => mudarPerfil("armazem"));
    expect(within(acoes()).getByRole("button", { name: "Importar" })).toBeDisabled();
    expect(within(acoes()).getByRole("button", { name: "Nova encomenda" })).toBeDisabled();
    expect(within(acoes()).getByRole("button", { name: "Nova encomenda" })).toHaveAttribute("title", "Requer purchase_orders.manage");
    const aprovar = screen.getAllByRole("button", { name: "Aprovar e enviar" })[0];
    expect(aprovar).toBeDisabled();
    expect(aprovar).toHaveAttribute("title", "Sem permissão: requer purchase_orders.approve. Peça acesso a um administrador.");
  });

  it("um perfil sem inventory.receive não recebe, e o de compras aprova mas não recebe", async () => {
    render(<Casa inicio="po" />);
    act(() => mudarPerfil("compras"));
    const receber = screen.getAllByRole("button", { name: /Receber no armazém/ })[0];
    expect(receber).toBeDisabled();
    expect(receber).toHaveAttribute("title", "Sem permissão: requer inventory.receive. Peça acesso a um administrador.");
    expect(screen.getAllByRole("button", { name: "Aprovar e enviar" })[0]).toBeEnabled();
  });

  it("as regras recusam com a mensagem do mockup quando o perfil não tem a permissão (aprovar e anular o resto)", () => {
    const db = fresca();
    const pendente = db.pos.find((p) => p.id === "PO-2026-0143")!, ordenada = db.pos.find((p) => p.id === "PO-2026-0141")!;
    mudarPerfil("armazem");
    expect(recusa(() => enviarPo(db, pendente))).toBe("Sem permissão: passar a Encomendado (requer purchase_orders.approve).");
    expect(recusa(() => anularResto(db, ordenada, ordenada.lines.map((l) => l.id), "Fornecedor sem produto", ""))).toBe("Sem permissão: anular resto (requer purchase_orders.manage).");
    mudarPerfil("compras");
    enviarPo(db, pendente);
    expect(pendente.status).toBe("ordered");
  });
});
