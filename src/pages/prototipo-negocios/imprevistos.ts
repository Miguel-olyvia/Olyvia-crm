// Os imprevistos a meio da obra (21/10/2026): o técnico ou o gestor encontram um problema (ex.: um cano podre) que impede de continuar
// ou atrasa outras tarefas. Fica registado com o que se encontrou (texto e fotografia), onde, a gravidade e as tarefas afetadas:
// · «Impede de continuar»: as tarefas afetadas ficam paradas (bloqueio), à espera da decisão do cliente.
// · «Atrasa»: o plano anda os dias indicados (com as regras dos ajustes ao vivo, trabalhoObra.aplicarAjuste) e o cliente é avisado.
// O gestor transforma-o em trabalho extra: uma ADENDA ao contrato (adendas.ts) com origem «imprevisto na obra», com os serviços do
// Catálogo e/ou uma linha livre (horas, preço e materiais). O cliente assina ou recusa no portal; assinada, as tarefas entram no plano
// (e os materiais numa encomenda de ajuste, encomendasAjuste.ts), as paradas seguem e o Financeiro fatura a adenda à parte.
// Sem React; o motor chama estas funções (A.registarImprevisto, A.proporImprevisto, A.decidirImprevisto).
import { fimDe } from "./ajustesPlano";
import { estadoDe } from "./obraOps";
import { aplicarAjuste } from "./trabalhoObra";
import type { MatTarefa, Negocio, Plano, Tarefa } from "./motor";

export type Gravidade = "impede" | "atrasa";
export const GRAVIDADES: { k: Gravidade; t: string; sub: string }[] = [
  { k: "impede", t: "Impede de continuar", sub: "As tarefas afetadas param até o cliente decidir" },
  { k: "atrasa", t: "Atrasa", sub: "O plano anda os dias que indicar; o cliente é avisado" },
];
export type EstadoImprevisto = "aberto" | "proposta" | "aprovado" | "recusado" | "fechado";
export interface Imprevisto {
  /** IM-<negócio>-<n> */
  id: string; q: string; dia: number; quem: string;
  texto: string; onde: string; foto?: string;
  grav: Gravidade;
  /** os nomes das tarefas afetadas (os índices mudam quando o plano se reordena) */
  tarefas: string[];
  /** os dias que o plano andou (só «atrasa») */
  atraso?: number;
  estado: EstadoImprevisto;
  /** a adenda (proposta ao cliente) que o resolve */
  adenda?: string;
  /** com a proposta recusada (ou sem proposta): o que o gestor decidiu */
  decisao?: string;
}
/** Uma linha livre da proposta de um imprevisto: o trabalho, as horas, o preço sem IVA e os materiais. */
export interface LinhaLivre { n: string; h: number; preco: number; perfil: string; mats: MatTarefa[] }

/** O que o gestor pode decidir quando o cliente não aceita a proposta (ou sem proposta). */
export const DECISOES = [
  { k: "seguir", t: "Seguir sem esse trabalho", sub: "As tarefas paradas continuam como estavam" },
  { k: "refazer", t: "Fazer outra proposta", sub: "O imprevisto volta a aberto, para propor outra coisa" },
  { k: "suspender", t: "Suspender a obra", sub: "As tarefas ficam paradas até se combinar com o cliente" },
] as const;
export type Decisao = (typeof DECISOES)[number]["k"];

export const imprevistosDe = (d: Negocio): Imprevisto[] => d.obra.imprevistos ?? [];
/** Os que esperam por alguém da empresa (o gestor): aberto (fazer a proposta) ou recusado (decidir). */
export const imprevistosPorTratar = (d: Negocio): Imprevisto[] => imprevistosDe(d).filter((i) => i.estado === "aberto" || i.estado === "recusado");
export const novoIdImprevisto = (d: Negocio) => `IM-${d.id}-${imprevistosDe(d).length + 1}`;

/** As tarefas que um imprevisto pode afetar: as que ainda não foram validadas (nem as correções). */
export const tarefasAfetaveis = (p: Plano): number[] =>
  p.tasks.map((t, i) => (estadoDe(t) !== "validada" && t.corrige == null ? i : -1)).filter((i) => i >= 0);

/** As tarefas paradas por um imprevisto. */
export const paradasPor = (p: Plano | null | undefined, id: string): Tarefa[] => p?.tasks.filter((t) => t.bloqueio === id) ?? [];
/** A tarefa está parada por um imprevisto (o técnico não a pode registar como feita). */
export const parada = (t: Tarefa): boolean => !!t.bloqueio;

export function bloquear(p: Plano, tis: number[], id: string): void {
  for (const ti of tis) { const t = p.tasks[ti]; if (t && estadoDe(t) !== "validada") t.bloqueio = id; }
}
export function desbloquear(p: Plano, id: string): number {
  let n = 0;
  for (const t of p.tasks) if (t.bloqueio === id) { delete t.bloqueio; n++; }
  return n;
}

/**
 * Atrasa as tarefas afetadas `dias` dias úteis, com as regras da obra em curso: a que já começou fica mais longa, a que ainda não
 * começou começa mais tarde (e o que vem depois anda). Uma tarefa que já andou por causa de outra não anda duas vezes.
 * Devolve o fim da obra antes e depois (índices de dia).
 */
export function atrasar(p: Plano, tis: number[], dias: number): { fimAntes: number; fimDepois: number } {
  const fimAntes = fimDe(p.tasks), antes = p.tasks.map((t) => [t.dia, t.dur]);
  for (const ti of [...tis].sort((a, b) => p.tasks[a].dia - p.tasks[b].dia)) {
    const t = p.tasks[ti];
    if (!t || t.dia !== antes[ti][0] || t.dur !== antes[ti][1]) continue;
    if (t.dia <= p.dia) aplicarAjuste(p, ti, { dur: t.dur + dias });
    else aplicarAjuste(p, ti, { dia: t.dia + dias });
  }
  return { fimAntes, fimDepois: fimDe(p.tasks) };
}

/** O aviso ao cliente no portal, em linguagem simples. */
export function avisoClienteImprevisto(i: Pick<Imprevisto, "texto" | "onde" | "grav">, fim?: { antes: string; depois: string }): string {
  const o = i.onde ? ` (${i.onde.toLowerCase()})` : "";
  if (i.grav === "impede") return `Encontrámos um problema na obra${o}: ${i.texto.replace(/\.$/, "")}. Os trabalhos afetados ficam parados até decidir connosco; vamos enviar-lhe uma proposta.`;
  const f = fim ? (fim.antes === fim.depois ? ` A data de fim mantém-se: ${fim.depois}.` : ` A obra passa a acabar a ${fim.depois} (antes: ${fim.antes}).`) : "";
  return `Encontrámos um problema na obra${o}: ${i.texto.replace(/\.$/, "")}. Atrasa alguns trabalhos.${f}`;
}
