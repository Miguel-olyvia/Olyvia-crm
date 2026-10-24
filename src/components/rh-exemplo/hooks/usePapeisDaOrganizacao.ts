/** Os papéis de acesso de exemplo. */
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";

export interface PapelDaOrganizacao {
  id: string;
  name: string;
  code: string | null;
}

export function usePapeisDaOrganizacao() {
  const papeis = useEstadoRh((e) => e.papeis);
  return { papeis, loading: false, semPermissao: false, refresh: async () => undefined };
}
