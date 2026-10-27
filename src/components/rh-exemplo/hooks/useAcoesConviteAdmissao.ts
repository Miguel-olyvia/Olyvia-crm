/**
 * As ações sobre um convite de admissão que já existe (reenviar, prolongar, cancelar), delegando ao hook real
 * (Edge Function `convite-admissao` e as RPCs `rpc_hr_convite_admissao_reenviar/prolongar/cancelar`).
 */
import { useAcoesConviteAdmissao as useAcoesConviteAdmissaoReal } from "@/hooks/useAcoesConviteAdmissao";

export type { ResultadoAccaoConvite } from "@/hooks/useAcoesConviteAdmissao";

export function useAcoesConviteAdmissao() {
  return useAcoesConviteAdmissaoReal();
}
