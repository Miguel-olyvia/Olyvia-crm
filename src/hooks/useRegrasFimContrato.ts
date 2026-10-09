/**
 * As regras de fim de contrato DA EMPRESA activa (`hr_regras_fim_contrato`,
 * 20261210320000): os defaults, uma linha por organizacao. Sem linha, ou com
 * `ativo = false`, a funcionalidade esta desligada e nada acontece sozinho.
 *
 * Le a tabela (SELECT com `hr.pessoas.vinculos.view`); escreve SO pela RPC
 * `rpc_hr_regras_fim_contrato_guardar` (`hr.contratos.regras.gerir`), nunca por
 * upsert directo -- a tabela recusa INSERT/UPDATE a `authenticated`. Um erro da
 * RPC chega ao ecra com o `code` (HRV05, HRV13...) para ser traduzido por
 * `mensagemDeErroFimContrato`.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { REGRA_ORG_VAZIA, type RegraFimContratoOrg, type UnidadeDuracao } from "@/lib/hr/fimContrato";
import type { AoAtingirLimite } from "@/lib/hr/fimContrato";

const COLUNAS =
  "id, organization_id, ativo, dias_aviso, renovacao_automatica, max_renovacoes, " +
  "duracao_renovacao_valor, duracao_renovacao_unidade, ao_atingir_limite";

/** Os argumentos de `rpc_hr_regras_fim_contrato_guardar`, sem a organizacao (vem da empresa activa). */
export interface GuardarRegrasFimContrato {
  ativo: boolean;
  diasAviso: number;
  renovacaoAutomatica: boolean;
  maxRenovacoes: number;
  /** Os dois a `null` = a renovacao dura o mesmo que o contrato inicial. */
  duracaoValor: number | null;
  duracaoUnidade: UnidadeDuracao | null;
  aoAtingirLimite: AoAtingirLimite;
}

export function useRegrasFimContrato() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const queryKey = ["hr-regras-fim-contrato", orgId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<RegraFimContratoOrg | null> => {
      if (!orgId) return null;
      const { data: linha, error: erro } = await hrFrom("hr_regras_fim_contrato")
        .select(COLUNAS)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (erro) {
        if (isPermissionError(erro)) return null;
        throw erro;
      }
      return (linha ?? null) as RegraFimContratoOrg | null;
    },
    enabled: !!orgId,
  });

  /** Sem linha mostra-se `REGRA_ORG_VAZIA` (desligado, nao gravado) ate alguem guardar. */
  const regra: RegraFimContratoOrg = useMemo(() => data ?? REGRA_ORG_VAZIA, [data]);

  const guardarMutation = useMutation({
    mutationFn: async (valores: GuardarRegrasFimContrato) => {
      if (!orgId) throw new Error("Sem organizacao activa");
      const { error: erro } = await hrRpc("rpc_hr_regras_fim_contrato_guardar", {
        p_organization_id: orgId,
        p_ativo: valores.ativo,
        p_dias_aviso: valores.diasAviso,
        p_renovacao_automatica: valores.renovacaoAutomatica,
        p_max_renovacoes: valores.maxRenovacoes,
        p_duracao_valor: valores.duracaoValor,
        p_duracao_unidade: valores.duracaoUnidade,
        p_ao_atingir_limite: valores.aoAtingirLimite,
      });
      if (erro) throw erro;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    organizationId: orgId,
    regra,
    temRegraGravada: !!data,
    isLoading,
    error,
    isSaving: guardarMutation.isPending,
    guardar: guardarMutation.mutateAsync,
  };
}
