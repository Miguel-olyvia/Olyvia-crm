/**
 * Os contratos da equipa do responsável directo e a indicação (continuar / não continuar / por decidir), delegando ao
 * hook real (`rpc_hr_contratos_do_responsavel` e `rpc_hr_contrato_indicar`). Mantém a interface do hook real.
 */
import { useContratosDoResponsavel as useContratosDoResponsavelReal } from "@/hooks/useContratosDoResponsavel";

export function useContratosDoResponsavel(organizationId: string | null | undefined, ativo: boolean) {
  return useContratosDoResponsavelReal(organizationId, ativo);
}
