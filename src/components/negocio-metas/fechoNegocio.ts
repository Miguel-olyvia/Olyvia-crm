// O tipo de fecho de um negócio da base (`negocios.fecho`): «proposta» (venda directa: a proposta aceite decide o negócio e os contratos são
// ignorados) ou «contrato» (o contrato assinado decide). A omissão da base é «contrato». O exemplo (sem base) não tem tipo.
import type { NegocioMes } from "./negocioMetas";

export type FechoNegocio = "proposta" | "contrato";

/** Os tipos que a base aceita, pela ordem em que o formulário os oferece (a omissão primeiro). */
export const FECHOS_NEGOCIO: readonly FechoNegocio[] = ["contrato", "proposta"];

/** O que a base assume quando `neg_criar_negocio` não recebe `p_fecho`. */
export const FECHO_POR_OMISSAO: FechoNegocio = "contrato";

export const ehFecho = (valor: unknown): valor is FechoNegocio => valor === "proposta" || valor === "contrato";

/** O tipo lido da base, ou `null` se o valor não se reconhece (nunca se inventa «contrato»). */
export const fechoDe = (valor: unknown): FechoNegocio | null => (ehFecho(valor) ? valor : null);

/**
 * Num negócio de fecho «proposta» os contratos são ignorados (a base também os ignora): o ecrã trata-o como se não tivesse contrato.
 * Devolve o próprio negócio se não for esse o caso, para não criar objetos novos sem necessidade.
 */
export function semContratosSeProposta<T extends NegocioMes>(negocio: T): T {
  return negocio.fecho === "proposta" && negocio.contrato !== null ? { ...negocio, contrato: null } : negocio;
}
