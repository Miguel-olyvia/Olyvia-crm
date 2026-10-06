import type { OrcamentoAceite } from "./dados";

/**
 * "Tem de estar assinado e contratualizado, obrigatoriamente."
 *
 * Um orçamento aceite só vira obra quando há um contrato do CRM, assinado,
 * que o cobre. A base garante-o (db/orcamentos.sql, trigger
 * ops_ordem_exigir_contrato); aqui só se explica ao utilizador porquê.
 */

/** Os estados de `client_contracts.status`, em português. */
const ESTADOS_CONTRATO: Record<string, string> = {
  draft: "em rascunho",
  rascunho: "em rascunho",
  pending_signature: "à espera de assinatura",
  sent: "enviado, por assinar",
  signed: "assinado",
  assinado: "assinado",
  active: "assinado e em vigor",
  cancelled: "cancelado",
  expired: "expirado",
  terminated: "terminado",
  rejected: "recusado",
};

export function estadoDoContrato(estado: string | null | undefined): string {
  if (!estado) return "sem estado";
  return ESTADOS_CONTRATO[estado] ?? estado;
}

/**
 * Porque é que este orçamento ainda não pode virar obra — ou `null` se pode.
 * A mesma ordem de razões que a base usa.
 */
export function motivoBloqueio(
  o: Pick<OrcamentoAceite, "tem_obra" | "cliente_id" | "contratado" | "contrato_numero" | "contrato_estado" | "contrato_id">
): string | null {
  if (o.tem_obra) return "Já tem obra aberta.";
  if (!o.contratado) {
    if (!o.contrato_id) {
      return "Sem contrato no CRM. Só se põe a andar um orçamento assinado e contratualizado — cria e faz assinar o contrato no CRM.";
    }
    const n = o.contrato_numero ? `O contrato ${o.contrato_numero}` : "O contrato";
    return `${n} está ${estadoDoContrato(o.contrato_estado)}. Só se põe a andar depois de assinado no CRM.`;
  }
  if (!o.cliente_id) return "Sem cliente no orçamento. Sem cliente não há obra a quem entregar.";
  return null;
}
