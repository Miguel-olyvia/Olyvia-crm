/**
 * A regra de elegibilidade do subsidio de alimentacao da organizacao activa
 * (`hr_regras_subsidio_alimentacao`, 20261201200000) -- uma linha por
 * organizacao, upsert por `organization_id`. Segue o padrao de
 * `useConfiguracaoObrigatoriosAdmissao.ts` / `useDocumentSettings.ts`.
 *
 * A DISTINCAO QUE ESTE HOOK NAO APAGA
 * ---------------------------------------
 * Isto e a REGRA POR OMISSAO da empresa (`valor_diario`, `modo`,
 * `minutos_minimos_dia`). Nao e o mesmo sitio que `subsidio_alimentacao` em
 * `pessoas_retribuicoes` (via `usePessoaRetribuicao`), que continua a ser a
 * EXCEPCAO negociada por pessoa. Este hook nunca le nem escreve
 * `pessoas_retribuicoes`.
 *
 * SO CONFIGURACAO -- SEM CALCULO NENHUM
 * -----------------------------------------
 * Nenhuma ligacao a assiduidade ou a faltas ainda. Fica para depois.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import type { HrRegraSubsidioAlimentacao, SubsidioAlimentacaoModo } from "@/types/hr";

const COLUNAS =
  "id, organization_id, valor_diario, modo, minutos_minimos_dia, created_at, updated_at";

export interface RegraSubsidioAlimentacaoPatch {
  valorDiario: number;
  modo: SubsidioAlimentacaoModo;
  minutosMinimosDia: number;
}

const REGRA_OMISSAO: RegraSubsidioAlimentacaoPatch = {
  valorDiario: 0,
  modo: "dinheiro",
  minutosMinimosDia: 1,
};

export function useRegrasSubsidioAlimentacao() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-regra-subsidio-alimentacao", orgId];

  const { data, isLoading, error, isFetched } = useQuery({
    queryKey,
    queryFn: async (): Promise<HrRegraSubsidioAlimentacao | null> => {
      if (!orgId) return null;
      const { data: linha, error: erro } = await hrFrom("hr_regras_subsidio_alimentacao")
        .select(COLUNAS)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (erro) {
        if (isPermissionError(erro)) return null;
        throw erro;
      }
      return (linha ?? null) as HrRegraSubsidioAlimentacao | null;
    },
    enabled: !!orgId,
  });

  /** Sem linha ainda, mostra-se a omissao (nao gravada) -- so grava quando o
   *  utilizador submeter o formulario. */
  const regra: RegraSubsidioAlimentacaoPatch = useMemo(
    () =>
      data
        ? { valorDiario: data.valor_diario, modo: data.modo, minutosMinimosDia: data.minutos_minimos_dia }
        : REGRA_OMISSAO,
    [data],
  );

  const gravarMutation = useMutation({
    mutationFn: async (patch: RegraSubsidioAlimentacaoPatch) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const businessUserId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_regras_subsidio_alimentacao").upsert(
        {
          organization_id: orgId,
          valor_diario: patch.valorDiario,
          modo: patch.modo,
          minutos_minimos_dia: patch.minutosMinimosDia,
          created_by: businessUserId,
          updated_by: businessUserId,
        },
        { onConflict: "organization_id" },
      );
      if (erro) throw erro;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    regra,
    temRegraGravada: !!data,
    isLoading,
    isFetched,
    error,
    isSaving: gravarMutation.isPending,
    gravar: gravarMutation.mutateAsync,
  };
}
