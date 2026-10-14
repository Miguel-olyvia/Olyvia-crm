/** A regra do subsídio de alimentação da organização de exemplo (minutos mínimos por dia), em memória. */
import { useCallback, useMemo } from "react";
import { definirGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";

export interface RegraSubsidioAlimentacaoPatch {
  minutosMinimosDia: number;
}

/** Sem regra gravada, qualquer minuto trabalhado dá direito ao subsídio. */
const REGRA_OMISSAO: RegraSubsidioAlimentacaoPatch = { minutosMinimosDia: 1 };

export function useRegrasSubsidioAlimentacao() {
  const minutos = useGestao((g) => g.minutosMinimosSubsidio);

  const regra: RegraSubsidioAlimentacaoPatch = useMemo(
    () => (minutos === null ? REGRA_OMISSAO : { minutosMinimosDia: minutos }),
    [minutos],
  );

  const gravar = useCallback(async (patch: RegraSubsidioAlimentacaoPatch): Promise<void> => {
    definirGestao((g) => ({ ...g, minutosMinimosSubsidio: patch.minutosMinimosDia }));
  }, []);

  return {
    regra,
    temRegraGravada: minutos !== null,
    isLoading: false,
    isFetched: true,
    error: null as unknown,
    isSaving: false,
    gravar,
  };
}
