/**
 * Os países disponíveis, delegando ao hook real que lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useCountries as useCountriesReal } from "@/hooks/useCountries";

export type { Country } from "@/hooks/useCountries";

export function useCountries(onlyActive: boolean = true) {
  return useCountriesReal(onlyActive);
}
