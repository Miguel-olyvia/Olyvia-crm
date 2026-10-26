/**
 * As retribuições em vigor que não batem com o salário do cargo, delegando ao
 * hook real que lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useCargosRetribuicoesDivergentes as useCargosRetribuicoesDivergentesReal } from "@/hooks/useCargosRetribuicoesDivergentes";

export type { CargoRetribuicaoDivergente } from "@/hooks/useCargosRetribuicoesDivergentes";

export function useCargosRetribuicoesDivergentes() {
  return useCargosRetribuicoesDivergentesReal();
}
