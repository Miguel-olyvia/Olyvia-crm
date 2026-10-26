/**
 * As filiais do organograma disponíveis para escolha, delegando ao hook real
 * que lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useFiliaisDaArvore as useFiliaisDaArvoreReal } from "@/hooks/useFiliaisDaArvore";

export type { FilialOpcao } from "@/hooks/useFiliaisDaArvore";

export function useFiliaisDaArvore() {
  return useFiliaisDaArvoreReal();
}
