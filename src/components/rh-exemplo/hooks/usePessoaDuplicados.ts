/**
 * Verificar duplicados de identificacao ao criar ou editar uma pessoa,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaDuplicados as useReal } from "@/hooks/usePessoaDuplicados";

export type {
  ForcaDuplicado,
  EstadoFicha,
  CandidatoDuplicado,
  ValoresParaVerificar,
} from "@/hooks/usePessoaDuplicados";

export function usePessoaDuplicados() {
  return useReal();
}
