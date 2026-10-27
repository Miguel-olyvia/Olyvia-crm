/**
 * Os ficheiros reais escolhidos no painel «Nova pessoa» (cartão de cidadão, fotografia, comprovativo de IBAN), delegando ao
 * hook real. Ficam em memória até a ficha existir e seguem depois, um a um, pela Edge Function `hr-anexo-rh`.
 */
import { useAnexosNovaPessoa as useAnexosNovaPessoaReal } from "@/hooks/useAnexosNovaPessoa";

export type { ResultadoAnexosNovaPessoa, FalhaAnexos } from "@/hooks/useAnexosNovaPessoa";

export function useAnexosNovaPessoa() {
  return useAnexosNovaPessoaReal();
}
