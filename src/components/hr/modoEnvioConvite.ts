/**
 * Quando o botao de topo "Enviar convite" da ficha serve.
 *
 * Com a V2 ha UM processo de admissao aberto por pessoa: a Edge Function
 * recusa um segundo convite (`processo_aberto`). So se oferece enviar quando
 * NAO ha processo aberto (nenhum convite, ou concluido, rejeitado, cancelado).
 * Com processo aberto, as accoes sao Prolongar e Cancelar, no cartao do
 * estado. Substituir o link de um processo aberto e a etapa E3.
 */
import type { ResumoConvite } from "@/hooks/useConviteAdmissaoResumo";
import { processoAberto } from "@/lib/hr/estadoAdmissao";

export function podeEnviarNovoConvite(resumo: Pick<ResumoConvite, "estado"> | null | undefined): boolean {
  return !resumo || !processoAberto(resumo.estado);
}
