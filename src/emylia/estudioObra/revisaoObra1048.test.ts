// 25/11 (revisão do Estúdio da obra na 1048, casa de banho e cozinha, no dia 1): a previsão não extrapola de duas tarefas, os nomes
// repetidos dizem a divisão e os dias em que a obra fica sem ninguém aparecem como alerta.
import { describe, expect, it } from "vitest";
import type { Plano, Tarefa } from "../motor";
import { previsao } from "./previsaoObra";
import { diasSemNinguem, divisaoDaTarefa, nomeNoPlano } from "./planoVivo";

const T = (nome: string, dia: number, dur: number, extra: Partial<Tarefa> = {}): Tarefa => ({ nome, svcs: [], dia, dur, sk: "x", h: dur * 8, tec: "a", fase: 1, ...extra });
const validada = { estado: "validada" as const, horas: 8, fotos: [], envios: [{ q: "", dia: 0, quem: "x", k: "feita" as const, horas: 8 }] };
const plano = (tasks: Tarefa[], dia = 0): Plano => ({ tasks, estado: "em curso", dia, origem: "orcamento", inicio: "2027-03-01" });

describe("a previsão no início da obra", () => {
  it("ir adiantado com pouco feito não encurta o fim: fica o do plano", () => {
    // a 1.ª tarefa (4 dias) feita no dia 1: o ritmo dá mais de 100%, mas só uma parte pequena da obra está feita
    const p = plano([T("Demolição", 0, 4, { exec: validada }), ...Array.from({ length: 10 }, (_, i) => T(`T${i}`, 4 + i * 4, 4))]);
    const r = previsao(p);
    expect(r.ritmo).toBeGreaterThan(1);
    expect(r.confianca).toBe("baixa");
    expect(r.fimProvavel).toBe(r.fimPlano);
  });
  it("atrasado conta sempre", () => {
    const p = plano([T("A", 0, 4, { exec: { estado: "em curso", horas: 4, fotos: [] } }), T("B", 4, 4)], 3);
    expect(previsao(p).fimProvavel).toBeGreaterThan(previsao(p).fimPlano);
  });
});

describe("os nomes com a divisão", () => {
  it("a divisão sai do nome dos modelos de obra", () => {
    expect(divisaoDaTarefa("MO Modelo Remodelação Completa - Cozinha · eletricidade")).toBe("Cozinha");
    expect(divisaoDaTarefa("Mão de Obra Demolição de parede m2")).toBeNull();
  });
  it("com duas divisões no plano, o nome curto leva a divisão; com uma só, não", () => {
    const cb = T("MO Modelo Remodelação Completa - Casa de Banho Comum · demolição e remoção", 0, 2);
    const coz = T("MO Modelo Remodelação Completa - Cozinha · demolição e remoção", 2, 2);
    const p = plano([cb, coz]);
    expect(nomeNoPlano(p, cb)).toBe("Demolição e remoção · casa de banho comum");
    expect(nomeNoPlano(p, coz)).toBe("Demolição e remoção · cozinha");
    expect(nomeNoPlano(plano([cb]), cb)).toBe("Demolição e remoção");
  });
});

describe("os dias sem ninguém na obra", () => {
  it("a tarefa acabada mais cedo deixa um buraco até à seguinte", () => {
    // A validada no dia 0 (estava para 4 dias); B só começa no dia 8: dias 1 a 7 sem ninguém
    const p = plano([T("A", 0, 4, { exec: validada }), T("B", 8, 2)], 1);
    expect(diasSemNinguem(p)).toEqual([{ ini: 1, fim: 7, seguinte: 1 }]);
  });
  it("um dia solto não conta (só a partir de dois)", () => {
    const p = plano([T("A", 0, 2), T("B", 3, 2)], 0);
    expect(diasSemNinguem(p)).toEqual([]);
  });
});

describe("antecipar de uma vez o que vem depois de um buraco", () => {
  it("puxa as tarefas por começar o número de dias do buraco e fecha-o", async () => {
    const { acoes } = await import("../motor");
    const { obraDeExemplo } = await import("./exemploObra");
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!;
    // um buraco de 4 dias: as tarefas por começar passam 4 dias para a frente
    const depois = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => !t.exec && t.dia > p.dia);
    for (const { t } of depois) t.dia += 4;
    const g = diasSemNinguem(p).find((x) => x.seguinte != null)!;
    expect(g).toBeTruthy();
    const antes = depois.map(({ t }) => t.dia);
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(`${a.msg}: ${a.sub ?? ""}`), (fn) => fn());
    A.role("operacoes");
    const r = A.fecharBuraco(d.id, g.ini, g.fim);
    if (r > 0) {
      expect(depois.map(({ t }) => t.dia)).toEqual(antes.map((x) => Math.max(p.dia, x - r)));
      expect(avisos.at(-1)).toMatch(/^Plano antecipado/);
    } else expect(avisos.at(-1)).toMatch(/^Não dá para antecipar/);
  });
  it("26/11: o alerta só propõe antecipar o que dá; com o técnico noutra obra, diz porquê e não propõe", async () => {
    const { simularBuraco, TECS } = await import("../motor");
    const { obraDeExemplo } = await import("./exemploObra");
    const { alertasDaObra } = await import("./alertasObra");
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!;
    const depois = p.tasks.filter((t) => !t.exec && t.dia > p.dia);
    for (const t of depois) t.dia += 4;
    const g = diasSemNinguem(p).find((x) => x.seguinte != null)!;
    // a ocupação real dos técnicos noutras obras (como a app a passa)
    const { ocupacaoDosTecnicos } = await import("../preparacaoObra");
    const alerta = () => alertasDaObra(d, S, ocupacaoDosTecnicos(S, d.id)).find((a) => a.id === `parada-${g.ini}`)!;
    // livre: a ação diz quantos dias dá e a simulação concorda
    const sim = simularBuraco(S, d, g.ini, g.fim);
    if (sim.s) expect(alerta().acoes[0].rot).toBe(`Antecipar ${sim.s} ${sim.s === 1 ? "dia útil" : "dias úteis"}`);
    // ocupado: outra obra com o mesmo técnico (e, aqui, todos os do ofício) em todos os dias do buraco e da tarefa seguinte
    const seg = p.tasks[g.seguinte!];
    const { tecnicosDoOficio } = await import("../preparacaoObra");
    const doOficio = [seg.tec, ...tecnicosDoOficio(seg).map((x) => x.id).filter((x) => x !== seg.tec)];
    const outra = structuredClone(d);
    outra.id = d.id + 900; outra.nome = "Obra Vizinha";
    const q = outra.obra.plano!;
    q.tasks = doOficio.map((tec) => ({ ...seg, tec, nome: "Ocupado", dia: 0, dur: seg.dia + seg.dur + 10, exec: undefined }));
    q.dia = 0; q.estado = "em curso";
    S.deals = [...S.deals, outra];
    const s2 = simularBuraco(S, d, g.ini, g.fim);
    expect(s2.s).toBe(0);
    expect(s2.porque).toMatch(new RegExp(`${TECS.find((x) => x.id === seg.tec)?.n.split(" ")[0] ?? "técnico"}|noutra obra|férias|livres`));
    const a = alerta();
    expect(a.acoes.some((x) => x.a.k === "fecharBuraco" || x.a.k === "passarEAntecipar")).toBe(false);
    expect(a.sub).toMatch(/não dá para antecipar|fica parada/);
    // 27/11: nunca «Ver a tarefa» (não resolve nada): ou se faz outra tarefa nesses dias (de quem está livre), ou não há ação nenhuma
    expect(a.acoes.some((x) => x.a.k === "tarefa")).toBe(false);
    const px = a.acoes.find((x) => x.a.k === "puxar")?.a as { ti: number } | undefined;
    if (px) expect(doOficio).not.toContain(p.tasks[px.ti].tec);
    const { propostasDosAgentes, modoDa } = await import("./agentes");
    const pr = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).find((x) => x.id === `parada-${g.ini}`)!;
    expect(pr.info).toBe(!px);
    if (!px) expect(modoDa(pr, { degraus: { plano: 1 } } as never)).toBe("ver");
  });
  it("27/11: com um colega do mesmo ofício livre, o agente propõe passar-lhe a tarefa e antecipar, e a ação faz isso de uma vez", async () => {
    const { acoes, desbloquearBuraco, simularBuraco } = await import("../motor");
    const { obraDeExemplo } = await import("./exemploObra");
    const { alertasDaObra } = await import("./alertasObra");
    const { tecnicosDoOficio } = await import("../preparacaoObra");
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!;
    for (const t of p.tasks.filter((t) => !t.exec && t.dia > p.dia)) t.dia += 4;
    const g = diasSemNinguem(p).find((x) => x.seguinte != null)!;
    const seg = p.tasks[g.seguinte!];
    // as ações criam-se antes do colega: acoes() repõe a lista de técnicos a partir do Estado
    const avisos: string[] = [];
    const A = acoes(S, (x) => avisos.push(`${x.msg}: ${x.sub ?? ""}`), (fn) => fn());
    A.role("operacoes");
    // um colega do mesmo ofício (cópia do técnico da tarefa, sem férias), só para este teste
    const { TECS } = await import("../motor");
    const base = TECS.find((x) => x.id === seg.tec)!;
    TECS.push({ ...base, id: "t-colega-teste", n: "Colega Teste", feriasDatas: [] } as typeof base);
    try {
    expect(tecnicosDoOficio(seg).some((x) => x.id === "t-colega-teste")).toBe(true);
    // só o técnico da tarefa seguinte está ocupado noutra obra
    const outra = structuredClone(d);
    outra.id = d.id + 901; outra.nome = "Obra Vizinha";
    outra.obra.plano!.tasks = [{ ...seg, nome: "Ocupado", dia: 0, dur: seg.dia + seg.dur + 10, exec: undefined }];
    outra.obra.plano!.dia = 0; outra.obra.plano!.estado = "em curso";
    S.deals = [...S.deals, outra];
    const s0 = simularBuraco(S, d, g.ini, g.fim);
    expect(s0.s).toBe(0); expect(s0.trava).not.toBeNull();
    const des = desbloquearBuraco(S, d, g.ini, g.fim, s0.trava);
    expect(des).not.toBeNull();
    if (!des) return;
    const al = alertasDaObra(d, S, new Map()).find((x) => x.id === `parada-${g.ini}`)!;
    expect(al.acoes[0].a).toMatchObject({ k: "passarEAntecipar", ti: des.ti, tec: des.tec });
    expect(al.acoes[0].rot).toMatch(/^Passar a .+ e antecipar \d+ dias? úte(is|il)$/);
    const antes = p.tasks.map((t) => t.dia);
    const a0 = al.acoes[0].a as { ti: number; tec: string; ini: number; fim: number };
    const r = A.passarEAntecipar(d.id, a0.ti, a0.tec, a0.ini, a0.fim);
    expect(r).toBe(des.s);
    expect(p.tasks[des.ti].tec).toBe(des.tec);
    expect(p.tasks.some((t, k) => t.dia < antes[k])).toBe(true);
    expect(avisos.at(-1)).toMatch(/^Plano antecipado/);
    } finally { TECS.splice(TECS.findIndex((x) => x.id === "t-colega-teste"), 1); }
  });
});

describe("o texto do ritmo", () => {
  it("não diz «a tempo: 180%» quando o fim fica o do plano", async () => {
    const { textoRitmo } = await import("./ComandoObra");
    expect(textoRitmo(1.8, "baixa")).toBe("Adiantado, mas ainda com pouco feito para mudar o fim");
    expect(textoRitmo(1.3, "média")).toBe("Adiantado: 130% do previsto até hoje");
    expect(textoRitmo(1, "baixa")).toBe("No ritmo do plano");
    expect(textoRitmo(0.7, "alta")).toBe("Abaixo do plano: 70% do previsto até hoje");
  });
});
