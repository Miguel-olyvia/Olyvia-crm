/**
 * Relatorio de leitura: pessoas cuja versao de retribuicao em vigor hoje NAO
 * bate com o salario do cargo que tem hoje (`hr_cargos_retribuicoes_divergentes`,
 * fluxo 2). Deve dar ZERO -- o trigger de igualdade salarial garante-o; serve
 * para confirmar os dados. NUNCA escreve nada.
 *
 * Copia estrutural de `useCargosSalariosDivergentes.ts` (esse, de texto legado,
 * nao muda).
 */
import { useQuery } from "@tanstack/react-query";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import type { Periodicidade } from "@/types/hr";

export interface CargoRetribuicaoDivergente {
  pessoa_id: string;
  pessoa_nome: string;
  cargo_id: string;
  cargo_nome: string;
  retribuicao_id: string;
  valor_base: number;
  periodicidade: Periodicidade;
  valido_de: string;
  esperado_valor_base: number;
  esperado_periodicidade: Periodicidade;
}

export function useCargosRetribuicoesDivergentes() {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["hr-cargos-retribuicoes-divergentes", orgId],
    queryFn: async (): Promise<CargoRetribuicaoDivergente[]> => {
      if (!orgId) return [];
      const { data: linhas, error: erro } = await hrRpc("hr_cargos_retribuicoes_divergentes", {
        p_organization_id: orgId,
      });
      if (erro) {
        if (isPermissionError(erro)) return [];
        throw erro;
      }
      return (linhas ?? []) as CargoRetribuicaoDivergente[];
    },
    enabled: !!orgId,
  });

  return { divergencias: data ?? [], isLoading, error };
}
