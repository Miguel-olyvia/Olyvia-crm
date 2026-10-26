/**
 * A ficha de RH ligada a conta de quem esta a usar a aplicacao,
 * delegando ao hook real que le de Supabase.
 */
import { useMinhaPessoa as useMinhaPessoaReal, type MinhaPessoa } from "@/hooks/useMinhaPessoa";

export type { MinhaPessoa };

export function useMinhaPessoa(): MinhaPessoa {
  return useMinhaPessoaReal();
}
