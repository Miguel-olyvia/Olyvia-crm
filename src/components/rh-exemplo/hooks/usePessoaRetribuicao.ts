/**
 * As versoes de retribuicao de uma pessoa,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaRetribuicao as useReal } from "@/hooks/usePessoaRetribuicao";

export type { CorrigirVersaoRetribuicaoPatch } from "@/hooks/usePessoaRetribuicao";

export function usePessoaRetribuicao(pessoaId: string | undefined, organizationId: string | undefined) {
  return useReal(pessoaId, organizationId);
}
