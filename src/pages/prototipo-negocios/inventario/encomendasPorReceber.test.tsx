// Armazém › Receção abre com as encomendas por receber (16/10): as POs do Tiago Almeida (CT 2026/1027) aparecem sem vir do botão Receber da PO,
// a pesquisa filtra, "Receber" abre ali o painel, a receção total tira a PO da lista e a pendente aparece com aviso.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acoes, seed } from "../motor";
import { FINANCEIRO, emFalta, type Grupo } from "../campos";
import InventarioPagina from "./InventarioPagina";
import { esquecerInventario, lerInventario } from "./loja";
import { esquecerPerfil } from "./perfil";
import { poRecebivel } from "./po";

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
/** Paga o negócio do Tiago Almeida: a EC-1027 vai ao Inventário e o que falta fica em POs (pendentes) aos fornecedores das obras. */
function pagarTiago(): string[] {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  preencher(d, FINANCEIRO); S.role = "financeiro"; A.emitir(d.id); A.validar(d.id);
  return lerInventario().pos.filter((p) => p.originKey === "CT 2026/1027").map((p) => p.id);
}
const lista = (): HTMLElement => screen.getByRole("region", { name: /Encomendas por receber/ });

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Receção · Encomendas por receber", () => {
  it("abre com as POs do Tiago (com a origem), a pesquisa filtra e a pendente tem aviso", () => {
    const ids = pagarTiago();
    expect(ids.length).toBeGreaterThan(0);
    render(<InventarioPagina aba="guia" />);
    for (const id of ids) expect(within(lista()).getByText(id)).toBeInTheDocument();
    expect(within(lista()).getAllByText(/CT 2026\/1027 · /).length).toBeGreaterThan(0);
    expect(within(lista()).getAllByText(/Por enviar ao fornecedor/).length).toBeGreaterThan(0);
    fireEvent.click(within(lista()).getByRole("button", { name: /^Filtros/ }));
    fireEvent.change(within(lista()).getByRole("searchbox", { name: /Pesquisar/ }), { target: { value: "Tiago" } });
    const linhas = within(lista()).getAllByRole("button", { name: /^Dar entrada PO-/ }).map((b) => b.getAttribute("aria-label")!.replace("Dar entrada ", ""));
    expect(linhas.sort()).toEqual([...ids].sort());
  });

  it("\"Dar entrada\" abre o painel com a falta preenchida; confirmar avisa a reserva para o cliente, a PO sai de Por receber e aparece em Recebidas; reverter no histórico", async () => {
    const [id] = pagarTiago();
    render(<InventarioPagina aba="guia" />);
    fireEvent.click(within(lista()).getByRole("button", { name: `Dar entrada ${id}` }));
    const painel = screen.getByRole("dialog", { name: `Dar entrada · ${id}` });
    expect(within(painel).getByText(/ainda está pendente/)).toBeInTheDocument();
    const po0 = lerInventario().pos.find((p) => p.id === id)!;
    const falta = po0.lines.reduce((a, l) => a + l.packs * l.packN - l.recv - l.cancelled, 0);
    expect(within(painel).getByText(new RegExp(`^Vai entrar ${falta} un`))).toBeInTheDocument();
    // a conferência linha a linha vem com a falta preenchida
    fireEvent.click(within(painel).getByRole("button", { name: /Conferir linha a linha/ }));
    within(painel).getAllByRole("spinbutton", { name: /Dar entrada/ }).forEach((c, i) => expect(c).toHaveValue(po0.lines[i].packs * po0.lines[i].packN - po0.lines[i].recv - po0.lines[i].cancelled));
    fireEvent.click(within(painel).getByRole("button", { name: /Voltar ao resumo/ }));
    fireEvent.click(within(painel).getByRole("button", { name: `Receber tudo · ${falta} un` }));
    expect(await screen.findAllByText(/Entrou no .* un reservadas para Tiago Almeida/)).not.toHaveLength(0);
    expect(poRecebivel(lerInventario().pos.find((p) => p.id === id)!)).toBe(false);
    fireEvent.click(within(screen.getByRole("dialog", { name: `Dar entrada · ${id}` })).getByRole("button", { name: "Concluir" }));
    expect(screen.queryByRole("dialog", { name: `Dar entrada · ${id}` })).toBeNull();
    expect(within(lista()).queryByText(id)).toBeNull();
    // Recebidas: o histórico das entradas, com Reverter
    fireEvent.click(screen.getByRole("tab", { name: /^Recebidas/ }));
    const hist = screen.getByRole("region", { name: "Receções feitas" });
    expect(within(hist).getAllByText(id).length).toBeGreaterThan(0);
    fireEvent.click(within(hist).getAllByRole("button", { name: new RegExp(`^Reverter a receção de ${id}`) })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Reverter receção" });
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "Engano na contagem" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Reverter receção" }));
    await waitFor(() => expect(lerInventario().pos.find((p) => p.id === id)!.receipts.some((r) => r.state === "Revertida")).toBe(true));
    expect(poRecebivel(lerInventario().pos.find((p) => p.id === id)!)).toBe(true);
  });

  it("\"Ler artigo a artigo\" abre o leitor (o telemóvel da receção)", () => {
    render(<InventarioPagina aba="guia" />);
    expect(screen.queryByLabelText("Receção no telemóvel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ler artigo a artigo" }));
    expect(screen.getByRole("dialog", { name: "Ler artigo a artigo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Receção no telemóvel")).toBeInTheDocument();
  });
});
