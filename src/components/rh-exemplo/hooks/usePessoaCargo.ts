/**
 * O historico de cargos de uma pessoa e a mudanca de cargo,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaCargo as useReal } from "@/hooks/usePessoaCargo";

export type { ResultadoMudarCargo } from "@/hooks/usePessoaCargo";
export type { SaidaMudarCargo } from "@/hooks/usePessoaCargo";

export function usePessoaCargo(pessoaId: string | undefined, _organizationId: string | undefined) {
  return useReal(pessoaId, _organizationId);
}
