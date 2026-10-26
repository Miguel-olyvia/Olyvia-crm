/** Os papeis de acesso, delegando ao hook real que le de Supabase. */
import { usePapeisDaOrganizacao as useReal } from "@/hooks/usePapeisDaOrganizacao";

export type { PapelDaOrganizacao } from "@/hooks/usePapeisDaOrganizacao";

export function usePapeisDaOrganizacao() {
  return useReal();
}
