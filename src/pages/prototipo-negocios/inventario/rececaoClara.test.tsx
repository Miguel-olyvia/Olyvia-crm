// A receção do armazém mais clara (16/10): agrupada por cliente/obra, chips com contagens, filtro de cliente, "Receber tudo" em fila,
// "Abrir Receção" do negócio já filtrada e "Receber no armazém →" na lista de encomendas a fornecedor.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acoes, seed } from "../motor";
import { FINANCEIRO, emFalta, type Grupo } from "../campos";
import type { AbaInv } from "./ctxInv";
import { blocosRec, contagensRec, porReceber } from "./EncomendasPorReceber";
import InventarioPagina from "./InventarioPagina";
import { esquecerInventario, lerInventario, lerPedidoRececaoInv } from "./loja";
import { esquecerPerfil } from "./perfil";
import { poRecebivel } from "./po";

const REF = "CT 2026/1027";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
function pagarTiago() {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  preencher(d, FINANCEIRO); A.emitir(d.id); A.validar(d.id);
  return { S, A, ids: lerInventario().pos.filter((p) => p.originKey === REF).map((p) => p.id) };
}
function Casa({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <InventarioPagina aba={aba} aoMudarAba={setAba} />;
}
const lista = (): HTMLElement => screen.getByRole("region", { name: /Encomendas por receber/ });
const blocoTiago = (): HTMLElement => within(lista()).getByRole("group", { name: /Tiago Almeida · CT 2026\/1027/ });

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Receção agrupada por cliente/obra", () => {
  it("o bloco do Tiago tem as 2 POs; os chips contam; o filtro de cliente só deixa o Tiago; o Stock fica no fim", () => {
    const { ids } = pagarTiago();
    expect(ids).toHaveLength(2);
    const db = lerInventario();
    const B = blocosRec(porReceber(db, {}));
    const t = B.find((b) => b.chave === REF)!;
    expect(t.pos.map((p) => p.id).sort()).toEqual([...ids].sort());
    expect(t.titulo).toMatch(/Tiago Almeida · CT 2026\/1027/);
    expect(B[B.length - 1].titulo).toBe("Stock");
    const n = contagensRec(db, {});
    expect(n.todas).toBe(db.pos.filter(poRecebivel).length);
    expect(n.clientes + n.stock).toBe(n.todas);
    expect(n.pendentes).toBeGreaterThanOrEqual(2);
    expect(porReceber(db, { cli: REF }).map((p) => p.id).sort()).toEqual([...ids].sort());
    render(<Casa inicio="guia" />);
    expect(within(blocoTiago()).getByText(/falta \d+ un · 2 encomendas/)).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /^Pendentes/ })).toHaveTextContent(String(n.pendentes));
    fireEvent.change(within(lista()).getByRole("combobox", { name: /Cliente\/obra/ }), { target: { value: REF } });
    expect(within(lista()).getAllByRole("group").filter((g) => g.getAttribute("aria-label") !== "Ver")).toHaveLength(1);
  });

  it("\"Receber tudo\" abre a 1.ª PO do bloco e, ao receber tudo, passa à seguinte até acabar", () => {
    const { ids } = pagarTiago();
    render(<Casa inicio="guia" />);
    fireEvent.click(within(blocoTiago()).getByRole("button", { name: /^Receber tudo/ }));
    for (let k = 0; k < ids.length; k++) {
      const painel = screen.getByRole("region", { name: /^Encomenda PO-/ });
      fireEvent.click(within(painel).getByRole("button", { name: "Receber tudo o que falta" }));
      fireEvent.click(within(painel).getByRole("button", { name: "Confirmar receção" }));
    }
    expect(ids.every((id) => !poRecebivel(lerInventario().pos.find((p) => p.id === id)!))).toBe(true);
    expect(screen.queryByRole("region", { name: /^Encomenda PO-/ })).toBeNull();
    expect(within(lista()).queryByRole("group", { name: /Tiago Almeida/ })).toBeNull();
  });

  it("o negócio abre a Receção já filtrada pelo cliente (\"Abrir Receção\")", () => {
    const { S, A } = pagarTiago();
    A.abrirRececao(1027);
    expect(S.view).toBe("inventario");
    expect(lerPedidoRececaoInv()).toBe(REF);
    render(<Casa inicio="guia" />);
    expect(within(lista()).getByRole("combobox", { name: /Cliente\/obra/ })).toHaveValue(REF);
    expect(blocoTiago()).toBeInTheDocument();
  });

  it("\"Receber no armazém →\" na lista de encomendas leva à Receção com a PO", () => {
    const { ids } = pagarTiago();
    render(<Casa inicio="po" />);
    expect(screen.getByText(/As encomendas a fornecedor recebem-se em Armazém › Receção/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Receber no armazém/ })[0]);
    const id = lerInventario().rc.poFilter;
    expect(id).toMatch(/^PO-/);
    expect(screen.getByRole("region", { name: `Encomenda ${id}` })).toBeInTheDocument();
    void ids;
  });
});
