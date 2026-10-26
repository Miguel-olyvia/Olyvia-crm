/**
 * As afectacoes de uma pessoa a centros de trabalho,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaAfectacoes as useReal } from "@/hooks/usePessoaAfectacoes";

export type { ResultadoFecho } from "@/hooks/usePessoaAfectacoes";

export function usePessoaAfectacoes(pessoaId: string | undefined, organizationId: string | undefined) {
  return useReal(pessoaId, organizationId);
}
