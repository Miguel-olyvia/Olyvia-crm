/**
 * As versoes de horas contratadas de uma pessoa,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaVinculoHoras as useReal } from "@/hooks/usePessoaVinculoHoras";

export type { CorrigirVersaoHorasPatch } from "@/hooks/usePessoaVinculoHoras";

export function usePessoaVinculoHoras(pessoaId: string | undefined, organizationId: string | undefined) {
  return useReal(pessoaId, organizationId);
}
