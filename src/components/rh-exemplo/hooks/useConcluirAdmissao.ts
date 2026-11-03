/**
 * Concluir a admissão (`rpc_hr_admissao_concluir`), delegando ao hook real. É por este wrapper que o ecrã da ficha chega a ele
 * (semBase.test.ts só deixa rh-exemplo importar código real de RH a partir de hooks/).
 */
import { useConcluirAdmissao as useConcluirAdmissaoReal } from "@/hooks/hr/useConcluirAdmissao";

export function useConcluirAdmissao() {
  return useConcluirAdmissaoReal();
}
