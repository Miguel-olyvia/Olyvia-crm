// Os ajustes das Operações ao plano da obra (15/10/2026) e o ciclo da tarefa na obra (técnico → fotografia → supervisor).
import { describe, expect, it } from "vitest";
import { acoes, conflitos, seed, type Estado, type Negocio } from "./motor";
import { diferencas, encadearFases, fimDe, inicioMinimo } from "./ajustesPlano";
import { equipaDaObra, equipamentosDaObra, faltaParaFeita, materiaisPorFase, porValidar, seguranca, tarefasDoDia } from "./obraOps";
import { rotuloDia } from "./preparacaoObra";

function preparar(id = 1027) {
  const S: Estado = seed();
  const avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(a.msg + " · " + (a.sub ?? "")), (fn) => fn());
  const d = S.deals.find((x) => x.id === id) as Negocio;
  d.fin.pago = true; // 15/10: o plano só se aprova com o pagamento confirmado (aqui interessam os ajustes)
  return { S, A, d, p: d.obra.plano!, avisos };
}

describe("ajustar o plano (Operações)", () => {
  it("o exemplo do Tiago tem um plano do orçamento por aprovar, por fases", () => {
    const { p } = preparar();
    expect(p.origem).toBe("orcamento");
    expect(p.estado).toBe("por aprovar");
    expect(new Set(p.tasks.map((t) => t.fase)).size).toBeGreaterThan(1);
  });

  it("mais um dia numa tarefa: as seguintes andam, o fim mexe +1 e as horas sobem (8 h por dia a mais)", () => {
    const { A, d, p } = preparar();
    const ti = p.tasks.findIndex((t) => t.fase === 2) >= 0 ? p.tasks.findIndex((t) => t.fase === 2) : 0;
    const fim0 = fimDe(p.tasks), h0 = p.tasks[ti].h, dur0 = p.tasks[ti].dur;
    const depois = p.tasks.map((t, i) => (i !== ti && t.dia >= p.tasks[ti].dia + dur0 ? i : -1)).filter((i) => i >= 0);
    const dias0 = depois.map((i) => p.tasks[i].dia);
    A.ajustarTarefa(d.id, ti, { dur: dur0 + 1 });
    expect(p.tasks[ti].dur).toBe(dur0 + 1);
    expect(fimDe(p.tasks)).toBe(fim0 + 1);
    depois.forEach((i, k) => expect(p.tasks[i].dia).toBe(dias0[k] + 1));
    expect(p.tasks[ti].h).toBeGreaterThanOrEqual(h0);
    expect(diferencas(p).dias).toBe(1);
    expect(p.base).toBeTruthy();
  });

  it("não começa antes do último dia da fase anterior; adiar empurra as fases seguintes; o plano do orçamento já cumpre a regra", () => {
    const { A, d, p } = preparar();
    // o plano que vem do orçamento não se mexe só por se encadear (as fases podem partilhar o dia da passagem)
    const base = JSON.stringify(p.tasks.map((t) => t.dia));
    encadearFases(p);
    expect(JSON.stringify(p.tasks.map((t) => t.dia))).toBe(base);
    const ti = p.tasks.findIndex((t) => (t.fase ?? 0) > 1);
    const min = inicioMinimo(p, ti);
    A.ajustarTarefa(d.id, ti, { dia: min - 5 });
    expect(p.tasks[ti].dia).toBe(min);
    // a primeira tarefa mais 2 dias: nenhuma tarefa de uma fase seguinte começa antes do fim dela
    const t0 = p.tasks.findIndex((t) => t.fase === 1);
    A.ajustarTarefa(d.id, t0, { dur: p.tasks[t0].dur + 2 });
    const fimF1 = fimDe(p.tasks.filter((t) => t.fase === 1));
    p.tasks.filter((t) => (t.fase ?? 0) > 1).forEach((t) => expect(t.dia).toBeGreaterThanOrEqual(fimF1 - 1));
    encadearFases(p); // idempotente
    expect(fimDe(p.tasks.filter((t) => t.fase === 1))).toBe(fimF1);
  });

  it("os dias úteis: o rótulo salta o fim de semana", () => {
    const { p } = preparar();
    p.inicio = "2026-10-23"; // sexta
    expect(rotuloDia(p, 0)).toMatch(/sex/);
    expect(rotuloDia(p, 1)).toMatch(/seg/);
  });

  it("um ajuste pode criar um conflito de férias, que bloqueia a aprovação", () => {
    const { A, d, p } = preparar();
    const ti = p.tasks.findIndex((t) => t.sk === "Ladrilhador");
    A.trocarTec(d.id, ti, "sf"); // Sérgio Faria: férias 21 a 23 de outubro
    p.inicio = "2026-10-19";
    A.ajustarTarefa(d.id, ti, { dia: 2 }); // quarta, 21
    expect(conflitos(p).some((c) => c.t === p.tasks[ti])).toBe(true);
    A.aprovarPlano(d.id);
    expect(p.estado).toBe("por aprovar");
  });

  it("mudar um plano aprovado volta a por aprovar (e avisa); repor volta ao orçamento", () => {
    const { A, d, p, avisos } = preparar();
    A.aprovarPlano(d.id);
    expect(p.estado).toBe("aprovado");
    const base = JSON.stringify(p.tasks.map((t) => [t.dia, t.dur, t.tec]));
    A.ajustarTarefa(d.id, 0, { dur: p.tasks[0].dur + 1 });
    expect(p.estado).toBe("por aprovar");
    expect(avisos.at(-1)).toMatch(/O plano mudou/);
    A.reporPlano(d.id);
    expect(JSON.stringify(p.tasks.map((t) => [t.dia, t.dur, t.tec]))).toBe(base);
    expect(diferencas(p).mexidas).toHaveLength(0);
  });

  it("a nota fica na tarefa e não mexe nas datas", () => {
    const { A, d, p } = preparar();
    const antes = JSON.stringify(p.tasks.map((t) => [t.dia, t.dur]));
    A.ajustarTarefa(d.id, 1, { nota: "  Levar o andaime " });
    expect(p.tasks[1].nota).toBe("Levar o andaime");
    expect(JSON.stringify(p.tasks.map((t) => [t.dia, t.dur]))).toBe(antes);
  });
});

describe("a obra: técnico → fotografia → supervisor", () => {
  it("o exemplo em curso (Marta) tem tarefas validadas, uma por validar e uma em curso, e diário", () => {
    const { p, d } = preparar(1022);
    expect(p.estado).toBe("em curso");
    expect(porValidar(p).length).toBe(1);
    expect(p.tasks.some((t) => t.exec?.estado === "validada")).toBe(true);
    expect(d.obra.diario?.length).toBeGreaterThan(2);
  });

  it("sem horas e sem fotografia não se marca como feita; com elas vai para o supervisor", () => {
    const { A, d, p, avisos } = preparar(1022);
    const ti = tarefasDoDia(p, p.dia).find((i) => p.tasks[i].exec?.estado !== "feita")!;
    A.comecarTarefa(d.id, ti);
    expect(faltaParaFeita(p.tasks[ti])).toEqual(["as horas", "uma fotografia do trabalho feito"]);
    A.marcarFeita(d.id, ti);
    expect(p.tasks[ti].exec!.estado).toBe("em curso");
    expect(avisos.at(-1)).toMatch(/Ainda não dá/);
    A.registarTarefa(d.id, ti, { horas: 6, foto: "data:image/png;base64,AAAA", nota: "ok" });
    A.marcarFeita(d.id, ti);
    expect(p.tasks[ti].exec!.estado).toBe("feita");
    expect(porValidar(p)).toContain(ti);
  });

  it("o supervisor pede correção (volta ao técnico) e depois valida; as horas validadas contam no diário", () => {
    const { A, d, p } = preparar(1022);
    const ti = porValidar(p)[0];
    A.pedirCorrecao(d.id, ti, "Falta acabamento");
    expect(p.tasks[ti].exec!.estado).toBe("corrigir");
    expect(p.tasks[ti].exec!.motivo).toBe("Falta acabamento");
    A.marcarFeita(d.id, ti); // já tinha horas e fotografia
    A.validarTarefa(d.id, ti);
    expect(p.tasks[ti].exec!.estado).toBe("validada");
    expect(d.obra.diario!.some((x) => x.k === "validacao")).toBe(true);
  });

  it("o dia seguinte muda as tarefas de hoje e pára no último dia", () => {
    const { A, d, p } = preparar(1022);
    const d0 = p.dia;
    A.diaSeguinte(d.id);
    expect(p.dia).toBe(d0 + 1);
    for (let k = 0; k < 20; k++) A.diaSeguinte(d.id);
    expect(p.dia).toBe(fimDe(p.tasks) - 1);
  });

  it("equipa, equipamentos, materiais por fase e segurança têm dados coerentes", () => {
    const { A, d, p } = preparar(1027);
    d.fin.pago = true; A.emitirEc(d.id); // 16/10: os materiais vêm da encomenda de cliente, emitida com o pagamento
    const eq = equipaDaObra(p);
    expect(eq.length).toBeGreaterThan(1);
    expect(eq.every((m) => m.tel && m.dias > 0)).toBe(true);
    const E = equipamentosDaObra(p);
    expect(E[0].origem).toBe("Frota");
    expect(E.some((e) => e.n === "Martelo demolidor")).toBe(true);
    expect(materiaisPorFase(d).length).toBeGreaterThan(0);
    expect(seguranca(d).find((x) => x.k === "seguro")!.ok).toBe(true);
  });
});
