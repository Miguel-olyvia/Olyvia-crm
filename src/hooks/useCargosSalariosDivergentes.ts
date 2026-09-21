/**
 * Relatorio de leitura: cargos (texto legado, sem `cargo_id` ainda) com mais
 * do que um salario activo hoje (`hr_cargos_salarios_divergentes`,
 * 20261202070000). NUNCA escreve nada -- so aponta o que o RH tem de decidir
 * caso a caso antes/ao adoptar o catalogo de cargos.
 */
import { useQuery } from "@tanstack/react-query";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";

export interface CargoSalarioDivergente {
  cargo: string;
  pessoa_id: string;
  pessoa_nome: string;
  valor_base: number;
  periodicidade: string;
}

export function useCargosSalariosDivergentes() {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["hr-cargos-salarios-divergentes", orgId],
    queryFn: async (): Promise<CargoSalarioDivergente[]> => {
      if (!orgId) return [];
      const { data: linhas, error: erro } = await hrRpc("hr_cargos_salarios_divergentes", {
        p_organization_id: orgId,
      });
      if (erro) {
        if (isPermissionError(erro)) return [];
        throw erro;
      }
      return (linhas ?? []) as CargoSalarioDivergente[];
    },
    enabled: !!orgId,
  });

  return { divergencias: data ?? [], isLoading, error };
}
