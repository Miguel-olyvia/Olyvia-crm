// A obra indexada à proposta (22/10/2026, fase 3): os mesmos três números em todos os ecrãs da obra.
// · Previsto: a mão de obra da proposta aceite, congelada no envio (motor.ts: LinhaOrc.det: horas de cada ofício × €/h desse dia), mais a das
//   adendas assinadas (LinhaAdenda.mo, congelada no envio da adenda) e a da demolição (o cálculo do orçamento: horas × €/h da equipa).
//   As tarefas que não vêm da proposta (correções, tarefas juntadas pelo validador) têm previsto 0: o que custarem é desvio.
// · Real: as horas registadas × o €/h do técnico que as fez, no momento do registo (Envio.ch / ExecTarefa.ch); os registos de antes disto
//   (sem €/h guardado) usam o €/h de agora da ficha do técnico.
// · Desvio: real − previsto, nas tarefas com horas registadas (as outras ainda não têm real).
// Mudar o €/h de um técnico depois não muda o previsto (está congelado na proposta) nem as horas já registadas: só as que se registarem.
// Só mão de obra: os materiais, o equipamento e os consumíveis contam como previstos (o real deles vive no Inventário).
import { custoCongelado, r2, type Estado, type Negocio, type Tarefa } from "./motor";
import { assinadas } from "./adendas";
import { custoHoraDe } from "./equipa/tecnicos";

export type OrigemPrevisto = "proposta" | "adenda" | "demolicao" | "fora";
export interface LinhaCustoObra {
  /** o índice da tarefa no plano */
  ti: number; n: string; fase?: number; sk: string; tec: string | null;
  origem: OrigemPrevisto;
  hPrev: number; prev: number;
  /** null: ainda sem horas registadas */
  hReal: number | null; real: number | null; desvio: number | null;
}
export interface SomaCusto { prev: number; real: number; desvio: number }
export interface CustoObra extends SomaCusto {
  linhas: LinhaCustoObra[];
  /** o previsto das tarefas que já têm horas registadas (o desvio compara-se com ele) */
  prevFeito: number;
  registadas: number;
  fases: ({ fase: number } & SomaCusto)[];
  oficios: ({ sk: string } & SomaCusto)[];
}

const eDaAdenda = (t: Tarefa) => !!t.adenda || /\(adenda [^)]+\)$/.test(t.nome);
const daProposta = (t: Tarefa) => t.corrige == null && !t.nova && !eDaAdenda(t);

/** O previsto (horas e mão de obra) de uma tarefa do plano. `partilha`: em quantas tarefas da proposta entra cada serviço. */
function previstoDe(d: Negocio, S: Estado, t: Tarefa, partilha: Map<string, number>): { h: number; mo: number; origem: OrigemPrevisto } {
  if (eDaAdenda(t)) {
    const n = t.adenda ?? /\(adenda ([^)]+)\)$/.exec(t.nome)?.[1];
    const x = assinadas(d).find((a) => a.n === n)?.linhas.find((l) => t.svcs.includes(l.sid));
    if (!x) return { h: 0, mo: 0, origem: "fora" };
    const s = S.svc[x.sid], mo = x.mo ?? (s ? r2(s.h * s.eh) : 0);
    return { h: r2(x.h * x.q), mo: r2(mo * x.q), origem: "adenda" };
  }
  if (!daProposta(t)) return { h: 0, mo: 0, origem: "fora" };
  // a demolição e entulho do orçamento (uma tarefa sem serviço): as horas e a mão de obra do cálculo, que não muda depois do envio
  const r = d.orc?.demolicao?.r;
  if (!t.svcs.length && /demol/i.test(t.nome) && r) return { h: r2(r.horas + r.horasCarga), mo: r2(r.demolicao + r.carga), origem: "demolicao" };
  let h = 0, mo = 0;
  for (const sid of t.svcs) {
    const l = d.orc?.linhas.find((x) => x.t === "svc" && x.sid === sid);
    if (!l || l.t !== "svc") continue;
    const det = l.det ?? custoCongelado(S, sid, l.cu, "");
    if (!det) continue;
    const k = partilha.get(sid) ?? 1;
    h += (det.h * l.q) / k; mo += (det.mo * l.q) / k;
  }
  return { h: r2(h), mo: r2(mo), origem: "proposta" };
}

/** O real de uma tarefa: as horas registadas × o €/h do técnico no registo (sem ele guardado, o de agora). Null sem horas. */
export function realDaTarefa(t: Tarefa): { h: number; custo: number } | null {
  const e = t.exec;
  if (!e || !(e.horas > 0)) return null;
  let h = 0, custo = 0;
  for (const x of e.envios ?? []) if (x.horas && x.horas > 0) { h += x.horas; custo += x.horas * (x.ch ?? e.ch ?? custoHoraDe(t.tec)); }
  // as horas registadas sem envio (mudadas à mão pelo responsável, ou as dos exemplos)
  if (e.horas > h + 1e-9) custo += (e.horas - h) * (e.ch ?? custoHoraDe(t.tec));
  return { h: e.horas, custo: r2(custo) };
}

/** Os três números da mão de obra da obra (previsto da proposta, real do RH, desvio), por tarefa, por fase e por ofício. */
export function custoObra(d: Negocio, S: Estado): CustoObra {
  const p = d.obra.plano;
  const vazio: CustoObra = { linhas: [], prev: 0, real: 0, desvio: 0, prevFeito: 0, registadas: 0, fases: [], oficios: [] };
  if (!p) return vazio;
  const partilha = new Map<string, number>();
  for (const t of p.tasks) if (daProposta(t)) for (const sid of t.svcs) partilha.set(sid, (partilha.get(sid) ?? 0) + 1);
  const linhas: LinhaCustoObra[] = p.tasks.map((t, ti) => {
    const pv = previstoDe(d, S, t, partilha), rl = realDaTarefa(t);
    return {
      ti, n: t.nome, fase: t.fase, sk: t.sk, tec: t.tec, origem: pv.origem, hPrev: pv.h, prev: pv.mo,
      hReal: rl?.h ?? null, real: rl?.custo ?? null, desvio: rl ? r2(rl.custo - pv.mo) : null,
    };
  });
  const somar = (L: LinhaCustoObra[]): SomaCusto => {
    const prev = r2(L.reduce((a, l) => a + l.prev, 0)), real = r2(L.reduce((a, l) => a + (l.real ?? 0), 0));
    return { prev, real, desvio: r2(L.reduce((a, l) => a + (l.desvio ?? 0), 0)) };
  };
  const por = <K extends string | number>(k: (l: LinhaCustoObra) => K) => [...new Set(linhas.map(k))].map((v) => ({ v, ...somar(linhas.filter((l) => k(l) === v)) }));
  const T = somar(linhas), feitas = linhas.filter((l) => l.real != null);
  return {
    linhas, ...T, prevFeito: r2(feitas.reduce((a, l) => a + l.prev, 0)), registadas: feitas.length,
    fases: por((l) => l.fase ?? 0).map(({ v, ...x }) => ({ fase: v, ...x })).sort((a, b) => a.fase - b.fase),
    oficios: por((l) => l.sk).map(({ v, ...x }) => ({ sk: v, ...x })),
  };
}
