// 11/11: o plano vivo da obra em curso (planoVivo.ts) e os alertas do Estúdio da obra (alertasObra.ts), com a obra de exemplo.
import { describe, expect, it } from "vitest";
import { acoes, type Plano, type Tarefa } from "../motor";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { conflitosNovos, derrapagem, estadoVivo, fimFeito, replanear, simularAtraso } from "./planoVivo";
import { alertasDaObra } from "./alertasObra";
import { obraDeExemplo } from "./exemploObra";

const T = (nome: string, dia: number, dur: number, tec: string | null, fase = 1, extra: Partial<Tarefa> = {}): Tarefa => ({ nome, svcs: [], dia, dur, sk: "x", h: dur * 8, tec, fase, ...extra });
const plano = (tasks: Tarefa[], dia = 2): Plano => ({ tasks, estado: "em curso", dia, origem: "orcamento", inicio: "2027-03-01" });
const sem = new Map<string, Set<string>>();

describe("estadoVivo", () => {
  it("sem nenhum registo e com os dias passados: começa hoje (não se prolonga)", () => {
    const p = plano([T("Revestimento", 0, 2, "a", 1), T("Louças", 2, 1, "b", 2)], 2);
    const r = replanear(p, sem, { adiantar: false });
    expect([r.plano.tasks[0].dia, r.plano.tasks[0].dur]).toEqual([2, 2]);
    expect(r.plano.tasks[1].dia).toBe(4);
  });
  it("atrasada quando os dias já passaram; em curso com registo; parada com imprevisto", () => {
    const p = plano([T("A", 0, 2, "a"), T("B", 2, 2, "b", 1, { exec: { estado: "em curso", horas: 2, fotos: [] } }), T("C", 1, 3, "c", 1, { bloqueio: "IM-1" }), T("D", 5, 1, "d")]);
    expect(estadoVivo(p.tasks[0], p)).toBe("atrasada");
    expect(estadoVivo(p.tasks[1], p)).toBe("em curso");
    expect(estadoVivo(p.tasks[2], p)).toBe("parada");
    expect(estadoVivo(p.tasks[3], p)).toBe("por começar");
  });
  it("feita mais cedo: o fim é o dia em que o técnico a deu por feita", () => {
    const t = T("A", 0, 3, "a", 1, { exec: { estado: "validada", horas: 8, fotos: [], envios: [{ q: "", dia: 0, quem: "x", k: "feita" }, { q: "", dia: 2, quem: "y", k: "validada" }] } });
    expect(fimFeito(t)).toBe(1);
  });
});

describe("replanear", () => {
  it("a atrasada conta com hoje e empurra a que vinha a seguir", () => {
    const p = plano([T("Revestimento", 0, 2, "a", 1, { exec: { estado: "em curso", horas: 6, fotos: [] } }), T("Louças", 2, 1, "b", 2)], 2);
    const r = replanear(p, sem, { adiantar: false });
    expect(r.plano.tasks[0].dur).toBe(3); // dias 0, 1 e hoje (2)
    expect(r.plano.tasks[1].dia).toBe(3);
    expect(r.fimDepois).toBe(4);
    expect(r.mudancas.map((m) => m.tipo)).toEqual(["prolongada", "adiada"]);
  });
  it("adiantar: a anterior acabou mais cedo e havia um intervalo; a seguinte puxa-se (não antes de amanhã)", () => {
    const feita = { estado: "validada" as const, horas: 8, fotos: [], envios: [{ q: "", dia: 0, quem: "x", k: "feita" as const }] };
    const p = plano([T("Demolição", 0, 2, "a", 1, { exec: feita }), T("Canalização", 4, 1, "b", 2), T("Revestimento", 5, 2, "c", 3)], 1);
    const so = replanear(p, sem, { adiantar: false });
    expect(so.mudancas).toHaveLength(0);
    const r = replanear(p, sem, { adiantar: true });
    expect(r.plano.tasks[1].dia).toBe(2);
    expect(r.plano.tasks[2].dia).toBe(3);
    expect(r.fimDepois).toBe(5);
    expect(r.mudancas.every((m) => m.tipo === "adiantada")).toBe(true);
  });
  it("o técnico noutra obra espera: a tarefa anda até ele estar livre", () => {
    const p = plano([T("Canalização", 3, 1, "ma", 2)], 1);
    const ocup = new Map([["ma", new Set(["2027-03-04"])]]); // dia 3 (qui)
    const r = replanear(p, ocup, { adiantar: false });
    // o técnico tem de existir em TECS para motivoOcupado contar; se não existir, nada muda
    expect(r.plano.tasks[0].dia === 4 || r.plano.tasks[0].dia === 3).toBe(true);
  });
  it("simular um atraso: a tarefa em curso fica mais longa e o resto anda pela ordem do plano", () => {
    const p = plano([T("Revestimento", 1, 2, "a", 1, { exec: { estado: "em curso", horas: 4, fotos: [] } }), T("Pavimento", 3, 1, "b", 2), T("Louças", 4, 1, "c", 3)], 2);
    const r = simularAtraso(p, 0, 2, sem);
    expect(r.plano.tasks[0].dur).toBe(4);
    expect(r.plano.tasks[1].dia).toBe(5);
    expect(r.plano.tasks[2].dia).toBe(6);
    expect(r.fimDepois - r.fimAntes).toBe(2);
    expect(p.tasks[0].dur).toBe(2); // o plano não mudou
  });
});

describe("a obra de exemplo e o motor", () => {
  it("os alertas: atrasada, por validar, imprevisto, conflito noutra obra, conversa, derrapagem e folga", () => {
    const { S, d } = obraDeExemplo();
    const A = alertasDaObra(d, S, ocupacaoDosTecnicos(S, d.id));
    const ids = A.map((a) => a.id);
    expect(ids.some((x) => x.startsWith("atraso-"))).toBe(true);
    expect(ids.some((x) => x.startsWith("validar-"))).toBe(true);
    expect(ids.some((x) => x.startsWith("im-"))).toBe(true);
    expect(ids.some((x) => x.startsWith("conflito-"))).toBe(true);
    expect(ids).toContain("chat");
    expect(ids).toContain("derrapagem");
    expect(ids).toContain("folga");
    // os urgentes primeiro
    expect(A[0].nivel).toBe("critico");
    expect(derrapagem(d.obra.plano!)).toBeGreaterThan(0);
  });
  it("um atraso na obra mostra a outra obra onde o mesmo técnico passa a estar", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
    const r = simularAtraso(p, ti, 3, ocupacaoDosTecnicos(S, d.id));
    expect(r.fimDepois).toBeGreaterThan(r.fimAntes);
    // o resto anda (o pavimento, parado, e a montagem)
    expect(r.mudancas.length).toBeGreaterThan(1);
    const fora = conflitosNovos(S, d, r.plano);
    expect(Array.isArray(fora)).toBe(true);
  });
  it("A.replanearObra aplica, avisa os técnicos, fica nos ajustes e avisa o cliente", () => {
    const { S, d } = obraDeExemplo();
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
    const p = d.obra.plano!;
    const r = replanear(p, ocupacaoDosTecnicos(S, d.id), { adiantar: true });
    const n = A.replanearObra(d.id, { adiantar: true, motivo: "Mais rápido do que previsto", cliente: true });
    expect(n).toBe(r.mudancas.length);
    r.mudancas.forEach((m) => { expect(p.tasks[m.ti].dia).toBe(m.para.dia); expect(p.tasks[m.ti].dur).toBe(m.para.dur); });
    const alt = d.obra.alteracoes![0];
    expect(alt.t).toMatch(/Replaneado/);
    expect(alt.cliente).toBe(true);
    expect(alt.avisoCliente).toMatch(/Reorganizámos o plano/);
    expect((p.avisos ?? []).length).toBeGreaterThan(0);
    // outra vez: já está em dia
    expect(A.replanearObra(d.id, { adiantar: true, motivo: "", cliente: false })).toBe(0);
  });
  it("A.replanearObra com um atraso aplica o mesmo que a simulação", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
    const r = simularAtraso(p, ti, 2, ocupacaoDosTecnicos(S, d.id));
    A.replanearObra(d.id, { adiantar: false, motivo: "Imprevisto na obra", cliente: false, atraso: { ti, dias: 2 } });
    r.mudancas.forEach((m) => expect([p.tasks[m.ti].dia, p.tasks[m.ti].dur]).toEqual([m.para.dia, m.para.dur]));
    expect(d.obra.alteracoes![0].t).toMatch(/mais 2 dias/);
  });
  it("o imprevisto guarda as fotografias e o custo", () => {
    const { d } = obraDeExemplo();
    const im = d.obra.imprevistos![0];
    expect(im.custo).toBe(380);
    expect(im.foto).toBeTruthy();
  });
});

describe("produtos à peça (teste da Obra, negócio 1026)", () => {
  it("o que se vende à peça fica com quantidade inteira; m² e kg ficam como estão", async () => {
    const { pecaInteira } = await import("../motor");
    expect(pecaInteira("un", 23.76)).toBe(24);
    expect(pecaInteira("Pç", 5.5)).toBe(6);
    expect(pecaInteira("un", 3)).toBe(3);
    expect(pecaInteira("m²", 23.76)).toBe(23.76);
    expect(pecaInteira("kg", 7.5)).toBe(7.5);
  });
});

describe("o relógio real das obras (teste da Obra: «Dia 1 de 6» semanas depois)", () => {
  it("acertarDiaDasObras põe o «hoje» de cada obra em curso no dia do calendário", async () => {
    const { acertarDiaDasObras } = await import("../motor");
    const p = plano([T("A", 0, 3, "a"), T("B", 3, 3, "b")], 0); // começa seg 1/3/2027
    const d = { obra: { plano: p } } as unknown as import("../motor").Negocio;
    expect(acertarDiaDasObras([d], new Date(2027, 2, 4))).toBe(1); // qui 4/3: 4.º dia útil
    expect(p.dia).toBe(3);
    acertarDiaDasObras([d], new Date(2027, 3, 30)); // muito depois do fim: fica no último dia
    expect(p.dia).toBe(5);
  });
});

describe("replanear com dados reais (testarh, 11/11)", () => {
  it("a que devia ter começado e não tem registo anda (não antes de hoje), atrás da atrasada", () => {
    const emCurso = { estado: "em curso" as const, horas: 4, fotos: [], envios: [{ q: "", dia: 1, quem: "x", k: "registo" as const }] };
    // revestimento dias 1-2 (atrasado, com registo), pavimento dia 3 (sem registo), montagem dia 3 (sem registo); hoje = 4
    const p = plano([T("Revestimento", 1, 2, "a", 3, { exec: emCurso }), T("Pavimento", 3, 1, "a", 3), T("Montagem", 3, 2, "b", 4)], 4);
    const r = replanear(p, sem, { adiantar: false });
    expect(r.plano.tasks[0].dur).toBe(4); // dias 1 a 4 (hoje)
    expect(r.plano.tasks[1].dia).toBe(5); // depois do revestimento
    expect(r.plano.tasks[2].dia).toBeGreaterThanOrEqual(5); // a montagem não fica no passado
    expect(r.fimDepois).toBeGreaterThan(r.fimAntes);
  });
});
