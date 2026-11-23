// 23/11 (Rúben: «adicionar também botões de undo e voltar para a frente para todas as alterações feitas»).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { passoEntre, retratoDe } from "./passosObra";

afterEach(cleanup);
const quando = (k: number) => `dia ${k + 1}`;

/** A obra de exemplo com a montagem a começar ao mesmo tempo que o revestimento (há uma ligação para pôr). */
function obra() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis"), rev = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
  p.tasks[mont].dia = p.tasks[rev].dia + 1;
  return { ...x, p, mont, rev, A: acoes(x.S, () => {}, (fn) => fn()) };
}

describe("os passos do Estúdio da obra", () => {
  it("uma mudança ao plano é um passo que se anula, com o que mudou escrito", () => {
    const { d, p, mont, A } = obra();
    const a = retratoDe(d)!;
    A.ajustarTarefa(d.id, mont, { nota: "levar o andaime" });
    const ps = passoEntre(d, a, retratoDe(d)!, quando)!;
    expect(ps.pode).toBe(true);
    expect(ps.antes.tasks[mont].nota).toBeUndefined();
    expect(ps.depois.tasks[mont].nota).toBe("levar o andaime");
    void p;
  });
  it("com o aviso ao cliente, a ligação fica na lista mas não se anula (o cliente já viu)", () => {
    const { d, mont, rev, A } = obra();
    const a = retratoDe(d)!;
    A.ligarTarefas(d.id, mont, rev, true, { cliente: true });
    const ps = passoEntre(d, a, retratoDe(d)!, quando)!;
    if (d.obra.alteracoes![0].avisoCliente) { expect(ps.pode).toBe(false); expect(ps.porque).toMatch(/cliente/); }
    else expect(ps.pode).toBe(true);
  });
  it("o que já saiu (a validação de uma tarefa) fica na lista mas não se anula, e diz porquê", () => {
    const { d, p, A } = obra();
    const ti = p.tasks.findIndex((t) => t.exec?.estado === "feita");
    const a = retratoDe(d)!;
    A.validarTarefa(d.id, ti);
    const ps = passoEntre(d, a, retratoDe(d)!, quando)!;
    expect(ps.pode).toBe(false);
    expect(ps.porque).toMatch(/execução/);
  });
  it("o motor repõe o plano (sem tocar na execução) e regista «Anulado» no histórico e no diário", () => {
    const { d, p, mont, rev, A } = obra();
    const a = retratoDe(d)!;
    A.ligarTarefas(d.id, mont, rev, true);
    expect(p.tasks[mont].deps).toEqual([rev]);
    const execAntes = JSON.stringify(p.tasks.map((t) => t.exec ?? null));
    expect(A.reporPlanoObra(d.id, a.plano, "Ligação de teste", "anular")).toBe(true);
    expect(p.tasks[mont].deps).toBeUndefined();
    expect(JSON.stringify(p.tasks.map((t) => t.exec ?? null))).toBe(execAntes);
    expect(d.hist[0].t).toBe("Plano: Anulado: Ligação de teste");
    expect(d.obra.diario!.at(-1)!.t).toBe("Anulado: Ligação de teste");
  });
  it("no Estúdio: ligar, ↶ anula, ↷ refaz; o botão diz o que vai fazer", () => {
    const x = obra();
    const ctx = { S: x.S, A: x.A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
    const grupo = screen.getByRole("group", { name: "Anular e refazer" });
    expect(within(grupo).getByRole("button", { name: /^Nada para anular/ })).toHaveProperty("disabled", true);
    // pôr a ligação pelo painel da tarefa
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${x.p.tasks[x.mont].nome}:`) })[0]);
    const sec = screen.getByRole("region", { name: "As ligações da tarefa" });
    fireEvent.click(within(sec).getByRole("button", { name: /Depende de…/ }));
    fireEvent.click(within(within(sec).getByRole("group", { name: "Depende de" })).getByTitle(x.p.tasks[x.rev].nome));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    // sem avisar o cliente (o aviso sai da obra e já não se anularia)
    const aviso = within(previa).queryByRole("checkbox", { name: /Avisar o cliente/ }) as HTMLInputElement | null;
    if (aviso?.checked) fireEvent.click(aviso);
    fireEvent.click(within(previa).getByRole("button", { name: /Ligar e aplicar/ }));
    expect(x.p.tasks[x.mont].deps).toEqual([x.rev]);
    const anular = within(grupo).getByRole("button", { name: /^Anular: Ligação: / });
    fireEvent.click(anular);
    expect(x.p.tasks[x.mont].deps).toBeUndefined();
    fireEvent.click(within(grupo).getByRole("button", { name: /^Refazer: Ligação: / }));
    expect(x.p.tasks[x.mont].deps).toEqual([x.rev]);
    // e a lista dos passos
    fireEvent.click(within(grupo).getByRole("button", { name: /Os passos \(1\)/ }));
    expect(within(screen.getByRole("dialog", { name: "Os passos" })).getByText(/Ligação: /)).toBeTruthy();
  });
});
