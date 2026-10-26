/**
 * A lista de contratos a terminar, delegando ao hook real que le de Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useContratosATerminar as useContratosATerminarReal } from "@/hooks/useContratosATerminar";

export function useContratosATerminar(organizationId: string | undefined, dias: number | null) {
  return useContratosATerminarReal(organizationId, dias);
}
