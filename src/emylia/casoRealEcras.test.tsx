// 26/10: os ecrãs novos do caso real P-2026-0109, como a pessoa os usa: a linha livre no orçamento, as prestações à medida e
// o produto vendido sem a instalação, na visita.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, ivaDaLinha, seed, type Estado, type Negocio } from "./motor";
import { LinhaLivre } from "./LinhaLivre";
import { PrestacoesMedida } from "./PrestacoesMedida";
import { ProdutosVisita } from "./NecessidadesVisita";
import { PAGAMENTO_MEDIDA, prestacoes } from "./planoObra";
import { ligarCatalogo, servicosTrazidos } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";
import type { Ctx } from "./pecas";

afterEach(cleanup);
const K = catalogo0();
beforeEach(() => { localStorage.clear(); ligarCatalogo(() => K); });

function useCtx(S: Estado): Ctx {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  return { S, A: acoes(S, vi.fn(), run), run, go: (fn) => () => run(fn), q: "" };
}
/** Um orçamento por enviar (o 1031 da demonstração, reaberto). */
function orcamento() {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1031)!;
  d.orc!.enviada = null;
  return { S, d };
}
const escrever = (rotulo: string, v: string) => fireEvent.change(screen.getByLabelText(rotulo, { exact: false }), { target: { value: v } });

describe("linha livre no orçamento", () => {
  function Pagina({ S, d }: { S: Estado; d: Negocio }) { return <LinhaLivre ctx={useCtx(S)} d={d} />; }

  it("abre o formulário, junta a linha a 6% e fecha", () => {
    const { S, d } = orcamento();
    const n = d.orc!.linhas.length;
    render(<Pagina S={S} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Juntar uma linha livre" }));
    escrever("Descrição", "Taxa de Serviço de Consultoria");
    escrever("Preço por unidade", "1216,87");
    fireEvent.click(screen.getByRole("button", { name: "6% · mão de obra ou serviço" }));
    expect(screen.getByRole("button", { name: "6% · mão de obra ou serviço" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Juntar ao orçamento" }));
    expect(d.orc!.linhas.length).toBe(n + 1);
    const l = d.orc!.linhas.at(-1)!;
    expect(l).toMatchObject({ t: "mat", d: "Taxa de Serviço de Consultoria", preco: 1216.87, livre: { q: 1, un: "un", pu: 1216.87 } });
    expect(ivaDaLinha(l, S)).toBe(6);
    expect(screen.getByRole("button", { name: "Juntar uma linha livre" })).toBeTruthy();
  });
  it("mostra o erro sem descrição e com a quantidade a 0, e não junta", () => {
    const { S, d } = orcamento();
    const n = d.orc!.linhas.length;
    render(<Pagina S={S} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Juntar uma linha livre" }));
    fireEvent.click(screen.getByRole("button", { name: "Juntar ao orçamento" }));
    expect(screen.getByRole("alert").textContent).toBe("Escreva a descrição.");
    escrever("Descrição", "Material Elétrico");
    escrever("Quantidade", "0");
    fireEvent.click(screen.getByRole("button", { name: "Juntar ao orçamento" }));
    expect(screen.getByRole("alert").textContent).toBe("A quantidade tem de ser maior do que zero.");
    expect(d.orc!.linhas.length).toBe(n);
  });
  it("não aparece com a proposta enviada", () => {
    const { S, d } = orcamento();
    d.orc!.enviada = "2026-10-10" as never;
    render(<Pagina S={S} d={d} />);
    expect(screen.queryByRole("button", { name: "Juntar uma linha livre" })).toBeNull();
  });
});

describe("prestações à medida", () => {
  function Pagina({ S, d }: { S: Estado; d: Negocio }) {
    return <PrestacoesMedida ctx={useCtx(S)} d={d} prest={[{ l: "Adjudicação", p: 0.5, fase: 0 }, { l: "Fim de obra", p: 0.5, fase: "fim" }]} />;
  }
  const linhas = () => within(screen.getByRole("region", { name: "Prestações à medida" }));

  it("junta uma prestação, mostra a soma e guarda só quando dá 100%", () => {
    const { S, d } = orcamento();
    render(<Pagina S={S} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Juntar uma prestação" }));
    const pcts = linhas().getAllByLabelText("%", { exact: false });
    const textos = linhas().getAllByLabelText("Quando");
    expect(pcts).toHaveLength(3);
    fireEvent.change(textos[2], { target: { value: "Na retificação das medidas da cozinha" } });
    fireEvent.change(pcts[2], { target: { value: "10" } });
    expect(screen.getByText("Soma: 110%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar as prestações" }));
    expect(screen.getByRole("alert").textContent).toBe("As prestações somam 110%: têm de somar 100%.");
    expect(d.f.pagamento).not.toBe(PAGAMENTO_MEDIDA);
    fireEvent.change(pcts[1], { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar as prestações" }));
    expect(screen.getByText("Prestações guardadas.")).toBeTruthy();
    expect(d.f.pagamento).toBe(PAGAMENTO_MEDIDA);
    expect(prestacoes(d.f.pagamento, d.orc!.pagFases).map((x) => [x.l, Math.round(x.p * 100), x.fase])).toEqual([
      ["Adjudicação", 50, 0], ["Fim de obra", 40, "fim"], ["Na retificação das medidas da cozinha", 10, "fim"],
    ]);
  });
  it("tira uma prestação, mas nunca a última", () => {
    const { S, d } = orcamento();
    render(<Pagina S={S} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar a prestação 2" }));
    expect(linhas().getAllByLabelText("%", { exact: false })).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Tirar a prestação 1" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("produto sem a instalação, na visita", () => {
  function Pagina({ S, d }: { S: Estado; d: Negocio }) { return <ProdutosVisita {...useCtx(S)} d={d} />; }

  it("a caixa tira o serviço que o produto traz, e volta a pô-lo", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1035)!; // na visita, por fechar
    d.visita.fechada = false;
    const p = K.produtos.find((x) => x.servico && x.pvp)!;
    acoes(S, () => {}, (fn) => fn()).produto(d.id, p, 2);
    const naVisita = d.visita.prod!.find((x) => x.id === p.id)!;
    expect(naVisita.svc).toBeTruthy();
    render(<Pagina S={S} d={d} />);
    const caixa = screen.getByRole("checkbox", { name: /sem a instalação/ });
    expect(screen.getByText(/Inclui a instalação/)).toBeTruthy();
    fireEvent.click(caixa);
    expect(d.visita.prod!.find((x) => x.id === p.id)!.semSvc).toBe(true);
    expect(servicosTrazidos(d.visita.prod!)[naVisita.svc!]).toBeUndefined();
    expect(screen.queryByText(/Inclui a instalação/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /sem a instalação/ }));
    expect(d.visita.prod!.find((x) => x.id === p.id)!.semSvc).toBeUndefined();
  });
});
