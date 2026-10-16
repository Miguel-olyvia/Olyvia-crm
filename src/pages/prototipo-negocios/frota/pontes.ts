// As pontes da Frota para o resto do protótipo, sem React e sem o motor do Inventário (esse está em pontesInv.ts):
// - Obras: as obras do Estado (negócios em obra com plano) e as tarefas do plano (as "ordens" de cada dia).
// - Agenda: as viaturas ativas como recursos "Veículo" (com o que as bloqueia em cada dia).
// - Custos: o custo por km real, para a deslocação (com os 0,40 €/km de sempre quando não há dados).
// - Navegação: um pedido para abrir a Frota (numa viatura) vindo de outro módulo (Definições › Agenda, página da obra).
import { useSyncExternalStore } from "react";
import type { Estado } from "../motor";
import type { Recurso } from "../v2/agendaDefinicoes";
import { HOJE, addDias } from "./base";
import { lerFrota, type AbaFrota } from "./loja";
import { ativa, bloqueios, custoKmDeslocacao } from "./regras";
import type { Frota, ObraRef } from "./tipos";

/* ------------------------------------------------------------------ Obras */

/** As obras do protótipo, tal como a Frota as vê: os negócios em obra com plano, com as tarefas (as "ordens" de cada dia). */
export function obrasDoEstado(S: Estado): ObraRef[] {
  return S.deals.filter((d) => d.fase === 5 && d.obra.plano).map((d) => ({
    id: d.id, nome: d.nome, servico: d.servico, local: d.f.localidade || d.local.split(",").pop()!.trim(), estado: d.obra.plano!.estado,
    tarefas: d.obra.plano!.tasks.map((t) => ({ nome: t.nome, dia: t.dia, dur: t.dur, tec: t.tec })),
  }));
}
/** "Obra #1022 · WC · Marta Lima, Odivelas". */
export const nomeObra = (o: ObraRef): string => `Obra #${o.id} · ${o.servico} · ${o.nome}, ${o.local}`;

/* ------------------------------------------------------------------ Agenda */

const SEMANA = [true, true, true, true, true, false, false];
/** As viaturas ativas da Frota como recursos "Veículo" da Agenda. A que já existia na Agenda com outro nome guarda-o (recursoAgenda). */
export function recursosFrota(F: Frota = lerFrota()): (Recurso & { vid: string; mat: string; antigo?: string })[] {
  return F.viaturas.filter((v) => ativa(v) && v.agenda !== false).map((v) => ({ id: "frota-" + v.id, vid: v.id, mat: v.mat, nome: `${v.marca} ${v.modelo.split(" ")[0]} · ${v.mat}`, tipo: "Veículo" as const, dias: [...SEMANA], antigo: v.recursoAgenda }));
}
/** O que bloqueia a viatura nos próximos `n` dias (reservas pontuais, manutenções e oficina), em texto curto por dia. */
export function bloqueiosSemana(F: Frota, vid: string, n = 7, desde = HOJE): { data: string; txt: string }[] {
  const out: { data: string; txt: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDias(desde, i);
    const b = bloqueios(F, vid, d).filter((x) => x.tipo !== "permanente");
    if (b.length) out.push({ data: d, txt: b.map((x) => (x.tipo === "pontual" ? `reservada a ${x.txt}` : x.txt)).join(" · ") });
  }
  return out;
}

/* ------------------------------------------------------------------ Custos */

/** O custo por km real (da viatura, ou a média da frota) para a deslocação das obras; sem dados, 0,40 €/km. */
export const custoKmFrota = (vid?: string): number => custoKmDeslocacao(lerFrota(), vid);

/* ------------------------------------------------------------------ navegação vinda de fora */

export interface PedidoFrota { n: number; aba?: AbaFrota; vid?: string }
let pedido: PedidoFrota | null = null, seq = 0, moldura = false;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };
const subscrever = (fn: () => void): (() => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };

/** A moldura do protótipo diz se consegue abrir a Frota (na Atual e na V2 do aspeto simples, 16/10: a mesma condição do menu). Ao deixar de conseguir, um pedido pendente cai. */
export function definirMolduraFrota(pode: boolean): void {
  if (moldura === pode && (pode || !pedido)) return;
  moldura = pode;
  if (!pode) pedido = null;
  avisar();
}
export const lerMolduraFrota = (): boolean => moldura;
export function useMolduraFrota(): boolean { return useSyncExternalStore(subscrever, lerMolduraFrota, lerMolduraFrota); }

/** Pede ao protótipo que abra a Frota (numa viatura). Sem uma moldura que a abra, o pedido não se faz (devolve false) e não fica à espera. */
export function pedirFrota(p: Omit<PedidoFrota, "n">): boolean {
  if (!moldura) return false;
  pedido = { ...p, n: ++seq };
  avisar();
  return true;
}
export const lerPedidoFrota = (): PedidoFrota | null => pedido;
/** Quem abre a Frota tratou o pedido: deixa de estar pendente (não é consumido mais tarde). */
export function tratarPedidoFrota(): void { if (pedido) { pedido = null; avisar(); } }
export function usePedidoFrota(): PedidoFrota | null { return useSyncExternalStore(subscrever, lerPedidoFrota, lerPedidoFrota); }
