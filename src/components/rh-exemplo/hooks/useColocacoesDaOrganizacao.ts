/**
 * A colocacao em vigor de todas as pessoas da organizacao activa no organograma, delegando ao hook
 * real que le e escreve `pessoas_colocacao_organograma`.
 */
import { useColocacoesDaOrganizacao as useReal } from "@/hooks/useColocacoesDaOrganizacao";

export type { GuardarColocacaoArgs, ResultadoColocacaoOrg } from "@/hooks/useColocacoesDaOrganizacao";

export function useColocacoesDaOrganizacao() {
  return useReal();
}
