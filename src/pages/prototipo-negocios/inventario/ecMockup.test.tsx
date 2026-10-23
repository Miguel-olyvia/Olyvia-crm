// O ecrã "Saídas para clientes" e o diálogo "Simular venda assinada" com o DOM, os textos e o comportamento do mockup (scrEC, ecSheet, shipDlg, ecFormDlg, ecDelete, simSaleDlg).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErroInv, ecPorId } from "./base";
import { paraCsv } from "./csvInv";
import type { AbaInv } from "./ctxInv";
import { defEcs, confirmarSaida, definirCampoEc, definirQtdLinhaEc, desfazerSaida } from "./ecAcoes";
import InventarioPagina from "./InventarioPagina";
import { esquecerInventario, executar, lerInventario } from "./loja";
import MenuInventario from "./MenuInventario";
import { esquecerPerfil, mudarPerfil } from "./perfil";

const NOME_MENU: Record<string, string> = { "Encomendas de cliente": "Saídas para clientes" };
const item = (nome: string): HTMLElement => within(screen.getAllByTestId("menu-inventario")[0]).getByRole("button", { name: new RegExp("^" + (NOME_MENU[nome] ?? nome)) });
const separador = (nome: string): void => { fireEvent.click(item(nome)); };
function Casa() {
  const [aba, setAba] = useState<AbaInv>("hoje");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const linhas = (): HTMLElement[] => screen.getAllByRole("row", { name: /^Abrir EC-/ });
const linha = (id: string): HTMLElement => screen.getByRole("row", { name: new RegExp("^Abrir " + id + ",") });
const ec = (id: string) => ecPorId(lerInventario(), id)!;
const abrirEc = async (id: string): Promise<HTMLElement> => { separador("Encomendas de cliente"); fireEvent.click(linha(id)); return screen.findByRole("dialog", { name: id }); };

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => { cleanup(); localStorage.clear(); esquecerPerfil(); vi.restoreAllMocks(); });

describe("Saídas para clientes: a lista", () => {
  it("o cabeçalho leva Exportar (com o selo Novo) e a ação primária, sem Importar (o mockup só exporta)", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    const acoes = await waitFor(() => { const a = document.querySelector<HTMLElement>(".ph-actions"); expect(a?.querySelector(".btn-p")).not.toBeNull(); return a as HTMLElement; });
    expect(within(acoes).getByRole("button", { name: "Exportar Novo" }).querySelector(".new")).not.toBeNull();
    expect(within(acoes).getByRole("button", { name: "Nova encomenda manual" })).toHaveClass("btn-p");
    expect(within(acoes).queryByRole("button", { name: /Importar/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Saídas para clientes" })).toBeInTheDocument();
  });

  it("tem os quatro KPI, o cartão de filtros com chips e legenda, e a tabela do mockup", () => {
    render(<Casa />); separador("Encomendas de cliente");
    expect([...document.querySelectorAll(".kpis .kl")].map((n) => n.textContent)).toEqual(["Prontas a expedir", "Parcialmente pendentes", "A aguardar PO", "Sem fornecedor"]);
    const filtros = document.querySelector(".card.filters") as HTMLElement;
    expect(within(filtros).getByPlaceholderText("Nº EC, contrato, VD, cliente ou produto")).toHaveAttribute("type", "search");
    expect(within(filtros).getByRole("combobox", { name: "Armazém de expedição" })).toBeInTheDocument();
    expect(within(filtros).getByLabelText(/Ver eliminadas/).closest("label")).toHaveClass("check");
    expect([...filtros.querySelectorAll(".chips .chip")].map((c) => c.firstChild?.textContent?.trim())).toEqual(["Todas", "Prontas a expedir", "Totalmente servido", "Parcialmente pendente", "A aguardar encomenda", "Sem fornecedor"]);
    expect([...filtros.querySelectorAll(".legend span")].map((s) => s.textContent)).toEqual(["Servido", "Em stock (reservado, pronto)", "A aguardar PO", "Em falta / sem fornecedor"]);
    const tabela = document.querySelector(".tw table.min-1000") as HTMLElement;
    expect([...tabela.querySelectorAll("thead th")].slice(0, 7).map((t) => t.textContent)).toEqual(["Nº EC · origem", "Cliente", "Morada", "Data", "Linhas", "Progresso", "Estado"]);
    expect(tabela.querySelectorAll("tbody tr.click")).toHaveLength(9);
    expect(tabela.querySelectorAll("tbody .seg")).toHaveLength(9);
    expect(within(linha("EC-0087")).getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["Ver", "PDF", "Mais ações"]);
    expect(within(linha("EC-0087")).getByText("4 pronta(s) a sair")).toHaveClass("badge", "b-violet");
    expect(document.querySelector(".tbl-foot")?.textContent).toContain("9 encomenda(s)");
  });

  it("os KPI e os chips filtram; a pesquisa e as eliminadas também", () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(document.querySelectorAll<HTMLElement>(".kpis .kpi")[0]);
    expect(linhas()).toHaveLength(7);
    fireEvent.click(within(document.querySelector(".chips") as HTMLElement).getByRole("button", { name: /^Todas/ }));
    expect(linhas()).toHaveLength(9);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar encomendas clientes" }), { target: { value: "Irmãos" } });
    expect(linhas()).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar encomendas clientes" }), { target: { value: "zzzz" } });
    expect(screen.getByText("Sem encomendas com estes filtros")).toBeInTheDocument();
    expect(document.querySelector(".tbl-foot")?.textContent).toContain("0 encomenda(s)");
  });

  it("a ação primária fica desativada, com o porquê, sem a permissão inventory.manage", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    act(() => mudarPerfil("compras"));
    const botao = await waitFor(() => { const b = screen.getByRole("button", { name: "Nova encomenda manual" }); expect(b).toBeDisabled(); return b; });
    expect(botao).toHaveAttribute("title", "Sem permissão: requer inventory.manage. Peça acesso a um administrador.");
  });

  it("Exportar descarrega o CSV com as linhas filtradas e avisa quantas saíram", async () => {
    const criar = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(await screen.findByRole("button", { name: "Exportar Novo" }));
    expect(criar).toHaveBeenCalled();
    expect((await screen.findAllByText("Exportado: 21 linha(s) para encomendas-clientes.csv (mesmas colunas da importação).")).length).toBeGreaterThan(0);
  });

  it("a definição de exportar tem as colunas do mockup e recusa importar", () => {
    const db = lerInventario();
    const def = defEcs(db, () => db.ecs);
    expect(paraCsv(def, def.linhas()).split("\r\n")[0].replace("﻿", "")).toBe("encomenda;origem;cliente;armazem_expedicao;data;estado;sku;descricao;quantidade;servido;estado_linha");
    expect(def.verificar({}, db)).toMatchObject({ st: "Erro", msg: "Só exportação." });
  });
});

describe("Saídas para clientes: a folha", () => {
  it("mostra a informação, a legenda dos estados, a tabela e o rodapé do mockup", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0087");
    const info = folha.querySelector(".sh-info") as HTMLElement;
    expect([...info.querySelectorAll(".lbl")].map((l) => l.textContent)).toEqual(["Cliente", "Encomenda · data", "Valor", "Morada", "Notas", "Origem", "Armazém de expedição"]);
    expect(info.textContent).toContain("Contrato CT-2026-041");
    expect(within(folha).getByText("Diagnóstico da obra (só leitura)").closest("details")).toHaveClass("box");
    expect([...folha.querySelectorAll(".legend .badge")].map((b) => b.textContent)).toEqual(["Servido", "Recebido PO", "A aguardar PO", "Pronto a sair", "Parcial", "Em falta", "Sem fornecedor", "Serviço", "Anulado"]);
    const tabela = folha.querySelector("table.min-900") as HTMLElement;
    expect([...tabela.querySelectorAll("thead th")].slice(0, 5).map((t) => t.textContent)).toEqual(["SKU", "Produto", "Qtd", "De onde vem", "Estado"]);
    expect(within(folha).getByText(/Regra: se há stock livre/)).toHaveClass("rules");
    expect(within(folha).getByText("Histórico").tagName).toBe("H3");
    const rodape = folha.querySelector(".sh-foot") as HTMLElement;
    expect(rodape.querySelector(".left")?.textContent).toBe("PDF");
    expect(within(rodape).getByRole("button", { name: "Pedir em falta ao fornecedor" })).toBeInTheDocument();
    expect(within(rodape).getByRole("button", { name: "Confirmar saída (4)" })).toHaveClass("btn-p");
    expect(within(folha).getByRole("button", { name: "Mais ações" })).toBeInTheDocument();
  });

  it("numa encomenda de contrato o cliente e a quantidade ficam trancados, com o porquê no cadeado", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0087");
    expect(folha.querySelector('[title="Vem do contrato CT-2026-041: altere-o na origem"]')).not.toBeNull();
    expect(folha.querySelector('[title="Quantidade definida pelo contrato CT-2026-041: altere na origem"]')).not.toBeNull();
    expect(folha.querySelector("#ec-wh")).toHaveAttribute("title", "Já há saídas: o armazém fica fixo");
  });

  it("numa encomenda manual o cliente edita-se na própria célula (Enter grava)", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0090");
    fireEvent.click(within(folha).getAllByTitle("Clique para editar")[0]);
    const campo = within(folha).getByLabelText("Editar");
    fireEvent.change(campo, { target: { value: "Cliente Novo Lda" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(ec("EC-0090").client).toBe("Cliente Novo Lda"));
    expect(ec("EC-0090").log.slice(-1)[0]?.t).toBe("Cliente alterado por Admin Demo");
  });

  it("a quantidade de uma linha manual edita-se na célula e nunca desce abaixo do servido", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0090");
    const q0 = ec("EC-0090").lines[0].qty;
    const botoes = folha.querySelectorAll<HTMLElement>("tbody td.num button.ie");
    fireEvent.click(botoes[0]);
    const campo = within(folha).getByLabelText("Editar");
    expect(campo).toHaveAttribute("min", "1");
    fireEvent.change(campo, { target: { value: String(q0 + 1) } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(ec("EC-0090").lines[0].qty).toBe(q0 + 1));
  });

  it("o armazém de expedição muda-se na folha e fica fixo quando já há saídas", async () => {
    render(<Casa />);
    let folha = await abrirEc("EC-0090");
    fireEvent.change(folha.querySelector("#ec-wh") as HTMLSelectElement, { target: { value: "POR" } });
    await waitFor(() => expect(ec("EC-0090").wh).toBe("POR"));
    cleanup(); folha = await (async () => { render(<Casa />); return abrirEc("EC-0086"); })();
    const wh = folha.querySelector("#ec-wh") as HTMLSelectElement;
    expect(wh).toBeDisabled();
    expect(wh).toHaveAttribute("title", "Já há saídas: o armazém fica fixo");
  });

  it("Confirmar saída abre o diálogo da tabela, regista a saída e a folha atualiza", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0090");
    const antes = ec("EC-0090").lines.reduce((a, l) => a + l.served, 0);
    fireEvent.click(within(folha.querySelector(".sh-foot") as HTMLElement).getByRole("button", { name: /^Confirmar saída \(/ }));
    const dlg = await screen.findByRole("dialog", { name: "Confirmar saída · EC-0090" });
    expect([...dlg.querySelectorAll("thead th")].slice(0, 5).map((t) => t.textContent)).toEqual(["", "Produto", "Pronto", "Quantidade", "Armazém"]);
    expect(within(dlg).getByText("Cada linha gera uma Saída no livro. Uma linha que falha não bloqueia as outras.")).toHaveClass("muted");
    fireEvent.click(within(dlg).getByRole("button", { name: "Confirmar saída" }));
    await waitFor(() => expect(ec("EC-0090").lines.reduce((a, l) => a + l.served, 0)).toBeGreaterThan(antes));
    expect((await screen.findAllByText(/linha\(s\) saíram de armazém\. Encomenda atualizada\./)).length).toBeGreaterThan(0);
  });

  it("uma linha que falha fica com a sua mensagem e não bloqueia as outras", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0090");
    fireEvent.click(within(folha.querySelector(".sh-foot") as HTMLElement).getByRole("button", { name: /^Confirmar saída \(/ }));
    const dlg = await screen.findByRole("dialog", { name: "Confirmar saída · EC-0090" });
    fireEvent.change(within(dlg).getAllByRole("spinbutton")[0], { target: { value: "999" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Confirmar saída" }));
    expect(await within(dlg).findByText(/Só há \d+ un prontas a sair em/)).toHaveClass("alert", "bad");
    expect(within(dlg).getByText("Fechar", { selector: "button.btn" })).toBeInTheDocument();
  });

  it("Reverter saída pede confirmação, devolve ao armazém e regista o estorno", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0085");
    const botao = folha.querySelector("td.act .btn-sm:not(.btn-p)") as HTMLElement;
    expect(botao.textContent).toBe("Reverter saída");
    fireEvent.click(botao);
    const dlg = await screen.findByRole("dialog", { name: "Reverter saída" });
    expect(dlg.textContent).toMatch(/voltam a entrar em .* \(movimento de estorno no livro; o original não é apagado\)\./);
    const movs = lerInventario().moves.length;
    fireEvent.click(within(dlg).getByRole("button", { name: "Reverter saída" }));
    await waitFor(() => expect(lerInventario().moves.length).toBe(movs + 1));
    expect(lerInventario().moves.slice(-1)[0]).toMatchObject({ type: "in", note: "Estorno de saída" });
  });
});

describe("Saídas para clientes: menu Mais ações, eliminar e PDF", () => {
  it("o menu tem as ações do mockup e desativa o que não se aplica, com o porquê", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(within(linha("EC-0087")).getByRole("button", { name: "Mais ações" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((b) => b.querySelector("span")?.textContent)).toEqual(["Abrir detalhe", "PDF", "Editar", "Pedir em falta ao fornecedor", "Simular: anular contrato"]);
    expect(within(menu).getByRole("menuitem", { name: /^Editar/ })).toBeDisabled();
    expect(within(menu).getByText("Só encomendas manuais")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Simular: anular contrato/ })).toBeEnabled();
    expect(menu.querySelector(".danger")).not.toBeNull();
  });

  it("Eliminar uma encomenda manual exige o motivo e estorna, com o aviso do mockup", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(within(linha("EC-0092")).getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Eliminar/ }));
    const dlg = await screen.findByRole("dialog", { name: "Eliminar EC-0092" });
    expect(within(dlg).getByText("Esta ação fica registada e não apaga movimentos.").closest(".alert")).toHaveClass("warn");
    const ok = within(dlg).getByRole("button", { name: "Eliminar encomenda" });
    expect(ok).toBeDisabled();
    expect(ok).toHaveAttribute("title", "Escreva o motivo (mínimo 3 caracteres)");
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "cliente desistiu" } });
    fireEvent.click(ok);
    await waitFor(() => expect(ec("EC-0092").deleted).toBe(true));
    await waitFor(() => expect(screen.queryByRole("row", { name: /^Abrir EC-0092/ })).toBeNull());
  });

  it("anular o contrato é uma simulação com texto e botão próprios", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(within(linha("EC-0089")).getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Simular: anular contrato/ }));
    const dlg = await screen.findByRole("dialog", { name: "Anular contrato CT-2026-039" });
    expect(dlg.textContent).toContain("Simula a anulação do contrato: Estorna as saídas já feitas");
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "contrato anulado pelo cliente" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Anular contrato" }));
    await waitFor(() => expect(ec("EC-0089").deleted).toBe(true));
  });

  it("o PDF abre a pré-visualização com o cabeçalho e a tabela do documento", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(within(linha("EC-0087")).getByRole("button", { name: "PDF" }));
    const dlg = await screen.findByRole("dialog", { name: "Encomenda Cliente EC-0087 — pré-visualização" });
    expect(dlg.querySelector(".print-area")?.textContent).toContain("Empresa A (Lisboa) · NIF 500000000");
    expect([...dlg.querySelectorAll(".print-area thead th")].map((t) => t.textContent)).toEqual(["SKU", "Produto", "Qtd", "Servido", "Estado"]);
    expect(within(dlg).getByRole("button", { name: "Imprimir / guardar PDF" })).toHaveClass("btn-p");
  });
});

describe("Editar encomenda manual", () => {
  it("o diálogo tem os campos do mockup, trava o produto das linhas existentes e grava", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(within(linha("EC-0090")).getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Editar/ }));
    const dlg = await screen.findByRole("dialog", { name: "Editar EC-0090" });
    expect([...dlg.querySelectorAll(".fg > label.fl > span")].map((s) => s.textContent)).toEqual(["Cliente *", "Morada de entrega", "Armazém de expedição", "Notas"]);
    expect(within(dlg).getByRole("combobox", { name: /Armazém de expedição/ })).toBeDisabled();
    const produtos = within(dlg).getAllByLabelText("Produto");
    expect(produtos[0]).toBeDisabled();
    expect(produtos[0]).toHaveAttribute("title", "Produto de linha existente: para trocar, remova a quantidade e adicione nova linha");
    expect(within(dlg).getByText("Linhas (quantidade em unidades inteiras)")).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText(/^Cliente/), { target: { value: "Rocha Editada" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar" }));
    await waitFor(() => expect(ec("EC-0090").client).toBe("Rocha Editada"));
  });

  it("um produto escrito que não existe é recusado com o texto do mockup; um reconhecido cria a encomenda", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    fireEvent.click(await screen.findByRole("button", { name: "Nova encomenda manual" }));
    const dlg = await screen.findByRole("dialog", { name: "Nova encomenda manual" });
    fireEvent.change(within(dlg).getByLabelText(/^Cliente/), { target: { value: "Cliente Teste" } });
    fireEvent.change(within(dlg).getByLabelText("Produto"), { target: { value: "inexistente" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar" }));
    expect(await within(dlg).findByText("Produto não reconhecido: inexistente")).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText("Produto"), { target: { value: "CD-80" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar" }));
    await waitFor(() => expect(lerInventario().ecs).toHaveLength(10));
    expect(lerInventario().ecs.slice(-1)[0]).toMatchObject({ client: "Cliente Teste", origin: { k: "manual" } });
    expect(await screen.findByRole("dialog", { name: lerInventario().ecs.slice(-1)[0]!.id })).toBeInTheDocument();
  });
});

describe("Simular venda assinada", () => {
  const abrirSimular = async (): Promise<HTMLElement> => {
    render(<Casa />);
    fireEvent.click(screen.getAllByRole("button", { name: "Simular venda assinada" })[0]);
    return screen.findByRole("dialog", { name: "Simular venda assinada" });
  };

  it("tem a origem, o cliente, a morada, o armazém e as três linhas do mockup", async () => {
    const dlg = await abrirSimular();
    expect(dlg).toHaveClass("wide");
    expect(within(dlg).getByLabelText(/Origem/)).toHaveValue("CT");
    expect(within(dlg).getAllByRole("option", { selected: false }).map((o) => o.textContent)).toEqual(expect.arrayContaining(["Proposta aceite", "Venda direta confirmada"]));
    expect(within(dlg).getByLabelText(/^Cliente/)).toHaveValue("Cliente Exemplo Lda");
    expect(within(dlg).getByLabelText("Morada de entrega")).toHaveValue("Rua Exemplo 1, 1000-001 Lisboa");
    expect(within(dlg).getAllByLabelText(/^Produto da linha/)).toHaveLength(3);
    expect(within(dlg).getByLabelText("Produto da linha 1")).toHaveValue("PV-450 — " + lerInventario().products.find((p) => p.sku === "PV-450")!.name);
    expect(within(dlg).getByRole("button", { name: "Assinar e gerar" })).toHaveClass("btn-p");
    expect(dlg.querySelector("datalist#dl-prod")).not.toBeNull();
  });

  it("a definição de baixa avisa e impede gerar, sem criar nada", async () => {
    act(() => { executar((d) => { d.settings.deduction = "proposal"; }); });
    const dlg = await abrirSimular();
    expect(dlg.textContent).toContain("Esta origem não gera Encomenda Cliente (nunca os dois). Mude em Armazém › Armazéns › Definições.");
    fireEvent.click(within(dlg).getByRole("button", { name: "Assinar e gerar" }));
    expect(await within(dlg).findByText("Com a definição atual esta origem não gera encomenda. Nada foi criado.")).toBeInTheDocument();
    expect(lerInventario().ecs).toHaveLength(9);
  });

  it("um produto que não se reconhece é recusado; depois gera a EC, abre a folha e avisa", async () => {
    const dlg = await abrirSimular();
    fireEvent.change(within(dlg).getByLabelText("Produto da linha 2"), { target: { value: "zzz" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Assinar e gerar" }));
    expect(await within(dlg).findByText("Produto não reconhecido: zzz")).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText("Produto da linha 2"), { target: { value: "TR-50" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Assinar e gerar" }));
    await waitFor(() => expect(lerInventario().ecs).toHaveLength(10));
    const nova = lerInventario().ecs.slice(-1)[0]!;
    expect(nova.origin).toMatchObject({ k: "CT", ref: "CT-2026-044" });
    expect(await screen.findByRole("dialog", { name: nova.id })).toBeInTheDocument();
    expect((await screen.findAllByText(`${nova.id} criada a partir de CT-2026-044. Veja de onde vem cada linha.`)).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Saídas para clientes", hidden: true })).toBeInTheDocument();
  });
});

describe("Permissões das ações (need() do mockup)", () => {
  it("sem inventory.manage recusam a saída, a reversão, a edição das células e a quantidade", () => {
    const db = structuredClone(lerInventario());
    const e = ecPorId(db, "EC-0090")!;
    mudarPerfil("consulta");
    const msg = (fn: () => void): string => { try { fn(); } catch (x) { if (x instanceof ErroInv) return x.message; throw x; } return ""; };
    expect(msg(() => confirmarSaida(db, e, e.lines[0], 1, "LIS"))).toBe("Sem permissão: confirmar saídas (requer inventory.manage).");
    expect(msg(() => desfazerSaida(db, e, e.lines[0]))).toBe("Sem permissão: reverter saídas (requer inventory.manage).");
    expect(msg(() => definirCampoEc(db, "EC-0090", "notes", "x"))).toBe("Sem permissão: editar encomendas clientes (requer inventory.manage).");
    expect(msg(() => definirQtdLinhaEc(db, "EC-0090", e.lines[0].id, e.lines[0].qty + 1))).toBe("Sem permissão: editar encomendas (requer inventory.manage).");
  });

  it("as células do cliente e da quantidade ficam com cadeado para quem não tem permissão para editar", async () => {
    render(<Casa />);
    const folha = await abrirEc("EC-0090");
    act(() => mudarPerfil("compras"));
    await waitFor(() => expect(folha.querySelector('.lk-ic[title="Sem permissão: requer inventory.manage. Peça acesso a um administrador."]')).not.toBeNull());
    expect(within(folha.querySelector(".sh-foot") as HTMLElement).getByRole("button", { name: /^Confirmar saída \(/ })).toBeDisabled();
  });

  it("sem contracts.view o ecrã deixa de estar no menu e o perfil volta ao Hoje", async () => {
    render(<Casa />); separador("Encomendas de cliente");
    act(() => mudarPerfil("armazem"));
    await waitFor(() => expect(screen.queryAllByRole("row", { name: /^Abrir EC-/ })).toHaveLength(0));
    expect(within(screen.getAllByTestId("menu-inventario")[0]).queryByRole("button", { name: /^Saídas para clientes/ })).toBeNull();
  });
});
