import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, eur, seed, type Estado } from "./motor";
import { NegociosV2 } from "./NegociosV2";
import { cartoesV2 } from "./negociosDocs";

afterEach(cleanup);

function pagina(S: Estado, q = "") {
  const run = (fn: () => void) => fn();
  return render(<NegociosV2 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q={q} setQ={vi.fn()} repor={vi.fn()} />);
}
/** Os cartões desenhados nas quatro colunas do computador (a coluna do telemóvel repete uma delas, por isso não se conta). */
const desenhados = (c: HTMLElement): HTMLElement[] => [...c.querySelectorAll<HTMLElement>('section[aria-labelledby$="-d"] > ul > li:not([class*="border-dashed"])')];
const eur0 = (x: number): string => eur(x).replace(/,00$/, "");

describe("NegociosV2 · o cabeçalho e os cartões contam o mesmo", () => {
  it("o número a decorrer é o total de cartões (exemplos incluídos) e o valor em proposta é a soma dos cartões em Proposta", () => {
    const S = seed();
    const todos = cartoesV2(S);
    const { container } = pagina(S);
    const proposta = todos.filter((c) => c.doc === "proposta").reduce((a, c) => a + (c.valor ?? 0), 0);
    expect(container.querySelector("header p")).toHaveTextContent(`${todos.length} negócios a decorrer · ${eur0(proposta)} € em proposta`);
    expect(todos.some((c) => c.demo)).toBe(true);
    S.filtro = "todos";
    cleanup();
    expect(desenhados(pagina(S).container)).toHaveLength(todos.length);
  });
  it("o cabeçalho não muda com a pesquisa nem com o filtro", () => {
    const S = seed();
    const total = cartoesV2(S).length;
    S.filtro = "wc";
    const { container } = pagina(S, "Carla");
    expect(desenhados(container).length).toBeLessThan(total);
    expect(container.querySelector("header p")).toHaveTextContent(`${total} negócios a decorrer`);
  });
});

describe("NegociosV2 · o filtro usa o negócio do próprio cartão", () => {
  it("'Com atraso': só o negócio real atrasado, não os exemplos da mesma pessoa (que não têm atraso)", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1031)!.atraso = true; // o negócio real da Carla Nunes
    S.filtro = "atraso";
    const { container } = pagina(S);
    const cartoes = desenhados(container);
    expect(cartoes).toHaveLength(1);
    expect(within(cartoes[0]).getByText("Carla Nunes")).toBeInTheDocument();
    expect(within(cartoes[0]).queryByText("exemplo")).toBeNull();
  });
  it("'Os meus': os cartões de quem é do comercial, exemplos incluídos", () => {
    const S = seed();
    S.filtro = "meus";
    const esperado = cartoesV2(S).filter((c) => c.deal.dono === "comercial").length;
    expect(esperado).toBeGreaterThan(0);
    expect(desenhados(pagina(S).container)).toHaveLength(esperado);
  });
});
