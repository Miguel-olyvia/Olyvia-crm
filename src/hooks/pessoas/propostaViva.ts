// A regra única de qual é a proposta de um negócio, para todos os sítios (o estado do cartão, o detalhe, o botão de ganhar e o processo).
// Vive à parte para o adaptador de negócios e o dos documentos a poderem importar sem se importarem um ao outro.
import { maisRecentePrimeiro } from "./adaptarComum";
import type { NegocioFichaDb, PropostaDb } from "./fichaTipos";

const RECUSADA = ["rejeitado", "rejeitada", "recusado", "recusada", "rejected", "declined", "lost"];

const normal = (valor: string | null): string => (valor ?? "").trim().toLowerCase();

/** Uma proposta que o cliente recusou: já não conta como proposta em curso. */
export const propostaRecusada = (p: PropostaDb): boolean => RECUSADA.includes(normal(p.status));

/** A proposta que conta: a mais recente que não foi recusada; se só há recusadas, a mais recente delas. */
export function propostaViva(n: NegocioFichaDb): PropostaDb | null {
  const recentes = maisRecentePrimeiro(n.propostas ?? [], (p) => p.criado_em);
  return recentes.find((p) => !propostaRecusada(p)) ?? recentes[0] ?? null;
}
