// Trabalhos a mais depois do contrato assinado (14/10/2026): a adenda ao contrato. Sem React.
// O comercial escolhe os serviços e as quantidades; a adenda vai ao cliente para assinar; assinada, as tarefas entram no
// plano da obra (no fim da fase de cada serviço, ou no fim da obra) e o plano volta a aprovação das Operações, se já estava
// aprovado. Fatura-se à parte (só mão de obra e consumíveis dos serviços: IVA a 6%).
import { TECS, diaDeFerias, garantirServico, r2, IVA_MO, type Estado, type Plano, type Tarefa } from "./motor";
import { diasDeHoras } from "./ganttOrcamento";
import { fasesPadrao, type FaseObra } from "./fasesObra";
import { skDaTarefa } from "./preparacaoObra";

export interface LinhaAdenda { sid: string; n: string; un: string; q: number; pu: number; h: number; perfil: string }
export interface Adenda {
  n: string; estado: "enviada" | "assinada"; criada: string; assinada?: string;
  motivo: string; linhas: LinhaAdenda[];
}
export const MOTIVOS_ADENDA = ["O cliente pediu", "Surpresa em obra", "Erro de medição"] as const;

/** Uma linha da adenda: o serviço (do Catálogo, entra em uso se ainda não estava), a quantidade, o preço e as horas por unidade. */
export function linhaAdenda(S: Estado, sid: string, q: number): LinhaAdenda | null {
  const s = garantirServico(S, sid);
  if (!s) return null;
  return { sid, n: s.n, un: s.un, q, pu: r2(s.preco), h: s.h, perfil: s.perfil };
}
export const totalAdenda = (L: LinhaAdenda[]) => r2(L.reduce((a, x) => a + x.q * x.pu, 0));
export const totalComIva = (L: LinhaAdenda[]) => r2(totalAdenda(L) * (1 + IVA_MO));
/** Os dias úteis a mais (cada serviço em sequência, como no plano). */
export const diasAdenda = (L: LinhaAdenda[]) => L.reduce((a, x) => a + Math.max(1, Math.ceil(diasDeHoras(x.h * x.q) - 1e-9)), 0);

/** As tarefas da adenda no plano: cada uma no fim da sua fase (as tarefas seguintes empurram-se), com um técnico do ofício livre. */
export function juntarAoPlano(p: Plano, a: Adenda): Tarefa[] {
  const novas: Tarefa[] = [];
  for (const x of a.linhas) {
    const fase: FaseObra = fasesPadrao(x.n, x.perfil)[0];
    const dur = Math.max(1, Math.ceil(diasDeHoras(x.h * x.q) - 1e-9));
    // começa quando acaba a última tarefa desta fase (ou das anteriores); as das fases seguintes andam `dur` dias
    const ate = p.tasks.filter((t) => (t.fase ?? 4) <= fase);
    const dia = ate.length ? Math.max(...ate.map((t) => t.dia + t.dur)) : 0;
    for (const t of p.tasks) if (t.dia >= dia && (t.fase ?? 4) > fase) t.dia += dur;
    const sk = skDaTarefa(x.perfil, x.n);
    const doOficio = TECS.filter((t) => t.sk === sk);
    const tec = doOficio.find((t) => diaDeFerias(t, p, dia, dur) == null) ?? doOficio[0];
    const t: Tarefa = { nome: `${x.n} (adenda ${a.n})`, svcs: [x.sid], dia, dur, sk, h: r2(x.h * x.q), tec: tec?.id ?? null, fase };
    p.tasks.push(t); novas.push(t);
  }
  p.tasks.sort((a1, b1) => a1.dia - b1.dia || (a1.fase ?? 0) - (b1.fase ?? 0));
  return novas;
}
