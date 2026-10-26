/**
 * Os cargos com mais do que um salário activo hoje, delegando ao hook real que
 * lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useCargosSalariosDivergentes as useCargosSalariosDivergentesReal } from "@/hooks/useCargosSalariosDivergentes";

export type { CargoSalarioDivergente } from "@/hooks/useCargosSalariosDivergentes";

export function useCargosSalariosDivergentes() {
  return useCargosSalariosDivergentesReal();
}
