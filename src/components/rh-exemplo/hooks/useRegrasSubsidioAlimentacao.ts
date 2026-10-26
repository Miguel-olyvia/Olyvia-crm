/**
 * A regra do subsídio de alimentação da organização, delegando ao hook real
 * que lê/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useRegrasSubsidioAlimentacao as useRegrasSubsidioAlimentacaoReal } from "@/hooks/useRegrasSubsidioAlimentacao";

export type { RegraSubsidioAlimentacaoPatch } from "@/hooks/useRegrasSubsidioAlimentacao";

export function useRegrasSubsidioAlimentacao() {
  return useRegrasSubsidioAlimentacaoReal();
}
