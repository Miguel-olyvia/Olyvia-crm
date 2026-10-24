// Os equipamentos na obra (V2, 13/10/2026; docs/melhorias-v2-2026-10-13, 4.5, "Baixa"). Funções puras, sem React.
// - Que equipamentos a obra usa: os das receitas dos serviços do orçamento (horas por medida × medida), juntos por tarefa do plano,
//   com as datas da tarefa (os dias em que ficam reservados).
// - No fecho da tarefa, as horas reais confirmam-se na linha (escolhendo, não escrevendo) e ficam no registo da obra (RegObra.horasEquip).
// - O previsto contra real dos equipamentos usa essas horas; as que ainda não foram confirmadas usam o fator de exemplo (realExemplo.ts).
import { r2, type Estado, type Negocio } from "../motor";
import { equipHora, receitaDe, type Custos } from "./custosModelo";
import { datasTarefa, feita, type RegObra } from "./operacoes";

export interface LinhaEquipObra {
  /** "tarefa:equipamento" (a chave das horas confirmadas). */
  chave: string;
  equip: string;
  nome: string;
  /** €/h do equipamento (Custos · Equipamentos). */
  eh: number;
  /** O índice da tarefa no plano (-1: o serviço não tem tarefa no plano). */
  tarefa: number;
  tarefaNome: string;
  /** Os dias reservados (os da tarefa). */
  datas: string;
  /** Os serviços que o usam nesta tarefa. */
  servicos: string[];
  /** Horas previstas: Σ horas por medida × medida. */
  hPrev: number;
  /** Horas reais confirmadas no fecho da tarefa (null: por confirmar). */
  hReal: number | null;
  /** A tarefa já foi feita (pode confirmar-se). */
  feita: boolean;
}

export const chaveEquip = (tarefa: number, equip: string): string => `${tarefa}:${equip}`;

/** Os equipamentos da obra, por tarefa do plano e pela ordem do plano. */
export function equipamentosObra(d: Negocio, S: Estado, C: Custos, reg: RegObra): LinhaEquipObra[] {
  const p = d.obra.plano;
  if (!p || !d.orc) return [];
  const por = new Map<string, LinhaEquipObra>();
  for (const l of d.orc.linhas) {
    if (l.t !== "svc" || !(l.q > 0)) continue;
    const s = S.svc[l.sid], rec = receitaDe(C, l.sid, s ?? null, S.cfg.alvo);
    if (!rec) continue;
    const ti = p.tasks.findIndex((t) => t.svcs.includes(l.sid)), t = p.tasks[ti];
    for (const u of rec.equip) {
      const e = C.equip.find((x) => x.id === u.equip);
      if (!e || !(u.h > 0)) continue;
      const chave = chaveEquip(ti, e.id);
      const atual = por.get(chave) ?? {
        chave, equip: e.id, nome: e.n, eh: equipHora(e), tarefa: ti, tarefaNome: t ? t.nome : "Fora do plano", datas: t ? datasTarefa(t) : "sem data",
        servicos: [], hPrev: 0, hReal: reg.horasEquip?.[chave] ?? null, feita: ti >= 0 && feita(p, ti),
      };
      atual.hPrev += u.h * l.q;
      const nome = s?.n ?? l.sid;
      if (!atual.servicos.includes(nome)) atual.servicos.push(nome);
      por.set(chave, atual);
    }
  }
  return [...por.values()].map((x) => ({ ...x, hPrev: r2(x.hPrev) }))
    .sort((a, b) => (a.tarefa < 0 ? 1e6 : a.tarefa) - (b.tarefa < 0 ? 1e6 : b.tarefa) || a.nome.localeCompare(b.nome, "pt"));
}

const meiaHora = (h: number): number => Math.round(h * 2) / 2;

/** As horas sugeridas no fecho: as previstas vezes o fator de exemplo, à meia hora (pelo menos meia hora). */
export const horasSugeridas = (hPrev: number, fator = 1): number => Math.max(0.5, meiaHora(hPrev * fator));

/** As horas que se podem escolher no fecho: a sugestão e meia hora e uma hora para cada lado (só positivas). */
export function opcoesHoras(sugerida: number): number[] {
  const s = meiaHora(sugerida);
  return [...new Set([s - 1, s - 0.5, s, s + 0.5, s + 1].map(meiaHora))].filter((h) => h > 0);
}

/** Confirma as horas reais de um equipamento numa tarefa (devolve um registo novo). */
export function confirmarHorasEquip(reg: RegObra, chave: string, horas: number): RegObra {
  if (!(horas > 0)) return reg;
  return { ...reg, horasEquip: { ...(reg.horasEquip ?? {}), [chave]: horas } };
}

/** As horas reais de uma linha: as confirmadas, ou (por confirmar) as previstas vezes o fator de exemplo. */
export const horasReais = (l: LinhaEquipObra, fator: number): number => l.hReal ?? r2(l.hPrev * fator);

/**
 * O custo dos equipamentos para o previsto contra real: só as tarefas já feitas. O previsto são as horas da receita × €/h;
 * o real são as horas confirmadas (ou, por confirmar, as de exemplo) × €/h.
 */
export function custoEquipamentos(linhas: readonly LinhaEquipObra[], fator: number): { prev: number; real: number; confirmadas: number; feitas: number } {
  const fs = linhas.filter((l) => l.feita);
  return {
    prev: r2(fs.reduce((a, l) => a + l.hPrev * l.eh, 0)),
    real: r2(fs.reduce((a, l) => a + horasReais(l, fator) * l.eh, 0)),
    confirmadas: fs.filter((l) => l.hReal !== null).length,
    feitas: fs.length,
  };
}
