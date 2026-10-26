/**
 * Os anexos de admissao de uma pessoa,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaAnexos as useReal } from "@/hooks/usePessoaAnexos";

export type { ResultadoAccaoAnexo, ErroLimiteAnexo } from "@/hooks/usePessoaAnexos";

export function usePessoaAnexos(pessoaId: string | undefined, organizationId: string | undefined) {
  return useReal(pessoaId, organizationId);
}
