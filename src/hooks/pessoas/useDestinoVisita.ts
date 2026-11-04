// O destino de uma visita: o código postal de 7 dígitos da morada da obra, geocodificado (a mesma API e a mesma cache da procura da morada).
// Sem código postal completo, ou sem coordenadas, o destino é null e o ecrã avisa; nunca se inventa um ponto. Uma falha de rede não é
// «sem localização»: dá `erro`, tenta-se mais uma vez e não se guarda (um sucesso vale 1 h; um erro volta a tentar-se ao fim de 30 s).
import { useQuery } from "@tanstack/react-query";
import { geocodificarCp7 } from "@/lib/addresses/procurarCodigoPostal";
import type { PontoDestino } from "./deslocacaoVisita";

const UMA_HORA_MS = 60 * 60_000;
const ERRO_VALE_MS = 30_000;

export interface DestinoDaVisita {
  /** As coordenadas do código postal; null sem código postal completo, sem coordenadas ou com erro. */
  destino: PontoDestino | null;
  /** A geocodificar. */
  aLer: boolean;
  /** Não foi possível ligar ao serviço de moradas (diferente de o código postal não ter localização). */
  erro: boolean;
}

export function useDestinoVisita(cp7: string | null): DestinoDaVisita {
  const q = useQuery({
    queryKey: ["destino-visita", cp7],
    enabled: cp7 !== null,
    staleTime: (query) => (query.state.status === "error" ? ERRO_VALE_MS : UMA_HORA_MS),
    retry: 1,
    retryDelay: 1000,
    queryFn: () => geocodificarCp7(cp7 as string),
  });
  if (cp7 === null) return { destino: null, aLer: false, erro: false };
  return { destino: q.data ?? null, aLer: q.isLoading, erro: q.isError };
}
