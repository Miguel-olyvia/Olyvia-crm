// 30/10/2026 (20270101340000): quem tem um papel no Negócio pelo RH (ou é técnico de obra) entra no /negocios e no Hoje do /home, mesmo
// sem a permissão pessoas.view do perfil da Olyvia. A base aceita as ações pelo papel (neg_papeis_permissoes).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { papeisDoLido, type MeusPapeis } from "@/emylia/real/papeisReal";

// 09/11: devolve também a pessoa do RH ligada à conta e os papéis (o perfil «Ser técnico de obra» sem conta ligada não tem papel: o Hoje
// avisa que falta ligar a conta à ficha do RH).
export function useTemPapelNegocio({ habilitado = true }: { habilitado?: boolean } = {}): {
  loading: boolean; tem: boolean; pessoa: MeusPapeis["pessoa"]; papeis: MeusPapeis["papeis"];
} {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const q = useQuery({
    queryKey: ["neg_meus_papeis", org],
    enabled: habilitado && !!org,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("neg_meus_papeis" as never, { p_org: org } as never);
      if (error) return null;
      return papeisDoLido(data);
    },
  });
  const m = q.data ?? null;
  return {
    loading: habilitado && !!org && q.isLoading, tem: !!m && (m.todos || m.papeis.length > 0),
    pessoa: m?.pessoa ?? null, papeis: m?.papeis ?? [],
  };
}
