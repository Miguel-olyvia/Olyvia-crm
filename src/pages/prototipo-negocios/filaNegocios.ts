// As vistas rápidas de Negócios V2, sem React: cada chip é uma vista que já existe (a fase, o tempo parado, o atraso) e o número que mostra é o do Quadro depois de a aplicar
// por cima dos filtros de agora, ou seja, o que o clique abre. Nada aqui muda o Estado.
import { selecionarQuadro, type AcaoN, type ContextoN, type FiltrosN, type LinhaN } from "./filtrosNegocios";
import type { ItemVista } from "./ChipsVista";

/** O que o chip aplica: os filtros do painel (AcaoN) ou o filtro rápido "Com atraso" (que vive no Estado). */
export interface AcaoVistaN extends AcaoN { rapido?: "atraso" }
export interface ItemVistaN extends ItemVista { acao: AcaoVistaN }

const DEFS: readonly { id: string; titulo: string; acao: AcaoVistaN }[] = [
  { id: "enviar", titulo: "Para enviar", acao: { f: { fase: "orcamento" } } },
  { id: "espera", titulo: "À espera do cliente", acao: { f: { fase: "proposta" } } },
  { id: "assinar", titulo: "Por assinar", acao: { f: { fase: "contrato" } } },
  { id: "financeiro", titulo: "Em Financeiro", acao: { f: { fase: "financeiro" } } },
  { id: "parados", titulo: "Parados 7+", acao: { f: { parado: "mais7" } } },
  { id: "atraso", titulo: "Com atraso", acao: { rapido: "atraso" } },
];

/** O contexto depois de aplicar a ação: é com ele que o Quadro fica depois do clique. */
export const contextoDepois = (c: ContextoN, a: AcaoVistaN): ContextoN => ({ ...c, rapido: a.rapido ?? c.rapido, f: { ...c.f, ...a.f } });

/** A vista está ligada: o filtro rápido de atraso, ou todos os filtros dela com o valor dela. */
export const vistaAtiva = (c: ContextoN, a: AcaoVistaN): boolean =>
  a.rapido ? c.rapido === a.rapido : Object.entries(a.f ?? {}).every(([k, v]) => c.f[k as keyof FiltrosN] === v);

export function vistasNegocios(linhas: readonly LinhaN[], c: ContextoN): ItemVistaN[] {
  return DEFS.map((d) => ({ id: d.id, titulo: d.titulo, acao: d.acao, n: selecionarQuadro(linhas, contextoDepois(c, d.acao)).length, ativo: vistaAtiva(c, d.acao) }));
}
