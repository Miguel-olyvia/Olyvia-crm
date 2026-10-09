/**
 * A lista "Contratos a terminar" do RH: os contratos com prazo da organizacao
 * cuja data de fim vem ai (ou ja passou), com a regra que se aplica a cada um e
 * o que vai acontecer. Le `rpc_hr_contratos_a_terminar(p_organization_id,
 * p_dias)`, que exige `hr.pessoas.vinculos.view`; `dias = null` usa o horizonte
 * que a base entende por omissao. O ecra nao calcula nada: `dias_restantes`
 * (negativo se ja passou) e `o_que_acontece` vem da base.
 */
import { useQuery } from "@tanstack/react-query";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type { ContratoATerminar } from "@/lib/hr/fimContrato";

export function useContratosATerminar(organizationId: string | undefined, dias: number | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["hr-contratos-a-terminar", organizationId, dias],
    queryFn: async (): Promise<ContratoATerminar[]> => {
      if (!organizationId) return [];
      const { data: linhas, error: erro } = await hrRpc("rpc_hr_contratos_a_terminar", {
        p_organization_id: organizationId,
        p_dias: dias,
      });
      if (erro) {
        // Sem permissao = nada para mostrar; o resto e defeito e sobe ao ecra.
        if (isPermissionError(erro) || erro.code === "HRV05") return [];
        captureFlowError(erro, "hr-contrato-fim-load");
        throw erro;
      }
      return (linhas ?? []) as ContratoATerminar[];
    },
    enabled: !!organizationId,
  });

  return { contratos: data ?? [], isLoading, error, recarregar: refetch };
}
