// Wrapper: quantos utilizadores (distintos, com vínculo ativo) tem cada role, lido de anew_memberships. É o que decide se
// uma role "está em uso" (não se elimina) e o número que a lista de roles mostra.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { contarPorRole, mensagemDeErro } from "../rolesReais";
import { lerTodasAsPaginas } from "./lerPaginado";

const LOTE_ROLES = 10;

type LinhaVinculo = { role_id: string; user_id: string };

// Lê por páginas (o PostgREST corta nas 1000 linhas): uma contagem parcial deixaria eliminar uma role em uso. A ordem acaba
// no `id` (único) para as páginas não repetirem nem saltarem vínculos. Um erro em qualquer página sobe: nunca há contagem parcial.
export async function lerContagemPorRole(roleIds: string[]): Promise<Record<string, number>> {
  const linhas: LinhaVinculo[] = [];
  for (let i = 0; i < roleIds.length; i += LOTE_ROLES) {
    const lote = roleIds.slice(i, i + LOTE_ROLES);
    linhas.push(...await lerTodasAsPaginas<LinhaVinculo>((de, ate) => supabase
      .from("anew_memberships").select("role_id, user_id").eq("status", "active").in("role_id", lote)
      .order("role_id").order("user_id").order("id").range(de, ate)));
  }
  return contarPorRole(linhas, roleIds);
}

export interface ContagemPorRole {
  /** Por id de role. Enquanto carrega ou se falhar, vazio: quem usa deve olhar para `disponivel`. */
  contagem: Record<string, number>;
  /** A contagem é fiável (lida sem erro). Sem ela, a página não deixa eliminar roles. */
  disponivel: boolean;
  erro: string | null;
}

const SEM_CONTAGEM: Record<string, number> = {};

export function useContagemUtilizadoresPorRole(roleIds: string[]): ContagemPorRole {
  const consulta = useQuery({
    queryKey: ["perfis-contagem-por-role", roleIds],
    queryFn: () => lerContagemPorRole(roleIds),
    enabled: roleIds.length > 0,
  });
  return {
    contagem: consulta.data ?? SEM_CONTAGEM,
    disponivel: roleIds.length === 0 || consulta.data !== undefined,
    erro: consulta.error ? mensagemDeErro(consulta.error) : null,
  };
}
