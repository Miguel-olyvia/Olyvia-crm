// 23/10/2026: o desempenho do Catálogo, tirado dos negócios e das obras do estado (sem dados novos).
// · por serviço: em quantos orçamentos entrou, quantos foram ganhos (contrato assinado: fase Financeiro ou Obra), a receita
//   ganha, e nas obras as horas previstas contra as registadas pelos técnicos;
// · por técnico: tarefas feitas e validadas, correções pedidas, horas registadas contra as previstas;
// · por ofício: a margem média dos serviços em uso.
import { FASES, TECS, type Estado, type Negocio, type SvcId, type Tarefa } from "./motor";

/** O contrato está assinado: o negócio chegou ao Financeiro ou à Obra, e não se perdeu nem foi anulado. */
export const ganho = (d: Negocio): boolean => d.fase >= FASES.indexOf("Financeiro") && !d.perdido && !d.anulado;

export interface DesempenhoServico {
  sid: SvcId;
  /** Orçamentos (deste estado) com o serviço. */
  orcamentos: number;
  ganhos: number;
  /** A receita das linhas do serviço nos negócios ganhos (quantidade × preço por unidade, antes do desconto). */
  receita: number;
  /** Nas tarefas das obras com o serviço que já têm registo: as horas previstas e as registadas. */
  hPrev: number;
  hReal: number;
}

/** As tarefas das obras que já têm horas registadas. */
function tarefasComRegisto(S: Estado): { d: Negocio; t: Tarefa; ti: number }[] {
  const out: { d: Negocio; t: Tarefa; ti: number }[] = [];
  for (const d of S.deals) d.obra.plano?.tasks.forEach((t, ti) => { if (t.exec && t.exec.horas > 0) out.push({ d, t, ti }); });
  return out;
}

export function desempenhoServicos(S: Estado): Map<SvcId, DesempenhoServico> {
  const M = new Map<SvcId, DesempenhoServico>();
  const de = (sid: SvcId) => { let x = M.get(sid); if (!x) M.set(sid, (x = { sid, orcamentos: 0, ganhos: 0, receita: 0, hPrev: 0, hReal: 0 })); return x; };
  for (const d of S.deals) {
    if (!d.orc) continue;
    const vistos = new Set<SvcId>();
    for (const l of d.orc.linhas) {
      if (l.t !== "svc") continue;
      const x = de(l.sid);
      if (!vistos.has(l.sid)) { vistos.add(l.sid); x.orcamentos++; if (ganho(d)) x.ganhos++; }
      if (ganho(d)) x.receita += l.q * l.pu;
    }
  }
  // as horas de uma tarefa com vários serviços repartem-se em partes iguais
  for (const { t } of tarefasComRegisto(S)) {
    if (!t.svcs.length) continue;
    for (const sid of t.svcs) { const x = de(sid); x.hPrev += t.h / t.svcs.length; x.hReal += t.exec!.horas / t.svcs.length; }
  }
  return M;
}

export interface DesempenhoTecnico {
  id: string;
  n: string;
  sk: string;
  /** Tarefas atribuídas ao técnico, em todas as obras. */
  tarefas: number;
  validadas: number;
  /** Tarefas dele que voltaram com um pedido de correção. */
  correcoes: number;
  /** Nas tarefas com registo: as horas previstas e as registadas. */
  hPrev: number;
  hReal: number;
  obras: number;
}

export function desempenhoTecnicos(S: Estado): DesempenhoTecnico[] {
  return TECS.map((x) => {
    let tarefas = 0, validadas = 0, correcoes = 0, hPrev = 0, hReal = 0;
    const obras = new Set<number>();
    for (const d of S.deals) {
      const p = d.obra.plano;
      if (!p) continue;
      p.tasks.forEach((t, ti) => {
        if (t.tec !== x.id) return;
        tarefas++; obras.add(d.id);
        if (t.exec?.estado === "validada") validadas++;
        if (t.exec?.envios?.some((e) => e.k === "correcao") || p.tasks.some((c) => c.corrige === ti)) correcoes++;
        if (t.exec && t.exec.horas > 0) { hPrev += t.h; hReal += t.exec.horas; }
      });
    }
    return { id: x.id, n: x.n, sk: x.sk, tarefas, validadas, correcoes, hPrev, hReal, obras: obras.size };
  }).sort((a, b) => b.tarefas - a.tarefas || a.n.localeCompare(b.n));
}

/** O desvio das horas (0,1 = 10% acima do previsto); null sem registo. */
export const desvio = (hPrev: number, hReal: number): number | null => (hPrev > 0 ? hReal / hPrev - 1 : null);

/** O desvio em palavras: "no previsto" até 5%, senão "+12% de horas" / "−8% de horas". */
export function desvioEmPalavras(v: number | null): string {
  if (v == null) return "sem registos";
  if (Math.abs(v) < 0.05) return "no previsto";
  return `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}% de horas`;
}
