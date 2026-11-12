// 12/11 (Rúben: «quem paga?»). Com a obra em curso, juntar uma tarefa, prolongá-la (dias ou horas) ou dar-lhe um atraso pergunta porquê:
//  · «O cliente pediu»: paga o cliente. Vai numa adenda já preenchida e só entra no plano quando ele a assinar.
//  · «Imprevisto em obra»: segue o registo do imprevisto (fotos, custo, dias).
//  · «Atraso ou erro nosso»: paga a empresa. Entra já; o custo fica registado e a margem ao vivo mostra-o.
// Aqui ficam as contas sem mexer em nada (o impacto antes de escolher) e a aplicação no plano (o motor e a assinatura da adenda usam-na).
import { TECS, horaDoPerfil, r2, type Estado, type Negocio, type Plano, type Tarefa } from "../motor";
import { fimDe, mudarInicio } from "../ajustesPlano";
import { aplicarAjuste } from "../trabalhoObra";
import { criarTarefa, juntarTarefa, materiaisDoServico, type NovaTarefa } from "../tarefasValidador";
import { custoHoraDe } from "../equipa/tecnicos";
import { precoSugeridoLivre, previsaoLinha, totaisLinhas, type LinhaAdenda } from "../adendas";
import { comecada, estadoVivo, simularAtraso } from "./planoVivo";

/** O que o gestor quer mudar (a tarefa vai pelo índice no plano de agora). */
export type AjusteObra =
  | { k: "prolongar"; ti: number; dur?: number; h?: number }
  | { k: "atraso"; ti: number; dias: number }
  | { k: "nova"; n: NovaTarefa };
/** O mesmo, guardado na adenda: a tarefa pelo nome (os índices mudam enquanto o cliente decide). */
export type AjusteAdenda =
  | { k: "prolongar"; tarefa: string; dur?: number; h?: number; horas: number }
  | { k: "atraso"; tarefa: string; dias: number; horas: number }
  | { k: "nova"; n: NovaTarefa };

export type QuemPaga = "cliente" | "imprevisto" | "empresa";
export const PORQUE = [
  { k: "cliente" as const, t: "O cliente pediu", sub: "Paga o cliente: vai uma adenda ao portal. Só entra no plano quando ele a assinar." },
  { k: "imprevisto" as const, t: "Imprevisto em obra", sub: "Abre o registo do imprevisto, com fotos. Se tiver custo, o cliente decide." },
  { k: "empresa" as const, t: "Atraso ou erro nosso", sub: "Paga a empresa: entra já no plano. O custo fica registado e sai da margem." },
];
/** O motivo que fica no registo de cada um. */
export const MOTIVO_QUEM_PAGA: Record<QuemPaga, string> = { cliente: "Pedido do cliente", imprevisto: "Imprevisto na obra", empresa: "Atraso ou erro nosso" };

const meia = (h: number) => Math.round(h * 2) / 2;
const tarefaPorNome = (p: Plano, nome: string) => p.tasks.findIndex((t) => t.nome === nome && t.exec?.estado !== "validada");

/** Passa o ajuste para a forma que se guarda na adenda. */
export function guardarAjuste(p: Plano, aj: AjusteObra, horas: number): AjusteAdenda {
  if (aj.k === "nova") return { k: "nova", n: { ...aj.n } };
  const nome = p.tasks[aj.ti]?.nome ?? "";
  return aj.k === "prolongar" ? { k: "prolongar", tarefa: nome, ...(aj.dur != null ? { dur: aj.dur } : {}), ...(aj.h != null ? { h: aj.h } : {}), horas } : { k: "atraso", tarefa: nome, dias: aj.dias, horas };
}

/** Aplica o ajuste ao plano (o real ou uma cópia). Devolve o índice da tarefa mexida (ou −1). `horas`: as horas a mais de um atraso
 *  numa tarefa começada (mais dias de trabalho = mais horas no plano). */
export function aplicarNoPlano(S: Estado, p: Plano, aj: AjusteObra | AjusteAdenda, ocup: Map<string, Set<string>>, horas = 0): number {
  if (aj.k === "nova") {
    const s = S.svc[aj.n.sid];
    if (!s) return -1;
    const t = criarTarefa(p, s, aj.n), ti = juntarTarefa(p, t);
    const i = p.tasks.indexOf(t);
    if (p.estado === "em curso" && t.dia < p.dia) mudarInicio(p, i, p.dia);
    return i >= 0 ? i : ti;
  }
  const ti = "ti" in aj ? aj.ti : tarefaPorNome(p, aj.tarefa);
  const t = p.tasks[ti];
  if (!t) return -1;
  if (aj.k === "prolongar") { aplicarAjuste(p, ti, { ...(aj.dur != null ? { dur: aj.dur } : {}), ...(aj.h != null ? { h: aj.h } : {}) }); return ti; }
  const r = simularAtraso(p, ti, aj.dias, ocup);
  for (const x of r.mudancas) { const y = p.tasks[x.ti]; y.dia = x.para.dia; y.dur = x.para.dur; }
  const h = "horas" in aj ? aj.horas : horas;
  if (h > 0 && comecada(t)) t.h = r2(t.h + h);
  return ti;
}

export interface ImpactoAjuste {
  /** a tarefa (o nome) e o que muda, em frase */
  nome: string; texto: string;
  /** as horas de trabalho a mais e os dias a mais no fim da obra */
  horas: number; dias: number;
  fimAntes: number; fimDepois: number;
  /** o ofício (para o €/h) */
  perfil: string;
  /** o custo para a empresa (horas × €/h do técnico, mais os materiais da tarefa nova) */
  custo: number;
  /** a linha da adenda (o que o cliente paga, sem IVA) e o total com IVA */
  linha: LinhaAdenda | null; precoCliente: number; totalCliente: number;
  /** a tarefa nova: o serviço e a quantidade (vai como serviço na adenda, com os materiais da receita) */
  servico?: { sid: string; q: number };
}

/** O impacto do ajuste, antes de escolher: + € para o cliente (a adenda), − € de margem (se pagar a empresa) e + dias no fim. */
export function impactoAjuste(S: Estado, p: Plano, aj: AjusteObra, ocup: Map<string, Set<string>>, horasAtraso?: number): ImpactoAjuste | null {
  const c: Plano = structuredClone(p);
  const fimAntes = fimDe(p.tasks);
  if (aj.k === "nova") {
    const s = S.svc[aj.n.sid];
    if (!s) return null;
    const ti = aplicarNoPlano(S, c, aj, ocup), t = c.tasks[ti];
    if (!t) return null;
    const mats = t.mats ?? materiaisDoServico(aj.n.sid, aj.n.q);
    const custoMats = r2(mats.reduce((a, m) => a + (m.preco ?? 0) * m.q, 0));
    const linha = previsaoLinha(S, aj.n.sid, aj.n.q);
    const T = linha ? totaisLinhas([linha]) : null;
    return { nome: t.nome, texto: `Tarefa nova: ${t.nome}`, horas: t.h, dias: fimDe(c.tasks) - fimAntes, fimAntes, fimDepois: fimDe(c.tasks), perfil: t.sk,
      custo: r2(t.h * custoDaHora(S, t) + custoMats), linha, precoCliente: r2(T?.base ?? 0), totalCliente: r2(T?.total ?? 0), servico: { sid: aj.n.sid, q: aj.n.q } };
  }
  const t0 = p.tasks[aj.ti];
  if (!t0) return null;
  // as horas a mais de um atraso: numa tarefa começada, os dias a mais ao ritmo dela; numa por começar, o início só anda (sem horas)
  const horasAt = aj.k === "atraso" ? (horasAtraso ?? (comecada(t0) ? meia((t0.h / Math.max(1, t0.dur)) * aj.dias) : 0)) : 0;
  aplicarNoPlano(S, c, aj, ocup, horasAt);
  const t1 = c.tasks[aj.ti];
  const horas = aj.k === "atraso" ? horasAt : Math.max(0, r2(t1.h - t0.h));
  const perfil = t0.sk;
  const linha: LinhaAdenda | null = horas > 0 ? { sid: "livre-previa", n: `Mais tempo em ${t0.nome.toLowerCase()}`, un: "vg", q: 1, pu: precoSugeridoLivre(S, horas, perfil), h: horas, perfil, livre: true, mats: [] } : null;
  const T = linha ? totaisLinhas([linha]) : null;
  const dDias = aj.k === "atraso" ? aj.dias : t1.dur - t0.dur;
  const texto = aj.k === "atraso"
    ? `${t0.nome}: mais ${aj.dias} ${aj.dias === 1 ? "dia" : "dias"}${horas ? ` (+${nf(horas)} h)` : ""}`
    : `${t0.nome}: ${aj.h != null ? `${nf(t0.h)} → ${nf(t1.h)} h` : `${t0.dur} → ${t1.dur} ${t1.dur === 1 ? "dia" : "dias"}`}${dDias > 0 && aj.h != null ? ` (+${dDias} ${dDias === 1 ? "dia" : "dias"})` : ""}`;
  return { nome: t0.nome, texto, horas, dias: fimDe(c.tasks) - fimAntes, fimAntes, fimDepois: fimDe(c.tasks), perfil, custo: r2(horas * custoDaHora(S, t0)),
    linha, precoCliente: r2(T?.base ?? 0), totalCliente: r2(T?.total ?? 0) };
}
const nf = (n: number) => String(r2(n)).replace(".", ",");
/** O custo de uma hora da tarefa: o do técnico (RH), ou o do ofício sem técnico. */
export function custoDaHora(S: Estado, t: Pick<Tarefa, "tec" | "sk">): number {
  if (t.tec && TECS.some((x) => x.id === t.tec)) return custoHoraDe(t.tec);
  return horaDoPerfil(S, t.sk).eh || custoHoraDe(null);
}

/** Muda alguma coisa que se paga? (com a obra em curso: mais dias ou horas numa tarefa, um atraso ou uma tarefa nova). */
export function pedePorque(p: Plano, aj: AjusteObra): boolean {
  if (p.estado !== "em curso") return false;
  if (aj.k === "nova") return true;
  const t = p.tasks[aj.ti];
  if (!t) return false;
  if (aj.k === "atraso") return aj.dias > 0;
  return (aj.dur != null && aj.dur > t.dur) || (aj.h != null && aj.h > t.h + 1e-9);
}

/** O que os nossos atrasos custam (as mudanças pagas pela empresa). `aoVivo`: só as das tarefas por acabar (as acabadas já contam pelas
 *  horas registadas, no desvio da mão de obra). */
export function custoDosNossos(d: Negocio, aoVivo = false): { n: number; custo: number; horas: number } {
  const p = d.obra.plano;
  const L = (d.obra.alteracoes ?? []).filter((x) => x.paga === "empresa" && (x.custo ?? 0) > 0).filter((x) => {
    if (!aoVivo || !p) return true;
    const t = p.tasks.find((y) => y.nome === x.tarefa);
    if (!t) return true;
    const v = estadoVivo(t, p);
    return v !== "feita" && v !== "validada";
  });
  return { n: L.length, custo: r2(L.reduce((a, x) => a + (x.custo ?? 0), 0)), horas: r2(L.reduce((a, x) => a + (x.horas ?? 0), 0)) };
}
