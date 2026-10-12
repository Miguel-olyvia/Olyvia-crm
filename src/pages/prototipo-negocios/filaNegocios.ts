// A "Fila de trabalho" de Negócios V2, sem React: cada cartão é uma vista rápida que já existe (a fase, o tempo parado, o atraso) e o número que mostra é o do Quadro
// depois de a aplicar por cima dos filtros de agora, ou seja, o que o clique no cartão abre. Nada aqui muda o Estado.
import { selecionarQuadro, type AcaoN, type ContextoN, type LinhaN } from "./filtrosNegocios";
import type { ItemFila, TomFila } from "./CartaoFila";

/** O que o cartão aplica: os filtros do painel (AcaoN) ou o filtro rápido "Com atraso" (que vive no Estado). */
export interface AcaoFilaN extends AcaoN { rapido?: "atraso" }
export interface ItemFilaN extends ItemFila { acao: AcaoFilaN }

interface Def { id: string; titulo: string; desc: string; tom: TomFila; acao: AcaoFilaN }

const DEFS: readonly Def[] = [
  { id: "enviar", titulo: "Para enviar", desc: "Orçamentos ainda por enviar ao cliente.", tom: "info", acao: { f: { fase: "orcamento" } } },
  { id: "espera", titulo: "À espera do cliente", desc: "Propostas enviadas, à espera de resposta.", tom: "warn", acao: { f: { fase: "proposta" } } },
  { id: "assinar", titulo: "Por assinar", desc: "Contratos à espera de assinatura.", tom: "warn", acao: { f: { fase: "contrato" } } },
  { id: "financeiro", titulo: "Em Financeiro", desc: "Negócios ganhos, a faturar ou já faturados.", tom: "ok", acao: { f: { fase: "financeiro" } } },
  { id: "parados", titulo: "Parados há mais de 7 dias", desc: "Em Orçamento ou Proposta, sem avançar.", tom: "bad", acao: { f: { parado: "mais7" } } },
  { id: "atraso", titulo: "Com atraso", desc: "O próximo passo já devia ter acontecido.", tom: "bad", acao: { rapido: "atraso" } },
];

/** O contexto depois de aplicar a ação: é com ele que o Quadro fica depois do clique. */
export const contextoDepois = (c: ContextoN, a: AcaoFilaN): ContextoN => ({ ...c, rapido: a.rapido ?? c.rapido, f: { ...c.f, ...a.f } });

export function filaNegocios(linhas: readonly LinhaN[], c: ContextoN): ItemFilaN[] {
  return DEFS.map((d) => ({ id: d.id, n: selecionarQuadro(linhas, contextoDepois(c, d.acao)).length, titulo: d.titulo, desc: d.desc, tom: d.tom, acao: d.acao }));
}
