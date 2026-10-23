// Os parâmetros de neg_encerrar_abordagem. Vivem à parte para a chamada (useAcoesFichaReal) e o resultado da visita (useAcoesVisita) os partilharem
// sem se importarem um ao outro.
import type { PedidoEncerrar } from "@/components/pessoas/acoesEncerrar";
import { textoOuNull } from "./adaptarComum";

export function paramsEncerrar(org: string, pessoaId: string, leadId: string | null, p: PedidoEncerrar): Record<string, unknown> {
  return {
    p_organization_id: org,
    p_entity_id: pessoaId,
    p_resultado: p.resultado,
    p_motivo: p.motivo ?? null,
    p_motivo_outro: p.motivo === "outro" ? textoOuNull(p.motivoOutro) : null,
    p_lead_id: leadId,
  };
}
