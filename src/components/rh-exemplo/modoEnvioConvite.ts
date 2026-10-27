/**
 * Quando o botao de topo "Enviar convite" da ficha serve.
 *
 * Com a V2 ha UM processo de admissao aberto por pessoa: a Edge Function
 * recusa um segundo convite (`processo_aberto`). So se oferece enviar quando
 * NAO ha processo aberto (nenhum convite, ou concluido, rejeitado, cancelado).
 * Com processo aberto, as accoes sao Reenviar, Prolongar e Cancelar, no cartao
 * do estado do convite.
 */
import { processoAberto } from "@/components/rh-exemplo/hooks/estadoAdmissaoReal";
import type { ResumoConvite } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";

export function podeEnviarNovoConvite(resumo: Pick<ResumoConvite, "estado"> | null | undefined): boolean {
  return !resumo || !processoAberto(resumo.estado);
}
