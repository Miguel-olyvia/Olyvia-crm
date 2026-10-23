/** As regras de fim de contrato da organização de exemplo, em memória. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { definirGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import {
  REGRA_ORG_VAZIA,
  type AoAtingirLimite,
  type RegraFimContratoOrg,
  type UnidadeDuracao,
} from "@/components/rh-exemplo/lib/fimContrato";

export interface GuardarRegrasFimContrato {
  ativo: boolean;
  diasAviso: number;
  renovacaoAutomatica: boolean;
  maxRenovacoes: number;
  duracaoValor: number | null;
  duracaoUnidade: UnidadeDuracao | null;
  aoAtingirLimite: AoAtingirLimite;
}

export function useRegrasFimContrato() {
  const gravada = useGestao((g) => g.regrasFimContrato);
  const regra: RegraFimContratoOrg = useMemo(() => gravada ?? REGRA_ORG_VAZIA, [gravada]);

  const guardar = useCallback(async (valores: GuardarRegrasFimContrato): Promise<void> => {
    definirGestao((g) => ({
      ...g,
      regrasFimContrato: {
        ativo: valores.ativo,
        dias_aviso: valores.diasAviso,
        renovacao_automatica: valores.renovacaoAutomatica,
        max_renovacoes: valores.maxRenovacoes,
        duracao_renovacao_valor: valores.duracaoValor,
        duracao_renovacao_unidade: valores.duracaoUnidade,
        ao_atingir_limite: valores.aoAtingirLimite,
      },
    }));
  }, []);

  return {
    organizationId: ORGANIZACAO_EXEMPLO_ID,
    regra,
    temRegraGravada: gravada !== null,
    isLoading: false,
    error: null as unknown,
    isSaving: false,
    guardar,
  };
}
