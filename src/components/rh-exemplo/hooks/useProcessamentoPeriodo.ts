/**
 * O período de processamento salarial de um mês, delegando ao hook real que
 * lê/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useProcessamentoPeriodo as useProcessamentoPeriodoReal } from "@/hooks/useProcessamentoPeriodo";

export type { ProcessamentoPeriodo } from "@/hooks/useProcessamentoPeriodo";

export function useProcessamentoPeriodo(ano: number, mes: number) {
  return useProcessamentoPeriodoReal(ano, mes);
}
