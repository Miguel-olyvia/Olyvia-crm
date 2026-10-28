/**
 * Os oficios de obra da organizacao (`ops_skill`), para escolher os de um cargo
 * tecnico em Cargos (migration 20261231998000).
 *
 * Duas leituras que ja existem, pela ordem da mais leve: a tabela `ops_skill`
 * (a RLS so a mostra a quem tem `operations.view`; aos outros vem vazia, sem
 * erro) e, se vier vazia, os perfis do `cat_ler_catalogo` (`services.view`).
 * Sem nenhuma das duas permissoes, `semAcesso`: o ecra diz que nao pode
 * escolher oficios (a marca de tecnico grava-se na mesma).
 */
import { useQuery } from "@tanstack/react-query";
import { hrFrom, hrRpc } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";

export interface OficioObra {
  id: string;
  nome: string;
  ativo: boolean;
}

const porNome = (a: OficioObra, b: OficioObra) => a.nome.localeCompare(b.nome, "pt");

export function useOficiosObra(ativo = true) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["rh-oficios-obra", orgId],
    queryFn: async (): Promise<{ oficios: OficioObra[]; semAcesso: boolean }> => {
      if (!orgId) return { oficios: [], semAcesso: false };
      const { data: linhas, error } = await hrFrom("ops_skill").select("id, nome, ativo").eq("organization_id", orgId);
      if (!error && linhas?.length) return { oficios: (linhas as OficioObra[]).sort(porNome), semAcesso: false };
      const { data: cat, error: erroCat } = await hrRpc("cat_ler_catalogo", { p_org: orgId });
      if (erroCat) return { oficios: [], semAcesso: true };
      const perfis = ((cat as { perfis?: OficioObra[] } | null)?.perfis ?? []).map((p) => ({ id: p.id, nome: p.nome, ativo: p.ativo }));
      return { oficios: perfis.sort(porNome), semAcesso: false };
    },
    enabled: !!orgId && ativo,
    staleTime: 60_000,
  });
  return { oficios: data?.oficios ?? [], semAcesso: data?.semAcesso ?? false, isLoading };
}
