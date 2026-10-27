// Fase 3 (22/10/2026): a obra indexada à proposta. Previsto = a mão de obra congelada na proposta aceite (+ adendas assinadas); real = as
// horas registadas × o €/h do técnico no registo; desvio = real − previsto. A simulação de ponta a ponta: visita → orçamento → proposta → obra.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { acoes, realObra, seed, tot, type Estado, type Negocio } from "./motor";
import { custoObra, realDaTarefa } from "./custoObra";
import { realPorFase } from "./planoObra";
import { derivarServicos } from "./v2/custosModelo";
import { porAtribuir } from "./preparacaoObra";
import { emFalta, AREA, ESCOLHAS, EXTERIOR, INTERIOR, PROPOSTA, type Grupo } from "./campos";

const preencher = (d: Negocio, gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "data" ? "2026-11-02" : "1"; };
const custoDe = (S: Estado, tec: string) => S.tecnicos!.find((t) => t.id === tec)!;

/** Da visita ao contrato assinado: o Hugo Matos (1035) com pontos elétricos (um ofício sem técnicos no RH). */
function ateAObra() {
  const S = seed(); S.role = "direcao";
  const A = acoes(S, () => undefined, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1035)!;
  d.visita.extra = { eletr: 2 };
  preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
  A.fecharVisita(d.id);
  preencher(d, PROPOSTA);
  A.verificar(d.id);
  A.enviar(d.id);
  A.aceitar(d.id); A.enviarContrato(d.id); A.assinar(d.id);
  const p = d.obra.plano!;
  p.estado = "em curso";
  return { S, A, d, p };
}

describe("a obra indexada à proposta", () => {
  it("ponta a ponta: o previsto é a mão de obra congelada na proposta; o real são as horas × o €/h do técnico; desvio = real − previsto", () => {
    const { S, A, d, p } = ateAObra();
    expect(d.orc!.enviada).toBeTruthy();
    expect(d.fase).toBe(4);
    const ti = p.tasks.findIndex((t) => t.svcs.includes("revest")), t = p.tasks[ti];
    const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === "revest")!;
    if (l.t !== "svc") throw new Error("linha");
    const K0 = custoObra(d, S);
    // previsto: 0,75 h × 17,80 €/h (Sérgio e Hugo) × 16 m² de paredes
    expect(K0.linhas[ti]).toMatchObject({ origem: "proposta", prev: r2(0.75 * 17.8 * l.q), real: null, desvio: null });
    // o previsto da obra é a mão de obra da proposta inteira (por ofício)
    expect(K0.prev).toBeCloseTo(d.orc!.linhas.reduce((a, x) => a + (x.t === "svc" ? x.det!.mo * x.q : 0), 0) + (d.orc!.demolicao?.r ? d.orc!.demolicao.r.demolicao + d.orc!.demolicao.r.carga : 0), 1);
    // os pontos elétricos não têm técnico no RH: a tarefa fica por atribuir (e tem previsto)
    const el = p.tasks.find((x) => x.svcs.includes("eletr"))!;
    expect(el.tec).toBeNull();
    expect(porAtribuir(p)).toContain(el);
    // o técnico regista 8 h ao custo/hora dele (o RH)
    S.role = "tecnico";
    const tec = t.tec!, ch0 = custoDe(S, tec).custoHora;
    A.enviarRegisto(d.id, ti, { horas: 8, fotos: ["f"], nota: "Paredes da base", feita: false });
    expect(t.exec!.envios!.at(-1)).toMatchObject({ horas: 8, ch: ch0 });
    let K = custoObra(d, S);
    expect(K.linhas[ti]).toMatchObject({ hReal: 8, real: r2(8 * ch0) });
    expect(K.linhas[ti].desvio).toBeCloseTo(8 * ch0 - 0.75 * 17.8 * l.q, 2);
    expect(K).toMatchObject({ registadas: 1, real: r2(8 * ch0) });
    // o €/h do técnico sobe (a retribuição mudou no RH): o previsto e as 8 h já registadas não mudam; as horas novas vão ao €/h novo
    custoDe(S, tec).custoHora = 30; derivarServicos(S);
    K = custoObra(d, S);
    expect(K.prev).toBe(K0.prev);
    expect(K.linhas[ti].real).toBe(8 * ch0);
    A.enviarRegisto(d.id, ti, { horas: 2, fotos: ["f"], nota: "Rodapés", feita: true });
    K = custoObra(d, S);
    expect(K.linhas[ti]).toMatchObject({ hReal: 10, real: r2(8 * ch0 + 2 * 30) });
    // os mesmos números no previsto/real por fase e no real da obra
    const R = realPorFase(d, S)!;
    const f3 = R.fases.find((f) => f.n === t.fase)!;
    expect(r2(f3.real.custo - f3.prev.custo)).toBeCloseTo(K.fases.find((f) => f.fase === t.fase)!.desvio, 1);
    expect(realObra(d, S).custoReal).toBeCloseTo(tot(d, S).custo + K.desvio, 1);
  });

  it("as tarefas fora da proposta (correções) não têm previsto; as da adenda assinada têm o previsto congelado nela", () => {
    const { S, A, d, p } = ateAObra();
    p.tasks.push({ ...p.tasks[0], nome: "Correção · " + p.tasks[0].nome, corrige: 0, exec: { estado: "feita", horas: 3, fotos: ["x"] } });
    let K = custoObra(d, S);
    expect(K.linhas.at(-1)).toMatchObject({ origem: "fora", prev: 0 });
    expect(K.linhas.at(-1)!.desvio).toBe(K.linhas.at(-1)!.real);
    // a adenda: enviada (congela cu e a mão de obra), aceite, assinada → as tarefas dela juntam-se ao plano
    const n = A.criarAdenda(d.id, [{ sid: "pint", q: 10 }], "O cliente pediu")!;
    const a = d.adendas!.find((x) => x.n === n)!;
    A.verificarEnviarAdenda(d.id, n);
    expect(a.linhas[0].mo).toBeCloseTo(S.svc.pint.h * S.svc.pint.eh, 2);
    A.aceitarAdenda(d.id, n); A.enviarContratoAdenda(d.id, n); A.assinarAdenda(d.id, n);
    expect(a.estado).toBe("assinada");
    K = custoObra(d, S);
    const ad = K.linhas.find((x) => x.origem === "adenda")!;
    expect(ad.prev).toBeCloseTo(a.linhas[0].mo! * 10, 2);
    // o €/h do pintor muda depois: o previsto da adenda fica
    S.custos!.perfis.find((x) => x.id === "pintor")!.salario = 3000; derivarServicos(S);
    expect(custoObra(d, S).linhas.find((x) => x.origem === "adenda")!.prev).toBe(ad.prev);
  });

  it("as horas mudadas pelo responsável guardam o €/h do técnico nesse momento", () => {
    const t = { nome: "x", svcs: [], dia: 0, dur: 1, sk: "Ladrilhador", h: 4, tec: "hn", exec: { estado: "feita" as const, horas: 5, fotos: [], ch: 20 } };
    expect(realDaTarefa(t)).toEqual({ h: 5, custo: 100 });
    // sem €/h guardado (os registos de antes desta fase), o de agora da ficha do técnico
    const S = seed(); void S;
    expect(realDaTarefa({ ...t, exec: { estado: "feita", horas: 5, fotos: [] } })).toEqual({ h: 5, custo: 5 * 17.8 });
  });
});

const r2 = (x: number) => Math.round(x * 100) / 100;
