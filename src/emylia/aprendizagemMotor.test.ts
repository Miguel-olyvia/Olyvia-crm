// 26/11 (plano «Obra Viva», etapa 5): a aprendizagem chega ao motor. As obras acabadas (e as correções do gestor ao validar) ensinam a
// duração das tarefas; com 3 obras a dizer o mesmo, o plano de uma obra nova já nasce corrigido (só os dias, nunca as horas nem o preço).
import { describe, expect, it } from "vitest";
import { seed, type Negocio, type Tarefa } from "./motor";
import { MIN_OBRAS, aprender, chaveDaTarefa, diasComLicao, diasReais, erroDaObra, tendenciaDoErro } from "./aprendizagemMotor";
import { planoDoOrcamento } from "./preparacaoObra";
import { retratoTarefas } from "./planoAntesDepois";

/** Uma tarefa acabada, com um registo por cada um dos `dias` dias e as `horas` registadas. */
function feita(t: Partial<Tarefa> & Pick<Tarefa, "nome" | "dur" | "h">, dias: number, horas = t.h): Tarefa {
  return { svcs: ["s1"], dia: 0, sk: "Pintor", tec: "x", perfilId: "p-pintor", ...t,
    exec: { estado: "validada", horas, fotos: [], envios: Array.from({ length: dias }, (_, k) => ({ q: "", dia: k, quem: "x", k: k === dias - 1 ? "feita" as const : "registo" as const, horas: horas / dias })) } } as Tarefa;
}
/** Uma obra com as tarefas dadas; o plano gerado é o das tarefas antes de se fazerem (os dias previstos). */
function obra(id: number, tarefas: Tarefa[]): Negocio {
  const plano = { tasks: tarefas, estado: "em curso" as const, dia: 10, inicio: `2026-0${(id % 9) + 1}-01`, gerado: retratoTarefas({ tasks: tarefas.map((t) => ({ ...t, exec: undefined })) }) };
  return { id, nome: `Obra ${id}`, perdido: false, obra: { plano } } as unknown as Negocio;
}

describe("o que as obras ensinam", () => {
  it("os dias reais são os dias com registo ou com o «feita», cada um uma vez", () => {
    const t = feita({ nome: "Pintura", dur: 2, h: 16 }, 3);
    expect(diasReais(t)).toBe(3);
    t.exec!.envios!.push({ q: "", dia: 1, quem: "x", k: "registo" }, { q: "", dia: 9, quem: "y", k: "validada" });
    expect(diasReais(t)).toBe(3);
  });

  it(`com ${MIN_OBRAS} obras a dizer o mesmo, a lição vale sozinha; com menos, fica a aprender`, () => {
    const duas = [obra(1, [feita({ nome: "Pintura", dur: 2, h: 16 }, 4)]), obra(2, [feita({ nome: "Pintura", dur: 2, h: 16 }, 4)])];
    const k = chaveDaTarefa({ svcs: ["s1"], perfilId: "p-pintor", sk: "Pintor", nome: "Pintura" });
    expect(aprender(duas).licoes.get(k)).toMatchObject({ razao: 2, obras: 2, aplica: false });
    const tres = [...duas, obra(3, [feita({ nome: "Pintura", dur: 2, h: 16 }, 3)])];
    expect(aprender(tres).licoes.get(k)).toMatchObject({ razao: 2, obras: 3, aplica: true });
    // a obra que se está a planear não se ensina a si própria
    expect(aprender(tres, 3).licoes.get(k)?.aplica).toBe(false);
  });

  it("o motor que já acerta não muda nada (desvio abaixo de 15%)", () => {
    const L = [1, 2, 3].map((i) => obra(i, [feita({ nome: "Pintura", dur: 4, h: 32 }, 4)]));
    expect([...aprender(L).licoes.values()][0]).toMatchObject({ razao: 1, aplica: false });
  });

  it("a correção do gestor ao validar também ensina (conta metade do que se viu em obra)", () => {
    const L = [1, 2, 3].map((i) => {
      const t = { nome: "Pintura", svcs: ["s1"], dia: 0, dur: 2, h: 16, sk: "Pintor", perfilId: "p-pintor", tec: "x" } as Tarefa;
      const d = obra(i, [t]);
      d.obra.plano!.estado = "aprovado";
      d.obra.aprendizagem = [{ q: "", quem: "g", motivo: "aprovado", gerado: retratoTarefas({ tasks: [t] }), final: retratoTarefas({ tasks: [{ ...t, dur: 3 }] }), diferencas: [] }];
      return d;
    });
    expect([...aprender(L).licoes.values()][0]).toMatchObject({ razao: 1.5, obras: 3, aplica: true });
  });

  it("as horas a mais viram proposta para o Catálogo (mudam o preço: pedem sempre)", () => {
    const L = [1, 2, 3].map((i) => obra(i, [feita({ nome: "Pintura", dur: 2, h: 16 }, 2, 24)]));
    const A = aprender(L);
    expect(A.catalogo).toEqual([expect.objectContaining({ nome: "Pintura", razao: 1.5, obras: 3, previstas: 48, reais: 72 })]);
  });

  it("os dias corrigidos vão ao meio dia; o erro do motor mede-se obra a obra", () => {
    const L = [1, 2, 3].map((i) => obra(i, [feita({ nome: "Pintura", dur: 2, h: 16 }, 3)]));
    const A = aprender(L);
    const k = [...A.licoes.keys()][0];
    expect(diasComLicao(A.licoes, k, 1)).toMatchObject({ dias: 1.5 });
    expect(diasComLicao(A.licoes, "outra", 1)).toBeNull();
    expect(erroDaObra(L[0])).toMatchObject({ tarefas: 1, erroDias: 0.5, comLicoes: false });
    expect(A.erros).toHaveLength(3);
    expect(tendenciaDoErro(A.erros)).toBeNull(); // menos de 4 obras
  });
});

describe("o plano de uma obra nova nasce com o que se aprendeu", () => {
  it("a tarefa ensinada por 3 obras dura o que costuma durar, as seguintes andam com ela, e as horas e o preço não mudam", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc" && l.q > 0))!;
    const antes = planoDoOrcamento(d, S);
    const ti = antes.tasks.findIndex((t) => t.svcs.length && t.dur >= 1 && antes.tasks.some((u) => u.dia >= t.dia + t.dur));
    expect(ti).toBeGreaterThanOrEqual(0);
    const X = antes.tasks[ti];
    expect(X.aprendido).toBeUndefined();
    // três obras acabadas em que esta tarefa levou o dobro dos dias
    for (let i = 0; i < 3; i++) S.deals.push(obra(90001 + i, [{ ...X, dia: 0, exec: feita({ nome: X.nome, dur: X.dur, h: X.h }, Math.max(1, Math.ceil(X.dias ?? X.dur)) * 2).exec } as Tarefa]));
    const depois = planoDoOrcamento(d, S);
    const Y = depois.tasks[ti];
    expect(Y.nome).toBe(X.nome);
    expect(Y.aprendido).toMatchObject({ razao: 2, obras: 3 });
    expect(Y.dias!).toBeGreaterThan(X.dias!);
    expect(Y.h).toBe(X.h);
    const fim = (p: typeof antes) => Math.max(...p.tasks.map((t) => t.dia + t.dur));
    expect(fim(depois)).toBeGreaterThanOrEqual(fim(antes));
    expect(depois.tasks.reduce((a, t) => a + t.h, 0)).toBeCloseTo(antes.tasks.reduce((a, t) => a + t.h, 0), 5);
  });
});
