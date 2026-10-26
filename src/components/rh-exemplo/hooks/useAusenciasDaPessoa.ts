/**
 * As ausencias de uma pessoa, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useAusenciasDaPessoa as useAusenciasDaPessoaReal } from "@/hooks/useAusenciasDaPessoa";

export type { AusenciasDaPessoa } from "@/hooks/useAusenciasDaPessoa";

export function useAusenciasDaPessoa(pessoaId: string | undefined) {
  return useAusenciasDaPessoaReal(pessoaId);
}
