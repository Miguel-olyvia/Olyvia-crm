/**
 * Os tipos de ausencia, delegando ao hook real que le de Supabase.
 */
import { useAusenciasTipos as useAusenciasTiposReal } from "@/hooks/useAusenciasTipos";

export function useAusenciasTipos() {
  return useAusenciasTiposReal();
}
