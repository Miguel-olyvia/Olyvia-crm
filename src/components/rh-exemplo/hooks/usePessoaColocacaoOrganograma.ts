/**
 * A colocacao de uma pessoa no organograma,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaColocacaoOrganograma as useReal } from "@/hooks/usePessoaColocacaoOrganograma";

export type { ResultadoColocacao } from "@/hooks/usePessoaColocacaoOrganograma";

export function usePessoaColocacaoOrganograma(pessoaId: string | undefined, organizationId: string | undefined) {
  return useReal(pessoaId, organizationId);
}
