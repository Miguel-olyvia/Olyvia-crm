// 23/11 (revisão do 1015: «8 pessoas para uma casa de banho de 2 m²»): o aviso de dispersão da equipa e a sugestão de juntar tarefas no
// mesmo técnico. Cada pessoa a mais numa obra pequena é mais uma deslocação e mais uma passagem de mão. A sugestão tira as tarefas a quem
// tem poucas nesta obra e dá-as a quem já cá está, é do ofício e está livre nesses dias (nesta obra e nas outras). As datas e as horas não
// mudam (o fim também não); só muda quem faz. Nada se aplica sem o toque do gestor.
import type { Plano } from "../motor";
import { motivoOcupado, tecnicosDoOficio } from "../preparacaoObra";
import { estadoVivo } from "./planoVivo";

export interface Passagem { ti: number; de: string; para: string }
export interface Dispersao { pessoas: number; tarefas: number; dias: number; passagens: Passagem[]; depois: number; deslocacoesAntes: number; deslocacoesDepois: number }

/** As idas à obra: um técnico num dia conta uma vez. */
function deslocacoes(p: Plano, tecDe: (ti: number) => string | null): number {
  const s = new Set<string>();
  p.tasks.forEach((t, ti) => { const tec = tecDe(ti); if (tec) for (let k = t.dia; k < t.dia + Math.max(1, t.dur); k++) s.add(`${tec}:${k}`); });
  return s.size;
}

/** A dispersão da equipa e as passagens que a reduzem (null quando a equipa já é pequena para a obra). */
export function dispersaoDaEquipa(p: Plano, ocup: Map<string, Set<string>>): Dispersao | null {
  const tec = p.tasks.map((t) => t.tec);
  const pessoas = new Set(tec.filter(Boolean)).size, dias = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur)) - Math.min(...p.tasks.map((t) => t.dia));
  // pequena: até 4 pessoas, ou menos de uma pessoa por cada 4 tarefas
  if (pessoas <= 4 || pessoas <= Math.ceil(p.tasks.length / 4)) return null;
  const atual = [...tec];
  const conta = () => { const m = new Map<string, number>(); for (const x of atual) if (x) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const passagens: Passagem[] = [];
  // de quem tem menos tarefas para quem tem mais, uma tarefa de cada vez
  for (let volta = 0; volta < p.tasks.length; volta++) {
    const n = conta();
    const poucos = [...n.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    let feita = false;
    for (const de of poucos) {
      for (const ti of atual.map((x, i) => (x === de ? i : -1)).filter((i) => i >= 0)) {
        const t = p.tasks[ti];
        if (estadoVivo(t, p) !== "por começar" || t.exec) continue;
        const outras = p.tasks.map((x, i) => ({ ...x, tec: atual[i] })).filter((_, i) => i !== ti);
        const oficio = new Set(tecnicosDoOficio(t).map((x) => x.id));
        const cand = [...n.entries()].filter(([id, k]) => id !== de && k >= (n.get(de) ?? 0) && oficio.has(id) && motivoOcupado(id, t, p, ocup, outras) == null).sort((a, b) => b[1] - a[1])[0];
        if (!cand) continue;
        passagens.push({ ti, de, para: cand[0] });
        atual[ti] = cand[0];
        feita = true;
        break;
      }
      if (feita) break;
    }
    if (!feita) break;
  }
  if (!passagens.length) return null;
  return {
    pessoas, tarefas: p.tasks.length, dias, passagens, depois: new Set(atual.filter(Boolean)).size,
    deslocacoesAntes: deslocacoes(p, (ti) => tec[ti]), deslocacoesDepois: deslocacoes(p, (ti) => atual[ti]),
  };
}
