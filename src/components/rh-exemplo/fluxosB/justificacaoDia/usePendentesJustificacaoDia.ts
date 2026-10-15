import { useJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export const porDecidir = (j: JustificacaoDia): boolean => j.estado === "pendente";

/** Quantas justificações de dia esperam decisão (para o contador do separador da fila). */
export function usePendentesJustificacaoDia(): number {
  return useJustificacaoDia((e) => e.justificacoes.filter(porDecidir).length);
}
