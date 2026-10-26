/**
 * As regras de fim de contrato da organizacao, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useRegrasFimContrato as useRegrasFimContratoReal } from "@/hooks/useRegrasFimContrato";

export type { GuardarRegrasFimContrato } from "@/hooks/useRegrasFimContrato";

export function useRegrasFimContrato() {
  return useRegrasFimContratoReal();
}
