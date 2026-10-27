/**
 * As contas de CRM que se podem ligar a uma ficha nova, delegando ao hook real.
 */
import { useContasLigaveis as useContasLigaveisReal } from "@/hooks/useContasLigaveis";

export type { ContaLigavel } from "@/hooks/useContasLigaveis";

export function useContasLigaveis() {
  return useContasLigaveisReal();
}
