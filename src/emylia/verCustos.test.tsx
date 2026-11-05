// 5/11: quotes.view_costs no orçamento do Negócio. O servidor (fn_neg_ler_orcamento, neg_ler_negocios, fn_neg_ler_adendas) devolve os
// custos a null a quem não a tem por fn_cat_pode; o ecrã deixa de mostrar a margem e o custo (dava 100 % e «Custo 0 €"). As regras e o
// que bloqueia a proposta não mudam: só os valores saem do texto.
import { useReducer } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, alertas, bloqueado, seed, type Estado, type LinhaOrc, type Negocio } from "./motor";
import { LinhasOrcamento } from "./LinhasOrcamento";
import { PlanoObra } from "./PlanoObraOrcamento";
import { OrcamentoSimples } from "./OrcamentoSimples";
import { CODIGO_VER_CUSTOS, SEM_VER_CUSTOS, definirPermissoesReais, definirVerCustos, podeVerCustos } from "./permissoes";

afterEach(() => { cleanup(); definirPermissoesReais(null); definirVerCustos(undefined); });

const semCustos = () => definirPermissoesReais({ codigos: new Set(["negocios.orcamento.editar"]), simular: false });
const comCustos = () => definirPermissoesReais({ codigos: new Set(["negocios.orcamento.editar", CODIGO_VER_CUSTOS]), simular: false });

function Pagina({ S, d, vista }: { S: Estado; d: Negocio; vista: "linhas" | "plano" | "simples" }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn), q: "", setQ: vi.fn() };
  if (vista === "plano") return <PlanoObra ctx={ctx} d={d} />;
  if (vista === "simples") return <OrcamentoSimples {...ctx} d={d} />;
  return <LinhasOrcamento ctx={ctx} d={d} simples />;
}
/** Um orçamento por enviar com serviços e um material abaixo do mínimo. */
const negocio = () => {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.filter((l) => l.t === "svc").length >= 3) as Negocio;
  d.orc!.enviada = null;
  return { S, d };
};

describe("podeVerCustos: a mesma pergunta das RPCs", () => {
  it("na ficha, pelas permissões lidas por fn_cat_pode: com o código vê, sem ele ou a ler não", () => {
    comCustos();
    expect(podeVerCustos()).toBe(true);
    semCustos();
    expect(podeVerCustos()).toBe(false);
    definirPermissoesReais({ codigos: null, simular: false });
    expect(podeVerCustos()).toBe(false);
  });

  it("em /negocios, pela resposta de usePodeVerCustos: a ler (null) ou «não» escondem", () => {
    definirVerCustos(null);
    expect(podeVerCustos()).toBe(false);
    definirVerCustos(false);
    expect(podeVerCustos()).toBe(false);
    definirVerCustos(true);
    expect(podeVerCustos()).toBe(true);
  });

  it("sem conta real (o protótipo e os testes) vê, como até aqui", () => {
    expect(podeVerCustos()).toBe(true);
  });
});

describe("o orçamento sem quotes.view_costs", () => {
  it("as linhas: sem a margem por linha e sem o filtro da margem; com a permissão fica tudo igual", () => {
    const { S, d } = negocio();
    comCustos();
    const { unmount } = render(<Pagina S={S} d={d} vista="linhas" />);
    expect(screen.getAllByText(/^margem \d/).length).toBeGreaterThan(0);
    unmount();
    semCustos();
    render(<Pagina S={S} d={d} vista="linhas" />);
    expect(screen.queryAllByText(/^margem \d/)).toHaveLength(0);
    expect(screen.queryByTitle(/^custo /)).toBeNull();
    expect(screen.queryByRole("button", { name: /Margem abaixo do mínimo/ })).toBeNull();
  });

  it("o plano da obra: sem custo nem margem nas fases e sem a curva do custo", () => {
    const { S, d } = negocio();
    comCustos();
    const { unmount } = render(<Pagina S={S} d={d} vista="plano" />);
    expect(screen.getByText(/Custo acumulado/)).toBeTruthy();
    expect(screen.getAllByText(/margem \d/).length).toBeGreaterThan(0);
    unmount();
    semCustos();
    render(<Pagina S={S} d={d} vista="plano" />);
    expect(screen.queryByText(/Custo acumulado/)).toBeNull();
    expect(screen.queryAllByText(/margem \d/)).toHaveLength(0);
    expect(screen.queryAllByText(/· custo /)).toHaveLength(0);
  });

  it("o total: fica só o total e a frase da permissão, sem margem, custo nem «De onde vem o custo»", () => {
    const { S, d } = negocio();
    comCustos();
    const { unmount } = render(<Pagina S={S} d={d} vista="simples" />);
    expect(screen.getByText(/lucro previsto/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /De onde vem o custo/ })).toBeTruthy();
    expect(screen.queryByText(SEM_VER_CUSTOS)).toBeNull();
    unmount();
    semCustos();
    render(<Pagina S={S} d={d} vista="simples" />);
    expect(screen.getByText("Total sem IVA")).toBeTruthy();
    expect(screen.getByText(SEM_VER_CUSTOS)).toBeTruthy();
    expect(screen.queryByText(/lucro previsto/)).toBeNull();
    expect(screen.queryByRole("button", { name: /De onde vem o custo/ })).toBeNull();
  });

  it("os bloqueios: o mesmo que bloqueia, sem os valores do custo nem da margem no texto", () => {
    const { S, d } = negocio();
    const { sid } = d.orc!.linhas.find((l): l is Extract<LinhaOrc, { t: "svc" }> => l.t === "svc")!;
    d.orc!.linhas = [
      { t: "svc", sid, q: 2, cu: 50, pu: 20 },
      { t: "svc", sid, q: 1, cu: 50, pu: 55 },
      { t: "mat", d: "Pedra", custo: 100, preco: 90 },
    ];
    d.orc!.precosMan = { Pedra: 90 };
    delete d.orc!.demolicao;
    d.orc!.desconto = 5;
    comCustos();
    const com = alertas(d, S), bloqCom = bloqueado(d, S);
    semCustos();
    const sem = alertas(d, S), bloqSem = bloqueado(d, S);
    expect(bloqSem).toBe(bloqCom);
    expect(sem.map((a) => [a.k, a.aprov, a.i, a.sug])).toEqual(com.map((a) => [a.k, a.aprov, a.i, a.sug]));
    expect(com.some((a) => /custo \d|Margem \d|margem em \d|Margem total de \d/.test(`${a.t} ${a.d}`))).toBe(true);
    for (const a of sem) expect(`${a.t} ${a.d}`).not.toMatch(/custo \d|Margem \d|margem em \d|Margem total de \d|\d+% de margem/);
  });
});
