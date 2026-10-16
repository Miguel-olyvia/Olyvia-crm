// Armazém › Receção abre com as encomendas por receber (16/10): as POs do Tiago Almeida (CT 2026/1027) aparecem sem vir do botão Receber da PO,
// a pesquisa filtra, "Receber" abre ali o painel, a receção total tira a PO da lista e a pendente aparece com aviso.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  preencher(d, FINANCEIRO); A.emitir(d.id); A.validar(d.id);
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
    expect(within(lista()).getAllByText(/Pendente · não confirmada ao fornecedor/).length).toBeGreaterThan(0);
    fireEvent.change(within(lista()).getByRole("searchbox", { name: /Pesquisar/ }), { target: { value: "Tiago" } });
    const linhas = within(lista()).getAllByRole("button", { name: /^Receber PO-/ }).map((b) => b.getAttribute("aria-label")!.replace("Receber ", ""));
    expect(linhas.sort()).toEqual([...ids].sort());
  });

  it("Receber abre o painel ali; receber tudo tira a PO da lista e volta à lista", () => {
    const [id] = pagarTiago();
    render(<InventarioPagina aba="guia" />);
    fireEvent.click(within(lista()).getByRole("button", { name: `Receber ${id}` }));
    const painel = screen.getByRole("region", { name: `Encomenda ${id}` });
    expect(within(painel).getByText(/ainda está pendente/)).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Receber tudo o que falta" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Confirmar receção" }));
    const po = lerInventario().pos.find((p) => p.id === id)!;
    expect(poRecebivel(po)).toBe(false);
    expect(screen.queryByRole("region", { name: `Encomenda ${id}` })).toBeNull();
    expect(within(lista()).queryByText(id)).toBeNull();
  });
});
