/**
 * A ficha de uma pessoa de RH, delegando ao hook real que le/escreve em Supabase.
 *
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem,
 * mas todos os dados vem da base real via src/hooks/usePessoa.ts.
 */
import { usePessoa as usePessoaReal } from "@/hooks/usePessoa";

export type { DefinirContaArgs } from "@/hooks/usePessoaConta";

export function usePessoa(pessoaId: string | undefined) {
  return usePessoaReal(pessoaId);
}
