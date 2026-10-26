/**
 * Criar o acesso de uma pessoa, delegando ao hook real que comunica com
 * Supabase via Edge Function.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useCriarAcessoPessoa as useCriarAcessoPessoaReal } from "@/hooks/useCriarAcessoPessoa";

export type { ResultadoCriarAcesso } from "@/hooks/useCriarAcessoPessoa";

export function useCriarAcessoPessoa() {
  return useCriarAcessoPessoaReal();
}
