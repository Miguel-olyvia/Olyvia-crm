// Os documentos de um negócio que o processo precisa de encontrar na ficha: o orçamento a partir do qual se cria a proposta, a proposta que
// se envia ou a que foi aceite (de onde nasce o contrato) e o contrato que se assina. Funções puras; valores em falta nunca rebentam.
import { maisRecentePrimeiro } from "./adaptarComum";
import { estadoContratoDeDb, estadoPropostaDeDb } from "./adaptarNegociosFicha";
import type { ContratoDb, NegocioFichaDb, OrcamentoDb, PropostaDb } from "./fichaTipos";
import { propostaViva } from "./propostaViva";

const ORCAMENTO_ACEITE = ["aceite", "aceito", "accepted", "approved"];
const RECUSADO = ["rejeitado", "rejeitada", "recusado", "recusada", "rejected", "declined", "lost"];

const normal = (valor: string | null): string => (valor ?? "").trim().toLowerCase();

/** O orçamento de que a proposta parte: o aceite; senão o mais recente que não foi recusado (um rascunho serve: a proposta carrega-o por id); senão o mais recente. */
export function orcamentoParaProposta(n: NegocioFichaDb): string | null {
  const recentes: OrcamentoDb[] = maisRecentePrimeiro(n.orcamentos ?? [], (o) => o.criado_em);
  const escolhido = recentes.find((o) => ORCAMENTO_ACEITE.includes(normal(o.estado))) ?? recentes.find((o) => !RECUSADO.includes(normal(o.estado))) ?? recentes[0];
  return escolhido?.id ?? null;
}

// A regra da proposta viva vive em `propostaViva.ts` (uma só para o cartão, o detalhe, o ganho e o processo).
export { propostaViva };

/** A proposta aceite mais recente (de onde se cria o contrato); `null` se nenhuma foi aceite. */
export function propostaAceite(n: NegocioFichaDb): PropostaDb | null {
  return maisRecentePrimeiro(n.propostas ?? [], (p) => p.criado_em).find((p) => estadoPropostaDeDb(p) === "aceite") ?? null;
}

/** O contrato que conta: o mais recente que não está cancelado. */
export function contratoVivo(n: NegocioFichaDb): ContratoDb | null {
  const vivos = (n.contratos ?? []).filter((c) => estadoContratoDeDb(c) !== null);
  return maisRecentePrimeiro(vivos, (c) => c.criado_em)[0] ?? null;
}
