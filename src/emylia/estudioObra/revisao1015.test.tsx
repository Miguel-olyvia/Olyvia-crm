// 23/11: a revisão no 1015 (testarh) do que ainda não tinha sido visto: o diário com o anular e refazer, o cliente antes do 1.º trabalho,
// o fecho e a equipa com o nome curto.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { pontosEncerrar } from "../encerrarObra";
import { comecoParaCliente, historicoDaObra, progressoDaObra } from "../obraCliente";
import { obraDeExemplo } from "./exemploObra";
import { juntarPassos } from "./previsaoObra";

afterEach(cleanup);
const e = (t: string) => ({ t, k: "marco", q: "hoje", quem: "Filipe" });

describe("revisão no 1015", () => {
  it("diário: cada sequência de anular e refazer fica numa só linha", () => {
    const L = [e("Ligação: A só começa quando B acabar"), e("Anulado: X"), e("Refeito: X"), e("Anulado: X"), e("Refeito: X"), e("Anulado: Y"), e("Refeito: Y"), e("Obra: registo")];
    const R = juntarPassos(L).map((x) => x.t);
    expect(R).toEqual(["Ligação: A só começa quando B acabar", "3 mudanças anuladas e refeitas no plano (ficou igual)", "Obra: registo"]);
    expect(juntarPassos([e("Anulado: nota em Pintura: TESTE")]).map((x) => x.t)).toEqual(["Anulado: nota em Pintura: TESTE"]);
    expect(juntarPassos([e("Anulado: X"), e("Anulado: Y")]).map((x) => x.t)).toEqual(["2 anuladas no plano"]);
  });
  it("cliente: antes do 1.º trabalho a obra «começa» nesse dia (o arranque administrativo fica para dentro)", () => {
    const { d } = obraDeExemplo(), p = d.obra.plano!;
    // o arranque administrativo foi hoje, mas o 1.º trabalho é daqui a 3 dias úteis e ninguém registou nada
    p.estado = "em curso";
    const hoje = new Date();
    for (const t of p.tasks) { delete t.exec; t.dia += 3; }
    p.dia = 0;
    p.inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    d.hist.unshift({ t: "Obra arrancou", q: "hoje", k: "a" });
    const c = comecoParaCliente(p, hoje);
    expect(c.comecou).toBe(false);
    const P = progressoDaObra(d, hoje)!;
    expect(P.comecou).toBe(false);
    expect(historicoDaObra(d, hoje).some((m) => m.k === "inicio")).toBe(false);
  });
  it("fecho: as tarefas que faltam com o nome curto", () => {
    const { d } = obraDeExemplo(), p = d.obra.plano!;
    p.tasks[p.tasks.length - 1].nome = "MO Modelo Remodelação Completa - Casa de Banho Comum · demolição e remoção";
    delete p.tasks[p.tasks.length - 1].exec;
    const t = pontosEncerrar(d).find((x) => /tarefas/.test(x.t))!;
    expect(t.sub).not.toMatch(/MO Modelo/);
  });
});

// a equipa: o nome curto e sem «Por começar» em cada tarefa (o teste do ecrã)
import type { Ctx } from "../pecas";
import { acoes } from "../motor";
import { EquipaDaObra } from "./PaineisObra";
import { diasDaObra } from "../planoObra";
import { inicioDoPlano } from "../preparacaoObra";
describe("equipa", () => {
  it("as tarefas de cada pessoa com o nome curto e sem «Por começar»", () => {
    const x = obraDeExemplo(), p = x.d.obra.plano!;
    const ti = p.tasks.findIndex((t) => !t.exec);
    p.tasks[ti].nome = "MO Modelo Remodelação Completa - Cozinha · montagem de móveis";
    const ctx = { S: x.S, A: acoes(x.S, () => {}, (fn) => fn()), run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EquipaDaObra ctx={ctx} d={x.d} abrir={() => {}} abrirOutra={() => {}} novaPara={() => {}} dias={diasDaObra(inicioDoPlano(p)!, 30)} />);
    const corpo = document.body.textContent ?? "";
    expect(corpo).not.toMatch(/MO Modelo/);
    expect(within(document.body).queryAllByText("Por começar")).toHaveLength(0);
    void screen;
  });
});
