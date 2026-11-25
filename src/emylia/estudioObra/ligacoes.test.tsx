// 23/11 (Rúben: «falta permitir criar dependências com click and drag, e nos detalhes laterais também, e ter isso visual»).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { antecessoras, comLigacao, ligacoesDaTarefa, ligacoesDoPlano, porqueNaoLigar, replanear } from "./planoVivo";
import { caminhoCritico } from "./previsaoObra";

afterEach(cleanup);

/** Duas tarefas por começar: a primeira (pelo dia) e uma que começa antes de a outra acabar. */
function par() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  // a montagem começa depois do pavimento; liga-se o revestimento (atrasado) à montagem, que deixa de poder começar antes dele acabar
  const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis"), rev = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
  // a montagem passa a começar ao mesmo tempo que o revestimento: pelas datas, não espera por ele (há uma ligação para pôr)
  p.tasks[mont].dia = p.tasks[rev].dia + 1;
  return { ...x, p, mont, rev };
}

describe("as ligações entre tarefas", () => {
  it("o plano já traz as ligações pelas datas (as diretas para desenhar)", () => {
    const { p } = par();
    const L = ligacoesDoPlano(p.tasks);
    expect(L.length).toBeGreaterThan(0);
    expect(L.every((x) => !x.mao)).toBe(true);
    for (const x of L) expect(antecessoras(p.tasks, x.para)).toContain(x.de);
  });
  it("ligar à mão: a tarefa espera que a outra acabe; o replanear e o caminho crítico respeitam-no", () => {
    const { S, d, p, mont } = par();
    // uma tarefa que acaba depois de a montagem começar (a última por dia, que não seja a montagem)
    const { rev: outra } = par();
    expect(porqueNaoLigar(p, mont, outra)).toBeNull();
    const c = comLigacao(p, mont, outra, true);
    expect(c.tasks[mont].deps).toEqual([outra]);
    expect(p.tasks[mont].deps).toBeUndefined(); // a cópia: o plano não muda
    const R = replanear(c, ocupacaoDosTecnicos(S, d.id), { adiantar: false });
    const novo = R.plano.tasks[mont], fimOutra = R.plano.tasks[outra].dia + R.plano.tasks[outra].dur;
    expect(novo.dia).toBeGreaterThanOrEqual(fimOutra);
    expect(caminhoCritico(R.plano).size).toBeGreaterThan(0);
  });
  it("não deixa fazer ciclos, repetir, nem ligar uma tarefa a si própria", () => {
    const { p, mont } = par();
    const antes = antecessoras(p.tasks, mont)[0];
    expect(porqueNaoLigar(p, mont, mont)).toMatch(/si própria/);
    expect(porqueNaoLigar(p, mont, antes)).toMatch(/já depende/);
    expect(porqueNaoLigar(p, antes, mont)).toMatch(/ciclo|começou/);
  });
  it("tirar uma ligação pelas datas fica guardado (semDeps) e deixa de se desenhar", () => {
    const { p, mont } = par();
    const antes = ligacoesDaTarefa(p.tasks, mont).depende[0].de;
    const c = comLigacao(p, mont, antes, false);
    expect(c.tasks[mont].semDeps).toContain(antes);
    expect(antecessoras(c.tasks, mont)).not.toContain(antes);
    expect(ligacoesDaTarefa(c.tasks, mont).depende.some((x) => x.de === antes)).toBe(false);
  });
  it("o motor liga, replaneia e regista no diário e no histórico; tirar volta ao que estava", () => {
    const { S, d, p, mont, rev: outra } = par();
    const A = acoes(S, () => {}, (fn) => fn());
    expect(A.ligarTarefas(d.id, mont, outra, true, { motivo: "Teste" })).toBe(true);
    expect(p.tasks[mont].deps).toEqual([outra]);
    expect(d.obra.diario!.some((e) => /Ligação: /.test(e.t))).toBe(true);
    expect(d.hist.some((e) => /Plano: Ligação/.test(e.t))).toBe(true);
    expect(A.ligarTarefas(d.id, mont, outra, false)).toBe(true);
    expect(p.tasks[mont].deps).toBeUndefined();
    expect(A.ligarTarefas(d.id, mont, mont, true)).toBe(false);
  });
});

describe("no Estúdio da obra", () => {
  it("o painel da tarefa mostra as ligações, com o mini-diagrama, para tirar e para juntar", () => {
    const x = obraDeExemplo();
    const A = acoes(x.S, () => {}, (fn) => fn());
    const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
    const p = x.d.obra.plano!, mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis");
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${p.tasks[mont].nome}:`) })[0]);
    const sec = screen.getByRole("region", { name: "As ligações da tarefa" });
    expect(within(sec).getByRole("img", { name: /depende de \d/ })).toBeTruthy();
    expect(within(sec).getAllByRole("button", { name: /^Tirar a ligação com / }).length).toBeGreaterThan(0);
    fireEvent.click(within(sec).getByRole("button", { name: /Depende de…/ }));
    expect(within(sec).getByRole("group", { name: "Depende de" })).toBeTruthy();
    // tirar abre a pré-visualização (não aplica sozinho)
    fireEvent.click(within(sec).getAllByRole("button", { name: /^Tirar a ligação com / })[0]);
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    expect(within(previa).getByText(/^Tirar a ligação: /)).toBeTruthy();
    expect(within(previa).getByRole("button", { name: /Tirar e aplicar/ })).toBeTruthy();
  });
});
