// Encerrar a obra só com tudo completo (21/10/2026).
import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";
import { OBRA, emFalta } from "./campos";
import { completarParaEncerrar, faltaParaEncerrar, pontosEncerrar } from "./encerrarObra";

function obraEmCurso() {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  d.fase = 5; d.obra.plano!.estado = "em curso";
  for (const c of emFalta(OBRA, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Sim" : c.t === "data" ? "2026-10-20" : "x";
  return { S, A, d };
}

describe("encerrar a obra", () => {
  it("com tarefas por fazer, o motor recusa e a obra continua em curso", () => {
    const { S, A, d } = obraEmCurso();
    expect(faltaParaEncerrar(d, S)).toContain("todas as tarefas feitas");
    A.fimObra(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });
  it("uma tarefa feita mas por validar, ou a corrigir, também bloqueia", () => {
    const { S, A, d } = obraEmCurso();
    completarParaEncerrar(d);
    d.obra.plano!.tasks[0].exec!.estado = "feita";
    expect(faltaParaEncerrar(d, S)).toEqual(["tudo validado pelo responsável"]);
    d.obra.plano!.tasks[0].exec!.estado = "corrigir";
    expect(faltaParaEncerrar(d, S)).toEqual(["sem correções por fazer"]);
    A.fimObra(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });
  it("uma mensagem do cliente por responder bloqueia", () => {
    const { S, d } = obraEmCurso();
    completarParaEncerrar(d);
    (d.obra.chat ??= []).push({ de: "cliente", quem: d.nome, t: "Já acabaram?", q: "agora", lida: false });
    expect(faltaParaEncerrar(d, S)).toEqual(["mensagens do cliente respondidas"]);
  });
  it("uma adenda por assinar bloqueia", () => {
    const { S, d } = obraEmCurso();
    completarParaEncerrar(d);
    (d.adendas ??= []).push({ n: "AD 2026/1027-1", estado: "enviada", criada: "agora", motivo: "x", linhas: [] } as never);
    expect(faltaParaEncerrar(d, S)).toEqual(["adendas respondidas pelo cliente"]);
  });
  it("com tudo completo, a lista fica verde e a obra encerra", () => {
    const { S, A, d } = obraEmCurso();
    completarParaEncerrar(d);
    expect(pontosEncerrar(d, S).every((x) => x.ok)).toBe(true);
    A.fimObra(d.id);
    expect(d.obra.plano!.estado).toBe("concluída");
  });
});
