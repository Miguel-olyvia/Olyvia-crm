/**
 * O historico de alteracoes ao contrato de uma pessoa,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaVinculoAlteracoes as useReal } from "@/hooks/usePessoaVinculoAlteracoes";

export type { AlteracaoDoVinculo } from "@/hooks/usePessoaVinculoAlteracoes";

export function usePessoaVinculoAlteracoes(pessoaId: string | undefined) {
  return useReal(pessoaId);
}
