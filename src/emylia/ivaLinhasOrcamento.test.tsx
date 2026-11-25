// 24/11/2026 (MD 1594 e MD 1600): no ecrã das linhas do orçamento, o IVA de cada produto escolhe-se na linha (23%, 6% ou 0%) e o
// orçamento todo muda de uma vez («Pôr todas a 6%», «Pôr todas a 0% (autoliquidação)», «Repor o IVA de cada linha»).
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, ivaDaLinha, seed, totaisIva, type Estado, type LinhaOrc, type Negocio, type SvcId } from "./motor";
import { LinhasOrcamento } from "./LinhasOrcamento";

afterEach(cleanup);

function Pagina({ S, d }: { S: Estado; d: Negocio }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn) };
  return <LinhasOrcamento ctx={ctx} d={d} simples />;
}
const montar = () => {
  const S = seed();
  const d = S.deals.find((x) => x.orc) as Negocio;
  d.orc!.enviada = null;
  const sid = Object.keys(S.svc)[0] as SvcId;
  const linhas: LinhaOrc[] = [{ t: "svc", sid, q: 1, cu: 10, pu: 100 }, { t: "mat", d: "Base de duche Teste", custo: 50, preco: 200 }];
  d.orc!.linhas = linhas;
  delete d.orc!.demolicao;
  render(<Pagina S={S} d={d} />);
  return { S, d };
};

describe("o IVA no ecrã das linhas", () => {
  it("o produto tem a escolha do IVA na linha: 23% de início, muda para 6% e o total acompanha", () => {
    const { S, d } = montar();
    const sel = screen.getByRole("combobox", { name: "IVA de Base de duche Teste" }) as HTMLSelectElement;
    expect(sel.value).toBe("23");
    expect([...sel.options].map((o) => o.value)).toEqual(["0", "6", "23"]);
    fireEvent.change(sel, { target: { value: "6" } });
    expect(ivaDaLinha(d.orc!.linhas[1], S)).toBe(6);
    expect(totaisIva(d, S).total).toBeCloseTo(300 * 1.06, 6);
    expect((screen.getByRole("combobox", { name: "IVA de Base de duche Teste" }) as HTMLSelectElement).value).toBe("6");
    // fugiu à de sempre: aparece o repor
    fireEvent.click(screen.getByRole("button", { name: "Repor o IVA de cada linha" }));
    expect(ivaDaLinha(d.orc!.linhas[1], S)).toBe(23);
    expect(screen.queryByRole("button", { name: "Repor o IVA de cada linha" })).toBeNull();
  });

  it("«Pôr todas a 6%» e «Pôr todas a 0% (autoliquidação)» mudam o orçamento todo, e dizem como ficou", () => {
    const { S, d } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Pôr todas a 6%" }));
    expect(d.orc!.linhas.every((l) => ivaDaLinha(l, S) === 6)).toBe(true);
    expect(screen.getByText("Todas as linhas com IVA a 6%.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pôr todas a 6%" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pôr todas a 0% (autoliquidação)" }));
    expect(totaisIva(d, S).iva).toBe(0);
    expect(screen.getByText("Todas as linhas com IVA a 0% (autoliquidação).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Repor o IVA de cada linha" }));
    expect(ivaDaLinha(d.orc!.linhas[0], S)).toBe(6);
    expect(ivaDaLinha(d.orc!.linhas[1], S)).toBe(23);
  });

  it("com a proposta enviada não há escolha nem atalhos", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc) as Negocio;
    d.orc!.enviada = "hoje";
    render(<Pagina S={S} d={d} />);
    expect(screen.queryByRole("combobox", { name: /^IVA de / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pôr todas a/ })).toBeNull();
  });
});
